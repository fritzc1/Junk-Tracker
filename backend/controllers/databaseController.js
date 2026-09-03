const mongoose = require('mongoose');
const Database = require('../models/Database');
const Item = require('../models/Item');
const Box = require('../models/Box');
const Location = require('../models/Location');
const Tag = require('../models/Tag');

// Case-insensitive name check (mirrors the tag controller's escaping approach)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    List all databases with per-database item counts
// @route   GET /api/databases
// @access  Public
const getDatabases = async (req, res) => {
  try {
    // Manual order first; createdAt breaks ties for any documents that still
    // lack an explicit order value (pre-migration edge case).
    const databases = await Database.find().sort({ order: 1, createdAt: 1 });

    // One grouped count query across all items; map by databaseId.
    const counts = await Item.aggregate([
      { $group: { _id: '$databaseId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map(c => [String(c._id), c.count]));

    res.status(200).json({
      success: true,
      data: databases.map(db => ({
        ...db.toObject(),
        itemCount: countMap.get(String(db._id)) || 0
      }))
    });
  } catch (error) {
    console.error('[Database] Error listing databases:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create a new database
// @route   POST /api/databases
// @access  Public
const createDatabase = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Database name is required' });
    }

    const existing = await Database.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A database with this name already exists.' });
    }

    // New databases append at the end of the list.
    const top = await Database.aggregate([
      { $group: { _id: null, maxOrder: { $max: '$order' } } }
    ]);
    const order = (top[0]?.maxOrder ?? -1) + 1;

    const db = await Database.create({ name, order });
    console.log(`[Database] Created: "${db.name}"`);
    res.status(201).json({ success: true, data: { ...db.toObject(), itemCount: 0 } });
  } catch (error) {
    console.error('[Database] Error creating database:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A database with this name already exists.' });
    }
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Rename a database
// @route   PUT /api/databases/:id
// @access  Public
const renameDatabase = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Database name is required' });
    }

    let db = await Database.findById(req.params.id);
    if (!db) {
      return res.status(404).json({ success: false, error: 'Database not found' });
    }

    const existing = await Database.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      _id: { $ne: req.params.id }
    });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A database with this name already exists.' });
    }

    db.name = name;
    db.updatedAt = Date.now();
    db = await db.save();
    console.log(`[Database] Renamed to: "${db.name}"`);
    res.status(200).json({ success: true, data: db });
  } catch (error) {
    console.error('[Database] Error renaming database:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'A database with this name already exists.' });
    }
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete a database and ALL of its data (items, boxes, locations, tags)
// @route   DELETE /api/databases/:id
// @access  Public
const deleteDatabase = async (req, res) => {
  try {
    const db = await Database.findById(req.params.id);
    if (!db) {
      return res.status(404).json({ success: false, error: 'Database not found' });
    }

    // Never allow deleting the last remaining database — there must always be
    // at least one to hold data.
    const total = await Database.countDocuments();
    if (total <= 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the only remaining database.' });
    }

    const dbId = String(db._id);

    // Collect tag IDs belonging to this database so we can strip them from any
    // items in OTHER databases that reference them (tags are per-database).
    const ownTagIds = await Tag.find({ databaseId: db._id }).distinct('_id');

    // Wipe all data for this database.
    await Promise.all([
      Item.deleteMany({ databaseId: db._id }),
      Box.deleteMany({ databaseId: db._id }),
      Location.deleteMany({ databaseId: db._id }),
      Tag.deleteMany({ databaseId: db._id })
    ]);

    // Defensive cleanup: remove this database's tag IDs from items in other
    // databases (should not normally happen, but keeps references consistent).
    if (ownTagIds.length > 0) {
      await Item.updateMany(
        { databaseId: { $ne: db._id }, tags: { $in: ownTagIds } },
        { $pull: { tags: { $in: ownTagIds } } }
      );
    }

    await Database.findByIdAndDelete(db._id);
    console.log(`[Database] Deleted: "${db.name}"`);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('[Database] Error deleting database:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Reorder databases — body must contain the FULL list of database IDs
//          in the desired display order; all rows are renumbered 0..n-1.
// @route   PUT /api/databases/reorder
// @access  Public
const reorderDatabases = async (req, res) => {
  try {
    const orderedIds = req.body?.orderedIds;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array of database IDs' });
    }

    // Validate the payload is exactly the current set of databases (no missing,
    // extra, or unknown IDs) before writing anything.
    const existing = await Database.find().select('_id');
    const existingIds = new Set(existing.map(db => String(db._id)));
    if (orderedIds.length !== existingIds.size || orderedIds.some(id => !existingIds.has(String(id)))) {
      return res.status(400).json({ success: false, error: 'Reorder list does not match the current databases' });
    }

    // Renumber in one bulk write; each update targets a single document by _id.
    const updates = orderedIds.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index, updatedAt: new Date() } } }
    }));
    await Database.bulkWrite(updates);

    console.log(`[Database] Reordered ${orderedIds.length} database(s)`);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('[Database] Error reordering databases:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

module.exports = { getDatabases, createDatabase, renameDatabase, deleteDatabase, reorderDatabases };
