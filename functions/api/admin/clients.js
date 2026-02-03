// functions/api/admin/clients.js
//
// Cloudflare Pages function to manage tenant clients.  Supports
// listing existing clients via GET and creating/updating a client via
// POST.  A Bearer admin token is required on all operations.  This
// version uses shared helper utilities to handle CORS, admin auth,
// method checks and JSON parsing consistently across endpoints.

import {
  CORS,
  jsonResponse,
  preflight,
  checkAllowed,
  parseJSONBody,
  requireAdmin
} from '../_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    ...CORS.adminBase,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
  // Preflight for OPTIONS
  const pf = preflight(request, cors);
  if (pf) return pf;
  // Enforce allowed verbs
  const disallowed = checkAllowed(request, ['GET', 'POST'], cors);
  if (disallowed) return disallowed;
  const method = request.method.toUpperCase();
  if (method === 'GET') {
    // Authenticate using query params
    const unauthorized = requireAdmin(env, request, cors);
    if (unauthorized) return unauthorized;
    return handleGet(env, cors);
  }
  // POST: parse body first to allow passing credentials via JSON
  const [body, parseErr] = await parseJSONBody(request);
  if (parseErr || !body) {
    return jsonResponse({ ok: false, error: 'bad_request', message: 'JSON inválido.' }, 400, cors);
  }
  // Authenticate using body and query
  const unauthorized = requireAdmin(env, request, cors, body);
  if (unauthorized) return unauthorized;
  return handlePost(body, env, cors);
}

// Seed default client records into KV if the index is empty.  This
// function mirrors the original behaviour of seeding example clients
// for demonstration purposes.  Seeding is idempotent: it only runs
// when the clients:index key contains no entries.
async function seedDefaultsIfEmpty(env) {
  const existing = await env.ERP_SYNC.get('clients:index', { type: 'json' });
  const tokens = Array.isArray(existing) ? existing : [];
  if (tokens && tokens.length) return;
  const seeds = [
    { token: 'rose', user: 'rose', pass: 'rose123', startMonth: '', dueMonth: '', blocked: false },
    { token: 'bless_celular', user: 'bless', pass: 'bless123', startMonth: '', dueMonth: '', blocked: false },
    { token: 'junior', user: 'junior', pass: 'junior123', startMonth: '', dueMonth: '', blocked: false },
    { token: 'cliente1', user: 'cliente1', pass: 'cliente1123', startMonth: '', dueMonth: '', blocked: false },
    { token: 'cliente2', user: 'cliente2', pass: 'cliente2123', startMonth: '', dueMonth: '', blocked: false }
  ];
  const seedTokens = [];
  for (const rec of seeds) {
    await env.ERP_SYNC.put(`client:${rec.token}`, JSON.stringify(rec));
    await env.ERP_SYNC.put(`user:${rec.user}`, JSON.stringify(rec));
    seedTokens.push(rec.token);
  }
  await env.ERP_SYNC.put('clients:index', JSON.stringify(seedTokens));
}

// Handle GET requests for clients.  Returns a list of all client
// records stored in the KV index.  If the index is empty, it is
// seeded with default clients first.
async function handleGet(env, cors) {
  try {
    await seedDefaultsIfEmpty(env);
    const indexRaw = await env.ERP_SYNC.get('clients:index', { type: 'json' });
    const tokens = Array.isArray(indexRaw) ? indexRaw : [];
    const clients = [];
    for (const t of tokens) {
      const rec = await env.ERP_SYNC.get(`client:${t}`, { type: 'json' });
      if (rec) clients.push(rec);
    }
    // Append internal admin client to the list.  Use env variables
    // ERP_INTERNAL_TOKEN, ERP_INTERNAL_USER, ERP_INTERNAL_PASS to
    // override defaults.  The internal client is not stored in KV to
    // prevent accidental deletion or modification.  Mark with flags
    // internal/admin so the front‑end can display a tag.
    const internalToken = String(env.ERP_INTERNAL_TOKEN || 'b1').trim().toLowerCase();
    const internalUser = String(env.ERP_INTERNAL_USER || 'admin').trim().toLowerCase();
    const internalPass = String(env.ERP_INTERNAL_PASS || '123');
    const exists = clients.some((c) => String(c.token || '').toLowerCase() === internalToken);
    if (!exists) {
      clients.push({ token: internalToken, user: internalUser, pass: internalPass, startMonth: '', dueMonth: '', blocked: false, internal: true, admin: true });
    }
    return jsonResponse({ ok: true, clients }, 200, cors);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err?.message || err) }, 500, cors);
  }
}

// Handle POST requests to create or update a client record.  The
// incoming body must contain token, user and pass.  The prevToken
// field allows renaming an existing client.  Duplicate tokens or
// usernames are rejected unless updating the same record.  Internal
// admin clients cannot be modified.
async function handlePost(body, env, cors) {
  const token = String(body?.token || '').trim().toLowerCase();
  const user = String(body?.user || '').trim().toLowerCase();
  const pass = String(body?.pass || '');
  const startMonth = String(body?.startMonth || '').trim();
  const dueMonth = String(body?.dueMonth || '').trim();
  const blocked = !!body?.blocked;
  const prevToken = String(body?.prevToken || '').trim().toLowerCase();
  // Disallow modifications to the internal admin client
  const internalToken = String(env.ERP_INTERNAL_TOKEN || 'b1').trim().toLowerCase();
  const internalUser = String(env.ERP_INTERNAL_USER || 'admin').trim().toLowerCase();
  if (token === internalToken || user === internalUser) {
    return jsonResponse({ ok: false, error: 'not_allowed', message: 'Não é permitido modificar o cliente interno.' }, 400, cors);
  }
  if (!token || !user || !pass) {
    return jsonResponse({ ok: false, error: 'missing_fields', message: 'Token, usuário e senha são obrigatórios.' }, 400, cors);
  }
  try {
    // Check for duplicate token/user
    const existingByToken = await env.ERP_SYNC.get(`client:${token}`, { type: 'json' });
    // If updating an existing record we allow the same token
    if (existingByToken && token !== prevToken) {
      return jsonResponse({ ok: false, error: 'duplicate_token', message: 'Token já em uso.' }, 409, cors);
    }
    const existingByUser = await env.ERP_SYNC.get(`user:${user}`, { type: 'json' });
    if (existingByUser && existingByUser.token !== prevToken) {
      return jsonResponse({ ok: false, error: 'duplicate_user', message: 'Usuário já em uso.' }, 409, cors);
    }
    // Fetch current index
    const indexRaw = await env.ERP_SYNC.get('clients:index', { type: 'json' });
    let tokens = Array.isArray(indexRaw) ? indexRaw.slice() : [];
    // Handle renaming: remove old records and update index
    if (prevToken && prevToken !== token) {
      const prevClient = await env.ERP_SYNC.get(`client:${prevToken}`, { type: 'json' });
      if (prevClient && prevClient.user) {
        await env.ERP_SYNC.delete(`user:${String(prevClient.user).trim().toLowerCase()}`);
      }
      await env.ERP_SYNC.delete(`client:${prevToken}`);
      tokens = tokens.filter((t) => t !== prevToken);
    }
    // Persist new/updated record
    const rec = { token, user, pass, startMonth, dueMonth, blocked };
    await env.ERP_SYNC.put(`client:${token}`, JSON.stringify(rec));
    await env.ERP_SYNC.put(`user:${user}`, JSON.stringify(rec));
    if (!tokens.includes(token)) tokens.push(token);
    await env.ERP_SYNC.put('clients:index', JSON.stringify(tokens));
    return jsonResponse({ ok: true }, 200, cors);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err?.message || err) }, 500, cors);
  }
}