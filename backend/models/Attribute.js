const mongoose = require('mongoose');

// Attribute dimension (Stage 4 of plans/container-tree-and-attributes-plan.md).
// A per-database classification dimension with a controlled vocabulary: items
// store one value per dimension in their sparse `attributes` map, keyed by the
// dimension's name. Dimensions are unique per database (exact-match names —
// item attribute keys must match them verbatim), and values keep their case
// ("SMD" vs "smd" are distinct vocabulary entries).
const attributeSchema = new mongoose.Schema({
  // The logical database this dimension belongs to (see models/Database.js).
  // Per-database scoping like all entities.
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Dimension name (e.g., "footprint", "tolerance"). Unique per database; the
  // pre-save hook rejects names containing "." or "$" because they would break
  // dotted-path queries on item.attributes.<name>.
  name: {
    type: String,
    required: true,
    trim: true
  },

  // Controlled vocabulary for this dimension (e.g., ["SMD", "THT"]). When the
  // list is non-empty, item attribute values must be one of these strings; when
  // it is empty the dimension is UNRESTRICTED and free input is accepted (see
  // validateAttributes in controllers/itemController.js).
  values: [{
    type: String,
    trim: true
  }],

  // Stage 5 rev2: how to interpret free-input values on an unrestricted
  // dimension. 'number' requires a parseable number; 'string'/'mixed' accept
  // any non-empty text. Vocabulary values are always valid regardless of this.
  dataType: {
    type: String,
    enum: ['number', 'string', 'mixed'],
    default: 'string'
  },

  // Stage 5 rev2: optional display unit (e.g., "Ohm", "g"). Stored as an empty
  // string when unset — the UI renders it as a suffix after value inputs.
  unit: {
    type: String,
    trim: true,
    default: ''
  },

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

// Unique index on (databaseId, name) — dimensions are per-database. Exact-match
// uniqueness (no lowercase/collation): item attribute keys reference the name
// verbatim, so "Footprint" and "footprint" must stay distinct dimensions.
attributeSchema.index({ databaseId: 1, name: 1 }, { unique: true });

// Update updatedAt before saving and defensively normalize the vocabulary:
// trim each value, drop empties, dedupe (exact match). Also normalizes `unit`
// to a trimmed string ('' when unset) so the field is never null/undefined.
attributeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  if (Array.isArray(this.values)) {
    const seen = new Set();
    this.values = this.values
      .map(v => String(v).trim())
      .filter(v => {
        if (!v || seen.has(v)) return false;
        seen.add(v);
        return true;
      });
  }

  this.unit = String(this.unit ?? '').trim();

  next();
});

module.exports = mongoose.model('Attribute', attributeSchema);
