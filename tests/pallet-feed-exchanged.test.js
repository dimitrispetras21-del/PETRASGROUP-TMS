// node --test tests/pallet-feed-exchanged.test.js
// «30 παλέτες, οι 10 με ανταλλαγή» (owner 8/11): a loading stop's «Pallets Exchanged»
// decides what the pending LOADING says we take back. Empty = every pallet (as before);
// a set 0 = no exchange at this stop: no pending loading, an old one is removed, and the
// pallets weekly view does not ask for one. The REAL core/pallet-feed.js runs in a vm;
// /pallets/movements is a stateful stub that behaves like the Worker.
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

const ORDER = { id: 'recORD1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'] } };
const stop = (id, f) => ({ id, fields: { 'Stop Type': 'Loading', Pallets: 30, Location: ['recLOC1'], DateTime: '2026-11-09T08:00', ...f } });

function world(stops, rows = []) {
  const net = [], toasts = []; let seq = 100;
  const res = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, FEATURES: { ORDER_SPLIT: true },
    TABLES: { ORDERS: 'tblO', NAT_ORDERS: 'tblN' },
    F: { STOP_PARENT_ORDER: 'Parent Order', STOP_PARENT_NAT: 'Parent Nat', STOP_TYPE: 'Stop Type', STOP_PALLETS: 'Pallets',
      STOP_PALLETS_EXCHANGED: 'Pallets Exchanged', STOP_LOCATION: 'Location', STOP_DATETIME: 'DateTime' },
    PROXY_URL: 'https://w.example', localStorage: { getItem: () => null },
    atGetOne: async () => ORDER,
    stopsLoad: async () => stops,
    showErrorToast: (m) => toasts.push(m),
    fetch: async (url, opts) => {
      const u = String(url).replace('https://w.example', '');
      const m = (opts && opts.method) || 'GET';
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      net.push({ m, url: u, body });
      const q = new URL('https://w.example' + u).searchParams;
      if (m === 'GET') {
        const st = q.get('order_stop_rec'), ord = q.get('order_rec');
        return res({ records: rows.filter(r => (!st || r.order_stop_rec === st) && (!ord || r.order_rec === ord)).map(r => ({ ...r })) });
      }
      if (m === 'POST') { const row = { id: ++seq, status: 'pending', ...body }; rows.push(row); return res({ record: row }); }
      const id = +u.split('?')[0].split('/').pop(), i = rows.findIndex(r => r.id === id);
      if (m === 'PATCH') { Object.assign(rows[i], body); return res({ record: rows[i] }); }
      if (m === 'DELETE') { rows.splice(i, 1); return res({ deleted: true }); }
      return res({});
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\nthis.plOnOrderSaved = plOnOrderSaved; this._plNoExchangeStop = _plNoExchangeStop;', ctx);
  return { ctx, net, toasts, rows };
}
const posts = net => net.filter(c => c.m === 'POST').map(c => c.body);

test('10 of 30 with exchange → the pending loading takes back 10', async () => {
  const w = world([stop('recS1', { 'Pallets Exchanged': 10 })]);
  await w.ctx.plOnOrderSaved('recORD1', 'intl');
  assert.deepStrictEqual(posts(w.net).map(b => [b.order_stop_rec, b.taken, b.given]), [['recS1', 10, 0]]);
  assert.deepStrictEqual(w.toasts, []);
});

test('empty «Pallets Exchanged» → every pallet of the stop, exactly as before', async () => {
  const w = world([stop('recS1', {})]);
  await w.ctx.plOnOrderSaved('recORD1', 'intl');
  assert.deepStrictEqual(posts(w.net).map(b => b.taken), [30]);
});

test('a pending loading of 30 becomes 10 when the form now says 10', async () => {
  const rows = [{ id: 7, status: 'pending', event_type: 'LOADING', order_stop_rec: 'recS1', order_rec: 'recORD1', taken: 30, given: 0 }];
  const w = world([stop('recS1', { 'Pallets Exchanged': 10 })], rows);
  await w.ctx.plOnOrderSaved('recORD1', 'intl');
  assert.deepStrictEqual(w.net.filter(c => c.m === 'PATCH').map(c => [c.url, c.body]), [['/pallets/movements/7', { taken: 10 }]]);
  assert.strictEqual(posts(w.net).length, 0);
  assert.strictEqual(rows[0].taken, 10);
});

test('a set 0 → no pending loading, and an old pending of that stop is removed', async () => {
  const rows = [{ id: 7, status: 'pending', event_type: 'LOADING', order_stop_rec: 'recS1', order_rec: 'recORD1', taken: 30, given: 0 }];
  const w = world([stop('recS1', { 'Pallets Exchanged': 0 }), stop('recS2', {})], rows);
  await w.ctx.plOnOrderSaved('recORD1', 'intl');
  assert.deepStrictEqual(posts(w.net).map(b => [b.order_stop_rec, b.taken]), [['recS2', 30]]);
  assert.deepStrictEqual(w.net.filter(c => c.m === 'DELETE').map(c => c.url), ['/pallets/movements/7']);
  assert.deepStrictEqual(rows.map(r => r.order_stop_rec), ['recS2']);
});

test('a CONFIRMED loading is never touched, whatever the form now says', async () => {
  const rows = [{ id: 7, status: 'confirmed', event_type: 'LOADING', order_stop_rec: 'recS1', order_rec: 'recORD1', taken: 30, given: 0 }];
  const w = world([stop('recS1', { 'Pallets Exchanged': 0 })], rows);
  await w.ctx.plOnOrderSaved('recORD1', 'intl');
  assert.deepStrictEqual(w.net.filter(c => c.m !== 'GET'), []);
});

test('more than the stop\'s pallets, a fraction or a negative is never trusted: all pallets, and it is SAID', async () => {
  for (const bad of [40, 10.5, -5]) {
    const w = world([stop('recS1', { 'Pallets Exchanged': bad })]);
    await w.ctx.plOnOrderSaved('recORD1', 'intl');
    assert.deepStrictEqual(posts(w.net).map(b => b.taken), [30], String(bad));
    assert.strictEqual(w.toasts.length, 1, String(bad));
    assert.match(w.toasts[0], /με ανταλλαγή \(-?[\d.]+\) δεν ταιριάζουν με τις 30/);
  }
});

test('plRecordStops (the week\'s «Λείπει καταγραφή»): a set 0 is skipped, the others are written with their exchanged pallets', async () => {
  const w = world([stop('recS1', { 'Pallets Exchanged': 0 }), stop('recS2', { 'Pallets Exchanged': 12 })]);
  const out = await w.ctx.plRecordStops('recORD1', 'LOADING');
  assert.deepStrictEqual({ ...out }, { created: 1, existed: 0, skipped: 1 });
  assert.deepStrictEqual(posts(w.net).map(b => [b.order_stop_rec, b.taken]), [['recS2', 12]]);
});

test('the «no exchange here» rule: only a set 0 — empty, missing or a number > 0 is not', () => {
  const { ctx } = world([]);
  const f = v => ctx._plNoExchangeStop(stop('x', v === undefined ? {} : { 'Pallets Exchanged': v }));
  assert.deepStrictEqual([f(0), f('0'), f(undefined), f(null), f(''), f(10)], [true, true, false, false, false, false]);
});
