import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Autocomplete,
  IconButton,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Add as AddIcon } from '@mui/icons-material';
import { api } from '../services/api';
import LocationEntryForm from './LocationEntryForm';

/**
 * Reusable box create/edit form.
 *
 * Controlled by the parent: no navigation happens here — the parent decides
 * what to do on success via `onSaved(box)`. Used both as a full page
 * (BoxEntryPage) and inside quick-create dialogs (NewBoxDialog).
 *
 * Props:
 *   mode             - 'create' | 'edit'
 *   id               - box id when mode === 'edit'
 *   onSaved          - callback(box) invoked after a successful save
 *   allowNewLocation - show a "+" button next to the location select that
 *                      opens an inline LocationEntryForm step in place of
 *                      this form's content (no nested dialogs); saving
 *                      returns here with the new location preselected.
 *   onCancel         - optional; when provided, renders a Cancel button that calls it
 */
const BoxEntryForm = ({ mode = 'create', id, onSaved, allowNewLocation = false, onCancel }) => {
  const [boxIdValue, setBoxIdValue] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Internal "create location" step state (single dialog, no nesting)
  const [creatingLocation, setCreatingLocation] = useState(false);
  // Location created during this session's internal step, if any — passed to
  // onSaved so the parent can add it to its own options list.
  const [createdLocation, setCreatedLocation] = useState(null);

  useEffect(() => {
    fetchLocations();
    if (mode === 'edit' && id) {
      fetchBox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Display label for a location option: "Garage — Shelf 43" or just the name
  const getLocationLabel = (loc) => {
    if (!loc) return '';
    return loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
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
    if (saving) return;
    setError(null);
    setSaving(true);

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

      onSaved?.(response.data, createdLocation || null);
    } catch (err) {
      setError(mode === 'create' ? 'Error creating box' : 'Error updating box');
    } finally {
      setSaving(false);
    }
  };

  // --- Internal location-creation step ---

  const handleNewLocationSaved = (location) => {
    // Append to the local list and preselect it, then return to box fields.
    setLocations(prev => [...prev, location]);
    setSelectedLocationId(location._id);
    setCreatedLocation(location);
    setCreatingLocation(false);
  };

  if (loading) {
    return <Box sx={{ p: 2, textAlign: 'center' }}>Loading...</Box>;
  }

  // Inline step: create a new location without leaving this form/dialog.
  if (creatingLocation) {
    return (
      <div>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => setCreatingLocation(false)}
          sx={{ mb: 1 }}
        >
          Back to box details
        </Button>
        <Typography variant="subtitle2" gutterBottom>
          New location for this box
        </Typography>
        <LocationEntryForm
          mode="create"
          onSaved={handleNewLocationSaved}
          onCancel={() => setCreatingLocation(false)}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Box ID */}
      <TextField
        fullWidth
        label="Box ID"
        value={boxIdValue}
        onChange={(e) => setBoxIdValue(e.target.value)}
        margin="normal"
        placeholder="e.g., A06, FA03"
        helperText="Must be unique across all boxes (optional)"
        autoFocus
      />

      {/* Location Selection — searchable, matching the item form's location field */}
      <Autocomplete
        options={locations}
        value={selectedLocationId ? locations.find(l => l._id === selectedLocationId) || null : null}
        onChange={(e, newValue) => setSelectedLocationId(newValue?._id || '')}
        getOptionLabel={getLocationLabel}
        isOptionEqualToValue={(option, val) => option._id === val._id}
        filterOptions={(options, params) => {
          const query = (params.inputValue || '').trim().toLowerCase();
          if (!query) return options;
          return options.filter(loc => getLocationLabel(loc).toLowerCase().includes(query));
        }}
        noOptionsText="No matching locations"
        renderInput={(params) => (
          <TextField
            {...params}
            label="Location"
            placeholder="Type to search or select a location..."
            helperText="Optional — clear the field if the box has no fixed location."
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps?.input,
                endAdornment: (
                  <>
                    {allowNewLocation && (
                      <IconButton
                        size="small"
                        aria-label="Add new location"
                        title="Add new location"
                        onClick={() => setCreatingLocation(true)}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    )}
                    {params.slotProps?.input?.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
        {onCancel && (
          <Button variant="outlined" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="contained" disabled={saving}>
          {mode === 'create' ? 'Add Box' : 'Save Changes'}
        </Button>
      </Box>
    </form>
  );
};

export default BoxEntryForm;
