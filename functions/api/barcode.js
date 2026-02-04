// functions/api/barcode.js
//
// Barcode (EAN/GTIN/UPC) lookup endpoint.
// - GET /api/barcode?code=<digits>
// - Uses Cloudflare KV (ERP_SYNC) as cache.
// - Primary provider: Open Food Facts (free).
// - Returns normalized fields for ERP stock form.
//
// Response shape:
// { ok:true, found:true/false, code:"...", source:"openfoodfacts|cache", product:{ name, brand, category, image, description, quantity } }

import { CORS, jsonResponse, preflight, checkAllowed, rateLimit, getClientIP } from './_helpers.js';

const cors = {
  ...CORS.data,
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};


async function fetchJsonWithTimeout(url, { timeoutMs = 4500, headers = {}, retries = 1 } = {}) {
  // Cloudflare runtime supports AbortController.
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const js = await res.json().catch(() => null);
      clearTimeout(t);
      return { res, js };
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      // Only retry on network/timeout errors
      if (attempt < retries) continue;
    }
  }
  throw lastErr || new Error('network_error');
}

function cleanCode(code) {
  return String(code || '').trim().replace(/[^\d]/g, '');
}

function pickStr(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s;
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = pickStr(v);
    if (s) return s;
  }
  return '';
}

function normalizeFromOFF(code, offJson) {
  const p = offJson && offJson.product ? offJson.product : null;
  if (!p) return null;

  const name = firstNonEmpty(p.product_name, p.product_name_pt, p.product_name_pt_br, p.generic_name, p.abbreviated_product_name);
  const brand = firstNonEmpty(p.brands, p.brand_owner, p.brands_tags && p.brands_tags[0]);
  const category = firstNonEmpty(
    p.categories,
    p.categories_hierarchy && p.categories_hierarchy.slice(-1)[0],
    p.categories_tags && p.categories_tags.slice(-1)[0]
  );

  const image = firstNonEmpty(
    p.image_url,
    p.image_front_url,
    p.image_small_url,
    p.selected_images && p.selected_images.front && p.selected_images.front.display && p.selected_images.front.display.pt
  );

  const quantity = firstNonEmpty(p.quantity, p.product_quantity, p.serving_size);
  const ingredients = firstNonEmpty(p.ingredients_text, p.ingredients_text_pt, p.ingredients_text_pt_br);
  const description = firstNonEmpty(p.generic_name, ingredients, p.labels, p.packaging);

  const out = {
    code,
    name,
    brand,
    category,
    image,
    quantity,
    description,
  };

  // If name is still empty, consider as not found for UX (avoid filling junk).
  if (!out.name) return null;
  return out;
}

async function fetchOpenFoodFacts(code, env) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const ua = (env && env.BARCODE_USER_AGENT) ? String(env.BARCODE_USER_AGENT) : 'ERP-Stock/1.0 (Cloudflare Pages Functions)';
  const headers = {
    'accept': 'application/json',
    'user-agent': ua,
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6'
  };
  const { res, js } = await fetchJsonWithTimeout(url, { timeoutMs: 4500, headers, retries: 1 });
  if (!res.ok || !js) return { ok: false, error: 'provider_error', status: res.status };
  if (js.status !== 1) return { ok: true, found: false, raw: js };
  const norm = normalizeFromOFF(code, js);
  if (!norm) return { ok: true, found: false, raw: js };
  return { ok: true, found: true, product: norm, raw: js };
}

export async function onRequest(context) {
  const { request, env } = context;

  const pf = preflight(request, cors);
  if (pf) return pf;

  const notAllowed = checkAllowed(request, ['GET'], cors);
  if (notAllowed) return notAllowed;

  // Basic rate limit (per IP) to protect free providers
  const ip = getClientIP(request);
  const rl = await rateLimit(env, ip, 'rate:barcode', 60, cors); // 60 req/min/IP
  if (rl) return rl;

  const url = new URL(request.url);
  const codeRaw = url.searchParams.get('code') || url.searchParams.get('ean') || '';
  const code = cleanCode(codeRaw);

  if (!code || code.length < 6 || code.length > 18) {
    return jsonResponse({ ok: false, error: 'invalid_code' }, 400, cors);
  }

  const cacheKey = `barcode:${code}`;
  // Read cache first
  try {
    if (env && env.ERP_SYNC) {
      const cached = await env.ERP_SYNC.get(cacheKey, { type: 'json' });
      if (cached && cached.ok && cached.code === code) {
        return jsonResponse({ ...cached, source: 'cache' }, 200, cors, { 'Cache-Control': 'public, max-age=3600' });
      }
    }
  } catch (_) {
    // ignore cache read errors
  }

  // Provider lookup (Open Food Facts)
  let result = null;
  try {
    const off = await fetchOpenFoodFacts(code, env);
    if (!off.ok) {
      result = { ok: false, error: off.error || 'lookup_failed', provider: 'openfoodfacts' };
    } else if (!off.found) {
      result = { ok: true, found: false, code, source: 'openfoodfacts', product: null };
    } else {
      const p = off.product;
      result = {
        ok: true,
        found: true,
        code,
        source: 'openfoodfacts',
        product: {
          name: p.name,
          brand: p.brand,
          category: p.category,
          image: p.image,
          quantity: p.quantity,
          description: p.description,
        }
      };
    }
  } catch (e) {
    result = { ok: false, error: 'network_error', message: e?.message || String(e) };
  }

  // Store cache (only successful responses; cache misses too but shorter TTL)
  try {
    if (env && env.ERP_SYNC) {
      if (result && result.ok) {
        const ttl = result.found ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 3; // 30d for found, 3d for not found
        await env.ERP_SYNC.put(cacheKey, JSON.stringify({ ...result, source: 'openfoodfacts' }), { expirationTtl: ttl });
      }
    }
  } catch (_) {
    // ignore cache write errors
  }

  return jsonResponse(result, result && result.ok ? 200 : 502, cors, { 'Cache-Control': 'no-store' });
}
