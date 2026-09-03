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
import { ArrowBack as ArrowBackIcon, Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';
import LocationEntryForm from './LocationEntryForm';
import TagSelector from './TagSelector';

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
 *   initialBoxId     - optional; pre-fills the Box ID field in create mode
 *                      (e.g. text typed into a search autocomplete before
 *                      opening this form via "+"). Ignored in edit mode, where
 *                      fetchBox() overwrites it with the loaded box's ID.
 *   onSaved          - callback(box) invoked after a successful save
 *   allowNewLocation - show a "+" button next to the location select that
 *                      opens an inline LocationEntryForm step in place of
 *                      this form's content (no nested dialogs). The step is
 *                      create mode by default, pre-filled from typed text; if
 *                      a location is selected or exactly matched it becomes an
 *                      edit icon and the step edits that location instead.
 *                      Saving returns here with the new/edited location
 *                      preselected (and passed to onSaved as `newLocation`).
 *   onCancel         - optional; when provided, renders a Cancel button that calls it
 */
const BoxEntryForm = ({ mode = 'create', id, onSaved, allowNewLocation = false, onCancel, initialBoxId }) => {
  const { activeDatabaseId } = useDatabases();
  // Pre-fill from initialBoxId (e.g. text typed into a search field before this
  // form was opened via "+"). Uppercased to match the canonical box-ID form; in
  // edit mode fetchBox() overwrites it with the loaded box's ID anyway.
  const [boxIdValue, setBoxIdValue] = useState(
    mode === 'create' ? (initialBoxId || '').toUpperCase() : ''
  );
  const [selectedLocationId, setSelectedLocationId] = useState('');
  // Raw text currently typed into the Location field (tracked via onInputChange
  // so the "+" button can pre-fill / edit-match against it). Reset to '' when a
  // location is actually selected or created.
  const [locationQuery, setLocationQuery] = useState('');
  const [locations, setLocations] = useState([]);
  // Tag names for this box (TagSelector works with lowercase name strings; the
  // backend auto-creates any missing tags from tagNames on save).
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Existing box IDs (for live duplicate detection in the Box ID field)
  const [existingBoxIds, setExistingBoxIds] = useState([]);
  // This box's original ID when mode === 'edit' — excluded from dup checks so
  // an unchanged ID is never flagged as a duplicate of itself.
  const [ownBoxId, setOwnBoxId] = useState('');

  // Internal "create/edit location" step state (single dialog, no nesting).
  // The mode and target are captured when the step opens: "+" with a
  // matching/selected location edits it; otherwise it creates one pre-filled
  // from typed text.
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [locationStepMode, setLocationStepMode] = useState('create');
  const [locationStepTargetId, setLocationStepTargetId] = useState('');
  // Location created OR edited during this session's internal step, if any —
  // passed to onSaved so the parent can upsert it into its own options list.
  const [createdLocation, setCreatedLocation] = useState(null);

  // Load options on mount and whenever the active database changes. In edit
  // mode a stale box ID from another database simply fails to load, which is
  // acceptable — users switch databases via the Databases page.
  useEffect(() => {
    fetchLocations();
    fetchExistingBoxIds();
    if (mode === 'edit' && id) {
      fetchBox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

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

  // The location the "+" button should act on: a committed selection wins,
  // otherwise an exact case-insensitive match against the typed text (checked
  // against both name and display label). When non-null, the button renders as
  // an edit icon and opens that location in edit mode instead of creating one.
  const getActiveLocation = () => {
    if (selectedLocationId) return locations.find(l => l._id === selectedLocationId) || null;
    const q = locationQuery.trim().toLowerCase();
    if (!q) return null;
    return locations.find(
      l => l.name.toLowerCase() === q || getLocationLabel(l).toLowerCase() === q
    ) || null;
  };

  // Pre-fill values for the create-location step, derived from the typed text:
  // "Garage — Shelf 43" splits into name + subLocation (matching how locations
  // are displayed); anything else goes into the name field.
  const getLocationInitialValues = () => {
    const q = locationQuery.trim();
    if (!q) return undefined;
    const sepIndex = q.indexOf(' — ');
    if (sepIndex > 0) {
      return { name: q.slice(0, sepIndex).trim(), subLocation: q.slice(sepIndex + 3).trim() };
    }
    return { name: q };
  };

  // Open the inline location step in create or edit mode depending on whether
  // a location is selected / exactly matched by the typed text.
  const handleOpenLocationStep = () => {
    const match = getActiveLocation();
    setLocationStepMode(match ? 'edit' : 'create');
    setLocationStepTargetId(match?._id || '');
    setCreatingLocation(true);
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
        // Set tags from populated data (getBoxById populates tags with names)
        if (response.data.tags && Array.isArray(response.data.tags)) {
          setTags(response.data.tags.map(t => t.name).filter(Boolean));
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
        locationId: selectedLocationId || null,
        tagNames: tags
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
    // Upsert into the local list and preselect it, then return to box fields.
    // In edit mode the location already exists in the list — replace it so the
    // renamed/relocated values show immediately. `createdLocation` carries the
    // saved location (created OR edited) up to onSaved so parents can refresh
    // their own options too.
    setLocations(prev => prev.some(l => l._id === location._id)
      ? prev.map(l => l._id === location._id ? location : l)
      : [...prev, location]);
    setSelectedLocationId(location._id);
    setLocationQuery('');
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

  // Inline step: create or edit a location without leaving this form/dialog.
  if (creatingLocation) {
    const isEdit = locationStepMode === 'edit';
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
          {isEdit ? 'Edit location for this box' : 'New location for this box'}
        </Typography>
        {/* key remounts the form per step so edit/create state never leaks over */}
        <LocationEntryForm
          key={locationStepTargetId || 'new-location'}
          mode={locationStepMode}
          id={isEdit ? locationStepTargetId : undefined}
          initialValues={isEdit ? undefined : getLocationInitialValues()}
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

      {/* Location Selection — searchable, matching the item form's location field.
          The "+" button pre-fills a new-location step with typed text; if the
          text (or selection) exactly matches an existing location it becomes an
          edit icon that opens that location in edit mode instead. */}
      <Autocomplete
        options={locations}
        value={selectedLocationId ? locations.find(l => l._id === selectedLocationId) || null : null}
        // Track raw typed text (not just committed selections) so the "+" button
        // can pre-fill / edit-match against it. Only real keystrokes update it:
        // MUI fires programmatic resets on blur / selection ("reset", "blur") that
        // would otherwise wipe the query mid-click and flip the edit icon back to "+".
        onInputChange={(e, newInputValue, reason) => {
          if (reason === 'input') setLocationQuery(newInputValue || '');
          else if (reason === 'clear') setLocationQuery('');
        }}
        onChange={(e, newValue) => {
          setSelectedLocationId(newValue?._id || '');
          if (newValue?._id) setLocationQuery('');
        }}
        getOptionLabel={getLocationLabel}
        isOptionEqualToValue={(option, val) => option._id === val._id}
        filterOptions={(options, params) => {
          const query = (params.inputValue || '').trim().toLowerCase();
          if (!query) return options;
          return options.filter(loc => getLocationLabel(loc).toLowerCase().includes(query));
        }}
        noOptionsText="No matching locations"
        renderInput={(params) => {
          // If a location is selected or the typed text exactly matches one, the
          // button becomes an edit action for that location instead of "+".
          const match = getActiveLocation();
          return (
            <TextField
              {...params}
              label="Location"
              placeholder="Type to search or select a location..."
              helperText={match ? 'This location exists — the button edits it.' : 'Optional — clear the field if the box has no fixed location.'}
              slotProps={{
                ...params.slotProps,
                input: {
                  ...params.slotProps?.input,
                  endAdornment: (
                    <>
                      {allowNewLocation && (
                        <IconButton
                          size="small"
                          color={match ? 'primary' : 'default'}
                          aria-label={match ? `Edit location ${getLocationLabel(match)}` : 'Add new location'}
                          title={match ? `Edit existing location ${getLocationLabel(match)}` : 'Add new location'}
                          onClick={handleOpenLocationStep}
                        >
                          {match ? <EditIcon fontSize="small" /> : <AddIcon fontSize="small" />}
                        </IconButton>
                      )}
                      {params.slotProps?.input?.endAdornment}
                    </>
                  ),
                },
              }}
            />
          );
        }}
      />

      {/* Tags */}
      <Box sx={{ mt: 2 }}>
        <TagSelector value={tags} onChange={setTags} />
      </Box>

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
