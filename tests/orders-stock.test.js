// tests/orders-stock.test.js — run: TZ=Europe/Athens node --test tests/orders-stock.test.js
// Stock lots (migration 057, contract §5.2–5.3): the ONE front API OrdersStock
// (core/orders-common.js) that the Orders page and the Weekly International
// share, and the invoicing set's handling of lots and pieces. Real code: the
// real OrdersCommon/OrdersData/OrdersStock and the real getLinkedId
// (core/data-helpers.js, loaded as the browser loads it). The network calls
// (atGet/atGetAll/atCreate/atGetOne/atPatch/atDelete/plFetch) are in-memory
// stubs that record what was asked.
process.env.TZ = 'Europe/Athens';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersData, OrdersStock } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;
global.OrdersData = OrdersData;
global.OrdersStock = OrdersStock;

const TABLES_ = { ORDERS: 'tblO', NAT_ORDERS: 'tblN', STOCK_LOTS: 'tblStockLots', LOCATIONS: 'tblL' };
const TODAY = OrdersCommon.today();
const daysAgo = n => OrdersCommon.addDays(TODAY, -n);

// ── a little in-memory facade ────────────────────────────────────────────────
let calls, db;
function reset() {
  calls = [];
  db = { orders: [], natl: [], lots: [], failLots: false, created: null, patched: null, createError: null, readBack: null };
  global.TABLES = TABLES_;
  global.FEATURES = { ORDER_SPLIT: true, STOCK_LOTS: true };
  global.ROLE = 'dispatcher';
  global.atGet = async (table, formula) => {
    calls.push(['atGet', table, formula]);
    return (table === TABLES_.ORDERS ? db.orders : db.natl).map(r => ({ id: r.id, fields: Object.assign({}, r.fields) }));
  };
  global.atGetAll = async (table, opts) => {
    calls.push(['atGetAll', table, (opts || {}).filterByFormula || '']);
    if (table === TABLES_.STOCK_LOTS) {
      if (db.failLots) throw new Error('Worker 500');
      return db.lots.map(r => ({ id: r.id, fields: Object.assign({}, r.fields) }));
    }
    return db.orders.map(r => ({ id: r.id, fields: Object.assign({}, r.fields) }));
  };
  global.atCreate = async (table, fields) => {
    calls.push(['atCreate', table, fields]);
    if (db.createError) throw new Error(db.createError);
    db.created = { id: 'recLotNew01', fields: Object.assign({}, fields) };
    return db.created;
  };
  global.atGetOne = async (table, id) => {
    calls.push(['atGetOne', table, id]);
    return db.readBack || db.created;
  };
  global.atPatch = async (table, id, fields) => {
    calls.push(['atPatch', table, id, fields]);
    if (db.createError) throw new Error(db.createError);
    return { id, fields };
  };
  global.atDelete = async (table, id) => { calls.push(['atDelete', table, id]); if (db.createError) throw new Error(db.createError); return { id, deleted: true }; };
  global.plFetch = async () => ({ records: [] });
}
beforeEach(reset);
reset();

// A STOCK LOTS record as the facade serves it (stock_v_lots). NULL columns are
// ABSENT (facade trap #2) — e.g. «Closed At» and «Received On» before intake.
const lotRec = (id, f) => ({ id, fields: Object.assign({
  'Lot No': 312, 'Source Kind': 'intl', Order: ['recSrc'], 'Client Rec': 'recCliA', 'Client Name': 'Πελάτης Α',
  'Warehouse Rec': 'recWhX', 'Warehouse Name': 'Αποθήκη Χ', 'Warehouse Country': 'HU',
  'Intake Delivered': true, 'Received On': daysAgo(3), 'Stock Pallets': 33, 'Drawn Pallets': 20, 'Remaining Pallets': 13,
  'Delivered Pallets': 5, 'Written Off Pallets': 0, Pieces: 2, 'Pieces Delivered': 1, 'Pieces Without Truck': 0,
  Complete: false, Invoiced: false,
}, f) });

// ── predicates and labels ────────────────────────────────────────────────────
test('isPiece / isLot read the facade fields — and do not depend on the switch', () => {
  const piece = { 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl' };
  const lot = { 'Own Stock Lot': 'recLot1' };
  global.FEATURES = { STOCK_LOTS: false };
  assert.strictEqual(OrdersStock.on(), false);
  assert.strictEqual(OrdersStock.isPiece(piece), true, 'a piece is a piece with the switch off');
  assert.strictEqual(OrdersStock.isLot(lot), true);
  assert.strictEqual(OrdersStock.isPiece({}), false);
  assert.strictEqual(OrdersStock.isPiece({ 'Stock Lot': [] }), false, 'an empty link is no piece');
  assert.strictEqual(OrdersStock.isPiece(null), false);
  assert.strictEqual(OrdersStock.isLot({ 'Own Stock Lot': '' }), false);
  assert.strictEqual(OrdersStock.lotRecOfPiece(piece), 'recLot1');
  assert.strictEqual(OrdersStock.lotRecOfLot(lot), 'recLot1');
  assert.strictEqual(OrdersStock.lotRecOfLot({}), null);
});

test('isLoose: a piece with no truck, partner or group and not delivered — stock, not late work', () => {
  const p = f => Object.assign({ 'Stock Lot': ['recLot1'], Status: 'Pending' }, f);
  assert.strictEqual(OrdersStock.isLoose(p({})), true);
  assert.strictEqual(OrdersStock.isLoose(p({ 'Group ID': null })), true, 'a cleared Group ID (NULL → absent) is no group');
  assert.strictEqual(OrdersStock.isLoose(p({ Truck: ['recT'] })), false);
  assert.strictEqual(OrdersStock.isLoose(p({ Partner: ['recP'] })), false);
  assert.strictEqual(OrdersStock.isLoose(p({ 'Group ID': 'GI-X|recL' })), false, 'in a group');
  assert.strictEqual(OrdersStock.isLoose(p({ Status: 'Delivered' })), false);
  assert.strictEqual(OrdersStock.isLoose({ Status: 'Pending' }), false, 'an ordinary order is never loose');
});

test('on(): born closed — needs FEATURES.STOCK_LOTS === true AND TABLES.STOCK_LOTS', () => {
  global.FEATURES = { STOCK_LOTS: true };
  assert.strictEqual(OrdersStock.on(), true);
  global.FEATURES = { STOCK_LOTS: 'true' };
  assert.strictEqual(OrdersStock.on(), false);
  global.FEATURES = { STOCK_LOTS: true }; global.TABLES = { ORDERS: 'x' };
  assert.strictEqual(OrdersStock.on(), false);
  delete global.FEATURES;
  assert.strictEqual(OrdersStock.on(), false);
});

test('labels: «#312» / «Ε-27» like OrdersCommon.numLabel, «—» when absent', () => {
  assert.strictEqual(OrdersStock.lotNumLabel({ 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl' }), '#312');
  assert.strictEqual(OrdersStock.lotNumLabel({ 'Stock Lot Order No': 27, 'Stock Lot Source': 'natl' }), 'Ε-27');
  assert.strictEqual(OrdersStock.lotNumLabel({}), '—');
  assert.strictEqual(OrdersStock.lotLabel(lotRec('recL', {})), '#312');
  assert.strictEqual(OrdersStock.lotLabel(lotRec('recL', { 'Lot No': 27, 'Source Kind': 'natl' })), 'Ε-27');
  assert.strictEqual(OrdersStock.lotLabel({ id: 'x', fields: {} }), '—');
});

test('roles: write = owner/dispatcher; close (Ε3) = owner/dispatcher/accountant', () => {
  const w = r => { global.ROLE = r; return [OrdersStock.canWrite(), OrdersStock.canClose()]; };
  assert.deepStrictEqual(w('owner'), [true, true]);
  assert.deepStrictEqual(w('dispatcher'), [true, true]);
  assert.deepStrictEqual(w('accountant'), [false, true]);
  assert.deepStrictEqual(w('management'), [false, false]);
  assert.deepStrictEqual(w('warehouse'), [false, false]);
});

// ── chip ─────────────────────────────────────────────────────────────────────
test('chip: ok · aging (22 days) · close · nointake — absent counts are 0, never NaN', () => {
  assert.deepStrictEqual(OrdersStock.chip(lotRec('a', {}), TODAY), { key: 'ok', days: 3, remaining: 13, stock: 33 });
  assert.strictEqual(OrdersStock.chip(lotRec('a', { 'Received On': daysAgo(22) }), TODAY).key, 'aging');
  assert.strictEqual(OrdersStock.chip(lotRec('a', { 'Received On': daysAgo(21) }), TODAY).key, 'ok', '21 days is not yet aging');
  // all drawn pieces delivered, pallets left, not closed → «κλείσιμο;»
  const close = lotRec('a', { Pieces: 3, 'Pieces Delivered': 3, 'Remaining Pallets': 2 });
  assert.strictEqual(OrdersStock.chip(close, TODAY).key, 'close');
  assert.strictEqual(OrdersStock.chip(lotRec('a', { Pieces: 3, 'Pieces Delivered': 3, 'Remaining Pallets': 2, 'Closed At': TODAY + 'T10:00:00Z' }), TODAY).key, 'ok', 'closed → no longer asks');
  assert.strictEqual(OrdersStock.chip(lotRec('a', { Pieces: 3, 'Pieces Delivered': 3, 'Remaining Pallets': 0 }), TODAY).key, 'ok', 'nothing left → nothing to close');
  // close outranks aging
  assert.strictEqual(OrdersStock.chip(lotRec('a', { Pieces: 1, 'Pieces Delivered': 1, 'Remaining Pallets': 2, 'Received On': daysAgo(40) }), TODAY).key, 'close');
  // pieces on a truck while the intake is not marked → red
  const noIntake = lotRec('a', { 'Intake Delivered': false, 'Received On': undefined, Pieces: 2, 'Pieces Without Truck': 1 });
  delete noIntake.fields['Received On'];
  assert.deepStrictEqual(OrdersStock.chip(noIntake, TODAY), { key: 'nointake', days: null, remaining: 13, stock: 33 });
  const waiting = lotRec('a', { 'Intake Delivered': false, Pieces: 1, 'Pieces Without Truck': 1 });
  assert.strictEqual(OrdersStock.chip(waiting, TODAY).key, 'ok', 'a piece without a truck before intake is not an alarm');
  // a freshly received lot with no piece drawn is NOT «κλείσιμο;» (it may age)
  const fresh = lotRec('a', { Pieces: 0, 'Pieces Delivered': 0, 'Remaining Pallets': 33, 'Drawn Pallets': 0 });
  assert.strictEqual(OrdersStock.chip(fresh, TODAY).key, 'ok');
  assert.strictEqual(OrdersStock.chip(Object.assign({}, fresh, { fields: Object.assign({}, fresh.fields, { 'Received On': daysAgo(30) }) }), TODAY).key, 'aging');
  // facade trap #2: absent numbers / flags
  const bare = { id: 'b', fields: {} };
  assert.deepStrictEqual(OrdersStock.chip(bare, TODAY), { key: 'ok', days: null, remaining: 0, stock: 0 });
});

// review P2 (4/10): the button follows closable(), not the chip — a received
// lot with NO piece drawn must be closable, or its one invoice never comes.
test('closable: zero pieces drawn is closable (base close_early agrees); the chip still does not nudge', () => {
  const zero = lotRec('a', { Pieces: 0, 'Pieces Delivered': 0, 'Remaining Pallets': 33, 'Drawn Pallets': 0, 'Received On': daysAgo(40) });
  assert.strictEqual(OrdersStock.closable(zero), true);
  assert.notStrictEqual(OrdersStock.chip(zero, TODAY).key, 'close', 'no «κλείσιμο;» nudge on a fresh/aging lot');
  // absent counts (facade trap #2) read as 0 — still closable
  const absent = lotRec('a', { 'Remaining Pallets': 33 });
  delete absent.fields.Pieces; delete absent.fields['Pieces Delivered'];
  assert.strictEqual(OrdersStock.closable(absent), true);
  assert.strictEqual(OrdersStock.closable(lotRec('a', { Pieces: 3, 'Pieces Delivered': 3, 'Remaining Pallets': 2 })), true);
  assert.strictEqual(OrdersStock.closable(lotRec('a', { Pieces: 3, 'Pieces Delivered': 2, 'Remaining Pallets': 2 })), false, 'a piece still moving');
  assert.strictEqual(OrdersStock.closable(lotRec('a', { Pieces: 0, 'Pieces Delivered': 0, 'Intake Delivered': false })), false, 'intake not in');
  assert.strictEqual(OrdersStock.closable(lotRec('a', { Pieces: 1, 'Pieces Delivered': 1, 'Remaining Pallets': 0 })), false, 'nothing left');
  assert.strictEqual(OrdersStock.closable(lotRec('a', { Pieces: 0, 'Pieces Delivered': 0, 'Closed At': TODAY + 'T10:00:00Z' })), false, 'already closed');
  assert.strictEqual(OrdersStock.closable({ id: 'b', fields: {} }), false);
  assert.strictEqual(OrdersStock.closable(null), false);
});

test('statusWord: one Greek word per piece status for every screen', () => {
  assert.strictEqual(OrdersStock.statusWord('In Transit'), 'σε μεταφορά');
  assert.strictEqual(OrdersStock.statusWord('Delivered'), 'παραδόθηκε');
  assert.strictEqual(OrdersStock.statusWord('Assigned'), 'ανατέθηκε');
  assert.strictEqual(OrdersStock.statusWord('Pending'), 'σε αναμονή');
  assert.strictEqual(OrdersStock.statusWord('Weird'), 'Weird', 'unknown shown as it is');
  assert.strictEqual(OrdersStock.statusWord(undefined), '—');
});

// ── pieceFields ──────────────────────────────────────────────────────────────
test('pieceFields: the lot locks on top of the form, never Price, PE false, exact Group ID, Status rule', () => {
  const lot = lotRec('recLot1', {});
  const values = { Price: 999, Reference: 'TEST-STOCK-1', 'Loading Pallets 1': 5, 'Unloading Location 1': ['recDest'], 'Delivery DateTime': '2026-10-08',
    'Loading DateTime': '2026-10-05', Direction: 'Export', Client: ['recOther'], 'Pallet Exchange': true, 'Loading Location 1': ['recElse'] };
  const p = OrdersStock.pieceFields(lot, {}, values);
  assert.ok(!('Price' in p), 'no Price key at all');
  assert.deepStrictEqual(p['Stock Lot'], ['recLot1']);
  assert.deepStrictEqual(p['Client'], ['recCliA']);
  assert.strictEqual(p['Direction'], 'Import');
  assert.strictEqual(p['Type'], 'International');
  assert.deepStrictEqual(p['Loading Location 1'], ['recWhX']);
  for (let i = 2; i <= 10; i++) assert.deepStrictEqual(p['Loading Location ' + i], []);
  assert.strictEqual(p['Pallet Exchange'], false);
  assert.strictEqual(p['Status'], 'Pending', 'no vehicle handed → Pending');
  assert.ok(!('Group ID' in p) && !('Truck' in p), 'nothing invented when no preset');
  assert.strictEqual(p['Reference'], 'TEST-STOCK-1');
  assert.strictEqual(p['Loading Pallets 1'], 5);
  assert.deepStrictEqual(p['Unloading Location 1'], ['recDest']);
  assert.strictEqual(p['Loading DateTime'], '2026-10-05');
  assert.strictEqual(values.Price, 999, 'the caller object is not mutated');

  const joined = OrdersStock.pieceFields(lot, { groupId: 'GI-k3x9|recLead', truck: 'recT1', trailer: ['recTr1'], driver: 'recD1',
    status: 'Assigned', loadingDate: '2026-10-06', deliveryDate: '2026-10-09', lockLoadingDate: true }, values);
  assert.strictEqual(joined['Group ID'], 'GI-k3x9|recLead', 'the exact string of the lead');
  assert.deepStrictEqual([joined.Truck, joined.Trailer, joined.Driver], [['recT1'], ['recTr1'], ['recD1']]);
  assert.strictEqual(joined.Status, 'Assigned');
  assert.strictEqual(joined['Loading DateTime'], '2026-10-06', 'locked loading day wins over the form');
  assert.strictEqual(joined['Delivery DateTime'], '2026-10-08', 'the form delivery day stays');
  assert.strictEqual(OrdersStock.pieceFields(lot, { status: 'In Transit' }, {}).Status, 'Pending', 'only «Assigned» is passed through');
  const noForm = OrdersStock.pieceFields(lot, { loadingDate: '2026-10-06', deliveryDate: '2026-10-09' }, {});
  assert.deepStrictEqual([noForm['Loading DateTime'], noForm['Delivery DateTime']], ['2026-10-06', '2026-10-09']);
});

// ── reads: never throw, never an empty list on failure ───────────────────────
test('loadLots / loadOpen: the facade formula, and a failure is {ok:false, failed:true}', async () => {
  db.lots = [lotRec('recL1', {})];
  const r = await OrdersStock.loadOpen();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lots.length, 1);
  assert.deepStrictEqual(calls.at(-1), ['atGetAll', 'tblStockLots', '{Complete}=0']);
  db.failLots = true;
  const f = await OrdersStock.loadLots('{Invoiced}=0');
  assert.strictEqual(f.ok, false); assert.strictEqual(f.failed, true); assert.ok(!('lots' in f), 'no lots key — never an empty list');
  assert.match(f.error, /Worker 500/);
});

test('loadPieces / loadLoosePieces: exact ORDERS formulas; a bad rec never reaches a formula', async () => {
  db.orders = [{ id: 'recP1', fields: { 'Stock Lot': ['recLot1'] } }];
  const r = await OrdersStock.loadPieces('recLot1');
  assert.strictEqual(r.ok, true); assert.strictEqual(r.pieces[0]._type, 'intl');
  assert.deepStrictEqual(calls.at(-1), ['atGetAll', 'tblO', 'FIND("recLot1",ARRAYJOIN({Stock Lot},","))>0']);
  await OrdersStock.loadLoosePieces();
  assert.deepStrictEqual(calls.at(-1), ['atGetAll', 'tblO', "AND({Stock Lot}!=BLANK(),{Truck}=BLANK(),{Partner}=BLANK(),{Status}!='Delivered')"]);
  const n = calls.length;
  const bad = await OrdersStock.loadPieces('rec1") , 1)');
  assert.strictEqual(bad.ok, false); assert.strictEqual(calls.length, n, 'no request with an injected rec');
});

// ── writes: the read-back decides ────────────────────────────────────────────
test('markLot: POST {Order:[rec]} then read-back; ok only if the lot points at the order', async () => {
  const ok = await OrdersStock.markLot('recSrc');
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(calls[0], ['atCreate', 'tblStockLots', { Order: ['recSrc'] }]);
  assert.deepStrictEqual(calls[1], ['atGetOne', 'tblStockLots', 'recLotNew01']);
  reset(); db.readBack = { id: 'recLotNew01', fields: {} };
  const lost = await OrdersStock.markLot('recSrc');
  assert.strictEqual(lost.ok, false); assert.match(lost.error, /χωρίς τη σύνδεση/);
  reset(); db.createError = 'Ο προορισμός της παρτίδας πρέπει να είναι αποθήκη (τοποθεσία «Partner Warehouse» ή «Veroia Hub»)';
  const refused = await OrdersStock.markLot('recSrc');
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.error, db.createError, 'the Greek refusal of the base reaches the caller verbatim');
  assert.ok(!calls.some(c => c[0] === 'atGetOne'), 'no read-back after a refusal');
});

test('closeLot: reason required; ok only when the read-back has the note AND «Closed At»', async () => {
  const empty = await OrdersStock.closeLot('recLot1', '   ');
  assert.strictEqual(empty.ok, false); assert.strictEqual(calls.length, 0, 'nothing sent without a reason');
  db.readBack = { id: 'recLot1', fields: { 'Closed Note': '2 χαλασμένες', 'Closed At': '2026-10-04T13:00:00Z' } };
  const ok = await OrdersStock.closeLot('recLot1', '  2 χαλασμένες ');
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(calls[0], ['atPatch', 'tblStockLots', 'recLot1', { 'Closed Note': '2 χαλασμένες' }]);
  reset(); db.readBack = { id: 'recLot1', fields: { 'Closed Note': '2 χαλασμένες' } };
  assert.strictEqual((await OrdersStock.closeLot('recLot1', '2 χαλασμένες')).ok, false, 'no «Closed At» → not closed');
  reset(); db.createError = 'Κλείσιμο υπολοίπου μόνο όταν η παραλαβή και όλα τα κομμάτια έχουν παραδοθεί';
  const early = await OrdersStock.closeLot('recLot1', 'x');
  assert.strictEqual(early.error, db.createError);
});

test('unmarkLot: facade DELETE; a refusal comes back as {ok:false, error}', async () => {
  assert.deepStrictEqual(await OrdersStock.unmarkLot('recLot1'), { ok: true });
  assert.deepStrictEqual(calls[0], ['atDelete', 'tblStockLots', 'recLot1']);
  db.createError = 'Η παρτίδα έχει κομμάτια — δεν καταργείται';
  assert.deepStrictEqual(await OrdersStock.unmarkLot('recLot1'), { ok: false, error: 'Η παρτίδα έχει κομμάτια — δεν καταργείται' });
});

// ── the invoicing set (§5.3) ─────────────────────────────────────────────────
const D = n => OrdersCommon.addDays(TODAY, -n) + 'T10:00:00';
const order = (id, f) => ({ id, fields: Object.assign({ Status: 'Delivered', Direction: 'Export', Client: ['recCliA'], 'Delivery DateTime': D(5) }, f) });

test('loadInvoicingSet: pieces (and split legs) never enter; lots get their STOCK LOTS record', async () => {
  db.orders = [
    order('recPlain', { Price: 1000 }),
    order('recLotSrc', { Price: 3300, 'Own Stock Lot': 'recLot1', Direction: 'Import', 'Total Pallets': 33 }),
    order('recPiece', { 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 312, Direction: 'Import' }),
    order('recLeg', { 'Parent Order': ['recPlain'] }),
  ];
  db.lots = [lotRec('recLot1', {})];
  const set = await OrdersData.loadInvoicingSet(true);
  assert.deepStrictEqual(set.intl.map(r => r.id), ['recPlain', 'recLotSrc']);
  assert.ok(calls.some(c => c[0] === 'atGetAll' && c[1] === 'tblStockLots' && c[2] === '{Invoiced}=0'), 'lots read with {Invoiced}=0');
  assert.strictEqual(set.stockFailed, false);
  assert.ok(set.stock.get('recLot1'));
  const st = OrdersData.stateOf(set, set.intl[1]);
  assert.deepStrictEqual([st.key, st.reason, st.lot && st.lot.id], ['blocked', 'stock', 'recLot1']);
  assert.strictEqual(OrdersData.stateOf(set, set.intl[0]).key, 'ready');
});

test('loadInvoicingSet: no lot in the set → no STOCK LOTS request; a failed lot read blocks every lot', async () => {
  db.orders = [order('recPlain', { Price: 1000 })];
  await OrdersData.loadInvoicingSet(true);
  assert.ok(!calls.some(c => c[1] === 'tblStockLots'), 'no lot → no read');
  reset();
  db.orders = [order('recLotSrc', { Price: 3300, 'Own Stock Lot': 'recLot1' })];
  db.lots = [lotRec('recLot1', { Complete: true })];
  db.failLots = true;
  const set = await OrdersData.loadInvoicingSet(true);
  assert.deepStrictEqual([set.stock, set.stockFailed], [null, true]);
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[0]), { key: 'blocked', reason: 'stock', lot: null }, 'never «ready» on a guess');
});

test('stateOf with stock: complete → ready; price first; not delivered → pending; invoiced → invoiced', () => {
  const lot = r => ({ id: r, _type: 'intl', fields: { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recLot1', 'Delivery DateTime': D(5) } });
  const set = l => ({ intl: [], natl: [], gate: {}, gateFailed: false, stock: new Map([['recLot1', l]]), stockFailed: false });
  assert.deepStrictEqual(OrdersData.stateOf(set(lotRec('recLot1', { Complete: true })), lot('a')), { key: 'ready' });
  const incomplete = OrdersData.stateOf(set(lotRec('recLot1', {})), lot('a'));
  assert.deepStrictEqual([incomplete.key, incomplete.reason], ['blocked', 'stock']);
  const noPrice = lot('a'); delete noPrice.fields.Price;
  assert.deepStrictEqual(OrdersData.stateOf(set(lotRec('recLot1', {})), noPrice), { key: 'blocked', reason: 'price' }, 'a lot without a price is «Χωρίς τιμή» first');
  const transit = lot('a'); transit.fields.Status = 'In Transit';
  assert.strictEqual(OrdersData.stateOf(set(lotRec('recLot1', {})), transit).key, 'pending');
  const inv = lot('a'); inv.fields.Invoiced = true;
  assert.strictEqual(OrdersData.stateOf({ intl: [], natl: [], gate: {} }, inv).key, 'invoiced', 'an invoiced lot needs no lot record');
  // a set built without stock (old callers) still blocks a lot, never readies it
  const bare = OrdersData.stateOf({ intl: [], natl: [], gate: {}, gateFailed: false }, lot('a'));
  assert.deepStrictEqual([bare.key, bare.reason, bare.lot], ['blocked', 'stock', null]);
  // the pallet-slip gate still applies after the lot is complete (Ε5: PE at the lot's loading)
  const pe = lot('a'); pe.fields['Pallet Exchange'] = true;
  const s2 = set(lotRec('recLot1', { Complete: true })); s2.gate = { a: { sheets_ok: false } };
  assert.deepStrictEqual(OrdersData.stateOf(s2, pe), { key: 'blocked', reason: 'sheets' });
});

test('withoutPieces is the one filter; data-based (switch off changes nothing)', () => {
  global.FEATURES = { STOCK_LOTS: false };
  const recs = [{ id: 'a', fields: {} }, { id: 'b', fields: { 'Stock Lot': ['recLot1'] } }, { id: 'c', fields: { 'Own Stock Lot': 'recLot1' } }];
  assert.deepStrictEqual(OrdersData.withoutPieces(recs).map(r => r.id), ['a', 'c']);
});

// ── round 0 (impact map 4/10) ────────────────────────────────────────────────
test('G-07: the warehouse role never reads STOCK LOTS (no grant → no 403 storm); its lots stay blocked', async () => {
  global.ROLE = 'warehouse';
  db.orders = [order('recLotSrc', { Price: 3300, 'Own Stock Lot': 'recLot1' })];
  db.lots = [lotRec('recLot1', { Complete: true })];
  const set = await OrdersData.loadInvoicingSet(true);
  assert.ok(!calls.some(c => c[1] === 'tblStockLots'), 'no STOCK LOTS request for the warehouse role');
  assert.strictEqual(set.stockFailed, false);
  assert.deepStrictEqual(OrdersData.stateOf(set, set.intl[0]), { key: 'blocked', reason: 'stock', lot: null }, 'never «ready» without its lot');
});

test('PR-15: invoiced lots of the set are read by id with the open ones — one formula, 40 ids per request', async () => {
  db.orders = [
    order('recOpen', { Price: 3300, 'Own Stock Lot': 'recLot1' }),
    order('recInv', { Price: 2000, 'Own Stock Lot': 'recLot2', Invoiced: true, 'Invoice Number': '0500' }),
  ];
  db.lots = [lotRec('recLot1', {}), lotRec('recLot2', { Invoiced: true, Complete: true })];
  const set = await OrdersData.loadInvoicingSet(true);
  const reads = calls.filter(c => c[1] === 'tblStockLots').map(c => c[2]);
  assert.deepStrictEqual(reads, ["OR({Invoiced}=0,RECORD_ID()='recLot2')"]);
  assert.ok(set.stock.get('recLot2'), 'the invoiced lot record is there for the ERP sheet');
  reset();
  db.orders = Array.from({ length: 41 }, (_, i) => order('recI' + i, { Price: 1, 'Own Stock Lot': 'recLotI' + i, Invoiced: true }));
  await OrdersData.loadInvoicingSet(true);
  const r2 = calls.filter(c => c[1] === 'tblStockLots').map(c => c[2]);
  assert.strictEqual(r2.length, 2);
  assert.ok(r2[0].startsWith('OR({Invoiced}=0,') && r2[1] === "OR(RECORD_ID()='recLotI40')");
});

test('E-05: ageOf — a lot from «Completed On» (null while incomplete), every other order from its delivery', () => {
  const lot = { id: 'a', _type: 'intl', fields: { Status: 'Delivered', 'Own Stock Lot': 'recLot1', 'Delivery DateTime': D(40) } };
  const set = l => ({ stock: new Map([['recLot1', l]]) });
  assert.strictEqual(OrdersData.ageOf(set(lotRec('recLot1', {})), lot), null);
  assert.strictEqual(OrdersData.ageOf(set(lotRec('recLot1', { Complete: true, 'Completed On': daysAgo(3) })), lot), 3);
  assert.strictEqual(OrdersData.ageOf({ stock: null }, lot), null, 'lot not read → no age, never the intake age');
  assert.strictEqual(OrdersData.ageOf({}, order('p', { 'Delivery DateTime': D(5) })), 5);
});

test('DL-10: closeLot writes with the undo suppressed (the global Undo must not reopen a closed lot)', async () => {
  let flag = false, seen = null;
  global.atSuppressUndo = fn => async (...a) => { flag = true; try { return await fn(...a); } finally { flag = false; } };
  const patch0 = global.atPatch;
  global.atPatch = async (...a) => { seen = flag; return patch0(...a); };
  db.readBack = { id: 'recLot1', fields: { 'Closed Note': 'x', 'Closed At': '2026-10-04T13:00:00Z' } };
  try {
    assert.strictEqual((await OrdersStock.closeLot('recLot1', 'x')).ok, true);
    assert.strictEqual(seen, true, 'atPatch ran inside atSuppressUndo');
  } finally { delete global.atSuppressUndo; }
});

test('PR-05: print.html names the lot exactly like OrdersStock.lotNumLabel (the page loads no core JS)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'print.html'), 'utf8');
  const src = (html.match(/function stockLotLabel\(f\)\{[\s\S]*?\n\}/) || [])[0];
  assert.ok(src, 'stockLotLabel found in print.html');
  const stockLotLabel = vm.runInNewContext('(' + src + ')');
  const intl = { 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300, 'Stock Lot Source': 'intl' };
  const natl = { 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 27, 'Stock Lot Source': 'natl' };
  assert.strictEqual(stockLotLabel(intl), OrdersStock.lotNumLabel(intl));
  assert.strictEqual(stockLotLabel(natl), OrdersStock.lotNumLabel(natl));
  assert.strictEqual(stockLotLabel({ 'Order No': 5 }), '', 'an ordinary order prints no lot line');
});
