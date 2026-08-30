import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { api } from '../services/api';

const BoxEntryPage = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [boxIdValue, setBoxIdValue] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [error, setError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    fetchLocations();
    if (mode === 'edit' && id) {
      fetchBox();
    }
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.getLocations();
      if (response.success) {
        setLocations(response.data);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const fetchBox = async () => {
    try {
      setLoading(true);
      const response = await api.getBoxById(id);
      if (response.success) {
        setBoxIdValue(response.data.boxId || '');
        if (response.data.locationId) {
          setSelectedLocationId(response.data.locationId._id || response.data.locationId);
        }
      } else {
        setError('Failed to load box');
      }
    } catch (err) {
      setError('Error loading box: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const payload = {
        boxId: boxIdValue,
        locationId: selectedLocationId || null
      };

      const response = mode === 'create'
        ? await api.createBox(payload)
        : await api.updateBox(id, payload);

      if (!response.success) {
        setError(response.error || (mode === 'create' ? 'Error creating box' : 'Error updating box'));
        return;
      }

      setSuccessOpen(true);
      setTimeout(() => navigate('/boxes'), 800);
    } catch (err) {
      setError(mode === 'create' ? 'Error creating box' : 'Error updating box');
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/boxes')}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4">
          {mode === 'create' ? 'Add New Box' : 'Edit Box'}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Success toast */}
      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => setSuccessOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={mode === 'create' ? 'Box added successfully' : 'Box updated successfully'}
        icon={<CheckCircleIcon />}
      />

      {loading ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          Loading...
        </Paper>
      ) : (
        <Paper sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            {/* Box ID */}
            <TextField
              fullWidth
              label="Box ID"
              value={boxIdValue}
              onChange={(e) => setBoxIdValue(e.target.value)}
              margin="normal"
              placeholder="e.g., A06, FA03"
              helperText="Must be unique across all boxes (optional)"
            />

            {/* Location Selection */}
            <FormControl fullWidth margin="normal">
              <InputLabel>Location</InputLabel>
              <Select
                value={selectedLocationId || ''}
                label="Location"
                onChange={(e) => setSelectedLocationId(e.target.value)}
              >
                <MenuItem value="">None (no location)</MenuItem>
                {locations.map(loc => {
                  const label = loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
                  return (
                    <MenuItem key={loc._id} value={loc._id}>
                      {label}{loc.boxCount > 0 ? ` (${loc.boxCount} boxes)` : ''}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
              <Button
                variant="outlined"
                onClick={() => navigate('/boxes')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
              >
                {mode === 'create' ? 'Add Box' : 'Save Changes'}
              </Button>
            </Box>
          </form>
        </Paper>
      )}
    </Container>
  );
};

export default BoxEntryPage;
