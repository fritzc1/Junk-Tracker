const mongoose = require('mongoose');
const Container = require('../models/Container');
const Item = require('../models/Item');
const Tag = require('../models/Tag');
const { normalizeBoxId } = require('../utils/boxId');
const { loadContainerTree, computeDisplayPath, collectDescendants, isAncestorOfOrSelf } = require('../utils/containerTree');

// Stage 2 of plans/container-tree-and-attributes-plan.md: the unified container
// API. Containers form a per-database tree (parentId); display paths are always
// COMPUTED AT READ TIME from the ancestor chain — nothing is denormalized, so
// renames/moves never require recomputation passes. Tree helpers live in
// utils/containerTree.js (shared with itemController).

// ---------------------------------------------------------------------------
// Validation / resolution helpers
// ---------------------------------------------------------------------------

// Case-insensitive sibling-name duplicate check under the same parent.
// `excludeId` is passed on updates so a container never collides with itself.
const findSiblingNameCollision = async (databaseId, parentId, name, excludeId) => {
  const filter = {
    databaseId,
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    _id: { $ne: excludeId || null }
  };
  // parentId is stored as ObjectId (or absent/null for roots) — match both the
  // explicit value and missing/null so root-level siblings are covered.
  if (parentId && mongoose.isValidObjectId(parentId)) {
    filter.parentId = new mongoose.Types.ObjectId(parentId);
  } else {
    filter.$or = [{ parentId: null }, { parentId: { $exists: false } }];
  }
  return Container.findOne(filter).lean();
};

// Cross-kind identity collision check (container-box-identity rework): within a
// database the set of location names and the set of box IDs must be DISJOINT,
// case-insensitively. A location named "A06" would render identically to box
// "A06" in display paths / CSV export ("Garage / A06"), making re-imports of
// hand-edited files ambiguous and human reading misleading. This is a
// cross-document constraint, so it can't be an index — one query per write.
// Returns { error } when the proposed (kind, name?, boxId?) collides with an
// existing container of the other kind; `excludeId` skips self on updates.
const findNameBoxIdCollision = async (databaseId, kind, name, boxId, excludeId) => {
  const skip = excludeId ? { _id: { $ne: new mongoose.Types.ObjectId(excludeId) } } : {};
  if (kind === 'box') {
    // Proposed box ID must not match any existing location's name.
    const norm = normalizeBoxId(boxId);
    if (!norm) return null;
    const hit = await Container.findOne({
      databaseId, kind: 'location', ...skip,
      name: new RegExp(`^${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).lean();
    return hit ? `Box ID "${norm}" matches an existing location name. Rename the location or choose a different box ID.` : null;
  }
  // Proposed location name must not match any existing box's ID (boxes store
  // canonical uppercase, so compare against the normalized form).
  const normName = normalizeBoxId(name);
  if (!normName) return null;
  const hit = await Container.findOne({
    databaseId, kind: 'box', ...skip,
    boxId: new RegExp(`^${normName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  }).lean();
  return hit ? `Location name "${String(name).trim()}" collides with an existing box ID. Rename the location or change that box's ID.` : null;
};

// Resolve tag input to ids. Accepts `tagNames` (strings, auto-created like the
// box/item controllers) and/or `tags` (existing ObjectIds, validated against
// the active database). Returns { tagIds, error }.
const resolveContainerTags = async ({ tags, tagNames }, databaseId) => {
  const ids = new Set();

  if (tagNames !== undefined && !Array.isArray(tagNames)) {
    return { error: 'tagNames must be an array of strings' };
  }
  for (const tagName of tagNames || []) {
    if (!tagName || !String(tagName).trim()) continue;
    const name = String(tagName).trim().toLowerCase();
    let existingTag = await Tag.findOne({ name, databaseId });
    if (!existingTag) {
      existingTag = await Tag.create({ name, databaseId });
    }
    ids.add(String(existingTag._id));
  }

  if (tags !== undefined && !Array.isArray(tags)) {
    return { error: 'tags must be an array of tag IDs' };
  }
  for (const rawId of tags || []) {
    if (!rawId || !mongoose.isValidObjectId(rawId)) {
      return { error: `Invalid tag ID: ${rawId}` };
    }
    const tag = await Tag.findOne({ _id: rawId, databaseId });
    if (!tag) {
      return { error: `Tag not found in this database: ${rawId}` };
    }
    ids.add(String(tag._id));
  }

  return { tagIds: [...ids] };
};

// Validate a parentId value (string|null|undefined) against the active
// database. Returns { parentId, error }.
const validateParent = async (parentId, databaseId) => {
  if (parentId === undefined || parentId === null || parentId === '') return { parentId: null };
  if (!mongoose.isValidObjectId(parentId)) {
    return { error: `Invalid parentId: ${parentId}` };
  }
  const parent = await Container.findOne({ _id: parentId, databaseId }).lean();
  if (!parent) {
    return { error: 'Parent container not found in this database.' };
  }
  return { parentId: new mongoose.Types.ObjectId(parentId) };
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// @desc    Flat list of all containers with computed displayPath + counts
// @route   GET /api/containers
// @access  Public
const getContainers = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { containers, byId, childrenByParent } = await loadContainerTree(databaseId);

    // Direct item counts in one grouped query (containerId -> count).
    const counts = await Item.aggregate([
      { $match: { databaseId: new mongoose.Types.ObjectId(databaseId) } },
      { $group: { _id: '$containerId', count: { $sum: 1 } } }
    ]);
    const directCountMap = new Map(counts.map(c => [String(c._id), c.count]));

    // Descendant counts per container (BFS over the in-memory tree).
    const descendantCounts = new Map();
    for (const c of containers) {
      descendantCounts.set(String(c._id), collectDescendants(String(c._id), childrenByParent).size);
    }

    const data = containers.map(c => ({
      ...c,
      displayPath: computeDisplayPath(c, byId),
      directItemCount: directCountMap.get(String(c._id)) || 0,
      descendantCount: descendantCounts.get(String(c._id)) || 0
    }));

    // Stable, human-friendly order: sort by full path (roots first). The
    // frontend builds the tree from parentId; this just makes the flat list
    // deterministic and readable.
    data.sort((a, b) => a.displayPath.localeCompare(b.displayPath));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('[Container] Error listing containers:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create a container (kind location|box), with sibling-name warning
// @route   POST /api/containers
// @access  Public
const createContainer = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { name, kind } = req.body;

    // Kind defaults to 'location'; reject anything outside the enum early so
    // the error message is ours (not Mongoose's generic validator text).
    let containerKind = 'location';
    if (kind !== undefined && kind !== null && kind !== '') {
      if (!['location', 'box'].includes(kind)) {
        return res.status(400).json({ success: false, error: "kind must be 'location' or 'box'" });
      }
      containerKind = kind;
    }

    // Identity rules (container-box-identity rework): locations are identified
    // by their name (required); boxes by their boxId (required) — a box has no
    // user-facing name, its display label is always the ID itself.
    const trimmedName = name !== undefined && name !== null ? String(name).trim() : '';
    if (containerKind === 'location' && !trimmedName) {
      return res.status(400).json({ success: false, error: 'Location name is required' });
    }

    const parentResult = await validateParent(req.body.parentId, databaseId);
    if (parentResult.error) {
      return res.status(400).json({ success: false, error: parentResult.error });
    }

    // boxId: canonical uppercase; required for boxes, forbidden elsewhere.
    const rawBoxId = req.body.boxId !== undefined && req.body.boxId !== null ? String(req.body.boxId) : '';
    const normalizedBoxId = normalizeBoxId(rawBoxId);
    if (containerKind === 'box' && !normalizedBoxId) {
      return res.status(400).json({ success: false, error: 'Boxes require a Box ID.' });
    }
    if (normalizedBoxId && containerKind !== 'box') {
      return res.status(400).json({ success: false, error: "boxId is only valid for containers with kind 'box'" });
    }
    if (normalizedBoxId) {
      const existing = await Container.findOne({ boxId: normalizedBoxId, databaseId }).lean();
      if (existing) {
        return res.status(400).json({ success: false, error: `A box with ID "${normalizedBoxId}" already exists.` });
      }
    }

    // Cross-kind collision: location names and box IDs must stay disjoint.
    const storedName = containerKind === 'box' ? normalizedBoxId : trimmedName;
    const collisionError = await findNameBoxIdCollision(databaseId, containerKind, storedName, normalizedBoxId);
    if (collisionError) {
      return res.status(409).json({ success: false, error: collisionError });
    }

    const tagResult = await resolveContainerTags(req.body, databaseId);
    if (tagResult.error) {
      return res.status(400).json({ success: false, error: tagResult.error });
    }

    // Non-blocking sibling-name duplicate warning — locations only; boxes are
    // identified by their unique ID so a same-named sibling is impossible.
    const warnings = [];
    if (containerKind === 'location') {
      const collision = await findSiblingNameCollision(databaseId, parentResult.parentId, trimmedName);
      if (collision) {
        warnings.push(`A sibling named "${trimmedName}" already exists under this parent.`);
      }
    }

    const container = await Container.create({
      databaseId,
      name: storedName, // boxes: always the boxId itself (internal display label)
      kind: containerKind,
      parentId: parentResult.parentId,
      boxId: normalizedBoxId || undefined, // omit when empty so the partial index stays clean
      tags: tagResult.tagIds
    });

    const { byId } = await loadContainerTree(databaseId);
    console.log(`[Container] Created ${containerKind} "${storedName}" (${String(container._id).slice(-8)})`);
    res.status(201).json({
      success: true,
      warnings,
      data: { ...container.toObject(), displayPath: computeDisplayPath(container.toObject(), byId) }
    });
  } catch (error) {
    console.error('[Container] Error creating container:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A box with this ID already exists.' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Rename and/or move a container (cycle-safe), with sibling warning
// @route   PUT /api/containers/:id
// @access  Public
const updateContainer = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { name, kind } = req.body;

    let container = await Container.findOne({ _id: req.params.id, databaseId });
    if (!container) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    const warnings = [];

    // --- Rename -------------------------------------------------------------
    // For boxes the user-facing name is not editable — it always mirrors the
    // boxId (applied below once the final kind/boxId are known). A `name` sent
    // for a box is ignored.
    let newName = container.name;
    if (name !== undefined && name !== null) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ success: false, error: 'Container name cannot be empty' });
      }
      newName = trimmedName;
    }

    // --- Move (parentId) ------------------------------------------------------
    let newParentId = container.parentId || null;
    if (req.body.parentId !== undefined) {
      const parentResult = await validateParent(req.body.parentId, databaseId);
      if (parentResult.error) {
        return res.status(400).json({ success: false, error: parentResult.error });
      }
      newParentId = parentResult.parentId;

      // Self-parent and cycle rejection — walk the ancestors of the proposed
      // parent; if this container appears among them (or IS it), the move would
      // create a cycle. The schema pre-save hook is defense-in-depth for this.
      const targetId = String(container._id);
      if (newParentId && String(newParentId) === targetId) {
        return res.status(400).json({ success: false, error: 'A container cannot be its own parent.' });
      }
      if (newParentId) {
        const { byId } = await loadContainerTree(databaseId);
        if (isAncestorOfOrSelf(String(newParentId), targetId, byId)) {
          return res.status(400).json({
            success: false,
            error: 'Cannot move a container under its own descendant — that would create a cycle.'
          });
        }
      }
    }

    // --- boxId + kind (allow location<->box reclassification) -------------------
    // Compute the FINAL state first, then validate it as a whole — so a request
    // that changes both fields at once (e.g. reclassifying location -> box and
    // supplying the ID in the same call) is checked correctly.
    let finalKind = container.kind;
    if (kind !== undefined && kind !== null && kind !== '') {
      if (!['location', 'box'].includes(kind)) {
        return res.status(400).json({ success: false, error: "kind must be 'location' or 'box'" });
      }
      finalKind = kind;
    }

    let finalBoxId = container.boxId || ''; // '' when the field is unset/omitted
    if (req.body.boxId !== undefined) {
      const normalizedBoxId = normalizeBoxId(req.body.boxId);
      if (normalizedBoxId && finalKind !== 'box') {
        return res.status(400).json({ success: false, error: "boxId is only valid for containers with kind 'box'" });
      }
      finalBoxId = normalizedBoxId; // '' -> clears the field on save
    }

    // Locations never carry a boxId — reclassifying away from box clears it.
    if (finalKind !== 'box') finalBoxId = '';

    if (finalKind === 'box' && !finalBoxId) {
      return res.status(400).json({ success: false, error: 'Boxes require a Box ID.' });
    }
    if (finalBoxId) {
      const existing = await Container.findOne({ boxId: finalBoxId, databaseId, _id: { $ne: container._id } }).lean();
      if (existing) {
        return res.status(400).json({ success: false, error: `A box with ID "${finalBoxId}" already exists.` });
      }
    }

    // For boxes the display label always mirrors the boxId; for locations it is
    // the user-supplied name (or the existing one when unchanged).
    const finalName = finalKind === 'box' ? finalBoxId : newName;

    // Cross-kind collision on the FINAL state: location names and box IDs must
    // stay disjoint within a database.
    const collisionError = await findNameBoxIdCollision(databaseId, finalKind, finalName, finalBoxId, container._id);
    if (collisionError) {
      return res.status(409).json({ success: false, error: collisionError });
    }

    container.kind = finalKind;
    container.boxId = finalBoxId || undefined; // clearing -> omit the field

    // --- tags -------------------------------------------------------------------
    const tagResult = await resolveContainerTags(req.body, databaseId);
    if (tagResult.error) {
      return res.status(400).json({ success: false, error: tagResult.error });
    }
    if (req.body.tags !== undefined || req.body.tagNames !== undefined) {
      container.tags = tagResult.tagIds; // only applied when the field is present
    }

    // Sibling-name collision warning for the resulting (name, parent) pair —
    // locations only; boxes are identified by their unique ID.
    const effectiveName = finalName;
    const effectiveParentId = newParentId;
    if (finalKind === 'location' &&
        (effectiveName !== container.name || String(effectiveParentId || '') !== String(container.parentId || ''))) {
      const collision = await findSiblingNameCollision(databaseId, effectiveParentId, effectiveName, container._id);
      if (collision) {
        warnings.push(`A sibling named "${effectiveName}" already exists under this parent.`);
      }
    }

    container.name = finalName; // boxes: always mirrors the boxId
    container.parentId = newParentId;
    container = await container.save(); // pre-save hook re-checks cycle + box rules

    const { byId } = await loadContainerTree(databaseId);
    res.status(200).json({
      success: true,
      warnings,
      data: { ...container.toObject(), displayPath: computeDisplayPath(container.toObject(), byId) }
    });
  } catch (error) {
    console.error('[Container] Error updating container:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A box with this ID already exists.' });
    }
    // The schema hook's cycle guard surfaces here as a plain Error.
    if (/cycle/i.test(error.message)) {
      return res.status(400).json({ success: false, error: 'Cannot move a container under its own descendant — that would create a cycle.' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Delete a container (blocked while it has children or direct items)
// @route   DELETE /api/containers/:id
// @access  Public
const deleteContainer = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const container = await Container.findOne({ _id: req.params.id, databaseId });

    if (!container) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    // Block deletion while the tree or items still depend on this node. The
    // counts are returned so a UI can explain exactly why it was blocked.
    const childCount = await Container.countDocuments({ parentId: container._id, databaseId });
    const itemCount = await Item.countDocuments({ containerId: container._id, databaseId });

    if (childCount > 0 || itemCount > 0) {
      const reasons = [];
      if (childCount > 0) reasons.push(`${childCount} child container(s)`);
      if (itemCount > 0) reasons.push(`${itemCount} item(s) directly assigned`);
      return res.status(400).json({
        success: false,
        error: `Cannot delete "${container.name}" — it still has ${reasons.join(' and ')}. Move or remove them first.`,
        data: { childCount, itemCount }
      });
    }

    await Container.findByIdAndDelete(container._id);
    console.log(`[Container] Deleted "${container.name}" (${String(container._id).slice(-8)})`);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('[Container] Error deleting container:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Single container + its subtree + direct items (detail view / "view contents")
// @route   GET /api/containers/:id
// @access  Public
const getContainerById = async (req, res) => {
  try {
    const databaseId = req.databaseId;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    const container = await Container.findOne({ _id: req.params.id, databaseId }).populate('tags', 'name');
    if (!container) {
      return res.status(404).json({ success: false, error: 'Container not found' });
    }

    const { byId, childrenByParent } = await loadContainerTree(databaseId);
    const descendantIds = collectDescendants(String(container._id), childrenByParent);

    // Direct item counts for the subtree in one grouped query.
    const allIds = [String(container._id), ...descendantIds];
    const counts = await Item.aggregate([
      { $match: { databaseId: new mongoose.Types.ObjectId(databaseId) } },
      { $group: { _id: '$containerId', count: { $sum: 1 } } }
    ]);
    const directCountMap = new Map(counts.map(c => [String(c._id), c.count]));

    // Flat list of every descendant (the frontend can nest it via parentId).
    const descendants = [...descendantIds]
      .map(id => byId.get(id))
      .filter(Boolean)
      .map(c => ({
        _id: c._id,
        name: c.name,
        kind: c.kind,
        boxId: c.boxId || null,
        parentId: c.parentId || null,
        displayPath: computeDisplayPath(c, byId),
        directItemCount: directCountMap.get(String(c._id)) || 0
      }))
      .sort((a, b) => a.displayPath.localeCompare(b.displayPath));

    // Direct items of THIS container (populated tags for the contents view).
    const directItems = await Item.find({ containerId: container._id, databaseId }).populate('tags', 'name');

    res.status(200).json({
      success: true,
      data: {
        ...container.toObject(),
        displayPath: computeDisplayPath(container.toObject(), byId),
        descendantCount: descendantIds.size,
        directItemCount: directCountMap.get(String(container._id)) || 0,
        descendants,
        directItems
      }
    });
  } catch (error) {
    console.error('[Container] Error getting container:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

module.exports = { getContainers, createContainer, updateContainer, deleteContainer, getContainerById };
