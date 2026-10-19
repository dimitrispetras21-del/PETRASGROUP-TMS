// GET /costs/rt driver_id / trailer_id (19/10/2026). The driver and trailer cards
// read every trip (limit 200, newest first, across all drivers) and filtered in the
// browser, so past 200 trips a card lost its older trips and its per-truck counts.
// Contract under test — against worker/src/index.js itself, PostgREST stubbed via fetch
// (same harness as costs-lines-paging.test.mjs):
//   ?driver_id=<int> / ?trailer_id=<int> → eq filter on ct_round_trips, limit still 200
//   a non-integer value → 400, before any DB call
//   no parameter → no driver/trailer filter (unchanged)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');

// The bundle imports @cloudflare/puppeteer (PDF rendering, unrelated here).
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function call(role, pathAndQuery) {
  const req = new Request(`https://w.invalid${pathAndQuery}`, { method: 'GET', headers: { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}` } });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// Three trips over two drivers and two trailers; the stub applies eq filters,
// so a Worker that forgets to send one returns the other driver's trip too.
const TRIPS = [
  { id: 1, driver_id: 7, trailer_id: 30, truck_id: 50, date_start: '2026-10-15' },
  { id: 2, driver_id: 8, trailer_id: 31, truck_id: 51, date_start: '2026-10-14' },
  { id: 3, driver_id: 7, trailer_id: 31, truck_id: 50, date_start: '2026-10-13' },
];
// Legs: order 100 sits on trip 1 (with 102), order 101 on trip 3.
const LEGS = [
  { id: 11, rt_id: 1, order_id: 100, direction: 'Export', seq: 1 },
  { id: 12, rt_id: 1, order_id: 102, direction: 'Import', seq: 2 },
  { id: 13, rt_id: 3, order_id: 101, direction: 'Export', seq: 1 },
];
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
let calls;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ method, table, params: u.searchParams });
    if (method === 'GET' && table === 'ct_round_trips') {
      let rows = TRIPS.slice();
      for (const col of ['driver_id', 'trailer_id', 'truck_id']) {
        const f = u.searchParams.get(col);
        if (f) rows = rows.filter((r) => String(r[col]) === f.replace(/^eq\./, ''));
      }
      const idIn = u.searchParams.get('id');
      if (idIn) { const set = idIn.replace(/^in\.\(|\)$/g, '').split(','); rows = rows.filter((r) => set.includes(String(r.id))); }
      return json(rows.map((r) => ({ ...r, ct_rt_legs: LEGS.filter((l) => l.rt_id === r.id) })));
    }
    if (method === 'GET' && table === 'ct_rt_legs') {
      const set = (u.searchParams.get('order_id') || '').replace(/^in\.\(|\)$/g, '').split(',');
      return json(LEGS.filter((l) => set.includes(String(l.order_id))).map((l) => ({ rt_id: l.rt_id })));
    }
    if (method === 'GET' && table === 'dl_v_rt_route') return json([]);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });

const rtCall = () => calls.find((c) => c.table === 'ct_round_trips');

test('driver_id filters the trips in the database, limit stays 200', async () => {
  const r = await call('owner', '/costs/rt?driver_id=7');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.records.map((x) => x.id), [1, 3]);
  assert.equal(rtCall().params.get('driver_id'), 'eq.7');
  assert.equal(rtCall().params.get('limit'), '200');
});

test('trailer_id filters the trips in the database', async () => {
  const r = await call('owner', '/costs/rt?trailer_id=31');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.records.map((x) => x.id), [2, 3]);
  assert.equal(rtCall().params.get('trailer_id'), 'eq.31');
});

test('a non-integer driver_id or trailer_id is a 400 before any DB call', async () => {
  for (const q of ['driver_id=7,8', 'trailer_id=abc', 'driver_id=', 'driver_id=1)']) {
    calls = [];
    const r = await call('owner', `/costs/rt?${q}`);
    assert.equal(r.status, 400, `${q}: ${r.text}`);
    assert.equal(calls.length, 0, `${q}: no DB call`);
  }
});

test('no parameter: no driver or trailer filter (unchanged)', async () => {
  const r = await call('owner', '/costs/rt');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.records.length, 3);
  assert.equal(rtCall().params.get('driver_id'), null);
  assert.equal(rtCall().params.get('trailer_id'), null);
});

test('order_ids: only the trips holding those orders, each with ALL its legs', async () => {
  const r = await call('owner', '/costs/rt?order_ids=100');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.records.map((x) => x.id), [1]);
  assert.deepEqual(r.json.records[0].ct_rt_legs.map((l) => l.order_id), [100, 102], 'the trip keeps its other leg');
  const r2 = await call('owner', '/costs/rt?order_ids=100,101');
  assert.deepEqual(r2.json.records.map((x) => x.id).sort(), [1, 3]);
});

test('order_ids with no trip: empty, and no ct_round_trips read', async () => {
  const r = await call('owner', '/costs/rt?order_ids=999');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.records, []);
  assert.equal(calls.filter((c) => c.table === 'ct_round_trips').length, 0);
});

test('a malformed order_ids is a 400 before any DB call', async () => {
  for (const q of ['order_ids=', 'order_ids=1,,2', 'order_ids=1)', 'order_ids=a', 'order_ids=' + Array.from({ length: 51 }, (_, i) => i + 1).join(',')]) {
    calls = [];
    const r = await call('owner', `/costs/rt?${q}`);
    assert.equal(r.status, 400, `${q.slice(0, 30)}: ${r.text}`);
    assert.equal(calls.length, 0, `${q.slice(0, 30)}: no DB call`);
  }
});
