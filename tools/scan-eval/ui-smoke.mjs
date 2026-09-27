#!/usr/bin/env node
// UI smoke for scan engine v2 + the round-3 review screen — the REAL app in a
// real browser, backend mocked.
//
//   node tools/scan-eval/ui-smoke.mjs [--headed] [--shot <path under .local/>]
//
// Why: the Node sandbox (lib/app-sandbox.mjs) stubs _openModal, so it proves
// what the scanner HANDS the form, not that the form renders it, and it can't
// exercise a browser-only DOM feature like the side-by-side document review
// (core/doc-viewer.js, core/scan-review.js) at all. This opens app.html from
// the working tree, turns the v2 switch on, and runs four scenarios: an
// International scan from a synthetic PDF (full review-panel cycle: layout,
// confidence badges, click-to-highlight, «Αποδοχή βέβαιων»), one from a
// synthetic Word .doc (the text-only doc-viewer path + responsive stacking),
// a National scan (same engine, different form), and a plain "New Order"
// (no scan at all — must show NONE of the review UI). Every Worker request
// is answered locally with INVENTED data (fixtures/) — no token, no
// production call, nothing written anywhere. pdf.js is served from the
// repo's own node_modules (same version the app loads from a CDN in
// production) so this runs fully offline, not from the real CDN.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const FIX = path.join(HERE, 'fixtures');
// require.resolve walks up from HERE (Node's normal module resolution), not
// just under REPO — this worktree has no node_modules of its own and finds
// the main checkout's (same one lib/app-sandbox.mjs uses for the Node tests).
const PDFJS_DIR = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build');
const refData = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-ref.json'), 'utf8'));
const baseAnswer = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction-v2.json'), 'utf8'));
const { makeDoc, makePdf, SYNTH_LINES } = await import('./test/synthetic-docs.mjs');
const BACKEND = 'petras-tms-backend-staging.petrasgroup.workers.dev';

// A deep clone with pallet_type's confidence dropped to LOW — gives the
// review panel both a high-confidence field (client, 0.95) and a low one to
// check «Αποδοχή βέβαιων» clears the first and leaves the second flagged.
// core/scan-engine-v2.js calibrates confidence against whether the quote is
// actually found in the document text (_sv2Calibrate) and floors a VERIFIED
// quote at 0.92 regardless of the model's own number — so lowering just `c`
// is not enough; the quote itself must not verify (an unfindable string, not
// "20 EUR pallets" which really is in SYNTH_LINES) for the low value to survive.
function withLowPalletType(ans) {
  const clone = JSON.parse(JSON.stringify(ans));
  clone.orders[0].pallet_type.c = 0.3;
  clone.orders[0].pallet_type.q = 'not actually printed anywhere in this document';
  return clone;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
if (process.env.DEBUG_SMOKE) page.on('console', m => console.log('[browser]', m.type(), m.text()));
if (process.env.DEBUG_SMOKE) page.on('requestfailed', r => console.log('[reqfail]', r.url(), r.failure()?.errorText));
const aiBodies = [];
let currentAnswer = baseAnswer;
await page.route('**/*', async route => {
  const u = new URL(route.request().url());
  if (u.host === '127.0.0.1:' + server.address().port) return route.continue();
  // pdf.js — same npm install the Node-side tests use (lib/app-sandbox.mjs),
  // never the real CDN, so the doc-viewer's PDF path runs fully offline.
  if (u.hostname === 'cdn.jsdelivr.net' && /^\/npm\/pdfjs-dist@3\.11\.174\/build\/(pdf\.min\.js|pdf\.worker\.min\.js)$/.test(u.pathname)) {
    const file = path.join(PDFJS_DIR, path.basename(u.pathname));
    if (fs.existsSync(file)) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: fs.readFileSync(file) });
  }
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (u.host !== BACKEND) return route.abort();                       // other CDNs, fonts, sentry: not needed
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname === '/v1/ai/messages') {
    aiBodies.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ model: 'claude-sonnet-5', content: [{ type: 'text', text: JSON.stringify(currentAnswer) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) });
  }
  const table = u.pathname.split('/')[3] || '';
  const records = /FWKAQ/.test(table) ? refData.clients : /xu8DRf/.test(table) ? refData.locations : [];
  return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ records }) });
});
await page.addInitScript(() => {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Test User', role: 'owner', username: 'dimitris', loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600e3 }));
  localStorage.setItem('tms_jwt', 'synthetic.test.token');
  localStorage.setItem('tms_scan_engine', 'v2');
});

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) failed++; };
const shotArg = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : null;
const shotDir = shotArg ? path.dirname(shotArg) : null;
// fullPage, not viewport-clipped: a fixed-position overlay (the modal) can be
// mis-captured by Chromium's fullPage resize-and-repaint when it's used —
// one run showed the empty page BEHIND the modal instead of the modal
// itself. The viewport screenshot is also the more honest "1440 wide" shot.
const shot = async name => {
  if (!shotDir) return;
  await page.waitForTimeout(200);   // let the last DOM change actually paint before capturing
  await page.screenshot({ path: path.join(shotDir, name), fullPage: false });
};
const cancel = () => page.click('#modalFooter button:has-text("Άκυρο")');

try {
  await page.goto(base + 'app.html');
  await page.waitForSelector('#sidebar', { timeout: 20000 });

  // ═══ 1. International, synthetic PDF → v2 → full review-panel cycle ═══
  currentAnswer = withLowPalletType(baseAnswer);
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => openIntlScan());
  await page.waitForSelector('#scanFile', { state: 'attached' });
  check(/\.doc/.test(await page.getAttribute('#scanFile', 'accept')), 'intl file picker accepts .doc when v2 is on');
  await page.setInputFiles('#scanFile', { name: 'synthetic-order.pdf', mimeType: 'application/pdf', buffer: makePdf(SYNTH_LINES) });
  // window._scanResult is a plain global the app never clears on its own between
  // scans — without resetting it here, waitForFunction below can resolve on a
  // STALE result from nothing having run yet, racing the real extraction.
  await page.evaluate(() => { window._scanResult = null; });
  await page.click('#btnScanGo');
  await page.waitForFunction(() => window._scanResult && window._scanResult.data, null, { timeout: 20000 });
  check(aiBodies.length === 1, `one AI call for the PDF scan (got ${aiBodies.length})`);
  check(!!aiBodies[0]?.output_config?.format, 'structured output requested');
  await page.evaluate(() => _scanOpenStored());
  await page.waitForSelector('#f_PalletType', { timeout: 10000 });
  await page.waitForSelector('.scan-review-badge', { timeout: 15000 });
  check(await page.$('.scan-review-layout') !== null, 'review: side-by-side layout present (PDF)');
  check(await page.$('.doc-viewer-page canvas') !== null, 'review: PDF rendered to canvas');
  const spanCount = await page.evaluate(() => document.querySelectorAll('.doc-viewer-textlayer span').length);
  check(spanCount > 0, `review: PDF text layer built (${spanCount} spans)`);
  const highBadges0 = await page.evaluate(() => document.querySelectorAll('.scan-review-badge-high').length);
  const flaggedBadges0 = await page.evaluate(() => document.querySelectorAll('.scan-review-badge-med, .scan-review-badge-low').length);
  check(highBadges0 > 0 && flaggedBadges0 > 0, `review: confidence badges present (high=${highBadges0}, med/low=${flaggedBadges0})`);
  await shot('scan-review-01-intl-pdf-1440.png');


  await page.click('#ls_client');
  await page.waitForTimeout(300);
  check(await page.$('.doc-viewer-hl') !== null, 'review: clicking a field highlights its quote in the document');
  await shot('scan-review-02-field-highlight-1440.png');

  await page.click('.scan-review-header button');   // the one button there: «Αποδοχή βέβαιων»
  await page.waitForTimeout(200);
  const highBadges1 = await page.evaluate(() => document.querySelectorAll('.scan-review-badge-high').length);
  check(highBadges1 === 0, 'review: «Αποδοχή βέβαιων» clears the high-confidence badge(s)');
  const palletyStillFlagged = await page.evaluate(() =>
    document.getElementById('f_PalletType').classList.contains('scan-conf-low') || document.getElementById('f_PalletType').classList.contains('scan-conf-med'));
  check(palletyStillFlagged, 'review: the deliberately low-confidence field stays flagged after «Αποδοχή βέβαιων»');
  await shot('scan-review-03-accept-confident-1440.png');

  await cancel();
  await page.waitForTimeout(300);
  const layoutGoneAfterCancel = await page.evaluate(() => !document.getElementById('modalBody').innerHTML.includes('scan-review-layout'));
  check(layoutGoneAfterCancel, 'review: closing the modal detaches and restores the plain form');

  // ═══ 2. International, synthetic .doc → v2 → text doc-viewer + responsive ═══
  currentAnswer = baseAnswer;
  await page.evaluate(() => openIntlScan());
  await page.waitForSelector('#scanFile', { state: 'attached' });
  await page.setInputFiles('#scanFile', { name: 'synthetic-order.doc', mimeType: 'application/msword', buffer: makeDoc(SYNTH_LINES.join('\n')) });
  await page.evaluate(() => { window._scanResult = null; });
  await page.click('#btnScanGo');
  await page.waitForFunction(() => window._scanResult && window._scanResult.data, null, { timeout: 20000 });
  check(/Transport order SYN-0001/.test(JSON.stringify(aiBodies[aiBodies.length - 1]?.messages || '')), '.doc text reached the prompt');
  await page.evaluate(() => _scanOpenStored());
  await page.waitForSelector('#f_PalletType', { timeout: 10000 });
  await page.waitForSelector('.doc-viewer-text', { timeout: 10000 });
  check(await page.inputValue('#f_PalletType') === 'EUR', 'form (.doc): Pallet Type = EUR');
  check(await page.inputValue('#f_Reference') === 'SYN-0001', 'form (.doc): Reference = SYN-0001');
  check(/Acme Frozen Foods GmbH/.test(await page.textContent('.doc-viewer-text')), 'review: .doc rendered as plain text in the doc pane');
  await shot('scan-review-04-doc-text-1440.png');

  await page.setViewportSize({ width: 1080, height: 900 });
  await page.waitForTimeout(200);
  const stacked = await page.evaluate(() => getComputedStyle(document.querySelector('.scan-review-cols')).flexDirection === 'column');
  check(stacked, 'responsive: doc + form stack below ~1100px');
  await shot('scan-review-06-narrow-1100.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await cancel();
  await page.waitForTimeout(200);

  // ═══ 3. National, same engine + switch, different form ═══
  currentAnswer = baseAnswer;
  await page.evaluate(() => window.navigate('orders_natl'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => openNatlScan());
  await page.waitForSelector('#natlScanFile', { state: 'attached' });
  check(/\.doc/.test(await page.getAttribute('#natlScanFile', 'accept')), 'natl file picker accepts .doc when v2 is on');
  await page.setInputFiles('#natlScanFile', { name: 'synthetic-order.pdf', mimeType: 'application/pdf', buffer: makePdf(SYNTH_LINES) });
  await page.evaluate(() => { window._natlScanResult = null; });
  await page.click('#btnNatlScanGo');
  await page.waitForFunction(() => window._natlScanResult && window._natlScanResult.data, null, { timeout: 20000 });
  check(await page.evaluate(() => window._natlScanResult.data._engine) === 'v2', 'natl scan used engine v2');
  await page.click('#modalFooter button:has-text("Άνοιγμα φόρμας")');
  await page.waitForSelector('#ls_nclient', { timeout: 10000 });
  await page.waitForSelector('.scan-review-badge', { timeout: 15000 });
  check((await page.inputValue('#ls_nclient')).length > 0, 'natl form: client filled');
  check(/Alpha/.test(await page.inputValue('#ls_npickup')), 'natl form: pickup location filled');
  check(await page.$('.scan-review-layout') !== null, 'natl: review layout present');
  await shot('scan-review-05-natl-1440.png');
  await cancel();
  await page.waitForTimeout(200);

  // ═══ 4. Plain "New Order" (no scan at all) — must carry NONE of this ═══
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForTimeout(800);
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#f_Direction', { timeout: 10000 });
  const hasReviewLeftover = await page.evaluate(() =>
    !!document.querySelector('.scan-review-layout, .scan-conf-high, .scan-conf-med, .scan-conf-low, .scan-review-badge'));
  check(!hasReviewLeftover, 'non-scan "New Order" form: no review layout/classes present');
  await cancel();

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  console.log('✘ ' + e.message); failed++;
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all UI checks passed');
process.exit(failed ? 1 : 0);
