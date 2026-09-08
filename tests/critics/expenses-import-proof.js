// Proof script for the «Εισαγωγή DKV» screen (modules/expenses_import.js, Φ3).
// Spec: docs/superpowers/specs/2026-09-08-dkv-import-design.md §2/§3/§5/§6.
//
// Run from the MAIN repo (not this worktree — it has no node_modules):
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=/Users/dimitrispetras/PETRASGROUP-TMS/node_modules \
//     PW_BASE_URL=http://127.0.0.1:8794/ \
//     node <this-worktree>/tests/critics/expenses-import-proof.js
//
// A local `python3 -m http.server` must already be serving THIS worktree's
// root on PW_BASE_URL's port (started/stopped by the caller, per
// tests/critics/expenses-proof.js's own header comment).
//
// The Worker endpoints /costs/import/parse and /costs/import/commit (Φ2)
// are NOT deployed anywhere yet — every flow below mocks them with
// page.route, built on top of preparePage/gotoPage's HAR replay exactly like
// expenses-proof.js mocks /costs/lines. core/dkv-parser.js is required
// directly in Node (no DOM/fetch deps — spec §2) to build realistic parse
// results from real extracted text without needing a Worker.

const fs = require('fs');
const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const WORKTREE = path.join(__dirname, '..', '..');
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));
const DkvParser = require(path.join(WORKTREE, 'core', 'dkv-parser.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8794/';
const SCRATCH = '/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-keen-hamilton-ab77a6/caa94f70-bf92-45c5-98d4-ff74de01e316/scratchpad';
const SCREENSHOT_1280 = path.join(SCRATCH, 'dkv-import-r2-1280.png');
const SCREENSHOT_1440 = path.join(SCRATCH, 'dkv-import-r2-1440.png');
const REAL_ZIP = fs.readdirSync(path.join(MAIN_REPO, '.local', 'dkv')).find((n) => /\.zip$/i.test(n));
const REAL_ZIP_PATH = REAL_ZIP ? path.join(MAIN_REPO, '.local', 'dkv', REAL_ZIP) : null;

function assert(cond, msg) {
  if (!cond) throw new Error('ΑΠΟΤΥΧΙΑ: ' + msg);
  console.log('  ✓ ' + msg);
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// A vehicle group whose lines are ALL «sure» now renders collapsed by
// default (spec round 2 point 2) — its .ei-row children aren't in the DOM
// at all until the ⌄ caret is clicked open. Any assertion that wants to see
// every line at once (not testing the collapse feature itself) must expand
// first, or it undercounts rows for reasons unrelated to what it's checking.
async function expandAllGroups(page) {
  const heads = page.locator('.ei-grouphead');
  const n = await heads.count();
  for (let i = 0; i < n; i++) {
    const caret = heads.nth(i).locator('.ei-group-caret');
    if ((await caret.count()) && (await caret.innerText()).trim() === '⌄') await heads.nth(i).click();
  }
}

// ── fixtures shared by every flow (shape of /costs/rt, /costs/lookups —
// same contract expenses-proof.js already exercises) ───────────────────────
const LOOKUPS_FIXTURE = {
  trucks: [
    { id: 1, legacy_id: null, license_plate: 'XX1234', active: true },
    { id: 2, legacy_id: null, license_plate: 'XX5678', active: true },
    { id: 3, legacy_id: null, license_plate: 'ZZ9999', active: true },
  ],
  trailers: [],
  drivers: [
    { id: 1, legacy_id: null, full_name: 'Οδηγός Ένα', active: true },
    { id: 2, legacy_id: null, full_name: 'Οδηγός Δύο', active: true },
    { id: 3, legacy_id: null, full_name: 'Οδηγός Τρία', active: true },
    { id: 4, legacy_id: null, full_name: 'Οδηγός Τέσσερα', active: true },
  ],
  partners: [],
};
const RT_FIXTURE = [
  { id: 701, code: 'RT-701', scope: 'INTL', trip_type: 'OWNED', truck_id: 1, trailer_id: null, driver_id: 1, partner_id: null,
    date_start: '2026-08-30', date_end: '2026-09-05', status: 'in_progress', route_text: 'Διαδρομή Α', route_legs: null },
  { id: 702, code: 'RT-702', scope: 'INTL', trip_type: 'OWNED', truck_id: 2, trailer_id: null, driver_id: 2, partner_id: null,
    date_start: '2026-08-30', date_end: '2026-09-05', status: 'in_progress', route_text: 'Διαδρομή Β', route_legs: null },
  { id: 703, code: 'RT-703', scope: 'INTL', trip_type: 'OWNED', truck_id: 3, trailer_id: null, driver_id: 3, partner_id: null,
    date_start: '2026-08-30', date_end: '2026-09-05', status: 'in_progress', route_text: 'Διαδρομή Γ', route_legs: null },
  { id: 704, code: 'RT-704', scope: 'INTL', trip_type: 'OWNED', truck_id: 3, trailer_id: null, driver_id: 4, partner_id: null,
    date_start: '2026-08-30', date_end: '2026-09-05', status: 'in_progress', route_text: 'Διαδρομή Δ', route_legs: null },
];
// Separate from RT_FIXTURE (which feeds /costs/rt) on purpose: this is what a
// Worker's match step would compute server-side — plate+date → candidate
// RTs (spec §4 «σκορ ταιριάσματος»). Kept as a plain list here so the mocked
// /costs/import/parse handler can build match.candidates without re-deriving
// server logic none of this branch has yet (Φ2 not deployed).
const RT_MATCH_FIXTURE = [
  { rt_id: 701, plate: 'XX1234', driver: 'Οδηγός Ένα', date_start: '2026-08-30', date_end: '2026-09-05' },
  { rt_id: 702, plate: 'XX5678', driver: 'Οδηγός Δύο', date_start: '2026-08-30', date_end: '2026-09-05' },
];

function installBaseMocks(page) {
  page.route('**/costs/rt', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: RT_FIXTURE }) }));
  page.route('**/costs/lookups', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LOOKUPS_FIXTURE) }));
  page.route('**/costs/lines**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }));
  // core/auth.js:46 fires atPreload() 100ms after every page load, independent
  // of which screen is open — it warms ORDERS/TRUCKS caches in the background.
  // The HAR replay has no entry these three requests match once a run drifts
  // in timing (worst on flow (b), which spends 30s+ extracting the real ZIP),
  // and unlike the usual ERR_FAILED abort this manifests as "TypeError: Failed
  // to fetch" after every retry (same root cause documented in
  // tests/critics/expenses-proof.js's installGenericCostsMocks) — mocked empty
  // here for the identical reason: keep the console at this app's own known
  // baseline, not a defect introduced by this screen.
  page.route('**/tblgHlNmLBH3JTdIM**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }));
  page.route('**/pallets/gate**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }));
  page.route('**/tblEAPExIAjiA3asD**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }));
}

// Builds a /costs/import/parse response the way the future Worker would
// (spec §5 shape), from files the BROWSER already extracted (real pdf.js
// text or the __eiInjectFiles test hook) — parseDkv itself has no DOM/fetch
// dependency (spec §2), so it runs here in Node unmodified.
function matchLineFixture(l) {
  if (!l.plate) return { match: 'none', rt_id: null, alternatives: [], general: true };
  const day = l.service_date || l.period_from;
  const cands = RT_MATCH_FIXTURE.filter((r) => r.plate === l.plate && day && day >= r.date_start && day <= r.date_end);
  if (cands.length === 1) return { match: 'sure', rt_id: cands[0].rt_id, alternatives: [] };
  if (cands.length > 1) return { match: 'suggest', rt_id: cands[0].rt_id, alternatives: cands.slice(1).map((c) => c.rt_id) };
  return { match: 'none', rt_id: null, alternatives: [], general: false };
}

function buildParseEnvelope(files, zipName) {
  const parsed = DkvParser.parseDkv(files);
  const linesByDoc = new Map();
  for (const l of parsed.lines) { if (!linesByDoc.has(l.doc_no)) linesByDoc.set(l.doc_no, []); linesByDoc.get(l.doc_no).push(l); }
  const summaryByDocNo = new Map();
  if (parsed.summary) for (const d of parsed.summary.docs) summaryByDocNo.set(d.doc_no, d);
  const perDoc = [];
  for (const d of parsed.docs.filter((d) => ['invoice', 'statement', 'reverse_charge'].includes(d.doc_type))) {
    const docLines = linesByDoc.get(d.doc_no) || [];
    const parsedGross = round2(docLines.reduce((s, l) => s + (l.gross || 0), 0));
    const summaryRow = summaryByDocNo.get(d.doc_no);
    const summaryTotal = summaryRow ? summaryRow.total_native : null;
    const diff = summaryTotal != null ? round2(parsedGross - summaryTotal) : null;
    perDoc.push({ doc_no: d.doc_no, country: d.country, parsed_gross: parsedGross, summary_total: summaryTotal, diff, ok: summaryTotal != null && Math.abs(diff) <= 0.01 });
  }
  const ok = perDoc.length > 0 && perDoc.every((d) => d.ok);
  const lines = parsed.lines.map((l, idx) => Object.assign({}, l, { id: 'L' + idx }, matchLineFixture(l)));
  return {
    doc: { id: 'doc-' + Date.now(), zip_name: zipName, n_files: files.length, period_from: null, period_to: null },
    lines,
    reconcile: { ok, summary_total: perDoc.reduce((a, d) => a + (d.summary_total || 0), 0), lines_total: lines.length, per_doc: perDoc },
    metrics: {
      lines_total: lines.length,
      lines_sure: lines.filter((l) => l.match.status === 'sure').length,
      lines_corrected: 0,
      lines_unallocated: lines.filter((l) => l.match.status === 'none').length,
    },
    _parsed: parsed, // test-only: kept for assertions, never sent to the browser (fulfilled separately)
  };
}

function fixtureFiles() {
  const dir = path.join(WORKTREE, 'tests', 'dkv', 'fixtures');
  return [
    { name: '9999999_2026-09-30_EX_E-INVOICE_99-000000001-999.pdf', text: fs.readFileSync(path.join(dir, 'synthetic-invoice.txt'), 'utf8') },
    { name: '9999999_2026-09-30_EX_E-List of passages_99-999999999-001.pdf', text: fs.readFileSync(path.join(dir, 'synthetic-passages.txt'), 'utf8') },
    { name: '9999999_2026-09-30_E-SUMMARY_99-000000001-000.pdf', text: fs.readFileSync(path.join(dir, 'synthetic-summary.txt'), 'utf8') },
  ];
}

async function openImportScreen(page) {
  await preparePageAndGoto(page);
  await page.locator('button', { hasText: 'Εισαγωγή DKV' }).click();
  await page.waitForSelector('#eiFileInput', { state: 'attached', timeout: 10000 });
}

async function preparePageAndGoto(page) {
  await preparePage(page, 'accountant');
  installBaseMocks(page);
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page', { timeout: 15000 });
}

// ═══════════════════ (a) synthetic fixtures via __eiInjectFiles ═══════════
// Playwright cannot fabricate a real DKV PDF (task instructions) — the test
// hook bypasses JSZip/pdf.js entirely and hands the module the fixture text
// directly, so this exercises the REAL upload→parse→preview code path
// (eiHandleZipFile → eiExtractZipFiles → eiSendParse) without needing a PDF.
async function runSyntheticInjectFlow(browser) {
  console.log('\n== (a) synthetic fixtures via __eiInjectFiles ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await openImportScreen(page);

  const files = fixtureFiles();
  await page.evaluate((f) => { window.__eiInjectFiles = f; }, files);

  let capturedParseBody = null;
  await page.route('**/costs/import/parse', async (route) => {
    capturedParseBody = route.request().postDataJSON();
    const env = buildParseEnvelope(capturedParseBody.files, capturedParseBody.zip_name);
    const { _parsed, ...body } = env;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.setInputFiles('#eiFileInput', { name: 'test-import.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04synthetic-dummy-zip-bytes') });
  await page.waitForSelector('.ei-band', { timeout: 15000 });

  assert(!!capturedParseBody, 'the mocked /costs/import/parse route received a request');
  assert(capturedParseBody.source === 'DKV', 'parse request body source === "DKV"');
  assert(capturedParseBody.zip_name === 'test-import.zip', 'parse request body carries the zip_name');
  assert(Array.isArray(capturedParseBody.files) && capturedParseBody.files.length === 3, 'parse request body carries all 3 injected files');
  assert(capturedParseBody.files.every((f) => typeof f.text === 'string' && f.text.length > 0), 'every injected file has non-empty text');
  assert(/^[0-9a-f]{64}$/.test(capturedParseBody.zip_sha256 || ''), 'parse request body carries a 64-hex-char zip_sha256');
  assert(typeof capturedParseBody.zip_base64 === 'string' && capturedParseBody.zip_base64.length > 0, 'parse request body carries zip_base64 (small file, under the 8MB inline cap)');

  // Preview rendered from the response: reconciles (spec §6 gate #1 —
  // synthetic fixture sums to exactly the E-SUMMARY total, verified already
  // by tests/dkv/run-synthetic.js), 3 vehicle groups (XX1234, XX5678, no-vehicle).
  const bandText = await page.locator('.ei-band').innerText();
  assert(/ταυτίζεται με το E-SUMMARY/.test(bandText), 'reconciliation band shows the green «ταυτίζεται» message');
  assert(await page.locator('.ei-dot-ok').count() >= 1, 'a green ei-dot-ok is rendered in the band');
  const groupHeads = page.locator('.ei-grouphead');
  assert(await groupHeads.count() === 3, 'three vehicle groups rendered (XX1234, XX5678, Χωρίς όχημα)');
  assert((await page.locator('.ei-grouphead-none').innerText()).includes('Χωρίς όχημα'), 'the no-vehicle group carries the fixed label');
  await expandAllGroups(page); // a fully-sure group (e.g. one line matched) collapses by default (round 2) — expand before counting
  assert(await page.locator('.ei-row').count() === 4, 'four line rows rendered (matches the 4 synthetic transaction lines)');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (b) real ZIP, real browser extraction ════════════════
async function runRealZipFlow(browser) {
  if (!REAL_ZIP_PATH) {
    console.log('\n== (b) real ZIP — SKIPPED (no .local/dkv/*.ZIP locally) ==');
    return { consoleErrors: [], skipped: true };
  }
  console.log('\n== (b) real ZIP: ' + REAL_ZIP + ' ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await openImportScreen(page);
  // Explicitly NOT setting __eiInjectFiles here — this exercises the real
  // JSZip + pdf.js CDN path (core/scan-helpers.js _scanLoadPdfJs) end to end.

  let capturedParseBody = null;
  await page.route('**/costs/import/parse', async (route) => {
    capturedParseBody = route.request().postDataJSON();
    const env = buildParseEnvelope(capturedParseBody.files, capturedParseBody.zip_name);
    const { _parsed, ...body } = env;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.setInputFiles('#eiFileInput', REAL_ZIP_PATH);
  // 31 real PDFs through pdf.js in-browser — generous timeout.
  await page.waitForSelector('.ei-band', { timeout: 180000 });

  assert(!!capturedParseBody, 'the mocked /costs/import/parse route received a request for the real ZIP');
  assert(Array.isArray(capturedParseBody.files) && capturedParseBody.files.length === 31, 'parse request carries all 31 real files (counts only, per task instructions — no file content printed)');
  assert(capturedParseBody.files.every((f) => typeof f.text === 'string' && f.text.length > 0), 'every one of the 31 real files extracted non-empty text via pdf.js');
  assert(/^[0-9a-f]{64}$/.test(capturedParseBody.zip_sha256 || ''), 'real-ZIP parse request carries a 64-hex-char zip_sha256');

  assert(await page.locator('.ei-band').count() === 1, 'reconciliation band renders for the real ZIP');
  assert(await page.locator('.ei-grouphead').count() >= 1, 'at least one vehicle group renders for the real ZIP');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (c) hand-built preview: corrections + commit + 409 ═══
const CORRECTIONS_PREVIEW = {
  doc: { id: 'doc-c-1', zip_name: 'flowc.zip', n_files: 2, period_from: '2026-09-01', period_to: '2026-09-02' },
  lines: [
    { id: 'c1', source: 'DKV', doc_no: 'DOC-C', doc_type: 'invoice', country: 'AT', vehicle_raw: 'ZZ9999', plate: 'ZZ9999', card_no: 'x',
      service_date: '2026-09-01', period_from: null, period_to: null, product_code: '0902', product: 'Toll', category: 'tolls',
      station: 'Test Station', city: 'Testville', time: '10:00', ref: 'r1', quantity: 1, unit: 'ST', unit_price: 10,
      net: 10, vat: 2, gross: 12, currency: 'EUR', net_eur: 10, vat_eur: 2, gross_eur: 12, fx_rate: 1,
      match: { status: 'suggest', rt_id: null, candidates: [
        { rt_id: 703, plate: 'ZZ9999', driver: 'Οδηγός Τρία', date_start: '2026-08-30', date_end: '2026-09-05' },
        { rt_id: 704, plate: 'ZZ9999', driver: 'Οδηγός Τέσσερα', date_start: '2026-08-30', date_end: '2026-09-05' },
      ] } },
    { id: 'c2', source: 'DKV', doc_no: 'DOC-C', doc_type: 'invoice', country: 'AT', vehicle_raw: 'ZZ9999', plate: 'ZZ9999', card_no: 'x',
      service_date: '2026-09-02', period_from: null, period_to: null, product_code: '0009', product: 'Diesel', category: 'fuel',
      station: 'Fuel stop', city: null, time: '08:00', ref: 'r2', quantity: 50, unit: 'LTR', unit_price: 1.5,
      net: 75, vat: 0, gross: 75, currency: 'EUR', net_eur: 75, vat_eur: 0, gross_eur: 75, fx_rate: 1,
      match: { status: 'sure', rt_id: 703, candidates: [] } },
  ],
  reconcile: { ok: true, summary_total: 87, lines_total: 2, per_doc: [{ doc_no: 'DOC-C', country: 'AT', parsed_gross: 87, summary_total: 87, diff: 0, ok: true }] },
  metrics: { lines_total: 2, lines_sure: 1, lines_corrected: 0, lines_unallocated: 0 },
};

async function runCorrectionsAndCommitFlow(browser) {
  console.log('\n== (c) hand-built preview: corrections + commit + 409 ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

  await openImportScreen(page);
  await page.evaluate(() => { window.__eiInjectFiles = [{ name: 'dummy.pdf', text: '' }]; });
  await page.route('**/costs/import/parse', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CORRECTIONS_PREVIEW) }));
  await page.setInputFiles('#eiFileInput', { name: 'flowc.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04dummy') });
  await page.waitForSelector('.ei-band', { timeout: 15000 });

  // ── groups / dots / counts ──
  assert(await page.locator('.ei-grouphead').count() === 1, 'one vehicle group (ZZ9999) for the two-line fixture');
  assert((await page.locator('.ei-grouphead').innerText()).includes('ZZ9999'), 'group header shows the plate');
  assert(await page.locator('.ei-dot-suggest').count() >= 1, 'a blue suggest dot renders for the two-candidate line');
  const metricsText = await page.locator('.ei-band').innerText();
  assert(/1/.test(metricsText) && /σίγουρες/.test(metricsText), 'band shows the «σίγουρες» metric');
  assert(/προτάσεις/.test(metricsText), 'band shows the «προτάσεις» metric');
  const chipsText = await page.locator('.ei-chiprow').innerText();
  assert(/Διόδια 1/.test(chipsText), 'category chip counts tolls=1');
  assert(/Καύσιμα/.test(chipsText), 'category chip row shows Καύσιμα');

  // ── RT correction: «Επιλογή» on the suggest line → pick the OTHER candidate → confirm dialog → rule ──
  const row1 = page.locator('.ei-row').nth(0);
  assert((await row1.locator('.ei-link').innerText()) === 'Επιλογή', 'suggest-status line shows «Επιλογή» (not «Αλλαγή»)');
  await row1.locator('.ei-link').click();
  await page.waitForSelector('#eiRtCandSel_0', { timeout: 5000 });
  await page.selectOption('#eiRtCandSel_0', '704');
  await page.waitForTimeout(150);
  assert(dialogs.some((m) => /Να ισχύει στο εξής/.test(m) && m.includes('ZZ9999')), 'RT correction opened a «να ισχύει στο εξής» confirm naming the plate');
  assert((await row1.getAttribute('class') || '').includes('corrected'), 'the corrected row carries the .corrected style hook');

  // ── category correction on line 2: fuel → adblue, confirm dialog → rule ──
  dialogs.length = 0;
  const row2 = page.locator('.ei-row').nth(1);
  await row2.locator('.ei-catselect').selectOption('adblue');
  await page.waitForTimeout(150);
  assert(dialogs.some((m) => /Να ισχύει στο εξής/.test(m) && /0009/.test(m)), 'category correction opened a «να ισχύει στο εξής» confirm naming the product code');
  assert((await row2.getAttribute('class') || '').includes('corrected'), 'the category-corrected row carries the .corrected style hook');

  // ── untick line 1 — must drop out of the commit body ──
  await row1.locator('input[type=checkbox]').uncheck();
  await page.waitForTimeout(100);
  const footSum = await page.locator('.ei-footsum').innerText();
  assert(footSum.startsWith('1 '), 'footer «επιλεγμένες» count drops to 1 after unticking a line');

  // ── commit: body shape (ticked lines only, both rules, doc_id) ──
  let commitBody = null;
  await page.route('**/costs/import/commit', async (route) => {
    commitBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: commitBody.lines.length, invoice_no: 'DOC-C' }) });
  });
  await page.locator('#eiCommitBtn').click();
  await page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/costs/import/commit'), { timeout: 10000 });
  await page.waitForTimeout(200);

  assert(!!commitBody, 'commit POST captured');
  assert(commitBody.doc_id === 'doc-c-1', 'commit body carries doc_id from the parse response');
  assert(Array.isArray(commitBody.lines) && commitBody.lines.length === 1, 'commit body carries ONLY the ticked line (line 1 was unticked)');
  assert(commitBody.lines[0].id === undefined, 'committed line has no client-only "id" field');
  assert(commitBody.lines[0].rt_id === 703, 'committed line carries the resolved rt_id (line 2, sure match)');
  assert(Array.isArray(commitBody.rules) && commitBody.rules.length === 2, 'commit body carries both correction rules (rt_pref + category)');
  assert(commitBody.rules.some((r) => r.kind === 'rt_pref' && r.key.plate === 'ZZ9999'), 'rt_pref rule keyed by plate ZZ9999 present');
  assert(commitBody.rules.some((r) => r.kind === 'category' && r.key === '0009'), 'category rule keyed by product_code 0009 present');
  assert(Array.isArray(commitBody.examples) && commitBody.examples.length === 0, 'commit body carries an empty examples array (no AI-sourced lines in this fixture)');

  // Success → back to the expenses screen (renderExpenses(), spec Φ3 §"returns there").
  await page.waitForSelector('.ex-page', { timeout: 10000 });
  assert(await page.locator('.ei-page').count() === 0, 'after a successful commit the import screen is gone — back on .ex-page');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (c-2) reconcile.ok=false → commit locked ═════════════
const BAD_RECONCILE_PREVIEW = Object.assign({}, CORRECTIONS_PREVIEW, {
  doc: { id: 'doc-bad-1', zip_name: 'bad.zip', n_files: 1, period_from: null, period_to: null },
  reconcile: { ok: false, summary_total: 100, lines_total: 2, per_doc: [{ doc_no: 'DOC-C', country: 'AT', parsed_gross: 87, summary_total: 100, diff: -13, ok: false }] },
});

async function runBadReconcileFlow(browser) {
  console.log('\n== (c-2) reconcile.ok=false — commit locked ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await openImportScreen(page);
  await page.evaluate(() => { window.__eiInjectFiles = [{ name: 'dummy.pdf', text: '' }]; });
  await page.route('**/costs/import/parse', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BAD_RECONCILE_PREVIEW) }));
  await page.setInputFiles('#eiFileInput', { name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04dummy') });
  await page.waitForSelector('.ei-band', { timeout: 15000 });

  const bandText = await page.locator('.ei-band').innerText();
  assert(/Δεν συμφωνεί/.test(bandText), 'reconciliation band shows «Δεν συμφωνεί» when reconcile.ok=false');
  assert(bandText.includes('DOC-C'), 'mismatch message names the offending document');
  const disabled = await page.locator('#eiCommitBtn').isDisabled();
  assert(disabled, 'commit button is disabled while reconcile.ok is false, even with lines ticked');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (c-3) 409 — already imported ═════════════════════════
async function runAlreadyImportedFlow(browser) {
  console.log('\n== (c-3) 409 already imported — stop ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('dialog', async (d) => { await d.accept(); });

  await openImportScreen(page);
  await page.evaluate(() => { window.__eiInjectFiles = [{ name: 'dummy.pdf', text: '' }]; });
  await page.route('**/costs/import/parse', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CORRECTIONS_PREVIEW) }));
  await page.setInputFiles('#eiFileInput', { name: 'dup.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04dummy') });
  await page.waitForSelector('.ei-band', { timeout: 15000 });

  const WHO_WHEN_MSG = 'Έχει ήδη εισαχθεί στις 2026-09-01 10:00 από demo_accountant';
  await page.route('**/costs/import/commit', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: WHO_WHEN_MSG }) }));
  await page.locator('#eiCommitBtn').click();
  await page.waitForTimeout(500);

  assert(await page.locator('.ei-page').count() === 1, '409 does NOT navigate away — still on the import screen (spec §5 «show who/when and stop»)');
  const toastText = await page.locator('#tms-toast-container').innerText().catch(() => '');
  assert(toastText.includes('εισαχθεί'), 'error toast surfaces the 409 «already imported» message');
  assert(toastText.includes('demo_accountant'), 'error toast carries WHO (redacted-safe: a fixture username, not a real one)');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (e) none_reason, review toggle, collapse, currency,
//                         split-line, plate-link (round 2) ════════════════
// Two fully-sure lines on XX1234 (starts collapsed) · a suggest + a split
// line on XX5678 (mixed, starts open) · four different none_reason lines
// with no plate/an unrecognized plate (no-vehicle group, starts open).
// doc.n_files is deliberately WRONG (999) so the title-count assertion below
// proves files_count wins, not just that a number is shown.
const NONE_REASON_PREVIEW = {
  doc: { id: 'doc-r2-1', zip_name: 'r2test.zip', n_files: 999, files_count: 5, period_from: '2026-09-01', period_to: '2026-09-07' },
  lines: [
    { id: 'r2-0', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'AT', vehicle_raw: 'XX1234', plate: 'XX1234', card_no: 'x',
      service_date: '2026-09-01', period_from: null, period_to: null, product_code: '0902', product: 'Toll', category: 'tolls',
      station: 'Test Station', city: 'Testville', time: '10:00', ref: 'r0', quantity: 1, unit: 'ST', unit_price: 10,
      net: 10, vat: 2, gross: 12, currency: 'EUR', net_eur: 10, vat_eur: 2, gross_eur: 12, fx_rate: 1,
      match: { status: 'sure', rt_id: 701, candidates: [] } },
    { id: 'r2-1', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'HU', vehicle_raw: 'XX1234', plate: 'XX1234', card_no: 'x',
      service_date: '2026-09-01', period_from: null, period_to: null, product_code: '0009', product: 'Diesel', category: 'fuel',
      station: 'Fuel stop HU', city: null, time: '08:00', ref: 'r1', quantity: 1, unit: 'DB', unit_price: 70364,
      net: 28000, vat: 0, gross: 28000, currency: 'HUF', net_eur: 70, vat_eur: 0, gross_eur: 70, fx_rate: 0.0025,
      match: { status: 'sure', rt_id: 701, candidates: [] } },
    { id: 'r2-2', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'IT', vehicle_raw: 'XX5678', plate: 'XX5678', card_no: 'x',
      service_date: '2026-09-02', period_from: null, period_to: null, product_code: '0701', product: 'Ferry', category: 'ferry_train',
      station: 'Ferry dock', city: null, time: '09:00', ref: 'r2', quantity: 1, unit: 'ST', unit_price: 15,
      net: 15, vat: 3, gross: 18, currency: 'EUR', net_eur: 15, vat_eur: 3, gross_eur: 18, fx_rate: 1,
      match: { status: 'suggest', rt_id: 702, candidates: [{ rt_id: 702, plate: 'XX5678', driver: 'Οδηγός Δύο', date_start: '2026-08-30', date_end: '2026-09-05' }] } },
    { id: 'r2-3', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'IT', vehicle_raw: 'XX5678', plate: 'XX5678', card_no: 'x',
      service_date: '2026-09-02', period_from: null, period_to: null, product_code: '0902', product: 'Toll', category: 'tolls',
      station: null, city: null, time: null, ref: 'r3', quantity: 1, unit: 'ST', unit_price: 20,
      net: 20, vat: 4, gross: 24, currency: 'EUR', net_eur: 20, vat_eur: 4, gross_eur: 24, fx_rate: 1,
      sub: 1, split_from_seq: 5, passages_count: 12, service_date_source: 'passages',
      match: { status: 'sure', rt_id: 702, candidates: [] } },
    { id: 'r2-4', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'GR', vehicle_raw: null, plate: null, card_no: 'x',
      service_date: null, period_from: '2026-09-01', period_to: '2026-09-07', product_code: '9999', product: 'DKV service fee', category: 'dkv',
      station: null, city: null, time: null, ref: 'r4', quantity: null, unit: null, unit_price: null,
      net: 5, vat: 0, gross: 5, currency: 'EUR', net_eur: 5, vat_eur: 0, gross_eur: 5, fx_rate: 1,
      none_reason: 'general_fee', match: { status: 'none', rt_id: null, candidates: [], general: true } },
    { id: 'r2-5', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'AT', vehicle_raw: 'YY1111', plate: 'YY1111', card_no: 'x',
      service_date: '2026-09-01', period_from: null, period_to: null, product_code: '0902', product: 'Toll', category: 'tolls',
      station: 'Unknown plate stop', city: null, time: '11:00', ref: 'r5', quantity: 1, unit: 'ST', unit_price: 8,
      net: 8, vat: 1.6, gross: 9.6, currency: 'EUR', net_eur: 8, vat_eur: 1.6, gross_eur: 9.6, fx_rate: 1,
      none_reason: 'unknown_plate', match: { status: 'none', rt_id: null, candidates: [] } },
    { id: 'r2-6', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'AT', vehicle_raw: 'ZZ9999', plate: 'ZZ9999', card_no: 'x',
      service_date: '2026-09-10', period_from: null, period_to: null, product_code: '0100', product: 'Spedition', category: 'spedition',
      station: null, city: null, time: null, ref: 'r6', quantity: 1, unit: 'ST', unit_price: 50,
      net: 50, vat: 0, gross: 50, currency: 'EUR', net_eur: 50, vat_eur: 0, gross_eur: 50, fx_rate: 1,
      none_reason: 'no_rt_on_date', match: { status: 'none', rt_id: null, candidates: [] } },
    { id: 'r2-7', source: 'DKV', doc_no: 'DOC-R2', doc_type: 'invoice', country: 'GR', vehicle_raw: null, plate: null, card_no: 'x',
      service_date: null, period_from: null, period_to: null, product_code: '0500', product: 'Other', category: 'other',
      station: null, city: null, time: null, ref: 'r7', quantity: null, unit: null, unit_price: null,
      net: 3, vat: 0, gross: 3, currency: 'EUR', net_eur: 3, vat_eur: 0, gross_eur: 3, fx_rate: 1,
      none_reason: 'no_plate', match: { status: 'none', rt_id: null, candidates: [] } },
  ],
  reconcile: { ok: true, summary_total: 191.6, lines_total: 8, per_doc: [{ doc_no: 'DOC-R2', country: 'AT', parsed_gross: 191.6, summary_total: 191.6, diff: 0, ok: true }] },
  metrics: { lines_total: 8, lines_sure: 3, lines_corrected: 0, lines_unallocated: 4 },
};

async function runNoneReasonAndReviewFlow(browser) {
  console.log('\n== (e) none_reason, review toggle, collapse, currency, split, plate-link (round 2) ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

  await openImportScreen(page);
  await page.evaluate(() => { window.__eiInjectFiles = [{ name: 'dummy.pdf', text: '' }]; });
  await page.route('**/costs/import/parse', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NONE_REASON_PREVIEW) }));
  await page.setInputFiles('#eiFileInput', { name: 'r2.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04dummy') });
  await page.waitForSelector('.ei-band', { timeout: 15000 });

  // ── title: doc.files_count wins over the wrong doc.n_files ──
  const titleText = await page.locator('.ei-headtitle').innerText();
  assert(titleText.includes('5 αρχεία'), 'title uses doc.files_count (5), not the stale doc.n_files (999)');

  // ── collapsed-by-default group + one-line summary ──
  // Five groups, not three: a none_reason line still carries its OWN plate
  // when the DKV card had one (unknown_plate: the raw plate itself;
  // no_rt_on_date: a recognized plate, just no RT that day) — only
  // general_fee/no_plate (no plate on the document at all) land in the
  // shared «Χωρίς όχημα» group. XX1234(sure×2) · XX5678(suggest+sure) ·
  // YY1111(unknown_plate) · ZZ9999(no_rt_on_date) · Χωρίς όχημα(general_fee+no_plate).
  const groupHeads = page.locator('.ei-grouphead');
  assert(await groupHeads.count() === 5, 'five groups — every plate the DKV card carries gets its own group, known or not');
  const xx1234Head = page.locator('.ei-grouphead', { hasText: 'XX1234' });
  assert((await xx1234Head.innerText()).includes('όλες σίγουρες'), 'the fully-sure XX1234 group shows «όλες σίγουρες»');
  assert(await page.locator('.ei-row').count() === 6, 'XX1234 starts collapsed — 6 of 8 rows visible (2 hidden)');

  // ── none_reason messaging + per-reason action label ──
  // Default visible order (XX1234 collapsed): XX5678's 2 rows, then
  // YY1111(unknown_plate), ZZ9999(no_rt_on_date), then the shared
  // «Χωρίς όχημα» group's general_fee then no_plate.
  const rows = page.locator('.ei-row');
  const unknownRow = rows.nth(2), noRtRow = rows.nth(3), generalRow = rows.nth(4), noPlateRow = rows.nth(5);
  const generalText = await generalRow.locator('.ei-rtcell').innerText();
  assert(generalText.includes('Γενικό τέλος DKV') && generalText.includes('δεν χρεώνεται σε δρομολόγιο'), 'general_fee line explains it is a general DKV fee');
  assert(await generalRow.locator('.ei-rowlink button').count() === 0, 'general_fee line has NO round-trip action — nothing to pick');
  const unknownText = await unknownRow.locator('.ei-rtcell').innerText();
  assert(unknownText.includes('Άγνωστη πινακίδα YY1111'), 'unknown_plate line names the unrecognized plate');
  assert((await unknownRow.locator('.ei-rowlink button').innerText()) === 'Σύνδεση με φορτηγό…', 'unknown_plate line offers «Σύνδεση με φορτηγό…»');
  const noRtText = await noRtRow.locator('.ei-rtcell').innerText();
  assert(noRtText.includes('Καμία διαδρομή του ZZ9999') && noRtText.includes('10/09'), 'no_rt_on_date line names the plate and the date');
  assert(noRtText.includes('Πιθανό δρομολόγιο που δεν καταχωρήθηκε'), 'no_rt_on_date line notes a route may be missing, not created here');
  assert((await noRtRow.locator('.ei-rowlink button').innerText()) === 'Επιλογή δρομολογίου…', 'no_rt_on_date line offers «Επιλογή δρομολογίου…»');
  const noPlateText = await noPlateRow.locator('.ei-rtcell').innerText();
  assert(noPlateText.includes('Χωρίς όχημα στο παραστατικό'), 'no_plate line explains the document itself carries no vehicle');
  assert((await noPlateRow.locator('.ei-rowlink button').innerText()) === 'Επιλογή', 'no_plate line keeps the plain «Επιλογή» RT picker');

  // ── none_reason summary sentence under the band ──
  const summaryText = await page.locator('.ei-none-summary').innerText();
  assert(summaryText.includes('4 χωρίς δρομολόγιο'), 'none-reason summary counts all 4 none-status lines');
  assert(summaryText.includes('γενικό τέλος') && summaryText.includes('άγνωστη πινακίδα') && summaryText.includes('χωρίς διαδρομή εκείνη την ημέρα') && summaryText.includes('χωρίς όχημα στο παραστατικό'), 'none-reason summary names each of the 4 reasons once');

  // ── review mode toggle («Θέλουν απόφαση» = suggest+none only) ──
  const reviewRow = page.locator('.ei-reviewrow');
  assert((await reviewRow.innerText()).includes('Θέλουν απόφαση'), 'review toggle offers «Θέλουν απόφαση»');
  await reviewRow.locator('button', { hasText: 'Θέλουν απόφαση' }).click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ei-row').count() === 5, 'decide-only mode shows only the 5 non-sure lines (XX1234 fully sure, hidden entirely)');
  assert(await groupHeads.count() === 4, 'decide-only mode hides the fully-sure XX1234 group entirely — the other 4 groups still have a non-sure line each');
  await reviewRow.locator('button', { hasText: 'Όλα' }).click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ei-row').count() === 6, 'back to «Όλα» — 6 rows again (XX1234 stays collapsed, its own choice survives the toggle)');

  // ── expand XX1234 → currency description, ferry_train label, split hint ──
  await xx1234Head.click();
  await page.waitForTimeout(100);
  assert(await page.locator('.ei-row').count() === 8, 'expanding XX1234 shows all 8 rows');
  const hufDesc = await rows.nth(1).locator('.ei-desc').innerText();
  assert(hufDesc.includes('70.364,00 HUF/DB'), 'unit price shown in the DOCUMENT currency (HUF), not silently converted to €');
  assert(hufDesc.includes('→ EUR ισοτιμία 0,0025'), 'fx conversion note shown for a non-EUR line');
  const ferrySel = rows.nth(2).locator('.ei-catselect');
  assert((await ferrySel.evaluate((el) => el.options[el.selectedIndex].textContent)) === 'Γέφυρα/Φέρι', 'ferry_train category reads «Γέφυρα/Φέρι» on this screen');
  const splitRow = rows.nth(3);
  assert((await splitRow.getAttribute('class') || '').includes('split'), 'a per-day split line (sub field) carries the .split indent class');
  const splitDesc = await splitRow.locator('.ei-desc').innerText();
  assert(splitDesc.includes('↳ από λίστα διελεύσεων · 12 διελεύσεις'), 'split line shows its passages_count');
  const splitDateTitle = await splitRow.locator('.s').first().getAttribute('title');
  assert(splitDateTitle === 'ημέρα διαδρομής', 'service_date_source=passages gets the «ημέρα διαδρομής» hover hint');

  // ── plate-link flow (unknown_plate → «Σύνδεση με φορτηγό…» → resuggest) ──
  // Fully expanded order is XX1234(2) · XX5678(2) · YY1111(1, this line) ·
  // ZZ9999(1) · Χωρίς όχημα(2) — the unknown_plate line is at index 4.
  const unknownRow2 = rows.nth(4);
  await unknownRow2.locator('.ei-link', { hasText: 'Σύνδεση με φορτηγό…' }).click();
  await page.waitForSelector('#eiPlateSel_5', { timeout: 5000 });
  await page.selectOption('#eiPlateSel_5', '2'); // truck id 2 = XX5678
  await page.waitForTimeout(150);
  assert(dialogs.some((m) => /Να ισχύει στο εξής/.test(m) && m.includes('YY1111')), 'plate-link opened a «να ισχύει στο εξής» confirm naming the ORIGINAL unrecognized plate');
  const pageTextAfterLink = await page.locator('.ei-page').innerText();
  assert(!pageTextAfterLink.includes('Άγνωστη πινακίδα'), 'after linking, the line no longer reads «Άγνωστη πινακίδα» anywhere');

  // ── commit body: plate rule + resolved rt_id for the linked line ──
  let commitBody = null;
  await page.route('**/costs/import/commit', async (route) => {
    commitBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: commitBody.lines.length, invoice_no: 'DOC-R2' }) });
  });
  await page.locator('#eiCommitBtn').click();
  await page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/costs/import/commit'), { timeout: 10000 });
  await page.waitForTimeout(200);

  assert(!!commitBody, 'commit POST captured for the round-2 fixture');
  assert(commitBody.lines.length === 8, 'all 8 lines committed (none unticked in this flow)');
  assert(commitBody.rules.some((r) => r.kind === 'plate' && r.key === 'YY1111' && r.value.truck_id === 2), 'commit body carries the plate rule (key=YY1111, value.truck_id=2)');
  const linkedLine = commitBody.lines.find((l) => l.net === 8 && l.category === 'tolls');
  assert(!!linkedLine && linkedLine.rt_id === 702, 'the plate-linked line resolved to RT 702 (client-side re-suggest, same truck+date)');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (f) «Εισαγωγές» band on modules/expenses.js ══════════
async function runImportDocsFlow(browser) {
  console.log('\n== (f) «Εισαγωγές» band on modules/expenses.js ==');
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const DOCS_FIXTURE = [
    { id: 'doc-1001', invoice_no: 'INV-1001', period_from: '2026-08-01', period_to: '2026-08-31', lines_total: 269, status: 'committed', created_by: 'demo_accountant', created_at: '2026-09-08T10:00:00Z' },
    { id: 'doc-1002', invoice_no: null, zip_name: 'draft-sep.zip', period_from: '2026-09-01', period_to: '2026-09-07', lines_total: 40, status: 'draft', created_by: 'demo_accountant', created_at: '2026-09-08T11:00:00Z' },
  ];
  let signedRequestUrl = null;

  // Route registration order matters here: preparePage() installs a broad
  // "**/BACKEND_HOST/**" handler that aborts anything not in the HAR
  // recording (tests/critics/auth.js _installBackendReplay), and Playwright
  // tries the MOST RECENTLY registered route first. Every other flow in this
  // file registers its own page.route() calls AFTER openImportScreen() (which
  // calls preparePage) for exactly this reason — registering this route
  // first would let the broad abort-everything handler win and 404 silently.
  await preparePage(page, 'accountant');
  installBaseMocks(page);
  await page.route('**/costs/import/docs**', async (route) => {
    const url = route.request().url();
    if (url.includes('signed=1')) {
      signedRequestUrl = url;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signed_url: 'https://example.com/signed/doc-1001.zip' }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: DOCS_FIXTURE }) });
    }
  });
  await gotoPage(page, 'expenses', BASE_URL);
  await page.waitForSelector('.ex-page', { timeout: 15000 });
  await page.waitForSelector('.ex-idoc-row', { timeout: 10000 });

  const idocsText = await page.locator('.ex-idocs').innerText();
  assert(idocsText.includes('INV-1001'), 'import docs list shows the invoice number');
  assert(idocsText.includes('269 γραμμές'), 'import docs list shows the line count');
  assert(idocsText.includes('demo_accountant'), 'import docs list shows created_by');
  assert(idocsText.includes('πρόχειρο'), 'draft doc shows «πρόχειρο» instead of a raw status code');
  assert(idocsText.includes('draft-sep.zip'), 'draft doc without an invoice_no falls back to the zip name');

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.ex-idoc-row').first().locator('.ex-link', { hasText: 'ZIP' }).click(),
  ]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  assert(popup.url() === 'https://example.com/signed/doc-1001.zip', 'ZIP click opens the signed_url in a new tab');
  assert(!!signedRequestUrl && signedRequestUrl.includes('id=') && signedRequestUrl.includes('signed=1'), 'the signed-URL request carries both id= and signed=1');

  await context.close();
  return { consoleErrors };
}

// ═══════════════════ (d) no horizontal scroll + screenshots ═══════════════
async function runScreenshotFlow(browser, width, height, screenshotPath, assertNoScroll) {
  console.log('\n== screenshot ' + width + 'x' + height + ' ==');
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await openImportScreen(page);
  await page.evaluate(() => { window.__eiInjectFiles = [{ name: 'dummy.pdf', text: '' }]; });
  // NONE_REASON_PREVIEW (round 2 fixture) instead of CORRECTIONS_PREVIEW here
  // on purpose — it exercises every new round-2 element at once (none_reason
  // messaging, collapsed group, currency/fx description, split-line indent),
  // so the screenshot and the no-horizontal-scroll check actually cover the
  // wider content those features add, not just the round-1 layout.
  await page.route('**/costs/import/parse', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NONE_REASON_PREVIEW) }));
  await page.setInputFiles('#eiFileInput', { name: 'shot.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04dummy') });
  await page.waitForSelector('.ei-band', { timeout: 15000 });
  await expandAllGroups(page); // show every round-2 row in the screenshot, not just the ones open by default

  if (assertNoScroll) {
    const pageOverflow = await page.locator('.ei-page').evaluate((el) => el.scrollWidth <= el.clientWidth);
    assert(pageOverflow, 'no horizontal scroll on .ei-page at ' + width + 'x' + height);
    const bodyOverflow = await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth);
    assert(bodyOverflow, 'no horizontal scroll on document body at ' + width + 'x' + height);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('  screenshot: ' + screenshotPath);

  await context.close();
  return { consoleErrors };
}

// ERR_FAILED: the HAR-abort baseline (tests/critics/auth.js). "Failed to load
// resource: ... 409": Chrome's own network panel logs any >=400 fetch
// response this way regardless of the app handling it correctly — flow
// (c-3) deliberately mocks a 409 to prove the screen stops and shows the
// message, so this line is expected there, not a defect.
const KNOWN_NOISE_RE = /ERR_FAILED|status of 409/;
function reportConsoleErrors(label, errors) {
  const unknown = errors.filter((e) => !KNOWN_NOISE_RE.test(e));
  console.log('  console errors (' + label + '): ' + errors.length + ' total, ' + unknown.length + ' unexpected');
  unknown.forEach((e) => console.log('    ! ' + e));
  return unknown;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const a = await runSyntheticInjectFlow(browser);
    const b = await runRealZipFlow(browser);
    const c = await runCorrectionsAndCommitFlow(browser);
    const c2 = await runBadReconcileFlow(browser);
    const c3 = await runAlreadyImportedFlow(browser);
    const e = await runNoneReasonAndReviewFlow(browser);
    const f = await runImportDocsFlow(browser);
    const shot1280 = await runScreenshotFlow(browser, 1280, 900, SCREENSHOT_1280, true);
    const shot1440 = await runScreenshotFlow(browser, 1440, 900, SCREENSHOT_1440, false);

    console.log('\n== console errors ==');
    let unknownTotal = 0;
    unknownTotal += reportConsoleErrors('a-synthetic', a.consoleErrors).length;
    if (!b.skipped) unknownTotal += reportConsoleErrors('b-real-zip', b.consoleErrors).length;
    unknownTotal += reportConsoleErrors('c-corrections', c.consoleErrors).length;
    unknownTotal += reportConsoleErrors('c2-bad-reconcile', c2.consoleErrors).length;
    unknownTotal += reportConsoleErrors('c3-409', c3.consoleErrors).length;
    unknownTotal += reportConsoleErrors('e-none-reason', e.consoleErrors).length;
    unknownTotal += reportConsoleErrors('f-import-docs', f.consoleErrors).length;
    unknownTotal += reportConsoleErrors('shot-1280', shot1280.consoleErrors).length;
    unknownTotal += reportConsoleErrors('shot-1440', shot1440.consoleErrors).length;

    if (unknownTotal > 0) {
      throw new Error(unknownTotal + ' unexpected console error(s) — see above (known baseline noise is only ERR_FAILED from the background atPreload(), core/api.js:732).');
    }

    console.log('\nΟΛΑ ΤΑ ΕΛΕΓΧΟΙ ΠΕΡΑΣΑΝ.');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('\n' + (e && e.stack || e));
  process.exit(1);
});
