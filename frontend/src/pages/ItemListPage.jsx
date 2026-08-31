import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
  Alert,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDownward as ArrowDownwardIcon,
  ArrowUpward as ArrowUpwardIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Label as LabelIcon,
  LocationOn as LocationOnIcon,
  Storage as StorageIcon,
  Save as SaveIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import SearchBar from '../components/SearchBar';

// Fixed column set for the items table. Values resolve from entity references:
//   Location / Sub-Location → Location entity (via box.locationId or item.locationId)
//   Item Description        → item.description
//   Box ID                  → box.boxId
const FIXED_COLUMNS = [
  { key: 'location', label: 'Location' },
  { key: 'subLocation', label: 'Sub-Location' },
  { key: 'description', label: 'Item Description' },
  { key: 'boxId', label: 'Box ID' },
];

// Advanced search column options (fixed set)
const SEARCH_COLUMN_OPTIONS = [
  ...FIXED_COLUMNS.map(c => ({ id: c.key, label: c.label })),
  { id: 'tags', label: 'Tags' },
];

// Resolve the Location entity for an item (via box, or direct reference).
// Handles both populated objects and raw ObjectId strings.
const resolveItemLocationEntity = (item, locations) => {
  const findLocById = (id) => locations.find(l => String(l._id) === String(id)) || null;
  if (item.boxId?.locationId) {
    const ref = item.boxId.locationId;
    return (ref && typeof ref === 'object' && ref.name !== undefined) ? ref : findLocById(ref?._id ?? ref);
  }
  if (item.locationId) {
    const ref = item.locationId;
    return (typeof ref === 'object' && ref.name !== undefined) ? ref : findLocById(ref?._id ?? ref);
  }
  return null;
};

// Resolved location parts for an item
const getLocationParts = (item, locations) => {
  const loc = resolveItemLocationEntity(item, locations);
  if (!loc || !(loc.name || loc.subLocation)) return { name: '', subLocation: '' };
  return { name: String(loc.name || ''), subLocation: String(loc.subLocation || '') };
};

// Resolved box ID string for an item (boxed items only)
const getBoxIdValue = (item, boxes) => {
  if (!item.boxId?._id) return '';
  const populated = typeof item.boxId === 'object' && item.boxId.boxId !== undefined;
  if (populated) return String(item.boxId.boxId || '');
  const box = boxes.find(b => b._id === item.boxId);
  return box ? String(box.boxId || '') : '';
};

// Display value for a fixed column on an item
const getFixedColumnValue = (item, key, locations, boxes) => {
  switch (key) {
    case 'location':
      return getLocationParts(item, locations).name;
    case 'subLocation':
      return getLocationParts(item, locations).subLocation;
    case 'description':
      return String(item.description || '');
    case 'boxId':
      return getBoxIdValue(item, boxes);
    default:
      return '';
  }
};

const ItemListPage = () => {
  const [items, setItems] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [locations, setLocations] = useState([]);

  // Search state
  const [searchMode, setSearchMode] = useState('basic'); // 'basic' | 'advanced'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState([
    { id: 1, field: '', operator: 'contains', value: '' }
  ]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedItems, setSelectedItems] = useState(new Set());
  // Last row clicked with a plain click; used as the start of Shift+click range selection.
  const [anchorItemId, setAnchorItemId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Bulk edit state
  const [bulkEditDescription, setBulkEditDescription] = useState('');
  const [bulkEditDescriptionChanged, setBulkEditDescriptionChanged] = useState(false);
  const [bulkEditTags, setBulkEditTags] = useState(null);     // null = various/unchanged, array = unified value
  const [bulkEditTagsChanged, setBulkEditTagsChanged] = useState(false);
  const [bulkEditBoxId, setBulkEditBoxId] = useState('');       // prefilled shared box id ('' when none/various)
  const [bulkEditBoxTouched, setBulkEditBoxTouched] = useState(false);
  const [bulkEditLocationId, setBulkEditLocationId] = useState(''); // prefilled shared direct location id ('' when none/various)
  const [bulkEditLocationTouched, setBulkEditLocationTouched] = useState(false);

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Import dialog state
  const fileInputRef = useRef(null);
  const [exportFormat, setExportFormat] = useState('csv');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importColumns, setImportColumns] = useState([]);
  const [importRowCount, setImportRowCount] = useState(0);
  const [mappingLocationCol, setMappingLocationCol] = useState('');
  const [mappingSubLocationCol, setMappingSubLocationCol] = useState('');
  const [mappingBoxIdCol, setMappingBoxIdCol] = useState('');
  const [mappingDescriptionCol, setMappingDescriptionCol] = useState('');
  const [importing, setImporting] = useState(false);

  // Column sort state
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });

  const navigate = useNavigate();

  // Active box filter from URL (?boxId=...) — set by "View Items" on the Boxes page.
  // The URL param is the single source of truth so deep links and back-button work correctly.
  const [searchParams, setSearchParams] = useSearchParams();
  const boxFilterId = searchParams.get('boxId');

  const clearBoxFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('boxId');
    setSearchParams(next);
  };

  useEffect(() => {
    fetchBoxes();
    fetchItems();
    fetchLocations();
  }, []);

  // Reset pagination whenever the box filter changes or is cleared
  useEffect(() => {
    setPage(0);
  }, [boxFilterId]);

  const fetchBoxes = async () => {
    try {
      const response = await api.getBoxes();
      if (response.success) setBoxes(response.data);
    } catch (err) {
      console.error('Error fetching boxes:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await api.getLocations();
      if (response.success) setLocations(response.data);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.getItems();
      if (response.success) {
        setItems(response.data);
      } else {
        setError('Failed to load items');
      }
    } catch (err) {
      setError('Error loading items: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export to CSV or Excel
  const handleExport = async () => {
    try {
      const endpoint = exportFormat === 'xlsx' ? '/api/items/export/xlsx' : '/api/items/export';
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFormat === 'xlsx' ? 'items.xlsx' : 'items.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Error exporting: ' + err.message);
    }
  };

  // Step 1: Upload file and preview columns
  const handleImportFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/items/import/preview', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setImportColumns(result.columns);
        setImportRowCount(result.rowCount);
        // Pre-fill mapping from backend auto-detection
        const suggested = result.suggestedMapping || {};
        setMappingLocationCol(suggested.locationColumn || '');
        setMappingSubLocationCol(suggested.subLocationColumn || '');
        setMappingBoxIdCol(suggested.boxIdColumn || '');
        setMappingDescriptionCol(suggested.descriptionColumn || '');
        setImportDialogOpen(true);
      } else {
        setError(result.error || 'Failed to preview file');
      }
    } catch (err) {
      setError('Error reading file: ' + err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Step 2: Execute import with mapping
  const handleImportExecute = async () => {
    if (!importFile) return;

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('mapping', JSON.stringify({
        locationColumn: mappingLocationCol || null,
        subLocationColumn: mappingSubLocationCol || null,
        boxIdColumn: mappingBoxIdCol || null,
        descriptionColumn: mappingDescriptionCol || null
      }));

      const response = await fetch('/api/items/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setError(null);
        setImportDialogOpen(false);
        setImportFile(null);
        fetchItems();
        fetchBoxes();
        fetchLocations();
      } else {
        setError(result.error || 'Failed to import file');
      }
    } catch (err) {
      setError('Error importing: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleImportCancel = () => {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportColumns([]);
    setMappingLocationCol('');
    setMappingSubLocationCol('');
    setMappingBoxIdCol('');
    setMappingDescriptionCol('');
  };

  const handleSort = (fieldKey) => {
    let newDirection = 'asc';
    if (sortConfig.field === fieldKey) {
      newDirection = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    }
    setSortConfig({ field: fieldKey, direction: newDirection });
  };

  const getSortedItems = (items) => {
    if (!sortConfig.field) return items;
    const { field, direction } = sortConfig;
    return [...items].sort((a, b) => {
      let aVal = '', bVal = '';
      if (field === 'tags') {
        aVal = (a.tags || []).map(t => t.name).join(', ');
        bVal = (b.tags || []).map(t => t.name).join(', ');
      } else if (field === 'createdAt' || field === 'updatedAt') {
        return direction === 'asc'
          ? new Date(a[field]) - new Date(b[field])
          : new Date(b[field]) - new Date(a[field]);
      } else {
        aVal = String(getFixedColumnValue(a, field, locations, boxes) ?? '');
        bVal = String(getFixedColumnValue(b, field, locations, boxes) ?? '');
      }
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Advanced search helpers
  const addSearchCriterion = () => {
    setSearchCriteria(prev => [
      ...prev,
      { id: Date.now(), field: '', operator: 'contains', value: '' }
    ]);
  };

  const removeCriterion = (index) => {
    setSearchCriteria(prev => prev.filter((_, i) => i !== index));
  };

  const updateCriterion = (index, key, val) => {
    setSearchCriteria(prev =>
      prev.map((c, i) => i === index ? { ...c, [key]: val } : c)
    );
  };

  const clearSearchCriteria = () => {
    setSearchCriteria([{ id: Date.now(), field: '', operator: 'contains', value: '' }]);
  };

  // Resolve the selected option object for a given criterion field ID
  const getSelectedColumnOption = (fieldId) => {
    if (!fieldId) return null;
    return SEARCH_COLUMN_OPTIONS.find(o => o.id === fieldId) || null;
  };

  // Advanced search: evaluate a single criterion against an item
  const matchesCriterion = (item, criterion) => {
    if (!criterion.field) return true;
    if (criterion.operator !== 'empty' && criterion.operator !== 'not_empty' && !criterion.value.trim()) return true;

    let fieldValue = '';
    if (criterion.field === 'tags') {
      fieldValue = (item.tags || []).map(t => t.name).join(', ');
    } else {
      fieldValue = getFixedColumnValue(item, criterion.field, locations, boxes);
    }
    const strValue = String(fieldValue ?? '').toLowerCase();

    switch (criterion.operator) {
      case 'contains':
        return strValue.includes(criterion.value.toLowerCase());
      case 'equals':
        return strValue === criterion.value.toLowerCase();
      case 'starts_with':
        return strValue.startsWith(criterion.value.toLowerCase());
      case 'ends_with':
        return strValue.endsWith(criterion.value.toLowerCase());
      case 'empty':
        return !strValue || strValue.trim() === '';
      case 'not_empty':
        return strValue && strValue.trim() !== '';
      case 'regex':
        try {
          const re = new RegExp(criterion.value, 'i');
          return re.test(String(fieldValue));
        } catch {
          return false; // Invalid regex matches nothing
        }
      default:
        return true;
    }
  };

  const applySearchFilter = (item) => {
    // Basic mode: search all displayed columns + tags
    if (searchMode === 'basic') {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const values = [
        ...FIXED_COLUMNS.map(c => getFixedColumnValue(item, c.key, locations, boxes)),
        (item.tags || []).map(t => t.name).join(', ')
      ];
      return values.some(val => String(val ?? '').toLowerCase().includes(query));
    }

    // Advanced mode: all criteria must match (AND logic)
    return searchCriteria.every(criterion => matchesCriterion(item, criterion));
  };

  // Pre-filter by active box from URL (?boxId=...) before search/sort/pagination.
  // Items without a box are excluded when the filter is active.
  const matchesBoxFilter = (item) => {
    if (!item.boxId || !item.boxId._id) return false;
    return String(item.boxId._id) === String(boxFilterId);
  };

  const boxFilteredItems = boxFilterId ? items.filter(matchesBoxFilter) : items;

  // Label for the active filter chip (resolved from the boxes list)
  const boxFilterLabel = useMemo(() => {
    if (!boxFilterId) return '';
    const match = boxes.find(b => String(b._id) === String(boxFilterId));
    return match?.boxId || 'Unknown box';
  }, [boxes, boxFilterId]);

  const filteredItems = boxFilteredItems.filter(applySearchFilter);

  // ---- Bulk Edit Logic ----
  const selectedItemsList = items.filter(item => selectedItems.has(item._id));

  // Display label for a box option: "A06 — Garage — Shelf 43" or just the ID
  const getBulkBoxLabel = (box) => {
    if (!box) return '';
    return `${box.boxId || '(no ID)'}${box.locationDisplayLabel ? ` — ${box.locationDisplayLabel}` : ''}`;
  };

  // Display label for a location option: "Garage — Shelf 43" or just the name
  const getBulkLocationLabel = (loc) => {
    if (!loc) return '';
    return loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
  };

  // Count items per distinct value across the selection. Returns [] when all items
  // share one value; otherwise up to 4 entries plus a "+N more" tail.
  const summarizeFieldValues = (extractValue, labelFor) => {
    const counts = new Map();
    for (const item of selectedItemsList) {
      const key = extractValue(item);
      if (!counts.has(key)) counts.set(key, { count: 0, label: labelFor(key) });
      counts.get(key).count += 1;
    }
    const entries = Array.from(counts.values());
    if (entries.length <= 1) return [];
    const shown = entries.slice(0, 4);
    const restCount = selectedItemsList.length - shown.reduce((sum, e) => sum + e.count, 0);
    if (restCount > 0) shown.push({ count: restCount, label: 'more' });
    return shown;
  };

  // Format a distribution summary as "3 in A06, 2 unboxed" (with "+N more" tail when capped)
  const formatDistribution = (entries) =>
    entries.map(e => e.label === 'more' ? `+${e.count} more` : `${e.count} ${e.label}`).join(', ');

  // Distribution of values across the selection for fields that differ between items.
  // Empty array means all selected items share one value (or nothing is selected).
  const boxValueSummary = summarizeFieldValues(
    item => String(item.boxId?._id || ''),
    key => {
      if (!key) return 'unboxed';
      const box = boxes.find(b => b._id === key);
      return `in ${box ? getBulkBoxLabel(box) : '(unknown box)'}`;
    }
  );
  const locationValueSummary = summarizeFieldValues(
    item => String(item.locationId?._id || ''),
    key => {
      if (!key) return 'no direct location';
      const loc = locations.find(l => l._id === key);
      return loc ? getBulkLocationLabel(loc) : '(unknown location)';
    }
  );
  const descriptionValueSummary = summarizeFieldValues(
    item => String(item.description || '').trim(),
    key => {
      if (!key) return '(empty)';
      return `"${key.length > 20 ? `${key.slice(0, 20)}…` : key}"`;
    }
  );

  // Initialize bulk edit form when dialog opens: prefill shared values, reset touched flags.
  const openBulkEdit = () => {
    setBulkEditDescriptionChanged(false);
    setBulkEditTagsChanged(false);
    setBulkEditBoxTouched(false);
    setBulkEditLocationTouched(false);

    // Description: prefill when all items share the same description, else leave empty (various)
    const descriptions = new Set(selectedItemsList.map(item => String(item.description || '').trim()));
    setBulkEditDescription(descriptions.size === 1 ? descriptions.values().next().value : '');

    // Box: prefill shared box id ('' when all unboxed or various — caption shows the distribution)
    const boxIds = new Set(selectedItemsList.map(item => String(item.boxId?._id || '')));
    setBulkEditBoxId(boxIds.size === 1 ? boxIds.values().next().value : '');

    // Direct location: prefill shared direct location id ('' when all have none or various)
    const locIds = new Set(selectedItemsList.map(item => String(item.locationId?._id || '')));
    setBulkEditLocationId(locIds.size === 1 ? locIds.values().next().value : '');

    // Compute tags: if all items share the exact same tag set, use it; otherwise null (various)
    const tagSets = selectedItemsList.map(item =>
      (item.tags || []).map(t => t.name.toLowerCase()).sort().join(',')
    );
    const uniqueTagSets = new Set(tagSets);
    if (uniqueTagSets.size === 1 && tagSets[0]) {
      setBulkEditTags(tagSets[0].split(',').filter(Boolean));
    } else if (uniqueTagSets.size === 1 && !tagSets[0]) {
      setBulkEditTags([]);
    } else {
      setBulkEditTags(null); // various
    }

    setBulkEditOpen(true);
  };

  const handleBulkTagsChange = (_, newTags) => {
    setBulkEditTags(newTags || []);
    setBulkEditTagsChanged(true);
  };

  // XOR: selecting a box clears the direct location (mirrors ItemEntryForm).
  // The auto-cleared field is reset to untouched; backend XOR enforces the implied clear on save.
  const handleBulkBoxChange = (newBoxId) => {
    setBulkEditBoxId(newBoxId);
    setBulkEditBoxTouched(true);
    if (newBoxId) {
      setBulkEditLocationId('');
      setBulkEditLocationTouched(false);
    }
  };

  // XOR: selecting a direct location clears any box assignment (mirrors ItemEntryForm).
  const handleBulkLocationChange = (newLocationId) => {
    setBulkEditLocationId(newLocationId);
    setBulkEditLocationTouched(true);
    if (newLocationId) {
      setBulkEditBoxId('');
      setBulkEditBoxTouched(false);
    }
  };

  // True when a specific box is selected for the bulk edit
  const bulkBoxExplicitlySet = !!bulkEditBoxId;

  const handleBulkSave = async () => {
    try {
      setLoading(true);

      // --- Update Item documents for description, tags, and box/location (XOR) ---
      const itemPromises = Array.from(selectedItems).map(async (itemId) => {
        const payload = {};
        if (bulkEditDescriptionChanged) {
          payload.description = bulkEditDescription.trim();
        }
        if (bulkEditTagsChanged) {
          payload.tagNames = bulkEditTags.map(name => name.toLowerCase());
        }
        // Box/location: send explicitly when touched so clearing actually removes the reference.
        // XOR mirrors ItemEntryForm: assigning a box clears any direct location, and vice versa.
        if (bulkEditBoxTouched) {
          payload.boxId = bulkEditBoxId || null;
          if (bulkEditBoxId) payload.locationId = null;
        }
        if (bulkEditLocationTouched) {
          payload.locationId = bulkEditLocationId || null;
          if (bulkEditLocationId) payload.boxId = null;
        }
        if (Object.keys(payload).length > 0) {
          await api.updateItem(itemId, payload);
        }
      });

      await Promise.all(itemPromises);
      setBulkEditOpen(false);
      fetchItems();
    } catch (err) {
      setError('Error updating items: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedItems = getSortedItems(filteredItems);

  const paginatedItems = sortedItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + (rowsPerPage === -1 ? sortedItems.length : rowsPerPage)
  );

  const paginatedCount = sortedItems.length;

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(event.target.value === 'all' ? -1 : parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedItems(new Set(paginatedItems.map(item => item._id)));
    } else {
      setSelectedItems(new Set());
      setAnchorItemId(null);
    }
  };

  // Plain click toggles a single row and sets it as the anchor.
  // Shift+click selects the contiguous range between the anchor row and this row
  // on the current page, merging it into any existing selection.
  const handleSelectItem = (itemId, event) => {
    const newSelected = new Set(selectedItems);
    if (event?.shiftKey && anchorItemId) {
      const anchorIndex = paginatedItems.findIndex(item => item._id === anchorItemId);
      const clickIndex = paginatedItems.findIndex(item => item._id === itemId);
      if (anchorIndex !== -1 && clickIndex !== -1) {
        const [start, end] = anchorIndex < clickIndex ? [anchorIndex, clickIndex] : [clickIndex, anchorIndex];
        for (let i = start; i <= end; i += 1) newSelected.add(paginatedItems[i]._id);
      } else {
        // Anchor not visible on this page — fall back to plain toggle.
        if (newSelected.has(itemId)) newSelected.delete(itemId);
        else newSelected.add(itemId);
      }
    } else {
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId);
      } else {
        newSelected.add(itemId);
      }
    }
    // The clicked row becomes the anchor for future Shift+clicks.
    setAnchorItemId(itemId);
    setSelectedItems(newSelected);
  };

  const handleDeleteSelected = async () => {
    try {
      const deletePromises = Array.from(selectedItems).map(id => api.deleteItem(id));
      await Promise.all(deletePromises);
      setSelectedItems(new Set());
      setAnchorItemId(null);
      setDeleteDialogOpen(false);
      fetchItems();
    } catch (err) {
      setError('Error deleting items: ' + err.message);
    }
  };

  const handleClearDatabase = async () => {
    try {
      await fetch('/api/data/clear-all', { method: 'DELETE' });
      setClearDialogOpen(false);
      setItems([]);
      setSelectedItems(new Set());
      setAnchorItemId(null);
      setError(null);
    } catch (err) {
      setError('Error clearing database: ' + err.message);
    }
  };

  const handleEdit = (itemId) => {
    navigate(`/edit/${itemId}`);
  };

  // Total column count for colSpan: checkbox + fixed columns + tags + created + modified + actions
  const totalColumns = 1 + FIXED_COLUMNS.length + 4;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Junk Tracker</Typography>
        <Box>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImportFileSelect}
          />
          <TextField
            select
            size="small"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            sx={{ mr: 1, minWidth: 80 }}
          >
            <MenuItem value="csv">CSV</MenuItem>
            <MenuItem value="xlsx">Excel</MenuItem>
          </TextField>
          <Tooltip title={`Export as ${exportFormat === 'xlsx' ? 'Excel' : 'CSV'}`}>
            <IconButton onClick={handleExport} sx={{ mr: 1 }}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import CSV or Excel">
            <IconButton onClick={() => fileInputRef.current.click()}>
              <UploadIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            color="error"
            size="small"
            sx={{ ml: 1 }}
            onClick={() => setClearDialogOpen(true)}
          >
            Clear Database
          </Button>
          <Tooltip title="Manage Locations">
            <IconButton onClick={() => navigate('/locations')}>
              <LocationOnIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Manage Boxes">
            <IconButton onClick={() => navigate('/boxes')}>
              <StorageIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Manage Tags">
            <IconButton onClick={() => navigate('/tags')}>
              <LabelIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/entry')}
            sx={{ ml: 1 }}
          >
            Add New Item
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Search Section */}
      <SearchBar
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClear={() => setSearchQuery('')}
        placeholder="Search across all columns..."
        mode={searchMode}
        setMode={setSearchMode}
        columnOptions={SEARCH_COLUMN_OPTIONS}
        getSelectedColumnOption={getSelectedColumnOption}
        searchCriteria={searchCriteria}
        addCriterion={addSearchCriterion}
        removeCriterion={removeCriterion}
        updateCriterion={updateCriterion}
        clearAll={clearSearchCriteria}
      />

      {boxFilterId && (
        <Box sx={{ mb: 2 }}>
          <Chip label={`Box: ${boxFilterLabel}`} color="primary" onDelete={clearBoxFilter} />
        </Box>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedItems.size > 0 && selectedItems.size < paginatedItems.length}
                  checked={paginatedItems.length > 0 && selectedItems.size === paginatedItems.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              {FIXED_COLUMNS.map(col => (
                <TableCell key={col.key}>
                  <Box sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={() => handleSort(col.key)}>
                    <strong>{col.label}</strong>
                    {sortConfig.field === col.key && (
                      sortConfig.direction === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                    )}
                  </Box>
                </TableCell>
              ))}
              <TableCell>
                <Box sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={() => handleSort('tags')}>
                  <strong>Tags</strong>
                  {sortConfig.field === 'tags' && (
                    sortConfig.direction === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={() => handleSort('createdAt')}>
                  <strong>Created</strong>
                  {sortConfig.field === 'createdAt' && (
                    sortConfig.direction === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={() => handleSort('updatedAt')}>
                  <strong>Last Modified</strong>
                  {sortConfig.field === 'updatedAt' && (
                    sortConfig.direction === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                  )}
                </Box>
              </TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={totalColumns} align="center">Loading...</TableCell>
              </TableRow>
            ) : sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumns} align="center">
                  {boxFilterId && boxFilteredItems.length === 0
                    ? 'No items in this box.'
                    : 'No items found.'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map(item => (
                <TableRow key={item._id} selected={selectedItems.has(item._id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedItems.has(item._id)}
                      onClick={(e) => handleSelectItem(item._id, e)}
                    />
                  </TableCell>
                  {FIXED_COLUMNS.map(col => (
                    <TableCell key={col.key}>
                      {getFixedColumnValue(item, col.key, locations, boxes) || '-'}
                    </TableCell>
                  ))}
                  {/* Tags */}
                  <TableCell>
                    {(item.tags || []).map(tag => (
                      <Chip key={tag._id} label={tag.name} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(item.updatedAt).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton onClick={() => handleEdit(item._id)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        onClick={() => {
                          setSelectedItems(new Set([item._id]));
                          setDeleteDialogOpen(true);
                        }}
                        size="small"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={paginatedCount}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50, { label: 'All', value: -1 }]}
      />

      {selectedItems.size > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
            {selectedItems.size} item(s) selected
          </Typography>
          {selectedItems.size >= 2 && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={openBulkEdit}
              sx={{ mr: 1 }}
            >
              Multi Edit
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete Selected
          </Button>
        </Box>
      )}

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk Edit — {selectedItems.size} item(s)</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Changes apply to all selected items. Leave a field empty/unchanged to keep existing values.
          </Typography>

          {/* Item Description */}
          <Box sx={{ mb: 3 }}>
            {descriptionValueSummary.length > 0 && !bulkEditDescriptionChanged && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                Various — {formatDistribution(descriptionValueSummary)}
              </Typography>
            )}
            <TextField
              fullWidth
              label="Item Description"
              value={bulkEditDescription}
              onChange={(e) => {
                setBulkEditDescription(e.target.value);
                setBulkEditDescriptionChanged(true);
              }}
              placeholder={descriptionValueSummary.length > 0 && !bulkEditDescriptionChanged ? 'Various — type to set a description for all items...' : 'Set a description for all items...'}
              helperText="Applies to all selected items when changed"
              sx={{ backgroundColor: bulkEditDescriptionChanged ? '#c8e6c9' : (descriptionValueSummary.length > 0 ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Tags section */}
          <Box sx={{ mb: 3 }}>
            {bulkEditTags === null && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                Various — items have different tags. Setting new tags will replace all existing tags on selected items.
              </Typography>
            )}
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : ''}
              value={bulkEditTags ?? []}
              onChange={handleBulkTagsChange}
              renderTags={(value, getTagProps) =>
                value.map((tag, i) => <Chip label={tag} {...getTagProps({ index: i })} key={i} />)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder={bulkEditTags === null ? 'Type to set tags for all items...' : 'Add tags...'}
                  sx={{ backgroundColor: bulkEditTagsChanged ? '#c8e6c9' : (bulkEditTags === null ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
                />
              )}
            />
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                color="error"
                onClick={() => { setBulkEditTags([]); setBulkEditTagsChanged(true); }}
              >
                Remove All Tags
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Box selector */}
          <Box sx={{ mb: 2 }}>
            {boxValueSummary.length > 0 && !bulkEditBoxTouched && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                Various — {formatDistribution(boxValueSummary)}
              </Typography>
            )}
            <Autocomplete
              options={boxes}
              value={bulkEditBoxId ? boxes.find(b => b._id === bulkEditBoxId) || null : null}
              onChange={(e, newValue) => handleBulkBoxChange(newValue?._id || '')}
              getOptionLabel={getBulkBoxLabel}
              isOptionEqualToValue={(option, val) => option._id === val._id}
              filterOptions={(options, params) => {
                const query = (params.inputValue || '').trim().toLowerCase();
                if (!query) return options;
                return options.filter(box => getBulkBoxLabel(box).toLowerCase().includes(query));
              }}
              noOptionsText="No matching boxes"
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Assign Box"
                  placeholder={boxValueSummary.length > 0 && !bulkEditBoxTouched ? 'Various — type to search or select a box...' : 'Type to search or select a box...'}
                  helperText="Selecting a box clears any direct location. Clear the field to remove boxes."
                  sx={{ backgroundColor: bulkEditBoxTouched ? '#c8e6c9' : (boxValueSummary.length > 0 ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
                />
              )}
            />
          </Box>

          {/* Direct Location Selection (when no box explicitly selected) */}
          {!bulkBoxExplicitlySet && locations.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {locationValueSummary.length > 0 && !bulkEditLocationTouched && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                  Various — {formatDistribution(locationValueSummary)}
                </Typography>
              )}
              <Autocomplete
                options={locations}
                value={bulkEditLocationId ? locations.find(l => l._id === bulkEditLocationId) || null : null}
                onChange={(e, newValue) => handleBulkLocationChange(newValue?._id || '')}
                getOptionLabel={getBulkLocationLabel}
                isOptionEqualToValue={(option, val) => option._id === val._id}
                filterOptions={(options, params) => {
                  const query = (params.inputValue || '').trim().toLowerCase();
                  if (!query) return options;
                  return options.filter(loc => getBulkLocationLabel(loc).toLowerCase().includes(query));
                }}
                noOptionsText="No matching locations"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Location (direct)"
                    placeholder={locationValueSummary.length > 0 && !bulkEditLocationTouched ? 'Various — type to search or select a location...' : 'Type to search or select a location...'}
                    helperText="Selecting a direct location clears any box assignment."
                    sx={{ backgroundColor: bulkEditLocationTouched ? '#c8e6c9' : (locationValueSummary.length > 0 ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
                  />
                )}
              />
            </Box>
          )}

          {/* Show inherited location when box is selected */}
          {bulkBoxExplicitlySet && (
            <Box sx={{ my: 1, p: 2, bgcolor: '#e1f5fe', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Location inherited from selected box:
              </Typography>
              {(() => {
                const selectedBox = boxes.find(b => b._id === bulkEditBoxId);
                return (
                  <Typography variant="body2">
                    <strong>Location:</strong> {selectedBox?.locationDisplayLabel || '—'}
                  </Typography>
                );
              })()}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkEditOpen(false)}>Cancel</Button>
          <Button
            onClick={handleBulkSave}
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={!bulkEditDescriptionChanged && !bulkEditTagsChanged && !bulkEditBoxTouched && !bulkEditLocationTouched}
          >
            Save to {selectedItems.size} item(s)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Items Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Items</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {selectedItems.size} selected item(s)? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteSelected} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Database Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Database</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear ALL data? This will permanently delete all items, boxes, locations, and tags. This action cannot be undone.
          </DialogContentText>
          <Alert severity="error" sx={{ mt: 2 }}>
            This is a destructive operation that removes everything from the database.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClearDatabase} color="error" variant="contained">
            Clear Everything
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Mapping Dialog */}
      <Dialog open={importDialogOpen} onClose={handleImportCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Map Columns for Import</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            File: {importFile?.name} ({importRowCount} rows, {importColumns.length} columns)
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Location Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select
                value={mappingLocationCol}
                label="Choose column"
                onChange={(e) => setMappingLocationCol(e.target.value)}
              >
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`loc-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Sub-Location Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select
                value={mappingSubLocationCol}
                label="Choose column"
                onChange={(e) => setMappingSubLocationCol(e.target.value)}
              >
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`subloc-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Box ID Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select
                value={mappingBoxIdCol}
                label="Choose column"
                onChange={(e) => setMappingBoxIdCol(e.target.value)}
              >
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`box-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Item Description Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select
                value={mappingDescriptionCol}
                label="Choose column"
                onChange={(e) => setMappingDescriptionCol(e.target.value)}
              >
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`desc-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Location + Sub-Location together uniquely identify a location. Box ID identifies boxes. All other columns in the file will be ignored.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleImportCancel}>Cancel</Button>
          <Button
            onClick={handleImportExecute}
            variant="contained"
            disabled={importing}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ItemListPage;
