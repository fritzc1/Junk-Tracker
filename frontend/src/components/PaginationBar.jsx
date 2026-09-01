import React, { useState } from 'react';
import { Box, Button, IconButton, Pagination, TablePagination, TextField, Typography } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/**
 * Shared pagination bar for list pages.
 *
 * variant="top" (default): rendered above the table. Combines the standard MUI
 * TablePagination (rows-per-page select, count label — its built-in prev/next
 * arrows are suppressed in favor of the numbered buttons) with numbered page
 * buttons and a "Go to" input field. The numbered buttons and goto input are
 * hidden when there is only one page or when all rows are shown at once ("All").
 *
 * variant="bottom": rendered below the table for quick navigation after
 * scrolling through a page. Shows compact Prev/Next buttons with a "Page X of Y"
 * label (only when multiple pages exist) plus a back-to-top button. Hidden
 * entirely when there are no rows.
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
  variant = 'top',
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

  // Bottom variant: compact Prev/Next + "Page X of Y" for quick navigation after
  // scrolling through a page, plus a back-to-top button. Hidden when there are
  // no rows; Prev/Next and the label hide themselves on a single page / "All".
  if (variant === 'bottom') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...sx }}>
        {showPageControls && (
          <>
            <IconButton
              size="small"
              aria-label="Previous page"
              disabled={page <= 0}
              onClick={() => onPageChange(null, Math.max(0, page - 1))}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="body2">
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </Typography>
            <IconButton
              size="small"
              aria-label="Next page"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(null, Math.min(totalPages - 1, page + 1))}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}
        {count > 0 && (
          <Button
            size="small"
            startIcon={<ArrowUpwardIcon />}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            sx={{ ml: showPageControls ? 'auto' : 0 }}
          >
            Back to top
          </Button>
        )}
      </Box>
    );
  }

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
        // Suppress the built-in prev/next arrows; navigation is handled by the
        // numbered buttons here and the bottom pager below the table.
        ActionsComponent={() => null}
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
