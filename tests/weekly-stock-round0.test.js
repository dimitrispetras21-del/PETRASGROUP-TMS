// node --test tests/weekly-stock-round0.test.js
// Stock lots Φ1, round 0 of the impact map (4/10): the Weekly International's
// data predicates that decide where a PIECE may go, run on the REAL
// OrdersStock (core/orders-common.js) and the real getLinkedId. The functions
// are extracted verbatim from modules/weekly_intl.js (same technique as
// tests/unmatch-leg-first.test.js); nothing is sent anywhere.
//   B-05  auto-match never scores an import load that holds a piece
//   B-19  a loose piece is not a board row while the shelf is its home
//   B-28  no «Σπάσιμο σκέλους» on a piece or a lot
// WI_SRC=<path> runs the same cases against another copy of weekly_intl.js
// (the «before» proof: on 1b1cfab4 the helpers do not exist and the split
// item is offered on a piece).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WI = fs.readFileSync(process.env.WI_SRC || path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const grab = (re, name) => { const m = WI.match(re); if (!m) throw new Error(name + ' not found in weekly_intl.js'); return m[0]; };
const one = name => grab(new RegExp('function ' + name + '\\([^)]*\\)\\{[^\\n]*\\}\\n'), name);
const many = name => grab(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name);

// The real getLinkedId, loaded as the browser loads it (OrdersStock calls it).
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core/data-helpers.js'), 'utf8'));
global.TmsWeek = require(path.join(ROOT, 'core/tms-week.js'));
const { OrdersStock } = require(path.join(ROOT, 'core/orders-common.js'));

function load() {
  const ctx = { console, OrdersStock, getLinkedId, FEATURES: { ORDER_SPLIT: true }, WINTL: { rows: [], data: { exports: [], imports: [], stock: null } } };
  vm.createContext(ctx);
  const src = [
    grab(/const WI_EXECUTING=\[[^\]]*\];\n/, 'WI_EXECUTING'),
    one('_wiIsPiece'), one('_wiIsLot'), one('_wiRecOf'),
    many('_wiStockSkip'), many('_wiImpGroupRowOf'), many('_wiPieceIn'), many('_wiMatchableImp'), many('_wiShelved'),
    many('_wiSplitCtxItems'),
  ].join('\n');
  vm.runInContext(src + '\nObject.assign(this,{_wiPieceIn,_wiMatchableImp,_wiShelved,_wiSplitCtxItems});', ctx);
  return ctx;
}

const LOT = 'recSTOCKLOT0001';
const rec = (id, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: 'Import', Status: 'Pending' }, f) });
const piece = (id, f) => rec(id, Object.assign({ 'Stock Lot': [LOT] }, f));
const impRow = (id, ids, extra) => Object.assign({ id, type: 'import', orderId: ids[0], orderIds: ids, matchedTo: null, truckId: '', partnerId: '' }, extra || {});

function world() {
  const c = load();
  c.WINTL.data.imports = [
    rec('recI1'),                                                     // plain import
    rec('recI7', { 'Group ID': 'GI-X|recI7' }), piece('recP6', { 'Group ID': 'GI-X|recI7' }),   // truckless group holding a piece
    piece('recP3'),                                                   // loose piece
    piece('recP4', { Truck: ['recT1'], Status: 'Assigned' }),         // piece on a truck
    piece('recP9', { Status: 'Delivered' }),                          // delivered piece
    rec('recLOT', { 'Own Stock Lot': LOT }),                          // a lot
  ];
  c.WINTL.rows = [
    impRow(1, ['recI1']), impRow(2, ['recI7', 'recP6']), impRow(3, ['recP3']),
    impRow(4, ['recP4'], { truckId: 'recT1' }), impRow(5, ['recP9']), impRow(6, ['recLOT']),
  ];
  return c;
}

test('B-05: auto-match scores a plain import, never a load that holds a piece (lone or group), a loose piece or a lot', () => {
  const c = world();
  const ok = id => c._wiMatchableImp(c.WINTL.rows.find(r => r.id === id));
  assert.strictEqual(ok(1), true, 'plain import');
  assert.strictEqual(ok(2), false, 'truckless GI group holding a piece');
  assert.strictEqual(ok(3), false, 'loose piece');
  assert.strictEqual(ok(4), false, 'piece on a truck, unmatched');
  assert.strictEqual(ok(6), false, 'lot');
  c.WINTL.rows[0].matchedTo = 'recE1';
  assert.strictEqual(ok(1), false, 'already matched');
});

test('B-05: the pieces of a load are found from ANY member the caller names', () => {
  const c = world();
  assert.deepStrictEqual([...c._wiPieceIn(['recI7'])], ['recP6'], 'named the lead, the piece is a sibling');
  assert.deepStrictEqual([...c._wiPieceIn(['recP6'])], ['recP6']);
  assert.deepStrictEqual([...c._wiPieceIn(['recI1', null, undefined])], []);
});

test('B-19: a loose piece leaves the board only while the shelf exists; a piece on a truck, matched, grouped or delivered stays', () => {
  const c = world();
  const sh = id => c._wiShelved(c.WINTL.rows.find(r => r.id === id));
  assert.strictEqual(sh(3), false, 'no shelf (switch off / warehouse role) = no home: the row stays');
  c.WINTL.data.stock = { status: 'ok', lots: [], loose: [] };
  assert.strictEqual(sh(3), true, 'loose piece with the shelf on');
  assert.strictEqual(sh(4), false, 'piece on a truck');
  assert.strictEqual(sh(2), false, 'group holding a piece');
  assert.strictEqual(sh(5), false, 'delivered piece');
  assert.strictEqual(sh(1), false, 'plain import');
  c.WINTL.rows[2].matchedTo = 'recE3';
  assert.strictEqual(sh(3), false, 'an export still points at it (Case B without vehicle)');
  c.WINTL.data.stock = { status: 'failed' };
  c.WINTL.rows[2].matchedTo = null;
  assert.strictEqual(sh(3), true, 'a failed shelf read is a red strip, not «no shelf»');
});

test('B-28: «Σπάσιμο σκέλους» is offered on a plain order, never on a piece or a lot', () => {
  const c = world();
  const btn = (label) => '[' + label + ']';
  const items = id => c._wiSplitCtxItems(c.WINTL.rows.find(r => r.id === id), id, btn);
  assert.match(items(1), /Σπάσιμο σκέλους/);
  assert.strictEqual(items(3), '', 'loose piece');
  assert.strictEqual(items(4), '', 'piece on a truck');
  assert.strictEqual(items(6), '', 'lot');
});
