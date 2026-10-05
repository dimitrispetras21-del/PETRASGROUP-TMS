// tests/local-relay-payroll.test.js — 060 local relays on the payroll card
// (owner 4/10/2026 «οκ προχωρα με τις τοπικες παραδοσεις»; owner 5/10: every
// driver who does a relay gets the daily ΤΟΠΙΚΟ line — no pay types).
// The SQL stays ASCII: dl_v_entries.relay_info carries keys (060, step 7),
// one entry per move with its RT codes as an array; the day's label is the
// trigger's route text. These tests pin the shape read and the one wording.
// Names and ids are fictional (public repo).
const { test } = require('node:test');
const assert = require('node:assert');
const { dlIsLocal, dlRelayList, dlRelayRtCodes, dlLocalLabel, dlRelayTitle, dlRelayShort, dlLocalCanCancel, dlPeriod } = require('../modules/payroll.js');

const localDay = (moves, extra) => Object.assign({ entry_type: 'trip', local_move_id: moves[0] ? moves[0].id : 1,
  relay_info: { kind: 'local_day', moves } }, extra);

test('a local line is a trip line with local_move_id — nothing else is', () => {
  assert.strictEqual(dlIsLocal({ entry_type: 'trip', local_move_id: 12 }), true);
  assert.strictEqual(dlIsLocal({ entry_type: 'trip', local_move_id: null, rt_id: 5 }), false);
  assert.strictEqual(dlIsLocal({ entry_type: 'trip' }), false);
  assert.strictEqual(dlIsLocal({ entry_type: 'payment_cash', local_move_id: 3 }), false);
  assert.strictEqual(dlIsLocal(null), false);
});

test('relay_info: local day reads .moves, RT line reads .relays; NULL is «no relay»', () => {
  const m = [{ id: 7, move_kind: 'relay_delivery', order_id: 9001 }];
  assert.deepStrictEqual(dlRelayList({ relay_info: { kind: 'local_day', moves: m } }), m);
  assert.deepStrictEqual(dlRelayList({ relay_info: { kind: 'rt', relays: m } }), m);
  assert.deepStrictEqual(dlRelayList({ relay_info: null }), []);
  assert.deepStrictEqual(dlRelayList({}), []);
});

test('the RT codes a local day served: every move\'s rt_codes, each code once', () => {
  const e = localDay([
    { id: 7, move_kind: 'relay_delivery', order_id: 9001, rt_codes: ['RT-9001'] },
    { id: 9, move_kind: 'relay_loading', order_id: 9002, rt_codes: ['RT-9001', 'RT-9002'] },
    { id: 11, move_kind: 'relay_loading', order_id: 9003, rt_codes: [] }]);
  assert.deepStrictEqual(dlRelayRtCodes(e), ['RT-9001', 'RT-9002']);
});

test('local label = the trigger\'s route text (one source), never an empty cell', () => {
  assert.strictEqual(dlLocalLabel({ local_move_id: 1, route_text: 'ΤΟΠΙΚΟ · παράδοση 9001 · φόρτωση 9002' }), 'ΤΟΠΙΚΟ · παράδοση 9001 · φόρτωση 9002');
  assert.strictEqual(dlLocalLabel({ local_move_id: 1, route_text: '  ' }), 'ΤΟΠΙΚΟ');
  assert.strictEqual(dlLocalLabel({ local_move_id: 1, route_text: null }), 'ΤΟΠΙΚΟ');
});

test('RT line: who did the local part and when — tooltip and the words on the line, no amount', () => {
  const e = { entry_type: 'trip', rt_id: 9101, relay_info: { kind: 'rt', relays: [
    { id: 7, move_kind: 'relay_delivery', order_id: 9001, driver_id: 901, driver_name: 'Τοπικός Α', move_date: '2026-10-05' },
    { id: 8, move_kind: 'relay_loading', order_id: 9002, driver_id: null, driver_name: null, move_date: '2026-10-06' }] } };
  assert.strictEqual(dlRelayTitle(e), 'τοπ. παράδοση 9001 · Τοπικός Α · 05/10\nτοπ. φόρτωση 9002 · ΠΡΟΣ ΑΝΑΘΕΣΗ · 06/10');
  assert.strictEqual(dlRelayShort(e), '⇄ τοπ. Τοπικός · 05/10 +1');
  assert.strictEqual(dlRelayShort({ relay_info: { kind: 'rt', relays: [e.relay_info.relays[1]] } }), '⇄ τοπ. ΠΡΟΣ ΑΝΑΘΕΣΗ · 06/10');
  assert.strictEqual(dlRelayShort({ relay_info: null }), '');
  assert.ok(!/€|\d+,\d\d/.test(dlRelayTitle(e) + dlRelayShort(e)));
});

test('Ακύρωση of a local line: only when no live relay of that driver is left that day — for every driver alike', () => {
  const live = localDay([{ id: 7, move_kind: 'relay_delivery', order_id: 9001, rt_codes: [] }]);
  const empty = localDay([], { local_move_id: 7 });
  assert.strictEqual(dlLocalCanCancel(live), false, 'a day with a live relay is the trigger\'s');
  assert.strictEqual(dlLocalCanCancel(empty), true, 'no live relay left → accounting may cancel it, with a reason');
  assert.strictEqual(dlLocalCanCancel(Object.assign({}, empty, { cancelled: true })), false);
  assert.strictEqual(dlLocalCanCancel({ entry_type: 'trip', rt_id: 3, relay_info: null }), false, 'not a local line');
});

test('dlPeriod counts local days apart from trips; their amounts still add up', () => {
  const E = [
    { id: 1, entry_type: 'trip', entry_date: '2026-10-02', rt_id: 9, trip_value: 10, balance_delta: 10, running_balance: 10, cancelled: false, pending: false },
    { id: 2, entry_type: 'trip', entry_date: '2026-10-05', local_move_id: 4, trip_value: 0, balance_delta: 0, running_balance: 10, cancelled: false, pending: false },
    { id: 3, entry_type: 'trip', entry_date: '2026-10-06', local_move_id: 5, trip_value: null, balance_delta: null, running_balance: 10, cancelled: false, pending: true },
    { id: 4, entry_type: 'trip', entry_date: '2026-10-07', local_move_id: 6, trip_value: 3, balance_delta: 3, running_balance: 10, cancelled: true, pending: false },
  ];
  const p = dlPeriod(E, '2026', '10');
  assert.strictEqual(p.totals.trips, 1);
  assert.strictEqual(p.totals.localDays, 2);      // the cancelled one never counts
  assert.strictEqual(p.totals.pendingCount, 1);   // a local day without a value is accounting's work too
  assert.strictEqual(p.totals.value, 10);         // «Αξία 0» is a real zero, not pending
});
