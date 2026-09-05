// API service for communicating with the backend
// In development, Vite proxies /api requests to http://localhost:5000
// In production, update this to point to your actual backend URL

const API_BASE_URL = '/api';

// The active logical database (set by DatabaseContext). Every data request is
// scoped to it via the X-Database-Id header; the backend falls back to the
// oldest database when the header is missing or stale.
let activeDatabaseId = null;

export const setActiveDatabaseId = (id) => {
  activeDatabaseId = id || null;
};

export const getActiveDatabaseId = () => activeDatabaseId;

// Headers for raw fetch calls that bypass the request wrapper below
// (e.g. file downloads and multipart uploads).
const databaseHeaders = () =>
  activeDatabaseId ? { 'X-Database-Id': activeDatabaseId } : {};

// JSON request helper — attaches the active database header automatically.
const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...databaseHeaders(), ...(options.headers || {}) },
  });
  // Read as text first so an empty or non-JSON body (e.g. backend down)
  // produces a readable error instead of "Unexpected end of JSON input".
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned a non-JSON response (HTTP ${response.status}). Is the backend running?`
    );
  }
};

export const api = {
  // Get all items
  getItems: async () => request('/items'),

  // Get item by ID
  getItemById: async (id) => request(`/items/${id}`),

  // Create new item
  createItem: async (itemData) =>
    request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    }),

  // Update item
  updateItem: async (id, itemData) =>
    request(`/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    }),

  // Delete item
  deleteItem: async (id) => request(`/items/${id}`, { method: 'DELETE' }),

  // Search items
  searchItems: async (query) => request(`/items/search/${query}`),

  // --- Container API methods (Stage 3 — replaces the old box/location APIs) ---

  // Get all containers in the active database (flat list with computed
  // displayPath, directItemCount and descendantCount; frontend builds the tree).
  getContainers: async () => request('/containers'),

  // Get a single container + its subtree + direct items
  getContainerById: async (id) => request(`/containers/${id}`),

  // Create a container ({ name, kind, parentId?, boxId?, tags?/tagNames? })
  createContainer: async (containerData) =>
    request('/containers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerData),
    }),

  // Rename and/or move a container ({ name?, parentId?, boxId? })
  updateContainer: async (id, containerData) =>
    request(`/containers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerData),
    }),

  // Delete a container (400 + { childCount, itemCount } while blocked)
  deleteContainer: async (id) => request(`/containers/${id}`, { method: 'DELETE' }),

  // --- Attribute API methods (Stage 4 backend; Stage 5 frontend) ---
  // NOTE: the request helper resolves — it does not throw — on HTTP 400 with a
  // JSON body, so callers must check `success` and surface `error` themselves.

  // Get all attribute dimensions for the active database (sorted by name), each
  // with live usage counts: itemCount + per-value valueCounts.
  getAttributes: async () => request('/attributes'),

  // Create a dimension ({ name, values? }) — 400 on empty/dotted/$-prefixed or
  // case-insensitive duplicate names.
  createAttribute: async (attributeData) =>
    request('/attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attributeData),
    }),

  // Rename and/or replace a dimension's value list ({ name?, values? }). A
  // rename rewrites the key on all affected items; response reports itemsRewritten.
  updateAttribute: async (id, attributeData) =>
    request(`/attributes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attributeData),
    }),

  // Add one or more values ({ value } or { values: [] }).
  addAttributeValues: async (id, values) =>
    request(`/attributes/${id}/values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(values) ? { values } : { value: values }),
    }),

  // Remove one or more values — 400 + counts while any item still uses a value.
  removeAttributeValues: async (id, values) =>
    request(`/attributes/${id}/values`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(values) ? { values } : { value: values }),
    }),

  // Delete a dimension — 400 + count while any item still uses it.
  deleteAttribute: async (id) => request(`/attributes/${id}`, { method: 'DELETE' }),

  // --- Tag API methods ---

  getTags: async () => request('/tags'),

  searchTags: async (query) => request(`/tags/search?q=${encodeURIComponent(query)}`),

  createTag: async (name) =>
    request('/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteTag: async (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // --- Database API methods ---

  getDatabases: async () => request('/databases'),

  createDatabase: async (name) =>
    request('/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  renameDatabase: async (id, name) =>
    request(`/databases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteDatabase: async (id) => request(`/databases/${id}`, { method: 'DELETE' }),

  // Reorder databases — pass the FULL list of database IDs in the desired order.
  reorderDatabases: async (orderedIds) =>
    request('/databases/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    })
};
