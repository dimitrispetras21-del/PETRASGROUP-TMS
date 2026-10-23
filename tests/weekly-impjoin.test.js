// node --test tests/weekly-impjoin.test.js
// «Join a 2nd/3rd import into a truck's import load» (Παντελής 8/10/2026) —
// the pure parts of the Weekly International's join, extracted verbatim from
// modules/weekly_intl.js (technique of weekly-stock-round1.test.js), plus the
// order-docs index stall guard (core/order-docs.js) on mocked timers.
//   PAL   the sum as arithmetic: «461+463 = 24 π. + 471 = 10 π. = 34 > 33»
//   P33   33 is a warning, never a block (owner 9/10/2026): one constant, one
//         question with the numbers (cancel = false, «Να μπει» = 'over'),
//         the red running sum, the toast tail, no capacity filter anywhere
//   ASG   the joining side carries NO assignment — not even the load's own
//         truck (P1, coordinator 9/10: an assigned import already has its own
//         round trip; joined, it left two live RTs — the 7/10 GI-MUV7FNKE
//         class); _wiImpGroup: at most one side assigned, that side the load
//   INH   one inheritance builder for match and join (truck / partner / none)
//   DND   the dragged import travels in the drag data; none = ignored (S9)
//   CHK   the board-side refusals and their words (Cancelled, rota leg,
//         lot, piece, matched elsewhere, split, assignment) — and a fitting
//         import passes, and so does one past 33 (asked, not refused)
//   DOCS  a stalled index read is dropped after 25 s and the next call asks
//         again; a failed transport is not cached as «no documents»
// WI_SRC=<path> runs the weekly cases against another copy of weekly_intl.js
// (on main 86667965 they fail: the helpers do not exist).
const { test, mock } = require('node:test');
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
const plain = o => JSON.parse(JSON.stringify(o));   // vm objects carry another realm's prototypes

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core/data-helpers.js'), 'utf8'));
const { OrdersStock, OrdersCommon } = require(path.join(ROOT, 'core/orders-common.js'));

function load(parts, extra) {
  const ctx = Object.assign({ console, OrdersStock, OrdersCommon, getLinkedId,
    WINTL: { rows: [], data: { exports: [], imports: [], trucks: [], partners: [], stock: null } } }, (extra && extra.ctx) || {});
  vm.createContext(ctx);
  const names = parts.map(p => p.name).filter(Boolean);
  vm.runInContext(parts.map(p => p.src).join('\n') + '\nObject.assign(this,{' + names.join(',') + '});', ctx);
  return ctx;
}
const F = (name, kind) => ({ name, src: (kind || many)(name) });
const rec = (id, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: 'Import', Status: 'Pending' }, f) });
const impRow = (id, ids, extra) => Object.assign({ id, type: 'import', orderId: ids[0], orderIds: ids, matchedTo: null, truckId: '', partnerId: '' }, extra || {});

const PAL33 = () => [{ src: line(/const WI_PAL_CAP=\d+;\n/, 'WI_PAL_CAP') }, F('_wiPalOver', one), F('_wiRecsPals', one)];

test('PAL: the sum the dispatcher reads — load, joiner, total against 33', () => {
  const c = load([...PAL33(), F('_wiJoinPalText')]);
  const L = [rec('recI461', { Reference: '461', 'Total Pallets': 12 }), rec('recI463', { Reference: '463', 'Total Pallets': 12 })];
  assert.strictEqual(c._wiJoinPalText(L, [rec('recI471', { Reference: '471', 'Total Pallets': 10 })]), '461+463 = 24 π. + 471 = 10 π. = 34 > 33');
  assert.strictEqual(c._wiJoinPalText(L, [rec('recI470', { Reference: '470', 'Total Pallets': 8 })]), '461+463 = 24 π. + 470 = 8 π. = 32 ≤ 33');
  assert.strictEqual(c._wiJoinPalText([rec('recA', { 'Total Pallets': 33 })], [rec('recB', {})]), 'recA = 33 π. + recB = 0 π. = 33 ≤ 33', 'no Reference → the id; no pallets → 0');
});

test('ASG: what an order is assigned to, in words — any of truck, partner, trailer, driver', () => {
  const c = load([F('_wiAssignLbl'), F('_wiAssignedText')]);
  const D = c.WINTL.data;
  D.trucks = [{ id: 'recT27', label: 'TRK-27' }]; D.partners = [{ id: 'recP1', label: 'Partner One' }];
  D.trailers = [{ id: 'recR5', label: 'TRL-5' }]; D.drivers = [{ id: 'recD9', label: 'Driver 9' }];
  assert.strictEqual(c._wiAssignLbl({}), '', 'nothing assigned');
  assert.strictEqual(c._wiAssignLbl({ Truck: ['recT27'], Driver: ['recD9'] }), 'φορτηγό TRK-27');
  assert.strictEqual(c._wiAssignLbl({ Partner: ['recP1'] }), 'συνεργάτης Partner One');
  assert.strictEqual(c._wiAssignLbl({ Trailer: ['recR5'] }), 'ρυμούλκα TRL-5', 'a trailer alone counts');
  assert.strictEqual(c._wiAssignLbl({ Driver: ['recD9'] }), 'οδηγός Driver 9', 'a driver alone counts');
  assert.strictEqual(c._wiAssignLbl({ Truck: ['recTX'] }), 'φορτηγό', 'an unknown (inactive) truck still counts');
  assert.strictEqual(c._wiAssignLbl({ Truck: [], Partner: [] }), '', 'empty links = nothing');
  assert.strictEqual(c._wiAssignedText(rec('recI473', { Reference: '473', Truck: ['recT27'] })),
    'Η #473 έχει ήδη ανάθεση (φορτηγό TRK-27) — πρώτα «Καθαρισμός ανάθεσης» στην #473, μετά πρόσθεσέ τη στο φορτίο');
});

test('ASG: _wiImpGroup — at most one side assigned, and that side is the load; both = the menu\'s row is the load', async () => {
  const joins = [];
  const c = load([F('_wiImpGroup', asyncMany), F('_wiAssignLbl'), F('_wiRecOf', one)], { ctx: {
    _wiPieceIn: () => [], _wiRefuse() {}, _wiLoadRecs: r => r.orderIds.map(id => c.WINTL.data.imports.find(x => x.id === id)),
    _wiImpJoin: async (l, e, x) => { joins.push([l, e, x]); return true; } } });
  c.WINTL.data.imports = [rec('recA', { Truck: ['recT27'] }), rec('recB', {}), rec('recC', { Driver: ['recD9'] }), rec('recG1', { 'Group ID': 'GI-G' }), rec('recG2', { 'Group ID': 'GI-G' })];
  c.WINTL.rows = [impRow(1, ['recA']), impRow(2, ['recB']), impRow(3, ['recC']), impRow(4, ['recG1', 'recG2'])];
  await c._wiImpGroup(1, 2); await c._wiImpGroup(2, 1); await c._wiImpGroup(1, 3); await c._wiImpGroup(2, 4);
  assert.deepStrictEqual(plain(joins), [
    ['recA', null, 'recB'],    // the assigned side is the load
    ['recA', null, 'recB'],    // whichever row the menu was opened on
    ['recA', null, 'recC'],    // both assigned: the menu's row is the load, the other is refused by _wiJoinCheck
    ['recG1', null, 'recB'],   // neither assigned: the existing group is the load
  ]);
});

test('INH: one inheritance — own truck, partner, or nothing (the match and the join use it)', () => {
  const c = load([F('_wiInhOf')]);
  assert.deepStrictEqual(plain(c._wiInhOf({ truckId: 'recT27', trailerId: '', driverId: 'recD27' })),
    { Truck: ['recT27'], Trailer: [], Driver: ['recD27'], 'Is Partner Trip': false, Status: 'Assigned', Partner: [], 'Partner Truck Plates': '' });
  assert.deepStrictEqual(plain(c._wiInhOf({ partnerId: 'recP1', partnerPlates: 'AB-1' })),
    { Partner: ['recP1'], 'Is Partner Trip': true, 'Partner Truck Plates': 'AB-1', Status: 'Assigned', Truck: [], Trailer: [], Driver: [] });
  assert.deepStrictEqual(plain(c._wiInhOf({ truckId: '', partnerId: '' })), {}, 'no vehicle: nothing to inherit, no Status');
  // The match path really uses it (no second copy of the field list).
  const match = asyncMany('_wiSaveImportMatch'), join = asyncMany('_wiImpJoin');
  assert.match(match, /const inh=_wiInhOf\(row\);/);
  assert.match(join, /const inh=_wiInhOf\(vehRow\)/);
  assert.doesNotMatch(match, /'Is Partner Trip':false/, 'no second copy of the field list in the match');
});

test('DND: the import id comes from the drag data only — a drop without it is ignored (S9)', () => {
  const c = load([{ src: line(/const WI_DND_IMP='[^']+';\n/, 'WI_DND_IMP') }, F('_wiDragImpId', one)]);
  const ev = data => ({ dataTransfer: { getData: t => data[t] || '' } });
  assert.strictEqual(c._wiDragImpId(ev({ 'application/x-wi-import': 'recI470' })), 'recI470');
  assert.strictEqual(c._wiDragImpId(ev({ 'text/plain': 'recI470' })), '', 'a tile/file/text drag carries no import id');
  assert.strictEqual(c._wiDragImpId({}), '');
  assert.strictEqual(c._wiDragImpId({ dataTransfer: { getData() { throw new Error('protected'); } } }), '');
  // and the drop handlers read it, never window._wiDragging
  const drop = asyncMany('_wiDropImport');
  assert.match(drop, /const impId=_wiDragImpId\(e\);/);
  assert.doesNotMatch(drop, /const impId=window\._wiDragging/);
});

function chkCtx() {
  const parts = [
    { src: line(/const WI_EXECUTING=\[[^\]]*\];\n/, 'WI_EXECUTING') },
    ...PAL33(),
    F('_wiIsPiece', one), F('_wiIsLot', one), F('_wiRecOf', one), F('_wiLotHeld'), F('_wiImpGroupRowOf'), F('_wiPieceIn'),
    F('_wiGrpOrder'), F('_wiLoadRecs'), F('_wiJoinPalText'), F('_wiAssignLbl'), F('_wiAssignedText'), F('_wiVehOfF', one), F('_wiVehLbl'),
    F('_wiJoinLoadLbl'), F('_wiJoinWho'), F('_wiJoinCheck'),
  ];
  const c = load(parts);
  const D = c.WINTL.data;
  D.trucks = [{ id: 'recT27', label: 'TRK-27' }, { id: 'recT31', label: 'TRK-31' }];
  D.drivers = [{ id: 'recD9', label: 'Driver 9' }]; D.partners = [{ id: 'recP1', label: 'Partner One' }];
  D.exports = [rec('recE27', { Direction: 'Export', Reference: 'E27', Truck: ['recT27'], 'Matched Import ID': 'recI461' }),
    rec('recE30', { Direction: 'Export', Reference: 'E30', Truck: ['recT31'], 'Matched Import ID': 'recI480' })];
  const G = 'GI-MUX|recI461,recI463';
  D.imports = [
    rec('recI461', { Reference: '461', 'Total Pallets': 12, 'Group ID': G, Truck: ['recT27'], 'Loading DateTime': '2026-10-08T08:00:00' }),
    rec('recI463', { Reference: '463', 'Total Pallets': 12, 'Group ID': G, Truck: ['recT27'], 'Loading DateTime': '2026-10-09T08:00:00' }),
    rec('recI470', { Reference: '470', 'Total Pallets': 8 }),
    rec('recI471', { Reference: '471', 'Total Pallets': 10, Status: 'In Transit' }),
    rec('recI472', { Reference: '472', 'Total Pallets': 4, Truck: ['recT31'] }),
    rec('recI480', { Reference: '480', 'Total Pallets': 3, Truck: ['recT31'] }),
    rec('recPC', { Reference: 'PC', 'Total Pallets': 2, 'Stock Lot': ['recLOT'] }),
    rec('recLT', { Reference: 'LT', 'Total Pallets': 2, 'Own Stock Lot': 'recLOT' }),
    rec('recI473', { Reference: '473', 'Total Pallets': 3, Truck: ['recT27'] }),          // the load's OWN truck
    rec('recI474', { Reference: '474', 'Total Pallets': 3, Driver: ['recD9'] }),          // a driver alone
    rec('recI475', { Reference: '475', 'Total Pallets': 3, Partner: ['recP1'] }),
    rec('recI476', { Reference: '476', 'Total Pallets': 3, Status: 'Cancelled' }),
    rec('recI477', { Reference: '477', 'Total Pallets': 3, 'Rotation ID': 'recE27' }),
    rec('recI478', { Reference: '478', 'Total Pallets': 3, Status: 'Cancelled', 'Group ID': 'GI-CX|recI478,recI479' }),
    rec('recI479', { Reference: '479', 'Total Pallets': 3, 'Group ID': 'GI-CX|recI478,recI479' }),
  ];
  c.WINTL.rows = [
    { id: 1, type: 'export', orderId: 'recE27', orderIds: ['recE27'], importId: 'recI461', truckId: 'recT27', partnerId: '', truckLabel: 'TRK-27' },
    impRow(2, ['recI461', 'recI463'], { matchedTo: 'recE27', truckId: 'recT27' }),
    impRow(3, ['recI470']), impRow(4, ['recI471']), impRow(5, ['recI472'], { truckId: 'recT31' }),
    impRow(6, ['recI480'], { matchedTo: 'recE30', truckId: 'recT31' }),
    { id: 7, type: 'export', orderId: 'recE30', orderIds: ['recE30'], importId: 'recI480', truckId: 'recT31', partnerId: '', truckLabel: 'TRK-31' },
    impRow(8, ['recPC']), impRow(9, ['recLT']), impRow(10, ['recI470'], { splitLegOf: 'recPARENT' }),
    impRow(11, ['recI473'], { truckId: 'recT27' }), impRow(12, ['recI474']), impRow(13, ['recI475'], { partnerId: 'recP1' }),
    impRow(14, ['recI476']), impRow(15, ['recI477'], { legOf: 'recE27' }), impRow(16, ['recI478', 'recI479']),
  ];
  return c;
}

test('CHK: an import that fits joins; every refusal says why, with the numbers', () => {
  const c = chkCtx();
  const R = id => c.WINTL.rows.find(r => r.id === id);
  const E27 = R(1), L = R(2);
  assert.strictEqual(c._wiJoinCheck(L, R(3), E27), '', '470 (8p) into 461+463 (24p) on TRK-27 → fits (32)');
  assert.strictEqual(c._wiJoinCheck(L, R(4), E27), '', '471 (10p) into 24p → 34: past 33 is asked by the action, never refused here (owner 9/10)');
  const ASG = (n, what) => `Η #${n} έχει ήδη ανάθεση (${what}) — πρώτα «Καθαρισμός ανάθεσης» στην #${n}, μετά πρόσθεσέ τη στο φορτίο`;
  assert.strictEqual(c._wiJoinCheck(L, R(5), E27), ASG('472', 'φορτηγό TRK-31'), 'another truck');
  assert.strictEqual(c._wiJoinCheck(L, R(11), E27), ASG('473', 'φορτηγό TRK-27'), 'the load\'s OWN truck too (P1: it already has its own RT)');
  assert.strictEqual(c._wiJoinCheck(L, R(12), E27), ASG('474', 'οδηγός Driver 9'), 'a driver alone');
  assert.strictEqual(c._wiJoinCheck(L, R(13), E27), ASG('475', 'συνεργάτης Partner One'), 'a partner');
  assert.strictEqual(c._wiJoinCheck(L, R(14), E27), 'Η #476 είναι ακυρωμένη — ακυρωμένη παραγγελία δεν μπαίνει σε φορτίο', 'Cancelled is never revived');
  assert.strictEqual(c._wiJoinCheck(R(16), R(3), R(16)), 'Το φορτίο χωρίς όχημα (478+479 · 6 π.) έχει ακυρωμένη παραγγελία (#478) — δεν δέχεται εισαγωγή', 'a Cancelled load member');
  assert.strictEqual(c._wiJoinCheck(L, R(15), E27), 'Η εισαγωγή 477 είναι σκέλος προώθησης (ρότα) — δεν μπαίνει σε groupage', 'a rota leg, on every path');
  assert.strictEqual(c._wiJoinCheck(R(15), R(3), R(15)), 'Το φορτίο χωρίς όχημα (477 · 3 π.) είναι σκέλος προώθησης (ρότα) — δεν δέχεται groupage', 'a rota leg as the load');
  assert.match(c._wiJoinCheck(L, R(6), E27), /^Η εισαγωγή 480 είναι ήδη στο φορτίο της εξαγωγής E30 \(TRK-31\) — πρώτα «Αφαίρεση ταιριάσματος» εκεί$/);
  assert.match(c._wiJoinCheck(L, R(8), E27), /κομμάτι αποθέματος — μπαίνει σε φορτηγό μόνο με «\+ Κομμάτι από απόθεμα…»/);
  assert.match(c._wiJoinCheck(L, R(9), E27), /^Η εισαγωγή LT είναι παρτίδα — πάει στην αποθήκη/);
  assert.match(c._wiJoinCheck(L, R(10), E27), /σκέλος σπασμένης παραγγελίας — δεν μπαίνει σε groupage/);
  // a load with no vehicle and an assigned joiner: the same one rule
  const bare = { id: 99, type: 'export', orderIds: ['recE27'], truckId: '', partnerId: '' };
  assert.strictEqual(c._wiJoinCheck(L, R(5), bare), ASG('472', 'φορτηγό TRK-31'));
  // a lone piece is never made the lead of a new group (B-09)
  assert.match(c._wiJoinCheck(R(8), R(3), R(8)), /κομμάτι αποθέματος μόνο του — δεν γίνεται επικεφαλής ομάδας/);
});

test('P33: one constant, one question with the numbers, the red sum, the toast tail', async () => {
  const asked = [];
  let answer = false;
  const c = load([...PAL33(), F('_wiJoinPalText'), F('_wiPalSumText', one), F('_wiPalNote', one), F('_wiPalCandNote'), F('_wiPalConfirm', asyncMany)],
    { ctx: { escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      confirmAction: async (msg, opts) => { asked.push([msg, plain(opts)]); return answer; } } });
  assert.strictEqual(c._wiPalOver(33), false); assert.strictEqual(c._wiPalOver(34), true); assert.strictEqual(c._wiPalOver(undefined), false);
  assert.strictEqual(c._wiPalSumText(24), '24p / 33p');
  assert.strictEqual(c._wiPalSumText(33), '33p / 33p');
  assert.strictEqual(c._wiPalSumText(35), '35p / 33p · > 33');
  assert.strictEqual(c._wiPalNote(33), '');
  assert.strictEqual(c._wiPalNote(35), ' (35 π. — πάνω από 33)');
  const L = [rec('recI461', { Reference: '461', 'Total Pallets': 12 }), rec('recI463', { Reference: '463', 'Total Pallets': 12 })];
  const X = [rec('recI471', { Reference: '471', 'Total Pallets': 11 })], S = [rec('recI470', { Reference: '470', 'Total Pallets': 8 })];
  assert.strictEqual(c._wiPalCandNote(L, S), '', 'within 33: no note');
  assert.strictEqual(c._wiPalCandNote(L, X), '<br><small class="wi-stk-warn">461+463 = 24 π. + 471 = 11 π. = 35 &gt; 33</small>', 'past 33: the sum, amber');
  // within 33: nothing asked
  assert.strictEqual(await c._wiPalConfirm(L, [S]), true);
  assert.strictEqual(asked.length, 0, 'within 33 nothing is asked');
  // past 33: ONE question with the numbers; cancel → false
  answer = false;
  assert.strictEqual(await c._wiPalConfirm(L, [X]), false, 'cancel = false: the caller writes nothing');
  assert.strictEqual(asked.length, 1);
  assert.strictEqual(asked[0][0], 'Σύνολο 24 + 11 = 35 παλέτες — πάνω από 33. Να μπει;\n\n461+463 = 24 π. + 471 = 11 π. = 35 > 33');
  assert.deepStrictEqual(asked[0][1], { title: 'Πάνω από 33 παλέτες', confirmLabel: 'Να μπει' });
  answer = true;
  assert.strictEqual(await c._wiPalConfirm(L, [X]), 'over', '«Να μπει» = over (passed on as palOk)');
  // several picks: one part each, load first
  asked.length = 0;
  await c._wiPalConfirm(L, [S, [rec('recI472', { Reference: '472', 'Total Pallets': 4 })]]);
  assert.match(asked[0][0], /^Σύνολο 24 \+ 8 \+ 4 = 36 παλέτες — πάνω από 33\. Να μπει;/);
  // the app's modal, never the browser's
  assert.doesNotMatch(asyncMany('_wiPalConfirm'), /window\.confirm|[^A-Za-z_.]confirm\(/);
});

test('P33: no 33 decides anything outside the shared rule — candidates, sums, joins', () => {
  // Every decision about 33 goes through WI_PAL_CAP / _wiPalOver (αρχή 3).
  // Display colours (_wi2PalCls) and comments are not decisions.
  const code = WI.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /<=\s*33\b/, 'no «≤ 33» filter left');
  for (const fn of ['_wiJoinCheck', '_wiImpGroupCands', '_wiExpGroupCands', '_wiPanelGroupSum', '_wiPanelGroupBuild', '_wiPanelJoinLoad', '_wiJoinPalText'])
    assert.doesNotMatch(many(fn).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'), /\b33\b/, fn + ' has no 33 of its own');
  for (const fn of ['_wiImpJoin', '_wiPanelGroupGo', '_wiPanelJoinGo'])
    assert.doesNotMatch(asyncMany(fn).split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'), /\b33\b/, fn + ' has no 33 of its own');
  assert.doesNotMatch(many('_wiPanelGroupSum'), /disabled/, 'the running sum never disables a box');
  assert.doesNotMatch(code, /όριο 33 παλέτες/, 'no «όριο 33» refusal text left');
  // the stock panel keeps its warning, on the same constant
  assert.match(many('_wiStockPanel'), /free=X==null\?null:WI_PAL_CAP-X;/);
  // the one question is asked by every write path that can pass 33
  assert.match(asyncMany('_wiImpJoin'), /pal=palOk\?'over':await _wiPalConfirm\(lr0,\[xr0\]\)/);
  assert.match(asyncMany('_wiPanelGroupGo'), /_wiPalConfirm\(_wiLoadRecs\(me\),rows\.map\(_wiLoadRecs\)\)/);
  assert.match(asyncMany('_wiPanelGroupGo'), /const pal=await _wiPalConfirm\(adds\[0\],adds\.slice\(1\)\)/);
  assert.match(asyncMany('_wiPanelJoinGo'), /_wiPalConfirm\(/);
});

test('P33: export «Ομαδοποίηση» candidates — no capacity filter, lots still out', () => {
  const c = load([F('_wiIsPiece', one), F('_wiIsLot', one), F('_wiRecOf', one), F('_wiLotHeld'), F('_wiExpGroupCands')]);
  c.WINTL.data.exports = [rec('recE1', { Direction: 'Export', 'Total Pallets': 33 }), rec('recE2', { Direction: 'Export', 'Total Pallets': 33 }),
    rec('recE3', { Direction: 'Export', 'Total Pallets': 2 }), rec('recE4', { Direction: 'Export', 'Total Pallets': 5 })];
  c.WINTL.rows = [{ id: 1, type: 'export', orderIds: ['recE1'], saved: false }, { id: 2, type: 'export', orderIds: ['recE2'], saved: false },
    { id: 3, type: 'export', orderIds: ['recE3'], saved: true }, { id: 4, type: 'export', orderIds: ['recE4'], saved: false }];
  assert.deepStrictEqual(plain(c._wiExpGroupCands(c.WINTL.rows[0]).map(r => r.id)), [2, 4], '33 + 33 offered; an assigned one is not');
});

test('DOCS: a stalled index read is dropped after 25 s; the next call asks again; a failed transport is not cached', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let calls = 0, mode = 'hang';
    const ctx = { console: { warn() {}, log() {} }, window: {}, AT_BASE: 'app', TABLES: { ORDER_DOCS: 'tblOrderDocuments' },
      _apiUrl: p => 'https://w' + p, PROXY_URL: 'https://w', Promise, Set, Date, setTimeout, clearTimeout,
      fetch: () => { calls++; if (mode === 'hang') return new Promise(() => {}); if (mode === 'fail') return Promise.reject(new Error('Failed to fetch'));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ records: [{ fields: { Order: ['recA'] } }] }) }); } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/order-docs.js'), 'utf8'), ctx);
    const OD = ctx.window.OrderDocs;
    const p1 = OD.preloadIndex();
    const p2 = OD.preloadIndex();
    assert.strictEqual(calls, 1, 'one read in flight is shared');
    mock.timers.tick(25000);
    const s1 = await p1; await p2;
    assert.strictEqual(s1.size, 0, 'the stalled read resolves the waiters with what is known (nothing)');
    mode = 'fail';
    await OD.preloadIndex();
    assert.strictEqual(calls, 2, 'after the stall the next call asks again');
    mode = 'ok';
    const s3 = await OD.preloadIndex();
    assert.strictEqual(calls, 3, 'a failed transport is not cached for 2 minutes');
    assert.strictEqual(s3.has('recA'), true);
    await OD.preloadIndex();
    assert.strictEqual(calls, 3, 'an answer is cached (2 min TTL) as before');
  } finally { mock.timers.reset(); }
});
