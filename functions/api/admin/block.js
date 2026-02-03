// functions/api/admin/block.js
//
// Cloudflare Pages function to block or unblock a tenant client.  A
// POST request with JSON body containing `token` and `blocked`
// toggles the blocked flag on both the client record and the
// mirrored user record.  Admin authorization is enforced via
// Bearer token.  Uses shared helpers for CORS, method checks,
// authorization and JSON parsing.

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
  // Parse body early to extract credentials
  const [body, err] = await parseJSONBody(request);
  if (err || !body) {
    return jsonResponse({ ok: false, error: 'bad_request', message: 'JSON inválido.' }, 400, cors);
  }
  // Authenticate admin with body & query
  const unauthorized = requireAdmin(env, request, cors, body);
  if (unauthorized) return unauthorized;
  const token = String(body?.token || '')
    .trim()
    .toLowerCase();
  const blocked = !!body?.blocked;
  if (!token) {
    return jsonResponse({ ok: false, error: 'missing_token', message: 'Token é obrigatório.' }, 400, cors);
  }
  // Prevent blocking/unblocking the internal admin account
  const internalToken = String(env.ERP_INTERNAL_TOKEN || 'b1').trim().toLowerCase();
  if (token === internalToken) {
    return jsonResponse({ ok: false, error: 'not_allowed', message: 'Não é permitido bloquear o cliente interno.' }, 400, cors);
  }
  try {
    const rec = await env.ERP_SYNC.get(`client:${token}`, { type: 'json' });
    if (!rec) {
      return jsonResponse({ ok: false, error: 'not_found', message: 'Conta inexistente.' }, 404, cors);
    }
    rec.blocked = blocked;
    await env.ERP_SYNC.put(`client:${token}`, JSON.stringify(rec));
    const userKey = `user:${String(rec.user || '').trim().toLowerCase()}`;
    await env.ERP_SYNC.put(userKey, JSON.stringify(rec));
    return jsonResponse({ ok: true }, 200, cors);
  } catch (ex) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(ex?.message || ex) }, 500, cors);
  }
}