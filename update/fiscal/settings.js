// update/fiscal/settings.js
// Preferences for fiscal emission and receipt printing.  These
// functions manage configuration stored inside the database so that
// end users can customise their fiscal and print behaviour.

/**
 * Return the default fiscal and print settings.  Call this when
 * initialising a new database or resetting preferences.  See the
 * documentation for descriptions of each field.
 *
 * @returns {Object} Default settings object
 */
export function defaultFiscalPrintSettings() {
  return {
    enabled: false,              // Emitir nota ao concluir venda
    provider: 'simulated',       // 'simulated' | 'api'
    apiBaseUrl: '',              // ex: https://seu-backend.com
    autoPrint: false,            // Imprimir automaticamente ao concluir venda
    printModel: '58mm',          // '58mm' | '80mm' | 'A4'
    printDanfeWhenAuthorized: false,
    offlineQueueEnabled: true,
    allowedDomains: [],          // opcional: allowlist
    lastSeenAt: null,            // para controles extras
  };
}

/**
 * Retrieve the fiscal print settings from the database, creating a
 * default if none exist.  Settings are stored under
 * `db.settings.fiscalPrint`.
 *
 * @param {Object} db Database
 * @returns {Object} Fiscal settings
 */
export function getFiscalPrintSettings(db) {
  db.settings = db.settings || {};
  db.settings.fiscalPrint = db.settings.fiscalPrint || defaultFiscalPrintSettings();
  return db.settings.fiscalPrint;
}