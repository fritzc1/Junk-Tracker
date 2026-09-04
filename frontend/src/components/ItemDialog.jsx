import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../services/api';
import TagSelector from './TagSelector';
import AttributeEditor from './AttributeEditor';

// Stage 5 revision (owner feedback): the unified item dialog — ONE code path for
// view / edit / create. `item === null` means create mode (empty form); otherwise
// the form is prefilled with that item and Save updates it in place. The list page
// opens this same dialog from the "Add New Item" button (create) and from a row's
// clickable Description cell or Edit action (edit).
//
// Layout: a "Details" section (Description, Container tree dropdown, Tags), then a
// divider + heading and an "Attributes" section holding <AttributeEditor>, so the
// per-item attributes are visually distinct from the standard properties.
//
// Data loading happens HERE (not in AttributeEditor): on open we fetch the
// container list (for the tree dropdown) and the active database's attribute
// dimensions, which form the POOL passed to AttributeEditor via its
// `availableDimensions` prop. Stage 6 will swap that pool for a selected set's
// dimensions without touching the editor itself.

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

const ItemDialog = ({ open, onClose, item, onSaved }) => {
  const isCreate = !item;

  // Form state — prefilled from `item` in edit mode, empty in create mode.
  const [description, setDescription] = useState('');
  // The single container reference (tree dropdown selection).
  const [selectedContainerId, setSelectedContainerId] = useState('');
  const [tagNames, setTagNames] = useState([]);
  // This item's sparse attribute map: dimension name -> value ('' = row present, unset).
  const [attributes, setAttributes] = useState({});

  // Options loaded on open. `dimensions` is the POOL for AttributeEditor — today
  // every dimension defined in the active database (Stage 6: a selected set's).
  const [containers, setContainers] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // (Re)initialize the form whenever the dialog opens or its target item changes.
  useEffect(() => {
    if (!open) return undefined;

    setDescription(item?.description || '');
    // containerId arrives populated ({ _id, name, ... }) or as a raw id.
    const ref = item?.containerId;
    setSelectedContainerId(ref && typeof ref === 'object' ? String(ref._id) : (ref ? String(ref) : ''));
    setTagNames((item?.tags || []).map(t => t.name));
    // Sparse attribute map: dimension name -> value.
    setAttributes({ ...(item?.attributes || {}) });
    setError(null);

    setLoadingOptions(true);
    let cancelled = false;
    const loadOptions = async () => {
      try {
        const [containersRes, attributesRes] = await Promise.all([
          api.getContainers(),
          api.getAttributes(),
        ]);
        if (cancelled) return;
        if (containersRes.success) setContainers(containersRes.data || []);
        if (attributesRes.success) setDimensions(attributesRes.data || []);
      } catch (err) {
        console.error('Error loading dialog options:', err);
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };
    loadOptions();

    return () => { cancelled = true; };
  }, [open, item]);

  const depthMap = useMemo(() => computeDepthMap(containers), [containers]);

  // Backdrop/Esc close — suppressed mid-save so a slow request can't be lost.
  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Full-form payload: description + containerId + tagNames are always sent.
      // Attributes reflect the rows exactly — in edit mode the map is ALWAYS sent
      // (even as {}) so removing the last row actually clears the item's
      // attributes server-side; an absent field would leave them untouched. In
      // create mode it is sent only when non-empty. Blank ('') values are dropped
      // by the server, and out-of-vocabulary keys/values come back as 400s below.
      const payload = {
        description: description.trim(),
        containerId: selectedContainerId || null,
        tagNames,
      };
      if (!isCreate) {
        payload.attributes = attributes;
      } else if (Object.keys(attributes).length > 0) {
        payload.attributes = attributes;
      }

      // NOTE: api.js resolves — it does not throw — on HTTP 400 JSON bodies, so
      // check `success` to surface the server's actionable validation message.
      const response = isCreate
        ? await api.createItem(payload)
        : await api.updateItem(item._id, payload);
      if (!response.success) {
        setError(response.error || (isCreate ? 'Error creating item' : 'Error updating item'));
        return;
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError((isCreate ? 'Error creating item: ' : 'Error updating item: ') + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isCreate ? 'Add New Item' : 'Edit Item'}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 300 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Details — the standard item properties */}
        <Typography variant="subtitle2" gutterBottom>Details</Typography>
        <TextField
          fullWidth
          label="Item Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        {/* Container — one tree dropdown for boxes and locations (same pattern as
            ItemEntryForm: options indented by depth, boxes marked with ▣). */}
        <Box sx={{ mt: 2 }}>
          {loadingOptions ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Loading containers…</Typography>
            </Box>
          ) : (
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
          )}
        </Box>

        {/* Tags — TagSelector loads its own options (per active database) */}
        <Box sx={{ mt: 2 }}>
          <TagSelector value={tagNames} onChange={setTagNames} />
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Attributes — per-item selection from the dimension pool. Visually
            separated from Details by the divider + section heading above. */}
        <Typography variant="subtitle2" gutterBottom>Attributes</Typography>
        <AttributeEditor
          availableDimensions={dimensions}
          attributes={attributes}
          onChange={setAttributes}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !description.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ItemDialog;
