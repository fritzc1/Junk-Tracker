const mongoose = require('mongoose');
const Database = require('../models/Database');

/**
 * Resolve the active logical database for a request and attach it as
 * req.databaseId (string). The client sends its selection via the
 * X-Database-Id header.
 *
 * Fallback behavior: when the header is missing, malformed, or points at a
 * deleted database, we fall back to the oldest database instead of failing —
 * this keeps stale localStorage selections from breaking the UI; the frontend
 * corrects its selection as soon as it loads the database list. A 400 is only
 * returned when no databases exist at all (should not happen: startup ensures
 * a Default database exists and deletion of the last one is blocked).
 */
const requireDatabase = async (req, res, next) => {
  try {
    const raw = req.headers['x-database-id'] || req.query.databaseId;

    if (raw && mongoose.isValidObjectId(raw)) {
      const db = await Database.findById(raw);
      if (db) {
        req.databaseId = String(db._id);
        return next();
      }
      console.warn(`[Database] Unknown database id "${raw}" — falling back to oldest`);
    } else if (raw) {
      console.warn(`[Database] Malformed X-Database-Id "${raw}" — falling back to oldest`);
    }

    const fallback = await Database.findOne().sort({ createdAt: 1, _id: 1 });
    if (!fallback) {
      return res.status(400).json({
        success: false,
        error: 'No databases available. Create one on the Databases page.'
      });
    }

    req.databaseId = String(fallback._id);
    next();
  } catch (err) {
    console.error('[Database] Error resolving active database:', err.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

module.exports = requireDatabase;
