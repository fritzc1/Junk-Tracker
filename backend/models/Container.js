const mongoose = require('mongoose');

// Unified container entity (Stage 1 of plans/container-tree-and-attributes-plan.md).
// Merges the old Location and Box entities into one tree: `kind` is 'location'
// or 'box', nesting is expressed via parentId, and items will reference a single
// containerId once Stage 2 lands. The old collections stay intact until Stage 7.
const containerSchema = new mongoose.Schema({
  // The logical database this container belongs to (see models/Database.js).
  // Per-database scoping like all entities.
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Human-readable name (e.g., "Garage", "Shelf 43", "A06"). NO global
  // uniqueness — siblings may share names under different parents ("Shelf 43"
  // in Garage and in Theater are distinct containers).
  name: {
    type: String,
    required: true,
    trim: true
  },

  // 'location' (room/shelf) or 'box'. Binary kind per design decision D1.
  kind: {
    type: String,
    enum: ['location', 'box'],
    default: 'location'
  },

  // Parent container; null means root of the tree.
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Container',
    default: null
  },

  // Physical box label (e.g., "A06"). Only meaningful when kind='box'.
  boxId: {
    type: String,
    trim: true
  },

  // Tags associated with this container (boxes currently carry tags; locations
  // don't yet but may).
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// UNIQUE case-insensitive index on (databaseId, boxId) for boxes — mirrors the
// existing Box model's index pattern in models/Box.js. Uniqueness is per-database
// so the same physical label ("A06") can exist in multiple databases; collation
// strength 2 makes uniqueness case-insensitive as defense-in-depth (a stray "a06"
// is rejected when "A06" exists instead of creating a twin). The partial filter
// limits the index to kind='box' docs with a non-empty string boxId, so ID-less
// boxes and all location containers are exempt (multiple allowed — sparse would
// not work: databaseId is always present, so every doc would be indexed). Must
// stay in sync with ensureContainerIndexes() in server.js.
containerSchema.index(
  { databaseId: 1, boxId: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    // ($gt instead of $ne — MongoDB partial filters don't support $ne)
    partialFilterExpression: {
      $and: [{ kind: 'box' }, { boxId: { $type: 'string' } }, { boxId: { $gt: '' } }]
    }
  }
);

// Index on parentId (field-level lookups, e.g. "children of X") plus the
// per-database compound index used for tree queries ("all children of X in
// database Y").
containerSchema.index({ parentId: 1 });
containerSchema.index({ databaseId: 1, parentId: 1 });

// Update updatedAt and enforce the cycle guard before saving. The guard walks
// up from parentId and rejects the save if this document's _id appears among
// its own ancestors (defense-in-depth; controllers also check on move). A
// visited-set also catches pre-existing cycles in the stored data instead of
// looping forever.
containerSchema.pre('save', async function (next) {
  try {
    this.updatedAt = Date.now();

    if (!this._id || !this.parentId) return next();

    const visited = new Set([String(this._id)]);
    let cursor = this.parentId;
    while (cursor) {
      const idStr = String(cursor);
      if (visited.has(idStr)) {
        return next(new Error('Container parent chain contains a cycle.'));
      }
      visited.add(idStr);
      const parent = await this.constructor.findById(cursor).lean();
      cursor = parent ? parent.parentId : null;
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Container', containerSchema);
