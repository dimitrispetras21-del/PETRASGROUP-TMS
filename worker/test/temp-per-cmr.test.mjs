// «Temp Per CMR» — the Worker half of migration 065 (dispatcher Pantelis /
// owner 7/10/2026: an international order may say its temperature is the one
// on the CMR). The facade's trap 1 is the reason this test exists: an ORDERS
// label missing from TABLES is dropped with a 200, so the order form would show
// «saved» while nothing was written. Two layers, both against
// worker/src/index.js itself (the deploy source, never a copy — αρχή 3):
//   1. TABLES lifted out of the source text: the label, its one column, nothing else;
//   2. the real bundle in Node with PostgREST stubbed via fetch: a save sends
//      temp_per_cmr to orders and the response carries the label back (what the
//      form reads to say «stuck»/«did not stick»), a read selects it from
//      orders_with_derived, and nothing is logged as an unknown field.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
const src = readFileSync(SRC_PATH, 'utf8');
const LABEL = 'Temp Per CMR';

// ─────────────────────────────── 1. lifted TABLES ───────────────────────────────
const m = src.match(/var TABLES = \{[\s\S]*?\n\};\n/);
assert.ok(m, 'TABLES not found in worker/src/index.js');
const TABLES = new Function(m[0] + '\nreturn TABLES;')();

test('TABLES: ORDERS maps «Temp Per CMR» → temp_per_cmr as a writable scalar, and nothing else names the column', () => {
  const o = TABLES.tblgHlNmLBH3JTdIM;
  assert.equal(o.fields[LABEL], 'temp_per_cmr');
  assert.equal((o.computed || {})[LABEL], undefined, 'not computed: the form writes it');
  assert.equal((o.links || {})[LABEL], undefined);
  assert.equal(o.readView, 'orders_with_derived', 'reads come from the view 065 extends');
  const named = Object.entries(o.fields).filter(([, c]) => c === 'temp_per_cmr').map(([l]) => l);
  assert.deepEqual(named, [LABEL], 'one label, one column (αρχή 3)');
  assert.equal(o.fields['Temperature °C'], 'temperature_c', 'the number keeps its own label');
  // international orders only (owner 7/10): no other facade table names the label or the column
  for (const [id, t] of Object.entries(TABLES)) {
    if (id === 'tblgHlNmLBH3JTdIM') continue;
    const all = [...Object.entries(t.fields || {}), ...Object.entries(t.computed || {})];
    assert.ok(!all.some(([l, c]) => l === LABEL || c === 'temp_per_cmr'), `${t.name} must not name it`);
  }
});

test('guard of three still present (CLAUDE.md ⛔ Ο WORKER) + stock lots + local relay', () => {
  assert.equal(TABLES.tblgHlNmLBH3JTdIM.fields['VS CD Date'], 'cross_dock_date');
  const w = TABLES.tblMiFxbm9ky8PCQi.fields;
  assert.deepEqual([w.Country, w.Aliases, w['VAT Number'], w['Legal Name']], ['country', 'aliases', 'tax_id', 'legal_name']);
  assert.match(src, /\n {2}dispatcher: \{\n(?:[^\n]*\n)*? {4}order_stops: \["GET", "POST", "PATCH", "DELETE"\]/);
  assert.ok(TABLES.tblStockLots, 'tblStockLots');
  assert.equal(src.split('"Move Kind": "move_kind"').length - 1, 1, 'Move Kind');
});

// ─────────────────────────────── 2. the real bundle ───────────────────────────────
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
async function call(role, method, pathAndQuery, body) {
  const headers = { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(`https://w.invalid${pathAndQuery}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const ORDERS = '/v0/appTEST/tblgHlNmLBH3JTdIM';

// ---- PostgREST stub ----
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
let routes, calls;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  routes = [];
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, table, params: u.searchParams, body });
    for (const r of routes) {
      if (r.method === method && r.table === table) {
        const out = await r.handler(u, body);
        if (out) return out;
      }
    }
    if (method === 'POST' && table === 'audit_log') return json(Array.isArray(body) ? body : [body], 201);
    if (method === 'POST' && table === 'rpc/log_unknown_field') return json(null);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const on = (method, table, handler) => routes.push({ method, table, handler });
const unknownLogs = () => calls.filter((c) => c.table === 'rpc/log_unknown_field');
const auditRows = () => calls.filter((c) => c.table === 'audit_log').flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));

// orders row after 065: the column is NOT NULL, so it is always there (false by default)
const ROW = { id: 42, legacy_id: 'recORDER1', direction: 'Import', status: 'Assigned', temperature_c: 2, temp_per_cmr: false, deleted_at: null };
const orderRoutes = () => {
  on('GET', 'orders', (u) => (u.searchParams.get('select') === '*' ? json([ROW]) : null));
  on('PATCH', 'orders', (u, body) => json([{ ...ROW, ...body }]));
  on('GET', 'orders_with_derived', (u) => json([{ legacy_id: 'recORDER1', order_no: 42, week_number: 40 }]));
};

test('PATCH ORDERS «Temp Per CMR» true + empty temperature → both columns written, the label comes back true, no unknown field', async () => {
  orderRoutes();
  const r = await call('dispatcher', 'PATCH', `${ORDERS}/recORDER1`, { fields: { [LABEL]: true, 'Temperature °C': null } });
  assert.equal(r.status, 200, r.text);
  const patch = calls.find((c) => c.method === 'PATCH' && c.table === 'orders');
  assert.deepEqual(patch.body, { temp_per_cmr: true, temperature_c: null });
  assert.equal(r.json.fields[LABEL], true, 'the form reads this back to know the flag stuck');
  assert.equal(r.json.fields['Temperature °C'], undefined, 'NULL is absent (trap 2) — the number is optional when the CMR rules');
  assert.equal(unknownLogs().length, 0, '«Temp Per CMR» is a known ORDERS label');
  const audited = auditRows();
  assert.equal(audited.length, 1);
  assert.equal(JSON.parse(audited[0].after_data).temp_per_cmr, true, 'the audit trail shows the flag too');
});

test('PATCH ORDERS «Temp Per CMR» false → written false and returned false (present, not dropped: only NULL is)', async () => {
  orderRoutes();
  const r = await call('dispatcher', 'PATCH', `${ORDERS}/recORDER1`, { fields: { [LABEL]: false } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(calls.find((c) => c.method === 'PATCH' && c.table === 'orders').body, { temp_per_cmr: false });
  assert.equal(r.json.fields[LABEL], false);
  assert.equal(unknownLogs().length, 0);
});

test('POST ORDERS with «Temp Per CMR» → temp_per_cmr in the insert', async () => {
  on('POST', 'orders', (u, body) => json([{ id: 43, deleted_at: null, ...body }], 201));
  on('GET', 'orders_with_derived', () => json([]));
  const r = await call('dispatcher', 'POST', ORDERS, { fields: { Direction: 'Export', Status: 'Pending', [LABEL]: true } });
  assert.ok(r.status === 200 || r.status === 201, r.text);
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'orders');
  const row = Array.isArray(ins.body) ? ins.body[0] : ins.body;
  assert.equal(row.temp_per_cmr, true);
  assert.equal(r.json.fields[LABEL], true);
  assert.equal(unknownLogs().length, 0);
});

test('GET ORDERS fields[]=«Temp Per CMR» → selects temp_per_cmr from orders_with_derived, label read back, no unknown field', async () => {
  on('GET', 'orders_with_derived', (u) => json([{ id: 42, legacy_id: 'recORDER1', temp_per_cmr: true, temperature_c: null }]));
  on('GET', 'order_stops', () => json([]));   // ORDERS' reverse link, resolved on every GET
  const q = `fields[]=${encodeURIComponent(LABEL)}&fields[]=${encodeURIComponent('Temperature °C')}`;
  const r = await call('dispatcher', 'GET', `${ORDERS}?${q}`);
  assert.equal(r.status, 200, r.text);
  const read = calls.find((c) => c.method === 'GET' && c.table === 'orders_with_derived');
  assert.ok(read.params.get('select').split(',').includes('temp_per_cmr'), read.params.get('select'));
  assert.equal(r.json.records[0].fields[LABEL], true);
  assert.equal(unknownLogs().length, 0);
});

test('before 065 (no such column) a save naming the label is a loud 500, never a silent 200 — why 065 goes first', async () => {
  on('GET', 'orders', (u) => (u.searchParams.get('select') === '*' ? json([ROW]) : null));
  on('PATCH', 'orders', () => json({ code: '42703', details: null, hint: null, message: 'column "temp_per_cmr" of relation "orders" does not exist' }, 400));
  const r = await call('dispatcher', 'PATCH', `${ORDERS}/recORDER1`, { fields: { [LABEL]: true } });
  assert.equal(r.status, 500, r.text);
  assert.equal(auditRows().length, 0, 'nothing written, nothing audited');
});
