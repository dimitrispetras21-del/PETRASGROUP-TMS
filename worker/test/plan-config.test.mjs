// F5 (plan W1/W2; stream d1) — the three reads of 074a under /plan/*, against the real Worker in Node:
//   - GET /plan/config   → plan_config_read(), answered {cutover_day, opened_at, writes_open}; writes_open is THIS
//                          Worker's switch (false in deploy 1, true in deploy 2), never a DB value;
//   - GET /plan/lookups  → plan_lookups(p_role), the DB body as is;
//   - GET /plan/nat-state?nat_order_ids=… → plan_nat_state(p_nat_order_ids), the rule of /plan/vs-state;
//   - GET /plan/activity?<one of partner_id|driver_id|truck_id|trailer_id|location_id>=N|all → plan_activity(p_kind, p_id text).
// Every role, open with the switch closed (reads), one RPC each, no audit row; 074a missing → 503 naming 074a; an
// answer FE-1 could misread (a cutover_day that is not a date or null) → a loud 500, never «not yet».
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, callOpen, json, pgError, on, calls, rpcCalls, reset, restore } from './fixtures/f5-harness.mjs';

const ROLES = ['owner', 'dispatcher', 'management', 'accountant', 'warehouse'];
beforeEach(reset);
afterEach(restore);

test('GET /plan/config before day L: {cutover_day: null, opened_at: null, writes_open: false} for every role, one RPC with no args', async () => {
  on('POST', 'rpc/plan_config_read', () => json({ cutover_day: null }));
  for (const role of ROLES) {
    calls.length = 0;
    const r = await call(role, 'GET', '/plan/config');
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.deepEqual(r.json, { cutover_day: null, opened_at: null, writes_open: false });
    assert.deepEqual(rpcCalls().map((c) => [c.table, c.body]), [['rpc/plan_config_read', {}]]);
    assert.equal(calls.filter((c) => c.table === 'audit_log').length, 0);
  }
});

test('GET /plan/config: the day the DB holds, and writes_open = the switch of the Worker that answers (deploy 1 / deploy 2)', async () => {
  const row = { cutover_day: '2026-10-31', opened_at: '2026-10-30T15:20:00+00:00' };
  on('POST', 'rpc/plan_config_read', () => json(row));
  let r = await call('dispatcher', 'GET', '/plan/config');
  assert.deepEqual(r.json, { ...row, writes_open: false }, 'deploy 1 after 074 ran (the rehearsal order): the day, writes still closed');
  r = await callOpen('dispatcher', 'GET', '/plan/config');
  assert.deepEqual(r.json, { ...row, writes_open: true });
});

test('GET /plan/config: an answer FE-1 cannot read is a 500 plan_failed, never a «not yet»', async () => {
  for (const bad of [null, [], {}, { cutover_day: '31/10/2026' }, { cutover_day: 20261031 }, { cutover_day: '' }, 'x']) {
    reset();
    on('POST', 'rpc/plan_config_read', () => json(bad));
    const r = await call('owner', 'GET', '/plan/config');
    assert.equal(r.status, 500, `${JSON.stringify(bad)}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'SERVER', code: 'plan_failed', message: 'Η πράξη GET /plan/config δεν ολοκληρώθηκε — ενημέρωσε τον Δημήτρη' });
  }
});

test('the four reads with 074a missing → 503 schema_behind naming 074a (never the 500 path)', async () => {
  for (const [fn, p] of [['plan_config_read', '/plan/config'], ['plan_lookups', '/plan/lookups'], ['plan_nat_state', '/plan/nat-state?nat_order_ids=7'],
    ['plan_activity', '/plan/activity?driver_id=7']]) {
    reset();
    on('POST', `rpc/${fn}`, () => pgError(404, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${fn} in the schema cache` }));
    const r = await call('warehouse', 'GET', p);
    assert.equal(r.status, 503, `${p}: ${r.text}`);
    assert.deepEqual(r.json.error, { type: 'SCHEMA_BEHIND', code: 'schema_behind', message: 'Η βάση δεν έχει ακόμη το migration 074a (Εβδομαδιαίο Εθνικών) — ενημέρωσε τον Δημήτρη' });
  }
});

test('GET /plan/lookups: plan_lookups(p_role) for every role, the DB body as is', async () => {
  const body = { locations: [{ id: 1, legacy_id: 'recL1', name: 'L1', address: null, city: 'C', phone: null, is_hub: true, active: true }],
    clients: [], trucks: [], trailers: [], drivers: [{ id: 3, name: 'D3', phone: '1' }], partners: [] };
  on('POST', 'rpc/plan_lookups', () => json(body));
  for (const role of ROLES) {
    calls.length = 0;
    const r = await call(role, 'GET', '/plan/lookups');
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.deepEqual(r.json, body);
    assert.deepEqual(rpcCalls().map((c) => [c.table, c.body]), [['rpc/plan_lookups', { p_role: role }]]);
  }
});

test('GET /plan/nat-state: ids deduplicated into p_nat_order_ids; 0, negative, text, empty or > 500 ids → 400 before any DB call', async () => {
  const state = { 7: 'missing', 9: { n_pieces: 2, n_executed: 0, executed: false, planned: true, late: false, hub_side: 'ANODOS', carriers: [] } };
  on('POST', 'rpc/plan_nat_state', () => json(state));
  for (const role of ROLES) {
    calls.length = 0;
    const r = await call(role, 'GET', '/plan/nat-state?nat_order_ids=9,7,9');
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    assert.deepEqual(r.json, state);
    assert.deepEqual(rpcCalls().map((c) => [c.table, c.body]), [['rpc/plan_nat_state', { p_nat_order_ids: [9, 7] }]]);
  }
  const many = Array.from({ length: 501 }, (_, i) => i + 1).join(',');
  for (const q of ['', '?nat_order_ids=', '?nat_order_ids=0', '?nat_order_ids=-1', '?nat_order_ids=1,a', '?order_ids=1', `?nat_order_ids=${many}`]) {
    calls.length = 0;
    const r = await call('owner', 'GET', `/plan/nat-state${q}`);
    assert.equal(r.status, 400, q.slice(0, 30));
    assert.deepEqual(r.json.error, { type: 'BAD_REQUEST', code: 'bad_nat_order_ids', message: 'nat_order_ids: 1 έως 500 θετικοί ακέραιοι, χωρισμένοι με κόμμα' });
    assert.equal(calls.length, 0, q.slice(0, 30));
  }
});

test('the reads stay GET only: a write verb on them is a 404 (no route), never an RPC', async () => {
  for (const p of ['/plan/config', '/plan/lookups', '/plan/nat-state', '/plan/activity']) {
    for (const verb of ['POST', 'PATCH']) {
      calls.length = 0;
      const r = await callOpen('owner', verb, p, {});
      assert.equal(r.status, 404, `${verb} ${p}`);
      assert.equal(calls.length, 0);
    }
  }
});

test('GET /plan/activity: one key → (p_kind, p_id as text), «all» for partner / location only; the DB body as is', async () => {
  const body = { cycles: [], truncated: false };
  on('POST', 'rpc/plan_activity', () => json(body));
  for (const [q, args] of [['partner_id=12', { p_kind: 'partner', p_id: '12' }], ['driver_id=3', { p_kind: 'driver', p_id: '3' }],
    ['truck_id=999999999', { p_kind: 'truck', p_id: '999999999' }], ['trailer_id=8', { p_kind: 'trailer', p_id: '8' }],
    ['location_id=40', { p_kind: 'location', p_id: '40' }], ['partner_id=all', { p_kind: 'partner', p_id: 'all' }],
    ['location_id=all', { p_kind: 'location', p_id: 'all' }]]) {
    for (const role of ROLES) {
      calls.length = 0;
      const r = await call(role, 'GET', `/plan/activity?${q}`);
      assert.equal(r.status, 200, `${role} ${q}: ${r.text}`);
      assert.deepEqual(r.json, body);
      assert.deepEqual(rpcCalls().map((c) => [c.table, c.body]), [['rpc/plan_activity', args]], `${role} ${q}`);
    }
  }
});

test('GET /plan/activity: no key, two keys, an unknown key, 0, negative, 10 digits, text, or «all» for a driver / vehicle → 400 before any DB call', async () => {
  for (const q of ['', '?partner_id=', '?partner_id=1&driver_id=2', '?partner_id=1&partner_id=2', '?client_id=1', '?partner_id=0',
    '?partner_id=-1', '?partner_id=1234567890', '?partner_id=1a', '?driver_id=all', '?truck_id=all', '?trailer_id=all', '?location_id=ALL']) {
    calls.length = 0;
    const r = await call('owner', 'GET', `/plan/activity${q}`);
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error.code, 'bad_activity_query', q);
    assert.equal(r.json.error.type, 'BAD_REQUEST', q);
    assert.equal(calls.length, 0, q);
  }
});
