import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import ItemListPage from './pages/ItemListPage';
import ItemEntryPage from './pages/ItemEntryPage';
import BoxListPage from './pages/BoxListPage';
import BoxEntryPage from './pages/BoxEntryPage';
import LocationListPage from './pages/LocationListPage';
import LocationEntryPage from './pages/LocationEntryPage';
import TagListPage from './pages/TagListPage';
import SettingsPage from './pages/SettingsPage';
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    h4: {
      fontWeight: 600,
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary>
          <NavBar />
          <Routes>
            <Route path="/" element={<ItemListPage />} />
            <Route path="/entry" element={<ItemEntryPage mode="create" />} />
            <Route path="/edit/:id" element={<ItemEntryPage mode="edit" />} />
            <Route path="/items" element={<ItemListPage />} />
            <Route path="/boxes" element={<BoxListPage />} />
            <Route path="/box-entry" element={<BoxEntryPage mode="create" />} />
            <Route path="/box-edit/:id" element={<BoxEntryPage mode="edit" />} />
            <Route path="/locations" element={<LocationListPage />} />
            <Route path="/location-entry" element={<LocationEntryPage mode="create" />} />
            <Route path="/location-edit/:id" element={<LocationEntryPage mode="edit" />} />
            <Route path="/tags" element={<TagListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
      </Router>
    </ThemeProvider>
  );
}

export default App;
