const express = require('express');
const mongoose = require('mongoose');
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
  exportXlsx,
  exportJson
} = require('../controllers/itemController');

// Configure multer for file uploads (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// @route   GET /api/items/export
// @desc    Export items to CSV (flattened view — one Container path column)
router.get('/export', exportCsv);

// @route   GET /api/items/export/xlsx
// @desc    Export items to Excel (same flattened layout as CSV)
router.get('/export/xlsx', exportXlsx);

// @route   GET /api/items/export/json
// @desc    Export a full lossless JSON snapshot of the active database
//          (containers + items + tags; round-trips via POST /import/json)
router.get('/export/json', exportJson);

// ---------------------------------------------------------------------------
// CSV/XLSX import — Stage 2 rework.
//
// The flattened spreadsheet now carries ONE Container column = full display
// path ("Garage / Shelf 43" or "Garage / Shelf 43 / A06") plus a raw containerId
// column for lossless round-trips. Import builds the tree from paths: each "/"
// segment is find-or-created as a location container, and an optional Box ID
// column marks the leaf as kind='box'. LEGACY-format files (separate Location /
// Sub-Location / Box ID columns) are tolerated by mapping them onto the same
// path-building logic. Unknown headers are reported in the response, never
// silently dropped.
// ---------------------------------------------------------------------------

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

// Auto-detection candidates for the import targets (used when the user does not
// explicitly map a column in the mapping dialog). New-format columns first;
// legacy Location / Sub-Location columns are still detected so old files keep
// working.
const CONTAINER_CANDIDATES = ['Container', 'Container Path'];
const BOX_ID_CANDIDATES = ['Box ID', 'Box Id', 'box id'];
const RAW_CONTAINER_ID_CANDIDATES = ['containerId', 'Container ID', 'Container Id'];
const LOCATION_CANDIDATES = ['Location']; // legacy format only
const SUB_LOCATION_CANDIDATES = ['Sub-Location / Shelf Number', 'Sub-Location', 'Shelf Number']; // legacy format only
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

// Parse an uploaded file (CSV or Excel) into normalized records. Shared by the
// preview and import endpoints so both see identical columns/rows.
const parseUploadedFile = (file) => {
  const { parse } = require('csv-parse/sync');
  let records;

  if (file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    records = XLSX.utils.sheet_to_json(ws);
  } else {
    const csvData = file.buffer.toString('utf-8');
    records = parse(csvData, { columns: true, skip_empty_lines: true });
  }

  return normalizeRecords(records);
};

// @route   POST /api/items/import/preview
// @desc    Preview file columns without importing (for column mapping UI)
router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const records = parseUploadedFile(req.file);

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'No records found in file' });
    }

    const columnHeaders = Object.keys(records[0]);

    // Suggest auto-detected mappings for the fixed targets. New-format columns
    // (Container path + raw containerId) take priority; legacy Location /
    // Sub-Location candidates are only suggested when no Container column exists.
    const findCandidate = (candidates) => {
      for (const candidate of candidates) {
        if (columnHeaders.includes(candidate)) return candidate;
      }
      return null;
    };

    const containerColumn = findCandidate(CONTAINER_CANDIDATES);
    res.status(200).json({
      success: true,
      columns: columnHeaders,
      rowCount: records.length,
      suggestedMapping: {
        containerColumn,
        boxIdColumn: findCandidate(BOX_ID_CANDIDATES),
        rawContainerIdColumn: findCandidate(RAW_CONTAINER_ID_CANDIDATES),
        // Legacy-format suggestions (ignored by the importer when a Container
        // column is mapped — kept so old files still pre-fill sensibly).
        locationColumn: containerColumn ? null : findCandidate(LOCATION_CANDIDATES),
        subLocationColumn: containerColumn ? null : findCandidate(SUB_LOCATION_CANDIDATES),
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

// @route   POST /api/items/import/json
// @desc    Import a JSON snapshot (from GET /export/json) into the ACTIVE database.
//          Preserves ids where possible or remaps them consistently; reports
//          conflicts/omissions instead of failing silently; tolerates missing
//          sections from older format versions (e.g., no attributes pre-Stage 4).
router.post('/import/json', async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const snapshot = req.body;

    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return res.status(400).json({ success: false, error: 'Request body must be a JSON snapshot object (see GET /api/items/export/json).' });
    }
    if (!Array.isArray(snapshot.items) && !Array.isArray(snapshot.containers) && !Array.isArray(snapshot.tags)) {
      return res.status(400).json({ success: false, error: 'Snapshot is missing all of items/containers/tags — nothing to import.' });
    }

    const Container = require('../models/Container');
    const Item = require('../models/Item');
    const Tag = require('../models/Tag');

    const report = {
      version: snapshot.version ?? null,
      exportedAt: snapshot.exportedAt || null,
      tags: { imported: 0, skippedExisting: 0, remapped: 0, omittedInvalid: [] },
      containers: { imported: 0, skippedExisting: 0, remapped: 0, omittedInvalid: [], omittedDanglingParent: [] },
      items: { imported: 0, skippedExisting: 0, remapped: 0, omittedInvalid: [], omittedDanglingContainer: [] }
    };

    // Timestamp restoration. The Container and Item schemas have pre-save hooks
    // that force updatedAt=now, so their timestamps are restored with a raw
    // collection update AFTER creation (bypassing the hooks). Tags have no such
    // hook — createdAt is passed straight into create().
    const containerTsRestores = []; // { _id, createdAt?, updatedAt? }
    const itemTsRestores = [];

    const parseTs = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

    // --- Tags (by _id first; fall back to name match within this database) ---
    const tagIdMap = new Map(); // source id -> target id
    for (const t of snapshot.tags || []) {
      if (!t || typeof t.name !== 'string' || !t.name.trim()) {
        report.tags.omittedInvalid.push(String(t && t._id));
        continue;
      }
      const name = t.name.trim().toLowerCase();

      let targetId = null;
      const tagCreatedAt = parseTs(t.createdAt);
      if (t._id && mongoose.isValidObjectId(String(t._id))) {
        try {
          await Tag.create({ _id: new mongoose.Types.ObjectId(String(t._id)), databaseId, name, ...(tagCreatedAt ? { createdAt: tagCreatedAt } : {}) });
          targetId = String(t._id); // preserved id
        } catch (err) {
          console.warn(`[IMPORT JSON] tag ${t._id} ("${name}") id-preserve failed: ${err.message}`);
          const existing = await Tag.findOne({ name, databaseId });
          if (existing) {
            targetId = String(existing._id);
            report.tags.skippedExisting += 1;
          } else {
            try {
              const created = await Tag.create({ databaseId, name });
              targetId = String(created._id); // remapped id
              report.tags.remapped += 1;
            } catch (err2) {
              report.tags.omittedInvalid.push(`${t._id} (${name})`);
              continue;
            }
          }
        }
      } else {
        const existing = await Tag.findOne({ name, databaseId });
        if (existing) {
          targetId = String(existing._id);
          report.tags.skippedExisting += 1;
        } else {
          const created = await Tag.create({ databaseId, name });
          targetId = String(created._id);
          report.tags.remapped += 1;
        }
      }

      if (t._id && mongoose.isValidObjectId(String(t._id))) {
        tagIdMap.set(String(t._id), targetId);
      }
      report.tags.imported += 1;
    }

    // --- Containers (by _id first, then name+kind+parent remap) -------------
    const containerIdMap = new Map(); // source id -> target id
    for (const c of snapshot.containers || []) {
      if (!c || typeof c.name !== 'string' || !c.name.trim()) {
        report.containers.omittedInvalid.push(String(c && c._id));
        continue;
      }

      const kind = ['location', 'box'].includes(c.kind) ? c.kind : 'location';
      const boxId = c.boxId ? normalizeBoxId(c.boxId) || undefined : undefined;
      const sourceParentId = c.parentId ? String(c.parentId) : null;
      const targetParentId = sourceParentId ? containerIdMap.get(sourceParentId) : null;

      // Dangling parent (its source id was omitted/invalid above): report and
      // skip rather than silently re-rooting the subtree.
      if (sourceParentId && !targetParentId) {
        report.containers.omittedDanglingParent.push(`${c._id} ("${c.name}" — missing parent ${sourceParentId})`);
        continue;
      }

      const tags = (Array.isArray(c.tags) ? c.tags : [])
        .map(id => containerTagTarget(tagIdMap, id))
        .filter(Boolean);

      // Match an already-imported/existing container: boxes by their unique
      // per-database boxId, everything else by name + kind + parent.
      const matchExistingContainer = async () => {
        if (boxId) {
          return Container.findOne({ databaseId, kind: 'box', boxId }).lean();
        }
        return Container.findOne({
          databaseId, name: c.name.trim(), kind,
          ...(targetParentId ? { parentId: new mongoose.Types.ObjectId(targetParentId) } : {})
        }).lean();
      };

      let targetId = null;
      // Timestamps are restored after creation via a raw update (the schema's
      // pre-save hook forces updatedAt=now on model saves). Only documents we
      // actually wrote in this run get their source timestamps — matched
      // existing docs (skippedExisting) keep theirs.
      const cCreatedAt = parseTs(c.createdAt);
      const cUpdatedAt = parseTs(c.updatedAt);

      // Boxes always store name === boxId (container-box-identity rework) — a
      // stale/different name in an old snapshot must not break the invariant.
      const createDoc = () => ({ databaseId, name: kind === 'box' && boxId ? boxId : c.name.trim(), kind, parentId: targetParentId || null, boxId, tags });

      const queueTsRestore = () => {
        if (cCreatedAt || cUpdatedAt) {
          containerTsRestores.push({ _id: new mongoose.Types.ObjectId(targetId), ...(cCreatedAt ? { createdAt: cCreatedAt } : {}), ...(cUpdatedAt ? { updatedAt: cUpdatedAt } : {}) });
        }
      };

      if (c._id && mongoose.isValidObjectId(String(c._id))) {
        try {
          await Container.create({ _id: new mongoose.Types.ObjectId(String(c._id)), ...createDoc() });
          targetId = String(c._id); // preserved id
          queueTsRestore();
        } catch (err) {
          console.warn(`[IMPORT JSON] container ${c._id} ("${c.name}") id-preserve failed: ${err.message}`);
          // ID collision or unique-constraint conflict — match an existing one.
          const existing = await matchExistingContainer();
          if (existing) {
            targetId = String(existing._id);
            report.containers.skippedExisting += 1;
          } else {
            try {
              const created = await Container.create(createDoc());
              targetId = String(created._id); // remapped id
              report.containers.remapped += 1;
              queueTsRestore();
            } catch (err2) {
              report.containers.omittedInvalid.push(`${c._id} ("${c.name}" — ${err2.message})`);
              continue;
            }
          }
        }
      } else {
        try {
          const created = await Container.create(createDoc());
          targetId = String(created._id); // remapped id (no source _id)
          report.containers.remapped += 1;
          queueTsRestore();
        } catch (err) {
          const existing = await matchExistingContainer();
          if (existing) {
            targetId = String(existing._id);
            report.containers.skippedExisting += 1;
          } else {
            report.containers.omittedInvalid.push(`(no _id) "${c.name}" — ${err.message}`);
            continue;
          }
        }
      }

      if (c._id && mongoose.isValidObjectId(String(c._id))) containerIdMap.set(String(c._id), targetId);
      report.containers.imported += 1;
    }

    // Restore source timestamps on the containers we wrote in this run.
    for (const r of containerTsRestores) {
      await mongoose.connection.collection('containers').updateOne({ _id: r._id }, { $set: r });
    }

    // --- Items ---------------------------------------------------------------
    for (const i of snapshot.items || []) {
      const iCreatedAt = parseTs(i.createdAt);
      const iUpdatedAt = parseTs(i.updatedAt);

      const sourceContainerId = i.containerId ? String(i.containerId) : null;
      const targetContainerId = sourceContainerId ? containerIdMap.get(sourceContainerId) : null;

      if (sourceContainerId && !targetContainerId) {
        report.items.omittedDanglingContainer.push(`${i._id} ("${i.description}" — missing container ${sourceContainerId})`);
        continue;
      }

      const tags = (Array.isArray(i.tags) ? i.tags : [])
        .map(id => containerTagTarget(tagIdMap, id))
        .filter(Boolean);

      // Attributes: restored when present (Stage 4+ snapshots). Missing section
      // from older versions is simply skipped — forward/backward tolerant.
      const attributes = i.attributes && typeof i.attributes === 'object' ? { ...i.attributes } : undefined;

      let targetId = null;
      const queueItemTsRestore = () => {
        if (iCreatedAt || iUpdatedAt) {
          itemTsRestores.push({ _id: new mongoose.Types.ObjectId(targetId), ...(iCreatedAt ? { createdAt: iCreatedAt } : {}), ...(iUpdatedAt ? { updatedAt: iUpdatedAt } : {}) });
        }
      };

      if (i._id && mongoose.isValidObjectId(String(i._id))) {
        try {
          await Item.create({
            _id: new mongoose.Types.ObjectId(String(i._id)),
            databaseId, description: i.description || '', containerId: targetContainerId || null, tags, attributes
          });
          targetId = String(i._id); // preserved id
          queueItemTsRestore();
        } catch (err) {
          const created = await Item.create({ databaseId, description: i.description || '', containerId: targetContainerId || null, tags, attributes });
          targetId = String(created._id); // remapped id
          report.items.remapped += 1;
          queueItemTsRestore();
        }
      } else {
        const created = await Item.create({ databaseId, description: i.description || '', containerId: targetContainerId || null, tags, attributes });
        targetId = String(created._id);
        report.items.remapped += 1;
        queueItemTsRestore();
      }

      // `imported` counts every item successfully written (preserved or remapped).
      report.items.imported += 1;
    }

    // Restore source timestamps on the items we wrote in this run.
    for (const r of itemTsRestores) {
      await mongoose.connection.collection('items').updateOne({ _id: r._id }, { $set: r });
    }

    console.log('[IMPORT JSON] Report:', JSON.stringify(report));
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('[IMPORT JSON] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error: ' + error.message });
  }
});

// Map a source tag id through the import map; unknown ids are dropped (they
// were already reported as omitted when their tag failed to import).
const containerTagTarget = (tagIdMap, id) => {
  const key = String(id);
  return tagIdMap.has(key) ? new mongoose.Types.ObjectId(tagIdMap.get(key)) : null;
};

// @route   POST /api/items/import
// @desc    Import items from CSV or Excel file (container path -> tree building,
//          with legacy Location/Sub-Location/Box ID column support)
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

    const Container = require('../models/Container');
    const Item = require('../models/Item');
    const Tag = require('../models/Tag');

    const records = parseUploadedFile(req.file);

    console.log('[IMPORT] File:', req.file.originalname);
    console.log('[IMPORT] Total records parsed:', records.length);

    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'No records found in file' });
    }

    const columnHeaders = Object.keys(records[0]);
    console.log('[IMPORT] Columns to process:', columnHeaders);

    // Resolve the fixed target columns (user mapping takes priority, then auto-detect)
    const mapping = req.body.mapping || {};
    const findCandidate = (candidates) => {
      for (const candidate of candidates) {
        if (columnHeaders.includes(candidate)) return candidate;
      }
      return null;
    };

    // New-format columns. A mapped/auto-detected Container column switches the
    // importer to path-based tree building; legacy Location/Sub-Location columns
    // are only used when no Container column is present (old files keep working).
    const containerColumnName = mapping.containerColumn || findCandidate(CONTAINER_CANDIDATES);
    const boxIdColumnName = mapping.boxIdColumn || findCandidate(BOX_ID_CANDIDATES);
    const rawContainerIdColumnName = mapping.rawContainerIdColumn || findCandidate(RAW_CONTAINER_ID_CANDIDATES);

    const useLegacyColumns = !containerColumnName;
    const locationColumnName = useLegacyColumns ? (mapping.locationColumn || findCandidate(LOCATION_CANDIDATES)) : null;
    const subLocationColumnName = useLegacyColumns ? (mapping.subLocationColumn || findCandidate(SUB_LOCATION_CANDIDATES)) : null;

    const descriptionColumnName = mapping.descriptionColumn || findCandidate(DESCRIPTION_CANDIDATES);
    const tagsColumnName = mapping.tagsColumn || findCandidate(TAGS_CANDIDATES);
    const createdColumnName = mapping.createdColumn || findCandidate(CREATED_CANDIDATES);
    const modifiedColumnName = mapping.modifiedColumn || findCandidate(MODIFIED_CANDIDATES);

    console.log('[IMPORT] Mapped columns:', {
      container: containerColumnName,
      boxId: boxIdColumnName,
      rawContainerId: rawContainerIdColumnName,
      legacyLocation: locationColumnName,
      legacySubLocation: subLocationColumnName,
      description: descriptionColumnName,
      tags: tagsColumnName,
      created: createdColumnName,
      modified: modifiedColumnName
    });

    // --- Unknown headers are reported, not silently dropped ------------------
    const knownColumns = new Set([
      containerColumnName, boxIdColumnName, rawContainerIdColumnName,
      locationColumnName, subLocationColumnName,
      descriptionColumnName, tagsColumnName, createdColumnName, modifiedColumnName
    ].filter(Boolean));
    const unknownHeaders = columnHeaders.filter(h => !knownColumns.has(h));

    // --- Upsert Tags from the tags column (comma-separated names) ---
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

    // --- Container tree building ---------------------------------------------
    // pathKey -> container _id. Paths are built from the Container column
    // (split on "/") or from legacy Location + Sub-Location columns; a Box ID
    // marks the leaf as kind='box'. Existing containers are matched by exact
    // name under the resolved parent, so re-importing an export is idempotent.
    const containerMap = new Map();

    const findOrCreateContainer = async (name, parentId) => {
      let existing = await Container.findOne({ databaseId, name }).lean();
      if (parentId) {
        existing = await Container.findOne({ databaseId, name, parentId: new mongoose.Types.ObjectId(parentId) }).lean();
      } else {
        existing = await Container.findOne({ databaseId, name, $or: [{ parentId: null }, { parentId: { $exists: false } }] }).lean();
      }
      if (existing) return String(existing._id);

      const created = await Container.create({ databaseId, name, kind: 'location', parentId: parentId || null });
      console.log(`[IMPORT] Created container: "${name}"${parentId ? ` under ${String(parentId).slice(-8)}` : ' (root)'}`);
      return String(created._id);
    };

    // Resolve one record's path segments to a leaf container id, creating any
    // missing parents. Returns { containerId, boxIdValue } or null when the
    // record has no location info at all.
    const resolveRecordContainer = async (record) => {
      let segments = [];
      if (containerColumnName && String(record[containerColumnName] || '').trim()) {
        segments = String(record[containerColumnName]).split('/').map(s => s.trim()).filter(Boolean);
      } else if (useLegacyColumns) {
        const locName = locationColumnName ? String(record[locationColumnName] || '').trim() : '';
        const subLoc = subLocationColumnName ? String(record[subLocationColumnName] || '').trim() : '';
        segments = [locName, subLoc].filter(Boolean);
      }

      // Box ID handling differs by format:
      //  - LEGACY files (no Container column): the box is an ADDITIONAL leaf
      //    under the location path — "Garage" + "Shelf 43" + A06 becomes
      //    Garage / Shelf 43 / A06, mirroring the old Box->Location model.
      //  - NEW-format exports: the Container path already ends in the box
      //    label; a separately provided Box ID column marks that leaf as
      //    kind='box' (hand-crafted files).
      const boxIdValue = boxIdColumnName ? normalizeBoxId(record[boxIdColumnName]) : '';
      if (boxIdValue && useLegacyColumns) {
        segments.push(boxIdValue);
      }

      if (segments.length === 0) return null;

      let parentId = null;
      for (const segment of segments.slice(0, -1)) {
        const key = `${parentId || 'root'}|${segment}`;
        if (!containerMap.has(key)) {
          containerMap.set(key, await findOrCreateContainer(segment, parentId));
        }
        parentId = containerMap.get(key);
      }

      // Leaf: a box ID makes it kind='box'.
      const leafName = segments[segments.length - 1];
      let containerId;

      if (boxIdValue) {
        // Match an existing box by its canonical ID under this parent first —
        // the export's Container path for a box ends in the box label, so a
        // re-import must find the same box instead of creating a twin.
        let existing = await Container.findOne({ databaseId, kind: 'box', boxId: boxIdValue }).lean();
        if (parentId) {
          const underParent = await Container.findOne({ databaseId, kind: 'box', boxId: boxIdValue, parentId: new mongoose.Types.ObjectId(parentId) }).lean();
          if (underParent) existing = underParent;
        } else {
          const rootBox = await Container.findOne({ databaseId, kind: 'box', boxId: boxIdValue, $or: [{ parentId: null }, { parentId: { $exists: false } }] }).lean();
          if (rootBox) existing = rootBox;
        }

        if (existing) {
          containerId = String(existing._id);
        } else {
          // Boxes always store name === boxId (container-box-identity rework) —
          // a legacy file's container label for the same row is not preserved.
          const created = await Container.create({ databaseId, name: boxIdValue, kind: 'box', parentId: parentId || null, boxId: boxIdValue });
          console.log(`[IMPORT] Created box container: "${created.name}" (ID ${boxIdValue})`);
          containerId = String(created._id);
        }
      } else {
        const key = `${parentId || 'root'}|${leafName}`;
        if (!containerMap.has(key)) {
          containerMap.set(key, await findOrCreateContainer(leafName, parentId));
        }
        containerId = containerMap.get(key);
      }

      return { containerId, boxIdValue };
    };

    // --- Map each record to an item (single container ref) -------------------
    const itemsToCreate = [];
    let rawContainerIdMatches = 0;
    let rawContainerIdMisses = 0;

    for (const record of records) {
      const description = descriptionColumnName ? String(record[descriptionColumnName] || '').trim() : '';

      // Preferred: the raw containerId column round-trips without re-resolving
      // paths. Fall back to path/box building when it is absent or unknown.
      let containerRef = null;
      if (rawContainerIdColumnName && String(record[rawContainerIdColumnName] || '').trim()) {
        const rawId = String(record[rawContainerIdColumnName]).trim();
        const existing = await Container.findOne({ _id: rawId, databaseId }).lean().catch(() => null);
        if (existing) {
          containerRef = String(existing._id);
          rawContainerIdMatches += 1;
        } else {
          rawContainerIdMisses += 1; // reported below — fall through to path building
        }
      }

      if (!containerRef) {
        const resolved = await resolveRecordContainer(record);
        if (resolved) {
          containerRef = resolved.containerId;
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
        containerId: containerRef ? new mongoose.Types.ObjectId(containerRef) : null,
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

    console.log('[IMPORT] Containers resolved:', containerMap.size, '| raw containerId matches:', rawContainerIdMatches, 'misses:', rawContainerIdMisses);
    console.log('[IMPORT] Items to create:', itemsToCreate.length);

    if (itemsToCreate.length > 0) {
      await Item.insertMany(itemsToCreate);
    }

    res.status(200).json({
      success: true,
      count: itemsToCreate.length,
      containersProcessed: containerMap.size,
      rawContainerIdMatches,
      rawContainerIdMisses,
      unknownHeaders,
      data: {}
    });
  } catch (error) {
    console.error('[IMPORT] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error: ' + error.message });
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