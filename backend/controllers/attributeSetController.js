const mongoose = require('mongoose');
const AttributeSet = require('../models/AttributeSet');
const Attribute = require('../models/Attribute');
const Item = require('../models/Item');

// Stage 6 of plans/container-tree-and-attributes-plan.md: attribute sets —
// type-scoped attribute profiles. A set is a named group of this database's
// Attribute dimensions; items carrying the set may only use those dimensions
// (enforced in itemController.validateAttributes). Items store ONLY the set id,
// so renaming a set touches no item data; deleting one is blocked while any
// item still references it (the count is returned so a UI can explain why).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fetch a set scoped to the active database; null when absent.
const findSet = async (id, databaseId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return AttributeSet.findOne({ _id: id, databaseId }).lean();
};

// Case-insensitive duplicate-name check within this database (mirrors the
// attribute controller's convention). `excludeId` is passed on renames.
const findNameCollision = async (databaseId, name, excludeId) => {
  return AttributeSet.findOne({
    databaseId,
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    _id: { $ne: excludeId || null }
  }).lean();
};

// How many items in this database reference the set (delete guard).
const countItemsUsingSet = async (databaseId, setId) => {
  return Item.countDocuments({ databaseId, attributeSetId: new mongoose.Types.ObjectId(String(setId)) });
};

// Serialize a set with its member dimensions populated — name/dataType/unit/
// values are exactly what the UI's picker pool needs. Dangling member ids
// (a dimension deleted after no item used it) are skipped silently; order is
// preserved as stored on the set.
const serializeSet = async (set, databaseId) => {
  const members = await Attribute.find({ _id: { $in: set.attributeIds || [] }, databaseId }).lean();
  const byId = new Map(members.map(d => [String(d._id), d]));
  return {
    _id: set._id,
    name: set.name,
    attributeIds: (set.attributeIds || []).map(String).filter(id => byId.has(id)),
    dimensions: (set.attributeIds || [])
      .map(id => byId.get(String(id)))
      .filter(Boolean)
      .map(d => ({ _id: d._id, name: d.name, values: d.values || [], dataType: d.dataType || 'string', unit: d.unit || '' })),
    createdAt: set.createdAt,
    updatedAt: set.updatedAt
  };
};

// Parse + validate the member-dimension list from a request body. Returns
// { error } on bad input, else { attributeIds } (valid ObjectIds only — ids that
// are not dimensions of THIS database are rejected with an actionable message).
const parseAttributeIds = async (raw, databaseId) => {
  if (!Array.isArray(raw)) {
    return { error: 'attributeIds must be an array of attribute dimension IDs' };
  }
  const ids = [];
  for (const v of raw) {
    const s = String(v ?? '').trim();
    if (!s || !mongoose.isValidObjectId(s)) continue; // ignore blanks/invalid — nothing to add
    if (!ids.includes(s)) ids.push(s);
  }
  const live = await Attribute.find({ _id: { $in: ids }, databaseId }).select('_id').lean();
  const liveIds = new Set(live.map(d => String(d._id)));
  for (const id of ids) {
    if (!liveIds.has(id)) {
      return { error: `Attribute dimension ${id} does not exist in this database.` };
    }
  }
  return { attributeIds: ids };
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// @desc    List all sets for the active database, each with its member dimensions populated
// @route   GET /api/attribute-sets
// @access  Public
const getAttributeSets = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const sets = await AttributeSet.find({ databaseId }).sort({ name: 1 });

    // One usage count per set (cheap at personal scale).
    const data = [];
    for (const set of sets) {
      const serialized = await serializeSet(set, databaseId);
      serialized.itemCount = await countItemsUsingSet(databaseId, set._id);
      data.push(serialized);
    }

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('[AttributeSet] Error listing attribute sets:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create a set with an optional initial member-dimension list
// @route   POST /api/attribute-sets
// @access  Public
const createAttributeSet = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Attribute set name is required' });
    }
    const trimmedName = String(name).trim();

    const existing = await findNameCollision(databaseId, trimmedName);
    if (existing) {
      return res.status(400).json({ success: false, error: `An attribute set named "${existing.name}" already exists` });
    }

    let attributeIds = [];
    if (req.body.attributeIds !== undefined && req.body.attributeIds !== null) {
      const parsed = await parseAttributeIds(req.body.attributeIds, databaseId);
      if (parsed.error) {
        return res.status(400).json({ success: false, error: parsed.error });
      }
      attributeIds = parsed.attributeIds;
    }

    const set = await AttributeSet.create({ databaseId, name: trimmedName, attributeIds });
    res.status(201).json({ success: true, data: await serializeSet(set, databaseId) });
  } catch (error) {
    console.error('[AttributeSet] Error creating attribute set:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'An attribute set with this name already exists' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Update a set: rename and/or replace its member-dimension list — any
//          combination in one call (the edit dialog commits everything at once).
//          Renaming touches NO item data (items store the id); replacing members
//          does not rewrite items either — items whose attributes fall outside
//          the new membership are rejected on their next save with an actionable
//          error naming the offending attribute and set.
// @route   PUT /api/attribute-sets/:id
// @access  Public
const updateAttributeSet = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const set = await findSet(req.params.id, databaseId);

    if (!set) {
      return res.status(404).json({ success: false, error: 'Attribute set not found' });
    }

    // --- Rename -----------------------------------------------------------------
    let newName = set.name;
    if (req.body.name !== undefined && req.body.name !== null) {
      const trimmedName = String(req.body.name).trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, error: 'Attribute set name cannot be empty' });
      }
      const collision = await findNameCollision(databaseId, trimmedName, set._id);
      if (collision) {
        return res.status(400).json({ success: false, error: `An attribute set named "${collision.name}" already exists` });
      }
      newName = trimmedName;
    }

    // --- Member list replacement ---------------------------------------------------
    // `attributeIds` is the COMPLETE desired list (the edit dialog sends its full
    // local state), not an append. The pre-save hook trims/dedupes/validates ids.
    let newAttributeIds = set.attributeIds || [];
    if (req.body.attributeIds !== undefined && req.body.attributeIds !== null) {
      const parsed = await parseAttributeIds(req.body.attributeIds, databaseId);
      if (parsed.error) {
        return res.status(400).json({ success: false, error: parsed.error });
      }
      newAttributeIds = parsed.attributeIds;
    }

    const doc = await AttributeSet.findById(set._id);
    doc.name = newName;
    if (req.body.attributeIds !== undefined && req.body.attributeIds !== null) {
      doc.attributeIds = newAttributeIds; // pre-save hook dedupes + drops invalid ids
    }
    const saved = await doc.save();

    console.log(`[AttributeSet] Updated set "${set.name}" -> "${saved.name}" (${(saved.attributeIds || []).length} dimension(s))`);
    res.status(200).json({ success: true, data: await serializeSet(saved, databaseId) });
  } catch (error) {
    console.error('[AttributeSet] Error updating attribute set:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'An attribute set with this name already exists' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Delete a set. Blocked while any item still references it — the count
//          is returned so the UI can explain why (no silent data loss).
// @route   DELETE /api/attribute-sets/:id
// @access  Public
const deleteAttributeSet = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const set = await findSet(req.params.id, databaseId);

    if (!set) {
      return res.status(404).json({ success: false, error: 'Attribute set not found' });
    }

    const itemCount = await countItemsUsingSet(databaseId, set._id);
    if (itemCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete attribute set "${set.name}" — ${itemCount} item(s) still use it. Remove the set from those items first.`,
        data: { itemCount }
      });
    }

    await AttributeSet.findByIdAndDelete(set._id);
    console.log(`[AttributeSet] Deleted set "${set.name}" (${String(set._id).slice(-8)})`);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('[AttributeSet] Error deleting attribute set:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

module.exports = { getAttributeSets, createAttributeSet, updateAttributeSet, deleteAttributeSet };
