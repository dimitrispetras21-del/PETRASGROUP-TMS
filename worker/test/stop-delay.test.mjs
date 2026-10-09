// «Καθυστέρηση» with a reason — the Worker half of migration 067 (dispatcher
// Pantelis / owner 9/10/2026: every late loading/delivery says WHY and WHOSE).
// The facade's trap 1 is the reason this test exists: an ORDER STOPS label
// missing from TABLES is dropped with a 200, so Daily Ops would say «saved»
// while the reason was never written. Two layers, both against
// worker/src/index.js itself (the deploy source, never a copy — αρχή 3):
//   1. TABLES lifted out of the source text: the three labels, one column each,
//      «Delay Responsibility» declared read-only, nothing else names the columns;
//   2. the real bundle in Node with PostgREST stubbed via fetch: the Daily Ops
//      delay stamp sends the three columns in ONE PATCH and the answer carries
//      the reason and the base's responsibility back (what the screen reads to
//      say «stuck»/«did not stick»); a write naming the responsibility is
//      refused BEFORE any database call (single, batch, create); a read selects
//      the columns; nothing is logged as an unknown field.
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
const STOPS_ID = 'tblaeY5QOHAS1gyE8';
const LABELS = { 'Delay Reason': 'delay_reason', 'Delay Note': 'delay_note', 'Delay Responsibility': 'delay_responsibility' };

// ─────────────────────────────── 1. lifted TABLES ───────────────────────────────
const m = src.match(/var TABLES = \{[\s\S]*?\n\};\n/);
assert.ok(m, 'TABLES not found in worker/src/index.js');
const TABLES = new Function(m[0] + '\nreturn TABLES;')();

test('TABLES: ORDER STOPS maps the three delay labels, one column each; «Delay Responsibility» is read-only', () => {
  const s = TABLES[STOPS_ID];
  assert.equal(s.pg, 'order_stops');
  for (const [label, col] of Object.entries(LABELS)) {
    assert.equal(s.fields[label], col, label);
    const named = Object.entries(s.fields).filter(([, c]) => c === col).map(([l]) => l);
    assert.deepEqual(named, [label], `one label, one column (αρχή 3): ${col}`);
    assert.equal((s.computed || {})[label], undefined, `${label}: not computed (no re-read, no silent drop)`);
  }
  assert.deepEqual(s.readOnly, ['Delay Responsibility']);
  assert.equal(s.fields.Performance, 'performance', 'the delay rides with Performance');
  // stops only: no other facade table names the labels or the columns
  for (const [id, t] of Object.entries(TABLES)) {
    if (id === STOPS_ID) continue;
    const all = [...Object.entries(t.fields || {}), ...Object.entries(t.computed || {})];
    assert.ok(!all.some(([l, c]) => l in LABELS || Object.values(LABELS).includes(c)), `${t.name} must not name them`);
    assert.equal(t.readOnly, undefined, `${t.name}: readOnly only where a column is generated`);
  }
});

test('guard of three still present (CLAUDE.md ⛔ Ο WORKER) + stock lots + local relay + Temp Per CMR', () => {
  assert.equal(TABLES.tblgHlNmLBH3JTdIM.fields['VS CD Date'], 'cross_dock_date');
  const w = TABLES.tblMiFxbm9ky8PCQi.fields;
  assert.deepEqual([w.Country, w.Aliases, w['VAT Number'], w['Legal Name']], ['country', 'aliases', 'tax_id', 'legal_name']);
  assert.match(src, /\n {2}dispatcher: \{\n(?:[^\n]*\n)*? {4}order_stops: \["GET", "POST", "PATCH", "DELETE"\]/);
  assert.ok(TABLES.tblStockLots, 'tblStockLots');
  assert.equal(src.split('"Move Kind": "move_kind"').length - 1, 1, 'Move Kind');
  assert.equal(TABLES.tblgHlNmLBH3JTdIM.fields['Temp Per CMR'], 'temp_per_cmr', 'Temp Per CMR');
});

// ─────────────────────────────── 2. the real bundle ───────────────────────────────
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
const STOPS = `/v0/appTEST/${STOPS_ID}`;

// ---- PostgREST stub: order_stops after 067 (the base derives the responsibility) ----
const RESP = { loading_wait: 'client', traffic: 'external', other: 'other', unloading_wait: 'consignee' };
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
const dbWrites = () => calls.filter((c) => c.table === 'order_stops' && c.method !== 'GET');
const dbCalls = () => calls.filter((c) => !['audit_log', 'rpc/log_unknown_field'].includes(c.table));

const ROW = { id: 77, legacy_id: 'recSTOP1', stop_type: 'Unloading', stop_number: 1, order_id: null, location_id: null,
  performance: null, completed_at: null, completed_by: null, delay_reason: null, delay_note: null, delay_responsibility: null, deleted_at: null };
const derive = (row) => ({ ...row, delay_responsibility: RESP[row.delay_reason] ?? null });
const stopRoutes = () => {
  on('GET', 'order_stops', (u) => (u.searchParams.get('select') === '*' ? json([ROW]) : null));
  on('PATCH', 'order_stops', (u, body) => json([derive({ ...ROW, ...body })]));
};

test('PATCH ORDER STOPS: the Daily Ops delay stamp → ONE PATCH with performance + reason + note; the answer carries reason and the base\'s responsibility; nothing unknown', async () => {
  stopRoutes();
  const fields = { 'Completed At': '2026-10-09T09:12:00.000Z', 'Completed By': 'TEST', Performance: 'Delayed', 'Delay Reason': 'loading_wait', 'Delay Note': null };
  const r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields });
  assert.equal(r.status, 200, r.text);
  const patches = dbWrites();
  assert.equal(patches.length, 1, 'one write');
  assert.deepEqual(patches[0].body, { completed_at: '2026-10-09T09:12:00.000Z', completed_by: 'TEST', performance: 'Delayed', delay_reason: 'loading_wait', delay_note: null });
  assert.equal(r.json.fields['Delay Reason'], 'loading_wait', 'the screen reads this back to know the reason stuck');
  assert.equal(r.json.fields['Delay Responsibility'], 'client', 'derived by the base, carried on the answer with no extra read');
  assert.equal(r.json.fields['Delay Note'], undefined, 'NULL is absent (trap 2)');
  assert.equal(unknownLogs().length, 0, 'all three are known ORDER STOPS labels');
  assert.equal(calls.filter((c) => c.method === 'GET' && c.table === 'order_stops').length, 1, 'only the audit «before» read — no computed re-read');
  const audited = auditRows();
  assert.equal(audited.length, 1);
  assert.equal(JSON.parse(audited[0].after_data).delay_reason, 'loading_wait', 'the audit trail shows the reason');
});

test('PATCH ORDER STOPS «other» with its note → both written and returned', async () => {
  stopRoutes();
  const r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { Performance: 'Delayed', 'Delay Reason': 'other', 'Delay Note': 'Η ράμπα πλημμύρισε' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(dbWrites()[0].body, { performance: 'Delayed', delay_reason: 'other', delay_note: 'Η ράμπα πλημμύρισε' });
  assert.equal(r.json.fields['Delay Note'], 'Η ράμπα πλημμύρισε');
  assert.equal(r.json.fields['Delay Responsibility'], 'other');
});

test('a write naming «Delay Responsibility» is REFUSED, named, before any database call — single PATCH (alone or beside a writable label)', async () => {
  stopRoutes();
  for (const fields of [{ 'Delay Responsibility': 'us' }, { Performance: 'Delayed', 'Delay Reason': 'traffic', 'Delay Responsibility': 'us' }]) {
    calls.length = 0;
    const r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields });
    assert.equal(r.status, 400, r.text);
    assert.match(r.json.error.message || r.text, /Delay Responsibility/);
    assert.equal(dbCalls().length, 0, 'not even the «before» read: nothing half-applied');
    assert.equal(auditRows().length, 0, 'nothing written, nothing audited');
  }
});

test('… and in a batch PATCH (one record naming it refuses the batch) and on create', async () => {
  stopRoutes();
  const b = await call('dispatcher', 'PATCH', STOPS, { records: [
    { id: 'recSTOP1', fields: { Performance: 'Delayed', 'Delay Reason': 'traffic' } },
    { id: 'recSTOP2', fields: { 'Delay Responsibility': 'external' } }] });
  assert.equal(b.status, 400, b.text);
  assert.match(b.text, /Delay Responsibility/);
  assert.equal(dbCalls().length, 0);
  calls.length = 0;
  const c = await call('dispatcher', 'POST', STOPS, { fields: { 'Stop Type': 'Unloading', 'Delay Responsibility': 'us' } });
  assert.equal(c.status, 400, c.text);
  assert.equal(dbCalls().length, 0);
  calls.length = 0;
  const cb = await call('dispatcher', 'POST', STOPS, { records: [{ fields: { 'Stop Type': 'Unloading' } }, { fields: { 'Delay Responsibility': 'us' } }] });
  assert.equal(cb.status, 400, cb.text);
  assert.equal(dbCalls().length, 0);
});

test('GET ORDER STOPS fields[] = the three labels → selects the columns from order_stops, labels read back, no unknown field', async () => {
  on('GET', 'order_stops', () => json([{ id: 77, legacy_id: 'recSTOP1', performance: 'Delayed', delay_reason: 'unloading_wait', delay_note: 'x', delay_responsibility: 'consignee' }]));
  const q = Object.keys(LABELS).concat('Performance').map((l) => `fields[]=${encodeURIComponent(l)}`).join('&');
  const r = await call('dispatcher', 'GET', `${STOPS}?${q}`);
  assert.equal(r.status, 200, r.text);
  const read = calls.find((c) => c.method === 'GET' && c.table === 'order_stops');
  const sel = read.params.get('select').split(',');
  for (const col of Object.values(LABELS)) assert.ok(sel.includes(col), read.params.get('select'));
  assert.deepEqual([r.json.records[0].fields['Delay Reason'], r.json.records[0].fields['Delay Responsibility'], r.json.records[0].fields['Delay Note']], ['unloading_wait', 'consignee', 'x']);
  assert.equal(unknownLogs().length, 0);
});

test('a filter on «Delay Responsibility» is translated (no 422): read-only does not mean unreadable', async () => {
  on('GET', 'order_stops', () => json([]));
  const r = await call('owner', 'GET', `${STOPS}?filterByFormula=${encodeURIComponent("{Delay Responsibility}='client'")}`);
  assert.equal(r.status, 200, r.text);
  const read = calls.find((c) => c.method === 'GET' && c.table === 'order_stops');
  assert.ok([...read.params.entries()].some(([k, v]) => /delay_responsibility/.test(k + '=' + v)), String(read.params));
});

test('before 067 (no such column) a save naming «Delay Reason» is a loud 500, never a silent 200 — why 067 goes first', async () => {
  on('GET', 'order_stops', (u) => (u.searchParams.get('select') === '*' ? json([ROW]) : null));
  on('PATCH', 'order_stops', () => json({ code: '42703', details: null, hint: null, message: 'column "delay_reason" of relation "order_stops" does not exist' }, 400));
  const r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { Performance: 'Delayed', 'Delay Reason': 'traffic' } });
  assert.equal(r.status, 500, r.text);
  assert.equal(auditRows().length, 0, 'nothing written, nothing audited');
});

test('the base refuses a reason the rules do not allow (e.g. «other» without a note) → a loud 500, nothing audited', async () => {
  on('GET', 'order_stops', (u) => (u.searchParams.get('select') === '*' ? json([ROW]) : null));
  on('PATCH', 'order_stops', () => json({ code: '23514', details: null, hint: null, message: 'new row for relation "order_stops" violates check constraint "order_stops_delay_other_note_check"' }, 400));
  const r = await call('dispatcher', 'PATCH', `${STOPS}/recSTOP1`, { fields: { Performance: 'Delayed', 'Delay Reason': 'other' } });
  assert.equal(r.status, 500, r.text);
  assert.equal(auditRows().length, 0);
});
