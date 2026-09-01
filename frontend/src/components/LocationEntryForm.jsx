import React, { useState, useEffect } from 'react';
import {
  TextField,
  Button,
  Box,
  Alert,
} from '@mui/material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';

/**
 * Reusable location create/edit form.
 *
 * Controlled by the parent: no navigation happens here — the parent decides
 * what to do on success via `onSaved(location)`. Used both as a full page
 * (LocationEntryPage) and inside quick-create dialogs (NewLocationDialog,
 * NewBoxDialog's internal location step).
 *
 * Props:
 *   mode         - 'create' | 'edit'
 *   id           - location id when mode === 'edit'
 *   initialValues- { name, subLocation } to prefill (e.g. from a parent dialog)
 *   onSaved      - callback(location) invoked after a successful save
 *   onCancel     - optional; when provided, renders a Cancel button that calls it
 */
const LocationEntryForm = ({ mode = 'create', id, initialValues, onSaved, onCancel }) => {
  const { activeDatabaseId } = useDatabases();
  const [name, setName] = useState(initialValues?.name || '');
  const [subLocation, setSubLocation] = useState(initialValues?.subLocation || '');
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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

  // Load existing location in edit mode; re-runs when the active database changes
  useEffect(() => {
    if (mode === 'edit' && id) {
      fetchLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      const response = mode === 'create'
        ? await api.createLocation({ name, subLocation })
        : await api.updateLocation(id, { name, subLocation });

      if (!response.success) {
        // Server returned a logical error (e.g. duplicate key) — show inline red text
        setError(response.error || (mode === 'create' ? 'Error creating location' : 'Error updating location'));
        return;
      }

      onSaved?.(response.data);
    } catch (err) {
      setError(mode === 'create' ? 'Error creating location' : 'Error updating location');
    } finally {
      setSaving(false);
    }
  };

  const displayLabel = subLocation ? `${name} — ${subLocation}` : name;

  if (loading) {
    return <Box sx={{ p: 2, textAlign: 'center' }}>Loading...</Box>;
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TextField
        fullWidth
        label="Location Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        margin="normal"
        helperText="e.g., Garage, Theater, Office"
        required
        autoFocus
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

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
        {onCancel && (
          <Button variant="outlined" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="contained" disabled={saving || !name.trim()}>
          {mode === 'create' ? 'Add Location' : 'Save Changes'}
        </Button>
      </Box>
    </form>
  );
};

export default LocationEntryForm;
