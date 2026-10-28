// GET /pallets/movements returns every matching row (owner 28/10, Alexia's requests). It used to be one read of
// «limit 300»: at 291 movements and ~8 a day the oldest rows would have left the ledger in silence. Now it reads
// pages of 999 + 1 probe row (PostgREST db-max-rows is 1000), and past 9 990 rows it says truncated, never a quiet
// cut. The fake PostgREST below honours limit/offset and caps every answer at 1000 rows, like the real one.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(path.resolve(HERE, '../src/index.js')).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role) {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub: 'tester', role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function get(q = '') {
  const res = await worker.fetch(new Request(`https://w.invalid/pallets/movements${q}`, { headers: { Origin: ORIGIN,
    Authorization: `Bearer ${await token('accountant')}` } }), env, { waitUntil() {} });
  return { status: res.status, json: await res.json() };
}

const MAX_ROWS = 1000; // PostgREST db-max-rows
let table; let calls; let legCalls;
const realFetch = globalThis.fetch;
const realConsole = { error: console.error };
beforeEach(() => {
  console.error = () => {};
  calls = []; legCalls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const name = u.pathname.replace(/^\/rest\/v1\//, '');
    if (name === 'piece_legs') {
      const ids = u.searchParams.get('id').replace(/^in\.\(|\)$/g, '').split(',').map(Number);
      legCalls.push(ids.length);
      return new Response(JSON.stringify(ids.map((id) => ({ id, shipment_pieces: { shipments: { nat_order_id: 900 + (id % 7) } } }))));
    }
    assert.equal(name, 'pl_movements');
    calls.push(Object.fromEntries(u.searchParams));
    const off = Number(u.searchParams.get('offset') || 0);
    const lim = Math.min(Number(u.searchParams.get('limit') || MAX_ROWS), MAX_ROWS);
    let rows = table;
    const cid = u.searchParams.get('client_id');
    if (cid) rows = rows.filter((r) => `eq.${r.client_id}` === cid);
    return new Response(JSON.stringify(rows.slice(off, off + lim)));
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realConsole.error; });
const mk = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ id: n - i, client_id: 1 + (i % 3), movement_date: '2026-10-01', ...extra(i) }));

test('291 rows today: one read, all of them, truncated false, cap said', async () => {
  table = mk(291);
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.json.records.length, 291);
  assert.equal(r.json.truncated, false);
  assert.equal(r.json.cap, 9990);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, '1000');
  assert.equal(calls[0].order, 'movement_date.desc,id.desc');
});

test('past 300 and past one PostgREST page: every row, each once, in order', async () => {
  table = mk(2500);
  const r = await get();
  assert.equal(r.json.records.length, 2500);
  assert.equal(new Set(r.json.records.map((m) => m.id)).size, 2500);
  assert.deepEqual(r.json.records.map((m) => m.id), table.map((m) => m.id));
  assert.equal(r.json.truncated, false);
  assert.deepEqual(calls.map((c) => c.offset), [undefined, '999', '1998']);
});

test('exactly one full page (999): no second read, not truncated', async () => {
  table = mk(999);
  const r = await get();
  assert.equal(r.json.records.length, 999);
  assert.equal(r.json.truncated, false);
  assert.equal(calls.length, 1);
});

test('exactly at the cap (9 990): all rows, not truncated', async () => {
  table = mk(9990);
  const r = await get();
  assert.equal(r.json.records.length, 9990);
  assert.equal(r.json.truncated, false);
});

test('past the cap: 9 990 rows and truncated true, never a quiet cut', async () => {
  table = mk(10500);
  const r = await get();
  assert.equal(r.json.records.length, 9990);
  assert.equal(r.json.truncated, true);
  assert.equal(calls.length, 10);
});

test('filters ride on every page (client card)', async () => {
  table = mk(3000);
  const r = await get('?client_id=2');
  assert.equal(r.json.records.length, 1000);
  assert.ok(r.json.records.every((m) => m.client_id === 2));
  assert.ok(calls.every((c) => c.client_id === 'eq.2'));
});

test('national rows: legs read in chunks of 200, every row named', async () => {
  table = mk(450, (i) => ({ piece_leg_id: 5000 + i }));
  const r = await get();
  assert.deepEqual(legCalls, [200, 200, 50]);
  assert.ok(r.json.records.every((m) => m.nat_order_id != null && !m.nat_order_unknown));
});
