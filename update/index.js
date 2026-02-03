// update/index.js
// Entry point for the consolidated update module.  This file
// re-exports all public APIs from submodules under a single object
// (`Update`) and installs itself on `window` if running in a
// browser environment.  Consumers may either import named exports
// or use the global `Update` when loaded via a script tag.

import { install } from './install.js';
import * as dbCore from './storage/db_core.js';
import * as opsStock from './services/ops_stock_events.js';
import * as opsInventory from './services/ops_inventory.js';
import * as opsSales from './services/ops_sales_refund.js';
import * as opsCash from './services/ops_cashier.js';
import * as reportsSales from './reports/sales.js';
import * as reportsStock from './reports/stock.js';
import * as reportsCash from './reports/cash.js';
import * as reportsDebtors from './reports/debtors.js';
import * as csvExport from './export.js';
import * as fiscal from './fiscal/index.js';
import * as netlify from './integrations/netlify.js';
import * as whatsapp from './whatsapp.js';
import * as scanner from './scanner.js';
import * as catalog from './catalog.js';
import * as onboarding from './ux/onboarding.js';
import * as mobileMode from './ux/mobile_mode.js';
import * as utilsDate from './utils/date.js';
import * as utilsMoney from './utils/money.js';
import * as utilsIds from './utils/ids.js';
import * as utilsLog from './utils/log.js';
import * as mergeUtil from './utils/merge.js';
// +++ Server Sync (Netlify) integration
import { createServerSync } from './integrations/server_sync.js';

/**
 * Consolidated API exposed by the update module.  The object
 * properties group related functionality: db (storage), ops
 * (operations), reports, fiscal, integrations, UX, utilities and
 * merge.  Each group exposes the functions imported from the
 * underlying modules without modification.
 */
const Update = {
  install,
  db: dbCore,
  ops: {
    stock: opsStock,
    inventory: opsInventory,
    sales: opsSales,
    cash: opsCash,
  },
  reports: {
    sales: reportsSales,
    stock: reportsStock,
    cash: reportsCash,
    debtors: reportsDebtors,
    export: csvExport,
  },
  fiscal: fiscal,
  integrations: {
    netlify,
  },
  whatsapp,
  scanner,
  catalog,
  ux: {
    onboarding,
    mobileMode,
  },
  utils: {
    date: utilsDate,
    money: utilsMoney,
    ids: utilsIds,
    log: utilsLog,
  },
  merge: {
    mergeDB: mergeUtil.mergeDB,
    readCurrentDB: mergeUtil.readCurrentDB,
    writeCurrentDB: mergeUtil.writeCurrentDB,
    safeJSONParse: mergeUtil.safeJSONParse,
  },
};

// Automatically install onto the global scope when running in the
// browser so that scripts loaded via <script> tags can access the
// module without bundler support.  This pattern mirrors the way
// existing modules attach themselves to the `window` object.
if (typeof window !== 'undefined') {
  window.Update = Update;
}
// Initialize Server Sync integration once Update is constructed.
try {
  const serverSync = createServerSync(Update);
  if (serverSync && typeof serverSync.installIntoUpdate === 'function') {
    serverSync.installIntoUpdate();
  } else {
    Update.integrations = Update.integrations || {};
    Update.integrations.serverSync = serverSync;
  }
} catch (e) {
  (Update?.utils?.log || console).warn?.('Falha ao inicializar ServerSync:', e);
}

export { Update };
export default Update;