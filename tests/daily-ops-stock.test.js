// node --test tests/daily-ops-stock.test.js   (TZ=Europe/Athens)
// Stock lots Φ1 on the Ημερήσιο (impact map 4/10 C-01, C-04, C-05). The REAL
// modules/daily_ops.js runs in a vm (the whole IIFE, as the browser loads it)
// with the REAL OrdersStock (core/orders-common.js) and getLinkedId
// (core/data-helpers.js); the facade (atGetAll/atSafePatch) and the page
// helpers are in-memory stubs. Nothing is sent anywhere.
//   C-01 a LOT's delivery row says «→ ΑΠΟΘΗΚΗ», «Παραλαβή αποθήκης», done
//        «Στην αποθήκη ✓», toast «Στην αποθήκη ✓», and is NOT in ΠΑΡΑΔΟΣΕΙΣ x/y
//   C-04 a PIECE's loading row carries «ΑΠ · 5p · παρτίδα #312»
//   C-05 a LOOSE piece is in neither overdue zone (the Weekly shelf counts it)
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
const SRC = fs.readFileSync(path.join(ROOT, 'modules', 'daily_ops.js'), 'utf8');

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOff = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = dayOff(0);

// Today's day window, the overdue deliveries and the overdue loadings — each
// facade query answers with its own fixture list (the filter itself is the
// Worker's job; what is under test is what the screen does with the answer).
function fixtures() {
  const lot = { id: 'recLOT0000000312', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-1), 'Delivery DateTime': TODAY, Status: 'Assigned', Partner: ['recPRT1'], 'Is Partner Trip': true, 'Total Pallets': 33, 'Pallet Exchange': true, 'Own Stock Lot': 'recSTOCKLOT1' } };
  const imp = { id: 'recIMP0000000001', fields: { Direction: 'Import', Client: ['recCLIB'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': TODAY, Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 20 } };
  const piece = { id: 'recPC10000000001', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(2), Status: 'Assigned', Truck: ['recTRK1'], 'Group ID': 'GI-X|recIMP0000000002', 'Total Pallets': 5, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl' } };
  // back in stock: no truck, no group, Pending, the dates of the truck it left
  const loose1 = { id: 'recPC20000000002', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-3), 'Delivery DateTime': dayOff(-2), Status: 'Pending', 'Total Pallets': 4, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  const loose2 = { id: 'recPC30000000003', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Pending', 'Total Pallets': 6, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  // an ordinary order that did not load — must stay in the zone
  const old = { id: 'recOLD0000000001', fields: { Direction: 'Export', Client: ['recCLIB'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Pending', 'Total Pallets': 12 } };
  // a piece ON a truck that did not load — not loose, stays
  const onTruck = { id: 'recPC40000000004', fields: { Direction: 'Import', Client: ['recCLIA'], 'Loading DateTime': dayOff(-2), 'Delivery DateTime': dayOff(1), Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 3, 'Stock Lot': ['recSTOCKLOT1'], 'Stock Lot Order No': 312 } };
  return { day: [lot, imp, piece], ov: [loose1], ovL: [loose1, loose2, old, onTruck] };
}

function load() {
  const fx = fixtures();
  const S = { calls: [], patches: [], toasts: [], content: { innerHTML: '' } };
  const clone = a => a.map(r => ({ id: r.id, fields: JSON.parse(JSON.stringify(r.fields)) }));
  const names = { recCLIA: 'Πελάτης Α', recCLIB: 'Πελάτης Β', recTRK1: 'ΑΒΓ-1234', recPRT1: 'Συνεργάτης Α' };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    TABLES: { ORDERS: 'tblO', ORDER_STOPS: 'tblS' }, F: { STOP_PARENT_ORDER: 'Parent Order', STOP_TYPE: 'Stop Type', STOP_NUMBER: 'Stop Number', STOP_LOCATION: 'Location' },
    FEATURES: {}, localToday: () => TODAY, localTomorrow: () => dayOff(1), _plus: (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); },
    toLocalDate: raw => { if (!raw) return ''; const d = new Date(String(raw).length === 10 ? raw + 'T12:00:00' : raw); return isNaN(d) ? '' : ymd(d); },
    showLoading: () => '', preloadReferenceData: async () => {}, getRefTrucks: () => [], getRefDrivers: () => [], getRefLocations: () => [], getRefClients: () => [], getRefTrailers: () => [],
    getLocationName: id => (id ? 'Τοποθεσία ' + id : ''), getClientName: id => names[id] || '', getTruckPlate: id => names[id] || '', getDriverName: () => '', getPartnerName: id => names[id] || '',
    isPreorder: () => false, preorderCounterHtml: () => '', preorderChipHtml: () => '', preorderCountryText: () => '', preorderLevel: () => '',
    can: () => 'full', confirmAction: async () => true, fmtDate: d => d,
    toast: (m, t) => S.toasts.push(m),
    atSafePatch: async (_t, id, f) => { S.patches.push({ id, f }); return { id, fields: f }; },
    paSyncStatus: async () => null,
    atGetAll: async (table, opts) => {
      const fm = (opts && opts.filterByFormula) || '';
      S.calls.push({ table, fm, fields: (opts && opts.fields) || null });
      if (table !== 'tblO') return [];
      if (fm.startsWith('OR(IS_SAME(')) return clone(fx.day);
      if (fm.startsWith('AND(IS_BEFORE({Delivery DateTime}')) return clone(fx.ov);
      if (fm.startsWith('AND(IS_BEFORE({Loading DateTime}')) return clone(fx.ovL);
      return [];   // pair-inherit ({Matched Import ID}=…)
    },
    document: { getElementById: id => (id === 'content' ? S.content : null), querySelectorAll: () => [], querySelector: () => null, removeEventListener() {} },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { ctx, S };
}
const rowOf = (html, id) => { const m = html.match(new RegExp(`<tr id="r_${id}"[\\s\\S]*?</tr>`)); return m ? m[0] : ''; };
const zrowOf = (html, id) => { const m = html.match(new RegExp(`<div class="do-zrow[^"]*" id="r_${id}"[\\s\\S]*?</div>`)); return m ? m[0] : ''; };

test('OPS_FIELDS asks for the stock labels (else the predicates are silently false)', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const day = S.calls.find(c => c.fm.startsWith('OR(IS_SAME('));
  for (const l of ['Own Stock Lot', 'Stock Lot', 'Stock Lot Order No', 'Stock Lot Source', 'Group ID', 'Truck', 'Partner', 'Status'])
    assert.ok(day.fields.includes(l), 'missing ' + l);
});

test('C-05: a loose piece is in neither overdue zone; an ordinary order and a piece on a truck stay', async () => {
  const { ctx } = load();
  await ctx.renderDailyOps();
  assert.deepStrictEqual(ctx.OPS.overdue.map(r => r.id), []);
  assert.deepStrictEqual(ctx.OPS.overdueLoads.map(r => r.id).sort(), ['recOLD0000000001', 'recPC40000000004']);
  assert.ok(!/recPC20000000002|recPC30000000003/.test(ctx.document.getElementById('content').innerHTML), 'a loose piece is drawn');
});

test('C-01: the lot intake row — «→ ΑΠΟΘΗΚΗ», «Παραλαβή αποθήκης», not in ΠΑΡΑΔΟΣΕΙΣ x/y', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const html = S.content.innerHTML;
  const lot = rowOf(html, 'recLOT0000000312'), imp = rowOf(html, 'recIMP0000000001');
  assert.ok(/→ ΑΠΟΘΗΚΗ/.test(lot), lot);
  assert.ok(/>Παραλαβή αποθήκης</.test(lot) && !/>Παραδόθηκε</.test(lot), lot);
  assert.ok(/>Παραδόθηκε</.test(imp) && !/ΑΠΟΘΗΚΗ|Παραλαβή αποθήκης/.test(imp), imp);
  // ΠΑΡΑΔΟΣΕΙΣ counts the client delivery only: 0 / 1, not 0 / 2
  assert.match(html, /ΠΑΡΑΔΟΣΕΙΣ<\/div>\s*<div class="do-kpi-v">0 <small>\/ 1 δηλωμένη<\/small>/);
});

test('C-01: declared lot reads «Στην αποθήκη ✓», the toast says so too, an ordinary delivery is unchanged', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  await ctx._opsDel('recLOT0000000312', 'On Time');
  assert.deepStrictEqual(S.patches[0].f['Status'], 'Delivered');            // the same write: Delivered = intake
  assert.strictEqual(S.toasts.slice(-1)[0], 'Στην αποθήκη ✓');
  assert.ok(/Στην αποθήκη ✓/.test(rowOf(S.content.innerHTML, 'recLOT0000000312')));
  await ctx._opsDel('recIMP0000000001', 'On Time');
  assert.strictEqual(S.toasts.slice(-1)[0], 'Παραδόθηκε ✓');
  assert.ok(/Παραδόθηκε ✓/.test(rowOf(S.content.innerHTML, 'recIMP0000000001')));
});

test('C-01: a lot in the overdue deliveries zone carries the tag and the intake button', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  const lot = fixtures().day[0];
  ctx.OPS.overdue = [{ id: lot.id, fields: Object.assign({}, lot.fields, { 'Delivery DateTime': dayOff(-1) }) }];
  ctx._opsSetFilter('q', '');
  const z = zrowOf(S.content.innerHTML, lot.id);
  assert.ok(/→ ΑΠΟΘΗΚΗ/.test(z) && /Παραλαβή αποθήκης/.test(S.content.innerHTML), z);
});

test('C-04: the piece loading row says «ΑΠ · 5p · παρτίδα #312»; an ordinary loading row says nothing of it', async () => {
  const { ctx, S } = load();
  await ctx.renderDailyOps();
  assert.ok(/<span class="do-sl">ΑΠ · 5p · παρτίδα #312<\/span>/.test(rowOf(S.content.innerHTML, 'recPC10000000001')));
  assert.ok(!/παρτίδα/.test(rowOf(S.content.innerHTML, 'recIMP0000000001')));
});
