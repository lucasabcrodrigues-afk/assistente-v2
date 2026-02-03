// update/reports/sales.js
// Sales report functions.  This module computes per‑sale rows and
// aggregates such as total revenue and average ticket size.  It
// operates on the current database via the storage module and
// reuses shared utils for date and money conversions.

import { get as getDB } from '../storage/db_core.js';
import { parseDateAny, inPeriod } from '../utils/date.js';
import { moneyToCentsBR, moneyBR } from '../utils/money.js';

// Infer total centavos from a sale object which may contain
// various representations of price.  This mirrors the logic from
// the legacy reports module.
function inferTotalC(sale) {
  if (typeof sale?.total_c !== 'undefined') return Number(sale.total_c) || 0;
  if (typeof sale?.totalCentavos !== 'undefined') return Number(sale.totalCentavos) || 0;
  if (typeof sale?.total !== 'undefined') {
    const n = Number(sale.total);
    if (!Number.isFinite(n)) return 0;
    // If it's an integer > 999 assume it is already cents
    if (Number.isInteger(n) && Math.abs(n) > 999) return Math.trunc(n);
    return Math.round(n * 100);
  }
  return 0;
}

// Compute the date associated with a sale for filtering.
function saleDate(sale) {
  const d = sale?.dataIso ? new Date(sale.dataIso) : parseDateAny(sale);
  return d && !isNaN(d.getTime()) ? d : null;
}

/**
 * Build a list of sales rows within a period, optionally filtering
 * by status, payment method or product code.  Each row contains
 * normalised fields for ease of CSV export or UI rendering.
 *
 * @param {Object} period Period filter with startIso/endIso
 * @param {Object} opts Additional filters
 * @param {boolean} [opts.includeCanceled=true] Include canceled sales
 * @param {string|null} [opts.payMethod=null] Payment method to filter
 * @param {string|null} [opts.productCod=null] Product code to filter
 * @returns {Array<Object>} Array of report rows
 */
export function rows(period, { includeCanceled = true, payMethod = null, productCod = null } = {}) {
  const db = getDB();
  const vendas = Array.isArray(db.vendas) ? db.vendas : [];
  const out = [];
  for (const v of vendas) {
    if (!v || typeof v !== 'object') continue;
    const d = saleDate(v);
    if (!inPeriod(d, period)) continue;
    const status = String(v.status || '').toLowerCase();
    if (!includeCanceled && status === 'cancelada') continue;
    const metodo = v?.pagamento?.metodo ? String(v.pagamento.metodo) : '';
    if (payMethod && metodo !== payMethod) continue;
    if (productCod) {
      const itens = Array.isArray(v.itens) ? v.itens : [];
      const has = itens.some(i => String(i.cod || '') === String(productCod));
      if (!has) continue;
    }
    const total_c = inferTotalC(v);
    const desconto_c = Number(v.desconto_c) || 0;
    out.push({
      id: String(v.id),
      dataIso: d ? d.toISOString() : '',
      status: String(v.status || ''),
      pagamento: metodo,
      total_c,
      desconto_c,
    });
  }
  return out;
}

/**
 * Summarise sales over a period.  Returns count, total value and
 * average ticket in both centavos and formatted BRL strings.
 *
 * @param {Object} period Period filter with startIso/endIso
 * @param {Object} [opts={}] Additional filter options as per rows()
 * @returns {Object} Summary object
 */
export function summary(period, opts = {}) {
  const rs = rows(period, opts);
  const total_c = rs.reduce((s, r) => s + (Number(r.total_c) || 0), 0);
  const count = rs.length;
  const ticket_c = count ? Math.round(total_c / count) : 0;
  return {
    count,
    total_c,
    total_fmt: moneyBR(total_c),
    ticketMedio_c: ticket_c,
    ticketMedio_fmt: moneyBR(ticket_c),
  };
}

/**
 * Initialise the sales report module.  This function is provided
 * for compatibility with the install routine.  It performs no
 * actions but returns an object indicating success.
 *
 * @param {Object} opts Options (unused)
 * @returns {Object} Result
 */
export function init(opts = {}) {
  return { ok: true };
}

export default { rows, summary };