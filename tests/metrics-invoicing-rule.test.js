// tests/metrics-invoicing-rule.test.js — run: TZ=Europe/Athens node --test tests/metrics-invoicing-rule.test.js
// B0 review #1 (owner 22/10/2026): core/metrics.js «Έσοδα έτοιμα για τιμολόγηση» (revenueReadyToInvoice)
// and «Εκπρόθεσμα τιμολόγια» (overdueInvoices) follow the SAME rule as «Προς τιμολόγηση»: OrdersData.stateOf
// (every non-cancelled, not-invoiced order with a price > 0 is ready — not yet delivered, a pre-order, a
// stock lot too; the pallet slip blocks nothing) and OrdersData.ageOf (overdue = delivered > 30 days ago,
// open = ready or blocked, as metricsOf of «Προς τιμολόγηση» counts it). Proven on one fixture: the metrics
// agree with OrdersData applied to the very same records, and with the numbers written out by hand.
// Real code: metrics.js in a vm context, the REAL OrdersCommon / OrdersData / OrdersStock.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersData, OrdersStock } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;

function metricsLib() {
  const ctx = { OrdersStock, OrdersData, OrdersCommon, getLinkedId, FEATURES: { ORDER_SPLIT: true }, TmsWeek, localToday: () => OrdersCommon.today(), console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'metrics.js'), 'utf8') + '\nthis.metrics = metrics;', ctx);
  return ctx.metrics;
}

const at = n => OrdersCommon.addDays(OrdersCommon.today(), n) + 'T10:00:00';
const o = (id, f) => ({ id, fields: Object.assign({ Direction: 'Export', Client: ['recA'] }, f) });
const FIX = [
  o('rOld', { Status: 'Delivered', Price: 1000, 'Delivery DateTime': at(-40) }),                     // ready, overdue
  o('rNew', { Status: 'Delivered', Price: 2000, 'Delivery DateTime': at(-5) }),                      // ready
  o('rRoad', { Status: 'In Transit', Price: 300, 'Delivery DateTime': at(-40) }),                    // ready, no age (not delivered)
  o('rPlan', { Status: 'Assigned', Price: 400, 'Delivery DateTime': at(4) }),                        // ready (B0)
  o('rPre', { Status: 'Pending', 'Ops Status': 'Provisional', Price: 50 }),                          // ready (pre-order, owner 22/10)
  o('rSlip', { Status: 'Delivered', Price: 600, 'Pallet Exchange': true, 'Delivery DateTime': at(-2) }), // ready (slip blocks nothing)
  o('rLot', { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recLot1', 'Delivery DateTime': at(-45) }), // ready, overdue (a lot like any order)
  o('rNoP', { Status: 'Delivered', Price: 0, 'Delivery DateTime': at(-35) }),                        // blocked (price), overdue
  o('rCan', { Status: 'Cancelled', Price: 700, 'Delivery DateTime': at(-50) }),                      // out
  o('rInv', { Status: 'Delivered', Price: 800, Invoiced: true, 'Invoice Number': '1', 'Delivery DateTime': at(-60) }), // out
  o('rPc', { Status: 'Delivered', 'Stock Lot': ['recLot1'], 'Delivery DateTime': at(-40) }),         // a piece: never
  o('rLeg', { Status: 'Delivered', Price: 999, 'Parent Order': ['rOld'], 'Delivery DateTime': at(-40) }), // a split leg: never
];
const clone = () => FIX.map(r => ({ id: r.id, fields: JSON.parse(JSON.stringify(r.fields)) }));
// «Προς τιμολόγηση»'s own set: no pieces, no split legs (OrdersData.loadInvoicingSet).
const SET = () => {
  const intl = OrdersData.withoutPieces(clone().filter(r => !getLinkedId(r.fields['Parent Order'])));
  intl.forEach(r => { r._type = 'intl'; });
  return { intl, natl: [], gate: {}, gateFailed: false, stock: new Map(), stockFailed: false };
};

test('ready revenue = Σ price of the orders «Προς τιμολόγηση» calls «ready»', () => {
  const m = metricsLib(), s = SET();
  const viaData = OrdersData.all(s).filter(r => OrdersData.stateOf(s, r).key === 'ready')
    .reduce((a, r) => a + OrdersCommon.price(r.fields), 0);
  assert.strictEqual(viaData, 1000 + 2000 + 300 + 400 + 50 + 600 + 3300);
  assert.strictEqual(m.revenueReadyToInvoice(clone()), viaData);
});

test('overdue = open (ready or blocked) and delivered more than 30 days ago (OrdersData.ageOf)', () => {
  const m = metricsLib(), s = SET();
  const viaData = OrdersData.all(s).filter(r => ['ready', 'blocked'].includes(OrdersData.stateOf(s, r).key))
    .filter(r => { const d = OrdersData.ageOf(s, r); return d !== null && d > 30; }).map(r => r.id).sort();
  assert.deepStrictEqual(viaData, ['rLot', 'rNoP', 'rOld']);
  assert.deepStrictEqual(m.overdueInvoices(clone()).map(r => r.id).sort(), viaData);
});
