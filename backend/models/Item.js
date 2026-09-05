const mongoose = require('mongoose');

// Stage 2 of plans/container-tree-and-attributes-plan.md: the old boxId XOR
// locationId pair is replaced by a single nullable containerId ref. The legacy
// fields are REMOVED from the schema (Mongoose strict mode would otherwise drop
// them silently on write — controllers reject requests that still send them).
const itemSchema = new mongoose.Schema({
  // The logical database this item belongs to (see models/Database.js).
  // Every query is scoped to the active database via middleware.
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Human-readable description of this item (e.g., "Batteries", "Old tax documents")
  description: {
    type: String,
    trim: true,
    default: ''
  },

  // Single container reference — replaces the old boxId XOR locationId pair.
  // Nullable: an item may be unassigned (no container). The display path is
  // computed at read time from the container's ancestor chain (see
  // controllers/itemController.js), so nothing is stored/denormalized here.
  containerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Container',
    default: null
  },

  // Sparse attribute map (Stage 4): dimension name -> vocabulary string. Keys
  // are the names of Attribute dimensions defined for this database; values
  // must be in that dimension's controlled vocabulary. Validation is done at
  // controller level (it needs the Attribute collection). Defaults to an empty
  // map — items without attributes are stored and served unchanged.
  attributes: {
    type: Map,
    of: String,
    default: {}
  },

  // Stage 6: optional attribute set (type-scoped attribute profile). When set,
  // every key in `attributes` must belong to one of the set's member dimensions
  // and its value must be within that dimension's vocabulary — enforced at
  // controller level (it needs the AttributeSet + Attribute collections). Items
  // without a set keep Stage 4/5 behavior: any defined dimension is allowed.
  // Purely additive — existing items simply have no set; no migration needed.
  attributeSetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttributeSet',
    default: null
  },

  // Tags associated with this item
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

// Index for "items directly in container X" queries (container list counts,
// delete guards, detail views).
itemSchema.index({ containerId: 1 });

// Stage 6: index for the attribute-set delete guard ("how many items still
// reference this set?") and per-set item lookups.
itemSchema.index({ attributeSetId: 1 });

// Update the updatedAt field before saving. The old XOR pre-save hook is gone
// with the boxId/locationId fields it validated.
itemSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Computed read-time field: controllers attach `displayPath` (the container's
// root->leaf path) on each document instance after populating. Mongoose's
// default serialization only emits schema paths, so a transform copies the
// computed value into every JSON response — list, single-item and export alike.
const preserveComputedFields = function (doc, ret) {
  if (doc && doc.displayPath !== undefined) ret.displayPath = doc.displayPath;
  return ret;
};
itemSchema.set('toJSON', { virtuals: false, versionKey: true, transform: preserveComputedFields });
itemSchema.set('toObject', { virtuals: false, versionKey: true, transform: preserveComputedFields });

module.exports = mongoose.model('Item', itemSchema);
