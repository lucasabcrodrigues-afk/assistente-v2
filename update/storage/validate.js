// update/storage/validate.js
// Implements validation and normalisation for the ERP database.  The
// functions in this module clean untrusted data, fix common
// inconsistencies and supply sensible defaults when fields are
// missing.  It mirrors the behaviour of the original CoreDB
// validate/normalise logic while exposing reusable helpers.

import { schema } from './schema.js';

export function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

export function asStr(x) {
  return (x === null || x === undefined) ? '' : String(x);
}

export function asNum(x, dflt = 0) {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string') {
    const s = x.trim().replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : dflt;
  }
  return dflt;
}

export function asInt(x, dflt = 0) {
  const n = asNum(x, dflt);
  const i = Math.trunc(n);
  return Number.isFinite(i) ? i : dflt;
}

export function nowIso() {
  return new Date().toISOString();
}

// A simple 32‑bit checksum used when exporting backups.  It is not
// cryptographically secure but does detect most accidental
// modifications.
export function checksum32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Normalise and validate a database object.  Returns a new
 * object with consistent structure.  Warnings about fixes applied
 * are recorded on the exported `lastReport`.  This function never
 * throws: invalid input is replaced with defaults.
 *
 * @param {any} db Raw database object
 * @returns {Object} Normalised database
 */
function normalizeDB(db) {
  const report = { ok: true, warnings: [], fixed: [], at: nowIso() };

  if (!isObj(db)) {
    report.warnings.push('DB inválido: substituído por defaults.');
    const fresh = schema.defaultDB();
    report.fixed.push('replaced_with_defaults');
    normalizeDB.lastReport = report;
    return fresh;
  }

  // Ensure schema version
  db.schemaVersion = asInt(db.schemaVersion, schema.SCHEMA_VERSION);

  // meta
  db.meta = isObj(db.meta) ? db.meta : {};
  db.meta.createdAt = db.meta.createdAt || nowIso();
  db.meta.updatedAt = nowIso();

  // top‑level collections
  db.users = Array.isArray(db.users) ? db.users : [];
  db.settings = isObj(db.settings) ? db.settings : {};
  db.estoque = Array.isArray(db.estoque) ? db.estoque : [];
  db.vendas = Array.isArray(db.vendas) ? db.vendas : [];
  db.caixa = isObj(db.caixa) ? db.caixa : { aberto: false, movimentos: [], aberturas: [] };
  db.caixa.aberto = !!db.caixa.aberto;
  db.caixa.movimentos = Array.isArray(db.caixa.movimentos) ? db.caixa.movimentos : [];
  db.caixa.aberturas = Array.isArray(db.caixa.aberturas) ? db.caixa.aberturas : [];
  db.devedores = Array.isArray(db.devedores) ? db.devedores : [];
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];

  // Normalise estoque
  for (const p of db.estoque) {
    if (!isObj(p)) continue;
    p.cod = asStr(p.cod).trim();
    p.nome = asStr(p.nome).trim();
    p.qtd = asInt(p.qtd, 0);
    p.min = asInt(p.min, 0);
    p.custo_c = asInt(p.custo_c, 0);
    p.preco_c = asInt(p.preco_c, 0);
    const lp = asNum(p.lucro_p, 0);
    p.lucro_p = Number.isFinite(lp) ? lp : 0;
    if (!p.cod && p.nome) report.warnings.push(`Produto sem código: "${p.nome}"`);
    if (!p.nome && p.cod) report.warnings.push(`Produto sem nome: código ${p.cod}`);
    if (p.qtd < 0) { p.qtd = 0; report.warnings.push(`Estoque negativo corrigido em ${p.cod || '(sem cod)'}`); }
    if (p.preco_c < 0) { p.preco_c = 0; report.warnings.push(`Preço negativo corrigido em ${p.cod || '(sem cod)'}`); }
    if (p.custo_c < 0) { p.custo_c = 0; report.warnings.push(`Custo negativo corrigido em ${p.cod || '(sem cod)'}`); }
  }

  // Normalise vendas
  for (const v of db.vendas) {
    if (!isObj(v)) continue;
    v.id = asStr(v.id).trim() || v.id;
    v.dataIso = v.dataIso || nowIso();
    v.itens = Array.isArray(v.itens) ? v.itens : [];
    for (const i of v.itens) {
      if (!isObj(i)) continue;
      i.cod = asStr(i.cod).trim();
      i.nome = asStr(i.nome).trim();
      i.qtd = asNum(i.qtd, 0);
      i.preco_c = asInt(i.preco_c, 0);
    }
    v.subtotal_c = asInt(v.subtotal_c, 0);
    v.desconto_c = asInt(v.desconto_c, 0);
    v.total_c = asInt(v.total_c, Math.max(0, v.subtotal_c - v.desconto_c));
    if (v.total_c < 0) { v.total_c = 0; report.warnings.push(`Venda ${v.id || '(sem id)'} com total negativo corrigido.`); }
  }

  normalizeDB.lastReport = report;
  return db;
}

// Export a default object for legacy usage but also export individual helpers.
export const validate = {
  normalizeDB,
  checksum32,
  asInt,
  asNum,
  asStr,
  isObj,
  nowIso,
};

export default validate;