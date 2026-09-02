# Changelog

## v1.0.0 (2026-09-01)

### Bug Fixes

- stop recreating Default database on startup when databases already exist

### Other

- Add View Items on Locations page and differentiate box/item icons
- Add multi-database support, release tooling, and bulk-edit tag modes
- Add View Items action on Tags page to filter items by tag
- Fold box IDs to uppercase on all write paths with startup migration
- Add shared nav bar and settings page; move export/import/clear off home
- Move pagination above each table with page numbers and goto input
- Persist rows-per-page preference per list page in sessionStorage
- Fix item import to support tags and created/modified dates
- Make box ID field a freeSolo autocomplete with live duplicate detection
- Add in-page quick-create for boxes and locations on the item entry form
- Filter boxes by location and items by box from URL query params
- Add pagination to boxes, locations, and tags list pages
- Add Shift+click range selection to item list
- Initial commit: junk tracker app with Express/MongoDB backend and React frontend
