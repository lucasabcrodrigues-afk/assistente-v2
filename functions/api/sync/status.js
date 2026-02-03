// functions/api/sync/status.js
//
// Endpoint to check the current revision and last updated timestamp
// for a tenant database.  This function supports GET requests only
// and returns a lightweight status object containing the revision
// (`rev`), the timestamp of the last update (`updatedAt`) and the
// current server time (`serverTime`).  It does not return the
// database itself.  Clients may poll this endpoint periodically to
// determine whether their local cache is stale and needs to be
// refreshed.  When the tenant is blocked the response includes a
// `blocked` flag to signal that no further operations should be
// performed until the account is reactivated.

import {
  CORS,
  jsonResponse,
  preflight,
  checkAllowed
} from '../_helpers.js';

/**
 * Handle incoming requests for sync status.  Only GET is supported; any
 * other method results in a 405.  CORS preflight is handled by
 * `_helpers.js`.  The tenant token must be supplied in the query
 * string under `token`.  When no record exists the response
 * indicates `exists:false` with `rev=0` and `updatedAt=null`.
 *
 * @param {any} context Cloudflare Pages context
 */
export async function onRequest(context) {
  const { request, env } = context;
  // CORS allowing only GET and OPTIONS for status checks
  const cors = {
    ...CORS.data,
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  };
  const pf = preflight(request, cors);
  if (pf) return pf;
  const disallowed = checkAllowed(request, ['GET'], cors);
  if (disallowed) return disallowed;
  try {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '')
      .trim()
      .toLowerCase();
    if (!token) {
      return jsonResponse({ ok: false, error: 'missing_token' }, 400, cors);
    }
    // Check client blocked status
    try {
      const client = await env.ERP_SYNC.get(`client:${token}`, { type: 'json' });
      if (client && client.blocked) {
        return jsonResponse({ ok: false, blocked: true, message: 'Conta bloqueada.' }, 200, cors);
      }
    } catch (_) {
      // ignore client read errors
    }
    const record = await env.ERP_SYNC.get(`db:${token}`, { type: 'json' });
    if (!record) {
      return jsonResponse({ ok: true, exists: false, rev: 0, updatedAt: null, serverTime: new Date().toISOString() }, 200, cors);
    }
    const { meta = null, savedAt = null } = record;
    const rev = Number(meta?.rev) || 0;
    const updatedAt = meta?.updatedAt || savedAt || null;
    return jsonResponse({ ok: true, exists: true, rev, updatedAt, serverTime: new Date().toISOString() }, 200, cors);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(err?.message || err) }, 500, cors);
  }
}