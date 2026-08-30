import React from 'react';
import {
  Paper, TextField, Box, Button, Typography, Autocomplete,
  Select, MenuItem, IconButton, InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon, Clear as ClearIcon,
} from '@mui/icons-material';

const SearchBar = ({
  value, onChange, placeholder, onClear,
  mode, setMode,
  columnOptions, getSelectedColumnOption,
  searchCriteria, addCriterion, removeCriterion, updateCriterion, clearAll,
  ...rest
}) => (
  <Paper sx={{ p: 1.5, mb: 2 }}>
    {mode === 'basic' ? (
      // Basic search mode
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          fullWidth
          variant="outlined"
          size="small"
          placeholder={placeholder || 'Search...'}
          value={value}
          onChange={onChange}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'action.active' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  {value && onClear ? (
                    <IconButton size="small" edge="end" onClick={onClear} title="Clear search">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </InputAdornment>
              ),
            },
          }}
        />
        {columnOptions && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => setMode('advanced')}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Advanced
          </Button>
        )}
      </Box>
    ) : (
      // Advanced search mode
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2">Advanced Search</Typography>
          <Button
            size="small"
            onClick={() => setMode('basic')}
            startIcon={<SearchIcon />}
          >
            Basic Search
          </Button>
        </Box>

        {/* Criteria rows */}
        {searchCriteria.map((criterion, index) => (
          <Box key={criterion.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <Autocomplete
              freeSolo
              options={columnOptions || []}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : (opt?.label || '')}
              value={getSelectedColumnOption ? getSelectedColumnOption(criterion.field) : null}
              onChange={(_, newValue) => {
                const fieldId = typeof newValue === 'string' ? '' : (newValue?.id || '');
                updateCriterion(index, 'field', fieldId);
              }}
              renderInput={(params) => (
                <TextField {...params} size="small" placeholder="Column" sx={{ minWidth: 140 }} />
              )}
            />
            <Select
              value={criterion.operator}
              onChange={(e) => updateCriterion(index, 'operator', e.target.value)}
              size="small"
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="contains">Contains</MenuItem>
              <MenuItem value="equals">Equals</MenuItem>
              <MenuItem value="starts_with">Starts with</MenuItem>
              <MenuItem value="ends_with">Ends with</MenuItem>
              <MenuItem value="empty">Is empty</MenuItem>
              <MenuItem value="not_empty">Not empty</MenuItem>
              <MenuItem value="regex">Regex</MenuItem>
            </Select>
            {criterion.operator !== 'empty' && criterion.operator !== 'not_empty' ? (
              <TextField
                size="small"
                placeholder={criterion.operator === 'regex' ? 'Regular expression...' : 'Value...'}
                value={criterion.value}
                onChange={(e) => updateCriterion(index, 'value', e.target.value)}
                sx={{ flex: 1 }}
              />
            ) : (
              <Box sx={{ flex: 1 }} />
            )}
            {searchCriteria.length > 1 && (
              <IconButton size="small" color="error" onClick={() => removeCriterion(index)}>
                <ClearIcon />
              </IconButton>
            )}
          </Box>
        ))}

        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button size="small" variant="outlined" onClick={addCriterion}>
            + Add Condition
          </Button>
          <Button size="small" variant="outlined" color="inherit" onClick={clearAll}>
            Clear All
          </Button>
        </Box>
      </Box>
    )}
  </Paper>
);

export default SearchBar;
