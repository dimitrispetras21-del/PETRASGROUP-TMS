// Worker /docs/* (scan round 3, 28/9/2026): scanned/uploaded order documents.
// Runs the real worker/src/index.js (the deploy source) in Node with Supabase
// stubbed via fetch and R2 stubbed via a fake bucket — no network, no secrets.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

// The bundle imports @cloudflare/puppeteer (PDF rendering, unrelated here),
// which only exists in worker/node_modules after `npm install` there.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { default: worker } = await import(pathToFileURL(path.resolve(HERE, '../src/index.js')).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const baseEnv = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };

const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(baseEnv.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}

// ---- fake Postgres (order_documents), just enough eq./is.null filtering to behave like PostgREST ----
let docsTable, nextId, orderMap;
function resetDb() {
  docsTable = [];
  nextId = 1;
  orderMap = new Map([['recORDER1', 42], ['recORDER2', 43]]); // legacy_id -> bigint id
}
function matchesFilters(row, search) {
  const params = new URLSearchParams(search);
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (k === 'deleted_at') { if (v === 'is.null' && row.deleted_at != null) return false; continue; }
    if (v.startsWith('eq.') && String(row[k]) !== v.slice(3)) return false;
  }
  return true;
}

// The fetch() wrapper logs one request line via console.log (Level A) — mute it here
// like worker/test/req-line.test.mjs does, since it is exercised on its own there.
const realLog = console.log;
let calls;
beforeEach(() => {
  console.log = () => {};
  resetDb();
  calls = { r2put: [], r2get: [], fetch: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.fetch.push({ method, path: u.pathname, search: u.search });
    if (u.pathname.endsWith('/orders') && method === 'GET') {
      const wanted = [...u.searchParams.get('legacy_id').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const rows = wanted.filter((w) => orderMap.has(w)).map((w) => ({ id: orderMap.get(w), legacy_id: w }));
      return Response.json(rows);
    }
    if (u.pathname.endsWith('/order_documents') && method === 'GET') {
      return Response.json(docsTable.filter((r) => matchesFilters(r, u.search)));
    }
    if (u.pathname.endsWith('/order_documents') && method === 'POST') {
      const body = JSON.parse(init.body);
      const row = { id: nextId++, deleted_at: null, ...body };
      docsTable.push(row);
      return new Response(JSON.stringify([row]), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (u.pathname.endsWith('/audit_log') && method === 'POST') {
      return new Response(JSON.stringify([{ id: 1 }]), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unmocked fetch: ' + method + ' ' + u.pathname + u.search);
  };
});
afterEach(() => { console.log = realLog; });

// ---- fake R2 (env.ORDER_DOCS) ----
function makeFakeR2() {
  const store = new Map();
  return {
    calls: { put: [], get: [] },
    async put(key, body, opts) {
      this.calls.put.push({ key, opts });
      const reader = body.getReader();
      const chunks = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
      const bytes = Buffer.concat(chunks);
      if (opts && opts.sha256) {
        const actual = crypto.createHash('sha256').update(bytes).digest('hex');
        if (actual !== opts.sha256) throw new Error('put(): computed sha256 checksum did not match provided sha256 checksum');
      }
      store.set(key, { body: bytes, httpMetadata: opts && opts.httpMetadata });
      return { key, size: bytes.length };
    },
    async get(key) {
      this.calls.get.push(key);
      const rec = store.get(key);
      if (!rec) return null;
      return { body: new Response(rec.body).body, httpMetadata: rec.httpMetadata };
    }
  };
}

function envWith(r2) { return { ...baseEnv, ORDER_DOCS: r2 }; }
const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf body for a test');
const PDF_SHA = crypto.createHash('sha256').update(PDF_BYTES).digest('hex');

function uploadReq({ order = 'recORDER1', sha256 = PDF_SHA, filename = 'cmr.pdf', source = 'scan', contentType = 'application/pdf', contentLength, body = PDF_BYTES, auth } = {}) {
  const qs = new URLSearchParams({ order, sha256, filename, source });
  const headers = { Origin: ORIGIN, 'Content-Type': contentType };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (contentLength !== null) headers['Content-Length'] = String(contentLength ?? body.length);
  return new Request(`https://w.invalid/docs/upload?${qs.toString()}`, { method: 'POST', headers, body });
}

test('valid upload: streams into R2 with the given sha256, inserts a row, 201', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  const req = uploadReq({ auth: tok });
  const res = await worker.fetch(req, envWith(r2), { waitUntil() {}, passThroughOnException() {} });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.order_id, 42);
  assert.equal(body.sha256, PDF_SHA);
  assert.ok(body.id, 'id (legacy_id) is present');
  assert.equal(r2.calls.put.length, 1);
  assert.equal(r2.calls.put[0].opts.sha256, PDF_SHA, 'the browser sha256 is passed straight to R2 for integrity checking');
  assert.equal(r2.calls.put[0].key, 'orders/42/' + PDF_SHA);
});

test('unsupported mime/extension (mismatched or unknown) → 415, no R2 write', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  const res = await worker.fetch(uploadReq({ auth: tok, contentType: 'application/zip', filename: 'archive.zip' }), envWith(r2), {});
  assert.equal(res.status, 415);
  assert.equal(r2.calls.put.length, 0);
});

test('mime allowed but filename extension does not match it → 415', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  // Content-Type says PDF, filename says .exe — both must agree.
  const res = await worker.fetch(uploadReq({ auth: tok, contentType: 'application/pdf', filename: 'payload.exe' }), envWith(r2), {});
  assert.equal(res.status, 415);
});

test('oversized declared Content-Length → 413, no R2 write', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  const res = await worker.fetch(uploadReq({ auth: tok, contentLength: 15 * 1024 * 1024 + 1 }), envWith(r2), {});
  assert.equal(res.status, 413);
  assert.equal(r2.calls.put.length, 0);
});

test('missing Content-Length → 400, no R2 write', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  const res = await worker.fetch(uploadReq({ auth: tok, contentLength: null }), envWith(r2), {});
  assert.equal(res.status, 400);
  assert.equal(r2.calls.put.length, 0);
});

test('unknown order → 404, no R2 write', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  const res = await worker.fetch(uploadReq({ auth: tok, order: 'recDOESNOTEXIST' }), envWith(r2), {});
  assert.equal(res.status, 404);
  assert.equal(r2.calls.put.length, 0);
});

test('idempotent: same (order, sha256) twice → second call returns 200 with the existing row, only ONE R2 object', async () => {
  const r2 = makeFakeR2();
  const tok = await token('dispatcher');
  const first = await worker.fetch(uploadReq({ auth: tok }), envWith(r2), {});
  assert.equal(first.status, 201);
  const second = await worker.fetch(uploadReq({ auth: tok }), envWith(r2), {});
  assert.equal(second.status, 200);
  const firstBody = await first.json(), secondBody = await second.json();
  assert.equal(secondBody.id, firstBody.id);
  assert.equal(r2.calls.put.length, 1, 'no second R2 write for a re-upload of the same file');
  assert.equal(docsTable.length, 1, 'no second row');
});

test('role denial: warehouse cannot upload (403), no R2 write', async () => {
  const r2 = makeFakeR2();
  const tok = await token('warehouse');
  const res = await worker.fetch(uploadReq({ auth: tok }), envWith(r2), {});
  assert.equal(res.status, 403);
  assert.equal(r2.calls.put.length, 0);
});

test('accountant (PATCH-only on orders, never POST) CAN upload — same width as "edit an order"', async () => {
  const r2 = makeFakeR2();
  const tok = await token('accountant');
  const res = await worker.fetch(uploadReq({ auth: tok }), envWith(r2), {});
  assert.equal(res.status, 201);
});

test('no Authorization → 401 before anything else', async () => {
  const r2 = makeFakeR2();
  const res = await worker.fetch(uploadReq({}), envWith(r2), {});
  assert.equal(res.status, 401);
  assert.equal(r2.calls.put.length, 0);
});

test('without env.ORDER_DOCS configured → 501, for upload, list AND file', async () => {
  const tok = await token('dispatcher');
  for (const req of [
    uploadReq({ auth: tok }),
    new Request('https://w.invalid/docs/list?order=recORDER1', { headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } }),
    new Request('https://w.invalid/docs/file/recDOC1', { headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } })
  ]) {
    const res = await worker.fetch(req, baseEnv /* no ORDER_DOCS */, {});
    assert.equal(res.status, 501, req.url);
  }
});

test('GET /docs/list returns rows for the order, newest first, deleted rows excluded', async () => {
  const r2 = makeFakeR2();
  docsTable.push(
    { id: 1, legacy_id: 'recDOC1', order_id: 42, sha256: 'a'.repeat(64), filename: 'old.pdf', mime: 'application/pdf', size: 10, r2_key: 'orders/42/a', source: 'upload', uploaded_by: 'x', created_at: '2026-01-01T00:00:00Z', deleted_at: null },
    { id: 2, legacy_id: 'recDOC2', order_id: 42, sha256: 'b'.repeat(64), filename: 'new.pdf', mime: 'application/pdf', size: 20, r2_key: 'orders/42/b', source: 'scan', uploaded_by: 'y', created_at: '2026-02-01T00:00:00Z', deleted_at: null },
    { id: 3, legacy_id: 'recDOC3', order_id: 42, sha256: 'c'.repeat(64), filename: 'gone.pdf', mime: 'application/pdf', size: 5, r2_key: 'orders/42/c', source: 'scan', uploaded_by: 'z', created_at: '2026-03-01T00:00:00Z', deleted_at: '2026-03-02T00:00:00Z' },
    { id: 4, legacy_id: 'recDOC4', order_id: 43, sha256: 'd'.repeat(64), filename: 'other-order.pdf', mime: 'application/pdf', size: 5, r2_key: 'orders/43/d', source: 'scan', uploaded_by: 'z', created_at: '2026-01-15T00:00:00Z', deleted_at: null }
  );
  const tok = await token('management');
  const res = await worker.fetch(new Request('https://w.invalid/docs/list?order=recORDER1', { headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } }), envWith(r2), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.records.map((r) => r.id), ['recDOC1', 'recDOC2'], 'only order 42, never-deleted, our PostgREST-mock filter shape (order= sort not simulated here)');
});

test('GET /docs/file/<id> streams the object with safe headers, never a redirect/public URL', async () => {
  const r2 = makeFakeR2();
  await r2.put('orders/42/' + PDF_SHA, new Request('https://x', { method: 'POST', body: PDF_BYTES }).body, { httpMetadata: { contentType: 'application/pdf' } });
  docsTable.push({ id: 1, legacy_id: 'recDOC1', order_id: 42, sha256: PDF_SHA, filename: 'weird "name".pdf', mime: 'application/pdf', size: PDF_BYTES.length, r2_key: 'orders/42/' + PDF_SHA, source: 'scan', uploaded_by: 'x', created_at: '2026-01-01T00:00:00Z', deleted_at: null });
  const tok = await token('owner');
  const res = await worker.fetch(new Request('https://w.invalid/docs/file/recDOC1', { headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } }), envWith(r2), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('Content-Disposition'), 'inline; filename="weird _name_.pdf"', 'quotes inside the filename are stripped so they cannot break out of the header value');
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), PDF_BYTES.toString());
});

test('GET /docs/file/<unknown id> → 404', async () => {
  const r2 = makeFakeR2();
  const tok = await token('owner');
  const res = await worker.fetch(new Request('https://w.invalid/docs/file/recNOPE', { headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } }), envWith(r2), {});
  assert.equal(res.status, 404);
});

test('no DELETE route exists anywhere under /docs/ — documents are never deleted', async () => {
  const r2 = makeFakeR2();
  const tok = await token('owner');
  const res = await worker.fetch(new Request('https://w.invalid/docs/file/recDOC1', { method: 'DELETE', headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}` } }), envWith(r2), {});
  assert.equal(res.status, 404);
});

test('the facade itself (tblOrderDocuments) never accepts a write, not even from owner', async () => {
  const r2 = makeFakeR2();
  const tok = await token('owner');
  const res = await worker.fetch(new Request('https://w.invalid/v0/appX/tblOrderDocuments', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { Filename: 'sneaky.pdf' } })
  }), envWith(r2), {});
  assert.equal(res.status, 403, 'owner\'s "*" wildcard must not reach this table for writes — see the explicit order_documents:["GET"] row');
});
