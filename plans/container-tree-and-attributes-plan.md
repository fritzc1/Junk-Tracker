# Container Tree + Item Attributes — Detailed Staged Plan

**Status legend (how we track progress):**
- `- [ ]` = pending step
- `- [x]` = completed and verified step
- Each stage ends with a **Definition of Done** checklist; a stage is only "done" when every item in it is checked.
- The Stage Status table below is the at-a-glance view — update it as stages complete.

## Stage Status

| Stage | Name | Status |
|-------|------|--------|
| 1 | Container schema + data migration | ✅ Complete — applied 2026-09-04 (backup at `backend/backups/20260904-001557`); zero orphans, old collections intact |
| 2 | Container API + item reference cutover | ⬜ Not started |
| 3 | Unified container UI + item page updates | ⬜ Not started |
| 4 | Attribute system (backend) | ⬜ Not started |
| 5 | Attribute system (frontend) | ⬜ Not started |
| 6 | Attribute sets (type-scoped attribute profiles) | ⬜ Not started |
| 7 | Cleanup, docs, hardening | ⬜ Not started |

Stages 1→2→3 must run in order. Stages 4→5 are independent of 1–3 and can be interleaved or done after. Stage 6 builds on Stage 5 (it reuses the parameterized picker component). Stage 7 is last.

---

## Background & Goals

Today the app has two container-ish entities:
- `Location` — `name` + `subLocation`, unique per `(databaseId, name, subLocation)` ([backend/models/Location.js](../backend/models/Location.js))
- `Box` — `boxId` string + optional `locationId` ref ([backend/models/Box.js](../backend/models/Box.js))

Items reference exactly one of them via an XOR rule (`boxId` XOR `locationId`) in [backend/models/Item.js](../backend/models/Item.js).

Problems this plan solves:
1. **No nesting** — a box cannot live inside another box; shelves are a string field, not entities (no links, no per-shelf queries).
2. **XOR wart** — items carry two nullable refs with validation glue in model + controller + forms.
3. **Two parallel UIs** for one concept (Locations page and Boxes page), duplicated link/filter logic.
4. **No classification system** for parts (footprint, tolerance, value) beyond free-form tags.

### Target data model

```mermaid
erDiagram
    Container ||--o{ Container : "contains via parentId"
    Container ||--o{ Item : "holds directly"
    Attribute }o--|| Database : "belongs to"
    Item }o--o{ Tag : "tagged with"

    Container {
        ObjectId _id PK
        ObjectId databaseId FK
        string name "Garage, Shelf 43, A06"
        string kind "location or box"
        ObjectId parentId FK-nullable "null means root"
        string boxId "only when kind is box"
        array tags "refs to Tag"
    }
    Item {
        ObjectId _id PK
        ObjectId databaseId FK
        string description
        ObjectId containerId FK-nullable "single ref replaces boxId and locationId"
        map attributes "dimensionName to valueString, sparse"
        array tags "refs to Tag"
    }
    Attribute {
        ObjectId _id PK
        ObjectId databaseId FK
        string name "footprint, tolerance, value"
        array values "controlled vocabulary strings"
    }
```

### Confirmed design decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Merge Location + Box into one `Container` collection with `kind: 'location' \| 'box'` (binary) | Both are physical containers; room-vs-shelf is tree depth, not a type. Kills the item XOR and enables boxes-in-boxes. |
| D2 | Item stays a **separate** collection referencing one container via `containerId` | Items are leaf content with their own shape (description/tags/attributes); merging them into nodes would be over-generalization. |
| D3 | `subLocation` is retired; existing `(name, subLocation)` pairs become parent/child containers during migration | Shelves become first-class linkable entities instead of a string suffix. |
| D4 | Attributes = per-database dimensions with controlled value lists; items store one value per dimension in a sparse map | Faceted (multi-dimensional) classification without a category hierarchy — the correct shape for parts, which are multi-faceted rather than linearly classifiable. |
| D5 | No Category entity / no tag grouping tree | Partkeepr's categories exist to serve type-taxonomy of electronic components; our physical tree + flat tags + faceted attributes cover the real needs at personal scale. Revisit only if a concrete need appears. |
| D6 | "Space Available" (capacity status) is tracked as a **container tag**, not an attribute or field | It's a property of the container, not its contents; containers already carry `tags[]`, and this keeps the item-level attribute system clean. |

---

## Stage 1 — Container schema + data migration (backend, highest risk)

### Step 1a: Create the Container model
- [x] Create `backend/models/Container.js`:
  - `databaseId` — ObjectId ref `Database`, required (per-database scoping like all entities).
  - `name` — String, required, trim. **No global uniqueness** (siblings may share names under different parents; e.g., "Shelf 43" in Garage and in Theater).
  - `kind` — String enum `['location', 'box']`, default `'location'`.
  - `parentId` — ObjectId ref `Container`, nullable, default null. Index on `parentId`.
  - `boxId` — String, trim (only meaningful when `kind='box'`).
  - `tags` — array of ObjectId refs `Tag` (boxes currently carry tags; locations don't yet but may).
  - `createdAt` / `updatedAt` timestamps + pre-save hook.
- [x] Indexes:
  - Partial unique index on `(databaseId, boxId)` with case-insensitive collation (`strength: 2`) and `partialFilterExpression: { kind: 'box', boxId: { $type: 'string' }, ... }` — mirrors the existing Box model's index pattern in [backend/models/Box.js](../backend/models/Box.js) (multiple ID-less boxes allowed).
  - Index on `(databaseId, parentId)` for tree queries.
- [x] Cycle guard: pre-save hook that walks up from `parentId` and rejects if `_id` appears among ancestors (defense-in-depth; the controller also checks on move).
- [x] Register model in `backend/server.js` alongside existing models; add index bootstrap next to the existing location-index migration block.

### Step 1b: Migration script
- [x] Create `backend/scripts/migrate-containers.js`, run as a one-off CLI (`node scripts/migrate-containers.js --dry-run | --apply`).
- [x] **Backup first:** dump current `locations`, `boxes`, `items` collections to JSON files under `backups/<timestamp>/` (and/or copy to `*_backup_<ts>` collections). Keep until Stage 7. *(done: `backend/backups/20260904-001557/` + `*_backup_20260904-001557` collection copies)*
- [x] Mapping logic:
  - Each Location with empty `subLocation` → one container (`kind='location'`).
  - Each Location with non-empty `subLocation` → parent container (`name`) + child container (`subLocation` as its own name, `parentId` = parent). Record old `_id` → **child** container id (items/boxes pointed at the specific shelf).
  - Each Box → container `kind='box'`, `boxId` preserved, `name` = boxId if non-empty else generated `"Box <short-id>"`, `tags` copied, `parentId` = mapped location container (null if the box had no location).
- [x] Item cutover: for every item set `containerId` from existing `boxId` or `locationId` (XOR guarantees at most one), then clear old refs. *(logic implemented + computed in dry-run; the actual writes happen on `--apply`)*
- [x] **Dry-run mode** prints a full report without writing: counts of containers to create per kind, items to re-point, any anomalies (e.g., boxes referencing missing locations). *(verified read-only against real data 2026-09-04; see Stage Status note)*
- [x] **Verification report on apply:** before/after counts, orphan check (no item with dangling `containerId`, no container with dangling `parentId`), sample path prints. *(the built-in report had a cursor bug that crashed after the writes; fixed in-script and verification completed via direct DB checks: 0 dangling items, 0 dangling parents, 556/575 items re-pointed, sample paths correct)*
- [x] Idempotency: safe to re-run (detects already-migrated state via presence of `containers` collection + mapping marker document). *(verified: post-marker `--apply` and `--dry-run` both exit as no-ops)*

### Definition of Done — Stage 1
- [x] `Container` model exists with all fields/indexes above; app boots cleanly. *(verified: clean boot on port 5099, container indexes synced)*
- [x] Migration dry-run on real data reviewed and approved by owner. *(approved 2026-09-04; pre-apply cleanup: cleared stale `boxId` on 13 items pointing at deleted box `6a957ea8…c80`, making them unassigned)*
- [x] Migration applied; verification report shows zero orphans, counts match expectations. *(134 containers = 39 location + 95 box; 556 items re-pointed; 0 dangling refs in either direction)*
- [x] Old `locations`/`boxes` collections still intact (no drop yet) — rollback = restore from backup + revert item refs. *(verified: locations=37, boxes=95 docs intact; backups at `backend/backups/20260904-001557`)*

---

## Stage 2 — Container API + item reference cutover (backend)

### Step 2a: Container controller + routes
- [ ] Create `backend/controllers/containerController.js`:
  - `getContainers` — flat list for the active database with computed fields: `displayPath` (e.g., `"Garage / Shelf 43"`), `directItemCount`, `descendantCount`. Frontend builds the tree from `parentId`.
  - `createContainer` — validate name; optional sibling-name duplicate **warning** (non-blocking) when a same-named container exists under the same parent.
  - `updateContainer` — rename and/or move (`parentId`). Move rules: reject self/cycle (walk ancestors), warn on sibling name collision, recompute nothing else (paths are computed at read time).
  - `deleteContainer` — block if it has child containers or direct items; return counts so the UI can explain why.
  - `getContainerById` — single container + its subtree + direct items (for detail view / "view contents").
- [ ] Create `backend/routes/containers.js`; register in `backend/server.js`. Keep old `/api/locations` and `/api/boxes` routes mounted until Stage 7 so nothing breaks mid-migration.

### Step 2b: Item model + controller cutover, export/import formats
- [ ] Update `backend/models/Item.js`: remove `boxId`, `locationId`, and the XOR pre-save hook; add `containerId` (ObjectId ref `Container`, nullable) with index.
- [ ] Update `backend/controllers/itemController.js`:
  - All populate chains: replace box/location populates with a single container populate that also fetches ancestor chain for `displayPath`.
  - Search haystack: include resolved container path + name.

**Export/import — two formats, different jobs.** JSON is the **canonical lossless** format (backup, migration, moving data between databases); CSV/XLSX is a **flattened view for humans**. A flat spreadsheet cannot losslessly represent a nested tree or a sparse attribute map, so it must not be treated as the source of truth.

- [ ] **JSON export** endpoint: full snapshot of the active database —
  - `version` (format version) + `exportedAt`.
  - `containers[]`: `_id`, `name`, `kind`, `parentId`, `boxId`, tags — the tree is fully reconstructable from `parentId`.
  - `items[]`: `_id`, `description`, raw `containerId` (not a path), full attribute map once Stage 4 lands, tag ids.
  - `tags[]` (+ attribute dimensions/sets once Stages 4–6 land).
  - **Round-trip guarantee:** importing an export into an empty database reproduces the data exactly — same tree, same references, same values.
- [ ] **JSON import** endpoint: accepts a snapshot; creates entities preserving ids where possible (or remaps them consistently); reports conflicts/omissions instead of failing silently; tolerates missing sections from older format versions (e.g., no `attributes` before Stage 4).
- [ ] **CSV/XLSX flattening rules** (`buildExportRow`) — for humans:
  - One **Container** column = full display path (`Garage / Shelf 43`), replacing the separate Location / Sub-Location / Box ID columns.
  - Keep a raw `containerId` column so import can round-trip without re-resolving paths.
  - Tags → one comma-separated column.
  - Attribute dimensions (once Stage 4 lands) → one dynamic column per defined dimension, blank when unset; the row builder must already iterate over defined dimensions so this is a small change later.
- [ ] **CSV/XLSX import** (`backend/routes/items.js`): container path column → create/find containers along the path (split on `/`, creating missing parents); box-id column → `kind='box'`; attribute columns map back to dimensions by header name; unknown headers are reported, not silently dropped.
- [ ] UI export buttons for both formats land with the item-page work in Stage 3b (backend endpoints exist from this step).

### Definition of Done — Stage 2
- [ ] All container CRUD + move/cycle-check works via API against real data.
- [ ] Items list/export/import work end-to-end with single `containerId`; no code path still reads `boxId`/`locationId`.
- [ ] JSON export → import into a fresh database round-trips losslessly (verified on real data).
- [ ] Old location/box endpoints still respond (for the not-yet-updated frontend).

---

## Stage 3 — Unified container UI + item page updates (frontend)

### Step 3a: Container tree page (replaces Locations + Boxes pages)
- [ ] Create `frontend/src/pages/ContainerListPage.jsx`:
  - Indented/tree table of all containers in the active database, sorted by path; type badge or icon for `box` vs `location`.
  - Columns: Name (indented by depth), Kind, Box ID (boxes only), Items count, Subtree size.
  - Row actions: **New child**, **Rename/Move** (dialog with parent picker — tree dropdown excluding self and descendants), **View items**, **Delete** (with explanatory error when blocked).
  - Search box filters by name/path; kind filter toggle (all / locations / boxes).
- [ ] Support `?containerId=` URL param: highlight + scroll to that row, show a dismissible chip — mirroring the existing `boxFilterId` pattern in [frontend/src/pages/BoxListPage.jsx](../frontend/src/pages/BoxListPage.jsx).
- [ ] Update `frontend/src/App.jsx`: route `/containers`; keep `/locations` and `/boxes` as redirects to `/containers`. Update `NavBar.jsx` (one "Containers" link replaces two).
- [ ] Remove now-dead components: `NewLocationDialog.jsx`, `NewBoxDialog.jsx`, `LocationEntryForm.jsx` (replaced by the inline create/rename dialogs), `LocationListPage.jsx`, `BoxListPage.jsx`, `LocationEntryPage.jsx`, `BoxEntryPage.jsx`.

### Step 3b: Item pages use one container reference
- [ ] `frontend/src/pages/ItemListPage.jsx`:
  - Replace Location / Sub-Location / Box ID columns with a single **Container** column showing the display path; clickable → `/containers?containerId=<id>` (mirrors the existing box-link pattern).
  - Update sort + advanced-search options accordingly (one `container` field matching against full path).
  - Container filter chip from URL param, same as today's location/box chips.
- [ ] `frontend/src/components/ItemEntryForm.jsx`: replace the box-selector + location-selector XOR pair with one **tree dropdown** (MUI Autocomplete over containers grouped by parent; boxes visually distinguished). Selecting a container sets `containerId`; no more clearing logic between two fields.
- [ ] Bulk edit: single "move to container" control replacing separate box/location bulk controls.

### Definition of Done — Stage 3
- [ ] One Containers page fully manages the tree (create/rename/move/delete/view) on real data; old pages gone from nav and routes redirect.
- [ ] Item list shows one clickable Container column; item form uses the single tree picker; bulk edit works.
- [ ] No frontend code references `boxId`/`locationId` or the old location/box API functions (remove them from `frontend/src/services/api.js`).

---

## Stage 4 — Attribute system, backend

### Step 4a: Attribute model + item validation
- [ ] Create `backend/models/Attribute.js`: `{ databaseId (required), name (unique per database, trim), values: [String] }`. Unique index on `(databaseId, name)`.
- [ ] Update `backend/models/Item.js`: add sparse map field `attributes` (`{ type: Map, of: String, default: {} }`) — keys are dimension names, values are vocabulary strings.
- [ ] Validation (controller-level, since it needs the Attribute collection): on item create/update, every key in `item.attributes` must be a defined dimension for that database and its value must be in that dimension's `values[]`; reject with a clear error otherwise.

### Step 4b: Attribute CRUD API
- [ ] Create `backend/controllers/attributeController.js` + `backend/routes/attributes.js`, scoped per active database:
  - List dimensions (with usage counts — how many items use each value).
  - Create dimension; add/remove values.
  - Rename dimension → also rewrite the key on all affected items (single transactional-ish pass with report).
  - Delete dimension → block while any item uses it (return count); deleting a **value** likewise blocked while in use.
- [ ] Register routes in `backend/server.js`.

### Definition of Done — Stage 4
- [ ] Dimensions + values manageable via API per database; usage counts accurate.
- [ ] Item save rejects out-of-vocabulary attribute values with actionable error messages.
- [ ] Rename/delete guards verified (blocked cases return counts, not silent data loss).

---

## Stage 5 — Attribute system, frontend

### Step 5a: Dimension management UI
- [ ] New page `frontend/src/pages/AttributeListPage.jsx` (or a section of SettingsPage): list dimensions for the active database; create dimension; edit its value list (add/remove with usage-count warnings); rename/delete with guard messaging.
- [ ] Add to nav + routes in `App.jsx`.

### Step 5b: Item form pickers + list columns
- [ ] `ItemEntryForm.jsx`: render one dropdown per defined dimension (options = that dimension's values, single-select, clearable). Only dimensions defined for the active database appear — so a Junk database with zero attributes shows nothing new.
  - **Forward-compat hook:** build the picker component to accept *a list of dimensions as a prop* rather than hardcoding "all dimensions in this database." Stage 6 (attribute sets) will simply pass in the selected set's dimensions instead — no rework of the picker itself.
- [ ] `ItemListPage.jsx`: dynamic attribute columns after the fixed ones; each column filterable and sortable on `item.attributes.<name>`; empty cells when unset.
- [ ] Bulk edit: allow setting/clearing one dimension's value across selected items (validated server-side).

### Definition of Done — Stage 5
- [ ] Full loop works in UI: define dimension → tag an item with its values → filter/sort the list by it → bulk-edit → rename a value and see items updated.
- [ ] A database with no attributes configured shows no attribute UI anywhere (zero overhead for Junk).

---

## Stage 6 — Attribute sets (type-scoped attribute profiles)

Goal: scope which dimensions apply per item type, so picking a set like "resistor" shows exactly that set's pickers (footprint / tolerance / value) and nothing else. This is what delivers truly error-free input — you cannot put `value` on a fastener if the fastener's set doesn't include a value dimension.

### Step 6a: AttributeSet model + API
- [ ] Create `backend/models/AttributeSet.js`: `{ databaseId (required), name (unique per database, trim), attributeIds: [ObjectId ref Attribute] }`. Unique index on `(databaseId, name)`.
- [ ] Update `backend/models/Item.js`: add nullable `attributeSetId` (ref `AttributeSet`). Purely additive — existing items simply have no set; no migration required.
- [ ] Extend item validation in the controller: when an item has a set, every key in `item.attributes` must belong to that set's dimensions and its value must be within that dimension's vocabulary; keys outside the set are rejected with a clear error. Items without a set keep Stage 4 behavior (any defined dimension allowed).
- [ ] AttributeSet CRUD controller + routes: list / create / update / delete sets, edit their member dimensions; block deletion while items reference the set (return count); renaming a set touches no item data (items store the id).

### Step 6b: Set picker in UI
- [ ] `ItemEntryForm.jsx`: add an "Attribute set" dropdown at the top of the attribute section. Selecting a set passes that set's dimensions to the parameterized picker component from Step 5b; clearing it falls back to all defined dimensions (default behavior — decide exact fallback during implementation).
- [ ] `ItemListPage.jsx`: optional "Set" column showing each item's set name, filterable like other columns.
- [ ] Bulk edit: allow assigning a set across selected items; server-side validation rejects attribute keys that fall outside the new set with an actionable error.

### Definition of Done — Stage 6
- [ ] Define a "resistor" set (footprint + tolerance + value) → create an item with that set → form shows exactly those three pickers and nothing else.
- [ ] Saving an attribute key outside the item's set is rejected with a clear error; items without a set still behave as in Stage 5.
- [ ] Set CRUD works per database, including delete guards while sets are in use.

---

## Stage 7 — Cleanup, docs, hardening

- [ ] Delete old backend code: `models/Location.js`, `models/Box.js`, `controllers/locationController.js`, `controllers/boxController.js`, `routes/locations.js`, `routes/boxes.js`; remove their registration in `server.js` (including the legacy location-index migration block).
- [ ] Remove leftover frontend references and dead API functions; confirm no console errors on all pages.
- [ ] Update import-mapping UI in `frontend/src/pages/DatabasesPage.jsx`: "Location / Sub-Location / Box ID" column mapping now maps to container creation (root + child + box kinds) — update the helper text accordingly.
- [ ] Drop the backup collections/JSON from Stage 1 **only after** owner confirms a full week of normal use; document how to restore if needed before dropping.
- [ ] Update `README.md` and `CHANGELOG.md`; note the data-model change (containers, attributes) for future reference.

### Definition of Done — Stage 7
- [ ] Codebase contains no Location/Box entity references outside historical plan docs.
- [ ] Fresh-install path works (no migration needed on empty DB); existing-data path verified via backup restore test.
- [ ] All seven stage checklists above fully checked.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Migration corrupts real data | Backup before apply; dry-run report reviewed first; old collections kept until Stage 7; idempotent script. |
| Name ambiguity after merge (same name under different parents) | Paths are always shown in full (`Garage / Shelf 43`); sibling duplicate warning on create/rename/move. |
| Cycle introduced by a move | Controller ancestor-walk check + schema pre-save guard; parent picker excludes self and descendants in UI. |
| Attribute value rename loses data | Rename rewrites item keys with a report; delete blocked while values are in use. |
| Scope creep back toward Partkeepr (categories, stock levels) | Out of scope by decision D5; revisit only on concrete need. Multi-database already isolates a future parts database from junk. |

## Explicitly out of scope (for now)

Each deferred item has a tracking issue so it isn't lost:

- Nicely formatted spreadsheet export (styling, merged cells, multi-sheet layouts, per-dimension formatting) — [issue #1](https://github.com/fritzc1/Junk-Tracker/issues/1); this plan produces working basic CSV/XLSX output only.
- Category trees / tag grouping hierarchies (D5) — [issue #2](https://github.com/fritzc1/Junk-Tracker/issues/2).
- Stock/quantity tracking and in-out transactions (revisit if parts usage grows into real inventory management — at that point consider whether it belongs in this app or a dedicated one; no fork needed either way since multi-database isolates data) — [issue #3](https://github.com/fritzc1/Junk-Tracker/issues/3).
- Saved-filter "virtual bins" (orthogonal feature; works over attributes + tags as-is when wanted) — [issue #4](https://github.com/fritzc1/Junk-Tracker/issues/4).
