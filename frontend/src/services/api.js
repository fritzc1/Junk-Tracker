// API service for communicating with the backend
// In development, Vite proxies /api requests to http://localhost:5000
// In production, update this to point to your actual backend URL

const API_BASE_URL = '/api';

export const api = {
  // Get all items
  getItems: async () => {
    const response = await fetch(`${API_BASE_URL}/items`);
    return response.json();
  },

  // Get item by ID
  getItemById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/items/${id}`);
    return response.json();
  },

  // Create new item
  createItem: async (itemData) => {
    const response = await fetch(`${API_BASE_URL}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemData),
    });
    return response.json();
  },

  // Update item
  updateItem: async (id, itemData) => {
    const response = await fetch(`${API_BASE_URL}/items/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemData),
    });
    return response.json();
  },

  // Delete item
  deleteItem: async (id) => {
    const response = await fetch(`${API_BASE_URL}/items/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Search items
  searchItems: async (query) => {
    const response = await fetch(`${API_BASE_URL}/items/search/${query}`);
    return response.json();
  },

  // --- Box API methods ---

  // Get all boxes (with item counts)
  getBoxes: async () => {
    const response = await fetch(`${API_BASE_URL}/boxes`);
    return response.json();
  },

  // Get box by ID (with items)
  getBoxById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/boxes/${id}`);
    return response.json();
  },

  // Create new box
  createBox: async (boxData) => {
    const response = await fetch(`${API_BASE_URL}/boxes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boxData),
    });
    return response.json();
  },

  // Update box
  updateBox: async (id, boxData) => {
    const response = await fetch(`${API_BASE_URL}/boxes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boxData),
    });
    return response.json();
  },

  // Delete box
  deleteBox: async (id) => {
    const response = await fetch(`${API_BASE_URL}/boxes/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // --- Location API methods ---

  getLocations: async () => {
    const response = await fetch(`${API_BASE_URL}/locations`);
    return response.json();
  },

  getLocationById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/locations/${id}`);
    return response.json();
  },

  createLocation: async (locationData) => {
    const response = await fetch(`${API_BASE_URL}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locationData),
    });
    return response.json();
  },

  updateLocation: async (id, locationData) => {
    const response = await fetch(`${API_BASE_URL}/locations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locationData),
    });
    return response.json();
  },

  deleteLocation: async (id) => {
    const response = await fetch(`${API_BASE_URL}/locations/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // --- Tag API methods ---

  getTags: async () => {
    const response = await fetch(`${API_BASE_URL}/tags`);
    return response.json();
  },

  searchTags: async (query) => {
    const response = await fetch(`${API_BASE_URL}/tags/search?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  createTag: async (name) => {
    const response = await fetch(`${API_BASE_URL}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return response.json();
  },

  deleteTag: async (id) => {
    const response = await fetch(`${API_BASE_URL}/tags/${id}`, { method: 'DELETE' });
    return response.json();
  }
};
