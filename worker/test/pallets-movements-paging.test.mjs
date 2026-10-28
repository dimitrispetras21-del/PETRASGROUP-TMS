// GET /pallets/movements returns every matching row (owner 28/10, Alexia's requests). It used to be one read of
// «limit 300»: at 291 movements and ~8 a day the oldest rows would have left the ledger in silence. Now it reads
// keyset pages of 999 with the exact count on the first, and past 9 990 rows it says truncated, never a quiet cut.
// The fake PostgREST below honours limit, the keyset «or», Prefer: count=exact (Content-Range) and db-max-rows.
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

let MAX_ROWS; // PostgREST db-max-rows
let table; let calls; let legCalls; let onPage;
const realFetch = globalThis.fetch;
const realConsole = { error: console.error };
// order movement_date.desc,id.desc; keyset «or=(movement_date.lt.D,and(movement_date.eq.D,id.lt.I))»
const before = (r, d, i) => r.movement_date < d || (r.movement_date === d && r.id < i);
const sorted = () => table.slice().sort((a, b) => (a.movement_date === b.movement_date ? b.id - a.id : (a.movement_date < b.movement_date ? 1 : -1)));
beforeEach(() => {
  console.error = () => {};
  calls = []; legCalls = []; onPage = null; MAX_ROWS = 1000;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const name = u.pathname.replace(/^\/rest\/v1\//, '');
    if (name === 'piece_legs') {
      const ids = u.searchParams.get('id').replace(/^in\.\(|\)$/g, '').split(',').map(Number);
      legCalls.push(ids.length);
      return new Response(JSON.stringify(ids.map((id) => ({ id, shipment_pieces: { shipments: { nat_order_id: 900 + (id % 7) } } }))));
    }
    assert.equal(name, 'pl_movements');
    const sp = u.searchParams;
    calls.push({ ...Object.fromEntries(sp), prefer: (init.headers || {}).Prefer });
    if (onPage) onPage(calls.length);
    let rows = sorted();
    const cid = sp.get('client_id');
    if (cid) rows = rows.filter((r) => `eq.${r.client_id}` === cid);
    const all = rows.length;
    const or = sp.get('or');
    if (or) {
      const m = or.match(/^\(movement_date\.lt\.([\d-]+),and\(movement_date\.eq\.([\d-]+),id\.lt\.(\d+)\)\)$/);
      assert.ok(m && m[1] === m[2], 'keyset or: ' + or);
      rows = rows.filter((r) => before(r, m[1], Number(m[3])));
    }
    assert.equal(sp.get('offset'), null, 'no offset paging');
    const out = rows.slice(0, Math.min(Number(sp.get('limit')), MAX_ROWS));
    const headers = { 'content-type': 'application/json' };
    if ((init.headers || {}).Prefer === 'count=exact') headers['content-range'] = out.length ? `0-${out.length - 1}/${all}` : `*/${all}`;
    return new Response(JSON.stringify(out), { headers });
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realConsole.error; });
// ids descending, ten dates, so pages split inside one movement_date (the keyset tie-break)
const mk = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ id: n - i, client_id: 1 + (i % 3),
  movement_date: `2026-10-${String(20 - Math.floor(i * 10 / n)).padStart(2, '0')}`, ...extra(i) }));

test('291 rows today: one read, all of them, truncated false, cap said', async () => {
  table = mk(291);
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.json.records.length, 291);
  assert.equal(r.json.truncated, false);
  assert.equal(r.json.cap, 9990);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, '999');
  assert.equal(calls[0].prefer, 'count=exact');
  assert.equal(calls[0].order, 'movement_date.desc,id.desc');
});

test('past 300 and past one PostgREST page: every row, each once, in order', async () => {
  table = mk(2500);
  const r = await get();
  assert.equal(r.json.records.length, 2500);
  assert.equal(new Set(r.json.records.map((m) => m.id)).size, 2500);
  assert.deepEqual(r.json.records.map((m) => m.id), sorted().map((m) => m.id));
  assert.equal(r.json.truncated, false);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.prefer), ['count=exact', undefined, undefined]);
});

test('exactly one full page (999): every row, not truncated', async () => {
  table = mk(999);
  const r = await get();
  assert.equal(r.json.records.length, 999);
  assert.equal(r.json.truncated, false);
  assert.ok(calls.length <= 2);
});

test('db-max-rows lowered to 500: still every row, never a quiet cut at 500', async () => {
  MAX_ROWS = 500;
  table = mk(2500);
  const r = await get();
  assert.equal(r.json.records.length, 2500);
  assert.equal(new Set(r.json.records.map((m) => m.id)).size, 2500);
  assert.equal(r.json.truncated, false);
});

test('a movement written above the window while pages are read: no row twice, none skipped', async () => {
  table = mk(2500);
  onPage = (n) => { if (n === 2) table.push({ id: 99999, client_id: 1, movement_date: '2026-10-25' }); };
  const r = await get();
  const ids = r.json.records.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  for (let id = 1; id <= 2500; id++) assert.ok(ids.includes(id), 'missing ' + id);
});

test('a movement deleted above the window while pages are read: none skipped', async () => {
  table = mk(2500);
  onPage = (n) => { if (n === 2) table = table.filter((m) => m.id !== 2500); };
  const r = await get();
  const ids = new Set(r.json.records.map((m) => m.id));
  for (let id = 1; id < 2500; id++) assert.ok(ids.has(id), 'skipped ' + id);
  assert.equal(r.json.truncated, false, 'a deleted row is not a cut');
});

test('no exact count in the answer: a loud error, never a guessed «complete»', async () => {
  table = mk(10);
  const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => { const res = await real(u, init); return new Response(await res.text()); };
  const r = await get();
  assert.ok(r.status >= 500, 'status ' + r.status);
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
  assert.deepEqual(r.json.records.map((m) => m.id), sorted().slice(0, 9990).map((m) => m.id));
});

test('filters ride on every page (client card)', async () => {
  table = mk(3000);
  const r = await get('?client_id=2');
  assert.equal(r.json.records.length, 1000);
  assert.equal(r.json.truncated, false);
  assert.ok(r.json.records.every((m) => m.client_id === 2));
  assert.ok(calls.every((c) => c.client_id === 'eq.2'));
});

test('national rows: legs read in chunks of 200, every row named', async () => {
  table = mk(450, (i) => ({ piece_leg_id: 5000 + i }));
  const r = await get();
  assert.deepEqual(legCalls, [200, 200, 50]);
  assert.ok(r.json.records.every((m) => m.nat_order_id != null && !m.nat_order_unknown));
});

test('an unknown stop or order answers the same shape: empty, truncated false, cap', async () => {
  globalThis.fetch = async () => new Response('[]');
  const r = await get('?order_stop_rec=recNOPE');
  assert.deepEqual(r.json, { records: [], truncated: false, cap: 9990 });
});

test('a movement deleted below the window while pages are read: the rest arrive, and it is not called a cut', async () => {
  table = mk(2500);
  onPage = (n) => { if (n === 2) table = table.filter((m) => m.id !== 1); };
  const r = await get();
  assert.equal(r.json.records.length, 2499);
  assert.equal(r.json.truncated, false, 'fewer rows than the count, but nothing missing');
});
