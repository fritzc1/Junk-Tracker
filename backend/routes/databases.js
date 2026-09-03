const express = require('express');
const router = express.Router();
const { getDatabases, createDatabase, renameDatabase, deleteDatabase, reorderDatabases } = require('../controllers/databaseController');

// @route   GET /api/databases
// @desc    List all databases with item counts
router.get('/', getDatabases);

// @route   POST /api/databases
// @desc    Create a new database
router.post('/', createDatabase);

// @route   PUT /api/databases/reorder
// @desc    Reorder databases (full ordered ID list in the body)
// NOTE: must be registered before "/:id" so "reorder" is not treated as an ID.
router.put('/reorder', reorderDatabases);

// @route   PUT /api/databases/:id
// @desc    Rename a database
router.put('/:id', renameDatabase);

// @route   DELETE /api/databases/:id
// @desc    Delete a database and all of its data
router.delete('/:id', deleteDatabase);

module.exports = router;
