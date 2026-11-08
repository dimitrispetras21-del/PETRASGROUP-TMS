// tests/wi4-unseen.test.js — run: node --test tests/wi4-unseen.test.js
// Owner 8/11/2026, order 643: an import matched by a NON-lead export of a groupage
// was drawn nowhere on Weekly International. (1) the group's lead takes the match
// of any member (WI4.boardRows); (2) WI4.unseenOrders names every loaded order the
// board draws nowhere, so the board can say it.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const WI4 = require('../core/wi4-logic.js');

const dayOf = (v) => {
  if (!v) return '';
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};
const WS = '2026-10-31', WE = '2026-11-06';   // TMS week: Saturday 31/10 – Friday 6/11

// The live shape of GRP-Gl7rxx4W (SELECT 8/11): three exports, delivery 6/11, created in the
// order 645, 664, 666; only 666 carries Matched Import ID = import 643.
const exp = (no, extra) => ({ id: 'recExp' + no, fields: Object.assign({ 'Order No': no, 'Order ID': no, Type: 'International', Direction: 'Export',
  'Group ID': 'GRP-Gl7rxx4W', 'Loading DateTime': '2026-11-03T08:00:00', 'Delivery DateTime': '2026-11-06T08:00:00' }, extra || {}) });
const imp643 = { id: 'recaCSYN6K9U2TtAd', fields: { 'Order No': 643, 'Order ID': 643, Type: 'International', Direction: 'Import',
  'Loading DateTime': '2026-11-06T10:00:00', 'Delivery DateTime': '2026-11-09T08:00:00' } };
const grp = () => [exp(645), exp(664), exp(666, { 'Matched Import ID': 'recaCSYN6K9U2TtAd' })];

const build = (exps, imps, shelved) => {
  const built = WI4.boardRows(exps, imps, { ws: WS, we: WE, dayOf });
  const byId = new Map([...exps, ...imps].map((r) => [r.id, r]));
  const fOf = (row) => (byId.get((row.orderIds && row.orderIds[0]) || row.orderId) || {}).fields || {};
  const nb = WI4.boardNumbers(built.rows, { ws: WS, dayOf, fOf, shelved });
  return { built, nb };
};

test('GRP-Gl7rxx4W: the group row carries import 643, matched on its third export only', () => {
  const { built } = build(grp(), [imp643]);
  const er = built.rows.filter((r) => r.type === 'export');
  assert.strictEqual(er.length, 1, 'the three exports collapse into one row');
  assert.deepStrictEqual(er[0].orderIds, ['recExp645', 'recExp664', 'recExp666']);
  assert.strictEqual(er[0].orderId, 'recExp645', 'the lead stays the first');
  assert.strictEqual(er[0].importId, 'recaCSYN6K9U2TtAd', 'the lead takes the member\'s match');
  assert.strictEqual(built.rows.find((r) => r.type === 'import').matchedTo, 'recExp666');
});

test('GRP-Gl7rxx4W: 643 gets the group row\'s number, on Friday 6/11, and nothing is unseen', () => {
  const { built, nb } = build(grp(), [imp643]);
  const fri = nb.days.find((d) => d.date === '2026-11-06');
  assert.strictEqual(fri.exps.length, 1);
  assert.strictEqual(fri.imps.length, 0, 'a matched import is not a row of its own');
  const nums = WI4.numberOf(built, nb.no);
  assert.ok(nums.get('recaCSYN6K9U2TtAd') != null);
  assert.strictEqual(nums.get('recaCSYN6K9U2TtAd'), nums.get('recExp645'));
  assert.strictEqual(nums.get('recExp666'), nums.get('recExp645'));
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), []);
});

test('the shared numbering (weekNumbers: «Εβδομάδα», pallets) numbers 643 with its group', () => {
  const m = WI4.weekNumbers({ recs: [...grp(), imp643], wsDate: new Date(2026, 9, 31), dayOf, split: false });
  assert.ok(m.get('recaCSYN6K9U2TtAd') != null, '643 has a number');
  assert.strictEqual(m.get('recaCSYN6K9U2TtAd'), m.get('recExp645'));
});

test('the lead keeps its OWN match; a second, different import on a member is named, never silent', () => {
  const other = { id: 'recImpOther', fields: { Type: 'International', Direction: 'Import', 'Loading DateTime': '2026-11-05T10:00:00' } };
  const exps = [exp(645, { 'Matched Import ID': 'recImpOther' }), exp(664), exp(666, { 'Matched Import ID': 'recaCSYN6K9U2TtAd' })];
  const { built, nb } = build(exps, [imp643, other]);
  assert.strictEqual(built.rows.find((r) => r.type === 'export').importId, 'recImpOther');
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), ['recaCSYN6K9U2TtAd']);   // 0 of 16 groups on 8/11
});

test('BEFORE the fix (lead without the member\'s match): the check names 643', () => {
  const { built, nb } = build(grp(), [imp643]);
  built.rows.find((r) => r.type === 'export').importId = null;   // the board as it was until 8/11
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), ['recaCSYN6K9U2TtAd']);
});

test('quiet for the places the board already has: free import, shelf, rota leg, «μεταφέρθηκε» day, another week', () => {
  const imp = (id, extra) => ({ id, fields: Object.assign({ Type: 'International', Direction: 'Import' }, extra) });
  const free = imp('recFree', { 'Loading DateTime': '2026-11-02T10:00:00' });
  const shelf = imp('recShelf', { 'Loading DateTime': '2026-11-04T10:00:00' });
  const adj = imp('recAdj', { 'Loading DateTime': '2026-11-10T10:00:00' });
  const moved = imp('recMoved', { 'Plan Week Start': WS, 'Loading DateTime': '2026-11-08T10:00:00' });
  const leg = { id: 'recLeg', fields: { Type: 'International', Direction: 'Export', 'Rotation ID': 'recExp645', 'Loading DateTime': '2026-11-04T08:00:00', 'Delivery DateTime': '2026-11-05T08:00:00' } };
  const shelved = (r) => r.orderId === 'recShelf';
  const { built, nb } = build([...grp(), leg], [imp643, free, shelf, adj, moved], shelved);
  assert.ok(built.rows.find((r) => r.orderId === 'recAdj').adj);
  assert.ok(built.rows.find((r) => r.orderId === 'recMoved').outOfWindow);
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no, { shelved }), []);
  // The shelf is a place only when the board says so: without the predicate it is named.
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), ['recShelf']);
});

// Owner 8/11/2026 («οκ πάμε στην πρόταση»): a rota leg dated in another week than its parent is drawn in
// ITS OWN week (its own day, no number, «↳»); the parent's week names it as «συνέχεια». Live shape:
// #644 ΦΑΓΕ → STEF Italia, delivery Thu 5/11 (week 31/10); its leg #677 Campagnolo → Frutura, Sat 7/11.
const rota = () => ({
  p644: { id: 'recx7q0YLzrCboPqj', fields: { 'Order No': 644, Type: 'International', Direction: 'Export', 'Matched Import ID': 'recImp644',
    'Loading DateTime': '2026-11-03', 'Delivery DateTime': '2026-11-05' } },
  l677: { id: 'recjRBBpcfExyTzFD', fields: { 'Order No': 677, Type: 'International', Direction: 'Export', 'Rotation ID': 'recx7q0YLzrCboPqj',
    'Loading DateTime': '2026-11-07', 'Delivery DateTime': '2026-11-07' } },
});
const boardOf = (ws, we, exps, imps, away) => {
  const built = WI4.boardRows(exps, imps, { ws, we, dayOf, away });
  const byId = new Map([...exps, ...imps].map((r) => [r.id, r]));
  const fOf = (row) => (byId.get((row.orderIds && row.orderIds[0]) || row.orderId) || {}).fields || {};
  return { built, nb: WI4.boardNumbers(built.rows, { ws, dayOf, fOf }) };
};

test('#677 in its own week (7/11): its own leg row on Saturday, no number, the alarm quiet', () => {
  const { p644, l677 } = rota();
  const { built, nb } = boardOf('2026-11-07', '2026-11-13', [l677], [], [p644]);
  const r = built.rows.find((x) => x.orderId === l677.id);
  assert.strictEqual(r.crossLeg, p644.id, 'it names its parent');
  assert.strictEqual(r.legOf, undefined, 'it hangs under nothing');
  assert.deepStrictEqual(built.legs, {});
  const sat = nb.days.find((d) => d.date === '2026-11-07');
  assert.deepStrictEqual(sat.legs, [r]);
  assert.strictEqual(sat.exps.length, 0, 'not a numbered export row');
  assert.strictEqual(nb.no.has(r), false, 'no number: «↳», like every leg');
  assert.strictEqual(WI4.numberOf(built, nb.no).has(l677.id), false);
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), []);
});

test('#644 in its week (31/10): numbered as before, and «συνέχεια» names #677 on Saturday 7/11', () => {
  const { p644, l677 } = rota();
  const { built, nb } = boardOf(WS, WE, [p644], [], [l677]);
  const r = built.rows.find((x) => x.orderId === p644.id);
  assert.deepStrictEqual(r.contLegs, [{ id: l677.id, dt: '2026-11-07' }]);
  assert.strictEqual(nb.no.get(r), 1);
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), []);
  // without the window's other records there is nothing to name: no guess
  assert.strictEqual(boardOf(WS, WE, [p644], [], undefined).built.rows[0].contLegs, undefined);
});

test('a leg in its parent\'s week stays exactly as before: under the parent, no row, no «συνέχεια»', () => {
  const { p644, l677 } = rota();
  l677.fields['Loading DateTime'] = l677.fields['Delivery DateTime'] = '2026-11-06';
  const { built, nb } = boardOf(WS, WE, [p644, l677], [], []);
  const leg = built.rows.find((x) => x.orderId === l677.id);
  assert.strictEqual(leg.legOf, p644.id);
  assert.strictEqual(leg.crossLeg, undefined);
  assert.deepStrictEqual(built.legs[p644.id], [leg]);
  assert.strictEqual(built.rows.find((x) => x.orderId === p644.id).contLegs, undefined);
  assert.ok(nb.days.every((d) => !d.legs.length));
  assert.strictEqual(WI4.numberOf(built, nb.no).get(l677.id), 1, 'it shares its parent\'s number, as today');
});

test('the parent carried as a matched import still holds its leg (no false own-week row)', () => {
  const exp = { id: 'recE', fields: { Type: 'International', Direction: 'Export', 'Matched Import ID': 'recI', 'Delivery DateTime': '2026-11-04' } };
  const imp = { id: 'recI', fields: { Type: 'International', Direction: 'Import', 'Loading DateTime': '2026-11-05' } };
  const leg = { id: 'recL', fields: { Type: 'International', Direction: 'Export', 'Rotation ID': 'recI', 'Delivery DateTime': '2026-11-06' } };
  const { built, nb } = boardOf(WS, WE, [exp, leg], [imp], []);
  assert.strictEqual(built.rows.find((x) => x.orderId === 'recL').legOf, 'recI');
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), []);
});

test('a leg in its own week without a truck is said there (NO_TRUCK), a leg under its parent stays silent', () => {
  const T0 = '2026-11-06';
  const own = WI4.flags({ kind: 'leg', xweek: true, saved: false, partner: false, loadDate: '2026-11-07' }, T0);
  assert.ok(own.reasons.some((r) => r.code === 'NO_TRUCK'));
  const under = WI4.flags({ kind: 'leg', saved: false, partner: false, loadDate: '2026-11-07' }, T0);
  assert.ok(!under.reasons.some((r) => r.code === 'NO_TRUCK'));
  const assigned = WI4.flags({ kind: 'leg', xweek: true, saved: true, partner: false, loadDate: '2026-11-07' }, T0);
  assert.ok(!assigned.reasons.some((r) => r.code === 'NO_TRUCK'));
});
