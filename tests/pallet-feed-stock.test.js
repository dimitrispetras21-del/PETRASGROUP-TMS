// node --test tests/pallet-feed-stock.test.js
// Stock lots Φ1 (impact map 4/10 C-03 / PL-02): marking a LOT «Delivered» in
// the Ημερήσιο is the WAREHOUSE intake — plOnDelivered writes no client
// DELIVERY for it; since the owner's answer 4/10 it writes ONE pending partner
// movement (below). An ordinary order with pallet exchange still gets its
// DELIVERY row. The REAL core/pallet-feed.js runs in a vm with the REAL
// OrdersStock; fetch / atGetOne / stopsLoad are stubs that record every call
// to /pallets/*.
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

function world(rec, opt = {}) {
  const net = [], toasts = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, FEATURES: { ORDER_SPLIT: true },
    TABLES: { ORDERS: 'tblO', NAT_ORDERS: 'tblN' },
    F: { STOP_PARENT_ORDER: 'Parent Order', STOP_PARENT_NAT: 'Parent Nat', STOP_TYPE: 'Stop Type', STOP_PALLETS: 'Pallets', STOP_LOCATION: 'Location', STOP_DATETIME: 'DateTime' },
    PROXY_URL: 'https://w.example', localStorage: { getItem: () => null },
    atGetOne: async () => rec,
    stopsLoad: async () => [{ id: 'recSTOPU1', fields: { 'Stop Type': 'Unloading', Pallets: 33, Location: ['recWH1'] } }],
    showErrorToast: (m, t) => { toasts.push((t || 'error') + ': ' + m); },
    fetch: async (url, opts) => {
      const u = String(url).replace('https://w.example', '');
      net.push({ m: (opts && opts.method) || 'GET', url: u, body: opts && opts.body ? JSON.parse(opts.body) : null });
      const records = (opt.existing && (!opts || !opts.method || opts.method === 'GET')) ? opt.existing(u) : [];
      return { ok: true, status: 200, json: async () => ({ records }) };
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\nthis.plOnDelivered = plOnDelivered; this.plOnIntlPartnerAssigned = plOnIntlPartnerAssigned;', ctx);
  return { ctx, net, toasts };
}

// OWNER-Q7 answered 4/10 (coordinator queue #6): «Να γράφεται και η αποθήκη».
// The warehouse intake writes ONE pending movement with the lot's PARTNER —
// locked pallet table case #4 (we hand loaded pallets to a partner; the sheet
// says what it left) — never a client DELIVERY (the client exchanges once, at
// the lot's loading, Ε5). Pieces write nothing.
const LOT_P = { 'Pallet Exchange': true, Client: ['recCLIA'], 'Own Stock Lot': 'recSTOCKLOT1', Partner: ['recPARTW'], 'Is Partner Trip': true };

test('Q6: a LOT intake with a partner → ONE pending PARTNER_PICKUP (given = lot pallets), no client DELIVERY', async () => {
  const { ctx, net, toasts } = world({ id: 'recLOT1', fields: LOT_P });
  await ctx.plOnDelivered('recLOT1');
  const post = net.filter(c => c.m === 'POST');
  assert.strictEqual(post.length, 1, JSON.stringify(net));
  assert.deepStrictEqual(post[0].body, {
    movement_date: post[0].body.movement_date, counterparty_type: 'PARTNER', partner_rec: 'recPARTW',
    location_rec: 'recWH1', event_type: 'PARTNER_PICKUP', taken: 0, given: 33,
    order_stop_rec: 'recSTOPU1', order_rec: 'recLOT1',
  });
  assert.ok(!('confirm' in post[0].body), 'pending until the sheet says what the warehouse left');
  assert.deepStrictEqual(toasts, []);
});

test('Q6: the intake movement is written once — a second «Delivered» finds it by its stop and writes nothing', async () => {
  const { ctx, net } = world({ id: 'recLOT1', fields: LOT_P }, { existing: u => (u.includes('order_stop_rec=recSTOPU1') ? [{ id: 9, status: 'confirmed', event_type: 'PARTNER_PICKUP' }] : []) });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m !== 'GET'), []);
});

test('Q6: a LOT without a partner (our own truck) → no movement, and it is SAID (no invented counterparty)', async () => {
  const { ctx, net, toasts } = world({ id: 'recLOT1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'], 'Own Stock Lot': 'recSTOCKLOT1' } });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m === 'POST'), [], JSON.stringify(net));
  assert.strictEqual(toasts.length, 1, JSON.stringify(toasts));
  assert.match(toasts[0], /^warn: Παλέτες αποθήκης: η παρτίδα δεν έχει συνεργάτη — καταχώρησε χειροκίνητα από το Ισοζύγιο/);
});

test('Q6: a LOT without pallet exchange → nothing, as for any order', async () => {
  const { ctx, net, toasts } = world({ id: 'recLOT1', fields: { ...LOT_P, 'Pallet Exchange': false } });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(net, []);
  assert.deepStrictEqual(toasts, []);
});

test('Q6: re-saving a lot\'s partner assignment never deletes its pending intake movement', async () => {
  const pending = { id: 9, status: 'pending', event_type: 'PARTNER_PICKUP', order_stop_id: 77 };
  const { ctx, net } = world({ id: 'recLOT1', fields: LOT_P }, { existing: () => [pending] });
  await ctx.plOnIntlPartnerAssigned('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m !== 'GET'), [], JSON.stringify(net));
});

test('an ordinary order with pallet exchange still gets its confirmed DELIVERY', async () => {
  const { ctx, net } = world({ id: 'recORD1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'] } });
  await ctx.plOnDelivered('recORD1');
  const post = net.filter(c => c.m === 'POST');
  assert.strictEqual(post.length, 1);
  assert.strictEqual(post[0].body.event_type, 'DELIVERY');
  assert.strictEqual(post[0].body.taken, 33);
});
