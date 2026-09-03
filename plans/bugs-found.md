# Things I am finding from use.

This list is my temporary quick note space. Each item is linked to if a GitHub issue was created:

  - typing space after a number should filter. ie. type 3<space> shows "3" but omits things like "31", "35", "300" etc. → [#5](https://github.com/fritzc1/Junk-Tracker/issues/5)
  - contents of search should get carried into create new. search for "Box 78"- not found, so click "+", the form should be pre filled to box 78. → [#6](https://github.com/fritzc1/Junk-Tracker/issues/6)
  - default search should be fuzzy. "cnc switch" will find "cnc zeroing switch". also may want fuzzy to be the default advanced search type. → [#7](https://github.com/fritzc1/Junk-Tracker/issues/7)
  - duplicate item button next to edit item. Same for box and location? → [#8](https://github.com/fritzc1/Junk-Tracker/issues/8)
  - easy "multi-array" creation for box/location with number range substitution or regex. (like partkeepr) → [#9](https://github.com/fritzc1/Junk-Tracker/issues/9)
  - hierarchy system for tags, locations, boxes, items (ala partkeepr) → [#10](https://github.com/fritzc1/Junk-Tracker/issues/10) (umbrella; see also `container-tree-and-attributes-plan.md` and issue #2)
  - multi-edit box tags doesn't always update all boxes. Example: two boxes have tag "a", multi edit replace all tags with tag "b", the first box has tag "b" but the second still has tag "a" → [#11](https://github.com/fritzc1/Junk-Tracker/issues/11)
  - import/export to JSON or other data format now → [#12](https://github.com/fritzc1/Junk-Tracker/issues/12) (covered by container plan Step 2b)
  - Export to Excel Spreadsheet should now be considered an output-only format, presented as nicely formatted tables intended for printing. → [#13](https://github.com/fritzc1/Junk-Tracker/issues/13) (see also issue #1)


# AI-suggested Location strategy:

## The Recommended Architecture: Unified Self-Referencing Tree

Instead of building completely separate, rigid database tables (locations, boxes, items), use a Node/Container pattern where everything that holds an object is a "Storage Node," but typed by its physical role:

```text
[Location: Workshop]
   └── [Location: Metal Shelving 1]
          └── [Location: Shelf B]
                 ├── [Item: Heavy Angle Grinder (Loose)]
                 └── [Container: Sortimo Box #12] (Movable)
                        ├── [Container: Compartment A1]
                        │      └── [Item: 10k Resistors]
                        └── [Item: Wire Strippers]
```

## Core Database Design

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| `storage_nodes` | `id`, `parent_id`, `name`, `type`, `is_movable`, `barcode` | Stores rooms, racks, shelves, bins, and compartments in one tree. |
| `items` | `id`, `storage_node_id`, `name`, `quantity`, `category_id` | Links an item directly to any node (loose on a shelf or inside a box). |

- **`type` field values:** `room`, `shelf`, `box`, `compartment`, `drawer`.
- **is_movable flag:** Set to FALSE for rooms and shelves; set to TRUE for portable totes, toolboxes, and organizers.

## Key Advantages for Your Workshop

- **The "Workbench" Workflow:** When starting a project, reassign `Container: Dremel Accessories` to `Location: Workbench`. All 40 bits inside move with it instantly.
- **Recursive Breadcrumbs:** You can generate human-readable paths automatically:
  `Garage → Rack 2 → Shelf B → Bin #14 → Drawer 3 → M3 Cap Screws`
- **Loose Item Support:** Large tools (miter saw, shop vac) live directly on a `Shelf` node without forcing you to invent dummy "boxes" to put them in.
- **Scan-to-Move Simplicity:** Stick a QR sticker on Shelf B and Box #12. Scan Box #12, scan Shelf B, and the box is moved.

## Practical UI Guidelines to Prevent Burnout

- **Don't force depth:** Allow loose items at any level. Never force a 5-level hierarchy if something is just sitting on a garage shelf.
- **Box-level searches:** When you search "resistor", the search result should highlight both the item and its immediate movable box label (e.g., "Found in Bin 04 (Electronics Tote) on Shelf 2").
- **Batch ingestion:** Add a "rapid add" screen where you lock the active container (e.g., "Sortimo Box 03") and simply type item names or scan SKUs one after another.