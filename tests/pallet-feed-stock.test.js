// node --test tests/pallet-feed-stock.test.js
// Stock lots Φ1 (impact map 4/10 C-03 / PL-02, OWNER-Q7 default): marking a
// LOT «Delivered» in the Ημερήσιο is the WAREHOUSE intake — plOnDelivered must
// write no confirmed client DELIVERY for it. An ordinary order with pallet
// exchange still gets its DELIVERY row. The REAL core/pallet-feed.js runs in a
// vm with the REAL OrdersStock; fetch / atGetOne / stopsLoad are stubs that
// record every call to /pallets/*.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersStock } = require('../core/orders-common.js');
const SRC = fs.readFileSync(path.join(ROOT, 'core', 'pallet-feed.js'), 'utf8');

function world(rec) {
  const net = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, FEATURES: { ORDER_SPLIT: true },
    TABLES: { ORDERS: 'tblO', NAT_ORDERS: 'tblN' },
    F: { STOP_PARENT_ORDER: 'Parent Order', STOP_PARENT_NAT: 'Parent Nat', STOP_TYPE: 'Stop Type', STOP_PALLETS: 'Pallets', STOP_LOCATION: 'Location', STOP_DATETIME: 'DateTime' },
    PROXY_URL: 'https://w.example', localStorage: { getItem: () => null },
    atGetOne: async () => rec,
    stopsLoad: async () => [{ id: 'recSTOPU1', fields: { 'Stop Type': 'Unloading', Pallets: 33, Location: ['recWH1'] } }],
    showErrorToast: () => {},
    fetch: async (url, opts) => {
      net.push({ m: (opts && opts.method) || 'GET', url: String(url).replace('https://w.example', ''), body: opts && opts.body ? JSON.parse(opts.body) : null });
      return { ok: true, status: 200, json: async () => ({ records: [] }) };
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\nthis.plOnDelivered = plOnDelivered;', ctx);
  return { ctx, net };
}

test('C-03: a LOT marked Delivered (warehouse intake) writes no pallet movement', async () => {
  const { ctx, net } = world({ id: 'recLOT1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'], 'Own Stock Lot': 'recSTOCKLOT1' } });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m === 'POST'), [], JSON.stringify(net));
});

test('an ordinary order with pallet exchange still gets its confirmed DELIVERY', async () => {
  const { ctx, net } = world({ id: 'recORD1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'] } });
  await ctx.plOnDelivered('recORD1');
  const post = net.filter(c => c.m === 'POST');
  assert.strictEqual(post.length, 1);
  assert.strictEqual(post[0].body.event_type, 'DELIVERY');
  assert.strictEqual(post[0].body.taken, 33);
});
