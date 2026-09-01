import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setActiveDatabaseId } from '../services/api';

const STORAGE_KEY = 'junk-tracker-active-database';

// Context for the active logical database. The selection is persisted in
// localStorage; every data request carries it via the X-Database-Id header
// (see services/api.js). Pages refetch their data when activeDatabase changes.
const DatabaseContext = createContext(null);

export const DatabaseProvider = ({ children }) => {
  const [databases, setDatabases] = useState([]);
  const [activeDatabaseId, setActiveDatabaseIdState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null
  );
  const [loading, setLoading] = useState(true);

  // Load the database list. If the persisted selection no longer exists
  // (e.g. it was deleted), fall back to the first available database.
  const refreshDatabases = useCallback(async () => {
    try {
      const response = await fetch('/api/databases');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to load databases');

      setDatabases(result.data);

      setActiveDatabaseIdState((current) => {
        const exists = current && result.data.some(db => db._id === current);
        const next = exists ? current : (result.data[0]?._id ?? null);
        if (next !== current) localStorage.setItem(STORAGE_KEY, next || '');
        return next;
      });
    } catch (err) {
      console.error('Error loading databases:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDatabases();
  }, [refreshDatabases]);

  // Keep the API service's header in sync with the active selection.
  useEffect(() => {
    setActiveDatabaseId(activeDatabaseId);
  }, [activeDatabaseId]);

  const selectDatabase = useCallback((id) => {
    if (!id) return;
    localStorage.setItem(STORAGE_KEY, id);
    setActiveDatabaseIdState(id);
  }, []);

  const activeDatabase = databases.find(db => db._id === activeDatabaseId) || null;

  const value = {
    databases,
    activeDatabase,
    activeDatabaseId,
    selectDatabase,
    refreshDatabases,
    loading
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
};

export const useDatabases = () => {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabases must be used within a DatabaseProvider');
  return ctx;
};
