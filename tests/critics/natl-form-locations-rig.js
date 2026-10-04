// Proof rig — P1 4/10 (live, owner's Chrome, main 54be60af): a national order
// form opened straight from the Weekly National on a fresh page offered NO
// location suggestions. The pickers search core/form-helpers.js
// _fhLocationsArr, which only fhLoadLocations() fills, and nothing on that
// page called it. Each case is a fresh page that never visits the Orders page:
//   A. #weekly_natl → the board's «+ Νέα παραγγελία» → type «Ver» in «Σημείο
//      φόρτωσης» and in «Τοποθεσία παράδοσης» → ≥1 suggestion in each.
//   B. #weekly_natl → edit an existing national order (openNatlEdit, as the
//      board's row click does) → the stored pickup shows its NAME, not blank.
//   C. the locations read fails / returns nothing → the form does NOT open
//      and a visible danger toast says why (an empty picker would look
//      exactly like «no results»).
//   D. guard: #weekly_intl → «+ Νέα παραγγελία» (international) → «Ver» → ≥1.
// Backend: fully stubbed (see fresh()) — an empty week, a 3-row LOCATIONS
// table and the one edited order — so the result never depends on the 28/8
// recording. tests/critics/auth.js supplies only the session + page bridge.
// Run from a checkout root that has node_modules + .har (symlinks are fine):
//   PW_BASE_URL=http://127.0.0.1:<port>/ node tests/critics/natl-form-locations-rig.js
// Exit 1 on any ✗ (main 54be60af: A and B fail; the fix: all pass).
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { LOC: 'tblxu8DRfTQOFRCzS', NO: 'tblGHCCsTMqAy4KR2' };
const LOCS = [
  { id: 'recLocVeroiaCD', createdTime: '', fields: { Name: 'CROSS-DOCK', City: 'Veroia', Country: 'GR' } },
  { id: 'recLocAthens',   createdTime: '', fields: { Name: 'Central Market', City: 'Athens', Country: 'GR' } },
  { id: 'recLocSofia',    createdTime: '', fields: { Name: 'Depot', City: 'Sofia', Country: 'BG' } },
];
const EDIT_NO = { id: 'recNOrigEdit', createdTime: '', fields: {
  Direction: 'North→South', Type: 'Independent',
  'Pickup Location 1': ['recLocVeroiaCD'], 'Delivery Location 1': ['recLocAthens'],
  'Loading DateTime': '2026-10-05', 'Delivery DateTime': '2026-10-06', 'Pallets': 10,
} };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const J = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function fresh(route, locMode) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await preparePage(page, 'owner');
  const state = { locMode: 'ok', locReads: 0 };
  // Registered after preparePage → matched first, and it answers EVERY backend
  // call (never falls back): the 28/8 recording no longer matches today's
  // reference read (truck expiry fields) or the current week's filters, and an
  // aborted read leaves the board on «δεν φορτώθηκε» with no buttons. An empty
  // week is all these cases need; only LOCATIONS and the edited order carry data.
  await page.route(`**/${HOST}/**`, async r => {
    const req = r.request(); const u = new URL(req.url());
    const m = u.pathname.match(/\/v0\/[^/]+\/([^/]+)(?:\/([^/]+))?$/);
    if (req.method() !== 'GET' || !m) return J(r, 200, {});   // app-errors, auth, … — nothing here saves
    const [, table, rec] = m;
    if (table === T.LOC) {
      state.locReads++;
      if (state.locMode === 'error') return J(r, 200, { error: { type: 'STUB', message: 'stub: locations read failed' } });
      if (state.locMode === 'empty') return J(r, 200, { records: [] });
      return J(r, 200, { records: LOCS });
    }
    if (table === T.NO && rec === EDIT_NO.id) return J(r, 200, EDIT_NO);
    if (rec) return J(r, 404, { error: { type: 'NOT_FOUND', message: 'stub' } });
    return J(r, 200, { records: [] });
  });
  await gotoPage(page, route, BASE);
  await page.waitForFunction(() => typeof window.openNatlEdit === 'function' && typeof window.openIntlCreate === 'function', null, { timeout: 30000 });
  await page.waitForSelector('.btn-new-order', { timeout: 30000 });
  // Let the reference revalidate (api.js, +1.5s after the preload) land first:
  // it re-reads LOCATIONS, which would blur «did the FORM ask for them» in C.
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.__toasts = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push([String(m), k || '']); return t0 && t0(m, k); };
  });
  if (locMode) state.locMode = locMode;
  return { browser, page, state };
}

async function suggestions(page, inputSel) {
  const input = page.locator(inputSel).first();
  await input.click();
  await input.fill('');
  await input.type('Ver', { delay: 30 });
  const dropSel = '#' + (await input.getAttribute('id')) + '_d';
  await page.waitForTimeout(300);
  return page.$$eval(dropSel + ' .linked-drop-item', els => els.map(e => e.textContent.trim()));
}
const modalOpen = page => page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open'));

(async () => {
  console.log('BASE ' + BASE);

  console.log('\n── A. Weekly National → «+ Νέα παραγγελία» → «Ver»');
  {
    const { browser, page } = await fresh('weekly_natl');
    ok(await page.evaluate(() => _fhLocationsArr.length === 0), 'precondition: fresh page, the shared picker list is still empty');
    await page.click('.btn-new-order');
    await page.waitForSelector('#ls_npickup', { timeout: 15000 });
    const pick = await suggestions(page, '#ls_npickup');
    ok(pick.length >= 1, `«Σημείο φόρτωσης»: ${pick.length} suggestion(s) ${JSON.stringify(pick)}`);
    const del = await suggestions(page, '#nf_simple input[id^="ls_nsl"]');
    ok(del.length >= 1, `«Τοποθεσία παράδοσης»: ${del.length} suggestion(s) ${JSON.stringify(del)}`);
    await browser.close();
  }

  console.log('\n── B. Weekly National → edit an order (row click path) → stored pickup shows its name');
  {
    const { browser, page } = await fresh('weekly_natl');
    await page.evaluate(id => openNatlEdit(id), EDIT_NO.id);
    await page.waitForSelector('#ls_npickup', { timeout: 15000 });
    const v = await page.$eval('#ls_npickup', el => el.value);
    const hid = await page.$eval('#lv_npickup', el => el.value);
    ok(/CROSS-DOCK/.test(v) && hid === 'recLocVeroiaCD', `pickup label «${v}» (id ${hid})`);
    await browser.close();
  }

  for (const mode of ['error', 'empty']) {
    console.log(`\n── C. locations read ${mode === 'error' ? 'FAILS' : 'returns 0 records'} → form refused, said`);
    const { browser, page, state } = await fresh('weekly_natl', mode);
    // The page's reference preload (and the api.js caches) already hold the
    // locations; drop them — as a location edit does — so the form must read
    // them (the cold case this guard is for).
    await page.evaluate(() => invalidateCache(TABLES.LOCATIONS));
    const before = state.locReads;
    await page.click('.btn-new-order');
    await page.waitForTimeout(1500);
    ok(state.locReads > before, `the form asked for locations (${state.locReads - before} read(s))`);
    ok(!(await modalOpen(page)) && !(await page.$('#ls_npickup')), 'no form with an empty picker');
    const t = await page.evaluate(() => window.__toasts);
    ok(t.some(([m, k]) => k === 'danger' && /τοποθεσίες δεν φορτώθηκαν/i.test(m)), 'visible danger toast: ' + JSON.stringify(t));
    await browser.close();
  }

  console.log('\n── D. guard: Weekly International → «+ Νέα παραγγελία» → «Ver»');
  {
    const { browser, page } = await fresh('weekly_intl');
    await page.click('.btn-new-order');
    await page.waitForSelector('#modal input[placeholder="Search location..."]', { timeout: 15000 });
    const s = await suggestions(page, '#modal input[placeholder="Search location..."]');
    ok(s.length >= 1, `international loading location: ${s.length} suggestion(s) ${JSON.stringify(s)}`);
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
