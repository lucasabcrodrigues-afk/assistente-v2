// update/fiscal/queue.js
// Offline queue for fiscal document emission.  When the fiscal
// provider cannot be reached or emission must be deferred, items
// are stored in a queue on the database.  Utility functions are
// provided to manipulate the queue.

/**
 * Ensure the fiscal queue exists on the database and return it.
 *
 * @param {Object} db Database
 * @returns {Array<Object>} Fiscal queue array
 */
export function ensureFiscalQueue(db) {
  db.fiscalQueue = db.fiscalQueue || [];
  return db.fiscalQueue;
}

/**
 * Append an item to the fiscal queue.
 *
 * @param {Object} db Database
 * @param {Object} item Queue entry
 */
export function enqueueFiscal(db, item) {
  const q = ensureFiscalQueue(db);
  q.push(item);
}

/**
 * Remove an item from the queue by key or sale id.
 *
 * @param {Object} db Database
 * @param {string} keyOrId Document key or sale id
 */
export function removeFromQueue(db, keyOrId) {
  const q = ensureFiscalQueue(db);
  const idx = q.findIndex(x => x.key === keyOrId || x.saleId === keyOrId);
  if (idx >= 0) q.splice(idx, 1);
}

/**
 * Summarise queue state: total items, pending count and last
 * inserted item.
 *
 * @param {Object} db Database
 * @returns {Object} Summary
 */
export function queueSummary(db) {
  const q = ensureFiscalQueue(db);
  const pending = q.filter(x => x.status === 'pending' || x.status === 'offline_queue' || x.status === 'error');
  return {
    total: q.length,
    pending: pending.length,
    last: q[q.length - 1] || null,
  };
}