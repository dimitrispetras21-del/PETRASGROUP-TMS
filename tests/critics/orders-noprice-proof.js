// Proof script for the «Χωρίς τιμή» view of «Παραγγελίες» (owner 27–28/9/2026,
// Figma 808:1275 screen + 775:1011 A4). Modelled on the former invoicing-proof.js (retired 29/9 with modules/invoicing.js — git history).
//
// Run from the MAIN repo root (its node_modules + HAR), against a server that
// serves the code under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<worktree>/ \
//     node .claude/worktrees/<worktree>/tests/critics/orders-noprice-proof.js
//
// preparePage/gotoPage (fake session + HAR replay) from tests/critics/auth.js,
// then page.route mocks registered AFTER it so they win for the calls this view
// makes: ORDERS, NATIONAL ORDERS, CLIENTS (names + ΑΦΜ/όροι), TRUCKS, PARTNERS,
// LOCATIONS, GET /audit. The PATCH body is CAPTURED — the proof is the payload
// and the table it went to, not the toast.
//
// Fixture (synthetic, fictional clients, no production data), today = run day:
//   recX1  #1209 Thracia Foods, 17 days since delivery, NO price     → listed, red bar
//   recX0  #1220 Thracia Foods, same route, 950, invoiced            → last-price hint for recX1
//   recX2  #1225 Nordfrisch, 7 days, NO price, partner               → listed
//   recX3  #1211 Nordfrisch, same route, 3300                         → hint for recX2
//   recN1  Ανδρέου (national), 4 days, NO price, no number/reference → listed, «— πρώτη φορά»
//   recX5  #1240 NO price but still Assigned (not delivered)         → NOT listed
//   recX4  #1230 priced today (audit: null → 2800)                    → «Συμπληρώθηκαν σήμερα»
//   recN2  national priced today (audit national_orders: 0 → 420)     → «Συμπληρώθηκαν σήμερα»
//   recX5 also has a today audit fill — pending, so NOT a «συμπλήρωση» of this list.

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-sleepy-mendeleev/31d040e2-ec65-4031-a029-e7fdc70e1ac8/scratchpad/rig';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = name => path.join(SHOT_DIR, 'noprice-' + name + '.png');

const T = {
  ORDERS: 'tblgHlNmLBH3JTdIM', NAT_ORDERS: 'tblGHCCsTMqAy4KR2', CLIENTS: 'tblFWKAQVUzAM8mCE',
  TRUCKS: 'tblEAPExIAjiA3asD', PARTNERS: 'tblLHl5m8bqONfhWv', LOCATIONS: 'tblxu8DRfTQOFRCzS',
};
const ymdLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymdLocal(d) + 'T10:00:00.000Z'; };
const dm = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getDate() + '/' + (d.getMonth() + 1); };
// «Today at h:m» — but never LATER than now: a run after midnight (found
// 29/9 00:40) put the stub audit rows «in the future», so they sorted above
// the save made during the run and the «newest first» check failed. When h:m
// is still ahead, the rows are placed a few minutes back instead, keeping
// their order (later h:m → more recent). Runs in 00:00–00:17 would cross into
// yesterday — rerun after that.
const todayAt = (h, m) => {
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 60000) return d.toISOString();
  return new Date(Date.now() - (1440 - (h * 60 + m)) * 1000).toISOString();
};

const CLIENTS = [
  { id: 'recC1', fields: { 'Company Name': 'Thracia Foods EOOD', 'VAT Number': 'BG 204567891', 'Payment Terms Days': 30 } },
  { id: 'recC2', fields: { 'Company Name': 'Nordfrisch GmbH', 'VAT Number': 'DE 811234567', 'Payment Terms Days': 45 } },
  // No terms on purpose: 0/1.920 clients had payment_terms_days written (24/8) — the gap must show.
  { id: 'recC3', fields: { 'Company Name': 'Ανδρέου Logistics Μ.Ι.Κ.Ε.', 'VAT Number': 'EL 801234567' } },
];
const LOCATIONS = [
  { id: 'recL1', fields: { Name: 'Thracia Foods Warehouse', City: 'Plovdiv', Country: 'Bulgaria' } },
  { id: 'recL2', fields: { Name: 'Veroia Cross-Dock', City: 'Veroia', Country: 'Greece' } },
  { id: 'recL3', fields: { Name: 'Veria Fruit Pack', City: 'Veroia', Country: 'Greece' } },
  { id: 'recL4', fields: { Name: 'Bayern Frisch DC', City: 'München', Country: 'Germany' } },
  { id: 'recL5', fields: { Name: 'Andreou Warehouse', City: 'Tripoli', Country: 'Greece' } },
  { id: 'recL6', fields: { Name: 'Nordfrisch Lager', City: 'Hamburg', Country: 'Germany' } },
  { id: 'recL7', fields: { Name: 'Attica Cold Hub', City: 'Aspropyrgos', Country: 'Greece' } },
  { id: 'recL8', fields: { Name: 'Frutopia Packhouse', City: 'Naousa', Country: 'Greece' } },
];
const TRUCKS = [{ id: 'recT1', fields: { 'License Plate': 'ΚΗΞ 5102', Active: true } }];
const PARTNERS = [{ id: 'recP1', fields: { 'Company Name': 'Transfrio Logistics', Country: 'Greece' } }];

const intl = (id, f) => ({ id, fields: Object.assign({ Status: 'Delivered', Direction: 'Export' }, f) });
const ORDERS = [
  intl('recX1', { 'Order No': 1209, Reference: 'BG-0852', Client: ['recC1'], 'Loading Location 1': ['recL1'], 'Unloading Location 1': ['recL2'], 'Loading DateTime': daysAgo(18), 'Delivery DateTime': daysAgo(17), 'Total Pallets': 20, Goods: 'Τυριά', 'Temperature °C': 4, Truck: ['recT1'] }),
  intl('recX0', { 'Order No': 1220, Reference: 'BG-0811', Client: ['recC1'], 'Loading Location 1': ['recL1'], 'Unloading Location 1': ['recL2'], 'Loading DateTime': daysAgo(14), 'Delivery DateTime': daysAgo(13), Price: 950, Invoiced: true, 'Invoice Number': 'ΤΠΥ-900', 'Total Pallets': 18 }),
  intl('recX2', { 'Order No': 1225, Reference: '6100118250', Client: ['recC2'], 'Loading Location 1': ['recL3'], 'Unloading Location 1': ['recL4'], 'Loading DateTime': daysAgo(9), 'Delivery DateTime': daysAgo(7), 'Total Pallets': 33, Goods: 'Ροδάκινα', 'Temperature °C': 2, Partner: ['recP1'] }),
  intl('recX3', { 'Order No': 1211, Reference: '6100117001', Client: ['recC2'], 'Loading Location 1': ['recL3'], 'Unloading Location 1': ['recL4'], 'Loading DateTime': daysAgo(24), 'Delivery DateTime': daysAgo(22), Price: 3300, 'Total Pallets': 33 }),
  intl('recX4', { 'Order No': 1230, Reference: 'DE-44871', Client: ['recC2'], 'Loading Location 1': ['recL6'], 'Unloading Location 1': ['recL7'], 'Loading DateTime': daysAgo(6), 'Delivery DateTime': daysAgo(3), Price: 2800, 'Total Pallets': 26, Direction: 'Import' }),
  intl('recX5', { 'Order No': 1240, Reference: 'PL-0001', Client: ['recC1'], Status: 'Assigned', 'Loading Location 1': ['recL1'], 'Unloading Location 1': ['recL2'], 'Loading DateTime': daysAgo(-2), 'Delivery DateTime': daysAgo(-3) }),
];
const NATS = [
  { id: 'recN1', fields: { Client: ['recC3'], 'Pickup Location 1': ['recL5'], 'Delivery Location 1': ['recL2'], 'Loading DateTime': daysAgo(5), 'Delivery DateTime': daysAgo(4), Pallets: 24, Goods: 'Λαχανικά', 'Temperature °C': 4, Direction: 'South→North' } },
  { id: 'recN2', fields: { Reference: 'ΠΑΡ 4431', Client: ['recC3'], 'Pickup Location 1': ['recL8'], 'Delivery Location 1': ['recL2'], 'Loading DateTime': daysAgo(18), 'Delivery DateTime': daysAgo(18), Pallets: 26, Price: 420, Direction: 'South→North' } },
];
const AUDIT = {
  orders: [
    { id: 11, actor: 'dimitris', role: 'owner', action: 'update', table_name: 'orders', record_id: 'recX4', created_at: todayAt(8, 47), before_data: JSON.stringify({ price: null, reference: 'DE-44871' }), after_data: JSON.stringify({ price: 2800, reference: 'DE-44871' }) },
    { id: 12, actor: 'pantelis', role: 'dispatcher', action: 'update', table_name: 'orders', record_id: 'recX5', created_at: todayAt(7, 10), before_data: JSON.stringify({ price: null }), after_data: JSON.stringify({ price: 1100 }) },
    { id: 13, actor: 'dimitris', role: 'owner', action: 'update', table_name: 'orders', record_id: 'recX3', created_at: todayAt(7, 5), before_data: JSON.stringify({ price: 3200 }), after_data: JSON.stringify({ price: 3300 }) },
  ],
  national_orders: [
    { id: 21, actor: 'dimitris', role: 'owner', action: 'update', table_name: 'national_orders', record_id: 'recN2', created_at: todayAt(8, 52), before_data: JSON.stringify({ price: 0 }), after_data: JSON.stringify({ price: 420 }) },
  ],
};

function installMocks(page, S) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const recordsRoute = (fixture, tableKey) => async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const m = req.url().match(/\/(rec[A-Za-z0-9]+)(\?|$)/);
      const body = req.postDataJSON();
      S.patches.push({ url: req.url(), table: tableKey, id: m ? m[1] : null, body });
      if (S.failNext) { const st = S.failNext; S.failNext = null; S.failStatus.push(st);
        return json(route, { error: st === 422 ? { type: 'INVALID_VALUE', message: 'Price rejected by the stub' } : 'Failed to update record' }, st); }
      // A 500 is retried by _atRetry: the retry must keep failing, as a real
      // outage would, until the stub is told otherwise.
      if (S.failSticky) return json(route, { error: 'Failed to update record' }, S.failSticky);
      const rec = fixture.find(r => r.id === (m && m[1]));
      if (rec && body && body.fields) Object.assign(rec.fields, body.fields);   // the «server» now holds it
      return json(route, { id: rec && rec.id, fields: rec ? rec.fields : {} });
    }
    return json(route, { records: fixture });
  };
  page.route(`**/${T.ORDERS}**`, recordsRoute(ORDERS, 'orders'));
  page.route(`**/${T.NAT_ORDERS}**`, recordsRoute(NATS, 'national_orders'));
  page.route(`**/${T.CLIENTS}**`, route => json(route, { records: CLIENTS }));
  page.route(`**/${T.LOCATIONS}**`, route => json(route, { records: LOCATIONS }));
  page.route(`**/${T.TRUCKS}**`, route => json(route, { records: TRUCKS }));
  page.route(`**/${T.PARTNERS}**`, route => json(route, { records: PARTNERS }));
  page.route('**/audit?**', route => {
    const u = new URL(route.request().url());
    S.auditCalls.push(u.search);
    if (S.auditFail) return json(route, { error: 'Failed to load audit trail' }, 500);
    return json(route, { entries: AUDIT[u.searchParams.get('table')] || [], count: 0 });
  });
  page.route('**/pallets/gate**', route => json(route, { records: [] }));
  page.route(/\/tbl[A-Za-z0-9]{14}(\?|\/|$)/, route => {
    const u = route.request().url();
    if (Object.values(T).some(id => u.includes(id))) return route.fallback();
    return json(route, { records: [] });
  });
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); }
}

async function newPage(browser, role, S) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page._errors = []; page._console = [];
  page.on('pageerror', e => page._errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page._console.push(m.text()); });
  page.on('dialog', d => { page._errors.push('native dialog: ' + d.message()); d.dismiss(); });
  await preparePage(page, role);
  await page.addInitScript(r => {
    localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'all', view: 'noprice' }));
    // The A4 goes to window.open; capture what would be written there.
    window.open = () => ({ document: { write(h) { window.__printed = (window.__printed || '') + h; }, close() {} } });
  }, role);
  installMocks(page, S);
  return page;
}

async function openView(page) {
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('.np-kpi', { timeout: 20000 });
}
const rows = page => page.locator('.np-card').first().locator('tr.np-row');
const kpiVal = async (page, label) => (await page.locator('.np-k', { hasText: label }).locator('.np-kv').innerText()).trim();
// #toast is one reused element that fades in via a transition — read its text,
// not its opacity (a read on the first frame saw opacity 0 and an empty toast).
const toastText = page => page.evaluate(() => { const t = document.getElementById('toast'); return t ? t.textContent : ''; });

async function renderA4(browser, html, name) {
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const p = await ctx.newPage();
  await p.setContent(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: shot(name), fullPage: true });
  await ctx.close();
}

async function runOwner(browser) {
  const S = { patches: [], auditCalls: [], failNext: null, failStatus: [], failSticky: null };
  const page = await newPage(browser, 'owner', S);
  console.log('\n[owner] Παραγγελίες · Χωρίς τιμή');
  await openView(page);

  const tab = page.locator('.oh-tab.on');
  assert(/Χωρίς τιμή/.test(await tab.innerText()), 'tab «Χωρίς τιμή» is the active view');
  assert(/γράψε τιμή και Enter/.test(await page.locator('#ohSub').innerText()), 'subtitle for the owner');
  assert(await page.locator('#ohActions button', { hasText: 'Εκτύπωση' }).count() === 1 && await page.locator('#ohActions button', { hasText: 'CSV' }).count() === 1, 'actions: Εκτύπωση + CSV');

  const txt = await rows(page).allInnerTexts();
  assert(txt.length === 3, '3 rows listed (recX1, recX2, recN1) — got ' + txt.length);
  assert(/#1209/.test(txt[0]) && /#1225/.test(txt[1]) && /Λαχανικά/.test(txt[2]), 'order: Thracia (17 d) → Nordfrisch (7 d) → Ανδρέου national (4 d)');
  assert(!txt.some(t => /#1240/.test(t)), 'undelivered order without price (#1240) is NOT listed');
  const grp = await page.locator('.np-grp').allInnerTexts();
  assert(grp.length === 3 && /Thracia Foods EOOD/.test(grp[0]) && /ΑΦΜ BG 204567891 · όροι 30 ημ\./.test(grp[0]), 'group header: client + «ΑΦΜ … · όροι 30 ημ.»');
  assert(/Ανδρέου Logistics/.test(grp[2]) && /όροι —/.test(grp[2]), 'missing terms shown as a gap «όροι —», not hidden');
  const late = await page.locator('tr.np-row.np-late').count();
  const lateTxt = await page.locator('tr.np-row.np-late').innerText();
  assert(late === 1 && /#1209/.test(lateTxt), 'red bar only on the row > 10 days (#1209)');
  const bar = await page.locator('tr.np-row.np-late td').first().evaluate(el => getComputedStyle(el).boxShadow);
  assert(/inset/.test(bar), 'red bar is painted (inset box-shadow): ' + bar);
  const dayColors = await page.locator('tr.np-row td.np-r.np-num:not(:has(span))').evaluateAll(tds => tds.map(td => getComputedStyle(td).color));
  const danger = await page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--danger)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  assert(dayColors.length === 3 && dayColors[0] === danger && dayColors[1] !== danger && dayColors[2] !== danger, 'ΜΕΡΕΣ: 17 painted --danger, 7 and 4 not: ' + JSON.stringify(dayColors));
  assert(/950,00/.test(txt[0]) && /#1220 · \d+\/\d+/.test(txt[0]), 'last-price hint on #1209 = 950,00 · #1220');
  assert(/3\.300,00/.test(txt[1]) && /#1211/.test(txt[1]), 'last-price hint on #1225 = 3.300,00 · #1211');
  assert(/— πρώτη φορά/.test(txt[2]), 'national with no history → «— πρώτη φορά»');
  assert(/ΚΗΞ 5102/.test(txt[0]) && /Transfrio Logistics/.test(txt[1]), 'vehicle line: truck plate / partner');
  assert(/Plovdiv BG/.test(txt[0]) && /Veroia GR/.test(txt[0]), 'places: name + «City CC»');
  assert(await kpiVal(page, 'Εκκρεμούν') === '3', 'KPI Εκκρεμούν 3');
  const oldest = await kpiVal(page, 'Παλαιότερη');
  assert(/17 ημέρες/.test(oldest) && new RegExp('από παράδοση · ' + dm(17).replace('/', '\\/')).test(oldest), 'KPI Παλαιότερη «17 ημέρες · από παράδοση · ' + dm(17) + '»: ' + oldest);
  assert(await page.locator('.np-k', { hasText: 'Παλαιότερη' }).locator('.np-red').count() === 1, 'Παλαιότερη painted red (> 10)');
  assert(await kpiVal(page, 'Πελάτες') === '3', 'KPI Πελάτες 3');
  assert(await kpiVal(page, 'Συμπληρώθηκαν σήμερα') === '2', 'KPI Συμπληρώθηκαν σήμερα 2 (from /audit: #1230 + national; pending #1240 and the 3200→3300 correction excluded)');
  assert(S.auditCalls.length === 2 && S.auditCalls.every(q => /action=update/.test(q) && /since=/.test(q)), '/audit read twice (orders + national_orders), action=update, since=today');
  const filled = await page.locator('#npFilled tr').allInnerTexts();
  assert(filled.length === 2 && /2\.800,00 €/.test(filled.join()) && /420,00 €/.test(filled.join()), 'filled section lists the 2 audited fills');
  assert(/D\. Petras/.test(filled.join()) && /→ Προς τιμολόγηση · εβδ\./.test(filled.join()), 'filled row: «… € · D. Petras HH:MM» + «→ Προς τιμολόγηση · εβδ. …»');
  assert(await page.locator('input.np-in').count() === 3, 'owner has one price box per row');
  assert(await page.locator('#ohBadge_noprice').innerText() === '3', 'tab badge = 3');
  await page.screenshot({ path: shot('01-owner-1440'), fullPage: true });

  // ── validation: nothing is sent ──
  const in2 = page.locator('input.np-in[data-id="recX2"]');
  await in2.fill('abc'); await in2.press('Enter');
  assert(/μεγαλύτερο του 0/.test(await page.locator('#npMsg_intl_recX2').innerText()) && S.patches.length === 0, '«abc» + Enter → inline error, no PATCH');
  await in2.fill('0'); await in2.press('Enter');
  assert(S.patches.length === 0, '«0» + Enter → no PATCH (price must be > 0)');

  // ── 422: error shown, no success toast, row stays ──
  const errBefore = page._console.length;
  S.failNext = 422;
  await in2.fill('3.250,00'); await in2.press('Enter');
  await page.waitForFunction(() => /Δεν αποθηκεύτηκε/.test((document.getElementById('npMsg_intl_recX2') || {}).innerText || ''), null, { timeout: 8000 });
  assert(S.patches.length === 1 && S.patches[0].body.fields.Price === 3250, '422 path: PATCH was sent with Price 3250 («3.250,00» parsed)');
  assert(!/καταχωρήθηκε/.test(await toastText(page)), '422: no success toast');
  assert(await rows(page).count() === 3 && !(await in2.isDisabled()), '422: row stays, box enabled again');
  await page.screenshot({ path: shot('02-owner-422'), fullPage: false });

  // ── 500 (retried, still failing) ──
  S.failSticky = 500;
  await in2.fill('3250'); await in2.press('Enter');
  await page.waitForFunction(() => { const i = document.querySelector('input.np-in[data-id="recX2"]'); return i && !i.disabled && /Δεν αποθηκεύτηκε/.test(document.getElementById('npMsg_intl_recX2').innerText); }, null, { timeout: 15000 });
  S.failSticky = null;
  assert(!/καταχωρήθηκε/.test(await toastText(page)) && await rows(page).count() === 3, '500: error shown, no success toast, row stays');
  assert(!(await page.locator('#tms-toast-container').innerText()).includes('Η τιμή δεν αποθηκεύτηκε'), 'failed save: no extra toast on top of atPatch\'s own');
  const errDuring = page._console.slice(errBefore);
  page._console.splice(errBefore);   // expected noise of the two failure paths
  console.log('    (console errors expected during the failure paths: ' + errDuring.length + ')');
  await in2.fill('');

  // ── success: «950» + Enter on #1209 ──
  const nBefore = S.patches.length;
  const in1 = page.locator('input.np-in[data-id="recX1"]');
  await in2.fill('3.1');   // typed but not saved — must survive the repaint
  await in1.fill('950'); await in1.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.np-card')[0].querySelectorAll('tr.np-row').length === 2, null, { timeout: 8000 });
  const p = S.patches.slice(nBefore);
  assert(p.length === 1 && p[0].table === 'orders' && p[0].id === 'recX1' && p[0].url.includes(T.ORDERS), 'one PATCH to ORDERS (' + T.ORDERS + ')/recX1');
  assert(p[0] && JSON.stringify(p[0].body.fields) === '{"Price":950}', 'PATCH fields exactly {"Price":950}: ' + JSON.stringify(p[0] && p[0].body));
  const tt = await toastText(page);
  assert(/Η τιμή καταχωρήθηκε — η #1209 πέρασε στα Προς τιμολόγηση/.test(tt), 'toast «Η τιμή καταχωρήθηκε — η #1209 πέρασε στα Προς τιμολόγηση»: ' + tt);
  const filled2 = await page.locator('#npFilled tr').allInnerTexts();
  assert(filled2.length === 3 && /#1209/.test(filled2[0]) && /950,00 €/.test(filled2[0]), 'row moved to «Συμπληρώθηκαν σήμερα» (top): ' + JSON.stringify(filled2).slice(0, 400));
  assert(await kpiVal(page, 'Εκκρεμούν') === '2' && await kpiVal(page, 'Συμπληρώθηκαν σήμερα') === '3', 'KPIs: Εκκρεμούν 2, Συμπληρώθηκαν σήμερα 3');
  assert(await page.locator('input.np-in[data-id="recX2"]').inputValue() === '3.1', 'the value typed in another row survived the repaint');
  await page.waitForFunction(() => (document.getElementById('ohBadge_noprice') || {}).textContent === '2', null, { timeout: 8000 }).catch(() => {});
  assert(await page.locator('#ohBadge_noprice').innerText() === '2', 'tab badge refreshed to 2');
  await page.screenshot({ path: shot('03-owner-after-save'), fullPage: true });

  // ── national write goes to NATIONAL ORDERS ──
  const n2 = S.patches.length;
  const inN = page.locator('input.np-in[data-id="recN1"]');
  await inN.fill('1.250'); await inN.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.np-card')[0].querySelectorAll('tr.np-row').length === 1, null, { timeout: 8000 });
  const pn = S.patches.slice(n2);
  assert(pn.length === 1 && pn[0].table === 'national_orders' && pn[0].url.includes(T.NAT_ORDERS) && JSON.stringify(pn[0].body.fields) === '{"Price":1250}', 'national → one PATCH to NATIONAL ORDERS with {"Price":1250}');

  // ── print + CSV ──
  await page.evaluate(() => { window.__printed = ''; });
  await page.click('#ohActions button:has-text("Εκτύπωση")');
  const html = await page.evaluate(() => window.__printed);
  assert(/Παραγγελίες χωρίς τιμή/.test(html) && /Επιστροφή στην Ειρήνη για καταχώριση/.test(html) && (html.match(/class="box"/g) || []).length === 1, 'A4 opened: title, footer, one empty «Τιμή €» box per remaining row');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#ohActions button:has-text("CSV")')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert(/Αρ\.","Τύπος","Αναφορά","Πελάτης","ΑΦΜ/.test(csv) && csv.trim().split('\n').length === 2 && /Nordfrisch GmbH/.test(csv), 'CSV: header + 1 row (Nordfrisch)');

  // ── /audit failure: grey note, never silence ──
  S.auditFail = true;
  await page.evaluate(() => OrdersHub.refresh());
  await page.waitForSelector('.np-note', { timeout: 8000 });
  assert(/ιστορικό σημερινών συμπληρώσεων δεν φορτώθηκε/.test(await page.locator('.np-note').innerText()), '/audit 500 → grey note «το ιστορικό σημερινών συμπληρώσεων δεν φορτώθηκε»');
  page._console = page._console.filter(m => !/500|audit/i.test(m));
  S.auditFail = false;

  assert(page._errors.length === 0, 'no page errors / native dialogs: ' + JSON.stringify(page._errors));
  assert(page._console.length === 0, 'no console errors outside the provoked failures: ' + JSON.stringify(page._console.slice(0, 5)));
  await page.context().close();
}

async function runAccountant(browser) {
  const S = { patches: [], auditCalls: [], failNext: null, failStatus: [] };
  // Fresh fixture state: the owner run wrote prices into the in-memory «server».
  ORDERS.find(r => r.id === 'recX1').fields.Price = undefined;
  NATS.find(r => r.id === 'recN1').fields.Price = undefined;
  const page = await newPage(browser, 'accountant', S);
  console.log('\n[accountant] Παραγγελίες · Χωρίς τιμή');
  await openView(page);
  const txt = await rows(page).allInnerTexts();
  assert(txt.length === 3, 'same 3 rows');
  assert(await page.locator('input.np-in').count() === 0 && await page.locator('th', { hasText: 'ΤΙΜΗ €' }).count() === 0, 'NO price inputs / no ΤΙΜΗ € column');
  assert(/τύπωσέ τη για τον owner/.test(await page.locator('#ohSub').innerText()), 'subtitle for the accountant');
  assert(/Ο owner συμπληρώνει τις τιμές/.test(await page.locator('.np-knote').innerText()), 'KPI note for the accountant');
  assert(S.auditCalls.length === 0, 'no /audit call (accountant is not an audit reader → would be 403)');
  assert(await kpiVal(page, 'Συμπληρώθηκαν σήμερα') === '—' && await page.locator('.np-note, .np-banner').count() === 0, 'Συμπληρώθηκαν σήμερα «—» (not a false 0), no error note/banner for her');
  assert(/φαίνονται στα «Προς τιμολόγηση»/.test(await page.locator('#npFilled').innerText()), 'filled section explains where today\'s fills show for her');
  assert(await page.locator('#ohActions .btn-primary', { hasText: 'Εκτύπωση' }).count() === 1, 'Εκτύπωση is her primary action (navy)');
  await page.screenshot({ path: shot('04-accountant-1440'), fullPage: true });
  await page.evaluate(() => { window.__printed = ''; });
  await page.click('#ohActions button:has-text("Εκτύπωση")');
  const html = await page.evaluate(() => window.__printed);
  assert((html.match(/class="box"/g) || []).length === 3 && (html.match(/<i>★<\/i>/g) || []).length === 1, 'A4: 3 boxes, ★ on the one row > 10 days');
  assert(/ΑΦΜ BG 204567891 · όροι 30 ημ\. · BG-0852/.test(html) && /950,00/.test(html), 'A4 row: ΑΦΜ · όροι · reference, last price 950,00');
  fs.writeFileSync(path.join(SHOT_DIR, 'noprice-a4.html'), html);
  await renderA4(browser, html, '05-a4');
  assert(S.patches.length === 0 && page._errors.length === 0, 'accountant: no writes, no page errors');
  assert(page._console.length === 0, 'accountant: no console errors: ' + JSON.stringify(page._console.slice(0, 5)));
  await page.context().close();
}

async function runManagement(browser) {
  const S = { patches: [], auditCalls: [] };
  ORDERS.find(r => r.id === 'recX1').fields.Price = undefined;
  NATS.find(r => r.id === 'recN1').fields.Price = undefined;
  const page = await newPage(browser, 'management', S);
  console.log('\n[management] Παραγγελίες · Χωρίς τιμή — read only');
  await openView(page);
  assert(await rows(page).count() === 3 && await page.locator('input.np-in').count() === 0, 'management: same 3 rows, no price inputs');
  assert(S.auditCalls.length === 2 && await kpiVal(page, 'Συμπληρώθηκαν σήμερα') === '2', 'management reads /audit (AUDIT_READERS) → Συμπληρώθηκαν σήμερα 2');
  assert(S.patches.length === 0 && page._errors.length === 0 && page._console.length === 0, 'management: no writes, no errors');
  await page.context().close();
}

async function runDispatcher(browser) {
  const S = { patches: [], auditCalls: [] };
  const page = await newPage(browser, 'dispatcher', S);
  console.log('\n[dispatcher]');
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('.oh-tabs', { timeout: 20000 });
  assert(await page.locator('.oh-tab[data-view="noprice"]').count() === 0, 'dispatcher: no «Χωρίς τιμή» tab');
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL);
  const browser = await chromium.launch();
  try {
    await runOwner(browser);
    await runAccountant(browser);
    await runManagement(browser);
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
