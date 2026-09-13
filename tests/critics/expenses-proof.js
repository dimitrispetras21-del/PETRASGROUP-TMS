// Proof script for the «Έξοδα Δρομολογίων» screen, v4 redesign
// (modules/expenses.js, owner 13/9/2026, after Figma KO7l2AfucR3HJEDIg1Yptr
// frames 547:1011/1297/1583).
// Spec: docs/superpowers/specs/2026-09-13-fuel-collection-program.md §0/§2.
//
// Run from the MAIN repo (it holds node_modules/playwright):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8792/ node <worktree>/tests/critics/expenses-proof.js
//
// A local `python3 -m http.server` must already be serving the WORKTREE root
// (the redesigned code, not the main checkout) on PW_BASE_URL's port.
//
// Reuses tests/critics/auth.js (preparePage/gotoPage) from the main repo.
// /costs/* is mocked on top with page.route, registered AFTER preparePage so
// it wins over the HAR replay route.
//
// What this proves (the five questions of CLAUDE.md, per action):
//   GET /costs/rt?from&to        → both tabs fetch ONE range, never history
//   GET /costs/lines?rt_id=      → one per visible trip
//   POST /costs/lines            → category/fuel_source/trailer_id/toll_country
//                                    exactly as the opened cell requires
//   PATCH /costs/lines/:id       → reason mandatory
//   PATCH /costs/ledger/:id      → {expenses[, reason]} — reason only when
//                                    an already-written value changes
//   roles                        → accountant writes, management reads,
//                                    dispatcher has no nav item and no page

const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8792/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-eager-varahamihira-938cd8/e583e093-c8bb-40dd-9da9-55d8771aed97/scratchpad';
const SHOT_WEEK = path.join(SHOT_DIR, 'expenses-v4-week-1440.png');
const SHOT_VEH = path.join(SHOT_DIR, 'expenses-v4-vehicle-1440.png');
const SHOT_1280 = path.join(SHOT_DIR, 'expenses-v4-1280.png');

// today() is fixed inside the HAR-replay session via auth.js — the RT fixture
// dates sit inside the accountant login's «today», so ctWeekOf(today) lands
// on week 37 (2026-09-05 → 2026-09-11) and the vehicle tab's «last 8 weeks»
// window (spec §2.Γ) ends on that same week.
const WEEK_START = '2026-09-05';
const LOOKUPS_FIXTURE = {
  trucks: [
    { id: 11, legacy_id: null, license_plate: 'ΘΕ-2001', active: true },
    { id: 12, legacy_id: null, license_plate: 'ΘΕ-2002', active: true },
  ],
  trailers: [
    { id: 21, legacy_id: null, license_plate: 'ΤΡ-9001', active: true },
    { id: 22, legacy_id: null, license_plate: 'ΤΡ-9002', active: true },
  ],
  drivers: [{ id: 11, legacy_id: null, full_name: 'Νίκος Οδηγός', active: true }],
  partners: [{ id: 1, legacy_id: null, company_name: 'Meta-Cargo ΕΠΕ', active: true }],
};
const rt = (o) => Object.assign({ code: null, scope: 'INTL', trip_type: 'OWNED', trailer_id: null, partner_id: null, route_legs: null, ct_rt_legs: [], ledger_entry: null }, o);
const RT_FIXTURE = [
  rt({ id: 701, truck_id: 11, driver_id: 11, trailer_id: 21, date_start: '2026-09-05', date_end: '2026-09-09', status: 'closed', route_text: 'Βέροια → Rotterdam', ledger_entry: { id: 501, expenses: 40 } }),
  rt({ id: 702, truck_id: 12, driver_id: 11, trailer_id: null, date_start: '2026-09-06', date_end: '2026-09-08', status: 'closed', route_text: 'Νάουσα → Wien', ledger_entry: { id: 502, expenses: null } }),
  rt({ id: 703, truck_id: null, driver_id: null, partner_id: 1, trip_type: 'PARTNER', date_start: '2026-09-08', date_end: '2026-09-10', status: 'in_progress', route_text: 'Σόφια → Βέροια', ledger_entry: null }),
];
const line = (o) => Object.assign({ toll_country: null, plate_raw: null, truck_id: null, trailer_id: null, fuel_source: null, km_reading: null, liters: null, station: null, doc_id: null, note: null, created_by: 'alexia', created_at: '2026-09-06T09:00:00Z' }, o);
const LINES_FIXTURE = [
  line({ id: 9101, rt_id: 701, category: 'fuel', net: 100, vat: 0, line_date: '2026-09-05', alloc_status: 'allocated', note: 'Α', fuel_source: 'DKV' }),
  line({ id: 9102, rt_id: 701, category: 'tolls', net: 30, vat: 0, toll_country: 'HU', line_date: '2026-09-06', alloc_status: 'allocated', doc_id: 5, note: 'DKV BOX' }),
];

function installCostsMocks(page, fx) {
  const store = { lines: fx.lines.map(l => ({ ...l })), rts: fx.rt.map(r => ({ ...r })), nextId: 20000 };
  const captured = { rtGets: [], lineGets: [], posts: [], patches: [], deletes: [], ledgerPatches: [] };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  page.route('**/costs/rt**', route => {
    const url = new URL(route.request().url());
    captured.rtGets.push(url.search);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const rows = store.rts.filter(r => (!from || r.date_start >= from) && (!to || r.date_start <= to));
    return json(route, { records: rows });
  });
  page.route('**/costs/lookups', route => json(route, fx.lookups));
  page.route('**/costs/import/docs**', route => json(route, { records: [] }));
  page.route('**/costs/pallet-gate', route => json(route, { records: [] }));
  page.route('**/tblgHlNmLBH3JTdIM**', route => json(route, { records: [] }));
  page.route('**/pallets/gate**', route => json(route, { records: [] }));
  page.route('**/tblEAPExIAjiA3asD**', route => json(route, { records: [] }));
  page.route('**/costs/ledger/**', route => {
    const req = route.request();
    if (req.method() !== 'PATCH') return json(route, {}, 404);
    const id = Number(new URL(req.url()).pathname.split('/').pop());
    const body = req.postDataJSON();
    captured.ledgerPatches.push({ id, body });
    const rtRow = store.rts.find(r => r.ledger_entry && r.ledger_entry.id === id);
    if (rtRow) rtRow.ledger_entry.expenses = body.expenses;
    return json(route, { record: rtRow ? rtRow.ledger_entry : { id, expenses: body.expenses } });
  });
  page.route('**/costs/lines**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'GET') {
      captured.lineGets.push(url.search);
      const rtId = url.searchParams.get('rt_id');
      const allocStatus = url.searchParams.get('alloc_status');
      let rows = store.lines;
      if (rtId) rows = rows.filter(l => String(l.rt_id) === rtId);
      else if (allocStatus === 'unallocated') rows = rows.filter(l => !l.rt_id);
      return json(route, { records: rows });
    }
    if (method === 'POST') {
      const body = req.postDataJSON();
      captured.posts.push(body);
      const rec = Object.assign({ id: store.nextId++, created_by: 'alexia', alloc_status: body.rt_id ? 'allocated' : 'unallocated', created_at: new Date().toISOString() }, body);
      store.lines.push(rec);
      return json(route, { record: rec }, 201);
    }
    if (method === 'PATCH') {
      const id = Number(url.pathname.split('/').pop());
      const body = req.postDataJSON();
      captured.patches.push({ id, body });
      const row = store.lines.find(l => l.id === id);
      if (row) { Object.assign(row, body); if ('rt_id' in body) row.alloc_status = body.rt_id ? 'allocated' : 'unallocated'; }
      return json(route, { record: row });
    }
    if (method === 'DELETE') {
      const id = Number(url.pathname.split('/').pop());
      captured.deletes.push({ id, body: req.postDataJSON() });
      store.lines = store.lines.filter(l => l.id !== id);
      return json(route, { deleted: true });
    }
    return json(route, {}, 404);
  });
  return captured;
}

function assert(cond, msg) {
  if (!cond) throw new Error('ΑΠΟΤΥΧΙΑ: ' + msg);
  console.log('  ✓ ' + msg);
}

async function newPage(browser, role, viewport) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: viewport || { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('dialog', async dialog => { if (dialog.type() === 'prompt') await dialog.accept('proof: test reason'); else await dialog.accept(); });
  await preparePage(page, role);
  return { context, page, consoleErrors };
}

async function openWeek(page, start) {
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('alloc_status=unallocated'), { timeout: 10000 }),
    page.evaluate(s => exGoWeek(s), start),
  ]);
  await page.waitForSelector('.ex-gr[data-rt="701"]', { timeout: 10000 });
}

const cell = (page, rtKey, group) => page.locator(`.ex-cell[data-rt="${rtKey}"][data-group="${group}"]`);
async function waitLines(page, method, action) {
  const p = page.waitForResponse(r => r.request().method() === method && r.url().includes('/costs/lines'), { timeout: 10000 });
  await action();
  await p;
  await page.waitForTimeout(150);
}
async function waitLedger(page, action) {
  const p = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/ledger/'), { timeout: 10000 });
  await action();
  await p;
  await page.waitForTimeout(150);
}

const EXPECTED_HEADER_RE = /Α\/Α[\s\S]*ΟΧΗΜΑ[\s\S]*ΟΔΗΓΟΣ[\s\S]*ΗΜΕΡΟΜΗΝΙΕΣ[\s\S]*ΚΑΥΣΙΜΑ\s*€[\s\S]*ΔΙΟΔΙΑ\s*€[\s\S]*ADBLUE\s*€[\s\S]*ΤΕΛΗ DKV\s*€[\s\S]*SPEDITION\s*€[\s\S]*ΕΞΟΔΑ Μ\s*€[\s\S]*ΠΡΟΣΤΙΜΑ\s*€[\s\S]*ΚΑΡΑΒΙΑ\/ΤΡΕΝΑ\s*€[\s\S]*ΛΟΙΠΑ\s*€[\s\S]*ΣΥΝΟΛΟ\s*€[\s\S]*ΚΑΤΑΣΤΑΣΗ/i;

async function runAccountantFlow(browser) {
  console.log('\n== accountant · εβδομαδιαίο φύλλο ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant');
  const captured = installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);

  // ── both tabs render, segmented control switches them ──
  assert(await page.locator('.ex-seg button.active').innerText() === 'Εβδομάδα', 'week tab active by default');
  assert(await page.locator('.ex-wkstrip').count() === 1 && await page.locator('.ex-vehctl').count() === 0, 'week tab shows the week strip, not the vehicle controls');

  // ── column headers exactly as spec §2 point 2 ──
  const headerText = (await page.locator('.ex-gh').innerText()).replace(/\s+/g, ' ');
  assert(EXPECTED_HEADER_RE.test(headerText), 'grid header = Α/Α·Όχημα·Οδηγός·Ημερομηνίες·Καύσιμα·Διόδια·AdBlue·Τέλη DKV·Spedition·Έξοδα Μ·Πρόστιμα·Καράβια/Τρένα·Λοιπά·Σύνολο·Κατάσταση: ' + headerText);

  // ── no ΦΠΑ anywhere on the week sheet ──
  const gridText = await page.locator('.ex-page').innerText();
  assert(!/Φ\.?Π\.?Α/i.test(gridText), 'no ΦΠΑ text anywhere on the week sheet: ' + (gridText.match(/.{0,20}Φ\.?Π\.?Α.{0,20}/i) || [''])[0]);

  // ── created_by resolves through the USERS roster (spec point 7) ──
  await cell(page, 701, 'tolls').click();
  await page.waitForSelector('.ex-gp[data-panel="701"] .ex-row[data-line="9102"]', { timeout: 5000 });
  assert(/Alexia/.test(await page.locator('.ex-row[data-line="9102"] .ex-user').innerText()), 'created_by «alexia» renders as «Alexia»');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── «σε παράθυρο» modal: same body builder, category scoped to the open
  // group (fuel ⇄ reefer_fuel only — spec §2 point 4), own Πηγή wrapper ──
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  await page.locator('.ex-link', { hasText: 'σε παράθυρο' }).click();
  await page.waitForSelector('.ex-modal-box', { timeout: 5000 });
  const modalCats = await page.locator('#exMdCategory option').evaluateAll(os => os.map(o => o.value));
  assert(modalCats.join(',') === 'fuel,reefer_fuel', 'modal opened from the Καύσιμα cell offers ONLY fuel/reefer_fuel — same scoping as the inline row');
  assert(await page.locator('#exMdFuelSourceWrap select').count() === 1, 'modal shows its own Πηγή select for the fuel group');
  await page.fill('#exMdAmt', '33');
  await waitLines(page, 'POST', () => page.locator('.ex-modal-box button', { hasText: 'Αποθήκευση' }).click());
  const pm = captured.posts[captured.posts.length - 1];
  assert(pm.category === 'fuel' && pm.fuel_source === 'DKV' && pm.net === 33 && pm.rt_id === 701, 'modal POST: category fuel (default option), fuel_source DKV (default), net 33 — same exBuildLineBody as the inline row');
  assert(await page.locator('.ex-modal-box').count() === 0, 'modal closes after save');

  // ── fuel entry: reefer_fuel, Πηγή DADI, chip default (NO trailer_id) ──
  await page.selectOption('#exQeCategory', 'reefer_fuel');
  assert(/ΤΡ-9001/.test(await page.locator('#exQeReeferWrap').innerText()) && /από το δρομολόγιο/.test(await page.locator('#exQeReeferWrap').innerText()), 'reefer_fuel on a trip WITH a trailer shows the read-only chip, not a select');
  await page.selectOption('#exQeFuelSource', 'DADI');
  await page.fill('#exQeAmt', '90');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const p1 = captured.posts[captured.posts.length - 1];
  assert(p1.category === 'reefer_fuel' && p1.fuel_source === 'DADI' && p1.rt_id === 701, 'POST 1 (default/chip case): category reefer_fuel, fuel_source DADI');
  assert(!('trailer_id' in p1), 'POST 1: NO trailer_id in the body — the Worker defaults it from the RT (chip never overridden)');
  assert(p1.net === 90, 'POST 1: net = the single «Ποσό €» field (90)');

  // ── same cell, override the trailer → trailer_id IS sent ──
  await page.selectOption('#exQeCategory', 'reefer_fuel');
  await page.locator('#exQeReeferWrap .ex-link', { hasText: 'αλλαγή' }).click();
  await page.selectOption('#exQeTrailerId', '22');
  await page.selectOption('#exQeFuelSource', 'DADI');
  await page.fill('#exQeAmt', '77');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const p2 = captured.posts[captured.posts.length - 1];
  assert(p2.category === 'reefer_fuel' && p2.fuel_source === 'DADI' && p2.trailer_id === 22, 'POST 2 (override case): category reefer_fuel, fuel_source DADI, trailer_id 22 (ΤΡ-9002)');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── reefer_fuel on a trip WITHOUT a trailer → select shown immediately, warned ──
  await cell(page, 702, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="702"]', { timeout: 5000 });
  await page.selectOption('#exQeCategory', 'reefer_fuel');
  assert(await page.locator('#exQeTrailerId.warn').count() === 1, 'RT 702 has no trailer_id — the select shows immediately with the warn border');
  assert(/δεν έχει ρυμούλκα/.test(await page.locator('#exQeReeferWrap').innerText()), 'helper text «Το δρομολόγιο δεν έχει ρυμούλκα — επίλεξε»');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── tolls entry: country combobox, type «αυ», Enter picks Αυστρία (AT) ──
  await cell(page, 701, 'tolls').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  await page.fill('#exQeCountryInput', 'αυ');
  await page.waitForSelector('#exQeCountryDrop .ex-cdrop-opt', { timeout: 5000 });
  await page.locator('#exQeCountryInput').press('Enter');
  assert(/Αυστρία \(AT\)/.test(await page.locator('#exQeCountryInput').inputValue()), 'combobox resolved «αυ» → Αυστρία (AT)');
  await page.fill('#exQeAmt', '25');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const p3 = captured.posts[captured.posts.length - 1];
  assert(p3.category === 'tolls' && p3.toll_country === 'AT' && p3.rt_id === 701, 'POST 3: category tolls, toll_country AT (never free text) — chosen via the combobox');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── «Έξοδα Μ»: fill an empty entry (no reason), then correct a written one (reason) ──
  await cell(page, 702, 'expm').click();
  await page.waitForSelector('.ex-gp[data-panel="702"]', { timeout: 5000 });
  await page.fill('#exExpMAmt', '18');
  await waitLedger(page, () => page.locator('#exExpMAmt').press('Enter'));
  const lp1 = captured.ledgerPatches[captured.ledgerPatches.length - 1];
  assert(lp1.id === 502 && lp1.body.expenses === 18 && !('reason' in lp1.body), 'PATCH /costs/ledger/502 {expenses:18} — no reason (entry was empty)');

  await cell(page, 701, 'expm').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  assert(await page.locator('#exExpMAmt').inputValue() === '40', 'Έξοδα Μ panel prefills the current ledger value (40)');
  await page.fill('#exExpMAmt', '55');
  await waitLedger(page, () => page.locator('#exExpMAmt').press('Enter'));
  const lp2 = captured.ledgerPatches[captured.ledgerPatches.length - 1];
  assert(lp2.id === 501 && lp2.body.expenses === 55 && lp2.body.reason === 'proof: test reason', 'PATCH /costs/ledger/501 {expenses:55, reason} — reason required (entry already had 40)');
  assert(/55,00/.test(await cell(page, 701, 'expm').innerText()), 'Έξοδα Μ cell reflects the new value after refetch');

  // ── 703 (in progress, no ledger entry) → Έξοδα Μ says so, no field ──
  await cell(page, 703, 'expm').click();
  await page.waitForSelector('.ex-gp[data-panel="703"]', { timeout: 5000 });
  assert(/δεν έχει εγγραφή Μισθοδοσίας/.test(await page.locator('.ex-gp[data-panel="703"]').innerText()), '703 has no ledger_entry → panel explains instead of offering a field');
  assert(await page.locator('#exExpMAmt').count() === 0, 'no amount field when there is no ledger entry to write');

  await assertGridFits(page, '1440 (week tab)');
  await page.screenshot({ path: SHOT_WEEK, fullPage: true });
  console.log('  screenshot: ' + SHOT_WEEK);
  await context.close();
  return { consoleErrors, captured };
}

async function runVehicleTab(browser) {
  console.log('\n== accountant · tab Όχημα ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant');
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);

  await page.locator('.ex-seg button', { hasText: 'Όχημα' }).click();
  await page.waitForSelector('.ex-vehctl', { timeout: 10000 });
  await page.waitForSelector('.ex-gr[data-rt]', { timeout: 10000 });
  assert(await page.locator('.ex-wkstrip').count() === 0, 'vehicle tab hides the week strip');
  assert(/Όχημα ΘΕ-2001/.test(await page.locator('.ex-title').innerText()), 'title names the selected truck (defaults to the first one)');
  assert(/Τελευταίες 8 εβδομάδες/.test(await page.locator('.ex-sub').innerText()), 'subtitle names the default 8-week range');
  const headerText = (await page.locator('.ex-gh').innerText()).replace(/\s+/g, ' ');
  assert(EXPECTED_HEADER_RE.test(headerText), 'vehicle tab has the SAME 15-column header as the week tab');
  assert(/Σύνολο ΘΕ-2001 \(1 δρομολόγια, 2 γραμμές\)/.test((await page.locator('.ex-gt').innerText()).replace(/\s+/g, ' ')), 'totals row names the vehicle, trip count and line count');
  const gridText = await page.locator('.ex-page').innerText();
  assert(!/Φ\.?Π\.?Α/i.test(gridText), 'no ΦΠΑ text anywhere on the vehicle sheet');
  await assertGridFits(page, '1440 (vehicle tab)');

  await page.screenshot({ path: SHOT_VEH, fullPage: true });
  console.log('  screenshot: ' + SHOT_VEH);
  await context.close();
  return { consoleErrors };
}

// Owner review 13/9 on commit 1693369: the ledger overflowed its card at
// 1440 (min-width:1280px on .ex-grid forced a scroll the ~1150px content
// column never needed) — Σύνολο/Κατάσταση were cut off. Two checks close
// that: the grid must never be wider than its scroll container, and the
// LAST header cell (Κατάσταση) must end inside the card, not past its edge
// — scrollWidth<=clientWidth alone would still pass if the card silently
// clipped the last column instead of wrapping it.
async function assertGridFits(page, label) {
  const fit = await page.evaluate(() => {
    const grid = document.querySelector('.ex-grid');
    const wrap = document.querySelector('.ex-gridwrap');
    const headCells = document.querySelectorAll('.ex-gh > div');
    const last = headCells[headCells.length - 1];
    return {
      scrollWidth: grid.scrollWidth, clientWidth: wrap.clientWidth,
      lastRight: last.getBoundingClientRect().right, cardRight: wrap.getBoundingClientRect().right
    };
  });
  assert(fit.scrollWidth <= fit.clientWidth, `[${label}] .ex-grid.scrollWidth (${fit.scrollWidth}) <= .ex-gridwrap.clientWidth (${fit.clientWidth}) — the card never scrolls`);
  assert(fit.lastRight <= fit.cardRight + 0.5, `[${label}] Κατάσταση header cell ends inside the card (${fit.lastRight.toFixed(1)} <= ${fit.cardRight.toFixed(1)})`);
}

async function runScreenshot1280(browser) {
  console.log('\n== no horizontal scroll at 1280/1440 ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width: 1280, height: 800 });
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  const scrollX1280 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(scrollX1280 <= 0, 'at 1280px the PAGE never scrolls sideways: ' + scrollX1280);
  await assertGridFits(page, '1280');
  await page.screenshot({ path: SHOT_1280, fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  const scrollX1440 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(scrollX1440 <= 0, 'at 1440px the PAGE never scrolls sideways either: ' + scrollX1440);
  await assertGridFits(page, '1440 (post-resize)');

  console.log('  screenshot: ' + SHOT_1280);
  await context.close();
  return { consoleErrors };
}

async function runManagementFlow(browser) {
  console.log('\n== management (read-only) ==');
  const { context, page, consoleErrors } = await newPage(browser, 'management');
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  assert(await page.locator('#nav_expenses').count() === 1, 'management: #nav_expenses present');
  assert(await page.locator('.ex-cell.can').count() === 0, 'management: no clickable cells (fuel/tolls/expm all read-only)');
  await cell(page, 701, 'expm').click({ force: true });
  await page.waitForTimeout(150);
  assert(await page.locator('.ex-gp').count() === 0, 'management: clicking the Έξοδα Μ cell opens nothing');
  assert(await page.locator('.ex-btn', { hasText: 'Εισαγωγή DKV' }).count() === 0, 'management: no «Εισαγωγή DKV» button');
  await context.close();
  return { consoleErrors };
}

async function runDispatcherFlow(browser) {
  console.log('\n== dispatcher (no access) ==');
  const { context, page, consoleErrors } = await newPage(browser, 'dispatcher');
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForTimeout(1500);
  assert(await page.locator('#nav_expenses').count() === 0, 'dispatcher: no #nav_expenses');
  assert(await page.locator('.ex-page').count() === 0, 'dispatcher: expenses page does not render');
  await context.close();
  return { consoleErrors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const acct = await runAccountantFlow(browser);
    const veh = await runVehicleTab(browser);
    const shot = await runScreenshot1280(browser);
    const mgmt = await runManagementFlow(browser);
    const disp = await runDispatcherFlow(browser);
    const all = [...acct.consoleErrors, ...veh.consoleErrors, ...shot.consoleErrors, ...mgmt.consoleErrors, ...disp.consoleErrors];
    console.log('\n== console errors ==');
    console.log('accountant:', acct.consoleErrors.length, 'vehicle:', veh.consoleErrors.length, '1280/1440:', shot.consoleErrors.length, 'management:', mgmt.consoleErrors.length, 'dispatcher:', disp.consoleErrors.length);
    if (all.length) all.forEach(e => console.log('  ! ' + e));
    console.log('\n== captured request bodies (accountant) ==');
    console.log(JSON.stringify({ posts: acct.captured.posts, patches: acct.captured.patches, ledgerPatches: acct.captured.ledgerPatches }, null, 2));
    if (all.length > 0) console.log('\nΠΡΟΣΟΧΗ: ' + all.length + ' console error(s) — δες πάνω πριν τα θεωρήσεις θόρυβο HAR replay.');
    console.log('\nΟΛΟΙ ΟΙ ΕΛΕΓΧΟΙ ΠΕΡΑΣΑΝ.');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n' + (e && e.stack || e));
  process.exit(1);
});
