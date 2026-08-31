const Box = require('../models/Box');
const Item = require('../models/Item');
const { normalizeBoxId } = require('../utils/boxId');

// @desc    Create a new box
// @route   POST /api/boxes
// @access  Public
const createBox = async (req, res) => {
  try {
    const { boxId, locationId } = req.body;

    // Normalize to the canonical stored form (trimmed + uppercase) so identity
    // is case-insensitive: "a06" and "A06" are the same box.
    const normalizedBoxId = normalizeBoxId(boxId);

    // Check for duplicate boxId if provided
    if (normalizedBoxId) {
      const existing = await Box.findOne({ boxId: normalizedBoxId });
      if (existing) {
        console.log(`[Box] Duplicate rejected: "${normalizedBoxId}"`);
        return res.status(400).json({
          success: false,
          error: 'A box with this ID already exists.'
        });
      }
    }

    const box = await Box.create({
      boxId: normalizedBoxId || undefined,
      locationId: locationId || null
    });

    console.log(`[Box] Created: "${box.boxId || '(no ID)'}"`);
    res.status(201).json({
      success: true,
      data: box
    });
  } catch (error) {
    console.error('[Box] Error creating box:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'A box with this ID already exists.'
      });
    }
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get all boxes (with item counts)
// @route   GET /api/boxes
// @access  Public
const getBoxes = async (req, res) => {
  try {
    const boxes = await Box.aggregate([
      // Lookup items in this box
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: 'boxId',
          as: 'items'
        }
      },
      // Lookup the location for this box
      {
        $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'locationPopulated'
        }
      },
      {
        $addFields: {
          itemCount: { $size: '$items' },
          locationPopulated: { $arrayElemAt: ['$locationPopulated', 0] }
        }
      },
      {
        $project: {
          items: 0,
          'locationPopulated.data': 0,
          'locationPopulated.createdAt': 0,
          'locationPopulated.updatedAt': 0
        }
      }
    ]);

    // Add displayLabel to each box for frontend convenience (from the Location entity)
    const boxesWithLabels = boxes.map(box => {
      const loc = box.locationPopulated;
      return {
        ...box,
        locationDisplayLabel: loc && loc.name
          ? (loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name)
          : null
      };
    });

    res.status(200).json({
      success: true,
      count: boxes.length,
      data: boxesWithLabels
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Get box by ID (with items)
// @route   GET /api/boxes/:id
// @access  Public
const getBoxById = async (req, res) => {
  try {
    const box = await Box.findById(req.params.id);

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    // Get items for this box
    const items = await Item.find({ boxId: req.params.id });

    res.status(200).json({
      success: true,
      data: {
        ...box.toObject(),
        items
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Get items for a specific box
// @route   GET /api/boxes/:id/items
// @access  Public
const getBoxItems = async (req, res) => {
  try {
    const box = await Box.findById(req.params.id);

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    const items = await Item.find({ boxId: req.params.id });

    res.status(200).json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Update a box
// @route   PUT /api/boxes/:id
// @access  Public
const updateBox = async (req, res) => {
  try {
    const { boxId, locationId } = req.body;

    let box = await Box.findById(req.params.id);

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    // Check for duplicate boxId if changing. Normalize to the canonical form
    // (trimmed + uppercase); an unchanged ID is never flagged as a duplicate
    // of itself because existing values are already stored in this form.
    const newBoxId = boxId !== undefined ? normalizeBoxId(boxId) : (box.boxId || '');
    if (newBoxId && newBoxId !== box.boxId) {
      const existing = await Box.findOne({ boxId: newBoxId, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Box with this ID already exists'
        });
      }
    }

    box.boxId = newBoxId || undefined;
    if (locationId !== undefined) {
      box.locationId = locationId || null;
    }

    box = await box.save();

    res.status(200).json({
      success: true,
      data: box
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Delete a box
// @route   DELETE /api/boxes/:id
// @access  Public
const deleteBox = async (req, res) => {
  try {
    const box = await Box.findById(req.params.id);

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    // Check if box has items
    const itemCount = await Item.countDocuments({ boxId: req.params.id });
    if (itemCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete box with ${itemCount} item(s). Remove or reassign items first.`
      });
    }

    await Box.findByIdAndDelete(req.params.id);

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
  createBox,
  getBoxes,
  getBoxById,
  getBoxItems,
  updateBox,
  deleteBox
};
