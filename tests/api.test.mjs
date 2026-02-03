/*
 * Automated tests for ERP Cloudflare API modules.
 * These tests run in Node.js and simulate the Cloudflare Pages runtime by
 * providing a minimal KV implementation and Request objects.  They verify
 * security fixes such as admin authorization, rate limiting, and general
 * endpoint behaviour.  To execute the tests run:
 *    node project/tests/api.test.mjs
 */

import assert from 'assert';

import { onRequest as loginHandler } from '../functions/api/login.js';
import { onRequest as clientsHandler } from '../functions/api/admin/clients.js';
import { onRequest as deleteHandler } from '../functions/api/admin/delete.js';
import { onRequest as blockHandler } from '../functions/api/admin/block.js';
import { onRequest as verifyHandler } from '../functions/api/admin/verify.js';
import { onRequest as dataHandler } from '../functions/api/data.js';
import { onRequest as healthHandler } from '../functions/api/health.js';

// Simple in-memory KV store emulating Cloudflare's KV API.
class MemoryKV {
  constructor() {
    this.store = new Map();
  }
  async get(key, opts = {}) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    if (opts.type === 'json') {
      try {
        return JSON.parse(value);
      } catch (_) {
        return null;
      }
    }
    return value;
  }
  async put(key, value, opts = {}) {
    this.store.set(key, value);
  }
  async delete(key) {
    this.store.delete(key);
  }
}

function createEnv(overrides = {}) {
  return Object.assign(
    {
      ERP_SYNC: new MemoryKV(),
      ERP_ADMIN_TOKEN: 'secret',
      ERP_ADMIN_PHRASE: 'letmein',
      ERP_ADMIN_PIN: '1234'
    },
    overrides
  );
}

async function textResponse(res) {
  return await res.text();
}

async function jsonResponse(res) {
  return await res.json();
}

async function runTests() {
  // Test 1: admin endpoints should reject requests without Authorization
  {
    const env = createEnv();
    const req = new Request('https://example.com/api/admin/clients', { method: 'GET' });
    const res = await clientsHandler({ request: req, env });
    assert.strictEqual(res.status, 401, 'admin GET without token should return 401');
  }
  // Test 2: admin endpoints should accept requests with correct Authorization
  {
    const env = createEnv();
    const headers = new Headers({ Authorization: 'Bearer secret' });
    // create a client to ensure GET returns seeded list
    const reqGet = new Request('https://example.com/api/admin/clients', { method: 'GET', headers });
    const resGet = await clientsHandler({ request: reqGet, env });
    assert.strictEqual(resGet.status, 200, 'admin GET with token should succeed');
    const body = await jsonResponse(resGet);
    assert.ok(Array.isArray(body.clients), 'clients should be an array');
    // POST new client
    const postReq = new Request('https://example.com/api/admin/clients', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json', Authorization: 'Bearer secret' }),
      body: JSON.stringify({ token: 't1', user: 'u1', pass: 'p1' })
    });
    const postRes = await clientsHandler({ request: postReq, env });
    assert.strictEqual(postRes.status, 200, 'admin POST should succeed');
    const { ok: postOk } = await jsonResponse(postRes);
    assert.ok(postOk, 'admin POST ok flag true');
  }
  // Test 3: delete client with proper Authorization
  {
    const env = createEnv();
    const headers = new Headers({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' });
    // Seed client
    await env.ERP_SYNC.put('client:c1', JSON.stringify({ token: 'c1', user: 'user1', pass: 'p' }));
    await env.ERP_SYNC.put('user:user1', JSON.stringify({ token: 'c1', user: 'user1', pass: 'p' }));
    await env.ERP_SYNC.put('clients:index', JSON.stringify(['c1']));
    const req = new Request('https://example.com/api/admin/delete', { method: 'POST', headers, body: JSON.stringify({ token: 'c1' }) });
    const res = await deleteHandler({ request: req, env });
    assert.strictEqual(res.status, 200, 'admin delete should succeed');
    const data = await jsonResponse(res);
    assert.ok(data.ok);
    // ensure deletion
    const client = await env.ERP_SYNC.get('client:c1');
    assert.strictEqual(client, null);
  }
  // Test 4: block/unblock client
  {
    const env = createEnv();
    const headers = new Headers({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' });
    await env.ERP_SYNC.put('client:c2', JSON.stringify({ token: 'c2', user: 'user2', pass: 'p', blocked: false }));
    await env.ERP_SYNC.put('user:user2', JSON.stringify({ token: 'c2', user: 'user2', pass: 'p', blocked: false }));
    const blockReq = new Request('https://example.com/api/admin/block', { method: 'POST', headers, body: JSON.stringify({ token: 'c2', blocked: true }) });
    const resBlock = await blockHandler({ request: blockReq, env });
    assert.strictEqual(resBlock.status, 200);
    const rec = await env.ERP_SYNC.get('client:c2', { type: 'json' });
    assert.ok(rec.blocked === true);
  }
  // Test 5: login rate limiting
  {
    const env = createEnv();
    const ip = '1.2.3.4';
    // Add a user record
    await env.ERP_SYNC.put('user:test', JSON.stringify({ token: 'tok', pass: 'pass', blocked: false }));
    const headers = new Headers({ 'Content-Type': 'application/json', 'CF-Connecting-IP': ip });
    // Make 20 successful invalid attempts then expect 21st to be rate limited
    for (let i = 0; i < 20; i++) {
      const req = new Request('https://example.com/api/login', { method: 'POST', headers, body: JSON.stringify({ user: 'invalid', pass: 'wrong' }) });
      await loginHandler({ request: req, env });
    }
    const reqLimit = new Request('https://example.com/api/login', { method: 'POST', headers, body: JSON.stringify({ user: 'invalid', pass: 'wrong' }) });
    const resLimit = await loginHandler({ request: reqLimit, env });
    assert.strictEqual(resLimit.status, 429, '21st login attempt should be rate limited');
  }
  // Test 6: verify endpoint rate limiting
  {
    const env = createEnv();
    const ip = '5.6.7.8';
    const headers = new Headers({ 'Content-Type': 'application/json', 'CF-Connecting-IP': ip });
    for (let i = 0; i < 20; i++) {
      const req = new Request('https://example.com/api/admin/verify', { method: 'POST', headers, body: JSON.stringify({ phrase: 'bad', password: 'bad' }) });
      await verifyHandler({ request: req, env });
    }
    const reqLimit = new Request('https://example.com/api/admin/verify', { method: 'POST', headers, body: JSON.stringify({ phrase: 'bad', password: 'bad' }) });
    const resLimit = await verifyHandler({ request: reqLimit, env });
    assert.strictEqual(resLimit.status, 429, '21st verify attempt should be rate limited');
  }
  // Test 7: health endpoint
  {
    const env = createEnv();
    const req = new Request('https://example.com/api/health', { method: 'GET' });
    const res = await healthHandler({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await jsonResponse(res);
    assert.ok(body.ok);
    assert.strictEqual(body.kv, 'available');
  }
  console.log('All API tests passed successfully');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});