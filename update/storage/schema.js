// update/storage/schema.js
// Defines the database schema for the ERP.  A schema version
// identifies how the database should be structured and provides a
// migration pipeline to upgrade older data structures to the latest
// version.  The defaultDB() function returns a fresh database with
// required keys and sensible defaults.

const SCHEMA_VERSION = 1;

/**
 * Safely parse a JSON string.  Returns an object with either
 * { ok:true, value:object } or { ok:false, error:Error } without
 * throwing an exception.  This helper is used by the recovery
 * module when reading potentially corrupted data from localStorage.
 *
 * @param {string} txt JSON text to parse
 * @returns {{ok:boolean,value:any,error?:Error}}
 */
export function safeParseJSON(txt) {
  try {
    return { ok: true, value: JSON.parse(txt) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/**
 * Create a default database object conforming to the current
 * schema.  It initialises top-level collections and metadata.  This
 * function is tolerant to being called repeatedly: it always returns
 * a new object.
 *
 * @returns {Object}
 */
export function defaultDB() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    users: [],
    settings: {},
    estoque: [],
    vendas: [],
    caixa: { aberto: false, movimentos: [], aberturas: [] },
    devedores: [],
    auditLog: [],
    // Additional collections created by other modules will be
    // attached lazily on first use (e.g. stockMovements, cashSessions,
    // saleVoids, fiscalQueue).
  };
}

/**
 * Migrate a database from an older version to the latest schema.
 * This function performs incremental upgrades for each version
 * transition.  The `report` object accumulates metadata about the
 * migrations performed.
 *
 * @param {Object} db The database to migrate
 * @param {number} fromVersion The current schema version
 * @param {number} toVersion The target schema version
 * @param {Object} report Report collector
 * @returns {Object} The migrated database
 */
export function migrate(db, fromVersion = 0, toVersion = SCHEMA_VERSION, report = {}) {
  let v = fromVersion || 0;
  let cur = db || {};
  report.migrations = report.migrations || [];

  while (v < toVersion) {
    const next = v + 1;
    if (next === 1) {
      // v0 -> v1: ensure top-level keys exist and initialise
      cur = cur && typeof cur === 'object' ? cur : {};
      cur.schemaVersion = 1;
      cur.meta = cur.meta && typeof cur.meta === 'object' ? cur.meta : {};
      cur.meta.createdAt = cur.meta.createdAt || new Date().toISOString();
      cur.meta.updatedAt = new Date().toISOString();
      cur.users = Array.isArray(cur.users) ? cur.users : [];
      cur.settings = cur.settings && typeof cur.settings === 'object' ? cur.settings : {};
      cur.estoque = Array.isArray(cur.estoque) ? cur.estoque : [];
      cur.vendas = Array.isArray(cur.vendas) ? cur.vendas : [];
      cur.caixa = cur.caixa && typeof cur.caixa === 'object' ? cur.caixa : { aberto:false, movimentos:[], aberturas:[] };
      cur.caixa.movimentos = Array.isArray(cur.caixa.movimentos) ? cur.caixa.movimentos : [];
      cur.caixa.aberturas = Array.isArray(cur.caixa.aberturas) ? cur.caixa.aberturas : [];
      cur.devedores = Array.isArray(cur.devedores) ? cur.devedores : [];
      cur.auditLog = Array.isArray(cur.auditLog) ? cur.auditLog : [];
      report.migrations.push({ from: 0, to: 1, at: new Date().toISOString() });
    }
    v = next;
  }
  return cur;
}

export const schema = {
  SCHEMA_VERSION,
  defaultDB,
  migrate,
  safeParseJSON,
};

export default schema;