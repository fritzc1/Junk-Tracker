import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import ItemListPage from './pages/ItemListPage';
import ItemEntryPage from './pages/ItemEntryPage';
import ContainerListPage from './pages/ContainerListPage';
import TagListPage from './pages/TagListPage';
import AttributeListPage from './pages/AttributeListPage';
import DatabasesPage from './pages/DatabasesPage';
import SettingsPage from './pages/SettingsPage';
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';
import { DatabaseProvider } from './context/DatabaseContext';

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
      <DatabaseProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ErrorBoundary>
            <NavBar />
            <Routes>
              <Route path="/" element={<ItemListPage />} />
              <Route path="/entry" element={<ItemEntryPage mode="create" />} />
              <Route path="/edit/:id" element={<ItemEntryPage mode="edit" />} />
              <Route path="/items" element={<ItemListPage />} />
              {/* Stage 3: unified container page. The old /boxes and /locations
                  routes (and their entry/edit pages) redirect here — the dead
                  Box/Location pages were removed in this stage. */}
              <Route path="/containers" element={<ContainerListPage />} />
              <Route path="/boxes" element={<Navigate to="/containers" replace />} />
              <Route path="/locations" element={<Navigate to="/containers" replace />} />
              <Route path="/tags" element={<TagListPage />} />
              {/* Stage 5: attribute dimension management (per active database) */}
              <Route path="/attributes" element={<AttributeListPage />} />
              <Route path="/databases" element={<DatabasesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </ErrorBoundary>
        </Router>
      </DatabaseProvider>
    </ThemeProvider>
  );
}

export default App;
