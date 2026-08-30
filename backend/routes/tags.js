const express = require('express');
const router = express.Router();
const { createTag, getTags, searchTags, updateTag, deleteTag } = require('../controllers/tagController');

// Search must come before /:id to avoid conflict
router.get('/search', searchTags);
router.get('/', getTags);
router.post('/', createTag);
router.put('/:id', updateTag);
router.delete('/:id', deleteTag);

module.exports = router;
