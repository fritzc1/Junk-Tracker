const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  // The logical database this item belongs to (see models/Database.js).
  // Every query is scoped to the active database via middleware.
  databaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Database',
    required: true
  },

  // Human-readable description of this item (e.g., "Batteries", "Old tax documents")
  description: {
    type: String,
    trim: true,
    default: ''
  },

  // Reference to the box this item belongs to (XOR with locationId)
  boxId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Box',
    default: null
  },

  // Direct reference to a location when item is NOT in a box (XOR with boxId)
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    default: null
  },

  // Tags associated with this item
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
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

itemSchema.index({ boxId: 1 });
itemSchema.index({ locationId: 1 });

// XOR validation: cannot have both boxId and locationId set
itemSchema.pre('save', function(next) {
  if (this.boxId && this.locationId) {
    return next(new Error('Item can reference a Box or a Location, but not both.'));
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Item', itemSchema);
