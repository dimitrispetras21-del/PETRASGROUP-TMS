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
global.OrdersData = require('../core/orders-common.js').OrdersData;
global.WI4 = require('../core/wi4-logic.js');     // the Weekly International's day order (one rule)
global.WN5L = require('../core/wn5-logic.js');    // the Weekly National v5's row order (one rule)
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
// Same shape as OrdersData.stateOf since B0 (owner 21/10/2026: invoiced from the registration — no
// «not delivered» state), without the pallet gate.
const stateOf = r => {
  const f = r.fields;
  if (OrdersCommon.isInvoiced(f)) return { key: 'invoiced' };
  if (f.Status === 'Cancelled') return { key: 'cancelled' };
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
  assert.strictEqual(tI.readyN, 4, 'recI3 in transit is «προς κοπή» too (B0)');
  assert.ok(!('pendingN' in tI) && !('pendingSum' in tI), 'no «σε εξέλιξη» bucket since B0');
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
  assert.strictEqual(v('RT-1185').kind, 'ready', 'B0: an import on the road is «προς κοπή»');
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

test('strip = three weeks back, one ahead; the cell word comes from the totals, never «ανοιχτά»', () => {
  assert.deepStrictEqual(W.stripWeeks(WEEK), ['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
  const st = recs => W.weekStatus(W.totals(recs, stateOf));
  assert.deepStrictEqual(st(model.weekIntl), { kind: 'ready', n: 4, text: '4 προς κοπή' });
  assert.strictEqual(st([]).text, 'χωρίς παραγγελίες');
  assert.strictEqual(st([INTL[8]]).text, 'όλα τιμολογημένα');
  assert.strictEqual(st([INTL[3]]).text, '1 προς κοπή', 'B0: never «σε εξέλιξη»');
  assert.strictEqual(st([INTL[4]]).text, '1 μπλοκ');
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

// ── Stock lots (057, contract §5.8): one lot + one piece ────────────────────
// This view reads its OWN ORDERS window (not OrdersData's set), so a piece
// reaches buildWeek: it must never be counted (no price, the lot is invoiced
// once) — its RT shows the leg «στην παρτίδα #n» and no total moves.
test('stock: a piece in an RT is shown, never counted; no total changes because of it; the lot is «ready» like any priced order (B0)', () => {
  require('vm').runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'data-helpers.js'), 'utf8'));
  const { OrdersStock, OrdersData } = require('../core/orders-common.js');
  global.OrdersStock = OrdersStock;
  const LOT = o('recLot', 1300, { Direction: 'Import', 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-21T08:00', Price: 3300, Status: 'Delivered', 'Own Stock Lot': 'recLot1' });
  const PIECE = o('recPc', 1301, { Direction: 'Import', 'Loading DateTime': '2026-09-22T08:00', 'Delivery DateTime': '2026-09-24T08:00', Status: 'Delivered', 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300 });
  const PIECE2 = o('recPc2', 1302, { Direction: 'Import', 'Loading DateTime': '2026-09-23T08:00', 'Delivery DateTime': '2026-09-25T08:00', Status: 'Assigned', 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300 });
  const rts = [...RTS,
    // our truck: export #1240 + the piece as its import
    { id: 90, code: 'RT-1190', date_start: '2026-09-21', status: 'open', ct_rt_legs: [{ order_id: 1240, direction: 'EXPORT', seq: 1 }, { order_id: 1301, direction: 'IMPORT', seq: 2 }] },
    // an RT that carries only a piece: shown, worth nothing here (owner P&L only)
    { id: 91, code: 'RT-1191', date_start: '2026-09-23', status: 'open', ct_rt_legs: [{ order_id: 1302, direction: 'IMPORT', seq: 1 }] },
  ];
  const m0 = W.buildWeek({ week: WEEK, intl: [...INTL, LOT], natl: NATL, rts });
  const m1 = W.buildWeek({ week: WEEK, intl: [...INTL, LOT, PIECE, PIECE2], natl: NATL, rts });
  assert.ok(!m1.weekIntl.some(r => r.id === 'recPc' || r.id === 'recPc2'), 'pieces are not week orders');
  assert.deepStrictEqual(m1.weekIntl.map(r => r.id), m0.weekIntl.map(r => r.id));
  assert.deepStrictEqual(m1.noRt.map(r => r.rec.id), m0.noRt.map(r => r.rec.id));
  assert.deepStrictEqual(W.totals(m1.weekIntl, stateOf), W.totals(m0.weekIntl, stateOf), 'no total moves because of a piece');
  const rt = m1.rows.find(r => r.code === 'RT-1190');
  assert.deepStrictEqual(rt.counted.map(r => r.id), ['recN6']);
  assert.deepStrictEqual([rt.imp[0].piece, rt.imp[0].counted, rt.imp[0].rec.id], [true, false, 'recPc']);
  const only = m1.rows.find(r => r.code === 'RT-1191');
  assert.ok(only && only.counted.length === 0, 'a piece-only RT is listed with nothing counted');
  const perRow = [...m1.rows, ...m1.noRt].reduce((s, r) => s + W.totals(r.counted, stateOf).sum, 0);
  assert.strictEqual(perRow, W.totals(m1.weekIntl, stateOf).sum, 'Σ RT rows + Χωρίς RT = the week, still');
  // the lot itself (B0, owner 21/10/2026): invoiced from its registration — never blocked on its pieces
  const set = { intl: [], natl: [], gate: {}, gateFailed: false, stockFailed: false,
    stock: new Map([['recLot1', { id: 'recLot1', fields: { Complete: false, 'Remaining Pallets': 13, Pieces: 2, 'Pieces Delivered': 1 } }]]) };
  const t = W.totals(m1.weekIntl, r => OrdersData.stateOf(set, r));
  assert.deepStrictEqual(Object.keys(t.blocked), ['price'], 'B0: the price is the one block bucket');
  assert.strictEqual(t.blocked.price, 1, 'the unpriced export is still «price»');
});

// B0 (owner 21/10/2026): «παλαιότερη εκκρεμής» of a lot counts from its own
// delivery, like every order (OrdersData.ageOf, carried by the page's state function).
test('stock: oldest pending counts a lot from its own delivery, like every order (B0)', () => {
  const { OrdersStock, OrdersData } = require('../core/orders-common.js');
  global.OrdersStock = OrdersStock;
  const LOT = o('recLot', 1300, { Direction: 'Import', 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-21T08:00', Price: 3300, Status: 'Delivered', 'Own Stock Lot': 'recLot1' });
  const set = { intl: [], natl: [], gate: {}, gateFailed: false, stockFailed: false,
    stock: new Map([['recLot1', { id: 'recLot1', fields: { Complete: false } }]]) };
  const bare = r => OrdersData.stateOf(set, r);
  const paged = Object.assign(r => OrdersData.stateOf(set, r), { ageOf: r => OrdersData.ageOf(set, r) });
  assert.strictEqual(W.totals([LOT], paged).oldest, OrdersCommon.daysSinceDelivery(LOT), 'incomplete lot → its delivery age');
  assert.strictEqual(W.totals([LOT], bare).oldest, OrdersCommon.daysSinceDelivery(LOT), 'the bare state function agrees');
  set.stock.get('recLot1').fields = { Complete: true, 'Completed On': OrdersCommon.addDays(OrdersCommon.today(), -1) };
  assert.strictEqual(W.totals([LOT], paged).oldest, OrdersCommon.daysSinceDelivery(LOT), '«Completed On» no longer counts');
});

// Review B0 #2: «παλαιότερη εκκρεμής» is a DELIVERED order's age (OrdersData.ageOf), with the page's
// state function or a bare one — an order still on the road past its date, or a future one, has none.
test('oldest pending: only delivered orders have an age — in transit past its date counts nothing (B0 review #2)', () => {
  const late = o('recLate', 1600, { Direction: 'Import', 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-21T08:00', Price: 900, Status: 'In Transit' });
  const done = o('recDone', 1601, { Direction: 'Import', 'Loading DateTime': '2026-09-20T08:00', 'Delivery DateTime': '2026-09-22T08:00', Price: 900, Status: 'Delivered' });
  const bare = r => OrdersData.stateOf({ gate: {}, gateFailed: false }, r);
  assert.strictEqual(W.totals([late], bare).oldest, null, 'in transit: no age');
  assert.strictEqual(W.totals([late, done], bare).oldest, OrdersCommon.daysSinceDelivery(done), 'only the delivered one counts');
});

// ══ v4 (owner 13/10, Figma 1514:8013) ═══════════════════════════════════════

test('0 € = no price everywhere: never summed, counted apart (owner 13/10 α)', () => {
  const zero = o('recZ', 1400, { Direction: 'Export', 'Delivery DateTime': '2026-09-21T08:00', Price: 0, Status: 'Delivered' });
  const t = W.totals([zero, INTL[0]], stateOf);
  assert.strictEqual(t.sum, 3200);
  assert.strictEqual(t.unpriced, 1);
  assert.deepStrictEqual(t.unpricedRecs.map(r => r.id), ['recZ']);
  assert.strictEqual(t.blocked.price, 1, 'a delivered 0 € order is blocked on price, like an empty one');
});

test('totals reconcile: τζίρος = τιμολογημένα + ατιμολόγητα (priced, in-week, invoiceable)', () => {
  for (const recs of [model.weekIntl, model.weekNatl, [...model.weekIntl, ...model.weekNatl], []]) {
    const t = W.totals(recs, stateOf);
    assert.strictEqual(Math.round((t.invSum + t.openSum) * 100), Math.round(t.sum * 100));
    assert.strictEqual(t.invN + t.openN, t.n);
    assert.strictEqual(t.openSum, t.readySum + t.blockedSum.price);
  }
  const tI = W.totals(model.weekIntl, stateOf);
  assert.strictEqual(tI.openSum, 3350 + 2650 + 2800 + 1000);
});

test('national Type «Veroia Switch»: shown, but out of every total, count and verdict (decision 3)', () => {
  const vs = n('recVS', { Type: 'Veroia Switch', 'Loading DateTime': '2026-09-21T08:00', 'Delivery DateTime': '2026-09-21T15:00', Price: 900, Status: 'Delivered' });
  assert.strictEqual(W.isVsNational(vs), true);
  assert.strictEqual(W.isVsNational(NATL[0]), false);
  assert.strictEqual(W.isVsNational(o('x', 1, { Type: 'Veroia Switch' })), false, 'only national records');
  const m = W.buildWeek({ week: WEEK, intl: INTL, natl: [...NATL, vs], rts: RTS });
  assert.ok(m.weekNatl.some(r => r.id === 'recVS'), 'still listed');
  assert.deepStrictEqual(W.totals(m.weekNatl, stateOf), W.totals(NATL, stateOf));
  assert.strictEqual(W.rtInvoicing([vs], stateOf).kind, 'none');
  assert.strictEqual(W.tpyOf(vs, stateOf(vs)).text, 'δεν τιμολογείται');
});

test('an amount of another week: shown on the leg, out of the RT Σ (flag for «*»)', () => {
  const r = row('RT-1188');
  const other = r.legs.find(l => l.rec && !l.inWeek);
  assert.ok(other && other.rec.id === 'recI2' && other.week === NEXT);
  assert.strictEqual(other.counted, false);
  assert.strictEqual(W.totals(r.counted, stateOf).sum, 3350, 'Σ RT = the export only');
});

test('day sections: always Saturday → Friday, empty days kept; moved rows after Friday (§09)', () => {
  const sec = W.daySections(WEEK, model.rows);
  assert.deepStrictEqual(sec.days.map(d => d.day), ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
  assert.deepStrictEqual(sec.days.map(d => d.rows.map(r => r.code)), [[], ['RT-1183'], ['RT-1181', 'RT-1185'], [], [], ['RT-1187'], ['RT-1188']]);
  const empty = W.daySections('2026-10-17', []);
  assert.strictEqual(empty.days.length, 7);
  assert.ok(empty.days.every(d => d.rows.length === 0));
  // An import moved into this week by «Plan Week Start» (its own loading is the week before)
  const mv = o('recMv', 1500, { Direction: 'Import', 'Loading DateTime': '2026-09-17T08:00', 'Delivery DateTime': '2026-09-19T08:00', 'Plan Week Start': '2026-09-19', Price: 1500, Status: 'In Transit' });
  assert.strictEqual(W.naturalDateOf(mv), '2026-09-17');
  const rts = [...RTS, { id: 95, code: 'RT-1195', date_start: '2026-09-17', status: 'open', ct_rt_legs: [{ order_id: 1500, direction: 'IMPORT', seq: 1 }] }];
  const m = W.buildWeek({ week: WEEK, intl: [...INTL, mv], natl: [], rts });
  const s2 = W.daySections(WEEK, m.rows);
  assert.deepStrictEqual(s2.moved.map(r => r.code), ['RT-1195']);
  assert.strictEqual(s2.moved[0].day, '2026-09-17', 'shown with its real date, not on Saturday');
  assert.ok(!s2.days[0].rows.some(r => r.code === 'RT-1195'));
});

test('verdict under the assignment: «1 από 2 παραγγ.», block priority, hidden for one order (§06)', () => {
  const v = code => W.rtInvoicing(row(code).counted, stateOf);
  assert.strictEqual(W.verdictText(v('RT-1187'), 2), '1 από 2 παραγγ. · ατιμολόγητα 2.800,00');
  assert.ok(!/\d\/\d/.test(W.verdictText(v('RT-1187'), 2)), 'never «1/2»');
  assert.strictEqual(W.verdictText(v('RT-1183'), 1), 'τιμή → owner/λογιστήριο');
  assert.strictEqual(W.verdictText(v('RT-1181'), 1), '', 'one invoiced order: the ΤΠΥ cell says it');
  assert.strictEqual(W.verdictText(v('RT-1188'), 1), '');
  // the price is the one block (B0); a priced order beside it does not hide it
  assert.deepStrictEqual(W.rtInvoicing([INTL[4], INTL[6]], stateOf).reasons, ['price']);
  // B0 (owner 21/10/2026): one delivered + one on the road = «προς κοπή» (invoiced from the registration)
  assert.strictEqual(W.rtInvoicing([INTL[1], INTL[3]], stateOf).kind, 'ready');
  assert.strictEqual(W.verdictText({ kind: 'ready' }, 2), 'προς κοπή');
});

test('ΤΠΥ vocabulary (§06)', () => {
  const t = (rec, s) => W.tpyOf(rec, s);
  assert.deepStrictEqual([t(INTL[0], { key: 'invoiced' }).cls, t(INTL[0], { key: 'invoiced' }).text], ['ok', '✓ 0431']);
  assert.strictEqual(t(o('a', 1, { Invoiced: true }), { key: 'invoiced' }).text, 'τιμολογήθηκε');
  assert.strictEqual(t(INTL[1], { key: 'ready' }).text, 'προς κοπή');
  assert.strictEqual(t(INTL[3], { key: 'cancelled' }).text, '— ακυρ.');
  assert.deepStrictEqual([t(INTL[4], { key: 'blocked', reason: 'price' }).cls, t(INTL[4], { key: 'blocked', reason: 'price' }).text], ['bad', 'τιμή']);
});

test('word-safe route truncation: never below the destination\'s first word (§12 #06)', () => {
  assert.deepStrictEqual(W.routeSplit('Naoussa', 'München DE'), { head: 'Naoussa → München', tail: ' DE' });
  assert.deepStrictEqual(W.routeSplit('Rotterdam NL', 'Amsterdam'), { head: 'Rotterdam NL → Amsterdam', tail: '' });
  assert.deepStrictEqual(W.routeSplit('Veroia', 'Veverská Bítýška CZ'), { head: 'Veroia → Veverská', tail: ' Bítýška CZ' });
  assert.strictEqual(W.routeSplit('', '').head, '— → —');
  assert.strictEqual(W.placeText({ name: 'X', city: 'Veroia', cc: 'GR' }), 'Veroia', 'no country inside Greece');
  assert.strictEqual(W.placeText({ name: 'X', city: 'Kraków', cc: 'PL' }), 'Kraków PL');
  assert.strictEqual(W.placeText({ name: 'Depot', city: '', cc: '' }), 'Depot');
});

// ── National pairs via «Matched Load» (owner 13/10) ─────────────────────────
global.getLinkedId = v => (Array.isArray(v) ? v[0] : v) || null;
const NWEEK = '2026-10-03';   // Sat 3/10 – Fri 9/10
const nn = (id, dir, f) => n(id, Object.assign({ Direction: dir }, f));
const NO = [
  nn('rK1', 'North→South', { 'Loading DateTime': '2026-10-05T08:00', 'Delivery DateTime': '2026-10-06T08:00', Price: 620, Invoiced: true, 'Invoice Number': '0462', Status: 'Delivered' }),
  nn('rA1', 'South→North', { 'Loading DateTime': '2026-10-07T08:00', 'Delivery DateTime': '2026-10-08T08:00', Price: 480, Status: 'Delivered' }),
  nn('rK2', 'North→South', { 'Loading DateTime': '2026-10-08T08:00', 'Delivery DateTime': '2026-10-09T08:00', Price: 620 }),
  nn('rA2', 'South→North', { 'Loading DateTime': '2026-10-12T08:00', 'Delivery DateTime': '2026-10-13T08:00', Price: 480 }),   // next week
  nn('rK3', 'North→South', { 'Loading DateTime': '2026-10-03T08:00', 'Delivery DateTime': '2026-10-04T08:00', Price: 560 }),   // VS partner
  nn('rK4', 'North→South', { 'Loading DateTime': '2026-10-09T08:00', 'Delivery DateTime': '2026-10-10T08:00', Price: 560 }),   // load, no pair
  nn('rK5', 'North→South', { 'Loading DateTime': '2026-10-09T09:00', 'Delivery DateTime': '2026-10-10T08:00', Price: 300 }),   // no load
  nn('rA3', 'South→North', { 'Loading DateTime': '2026-10-06T08:00', 'Delivery DateTime': '2026-10-07T08:00', Price: 390, 'National Groupage': true }),
];
const NL = [
  { id: 'nl1', fields: { 'Source National Order': ['rK1'], 'Matched Load': 'nl2', Truck: ['t1'] } },
  { id: 'nl2', fields: { 'Source National Order': ['rA1'], 'Matched Load': 'nl1' } },
  // one-sided: only the ΑΝΟΔΟΣ names its pair
  { id: 'nl3', fields: { 'Source National Order': ['rK2'] } },
  { id: 'nl4', fields: { 'Source National Order': ['rA2'], 'Matched Load': 'nl3' } },
  { id: 'nl5', fields: { 'Source National Order': ['rK3'], 'Matched Load': 'nlVS' } },
  { id: 'nlVS', fields: { 'Source Type': 'Direct', 'Source Order': ['recIntl'], Direction: 'South→North' } },
  { id: 'nl6', fields: { 'Source National Order': ['rK4'] } },
];
const INTL_VS = [o('recIntl', 1250, { Direction: 'Export', 'Delivery DateTime': '2026-10-05T08:00', Price: 3000 })];
const pairs = W.pairNationals({ week: NWEEK, natl: NO, loads: NL, intl: INTL_VS });
const pairOf = id => pairs.find(p => [p.kat, p.ano].some(s => s && s.rec && s.rec.id === id));

test('national pairs: ΚΑΘΟΔΟΣ ↔ ΑΝΟΔΟΣ through Matched Load, each order once', () => {
  const p = pairOf('rK1');
  assert.strictEqual(p.kat.rec.id, 'rK1'); assert.strictEqual(p.ano.rec.id, 'rA1');
  assert.strictEqual(p.assign.kind, 'load'); assert.strictEqual(p.assign.load.id, 'nl1', 'ΑΝΑΘΕΣΗ from the ΚΑΘΟΔΟΣ load');
  assert.deepStrictEqual(p.counted.map(r => r.id), ['rK1', 'rA1']);
  assert.strictEqual(p.day, '2026-10-05');
  const ids = pairs.flatMap(x => [x.kat, x.ano]).filter(s => s && s.rec).map(s => s.rec.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'no order on two rows');
});

test('national pairs: one-sided Matched Load still pairs; a partner of another week is grey, not counted', () => {
  const p = pairOf('rK2');
  assert.strictEqual(p.ano.rec.id, 'rA2');
  assert.strictEqual(p.ano.inWeek, false); assert.strictEqual(p.ano.week, '2026-10-10');
  assert.deepStrictEqual(p.counted.map(r => r.id), ['rK2']);
});

test('national pairs: a VS partner is text only; no pair; no load; groupage; loads not read', () => {
  const vs = pairOf('rK3');
  assert.deepStrictEqual([vs.ano.kind, vs.ano.dir, vs.ano.intlRec.id], ['vs', 'up', 'recIntl']);
  assert.deepStrictEqual(vs.counted.map(r => r.id), ['rK3'], 'the VS price is on the international order');
  const lone = pairOf('rK4');
  assert.strictEqual(lone.ano, null, '«Χωρίς άνοδο»'); assert.strictEqual(lone.assign.kind, 'load');
  assert.strictEqual(pairOf('rK5').assign.kind, 'out', '«εκτός φορτίου»');
  const g = pairOf('rA3');
  assert.strictEqual(g.kat, null); assert.strictEqual(g.assign.kind, 'grp', '«μέσω ομαδοποίησης»');
  const failed = W.pairNationals({ week: NWEEK, natl: NO, loads: null, intl: [] });
  assert.ok(failed.every(p => p.assign.kind === 'failed' && p.loadsFailed), 'never «εκτός φορτίου» when the loads were not read');
  assert.strictEqual(failed.length, NO.filter(r => OrdersCommon.weekStartOf(r) === NWEEK).length, 'every order of the week still listed');
});

test('page subtitle: the week in words', () => {
  assert.strictEqual(W.weekTitle('2026-10-03'), '3 – 9 Οκτωβρίου');
  assert.strictEqual(W.weekTitle('2026-09-26'), '26 Σεπτεμβρίου – 2 Οκτωβρίου');
});

// ══ Fix round 1 (critics 13/10) ═════════════════════════════════════════════

test('national pairs: a stale one-sided Matched Load never steals a two-sided pair, whatever the order', () => {
  // lA ↔ lC two-sided; lB → lA left over from an old pairing. rB loads FIRST.
  const recs = [
    nn('rB', 'North→South', { 'Loading DateTime': '2026-10-04T08:00', 'Delivery DateTime': '2026-10-05T08:00', Price: 100 }),
    nn('rA', 'North→South', { 'Loading DateTime': '2026-10-05T08:00', 'Delivery DateTime': '2026-10-06T08:00', Price: 200 }),
    nn('rC', 'South→North', { 'Loading DateTime': '2026-10-07T08:00', 'Delivery DateTime': '2026-10-08T08:00', Price: 300 }),
  ];
  const loads = [
    { id: 'lB', fields: { 'Source National Order': ['rB'], 'Matched Load': 'lA' } },
    { id: 'lA', fields: { 'Source National Order': ['rA'], 'Matched Load': 'lC' } },
    { id: 'lC', fields: { 'Source National Order': ['rC'], 'Matched Load': 'lA' } },
  ];
  for (const ls of [loads, loads.slice().reverse()]) {
    const rows = W.pairNationals({ week: NWEEK, natl: recs, loads: ls, intl: [] });
    const a = rows.find(r => r.kat && r.kat.rec && r.kat.rec.id === 'rA');
    assert.strictEqual(a.ano.rec.id, 'rC');
    const b = rows.find(r => r.kat && r.kat.rec && r.kat.rec.id === 'rB');
    assert.strictEqual(b.ano, null, 'the stale side has no pair («Χωρίς άνοδο»)');
    assert.strictEqual(rows.length, 2);
  }
});

test('ORDERS window also reads orders moved INTO the window by «Plan Week Start» (§09)', () => {
  const f = W.ordersFormula('2026-09-01', '2026-10-30');
  assert.ok(/IS_AFTER\(\{Plan Week Start\},'2026-09-01'\),IS_BEFORE\(\{Plan Week Start\},'2026-10-30'\)/.test(f));
  assert.ok(f.startsWith("AND({Type}='International',OR("));
  // and such an order lands in the planned week's «ΜΕΤΑΦΕΡΘΗΚΕ» even with dates months away
  const far = o('recFar', 1600, { Direction: 'Import', 'Loading DateTime': '2026-06-02T08:00', 'Plan Week Start': WEEK, Price: 900, Status: 'Assigned' });
  const m = W.buildWeek({ week: WEEK, intl: [far], natl: [], rts: [{ id: 160, code: 'RT-1600', status: 'open', ct_rt_legs: [{ order_id: 1600, direction: 'IMPORT', seq: 1 }] }] });
  assert.deepStrictEqual(m.weekIntl.map(r => r.id), ['recFar']);
  assert.deepStrictEqual(W.daySections(WEEK, m.rows).moved.map(r => r.code), ['RT-1600']);
});

test('a cancelled order on an RT leg or as a split parent is «ακυρωμένη», never «εκτός εύρους», never counted', () => {
  const dead = o('recX', 1700, { Direction: 'Import', 'Loading DateTime': '2026-09-22T08:00', Price: 999, Status: 'Cancelled' });
  const deadParent = o('recXP', 1701, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', Price: 999, Status: 'Cancelled' });
  const leg = o('recXL', 1702, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', 'Parent Order': ['recXP'] });
  const rts = [{ id: 170, code: 'RT-1700', status: 'open', ct_rt_legs: [{ order_id: 1240, direction: 'EXPORT', seq: 1 }, { order_id: 1700, direction: 'IMPORT', seq: 2 }, { order_id: 1702, direction: 'EXPORT', seq: 3 }] }];
  const m = W.buildWeek({ week: WEEK, intl: [...INTL, leg], natl: [], rts, cancelled: [dead, deadParent] });
  const r = m.rows.find(x => x.code === 'RT-1700');
  const imp = r.imp[0];
  assert.deepStrictEqual([imp.cancelled, imp.counted, imp.rec.id], [true, false, 'recX']);
  const sp = r.exp.find(l => l.orderId === 1702);
  assert.deepStrictEqual([sp.cancelled, sp.rec.id], [true, 'recXP']);
  assert.deepStrictEqual(r.counted.map(x => x.id), ['recN6']);
});

test('a split leg puts its RT in the LEG\'s week; the parent is counted in its own week (guest row there)', () => {
  const parent = o('recSP', 1800, { Direction: 'Export', 'Delivery DateTime': '2026-09-29T08:00', Price: 4000, Status: 'Delivered' });   // next week
  const leg = o('recSL', 1801, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', 'Parent Order': ['recSP'] });             // this week
  const rts = [{ id: 180, code: 'RT-1800', status: 'open', ct_rt_legs: [{ order_id: 1801, direction: 'EXPORT', seq: 1 }] }];
  const here = W.buildWeek({ week: WEEK, intl: [parent, leg], natl: [], rts });
  const r = here.rows.find(x => x.code === 'RT-1800');
  assert.ok(r && !r.guest && r.day === '2026-09-22');
  assert.deepStrictEqual(r.counted, [], 'the parent counts next week');
  const there = W.buildWeek({ week: NEXT, intl: [parent, leg], natl: [], rts });
  const g = there.rows.find(x => x.code === 'RT-1800');
  assert.ok(g && g.guest && g.homeWeek === WEEK);
  assert.deepStrictEqual(g.counted.map(x => x.id), ['recSP']);
});

// ── Row order = the Weekly boards' order (owner 2/11/2026: Ειρήνη compares row by row) ──
test('international day: the Weekly International order (WI4.dayRowOrder) — exports, VS last, then time; import-only after; guests last', () => {
  const X = [
    o('xZ', 3001, { Direction: 'Export', 'Loading DateTime': '2026-09-19T08:00', 'Delivery DateTime': '2026-09-21T10:00', Price: 1 }),
    o('xAv', 3002, { Direction: 'Export', 'Veroia Switch': true, 'Loading DateTime': '2026-09-19T08:00', 'Delivery DateTime': '2026-09-21T06:00', Price: 1 }),
    o('xA2', 3003, { Direction: 'Export', 'Loading DateTime': '2026-09-19T08:00', 'Delivery DateTime': '2026-09-21T12:00', Price: 1 }),
    o('xA1', 3004, { Direction: 'Export', 'Loading DateTime': '2026-09-19T08:00', 'Delivery DateTime': '2026-09-21T09:00', Price: 1 }),
    o('xIb', 3005, { Direction: 'Import', 'Loading DateTime': '2026-09-21T06:00', Price: 1 }),
    o('xIa', 3006, { Direction: 'Import', 'Loading DateTime': '2026-09-21T09:00', Price: 1 }),
    // a guest: its export is in the previous week, its import loads Monday here
    o('xGe', 3007, { Direction: 'Export', 'Loading DateTime': '2026-09-14T08:00', 'Delivery DateTime': '2026-09-16T08:00', Price: 1 }),
    o('xGi', 3008, { Direction: 'Import', 'Loading DateTime': '2026-09-21T05:00', Price: 1 }),
  ];
  const rt = (id, legs) => ({ id, code: 'RT-' + id, date_start: '2026-09-19', status: 'open', ct_rt_legs: legs.map(([order_id, direction], i) => ({ order_id, direction, seq: i + 1 })) });
  const R = [rt(1, [[3001, 'EXPORT']]), rt(2, [[3002, 'EXPORT']]), rt(3, [[3003, 'EXPORT'], [3005, 'IMPORT']]), rt(4, [[3004, 'EXPORT']]),
    rt(5, [[3005, 'IMPORT']]), rt(6, [[3006, 'IMPORT']]), rt(7, [[3007, 'EXPORT'], [3008, 'IMPORT']])];
  // RT-3 carries 3005 too: a leg counted once (RT-3 first by date_start/id) — RT-5 then has nothing in the week of its own
  const m = W.buildWeek({ week: WEEK, intl: X, natl: [], rts: R });
  const mon = W.daySections(WEEK, m.rows).days.find(d => d.day === '2026-09-21');
  assert.deepStrictEqual(mon.rows.map(r => r.code), ['RT-4', 'RT-1', 'RT-3', 'RT-2', 'RT-5', 'RT-6', 'RT-7']);
  // the exports of that day in exactly the Weekly's own comparator order
  const weekly = X.slice(0, 4).sort((a, b) => WI4.dayRowOrder(a.fields, b.fields, 'Delivery DateTime')).map(r => r.id);
  assert.deepStrictEqual(weekly, ['xA1', 'xZ', 'xA2', 'xAv']);
  assert.deepStrictEqual(mon.rows.slice(0, 4).map(r => r.sortRec.id), weekly);
  assert.strictEqual(mon.rows[6].guest, true);
});

test('WI4.dayRowOrder is the Weekly International comparator (VS last, then the field; no client key, owner 2/11)', () => {
  const f = (c, vs, t) => ({ 'Client Name': c, 'Veroia Switch': vs, 'Delivery DateTime': t });
  assert.ok(WI4.dayRowOrder(f('Zeta', false, '2026-09-21T06:00'), f('Alfa', false, '2026-09-21T12:00'), 'Delivery DateTime') < 0, 'time, never the client');
  assert.ok(WI4.dayRowOrder(f('', true, '2026-09-21T06:00'), f('', false, '2026-09-21T12:00'), 'Delivery DateTime') > 0, 'VS last');
  assert.strictEqual(WI4.dayRowOrder(null, undefined, 'Delivery DateTime'), 0);
});

test('national rows: the Weekly National v5 order (WN5L.rowOrder) — by day, with a vehicle first by time, then waiting', () => {
  const N = [
    n('nW1', { Direction: 'North→South', 'Loading DateTime': '2026-09-21T05:00', Price: 1 }),          // no load → waiting
    n('nT2', { Direction: 'North→South', 'Loading DateTime': '2026-09-21T11:00', Price: 1 }),          // load with a truck, late
    n('nT1', { Direction: 'North→South', 'Loading DateTime': '2026-09-21T07:00', Price: 1 }),          // load with a truck, early
    n('nV5', { 'Loading DateTime': '2026-09-21T09:00', Price: 1 }),                                    // v5 on a cycle
    n('nSa', { Direction: 'North→South', 'Loading DateTime': '2026-09-19T15:00', Price: 1 }),          // Saturday, waiting
  ];
  N[3]._v5 = { carriers: [{ kind: 'owned', code: 'RT-2001', side: 'KATHODOS', truck: 'ΝΑΧ 1' }], hub_side: null, executed: false };
  const L = [
    { id: 'L2', fields: { 'Source National Order': ['nT2'], Truck: ['recTr2'] } },
    { id: 'L1', fields: { 'Source National Order': ['nT1'], Truck: ['recTr1'] } },
  ];
  const rows = W.pairNationals({ week: WEEK, natl: N, loads: L, intl: [] });
  assert.deepStrictEqual(rows.map(r => r.openRec.id), ['nSa', 'nT1', 'nV5', 'nT2', 'nW1']);
});

test('WN5L.model sorts with the shared rowOrder (one rule for the board and «Εβδομάδα»)', () => {
  const rows = [
    { dayKey: '2026-09-21', kind: 'unassigned', sortAt: '2026-09-21T05:00:00Z', key: 'o1' },
    { dayKey: '2026-09-21', kind: 'cycle', sortAt: '2026-09-21T09:00:00Z', key: 'rt:2' },
    { dayKey: '2026-09-21', kind: 'cycle', sortAt: '2026-09-21T07:00:00Z', key: 'rt:9' },
    { dayKey: '2026-09-20', kind: 'unassigned', sortAt: null, key: 'o0' },
  ];
  assert.deepStrictEqual(rows.slice().sort(WN5L.rowOrder).map(r => r.key), ['o0', 'rt:9', 'rt:2', 'o1']);
});

test('an RT with several exports stands where its FIRST Weekly row stands (the leg the rule puts first, that day)', () => {
  const X = [
    o('mZ', 4001, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', Price: 1 }),
    o('mA', 4002, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T09:00', Price: 1 }),
    o('mK', 4003, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T07:00', Price: 1 }),
    o('mB', 4004, { Direction: 'Export', 'Delivery DateTime': '2026-09-23T07:00', Price: 1 }),   // another day: not a candidate
  ];
  const R = [
    { id: 1, code: 'RT-1', date_start: '2026-09-21', status: 'open', ct_rt_legs: [{ order_id: 4001, direction: 'EXPORT', seq: 1 }, { order_id: 4002, direction: 'EXPORT', seq: 2 }, { order_id: 4004, direction: 'EXPORT', seq: 3 }] },
    { id: 2, code: 'RT-2', date_start: '2026-09-21', status: 'open', ct_rt_legs: [{ order_id: 4003, direction: 'EXPORT', seq: 1 }] },
  ];
  const m = W.buildWeek({ week: WEEK, intl: X, natl: [], rts: R });
  const tue = W.daySections(WEEK, m.rows).days.find(d => d.day === '2026-09-22');
  assert.deepStrictEqual(tue.rows.map(r => r.code), ['RT-2', 'RT-1']);   // mK 07:00 < RT-1's first line mZ 08:00
  assert.strictEqual(tue.rows[1].sortRec.id, 'mZ');
});

// «Αυτοπαράδοση» (owner 2/11/2026, migration 101): counted as invoiced, labelled, no ΤΠΥ invented.
test('self delivery: invoiced in the totals, «✓ αυτοπαράδοση» in the ΤΠΥ cell', () => {
  const sd = o('recSD', 1299, { Direction: 'Export', 'Loading DateTime': '2026-09-22T08:00', 'Delivery DateTime': '2026-09-24T08:00', Status: 'Delivered', Invoiced: true, 'Self Delivery': true });
  const st = OrdersData.stateOf({ intl: [sd], natl: [], gate: {} }, sd);
  assert.strictEqual(st.key, 'invoiced');
  const cell = W.tpyOf(sd, st);
  assert.deepStrictEqual([cell.cls, cell.text], ['ok', '✓ αυτοπαράδοση']);
  const t = W.totals([sd], r => OrdersData.stateOf({ intl: [sd], natl: [], gate: {} }, r));
  assert.deepStrictEqual([t.invN, t.invSum, t.unpriced, t.openN], [1, 0, 1, 0], 'invoiced, its missing price never summed');
});

// ── The Weekly International's numbers on «Εβδομάδα» (owner 2/11/2026: «το 1 να αντιστοιχεί στο 1 του weekly») ──
// One source: WI4.weekNumbers (core/wi4-logic.js) runs the board's own rules (WI4.readWindow / weekExports / boardRows / boardNumbers /
// numberOf). Expected numbers below are worked out by hand from the board's rules, every edge case once.
test('Weekly numbers: one count for both screens, every edge case (group, matched, rota, split, shelved, moved, cancelled, another week)', () => {
  const X = [
    o('nE1', 5001, { Direction: 'Export', 'Delivery DateTime': '2026-09-21T09:00:00Z', 'Matched Import ID': 'nI1' }),
    o('nI1', 5002, { Direction: 'Import', 'Loading DateTime': '2026-09-21T10:00:00Z' }),                      // matched → inside E1's row
    o('nI2', 5003, { Direction: 'Import', 'Loading DateTime': '2026-09-21T06:00:00Z' }),                      // import-only, Monday
    o('nI3', 5004, { Direction: 'Import', 'Loading DateTime': '2026-09-21T12:00:00Z', 'Rotation ID': 'nE1' }),// rota leg under E1
    o('nE2', 5005, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T09:00:00Z', 'Group ID': 'GRP-9|nE3,nE2' }),
    o('nE3', 5006, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T09:00:00Z', 'Group ID': 'GRP-9|nE3,nE2' }),
    o('nE4', 5007, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T07:00:00Z', 'Veroia Switch': true }),   // VS last in its day
    o('nP', 5008, { Direction: 'Export', 'Delivery DateTime': '2026-09-23T09:00:00Z' }),
    o('nL1', 5009, { Direction: 'Export', 'Delivery DateTime': '2026-09-23T08:00:00Z', 'Parent Order': ['nP'], 'Leg No': 1 }),
    o('nL2', 5010, { Direction: 'Export', 'Delivery DateTime': '2026-09-23T12:00:00Z', 'Parent Order': ['nP'], 'Leg No': 2 }),
    o('nE5', 5011, { Direction: 'Export', 'Delivery DateTime': '2026-09-24T09:00:00Z', Status: 'Cancelled' }),     // the board's reads keep it
    o('nI4', 5012, { Direction: 'Import', 'Loading DateTime': '2026-09-24T09:00:00Z', 'Stock Lot': ['recLot'] }),  // a loose piece: on the shelf
    o('nI5', 5013, { Direction: 'Import', 'Loading DateTime': '2026-09-29T09:00:00Z', 'Plan Week Start': '2026-09-19' }),   // moved INTO this week
    o('nI6', 5014, { Direction: 'Import', 'Loading DateTime': '2026-09-15T09:00:00Z' }),                      // another week's import
    o('nE6', 5015, { Direction: 'Export', 'Delivery DateTime': '2026-10-20T09:00:00Z' }),                     // far outside the board's reads
  ];
  // the board's toLocalDate (core/utils.js): a datetime's LOCAL day (TZ = Athens above)
  const localDay = d => { if (!d) return ''; const t = new Date(d); if (isNaN(t)) return ''; return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const nums = WI4.weekNumbers({ recs: X, wsDate: new Date('2026-09-19T00:00:00'), dayOf: localDay,
    split: true, shelf: true, isLoose: f => !!f['Stock Lot'] && !f.Truck && !f.Partner });
  const got = Object.fromEntries(X.map(r => [r.id, nums.get(r.id) == null ? '—' : nums.get(r.id)]));
  assert.deepStrictEqual(got, {
    nE1: 1, nI1: 1, nI3: 1,          // Monday: the export, its matched import and its rota leg are one row
    nI2: 2,                          // Monday's import-only row, after the exports
    nE2: 3, nE3: 3,                  // Tuesday: a group is one row, one number
    nE4: 4,                          // Veroia Switch last in its day, though earlier in time
    nP: 5, nL1: 5, nL2: 5,           // a split: the parent's number, its legs hang under it
    nE5: 6,                          // cancelled: still a row of the board
    nI5: 7,                          // moved into the week: after Friday («μεταφέρθηκε»)
    nI4: '—', nI6: '—', nE6: '—',    // on the shelf · another week · outside the reads
  });
  // without the shelf (stock off) the loose piece is a Thursday import-only row
  const noShelf = WI4.weekNumbers({ recs: X, wsDate: new Date('2026-09-19T00:00:00'), dayOf: localDay, split: true, shelf: false, isLoose: () => true });
  assert.strictEqual(noShelf.get('nI4'), 7);
  assert.strictEqual(noShelf.get('nI5'), 8);
});

test('leg numbers: each order line takes the number of the Weekly line that draws it; a row sorts by its smallest', () => {
  const nums = new Map([['a', 3], ['b', 4], ['c', 7]]);
  const leg = id => ({ rec: { id }, own: { id } });
  assert.strictEqual(W.legNumber(leg('b'), nums), 4);
  assert.strictEqual(W.legNumber(leg('z'), nums), null);                                   // on no line of this week
  assert.strictEqual(W.legNumber({ own: { id: 'leg' }, rec: { id: 'c' } }, nums), 7);      // a split leg: its parent's line
  assert.strictEqual(W.legNumber({ rec: null }, nums), null);                              // out of range: no record
  assert.deepStrictEqual(W.rowNumbers({ legs: [leg('b'), leg('a'), leg('a'), leg('z')] }, nums), [3, 4]);
});

test('inside a day, the board number orders the rows first; rows without one follow the board rule', () => {
  const A = { day: '2026-09-21', code: 'RT-2', nos: [5], sortExp: true, sortRec: { fields: {} } };
  const B = { day: '2026-09-21', code: 'RT-1', nos: [2], sortExp: true, sortRec: { fields: {} } };
  const C = { day: '2026-09-21', code: 'RT-0', nos: [], sortExp: true, sortRec: { fields: {} } };
  const sec = W.daySections('2026-09-19', [A, C, B]);
  assert.deepStrictEqual(sec.days.find(d => d.day === '2026-09-21').rows.map(r => r.code), ['RT-1', 'RT-2', 'RT-0']);
});

test('a load with stops on two days sits on the earlier one, as on the Weekly (owner 3/11); never in another week', () => {
  // recE1 delivers Mon 21/9 (stop 1); a second delivery Sun 20/9 → Sunday. recN6 (no RT) delivers Tue 22/9; a
  // second delivery Fri 18/9 (the week before) → stays Tuesday: the week is the invoicing one (weekDateOf).
  // recI3 loads Mon 21/9; a second loading Sat 19/9 → Saturday.
  const stopDates = new Map([
    ['recE1', { L: [], D: [{ dt: '2026-09-21' }, { dt: '2026-09-20' }] }],
    ['recN6', { L: [], D: [{ dt: '2026-09-22' }, { dt: '2026-09-18' }] }],
    ['recI3', { L: [{ dt: '2026-09-21' }, { dt: '2026-09-19' }], D: [] }],
  ]);
  const m = W.buildWeek({ week: WEEK, intl: INTL, natl: NATL, rts: RTS, stopDates });
  assert.strictEqual(m.rows.find(r => r.code === 'RT-1181').day, '2026-09-20');
  assert.strictEqual(m.rows.find(r => r.code === 'RT-1185').day, '2026-09-19');
  assert.strictEqual(m.noRt.find(r => r.rec.id === 'recN6').day, '2026-09-22');
  assert.deepStrictEqual(m.weekIntl.map(r => r.id).sort(), model.weekIntl.map(r => r.id).sort(), 'the week does not change');
  // without stop dates: the order's own day, as before
  assert.strictEqual(model.rows.find(r => r.code === 'RT-1181').day, '2026-09-21');
});

// ── The printed «Εβδομάδα τιμολόγησης» (owner 3/11/2026, Figma 2543:7735) ──
// printDoc draws the model the screen painted; these check it never counts on its own.
global.escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eurOf = v => OrdersCommon.eur(v);
function printModel(extra) {
  const m = W.buildWeek({ week: WEEK, intl: INTL, natl: NATL, rts: RTS });
  let i = 1;
  for (const r of [...m.rows, ...m.noRt]) r.nos = [i++];
  const natRows = W.pairNationals({ week: WEEK, natl: NATL, loads: [], intl: INTL });
  const tI = W.totals(m.weekIntl, stateOf), tN = W.totals(m.weekNatl, stateOf), tAll = W.totals([...m.weekIntl, ...m.weekNatl], stateOf);
  return Object.assign({ week: WEEK, m, natRows, tI, tN, tAll, star: [], dag: tAll.unpricedRecs.slice(), stateOf,
    fails: [], numsOk: true, showI: true, showN: true, stopDates: null }, extra || {});
}

test('print: every round trip is one block with the screen\'s Σ, in the Weekly order', () => {
  const P = printModel(), doc = W.printDoc(P, { printed: 'x' });
  assert.ok(doc.ok);
  const seq = W.printSequence(WEEK, P.m);
  const sec = W.daySections(WEEK, P.m.rows);
  assert.deepStrictEqual(seq.slice(0, P.m.rows.length).map(r => r.code), [...sec.days.flatMap(x => x.rows), ...sec.moved, ...sec.other].map(r => r.code), 'the screen\'s «Ανά ημέρα» order');
  assert.deepStrictEqual(seq.slice(P.m.rows.length).map(r => r.rec.id), ['recN6'], '«χωρίς δρομολόγιο» last');
  assert.strictEqual(seq.length, P.m.rows.length + P.m.noRt.length, 'no row dropped');
  const trips = doc.html.split('<tr class="owvp-trip">').slice(1);
  assert.strictEqual(trips.length, seq.length + P.natRows.length, 'one block per trip (+ national pairs)');
  seq.forEach((r, k) => {
    const s = W.rowSum(r.counted), mk = W.rowMarks(r);
    const want = (s > 0 ? eurOf(s) : '—') + (mk.s ? ' *' : '') + (mk.g ? ' †' : '');
    assert.ok(trips[k].includes(`<td class="n nw">${want}</td>`), `${r.code || 'χωρίς'}: Σ ${want}`);
  });
  assert.ok(!/RT-\d/.test(doc.html), 'no RT codes on paper («Δρομολόγιο», owner 2/11)');
});

test('print: the statement and the count line are totals(), the screen\'s numbers', () => {
  const P = printModel(), doc = W.printDoc(P, {}), t = P.tAll;
  assert.ok(doc.html.includes(`<tr class="tot"><th>Σύνολο εβδομάδας</th><td class="n">${eurOf(t.sum)}</td>`));
  assert.ok(doc.html.includes(`<td class="n">${eurOf(t.invSum)}</td><td class="n">${eurOf(t.openSum)}</td></tr></tbody>`));
  assert.ok(doc.html.includes(`Παραγγελίες: ${t.invN} τιμολογημένες + ${t.readyN} προς κοπή + ${t.blockedN} χωρίς τιμή = ${t.n}`));
  assert.strictEqual(t.invN + t.readyN + t.blockedN, t.n, 'the count line adds up');
  // the grey next-week import is shown, never summed (recI2 2.000)
  assert.ok(/owvp-o off[^]*?2\.000,00/.test(doc.html));
});

test('print: a failed read prints nothing and says what failed (Δ3)', () => {
  const doc = W.printDoc(printModel({ fails: [{ head: 'Δεν διαβάστηκαν τα δρομολόγια (RT).' }] }), {});
  assert.strictEqual(doc.ok, false);
  assert.strictEqual(doc.html, '');
  assert.deepStrictEqual(doc.refused, ['Δεν διαβάστηκαν τα δρομολόγια (RT).']);
});

test('print: invoice words — number · date, self-delivery, «χωρίς δελτίο»; ☐ only where she must act', () => {
  const sd = o('recSD', 1300, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T08:00', Price: 900, Invoiced: true, 'Self Delivery': true });
  const ns = o('recNS', 1301, { Direction: 'Export', 'Delivery DateTime': '2026-09-22T09:00', Price: 700, Status: 'Delivered' });
  const st = r => r.id === 'recNS' ? { key: 'ready', noSheets: true } : stateOf(r);
  const m = W.buildWeek({ week: WEEK, intl: [...INTL, sd, ns], natl: [], rts: RTS });
  const tAll = W.totals(m.weekIntl, st);
  assert.strictEqual(tAll.readyNoSheets, 1);
  const doc = W.printDoc({ week: WEEK, m, natRows: [], tI: tAll, tN: W.totals([], st), tAll, star: [], dag: tAll.unpricedRecs, stateOf: st,
    fails: [], numsOk: false, showI: true, showN: false, stopDates: null }, {});
  const line = id => doc.html.split('<tr class="owvp-o').find(x => x.includes(id)) || '';
  assert.ok(line('#1300').includes('αυτοπαράδοση') && !line('#1300').includes('☐'));
  assert.ok(line('#1301').includes('προς κοπή · χωρίς δελτίο') && line('#1301').includes('☐'));
  assert.ok(line('#1214').includes('0431') && !line('#1214').includes('☐'), 'invoiced: its number, no box');
  assert.ok(doc.html.includes('(η 1 χωρίς δελτίο παλετών)'));
  assert.ok(doc.html.includes('Η αρίθμηση του Weekly δεν διαβάστηκε'), 'numbers failed: said, never guessed');
});

// Owner 8/11/2026: the national rows carry the Weekly National v5's number of their truck, «—» with the reason
// otherwise, and the trucks on the board are the driver sheets the ΑΝΑΘΕΣΗ opens.
test('numberNationals: the v5 board number by carrier code; waiting / old / carried / elsewhere = «—» with why', () => {
  const v5 = (carriers) => ({ assign: { kind: 'v5', state: { carriers } }, day: '2026-10-26' });
  const rows = [
    v5([{ kind: 'owned', code: 'RT-2', side: 'KATHODOS' }]),
    v5([{ kind: 'owned', code: 'RT-1', side: 'ANODOS' }, { kind: 'partner', code: 'RT-3', side: 'KATHODOS' }]),   // split at Veroia
    v5([{ kind: 'none', code: 'RT-9', side: 'ANODOS' }]),                     // waiting for a vehicle
    v5([{ kind: 'owned', code: 'RT-4', side: 'KATHODOS' }]),                  // carried from last week
    v5([{ kind: 'owned', code: 'RT-77', side: 'KATHODOS' }]),                 // not on this week's board
    { assign: { kind: 'load', load: {} }, day: '2026-10-26' },               // the old model
  ];
  const cy = (rt_id, code) => ({ rt_id, code });
  const nb = { nums: new Map([[11, 1], [12, 2], [13, 3]]), byCode: new Map([['RT-1', cy(11, 'RT-1')], ['RT-2', cy(12, 'RT-2')], ['RT-3', cy(13, 'RT-3')], ['RT-4', cy(14, 'RT-4')]]), carried: new Set([14]) };
  W.numberNationals(rows, nb);
  assert.deepStrictEqual(rows.map((r) => r.nos), [[2], [1, 3], [], [], [], []]);
  assert.deepStrictEqual(rows[1].sheets, [{ rtId: 11, side: 'ANODOS', code: 'RT-1' }, { rtId: 13, side: 'KATHODOS', code: 'RT-3' }]);
  assert.match(rows[2].noWhy, /περιμένει όχημα/);
  assert.match(rows[3].noWhy, /γραμμή άλλης εβδομάδας/);
  assert.strictEqual(rows[3].sheets.length, 1, 'a carried truck still has its sheet');
  assert.match(rows[4].noWhy, /δεν είναι γραμμή/);
  assert.strictEqual(rows[4].sheets.length, 0);
  assert.match(rows[5].noWhy, /παλιού μοντέλου/);
  // the board not read: every v5 row says so, never a number; an old row keeps its own reason
  const f = W.numberNationals([v5([{ kind: 'owned', code: 'RT-2', side: 'KATHODOS' }]), { assign: { kind: 'out' } }], 'failed');
  assert.deepStrictEqual(f.map((r) => r.nos), ['failed', []]);
  // inside a day: numbered first by number, the rest keep their order; days stay apart
  const ord = W.natNumberOrder([
    { day: '2026-10-26', nos: [] , id: 'a' }, { day: '2026-10-26', nos: [3], id: 'b' }, { day: '2026-10-26', nos: [1], id: 'c' },
    { day: '2026-10-25', nos: [9], id: 'd' }, { day: '2026-10-26', nos: 'failed', id: 'e' }]);
  assert.deepStrictEqual(ord.map((r) => r.id), ['d', 'c', 'b', 'a', 'e']);
});

// Owner 8/11/2026: a continuation shows its own week's number, «12 · W44».
test('numberNationals: a continuation takes its own week\'s number «12 · W44»; that board unread = «—» saying so', () => {
  const v5 = (code) => ({ assign: { kind: 'v5', state: { carriers: [{ kind: 'owned', code, side: 'ANODOS' }] } }, day: '2026-10-31' });
  const nb = { nums: new Map([[11, 1]]), byCode: new Map([['RT-1', { rt_id: 11 }], ['RT-4', { rt_id: 14 }], ['RT-5', { rt_id: 15 }]]),
    carried: new Set([14, 15]), away: new Map([[14, { n: 12, w: 44 }], [15, { failed: true, w: 44 }]]) };
  const rows = W.numberNationals([v5('RT-4'), v5('RT-5'), v5('RT-1')], nb);
  assert.deepStrictEqual(rows.map(W.natNoText), ['12 · W44', null, '1']);
  assert.match(rows[0].noWhy, /γραμμή άλλης εβδομάδας/);
  assert.strictEqual(rows[0].sheets.length, 1, 'its sheet still opens (the truck is on this week\'s board as a continuation)');
  assert.match(rows[1].noWhy, /γραμμή της W44 και το Εβδομαδιαίο εκείνης δεν διαβάστηκε/);
  // order inside the day: this week's numbers first, continuations after
  assert.deepStrictEqual(W.natNumberOrder(rows).map(W.natNoText), ['1', '12 · W44', null]);
});
