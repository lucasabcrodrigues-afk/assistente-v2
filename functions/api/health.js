// functions/api/health.js
// Health check endpoint for ERP Cloudflare.
// This endpoint verifies connectivity with the KV namespace and returns a basic status object.
// It can be used for monitoring the application at runtime. When the KV store is reachable
// the response will include kv: "available"; otherwise kv will report "unavailable" or "error".

export async function onRequest(context) {
  const { env } = context;
  const status = { ok: true, kv: null };
  try {
    const testKey = `health:${Date.now()}`;
    // Attempt to write and read a temporary key with a short TTL.
    await env.ERP_SYNC.put(testKey, '1', { expirationTtl: 60 });
    const val = await env.ERP_SYNC.get(testKey);
    status.kv = val === '1' ? 'available' : 'unavailable';
  } catch (e) {
    status.ok = false;
    status.kv = 'error';
  }
  return new Response(
    JSON.stringify(status),
    {
      status: status.ok ? 200 : 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin'
      }
    }
  );
}