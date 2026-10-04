// tests/orders-invoicing-view.test.js — run: TZ=Europe/Athens node --test tests/orders-invoicing-view.test.js
// Pure logic of modules/orders_invoicing_view.js («Προς τιμολόγηση»), on
// synthetic records. Dates are relative to the Saturday of THIS week, so the
// expectations hold whatever day the suite runs.
process.env.TZ = 'Europe/Athens';

const { test } = require('node:test');
const assert = require('node:assert');
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersData } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;
global.OrdersData = OrdersData;
const V = require('../modules/orders_invoicing_view.js');

const TODAY = OrdersCommon.today();
const CUR = TmsWeek.startOfDate(TODAY);          // this week's Saturday
const PREV = OrdersCommon.addDays(CUR, -7);
const PREV2 = OrdersCommon.addDays(CUR, -14);
const d = (base, n) => OrdersCommon.addDays(base, n) + 'T10:00:00';

const CLIENTS = { recA: 'Alpina Fresh S.r.l.', recB: 'Baltic Cold Foods Sp. z o.o.', recG: 'Γαλακτοκομική Ηπείρου Α.Ε.' };
const intl = (id, f) => ({ id, _type: 'intl', fields: Object.assign({ Status: 'Delivered', Direction: 'Export' }, f) });
const natl = (id, f) => ({ id, _type: 'natl', fields: Object.assign({ Direction: 'North→South' }, f) });

function fixture() {
  return {
    intl: [
      // export → week by DELIVERY
      intl('i1', { 'Order No': 1229, Reference: '6100118259', Client: ['recA'], Price: 3350, 'Loading DateTime': d(PREV2, 5), 'Delivery DateTime': d(PREV, 1) }),
      intl('i2', { 'Order No': 1233, Reference: '6100118264', Client: ['recA'], Price: 3350, 'Loading DateTime': d(PREV, 1), 'Delivery DateTime': d(PREV, 3) }),
      // import → week by LOADING (delivery falls in the current week)
      intl('i3', { 'Order No': 1228, Reference: 'PL-2211', Direction: 'Import', Client: ['recB'], Price: 2650, 'Loading DateTime': d(PREV, 4), 'Delivery DateTime': d(PREV, 6) }),
      // blocked: no price
      intl('i4', { 'Order No': 1240, Reference: 'NP-1', Client: ['recB'], 'Loading DateTime': d(PREV, 0), 'Delivery DateTime': d(PREV, 2) }),
      // blocked: pallet sheets (gate says no)
      intl('i5', { 'Order No': 1241, Reference: 'PE-1', Client: ['recA'], Price: 1000, 'Pallet Exchange': true, 'Loading DateTime': d(PREV, 0), 'Delivery DateTime': d(PREV, 2) }),
      // invoiced in PREV2
      intl('i6', { 'Order No': 1214, Reference: '6100118227', Client: ['recA'], Price: 3200, Invoiced: true, 'Invoice Number': '0431', 'Invoice Date': PREV, 'Loading DateTime': d(PREV2, 0), 'Delivery DateTime': d(PREV2, 2) }),
      // cancelled + not delivered: never in the view
      intl('i7', { 'Order No': 1250, Status: 'Cancelled', Client: ['recA'], Price: 10, 'Delivery DateTime': d(PREV, 1) }),
      intl('i8', { 'Order No': 1251, Status: 'In Transit', Client: ['recA'], Price: 10, 'Delivery DateTime': d(PREV, 1) }),
    ],
    natl: [
      natl('n1', { Reference: '4500128790', Client: ['recG'], Price: 560, 'Loading DateTime': d(PREV, 0), 'Delivery DateTime': d(PREV, 1) }),
      natl('n2', { Reference: '4500128833', Direction: 'South→North', Client: ['recG'], Price: 540, 'Loading DateTime': d(PREV2, 6), 'Delivery DateTime': d(PREV, 0) }),
    ],
    natlFailed: false,
    gate: { i5: { order_rec: 'i5', loading_stops: 2, covered_stops: 1, sheets_ok: false } },
    gateFailed: false,
  };
}
const annotated = () => V.annotate(fixture(), id => CLIENTS[id] || '');
const byId = (items, id) => items.find(it => it.id === id);

test('states: ready / blocked(price) / blocked(sheets) / invoiced; cancelled and in-transit leave the view', () => {
  const all = annotated();
  assert.strictEqual(byId(all, 'i1').state, 'ready');
  assert.deepStrictEqual([byId(all, 'i4').state, byId(all, 'i4').reason], ['blocked', 'price']);
  assert.deepStrictEqual([byId(all, 'i5').state, byId(all, 'i5').reason], ['blocked', 'sheets']);
  assert.strictEqual(byId(all, 'i6').state, 'invoiced');
  const inView = V.scopeFilter(all, 'all').map(it => it.id);
  assert.ok(!inView.includes('i7') && !inView.includes('i8'));
  assert.strictEqual(inView.length, 8);
});

test('week follows the Weekly: export by delivery, import by loading, national by loading', () => {
  const all = annotated();
  assert.strictEqual(byId(all, 'i1').week, PREV);   // loaded PREV2, delivered PREV → PREV
  assert.strictEqual(byId(all, 'i3').week, PREV);   // import loaded PREV
  assert.strictEqual(byId(all, 'n2').week, PREV2);  // national loaded PREV2 (+6 = Friday), delivered PREV
});

test('scope filter splits the types', () => {
  const all = annotated();
  assert.strictEqual(V.scopeFilter(all, 'intl').length, 6);
  assert.strictEqual(V.scopeFilter(all, 'natl').length, 2);
});

test('week strip counts, words and the default week', () => {
  const items = V.scopeFilter(annotated(), 'all');
  const st = V.weekStats(items);
  assert.deepStrictEqual(st.get(PREV), { ready: 4, blocked: 2, invoiced: 0, total: 6 });
  assert.deepStrictEqual(st.get(PREV2), { ready: 1, blocked: 0, invoiced: 1, total: 2 });
  assert.strictEqual(V.defaultWeek(items, TODAY), PREV, 'most recent week ≤ today with ready orders');
  assert.strictEqual(V.weekWord(st.get(PREV), PREV, true, CUR), '4 προς κοπή');
  assert.strictEqual(V.weekWord(st.get(PREV), PREV, false, CUR), '6 ανοιχτές');
  assert.strictEqual(V.weekWord(st.get(CUR), CUR, false, CUR), 'σε εξέλιξη');
  assert.strictEqual(V.weekWord({ ready: 0, blocked: 0, invoiced: 3, total: 3 }, PREV2, false, CUR), 'κλειστή');
  assert.strictEqual(V.weekWord(undefined, OrdersCommon.addDays(CUR, -35), false, CUR), '—');
  assert.deepStrictEqual(V.stripWeeks(CUR, 3), [PREV2, PREV, CUR]);
  // no ready order anywhere → the current week
  assert.strictEqual(V.defaultWeek(items.filter(it => it.state !== 'ready'), TODAY), CUR);
});

test('base list: a week, or every open order of every week', () => {
  const items = V.scopeFilter(annotated(), 'all');
  assert.strictEqual(V.baseList(items, PREV).length, 6);
  const open = V.baseList(items, 'open');
  assert.strictEqual(open.length, 7);                         // 5 ready + 2 blocked, all weeks
  assert.ok(open.every(it => it.state !== 'invoiced'));
  assert.deepStrictEqual(V.tabCounts(V.baseList(items, PREV)), { ready: 4, blocked: 2, invoiced: 0, all: 6 });
});

test('KPIs: unpriced orders are never summed — ready total, per type, oldest pending', () => {
  const items = V.scopeFilter(annotated(), 'all');
  const k = V.kpis(V.baseList(items, PREV));
  assert.strictEqual(k.ready, 4);
  assert.strictEqual(k.readySum, 3350 + 3350 + 2650 + 560);
  assert.deepStrictEqual([k.intl, k.intlSum, k.natl, k.natlSum], [3, 9350, 1, 560]);
  assert.strictEqual(k.blocked, 2);
  const oldest = V.baseList(items, PREV).filter(it => it.state !== 'invoiced').reduce((m, it) => Math.max(m, it.days), -1);
  assert.strictEqual(k.oldestDays, oldest);
  const k2 = V.kpis(V.baseList(items, PREV2));
  assert.deepStrictEqual([k2.invoiced, k2.invSum], [1, 3200]);
});

test('grouping by client: oldest pending first, rows by delivery, unpriced counted apart', () => {
  const items = V.scopeFilter(annotated(), 'all');
  const groups = V.groupByClient(V.baseList(items, PREV));
  assert.strictEqual(groups.length, 3);
  const b = groups.find(g => g.clientId === 'recB');
  assert.deepStrictEqual([b.items.length, b.sum, b.unpriced], [2, 2650, 1]);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i - 1].oldest >= groups[i].oldest, 'ordered by oldest pending');
  const a = groups.find(g => g.clientId === 'recA');
  assert.deepStrictEqual(a.items.map(it => it.id), ['i1', 'i5', 'i2']);   // delivery PREV+1, +2, +3
});

test('search looks into client, number, reference, ΤΠΥ', () => {
  const items = V.scopeFilter(annotated(), 'all');
  assert.deepStrictEqual(V.searchFilter(items, 'baltic').map(x => x.id).sort(), ['i3', 'i4']);
  assert.deepStrictEqual(V.searchFilter(items, '#1229').map(x => x.id), ['i1']);
  assert.deepStrictEqual(V.searchFilter(items, '0431').map(x => x.id), ['i6']);
  assert.strictEqual(V.searchFilter(items, '  ').length, items.length);
  assert.deepStrictEqual(V.searchFilter(items, 'γαλακτοκομικη').map(x => x.id).sort(), ['n1', 'n2'], 'accent-insensitive');
  assert.deepStrictEqual(V.searchFilter(items, 'ΗΠΕΊΡΟΥ').map(x => x.id).sort(), ['n1', 'n2'], 'case + accent in the query');
});

test('duplicate ΤΠΥ: same client allowed (note), another client flagged', () => {
  const items = annotated();
  const self = byId(items, 'i2');
  assert.deepStrictEqual(V.dupCheck(items, ' 0431 ', self).same.map(x => x.id), ['i6']);
  assert.strictEqual(V.dupCheck(items, '0431', self).other.length, 0);
  const other = byId(items, 'i3');
  assert.deepStrictEqual(V.dupCheck(items, '0431', other).other.map(x => x.id), ['i6']);
  assert.deepStrictEqual(V.dupCheck(items, '', self), { same: [], other: [] });
});

test('next order after an invoice: same client first, else the next ready one', () => {
  const items = V.scopeFilter(annotated(), 'all');
  const groups = V.groupByClient(V.baseList(items, PREV));
  assert.strictEqual(V.nextReady(groups, 'i1', 'recA').id, 'i2');
  const nx = V.nextReady(groups, 'i3', 'recB');
  assert.ok(nx && nx.state === 'ready' && nx.clientId !== 'recB');
});

test('invoice date: future = error, before delivery = warning', () => {
  assert.ok(V.dateCheck(OrdersCommon.addDays(TODAY, 1), TODAY, PREV).error);
  assert.ok(V.dateCheck(OrdersCommon.addDays(PREV, -1), TODAY, PREV).warn);
  assert.deepStrictEqual(V.dateCheck(TODAY, TODAY, PREV), {});
  assert.ok(V.dateCheck('', TODAY, PREV).error);
});

test('write payloads: exactly three fields; undo clears them', () => {
  assert.deepStrictEqual(V.invoiceFields('0434', TODAY), { 'Invoiced': true, 'Invoice Number': '0434', 'Invoice Date': TODAY });
  assert.deepStrictEqual(V.undoFields(), { 'Invoiced': false, 'Invoice Number': null, 'Invoice Date': null });
});

test('CSV «Φύλλο ERP»: header + one row per order, blank amount when unpriced', () => {
  const items = V.scopeFilter(annotated(), 'all');
  const groups = V.groupByClient(V.baseList(items, PREV));
  const info = id => ({ recA: { 'VAT Number': 'IT04211730265', 'Adress': 'Via Emilia 12', 'City': 'Modena', 'Country': 'IT' } })[id] || null;
  const rows = V.csvRows(groups, info);
  assert.deepStrictEqual(rows[0], ['ΑΡ.', 'Αναφορά', 'Πελάτης', 'ΑΦΜ', 'Διεύθυνση', 'Φόρτωση', 'Παράδοση', 'Ημ. παράδοσης', 'Παλέτες', 'Ποσό', 'ΤΠΥ', 'Ημ. ΤΠΥ']);
  assert.strictEqual(rows.length, 7);
  const r1229 = rows.find(r => r[0] === '#1229');
  assert.deepStrictEqual([r1229[3], r1229[4], r1229[9]], ['IT04211730265', 'Via Emilia 12, Modena, IT', '3350.00']);
  assert.strictEqual(rows.find(r => r[1] === 'NP-1')[9], '');
  assert.strictEqual(rows.find(r => r[1] === '4500128790')[0], '—', 'national number «—» until the backend deploy');
});

test('metrics for the audit: overdue is an age across ready and blocked', () => {
  const items = V.scopeFilter(annotated(), 'all');
  const m = V.metricsOf(items);
  assert.deepStrictEqual([m.total, m.ready, m.blocked, m.invoiced], [8, 5, 2, 1]);
  assert.strictEqual(m.overdue, items.filter(it => it.state !== 'invoiced' && it.days > 30).length);
});

test('direction words', () => {
  assert.strictEqual(V.dirWord({ Direction: 'Export' }), 'Εξαγωγή');
  assert.strictEqual(V.dirWord({ Direction: 'North→South' }), 'Κάθοδος');
  assert.strictEqual(V.dirWord({ Direction: 'South→North' }), 'Άνοδος');
  assert.strictEqual(V.dirWord({}), '');
});

// ── Stock lots (057, contract §5.8): one lot + one piece ────────────────────
// Through the REAL OrdersData.loadInvoicingSet (the one place pieces are
// dropped), over stubbed reads — the view itself never re-filters.
const vm = require('vm');
vm.runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'core', 'data-helpers.js'), 'utf8'));
global.OrdersStock = require('../core/orders-common.js').OrdersStock;
const STOCK_LOT = (complete, f) => ({ id: 'recLot1', fields: Object.assign({ 'Lot No': 1300, 'Source Kind': 'intl', 'Intake Delivered': true,
  'Stock Pallets': 33, 'Remaining Pallets': 13, Pieces: 2, 'Pieces Delivered': 1, Complete: complete }, f) });
async function stockSet(extra, lot) {
  const base = fixture();
  global.TABLES = { ORDERS: 'tblO', NAT_ORDERS: 'tblN', STOCK_LOTS: 'tblStockLots' };
  global.FEATURES = { ORDER_SPLIT: true, STOCK_LOTS: false };
  const strip = r => ({ id: r.id, fields: JSON.parse(JSON.stringify(r.fields)) });
  global.atGet = async t => (t === 'tblO' ? [...base.intl, ...extra] : base.natl).map(strip);
  global.atGetAll = async () => [lot];
  global.plFetch = async () => ({ records: Object.values(base.gate) });
  return OrdersData.loadInvoicingSet(true);
}
const LOT_ORDER = intl('iL', { 'Order No': 1300, Reference: 'LOT-1', Direction: 'Import', Client: ['recA'], Price: 3300, 'Own Stock Lot': 'recLot1', 'Total Pallets': 33, 'Loading DateTime': d(PREV, 1), 'Delivery DateTime': d(PREV, 2) });
const PIECE_ORDER = intl('iP', { 'Order No': 1301, Reference: 'PC-1', Direction: 'Import', Client: ['recA'], 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300, 'Total Pallets': 5, 'Loading DateTime': d(PREV, 3), 'Delivery DateTime': d(PREV, 4) });

test('stock: the piece never appears and changes no total; the lot waits, then is one ready invoice', async () => {
  const name = id => CLIENTS[id] || '';
  const without = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER], STOCK_LOT(false)), name), 'all');
  const withPiece = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER, PIECE_ORDER], STOCK_LOT(false)), name), 'all');
  assert.ok(!withPiece.some(it => it.id === 'iP'), 'the piece is not an invoicing row');
  assert.deepStrictEqual(withPiece.map(it => it.id), without.map(it => it.id));
  assert.deepStrictEqual(V.kpis(V.baseList(withPiece, PREV)), V.kpis(V.baseList(without, PREV)), 'no KPI moves because of the piece');
  assert.deepStrictEqual([...V.weekStats(withPiece)], [...V.weekStats(without)]);
  assert.deepStrictEqual(V.metricsOf(withPiece), V.metricsOf(without));
  assert.deepStrictEqual(V.tabCounts(V.baseList(withPiece, 'open')), V.tabCounts(V.baseList(without, 'open')));
  const lot = withPiece.find(it => it.id === 'iL');
  assert.deepStrictEqual([lot.state, lot.reason, lot.lot && lot.lot.id], ['blocked', 'stock', 'recLot1']);
  assert.strictEqual(V.stockText(lot.lot), 'περιμένει κομμάτια: 13p στην αποθήκη · 1 σε κίνηση', 'O4: no zero term');
  assert.strictEqual(V.stockText(null), 'η κατάσταση της παρτίδας δεν διαβάστηκε');
  // a blocked lot is never in «Προς κοπή»; complete → ready, once, at the full client price
  const k0 = V.kpis(V.baseList(withPiece, PREV));
  const done = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER, PIECE_ORDER], STOCK_LOT(true, { 'Remaining Pallets': 0, 'Pieces Delivered': 2 })), name), 'all');
  const k1 = V.kpis(V.baseList(done, PREV));
  assert.strictEqual(done.find(it => it.id === 'iL').state, 'ready');
  assert.deepStrictEqual([k1.ready - k0.ready, k1.readySum - k0.readySum, k1.blocked - k0.blocked], [1, 3300, -1]);
  assert.strictEqual(done.filter(it => it.ref === 'LOT-1' || it.ref === 'PC-1').length, 1, 'one invoice for the lot, none for the piece');
});

// E-07 (impact map 4/10): a piece returned to stock is waiting, not moving.
test('stockText: «σε κίνηση» counts only pieces on a truck; returned ones are «χωρίς φορτηγό»', () => {
  const lot = STOCK_LOT(false, { Pieces: 4, 'Pieces Delivered': 1, 'Pieces Without Truck': 2, 'Remaining Pallets': 7 });
  assert.strictEqual(V.stockText(lot), 'περιμένει κομμάτια: 7p στην αποθήκη · 1 σε κίνηση · 2 χωρίς φορτηγό');
  // O4 (critic-5 S5-04): only the non-zero terms; absent counts (facade trap
  // #2) are 0 — never NaN, a negative, or «0 σε κίνηση · 0 χωρίς φορτηγό».
  assert.strictEqual(V.stockText(STOCK_LOT(false, { Pieces: 2, 'Pieces Delivered': 2, 'Remaining Pallets': 2 })), 'περιμένει κομμάτια: 2p στην αποθήκη');
  assert.strictEqual(V.stockText({ id: 'x', fields: {} }), 'περιμένει κομμάτια');
});

// PR-15/E-06 — OWNER-Q6 default (4/10): the ERP sheet of a LOT names the
// pieces' deliveries and the last one's date, not the warehouse intake.
test('ERP sheet of a complete lot: «N παραδόσεις» + «Last Piece Delivered»; ordinary rows unchanged', async () => {
  const name = id => CLIENTS[id] || '';
  const lastPiece = OrdersCommon.addDays(TODAY, -1);
  const set = await stockSet([LOT_ORDER, PIECE_ORDER], STOCK_LOT(true, { 'Remaining Pallets': 0, Pieces: 2, 'Pieces Delivered': 2, 'Last Piece Delivered': lastPiece }));
  const items = V.scopeFilter(V.annotate(set, name), 'all');
  const lot = items.find(it => it.id === 'iL');
  assert.deepStrictEqual([lot.erp.place, lot.erp.date, lot.erp.lot], ['2 παραδόσεις', lastPiece, true], 'O5: no internal «(κομμάτια)»');
  assert.strictEqual(lot.deliv, OrdersCommon.ymd(LOT_ORDER.fields['Delivery DateTime']), 'the card keeps the order\'s own delivery (warehouse intake)');
  const rows = V.csvRows(V.groupByClient(V.baseList(items, PREV)), () => null);
  const lotRow = rows.find(r => r[1] === 'LOT-1');
  assert.deepStrictEqual([lotRow[6], lotRow[7], lotRow[8]], ['2 παραδόσεις', lastPiece, '33']);
  const plain = rows.find(r => r[1] === '6100118264');
  assert.strictEqual(plain[7], OrdersCommon.ymd(fixture().intl[1].fields['Delivery DateTime']), 'an ordinary order keeps its delivery date');
  // one piece → singular; lot record not read → said, never the warehouse
  assert.strictEqual(V.erpDelivery({ stock: new Map([['recLot1', STOCK_LOT(true, { 'Pieces Delivered': 1 })]]) }, LOT_ORDER, { name: 'Αποθήκη Χ', sub: '' }, '').place, '1 παράδοση');
  const unread = V.erpDelivery({ stock: null }, LOT_ORDER, { name: 'Αποθήκη Χ', sub: 'Budapest HU' }, '2026-10-01');
  assert.deepStrictEqual([unread.place, unread.date], ['παραδόσεις κομματιών — η παρτίδα δεν διαβάστηκε', '']);
});

// E-05 (impact map 4/10): a lot waits to be invoiced from «Completed On».
test('age of a lot: none while incomplete, from «Completed On» once complete — not from the warehouse intake', async () => {
  const name = id => CLIENTS[id] || '';
  const old = Object.assign({}, LOT_ORDER, { fields: Object.assign({}, LOT_ORDER.fields, { 'Delivery DateTime': OrdersCommon.addDays(TODAY, -45) + 'T10:00:00' }) });
  const open = V.scopeFilter(V.annotate(await stockSet([old], STOCK_LOT(false)), name), 'all').find(it => it.id === 'iL');
  assert.strictEqual(open.days, null, 'an incomplete lot has no age (it cannot be invoiced yet)');
  const done = V.scopeFilter(V.annotate(await stockSet([old], STOCK_LOT(true, { 'Completed On': OrdersCommon.addDays(TODAY, -2) })), name), 'all').find(it => it.id === 'iL');
  assert.strictEqual(done.days, 2);
  assert.strictEqual(V.metricsOf([done]).overdue, 0, 'not «overdue» because of the 45 days in the warehouse');
});

// Round 1 O2 (critic-2 E2-02, critic-4 C4-08): a CLOSED lot is not «33
// pallets delivered» on the paper she types into the ERP — delivered + the
// written-off note; a lot closed with no piece prints the close, not
// «0 παραδόσεις» and a blank date. Same text in the CSV, the print and the copy
// (one source: erpDelivery).
test('O2: ERP pallets of a closed lot = delivered + «N χαμένες»; a zero-piece close prints the close and its date', async () => {
  const name = id => CLIENTS[id] || '';
  const lastPiece = OrdersCommon.addDays(TODAY, -3), closedOn = OrdersCommon.addDays(TODAY, -1);
  const closed = STOCK_LOT(true, { 'Remaining Pallets': 2, Pieces: 2, 'Pieces Delivered': 2, 'Delivered Pallets': 31, 'Written Off Pallets': 2,
    'Last Piece Delivered': lastPiece, 'Closed At': closedOn + 'T13:00:00Z', 'Closed Note': '2 χαλασμένες', 'Completed On': closedOn });
  const items = V.scopeFilter(V.annotate(await stockSet([LOT_ORDER], closed), name), 'all');
  const lot = items.find(it => it.id === 'iL');
  assert.deepStrictEqual([lot.state, lot.erp.place, lot.erp.date, lot.erp.pallets], ['ready', '2 παραδόσεις', lastPiece, '31 + 2 χαμένες']);
  const row = V.csvRows(V.groupByClient(V.baseList(items, PREV)), () => null).find(r => r[1] === 'LOT-1');
  assert.strictEqual(row[8], '31 + 2 χαμένες', 'the CSV «Παλέτες» cell');
  // zero pieces, whole lot written off (Ε3)
  const zero = STOCK_LOT(true, { 'Remaining Pallets': 33, Pieces: 0, 'Pieces Delivered': 0, 'Delivered Pallets': 0, 'Written Off Pallets': 33,
    'Closed At': closedOn + 'T13:00:00Z', 'Closed Note': 'ο πελάτης τα πήρε', 'Completed On': closedOn });
  const z = V.erpDelivery({ stock: new Map([['recLot1', zero]]) }, LOT_ORDER, { name: 'Αποθήκη Χ', sub: '' }, '');
  assert.deepStrictEqual([z.place, z.date, z.pallets, z.closeOnly], ['κλείσιμο υπολοίπου — κανένα κομμάτι', closedOn, '0 + 33 χαμένες', true]);
  // not closed: the order's own pallets, unchanged
  const open = V.erpDelivery({ stock: new Map([['recLot1', STOCK_LOT(false)]]) }, LOT_ORDER, { name: 'Αποθήκη Χ', sub: '' }, '');
  assert.strictEqual(open.pallets, '33');
});

// Round 1 O3 (critic-2 E2-03, critic-5 S5-05): one date per lot — the KPI
// «Παλαιότερη εκκρεμής», the sort and the invoice-date check read the same
// date as the ERP paper (last delivery), never the warehouse intake.
test('O3: a lot\'s one date (when) = its last delivery; KPI date and the invoice-date warning follow it', async () => {
  const name = id => CLIENTS[id] || '';
  const lastPiece = OrdersCommon.addDays(TODAY, -2);
  const old = Object.assign({}, LOT_ORDER, { fields: Object.assign({}, LOT_ORDER.fields, { 'Delivery DateTime': OrdersCommon.addDays(TODAY, -40) + 'T10:00:00' }) });
  const done = STOCK_LOT(true, { 'Remaining Pallets': 0, 'Pieces Delivered': 2, 'Last Piece Delivered': lastPiece, 'Completed On': lastPiece });
  const items = V.scopeFilter(V.annotate(await stockSet([old], done), name), 'all');
  const lot = items.find(it => it.id === 'iL');
  assert.deepStrictEqual([lot.when, lot.erp.date, lot.days], [lastPiece, lastPiece, 2]);
  const k = V.kpis([lot]);
  assert.deepStrictEqual([k.oldestDays, k.oldestDate], [2, lastPiece], 'the KPI date is the date its days count from, not the intake 40 days ago');
  const before = OrdersCommon.addDays(lastPiece, -1);
  assert.ok(V.dateCheck(before, TODAY, lot.when).warn, 'an invoice dated before the last piece warns');
  assert.ok(!V.dateCheck(before, TODAY, lot.deliv).warn, '(against the intake date it would have passed silently)');
  const plain = items.find(it => it.id === 'i2');
  assert.strictEqual(plain.when, plain.deliv, 'an ordinary order: its own delivery');
});

// Round 2 #1 (owner 4/10): stock_v_lot_money.allocation_status 'no_intake_cost'
// became 'no_charge' (no partner rate AND no «Χρέωση αποθήκης»). The dead name
// is no longer dressed up as a reason; an unknown status is shown as it is.
test('allocation why-map: no_charge → «χωρίς χρέωση αποθήκης»; the old name is not translated', () => {
  assert.strictEqual(V.allocWhy('no_charge'), 'χωρίς χρέωση αποθήκης');
  assert.strictEqual(V.allocWhy('no_price'), 'χωρίς τιμή');
  assert.strictEqual(V.allocWhy('no_pallets'), 'χωρίς παλέτες');
  assert.strictEqual(V.allocWhy('no_intake_cost'), 'no_intake_cost');
  assert.strictEqual(V.allocWhy(null), '—');
});
