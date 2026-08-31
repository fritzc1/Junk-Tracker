import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Box, Tab, Tabs, Toolbar, Typography } from '@mui/material';

// Top-level sections and the route prefixes that map to each one.
// Entry/edit pages highlight their parent section (e.g. /box-edit/:id → Boxes).
const SECTIONS = [
  { label: 'Items', value: 'items', paths: ['/', '/items', '/entry', '/edit'] },
  { label: 'Boxes', value: 'boxes', paths: ['/boxes', '/box-entry', '/box-edit'] },
  { label: 'Locations', value: 'locations', paths: ['/locations', '/location-entry', '/location-edit'] },
  { label: 'Tags', value: 'tags', paths: ['/tags'] },
  { label: 'Settings', value: 'settings', paths: ['/settings'] },
];

const NAV_TARGETS = {
  items: '/',
  boxes: '/boxes',
  locations: '/locations',
  tags: '/tags',
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

  return (
    <AppBar position="sticky" color="default" elevation={1}>
      <Toolbar variant="dense">
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, mr: 4, cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          Junk Tracker
        </Typography>
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
