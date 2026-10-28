// Rig — National v5 F5 PILOT (plan 2026-10-28 Q-9, owner 28/10): FEATURES.WN_V5 = 'pilot', WN_V5_USERS = the owner.
//
// Why: the other v5 rigs rewrite the flag in memory ('on' or 'off'), so none of them runs the config.js that ships.
// This one serves the tree AS IT IS and proves who gets which board: the owner ('dimitris') the v5 board, read-only
// (only GET to /plan/*), everyone else the old board with ZERO /plan/* requests, and the owner's own «Παλιά προβολή»
// (tms_wn5 = '0') the old board too. Judged by what reached the fake backend (the table of this rig) and the DOM,
// never by a screenshot. Synthetic data only (public repo); nothing leaves the machine. Clock = the kit's week.
//
// Usage (cwd = a checkout with node_modules, memory note «Κριτές από worktree»):
//   node tests/critics/wn5-pilot-rig.js                         this tree
//   WN5_TREE=<git archive origin/main> node tests/critics/wn5-pilot-rig.js     plain-main proof: the owner case ✗
// Exit: 0 all green · 1 a check failed.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const kit = require('./wn5-rig-kit');

const TREE = kit.TREE;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CASES = [
  { name: 'owner dimitris', role: 'owner', username: 'dimitris', optIn: null, want: 'v5' },
  { name: 'owner dimitris + «Παλιά προβολή»', role: 'owner', username: 'dimitris', optIn: '0', want: 'old' },
  { name: 'demo_owner (not in WN_V5_USERS)', role: 'owner', username: 'demo_owner', optIn: null, want: 'old' },
  { name: 'demo_dispatcher', role: 'dispatcher', username: 'demo_dispatcher', optIn: null, want: 'old' },
  { name: 'demo_accountant', role: 'accountant', username: 'demo_accountant', optIn: null, want: 'old' },
];

function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = path.join(TREE, decodeURIComponent(u.pathname === '/' ? '/app.html' : u.pathname));
    if (!file.startsWith(TREE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function one(browser, origin, c) {
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(kit.NOW));
  const S = { plan: [], pageErrors: [], console: [], planned: [], aborted: new Set() };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 300)));
  // Console rule of the kit (coordinator 27/10): Chrome's «Failed to load resource» for a request THIS rig aborted
  // (an external host) is planned, listed apart; any other error line is an app error.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text().slice(0, 300), at = (m.location() || {}).url || '';
    (/^Failed to load resource/.test(t) && S.aborted.has(at) ? S.planned : S.console).push(t + (at ? ' @ ' + at.slice(0, 80) : ''));
  });
  await page.addInitScript((x) => {
    localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig Test', role: x.role, username: x.username, loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
    localStorage.setItem('tms_jwt', 'rig.wn5.no-real-token');
    localStorage.setItem('tms_page', 'weekly_natl');
    localStorage.setItem('tms_sidebar_v2_migrated', '1');
    localStorage.setItem('tms_sidebar_collapsed', 'true');
    if (x.optIn != null) localStorage.setItem('tms_wn5', x.optIn); else localStorage.removeItem('tms_wn5');
  }, c);
  await page.route((u) => !u.href.startsWith(origin) && !u.href.includes(kit.HOST), (route) => { S.aborted.add(route.request().url()); return route.abort(); });
  const cors = { 'access-control-allow-origin': '*' };
  const board = kit.week();
  await page.route(`**/${kit.HOST}/**`, async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, cors) });
    let ans = m === 'GET' ? { records: [] } : { ok: true };
    if (u.pathname.startsWith('/plan/')) {
      S.plan.push(m + ' ' + u.pathname);
      if (u.pathname === '/plan/board') ans = board;
      else if (u.pathname === '/plan/lookups') ans = kit.LOOKUPS;
      else if (u.pathname === '/plan/notices') ans = { desk: 'natl', unread: [], recent: [] };
      else return route.fulfill({ status: 409, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: { type: 'WRITES_CLOSED', code: 'writes_closed', message: 'rig sentinel writes_closed' } }) });
    } else {
      const tid = (u.pathname.match(/\/v0\/[^/]+\/([A-Za-z0-9]+)/) || [])[1];
      if (m === 'GET' && tid === 'tblxu8DRfTQOFRCzS') ans = { records: kit.FACADE_LOCS };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(ans) });
  });
  await page.goto('app.html');
  let got = 'none';
  try {
    await page.waitForFunction(() => !!document.querySelector('#content > .wi4.wn5[data-state="ok"]')
      || (!!document.querySelector('#content .wn4') && !/Φόρτωση εβδομάδας/.test(document.getElementById('content').textContent)), null, { timeout: 30000 });
    got = await page.evaluate(() => (document.querySelector('#content .wn5') ? 'v5' : 'old'));
  } catch (_) { /* neither board painted: reported below */ }
  await page.waitForTimeout(500);
  const flag = await page.evaluate(() => ({ flag: typeof FEATURES !== 'undefined' ? FEATURES.WN_V5 : undefined,
    users: typeof WN_V5_USERS !== 'undefined' ? WN_V5_USERS : undefined })).catch(() => ({}));
  await ctx.close();
  return { got, S, flag };
}

(async () => {
  const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), kit.WT] }));
  let fails = 0;
  const ok = (scn, name, cond, detail) => {
    if (!cond) fails++;
    console.log(`${cond ? '✓' : '✗'} ${scn} — ${name}${cond || detail === undefined ? '' : '  → ' + JSON.stringify(detail).slice(0, 400)}`);
  };
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const c of CASES) {
      const r = await one(browser, origin, c);
      if (c === CASES[0]) ok('preflight', "config.js as served: WN_V5 'pilot', WN_V5_USERS ['dimitris']", r.flag.flag === 'pilot' && JSON.stringify(r.flag.users) === '["dimitris"]', r.flag);
      ok(c.name, `paints the ${c.want} board`, r.got === c.want, r.got);
      if (c.want === 'v5') {
        ok(c.name, 'reads GET /plan/board', r.S.plan.includes('GET /plan/board'), r.S.plan);
        ok(c.name, 'read-only at load: no /plan/* request other than GET', r.S.plan.every((x) => x.startsWith('GET ')), r.S.plan);
      } else {
        ok(c.name, 'zero /plan/* requests', r.S.plan.length === 0, r.S.plan);
      }
      ok(c.name, 'no page errors', r.S.pageErrors.length === 0, r.S.pageErrors);
      ok(c.name, '0 console errors' + (r.S.planned.length ? ` (${r.S.planned.length} planned: aborted external hosts)` : ''), r.S.console.length === 0, r.S.console);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(fails ? `NO-GO: ${fails} check(s) failed` : 'GO: the pilot opens v5 for the owner alone, read-only');
  process.exit(fails ? 1 : 0);
})();
