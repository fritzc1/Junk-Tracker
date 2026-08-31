import { useState } from 'react';

// Valid values must match rowsPerPageOptions used in each list page:
// [5, 10, 25, 50, { label: 'All', value: -1 }]
const VALID_VALUES = [5, 10, 25, 50, -1];
const DEFAULT_VALUE = 10;

/**
 * Persist the "rows per page" pagination preference in sessionStorage,
 * with a separate key per page so each list keeps its own setting.
 *
 * The value survives reloads within the same browser tab/session and is
 * independent across tabs (sessionStorage is per-tab).
 *
 * @param {string} storageKey Page identifier used to build the storage key,
 *   e.g. 'items' → 'junk-tracker.rowsPerPage.items'.
 * @param {Function} [onValueChange] Optional callback invoked after a new
 *   value is applied (e.g. () => setPage(0) to reset pagination).
 * @returns {[number, Function]} [rowsPerPage, handleChangeRowsPerPage] —
 *   compatible with MUI TablePagination's rowsPerPage / onRowsPerPageChange props.
 */
export function useRowsPerPage(storageKey, onValueChange) {
  const key = `junk-tracker.rowsPerPage.${storageKey}`;

  const [rowsPerPage, setRowsPerPage] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (VALID_VALUES.includes(n)) return n; // guard against stale/corrupt values
      }
    } catch {
      /* storage unavailable (e.g. private browsing) — fall through to default */
    }
    return DEFAULT_VALUE;
  });

  const handleChangeRowsPerPage = (event) => {
    const value = event.target.value === 'all' ? -1 : parseInt(event.target.value, 10);
    setRowsPerPage(value);
    try {
      sessionStorage.setItem(key, String(value));
    } catch {
      /* ignore storage failures — state still updates in-memory */
    }
    if (onValueChange) onValueChange();
  };

  return [rowsPerPage, handleChangeRowsPerPage];
}

export default useRowsPerPage;
