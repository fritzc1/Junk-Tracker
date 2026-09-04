const express = require('express');
const router = express.Router();
const {
  getContainers,
  createContainer,
  updateContainer,
  deleteContainer,
  getContainerById
} = require('../controllers/containerController');

// Stage 2 of plans/container-tree-and-attributes-plan.md: unified container API.
// All routes are scoped to the active logical database (requireDatabase is
// applied where this router is mounted in server.js). The old /api/locations and
// /api/boxes routers stay mounted until Stage 7 so the not-yet-updated frontend
// keeps working mid-migration.

// @route   GET /api/containers
// @desc    Flat list of all containers with computed displayPath + counts
router.get('/', getContainers);

// @route   POST /api/containers
// @desc    Create a container (kind location|box)
router.post('/', createContainer);

// @route   PUT /api/containers/:id
// @desc    Rename and/or move a container (cycle-safe)
router.put('/:id', updateContainer);

// @route   DELETE /api/containers/:id
// @desc    Delete a container (blocked while it has children or direct items)
router.delete('/:id', deleteContainer);

// @route   GET /api/containers/:id
// @desc    Single container + its subtree + direct items
router.get('/:id', getContainerById);

module.exports = router;
