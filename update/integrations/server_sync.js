// update/integrations/server_sync.js
// Server Sync module for Netlify (Functions + Netlify Blobs) + smart merge import.
// Goals:
//  - Add "Save to Server" / "Load from Server" without breaking legacy localStorage flow.
//  - Provide merge mode: complement data instead of replacing it.
//  - Opt-in via flags; safe fallbacks; zero hard dependency on UI.
//
// Usage (global):
//   window.UPDATE_FLAGS = { enableServerSync: true };
//   Update.integrations.serverSync.install(Update, { key: "erp_db_v1" });
//   await Update.integrations.serverSync.saveCurrentToServer();
//   await Update.integrations.serverSync.mergeFromServer({ sumStockQty: true });
//
// This file is designed to be dropped into an existing "update/" package.

const DEFAULTS = {
  enabledFlag: "enableServerSync",
  key: "erp_db_v1",
  endpoints: {
    save: "/.netlify/functions/erp_save",
    load: "/.netlify/functions/erp_load",
    health: "/.netlify/functions/erp_health",
  },
  // auth token is NEVER stored by default; user can provide it at runtime.
  // You should pass token via options or store it in sessionStorage yourself.
  tokenHeader: "x-erp-token",
  timeoutMs: 15000,
};

function nowIso() { return new Date().toISOString(); }

function safeJSONParse(txt, fallback = null) {
  try { return JSON.parse(txt); } catch (_) { return fallback; }
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v ?? null));
}

function normalizeCode(code) {
  return String(code ?? "").trim();
}

function asInt(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function uniqById(arr) {
  const seen = new Set();
  const out = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    const id = it && (it.id ?? it._id ?? it.uuid);
    const key = id ? String(id) : JSON.stringify(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Smart ERP DB merge. This is intentionally conservative:
 *  - Top-level objects are merged with preference to currentDB by default.
 *  - Arrays are deduped by id-like keys where possible.
 *  - estoque[] is merged by "cod" and (optionally) sums quantities.
 *
 * @param {Object} currentDB
 * @param {Object} incomingDB
 * @param {Object} options
 * @param {"current"|"import"} [options.prefer="current"]
 * @param {boolean} [options.sumStockQty=true]
 * @returns {{db:Object, report:Object}}
 */
export function mergeDBSmart(currentDB, incomingDB, options = {}) {
  const prefer = options.prefer === "import" ? "import" : "current";
  const sumStockQty = options.sumStockQty !== false;

  const a = isPlainObject(currentDB) ? deepClone(currentDB) : {};
  const b = isPlainObject(incomingDB) ? deepClone(incomingDB) : {};

  const report = {
    atIso: nowIso(),
    added: {},
    updated: {},
    conflicts: [],
    warnings: [],
  };

  // Merge primitive/object keys (conservative)
  const out = deepClone(a);
  for (const k of Object.keys(b)) {
    if (!(k in out)) {
      out[k] = deepClone(b[k]);
      report.added[k] = (report.added[k] || 0) + 1;
      continue;
    }
    const va = out[k];
    const vb = b[k];

    // Special: estoque array
    if (k === "estoque" && (Array.isArray(va) || Array.isArray(vb))) {
      const mergedStock = mergeEstoque(Array.isArray(va) ? va : [], Array.isArray(vb) ? vb : [], { sumStockQty, prefer, report });
      out[k] = mergedStock;
      continue;
    }

    // Arrays: union/dedupe by id where possible
    if (Array.isArray(va) || Array.isArray(vb)) {
      const arrA = Array.isArray(va) ? va : [];
      const arrB = Array.isArray(vb) ? vb : [];
      out[k] = uniqById([...arrA, ...arrB]);
      continue;
    }

    // Objects: deep merge
    if (isPlainObject(va) || isPlainObject(vb)) {
      out[k] = mergeObjects(isPlainObject(va) ? va : {}, isPlainObject(vb) ? vb : {}, prefer, report, `obj:${k}`);
      continue;
    }

    // Primitives: resolve conflict
    if (va !== vb && typeof vb !== "undefined") {
      if (prefer === "import") out[k] = vb;
      // record conflict if both present
      report.conflicts.push({ path: k, current: va, incoming: vb, chosen: prefer === "import" ? "incoming" : "current" });
    }
  }

  // Update meta timestamps where present
  if (isPlainObject(out.meta)) out.meta.updatedAt = nowIso();
  if (isPlainObject(out._meta)) out._meta.savedAt = nowIso();

  return { db: out, report };
}

function mergeObjects(a, b, prefer, report, prefix) {
  const out = deepClone(a);
  for (const k of Object.keys(b)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const va = out[k];
    const vb = b[k];
    if (!(k in out)) {
      out[k] = deepClone(vb);
      continue;
    }
    if (Array.isArray(va) || Array.isArray(vb)) {
      const arrA = Array.isArray(va) ? va : [];
      const arrB = Array.isArray(vb) ? vb : [];
      out[k] = uniqById([...arrA, ...arrB]);
      continue;
    }
    if (isPlainObject(va) || isPlainObject(vb)) {
      out[k] = mergeObjects(isPlainObject(va) ? va : {}, isPlainObject(vb) ? vb : {}, prefer, report, p);
      continue;
    }
    if (typeof vb !== "undefined" && va !== vb) {
      if (prefer === "import") out[k] = vb;
      report.conflicts.push({ path: p, current: va, incoming: vb, chosen: prefer === "import" ? "incoming" : "current" });
    }
  }
  return out;
}

function mergeEstoque(arrA, arrB, { sumStockQty, prefer, report }) {
  const map = new Map(); // cod -> item
  const norm = (x) => (x && typeof x === "object") ? x : null;

  // Load current first
  for (const it of arrA) {
    const o = norm(it);
    if (!o) continue;
    const cod = normalizeCode(o.cod ?? o.codigo ?? o.code ?? o.sku);
    if (!cod) continue;
    map.set(cod, deepClone(o));
  }

  for (const it of arrB) {
    const o = norm(it);
    if (!o) continue;
    const cod = normalizeCode(o.cod ?? o.codigo ?? o.code ?? o.sku);
    if (!cod) {
      report.warnings.push("Item importado no estoque sem código (cod). Ignorado.");
      continue;
    }

    if (!map.has(cod)) {
      map.set(cod, deepClone({ ...o, cod }));
      report.added.estoque = (report.added.estoque || 0) + 1;
      continue;
    }

    const cur = map.get(cod);
    // Quantity strategy
    const curQtd = asInt(cur.qtd ?? cur.quantidade ?? 0, 0);
    const incQtd = asInt(o.qtd ?? o.quantidade ?? 0, 0);

    // Merge fields conservatively
    const merged = mergeObjects(cur, o, prefer, report, `estoque:${cod}`);

    if (sumStockQty) {
      merged.qtd = curQtd + incQtd;
    } else {
      // keep prefer strategy
      merged.qtd = (prefer === "import") ? incQtd : curQtd;
    }

    map.set(cod, merged);
    report.updated.estoque = (report.updated.estoque || 0) + 1;
  }

  return Array.from(map.values());
}

// ---- HTTP helpers (fetch with timeout) ----
async function fetchJSON(url, { method = "GET", headers = {}, body = null, timeoutMs = DEFAULTS.timeoutMs } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : null,
      signal: ctrl.signal,
    });
    const txt = await res.text();
    const data = safeJSONParse(txt, null);
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error || txt || res.statusText };
    }
    return { ok: true, status: res.status, data: data ?? {} };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

function flagsEnabled(flagName) {
  try {
    const flags = (typeof window !== "undefined") ? (window.UPDATE_FLAGS || {}) : {};
    return !!flags[flagName];
  } catch (_) {
    return false;
  }
}

function getLogger(Update) {
  return Update?.utils?.log || {
    info: (...a) => console.log("[serverSync]", ...a),
    warn: (...a) => console.warn("[serverSync]", ...a),
    error: (...a) => console.error("[serverSync]", ...a),
  };
}

// ---- Public API ----
export function createServerSync(Update, opts = {}) {
  const cfg = {
    ...DEFAULTS,
    ...(opts || {}),
    endpoints: { ...DEFAULTS.endpoints, ...(opts.endpoints || {}) },
  };
  const log = getLogger(Update);

  function ensureEnabled() {
    if (!flagsEnabled(cfg.enabledFlag)) {
      return { ok: false, error: `ServerSync desativado (flag window.UPDATE_FLAGS.${cfg.enabledFlag}=false).` };
    }
    return { ok: true };
  }

  function getDB() {
    // Prefer update db_core if available
    try {
      if (Update?.storage?.db_core?.get) return Update.storage.db_core.get();
    } catch (_) {}
    // Fallback: read by storageKey
    const key = (Update?.config?.getStorageKey && Update.config.getStorageKey()) || cfg.storageKey || "ERP_DB";
    return safeJSONParse(localStorage.getItem(key), {}) || {};
  }

  function setDB(db) {
    try {
      if (Update?.storage?.db_core?.safeSave) return Update.storage.db_core.safeSave(db, { forceSnapshot: true });
    } catch (_) {}
    const key = (Update?.config?.getStorageKey && Update.config.getStorageKey()) || cfg.storageKey || "ERP_DB";
    localStorage.setItem(key, JSON.stringify(db));
    return { ok: true, warnings: [], snapshotCreated: false };
  }

  async function health({ token } = {}) {
    const en = ensureEnabled();
    if (!en.ok) return en;
    const headers = token ? { [cfg.tokenHeader]: token } : {};
    const r = await fetchJSON(cfg.endpoints.health, { headers });
    if (!r.ok) return r;
    return { ok: true, ...r.data };
  }

  async function saveDBToServer(db, { key = cfg.key, token, meta = null } = {}) {
    const en = ensureEnabled();
    if (!en.ok) return en;
    const headers = token ? { [cfg.tokenHeader]: token } : {};
    // Compute effective key: if a token is provided and the caller did not explicitly override the key,
    // namespacing is enforced to isolate multi‑tenant data.  The default key from cfg.key is replaced
    // with `db:<token>` when token is supplied.  If a custom key is passed (different from cfg.key),
    // we respect it and do not override with the token.
    const useDefault = !key || key === cfg.key;
    let effectiveKey = key || cfg.key;
    if (token && useDefault) {
      const t = String(token).trim();
      if (t) effectiveKey = `db:${t}`;
    }
    const payload = { key: effectiveKey, db, meta: meta || { savedAt: nowIso(), source: "client" } };
    const r = await fetchJSON(cfg.endpoints.save, { method: "POST", headers, body: payload });
    if (!r.ok) {
      log.warn("Falha ao salvar no servidor:", r.error);
      return r;
    }
    return { ok: true, ...r.data };
  }

  async function loadDBFromServer({ key = cfg.key, token } = {}) {
    const en = ensureEnabled();
    if (!en.ok) return en;
    const headers = token ? { [cfg.tokenHeader]: token } : {};
    // Compute effective key similarly to saveDBToServer: default key with token becomes db:<token>.
    const useDefault = !key || key === cfg.key;
    let effectiveKey = key || cfg.key;
    if (token && useDefault) {
      const t = String(token).trim();
      if (t) effectiveKey = `db:${t}`;
    }
    const url = `${cfg.endpoints.load}?key=${encodeURIComponent(effectiveKey)}`;
    const r = await fetchJSON(url, { headers });
    if (!r.ok) {
      log.warn("Falha ao carregar do servidor:", r.error);
      return r;
    }
    if (!r.data?.ok) return { ok: false, error: r.data?.error || "load_failed" };
    return { ok: true, db: r.data.db, meta: r.data.meta || null };
  }

  async function saveCurrentToServer({ key = cfg.key, token, meta = null } = {}) {
    const db = getDB();
    return saveDBToServer(db, { key, token, meta });
  }

  async function loadToLocal({ key = cfg.key, token } = {}) {
    const r = await loadDBFromServer({ key, token });
    if (!r.ok) return r;
    const saveRes = setDB(r.db);
    return { ok: !!saveRes?.ok, action: "load_replace", saved: saveRes, meta: r.meta || null };
  }

  async function mergeFromServer({ key = cfg.key, token, prefer = "current", sumStockQty = true } = {}) {
    const r = await loadDBFromServer({ key, token });
    if (!r.ok) return r;
    const cur = getDB();
    const merged = mergeDBSmart(cur, r.db, { prefer, sumStockQty });
    const saveRes = setDB(merged.db);
    return { ok: !!saveRes?.ok, action: "load_merge", saved: saveRes, report: merged.report, meta: r.meta || null };
  }

  async function mergeImportedFile(currentDB, importedDB, { prefer = "current", sumStockQty = true } = {}) {
    const merged = mergeDBSmart(currentDB, importedDB, { prefer, sumStockQty });
    return merged;
  }

  function installIntoUpdate() {
    // Expose on Update.integrations if possible
    if (Update && typeof Update === "object") {
      Update.integrations = Update.integrations || {};
      Update.integrations.serverSync = api;
    }
  }

  const api = {
    cfg,
    health,
    getDB,
    setDB,
    saveDBToServer,
    loadDBFromServer,
    saveCurrentToServer,
    loadToLocal,
    mergeFromServer,
    mergeImportedFile,
    installIntoUpdate,
  };

  return api;
}

export default { createServerSync, mergeDBSmart };
