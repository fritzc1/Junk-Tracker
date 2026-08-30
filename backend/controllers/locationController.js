const Location = require('../models/Location');
const Box = require('../models/Box');
const Item = require('../models/Item');

// Helper to compute display label for a location
const getDisplayLabel = (location) => {
  return location.subLocation ? `${location.name} — ${location.subLocation}` : location.name;
};

// @desc    Create a new location
// @route   POST /api/locations
// @access  Public
const createLocation = async (req, res) => {
  try {
    const { name, subLocation } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Location name is required'
      });
    }

    // Check composite uniqueness on (name, subLocation)
    const existing = await Location.findOne({
      name: name.trim(),
      subLocation: (subLocation || '').trim()
    });
    if (existing) {
      console.log(`[Location] Duplicate rejected: "${name.trim()}"${(subLocation||'').trim() ? ' — ' + subLocation.trim() : ''}`);
      return res.status(400).json({
        success: false,
        error: 'A location with this name and sub-location already exists.'
      });
    }

    const location = await Location.create({
      name: name.trim(),
      subLocation: (subLocation || '').trim()
    });

    console.log(`[Location] Created: "${location.name}"${location.subLocation ? ' — ' + location.subLocation : ''}`);
    res.status(201).json({
      success: true,
      data: location
    });
  } catch (error) {
    console.error('[Location] Error creating location:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'A location with this name and sub-location already exists.'
      });
    }
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get all locations (with box and item counts)
// @route   GET /api/locations
// @access  Public
const getLocations = async (req, res) => {
  try {
    const locations = await Location.aggregate([
      // Lookup boxes at this location
      {
        $lookup: {
          from: 'boxes',
          localField: '_id',
          foreignField: 'locationId',
          as: 'boxes'
        }
      },
      // Lookup items directly at this location (not in a box)
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: 'locationId',
          as: 'directItems'
        }
      },
      {
        $addFields: {
          boxCount: { $size: '$boxes' },
          directItemCount: { $size: '$directItems' }
        }
      },
      {
        $project: {
          boxes: 0,
          directItems: 0
        }
      }
    ]);

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Get location by ID (with boxes and direct items)
// @route   GET /api/locations/:id
// @access  Public
const getLocationById = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    const boxes = await Box.find({ locationId: req.params.id }).populate('locationId', 'name subLocation');
    const directItems = await Item.find({ locationId: req.params.id });

    res.status(200).json({
      success: true,
      data: {
        ...location.toObject(),
        displayLabel: getDisplayLabel(location),
        boxes,
        directItems
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Update a location
// @route   PUT /api/locations/:id
// @access  Public
const updateLocation = async (req, res) => {
  try {
    const { name, subLocation } = req.body;

    let location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    const newName = name !== undefined ? name.trim() : location.name;
    const newSubLocation = subLocation !== undefined ? (subLocation || '').trim() : location.subLocation;

    // Check composite uniqueness on (name, subLocation) excluding current doc
    if (newName !== location.name || newSubLocation !== location.subLocation) {
      const existing = await Location.findOne({
        name: newName,
        subLocation: newSubLocation,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Location with this name and sub-location already exists'
        });
      }
    }

    location.name = newName;
    location.subLocation = newSubLocation;

    location = await location.save();

    res.status(200).json({
      success: true,
      data: location
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Delete a location
// @route   DELETE /api/locations/:id
// @access  Public
const deleteLocation = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Check if location has boxes
    const boxCount = await Box.countDocuments({ locationId: req.params.id });
    if (boxCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete location with ${boxCount} box(es). Remove or reassign boxes first.`
      });
    }

    // Check if location has direct items
    const itemCount = await Item.countDocuments({ locationId: req.params.id });
    if (itemCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete location with ${itemCount} item(s) directly assigned. Remove or reassign items first.`
      });
    }

    await Location.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

module.exports = {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation
};
