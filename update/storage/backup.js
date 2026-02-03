// update/storage/backup.js
// Implements backup and snapshot management for the ERP.  The
// functions here allow exporting the current database to a JSON
// string, previewing imports without side effects, importing a
// backup, and managing a history of local snapshots.  Snapshots
// provide a way to roll back recent changes.

import { validate } from './validate.js';
import { schema } from './schema.js';
import * as dbCore from './db_core.js';
import { getStorageKey } from '../config.js';

function nowIso() {
  return new Date().toISOString();
}

// internal helper to construct the key used to store snapshots
function snapKey(storageKey) {
  return `${storageKey}__snapshots`;
}

function loadSnapshots(storageKey) {
  const raw = localStorage.getItem(snapKey(storageKey));
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

function saveSnapshots(storageKey, arr) {
  localStorage.setItem(snapKey(storageKey), JSON.stringify(arr));
}

/**
 * Export the given database as a JSON string.  The export includes a
 * meta block describing the schema version, export time and a simple
 * checksum.  The returned string is prettified by default.
 *
 * @param {Object} db Database object to export
 * @param {Object} opts Options
 * @param {boolean} [opts.pretty] Whether to pretty‑print
 * @returns {string} JSON payload ready for download
 */
export function exportDB(db, { pretty = true } = {}) {
  /*
    Gera um backup do banco em formato JSON.  O checksum32 é calculado
    sobre o payload final (incluindo o próprio campo checksum), de modo
    que a verificação posterior possa simplesmente recomputar o
    checksum sobre a string importada e comparar.  Antes de
    adicionar o campo, construímos o objeto sem `checksum32`,
    serializamos sem formatação (`pretty` = false) e só então
    armazenamos o checksum.  A serialização final pode ser
    prettificada conforme a opção.
  */
  const payload = {
    __meta: {
      type: 'erp_backup',
      schemaVersion: db?.schemaVersion || schema.SCHEMA_VERSION,
      exportedAt: nowIso(),
    },
    db: db,
  };
  // Serializa sem checksum para obter a referência de cálculo
  const jsonNoChecksum = JSON.stringify(payload, null, 0);
  const checksum = validate.checksum32(jsonNoChecksum);
  payload.__meta.checksum32 = checksum;
  // Agora serializa o payload completo.  A verificação recomputa
  // o checksum sobre este mesmo formato (null, 0) e compara.
  return JSON.stringify(payload, null, pretty ? 2 : 0);
}

/**
 * Preview an import without altering the current database.  Validates
 * the JSON file and returns summary statistics and warnings.  A
 * checksum mismatch will be reported as a warning.
 *
 * @param {string} jsonString JSON text representing an exported DB
 * @returns {Object} Result of preview
 */
export function previewImport(jsonString) {
  const res = { ok: false, warnings: [], summary: null };
  try {
    const obj = JSON.parse(jsonString);
    if (!obj || typeof obj !== 'object') throw new Error('Arquivo não é JSON válido.');
    if (!obj.db || typeof obj.db !== 'object') throw new Error('Arquivo não contém campo db.');
    if (!obj.__meta || obj.__meta.type !== 'erp_backup') res.warnings.push('Meta ausente ou tipo desconhecido.');
    // verify checksum if present.  Para calcular o checksum o campo
    // `checksum32` é removido temporariamente do objeto a ser serializado.
    if (obj.__meta && obj.__meta.checksum32) {
      try {
        // clone superficial removendo o checksum
        const clone = JSON.parse(JSON.stringify(obj));
        if (clone.__meta) delete clone.__meta.checksum32;
        const tmp = JSON.stringify(clone, null, 0);
        const cs = validate.checksum32(tmp);
        if (cs !== obj.__meta.checksum32) res.warnings.push('Checksum não confere (arquivo pode ter sido alterado).');
      } catch {
        // se der algo errado na clonagem ou cálculo, ignora a verificação
      }
    }
    const db = obj.db;
    res.summary = {
      schemaVersion: db.schemaVersion ?? null,
      counts: {
        estoque: Array.isArray(db.estoque) ? db.estoque.length : 0,
        vendas: Array.isArray(db.vendas) ? db.vendas.length : 0,
        devedores: Array.isArray(db.devedores) ? db.devedores.length : 0,
        auditLog: Array.isArray(db.auditLog) ? db.auditLog.length : 0,
      },
      exportedAt: obj.__meta?.exportedAt || null,
    };
    res.ok = true;
    return res;
  } catch (e) {
    res.warnings.push(e?.message || String(e));
    return res;
  }
}

/**
 * Import a backup JSON string into localStorage.  Currently merge
 * support is not implemented.  The database is migrated and
 * normalised before being persisted via dbCore.safeSave().  Returns
 * warnings collected during the process.
 *
 * @param {string} jsonString JSON payload
 * @param {Object} opts Options
 * @param {boolean} [opts.merge] Merge behaviour (not supported)
 * @returns {Object} Result of import
 */
export function importDB(jsonString, { merge = false } = {}) {
  if (merge) {
    return { ok: false, warnings: ['merge=true ainda não implementado nesta versão.'] };
  }
  try {
    const obj = JSON.parse(jsonString);
    if (!obj || typeof obj !== 'object' || !obj.db) throw new Error('Backup inválido.');
    let db = obj.db;
    const report = { warnings: [] };
    const fromV = Number(db.schemaVersion || 0);
    if (fromV !== schema.SCHEMA_VERSION) {
      db = schema.migrate(db, fromV, schema.SCHEMA_VERSION, report);
    }
    db = validate.normalizeDB(db);
    // Save via dbCore which will normalise and snapshot as needed
    dbCore.safeSave(db);
    const warn = (report.warnings || []).concat(validate.normalizeDB.lastReport?.warnings || []);
    return { ok: true, warnings: warn };
  } catch (e) {
    return { ok: false, warnings: [e?.message || String(e)] };
  }
}

/**
 * Create a snapshot of the current database.  Snapshots are stored
 * under a separate localStorage key and capped at 20 entries by
 * default.  Each snapshot stores minimal metadata about the counts
 * of major collections and the time it was created.
 *
 * @param {string} storageKey Storage key for snapshots
 * @param {Object} db Database to snapshot
 * @param {Object} opts Options
 * @param {number} [opts.maxSnapshots] Maximum number of snapshots to retain
 * @returns {string} The identifier of the created snapshot
 */
export function createSnapshot(storageKey, db, { maxSnapshots = 20 } = {}) {
  const snaps = loadSnapshots(storageKey);
  const id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  snaps.unshift({
    id,
    at: nowIso(),
    schemaVersion: db?.schemaVersion || schema.SCHEMA_VERSION,
    counts: {
      estoque: Array.isArray(db?.estoque) ? db.estoque.length : 0,
      vendas: Array.isArray(db?.vendas) ? db.vendas.length : 0,
    },
    data: db,
  });
  while (snaps.length > maxSnapshots) snaps.pop();
  saveSnapshots(storageKey, snaps);
  return id;
}

/**
 * List available snapshots.  Only lightweight metadata is returned.
 *
 * @param {string} storageKey Storage key
 * @returns {Array} Array of snapshot descriptors
 */
export function listSnapshots(storageKey = getStorageKey()) {
  const snaps = loadSnapshots(storageKey);
  return snaps.map((s) => ({ id: s.id, at: s.at, schemaVersion: s.schemaVersion, counts: s.counts }));
}

/**
 * Restore a snapshot by identifier.  The snapshot data is
 * normalised and persisted through dbCore.safeSave().
 *
 * @param {string} storageKey Storage key
 * @param {string} id Snapshot identifier
 * @returns {Object} Result of restoration
 */
export function restoreSnapshot(storageKey = getStorageKey(), id) {
  const snaps = loadSnapshots(storageKey);
  const found = snaps.find((s) => s.id === id);
  if (!found) return { ok: false, warnings: ['Snapshot não encontrado.'] };
  const db = validate.normalizeDB(found.data);
  dbCore.safeSave(db);
  return { ok: true, warnings: validate.normalizeDB.lastReport?.warnings || [] };
}

export default {
  export: exportDB,
  previewImport,
  import: importDB,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
};