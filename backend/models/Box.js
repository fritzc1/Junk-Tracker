const mongoose = require('mongoose');

const boxSchema = new mongoose.Schema({
  // The logical database this box belongs to (see models/Database.js).
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Reference to the location this box belongs to (optional)
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    default: null
  },

  // Human-readable box identifier (e.g., "A06", "FA03")
  boxId: {
    type: String,
    trim: true
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

// UNIQUE case-insensitive index on (databaseId, boxId) — uniqueness is
// per-database so the same physical label ("A06") can exist in multiple
// databases. Box IDs are stored in canonical uppercase form (see utils/boxId.js);
// the collation makes uniqueness case-insensitive as defense-in-depth, so a
// stray "a06" is rejected when "A06" exists instead of creating a twin box.
// The partial filter limits the index to boxes that actually have an ID, so
// multiple ID-less boxes in one database are allowed (sparse would not work:
// databaseId is always present, so every doc would be indexed). Must stay in
// sync with ensureCaseInsensitiveBoxIndex() in server.js.
boxSchema.index(
  { databaseId: 1, boxId: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    // ($gt instead of $ne — MongoDB partial filters don't support $ne)
    partialFilterExpression: { $and: [{ boxId: { $type: 'string' } }, { boxId: { $gt: '' } }] }
  }
);

// Update the updatedAt field before saving
boxSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Box', boxSchema);
