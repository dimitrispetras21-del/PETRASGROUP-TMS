// Proof script for the «Εβδομάδα» view of «Παραγγελίες» (modules/orders_week_view.js),
// owner 28/9/2026, Figma 808:1011.
//
// Run from the MAIN repo root (its node_modules + .har), against a server that
// serves the worktree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<dir>/ node <dir>/tests/critics/orders-week-proof.js
//
// Pattern of tests/critics/invoicing-proof.js: preparePage (fake session + HAR
// replay) from tests/critics/auth.js, then page.route mocks registered AFTER it
// so they win for every backend call the view makes. Everything is SYNTHETIC
// demo data shaped like the Figma (no production names, no real numbers).
// Dates are relative to the last complete Saturday–Friday week, so the rig does
// not rot with the calendar.
//
// What is proven: totals (turnover without unpriced orders, invoiced, pending),
// RT grouping by Weekly day, the Friday RT whose import is next week, the
// import-only RT, «Χωρίς RT», the national block, the three scopes, the vehicle
// grouping, the /costs/rt failure banner, the dispatcher not seeing the tab,
// and that NO request ever reaches /costs/pnl (owner-only margins).

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-sleepy-mendeleev/31d040e2-ec65-4031-a029-e7fdc70e1ac8/scratchpad/rig';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = name => path.join(SHOT_DIR, 'week-' + name + '.png');

const T = {
  ORDERS: 'tblgHlNmLBH3JTdIM', NAT_ORDERS: 'tblGHCCsTMqAy4KR2', CLIENTS: 'tblFWKAQVUzAM8mCE',
  TRUCKS: 'tblEAPExIAjiA3asD', DRIVERS: 'tbl7UGmYhc2Y82pPs', PARTNERS: 'tblLHl5m8bqONfhWv', LOCATIONS: 'tblxu8DRfTQOFRCzS',
};

// ── dates: the last complete week (Sat → Fri), local calendar ───────────────
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const thisSat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 1) % 7);
const W0 = new Date(thisSat.getFullYear(), thisSat.getMonth(), thisSat.getDate() - 7);
const day = (k, hh = 9) => { const d = new Date(W0.getFullYear(), W0.getMonth(), W0.getDate() + k); return ymd(d) + `T${pad(hh)}:00:00.000Z`; };
const dm = k => { const d = new Date(W0.getFullYear(), W0.getMonth(), W0.getDate() + k); return d.getDate() + '/' + (d.getMonth() + 1); };

// ── reference data ──────────────────────────────────────────────────────────
const CLIENTS = [
  ['recC1', 'Alpina Fresh S.r.l.'], ['recC2', 'Danubia Market Kft.'], ['recC3', 'Nordfrisch GmbH'], ['recC4', 'Baltic Cold Foods Sp. z o.o.'],
  ['recC5', 'Γαλακτοκομική Ηπείρου Α.Ε.'], ['recC6', 'Φρουτοποιία Νάουσας Α.Ε.'], ['recC7', 'Ανδρέου Logistics Μ.Ι.Κ.Ε.'], ['recC8', 'Ελαιώνες Μεσσηνίας Α.Ε.'],
].map(([id, n]) => ({ id, fields: { 'Company Name': n } }));
const TRUCKS = [['recT1', 'ΚΗΙ 5102'], ['recT2', 'ΚΗΙ 4521'], ['recT3', 'ΚΗΙ 2208'], ['recT4', 'ΚΗΙ 3310']].map(([id, p]) => ({ id, fields: { 'License Plate': p, Active: true } }));
const DRIVERS = [['recD1', 'Σ. Κάππος'], ['recD2', 'Γ. Αλεξίου'], ['recD3', 'Π. Ράπτης'], ['recD4', 'Ν. Δήμου']].map(([id, n]) => ({ id, fields: { 'Full Name': n, Active: true } }));
const PARTNERS = [{ id: 'recPT1', fields: { 'Company Name': 'Transfrigo Kft.' } }];
const LOCS = [
  ['recL1', 'Petras Cross-Dock', 'Veroia', 'GR'], ['recL2', 'Mercato Verona', 'Verona', 'IT'], ['recL3', 'DM Budapest', 'Budapest', 'HU'],
  ['recL4', 'Baltic Poznań', 'Poznań', 'PL'], ['recL5', 'Nordfrisch Süd', 'München', 'DE'], ['recL6', 'Centro Bologna', 'Bologna', 'IT'],
  ['recL7', 'Danubia Wien', 'Wien', 'AT'], ['recL8', 'Nordfrisch Hafen', 'Hamburg', 'DE'], ['recL9', 'Aspropyrgos Hub', 'Aspropyrgos', 'GR'],
  ['recL10', 'Alpina Parma', 'Parma', 'IT'], ['recL11', 'Dodoni Dairy', 'Dodoni', 'GR'], ['recL12', 'Kalochori Depot', 'Kalochori', 'GR'],
  ['recL13', 'Tripoli Yard', 'Tripoli', 'GR'], ['recL14', 'Messini Mill', 'Messini', 'GR'], ['recL15', 'Hamburg Nord', 'Hamburg', 'DE'],
].map(([id, n, c, cc]) => ({ id, fields: { Name: n, City: c, Country: cc } }));

// ── orders ──────────────────────────────────────────────────────────────────
const io = (id, no, dir, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: dir, 'Order ID': no, 'Order No': no, Status: 'Delivered' }, f) });
const exp = (id, no, client, to, delK, f) => io(id, no, 'Export', Object.assign({ Client: [client], 'Loading Location 1': ['recL1'], 'Unloading Location 1': [to], 'Loading DateTime': day(delK - 2), 'Delivery DateTime': day(delK) }, f));
const imp = (id, no, client, from, to, loadK, f) => io(id, no, 'Import', Object.assign({ Client: [client], 'Loading Location 1': [from], 'Unloading Location 1': [to], 'Loading DateTime': day(loadK, 6), 'Delivery DateTime': day(loadK + 2) }, f));
const own = (t, d) => ({ Truck: [t], Driver: [d] });
const partner = { Partner: ['recPT1'] };

const ORDERS = [
  exp('recO1225', 1225, 'recC3', 'recL5', 1, partner),                                                                      // Sun, NO price → blocked (τιμή)
  exp('recO1214', 1214, 'recC1', 'recL2', 2, Object.assign({ Price: 3200, Invoiced: true, 'Invoice Number': '0431', 'Invoice Date': day(4) }, own('recT1', 'recD1'))),
  exp('recO1227', 1227, 'recC2', 'recL3', 2, Object.assign({ Price: 2900, 'Pallet Exchange': true }, own('recT2', 'recD2'))),   // gate: slip missing
  imp('recO1228', 1228, 'recC4', 'recL4', 'recL1', 2, Object.assign({ Price: 2650 }, own('recT3', 'recD3'))),               // import-only RT
  exp('recO1229', 1229, 'recC1', 'recL6', 5, Object.assign({ Price: 3350, 'Veroia Switch': true }, own('recT4', 'recD4'))),
  exp('recO1232', 1232, 'recC2', 'recL7', 5, Object.assign({ Price: 2750, Invoiced: true, 'Invoice Number': '0433', 'Invoice Date': day(6) }, partner)),
  imp('recO1230', 1230, 'recC3', 'recL8', 'recL9', 5, Object.assign({ Price: 2800 }, partner)),
  exp('recO1233', 1233, 'recC1', 'recL10', 6, Object.assign({ Price: 3350 }, own('recT1', 'recD1'))),                        // FRIDAY
  imp('recO1236', 1236, 'recC3', 'recL15', 'recL1', 9, Object.assign({ Price: 2000, Status: 'Assigned' }, own('recT1', 'recD1'))),   // next Monday
  exp('recO1240', 1240, 'recC3', 'recL5', 4, Object.assign({ Price: 1500, Status: 'In Transit' }, own('recT2', 'recD2'))),   // NO RT
  exp('recO1199', 1199, 'recC2', 'recL3', 1, { Price: 999, Status: 'Cancelled' }),                                         // cancelled: never counted
  // previous weeks (strip + %): 21.000 € the week before
  exp('recO1201', 1201, 'recC1', 'recL2', -5, { Price: 12000, Invoiced: true, 'Invoice Number': '0410' }),
  exp('recO1202', 1202, 'recC2', 'recL3', -3, { Price: 9000, Invoiced: true, 'Invoice Number': '0411' }),
  exp('recO1190', 1190, 'recC2', 'recL3', -10, { Price: 18940, Invoiced: true, 'Invoice Number': '0400' }),
  exp('recO1180', 1180, 'recC1', 'recL2', -17, { Price: 21310 }),
];
const nat = (id, client, ref, from, to, k, f) => ({ id, fields: Object.assign({ Client: [client], Reference: ref, Type: 'Independent', 'Pickup Location 1': [from], 'Delivery Location 1': [to], 'Loading DateTime': day(k, 7), 'Delivery DateTime': day(k, 15) }, f) });
const NAT = [
  nat('recN418', 'recC5', '4500128790', 'recL11', 'recL1', 1, { Price: 560 }),
  nat('recN420', 'recC6', 'ΠΑΡ 4466', 'recL1', 'recL12', 2, { Price: 390, Invoiced: true, 'Invoice Number': '0429', 'Invoice Date': day(5) }),
  nat('recN421', 'recC7', '', 'recL13', 'recL1', 4, {}),
  nat('recN423', 'recC8', 'ΔΑ 5531', 'recL1', 'recL14', 5, { Price: 880 }),
  nat('recN425', 'recC5', '4500128833', 'recL1', 'recL11', 6, { Price: 540 }),
];
const GATE = [{ order_rec: 'recO1227', order_id: 1227, loading_stops: 1, covered_stops: 0, sheets_ok: false }];
const leg = (order_id, direction, seq, extra) => Object.assign({ id: order_id * 10 + seq, order_id, direction, seq, nat_load_id: null }, extra || {});
const RTS = [
  { id: 1183, code: 'RT-1183', date_start: day(-1).slice(0, 10), status: 'closed', ct_rt_legs: [leg(1225, 'EXPORT', 1)] },
  { id: 1181, code: 'RT-1181', date_start: day(0).slice(0, 10), status: 'closed', ct_rt_legs: [leg(1214, 'EXPORT', 1)] },
  { id: 1182, code: 'RT-1182', date_start: day(0).slice(0, 10), status: 'closed', ct_rt_legs: [leg(1227, 'EXPORT', 1)] },
  { id: 1185, code: 'RT-1185', date_start: day(1).slice(0, 10), status: 'closed', ct_rt_legs: [leg(1228, 'IMPORT', 1)] },
  { id: 1186, code: 'RT-1186', date_start: day(3).slice(0, 10), status: 'open', ct_rt_legs: [leg(1229, 'EXPORT', 1), leg(null, 'IMPORT', 2, { order_id: null, nat_load_id: 55 })] },
  { id: 1187, code: 'RT-1187', date_start: day(3).slice(0, 10), status: 'open', ct_rt_legs: [leg(1232, 'EXPORT', 1), leg(1230, 'IMPORT', 2)] },
  { id: 1188, code: 'RT-1188', date_start: day(4).slice(0, 10), status: 'open', ct_rt_legs: [leg(1233, 'EXPORT', 1), leg(1236, 'IMPORT', 2)] },
  { id: 1199, code: 'RT-1199', date_start: day(3).slice(0, 10), status: 'cancelled', ct_rt_legs: [leg(1240, 'EXPORT', 1)] },
];

// ── mocks ───────────────────────────────────────────────────────────────────
const isInvoicingQuery = u => /Status%7D%3D%22Delivered%22|\{Status\}="Delivered"/.test(u);
function installMocks(page, log, opts = {}) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  // Anything else on the Worker: an empty answer, never the live backend.
  page.route('**/petras-tms-backend-staging.petrasgroup.workers.dev/**', route => json(route, { records: [] }));
  page.route(`**/${T.ORDERS}**`, route => {
    const u = decodeURIComponent(route.request().url());
    log.push(u);
    // OrdersData's invoicing set asks for delivered/invoiced only (all time).
    const recs = isInvoicingQuery(u) ? ORDERS.filter(r => ['Delivered', 'Invoiced'].includes(r.fields.Status) || r.fields.Invoiced) : ORDERS;
    return json(route, { records: recs });
  });
  page.route(`**/${T.NAT_ORDERS}**`, route => {
    log.push(decodeURIComponent(route.request().url()));
    if (opts.natlFail) return json(route, { error: 'boom' }, 500);
    return json(route, { records: NAT });
  });
  page.route(`**/${T.CLIENTS}**`, route => json(route, { records: CLIENTS }));
  page.route(`**/${T.TRUCKS}**`, route => json(route, { records: TRUCKS }));
  page.route(`**/${T.DRIVERS}**`, route => json(route, { records: DRIVERS }));
  page.route(`**/${T.PARTNERS}**`, route => json(route, { records: PARTNERS }));
  page.route(`**/${T.LOCATIONS}**`, route => json(route, { records: LOCS }));
  page.route('**/costs/rt**', route => {
    log.push(route.request().url());
    if (opts.rtFail) return json(route, { error: 'Failed to load' }, 500);
    return json(route, { records: RTS });
  });
  page.route('**/costs/pnl**', route => { log.push('PNL ' + route.request().url()); return json(route, { records: [] }); });
  page.route('**/pallets/gate**', route => json(route, { records: GATE }));
}

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } }

async function newPage(browser, role, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const errors = [], log = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
  page.on('request', r => { if (/\/costs\/pnl/.test(r.url())) log.push('PNL ' + r.url()); });
  await preparePage(page, role);
  await page.addInitScript(r => {
    localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'all', view: 'week' }));
  }, role);
  installMocks(page, log, opts);
  page._errors = errors; page._log = log;
  return page;
}

async function openWeek(page) {
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('.owv-kpi', { timeout: 20000 });
}
// The app scrolls inside #content, so fullPage stops at the viewport: grow the
// viewport to the content height for the shot, then put it back.
async function snap(page, name) {
  const h = await page.evaluate(() => { const c = document.getElementById('content'); return Math.max(960, (c ? c.scrollHeight + c.getBoundingClientRect().top : 0) + 40); });
  await page.setViewportSize({ width: 1440, height: Math.min(h, 4000) });
  await page.waitForTimeout(150);
  await page.screenshot({ path: shot(name) });
  await page.setViewportSize({ width: 1440, height: 960 });
}
const text = (page, sel) => page.locator(sel).first().innerText();
const rowOf = (page, code) => page.locator('.owv-t:not(.owv-tn) tr.owv-row', { hasText: code });
// Stray errors the view cannot cause: the app's own background reads that the
// catch-all answers with an empty list. Anything else counts.
const realErrors = page => page._errors.filter(e => !/favicon/.test(e));

async function runOwner(browser) {
  console.log('\n[owner] Παραγγελίες → Εβδομάδα');
  const page = await newPage(browser, 'owner');
  await openWeek(page);

  const tab = page.locator('.oh-tab[data-view="week"]');
  assert(await tab.count() === 1 && /Εβδομάδα/.test(await tab.innerText()) && (await tab.getAttribute('aria-selected')) === 'true', 'tab «Εβδομάδα» visible and selected');
  const sub = await text(page, '#ohSub');
  assert(/εξαγωγή κατά παράδοση, εισαγωγή κατά φόρτωση/.test(sub), 'sub-title states the Weekly rule');

  const kpi = await text(page, '.owv-kpi');
  assert(/24\.870,00 €/.test(kpi), 'hero turnover 24.870,00 € (22.500 intl + 2.370 natl; unpriced not summed as 0)');
  assert(/\+18% από την προηγούμενη/.test(kpi) && /εκτός 2 χωρίς τιμή/.test(kpi), '«+18% … · εκτός 2 χωρίς τιμή» (prev week 21.000 €)');
  assert(/Διεθνή · 7 RT/.test(kpi) && /22\.500,00 €/.test(kpi), 'Διεθνή · 7 RT · 22.500,00 € (the next-week import of RT-1188 is not summed here)');
  assert(/Εθνικά · 5/.test(kpi) && /2\.370,00 €/.test(kpi), 'Εθνικά · 5 · 2.370,00 €');
  assert(/Τιμολογημένες · 6\.340,00 €/.test(kpi) && /3 \/ 14/.test(kpi) && /εκκρεμούν 11/.test(kpi), 'Τιμολογημένες · 6.340,00 € · 3 / 14 · εκκρεμούν 11');
  assert(/Μπλοκαρισμένες\s*3/.test(kpi), 'chip Μπλοκαρισμένες 3 (τιμή ×2, δελτίο ×1)');
  assert(/Χωρίς τιμή\s*2 · όλες 2/.test(kpi), 'chip «Χωρίς τιμή 2 · όλες 2 →»');

  const strip = await text(page, '.owv-strip');
  assert(/21\.310,00 €/.test(strip) && /18\.940,00 €/.test(strip) && /21\.000,00 €/.test(strip) && /24\.870,00 €/.test(strip), 'week strip shows the turnover of 4 past weeks');
  assert(/✓ όλα/.test(strip) && /1 ανοιχτό/.test(strip) && /σε εξέλιξη/.test(strip) && /11 ανοιχτά/.test(strip), 'strip statuses: ✓ όλα · 1 ανοιχτό · 11 ανοιχτά · σε εξέλιξη');
  assert(await page.locator('.owv-wk.on').count() === 1, 'one selected week');

  const groups = await page.locator('.owv-t tr.owv-g').allInnerTexts();
  const g = groups.map(s => s.replace(/\s+/g, ' ').trim());
  assert(g.length === 5, 'five groups (4 days + Χωρίς RT): ' + JSON.stringify(g));
  assert(g[0] === `ΚΥΡΙΑΚΗ ${dm(1)} 1 RT · χωρίς τιμή`, 'Sunday group «1 RT · χωρίς τιμή»: ' + g[0]);
  assert(g[1] === `ΔΕΥΤΕΡΑ ${dm(2)} 3 RT · 8.750,00 €`, 'Monday «3 RT · 8.750,00 €» (incl. the import-only RT-1185): ' + g[1]);
  assert(g[2] === `ΠΕΜΠΤΗ ${dm(5)} 2 RT · 8.900,00 €`, 'Thursday «2 RT · 8.900,00 €»: ' + g[2]);
  assert(g[3] === `ΠΑΡΑΣΚΕΥΗ ${dm(6)} 1 RT · 3.350,00 €`, 'Friday delivery stays in this week: ' + g[3]);
  assert(g[4] === 'ΧΩΡΙΣ RT 1 παραγγελία · 1.500,00 €', '«Χωρίς RT» group lists the order no RT counts: ' + g[4]);
  assert(await page.locator('.owv-t:not(.owv-tn) tr.owv-row').count() === 8, '8 rows (7 RT + 1 without RT); the cancelled RT-1199 absent');

  assert(/✓ ΤΠΥ 0431/.test(await rowOf(page, 'RT-1181').innerText()), 'RT-1181 → ✓ ΤΠΥ 0431');
  assert(/δελτίο → Αλεξία/.test(await rowOf(page, 'RT-1182').innerText()), 'RT-1182 → δελτίο → Αλεξία (pallet gate)');
  const r83 = await rowOf(page, 'RT-1183').innerText();
  assert(/τιμή → owner/.test(r83) && /χωρίς τιμή/.test(r83) && /Transfrigo Kft\./.test(r83) && /συνεργάτης/.test(r83), 'RT-1183 → χωρίς τιμή + τιμή → owner, partner «Transfrigo Kft. · συνεργάτης»');
  const r87 = await rowOf(page, 'RT-1187').innerText();
  assert(/1 \/ 2 · 2\.800,00/.test(r87) && /ΤΠΥ 0433 · 2\.750,00/.test(r87) && /5\.550,00/.test(r87), 'RT-1187 partly invoiced «1 / 2 · 2.800,00», leg «✓ ΤΠΥ 0433 · 2.750,00», RT 5.550,00');
  const r88 = await rowOf(page, 'RT-1188').innerText();
  assert(/μετρά εκεί/.test(r88) && /#1236/.test(r88) && /3\.350,00/.test(r88) && !/5\.350,00/.test(r88), 'RT-1188: next-week import shown dimmed «μετρά εκεί», RT turnover 3.350,00 only');
  const r85 = await rowOf(page, 'RT-1185').innerText();
  assert(/#1228/.test(r85) && /Poznań PL → Veroia GR/.test(r85) && /Baltic Cold Foods/.test(r85), 'RT-1185 import-only: #1228 Baltic Cold Foods, «Poznań PL → Veroia GR»');
  assert((await rowOf(page, 'RT-1186').locator('.owv-leg').count()) === 1, 'RT-1186: the VS national leg is not a leg on this screen');
  const foot = await text(page, '.owv-t tfoot');
  assert(/Διεθνή · 7 RT · 9 παραγγελίες · 5 με ένα μόνο σκέλος/.test(foot) && /22\.500,00 €/.test(foot) && /τιμολογ\. 5\.950,00 €/.test(foot), 'footer «Διεθνή · 7 RT · 9 παραγγελίες · 5 με ένα μόνο σκέλος» 22.500,00 € · τιμολογ. 5.950,00 €: ' + foot.replace(/\s+/g, ' '));

  const natl = await text(page, '.owv-card:has(.owv-nh)');
  assert(/ΕΘΝΙΚΕΣ ΤΗΣ ΕΒΔΟΜΑΔΑΣ/.test(natl) && /5 παραγγελίες · 2\.370,00 € · 1 χωρίς τιμή/.test(natl), 'national block header «5 παραγγελίες · 2.370,00 € · 1 χωρίς τιμή»');
  assert(await page.locator('.owv-tn tr.owv-row').count() === 5 && /✓ ΤΠΥ 0429/.test(natl) && /Dodoni GR → Veroia GR/.test(natl), 'five national rows, ✓ ΤΠΥ 0429, route «Dodoni GR → Veroia GR»');
  const n421 = await page.locator('.owv-tn tr', { hasText: 'Ανδρέου' }).innerText();
  assert(/χωρίς τιμή/.test(n421) && /τιμή → owner/.test(n421), 'unpriced national: «χωρίς τιμή» + «τιμή → owner»');

  const sum = (await text(page, '.owv-sum')).replace(/\s+/g, ' ');
  assert(/Εκκρεμούν 11/.test(sum) && /7 προς κοπή \(14\.130,00 €\)/.test(sum) && /3 μπλοκαρισμένες: δελτίο → Αλεξία \(1\), τιμή → owner \(2\)/.test(sum) && /1 σε εξέλιξη/.test(sum), 'summary: Εκκρεμούν 11 · 7 προς κοπή (14.130,00 €) · 3 μπλοκαρισμένες: δελτίο → Αλεξία (1), τιμή → owner (2) · 1 σε εξέλιξη');
  assert(/παλαιότερη εκκρεμής \d+ ημέρες/.test(sum), 'summary: «παλαιότερη εκκρεμής N ημέρες»');

  // The request that feeds it: one ORDERS window, /costs/rt with overlap, never /costs/pnl.
  const oq = page._log.find(u => u.includes(T.ORDERS) && u.includes("{Direction}='Import'"));
  assert(!!oq && /\{Direction\}='Export'/.test(oq), 'one ORDERS read carries exports + imports of the strip window');
  assert(page._log.some(u => /\/costs\/rt\?overlap=1&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/.test(u)), '/costs/rt?overlap=1&from=&to= requested');
  await snap(page, '01-owner-day');

  // ── CSV: one line per order, the same numbers as the screen ──
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('[data-owv="csv"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, '').split('\n');
  const sumCsv = csv.slice(1).reduce((s, l) => { const c = l.split('","'); const v = parseFloat((c[10] || '').replace(',', '.')); return s + (Number.isFinite(v) ? v : 0); }, 0);
  assert(dl.suggestedFilename() === 'orders_week_' + ymd(W0) + '.csv' && csv.length === 15 && sumCsv === 24870, 'CSV ' + dl.suggestedFilename() + ': 14 order lines (9 intl + 5 natl), Σ price 24.870 — got ' + (csv.length - 1) + ' / ' + sumCsv);

  // ── Ανά όχημα ──
  await page.click('[data-owvmode="vehicle"]');
  await page.waitForFunction(() => document.querySelector('[data-owvmode="vehicle"]').classList.contains('on'));
  const vg = (await page.locator('.owv-t tr.owv-g').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
  assert(vg.includes('ΚΗΙ 5102 · Σ. Κάππος 2 RT · 6.550,00 €') && vg.includes('Transfrigo Kft. · συνεργάτης 2 RT · 5.550,00 € · 1 χωρίς τιμή'), 'vehicle groups: ΚΗΙ 5102 (2 RT · 6.550,00 €), Transfrigo (2 RT · 5.550,00 € · 1 χωρίς τιμή): ' + JSON.stringify(vg));
  await snap(page, '02-owner-vehicle');
  await page.click('[data-owvmode="day"]');

  // ── row click → the export order in its catalog ──
  await page.evaluate(() => { window.__opened = []; OrdersHub.openOrder = (t, id) => window.__opened.push([t, id]); });
  await rowOf(page, 'RT-1187').locator('td').first().click();
  await page.locator('.owv-tn tr', { hasText: 'Ελαιώνες' }).click();
  const opened = await page.evaluate(() => window.__opened);
  assert(JSON.stringify(opened) === JSON.stringify([['intl', 'recO1232'], ['natl', 'recN423']]), 'row click opens the export order (intl recO1232) / the national order: ' + JSON.stringify(opened));

  // ── Χωρίς τιμή chip → the «noprice» view ──
  const setViewCalls = await page.evaluate(() => { window.__views = []; const o = OrdersHub.setView; OrdersHub.setView = v => window.__views.push(v); document.querySelector('[data-owvgo="noprice"]').click(); OrdersHub.setView = o; return window.__views; });
  assert(JSON.stringify(setViewCalls) === '["noprice"]', 'chip «Χωρίς τιμή» → OrdersHub.setView("noprice")');

  // ── scopes ──
  await page.click('.oh-seg-b[data-scope="intl"]');
  await page.waitForFunction(() => document.querySelector('.owv-kpi') && !document.querySelector('.owv-nh') && /22\.500,00/.test(document.querySelector('.owv-hero').innerText), null, { timeout: 10000 });
  assert(!/Εθνικά ·/.test(await text(page, '.owv-kpi')), 'Διεθνείς: no national KPI, no national block, hero 22.500,00 €');
  await snap(page, '03-owner-intl');
  await page.click('.oh-seg-b[data-scope="natl"]');
  await page.waitForFunction(() => document.querySelector('.owv-nh') && !document.querySelector('.owv-t:not(.owv-tn)') && /2\.370,00/.test(document.querySelector('.owv-hero').innerText), null, { timeout: 10000 });
  assert(!/Διεθνή ·/.test(await text(page, '.owv-kpi')) && /1 \/ 5/.test(await text(page, '.owv-kpi')), 'Εθνικές: only the national block, hero 2.370,00 €, invoiced 1 / 5');
  assert(await page.locator('[data-owvmode]').count() === 0, 'Εθνικές: no «Ανά ημέρα | Ανά όχημα» toggle (nationals have no RT/vehicle)');
  await snap(page, '04-owner-natl');
  await page.click('.oh-seg-b[data-scope="all"]');
  await page.waitForSelector('.owv-t tr.owv-row');

  // ── next week: the Friday RT's import is counted there, the RT is a guest ──
  await page.click('.owv-arr[data-owvshift="1"]');
  await page.waitForFunction(() => /RT-1188/.test((document.querySelector('.owv-t') || {}).innerText || ''), null, { timeout: 10000 });
  const g88 = await rowOf(page, 'RT-1188').innerText();
  assert(/από /.test(g88) && /2\.000,00/.test(g88), 'next week: RT-1188 listed as «από <its week>» with the import 2.000,00 counted there');
  assert(/2\.000,00 €/.test(await text(page, '.owv-hero')), 'next week hero = 2.000,00 €');
  const nk = await text(page, '.owv-kpi');
  assert(/Διεθνή · 0 RT \+1 άλλης εβδ\./.test(nk) && !/%/.test(nk), 'running week: «Διεθνή · 0 RT +1 άλλης εβδ.», no % against a closed week: ' + nk.replace(/\s+/g, ' '));
  await page.evaluate(() => { window.__opened = []; OrdersHub.openOrder = (t, id) => window.__opened.push([t, id]); });
  await rowOf(page, 'RT-1188').locator('td').first().click();
  assert(JSON.stringify(await page.evaluate(() => window.__opened)) === '[["intl","recO1236"]]', 'guest row opens the order it counts in this week (the import)');
  await snap(page, '05-owner-next-week');

  assert(!page._log.some(u => /^PNL /.test(u)), 'NO request to /costs/pnl');
  assert(realErrors(page).length === 0, 'no page/console errors: ' + JSON.stringify(realErrors(page)));
  await page.context().close();
}

async function runAccountant(browser) {
  console.log('\n[accountant] Παραγγελίες → Εβδομάδα');
  const page = await newPage(browser, 'accountant');
  await openWeek(page);
  const kpi = await text(page, '.owv-kpi');
  assert(await page.locator('.oh-tab[data-view="week"]').count() === 1, 'accountant sees the tab');
  assert(/24\.870,00 €/.test(kpi) && /Διεθνή · 7 RT/.test(kpi), 'accountant: same totals as the owner');
  assert(!/περιθώρ|κόστ|Κέρδ|margin/i.test(await text(page, '#ordersBody')), 'accountant: no cost / margin wording in the body');
  await snap(page, '06-accountant');
  assert(!page._log.some(u => /^PNL /.test(u)), 'accountant: NO request to /costs/pnl');
  assert(realErrors(page).length === 0, 'accountant: no page/console errors: ' + JSON.stringify(realErrors(page)));
  // Narrow laptop: the strip and table scroll inside their cards, the page never scrolls sideways.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => { const c = document.getElementById('content'); return c.scrollWidth - c.clientWidth; });
  assert(over <= 1, 'at 1024px no horizontal page scroll (overflow ' + over + 'px)');
  await page.screenshot({ path: shot('08-accountant-1024') });
  await page.context().close();
}

async function runRtFailure(browser) {
  console.log('\n[owner] /costs/rt fails');
  const page = await newPage(browser, 'owner', { rtFail: true });
  await openWeek(page);
  const body = await text(page, '#ordersBody');
  assert(/Τα RT δεν φορτώθηκαν — οι παραγγελίες εμφανίζονται χωρίς ομαδοποίηση/.test(body), 'banner «Τα RT δεν φορτώθηκαν — οι παραγγελίες εμφανίζονται χωρίς ομαδοποίηση»');
  assert(await page.locator('.owv-t:not(.owv-tn) tr.owv-row').count() === 9 && /22\.500,00 €/.test(await text(page, '.owv-kpi')), 'all 9 international orders listed by day, turnover unchanged 22.500,00 €');
  assert(!/ΧΩΡΙΣ RT/.test(body), 'no misleading «Χωρίς RT» group when the RTs did not load');
  assert(/Διεθνή · RT —/.test(await text(page, '.owv-kpi')) && /τα RT δεν φορτώθηκαν/.test(await text(page, '.owv-t tfoot')), 'RT count shown as unknown («RT —»), never «0 RT»');
  await snap(page, '07-rt-failed');
  // The failed /costs/rt answer itself logs one console error — that is the point.
  await page.context().close();
}

async function runDispatcher(browser) {
  console.log('\n[dispatcher]');
  const page = await newPage(browser, 'dispatcher');
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('.oh-tabs', { timeout: 20000 });
  assert(await page.locator('.oh-tab[data-view="week"]').count() === 0, 'dispatcher: no «Εβδομάδα» tab (Client Revenue hidden)');
  assert(!page._log.some(u => /\/costs\/rt/.test(u)), 'dispatcher: /costs/rt never called');
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL + ' · εβδομάδα ' + ymd(W0));
  const browser = await chromium.launch();
  try {
    await runOwner(browser);
    await runAccountant(browser);
    await runRtFailure(browser);
    await runDispatcher(browser);
  } catch (e) {
    failed++;
    console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOT_DIR}`);
  process.exit(failed ? 1 : 0);
})();
