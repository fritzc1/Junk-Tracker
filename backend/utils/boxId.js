/**
 * Box ID normalization — single source of truth for box identifier casing.
 *
 * Policy: box IDs are physical labels, so identity is case-insensitive and the
 * stored form is always UPPERCASE. Every write path (create, update, import)
 * must pass user-supplied values through normalizeBoxId before persisting or
 * comparing against existing boxes. Search paths need no change — they already
 * fold to lowercase for matching.
 */

/**
 * Trim and uppercase a raw box ID value.
 * @param {*} value - any input (string, number, null, undefined)
 * @returns {string} normalized box ID ('' when the input is empty/whitespace-only)
 */
const normalizeBoxId = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
};

module.exports = { normalizeBoxId };
