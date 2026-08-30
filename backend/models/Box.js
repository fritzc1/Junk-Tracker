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

// Sparse unique index on boxId (allows multiple null/empty values)
boxSchema.index({ boxId: 1 }, { sparse: true });

// Update the updatedAt field before saving
boxSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Box', boxSchema);
