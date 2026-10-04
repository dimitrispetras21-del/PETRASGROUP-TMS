// tests/local-relay-payroll.test.js — 060 local relays on the payroll card
// (owner 4/10/2026 «οκ προχωρα με τις τοπικες παραδοσεις»; OWNER-Q2 answered
// 4/10: salary = track record only, per_trip = daily ΤΟΠΙΚΟ line).
// The SQL stays ASCII: dl_v_entries.relay_info carries keys (060 draft, step
// 7), the Greek words live in modules/payroll.js once — these tests pin both
// the shape read and the one wording.
const { test } = require('node:test');
const assert = require('node:assert');
const { dlIsLocal, dlRelayMoves, dlRelayRtCodes, dlPayBasisUnknown, dlLocalLabel, dlRelayTitle, dlPeriod } = require('../modules/payroll.js');

const localDay = (moves, payBasis) => ({ entry_type: 'trip', local_move_id: moves[0] ? moves[0].id : 1,
  relay_info: { kind: 'local_day', pay_basis: payBasis === undefined ? null : payBasis, moves } });

test('a local line is a trip line with local_move_id — nothing else is', () => {
  assert.strictEqual(dlIsLocal({ entry_type: 'trip', local_move_id: 12 }), true);
  assert.strictEqual(dlIsLocal({ entry_type: 'trip', local_move_id: null, rt_id: 5 }), false);
  assert.strictEqual(dlIsLocal({ entry_type: 'trip' }), false);           // older view: no column at all
  assert.strictEqual(dlIsLocal({ entry_type: 'payment_cash', local_move_id: 3 }), false);
  assert.strictEqual(dlIsLocal(null), false);
});

test('relay_info: local day reads .moves, RT line reads .relays; anything else is «no relay»', () => {
  const m = [{ id: 7, move_kind: 'relay_delivery', order_id: 415 }];
  assert.deepStrictEqual(dlRelayMoves({ relay_info: { kind: 'local_day', moves: m } }), m);
  assert.deepStrictEqual(dlRelayMoves({ relay_info: { kind: 'rt', relays: m } }), m);
  assert.deepStrictEqual(dlRelayMoves({ relay_info: null }), []);
  assert.deepStrictEqual(dlRelayMoves({ relay_info: 'free text' }), []);
  assert.deepStrictEqual(dlRelayMoves({}), []);
});

test('a move whose order sits on two RT legs is named once; its RT codes are all kept', () => {
  const e = localDay([
    { id: 7, move_kind: 'relay_delivery', order_id: 415, rt_code: null },
    { id: 7, move_kind: 'relay_delivery', order_id: 415, rt_code: 'RT-1187' },
    { id: 9, move_kind: 'relay_loading', order_id: 431, rt_code: 'RT-1187' }]);
  assert.strictEqual(dlLocalLabel(e), 'ΤΟΠΙΚΟ · παράδοση 415 · φόρτωση 431');
  assert.deepStrictEqual(dlRelayRtCodes(e), ['RT-1187']);
});

test('local label: «ΤΟΠΙΚΟ · παράδοση 415 · φόρτωση 431», one line per day', () => {
  const e = localDay([{ id: 7, move_kind: 'relay_delivery', order_id: 415, rt_code: 'RT-1187' }, { id: 8, move_kind: 'relay_loading', order_id: 431, rt_code: null }]);
  assert.strictEqual(dlLocalLabel(e), 'ΤΟΠΙΚΟ · παράδοση 415 · φόρτωση 431');
  // three deliveries of one groupage day → one line naming all three
  const g = localDay([415, 416, 417].map((o, i) => ({ id: 20 + i, move_kind: 'relay_delivery', order_id: o })));
  assert.strictEqual(dlLocalLabel(g), 'ΤΟΠΙΚΟ · παράδοση 415 · παράδοση 416 · παράδοση 417');
});

test('local label without relay_info falls back to the trigger route, never an empty cell', () => {
  assert.strictEqual(dlLocalLabel({ local_move_id: 1, route_text: 'ΤΟΠΙΚΟ · παράδοση 415' }), 'ΤΟΠΙΚΟ · παράδοση 415');
  assert.strictEqual(dlLocalLabel({ local_move_id: 1, route_text: 'delivery 415' }), 'ΤΟΠΙΚΟ · delivery 415');
  assert.strictEqual(dlLocalLabel({ local_move_id: 1, route_text: null }), 'ΤΟΠΙΚΟ');
});

test('pay basis unknown = the key present with null; per_trip/salary or an older view say nothing', () => {
  const m = [{ id: 7, move_kind: 'relay_delivery', order_id: 415 }];
  assert.strictEqual(dlPayBasisUnknown(localDay(m, null)), true);
  assert.strictEqual(dlPayBasisUnknown(localDay(m, 'per_trip')), false);
  assert.strictEqual(dlPayBasisUnknown(localDay(m, 'salary')), false);
  assert.strictEqual(dlPayBasisUnknown({ entry_type: 'trip', local_move_id: 7, relay_info: { kind: 'local_day', moves: m } }), false);
  assert.strictEqual(dlPayBasisUnknown({ entry_type: 'trip', rt_id: 3, relay_info: { kind: 'rt', pay_basis: null, relays: m } }), false);
});

test('RT line title: who did the local part and when — no amount anywhere', () => {
  const e = { entry_type: 'trip', rt_id: 1187, relay_info: { kind: 'rt', relays: [
    { id: 7, move_kind: 'relay_delivery', order_id: 415, driver_id: 31, driver_name: 'Papis', move_date: '2026-10-05' },
    { id: 8, move_kind: 'relay_loading', order_id: 408, driver_id: null, driver_name: null, move_date: '2026-10-06' }] } };
  assert.strictEqual(dlRelayTitle(e), 'τοπ. παράδοση 415 · Papis · 05/10\nτοπ. φόρτωση 408 · ΠΡΟΣ ΑΝΑΘΕΣΗ · 06/10');
  assert.ok(!/€|\d+,\d\d/.test(dlRelayTitle(e)));
});

test('a relay_info in an unknown shape is shown verbatim, never dropped', () => {
  assert.strictEqual(dlRelayTitle({ rt_id: 1, relay_info: 'local delivery 415 by 31' }), 'local delivery 415 by 31');
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
