import React, { useState, useEffect } from 'react';
import { Autocomplete, TextField, Box, Typography } from '@mui/material';
import { api } from '../services/api';

const TagSelector = ({ value, onChange }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  // Load all tags on mount
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const result = await api.getTags();
      if (result.success) {
        setOptions(result.data.filter(t => t.name).map(t => t.name));
      }
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  };

  // Search tags when input changes
  const handleInputChange = async (event, newValue) => {
    setInputValue(newValue);
    if (newValue.length >= 2) {
      setLoading(true);
      try {
        const result = await api.searchTags(newValue);
        if (result.success) {
          // Merge with existing options to avoid duplicates
          const newOptions = [...new Set([...options, ...result.data.filter(t => t.name).map(t => t.name)])];
          setOptions(newOptions);
        }
      } catch (err) {
        console.error('Error searching tags:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCreateTag = async (newName) => {
    try {
      const result = await api.createTag(newName.trim());
      if (result.success) {
        setOptions(prev => [...prev, newName.trim().toLowerCase()]);
        return newName.trim().toLowerCase();
      }
    } catch (err) {
      console.error('Error creating tag:', err);
    }
    return null;
  };

  const handleChange = async (event, newValue) => {
    // Check if any new tags were added that don't exist yet
    const existingSet = new Set(options);
    let createdTags = [];

    for (const tag of newValue) {
      if (!existingSet.has(tag.toLowerCase())) {
        const created = await handleCreateTag(tag);
        if (created) {
          createdTags.push(created);
        }
      }
    }

    // Normalize all tags to lowercase
    const normalizedValue = newValue.map(t => t.toLowerCase());
    onChange(normalizedValue);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>Tags</Typography>
      <Autocomplete
        multiple
        options={options}
        value={value || []}
        onChange={handleChange}
        onInputChange={handleInputChange}
        inputValue={inputValue}
        freeSolo
        loading={loading}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            placeholder="Type to search or create tags..."
            helperText="Press Enter to add a tag. Type new text and press Enter to create."
          />
        )}
      />
    </Box>
  );
};

export default TagSelector;
