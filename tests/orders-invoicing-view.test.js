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
