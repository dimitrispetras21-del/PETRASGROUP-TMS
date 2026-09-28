// tests/orders-week-view.test.js — run: node --test tests/orders-week-view.test.js
// The pure logic of the «Εβδομάδα» view (modules/orders_week_view.js), on the
// REAL OrdersCommon + TmsWeek (no copies): week bucketing, RT → week
// assignment, one count per order, totals without unpriced orders, the
// invoicing verdict per RT and the % vs the previous week.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
global.TmsWeek = require('../core/tms-week.js');
global.OrdersCommon = require('../core/orders-common.js').OrdersCommon;
const W = require('../modules/orders_week_view.js');

const WEEK = '2026-09-19';          // Sat 19/9 – Fri 25/9
const NEXT = '2026-09-26';
const o = (id, pg, f) => ({ id, _type: 'intl', fields: Object.assign({ Type: 'International', 'Order ID': pg, 'Order No': pg }, f) });
const n = (id, f) => ({ id, _type: 'natl', fields: f });

const INTL = [
  // RT-1181: export only, delivered Monday, invoiced with one number
  o('recE1', 1214, { Direction: 'Export', 'Loading DateTime': '2026-09-18T08:00', 'Delivery DateTime': '2026-09-21T09:00', Price: 3200, Status: 'Delivered', Invoiced: true, 'Invoice Number': '0431' }),
  // RT-1188: export delivers FRIDAY 25/9 (last day of the week), its import loads Monday 28/9 (next week)
  o('recE2', 1233, { Direction: 'Export', 'Loading DateTime': '2026-09-23T08:00', 'Delivery DateTime': '2026-09-25T22:30', Price: 3350, Status: 'Delivered' }),
  o('recI2', 1236, { Direction: 'Import', 'Loading DateTime': '2026-09-28T07:00', 'Delivery DateTime': '2026-09-30T07:00', Price: 2000 }),
  // RT-1185: import only, loads Monday 21/9
  o('recI3', 1228, { Direction: 'Import', 'Loading DateTime': '2026-09-21T06:00', 'Delivery DateTime': '2026-09-23T06:00', Price: 2650, Status: 'In Transit' }),
  // RT-1183: unpriced export delivered Sunday 20/9
  o('recU4', 1225, { Direction: 'Export', 'Loading DateTime': '2026-09-17T08:00', 'Delivery DateTime': '2026-09-20T10:00', Status: 'Delivered' }),
  // RT-1187: export invoiced (ΤΠΥ 0433), import delivered but not invoiced → partly
  o('recE5', 1232, { Direction: 'Export', 'Loading DateTime': '2026-09-22T08:00', 'Delivery DateTime': '2026-09-24T08:00', Price: 2750, Status: 'Delivered', Invoiced: true, 'Invoice Number': '0433' }),
  o('recI5', 1230, { Direction: 'Import', 'Loading DateTime': '2026-09-24T14:00', 'Delivery DateTime': '2026-09-26T08:00', Price: 2800, Status: 'Delivered' }),
  // No RT at all — must still be listed
  o('recN6', 1240, { Direction: 'Export', 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-22T08:00', Price: 1000, Status: 'Delivered' }),
  // Previous week's export (for the %): 12–18/9
  o('recP7', 1200, { Direction: 'Export', 'Delivery DateTime': '2026-09-15T08:00', Price: 10000, Status: 'Delivered', Invoiced: true, 'Invoice Number': '0400' }),
];
const NATL = [
  n('recNa', { 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-20T15:00', Price: 560 }),
  n('recNb', { 'Loading DateTime': '2026-09-23T08:00', 'Delivery DateTime': '2026-09-23T15:00' }),   // unpriced
];
const RTS = [
  { id: 81, code: 'RT-1181', date_start: '2026-09-18', status: 'closed', ct_rt_legs: [{ order_id: 1214, direction: 'EXPORT', seq: 1 }] },
  { id: 88, code: 'RT-1188', date_start: '2026-09-23', status: 'open', ct_rt_legs: [
    { order_id: 1233, direction: 'EXPORT', seq: 1 }, { order_id: 1236, direction: 'IMPORT', seq: 2 },
    { order_id: null, nat_load_id: 77, direction: 'IMPORT', seq: 3 } ] },          // VS leg: skipped
  { id: 85, code: 'RT-1185', date_start: '2026-09-20', status: 'open', ct_rt_legs: [{ order_id: 1228, direction: 'IMPORT', seq: 1 }] },
  { id: 83, code: 'RT-1183', date_start: '2026-09-17', status: 'closed', ct_rt_legs: [{ order_id: 1225, direction: 'EXPORT', seq: 1 }] },
  { id: 87, code: 'RT-1187', date_start: '2026-09-22', status: 'open', ct_rt_legs: [
    { order_id: 1232, direction: 'EXPORT', seq: 1 }, { order_id: 1230, direction: 'IMPORT', seq: 2 } ] },
  { id: 99, code: 'RT-1199', date_start: '2026-09-22', status: 'cancelled', ct_rt_legs: [{ order_id: 1240, direction: 'EXPORT', seq: 1 }] },
];
// Same shape as OrdersData.stateOf, without the pallet gate.
const stateOf = r => {
  const f = r.fields;
  if (OrdersCommon.isInvoiced(f)) return { key: 'invoiced' };
  if (f.Status !== 'Delivered') return { key: 'pending' };
  if (!OrdersCommon.hasPrice(f)) return { key: 'blocked', reason: 'price' };
  return { key: 'ready' };
};
const model = W.buildWeek({ week: WEEK, intl: INTL, natl: NATL, rts: RTS });
const row = code => model.rows.find(r => r.code === code);

test('week bucketing follows the Weekly (export by delivery, import/national by loading)', () => {
  assert.deepStrictEqual(model.weekIntl.map(r => r.id).sort(), ['recE1', 'recE2', 'recE5', 'recI3', 'recI5', 'recN6', 'recU4']);
  assert.deepStrictEqual(model.weekNatl.map(r => r.id).sort(), ['recNa', 'recNb']);
  // Friday 25/9 22:30 stays in 19–25/9 (the pre-28/9 formula pushed Fridays to the next week)
  assert.strictEqual(OrdersCommon.weekStartOf(INTL[1]), WEEK);
  assert.strictEqual(OrdersCommon.weekStartOf(INTL[2]), NEXT);
});

test('RT → week: the export leg decides; an import-only RT follows its import', () => {
  assert.deepStrictEqual(model.rows.map(r => r.code).sort(), ['RT-1181', 'RT-1183', 'RT-1185', 'RT-1187', 'RT-1188']);
  assert.strictEqual(row('RT-1188').guest, false);
  assert.strictEqual(row('RT-1188').day, '2026-09-25');           // Friday group
  assert.strictEqual(row('RT-1185').day, '2026-09-21');           // import loading day
  assert.strictEqual(row('RT-1183').day, '2026-09-20');
  assert.ok(!model.rows.some(r => r.code === 'RT-1199'), 'cancelled RT ignored');
});

test('the next-week import of the Friday RT is shown but counted in ITS week, where the RT is a guest', () => {
  const r = row('RT-1188');
  assert.strictEqual(r.imp.length, 1, 'VS leg skipped, one import');
  assert.strictEqual(r.imp[0].inWeek, false);
  assert.deepStrictEqual(r.counted.map(x => x.id), ['recE2']);
  const next = W.buildWeek({ week: NEXT, intl: INTL, natl: NATL, rts: RTS });
  const g = next.rows.find(x => x.code === 'RT-1188');
  assert.ok(g && g.guest && g.homeWeek === WEEK);
  assert.deepStrictEqual(g.counted.map(x => x.id), ['recI2']);
  assert.strictEqual(g.day, '2026-09-28');
  assert.ok(!next.noRt.some(x => x.rec.id === 'recI2'), 'a guest-RT order is not «Χωρίς RT»');
});

test('an order no RT counts is listed under «Χωρίς RT» (cancelled RTs do not count)', () => {
  assert.deepStrictEqual(model.noRt.map(r => r.rec.id), ['recN6']);
});

test('totals: unpriced orders are counted apart, never as 0; Σ RT rows + Χωρίς RT = the week', () => {
  const tI = W.totals(model.weekIntl, stateOf);
  assert.strictEqual(tI.sum, 3200 + 3350 + 2650 + 2750 + 2800 + 1000);
  assert.strictEqual(tI.unpriced, 1);
  assert.strictEqual(tI.invN, 2); assert.strictEqual(tI.invSum, 3200 + 2750);
  assert.strictEqual(tI.blockedN, 1); assert.strictEqual(tI.blocked.price, 1);
  assert.strictEqual(tI.pendingN, 1);                                   // recI3 in transit
  const perRow = [...model.rows, ...model.noRt].reduce((s, r) => s + W.totals(r.counted, stateOf).sum, 0);
  assert.strictEqual(perRow, tI.sum);
  const tN = W.totals(model.weekNatl, stateOf);
  assert.strictEqual(tN.sum, 560); assert.strictEqual(tN.unpriced, 1);
});

test('invoicing verdict per RT', () => {
  const v = code => W.rtInvoicing(row(code).counted, stateOf);
  assert.strictEqual(v('RT-1181').kind, 'one');
  assert.deepStrictEqual(v('RT-1187'), { kind: 'partial', k: 1, n: 2, open: 2800 });
  assert.deepStrictEqual(v('RT-1183'), { kind: 'blocked', reasons: ['price'] });
  assert.strictEqual(v('RT-1188').kind, 'ready');
  assert.strictEqual(v('RT-1185').kind, 'progress');
  const two = [o('a', 1, { Invoiced: true, 'Invoice Number': '1' }), o('b', 2, { Invoiced: true, 'Invoice Number': '2' })];
  assert.strictEqual(W.rtInvoicing(two, stateOf).kind, 'all');
  assert.strictEqual(W.rtInvoicing([], stateOf).kind, 'none');
});

test('% vs the previous week only when the previous week had turnover', () => {
  assert.strictEqual(W.pctVsPrev(11800, 10000), 18);
  assert.strictEqual(W.pctVsPrev(5000, 10000), -50);
  assert.strictEqual(W.pctVsPrev(5000, 0), null);
  const prev = INTL.filter(r => OrdersCommon.weekStartOf(r) === '2026-09-12');
  assert.deepStrictEqual(prev.map(r => r.id), ['recP7']);
});

test('strip = three weeks back, one ahead; status of past/current weeks', () => {
  assert.deepStrictEqual(W.stripWeeks(WEEK), ['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
  assert.strictEqual(W.weekStatus(WEEK, model.weekIntl, stateOf, '2026-09-28').kind, 'open');
  assert.strictEqual(W.weekStatus(WEEK, model.weekIntl, stateOf, '2026-09-28').n, 5);
  assert.strictEqual(W.weekStatus(NEXT, [], stateOf, '2026-09-28').kind, 'progress');
  assert.strictEqual(W.weekStatus('2026-09-12', [INTL[8]], stateOf, '2026-09-28').kind, 'all');
});

test('RT read failed → no RT rows, every order of the week listed on its own', () => {
  const m = W.buildWeek({ week: WEEK, intl: INTL, natl: NATL, rts: null });
  assert.strictEqual(m.rtFailed, true);
  assert.strictEqual(m.rows.length, 0);
  assert.strictEqual(m.noRt.length, 7);
});

test('a split leg resolves to its parent and is counted once', () => {
  const parent = o('recPa', 500, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', Price: 4000, Status: 'Delivered' });
  const leg1 = o('recL1', 501, { Direction: 'Export', 'Delivery DateTime': '2026-09-21T08:00', 'Parent Order': ['recPa'] });
  const leg2 = o('recL2', 502, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', 'Parent Order': ['recPa'] });
  const rts = [
    { id: 1, code: 'RT-A', date_start: '2026-09-19', ct_rt_legs: [{ order_id: 501, direction: 'EXPORT', seq: 1 }] },
    { id: 2, code: 'RT-B', date_start: '2026-09-20', ct_rt_legs: [{ order_id: 502, direction: 'EXPORT', seq: 1 }] },
  ];
  const m = W.buildWeek({ week: WEEK, intl: [parent, leg1, leg2], natl: [], rts });
  assert.deepStrictEqual(m.weekIntl.map(r => r.id), ['recPa']);
  assert.deepStrictEqual(m.rows.find(r => r.code === 'RT-A').counted.map(r => r.id), ['recPa']);
  assert.deepStrictEqual(m.rows.find(r => r.code === 'RT-B').counted, []);
  assert.strictEqual(m.rows.find(r => r.code === 'RT-B').exp[0].dupOf, 'RT-A');
  assert.strictEqual(m.noRt.length, 0);
});

test('pg id: «Order ID», else «Order No»', () => {
  assert.strictEqual(W.pgIdOf({ fields: { 'Order ID': 7 } }), '7');
  assert.strictEqual(W.pgIdOf({ fields: { 'Order No': 8 } }), '8');
  assert.strictEqual(W.pgIdOf({ fields: {} }), null);
});
