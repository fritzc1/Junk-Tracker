import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  IconButton,
  Tooltip,
  Box,
  Typography,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TableSortLabel,
  TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  List as ListIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import SearchBar from '../components/SearchBar';

// Fixed column set for the boxes table. Values resolve from entity references:
//   Box ID    → box.boxId
//   Location  → Location entity via box.locationId (name + subLocation)
const FIXED_COLUMNS = [
  { key: 'boxId', label: 'Box ID' },
  { key: 'location', label: 'Location' },
];

// Advanced search column options (fixed set)
const SEARCH_COLUMN_OPTIONS = [
  ...FIXED_COLUMNS.map(c => ({ id: c.key, label: c.label })),
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
    default:
      return '';
  }
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
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [boxToDelete, setBoxToDelete] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBoxes();
  }, []);

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
        String(box.itemCount || 0)
      ];
      return values.some(v => String(v ?? '').toLowerCase().includes(q));
    }
    // Advanced mode: all criteria must match (AND logic)
    return searchCriteria.every(criterion => matchesCriterion(box, criterion));
  };

  const filteredBoxes = boxes.filter(applySearchFilter);

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
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(event.target.value === 'all' ? -1 : parseInt(event.target.value, 10));
    setPage(0);
  };

  // Total column count for colSpan: fixed columns + last modified + items + actions
  const totalColumns = FIXED_COLUMNS.length + 3;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="h4">Boxes</Typography>
        </Box>
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {FIXED_COLUMNS.map(col => (
                <TableCell key={col.key} sx={{ cursor: 'pointer' }} onClick={() => handleSortClick(col.key)}>
                  <TableSortLabel active={sortConfig.key === col.key} direction={sortConfig.key === col.key ? sortConfig.direction : 'asc'}>
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
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
                    : 'No boxes match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedBoxes.map(box => (
                <TableRow key={box._id}>
                  {FIXED_COLUMNS.map(col => (
                    <TableCell key={col.key}>{getFixedColumnValue(box, col.key) || ''}</TableCell>
                  ))}
                  <TableCell>{new Date(box.updatedAt).toLocaleString()}</TableCell>
                  <TableCell align="right">{box.itemCount || 0}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Items">
                      <IconButton onClick={() => handleViewItems(box._id)} size="small">
                        <ListIcon />
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

      <TablePagination
        component="div"
        count={sortedBoxes.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50, { label: 'All', value: -1 }]}
      />

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
