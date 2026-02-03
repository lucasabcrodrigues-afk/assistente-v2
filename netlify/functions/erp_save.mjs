// netlify/functions/erp_save.mjs
import { getStore } from "@netlify/blobs";

function json(res, status = 200, headers = {}) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function unauthorized() {
  return json({ ok: false, error: "unauthorized" }, 401);
}

function tooLarge(maxBytes) {
  return json({ ok: false, error: "payload_too_large", maxBytes }, 413);
}

function badRequest(msg) {
  return json({ ok: false, error: "bad_request", message: msg }, 400);
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const token = request.headers.get("x-erp-token") || "";
  const expected = process.env.ERP_ADMIN_TOKEN || "";
  if (!expected || token !== expected) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return badRequest("JSON inválido no body.");
  }

  const key = String(body?.key || "erp_db_v1").trim();
  const db = body?.db;
  if (!key) return badRequest("Chave (key) vazia.");
  if (typeof db !== "object" || db === null) return badRequest("Campo db deve ser um objeto JSON.");

  // Size guard (approx by JSON length)
  const raw = JSON.stringify({ db, meta: body?.meta || null });
  const maxBytes = 900_000; // keep below typical function payload limits
  if (raw.length > maxBytes) return tooLarge(maxBytes);

  const store = getStore("erp-sync", { consistency: "strong" });
  const meta = body?.meta || { savedAt: new Date().toISOString() };
  const payload = { db, meta, savedAt: new Date().toISOString(), bytes: raw.length };

  await store.setJSON(key, payload);

  return json({ ok: true, key, savedAt: payload.savedAt, bytes: payload.bytes });
}
