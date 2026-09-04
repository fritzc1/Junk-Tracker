const mongoose = require('mongoose');
const Box = require('../models/Box');
const Item = require('../models/Item');
const Tag = require('../models/Tag');
const { normalizeBoxId } = require('../utils/boxId');

// Resolve tag names to IDs, auto-creating any missing tags (scoped to the
// active database). Mirrors the item controller's tag handling so boxes and
// items share one tag namespace. Returns [] for empty/invalid input.
const resolveTagNames = async (tagNames, databaseId) => {
  if (!Array.isArray(tagNames)) return [];
  const tagIds = [];
  for (const tagName of tagNames) {
    if (!tagName || !String(tagName).trim()) continue;
    const name = String(tagName).trim().toLowerCase();
    let existingTag = await Tag.findOne({ name, databaseId });
    if (!existingTag) {
      existingTag = await Tag.create({ name, databaseId });
    }
    tagIds.push(existingTag._id);
  }
  return tagIds;
};

// @desc    Create a new box
// @route   POST /api/boxes
// @access  Public
const createBox = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { boxId, locationId, tagNames } = req.body;

    // Normalize to the canonical stored form (trimmed + uppercase) so identity
    // is case-insensitive: "a06" and "A06" are the same box.
    const normalizedBoxId = normalizeBoxId(boxId);

    // Check for duplicate boxId if provided (within this database)
    if (normalizedBoxId) {
      const existing = await Box.findOne({ boxId: normalizedBoxId, databaseId });
      if (existing) {
        console.log(`[Box] Duplicate rejected: "${normalizedBoxId}"`);
        return res.status(400).json({
          success: false,
          error: 'A box with this ID already exists.'
        });
      }
    }

    const box = await Box.create({
      databaseId,
      boxId: normalizedBoxId || undefined,
      locationId: locationId || null,
      tags: await resolveTagNames(tagNames, databaseId)
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
      // Scope to the active database
      { $match: { databaseId: new mongoose.Types.ObjectId(req.databaseId) } },
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
      // Lookup tags (name only — enough for chips, search, and filtering)
      {
        $lookup: {
          from: 'tags',
          localField: 'tags',
          foreignField: '_id',
          as: 'tagsPopulated'
        }
      },
      {
        $addFields: {
          itemCount: { $size: '$items' },
          locationPopulated: { $arrayElemAt: ['$locationPopulated', 0] },
          // Replace the raw tags ObjectId array with populated {_id, name}
          // objects (frontend renders chips and filters by tag from this field).
          tags: {
            $map: {
              input: '$tagsPopulated',
              as: 'tag',
              in: { _id: '$$tag._id', name: '$$tag.name' }
            }
          }
        }
      },
      {
        $project: {
          items: 0,
          tagsPopulated: 0,
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
    // Populate tags so the edit form can prefill the TagSelector with names.
    const box = await Box.findOne({ _id: req.params.id, databaseId: req.databaseId })
      .populate('tags', 'name');

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    // Get items for this box (scoped to the active database)
    const items = await Item.find({ boxId: req.params.id, databaseId: req.databaseId });

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
    const box = await Box.findOne({ _id: req.params.id, databaseId: req.databaseId });

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    const items = await Item.find({ boxId: req.params.id, databaseId: req.databaseId });

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
    const databaseId = req.databaseId;
    const { boxId, locationId, tagNames } = req.body;

    let box = await Box.findOne({ _id: req.params.id, databaseId });

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
      const existing = await Box.findOne({ boxId: newBoxId, databaseId, _id: { $ne: req.params.id } });
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

    // Handle tags from names (auto-create missing ones). Only applied when the
    // field is present so a partial update never wipes existing tags.
    if (tagNames && Array.isArray(tagNames)) {
      box.tags = await resolveTagNames(tagNames, databaseId);
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
    const databaseId = req.databaseId;
    const box = await Box.findOne({ _id: req.params.id, databaseId });

    if (!box) {
      return res.status(404).json({
        success: false,
        error: 'Box not found'
      });
    }

    // Check if box has items (scoped to the active database)
    const itemCount = await Item.countDocuments({ boxId: req.params.id, databaseId });
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
