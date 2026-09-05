const mongoose = require('mongoose');

// Attribute set (Stage 6 of plans/container-tree-and-attributes-plan.md).
// A per-database, type-scoped attribute profile: a named group of Attribute
// dimensions that applies to items carrying this set. Picking the "resistor"
// set on an item scopes its attribute pickers to exactly the set's member
// dimensions (footprint / tolerance / value) — nothing else can be added or
// saved. Items store only the set's id (attributeSetId), so renaming a set
// touches no item data; deleting one is blocked while items still reference it.
const attributeSetSchema = new mongoose.Schema({
  // The logical database this set belongs to (see models/Database.js).
  // Per-database scoping like all entities.
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Set name (e.g., "resistor", "fastener"). Unique per database; the pre-save
  // hook trims it. Exact-match uniqueness (no collation), mirroring Attribute —
  // set names are identifiers, not display strings.
  name: {
    type: String,
    required: true,
    trim: true
  },

  // Member dimensions of this profile. Order is preserved as given (it drives
  // the picker order in the UI); duplicates are dropped by the pre-save hook.
  attributeIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attribute'
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

// Unique index on (databaseId, name) — sets are per-database. Exact-match
// uniqueness (no lowercase/collation), mirroring the Attribute model's index.
attributeSetSchema.index({ databaseId: 1, name: 1 }, { unique: true });

// Update updatedAt before saving and defensively normalize the member list:
// keep only valid ObjectIds, dedupe (first occurrence wins — order preserved).
attributeSetSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  if (Array.isArray(this.attributeIds)) {
    const seen = new Set();
    this.attributeIds = this.attributeIds.filter(id => {
      if (!id || !mongoose.isValidObjectId(id)) return false;
      const key = String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  next();
});

module.exports = mongoose.model('AttributeSet', attributeSetSchema);
