const express = require('express');
const router = express.Router();
const { getAttributes, createAttribute, updateAttribute, addValues, removeValues, deleteAttribute } = require('../controllers/attributeController');

// Stage 4: attribute dimensions (per active database via requireDatabase).
router.get('/', getAttributes);
router.post('/', createAttribute);
router.put('/:id', updateAttribute);
router.post('/:id/values', addValues);
router.delete('/:id/values', removeValues);
router.delete('/:id', deleteAttribute);

module.exports = router;
