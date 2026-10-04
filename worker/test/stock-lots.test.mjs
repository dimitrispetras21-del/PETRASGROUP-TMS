// Stock lots Φ1 — the Worker half of migration 057 (owner decisions 3–4/10/2026,
// plan v5 Π8 §4). Two layers, both against worker/src/index.js itself (the
// deploy source), never a copy that could drift (αρχή 3):
//   1. pure pieces lifted out of the source text, like invoice-mark-guard.test.mjs:
//      stockRuleError, PERMISSIONS/can, TABLES, COSTS_PERMS, guard of three;
//   2. the real bundle run in Node with PostgREST stubbed via fetch, like
//      order-docs.test.mjs: each of the six write paths turns a DB refusal into
//      the Greek 422, every other error keeps its 500, nothing is audited for a
//      refused write, and /costs/stock-lots is owner-only.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
const src = readFileSync(SRC_PATH, 'utf8');

// ─────────────────────────────── 1. lifted pieces ───────────────────────────────
function liftVar(name) {
  const m = src.match(new RegExp(`(?:var|const) ${name} = \\{[\\s\\S]*?\\n\\};\\n`));
  assert.ok(m, `${name} not found in worker/src/index.js`);
  return m[0];
}
function liftFn(re, name) {
  const m = src.match(re);
  assert.ok(m, `${name} not found in worker/src/index.js`);
  return m[0];
}
// stockRuleError is ONE mapper for the stock (057) and local-relay (060)
// families, so it is lifted with all three text tables it reads.
const stockRuleError = new Function(
  liftVar('STOCK_CHECK_TEXT') + liftVar('RELAY_RULE_TEXT') + liftVar('RELAY_CHECK_TEXT') +
  liftFn(/function stockRuleError\(e\) \{[\s\S]*?\n\}\n/, 'stockRuleError') + '\nreturn stockRuleError;'
)();
const { PERMISSIONS, can } = new Function(
  liftVar('PERMISSIONS') + liftFn(/function can\(role, table, method\) \{[\s\S]*?\n\}\n/, 'can') + '\nreturn { PERMISSIONS, can };'
)();
const TABLES = new Function(liftVar('TABLES') + '\nreturn TABLES;')();
const COSTS_PERMS = new Function(liftVar('COSTS_PERMS') + '\nreturn COSTS_PERMS;')();

// The Greek texts of the six row CHECKs, as the contract (§4.4) fixes them.
const CHECK_TEXT = {
  orders_stock_piece_no_money: 'Το κομμάτι δεν έχει δική του τιμή ή τιμολόγιο — τιμολογείται η παρτίδα',
  orders_stock_piece_shape: 'Κομμάτι: μία φόρτωση (η αποθήκη), χωρίς ανταλλαγή παλετών, όχι pre-order, όχι σκέλος, όχι ακύρωση',
  national_orders_stock_piece_no_money: 'Το κομμάτι δεν έχει δική του τιμή ή τιμολόγιο — τιμολογείται η παρτίδα',
  national_orders_stock_piece_shape: 'Κομμάτι: μία παραλαβή (η αποθήκη), χωρίς ανταλλαγή παλετών, όχι pre-order, όχι ακύρωση',
  stock_lots_one_source: 'Η παρτίδα δείχνει σε ακριβώς μία παραγγελία',
  stock_lots_close_shape: 'Το κλείσιμο υπολοίπου θέλει αιτιολογία'
};
const OVER_DRAW = 'Υπέρβαση αποθέματος: διαθέσιμες 5 παλέτες, ζητήθηκαν 14';

test('stockRuleError: trigger refusal (23514 + hint stock:<code>) → that code, the DB\'s own Greek message', () => {
  assert.deepEqual(stockRuleError({ pg: { code: '23514', hint: 'stock:over_draw', message: OVER_DRAW, details: null } }),
    { code: 'over_draw', message: OVER_DRAW });
  assert.deepEqual(stockRuleError({ pg: { code: '23514', hint: 'stock:lot_has_pieces', message: 'Η παρτίδα έχει κομμάτια — δεν καταργείται' } }),
    { code: 'lot_has_pieces', message: 'Η παρτίδα έχει κομμάτια — δεν καταργείται' });
});

test('stockRuleError: each of the six CHECKs → its Greek text, by constraint name', () => {
  for (const [name, text] of Object.entries(CHECK_TEXT)) {
    const table = name.startsWith('national_orders') ? 'national_orders' : name.startsWith('stock_lots') ? 'stock_lots' : 'orders';
    const pg = { code: '23514', hint: null, details: 'Failing row contains (…)', message: `new row for relation "${table}" violates check constraint "${name}"` };
    assert.deepEqual(stockRuleError({ pg }), { code: name, message: text }, name);
  }
});

test('stockRuleError: both one-live-lot unique indexes → lot_exists', () => {
  for (const idx of ['stock_lots_order_live', 'stock_lots_nat_live']) {
    const pg = { code: '23505', hint: null, details: 'Key (order_id)=(42) already exists.', message: `duplicate key value violates unique constraint "${idx}"` };
    assert.deepEqual(stockRuleError({ pg }), { code: 'lot_exists', message: 'Η παραγγελία είναι ήδη παρτίδα' }, idx);
  }
});

test('stockRuleError: everything else → null (today\'s 500 path unchanged)', () => {
  // the 043 invoice guard: check_violation, no hint, no CHECK name in the message
  assert.equal(stockRuleError({ pg: { code: '23514', hint: null, details: null, message: 'Δεν σημαίνεται τιμολογημένη χωρίς αριθμό τιμολογίου (ΤΠΥ) του ERP' } }), null);
  assert.equal(stockRuleError({ pg: { code: '23514', hint: null, message: 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή' } }), null);
  assert.equal(stockRuleError(new Error('dbUpdate orders 500: boom')), null, 'no e.pg');
  assert.equal(stockRuleError(null), null);
  assert.equal(stockRuleError({ pg: 'not an object' }), null);
  assert.equal(stockRuleError({ pg: { code: '23514', message: 'new row for relation "orders" violates check constraint "orders_ops_status_check"' } }), null, 'another CHECK');
  assert.equal(stockRuleError({ pg: { code: '23505', message: 'duplicate key value violates unique constraint "orders_legacy_id_key"' } }), null, 'another unique index');
  assert.equal(stockRuleError({ pg: { code: 'P0001', hint: 'stock:over_draw', message: OVER_DRAW } }), null, 'stock hint with another SQLSTATE');
  assert.equal(stockRuleError({ pg: { code: '23514', hint: 'other:thing', message: 'x' } }), null, 'foreign hint prefix');
  assert.equal(stockRuleError({ pg: { code: '23514', message: 'violates check constraint "toString"' } }), null, 'prototype key is not a CHECK text');
});

test('PERMISSIONS: stock_lots per role (owner "*", management GET, accountant GET+PATCH, dispatcher all, warehouse none)', () => {
  const roles = ['owner', 'management', 'accountant', 'dispatcher', 'warehouse'];
  const expect = {
    GET: ['owner', 'management', 'accountant', 'dispatcher'],
    POST: ['owner', 'dispatcher'],
    DELETE: ['owner', 'dispatcher'],
    PATCH: ['owner', 'accountant', 'dispatcher']
  };
  for (const [method, allowed] of Object.entries(expect)) {
    for (const role of roles) assert.equal(can(role, 'stock_lots', method), allowed.includes(role), `${role} ${method}`);
  }
  assert.equal(PERMISSIONS.owner.stock_lots, undefined, 'owner rides its "*" — no row');
  assert.equal(PERMISSIONS.warehouse.stock_lots, undefined, 'warehouse: no row, no wildcard → 403');
  assert.equal(PERMISSIONS.warehouse['*'], undefined);
});

test('PERMISSIONS: orders / national_orders rows identical to the live Worker (0880e779)', () => {
  const rows = (role) => ({ star: PERMISSIONS[role]['*'], orders: PERMISSIONS[role].orders, national_orders: PERMISSIONS[role].national_orders });
  assert.deepEqual(rows('owner'), { star: ['GET', 'POST', 'PATCH', 'DELETE'], orders: undefined, national_orders: undefined });
  assert.deepEqual(rows('management'), { star: ['GET'], orders: ['GET', 'POST', 'PATCH'], national_orders: undefined });
  assert.deepEqual(rows('accountant'), { star: ['GET'], orders: ['GET', 'PATCH'], national_orders: ['GET', 'PATCH'] });
  assert.deepEqual(rows('dispatcher'), { star: undefined, orders: ['GET', 'POST', 'PATCH', 'DELETE'], national_orders: ['GET', 'POST', 'PATCH', 'DELETE'] });
  assert.deepEqual(rows('warehouse'), { star: undefined, orders: ['GET'], national_orders: ['GET'] });
});

test('TABLES: tblStockLots exactly as contract §4.2 — no money, no label both writable and computed', () => {
  assert.deepEqual(TABLES.tblStockLots, {
    name: 'STOCK LOTS',
    pg: 'stock_lots',
    readView: 'stock_v_lots',
    fields: { 'Closed Note': 'closed_note' },
    links: { Order: { column: 'order_id', table: 'orders' } },
    computed: {
      'Lot No': 'lot_no', 'Source Kind': 'source_kind', Reference: 'reference', 'Source Notes': 'source_notes',
      'Client Rec': 'client_rec', 'Client Name': 'client_name',
      'Warehouse Rec': 'warehouse_rec', 'Warehouse Name': 'warehouse_name', 'Warehouse City': 'warehouse_city',
      'Warehouse Country': 'warehouse_country',
      'Intake Status': 'intake_status', 'Intake Delivered': 'intake_delivered', 'Received On': 'received_on',
      'Ops Status': 'ops_status',
      'Stock Pallets': 'stock_pallets', 'Drawn Pallets': 'drawn_pallets', 'Remaining Pallets': 'remaining_pallets',
      'Delivered Pallets': 'delivered_pallets', 'Written Off Pallets': 'written_off_pallets',
      Pieces: 'pieces', 'Pieces Delivered': 'pieces_delivered', 'Pieces Without Truck': 'pieces_without_truck',
      'Pieces Moving': 'pieces_moving',
      'Last Piece Delivered': 'last_piece_delivered', 'Closed At': 'closed_at',
      Complete: 'complete', 'Completed On': 'completed_on', Invoiced: 'invoiced'
    }
  });
  const t = TABLES.tblStockLots;
  for (const label of Object.keys(t.fields)) assert.ok(!(label in t.computed), `${label} in both fields and computed`);
  const all = [...Object.entries(t.fields), ...Object.entries(t.computed), ...Object.entries(t.links).map(([l, v]) => [l, v.column])];
  for (const [label, column] of all) {
    assert.doesNotMatch(label, /price|rate|revenue|margin|profit|cost|amount|charge/i, `money label ${label}`);
    assert.doesNotMatch(column, /price|rate|revenue|margin|profit|cost|amount|charge/i, `money column ${column}`);
  }
  // every facade readView needs id/legacy_id/deleted_at (GET sends deleted_at=is.null + order=id.asc);
  // the facade adds them itself, so they must NOT be labels.
  for (const col of ['id', 'legacy_id', 'deleted_at']) assert.ok(!all.some(([, c]) => c === col), col);
});

test('TABLES: ORDERS gains exactly the Stock Lot link + 4 computed labels', () => {
  const o = TABLES.tblgHlNmLBH3JTdIM;
  assert.deepEqual(o.links['Stock Lot'], { column: 'stock_lot_id', table: 'stock_lots' });
  assert.equal(o.computed['Own Stock Lot'], 'own_stock_lot');
  assert.equal(o.computed['Stock Lot Order No'], 'stock_lot_order_no');
  assert.equal(o.computed['Stock Lot Source'], 'stock_lot_source');
  assert.equal(o.computed['Stock Lot Reference'], 'stock_lot_reference');
  for (const label of ['Stock Lot', 'Own Stock Lot', 'Stock Lot Order No', 'Stock Lot Source', 'Stock Lot Reference']) {
    assert.equal(o.fields[label], undefined, `${label} must not be a scalar field`);
  }
  assert.equal(o.links['Own Stock Lot'], undefined, 'a lot is never written from ORDERS');
  // NATIONAL ORDERS: no stock label in Φ1 (born closed until Φ3)
  const n = TABLES.tblGHCCsTMqAy4KR2;
  const natLabels = [...Object.keys(n.fields), ...Object.keys(n.computed || {}), ...Object.keys(n.links || {})];
  assert.ok(!natLabels.some((l) => /stock/i.test(l)), 'no stock label on NATIONAL ORDERS in Φ1');
});

test('COSTS_PERMS: "stock-lots" exists only on owner — GET (allocation) + PATCH (warehouse charge)', () => {
  for (const [role, perms] of Object.entries(COSTS_PERMS)) {
    if (role === 'owner') assert.deepEqual(perms['stock-lots'], ['GET', 'PATCH']);
    else assert.equal(perms['stock-lots'], undefined, role);
  }
});

test('guard of three still present (CLAUDE.md ⛔ Ο WORKER)', () => {
  assert.deepEqual(PERMISSIONS.dispatcher.order_stops, ['GET', 'POST', 'PATCH', 'DELETE']);
  assert.equal(TABLES.tblgHlNmLBH3JTdIM.fields['VS CD Date'], 'cross_dock_date');
  const w = TABLES.tblMiFxbm9ky8PCQi.fields;
  assert.equal(w.Country, 'country');
  assert.equal(w.Aliases, 'aliases');
  assert.equal(w['VAT Number'], 'tax_id');
  assert.equal(w['Legal Name'], 'legal_name');
});

test('node --check worker/src/index.js', () => {
  execFileSync(process.execPath, ['--check', SRC_PATH], { stdio: 'pipe' });
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
  // a string body is sent verbatim — JSON.stringify cannot produce 1e999 (→ Infinity on parse) or NaN
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const req = new Request(`https://w.invalid${pathAndQuery}`, { method, headers, body: raw });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const LOTS = '/v0/appTEST/tblStockLots';
const ORDERS = '/v0/appTEST/tblgHlNmLBH3JTdIM';

// ---- PostgREST stub ----
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
const pgError = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const LEGACY = {
  orders: { recORDER1: 42, recORDER2: 43, recPIECE1: 50, recPIECE2: 51 },
  stock_lots: { recLOT1: 7 },
  clients: { recCLIENT1: 3 },
  locations: { recWH1: 424, recGR1: 100 }
};
function legacyLookup(table, u) {
  const map = LEGACY[table];
  const li = u.searchParams.get('legacy_id');
  const ii = u.searchParams.get('id');
  if (u.searchParams.get('select') !== 'id,legacy_id') return null;
  if (li && li.startsWith('in.')) {
    const want = [...li.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    return json(want.filter((w) => map[w] != null).map((w) => ({ id: map[w], legacy_id: w })));
  }
  if (ii && ii.startsWith('in.')) {
    const want = ii.slice(4, -1).split(',').map(Number);
    return json(Object.entries(map).filter(([, id]) => want.includes(id)).map(([legacy_id, id]) => ({ id, legacy_id })));
  }
  return null;
}
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
    if (method === 'GET' && LEGACY[table]) {
      const out = legacyLookup(table, u);
      if (out) return out;
    }
    if (method === 'POST' && table === 'audit_log') return json(Array.isArray(body) ? body : [body], 201);
    if (method === 'POST' && table === 'rpc/log_unknown_field') return json(null);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const on = (method, table, handler) => routes.push({ method, table, handler });
const auditRows = () => calls.filter((c) => c.table === 'audit_log').flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
const unknownLogs = () => calls.filter((c) => c.table === 'rpc/log_unknown_field');
const stockReject = (code, message) => pgError(400, { code: '23514', details: null, hint: `stock:${code}`, message });
const STOCK_422 = (code, message) => ({ error: { type: 'STOCK_RULE', code, message } });

const LOT_VIEW_ROW = {
  id: 7, legacy_id: 'recLOT1', deleted_at: null, order_id: 42, nat_order_id: null, lot_no: 42, source_kind: 'intl',
  reference: 'TEST-STOCK-1', source_notes: null, client_id: 3, client_rec: 'recCLIENT1', client_name: 'Πελάτης Α',
  warehouse_location_id: 424, warehouse_rec: 'recWH1', warehouse_name: 'Αποθήκη Χ', warehouse_city: 'X', warehouse_country: 'HU',
  intake_partner_id: null, intake_status: 'Delivered', intake_delivered: true, received_on: '2026-10-01', ops_status: null,
  stock_pallets: 33, drawn_pallets: 20, remaining_pallets: 13, delivered_pallets: 5, written_off_pallets: 0,
  pieces: 2, pieces_delivered: 1, pieces_without_truck: 0, last_piece_delivered: '2026-10-03',
  closed_note: null, closed_at: null, complete: false, completed_on: null, invoiced: false
};

test('GET STOCK LOTS (dispatcher): reads stock_v_lots with deleted_at + id order, Order resolved to a rec, no money', async () => {
  on('GET', 'stock_v_lots', () => json([LOT_VIEW_ROW]));
  const r = await call('dispatcher', 'GET', `${LOTS}?filterByFormula=${encodeURIComponent('{Complete}=0')}`);
  assert.equal(r.status, 200, r.text);
  const read = calls.find((c) => c.table === 'stock_v_lots');
  assert.equal(read.params.get('deleted_at'), 'is.null');
  assert.equal(read.params.get('order'), 'id.asc');
  assert.equal(read.params.get('complete'), 'eq.0');
  const rec = r.json.records[0];
  assert.equal(rec.id, 'recLOT1');
  assert.deepEqual(rec.fields.Order, ['recORDER1']);
  assert.equal(rec.fields['Remaining Pallets'], 13);
  assert.equal(rec.fields.Complete, false);
  assert.equal(rec.fields['Warehouse Rec'], 'recWH1', 'a plain rec string');
  assert.ok(!Object.keys(rec.fields).some((l) => /price|rate|revenue|margin|profit|cost|amount|charge/i.test(l)));
  assert.equal(rec.fields['Closed At'], undefined, 'NULL columns are absent (trap #2)');
});

test('RBAC through the router: warehouse/management/accountant are refused before any DB call', async () => {
  for (const [role, method, p, body] of [
    ['warehouse', 'GET', LOTS],
    ['warehouse', 'POST', LOTS, { fields: { Order: ['recORDER1'] } }],
    ['management', 'POST', LOTS, { fields: { Order: ['recORDER1'] } }],
    ['management', 'PATCH', `${LOTS}/recLOT1`, { fields: { 'Closed Note': 'x' } }],
    ['accountant', 'POST', LOTS, { fields: { Order: ['recORDER1'] } }],
    ['accountant', 'DELETE', `${LOTS}/recLOT1`],
    ['management', 'DELETE', `${LOTS}/recLOT1`]
  ]) {
    calls.length = 0;
    const r = await call(role, method, p, body);
    assert.equal(r.status, 403, `${role} ${method} ${p}`);
    assert.equal(calls.length, 0, `${role} ${method}: no DB call`);
  }
});

test('POST STOCK LOTS (dispatcher marks an order): writes only order_id + minted legacy_id to the base table', async () => {
  on('POST', 'stock_lots', (u, body) => json([{ id: 7, legacy_id: body.legacy_id, order_id: body.order_id, nat_order_id: null, closed_note: null, closed_at: null, created_at: '2026-10-04T15:30:00Z', deleted_at: null }], 201));
  on('GET', 'stock_v_lots', (u) => json([{ ...LOT_VIEW_ROW, legacy_id: u.searchParams.get('legacy_id').slice(3) }]));
  const r = await call('dispatcher', 'POST', LOTS, { fields: { Order: ['recORDER1'] } });
  assert.equal(r.status, 201, r.text);
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'stock_lots');
  assert.deepEqual(Object.keys(ins.body).sort(), ['legacy_id', 'order_id']);
  assert.equal(ins.body.order_id, 42);
  assert.match(ins.body.legacy_id, /^rec[A-Za-z0-9]{14}$/);
  assert.deepEqual(r.json.fields.Order, ['recORDER1']);
  assert.equal(r.json.fields['Stock Pallets'], 33, 'computed re-read from stock_v_lots');
  assert.equal(auditRows().length, 1);
  assert.equal(unknownLogs().length, 0, 'Order is a known label');
});

test('POST STOCK LOTS twice for the same order → 23505 stock_lots_order_live → 422 lot_exists, nothing audited', async () => {
  on('POST', 'stock_lots', () => pgError(409, { code: '23505', details: 'Key (order_id)=(42) already exists.', hint: null, message: 'duplicate key value violates unique constraint "stock_lots_order_live"' }));
  const r = await call('dispatcher', 'POST', LOTS, { fields: { Order: ['recORDER1'] } });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json, STOCK_422('lot_exists', 'Η παραγγελία είναι ήδη παρτίδα'));
  assert.equal(auditRows().length, 0);
});

test('PATCH STOCK LOTS (accountant closes with a reason): only closed_note is written; no unknown-field log', async () => {
  on('GET', 'stock_lots', (u) => (u.searchParams.get('select') === '*' ? json([{ id: 7, legacy_id: 'recLOT1', order_id: 42, closed_note: null, closed_at: null, deleted_at: null }]) : null));
  on('PATCH', 'stock_lots', (u, body) => json([{ id: 7, legacy_id: 'recLOT1', order_id: 42, nat_order_id: null, closed_note: body.closed_note, closed_at: '2026-10-04T15:31:00Z', deleted_at: null }]));
  on('GET', 'stock_v_lots', () => json([{ ...LOT_VIEW_ROW, closed_note: '2 παλέτες χαλασμένες', closed_at: '2026-10-04T15:31:00Z' }]));
  const r = await call('accountant', 'PATCH', `${LOTS}/recLOT1`, { fields: { 'Closed Note': '2 παλέτες χαλασμένες' } });
  assert.equal(r.status, 200, r.text);
  const upd = calls.find((c) => c.method === 'PATCH' && c.table === 'stock_lots');
  assert.deepEqual(upd.body, { closed_note: '2 παλέτες χαλασμένες' });
  assert.equal(upd.params.get('legacy_id'), 'eq.recLOT1');
  assert.equal(r.json.fields['Closed At'], '2026-10-04T15:31:00Z');
  assert.equal(unknownLogs().length, 0, 'Closed Note is a known label');
});

test('PATCH STOCK LOTS close too early → trigger close_early → 422 with the DB\'s Greek message', async () => {
  const msg = 'Κλείσιμο υπολοίπου μόνο όταν η παραλαβή και όλα τα κομμάτια έχουν παραδοθεί';
  on('GET', 'stock_lots', () => json([{ id: 7, legacy_id: 'recLOT1', order_id: 42, closed_note: null, closed_at: null, deleted_at: null }]));
  on('PATCH', 'stock_lots', () => stockReject('close_early', msg));
  const r = await call('dispatcher', 'PATCH', `${LOTS}/recLOT1`, { fields: { 'Closed Note': 'τέλος' } });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json, STOCK_422('close_early', msg));
  assert.equal(auditRows().length, 0);
});

test('PATCH STOCK LOTS with a blank reason → CHECK stock_lots_close_shape → its Greek text', async () => {
  on('GET', 'stock_lots', () => json([{ id: 7, legacy_id: 'recLOT1', order_id: 42, closed_note: null, closed_at: null, deleted_at: null }]));
  on('PATCH', 'stock_lots', () => pgError(400, { code: '23514', details: 'Failing row contains (…)', hint: null, message: 'new row for relation "stock_lots" violates check constraint "stock_lots_close_shape"' }));
  const r = await call('dispatcher', 'PATCH', `${LOTS}/recLOT1`, { fields: { 'Closed Note': '   ' } });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json, STOCK_422('stock_lots_close_shape', 'Το κλείσιμο υπολοίπου θέλει αιτιολογία'));
});

test('DELETE STOCK LOTS (unmark) with pieces → soft delete refused → 422 lot_has_pieces, nothing audited', async () => {
  const msg = 'Η παρτίδα έχει κομμάτια — δεν καταργείται';
  on('PATCH', 'stock_lots', (u, body) => (body.deleted_at ? stockReject('lot_has_pieces', msg) : null));
  const r = await call('dispatcher', 'DELETE', `${LOTS}/recLOT1`);
  assert.equal(r.status, 422);
  assert.deepEqual(r.json, STOCK_422('lot_has_pieces', msg));
  assert.equal(auditRows().length, 0);
});

const PIECE_FIELDS = {
  'Stock Lot': ['recLOT1'], Client: ['recCLIENT1'], Direction: 'Import', Type: 'International',
  'Loading Location 1': ['recWH1'], 'Unloading Location 1': ['recGR1'], 'Loading Pallets 1': 14,
  'Pallet Exchange': false, Status: 'Pending', Reference: 'TEST-STOCK-1',
  'Loading DateTime': '2026-10-06', 'Delivery DateTime': '2026-10-08'
};

test('POST ORDERS piece over the remainder → over_draw 422; the link went to stock_lot_id; no audit, no unknown label', async () => {
  on('POST', 'orders', () => stockReject('over_draw', OVER_DRAW));
  const r = await call('dispatcher', 'POST', ORDERS, { fields: PIECE_FIELDS });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, STOCK_422('over_draw', OVER_DRAW));
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'orders');
  assert.equal(ins.body.stock_lot_id, 7);
  assert.equal(ins.body.loading_location_1_id, 424);
  assert.equal('price' in ins.body, false);
  assert.equal(auditRows().length, 0);
  assert.equal(unknownLogs().length, 0, '"Stock Lot" is a known ORDERS label');
});

test('POST ORDERS batch with a priced piece → CHECK orders_stock_piece_no_money → 422 (one insert: nothing landed)', async () => {
  on('POST', 'orders', () => pgError(400, { code: '23514', details: 'Failing row contains (…)', hint: null, message: 'new row for relation "orders" violates check constraint "orders_stock_piece_no_money"' }));
  const r = await call('dispatcher', 'POST', ORDERS, { records: [{ fields: { ...PIECE_FIELDS, Price: 500 } }] });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, STOCK_422('orders_stock_piece_no_money', CHECK_TEXT.orders_stock_piece_no_money));
  assert.equal(auditRows().length, 0);
});

test('PATCH ORDERS piece pallets on a closed lot → lot_closed 422; nothing audited', async () => {
  const msg = 'Η παρτίδα έκλεισε — όχι νέα κομμάτια ή αλλαγές παλετών';
  on('GET', 'orders', (u) => (u.searchParams.get('select') === '*' ? json([{ id: 50, legacy_id: 'recPIECE1', stock_lot_id: 7, invoiced: false }]) : null));
  on('PATCH', 'orders', () => stockReject('lot_closed', msg));
  const r = await call('dispatcher', 'PATCH', `${ORDERS}/recPIECE1`, { fields: { 'Loading Pallets 1': 20 } });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, STOCK_422('lot_closed', msg));
  assert.equal(auditRows().length, 0);
});

test('batch PATCH ORDERS: row 1 lands, row 2 refused → 422, and row 1 IS audited (as today)', async () => {
  on('GET', 'orders', (u) => (u.searchParams.get('select') === '*' ? json([{ id: 50, legacy_id: 'recPIECE1' }, { id: 51, legacy_id: 'recPIECE2' }]) : null));
  on('PATCH', 'orders', (u, body) => (u.searchParams.get('legacy_id') === 'eq.recPIECE1'
    ? json([{ id: 50, legacy_id: 'recPIECE1', ...body }])
    : stockReject('over_draw', OVER_DRAW)));
  const r = await call('dispatcher', 'PATCH', ORDERS, { records: [
    { id: 'recPIECE1', fields: { Reference: 'TEST-STOCK-1b' } },
    { id: 'recPIECE2', fields: { 'Loading Pallets 1': 40 } }
  ] });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, STOCK_422('over_draw', OVER_DRAW));
  const audited = auditRows();
  assert.equal(audited.length, 1);
  assert.equal(audited[0].record_id, 'recPIECE1');
});

test('DELETE ORDERS of a lot source with pieces → cascade RPC refused → 422 lot_has_pieces, nothing audited', async () => {
  const msg = 'Η παρτίδα έχει κομμάτια — δεν σβήνεται, δεν αλλάζει πελάτη ή αποθήκη';
  on('POST', 'rpc/delete_order_cascade', (u, body) => (body.p_order_legacy_id === 'recORDER1' ? stockReject('lot_has_pieces', msg) : null));
  const r = await call('owner', 'DELETE', `${ORDERS}/recORDER1`);
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, STOCK_422('lot_has_pieces', msg));
  assert.equal(auditRows().length, 0);
});

test('non-stock errors keep today\'s 500s — the 043 invoice guard and a non-JSON body included', async () => {
  on('GET', 'orders', (u) => (u.searchParams.get('select') === '*' ? json([{ id: 42, legacy_id: 'recORDER1', invoiced: false, invoice_number: 'ΤΠΥ-1', price: 900 }]) : null));
  on('PATCH', 'orders', () => pgError(400, { code: '23514', details: null, hint: null, message: 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή' }));
  let r = await call('owner', 'PATCH', `${ORDERS}/recORDER1`, { fields: { Notes: 'x' } });
  assert.equal(r.status, 500);
  assert.deepEqual(r.json, { error: 'Failed to update record' });
  routes.length = 0;
  on('POST', 'rpc/delete_order_cascade', () => new Response('<html>bad gateway</html>', { status: 502 }));
  r = await call('owner', 'DELETE', `${ORDERS}/recORDER1`);
  assert.equal(r.status, 500);
  assert.deepEqual(r.json, { error: 'Failed to delete order' });
});

test('a Greek message longer than the 200-char log cut still maps — parsed from the FULL body', async () => {
  const long = 'Υπέρβαση αποθέματος: ' + 'α'.repeat(400);
  on('POST', 'orders', () => stockReject('over_draw', long));
  const r = await call('dispatcher', 'POST', ORDERS, { fields: PIECE_FIELDS });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json, STOCK_422('over_draw', long));
});

// ---- /costs/stock-lots (Ε1 money, owner only) ----
// stock_v_lot_money as contract round 2 fixes it: charge = partner_cost (the
// assignment on the source) + warehouse_charge (the field) — intake_cost is gone.
// recLOT1: a partner carried it in, no extra warehouse charge → 'ok'.
// recLOT2: our own truck carried it in and the field is empty → 'no_charge',
// so nothing is allocated (charge_total/net/per_pallet NULL).
const MONEY = [
  { lot_id: 7, lot_rec: 'recLOT1', source_kind: 'intl', source_id: 42, source_rec: 'recORDER1', price: 3300, partner_cost: 300, warehouse_charge: null, charge_total: 300, net: 3000, total_pallets: 33, per_pallet: 90.9091, drawn_pallets: 20, allocated_amount: 1818.18, remaining_pallets: 13, in_stock_amount: 1181.82, written_off_pallets: 0, written_off_amount: 0, closed_at: null, allocation_status: 'ok' },
  { lot_id: 8, lot_rec: 'recLOT2', source_kind: 'intl', source_id: 43, source_rec: 'recORDER2', price: 2000, partner_cost: null, warehouse_charge: null, charge_total: null, net: null, total_pallets: 20, per_pallet: null, drawn_pallets: 0, allocated_amount: null, remaining_pallets: 20, in_stock_amount: null, written_off_pallets: 0, written_off_amount: null, closed_at: null, allocation_status: 'no_charge' }
];
const ALLOC = [
  { lot_id: 7, lot_rec: 'recLOT1', piece_kind: 'intl', piece_id: 50, piece_rec: 'recPIECE1', seq: 1, pallets: 5, cum_pallets: 5, amount: 454.55 },
  { lot_id: 7, lot_rec: 'recLOT1', piece_kind: 'intl', piece_id: 51, piece_rec: 'recPIECE2', seq: 2, pallets: 15, cum_pallets: 20, amount: 1363.63 }
];
// the money views honour ?lot_rec=eq.<rec> like PostgREST would
const byLot = (rows) => (u) => {
  const f = u.searchParams.get('lot_rec');
  return json(f ? rows.filter((r) => `eq.${r.lot_rec}` === f) : rows);
};

test('GET /costs/stock-lots?lot= (owner): both money views, filtered by lot_rec, ordered; served as is', async () => {
  on('GET', 'stock_v_lot_money', byLot(MONEY));
  on('GET', 'stock_v_lot_alloc', byLot(ALLOC));
  const r = await call('owner', 'GET', '/costs/stock-lots?lot=recLOT1');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { lots: [MONEY[0]], pieces: ALLOC });
  const m = calls.find((c) => c.table === 'stock_v_lot_money');
  const a = calls.find((c) => c.table === 'stock_v_lot_alloc');
  assert.equal(m.params.get('lot_rec'), 'eq.recLOT1');
  assert.equal(a.params.get('lot_rec'), 'eq.recLOT1');
  assert.equal(m.params.get('order'), 'lot_id.asc');
  assert.equal(a.params.get('order'), 'lot_id.asc,seq.asc');
  // without ?lot= : every lot, no lot filter
  calls.length = 0;
  const all = await call('owner', 'GET', '/costs/stock-lots');
  assert.equal(all.status, 200);
  assert.deepEqual(all.json.lots, MONEY, "the 'no_charge' lot is served too — the screen says why it is not allocated");
  assert.equal(calls.find((c) => c.table === 'stock_v_lot_money').params.get('lot_rec'), null);
});

test('GET /costs/stock-lots: every other role → 403 before any read (dispatchers never see the allocation)', async () => {
  for (const role of ['dispatcher', 'accountant', 'management', 'warehouse']) {
    calls.length = 0;
    const r = await call(role, 'GET', '/costs/stock-lots?lot=recLOT1');
    assert.equal(r.status, 403, role);
    assert.equal(calls.length, 0, role);
  }
});

test('GET /costs/stock-lots: a bad lot id → 400; a failed read → 500 «Ο επιμερισμός δεν διαβάστηκε», never an empty list', async () => {
  for (const q of ['?lot=', '?lot=abc', '?lot=rec%22)%2Cor', '?lot=rec' + 'a'.repeat(33)]) {
    calls.length = 0;
    const r = await call('owner', 'GET', '/costs/stock-lots' + q);
    assert.equal(r.status, 400, q);
    assert.equal(calls.length, 0, q);
  }
  on('GET', 'stock_v_lot_money', () => json(MONEY));
  on('GET', 'stock_v_lot_alloc', () => pgError(500, { code: '42P01', message: 'relation "public.stock_v_lot_alloc" does not exist' }));
  const r = await call('owner', 'GET', '/costs/stock-lots?lot=recLOT1');
  assert.equal(r.status, 500);
  assert.deepEqual(r.json, { error: 'Ο επιμερισμός δεν διαβάστηκε' });
});

// ---- PATCH /costs/stock-lots/<lotRec> — «Χρέωση αποθήκης» (contract round 2, owner only) ----
const CHARGE = (rec) => `/costs/stock-lots/${rec}`;
const BAD_CHARGE = { error: 'Μη έγκυρη χρέωση αποθήκης' };
const BAD_LOT = { error: 'Μη έγκυρη παρτίδα' };
const NOT_SAVED = { error: 'Η χρέωση αποθήκης δεν αποθηκεύτηκε' };
// the live lot the route looks up first (stock_lots by legacy_id, deleted_at IS NULL)
const liveLot = (rec, charge) => (u) => (u.searchParams.get('legacy_id') === `eq.${rec}` && u.searchParams.get('deleted_at') === 'is.null'
  ? json([{ id: rec === 'recLOT1' ? 7 : 8, legacy_id: rec, warehouse_charge: charge }])
  : json([]));
const patched = (rec) => (u, body) => json([{ id: rec === 'recLOT1' ? 7 : 8, legacy_id: rec, order_id: 42, nat_order_id: null, closed_note: null, closed_at: null, deleted_at: null, ...body }]);
// what the DB computes after 150.50 € of storage on recLOT1: charge 450.50, net 2849.50
const READ_BACK = { ...MONEY[0], warehouse_charge: 150.5, charge_total: 450.5, net: 2849.5, per_pallet: 86.3485, allocated_amount: 1726.97, in_stock_amount: 1122.53 };
const readBack = (row) => (u) => (u.searchParams.get('lot_rec') === `eq.${row.lot_rec}` ? json([row]) : json([]));

test('PATCH /costs/stock-lots/<rec> (owner): writes ONLY warehouse_charge on the live lot, audits before/after, returns the read-back row', async () => {
  on('GET', 'stock_lots', liveLot('recLOT1', null));
  on('PATCH', 'stock_lots', patched('recLOT1'));
  on('GET', 'stock_v_lot_money', readBack(READ_BACK));
  const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 150.5 });
  assert.equal(r.status, 200, r.text);
  // the response is the VIEW's row (net/charge_total recomputed by the DB), never an echo of the typed value
  assert.deepEqual(r.json, { lot: READ_BACK });
  const upd = calls.find((c) => c.method === 'PATCH' && c.table === 'stock_lots');
  assert.deepEqual(upd.body, { warehouse_charge: 150.5 });
  assert.equal(upd.params.get('id'), 'eq.7', 'the write targets the primary key just read — one row at most');
  assert.equal(upd.params.get('legacy_id'), null);
  assert.equal(upd.params.get('deleted_at'), 'is.null', 'a lot soft-deleted between the lookup and the write is not touched');
  const audited = auditRows();
  assert.equal(audited.length, 1);
  assert.equal(audited[0].action, 'update');
  assert.equal(audited[0].table_name, 'stock_lots');
  assert.equal(audited[0].record_id, 'recLOT1');
  assert.equal(audited[0].role, 'owner');
  assert.deepEqual(JSON.parse(audited[0].before_data), { warehouse_charge: null });
  assert.deepEqual(JSON.parse(audited[0].after_data), { warehouse_charge: 150.5 });
  // order: lookup → write → audit → read-back
  const seq = calls.map((c) => `${c.method} ${c.table}`);
  assert.deepEqual(seq, ['GET stock_lots', 'PATCH stock_lots', 'POST audit_log', 'GET stock_v_lot_money']);
  assert.equal(calls[3].params.get('lot_rec'), 'eq.recLOT1');
});

test('PATCH /costs/stock-lots/<rec>: null clears the field (→ no_charge for an own-truck lot); 0 is a real value', async () => {
  on('GET', 'stock_lots', liveLot('recLOT2', 120));
  on('PATCH', 'stock_lots', patched('recLOT2'));
  on('GET', 'stock_v_lot_money', readBack(MONEY[1]));
  let r = await call('owner', 'PATCH', CHARGE('recLOT2'), { warehouse_charge: null });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { warehouse_charge: null }, 'null is sent, not dropped');
  assert.deepEqual(r.json, { lot: MONEY[1] });
  assert.equal(r.json.lot.allocation_status, 'no_charge');
  let a = auditRows();
  assert.equal(a.length, 1);
  assert.deepEqual(JSON.parse(a[0].before_data), { warehouse_charge: 120 });
  assert.deepEqual(JSON.parse(a[0].after_data), { warehouse_charge: null });
  // 0 = «the warehouse charges nothing» — allocated, not missing
  routes.length = 0;
  calls.length = 0;
  const zero = { ...MONEY[1], warehouse_charge: 0, charge_total: 0, net: 2000, per_pallet: 100, allocated_amount: 0, in_stock_amount: 2000, written_off_amount: 0, allocation_status: 'ok' };
  on('GET', 'stock_lots', liveLot('recLOT2', null));
  on('PATCH', 'stock_lots', patched('recLOT2'));
  on('GET', 'stock_v_lot_money', readBack(zero));
  r = await call('owner', 'PATCH', CHARGE('recLOT2'), { warehouse_charge: 0 });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { warehouse_charge: 0 });
  assert.deepEqual(r.json, { lot: zero });
  a = auditRows();
  assert.deepEqual(JSON.parse(a[0].after_data), { warehouse_charge: 0 });
});

test('PATCH /costs/stock-lots/<rec>: every other role → 403 before any DB call', async () => {
  for (const role of ['dispatcher', 'accountant', 'management', 'warehouse']) {
    calls.length = 0;
    const r = await call(role, 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 10 });
    assert.equal(r.status, 403, role);
    assert.equal(calls.length, 0, role);
  }
});

test('PATCH /costs/stock-lots/<rec>: a bad body → 400 «Μη έγκυρη χρέωση αποθήκης», before any DB call', async () => {
  for (const body of [
    '', 'not json', '[]', 'null', '42', '{"warehouse_charge":NaN}',
    '{"warehouse_charge":1e999}', // parses to Infinity
    {}, [150], { charge: 150 },
    { warehouse_charge: '150' }, { warehouse_charge: '' }, { warehouse_charge: true }, { warehouse_charge: [150] }, { warehouse_charge: { v: 1 } },
    { warehouse_charge: -0.01 }, { warehouse_charge: -150 },
    { warehouse_charge: 1.005 }, { warehouse_charge: 150.123 }, { warehouse_charge: 0.1 + 0.2 },
    { warehouse_charge: 1e10 }, // past numeric(12,2)
    { warehouse_charge: 150, note: 'x' }, { warehouse_charge: 150, lot_rec: 'recLOT2' }, { warehouse_charge: null, closed_note: 'x' }
  ]) {
    calls.length = 0;
    const r = await call('owner', 'PATCH', CHARGE('recLOT1'), body);
    const label = typeof body === 'string' ? body : JSON.stringify(body);
    assert.equal(r.status, 400, label);
    assert.deepEqual(r.json, BAD_CHARGE, label);
    assert.equal(calls.length, 0, label);
  }
  // the edges that ARE valid: two decimals, the column's maximum
  for (const v of [0.01, 0.29, 1234.56, 9999999999.99]) {
    routes.length = 0;
    calls.length = 0;
    on('GET', 'stock_lots', liveLot('recLOT1', null));
    on('PATCH', 'stock_lots', patched('recLOT1'));
    on('GET', 'stock_v_lot_money', readBack({ ...READ_BACK, warehouse_charge: v }));
    const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: v });
    assert.equal(r.status, 200, `${v}: ${r.text}`);
    assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { warehouse_charge: v });
  }
});

test('PATCH /costs/stock-lots/<rec>: a bad lot rec → 400 «Μη έγκυρη παρτίδα», before any DB call', async () => {
  for (const rec of ['abc', 'rec', 'rec%22)%2Cor', 'recLOT1%26deleted_at%3Dnot.is.null', 'rec' + 'a'.repeat(33)]) {
    calls.length = 0;
    const r = await call('owner', 'PATCH', CHARGE(rec), { warehouse_charge: 10 });
    assert.equal(r.status, 400, rec);
    assert.deepEqual(r.json, BAD_LOT, rec);
    assert.equal(calls.length, 0, rec);
  }
});

test('PATCH /costs/stock-lots/<rec>: no live lot → 404 «Η παρτίδα δεν βρέθηκε»; nothing written, nothing audited', async () => {
  on('GET', 'stock_lots', liveLot('recLOT1', null)); // only recLOT1 is live
  const r = await call('owner', 'PATCH', CHARGE('recGONE1'), { warehouse_charge: 10 });
  assert.equal(r.status, 404, r.text);
  assert.deepEqual(r.json, { error: 'Η παρτίδα δεν βρέθηκε' });
  const look = calls.find((c) => c.method === 'GET' && c.table === 'stock_lots');
  assert.equal(look.params.get('legacy_id'), 'eq.recGONE1');
  assert.equal(look.params.get('deleted_at'), 'is.null', 'a soft-deleted lot counts as not found');
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.equal(auditRows().length, 0);
});

test('PATCH /costs/stock-lots/<rec>: invoiced lot → stock_guard_lots lot_invoiced → Greek 422; nothing audited, no read-back', async () => {
  const msg = 'Η παρτίδα τιμολογήθηκε — δεν αλλάζει';
  on('GET', 'stock_lots', liveLot('recLOT1', 300));
  on('PATCH', 'stock_lots', () => stockReject('lot_invoiced', msg));
  const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 150 });
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json, STOCK_422('lot_invoiced', msg));
  assert.equal(auditRows().length, 0);
  assert.equal(calls.filter((c) => c.table === 'stock_v_lot_money').length, 0);
});

test('PATCH /costs/stock-lots/<rec>: any other DB failure → 500 «Η χρέωση αποθήκης δεν αποθηκεύτηκε», never a 200', async () => {
  for (const fail of [
    () => pgError(400, { code: '42703', details: null, hint: null, message: 'column "warehouse_charge" of relation "stock_lots" does not exist' }),
    () => pgError(400, { code: '23514', details: null, hint: null, message: 'new row for relation "stock_lots" violates check constraint "stock_lots_warehouse_charge_check"' }),
    () => new Response('<html>bad gateway</html>', { status: 502 })
  ]) {
    routes.length = 0;
    calls.length = 0;
    on('GET', 'stock_lots', liveLot('recLOT1', null));
    on('PATCH', 'stock_lots', fail);
    const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 150 });
    assert.equal(r.status, 500, r.text);
    assert.deepEqual(r.json, NOT_SAVED);
    assert.equal(auditRows().length, 0);
  }
  // the lookup itself failing is the same «not saved» — nothing was written
  routes.length = 0;
  calls.length = 0;
  on('GET', 'stock_lots', () => pgError(503, { code: 'PGRST000', message: 'connection refused' }));
  const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 150 });
  assert.equal(r.status, 500, r.text);
  assert.deepEqual(r.json, NOT_SAVED);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
});

test('PATCH /costs/stock-lots/<rec>: 0 rows patched → 409 «Η χρέωση αποθήκης δεν γράφτηκε»; nothing audited', async () => {
  on('GET', 'stock_lots', liveLot('recLOT1', null));
  on('PATCH', 'stock_lots', () => json([])); // e.g. soft-deleted between the lookup and the write
  const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 150 });
  assert.equal(r.status, 409, r.text);
  assert.deepEqual(r.json, { error: 'Η χρέωση αποθήκης δεν γράφτηκε' });
  assert.equal(auditRows().length, 0);
  assert.equal(calls.filter((c) => c.table === 'stock_v_lot_money').length, 0);
});

test('PATCH /costs/stock-lots/<rec>: the write landed but the read-back failed → 500 that says so (audited, not «not saved»)', async () => {
  on('GET', 'stock_lots', liveLot('recLOT1', null));
  on('PATCH', 'stock_lots', patched('recLOT1'));
  for (const view of [() => pgError(500, { code: '42P01', message: 'relation "public.stock_v_lot_money" does not exist' }), () => json([])]) {
    routes.splice(2);
    calls.length = 0;
    on('GET', 'stock_v_lot_money', view);
    const r = await call('owner', 'PATCH', CHARGE('recLOT1'), { warehouse_charge: 150 });
    assert.equal(r.status, 500, r.text);
    assert.deepEqual(r.json, { error: 'Η χρέωση αποθήκης γράφτηκε, αλλά δεν ξαναδιαβάστηκε — άνοιξε ξανά την παραγγελία' });
    assert.equal(auditRows().length, 1, 'the write happened, so it is on the record');
  }
});

// ---- PATCH /costs/settings full_truck_pallets (contract round 2, ADDENDUM A, owner 4/10) ----
// F prorates the VS charge of a stock piece (X × min(pallets, F) / F). The DB
// CHECK (value > 0 for this key) is the real guard; the Worker only answers it
// first, in Greek, instead of the generic failure a CHECK would become.
test('PATCH /costs/settings: full_truck_pallets ≤ 0 → 400 in Greek before any DB call; > 0 (non-integer too) passes; other keys untouched', async () => {
  for (const value of [0, -33, -0.5]) {
    calls.length = 0;
    const r = await call('owner', 'PATCH', '/costs/settings', { key: 'full_truck_pallets', value });
    assert.equal(r.status, 400, `${value}: ${r.text}`);
    assert.deepEqual(r.json, { error: 'Οι παλέτες γεμάτου φορτηγού πρέπει να είναι πάνω από 0' }, String(value));
    assert.equal(calls.length, 0, String(value));
  }
  // 1e999 / NaN-ish raw bodies: Infinity would reach the DB as null (review round 2, P3-c)
  for (const raw of ['{"key":"x_import","value":1e999}', '{"key":"full_truck_pallets","value":1e999}', '{"key":"x_export","value":-1e999}']) {
    calls.length = 0;
    const r = await call('owner', 'PATCH', '/costs/settings', raw);
    assert.equal(r.status, 400, `${raw}: ${r.text}`);
    assert.equal(calls.length, 0, raw);
  }
  on('GET', 'ct_settings', (u) => json([{ key: u.searchParams.get('key').slice(3), value: 1, updated_at: '2026-10-01T00:00:00Z' }]));
  on('PATCH', 'ct_settings', (u, body) => json([{ key: u.searchParams.get('key').slice(3), ...body }]));
  for (const [key, value] of [['full_truck_pallets', 33], ['full_truck_pallets', 32.5], ['x_import', 0]]) {
    calls.length = 0;
    const r = await call('owner', 'PATCH', '/costs/settings', { key, value });
    assert.equal(r.status, 200, `${key}=${value}: ${r.text}`);
    assert.equal(calls.find((c) => c.method === 'PATCH').body.value, value);
  }
});
