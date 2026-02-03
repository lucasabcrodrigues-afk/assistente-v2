// update/storage/db_core.js
// Core database management.  This module coordinates reading and
// writing the ERP database to localStorage, runs migrations and
// normalisation, and provides recovery hooks to handle corruption.

import { schema } from './schema.js';
import { validate } from './validate.js';
import * as backup from './backup.js';
import { getStorageKey } from '../config.js';

// Internal state
let _cfg = {
  storageKey: getStorageKey(),
  backup: { maxSnapshots: 20, cooldownMs: 3000 },
};
let _lastSnapshotAt = 0;
let _recovery = { active: false, reason: '', details: null, since: null };

function nowIso() {
  return new Date().toISOString();
}

function setRecovery(active, reason, details) {
  _recovery.active = !!active;
  _recovery.reason = reason || '';
  _recovery.details = details || null;
  _recovery.since = active ? nowIso() : null;
}

function status() {
  return { ..._recovery };
}

function loadRaw() {
  const raw = localStorage.getItem(_cfg.storageKey);
  if (!raw) return { ok: true, value: null };
  const p = schema.safeParseJSON(raw);
  if (!p.ok) return { ok: false, error: p.error, raw };
  return { ok: true, value: p.value };
}

/**
 * Initialise the database.  Reads the current value from
 * localStorage, migrating and normalising it as necessary.  If the
 * data is corrupted a default DB is created and recovery mode is
 * engaged.  Snapshots are created on first run and after repairs.
 *
 * @param {Object} opts Options
 * @param {string} [opts.storageKey] Custom storage key
 * @param {Object} [opts.backup] Snapshot options (maxSnapshots, cooldownMs)
 * @returns {Object} Diagnostic information
 */
export function init({ storageKey, backup: backupCfg } = {}) {
  if (storageKey) _cfg.storageKey = String(storageKey);
  if (backupCfg && typeof backupCfg === 'object') {
    _cfg.backup = { ..._cfg.backup, ...backupCfg };
  }
  const res = {
    ok: true,
    storageKey: _cfg.storageKey,
    versionFrom: null,
    versionTo: schema.SCHEMA_VERSION,
    repaired: false,
    warnings: [],
  };
  const rawRes = loadRaw();
  if (!rawRes.ok) {
    // corrupted JSON: enter recovery and reset
    setRecovery(true, 'db_corrompido_json', { message: rawRes.error?.message || String(rawRes.error) });
    const db = schema.defaultDB();
    safeSave(db, { forceSnapshot: true, skipNormalize: false });
    res.repaired = true;
    res.warnings.push('DB corrompido: restaurado para defaults (recovery).');
    return res;
  }
  let db = rawRes.value;
  if (!db) {
    // first run
    db = schema.defaultDB();
    safeSave(db, { forceSnapshot: false });
    res.versionFrom = 0;
    res.repaired = false;
    return res;
  }
  // migrate if version mismatch
  const fromV = Number(db.schemaVersion || 0);
  res.versionFrom = fromV;
  const report = { warnings: [] };
  if (fromV !== schema.SCHEMA_VERSION) {
    db = schema.migrate(db, fromV, schema.SCHEMA_VERSION, report);
  }
  // normalise
  db = validate.normalizeDB(db);
  if (report.warnings && report.warnings.length) res.warnings.push(...report.warnings);
  if (validate.normalizeDB.lastReport?.warnings?.length) res.warnings.push(...validate.normalizeDB.lastReport.warnings);
  safeSave(db, { forceSnapshot: false, skipNormalize: true });
  res.repaired = res.warnings.length > 0;
  return res;
}

/**
 * Return the current database.  Reads from localStorage and
 * normalises the object on the fly.  If reading fails, a fresh
 * database is created and recovery mode is entered.
 *
 * @returns {Object} Current database
 */
export function get() {
  const raw = localStorage.getItem(_cfg.storageKey);
  if (!raw) return schema.defaultDB();
  try {
    const db = JSON.parse(raw);
    return validate.normalizeDB(db);
  } catch (e) {
    setRecovery(true, 'db_corrompido_json', { message: e?.message || String(e) });
    const db = schema.defaultDB();
    safeSave(db, { forceSnapshot: true, skipNormalize: true });
    return db;
  }
}

/**
 * Persist a database into localStorage.  Performs normalisation
 * unless skipNormalize is true.  Writes the data atomically by
 * writing to a temporary key first.  Creates a snapshot if
 * `forceSnapshot` is true or the cooldown has expired.
 *
 * @param {Object} db Database object to save
 * @param {Object} opts Options
 * @param {boolean} [opts.forceSnapshot] Whether to force snapshot creation
 * @param {boolean} [opts.skipNormalize] Skip normalisation before save
 * @returns {Object} Result of the save
 */
export function safeSave(db, { forceSnapshot = false, skipNormalize = false } = {}) {
  try {
    const fixed = skipNormalize ? db : validate.normalizeDB(db);
    // atomic-ish write: write to temp then copy
    const tmpKey = _cfg.storageKey + '__tmp';
    localStorage.setItem(tmpKey, JSON.stringify(fixed));
    localStorage.setItem(_cfg.storageKey, localStorage.getItem(tmpKey));
    localStorage.removeItem(tmpKey);
    // snapshot
    const now = Date.now();
    let snapCreated = false;
    if (forceSnapshot || now - _lastSnapshotAt >= _cfg.backup.cooldownMs) {
      backup.createSnapshot(_cfg.storageKey, fixed, { maxSnapshots: _cfg.backup.maxSnapshots });
      _lastSnapshotAt = now;
      snapCreated = true;
    }
    return { ok: true, warnings: validate.normalizeDB.lastReport?.warnings || [], snapshotCreated: snapCreated };
  } catch (e) {
    setRecovery(true, 'storage_error', { message: e?.message || String(e) });
    return { ok: false, warnings: [e?.message || String(e)], snapshotCreated: false };
  }
}

/**
 * Normalise a database object outside of the save path.  This
 * function delegates to validate.normalizeDB().
 *
 * @param {Object} db Database
 * @returns {Object} Normalised database
 */
export function normalize(db) {
  return validate.normalizeDB(db);
}

export const recovery = {
  enable: (reason, details) => setRecovery(true, reason, details),
  disable: () => setRecovery(false, '', null),
  status,
};

export const db_core = {
  init,
  get,
  safeSave,
  normalize,
  recovery,
  schema,
  validate,
  backup,
};

export default {
  init,
  get,
  safeSave,
  normalize,
  recovery,
  schema,
  validate,
  backup,
};