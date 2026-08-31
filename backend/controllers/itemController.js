const Item = require('../models/Item');
const Box = require('../models/Box');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');

// Helper: resolve the Location entity for an item (via box, or direct reference)
const resolveLocationEntity = (item) => {
  const locViaBox = item.boxId?.locationId;
  if (locViaBox && typeof locViaBox === 'object' && locViaBox.name !== undefined) {
    return locViaBox;
  }
  const directLoc = item.locationId;
  if (directLoc && typeof directLoc === 'object' && directLoc.name !== undefined) {
    return directLoc;
  }
  return null;
};

// Helper: resolved location parts for an item
const resolveLocationParts = (item) => {
  const loc = resolveLocationEntity(item);
  if (!loc) return { name: '', subLocation: '' };
  return {
    name: String(loc.name || ''),
    subLocation: String(loc.subLocation || '')
  };
};

// Helper: resolved box ID string for an item (boxed items only)
const resolveBoxId = (item) => {
  if (!item.boxId || typeof item.boxId !== 'object') return '';
  return String(item.boxId.boxId || '');
};

// @desc    Create a new item
// @route   POST /api/items
// @access  Public
const createItem = async (req, res) => {
  try {
    const Tag = require('../models/Tag');
    const { description, boxId, locationId, tagNames } = req.body;

    // Auto-create tags from names if provided as strings
    let tagIds = [];
    if (tagNames && Array.isArray(tagNames)) {
      for (const tagName of tagNames) {
        if (!tagName || !String(tagName).trim()) continue;
        const name = String(tagName).trim().toLowerCase();
        let existingTag = await Tag.findOne({ name });
        if (!existingTag) {
          existingTag = await Tag.create({ name });
        }
        tagIds.push(existingTag._id);
      }
    }

    // XOR: box and direct location are mutually exclusive
    const hasBox = !!(boxId && String(boxId).trim());
    const hasLocation = !!(locationId && String(locationId).trim());

    const item = await Item.create({
      description: (description || '').toString().trim(),
      boxId: hasBox ? boxId : null,
      locationId: hasLocation ? locationId : null,
      tags: tagIds
    });

    res.status(201).json({
      success: true,
      data: item
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get all items
// @route   GET /api/items
// @access  Public
const getItems = async (req, res) => {
  try {
    // Build query filter
    const filter = {};
    if (req.query.boxId) {
      filter.boxId = req.query.boxId;
    }
    if (req.query.locationId) {
      filter.locationId = req.query.locationId;
    }
    if (req.query.tagId) {
      filter.tags = req.query.tagId;
    }

    let query = Item.find(filter);

    // Populate box (with its location), direct location, and tags
    query = query.populate({
      path: 'boxId',
      select: 'boxId locationId',
      populate: { path: 'locationId', select: 'name subLocation displayLabel' }
    });
    query = query.populate('tags', 'name');
    query = query.populate('locationId', 'name subLocation displayLabel');

    const items = await query;

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

// @desc    Get item by ID
// @route   GET /api/items/:id
// @access  Public
const getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate({
        path: 'boxId',
        select: 'boxId locationId',
        populate: { path: 'locationId', select: 'name subLocation displayLabel' }
      })
      .populate('tags', 'name')
      .populate('locationId', 'name subLocation displayLabel');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Update an item
// @route   PUT /api/items/:id
// @access  Public
const updateItem = async (req, res) => {
  try {
    const Tag = require('../models/Tag');
    const { description, boxId, locationId, tagNames } = req.body;

    let item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    // Handle description
    if (description !== undefined) {
      item.description = String(description).trim();
    }

    // Handle boxId changes (XOR with locationId)
    if (boxId !== undefined) {
      const newBoxId = boxId || null;
      item.boxId = newBoxId;
      // XOR: setting a box clears direct location reference
      if (newBoxId) {
        item.locationId = null;
      }
    }

    // Handle locationId changes (XOR with boxId)
    if (locationId !== undefined) {
      const newLocationId = locationId || null;
      item.locationId = newLocationId;
      // XOR: setting a direct location clears box reference
      if (newLocationId) {
        item.boxId = null;
      }
    }

    // Handle tags from names (auto-create missing ones)
    if (tagNames && Array.isArray(tagNames)) {
      const tagIds = [];
      for (const tagName of tagNames) {
        if (!tagName || !String(tagName).trim()) continue;
        const name = String(tagName).trim().toLowerCase();
        let existingTag = await Tag.findOne({ name });
        if (!existingTag) {
          existingTag = await Tag.create({ name });
        }
        tagIds.push(existingTag._id);
      }
      item.tags = tagIds;
    }

    item = await item.save();

    res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Delete an item
// @route   DELETE /api/items/:id
// @access  Public
const deleteItem = async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

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

// Helper: build a fixed-column row for an item (used by CSV and Excel export)
const buildExportRow = (item) => {
  const { name, subLocation } = resolveLocationParts(item);
  return {
    'Location': name,
    'Sub-Location': subLocation,
    'Item Description': String(item.description || ''),
    'Box ID': resolveBoxId(item),
    'Tags': (item.tags || []).map(t => t.name).join(', '),
    // ISO 8601 so the import parser can round-trip dates deterministically
    'Created': item.createdAt ? new Date(item.createdAt).toISOString() : '',
    'Last Modified': item.updatedAt ? new Date(item.updatedAt).toISOString() : ''
  };
};

// @desc    Export items to CSV
// @route   GET /api/items/export
// @access  Public
const exportCsv = async (req, res) => {
  try {
    const items = await Item.find()
      .populate({
        path: 'boxId',
        select: 'boxId locationId',
        populate: { path: 'locationId', select: 'name subLocation' }
      })
      .populate('tags', 'name')
      .populate('locationId', 'name subLocation');

    const csvData = items.map(buildExportRow);
    const csv = stringify(csvData, { header: true });

    res.setHeader('Content-Disposition', 'attachment; filename=items.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Export items to Excel
// @route   GET /api/items/export/xlsx
// @access  Public
const exportXlsx = async (req, res) => {
  try {
    const items = await Item.find()
      .populate({
        path: 'boxId',
        select: 'boxId locationId',
        populate: { path: 'locationId', select: 'name subLocation' }
      })
      .populate('tags', 'name')
      .populate('locationId', 'name subLocation');

    const excelData = items.map(buildExportRow);

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Items');

    // Generate Excel file buffer
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename=items.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.status(200).send(buf);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// @desc    Search items across description, tags, resolved location and box values
// @route   GET /api/items/search/:query
// @access  Public
const searchItems = async (req, res) => {
  try {
    const query = req.params.query;

    // Fast path: match on the item's own description field in Mongo
    let items = await Item.find({
      description: { $regex: query, $options: 'i' }
    })
      .populate({
        path: 'boxId',
        select: 'boxId locationId',
        populate: { path: 'locationId', select: 'name subLocation displayLabel' }
      })
      .populate('tags', 'name')
      .populate('locationId', 'name subLocation displayLabel');

    // Also match items whose tags, resolved box ID or location contain the query
    const allItems = await Item.find()
      .populate({
        path: 'boxId',
        select: 'boxId locationId',
        populate: { path: 'locationId', select: 'name subLocation displayLabel' }
      })
      .populate('tags', 'name')
      .populate('locationId', 'name subLocation displayLabel');

    const matchedIds = new Set(items.map(i => i._id.toString()));
    for (const item of allItems) {
      if (matchedIds.has(item._id.toString())) continue;
      const tagNames = (item.tags || []).map(t => t.name).join(' ');
      const boxIdStr = resolveBoxId(item);
      const { name, subLocation } = resolveLocationParts(item);
      const haystack = [tagNames, boxIdStr, name, subLocation].join(' ').toLowerCase();
      if (haystack.includes(query.toLowerCase())) {
        matchedIds.add(item._id.toString());
        items.push(item);
      }
    }

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

module.exports = {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  searchItems,
  exportCsv,
  exportXlsx
};
