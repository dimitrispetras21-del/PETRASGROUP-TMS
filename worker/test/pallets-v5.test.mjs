// 073 / E11 (spec 5, D-9): the pallet rows of the national plan (pl_movements.piece_leg_id) have ONE writer - the
// base's plan_h_pallet_sync. Through /pallets/*: GET names their national order (the ledger shows «εθνική #…», F4,
// never «Χειροκίνητη»); PATCH changes only given and the sheet (taken is the plan's); DELETE is refused (the plan
// withdraws its own rows); a reversal's replacement stays the leg's row. And the base's new pl_mov_stop_once (one
// live row per international stop and event) answers 409 in Greek instead of a bare 500. Rows without piece_leg_id
// behave exactly as before.
// Task 9 deviation (principle 1): a request that would CHANGE a plan-owned field is refused, never dropped behind a
// 200 - on PATCH and on the replacement of a reversal alike; a plan-owned field sent with the value the row already
// has (today's ledger sends taken on confirm and the whole row on a fix) is no change and is not written back.
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
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function call(role, pathAndQuery, method = 'GET', body) {
  const req = new Request(`https://w.invalid${pathAndQuery}`, { method, headers: { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}`,
    'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}


const ROWS = [
  { id: 1, code: 'PM-1', status: 'pending', event_type: 'LOADING', counterparty_type: 'CLIENT', client_id: 5, movement_date: '2026-10-14', taken: 10, given: 0, piece_leg_id: 70 },
  { id: 2, code: 'PM-2', status: 'pending', event_type: 'DELIVERY', counterparty_type: 'CLIENT', client_id: 5, movement_date: '2026-10-14', taken: 33, given: 33, order_id: 9, order_stop_id: 4, piece_leg_id: null },
  { id: 3, code: 'PM-3', status: 'confirmed', event_type: 'DELIVERY', counterparty_type: 'CLIENT', client_id: 5, location_id: 6, movement_date: '2026-10-14', taken: 10, given: 10, piece_leg_id: 70 },
];
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
let calls; let legsFail; let insertError; let legsRows;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = []; legsFail = false; insertError = null;
  legsRows = [{ id: 70, shipment_pieces: { shipments: { nat_order_id: 501 } } }];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ method, table, params: u.searchParams, body: init.body ? JSON.parse(init.body) : null });
    if (table === 'pl_movements' && method === 'GET') {
      const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      return json(id ? ROWS.filter((r) => String(r.id) === id) : ROWS);
    }
    if (table === 'piece_legs') {
      if (legsFail) return json({ message: 'boom' }, 500);
      return json(legsRows);
    }
    if (table === 'pl_movements' && method === 'PATCH') return json([{ ...ROWS[0], ...JSON.parse(init.body) }]);
    if (table === 'pl_movements' && method === 'POST') {
      if (insertError) return json(insertError, 409);
      return json([{ id: 3, ...JSON.parse(init.body) }], 201);
    }
    if (table === 'pl_movements' && method === 'DELETE') return new Response(null, { status: 204 });
    if (table === 'audit_log') return json([], 201);
    // refs resolve by legacy id: recX is another client than the rows' (6 vs 5), every other ref resolves to 5
    if (['clients', 'locations', 'orders', 'order_stops'].includes(table)) {
      return json([{ id: u.searchParams.get('legacy_id') === 'eq.recX' ? 6 : 5 }]);
    }
    throw new Error(`unmocked fetch: ${method} ${table}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });

test('GET: a row of the plan names its national order; a manual row is as before', async () => {
  const r = await call('accountant', '/pallets/movements');
  assert.equal(r.status, 200, r.text);
  const by = Object.fromEntries(r.json.records.map((x) => [x.id, x]));
  assert.equal(by[1].nat_order_id, 501);
  assert.equal('nat_order_id' in by[2], false);
  const legs = calls.find((c) => c.table === 'piece_legs');
  assert.equal(legs.params.get('id'), 'in.(70)', 'one read for the page');
});

test('GET: the lookup fails - the list loads and says it does not know', async () => {
  legsFail = true;
  const r = await call('accountant', '/pallets/movements');
  assert.equal(r.status, 200, r.text);
  const one = r.json.records.find((x) => x.id === 1);
  assert.equal(one.nat_order_id, null);
  assert.equal(one.nat_order_unknown, true);
});

test('GET: a leg missing from the answer, or a leg without a national order - unknown, never a manual entry', async () => {
  for (const answer of [[], [{ id: 70, shipment_pieces: { shipments: { nat_order_id: null } } }], [{ id: 70, shipment_pieces: null }]]) {
    legsRows = answer;
    const r = await call('accountant', '/pallets/movements');
    assert.equal(r.status, 200, r.text);
    for (const id of [1, 3]) {
      const one = r.json.records.find((x) => x.id === id);
      assert.equal(one.nat_order_id, null, JSON.stringify(answer));
      assert.equal(one.nat_order_unknown, true, JSON.stringify(answer));
    }
    assert.equal('nat_order_unknown' in r.json.records.find((x) => x.id === 2), false, 'a manual row: as before');
  }
});

test('PATCH: on a row of the plan only given and the sheet change', async () => {
  const ok = await call('warehouse', '/pallets/movements/1', 'PATCH', { given: 8, sheet_source: 'MANUAL' });
  assert.equal(ok.status, 200, ok.text);
  // taken is the plan's (the piece's pallets): corrected in the plan, or the next change of the leg would undo it
  for (const body of [{ movement_date: '2026-10-15' }, { client_rec: 'recX' }, { event_type: 'DELIVERY' }, { given: 8, location_rec: 'recY' }, { taken: 9 }]) {
    calls = [];
    const r = await call('owner', '/pallets/movements/1', 'PATCH', body);
    assert.equal(r.status, 409, JSON.stringify(body));
    assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0, 'nothing written');
  }
  const manual = await call('owner', '/pallets/movements/2', 'PATCH', { movement_date: '2026-10-15' });
  assert.equal(manual.status, 200, 'a manual row edits as before');
});

test('PATCH: today\'s confirm sends taken back unchanged - accepted, and only the user\'s fields are written', async () => {
  // modules/pallet_ledger.js plvDoConfirm: { taken, given, sheet_source } from the dialog
  const r = await call('warehouse', '/pallets/movements/1', 'PATCH', { taken: 10, given: 3, sheet_source: 'MANUAL', client_rec: 'recC' });
  assert.equal(r.status, 200, r.text);
  const w = calls.filter((c) => c.method === 'PATCH' && c.table === 'pl_movements');
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].body, { given: 3, sheet_source: 'MANUAL' }, 'taken and the client stay the plan\'s (never written back)');
  calls = [];
  const none = await call('warehouse', '/pallets/movements/1', 'PATCH', { taken: 10 });
  assert.equal(none.status, 400, 'nothing to change is said, never a 200');
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
});

test('DELETE: a row of the plan is refused; a manual pending row is deleted as before', async () => {
  const r = await call('owner', '/pallets/movements/1', 'DELETE');
  assert.equal(r.status, 409, r.text);
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 0);
  const m = await call('owner', '/pallets/movements/2', 'DELETE');
  assert.equal(m.status, 200, m.text);
});

test('reverse: the replacement of a row of the plan stays the leg\'s row (only given, sheet, notes from the body)', async () => {
  const r = await call('accountant', '/pallets/movements/3/reverse', 'POST',
    // the shape of today's ledger fix (plvDoFix): the whole row copied back, plan-owned values unchanged
    { reason: 'TEST', replacement: { given: 8, client_rec: 'recC', movement_date: '2026-10-14', event_type: 'DELIVERY', taken: 10,
      counterparty_type: 'CLIENT', partner_id: null, order_stop_id: null, order_id: null } });
  assert.equal(r.status, 200, r.text);
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'pl_movements');
  const { partner_id: _p, ...got } = ins.body;   // null on a real row, absent in this mock: not the point here
  assert.deepEqual(got, { movement_date: '2026-10-14', counterparty_type: 'CLIENT', client_id: 5, location_id: 6,
    event_type: 'DELIVERY', taken: 10, given: 8, reversal_of: 3, created_by: 'tester', piece_leg_id: 70 });
  const patchIdx = calls.findIndex((c) => c.method === 'PATCH'), insIdx = calls.findIndex((c) => c.method === 'POST' && c.table === 'pl_movements');
  assert.ok(patchIdx >= 0 && patchIdx < insIdx, 'the old row is reversed first (pl_mov_leg_once counts live rows only)');
});

test('reverse: a replacement that would change a plan-owned field is refused before anything is written', async () => {
  for (const replacement of [{ given: 8, taken: 7 }, { given: 8, client_rec: 'recX' }, { movement_date: '2026-10-20' },
    { event_type: 'LOADING' }, { location_rec: 'recY' }]) {
    calls = [];
    const r = await call('accountant', '/pallets/movements/3/reverse', 'POST', { reason: 'TEST', replacement });
    assert.equal(r.status, 409, JSON.stringify(replacement));
    assert.match(r.text, /προγραμματισμό εθνικών/);
    assert.equal(calls.filter((c) => c.method !== 'GET').length, 0, `nothing written: ${JSON.stringify(replacement)}`);
  }
  calls = [];
  const plain = await call('accountant', '/pallets/movements/3/reverse', 'POST', { reason: 'TEST' });
  assert.equal(plain.status, 200, 'a reversal without a replacement: as before');
  calls = [];
  // a body with only the user's fields: what it does not send is the row's, never a default 0
  const own = await call('accountant', '/pallets/movements/3/reverse', 'POST', { reason: 'TEST', replacement: { given: 8, notes: 'n' } });
  assert.equal(own.status, 200, own.text);
  const ins = calls.find((c) => c.method === 'POST' && c.table === 'pl_movements');
  assert.equal(ins.body.taken, 10);
  assert.equal(ins.body.given, 8);
  assert.equal(ins.body.notes, 'n');
  assert.equal(ins.body.piece_leg_id, 70);
});

test('POST: the second live row of a stop and event is a 409 in Greek, other refusals as before', async () => {
  insertError = { code: '23505', message: 'duplicate key value violates unique constraint "pl_mov_stop_once"', details: 'Key (order_stop_id, event_type)=(4, DELIVERY) already exists.' };
  const body = { movement_date: '2026-10-14', counterparty_type: 'CLIENT', client_rec: 'recC', event_type: 'DELIVERY', taken: 33, given: 33, order_stop_rec: 'recS' };
  const r = await call('dispatcher', '/pallets/movements', 'POST', body);
  assert.equal(r.status, 409, r.text);
  assert.match(r.text, /Υπάρχει ήδη κίνηση παλετών/);
  insertError = { code: '23505', message: 'duplicate key value violates unique constraint "pl_movements_code_key"' };
  const other = await call('dispatcher', '/pallets/movements', 'POST', body);
  assert.equal(other.status, 500, 'any other refusal: as before');
});
