// GET /costs/pnl-paper — the two P&L papers' one read (owner 3/11/2026, owner only). The real worker/src/index.js
// run in Node with PostgREST stubbed via fetch (the stock-lots.test.mjs pattern): who may read, what is read (the
// 105 views, ONE trip's per-load view only, never for a week), how a bad link / a missing trip / a failed read
// answer (400 / 404 / 500 with Greek words — never an empty paper), and that nothing is ever written.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
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
async function token(role) {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub: 'tester', role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function call(role, q) {
  const req = new Request(`https://w.invalid/costs/pnl-paper${q}`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}` } });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
// invented rows only (the repo is public)
const TRIP = { id: 7, trip_type: 'OWNED', truck_id: 1, driver_id: 2, date_start: '2026-10-17', date_end: '2026-10-22', status: 'closed', revenue: 1000, cost_net: 300, cost_vat: 10, profit_worst: 690, margin_worst_pct: 69 };
const TABLE_ROWS = {
  ct_v_rt_complete: [{ rt_id: 7, trip_type: 'OWNED', status: 'closed', done: true, missing: [], complete: true }],
  ct_v_rt_cost_cat: [{ rt_id: 7, category: 'fuel', toll_country: null, lines: 1, net: 200, vat: 10 }],
  ct_v_rt_costs: [{ rt_id: 7, lines_net: 300, vat: 10, wear: 0, dl_trip_value: 100, dl_expenses: null, partner_planned: 0, partner_invoiced: 0 }],
  ct_round_trips: [{ id: 7, model: 1 }],
  ct_v_rt_partner_cost: [],
  ct_rt_legs: [{ id: 70, rt_id: 7, seq: 1, direction: 'EXPORT', order_id: 500, nat_load_id: null }],
  ct_v_rt_revenue_legs: [{ rt_id: 7, source: 'leg', leg_id: 70, order_id: 500, carries_price: true, intl_price: 1000, intl_vs_charge: 0, rev_intl: 1000, rev_natl: 0, missing: false }],
  ct_v_v5_revenue: [],
  orders: [{ id: 500, direction: 'Export', client_id: 9, loading_location_1_id: 11, unloading_location_1_id: 12 }],
  clients: [{ id: 9, company_name: 'Πελάτης Δοκιμής' }],
  locations: [{ id: 11, name: 'Α', city: 'Πόλη Α' }, { id: 12, name: 'Β', city: 'Πόλη Β' }]
};
let calls, overrides;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = [];
  overrides = {};
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ method, table, params: u.searchParams });
    if (method !== 'GET') throw new Error(`a write: ${method} ${table}`);
    if (overrides[table]) return overrides[table](u);
    if (table === 'ct_v_rt_pnl') return json([TRIP]);
    if (TABLE_ROWS[table]) return json(TABLE_ROWS[table]);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const read = (t) => calls.find((c) => c.table === t);

test('owner, one trip: 200 with the 105 views raw, the per-load view for THAT trip, the names of its loads; nothing written', async () => {
  const r = await call('owner', '?rt=7');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.trips, [TRIP]);
  assert.equal(r.json.complete[0].complete, true);
  assert.equal(r.json.revenue_legs.length, 1);
  assert.deepEqual(r.json.clients, TABLE_ROWS.clients);
  assert.equal(r.json.truncated, false);
  assert.equal(read('ct_v_rt_pnl').params.get('id'), 'eq.7');
  for (const t of ['ct_v_rt_complete', 'ct_v_rt_cost_cat', 'ct_v_rt_costs', 'ct_v_rt_partner_cost', 'ct_rt_legs', 'ct_v_rt_revenue_legs']) {
    assert.equal(read(t).params.get('rt_id'), 'in.(7)', t);
  }
  assert.equal(read('orders').params.get('id'), 'in.(500)');
  assert.equal(read('ct_v_v5_revenue'), undefined, 'one trip: the v5 lines come inside the per-load view');
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('owner, a week: the trips by first day, NO per-load view (seconds of planning), the v5 lines for the national routes', async () => {
  const r = await call('owner', '?from=2026-10-17&to=2026-10-23');
  assert.equal(r.status, 200, r.text);
  const pnl = read('ct_v_rt_pnl');
  assert.deepEqual(pnl.params.getAll('date_start'), ['gte.2026-10-17', 'lte.2026-10-23']);
  assert.equal(pnl.params.get('order'), 'date_start.asc,id.asc');
  assert.equal(pnl.params.get('limit'), '121');
  assert.equal(read('ct_v_rt_revenue_legs'), undefined);
  assert.equal(read('ct_v_v5_revenue').params.get('rt_id'), 'in.(7)');
  assert.deepEqual(r.json.revenue_legs, []);
});

test('a week with more than 120 trips: the first 120 and truncated: true (the paper refuses, never a shorter whole-looking one)', async () => {
  overrides.ct_v_rt_pnl = () => json(Array.from({ length: 121 }, (_, i) => ({ ...TRIP, id: i + 1 })));
  const r = await call('owner', '?from=2026-10-17&to=2026-10-23');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.trips.length, 120);
  assert.equal(r.json.truncated, true);
});

test('an empty week: 200 with empty lists, no further read', async () => {
  overrides.ct_v_rt_pnl = () => json([]);
  const r = await call('owner', '?from=2026-10-17&to=2026-10-23');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.trips, []);
  assert.deepEqual(calls.map((c) => c.table), ['ct_v_rt_pnl']);
});

test('every other role → 403 before any read (owner 3/11: «μόνο εγώ»)', async () => {
  for (const role of ['accountant', 'dispatcher', 'management', 'warehouse']) {
    calls = [];
    const r = await call(role, '?rt=7');
    assert.equal(r.status, 403, role);
    assert.equal(calls.length, 0, role);
  }
});

test('a bad link → 400 «Μη έγκυρο δρομολόγιο ή εβδομάδα», before any read', async () => {
  for (const q of ['', '?rt=abc', '?rt=7;drop', '?from=2026-10-17', '?from=2026-10-23&to=2026-10-17', '?from=2026-10-01&to=2026-11-20', '?from=17/10/2026&to=23/10/2026', '?from=2026-13-40&to=2026-13-41', '?from=2026-02-30&to=2026-03-05']) {
    calls = [];
    const r = await call('owner', q);
    assert.equal(r.status, 400, q);
    assert.match(r.json.error, /Μη έγκυρο δρομολόγιο ή εβδομάδα/, q);
    assert.equal(calls.length, 0, q);
  }
});

test('a trip that is not there (or cancelled: ct_v_rt_pnl leaves it out) → 404 «Το δρομολόγιο δεν βρέθηκε»', async () => {
  overrides.ct_v_rt_pnl = () => json([]);
  const r = await call('owner', '?rt=99');
  assert.equal(r.status, 404);
  assert.match(r.json.error, /Το δρομολόγιο δεν βρέθηκε/);
});

test('any failed read → 500 «Τα στοιχεία του χαρτιού δεν διαβάστηκαν», never a 200 with a hole', async () => {
  for (const t of ['ct_v_rt_pnl', 'ct_v_rt_complete', 'ct_v_rt_cost_cat', 'ct_v_rt_revenue_legs', 'orders', 'locations']) {
    overrides = { [t]: () => new Response('{"message":"boom"}', { status: 500 }) };
    const r = await call('owner', '?rt=7');
    assert.equal(r.status, 500, t);
    assert.match(r.json.error, /Τα στοιχεία του χαρτιού δεν διαβάστηκαν/, t);
  }
  // a 200 that is not a list (an edge page, a proxy) is a failed read too
  overrides = { ct_v_rt_cost_cat: () => json({ not: 'a list' }) };
  assert.equal((await call('owner', '?rt=7')).status, 500);
  // a list at PostgREST's row cap (1000) may be cut without a word: a failed read, never a paper on it
  overrides = { ct_v_rt_cost_cat: () => json(Array.from({ length: 1000 }, () => TABLE_ROWS.ct_v_rt_cost_cat[0])) };
  assert.equal((await call('owner', '?rt=7')).status, 500);
});
