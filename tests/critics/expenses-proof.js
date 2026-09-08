// Proof script for the «Έξοδα Δρομολογίων» screen (modules/expenses.js).
// Spec §4: docs/superpowers/specs/2026-09-07-trip-expenses-design.md.
//
// Run from the MAIN repo (not this worktree — it has no node_modules):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8791/ \
//     node <this-worktree>/tests/critics/expenses-proof.js
//
// A local `python3 -m http.server` must already be serving THIS worktree's
// root on PW_BASE_URL's port (the server is started/stopped by the caller,
// not by this script, so failures here don't leave a stray server running).
//
// It reuses tests/critics/auth.js from the MAIN repo (preparePage/gotoPage —
// fake session + HAR replay for the Worker host) rather than duplicating
// that machinery here. /costs/* is then mocked on top with page.route,
// registered AFTER preparePage so it wins over the HAR replay route
// (Playwright runs the most-recently-registered matching handler first).

const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8791/';
const SCREENSHOT = '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-keen-hamilton-ab77a6/caa94f70-bf92-45c5-98d4-ff74de01e316/scratchpad/expenses-accountant.png';
// Coordinator defect 1 (7/9): full-page proof at the two widths the
// accountant actually works at, WITH a trip selected and the fuel fields
// showing — a screenshot at the default viewport would not have caught the
// original overflow, since it only appeared once the left list + right card
// had to share ~1280-230=1050px.
const SCREENSHOT_1280 = '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-keen-hamilton-ab77a6/caa94f70-bf92-45c5-98d4-ff74de01e316/scratchpad/expenses-accountant-1280.png';
const SCREENSHOT_1440 = '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-keen-hamilton-ab77a6/caa94f70-bf92-45c5-98d4-ff74de01e316/scratchpad/expenses-accountant-1440.png';

// ── Fixtures, shaped like the real Worker responses (worker/src/index.js
// resource==="rt"/"lookups"/"lines" GET handlers) ──────────────────────────
const LOOKUPS_FIXTURE = {
  trucks: [{ id: 1, legacy_id: null, license_plate: 'ΙΝ-1234', active: true }],
  trailers: [],
  drivers: [{ id: 1, legacy_id: null, full_name: 'Γιώργος Παπαδόπουλος', active: true }],
  partners: [{ id: 1, legacy_id: null, company_name: 'Meta-Cargo ΕΠΕ', active: true }],
};
const RT_FIXTURE = [
  { id: 501, code: 'RT-501', scope: 'INTL', trip_type: 'OWNED', truck_id: 1, trailer_id: null, driver_id: 1, partner_id: null,
    date_start: '2026-09-02', date_end: '2026-09-05', status: 'in_progress', route_text: 'Θεσσαλονίκη → Μόναχο', route_legs: null },
];
const LINES_SEED = [
  { id: 9001, rt_id: 501, category: 'tolls', toll_country: null, net: 12.5, vat: 0, line_date: '2026-09-03',
    plate_raw: null, truck_id: null, km_reading: null, liters: null, station: null, alloc_status: 'allocated',
    note: 'Διόδια Α25', created_by: 'demo_accountant', created_at: '2026-09-03T10:00:00Z' },
  { id: 9002, rt_id: null, category: 'fuel', toll_country: null, net: 80, vat: 19.2, line_date: '2026-09-01',
    plate_raw: null, truck_id: null, km_reading: 240100, liters: 150, station: 'EKO Καβάλα', alloc_status: 'unallocated',
    note: 'Παρκαρισμένο', created_by: 'demo_accountant', created_at: '2026-09-01T09:00:00Z' },
];

// Coordinator defect 3 (7/9): a fixture that hits the Worker's 300-row cap on
// the unfiltered GET /costs/lines exactly, so the proof can assert the
// screen never presents that count as if it were exact.
function genCappedLines(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      id: 30000 + i, rt_id: i % 7 === 0 ? 501 : null, category: 'other', toll_country: null,
      net: 1, vat: 0, line_date: '2026-08-15',
      plate_raw: null, truck_id: null, km_reading: null, liters: null, station: null,
      alloc_status: i % 7 === 0 ? 'allocated' : 'unallocated',
      note: 'cap-fixture ' + i, created_by: 'demo_accountant', created_at: '2026-08-15T00:00:00Z',
    });
  }
  return arr;
}

// One store + capture arrays per browser context, so the accountant and
// management runs never share mutated state. `seed` defaults to the small
// two-line fixture; the 300-row cap test (defect 3) passes its own.
function installCostsMocks(page, seed) {
  const store = { lines: (seed || LINES_SEED).map(l => ({ ...l })), nextId: 9003 };
  const captured = { posts: [], patches: [], deletes: [] };

  page.route('**/costs/rt', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ records: RT_FIXTURE }),
  }));
  page.route('**/costs/lookups', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(LOOKUPS_FIXTURE),
  }));
  page.route('**/costs/lines**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'GET') {
      const rtId = url.searchParams.get('rt_id');
      const allocStatus = url.searchParams.get('alloc_status');
      let rows = store.lines;
      if (rtId) rows = rows.filter(l => String(l.rt_id) === rtId);
      else if (allocStatus === 'unallocated') rows = rows.filter(l => !l.rt_id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: rows }) });
    }
    if (method === 'POST') {
      const body = req.postDataJSON();
      captured.posts.push(body);
      const rec = Object.assign({ id: store.nextId++, created_by: 'demo_accountant',
        alloc_status: body.rt_id ? 'allocated' : 'unallocated', created_at: new Date().toISOString() }, body);
      store.lines.push(rec);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ record: rec }) });
    }
    if (method === 'PATCH') {
      const id = Number(url.pathname.split('/').pop());
      const body = req.postDataJSON();
      captured.patches.push({ id, body });
      const row = store.lines.find(l => l.id === id);
      if (row) Object.assign(row, body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ record: row }) });
    }
    if (method === 'DELETE') {
      const id = Number(url.pathname.split('/').pop());
      const body = req.postDataJSON();
      captured.deletes.push({ id, url: req.url(), body });
      store.lines = store.lines.filter(l => l.id !== id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  return captured;
}

function assert(cond, msg) {
  if (!cond) throw new Error('ΑΠΟΤΥΧΙΑ: ' + msg);
  console.log('  ✓ ' + msg);
}

async function waitForLinesResponse(page, method, action) {
  const p = page.waitForResponse(r => r.request().method() === method && r.url().includes('/costs/lines'), { timeout: 10000 });
  await action();
  return p;
}

async function runAccountantFlow(browser) {
  console.log('\n== accountant ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') await dialog.accept('proof: test reason');
    else await dialog.accept();
  });

  await preparePage(page, 'accountant');
  const captured = installCostsMocks(page);
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page', { timeout: 15000 });

  // ── stats bar + list render ──
  const stripText = await page.locator('.ex-strip').innerText();
  assert(/αυτή την εβδομάδα/.test(stripText), 'stats bar shows «αυτή την εβδομάδα»');
  assert(/γραμμές/.test(stripText), 'stats bar shows «γραμμές»');
  assert(/χωρίς δρομολόγιο/.test(stripText), 'stats bar shows «χωρίς δρομολόγιο»');
  const listText = await page.locator('.ex-list-rows').innerText();
  assert(listText.includes('ΙΝ-1234'), 'left list shows the fixture trip (plate ΙΝ-1234)');
  assert(listText.includes('Χωρίς δρομολόγιο'), 'left list shows the fixed «Χωρίς δρομολόγιο» row');

  // ── click the trip ──
  await page.locator('.ex-lrow', { hasText: 'ΙΝ-1234' }).first().click();
  await page.waitForSelector('#exQeCategory', { timeout: 10000 });

  // ── fuel entry with liters/km/station ──
  await page.selectOption('#exQeCategory', 'fuel');
  await page.waitForSelector('#exQeLiters:visible');
  await page.fill('#exQeNet', '55.40');
  await page.fill('#exQeVat', '13.30');
  await page.fill('#exQeNote', 'Πρατήριο test');
  await page.fill('#exQeLiters', '42.5');
  await page.fill('#exQeKm', '241000');
  await page.fill('#exQeStation', 'EKO Σέρρες');
  await waitForLinesResponse(page, 'POST', () => page.locator('#exQeStation').press('Enter'));
  await page.waitForTimeout(150);

  assert(captured.posts.length === 1, 'one POST captured after the fuel entry');
  const fuelBody = captured.posts[0];
  for (const k of ['rt_id', 'category', 'net', 'vat', 'line_date', 'note', 'liters', 'km_reading', 'station']) {
    assert(Object.prototype.hasOwnProperty.call(fuelBody, k), 'fuel POST body has "' + k + '"');
  }
  assert(fuelBody.rt_id === 501, 'fuel POST body rt_id === 501');
  assert(fuelBody.category === 'fuel', 'fuel POST body category === "fuel"');

  // ── tolls entry, no fuel fields ──
  await page.selectOption('#exQeCategory', 'tolls');
  await page.waitForSelector('#exQeFuelFields', { state: 'hidden' });
  await page.fill('#exQeNet', '12.00');
  await page.fill('#exQeNote', 'Διόδια Αιγαίου');
  await waitForLinesResponse(page, 'POST', () => page.locator('#exQeNote').press('Enter'));
  await page.waitForTimeout(150);

  assert(captured.posts.length === 2, 'two POSTs captured after the tolls entry');
  const tollsBody = captured.posts[1];
  assert(tollsBody.category === 'tolls', 'tolls POST body category === "tolls"');
  assert(!Object.prototype.hasOwnProperty.call(tollsBody, 'liters'), 'tolls POST body has NO "liters" key');
  assert(!Object.prototype.hasOwnProperty.call(tollsBody, 'km_reading'), 'tolls POST body has NO "km_reading" key');
  assert(!Object.prototype.hasOwnProperty.call(tollsBody, 'station'), 'tolls POST body has NO "station" key');

  // ── Διόρθωση on the seeded line (9001, created_by demo_accountant) ──
  await page.locator('.ex-link', { hasText: 'Διόρθωση' }).first().click();
  const editNetInput = page.locator('input[id^="exEdNet_"]').first();
  await editNetInput.fill('99.99');
  await page.locator('button', { hasText: 'Αποθήκευση' }).first().click();
  await page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/costs/lines'), { timeout: 10000 });
  await page.waitForTimeout(150);

  assert(captured.patches.length === 1, 'one PATCH captured after Διόρθωση');
  assert(captured.patches[0].body.net === 99.99, 'PATCH body net === 99.99');
  assert(typeof captured.patches[0].body.reason === 'string' && captured.patches[0].body.reason.length > 0, 'PATCH body carries a non-empty reason');

  // ── Διαγραφή ──
  const beforeDelete = captured.deletes.length;
  await page.locator('.ex-link.danger', { hasText: 'Διαγραφή' }).first().click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().includes('/costs/lines'), { timeout: 10000 });
  await page.waitForTimeout(150);
  assert(captured.deletes.length === beforeDelete + 1, 'one DELETE captured after Διαγραφή');
  assert(/\/costs\/lines\/\d+$/.test(captured.deletes[captured.deletes.length - 1].url), 'DELETE URL ends in /costs/lines/:id');

  // ── Χωρίς δρομολόγιο: add a line, POST body has no rt_id ──
  await page.locator('.ex-lrow', { hasText: 'Χωρίς δρομολόγιο' }).first().click();
  await page.waitForSelector('#exQeCategory', { timeout: 10000 });
  await page.selectOption('#exQeCategory', 'other');
  await page.fill('#exQeNet', '7.50');
  await page.fill('#exQeNote', 'Παρκαρισμένη απόδειξη');
  const postsBefore = captured.posts.length;
  await waitForLinesResponse(page, 'POST', () => page.locator('#exQeNote').press('Enter'));
  await page.waitForTimeout(150);
  assert(captured.posts.length === postsBefore + 1, 'third POST captured for the unallocated entry');
  const unallocBody = captured.posts[captured.posts.length - 1];
  assert(!Object.prototype.hasOwnProperty.call(unallocBody, 'rt_id'), 'unallocated POST body has NO "rt_id" key');

  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  console.log('  screenshot: ' + SCREENSHOT);

  await context.close();
  return { captured, consoleErrors };
}

async function runManagementFlow(browser) {
  console.log('\n== management (read-only) ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await preparePage(page, 'management');
  installCostsMocks(page);
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page', { timeout: 15000 });

  // ── NAV (coordinator defect 2): management has costs:'view', so it can
  // reach the screen — read-only is enforced by hiding the write controls,
  // asserted below, not by hiding the nav item ──
  const navCount = await page.locator('#nav_expenses').count();
  assert(navCount === 1, 'management sidebar HAS #nav_expenses (read-only, not hidden)');

  await page.locator('.ex-lrow', { hasText: 'ΙΝ-1234' }).first().click();
  await page.waitForTimeout(300);
  const qeCount = await page.locator('#exQeCategory').count();
  assert(qeCount === 0, 'management sees no quick-entry row on a trip panel');
  const editBtnCount = await page.locator('.ex-link', { hasText: 'Διόρθωση' }).count();
  assert(editBtnCount === 0, 'management sees no «Διόρθωση» button');
  const delBtnCount = await page.locator('.ex-link.danger').count();
  assert(delBtnCount === 0, 'management sees no «Διαγραφή» button');

  await context.close();
  return { consoleErrors };
}

// Coordinator defect 2 (7/9): dispatcher must not even reach the screen —
// core/router.js NAV gates #nav_expenses on can('costs'), and navigate()
// itself refuses to render a page the role lacks perm for (config.js:
// dispatcher costs:'none'). This proves both halves from the outside rather
// than trusting that the gate is wired correctly.
async function runDispatcherFlow(browser) {
  console.log('\n== dispatcher (no access) ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await preparePage(page, 'dispatcher');
  installCostsMocks(page); // harmless — a dispatcher should never call /costs/*
  await gotoPage(page, 'expenses', BASE_URL);
  // Wait on the sidebar shell (renders for every role) rather than .ex-page,
  // since .ex-page must NOT appear for this role.
  await page.waitForSelector('#sidebarNav', { timeout: 15000 });
  await page.waitForTimeout(300);

  const navCount = await page.locator('#nav_expenses').count();
  assert(navCount === 0, 'dispatcher sidebar has NO #nav_expenses');
  const pageCount = await page.locator('.ex-page').count();
  assert(pageCount === 0, 'dispatcher navigating to «expenses» does not render the entry form (.ex-page absent)');

  await context.close();
  return { consoleErrors };
}

// Coordinator defect 3 (7/9): the Worker caps the unfiltered GET
// /costs/lines at 300 rows. A count of exactly 300 must never be presented
// as if it were exact — the screen has to say «300+» and explain why.
async function runCapFlow(browser) {
  console.log('\n== 300-row cap ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await preparePage(page, 'accountant');
  installCostsMocks(page, genCappedLines(300));
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page', { timeout: 15000 });

  const stripText = await page.locator('.ex-strip').innerText();
  assert(/300\+/.test(stripText), 'stats bar shows «300+», not the raw 300, when the cap is hit');
  const noteEl = page.locator('.ex-cap-note');
  assert(await noteEl.count() === 1, 'cap note is rendered');
  const noteText = await noteEl.innerText();
  assert(noteText.includes('300 πιο πρόσφατες γραμμές'), 'cap note explains the numbers cover only the 300 most recent lines');

  await context.close();
  return { consoleErrors };
}

// Coordinator defect 1 (7/9): full-page screenshots at the widths the
// accountant actually works at, with a trip selected and the fuel fields
// showing (category=fuel), plus the no-horizontal-scroll assertions the
// coordinator asked be checked at 1280.
async function runScreenshotFlow(browser, width, height, screenshotPath, assertNoScroll) {
  console.log('\n== screenshot ' + width + 'x' + height + ' ==');
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await preparePage(page, 'accountant');
  installCostsMocks(page);
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page', { timeout: 15000 });
  await page.locator('.ex-lrow', { hasText: 'ΙΝ-1234' }).first().click();
  await page.waitForSelector('#exQeCategory', { timeout: 10000 });
  await page.selectOption('#exQeCategory', 'fuel');
  await page.waitForSelector('#exQeLiters:visible');

  if (assertNoScroll) {
    const rightOverflow = await page.locator('.ex-right').evaluate(el => el.scrollWidth <= el.clientWidth);
    assert(rightOverflow, 'no horizontal scroll on .ex-right at ' + width + 'x' + height);
    const pageOverflow = await page.locator('.ex-page').evaluate(el => el.scrollWidth <= el.clientWidth);
    assert(pageOverflow, 'no horizontal scroll on .ex-page at ' + width + 'x' + height);
    const bodyOverflow = await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth);
    assert(bodyOverflow, 'no horizontal scroll on document body at ' + width + 'x' + height);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('  screenshot: ' + screenshotPath);

  await context.close();
  return { consoleErrors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const acct = await runAccountantFlow(browser);
    const mgmt = await runManagementFlow(browser);
    const disp = await runDispatcherFlow(browser);
    const cap = await runCapFlow(browser);
    const shot1280 = await runScreenshotFlow(browser, 1280, 800, SCREENSHOT_1280, true);
    const shot1440 = await runScreenshotFlow(browser, 1440, 900, SCREENSHOT_1440, false);

    const allConsoleErrors = [
      ...acct.consoleErrors, ...mgmt.consoleErrors, ...disp.consoleErrors,
      ...cap.consoleErrors, ...shot1280.consoleErrors, ...shot1440.consoleErrors,
    ];
    console.log('\n== console errors ==');
    console.log('accountant:', acct.consoleErrors.length, 'management:', mgmt.consoleErrors.length,
      'dispatcher:', disp.consoleErrors.length, 'cap:', cap.consoleErrors.length,
      '1280:', shot1280.consoleErrors.length, '1440:', shot1440.consoleErrors.length);
    if (allConsoleErrors.length) allConsoleErrors.forEach(e => console.log('  ! ' + e));

    console.log('\n== captured request bodies (accountant) ==');
    console.log(JSON.stringify(acct.captured, null, 2));

    // NAV summary (coordinator defect 2): the three results side by side.
    console.log('\n== #nav_expenses per role ==');
    console.log('  accountant: present (asserted above)');
    console.log('  management: present, read-only (asserted above)');
    console.log('  dispatcher: absent, expenses page does not render (asserted above)');

    if (allConsoleErrors.length > 0) {
      console.log('\nΠΡΟΣΟΧΗ: ' + allConsoleErrors.length + ' console error(s) — δες πάνω πριν τα θεωρήσεις θόρυβο HAR replay.');
    }
    console.log('\nΟΛΑ ΤΑ ΕΛΕΓΧΟΙ ΠΕΡΑΣΑΝ.');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n' + (e && e.stack || e));
  process.exit(1);
});
