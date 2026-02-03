// functions/api/login.js
//
// Cloudflare Pages function to authenticate a user by username and
// password.  This implementation centralizes common behaviours such
// as CORS handling, JSON parsing and IP‑based rate limiting using
// helpers defined in `_helpers.js`.  When a valid user record is
// found the associated tenant token is returned.  Accounts marked
// as blocked yield a special response indicating the block state.

import {
  CORS,
  jsonResponse,
  preflight,
  checkAllowed,
  parseJSONBody,
  getClientIP,
  rateLimit
} from './_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  // Compose CORS headers for login.  Explicitly list allowed methods
  // to satisfy strict CORS validators.
  const cors = {
    ...CORS.login,
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
  // Handle OPTIONS preflight.
  const pf = preflight(request, cors);
  if (pf) return pf;
  // Enforce allowed method (POST only).
  const disallowed = checkAllowed(request, ['POST'], cors);
  if (disallowed) return disallowed;
  // Rate limit by client IP: max 20 attempts per minute.
  const ip = getClientIP(request);
  const rl = await rateLimit(env, ip, 'rate:login', 20, cors);
  if (rl) return rl;
  // Parse body as JSON.
  const [body, err] = await parseJSONBody(request);
  if (err || !body) {
    return jsonResponse({ ok: false, error: 'bad_request', message: 'JSON inválido no corpo.' }, 400, cors);
  }
  const user = String(body?.user || '').trim().toLowerCase();
  const pass = String(body?.pass || '');
  if (!user || !pass) {
    return jsonResponse({ ok: false, error: 'missing_credentials', message: 'Usuário e senha são obrigatórios.' }, 400, cors);
  }
  try {
    // Retrieve user record from KV. The record contains { token, pass, blocked, company }.
    const record = await env.ERP_SYNC.get(`user:${user}`, { type: 'json' });
    if (!record || !record.pass || record.pass !== pass) {
      // Fallback: allow internal admin login based on env variables.  If a
      // user record is not found and the credentials match the internal
      // admin account (ERP_INTERNAL_USER/ERP_INTERNAL_PASS), return the
      // configured token.  This internal account is never stored in KV.
      const internalUser = String(env.ERP_INTERNAL_USER || 'admin').trim().toLowerCase();
      const internalPass = String(env.ERP_INTERNAL_PASS || '123');
      const internalToken = String(env.ERP_INTERNAL_TOKEN || 'b1').trim().toLowerCase();
      if (user === internalUser && pass === internalPass) {
        return jsonResponse({ ok: true, blocked: false, token: internalToken, company: internalToken }, 200, cors);
      }
      return jsonResponse({ ok: false, error: 'invalid_credentials', message: 'Usuário ou senha inválidos.' }, 401, cors);
    }
    if (record.blocked) {
      return jsonResponse({ ok: true, blocked: true, token: record.token, company: record.company || record.token, message: 'Conta bloqueada. Entre em contato com o suporte.' }, 200, cors);
    }
    return jsonResponse({ ok: true, blocked: false, token: record.token, company: record.company || record.token }, 200, cors);
  } catch (ex) {
    return jsonResponse({ ok: false, error: 'internal_error', message: String(ex?.message || ex) }, 500, cors);
  }
}