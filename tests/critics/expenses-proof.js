// Proof script for the «Έξοδα Δρομολογίων» screen, v5 redesign
// (modules/expenses.js, owner 13/9/2026, after Figma KO7l2AfucR3HJEDIg1Yptr
// frames 547:1011/1297/1583), updated for the owner's six corrections of the
// SAME day: (1) partner trips excluded entirely, (2) trailer plate shown,
// (3) all nine amount columns always visible, (4) fuel liters visible,
// (5) pay_source select + Revolut logo everywhere, (6) country flags.
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
const line = (o) => Object.assign({ toll_country: null, plate_raw: null, truck_id: null, trailer_id: null, fuel_source: null, pay_source: null, km_reading: null, liters: null, station: null, doc_id: null, note: null, created_by: 'alexia', created_at: '2026-09-06T09:00:00Z' }, o);
const LINES_FIXTURE = [
  // liters:412 proves the owner correction 13/9 #4 («412 L» cell sub-line,
  // «Σ 412 L» totals-row line, «Λίτρα» summary figure — this is the ONLY fuel
  // line in the fixture so the totals equal this single value exactly).
  line({ id: 9101, rt_id: 701, category: 'fuel', net: 100, vat: 0, line_date: '2026-09-05', alloc_status: 'allocated', note: 'Α', fuel_source: 'DKV', liters: 412 }),
  line({ id: 9102, rt_id: 701, category: 'tolls', net: 30, vat: 0, toll_country: 'HU', line_date: '2026-09-06', alloc_status: 'allocated', doc_id: 5, note: 'DKV BOX' }),
  // Unallocated (owner correction #1 proof): proves the «Χωρίς δρομολόγιο»
  // assignment select only ever lists own-fleet trips, never the excluded
  // partner RT 703 below.
  line({ id: 9103, rt_id: null, category: 'other', net: 12, vat: 0, line_date: '2026-09-06', alloc_status: 'unallocated', note: 'χωρίς ανάθεση' }),
];

// Owner review 13/9 #2, point F, kept relevant after correction #3 (all nine
// amount columns are fixed now, never dynamic) as a general regression check
// at the OTHER end of the data range — several categories populated at once,
// not just the usual 2. Also still carries the specific name the review
// named: a driver long enough to test the 116px/100px Οδηγός track
// («Vlachopoulos Christos»). The partner RT this fixture used to carry (802,
// Trans-Balkan …) is gone — partner trips are excluded entirely now
// (correction #1), proven with RT_FIXTURE/RT 703 in the main flow above.
const LOOKUPS_FIXTURE_WIDE = {
  trucks: [{ id: 31, legacy_id: null, license_plate: 'ΘΕ-3001', active: true }],
  trailers: [{ id: 32, legacy_id: null, license_plate: 'ΤΡ-9003', active: true }],
  drivers: [{ id: 31, legacy_id: null, full_name: 'Vlachopoulos Christos', active: true }],
  partners: [],
};
const RT_FIXTURE_WIDE = [
  rt({ id: 801, truck_id: 31, driver_id: 31, trailer_id: 32, date_start: '2026-09-05', date_end: '2026-09-09', status: 'closed', route_text: 'Βέροια → Rotterdam', ledger_entry: { id: 601, expenses: 40 } }),
];
const LINES_FIXTURE_WIDE = [
  line({ id: 9201, rt_id: 801, category: 'fuel', net: 100, vat: 0, line_date: '2026-09-05' }),
  line({ id: 9202, rt_id: 801, category: 'tolls', net: 30, vat: 0, toll_country: 'HU', line_date: '2026-09-06' }),
  line({ id: 9203, rt_id: 801, category: 'adblue', net: 20, vat: 0, line_date: '2026-09-06' }),
  line({ id: 9204, rt_id: 801, category: 'spedition', net: 50, vat: 0, line_date: '2026-09-06' }),
  line({ id: 9205, rt_id: 801, category: 'fines', net: 15, vat: 0, line_date: '2026-09-06' }),
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

// waitRtId defaults to 701 (the everyday fixture's own first trip) — the
// wide-columns check (RT_FIXTURE_WIDE) passes 801 instead, its own first id.
async function openWeek(page, start, waitRtId) {
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('alloc_status=unallocated'), { timeout: 10000 }),
    page.evaluate(s => exGoWeek(s), start),
  ]);
  await page.waitForSelector(`.ex-gr[data-rt="${waitRtId || 701}"]`, { timeout: 10000 });
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

// Usability revision 13/9 (Figma 577:1011): Α/Α is gone, header text carries
// no «€». Owner correction 13/9 #3 removed the zero-line hiding this used to
// describe — ALL nine amount columns are always in the header now, no matter
// how few of them have data in the fixture below (only fuel/tolls/expm
// actually have lines — adblue/dkv/spedition/fines/ferry/other stay at zero
// and must still show). «Ρυμούλκα» is correction #2's second line on the
// Όχημα header cell.
const EXPECTED_HEADER_RE = /ΟΧΗΜΑ[\s\S]*ΡΥΜΟΥΛΚΑ[\s\S]*ΟΔΗΓΟΣ[\s\S]*ΗΜΕΡΟΜΗΝΙΕΣ[\s\S]*ΔΙΑΔΡΟΜΗ[\s\S]*ΚΑΥΣΙΜΑ[\s\S]*ΔΙΟΔΙΑ[\s\S]*ADBLUE[\s\S]*ΤΕΛΗ DKV[\s\S]*SPEDITION[\s\S]*ΕΞΟΔΑ Μ[\s\S]*ΠΡΟΣΤΙΜΑ[\s\S]*ΚΑΡΑΒΙΑ[\s\S]*ΤΡΕΝΑ[\s\S]*ΛΟΙΠΑ[\s\S]*ΣΥΝΟΛΟ[\s\S]*ΚΑΤΑΣΤΑΣΗ/i;

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

  // ── column headers, now with Ρυμούλκα + ALL nine amount groups (owner
  // correction 13/9 #2/#3) ──
  const headerText = (await page.locator('.ex-gh').innerText()).replace(/\s+/g, ' ');
  assert(EXPECTED_HEADER_RE.test(headerText), 'grid header (no Α/Α, Ρυμούλκα second line, all 9 amount columns) = Όχημα·Ρυμούλκα·Οδηγός·Ημερομηνίες·Διαδρομή·9 κατηγορίες·Σύνολο·Κατάσταση: ' + headerText);
  assert(!/Α\/Α/.test(headerText), 'the Α/Α header column is gone (point 10): ' + headerText);
  assert(!/€/.test(headerText), 'no header text contains «€» (point 4): ' + headerText);

  // ── no ΦΠΑ anywhere on the week sheet ──
  const gridText = await page.locator('.ex-page').innerText();
  assert(!/Φ\.?Π\.?Α/i.test(gridText), 'no ΦΠΑ text anywhere on the week sheet: ' + (gridText.match(/.{0,20}Φ\.?Π\.?Α.{0,20}/i) || [''])[0]);

  // ── usability revision 13/9 — sticky header (point 7) ──
  assert(await page.locator('.ex-gh').evaluate(el => getComputedStyle(el).position) === 'sticky', 'grid header has position:sticky (point 7)');

  // ── collapsed row height ≤46 (owner correction 13/9 #2: the two-line
  // vehicle cell must still fit the budget) ──
  const rowH = await page.locator('.ex-gr[data-rt="701"]').evaluate(el => el.getBoundingClientRect().height);
  assert(rowH <= 46, 'collapsed trip row height ≤46px: ' + rowH.toFixed(1));

  // ── chevron expands/collapses the full leg block (point 3) ──
  assert(await page.locator('.ex-trip[data-trip="701"] .ex-legs').count() === 0, 'legs block hidden while collapsed');
  await page.locator('.ex-trip[data-trip="701"] .ex-chevron').click();
  await page.waitForSelector('.ex-trip[data-trip="701"] .ex-legs', { timeout: 3000 });
  assert(/Βέροια/.test(await page.locator('.ex-trip[data-trip="701"] .ex-legs').innerText()), 'chevron click expands — leg/route block visible');
  await page.locator('.ex-trip[data-trip="701"] .ex-chevron').click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-trip[data-trip="701"] .ex-legs').count() === 0, 'chevron click again collapses it back');

  // ── owner correction 13/9 #3 «έχει αφαιρέσει κατηγορίες εξόδων»: all nine
  // amount columns stay in the header regardless of data — Spedition (zero
  // lines in this fixture) is the one the old hiding used to remove first ──
  assert(await page.locator('.ex-gh', { hasText: 'Spedition' }).count() === 1, 'Spedition column (zero lines) is still in the header — no more hiding');
  assert(await page.locator('.ex-emptycols').count() === 0, 'the «Κενές στήλες … εμφάνιση» control is gone entirely');
  assert(await page.locator('.ex-gh > div.r').count() === 10, 'exactly 10 right-aligned header cells (9 amount columns + Σύνολο)');

  // ── owner correction #2 «θα ήθελα να φαίνεται και το τρέιλερ»: truck plate
  // over trailer plate — RT 701 has trailer_id:21 (ΤΡ-9001), RT 702 has none
  // («—») ──
  const veh701 = (await page.locator('.ex-gr[data-rt="701"] .ex-vehcell').innerText()).replace(/\s+/g, ' ');
  assert(/ΘΕ-2001/.test(veh701) && /ΤΡ-9001/.test(veh701), 'RT 701 vehicle cell shows both truck (ΘΕ-2001) and trailer (ΤΡ-9001) plates: ' + veh701);
  const veh702 = (await page.locator('.ex-gr[data-rt="702"] .ex-vehcell').innerText()).replace(/\s+/g, ' ');
  assert(/ΘΕ-2002/.test(veh702) && /—/.test(veh702), 'RT 702 (no trailer_id) shows the truck plate and «—»: ' + veh702);

  // ── owner correction #4 «τα λίτρα … τα συνολικά λίτρα»: the fixture's one
  // fuel line (9101) carries liters:412 ──
  const fuelCell701 = cell(page, 701, 'fuel');
  assert(/\d+ L/.test(await fuelCell701.locator('.b').innerText()), 'Καύσιμα cell sub-line shows total liters («412 L»): ' + await fuelCell701.locator('.b').innerText());
  const gtText = (await page.locator('.ex-gt').innerText()).replace(/\s+/g, ' ');
  assert(/Σ\s*412\s*L/.test(gtText), 'totals row carries «Σ 412 L» under the Καύσιμα total: ' + gtText);
  const sumText = (await page.locator('.ex-sum').innerText()).replace(/\s+/g, ' ');
  assert(/Λίτρα/.test(sumText) && /412/.test(sumText), 'summary bar shows «Λίτρα 412» right after «Σύνολο εξόδων»: ' + sumText);

  // ── filter chip «Με ελλείψεις» narrows the rows (point 2) — RT 702 is
  // closed with no lines at all, so it is the one trip with gaps. Only 2
  // trips total now (owner correction #1 — partner RT 703 is excluded) ──
  assert(await page.locator('.ex-trip').count() === 2, 'only 2 trips visible (partner RT 703 excluded, correction #1)');
  assert(await page.locator('.ex-trip[data-trip="703"]').count() === 0, 'RT 703 (partner) never renders a row at all');
  assert(await page.locator('.ex-trip.missing').count() === 1 && await page.locator('.ex-trip[data-trip="702"]').evaluate(el => el.classList.contains('missing')), 'RT 702 (closed, no lines) carries the amber .missing class');
  assert(!/λείπει/.test(await page.locator('.ex-page').innerText()), 'no cell contains the text «λείπει» anywhere (point 6 — the placeholder is «—», not the word)');
  await page.locator('.ex-chip', { hasText: 'Με ελλείψεις' }).click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-trip').count() === 1 && await page.locator('.ex-trip[data-trip="702"]').count() === 1, '«Με ελλείψεις» chip leaves only RT 702 visible');
  assert(await page.locator('.ex-chip', { hasText: 'Με ελλείψεις' }).evaluate(el => el.classList.contains('active')), 'the active chip carries the .active (navy outline) class');
  await page.locator('.ex-chip', { hasText: 'Με ελλείψεις' }).click(); // clear it — click-again clears, per exSetFilterChip
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-trip').count() === 2, 'clicking the active chip again clears the filter');

  // ── week-strip count also excludes the partner trip (correction #1) — the
  // selected week (37) chip must read «· 2», never «· 3» ──
  const selChipTxt = (await page.locator('.ex-wk.sel .a').innerText()).replace(/\s+/g, ' ');
  assert(/·\s*2\s*$/.test(selChipTxt), 'selected week chip counts 2 trips, not 3 (partner excluded): ' + selChipTxt);

  // ── pay-source tag on the amount cell (owner correction #5) — line 9102
  // (tolls, doc_id:5, no pay_source) falls back to DKV (spec: «treat doc_id
  // lines as DKV, fallback so the sheet never looks broken») ──
  const tollsCell701 = cell(page, 701, 'tolls');
  assert(await tollsCell701.locator('img.ex-src[alt="DKV"]').count() === 1, 'the 701/tolls amount cell shows the DKV pay-source logo (img.ex-src[alt="DKV"])');
  assert(!/DKV/.test(await tollsCell701.locator('.b').innerText()), 'the cell sub-label carries no literal «DKV» text, only the logo');
  const logoResp = await page.request.get(BASE_URL + 'assets/logos/dkv.png');
  assert(logoResp.status() === 200, 'assets/logos/dkv.png is served (HTTP ' + logoResp.status() + ')');
  const revolutLogoResp = await page.request.get(BASE_URL + 'assets/logos/revolut.png');
  assert(revolutLogoResp.status() === 200, 'assets/logos/revolut.png is served (HTTP ' + revolutLogoResp.status() + ')');

  // ── owner correction #1 «δεν υπάρχει χώρος για συνεργάτες»: the «Χωρίς
  // δρομολόγιο» assignment select (line 9103, category other) never lists
  // the excluded partner RT — only the placeholder + the 2 own-fleet trips ──
  await cell(page, 'none', 'other').click();
  await page.waitForSelector('.ex-gp[data-panel="none"]', { timeout: 5000 });
  const assignSelect = page.locator('.ex-gp[data-panel="none"] .ex-assign');
  assert(await assignSelect.locator('option').count() === 3, '«Χωρίς δρομολόγιο» assign select has exactly 3 options (placeholder + 701 + 702)');
  assert(!/Meta-Cargo/.test(await assignSelect.innerText()), 'the assign select never lists the partner (Meta-Cargo ΕΠΕ)');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── «Επόμενο δρομολόγιο ↓» moves the open panel to the next trip (point 9)
  // — only 2 trips now, so 701→702 is the whole walk (703 excluded) ──
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  await page.locator('.ex-gp[data-panel="701"] .ex-gp-actions button', { hasText: 'Επόμενο δρομολόγιο' }).click();
  await page.waitForSelector('.ex-gp[data-panel="702"]', { timeout: 5000 });
  assert(await page.locator('.ex-cell[data-rt="702"][data-group="fuel"].open').count() === 1, '«Επόμενο δρομολόγιο» moved the open cell from RT 701 to RT 702, same group (fuel)');
  assert(await page.locator('.ex-gp[data-panel="702"] .ex-gp-actions .ex-link.dim', { hasText: 'Επόμενο δρομολόγιο' }).count() === 1, 'on the LAST trip (702 — 703 is excluded) the link reads dimmed');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── owner correction #5 «σε όλα πρόσθεσε το πηγή»: a fuel entry paid via
  // Revolut, a tolls entry paid in cash — both new POSTs must carry
  // pay_source, and the created lines must show the matching tag/flag ──
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  await page.selectOption('#exQeCategory', 'fuel');
  await page.selectOption('#exQePaySource', 'REVOLUT');
  await page.fill('#exQeAmt', '44');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const revolutPost = captured.posts[captured.posts.length - 1];
  assert(revolutPost.category === 'fuel' && revolutPost.pay_source === 'REVOLUT' && revolutPost.net === 44, 'POST fuel line carries pay_source REVOLUT: ' + JSON.stringify(revolutPost));
  assert(await page.locator('.ex-gp[data-panel="701"] .ex-row img.ex-src[alt="Revolut"]').count() >= 1, 'the new REVOLUT line shows the Revolut logo in the lines list');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

  await cell(page, 701, 'tolls').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  await page.selectOption('#exQePaySource', 'CASH');
  await page.fill('#exQeCountryInput', 'γερμ');
  await page.waitForSelector('#exQeCountryDrop .ex-cdrop-opt', { timeout: 5000 });
  assert(await page.locator('#exQeCountryDrop img.ex-flag').count() >= 1, 'the country combobox option list shows flags (owner correction #6)');
  await page.locator('#exQeCountryInput').press('Enter');
  await page.fill('#exQeAmt', '12');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const cashPost = captured.posts[captured.posts.length - 1];
  assert(cashPost.category === 'tolls' && cashPost.pay_source === 'CASH' && cashPost.toll_country === 'DE', 'POST tolls line carries pay_source CASH: ' + JSON.stringify(cashPost));
  assert(/Μετρητά/.test(await page.locator('.ex-gp[data-panel="701"] .ex-row').last().innerText()), 'the new CASH line shows the grey «Μετρητά» text in the lines list');
  await page.locator('.ex-link', { hasText: 'Κλείσιμο' }).click();

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
  // Session default (spec: «the last value used in this session») — the
  // earlier CASH tolls entry in this same flow already moved the fuel/tolls
  // bucket's remembered value to CASH, so THAT is what a fresh tolls entry
  // defaults to now, not the bucket's initial DKV seed.
  assert(p3.pay_source === 'CASH', 'POST 3 carries the session-remembered pay_source (CASH, from the earlier tolls entry in this flow) — never left out: ' + p3.pay_source);
  // ── owner correction #6 «σε κάθε χώρα θέλω να προσθέσεις τη σημαία της»:
  // the new AT line now shows a flag in the Χώρα column of the tolls lines
  // list, and the selected value's own flag icon updated too ──
  assert(await page.locator('.ex-gp[data-panel="701"] .ex-line-grid img.ex-flag[alt="AT"]').count() >= 1, 'the tolls lines list shows img.ex-flag[alt="AT"] for the new AT line');
  assert(await page.locator('#exQeCountryFlagIcon img.ex-flag[alt="AT"]').count() === 1, 'the selected-value flag icon next to the combobox input also shows AT');
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

  // RT 703 (partner, in progress) used to be tested here for its «no ledger
  // entry» Έξοδα Μ panel — it no longer renders at all (correction #1), so
  // there is no cell left to click; its exclusion is already proven above
  // (trip count, .ex-trip[data-trip="703"] absent, week-strip count, assign
  // select, «Επόμενο δρομολόγιο» walk).

  await assertGridFits(page, '1440 (week tab)');
  await assertHeaderCellsFit(page, '1440 (week tab, 9 amount cols)');
  await assertWeekChipsFit(page, '1440 (week tab)');
  await assertTitleRowFits(page, '1440 (week tab)');
  await assertNoneRowSingleLine(page, '1440 (week tab)');
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
  assert(EXPECTED_HEADER_RE.test(headerText), 'vehicle tab has the SAME dynamic header as the week tab (no Α/Α, zero-line columns hidden)');
  assert(/Σύνολο ΘΕ-2001 \(1 δρομολόγια, 2 γραμμές\)/.test((await page.locator('.ex-gt').innerText()).replace(/\s+/g, ' ')), 'totals row names the vehicle, trip count and line count');
  const gridText = await page.locator('.ex-page').innerText();
  assert(!/Φ\.?Π\.?Α/i.test(gridText), 'no ΦΠΑ text anywhere on the vehicle sheet');
  await assertGridFits(page, '1440 (vehicle tab)');
  await assertHeaderCellsFit(page, '1440 (vehicle tab)');
  await assertTitleRowFits(page, '1440 (vehicle tab)');

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

// ── Owner review 13/9 #2, point F: layout-defect proof helpers ────────────
// «ΗΜΕΡΟΜΗΝΙΕΣ» wrapping to two lines and week chips ellipsizing were both
// real regressions the FIRST commit's own screenshot showed — these assert
// against the actual failure mode (an inner element's scrollWidth exceeding
// its clientWidth, i.e. CSS text-overflow actually firing), not just the
// outer container's own size, which stays constant regardless of internal
// truncation and would never have caught either bug.
async function assertHeaderCellsFit(page, label) {
  const cells = await page.evaluate(() => Array.from(document.querySelectorAll('.ex-gh > div, .ex-gh > span')).map(el => ({
    h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth, txt: el.textContent.trim()
  })));
  for (const c of cells) {
    assert(c.h <= 32.5, `[${label}] header cell height ≤32px («${c.txt}»): ${c.h.toFixed(1)}`);
    assert(c.sw <= c.cw + 0.5, `[${label}] header cell «${c.txt}» not wrapped/overflowing: scrollWidth ${c.sw} ≤ clientWidth ${c.cw}`);
  }
}
async function assertWeekChipsFit(page, label) {
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.ex-wk')).map(el => {
    const a = el.querySelector('.a'), c = el.querySelector('.c');
    return { txt: el.innerText.replace(/\s+/g, ' '), aSW: a ? a.scrollWidth : 0, aCW: a ? a.clientWidth : 0, cSW: c ? c.scrollWidth : 0, cCW: c ? c.clientWidth : 0 };
  }));
  assert(chips.length > 0, `[${label}] week strip has chips to check`);
  for (const ch of chips) {
    assert(ch.aSW <= ch.aCW + 0.5, `[${label}] week chip «${ch.txt}» main label not ellipsized: ${ch.aSW} ≤ ${ch.aCW}`);
    assert(ch.cSW <= ch.cCW + 0.5, `[${label}] week chip «${ch.txt}» gaps label not ellipsized: ${ch.cSW} ≤ ${ch.cCW}`);
  }
}
async function assertTitleRowFits(page, label) {
  const items = await page.evaluate(() => ['.ex-title', '.ex-sub', '.ex-emptycols-txt'].map(sel => {
    const el = document.querySelector(sel);
    if (!el || !el.textContent.trim()) return null;
    return { sel, sw: el.scrollWidth, cw: el.clientWidth };
  }).filter(Boolean));
  for (const it of items) assert(it.sw <= it.cw + 0.5, `[${label}] title row «${it.sel}» not ellipsized: ${it.sw} ≤ ${it.cw}`);
}
async function assertNoneRowSingleLine(page, label) {
  const h = await page.evaluate(() => { const el = document.querySelector('.ex-gr.none-row .ex-st'); return el ? el.offsetHeight : null; });
  assert(h !== null, `[${label}] none-row label element exists`);
  assert(h <= 20.5, `[${label}] none-row label is single-line (offsetHeight ≤20): ${h}`);
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
  await assertHeaderCellsFit(page, '1280 (9 amount cols)');
  await assertWeekChipsFit(page, '1280');
  await assertTitleRowFits(page, '1280');
  await assertNoneRowSingleLine(page, '1280');
  await page.screenshot({ path: SHOT_1280, fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  const scrollX1440 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(scrollX1440 <= 0, 'at 1440px the PAGE never scrolls sideways either: ' + scrollX1440);
  await assertGridFits(page, '1440 (post-resize)');
  await assertHeaderCellsFit(page, '1440 (post-resize, 9 amount cols)');
  await assertWeekChipsFit(page, '1440 (post-resize)');

  console.log('  screenshot: ' + SHOT_1280);
  await context.close();
  return { consoleErrors };
}

// Owner review 13/9 #2, point F: the layout must hold with several
// categories populated at once (LINES_FIXTURE_WIDE), not just the usual 2.
// Same viewports as runScreenshot1280, one context per width (simpler than
// resizing mid-flight here, since nothing needs to survive the resize). Also
// proves the driver-name fix named in the review with the exact name it
// gave, and (correction #2) the trailer plate on a second, separately
// scoped fixture/truck.
async function runWideColumnsCheck(browser) {
  console.log('\n== all 9 amount columns (populated fixture) — 1280 & 1440 ==');
  const errors = [];
  for (const width of [1280, 1440]) {
    const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width, height: 900 });
    installCostsMocks(page, { rt: RT_FIXTURE_WIDE, lookups: LOOKUPS_FIXTURE_WIDE, lines: LINES_FIXTURE_WIDE });
    await gotoPage(page, 'expenses', BASE_URL);
    await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
    await openWeek(page, WEEK_START, 801);
    const visCols = await page.locator('.ex-gh > div.r').count(); // amount cols + Σύνολο, both class="r"
    assert(visCols === 10, `[${width}] exactly 9 amount columns + Σύνολο always visible (got ${visCols}): ${await page.locator('.ex-gh').innerText()}`);
    await assertGridFits(page, width + ' (9 amount cols)');
    await assertHeaderCellsFit(page, width + ' (9 amount cols)');
    await assertWeekChipsFit(page, width);
    await assertTitleRowFits(page, width);
    // Direct-child order: vehicleCell(0), Οδηγός(1). Owner correction 13/9
    // #3 fixed the Οδηγός track at 116px (≥1320) / 100px (<1320) — narrower
    // than the 136px the PREVIOUS review widened it to specifically so
    // «Vlachopoulos Christos» would not ellipsize. The new fixed widths are
    // the owner's own exact numbers for this correction, so a long name
    // ellipsizing here now is the accepted tradeoff, not a regression — the
    // full text still lives in the DOM (and the title attribute would carry
    // it for hover, same as every other .ex-clip cell), just visually
    // truncated. This only checks the text itself is present, not its fit.
    const driverEl = page.locator('.ex-gr[data-rt="801"] > div').nth(1);
    const driverFit = await driverEl.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, txt: el.textContent, title: el.title }));
    assert(/Vlachopoulos Christos/.test(driverFit.txt) || /Vlachopoulos Christos/.test(driverFit.title), `[${width}] driver cell carries the full name (visibly or via title): ${driverFit.txt} / ${driverFit.title}`);
    // Trailer plate (correction #2) on this second truck/trailer pair too —
    // not only the main fixture's RT 701.
    const vehTxt = (await page.locator('.ex-gr[data-rt="801"] .ex-vehcell').innerText()).replace(/\s+/g, ' ');
    assert(/ΘΕ-3001/.test(vehTxt) && /ΤΡ-9003/.test(vehTxt), `[${width}] vehicle cell shows both plates: ${vehTxt}`);
    errors.push(...consoleErrors);
    await context.close();
  }
  return { consoleErrors: errors };
}

// «Αν σπάσει στις 06:00 Δευτέρα, ποιος το μαθαίνει;» — the whole point of the
// compressed header (note 1) is a measured budget, not a vibe: at 1440×778
// (a real laptop viewport, not the padded 1440×900 the other checks use) the
// FIRST trip row must land within 220px of the top of the viewport.
async function runFoldCheck(browser) {
  console.log('\n== compressed header — first row ≤220px at 1440×778 ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width: 1440, height: 778 });
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  const top = await page.locator('.ex-gr[data-rt="701"]').evaluate(el => el.getBoundingClientRect().top);
  assert(top <= 220, 'first trip row top ≤220px at 1440×778: ' + top.toFixed(1));
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
    const wide = await runWideColumnsCheck(browser);
    const fold = await runFoldCheck(browser);
    const mgmt = await runManagementFlow(browser);
    const disp = await runDispatcherFlow(browser);
    const all = [...acct.consoleErrors, ...veh.consoleErrors, ...shot.consoleErrors, ...wide.consoleErrors, ...fold.consoleErrors, ...mgmt.consoleErrors, ...disp.consoleErrors];
    console.log('\n== console errors ==');
    console.log('accountant:', acct.consoleErrors.length, 'vehicle:', veh.consoleErrors.length, '1280/1440:', shot.consoleErrors.length, 'wide-cols:', wide.consoleErrors.length, 'fold:', fold.consoleErrors.length, 'management:', mgmt.consoleErrors.length, 'dispatcher:', disp.consoleErrors.length);
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
