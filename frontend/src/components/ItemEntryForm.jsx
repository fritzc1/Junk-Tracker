import React, { useState, useEffect, useMemo } from 'react';
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
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';
import TagSelector from './TagSelector';
import AttributePickers from './AttributePickers';

// Stage 3 of plans/container-tree-and-attributes-plan.md: the item form now uses
// ONE container tree dropdown instead of the old box-selector + location-selector
// XOR pair. Selecting a container sets `containerId`; the payload sent to the
// backend contains ONLY containerId (plus description/tags) — never the legacy
// boxId/locationId keys, which the backend rejects when non-empty without it.

// Depth of every container (0 = root), walking parentId chains with a cycle guard.
const computeDepthMap = (containers) => {
  const byId = new Map((containers || []).map(c => [String(c._id), c]));
  const depth = new Map();
  for (const c of containers || []) {
    let d = 0;
    const seen = new Set([String(c._id)]);
    let cursor = c.parentId ? byId.get(String(c.parentId)) : null;
    while (cursor && !seen.has(String(cursor._id))) {
      d += 1;
      seen.add(String(cursor._id));
      cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
    }
    depth.set(String(c._id), d);
  }
  return depth;
};

const ItemEntryForm = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeDatabaseId } = useDatabases();

  const [description, setDescription] = useState('');
  // The single container reference (replaces selectedBoxId + selectedLocationId).
  const [selectedContainerId, setSelectedContainerId] = useState('');
  const [containers, setContainers] = useState([]);
  const [tags, setTags] = useState([]);
  // Stage 5: attribute dimensions for the active database + this item's values.
  // The picker is parameterized — it renders one dropdown per dimension in the
  // `dimensions` list (Stage 6 will pass a selected set's dimensions instead).
  const [dimensions, setDimensions] = useState([]);
  const [attributes, setAttributes] = useState({});
  const [loading, setLoading] = useState(mode === 'edit');
  const [error, setError] = useState(null);

  // Load options on mount and whenever the active database changes. In edit
  // mode a stale item ID from another database simply fails to load, which is
  // acceptable — users switch databases via the Databases page.
  useEffect(() => {
    setAttributes({});
    fetchContainers();
    fetchDimensions();
    if (mode === 'edit' && id) {
      fetchItem();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

  const fetchContainers = async () => {
    try {
      const response = await api.getContainers();
      if (response.success) setContainers(response.data);
    } catch (err) {
      console.error('Error fetching containers:', err);
    }
  };

  // Load the active database's attribute dimensions (empty list → no pickers).
  const fetchDimensions = async () => {
    try {
      const response = await api.getAttributes();
      if (response.success) setDimensions(response.data || []);
    } catch (err) {
      console.error('Error fetching attributes:', err);
    }
  };

  // Indentation for the tree dropdown options.
  const depthMap = useMemo(() => computeDepthMap(containers), [containers]);

  // Set/clear one dimension's value on this item (sparse map — unset keys are
  // omitted so they never reach the server).
  const handleAttributeChange = (name, value) => {
    setAttributes(prev => {
      const next = { ...prev };
      if (value) next[name] = value;
      else delete next[name];
      return next;
    });
  };

  const fetchItem = async () => {
    try {
      setLoading(true);
      const result = await api.getItemById(id);
      if (result.success) {
        setDescription(result.data.description || '');
        // Single container reference — no XOR between two fields anymore.
        const ref = result.data.containerId;
        setSelectedContainerId(ref && typeof ref === 'object' ? String(ref._id) : (ref ? String(ref) : ''));
        // Sparse attribute map: dimension name -> value.
        setAttributes(result.data.attributes || {});
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Send ONLY containerId for the location reference — never legacy
      // boxId/locationId keys, even as null/empty. Attributes are sent only when
      // at least one dimension is set (the server validates against the
      // vocabulary and returns actionable 400 messages).
      const payload = {
        description,
        tagNames: tags,
        containerId: selectedContainerId || null,
      };
      if (Object.keys(attributes).length > 0) {
        payload.attributes = attributes;
      }

      // NOTE: api.js resolves — it does not throw — on HTTP 400 JSON bodies, so
      // check `success` to surface the server's actionable error message.
      const response = mode === 'create'
        ? await api.createItem(payload)
        : await api.updateItem(id, payload);
      if (!response.success) {
        setError(response.error || (mode === 'create' ? 'Error creating item' : 'Error updating item'));
        return;
      }
      navigate('/items');
    } catch (error) {
      setError(mode === 'create' ? 'Error creating item' : 'Error updating item: ' + error.message);
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

            {/* Attributes — one clearable dropdown per defined dimension. Renders
                nothing when the database has no dimensions (zero overhead). */}
            <AttributePickers
              dimensions={dimensions}
              values={attributes}
              onChange={handleAttributeChange}
            />

            {/* Container Selection — one tree dropdown for boxes and locations.
                Options are indented by depth; boxes are visually distinguished
                with a ▣ glyph + "(BOX ID)" suffix in the label. */}
            <Box sx={{ mt: 2 }}>
              <Autocomplete
                options={containers}
                value={selectedContainerId ? containers.find(c => String(c._id) === selectedContainerId) || null : null}
                onChange={(e, newValue) => setSelectedContainerId(newValue?._id || '')}
                getOptionLabel={(c) => {
                  if (!c) return '';
                  const boxSuffix = c.kind === 'box' && c.boxId ? ` (${c.boxId})` : '';
                  return `${c.displayPath || c.name}${boxSuffix}`;
                }}
                isOptionEqualToValue={(option, val) => option && val && String(option._id) === String(val._id)}
                filterOptions={(options, params) => {
                  const query = (params.inputValue || '').trim().toLowerCase();
                  if (!query) return options;
                  return options.filter(c => {
                    const label = `${c.displayPath || c.name} ${c.boxId || ''}`.toLowerCase();
                    return label.includes(query);
                  });
                }}
                noOptionsText="No matching containers"
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key} {...optionProps}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2" color={option.kind === 'box' ? 'primary.main' : 'text.primary'}>
                          {'\u00A0'.repeat((depthMap.get(String(option._id)) || 0) * 2)}
                          {option.kind === 'box' ? '▣ ' : ''}{option.name}
                          {option.boxId ? ` (${option.boxId})` : ''}
                        </Typography>
                      </Box>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Container"
                    placeholder="Type to search or select a container..."
                    helperText="Boxes are marked with ▣. Clear the field to leave the item unassigned."
                  />
                )}
              />
            </Box>

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
    </Container>
  );
};

export default ItemEntryForm;
