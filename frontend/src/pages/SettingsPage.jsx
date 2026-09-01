import React from 'react';
import { Box, Container, Paper, Typography } from '@mui/material';

// Minimal placeholder — database management and data import/export/clear now
// live on the Databases page. This tab is kept for future settings.
const SettingsPage = () => {
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Settings</Typography>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" gutterBottom>No settings yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Database management, data import/export, and clearing live on the{' '}
            <strong>Databases</strong> page. This section is reserved for future app settings.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default SettingsPage;
