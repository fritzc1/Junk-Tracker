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
  Autocomplete,
  IconButton,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Add as AddIcon } from '@mui/icons-material';
import { api } from '../services/api';
import TagSelector from './TagSelector';
import NewBoxDialog from './NewBoxDialog';
import NewLocationDialog from './NewLocationDialog';

const ItemEntryForm = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [description, setDescription] = useState('');
  const [selectedBoxId, setSelectedBoxId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [boxes, setBoxes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [error, setError] = useState(null);
  // Quick-create dialogs (no navigation away from this page)
  const [newBoxOpen, setNewBoxOpen] = useState(false);
  const [newLocationOpen, setNewLocationOpen] = useState(false);

  // A box was just created in the dialog: add it to options and select it.
  // newLocation is non-null when its location was also created inline —
  // add that too so the inherited-location label resolves immediately.
  const handleNewBoxCreated = (box, newLocation) => {
    setBoxes(prev => [...prev, box]);
    if (newLocation) {
      setLocations(prev => [...prev, newLocation]);
    }
    setSelectedBoxId(box._id);
    setSelectedLocationId('');
  };

  // A location was just created in the dialog: add it to options and select it.
  const handleNewLocationCreated = (location) => {
    setLocations(prev => [...prev, location]);
    setSelectedLocationId(location._id);
  };

  useEffect(() => {
    fetchBoxes();
    fetchLocations();
    if (mode === 'edit' && id) {
      fetchItem();
    }
  }, []);

  const fetchBoxes = async () => {
    try {
      const response = await api.getBoxes();
      if (response.success) setBoxes(response.data);
    } catch (err) {
      console.error('Error fetching boxes:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await api.getLocations();
      if (response.success) setLocations(response.data);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  // Resolve location display label for a box's locationId
  const getBoxLocationLabel = (boxId) => {
    const box = boxes.find(b => b._id === boxId);
    if (!box || !box.locationId) return null;
    const loc = locations.find(l => l._id === (box.locationId._id || box.locationId));
    if (!loc) return 'Unknown';
    return loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
  };

  // Display label for a box option: "A06 — Garage — Shelf 43" or just the ID
  const getBoxLabel = (box) => {
    if (!box) return '';
    const locLabel = getBoxLocationLabel(box._id);
    return `${box.boxId || '(no ID)'}${locLabel ? ` — ${locLabel}` : ''}`;
  };

  // Display label for a location option: "Garage — Shelf 43" or just the name
  const getLocationLabel = (loc) => {
    if (!loc) return '';
    return loc.subLocation ? `${loc.name} — ${loc.subLocation}` : loc.name;
  };

  const fetchItem = async () => {
    try {
      setLoading(true);
      // api.getItemById already returns the parsed JSON body (service layer calls .json())
      const result = await api.getItemById(id);
      if (result.success) {
        setDescription(result.data.description || '');
        // Set selected box or direct location (XOR)
        if (result.data.boxId) {
          setSelectedBoxId(result.data.boxId._id || result.data.boxId);
          setSelectedLocationId('');
        } else if (result.data.locationId) {
          setSelectedLocationId(result.data.locationId._id || result.data.locationId);
          setSelectedBoxId('');
        }
        // Set tags from populated data
        if (result.data.tags && Array.isArray(result.data.tags)) {
          setTags(result.data.tags.map(t => t.name));
        }
      } else {
        setError('Failed to load item');
      }
    } catch (err) {
      setError('Error loading item: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // XOR: selecting a box clears location, and vice versa
  const handleBoxChange = (newBoxId) => {
    setSelectedBoxId(newBoxId);
    if (newBoxId) {
      setSelectedLocationId('');
    }
  };

  // Direct location selection never blocks box selection; picking a box clears it instead.
  const handleLocationChange = (newLocationId) => {
    setSelectedLocationId(newLocationId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Always send both references explicitly so clearing one/both in the UI
      // actually removes them from the document (backend only updates fields present).
      const payload = {
        description,
        tagNames: tags,
        boxId: selectedBoxId || null,
        locationId: selectedLocationId || null
      };

      if (mode === 'create') {
        await api.createItem(payload);
      } else {
        await api.updateItem(id, payload);
      }
      navigate('/items');
    } catch (error) {
      setError(mode === 'create' ? 'Error creating item' : 'Error updating item');
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/items')}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4">
          {mode === 'create' ? 'Add New Item' : 'Edit Item'}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          Loading...
        </Paper>
      ) : (
        <Paper sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            {/* Item Description */}
            <TextField
              fullWidth
              label="Item Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              margin="normal"
              required
            />

            {/* Tags */}
            <Box sx={{ mt: 2 }}>
              <TagSelector value={tags} onChange={setTags} />
            </Box>

            {/* Box Selection */}
            <Box sx={{ mt: 2 }}>
              <Autocomplete
                options={boxes}
                value={selectedBoxId ? boxes.find(b => b._id === selectedBoxId) || null : null}
                onChange={(e, newValue) => handleBoxChange(newValue?._id || '')}
                getOptionLabel={getBoxLabel}
                isOptionEqualToValue={(option, val) => option._id === val._id}
                filterOptions={(options, params) => {
                  const query = (params.inputValue || '').trim().toLowerCase();
                  if (!query) return options;
                  return options.filter(box => getBoxLabel(box).toLowerCase().includes(query));
                }}
                noOptionsText="No matching boxes"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Box"
                    placeholder="Type to search or select a box..."
                    helperText="Selecting a box clears any direct location."
                    slotProps={{
                      ...params.slotProps,
                      input: {
                        ...params.slotProps?.input,
                        endAdornment: (
                          <>
                            <IconButton
                              size="small"
                              aria-label="Add new box"
                              title="Add new box"
                              onClick={(e) => {
                                // Don't let the click bubble to the Autocomplete root
                                e.stopPropagation();
                                setNewBoxOpen(true);
                              }}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                            {params.slotProps?.input?.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
              />
            </Box>

            {/* Direct Location Selection (when no box selected). Always shown —
                the "+" button lets you create the first location inline. */}
            {!selectedBoxId && (
              <Autocomplete
                options={locations}
                value={selectedLocationId ? locations.find(l => l._id === selectedLocationId) || null : null}
                onChange={(e, newValue) => handleLocationChange(newValue?._id || '')}
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
                    label="Location (direct)"
                    placeholder="Type to search or select a location..."
                    slotProps={{
                      ...params.slotProps,
                      input: {
                        ...params.slotProps?.input,
                        endAdornment: (
                          <>
                            <IconButton
                              size="small"
                              aria-label="Add new location"
                              title="Add new location"
                              onClick={(e) => {
                                // Don't let the click bubble to the Autocomplete root
                                e.stopPropagation();
                                setNewLocationOpen(true);
                              }}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                            {params.slotProps?.input?.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
              />
            )}

            {/* Show inherited location when box is selected */}
            {selectedBoxId && (
              <Box sx={{ my: 1, p: 2, bgcolor: '#e1f5fe', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Location inherited from selected box:
                </Typography>
                {(() => {
                  const locLabel = getBoxLocationLabel(selectedBoxId);
                  return (
                    <Typography variant="body2">
                      <strong>Location:</strong> {locLabel || '—'}
                    </Typography>
                  );
                })()}
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/items')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
              >
                {mode === 'create' ? 'Add Item' : 'Save Changes'}
              </Button>
            </Box>
          </form>
        </Paper>
      )}

      {/* Quick-create dialogs — reuse the same entry forms as the full pages */}
      <NewBoxDialog
        open={newBoxOpen}
        onClose={() => setNewBoxOpen(false)}
        onCreated={handleNewBoxCreated}
      />
      <NewLocationDialog
        open={newLocationOpen}
        onClose={() => setNewLocationOpen(false)}
        onCreated={handleNewLocationCreated}
      />
    </Container>
  );
};

export default ItemEntryForm;
