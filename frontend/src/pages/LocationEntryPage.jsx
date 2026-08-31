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
import LocationEntryForm from '../components/LocationEntryForm';

const LocationEntryPage = ({ mode }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [successOpen, setSuccessOpen] = useState(false);

  // The form handles its own loading/error state; the page owns navigation.
  const handleSaved = () => {
    setSuccessOpen(true);
    setTimeout(() => navigate('/locations'), 800);
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/locations')}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4">
          {mode === 'create' ? 'Add New Location' : 'Edit Location'}
        </Typography>
      </Box>

      {/* Success toast */}
      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => setSuccessOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={mode === 'create' ? 'Location added successfully' : 'Location updated successfully'}
        icon={<CheckCircleIcon />}
      />

      <Paper sx={{ p: 3 }}>
        <LocationEntryForm
          key={id || 'new'}
          mode={mode}
          id={id}
          onSaved={handleSaved}
          onCancel={() => navigate('/locations')}
        />
      </Paper>
    </Container>
  );
};

export default LocationEntryPage;
