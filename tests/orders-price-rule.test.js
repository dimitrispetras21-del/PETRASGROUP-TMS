// tests/orders-price-rule.test.js — run: TZ=Europe/Athens node --test tests/orders-price-rule.test.js
// Owner 13/10 (DECISION_LOG «Παραγγελίες › Εβδομάδα v4», finding 2): 0 € = no
// price, EVERYWHERE. One function decides (OrdersCommon.hasPrice); the
// invoicing view must count a 0 € order as unpriced — never as a priced 0,00 €
// while stateOf blocks it for its price (two rules = none).
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersData } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;
global.OrdersData = OrdersData;
const V = require('../modules/orders_invoicing_view.js');

test('hasPrice: only a finite price > 0 is a price', () => {
  const cases = [[null, false], [undefined, false], ['', false], [0, false], ['0', false], [-5, false],
    [0.01, true], [1200, true]];
  for (const [v, want] of cases) assert.strictEqual(OrdersCommon.hasPrice({ Price: v }), want, `Price=${JSON.stringify(v)}`);
  assert.strictEqual(OrdersCommon.hasPrice({}), false, 'no Price field');
});

test('invoicing view: a 0 € delivered order is unpriced in groupByClient and kpis', () => {
  const PREV = OrdersCommon.addDays(TmsWeek.startOfDate(OrdersCommon.today()), -7);
  const d = n => OrdersCommon.addDays(PREV, n) + 'T10:00:00';
  const rec = (id, price) => ({ id, _type: 'intl', fields: { Status: 'Delivered', Direction: 'Export', 'Order No': id,
    Client: ['recA'], Price: price, 'Loading DateTime': d(0), 'Delivery DateTime': d(2) } });
  const set = { intl: [rec('z0', 0), rec('p1', 1200)], natl: [], natlFailed: false, gate: {}, gateFailed: false };
  const items = V.scopeFilter(V.annotate(set, () => 'Alpina'), 'all');
  const zero = items.find(it => it.id === 'z0');
  assert.deepStrictEqual([zero.state, zero.reason, zero.price], ['blocked', 'price', null]);

  const [g] = V.groupByClient(items);
  assert.deepStrictEqual([g.items.length, g.sum, g.unpriced], [2, 1200, 1]);

  const k = V.kpis(items);
  assert.deepStrictEqual([k.ready, k.readySum, k.blocked], [1, 1200, 1]);

  // CSV «Φύλλο ERP»: blank amount for 0 €, exactly as for a missing price.
  const rows = V.csvRows(V.groupByClient(items), () => null);
  const amt = rows[0].indexOf('Ποσό');
  assert.strictEqual(rows.find(r => r[0] === zero.num)[amt], '');
});
