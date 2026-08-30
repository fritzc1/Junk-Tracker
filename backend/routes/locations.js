const express = require('express');
const router = express.Router();
const {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  deleteLocation
} = require('../controllers/locationController');

// @route   GET /api/locations
// @desc    List all locations
router.get('/', getLocations);

// @route   GET /api/locations/:id
// @desc    Get location by ID with boxes
router.get('/:id', getLocationById);

// @route   POST /api/locations
// @desc    Create a new location
router.post('/', createLocation);

// @route   PUT /api/locations/:id
// @desc    Update a location
router.put('/:id', updateLocation);

// @route   DELETE /api/locations/:id
// @desc    Delete a location
router.delete('/:id', deleteLocation);

module.exports = router;
