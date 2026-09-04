import React, { useState } from 'react';
import { Autocomplete, Box, IconButton, TextField, Typography } from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';

// Stage 5 revision (owner feedback): the per-item attribute editor. Replaces the
// old "one fixed dropdown per defined dimension" picker with a Partkeepr-style
// list of rows: each row is one attribute ON THIS ITEM, and the user adds/removes
// rows from the pool of dimensions passed in via `availableDimensions`.
//
// Props (prop-driven for Stage 6 forward-compat):
//   availableDimensions — the POOL of dimensions this item may use. Today the
//     parent passes every dimension defined in the active database; Stage 6 will
//     pass a selected attribute set's dimensions instead. This component never
//     fetches data or assumes "all DB dimensions" itself — it only ever renders
//     what the caller hands it. Each entry: { name, values: [] }.
//   attributes — this item's current sparse map { [dimensionName]: valueString }.
//     A key whose value is '' means the row is present but its value is unset
//     (the server drops blank values on save).
//   onChange — called with the NEXT FULL MAP whenever a row is added, a value
//     changes/clears, or a row is removed. The parent owns all state + loading.
//
// Pure/presentational: no API calls and no internal state of its own.

const AttributeEditor = ({ availableDimensions, attributes, onChange }) => {
  const pool = Array.isArray(availableDimensions) ? availableDimensions : [];
  const current = attributes && typeof attributes === 'object' ? attributes : {};
  const presentNames = Object.keys(current);

  // Dimensions the item does NOT already have — exactly what the add control offers.
  const addableDimensions = pool.filter(d => !(d.name in current));

  // Local UI state only (no data): keeps the "Add attribute" input cleared after a
  // selection. MUI otherwise leaves the chosen label as leftover inputValue, which
  // would filter the dropdown and hide the remaining options.
  const [addInputValue, setAddInputValue] = useState('');

  const updateValue = (name, value) => {
    onChange({ ...current, [name]: value ?? '' });
  };

  const removeRow = (name) => {
    const next = { ...current };
    delete next[name];
    onChange(next);
  };

  const addRow = (dimension) => {
    if (!dimension || dimension.name in current) return;
    // The new row starts with an unset value ('' — the server drops it on save,
    // so an added-but-unvalued attribute is not persisted until a value is set).
    onChange({ ...current, [dimension.name]: '' });
  };

  const renderAddControl = () => (
    <Box sx={{ mt: 1.5 }}>
      <Autocomplete
        options={addableDimensions}
        // Always controlled to null so the picker resets after each selection —
        // the chosen dimension appears as its own row instead of staying selected.
        value={null}
        inputValue={addInputValue}
        onInputChange={(e, v) => setAddInputValue(v)}
        onChange={(e, newValue) => {
          addRow(newValue);
          setAddInputValue('');
        }}
        getOptionLabel={(d) => d?.name || ''}
        isOptionEqualToValue={(option, val) => option && val && String(option.name) === String(val.name)}
        noOptionsText="All available dimensions are already on this item"
        renderInput={(params) => (
          <TextField
            {...params}
            label="Add attribute"
            placeholder="(select a dimension)"
            helperText="Pick any dimension from the database to add it to this item."
          />
        )}
      />
    </Box>
  );

  // Nothing defined in the pool and nothing on the item: zero-overhead message.
  if (presentNames.length === 0 && pool.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No attribute dimensions are defined for this database.
      </Typography>
    );
  }

  return (
    <>
      {presentNames.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          This item has no attributes yet — add one from the database below.
        </Typography>
      ) : null}

      {/* One row per attribute currently present on this item */}
      {presentNames.map((name) => {
        const dimension = pool.find(d => d.name === name);
        // Defensive: if a stored value is no longer in the vocabulary (e.g. the
        // value list changed while this dialog was open), keep it selectable.
        const vocab = dimension?.values || [];
        const currentValue = current[name] || '';
        const options = currentValue && !vocab.includes(currentValue) ? [currentValue, ...vocab] : vocab;
        return (
          <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
            <Typography variant="body2" sx={{ minWidth: 130, flexShrink: 0 }} title={name}>
              {name}
            </Typography>
            <Box sx={{ flex: 1 }}>
              <Autocomplete
                options={options}
                value={currentValue || null}
                onChange={(e, newValue) => updateValue(name, newValue)}
                getOptionLabel={(option) => option}
                isOptionEqualToValue={(option, val) => option === val}
                noOptionsText="No values defined for this dimension"
                renderInput={(params) => (
                  <TextField {...params} placeholder="(unset)" />
                )}
              />
            </Box>
            <IconButton
              size="small"
              color="error"
              aria-label={`Remove ${name}`}
              onClick={() => removeRow(name)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      })}

      {addableDimensions.length > 0 ? renderAddControl() : null}
    </>
  );
};

export default AttributeEditor;
