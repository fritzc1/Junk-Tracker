import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuIcon from '@mui/icons-material/Menu';
import StorageIcon from '@mui/icons-material/Storage';
import { useDatabases } from '../context/DatabaseContext';

// Top-level sections and the route prefixes that map to each one.
const SECTIONS = [
  { label: 'Items', value: 'items', paths: ['/', '/items'] },
  // Stage 3: one Containers section replaces the old Boxes + Locations tabs.
  // The legacy /boxes and /locations prefixes still resolve here so deep links
  // (which redirect to /containers) keep highlighting the right tab.
  { label: 'Containers', value: 'containers', paths: ['/containers', '/boxes', '/locations'] },
  { label: 'Tags', value: 'tags', paths: ['/tags'] },
  // Stage 5: attribute dimension management page.
  { label: 'Attributes', value: 'attributes', paths: ['/attributes'] },
  // Databases is reachable only via the active-database chip, not a tab.
  // It stays in SECTIONS so route resolution recognizes /databases (chip highlight).
  { label: 'Databases', value: 'databases', paths: ['/databases'], hidden: true },
  { label: 'Settings', value: 'settings', paths: ['/settings'] },
];

const NAV_TARGETS = {
  items: '/',
  containers: '/containers',
  tags: '/tags',
  attributes: '/attributes',
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

// Width of the edge fade overlays that hint at scrollable tabs.
const FADE_WIDTH = 48;

const NavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = resolveActiveSection(location.pathname);
  const { activeDatabase, loading: dbLoading } = useDatabases();

  // Below the sm breakpoint there isn't enough room for a scrollable tab strip;
  // fall back to a hamburger menu instead.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // The main page gets special treatment in hamburger mode: a standalone
  // "Items" button stays visible until the toolbar is too narrow for it.
  const hasRoomForItems = useMediaQuery('(min-width: 520px)');
  const showStandaloneItems = isMobile && hasRoomForItems;

  // Hamburger menu state (mobile only).
  const [menuAnchor, setMenuAnchor] = useState(null);

  // Close the mobile menu if we cross into desktop mode while it's open.
  useEffect(() => {
    if (!isMobile) setMenuAnchor(null);
  }, [isMobile]);

  // Track whether the tab list can scroll left/right so we can show a fade +
  // chevron hint at each edge (hidden once scrolled to that end).
  const tabsRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    // The Tabs root wraps the .MuiTabs-scroller element.
    const scroller = tabsRef.current?.querySelector('.MuiTabs-scroller');
    if (!scroller) return;
    setCanScrollLeft(scroller.scrollLeft > 1);
    setCanScrollRight(
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1
    );
  }, []);

  useEffect(() => {
    const scroller = tabsRef.current?.querySelector('.MuiTabs-scroller');
    if (!scroller) return undefined;
    updateScrollState();
    scroller.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      scroller.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  // Re-check after the tab list content changes (e.g. active section switch).
  useEffect(() => {
    const t = setTimeout(updateScrollState, 0);
    return () => clearTimeout(t);
  }, [activeSection, updateScrollState]);

  const scrollTabs = (direction) => {
    const scroller = tabsRef.current?.querySelector('.MuiTabs-scroller');
    if (!scroller) return;
    scroller.scrollBy({ left: direction * FADE_WIDTH * 2.5, behavior: 'smooth' });
  };

  // Mask that fades the tab text at scrollable edges so labels appear to
  // dissolve behind the chevron (the mask is fixed to the visible area while
  // content scrolls under it). No fade when both ends are reached.
  const scrollerMask = (() => {
    if (!canScrollLeft && !canScrollRight) return undefined;
    // Keep text fully hidden in the band where the chevron sits (right at the
    // edge), then fade it back in over the rest of the zone.
    const plateau = FADE_WIDTH / 3;
    const stops = [];
    if (canScrollLeft) {
      stops.push(
        'transparent 0px',
        `transparent ${plateau}px`,
        `black ${FADE_WIDTH}px`
      );
    } else {
      stops.push('black 0px');
    }
    if (canScrollRight) {
      stops.push(
        `black calc(100% - ${FADE_WIDTH}px)`,
        `transparent calc(100% - ${plateau}px)`,
        'transparent 100%'
      );
    } else {
      stops.push('black 100%');
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  })();

  // Transparent chevron hint; rendered only when that side is scrollable.
  const renderFade = (side) => {
    if (side === 'left' ? !canScrollLeft : !canScrollRight) return null;
    return (
      <Box
        onClick={() => scrollTabs(side === 'left' ? -1 : 1)}
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side]: 0,
          width: FADE_WIDTH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
          px: 0.5,
          cursor: 'pointer',
          zIndex: 1,
          color: 'rgba(0, 0, 0, 0.5)',
        }}
      >
        {side === 'left' ? (
          <ChevronLeftIcon fontSize="small" />
        ) : (
          <ChevronRightIcon fontSize="small" />
        )}
      </Box>
    );
  };

  // Standalone "Items" button for hamburger mode (styled like a tab).
  const renderStandaloneItems = () => {
    if (!showStandaloneItems) return null;
    const active = activeSection === 'items';
    return (
      <Button
        onClick={() => navigate('/')}
        sx={{
          mr: 1,
          px: 2,
          minHeight: 48,
          textTransform: 'none',
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          color: active ? theme.palette.primary.main : 'text.secondary',
          borderBottom: `2px solid ${active ? theme.palette.primary.main : 'transparent'}`,
        }}
      >
        Items
      </Button>
    );
  };

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
            // Cap the label width so a very long database name can't blow out
            // the toolbar; the full name is still available in the tooltip.
            sx={{
              mr: 3,
              cursor: 'pointer',
              fontWeight: 600,
              '& .MuiChip-label': {
                maxWidth: isMobile ? 140 : 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
            onClick={() => navigate('/databases')}
          />
        </Tooltip>
        {isMobile ? (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
            {renderStandaloneItems()}
            <IconButton
              size="small"
              edge="end"
              aria-label="Open navigation menu"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Box component="div" sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Tabs
              ref={tabsRef}
              // No tab is highlighted on /databases — the chip indicates that page.
              value={activeSection === 'databases' ? null : activeSection}
              onChange={(event, newValue) => navigate(NAV_TARGETS[newValue])}
              variant="scrollable"
              // The custom edge chevrons below replace MUI's built-in scroll arrows.
              scrollButtons={false}
              sx={{
                minHeight: 48,
                '& .MuiTabs-scroller': scrollerMask
                  ? { WebkitMaskImage: scrollerMask, maskImage: scrollerMask }
                  : undefined,
              }}
            >
              {SECTIONS.filter(section => !section.hidden).map(section => (
                <Tab key={section.value} value={section.value} label={section.label} />
              ))}
            </Tabs>
            {renderFade('left')}
            {renderFade('right')}
          </Box>
        )}
      </Toolbar>
      {/* Mobile navigation menu — replaces the tab strip below sm. Items is
          omitted while it has its own standalone button. */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {SECTIONS.filter(
          section => !section.hidden && !(showStandaloneItems && section.value === 'items')
        ).map(section => (
          <MenuItem
            key={section.value}
            selected={activeSection === section.value}
            onClick={() => {
              navigate(NAV_TARGETS[section.value]);
              setMenuAnchor(null);
            }}
          >
            {section.label}
          </MenuItem>
        ))}
      </Menu>
    </AppBar>
  );
};

export default NavBar;
