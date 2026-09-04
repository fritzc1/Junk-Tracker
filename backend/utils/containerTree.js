const mongoose = require('mongoose');
const Container = require('../models/Container');

// Shared container-tree helpers (Stage 2 of plans/container-tree-and-attributes-plan.md).
// Display paths are ALWAYS computed at read time from the ancestor chain — nothing
// is denormalized, so renames/moves never need recomputation passes. Used by both
// controllers/containerController.js and controllers/itemController.js.

// Load every container in a database as lean docs plus lookup maps:
//   byId             Map<string id -> doc>
//   childrenByParent Map<string parentId|null -> [doc, ...]>
const loadContainerTree = async (databaseId) => {
  const containers = await Container.find({ databaseId }).lean();
  const byId = new Map(containers.map(c => [String(c._id), c]));
  const childrenByParent = new Map();
  for (const c of containers) {
    const key = c.parentId ? String(c.parentId) : null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(c);
  }
  return { containers, byId, childrenByParent };
};

// Root -> leaf path ("Garage / Shelf 43") for a container doc. A visited-set
// guards against pre-existing cycles in stored data (the schema hook prevents
// new ones; this keeps reads from looping forever on bad legacy state).
const computeDisplayPath = (container, byId) => {
  const parts = [];
  const seen = new Set();
  let cursor = container;
  while (cursor) {
    if (seen.has(String(cursor._id))) break; // cycle safety on bad data
    seen.add(String(cursor._id));
    parts.unshift(String(cursor.name));
    if (!cursor.parentId) break;
    const parent = byId.get(String(cursor.parentId));
    if (!parent) break; // dangling parentId — stop at the top of what exists
    cursor = parent;
  }
  return parts.join(' / ');
};

// All descendant ids (children, grandchildren, ...) via BFS. Returns a Set of
// string ids.
const collectDescendants = (rootId, childrenByParent) => {
  const descendants = new Set();
  let queue = [...(childrenByParent.get(String(rootId)) || [])];
  while (queue.length > 0) {
    const next = [];
    for (const c of queue) {
      const id = String(c._id);
      if (descendants.has(id)) continue; // cycle safety on bad data
      descendants.add(id);
      next.push(...(childrenByParent.get(id) || []));
    }
    queue = next;
  }
  return descendants;
};

// Walk up from `startId` through ancestors. Returns true if `targetId` is an
// ancestor of (or equal to) the start container — i.e., moving target under
// start would create a cycle / self-parent.
const isAncestorOfOrSelf = (startId, targetId, byId) => {
  const seen = new Set();
  let cursor = byId.get(String(startId));
  while (cursor && !seen.has(String(cursor._id))) {
    if (String(cursor._id) === String(targetId)) return true;
    seen.add(String(cursor._id));
    cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
  }
  return false;
};

module.exports = { loadContainerTree, computeDisplayPath, collectDescendants, isAncestorOfOrSelf };
