const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { normalizeBoxId } = require('./utils/boxId');

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

// Swap the sparse unique index on boxes.boxId to a case-insensitive collation.
// Defense-in-depth: even if a future write path bypasses normalizeBoxId, the
// index rejects "a06" when "A06" exists instead of silently creating a twin.
async function ensureCaseInsensitiveBoxIndex() {
  const collection = mongoose.connection.collection('boxes');
  try {
    const indexes = await collection.indexes();
    const existing = indexes.find(idx => idx.name === 'boxId_1');
    if (existing && !existing.options?.collation) {
      console.log('[Startup] Swapping boxes.boxId index to case-insensitive collation...');
      await collection.dropIndex('boxId_1');
    }
  } catch (err) {
    // Ignore "ns not found" — collection may not exist yet
    if (!err.message?.includes('not found') && !err.message?.includes('NamespaceNotFound')) {
      console.warn('[Startup] Could not inspect boxes indexes:', err.message);
    }
  }
  await collection.createIndex(
    { boxId: 1 },
    { sparse: true, unique: true, collation: { locale: 'en', strength: 2 } }
  );
}

async function main() {
  // Connect to database (exits the process on failure)
  await connectDB();

  // Startup migrations — must complete before the server accepts requests.
  await dropStaleLocationIndex();
  await migrateBoxIdsToUppercase();

  // Sync schema indexes (autoIndex is off; this is explicit and ordered).
  const Box = require('./models/Box');
  const Item = require('./models/Item');
  const Location = require('./models/Location');
  const Tag = require('./models/Tag');
  await Promise.all([
    Box.syncIndexes(),
    Item.syncIndexes(),
    Location.syncIndexes(),
    Tag.syncIndexes()
  ]);

  // Final index check: guarantees the case-insensitive unique boxId index is in
  // place even on databases created before it was declared on the schema.
  await ensureCaseInsensitiveBoxIndex();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/items', require('./routes/items'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/boxes', require('./routes/boxes'));

// @route   DELETE /api/data/clear-all
// @desc    Wipe ALL data (items, boxes, locations, tags, and any leftover customfields)
app.delete('/api/data/clear-all', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    await Promise.all([
      db.collection('items').deleteMany({}),
      db.collection('boxes').deleteMany({}),
      db.collection('locations').deleteMany({}),
      db.collection('tags').deleteMany({}),
      // Leftover collection from the removed custom-column feature
      db.collection('customfields').deleteMany({})
    ]);
    res.status(200).json({ success: true, message: 'All data cleared', data: {} });
  } catch (error) {
    console.error('[CLEAR ALL] Error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Junk Tracker API' });
});

const PORT = process.env.PORT || 5000;

main().catch((err) => {
  console.error('[Startup] Fatal error during startup:', err.message);
  process.exit(1);
});