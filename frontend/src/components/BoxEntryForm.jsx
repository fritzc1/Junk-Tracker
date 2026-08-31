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
 * The Box ID field is a freeSolo autocomplete: it lists existing box IDs,
 * narrows them as you type, and flags exact duplicates before submit.
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

  // Existing box IDs (for live duplicate detection in the Box ID field)
  const [existingBoxIds, setExistingBoxIds] = useState([]);
  // This box's original ID when mode === 'edit' — excluded from dup checks so
  // an unchanged ID is never flagged as a duplicate of itself.
  const [ownBoxId, setOwnBoxId] = useState('');

  // Internal "create location" step state (single dialog, no nesting)
  const [creatingLocation, setCreatingLocation] = useState(false);
  // Location created during this session's internal step, if any — passed to
  // onSaved so the parent can add it to its own options list.
  const [createdLocation, setCreatedLocation] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchExistingBoxIds();
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

  // Load all existing box IDs so the Box ID field can offer live duplicate
  // detection. Client-side filtering is fine at this app's scale; a dedicated
  // search endpoint can replace this if the collection grows large.
  const fetchExistingBoxIds = async () => {
    try {
      const response = await api.getBoxes();
      if (response.success) {
        const ids = [...new Set(
          (response.data || [])
            .map(b => b.boxId)
            .filter(v => v && String(v).trim())
            .map(v => String(v).trim())
        )].sort((a, b) => a.localeCompare(b));
        setExistingBoxIds(ids);
      }
    } catch (err) {
      console.error('Error fetching existing box IDs:', err);
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
        setOwnBoxId(response.data.boxId || '');
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

  // --- Box ID duplicate detection ---
  const trimmedBoxId = boxIdValue.trim();
  // In edit mode, exclude this box's own original ID so an unchanged value is
  // never flagged as a duplicate of itself.
  const boxIdOptions = mode === 'edit' && ownBoxId
    ? existingBoxIds.filter(id => id !== ownBoxId)
    : existingBoxIds;
  // Exact match against existing IDs — both sides are in canonical uppercase
  // form (input is auto-uppercased below; stored values are normalized by the
  // backend), so this mirrors the backend's case-insensitive unique index.
  const isDuplicate = trimmedBoxId !== '' && boxIdOptions.includes(trimmedBoxId);

  const getBoxIdHelperText = () => {
    if (!trimmedBoxId) return 'Must be unique across all boxes (optional)';
    if (isDuplicate) return 'This ID already exists — choose a different one';
    const matchCount = boxIdOptions.filter(
      id => id.toLowerCase().includes(trimmedBoxId.toLowerCase())
    ).length;
    if (matchCount === 0) return 'This ID is available';
    return `${matchCount} similar ${matchCount === 1 ? 'ID' : 'IDs'} already exist`;
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

      {/* Box ID — freeSolo autocomplete: input is auto-uppercased (box IDs are
          stored in canonical uppercase form); the dropdown lists existing box
          IDs and narrows as you type, flagging exact duplicates */}
      <Autocomplete
        fullWidth
        freeSolo
        options={boxIdOptions}
        value={boxIdValue || null}
        // freeSolo quirk: typed-but-uncommitted text is discarded on blur unless it
        // matches the controlled `value`. onChange only fires when an option is
        // selected / Enter commits, so we must track every keystroke via
        // onInputChange to keep boxIdValue (and duplicate detection) in sync.
        // Auto-uppercase as the user types so the field visibly enforces the
        // canonical form and duplicate detection works against stored values.
        onInputChange={(e, newInputValue) => setBoxIdValue((newInputValue ?? '').toUpperCase())}
        onChange={(e, newValue) => {
          if (typeof newValue === 'string') setBoxIdValue(newValue);
        }}
        getOptionLabel={(option) => option}
        filterOptions={(options, params) => {
          const query = (params.inputValue || '').trim().toLowerCase();
          if (!query) return options; // empty input → show all existing IDs
          return options.filter(id => id.toLowerCase().includes(query));
        }}
        noOptionsText={trimmedBoxId ? 'No matching box IDs — this ID is available' : 'No boxes with an ID yet'}
        renderOption={(props, option) => {
          // Both sides are canonical uppercase (input auto-uppercased above), so a
          // plain equality check matches the backend's case-insensitive uniqueness.
          const isExact = option === trimmedBoxId;
          return (
            <li {...props}>
              <Typography
                variant="body2"
                sx={{ color: isExact ? 'error.main' : 'text.primary', fontWeight: isExact ? 600 : 400 }}
              >
                {option}{isExact ? ' — already in use' : ''}
              </Typography>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Box ID"
            placeholder="e.g., A06, FA03"
            helperText={getBoxIdHelperText()}
            error={isDuplicate}
            margin="normal"
            autoFocus
          />
        )}
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
        <Button type="submit" variant="contained" disabled={saving || isDuplicate}>
          {mode === 'create' ? 'Add Box' : 'Save Changes'}
        </Button>
      </Box>
    </form>
  );
};

export default BoxEntryForm;
