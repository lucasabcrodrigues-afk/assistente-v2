// update/config.js
// Global configuration for the update module.  This file centralises
// settings such as the storage key used to persist the ERP database in
// localStorage.  Other modules import this configuration to remain
// coherent across the system.  Consumers may change the storageKey by
// calling Update.install({ storageKey: 'my_key' }).

export const config = {
  /**
   * The key used when reading/writing the ERP database in
   * localStorage.  Defaults to `erp_db`.  All storage helpers
   * reference this property.
   */
  storageKey: 'erp_db',
};

/**
 * Update the storage key.  This is primarily called from the
 * installer but can be invoked directly if the caller wishes to
 * override the key at runtime.  Changing the key after data has
 * already been saved will cause the module to operate on a new,
 * empty database.
 *
 * @param {string} key New storage key
 */
export function setStorageKey(key) {
  if (typeof key === 'string' && key.trim()) {
    config.storageKey = key.trim();
  }
}

/**
 * Return the current storage key.  Provided for completeness.
 *
 * @returns {string}
 */
export function getStorageKey() {
  return config.storageKey;
}

export default config;