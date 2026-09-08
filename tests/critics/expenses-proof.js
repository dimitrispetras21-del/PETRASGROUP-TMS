// Proof script for the «Έξοδα Δρομολογίων» screen, v3 weekly sheet
// (modules/expenses.js, owner 8/9/2026 «πάμε με το Α»).
// Spec §6: docs/superpowers/specs/2026-09-07-trip-expenses-design.md.
//
// Run from the MAIN repo:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8791/ node tests/critics/expenses-proof.js
//
// A local `python3 -m http.server` must already be serving the repo root on
// PW_BASE_URL's port (started/stopped by the caller, not by this script).
//
// It reuses tests/critics/auth.js (preparePage/gotoPage — fake session + HAR
// replay for the Worker host). /costs/* is mocked on top with page.route,
// registered AFTER preparePage so it wins over the HAR replay route.
//
// What this proves (the five questions of CLAUDE.md, per action):
//   GET /costs/rt?from&to   → ct_round_trips filtered by date_start — ONLY the
//                              strip window is fetched, never the whole history
//   GET /costs/lines?rt_id= → one per week trip; alloc_status=unallocated once;
//                              never the unfiltered 300-row snapshot
//   POST /costs/lines       → ct_cost_lines row with rt_id + category of the
//                              opened cell (+ liters/km_reading/station for fuel)
//   PATCH/DELETE            → carry the mandatory `reason`
//   roles                   → accountant writes, management reads, dispatcher
//                              has no nav item and no page

const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8791/';
const SHOT_DIR = process.env.PW_SHOT_DIR || '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-keen-hamilton-ab77a6/caa94f70-bf92-45c5-98d4-ff74de01e316/scratchpad';
const SCREENSHOT_1440 = path.join(SHOT_DIR, 'expenses-v3-1440.png');
const SCREENSHOT_1280 = path.join(SHOT_DIR, 'expenses-v3-1280.png');
const SCREENSHOT_PNL_1440 = path.join(SHOT_DIR, 'pnl-v2-1440.png');

// ── Fixtures — planning week 37 = Σάβ 2026-09-05 → Παρ 2026-09-11 (ctWeekOf in
// modules/costs.js); RT 704 sits in week 36 (2026-08-31, Δευ) and must stay
// out of the week-37 sheet while still counting on the strip. The proof pins
// the week with exGoWeek('2026-09-05') so it does not depend on the run date.
const WEEK_START = '2026-09-05';
const LOOKUPS_FIXTURE = {
  trucks: [
    { id: 11, legacy_id: null, license_plate: 'ΘΕ-2001', active: true },
    { id: 12, legacy_id: null, license_plate: 'ΘΕ-2002', active: true },
    { id: 14, legacy_id: null, license_plate: 'ΘΕ-2004', active: true },
  ],
  trailers: [],
  drivers: [{ id: 11, legacy_id: null, full_name: 'Νίκος Οδηγός', active: true }],
  partners: [{ id: 1, legacy_id: null, company_name: 'Meta-Cargo ΕΠΕ', active: true }],
};
const rt = (o) => Object.assign({ code: null, scope: 'INTL', trip_type: 'OWNED', trailer_id: null, partner_id: null, route_legs: null, ct_rt_legs: [] }, o);
const RT_FIXTURE = [
  rt({ id: 701, truck_id: 11, driver_id: 11, date_start: '2026-09-05', date_end: '2026-09-09', status: 'closed', route_text: 'Βέροια → Rotterdam', route_legs: [
    { dir: 'EXPORT', load: '2026-09-05', deliv: '2026-09-07', extra_stops: 0, from: { name: 'Medifresh SA', city: 'Petrea', country: 'Greece' }, to: { name: 'Albert Heijn BV', city: 'Rotterdam', country: 'Netherlands' } },
    { dir: 'IMPORT', load: '2026-09-08', deliv: '2026-09-09', extra_stops: 1, from: { name: 'Obst Stelzer GmbH', city: 'Stubenberg', country: 'Austria' }, to: { name: 'Kaufland Stryama', city: 'Stryama', country: 'Bulgaria' } } ] }),
  rt({ id: 702, truck_id: 12, driver_id: 11, date_start: '2026-09-06', date_end: '2026-09-08', status: 'closed', route_text: 'Νάουσα → Wien' }),
  rt({ id: 703, truck_id: null, driver_id: null, partner_id: 1, trip_type: 'PARTNER', date_start: '2026-09-08', date_end: '2026-09-10', status: 'in_progress', route_text: 'Σόφια → Βέροια' }),
  rt({ id: 704, truck_id: 14, driver_id: 11, date_start: '2026-08-31', date_end: '2026-09-01', status: 'closed', route_text: 'Καβάλα → Σόφια' }),
];
const line = (o) => Object.assign({ toll_country: null, plate_raw: null, truck_id: null, km_reading: null, liters: null, station: null, doc_id: null, note: null, created_by: 'demo_accountant', created_at: '2026-09-06T09:00:00Z' }, o);
const LINES_FIXTURE = [
  line({ id: 9101, rt_id: 701, category: 'fuel', net: 100, vat: 24, line_date: '2026-09-05', alloc_status: 'allocated', note: 'Α' }),
  line({ id: 9102, rt_id: 701, category: 'tolls', net: 30, vat: 0, line_date: '2026-09-06', alloc_status: 'allocated', doc_id: 5, note: 'DKV BOX' }),
  line({ id: 9103, rt_id: 702, category: 'tolls', net: 12.5, vat: 0, line_date: '2026-09-07', alloc_status: 'allocated', note: 'Β' }),
  line({ id: 9104, rt_id: 704, category: 'fuel', net: 200, vat: 48, line_date: '2026-08-31', alloc_status: 'allocated', note: 'παλιό' }),
  line({ id: 9201, rt_id: null, category: 'fuel', net: 80, vat: 19.2, line_date: '2026-09-07', alloc_status: 'unallocated', note: 'Παρκαρισμένο', liters: 150, km_reading: 240100, station: 'EKO Καβάλα' }),
  line({ id: 9202, rt_id: null, category: 'tolls', net: 5, vat: 0, line_date: '2026-08-20', alloc_status: 'unallocated', note: 'εκτός εβδομάδας' }),
];

function installCostsMocks(page, fx) {
  const store = { lines: fx.lines.map(l => ({ ...l })), nextId: 20000 };
  const captured = { rtGets: [], lineGets: [], posts: [], patches: [], deletes: [], pnlGets: 0 };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  page.route('**/costs/rt**', route => {
    const url = new URL(route.request().url());
    captured.rtGets.push(url.search);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const rows = fx.rt.filter(r => (!from || r.date_start >= from) && (!to || r.date_start <= to));
    return json(route, { records: rows });
  });
  page.route('**/costs/lookups', route => json(route, fx.lookups));
  page.route('**/costs/import/docs**', route => json(route, { records: [] }));
  page.route('**/costs/pallet-gate', route => json(route, { records: [] }));
  page.route('**/tblgHlNmLBH3JTdIM**', route => json(route, { records: [] }));
  page.route('**/pallets/gate**', route => json(route, { records: [] }));
  page.route('**/tblEAPExIAjiA3asD**', route => json(route, { records: [] }));
  page.route('**/costs/pnl', route => { captured.pnlGets++; return json(route, { records: fx.pnl || [] }); });
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

// Pin the sheet to week 37 and wait until its rows are painted.
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

async function runAccountantFlow(browser) {
  console.log('\n== accountant · εβδομαδιαίο φύλλο ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant');
  const captured = installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-wkstrip', { timeout: 15000 });
  await openWeek(page, WEEK_START);

  // ── fetch shape: the week window, not the history ──
  const lastRt = captured.rtGets[captured.rtGets.length - 1];
  assert(/from=2026-08-08/.test(lastRt) && /to=2026-09-25/.test(lastRt), 'GET /costs/rt carries from/to = the 7-week strip window (2026-08-08 → 2026-09-25), never an unfiltered call: ' + lastRt);
  assert(captured.rtGets.every(q => /from=/.test(q) && /to=/.test(q)), 'every /costs/rt call so far was date-bounded');
  const weekGets = captured.lineGets.slice(-4);
  assert(weekGets.filter(q => /rt_id=70[123]$/.test(q)).length === 3, 'GET /costs/lines?rt_id= issued once per week trip (701, 702, 703) — not for 704 (week 36)');
  assert(captured.lineGets.every(q => q.length > 0), 'no unfiltered GET /costs/lines (the 300-row snapshot is gone)');

  // ── strip ──
  const chips = page.locator('.ex-wk');
  assert(await chips.count() === 7, 'week strip shows 7 weeks (4 back, selected, 2 forward)');
  const selText = await page.locator('.ex-wk.sel').innerText();
  assert(/Εβδ\. 37/.test(selText) && /05–11\/09/.test(selText), 'selected chip = Εβδ. 37 · 05–11/09: ' + selText.replace(/\n/g, ' '));
  assert(/1 ελλείψεις/.test(selText), 'selected chip carries the gap count (1 ελλείψεις)');
  const w36 = await page.locator('.ex-wk', { hasText: 'Εβδ. 36' }).innerText();
  assert(/1 δρομ\./.test(w36), 'week 36 chip counts its one trip (RT 704) from the same fetch');
  assert(/Εβδομάδα 37/.test(await page.locator('.ex-title').innerText()), 'title names the week');
  assert(/05\/09\/2026 – 11\/09\/2026/.test(await page.locator('.ex-sub').innerText()), 'subtitle gives the full period dd/mm/yyyy');

  // ── rows ──
  assert(await page.locator('.ex-gr[data-rt]:not(.none-row)').count() === 3, 'three trip rows for week 37');
  const gridText = await page.locator('.ex-grid').innerText();
  assert(!gridText.includes('ΘΕ-2004'), 'RT 704 (week 36) is NOT on the week-37 sheet');
  assert(gridText.includes('ΘΕ-2001') && gridText.includes('ΘΕ-2002') && gridText.includes('Meta-Cargo ΕΠΕ'), 'own trucks by plate, partner trip by partner name');
  // A2 (owner 8/9): the payroll leg block under each trip, route_text only as fallback
  const legs701 = page.locator('.ex-trip[data-trip="701"] .ex-legs .rt-legs');
  assert(await legs701.count() === 1 && await legs701.locator('.rt-dir').count() === 2, '701 shows the shared leg block (rtLegBlockHtml) with 2 legs under the amounts row');
  const legsText = (await legs701.innerText()).replace(/\s+/g, ' ');
  assert(/↗ 05\/09 MEDIFRESH SA Petrea, Ελλάδα → 07\/09 ALBERT HEIJN BV Rotterdam, Κάτω Χώρες/.test(legsText), 'leg 1 = ↗ load 05/09 MEDIFRESH SA (Petrea, Ελλάδα) → deliv 07/09 ALBERT HEIJN BV — the payroll format verbatim: ' + legsText);
  assert(/\+1 στάση/.test(legsText), 'extra stop rendered as «+1 στάση», same as payroll');
  assert(await page.locator('.ex-trip[data-trip="702"] .ex-legs .rt-legs').count() === 0 && (await page.locator('.ex-trip[data-trip="702"] .ex-legs').innerText()).includes('Νάουσα → Wien'), '702 has no legs → route_text fallback line');
  assert(await page.locator('.ex-trip[data-trip="703"] .ex-legs').count() === 1, 'partner trip 703 shows its route_text line too');
  assert((await page.locator('.ex-gr[data-rt="701"] > div').nth(3).innerText()).trim() === '05–09/09', 'dates as one line dd–dd/mm (05–09/09)');
  assert((await page.locator('.ex-gr[data-rt="703"] > div').nth(3).innerText()).trim() === '08–10/09', 'partner trip dates 08–10/09');
  assert((await cell(page, 701, 'adblue').innerText()).trim() === '', 'empty cell is blank, not a dash');
  assert((await page.locator('.ex-gr[data-rt="703"] > div').nth(10).innerText()).trim() === '', 'trip without lines has a blank total, not 0,00');
  assert((await page.locator('.ex-gr[data-rt="703"]').innerText()).includes('Συνεργάτης'), 'partner trip row says «Συνεργάτης» instead of a plate');

  // ── cells ──
  assert((await cell(page, 701, 'fuel').innerText()).replace(/\s+/g, ' ') === '100,00 1 γρ.', '701/Καύσιμα cell = 100,00 · 1 γρ.');
  assert((await cell(page, 701, 'tolls').innerText()).replace(/\s+/g, ' ') === '30,00 1 γρ. · DKV', '701/Διόδια cell marks the imported line (· DKV via doc_id)');
  assert(await cell(page, 702, 'fuel').evaluate(el => el.classList.contains('missing')) && /λείπει/.test(await cell(page, 702, 'fuel').innerText()), '702 (closed, own truck, no fuel line) shows «λείπει» in Καύσιμα');
  assert(!(await cell(page, 703, 'partner').evaluate(el => el.classList.contains('missing'))), '703 (in progress) never claims «λείπει» — an open trip has not happened yet');
  const st = async id => (await page.locator(`.ex-gr[data-rt="${id}"] .ex-st`).innerText()).trim();
  assert(await st(701) === 'Πλήρες', '701 status Πλήρες');
  assert(await st(702) === 'Ελλείψεις', '702 status Ελλείψεις');
  assert(await st(703) === 'Σε εξέλιξη', '703 status Σε εξέλιξη');
  const total701 = await page.locator('.ex-gr[data-rt="701"] > div').nth(10).innerText();
  assert(total701.trim() === '130,00', '701 row total = 130,00 (net, 100 + 30)');

  // ── summary ──
  const sum = (await page.locator('.ex-sum').innerText()).replace(/\s+/g, ' ');
  assert(/Δρομολόγια 3/.test(sum) && /Πλήρη 1/.test(sum) && /Με ελλείψεις 1/.test(sum) && /Σε εξέλιξη 1/.test(sum), 'summary counts 3 / 1 / 1 / 1');
  assert(/Γραμμές 4/.test(sum), 'summary lines = 3 trip lines + 1 unallocated in week = 4');
  assert(/Καθαρή αξία 222,50 €/.test(sum) && /Φ\.Π\.Α\. 43,20 €/.test(sum) && /Μικτή αξία εβδομάδας 265,70 €/.test(sum), 'summary net 222,50 · vat 43,20 · gross 265,70 (week lines only, 704 and 9202 excluded)');
  assert(/1 δρομολόγιο με ελλείψεις/.test(sum) && /1 γραμμές χωρίς δρομολόγιο/.test(sum) && /1 χωρίς δρομολόγιο εκτός εβδομάδας/.test(sum), 'pending text names gaps, in-week unallocated and out-of-week unallocated');

  // ── «Χωρίς δρομολόγιο» row ──
  const noneRow = page.locator('.ex-gr.none-row');
  assert(await noneRow.count() === 1 && /1 προς ανάθεση/.test(await noneRow.innerText()), '«Χωρίς δρομολόγιο» row shows the one in-week unallocated line');
  assert(await noneRow.locator('.ex-st.att').count() === 2, 'none row is marked (att) only while it has lines');
  assert((await cell(page, 'none', 'fuel').innerText()).replace(/\s+/g, ' ') === '80,00 1 γρ.', 'none/Καύσιμα cell = 80,00 (line 9201)');

  // ── open a cell → inline entry with the group preselected ──
  await cell(page, 702, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="702"]', { timeout: 5000 });
  assert(await page.locator('#exQeCategory').inputValue() === 'fuel', 'opened cell preselects category fuel');
  assert(await page.locator('#exQeDate').inputValue() === '2026-09-06', 'date defaults to the trip start (2026-09-06)');
  assert(await page.locator('#exQeLiters').isVisible(), 'fuel fields visible for a fuel cell');
  assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'exQeNet', 'focus lands on the net amount');
  assert(await cell(page, 702, 'fuel').evaluate(el => el.classList.contains('open')), 'the opened cell is framed');
  await page.fill('#exQeNet', '55.40'); await page.fill('#exQeVat', '13.30'); await page.fill('#exQeNote', 'Πρατήριο test');
  await page.fill('#exQeLiters', '42.5'); await page.fill('#exQeKm', '241000'); await page.fill('#exQeStation', 'EKO Σέρρες');
  await waitLines(page, 'POST', () => page.locator('#exQeStation').press('Enter'));
  assert(captured.posts.length === 1, 'one POST /costs/lines captured');
  const b1 = captured.posts[0];
  assert(b1.rt_id === 702 && b1.category === 'fuel' && b1.line_date === '2026-09-06', 'POST body: rt_id 702 · category fuel · line_date 2026-09-06 (the opened cell, not a picker)');
  assert(b1.net === 55.4 && b1.vat === 13.3 && b1.note === 'Πρατήριο test', 'POST body: net/vat/note');
  assert(b1.liters === 42.5 && b1.km_reading === 241000 && b1.station === 'EKO Σέρρες', 'POST body: liters/km_reading/station for fuel');
  await page.waitForSelector('.ex-gp[data-panel="702"]', { timeout: 5000 });
  assert(!(await cell(page, 702, 'fuel').evaluate(el => el.classList.contains('missing'))) && /55,40/.test(await cell(page, 702, 'fuel').innerText()), 'after save the cell reads 55,40 — refetched, not locally added');
  assert(await st(702) === 'Πλήρες', '702 status flips to Πλήρες once fuel exists');
  assert(await page.locator('#exQeNet').inputValue() === '', 'net cleared, cell still open for the next receipt');

  // ── same open cell, other category → no fuel fields in the body ──
  await page.selectOption('#exQeCategory', 'fines');
  await page.fill('#exQeNet', '12');
  await waitLines(page, 'POST', () => page.locator('#exQeNet').press('Enter'));
  const b2 = captured.posts[1];
  assert(b2.category === 'fines' && b2.rt_id === 702 && !('liters' in b2) && !('station' in b2), 'second POST: category changed in the select, no fuel fields');
  assert(/12,00/.test(await cell(page, 702, 'other').innerText()), 'a «fines» line lands in the Λοιπά column');

  // ── Esc closes ──
  await page.locator('#exQeNet').press('Escape');
  assert(await page.locator('.ex-gp').count() === 0, 'Esc closes the open cell');

  // ── existing lines: edit + delete inside the panel ──
  await cell(page, 701, 'tolls').click();
  await page.waitForSelector('.ex-gp[data-panel="701"] .ex-row[data-line="9102"]', { timeout: 5000 });
  assert(await page.locator('.ex-gp .ex-row[data-line]').count() === 1, 'panel lists only the group’s lines (1 tolls line, not the fuel one)');
  assert(/DKV/.test(await page.locator('.ex-row[data-line="9102"]').innerText()), 'imported line is labelled DKV in the panel');
  await page.locator('.ex-row[data-line="9102"] .ex-link', { hasText: 'Διόρθωση' }).click();
  await page.fill('#exEdNet_9102', '31');
  await waitLines(page, 'PATCH', () => page.locator('.ex-row.edit button', { hasText: 'Αποθήκευση' }).click());
  assert(captured.patches.length === 1 && captured.patches[0].id === 9102 && captured.patches[0].body.net === 31 && captured.patches[0].body.reason === 'proof: test reason', 'PATCH /costs/lines/9102 with net 31 and the mandatory reason');
  assert(/31,00/.test(await cell(page, 701, 'tolls').innerText()), 'cell reflects the corrected amount');
  await waitLines(page, 'DELETE', () => page.locator('.ex-row[data-line="9102"] .ex-link.danger').click());
  assert(captured.deletes.length === 1 && captured.deletes[0].id === 9102 && captured.deletes[0].body.reason === 'proof: test reason', 'DELETE /costs/lines/9102 with reason');
  assert(await cell(page, 701, 'tolls').evaluate(el => el.classList.contains('missing')), 'deleting the only tolls line of a closed trip makes Διόδια «λείπει» again');

  // ── unallocated line: assign to a WEEK trip only ──
  await cell(page, 'none', 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="none"] .ex-row[data-line="9201"]', { timeout: 5000 });
  const optVals = await page.locator('.ex-row[data-line="9201"] select.ex-assign option').evaluateAll(os => os.map(o => o.value));
  assert(optVals.join(',') === ',701,702,703', 'assignment picker offers ONLY the week’s trips (701, 702, 703) — not 704, not history');
  await waitLines(page, 'PATCH', () => page.selectOption('.ex-row[data-line="9201"] select.ex-assign', '701'));
  const asg = captured.patches[1];
  assert(asg.id === 9201 && asg.body.rt_id === 701 && asg.body.reason === 'proof: test reason', 'assignment = PATCH rt_id 701 with reason');
  assert(/180,00/.test(await cell(page, 701, 'fuel').innerText()), '701/Καύσιμα now 180,00 (100 + the assigned 80)');
  assert(/καμία γραμμή/.test(await noneRow.innerText()) && await noneRow.locator('.ex-st.att').count() === 0, '«Χωρίς δρομολόγιο» row is empty and neutral (no att colour) after the assignment');

  // ── search ──
  await page.fill('.ex-search', '2001');
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-gr[data-rt]:not(.none-row)').count() === 1, 'search by plate narrows the sheet to one row');
  await page.fill('.ex-search', 'kaufland');
  await page.waitForTimeout(100);
  assert(await page.locator('.ex-gr[data-rt]:not(.none-row)').count() === 1 && await page.locator('.ex-gr[data-rt="701"]').count() === 1, 'search by client name on a leg (kaufland → 701)');
  await page.fill('.ex-search', '');

  // ── week navigation ──
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/costs/rt') && r.url().includes('from=2026-08-01'), { timeout: 10000 }),
    page.locator('.ex-wk', { hasText: 'Εβδ. 36' }).click(),
  ]);
  await page.waitForSelector('.ex-gr[data-rt="704"]', { timeout: 10000 });
  assert(/Εβδ\. 36/.test(await page.locator('.ex-wk.sel').innerText()), 'clicking a chip selects week 36');
  assert(await page.locator('.ex-gr[data-rt]:not(.none-row)').count() === 1 && (await page.locator('.ex-grid').innerText()).includes('ΘΕ-2004'), 'week 36 sheet shows only RT 704');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/costs/rt') && r.url().includes('from=2026-08-08'), { timeout: 10000 }),
    page.locator('.ex-wkarrow').last().click(),
  ]);
  await page.waitForSelector('.ex-gr[data-rt="701"]', { timeout: 10000 });
  assert(/Εβδ\. 37/.test(await page.locator('.ex-wk.sel').innerText()), '› arrow returns to week 37');

  await page.screenshot({ path: SCREENSHOT_1440, fullPage: true });
  console.log('  screenshot: ' + SCREENSHOT_1440);
  await context.close();
  return { consoleErrors, captured };
}

async function runScreenshot1280(browser) {
  console.log('\n== screenshot 1280 with an open cell ==');
  const { context, page, consoleErrors } = await newPage(browser, 'accountant', { width: 1280, height: 800 });
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-wkstrip', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  await cell(page, 701, 'fuel').click();
  await page.waitForSelector('.ex-gp[data-panel="701"]', { timeout: 5000 });
  const pageScrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(pageScrollX <= 0, 'at 1280px the PAGE never scrolls sideways (the sheet card scrolls inside itself if it must)');
  await page.screenshot({ path: SCREENSHOT_1280, fullPage: true });
  console.log('  screenshot: ' + SCREENSHOT_1280);
  await context.close();
  return { consoleErrors };
}

async function runManagementFlow(browser) {
  console.log('\n== management (read-only) ==');
  const { context, page, consoleErrors } = await newPage(browser, 'management');
  installCostsMocks(page, { rt: RT_FIXTURE, lookups: LOOKUPS_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page .ex-wkstrip', { timeout: 15000 });
  await openWeek(page, WEEK_START);
  assert(await page.locator('#nav_expenses').count() === 1, 'management: #nav_expenses present');
  assert(await page.locator('.ex-cell.can').count() === 0, 'management: no clickable cells');
  await cell(page, 701, 'fuel').click({ force: true });
  await page.waitForTimeout(150);
  assert(await page.locator('#exQeCategory').count() === 0 && await page.locator('.ex-gp').count() === 0, 'management: clicking a cell opens nothing');
  assert(await page.locator('.ex-btn', { hasText: 'Εισαγωγή DKV' }).count() === 0, 'management: no «Εισαγωγή DKV» button');
  assert(/Δρομολόγια 3/.test((await page.locator('.ex-sum').innerText()).replace(/\s+/g, ' ')), 'management: still sees the week summary');
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

// ── TRIP PnL (modules/costs.js, untouched by v3): week grouping + the shared
// modal door still work with the same fixtures shaped as two planning weeks.
const PNL_FIXTURE = [
  { id: 701, code: 'RT-701', scope: 'INTL', trip_type: 'OWNED', truck_id: 11, driver_id: 11, partner_id: null, date_start: '2026-09-05', date_end: '2026-09-09', status: 'closed', total_km: 500,
    revenue: 1000, cost_gross: 154, cost_net: 130, cost_vat: 24, profit_worst: 846, margin_worst_pct: 84.6, profit_ex_vat: 870, margin_ex_vat_pct: 87.0, dl_trip_value: 0, dl_expenses: 0, driver_pay_missing: false, driver_pay_pending: false },
  { id: 704, code: 'RT-704', scope: 'INTL', trip_type: 'OWNED', truck_id: 14, driver_id: 11, partner_id: null, date_start: '2026-08-31', date_end: '2026-09-01', status: 'closed', total_km: 300,
    revenue: 500, cost_gross: 248, cost_net: 200, cost_vat: 48, profit_worst: 252, margin_worst_pct: 50.4, profit_ex_vat: 300, margin_ex_vat_pct: 60.0, dl_trip_value: 0, dl_expenses: 0, driver_pay_missing: false, driver_pay_pending: false },
];
async function runPnlFlow(browser) {
  console.log('\n== TRIP PnL (owner): week grouping + shared modal ==');
  const { context, page, consoleErrors } = await newPage(browser, 'owner');
  const captured = installCostsMocks(page, { rt: RT_FIXTURE.filter(r => [701, 704].includes(r.id)), lookups: LOOKUPS_FIXTURE, pnl: PNL_FIXTURE, lines: LINES_FIXTURE });
  await gotoPage(page, 'costs', BASE_URL);
  await page.waitForSelector('.ct-wkhead', { timeout: 15000 });
  const headers = page.locator('.ct-wkhead');
  assert(await headers.count() === 2, 'TRIP PnL: two week headers for the two-week fixture');
  assert(await page.locator('.ct-card').count() === 2, 'TRIP PnL: both trip cards visible');
  await page.locator('.ct-card', { hasText: 'ΘΕ-2001' }).first().click();
  await page.waitForSelector('.ct-panel.open', { timeout: 10000 });
  await page.locator('.ct-panel button', { hasText: 'Καταχώρηση κόστους' }).click();
  await page.waitForSelector('.ex-modal-box', { timeout: 10000 });
  await page.selectOption('#exMdCategory', 'fuel');
  await page.waitForSelector('#exMdFuelFields', { state: 'visible' });
  await page.fill('#exMdNet', '44.00'); await page.fill('#exMdVat', '10.56'); await page.fill('#exMdNote', 'Modal test');
  await page.fill('#exMdLiters', '30'); await page.fill('#exMdKm', '123456'); await page.fill('#exMdStation', 'Shell');
  const pnlGetsBefore = captured.pnlGets;
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/costs/lines'), { timeout: 10000 }),
    page.locator('.ex-modal-box button', { hasText: 'Αποθήκευση' }).click(),
  ]);
  await page.waitForTimeout(200);
  const body = captured.posts[0];
  assert(captured.posts.length === 1 && body.rt_id === 701 && body.category === 'fuel' && body.liters === 30 && body.km_reading === 123456 && body.station === 'Shell', 'TRIP PnL modal POST: rt_id 701, fuel with liters/km/station — same body builder as the sheet');
  assert(captured.pnlGets > pnlGetsBefore, 'onSaved → ctReload() re-fetched /costs/pnl');
  assert(await page.locator('.ex-modal-box').count() === 0, 'modal closes after save');
  await page.screenshot({ path: SCREENSHOT_PNL_1440, fullPage: true });
  console.log('  screenshot: ' + SCREENSHOT_PNL_1440);
  await context.close();
  return { consoleErrors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const acct = await runAccountantFlow(browser);
    const shot = await runScreenshot1280(browser);
    const mgmt = await runManagementFlow(browser);
    const disp = await runDispatcherFlow(browser);
    const pnl = await runPnlFlow(browser);
    const all = [...acct.consoleErrors, ...shot.consoleErrors, ...mgmt.consoleErrors, ...disp.consoleErrors, ...pnl.consoleErrors];
    console.log('\n== console errors ==');
    console.log('accountant:', acct.consoleErrors.length, '1280:', shot.consoleErrors.length, 'management:', mgmt.consoleErrors.length, 'dispatcher:', disp.consoleErrors.length, 'pnl:', pnl.consoleErrors.length);
    if (all.length) all.forEach(e => console.log('  ! ' + e));
    console.log('\n== captured request bodies (accountant) ==');
    console.log(JSON.stringify({ posts: acct.captured.posts, patches: acct.captured.patches, deletes: acct.captured.deletes, rtGets: acct.captured.rtGets, lineGets: acct.captured.lineGets }, null, 2));
    if (all.length > 0) console.log('\nΠΡΟΣΟΧΗ: ' + all.length + ' console error(s) — δες πάνω πριν τα θεωρήσεις θόρυβο HAR replay.');
    console.log('\nΟΛΟΙ ΟΙ ΕΛΕΓΧΟΙ ΠΕΡΑΣΑΝ.');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('\n' + (e && e.stack || e));
  process.exit(1);
});
