// update/utils/merge.js
// Intelligent merge helper for ERP databases stored in localStorage.
// This module allows merging two database objects by attempting to
// correlate records based on identifiers or common fields.  It is
// adapted from the standalone agent‑merge module and slightly
// simplified for the update package.  Consumers can merge
// imported backups into the current database without losing data.

import { getStorageKey } from '../config.js';

// Helpers used internally
function nowISO() { return new Date().toISOString(); }

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function safeJSONParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v ?? null));
}

function pickFirst(...vals) {
  for (const v of vals) if (v !== undefined) return v;
  return undefined;
}

function normStr(s) {
  return (s ?? '').toString().trim().toLowerCase();
}

function fingerprint(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const id = pickFirst(obj.id, obj._id, obj.uuid);
  if (id) return `id:${id}`;
  const codigo = pickFirst(obj.codigo, obj.code, obj.cod, obj.sku);
  if (codigo) return `codigo:${normStr(codigo)}`;
  const cpfCnpj = pickFirst(obj.cpf, obj.cnpj, obj.cpfCnpj, obj.documento);
  if (cpfCnpj) return `doc:${normStr(cpfCnpj).replace(/\D+/g, '')}`;
  const email = pickFirst(obj.email);
  if (email) return `email:${normStr(email)}`;
  const tel = pickFirst(obj.telefone, obj.fone, obj.celular, obj.whatsapp);
  if (tel) return `tel:${normStr(tel).replace(/\D+/g, '')}`;
  const nome = pickFirst(obj.nome, obj.name, obj.cliente, obj.produto, obj.descricao);
  if (nome) return `nome:${normStr(nome)}`;
  return '';
}

function mergeObjects(a, b, prefer = 'current') {
  const out = {};
  const keys = new Set([
    ...Object.keys(a || {}),
    ...Object.keys(b || {}),
  ]);
  for (const k of keys) {
    const va = a ? a[k] : undefined;
    const vb = b ? b[k] : undefined;
    if (Array.isArray(va) || Array.isArray(vb)) {
      out[k] = mergeArrays(Array.isArray(va) ? va : [], Array.isArray(vb) ? vb : [], prefer);
      continue;
    }
    if (isPlainObject(va) || isPlainObject(vb)) {
      out[k] = mergeObjects(isPlainObject(va) ? va : {}, isPlainObject(vb) ? vb : {}, prefer);
      continue;
    }
    if (va === undefined) out[k] = deepClone(vb);
    else if (vb === undefined) out[k] = deepClone(va);
    else {
      out[k] = deepClone(prefer === 'import' ? vb : va);
    }
  }
  return out;
}

function mergeArrays(arrA, arrB, prefer = 'current') {
  const isObjA = arrA.some(x => isPlainObject(x));
  const isObjB = arrB.some(x => isPlainObject(x));
  // Primitive arrays: simple union
  if (!isObjA && !isObjB) {
    const set = new Set([...arrA, ...arrB].map(x => JSON.stringify(x)));
    return [...set].map(s => safeJSONParse(s, s));
  }
  // Arrays of objects: deduplicate by fingerprint and merge fields
  const map = new Map();
  const order = [];
  function upsert(obj, source) {
    const key = fingerprint(obj) || `__idx__${source}:${order.length}`;
    if (!map.has(key)) {
      map.set(key, deepClone(obj));
      order.push(key);
      return;
    }
    const existing = map.get(key);
    const merged = mergeObjects(
      prefer === 'import' ? existing : existing,
      obj,
      (prefer === 'import' && source === 'import') ? 'import' :
      (prefer === 'current' && source === 'current') ? 'current' :
      'current'
    );
    map.set(key, merged);
  }
  for (const o of arrA) {
    if (isPlainObject(o)) upsert(o, 'current');
  }
  for (const o of arrB) {
    if (isPlainObject(o)) upsert(o, 'import');
  }
  return order.map(k => map.get(k));
}

/**
 * Merge two database objects, preferring values from the current
 * database unless specified otherwise.  The result contains a
 * combined `_meta` section with updated schema and a timestamp.
 *
 * @param {Object} currentDB The existing database
 * @param {Object} importDB The database being merged in
 * @param {string} [prefer='current'] Which source to prefer on conflict
 * @returns {Object} The merged database
 */
export function mergeDB(currentDB, importDB, prefer = 'current') {
  const a = isPlainObject(currentDB) ? currentDB : {};
  const b = isPlainObject(importDB) ? importDB : {};
  const out = mergeObjects(a, b, prefer);
  // Preserve meta information and update savedAt
  out._meta = out._meta || {};
  const schemaA = a._meta && a._meta.schema;
  const schemaB = b._meta && b._meta.schema;
  out._meta.schema = pickFirst(schemaA, schemaB, out._meta.schema);
  out._meta.savedAt = nowISO();
  return out;
}

/**
 * Read the current database from localStorage using the storage key
 * from the configuration.  Returns null if parsing fails.
 *
 * @returns {Object|null} Parsed database or null
 */
export function readCurrentDB() {
  const key = getStorageKey();
  const raw = localStorage.getItem(key);
  return safeJSONParse(raw, null);
}

/**
 * Write a database object to localStorage using the configured key.
 * This helper also stores up to 20 previous versions under a
 * secondary key for recovery purposes.  Each write pushes the new
 * snapshot to the front of the backups array.
 *
 * @param {Object} db Database to persist
 */
export function writeCurrentDB(db) {
  const key = getStorageKey();
  localStorage.setItem(key, JSON.stringify(db));
  // Maintain a snapshot history
  const backupKey = `${key}__backups`;
  const backups = safeJSONParse(localStorage.getItem(backupKey) || '[]', []);
  backups.unshift({ ts: nowISO(), db });
  while (backups.length > 20) backups.pop();
  localStorage.setItem(backupKey, JSON.stringify(backups));
}