// Rig: the order form, the catalog, «Προς τιμολόγηση» and the print sheet
// for stock lots (057, plan stock-lots-v5 §5.4) — FRONT-ORDERS.
//
// Usage (cwd = the MAIN repo root: it holds node_modules and .har/):
//   node <worktree>/tests/critics/stock-orders-rig.js <baseURL> <outDir>
// baseURL serves the code under test (e.g. http://localhost:8788/.claude/worktrees/<dir>/).
// Worker responses are STUBBED in memory (ORDERS, STOCK LOTS, LOCATIONS,
// CLIENTS, ORDER STOPS, /costs); the proof is the request BODY each screen
// sends, never a toast. Reference data the stubs do not cover replays from the
// HAR (tests/critics/auth.js) or aborts loudly. Fixture names are generic
// («Πελάτης Α», «Αποθήκη Χ») — the repo is public.
//
// Stages (each on its own page, so one red check does not hide the others):
// catalog/card/print/CSV (G-27, E-12, PR-14) · form warning + lazy list
// (PR-17, G-31) · tick rules, no_split, duplicate (OWNER-Q8, G-14, G-13) ·
// lot create (OWNER-Q1, G-14, mark refused + retry, OWNER-Q2, G-26) · piece
// (G-10, PR-06, G-29, over-draw, G-32, piece edit) · lot edit + refused delete
// (OWNER-Q1, DL-03, AU-07) · accountant (E-07, close, ERP sheet OWNER-Q9) ·
// owner allocation · warehouse role (G-07) · print.html piece sheet (PR-05).
// Round 1 (O1–O11): close/reopen with the read-back, one lot date, the close on
// her papers, the reason once and neutral, D2 «context only», the delete
// confirm of a piece/lot, the group packet / lot partner sheet / piece sheet.
// Round 2 #1 (owner 4/10): the owner's «Χρέωση αποθήκης» in the lot band (GET,
// PATCH, read-back, 422 once + context, 500 re-read, read failure), none for a
// dispatcher, no «Χωρίς συνεργάτη αποθήκης» toast, the invoicing money lines,
// and the order's own Reference escaped on the print sheet.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');   // the worktree under test
const req = m => require(require.resolve(m, { paths: [process.cwd(), ROOT] }));
const { chromium } = req('playwright');
const { preparePage, gotoPage } = require(path.join(__dirname, 'auth.js'));

const [,, BASE_URL, OUT_DIR] = process.argv;
if (!BASE_URL || !OUT_DIR) { console.error('usage: node stock-orders-rig.js <baseURL> <outDir>'); process.exit(2); }
fs.mkdirSync(OUT_DIR, { recursive: true });
const shot = n => path.join(OUT_DIR, 'stock-orders-' + n + '.png');

const ORDERS = 'tblgHlNmLBH3JTdIM', LOCATIONS = 'tblxu8DRfTQOFRCzS', CLIENTS = 'tblFWKAQVUzAM8mCE', STOCK = 'tblStockLots';
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(new Date());

const LOC = (id, Name, City, Country, Type) => ({ id, fields: Object.assign({ Name, City, Country }, Type ? { Type } : {}) });
const LOCS = [
  LOC('recLocGR1', 'Pack House A', 'Veroia', 'GR', 'Client Site'),
  LOC('recWhHU', 'Αποθήκη Χ', 'Budapest', 'Hungary', 'Partner Warehouse'),
  LOC('recWhAT', 'Αποθήκη Υ', 'Wien', 'AT', 'Partner Warehouse'),
  LOC('recWhGR', 'Αποθήκη Ζ', 'Thessaloniki', 'GR', 'Partner Warehouse'),
  LOC('recDestGR', 'Cold Hub B', 'Aspropyrgos', 'GR'),
  // Addendum C (owner 4/10): any location can be a warehouse — this one has NO type.
  LOC('recLocDE', 'Depot K', 'Muenchen', 'DE'),
];
const CLIENTS_FX = [{ id: 'recCliA', fields: { 'Company Name': 'Πελάτης Α', 'VAT Number': 'EL000000000', City: 'Athens', Country: 'GR' } }];
const lotFields = f => Object.assign({
  'Lot No': 1300, 'Source Kind': 'intl', Order: ['recLotSrc'], Reference: 'TEST-STOCK-LOT', 'Client Rec': 'recCliA', 'Client Name': 'Πελάτης Α',
  'Warehouse Rec': 'recWhHU', 'Warehouse Name': 'Αποθήκη Χ', 'Warehouse City': 'Budapest', 'Warehouse Country': 'Hungary',
  'Intake Status': 'Delivered', 'Intake Delivered': true, 'Received On': addDays(TODAY, -3),
  'Stock Pallets': 33, 'Drawn Pallets': 31, 'Remaining Pallets': 2, 'Delivered Pallets': 31, 'Written Off Pallets': 0,
  Pieces: 2, 'Pieces Delivered': 2, 'Pieces Without Truck': 0, 'Last Piece Delivered': addDays(TODAY, -1), Complete: false, Invoiced: false,
}, f || {});
const route2 = (l, u) => ({ 'Loading Location 1': [l], 'Unloading Location 1': [u] });
// One stock_v_lot_money row (round 2 #1 columns: partner_cost / warehouse_charge
// / charge_total; 'no_intake_cost' became 'no_charge'). setCharge mirrors the
// 057 rule: charge = partner + field (NULL only when both are), net = price − charge.
const lotMoney = () => ({ lot_id: 1, lot_rec: 'recLot1', source_kind: 'intl', source_id: 1300, source_rec: 'recLotSrc', price: '3300.00', partner_cost: '300.00', warehouse_charge: null, charge_total: '300.00', net: '3000.00', total_pallets: '33', per_pallet: '90.9091', drawn_pallets: '31', allocated_amount: '2818.18', remaining_pallets: '2', in_stock_amount: '181.82', written_off_pallets: '0', written_off_amount: '0.00', closed_at: null, allocation_status: 'ok' });
function setCharge(m, v) {
  m.warehouse_charge = v == null ? null : Number(v).toFixed(2);
  const p = m.partner_cost == null ? null : Number(m.partner_cost);
  const tot = p == null && v == null ? null : (p || 0) + (v == null ? 0 : Number(v));
  m.charge_total = tot == null ? null : tot.toFixed(2);
  m.net = tot == null ? null : (Number(m.price) - tot).toFixed(2);
  m.allocation_status = tot == null ? 'no_charge' : 'ok';
}
function fixtures() {
  return {
    orders: [
      { id: 'recLotSrc', fields: Object.assign({ 'Order No': 1300, Reference: 'TEST-STOCK-LOT', Direction: 'Export', Type: 'International', Status: 'Delivered', Client: ['recCliA'], Price: 3300, 'Total Pallets': 33, 'Loading Pallets 1': 33, 'Own Stock Lot': 'recLot1', Goods: 'Φρέσκα λαχανικά', 'Temperature °C': 4, 'Refrigerator Mode': 'Start-Stop', 'Pallet Type': 'CHEP', 'ORDER STOPS': ['recSt1', 'recSt2'], 'Loading DateTime': addDays(TODAY, -6) + 'T08:00:00', 'Delivery DateTime': addDays(TODAY, -3) + 'T08:00:00', 'Pallet Exchange': false }, route2('recLocGR1', 'recWhHU')) },
      { id: 'recPc1', fields: Object.assign({ 'Order No': 1301, Reference: 'TEST-STOCK-1', Direction: 'Import', Type: 'International', Status: 'Delivered', Client: ['recCliA'], 'Total Pallets': 16, 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300, 'Stock Lot Source': 'intl', 'Stock Lot Reference': 'TEST-STOCK-LOT', 'Loading DateTime': addDays(TODAY, -2) + 'T08:00:00', 'Delivery DateTime': addDays(TODAY, -1) + 'T08:00:00' }, route2('recWhHU', 'recDestGR')) },
      { id: 'recPc2', fields: Object.assign({ 'Order No': 1302, Reference: 'TEST-STOCK-2', Direction: 'Import', Type: 'International', Status: 'Delivered', Client: ['recCliA'], 'Total Pallets': 15, 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300, 'Stock Lot Source': 'intl', 'Loading DateTime': addDays(TODAY, -2) + 'T08:00:00', 'Delivery DateTime': addDays(TODAY, -1) + 'T09:00:00' }, route2('recWhHU', 'recDestGR')) },
      { id: 'recPlain', fields: Object.assign({ 'Order No': 1290, Reference: 'TEST-PLAIN', Direction: 'Export', Type: 'International', Status: 'Delivered', Client: ['recCliA'], Price: 1500, 'Total Pallets': 20, 'Loading DateTime': addDays(TODAY, -5) + 'T08:00:00', 'Delivery DateTime': addDays(TODAY, -3) + 'T08:00:00' }, route2('recLocGR1', 'recDestGR')) },
      // ⎙I group packet (round 1 O10): a lead with PE + EUR, and a piece (CHEP, no PE) in its group
      { id: 'recLead', fields: { 'Order No': 2001, Reference: 'TEST-LEAD', Direction: 'Import', Type: 'International', Status: 'Assigned', Client: ['recCliA'], Price: 2500, 'Total Pallets': 18, 'Pallet Type': 'EUR', 'Pallet Exchange': true, 'Group ID': 'GI-T|recLead', 'ORDER STOPS': ['recSl1', 'recSl2'], 'Loading DateTime': addDays(TODAY, 1) + 'T07:00:00', 'Delivery DateTime': addDays(TODAY, 3) + 'T07:00:00' } },
      { id: 'recGPc', fields: { 'Order No': 2002, Reference: 'TEST-STOCK-5', Direction: 'Import', Type: 'International', Status: 'Assigned', Client: ['recCliA'], 'Total Pallets': 15, 'Pallet Type': 'CHEP', 'Pallet Exchange': false, 'Group ID': 'GI-T|recLead', 'Stock Lot': ['recLot1'], 'Stock Lot Order No': 1300, 'Stock Lot Source': 'intl', 'Stock Lot Reference': 'TEST-STOCK-LOT', 'ORDER STOPS': ['recSp1', 'recSp2'], 'Loading DateTime': addDays(TODAY, 1) + 'T07:00:00', 'Delivery DateTime': addDays(TODAY, 3) + 'T10:00:00' } },
      { id: 'recOpen', fields: Object.assign({ 'Order No': 1310, Reference: 'TEST-OPEN', Direction: 'Export', Type: 'International', Status: 'Pending', Client: ['recCliA'], Price: 2000, 'Total Pallets': 20, 'Loading DateTime': addDays(TODAY, 2) + 'T08:00:00', 'Delivery DateTime': addDays(TODAY, 4) + 'T08:00:00' }, route2('recLocGR1', 'recWhHU')) },
    ],
    lots: [{ id: 'recLot1', fields: lotFields() }],
  };
}

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.log('  ✗ ' + m); } };

async function newPage(browser, role, view) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const cap = { posts: [], patches: [], deletes: [], errors: [], orderFail: null, lotFail: null, orderDelFail: null, dropStockLot: false, pwReads: 0, lotReqs: 0, fx: fixtures(), seq: 0,
    money: lotMoney(), chargePatches: [], chargeFail: null, chargeReadFail: false, allocReads: 0 };
  page.on('pageerror', e => cap.errors.push(String(e)));
  page.on('dialog', d => {
    if (cap.acceptDialog || cap.dismissDialog) { cap.dialogs = (cap.dialogs || []).concat([d.message()]); return cap.acceptDialog ? d.accept() : d.dismiss(); }
    cap.errors.push('native dialog: ' + d.message()); d.dismiss();
  });
  await preparePage(page, role);
  await page.addInitScript(([r, v]) => { localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'all', view: v })); }, [role, view]);
  const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  // The switch is born closed in config.js; the rig opens it in the served copy only.
  await page.route('**/config.js*', async r => {
    const src = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace('STOCK_LOTS: false', 'STOCK_LOTS: true');
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: src });
  });
  // facade catch-all: empty reads, echoed writes
  await page.route(/\/tbl[A-Za-z0-9]{14}(\?|\/|$)/, async r => {
    const req = r.request(), m = req.method();
    if (m === 'GET') return json(r, req.url().match(/\/rec[A-Za-z0-9]+(\?|$)/) ? { id: 'x', fields: {} } : { records: [] });
    if (m === 'DELETE') return json(r, { deleted: true });
    const b = req.postDataJSON() || {};
    if (b.records) return json(r, { records: b.records.map((x, i) => ({ id: 'recStub' + (++cap.seq) + i, fields: x.fields })) });
    return json(r, { id: 'recStub' + (++cap.seq), fields: b.fields || {} });
  });
  // /costs/stock-lots (owner only): GET ?lot= reads cap.money; PATCH /costs/stock-lots/<rec>
  // {warehouse_charge} writes it and answers {lot} (the read-back) — or cap.chargeFail
  // {status, body, apply} ONCE (apply = the write landed anyway); cap.chargeReadFail fails ONE read.
  await page.route('**/costs/**', r => {
    const req = r.request(), url = req.url();
    if (url.includes('/costs/stock-lots')) {
      if (req.method() === 'PATCH') {
        const b = req.postDataJSON() || {};
        cap.chargePatches.push({ url, body: b });
        const f = cap.chargeFail; cap.chargeFail = null;
        if (!f || f.apply) setCharge(cap.money, b.warehouse_charge);
        return f ? json(r, f.body, f.status) : json(r, { lot: Object.assign({}, cap.money) });
      }
      cap.allocReq = url; cap.allocReads++;
      if (cap.chargeReadFail) { cap.chargeReadFail = false; return json(r, { error: 'Ο επιμερισμός δεν διαβάστηκε' }, 500); }
      return json(r, { lots: [Object.assign({}, cap.money)],
        pieces: [{ lot_id: 1, lot_rec: 'recLot1', piece_kind: 'intl', piece_id: 1301, piece_rec: 'recPc1', seq: 1, pallets: '16', cum_pallets: '16', amount: '1454.55' },
          { lot_id: 1, lot_rec: 'recLot1', piece_kind: 'intl', piece_id: 1302, piece_rec: 'recPc2', seq: 2, pallets: '15', cum_pallets: '31', amount: '1363.63' }] });
    }
    return json(r, { records: [] });
  });
  await page.route('**/pallets/**', r => json(r, { records: [] }));
  // ORDER STOPS of the lot (the form draws its stops from here)
  await page.route('**/tblaeY5QOHAS1gyE8**', r => {
    if (r.request().method() !== 'GET') return r.fallback();
    const st = (id, type, loc, pal, dt, parent) => ({ id, fields: { 'Stop Type': type, 'Stop Number': 1, Location: [loc], Pallets: pal, DateTime: dt, 'Parent Order': [parent || 'recLotSrc'] } });
    const all = [st('recSt1', 'Loading', 'recLocGR1', 33, addDays(TODAY, -6) + 'T08:00:00'), st('recSt2', 'Unloading', 'recWhHU', 33, addDays(TODAY, -3) + 'T08:00:00'),
      st('recSl1', 'Loading', 'recLocGR1', 18, addDays(TODAY, 1) + 'T07:00:00', 'recLead'), st('recSl2', 'Unloading', 'recDestGR', 18, addDays(TODAY, 3) + 'T07:00:00', 'recLead'),
      st('recSp1', 'Loading', 'recWhHU', 15, addDays(TODAY, 1) + 'T07:00:00', 'recGPc'), st('recSp2', 'Unloading', 'recDestGR', 15, addDays(TODAY, 3) + 'T10:00:00', 'recGPc')];
    const u = decodeURIComponent(r.request().url());
    return json(r, { records: all.filter(x => u.includes('"' + x.id + '"') || u.includes("'" + x.id + "'")) });
  });
  await page.route(`**/${LOCATIONS}**`, r => {
    const u = decodeURIComponent(r.request().url());
    if (u.includes("{Type}='Partner Warehouse'")) cap.pwReads++;
    return json(r, { records: u.includes("{Type}='Partner Warehouse'") ? LOCS.filter(l => l.fields.Type === 'Partner Warehouse') : LOCS });
  });
  await page.route(`**/${CLIENTS}**`, r => json(r, { records: CLIENTS_FX }));
  await page.route(`**/${ORDERS}**`, async r => {
    const req = r.request(), m = req.method(), url = decodeURIComponent(req.url());
    const one = url.match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
    if (m === 'GET') {
      if (one && one[1] === 'recGone') return json(r, { error: { type: 'NOT_FOUND', message: 'Record not found' } }, 404);
      if (one) { const rec = cap.fx.orders.find(o => o.id === one[1]); return json(r, rec || { id: one[1], fields: {} }); }
      const f = (url.match(/filterByFormula=([^&]*)/) || [])[1] || '';
      if (f.includes('ARRAYJOIN({Parent Order}')) { const pr = (f.match(/FIND\("(rec[A-Za-z0-9]+)"/) || [])[1]; return json(r, { records: cap.fx.orders.filter(o => (o.fields['Parent Order'] || [])[0] === pr) }); }
      if (f.includes('ARRAYJOIN({Stock Lot}')) { const lr = (f.match(/FIND\("(rec[A-Za-z0-9]+)"/) || [])[1]; return json(r, { records: cap.fx.orders.filter(o => (o.fields['Stock Lot'] || [])[0] === lr) }); }
      if (f.includes('{Reference}')) return json(r, { records: [] });   // duplicate guards: none
      return json(r, { records: cap.fx.orders });
    }
    const b = req.postDataJSON() || {};
    if (m === 'POST') {
      cap.posts.push({ table: 'orders', fields: b.fields });
      if (cap.orderFail) { const e = cap.orderFail; cap.orderFail = null; return json(r, { error: e }, 422); }
      const id = 'recNewOrd' + cap.posts.filter(p => p.table === 'orders').length;
      cap.fx.orders.push({ id, fields: Object.assign({}, b.fields) });
      // G-32: a Worker without the «Stock Lot» label answers 200 and drops it
      const echo = Object.assign({}, b.fields); if (cap.dropStockLot) delete echo['Stock Lot'];
      return json(r, { id, fields: echo });
    }
    if (m === 'PATCH') {
      if (cap.orderPatchFail) { const e = cap.orderPatchFail; cap.orderPatchFail = null; return json(r, { error: e }, 422); }
      cap.patches.push({ table: 'orders', id: one && one[1], fields: b.fields }); return json(r, { id: one && one[1], fields: b.fields });
    }
    cap.deletes.push({ table: 'orders', id: one && one[1] });
    if (cap.orderDelFail) { const e = cap.orderDelFail; cap.orderDelFail = null; return json(r, { error: e }, 422); }
    return json(r, { deleted: true });
  });
  await page.route(`**/${STOCK}**`, async r => {
    const req = r.request(), m = req.method(), url = decodeURIComponent(req.url());
    cap.lotReqs++;
    const one = url.match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
    if (m === 'GET') {
      if (one) return json(r, cap.fx.lots.find(l => l.id === one[1]) || { error: { type: 'NOT_FOUND', message: 'not found' } }, cap.fx.lots.find(l => l.id === one[1]) ? 200 : 404);
      cap.lotReads = (cap.lotReads || []).concat([url.split('?')[1] || '']);
      const f = (url.match(/filterByFormula=([^&]*)/) || [])[1] || '';
      if (f.includes('{Complete}=0')) cap.openLotReads = (cap.openLotReads || 0) + 1;
      const rid = (f.match(/RECORD_ID\(\)='(rec[A-Za-z0-9]+)'/) || [])[1];
      return json(r, { records: rid ? cap.fx.lots.filter(l => l.id === rid) : cap.fx.lots });
    }
    const b = req.postDataJSON() || {};
    if (m === 'POST') {
      cap.posts.push({ table: 'stock_lots', fields: b.fields });
      if (cap.lotFail) { const e = cap.lotFail; cap.lotFail = null; return json(r, { error: e }, 422); }
      const lot = { id: 'recLotNew' + cap.posts.length, fields: lotFields({ Order: b.fields.Order, 'Lot No': 1400, Pieces: 0, 'Pieces Delivered': 0, 'Intake Delivered': false }) };
      cap.fx.lots.push(lot);
      return json(r, lot);
    }
    if (m === 'PATCH') {
      cap.patches.push({ table: 'stock_lots', id: one && one[1], fields: b.fields });
      const lot = cap.fx.lots.find(l => l.id === (one && one[1]));
      if (lot && b.fields['Closed Note']) Object.assign(lot.fields, { 'Closed Note': b.fields['Closed Note'], 'Closed At': new Date().toISOString(), Complete: true, 'Completed On': TODAY, 'Written Off Pallets': lot.fields['Remaining Pallets'] || 0 });
      if (lot && 'Closed Note' in b.fields && b.fields['Closed Note'] === null) {
        if (cap.reopenFail) { const e = cap.reopenFail; cap.reopenFail = null; return json(r, { error: e }, 422); }
        ['Closed Note', 'Closed At', 'Completed On'].forEach(k => delete lot.fields[k]);
        Object.assign(lot.fields, { Complete: false, 'Written Off Pallets': 0 });
      }
      return json(r, lot || { id: one && one[1], fields: b.fields });
    }
    cap.deletes.push({ table: 'stock_lots', id: one && one[1] });
    if (cap.lotFail) { const e = cap.lotFail; cap.lotFail = null; return json(r, { error: e }, 422); }
    return json(r, { id: one && one[1], deleted: true });
  });
  await page.addInitScript(() => {
    // Proof hooks: what reached the log, the paper, the file and the clipboard.
    window.__logCtx = []; window.__printed = []; window.__csv = []; window.__clip = [];
    const hook = () => {
      if (typeof window.logError === 'function' && !window.logError.__rig) {
        const orig = window.logError;
        window.logError = function (e, ctx) { window.__logCtx.push(String(ctx || '')); return orig.apply(this, arguments); };
        window.logError.__rig = true;
      }
      // OrdersList is a top-level const (global lexical scope, not window.*).
      if (typeof OrdersList !== 'undefined' && !OrdersList.__rig) {
        OrdersList.printOpen = html => { window.__printed.push(html); };
        OrdersList.csvDownload = (rows, name) => { window.__csv.push({ rows, name }); };
        OrdersList.__rig = true;
      }
    };
    document.addEventListener('DOMContentLoaded', hook);
    setInterval(hook, 200);
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__clip.push(t); } } }); } catch (e) {}
  });
  page._cap = cap;
  return page;
}
const bodyText = page => page.locator('body').innerText();
// Addendum C (owner 4/10): the warehouse is a SEARCH field (LOCATIONS > 500 rows), not a
// select. The list loads on the first tick; the open drop refreshes when it lands.
async function pickWarehouse(page, q, name) {
  await page.fill('#f_StockWhS', q);
  await page.locator('#f_StockWhD .linked-drop-item', { hasText: name }).first().click({ timeout: 8000 });
}
const waitText = (page, re, t = 8000) => page.waitForFunction(s => new RegExp(s).test(document.body.innerText), re.source, { timeout: t });

async function fillCommon(page) {
  await page.fill('#f_Temp', '2');
  await page.selectOption('#f_ReeferMode', 'Continuous');
  await page.selectOption('#f_PalletType', 'EUR');
}

async function runCatalog(browser) {
  console.log('\n[dispatcher] catalog · card · print/CSV');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });
  const pcRow = (await page.locator('#ocrow_recPc1').innerText()).replace(/\s+/g, ' ');
  ok(/#1300/.test(pcRow) && !/χωρίς τιμή/.test(pcRow), 'catalog: piece price cell names lot #1300, not «χωρίς τιμή» — ' + pcRow);
  ok(await page.locator('#ocrow_recPc1 .oc-tag', { hasText: /^ΑΠ$/ }).count() === 1, 'catalog: piece tag «ΑΠ»');
  const cell = await page.$eval('#ocrow_recPc1 .oc-lotp', e => ({ h: e.getBoundingClientRect().height, sw: e.scrollWidth, cw: e.clientWidth, row: e.closest('tr').getBoundingClientRect().height, td: e.closest('td').scrollWidth <= e.closest('td').clientWidth, text: e.textContent, title: e.title, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) }));
  ok(cell.h <= 42 && cell.row <= 47 && cell.td, 'catalog: the piece price cell fits inside the 46px row, no overflow — ' + JSON.stringify(cell));
  // O11: one line; the 84px column holds 68px — «στην παρτίδα #1300» (106px) goes to the title
  ok(cell.text === '#1300' && cell.lines === 1 && /^Στην παρτίδα #1300/.test(cell.title), 'O11: piece price on ONE line «#1300», «Στην παρτίδα #1300 — …» in the title — ' + JSON.stringify(cell));
  ok(/ΑΠΟΘΕΜΑ/.test(await page.locator('#ocrow_recLotSrc').innerText()), 'catalog: lot tag «ΑΠΟΘΕΜΑ»');
  const lead = await page.$eval('#ocrow_recLotSrc .oc-l2', e => ({ first: (e.firstElementChild || {}).textContent, firstIsStart: e.firstChild === e.firstElementChild, vis: e.firstElementChild ? e.firstElementChild.getBoundingClientRect().right <= e.getBoundingClientRect().right : false }));
  ok(lead.first === 'ΑΠΟΘΕΜΑ' && lead.firstIsStart && lead.vis, 'O11: the stock tag leads the line (before «Εξαγωγή»), fully visible — ' + JSON.stringify(lead));
  const legend = (await page.locator('.oc-legend').innerText()).replace(/\s+/g, ' ');
  ok(/ΑΠ κομμάτι από απόθεμα/.test(legend) && /ΑΠΟΘΕΜΑ παρτίδα σε αποθήκη/.test(legend), 'O11: the legend explains ΑΠ / ΑΠΟΘΕΜΑ — ' + legend);
  const kpi = (await page.locator('#ocKpi').innerText()).replace(/\s+/g, ' ');
  ok(!/χωρίς τιμή/.test(kpi), 'catalog KPI: no «χωρίς τιμή» chip/count from the 2 unpriced pieces — ' + kpi);
  // G-27/E-12: the lot that reached the warehouse is «Στην αποθήκη», not «Παραδόθηκε»
  const lotRow = (await page.locator('#ocrow_recLotSrc').innerText()).replace(/\s+/g, ' ');
  ok(/Στην αποθήκη/.test(lotRow) && !/Παραδόθηκε/.test(lotRow), 'catalog: Delivered lot reads «Στην αποθήκη» — ' + lotRow);
  ok(/Παραδόθηκε/.test(await page.locator('#ocrow_recPlain').innerText()), 'catalog: an ordinary Delivered order still «Παραδόθηκε»');
  await page.screenshot({ path: shot('01-catalog') });
  // PR-14: the paper and the file carry the tags and the piece's reason
  await page.evaluate(() => { OrdersCatalog.print(); OrdersCatalog.csv(); });
  await page.waitForFunction(() => window.__printed.length && window.__csv.length, null, { timeout: 8000 });
  const paper = await page.evaluate(() => window.__printed.at(-1));
  const trOf = ref => (paper.split('<tr>').find(t => t.includes(ref)) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/(^|\s)ΑΠ(\s|$)/.test(trOf('TEST-STOCK-1')) && /στην παρτίδα #1300/.test(trOf('TEST-STOCK-1')), 'catalog print: piece row «ΑΠ» + «στην παρτίδα #1300» — ' + trOf('TEST-STOCK-1'));
  ok(/ΑΠΟΘΕΜΑ/.test(trOf('TEST-STOCK-LOT')) && /Στην αποθήκη/.test(trOf('TEST-STOCK-LOT')), 'catalog print: lot row «ΑΠΟΘΕΜΑ» + «Στην αποθήκη» — ' + trOf('TEST-STOCK-LOT'));
  const csvOut = await page.evaluate(() => window.__csv.at(-1).rows);
  const h = csvOut[0], pcCsv = csvOut.find(r => r.includes('TEST-STOCK-1')) || [], lotCsv = csvOut.find(r => r.includes('TEST-STOCK-LOT')) || [];
  ok(pcCsv[h.indexOf('Σήμανση')] === 'ΑΠ' && pcCsv[h.indexOf('Τιμή')] === 'στην παρτίδα #1300', 'catalog CSV: piece «Σήμανση»=ΑΠ, «Τιμή»=«στην παρτίδα #1300» — ' + JSON.stringify(pcCsv));
  ok(lotCsv[h.indexOf('Σήμανση')] === 'ΑΠΟΘΕΜΑ' && lotCsv[h.indexOf('Κατάσταση')] === 'Στην αποθήκη', 'catalog CSV: lot «ΑΠΟΘΕΜΑ» + «Στην αποθήκη» — ' + JSON.stringify(lotCsv));
  // Round 1b: the columns main already had keep their positions; the new one is last.
  const MAIN_HEAD = ['ΑΡ.', 'Τύπος', 'Αναφορά', 'Κατεύθυνση', 'Πελάτης', 'Φόρτωση', 'Ημ. φόρτωσης', 'Παράδοση', 'Ημ. παράδοσης', 'Παλέτες', 'Ανάθεση', 'Κατάσταση', 'Τιμή', 'ΤΠΥ', 'Ημ. ΤΠΥ'];
  ok(JSON.stringify(h) === JSON.stringify([...MAIN_HEAD, 'Σήμανση']), 'catalog CSV: main columns in place, «Σήμανση» last — ' + JSON.stringify(h));
  const printPage = await page.context().newPage();
  await printPage.setContent(paper.replace(/<script>[\s\S]*?<\/script>/g, ''));
  await printPage.setViewportSize({ width: 1440, height: 900 });
  await printPage.screenshot({ path: shot('01b-catalog-print') });
  await printPage.close();
  // G-27: the lot's card
  await page.click('#ocrow_recLotSrc');
  // textContent, not innerText: the chips are CSS-uppercased (accents dropped).
  await page.waitForFunction(() => /Παρτίδα → αποθήκη/.test((document.getElementById('intlDetail') || {}).textContent || ''), null, { timeout: 8000 });
  const chipsTxt = await page.$$eval('#intlDetail .oi-chip', es => es.map(e => e.textContent));
  ok(chipsTxt.includes('Στην αποθήκη') && chipsTxt.includes('Παρτίδα → αποθήκη') && !chipsTxt.includes('Παραδόθηκε'), 'lot card: status «Στην αποθήκη» + chip «Παρτίδα → αποθήκη» — ' + JSON.stringify(chipsTxt));
  await page.screenshot({ path: shot('01c-lot-card') });
  await page.evaluate(() => _oiCloseCard());
  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

// Each stage opens its own page, so a red check in one (e.g. on the base
// commit) does not hide the others.
async function runForm(browser) {
  console.log('\n[dispatcher] form: PR-17 warning · G-31 lazy list');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });

  // ── G-31 + PR-17: the warehouse list is read on first need; the warning ──
  const pw0 = cap.pwReads;
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#f_StockLot', { timeout: 8000 });
  await page.waitForTimeout(500);
  ok(cap.pwReads === pw0, 'G-31: opening a new form reads no Partner-Warehouse list (' + (cap.pwReads - pw0) + ')');
  ok(!(await page.isVisible('#oiWhWarn')), 'PR-17: no warning on an empty form');
  // O6 (critic-5 S5-03): the lot is one tick «Παρτίδα» in the flags row; no grey box on a new order
  const tick = await page.evaluate(() => { const cb = document.getElementById('f_StockLot'), hr = document.getElementById('f_HighRisk'); return { label: cb.closest('label').textContent.trim(), sameRow: cb.closest('label').parentElement === hr.closest('label').parentElement }; });
  ok(tick.label === 'Παρτίδα' && tick.sameRow, 'O6: «Παρτίδα» is one checkbox next to «⚠ Υψηλό ρίσκο» — ' + JSON.stringify(tick));
  ok(!(await page.isVisible('#oiLotBox')) && !(await page.isVisible('#f_StockWhS')), 'O6: no lot box / warehouse field until ticked');
  const lots0 = cap.openLotReads || 0;
  await page.fill('#ls_l_1', 'Budapest');
  await page.locator('#ls_l_1_d .linked-drop-item', { hasText: 'Αποθήκη Χ' }).click();
  await page.waitForTimeout(500);
  ok(!(await page.isVisible('#oiWhWarn')) && (cap.openLotReads || 0) === lots0, 'O6: loading at a warehouse with NO client yet → no bar, no read');
  await page.evaluate(() => { fhPickLinked('client', 'recCliA', 'Πελάτης Α'); document.getElementById('ls_client').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await page.waitForFunction(() => { const e = document.getElementById('oiWhWarn'); return e && e.style.display !== 'none' && e.textContent; }, null, { timeout: 8000 });
  const wtxt = await page.locator('#oiWhWarn').innerText();
  ok(wtxt === 'Υπάρχει παρτίδα αυτού του πελάτη εδώ — κομμάτι; από το ΑΠΟΘΕΜΑ' && wtxt.split(/\s+/).filter(w => w !== '—').length <= 12, 'O6: an OPEN lot of this client at this warehouse → the ≤12-word bar — ' + wtxt);
  ok(cap.pwReads === pw0 && cap.openLotReads === lots0 + 1, 'O6: the bar reads the open lots once (no Partner-Warehouse list) — pw ' + (cap.pwReads - pw0) + ', lots ' + (cap.openLotReads - lots0));
  await page.evaluate(() => document.getElementById('modalTitle').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: shot('02a-pr17-warning') });
  // another warehouse, where this client has no open lot → no bar (the old bar fired here too)
  await page.evaluate(() => { fhPickLinked('l_1', 'recWhAT', 'Αποθήκη Υ'); document.getElementById('ls_l_1').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await page.waitForFunction(() => document.getElementById('oiWhWarn').style.display === 'none', null, { timeout: 8000 });
  ok(cap.openLotReads === lots0 + 1, 'O6: a warehouse without this client\'s open lot → no bar (lots cached, no second read)');
  // the first pick above went through the real dropdown; these are set
  // directly (a second dropdown in the same field races its own blur timer)
  await page.evaluate(() => { fhPickLinked('l_1', 'recLocGR1', 'Pack House A'); document.getElementById('ls_l_1').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await page.waitForFunction(() => document.getElementById('oiWhWarn').style.display === 'none', null, { timeout: 8000 });
  ok(true, 'PR-17: a client site → no bar');
  await page.evaluate(() => closeModal());
  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

async function runFormTick(browser) {
  console.log('\n[dispatcher] form: G-30 tick (OWNER-Q8) · G-14 no_split · G-13 duplicate');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });

  // ── OWNER-Q8 answered 4/10 (G-30): the tick on a new order and on ANY existing ordinary order, Delivered too ──
  const plainF = cap.fx.orders.find(o => o.id === 'recPlain').fields, openF = cap.fx.orders.find(o => o.id === 'recOpen').fields;
  await page.evaluate(f => openIntlEditWith('recPlain', JSON.parse(JSON.stringify(f))), plainF);
  await page.waitForSelector('#pal_l_1', { timeout: 8000 });
  ok(await page.locator('#f_StockLot').count() === 1, 'OWNER-Q8: a Delivered ordinary order offers the «Παρτίδα» tick (dispatcher)');
  await page.evaluate(() => closeModal());
  await page.evaluate(f => openIntlEditWith('recOpen', JSON.parse(JSON.stringify(f))), openF);
  await page.waitForSelector('#f_StockLot', { timeout: 8000 });
  ok(true, 'OWNER-Q8: a Pending ordinary order offers the tick');
  // G-14 no_split: an existing order that is the PARENT of a leg is refused before any write
  cap.fx.orders.push({ id: 'recLegX', fields: { 'Order No': 1311, Direction: 'Export', Type: 'International', Status: 'Pending', 'Parent Order': ['recOpen'], 'Leg No': 1 } });
  await page.check('#f_StockLot');
  await pickWarehouse(page, 'Budapest', 'Αποθήκη Χ');
  await page.evaluate(() => fhPickLinked('l_1', 'recLocGR1', 'Pack House A'));   // no ORDER STOPS on this fixture
  await page.fill('#pal_l_1', '20'); await page.dispatchEvent('#pal_l_1', 'input');
  await page.fill('#dt_l_1', addDays(TODAY, 2)); await page.fill('#dt_u_1', addDays(TODAY, 4));
  await fillCommon(page);
  const nW0 = cap.posts.length + cap.patches.length;
  await page.click('#btnSubmit');
  await waitText(page, /Παραγγελία με σκέλη δεν γίνεται παρτίδα/);
  ok(cap.posts.length + cap.patches.length === nW0, 'G-14: the parent of a leg is refused in the form (one read of its legs) — nothing written');
  cap.fx.orders = cap.fx.orders.filter(o => o.id !== 'recLegX');
  await page.evaluate(() => closeModal());

  // ── G-13: «Διπλασιασμός» of a lot warns that the copy is not a lot ──
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; });
  await page.evaluate(() => duplicateIntlOrder('recLotSrc'));
  await page.waitForFunction(() => /Το αντίγραφο ΔΕΝ είναι παρτίδα — τσέκαρε «Παρτίδα» αν πρέπει/.test((document.getElementById('tms-toast-container') || {}).innerText || ''), null, { timeout: 8000 });
  ok(!(await page.$eval('#f_StockLot', e => e.checked)), 'G-13: duplicate of a lot → warning «Το αντίγραφο ΔΕΝ είναι παρτίδα…», box unticked');
  await page.evaluate(() => closeModal());
  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

async function runLotCreate(browser) {
  console.log('\n[dispatcher] lot create: OWNER-Q1 · G-31 · G-14 · mark refused · OWNER-Q2 · G-26');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });

  // ── create a lot; the mark is refused once, then retried alone ──
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#f_StockLot', { timeout: 8000 });
  ok(!(await page.isVisible('#f_StockWhS')), 'lot box: warehouse field hidden until ticked');
  await page.selectOption('#f_Direction', 'Export');
  await page.evaluate(() => fhPickLinked('client', 'recCliA', 'Πελάτης Α'));
  await page.fill('#f_Price', '3300');
  await fillCommon(page);
  await page.check('input[name="f_PalletExch"][value="no"]');
  await page.evaluate(() => fhPickLinked('l_1', 'recLocGR1', 'Pack House A'));
  await page.fill('#pal_l_1', '33'); await page.dispatchEvent('#pal_l_1', 'input');
  await page.fill('#dt_l_1', addDays(TODAY, 1));
  await page.click('#btn_addU');
  await page.evaluate(() => fhPickLinked('u_2', 'recDestGR', 'Cold Hub B'));
  ok(await page.locator('#stoprow_u_2').count() === 1, 'a second unloading stop exists before the tick');
  await page.check('#f_VeroiaSwitch');
  const pwTick = cap.pwReads;
  await page.check('#f_StockLot');
  await page.click('#f_StockWhS');
  await page.waitForSelector('#f_StockWhD .linked-drop-item', { timeout: 8000 });
  const opts = await page.$$eval('#f_StockWhD .linked-drop-item', es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  // Addendum C: every location ABROAD is offered (typed or not); the known warehouses first
  // (typed «Partner Warehouse» / already a lot's warehouse); Ε2 keeps Greek ones out.
  const known2 = opts.slice(0, 2).join(' | ');
  ok(/Αποθήκη Χ[^|]* αποθήκη/.test(known2) && /Αποθήκη Υ[^|]* αποθήκη/.test(known2) && opts.some(o => /^Depot K/.test(o) && !/ αποθήκη$/.test(o))
    && !opts.some(o => /Αποθήκη Ζ|Pack House A|Cold Hub B/.test(o)), 'addendum C: known warehouses first, an UNTYPED foreign location offered, no Greek one (Ε2) — ' + opts.join(' | '));
  await page.screenshot({ path: shot('02c-warehouse-search') });
  // Round 1 O6: the PR-17 bar no longer reads the Partner-Warehouse list (it reads the open lots), so the tick is its first need.
  ok(cap.pwReads === pwTick + 1, 'G-31: the tick reads the warehouse list once, at its first need (' + (cap.pwReads - pwTick) + ')');
  ok(!(await page.isVisible('#f_VeroiaSwitch')) && !(await page.$eval('#f_VeroiaSwitch', e => e.checked)), 'OWNER-Q1: «Παρτίδα» ticked → Veroia Switch hidden and unticked');
  ok(await page.locator('#stoprow_u_2').count() === 1, 'ticking alone touches no stop (no warehouse chosen yet)');
  await pickWarehouse(page, 'Depot', 'Depot K');
  ok(await page.locator('#stoprow_u_2').count() === 0, 'warehouse chosen → extra unloading stop removed');
  ok(await page.$eval('#lv_u_1', e => e.value) === 'recLocDE' && await page.$eval('#ls_u_1', e => e.readOnly), 'addendum C: unloading 1 = the UNTYPED location picked as warehouse, locked');
  ok(!(await page.isVisible('#btn_addU')), '«+ Προσθήκη στάσης παράδοσης» hidden');
  ok(await page.inputValue('#pal_u_1') === '33', 'unloading pallets follow the loading ones (33)');
  await page.fill('#pal_l_1', '32'); await page.dispatchEvent('#pal_l_1', 'input');
  ok(await page.inputValue('#pal_u_1') === '32', '… and keep following (32)');
  await page.fill('#pal_l_1', '33'); await page.dispatchEvent('#pal_l_1', 'input');
  await page.fill('#dt_u_1', addDays(TODAY, 3));
  await page.screenshot({ path: shot('02-form-lot') });

  // G-14: the base's mark refusals mirrored BEFORE the order is saved
  await page.fill('#pal_l_1', ''); await page.dispatchEvent('#pal_l_1', 'input');
  const nPost0 = cap.posts.length;
  await page.click('#btnSubmit');
  await waitText(page, /Παρτίδα χωρίς παλέτες — συμπλήρωσε τις παλέτες φόρτωσης/);
  ok(cap.posts.length === nPost0, 'G-14: a lot with 0 loading pallets is refused in the form — nothing POSTed');
  await page.screenshot({ path: shot('02b-lot-empty-refused') });
  await page.fill('#pal_l_1', '33'); await page.dispatchEvent('#pal_l_1', 'input');
  ok(await page.inputValue('#pal_u_1') === '33', '… pallets back to 33');
  // G-26: a lot saved from an export's empty import box is never matched to it
  await page.evaluate(() => {
    window.__consumeCalls = [];
    window._wiConsumePendingMatch = async (...a) => { window.__consumeCalls.push(a); };
    window._wiPendingMatch = { rowId: 'row1', at: Date.now() };
  });

  // Addendum C: the type is no longer refused (warehouse_rule is gone) — a transient refusal instead.
  cap.lotFail = { type: 'STOCK_RULE', code: 'lot_source_missing', message: 'Η παραγγελία της παρτίδας δεν βρέθηκε ή έχει διαγραφεί' };
  await page.click('#btnSubmit');
  await waitText(page, /ΔΕΝ έγινε παρτίδα/);
  const oPosts = cap.posts.filter(p => p.table === 'orders');
  ok(oPosts.length === 1, 'one ORDERS POST');
  const of = oPosts[0].fields;
  ok(JSON.stringify(of['Unloading Location 1']) === '["recLocDE"]' && JSON.stringify(of['Unloading Location 2']) === '[]' && of.Price === 3300 && of['Unloading Pallets 1'] === 33, 'ORDERS body: destination 1 = warehouse (untyped DE), 2 = [], Price 3300, unloading pallets 33');
  ok(of['Veroia Switch'] === false && of['Cross-dock Date'] === null, 'OWNER-Q1: the lot POST carries «Veroia Switch» false and no cross-dock');
  ok(!('Stock Lot' in of), 'the lot order itself carries no «Stock Lot»');
  const lPosts = cap.posts.filter(p => p.table === 'stock_lots');
  ok(lPosts.length === 1 && JSON.stringify(lPosts[0].fields) === '{"Order":["recNewOrd1"]}', 'STOCK LOTS POST body = {Order:[saved order]}');
  ok(/Η παραγγελία της παρτίδας δεν βρέθηκε ή έχει διαγραφεί/.test(await bodyText(page)), 'the Greek refusal of the base is on screen');
  ok(await page.isVisible('#btnSubmit') && /Ξανά: σήμανση παρτίδας/.test(await page.locator('#btnSubmit').innerText()), 'modal stays open; button = «Ξανά: σήμανση παρτίδας»');
  ok(!/Order created/.test(await bodyText(page)), 'no success toast');
  await page.screenshot({ path: shot('03-mark-refused') });
  const patchesBefore = cap.patches.length;
  await page.click('#btnSubmit');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
  ok(cap.posts.filter(p => p.table === 'orders').length === 1 && cap.patches.length === patchesBefore, 'retry: the order is NOT saved again (no POST, no PATCH)');
  ok(cap.posts.filter(p => p.table === 'stock_lots').length === 2, 'retry: only the STOCK LOTS POST again');
  ok(cap.fx.lots.some(l => JSON.stringify(l.fields.Order) === '["recNewOrd1"]'), 'addendum C: the lot to an UNTYPED foreign location is saved (STOCK LOTS row for the order)');
  const toastsLot = await page.evaluate(() => (document.getElementById('tms-toast-container') || {}).innerText || '');
  // Round 2 #1 (owner 4/10): a lot on our own truck IS allocated once the owner enters its
  // «Χρέωση αποθήκης»; the missing charge is said in the owner's band and by the auditor (S-11).
  ok(!/Χωρίς συνεργάτη αποθήκης/.test(toastsLot), 'round 2 #1: marked lot on our own truck → no «Χωρίς συνεργάτη αποθήκης…» toast — ' + toastsLot.replace(/\s+/g, ' '));
  ok(await page.evaluate(() => window.__consumeCalls.length === 0 && window._wiPendingMatch === null), 'G-26: the new lot is not auto-matched; the pending box is dropped');

  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

// Each stage opens its own page, so a red check in one (e.g. on the base
// commit) does not hide the others.
async function runPiece(browser) {
  console.log('\n[dispatcher] piece mode');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });

  // ── piece mode: over-draw 422, then success with the Weekly hook ──
  const lot13 = { id: 'recLot1', fields: lotFields({ 'Remaining Pallets': 13, 'Drawn Pallets': 20, Pieces: 2, 'Pieces Delivered': 1, 'Received On': addDays(TODAY, -1) }) };
  const ld = addDays(TODAY, -3), dd = addDays(TODAY, -1);
  await page.evaluate(([lot, ld, dd]) => {
    window._scanQueue = ['scan-x'];   // G-29: a scan queue is running behind this piece form
    window._pieceCalls = [];
    window._wiOnPieceSaved = async (id, f, ctx) => { window._pieceCalls.push({ id, f, ctx }); };
    openIntlPieceCreate(lot, { loadingDate: ld, deliveryDate: dd, lockLoadingDate: true, groupId: 'GI-k3x9|recLead', truck: 'recT1', trailer: 'recTr1', driver: 'recD1', status: 'Assigned', context: { rowId: 'row1', kind: 'A', leadId: 'recLead' } });
  }, [lot13, ld, dd]);
  await page.waitForSelector('#pal_l_1', { timeout: 8000 });
  await page.waitForFunction(() => /Κομμάτι από απόθεμα/.test(document.getElementById('modalTitle').textContent));
  ok(/Κομμάτι από απόθεμα · Αποθήκη Χ · διαθέσιμα 13p/.test(await page.locator('#modalTitle').innerText()), 'title «Κομμάτι από απόθεμα · Αποθήκη Χ · διαθέσιμα 13p»');
  ok(await page.locator('#f_Price').count() === 0 && /στην παρτίδα #1300/.test(await page.locator('#modalBody').innerText()), 'no price input; «στην παρτίδα #1300»');
  ok(await page.locator('input[name="f_PalletExch"]').count() === 0, 'no PE choice');
  ok(await page.locator('#f_StockLot').count() === 0, 'no lot box on a piece');
  ok(await page.$eval('#f_Direction', e => e.disabled && e.value === 'Import'), 'direction Import, locked');
  ok(await page.$eval('#ls_client', e => e.readOnly && e.value === 'Πελάτης Α'), 'client = the lot client, locked');
  ok(await page.$eval('#lv_l_1', e => e.value) === 'recWhHU' && await page.$eval('#ls_l_1', e => e.readOnly && /Αποθήκη Χ/.test(e.value)), 'loading = the warehouse, locked');
  ok(await page.locator('#btn_addL').count() === 0, 'no second loading stop');
  ok(await page.$eval('#pal_l_1', e => e.max) === '13', 'pallets max = remaining 13 (mirror)');
  ok(await page.$eval('#dt_l_1', e => e.readOnly && e.value) === ld, 'loading day = the truck\'s, read-only');
  ok(await page.inputValue('#dt_u_1') === dd, 'delivery day prefilled');
  const pw = await page.locator('#oiPieceWarn').innerText();
  const dd2 = y => y.slice(8, 10) + '/' + y.slice(5, 7);
  ok(await page.isVisible('#oiPieceWarn') && pw === `Φόρτωση ${dd2(ld)} πριν από την παραλαβή στην αποθήκη (${dd2(addDays(TODAY, -1))}) — έλεγξε την ημέρα.`, 'O7: one sentence, no contradiction — ' + pw);
  // PR-06: the lot's cargo (one GET of its source order)
  const cargo = await page.evaluate(() => ['f_Goods', 'f_Temp', 'f_ReeferMode', 'f_PalletType'].map(id => document.getElementById(id).value));
  ok(JSON.stringify(cargo) === JSON.stringify(['Φρέσκα λαχανικά', '4', 'Start-Stop', 'CHEP']), 'PR-06: goods / °C / reefer / pallet type pre-filled from the lot\'s source — ' + JSON.stringify(cargo));
  ok(await page.locator('#oiCargoNote').count() === 0, 'PR-06: no «not read» note when the read succeeded');
  ok(!/Παράλειψη/.test(await page.locator('#modal').innerText()), 'G-29: no «Παράλειψη →» on a piece form while a scan queue runs');
  ok(!(await page.isVisible('#oiWhWarn')), 'PR-17: no warehouse warning on a piece form (it loads there by definition)');
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; document.getElementById('f_Goods').scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('04a-piece-prefill') });
  await page.evaluate(() => { window._scanQueue = null; });
  await fillCommon(page);
  await page.evaluate(() => fhPickLinked('u_1', 'recDestGR', 'Cold Hub B'));
  await page.fill('#pal_l_1', '15'); await page.fill('#pal_u_1', '15');
  await page.fill('#f_Reference', 'TEST-STOCK-3');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('modalTitle').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: shot('04-piece-form') });
  // forget the earlier toasts (the lot's «Order created» lingers hidden in the DOM)
  await page.evaluate(() => { document.getElementById('toast')?.remove(); document.getElementById('tms-toast-container')?.remove(); });
  cap.orderFail = { type: 'STOCK_RULE', code: 'over_draw', message: 'Υπέρβαση αποθέματος: διαθέσιμες 13 παλέτες, ζητήθηκαν 15' };
  const nOrders = cap.posts.filter(p => p.table === 'orders').length;
  await page.click('#btnSubmit');
  await waitText(page, /Υπέρβαση αποθέματος: διαθέσιμες 13 παλέτες, ζητήθηκαν 15/);
  ok(true, '422 over_draw → the Greek message on screen');
  ok(await page.isVisible('#pal_l_1') && (await page.evaluate(() => window._pieceCalls.length)) === 0, 'modal stays open; the Weekly hook not called');
  await page.waitForTimeout(300);
  const toastsNow = await page.evaluate(() => [(document.getElementById('toast') || {}).innerText || '', (document.getElementById('tms-toast-container') || {}).innerText || ''].join(' | '));
  ok(!/Order created/.test(toastsNow) && !/Σφάλμα server/.test(toastsNow), 'no success toast, no «Σφάλμα server» — toasts: ' + toastsNow.replace(/\s+/g, ' '));
  // O8 / D2 (critic-1 C1-06): the base's sentence ONCE (core/api.js), then only the context
  const times = (toastsNow.match(/Υπέρβαση αποθέματος: διαθέσιμες 13 παλέτες, ζητήθηκαν 15/g) || []).length;
  ok(times === 1 && /Δεν αποθηκεύτηκε τίποτα — η φόρμα μένει ανοιχτή/.test(toastsNow) && !/Σφάλμα αποθήκευσης/.test(toastsNow), 'O8: refusal once + context only, no generic «Σφάλμα αποθήκευσης» — ×' + times + ' · ' + toastsNow.replace(/\s+/g, ' '));
  await page.screenshot({ path: shot('05-piece-over-draw') });
  const refusedBody = cap.posts.filter(p => p.table === 'orders')[nOrders].fields;
  await page.fill('#pal_l_1', '5'); await page.fill('#pal_u_1', '5');
  // the Reference duplicate guard asks (confirmAction) — the stub answers «no duplicates» for {Reference}=
  await page.click('#btnSubmit');
  await page.waitForFunction(() => window._pieceCalls && window._pieceCalls.length === 1, null, { timeout: 10000 });
  const pb = cap.posts.filter(p => p.table === 'orders').at(-1).fields;
  ok(!('Price' in pb) && !('Price' in refusedBody), 'piece POST: no «Price» key (both attempts)');
  ok(JSON.stringify(pb['Stock Lot']) === '["recLot1"]' && pb['Pallet Exchange'] === false && pb['Group ID'] === 'GI-k3x9|recLead', 'piece POST: Stock Lot, PE false, exact Group ID');
  ok(JSON.stringify([pb.Truck, pb.Trailer, pb.Driver]) === '[["recT1"],["recTr1"],["recD1"]]' && pb.Status === 'Assigned', 'piece POST: lead\'s vehicle + Status Assigned');
  ok(JSON.stringify(pb['Loading Location 1']) === '["recWhHU"]' && JSON.stringify(pb['Loading Location 2']) === '[]' && JSON.stringify(pb.Client) === '["recCliA"]' && pb.Direction === 'Import', 'piece POST: warehouse, lot client, Import');
  ok(pb['Loading Pallets 1'] === 5 && pb['Loading DateTime'] === ld, 'piece POST: 5 pallets, the truck\'s loading day');
  const call = await page.evaluate(() => window._pieceCalls[0]);
  ok(call.id === 'recNewOrd' + cap.posts.filter(p => p.table === 'orders').length && call.ctx.kind === 'A' && call.f['Group ID'] === 'GI-k3x9|recLead', '_wiOnPieceSaved(newId, fields, context)');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
  ok(true, 'modal closed after the piece was saved');

  // ── G-32: the piece's link did not land (Worker without the label) → loud, not joined ──
  console.log('[dispatcher] G-32 read-back · PR-06 failed read');
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; window.__logCtx = []; });
  await page.evaluate(([lot, ld, dd]) => openIntlPieceCreate(lot, { loadingDate: ld, deliveryDate: dd, lockLoadingDate: true, groupId: 'GI-k3x9|recLead', truck: 'recT1', status: 'Assigned', context: { rowId: 'row1', kind: 'A', leadId: 'recLead' } }), [lot13, ld, dd]);
  await page.waitForSelector('#pal_l_1', { timeout: 8000 });
  await fillCommon(page);
  await page.evaluate(() => fhPickLinked('u_1', 'recDestGR', 'Cold Hub B'));
  await page.fill('#pal_l_1', '3'); await page.fill('#pal_u_1', '3'); await page.fill('#f_Reference', 'TEST-STOCK-4');
  cap.dropStockLot = true;
  const nCalls = await page.evaluate(() => window._pieceCalls.length);
  await page.click('#btnSubmit');
  await waitText(page, /ΧΩΡΙΣ σύνδεση με την παρτίδα — ΔΕΝ είναι κομμάτι/);
  cap.dropStockLot = false;
  await page.waitForTimeout(600);
  ok(await page.evaluate(n => window._pieceCalls.length === n, nCalls), 'G-32: link lost → error on screen, the piece is NOT joined to the truck');
  ok(await page.evaluate(() => window.__logCtx.some(c => /submitIntlOrder piece/.test(c))), 'G-32: … and logged (app_errors)');
  await page.screenshot({ path: shot('05b-piece-link-lost') });
  await page.evaluate(() => closeModal());
  // PR-06: the source order cannot be read → fields stay empty, the form says so
  const lotGone = { id: 'recLot1', fields: lotFields({ Order: ['recGone'], 'Remaining Pallets': 13 }) };
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; });
  await page.evaluate(lot => openIntlPieceCreate(lot, {}), lotGone);
  await page.waitForSelector('#oiCargoNote', { timeout: 15000 });
  await page.waitForTimeout(700);   // the modal's fade-in
  const empty = await page.evaluate(() => ['f_Goods', 'f_Temp', 'f_ReeferMode', 'f_PalletType'].map(id => document.getElementById(id).value));
  ok(/Τα στοιχεία φορτίου της παρτίδας δεν διαβάστηκαν/.test(await page.locator('#oiCargoNote').innerText()) && empty.every(v => v === ''), 'PR-06: source not read → empty fields + visible note — ' + JSON.stringify(empty));
  await page.evaluate(() => document.getElementById('modalTitle').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: shot('04b-piece-cargo-not-read') });
  await page.evaluate(() => closeModal());
  // ── editing a piece: same locks; max = remaining + its own pallets ──
  console.log('[dispatcher] piece edit');
  const pc = cap.fx.orders.find(o => o.id === 'recPc1');
  await page.evaluate(f => openIntlEditWith('recPc1', JSON.parse(JSON.stringify(f))), pc.fields);
  await page.waitForFunction(() => /Επεξεργασία κομματιού/.test(document.getElementById('modalTitle').textContent), null, { timeout: 8000 });
  await page.waitForSelector('#pal_l_1');
  const band = await page.locator('#modalBody .oi-banner').first().innerText();
  ok(/Κομμάτι της παρτίδας #1300 · διαθέσιμα 2p στην αποθήκη/.test(band), 'edit band «Κομμάτι της παρτίδας #1300 · διαθέσιμα 2p» — ' + band);
  ok(await page.$eval('#pal_l_1', e => e.max) === '18', 'edit: pallets max = remaining 2 + own 16');
  ok(await page.locator('#f_Price').count() === 0 && await page.locator('input[name="f_PalletExch"]').count() === 0, 'edit: no price, no PE');
  ok(await page.$eval('#lv_l_1', e => e.value) === 'recWhHU' && await page.$eval('#ls_l_1', e => e.readOnly), 'edit: loading = warehouse (from the lot when the stops are empty), locked');
  ok(await page.$eval('#ls_client', e => e.readOnly) && await page.$eval('#f_Direction', e => e.disabled), 'edit: client + direction locked');
  // review P2 (4/10): no «Διπλασιασμός» on a piece — a copy would not be a piece
  ok(await page.locator('#modal button', { hasText: 'Διπλασιασμός' }).count() === 0, 'piece edit: no «Διπλασιασμός» in the footer');
  const dupRes = await page.evaluate(async f => {
    // orders_intl.js is an IIFE: only window.* is reachable — the WINTL fallback of duplicateIntlOrder is.
    const seen = []; const t0 = window.toast; window.toast = (m, ty) => { seen.push((ty || 'success') + ': ' + m); };
    WINTL.data.imports = WINTL.data.imports || [];
    WINTL.data.imports.push({ id: 'recPcDup', fields: JSON.parse(JSON.stringify(f)) });
    const title0 = document.getElementById('modalTitle').textContent;
    try { await duplicateIntlOrder('recPcDup'); } finally { window.toast = t0; WINTL.data.imports = WINTL.data.imports.filter(r => r.id !== 'recPcDup'); }
    return { seen, sameModal: document.getElementById('modalTitle').textContent === title0 };
  }, pc.fields);
  await page.evaluate(() => closeModal());
  await page.evaluate(() => openIntlReadOnlyCard('recPc1')); await page.waitForTimeout(800);
  const cardTxt = await page.evaluate(() => (document.getElementById('intlDetail') || {}).innerText || '');
  dupRes.cardPrice = /Τιμή\s*στην παρτίδα #1300/.test(cardTxt); dupRes.card = cardTxt.replace(/\s+/g, ' ').slice(0, 300);
  dupRes.cardInv = /Τιμολογήθηκε\s*με την παρτίδα #1300/.test(cardTxt) && !/Τιμολογήθηκε\s*Όχι/.test(cardTxt);
  await page.evaluate(() => { const p = document.getElementById('intlDetail'); if (p) p.classList.add('hidden'); });
  await page.evaluate(f => openIntlEditWith('recPc1', JSON.parse(JSON.stringify(f))), pc.fields);
  await page.waitForFunction(() => /Επεξεργασία κομματιού/.test(document.getElementById('modalTitle').textContent), null, { timeout: 8000 });
  await page.waitForSelector('#pal_l_1');
  ok(dupRes.seen.some(t => /^warn: Νέο κομμάτι: από τη λωρίδα ΑΠΟΘΕΜΑ/.test(t)) && dupRes.sameModal, 'duplicateIntlOrder(piece) refuses in Greek, opens nothing — ' + JSON.stringify(dupRes.seen));
  ok(dupRes.cardPrice, 'piece card: price row «στην παρτίδα #1300» — ' + dupRes.card);
  ok(dupRes.cardInv, 'O5: piece card «Τιμολογήθηκε · με την παρτίδα #1300», never «Όχι»');
  await page.fill('#pal_l_1', '16'); await page.fill('#dt_l_1', addDays(TODAY, -2));
  await page.evaluate(() => fhPickLinked('u_1', 'recDestGR', 'Cold Hub B'));
  await page.fill('#pal_u_1', '16'); await page.fill('#dt_u_1', addDays(TODAY, -1));
  await fillCommon(page);
  await page.fill('#f_Reference', 'TEST-STOCK-1b');
  const nPatch = cap.patches.length;
  await page.click('#btnSubmit');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 10000 });
  const pp = cap.patches.slice(nPatch).find(p => p.table === 'orders' && p.id === 'recPc1');
  ok(pp && !('Price' in pp.fields) && !('Pallet Exchange' in pp.fields) && !('Status' in pp.fields) && !('Stock Lot' in pp.fields), 'edit PATCH: no Price, no PE, no Status, no relink — ' + JSON.stringify(pp && Object.keys(pp.fields).filter(k => /Price|Pallet Exchange|Status|Stock/.test(k))));
  ok(pp && pp.fields.Reference === 'TEST-STOCK-1b' && JSON.stringify(pp.fields['Loading Location 1']) === '["recWhHU"]' && JSON.stringify(pp.fields.Client) === '["recCliA"]', 'edit PATCH: reference changed; warehouse + client re-sent unchanged');

  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

// Each stage opens its own page, so a red check in one (e.g. on the base
// commit) does not hide the others.
async function runLotEdit(browser) {
  console.log('\n[dispatcher] lot edit · delete refused');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });

  // ── O1/O2: a CLOSED lot shows its close in the band, and «Άνοιγμα ξανά» ──
  const lf = cap.fx.orders.find(o => o.id === 'recLotSrc');
  const lot1 = cap.fx.lots.find(l => l.id === 'recLot1');
  Object.assign(lot1.fields, { 'Closed Note': '2 παλέτες χαλασμένες', 'Closed At': addDays(TODAY, -1) + 'T10:00:00Z', Complete: true, 'Completed On': addDays(TODAY, -1), 'Written Off Pallets': 2 });
  await page.evaluate(f => openIntlEditWith('recLotSrc', JSON.parse(JSON.stringify(f))), lf.fields);
  await page.waitForSelector('#oiLotReopen', { timeout: 8000 });
  const closedDm = (+addDays(TODAY, -1).slice(8, 10)) + '/' + (+addDays(TODAY, -1).slice(5, 7));
  const cband = (await page.locator('#oiLotBand').innerText()).replace(/\s+/g, ' ');
  ok(cband.includes('Κλείσιμο υπολοίπου: 2 παλ. · 2 παλέτες χαλασμένες · ' + closedDm), 'O2: the band of a closed lot says the close (pallets · reason · date) — ' + cband);
  await page.waitForTimeout(700);   // the modal's fade-in
  await page.evaluate(() => document.getElementById('modalTitle').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: shot('10a-lot-edit-closed') });
  const nRe = cap.patches.length;
  await page.click('#oiLotReopen');
  await page.waitForFunction(() => !document.getElementById('oiLotClosed'), null, { timeout: 8000 });
  const rp = cap.patches.slice(nRe);
  ok(rp.length === 1 && rp[0].table === 'stock_lots' && rp[0].id === 'recLot1' && JSON.stringify(rp[0].fields) === '{"Closed Note":null}', 'O1: «Άνοιγμα ξανά» = ONE PATCH STOCK LOTS {Closed Note:null} — ' + JSON.stringify(rp));
  ok(/άνοιξε ξανά — περιμένει κομμάτια/.test(await page.evaluate(() => (document.getElementById('toast') || {}).innerText || '')) && await page.isVisible('#oiLotBand'), 'O1: band repainted from the read-back (no close line), toast says what happened');
  await page.evaluate(() => closeModal());
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });

  // ── editing a lot: band, frozen pallets, unmark (refused, then allowed) ──
  await page.evaluate(f => openIntlEditWith('recLotSrc', JSON.parse(JSON.stringify(f))), lf.fields);
  await page.waitForSelector('#f_StockLot', { timeout: 8000 });
  await page.waitForFunction(() => document.getElementById('f_StockWh').value === 'recWhHU', null, { timeout: 8000 });
  const lband = await page.locator('#modalBody .oi-banner').first().innerText();
  ok(/Παρτίδα #1300 · υπόλοιπο 2\/33p · 2 κομμάτια \(2 παραδόθηκαν\)/.test(lband) && /κλείδωσαν με την παραλαβή/.test(lband), 'lot band «Παρτίδα #1300 · υπόλοιπο 2/33p · 2 κομμάτια (2 παραδόθηκαν)» + frozen note');
  ok(await page.locator('#modal button', { hasText: 'Διπλασιασμός' }).count() === 1, 'lot edit: «Διπλασιασμός» stays (a copy of a lot is a new order)');
  ok(await page.$eval('#f_StockLot', e => e.checked), 'lot edit: «Παρτίδα» ticked');
  ok(await page.$eval('#pal_l_1', e => e.readOnly && /κλείδωσαν/.test(e.title)) && await page.locator('#btn_addL').count() === 0, 'intake Delivered → loading pallets read-only, no new loading stop (lot_frozen mirror)');
  ok(await page.$eval('#lv_u_1', e => e.value) === 'recWhHU' && await page.$eval('#ls_u_1', e => e.readOnly), 'lot edit: destination = warehouse, locked');
  ok(!(await page.isVisible('#f_VeroiaSwitch')), 'OWNER-Q1: lot edit opens without Veroia Switch');
  ok(await page.locator('#oiLotCharge').count() === 0 && !cap.allocReq && !/Χρέωση αποθήκης/.test(await page.locator('#modalBody').innerText()), 'round 2 #1: a dispatcher sees no «Χρέωση αποθήκης» block and asks no /costs/stock-lots');
  await page.screenshot({ path: shot('10-lot-edit') });
  await page.uncheck('#f_StockLot');
  ok(await page.isVisible('#f_VeroiaSwitch'), 'OWNER-Q1: unticked → Veroia Switch is back');
  ok(await page.isVisible('#oiLotOff') && !(await page.$eval('#ls_u_1', e => e.readOnly)), 'unticked: warning shown, destination unlocked');
  ok(await page.inputValue('#pal_l_1') === '33' && await page.$eval('#lv_l_1', e => e.value) === 'recLocGR1', 'lot edit: its stops loaded (33p from the client site)');
  await fillCommon(page);
  cap.acceptDialog = true;
  cap.lotFail = { type: 'STOCK_RULE', code: 'lot_has_pieces', message: 'Η παρτίδα έχει κομμάτια — δεν καταργείται' };
  const nP = cap.patches.length, nD = cap.deletes.length;
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; });
  await page.click('#btnSubmit');
  await waitText(page, /ΠΑΡΑΜΕΝΕΙ παρτίδα — δεν αποθηκεύτηκε τίποτα/);
  ok(cap.deletes.length === nD + 1 && cap.patches.length === nP, 'unmark refused (lot_has_pieces) → nothing else written (no ORDERS PATCH)');
  const unTo = (await page.evaluate(() => (document.getElementById('tms-toast-container') || {}).innerText || '')).replace(/\s+/g, ' ');
  ok((unTo.match(/Η παρτίδα έχει κομμάτια — δεν καταργείται/g) || []).length === 1, 'O8 / D2: the base\'s sentence once, the context without it — ' + unTo);
  ok((cap.dialogs || []).some(m => /θα πάψει να είναι παρτίδα/.test(m)), 'native confirm asked first');
  // Round 1b: the unmark goes through, the ORDERS PATCH is then refused — the lot is gone, so
  // «δεν αποθηκεύτηκε τίποτα» would be false; the next click saves the order without a 2nd unmark.
  cap.orderPatchFail = { type: 'VALIDATION', code: 'x', message: 'Άκυρη τιμή πεδίου' };
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; });
  await page.click('#btnSubmit');
  await waitText(page, /Η παρτίδα καταργήθηκε, η παραγγελία ΔΕΝ αποθηκεύτηκε — ξαναπάτα Αποθήκευση/);
  const unTo2 = (await page.evaluate(() => (document.getElementById('tms-toast-container') || {}).innerText || '')).replace(/\s+/g, ' ');
  ok(!/δεν αποθηκεύτηκε τίποτα/.test(unTo2) && cap.deletes.length === nD + 2 && await page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open')),
    '1b F2: unmarked, PATCH refused → «Η παρτίδα καταργήθηκε, η παραγγελία ΔΕΝ αποθηκεύτηκε», form stays — ' + unTo2);
  // reviewer 1b P3-1: a SECOND refused Save (no unmark this time) still says the lot is gone.
  cap.orderPatchFail = { type: 'VALIDATION', code: 'x', message: 'Άκυρη τιμή πεδίου' };
  await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; });
  await page.click('#btnSubmit');
  await waitText(page, /Η παρτίδα καταργήθηκε, η παραγγελία ΔΕΝ αποθηκεύτηκε — ξαναπάτα Αποθήκευση/);
  const unTo3 = (await page.evaluate(() => (document.getElementById('tms-toast-container') || {}).innerText || '')).replace(/\s+/g, ' ');
  ok(!/δεν αποθηκεύτηκε τίποτα/.test(unTo3) && cap.deletes.length === nD + 2, '1b P3-1: 2nd refused Save still «Η παρτίδα καταργήθηκε…», no 2nd unmark — ' + unTo3);
  await page.click('#btnSubmit');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 10000 });
  ok(cap.deletes.length === nD + 2 && cap.deletes.at(-1).id === 'recLot1', 'unmark allowed → DELETE STOCK LOTS recLot1 (once, not again on the retry)');
  ok(cap.patches.slice(nP).some(p => p.table === 'orders' && p.id === 'recLotSrc'), '… and only then the ORDERS PATCH');
  cap.acceptDialog = false;

  // ── DL-03 + AU-07: a designed refusal of a delete — its own words, logged once ──
  console.log('[dispatcher] delete refused');
  await page.evaluate(() => { window.__logCtx = []; document.getElementById('toast')?.remove(); const c = document.getElementById('tms-toast-container'); if (c) c.innerHTML = ''; });
  cap.acceptDialog = true; cap.dialogs = [];
  cap.orderDelFail = { type: 'STOCK_RULE', code: 'piece_on_truck', message: 'Το κομμάτι είναι σε φορτηγό — «Επιστροφή στο απόθεμα» πρώτα' };
  const nOrdDel = cap.deletes.filter(d => d.table === 'orders').length;
  await page.evaluate(() => deleteIntlOrder('recPc1'));
  // K1 (round 1): a designed refusal is shown ONCE, by core/api.js — no second toast of the caller.
  const REFUSAL = 'Το κομμάτι είναι σε φορτηγό — «Επιστροφή στο απόθεμα» πρώτα';
  await page.waitForFunction(t => document.body.innerText.split(t).length - 1 === 1, REFUSAL, { timeout: 15000 });
  await page.waitForTimeout(300);
  const delBody = await page.evaluate(() => document.body.innerText);
  ok(delBody.split(REFUSAL).length - 1 === 1 && !/Η διαγραφή απέτυχε/.test(delBody), 'DL-03 / K1: the refusal\'s own Greek words, once (core/api.js), not «Η διαγραφή απέτυχε»');
  // Round 1b (D2): the caller adds only the context — once, without the reason.
  ok(delBody.split('Η διαγραφή δεν έγινε — δεν άλλαξε τίποτα').length - 1 === 1, 'D2: one context line «Η διαγραφή δεν έγινε — δεν άλλαξε τίποτα» under the refusal');
  // O9 (critic-1 C1-07): the confirm said NAT_LOADS/RAMP/«ΔΕΝ ΑΝΑΙΡΕΙΤΑΙ» for a 16p piece
  const dq = (cap.dialogs || [])[0] || '';
  ok(/^Διαγραφή κομματιού #1301 — οι 16p γυρίζουν στην παρτίδα #1300\./.test(dq) && !/NAT_LOADS|ΔΕΝ ΑΝΑΙΡΕΙΤΑΙ/.test(dq), 'O9: the piece\'s confirm says what it is — ' + JSON.stringify(dq));
  const ctxs = await page.evaluate(() => window.__logCtx);
  ok(ctxs.filter(c => /_atRetry 422/.test(c)).length === 1 && !ctxs.some(c => /deleteIntlOrder/.test(c)), 'AU-07: one app_errors row (_atRetry), none from deleteIntlOrder — ' + JSON.stringify(ctxs));
  ok(cap.deletes.filter(d => d.table === 'orders').length === nOrdDel + 1, 'one DELETE sent, nothing after it (no cascade)');
  await page.screenshot({ path: shot('11-delete-refused') });
  cap.acceptDialog = false;
  // O9: a lot says what it is too — dismissed, nothing sent
  cap.dismissDialog = true; cap.dialogs = [];
  const nDel2 = cap.deletes.length;
  await page.evaluate(() => deleteIntlOrder('recLotSrc'));
  const lq = (cap.dialogs || [])[0] || '';
  ok(/^Διαγραφή παρτίδας #1300 \(33p\) — το απόθεμα φεύγει μαζί της/.test(lq) && cap.deletes.length === nDel2, 'O9: the lot\'s confirm says what it is; «Άκυρο» sends nothing — ' + JSON.stringify(lq));
  cap.dismissDialog = false;

  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

async function runAccountant(browser) {
  console.log('\n[accountant] Προς τιμολόγηση');
  const page = await newPage(browser, 'accountant', 'invoicing');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#oivBody', { timeout: 20000 });
  await page.click('.oiv-allopen');
  await page.click('.oiv-seg-b[data-tab="all"]');
  const body = (await page.locator('#oivBody').innerText()).replace(/\s+/g, ' ');
  ok(!/TEST-STOCK-1|TEST-STOCK-2/.test(body), 'pieces are never invoicing rows');
  ok(/TEST-STOCK-LOT/.test(body) && /περιμένει κομμάτια/.test(body), 'the lot is listed, blocked «περιμένει κομμάτια»');
  ok(/TEST-PLAIN/.test(body), 'an ordinary order still listed');
  ok(cap.lotReads && cap.lotReads.some(q => decodeURIComponent(q).includes('{Invoiced}=0')), 'lots read with {Invoiced}=0');
  await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).click();
  await page.waitForFunction(() => /TEST-STOCK-1/.test((document.getElementById('oivPieces') || {}).innerText || ''), null, { timeout: 8000 });
  const card = (await page.locator('#oivCard').innerText()).replace(/\s+/g, ' ');
  // O4 (critic-5 S5-04 / critic-2 E2-10): the reason ONCE (ΕΛΕΓΧΟΙ), no zero terms, neutral not red
  ok((card.match(/περιμένει κομμάτια: 2p στην αποθήκη/g) || []).length === 1 && !/0 σε κίνηση|0 χωρίς φορτηγό/.test(card), 'O4: «περιμένει κομμάτια: 2p στην αποθήκη» once on the card, no «0 …» terms — ' + card);
  const neutral = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#oivBody tr.oiv-r')].find(tr => /TEST-STOCK-LOT/.test(tr.innerText));
    const ck = [...document.querySelectorAll('#oivCard .oiv-ck')].find(e => /Παρτίδα ·/.test(e.innerText));
    return { rowBad: !!(row && row.querySelector('.oiv-st.bad')), rowWait: !!(row && row.querySelector('.oiv-st.wait')), ck: ck && ck.className, block: !!document.querySelector('#oivCard .oiv-block') };
  });
  ok(!neutral.rowBad && neutral.rowWait && /\bna\b/.test(neutral.ck || '') && !neutral.block, 'O4: waiting is neutral — list, ΕΛΕΓΧΟΙ and action block carry no red — ' + JSON.stringify(neutral));
  ok(/ΚΟΜΜΑΤΙΑ · 3/.test(card) && /TEST-STOCK-1/.test(card) && /TEST-STOCK-2/.test(card) && /TEST-STOCK-5/.test(card) && /Cold Hub B/.test(card), 'card: pieces list (ref, destination; the group piece of the print stage too) — ' + card);
  ok(!/Επιμερισμός/.test(card) && !cap.allocReq, 'accountant: no allocation block, no /costs/stock-lots request');
  ok(await page.locator('#oivNum').count() === 0, 'no invoice form while blocked');
  ok(await page.locator('.oiv-warn-btn', { hasText: 'Κλείσιμο υπολοίπου' }).count() === 1, '«Κλείσιμο υπολοίπου…» offered (chip «close», Ε3 accountant)');
  await page.screenshot({ path: shot('06-invoicing-lot-blocked') });
  // O1: with no piece drawn the modal says the WHOLE lot goes (the early-click case)
  await page.evaluate(() => { const l = { id: 'recLotZ', fields: { 'Lot No': 1400, 'Source Kind': 'intl', 'Warehouse Name': 'Αποθήκη Χ', 'Client Name': 'Πελάτης Α', 'Remaining Pallets': 33, Pieces: 0, 'Intake Delivered': true } }; OrdersStock.openCloseModal(l, () => {}); });
  await page.waitForSelector('#osCloseText');
  const ztxt = (await page.locator('#osCloseText').innerText()).replace(/\s+/g, ' ');
  ok(/^Κλείνει ΟΛΗ η παρτίδα \(33 παλέτες\) — δεν βγήκε κανένα κομμάτι\./.test(ztxt), 'O1: zero pieces → «Κλείνει ΟΛΗ η παρτίδα (33 παλέτες)…» — ' + ztxt);
  await page.screenshot({ path: shot('07a-close-modal-zero-pieces') });
  await page.click('#modal .btn-ghost');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
  await page.click('.oiv-warn-btn:has-text("Κλείσιμο υπολοίπου")');
  await page.waitForSelector('#osCloseNote');
  const mtxt = (await page.locator('#osCloseText').innerText()).replace(/\s+/g, ' ');
  ok(mtxt === 'Μένουν 2 παλέτες στην αποθήκη. Γράφονται χαμένες· η παρτίδα δεν δίνει άλλα κομμάτια. Ανοίγει ξανά μέχρι να τιμολογηθεί.', 'O1: the modal names the consequence — ' + mtxt);
  ok(!/€/.test(await page.locator('#modalBody').innerText()), 'close modal: no amount');
  await page.click('#osCloseBtn');
  ok(/υποχρεωτική/.test(await page.locator('#osCloseErr').innerText()) && !cap.patches.length, 'empty reason → refused on screen, nothing sent');
  await page.fill('#osCloseNote', '2 παλέτες χαλασμένες στην αποθήκη');
  await page.screenshot({ path: shot('07-close-modal') });
  await page.click('#osCloseBtn');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
  const pt = cap.patches.find(p => p.table === 'stock_lots');
  ok(pt && pt.id === 'recLot1' && JSON.stringify(pt.fields) === '{"Closed Note":"2 παλέτες χαλασμένες στην αποθήκη"}', 'PATCH STOCK LOTS = {Closed Note} only (the base stamps Closed At)');
  await page.waitForFunction(() => /προς κοπή/.test((document.querySelector('#oivBody tr.oiv-r.on') || document.body).innerText), null, { timeout: 8000 }).catch(() => {});
  const row = (await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).innerText()).replace(/\s+/g, ' ');
  ok(/προς κοπή/.test(row), 'after the close the set is re-read: the lot is «προς κοπή» — ' + row);
  const lastPiece0 = addDays(TODAY, -1), lastDm0 = (+lastPiece0.slice(8, 10)) + '/' + (+lastPiece0.slice(5, 7)), todayDm = (+TODAY.slice(8, 10)) + '/' + (+TODAY.slice(5, 7));
  // OWNER-Q9 answered 4/10 (ERP = original order only): the list cell = the order's own delivery
  // (the warehouse, its date), like any order — no «N παραδόσεις».
  const intakeDm = (+addDays(TODAY, -3).slice(8, 10)) + '/' + (+addDays(TODAY, -3).slice(5, 7));
  ok(/Αποθήκη Χ/.test(row) && row.includes(intakeDm) && !/παραδόσεις/.test(row), 'OWNER-Q9: list ΠΑΡΑΔΟΣΗ of the lot = «Αποθήκη Χ · ' + intakeDm + '» like any order — ' + row);
  await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).click();
  await page.waitForFunction(() => /Κλείσιμο υπολοίπου:/.test((document.getElementById('oivCard') || {}).innerText || ''), null, { timeout: 8000 });
  const rc = (await page.locator('#oivCard').innerText()).replace(/\s+/g, ' ');
  ok(new RegExp('Τελευταίο κομμάτι ' + lastDm0).test(rc) && !/Παραδόθηκε 1?\d\/\d/.test(rc.split('ΣΤΟΙΧΕΙΑ')[0]), 'O3: ready header «Τελευταίο κομμάτι ' + lastDm0 + '», never «Παραδόθηκε <intake>» — ' + rc.slice(0, 160));
  ok(rc.includes('Παρτίδα · 31/33p παραδόθηκαν') && rc.includes('Κλείσιμο υπολοίπου: 2 παλ. · 2 παλέτες χαλασμένες στην αποθήκη · ' + todayDm), 'O2: ΕΛΕΓΧΟΙ show the close where she works (31/33p · 2 παλ. · reason · date)');
  ok(await page.locator('[data-oiv="reopen"]').count() === 0, 'O1: the accountant closes but does not reopen (owner/dispatcher)');
  // O3: an invoice dated before the last piece is warned about (it passed silently against the intake)
  await page.fill('#oivDate', addDays(TODAY, -2));
  await page.dispatchEvent('#oivDate', 'input');
  ok(/πριν την παράδοση \(/.test(await page.locator('#oivHint').innerText()), 'O3: invoice date before the last piece → «πριν την παράδοση» warning');
  await page.fill('#oivDate', TODAY); await page.dispatchEvent('#oivDate', 'input');
  await page.screenshot({ path: shot('08-after-close-ready') });

  // ── OWNER-Q9 answered 4/10 (ERP = original order only): the ERP sheet of the complete lot ──
  // «η Ειρήνη καταχωρεί και τιμολογεί το αρχικό order»: the lot's row is the order's own row.
  const intake = addDays(TODAY, -3), intakeDm2 = (+intake.slice(8, 10)) + '/' + (+intake.slice(5, 7));
  await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).click();
  await page.waitForFunction(() => /TEST-STOCK-LOT/.test((document.getElementById('oivCard') || {}).innerText || ''), null, { timeout: 8000 });
  await page.evaluate(() => { OrdersInvoicingView.exportCsv(); OrdersInvoicingView.print(); return OrdersInvoicingView.copyErp(); });
  await page.waitForFunction(() => window.__csv.length && window.__printed.length && window.__clip.length, null, { timeout: 8000 });
  const erp = await page.evaluate(() => window.__csv.at(-1).rows);
  const eh = erp[0], er = erp.find(r => r[1] === 'TEST-STOCK-LOT') || [];
  ok(/^Αποθήκη Χ/.test(er[eh.indexOf('Παράδοση')] || '') && er[eh.indexOf('Ημ. παράδοσης')] === intake && er[eh.indexOf('Πελάτης')] === 'Πελάτης Α' && er[eh.indexOf('Ποσό')] === '3300.00', 'OWNER-Q9: ERP CSV lot row = the order\'s own (client, warehouse, its delivery date, price) — ' + JSON.stringify(er));
  ok(er[eh.indexOf('Παλέτες')] === '33' && !erp.some(r => /TEST-STOCK-[12]$/.test(r[1] || '')), 'OWNER-Q9: ERP CSV pallets = the order\'s own 33 (no «χαμένες»), no piece rows — ' + er[eh.indexOf('Παλέτες')]);
  const pr = (erp.find(r => r[1] === 'TEST-PLAIN') || []);
  ok(/Cold Hub B/.test(pr[eh.indexOf('Παράδοση')] || ''), 'ERP CSV: an ordinary order keeps its destination — ' + pr[eh.indexOf('Παράδοση')]);
  const erpPaper = await page.evaluate(() => window.__printed.at(-1));
  const lotTr = (erpPaper.split('<tr>').find(t => t.includes('TEST-STOCK-LOT')) || '');
  ok(/<td>Αποθήκη Χ[^<]*<\/td><td>/.test(lotTr) && lotTr.includes('<td>' + intakeDm2 + '</td>') && lotTr.includes('<td class="r">33</td>') && !/παραδόσεις|χαμένες/.test(erpPaper), 'OWNER-Q9: ERP print lot row = warehouse + its date + 33, no «παραδόσεις» / «χαμένες» — ' + lotTr.replace(/\s+/g, ' ').slice(0, 200));
  const clip = await page.evaluate(() => window.__clip.at(-1));
  const keys = clip.split('\n').map(l => l.split('\t')[0]);
  ok(JSON.stringify(keys) === JSON.stringify(['Επωνυμία', 'ΑΦΜ', 'Διεύθυνση', 'Όροι πληρωμής', 'Αναφορά πελάτη', 'Ποσό']) && clip.includes('Αναφορά πελάτη\tTEST-STOCK-LOT'), 'OWNER-Q9: «Αντιγραφή όλων» of a lot = the same lines as any order — ' + JSON.stringify(clip));
  const cardNow = (await page.locator('#oivCard').innerText()).replace(/\s+/g, ' ');
  ok(/Παράδοση [^Π]*Αποθήκη Χ/.test(cardNow), 'the card\'s ΠΑΡΑΓΓΕΛΙΑ section keeps the order\'s own route (warehouse intake)');
  const erpPage = await page.context().newPage();
  await erpPage.setContent(erpPaper.replace(/<script>[\s\S]*?<\/script>/g, ''));
  await erpPage.setViewportSize({ width: 1440, height: 700 });
  await erpPage.screenshot({ path: shot('08b-erp-print-complete-lot') });
  await erpPage.close();
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

async function runOwner(browser) {
  console.log('\n[owner] allocation block');
  const page = await newPage(browser, 'owner', 'invoicing');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#oivBody', { timeout: 20000 });
  await page.click('.oiv-allopen');
  await page.click('.oiv-seg-b[data-tab="all"]');
  await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).click();
  await page.waitForFunction(() => /Καθαρό/.test((document.getElementById('oivAlloc') || {}).innerText || ''), null, { timeout: 8000 });
  const a = (await page.locator('#oivAlloc').innerText()).replace(/\s+/g, ' ');
  ok(/Τιμή πελάτη 3\.300,00 €/.test(a) && /Καθαρό 3\.000,00 €/.test(a), 'owner: price, net — ' + a);
  ok(/Συνεργάτης 300,00 €/.test(a) && /Χρέωση αποθήκης —/.test(a) && /Σύνολο χρέωσης 300,00 €/.test(a) && !/Κόστος αποθήκης/.test(a), 'round 2 #1: owner money lines «Συνεργάτης / Χρέωση αποθήκης (— = none) / Σύνολο χρέωσης» — ' + a);
  ok(/€ \/ παλέτα 90,9091 €/.test(a), 'owner: €/pallet 90,9091');
  ok(/#1301 · 16p 1\.454,55 €/.test(a) && /#1302 · 15p 1\.363,63 €/.test(a), 'owner: per piece amounts');
  ok(/Σε απόθεμα 2p 181,82 €/.test(a), 'owner: «Σε απόθεμα 2p · 181,82 €»');
  ok(cap.allocReq && cap.allocReq.includes('/costs/stock-lots?lot=recLot1'), 'owner: GET /costs/stock-lots?lot=recLot1');
  await page.evaluate(() => document.getElementById('oivAlloc').scrollIntoView({ block: 'end' }));
  await page.screenshot({ path: shot('09-owner-allocation') });
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// Round 2 #1 (owner 4/10): the owner's «Χρέωση αποθήκης» in the lot band of the
// order form. A SEPARATE write (PATCH /costs/stock-lots/<rec>) that says its own
// result; the screen paints only what the base returned (the read-back), and after
// ANY non-200 it reads the lot again (integrator 4/10). The lot here was carried
// into the warehouse by OUR OWN truck: no partner rate, no charge yet = 'no_charge'.
async function runOwnerCharge(browser) {
  console.log('\n[owner] lot band: «Χρέωση αποθήκης»');
  const page = await newPage(browser, 'owner', 'catalog');
  const cap = page._cap;
  cap.money.partner_cost = null; setCharge(cap.money, null);
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });
  const lf = cap.fx.orders.find(o => o.id === 'recLotSrc');
  const band = () => page.$eval('#oiLotCharge', e => e.innerText.replace(/\s+/g, ' ').trim());
  const r0 = cap.allocReads;
  await page.evaluate(f => openIntlEditWith('recLotSrc', JSON.parse(JSON.stringify(f))), lf.fields);
  await page.waitForSelector('#f_WhCharge', { timeout: 8000 });
  ok(cap.allocReads === r0 + 1 && /\/costs\/stock-lots\?lot=recLot1$/.test(cap.allocReq), 'owner: the band reads GET /costs/stock-lots?lot=recLot1 once — ' + cap.allocReq);
  const b0 = await band();
  ok(/Χρέωση αποθήκης \(€\) · μόνο owner/.test(b0) && /Συνεργάτης — · Αποθήκη — · Σύνολο —/.test(b0) && /λείπει η χρέωση αποθήκης — χωρίς επιμερισμό/.test(b0), 'owner band: «Συνεργάτης — · Αποθήκη — · Σύνολο —» + «λείπει η χρέωση αποθήκης — χωρίς επιμερισμό» — ' + b0);
  ok(await page.inputValue('#f_WhCharge') === '' && await page.isVisible('#oiChargeSave') && /Αποθήκευση χρέωσης/.test(await page.innerText('#oiChargeSave')), 'owner band: empty field (no charge in the base, not 0) + «Αποθήκευση χρέωσης»');
  await page.waitForTimeout(700);   // the modal's fade-in
  await page.evaluate(() => document.getElementById('modalTitle').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: shot('16-owner-charge-band') });

  // ── 120 → PATCH {warehouse_charge:120} → repaint from the returned row ──
  const nOrd = cap.posts.length + cap.patches.length;
  await page.fill('#f_WhCharge', '120');
  ok(/Δεν αποθηκεύτηκε ακόμη/.test(await page.innerText('#oiChargeMsg')), 'typed, not saved → «Δεν αποθηκεύτηκε ακόμη — πάτα «Αποθήκευση χρέωσης»»');
  await page.click('#oiChargeSave');
  await page.waitForFunction(() => (document.getElementById('oiChargeMsg') || {}).textContent === 'Αποθηκεύτηκε', null, { timeout: 8000 });
  const p1 = cap.chargePatches.at(-1) || {};
  ok(cap.chargePatches.length === 1 && /\/costs\/stock-lots\/recLot1$/.test(p1.url) && JSON.stringify(p1.body) === '{"warehouse_charge":120}', 'PATCH /costs/stock-lots/recLot1 body {"warehouse_charge":120} — ' + JSON.stringify(p1));
  const b1 = await band();
  ok(/Συνεργάτης — · Αποθήκη 120,00 € · Σύνολο 120,00 €/.test(b1) && !/λείπει η χρέωση/.test(b1) && await page.inputValue('#f_WhCharge') === '120', 'repainted from the read-back: «Αποθήκη 120,00 € · Σύνολο 120,00 €», the «λείπει» line gone — ' + b1);
  ok(cap.posts.length + cap.patches.length === nOrd, 'a SEPARATE write: no ORDERS / STOCK LOTS write from «Αποθήκευση χρέωσης»');
  await page.screenshot({ path: shot('16b-owner-charge-saved') });

  // ── 422 lot_invoiced: the base's sentence ONCE + one context line, re-read ──
  const REASON = 'Η παρτίδα τιμολογήθηκε — δεν αλλάζει';
  cap.chargeFail = { status: 422, body: { error: { type: 'STOCK_RULE', code: 'lot_invoiced', message: REASON } } };
  const r1 = cap.allocReads;
  await page.fill('#f_WhCharge', '150');
  await page.click('#oiChargeSave');
  await page.waitForFunction(() => /Φαίνεται ό,τι έχει η βάση τώρα/.test((document.getElementById('oiLotCharge') || {}).innerText || ''), null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const all422 = await page.evaluate(() => document.body.innerText);
  ok(all422.split(REASON).length - 1 === 1 && all422.split('Φαίνεται ό,τι έχει η βάση τώρα (νέα ανάγνωση).').length - 1 === 1 && !/\[object Object\]/.test(all422), '422 lot_invoiced: the reason once + one context line, no «[object Object]»');
  ok(cap.allocReads === r1 + 1 && await page.inputValue('#f_WhCharge') === '120' && /Αποθήκη 120,00 €/.test(await band()), '422: the lot is read again — the field shows the base\'s 120, never the typed 150');
  await page.screenshot({ path: shot('16c-owner-charge-422') });

  // ── 500 «γράφτηκε, αλλά δεν ξαναδιαβάστηκε»: re-read → the new value + ONE line ──
  cap.chargeFail = { status: 500, apply: true, body: { error: 'Η χρέωση αποθήκης γράφτηκε, αλλά δεν ξαναδιαβάστηκε — άνοιξε ξανά την παραγγελία' } };
  await page.fill('#f_WhCharge', '90');
  await page.click('#oiChargeSave');
  await page.waitForFunction(() => /η νέα ανάγνωση από τη βάση το επιβεβαιώνει/.test((document.getElementById('oiChargeMsg') || {}).textContent || ''), null, { timeout: 8000 });
  const m500 = await page.$eval('#oiChargeMsg', e => ({ t: e.innerText, br: e.querySelectorAll('br').length }));
  ok(await page.inputValue('#f_WhCharge') === '90' && /Αποθήκη 90,00 € · Σύνολο 90,00 €/.test(await band()) && m500.br === 0 && !/δεν ξαναδιαβάστηκε/.test(await band()), '500 read-back lost: re-read shows 90 + ONE line «Αποθηκεύτηκε — …επιβεβαιώνει» — ' + JSON.stringify(m500));
  await page.screenshot({ path: shot('16d-owner-charge-500-reread') });

  // ── 500 and the re-read fails too: «δεν φορτώθηκε», no field holding the typed value ──
  cap.chargeFail = { status: 500, body: { error: 'Η χρέωση αποθήκης δεν αποθηκεύτηκε' } }; cap.chargeReadFail = true;
  await page.fill('#f_WhCharge', '80');
  await page.click('#oiChargeSave');
  await page.waitForFunction(() => /Η χρέωση αποθήκης δεν φορτώθηκε/.test((document.getElementById('oiLotCharge') || {}).innerText || ''), null, { timeout: 8000 });
  const bf = await band();
  ok(await page.locator('#f_WhCharge').count() === 0 && bf.split('Η χρέωση αποθήκης δεν αποθηκεύτηκε').length - 1 === 1, 'PATCH 500 + re-read failed: «δεν φορτώθηκε», no input with the typed 80, the save\'s reason once — ' + bf);
  await page.evaluate(() => closeModal());
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });

  // ── the read fails when the form opens: said, never an empty field as if 0 ──
  cap.chargeReadFail = true;
  await page.evaluate(f => openIntlEditWith('recLotSrc', JSON.parse(JSON.stringify(f))), lf.fields);
  await page.waitForFunction(() => /Η χρέωση αποθήκης δεν φορτώθηκε/.test((document.getElementById('oiLotCharge') || {}).innerText || ''), null, { timeout: 8000 });
  ok(await page.locator('#f_WhCharge').count() === 0 && await page.locator('#oiChargeSave').count() === 0, 'read failure on open: «Η χρέωση αποθήκης δεν φορτώθηκε», no empty field, no save button');
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('modalTitle').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: shot('16e-owner-charge-not-read') });
  await page.evaluate(() => closeModal());
  ok(cap.errors.length === 0, 'no page errors / native dialogs — ' + cap.errors.join(' | '));
  await page.context().close();
}

// Round 2 #1: «Προς τιμολόγηση», owner, a lot with neither a partner rate nor a charge.
async function runOwnerNoCharge(browser) {
  console.log('\n[owner] allocation block: no_charge');
  const page = await newPage(browser, 'owner', 'invoicing');
  const cap = page._cap;
  cap.money.partner_cost = null; setCharge(cap.money, null);
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#oivBody', { timeout: 20000 });
  await page.click('.oiv-allopen');
  await page.click('.oiv-seg-b[data-tab="all"]');
  await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).click();
  await page.waitForFunction(() => /εκκρεμεί/.test((document.getElementById('oivAlloc') || {}).innerText || ''), null, { timeout: 8000 });
  const a = (await page.locator('#oivAlloc').innerText()).replace(/\s+/g, ' ');
  ok(/Ο επιμερισμός εκκρεμεί: χωρίς χρέωση αποθήκης/.test(a) && !/no_charge|no_intake_cost/.test(a), 'round 2 #1: no_charge → «Ο επιμερισμός εκκρεμεί: χωρίς χρέωση αποθήκης» — ' + a);
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// O1 (critic-2 E2-01 / critic-1 C1-04): owner on «Προς τιμολόγηση», a lot the
// accountant closed by mistake — «Άνοιγμα ξανά» → confirm → ONE PATCH, the set
// re-read, the lot waits again. A refusal (lot invoiced meanwhile) is said once
// by core/api.js and the card adds only the context.
async function runReopen(browser) {
  console.log('\n[owner] Άνοιγμα ξανά (Προς τιμολόγηση)');
  const page = await newPage(browser, 'owner', 'invoicing');
  const cap = page._cap;
  Object.assign(cap.fx.lots[0].fields, { 'Closed Note': 'λάθος κλικ', 'Closed At': TODAY + 'T06:00:00Z', Complete: true, 'Completed On': TODAY, 'Written Off Pallets': 2 });
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#oivBody', { timeout: 20000 });
  await page.click('.oiv-allopen');
  await page.click('.oiv-seg-b[data-tab="all"]');
  await page.locator('#oivBody tr.oiv-r', { hasText: 'TEST-STOCK-LOT' }).click();
  await page.waitForSelector('[data-oiv="reopen"]', { timeout: 8000 });
  await page.evaluate(() => document.querySelector('.oiv-closed').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: shot('13a-owner-closed-lot-reopen') });
  // refused once (the lot was invoiced meanwhile): the base's sentence once, the card only the context
  cap.reopenFail = { type: 'STOCK_RULE', code: 'reopen_invoiced', message: 'Τιμολογημένη παρτίδα δεν ξανανοίγει' };
  await page.click('[data-oiv="reopen"]');
  await page.click('#_cfaOk');
  await page.waitForFunction(() => /Δεν άνοιξε — η παρτίδα μένει κλειστή/.test((document.getElementById('oivCard') || {}).innerText || ''), null, { timeout: 8000 });
  const both = (await page.evaluate(() => [(document.getElementById('oivCard') || {}).innerText || '', (document.getElementById('tms-toast-container') || {}).innerText || ''].join(' | '))).replace(/\s+/g, ' ');
  ok((both.match(/Τιμολογημένη παρτίδα δεν ξανανοίγει/g) || []).length === 1, 'D2: refusal once (api toast), the card says only «Δεν άνοιξε — η παρτίδα μένει κλειστή» — ' + both.slice(0, 200));
  const nP = cap.patches.length;
  await page.click('[data-oiv="reopen"]');
  await page.click('#_cfaOk');
  await page.waitForFunction(() => /περιμένει κομμάτια/.test(([...document.querySelectorAll('#oivBody tr.oiv-r')].find(tr => /TEST-STOCK-LOT/.test(tr.innerText)) || {}).innerText || ''), null, { timeout: 10000 });
  const rp = cap.patches.slice(nP);
  ok(rp.length === 1 && rp[0].table === 'stock_lots' && JSON.stringify(rp[0].fields) === '{"Closed Note":null}', 'O1: one PATCH {Closed Note:null} — ' + JSON.stringify(rp));
  ok(/άνοιξε ξανά — περιμένει κομμάτια/.test(await page.evaluate(() => (document.getElementById('toast') || {}).innerText || '')), 'O1: after the read-back the set is re-read — the lot waits for pieces again; toast says so');
  await page.screenshot({ path: shot('13b-owner-after-reopen') });
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// G-07: the warehouse role never asks STOCK LOTS (no grant → 403 toast storm).
async function runWarehouse(browser) {
  console.log('\n[warehouse] Παραγγελίες');
  const page = await newPage(browser, 'warehouse', 'catalog');
  const cap = page._cap;
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recPc1', { timeout: 20000 });
  const set = await page.evaluate(async () => { const s = await OrdersData.loadInvoicingSet(true); const lot = s.intl.find(r => r.id === 'recLotSrc'); return { lots: s.intl.filter(r => OrdersStock.isLot(r.fields)).length, st: lot && OrdersData.stateOf(s, lot), failed: s.stockFailed }; });
  ok(set.lots === 1, 'the set holds the lot (the read would have been asked)');
  ok(cap.lotReqs === 0, 'G-07: no STOCK LOTS request for the warehouse role (' + cap.lotReqs + ')');
  ok(set.st && set.st.key === 'blocked' && set.st.reason === 'stock' && set.failed === false, 'G-07: its lot stays blocked, no «failed» banner — ' + JSON.stringify(set.st));
  ok(!/δικαίωμα/.test(await page.evaluate(() => (document.getElementById('tms-toast-container') || {}).innerText || '')), 'no «Δεν έχετε δικαίωμα» toast');
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// PR-05 / round 1 O10 (critic-4 C4-05): the piece's driver sheet names the
// lot by the REFERENCE the warehouse knows («Stock Lot Reference», Worker label
// after S2) and falls back to «#N» before the deploy — no client, no money, no «ΑΠ ·».
async function runPrint(browser) {
  console.log('\n[print] piece driver sheet');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await page.goto('print.html?orderId=recPc1&leg=import&sheet=driver');
  await page.waitForFunction(() => /Εντολή Οδηγού/.test(document.body.innerText), null, { timeout: 20000 });
  const t = (await page.locator('#doc').innerText()).replace(/\s+/g, ' ');
  const meta = await page.evaluate(() => { const i = [...document.querySelectorAll('.meta-item')].find(e => /απόθεμα/i.test(e.querySelector('.meta-lbl').textContent)); return i ? i.querySelector('.meta-val').textContent : ''; });
  ok(meta === 'Ref TEST-STOCK-LOT · παρτίδα #1300', 'O10/C4-05: piece sheet «Ref <lot Reference> · παρτίδα #1300», no «ΑΠ ·» — ' + JSON.stringify(meta));
  ok(!/Πελάτης Α/.test(t) && !/€|3\.?300/.test(t), 'PR-05: no client name, no money on the sheet');
  const wa = await page.evaluate(() => _waArr.join('\n'));
  ok(/Απόθεμα · Ref TEST-STOCK-LOT · παρτίδα #1300/.test(wa), 'O10/C4-02: the WhatsApp text marks the piece as stock — ' + JSON.stringify(wa.split('\n').filter(l => /παρτίδα/.test(l))));
  await page.screenshot({ path: shot('12-print-piece-sheet'), fullPage: false });
  // before the Worker serves «Stock Lot Reference»: the lot number alone (facade trap #2: absent)
  await page.goto('print.html?orderId=recPc2&leg=import&sheet=driver');
  await page.waitForFunction(() => /Εντολή Οδηγού/.test(document.body.innerText), null, { timeout: 20000 });
  const meta2 = await page.evaluate(() => { const i = [...document.querySelectorAll('.meta-item')].find(e => /απόθεμα/i.test(e.querySelector('.meta-lbl').textContent)); return i ? i.querySelector('.meta-val').textContent : ''; });
  ok(meta2 === 'παρτίδα #1300', 'O10/C4-05: no «Stock Lot Reference» label yet → «παρτίδα #1300» — ' + JSON.stringify(meta2));
  await page.goto('print.html?orderId=recPlain&leg=export&sheet=driver');
  await page.waitForFunction(() => /Εντολή Οδηγού/.test(document.body.innerText), null, { timeout: 20000 });
  ok(!/Παρτίδα|παρτίδα/.test(await page.locator('#doc').innerText()), 'an ordinary order prints no lot line');
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// O10 (critic-4 C4-01/C4-02): ⎙I of a truck whose import group holds a piece.
// The COVER is what the driver reads at each stop: chips from every member.
async function runPrintGroup(browser) {
  console.log('\n[print] group packet with a piece');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('print.html?orderIds=recLead,recGPc&leg=import&sheet=driver');
  await page.waitForFunction(() => document.querySelectorAll('.p-doc').length >= 3, null, { timeout: 20000 });
  const docs = await page.$$eval('.p-doc', es => es.map(e => e.innerText.replace(/\s+/g, ' ')));
  const chips = await page.evaluate(() => { const c = document.querySelector('.p-doc .cargo'); return c ? [...c.querySelectorAll('.chip')].map(x => x.innerText.replace(/\s+/g, ' ')) : []; });
  ok(chips.some(c => /18 × EUR \+ 15 × CHEP/.test(c)), 'O10/C4-01: cover pallets chip lists every type «18 × EUR + 15 × CHEP» — ' + JSON.stringify(chips));
  ok(chips.some(c => /ΝΑΙ — μόνο A TEST-LEAD/.test(c)), 'O10/C4-01: cover PE «ΝΑΙ — μόνο A TEST-LEAD» (the piece never exchanges) — ' + JSON.stringify(chips));
  ok(/ΠΑΡΑΓΓΕΛΙΑ B · 2002 · [^·]+ · Απόθεμα · Ref TEST-STOCK-LOT · παρτίδα #1300/.test(docs[0]), 'O10/C4-02: the cover stop of the piece is marked as stock');
  const wa = await page.evaluate(() => _waArr);
  ok(wa.length >= 2 && /Απόθεμα · Ref TEST-STOCK-LOT · παρτίδα #1300/.test(wa[wa.length - 1]) && !/Απόθεμα/.test(wa[0]), 'O10/C4-02: the piece\'s WhatsApp text (right-click share) says stock; the lead\'s does not');
  await page.screenshot({ path: shot('14-print-group-packet'), fullPage: true });
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// Round 1b (F3): the lot Reference and the PE reference list are typed by people —
// on the paper they are text, never markup; the WhatsApp text keeps them as typed.
async function runPrintEscape(browser) {
  console.log('\n[print] escaping of typed references');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  const RAW_LOT = 'LOT <b>X</b> & 1', RAW_LEAD = 'L<i>1</i>';
  cap.fx.orders.find(o => o.id === 'recGPc').fields['Stock Lot Reference'] = RAW_LOT;
  cap.fx.orders.find(o => o.id === 'recLead').fields.Reference = RAW_LEAD;
  await page.goto('print.html?orderIds=recLead,recGPc&leg=import&sheet=driver');
  await page.waitForFunction(() => document.querySelectorAll('.p-doc').length >= 3, null, { timeout: 20000 });
  const r = await page.evaluate(() => {
    const tag = [...document.querySelectorAll('.stoptag')].find(t => /Απόθεμα/.test(t.textContent));
    const pe = [...document.querySelectorAll('.p-doc .cargo .chip')].find(c => /μόνο/.test(c.textContent));
    const meta = [...document.querySelectorAll('.meta-item')].find(e => /απόθεμα/i.test(e.querySelector('.meta-lbl').textContent));
    return { tag: tag ? tag.textContent : '', tagEl: tag ? tag.querySelectorAll('b,i').length : -1,
      pe: pe ? pe.textContent.replace(/\s+/g, ' ') : '', peEl: pe ? pe.querySelectorAll('i').length : -1,
      meta: meta ? meta.querySelector('.meta-val').textContent : '', metaEl: meta ? meta.querySelectorAll('b').length : -1,
      wa: (window._waArr || []).join('\n') };
  });
  ok(r.tag.includes('Ref ' + RAW_LOT) && r.tagEl === 0, 'F3: cover stop tag prints the lot Reference as text — ' + JSON.stringify([r.tag, r.tagEl]));
  ok(r.pe.includes('A ' + RAW_LEAD) && r.peEl === 0, 'F3: cover PE chip prints the reference as text — ' + JSON.stringify([r.pe, r.peEl]));
  ok(r.meta.includes('Ref ' + RAW_LOT) && r.metaEl === 0, 'F3: piece sheet meta prints the lot Reference as text — ' + JSON.stringify([r.meta, r.metaEl]));
  ok(r.wa.includes('Ref ' + RAW_LOT) && !r.wa.includes('&amp;') && !r.wa.includes('&lt;'), 'F3: WhatsApp text keeps the Reference as typed (not escaped)');
  // Round 2 (task B): the order's OWN Reference (refNo) — meta «Reference» and «ORDER … · REF …».
  const own = await page.evaluate(() => {
    const doc = [...document.querySelectorAll('.p-doc')].find(d => /REF L/.test((d.querySelector('.ordno') || {}).textContent || ''));
    const meta = doc && [...doc.querySelectorAll('.meta-item')].find(e => e.querySelector('.meta-lbl').textContent === 'Reference');
    const ord = doc && doc.querySelector('.ordno');
    return { meta: meta ? meta.querySelector('.meta-val').textContent : '', metaEl: meta ? meta.querySelectorAll('i').length : -1,
      ord: ord ? ord.textContent : '', ordEl: ord ? ord.querySelectorAll('i').length : -1 };
  });
  ok(own.meta === RAW_LEAD && own.metaEl === 0 && own.ord.endsWith('REF ' + RAW_LEAD) && own.ordEl === 0, 'task B: the order\'s own Reference «' + RAW_LEAD + '» prints as text in the meta grid and the ORDER line — ' + JSON.stringify(own));
  ok(/Ref: L<i>1<\/i>/.test(r.wa), 'task B: the WhatsApp text keeps the order Reference as typed');
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

// O10 (critic-4 C4-03): the lot's partner sheet — the exchange is at the
// client's loading (Ε5), never at the warehouse intake (no ledger movement there).
async function runPrintLotPartner(browser) {
  console.log('\n[print] lot partner sheet');
  const page = await newPage(browser, 'dispatcher', 'catalog');
  const cap = page._cap;
  Object.assign(cap.fx.orders.find(o => o.id === 'recLotSrc').fields, { 'Pallet Exchange': true, Partner: ['recPa'], 'Is Partner Trip': true, 'Partner Rate': 300, 'Pallet Type': 'EUR' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('print.html?orderId=recLotSrc&leg=export&sheet=partner');
  await page.waitForFunction(() => /Partner Assignment Order/.test(document.body.innerText), null, { timeout: 20000 });
  const stops = await page.$$eval('.stop', es => es.map(e => ({ type: (e.querySelector('.type') || {}).textContent, pe: ([...e.querySelectorAll('.f')].find(f => /Pallet Exchange/.test(f.innerText)) || { innerText: '' }).innerText.replace(/\s+/g, ' ') })));
  const load = stops.find(x => x.type === 'LOADING') || {}, del = stops.find(x => x.type === 'DELIVERY') || {};
  ok(/YES/.test(load.pe) && /Pallet Exchange NO/.test(del.pe), 'O10/C4-03: loading card PE YES, warehouse delivery card PE NO — ' + JSON.stringify(stops));
  const wa = await page.evaluate(() => _waArr.join('\n'));
  ok(/Pallet Exchange: YES at loading · NO at the warehouse/.test(wa), 'O10/C4-03: the WhatsApp text says YES at loading · NO at the warehouse — ' + JSON.stringify(wa.split('\n').filter(l => /Pallet/.test(l))));
  ok(!/3\.?300/.test(await page.locator('#doc').innerText()), 'no client price on the partner sheet');
  await page.screenshot({ path: shot('15-print-lot-partner'), fullPage: true });
  ok(cap.errors.length === 0, 'no page errors — ' + cap.errors.join(' | '));
  await page.context().close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const run of [runCatalog, runForm, runFormTick, runLotCreate, runPiece, runLotEdit, runAccountant, runOwner, runOwnerCharge, runOwnerNoCharge, runReopen, runWarehouse, runPrint, runPrintGroup, runPrintEscape, runPrintLotPartner]) {
      try { await run(browser); } catch (e) { failed++; console.log('  ✗ ' + run.name + ' threw: ' + (e && e.stack || e)); }
    }
  } finally { await browser.close(); }
  console.log(`\n${passed} passed, ${failed} failed · shots in ${OUT_DIR}`);
  process.exit(failed ? 1 : 0);
})();
