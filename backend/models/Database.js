const mongoose = require('mongoose');

// A logical "database" — a named container that keeps items, boxes, locations
// and tags separate from other databases. All data documents carry a
// databaseId reference to one of these; the backend scopes every query to the
// active database (see middleware/requireDatabase.js).
const databaseSchema = new mongoose.Schema({
  // Human-readable name (e.g., "Garage", "Attic"). Uniqueness is enforced
  // case-insensitively at the controller level.
  name: {
    type: String,
    required: true,
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

databaseSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Database', databaseSchema);
