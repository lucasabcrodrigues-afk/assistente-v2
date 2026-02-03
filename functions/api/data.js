// functions/api/data.js
//
// Cloudflare Pages Function to load or save a tenant database.  This
// endpoint serves as the main persistence API for the ERP single page
// application.  It supports two operations via GET and POST.  When
// called with a GET request and a `token` query parameter it
// retrieves the latest saved database for the specified tenant.  A
// non‑existent record returns `{ ok: true, exists: false }` rather
// than a 404 to simplify client logic.  On POST the body must
// contain a JSON object with `token` (the tenant identifier) and
// `db` (the database object).  The payload is stored under the
// key `db:<token>` in KV along with optional `meta`, a `savedAt`
// timestamp and a computed byte count.  Basic CORS headers are
// included to permit cross‑origin requests from the ERP front‑end.

import {
  CORS,
  jsonResponse,
  preflight,
  checkAllowed,
  parseJSONBody
} from './_helpers.js';

/**
 * Handle incoming requests.  This function examines the HTTP method
 * and routes to either a load (GET) or save (POST) operation.  All
 * other methods produce a 405 response.  CORS preflight requests
 * short‑circuit early.
 *
 * @param {any} context Cloudflare Pages context containing request and env
 */
export async function onRequest(context) {
  const { request, env } = context;
  // Base CORS for data endpoints. Allows GET,POST,OPTIONS and only
  // exposes Content‑Type header.  Additional headers like
  // Authorization are not needed here because client operations are
  // authenticated by token parameter.  Security headers are set in
  // _helpers.js.
  const cors = {
    ...CORS.data,
    // Explicitly list allowed methods to satisfy some CORS preflight
    // validators.  Without this property some browsers may reject
    // POST requests with a custom payload.
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
  // Handle OPTIONS preflight
  const pf = preflight(request, cors);
  if (pf) return pf;
  // Enforce allowed methods (GET and POST)
  const disallowed = checkAllowed(request, ['GET', 'POST'], cors);
  if (disallowed) return disallowed;
  // Route based on method
  if (request.method === 'GET') {
    return handleGet(request, env, cors);
  }
  // POST
  return handlePost(request, env, cors);
}

/**
 * Handle GET requests to load a tenant database.  The token is
 * extracted from the query string.  If the token is missing a 400
 * response is returned.  When the client record exists and is
 * blocked, the response indicates the blocked status so the
 * front‑end can display an appropriate message.  If no database
 * exists a success response with `exists:false` and `db:null` is
 * returned.  Otherwise the stored database is returned along with
 * any metadata and timestamps.
 *
 * @param {Request} request Incoming Request
 * @param {any} env Cloudflare environment
 * @param {Object} cors Base CORS headers
 */
async function handleGet(request, env, cors) {
  try {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '')
      .trim()
      .toLowerCase();
    if (!token) {
      return jsonResponse({ ok: false, error: 'missing_token' }, 400, cors);
    }
    // Check client record to see if the account is blocked.  We
    // intentionally ignore missing records here because a database
    // could still exist even if the client record was deleted.
    try {
      const client = await env.ERP_SYNC.get(`client:${token}`, { type: 'json' });
      if (client && client.blocked) {
        return jsonResponse({ ok: false, blocked: true, message: 'Conta bloqueada.' }, 200, cors);
      }
    } catch (_) {
      // Failure to read the client record should not block the
      // operation; proceed to attempt to load the database.
    }
    // Retrieve the database record
    const record = await env.ERP_SYNC.get(`db:${token}`, { type: 'json' });
    if (!record) {
      return jsonResponse({ ok: true, exists: false, db: null }, 200, cors);
    }
    const { db, meta = null, savedAt = null, bytes = null } = record;
    return jsonResponse({ ok: true, exists: true, db, meta, savedAt, bytes }, 200, cors);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err?.message || err) }, 500, cors);
  }
}

/**
 * Handle POST requests to save a tenant database.  Expects a JSON
 * body with `token` and `db` fields.  Optionally accepts a `meta`
 * object.  If the client is blocked the response reflects that
 * status.  Otherwise the payload is persisted with a timestamp and
 * byte count.  Errors in reading or writing KV produce a 500
 * response.
 *
 * @param {Request} request Incoming Request
 * @param {any} env Cloudflare environment
 * @param {Object} cors Base CORS headers
 */
async function handlePost(request, env, cors) {
  // Parse JSON body safely
  const [body, parseErr] = await parseJSONBody(request);
  if (parseErr || !body) {
    return jsonResponse({ ok: false, error: 'bad_request', message: 'JSON inválido.' }, 400, cors);
  }
  const token = String(body?.token || '')
    .trim()
    .toLowerCase();
  const db = body?.db;
  const meta = typeof body?.meta === 'object' && body.meta !== null ? body.meta : {};
  if (!token || typeof db !== 'object' || db === null) {
    return jsonResponse({ ok: false, error: 'bad_request' }, 400, cors);
  }
  try {
    // Check if the client is blocked
    try {
      const client = await env.ERP_SYNC.get(`client:${token}`, { type: 'json' });
      if (client && client.blocked) {
        return jsonResponse({ ok: false, blocked: true, message: 'Conta bloqueada.' }, 200, cors);
      }
    } catch (_) {
      // ignore client read errors
    }
    const savedAt = new Date().toISOString();
    // Determine revision number by reading previous record.  This
    // increments the stored rev so clients can detect changes when
    // polling /api/sync/status.  If no existing record is found the
    // revision starts at 1.  Errors reading the previous record are
    // ignored and treated as revision 0.
    let prevRev = 0;
    try {
      const prev = await env.ERP_SYNC.get(`db:${token}`, { type: 'json' });
      if (prev && prev.meta && typeof prev.meta.rev !== 'undefined') {
        const n = Number(prev.meta.rev);
        prevRev = Number.isFinite(n) ? n : 0;
      }
    } catch (_) {
      // ignore read errors
      prevRev = 0;
    }
    const newRev = prevRev + 1;
    // Update meta with revision and timestamp.  We assign
    // updatedAt to the same value as savedAt so clients can use
    // either property.  Do not mutate the input meta object
    // directly in case the caller reuses it later.
    const nextMeta = { ...(meta || {}) };
    nextMeta.rev = newRev;
    nextMeta.updatedAt = savedAt;
    // Assemble payload; compute bytes using JSON length of db+meta
    const payload = {
      db,
      meta: nextMeta,
      savedAt,
      bytes: 0
    };
    try {
      payload.bytes = JSON.stringify({ db, meta: nextMeta }).length;
    } catch (_) {
      payload.bytes = 0;
    }
    await env.ERP_SYNC.put(`db:${token}`, JSON.stringify(payload));
    return jsonResponse({ ok: true, savedAt: payload.savedAt, bytes: payload.bytes, rev: newRev }, 200, cors);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err?.message || err) }, 500, cors);
  }
}