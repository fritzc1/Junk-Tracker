import React from 'react';
import {
  Dialog,
  DialogTitle,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import BoxEntryForm from './BoxEntryForm';

/**
 * Quick-create (or quick-edit) dialog for a box. Wraps the same BoxEntryForm
 * used on the full Add/Edit Box pages (with allowNewLocation, so a missing
 * location can be created inline — one dialog, no nested modals). The parent
 * decides what to do with the saved entity via `onCreated(box, newLocation)`
 * or `onUpdated(box, newLocation)`, then closes via onClose. `newLocation` is
 * non-null only when the box's location was created OR edited during this
 * session (so the parent can upsert it into its options too).
 *
 * Two entry modes:
 *   - create (default): `initialBoxId` optionally pre-fills the Box ID field —
 *     e.g. text the user typed into a box-search autocomplete before clicking
 *     "+". Only applied on mount; the form's key below remounts it each time
 *     the dialog opens, so a stale value from a previous session never leaks in.
 *   - edit: `editBoxId` points at an existing box (e.g. the typed query exactly
 *     matched one); the form loads and edits that box instead of creating one.
 */
const NewBoxDialog = ({ open, onClose, onCreated, onUpdated, initialBoxId, editBoxId }) => {
  const isEdit = Boolean(editBoxId);

  // `newLocation` is non-null when the box's location was created OR edited in
  // this session — forwarded in both modes so parents can refresh their options.
  const handleSaved = (box, newLocation) => {
    if (isEdit) {
      onUpdated?.(box, newLocation);
    } else {
      onCreated?.(box, newLocation);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {isEdit ? 'Edit Box' : 'New Box'}
        <IconButton aria-label="close dialog" onClick={onClose} sx={{ ml: 1 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      {/* key resets the form each time the dialog opens, which also re-applies initialBoxId */}
      {open && (
        <BoxEntryForm
          mode={isEdit ? 'edit' : 'create'}
          id={isEdit ? editBoxId : undefined}
          allowNewLocation
          onSaved={handleSaved}
          onCancel={onClose}
          initialBoxId={initialBoxId}
        />
      )}
    </Dialog>
  );
};

export default NewBoxDialog;
