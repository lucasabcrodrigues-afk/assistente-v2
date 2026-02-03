// netlify/functions/erp_load.mjs
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

export default async function handler(request) {
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);

  const token = request.headers.get("x-erp-token") || "";
  const expected = process.env.ERP_ADMIN_TOKEN || "";
  if (!expected || token !== expected) return unauthorized();

  const url = new URL(request.url);
  const key = String(url.searchParams.get("key") || "erp_db_v1").trim();

  const store = getStore("erp-sync", { consistency: "strong" });
  const payload = await store.get(key, { type: "json" });

  if (!payload) return json({ ok: false, error: "not_found" }, 404);

  return json({ ok: true, key, db: payload.db, meta: payload.meta || null, savedAt: payload.savedAt || null, bytes: payload.bytes || null });
}
