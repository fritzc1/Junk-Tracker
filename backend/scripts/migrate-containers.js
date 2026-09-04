#!/usr/bin/env node
/**
 * One-off migration: Location + Box -> Container (Stage 1b of
 * plans/container-tree-and-attributes-plan.md).
 *
 * Usage:
 *   node scripts/migrate-containers.js --dry-run   # STRICTLY READ-ONLY report, no writes at all
 *   node scripts/migrate-containers.js --apply     # backup + migrate + verification report
 *
 * Mapping (per plan):
 *   - Location with empty subLocation  -> one container (kind='location', root).
 *   - Location with non-empty subLocation -> parent container (name) + child
 *     container (subLocation as its own name, parentId = parent). The old
 *     location _id maps to the CHILD container id (items/boxes pointed at the
 *     specific shelf). A plain ("Garage", "") doc and a ("Garage", "Shelf 43")
 *     doc share ONE "Garage" parent container — same name in the same database
 *     is one physical place, so no duplicate sibling roots are created.
 *   - Box -> container kind='box', boxId preserved (canonical uppercase via
 *     utils/boxId.js), name = boxId if non-empty else generated "Box <short-id>",
 *     tags copied, parentId = mapped location container (null when the box had
 *     no location).
 *   - Items: containerId set from existing boxId XOR locationId, old refs cleared.
 *
 * Idempotency: a marker document {_id: 'containers-v1'} in the
 * `migration_markers` collection records a completed migration; re-running is a
 * safe no-op that prints status. A non-empty containers collection WITHOUT the
 * marker (possible partial/crashed run) aborts for manual review instead of
 * guessing.
 *
 * Safety: --apply backs up locations/boxes/items to JSON under
 * backend/backups/<timestamp>/ AND copies them to *_backup_<ts> collections
 * before writing anything. The old collections are never dropped (Stage 7).
 * Rollback = restore from backup + revert item refs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { normalizeBoxId } = require('../utils/boxId');

const MARKER_ID = 'containers-v1';
const SAMPLE_LIMIT = 10; // max anomaly samples printed per category
const BULK_CHUNK = 1000;

// ---------------------------------------------------------------------------
// CLI plumbing
// ---------------------------------------------------------------------------

function usage() {
  console.log('Usage: node scripts/migrate-containers.js --dry-run | --apply');
  console.log('  --dry-run  Read-only report of what the migration would do. No writes.');
  console.log('  --apply    Backup, run the migration, and print a verification report.');
}

function parseArgs(argv) {
  const flags = argv.filter(a => a.startsWith('--'));
  if (flags.includes('--help') || flags.length === 0) {
    usage();
    process.exit(flags.includes('--help') ? 0 : 2);
  }
  if (!flags.includes('--dry-run') && !flags.includes('--apply')) {
    console.error(`Unknown flag(s): ${flags.join(', ')}`);
    usage();
    process.exit(2);
  }
  if (flags.includes('--dry-run') && flags.includes('--apply')) {
    console.error('Pass exactly one of --dry-run or --apply.');
    usage();
    process.exit(2);
  }
  return flags[0] === '--apply' ? 'apply' : 'dry-run';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const shortId = (id) => String(id).slice(-8); // tail of the hex ObjectId, stable + unique enough for labels

function timestampDirName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

function section(title) {
  console.log('');
  console.log(`=== ${title} ===`);
}

function printSamples(label, samples) {
  if (samples.length === 0) return;
  console.log(`${label}: ${samples.length}${samples.length > SAMPLE_LIMIT ? ` (showing first ${SAMPLE_LIMIT})` : ''}`);
  for (const s of samples.slice(0, SAMPLE_LIMIT)) console.log(`  - ${s}`);
}

function* chunks(arr, size) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// ---------------------------------------------------------------------------
// State detection (idempotency)
// ---------------------------------------------------------------------------

async function detectState(db) {
  const marker = await db.collection('migration_markers').findOne({ _id: MARKER_ID });
  if (marker) return { state: 'migrated', marker };
  const containerCount = await db.collection('containers').countDocuments();
  if (containerCount > 0) return { state: 'ambiguous', count: containerCount };
  return { state: 'fresh' };
}

// ---------------------------------------------------------------------------
// Plan building — pure function over the source docs; shared by dry-run and apply.
// Returns { containers, locationMap, boxMap, itemUpdates, stats, anomalies }.
// ---------------------------------------------------------------------------

function buildPlan(locations, boxes, items) {
  const anomalies = {
    boxesMissingLocation: [], // box refs a location that does not exist
    itemsWithBothRefs: [], // XOR violation (legacy data)
    itemsDanglingBox: [], // item.boxId -> missing box
    itemsDanglingLocation: [], // item.locationId -> missing location
    caseConflictRenames: [], // duplicate normalized boxIds within one database
    unnamedLocations: [] // locations with empty name (fallback label used)
  };

  const containers = [];
  const locationMap = new Map(); // old Location _id (string) -> container ObjectId
  const boxMap = new Map(); // old Box _id (string) -> container ObjectId
  const itemUpdates = []; // { itemId, containerId } for items that need re-pointing

  let plainLocations = 0;
  let subLocations = 0;

  // --- Locations -----------------------------------------------------------
  const sortedLocs = [...locations].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  // `${databaseId}|${name}` -> { container, plainDocs, childCount }
  const parentsByKey = new Map();

  for (const loc of sortedLocs) {
    const dbId = String(loc.databaseId);
    let name = typeof loc.name === 'string' ? loc.name.trim() : '';
    if (!name) {
      name = `Location ${shortId(loc._id)}`;
      anomalies.unnamedLocations.push(`location ${loc._id} (db ${dbId}) had an empty name -> "${name}"`);
    }
    const sub = typeof loc.subLocation === 'string' ? loc.subLocation.trim() : '';

    // One parent container per (database, name) — shared between a plain doc
    // and any of its sub-location siblings so the tree has no duplicate roots.
    const key = `${dbId}|${name}`;
    let entry = parentsByKey.get(key);
    if (!entry) {
      const parent = { _id: new mongoose.Types.ObjectId(), databaseId: loc.databaseId, name, kind: 'location', parentId: null };
      containers.push(parent);
      entry = { container: parent, plainDocs: 0, childCount: 0 };
      parentsByKey.set(key, entry);
    }

    if (sub) {
      subLocations += 1;
      entry.childCount += 1;
      const child = { _id: new mongoose.Types.ObjectId(), databaseId: loc.databaseId, name: sub, kind: 'location', parentId: entry.container._id };
      containers.push(child);
      locationMap.set(String(loc._id), child._id); // old id -> CHILD (items/boxes pointed at the shelf)
    } else {
      plainLocations += 1;
      entry.plainDocs += 1;
      locationMap.set(String(loc._id), entry.container._id);
    }
  }

  // Parents that back both a plain doc and at least one sub-location child.
  const sharedParents = [...parentsByKey.values()].filter(e => e.plainDocs > 0 && e.childCount > 0).length;

  // --- Boxes ----------------------------------------------------------------
  const sortedBoxes = [...boxes].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  let boxesWithId = 0;
  let boxesGeneratedName = 0;
  const usedBoxIds = new Map(); // `${databaseId}|${normalizedBoxId}` -> occurrence count

  for (const box of sortedBoxes) {
    const dbId = String(box.databaseId);
    let boxIdNorm = normalizeBoxId(box.boxId);

    if (boxIdNorm) {
      boxesWithId += 1;
      const key = `${dbId}|${boxIdNorm}`;
      const seen = usedBoxIds.get(key) || 0;
      usedBoxIds.set(key, seen + 1);
      if (seen > 0) {
        // Duplicate normalized ID in the same database — the partial unique index
        // would reject it. Mirror server.js's migrateBoxIdsToUppercase policy:
        // earliest created keeps the canonical ID, later ones get -2/-3/... suffixes.
        const renamed = `${boxIdNorm}-${seen + 1}`;
        anomalies.caseConflictRenames.push(`box ${shortId(box._id)} (db ${dbId}): "${box.boxId}" -> "${renamed}"`);
        boxIdNorm = renamed;
      }
    } else {
      boxesGeneratedName += 1;
    }

    let parentId = null;
    if (box.locationId) {
      const mapped = locationMap.get(String(box.locationId));
      if (mapped) {
        parentId = mapped;
      } else {
        anomalies.boxesMissingLocation.push(`box ${shortId(box._id)} "${box.boxId || '(no id)'}" -> missing location ${box.locationId}`);
      }
    }

    const container = {
      _id: new mongoose.Types.ObjectId(),
      databaseId: box.databaseId,
      name: boxIdNorm || `Box ${shortId(box._id)}`,
      kind: 'box',
      parentId,
      boxId: boxIdNorm || undefined, // omit when empty so the partial index stays clean
      tags: Array.isArray(box.tags) ? [...box.tags] : []
    };
    containers.push(container);
    boxMap.set(String(box._id), container._id);
  }

  // --- Items ------------------------------------------------------------------
  let itemsFromBox = 0;
  let itemsFromLocation = 0;
  let itemsUnassigned = 0;

  for (const item of items) {
    const b = item.boxId ? String(item.boxId) : null;
    const l = item.locationId ? String(item.locationId) : null;

    if (b && l) {
      // XOR violation in legacy data — prefer the box (more specific), flag it.
      anomalies.itemsWithBothRefs.push(`item ${shortId(item._id)} has both boxId=${b} and locationId=${l}`);
      const target = boxMap.get(b) || locationMap.get(l) || null;
      if (target) {
        itemUpdates.push({ itemId: item._id, containerId: target });
        itemsFromBox += 1;
      } else {
        anomalies.itemsDanglingBox.push(`item ${shortId(item._id)} -> missing box ${b}`);
      }
      continue;
    }

    if (b) {
      const target = boxMap.get(b);
      if (target) {
        itemUpdates.push({ itemId: item._id, containerId: target });
        itemsFromBox += 1;
      } else {
        anomalies.itemsDanglingBox.push(`item ${shortId(item._id)} -> missing box ${b}`);
      }
      continue;
    }

    if (l) {
      const target = locationMap.get(l);
      if (target) {
        itemUpdates.push({ itemId: item._id, containerId: target });
        itemsFromLocation += 1;
      } else {
        anomalies.itemsDanglingLocation.push(`item ${shortId(item._id)} -> missing location ${l}`);
      }
      continue;
    }

    itemsUnassigned += 1; // no refs at all — nothing to do
  }

  const stats = {
    locations: locations.length,
    plainLocations,
    subLocations,
    sharedParents,
    boxes: boxes.length,
    boxesWithId,
    boxesGeneratedName,
    items: items.length,
    itemsFromBox,
    itemsFromLocation,
    itemsUnassigned,
    containersToCreate: containers.length,
    locationContainers: containers.filter(c => c.kind === 'location').length,
    boxContainers: containers.filter(c => c.kind === 'box').length,
    itemsToRepoint: itemUpdates.length
  };

  return { containers, locationMap, boxMap, itemUpdates, stats, anomalies };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printDryRunReport(plan) {
  const { stats, anomalies } = plan;

  section('DRY RUN — Container migration report (READ-ONLY, nothing was written)');
  console.log(`Generated: ${new Date().toISOString()}`);

  section('Source data');
  console.log(`Locations: ${stats.locations} (${stats.plainLocations} plain, ${stats.subLocations} with subLocation)`);
  if (stats.sharedParents > 0) {
    console.log(`  Note: ${stats.sharedParents} plain location(s) share their parent container with a same-named sub-location doc (no duplicate roots).`);
  }
  console.log(`Boxes:     ${stats.boxes} (${stats.boxesWithId} with box ID, ${stats.boxesGeneratedName} without -> generated name)`);
  console.log(`Items:     ${stats.items}`);

  section('Containers to create');
  console.log(`Total:      ${stats.containersToCreate}`);
  console.log(`  kind=location: ${stats.locationContainers}`);
  console.log(`  kind=box:      ${stats.boxContainers}`);

  section('Items to re-point (containerId set, old boxId/locationId cleared)');
  console.log(`Total:            ${stats.itemsToRepoint}`);
  console.log(`  from boxId:     ${stats.itemsFromBox}`);
  console.log(`  from locationId:${stats.itemsFromLocation}`);
  console.log(`  unassigned (no refs, untouched): ${stats.itemsUnassigned}`);

  section('Anomalies');
  const total = Object.values(anomalies).reduce((n, a) => n + a.length, 0);
  if (total === 0) {
    console.log('None found.');
  } else {
    printSamples('Boxes referencing missing locations', anomalies.boxesMissingLocation);
    printSamples('Items with BOTH boxId and locationId set (box wins)', anomalies.itemsWithBothRefs);
    printSamples('Items pointing at missing boxes (left untouched, reported)', anomalies.itemsDanglingBox);
    printSamples('Items pointing at missing locations (left untouched, reported)', anomalies.itemsDanglingLocation);
    printSamples('Duplicate box IDs within a database (later ones get -N suffix)', anomalies.caseConflictRenames);
    printSamples('Locations with empty name (fallback label used)', anomalies.unnamedLocations);
  }

  console.log('');
  console.log('DRY RUN complete — no changes were made to the database.');
}

// ---------------------------------------------------------------------------
// Apply mode
// ---------------------------------------------------------------------------

async function ensureContainerIndexes(db) {
  const collection = db.collection('containers');
  // Must match models/Container.js and server.js (ensureContainerIndexes).
  await collection.createIndex(
    { databaseId: 1, boxId: 1 },
    {
      unique: true,
      collation: { locale: 'en', strength: 2 },
      partialFilterExpression: {
        $and: [{ kind: 'box' }, { boxId: { $type: 'string' } }, { boxId: { $gt: '' } }]
      }
    }
  );
  await collection.createIndex({ databaseId: 1, parentId: 1 });
}

async function backupCollections(db, ts) {
  const backupDir = path.join(__dirname, '..', 'backups', ts);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = ['locations', 'boxes', 'items'];
  const manifest = { backedUpAt: new Date().toISOString(), uriHost: mongoose.connection.host, files: {}, copies: {} };

  for (const name of collections) {
    // 1) JSON dump (human-inspectable).
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(backupDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    manifest.files[name] = { count: docs.length, file: path.relative(process.cwd(), file) };

    // 2) Collection copy (primary rollback source — preserves types exactly).
    const copyName = `${name}_backup_${ts}`;
    if (docs.length > 0) {
      for (const chunk of chunks(docs, BULK_CHUNK)) {
        await db.collection(copyName).insertMany(chunk, { ordered: false });
      }
    }
    manifest.copies[name] = copyName;
  }

  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { backupDir, manifest };
}

async function applyMigration(db, plan) {
  const ts = timestampDirName();

  section('Backup');
  const { backupDir, manifest } = await backupCollections(db, ts);
  for (const [name, info] of Object.entries(manifest.files)) {
    console.log(`  ${name}: ${info.count} docs -> ${info.file}`);
  }
  console.log(`  Collection copies: ${Object.values(manifest.copies).join(', ')}`);

  section('Creating containers');
  await ensureContainerIndexes(db);
  const created = plan.containers.map(c => ({ ...c }));
  // ordered:true — a unique-index conflict aborts before any item is touched,
  // and the missing marker keeps re-runs in "manual review" state.
  if (created.length > 0) {
    await db.collection('containers').insertMany(created, { ordered: true });
  }
  console.log(`  Inserted ${created.length} containers (${plan.stats.locationContainers} location, ${plan.stats.boxContainers} box)`);

  section('Re-pointing items');
  const ops = plan.itemUpdates.map(({ itemId, containerId }) => ({
    updateOne: {
      filter: { _id: itemId },
      update: { $set: { containerId }, $unset: { boxId: '', locationId: '' } }
    }
  }));
  let updated = 0;
  for (const chunk of chunks(ops, BULK_CHUNK)) {
    const res = await db.collection('items').bulkWrite(chunk, { ordered: false });
    updated += res.modifiedCount;
  }
  console.log(`  Updated ${updated} items (containerId set, boxId/locationId cleared)`);

  section('Writing migration marker');
  await db.collection('migration_markers').insertOne({
    _id: MARKER_ID,
    migratedAt: new Date().toISOString(),
    backupDir: path.relative(process.cwd(), backupDir),
    stats: plan.stats
  });
  console.log(`  Marker "${MARKER_ID}" written (re-runs are now safe no-ops)`);

  return { ts, updated };
}

async function printVerificationReport(db, plan) {
  const createdIds = new Set(plan.containers.map(c => String(c._id)));

  section('Verification report');

  // Before/after counts.
  console.log('Before -> After:');
  console.log(`  containers collection: 0 -> ${await db.collection('containers').countDocuments()}`);
  const itemsWithContainer = await db.collection('items').countDocuments({ containerId: { $ne: null } });
  console.log(`  items with containerId: (none) -> ${itemsWithContainer} (expected ${plan.stats.itemsToRepoint})`);

  // Orphan checks.
  const danglingItems = [];
  const itemDocs = await db.collection('items').find({ containerId: { $ne: null } }, { projection: { _id: 1, containerId: 1 } }).toArray();
  for (const doc of itemDocs) {
    if (!createdIds.has(String(doc.containerId))) danglingItems.push(shortId(doc._id));
  }
  const danglingParents = plan.containers.filter(c => c.parentId && !createdIds.has(String(c.parentId)));

  console.log('Orphan checks:');
  console.log(`  items with dangling containerId: ${danglingItems.length}${danglingItems.length ? ` (${danglingItems.slice(0, SAMPLE_LIMIT).join(', ')})` : ''}`);
  console.log(`  containers with dangling parentId: ${danglingParents.length}`);

  // Sample paths (root -> leaf, " / "-joined) so the owner can eyeball the tree.
  const byId = new Map(plan.containers.map(c => [String(c._id), c]));
  const pathOf = (c) => {
    const parts = [];
    let cur = c;
    const seen = new Set();
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(String(cur.parentId)) : null;
    }
    return parts.join(' / ');
  };

  console.log('Sample paths:');
  const samples = [
    ...plan.containers.filter(c => c.kind === 'box' && c.parentId).slice(0, 3),
    ...plan.containers.filter(c => c.kind === 'location' && c.parentId).slice(0, 2)
  ];
  if (samples.length === 0) {
    console.log('  (no nested containers to sample)');
  } else {
    for (const s of samples) console.log(`  ${pathOf(s)}${s.kind === 'box' ? ` [box: ${s.boxId || '(none)'}]` : ''}`);
  }

  const ok = danglingItems.length === 0 && danglingParents.length === 0;
  section(ok ? 'MIGRATION APPLIED — verification PASSED' : 'MIGRATION APPLIED — verification FAILED (see orphans above)');
  console.log('Old locations/boxes collections are intact. Rollback: restore from the backup listed above and revert item refs.');
  return ok;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const mode = parseArgs(process.argv.slice(2));

  await connectDB(); // exits on failure
  const db = mongoose.connection.db;

  section(`Mode: ${mode.toUpperCase()} — database "${mongoose.connection.name}" @ ${mongoose.connection.host}`);

  const state = await detectState(db);
  if (state.state === 'migrated') {
    console.log('Migration already applied (marker present) — nothing to do.');
    console.log(`  migratedAt: ${state.marker.migratedAt}`);
    console.log(`  backupDir:  ${state.marker.backupDir || '(not recorded)'}`);
    console.log(`  containers now in DB: ${await db.collection('containers').countDocuments()}`);
    await mongoose.connection.close();
    return;
  }
  if (state.state === 'ambiguous') {
    console.error(
      `ABORT: the "containers" collection already holds ${state.count} document(s) but no migration marker exists.\n` +
        'This suggests a previously interrupted or manual run. Review the data before re-running.'
    );
    await mongoose.connection.close();
    process.exitCode = 1;
    return;
  }

  // Read source docs (raw driver cursors — plain objects, no model hooks involved).
  const [locations, boxes, items] = await Promise.all([
    db.collection('locations').find({}).sort({ createdAt: 1 }).toArray(),
    db.collection('boxes').find({}).sort({ createdAt: 1 }).toArray(),
    db.collection('items').find({}).toArray()
  ]);

  const plan = buildPlan(locations, boxes, items);

  if (mode === 'dry-run') {
    printDryRunReport(plan);
    await mongoose.connection.close();
    return;
  }

  // Apply mode.
  await applyMigration(db, plan);
  const ok = await printVerificationReport(db, plan);
  await mongoose.connection.close();
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  console.error('[migrate-containers] Fatal error:', err.message);
  process.exit(1);
});
