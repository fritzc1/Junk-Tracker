import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { api, getActiveDatabaseId } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';

// Headers for raw fetch calls (export/import/clear) that bypass the api helper.
const dbHeaders = () => {
  const id = getActiveDatabaseId();
  return id ? { 'X-Database-Id': id } : {};
};

// Parse a JSON response body, falling back to a readable error when the server
// returns an empty or non-JSON body (e.g. backend down / proxy failure).
const parseJsonResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned a non-JSON response (HTTP ${response.status}). Is the backend running?`
    );
  }
};

const DatabasesPage = () => {
  const navigate = useNavigate();
  const { databases, activeDatabase, selectDatabase, refreshDatabases, loading: dbLoading } = useDatabases();

  // ---- Create / rename state ----
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [renameTarget, setRenameTarget] = useState(null); // database being renamed
  const [renameValue, setRenameValue] = useState('');

  // ---- Delete state ----
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ---- Export state ----
  const [exportFormat, setExportFormat] = useState('csv');

  // ---- Import state (moved from SettingsPage) ----
  const fileInputRef = useRef(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importColumns, setImportColumns] = useState([]);
  const [importRowCount, setImportRowCount] = useState(0);
  const [mappingLocationCol, setMappingLocationCol] = useState('');
  const [mappingSubLocationCol, setMappingSubLocationCol] = useState('');
  const [mappingBoxIdCol, setMappingBoxIdCol] = useState('');
  const [mappingDescriptionCol, setMappingDescriptionCol] = useState('');
  const [mappingTagsCol, setMappingTagsCol] = useState('');
  const [mappingCreatedCol, setMappingCreatedCol] = useState('');
  const [mappingModifiedCol, setMappingModifiedCol] = useState('');
  const [importing, setImporting] = useState(false);

  // ---- Clear database state (moved from SettingsPage) ----
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const flashError = (msg) => { setError(msg); setSuccess(null); };
  const flashSuccess = (msg) => { setSuccess(msg); setError(null); };

  // ---- Database management ----

  const handleCreateDatabase = async () => {
    const name = newDbName.trim();
    if (!name) return;
    try {
      const result = await api.createDatabase(name);
      if (result.success) {
        setCreateDialogOpen(false);
        setNewDbName('');
        flashSuccess(`Database "${result.data.name}" created`);
        refreshDatabases();
      } else {
        flashError(result.error || 'Failed to create database');
      }
    } catch (err) {
      flashError('Error creating database: ' + err.message);
    }
  };

  const handleRenameSave = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      const result = await api.renameDatabase(renameTarget._id, name);
      if (result.success) {
        setRenameTarget(null);
        flashSuccess(`Renamed to "${name}"`);
        refreshDatabases();
      } else {
        flashError(result.error || 'Failed to rename database');
      }
    } catch (err) {
      flashError('Error renaming database: ' + err.message);
    }
  };

  const handleDeleteDatabase = async () => {
    if (!deleteTarget) return;
    try {
      const result = await api.deleteDatabase(deleteTarget._id);
      if (result.success) {
        setDeleteTarget(null);
        flashSuccess(`Database "${deleteTarget.name}" deleted`);
        refreshDatabases(); // context falls back to the first remaining database
      } else {
        flashError(result.error || 'Failed to delete database');
      }
    } catch (err) {
      flashError('Error deleting database: ' + err.message);
    }
  };

  const handleSelectDatabase = (db) => {
    selectDatabase(db._id);
    navigate('/'); // show the items of the newly selected database
  };

  // ---- Export (scoped to the active database) ----

  const handleExport = async () => {
    try {
      setError(null);
      setSuccess(null);
      const endpoint = exportFormat === 'xlsx' ? '/api/items/export/xlsx' : '/api/items/export';
      const response = await fetch(endpoint, { headers: dbHeaders() });
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
      flashError('Error exporting: ' + err.message);
    }
  };

  // ---- Import (into the active database) ----

  // Step 1: Upload file and preview columns
  const handleImportFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/items/import/preview', {
        method: 'POST',
        headers: dbHeaders(),
        body: formData,
      });

      const result = await parseJsonResponse(response);
      if (result.success) {
        setImportColumns(result.columns);
        setImportRowCount(result.rowCount);
        // Pre-fill mapping from backend auto-detection
        const suggested = result.suggestedMapping || {};
        setMappingLocationCol(suggested.locationColumn || '');
        setMappingSubLocationCol(suggested.subLocationColumn || '');
        setMappingBoxIdCol(suggested.boxIdColumn || '');
        setMappingDescriptionCol(suggested.descriptionColumn || '');
        setMappingTagsCol(suggested.tagsColumn || '');
        setMappingCreatedCol(suggested.createdColumn || '');
        setMappingModifiedCol(suggested.modifiedColumn || '');
        setImportDialogOpen(true);
      } else {
        flashError(result.error || 'Failed to preview file');
      }
    } catch (err) {
      flashError('Error reading file: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Step 2: Execute import with mapping
  const handleImportExecute = async () => {
    if (!importFile) return;

    try {
      setImporting(true);
      setError(null);
      setSuccess(null);
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('mapping', JSON.stringify({
        locationColumn: mappingLocationCol || null,
        subLocationColumn: mappingSubLocationCol || null,
        boxIdColumn: mappingBoxIdCol || null,
        descriptionColumn: mappingDescriptionCol || null,
        tagsColumn: mappingTagsCol || null,
        createdColumn: mappingCreatedCol || null,
        modifiedColumn: mappingModifiedCol || null
      }));

      const response = await fetch('/api/items/import', {
        method: 'POST',
        headers: dbHeaders(),
        body: formData,
      });

      const result = await parseJsonResponse(response);
      if (result.success) {
        setImportDialogOpen(false);
        setImportFile(null);
        flashSuccess(`Imported ${result.count} item(s) into "${activeDatabase?.name || 'database'}"`);
        refreshDatabases(); // update item counts
        navigate('/'); // show the freshly imported items
      } else {
        flashError(result.error || 'Failed to import file');
      }
    } catch (err) {
      flashError('Error importing: ' + err.message);
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
    setMappingTagsCol('');
    setMappingCreatedCol('');
    setMappingModifiedCol('');
  };

  // ---- Clear the active database (scoped) ----

  const handleClearDatabase = async () => {
    try {
      setError(null);
      setSuccess(null);
      const response = await fetch('/api/data/clear-all', { method: 'DELETE', headers: dbHeaders() });
      const result = await parseJsonResponse(response);
      if (result.success) {
        setClearDialogOpen(false);
        flashSuccess(`Cleared all data from "${activeDatabase?.name || 'database'}"`);
        refreshDatabases(); // update item counts
        navigate('/'); // show the now-empty items list
      } else {
        flashError(result.error || 'Failed to clear database');
      }
    } catch (err) {
      flashError('Error clearing database: ' + err.message);
    }
  };

  const canDelete = databases.length > 1;

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Databases</Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Database list */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">Your Databases</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
            New Database
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each database keeps its items, boxes, locations, and tags separate. Select a database to work with it — all operations apply to the selected database.
        </Typography>

        {dbLoading ? (
          <Typography variant="body2" color="text.secondary">Loading databases…</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="right" sx={{ width: 120 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {databases.map(db => (
                  <TableRow key={db._id} hover selected={db._id === activeDatabase?._id}>
                    <TableCell>
                      <ListItemText primary={db.name} />
                    </TableCell>
                    <TableCell align="right">{db.itemCount}</TableCell>
                    <TableCell align="center">
                      {db._id === activeDatabase?._id && (
                        <Chip size="small" color="primary" icon={<CheckCircleIcon />} label="Active" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={db._id === activeDatabase?._id ? 'Already selected' : 'Select this database'}>
                        <span>
                          <IconButton
                            size="small"
                            color={db._id === activeDatabase?._id ? 'default' : 'primary'}
                            disabled={db._id === activeDatabase?._id}
                            onClick={() => handleSelectDatabase(db)}
                            aria-label={`Select ${db.name}`}
                          >
                            <CheckCircleIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Rename">
                        <IconButton size="small" onClick={() => { setRenameTarget(db); setRenameValue(db.name); }} aria-label={`Rename ${db.name}`}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={canDelete ? 'Delete' : 'Cannot delete the only database'}>
                        <span>
                          <IconButton size="small" color="error" disabled={!canDelete} onClick={() => setDeleteTarget(db)} aria-label={`Delete ${db.name}`}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Export */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Export Data</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Download all items from the active database ({activeDatabase?.name || '—'}) as a CSV or Excel file.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 90 }}>
            <InputLabel id="export-format-label">Format</InputLabel>
            <Select
              labelId="export-format-label"
              label="Format"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <MenuItem value="csv">CSV</MenuItem>
              <MenuItem value="xlsx">Excel</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>
            Export Items
          </Button>
        </Box>
      </Paper>

      {/* Import */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Import Data</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a CSV or Excel file into the active database ({activeDatabase?.name || '—'}). You will be asked to map the file's columns before importing. To import into a different database, select it first.
        </Typography>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleImportFileSelect}
        />
        <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileInputRef.current.click()}>
          Choose File to Import
        </Button>
      </Paper>

      {/* Danger Zone */}
      <Paper variant="outlined" sx={{ p: 3, borderColor: 'error.main' }}>
        <Typography variant="h6" color="error" gutterBottom>Danger Zone</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Permanently delete all items, boxes, locations, and tags in the active database ({activeDatabase?.name || '—'}). This action cannot be undone. Other databases are not affected.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setClearDialogOpen(true)}
        >
          Clear Active Database
        </Button>
      </Paper>

      {/* Create Database Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>New Database</DialogTitle>
        <DialogContent sx={{ minWidth: 320 }}>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Database name"
            value={newDbName}
            onChange={(e) => setNewDbName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateDatabase()}
            placeholder="e.g. Garage, Attic, Office"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newDbName.trim()} onClick={handleCreateDatabase}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Database Dialog */}
      <Dialog open={!!renameTarget} onClose={() => setRenameTarget(null)}>
        <DialogTitle>Rename Database</DialogTitle>
        <DialogContent sx={{ minWidth: 320 }}>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Database name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSave()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button variant="contained" disabled={!renameValue.trim()} onClick={handleRenameSave}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Database Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Database</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{deleteTarget?.name}"? This will permanently remove all of its items, boxes, locations, and tags ({deleteTarget?.itemCount} item(s)). This action cannot be undone.
          </DialogContentText>
          <Alert severity="error" sx={{ mt: 2 }}>
            This is a destructive operation that removes everything in this database.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleDeleteDatabase} color="error" variant="contained">
            Delete Database
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Mapping Dialog */}
      <Dialog open={importDialogOpen} onClose={handleImportCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Map Columns for Import</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            File: {importFile?.name} ({importRowCount} rows, {importColumns.length} columns) → into "{activeDatabase?.name || 'database'}"
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Location Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select value={mappingLocationCol} label="Choose column" onChange={(e) => setMappingLocationCol(e.target.value)}>
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
              <Select value={mappingSubLocationCol} label="Choose column" onChange={(e) => setMappingSubLocationCol(e.target.value)}>
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
              <Select value={mappingBoxIdCol} label="Choose column" onChange={(e) => setMappingBoxIdCol(e.target.value)}>
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
              <Select value={mappingDescriptionCol} label="Choose column" onChange={(e) => setMappingDescriptionCol(e.target.value)}>
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`desc-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Tags Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select value={mappingTagsCol} label="Choose column" onChange={(e) => setMappingTagsCol(e.target.value)}>
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`tags-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Created Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select value={mappingCreatedCol} label="Choose column" onChange={(e) => setMappingCreatedCol(e.target.value)}>
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`created-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Last Modified Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select value={mappingModifiedCol} label="Choose column" onChange={(e) => setMappingModifiedCol(e.target.value)}>
                <MenuItem value="">— None —</MenuItem>
                {importColumns.map(col => (
                  <MenuItem key={`modified-${col}`} value={col}>{col}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Location + Sub-Location together uniquely identify a location. Box ID identifies boxes. Tags are comma-separated names (missing tags are created automatically). Unparseable dates fall back to the import time. All other columns in the file will be ignored.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleImportCancel}>Cancel</Button>
          <Button onClick={handleImportExecute} variant="contained" disabled={importing}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Database Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Active Database</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear ALL data in "{activeDatabase?.name || 'the active database'}"? This will permanently delete all of its items, boxes, locations, and tags. Other databases are not affected. This action cannot be undone.
          </DialogContentText>
          <Alert severity="error" sx={{ mt: 2 }}>
            This is a destructive operation that removes everything from the active database.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClearDatabase} color="error" variant="contained">
            Clear Everything
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DatabasesPage;
