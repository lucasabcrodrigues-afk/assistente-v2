// update/reports/stock.js
// Stock report functions.  Provides summaries of current stock
// levels and low‑stock items as well as a log of stock movements.

import { get as getDB } from '../storage/db_core.js';
import { parseDateAny, inPeriod } from '../utils/date.js';

/**
 * Summarise stock levels and low stock warnings.  Returns the
 * total number of items and an array of items whose quantity is
 * below or equal to the configured minimum.  Low stock entries
 * include code, name, current quantity and minimum quantity.
 *
 * @param {Object} period Period filter (unused but included for consistency)
 * @param {Object} opts Options
 * @param {boolean} [opts.lowStockOnly=false] Whether to include only low stock in output
 * @returns {Object} Summary of stock
 */
export function summary(period, { lowStockOnly = false } = {}) {
  const db = getDB();
  const est = Array.isArray(db.estoque) ? db.estoque : [];
  const low = est.filter(p => {
    const qtd = Number(p?.qtd) || 0;
    const min = Number(p?.min) || 0;
    return min > 0 && qtd <= min;
  }).map(p => ({
    cod: String(p.cod),
    nome: String(p.nome || ''),
    qtd: Number(p.qtd) || 0,
    min: Number(p.min) || 0,
  }));
  return {
    totalItens: est.length,
    baixoEstoque: low,
    baixoEstoqueCount: low.length,
  };
}

/**
 * List stock movement rows filtered by period.  Each row contains
 * id, timestamp, movement type, product code, quantity delta and
 * reason.  Movements outside the period are excluded.
 *
 * @param {Object} period Period filter with startIso/endIso
 * @returns {Array<Object>} Movement rows
 */
export function movementsRows(period) {
  const db = getDB();
  const mvs = Array.isArray(db.stockMovements) ? db.stockMovements : [];
  const out = [];
  for (const m of mvs) {
    if (!m) continue;
    const d = m.atIso ? new Date(m.atIso) : parseDateAny(m);
    if (!inPeriod(d, period)) continue;
    out.push({
      id: String(m.id),
      atIso: d ? d.toISOString() : '',
      type: String(m.type || ''),
      productCod: String(m.productCod || ''),
      qtyDelta: Number(m.qtyDelta) || 0,
      reason: String(m.reason || ''),
    });
  }
  return out;
}

export default { summary, movementsRows };

/**
 * Initialise the stock report module.  Included for API
 * compatibility with the installer.  Performs no action.
 *
 * @param {Object} opts Options (unused)
 * @returns {Object} Result
 */
export function init(opts = {}) {
  return { ok: true };
}