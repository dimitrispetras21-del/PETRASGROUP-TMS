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
  const net = [], toasts = [], durations = [];
  // opt.rows: a stateful /pallets/movements (GET by stop, POST, DELETE of a
  // pending row, as the Worker does); opt.delay: ms before a GET answers (the
  // window two overlapping calls race in); opt.failPost: { times, lands } —
  // that many POSTs fail, after writing the row when `lands` (a lost answer).
  const rows = opt.rows || null; let seq = 100;
  const res = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, FEATURES: { ORDER_SPLIT: true },
    TABLES: { ORDERS: 'tblO', NAT_ORDERS: 'tblN' },
    F: { STOP_PARENT_ORDER: 'Parent Order', STOP_PARENT_NAT: 'Parent Nat', STOP_TYPE: 'Stop Type', STOP_PALLETS: 'Pallets', STOP_LOCATION: 'Location', STOP_DATETIME: 'DateTime' },
    PROXY_URL: 'https://w.example', localStorage: { getItem: () => null },
    atGetOne: async () => rec,
    stopsLoad: async () => (opt.stops || [{ id: 'recSTOPU1', fields: { 'Stop Type': 'Unloading', Pallets: 33, Location: ['recWH1'] } }]),
    showErrorToast: (m, t, d) => { toasts.push((t || 'error') + ': ' + m); durations.push(d); },
    fetch: async (url, opts) => {
      const u = String(url).replace('https://w.example', '');
      const m = (opts && opts.method) || 'GET';
      net.push({ m, url: u, body: opts && opts.body ? JSON.parse(opts.body) : null });
      if (rows) {
        if (m === 'GET') {
          const st = new URL('https://w.example' + u).searchParams.get('order_stop_rec');
          const out = res({ records: rows.filter(r => !st || r.order_stop_rec === st).map(r => ({ ...r })) });
          return opt.delay ? new Promise(r => setTimeout(() => r(out), opt.delay)) : out;
        }
        if (m === 'POST') {
          const row = { id: ++seq, status: 'pending', ...JSON.parse(opts.body) };
          if (opt.failPost && opt.failPost.times > 0) {
            opt.failPost.times--;
            if (opt.failPost.lands) rows.push(row);
            return res({ error: 'Η σύνδεση διακόπηκε' }, false);
          }
          rows.push(row);
          return res({ record: row });
        }
        if (m === 'DELETE') {
          const i = rows.findIndex(r => r.id === +u.split('/').pop() && r.status === 'pending');
          if (i < 0) return res({ error: 'Confirmed movements are never deleted — use reverse' }, false);
          rows.splice(i, 1);
          return res({ deleted: true });
        }
      }
      const records = (opt.existing && m === 'GET') ? opt.existing(u) : [];
      return res({ records });
    },
  };
  ctx.window = ctx;
  // plOnLotIntakeUndone is new in round 3 (X3): exported only when present, so
  // on the base commit its own tests fail and the others still run.
  vm.runInNewContext(SRC + '\nthis.plOnDelivered = plOnDelivered; this.plOnIntlPartnerAssigned = plOnIntlPartnerAssigned;'
    + ' this.plOnLotIntakeUndone = typeof plOnLotIntakeUndone === "function" ? plOnLotIntakeUndone : undefined;', ctx);
  return { ctx, net, toasts, durations, rows };
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
  const { ctx, net, toasts } = world({ id: 'recLOT1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'], 'Own Stock Lot': 'recSTOCKLOT1', 'Order No': 312 } });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m === 'POST'), [], JSON.stringify(net));
  assert.strictEqual(toasts.length, 1, JSON.stringify(toasts));
  // round 3 X1 (critic-1 R2-1): the line names the lot and its pallets
  assert.strictEqual(toasts[0], 'warn: Παλέτες αποθήκης #312 (33p): χωρίς συνεργάτη — καταχώρησέ τις στο Ισοζύγιο');
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

// ── Round 3 (fix list X1–X3) ────────────────────────────────────────────────
const NO = { 'Order No': 312 };
const PALLET_TOAST_MS = 10000;

test('X1 (R2-1 / S5-09): the own-truck line names the lot and pallets, one prefix, the same duration as a feeder failure', async () => {
  const own = world({ id: 'recLOT1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'], 'Own Stock Lot': 'recSTOCKLOT1', ...NO } });
  await own.ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(own.toasts, ['warn: Παλέτες αποθήκης #312 (33p): χωρίς συνεργάτη — καταχώρησέ τις στο Ισοζύγιο']);
  const fail = world({ id: 'recORD1', fields: { 'Pallet Exchange': true, Client: ['recCLIA'] } }, { rows: [], failPost: { times: 1 } });
  await fail.ctx.plOnDelivered('recORD1');
  assert.strictEqual(fail.toasts.length, 1, JSON.stringify(fail.toasts));
  assert.deepStrictEqual([own.durations[0], fail.durations[0]], [PALLET_TOAST_MS, PALLET_TOAST_MS], 'one weight for one instruction');
});

test('X1 (R2-8): no warehouse stop / 0 pallets on it are SAID with the same prefix — never a silent return', async () => {
  const noStop = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO, 'Total Pallets': 33 } }, { stops: [{ id: 'recSTOPL1', fields: { 'Stop Type': 'Loading', Pallets: 33 } }] });
  await noStop.ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(noStop.toasts, ['warn: Παλέτες αποθήκης #312 (33p): χωρίς σημείο αποθήκης — καταχώρησέ τις στο Ισοζύγιο']);
  const zero = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { stops: [{ id: 'recSTOPU1', fields: { 'Stop Type': 'Unloading', Pallets: 0, Location: ['recWH1'] } }] });
  await zero.ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(zero.toasts, ['warn: Παλέτες αποθήκης #312: 0 παλέτες στο σημείο αποθήκης — καταχώρησέ τις στο Ισοζύγιο']);
  for (const w of [noStop, zero]) assert.deepStrictEqual(w.net.filter(c => c.m !== 'GET'), []);
});

test('X1 (R2-8): a failed intake write says «κίνηση παλετών αποθήκης», never «εγγραφές παράδοσης»', async () => {
  const { ctx, toasts, rows } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows: [], failPost: { times: 1, lands: false } });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(toasts, ['warn: Παλέτες: απέτυχε κίνηση παλετών αποθήκης — καταχώρησε χειροκίνητα από το Ισοζύγιο']);
  assert.deepStrictEqual(rows, []);
});

test('X2 (Σ2-07): a double click — two overlapping intakes of one lot write ONE pending movement', async () => {
  const { ctx, net, rows } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows: [], delay: 20 });
  await Promise.all([ctx.plOnDelivered('recLOT1'), ctx.plOnDelivered('recLOT1')]);
  assert.strictEqual(net.filter(c => c.m === 'POST').length, 1, JSON.stringify(net));
  assert.strictEqual(rows.length, 1);
});

test('X2 (Σ2-07): a POST whose answer was lost but which WROTE the row → re-checked by stop: nothing said, nothing twice', async () => {
  const { ctx, net, toasts, rows } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows: [], failPost: { times: 1, lands: true } });
  await ctx.plOnDelivered('recLOT1');
  assert.deepStrictEqual(toasts, [], 'a «failed — enter it by hand» here makes the accountant write a second one');
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(net.map(c => c.m + ' ' + c.url.split('?')[0]), ['GET /pallets/movements', 'POST /pallets/movements', 'GET /pallets/movements']);
});

test('X2: a failed intake releases the guard — the next click writes it', async () => {
  const { ctx, toasts, rows } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows: [], failPost: { times: 1, lands: false } });
  await ctx.plOnDelivered('recLOT1');
  assert.strictEqual(toasts.length, 1);
  await ctx.plOnDelivered('recLOT1');
  assert.strictEqual(rows.length, 1, 'the guard stayed shut after the failure');
});

const pk = (id, status, extra = {}) => ({ id, status, event_type: 'PARTNER_PICKUP', given: 33, taken: 0, order_stop_rec: 'recSTOPU1', order_rec: 'recLOT1', ...extra });

test('X3 (R2-4): undo of the intake deletes the PENDING intake movement of the lot\'s stop — and nothing else', async () => {
  const rows = [pk(9, 'pending'), { id: 8, status: 'confirmed', event_type: 'DELIVERY', given: 33, taken: 33, order_stop_rec: 'recSTOPU1' }, pk(7, 'pending', { order_stop_rec: 'recSTOPX' })];
  const { ctx, net, toasts } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows });
  await ctx.plOnLotIntakeUndone('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m !== 'GET').map(c => c.m + ' ' + c.url), ['DELETE /pallets/movements/9']);
  assert.deepStrictEqual(rows.map(r => r.id), [8, 7]);
  assert.deepStrictEqual(toasts, []);
});

test('X3 (R2-4): a CONFIRMED intake is never deleted — one line sends the reversal to the Ισοζύγιο', async () => {
  const rows = [pk(9, 'confirmed')];
  const { ctx, net, toasts } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows });
  await ctx.plOnLotIntakeUndone('recLOT1');
  assert.deepStrictEqual(net.filter(c => c.m !== 'GET'), []);
  assert.deepStrictEqual(toasts, ['warn: Παλέτες αποθήκης #312 (33p): η κίνηση παλετών επιβεβαιώθηκε — αντιλογισμός από το Ισοζύγιο']);
  assert.strictEqual(rows.length, 1);
});

test('X3: undo pressed while the intake is still writing waits for it, then removes it', async () => {
  const rows = [];
  const { ctx, net } = world({ id: 'recLOT1', fields: { ...LOT_P, ...NO } }, { rows, delay: 20 });
  const intake = ctx.plOnDelivered('recLOT1');
  await new Promise(r => setTimeout(r, 0));   // the intake has started (its GET is in flight)
  await Promise.all([intake, ctx.plOnLotIntakeUndone('recLOT1')]);
  assert.deepStrictEqual(rows, [], 'the intake landed after the undo read and stayed behind');
  assert.deepStrictEqual(net.filter(c => c.m !== 'GET').map(c => c.m), ['POST', 'DELETE']);
});
