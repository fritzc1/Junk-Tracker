const express = require('express');
const router = express.Router();
const { getAttributeSets, createAttributeSet, updateAttributeSet, deleteAttributeSet } = require('../controllers/attributeSetController');

// Stage 6: attribute sets (type-scoped attribute profiles), per active database
// via requireDatabase. Items store only the set id — renaming a set touches no
// item data; deletion is blocked while items reference it (count returned).
router.get('/', getAttributeSets);
router.post('/', createAttributeSet);
router.put('/:id', updateAttributeSet);
router.delete('/:id', deleteAttributeSet);

module.exports = router;
