const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { normalizeBoxId } = require('../utils/boxId');
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
const TAGS_CANDIDATES = ['Tags', 'Tag'];
const CREATED_CANDIDATES = ['Created', 'Date Created', 'Creation Date'];
const MODIFIED_CANDIDATES = ['Last Modified', 'Modified', 'Updated'];

// Lenient date parser for imported values. Handles Excel numeric serials,
// Date instances, ISO 8601 strings and common US formats (M/D/YYYY[ HH:MM[:SS][ AM/PM]]).
// Returns null when the value is empty or unparseable so callers can fall back to defaults.
const parseImportDate = (value) => {
  if (value === undefined || value === null) return null;

  // Excel numeric serial date (days since 1899-12-30)
  if (typeof value === 'number' && isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms);
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();
  if (!str) return null;

  // ISO 8601 or other formats JS can parse directly
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // US format: M/D/YYYY[ HH:MM[:SS][ AM/PM]]
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?)?$/);
  if (m) {
    let hour = m[4] !== undefined ? parseInt(m[4], 10) : 0;
    const minute = m[5] !== undefined ? parseInt(m[5], 10) : 0;
    const second = m[6] !== undefined ? parseInt(m[6], 10) : 0;
    if (m[7]) {
      const isPM = m[7].toLowerCase().startsWith('p');
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }
    d = new Date(Date.UTC(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10), hour, minute, second));
    if (!isNaN(d.getTime())) return d;
  }

  return null;
};

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
        descriptionColumn: findCandidate(DESCRIPTION_CANDIDATES),
        tagsColumn: findCandidate(TAGS_CANDIDATES),
        createdColumn: findCandidate(CREATED_CANDIDATES),
        modifiedColumn: findCandidate(MODIFIED_CANDIDATES)
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

    // All imported data belongs to the active database (X-Database-Id header)
    const databaseId = req.databaseId;

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
    const tagsColumnName = mapping.tagsColumn || findCandidate(TAGS_CANDIDATES);
    const createdColumnName = mapping.createdColumn || findCandidate(CREATED_CANDIDATES);
    const modifiedColumnName = mapping.modifiedColumn || findCandidate(MODIFIED_CANDIDATES);

    console.log('[IMPORT] Mapped columns:', {
      location: locationColumnName,
      subLocation: subLocationColumnName,
      boxId: boxIdColumnName,
      description: descriptionColumnName,
      tags: tagsColumnName,
      created: createdColumnName,
      modified: modifiedColumnName
    });

    // --- Upsert Tags from the tags column (comma-separated names) ---
    const Tag = require('../models/Tag');
    const tagIdMap = new Map(); // Maps normalized tag name -> Tag _id

    if (tagsColumnName) {
      for (const record of records) {
        const rawTags = String(record[tagsColumnName] || '');
        for (const part of rawTags.split(',')) {
          const name = part.trim().toLowerCase();
          if (!name || tagIdMap.has(name)) continue;

          let tag = await Tag.findOne({ name, databaseId });
          if (!tag) {
            try {
              tag = await Tag.create({ name, databaseId });
              console.log(`[IMPORT] Created tag: "${name}"`);
            } catch (e) {
              // Likely a race on the unique index — re-fetch
              tag = await Tag.findOne({ name, databaseId });
            }
          }
          if (tag) tagIdMap.set(name, tag._id);
        }
      }
    }

    console.log('[IMPORT] Tags resolved:', tagIdMap.size);

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

        // Upsert (scoped to the active database): match on name first, then composite
        let loc = await Location.findOne({ name: locName, databaseId });
        if (loc && (!subLoc || loc.subLocation === subLoc)) {
          locationMap.set(key, loc._id);
        } else if (loc) {
          const exact = await Location.findOne({ name: locName, subLocation: subLoc, databaseId });
          if (exact) {
            locationMap.set(key, exact._id);
          } else {
            const newLoc = await Location.create({ databaseId, name: locName, subLocation: subLoc });
            locationMap.set(key, newLoc._id);
            console.log(`[IMPORT] Created location: "${locName}"${subLoc ? ` — ${subLoc}` : ''}`);
          }
        } else {
          const newLoc = await Location.create({ databaseId, name: locName, subLocation: subLoc });
          locationMap.set(key, newLoc._id);
          console.log(`[IMPORT] Created location: "${locName}"${subLoc ? ` — ${subLoc}` : ''}`);
        }
      }
    }

    // --- Create/update Boxes from the box ID column (with their location) ---
    const boxKeyMap = new Map(); // Maps boxId string -> Box _id

    if (boxIdColumnName) {
      for (const record of records) {
        // Normalize to the canonical form (trimmed + uppercase) so an imported
        // "a06" matches/creates the same box as "A06".
        const boxIdValue = normalizeBoxId(record[boxIdColumnName]);
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

        let existingBox = await Box.findOne({ boxId: boxIdValue, databaseId });
        if (existingBox) {
          if (locId) existingBox.locationId = locId;
          await existingBox.save();
          boxKeyMap.set(boxIdValue, existingBox._id);
          console.log(`[IMPORT] Updated existing box: ${boxIdValue}`);
        } else {
          const newBox = await Box.create({
            databaseId,
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
        // Same normalization as the upsert loop above — boxKeyMap is keyed by canonical IDs.
        const boxIdValue = normalizeBoxId(record[boxIdColumnName]);
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
            // Location entity wasn't pre-created — create it now (scoped)
            const newLoc = await Location.create({ databaseId, name: locName, subLocation: subLoc });
            locationMap.set(key, newLoc._id);
            locationIdRef = newLoc._id;
          }
        }
      }

      // Tags for this record (comma-separated names -> resolved tag IDs)
      let tags = [];
      if (tagsColumnName && tagIdMap.size > 0) {
        const rawTags = String(record[tagsColumnName] || '');
        for (const part of rawTags.split(',')) {
          const name = part.trim().toLowerCase();
          if (!name) continue;
          const id = tagIdMap.get(name);
          if (id && !tags.includes(id)) tags.push(id);
        }
      }

      // Imported timestamps — omit when unparseable so schema defaults apply
      const doc = {
        databaseId,
        description,
        boxId: boxIdRef,
        locationId: locationIdRef,
        tags
      };
      if (createdColumnName) {
        const createdDate = parseImportDate(record[createdColumnName]);
        if (createdDate) doc.createdAt = createdDate;
      }
      if (modifiedColumnName) {
        const modifiedDate = parseImportDate(record[modifiedColumnName]);
        if (modifiedDate) doc.updatedAt = modifiedDate;
      }

      itemsToCreate.push(doc);
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
