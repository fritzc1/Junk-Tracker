const mongoose = require('mongoose');

const boxSchema = new mongoose.Schema({
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

// Sparse UNIQUE case-insensitive index on boxId (allows multiple null/empty
// values). Box IDs are stored in canonical uppercase form (see utils/boxId.js);
// the collation makes uniqueness case-insensitive as defense-in-depth, so a
// stray "a06" is rejected when "A06" exists instead of creating a twin box.
boxSchema.index(
  { boxId: 1 },
  { sparse: true, unique: true, collation: { locale: 'en', strength: 2 } }
);

// Update the updatedAt field before saving
boxSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Box', boxSchema);
