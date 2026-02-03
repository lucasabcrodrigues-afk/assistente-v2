// functions/api/admin/delete.js
//
// Cloudflare Pages function to permanently delete a tenant.  The
// request must be a POST with a JSON body containing the `token`
// identifying the tenant.  Deletion removes the client record,
// mirrored user record, any saved database (`db:<token>`) and
// updates the clients:index accordingly.  Admin authorization is
// required.  Uses shared helpers for CORS, method checks and
// parsing.

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
  // Only POST permitted
  const disallowed = checkAllowed(request, ['POST'], cors);
  if (disallowed) return disallowed;
  // Parse body first to capture admin credentials
  const [body, err] = await parseJSONBody(request);
  if (err || !body) {
    return jsonResponse({ ok: false, error: 'bad_request', message: 'JSON inválido.' }, 400, cors);
  }
  // Verify admin credentials with body and query
  const unauthorized = requireAdmin(env, request, cors, body);
  if (unauthorized) return unauthorized;
  const token = String(body?.token || '')
    .trim()
    .toLowerCase();
  if (!token) {
    return jsonResponse({ ok: false, error: 'missing_token', message: 'Token é obrigatório.' }, 400, cors);
  }
  // Prevent deletion of internal admin client
  const internalToken = String(env.ERP_INTERNAL_TOKEN || 'b1').trim().toLowerCase();
  if (token === internalToken) {
    return jsonResponse({ ok: false, error: 'not_allowed', message: 'Não é permitido excluir o cliente interno.' }, 400, cors);
  }
  try {
    const rec = await env.ERP_SYNC.get(`client:${token}`, { type: 'json' });
    if (!rec) {
      return jsonResponse({ ok: false, error: 'not_found', message: 'Conta inexistente.' }, 404, cors);
    }
    // Delete client and user records
    await env.ERP_SYNC.delete(`client:${token}`);
    const userKey = `user:${String(rec.user || '').trim().toLowerCase()}`;
    await env.ERP_SYNC.delete(userKey);
    // Delete associated database
    await env.ERP_SYNC.delete(`db:${token}`);
    // Update index
    const indexRaw = await env.ERP_SYNC.get('clients:index', { type: 'json' });
    let tokens = Array.isArray(indexRaw) ? indexRaw.slice() : [];
    tokens = tokens.filter((t) => t !== token);
    await env.ERP_SYNC.put('clients:index', JSON.stringify(tokens));
    return jsonResponse({ ok: true }, 200, cors);
  } catch (ex) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(ex?.message || ex) }, 500, cors);
  }
}