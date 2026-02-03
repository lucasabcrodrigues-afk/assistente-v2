// update/reports/debtors.js
// Debtors report.  Lists debtors and their outstanding balances and
// summarises total debt across all customers.  Debtors do not
// currently include a date filter as legacy behaviour exported all.

import { get as getDB } from '../storage/db_core.js';
import { moneyBR } from '../utils/money.js';

/**
 * Build an array of debtor rows.  Each row contains the debtor's
 * name and centavos totals for total owed, amount paid and
 * outstanding.  Field names may vary in the source database so
 * several aliases are tried.
 *
 * @param {Object} period Unused but kept for API consistency
 * @returns {Array<Object>} Debtor rows
 */
export function rows(period) {
  const db = getDB();
  const ds = Array.isArray(db.devedores) ? db.devedores : [];
  const out = [];
  for (const d of ds) {
    if (!d) continue;
    const total_c = (typeof d.total_c !== 'undefined') ? (Number(d.total_c) || 0)
      : (typeof d.total !== 'undefined') ? (Number(d.total) || 0) : 0;
    const pago_c = (typeof d.pago_c !== 'undefined') ? (Number(d.pago_c) || 0)
      : (typeof d.pago !== 'undefined') ? (Number(d.pago) || 0) : 0;
    let pend_c;
    if (typeof d.pendente_c !== 'undefined') pend_c = Number(d.pendente_c) || Math.max(0, total_c - pago_c);
    else pend_c = Math.max(0, total_c - pago_c);
    out.push({
      nome: String(d.nome || d.cliente || ''),
      total_c,
      pago_c,
      pendente_c: pend_c,
    });
  }
  return out;
}

/**
 * Summarise debtor information.  Returns the number of debtors,
 * total outstanding balance and a formatted currency string.
 *
 * @param {Object} period Unused (debtor report ignores period)
 * @returns {Object} Summary of debts
 */
export function summary(period) {
  const rs = rows(period);
  const pendente_c = rs.reduce((s, r) => s + (Number(r.pendente_c) || 0), 0);
  return {
    count: rs.length,
    pendente_c,
    pendente_fmt: moneyBR(pendente_c),
  };
}

export default { rows, summary };

/**
 * Initialise the debtors report module.  Present for API
 * compatibility.  Does nothing and always succeeds.
 *
 * @param {Object} opts Options (unused)
 * @returns {Object} Result
 */
export function init(opts = {}) {
  return { ok: true };
}