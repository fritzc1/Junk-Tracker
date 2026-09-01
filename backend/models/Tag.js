const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  // The logical database this tag belongs to (see models/Database.js).
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Unique index on (databaseId, name) — tags are per-database; the schema's
// lowercase option makes uniqueness case-insensitive.
tagSchema.index({ databaseId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tag', tagSchema);
