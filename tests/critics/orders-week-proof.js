// Proof script for the «Εβδομάδα» view of «Παραγγελίες» (modules/orders_week_view.js),
// v4 (owner 13/10/2026, Figma 1514:8013 — root `.ow4`).
//
// Run from the MAIN repo root (its node_modules + .har), against a server that
// serves the worktree under test, e.g.
//   python3 -m http.server 8790 -d <worktree> &
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8790/ node <worktree>/tests/critics/orders-week-proof.js
//
// preparePage (fake session + HAR replay) from tests/critics/auth.js, then
// page.route mocks registered AFTER it so they win for every backend call the
// view makes. Everything is SYNTHETIC (no production names, no real numbers).
// Dates are relative to the last complete Saturday–Friday week, so the rig does
// not rot with the calendar.
//
// The proof is DOM numbers, not screenshots: the «Κατάσταση εβδομάδας» cells
// must equal sums computed HERE from the mock data with an independent copy of
// the week rule (export by delivery, import/national by loading) — never by
// asking the code under test. Τζίρος = Τιμολογημένα + Ατιμολόγητα, without
// unpriced (incl. 0 €, owner 13/10), other-week, cancelled and VS-type national
// orders. Every failed read must be a visible strip and «—», never a 0.
// Screenshots are written too, for a human, but nothing passes on them.

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8790/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS/43ae34a9-3193-40a6-ad2d-47059deb26ff/scratchpad/orders-week-proof';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = name => path.join(SHOT_DIR, 'week-' + name + '.png');

const T = {
  ORDERS: 'tblgHlNmLBH3JTdIM', NAT_ORDERS: 'tblGHCCsTMqAy4KR2', NAT_LOADS: 'tblVW42cZnfC47gTb', CLIENTS: 'tblFWKAQVUzAM8mCE',
  TRUCKS: 'tblEAPExIAjiA3asD', DRIVERS: 'tbl7UGmYhc2Y82pPs', PARTNERS: 'tblLHl5m8bqONfhWv', LOCATIONS: 'tblxu8DRfTQOFRCzS',
};

// ── dates: the last complete week (Sat → Fri), local calendar ───────────────
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const thisSat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 1) % 7);
const W0 = new Date(thisSat.getFullYear(), thisSat.getMonth(), thisSat.getDate() - 7);
const day = (k, hh = 9) => { const d = new Date(W0.getFullYear(), W0.getMonth(), W0.getDate() + k); return ymd(d) + `T${pad(hh)}:00:00.000Z`; };
const WEEK_FROM = day(0).slice(0, 10), WEEK_TO = day(6).slice(0, 10);

// ── reference data ──────────────────────────────────────────────────────────
const CL = ['Nordhain Frischkost GmbH', 'Alpenkern Fresh S.r.l.', 'Danubio Market Kft.', 'Pella Orchards A.E.', 'Kaltenbach Frisch GmbH', 'Vergina Fruit Coop',
  'Kastania Fruits A.E.', 'Polderhof B.V.', 'Hellas Orchard A.E.', 'Emilia Verde S.r.l.', 'Baltrisk Cold Foods Sp. z o.o.', 'Strymon Foods A.E.',
  'Ορεινά Γαλακτοκομικά Α.Ε.', 'Αρκαδικά Κηπευτικά Ο.Ε.', 'Λακωνικά Εσπεριδοειδή Ο.Ε.', 'Ελαιώνας Μεσογείου Α.Ε.', 'Πεδινή Φρέσκια Α.Ε.', 'Ηπειρωτική Φάρμα Α.Ε.'];
const CLIENTS = CL.map((n, i) => ({ id: 'recC' + i, fields: { 'Company Name': n } }));
const c = n => ['recC' + CL.indexOf(n)];
const TRUCKS = ['ΚΗΙ 5102', 'ΙΑΒ 2133', 'ΙΑΒ 2108', 'ΚΗΙ 4521', 'ΚΗΙ 2208', 'ΙΑΒ 2150', 'ΚΗΙ 3310', 'ΙΑΒ 2177', 'ΙΑΒ 2140', 'ΚΗΙ 6001'].map((p, i) => ({ id: 'recT' + i, fields: { 'License Plate': p, Active: true } }));
const DRIVERS = ['Σ. Κάππας', 'Κ. Πέτρου', 'Ν. Δήμου', 'Γ. Αλεξίου', 'Π. Ράπτης', 'Χ. Μάνος', 'Α. Σταμάτης', 'Σ. Ρήγας', 'Θ. Γκίκας', 'Λ. Ζήσης'].map((n, i) => ({ id: 'recD' + i, fields: { 'Full Name': n, Active: true } }));
const own = i => ({ Truck: ['recT' + i], Driver: ['recD' + i] });
const PARTNERS = [{ id: 'recP0', fields: { 'Company Name': 'Kryotrans Kft.' } }, { id: 'recP1', fields: { 'Company Name': 'Alpcool Logistik GmbH' } }, { id: 'recP2', fields: { 'Company Name': 'Notos Ψυκτικές Ο.Ε.' } }];
const PL = ['Naoussa|GR', 'München|DE', 'Verona|IT', 'Veroia|GR', 'Budapest|HU', 'Edessa|GR', 'Wrocław|PL', 'Wien|AT', 'Graz|AT', 'Wels|AT', 'Linz|AT', 'Rotterdam|NL',
  'Kraków|PL', 'Katowice|PL', 'Bologna|IT', 'Hamburg|DE', 'Aspropyrgos|GR', 'Poznań|PL', 'Kilkis|GR', 'Sofia|BG', 'Patra|GR', 'Tripoli|GR', 'Sparti|GR', 'Gytheio|GR', 'Messini|GR', 'Kalamata|GR', 'Ioannina|GR', 'Larisa|GR'];
const LOCS = PL.map((s, i) => { const [city, cc] = s.split('|'); return { id: 'recL' + i, fields: { Name: city + ' depot', City: city, Country: cc } }; });
const L = n => ['recL' + PL.findIndex(s => s.startsWith(n + '|'))];

// ── orders ──────────────────────────────────────────────────────────────────
const io = (id, dir, f) => ({ id: 'recO' + id, fields: Object.assign({ Type: 'International', Direction: dir, 'Order No': id, Status: 'Delivered' }, f) });
const ex = (id, cl, ref, from, to, lk, dk, f) => io(id, 'Export', Object.assign({ Client: c(cl), Reference: ref, 'Loading Location 1': L(from), 'Unloading Location 1': L(to), 'Loading DateTime': day(lk), 'Delivery DateTime': day(dk) }, f));
const im = (id, cl, ref, from, to, lk, dk, f) => io(id, 'Import', Object.assign({ Client: c(cl), Reference: ref, 'Loading Location 1': L(from), 'Unloading Location 1': L(to), 'Loading DateTime': day(lk, 6), 'Delivery DateTime': day(dk) }, f));
const inv = n => ({ Invoiced: true, 'Invoice Number': n });
const ORDERS = [
  ex(1241, 'Nordhain Frischkost GmbH', 'PO 88213', 'Naoussa', 'München', -2, 2, Object.assign({ Price: 3200 }, inv('0461'), own(0))),
  im(1246, 'Alpenkern Fresh S.r.l.', 'AF-5521', 'Verona', 'Veroia', 3, 5, Object.assign({ Price: 2650 }, own(0))),
  ex(1243, 'Danubio Market Kft.', 'DM-3307', 'Veroia', 'Budapest', 0, 2, { Price: 2900, 'Pallet Exchange': true, Partner: ['recP0'], 'Partner Truck Plates': 'ABC-412' }),
  ex(1219, 'Pella Orchards A.E.', 'PO-4398', 'Edessa', 'Wrocław', -4, -2, Object.assign({ Price: 3100 }, inv('0452'), own(1))),   // previous week (guest RT)
  im(1238, 'Kaltenbach Frisch GmbH', 'KF-0912', 'Wien', 'Veroia', 2, 4, Object.assign({ Price: 2400 }, inv('0458'), own(1))),
  ex(1244, 'Vergina Fruit Coop', 'VF-118', 'Naoussa', 'Graz', 0, 3, Object.assign({ Price: 1150 }, inv('0463'), own(2))),
  ex(1245, 'Vergina Fruit Coop', 'VF-119', 'Naoussa', 'Wels', 0, 3, Object.assign({ Price: 980 }, inv('0463'), own(2))),
  ex(1247, 'Kastania Fruits A.E.', 'KS-2204', 'Veroia', 'Linz', 0, 3, Object.assign({ Price: 1240 }, own(2))),
  im(1251, 'Polderhof B.V.', 'PH-77810', 'Rotterdam', 'Veroia', 5, 10, Object.assign({ Price: 2450, Status: 'Assigned' }, own(2))),
  ex(1248, 'Pella Orchards A.E.', 'PO-4471', 'Edessa', 'Kraków', 0, 3, Object.assign({ Price: 3650, 'Unloading Location 2': L('Katowice') }, own(3))),
  ex(1249, 'Hellas Orchard A.E.', 'HO-2610', 'Naoussa', 'Bologna', 1, 4, { Partner: ['recP1'], 'Partner Truck Plates': 'W-AL 4471' }),   // NO price
  im(1253, 'Emilia Verde S.r.l.', 'EV-339', 'Bologna', 'Veroia', 5, 7, Object.assign({ Price: 2300, Partner: ['recP1'], 'Partner Truck Plates': 'W-AL 4471' }, inv('0466'))),
  ex(1250, 'Alpenkern Fresh S.r.l.', 'AF-5530', 'Veroia', 'Verona', 2, 4, Object.assign({ Price: 3350, 'Veroia Switch': true }, own(4))),
  im(1255, 'Nordhain Frischkost GmbH', 'NF-10422', 'Hamburg', 'Aspropyrgos', 5, 8, Object.assign({ Price: 2800 }, own(4))),
  im(1256, 'Baltrisk Cold Foods Sp. z o.o.', 'BC-7781', 'Poznań', 'Veroia', 5, 7, Object.assign({ Price: 2650 }, own(5))),
  ex(1252, 'Kastania Fruits A.E.', 'KS-2209', 'Veroia', 'Wien', 3, 5, Object.assign({ Price: 3100, 'Unloading Location 2': L('Linz') }, inv('0468'), own(6))),
  im(1254, 'Kaltenbach Frisch GmbH', 'KF-0920', 'Linz', 'Veroia', 6, 10, Object.assign({ Price: 2200, Status: 'Assigned' }, own(6))),
  ex(1257, 'Hellas Orchard A.E.', 'HO-2618', 'Veroia', 'Wien', 4, 6, { Price: 2750, Partner: ['recP0'], 'Partner Truck Plates': 'ABC-419' }),
  im(1262, 'Kaltenbach Frisch GmbH', 'KF-0931', 'Wien', 'Veroia', 10, 12, { Price: 2500, Status: 'Assigned', Partner: ['recP0'], 'Partner Truck Plates': 'ABC-419' }),   // next week
  ex(1259, 'Strymon Foods A.E.', 'SF-0081', 'Kilkis', 'Sofia', 5, 6, Object.assign({ Price: 1400 }, own(7))),
  // 0 € = no price (owner 13/10): «—» on its leg, never «0,00», never summed.
  ex(1260, 'Strymon Foods A.E.', 'SF-0090', 'Kilkis', 'Sofia', 3, 4, Object.assign({ Price: 0 }, own(9))),
  // Cancelled in the week: never shown, never counted.
  ex(1261, 'Danubio Market Kft.', 'DM-3399', 'Veroia', 'Budapest', 1, 3, { Price: 999, Status: 'Cancelled' }),
  // previous weeks (strip + %)
  ex(1201, 'Alpenkern Fresh S.r.l.', '', 'Veroia', 'Verona', -9, -5, Object.assign({ Price: 40020 }, inv('0410'))),
  ex(1190, 'Alpenkern Fresh S.r.l.', '', 'Veroia', 'Verona', -16, -12, Object.assign({ Price: 38410 }, inv('0400'))),
];
const leg = (id, order_id, direction, seq) => ({ id, order_id, direction, seq, nat_load_id: null });
const RTS = [
  { id: 1201, code: 'RT-1201', status: 'open', ct_rt_legs: [leg(1, 1241, 'EXPORT', 1), leg(2, 1246, 'IMPORT', 2)] },
  { id: 1202, code: 'RT-1202', status: 'open', ct_rt_legs: [leg(3, 1243, 'EXPORT', 1)] },
  { id: 1176, code: 'RT-1176', status: 'open', ct_rt_legs: [leg(4, 1219, 'EXPORT', 1), leg(5, 1238, 'IMPORT', 2)] },
  { id: 1203, code: 'RT-1203', status: 'open', ct_rt_legs: [leg(6, 1244, 'EXPORT', 1), leg(7, 1245, 'EXPORT', 2), leg(8, 1247, 'EXPORT', 3), leg(9, 1251, 'IMPORT', 4)] },
  { id: 1204, code: 'RT-1204', status: 'open', ct_rt_legs: [leg(10, 1248, 'EXPORT', 1)] },
  { id: 1205, code: 'RT-1205', status: 'open', ct_rt_legs: [leg(11, 1249, 'EXPORT', 1), leg(12, 1253, 'IMPORT', 2)] },
  { id: 1206, code: 'RT-1206', status: 'open', ct_rt_legs: [leg(13, 1250, 'EXPORT', 1), leg(14, 1255, 'IMPORT', 2)] },
  { id: 1207, code: 'RT-1207', status: 'open', ct_rt_legs: [leg(15, 1256, 'IMPORT', 1)] },
  { id: 1208, code: 'RT-1208', status: 'open', ct_rt_legs: [leg(16, 1252, 'EXPORT', 1), leg(17, 1254, 'IMPORT', 2)] },
  { id: 1209, code: 'RT-1209', status: 'open', ct_rt_legs: [leg(18, 1257, 'EXPORT', 1), leg(19, 1262, 'IMPORT', 2)] },
  { id: 1210, code: 'RT-1210', status: 'open', ct_rt_legs: [leg(20, 1260, 'EXPORT', 1)] },
  { id: 1211, code: 'RT-1211', status: 'cancelled', ct_rt_legs: [leg(21, 1261, 'EXPORT', 1)] },
].map(r => Object.assign({ date_start: day(0).slice(0, 10) }, r));
const nat = (id, no, dir, cl, ref, from, to, lk, dk, f) => ({ id, fields: Object.assign({ Type: 'Independent', 'Order No': no, Direction: dir, Client: c(cl), Reference: ref, 'Pickup Location 1': L(from), 'Delivery Location 1': L(to), 'Loading DateTime': day(lk, 7), 'Delivery DateTime': day(dk, 15) }, f) });
const DOWN = 'North→South', UP = 'South→North';
const NAT = [
  nat('recN427', 427, DOWN, 'Ορεινά Γαλακτοκομικά Α.Ε.', '4500131207', 'Veroia', 'Patra', 2, 3, Object.assign({ Price: 620 }, inv('0462'))),
  nat('recN431', 431, UP, 'Αρκαδικά Κηπευτικά Ο.Ε.', 'ΔΑ 5612', 'Tripoli', 'Veroia', 4, 5, { Price: 480 }),
  nat('recN433', 433, UP, 'Λακωνικά Εσπεριδοειδή Ο.Ε.', 'ΠΑΡ 4471', 'Sparti', 'Veroia', 3, 4, Object.assign({ Price: 390, 'National Groupage': true, 'Pickup Location 2': L('Gytheio') }, inv('0465'))),
  nat('recN429', 429, DOWN, 'Ελαιώνας Μεσογείου Α.Ε.', '4500131290', 'Veroia', 'Messini', 5, 6, {}),   // NO price
  nat('recN434', 434, UP, 'Πεδινή Φρέσκια Α.Ε.', 'ΔΑ 5690', 'Kalamata', 'Veroia', 6, 10, { Price: 450 }),
  nat('recN430', 430, DOWN, 'Ηπειρωτική Φάρμα Α.Ε.', '4500131302', 'Veroia', 'Ioannina', 6, 7, { Price: 560 }),
  // Old national of Type «Veroia Switch» (decision 3, owner 13/10): shown, never summed.
  nat('recN440', 440, DOWN, 'Ηπειρωτική Φάρμα Α.Ε.', '4500131399', 'Veroia', 'Larisa', 1, 2, { Price: 700, Type: 'Veroia Switch' }),
  // Loaded next week: not in this week's money.
  nat('recN441', 441, UP, 'Αρκαδικά Κηπευτικά Ο.Ε.', 'ΔΑ 5701', 'Tripoli', 'Veroia', 8, 9, { Price: 510 }),
];
const NL = [
  { id: 'nl1', fields: { 'Source National Order': ['recN427'], 'Matched Load': 'nl2', Truck: ['recT8'], Driver: ['recD8'], Direction: DOWN } },
  { id: 'nl2', fields: { 'Source National Order': ['recN431'], 'Matched Load': 'nl1', Direction: UP } },
  { id: 'nl3', fields: { 'Source National Order': ['recN429'], 'Matched Load': 'nl4', Partner: ['recP2'], 'Partner Truck Plates': 'ΝΚΡ 2290', Direction: DOWN } },
  { id: 'nl4', fields: { 'Source National Order': ['recN434'], 'Matched Load': 'nl3', Direction: UP } },
];
const GATE = [{ order_rec: 'recO1243', sheets_ok: false }];

// ── expected money: an INDEPENDENT copy of the week rule ────────────────────
// Weekly date = export → delivery, import → loading, national → loading.
const weeklyYmd = r => {
  const f = r.fields;
  const v = r._natl ? f['Loading DateTime'] : f['Direction'] === 'Export' ? f['Delivery DateTime'] : f['Loading DateTime'];
  return v ? String(v).slice(0, 10) : null;
};
function expected(recs) {
  const t = { inv: 0, open: 0 };
  for (const r of recs) {
    const f = r.fields, d = weeklyYmd(r);
    if (!d || d < WEEK_FROM || d > WEEK_TO) continue;                 // other week
    if (f['Status'] === 'Cancelled') continue;
    if (r._natl && f['Type'] === 'Veroia Switch') continue;           // VS-type national
    if (!(Number(f['Price']) > 0)) continue;                          // no price, 0 € included
    if (f['Invoiced']) t.inv += Number(f['Price']); else t.open += Number(f['Price']);
  }
  t.sum = t.inv + t.open;
  return t;
}
const EXP_I = expected(ORDERS);
const EXP_N = expected(NAT.map(r => Object.assign({ _natl: true }, r)));
const EXP_ALL = { inv: EXP_I.inv + EXP_N.inv, open: EXP_I.open + EXP_N.open, sum: EXP_I.sum + EXP_N.sum };
// el-GR money, written out here (not Intl) so the expectation does not share
// a formatter with the page.
const eur = v => { const [i, d] = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));

// ── mocks ───────────────────────────────────────────────────────────────────
function installMocks(page, log, opts = {}) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  // Anything else on the Worker: an empty answer, never the live backend.
  page.route('**/petras-tms-backend-staging.petrasgroup.workers.dev/**', route => json(route, { records: [] }));
  page.route(`**/${T.ORDERS}**`, route => {
    const u = decodeURIComponent(route.request().url());
    log.push(u);
    const ids = [...u.matchAll(/RECORD_ID\(\)="(rec[A-Za-z0-9]+)"/g)].map(m => m[1]);
    // OrdersData's invoicing set asks for delivered/invoiced only (all time).
    const isInv = /\{Status\}="Delivered"/.test(u);
    const recs = ids.length ? ORDERS.filter(r => ids.includes(r.id)) : isInv ? ORDERS.filter(r => r.fields.Status === 'Delivered' || r.fields.Invoiced) : ORDERS;
    return json(route, { records: recs });
  });
  page.route(`**/${T.NAT_ORDERS}**`, route => {
    log.push(decodeURIComponent(route.request().url()));
    return opts.natlFail ? json(route, { error: 'boom' }, 500) : json(route, { records: NAT });
  });
  page.route(`**/${T.NAT_LOADS}**`, route => {
    const u = decodeURIComponent(route.request().url());
    log.push(u);
    if (opts.natLoadsFail) return json(route, { error: 'boom' }, 500);
    const recs = NL.filter(l => u.includes('"' + (l.fields['Source National Order'] || [''])[0] + '"') || u.includes(`RECORD_ID()='${l.id}'`) || (l.fields['Matched Load'] && u.includes(`{Matched Load}='${l.fields['Matched Load']}'`)));
    return json(route, { records: recs });
  });
  page.route(`**/${T.CLIENTS}**`, route => json(route, { records: CLIENTS }));
  page.route(`**/${T.TRUCKS}**`, route => json(route, { records: TRUCKS }));
  page.route(`**/${T.DRIVERS}**`, route => json(route, { records: DRIVERS }));
  page.route(`**/${T.PARTNERS}**`, route => json(route, { records: PARTNERS }));
  page.route(`**/${T.LOCATIONS}**`, route => json(route, { records: LOCS }));
  page.route('**/costs/rt**', route => {
    log.push(route.request().url());
    return opts.rtFail ? json(route, { error: 'Failed to load' }, 500) : json(route, { records: RTS });
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
  await page.waitForSelector('.ow4 .ow4-state', { timeout: 30000 });
}
// The app scrolls inside #content, so fullPage stops at the viewport: grow the
// viewport to the content height for the shot, then put it back.
async function snap(page, name) {
  const h = await page.evaluate(() => { const c = document.getElementById('content'); return Math.max(960, (c ? c.scrollHeight + c.getBoundingClientRect().top : 0) + 40); });
  await page.setViewportSize({ width: 1440, height: Math.min(h, 5000) });
  await page.waitForTimeout(150);
  await page.screenshot({ path: shot(name) });
  await page.setViewportSize({ width: 1440, height: 960 });
}
// Errors the scenario CAUSES on purpose (the mocked 500, core/api.js logging
// its «boom» body, the view's own console.error naming it) are expected;
// anything else counts.
const realErrors = (page, expect) => page._errors.filter(e => !/favicon/.test(e) && !(expect && expect.test(e)));

// «Κατάσταση εβδομάδας» as numbers: { Διεθνή: [τζίρος, τιμολογ., ατιμολόγ.], … }.
// The footnote marks (<sup> * †) are dropped: they are not part of the amount.
async function statement(page) {
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.ow4-st tbody tr, .ow4-st tfoot tr').forEach(tr => {
      const th = tr.querySelector('th').textContent.trim();
      out[th] = [...tr.querySelectorAll('td')].map(td => { const c = td.cloneNode(true); c.querySelectorAll('sup').forEach(s => s.remove()); return c.textContent.trim(); });
    });
    return out;
  });
}
const failStrips = page => page.$$eval('.ow4-fail:not(.ow4-info) b', bs => bs.map(b => b.textContent.trim()));

// The cross-cutting rules every scenario must hold on whatever is painted.
async function commonRules(page, tag) {
  const all = await page.locator('.ow4').innerText();
  assert(!/ανοιχτ/i.test(all), `${tag}: no visible «ανοιχτά» anywhere in the view`);
  assert(!/(^|[^\d.])0,00/.test(all), `${tag}: no «0,00» shown (a missing / 0 € price is «—»)`);
  const amounts = await page.$$eval('.ow4-n, .ow4-sig, .ow4-num, .ow4-st td, .ow4-wk-v', els => els.map(e => e.textContent));
  const paren = amounts.filter(s => s.includes('('));
  assert(amounts.length > 0 && paren.length === 0, `${tag}: no «(» in ${amounts.length} amount cells` + (paren.length ? ': ' + JSON.stringify(paren.slice(0, 3)) : ''));
}

async function assertMoney(page, tag, rows) {
  const st = await statement(page);
  for (const [label, exp] of rows) {
    const got = st[label];
    const want = exp == null ? ['—', '—', '—'] : [eur(exp.sum), eur(exp.inv), eur(exp.open)];
    assert(JSON.stringify(got) === JSON.stringify(want), `${tag}: «${label}» = ${want.join(' | ')} — got ${JSON.stringify(got)}`);
    if (exp != null && got) assert(Math.abs(num(got[0]) - num(got[1]) - num(got[2])) < 0.005, `${tag}: «${label}» Τζίρος = Τιμολογημένα + Ατιμολόγητα`);
  }
}

async function runOwner(browser) {
  console.log('\n[owner] Παραγγελίες → Εβδομάδα');
  const page = await newPage(browser, 'owner');
  await openWeek(page);
  const tab = page.locator('.oh-tab[data-view="week"]');
  assert(await tab.count() === 1 && (await tab.getAttribute('aria-selected')) === 'true', 'tab «Εβδομάδα» visible and selected');

  await assertMoney(page, 'owner', [['Διεθνή', EXP_I], ['Εθνικά', EXP_N], ['Σύνολο εβδομάδας', EXP_ALL]]);
  assert((await failStrips(page)).length === 0, 'no failure strip when every read succeeds');

  // 0 € order: its leg reads «—» like a missing price, and it is listed under †.
  const zero = (await page.locator('.ow4-sub[data-owvopen="intl:recO1260"] .ow4-c.ow4-n').innerText()).trim();
  assert(zero === '—', '0 € order #1260: amount cell «—» — got «' + zero + '»');
  const noPrice = (await page.locator('.ow4-sub[data-owvopen="intl:recO1249"] .ow4-c.ow4-n').innerText()).trim();
  assert(noPrice === '—', 'unpriced order #1249: amount cell «—» — got «' + noPrice + '»');
  const foot = await page.locator('.ow4-foot').innerText();
  assert(/#1260/.test(foot) && /#1249/.test(foot), '† footnote names #1260 (0 €) and #1249 (no price) as left out');
  // VS-type national: shown, never invoiced, never summed (sums above prove the latter).
  const vs = await page.locator('.ow4-sub[data-owvopen="natl:recN440"]').innerText();
  assert(/δεν τιμολογείται/.test(vs), 'VS-type national #440 shown as «δεν τιμολογείται»');
  assert(await page.locator('[data-owvopen="intl:recO1261"]').count() === 0, 'cancelled #1261 not shown');

  await commonRules(page, 'owner');
  assert(page._log.some(u => /\/costs\/rt\?overlap=1&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/.test(u)), '/costs/rt?overlap=1&from=&to= requested');
  assert(page._log.some(u => u.includes(T.NAT_LOADS)), 'NATIONAL LOADS read for the national pairs');
  assert(!page._log.some(u => /^PNL /.test(u)), 'NO request to /costs/pnl');
  assert(realErrors(page).length === 0, 'owner: 0 page/console errors: ' + JSON.stringify(realErrors(page)));
  await snap(page, '01-owner');
  await page.context().close();
}

async function runAccountant(browser) {
  console.log('\n[accountant] Παραγγελίες → Εβδομάδα');
  const page = await newPage(browser, 'accountant');
  await openWeek(page);
  assert(await page.locator('.oh-tab[data-view="week"]').count() === 1, 'accountant sees the tab');
  await assertMoney(page, 'accountant', [['Διεθνή', EXP_I], ['Εθνικά', EXP_N], ['Σύνολο εβδομάδας', EXP_ALL]]);
  assert(!/περιθώρ|κόστ|Κέρδ|margin/i.test(await page.locator('#ordersBody').innerText()), 'accountant: no cost / margin wording in the body');
  await commonRules(page, 'accountant');
  assert(!page._log.some(u => /^PNL /.test(u)), 'accountant: NO request to /costs/pnl');
  assert(realErrors(page).length === 0, 'accountant: 0 page/console errors: ' + JSON.stringify(realErrors(page)));
  await snap(page, '02-accountant');
  await page.context().close();
}

async function runRtFailure(browser) {
  console.log('\n[owner] /costs/rt fails');
  const page = await newPage(browser, 'owner', { rtFail: true });
  await openWeek(page);
  const strips = await failStrips(page);
  assert(strips.length === 1 && strips[0] === 'Δεν διαβάστηκαν τα δρομολόγια (RT).', 'one strip «Δεν διαβάστηκαν τα δρομολόγια (RT).»: ' + JSON.stringify(strips));
  const head = await page.locator('.ow4-sec .ow4-h', { hasText: 'Διεθνείς' }).innerText();
  assert(/δρομολόγια —/.test(head) && !/\b0 δρομολόγ/.test(head), 'RT count «δρομολόγια —», never «0 δρομολόγια»: ' + head.replace(/\s+/g, ' '));
  assert(await page.locator('.ow4-row[data-owvopen^="intl:"]').count() === ORDERS.filter(r => { const d = weeklyYmd(r); return d >= WEEK_FROM && d <= WEEK_TO && r.fields.Status !== 'Cancelled'; }).length,
    'every international order of the week listed on its own (ΧΩΡΙΣ RT)');
  // The RTs only group; the money does not depend on them.
  await assertMoney(page, 'rtFail', [['Διεθνή', EXP_I], ['Εθνικά', EXP_N], ['Σύνολο εβδομάδας', EXP_ALL]]);
  await commonRules(page, 'rtFail');
  const re = realErrors(page, /costs\/rt|status of 500|Failed to load|Error: boom/);
  assert(re.length === 0 && !page._errors.some(e => /^pageerror/.test(e)), 'rtFail: 0 page errors, no console error besides the mocked /costs/rt 500: ' + JSON.stringify(re));
  await snap(page, '03-rt-failed');
  await page.context().close();
}

async function runNatLoadsFailure(browser) {
  console.log('\n[owner] NATIONAL LOADS fails');
  const page = await newPage(browser, 'owner', { natLoadsFail: true });
  await openWeek(page);
  const strips = await failStrips(page);
  assert(strips.length === 1 && strips[0] === 'Δεν διαβάστηκαν τα φορτία εθνικών.', 'one strip «Δεν διαβάστηκαν τα φορτία εθνικών.»: ' + JSON.stringify(strips));
  const nat = page.locator('.ow4-row.ow4-nat[data-owvopen]');
  const n = await nat.count();
  const veh = (await page.$$eval('.ow4-row.ow4-nat[data-owvopen] .ow4-veh', els => els.map(e => e.textContent.trim())));
  assert(n > 0 && veh.length === n && veh.every(v => v === '—'), `national ΑΝΑΘΕΣΗ «—» on all ${n} rows: ` + JSON.stringify(veh));
  // The strip itself names «εκτός φορτίου» (to say it is NOT shown), so only the rows are checked.
  const natText = (await nat.allInnerTexts()).join(' ');
  assert(!/εκτός φορτίου/.test(natText), 'no national row says «εκτός φορτίου» when the loads were not read');
  // The loads only pair and assign; the national money comes from the orders.
  await assertMoney(page, 'natLoadsFail', [['Διεθνή', EXP_I], ['Εθνικά', EXP_N], ['Σύνολο εβδομάδας', EXP_ALL]]);
  await commonRules(page, 'natLoadsFail');
  const re = realErrors(page, /national loads|status of 500|Failed to load|Error: boom/);
  assert(re.length === 0 && !page._errors.some(e => /^pageerror/.test(e)), 'natLoadsFail: 0 page errors, no console error besides the mocked NATIONAL LOADS 500: ' + JSON.stringify(re));
  await snap(page, '04-natloads-failed');
  await page.context().close();
}

async function runNatlFailure(browser) {
  console.log('\n[owner] NATIONAL ORDERS fails');
  const page = await newPage(browser, 'owner', { natlFail: true });
  await openWeek(page);
  const strips = await failStrips(page);
  assert(strips.includes('Δεν διαβάστηκαν οι εθνικές.'), 'strip «Δεν διαβάστηκαν οι εθνικές.»: ' + JSON.stringify(strips));
  // Εθνικά «—», never 0; the total is the internationals only and says so.
  await assertMoney(page, 'natlFail', [['Διεθνή', EXP_I], ['Εθνικά', null], ['Σύνολο εβδομάδας · χωρίς εθνικά', EXP_I]]);
  await commonRules(page, 'natlFail');
  const re = realErrors(page, /national|status of 500|Failed to load|Error: boom/);
  assert(re.length === 0 && !page._errors.some(e => /^pageerror/.test(e)), 'natlFail: 0 page errors, no console error besides the mocked NATIONAL ORDERS 500: ' + JSON.stringify(re));
  await snap(page, '05-natl-failed');
  await page.context().close();
}

async function runDispatcher(browser) {
  console.log('\n[dispatcher]');
  const page = await newPage(browser, 'dispatcher');
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('.oh-tabs', { timeout: 30000 });
  assert(await page.evaluate(() => can('costs')) === 'none', "dispatcher: can('costs') === 'none'");
  assert(await page.locator('.oh-tab[data-view="week"]').count() === 0, 'dispatcher: no «Εβδομάδα» tab (Client Revenue hidden)');
  assert(await page.locator('.ow4').count() === 0, 'dispatcher: the view is not painted');
  assert(!page._log.some(u => /\/costs\/rt/.test(u)), 'dispatcher: /costs/rt never called');
  assert(realErrors(page).length === 0, 'dispatcher: 0 page/console errors: ' + JSON.stringify(realErrors(page)));
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL + ' · εβδομάδα ' + WEEK_FROM + ' – ' + WEEK_TO);
  console.log(`Αναμενόμενα: Διεθνή ${eur(EXP_I.sum)} = ${eur(EXP_I.inv)} + ${eur(EXP_I.open)} · Εθνικά ${eur(EXP_N.sum)} = ${eur(EXP_N.inv)} + ${eur(EXP_N.open)} · Σύνολο ${eur(EXP_ALL.sum)}`);
  const browser = await chromium.launch();
  try {
    await runOwner(browser);
    await runAccountant(browser);
    await runRtFailure(browser);
    await runNatLoadsFailure(browser);
    await runNatlFailure(browser);
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
