#!/usr/bin/env node
// UI smoke for scan engine v2 — the REAL app in a real browser, backend mocked.
//
//   node tools/scan-eval/ui-smoke.mjs [--headed]
//
// Why: the Node sandbox (lib/app-sandbox.mjs) stubs _openModal, so it proves
// what the scanner HANDS the form, not that the form renders it. This opens
// app.html from the working tree, turns the v2 switch on, and runs four
// scenarios: an International scan from a synthetic PDF, one from a synthetic
// Word .doc, a National scan (same engine, different form), and a plain "New
// Order" (no scan at all). Every Worker request is answered locally with
// INVENTED data (fixtures/) — no token, no production call, nothing written
// anywhere.
//
// Owner 28/9/2026: the round-3 side-by-side review screen (core/scan-review.js,
// the split layout with the original document, confidence badges and «Αποδοχή
// βέβαιων») was removed — keep the plain form the order type always had, only
// give access to the official document elsewhere (paperclip badge, see
// docs-smoke.mjs). This file used to also prove the review panel's own
// behaviour (layout, highlight-on-click, accept-confident, responsive
// stacking) — none of that exists anymore, so those checks are gone. What
// replaces them: the form a v2 scan opens must look and fill EXACTLY like a
// scan always did before round 3, and window._scanPendingDoc (the file
// core/order-docs.js uploads after save) must be set while that form is open
// and cleared the moment it is closed/cancelled without saving.
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
const refData = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-ref.json'), 'utf8'));
const baseAnswer = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction-v2.json'), 'utf8'));
const { makeDoc, makePdf, SYNTH_LINES } = await import('./test/synthetic-docs.mjs');
const BACKEND = 'petras-tms-backend-staging.petrasgroup.workers.dev';

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
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (u.host !== BACKEND) return route.abort();                       // CDNs, fonts, sentry: not needed here
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
const cancel = () => page.click('#modalFooter button:has-text("Άκυρο")');
// Every .scan-review-* class/element must be gone — this IS the removal this
// file now exists to prove, so it is checked after every form-open below.
const noReviewLeftover = () => page.evaluate(() =>
  !document.querySelector('.scan-review-layout, .scan-review-header, .scan-review-cols, .scan-review-doc, .scan-review-form, .scan-review-badge, [class*="scan-review-"]'));
const pendingDoc = () => page.evaluate(() => window._scanPendingDoc ? { name: window._scanPendingDoc.file?.name, source: window._scanPendingDoc.source } : null);

try {
  await page.goto(base + 'app.html');
  await page.waitForSelector('#sidebar', { timeout: 20000 });

  // ═══ 1. International, synthetic PDF → v2 → plain prefilled form ═══
  currentAnswer = baseAnswer;
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => openIntlScan());
  await page.waitForSelector('#scanFile', { state: 'attached' });
  check(/\.doc/.test(await page.getAttribute('#scanFile', 'accept')), 'intl file picker accepts .doc when v2 is on');
  await page.setInputFiles('#scanFile', { name: 'synthetic-order.pdf', mimeType: 'application/pdf', buffer: makePdf(SYNTH_LINES) });
  // window._scanResult is a plain global the app never clears on its own between
  // scans — without resetting it here, waitForFunction below can resolve on a
  // STALE result from nothing having run yet, racing the real extraction.
  await page.evaluate(() => { window._scanResult = null; delete window._scanPendingDoc; });
  await page.click('#btnScanGo');
  await page.waitForFunction(() => window._scanResult && window._scanResult.data, null, { timeout: 20000 });
  check(aiBodies.length === 1, `one AI call for the PDF scan (got ${aiBodies.length})`);
  check(!!aiBodies[0]?.output_config?.format, 'structured output requested');
  await page.evaluate(() => _scanOpenStored());
  await page.waitForSelector('#f_PalletType', { timeout: 10000 });
  check(await noReviewLeftover(), 'PDF scan: form opened PLAIN — no .scan-review-* element anywhere');
  check(await page.inputValue('#f_PalletType') === 'EUR', 'PDF scan: form filled — Pallet Type = EUR');
  check(await page.inputValue('#f_Reference') === 'SYN-0001', 'PDF scan: form filled — Reference = SYN-0001');
  const pending1 = await pendingDoc();
  check(pending1?.name === 'synthetic-order.pdf' && pending1?.source === 'scan', `PDF scan: window._scanPendingDoc set for the storage upload (got ${JSON.stringify(pending1)})`);

  await cancel();
  await page.waitForTimeout(200);
  check((await pendingDoc()) == null, 'PDF scan: cancelling the form clears window._scanPendingDoc (closeModal choke point)');

  // ═══ 2. International, synthetic .doc → v2 → plain prefilled form ═══
  currentAnswer = baseAnswer;
  await page.evaluate(() => openIntlScan());
  await page.waitForSelector('#scanFile', { state: 'attached' });
  await page.setInputFiles('#scanFile', { name: 'synthetic-order.doc', mimeType: 'application/msword', buffer: makeDoc(SYNTH_LINES.join('\n')) });
  await page.evaluate(() => { window._scanResult = null; delete window._scanPendingDoc; });
  await page.click('#btnScanGo');
  await page.waitForFunction(() => window._scanResult && window._scanResult.data, null, { timeout: 20000 });
  check(/Transport order SYN-0001/.test(JSON.stringify(aiBodies[aiBodies.length - 1]?.messages || '')), '.doc text reached the prompt');
  await page.evaluate(() => _scanOpenStored());
  await page.waitForSelector('#f_PalletType', { timeout: 10000 });
  check(await noReviewLeftover(), '.doc scan: form opened PLAIN — no .scan-review-* element anywhere');
  check(await page.inputValue('#f_PalletType') === 'EUR', 'form (.doc): Pallet Type = EUR');
  check(await page.inputValue('#f_Reference') === 'SYN-0001', 'form (.doc): Reference = SYN-0001');
  const pending2 = await pendingDoc();
  check(pending2?.name === 'synthetic-order.doc' && pending2?.source === 'scan', `.doc scan: window._scanPendingDoc set (got ${JSON.stringify(pending2)})`);

  await cancel();
  await page.waitForTimeout(200);
  check((await pendingDoc()) == null, '.doc scan: cancelling the form clears window._scanPendingDoc');

  // ═══ 3. National, same engine + switch, different form ═══
  currentAnswer = baseAnswer;
  await page.evaluate(() => window.navigate('orders_natl'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => openNatlScan());
  await page.waitForSelector('#natlScanFile', { state: 'attached' });
  check(/\.doc/.test(await page.getAttribute('#natlScanFile', 'accept')), 'natl file picker accepts .doc when v2 is on');
  await page.setInputFiles('#natlScanFile', { name: 'synthetic-order.pdf', mimeType: 'application/pdf', buffer: makePdf(SYNTH_LINES) });
  await page.evaluate(() => { window._natlScanResult = null; delete window._scanPendingDoc; });
  await page.click('#btnNatlScanGo');
  await page.waitForFunction(() => window._natlScanResult && window._natlScanResult.data, null, { timeout: 20000 });
  check(await page.evaluate(() => window._natlScanResult.data._engine) === 'v2', 'natl scan used engine v2');
  await page.click('#modalFooter button:has-text("Άνοιγμα φόρμας")');
  await page.waitForSelector('#ls_nclient', { timeout: 10000 });
  check(await noReviewLeftover(), 'natl scan: form opened PLAIN — no .scan-review-* element anywhere');
  check((await page.inputValue('#ls_nclient')).length > 0, 'natl form: client filled');
  check(/Alpha/.test(await page.inputValue('#ls_npickup')), 'natl form: pickup location filled');
  // National has no document-storage path (order_documents is an FK to the
  // international `orders` table — core/order-docs.js) — the file is still
  // tagged so the save can say so instead of silently dropping it
  // (handleNatlOrderSaved), which needs window._scanPendingDoc set here too.
  const pending3 = await pendingDoc();
  check(pending3?.name === 'synthetic-order.pdf' && pending3?.source === 'scan', `natl scan: window._scanPendingDoc set (so save can show the "not supported" note) (got ${JSON.stringify(pending3)})`);

  await cancel();
  await page.waitForTimeout(200);
  check((await pendingDoc()) == null, 'natl scan: cancelling the form clears window._scanPendingDoc');

  // ═══ 4. Plain "New Order" (no scan at all) — must carry NONE of this ═══
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForTimeout(800);
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#f_Direction', { timeout: 10000 });
  check(await noReviewLeftover(), 'non-scan "New Order" form: no review layout/classes present');
  check((await pendingDoc()) == null, 'non-scan "New Order" form: window._scanPendingDoc never set');
  await cancel();

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  console.log('✘ ' + e.message); failed++;
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all UI checks passed');
process.exit(failed ? 1 : 0);
