const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  searchItems,
  exportCsv,
  exportXlsx
} = require('../controllers/itemController');

// Configure multer for file uploads (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// @route   GET /api/items/export
// @desc    Export items to CSV
router.get('/export', exportCsv);

// @route   GET /api/items/export/xlsx
// @desc    Export items to Excel
router.get('/export/xlsx', exportXlsx);

// Normalize parsed records so their keys are trimmed of stray whitespace
// (some CSV/Excel sources carry padded headers)
const normalizeRecords = (records) => {
  if (!Array.isArray(records)) return records;
  return records.map(record => {
    const normalized = {};
    Object.entries(record).forEach(([key, value]) => {
      normalized[String(key).trim()] = value;
    });
    return normalized;
  });
};

// Auto-detection candidates for the fixed import targets (used when the user
// does not explicitly map a column in the mapping dialog).
const LOCATION_CANDIDATES = ['Location'];
const SUB_LOCATION_CANDIDATES = ['Sub-Location / Shelf Number', 'Sub-Location', 'Shelf Number'];
const BOX_ID_CANDIDATES = ['Box ID', 'Box Id', 'box id'];
const DESCRIPTION_CANDIDATES = ['Item Description', 'Description', 'Contents List', 'Contents', 'Items'];

// @route   POST /api/items/import/preview
// @desc    Preview file columns without importing (for column mapping UI)
router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { parse } = require('csv-parse/sync');
    let records;

    if (req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls')) {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(ws);
    } else {
      const csvData = req.file.buffer.toString('utf-8');
      records = parse(csvData, { columns: true, skip_empty_lines: true });
    }

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'No records found in file' });
    }

    records = normalizeRecords(records);
    const columnHeaders = Object.keys(records[0]);

    // Suggest auto-detected mappings for the four fixed targets
    const findCandidate = (candidates) => {
      for (const candidate of candidates) {
        if (columnHeaders.includes(candidate)) return candidate;
      }
      return null;
    };

    res.status(200).json({
      success: true,
      columns: columnHeaders,
      rowCount: records.length,
      suggestedMapping: {
        locationColumn: findCandidate(LOCATION_CANDIDATES),
        subLocationColumn: findCandidate(SUB_LOCATION_CANDIDATES),
        boxIdColumn: findCandidate(BOX_ID_CANDIDATES),
        descriptionColumn: findCandidate(DESCRIPTION_CANDIDATES)
      }
    });
  } catch (error) {
    console.error('[IMPORT PREVIEW] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error: ' + error.message });
  }
});

// @route   POST /api/items/import
// @desc    Import items from CSV or Excel file (with column mapping to fixed targets)
router.post('/import', upload.single('file'), async (req, res) => {
  // Parse mapping from FormData (sent as JSON string by frontend)
  if (typeof req.body.mapping === 'string') {
    try {
      req.body.mapping = JSON.parse(req.body.mapping);
    } catch (e) {
      req.body.mapping = {};
    }
  }

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const Box = require('../models/Box');
    const Item = require('../models/Item');
    const Location = require('../models/Location');
    const { parse } = require('csv-parse/sync');
    let records;

    // Detect file type and parse accordingly
    if (req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls')) {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(ws);
    } else {
      const csvData = req.file.buffer.toString('utf-8');
      records = parse(csvData, { columns: true, skip_empty_lines: true });
    }

    records = normalizeRecords(records);

    console.log('[IMPORT] File:', req.file.originalname);
    console.log('[IMPORT] Total records parsed:', records.length);

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No records found in file'
      });
    }

    const columnHeaders = Object.keys(records[0]);
    console.log('[IMPORT] Columns to process:', columnHeaders);

    // Resolve the four fixed target columns (user mapping takes priority, then auto-detect)
    const mapping = req.body.mapping || {};
    const findCandidate = (candidates) => {
      for (const candidate of candidates) {
        if (columnHeaders.includes(candidate)) return candidate;
      }
      return null;
    };

    const locationColumnName = mapping.locationColumn || findCandidate(LOCATION_CANDIDATES);
    const subLocationColumnName = mapping.subLocationColumn || findCandidate(SUB_LOCATION_CANDIDATES);
    const boxIdColumnName = mapping.boxIdColumn || findCandidate(BOX_ID_CANDIDATES);
    const descriptionColumnName = mapping.descriptionColumn || findCandidate(DESCRIPTION_CANDIDATES);

    console.log('[IMPORT] Mapped columns:', {
      location: locationColumnName,
      subLocation: subLocationColumnName,
      boxId: boxIdColumnName,
      description: descriptionColumnName
    });

    // --- Create/update Locations from the location + sub-location columns ---
    const locationMap = new Map(); // Maps "name|subLoc" -> Location _id

    if (locationColumnName) {
      for (const record of records) {
        const locName = String(record[locationColumnName] || '').trim();
        const subLoc = subLocationColumnName
          ? String(record[subLocationColumnName] || '').trim()
          : '';
        if (!locName) continue;

        const key = `${locName}|${subLoc}`;
        if (locationMap.has(key)) continue;

        // Upsert: match on name first, then composite (name + subLocation)
        let loc = await Location.findOne({ name: locName });
        if (loc && (!subLoc || loc.subLocation === subLoc)) {
          locationMap.set(key, loc._id);
        } else if (loc) {
          const exact = await Location.findOne({ name: locName, subLocation: subLoc });
          if (exact) {
            locationMap.set(key, exact._id);
          } else {
            const newLoc = await Location.create({ name: locName, subLocation: subLoc });
            locationMap.set(key, newLoc._id);
            console.log(`[IMPORT] Created location: "${locName}"${subLoc ? ` — ${subLoc}` : ''}`);
          }
        } else {
          const newLoc = await Location.create({ name: locName, subLocation: subLoc });
          locationMap.set(key, newLoc._id);
          console.log(`[IMPORT] Created location: "${locName}"${subLoc ? ` — ${subLoc}` : ''}`);
        }
      }
    }

    // --- Create/update Boxes from the box ID column (with their location) ---
    const boxKeyMap = new Map(); // Maps boxId string -> Box _id

    if (boxIdColumnName) {
      for (const record of records) {
        const boxIdValue = String(record[boxIdColumnName] || '').trim();
        if (!boxIdValue) continue;
        if (boxKeyMap.has(boxIdValue)) continue;

        // Determine location for this box using composite key (name + subLocation)
        let locId = null;
        if (locationColumnName && record[locationColumnName]) {
          const locName = String(record[locationColumnName]).trim();
          const subLoc = subLocationColumnName
            ? String(record[subLocationColumnName] || '').trim()
            : '';
          const key = `${locName}|${subLoc}`;
          if (locationMap.has(key)) {
            locId = locationMap.get(key);
          }
        }

        let existingBox = await Box.findOne({ boxId: boxIdValue });
        if (existingBox) {
          if (locId) existingBox.locationId = locId;
          await existingBox.save();
          boxKeyMap.set(boxIdValue, existingBox._id);
          console.log(`[IMPORT] Updated existing box: ${boxIdValue}`);
        } else {
          const newBox = await Box.create({
            locationId: locId,
            boxId: boxIdValue
          });
          boxKeyMap.set(boxIdValue, newBox._id);
          console.log(`[IMPORT] Created new box: ${boxIdValue} -> ${newBox._id}`);
        }
      }
    }

    // --- Map each record to an item (description + box ref or direct location) ---
    const itemsToCreate = [];
    for (const record of records) {
      const description = descriptionColumnName
        ? String(record[descriptionColumnName] || '').trim()
        : '';

      let boxIdRef = null;
      if (boxIdColumnName) {
        const boxIdValue = String(record[boxIdColumnName] || '').trim();
        if (boxIdValue && boxKeyMap.has(boxIdValue)) {
          boxIdRef = boxKeyMap.get(boxIdValue);
        }
      }

      // Direct location reference for unboxed records only (XOR rule)
      let locationIdRef = null;
      if (!boxIdRef && locationColumnName) {
        const locName = String(record[locationColumnName] || '').trim();
        if (locName) {
          const subLoc = subLocationColumnName
            ? String(record[subLocationColumnName] || '').trim()
            : '';
          const key = `${locName}|${subLoc}`;
          if (locationMap.has(key)) {
            locationIdRef = locationMap.get(key);
          } else {
            // Location entity wasn't pre-created — create it now
            const newLoc = await Location.create({ name: locName, subLocation: subLoc });
            locationMap.set(key, newLoc._id);
            locationIdRef = newLoc._id;
          }
        }
      }

      itemsToCreate.push({
        description,
        boxId: boxIdRef,
        locationId: locationIdRef
      });
    }

    console.log('[IMPORT] Boxes created/updated:', boxKeyMap.size);
    console.log('[IMPORT] Items to create:', itemsToCreate.length);

    if (itemsToCreate.length > 0) {
      await Item.insertMany(itemsToCreate);
    }

    res.status(200).json({
      success: true,
      boxesProcessed: boxKeyMap.size,
      count: itemsToCreate.length,
      data: {}
    });
  } catch (error) {
    console.error('[IMPORT] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server Error: ' + error.message
    });
  }
});

// @route   GET /api/items
// @desc    Get all items
router.get('/', getItems);

// @route   GET /api/items/:id
// @desc    Get single item by ID
router.get('/:id', getItemById);

// @route   POST /api/items
// @desc    Create a new item
router.post('/', createItem);

// @route   PUT /api/items/:id
// @desc    Update an item
router.put('/:id', updateItem);

// @route   DELETE /api/items/:id
// @desc    Delete an item
router.delete('/:id', deleteItem);

// @route   GET /api/items/search/:query
// @desc    Search items
router.get('/search/:query', searchItems);

module.exports = router;
