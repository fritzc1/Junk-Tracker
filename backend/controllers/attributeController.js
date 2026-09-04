const mongoose = require('mongoose');
const Attribute = require('../models/Attribute');
const Item = require('../models/Item');

// Stage 4 of plans/container-tree-and-attributes-plan.md: the attribute system.
// Dimensions are per-database (scoped via req.databaseId from the
// X-Database-Id header, like tags). Items store one value per dimension in a
// sparse `attributes` map keyed by the dimension's name — so renaming a
// dimension must rewrite item keys, and deleting a dimension or one of its
// values is blocked while any item still uses it (counts are returned so a UI
// can explain why).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fetch a dimension scoped to the active database; null when absent.
const findDimension = async (id, databaseId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Attribute.findOne({ _id: id, databaseId }).lean();
};

// Case-insensitive duplicate-name check within this database (mirrors the tag
// controller's convention). `excludeId` is passed on renames.
const findNameCollision = async (databaseId, name, excludeId) => {
  return Attribute.findOne({
    databaseId,
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    _id: { $ne: excludeId || null }
  }).lean();
};

// Usage of one dimension across the active database's items: how many items
// carry the key at all, plus a per-value breakdown. One aggregation pass over
// the sparse map (items without the key simply do not match).
const computeUsage = async (databaseId, name) => {
  const rows = await Item.aggregate([
    { $match: { databaseId: new mongoose.Types.ObjectId(databaseId), [`attributes.${name}`]: { $exists: true } } },
    { $group: { _id: `$attributes.${name}`, count: { $sum: 1 } } }
  ]);
  const valueCounts = {};
  let itemCount = 0;
  for (const row of rows) {
    valueCounts[String(row._id)] = row.count;
    itemCount += row.count;
  }
  return { itemCount, valueCounts };
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// @desc    List all dimensions with usage counts (items per dimension + per-value breakdown)
// @route   GET /api/attributes
// @access  Public
const getAttributes = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const dimensions = await Attribute.find({ databaseId }).sort({ name: 1 });

    // Per-dimension usage in one grouped query each (cheap at personal scale).
    const usageByDim = new Map(); // name -> { itemCount, valueCounts }
    for (const dim of dimensions) {
      const usage = await computeUsage(databaseId, dim.name);
      usageByDim.set(dim.name, usage);
    }

    const data = dimensions.map(d => ({
      _id: d._id,
      name: d.name,
      values: d.values || [],
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      itemCount: usageByDim.get(d.name).itemCount,
      valueCounts: usageByDim.get(d.name).valueCounts
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('[Attribute] Error listing attributes:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create a dimension with an optional initial value list
// @route   POST /api/attributes
// @access  Public
const createAttribute = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Attribute dimension name is required' });
    }
    const trimmedName = String(name).trim();

    // Dotted names would break item.attributes.<name> queries; reject early.
    if (trimmedName.includes('.') || trimmedName.startsWith('$')) {
      return res.status(400).json({ success: false, error: 'Attribute dimension name cannot contain "." or start with "$"' });
    }

    const existing = await findNameCollision(databaseId, trimmedName);
    if (existing) {
      return res.status(400).json({ success: false, error: `An attribute dimension named "${existing.name}" already exists` });
    }

    let values = [];
    if (req.body.values !== undefined && req.body.values !== null) {
      if (!Array.isArray(req.body.values)) {
        return res.status(400).json({ success: false, error: 'values must be an array of strings' });
      }
      const seen = new Set();
      for (const v of req.body.values) {
        const s = String(v).trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        values.push(s);
      }
    }

    const dimension = await Attribute.create({ databaseId, name: trimmedName, values });
    res.status(201).json({ success: true, data: dimension });
  } catch (error) {
    console.error('[Attribute] Error creating attribute:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'An attribute dimension with this name already exists' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Rename a dimension (rewrites the key on all affected items) and/or
//          replace its value list. Renaming is blocked when it would collide
//          with an existing dimension name in this database.
// @route   PUT /api/attributes/:id
// @access  Public
const updateAttribute = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const dimension = await findDimension(req.params.id, databaseId);

    if (!dimension) {
      return res.status(404).json({ success: false, error: 'Attribute dimension not found' });
    }

    // --- Rename (with item-key rewrite) -------------------------------------
    let newName = dimension.name;
    if (req.body.name !== undefined && req.body.name !== null) {
      const trimmedName = String(req.body.name).trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, error: 'Attribute dimension name cannot be empty' });
      }
      if (trimmedName.includes('.') || trimmedName.startsWith('$')) {
        return res.status(400).json({ success: false, error: 'Attribute dimension name cannot contain "." or start with "$"' });
      }
      const collision = await findNameCollision(databaseId, trimmedName, dimension._id);
      if (collision) {
        return res.status(400).json({ success: false, error: `An attribute dimension named "${collision.name}" already exists` });
      }
      newName = trimmedName;
    }

    // --- Value list replacement ----------------------------------------------
    let newValues = dimension.values || [];
    if (req.body.values !== undefined && req.body.values !== null) {
      if (!Array.isArray(req.body.values)) {
        return res.status(400).json({ success: false, error: 'values must be an array of strings' });
      }
      const seen = new Set();
      for (const v of req.body.values) {
        const s = String(v).trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        newValues.push(s);
      }
    }

    // --- Apply rename: rewrite the key on every item that uses it ------------
    let itemsRewritten = 0;
    if (newName !== dimension.name) {
      const oldName = dimension.name;
      const usage = await computeUsage(databaseId, oldName);
      if (usage.itemCount > 0) {
        // Single bulk pass over the affected items: copy attributes.<old> to
        // attributes.<new>, then drop the stale key. An aggregation-pipeline
        // update is required because a plain $set cannot reference another
        // field's value ("$attributes.old" would be stored literally).
        const filter = { databaseId, [`attributes.${oldName}`]: { $exists: true } };
        await Item.updateMany(filter, [
          { $set: { [`attributes.${newName}`]: `$attributes.${oldName}` } },
          { $unset: [`attributes.${oldName}`] }
        ]);
        itemsRewritten = usage.itemCount;
      }
    }

    const doc = await Attribute.findById(dimension._id);
    doc.name = newName;
    if (req.body.values !== undefined && req.body.values !== null) {
      doc.values = newValues; // pre-save hook trims/dedupes/empties
    }
    const saved = await doc.save();

    console.log(`[Attribute] Updated dimension "${dimension.name}" -> "${saved.name}" (${itemsRewritten} item(s) rewritten)`);
    res.status(200).json({ success: true, data: { ...saved.toObject(), itemsRewritten } });
  } catch (error) {
    console.error('[Attribute] Error updating attribute:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'An attribute dimension with this name already exists' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Add one or more values to a dimension's vocabulary
// @route   POST /api/attributes/:id/values
// @access  Public
const addValues = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const doc = await Attribute.findOne({ _id: req.params.id, databaseId });

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Attribute dimension not found' });
    }

    let values = [];
    if (Array.isArray(req.body.values)) {
      values = req.body.values;
    } else if (typeof req.body.value === 'string') {
      values = [req.body.value];
    } else {
      return res.status(400).json({ success: false, error: 'Provide "value" (a string) or "values" (an array of strings)' });
    }

    const current = new Set(doc.values || []);
    const added = [];
    for (const v of values) {
      const s = String(v).trim();
      if (!s || current.has(s)) continue;
      current.add(s);
      added.push(s);
    }

    doc.values = [...current];
    const saved = await doc.save(); // pre-save hook trims/dedupes/empties
    res.status(200).json({ success: true, data: { ...saved.toObject(), added } });
  } catch (error) {
    console.error('[Attribute] Error adding values:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Remove one or more values from a dimension's vocabulary. Blocked
//          while any item still uses a value (the count is returned so the UI
//          can explain why) — removing an in-use value would orphan data.
// @route   DELETE /api/attributes/:id/values
// @access  Public
const removeValues = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const doc = await Attribute.findOne({ _id: req.params.id, databaseId });

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Attribute dimension not found' });
    }

    let values = [];
    if (Array.isArray(req.body.values)) {
      values = req.body.values;
    } else if (typeof req.body.value === 'string') {
      values = [req.body.value];
    } else {
      return res.status(400).json({ success: false, error: 'Provide "value" (a string) or "values" (an array of strings)' });
    }

    const requested = [...new Set(values.map(v => String(v).trim()).filter(Boolean))];
    if (requested.length === 0) {
      return res.status(400).json({ success: false, error: 'No values to remove' });
    }

    // Block while any item still uses a requested value.
    const usage = await computeUsage(databaseId, doc.name);
    const inUse = requested.filter(v => (usage.valueCounts[v] || 0) > 0);
    if (inUse.length > 0) {
      const details = inUse.map(v => `"${v}" (${usage.valueCounts[v]} item(s))`).join(', ');
      return res.status(400).json({
        success: false,
        error: `Cannot remove value(s) ${details} — items still use them. Clear the attribute from those items first.`,
        data: { inUseCount: inUse.reduce((n, v) => n + usage.valueCounts[v], 0), valueCounts: Object.fromEntries(inUse.map(v => [v, usage.valueCounts[v]])) }
      });
    }

    const current = new Set(doc.values || []);
    for (const v of requested) current.delete(v);
    doc.values = [...current];
    const saved = await doc.save();
    res.status(200).json({ success: true, data: { ...saved.toObject(), removed: requested } });
  } catch (error) {
    console.error('[Attribute] Error removing values:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Delete a dimension. Blocked while any item still uses it — the
//          count is returned so the UI can explain why (no silent data loss).
// @route   DELETE /api/attributes/:id
// @access  Public
const deleteAttribute = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const dimension = await findDimension(req.params.id, databaseId);

    if (!dimension) {
      return res.status(404).json({ success: false, error: 'Attribute dimension not found' });
    }

    const usage = await computeUsage(databaseId, dimension.name);
    if (usage.itemCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete attribute dimension "${dimension.name}" — ${usage.itemCount} item(s) still use it. Clear the attribute from those items first.`,
        data: { itemCount: usage.itemCount, valueCounts: usage.valueCounts }
      });
    }

    await Attribute.findByIdAndDelete(dimension._id);
    console.log(`[Attribute] Deleted dimension "${dimension.name}" (${String(dimension._id).slice(-8)})`);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('[Attribute] Error deleting attribute:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

module.exports = { getAttributes, createAttribute, updateAttribute, addValues, removeValues, deleteAttribute };
