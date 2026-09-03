import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Tooltip,
  Autocomplete,
  TextField,
  Box,
  Typography,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TableSortLabel,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FormatListBulleted as FormatListBulletedIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';
import SearchBar from '../components/SearchBar';
import PaginationBar from '../components/PaginationBar';
import useRowsPerPage from '../hooks/useRowsPerPage';

// Fixed column set for the boxes table. Values resolve from entity references:
//   Box ID    → box.boxId
//   Location  → Location entity via box.locationId (name + subLocation)
const FIXED_COLUMNS = [
  { key: 'boxId', label: 'Box ID' },
  { key: 'location', label: 'Location' },
];

// Advanced search column options (fixed set + tags)
const SEARCH_COLUMN_OPTIONS = [
  ...FIXED_COLUMNS.map(c => ({ id: c.key, label: c.label })),
  { id: 'tags', label: 'Tags' },
  { id: 'itemCount', label: 'Items' },
];

// Resolved location display label for a box
const getBoxLocationLabel = (box) => {
  const loc = box.locationPopulated;
  if (!loc || !loc.name) return '';
  return loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
};

// Display value for a fixed column on a box
const getFixedColumnValue = (box, key) => {
  switch (key) {
    case 'boxId':
      return String(box.boxId || '');
    case 'location':
      return getBoxLocationLabel(box);
    case 'tags':
      return (box.tags || []).map(t => t.name).join(', ');
    default:
      return '';
  }
};

// Display label for a location option in the bulk edit dialog
const getLocationOptionLabel = (loc) => {
  if (!loc) return '';
  return loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
};

const BoxListPage = () => {
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search state
  const [searchMode, setSearchMode] = useState('basic'); // 'basic' | 'advanced'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState([
    { id: 1, field: '', operator: 'contains', value: '' }
  ]);

  const [page, setPage] = useState(0);
  // Persisted per-page in sessionStorage; resets to page 0 on change.
  const [rowsPerPage, handleChangeRowsPerPage] = useRowsPerPage('boxes', () => setPage(0));

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [boxToDelete, setBoxToDelete] = useState(null);

  // Multi-select state (mirrors ItemListPage): selected box IDs + the last row
  // clicked with a plain click, used as the start of Shift+click range selection.
  const [selectedBoxes, setSelectedBoxes] = useState(new Set());
  const [anchorBoxId, setAnchorBoxId] = useState(null);

  // Bulk edit state (Location + Tags; box ID is excluded — it's unique per database)
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditLocationId, setBulkEditLocationId] = useState('');
  const [bulkEditLocationTouched, setBulkEditLocationTouched] = useState(false);
  const [bulkEditTags, setBulkEditTags] = useState(null);     // null = various/unchanged, array = unified value
  const [bulkEditTagsChanged, setBulkEditTagsChanged] = useState(false);
  const [bulkEditTagMode, setBulkEditTagMode] = useState('replace'); // 'replace' | 'add' (append to existing)

  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);

  // Options for the bulk edit dialog
  const [locations, setLocations] = useState([]);
  const [allTagNames, setAllTagNames] = useState([]);

  // Transient success notice (auto-clears)
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const navigate = useNavigate();
  const { activeDatabaseId } = useDatabases();

  // Active location filter from URL (?locationId=...) — set by "View Boxes" on the Locations page.
  // The URL param is the single source of truth so deep links and back-button work correctly.
  const [searchParams, setSearchParams] = useSearchParams();
  const locationFilterId = searchParams.get('locationId');

  const clearLocationFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('locationId');
    setSearchParams(next);
  };

  // Active tag filter from URL (?tagId=...) — set by "View Boxes" on the Tags page.
  const tagFilterId = searchParams.get('tagId');

  const clearTagFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('tagId');
    setSearchParams(next);
  };

  // Active box filter from URL (?boxId=...) — set by "Go to Box" on the Items page.
  const boxFilterId = searchParams.get('boxId');

  const clearBoxFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('boxId');
    setSearchParams(next);
  };

  // Load boxes on mount and whenever the active database changes (resetting
  // pagination so a stale page number can't hide results, and clearing any
  // stale selection that belongs to a different database).
  useEffect(() => {
    setSelectedBoxes(new Set());
    setAnchorBoxId(null);
    setPage(0);
    fetchBoxes();
    fetchLocations();
    fetchTagNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

  // Reset pagination whenever the location, tag, or box filter changes or is cleared
  useEffect(() => {
    setPage(0);
  }, [locationFilterId, tagFilterId, boxFilterId]);

  const fetchBoxes = async () => {
    try {
      setLoading(true);
      const response = await api.getBoxes();
      if (response.success) {
        setBoxes(response.data);
      } else {
        setError('Failed to load boxes');
      }
    } catch (err) {
      console.error('Error fetching boxes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Options for the bulk edit dialog (full location list + all tag names)
  const fetchLocations = async () => {
    try {
      const response = await api.getLocations();
      if (response.success) setLocations(response.data);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const fetchTagNames = async () => {
    try {
      const response = await api.getTags();
      if (response.success) {
        setAllTagNames(response.data.filter(t => t.name).map(t => t.name));
      }
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  };

  const showNotice = (msg) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };

  const handleAddBox = () => {
    navigate('/box-entry');
  };

  const handleEditBox = (boxId) => {
    navigate(`/box-edit/${boxId}`);
  };

  const handleDeleteClick = (box) => {
    setBoxToDelete(box);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.deleteBox(boxToDelete._id);
      fetchBoxes();
    } catch (err) {
      setError('Error deleting box: ' + err.message);
    } finally {
      setDeleteDialogOpen(false);
      setBoxToDelete(null);
    }
  };

  const handleViewItems = (boxId) => {
    navigate(`/items?boxId=${boxId}`);
  };

  // --- Multi-select (mirrors ItemListPage) ---

  const selectedBoxesList = useMemo(
    () => boxes.filter(box => selectedBoxes.has(box._id)),
    [boxes, selectedBoxes]
  );

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedBoxes(new Set(paginatedBoxes.map(box => box._id)));
    } else {
      setSelectedBoxes(new Set());
      setAnchorBoxId(null);
    }
  };

  // Plain click toggles a single row and sets it as the anchor.
  // Shift+click selects the contiguous range between the anchor row and this row
  // on the current page, merging it into any existing selection.
  const handleSelectBox = (boxId, event) => {
    const newSelected = new Set(selectedBoxes);
    if (event?.shiftKey && anchorBoxId) {
      const anchorIndex = paginatedBoxes.findIndex(box => box._id === anchorBoxId);
      const clickIndex = paginatedBoxes.findIndex(box => box._id === boxId);
      if (anchorIndex !== -1 && clickIndex !== -1) {
        const [start, end] = anchorIndex < clickIndex ? [anchorIndex, clickIndex] : [clickIndex, anchorIndex];
        for (let i = start; i <= end; i += 1) newSelected.add(paginatedBoxes[i]._id);
      } else {
        // Anchor not visible on this page — fall back to plain toggle.
        if (newSelected.has(boxId)) newSelected.delete(boxId);
        else newSelected.add(boxId);
      }
    } else {
      if (newSelected.has(boxId)) {
        newSelected.delete(boxId);
      } else {
        newSelected.add(boxId);
      }
    }
    // The clicked row becomes the anchor for future Shift+clicks.
    setAnchorBoxId(boxId);
    setSelectedBoxes(newSelected);
  };

  const clearSelection = () => {
    setSelectedBoxes(new Set());
    setAnchorBoxId(null);
  };

  // --- Bulk edit (Location + Tags; box ID is never bulk-edited — it's unique per database) ---

  // Count boxes per distinct value across the selection. Returns [] when all boxes
  // share one value; otherwise up to 4 entries plus a "+N more" tail.
  const summarizeFieldValues = (extractValue, labelFor) => {
    const counts = new Map();
    for (const box of selectedBoxesList) {
      const key = extractValue(box);
      if (!counts.has(key)) counts.set(key, { count: 0, label: labelFor(key) });
      counts.get(key).count += 1;
    }
    const entries = Array.from(counts.values());
    if (entries.length <= 1) return [];
    const shown = entries.slice(0, 4);
    const restCount = selectedBoxesList.length - shown.reduce((sum, e) => sum + e.count, 0);
    if (restCount > 0) shown.push({ count: restCount, label: 'more' });
    return shown;
  };

  // Format a distribution summary as "3 in Garage — Shelf 43, 2 no location" (+N more tail when capped)
  const formatDistribution = (entries) =>
    entries.map(e => e.label === 'more' ? `+${e.count} more` : `${e.count} ${e.label}`).join(', ');

  // Distribution of locations across the selection for boxes that differ.
  // Empty array means all selected boxes share one location (or none).
  const locationValueSummary = summarizeFieldValues(
    box => String(box.locationId || ''),
    key => {
      if (!key) return 'no location';
      const loc = locations.find(l => l._id === key);
      return loc ? getLocationOptionLabel(loc) : '(unknown location)';
    }
  );

  // Shared tag prefill for replace mode: array if all boxes share one tag set (possibly empty), null if various.
  const getSharedTagPrefill = () => {
    const tagSets = selectedBoxesList.map(box =>
      (box.tags || []).map(t => t.name.toLowerCase()).sort().join(',')
    );
    const uniqueTagSets = new Set(tagSets);
    if (uniqueTagSets.size === 1) {
      return tagSets[0] ? tagSets[0].split(',').filter(Boolean) : [];
    }
    return null; // various
  };

  // Initialize bulk edit form when dialog opens: prefill shared values, reset touched flags.
  const openBulkEdit = () => {
    setBulkEditLocationTouched(false);
    setBulkEditTagsChanged(false);

    // Location: prefill when all boxes share the same location, else leave empty (various)
    const locIds = new Set(selectedBoxesList.map(box => String(box.locationId || '')));
    setBulkEditLocationId(locIds.size === 1 ? locIds.values().next().value : '');

    // Tags: reset to replace mode and prefill the shared tag set (or null = various).
    setBulkEditTagMode('replace');
    setBulkEditTags(getSharedTagPrefill());

    setBulkEditOpen(true);
  };

  const handleBulkTagsChange = (_, newTags) => {
    setBulkEditTags(newTags || []);
    setBulkEditTagsChanged(true);
  };

  // Switching modes resets the tags field to its initial state for that mode:
  // replace → shared prefill (or various), add → empty (only entering new tags).
  const handleBulkTagModeChange = (newMode) => {
    if (!newMode || newMode === bulkEditTagMode) return;
    setBulkEditTagMode(newMode);
    setBulkEditTagsChanged(false);
    setBulkEditTags(newMode === 'add' ? [] : getSharedTagPrefill());
  };

  const handleBulkSave = async () => {
    try {
      setLoading(true);
      // Update each selected box with only the changed fields.
      await Promise.all(Array.from(selectedBoxes).map(async (boxId) => {
        const box = boxes.find(b => b._id === boxId);
        const payload = {};
        if (bulkEditLocationTouched) {
          payload.locationId = bulkEditLocationId || null;
        }
        if (bulkEditTagsChanged) {
          if (bulkEditTagMode === 'add') {
            // Append to each box's existing tags, deduped case-insensitively. Empty field = no-op.
            if (bulkEditTags.length > 0) {
              const merged = new Set((box?.tags || []).map(t => t.name.toLowerCase()));
              for (const name of bulkEditTags) merged.add(name.toLowerCase());
              payload.tagNames = [...merged];
            }
          } else {
            payload.tagNames = bulkEditTags.map(name => name.toLowerCase());
          }
        }
        if (Object.keys(payload).length > 0) {
          await api.updateBox(boxId, payload);
        }
      }));
      setBulkEditOpen(false);
      fetchBoxes();
    } catch (err) {
      setError('Error updating boxes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Delete selected ---

  const handleDeleteSelected = async () => {
    try {
      setLoading(true);
      let deleted = 0;
      const skipped = [];
      for (const boxId of Array.from(selectedBoxes)) {
        const box = boxes.find(b => b._id === boxId);
        if ((box?.itemCount || 0) > 0) {
          // Boxes with items can't be deleted (mirrors single-delete behavior).
          skipped.push(box.boxId || '(no ID)');
          continue;
        }
        await api.deleteBox(boxId);
        deleted += 1;
      }
      clearSelection();
      setDeleteSelectedOpen(false);
      fetchBoxes();
      if (skipped.length > 0) {
        showNotice(`Deleted ${deleted} box(es). Skipped ${skipped.length} with items: ${skipped.join(', ')}`);
      } else {
        showNotice(`Deleted ${deleted} box(es).`);
      }
    } catch (err) {
      setError('Error deleting boxes: ' + err.message);
    } finally {
      setLoading(false);
    }
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
  const getSelectedBoxOption = (fieldId) => {
    if (!fieldId) return null;
    return SEARCH_COLUMN_OPTIONS.find(o => o.id === fieldId) || null;
  };

  // Evaluate a single criterion against a box
  const matchesCriterion = (box, criterion) => {
    if (!criterion.field) return true;
    if (criterion.operator !== 'empty' && criterion.operator !== 'not_empty' && !criterion.value.trim()) return true;

    let fieldValue = '';
    if (criterion.field === 'itemCount') {
      fieldValue = String(box.itemCount || 0);
    } else {
      fieldValue = getFixedColumnValue(box, criterion.field);
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

  const applySearchFilter = (box) => {
    if (searchMode === 'basic') {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const values = [
        ...FIXED_COLUMNS.map(c => getFixedColumnValue(box, c.key)),
        ...(box.tags || []).map(t => t.name),
        String(box.itemCount || 0)
      ];
      return values.some(v => String(v ?? '').toLowerCase().includes(q));
    }
    // Advanced mode: all criteria must match (AND logic)
    return searchCriteria.every(criterion => matchesCriterion(box, criterion));
  };

  // Pre-filter by active location from URL (?locationId=...) before search/sort/pagination.
  // Boxes without a populated location are excluded when the filter is active.
  const matchesLocationFilter = (box) => {
    if (!box.locationPopulated || !box.locationPopulated._id) return false;
    return String(box.locationPopulated._id) === String(locationFilterId);
  };

  // Pre-filter by active tag from URL (?tagId=...) before search/sort/pagination.
  // Boxes without the tag are excluded when the filter is active.
  const matchesTagFilter = (box) => {
    return (box.tags || []).some(t => String(t._id) === String(tagFilterId));
  };

  // Pre-filter by active box from URL (?boxId=...) before search/sort/pagination.
  const matchesBoxFilter = (box) => String(box._id) === String(boxFilterId);

  const locationFilteredBoxes = locationFilterId ? boxes.filter(matchesLocationFilter) : boxes;
  const tagFilteredBoxes = tagFilterId ? locationFilteredBoxes.filter(matchesTagFilter) : locationFilteredBoxes;
  const boxFilteredBoxes = boxFilterId ? tagFilteredBoxes.filter(matchesBoxFilter) : tagFilteredBoxes;

  // Label for the active filter chip (resolved from any matching box's populated tags)
  const tagFilterLabel = useMemo(() => {
    if (!tagFilterId) return '';
    const match = boxes.find(b => (b.tags || []).some(t => String(t._id) === String(tagFilterId)));
    return match?.tags?.find(t => String(t._id) === String(tagFilterId))?.name || 'Unknown tag';
  }, [boxes, tagFilterId]);

  // Label for the active box filter chip (the box's own ID, or a fallback if it no longer exists)
  const boxFilterLabel = useMemo(() => {
    if (!boxFilterId) return '';
    const match = boxes.find(b => String(b._id) === String(boxFilterId));
    return match?.boxId || 'Unknown box';
  }, [boxes, boxFilterId]);

  const filteredBoxes = boxFilteredBoxes.filter(applySearchFilter);

  // Sorting state and helpers
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSortClick = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Extract a comparable sort value for a box column
  const getBoxSortValue = (box, key) => {
    if (key === 'updatedAt') return new Date(box.updatedAt).getTime();
    if (key === 'itemCount') return box.itemCount || 0;
    const val = getFixedColumnValue(box, key);
    if (!val) return '';
    const num = Number(val);
    return !isNaN(num) ? num : String(val).toLowerCase();
  };

  const sortedBoxes = useMemo(() => {
    if (!sortConfig.key) return filteredBoxes;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredBoxes].sort((a, b) => {
      const va = getBoxSortValue(a, sortConfig.key);
      const vb = getBoxSortValue(b, sortConfig.key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      // Empty values always sink to the bottom regardless of direction
      if (va === '' && vb !== '') return 1;
      if (vb === '' && va !== '') return -1;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filteredBoxes, sortConfig]);

  // Pagination (client-side over the filtered + sorted list)
  const paginatedBoxes = sortedBoxes.slice(
    page * rowsPerPage,
    page * rowsPerPage + (rowsPerPage === -1 ? sortedBoxes.length : rowsPerPage)
  );

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 0 }); // land at the top of the table after paging
  };

  // Total column count for colSpan: checkbox + fixed columns + tags + last modified + items + actions
  const totalColumns = 1 + FIXED_COLUMNS.length + 4;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Boxes</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddBox}
        >
          Add Box
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {/* Search Section */}
      <SearchBar
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClear={() => setSearchQuery('')}
        placeholder="Search boxes by ID or location..."
        mode={searchMode}
        setMode={setSearchMode}
        columnOptions={SEARCH_COLUMN_OPTIONS}
        getSelectedColumnOption={getSelectedBoxOption}
        searchCriteria={searchCriteria}
        addCriterion={addSearchCriterion}
        removeCriterion={removeCriterion}
        updateCriterion={updateCriterion}
        clearAll={clearSearchCriteria}
      />

      {(locationFilterId || tagFilterId || boxFilterId) && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          {locationFilterId && (
            <Chip label={`Location: ${locationFilterLabel}`} color="primary" onDelete={clearLocationFilter} />
          )}
          {tagFilterId && (
            <Chip label={`Tag: ${tagFilterLabel}`} color="secondary" onDelete={clearTagFilter} />
          )}
          {boxFilterId && (
            <Chip label={`Box: ${boxFilterLabel}`} color="success" onDelete={clearBoxFilter} />
          )}
        </Box>
      )}

      <PaginationBar
        sx={{ mb: 1 }}
        count={sortedBoxes.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50, { label: 'All', value: -1 }]}
      />

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedBoxes.size > 0 && selectedBoxes.size < paginatedBoxes.length}
                  checked={paginatedBoxes.length > 0 && selectedBoxes.size === paginatedBoxes.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              {FIXED_COLUMNS.map(col => (
                <TableCell key={col.key} sx={{ cursor: 'pointer' }} onClick={() => handleSortClick(col.key)}>
                  <TableSortLabel active={sortConfig.key === col.key} direction={sortConfig.key === col.key ? sortConfig.direction : 'asc'}>
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell sx={{ cursor: 'pointer' }} onClick={() => handleSortClick('tags')}>
                <TableSortLabel active={sortConfig.key === 'tags'} direction={sortConfig.key === 'tags' ? sortConfig.direction : 'asc'}>
                  Tags
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ cursor: 'pointer' }} onClick={() => handleSortClick('updatedAt')}>
                <TableSortLabel active={sortConfig.key === 'updatedAt'} direction={sortConfig.key === 'updatedAt' ? sortConfig.direction : 'asc'}>
                  Last Modified
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ cursor: 'pointer' }} onClick={() => handleSortClick('itemCount')}>
                <TableSortLabel active={sortConfig.key === 'itemCount'} direction={sortConfig.key === 'itemCount' ? sortConfig.direction : 'asc'}>
                  Items
                </TableSortLabel>
              </TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={totalColumns} sx={{ textAlign: 'center' }}>
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredBoxes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumns} sx={{ textAlign: 'center' }}>
                  {boxes.length === 0
                    ? 'No boxes found. Import data or add a box to get started.'
                    : boxFilterId && boxFilteredBoxes.length === 0
                      ? `Box "${boxFilterLabel}" not found.`
                      : tagFilterId && tagFilteredBoxes.length === 0
                        ? `No boxes with the tag "${tagFilterLabel}".`
                        : locationFilterId && locationFilteredBoxes.length === 0
                          ? 'No boxes at this location.'
                          : 'No boxes match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedBoxes.map(box => (
                <TableRow key={box._id} selected={selectedBoxes.has(box._id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedBoxes.has(box._id)}
                      onClick={(e) => handleSelectBox(box._id, e)}
                    />
                  </TableCell>
                  {FIXED_COLUMNS.map(col => (
                    <TableCell key={col.key}>{getFixedColumnValue(box, col.key) || ''}</TableCell>
                  ))}
                  {/* Tags */}
                  <TableCell>
                    {(box.tags || []).map(tag => (
                      <Chip key={tag._id} label={tag.name} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell>{new Date(box.updatedAt).toLocaleString()}</TableCell>
                  <TableCell align="right">{box.itemCount || 0}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Items">
                      <IconButton onClick={() => handleViewItems(box._id)} size="small">
                        <FormatListBulletedIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit Box">
                      <IconButton onClick={() => handleEditBox(box._id)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Box">
                      <IconButton onClick={() => handleDeleteClick(box)} size="small" color="error">
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

      <PaginationBar
        variant="bottom"
        sx={{ mt: 1 }}
        count={sortedBoxes.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50, { label: 'All', value: -1 }]}
      />

      {/* Selection action bar */}
      {selectedBoxes.size > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
            {selectedBoxes.size} box(es) selected
          </Typography>
          {selectedBoxes.size >= 2 && (
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
            onClick={() => setDeleteSelectedOpen(true)}
          >
            Delete Selected
          </Button>
        </Box>
      )}

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk Edit — {selectedBoxes.size} box(es)</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Changes apply to all selected boxes. Leave a field unchanged to keep existing values. Box IDs are not bulk-editable (they must be unique).
          </Typography>

          {/* Location selector */}
          <Box sx={{ mb: 3 }}>
            {locationValueSummary.length > 0 && !bulkEditLocationTouched && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                Various — {formatDistribution(locationValueSummary)}
              </Typography>
            )}
            <Autocomplete
              options={locations}
              value={bulkEditLocationId ? locations.find(l => l._id === bulkEditLocationId) || null : null}
              onChange={(e, newValue) => {
                setBulkEditLocationId(newValue?._id || '');
                setBulkEditLocationTouched(true);
              }}
              getOptionLabel={getLocationOptionLabel}
              isOptionEqualToValue={(option, val) => option._id === val._id}
              filterOptions={(options, params) => {
                const query = (params.inputValue || '').trim().toLowerCase();
                if (!query) return options;
                return options.filter(loc => getLocationOptionLabel(loc).toLowerCase().includes(query));
              }}
              noOptionsText="No matching locations"
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Location"
                  placeholder={locationValueSummary.length > 0 && !bulkEditLocationTouched ? 'Various — type to search or select a location...' : 'Type to search or select a location...'}
                  helperText="Clear the field to remove the location from all selected boxes."
                  sx={{ backgroundColor: bulkEditLocationTouched ? '#c8e6c9' : (locationValueSummary.length > 0 ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
                />
              )}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Tags section */}
          <Box sx={{ mb: 1 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={bulkEditTagMode}
              onChange={(e, newMode) => handleBulkTagModeChange(newMode)}
              aria-label="Tag edit mode"
              sx={{ mb: 1.5 }}
            >
              <ToggleButton value="replace">Replace</ToggleButton>
              <ToggleButton value="add">Add to existing</ToggleButton>
            </ToggleButtonGroup>
            {bulkEditTagMode === 'replace' && bulkEditTags === null && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                Various — boxes have different tags. Setting new tags will replace all existing tags on selected boxes.
              </Typography>
            )}
            <Autocomplete
              multiple
              freeSolo
              options={allTagNames}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : ''}
              value={bulkEditTags ?? []}
              onChange={handleBulkTagsChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder={bulkEditTagMode === 'add' ? 'Type a tag and press Enter to add it...' : (bulkEditTags === null ? 'Type to set tags for all boxes...' : 'Add tags...')}
                  helperText={bulkEditTagMode === 'add' ? "Adds to each box's existing tags; duplicates are ignored." : 'Replaces all existing tags on selected boxes.'}
                  sx={{ backgroundColor: bulkEditTagsChanged ? '#c8e6c9' : (bulkEditTags === null ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
                />
              )}
            />
            {bulkEditTagMode === 'replace' && (
              <Box sx={{ mt: 1 }}>
                <Button
                  size="small"
                  color="error"
                  onClick={() => { setBulkEditTags([]); setBulkEditTagsChanged(true); }}
                >
                  Remove All Tags
                </Button>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkEditOpen(false)}>Cancel</Button>
          <Button
            onClick={handleBulkSave}
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={!bulkEditLocationTouched && !bulkEditTagsChanged}
          >
            Save to {selectedBoxes.size} box(es)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Selected Confirmation Dialog */}
      <Dialog open={deleteSelectedOpen} onClose={() => setDeleteSelectedOpen(false)}>
        <DialogTitle>Delete Boxes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {selectedBoxes.size} selected box(es)? This action cannot be undone.
            {(() => {
              const withItems = selectedBoxesList.filter(b => (b.itemCount || 0) > 0);
              return withItems.length > 0 ? (
                <Box component="span" display="block" mt={1} color="warning.main">
                  {withItems.length} of the selected box(es) contain items and will be skipped: {withItems.map(b => b.boxId || '(no ID)').join(', ')}. Remove or reassign their items first.
                </Box>
              ) : null;
            })()}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSelectedOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteSelected} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Box</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete box "{boxToDelete?.boxId}"? This action cannot be undone.
            {boxToDelete?.itemCount > 0 && (
              <Box component="span" display="block" mt={1} color="error.main">
                This box has {boxToDelete.itemCount} item(s). You must remove or reassign them first.
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={(boxToDelete?.itemCount || 0) > 0}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default BoxListPage;
