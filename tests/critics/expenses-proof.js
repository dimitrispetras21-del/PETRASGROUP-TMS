// Proof script for the «Έξοδα Δρομολογίων» screen, v5 redesign
// (modules/expenses.js, owner 13/9/2026, after Figma KO7l2AfucR3HJEDIg1Yptr
// frames 547:1011/1297/1583), updated for the owner's six corrections of the
// SAME day: (1) partner trips excluded entirely, (2) trailer plate shown,
// (3) all nine amount columns always visible, (4) fuel liters visible,
// (5) pay_source select + Revolut logo everywhere, (6) country flags —
// and for the w8 review of 16/9 (Figma 659:1013): the trip FRAME (E11)
// replacing the 14/9 overview + per-cell panel, sticky column headers inside
// it (E7), labels on the correction row (E5), «Άκυρο» (E6), «+ Ίδια
// κατηγορία» (E9), «Μετρητά Μ» (E1), fines in the total (E4), «ΠΙΣΤΩΣΗ»
// gated by GET /costs/lookups pay_sources (E8).
// Spec: docs/superpowers/specs/2026-09-13-fuel-collection-program.md §0/§2.
//
// Run from the MAIN repo (it holds node_modules/playwright and the HAR):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8795/ node <worktree>/tests/critics/expenses-proof.js
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
//   POST /costs/lines            → category/fuel_source/trailer_id/toll_country/
//                                    pay_source exactly as the entry row requires
//   PATCH /costs/lines/:id       → reason mandatory
//   PATCH /costs/ledger/:id      → {expenses[, reason]} — reason only when
//                                    an already-written value changes
//   roles                        → accountant writes, management reads,
//                                    dispatcher has no nav item and no page

const path = require('path');
const fs = require('fs');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8795/';
// w8 (16/9): screenshots land in the repo's audit folder (the delivery rule
// «πάντα επαλήθευση» wants every state on file), overridable for scratch runs.
const SHOT_DIR = process.env.PW_SHOT_DIR || path.join(__dirname, '..', '..', 'docs', 'data-audit', '2026-09', 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = name => path.join(SHOT_DIR, 'w8-expenses-' + name + '.png');

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
  // No pay_sources here on purpose: this is the pre-035 Worker — the screen
  // must fall back to DKV/CASH/REVOLUT and never offer ΠΙΣΤΩΣΗ (E8 gate).
};
// The post-035 Worker: GET /costs/lookups declares the 4-value vocabulary.
const LOOKUPS_FIXTURE_CREDIT = Object.assign({}, LOOKUPS_FIXTURE, { pay_sources: ['DKV', 'CASH', 'REVOLUT', 'CREDIT'] });
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
// A correction needs a line the rig's own accountant login (username
// demo_accountant, see auth.js) created — «Διόρθωση» is offered only to the
// author (or the owner). Lives on RT 702 so the everyday 701 totals above
// stay exactly as documented.
const LINES_FIXTURE_EDIT = LINES_FIXTURE.concat([
  line({ id: 9104, rt_id: 702, category: 'fuel', net: 80, vat: 0, line_date: '2026-09-06', alloc_status: 'allocated', note: 'Β', fuel_source: 'DADI', liters: 200, km_reading: 123456, station: 'DADI Skopje', pay_source: 'CASH', created_by: 'demo_accountant' }),
]);

// Owner review 13/9 #2, point F, kept relevant after correction #3 (all nine
// amount columns are fixed now, never dynamic) as a general regression check
// at the OTHER end of the data range — several categories populated at once,
// not just the usual 2. Also still carries the specific name the review
// named: a driver long enough to test the 116px/100px Οδηγός track
// («Vlachopoulos Christos»). w8: this is also the «≥3 categories» frame and
// the E4 fines-in-total proof (fines:15 on RT 801).
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
  line({ id: 9201, rt_id: 801, category: 'fuel', net: 100, vat: 0, line_date: '2026-09-05', pay_source: 'DKV', liters: 300 }),
  line({ id: 9202, rt_id: 801, category: 'tolls', net: 30, vat: 0, toll_country: 'HU', line_date: '2026-09-06', pay_source: 'DKV' }),
  line({ id: 9203, rt_id: 801, category: 'adblue', net: 20, vat: 0, line_date: '2026-09-06', pay_source: 'CASH' }),
  line({ id: 9204, rt_id: 801, category: 'spedition', net: 50, vat: 0, line_date: '2026-09-06', pay_source: 'REVOLUT', note: 'INV-1' }),
  line({ id: 9205, rt_id: 801, category: 'fines', net: 15, vat: 0, line_date: '2026-09-06', pay_source: 'CASH' }),
];
// Sticky proof (E7): enough fuel lines on one trip that the Καύσιμα section
// is taller than a short viewport, so scrolling #content must pin the
// section's column header under the grid header.
const LINES_FIXTURE_STICKY = Array.from({ length: 12 }, (_, i) =>
  line({ id: 9300 + i, rt_id: 701, category: 'fuel', net: 10 + i, vat: 0, line_date: '2026-09-0' + (5 + (i % 5)), pay_source: 'DKV', liters: 100 + i })
).concat([line({ id: 9350, rt_id: 701, category: 'tolls', net: 5, vat: 0, toll_country: 'AT', line_date: '2026-09-06', pay_source: 'DKV' })]);

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
      // Worker order (E10 «νεότερο πάνω»): line_date.desc,id.desc — mirrored
      // here so the frame's section order is what production shows.
      rows = rows.slice().sort((a, b) => String(b.line_date).localeCompare(String(a.line_date)) || b.id - a.id);
      return json(route, { records: rows });
    }
    if (method === 'POST') {
      const body = req.postDataJSON();
      captured.posts.push(body);
      // E8, αρχή 1: a pre-035 Worker rejects CREDIT out loud — the rig's
      // «Worker» does the same when the fixture did not declare it.
      const allowed = (fx.lookups.pay_sources) || ['DKV', 'CASH', 'REVOLUT'];
      if (body.pay_source && !allowed.includes(body.pay_source)) return json(route, { error: 'pay_source must be one of ' + allowed.join('|') }, 400);
      const rec = Object.assign({ id: store.nextId++, created_by: 'demo_accountant', alloc_status: body.rt_id ? 'allocated' : 'unallocated', created_at: new Date().toISOString() }, body);
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
const frame = (page, rtId) => page.locator(`.ex-frame[data-frame="${rtId}"]`);
const vehicleCell = (page, rtId) => page.locator(`.ex-gr[data-rt="${rtId}"] > div`).nth(0);
const driverCell = (page, rtId) => page.locator(`.ex-gr[data-rt="${rtId}"] > div`).nth(1);
async function openFrame(page, rtId) {
  await vehicleCell(page, rtId).click();
  await page.waitForSelector(`.ex-frame[data-frame="${rtId}"]`, { timeout: 5000 });
}
async function closeFrame(page) {
  await page.locator('.ex-frame .ex-link', { hasText: 'Κλείσιμο' }).click();
  await page.waitForTimeout(100);
}
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
async function flabels(page, scope) {
  return page.locator(scope + ' .ex-flabel').evaluateAll(els => els.map(e => e.textContent.trim()));
}

// Usability revision 13/9 (Figma 577:1011): Α/Α is gone, header text carries
// no «€». Owner correction 13/9 #3 removed the zero-line hiding this used to
// describe — ALL nine amount columns are always in the header now, no matter
// how few of them have data in the fixture below. «Ρυμούλκα» is correction
// #2's second line on the Όχημα header cell. «ΜΕΤΡΗΤΑ Μ» is E1 (16/9).
const EXPECTED_HEADER_RE = /ΟΧΗΜΑ[\s\S]*ΡΥΜΟΥΛΚΑ[\s\S]*ΟΔΗΓΟΣ[\s\S]*ΗΜΕΡΟΜΗΝΙΕΣ[\s\S]*ΔΙΑΔΡΟΜΗ[\s\S]*ΚΑΥΣΙΜΑ[\s\S]*ΔΙΟΔΙΑ[\s\S]*ADBLUE[\s\S]*ΤΕΛΗ DKV[\s\S]*SPEDITION[\s\S]*ΜΕΤΡΗΤΑ Μ[\s\S]*ΠΡΟΣΤΙΜΑ[\s\S]*ΚΑΡΑΒΙΑ[\s\S]*ΤΡΕΝΑ[\s\S]*ΛΟΙΠΑ[\s\S]*ΣΥΝΟΛΟ[\s\S]*ΚΑΤΑΣΤΑΣΗ/i;

async function runAccountantFlow(browser) {
  console.log('\n== accountant · εβδομαδιαίο φύλλο ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant');
  const captured = installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE_EDIT });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);

  // ── both tabs render, segmented control switches them ──
  assert(await page.locator('.ex-seg button.active').innerText() === 'Εβδομάδα', 'week tab active by default');
  assert(await page.locator('.ex-wkstrip').count() === 1 && await page.locator('.ex-vehctl').count() === 0, 'week tab shows the week strip, not the vehicle controls');

  // ── column headers, now with Ρυμούλκα + ALL nine amount groups (owner
  // correction 13/9 #2/#3) + «Μετρητά Μ» (E1) ──
  const headerText = (await page.locator('.ex-gh').innerText()).replace(/\s+/g, ' ');
  assert(EXPECTED_HEADER_RE.test(headerText), 'grid header (no Α/Α, Ρυμούλκα second line, all 9 amount columns, «Μετρητά Μ») = Όχημα·Ρυμούλκα·Οδηγός·Ημερομηνίες·Διαδρομή·9 κατηγορίες·Σύνολο·Κατάσταση: ' + headerText);
  assert(!/ΕΞΟΔΑ Μ/i.test(headerText), 'E1: the old «Έξοδα Μ» label is gone from the header');
  assert(!/Α\/Α/.test(headerText), 'the Α/Α header column is gone (point 10): ' + headerText);
  assert(!/€/.test(headerText), 'no header text contains «€» (point 4): ' + headerText);

  // ── no ΦΠΑ anywhere on the week sheet ──
  const gridText = await page.locator('.ex-page').innerText();
  assert(!/Φ\.?Π\.?Α/i.test(gridText), 'no ΦΠΑ text anywhere on the week sheet: ' + (gridText.match(/.{0,20}Φ\.?Π\.?Α.{0,20}/i) || [''])[0]);
  assert(!/Έξοδα Μ/.test(gridText), 'E1: «Έξοδα Μ» appears nowhere on the page (label only — same ledger data)');

  // ── usability revision 13/9 — sticky header (point 7) ──
  assert(await page.locator('.ex-gh').evaluate(el => getComputedStyle(el).position) === 'sticky', 'grid header has position:sticky (point 7)');
  assert(await page.locator('.ex-gridwrap').evaluate(el => getComputedStyle(el).overflowX) === 'visible', 'E7: .ex-gridwrap is NOT a scroll container any more (overflow-x visible) — sticky can pin against #content');

  // ── collapsed row height ≤46 (owner correction 13/9 #2) ──
  const rowH = await page.locator('.ex-gr[data-rt="701"]').evaluate(el => el.getBoundingClientRect().height);
  assert(rowH <= 46, 'collapsed trip row height ≤46px: ' + rowH.toFixed(1));

  // ── grid closed: no frame, nothing faded ──
  assert(await page.locator('.ex-frame').count() === 0 && await page.locator('.ex-grid.has-frame').count() === 0, 'E11: no frame and no fading while nothing is open');
  await page.screenshot({ path: shot('01-grid-closed-1440'), fullPage: true });

  // ── chevron expands the leg block (point 3) AND opens the frame (owner 14/9) ──
  assert(await page.locator('.ex-trip[data-trip="701"] .ex-legs').count() === 0, 'legs block hidden while collapsed');
  await page.locator('.ex-trip[data-trip="701"] .ex-chevron').click();
  await page.waitForSelector('.ex-trip[data-trip="701"] .ex-legs', { timeout: 3000 });
  assert(/Βέροια/.test(await page.locator('.ex-trip[data-trip="701"] .ex-legs').innerText()), 'chevron click expands — leg/route block visible');
  assert(await frame(page, 701).count() === 1, 'chevron click also opens the trip frame (owner 14/9, now the frame)');
  await page.locator('.ex-trip[data-trip="701"] .ex-chevron').click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-trip[data-trip="701"] .ex-legs').count() === 0 && await frame(page, 701).count() === 0, 'chevron click again collapses legs AND closes the frame');

  // ── owner correction 13/9 #3: all nine amount columns stay in the header ──
  assert(await page.locator('.ex-gh', { hasText: 'Spedition' }).count() === 1, 'Spedition column (zero lines) is still in the header — no more hiding');
  assert(await page.locator('.ex-emptycols').count() === 0, 'the «Κενές στήλες … εμφάνιση» control is gone entirely');
  assert(await page.locator('.ex-gh > div.r').count() === 10, 'exactly 10 right-aligned header cells (9 amount columns + Σύνολο)');

  // ── owner correction #2: truck plate over trailer plate ──
  const veh701 = (await page.locator('.ex-gr[data-rt="701"] .ex-vehcell').innerText()).replace(/\s+/g, ' ');
  assert(/ΘΕ-2001/.test(veh701) && /ΤΡ-9001/.test(veh701), 'RT 701 vehicle cell shows both truck (ΘΕ-2001) and trailer (ΤΡ-9001) plates: ' + veh701);
  const veh702 = (await page.locator('.ex-gr[data-rt="702"] .ex-vehcell').innerText()).replace(/\s+/g, ' ');
  assert(/ΘΕ-2002/.test(veh702) && /—/.test(veh702), 'RT 702 (no trailer_id) shows the truck plate and «—»: ' + veh702);

  // ── owner correction #4: liters visible (fixture fuel on 701 = 412 L) ──
  const fuelCell701 = cell(page, 701, 'fuel');
  assert(/\d+ L/.test(await fuelCell701.locator('.b').innerText()), 'Καύσιμα cell sub-line shows total liters («412 L»): ' + await fuelCell701.locator('.b').innerText());
  const gtText = (await page.locator('.ex-gt').innerText()).replace(/\s+/g, ' ');
  assert(/Σ\s*612\s*L/.test(gtText), 'totals row carries «Σ 612 L» (412 on 701 + 200 on 702) under the Καύσιμα total: ' + gtText);
  const sumText = (await page.locator('.ex-sum').innerText()).replace(/\s+/g, ' ');
  assert(/Λίτρα/.test(sumText) && /612/.test(sumText), 'summary bar shows «Λίτρα 612» right after «Σύνολο εξόδων»: ' + sumText);

  // ── filter chip «Με ελλείψεις» (point 2) — RT 702 is closed with fuel but
  // no tolls, so it is the one trip with gaps. Only 2 trips total (partner
  // RT 703 excluded, correction #1) ──
  assert(await page.locator('.ex-trip').count() === 2, 'only 2 trips visible (partner RT 703 excluded, correction #1)');
  assert(await page.locator('.ex-trip[data-trip="703"]').count() === 0, 'RT 703 (partner) never renders a row at all');
  assert(await page.locator('.ex-trip.missing').count() === 1 && await page.locator('.ex-trip[data-trip="702"]').evaluate(el => el.classList.contains('missing')), 'RT 702 (closed, no tolls) carries the amber .missing class');
  assert(!/λείπει/.test(await page.locator('.ex-page').innerText()), 'no cell contains the text «λείπει» anywhere (point 6 — the placeholder is «—», not the word)');
  await page.locator('.ex-chip', { hasText: 'Με ελλείψεις' }).click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-trip').count() === 1 && await page.locator('.ex-trip[data-trip="702"]').count() === 1, '«Με ελλείψεις» chip leaves only RT 702 visible');
  assert(await page.locator('.ex-chip', { hasText: 'Με ελλείψεις' }).evaluate(el => el.classList.contains('active')), 'the active chip carries the .active (navy outline) class');
  await page.locator('.ex-chip', { hasText: 'Με ελλείψεις' }).click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-trip').count() === 2, 'clicking the active chip again clears the filter');

  // ── week-strip count also excludes the partner trip (correction #1) ──
  const selChipTxt = (await page.locator('.ex-wk.sel .a').innerText()).replace(/\s+/g, ' ');
  assert(/·\s*2\s*$/.test(selChipTxt), 'selected week chip counts 2 trips, not 3 (partner excluded): ' + selChipTxt);

  // ── pay-source tag on the amount cell (owner correction #5) ──
  const tollsCell701 = cell(page, 701, 'tolls');
  assert(await tollsCell701.locator('img.ex-src[alt="DKV"]').count() === 1, 'the 701/tolls amount cell shows the DKV pay-source logo (img.ex-src[alt="DKV"])');
  // Owner 16/9 evening: mark + WORD everywhere, the amount cell included.
  assert(/DKV/.test(await tollsCell701.locator('.b .ex-brand[data-brand="DKV"]').innerText()), 'the cell sub-label is the DKV badge + the word «DKV» (owner 16/9 evening)');
  const logoResp = await page.request.get(BASE_URL + 'assets/logos/dkv.png');
  assert(logoResp.status() === 200, 'assets/logos/dkv.png is served (HTTP ' + logoResp.status() + ')');
  assert(await page.request.get(BASE_URL + 'assets/logos/revolut.png').then(r => r.status()) === 404, 'assets/logos/revolut.png is GONE (Revolut is an inline «R» badge now, αρχή 8)');
  assert(await page.request.get(BASE_URL + 'assets/brands/revoil.png').then(r => r.status()) === 200, 'assets/brands/revoil.png (owner PNG, cropped to the plate) is served');

  // ── owner correction #1: the «Χωρίς δρομολόγιο» panel (the ONE surviving
  // per-cell panel — it is not a trip, owner 16/9) never lists the partner ──
  await cell(page, 'none', 'other').click();
  await page.waitForSelector('.ex-gp[data-panel="none"]', { timeout: 5000 });
  assert(await page.locator('.ex-frame').count() === 0, 'the none-row opens its small panel, never a trip frame');
  const assignSelect = page.locator('.ex-gp[data-panel="none"] .ex-assign');
  assert(await assignSelect.locator('option').count() === 3, '«Χωρίς δρομολόγιο» assign select has exactly 3 options (placeholder + 701 + 702)');
  assert(!/Meta-Cargo/.test(await assignSelect.innerText()), 'the assign select never lists the partner (Meta-Cargo ΕΠΕ)');
  const noneCats = await page.locator('#exQeCategory option').evaluateAll(os => os.map(o => o.value));
  assert(noneCats.join(',') === 'other,accommodation,partner_rate', 'none-row entry row stays scoped to its own group (Λοιπά): ' + noneCats.join(','));
  assert(await page.locator('.ex-gp[data-panel="none"] .ex-th').count() === 1 && /ΠΛΗΡΩΜΗ/.test((await page.locator('.ex-gp[data-panel="none"] .ex-th').innerText()).toUpperCase()), 'the none-row lines list uses the same 9-column header (with ΠΛΗΡΩΜΗ)');
  await page.locator('.ex-gp .ex-link', { hasText: 'Κλείσιμο' }).click();

  // ── E11: the trip FRAME — vehicle cell click opens it under the row ──
  await openFrame(page, 701);
  const frameStyle = await frame(page, 701).evaluate(el => { const cs = getComputedStyle(el); return { borderWidth: cs.borderTopWidth, borderColor: cs.borderTopColor, shadow: cs.boxShadow, mt: cs.marginTop, mb: cs.marginBottom, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor }; });
  assert(frameStyle.borderWidth === '2px' && frameStyle.shadow !== 'none' && frameStyle.mt === '16px' && frameStyle.mb === '16px' && frameStyle.radius === '8px', 'E11: frame = 2px border, shadow, 16px above/below, radius 8: ' + JSON.stringify(frameStyle));
  const navy = await page.evaluate(() => getComputedStyle(document.querySelector('.ex-seg button.active')).backgroundColor);
  assert(frameStyle.borderColor === navy, 'E11: frame border is the same navy as the selected tab (' + navy + ')');
  assert(await page.locator('.ex-grid.has-frame').count() === 1, 'E11: the grid carries .has-frame while a frame is open');
  const op702 = await page.locator('.ex-trip[data-trip="702"]').evaluate(el => getComputedStyle(el).opacity);
  const op701 = await page.locator('.ex-trip[data-trip="701"]').evaluate(el => getComputedStyle(el).opacity);
  assert(op702 === '0.5' && op701 === '1', 'E11: the OTHER trip row fades to opacity .5, the open one stays at 1 (' + op701 + '/' + op702 + ')');
  assert(await page.locator('.ex-gr[data-rt="701"]').evaluate(el => el.classList.contains('open')), 'the open trip\'s grid row keeps its sunken .open tint above the frame');
  const frTop = await frame(page, 701).evaluate(el => el.getBoundingClientRect().top);
  const rowBottom = await page.locator('.ex-gr[data-rt="701"]').evaluate(el => el.getBoundingClientRect().bottom);
  assert(frTop >= rowBottom + 15, 'E11: the frame sits right under its own row, 16px below it (' + (frTop - rowBottom).toFixed(1) + 'px)');
  const headTxt = (await page.locator('.ex-frame .ex-fr-head').innerText()).replace(/\s+/g, ' ');
  assert(/ΘΕ-2001 \/ ΤΡ-9001 · Νίκος Οδηγός/.test(headTxt), 'frame head names «όχημα / ρυμούλκα · οδηγός»: ' + headTxt);
  assert(/Βέροια → Rotterdam/.test(headTxt) && /RT κλειστό/.test(headTxt), 'frame head second line carries the route and «RT κλειστό»');
  assert(/ΣΥΝΟΛΟ ΔΡΟΜΟΛΟΓΙΟΥ|Σύνολο δρομολογίου/.test(headTxt) && /170,00 €/.test(headTxt), 'frame head shows «Σύνολο δρομολογίου 170,00 €» (100 fuel + 30 tolls + 40 Μετρητά Μ): ' + headTxt);
  assert(/Κλείσιμο ▲/.test(headTxt), 'frame head has «Κλείσιμο ▲»');
  const secHeads = await page.locator('.ex-frame .ex-ov-sechead').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  assert(secHeads.some(t => /^Καύσιμα · 1 γραμμή · 100,00 €/.test(t)) && secHeads.some(t => /^Διόδια · 1 γραμμή · 30,00 €/.test(t)), 'frame sections read «Καύσιμα · 1 γραμμή · 100,00 €» / «Διόδια · …»: ' + JSON.stringify(secHeads));
  assert(!secHeads.some(t => /Adblue|Spedition|Πρόστιμα/i.test(t)), 'frame omits category sections with no lines on this trip (AdBlue/Spedition/Πρόστιμα)');
  assert(secHeads.some(t => /^Μετρητά Μ · 40,00 €/.test(t)), 'E1: the ledger section is titled «Μετρητά Μ · 40,00 €»: ' + JSON.stringify(secHeads));
  const thTxt = (await page.locator('.ex-frame .ex-th').first().innerText()).replace(/\s+/g, ' ').toUpperCase();
  assert(/ΗΜΕΡΟΜΗΝΙΑ.*ΚΑΤΗΓΟΡΙΑ.*ΠΛΗΡΩΜΗ.*ΠΑΡΑΣΤΑΤΙΚΟ.*ΛΙΤΡΑ.*ΧΩΡΑ.*ΠΟΣΟ.*ΠΟΙΟΣ/.test(thTxt), 'frame column header = Ημερομηνία · Κατηγορία · Πληρωμή · Παραστατικό/σημείωση · Λίτρα · Χώρα · Ποσό € · Ποιος: ' + thTxt);
  assert(await page.locator('.ex-frame .ex-th').first().evaluate(el => getComputedStyle(el).position) === 'sticky', 'E7: the frame\'s column header is position:sticky');
  const ovText = (await frame(page, 701).innerText()).replace(/\s+/g, ' ');
  assert(/Σύνολο λίτρων/.test(ovText) && /Πληρωμή:/.test(ovText) && /DKV/.test(ovText) && /Διόδια ανά χώρα:/.test(ovText), 'frame totals: total liters, per-payment breakdown naming DKV, per-country tolls');
  assert(await page.locator('.ex-frame .ex-ov-totals img.ex-flag').count() >= 1, 'the per-country tolls line carries a flag');
  assert(await page.locator('.ex-frame .ex-line-grid.ex-row').count() === 2, 'frame lists the 2 lines of RT 701 as detailed rows (ex-line-grid)');
  // Line 9101 (fuel, 412 L, note «Α», no pay_source) — one value per column.
  const row9101 = page.locator('.ex-frame .ex-row[data-line="9101"] > div');
  assert(/412/.test(await row9101.nth(4).innerText()) && (await row9101.nth(3).innerText()).trim() === 'Α' && /—/.test(await row9101.nth(2).innerText()), 'line 9101: Λίτρα column «412», Παραστατικό column «Α», Πληρωμή column «—» (unrecorded, said out loud)');
  const row9102 = page.locator('.ex-frame .ex-row[data-line="9102"] > div');
  assert(await row9102.nth(5).locator('img.ex-flag[alt="HU"]').count() === 1 && await row9102.nth(2).locator('img.ex-src[alt="DKV"]').count() === 1, 'line 9102: Χώρα column shows the HU flag, Πληρωμή column the DKV logo (doc_id fallback)');

  // ── entry row inside the frame: full category list, labels above every
  // field (E5 pattern), three buttons (E6/E9) ──
  const frameCats = await page.locator('#exQeCategory option').evaluateAll(os => os.map(o => o.value));
  assert(frameCats.length === 11 && frameCats[0] === 'fuel' && frameCats.includes('fines') && frameCats.includes('other'), 'frame entry row offers ALL 11 postable categories (owner 16/9): ' + frameCats.join(','));
  assert(await page.locator('#exQeCategory').inputValue() === 'fuel', 'entry row starts on Καύσιμα (the row was opened from the vehicle cell → first column)');
  const qeLabels = await flabels(page, '.ex-frame .ex-row.qe');
  for (const l of ['Κατηγορία', 'Πληρωμή', 'Προμηθευτής', 'Ημερομηνία', 'Ποσό €', 'Παραστατικό / σημείωση', 'Λίτρα', 'Χιλιόμετρα', 'Πρατήριο', 'Χώρα']) assert(qeLabels.includes(l), 'entry row label above field: «' + l + '»');
  assert(!qeLabels.includes('Πηγή πληρωμής'), 'the payment label is «Πληρωμή» now, not «Πηγή πληρωμής»');
  const btns = await page.locator('.ex-frame .ex-qe-actions > button').evaluateAll(bs => bs.map(b => b.textContent.trim()));
  assert(btns[0] === 'Καταχώρηση' && btns[1] === '+ Ίδια κατηγορία' && btns[2] === 'Άκυρο', 'buttons = [Καταχώρηση] [+ Ίδια κατηγορία] [Άκυρο]: ' + JSON.stringify(btns));
  const saveBg = await page.locator('#exQeSave').evaluate(el => getComputedStyle(el).backgroundColor);
  const sameBorder = await page.locator('#exQeSame').evaluate(el => ({ bc: getComputedStyle(el).borderTopColor, bg: getComputedStyle(el).backgroundColor }));
  assert(saveBg === navy && sameBorder.bc === navy && sameBorder.bg !== navy, '«Καταχώρηση» is the navy primary, «+ Ίδια κατηγορία» is outline navy');
  await page.screenshot({ path: shot('03-frame-entry-labels-1440'), fullPage: true });

  // ── clicking an amount cell while the frame is open only re-targets the
  // entry row's category (never closes the frame) ──
  await cell(page, 701, 'tolls').click();
  await page.waitForTimeout(100);
  assert(await frame(page, 701).count() === 1 && await page.locator('#exQeCategory').inputValue() === 'tolls', 'clicking the Διόδια cell with the frame open keeps the frame and switches the entry row to tolls');
  assert(await page.locator('.ex-cell[data-rt="701"][data-group="tolls"].open').count() === 1, 'the Διόδια cell now carries the .open highlight');
  assert(await page.locator('#exQeCountryInput').count() === 1, 'tolls entry shows the Χώρα combobox');
  // Values typed before a switch survive it (exQeSetCategory carries them).
  await page.fill('#exQeAmt', '77');
  await page.fill('#exQeNote', 'TEST');
  await page.selectOption('#exQeCategory', 'ferry_train');
  await page.waitForTimeout(100);
  assert(await page.locator('#exQeAmt').inputValue() === '77' && await page.locator('#exQeNote').inputValue() === 'TEST', 'changing the category via the select keeps the typed Ποσό/Παραστατικό');
  assert(await page.locator('.ex-cell[data-rt="701"][data-group="ferry"].open').count() === 1, 'the cell highlight follows the select (Καράβια/Τρένα)');

  // ── E6 «Άκυρο»: clears the row, frame stays open ──
  await page.locator('#exQeCancel').click();
  await page.waitForTimeout(100);
  assert(await frame(page, 701).count() === 1, 'E6: «Άκυρο» leaves the frame open');
  assert(await page.locator('#exQeAmt').inputValue() === '' && await page.locator('#exQeNote').inputValue() === '', 'E6: «Άκυρο» cleared Ποσό and Παραστατικό');
  assert(await page.locator('#exQeCategory').inputValue() === 'tolls', 'E6: «Άκυρο» returns the category to the last clicked cell (tolls), not the select\'s mid-entry change');
  assert(captured.posts.length === 0, 'E6: «Άκυρο» posted nothing');
  await page.fill('#exQeAmt', '5');
  await page.locator('#exQeAmt').press('Escape');
  await page.waitForTimeout(100);
  assert(await frame(page, 701).count() === 1 && await page.locator('#exQeAmt').inputValue() === '', 'E6: Esc = Άκυρο (clears, does not close the frame)');
  await page.screenshot({ path: shot('05-cancel-cleared-1440'), fullPage: true });

  // ── E9 «+ Ίδια κατηγορία»: writes, keeps category+date+payment, clears
  // amount/note, focus on amount ──
  await page.selectOption('#exQePaySource', 'REVOLUT');
  await page.fill('#exQeCountryInput', 'γερμ');
  await page.waitForSelector('#exQeCountryDrop .ex-cdrop-opt', { timeout: 5000 });
  assert(await page.locator('#exQeCountryDrop img.ex-flag').count() >= 1, 'the country combobox option list shows flags (owner correction #6)');
  await page.locator('#exQeCountryInput').press('Enter');
  await page.fill('#exQeDate', '2026-09-07');
  await page.locator('#exQeDate').dispatchEvent('change');
  await page.fill('#exQeAmt', '12');
  await page.fill('#exQeNote', 'R1');
  await waitLines(page, 'POST', () => page.locator('#exQeSame').click());
  const samePost = captured.posts[captured.posts.length - 1];
  assert(samePost.category === 'tolls' && samePost.pay_source === 'REVOLUT' && samePost.toll_country === 'DE' && samePost.net === 12 && samePost.line_date === '2026-09-07' && samePost.note === 'R1' && samePost.rt_id === 701, 'E9: POST tolls line {REVOLUT, DE, 12, 2026-09-07, R1}: ' + JSON.stringify(samePost));
  assert(await frame(page, 701).count() === 1, 'E9: the frame stays open after «+ Ίδια κατηγορία»');
  assert(await page.locator('#exQeCategory').inputValue() === 'tolls' && await page.locator('#exQeDate').inputValue() === '2026-09-07' && await page.locator('#exQePaySource').inputValue() === 'REVOLUT', 'E9: category, date AND payment stay for the next receipt');
  assert(await page.locator('#exQeAmt').inputValue() === '' && await page.locator('#exQeNote').inputValue() === '', 'E9: amount and note are cleared');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'exQeAmt', 'E9: focus lands on Ποσό');
  assert(/Διόδια · 2 γραμμές · 42,00 €/.test((await page.locator('.ex-frame .ex-ov-sechead', { hasText: 'Διόδια' }).evaluate(el => el.textContent)).replace(/\s+/g, ' ')), 'the Διόδια section now reads «2 γραμμές · 42,00 €» (refetched, not incremented)');
  const revBrand = page.locator('.ex-frame .ex-row[data-line] .ex-pay .ex-brand[data-brand="REVOLUT"]');
  assert(await revBrand.count() === 1 && await revBrand.locator('svg.ex-brand-svg').count() === 1 && /Revolut/.test(await revBrand.innerText()), 'the new REVOLUT line shows the inline black «R» badge + the word «Revolut» in its Πληρωμή column');
  assert(await page.locator('.ex-frame .ex-line-grid img.ex-flag[alt="DE"]').count() >= 1, 'the new line shows the DE flag in its Χώρα column');
  assert(/182,00 €/.test((await page.locator('.ex-frame .ex-fr-total').innerText())), 'frame «Σύνολο δρομολογίου» is now 182,00 € (170 + 12)');
  // Enter = the same «+ Ίδια κατηγορία» (unchanged since 13/9).
  await page.fill('#exQeAmt', '3');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const enterPost = captured.posts[captured.posts.length - 1];
  assert(enterPost.category === 'tolls' && enterPost.toll_country === 'DE' && enterPost.net === 3 && enterPost.pay_source === 'REVOLUT', 'Enter = «+ Ίδια κατηγορία»: same category/country/payment kept: ' + JSON.stringify(enterPost));
  assert(await page.locator('#exQeCategory').inputValue() === 'tolls', 'after Enter the category is still tolls');
  await page.screenshot({ path: shot('06-same-category-1440'), fullPage: true });

  // ── «Καταχώρηση»: writes, then returns the row to how it opened (base
  // category = the last clicked cell, date = trip start) ──
  await page.selectOption('#exQeCategory', 'spedition');
  await page.waitForTimeout(50);
  await page.selectOption('#exQePaySource', 'CASH');
  await page.fill('#exQeAmt', '50');
  await waitLines(page, 'POST', () => page.locator('#exQeSave').click());
  const savePost = captured.posts[captured.posts.length - 1];
  assert(savePost.category === 'spedition' && savePost.pay_source === 'CASH' && savePost.net === 50, 'POST spedition line via «Καταχώρηση» carries pay_source CASH: ' + JSON.stringify(savePost));
  assert(await frame(page, 701).count() === 1 && await page.locator('#exQeCategory').inputValue() === 'tolls' && await page.locator('#exQeDate').inputValue() === '2026-09-05', '«Καταχώρηση» keeps the frame open and resets the row (category back to the clicked cell, date back to the trip start)');
  const cashRowPay = await page.locator('.ex-frame .ex-ov-section[data-section="spedition"] .ex-row[data-line] > div').nth(2).innerText();
  assert(/Μετρητά/.test(cashRowPay), 'the new CASH line shows the grey «Μετρητά» word in its Πληρωμή column: ' + cashRowPay);
  assert(/Spedition · 1 γραμμή · 50,00 €/.test((await page.locator('.ex-frame .ex-ov-sechead', { hasText: 'Spedition' }).evaluate(el => el.textContent)).replace(/\s+/g, ' ')), 'a Spedition section appeared in the frame');

  // ── created_by resolves through the USERS roster (spec point 7) ──
  assert(/Alexia/.test(await page.locator('.ex-frame .ex-row[data-line="9102"] .ex-user').innerText()), 'created_by «alexia» renders as «Alexia»');

  // ── «Επόμενο δρομολόγιο ↓» moves the frame to the next trip (point 9) ──
  await page.locator('.ex-frame .ex-gp-actions button', { hasText: 'Επόμενο δρομολόγιο' }).click();
  await page.waitForSelector('.ex-frame[data-frame="702"]', { timeout: 5000 });
  assert(await frame(page, 701).count() === 0 && await page.locator('.ex-cell[data-rt="702"][data-group="tolls"].open').count() === 1, '«Επόμενο δρομολόγιο» moved the frame from RT 701 to RT 702, same starting group (tolls)');
  assert(await page.locator('.ex-frame[data-frame="702"] .ex-gp-actions .ex-link.dim', { hasText: 'Επόμενο δρομολόγιο' }).count() === 1, 'on the LAST trip (702 — 703 is excluded) the link reads dimmed');

  // ── E5: correction row with labels above every field (line 9104 on RT 702,
  // created by this login) ──
  await page.locator('.ex-frame .ex-row[data-line="9104"] .ex-link', { hasText: 'Διόρθωση' }).click();
  await page.waitForSelector('.ex-row.edit[data-line="9104"]', { timeout: 3000 });
  const edLabels = await flabels(page, '.ex-row.edit[data-line="9104"]');
  for (const l of ['Κατηγορία', 'Πληρωμή', 'Ημερομηνία', 'Ποσό €', 'Παραστατικό / σημείωση', 'Προμηθευτής', 'Λίτρα', 'Χιλιόμετρα', 'Πρατήριο', 'Χώρα']) assert(edLabels.includes(l), 'E5: correction row label above field: «' + l + '»');
  const edFields = await page.locator('.ex-row.edit[data-line="9104"] .ex-field').evaluateAll(fs => fs.map(f => ({ label: (f.querySelector('.ex-flabel') || {}).textContent, hasInput: !!f.querySelector('input,select'), labelFirst: f.firstElementChild && f.firstElementChild.classList.contains('ex-flabel') })));
  assert(edFields.length >= 9 && edFields.every(f => f.hasInput && f.labelFirst), 'E5: every correction field is label-ABOVE-input (' + edFields.length + ' fields)');
  assert(await page.locator('#exEdAmt_9104').inputValue() === '80' && await page.locator('#exEdPaySource_9104').inputValue() === 'CASH' && await page.locator('#exEdLiters_9104').inputValue() === '200', 'E5: correction row prefills amount 80, payment CASH, liters 200');
  await page.screenshot({ path: shot('04-edit-labels-1440'), fullPage: true });
  await page.fill('#exEdAmt_9104', '85');
  await waitLines(page, 'PATCH', () => page.locator('.ex-row.edit[data-line="9104"] .ex-btn', { hasText: 'Αποθήκευση' }).click());
  const patch = captured.patches[captured.patches.length - 1];
  assert(patch.id === 9104 && patch.body.net === 85 && patch.body.vat === 0 && patch.body.pay_source === 'CASH' && patch.body.reason === 'proof: test reason', 'PATCH /costs/lines/9104 {net:85, vat:0, pay_source, reason}: ' + JSON.stringify(patch.body));
  assert(await page.locator('.ex-row.edit').count() === 0 && await frame(page, 702).count() === 1, 'after the correction the edit row closes and the frame stays');

  // ── «σε παράθυρο» modal from the frame: same body builder, FULL category
  // list (the frame is the trip's one entry point, owner 16/9) ──
  await page.locator('.ex-frame .ex-link', { hasText: 'σε παράθυρο' }).click();
  await page.waitForSelector('.ex-modal-box', { timeout: 5000 });
  const modalCats = await page.locator('#exMdCategory option').evaluateAll(os => os.map(o => o.value));
  assert(modalCats.length === 11, 'modal opened from the frame offers all 11 categories, like the inline row: ' + modalCats.join(','));
  await page.selectOption('#exMdCategory', 'fuel');
  await page.waitForTimeout(50);
  assert(await page.locator('#exMdFuelSourceWrap select').count() === 1, 'modal shows its own Προμηθευτής select for a fuel category');
  await page.fill('#exMdAmt', '33');
  await waitLines(page, 'POST', () => page.locator('.ex-modal-box button', { hasText: 'Αποθήκευση' }).click());
  const pm = captured.posts[captured.posts.length - 1];
  assert(pm.category === 'fuel' && pm.fuel_source === 'DKV' && pm.net === 33 && pm.rt_id === 702, 'modal POST: category fuel, fuel_source DKV (default), net 33 on RT 702 — same exBuildLineBody as the inline row');
  assert(await page.locator('.ex-modal-box').count() === 0, 'modal closes after save');

  // ── reefer_fuel on a trip WITHOUT a trailer (702) → select shown, warned ──
  await page.selectOption('#exQeCategory', 'reefer_fuel');
  await page.waitForTimeout(50);
  assert(await page.locator('#exQeTrailerId.warn').count() === 1, 'RT 702 has no trailer_id — the select shows immediately with the warn border');
  assert(/δεν έχει ρυμούλκα/.test(await page.locator('#exQeReeferWrap').innerText()), 'helper text «Το δρομολόγιο δεν έχει ρυμούλκα — επίλεξε»');
  await closeFrame(page);
  assert(await page.locator('.ex-frame').count() === 0 && await page.locator('.ex-grid.has-frame').count() === 0, '«Κλείσιμο ▲» closes the frame and un-fades the rows');

  // ── fuel entry on RT 701: reefer_fuel, Προμηθευτής DADI, chip default (NO trailer_id) ──
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-frame[data-frame="701"]', { timeout: 5000 });
  assert(await page.locator('#exQeCategory').inputValue() === 'fuel', 'clicking the Καύσιμα cell opens the frame with the entry row on fuel');
  await page.selectOption('#exQeCategory', 'reefer_fuel');
  await page.waitForTimeout(50);
  assert(/ΤΡ-9001/.test(await page.locator('#exQeReeferWrap').innerText()) && /από το δρομολόγιο/.test(await page.locator('#exQeReeferWrap').innerText()), 'reefer_fuel on a trip WITH a trailer shows the read-only chip, not a select');
  await page.selectOption('#exQeFuelSource', 'DADI');
  await page.fill('#exQeAmt', '90');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const p1 = captured.posts[captured.posts.length - 1];
  assert(p1.category === 'reefer_fuel' && p1.fuel_source === 'DADI' && p1.rt_id === 701, 'POST 1 (default/chip case): category reefer_fuel, fuel_source DADI');
  assert(!('trailer_id' in p1), 'POST 1: NO trailer_id in the body — the Worker defaults it from the RT (chip never overridden)');
  assert(p1.net === 90, 'POST 1: net = the single «Ποσό €» field (90)');
  assert(await page.locator('#exQeCategory').inputValue() === 'reefer_fuel' && await page.locator('#exQeFuelSource').inputValue() === 'DADI', 'after Enter the category AND supplier stay (E9 semantics)');

  // ── same row, override the trailer → trailer_id IS sent ──
  await page.locator('#exQeReeferWrap .ex-link', { hasText: 'αλλαγή' }).click();
  await page.selectOption('#exQeTrailerId', '22');
  await page.fill('#exQeAmt', '77');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const p2 = captured.posts[captured.posts.length - 1];
  assert(p2.category === 'reefer_fuel' && p2.fuel_source === 'DADI' && p2.trailer_id === 22, 'POST 2 (override case): category reefer_fuel, fuel_source DADI, trailer_id 22 (ΤΡ-9002)');

  // ── tolls entry: country combobox, type «αυ», Enter picks Αυστρία (AT) ──
  await cell(page, 701, 'tolls').click();
  await page.waitForTimeout(100);
  await page.fill('#exQeCountryInput', 'αυ');
  await page.waitForSelector('#exQeCountryDrop .ex-cdrop-opt', { timeout: 5000 });
  await page.locator('#exQeCountryInput').press('Enter');
  assert(/Αυστρία \(AT\)/.test(await page.locator('#exQeCountryInput').inputValue()), 'combobox resolved «αυ» → Αυστρία (AT)');
  await page.fill('#exQeAmt', '25');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const p3 = captured.posts[captured.posts.length - 1];
  assert(p3.category === 'tolls' && p3.toll_country === 'AT' && p3.rt_id === 701, 'POST 3: category tolls, toll_country AT (never free text) — chosen via the combobox');
  // Session default (spec: «the last value used in this session», per
  // fuel/tolls vs other bucket): the CORRECTION of the CASH fuel line 9104
  // above (exSaveEdit → exPaySourceRemember) moved the fuel/tolls bucket to
  // CASH, so that is what every fuel/tolls row has defaulted to since —
  // the reefer POSTs above and this tolls POST alike.
  assert(p3.pay_source === 'CASH', 'POST 3 carries the session-remembered pay_source for fuel/tolls (CASH, from the corrected fuel line) — never left out: ' + p3.pay_source + ' · all posts: ' + captured.posts.map(p => p.category + ':' + p.pay_source).join(','));
  assert(await page.locator('.ex-frame .ex-line-grid img.ex-flag[alt="AT"]').count() >= 1, 'the tolls lines list shows img.ex-flag[alt="AT"] for the new AT line');
  assert(await page.locator('#exQeCountryFlagIcon img.ex-flag[alt="AT"]').count() === 1, 'the selected-value flag icon next to the combobox input also shows AT');

  // ── «Μετρητά Μ» (E1): the expm cell opens the frame and focuses its own
  // field; fill an empty entry (no reason), then correct a written one ──
  await cell(page, 702, 'expm').click();
  await page.waitForSelector('.ex-frame[data-frame="702"]', { timeout: 5000 });
  assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'exExpMAmt', 'the Μετρητά Μ cell opens the frame with focus on the ledger field');
  await page.fill('#exExpMAmt', '18');
  await waitLedger(page, () => page.locator('#exExpMAmt').press('Enter'));
  const lp1 = captured.ledgerPatches[captured.ledgerPatches.length - 1];
  assert(lp1.id === 502 && lp1.body.expenses === 18 && !('reason' in lp1.body), 'PATCH /costs/ledger/502 {expenses:18} — no reason (entry was empty)');
  await cell(page, 701, 'expm').click();
  await page.waitForSelector('.ex-frame[data-frame="701"]', { timeout: 5000 });
  assert(await page.locator('#exExpMAmt').inputValue() === '40', 'Μετρητά Μ field prefills the current ledger value (40)');
  await page.fill('#exExpMAmt', '55');
  await waitLedger(page, () => page.locator('#exExpMAmt').press('Enter'));
  const lp2 = captured.ledgerPatches[captured.ledgerPatches.length - 1];
  assert(lp2.id === 501 && lp2.body.expenses === 55 && lp2.body.reason === 'proof: test reason', 'PATCH /costs/ledger/501 {expenses:55, reason} — reason required (entry already had 40)');
  assert(/55,00/.test(await cell(page, 701, 'expm').innerText()), 'Μετρητά Μ cell reflects the new value after refetch');
  assert(/Μετρητά Μ · 55,00 €/.test((await page.locator('.ex-frame .ex-ov-sechead', { hasText: 'Μετρητά Μ' }).evaluate(el => el.textContent)).replace(/\s+/g, ' ')), 'the frame\'s Μετρητά Μ section shows 55,00 € too');

  // ── Addition A (owner 14/9): fuel entry carries an OPTIONAL toll_country ──
  await cell(page, 701, 'fuel').click();
  await page.waitForTimeout(100);
  assert(await page.locator('#exQeFuelFields .ex-country').count() === 1, 'fuel entry row shows the Χώρα combobox inside the fuel fields (right after Πρατήριο)');
  await page.selectOption('#exQeFuelSource', 'DKV');
  await page.selectOption('#exQePaySource', 'DKV');
  await page.fill('#exQeCountryInput', 'αυ');
  await page.waitForSelector('#exQeCountryDrop .ex-cdrop-opt', { timeout: 5000 });
  await page.locator('#exQeCountryInput').press('Enter');
  await page.fill('#exQeAmt', '61');
  await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
  const fuelCountryPost = captured.posts[captured.posts.length - 1];
  assert(fuelCountryPost.category === 'fuel' && fuelCountryPost.toll_country === 'AT' && fuelCountryPost.fuel_source === 'DKV' && fuelCountryPost.pay_source === 'DKV' && fuelCountryPost.net === 61,
    'POST fuel line carries toll_country AT chosen via the combobox, alongside fuel_source/pay_source: ' + JSON.stringify(fuelCountryPost));

  // ── only one frame at a time; the same cell click closes via the row ──
  await driverCell(page, 702).click();
  await page.waitForSelector('.ex-frame[data-frame="702"]', { timeout: 5000 });
  assert(await frame(page, 701).count() === 0, 'opening RT 702’s frame (driver cell) closes RT 701’s');
  await vehicleCell(page, 702).click();
  await page.waitForTimeout(150);
  assert(await page.locator('.ex-frame').count() === 0, 'clicking the open trip\'s vehicle cell again closes its frame');

  // Leave RT 701's frame open for the week screenshot below.
  await openFrame(page, 701);
  await assertGridFits(page, '1440 (week tab)');
  await assertHeaderCellsFit(page, '1440 (week tab, 9 amount cols)');
  await assertWeekChipsFit(page, '1440 (week tab)');
  await assertTitleRowFits(page, '1440 (week tab)');
  await assertNoneRowSingleLine(page, '1440 (week tab)');
  await assertLineHeaderFits(page, '1440 (frame)');
  await page.screenshot({ path: shot('02-frame-open-1440'), fullPage: true });
  await context.close();
  return { consoleErrors, captured };
}

// E8: «ΠΙΣΤΩΣΗ» exists only when the Worker says so. Two contexts: the
// pre-035 Worker (no pay_sources → no option, and a forced CREDIT POST is
// refused out loud), the post-035 Worker (option present, POST carries
// 'CREDIT', the line shows «Πίστωση»).
async function runCreditGate(browser) {
  console.log('\n== E8 · ΠΙΣΤΩΣΗ gated by /costs/lookups pay_sources ==');
  const errors = [];
  // (a) pre-035 Worker
  {
    const { context, page, consoleErrors } = await newPage(browser, 'accountant');
    installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
    await gotoPage(page, 'expenses', BASE_URL);
    await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
    await openWeek(page, WEEK_START);
    await openFrame(page, 701);
    const opts = await page.locator('#exQePaySource option').evaluateAll(os => os.map(o => o.value));
    assert(opts.join(',') === 'DKV,CASH,REVOLUT', 'pre-035 Worker (no pay_sources in lookups): the dropdown offers exactly DKV,CASH,REVOLUT — no ΠΙΣΤΩΣΗ: ' + opts.join(','));
    assert(!/ΠΙΣΤΩΣΗ/.test(await page.locator('#exQePaySource').innerText()), 'no «ΠΙΣΤΩΣΗ» label anywhere in the select');
    // αρχή 1: even if something forced 'CREDIT' through, the Worker's 400 is
    // shown to the user, never swallowed.
    await page.evaluate(() => { const s = document.getElementById('exQePaySource'); const o = document.createElement('option'); o.value = 'CREDIT'; o.textContent = 'forced'; s.appendChild(o); s.value = 'CREDIT'; });
    await page.fill('#exQeAmt', '9');
    await waitLines(page, 'POST', () => page.locator('#exQeAmt').press('Enter'));
    await page.waitForTimeout(200);
    const toast = await page.evaluate(() => { const c = document.getElementById('tms-toast-container'); return c ? c.innerText : ''; });
    assert(/pay_source must be one of DKV\|CASH\|REVOLUT/.test(toast), 'a rejected CREDIT is said out loud in the toast (Worker 400 text): ' + toast.replace(/\s+/g, ' '));
    errors.push(...consoleErrors);
    await context.close();
  }
  // (b) post-035 Worker
  {
    const { context, page, consoleErrors } = await newPage(browser, 'accountant');
    const captured = installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE_CREDIT, lines: LINES_FIXTURE });
    await gotoPage(page, 'expenses', BASE_URL);
    await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
    await openWeek(page, WEEK_START);
    await openFrame(page, 701);
    const opts = await page.locator('#exQePaySource option').evaluateAll(os => os.map(o => ({ v: o.value, l: o.textContent })));
    assert(opts.map(o => o.v).join(',') === 'DKV,CASH,REVOLUT,CREDIT' && opts[3].l === 'ΠΙΣΤΩΣΗ', 'post-035 Worker: the dropdown offers CREDIT labelled «ΠΙΣΤΩΣΗ» as the 4th option: ' + JSON.stringify(opts));
    await page.selectOption('#exQeCategory', 'spedition');
    await page.waitForTimeout(50);
    await page.selectOption('#exQePaySource', 'CREDIT');
    await page.fill('#exQeAmt', '120');
    await page.fill('#exQeNote', 'INV-9');
    await waitLines(page, 'POST', () => page.locator('#exQeSave').click());
    const post = captured.posts[captured.posts.length - 1];
    assert(post.category === 'spedition' && post.pay_source === 'CREDIT' && post.net === 120, 'POST carries pay_source CREDIT: ' + JSON.stringify(post));
    const payCol = await page.locator('.ex-frame .ex-ov-section[data-section="spedition"] .ex-row[data-line] > div').nth(2).innerText();
    assert(/Πίστωση/.test(payCol), 'the new line shows «Πίστωση» in its Πληρωμή column: ' + payCol);
    assert(/Πληρωμή:.*Πίστωση 120,00 €/.test((await page.locator('.ex-frame .ex-ov-totals').innerText()).replace(/\s+/g, ' ')), 'the frame\'s payment breakdown names «Πίστωση 120,00 €»');
    assert(/πίστωση/.test(await cell(page, 701, 'spedition').locator('.b').innerText()), 'the Spedition amount cell sub-label reads «πίστωση» (all lines credit)');
    await page.screenshot({ path: shot('10-credit-option-1440'), fullPage: true });
    errors.push(...consoleErrors);
    await context.close();
  }
  return { consoleErrors: errors };
}

// E7: sticky column header INSIDE the frame, measured after a real scroll of
// #content (the app's scrolling element) at a short viewport.
async function runStickyCheck(browser) {
  console.log('\n== E7 · sticky κεφαλίδες μετά από scroll ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width: 1440, height: 560 });
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE_STICKY });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  await openFrame(page, 701);
  const m0 = await page.evaluate(() => {
    const c = document.getElementById('content');
    return { contentTop: c.getBoundingClientRect().top, sh: c.scrollHeight, ch: c.clientHeight, gh: document.querySelector('.ex-gh').getBoundingClientRect() };
  });
  assert(m0.sh > m0.ch + 300, 'the page is tall enough to scroll (scrollHeight ' + m0.sh + ' > clientHeight ' + m0.ch + ')');
  const ghH = m0.gh.height;
  // Scroll so that the Καύσιμα section (12 lines) straddles the top edge.
  // Opening the frame focused Ποσό (which already scrolled #content to the
  // entry row) — start from the top again, then scroll to 120px past the
  // Καύσιμα column header so the section straddles the pinned grid header.
  await page.evaluate(() => { const c = document.getElementById('content'); c.scrollTop = 0; });
  await page.waitForTimeout(50);
  await page.evaluate(() => { const c = document.getElementById('content'); const th = document.querySelector('.ex-frame .ex-ov-section[data-section="fuel"] .ex-th'); c.scrollTop = c.scrollTop + (th.getBoundingClientRect().top - c.getBoundingClientRect().top) + 120; });
  await page.waitForTimeout(150);
  const m1 = await page.evaluate(() => {
    const c = document.getElementById('content');
    const gh = document.querySelector('.ex-gh').getBoundingClientRect();
    const th = document.querySelector('.ex-frame .ex-ov-section[data-section="fuel"] .ex-th').getBoundingClientRect();
    const sec = document.querySelector('.ex-frame .ex-ov-section[data-section="fuel"]').getBoundingClientRect();
    return { contentTop: c.getBoundingClientRect().top, st: c.scrollTop, ghTop: gh.top, ghBottom: gh.bottom, thTop: th.top, secTop: sec.top, secBottom: sec.bottom };
  });
  assert(m1.st > 100, '#content actually scrolled (scrollTop ' + m1.st + ')');
  assert(Math.abs(m1.ghTop - m1.contentTop) <= 1, 'E7: after scrolling, the grid header is pinned at the top of #content (' + m1.ghTop.toFixed(1) + ' vs ' + m1.contentTop.toFixed(1) + ') — it never was before 16/9');
  assert(m1.secTop < m1.ghBottom && m1.secBottom > m1.ghBottom + 60, 'the Καύσιμα section straddles the header edge (top ' + m1.secTop.toFixed(0) + ', bottom ' + m1.secBottom.toFixed(0) + ')');
  assert(Math.abs(m1.thTop - m1.ghBottom) <= 1, 'E7: the frame\'s column header is pinned right under the grid header (' + m1.thTop.toFixed(1) + ' vs ' + m1.ghBottom.toFixed(1) + ', grid header ' + ghH + 'px tall)');
  await page.screenshot({ path: shot('07-sticky-scrolled-1440x560'), fullPage: false });
  await context.close();
  return { consoleErrors };
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
  assert(EXPECTED_HEADER_RE.test(headerText), 'vehicle tab has the SAME header as the week tab (no Α/Α, 9 amount columns, Μετρητά Μ)');
  assert(/Σύνολο ΘΕ-2001 \(1 δρομολόγια, 2 γραμμές\)/.test((await page.locator('.ex-gt').innerText()).replace(/\s+/g, ' ')), 'totals row names the vehicle, trip count and line count');
  const gridText = await page.locator('.ex-page').innerText();
  assert(!/Φ\.?Π\.?Α/i.test(gridText), 'no ΦΠΑ text anywhere on the vehicle sheet');

  // The frame works in the vehicle tab too (owner 14/9 asked for the
  // overview generally, not only the week sheet).
  await openFrame(page, 701);
  assert(/ΣΥΝΟΛΟ ΔΡΟΜΟΛΟΓΙΟΥ|Σύνολο δρομολογίου/.test(await frame(page, 701).innerText()), 'vehicle tab: clicking the vehicle cell opens the frame there too');
  await vehicleCell(page, 701).click();
  await page.waitForTimeout(100);

  await assertGridFits(page, '1440 (vehicle tab)');
  await assertHeaderCellsFit(page, '1440 (vehicle tab)');
  await assertTitleRowFits(page, '1440 (vehicle tab)');

  await page.screenshot({ path: shot('11-vehicle-tab-1440'), fullPage: true });
  await context.close();
  return { consoleErrors };
}

// Owner review 13/9 on commit 1693369: the ledger overflowed its card at
// 1440 — Σύνολο/Κατάσταση were cut off. Two checks close that: the grid must
// never be wider than its container, and the LAST header cell (Κατάσταση)
// must end inside the card, not past its edge.
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
async function assertHeaderCellsFit(page, label) {
  const cells = await page.evaluate(() => Array.from(document.querySelectorAll('.ex-gh > div, .ex-gh > span')).map(el => ({
    h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth, txt: el.textContent.trim()
  })));
  for (const c of cells) {
    assert(c.h <= 32.5, `[${label}] header cell height ≤32px («${c.txt}»): ${c.h.toFixed(1)}`);
    assert(c.sw <= c.cw + 0.5, `[${label}] header cell «${c.txt}» not wrapped/overflowing: scrollWidth ${c.sw} ≤ clientWidth ${c.cw}`);
  }
}
// w8: the 9-column line header inside the frame must not ellipsize either.
async function assertLineHeaderFits(page, label) {
  const cells = await page.evaluate(() => Array.from(document.querySelectorAll('.ex-frame .ex-th > div')).map(el => ({ sw: el.scrollWidth, cw: el.clientWidth, txt: el.textContent.trim() })));
  assert(cells.length >= 9, `[${label}] frame line header has 9 cells`);
  for (const c of cells) assert(c.sw <= c.cw + 0.5, `[${label}] line header cell «${c.txt}» not ellipsized: ${c.sw} ≤ ${c.cw}`);
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
async function assertNoPageScrollX(page, label) {
  const x = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: (c => c.scrollWidth - c.clientWidth)(document.getElementById('content')) }));
  assert(x.doc <= 0, `[${label}] the PAGE never scrolls sideways: ${x.doc}`);
  assert(x.content <= 0, `[${label}] #content never scrolls sideways either: ${x.content}`);
}

async function runScreenshotWidths(browser) {
  console.log('\n== no horizontal scroll at 1280/1440/1920, frame open ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width: 1280, height: 800 });
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-frame[data-frame="701"]', { timeout: 5000 });
  await assertNoPageScrollX(page, '1280');
  await assertGridFits(page, '1280');
  await assertHeaderCellsFit(page, '1280 (9 amount cols)');
  await assertLineHeaderFits(page, '1280 (frame)');
  await assertWeekChipsFit(page, '1280');
  await assertTitleRowFits(page, '1280');
  await assertNoneRowSingleLine(page, '1280');
  await page.screenshot({ path: shot('08-frame-1280'), fullPage: true });

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    await assertNoPageScrollX(page, String(width));
    await assertGridFits(page, width + ' (post-resize)');
    await assertHeaderCellsFit(page, width + ' (post-resize, 9 amount cols)');
    await assertLineHeaderFits(page, width + ' (frame)');
    await assertWeekChipsFit(page, width + ' (post-resize)');
  }
  await page.screenshot({ path: shot('09-frame-1920'), fullPage: true });
  await context.close();
  return { consoleErrors };
}

// Owner review 13/9 #2, point F: the layout must hold with several
// categories populated at once (LINES_FIXTURE_WIDE). w8: this is also the
// «frame with ≥3 categories» state and the E4 fines proof.
async function runWideColumnsCheck(browser) {
  console.log('\n== all 9 amount columns (populated fixture) — 1280 & 1440 & 1920, E4 fines ==');
  const errors = [];
  for (const width of [1280, 1440, 1920]) {
    const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width, height: 900 });
    installCostsMocks(page, { rt: RT_FIXTURE_WIDE, lookups: LOOKUPS_FIXTURE_WIDE, lines: LINES_FIXTURE_WIDE });
    await gotoPage(page, 'expenses', BASE_URL);
    await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
    await openWeek(page, WEEK_START, 801);
    const visCols = await page.locator('.ex-gh > div.r').count();
    assert(visCols === 10, `[${width}] exactly 9 amount columns + Σύνολο always visible (got ${visCols}): ${await page.locator('.ex-gh').innerText()}`);
    // E4: fines are in the row total — 100+30+20+50+15 lines + 40 ledger = 255.
    // `> div` skips the chevron <span>: vehicle(0) driver(1) dates(2) route(3) 9 cells(4–12) Σύνολο(13) Κατάσταση(14).
    const rowTotal = (await page.locator('.ex-gr[data-rt="801"] > div').nth(13).innerText()).trim();
    assert(rowTotal === '255,00', `[${width}] E4: the grid Σύνολο cell for RT 801 = 255,00 (fines 15 included, Μετρητά Μ 40 included): ${rowTotal}`);
    await openFrame(page, 801);
    const secHeads = await page.locator('.ex-frame .ex-ov-sechead').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    assert(secHeads.filter(t => !/^Μετρητά Μ/.test(t)).length === 5, `[${width}] frame shows 5 category sections (Καύσιμα, Διόδια, AdBlue, Spedition, Πρόστιμα): ${JSON.stringify(secHeads)}`);
    assert(secHeads.some(t => /^Πρόστιμα · 1 γραμμή · 15,00 € · μπαίνει στο σύνολο$/.test(t)), `[${width}] E4: the Πρόστιμα strip says «· μπαίνει στο σύνολο»: ${JSON.stringify(secHeads)}`);
    assert(/255,00 €/.test(await page.locator('.ex-frame .ex-fr-total').innerText()), `[${width}] E4: «Σύνολο δρομολογίου 255,00 €» — same number as the grid row`);
    const payLine = (await page.locator('.ex-frame .ex-ov-totals').innerText()).replace(/\s+/g, ' ');
    assert(/Πληρωμή:.*DKV 130,00 €.*Revolut 50,00 €.*Μετρητά 35,00 €/.test(payLine), `[${width}] payment breakdown DKV 130 · Revolut 50 · Μετρητά 35 (fines counted under Μετρητά): ${payLine}`);
    assert(await page.locator('.ex-frame .ex-ov-totals .ex-brand[data-brand="DKV"] img.ex-src').count() === 1 && await page.locator('.ex-frame .ex-ov-totals .ex-brand[data-brand="REVOLUT"] svg').count() === 1, `[${width}] the payment summary carries the SAME source badges as the lines (DKV logo, Revolut R) — coordinator note on shot 02b`);
    await assertNoPageScrollX(page, width + ' (wide, frame open)');
    await assertGridFits(page, width + ' (9 amount cols)');
    await assertHeaderCellsFit(page, width + ' (9 amount cols)');
    await assertLineHeaderFits(page, width + ' (wide frame)');
    await assertWeekChipsFit(page, width);
    await assertTitleRowFits(page, width);
    const driverEl = page.locator('.ex-gr[data-rt="801"] > div').nth(1);
    const driverFit = await driverEl.evaluate(el => ({ txt: el.textContent, title: el.title }));
    assert(/Vlachopoulos Christos/.test(driverFit.txt) || /Vlachopoulos Christos/.test(driverFit.title), `[${width}] driver cell carries the full name (visibly or via title): ${driverFit.txt} / ${driverFit.title}`);
    const vehTxt = (await page.locator('.ex-gr[data-rt="801"] .ex-vehcell').innerText()).replace(/\s+/g, ' ');
    assert(/ΘΕ-3001/.test(vehTxt) && /ΤΡ-9003/.test(vehTxt), `[${width}] vehicle cell shows both plates: ${vehTxt}`);
    if (width === 1440) await page.screenshot({ path: shot('02b-frame-5-categories-1440'), fullPage: true });
    errors.push(...consoleErrors);
    await context.close();
  }
  return { consoleErrors: errors };
}

// Owner 16/9 evening (via coordinator), on top of E1–E11: (1) country flags
// must NOT be lost, (2) every payment method / fuel supplier shows a 16–18px
// mark + the word, (3) OWN_STATION = «Revoil Petras» with the owner's Revoil
// PNG (SVG twin on load failure), (4) BG_STATION = «Nikolai» with the
// Bulgarian flag. One trip, one fuel line per supplier, then the frame is
// read column by column.
const LINES_FIXTURE_BRANDS = [
  line({ id: 9401, rt_id: 701, category: 'fuel', net: 100, vat: 0, line_date: '2026-09-05', pay_source: 'CASH', fuel_source: 'DADI', toll_country: 'MK', liters: 300, station: 'DADI Skopje', note: 'D-1' }),
  line({ id: 9402, rt_id: 701, category: 'fuel', net: 90, vat: 0, line_date: '2026-09-06', pay_source: 'CASH', fuel_source: 'BG_STATION', toll_country: 'BG', liters: 250, note: 'N-1' }),
  line({ id: 9403, rt_id: 701, category: 'fuel', net: 120, vat: 0, line_date: '2026-09-07', pay_source: 'REVOLUT', fuel_source: 'OWN_STATION', toll_country: 'GR', liters: 400, km_reading: 250000, note: 'RP-1', created_by: 'demo_accountant' }),
  line({ id: 9404, rt_id: 701, category: 'fuel', net: 60, vat: 0, line_date: '2026-09-08', pay_source: 'DKV', fuel_source: 'THIRD_PARTY', toll_country: 'AT', liters: 150, note: 'T-1' }),
  line({ id: 9405, rt_id: 701, category: 'tolls', net: 30, vat: 0, line_date: '2026-09-06', pay_source: 'DKV', toll_country: 'HU' }),
];
async function runBrandBadges(browser) {
  console.log('\n== σήματα πηγών + σημαίες + Revoil/Nikolai (owner 16/9 evening) ==');
  // Taller viewport: #content is the scroller, so a full-page shot only shows
  // one viewport of it — 1300px keeps the whole Καύσιμα section (4 lines,
  // Revoil on top as the newest) in the picture without scrolling.
  const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width: 1440, height: 1300 });
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE_BRANDS });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-seg', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  const tollsB = cell(page, 701, 'tolls').locator('.b .ex-brand[data-brand="DKV"]');
  assert(await tollsB.count() === 1 && await tollsB.locator('img.ex-src').count() === 1 && /DKV/.test(await tollsB.innerText()), 'closed grid: tolls cell shows DKV logo + «DKV»');
  assert(await cell(page, 701, 'fuel').locator('.ex-brand').count() === 0, 'closed grid: the mixed-payment fuel cell shows no badge (never a misleading one)');
  const rowH = await page.locator('.ex-gr[data-rt="701"]').evaluate(el => el.getBoundingClientRect().height);
  assert(rowH <= 46, 'the badge in the cell sub-label keeps the collapsed row ≤46px (12px mark there, 16–18px elsewhere): ' + rowH.toFixed(1));
  await openFrame(page, 701);
  const brand = (id, key) => page.locator(`.ex-frame .ex-row[data-line="${id}"] .ex-brand[data-brand="${key}"]`);
  assert(await brand(9401, 'DADI').locator('img.ex-src[alt="DADI"]').count() === 1 && /DADI/.test(await brand(9401, 'DADI').innerText()), 'line 9401: Προμηθευτής = DADI logo + «DADI»');
  assert(await brand(9402, 'NIKOLAI').locator('img.ex-flag[alt="BG"]').count() === 1 && /Nikolai/.test(await brand(9402, 'NIKOLAI').innerText()), 'line 9402: Προμηθευτής = Bulgarian flag + «Nikolai» (BG_STATION)');
  const revoilImg = brand(9403, 'REVOIL').locator('img.ex-src.revoil');
  assert(await revoilImg.count() === 1 && /Revoil Petras/.test(await brand(9403, 'REVOIL').innerText()), 'line 9403: Προμηθευτής = Revoil PNG + «Revoil Petras» (OWN_STATION)');
  const rv = await revoilImg.evaluate(img => ({ src: img.getAttribute('src'), h: img.getBoundingClientRect().height, complete: img.complete, nw: img.naturalWidth }));
  assert(rv.src === 'assets/brands/revoil.png' && rv.nw > 0 && rv.h >= 17.5 && rv.h <= 18.5, 'Revoil mark = the local PNG, actually loaded, 18px tall: ' + JSON.stringify(rv));
  await revoilImg.evaluate(img => exBrandImgFallback(img, 'REVOIL'));
  const fb = brand(9403, 'REVOIL').locator('svg.ex-brand-svg');
  assert(await fb.count() === 1 && await fb.locator('rect').first().getAttribute('fill') === '#0072BC' && await fb.locator('circle').first().getAttribute('fill') === '#8DC63F' && /Revoil Petras/.test(await brand(9403, 'REVOIL').innerText()), 'if the PNG fails to load, the inline SVG twin (blue #0072BC plate, green #8DC63F dot) takes its place and the word stays');
  const dadiH = await brand(9401, 'DADI').locator('img.ex-src').evaluate(el => el.getBoundingClientRect().height);
  assert(dadiH >= 15.5 && dadiH <= 18.5, 'marks in the lines are 16–18px tall: ' + dadiH.toFixed(1));
  assert(await brand(9404, 'THIRD_PARTY').locator('.ex-badge-neutral').count() === 1 && /Τρίτος/.test(await brand(9404, 'THIRD_PARTY').innerText()), 'line 9404: Προμηθευτής = neutral badge + «Τρίτος»');
  assert(await brand(9403, 'REVOLUT').locator('svg.ex-brand-svg').count() === 1 && /Revolut/.test(await brand(9403, 'REVOLUT').innerText()), 'line 9403: Πληρωμή = black «R» badge + «Revolut»');
  assert(await brand(9404, 'DKV').locator('img.ex-src[alt="DKV"]').count() === 1, 'line 9404: Πληρωμή = DKV logo + word');
  assert(/Μετρητά/.test(await page.locator('.ex-frame .ex-row[data-line="9401"] .ex-pay').innerText()), 'line 9401: Πληρωμή = the word «Μετρητά» (cash is not a brand)');
  for (const [id, cc] of [[9401, 'MK'], [9402, 'BG'], [9403, 'GR'], [9404, 'AT'], [9405, 'HU']]) {
    assert(await page.locator(`.ex-frame .ex-row[data-line="${id}"] .ex-plate img.ex-flag[alt="${cc}"]`).count() === 1 && new RegExp(cc).test(await page.locator(`.ex-frame .ex-row[data-line="${id}"] .ex-plate`).innerText()), `line ${id}: Χώρα column keeps flag + code «${cc}» (point 1)`);
  }
  const sum = page.locator('.ex-frame .ex-ov-totals');
  assert(await sum.locator('.ex-brand[data-brand="DKV"] img.ex-src').count() === 1 && await sum.locator('.ex-brand[data-brand="REVOLUT"] svg').count() === 1 && await sum.locator('.ex-brand[data-brand="CASH"]').count() === 1, 'payment summary: DKV logo, Revolut R and «Μετρητά» via the same renderer');
  const srcs = await page.locator('.ex-frame .ex-brand img.ex-src').evaluateAll(imgs => imgs.map(i => i.getAttribute('src')));
  assert(srcs.length >= 3 && srcs.every(x => /^assets\/(logos|brands)\//.test(x)), 'every brand <img> is a local assets file, no external URL: ' + JSON.stringify(srcs));
  const fsOpts = await page.locator('#exQeFuelSource option').evaluateAll(os => os.map(o => o.textContent));
  assert(fsOpts.includes('Revoil Petras') && fsOpts.includes('Nikolai') && !fsOpts.includes('Ιδιόκτητο') && !fsOpts.includes('BG πρατήριο'), 'Προμηθευτής select reads «Revoil Petras» / «Nikolai» (values unchanged): ' + fsOpts.join(','));
  await page.evaluate(() => exRenderPage());
  await page.waitForSelector('.ex-frame .ex-row[data-line="9403"] img.ex-src.revoil', { timeout: 5000 });
  await page.evaluate(() => { document.getElementById('content').scrollTop = 0; });
  await page.screenshot({ path: shot('12-brands-dadi-nikolai-revoil-1440'), fullPage: true });
  await page.locator('.ex-frame .ex-row[data-line="9403"] .ex-link', { hasText: 'Διόρθωση' }).click();
  await page.waitForSelector('#exEdFuelSource_9403', { timeout: 5000 });
  assert(await page.locator('#exEdFuelSource_9403').inputValue() === 'OWN_STATION' && (await page.locator('#exEdFuelSource_9403 option:checked').textContent()) === 'Revoil Petras', 'correction row of line 9403: Προμηθευτής = OWN_STATION shown as «Revoil Petras»');
  await page.screenshot({ path: shot('13-brands-revoil-edit-1440'), fullPage: true });
  await context.close();
  return { consoleErrors };
}

// «Αν σπάσει στις 06:00 Δευτέρα, ποιος το μαθαίνει;» — at 1440×778 the FIRST
// trip row must land within 220px of the top of the viewport.
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
  assert(await page.locator('.ex-frame').count() === 0 && await page.locator('.ex-gp').count() === 0, 'management: clicking the Μετρητά Μ cell opens nothing');
  // The frame itself is readable (it is the 14/9 overview) — without any
  // entry row, ledger field or correction links.
  await openFrame(page, 701);
  assert(await page.locator('.ex-frame .ex-row.qe').count() === 0 && await page.locator('#exExpMAmt').count() === 0, 'management: the frame opens read-only — no entry row, no Μετρητά Μ field');
  assert(await page.locator('.ex-frame .ex-link', { hasText: 'Διόρθωση' }).count() === 0, 'management: no «Διόρθωση» links inside the frame');
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
    const credit = await runCreditGate(browser);
    const sticky = await runStickyCheck(browser);
    const veh = await runVehicleTab(browser);
    const shotW = await runScreenshotWidths(browser);
    const wide = await runWideColumnsCheck(browser);
    const brands = await runBrandBadges(browser);
    const fold = await runFoldCheck(browser);
    const mgmt = await runManagementFlow(browser);
    const disp = await runDispatcherFlow(browser);
    const all = [...acct.consoleErrors, ...credit.consoleErrors, ...sticky.consoleErrors, ...veh.consoleErrors, ...shotW.consoleErrors, ...wide.consoleErrors, ...brands.consoleErrors, ...fold.consoleErrors, ...mgmt.consoleErrors, ...disp.consoleErrors];
    console.log('\n== console errors ==');
    console.log('accountant:', acct.consoleErrors.length, 'credit:', credit.consoleErrors.length, 'sticky:', sticky.consoleErrors.length, 'vehicle:', veh.consoleErrors.length, 'widths:', shotW.consoleErrors.length, 'wide-cols:', wide.consoleErrors.length, 'brands:', brands.consoleErrors.length, 'fold:', fold.consoleErrors.length, 'management:', mgmt.consoleErrors.length, 'dispatcher:', disp.consoleErrors.length);
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
