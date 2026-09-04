import React, { useState, useEffect, useMemo } from 'react';
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
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
  Edit as EditIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';
import SearchBar from '../components/SearchBar';
import PaginationBar from '../components/PaginationBar';
import ItemDialog from '../components/ItemDialog';
import useRowsPerPage from '../hooks/useRowsPerPage';

// Fixed column set for the items table. Stage 3: one Container column (full
// display path) replaces the old Location / Sub-Location / Box ID columns —
// items reference a single containerId now.
const FIXED_COLUMNS = [
  { key: 'description', label: 'Item Description' },
  { key: 'container', label: 'Container' },
];

// Advanced search column options — fixed columns + tags. Stage 5 appends one
// option per defined attribute dimension (dynamic; see `searchColumnOptions`).
const FIXED_SEARCH_COLUMN_OPTIONS = [
  ...FIXED_COLUMNS.map(c => ({ id: c.key, label: c.label })),
  { id: 'tags', label: 'Tags' },
];

// Full display path for an item's container. The backend attaches `displayPath`
// to every item response; the populated-container fallback covers any client
// that receives items without it (e.g., a stale cache).
const getContainerPath = (item, containers) => {
  if (item.displayPath) return String(item.displayPath);
  const ref = item.containerId;
  if (!ref || typeof ref !== 'object' || !ref._id) return '';
  // Walk the populated chain is not available here — resolve via the flat list.
  const byId = new Map((containers || []).map(c => [String(c._id), c]));
  let cursor = byId.get(String(ref._id));
  if (!cursor) {
    // Populated object without a full tree: show its own name + boxId hint.
    return String(ref.name || '');
  }
  const parts = [];
  const seen = new Set();
  while (cursor && !seen.has(String(cursor._id))) {
    seen.add(String(cursor._id));
    parts.unshift(String(cursor.name));
    cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
  }
  return parts.join(' / ');
};

// Display value for a fixed column on an item
const getFixedColumnValue = (item, key, containers) => {
  switch (key) {
    case 'description':
      return String(item.description || '');
    case 'container':
      return getContainerPath(item, containers);
    default:
      return '';
  }
};

// Build a parentId -> children index over the flat container list.
const buildChildrenByParent = (containers) => {
  const map = new Map();
  for (const c of containers || []) {
    const key = c.parentId ? String(c.parentId) : null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return map;
};

// All descendant ids of a container (BFS with cycle guard). Used by the
// ?containerId= filter so "view items" on a parent shows its whole subtree —
// matching how the old location filter behaved for locations.
const collectDescendantIds = (containers, rootId) => {
  const childrenByParent = buildChildrenByParent(containers);
  const descendants = new Set();
  let queue = [...(childrenByParent.get(String(rootId)) || [])];
  while (queue.length > 0) {
    const next = [];
    for (const c of queue) {
      const id = String(c._id);
      if (descendants.has(id)) continue;
      descendants.add(id);
      next.push(...(childrenByParent.get(id) || []));
    }
    queue = next;
  }
  return descendants;
};

// Indented label for the bulk-edit container tree dropdown.
const getContainerTreeLabel = (c, depthMap) => {
  if (!c) return '';
  const indent = '\u00A0'.repeat((depthMap.get(String(c._id)) || 0) * 2);
  return `${indent}${c.kind === 'box' ? '▣ ' : ''}${c.name}`;
};

// Depth of every container (for the tree dropdown indentation).
const computeContainerDepthMap = (containers) => {
  const byId = new Map((containers || []).map(c => [String(c._id), c]));
  const depth = new Map();
  for (const c of containers || []) {
    let d = 0;
    const seen = new Set([String(c._id)]);
    let cursor = c.parentId ? byId.get(String(c.parentId)) : null;
    while (cursor && !seen.has(String(cursor._id))) {
      d += 1;
      seen.add(String(cursor._id));
      cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
    }
    depth.set(String(c._id), d);
  }
  return depth;
};

const ItemListPage = () => {
  const [items, setItems] = useState([]);
  // Stage 3: one flat container list replaces the old boxes + locations lists.
  const [containers, setContainers] = useState([]);
  const [tags, setTags] = useState([]);

  // Search state
  const [searchMode, setSearchMode] = useState('basic'); // 'basic' | 'advanced'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState([
    { id: 1, field: '', operator: 'contains', value: '' }
  ]);

  const [page, setPage] = useState(0);
  // Persisted per-page in sessionStorage; resets to page 0 on change.
  const [rowsPerPage, handleChangeRowsPerPage] = useRowsPerPage('items', () => setPage(0));
  const [selectedItems, setSelectedItems] = useState(new Set());
  // Last row clicked with a plain click; used as the start of Shift+click range selection.
  const [anchorItemId, setAnchorItemId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Stage 5 revision: unified item dialog (view/edit/create). `dialogItem` is the
  // row's item in edit mode or null in create mode — one code path for both.
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState(null);

  const openItemDialog = (targetItem) => {
    setDialogItem(targetItem || null);
    setItemDialogOpen(true);
  };

  // Bulk edit state
  const [bulkEditDescription, setBulkEditDescription] = useState('');
  const [bulkEditDescriptionChanged, setBulkEditDescriptionChanged] = useState(false);
  const [bulkEditTags, setBulkEditTags] = useState(null);     // null = various/unchanged, array = unified value
  const [bulkEditTagsChanged, setBulkEditTagsChanged] = useState(false);
  const [bulkEditTagMode, setBulkEditTagMode] = useState('replace'); // 'replace' | 'add' (append to existing)
  // Stage 3: single "move to container" control replaces the old box/location pair.
  const [bulkEditContainerId, setBulkEditContainerId] = useState(''); // prefilled shared id ('' when none/various)
  const [bulkEditContainerTouched, setBulkEditContainerTouched] = useState(false);

  // Stage 5: attribute dimensions for the active database (dynamic columns +
  // bulk edit). Empty list → no attribute UI anywhere.
  const [dimensions, setDimensions] = useState([]);
  // Bulk edit: one dimension's value across all selected items ('' = clear).
  const [bulkEditAttributeDimId, setBulkEditAttributeDimId] = useState('');
  const [bulkEditAttributeValue, setBulkEditAttributeValue] = useState('');
  const [bulkEditAttributeTouched, setBulkEditAttributeTouched] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Column sort state
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });

  const navigate = useNavigate();
  const { activeDatabaseId } = useDatabases();

  // Active container filter from URL (?containerId=...) — set by "View items" on
  // the Containers page. The URL param is the single source of truth so deep
  // links and back-button work correctly (mirrors the old boxFilterId pattern).
  const [searchParams, setSearchParams] = useSearchParams();
  const containerFilterId = searchParams.get('containerId');

  const clearContainerFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('containerId');
    setSearchParams(next);
  };

  // Active tag filter from URL (?tagId=...) — set by "View Items" on the Tags page.
  const tagFilterId = searchParams.get('tagId');

  const clearTagFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('tagId');
    setSearchParams(next);
  };

  // Load data on mount and whenever the active database changes (clearing any
  // stale selection that belongs to a different database).
  useEffect(() => {
    setSelectedItems(new Set());
    setAnchorItemId(null);
    setPage(0);
    fetchContainers();
    fetchItems();
    fetchTags();
    fetchAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

  // Reset pagination whenever the container or tag filter changes or is cleared
  useEffect(() => {
    setPage(0);
  }, [containerFilterId, tagFilterId]);

  const fetchContainers = async () => {
    try {
      const response = await api.getContainers();
      if (response.success) setContainers(response.data);
    } catch (err) {
      console.error('Error fetching containers:', err);
    }
  };

  const fetchTags = async () => {
    try {
      const response = await api.getTags();
      if (response.success) setTags(response.data);
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  };

  // Stage 5: load the active database's attribute dimensions. A failed fetch
  // just means no dynamic columns — it never blocks the item list itself.
  const fetchAttributes = async () => {
    try {
      const response = await api.getAttributes();
      if (response.success) setDimensions(response.data || []);
    } catch (err) {
      console.error('Error fetching attributes:', err);
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
        aVal = String(getFixedColumnValue(a, field, containers) ?? '');
        bVal = String(getFixedColumnValue(b, field, containers) ?? '');
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
    return searchColumnOptions.find(o => o.id === fieldId) || null;
  };

  // Advanced search: evaluate a single criterion against an item
  const matchesCriterion = (item, criterion) => {
    if (!criterion.field) return true;
    if (criterion.operator !== 'empty' && criterion.operator !== 'not_empty' && !criterion.value.trim()) return true;

    let fieldValue = '';
    if (criterion.field === 'tags') {
      fieldValue = (item.tags || []).map(t => t.name).join(', ');
    } else {
      // The `container` field matches against the full display path.
      fieldValue = getFixedColumnValue(item, criterion.field, containers);
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
        ...FIXED_COLUMNS.map(c => getFixedColumnValue(item, c.key, containers)),
        (item.tags || []).map(t => t.name).join(', ')
      ];
      return values.some(val => String(val ?? '').toLowerCase().includes(query));
    }

    // Advanced mode: all criteria must match (AND logic)
    return searchCriteria.every(criterion => matchesCriterion(item, criterion));
  };

  // Pre-filter by active container from URL (?containerId=...) before
  // search/sort/pagination. An item matches when its container IS the filter or
  // lives anywhere in its subtree — so "view items" on a parent shows everything
  // nested under it (mirrors how the old location filter behaved).
  const containerFilterIds = useMemo(() => {
    if (!containerFilterId) return null;
    return new Set([String(containerFilterId), ...collectDescendantIds(containers, containerFilterId)]);
  }, [containers, containerFilterId]);

  const matchesContainerFilter = (item) => {
    const ref = item.containerId;
    if (!ref || typeof ref !== 'object' || !ref._id) return false;
    return containerFilterIds.has(String(ref._id));
  };

  const containerFilteredItems = containerFilterIds ? items.filter(matchesContainerFilter) : items;

  // Label for the active container filter chip (the full display path).
  const containerFilterLabel = useMemo(() => {
    if (!containerFilterId) return '';
    const match = containers.find(c => String(c._id) === String(containerFilterId));
    return match?.displayPath || 'Unknown container';
  }, [containers, containerFilterId]);

  // Pre-filter by active tag from URL (?tagId=...) before search/sort/pagination.
  // Items without the tag are excluded when the filter is active.
  const matchesTagFilter = (item) => {
    return (item.tags || []).some(t => String(t._id ?? t) === String(tagFilterId));
  };

  const tagFilteredItems = tagFilterId ? containerFilteredItems.filter(matchesTagFilter) : containerFilteredItems;

  // Label for the active tag filter chip (resolved from the tags list)
  const tagFilterLabel = useMemo(() => {
    if (!tagFilterId) return '';
    const match = tags.find(t => String(t._id) === String(tagFilterId));
    return match?.name || 'Unknown tag';
  }, [tags, tagFilterId]);

  const filteredItems = tagFilteredItems.filter(applySearchFilter);

  // ---- Bulk Edit Logic ----
  const selectedItemsList = items.filter(item => selectedItems.has(item._id));

  // Depth map for the bulk-edit container tree dropdown (indentation).
  const containerDepthMap = useMemo(() => computeContainerDepthMap(containers), [containers]);

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

  // Distribution of container assignments across the selection for items that differ.
  // Empty array means all selected items share one container (or none).
  const containerValueSummary = summarizeFieldValues(
    item => String(item.containerId?._id || ''),
    key => {
      if (!key) return 'unassigned';
      const c = containers.find(x => String(x._id) === key);
      return `in ${c ? (c.displayPath || c.name) : '(unknown container)'}`;
    }
  );
  const descriptionValueSummary = summarizeFieldValues(
    item => String(item.description || '').trim(),
    key => {
      if (!key) return '(empty)';
      return `"${key.length > 20 ? `${key.slice(0, 20)}…` : key}"`;
    }
  );

  // Shared tag prefill for replace mode: array if all items share one tag set (possibly empty), null if various.
  const getSharedTagPrefill = () => {
    const tagSets = selectedItemsList.map(item =>
      (item.tags || []).map(t => t.name.toLowerCase()).sort().join(',')
    );
    const uniqueTagSets = new Set(tagSets);
    if (uniqueTagSets.size === 1) {
      return tagSets[0] ? tagSets[0].split(',').filter(Boolean) : [];
    }
    return null; // various
  };

  // Switching modes resets the tags field to its initial state for that mode:
  // replace → shared prefill (or various), add → empty (only entering new tags).
  const handleBulkTagModeChange = (newMode) => {
    if (!newMode || newMode === bulkEditTagMode) return;
    setBulkEditTagMode(newMode);
    setBulkEditTagsChanged(false);
    setBulkEditTags(newMode === 'add' ? [] : getSharedTagPrefill());
  };

  // Initialize bulk edit form when dialog opens: prefill shared values, reset touched flags.
  const openBulkEdit = () => {
    setBulkEditDescriptionChanged(false);
    setBulkEditTagsChanged(false);
    setBulkEditContainerTouched(false);

    // Description: prefill when all items share the same description, else leave empty (various)
    const descriptions = new Set(selectedItemsList.map(item => String(item.description || '').trim()));
    setBulkEditDescription(descriptions.size === 1 ? descriptions.values().next().value : '');

    // Container: prefill shared container id ('' when all unassigned or various —
    // the caption shows the distribution)
    const containerIds = new Set(selectedItemsList.map(item => String(item.containerId?._id || '')));
    setBulkEditContainerId(containerIds.size === 1 ? containerIds.values().next().value : '');

    // Stage 5 attributes: no prefill — the dimension picker starts empty and
    // only applies when the user picks a dimension (and optionally a value).
    setBulkEditAttributeDimId('');
    setBulkEditAttributeValue('');
    setBulkEditAttributeTouched(false);

    // Tags: reset to replace mode and prefill the shared tag set (or null = various).
    setBulkEditTagMode('replace');
    setBulkEditTags(getSharedTagPrefill());

    setBulkEditOpen(true);
  };

  const handleBulkTagsChange = (_, newTags) => {
    setBulkEditTags(newTags || []);
    setBulkEditTagsChanged(true);
  };

  // Single "move to container" control — no XOR clearing logic anymore.
  const handleBulkContainerChange = (newContainerId) => {
    setBulkEditContainerId(newContainerId);
    setBulkEditContainerTouched(true);
  };

  const handleBulkSave = async () => {
    try {
      setLoading(true);

      // --- Update Item documents for description, tags, and container ---
      const itemPromises = Array.from(selectedItems).map(async (itemId) => {
        const item = items.find(i => i._id === itemId);
        const payload = {};
        if (bulkEditDescriptionChanged) {
          payload.description = bulkEditDescription.trim();
        }
        if (bulkEditTagsChanged) {
          if (bulkEditTagMode === 'add') {
            // Append to each item's existing tags, deduped case-insensitively. Empty field = no-op.
            if (bulkEditTags.length > 0) {
              const merged = new Set((item?.tags || []).map(t => t.name.toLowerCase()));
              for (const name of bulkEditTags) merged.add(name.toLowerCase());
              payload.tagNames = [...merged];
            }
          } else {
            payload.tagNames = bulkEditTags.map(name => name.toLowerCase());
          }
        }
        // Container: send explicitly when touched so clearing actually removes the
        // assignment. Only containerId is ever sent — never legacy boxId/locationId.
        if (bulkEditContainerTouched) {
          payload.containerId = bulkEditContainerId || null;
        }
        // Stage 5 attributes: replace the item's whole attribute map with its
        // current values plus/minus this dimension, so other dimensions survive.
        // '' clears the dimension (key omitted → server drops it). The server
        // validates against the vocabulary and returns actionable 400 messages.
        if (bulkEditAttributeTouched && bulkEditAttributeDimId) {
          const dimName = dimensions.find(d => String(d._id) === bulkEditAttributeDimId)?.name;
          if (dimName) {
            const nextAttrs = { ...(item?.attributes || {}) };
            if (bulkEditAttributeValue) nextAttrs[dimName] = bulkEditAttributeValue;
            else delete nextAttrs[dimName];
            payload.attributes = nextAttrs;
          }
        }
        if (Object.keys(payload).length > 0) {
          // NOTE: api.js resolves — it does not throw — on HTTP 400 JSON bodies,
          // so check `success` to surface the server's validation message.
          const response = await api.updateItem(itemId, payload);
          if (!response.success) {
            throw new Error(response.error || 'Server rejected the update');
          }
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
    window.scrollTo({ top: 0 }); // land at the top of the table after paging
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

  // Stage 5 revision: editing opens the unified dialog in place of navigating to
  // the old /edit/:id page (that route still exists until the follow-up cleanup).
  const handleEdit = (item) => {
    openItemDialog(item);
  };

  // Total column count for colSpan: checkbox + fixed columns + tags + created +
  // modified + actions. Stage 5 revision: the dynamic attribute columns are gone —
  // attributes live in the item dialog now, not in the table.
  const totalColumns = 1 + FIXED_COLUMNS.length + 4;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Items</Typography>
        {/* Stage 5 revision: "Add New Item" opens the unified dialog in create
            mode (item === null) — same code path as editing. */}
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openItemDialog(null)}
        >
          Add New Item
        </Button>
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
        columnOptions={FIXED_SEARCH_COLUMN_OPTIONS}
        getSelectedColumnOption={getSelectedColumnOption}
        searchCriteria={searchCriteria}
        addCriterion={addSearchCriterion}
        removeCriterion={removeCriterion}
        updateCriterion={updateCriterion}
        clearAll={clearSearchCriteria}
      />

      {(containerFilterId || tagFilterId) && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          {containerFilterId && (
            <Chip label={`Container: ${containerFilterLabel}`} color="primary" onDelete={clearContainerFilter} />
          )}
          {tagFilterId && (
            <Chip label={`Tag: ${tagFilterLabel}`} color="secondary" onDelete={clearTagFilter} />
          )}
        </Box>
      )}

      <PaginationBar
        sx={{ mb: 1 }}
        count={paginatedCount}
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

              {/* Stage 5 revision: no dynamic attribute columns — the table shows
                  only Description / Container / Tags (+ dates/actions). Attributes
                  are viewed/edited per item in the ItemDialog. */}
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
                  {containerFilterId && !tagFilterId && containerFilteredItems.length === 0
                    ? 'No items in this container.'
                    : tagFilterId && !containerFilterId && tagFilteredItems.length === 0
                      ? 'No items with this tag.'
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
                  {FIXED_COLUMNS.map(col => {
                    // containerId arrives populated ({ _id, name, ... }) or as a raw id.
                    const containerRef = typeof item.containerId === 'object' && item.containerId
                      ? item.containerId._id
                      : item.containerId;
                    return (
                      <TableCell key={col.key}>
                        {col.key === 'description' ? (
                          // Stage 5 revision: the description is clickable and opens
                          // the unified dialog for this item (view + edit in one place).
                          <Typography
                            component="span"
                            sx={{ color: 'primary.main', cursor: 'pointer' }}
                            onClick={() => openItemDialog(item)}
                          >
                            {item.description || '-'}
                          </Typography>
                        ) : col.key === 'container' && containerRef ? (
                          // The display path is a link to the Containers page filtered
                          // to this container (mirrors the old box-link pattern).
                          <Typography
                            component="span"
                            sx={{ color: 'primary.main', cursor: 'pointer' }}
                            onClick={() => navigate(`/containers?containerId=${containerRef}`)}
                          >
                            {getContainerPath(item, containers) || '(unknown container)'}
                          </Typography>
                        ) : (
                          getFixedColumnValue(item, col.key, containers) || '-'
                        )}
                      </TableCell>
                    );
                  })}
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
                      <IconButton onClick={() => handleEdit(item)} size="small">
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

      <PaginationBar
        variant="bottom"
        sx={{ mt: 1 }}
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

      {/* Unified item dialog — view/edit (item set) or create (item === null).
          On successful save it closes itself and asks the list to refresh. */}
      <ItemDialog
        open={itemDialogOpen}
        onClose={() => setItemDialogOpen(false)}
        item={dialogItem}
        onSaved={fetchItems}
      />

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
                Various — items have different tags. Setting new tags will replace all existing tags on selected items.
              </Typography>
            )}
            {/* MUI v9 renders multiple-mode chips via the built-in chip slot —
                the old renderTags prop no longer exists and leaks to the DOM. */}
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : ''}
              value={bulkEditTags ?? []}
              onChange={handleBulkTagsChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder={bulkEditTagMode === 'add' ? 'Type a tag and press Enter to add it...' : (bulkEditTags === null ? 'Type to set tags for all items...' : 'Add tags...')}
                  helperText={bulkEditTagMode === 'add' ? "Adds to each item's existing tags; duplicates are ignored." : 'Replaces all existing tags on selected items.'}
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

          <Divider sx={{ my: 2 }} />

          {/* Move to container — single tree dropdown replacing the old box/location pair */}
          <Box sx={{ mb: 2 }}>
            {containerValueSummary.length > 0 && !bulkEditContainerTouched && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                Various — {formatDistribution(containerValueSummary)}
              </Typography>
            )}
            <Autocomplete
              options={containers}
              value={bulkEditContainerId ? containers.find(c => String(c._id) === bulkEditContainerId) || null : null}
              onChange={(e, newValue) => handleBulkContainerChange(newValue?._id || '')}
              getOptionLabel={(c) => (c ? c.displayPath || c.name : '')}
              isOptionEqualToValue={(option, val) => option && val && String(option._id) === String(val._id)}
              filterOptions={(options, params) => {
                const query = (params.inputValue || '').trim().toLowerCase();
                if (!query) return options;
                return options.filter(c => (c.displayPath || c.name).toLowerCase().includes(query));
              }}
              noOptionsText="No matching containers"
              renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                return (
                  <li key={key} {...optionProps}>
                    <Typography variant="body2">
                      {'\u00A0'.repeat((containerDepthMap.get(String(option._id)) || 0) * 2)}
                      {option.kind === 'box' ? '▣ ' : ''}{option.name}
                      {option.boxId ? ` (${option.boxId})` : ''}
                    </Typography>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Move to Container"
                  placeholder={containerValueSummary.length > 0 && !bulkEditContainerTouched ? 'Various — type to search or select a container...' : 'Type to search or select a container...'}
                  helperText="Clear the field to remove items from their current container."
                  sx={{ backgroundColor: bulkEditContainerTouched ? '#c8e6c9' : (containerValueSummary.length > 0 ? '#fff3e0' : 'inherit'), borderRadius: 1 }}
                />
              )}
            />
          </Box>

          {dimensions.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />

              {/* Stage 5 attributes — set/clear one dimension's value across all
                  selected items. Validated server-side; 400 messages surface in the page alert. */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Attributes</Typography>
                <Autocomplete
                  options={dimensions}
                  value={bulkEditAttributeDimId ? dimensions.find(d => String(d._id) === bulkEditAttributeDimId) || null : null}
                  onChange={(e, newValue) => {
                    setBulkEditAttributeDimId(newValue?._id || '');
                    setBulkEditAttributeValue('');
                    if (newValue) setBulkEditAttributeTouched(true);
                  }}
                  getOptionLabel={(d) => d?.name || ''}
                  isOptionEqualToValue={(option, val) => option && val && String(option._id) === String(val._id)}
                  renderInput={(params) => (
                    <TextField {...params} label="Dimension" placeholder="(none)" helperText="Pick a dimension to set or clear its value on all selected items." />
                  )}
                />
                {bulkEditAttributeDimId && (
                  <Autocomplete
                    options={dimensions.find(d => String(d._id) === bulkEditAttributeDimId)?.values || []}
                    value={bulkEditAttributeValue}
                    onChange={(e, newValue) => {
                      setBulkEditAttributeValue(newValue || '');
                      setBulkEditAttributeTouched(true);
                    }}
                    getOptionLabel={(v) => v}
                    noOptionsText="No values defined for this dimension"
                    renderInput={(params) => (
                      <TextField {...params} label="Value" placeholder="(clear)" helperText="Clear the field to remove this attribute from all selected items." />
                    )}
                  />
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkEditOpen(false)}>Cancel</Button>
          <Button
            onClick={handleBulkSave}
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={!bulkEditDescriptionChanged && !bulkEditTagsChanged && !bulkEditContainerTouched && !(bulkEditAttributeTouched && bulkEditAttributeDimId)}
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

    </Container>
  );
};

export default ItemListPage;
