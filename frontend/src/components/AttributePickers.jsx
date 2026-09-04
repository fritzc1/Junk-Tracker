import React from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';

// Stage 5 of plans/container-tree-and-attributes-plan.md — the parameterized
// attribute picker. Renders ONE clearable single-select dropdown per dimension
// passed in via the `dimensions` prop (options = that dimension's values).
//
// Forward-compat hook for Stage 6: this component knows nothing about "all
// dimensions in the active database" — callers decide which dimensions to pass.
// Stage 5 passes every defined dimension; Stage 6 will simply pass a selected
// attribute set's dimensions instead, with no changes here. When `dimensions`
// is empty it renders nothing (zero overhead for databases without attributes).
const AttributePickers = ({ dimensions, values, onChange }) => {
  if (!Array.isArray(dimensions) || dimensions.length === 0) return null;

  const selectedValues = values || {};

  return (
    <>
      {dimensions.map((dim) => (
        <Box key={dim.name} sx={{ mt: 2 }}>
          <Autocomplete
            options={dim.values || []}
            value={selectedValues[dim.name] || ''}
            onChange={(e, newValue) => onChange(dim.name, newValue || '')}
            getOptionLabel={(option) => option}
            isOptionEqualToValue={(option, val) => option === val}
            noOptionsText="No values defined for this dimension"
            renderInput={(params) => (
              <TextField
                {...params}
                label={dim.name}
                placeholder="(unset)"
                helperText="Clear the field to leave this attribute unset."
              />
            )}
          />
        </Box>
      ))}
    </>
  );
};

export default AttributePickers;
