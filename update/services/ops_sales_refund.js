// update/services/ops_sales_refund.js
// Implements cancellation and refund of sales.  When a sale is
// cancelled it is flagged in the sales collection, stock is
// replenished via stock movements and a record is stored in
// saleVoids.  Optionally a cash adjustment is recorded via the
// cashier module.

import * as dbCore from '../storage/db_core.js';
import { asInt } from '../storage/validate.js';
import { generateId } from '../utils/ids.js';
import { nowIso } from '../utils/date.js';
import * as stockOps from './ops_stock_events.js';
import * as cashOps from './ops_cashier.js';

function ensureCollections(db) {
  db.vendas = Array.isArray(db.vendas) ? db.vendas : [];
  db.saleVoids = Array.isArray(db.saleVoids) ? db.saleVoids : [];
  return db;
}

function findSale(db, saleId) {
  const id = String(saleId || '').trim();
  return db.vendas.find((v) => v && String(v.id || '').trim() === id) || null;
}

/**
 * Initialise the sales refund module.  Present for API symmetry.
 */
export function init(/*opts*/) {
  return { ok: true };
}

/**
 * Cancel (void) a sale.  Flags the sale as cancelled, creates a
 * corresponding entry in saleVoids and, if restock is true,
 * replenishes stock for each item in the sale.  Also records an
 * estorno movement in the cash register.  Returns an error if the
 * sale does not exist or has already been cancelled.
 *
 * @param {Object} args Parameters
 * @param {string} args.saleId Identifier of the sale to cancel
 * @param {string} [args.reason] Reason for cancellation
 * @param {boolean} [args.restock] Whether to replenish stock
 * @returns {Object} Result
 */
export function cancelSale({ saleId, reason = 'Cancelado', restock = true } = {}) {
  const db = ensureCollections(dbCore.get());
  const sale = findSale(db, saleId);
  if (!sale) return { ok: false, error: 'Venda não encontrada.' };
  // prevent double cancel
  const already = db.saleVoids.find((x) => x && x.saleId === saleId);
  if (already) return { ok: false, error: 'Venda já cancelada anteriormente.' };
  const user = (window?.CoreUsers && window.CoreUsers.auth && typeof window.CoreUsers.auth.currentUser === 'function')
    ? window.CoreUsers.auth.currentUser()
    : null;
  const voidId = generateId('void');
  const createdMovs = [];
  if (restock) {
    const itens = Array.isArray(sale.itens) ? sale.itens : [];
    for (const it of itens) {
      const code = String(it.cod || '').trim();
      const qty = Number(it.qtd) || 0;
      if (!code || qty <= 0) continue;
      const r = stockOps.addMovement({
        type: 'devolucao',
        productCod: code,
        qtyDelta: Math.trunc(qty),
        reason: `Estorno venda ${saleId}: ${reason}`,
        meta: { saleId, voidId },
      });
      if (r.ok) createdMovs.push(r.movementId);
    }
  }
  const entry = {
    id: voidId,
    atIso: nowIso(),
    saleId: String(saleId),
    reason: reason || '',
    createdBy: user ? { id: user.id, username: user.username, role: user.role } : null,
    stockMovementsCreated: createdMovs,
  };
  db.saleVoids.push(entry);
  sale.status = 'cancelada';
  sale.cancelReason = reason || '';
  sale.canceledAtIso = nowIso();
  sale.canceledBy = entry.createdBy;
  // record estorno in cash register
  try {
    const total_c = asInt(sale.total_c, 0);
    cashOps.addVoid({ saleId, amount_c: -Math.abs(total_c), reason });
  } catch (e) {
    // ignore
  }
  dbCore.safeSave(db);
  // audit
  try {
    if (window?.CoreUsers && window.CoreUsers.audit && typeof window.CoreUsers.audit.log === 'function') {
      window.CoreUsers.audit.log({ action: 'vendas.cancelar', entity: 'venda', entityId: saleId, before: null, after: { status: 'cancelada' }, meta: { reason } });
    }
  } catch (e) {
    // ignore
  }
  return { ok: true, voidId, stockMovements: createdMovs };
}

export default {
  init,
  cancelSale,
};