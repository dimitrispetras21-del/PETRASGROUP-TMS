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
