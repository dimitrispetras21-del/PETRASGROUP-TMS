// F5 E19 (spec §5; plan W6) — DELETE of an international order (facade ORDERS → delete_order_cascade) asks the DB
// for the list of consequences first (074a order_delete_preview), against the real Worker in Node:
//   - an empty list (every order before day L: 0 bridges) → the cascade as today, no token needed;
//   - a list and no ?confirm_token= → 428 need_token WITH the list and its token, nothing deleted;
//   - the token the user saw → the cascade; another token → 422 stale_confirm with the new list, nothing deleted;
//   - the preview missing (074a not run / rolled back) → 503 naming 074a, never a delete without the list;
//   - an unreadable preview, or one with amounts for a role outside owner / accountant → 500, nothing deleted;
//   - RBAC first: a role without PATCH on orders is a 403 before any DB call.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, callOpen, json, pgError, on, calls, rpcCalls, reset, restore } from './fixtures/f5-harness.mjs';

const ORDERS = '/v0/appTEST/tblgHlNmLBH3JTdIM';
const SUMMARY = { order_found: true, stops: 2, national_loads: 0 };
const LIST = [{ kind: 'piece_on_cycle', rt_id: 5, code: 'RT-1290', pallets: 12 }, { kind: 'cycle_empties', rt_id: 5, code: 'RT-1290', payroll: true }];
const EMPTY = { needs_confirm: false, confirm_token: null, consequences: [] };
beforeEach(reset);
afterEach(restore);
const rpcNames = () => rpcCalls().map((c) => c.table);
function stub(preview) {
  on('POST', 'rpc/order_delete_preview', () => json(preview));
  on('POST', 'rpc/delete_order_cascade', () => json(SUMMARY));
}

test('an empty list → the cascade as today (one preview, one cascade), for both deploys; the preview gets the role', async () => {
  for (const send of [call, callOpen]) {
    reset();
    stub(EMPTY);
    const r = await send('dispatcher', 'DELETE', `${ORDERS}/recO1`);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json, { id: 'recO1', deleted: true, cascade: SUMMARY });
    assert.deepEqual(rpcNames(), ['rpc/order_delete_preview', 'rpc/delete_order_cascade']);
    assert.deepEqual(rpcCalls()[0].body, { p_order_legacy_id: 'recO1', p_role: 'dispatcher' });
    // an empty list needs no token: a token left over from an earlier list does not block it
    reset();
    stub(EMPTY);
    assert.equal((await send('owner', 'DELETE', `${ORDERS}/recO1?confirm_token=old`)).status, 200);
  }
});

test('a list without a token → 428 need_token with the list and its token; nothing deleted', async () => {
  stub({ needs_confirm: true, confirm_token: 'tok-1', consequences: LIST });
  const r = await call('owner', 'DELETE', `${ORDERS}/recO1`);
  assert.equal(r.status, 428, r.text);
  assert.deepEqual(r.json, {
    error: { type: 'PLAN_RULE', code: 'need_token', message: 'Η πράξη θέλει επιβεβαίωση — δες πρώτα τη λίστα συνεπειών' },
    preview: { consequences: LIST, confirm_token: 'tok-1' }
  });
  assert.deepEqual(rpcNames(), ['rpc/order_delete_preview'], 'no cascade');
  assert.equal(calls.filter((c) => c.table === 'audit_log').length, 0);
});

test('428 → the same token → 200; a list that changed meanwhile → 422 stale_confirm with the new list, nothing deleted', async () => {
  stub({ needs_confirm: true, confirm_token: 'tok-1', consequences: LIST });
  let r = await call('owner', 'DELETE', `${ORDERS}/recO1`);
  assert.equal(r.status, 428);
  const tok = r.json.preview.confirm_token;
  r = await call('owner', 'DELETE', `${ORDERS}/recO1?confirm_token=${encodeURIComponent(tok)}`);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(rpcNames().slice(-2), ['rpc/order_delete_preview', 'rpc/delete_order_cascade']);
  // the list changed between the user's look and the press
  reset();
  const changed = [...LIST, { kind: 'piece_on_cycle', rt_id: 6, code: 'RT-1291', pallets: 3 }];
  stub({ needs_confirm: true, confirm_token: 'tok-2', consequences: changed });
  r = await call('owner', 'DELETE', `${ORDERS}/recO1?confirm_token=${tok}`);
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(r.json.error, { type: 'PLAN_RULE', code: 'stale_confirm', message: 'Κάτι άλλαξε από τότε που είδες τη λίστα — δες τη ξανά και επιβεβαίωσε' });
  assert.deepEqual(r.json.preview, { consequences: changed, confirm_token: 'tok-2' });
  assert.deepEqual(rpcNames(), ['rpc/order_delete_preview'], 'no cascade');
  // a list whose token the DB did not give is never «confirmed» by an empty or missing one
  reset();
  stub({ needs_confirm: true, confirm_token: null, consequences: LIST });
  r = await call('owner', 'DELETE', `${ORDERS}/recO1?confirm_token=`);
  assert.equal(r.status, 422, r.text);
  assert.deepEqual(rpcNames(), ['rpc/order_delete_preview']);
});

test('074a missing → 503 schema_behind naming 074a; an unreadable preview or an amount for a dispatcher → 500; nothing deleted', async () => {
  for (const pg of [{ code: 'PGRST202', message: 'Could not find the function public.order_delete_preview(p_order_legacy_id, p_role) in the schema cache' },
    { code: '42883', message: 'function public.order_delete_preview(text, text) does not exist' }]) {
    reset();
    on('POST', 'rpc/order_delete_preview', () => pgError(404, { ...pg, details: null, hint: null }));
    const r = await call('owner', 'DELETE', `${ORDERS}/recO1`);
    assert.equal(r.status, 503, r.text);
    assert.equal(r.json.error.code, 'schema_behind');
    assert.match(r.json.error.message, /074a/);
    assert.deepEqual(rpcNames(), ['rpc/order_delete_preview']);
  }
  for (const bad of [null, {}, { consequences: 'x' }, []]) {
    reset();
    stub(bad);
    const r = await call('owner', 'DELETE', `${ORDERS}/recO1`);
    assert.equal(r.status, 500, `${JSON.stringify(bad)}: ${r.text}`);
    assert.deepEqual(rpcNames(), ['rpc/order_delete_preview'], JSON.stringify(bad));
  }
  reset();
  stub({ needs_confirm: true, confirm_token: 't', consequences: [{ kind: 'payroll', rt_id: 5, amount: 120 }] });
  let r = await call('dispatcher', 'DELETE', `${ORDERS}/recO1`);
  assert.equal(r.status, 500, r.text);
  assert.doesNotMatch(r.text, /120/, 'the amount never reaches the dispatcher');
  assert.deepEqual(rpcNames(), ['rpc/order_delete_preview']);
  // the owner sees the amounts (the DB cut nothing for that role)
  reset();
  stub({ needs_confirm: true, confirm_token: 't', consequences: [{ kind: 'payroll', rt_id: 5, amount: 120 }] });
  r = await call('owner', 'DELETE', `${ORDERS}/recO1`);
  assert.equal(r.status, 428, r.text);
});

test('a lost lock on the preview or on the cascade → 503 busy_retry «nothing written»', async () => {
  for (const fn of ['order_delete_preview', 'delete_order_cascade']) {
    reset();
    // first route wins: the busy answer before the stub
    on('POST', `rpc/${fn}`, () => pgError(400, { code: '55P03', details: null, hint: null, message: 'canceling statement due to lock timeout' }));
    stub(EMPTY);
    const r = await call('owner', 'DELETE', `${ORDERS}/recO1`);
    assert.equal(r.status, 503, `${fn}: ${r.text}`);
    assert.equal(r.json.error.code, 'busy_retry');
  }
});

test('RBAC first: a role without PATCH on orders → 403 before the preview (no DB call)', async () => {
  stub(EMPTY);
  // warehouse is the one role without PATCH on orders (the 23/8 lock gives every other role broad edits)
  for (const role of ['warehouse']) {
    calls.length = 0;
    const r = await call(role, 'DELETE', `${ORDERS}/recO1`);
    assert.equal(r.status, 403, `${role}: ${r.text}`);
    assert.equal(calls.length, 0, role);
  }
});
