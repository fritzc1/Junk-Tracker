const mongoose = require('mongoose');
const Item = require('../models/Item');
const Container = require('../models/Container');
const Tag = require('../models/Tag');
const Attribute = require('../models/Attribute');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');
const { loadContainerTree, computeDisplayPath } = require('../utils/containerTree');

// Stage 2 of plans/container-tree-and-attributes-plan.md: items reference a
// single container (containerId) instead of the old boxId XOR locationId pair.
// The container's display path is resolved at read time from its ancestor
// chain (utils/containerTree.js) and attached as `displayPath` on every item
// response — it also feeds the search haystack.

// ---------------------------------------------------------------------------
// Legacy-field guard (orchestration decision, Stage 2b)
// ---------------------------------------------------------------------------
// The old frontend still sends boxId/locationId in item create/update payloads
// until Stage 3 lands. Those fields no longer exist on the Item schema, so
// Mongoose strict mode would SILENTLY drop any assignment — a data-integrity
// risk (the user believes an item was placed in a box; it is not). We therefore
// reject such requests with HTTP 400 and an actionable message instead of
// stripping them. Rules:
//   - containerId present (non-empty) -> it wins; legacy fields are ignored.
//   - no containerId, but a NON-EMPTY boxId/locationId is sent -> 400.
//   - legacy keys present as null/empty (the old form always sends both keys,
//     with null when nothing is selected) -> treated as "no assignment to
//     drop"; the request proceeds and containerId is left untouched on update.

const LEGACY_FIELDS_ERROR =
  'Legacy fields "boxId" and "locationId" are deprecated and will not be honored: ' +
  'they no longer exist on items, so sending them would silently lose the reference. ' +
  'Use "containerId" (the _id of a Container from /api/containers) instead.';

const legacyFieldError = (body) => {
  const hasContainer = body.containerId !== undefined && body.containerId !== null && String(body.containerId).trim() !== '';
  if (hasContainer) return null; // containerId takes precedence over legacy fields
  for (const field of ['boxId', 'locationId']) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (String(value).trim() === '') continue; // explicit clear — nothing to drop
    return LEGACY_FIELDS_ERROR;
  }
  return null;
};

// Resolve a containerId request value against the active database. Returns
// { containerId: ObjectId|null, error }. Empty/undefined/null -> unassigned.
const resolveContainerRef = async (containerId, databaseId) => {
  if (containerId === undefined || containerId === null || String(containerId).trim() === '') {
    return { containerId: null };
  }
  const idStr = String(containerId).trim();
  if (!mongoose.isValidObjectId(idStr)) {
    return { error: `Invalid containerId: ${idStr}` };
  }
  const container = await Container.findOne({ _id: idStr, databaseId }).lean();
  if (!container) {
    return { error: 'Container not found in this database.' };
  }
  return { containerId: new mongoose.Types.ObjectId(idStr) };
};

// Resolve tag names to IDs, auto-creating any missing tags (scoped to the
// active database). Mirrors the box controller's tag handling so items and
// containers share one tag namespace. Returns [] for empty/invalid input.
const resolveTagNames = async (tagNames, databaseId) => {
  if (!Array.isArray(tagNames)) return [];
  const tagIds = [];
  for (const tagName of tagNames) {
    if (!tagName || !String(tagName).trim()) continue;
    const name = String(tagName).trim().toLowerCase();
    let existingTag = await Tag.findOne({ name, databaseId });
    if (!existingTag) {
      existingTag = await Tag.create({ name, databaseId });
    }
    tagIds.push(existingTag._id);
  }
  return tagIds;
};

// ---------------------------------------------------------------------------
// Attribute validation (Stage 4, relaxed in Stage 5 rev2)
// ---------------------------------------------------------------------------
// Items carry a sparse `attributes` map: dimension name -> value string. The
// schema cannot enforce the vocabulary (it lives on the per-database Attribute
// collection), so create/update validate at controller level: every key must
// be a defined dimension for this database, and its value must either be in
// that dimension's values[] (always OK) or — when the dimension has an empty
// vocabulary (unrestricted) — pass the dataType check: 'number' dimensions
// require Number(value) to parse; 'string'/'mixed' accept any non-empty text.
// Items with no attributes / an empty map pass through unchanged.

const normalizeAttributesInput = (raw) => {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('attributes must be a JSON object mapping dimension names to values');
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).trim();
    if (!k) continue; // ignore blank keys — nothing to validate or store
    if (value === undefined || value === null || String(value).trim() === '') continue; // unset dimension
    out[k] = String(value);
  }
  return out;
};

// Validate a normalized attribute map against the database's dimensions.
// Returns { error } on the first violation, or { attributes: Map|null }.
//
// Grandfathering (Stage 5 rev3): when `existingAttrs` is provided (item UPDATE),
// a key/value pair that is byte-identical to what the item already stores skips
// strict validation. This lets items keep values that were removed from a
// dimension's vocabulary later — editing such an item for any other reason must
// not 400; only NEW or CHANGED values are held to the current rules. Create
// never passes existingAttrs, so new items are always strictly validated.
const validateAttributes = async (rawAttributes, databaseId, existingAttrs) => {
  const attrs = normalizeAttributesInput(rawAttributes);
  if (Object.keys(attrs).length === 0) return { attributes: null }; // unchanged

  const dimensions = await Attribute.find({ databaseId }).lean();
  const byName = new Map(dimensions.map(d => [d.name, d]));
  const existing = existingAttrs && typeof existingAttrs.toObject === 'function'
    ? Object.fromEntries(existingAttrs)
    : (existingAttrs || {});

  for (const [key, value] of Object.entries(attrs)) {
    // Unchanged pair from the item's current state — keep it as-is.
    if (Object.prototype.hasOwnProperty.call(existing, key) && String(existing[key]) === value) continue;

    const dimension = byName.get(key);
    if (!dimension) {
      return { error: `Unknown attribute dimension "${key}". Define it first via POST /api/attributes.` };
    }

    const vocab = dimension.values || [];
    // Vocabulary values are always valid, regardless of dataType.
    if (vocab.includes(value)) continue;

    if (vocab.length > 0) {
      // Restricted dimension with an out-of-vocabulary value — unchanged from Stage 4.
      return { error: `Invalid value "${value}" for attribute dimension "${key}". Allowed values: ${vocab.join(', ')}.` };
    }

    // Unrestricted dimension (empty vocabulary): free input, type-checked by
    // dataType. Values reaching here are non-empty (normalizeAttributesInput
    // drops blanks), so 'string'/'mixed' always pass; 'number' must parse.
    if ((dimension.dataType || 'string') === 'number' && Number.isNaN(Number(value))) {
      return { error: `Invalid value "${value}" for attribute dimension "${key}": expected a number.` };
    }
  }

  return { attributes: new Map(Object.entries(attrs)) };
};

// Attach the computed displayPath to each item (works for Mongoose docs and
// lean objects alike — it is a plain own property that serializes in JSON).
const attachDisplayPaths = (items, byId) => {
  for (const item of items) {
    item.displayPath = item.containerId ? computeDisplayPath(item.containerId, byId) : '';
  }
  return items;
};

// Fetch an item with its container + tags populated and displayPath attached.
const fetchItemWithContainer = async (filter) => {
  const item = await Item.findOne(filter).populate('containerId', 'name kind boxId parentId').populate('tags', 'name');
  if (!item) return null;
  const { byId } = await loadContainerTree(String(item.databaseId));
  attachDisplayPaths([item], byId);
  return item;
};

// @desc    Create a new item
// @route   POST /api/items
// @access  Public
const createItem = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { description, containerId, tagNames } = req.body;

    // Legacy boxId/locationId guard — reject instead of silently dropping.
    const legacyErr = legacyFieldError(req.body);
    if (legacyErr) {
      return res.status(400).json({ success: false, error: legacyErr });
    }

    const refResult = await resolveContainerRef(containerId, databaseId);
    if (refResult.error) {
      return res.status(400).json({ success: false, error: refResult.error });
    }

    // Stage 4: attribute keys/values must match this database's dimensions.
    const attrResult = await validateAttributes(req.body.attributes, databaseId);
    if (attrResult.error) {
      return res.status(400).json({ success: false, error: attrResult.error });
    }

    const item = await Item.create({
      databaseId,
      description: (description || '').toString().trim(),
      containerId: refResult.containerId,
      tags: await resolveTagNames(tagNames, databaseId),
      ...(attrResult.attributes ? { attributes: attrResult.attributes } : {})
    });

    res.status(201).json({ success: true, data: await fetchItemWithContainer({ _id: item._id }) });
  } catch (error) {
    console.error('[Item] Error creating item:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get all items (single container populate + computed displayPath)
// @route   GET /api/items
// @access  Public
const getItems = async (req, res) => {
  try {
    // Build query filter — always scoped to the active database. Container
    // filtering uses ?containerId= (the old ?boxId=/ ?locationId= params are
    // gone with the fields they filtered on).
    const filter = { databaseId: req.databaseId };
    if (req.query.containerId) {
      if (!mongoose.isValidObjectId(req.query.containerId)) {
        return res.status(400).json({ success: false, error: `Invalid containerId: ${req.query.containerId}` });
      }
      filter.containerId = req.query.containerId;
    }
    if (req.query.tagId) {
      filter.tags = req.query.tagId;
    }

    const items = await Item.find(filter).populate('containerId', 'name kind boxId parentId').populate('tags', 'name');
    const { byId } = await loadContainerTree(req.databaseId);
    attachDisplayPaths(items, byId);

    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error) {
    console.error('[Item] Error listing items:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get item by ID
// @route   GET /api/items/:id
// @access  Public
const getItemById = async (req, res) => {
  try {
    const item = await fetchItemWithContainer({ _id: req.params.id, databaseId: req.databaseId });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error('[Item] Error getting item:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Update an item
// @route   PUT /api/items/:id
// @access  Public
const updateItem = async (req, res) => {
  try {
    const databaseId = req.databaseId;
    const { description, containerId, tagNames } = req.body;

    // Legacy boxId/locationId guard — reject instead of silently dropping.
    const legacyErr = legacyFieldError(req.body);
    if (legacyErr) {
      return res.status(400).json({ success: false, error: legacyErr });
    }

    // Fetch the current item first — its existing attribute map is needed for
    // grandfathering (unchanged stale values stay valid on update).
    let item = await Item.findOne({ _id: req.params.id, databaseId });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Stage 4 (relaxed in rev3): attribute keys/values must match this
    // database's dimensions. Only validated when the field is present so
    // partial updates never touch an item's existing attributes; unchanged
    // key/value pairs are grandfathered through as-is.
    let attrResult = null;
    if (req.body.attributes !== undefined) {
      attrResult = await validateAttributes(req.body.attributes, databaseId, item.attributes);
      if (attrResult.error) {
        return res.status(400).json({ success: false, error: attrResult.error });
      }
    }

    // Handle description
    if (description !== undefined) {
      item.description = String(description).trim();
    }

    // Handle containerId changes. Only applied when the field is present so a
    // partial update never clears an existing assignment; null unassigns.
    if (containerId !== undefined) {
      const refResult = await resolveContainerRef(containerId, databaseId);
      if (refResult.error) {
        return res.status(400).json({ success: false, error: refResult.error });
      }
      item.containerId = refResult.containerId;
    }

    // Handle tags from names (auto-create missing ones)
    if (tagNames && Array.isArray(tagNames)) {
      item.tags = await resolveTagNames(tagNames, databaseId);
    }

    // Stage 4: replace the attribute map when present. An empty object clears
    // all attributes; absent leaves them untouched.
    if (attrResult) {
      item.attributes = attrResult.attributes || new Map();
    }

    item = await item.save();

    res.status(200).json({ success: true, data: await fetchItemWithContainer({ _id: item._id }) });
  } catch (error) {
    console.error('[Item] Error updating item:', error.message);
    res.status(400).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete an item
// @route   DELETE /api/items/:id
// @access  Public
const deleteItem = async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({ _id: req.params.id, databaseId: req.databaseId });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('[Item] Error deleting item:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// ---------------------------------------------------------------------------
// Flattened export (CSV/XLSX) — "two formats, different jobs" per the plan.
// JSON is the canonical lossless format; this spreadsheet view is for humans.
// ---------------------------------------------------------------------------

// Attribute dimensions to render as dynamic columns in the flattened export.
// EXTENSION POINT (Stage 4/5): once the Attribute model lands, return the
// active database's defined dimension names here and buildExportRow will emit
// one column per dimension automatically — no other change needed. Until then
// there are no dimensions, so this returns [].
// Stage 4: the active database's defined dimension names, in name order. The
// flattened CSV/XLSX export emits one dynamic column per returned dimension
// (blank when unset) — see buildExportRow above.
const getAttributeDimensions = async (databaseId) => {
  const dims = await Attribute.find({ databaseId }).select('name').sort({ name: 1 });
  return dims.map(d => d.name);
};

// Read one attribute value for a row. Handles both Mongoose Map docs and plain
// objects (lean). Blank when the dimension is unset — sparse by design.
const readAttributeValue = (item, dimension) => {
  const attrs = item.attributes;
  if (!attrs) return '';
  if (typeof attrs.get === 'function') return attrs.get(dimension) ?? ''; // Mongoose Map
  return attrs[dimension] ?? ''; // plain object
};

// Helper: build a fixed-column row for an item (used by CSV and Excel export).
// Column layout (Stage 2): one Container column = full display path, replacing
// the old Location / Sub-Location / Box ID columns; a raw containerId column so
// import can round-trip without re-resolving paths; tags as one comma-separated
// column. Attribute dimensions are appended dynamically (blank when unset).
const buildExportRow = (item, dimensions = []) => {
  const row = {
    'Container': item.displayPath || '',
    'containerId': item.containerId ? String(item.containerId) : '',
    'Item Description': String(item.description || ''),
    'Tags': (item.tags || []).map(t => t.name).join(', '),
    // ISO 8601 so the import parser can round-trip dates deterministically
    'Created': item.createdAt ? new Date(item.createdAt).toISOString() : '',
    'Last Modified': item.updatedAt ? new Date(item.updatedAt).toISOString() : ''
  };

  // One dynamic column per defined attribute dimension (Stage 4/5 extension
  // point — the builder already iterates, so landing attributes is a small change).
  for (const dimension of dimensions) {
    row[dimension] = readAttributeValue(item, dimension);
  }

  return row;
};

// Fetch all items in the database with container + tags populated and
// displayPath attached — shared by both export handlers.
const fetchItemsForExport = async (databaseId) => {
  const items = await Item.find({ databaseId }).populate('containerId', 'name kind boxId parentId').populate('tags', 'name');
  const { byId } = await loadContainerTree(databaseId);
  return attachDisplayPaths(items, byId);
};

// @desc    Export items to CSV (flattened view — see buildExportRow)
// @route   GET /api/items/export
// @access  Public
const exportCsv = async (req, res) => {
  try {
    const items = await fetchItemsForExport(req.databaseId);
    const dimensions = await getAttributeDimensions(req.databaseId);

    const csvData = items.map(item => buildExportRow(item, dimensions));
    const csv = stringify(csvData, { header: true });

    res.setHeader('Content-Disposition', 'attachment; filename=items.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (error) {
    console.error('[Item] Error exporting CSV:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Export items to Excel (flattened view — see buildExportRow)
// @route   GET /api/items/export/xlsx
// @access  Public
const exportXlsx = async (req, res) => {
  try {
    const items = await fetchItemsForExport(req.databaseId);
    const dimensions = await getAttributeDimensions(req.databaseId);

    const excelData = items.map(item => buildExportRow(item, dimensions));

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
    console.error('[Item] Error exporting XLSX:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// ---------------------------------------------------------------------------
// JSON snapshot export — the CANONICAL LOSSLESS format ("two formats, different
// jobs" per the plan). CSV/XLSX is a flattened human view; this snapshot is for
// backups, migrations and moving data between databases. Round-trip guarantee:
// importing an export into an empty database reproduces the data exactly (same
// tree, same references, same values) — see POST /api/items/import/json.
// ---------------------------------------------------------------------------

const EXPORT_FORMAT_VERSION = 1;

// @desc    Export a full snapshot of the active database as JSON
// @route   GET /api/items/export/json
// @access  Public
const exportJson = async (req, res) => {
  try {
    const databaseId = req.databaseId;

    // Lean docs — raw ids are exactly what the round-trip guarantee needs.
    const [containers, items, tags] = await Promise.all([
      Container.find({ databaseId }).lean(),
      Item.find({ databaseId }).lean(),
      Tag.find({ databaseId }).lean()
    ]);

    const snapshot = {
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      // Informational only — import always targets the ACTIVE database.
      sourceDatabaseId: String(databaseId),

      // The tree is fully reconstructable from parentId (root -> leaf).
      containers: containers.map(c => ({
        _id: String(c._id),
        name: c.name,
        kind: c.kind || 'location',
        parentId: c.parentId ? String(c.parentId) : null,
        boxId: c.boxId || null,
        tags: (c.tags || []).map(String),
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : undefined,
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined
      })),

      items: items.map(i => {
        const doc = {
          _id: String(i._id),
          description: i.description || '',
          // Raw container id — NOT a path. Import resolves it directly, so the
          // round-trip never re-parses display paths.
          containerId: i.containerId ? String(i.containerId) : null,
          tags: (i.tags || []).map(String),
          createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : undefined,
          updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : undefined
        };
        // EXTENSION POINT (Stage 4): include the full attribute map once the
        // field lands on the Item schema — the import side already restores it.
        if (i.attributes) {
          const attrs = i.attributes instanceof Map ? Object.fromEntries(i.attributes) : { ...i.attributes };
          if (Object.keys(attrs).length > 0) doc.attributes = attrs;
        }
        return doc;
      }),

      tags: tags.map(t => ({ _id: String(t._id), name: t.name }))
    };

    res.setHeader('Content-Disposition', 'attachment; filename=junk-tracker-export.json');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    console.error('[Item] Error exporting JSON snapshot:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Search items across description, tags and the resolved container path
// @route   GET /api/items/search/:query
// @access  Public
const searchItems = async (req, res) => {
  try {
    const query = req.params.query;

    // Fast path: match on the item's own description field in Mongo (scoped).
    let items = await Item.find({
      databaseId: req.databaseId,
      description: { $regex: query, $options: 'i' }
    }).populate('containerId', 'name kind boxId parentId').populate('tags', 'name');

    // Also match items whose tags or resolved container path contain the query.
    // The displayPath includes every ancestor name — for migrated boxes that is
    // their physical label (e.g., "Garage / Shelf 43 / A06") — so searching a
    // box ID still finds its contents, as before.
    const allItems = await Item.find({ databaseId: req.databaseId })
      .populate('containerId', 'name kind boxId parentId').populate('tags', 'name');

    const { byId } = await loadContainerTree(req.databaseId);
    attachDisplayPaths(allItems, byId);
    attachDisplayPaths(items, byId);

    const matchedIds = new Set(items.map(i => i._id.toString()));
    for (const item of allItems) {
      if (matchedIds.has(item._id.toString())) continue;
      const tagNames = (item.tags || []).map(t => t.name).join(' ');
      const haystack = [tagNames, item.displayPath].join(' ').toLowerCase();
      if (haystack.includes(query.toLowerCase())) {
        matchedIds.add(item._id.toString());
        items.push(item);
      }
    }

    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error) {
    console.error('[Item] Error searching items:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
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
  exportXlsx,
  exportJson
};
