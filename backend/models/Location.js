const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  // The logical database this location belongs to (see models/Database.js).
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Human-readable location name (e.g., "Garage", "Theater", "Office")
  name: {
    type: String,
    required: true,
    trim: true
    // unique removed — uniqueness is now composite with subLocation
  },

  // Sub-location / shelf info (e.g., "Shelf 43", "Rear Right")
  // Composite unique with name: ("Garage", "Shelf 43") != ("Garage", "Rear Right")
  subLocation: {
    type: String,
    default: '',
    trim: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Composite unique index on (databaseId, name, subLocation) — uniqueness is
// per-database so the same location can exist in multiple databases.
locationSchema.index({ databaseId: 1, name: 1, subLocation: 1 }, { unique: true });

// Virtual for display label: "Garage — Shelf 43" or just "Office"
locationSchema.virtual('displayLabel').get(function() {
  return this.subLocation ? `${this.name} — ${this.subLocation}` : this.name;
});

// Ensure virtuals are included in JSON responses
locationSchema.set('toJSON', { virtuals: true });
locationSchema.set('toObject', { virtuals: true });

locationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Location', locationSchema);
