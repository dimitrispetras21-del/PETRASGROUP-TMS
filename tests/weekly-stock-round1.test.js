// node --test tests/weekly-stock-round1.test.js
// Stock lots Φ1, round 1 (critics 1/3/4/5, 4/10): the Weekly International's
// predicates, run on the REAL OrdersStock (core/orders-common.js) and the real
// getLinkedId. Functions are extracted verbatim from modules/weekly_intl.js
// (same technique as weekly-stock-round0.test.js); nothing is sent anywhere.
//   D1    a piece is «on a truck» only with a Truck or a Partner — a Group ID
//         alone is not (critic-3 Σ-03/Σ-04, critic-5 S5-11); right with the
//         OLD OrdersStock.isLoose (Group ID test) and the NEW one (without)
//   D3    the shelf's red flag only from «Pieces Moving» (critic-1 C1-01)
//   C1-02 a loose piece whose delivery day passed is late
//   Σ-01/Σ-07c  a lead that cannot take a piece; a Case A join without truck
//         is never «all right»
//   Σ-05  a lot is held whatever its truck (W7)
//   K10   a rewritten group suffix never pins a piece
//   W3/W4 lot badge without pallets; the partner refusal's words
// WI_SRC=<path> runs the same cases against another copy of weekly_intl.js
// (the «before» proof on 72d31ce7: the D1/K10/W7/Σ-07c cases fail, the new
// helpers are missing).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WI = fs.readFileSync(process.env.WI_SRC || path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const grab = (re, name) => { const m = WI.match(re); if (!m) throw new Error(name + ' not found in weekly_intl.js'); return m[0]; };
const one = name => grab(new RegExp('function ' + name + '\\([^)]*\\)\\{[^\\n]*\\}\\n'), name);
const many = name => grab(new RegExp('(?:^|\\n)function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name);
const asyncMany = name => grab(new RegExp('async function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name);
const line = (re, name) => grab(re, name);

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core/data-helpers.js'), 'utf8'));
global.TmsWeek = require(path.join(ROOT, 'core/tms-week.js'));
const { OrdersStock, OrdersCommon } = require(path.join(ROOT, 'core/orders-common.js'));

const TODAY = '2026-10-04';
// The D1 isLoose the core builder ships in round 1 (no Group ID test) — the
// Weekly must give the same answers with it and with today's.
const isLooseD1 = f => OrdersStock.isPiece(f) && !getLinkedId(f['Truck']) && !getLinkedId(f['Partner']) && f['Status'] !== 'Delivered';

function load(parts, extra) {
  const OS = Object.create(OrdersStock);
  if (extra && extra.newIsLoose) OS.isLoose = isLooseD1;
  const ctx = Object.assign({ console, OrdersStock: OS, OrdersCommon, getLinkedId, localToday: () => TODAY,
    toLocalDate: v => (v ? new Date(v).toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' }) : ''),
    escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    TABLES: { ORDERS: 'tblORDERS' },
    WINTL: { rows: [], data: { exports: [], imports: [], stock: null } } }, (extra && extra.ctx) || {});
  vm.createContext(ctx);
  const names = parts.map(p => p.name).filter(Boolean);
  vm.runInContext(parts.map(p => p.src).join('\n') + '\nObject.assign(this,{' + names.join(',') + '});', ctx);
  return ctx;
}
const F = (name, kind) => ({ name, src: (kind || many)(name) });
const BASE = () => [
  { src: line(/const WI_EXECUTING=\[[^\]]*\];\n/, 'WI_EXECUTING') },
  F('_wiIsPiece', one), F('_wiIsLot', one), F('_wiRecOf', one),
];

const LOT = 'recSTOCKLOT0001';
const rec = (id, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: 'Import', Status: 'Pending' }, f) });
const piece = (id, f) => rec(id, Object.assign({ 'Stock Lot': [LOT] }, f));
const impRow = (id, ids, extra) => Object.assign({ id, type: 'import', orderId: ids[0], orderIds: ids, matchedTo: null, truckId: '', partnerId: '' }, extra || {});

test('D1: a truckless piece with a stale Group ID is loose — on the shelf, not a board row — with the old AND the new isLoose', () => {
  for (const newIsLoose of [false, true]) {
    const parts = BASE().concat([F('_wiStockSkip'), F('_wiShelved')]);
    try { parts.push(F('_wiLoose')); } catch (_) { /* base: no helper */ }
    const c = load(parts, { newIsLoose });
    c.WINTL.data.stock = { status: 'ok', lots: [], loose: [] };
    c.WINTL.data.imports = [
      piece('recP9', { 'Group ID': 'GI-DEAD|recGONE' }),          // its lead was deleted (Σ-04)
      piece('recP4', { Truck: ['recT1'], Status: 'Assigned', 'Group ID': 'GI-X|recI1' }),
      piece('recPP', { Partner: ['recPA'], Status: 'Assigned' }),
    ];
    c.WINTL.rows = [impRow(1, ['recP9']), impRow(2, ['recP4'], { truckId: 'recT1' }), impRow(3, ['recPP'], { partnerId: 'recPA' })];
    const row = id => c.WINTL.rows.find(r => r.id === id);
    const tag = newIsLoose ? ' (new isLoose)' : ' (old isLoose)';
    assert.strictEqual(c._wiShelved(row(1)), true, 'stale group, no truck → shelved' + tag);
    assert.strictEqual(c._wiStockSkip(row(1)), true, 'stale group, no truck → never waits for a match' + tag);
    assert.strictEqual(c._wiShelved(row(2)), false, 'on a truck' + tag);
    assert.strictEqual(c._wiShelved(row(3)), false, 'with a partner' + tag);
    assert.strictEqual(c._wiStockSkip(row(2)), false, 'a piece on a truck is a load, not stock' + tag);
  }
});

test('D1: a truckless piece left in a group can join a truck; a moving or matched one cannot', () => {
  const c = load(BASE().concat([F('_wiStockLooseFree')]));
  c.WINTL.data.stock = { status: 'ok', lots: [], loose: [
    piece('recP6', { 'Group ID': 'GI-OFF|recI7' }), piece('recP3'), piece('recP5'), piece('recPT', { Status: 'In Transit' }),
  ] };
  c.WINTL.data.exports = [rec('recE3', { Direction: 'Export', 'Matched Import ID': 'recP5' })];
  assert.deepStrictEqual(c._wiStockLooseFree().map(p => p.id), ['recP6', 'recP3']);
});

test('D3/C1-01: red only when pieces MOVE before the intake (Pieces Moving); assigned-only or label absent → no flag', () => {
  const c = load([F('_wiLotState')]);
  const lot = f => ({ id: 'recL', fields: Object.assign({ 'Stock Pallets': 24, 'Remaining Pallets': 18 }, f) });
  assert.strictEqual(c._wiLotState(lot({ 'Intake Delivered': false, Pieces: 1, 'Pieces Moving': 1 }), TODAY).key, 'nointake');
  assert.strictEqual(c._wiLotState(lot({ 'Intake Delivered': false, Pieces: 1, 'Pieces Moving': 1 }), TODAY).moving, 1);
  assert.strictEqual(c._wiLotState(lot({ 'Intake Delivered': false, Pieces: 1, 'Pieces Moving': 0 }), TODAY).key, 'ok', 'assigned before intake is planning');
  assert.strictEqual(c._wiLotState(lot({ 'Intake Delivered': false, Pieces: 2 }), TODAY).key, 'ok', 'label not served yet → never red');
  // After the intake, moving pieces are normal; close/aging still come from OrdersStock.chip.
  assert.strictEqual(c._wiLotState(lot({ 'Intake Delivered': true, 'Received On': '2026-10-01', Pieces: 1, 'Pieces Delivered': 1, 'Pieces Moving': 1 }), TODAY).key, 'close');
  assert.strictEqual(c._wiLotState(lot({ 'Intake Delivered': true, 'Received On': '2026-09-01', Pieces: 0, 'Pieces Moving': 3 }), TODAY).key, 'aging');
});

test('C1-02: a loose piece is late when its delivery day is before today', () => {
  const c = load([F('_wiLooseLate')]);
  assert.strictEqual(c._wiLooseLate(piece('a', { 'Delivery DateTime': '2026-09-29T05:00:00.000Z' }), TODAY), true);
  assert.strictEqual(c._wiLooseLate(piece('b', { 'Delivery DateTime': '2026-10-04T05:00:00.000Z' }), TODAY), false, 'today is not late');
  assert.strictEqual(c._wiLooseLate(piece('c', {}), TODAY), false, 'no date, no claim');
});

test('Σ-01/Σ-07c: the lead takes no piece without a truck, on another truck, or moving', () => {
  const c = load(BASE().concat([F('_wiStockLeadBad')]));
  assert.match(c._wiStockLeadBad(rec('l', {}), 'recT1'), /δεν έχει φορτηγό/);
  assert.match(c._wiStockLeadBad(rec('l', { Truck: ['recT2'] }), 'recT1'), /άλλαξε στο μεταξύ/);
  assert.match(c._wiStockLeadBad(rec('l', { Truck: ['recT1'], Status: 'In Transit' }), 'recT1'), /σε κίνηση/);
  assert.strictEqual(c._wiStockLeadBad(rec('l', { Truck: ['recT1'], Status: 'Assigned' }), 'recT1'), '');
});

test('Σ-07c: a Case A join without a truck is never «all right»', () => {
  const c = load([F('_wiStockVerify')]);
  const ctx = { kind: 'A', lotRec: LOT, groupId: 'GI-1|recI1', truck: '' };
  assert.notStrictEqual(c._wiStockVerify(piece('p', { 'Group ID': 'GI-1|recI1' }), ctx), '');
  assert.strictEqual(c._wiStockVerify(piece('p', { 'Group ID': 'GI-1|recI1', Truck: ['recT1'] }), Object.assign({}, ctx, { truck: 'recT1' })), '');
});

test('Σ-05 (W7): a lot is held whatever carries it — our truck too; a group row is not', () => {
  const c = load(BASE().concat([F('_wiLotHeld')]));
  c.WINTL.data.exports = [rec('recLOT', { Direction: 'Export', 'Own Stock Lot': LOT, Truck: ['recT5'] }), rec('recE', { Direction: 'Export' })];
  assert.strictEqual(c._wiLotHeld({ orderIds: ['recLOT'], truckId: 'recT5' }), true, 'own-truck lot');
  assert.strictEqual(c._wiLotHeld({ orderIds: ['recLOT'], truckId: '' }), true);
  assert.strictEqual(c._wiLotHeld({ orderIds: ['recE'], truckId: '' }), false, 'plain order');
  assert.strictEqual(c._wiLotHeld({ orderIds: ['recLOT', 'recE'] }), false, 'a group row');
});

test('K10: a rewritten group suffix pins the plain members only — a piece keeps no position', async () => {
  const writes = [];
  const c = load(BASE().concat([F('_wiRewriteGroupSuffix', asyncMany)]), { ctx: {
    atSafePatch: async (t, id, fields) => { writes.push([id, fields['Group ID']]); return { id, fields: { 'Group ID': fields['Group ID'] } }; },
  } });
  const recs = [rec('recI3', { 'Group ID': 'GI-G|recI2,recI3,recPN' }), piece('recPN', { 'Group ID': 'GI-G|recI2,recI3,recPN' })];
  assert.strictEqual(await c._wiRewriteGroupSuffix(recs, true), true);
  assert.deepStrictEqual(writes, [['recI3', 'GI-G|recI3'], ['recPN', 'GI-G|recI3']], 'same string on every member, no piece in it');
  writes.length = 0;
  await c._wiRewriteGroupSuffix([piece('recPA', { 'Group ID': 'GI-H|recPA' }), piece('recPB', { 'Group ID': 'GI-H|recPA' })], true);
  assert.deepStrictEqual(writes.map(w => w[1]), ['GI-H|recPA', 'GI-H|recPA'], 'only pieces left: the lead keeps the suffix, never empty');
});

test('W3/W4: lot badge without pallets; the partner refusal names no project phase', () => {
  const c = load(BASE().concat([F('_wiLotBadge')]), { ctx: { _wi2Split: s => ({ title: s }), _wiFlatLocName: () => 'Αποθήκη Χ' } });
  const html = c._wiLotBadge({ 'Own Stock Lot': LOT, 'Total Pallets': 33, 'Unloading Location 1': ['recWH'] });
  assert.match(html, />→ ΑΠΟΘΗΚΗ<\/span>$/);
  assert.doesNotMatch(html, /33p/);
  const own = line(/const WI_PIECE_OWN_ONLY='[^']*';/, 'WI_PIECE_OWN_ONLY');
  assert.strictEqual(own, "const WI_PIECE_OWN_ONLY='Κομμάτι αποθέματος μόνο σε δικό μας φορτηγό';");
});
