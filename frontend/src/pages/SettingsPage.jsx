import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';

const SettingsPage = () => {
  const navigate = useNavigate();

  // ---- Export state ----
  const [exportFormat, setExportFormat] = useState('csv');
  const [error, setError] = useState(null);

  // ---- Import state (moved from ItemListPage) ----
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

  // ---- Clear database state (moved from ItemListPage) ----
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // Export to CSV or Excel
  const handleExport = async () => {
    try {
      setError(null);
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
      setError(null);
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
        setMappingTagsCol(suggested.tagsColumn || '');
        setMappingCreatedCol(suggested.createdColumn || '');
        setMappingModifiedCol(suggested.modifiedColumn || '');
        setImportDialogOpen(true);
      } else {
        setError(result.error || 'Failed to preview file');
      }
    } catch (err) {
      setError('Error reading file: ' + err.message);
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
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setImportDialogOpen(false);
        setImportFile(null);
        navigate('/'); // show the freshly imported items
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
    setMappingTagsCol('');
    setMappingCreatedCol('');
    setMappingModifiedCol('');
  };

  const handleClearDatabase = async () => {
    try {
      setError(null);
      await fetch('/api/data/clear-all', { method: 'DELETE' });
      setClearDialogOpen(false);
      navigate('/'); // show the now-empty items list
    } catch (err) {
      setError('Error clearing database: ' + err.message);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Settings</Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Export */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Export Data</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Download all items as a CSV or Excel file.
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
          Upload a CSV or Excel file. You will be asked to map the file's columns before importing.
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
          Permanently delete all items, boxes, locations, and tags. This action cannot be undone.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setClearDialogOpen(true)}
        >
          Clear Database
        </Button>
      </Paper>

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

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Tags Column</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Choose column</InputLabel>
              <Select
                value={mappingTagsCol}
                label="Choose column"
                onChange={(e) => setMappingTagsCol(e.target.value)}
              >
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
              <Select
                value={mappingCreatedCol}
                label="Choose column"
                onChange={(e) => setMappingCreatedCol(e.target.value)}
              >
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
              <Select
                value={mappingModifiedCol}
                label="Choose column"
                onChange={(e) => setMappingModifiedCol(e.target.value)}
              >
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
          <Button
            onClick={handleImportExecute}
            variant="contained"
            disabled={importing}
          >
            {importing ? 'Importing...' : 'Import'}
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
    </Container>
  );
};

export default SettingsPage;
