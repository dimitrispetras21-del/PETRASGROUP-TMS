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

test('a rota leg whose parent is not on this board is named (it hangs under nothing)', () => {
  const leg = { id: 'recLeg', fields: { Type: 'International', Direction: 'Export', 'Rotation ID': 'recGone', 'Loading DateTime': '2026-11-04T08:00:00', 'Delivery DateTime': '2026-11-05T08:00:00' } };
  const { built, nb } = build([leg], []);
  assert.deepStrictEqual(WI4.unseenOrders(built, nb.no), ['recLeg']);
});
