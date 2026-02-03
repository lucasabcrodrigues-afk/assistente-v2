// update/fiscal/index.js
// Entry point for fiscal operations.  Provides handlers for
// emitting fiscal documents upon sale completion and retrying
// emission from the offline queue.  Utilises providers and
// settings defined in sibling modules and integrates with the
// printing subsystem.

import { getFiscalPrintSettings } from './settings.js';
import { normalizeSale } from './adapter.js';
import { ensureFiscalQueue, enqueueFiscal } from './queue.js';
import { SimulatedProvider, ApiProvider } from './providers.js';
import { printReceipt } from '../print/printEngine.js';

/**
 * Safely print a receipt for a sale.  If printing fails the
 * exception is swallowed so that the primary flow of the fiscal
 * process is not disrupted.  Company information is taken from
 * `db.empresa` if available.
 *
 * @param {Object} sale Normalised sale
 * @param {Object} settings Fiscal settings
 * @param {Object} db Database
 */
async function safePrint(sale, settings, db) {
  try {
    const company = db.empresa || { nome: 'Sua Empresa' };
    await printReceipt(sale, settings, company);
  } catch (e) {
    console.warn('Falha ao imprimir:', e);
  }
}

/**
 * Handler for when a sale is completed.  This function determines
 * whether to emit a fiscal document, queue it offline or simply
 * print a non‑fiscal receipt based on user settings and network
 * conditions.  It receives hooks with references to the database
 * and persistence functions so it can update state.
 */
async function onSaleCompleted(rawSale, hooks) {
  const { db, save, render } = hooks;
  const settings = getFiscalPrintSettings(db);
  const sale = normalizeSale(rawSale);
  // Always ensure the queue exists
  ensureFiscalQueue(db);
  // If fiscal emission disabled: optionally auto print and exit
  if (!settings.enabled) {
    if (settings.autoPrint) {
      await safePrint(sale, settings, db);
    }
    return;
  }
  // Allowlist of domains
  if (Array.isArray(settings.allowedDomains) && settings.allowedDomains.length) {
    const host = location.host;
    if (!settings.allowedDomains.includes(host)) {
      enqueueFiscal(db, {
        saleId: sale.id,
        status: 'offline_queue',
        reason: `Dominio não permitido: ${host}`,
        createdAt: new Date().toISOString(),
      });
      save();
      if (typeof render === 'function') render(true);
      return;
    }
  }
  // Choose provider
  let provider = new SimulatedProvider();
  if (settings.provider === 'api') {
    provider = new ApiProvider(settings.apiBaseUrl);
  }
  // Offline handling
  if (settings.offlineQueueEnabled && !navigator.onLine) {
    enqueueFiscal(db, {
      saleId: sale.id,
      status: 'offline_queue',
      reason: 'Sem internet',
      createdAt: new Date().toISOString(),
      saleSnapshot: sale,
    });
    save();
    if (typeof render === 'function') render(true);
    return;
  }
  // Emit document
  let result;
  try {
    result = await provider.emit(sale, { db });
  } catch (e) {
    result = { status: 'error', message: String(e?.message || e) };
  }
  // Push result into queue
  const item = {
    saleId: sale.id,
    key: result.key || null,
    status: result.status || 'error',
    message: result.message || '',
    createdAt: new Date().toISOString(),
    saleSnapshot: sale,
    provider: settings.provider,
    payload: result.payload || null,
    danfeUrl: result.danfeUrl || null,
  };
  enqueueFiscal(db, item);
  save();
  if (typeof render === 'function') render(true);
  // Auto print if configured and status indicates success
  if (settings.autoPrint) {
    await safePrint(sale, settings, db);
  }
}

/**
 * Retry emission of documents in the offline queue.  Iterates over
 * queued items and attempts to re‑emit them using the current
 * provider.  Stops retrying if offline.  Returns the number of
 * successfully re‑emitted documents.
 *
 * @param {Object} db Database
 * @param {Function} save Persist function
 * @param {Function} render Optional render callback
 */
async function retryQueue(db, save, render) {
  const settings = getFiscalPrintSettings(db);
  if (!settings.enabled) return { ok: false, message: 'Fiscal desativado' };
  let provider = new SimulatedProvider();
  if (settings.provider === 'api') provider = new ApiProvider(settings.apiBaseUrl);
  const q = db.fiscalQueue || [];
  let okCount = 0;
  for (const it of [...q]) {
    if (!it.saleSnapshot) continue;
    if (it.status === 'authorized' || it.status === 'simulated') continue;
    if (settings.offlineQueueEnabled && !navigator.onLine) break;
    try {
      const res = await provider.emit(it.saleSnapshot, { db });
      it.status = res.status || it.status;
      it.key = res.key || it.key;
      it.message = res.message || it.message;
      it.danfeUrl = res.danfeUrl || it.danfeUrl;
      okCount++;
    } catch (e) {
      it.status = 'error';
      it.message = String(e?.message || e);
    }
  }
  save();
  if (typeof render === 'function') render(true);
  return { ok: true, okCount };
}

export const FiscalPrint = { onSaleCompleted, retryQueue };
export default FiscalPrint;