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
  Snackbar,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { api } from '../services/api';

const LocationEntryPage = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [loading, setLoading] = useState(mode === 'edit');
  const [error, setError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && id) {
      fetchLocation();
    }
  }, []);

  const fetchLocation = async () => {
    try {
      setLoading(true);
      const response = await api.getLocationById(id);
      if (response.success) {
        setName(response.data.name || '');
        setSubLocation(response.data.subLocation || '');
      } else {
        setError(response.error || 'Failed to load location');
      }
    } catch (err) {
      setError('Error loading location: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const response = mode === 'create'
        ? await api.createLocation({ name, subLocation })
        : await api.updateLocation(id, { name, subLocation });

      if (!response.success) {
        // Server returned a logical error (e.g. duplicate key) — show inline red text
        setError(response.error || (mode === 'create' ? 'Error creating location' : 'Error updating location'));
        return;
      }

      // Success — show toast then navigate after a brief delay
      setSuccessOpen(true);
      setTimeout(() => navigate('/locations'), 800);
    } catch (err) {
      setError(mode === 'create' ? 'Error creating location' : 'Error updating location');
    }
  };

  const displayLabel = subLocation ? `${name} — ${subLocation}` : name;

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/locations')}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4">
          {mode === 'create' ? 'Add New Location' : 'Edit Location'}
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
        message={mode === 'create' ? 'Location added successfully' : 'Location updated successfully'}
        icon={<CheckCircleIcon />}
      />

      {loading ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>Loading...</Paper>
      ) : (
        <Paper sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Location Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              helperText="e.g., Garage, Theater, Office"
              required
            />

            <TextField
              fullWidth
              label="Sub-Location / Shelf Number"
              value={subLocation}
              onChange={(e) => setSubLocation(e.target.value)}
              margin="normal"
              helperText="e.g., Shelf 43, Rear Right (optional — leave empty for general areas)"
            />

            {displayLabel && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Display label: <strong>{displayLabel}</strong>
              </Alert>
            )}

            <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
              <Button variant="outlined" onClick={() => navigate('/locations')}>
                Cancel
              </Button>
              <Button type="submit" variant="contained">
                {mode === 'create' ? 'Add Location' : 'Save Changes'}
              </Button>
            </Box>
          </form>
        </Paper>
      )}
    </Container>
  );
};

export default LocationEntryPage;
