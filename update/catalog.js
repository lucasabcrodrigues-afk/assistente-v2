// update/catalog.js
// Offline barcode catalogue.  Provides CRUD operations for a
// mapping of product codes to descriptive text such as name,
// brand and unit.  Uses localStorage for persistence under a key
// derived from the configured database key.  Supports JSON and
// CSV import/export.

import { getStorageKey } from './config.js';

const CFG = { storageKey: 'erp_db' };

function storeKey() {
  // Store catalogue alongside the main DB under a derived suffix
  const base = getStorageKey();
  return `${base}__barcode_catalog`;
}

function normalizeCode(code) {
  return String(code || '').trim();
}
function normalizeText(s) {
  return String(s || '').trim();
}

function load() {
  const raw = localStorage.getItem(storeKey());
  if (!raw) return { version: 1, updatedAt: new Date().toISOString(), items: {} };
  try {
    const obj = JSON.parse(raw);
    return {
      version: 1,
      updatedAt: obj.updatedAt || new Date().toISOString(),
      items: obj.items && typeof obj.items === 'object' ? obj.items : {},
    };
  } catch (e) {
    return { version: 1, updatedAt: new Date().toISOString(), items: {} };
  }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(storeKey(), JSON.stringify(state));
}

/**
 * Look up a code in the catalogue.  Returns null if not found.
 *
 * @param {string} code Code to look up
 * @returns {Object|null} Catalogue entry or null
 */
export function lookup(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const st = load();
  const it = st.items[c];
  return it ? { code: c, ...it } : null;
}

/**
 * Insert or update a catalogue entry.  Code and name are
 * required.  Brand and unit are optional.  Returns an object
 * indicating success or failure.
 *
 * @param {Object} entry Entry fields
 * @param {string} entry.code Code
 * @param {string} entry.name Name
 * @param {string} [entry.brand] Brand
 * @param {string} [entry.unit] Unit
 * @returns {Object} Result
 */
export function upsert({ code, name, brand = '', unit = '' } = {}) {
  const c = normalizeCode(code);
  const n = normalizeText(name);
  if (!c || !n) return { ok: false, error: 'code e name são obrigatórios.' };
  const st = load();
  st.items[c] = {
    name: n,
    brand: normalizeText(brand),
    unit: normalizeText(unit),
  };
  save(st);
  return { ok: true };
}

/**
 * Remove a code from the catalogue.
 *
 * @param {string} code Code to remove
 * @returns {Object} Result
 */
export function remove(code) {
  const c = normalizeCode(code);
  const st = load();
  delete st.items[c];
  save(st);
  return { ok: true };
}

/**
 * List up to `limit` entries from the catalogue.
 *
 * @param {Object} opts Options
 * @param {number} [opts.limit=5000] Maximum number of entries
 * @returns {Array<Object>} List of entries
 */
export function list({ limit = 5000 } = {}) {
  const st = load();
  const entries = Object.entries(st.items).map(([code, val]) => ({ code, ...val }));
  return entries.slice(0, limit);
}

/**
 * Export the catalogue as a JSON string.  When pretty is true the
 * output is indented with two spaces.
 *
 * @param {Object} opts Options
 * @param {boolean} [opts.pretty=true] Pretty print JSON
 * @returns {string} JSON string
 */
export function exportJSON({ pretty = true } = {}) {
  const st = load();
  return JSON.stringify(st, null, pretty ? 2 : 0);
}

/**
 * Import catalogue entries from a JSON string.  Accepts an object
 * with an `items` property.  When merge is false the existing
 * catalogue is cleared before import.  Returns the count of
 * imported entries on success or an error message on failure.
 *
 * @param {string} jsonString JSON string
 * @param {Object} opts Options
 * @param {boolean} [opts.merge=true] Merge with existing entries
 * @returns {Object} Result
 */
export function importJSON(jsonString, { merge = true } = {}) {
  try {
    const obj = JSON.parse(jsonString);
    if (!obj || typeof obj !== 'object' || !obj.items) throw new Error('JSON inválido.');
    const st = load();
    const incoming = obj.items;
    if (!merge) st.items = {};
    for (const [code, val] of Object.entries(incoming)) {
      if (!code) continue;
      const name = val?.name;
      if (!name) continue;
      st.items[normalizeCode(code)] = {
        name: normalizeText(name),
        brand: normalizeText(val?.brand || ''),
        unit: normalizeText(val?.unit || ''),
      };
    }
    save(st);
    return { ok: true, count: Object.keys(st.items).length };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function parseCSV(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const delim = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(delim).map(h => h.trim().toLowerCase());
  const idx = {
    code: header.indexOf('code') >= 0 ? header.indexOf('code') : header.indexOf('codigo'),
    name: header.indexOf('name') >= 0 ? header.indexOf('name') : header.indexOf('nome'),
    brand: header.indexOf('brand'),
    unit: header.indexOf('unit') >= 0 ? header.indexOf('unit') : header.indexOf('unidade'),
  };
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim);
    const code = parts[idx.code] ? parts[idx.code].trim() : '';
    const name = parts[idx.name] ? parts[idx.name].trim() : '';
    if (!code || !name) continue;
    out.push({
      code,
      name,
      brand: idx.brand >= 0 && parts[idx.brand] ? parts[idx.brand].trim() : '',
      unit: idx.unit >= 0 && parts[idx.unit] ? parts[idx.unit].trim() : '',
    });
  }
  return out;
}

/**
 * Import catalogue entries from CSV text.  Accepts comma or
 * semicolon delimiters and supports header aliases.  When merge
 * is false existing entries are cleared.
 *
 * @param {string} csvText CSV content
 * @param {Object} opts Options
 * @param {boolean} [opts.merge=true] Merge with existing entries
 * @returns {Object} Result
 */
export function importCSV(csvText, { merge = true } = {}) {
  const rows = parseCSV(csvText);
  const st = load();
  if (!merge) st.items = {};
  rows.forEach(r => {
    st.items[normalizeCode(r.code)] = {
      name: normalizeText(r.name),
      brand: normalizeText(r.brand),
      unit: normalizeText(r.unit),
    };
  });
  save(st);
  return { ok: true, imported: rows.length, total: Object.keys(st.items).length };
}

/**
 * Export the catalogue to CSV.  Returns a string with a header
 * row followed by data rows separated by newlines and semicolons.
 * Semicolons in fields are replaced with commas.
 *
 * @returns {string} CSV content
 */
export function exportCSV() {
  const rows = list();
  const head = 'code;name;brand;unit';
  const body = rows.map(r => `${r.code};${(r.name || '').replace(/;/g, ',')};${(r.brand || '').replace(/;/g, ',')};${(r.unit || '').replace(/;/g, ',')}`).join('\n');
  return head + '\n' + body;
}

/**
 * Initialise the catalogue module.  Pass a storageKey to override
 * the default derived key.  Ensures that the catalogue file is
 * created if absent.
 *
 * @param {Object} opts Options
 * @param {string} [opts.storageKey] Not used; reserved for compatibility
 * @returns {Object} Result
 */
export function init({ storageKey } = {}) {
  // storageKey override is ignored here because we derive from config
  // but this parameter is kept for API compatibility.
  load(); // ensure exists
  return { ok: true, storageKey: getStorageKey() };
}

export default {
  init,
  lookup,
  upsert,
  remove,
  list,
  exportJSON,
  importJSON,
  importCSV,
  exportCSV,
};