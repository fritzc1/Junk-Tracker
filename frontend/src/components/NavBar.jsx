import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Box, Chip, Tab, Tabs, Toolbar, Tooltip, Typography } from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import { useDatabases } from '../context/DatabaseContext';

// Top-level sections and the route prefixes that map to each one.
// Entry/edit pages highlight their parent section (e.g. /box-edit/:id → Boxes).
const SECTIONS = [
  { label: 'Items', value: 'items', paths: ['/', '/items', '/entry', '/edit'] },
  { label: 'Boxes', value: 'boxes', paths: ['/boxes', '/box-entry', '/box-edit'] },
  { label: 'Locations', value: 'locations', paths: ['/locations', '/location-entry', '/location-edit'] },
  { label: 'Tags', value: 'tags', paths: ['/tags'] },
  { label: 'Databases', value: 'databases', paths: ['/databases'] },
  { label: 'Settings', value: 'settings', paths: ['/settings'] },
];

const NAV_TARGETS = {
  items: '/',
  boxes: '/boxes',
  locations: '/locations',
  tags: '/tags',
  databases: '/databases',
  settings: '/settings',
};

// Resolve the active section from the current pathname.
const resolveActiveSection = (pathname) => {
  for (const section of SECTIONS) {
    if (section.paths.some(p => p === '/' ? pathname === '/' : pathname.startsWith(p))) {
      return section.value;
    }
  }
  return 'items';
};

const NavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = resolveActiveSection(location.pathname);
  const { activeDatabase, loading: dbLoading } = useDatabases();

  return (
    <AppBar position="sticky" color="default" elevation={1}>
      <Toolbar variant="dense">
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, mr: 2, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          Junk Tracker
        </Typography>
        {/* Active database indicator — click to manage databases */}
        <Tooltip title={dbLoading ? 'Loading databases…' : `Manage databases (currently viewing "${activeDatabase?.name || '—'}")`}>
          <Chip
            icon={<StorageIcon />}
            label={dbLoading ? '…' : activeDatabase?.name || 'No database'}
            size="small"
            color={activeSection === 'databases' ? 'primary' : 'default'}
            variant={activeSection === 'databases' ? 'filled' : 'outlined'}
            sx={{ mr: 3, cursor: 'pointer', fontWeight: 600 }}
            onClick={() => navigate('/databases')}
          />
        </Tooltip>
        <Tabs
          value={activeSection}
          onChange={(event, newValue) => navigate(NAV_TARGETS[newValue])}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 48 }}
        >
          {SECTIONS.map(section => (
            <Tab key={section.value} value={section.value} label={section.label} />
          ))}
        </Tabs>
      </Toolbar>
    </AppBar>
  );
};

export default NavBar;
