// «_expect» — the «someone else changed it» check on facade PATCH (Weekly
// Intl v4, TECH_DESIGN §g.2). Two layers, both against worker/src/index.js
// itself (the deploy source, never a copy — principle 3):
//   1. the comparator lifted out of the source text, run against the ONE
//      shared vectors file the front's WI4.sameValue also runs
//      (fixtures/expect-vectors.json), plus the sha256 the front copy checks;
//   2. the real bundle in Node with PostgREST stubbed via fetch over a tiny
//      in-memory `orders` table that honours the PATCH filters, so the
//      compare-and-set is proved by what the fake table holds afterwards and
//      by the PATCH request itself, never by a status code alone.
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
const VECTORS_PATH = path.resolve(HERE, 'fixtures/expect-vectors.json');
const VECTORS_RAW = readFileSync(VECTORS_PATH);
const VECTORS = JSON.parse(VECTORS_RAW.toString('utf8'));

// ─────────────────────────────── 1. the comparator ───────────────────────────────
const block = src.match(/var EXPECT_MAX_LABELS = [\s\S]*?\n__name\(expectSame, "expectSame"\);\n/);
assert.ok(block, 'expectSame block not found in worker/src/index.js');
const expectSame = new Function('__name', block[0] + '\nreturn expectSame;')((f) => f);

test('vectors: expectSame(label, a, b) agrees with every row of the shared file (a missing key = undefined)', () => {
  assert.ok(VECTORS.length >= 20, 'the vectors file is the contract, not a sample');
  for (const v of VECTORS) {
    assert.equal(typeof v.label, 'string');
    assert.equal(typeof v.same, 'boolean');
    assert.equal(expectSame(v.label, v.a, v.b), v.same, `${v.label}: ${JSON.stringify(v.a)} vs ${JSON.stringify(v.b)} (${v.note || ''})`);
    assert.equal(expectSame(v.label, v.b, v.a), v.same, `symmetric: ${v.label}: ${JSON.stringify(v.b)} vs ${JSON.stringify(v.a)}`);
  }
});

test('vectors: the design\'s named cases are in the file', () => {
  const has = (label, a, b, same) => VECTORS.some((v) => v.label === label && JSON.stringify(v.a) === JSON.stringify(a) && JSON.stringify(v.b) === JSON.stringify(b) && v.same === same);
  assert.ok(has('Partner Truck Plates', '12', 'AB 1 2', false), "'12' vs 'AB 1 2'");
  assert.ok(has('Loading DateTime', '2026-10-08T06:00:00Z', '2026-10-08T06:00:00+00:00', true), 'Z vs +00:00 on a date label');
  assert.ok(has('Partner Truck Plates', '2026-10-08T06:00:00Z', '2026-10-08T06:00:00+00:00', false), 'same pair on a non-date label');
  assert.ok(has('Is Partner Trip', false, undefined, true), 'false vs absent on the checkbox');
  assert.ok(has('Truck', ['recA', 'recB'], ['recB', 'recA'], true), 'array order');
});

test('vectors: expect-vectors.sha256 is the sha256 of expect-vectors.json (the front copy is checked against it)', () => {
  const want = readFileSync(path.resolve(HERE, 'fixtures/expect-vectors.sha256'), 'utf8').trim();
  assert.match(want, /^[0-9a-f]{64}$/);
  assert.equal(crypto.createHash('sha256').update(VECTORS_RAW).digest('hex'), want, 'vectors changed without updating the hash');
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
async function token(role, sub) {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function patchOrder(body, { role = 'dispatcher', sub = 'disp1', rec = 'recORDER0001' } = {}) {
  const req = new Request(`https://w.invalid/v0/appTEST/tblgHlNmLBH3JTdIM/${rec}`, {
    method: 'PATCH',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${await token(role, sub)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ---- in-memory PostgREST ----
const jsonRes = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
const TRUCKS = [{ id: 7, legacy_id: 'recTRUCK0007' }, { id: 8, legacy_id: 'recTRUCK0008' }, { id: 9, legacy_id: 'recTRUCK0009' }];
let DB, calls, fail, auditRowsStub, beforePatch;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
let errors;
function inList(v) {
  const m = /^in\.\((.*)\)$/.exec(v || '');
  return m ? m[1].split(',').map((s) => s.replace(/^"|"$/g, '')) : null;
}
// A PATCH matches only when every filter holds on the row: the CAS proof.
function rowMatches(row, params) {
  for (const [col, cond] of params) {
    if (cond === 'is.null') { if (row[col] != null) return false; continue; }
    if (cond.startsWith('eq.')) { if (row[col] == null || String(row[col]) !== cond.slice(3)) return false; continue; }
    throw new Error(`unsupported filter ${col}=${cond}`);
  }
  return true;
}
beforeEach(() => {
  errors = [];
  console.log = console.warn = () => {};
  console.error = (...a) => errors.push(a.join(' '));
  DB = {
    id: 42, legacy_id: 'recORDER0001', direction: 'Export', status: 'Assigned', deleted_at: null,
    truck_id: 7, driver_id: null, partner_id: null, is_partner_trip: false, partner_truck_plates: null,
    loading_datetime: '2026-10-08T06:00:00+00:00', delivery_datetime: '2026-10-10T08:00:00+00:00',
    cross_dock_date: '2026-10-09', matched_import_id: null
  };
  calls = [];
  fail = {};
  auditRowsStub = [];
  beforePatch = null;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, table, params: [...u.searchParams], body });
    const p = u.searchParams;
    if (method === 'GET' && table === 'orders') {
      if (fail.before) return jsonRes({ message: 'boom' }, 500);
      return jsonRes(DB && p.get('legacy_id') === `eq.${DB.legacy_id}` ? [{ ...DB }] : []);
    }
    if (method === 'PATCH' && table === 'orders') {
      if (beforePatch) beforePatch();
      const filters = [...p].filter(([k]) => k !== 'legacy_id');
      if (!DB || p.get('legacy_id') !== `eq.${DB.legacy_id}` || !rowMatches(DB, filters)) return jsonRes([]);
      Object.assign(DB, body);
      return jsonRes([{ ...DB }]);
    }
    if (method === 'GET' && table === 'trucks') {
      const ids = inList(p.get('id'));
      if (ids) {
        if (fail.truckRead) return jsonRes({ message: 'transient' }, 503);
        return jsonRes(TRUCKS.filter((t) => ids.includes(String(t.id))));
      }
      const leg = inList(p.get('legacy_id'));
      if (leg) return jsonRes(TRUCKS.filter((t) => leg.includes(t.legacy_id)));
    }
    if (method === 'GET' && table === 'orders_with_derived') return jsonRes([{ legacy_id: DB?.legacy_id, order_no: 42, week_number: 41 }]);
    if (method === 'GET' && table === 'audit_log') {
      if (fail.audit) return jsonRes({ message: 'down' }, 500);
      return jsonRes(auditRowsStub);
    }
    if (method === 'POST' && table === 'audit_log') return jsonRes(Array.isArray(body) ? body : [body], 201);
    if (method === 'POST' && table === 'rpc/log_unknown_field') return jsonRes(null);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const patches = () => calls.filter((c) => c.method === 'PATCH' && c.table === 'orders');
const seq = () => calls.map((c) => `${c.method} ${c.table}`);

test('no _expect → today\'s request sequence and response: one PATCH matched by legacy_id only, no _expectChecked', async () => {
  const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(seq(), ['GET orders', 'PATCH orders', 'POST audit_log', 'GET orders_with_derived', 'GET trucks']);
  assert.deepEqual(patches()[0].params, [['legacy_id', 'eq.recORDER0001']]);
  assert.deepEqual(patches()[0].body, { loading_datetime: '2026-10-09T06:00:00.000Z' });
  assert.equal('_expectChecked' in r.json, false);
  assert.equal(r.text.includes('_expect'), false);
  assert.equal(calls.some((c) => c.table === 'audit_log' && c.method === 'GET'), false);
});

test('matching _expect → written, _expectChecked:true, the PATCH carries the raw value it was checked against', async () => {
  const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-08T06:00:00Z' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json._expectChecked, true);
  assert.equal(r.json.fields['Loading DateTime'], '2026-10-09T06:00:00.000Z');
  assert.equal(DB.loading_datetime, '2026-10-09T06:00:00.000Z', 'the fake table holds the new value');
  const p = patches();
  assert.equal(p.length, 1, 'same request count as today: one PATCH');
  assert.deepEqual(p[0].params, [['legacy_id', 'eq.recORDER0001'], ['loading_datetime', 'eq.2026-10-08T06:00:00+00:00']],
    'raw value as PostgREST returned it (Z vs +00:00 compared as the same instant, filtered by the raw text)');
  assert.equal(calls.some((c) => c.table === 'audit_log' && c.method === 'GET'), false, 'no attribution read on success');
});

test('mismatch → 409 {type:conflict, fields, by, at, current} in the caller\'s labels, and NO PATCH reaches PostgREST', async () => {
  DB.loading_datetime = '2026-10-11T06:00:00+00:00';
  const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-08T06:00:00+00:00' } });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual(r.json, { error: { type: 'conflict', fields: ['Loading DateTime'], by: null, at: null, current: { 'Loading DateTime': '2026-10-11T06:00:00+00:00' } } });
  assert.equal(patches().length, 0, 'nothing written');
  assert.equal(DB.loading_datetime, '2026-10-11T06:00:00+00:00');
  assert.equal(calls.some((c) => c.method === 'POST' && c.table === 'audit_log'), false, 'nothing audited');
});

test('mismatch where the body equals current → no 409 (nothing can be lost), the column is left out of the CAS filter', async () => {
  DB.truck_id = 8;   // a trigger already set the truck the user is now writing
  const r = await patchOrder({
    fields: { Truck: ['recTRUCK0008'], 'Loading DateTime': '2026-10-09T06:00:00.000Z' },
    _expect: { Truck: ['recTRUCK0007'], 'Loading DateTime': '2026-10-08T06:00:00+00:00' }
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json._expectChecked, true);
  assert.deepEqual(patches()[0].params, [['legacy_id', 'eq.recORDER0001'], ['loading_datetime', 'eq.2026-10-08T06:00:00+00:00']]);
  assert.equal(DB.truck_id, 8);
  assert.equal(DB.loading_datetime, '2026-10-09T06:00:00.000Z');
});

test('CAS filters: a link compares by record id and filters by the raw FK; a null column filters with is.null; a false checkbox by its raw value', async () => {
  const r = await patchOrder({
    fields: { Truck: ['recTRUCK0009'], 'Partner Truck Plates': 'XYZ9876', 'Is Partner Trip': true },
    _expect: { Truck: ['recTRUCK0007'], 'Partner Truck Plates': null, 'Is Partner Trip': false }
  });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(patches()[0].params, [
    ['legacy_id', 'eq.recORDER0001'], ['truck_id', 'eq.7'], ['partner_truck_plates', 'is.null'], ['is_partner_trip', 'eq.false']
  ]);
  assert.deepEqual([DB.truck_id, DB.partner_truck_plates, DB.is_partner_trip], [9, 'XYZ9876', true]);
  // only the checked link table is resolved for the check (one read), never every link of ORDERS
  const truckReads = calls.filter((c) => c.method === 'GET' && c.table === 'trucks');
  assert.ok(truckReads.length >= 1);
});

test('the row changes between the check and the write (CAS matches 0 rows) → the same 409, nothing written, current re-read', async () => {
  beforePatch = () => { DB.loading_datetime = '2026-10-12T06:00:00+00:00'; beforePatch = null; };   // another user, mid-request
  auditRowsStub = [{ actor: 'colleague', role: 'dispatcher', created_at: '2026-10-11T05:59:58Z',
    before_data: JSON.stringify({ loading_datetime: '2026-10-08T06:00:00+00:00' }), after_data: JSON.stringify({ loading_datetime: '2026-10-12T06:00:00+00:00' }) }];
  const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-08T06:00:00+00:00' } }, { role: 'owner', sub: 'boss' });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual(r.json.error.fields, ['Loading DateTime']);
  assert.deepEqual(r.json.error.current, { 'Loading DateTime': '2026-10-12T06:00:00+00:00' }, 'what the row holds NOW, not the value read before');
  assert.equal(r.json.error.by, 'colleague', 'owner reads names (AUDIT_READERS)');
  assert.equal(r.json.error.at, '2026-10-11T05:59:58Z');
  assert.equal(DB.loading_datetime, '2026-10-12T06:00:00+00:00', 'the other user\'s value survives');
  assert.equal(calls.some((c) => c.method === 'POST' && c.table === 'audit_log'), false);
});

test('failed before-read → written as today (legacy_id only), _expectChecked:"skipped" — an indication, never a lock', async () => {
  fail.before = true;
  const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-01T06:00:00Z' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json._expectChecked, 'skipped');
  assert.deepEqual(patches()[0].params, [['legacy_id', 'eq.recORDER0001']]);
  assert.equal(DB.loading_datetime, '2026-10-09T06:00:00.000Z');
});

test('link resolve fails while checking → no false 409 (the truck is not «empty»), the write happens, "skipped", one console.error', async () => {
  fail.truckRead = true;
  const r = await patchOrder({ fields: { Truck: ['recTRUCK0008'] }, _expect: { Truck: ['recTRUCK0009'] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json._expectChecked, 'skipped');
  assert.equal(DB.truck_id, 8);
  assert.deepEqual(patches()[0].params, [['legacy_id', 'eq.recORDER0001']]);
  assert.ok(errors.some((e) => e.includes('EXPECT shape failed')), errors.join('\n'));
});

test('before === null (no such row) → today\'s 404, unchanged', async () => {
  DB.legacy_id = 'recSOMEOTHER';
  const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-08T06:00:00Z' } });
  assert.equal(r.status, 404, r.text);
  assert.equal(r.json.error, 'Record not found');
  assert.deepEqual(patches()[0].params, [['legacy_id', 'eq.recORDER0001']]);
});

test('a bad _expect is a 400 before anything touches the DB: unknown label, computed label, empty, null, array, more than 12 labels', async () => {
  const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`Loading DateTime ${i + 1}`, null]));
  const cases = [
    { 'Loading Datetime': '2026-10-08' },   // typo: must never switch the check off silently
    { 'Week Number': 41 },                  // computed: read-only, never a checked label
    {}, null, ['Loading DateTime'], many
  ];
  for (const _expect of cases) {
    calls.length = 0;
    const r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect });
    assert.equal(r.status, 400, `${JSON.stringify(_expect).slice(0, 60)} → ${r.text}`);
    assert.match(r.json.error, /_expect/);
    assert.equal(calls.length, 0, 'no DB call');
  }
  assert.equal(DB.loading_datetime, '2026-10-08T06:00:00+00:00');
});

test('«Cross-dock Date» and «VS CD Date» are one column: either label is checked against cross_dock_date, and the 409 answers in the caller\'s label', async () => {
  let r = await patchOrder({ fields: { 'Cross-dock Date': '2026-10-10' }, _expect: { 'Cross-dock Date': '2026-10-09' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json._expectChecked, true);
  assert.deepEqual(patches()[0].params, [['legacy_id', 'eq.recORDER0001'], ['cross_dock_date', 'eq.2026-10-09']]);
  calls.length = 0;
  r = await patchOrder({ fields: { 'VS CD Date': '2026-10-11' }, _expect: { 'Cross-dock Date': '2026-10-09' } });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual(r.json.error.fields, ['Cross-dock Date']);
  assert.deepEqual(r.json.error.current, { 'Cross-dock Date': '2026-10-10' });
  calls.length = 0;
  r = await patchOrder({ fields: { 'VS CD Date': '2026-10-11' }, _expect: { 'VS CD Date': '2026-10-10' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(DB.cross_dock_date, '2026-10-11');
});

test('attribution: a trigger row keyed by id::text (jsonb, role system) → by:"auto"; the audit read asks for both key styles', async () => {
  DB.truck_id = 8;
  auditRowsStub = [
    { actor: 'trigger:rt_sync', role: 'system', created_at: '2026-10-11T06:00:01Z', before_data: { truck_id: 7 }, after_data: { truck_id: 8 } },
    { actor: 'disp2', role: 'dispatcher', created_at: '2026-10-11T05:00:00Z', before_data: JSON.stringify({ truck_id: null }), after_data: JSON.stringify({ truck_id: 7 }) }
  ];
  const r = await patchOrder({ fields: { Truck: ['recTRUCK0009'] }, _expect: { Truck: ['recTRUCK0007'] } }, { role: 'owner', sub: 'boss' });
  assert.equal(r.status, 409, r.text);
  assert.equal(r.json.error.by, 'auto');
  assert.equal(r.json.error.at, '2026-10-11T06:00:01Z');
  assert.deepEqual(r.json.error.current, { Truck: ['recTRUCK0008'] });
  const read = calls.find((c) => c.method === 'GET' && c.table === 'audit_log');
  const p = Object.fromEntries(read.params);
  assert.equal(p.table_name, 'eq.orders');
  assert.equal(p.record_id, 'in.("recORDER0001","42")');
  assert.equal(p.order, 'created_at.desc');
});

test('attribution: rows that do not touch the conflicting column are skipped; a name only for AUDIT_READERS, «user» for a dispatcher', async () => {
  DB.matched_import_id = 'recIMPORT0002';
  auditRowsStub = [
    { actor: 'disp2', role: 'dispatcher', created_at: '2026-10-11T07:00:00Z', before_data: JSON.stringify({ matched_import_id: 'recIMPORT0002', status: 'Pending' }), after_data: JSON.stringify({ matched_import_id: 'recIMPORT0002', status: 'Assigned' }) },
    { actor: 'disp2', role: 'dispatcher', created_at: '2026-10-11T06:30:00Z', before_data: JSON.stringify({ matched_import_id: null }), after_data: JSON.stringify({ matched_import_id: 'recIMPORT0002' }) }
  ];
  const body = { fields: { 'Matched Import ID': 'recIMPORT0003' }, _expect: { 'Matched Import ID': null } };
  let r = await patchOrder(body, { role: 'dispatcher', sub: 'disp1' });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual([r.json.error.by, r.json.error.at], ['user', '2026-10-11T06:30:00Z'], 'the status-only row is skipped; no name for a dispatcher');
  r = await patchOrder(body, { role: 'management', sub: 'mgr1' });
  assert.equal(r.json.error.by, 'disp2');
  assert.equal(DB.matched_import_id, 'recIMPORT0002');
});

test('attribution: no matching audit row → by:null, at:null; an audit read failure is the same, never a 500', async () => {
  DB.matched_import_id = 'recIMPORT0002';
  const body = { fields: { 'Matched Import ID': 'recIMPORT0003' }, _expect: { 'Matched Import ID': null } };
  let r = await patchOrder(body);
  assert.equal(r.status, 409, r.text);
  assert.deepEqual([r.json.error.by, r.json.error.at], [null, null]);
  fail.audit = true;
  r = await patchOrder(body);
  assert.equal(r.status, 409, r.text);
  assert.deepEqual([r.json.error.by, r.json.error.at], [null, null]);
  assert.ok(errors.some((e) => e.includes('EXPECT attribution read failed')));
});

test('a checked label the body does not write, still unchanged → written; changed → 409 even though the body leaves it alone', async () => {
  let r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-09T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-08T06:00:00Z', 'Delivery DateTime': '2026-10-10T08:00:00Z' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(patches()[0].params.map(([k]) => k), ['legacy_id', 'loading_datetime', 'delivery_datetime']);
  calls.length = 0;
  r = await patchOrder({ fields: { 'Loading DateTime': '2026-10-08T06:00:00.000Z' }, _expect: { 'Loading DateTime': '2026-10-09T06:00:00Z', 'Delivery DateTime': '2026-10-11T08:00:00Z' } });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual(r.json.error.fields, ['Delivery DateTime']);
  assert.equal(patches().length, 0);
});
