// update/services/ops_stock_events.js
// Implements stock movement operations.  Supports adding entries to
// the stockMovements array and applying the corresponding quantity
// delta to the referenced product.  This module deliberately does
// not expose any UI and can be invoked directly from event handlers
// in your application.

import * as dbCore from '../storage/db_core.js';
import { asInt } from '../storage/validate.js';
import { generateId } from '../utils/ids.js';
import { nowIso } from '../utils/date.js';

// Ensure collections needed by operations exist on the database.
function ensureCollections(db) {
  db.estoque = Array.isArray(db.estoque) ? db.estoque : [];
  db.stockMovements = Array.isArray(db.stockMovements) ? db.stockMovements : [];
  db.saleVoids = Array.isArray(db.saleVoids) ? db.saleVoids : [];
  db.cashSessions = Array.isArray(db.cashSessions) ? db.cashSessions : [];
  return db;
}

function findProduct(db, productCod) {
  const code = String(productCod || '').trim();
  return db.estoque.find((p) => p && String(p.cod || '').trim() === code) || null;
}

function applyDeltaToProduct(prod, qtyDelta) {
  prod.qtd = asInt(prod.qtd, 0) + asInt(qtyDelta, 0);
  if (prod.qtd < 0) prod.qtd = 0;
}

/**
 * Initialise the stock module.  The stock module reads the storage
 * key from the central configuration via dbCore and therefore does
 * not need any configuration itself.  A no‑op function is exposed
 * for API symmetry.
 */
export function init(/*opts*/) {
  return { ok: true };
}

/**
 * Add a stock movement and apply the quantity delta to the
 * corresponding product.  The `type` determines the sign of the
 * movement when `qtyDelta` is omitted.  A movement record is
 * appended to the `stockMovements` array and the updated DB is
 * persisted via dbCore.safeSave().
 *
 * @param {Object} args Movement parameters
 * @param {string} args.type One of entrada, saida, ajuste, perda, devolucao
 * @param {string} args.productCod Product code
 * @param {number} [args.qty] Quantity (alias for qtyDelta)
 * @param {number} [args.qtyDelta] Explicit delta
 * @param {string} [args.reason] Human readable reason
 * @param {Object} [args.meta] Additional metadata
 * @returns {Object} Result
 */
export function addMovement({ type, productCod, qty, qtyDelta, reason, meta } = {}) {
  const db = ensureCollections(dbCore.get());
  const prod = findProduct(db, productCod);
  if (!prod) return { ok: false, error: 'Produto não encontrado pelo código.' };
  let delta = 0;
  if (typeof qtyDelta !== 'undefined') delta = asInt(qtyDelta, 0);
  else delta = asInt(qty, 0);
  const t = String(type || 'ajuste');
  // enforce sign based on type
  if (['saida', 'perda'].includes(t) && delta > 0) delta = -delta;
  if (['entrada', 'devolucao'].includes(t) && delta < 0) delta = -delta;
  const user = (window?.CoreUsers && window.CoreUsers.auth && typeof window.CoreUsers.auth.currentUser === 'function')
    ? window.CoreUsers.auth.currentUser()
    : null;
  const mv = {
    id: generateId('sm'),
    atIso: nowIso(),
    type: t,
    productCod: String(productCod || '').trim(),
    qtyDelta: delta,
    reason: reason || '',
    user: user ? { id: user.id, username: user.username, role: user.role } : null,
    meta: meta || null,
  };
  applyDeltaToProduct(prod, delta);
  db.stockMovements.push(mv);
  dbCore.safeSave(db);
  // audit via CoreUsers if available
  try {
    if (window?.CoreUsers && window.CoreUsers.audit && typeof window.CoreUsers.audit.log === 'function') {
      window.CoreUsers.audit.log({ action: 'estoque.movimento', entity: 'produto', entityId: mv.productCod, before: null, after: { qtyDelta: delta, type: t }, meta: { reason } });
    }
  } catch (e) {
    // ignore audit errors
  }
  return { ok: true, movementId: mv.id, newQty: prod.qtd };
}

/**
 * List recent stock movements.  Optionally filter by product code
 * and limit the number of returned entries.  Movements are sorted
 * chronologically and returned from oldest to newest.
 *
 * @param {Object} args Options
 * @param {string} [args.productCod] Filter by product code
 * @param {number} [args.limit] Maximum number of entries to return
 * @returns {Array} Array of movement objects
 */
export function listMovements({ productCod = null, limit = 200 } = {}) {
  const db = ensureCollections(dbCore.get());
  let a = db.stockMovements.slice();
  if (productCod) {
    a = a.filter((m) => String(m.productCod || '') === String(productCod));
  }
  const slice = a.slice(Math.max(0, a.length - limit));
  return slice;
}

export default {
  init,
  addMovement,
  listMovements,
};