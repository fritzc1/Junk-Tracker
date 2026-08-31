import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Button,
  Typography,
  Box,
  Snackbar,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import BoxEntryForm from '../components/BoxEntryForm';

const BoxEntryPage = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [successOpen, setSuccessOpen] = useState(false);

  // The form handles its own loading/error state; the page owns navigation.
  const handleSaved = () => {
    setSuccessOpen(true);
    setTimeout(() => navigate('/boxes'), 800);
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/boxes')}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4">
          {mode === 'create' ? 'Add New Box' : 'Edit Box'}
        </Typography>
      </Box>

      {/* Success toast */}
      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => setSuccessOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={mode === 'create' ? 'Box added successfully' : 'Box updated successfully'}
        icon={<CheckCircleIcon />}
      />

      <Paper sx={{ p: 3 }}>
        <BoxEntryForm
          key={id || 'new'}
          mode={mode}
          id={id}
          allowNewLocation
          onSaved={handleSaved}
          onCancel={() => navigate('/boxes')}
        />
      </Paper>
    </Container>
  );
};

export default BoxEntryPage;
