import React from 'react';
import {
  Dialog,
  DialogTitle,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import LocationEntryForm from './LocationEntryForm';

/**
 * Quick-create dialog for a new location. Wraps the same LocationEntryForm
 * used on the full Add Location page, so the experience is identical in both
 * places. The parent decides what to do with the created entity via
 * `onCreated(location)` (e.g. append to options + auto-select), then closes
 * the dialog itself via `onClose`.
 */
const NewLocationDialog = ({ open, onClose, onCreated }) => {
  const handleSaved = (location) => {
    onCreated?.(location);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        New Location
        <IconButton aria-label="close dialog" onClick={onClose} sx={{ ml: 1 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      {/* key resets the form each time the dialog opens */}
      {open && (
        <LocationEntryForm mode="create" onSaved={handleSaved} onCancel={onClose} />
      )}
    </Dialog>
  );
};

export default NewLocationDialog;
