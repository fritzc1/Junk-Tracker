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

  // Edit dialog state — Stage 5 rev4: single-commit model. All fields are local
  // draft state; nothing is sent to the server until "Save Attribute" submits
  // everything in one PUT (error -> shown + stay open; success -> close).
  const [editOpen, setEditOpen] = useState(false);
  const [editingDim, setEditingDim] = useState(null);
  const [editName, setEditName] = useState('');
  const [editValues, setEditValues] = useState([]); // live chip list (local)
  const [addValueInput, setAddValueInput] = useState('');
  const [editDataType, setEditDataType] = useState('string');
  const [editUnit, setEditUnit] = useState('');
  const [editError, setEditError] = useState(null);

  // Remove-value confirmation — deterministic notice that in-use values are
  // removed from the allowed list while existing items keep their value.
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
        setCreateError(response.error || 'Failed to create attribute');
      }
    } catch (err) {
      setCreateError('Error creating attribute: ' + err.message);
    }
  };

  // --- Edit attribute (single-commit dialog, Stage 5 rev4) --------------------

  const handleOpenEdit = (dim) => {
    setEditingDim(dim);
    setEditName(dim.name);
    setEditValues([...(dim.values || [])]);
    setAddValueInput('');
    // Prefill data type + unit from the attribute (defaults for pre-existing
    // documents without the fields).
    setEditDataType(dim.dataType || 'string');
    setEditUnit(dim.unit || '');
    setEditError(null);
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditingDim(null);
    setEditError(null);
  };

  // True when any draft field differs from the server's current values.
  const editDirty = Boolean(editingDim) && (
    editName.trim() !== editingDim.name ||
    JSON.stringify([...editValues].sort()) !== JSON.stringify([...(editingDim.values || [])].sort()) ||
    editDataType !== (editingDim.dataType || 'string') ||
    editUnit !== (editingDim.unit || '')
  );

  // One PUT with the full draft: name + values (complete list) + dataType + unit.
  const handleEditSubmit = async () => {
    if (!editingDim || !editName.trim()) return;
    try {
      const response = await api.updateAttribute(editingDim._id, {
        name: editName,
        values: editValues,
        dataType: editDataType,
        unit: editUnit,
      });
      if (response.success) {
        handleCloseEdit();
        fetchAttributes();
      } else {
        setEditError(response.error || 'Failed to save attribute');
      }
    } catch (err) {
      setEditError('Error saving attribute: ' + err.message);
    }
  };

  // Remove one value from the local draft. In-use values get a deterministic
  // confirmation first; either way removal only touches local state — the
  // server sees it on Save (existing items keep their current value).
  const handleRemoveValueClick = (value) => {
    const count = editingDim?.valueCounts?.[value] || 0;
    if (count > 0) {
      setRemoveValueDialog({ value, count });
    } else {
      removeValueFromDraft(value);
    }
  };

  const removeValueFromDraft = (value) => {
    setEditValues(prev => prev.filter(v => v !== value));
    setRemoveValueDialog(null);
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
        setDeleteError(response.error || 'Failed to delete attribute');
      }
    } catch (err) {
      setDeleteError('Error deleting attribute: ' + err.message);
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
          Add Attribute
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
                  No attributes defined for this database. Add one to classify items by length, thread size, electrical value, and so on.
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
                    <Tooltip title="Edit Attribute">
                      <IconButton onClick={() => handleOpenEdit(dim)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Attribute">
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

      {/* Create Attribute Dialog */}
      <Dialog open={createOpen} onClose={handleCloseCreate}>
        <DialogTitle>Add New Attribute</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>
          )}
          <TextField
            label="Attribute Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            margin="normal"
            helperText='e.g., length, thread size, resistance. Cannot contain "." or start with "$"; names are case-insensitive.'
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
                  label="Allowed Values (optional)"
                  placeholder="Type a value and press Enter..."
                  helperText="Optional list of values this attribute may take. Leave empty for free input."
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
            helperText='How free-input values are checked when this attribute has no allowed values. "Number" requires a parseable number.'
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
            Add Attribute
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Attribute Dialog — Stage 5 rev4: single-commit. All fields are
          local draft state; "Save Attribute" submits everything in one PUT,
          shows the server's error and stays open on failure, closes on success. */}
      <Dialog open={editOpen} onClose={handleCloseEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Attribute</DialogTitle>
        <DialogContent dividers>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>
          )}

          {/* Name */}
          <TextField
            label="Attribute Name"
            fullWidth
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            margin="normal"
            helperText='Renaming rewrites the attribute key on every item that uses it.'
          />

          {/* Data type + unit */}
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Data Type & Unit</Typography>
          <TextField
            select
            label="Data Type"
            fullWidth
            value={editDataType}
            onChange={(e) => setEditDataType(e.target.value)}
            helperText='How free-input values are checked when this attribute has no allowed values. "Number" requires a parseable number.'
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

          {/* Allowed values — live local chips; add/remove only touch draft state */}
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Allowed Values</Typography>
          {editValues.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No allowed values — items will use free input.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {editValues.map(v => (
              <Chip
                key={v}
                size="small"
                label={v}
                onDelete={() => handleRemoveValueClick(v)}
                deleteIcon={<DeleteIcon fontSize="inherit" />}
              />
            ))}
          </Box>
          <Autocomplete
            freeSolo
            options={[]}
            getOptionLabel={(opt) => opt}
            value={addValueInput}
            onChange={(e, newValue) => setAddValueInput(newValue || '')}
            onInputChange={(e, newValue) => setAddValueInput(newValue || '')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const v = addValueInput.trim();
                if (v && !editValues.includes(v)) setEditValues(prev => [...prev, v]);
                setAddValueInput('');
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Type a value and press Enter..."
                helperText="Removing a value keeps it on existing items; new or changed values can no longer use it."
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancel</Button>
          <Button onClick={handleEditSubmit} variant="contained" disabled={!editName.trim() || !editDirty}>
            Save Attribute
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove-Value Confirmation — deterministic notice for in-use values */}
      <Dialog open={Boolean(removeValueDialog)} onClose={() => setRemoveValueDialog(null)}>
        <DialogTitle>Remove Value</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Value "{removeValueDialog?.value}" is currently used by {removeValueDialog?.count}{' '}
            item(s). Removing it from the allowed values will NOT change those items — they keep
            their current value. New or changed values can no longer use "{removeValueDialog?.value}".
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveValueDialog(null)}>Cancel</Button>
          <Button
            onClick={() => removeValueFromDraft(removeValueDialog?.value)}
            variant="contained"
            color="warning"
          >
            Remove Value
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Attribute Confirmation */}
      <Dialog open={Boolean(deleteDim)} onClose={() => setDeleteDim(null)}>
        <DialogTitle>Delete Attribute</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>
          )}
          <DialogContentText>
            Are you sure you want to delete attribute "{deleteDim?.name}"?
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
