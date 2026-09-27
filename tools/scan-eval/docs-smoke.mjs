#!/usr/bin/env node
// UI smoke for order documents (Scan Round 3, core/order-docs.js) — the REAL
// app in a real browser, backend + storage mocked. Pattern of ./ui-smoke.mjs:
// serve the working tree over a local HTTP server, mock every Worker request
// with INVENTED data (no token, no production call, nothing written anywhere).
//
//   node tools/scan-eval/docs-smoke.mjs [--headed]
//
// Covers (per the round-3 handoff):
//   1. paperclip badge on the right order only — Intl list / Weekly / Daily Ops
//   2. badge click -> viewer modal -> doc list -> inline preview of a synthetic PDF
//   3. post-save hook (as submitIntlOrder calls it) -> one POST /docs/upload,
//      correct sha256 + order + source=scan
//   4. upload failure -> persistent banner (NOT a fading toast) + working retry
//   5. 501 (storage not deployed) -> the honest "not enabled yet" message
//   6. ORDER_DOCS index unavailable -> pages still render, exactly one console.warn
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const BACKEND = 'petras-tms-backend-staging.petrasgroup.workers.dev';
// require.resolve walks up from HERE (Node's normal module resolution), not just
// under REPO — this worktree has no node_modules of its own and finds the main
// checkout's, same as ui-smoke.mjs and lib/app-sandbox.mjs.
const PDFJS_DIR = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build');
const { makePdf, SYNTH_LINES } = await import('./test/synthetic-docs.mjs');

// Facade ids (config.js TABLES) — hardcoded here the same way ui-smoke.mjs
// hardcodes BACKEND: these ids are stable API surface, not implementation detail.
const ORDERS_TBL = 'tblgHlNmLBH3JTdIM';
const ORDER_DOCS_TBL = 'tblOrderDocuments';

const SHOTS = path.join(REPO, 'docs/data-audit/2026-09/shots');

// Local calendar date (NOT toISOString, which is UTC): daily_ops.js's "today"
// bucket (localToday(), core/utils.js) reads the BROWSER's local Y/M/D, and a
// run just after local midnight but before UTC midnight would otherwise stamp
// these fixtures as "yesterday" and silently move them out of the sections
// this test asserts on.
const _now = new Date();
const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
const order = (id, ref) => ({ id, fields: {
  Type: 'International', Direction: 'Export', Status: 'Pending',
  'Loading DateTime': today + 'T08:00:00.000Z',
  'Delivery DateTime': today + 'T18:00:00.000Z',
  'Total Pallets': 10, Reference: ref,
} });
// recOrderA has a stored document (ORDER_DOCS index below); recOrderB does not
// — the one assertion every page in this test repeats: the badge tells them apart.
const ORDERS_FIXTURE = [order('recOrderA', 'REF-A-DOC'), order('recOrderB', 'REF-B-NODOC')];
const DOC_ID = 'recDoc1';
const DOC_FILENAME = 'delivery-note.pdf';
// A REAL one-page PDF with a text layer (same fixture ui-smoke.mjs uses for the
// scan-review doc-viewer), not a bare "%PDF" string — the viewer screenshot must
// prove an actual page rendered, not just that some bytes moved through.
const DOC_BYTES = makePdf(SYNTH_LINES);

// Mutable test knobs the route handler reads live.
const state = {
  indexFails: false,
  uploadMode: 'success', // 'success' | 'fail' | '501'
};
const uploadCalls = [];

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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); // matches this repo's docs/data-audit shot convention
const errors = [];
const consoleWarnings = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'warning' || msg.type() === 'warn') consoleWarnings.push(msg.text()); });

await page.route('**/*', async route => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.host === '127.0.0.1:' + server.address().port) return route.continue();
  // pdf.js — same npm install the Node-side tests use (lib/app-sandbox.mjs) and
  // ui-smoke.mjs's own route, never the real CDN: the -02 viewer shot must show
  // an actually-rendered page, not "pdf.js failed to load" from an aborted CDN request.
  if (u.hostname === 'cdn.jsdelivr.net' && /^\/npm\/pdfjs-dist@3\.11\.174\/build\/(pdf\.min\.js|pdf\.worker\.min\.js)$/.test(u.pathname)) {
    const file = path.join(PDFJS_DIR, path.basename(u.pathname));
    if (fs.existsSync(file)) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: fs.readFileSync(file) });
  }
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (u.host !== BACKEND) return route.abort(); // other CDNs, fonts, sentry: not needed
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

  // ── /docs/* (file storage) ──
  if (u.pathname === '/docs/upload' && req.method() === 'POST') {
    const call = {
      order: u.searchParams.get('order'),
      sha256: u.searchParams.get('sha256'),
      filename: u.searchParams.get('filename'),
      source: u.searchParams.get('source'),
      contentType: req.headers()['content-type'],
    };
    uploadCalls.push(call);
    if (state.uploadMode === '501') return route.fulfill({ status: 501, headers: cors, body: JSON.stringify({ error: 'Document storage is not configured' }) });
    if (state.uploadMode === 'fail') return route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ error: 'storage backend unavailable' }) });
    return route.fulfill({ status: 201, headers: cors, body: JSON.stringify({ id: DOC_ID, order_id: call.order, sha256: call.sha256, filename: call.filename, mime: 'application/pdf', size: DOC_BYTES.length, source: call.source, created_at: new Date().toISOString() }) });
  }
  if (u.pathname === '/docs/list') {
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify([{ id: DOC_ID, order_id: u.searchParams.get('order'), sha256: 'x', filename: DOC_FILENAME, mime: 'application/pdf', size: DOC_BYTES.length, source: 'upload', created_at: '2026-09-27T10:00:00.000Z', uploaded_by: 'dimitris' }]) });
  }
  if (u.pathname === `/docs/file/${DOC_ID}`) {
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/pdf' }, body: DOC_BYTES });
  }

  // ── facade GET (/v0/<base>/<tableId>) ──
  const m = u.pathname.match(/^\/v0\/[^/]+\/([^/]+)/);
  const table = m ? m[1] : '';
  if (table === ORDER_DOCS_TBL) {
    if (state.indexFails) return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: 'Table not available on this backend' }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ records: [{ id: 'recDocIdx1', fields: { Order: ['recOrderA'] } }] }) });
  }
  if (table === ORDERS_TBL) {
    const filter = u.searchParams.get('filterByFormula') || '';
    const records = filter.includes("Direction}='Import'") ? [] : ORDERS_FIXTURE;
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ records }) });
  }
  // Every other table (ref data, ORDER_STOPS, local_moves, …): empty but OK —
  // exactly what "badges are decoration" must degrade to on real /docs/* gaps.
  return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ records: [] }) });
});

await page.addInitScript(() => {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Test User', role: 'owner', username: 'dimitris', loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600e3 }));
  localStorage.setItem('tms_jwt', 'synthetic.test.token');
});

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) failed++; };

try {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.goto(base + 'app.html');
  await page.waitForSelector('#sidebar', { timeout: 20000 });

  // ── 1. Intl orders list: badge on recOrderA only ──
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForSelector('#irow_recOrderA', { timeout: 15000 });
  await page.waitForTimeout(400); // OrderDocs.preloadIndex settles alongside the other Promise.all entries
  const badgeA = await page.$('#irow_recOrderA .od-badge');
  const badgeB = await page.$('#irow_recOrderB .od-badge');
  check(!!badgeA, 'Intl list: badge shown on the order WITH a document');
  check(!badgeB, 'Intl list: NO badge on the order without one');
  await page.screenshot({ path: path.join(SHOTS, 'scan-review-docs-01-list-badge-1440.png'), fullPage: false });

  // ── 2. Click badge -> viewer -> doc list -> inline preview ──
  await badgeA.click();
  await page.waitForSelector('#_odViewerBody .od-row', { timeout: 8000 });
  const listText = await page.textContent('#_odViewerBody');
  check(listText.includes(DOC_FILENAME), 'Viewer: lists the order\'s document by filename');
  await page.click('#_odViewerBody button:has-text("Προβολή")');
  // core/doc-viewer.js is a concurrent agent's file — pdf.js is served from the
  // repo's own node_modules (never the real CDN, see the route above), so its
  // real render path runs offline the same way ui-smoke.mjs proves it. Assert
  // the actual rendered canvas, not just "some content landed" — a fallback
  // iframe or an error message would also make innerHTML non-empty.
  await page.waitForSelector(`#_odInline_${DOC_ID} canvas`, { timeout: 10000 });
  check(await page.$(`#_odInline_${DOC_ID} .doc-viewer-unsupported`) === null, 'Viewer: no "pdf.js failed to load" error');
  const textLayerLen = await page.evaluate((id) => document.querySelector(`#_odInline_${id} .doc-viewer-textlayer`)?.textContent?.length || 0, DOC_ID);
  check(textLayerLen > 0, `Viewer: PDF text layer present (${textLayerLen} chars) — a real page, not a blank canvas`);
  await page.screenshot({ path: path.join(SHOTS, 'scan-review-docs-02-viewer-1440.png'), fullPage: false });
  await page.evaluate(() => closeModal());

  // ── 3. Weekly International: same badge rule ──
  await page.evaluate(() => window.navigate('weekly_intl'));
  await page.waitForSelector('.wk3', { timeout: 15000 });
  await page.waitForTimeout(500);
  const wiHtml = await page.evaluate(() => document.getElementById('content').innerHTML);
  check(/od-badge/.test(wiHtml), 'Weekly International: paperclip badge present on the board');
  await page.screenshot({ path: path.join(SHOTS, 'scan-review-docs-03-weekly-badge-1440.png'), fullPage: false });

  // ── 4. Daily Ops: same badge rule ──
  await page.evaluate(() => window.navigate('daily_ops'));
  await page.waitForSelector('.do-page, #content table', { timeout: 15000 });
  await page.waitForTimeout(500);
  const doHtml = await page.evaluate(() => document.getElementById('content').innerHTML);
  check(/od-badge/.test(doHtml), 'Daily Ops: paperclip badge present');
  await page.screenshot({ path: path.join(SHOTS, 'scan-review-docs-04-daily-badge-1440.png'), fullPage: false });

  // ── 5. Post-save hook: exactly what submitIntlOrder calls after atCreate ──
  const scanBytes = Array.from(Buffer.from('SCAN-ROUND-3-SYNTHETIC-ORDER-BYTES'));
  const expectedSha = crypto.createHash('sha256').update(Buffer.from(scanBytes)).digest('hex');
  await page.evaluate(async (bytes) => {
    const file = new File([new Uint8Array(bytes)], 'scan.pdf', { type: 'application/pdf' });
    window._scanPendingDoc = { file, source: 'scan' };
    await window.OrderDocs.handleOrderSaved('recOrderNew');
  }, scanBytes);
  await page.waitForTimeout(300);
  check(uploadCalls.length === 1, `post-save hook: exactly one POST /docs/upload (got ${uploadCalls.length})`);
  check(uploadCalls[0]?.order === 'recOrderNew', 'post-save hook: correct order id in the request');
  check(uploadCalls[0]?.sha256 === expectedSha, 'post-save hook: sha256 matches the file bytes computed in Node');
  check(uploadCalls[0]?.source === 'scan', 'post-save hook: source=scan');
  const pendingCleared = await page.evaluate(() => window._scanPendingDoc);
  check(pendingCleared == null, 'post-save hook: _scanPendingDoc cleared after use (one-shot)');

  // ── 6. Upload failure -> persistent banner (not a fading toast) + retry ──
  state.uploadMode = 'fail';
  await page.evaluate(async (bytes) => {
    const file = new File([new Uint8Array(bytes)], 'scan2.pdf', { type: 'application/pdf' });
    window._scanPendingDoc = { file, source: 'scan' };
    await window.OrderDocs.handleOrderSaved('recOrderFail');
  }, scanBytes);
  await page.waitForSelector('.od-banner', { timeout: 8000 });
  const bannerText1 = await page.textContent('.od-banner');
  check(/ΔΕΝ ανέβηκε/.test(bannerText1), 'upload failure: banner names the order and says the upload did not happen');
  await page.waitForTimeout(3500); // longer than toast()'s 3000ms auto-dismiss
  check(!!(await page.$('.od-banner')), 'upload failure: banner is still there after 3.5s — NOT a fading toast');
  await page.screenshot({ path: path.join(SHOTS, 'scan-review-docs-05-upload-failed-1440.png'), fullPage: false });
  const callsBeforeRetry = uploadCalls.length; // 2: the post-save-hook success (#5) + this failed attempt
  state.uploadMode = 'success';
  await page.click('.od-banner .od-banner-retry');
  await page.waitForSelector('.od-banner', { state: 'detached', timeout: 8000 });
  check(uploadCalls.length === callsBeforeRetry + 1, `upload failure: retry sends exactly one more POST (got ${uploadCalls.length - callsBeforeRetry})`);
  check(uploadCalls[callsBeforeRetry]?.sha256 === expectedSha, 'upload failure: retry payload is byte-identical (same sha256, same file object)');
  check(uploadCalls[callsBeforeRetry]?.order === 'recOrderFail', 'upload failure: retry targets the SAME order as the failed attempt');

  // ── 7. 501 -> honest "not enabled yet" message ──
  state.uploadMode = '501';
  await page.evaluate(async (bytes) => {
    const file = new File([new Uint8Array(bytes)], 'scan3.pdf', { type: 'application/pdf' });
    window._scanPendingDoc = { file, source: 'scan' };
    await window.OrderDocs.handleOrderSaved('recOrder501');
  }, scanBytes);
  await page.waitForSelector('.od-banner', { timeout: 8000 });
  const bannerText2 = await page.textContent('.od-banner');
  check(/δεν έχει ενεργοποιηθεί ακόμη/.test(bannerText2), '501: banner says storage is not enabled yet, not a generic error');
  await page.evaluate(() => document.querySelector('.od-banner')?.remove());
  state.uploadMode = 'success';

  // ── 8. ORDER_DOCS index unavailable -> page still renders, ONE console.warn ──
  state.indexFails = true;
  consoleWarnings.length = 0;
  const idxResult = await page.evaluate(async () => { const s = await window.OrderDocs.preloadIndex(true); return s.size; });
  check(idxResult === 0, 'index failure: preloadIndex resolves (does not throw), empty set');
  check(consoleWarnings.filter(w => w.includes('[order-docs] index unavailable')).length === 1, `index failure: exactly one console.warn (got ${consoleWarnings.filter(w => w.includes('[order-docs]')).length})`);
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForSelector('#irow_recOrderA', { timeout: 15000 });
  const badgeAfterIndexFail = await page.$('#irow_recOrderA .od-badge');
  check(!badgeAfterIndexFail, 'index failure: badge silently absent, row still renders');

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  console.log('✘ ' + e.message); failed++;
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all UI checks passed');
process.exit(failed ? 1 : 0);
