// 077 (F13, live test 28/10) — GET /plan/orders/:id, the edit form's read of one national order, against the real
// Worker in Node: plan_order_read(p_nat_order_id, p_role) for every role, open with the switch closed (a read), one
// RPC, the DB body as is; a path id that is not a positive integer of at most 15 digits → 400 before any DB call; 077
// missing → 503 naming 077; the DB's refusal by name (order_gone) is the /plan/* 422; an amount is never forwarded.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, callOpen, json, pgError, on, calls, rpcCalls, reset, restore } from './fixtures/f5-harness.mjs';

const ROLES = ['owner', 'dispatcher', 'management', 'accountant', 'warehouse'];
beforeEach(reset);
afterEach(restore);

const BODY = { ok: true, op: 'plan_order_read',
  order: { nat_order_id: 84, client_id: 5, client: 'C', price: 100, reference: null, goods: null, notes: 'n', temperature_c: null,
    pallet_exchange: false, direction: 'KATHODOS', pallets: 6 },
  shipments: [{ shipment_id: 9, origin_location_id: 1, dest_location_id: 2, pallets: 6, load_from: '2026-10-30T06:00:00+00:00',
    load_to: '2026-10-30T08:00:00+00:00', deliver_from: '2026-10-30T12:00:00+00:00', deliver_to: '2026-10-30T14:00:00+00:00',
    vs_locked: false, rides: true, rt_codes: ['RT-1287'] }] };

test('GET /plan/orders/:id: plan_order_read(p_nat_order_id, p_role) for every role, switch closed or open, the DB body as is', async () => {
  on('POST', 'rpc/plan_order_read', () => json(BODY));
  for (const role of ROLES) {
    for (const go of [call, callOpen]) {
      calls.length = 0;
      const r = await go(role, 'GET', '/plan/orders/84');
      assert.equal(r.status, 200, `${role}: ${r.text}`);
      assert.deepEqual(r.json, BODY, 'the price reaches every role (owner 23/8, decision 41)');
      assert.deepEqual(rpcCalls().map((c) => [c.table, c.body]), [['rpc/plan_order_read', { p_nat_order_id: 84, p_role: role }]]);
      assert.equal(calls.filter((c) => c.table === 'audit_log').length, 0);
    }
  }
});

test('GET /plan/orders/:id: 0, a leading zero or more than 15 digits → 400 before any DB call; a non-digit path is no route', async () => {
  for (const id of ['0', '017', '1234567890123456']) {
    calls.length = 0;
    const r = await call('owner', 'GET', `/plan/orders/${id}`);
    assert.equal(r.status, 400, id);
    assert.deepEqual(r.json.error, { type: 'BAD_REQUEST', code: 'bad_nat_order_id', message: 'nat_order_id: θετικός ακέραιος' });
    assert.equal(calls.length, 0, id);
  }
  for (const p of ['/plan/orders/-1', '/plan/orders/1a', '/plan/orders/']) {
    calls.length = 0;
    const r = await call('owner', 'GET', p);
    assert.equal(r.status, 404, p);
    assert.equal(calls.length, 0, p);
  }
});

test('GET /plan/orders/:id with 077 missing → 503 schema_behind naming 077 (never the 500 path)', async () => {
  on('POST', 'rpc/plan_order_read', () => pgError(404, { code: 'PGRST202', details: null, hint: null, message: 'Could not find the function public.plan_order_read in the schema cache' }));
  const r = await call('dispatcher', 'GET', '/plan/orders/84');
  assert.equal(r.status, 503, r.text);
  assert.deepEqual(r.json.error, { type: 'SCHEMA_BEHIND', code: 'schema_behind', message: 'Η βάση δεν έχει ακόμη το migration 077 (Εβδομαδιαίο Εθνικών) — ενημέρωσε τον Δημήτρη' });
});

test('GET /plan/orders/:id: the DB\'s refusal by name is the /plan/* 422; an amount in the answer is not forwarded', async () => {
  on('POST', 'rpc/plan_order_read', () => pgError(400, { code: '23514', details: null, hint: 'plan:order_gone', message: 'plan rule broken: order_gone:84' }));
  let r = await call('dispatcher', 'GET', '/plan/orders/84');
  assert.equal(r.status, 422, r.text);
  assert.equal(r.json.error.code, 'order_gone');
  reset();
  on('POST', 'rpc/plan_order_read', () => json({ ...BODY, order: { ...BODY.order, amount: 5 } }));
  r = await call('dispatcher', 'GET', '/plan/orders/84');
  assert.equal(r.json.error.code, 'amount_leak');
  assert.ok(!r.text.includes('"amount"'));
});
