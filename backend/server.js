const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Connect to database
connectDB();

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
dropStaleLocationIndex();

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});