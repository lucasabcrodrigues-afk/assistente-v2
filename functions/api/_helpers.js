// project/functions/api/_helpers.js
//
// Shared helper functions for Cloudflare Pages API endpoints.
// This module centralizes common CORS headers, JSON parsing,
// response construction, admin authorization, method checks and
// rudimentary rate limiting. By consolidating these concerns in a
// single place we avoid duplication across each API file and make
// the behaviour consistent. All helpers are designed to be
// side‑effect free and throw no exceptions; they return Response
// objects directly when an error condition should short‑circuit the
// endpoint handler.

/**
 * Base CORS configurations for different endpoint categories. Each
 * entry defines the allowed origins, methods and headers. Endpoints
 * may reuse one of these definitions or extend it as needed.
 */
export const CORS = {
  /**
   * Default CORS for public data endpoints (`GET` and `POST`).
   * Allows requests from any origin, permits GET/POST/OPTIONS and
   * restricts allowed headers to `Content-Type`. Security headers
   * prevent MIME sniffing and set a conservative referrer policy.
   */
  data: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  },
  /**
   * CORS configuration for login endpoints. Similar to data
   * endpoints but only allows POST/OPTIONS. We intentionally
   * restrict allowed methods to reduce attack surface.
   */
  login: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  },
  /**
   * CORS configuration for admin endpoints. In addition to
   * `Content-Type`, the `Authorization` header is allowed because
   * Bearer tokens are required for admin actions. Methods must be
   * specified explicitly by each endpoint. This object defines
   * headers only; endpoints should set `Access-Control-Allow-Methods`
   * based on their own supported verbs.
   */
  adminBase: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  }
};

/**
 * Construct a JSON Response object with the provided data and
 * status. Automatically stringifies objects and sets the
 * `Content-Type` header to JSON with UTF‑8. CORS headers are
 * included via the `cors` parameter. Additional headers may be
 * supplied to override or extend defaults.
 *
 * @param {any} data Data or string to serialize
 * @param {number} status HTTP status code
 * @param {Object} cors Base CORS headers
 * @param {Object} [additional] Additional headers to merge
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, cors = {}, additional = {}) {
  const body = (typeof data === 'string' || data instanceof String)
    ? data
    : JSON.stringify(data);
  return new Response(body, {
    status,
    headers: {
      ...cors,
      ...additional,
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

/**
 * Return a simple preflight response for OPTIONS requests. If the
 * method is not OPTIONS this returns null. This helper enables
 * early exit for CORS preflight checks without executing the
 * remainder of the endpoint logic.
 *
 * @param {Request} request
 * @param {Object} cors
 * @returns {Response|null}
 */
export function preflight(request, cors) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }
  return null;
}

/**
 * Validate that the request method is one of the allowed methods.
 * Returns a Response with status 405 if the method is not allowed;
 * otherwise returns null so the caller can continue execution.
 *
 * @param {Request} request
 * @param {string[]} allowed Allowed HTTP methods (uppercase)
 * @param {Object} cors
 * @returns {Response|null}
 */
export function checkAllowed(request, allowed, cors) {
  const method = request.method.toUpperCase();
  if (!allowed.includes(method)) {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, cors);
  }
  return null;
}

/**
 * Parse the JSON body of a request. Returns a tuple of [data,
 * error]. On success `data` contains the parsed object and
 * `error` is null. On failure `data` is null and `error` contains
 * the thrown exception. This helper avoids duplicating try/catch
 * blocks across endpoints.
 *
 * @param {Request} request
 * @returns {Promise<[any, any]>}
 */
export async function parseJSONBody(request) {
  try {
    const body = await request.json();
    return [body, null];
  } catch (e) {
    return [null, e];
  }
}

/**
 * Extract the Bearer token from the Authorization header of a
 * request. If the header is missing or does not contain a Bearer
 * token, an empty string is returned.
 *
 * @param {Request} request
 * @returns {string}
 */
export function getBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

/**
 * Perform admin authentication by comparing the provided bearer
 * token against the configured admin token in the environment. If
 * authentication fails, returns a 401 response. Otherwise returns
 * null allowing execution to continue. Use this in admin
 * endpoints to reduce duplicate code.
 *
 * @param {any} env Cloudflare environment object
 * @param {Request} request
 * @param {Object} cors
 * @returns {Response|null}
 */
/**
 * Perform admin authentication.  This helper accepts the standard
 * Bearer token in the Authorization header as well as a secret
 * phrase/password combination supplied via JSON body or query
 * parameters.  If any of the provided credentials match the
 * configured environment variables the request is authorized.
 *
 * On failure a 401 Response is returned; otherwise null is
 * returned allowing the caller to proceed.
 *
 * The optional `body` parameter should contain the parsed JSON
 * object from the request (for POST requests).  If omitted the
 * function will attempt to extract phrase/password from the URL
 * query string.  The password may be supplied under the keys
 * "password" or "pin" to support legacy callers.  Additionally,
 * some clients send the same value for phrase and password; in
 * this case we treat the password equal to the phrase as valid.
 *
 * @param {any} env Cloudflare environment
 * @param {Request} request Incoming Request
 * @param {Object} cors Base CORS headers
 * @param {Object|null} [body] Parsed JSON body (optional)
 * @returns {Response|null}
 */
export function requireAdmin(env, request, cors, body = null) {
  const adminToken = String(env.ERP_ADMIN_TOKEN || '').trim();
  const bearer = getBearerToken(request);
  // Check Bearer token first
  if (adminToken && bearer === adminToken) return null;
  // Attempt to extract phrase and password from body or query
  let phrase = '';
  let pwd = '';
  try {
    if (body && typeof body === 'object') {
      phrase = String(body.phrase || '').trim().toLowerCase();
      pwd = String(body.password || body.pin || '').trim();
    }
    // If phrase/pwd still empty, try reading from query
    if (!phrase || !pwd) {
      const url = new URL(request.url);
      if (!phrase) {
        phrase = String(url.searchParams.get('phrase') || '').trim().toLowerCase();
      }
      if (!pwd) {
        pwd = String(url.searchParams.get('password') || url.searchParams.get('pin') || '').trim();
      }
    }
  } catch (_) {
    // ignore parse failures
  }
  const envPhrase = String(env.ERP_ADMIN_PHRASE || '').trim().toLowerCase();
  const envPin = String(env.ERP_ADMIN_PIN || '').trim();
  // If phrase matches configured phrase and password matches either the
  // configured pin or the phrase itself (to support legacy clients
  // sending the phrase in both fields), authorize.
  const phraseOk = phrase && envPhrase && phrase === envPhrase;
  const pwdOk = pwd && ((envPin && pwd === envPin) || (envPhrase && pwd.toLowerCase() === envPhrase));
  if (phraseOk && pwdOk) return null;
  return jsonResponse({ ok: false, error: 'unauthorized', message: 'Admin token inválido.' }, 401, cors);
}

/**
 * Retrieve the client IP address from the request headers. This
 * helper checks the `CF-Connecting-IP` header (Cloudflare) and
 * falls back to `X-Forwarded-For`. Returns an empty string if no
 * header is present. Do not rely on this value for security in
 * untrusted environments.
 *
 * @param {Request} request
 * @returns {string}
 */
export function getClientIP(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    ''
  ).toString();
}

/**
 * Basic IP-based rate limiting. Each call increments a counter in
 * KV identified by a prefix and the client IP. If the counter
 * exceeds the provided limit, a Response with status 429 is
 * returned. When the counter does not exceed the limit, this
 * function updates the count and returns null. Expiration TTL is
 * fixed at 60 seconds to reset counts periodically. Errors in
 * accessing KV are ignored to avoid blocking the request.
 *
 * @param {any} env Cloudflare environment with KV namespace
 * @param {string} ip Client IP address
 * @param {string} prefix Rate limit key prefix (e.g. 'rate:login')
 * @param {number} limit Maximum allowed requests per window
 * @param {Object} cors
 * @returns {Promise<Response|null>}
 */
export async function rateLimit(env, ip, prefix, limit, cors) {
  try {
    if (!env || !env.ERP_SYNC || !ip) return null;
    const key = `${prefix}:${ip}`;
    const countRaw = await env.ERP_SYNC.get(key);
    const count = parseInt(countRaw || '0', 10) || 0;
    if (count >= limit) {
      return jsonResponse(
        { ok: false, error: 'rate_limited', message: 'Muitas tentativas. Tente novamente mais tarde.' },
        429,
        cors
      );
    }
    await env.ERP_SYNC.put(key, String(count + 1), { expirationTtl: 60 });
  } catch (_) {
    // ignore rate limiting failures
  }
  return null;
}