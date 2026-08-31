import React, { useState } from 'react';
import { Box, Pagination, TablePagination, TextField, Typography } from '@mui/material';

/**
 * Shared pagination bar rendered above each list page's table.
 *
 * Combines the standard MUI TablePagination (rows-per-page select, count label,
 * prev/next arrows) with numbered page buttons and a "Go to" input field.
 * The numbered buttons and goto input are hidden when there is only one page
 * or when all rows are shown at once ("All").
 *
 * Props mirror the previous TablePagination usage on each list page:
 *   count, page (0-based), onPageChange(event, newPage), rowsPerPage,
 *   onRowsPerPageChange, rowsPerPageOptions. An optional sx is applied to the
 *   outer row (e.g. { mb: 1 } for spacing above the table).
 */
const PaginationBar = ({
  count,
  page,
  onPageChange,
  rowsPerPage,
  onRowsPerPageChange,
  rowsPerPageOptions,
  sx,
}) => {
  const [gotoValue, setGotoValue] = useState('');

  // Number of pages; "All" (-1) or a single page → no numbered controls.
  const totalPages = rowsPerPage > 0 ? Math.max(1, Math.ceil(count / rowsPerPage)) : 1;
  const showPageControls = count > 0 && rowsPerPage !== -1 && totalPages > 1;

  // Navigate to an absolute (1-based) page number, clamped to the valid range.
  const goToPage = (raw) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return; // ignore empty/invalid input
    onPageChange(null, Math.min(Math.max(1, n), totalPages) - 1);
    setGotoValue('');
  };

  const handlePageChange = (event, newPage) => {
    onPageChange(event, newPage);
    setGotoValue(''); // keep the goto field in sync with any page change
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, ...sx }}>
      <TablePagination
        component="div"
        count={count}
        page={page}
        onPageChange={handlePageChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        rowsPerPageOptions={rowsPerPageOptions}
      />
      {showPageControls && (
        <>
          <Pagination
            count={totalPages}
            page={Math.min(page + 1, totalPages)}
            onChange={(event, p) => onPageChange(event, p - 1)}
            size="small"
            sx={{ ml: 'auto' }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2">Go to</Typography>
            <TextField
              value={gotoValue}
              onChange={(e) => setGotoValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goToPage(gotoValue); }}
              onBlur={() => { if (gotoValue !== '') goToPage(gotoValue); }}
              type="number"
              size="small"
              sx={{ width: 72 }}
              slotProps={{ input: { min: 1, max: totalPages, step: 1 } }}
            />
          </Box>
        </>
      )}
    </Box>
  );
};

export default PaginationBar;
