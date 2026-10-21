// tests/invoice-from-registration.test.js — run: TZ=Europe/Athens node --test tests/invoice-from-registration.test.js
// B0 (owner 21/10/2026, spec docs/superpowers/specs/2026-10-21-national-v5-design.md «Χρήματα»): every
// order — international, national, a stock lot too — is invoiced from its registration. Not the delivery,
// not the stock, not the pallet slip; only a price > 0 stops it (Worker invoiceMarkError + migration 043).
// These are the rules of OrdersData (core/orders-common.js), the ONE place the hub badges, «Προς
// τιμολόγηση», «Χωρίς τιμή» and the week view read, plus the pieces of «Προς τιμολόγηση» and of
// OrdersStock that followed the old rule. The base side (071a) is proven in tms-auditor/test/rules-071a.test.mjs.
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
const V = require('../modules/orders_invoicing_view.js');

const TODAY = OrdersCommon.today();
const at = n => OrdersCommon.addDays(TODAY, n) + 'T10:00:00';   // n < 0 = past, n > 0 = future

// ── a little in-memory facade (same shape as tests/orders-stock.test.js) ──
let calls, db;
beforeEach(() => {
  calls = [];
  db = { orders: [], natl: [], lots: [] };
  global.TABLES = { ORDERS: 'tblO', NAT_ORDERS: 'tblN', STOCK_LOTS: 'tblStockLots' };
  global.FEATURES = { ORDER_SPLIT: true, STOCK_LOTS: true };
  global.ROLE = 'accountant';
  global.atGet = async (table, formula) => {
    calls.push(['atGet', table, formula]);
    return (table === 'tblO' ? db.orders : db.natl).map(r => ({ id: r.id, fields: Object.assign({}, r.fields) }));
  };
  global.atGetAll = async (table, opts) => {
    calls.push(['atGetAll', table, (opts || {}).filterByFormula || '']);
    return table === 'tblStockLots' ? db.lots.map(r => ({ id: r.id, fields: Object.assign({}, r.fields) })) : [];
  };
  global.plFetch = async url => { calls.push(['plFetch', url]); return { records: [] }; };
});

const intl = (id, f) => ({ id, _type: 'intl', fields: Object.assign({ Direction: 'Export', Client: ['recA'] }, f) });
const natl = (id, f) => ({ id, _type: 'natl', fields: Object.assign({ Direction: 'North→South', Client: ['recG'] }, f) });
const SET = extra => Object.assign({ intl: [], natl: [], gate: {}, gateFailed: false, stock: new Map(), stockFailed: false }, extra);

test('the set: every order that is not cancelled (an invoiced one stays) — the delivery no longer filters', async () => {
  await OrdersData.loadInvoicingSet(true);
  const reads = calls.filter(c => c[0] === 'atGet').map(c => [c[1], c[2]]);
  assert.deepStrictEqual(reads, [['tblO', 'OR({Status}!="Cancelled",{Invoiced}=1)'], ['tblN', 'OR({Status}!="Cancelled",{Invoiced}=1)']]);
});

test('an order not yet delivered, priced, is «ready» — international and national', () => {
  const s = SET();
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i1', { Status: 'Assigned', Price: 1200, 'Delivery DateTime': at(3) })), { key: 'ready' });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i2', { Status: 'Pending', Price: 900 })), { key: 'ready' }, 'no dates at all');
  assert.deepStrictEqual(OrdersData.stateOf(s, natl('n1', { Price: 500, 'Delivery DateTime': at(5) })), { key: 'ready' });
});

test('only the price blocks; a pre-order is invoiced like any order (owner 22/10); cancelled and invoiced keep their state', () => {
  const s = SET();
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i1', { Status: 'Assigned', 'Delivery DateTime': at(3) })), { key: 'blocked', reason: 'price' });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i2', { Status: 'Assigned', Price: 0 })), { key: 'blocked', reason: 'price' }, '0 € = no price');
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i3', { Status: 'Pending', Price: 800, 'Ops Status': 'Provisional' })), { key: 'ready' }, 'a pre-order: ready');
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('i3b', { Status: 'Pending', 'Ops Status': 'Provisional' })), { key: 'blocked', reason: 'price' }, 'an unpriced pre-order: «Χωρίς τιμή»');
  assert.strictEqual(OrdersData.stateOf(s, intl('i4', { Status: 'Cancelled', Price: 800 })).key, 'cancelled');
  assert.strictEqual(OrdersData.stateOf(s, intl('i5', { Status: 'Assigned', Price: 800, Invoiced: true, 'Invoice Number': '0900' })).key, 'invoiced');
});

test('a stock lot is invoiced like any order: waiting for its pieces, or its lots unread, it is «ready»', () => {
  const lot = intl('iL', { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recLot1', 'Delivery DateTime': at(-2) });
  const waiting = { id: 'recLot1', fields: { Complete: false, Pieces: 2, 'Pieces Delivered': 0, 'Remaining Pallets': 13 } };
  assert.deepStrictEqual(OrdersData.stateOf(SET({ stock: new Map([['recLot1', waiting]]) }), lot), { key: 'ready' });
  assert.deepStrictEqual(OrdersData.stateOf(SET({ stock: null, stockFailed: true }), lot), { key: 'ready' }, 'a failed lot read no longer blocks');
  const transit = intl('iL2', { Status: 'In Transit', Price: 3300, 'Own Stock Lot': 'recLot1' });
  assert.deepStrictEqual(OrdersData.stateOf(SET(), transit), { key: 'ready' }, 'not yet in the warehouse');
});

test('the pallet slip is asked about only after the delivery', async () => {
  const s = SET({ gate: { iD: { sheets_ok: false }, iU: { sheets_ok: false } } });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('iD', { Status: 'Delivered', Price: 1000, 'Pallet Exchange': true })), { key: 'ready', noSheets: true });
  assert.deepStrictEqual(OrdersData.stateOf(s, intl('iU', { Status: 'Assigned', Price: 1000, 'Pallet Exchange': true })), { key: 'ready' }, 'no slip can exist before the delivery');
  db.orders = [intl('iD', { Status: 'Delivered', Price: 1000, 'Pallet Exchange': true }), intl('iU', { Status: 'Assigned', Price: 1000, 'Pallet Exchange': true })];
  await OrdersData.loadInvoicingSet(true);
  assert.deepStrictEqual(calls.filter(c => c[0] === 'plFetch').map(c => c[1]), ['/pallets/gate?order_recs=iD']);
});

test('age: days since the order\'s own delivery, a lot too; none before the delivery', () => {
  assert.strictEqual(OrdersData.ageOf(SET(), intl('a', { Status: 'Delivered', 'Delivery DateTime': at(-5) })), 5);
  assert.strictEqual(OrdersData.ageOf(SET(), intl('b', { Status: 'Assigned', 'Delivery DateTime': at(3) })), null, 'never «-3 ημέρες»');
  assert.strictEqual(OrdersData.ageOf(SET(), intl('c', { Status: 'Pending' })), null);
  const lot = intl('L', { Status: 'Delivered', 'Own Stock Lot': 'recLot1', 'Delivery DateTime': at(-40) });
  assert.strictEqual(OrdersData.ageOf(SET({ stock: new Map([['recLot1', { id: 'recLot1', fields: { Complete: false } }]]) }), lot), 40,
    'from its own delivery into the warehouse (B-15 counts the same since 071a)');
});

test('«Προς τιμολόγηση»: an order not yet delivered is a row «προς κοπή»; the invoice date may precede the delivery', () => {
  const set = SET({ intl: [intl('iU', { Status: 'Assigned', Price: 1200, Reference: 'U-1', 'Loading DateTime': at(1), 'Delivery DateTime': at(3) })] });
  const items = V.scopeFilter(V.annotate(set, () => 'Πελάτης'), 'all');
  assert.deepStrictEqual(items.map(it => [it.id, it.state, it.days, it.when]), [['iU', 'ready', null, OrdersCommon.ymd(at(3))]]);
  assert.strictEqual(V.stateWord(items[0]), 'προς κοπή');
  assert.deepStrictEqual(V.dateCheck(TODAY, TODAY), {}, 'today, before the delivery: no warning');
  assert.ok(V.dateCheck(OrdersCommon.addDays(TODAY, 1), TODAY).error, 'tomorrow is still an error');
  assert.strictEqual(V.lotDone, undefined, 'the lot\'s completion date went with the gate');
});

test('a closed lot reopens whatever its invoice (071a); the close no longer promises «μέχρι να τιμολογηθεί»', () => {
  global.ROLE = 'dispatcher';
  const closedInvoiced = { id: 'recLot1', fields: { 'Closed At': '2026-10-04T13:00:00Z', 'Closed Note': 'x', Invoiced: true } };
  assert.strictEqual(OrdersStock.reopenable(closedInvoiced), true);
  const t = OrdersStock.closeText({ id: 'recLot1', fields: { 'Remaining Pallets': 2, Pieces: 2 } }).join(' ');
  assert.ok(!/τιμολογ/.test(t), t);
});
