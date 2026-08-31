import React from 'react';
import {
  Dialog,
  DialogTitle,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import BoxEntryForm from './BoxEntryForm';

/**
 * Quick-create dialog for a new box. Wraps the same BoxEntryForm used on the
 * full Add Box page (with allowNewLocation, so a missing location can be
 * created inline — one dialog, no nested modals). The parent decides what to
 * do with the created entity via `onCreated(box, newLocation)`, then closes
 * via onClose. `newLocation` is non-null only when the box's location was
 * created during this session (so the parent can add it to its options too).
 */
const NewBoxDialog = ({ open, onClose, onCreated }) => {
  const handleSaved = (box, newLocation) => {
    onCreated?.(box, newLocation);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        New Box
        <IconButton aria-label="close dialog" onClick={onClose} sx={{ ml: 1 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      {/* key resets the form each time the dialog opens */}
      {open && (
        <BoxEntryForm mode="create" allowNewLocation onSaved={handleSaved} onCancel={onClose} />
      )}
    </Dialog>
  );
};

export default NewBoxDialog;
