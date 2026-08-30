const express = require('express');
const router = express.Router();
const {
  createBox,
  getBoxes,
  getBoxById,
  getBoxItems,
  updateBox,
  deleteBox
} = require('../controllers/boxController');

// @route   GET /api/boxes/:id/items
// @desc    Get items for a specific box
router.get('/:id/items', getBoxItems);

// @route   GET /api/boxes
// @desc    List all boxes
router.get('/', getBoxes);

// @route   GET /api/boxes/:id
// @desc    Get box by ID with items
router.get('/:id', getBoxById);

// @route   POST /api/boxes
// @desc    Create a new box
router.post('/', createBox);

// @route   PUT /api/boxes/:id
// @desc    Update a box
router.put('/:id', updateBox);

// @route   DELETE /api/boxes/:id
// @desc    Delete a box
router.delete('/:id', deleteBox);

module.exports = router;
