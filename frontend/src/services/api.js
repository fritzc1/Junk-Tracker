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

  // --- Box API methods ---

  // Get all boxes (with item counts)
  getBoxes: async () => request('/boxes'),

  // Get box by ID (with items)
  getBoxById: async (id) => request(`/boxes/${id}`),

  // Create new box
  createBox: async (boxData) =>
    request('/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boxData),
    }),

  // Update box
  updateBox: async (id, boxData) =>
    request(`/boxes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boxData),
    }),

  // Delete box
  deleteBox: async (id) => request(`/boxes/${id}`, { method: 'DELETE' }),

  // --- Location API methods ---

  getLocations: async () => request('/locations'),

  getLocationById: async (id) => request(`/locations/${id}`),

  createLocation: async (locationData) =>
    request('/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locationData),
    }),

  updateLocation: async (id, locationData) =>
    request(`/locations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locationData),
    }),

  deleteLocation: async (id) => request(`/locations/${id}`, { method: 'DELETE' }),

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

  deleteDatabase: async (id) => request(`/databases/${id}`, { method: 'DELETE' })
};
