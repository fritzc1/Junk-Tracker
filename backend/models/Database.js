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

  // Manual display order in the databases list. Databases are listed by
  // ascending `order`; new ones append at the end (see databaseController).
  // Existing documents without a value get one from the startup migration.
  order: {
    type: Number,
    default: 0
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
// Supports the list query's sort order (order, then createdAt as tiebreaker).
databaseSchema.index({ order: 1, createdAt: 1 });

module.exports = mongoose.model('Database', databaseSchema);
