// update/install.js
// Provides a single installation routine for the update module.  The
// installer applies configuration (such as the storage key) and
// invokes initialization hooks exposed by individual submodules.

import { setStorageKey } from './config.js';
import * as dbCore from './storage/db_core.js';
import * as opsStock from './services/ops_stock_events.js';
import * as opsInventory from './services/ops_inventory.js';
import * as opsSales from './services/ops_sales_refund.js';
import * as opsCash from './services/ops_cashier.js';
import * as reportsSales from './reports/sales.js';
import * as reportsStock from './reports/stock.js';
import * as reportsCash from './reports/cash.js';
import * as reportsDebtors from './reports/debtors.js';
import * as catalog from './catalog.js';
import * as onboarding from './ux/onboarding.js';
import * as mobileMode from './ux/mobile_mode.js';

/**
 * Install and configure the update module.  This function centralises
 * configuration across all submodules.  When called it updates the
 * storage key and passes the same key into any modules that support
 * customisation.
 *
 * @param {Object} [opts] Installer options
 * @param {string} [opts.storageKey] Custom localStorage key for the DB
 * @param {Object} [opts.mobile] Mobile options forwarded to UX
 * @param {Object} [opts.onboarding] Onboarding options forwarded to UX
 * @returns {Object} Installation result
 */
export function install(opts = {}) {
  const { storageKey, mobile, onboarding: onboardingCfg } = opts;
  // Apply storage key early so subsequent init functions use it.
  if (storageKey) {
    setStorageKey(String(storageKey));
  }

  // Initialise storage/db.  The init call performs migrations,
  // validation and snapshot creation if necessary.  It returns
  // diagnostic information which we ignore here.
  dbCore.init({ storageKey });

  // Initialise Ops modules.  Each accepts the storage key but
  // otherwise has no side effects.
  opsStock.init({ storageKey });
  opsInventory.init({ storageKey });
  opsSales.init?.({ storageKey });
  opsCash.init?.({ storageKey });

  // Initialise report subsystem.  These calls memoise the storage key
  // so subsequent queries read from the correct location.
  reportsSales.init({ storageKey });
  reportsStock.init({ storageKey });
  reportsCash.init({ storageKey });
  reportsDebtors.init({ storageKey });

  // Initialise the offline barcode catalogue.
  catalog.init({ storageKey });

  // Initialise UX modules.  The mobile module accepts partial
  // configuration and merges with defaults.  The onboarding
  // checklist is stateless and does not require initialisation.
  mobileMode.init({ storageKey, mobile });

  return { ok: true, storageKey: storageKey || undefined };
}

export default { install };