// node --test tests/stock-kpis.test.js   (TZ=Europe/Athens)
// Stock lots Φ1 on the number screens (impact map 4/10):
//   E-16  a LOOSE piece (no truck, back in the warehouse, old dates) is stock — not counted by the
//         Dashboard «Αναμονή ανάθεσης», metrics.js unassigned/overdue/high-risk, the CEO «Κρίσιμα <48ω»
//         list or Nakis' critical «unassigned — delivery <48h» alert. A piece ON a truck still is work.
//   E-17  metrics.js money: pieces never invoiced; lots out of «ready»/«overdue» (Προς τιμολόγηση decides);
//         a lot's price still counts in «Ανεξόφλητο».
//   E-19  CEO cash card: «uninvoiced» count leaves pieces out.
//   E-22  Nakis' APP_KNOWLEDGE explains lot/piece and stays under its 5000-char cut.
//   E-28  metrics_audit: «Απόθεμα ράμπας Βέροιας».
// Real code throughout (whole files, or whole functions cut verbatim from the module, as
// tests/group-id-null.test.js does), the REAL OrdersStock and getLinkedId; reads are stubs.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
vm.runInThisContext(src('core/data-helpers.js'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersStock } = require('../core/orders-common.js');
const fn = (text, re, name) => { const m = text.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const plain = v => JSON.parse(JSON.stringify(v));

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOff = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };
const hoursOff = h => new Date(Date.now() + h * 3600e3).toISOString();

// A loose piece (back in stock), the same piece on a truck, an ordinary unassigned order.
const LOOSE = { id: 'recLOOSE00000001', fields: { Direction: 'Import', Status: 'Pending', 'Stock Lot': ['recSTOCKLOT1'], 'Loading DateTime': dayOff(-3), 'Delivery DateTime': dayOff(-1), 'Total Pallets': 4 } };
const LOOSE_SOON = { id: 'recLOOSE00000002', fields: { Direction: 'Import', Type: 'International', Status: 'Pending', 'Stock Lot': ['recSTOCKLOT1'], 'Loading DateTime': dayOff(0), 'Delivery DateTime': hoursOff(24), 'Total Pallets': 3 } };
const ONTRUCK = { id: 'recPIECET0000001', fields: { Direction: 'Import', Status: 'Assigned', 'Stock Lot': ['recSTOCKLOT1'], Truck: ['recT1'], 'Group ID': 'GI-X|recI1', 'Loading DateTime': dayOff(-3), 'Delivery DateTime': dayOff(-1) } };
const NORMAL = { id: 'recNORMAL0000001', fields: { Direction: 'Export', Type: 'International', Status: 'Pending', 'Loading DateTime': dayOff(-3), 'Delivery DateTime': dayOff(-1), 'Total Pallets': 10 } };
const NORMAL_SOON = { id: 'recNORMAL0000002', fields: { Direction: 'Export', Type: 'International', Status: 'Pending', 'Loading DateTime': dayOff(0), 'Delivery DateTime': hoursOff(24) } };
const clone = a => a.map(r => ({ id: r.id, createdTime: '2026-10-01T00:00:00.000Z', fields: JSON.parse(JSON.stringify(r.fields)) }));

function metricsLib() {
  const ctx = { OrdersStock, getLinkedId, FEATURES: { ORDER_SPLIT: true }, TmsWeek, localToday: () => dayOff(0), console };
  vm.runInNewContext(src('core/metrics.js') + '\nthis.metrics = metrics;', ctx);
  return ctx.metrics;
}

test('E-16 metrics.js: a loose piece is not unassigned / overdue / high-risk; a piece on a truck and an ordinary order still count', () => {
  const m = metricsLib();
  assert.strictEqual(m.unassignedOrders(clone([LOOSE, NORMAL, ONTRUCK])), 1);
  assert.deepStrictEqual(m.overdueDeliveries(clone([LOOSE, NORMAL, ONTRUCK])).map(r => r.id), ['recNORMAL0000001', 'recPIECET0000001']);
  assert.strictEqual(m.highRiskDeliveries(clone([LOOSE_SOON, NORMAL_SOON])), 1);
});

test('E-17 metrics.js money: pieces out of everything, lots out of ready/overdue, a lot still owed', () => {
  const m = metricsLib();
  const old = dayOff(-45);
  const lot = { id: 'recLOT000000312', fields: { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recSTOCKLOT1', 'Delivery DateTime': old } };
  const piece = { id: 'recPIECE0000001', fields: { Status: 'Delivered', 'Stock Lot': ['recSTOCKLOT1'], 'Delivery DateTime': old } };
  const ord = { id: 'recORD000000001', fields: { Status: 'Delivered', Price: 1200, 'Delivery DateTime': old } };
  assert.deepStrictEqual(m.overdueInvoices(clone([lot, piece, ord])).map(r => r.id), ['recORD000000001']);
  assert.strictEqual(m.revenueReadyToInvoice(clone([lot, piece, ord])), 1200);
  assert.strictEqual(m.outstandingBalance(clone([lot, piece, ord])), 4500);
});

test('E-16/E-17 metrics_audit asks for Stock Lot / Own Stock Lot / Group ID; E-28 label', () => {
  const s = src('modules/metrics_audit.js');
  const ordersFields = fn(s, /atGetAll\(TABLES\.ORDERS, \{ fields: \[[\s\S]*?\]\}/, 'metrics_audit ORDERS fields');
  for (const l of ["'Stock Lot'", "'Own Stock Lot'", "'Group ID'", "'Truck'", "'Partner'", "'Status'"]) assert.ok(ordersFields.includes(l), 'missing ' + l);
  assert.ok(s.includes("'Απόθεμα ράμπας Βέροιας'") && !s.includes("'Απόθεμα στην αποθήκη'"));
});

test('E-16 Dashboard «Αναμονή ανάθεσης»: the loose piece is out, the ordinary order is in', async () => {
  const seen = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, OrdersStock, getLinkedId, getLinkId: getLinkedId, FEATURES: { ORDER_SPLIT: true }, TmsWeek,
    localToday: () => dayOff(0), localTomorrow: () => dayOff(1), currentWeekNumber: () => TmsWeek.numOf(dayOff(0)),
    toLocalDate: raw => (raw ? ymd(new Date(String(raw).length === 10 ? raw + 'T12:00:00' : raw)) : ''),
    preloadReferenceData: async () => {}, getRefTrucks: () => [], getRefClients: () => [], getRefTrailers: () => [], getRefLocations: () => [],
    atGet: async (t) => (t === 'tblO' ? clone([LOOSE, NORMAL, ONTRUCK]) : []), atGetAll: async () => [],
    TABLES: { ORDERS: 'tblO', NAT_LOADS: 'tblNL', ORDER_STOPS: 'tblS' }, F: { STOP_PARENT_ORDER: 'Parent Order' },
    _ecOnTime: () => null, orderRoute: () => '', TRUCK_EXPIRY_NAMES: [], TRAILER_EXPIRY_FIELDS: [], haversineKm: () => 0,
    reportPageMetrics: (p, v) => { seen[p] = v; }, currentPage: 'elsewhere',   // stop before the DOM render
    document: { getElementById: () => ({ innerHTML: '' }) }, logError(e) { seen.err = e && e.message; },
  };
  ctx.window = ctx;
  vm.runInNewContext(src('core/metrics.js') + '\nthis.metrics = metrics;', ctx);
  vm.runInNewContext(src('modules/dashboard.js'), ctx);
  await ctx.renderDashboard();
  assert.ok(seen.dashboard, 'renderDashboard did not reach its metrics report: ' + seen.err);
  assert.strictEqual(seen.dashboard.unassignedOpen, 1);
});

test('E-16 CEO «Κρίσιμα <48ω»: the loose piece is out of the list handed to the KPI and the brief', async () => {
  const s = src('modules/ceo_dashboard.js');
  const loadAll = fn(s, /\n {2}async function _loadAll\(\) \{[\s\S]*?\n {2}\}\n/, '_loadAll');
  let rendered = null;
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, OrdersStock, getLinkedId, setTimeout, clearTimeout, Promise, Date,
    TABLES: { ORDERS: 'tblO', DRIVERS: 'tblD', TRIP_COSTS: 'tblTC', MAINT_HISTORY: 'tblMH' },
    _period: 'month', _loadId: 0, _getPeriodRange: () => ({ start: new Date(), end: new Date() }), _iso: d => ymd(d),
    document: { getElementById: () => null }, safeFetch: f => f(), didFail: () => false, logError() {},
    atGet: async (t, formula) => (t === 'tblO' && /IS_BEFORE\(\{Delivery DateTime\}/.test(formula) ? clone([LOOSE, NORMAL, ONTRUCK]) : []),
    _renderAll: d => { rendered = d; },
  };
  vm.runInNewContext('var _loadId = 0, _period = "month";\n' + loadAll + '\nthis._loadAll = _loadAll;', ctx);
  await ctx._loadAll();
  assert.ok(rendered, '_loadAll did not render');
  assert.deepStrictEqual(rendered.highRiskOrders.map(r => r.id), ['recNORMAL0000001', 'recPIECET0000001']);
});

test('E-19 CEO cash card: a delivered piece is not «uninvoiced»', () => {
  const s = src('modules/ceo_dashboard.js');
  const cash = fn(s, /\n {2}function _calcCashMetrics\(allOrders\) \{[\s\S]*?\n {2}\}\n/, '_calcCashMetrics');
  const ctx = { OrdersStock, getLinkedId };
  vm.runInNewContext(cash + '\nthis._calcCashMetrics = _calcCashMetrics;', ctx);
  const r = ctx._calcCashMetrics(clone([
    { id: 'recLOT', fields: { Status: 'Delivered', Price: 3300, 'Own Stock Lot': 'recSTOCKLOT1' } },
    { id: 'recPC', fields: { Status: 'Delivered', 'Stock Lot': ['recSTOCKLOT1'] } },
    { id: 'recORD', fields: { Status: 'Delivered', Price: 1000 } },
  ]));
  assert.deepStrictEqual(plain(r), { deliveredRev: 4300, uninvoicedCount: 2, uninvoicedRev: 4300 });
});

test('E-16 Nakis: «unassigned — delivery <48h» counts the ordinary order, not the loose piece; the read asks for the labels', async () => {
  const s = src('core/ai-chat.js');
  const obs = fn(s, /async function _aicRunObserver\(\) \{[\s\S]*?\n\}\n/, '_aicRunObserver');
  const reads = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, OrdersStock, getLinkedId, Date, Math, Promise,
    AiChat: {}, _canSee: sec => sec === 'planning', TABLES: { ORDERS: 'tblO' },
    localToday: () => dayOff(0), toLocalDate: raw => ymd(new Date(raw)), orderDelName: () => 'X', currentWeekNumber: () => 40,
    _nakisGetNotifs: () => [], logError() {},
    atGetAll: async (t, opts) => { reads.push(opts); return /\{Truck\}=BLANK\(\)/.test(opts.filterByFormula) ? clone([LOOSE_SOON, NORMAL_SOON]) : []; },
  };
  vm.runInNewContext(obs + '\nthis._aicRunObserver = _aicRunObserver;', ctx);
  await ctx._aicRunObserver();
  const crit = ctx.AiChat.suggestions.find(a => a.type === 'unassigned_critical');
  assert.ok(crit && /^1 unassigned/.test(crit.title), JSON.stringify(ctx.AiChat.suggestions));
  for (const l of ['Stock Lot', 'Partner', 'Group ID', 'Status']) assert.ok(reads[0].fields.includes(l), 'missing ' + l);
});

test('E-22 APP_KNOWLEDGE explains lot / piece and is not truncated', () => {
  const k = fn(src('core/ai-chat.js'), /const APP_KNOWLEDGE = `[\s\S]*?`;/, 'APP_KNOWLEDGE');
  assert.ok(/Delivered» σε παρτίδα σημαίνει «στην αποθήκη», ΟΧΙ παράδοση στον πελάτη/.test(k));
  assert.ok(/δεν έχει δική του τιμή — τιμολογείται η παρτίδα/.test(k));
  const max = +fn(src('core/ai-chat.js'), /_MAX_APP_KNOWLEDGE_CHARS = \d+/, 'max').split('= ')[1];
  assert.ok(k.length - 'const APP_KNOWLEDGE = ``;'.length < max, 'APP_KNOWLEDGE over the cut: ' + k.length);
});
