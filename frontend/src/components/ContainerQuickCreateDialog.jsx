import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Inventory2 as Inventory2Icon, Place as PlaceIcon } from '@mui/icons-material';
import { api } from '../services/api';

// Small modal for quick-creating ONE container inline from a picker (the item
// dialog's container dropdown and the rename/move parent picker). Props:
//   open            — controlled visibility.
//   onClose         — called when the dialog closes (any way: button, Esc, backdrop).
//   defaultParentId — id of the parent to create under; null/'' = top level.
//                     Callers pass the container currently selected in their
//                     picker, which is what makes stacking work (create A at root,
//                     select it, "+" again -> B under A, ...). No depth limit by design.
//   onCreated       — called with the created container once creation succeeds.
//   parentLabel     — optional display path of defaultParentId, shown as context.
//
// Behavior: server errors (e.g., duplicate box id) are surfaced in the dialog and
// it stays open. Non-blocking sibling-name warnings from a successful create are
// shown as info alerts; creation is still treated as successful — the dialog just
// waits for an explicit "Done" so the user can read them, and onCreated fires no
// matter how that final state is closed.

const ContainerQuickCreateDialog = ({ open, onClose, defaultParentId, onCreated, parentLabel }) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('location'); // 'location' | 'box'
  const [boxId, setBoxId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Set after a successful create that carried non-blocking warnings: the dialog
  // stays open in this state until the user acknowledges with "Done" (or Esc).
  const [pendingResult, setPendingResult] = useState(null);

  // Reset the form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setName('');
      setKind('location');
      setBoxId('');
      setError(null);
      setPendingResult(null);
      setSubmitting(false);
    }
  }, [open]);

  // Close path shared by Cancel/Esc/backdrop and the "Done" button. When a create
  // already succeeded (pendingResult), it is propagated as success on ANY close so
  // the parent picker can refetch + auto-select even if the user just hits Esc.
  const handleClose = () => {
    if (submitting) return;
    if (pendingResult) onCreated?.(pendingResult.container, pendingResult.warnings);
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Container name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // api.js resolves (does not throw) on HTTP 400 JSON bodies, so check `success`.
      const payload = {
        name: name.trim(),
        kind,
        parentId: defaultParentId || null,
      };
      // boxId only applies to boxes (the backend rejects it otherwise).
      if (kind === 'box') payload.boxId = boxId.trim();

      const response = await api.createContainer(payload);
      if (!response.success) {
        setError(response.error || 'Failed to create container');
        return; // dialog stays open with the server error
      }

      const warnings = response.warnings || [];
      if (warnings.length > 0) {
        // Non-blocking: creation succeeded — show the warnings, wait for "Done".
        setPendingResult({ container: response.data, warnings });
      } else {
        onCreated?.(response.data, []);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Container</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {pendingResult ? (
          <>
            <Alert severity="info">
              Created "{pendingResult.container.name}" successfully.
            </Alert>
            {pendingResult.warnings.map((w, i) => (
              <Alert key={i} severity="info" sx={{ mt: 1 }}>
                {w}
              </Alert>
            ))}
          </>
        ) : (
          <>
            {/* Name */}
            <TextField
              autoFocus
              fullWidth
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              required
            />

            {/* Kind */}
            <Box sx={{ mt: 2 }}>
              <ToggleButtonGroup size="small" exclusive value={kind} onChange={(e, newKind) => { if (newKind) setKind(newKind); }}>
                <ToggleButton value="location"><PlaceIcon fontSize="inherit" sx={{ mr: 0.5 }} />Location</ToggleButton>
                <ToggleButton value="box"><Inventory2Icon fontSize="inherit" sx={{ mr: 0.5 }} />Box</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Box ID (boxes only) */}
            {kind === 'box' && (
              <TextField
                fullWidth
                label="Box ID"
                value={boxId}
                onChange={(e) => setBoxId(e.target.value.toUpperCase())}
                margin="normal"
                helperText="Optional — must be unique per database. Stored in uppercase."
              />
            )}

            {/* Where it will land (context for the stacking flow) */}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Will be created {parentLabel ? `under "${parentLabel}"` : 'at top level'}.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {pendingResult ? (
          <Button variant="contained" onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={submitting || !name.trim()}>
              Create
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ContainerQuickCreateDialog;
