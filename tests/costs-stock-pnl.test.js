// node --test tests/costs-stock-pnl.test.js   (TZ=Europe/Athens)
// TRIP PnL card × stock lots (057, Ε1; impact map 4/10 E-15 / D-11 / D-12). The REAL modules/costs.js
// runs in a vm with the REAL OrdersStock; /costs/* and the page helpers are stubs.
//   lot RT (partner, revenue = partner rate 300, lot Price 3.300): no «ανεξήγητη διαφορά», label + €300
//   lot RT on our own truck (round 2 #1, owner 4/10): €0 «δικό μας φορτηγό — μόνο τα κομμάτια»
//   VS piece (owner Q3 4/10): the card shows the DB's prorated VS share, no front formula
//   owned RT with a VS export + a piece: the piece shows its allocation and the VS note is −850, not −(850−alloc)
//   allocation not read: «ο επιμερισμός δεν διαβάστηκε», no diff note at all
//   ctStockLoad: no lot/piece on any card → no request (before 057 / the stock Worker = today's page)
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersStock } = require('../core/orders-common.js');
const SRC = fs.readFileSync(path.join(ROOT, 'modules', 'costs.js'), 'utf8');

const LOT = { id: 'recLOT0000000312', fields: { Direction: 'Import', Price: 3300, 'Order No': 312, 'Own Stock Lot': 'recSTOCKLOT1', Client: ['recCLIA'], 'Delivery DateTime': '2026-10-02' } };
const PIECE = { id: 'recPIECE00000001', fields: { Direction: 'Import', 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl', Client: ['recCLIA'], 'Delivery DateTime': '2026-10-06' } };
const EXPVS = { id: 'recEXPORT0000001', fields: { Direction: 'Export', Price: 2000, 'Veroia Switch': true, Client: ['recCLIB'], 'Loading DateTime': '2026-10-03' } };
// stock_v_lot_money columns since round 2 #1 (057): partner_cost / warehouse_charge / charge_total.
const MONEY = { lots: [{ lot_rec: 'recSTOCKLOT1', allocation_status: 'ok', partner_cost: 300, warehouse_charge: null, charge_total: 300, net: 3000 }], pieces: [{ lot_rec: 'recSTOCKLOT1', piece_rec: 'recPIECE00000001', amount: 454.55 }] };

function load(fetchImpl) {
  const net = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, OrdersStock, getLinkedId, Number, Math, Object, JSON, String,
    PROXY_URL: 'https://w.example', localStorage: { getItem: () => null },
    icon: () => '', fmtDate: d => String(d || ''), fhClientName: () => 'Πελάτης', orderLoadName: () => 'Αποθήκη Χ', orderDelName: () => 'Προορισμός', orderLocCountry: () => 'GR',
    fetch: async (url) => { net.push(String(url).replace('https://w.example', '')); return fetchImpl ? fetchImpl(String(url)) : { ok: true, status: 200, json: async () => MONEY }; },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\nthis._ct = _ct; this.ctCardHtml = ctCardHtml; this.ctStockLoad = typeof ctStockLoad === "function" ? ctStockLoad : null;', ctx);
  return { ctx, net };
}
function setCard(ctx, trip, legs) {
  ctx._ct.rts = { [trip.id]: { id: trip.id, ct_rt_legs: legs.map(([pg, o, dir]) => ({ order_id: pg, direction: dir })) } };
  ctx._ct.orderByPg = Object.fromEntries(legs.map(([pg, o]) => [pg, { id: o.id, fields: JSON.parse(JSON.stringify(o.fields)) }]));
  ctx._ct.linesByRt = {}; ctx._ct.palletGate = {}; ctx._ct.lookups = { trucks: [], drivers: [], partners: [] };
}
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('D-11/E-15: the lot\'s partner RT — no «ανεξήγητη διαφορά», the leg says what it earns', async () => {
  const { ctx } = load();
  const t = { id: 1, code: 'RT-1', trip_type: 'PARTNER', partner_id: 9, revenue: 300, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[10, LOT, 'IMPORT']]);
  if (ctx.ctStockLoad) await ctx.ctStockLoad();   // absent on the base commit → the card as it was
  const h = text(ctx.ctCardHtml(t));
  assert.ok(!/ανεξήγητη διαφορά/.test(h), h);
  assert.match(h, /€300/);
  assert.ok(!/€3\.300/.test(h), 'the lot\'s client price is not this RT\'s revenue: ' + h);
});

// Round 1 O11 (critic-5 S5-10): the lot's amount line ≤ 6 words, the why in
// the tooltip; ONE name for the one amount. Round 2 #1: that amount is the
// partner's rate — «κόμιστρο συνεργάτη», as on every partner RT; «κόστος
// αποθήκης» would collide with the owner's separate «Χρέωση αποθήκης».
test('O11 / round 2: lot leg «· παρτίδα #312 · κόμιστρο συνεργάτη» (≤ 6 words, why in title); one name for the amount', async () => {
  const { ctx } = load();
  const t = { id: 1, code: 'RT-1', trip_type: 'PARTNER', partner_id: 9, revenue: 300, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[10, LOT, 'IMPORT']]);
  await ctx.ctStockLoad();
  const raw = ctx.ctCardHtml(t), h = text(raw);
  const line = (h.match(/· (παρτίδα #312[^€]*?)(?= \d|$| 2026)/) || [])[1] || '';
  assert.strictEqual(line.trim(), 'παρτίδα #312 · κόμιστρο συνεργάτη', h);
  assert.ok(line.trim().split(/\s+/).filter(w => w !== '·').length <= 6);
  assert.match(raw, /title="Το έσοδο του σκέλους της παρτίδας = το κόμιστρο του συνεργάτη/);
  assert.ok(!/κόστος αποθήκης/.test(h) && /κόμιστρο συνεργάτη — καύσιμα/.test(h), 'one name for one amount: ' + h);
  // an ordinary partner RT keeps its own word
  const { ctx: c2 } = load();
  setCard(c2, t, [[11, EXPVS, 'EXPORT']]);
  await c2.ctStockLoad();
  assert.match(text(c2.ctCardHtml(t)), /κόμιστρο συνεργάτη — καύσιμα/);
});

test('D-12/E-15: a piece leg shows its allocation; with a VS export the VS note is the full 850', async () => {
  const { ctx } = load();
  const t = { id: 2, code: 'RT-2', trip_type: 'OWNED', truck_id: 1, revenue: 2000 - 850 + 454.55, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[20, EXPVS, 'EXPORT'], [21, PIECE, 'IMPORT']]);
  if (ctx.ctStockLoad) await ctx.ctStockLoad();   // absent on the base commit → the card as it was
  const h = text(ctx.ctCardHtml(t));
  assert.match(h, /από παρτίδα #312/);
  assert.match(h, /€455/);
  assert.match(h, /Veroia Switch: −€850 /, h);
  assert.ok(!/ανεξήγητη/.test(h), h);
});

test('allocation not read: «ο επιμερισμός δεν διαβάστηκε», no diff note (unknown is not «ανεξήγητη»)', async () => {
  const { ctx } = load(() => ({ ok: false, status: 500, json: async () => ({ error: 'Ο επιμερισμός δεν διαβάστηκε' }) }));
  const t = { id: 2, code: 'RT-2', trip_type: 'OWNED', truck_id: 1, revenue: 1604.55, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[20, EXPVS, 'EXPORT'], [21, PIECE, 'IMPORT']]);
  if (ctx.ctStockLoad) await ctx.ctStockLoad();   // absent on the base commit → the card as it was
  const h = text(ctx.ctCardHtml(t));
  assert.match(h, /παρτίδα #312 — ο επιμερισμός δεν διαβάστηκε/);
  assert.ok(!/Veroia Switch: −|ανεξήγητη/.test(h), h);
});

test('no lot/piece on any card (always so before 057 + the stock Worker): no /costs/stock-lots request', async () => {
  const { ctx, net } = load();
  const t = { id: 3, code: 'RT-3', trip_type: 'OWNED', truck_id: 1, revenue: 1150, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[30, EXPVS, 'EXPORT']]);
  if (ctx.ctStockLoad) await ctx.ctStockLoad();   // absent on the base commit → the card as it was
  assert.deepStrictEqual(net, []);
  assert.match(text(ctx.ctCardHtml(t)), /Veroia Switch: −€850 /);
});

test('the lot without any charge (no partner, no «Χρέωση αποθήκης»): the DB keeps the whole price on its leg — so does the card', async () => {
  const { ctx } = load(async () => ({ ok: true, status: 200, json: async () => ({ lots: [{ lot_rec: 'recSTOCKLOT1', allocation_status: 'no_charge', partner_cost: null, warehouse_charge: null, charge_total: null }], pieces: [] }) }));
  const t = { id: 1, code: 'RT-1', trip_type: 'PARTNER', partner_id: 9, revenue: 3300, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[10, LOT, 'IMPORT']]);
  if (ctx.ctStockLoad) await ctx.ctStockLoad();   // absent on the base commit → the card as it was
  const h = text(ctx.ctCardHtml(t));
  assert.match(h, /χωρίς επιμερισμό \(χωρίς χρέωση αποθήκης\): όλο το έσοδο εδώ/);
  assert.match(h, /€3\.300/);
  assert.ok(!/ανεξήγητη/.test(h), h);
});

// Round 2 #1 (owner 4/10): the RT that carried the lot INTO the warehouse on
// our own truck earns 0 (stock_v_rt_amounts = coalesce(partner_cost, 0)) —
// «μόνο τα κομμάτια», an owner decision, not a gap; the client price never
// shows there and the legs check finds no «ανεξήγητη διαφορά».
test('round 2: the lot on our own truck — €0, «παρτίδα #312 · δικό μας φορτηγό — μόνο τα κομμάτια»', async () => {
  const own = { lots: [{ lot_rec: 'recSTOCKLOT1', allocation_status: 'ok', partner_cost: null, warehouse_charge: 120, charge_total: 120, net: 3180 }], pieces: [] };
  const { ctx } = load(async () => ({ ok: true, status: 200, json: async () => own }));
  const t = { id: 4, code: 'RT-4', trip_type: 'OWNED', truck_id: 1, revenue: 0, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[10, LOT, 'EXPORT']]);
  await ctx.ctStockLoad();
  const raw = ctx.ctCardHtml(t), h = text(raw);
  assert.match(h, /· παρτίδα #312 · δικό μας φορτηγό — μόνο τα κομμάτια/, h);
  assert.match(raw, /<span class="lamt ct-mono">€0<\/span>/, raw);
  assert.ok(!/€3\.300|ανεξήγητη|κόμιστρο συνεργάτη|κόστος αποθήκης/.test(h), h);
});

// Owner Q3 (4/10, CONTRACT addendum A): a VS piece gives up round(X·min(p, F)/F, 2)
// — the DB computes it (ct_v_rt_revenue). The card has NO copy of that formula:
// its VS line is the difference between the legs and the RT revenue, so 15/33
// of 650 shows as −€295, not −€650 (and not «ανεξήγητη»).
test('addendum A: a VS piece — the card shows the DB\'s prorated VS share (−€295 for 15/33 of 650)', async () => {
  const { ctx } = load();
  const vsPiece = { id: PIECE.id, fields: Object.assign({}, PIECE.fields, { 'Veroia Switch': true, 'Total Pallets': 15 }) };
  const t = { id: 5, code: 'RT-5', trip_type: 'OWNED', truck_id: 1, revenue: 454.55 - 295.45, status: 'closed', date_start: '2026-10-01' };
  setCard(ctx, t, [[21, vsPiece, 'IMPORT']]);
  await ctx.ctStockLoad();
  const h = text(ctx.ctCardHtml(t));
  assert.match(h, /Veroia Switch: −€295 /, h);
  assert.ok(!/−€650|ανεξήγητη/.test(h), h);
});

// Review P3 (4/10): partner_cost is NULL also when a PARTNER carried the lot and
// no rate was entered — the line must not claim «δικό μας φορτηγό» then. The
// wording follows the source order's own Partner; the amount stays 0.
test('round 2: partner_cost NULL on a partner-carried lot — €0, «χωρίς κόμιστρο συνεργάτη», never «δικό μας»', async () => {
  const own = { lots: [{ lot_rec: 'recSTOCKLOT1', allocation_status: 'ok', partner_cost: null, warehouse_charge: 120, charge_total: 120, net: 3180 }], pieces: [] };
  const { ctx } = load(async () => ({ ok: true, status: 200, json: async () => own }));
  const t = { id: 6, code: 'RT-6', trip_type: 'PARTNER', partner_id: 9, revenue: 0, status: 'closed', date_start: '2026-10-01' };
  const lotByPartner = { id: LOT.id, fields: Object.assign({}, LOT.fields, { 'Is Partner Trip': true, Partner: ['recPARTNER0001'] }) };
  setCard(ctx, t, [[10, lotByPartner, 'EXPORT']]);
  await ctx.ctStockLoad();
  const raw = ctx.ctCardHtml(t), h = text(raw);
  assert.match(h, /· παρτίδα #312 · χωρίς κόμιστρο συνεργάτη — μόνο τα κομμάτια/, h);
  assert.match(raw, /<span class="lamt ct-mono">€0<\/span>/, raw);
  assert.ok(!/δικό μας φορτηγό|€3\.300|ανεξήγητη/.test(h), h);
});
