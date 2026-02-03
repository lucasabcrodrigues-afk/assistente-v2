// update/services/ops_inventory.js
// Implements inventory counting and adjustment logic.  The module
// maintains an in‑memory state during an active inventory session and
// applies stock movements to reconcile differences between counted
// quantities and system quantities.

import * as dbCore from '../storage/db_core.js';
import { asInt } from '../storage/validate.js';
import { generateId } from '../utils/ids.js';
import { nowIso } from '../utils/date.js';
import * as stockOps from './ops_stock_events.js';

// internal inventory state
const state = {
  active: false,
  id: null,
  startedAtIso: null,
  items: [], // { productCod, systemQty, countedQty }
};

function ensureCollections(db) {
  db.estoque = Array.isArray(db.estoque) ? db.estoque : [];
  return db;
}

/**
 * Initialise the inventory module.  The inventory module requires no
 * configuration; this function exists for API symmetry.
 */
export function init(/*opts*/) {
  return { ok: true };
}

/**
 * Start a new inventory count.  If a list of product codes is
 * provided only those items will be included.  Otherwise the entire
 * stock is counted.  A unique inventory ID is generated and the
 * state is reset.
 *
 * @param {Object} args Options
 * @param {Array<string>} [args.productCods] Optional subset of codes
 * @returns {Object} Result
 */
export function start({ productCods = null } = {}) {
  const db = ensureCollections(dbCore.get());
  const list = Array.isArray(productCods) && productCods.length
    ? db.estoque.filter((p) => productCods.includes(String(p.cod)))
    : db.estoque.slice();
  state.active = true;
  state.id = generateId('inv');
  state.startedAtIso = nowIso();
  state.items = list.map((p) => ({
    productCod: String(p.cod || '').trim(),
    systemQty: asInt(p.qtd, 0),
    countedQty: null,
  }));
  return { ok: true, inventoryId: state.id, count: state.items.length };
}

/**
 * Record a counted quantity for a given product within the active
 * inventory.  Returns an error if the inventory has not been started
 * or the product is not part of the session.
 *
 * @param {string} productCod Product code
 * @param {number} countedQty Quantity counted
 * @returns {Object} Result
 */
export function setCount(productCod, countedQty) {
  if (!state.active) return { ok: false, error: 'Inventário não iniciado.' };
  const code = String(productCod || '').trim();
  const it = state.items.find((x) => x.productCod === code);
  if (!it) return { ok: false, error: 'Produto não está no inventário.' };
  it.countedQty = asInt(countedQty, 0);
  return { ok: true };
}

/**
 * Compute the list of differences between counted quantities and
 * system quantities.  Only items for which a counted quantity has
 * been recorded are considered.  The returned array contains
 * objects with diff = countedQty - systemQty.
 *
 * @returns {Object} Result with a diffs array
 */
export function computeDiffs() {
  if (!state.active) return { ok: false, error: 'Inventário não iniciado.' };
  const diffs = state.items
    .filter((x) => x.countedQty !== null)
    .map((x) => ({ ...x, diff: asInt(x.countedQty, 0) - asInt(x.systemQty, 0) }))
    .filter((x) => x.diff !== 0);
  return { ok: true, diffs };
}

/**
 * Apply adjustments based on the computed differences.  For each
 * difference a stock movement of type 'ajuste' is created and the
 * in‑memory inventory state is cleared.  Metadata about the
 * inventory ID is recorded on each movement.
 *
 * @param {Object} args Options
 * @param {string} [args.reason] Reason for adjustment
 * @param {Object} [args.meta] Additional metadata
 * @returns {Object} Summary of created movements
 */
export function applyAdjustments({ reason = 'Inventário', meta = null } = {}) {
  const dif = computeDiffs();
  if (!dif.ok) return dif;
  const diffs = dif.diffs;
  const created = [];
  diffs.forEach((d) => {
    const r = stockOps.addMovement({
      type: 'ajuste',
      productCod: d.productCod,
      qtyDelta: d.diff,
      reason,
      meta: { inventoryId: state.id, ...meta },
    });
    if (r.ok) created.push(r.movementId);
  });
  const invSummary = { inventoryId: state.id, createdMovements: created, diffsCount: diffs.length };
  // reset state
  state.active = false;
  state.id = null;
  state.startedAtIso = null;
  state.items = [];
  return { ok: true, ...invSummary };
}

/**
 * Expose the internal state for debugging.  Consumers should not
 * modify the returned object.
 *
 * @returns {Object} Copy of state
 */
export function _state() {
  return JSON.parse(JSON.stringify(state));
}

export default {
  init,
  start,
  setCount,
  computeDiffs,
  applyAdjustments,
  _state,
};