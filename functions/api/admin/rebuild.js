// functions/api/admin/rebuild.js
//
// Cloudflare Pages function to rebuild the clients index from
// existing client records.  This endpoint iterates over the KV
// namespace using the `list` API to collect all keys that start
// with `client:` and updates the `clients:index` key accordingly.
// Because listing keys can be an expensive operation the caller
// must be authenticated as an admin.  Use a POST request with
// admin credentials supplied via JSON body or query string.

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
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
  // Preflight
  const pf = preflight(request, cors);
  if (pf) return pf;
  // Only POST allowed
  const disallowed = checkAllowed(request, ['POST'], cors);
  if (disallowed) return disallowed;
  // Parse body to extract credentials (if provided)
  const [body, err] = await parseJSONBody(request);
  // Authenticate admin
  const unauthorized = requireAdmin(env, request, cors, body || {});
  if (unauthorized) return unauthorized;
  try {
    const tokens = [];
    // Iterate over all client keys.  Workers KV list returns a
    // structure { keys: [{ name: string }], list_complete: boolean,
    // cursor: string }.  We page through results until list_complete.
    let cursor = undefined;
    do {
      const result = await env.ERP_SYNC.list({ prefix: 'client:', cursor });
      for (const entry of (result.keys || [])) {
        const name = entry.name || '';
        if (name.startsWith('client:')) {
          const token = name.slice('client:'.length);
          tokens.push(token);
        }
      }
      cursor = result.list_complete ? null : result.cursor;
    } while (cursor);
    // Update the index
    await env.ERP_SYNC.put('clients:index', JSON.stringify(tokens));
    return jsonResponse({ ok: true, tokens }, 200, cors);
  } catch (ex) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(ex?.message || ex) }, 500, cors);
  }
}