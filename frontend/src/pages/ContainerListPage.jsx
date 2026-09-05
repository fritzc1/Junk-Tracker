import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FormatListBulleted as FormatListBulletedIcon,
  Inventory2 as Inventory2Icon,
  Place as PlaceIcon,
  Save as SaveIcon,
  SubdirectoryArrowRight as SubdirectoryArrowRightIcon,
} from '@mui/icons-material';
import { api } from '../services/api';
import { useDatabases } from '../context/DatabaseContext';
import ContainerQuickCreateDialog from '../components/ContainerQuickCreateDialog';

// Stage 3 of plans/container-tree-and-attributes-plan.md: the unified container
// tree page. Replaces the old Locations + Boxes pages — one indented table for
// every container in the active database, with create/rename/move/delete and a
// ?containerId= deep-link highlight (mirrors the old boxFilterId pattern).

// Sentinel-free parent picker: `null` means "top level" (no parent).
const ROOT_PARENT = null;

// Build lookup maps from the flat API list. The backend already returns the
// list sorted by displayPath, so children inherit a path-sorted order.
const buildContainerIndex = (containers) => {
  const byId = new Map(containers.map(c => [String(c._id), c]));
  const childrenByParent = new Map();
  for (const c of containers) {
    const key = c.parentId ? String(c.parentId) : null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(c);
  }
  return { byId, childrenByParent };
};

// Depth of every container (0 = root), walking parentId chains with a cycle guard.
const computeDepthMap = (containers) => {
  const { byId } = buildContainerIndex(containers);
  const depth = new Map();
  for (const c of containers) {
    let d = 0;
    const seen = new Set([String(c._id)]);
    let cursor = c.parentId ? byId.get(String(c.parentId)) : null;
    while (cursor && !seen.has(String(cursor._id))) {
      d += 1;
      seen.add(String(cursor._id));
      cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null;
    }
    depth.set(String(c._id), d);
  }
  return depth;
};

// DFS rows (parent before children) in path order — the table layout.
const flattenTreeRows = (containers) => {
  const { byId, childrenByParent } = buildContainerIndex(containers);
  const depthMap = computeDepthMap(containers);
  const rows = [];
  const visit = (c) => {
    rows.push({ container: c, depth: depthMap.get(String(c._id)) || 0 });
    for (const child of childrenByParent.get(String(c._id)) || []) visit(child);
  };
  for (const root of containers.filter(c => !c.parentId)) visit(root);
  // Orphan guard: containers whose parent no longer exists still show up.
  const seen = new Set(rows.map(r => String(r.container._id)));
  for (const c of containers) {
    if (!seen.has(String(c._id))) rows.push({ container: c, depth: 0 });
  }
  return rows;
};

// All ancestor ids of a set of container ids (for keeping context visible when filtering).
const collectAncestorIds = (containers, idSet) => {
  const { byId } = buildContainerIndex(containers);
  const ancestors = new Set();
  for (const id of idSet) {
    let cursor = byId.get(String(id));
    while (cursor && cursor.parentId) {
      const pid = String(cursor.parentId);
      if (!ancestors.has(pid)) ancestors.add(pid);
      cursor = byId.get(pid);
    }
  }
  return ancestors;
};

// Descendant ids of one container (for the parent picker exclusion).
const collectDescendantIds = (containers, rootId) => {
  const { childrenByParent } = buildContainerIndex(containers);
  const descendants = new Set();
  let queue = [...(childrenByParent.get(String(rootId)) || [])];
  while (queue.length > 0) {
    const next = [];
    for (const c of queue) {
      const id = String(c._id);
      if (descendants.has(id)) continue;
      descendants.add(id);
      next.push(...(childrenByParent.get(id) || []));
    }
    queue = next;
  }
  return descendants;
};

// Indented label for tree dropdowns ("   Shelf 43"), boxes marked with a glyph.
const getTreeOptionLabel = (c, depthMap) => {
  if (!c) return '';
  const indent = '\u00A0'.repeat((depthMap.get(String(c._id)) || 0) * 2);
  return `${indent}${c.kind === 'box' ? '▣ ' : ''}${c.name}`;
};

// Rich dropdown row: kind icon + indented name.
const renderTreeOption = (props, c, depthMap) => {
  const { key, ...optionProps } = props;
  return (
    <li key={key} {...optionProps}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {c.kind === 'box' ? (
          <Inventory2Icon fontSize="small" color="primary" />
        ) : (
          <PlaceIcon fontSize="small" color="action" />
        )}
        <Typography variant="body2">
          {'\u00A0'.repeat((depthMap.get(String(c._id)) || 0) * 2)}
          {c.name}
        </Typography>
      </Box>
    </li>
  );
};

// Create / rename-move dialog. One form for both: `initial` is the container
// being edited (rename/move) or null (create). The parent picker excludes the
// container itself and its descendants so a move can never create a cycle.
const ContainerFormDialog = ({ open, onClose, onSaved, initial, defaultParentId, containers, onQuickCreated }) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('location');
  const [boxId, setBoxId] = useState('');
  const [parent, setParent] = useState(ROOT_PARENT); // null = top level
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // Inline "+" quick-create from the parent picker (rename/move only).
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setKind(initial?.kind || 'location');
      setBoxId(initial?.boxId || '');
      setParent(initial ? (initial.parentId ? initial.parentId : ROOT_PARENT) : (defaultParentId || ROOT_PARENT));
      setFormError(null);
    }
  }, [open, initial, defaultParentId]);

  const depthMap = useMemo(() => computeDepthMap(containers), [containers]);

  // Parent options: everything except self + descendants (cycle safety in the UI;
  // the backend re-checks on save).
  const parentOptions = useMemo(() => {
    if (!initial) return containers;
    const excluded = new Set([String(initial._id), ...collectDescendantIds(containers, initial._id)]);
    return containers.filter(c => !excluded.has(String(c._id)));
  }, [containers, initial]);

  // After an inline quick-create: select the new container as the move target's
  // parent (this is what makes stacking work — create A at root, it becomes the
  // selected parent, "+" again -> B under A, ...). The page refetches via
  // onQuickCreated so the fresh node appears in `containers`/parentOptions.
  const handleQuickCreated = (created) => {
    setParent(created._id);
    onQuickCreated?.(created);
  };

  const handleSubmit = async () => {
    // Identity rules: locations are identified by their name, boxes by their
    // Box ID — each is required for its kind.
    if (kind === 'location' && !name.trim()) {
      setFormError('Location name is required');
      return;
    }
    if (kind === 'box' && !boxId.trim()) {
      setFormError('Box ID is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        kind,
        parentId: parent || null,
      };
      // Boxes have no user-facing name — the server always sets it to the Box ID.
      if (kind === 'location') payload.name = name.trim();
      // boxId only applies to boxes (the backend rejects it otherwise).
      if (kind === 'box') payload.boxId = boxId.trim().toUpperCase();
      else if (initial?.boxId) payload.boxId = ''; // reclassifying away from box clears the ID

      const response = initial
        ? await api.updateContainer(initial._id, payload)
        : await api.createContainer(payload);
      if (!response.success) {
        setFormError(response.error || 'Failed to save container');
        return;
      }
      onSaved(response.data, response.warnings || []);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Rename / Move Container' : 'New Container'}</DialogTitle>
      <DialogContent dividers>
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}

        {/* Name — locations only; boxes are identified by their Box ID */}
        {kind === 'location' && (
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            required
          />
        )}

        {/* Kind */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Kind
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={kind} onChange={(e, newKind) => { if (newKind) setKind(newKind); }}>
            <ToggleButton value="location"><PlaceIcon fontSize="inherit" sx={{ mr: 0.5 }} />Location</ToggleButton>
            <ToggleButton value="box"><Inventory2Icon fontSize="inherit" sx={{ mr: 0.5 }} />Box</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Box ID (boxes only) — the box's identity; no separate name field */}
        {kind === 'box' && (
          <TextField
            autoFocus
            fullWidth
            label="Box ID"
            value={boxId}
            onChange={(e) => setBoxId(e.target.value.toUpperCase())}
            margin="normal"
            required
            helperText="Required — unique per database. Stored in uppercase."
          />
        )}

        {/* Parent picker (tree dropdown, self + descendants excluded on edit) */}
        <Box sx={{ mt: 2 }}>
          <Autocomplete
            options={parentOptions}
            value={parent ? parentOptions.find(c => String(c._id) === String(parent)) || null : null}
            onChange={(e, newValue) => setParent(newValue?._id || ROOT_PARENT)}
            getOptionLabel={(c) => (c ? c.displayPath || c.name : '(top level)')}
            isOptionEqualToValue={(option, val) => option && val && String(option._id) === String(val._id)}
            filterOptions={(options, params) => {
              const query = (params.inputValue || '').trim().toLowerCase();
              if (!query) return options;
              return options.filter(c => (c.displayPath || c.name).toLowerCase().includes(query));
            }}
            noOptionsText="No matching containers"
            renderOption={(props, option) => renderTreeOption(props, option, depthMap)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Parent"
                placeholder="(top level)"
                slotProps={{
                  // Merge — params.slotProps carries htmlInput (the Autocomplete
                  // ref + handlers) and inputLabel; replacing it breaks the input.
                  ...params.slotProps,
                  input: {
                    ...params.slotProps?.input,
                    endAdornment: initial ? (
                      <>
                        {params.slotProps?.input?.endAdornment}
                        <Tooltip title="Create a new container here">
                          <IconButton
                            size="small"
                            edge="end"
                            aria-label="Quick-create parent container"
                            onClick={() => setQuickCreateOpen(true)}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : params.slotProps?.input?.endAdornment,
                  },
                }}
              />
            )}
          />
        </Box>

        {/* Inline quick-create for the parent picker above (rename/move only) */}
        {initial && (
          <ContainerQuickCreateDialog
            open={quickCreateOpen}
            onClose={() => setQuickCreateOpen(false)}
            defaultParentId={parent || null}
            parentLabel={(parent ? parentOptions.find(c => String(c._id) === String(parent)) : null)?.displayPath}
            onCreated={handleQuickCreated}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={saving || (kind === 'location' ? !name.trim() : !boxId.trim())}
        >
          {initial ? 'Save Changes' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ContainerListPage = () => {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  // Search + kind filter (client-side over the flat list)
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all'); // 'all' | 'location' | 'box'

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState(null);
  const [editingContainer, setEditingContainer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const navigate = useNavigate();
  const { activeDatabaseId } = useDatabases();

  // Active container filter from URL (?containerId=...) — set by the Container
  // column links on the Items page. The URL param is the single source of truth
  // so deep links and back-button work correctly (mirrors the old boxFilterId).
  const [searchParams, setSearchParams] = useSearchParams();
  const containerFilterId = searchParams.get('containerId');

  const clearContainerFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('containerId');
    setSearchParams(next);
  };

  // Load containers on mount and whenever the active database changes.
  useEffect(() => {
    fetchContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatabaseId]);

  const fetchContainers = async () => {
    try {
      setLoading(true);
      const response = await api.getContainers();
      if (response.success) {
        setContainers(response.data);
      } else {
        setError('Failed to load containers');
      }
    } catch (err) {
      console.error('Error fetching containers:', err);
      setError('Error loading containers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotice = (msg) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  };

  // --- Filtering: search by name/path + kind toggle. Ancestors of any match
  // stay visible so the tree context is never lost. ---
  const rows = useMemo(() => flattenTreeRows(containers), [containers]);

  const visibleRows = useMemo(() => {
    let matched = new Set();
    for (const row of rows) {
      const c = row.container;
      if (kindFilter !== 'all' && c.kind !== kindFilter) continue;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !(c.displayPath || '').toLowerCase().includes(q)) continue;
      }
      matched.add(String(c._id));
    }
    // No active filter → show everything.
    if (!searchQuery.trim() && kindFilter === 'all') return rows;
    const keep = new Set(matched);
    for (const id of collectAncestorIds(containers, matched)) keep.add(id);
    return rows.filter(r => keep.has(String(r.container._id)));
  }, [rows, containers, searchQuery, kindFilter]);

  // Label for the active filter chip (the container's display path).
  const containerFilterLabel = useMemo(() => {
    if (!containerFilterId) return '';
    const match = containers.find(c => String(c._id) === String(containerFilterId));
    return match?.displayPath || 'Unknown container';
  }, [containers, containerFilterId]);

  // Highlight + scroll to the deep-linked row once data is loaded.
  useEffect(() => {
    if (!containerFilterId || loading) return undefined;
    const t = setTimeout(() => {
      document.getElementById(`container-row-${containerFilterId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(t);
  }, [containerFilterId, loading, containers]);

  // --- Row actions ---

  const handleNewChild = (parentId) => {
    setCreateParentId(parentId || null);
    setCreateOpen(true);
  };

  const handleEdit = (c) => setEditingContainer(c);

  const handleViewItems = (c) => navigate(`/items?containerId=${c._id}`);

  const handleDeleteClick = (c) => {
    setDeleteTarget(c);
    setDeleteError(null);
  };

  // Delete: the backend blocks while children or direct items remain and returns
  // { childCount, itemCount } so we can explain exactly why. The dialog stays
  // open with that explanation when blocked.
  const handleDeleteConfirm = async () => {
    try {
      const response = await api.deleteContainer(deleteTarget._id);
      if (!response.success) {
        const counts = response.data || {};
        setDeleteError(
          `${response.error} (${counts.childCount ?? 0} child container(s), ${counts.itemCount ?? 0} direct item(s))`
        );
        return; // keep the dialog open with the explanation
      }
      setDeleteTarget(null);
      showNotice(`Deleted "${deleteTarget.name}".`);
      fetchContainers();
    } catch (err) {
      setError('Error deleting container: ' + err.message);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Containers</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleNewChild(null)}>
          Add Container
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {/* Search + kind filter */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search containers by name or path..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              endAdornment: searchQuery ? (
                <IconButton size="small" onClick={() => setSearchQuery('')} title="Clear search">
                  ×
                </IconButton>
              ) : null,
            },
          }}
        />
        <ToggleButtonGroup size="small" exclusive value={kindFilter} onChange={(e, v) => setKindFilter(v || 'all')}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="location"><PlaceIcon fontSize="inherit" sx={{ mr: 0.5 }} />Locations</ToggleButton>
          <ToggleButton value="box"><Inventory2Icon fontSize="inherit" sx={{ mr: 0.5 }} />Boxes</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Deep-link filter chip (?containerId=...) */}
      {containerFilterId && (
        <Box sx={{ mb: 2 }}>
          <Chip label={`Container: ${containerFilterLabel}`} color="primary" onDelete={clearContainerFilter} />
        </Box>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell align="right">Items</TableCell>
              <TableCell align="right">Subtree</TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center' }}>Loading...</TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center' }}>
                  {containers.length === 0
                    ? 'No containers found. Import data or add a container to get started.'
                    : 'No containers match your search/filter.'}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map(({ container: c, depth }) => {
                const highlighted = String(c._id) === String(containerFilterId);
                return (
                  <TableRow
                    key={c._id}
                    id={`container-row-${c._id}`}
                    selected={highlighted}
                    sx={{ '&.Mui-selected': { bgcolor: 'primary.main', color: 'common.white' } }}
                  >
                    {/* Name, indented by depth */}
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box component="span" sx={{ width: depth * 20, flexShrink: 0 }} />
                        {depth > 0 && <SubdirectoryArrowRightIcon fontSize="small" color={highlighted ? 'inherit' : 'disabled'} />}
                        <Typography variant="body2">{c.name}</Typography>
                      </Box>
                    </TableCell>
                    {/* Kind badge */}
                    <TableCell>
                      {c.kind === 'box' ? (
                        <Chip size="small" icon={<Inventory2Icon />} label="Box" color="primary" variant="outlined" />
                      ) : (
                        <Chip size="small" icon={<PlaceIcon />} label="Location" />
                      )}
                    </TableCell>
                    <TableCell align="right">{c.directItemCount || 0}</TableCell>
                    <Tooltip title="Number of descendant containers">
                      <TableCell align="right">{c.descendantCount || 0}</TableCell>
                    </Tooltip>
                    <TableCell align="right">
                      <Tooltip title="New child container">
                        <IconButton onClick={() => handleNewChild(c._id)} size="small" aria-label={`New child of ${c.name}`}>
                          <AddIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Rename / Move">
                        <IconButton onClick={() => handleEdit(c)} size="small" aria-label={`Rename or move ${c.name}`}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View items">
                        <IconButton onClick={() => handleViewItems(c)} size="small" aria-label={`View items in ${c.name}`}>
                          <FormatListBulletedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton onClick={() => handleDeleteClick(c)} size="small" color="error" aria-label={`Delete ${c.name}`}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create dialog (root or child) */}
      <ContainerFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(created, warnings) => {
          setCreateOpen(false);
          showNotice(
            `Created ${created.kind === 'box' ? 'box' : 'location'} "${created.name}".` +
            (warnings.length > 0 ? ` Note: ${warnings.join(' ')}` : '')
          );
          fetchContainers();
        }}
        initial={null}
        defaultParentId={createParentId}
        containers={containers}
      />

      {/* Rename / Move dialog */}
      <ContainerFormDialog
        open={Boolean(editingContainer)}
        onClose={() => setEditingContainer(null)}
        onSaved={(updated, warnings) => {
          setEditingContainer(null);
          showNotice(
            `Updated "${updated.name}".` + (warnings.length > 0 ? ` Note: ${warnings.join(' ')}` : '')
          );
          fetchContainers();
        }}
        initial={editingContainer}
        defaultParentId={null}
        containers={containers}
        onQuickCreated={() => fetchContainers()}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Container</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {deleteTarget?.kind === 'box' ? 'box' : 'container'}{' '}
            "{deleteTarget?.name}"? This action cannot be undone.
            {(deleteTarget && ((deleteTarget.descendantCount || 0) > 0 || (deleteTarget.directItemCount || 0) > 0)) && (
              <Box component="span" display="block" mt={1} color="warning.main">
                Note: this container still has {deleteTarget.descendantCount || 0} descendant container(s) and{' '}
                {deleteTarget.directItemCount || 0} direct item(s), so the server will block the delete.
              </Box>
            )}
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ContainerListPage;
