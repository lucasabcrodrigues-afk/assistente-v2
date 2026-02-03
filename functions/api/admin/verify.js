// functions/api/admin/verify.js
//
// Cloudflare Pages function to verify the secret phrase and PIN
// required to access the hidden admin console.  Accepts a POST
// request with a JSON body containing `phrase` and `password` (PIN).
// The expected values are stored in environment variables
// ERP_ADMIN_PHRASE and ERP_ADMIN_PIN.  Rate limiting protects
// against brute‑force attempts.  Uses shared helpers for CORS,
// method checks, JSON parsing and rate limiting.

import {
  CORS,
  jsonResponse,
  preflight,
  checkAllowed,
  parseJSONBody,
  getClientIP,
  rateLimit
} from '../_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  // Compose CORS: do not include Authorization header because this
  // endpoint is open to anyone who knows the phrase/pin.  Explicitly
  // specify allowed methods.
  const cors = {
    ...CORS.login,
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
  // Preflight
  const pf = preflight(request, cors);
  if (pf) return pf;
  // Only POST allowed
  const disallowed = checkAllowed(request, ['POST'], cors);
  if (disallowed) return disallowed;
  // Rate limit by IP: limit to 20 attempts per minute
  const ip = getClientIP(request);
  const rl = await rateLimit(env, ip, 'rate:verify', 20, cors);
  if (rl) return rl;
  // Parse body
  const [body, err] = await parseJSONBody(request);
  if (err || !body) {
    return jsonResponse({ ok: false, error: 'bad_request', message: 'JSON inválido.' }, 400, cors);
  }
  const phrase = String(body?.phrase || '').trim().toLowerCase();
  const password = String(body?.password || '').trim();
  const expectedPhrase = String(env.ERP_ADMIN_PHRASE || '').trim().toLowerCase();
  const expectedPin = String(env.ERP_ADMIN_PIN || '').trim();
  const ok = phrase === expectedPhrase && password === expectedPin;
  return jsonResponse({ ok }, 200, cors);
}