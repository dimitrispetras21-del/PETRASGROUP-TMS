// Rig — National v5, FLAG-OFF IDENTITY (F4α Task T3; pattern of tests/critics/wi4-identity-rig.js).
//
// Why: F4α adds one seam line to modules/weekly_natl.js and new files to app.html. With FEATURES.WN_V5 = 'off' the
// old Weekly National must stay byte-identical — the same bytes, not «looks the same» — and the new files must not
// ACT at load (no listener, timer, observer, fetch; no /plan/* request at all). A diff of what the board produces can
// prove that; a screenshot cannot. Any byte of difference is NO-GO.
//
// Compared, baseline tree vs candidate tree, on one synthetic week (invented names and plates only — the repo is
// public), clock frozen at Tue 13/10/2026 09:30 Athens (W42), an in-memory facade, role dispatcher:
//   1. #content.innerHTML after renderWeeklyNatl() settles;
//   2. every facade request of the load (method, path, sorted query) as a sorted multiset;
//   3. ZERO activity at load from the v5 files (stacks of addEventListener / timers / fetch / observers);
//   4. ZERO requests to /plan/*.
// Steps 1–4 run twice: without a tms_wn5 key and with tms_wn5='1' (with the switch 'off' an opt-in changes nothing).
// Preflight: the candidate serves core/plan-api.js and modules/weekly_natl_v5.js and app.html loads both — on a
// plain-main candidate these are ✗ (404), which is how this rig fails on main.
//
// Usage:
//   git archive origin/main | tar -x -C <scratch>/main-base
//   WN5_BASE_DIR=<scratch>/main-base [WN5_CAND_DIR=<candidate tree>] node tests/critics/wn5-identity-rig.js [--keep <dir>]
// WN5_CAND_DIR defaults to the tree this file lives in. Exit 0 identical · 1 a difference · 2 usage.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const WT = path.join(__dirname, '../..');
const argv = process.argv.slice(2);
const keepAt = argv.indexOf('--keep');
const KEEP = keepAt >= 0 ? argv[keepAt + 1] : null;
const BASE_DIR = process.env.WN5_BASE_DIR;
const CAND_DIR = process.env.WN5_CAND_DIR || WT;
if (!BASE_DIR || !fs.existsSync(path.join(BASE_DIR, 'app.html'))) {
  console.error('WN5_BASE_DIR must point at a baseline tree (git archive origin/main | tar -x -C <dir>)');
  process.exit(2);
}
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), WT] }));
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const NOW = '2026-10-13T09:30:00+03:00';
const V5_RE = '/(core/plan-api|core/wn5-[a-z-]+|core/plan-ids|modules/weekly_natl_v5|modules/wn5_[a-z]+)\\.js';
const T = { NL: 'tblVW42cZnfC47gTb', TRK: 'tblEAPExIAjiA3asD', TRL: 'tblDcrqRJXzPrtYLm', DRV: 'tbl7UGmYhc2Y82pPs',
  PAR: 'tblLHl5m8bqONfhWv', LOC: 'tblxu8DRfTQOFRCzS', CLI: 'tblFWKAQVUzAM8mCE' };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json' };
function serve() {
  const roots = { base: path.resolve(BASE_DIR), cand: path.resolve(CAND_DIR) };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/(base|cand)(\/.*)$/);
    if (!m) { res.writeHead(404); return res.end(); }
    const file = path.join(roots[m[1]], decodeURIComponent(m[2] === '/' ? '/app.html' : m[2]));
    if (!file.startsWith(roots[m[1]]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const status = (url) => new Promise((r) => http.get(url, (res) => { res.resume(); r(res.statusCode); }).on('error', () => r(0)));

// W42 (Sat 10/10 – Fri 16/10/2026). Invented data only.
function seed() {
  const N = [1, 2, 3];
  const nl = (id, dir, load, del, f) => ({ id, fields: Object.assign({ Direction: dir, 'Loading DateTime': load, 'Delivery DateTime': del,
    'Total Pallets': 12, Client: ['recTstCli1'], Reference: 'N-' + id.slice(-3), Status: 'Pending', 'Source Type': 'National' }, f) });
  return {
    [T.TRK]: N.map((n) => ({ id: 'recTstTrk' + n, fields: { 'License Plate': 'TST-210' + n, Active: true } })),
    [T.TRL]: N.map((n) => ({ id: 'recTstTrl' + n, fields: { 'License Plate': 'TRL-510' + n } })),
    [T.DRV]: N.map((n) => ({ id: 'recTstDrv' + n, fields: { 'Full Name': 'Driver Test 0' + n, Active: true } })),
    [T.PAR]: [{ id: 'recTstPar1', fields: { 'Company Name': 'Partner Test One' } }],
    [T.CLI]: [{ id: 'recTstCli1', fields: { 'Company Name': 'ΠΕΛΑΤΗΣ Α' } }],
    [T.LOC]: [{ id: 'recTstLoc1', fields: { Name: 'Alpha Test', City: 'Veria', Country: 'GR' } }, { id: 'recTstLoc2', fields: { Name: 'Beta Test', City: 'Athens', Country: 'GR' } }],
    [T.NL]: [
      nl('recTstNl001', 'North→South', '2026-10-12T13:00:00.000Z', '2026-10-13T05:00:00.000Z',
        { Truck: ['recTstTrk1'], Trailer: ['recTstTrl1'], Driver: ['recTstDrv1'], Status: 'Assigned', 'Pickup Location 1': ['recTstLoc1'], 'Delivery Location 1': ['recTstLoc2'] }),
      nl('recTstNl002', 'North→South', '2026-10-14T13:00:00.000Z', '2026-10-15T05:00:00.000Z', { 'Pickup Location 1': ['recTstLoc1'], 'Delivery Location 1': ['recTstLoc2'] }),
      nl('recTstNl003', 'South→North', '2026-10-13T09:00:00.000Z', '2026-10-13T19:00:00.000Z',
        { Partner: ['recTstPar1'], 'Is Partner Trip': true, 'Partner Truck Plates': 'PRT-412', Status: 'Assigned', 'Pickup Location 1': ['recTstLoc2'], 'Delivery Location 1': ['recTstLoc1'] }),
    ],
  };
}
const clone = (o) => JSON.parse(JSON.stringify(o));

function initScript({ optIn, re }) {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role: 'dispatcher', username: 'demo_dispatcher', loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
  localStorage.setItem('tms_jwt', 'rig.identity.no-real-token');
  localStorage.setItem('tms_page', 'weekly_natl');
  localStorage.setItem('tms_sidebar_v2_migrated', '1');
  localStorage.setItem('tms_sidebar_collapsed', 'true');
  if (optIn) localStorage.setItem('tms_wn5', optIn); else localStorage.removeItem('tms_wn5');
  const RE = new RegExp(re);
  const acts = window.__v5acts = [];
  const note = (what) => { const m = String(new Error().stack || '').match(RE); if (m) acts.push(what + ' ← ' + m[0]); };
  const wrapFn = (obj, name, what) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function () { note(what); return f.apply(this, arguments); }; };
  wrapFn(EventTarget.prototype, 'addEventListener', 'addEventListener');
  ['setTimeout', 'setInterval', 'requestAnimationFrame', 'fetch'].forEach((n) => wrapFn(window, n, n));
  ['MutationObserver', 'ResizeObserver', 'IntersectionObserver'].forEach((n) => { const C = window[n]; if (!C) return; window[n] = class extends C { constructor(cb) { note(n); super(cb); } }; });
}

async function runOne(browser, origin, tree, optIn) {
  const ctx = await browser.newContext({ baseURL: `${origin}/${tree}/`, viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const db = seed();
  const S = { log: [], plan: [], inflight: 0, pageErrors: [] };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(initScript, { optIn, re: V5_RE });
  await page.route((u) => !u.href.startsWith(origin) && !u.href.includes(HOST), (route) => route.abort());
  // The candidate ships WN_V5 'off'; any other value is forced to 'off' here (this rig proves the closed switch).
  await page.route((u) => u.href.startsWith(origin) && /\/config\.js$/.test(new URL(u.href).pathname), async (route) => {
    const r = await route.fetch();
    const body = (await r.text()).replace(/WN_V5:\s*'(?:on|pilot)'/, "WN_V5: 'off'");
    await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
  });
  const json = (route, body, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async (route) => {
    S.inflight++;
    try {
      const req = route.request(); const u = new URL(req.url()); const m = req.method();
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (u.pathname.startsWith('/plan/')) { S.plan.push(m + ' ' + u.pathname); return json(route, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'identity rig: no /plan/* expected' } }, 404); }
      S.log.push(JSON.stringify({ m, path: u.pathname, q: [...u.searchParams].sort() }));
      const mm = u.pathname.match(/\/v0\/[^/]+\/([A-Za-z_][A-Za-z0-9_]*)(?:\/(rec[A-Za-z0-9]+))?$/);
      if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
      const tbl = db[mm[1]] || [];
      if (m === 'GET' && mm[2]) { const r = tbl.find((x) => x.id === mm[2]); return r ? json(route, clone(r)) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      if (m === 'GET') return json(route, { records: clone(tbl) });
      return json(route, { ok: true });
    } finally { S.inflight--; }
  });
  const t0 = Date.now();
  await page.goto('app.html');
  await page.waitForFunction(() => !!document.querySelector('#content .wn4') && !/Φόρτωση εβδομάδας/.test(document.getElementById('content').textContent), null, { timeout: 60000 });
  let quiet = 0;
  for (let i = 0; i < 300 && quiet < 8; i++) { quiet = S.inflight ? 0 : quiet + 1; await page.waitForTimeout(100); }
  // core/router.js appends .page-footer 2 s after navigate: app-shell timing, not board output.
  await page.waitForTimeout(Math.max(0, 2600 - (Date.now() - t0)));
  const C = {
    content: await page.evaluate(() => document.getElementById('content').innerHTML),
    requests: S.log.slice().sort(),
    pageErrors: S.pageErrors.slice(),
  };
  const acts = await page.evaluate(() => window.__v5acts.slice());
  const plan = S.plan.slice();
  await ctx.close();
  return { C, acts, plan };
}

function diff(a, b, at = '') {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return [`${at}: ${JSON.stringify(a).slice(0, 160)} ≠ ${JSON.stringify(b).slice(0, 160)}`];
  if (a && typeof a === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], at ? `${at}.${k}` : k));
  if (a === b) return [];
  const s1 = String(a), s2 = String(b); let i = 0; while (i < s1.length && s1[i] === s2[i]) i++;
  return [`${at}: first difference at char ${i}: «${s1.slice(Math.max(0, i - 60), i + 80)}» ≠ «${s2.slice(Math.max(0, i - 60), i + 80)}»`];
}

(async () => {
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  let fail = 0;
  const say = (good, msg, detail) => { if (!good) fail++; console.log(`${good ? '✓' : '✗'} ${msg}${good || !detail ? '' : '\n    ' + detail}`); };
  try {
    const candHtml = fs.readFileSync(path.join(CAND_DIR, 'app.html'), 'utf8');
    for (const f of ['core/plan-api.js', 'modules/weekly_natl_v5.js']) {
      const st = await status(`${origin}/cand/${f}`);
      say(st === 200 && candHtml.includes(`src="${f}?v=`), `preflight v5 file served and loaded by app.html: ${f}`, `HTTP ${st}, tag ${candHtml.includes(`src="${f}?v=`)}`);
    }
    for (const optIn of [null, '1']) {
      const tag = optIn ? `tms_wn5='${optIn}'` : 'no tms_wn5';
      const base = await runOne(browser, origin, 'base', optIn);
      const cand = await runOne(browser, origin, 'cand', optIn);
      if (KEEP) {
        fs.mkdirSync(KEEP, { recursive: true });
        fs.writeFileSync(path.join(KEEP, `base-${optIn || 'none'}.json`), JSON.stringify(base, null, 1));
        fs.writeFileSync(path.join(KEEP, `cand-${optIn || 'none'}.json`), JSON.stringify(cand, null, 1));
      }
      say(base.C.content.length > 1500 && /wn4/.test(base.C.content), `[${tag}] the baseline painted the old board (${base.C.content.length} chars)`);
      say(cand.acts.length === 0, `[${tag}] zero listener/timer/observer/fetch from the v5 files at load`, JSON.stringify(cand.acts));
      say(cand.plan.length === 0, `[${tag}] zero /plan/* requests with the switch off`, JSON.stringify(cand.plan));
      for (const key of Object.keys(base.C)) {
        const d = diff(base.C[key], cand.C[key], key);
        say(d.length === 0, `[${tag}] ${key} identical`, d.slice(0, 5).join('\n    '));
      }
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(fail ? `\nNO-GO: ${fail} check(s) failed` : '\nGO: flag-off identity holds');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
