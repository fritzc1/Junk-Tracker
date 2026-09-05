const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { normalizeBoxId } = require('./utils/boxId');
const requireDatabase = require('./middleware/requireDatabase');

// Indexes are synced explicitly in main() — after the boxId case migration and
// the index swap below — so startup ordering is deterministic.
mongoose.set('autoIndex', false);

// Drop stale unique index on Location.name if it exists from before composite index
async function dropStaleLocationIndex() {
  try {
    const indexes = await mongoose.connection.collection('locations').indexes();
    const staleIndex = indexes.find(idx => idx.name === 'name_1' && idx.unique);
    if (staleIndex) {
      console.log('[Startup] Dropping stale unique index "name_1" on locations...');
      await mongoose.connection.collection('locations').dropIndex('name_1');
      console.log('[Startup] Stale index "name_1" dropped successfully');
    }
  } catch (err) {
    // Ignore "ns not found" — collection may not exist yet
    if (!err.message?.includes('not found') && !err.message?.includes('NamespaceNotFound')) {
      console.warn('[Startup] Could not check for stale index:', err.message);
    }
  }
}

// One-time migration: fold all existing box IDs to the canonical uppercase form.
// Runs before the case-insensitive unique index is installed, so it can never be
// blocked by pre-fold data. Case-conflicts (e.g. both "A06" and "a06") are
// resolved deterministically — earliest created keeps its ID, later ones get a
// -2/-3/... suffix — and every change is logged for review.
async function migrateBoxIdsToUppercase() {
  const Box = require('./models/Box');

  const boxes = await Box.find({ boxId: { $nin: [null, ''] } }).sort({ createdAt: 1 });
  if (boxes.length === 0) return;

  // Group by canonical value to detect case-conflicts before writing anything.
  const groups = new Map();
  for (const box of boxes) {
    const key = normalizeBoxId(box.boxId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(box);
  }

  let folded = 0;
  let renamed = 0;
  for (const [canonical, members] of groups) {
    // Single member: fold in place when its stored form differs.
    if (members.length === 1 && members[0].boxId !== canonical) {
      console.log(`[Migration] Box ID folded: "${members[0].boxId}" -> "${canonical}"`);
      members[0].boxId = canonical;
      await members[0].save();
      folded += 1;
      continue;
    }

    // Conflict group (2+ boxes whose IDs differ only by case): the earliest
    // created keeps the canonical ID, the rest are renamed with a suffix.
    if (members.length > 1) {
      console.warn(`[Migration] Case-conflict on box ID "${canonical}": ${members.map(b => `"${b.boxId}"`).join(', ')} — keeping earliest, renaming the rest`);
    }
    for (let i = 0; i < members.length; i += 1) {
      const target = i === 0 ? canonical : `${canonical}-${i + 1}`;
      if (members[i].boxId !== target) {
        console.log(`[Migration] Box ID renamed: "${members[i].boxId}" -> "${target}"`);
        members[i].boxId = target;
        await members[i].save();
        renamed += 1;
      }
    }
  }

  if (folded > 0 || renamed > 0) {
    console.log(`[Migration] Box ID migration complete: ${folded} folded, ${renamed} conflict rename(s)`);
  } else {
    console.log('[Migration] All box IDs already in canonical uppercase form');
  }
}

// Ensure the case-insensitive UNIQUE box ID index is in place. Uniqueness is
// per-database (compound with databaseId) so the same physical label can exist
// in multiple databases; the partial filter limits the index to boxes that have
// a non-empty ID, and the collation makes uniqueness case-insensitive as
// defense-in-depth: even if a future write path bypasses normalizeBoxId, the
// index rejects "a06" when "A06" exists instead of silently creating a twin.
async function ensureCaseInsensitiveBoxIndex() {
  const collection = mongoose.connection.collection('boxes');

  // Drop any legacy global-unique boxId index (pre-multi-database).
  try {
    const indexes = await collection.indexes();
    if (indexes.some(idx => idx.name === 'boxId_1')) {
      console.log('[Startup] Dropping legacy global boxes.boxId unique index...');
      await collection.dropIndex('boxId_1');
    }
  } catch (err) {
    // Ignore "ns not found" — collection may not exist yet
    if (!err.message?.includes('not found') && !err.message?.includes('NamespaceNotFound')) {
      console.warn('[Startup] Could not inspect boxes indexes:', err.message);
    }
  }

  await collection.createIndex(
    { databaseId: 1, boxId: 1 },
    {
      unique: true,
      collation: { locale: 'en', strength: 2 },
      // ($gt instead of $ne — MongoDB partial filters don't support $ne)
      partialFilterExpression: { $and: [{ boxId: { $type: 'string' } }, { boxId: { $gt: '' } }] }
    }
  );
}

// Ensure the Container indexes are in place (Stage 1): the partial
// case-insensitive unique (databaseId, boxId) index for kind='box' docs and the
// per-database tree-query compound index. Idempotent — createIndex is a no-op
// when an identical index already exists. Must stay in sync with models/Container.js.
async function ensureContainerIndexes() {
  const collection = mongoose.connection.collection('containers');

  await collection.createIndex(
    { databaseId: 1, boxId: 1 },
    {
      unique: true,
      collation: { locale: 'en', strength: 2 },
      // ($gt instead of $ne — MongoDB partial filters don't support $ne)
      partialFilterExpression: {
        $and: [{ kind: 'box' }, { boxId: { $type: 'string' } }, { boxId: { $gt: '' } }]
      }
    }
  );

  await collection.createIndex({ databaseId: 1, parentId: 1 });
}

// One-time migration for multi-database support. Creates a "Default" database
// only when no databases exist yet (true first run), backfills every existing
// data document with its ID (so pre-existing data is preserved and visible),
// then swaps the old global-unique indexes to per-database compound unique
// indexes so e.g. box "A06" can exist in multiple databases. Idempotent: safe
// to run on every startup.
async function migrateToMultiDatabase() {
  const Database = require('./models/Database');

  // 1) Ensure at least one database exists. Only create "Default" when there
  // are NO databases at all (true first run); never add a stray "Default" to
  // an instance that already has user-created databases. When databases do
  // exist, the oldest is used as the backfill target for legacy documents.
  let defaultDb = await Database.findOne().sort({ createdAt: 1 });
  if (!defaultDb) {
    defaultDb = await Database.create({ name: 'Default' });
    console.log('[Migration] Created "Default" database');
  }

  // 2) Backfill databaseId on any documents that lack it (first run only).
  const collections = ['items', 'boxes', 'locations', 'tags'];
  for (const name of collections) {
    try {
      const result = await mongoose.connection.collection(name).updateMany(
        { databaseId: { $exists: false } },
        { $set: { databaseId: defaultDb._id } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[Migration] Backfilled databaseId on ${result.modifiedCount} ${name}`);
      }
    } catch (err) {
      // Collection may not exist yet — nothing to backfill.
      if (!/not found|NamespaceNotFound/i.test(err.message)) throw err;
    }
  }

  // 3) Swap global-unique indexes for per-database compound unique indexes.
  const boxes = mongoose.connection.collection('boxes');
  try {
    const boxIndexes = await boxes.indexes();
    if (boxIndexes.some(idx => idx.name === 'boxId_1')) {
      console.log('[Migration] Swapping boxes.boxId index to per-database compound index...');
      await boxes.dropIndex('boxId_1');
    }
    // Replace an earlier sparse compound index with the partial one (sparse
    // would collide on ID-less boxes since databaseId is always present).
    const oldCompound = boxIndexes.find(idx => idx.name === 'databaseId_1_boxId_1' && !idx.options?.partialFilterExpression);
    if (oldCompound) {
      console.log('[Migration] Replacing sparse compound box index with partial unique index...');
      await boxes.dropIndex('databaseId_1_boxId_1');
    }
  } catch (err) {
    if (!/not found|NamespaceNotFound/i.test(err.message)) throw err;
  }
  await boxes.createIndex(
    { databaseId: 1, boxId: 1 },
    {
      unique: true,
      collation: { locale: 'en', strength: 2 },
      // ($gt instead of $ne — MongoDB partial filters don't support $ne)
      partialFilterExpression: { $and: [{ boxId: { $type: 'string' } }, { boxId: { $gt: '' } }] }
    }
  );

  const locations = mongoose.connection.collection('locations');
  try {
    const locIndexes = await locations.indexes();
    if (locIndexes.some(idx => idx.name === 'name_1_subLocation_1')) {
      console.log('[Migration] Swapping locations index to per-database compound index...');
      await locations.dropIndex('name_1_subLocation_1');
    }
  } catch (err) {
    if (!/not found|NamespaceNotFound/i.test(err.message)) throw err;
  }
  await locations.createIndex({ databaseId: 1, name: 1, subLocation: 1 }, { unique: true });

  // Container indexes (Stage 1): the partial case-insensitive unique boxId
  // index and the tree-query compound index. Created here so a containers
  // collection that predates the schema declaration still gets them; must stay
  // in sync with models/Container.js and ensureContainerIndexes() below.
  const containers = mongoose.connection.collection('containers');
  await containers.createIndex(
    { databaseId: 1, boxId: 1 },
    {
      unique: true,
      collation: { locale: 'en', strength: 2 },
      // ($gt instead of $ne — MongoDB partial filters don't support $ne)
      partialFilterExpression: {
        $and: [{ kind: 'box' }, { boxId: { $type: 'string' } }, { boxId: { $gt: '' } }]
      }
    }
  );
  await containers.createIndex({ databaseId: 1, parentId: 1 });

  const tags = mongoose.connection.collection('tags');
  try {
    const tagIndexes = await tags.indexes();
    if (tagIndexes.some(idx => idx.name === 'name_1')) {
      console.log('[Migration] Swapping tags.name index to per-database compound index...');
      await tags.dropIndex('name_1');
    }
  } catch (err) {
    if (!/not found|NamespaceNotFound/i.test(err.message)) throw err;
  }
  await tags.createIndex({ databaseId: 1, name: 1 }, { unique: true });

  console.log('[Migration] Multi-database migration complete');
}

// One-time migration for manual database ordering. Assigns a dense `order`
// value (starting after any existing explicit values) to databases that predate
// the field, in their current createdAt-based list order so the displayed order
// is unchanged on upgrade. Idempotent: documents created with this code always
// carry an explicit order value, so later startups find nothing to do.
async function migrateDatabaseOrder() {
  const Database = require('./models/Database');

  const missing = await Database.find({ order: { $exists: false } }).sort({ createdAt: 1 });
  if (missing.length === 0) return;

  // Start after the highest existing explicit order so assigned values never
  // collide with databases that already have one.
  const top = await Database.aggregate([
    { $match: { order: { $exists: true } } },
    { $group: { _id: null, maxOrder: { $max: '$order' } } }
  ]);
  let next = (top[0]?.maxOrder ?? -1) + 1;

  for (const db of missing) {
    db.order = next++;
    await db.save();
  }
  console.log(`[Migration] Assigned order values to ${missing.length} database(s)`);
}

async function main() {
  // Connect to database (exits the process on failure)
  await connectDB();

  // Startup migrations — must complete before the server accepts requests.
  // Order matters: the boxId case migration runs while the old global-unique
  // index is still in place; migrateToMultiDatabase then swaps it for the
  // per-database compound index.
  await dropStaleLocationIndex();
  await migrateBoxIdsToUppercase();
  await migrateToMultiDatabase();
  // Runs after the multi-database migration so a freshly created "Default"
  // database (first run) also gets an explicit order value.
  await migrateDatabaseOrder();

  // Sync schema indexes (autoIndex is off; this is explicit and ordered).
  const Box = require('./models/Box');
  const Item = require('./models/Item');
  const Location = require('./models/Location');
  const Tag = require('./models/Tag');
  const Database = require('./models/Database');
  const Container = require('./models/Container');
  const Attribute = require('./models/Attribute');
  const AttributeSet = require('./models/AttributeSet');
  await Promise.all([
    Box.syncIndexes(),
    Item.syncIndexes(),
    Location.syncIndexes(),
    Tag.syncIndexes(),
    Database.syncIndexes(),
    Container.syncIndexes(),
    // Stage 4: attribute dimensions (unique per-database name index).
    Attribute.syncIndexes(),
    // Stage 6: attribute sets (unique per-database name index) + the item's
    // attributeSetId index synced via Item.syncIndexes() above.
    AttributeSet.syncIndexes()
  ]);

  // Final index check: guarantees the case-insensitive unique boxId index is in
  // place even on databases created before it was declared on the schema.
  await ensureCaseInsensitiveBoxIndex();

  // Same guarantee for the Stage 1 container indexes (partial unique boxId +
  // tree-query compound).
  await ensureContainerIndexes();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

const app = express();

// Middleware
app.use(cors());
// 5mb body limit: JSON snapshot imports (POST /api/items/import/json) carry a
// full database — containers + items + tags — which easily exceeds the default
// 100kb for anything but tiny databases. CSV/XLSX uploads go through multer and
// are unaffected by this limit.
app.use(express.json({ limit: '5mb' }));

// Routes — all data routes are scoped to the active logical database, resolved
// from the X-Database-Id header (see middleware/requireDatabase.js).
app.use('/api/items', requireDatabase, require('./routes/items'));
app.use('/api/tags', requireDatabase, require('./routes/tags'));
// Stage 2: unified container API. The old /api/locations and /api/boxes routes
// stay mounted until Stage 7 so the not-yet-updated frontend keeps working.
app.use('/api/containers', requireDatabase, require('./routes/containers'));
// Stage 4: attribute dimensions (per active database).
app.use('/api/attributes', requireDatabase, require('./routes/attributes'));
// Stage 6: attribute sets — type-scoped attribute profiles (per active database).
app.use('/api/attribute-sets', requireDatabase, require('./routes/attributeSets'));
app.use('/api/locations', requireDatabase, require('./routes/locations'));
app.use('/api/boxes', requireDatabase, require('./routes/boxes'));

// Database management routes (not scoped — they manage the databases themselves)
app.use('/api/databases', require('./routes/databases'));

// @route   DELETE /api/data/clear-all
// @desc    Wipe ALL data in the ACTIVE database (items, containers, boxes, locations, tags, and any leftover customfields)
app.delete('/api/data/clear-all', requireDatabase, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    const databaseId = new mongoose.Types.ObjectId(req.databaseId);
    await Promise.all([
      db.collection('items').deleteMany({ databaseId }),
      // Stage 2: containers are the live container store now (old boxes/locations
      // docs stay until Stage 7 but are wiped too so a cleared database is empty).
      db.collection('containers').deleteMany({ databaseId }),
      db.collection('boxes').deleteMany({ databaseId }),
      db.collection('locations').deleteMany({ databaseId }),
      db.collection('tags').deleteMany({ databaseId }),
      // Leftover collection from the removed custom-column feature (global)
      db.collection('customfields').deleteMany({})
    ]);
    res.status(200).json({ success: true, message: 'All data cleared', data: {} });
  } catch (error) {
    console.error('[CLEAR ALL] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// --- Production static file serving --------------------------------------
// In production mode the backend serves the pre-built React frontend from
// frontend/dist/ so the whole app runs as a single process. JUNK_TRACKER_ROOT
// is set by the start scripts to the project root; it defaults to one level
// above this directory (backend/..), which matches both dev checkouts and
// release packages. In development, Vite serves the frontend on :3000 with an
// /api proxy, so no static serving happens here.
if (process.env.NODE_ENV === 'production') {
  const appRoot = process.env.JUNK_TRACKER_ROOT || path.join(__dirname, '..');
  const distDir = path.join(appRoot, 'frontend', 'dist');

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error(`[Startup] Production mode: frontend build not found at ${distDir}`);
    console.error('[Startup] Build it first with scripts/build.cmd (or "npm run build" in frontend/).');
    process.exit(1);
  }

  app.use(express.static(distDir));

  // SPA fallback: any non-API GET request that did not match a static file
  // returns index.html so client-side routing works on refresh/deep links.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  console.log(`[Startup] Serving production frontend from ${distDir}`);
} else {
  // Basic route (dev only — in production "/" serves the React app)
  app.get('/', (req, res) => {
    res.json({ message: 'Junk Tracker API' });
  });
}

const PORT = process.env.PORT || 5000;

main().catch((err) => {
  console.error('[Startup] Fatal error during startup:', err.message);
  process.exit(1);
});