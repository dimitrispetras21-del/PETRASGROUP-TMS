// 073 / E10 + handover P3-3, end to end through worker/src/index.js: POST /costs/import/parse reads the round trips
// from v_rt_vehicle_windows (072b) with the v5 columns, never from ct_round_trips, and a DKV line with an hour lands
// on the v5 cycle whose window holds it on the STATION's clock (DKV-1 beta, owner 24/10). POST /costs/import/commit
// accepts that line for the cycle when its truck is the truck of one of the cycle's OWNED segments (after a handover
// ct_round_trips.truck_id is only the first segment's copy), and still refuses any other truck. PostgREST stubbed via fetch
// (same harness as costs-rt-filter.test.mjs). Synthetic data only: the fixture tests/dkv/fixtures/synthetic-invoice.txt,
// fake plates and ids (public repo).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
const INVOICE = fs.readFileSync(path.resolve(HERE, '../../tests/dkv/fixtures/synthetic-invoice.txt'), 'utf8');

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
async function parse(fileName) {
  const body = { source: 'DKV', zip_sha256: 'a'.repeat(64), files: [{ name: fileName, text: INVOICE }] };
  const req = new Request('https://w.invalid/costs/import/parse', { method: 'POST',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${await token('accountant')}`, 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// The fixture: XX1234 toll 01/09 (truck 7, a trip of today's model), XX5678 fuel 02/09 03:15 and a misc line 03/09
// (truck 9). Truck 9 has two v5 cycles on 02/09 (Athens): A 01:00 -> 04:00, B 04:00 -> 13:00. The fuel's 03:15 on a
// German station is 01:15Z = 04:15 Athens -> B; read on the Athens clock it would be A (00:15Z).
const WINDOWS = [
  { id: 5, truck_id: 7, status: 'planned', date_start: '2026-09-01', date_end: '2026-09-01', model: 1, start_at: null, end_at: null },
  { id: 21, truck_id: 9, status: 'planned', date_start: '2026-09-02', date_end: '2026-09-02', model: 2,
    start_at: '2026-09-01T22:00:00+00:00', end_at: '2026-09-02T01:00:00+00:00' },
  { id: 22, truck_id: 9, status: 'planned', date_start: '2026-09-02', date_end: '2026-09-02', model: 2,
    start_at: '2026-09-02T01:00:00+00:00', end_at: '2026-09-02T10:00:00+00:00' },
];
// Cycle 23 hands over from truck 12 to truck 13 (ct_round_trips.truck_id = 12, the first segment's copy); trip 5 is
// today's model, truck 7. (Trucks 12 / 13 are not in the parsed fixture: the parse tests above do not see cycle 23.)
const CYCLES = [
  { id: 23, truck_id: 12, status: 'planned', model: 2 },
  { id: 5, truck_id: 7, status: 'planned', model: 1 },
];
WINDOWS.push(
  { id: 23, truck_id: 12, status: 'planned', date_start: '2026-09-02', date_end: '2026-09-02', model: 2,
    start_at: '2026-09-02T03:00:00+00:00', end_at: '2026-09-02T11:00:00+00:00' },
  { id: 23, truck_id: 13, status: 'planned', date_start: '2026-09-02', date_end: '2026-09-03', model: 2,
    start_at: '2026-09-02T11:00:00+00:00', end_at: '2026-09-03T17:00:00+00:00' },
);
const DOC = { id: 1, status: 'draft', total_gross: 60, invoice_no: 'S1' };
// per-test overrides (review r2): the trucks table and the view's rows
let TRUCKS = null;
let VIEW = null;
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
    calls.push({ method, table, params: u.searchParams, body: init.body });
    if (method === 'GET' && table === 'ct_cost_docs' && u.searchParams.get('id') === 'eq.1') return json([DOC]);
    if (method === 'GET' && ['ct_import_rules', 'ct_cost_docs', 'ct_plate_aliases'].includes(table)) return json([]);
    if (method === 'GET' && table === 'trucks') return json(TRUCKS || [{ id: 7, license_plate: 'XX1234' }, { id: 9, license_plate: 'XX5678' }]);
    if (method === 'GET' && table === 'v_rt_vehicle_windows') {
      if (VIEW === 'missing') return json({ code: 'PGRST205', message: "Could not find the table 'public.v_rt_vehicle_windows' in the schema cache" }, 404);
      const inSet = (col) => (u.searchParams.get(col) || '').replace(/^in\.\(|\)$/g, '').split(',');
      const cols = (u.searchParams.get('select') || '').split(',');
      const pick = (r) => Object.fromEntries(cols.map((c) => [c, r[c]]));
      const rows = VIEW || WINDOWS;
      if (u.searchParams.get('id')) return json(rows.filter((r) => inSet('id').includes(String(r.id))).map(pick));
      return json(rows.filter((r) => inSet('truck_id').includes(String(r.truck_id))).map(pick));
    }
    if (method === 'GET' && table === 'ct_round_trips') {
      const set = (u.searchParams.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',');
      return json(CYCLES.filter((r) => set.includes(String(r.id))));
    }
    if (method === 'POST' && table === 'ct_cost_lines') return json(JSON.parse(init.body).map((r, i) => ({ id: 900 + i, ...r })), 201);
    if (method === 'PATCH' && table === 'ct_cost_docs') return json([{ id: 1, status: 'confirmed' }]);
    if (method === 'POST' && table === 'audit_log') return json([{}], 201);
    if (method === 'GET' && table === 'ct_cost_lines') return json([]);
    if (method === 'POST' && table === 'ct_cost_docs') return json([{ id: 1, status: 'draft' }], 201);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); TRUCKS = null; VIEW = null; DOC.total_gross = 60; });

test('the preview reads v_rt_vehicle_windows with the v5 columns, and never ct_round_trips', async () => {
  const r = await parse('9999999_20260930_DE_E-INVOICE_1.pdf');
  assert.equal(r.status, 200, r.text);
  const reads = calls.filter((c) => c.table === 'v_rt_vehicle_windows');
  // one read by the batch's trucks, then (review r2) one by id for the v5 cycle the fixture's fee is spread onto
  assert.equal(reads.length, 2);
  for (const rd of reads) {
    assert.equal(rd.params.get('select'), 'id,truck_id,status,date_start,date_end,model,start_at,end_at');
    assert.equal(rd.params.get('status'), 'neq.cancelled');
  }
  assert.equal(reads[0].params.get('truck_id'), 'in.(7,9)');
  assert.equal(reads[1].params.get('id'), 'in.(22)');
  assert.equal(reads[1].params.get('truck_id'), null);
  assert.equal(calls.filter((c) => c.table === 'ct_round_trips').length, 0);
});

test('Q7-1 (review r2): a statement with only the SECOND truck of a handover still files the cycle\'s fee under the FIRST truck, through the commit', async () => {
  // cycle 23: truck 12 until 02/09 00:00Z, then truck 13. The statement's XX5678 is truck 13; truck 12 has no line.
  TRUCKS = [{ id: 7, license_plate: 'XX1234' }, { id: 12, license_plate: 'XX0012' }, { id: 13, license_plate: 'XX5678' }];
  VIEW = [
    WINDOWS[0],
    { id: 23, truck_id: 12, status: 'planned', date_start: '2026-09-01', date_end: '2026-09-02', model: 2,
      start_at: '2026-09-01T20:00:00+00:00', end_at: '2026-09-02T00:00:00+00:00' },
    { id: 23, truck_id: 13, status: 'planned', date_start: '2026-09-02', date_end: '2026-09-03', model: 2,
      start_at: '2026-09-02T00:00:00+00:00', end_at: '2026-09-03T17:00:00+00:00' },
  ];
  const r = await parse('9999999_20260930_DE_E-INVOICE_1.pdf');
  assert.equal(r.status, 200, r.text);
  const fuel = r.json.lines.find((l) => l.plate === 'XX5678' && l.category === 'fuel');
  assert.equal(fuel.rt_id, 23);
  assert.equal(fuel.truck_id, 13);
  const byTruck = calls.filter((c) => c.table === 'v_rt_vehicle_windows' && c.params.get('truck_id'));
  assert.equal(byTruck[0].params.get('truck_id'), 'in.(7,13)');
  const fee = r.json.lines.find((l) => l.category === 'dkv' && l.rt_id === 23);
  assert.ok(fee, 'the fee was spread onto cycle 23');
  assert.equal(fee.truck_id, 12);
  assert.equal(fee.plate, 'XX0012');
  // the commit stores the fee line under truck 12 (an OWNED segment's truck, so the commit check accepts it)
  calls = [];
  DOC.total_gross = fee.gross_eur != null ? fee.gross_eur : fee.gross;
  const c = await commit([fee]);
  assert.equal(c.status, 201, c.text);
  const ins = calls.find((x) => x.method === 'POST' && x.table === 'ct_cost_lines');
  assert.ok(ins, 'the line was inserted');
});

test('a German station\'s 03:15 is the v5 cycle B (04:15 Athens); today\'s trip of truck 7 is matched as before', async () => {
  const r = await parse('9999999_20260930_DE_E-INVOICE_1.pdf');
  assert.equal(r.status, 200, r.text);
  const fuel = r.json.lines.find((l) => l.plate === 'XX5678' && l.category === 'fuel');
  assert.equal(fuel.match, 'sure');
  assert.equal(fuel.rt_id, 22);
  const toll = r.json.lines.find((l) => l.plate === 'XX1234');
  assert.equal(toll.match, 'sure');
  assert.equal(toll.rt_id, 5);
  // the 03/09 line has no hour and is one day after both cycles (exact days, DKV-2): review, counted
  const misc = r.json.lines.find((l) => l.plate === 'XX5678' && l.category !== 'fuel');
  assert.equal(misc.none_reason, 'review_cycles');
  assert.deepEqual(misc.alternatives, [21, 22]);
  assert.equal(r.json.metrics.none_reason.review_cycles, 1);
});

test('a document without a country: the hour is not read as Athens time - review with both cycles', async () => {
  const r = await parse('9999999_20260930_E-INVOICE_1.pdf');
  assert.equal(r.status, 200, r.text);
  const fuel = r.json.lines.find((l) => l.plate === 'XX5678' && l.category === 'fuel');
  assert.equal(fuel.country, null);
  assert.equal(fuel.match, 'none');
  assert.equal(fuel.none_reason, 'review_cycles');
  assert.deepEqual(fuel.alternatives, [21, 22]);
  assert.equal(r.json.metrics.none_reason.review_cycles, 2);
});

async function commit(lines) {
  const req = new Request('https://w.invalid/costs/import/commit', { method: 'POST',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${await token('accountant')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ doc_id: 1, reconcile_ok: true, lines }) });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, json: body, text };
}
const fuelLine = (truck_id, rt_id) => ({ doc_no: 'D1', seq: 1, plate: 'XX5', truck_id, rt_id, category: 'fuel',
  net: 50, vat: 10, gross: 60, currency: 'EUR', service_date: '2026-09-02', match: 'sure' });

test('commit: the second truck of a handover is accepted for the cycle (its segment), not "another truck"', async () => {
  const r = await commit([fuelLine(13, 23)]);
  assert.equal(r.status, 201, r.text);
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'ct_cost_lines');
  assert.ok(ins, 'the line was inserted');
  const seg = calls.filter((c) => c.table === 'v_rt_vehicle_windows');
  assert.equal(seg.length, 1);
  assert.equal(seg[0].params.get('id'), 'in.(23)');
});

test('commit: a truck that drives no segment of the cycle is still refused, before any insert', async () => {
  const r = await commit([fuelLine(11, 23)]);
  assert.equal(r.status, 409, r.text);
  assert.match(r.json.error, /round trip 23 belongs to another truck/);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.table === 'ct_cost_lines').length, 0);
});

test('commit: today\'s round trips keep the one-truck rule and read no segments', async () => {
  const bad = await commit([fuelLine(9, 5)]);
  assert.equal(bad.status, 409, bad.text);
  assert.match(bad.json.error, /round trip 5 belongs to another truck/);
  calls = [];
  const ok = await commit([fuelLine(7, 5)]);
  assert.equal(ok.status, 201, ok.text);
  assert.equal(calls.filter((c) => c.table === 'v_rt_vehicle_windows').length, 0);
});

test('commit (final review 26/10, W-9): a truck of the cycle is the cycle\'s only on its own segment\'s days; a DKV fee is not held to them', async () => {
  // truck 13 drives cycle 23 from 02/09 to 03/09 (its segment): its fuel of 01/09 is not cycle 23's
  const r = await commit([{ ...fuelLine(13, 23), service_date: '2026-09-01' }]);
  assert.equal(r.status, 409, r.text);
  assert.match(r.json.error, /round trip 23: truck 13 has no segment of it on 2026-09-01/);
  assert.equal(calls.filter((c) => c.method === 'POST' && c.table === 'ct_cost_lines').length, 0);
  calls = [];
  const ok = await commit([{ ...fuelLine(13, 23), service_date: '2026-09-03' }]);
  assert.equal(ok.status, 201, ok.text);
  calls = [];
  // truck 12's segment is 02/09 only: a fee line filed under it (Q7-1) dated by the statement passes
  const fee = await commit([{ ...fuelLine(12, 23), category: 'dkv', service_date: '2026-09-30' }]);
  assert.equal(fee.status, 201, fee.text);
});

test('commit (final round 2, finding 1): one statement with tolls of BOTH trucks of a handover in one country gives one line per truck, each on its own segment\'s day', async () => {
  // cycle 23: truck 12 drives 02/09, truck 13 drives 02/09-03/09. Same DKV document, same country (DE). One group for
  // both kept truck 12 with the date 03/09 (truck 13's), and W-9 refused the whole statement.
  const toll = (seq, truck_id, plate, day, gross) => ({ doc_no: 'D1', seq, plate, truck_id, rt_id: 23, category: 'tolls',
    country: 'DE', toll_country: 'DE', net: gross, vat: 0, gross, currency: 'EUR', service_date: day, match: 'sure' });
  DOC.total_gross = 30;
  const r = await commit([toll(1, 12, 'XX0012', '2026-09-02', 10), toll(2, 13, 'XX0013', '2026-09-03', 20)]);
  assert.equal(r.status, 201, r.text);
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'ct_cost_lines');
  assert.ok(ins, 'the lines were inserted');
  const sent = JSON.parse(ins.body);
  assert.deepEqual(sent.map((x) => [x.truck_id, x.line_date, x.net]).sort(), [[12, '2026-09-02', 10], [13, '2026-09-03', 20]]);
});

test('deploy order (W-7): a Worker that meets no v_rt_vehicle_windows (072b not run) says so by name, never «Costs request failed»', async () => {
  VIEW = 'missing';
  const r = await parse('9999999_20260930_DE_E-INVOICE_1.pdf');
  assert.equal(r.status, 503, r.text);
  assert.match(r.json.error, /072b \/ 073/);
  assert.match(r.json.error, /f3_missing/);
});
