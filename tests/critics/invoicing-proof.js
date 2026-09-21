// Proof script for «Τιμολόγηση» as the accountant role (Eirini go-live, 21/9/2026).
// Audit: docs/data-audit/2026-09/2026-09-21-eirini-readiness.md §5.
//
// Proves the EXISTING behaviour of modules/invoicing.js — it changes nothing.
// Where the screen does something the audit flags as a decision for the owner
// (TMS-generated invoice numbers, no-price rows still selectable, week filter
// dropping national rows), the assertion pins the CURRENT behaviour and says
// so in its message, so the day the owner decides otherwise this file goes
// red on purpose and gets rewritten with the decision.
//
// Run from the MAIN repo's node_modules, against a server that serves the
// WORKTREE root (the code under test):
//   python3 -m http.server 8798 -d <worktree> --bind 127.0.0.1
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8798/ node <worktree>/tests/critics/invoicing-proof.js
//
// Structure copied from tests/critics/expenses-proof.js: preparePage/gotoPage
// from tests/critics/auth.js (fake session + HAR replay), then page.route mocks
// registered AFTER preparePage so they win over the HAR for the five backend
// calls the screen makes (orders, national orders, clients, /pallets/gate,
// /pallets/balances). Static assets load LIVE from PW_BASE_URL.
//
// Fixture (synthetic, no production data):
//   recO1  Delivered, price, no pallet exchange, 10 days old        → ready
//   recO2  Delivered, price, pallet exchange, gate ok, 40 days old  → ready + overdue (>30)
//   recO3  Delivered, price, pallet exchange, gate 1/2 covered      → blocked
//   recO4  Delivered, NO price, no pallet exchange, 5 days old      → ready, «χωρίς τιμή»
//   recO5  Delivered, Invoiced=true, ERP number + date              → invoiced
//   recO6  leg of recO2 (Parent Order) — must never appear (FEATURES.ORDER_SPLIT)
//   recN1  national order, no Status, delivery date in the past     → ready (natl)

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8798/';
const SHOT_DIR = process.env.PW_SHOT_DIR || path.join(__dirname, '..', '..', 'docs', 'data-audit', '2026-09', 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = name => path.join(SHOT_DIR, 'eirini-' + name + '.png');

const ORDERS = 'tblgHlNmLBH3JTdIM';
const NAT_ORDERS = 'tblGHCCsTMqAy4KR2';
const CLIENTS = 'tblFWKAQVUzAM8mCE';

const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const CLIENTS_FIXTURE = [
  { id: 'recC1', fields: { 'Company Name': 'Alpha Foods' } },
  { id: 'recC2', fields: { 'Company Name': 'Beta Fresh' } },
];
const order = (id, f) => ({ id, fields: Object.assign({ Status: 'Delivered', Direction: 'Export', Client: ['recC1'], Goods: 'Fresh produce', 'Week Number': 37 }, f) });
const ORDERS_FIXTURE = [
  order('recO1', { Reference: 'R-1001', Price: 1000, 'Pallet Exchange': false, 'Delivery DateTime': daysAgo(10) }),
  order('recO2', { Reference: 'R-1002', Price: 2000, 'Pallet Exchange': true, 'Delivery DateTime': daysAgo(40) }),
  order('recO3', { Reference: 'R-1003', Price: 1500, 'Pallet Exchange': true, 'Delivery DateTime': daysAgo(12), Client: ['recC2'] }),
  order('recO4', { Reference: 'R-1004', 'Pallet Exchange': false, 'Delivery DateTime': daysAgo(5) }),
  order('recO5', { Reference: 'R-1005', Price: 900, 'Pallet Exchange': false, 'Delivery DateTime': daysAgo(20), Invoiced: true, 'Invoice Number': 'ERP-77', 'Invoice Date': daysAgo(3) }),
  order('recO6', { Reference: 'R-1002', 'Pallet Exchange': false, 'Delivery DateTime': daysAgo(40), 'Parent Order': ['recO2'], 'Leg No': 1 }),
];
const NAT_FIXTURE = [
  { id: 'recN1', fields: { Reference: 'N-2001', Price: 300, Client: ['recC2'], Goods: 'Εθνική μεταφορά', Direction: 'North→South', 'Delivery DateTime': daysAgo(8) } },
];
const GATE_FIXTURE = [
  { order_rec: 'recO2', order_id: 2, loading_stops: 1, covered_stops: 1, sheets_ok: true },
  { order_rec: 'recO3', order_id: 3, loading_stops: 2, covered_stops: 1, sheets_ok: false },
];

// ── mocks + PATCH capture ──────────────────────────────────────────────────
function installMocks(page, captured) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const recordsRoute = (fixture) => async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const m = req.url().match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
      const body = req.postDataJSON();
      captured.push({ url: req.url(), table: req.url().includes(ORDERS) ? 'orders' : 'national_orders', id: m ? m[1] : null, fields: body && body.fields });
      return json(route, { id: m ? m[1] : null, fields: body && body.fields });
    }
    return json(route, { records: fixture });
  };
  page.route(`**/${ORDERS}**`, recordsRoute(ORDERS_FIXTURE));
  page.route(`**/${NAT_ORDERS}**`, recordsRoute(NAT_FIXTURE));
  page.route(`**/${CLIENTS}**`, route => json(route, { records: CLIENTS_FIXTURE }));
  page.route('**/pallets/gate**', route => json(route, { records: GATE_FIXTURE }));
  page.route('**/pallets/balances**', route => json(route, { records: [] }));
  // Every other facade table the reference preload touches: empty, never live.
  page.route(/\/tbl[A-Za-z0-9]{14}(\?|\/|$)/, route => {
    const u = route.request().url();
    if (u.includes(ORDERS) || u.includes(NAT_ORDERS) || u.includes(CLIENTS)) return route.fallback();
    return json(route, { records: [] });
  });
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg); }
}

async function newPage(browser, role, captured) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
  await preparePage(page, role);
  installMocks(page, captured);
  page._errors = errors;
  return page;
}

async function openInvoicing(page) {
  await gotoPage(page, 'invoicing', BASE_URL);
  await page.waitForSelector('#invBody tr', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#invTabs button').length >= 4, null, { timeout: 10000 });
}

const tabCount = async (page, label) => {
  const txt = await page.locator('#invTabs button', { hasText: label }).first().innerText();
  const m = txt.match(/\((\d+)\)/); return m ? parseInt(m[1], 10) : NaN;
};
const rowsText = page => page.locator('#invBody tr').allInnerTexts();
const rowFor = (page, ref) => page.locator('#invBody tr', { hasText: ref });

async function runAccountant(browser) {
  const captured = [];
  const page = await newPage(browser, 'accountant', captured);
  console.log('\n[accountant] Τιμολόγηση');
  await openInvoicing(page);

  // ── NAV: what the role sees ──
  const nav = await page.locator('.sidebar, nav, #sidebar').first().innerText().catch(() => '');
  assert(/Τιμολόγηση/.test(nav) && /Ισοζύγιο Παλετών/.test(nav), 'NAV: Τιμολόγηση + Ισοζύγιο Παλετών visible');
  assert(/Έξοδα Δρομολογίων/.test(nav) && /Μισθοδοσία/.test(nav), 'NAV: Έξοδα Δρομολογίων + Μισθοδοσία visible (shared accountant role — owner decision §7.1)');
  assert(!/TRIP PnL/.test(nav) && !/Ρυθμίσεις/.test(nav) && !/Πίνακας Διοίκησης/.test(nav), 'NAV: TRIP PnL / Ρυθμίσεις / Πίνακας Διοίκησης hidden');

  // ── tabs + counts (default tab = Έτοιμες) ──
  assert(await tabCount(page, 'Έτοιμες') === 4, 'Έτοιμες = 4 (recO1, recO2, recO4 no-price, recN1 national)');
  assert(await tabCount(page, 'Μπλοκαρισμένες') === 1, 'Μπλοκαρισμένες = 1 (recO3, gate 1/2)');
  assert(await tabCount(page, 'Τιμολογημένες') === 1, 'Τιμολογημένες = 1 (recO5)');
  assert(await tabCount(page, 'Όλες') === 6, 'Όλες = 6 — the split leg recO6 is NOT a row (parent billed once)');
  const overdueBtn = page.locator('#invTabs button', { hasText: 'καθυστερημένες' });
  assert(/^1 καθυστερημένες/.test((await overdueBtn.innerText()).trim()), 'overdue toggle = 1 (recO2, 40 days — fixed 30-day rule, not payment_terms_days)');
  const rows = await rowsText(page);
  assert(rows.length === 4 && rows.some(t => t.includes('N-2001')), 'Έτοιμες tab lists 4 rows incl. the national one');
  assert(!rows.some(t => t.includes('R-1003')), 'blocked recO3 not in Έτοιμες');

  // ── no-price row: «—», never 0; excluded from the KPI total; checkbox STILL enabled ──
  const r4 = rowFor(page, 'R-1004');
  const r4txt = await r4.innerText();
  assert(/—/.test(r4txt) && !/0,00/.test(r4txt), 'no-price row shows «—», not 0,00');
  const kpi = await page.locator('#invKPI').innerText();
  assert(/3\.300,00/.test(kpi), 'KPI ready total = 3.300,00 € (1000+2000+300; no-price row excluded)');
  assert(/1 χωρίς τιμή/.test(kpi), 'KPI shows «1 χωρίς τιμή» warning');
  assert(!(await r4.locator('.inv-cb').isDisabled()), 'CURRENT BEHAVIOUR: no-price row checkbox is enabled — can be marked invoiced without a price (audit §3.3.2, owner decision)');
  await page.screenshot({ path: shot('01-ready-1440'), fullPage: true });

  // ── detail panel on a ready order: TMS pre-fills INV-YYYY-NNNN ──
  await rowFor(page, 'R-1001').click();
  await page.waitForSelector('#invNumInput');
  const prefilled = await page.inputValue('#invNumInput');
  assert(/^INV-\d{4}-0001$/.test(prefilled), 'CURRENT BEHAVIOUR: invoice number pre-filled by the TMS (' + prefilled + ') — audit §3.3.3, owner decision');
  assert(await page.inputValue('#invDateInput') === today(), 'invoice date pre-filled with today');
  await page.screenshot({ path: shot('02-detail-form-1440'), fullPage: true });

  // ── single mark: type the ERP number → exactly one PATCH orders with the 3 fields, no Status ──
  await page.fill('#invNumInput', 'ERP-2026-0001');
  await page.locator('#invDetail button', { hasText: 'Σήμανση ως τιμολογημένη' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#invTabs button')[2].innerText.includes('(2)'), null, { timeout: 5000 });
  const p1 = captured.filter(c => c.id === 'recO1');
  assert(p1.length === 1 && p1[0].table === 'orders', 'single mark → exactly one PATCH on ORDERS/recO1');
  assert(p1[0] && p1[0].fields && p1[0].fields.Invoiced === true && p1[0].fields['Invoice Number'] === 'ERP-2026-0001' && p1[0].fields['Invoice Date'] === today(), 'PATCH body = {Invoiced:true, Invoice Number:ERP-2026-0001, Invoice Date:today}');
  assert(p1[0] && !('Status' in p1[0].fields) && Object.keys(p1[0].fields).length === 3, 'no Status write, no extra fields (locked 23/8)');
  assert(await tabCount(page, 'Τιμολογημένες') === 2 && await tabCount(page, 'Έτοιμες') === 3, 'after the write: Τιμολογημένες 2, Έτοιμες 3');

  // ── blocked order: disabled button with stop counts, NO override for accountant ──
  await page.locator('#invTabs button', { hasText: 'Μπλοκαρισμένες' }).click();
  await rowFor(page, 'R-1003').click();
  await page.waitForFunction(() => /Λείπει δελτίο/.test(document.getElementById('invDetail').innerText), null, { timeout: 5000 });
  const det = page.locator('#invDetail');
  assert(await det.locator('button:disabled', { hasText: 'Λείπει δελτίο σε 1 από 2 φορτώσεις' }).count() === 1, 'blocked: «Λείπει δελτίο σε 1 από 2 φορτώσεις — δεν τιμολογείται» (disabled)');
  assert(await det.locator('button', { hasText: 'παράκαμψη' }).count() === 0, 'blocked: no «Τιμολόγηση με παράκαμψη» for accountant (owner-only)');
  assert(await det.locator('#invNumInput').count() === 0, 'blocked: no invoice form');
  assert(await rowFor(page, 'R-1003').locator('.inv-cb').isDisabled(), 'blocked: row checkbox disabled');
  await page.screenshot({ path: shot('03-blocked-1440'), fullPage: true });

  // ── national order: same form, PATCH goes to NATIONAL ORDERS ──
  await page.locator('#invTabs button', { hasText: 'Έτοιμες' }).click();
  await rowFor(page, 'N-2001').click();
  await page.waitForSelector('#invNumInput');
  await page.fill('#invNumInput', 'ERP-2026-0002');
  await page.locator('#invDetail button', { hasText: 'Σήμανση ως τιμολογημένη' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#invTabs button')[2].innerText.includes('(3)'), null, { timeout: 5000 });
  const pn = captured.filter(c => c.id === 'recN1');
  assert(pn.length === 1 && pn[0].table === 'national_orders' && pn[0].fields['Invoice Number'] === 'ERP-2026-0002', 'national mark → one PATCH on NATIONAL ORDERS/recN1 with the typed number');

  // ── bulk: checkboxes → confirm modal → one PATCH per order with TMS-generated numbers ──
  await page.locator('#invTabs button', { hasText: 'Έτοιμες' }).click();
  await rowFor(page, 'R-1002').locator('.inv-cb').check();
  await rowFor(page, 'R-1004').locator('.inv-cb').check();
  assert(await page.locator('#invBatchBtn').isVisible(), 'bulk button appears once rows are checked');
  await page.click('#invBatchBtn');
  await page.waitForSelector('#_cfaOk', { timeout: 5000 });
  const modalTxt = await page.locator('#modalOverlay').innerText();
  assert(/Σήμανση 2 παραγγελιών/.test(modalTxt) && /Αυτόματη αρίθμηση/.test(modalTxt), 'bulk confirm modal says 2 orders + «Αυτόματη αρίθμηση τιμολογίων»');
  await page.click('#_cfaOk');
  await page.waitForFunction(() => document.querySelectorAll('#invTabs button')[2].innerText.includes('(5)'), null, { timeout: 8000 });
  const bulk = captured.filter(c => c.id === 'recO2' || c.id === 'recO4');
  assert(bulk.length === 2, 'bulk → 2 PATCHes (recO2, recO4)');
  assert(bulk.every(c => /^INV-\d{4}-\d{4}$/.test(c.fields['Invoice Number'])), 'CURRENT BEHAVIOUR: bulk writes TMS-generated numbers ' + bulk.map(c => c.fields['Invoice Number']).join(', ') + ' — nobody typed an ERP number (audit §3.3.3)');
  assert(bulk.some(c => c.id === 'recO4'), 'CURRENT BEHAVIOUR: the no-price order recO4 got marked invoiced in bulk (audit §3.3.2)');
  assert(!captured.some(c => c.id === 'recO3'), 'blocked recO3 was never PATCHed');
  assert(!captured.some(c => c.id === 'recO6'), 'hidden leg recO6 was never PATCHed');
  await page.locator('#invTabs button', { hasText: 'Τιμολογημένες' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#invBody tr').length === 5, null, { timeout: 5000 });
  await page.screenshot({ path: shot('04-invoiced-1440'), fullPage: true });

  // ── week filter silently drops national rows (audit §3.3.5) ──
  await page.locator('#invTabs button', { hasText: 'Όλες' }).click();
  const before = (await rowsText(page)).length;
  await page.fill('input[placeholder="Εβδομάδα από"]', '1');
  await page.locator('input[placeholder="Εβδομάδα από"]').dispatchEvent('input');
  await page.locator('input[placeholder="Εβδομάδα από"]').dispatchEvent('change');
  await page.waitForTimeout(300);
  const after = await rowsText(page);
  assert(before === 6 && after.length === 5 && after.every(t => /R-100\d/.test(t)) && !after.some(t => t.includes('N-2001')), 'CURRENT BEHAVIOUR: week filter «από 1» keeps the 5 international rows (Week Number computed on ORDERS) and silently drops the national one — ' + before + ' → ' + after.length);

  assert(page._errors.length === 0, 'no page errors / native dialogs: ' + JSON.stringify(page._errors));
  assert(captured.length === 4, 'total PATCHes = 4 (single intl, single natl, bulk ×2) — nothing else wrote');
  await page.context().close();
}

async function runManagement(browser) {
  const captured = [];
  const page = await newPage(browser, 'management', captured);
  console.log('\n[management] Τιμολόγηση — read only');
  await openInvoicing(page);
  await rowFor(page, 'R-1001').click();
  await page.waitForFunction(() => document.getElementById('invDetail').style.display !== 'none', null, { timeout: 5000 });
  assert(await page.locator('#invNumInput').count() === 0, 'management: no invoice form (orders:view, costs:view)');
  assert(captured.length === 0 && page._errors.length === 0, 'management: no writes, no errors');
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL);
  const browser = await chromium.launch();
  try {
    await runAccountant(browser);
    await runManagement(browser);
  } catch (e) {
    failed++;
    console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOT_DIR}`);
  process.exit(failed ? 1 : 0);
})();
