// tests/orders-natl-v5.test.js — run: node --test tests/orders-natl-v5.test.js
// F5 stream (d1), Ε3 + Ε5 (plan 2026-10-28 §10; read spec docs/national-v5/f5/d1-orders-read-spec.md):
// the «Παραγγελίες» page reads v5 national work from GET /plan/nat-state. Runs the REAL OrdersCommon and the
// REAL «Εβδομάδα» pairing (module.exports), with planFetch / PlanConfig stubbed to the contract of the spec.
// Before L (PlanConfig 'before') nothing is requested and every record is untouched: today's path.
process.env.TZ = 'Europe/Athens';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
global.TmsWeek = require('../core/tms-week.js');
global.OrdersList = require('../core/orders-list.js');
const { OrdersCommon, OrdersData } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;
global.OrdersData = OrdersData;
global.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const W = require('../modules/orders_week_view.js');

let calls, logged, answer;
const planErr = (code, kind) => Object.assign(new Error(code), { name: 'PlanError', code, kind });
beforeEach(() => {
  calls = []; logged = []; answer = null;
  global.logError = (e, where) => logged.push(where);
  global.planFetch = async (m, path, opts) => {
    calls.push({ m, path, opts });
    if (answer instanceof Error) throw answer;
    const ids = new URLSearchParams(path.split('?')[1]).get('nat_order_ids').split(',');
    return Object.fromEntries(ids.map(id => [id, typeof answer === 'function' ? answer(id) : 'missing']));
  };
  global.PlanConfig = { load: async () => ({ state: 'after', cutoverDay: '2026-10-31', writesOpen: true }) };
  delete OrdersCommon._pcMissing;
});

const n = (id, no, f) => ({ id, _type: 'natl', fields: Object.assign({ 'Order No': no }, f || {}) });
const OWN = { kind: 'owned', truck: 'ΚΖΗ-1234', trailer: 'ΚΖΧ-55', driver: 'Δοκιμή Οδηγός', partner: null, code: 'RT-9001', side: 'KATHODOS', day: '2026-11-02' };
const PARTNER = { kind: 'partner', truck: null, trailer: null, driver: null, partner: 'Συνεργάτης Α', code: 'RT-9002', side: 'ANODOS', day: '2026-11-03' };
const st = (o) => Object.assign({ n_pieces: 1, n_executed: 0, executed: false, planned: true, late: false, hub_side: null, carriers: [] }, o);

test('before L: no request, no record touched (flag off = today)', async () => {
  global.PlanConfig = { load: async () => ({ state: 'before', cutoverDay: null, writesOpen: false }) };
  const recs = [n('recA', 11), n('recB', 12)];
  const before = JSON.stringify(recs);
  const r = await OrdersCommon.natV5Attach(recs);
  assert.deepStrictEqual(r, { ran: false, failed: false });
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(JSON.stringify(recs), before);
  assert.ok(recs.every(x => !('_v5' in x)));
});

test('after L: one read by Order No; "missing" stays the old model, a state is attached', async () => {
  answer = id => (id === '12' ? st({ carriers: [OWN] }) : 'missing');
  const recs = [n('recA', 11), n('recB', 12), n('recC', null)];
  const r = await OrdersCommon.natV5Attach(recs);
  assert.deepStrictEqual(r, { ran: true, failed: false });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].m, 'GET');
  assert.strictEqual(calls[0].path, '/plan/nat-state?nat_order_ids=11,12');   // no id → not asked
  assert.ok(!('_v5' in recs[0]) && !('_v5' in recs[2]));
  assert.strictEqual(recs[1]._v5.carriers[0].code, 'RT-9001');
});

test('more than 500 orders: batches of 500 (the route refuses 501)', async () => {
  const recs = Array.from({ length: 501 }, (_, i) => n('rec' + i, i + 1));
  await OrdersCommon.natV5Attach(recs);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].path.split('=')[1].split(',').length, 500);
});

test('a failed read marks every record unknown and says so; never «old model»', async () => {
  answer = planErr('net_failed', 'failed');
  const recs = [n('recA', 11), n('recB', 12)];
  const r = await OrdersCommon.natV5Attach(recs);
  assert.deepStrictEqual(r, { ran: true, failed: true });
  assert.ok(recs.every(x => x._v5 === 'err'));
  assert.deepStrictEqual(logged, []);   // planFetch logs its own errors: no second row
});

test('a broken answer (an id without a state) is a contract fault: failed + logged', async () => {
  answer = () => undefined;
  const recs = [n('recA', 11)];
  const r = await OrdersCommon.natV5Attach(recs);
  assert.strictEqual(r.failed, true);
  assert.strictEqual(recs[0]._v5, 'err');
  assert.deepStrictEqual(logged, ['OrdersCommon.natV5Attach']);
});

test('before Worker deploy 1 (404 no_route): today\'s path, nothing marked, asked as a designed answer', async () => {
  answer = planErr('no_route', 'client');
  const recs = [n('recA', 11)];
  const r = await OrdersCommon.natV5Attach(recs);
  assert.deepStrictEqual(r, { ran: false, failed: false });
  assert.ok(!('_v5' in recs[0]));
  assert.deepStrictEqual(calls[0].opts, { designed: ['no_route'] });
});

test('PlanConfig not loaded = unknown: the read runs, the absence is logged once', async () => {
  delete global.PlanConfig;
  await OrdersCommon.natV5Attach([n('recA', 11)]);
  await OrdersCommon.natV5Attach([n('recB', 12)]);
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(logged, ['OrdersCommon._planState']);
});

test('a second load clears a stale state (the record object is reused by the catalog)', async () => {
  answer = () => st({ carriers: [OWN] });
  const recs = [n('recA', 11)];
  await OrdersCommon.natV5Attach(recs);
  global.PlanConfig = { load: async () => ({ state: 'before' }) };
  await OrdersCommon.natV5Attach(recs);
  assert.ok(!('_v5' in recs[0]));
});

test('ΑΝΑΘΕΣΗ of a v5 order: the cycle\'s vehicle, never «εκτός» (Ε3)', () => {
  const own = OrdersCommon.assignOf(Object.assign(n('recA', 11), { _v5: st({ carriers: [OWN] }) }), { missingLoad: true });
  assert.strictEqual(own.key, 'own');
  assert.strictEqual(own.text, 'ΚΖΗ-1234 · ΚΖΧ-55 · Δοκιμή Οδηγός');
  const two = OrdersCommon.assignOf(Object.assign(n('recA', 11), { _v5: st({ carriers: [OWN, PARTNER] }) }), {});
  assert.strictEqual(two.text, 'ΚΖΗ-1234 · ΚΖΧ-55 · Δοκιμή Οδηγός · +1');
  const p = OrdersCommon.assignOf(Object.assign(n('recA', 11), { _v5: st({ carriers: [PARTNER] }) }), {});
  assert.strictEqual(p.key, 'partner');
  assert.strictEqual(p.text, 'Συνεργάτης Α · συνεργάτης');
  const pa = OrdersCommon.assignOf(Object.assign(n('recA', 11), { _v5: st({ planned: false }) }), { missingLoad: true, canSend: true });
  assert.strictEqual(pa.key, 'pa');
  assert.ok(!/Στείλε|εκτός/.test(pa.html));
});

test('ΑΝΑΘΕΣΗ when the v5 read failed: «—» without a load, the load\'s vehicle with one; old rules untouched', () => {
  global.getRefTrucks = () => [{ id: 'recT', fields: { 'License Plate': 'ΝΒΑ-1' } }];
  global.getRefDrivers = () => [];
  global.getRefTrailers = () => [];
  const err = OrdersCommon.assignOf(Object.assign(n('recA', 11), { _v5: 'err' }), { missingLoad: true, canSend: true });
  assert.strictEqual(err.key, 'unknown');
  const withLoad = OrdersCommon.assignOf(Object.assign(n('recA', 11), { _v5: 'err' }), { load: { fields: { Truck: ['recT'] } } });
  assert.strictEqual(withLoad.key, 'own');
  // no _v5 at all (before L): exactly as before
  const out = OrdersCommon.assignOf(n('recA', 11), { missingLoad: true });
  assert.strictEqual(out.key, 'out');
});

test('«παραδόθηκε» of a v5 order = the base\'s executed, not the date (Ε5)', () => {
  const past = { 'Delivery DateTime': '2020-01-01' }, future = { 'Delivery DateTime': '2099-01-01' };
  assert.strictEqual(OrdersCommon.isDelivered(Object.assign(n('a', 1, past), { _v5: st({ executed: false }) })), false);
  assert.strictEqual(OrdersCommon.isDelivered(Object.assign(n('a', 1, future), { _v5: st({ executed: true }) })), true);
  // unread: the date rule (the views say so); none: the date rule (today)
  assert.strictEqual(OrdersCommon.isDelivered(Object.assign(n('a', 1, past), { _v5: 'err' })), true);
  assert.strictEqual(OrdersCommon.isDelivered(n('a', 1, past)), true);
  assert.strictEqual(OrdersCommon.isDelivered(n('a', 1, future)), false);
});

test('«Εβδομάδα»: a v5 order is its own row on its cycle\'s side, assigned from the cycle; never «εκτός φορτίου»', () => {
  const WK = '2026-10-31';
  const day = { 'Loading DateTime': '2026-11-02', 'Delivery DateTime': '2026-11-02' };
  const down = Object.assign(n('recD', 21, day), { _v5: st({ carriers: [OWN] }) });
  const up = Object.assign(n('recU', 22, day), { _v5: st({ carriers: [PARTNER] }) });
  const hub = Object.assign(n('recH', 23, day), { _v5: st({ planned: false, hub_side: 'ANODOS' }) });
  const old = n('recO', 24, day);   // old model, no load: «εκτός» as today
  const rows = W.pairNationals({ week: WK, natl: [down, up, hub, old], loads: [], intl: [] });
  const byRec = id => rows.find(r => r.openRec.id === id);
  assert.strictEqual(byRec('recD').kat.rec.id, 'recD'); assert.strictEqual(byRec('recD').ano, null);
  assert.strictEqual(byRec('recU').ano.rec.id, 'recU'); assert.strictEqual(byRec('recU').kat, null);
  assert.strictEqual(byRec('recH').ano.rec.id, 'recH');
  for (const id of ['recD', 'recU', 'recH']) {
    assert.strictEqual(byRec(id).assign.kind, 'v5');
    assert.deepStrictEqual(byRec(id).counted.map(r => r.id), [id]);
  }
  assert.strictEqual(byRec('recO').assign.kind, 'out');
});

test('«Εβδομάδα»: failed v5 read and no load = unknown («—»), not «εκτός»', () => {
  const rec = Object.assign(n('recE', 31, { 'Loading DateTime': '2026-11-02' }), { _v5: 'err' });
  const rows = W.pairNationals({ week: '2026-10-31', natl: [rec], loads: [], intl: [] });
  assert.strictEqual(rows[0].assign.kind, 'failed');
});
