// netlify/functions/erp_health.mjs
function json(res, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default async function handler(request) {
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, service: "erp_server_sync", at: new Date().toISOString() });
}
