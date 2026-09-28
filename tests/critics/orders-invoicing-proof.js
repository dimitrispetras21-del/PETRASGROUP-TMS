// Proof rig for the view «Προς τιμολόγηση» of the one «Παραγγελίες» page
// (modules/orders_invoicing_view.js, owner 28/9/2026, Figma 805:1011).
//
// Same pattern as the former tests/critics/invoicing-proof.js (retired 29/9, git history): preparePage/gotoPage (fake
// session + HAR replay), then page.route mocks registered AFTER preparePage so
// they win for the calls the view makes (orders, national orders, clients,
// locations, /pallets/gate, /pallets/override). Static assets load LIVE from
// PW_BASE_URL — the code under test. The proof is the PATCH BODY, never a toast.
//
// Run from the MAIN repo root (node_modules live there):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<dir>/ node <dir>/tests/critics/orders-invoicing-proof.js
//
// Fixture (synthetic, fictional clients). PREV = last Saturday-week, PREV2 the
// one before, CUR = this week (Weekly rule: export by delivery, import and
// national by loading):
//   PREV  ready  #1229 Alpina 3.350 · #1233 Alpina 3.350 · #1228 Baltic (import) 2.650
//               #1230 Nordfrisch (import) 2.800 · N1 Γαλακτοκομική 560 · N2 Γαλακτοκομική 540
//               N3 Ελαιώνες 880                                   → 7 · 14.130,00 €
//         blocked #1240 Baltic no price · #1241 Alpina sheets (gate 1/2)
//   PREV2 invoiced #1214 Alpina ΤΠΥ 0431 3.200 · ready #1220 Nordfrisch 1.500
//   leg of #1229 (Parent Order) — never a row

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));
const TmsWeek = require(path.join(__dirname, '..', '..', 'core', 'tms-week.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-sleepy-mendeleev/31d040e2-ec65-4031-a029-e7fdc70e1ac8/scratchpad/rig';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = name => path.join(SHOT_DIR, 'invoicing-' + name + '.png');

const ORDERS = 'tblgHlNmLBH3JTdIM';
const NAT_ORDERS = 'tblGHCCsTMqAy4KR2';
const CLIENTS = 'tblFWKAQVUzAM8mCE';
const LOCATIONS = 'tblxu8DRfTQOFRCzS';

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(new Date());
const CUR = TmsWeek.startOfDate(TODAY);
const PREV = addDays(CUR, -7);
const PREV2 = addDays(CUR, -14);
const at = (base, n, hh = '10:00') => addDays(base, n) + 'T' + hh + ':00';
const dm = s => (+s.slice(8, 10)) + '/' + (+s.slice(5, 7));
const weekLabel = s => { const e = addDays(s, 6); return +s.slice(5, 7) === +e.slice(5, 7) ? `${+s.slice(8, 10)} – ${dm(e)}` : `${dm(s)} – ${dm(e)}`; };

const CLIENTS_FIXTURE = [
  { id: 'recCA', fields: { 'Company Name': 'Alpina Fresh S.r.l.', 'VAT Number': 'IT04211730265', Adress: 'Via Emilia 12', City: '41121 Modena', Country: 'IT', 'Payment Terms Days': 30 } },
  { id: 'recCB', fields: { 'Company Name': 'Baltic Cold Foods Sp. z o.o.', 'VAT Number': 'PL7812290456', Adress: 'ul. Portowa 4', City: 'Gdynia', Country: 'PL', 'Payment Terms Days': 60 } },
  { id: 'recCN', fields: { 'Company Name': 'Nordfrisch GmbH', 'VAT Number': 'DE611234567', City: 'Hamburg', Country: 'DE', 'Payment Terms Days': 45 } },
  { id: 'recCE', fields: { 'Company Name': 'Ελαιώνες Μεσσηνίας Α.Ε.', 'VAT Number': 'EL099887766', City: 'Καλαμάτα', Country: 'GR', 'Payment Terms Days': 30 } },
  // No VAT / terms on purpose: the card must say «δεν έχει καταχωρηθεί», not blank.
  { id: 'recCG', fields: { 'Company Name': 'Γαλακτοκομική Ηπείρου Α.Ε.', City: 'Ιωάννινα', Country: 'GR' } },
];
const LOC = (id, Name, City, Country) => ({ id, fields: { Name, City, Country } });
const LOCATIONS_FIXTURE = [
  LOC('recL1', 'Veria Fruit Pack', 'Veroia', 'GR'), LOC('recL2', 'Frigo Emilia S.p.A.', 'Bologna', 'IT'),
  LOC('recL3', 'Parma Freddo S.r.l.', 'Parma', 'IT'), LOC('recL4', 'Baltic Foods DC', 'Poznań', 'PL'),
  LOC('recL5', 'Veroia Cross-Dock', 'Veroia', 'GR'), LOC('recL6', 'Nordfrisch Lager', 'Hamburg', 'DE'),
  LOC('recL7', 'Attica Cold Hub', 'Aspropyrgos', 'GR'), LOC('recL8', 'Dodoni Dairy Plant', 'Dodoni', 'GR'),
  LOC('recL9', 'Messinia Olive Coop', 'Messini', 'GR'),
];
const intl = (id, f) => ({ id, fields: Object.assign({ Status: 'Delivered', Direction: 'Export', Goods: 'Fresh produce' }, f) });
const natl = (id, f) => ({ id, fields: Object.assign({ Direction: 'North→South', Goods: 'Γαλακτοκομικά' }, f) });
const route = (l, u) => ({ 'Loading Location 1': [l], 'Unloading Location 1': [u] });
const nroute = (l, u) => ({ 'Pickup Location 1': [l], 'Delivery Location 1': [u] });

function fixtures() {
  return {
    orders: [
      intl('recO1', Object.assign({ 'Order No': 1229, Reference: '6100118259', Client: ['recCA'], Price: 3350, 'Total Pallets': 33, 'Loading DateTime': at(PREV, 1), 'Delivery DateTime': at(PREV, 3) }, route('recL1', 'recL2'))),
      intl('recO2', Object.assign({ 'Order No': 1233, Reference: '6100118264', Client: ['recCA'], Price: 3350, 'Total Pallets': 33, 'Loading DateTime': at(PREV, 3), 'Delivery DateTime': at(PREV, 5) }, route('recL1', 'recL3'))),
      intl('recO3', Object.assign({ 'Order No': 1228, Reference: 'PL-2211', Direction: 'Import', Client: ['recCB'], Price: 2650, 'Total Pallets': 30, 'Loading DateTime': at(PREV, 2), 'Delivery DateTime': at(PREV, 4) }, route('recL4', 'recL5'))),
      intl('recO4', Object.assign({ 'Order No': 1230, Reference: 'DE-44871', Direction: 'Import', Client: ['recCN'], Price: 2800, 'Total Pallets': 26, 'Loading DateTime': at(PREV, 3), 'Delivery DateTime': at(PREV, 6) }, route('recL6', 'recL7'))),
      intl('recO5', Object.assign({ 'Order No': 1240, Reference: 'PL-2230', Client: ['recCB'], 'Total Pallets': 24, 'Loading DateTime': at(PREV, 0), 'Delivery DateTime': at(PREV, 2) }, route('recL1', 'recL4'))),
      intl('recO6', Object.assign({ 'Order No': 1241, Reference: '6100118270', Client: ['recCA'], Price: 1000, 'Pallet Exchange': true, 'Total Pallets': 20, 'Loading DateTime': at(PREV, 0), 'Delivery DateTime': at(PREV, 2) }, route('recL1', 'recL2'))),
      intl('recO7', Object.assign({ 'Order No': 1214, Reference: '6100118227', Client: ['recCA'], Price: 3200, 'Total Pallets': 33, Invoiced: true, 'Invoice Number': '0431', 'Invoice Date': addDays(PREV2, 5), 'Loading DateTime': at(PREV2, 0), 'Delivery DateTime': at(PREV2, 2) }, route('recL1', 'recL2'))),
      intl('recO8', Object.assign({ 'Order No': 1220, Reference: 'DE-44850', Direction: 'Import', Client: ['recCN'], Price: 1500, 'Total Pallets': 12, 'Loading DateTime': at(PREV2, 1), 'Delivery DateTime': at(PREV2, 3) }, route('recL6', 'recL7'))),
      intl('recO9', Object.assign({ 'Order No': 1229, Reference: '6100118259', Client: ['recCA'], 'Parent Order': ['recO1'], 'Leg No': 1, 'Loading DateTime': at(PREV, 1), 'Delivery DateTime': at(PREV, 3) }, route('recL1', 'recL5'))),
    ],
    natl: [
      natl('recN1', Object.assign({ Reference: '4500128790', Client: ['recCG'], Price: 560, Pallets: 22, 'Loading DateTime': at(PREV, 0), 'Delivery DateTime': at(PREV, 1) }, nroute('recL8', 'recL5'))),
      natl('recN2', Object.assign({ Reference: '4500128833', Direction: 'South→North', Client: ['recCG'], Price: 540, Pallets: 18, 'Loading DateTime': at(PREV, 1), 'Delivery DateTime': at(PREV, 2) }, nroute('recL5', 'recL8'))),
      natl('recN3', Object.assign({ Reference: 'ΔΑ 5531', Client: ['recCE'], Price: 880, Pallets: 20, 'Loading DateTime': at(PREV, 4), 'Delivery DateTime': at(PREV, 5) }, nroute('recL5', 'recL9'))),
    ],
  };
}
const GATE_FIXTURE = [{ order_rec: 'recO6', order_id: 1241, loading_stops: 2, covered_stops: 1, sheets_ok: false }];

// ── mocks + capture ─────────────────────────────────────────────────────────
// PATCHes are applied to the fixture, so the re-read that refreshBadges() does
// after a write sees what a real backend would return.
async function installMocks(page, cap) {
  const fx = fixtures();
  const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const recordsRoute = (list, table) => async r => {
    const req = r.request();
    if (req.method() === 'PATCH') {
      const m = req.url().match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
      const body = req.postDataJSON();
      cap.patches.push({ table, id: m ? m[1] : null, fields: body && body.fields });
      if (cap.fail422) {
        const msg = cap.fail422; cap.fail422 = null;
        return json(r, { error: msg }, 422);
      }
      const rec = list.find(x => x.id === (m && m[1]));
      if (rec) for (const [k, v] of Object.entries(body.fields || {})) { if (v === null) delete rec.fields[k]; else rec.fields[k] = v; }
      return json(r, { id: m ? m[1] : null, fields: rec ? rec.fields : body.fields });
    }
    return json(r, { records: list });
  };
  await page.route(/\/tbl[A-Za-z0-9]{14}(\?|\/|$)/, r => json(r, { records: [] }));
  await page.route(`**/${ORDERS}**`, recordsRoute(fx.orders, 'orders'));
  await page.route(`**/${NAT_ORDERS}**`, recordsRoute(fx.natl, 'national_orders'));
  await page.route(`**/${CLIENTS}**`, r => json(r, { records: CLIENTS_FIXTURE }));
  await page.route(`**/${LOCATIONS}**`, r => json(r, { records: LOCATIONS_FIXTURE }));
  await page.route('**/pallets/gate**', r => json(r, { records: GATE_FIXTURE }));
  await page.route('**/pallets/balances**', r => json(r, { records: [] }));
  await page.route('**/pallets/override**', r => { cap.overrides.push(r.request().postDataJSON()); return json(r, { ok: true }); });
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); }
}

async function newPage(browser, role) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage();
  const cap = { patches: [], overrides: [], fail422: null, errors: [], console: [] };
  page.on('pageerror', e => cap.errors.push(String(e)));
  page.on('dialog', d => { cap.errors.push('native dialog: ' + d.message()); d.dismiss(); });
  page.on('console', m => { if (m.type() === 'error') cap.console.push(m.text()); });
  await preparePage(page, role);
  // Non-accountant roles open the hub on the catalog; this view is chosen as
  // the viewer's remembered tab (the hub's own per-viewer preference key).
  await page.addInitScript(r => {
    localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'all', view: 'invoicing' }));
  }, role);
  await installMocks(page, cap);
  page._cap = cap;
  return page;
}

async function openView(page) {
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#oivBody tr', { timeout: 20000 });
  await page.waitForSelector('.oiv-kpi', { timeout: 5000 });
}
const txt = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const tabText = async (page, key) => (await page.locator(`.oiv-seg-b[data-tab="${key}"]`).innerText()).replace(/\s+/g, ' ').trim();
const rowOf = (page, label) => page.locator('#oivBody tr.oiv-r', { hasText: label }).first();
const cardText = page => txt(page, '#oivCard');

async function runAccountant(browser) {
  const page = await newPage(browser, 'accountant');
  const cap = page._cap;
  console.log('\n[accountant] Παραγγελίες → Προς τιμολόγηση');
  await openView(page);

  assert(await page.locator('.oh-tab.on[data-view="invoicing"]').count() === 1, 'hub opens on «Προς τιμολόγηση» (accountant default)');
  const sub = await txt(page, '#ohSub');
  assert(/εξαγωγή κατά παράδοση, εισαγωγή κατά φόρτωση/.test(sub), 'header sub-line set');
  assert(await page.locator('#ohActions button', { hasText: 'Φύλλο ERP (CSV)' }).count() === 1 && await page.locator('#ohActions button', { hasText: 'Εκτύπωση' }).count() === 1, 'header actions: Φύλλο ERP (CSV) + Εκτύπωση');

  // week strip
  const selWk = (await txt(page, '.oiv-wk.on')).replace(/\s+/g, ' ');
  assert(selWk.includes(weekLabel(PREV)) && /7 προς κοπή/.test(selWk), `default week = last week «${weekLabel(PREV)} · 7 προς κοπή» — got «${selWk}»`);
  const curWk = (await page.locator('.oiv-wk').last().innerText()).replace(/\s+/g, ' ');
  assert(curWk.includes(weekLabel(CUR)) && /σε εξέλιξη/.test(curWk), 'current week last, «σε εξέλιξη»');
  const prev2Wk = (await page.locator('.oiv-wk', { hasText: weekLabel(PREV2) }).innerText()).replace(/\s+/g, ' ');
  assert(/1 ανοιχτή/.test(prev2Wk), 'PREV2 week: «1 ανοιχτή» — ' + prev2Wk);
  assert(/Όλες οι ανοιχτές · 10/.test(await txt(page, '.oiv-allopen')), '«Όλες οι ανοιχτές · 10» (8 ready + 2 blocked, all weeks)');

  // KPI band
  const kpi = (await txt(page, '#oivKpis')).replace(/\s+/g, ' ');
  assert(/Προς κοπή 14\.130,00 € 7 παραγγελίες/.test(kpi), 'KPI Προς κοπή 14.130,00 € · 7 — ' + kpi);
  assert(/Διεθνείς 12\.150,00 € 4/.test(kpi) && /Εθνικές 1\.980,00 € 3/.test(kpi), 'KPI Διεθνείς 12.150,00/4 · Εθνικές 1.980,00/3');
  assert(/Τιμολογημένες 0,00 € 0/.test(kpi), 'KPI Τιμολογημένες 0 in the selected week');
  assert(/Παλαιότερη εκκρεμής \d+ ημέρες/.test(kpi), 'KPI Παλαιότερη εκκρεμής');
  const heroFont = await page.locator('.oiv-kpi.hero .n').evaluate(e => getComputedStyle(e).fontFamily);
  assert(/Syne/.test(heroFont), 'hero amount in Syne');
  const tok = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return { ok: c.getPropertyValue('--panel-ok').trim(), okHi: c.getPropertyValue('--panel-ok-hi').trim() }; });
  console.log('    tokens: --panel-ok=«' + tok.ok + '» --panel-ok-hi=«' + tok.okHi + '»');
  assert(tok.okHi !== '', 'the delivered dot token (--panel-ok-hi) resolves');

  // tabs
  assert(await tabText(page, 'ready') === 'Προς κοπή · 7', 'tab Προς κοπή · 7');
  assert(await tabText(page, 'blocked') === 'Μπλοκαρισμένες · 2', 'tab Μπλοκαρισμένες · 2');
  assert(await tabText(page, 'invoiced') === 'Τιμολογημένες · 0', 'tab Τιμολογημένες · 0');
  assert(await tabText(page, 'all') === 'Όλες · 9', 'tab Όλες · 9 (the split leg is not a row)');
  const badge = await txt(page, '#ohBadge_invoicing');
  assert(badge === '8', 'hub tab badge = 8 (ready, all weeks — same OrdersData set) — ' + badge);

  // groups + rows
  const groups = await page.locator('#oivBody tr.oiv-g').allInnerTexts();
  assert(groups.length === 5, '5 client groups in «Προς κοπή»');
  const alp = (groups.find(g => g.includes('Alpina')) || '').replace(/\s+/g, ' ');
  assert(/ΑΦΜ IT04211730265 · όροι 30 ημ\./.test(alp) && /2 · 6\.700,00 €/.test(alp), 'Alpina header: ΑΦΜ · όροι · «2 · 6.700,00 €» — ' + alp);
  assert(await page.locator('#oivBody tr.oiv-r').count() === 7, '7 order rows');
  const r1229 = (await rowOf(page, '#1229').innerText()).replace(/\s+/g, ' ');
  assert(/6100118259 Εξαγωγή/.test(r1229) && /Veria Fruit Pack/.test(r1229) && /Frigo Emilia/.test(r1229) && /3\.350,00/.test(r1229) && /προς κοπή · \d+ ημ\./.test(r1229), 'row #1229: ref+direction, places, price, «προς κοπή · N ημ.» — ' + r1229);
  const rN2 = (await rowOf(page, '4500128833').innerText()).replace(/\s+/g, ' ');
  assert(/^—/.test(rN2.trim()) && /Άνοδος/.test(rN2), 'national row: number «—» (pending backend), direction «Άνοδος» — ' + rN2);
  const foot = (await txt(page, '#oivFoot')).replace(/\s+/g, ' ');
  assert(/7 προς κοπή · 5 πελάτες · Enter καταχωρεί/.test(foot) && /Σύνολο 14\.130,00 €/.test(foot), 'footer: 7 προς κοπή · 5 πελάτες · Enter… · Σύνολο 14.130,00 € — ' + foot);

  // card
  await rowOf(page, '#1229').click();
  await page.waitForFunction(() => /#1229 · 6100118259/.test((document.getElementById('oivCard') || {}).innerText || ''));
  let card = await cardText(page);
  assert(/Alpina Fresh S\.r\.l\. · Εξαγωγή/.test(card) && /IT04211730265/.test(card) && /Via Emilia 12, 41121 Modena, IT/.test(card) && /30 ημέρες/.test(card), 'card ERP block: επωνυμία, ΑΦΜ, διεύθυνση, όροι');
  assert(/Δελτία παλετών · δεν απαιτούνται/.test(card) && /33 · χωρίς ανταλλαγή/.test(card), 'card: checks + pallets');
  assert(await page.inputValue('#oivNum') === '', 'ΤΠΥ box empty (never pre-filled)');
  assert(await page.inputValue('#oivDate') === TODAY, 'date defaults to today');
  assert(await page.locator('#oivSave').isDisabled(), '«Καταχώριση» disabled while ΤΠΥ empty');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'oivNum', 'ΤΠΥ box has focus');
  assert(/Επόμενη\s*#1233/.test(card), 'card: «Επόμενη #1233 …» (same client first)');
  await page.screenshot({ path: shot('01-accountant-ready') });

  // future date = error, button disabled
  await page.fill('#oivNum', '0434');
  await page.fill('#oivDate', addDays(TODAY, 2));
  await page.dispatchEvent('#oivDate', 'input');
  assert(await page.locator('#oivSave').isDisabled() && /μετά τη σημερινή/.test(await txt(page, '#oivHint')), 'future date → error text, button disabled');
  await page.fill('#oivDate', TODAY); await page.dispatchEvent('#oivDate', 'input');
  assert(!(await page.locator('#oivSave').isDisabled()), 'valid number + date → button enabled');

  // Enter → PATCH with exactly three fields
  await page.press('#oivNum', 'Enter');
  await page.waitForSelector('#oivUndo', { timeout: 5000 });
  const p1 = cap.patches.filter(p => p.id === 'recO1');
  assert(p1.length === 1 && p1[0].table === 'orders', 'Enter → one PATCH on ORDERS/recO1');
  assert(p1[0] && JSON.stringify(p1[0].fields) === JSON.stringify({ Invoiced: true, 'Invoice Number': '0434', 'Invoice Date': TODAY }), 'PATCH body = exactly {Invoiced, Invoice Number, Invoice Date} — ' + JSON.stringify(p1[0] && p1[0].fields));
  assert(/Καταχωρήθηκε ΤΠΥ 0434/.test(await txt(page, '#oivUndo')) && await page.locator('#oivUndo button', { hasText: 'Αναίρεση' }).count() === 1, 'undo bar «Καταχωρήθηκε ΤΠΥ 0434» + Αναίρεση');
  await page.waitForFunction(() => /#1233/.test((document.querySelector('#oivCard .oiv-ch-t') || {}).innerText || ''));
  assert(true, 'card moved to the next ready order of the same client (#1233)');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'oivNum', 'next card: ΤΠΥ box focused (Enter → next)');
  assert(await tabText(page, 'ready') === 'Προς κοπή · 6' && await tabText(page, 'invoiced') === 'Τιμολογημένες · 1', 'after the write: Προς κοπή 6 · Τιμολογημένες 1');
  await page.waitForFunction(() => (document.getElementById('ohBadge_invoicing') || {}).textContent === '7', null, { timeout: 5000 }).catch(() => {});
  assert(await txt(page, '#ohBadge_invoicing') === '7', 'hub badge re-read after the write: 7');
  await page.screenshot({ path: shot('02-after-write-undo-bar') });

  // same-client duplicate = grey note (allowed)
  await page.fill('#oivNum', '0434'); await page.dispatchEvent('#oivNum', 'input');
  assert(/ίδιου πελάτη/.test(await txt(page, '#oivHint')), 'same ΤΠΥ same client → grey note (allowed)');
  await page.fill('#oivNum', '');

  // undo from the bar → undo PATCH
  await page.click('#oivUndo button');
  await page.waitForFunction(() => !document.getElementById('oivUndo'));
  const pu = cap.patches.filter(p => p.id === 'recO1');
  assert(pu.length === 2 && JSON.stringify(pu[1].fields) === JSON.stringify({ Invoiced: false, 'Invoice Number': null, 'Invoice Date': null }), 'Αναίρεση → PATCH {Invoiced:false, Invoice Number:null, Invoice Date:null}');
  assert(await tabText(page, 'ready') === 'Προς κοπή · 7', 'after undo: Προς κοπή 7 again');

  // other-client duplicate → confirm dialog; cancel = no PATCH
  await rowOf(page, '#1228').click();
  await page.waitForSelector('#oivNum');
  await page.fill('#oivNum', '0431'); await page.dispatchEvent('#oivNum', 'input');
  assert(/υπάρχει ήδη στην #1214 άλλου πελάτη/.test(await txt(page, '#oivHint')), 'ΤΠΥ of another client → warning under the field');
  const before = cap.patches.length;
  await page.press('#oivNum', 'Enter');
  await page.waitForSelector('#_cfaOk', { timeout: 5000 });
  assert(/#1214 άλλου πελάτη/.test(await txt(page, '#modalOverlay')), 'confirm dialog names the other order');
  await page.click('#_cfaCancel');
  await page.waitForTimeout(200);
  assert(cap.patches.length === before, 'cancel → no PATCH');

  // Worker 422 → message in the card, NO success signal
  await rowOf(page, '4500128790').click();
  await page.waitForSelector('#oivNum');
  cap.fail422 = 'Δεν σημαίνεται τιμολογημένη χωρίς τιμή';
  await page.fill('#oivNum', 'E-77'); await page.dispatchEvent('#oivNum', 'input');
  await page.press('#oivNum', 'Enter');
  await page.waitForSelector('#oivCard .oiv-err', { timeout: 8000 });
  const pn = cap.patches[cap.patches.length - 1];
  assert(pn.table === 'national_orders' && pn.id === 'recN1', 'national order PATCH goes to NATIONAL ORDERS');
  assert(/Δεν σημαίνεται τιμολογημένη χωρίς τιμή/.test(await txt(page, '#oivCard .oiv-err')), '422 → the Worker message is shown in the card');
  assert(await page.locator('#oivUndo').count() === 0 && !/Καταχωρήθηκε/.test(await page.locator('body').innerText()), '422 → no undo bar, no «Καταχωρήθηκε»');
  assert(await tabText(page, 'ready') === 'Προς κοπή · 7', '422 → counts unchanged');
  assert(await page.inputValue('#oivNum') === 'E-77', '422 → the typed ΤΠΥ is kept (no retyping)');
  await page.screenshot({ path: shot('03-worker-422') });

  // blocked
  await page.click('.oiv-seg-b[data-tab="blocked"]');
  assert(await page.locator('#oivBody tr.oiv-r').count() === 2, 'Μπλοκαρισμένες: 2 rows');
  const bRows = (await page.locator('#oivBody').innerText()).replace(/\s+/g, ' ');
  assert(/τιμή → owner/.test(bRows) && /δελτίο → Αλεξία/.test(bRows), 'blocked rows name the responsible person');
  await rowOf(page, '#1241').click();
  await page.waitForFunction(() => /#1241/.test((document.getElementById('oivCard') || {}).innerText || ''));
  card = await cardText(page);
  assert(/λείπει σε 1 από 2 φορτώσεις → Αλεξία/i.test(card) && await page.locator('#oivNum').count() === 0, 'sheets-blocked card: 1/2 stops, Αλεξία, no form');
  assert(await page.locator('.oiv-warn-btn').count() === 0, 'accountant: no gate override (owner only)');
  await page.screenshot({ path: shot('04-blocked-sheets') });
  await rowOf(page, '#1240').click();
  card = await cardText(page);
  assert(/Χωρίς τιμή — την καταχωρεί ο owner/.test(card) && /χωρίς τιμή/.test(card), 'price-blocked card: owner');

  // invoiced week
  await page.locator('.oiv-wk', { hasText: weekLabel(PREV2) }).click();
  await page.click('.oiv-seg-b[data-tab="invoiced"]');
  await rowOf(page, '#1214').click();
  card = await cardText(page);
  assert(/Τιμολογήθηκε/.test(card) && /ΤΠΥ 0431/.test(card) && /Διόρθωση ΤΠΥ/.test(card) && /Αναίρεση τιμολόγησης/.test(card), 'invoiced card: ΤΠΥ 0431 + Διόρθωση + Αναίρεση');
  assert(/✓ ΤΠΥ 0431/.test(await rowOf(page, '#1214').innerText()), 'invoiced row: «✓ ΤΠΥ 0431»');
  await page.screenshot({ path: shot('05-invoiced') });

  // correction: confirm → PATCH number+date only
  await page.click('.oiv-link:has-text("Διόρθωση ΤΠΥ")');
  await page.fill('#oivEditNum', '0432');
  await page.click('.oiv-edit .oiv-primary');
  await page.waitForSelector('#_cfaOk'); await page.click('#_cfaOk');
  await page.waitForFunction(() => /ΤΠΥ 0432/.test((document.getElementById('oivCard') || {}).innerText || ''), null, { timeout: 5000 });
  const pc = cap.patches[cap.patches.length - 1];
  assert(pc.id === 'recO7' && JSON.stringify(Object.keys(pc.fields)) === JSON.stringify(['Invoice Number', 'Invoice Date']) && pc.fields['Invoice Number'] === '0432', 'Διόρθωση ΤΠΥ → PATCH {Invoice Number, Invoice Date}');

  // all open
  await page.click('.oiv-allopen');
  await page.click('.oiv-seg-b[data-tab="ready"]');
  assert(await tabText(page, 'ready') === 'Προς κοπή · 8' && await tabText(page, 'all') === 'Όλες · 10', '«Όλες οι ανοιχτές»: Προς κοπή 8 · Όλες 10');

  // search
  await page.fill('#oivQ', 'nordfrisch');
  await page.waitForTimeout(300);
  assert(await page.locator('#oivBody tr.oiv-r').count() === 2, 'search «nordfrisch» → 2 rows');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'oivQ', 'search keeps the caret in the search box');
  await page.fill('#oivQ', ''); await page.waitForTimeout(300);

  // A4 print of the current list
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#ohActions button:has-text("Εκτύπωση")')]);
  await pop.waitForLoadState('domcontentloaded');
  const ptxt = (await pop.locator('body').innerText()).replace(/\s+/g, ' ');
  assert(/Προς τιμολόγηση — Όλες οι ανοιχτές/.test(ptxt) && (await pop.locator('tbody tr').count()) === 8 + 5 && /Σύνολο 15\.630,00/.test(ptxt), 'Εκτύπωση: A4 of the current list (8 orders in 5 client groups, Σύνολο 15.630,00) — ' + ptxt.slice(0, 120));
  await pop.close();

  // CSV
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ohActions button:has-text("Φύλλο ERP")')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\n');
  assert(csv[0] === '"ΑΡ.","Αναφορά","Πελάτης","ΑΦΜ","Διεύθυνση","Φόρτωση","Παράδοση","Ημ. παράδοσης","Παλέτες","Ποσό","ΤΠΥ","Ημ. ΤΠΥ"', 'CSV header = the 12 ERP columns');
  assert(csv.length === 9 && csv.some(l => l.startsWith('"#1229","6100118259","Alpina Fresh S.r.l.","IT04211730265"') && l.includes('"3350.00"')), 'CSV: 8 rows (current list), #1229 with ΑΦΜ and amount — ' + csv.length);

  // scope
  await page.click('.oh-seg-b[data-scope="natl"]');
  await page.waitForSelector('.oiv-kpi');
  await page.waitForFunction(() => /Προς κοπή · 3/.test((document.querySelector('.oiv-seg-b[data-tab="ready"]') || {}).innerText || ''), null, { timeout: 8000 }).catch(() => {});
  assert(await tabText(page, 'ready') === 'Προς κοπή · 3', 'scope Εθνικές: Προς κοπή 3 (last week only — the view keeps the week)');
  assert(!/Διεθνείς/.test(await txt(page, '#oivKpis')), 'scope Εθνικές: no «Διεθνείς» KPI');
  await page.screenshot({ path: shot('06-scope-natl') });
  await page.click('.oh-seg-b[data-scope="all"]');

  assert(cap.errors.length === 0, 'no page errors / native dialogs: ' + JSON.stringify(cap.errors));
  const ownConsole = cap.console.filter(t => !/Failed to load resource|ERR_FAILED/.test(t) || /422/.test(t));
  console.log('    console errors (excl. HAR aborts): ' + JSON.stringify(ownConsole));
  assert(ownConsole.every(t => /422|χωρίς τιμή/.test(t)), 'no console errors except the deliberate 422');
  await page.context().close();
}

async function runDispatcher(browser) {
  const page = await newPage(browser, 'dispatcher');
  const cap = page._cap;
  console.log('\n[dispatcher] Προς τιμολόγηση — μόνο ανάγνωση');
  await openView(page);
  assert(await tabText(page, 'ready') === 'Προς κοπή · 7', 'dispatcher sees the same list (7 προς κοπή)');
  await rowOf(page, '#1229').click();
  await page.waitForFunction(() => /#1229/.test((document.getElementById('oivCard') || {}).innerText || ''));
  assert(await page.locator('#oivNum').count() === 0 && await page.locator('#oivSave').count() === 0, 'dispatcher: no ΤΠΥ input, no «Καταχώριση»');
  assert(!/Enter καταχωρεί/.test(await txt(page, '#oivFoot')), 'dispatcher: footer without the Enter hint');
  await page.screenshot({ path: shot('07-dispatcher-readonly') });
  await page.locator('.oiv-wk', { hasText: weekLabel(PREV2) }).click();
  await page.click('.oiv-seg-b[data-tab="invoiced"]');
  await rowOf(page, '#1214').click();
  const card = await cardText(page);
  assert(!/Διόρθωση ΤΠΥ/.test(card) && !/Αναίρεση τιμολόγησης/.test(card), 'dispatcher: no correction / undo on invoiced');
  assert(cap.patches.length === 0 && cap.errors.length === 0, 'dispatcher: no writes, no page errors ' + JSON.stringify(cap.errors));
  await page.context().close();
}

async function runOwner(browser) {
  const page = await newPage(browser, 'owner');
  const cap = page._cap;
  console.log('\n[owner] παράκαμψη πύλης δελτίων');
  await openView(page);
  await page.click('.oiv-seg-b[data-tab="blocked"]');
  await rowOf(page, '#1241').click();
  await page.click('.oiv-warn-btn');
  await page.fill('#oivOvReason', 'Δελτίο παραδόθηκε σε χαρτί, ανεβαίνει αύριο');
  await page.fill('#oivOvNum', '0440');
  await page.screenshot({ path: shot('08-owner-override') });
  await page.click('.oiv-edit .oiv-primary');
  await page.waitForSelector('#oivUndo', { timeout: 5000 });
  assert(cap.overrides.length === 1 && cap.overrides[0].order_rec === 'recO6' && /χαρτί/.test(cap.overrides[0].reason), 'owner: POST /pallets/override with the reason, BEFORE the write');
  const p = cap.patches.find(x => x.id === 'recO6');
  assert(p && JSON.stringify(p.fields) === JSON.stringify({ Invoiced: true, 'Invoice Number': '0440', 'Invoice Date': TODAY }), 'owner: then the 3-field PATCH');
  assert(/με παράκαμψη/.test(await txt(page, '#oivUndo')), 'undo bar says «με παράκαμψη»');
  assert(cap.errors.length === 0, 'owner: no page errors ' + JSON.stringify(cap.errors));
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL + ' · σήμερα ' + TODAY + ' · εβδομάδες ' + PREV2 + ' / ' + PREV + ' / ' + CUR);
  const browser = await chromium.launch();
  try {
    await runAccountant(browser);
    await runDispatcher(browser);
    await runOwner(browser);
  } catch (e) {
    failed++;
    console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOT_DIR}`);
  process.exit(failed ? 1 : 0);
})();
