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
  Storage as StorageIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import SearchBar from '../components/SearchBar';
import useRowsPerPage from '../hooks/useRowsPerPage';

// Fixed column set for the locations table (from the Location entity's real fields)
const FIXED_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'subLocation', label: 'Sub-Location' },
];

// Advanced search column options (fixed set)
const SEARCH_COLUMN_OPTIONS = [
  ...FIXED_COLUMNS.map(c => ({ id: c.key, label: c.label })),
  { id: 'boxCount', label: 'Boxes' },
  { id: 'directItemCount', label: 'Direct Items' },
];

// Display value for a fixed column on a location
const getFixedColumnValue = (loc, key) => {
  switch (key) {
    case 'name':
      return String(loc.name || '');
    case 'subLocation':
      return String(loc.subLocation || '');
    default:
      return '';
  }
};

const LocationListPage = () => {
  const [locations, setLocations] = useState([]);
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
  const [rowsPerPage, handleChangeRowsPerPage] = useRowsPerPage('locations', () => setPage(0));

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const response = await api.getLocations();
      if (response.success) {
        setLocations(response.data);
      } else {
        setError('Failed to load locations');
      }
    } catch (err) {
      setError('Error loading locations: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = () => {
    navigate('/location-entry');
  };

  const handleEditLocation = (id) => {
    navigate(`/location-edit/${id}`);
  };

  const handleViewBoxes = (id) => {
    navigate(`/boxes?locationId=${id}`);
  };

  const handleDeleteClick = (loc) => {
    setLocationToDelete(loc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.deleteLocation(locationToDelete._id);
      fetchLocations();
    } catch (err) {
      setError('Error deleting location: ' + err.message);
    } finally {
      setDeleteDialogOpen(false);
      setLocationToDelete(null);
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
  const getSelectedLocationOption = (fieldId) => {
    if (!fieldId) return null;
    return SEARCH_COLUMN_OPTIONS.find(o => o.id === fieldId) || null;
  };

  // Evaluate a single criterion against a location column
  const matchesCriterion = (loc, criterion) => {
    if (!criterion.field) return true;
    if (criterion.operator !== 'empty' && criterion.operator !== 'not_empty' && !criterion.value.trim()) return true;

    let fieldValue = '';
    if (criterion.field === 'boxCount') {
      fieldValue = String(loc.boxCount || 0);
    } else if (criterion.field === 'directItemCount') {
      fieldValue = String(loc.directItemCount || 0);
    } else {
      fieldValue = getFixedColumnValue(loc, criterion.field);
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

  const applySearchFilter = (loc) => {
    if (searchMode === 'basic') {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      // Search across all location columns + counts
      const values = [
        ...FIXED_COLUMNS.map(c => getFixedColumnValue(loc, c.key)),
        String(loc.boxCount || 0),
        String(loc.directItemCount || 0)
      ];
      return values.some(v => String(v ?? '').toLowerCase().includes(q));
    }
    // Advanced mode: all criteria must match (AND logic)
    return searchCriteria.every(criterion => matchesCriterion(loc, criterion));
  };

  const filteredLocations = locations.filter(applySearchFilter);

  // Sorting state and helpers
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSortClick = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Extract a comparable sort value for a location column
  const getLocationSortValue = (loc, key) => {
    if (key === 'boxCount') return loc.boxCount || 0;
    if (key === 'directItemCount') return loc.directItemCount || 0;
    const val = getFixedColumnValue(loc, key);
    if (!val) return '';
    const num = Number(val);
    return !isNaN(num) ? num : String(val).toLowerCase();
  };

  const sortedLocations = useMemo(() => {
    if (!sortConfig.key) return filteredLocations;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredLocations].sort((a, b) => {
      const va = getLocationSortValue(a, sortConfig.key);
      const vb = getLocationSortValue(b, sortConfig.key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      // Empty values always sink to the bottom regardless of direction
      if (va === '' && vb !== '') return 1;
      if (vb === '' && va !== '') return -1;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filteredLocations, sortConfig]);

  // Pagination (client-side over the filtered + sorted list)
  const paginatedLocations = sortedLocations.slice(
    page * rowsPerPage,
    page * rowsPerPage + (rowsPerPage === -1 ? sortedLocations.length : rowsPerPage)
  );

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  // Total column count for colSpan: fixed columns + boxes + direct items + actions
  const totalColumns = FIXED_COLUMNS.length + 3;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="h4">Locations</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddLocation}
        >
          Add Location
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
        placeholder="Search locations by name or sub-location..."
        mode={searchMode}
        setMode={setSearchMode}
        columnOptions={SEARCH_COLUMN_OPTIONS}
        getSelectedColumnOption={getSelectedLocationOption}
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
              <TableCell align="right" sx={{ cursor: 'pointer' }} onClick={() => handleSortClick('boxCount')}>
                <TableSortLabel active={sortConfig.key === 'boxCount'} direction={sortConfig.key === 'boxCount' ? sortConfig.direction : 'asc'}>
                  Boxes
                </TableSortLabel>
              </TableCell>
              <TableCell align="right" sx={{ cursor: 'pointer' }} onClick={() => handleSortClick('directItemCount')}>
                <TableSortLabel active={sortConfig.key === 'directItemCount'} direction={sortConfig.key === 'directItemCount' ? sortConfig.direction : 'asc'}>
                  Direct Items
                </TableSortLabel>
              </TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={totalColumns} sx={{ textAlign: 'center' }}>Loading...</TableCell>
              </TableRow>
            ) : filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumns} sx={{ textAlign: 'center' }}>
                  {locations.length === 0
                    ? 'No locations found. Add a location to get started.'
                    : 'No locations match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedLocations.map(loc => (
                <TableRow key={loc._id}>
                  {FIXED_COLUMNS.map(col => (
                    <TableCell key={col.key}>{getFixedColumnValue(loc, col.key) || ''}</TableCell>
                  ))}
                  <TableCell align="right">{loc.boxCount || 0}</TableCell>
                  <TableCell align="right">{loc.directItemCount || 0}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Boxes">
                      <IconButton onClick={() => handleViewBoxes(loc._id)} size="small">
                        <StorageIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit Location">
                      <IconButton onClick={() => handleEditLocation(loc._id)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Location">
                      <IconButton onClick={() => handleDeleteClick(loc)} size="small" color="error">
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
        count={sortedLocations.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50, { label: 'All', value: -1 }]}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Location</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete location "{locationToDelete?.name}"{locationToDelete?.subLocation ? ` — ${locationToDelete.subLocation}` : ''}? This action cannot be undone.
            {locationToDelete?.boxCount > 0 && (
              <Box component="span" display="block" mt={1} color="error.main">
                This location has {locationToDelete.boxCount} box(es). You must remove or reassign them first.
              </Box>
            )}
            {locationToDelete?.directItemCount > 0 && (
              <Box component="span" display="block" mt={1} color="error.main">
                This location has {locationToDelete.directItemCount} item(s) directly assigned. You must remove or reassign them first.
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
            disabled={(locationToDelete?.boxCount || 0) > 0 || (locationToDelete?.directItemCount || 0) > 0}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default LocationListPage;
