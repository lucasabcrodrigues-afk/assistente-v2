// update/compat/legacy_aliases.js
// Assign legacy global names to the new unified Update namespace.
// Many existing ERP installations expect objects such as CoreDB,
// Ops, Reports, UX, Catalog, Scanner, WhatsApp, PrintReceipt,
// FiscalPrint and IntegracoesNetlify to exist on the global
// `window`.  This file should be loaded after update/index.js in
// environments where backwards compatibility is required.

;(function (global) {
  const Update = global.Update;
  if (!Update) return;

  // CoreDB wrappers
  global.CoreDB = {
    init: Update.db.init,
    get: Update.db.get,
    safeSave: Update.db.safeSave,
    normalize: Update.db.normalize,
    recovery: Update.db.recovery,
    backup: Update.db.backup,
    schema: Update.db.schema,
    validate: Update.db.validate,
  };

  // Ops wrappers (preserve nested API)
  global.Ops = {
    init: (opts) => {
      Update.ops.stock.init(opts);
      Update.ops.inventory.init(opts);
      Update.ops.sales.init?.(opts);
      Update.ops.cash.init?.(opts);
      return { ok: true };
    },
    stock: Update.ops.stock,
    inventory: Update.ops.inventory,
    sales: Update.ops.sales,
    cash: Update.ops.cash,
    _: {},
  };

  // Reports wrappers
  global.Reports = {
    init: (opts) => {
      Update.reports.sales.init(opts);
      Update.reports.stock.init(opts);
      Update.reports.cash.init(opts);
      Update.reports.debtors.init(opts);
      return { ok: true };
    },
    sales: Update.reports.sales,
    stock: Update.reports.stock,
    cash: Update.reports.cash,
    debtors: Update.reports.debtors,
    export: Update.reports.export,
    _: {},
  };

  // UX wrappers
  global.UX = {
    init: (cfg) => {
      Update.ux.mobileMode.init(cfg);
      Update.ux.onboarding.init(cfg);
      return { ok: true };
    },
    mobile: Update.ux.mobileMode,
    onboarding: Update.ux.onboarding,
    nav: {},
    hotkeys: {},
    _cfg: Update.ux.onboarding._cfg || {},
  };

  // Catalog wrappers
  global.Catalog = Update.catalog;

  // Scanner wrappers
  global.Scanner = Update.scanner;

  // WhatsApp wrappers
  global.WhatsApp = Update.whatsapp;

  // PrintReceipt wrappers (delegates to the print module exported in integrations)
  global.PrintReceipt = {
    build: Update.reports.export.buildPrintableReport,
    openPrint: Update.reports.export.openPrintWindow,
  };

  // FiscalPrint wrappers
  global.FiscalPrint = Update.fiscal;

  // IntegracoesNetlify wrappers
  global.IntegracoesNetlify = Update.integrations.netlify;

})(typeof window !== 'undefined' ? window : globalThis);