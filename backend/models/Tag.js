const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
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

// Case-insensitive unique index on name
tagSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Tag', tagSchema);
