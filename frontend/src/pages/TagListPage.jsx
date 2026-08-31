import React, { useState, useEffect } from 'react';
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
  TablePagination,
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
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { api } from '../services/api';

const TagListPage = () => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);

  // Edit/Create dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingTagId, setEditingTagId] = useState(null);
  const [tagName, setTagName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const response = await api.getTags();
      if (response.success) {
        setTags(response.data);
      } else {
        setError('Failed to load tags');
      }
    } catch (err) {
      setError('Error loading tags: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (tag) => {
    if (tag) {
      setEditingTagId(tag._id);
      setTagName(tag.name);
    } else {
      setEditingTagId(null);
      setTagName('');
    }
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditingTagId(null);
    setTagName('');
  };

  const handleSave = async () => {
    if (!tagName.trim()) return;
    try {
      if (editingTagId) {
        await api.updateTag(editingTagId, { name: tagName });
      } else {
        await api.createTag(tagName);
      }
      handleCloseEdit();
      fetchTags();
    } catch (err) {
      setError('Error saving tag');
    }
  };

  const handleDeleteClick = (tag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.deleteTag(tagToDelete._id);
      fetchTags();
    } catch (err) {
      setError('Error deleting tag');
    } finally {
      setDeleteDialogOpen(false);
      setTagToDelete(null);
    }
  };

  // Pagination (client-side over the full list)
  const paginatedTags = tags.slice(
    page * rowsPerPage,
    page * rowsPerPage + (rowsPerPage === -1 ? tags.length : rowsPerPage)
  );

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(event.target.value === 'all' ? -1 : parseInt(event.target.value, 10));
    setPage(0);
  };

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
          <Typography variant="h4">Tags</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenEdit(null)}
        >
          Add Tag
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
              <TableCell align="right"><strong>Items</strong></TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} sx={{ textAlign: 'center' }}>Loading...</TableCell>
              </TableRow>
            ) : tags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} sx={{ textAlign: 'center' }}>
                  No tags found. Add a tag to get started, or create tags while adding items.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTags.map(tag => (
                <TableRow key={tag._id}>
                  <TableCell>{tag.name}</TableCell>
                  <TableCell align="right">{tag.itemCount || 0}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit Tag">
                      <IconButton onClick={() => handleOpenEdit(tag)} size="small">
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Tag">
                      <IconButton onClick={() => handleDeleteClick(tag)} size="small" color="error">
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
        count={tags.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50, { label: 'All', value: -1 }]}
      />

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onClose={handleCloseEdit}>
        <DialogTitle>{editingTagId ? 'Edit Tag' : 'Add New Tag'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Tag Name"
            fullWidth
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            margin="normal"
            helperText="e.g., fragile, electronics, seasonal"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!tagName.trim()}>
            {editingTagId ? 'Save Changes' : 'Add Tag'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Tag</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete tag "{tagToDelete?.name}"? This will remove the tag from all items.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TagListPage;
