const express = require('express');
const router = express.Router();
const { getDatabases, createDatabase, renameDatabase, deleteDatabase } = require('../controllers/databaseController');

// @route   GET /api/databases
// @desc    List all databases with item counts
router.get('/', getDatabases);

// @route   POST /api/databases
// @desc    Create a new database
router.post('/', createDatabase);

// @route   PUT /api/databases/:id
// @desc    Rename a database
router.put('/:id', renameDatabase);

// @route   DELETE /api/databases/:id
// @desc    Delete a database and all of its data
router.delete('/:id', deleteDatabase);

module.exports = router;
