#!/usr/bin/env node
// UI smoke for scan engine v2 — the REAL app in a real browser, backend mocked.
//
//   node tools/scan-eval/ui-smoke.mjs [--headed] [--shot <png under .local/>]
//
// Why: the Node sandbox (lib/app-sandbox.mjs) stubs _openModal, so it proves
// what the scanner HANDS the form, not that the form renders it. This opens
// app.html from the working tree, turns the v2 switch on, drops an invented
// Word .doc into the International scan, and checks what the dispatcher sees
// in the order form. Every Worker request is answered locally with INVENTED
// data (fixtures/) — no token, no production call, nothing written anywhere.
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
const refData = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-ref.json'), 'utf8'));
const answer = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction-v2.json'), 'utf8'));
const { makeDoc, SYNTH_LINES } = await import('./test/synthetic-docs.mjs');
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
const aiBodies = [];
await page.route('**/*', async route => {
  const u = new URL(route.request().url());
  if (u.host === '127.0.0.1:' + server.address().port) return route.continue();
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (u.host !== BACKEND) return route.abort();                       // CDNs, fonts, sentry: not needed
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname === '/v1/ai/messages') {
    aiBodies.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ model: 'claude-sonnet-5', content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) });
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
try {
  await page.goto(base + 'app.html');
  await page.waitForSelector('#sidebar', { timeout: 20000 });
  await page.evaluate(() => window.navigate('orders_intl'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => openIntlScan());
  await page.waitForSelector('#scanFile', { state: 'attached' });
  check(/\.doc/.test(await page.getAttribute('#scanFile', 'accept')), 'file picker accepts .doc when v2 is on');
  await page.setInputFiles('#scanFile', { name: 'synthetic-order.doc', mimeType: 'application/msword', buffer: makeDoc(SYNTH_LINES.join('\n')) });
  await page.click('#btnScanGo');
  await page.waitForFunction(() => window._scanResult && window._scanResult.data, null, { timeout: 20000 });
  check(aiBodies.length === 1, `one AI call (got ${aiBodies.length})`);
  check(!!aiBodies[0]?.output_config?.format, 'structured output requested');
  check(/Transport order SYN-0001/.test(JSON.stringify(aiBodies[0]?.messages || '')), '.doc text reached the prompt');
  const preview = await page.textContent('#scanStatus');
  check(/Alpha Cold Store/.test(preview) && /Gamma Warehouse/.test(preview), 'preview shows both matched stops');
  await page.evaluate(() => _scanOpenStored());
  await page.waitForSelector('#f_PalletType', { timeout: 10000 });
  await page.waitForTimeout(800);
  check(await page.inputValue('#f_PalletType') === 'EUR', 'form: Pallet Type = EUR');
  const ref = await page.$('#f_Reference');
  check(ref && (await ref.inputValue()) === 'SYN-0001', 'form: Reference = SYN-0001');
  // Stop pickers are inputs: read their values, not the text.
  const vals = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].map(e => e.value).filter(Boolean).join(' | '));
  check(/Alpha Cold Store/.test(vals) && /Gamma Warehouse/.test(vals), 'form: loading + delivery stops carry the matched locations');
  check(/2031-01-10/.test(vals) && /2031-01-13/.test(vals), 'form: stop dates filled');
  const shot = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : null;
  if (shot) {
    if (!path.resolve(shot).split(path.sep).includes('.local')) throw new Error('--shot must be under .local/');
    await page.screenshot({ path: shot, fullPage: true });
  }
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} catch (e) {
  console.log('✘ ' + e.message); failed++;
} finally {
  await browser.close(); server.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all UI checks passed');
process.exit(failed ? 1 : 0);
