import React, { useState, useEffect } from 'react';
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
  Chip,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';

// Stage 5 of plans/container-tree-and-attributes-plan.md — dimension management.
// Lists the active database's attribute dimensions with live usage counts;
// creates dimensions; edits each value list (add/remove, with usage-count
// warnings before removing an in-use value); renames/deletes with guard
// messaging when the server blocks by usage. Layout/dialog conventions mirror
// TagListPage. NOTE: api.js request() resolves — it does not throw — on HTTP 400
// JSON bodies, so every call below checks `success` and surfaces `error`.
//
// Stage 5 rev2: dimensions carry a dataType (number/string/mixed) + optional
// unit. Both are editable in the create/edit dialogs (Data type select + Unit
// pick-or-type Autocomplete freeSolo seeded with common units) and shown as
// their own table columns.

// Common-unit seed options for the Unit field (freeSolo — any custom text works).
const UNIT_OPTIONS = [
  'Pound (lb)',
  'Gram (g)',
  'Ohm (Ω)',
  'Farad (F)',
  'Volt (V)',
  'Ampere (A)',
  'Watt (W)',
  'Meter (m)',
  'Millimeter (mm)',
  'Inch (in)',
];

// Data type select options: stored value -> display label.
const DATA_TYPE_OPTIONS = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'mixed', label: 'Mixed' },
];

const AttributeListPage = () => {
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValues, setNewValues] = useState([]);
  // Stage 5 rev2: data type + unit (defaults match the server's).
  const [newDataType, setNewDataType] = useState('string');
  const [newUnit, setNewUnit] = useState('');
  const [createError, setCreateError] = useState(null);

  // Edit dialog state (rename + value list editing)
  const [editOpen, setEditOpen] = useState(false);
  const [editingDim, setEditingDim] = useState(null);
  const [newName2, setNewName2] = useState('');
  const [pendingValues, setPendingValues] = useState([]);
  // Stage 5 rev2: data type + unit editing (saved via the Save button below).
  const [editDataType, setEditDataType] = useState('string');
  const [editUnit, setEditUnit] = useState('');
  const [editError, setEditError] = useState(null);
  const [renameNote, setRenameNote] = useState(null);

  // Remove-value confirmation (usage-count warning before a blocked removal)
  const [removeValueDialog, setRemoveValueDialog] = useState(null); // { value, count }

  // Delete-dimension confirmation
  const [deleteDim, setDeleteDim] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const { activeDatabaseId } = useDatabases();

  // Load dimensions on mount and whenever the active database changes.
  useEffect(() => {
    fetchAttributes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

  const fetchAttributes = async () => {
    try {
      setLoading(true);
      const response = await api.getAttributes();
      if (response.success) {
        setDimensions(response.data || []);
        setError(null);
      } else {
        setError('Failed to load attributes: ' + (response.error || ''));
      }
    } catch (err) {
      setError('Error loading attributes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Create dimension ------------------------------------------------------

  const handleOpenCreate = () => {
    setNewName('');
    setNewValues([]);
    // Stage 5 rev2 defaults — match the server's (string / no unit).
    setNewDataType('string');
    setNewUnit('');
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreateError(null);
  };

  const handleCreateSave = async () => {
    if (!newName.trim()) return;
    try {
      // Stage 5 rev2: dataType + unit travel with the create payload.
      const response = await api.createAttribute({ name: newName, values: newValues, dataType: newDataType, unit: newUnit });
      if (response.success) {
        handleCloseCreate();
        fetchAttributes();
      } else {
        setCreateError(response.error || 'Failed to create dimension');
      }
    } catch (err) {
      setCreateError('Error creating dimension: ' + err.message);
    }
  };

  // --- Edit dimension (rename + values) --------------------------------------

  const handleOpenEdit = (dim) => {
    setEditingDim(dim);
    setNewName2(dim.name);
    setPendingValues([]);
    // Stage 5 rev2: prefill data type + unit from the dimension (defaults for
    // pre-existing documents without the fields).
    setEditDataType(dim.dataType || 'string');
    setEditUnit(dim.unit || '');
    setEditError(null);
    setRenameNote(null);
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditingDim(null);
    setEditError(null);
    setRenameNote(null);
  };

  // Stage 5 rev2: save data type + unit (PUT with only those fields). The Save
  // button is disabled while they match the dimension's current values.
  const propertiesDirty = Boolean(editingDim) && (
    editDataType !== (editingDim.dataType || 'string') ||
    editUnit !== (editingDim.unit || '')
  );

  const handleSaveProperties = async () => {
    if (!editingDim || !propertiesDirty) return;
    try {
      const response = await api.updateAttribute(editingDim._id, { dataType: editDataType, unit: editUnit });
      if (response.success) {
        setEditError(null);
        fetchAttributes();
      } else {
        setEditError(response.error || 'Failed to save data type / unit');
      }
    } catch (err) {
      setEditError('Error saving data type / unit: ' + err.message);
    }
  };

  // Rename: PUT with only the name. The server rewrites the key on every item
  // that uses the dimension and reports itemsRewritten.
  const handleRenameSave = async () => {
    if (!editingDim || !newName2.trim()) return;
    try {
      const response = await api.updateAttribute(editingDim._id, { name: newName2 });
      if (response.success) {
        setNewName2(response.data.name);
        const rewritten = response.data.itemsRewritten || 0;
        setRenameNote(rewritten > 0 ? `Renamed — ${rewritten} item(s) updated.` : 'Renamed.');
        setEditError(null);
        fetchAttributes();
      } else {
        setEditError(response.error || 'Failed to rename dimension');
      }
    } catch (err) {
      setEditError('Error renaming dimension: ' + err.message);
    }
  };

  // Add values: POST the pending list; the server trims/dedupes and reports added.
  const handleAddValues = async () => {
    if (!editingDim || pendingValues.length === 0) return;
    try {
      const response = await api.addAttributeValues(editingDim._id, pendingValues);
      if (response.success) {
        setPendingValues([]);
        setEditError(null);
        fetchAttributes();
      } else {
        setEditError(response.error || 'Failed to add values');
      }
    } catch (err) {
      setEditError('Error adding values: ' + err.message);
    }
  };

  // Remove one value. In-use values get a usage-count warning first; the server
  // still blocks with its own message if usage appeared in the meantime.
  const handleRemoveValueClick = (value) => {
    const count = editingDim?.valueCounts?.[value] || 0;
    if (count > 0) {
      setRemoveValueDialog({ value, count });
    } else {
      doRemoveValue(value);
    }
  };

  const doRemoveValue = async (value) => {
    try {
      const response = await api.removeAttributeValues(editingDim._id, [value]);
      if (!response.success) {
        setEditError(response.error || 'Failed to remove value');
      } else {
        fetchAttributes();
      }
    } catch (err) {
      setEditError('Error removing value: ' + err.message);
    } finally {
      setRemoveValueDialog(null);
    }
  };

  // --- Delete dimension ------------------------------------------------------

  const handleDeleteClick = (dim) => {
    setDeleteDim(dim);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await api.deleteAttribute(deleteDim._id);
      if (response.success) {
        setDeleteDim(null);
        fetchAttributes();
      } else {
        // Blocked by usage — surface the server's count-bearing message.
        setDeleteError(response.error || 'Failed to delete dimension');
      }
    } catch (err) {
      setDeleteError('Error deleting dimension: ' + err.message);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Attributes</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Add Dimension
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Name</strong></TableCell>
              {/* Stage 5 rev2: data type + unit columns */}
              <TableCell><strong>Type</strong></TableCell>
              <TableCell><strong>Unit</strong></TableCell>
              <TableCell><strong>Values (usage)</strong></TableCell>
              <TableCell align="right"><strong>Items</strong></TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center' }}>Loading...</TableCell>
              </TableRow>
            ) : dimensions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center' }}>
                  No attribute dimensions defined for this database. Add one to classify items by footprint, tolerance, value, and so on.
                </TableCell>
              </TableRow>
            ) : (
              dimensions.map(dim => (
                <TableRow key={dim._id}>
                  <TableCell><strong>{dim.name}</strong></TableCell>
                  {/* Stage 5 rev2: data type + unit (defaults for legacy docs) */}
                  <TableCell>
                    {(dim.dataType || 'string').charAt(0).toUpperCase() + (dim.dataType || 'string').slice(1)}
                  </TableCell>
                  <TableCell>
                    {dim.unit ? dim.unit : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {(dim.values || []).map(v => {
                      const count = dim.valueCounts?.[v] || 0;
                      return (
                        <Chip
                          key={v}
                          size="small"
                          label={count > 0 ? `${v} (${count})` : v}
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      );
                    })}
                  </TableCell>
                  <TableCell align="right">{dim.itemCount || 0}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit Dimension">
                      <IconButton onClick={() => handleOpenEdit(dim)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Dimension">
                      <IconButton onClick={() => handleDeleteClick(dim)} size="small" color="error">
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

      {/* Create Dimension Dialog */}
      <Dialog open={createOpen} onClose={handleCloseCreate}>
        <DialogTitle>Add New Dimension</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>
          )}
          <TextField
            label="Dimension Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            margin="normal"
            helperText='e.g., footprint, tolerance. Cannot contain "." or start with "$"; names are case-insensitive.'
            autoFocus
          />
          <Box sx={{ mt: 2 }}>
            {/* MUI v9 renders multiple-mode chips via the built-in chip slot —
                the old renderTags prop no longer exists and leaks to the DOM. */}
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              getOptionLabel={(opt) => opt}
              value={newValues}
              onChange={(e, newValue) => setNewValues(newValue || [])}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Initial Values (optional)"
                  placeholder="Type a value and press Enter..."
                  helperText="The controlled vocabulary items may take for this dimension."
                />
              )}
            />
          </Box>

          {/* Stage 5 rev2: data type + unit */}
          <TextField
            select
            label="Data Type"
            fullWidth
            value={newDataType}
            onChange={(e) => setNewDataType(e.target.value)}
            margin="normal"
            helperText='How free-input values are checked when this dimension has no values. "Number" requires a parseable number.'
          >
            {DATA_TYPE_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
          <Box sx={{ mt: 2 }}>
            <Autocomplete
              freeSolo
              options={UNIT_OPTIONS}
              getOptionLabel={(opt) => opt}
              value={newUnit}
              onChange={(e, newValue) => setNewUnit(newValue || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Unit (optional)"
                  placeholder="Pick or type a unit..."
                  helperText='Shown after the value input on items. Leave empty for none.'
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreate}>Cancel</Button>
          <Button onClick={handleCreateSave} variant="contained" disabled={!newName.trim()}>
            Add Dimension
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dimension Dialog — rename + value list editing */}
      <Dialog open={editOpen} onClose={handleCloseEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Dimension</DialogTitle>
        <DialogContent dividers>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>
          )}
          {renameNote && (
            <Alert severity="success" sx={{ mb: 2 }}>{renameNote}</Alert>
          )}

          {/* Rename */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              label="Dimension Name"
              fullWidth
              value={newName2}
              onChange={(e) => setNewName2(e.target.value)}
            />
            <Button
              variant="contained"
              disabled={!newName2.trim() || newName2.trim() === editingDim?.name}
              onClick={handleRenameSave}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Rename
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Renaming rewrites the attribute key on every item that uses this dimension.
          </Typography>

          {/* Stage 5 rev2: data type + unit (saved via the Save button below) */}
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Data Type & Unit</Typography>
          <TextField
            select
            label="Data Type"
            fullWidth
            value={editDataType}
            onChange={(e) => setEditDataType(e.target.value)}
            helperText='How free-input values are checked when this dimension has no values. "Number" requires a parseable number.'
          >
            {DATA_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </TextField>
          <Box sx={{ mt: 2 }}>
            <Autocomplete
              freeSolo
              options={UNIT_OPTIONS}
              getOptionLabel={(opt) => opt}
              value={editUnit}
              onChange={(e, newValue) => setEditUnit(newValue || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Unit (optional)"
                  placeholder="Pick or type a unit..."
                  helperText='Shown after the value input on items. Leave empty for none.'
                />
              )}
            />
          </Box>

          {/* Value list */}
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Values</Typography>
          {editError === null && (editingDim?.values || []).length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No values defined yet.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {(editingDim?.values || []).map(v => {
              const count = editingDim?.valueCounts?.[v] || 0;
              return (
                <Chip
                  key={v}
                  size="small"
                  label={count > 0 ? `${v} (${count})` : v}
                  onDelete={() => handleRemoveValueClick(v)}
                  deleteIcon={<DeleteIcon fontSize="inherit" />}
                />
              );
            })}
          </Box>
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            getOptionLabel={(opt) => opt}
            value={pendingValues}
            onChange={(e, newValue) => setPendingValues(newValue || [])}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Type a value and press Enter..."
                helperText="Values in use cannot be removed until items stop using them."
              />
            )}
          />
          {pendingValues.length > 0 && (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAddValues} sx={{ mt: 1 }}>
              Add {pendingValues.length} Value{pendingValues.length > 1 ? 's' : ''}
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          {/* Stage 5 rev2: persists data type + unit when changed (disabled otherwise). */}
          <Button
            variant="contained"
            disabled={!propertiesDirty}
            onClick={handleSaveProperties}
            sx={{ mr: 'auto' }}
          >
            Save Data Type / Unit
          </Button>
          <Button onClick={handleCloseEdit}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* Remove-Value Confirmation — usage-count warning before a blocked removal */}
      <Dialog open={Boolean(removeValueDialog)} onClose={() => setRemoveValueDialog(null)}>
        <DialogTitle>Remove Value</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Value "{removeValueDialog?.value}" is used by {removeValueDialog?.count} item(s). The
            server will block the removal until those items are cleared — do you still want to try?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveValueDialog(null)}>Cancel</Button>
          <Button
            onClick={() => doRemoveValue(removeValueDialog?.value)}
            variant="contained"
            color="error"
          >
            Try to Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dimension Confirmation */}
      <Dialog open={Boolean(deleteDim)} onClose={() => setDeleteDim(null)}>
        <DialogTitle>Delete Dimension</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>
          )}
          <DialogContentText>
            Are you sure you want to delete dimension "{deleteDim?.name}"?
            {(deleteDim?.itemCount || 0) > 0 ? (
              <> This will be blocked because {deleteDim.itemCount} item(s) still use it — clear the attribute from those items first.</>
            ) : (
              ' It has no items using it, so deletion is safe.'
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDim(null)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AttributeListPage;
