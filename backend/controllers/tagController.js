const mongoose = require('mongoose');
const Tag = require('../models/Tag');
const Item = require('../models/Item');

// @desc    Create a new tag
// @route   POST /api/tags
// @access  Public
const createTag = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Tag name is required' });
    }

    // Case-insensitive check for existing tag (within this database)
    const existing = await Tag.findOne({ databaseId, name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Tag already exists' });
    }

    const tag = await Tag.create({ databaseId, name: name.trim().toLowerCase() });
    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get all tags with item counts
// @route   GET /api/tags
// @access  Public
const getTags = async (req, res) => {
  try {
    // Scoped to the active database
    const tags = await Tag.aggregate([
      { $match: { databaseId: new mongoose.Types.ObjectId(req.databaseId) } },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: 'tags',
          as: 'taggedItems'
        }
      },
      {
        $addFields: { itemCount: { $size: '$taggedItems' } }
      },
      {
        $project: { taggedItems: 0 }
      },
      { $sort: { name: 1 } }
    ]);

    res.status(200).json({ success: true, count: tags.length, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Search tags for autocomplete
// @route   GET /api/tags/search?q=...
// @access  Public
const searchTags = async (req, res) => {
  try {
    const query = req.query.q || '';

    if (!query.trim()) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Case-insensitive fuzzy search with item counts (scoped to the active database)
    const tags = await Tag.aggregate([
      { $match: { databaseId: new mongoose.Types.ObjectId(req.databaseId), name: { $regex: query.toLowerCase(), $options: 'i' } } },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: 'tags',
          as: 'taggedItems'
        }
      },
      { $addFields: { itemCount: { $size: '$taggedItems' } } },
      { $project: { taggedItems: 0 } },
      { $sort: { name: 1 } },
      { $limit: 20 }
    ]);

    res.status(200).json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update a tag (rename)
// @route   PUT /api/tags/:id
// @access  Public
const updateTag = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { name } = req.body;
    let tag = await Tag.findOne({ _id: req.params.id, databaseId });

    if (!tag) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    if (name && name.trim()) {
      const existing = await Tag.findOne({
        databaseId,
        name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Tag already exists' });
      }
      tag.name = name.trim().toLowerCase();
    }

    tag = await tag.save();
    res.status(200).json({ success: true, data: tag });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Delete a tag and remove from all items
// @route   DELETE /api/tags/:id
// @access  Public
const deleteTag = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const tag = await Tag.findOne({ _id: req.params.id, databaseId });
    if (!tag) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    // Remove this tag from all items in the active database
    await Item.updateMany(
      { tags: req.params.id, databaseId },
      { $pull: { tags: req.params.id } }
    );

    await Tag.findOneAndDelete({ _id: req.params.id, databaseId });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

module.exports = { createTag, getTags, searchTags, updateTag, deleteTag };
