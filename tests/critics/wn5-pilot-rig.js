// Rig — National v5 F5 PILOT and DAY L (plan 2026-10-28 Q-9 / FE-2): who gets which board under the flag that ships —
// 'pilot' (WN_V5_USERS = the owner) from Thu 29/10, 'on' (every user) from day L.
//
// Why: the other v5 rigs rewrite the flag in memory ('on' or 'off'), so none of them runs the config.js that ships.
// This one serves the tree AS IT IS and proves who gets which board. Under 'pilot': the owner ('dimitris') the v5
// board, read-only at load (only GET to /plan/*), everyone else the old board with ZERO /plan/* requests. Under 'on':
// every user the v5 board. Under both, «Παλιά προβολή» (tms_wn5 = '0') gives the old board. Judged by what reached the fake backend (the table of this rig) and the DOM,
// never by a screenshot. Synthetic data only (public repo); nothing leaves the machine. Clock = the kit's week.
//
// Usage (cwd = a checkout with node_modules, memory note «Κριτές από worktree»):
//   node tests/critics/wn5-pilot-rig.js                         this tree
//   WN5_TREE=<git archive origin/main> node tests/critics/wn5-pilot-rig.js     plain-main proof ('off'): the preflight ✗
// Exit: 0 all green · 1 a check failed.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const kit = require('./wn5-rig-kit');

const TREE = kit.TREE;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CASES = [
  { name: 'owner dimitris', role: 'owner', username: 'dimitris', optIn: null },
  { name: 'owner dimitris + «Παλιά προβολή»', role: 'owner', username: 'dimitris', optIn: '0' },
  { name: 'demo_owner (not in WN_V5_USERS)', role: 'owner', username: 'demo_owner', optIn: null },
  { name: 'demo_dispatcher', role: 'dispatcher', username: 'demo_dispatcher', optIn: null },
  { name: 'demo_dispatcher + «Παλιά προβολή»', role: 'dispatcher', username: 'demo_dispatcher', optIn: '0' },
  { name: 'demo_accountant', role: 'accountant', username: 'demo_accountant', optIn: null },
  // Q-10 (FE-2): GET /plan/config says day L. The rig week is Sat 10/10 (kit clock Tue 13/10).
  { name: 'Q-10 dispatcher + «Παλιά προβολή», L = 10/10 (this week)', role: 'dispatcher', username: 'demo_dispatcher', optIn: '0', cfg: '2026-10-10' },
  { name: 'Q-10 dispatcher + «Παλιά προβολή», L = 17/10 (next week)', role: 'dispatcher', username: 'demo_dispatcher', optIn: '0', cfg: '2026-10-17' },
  { name: 'Q-10 dispatcher, L = 3/10 (a past week)', role: 'dispatcher', username: 'demo_dispatcher', optIn: null, cfg: '2026-10-03' },
  { name: 'Q-10 dispatcher, before L (cutover_day null)', role: 'dispatcher', username: 'demo_dispatcher', optIn: null, cfg: null },
];
const RIG_SAT = '2026-10-10';
// The rule of the plan, written out here (not WI4.v2Decide: the rig must not judge the app by the app's own code).
// Q-10: from day L the old view holds only for a week before L — a stored choice is set aside for a week ≥ L.
const afterL = (c) => typeof c.cfg === 'string' && RIG_SAT >= c.cfg;
const open = (flag, c) => flag === 'on' || (flag === 'pilot' && c.username === 'dimitris');
const want = (flag, c) => (!open(flag, c) ? 'old' : c.optIn !== '0' || afterL(c) ? 'v5' : 'old');
// the «Παλιά προβολή» button on the v5 bar: only for a week before L; the «only before» line when a choice was set aside
const wantBtn = (c) => !afterL(c);

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
  const S = { plan: [], pageErrors: [], console: [], planned: [], aborted: new Set(), stubbed: new Set() };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 300)));
  // Console rule of the kit (coordinator 27/10): Chrome's «Failed to load resource» for a request THIS rig aborted
  // (an external host) or answered ≥ 400 on purpose, and planFetch's line for that answer («rig sentinel …»), are
  // planned, listed apart; any other error line is an app error.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text().slice(0, 300), at = (m.location() || {}).url || '';
    ((/^Failed to load resource/.test(t) && (S.aborted.has(at) || S.stubbed.has(at))) || /rig sentinel /.test(t) ? S.planned : S.console).push(t + (at ? ' @ ' + at.slice(0, 80) : ''));
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
      else if (u.pathname === '/plan/config' && m === 'GET' && 'cfg' in c) ans = { cutover_day: c.cfg, opened_at: null, writes_open: false };
      else {
        // An unknown read is a route the Worker does not have yet (404 no_route, as before deploy 1 — e.g. GET
        // /plan/config of FE-1); a write is closed until day L (409). Both are planned answers, listed apart.
        const [st, type, code] = m === 'GET' ? [404, 'NOT_FOUND', 'no_route'] : [409, 'WRITES_CLOSED', 'writes_closed'];
        S.stubbed.add(req.url());
        return route.fulfill({ status: st, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: { type, code, message: `rig sentinel ${code}` } }) });
      }
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
  } catch (_) { /* neither board painted: reported below */ }
  // Long enough for a deferred v5 read (a timer after the paint) to show up in S.plan for a non-pilot user, and for
  // the PlanConfig answer to repaint a week ≥ L from the old board to v5 (Q-10).
  await page.waitForTimeout(3000);
  got = await page.evaluate(() => (document.querySelector('#content .wn5') ? 'v5' : document.querySelector('#content .wn4') ? 'old' : 'none'));
  // the v5 bar may sit in the app's top bar (outside #content), so the whole document is searched
  const bar = await page.evaluate(() => ({ btn: [...document.querySelectorAll('button[onclick*="WN5._switch"]')].some((b) => b.textContent.trim() === 'Παλιά προβολή'),
    closed: ((document.querySelector('[data-old-view="closed"]') || {}).textContent || '').trim() }));
  const flag = await page.evaluate(() => ({ flag: typeof FEATURES !== 'undefined' ? FEATURES.WN_V5 : undefined,
    users: typeof WN_V5_USERS !== 'undefined' ? WN_V5_USERS : undefined })).catch(() => ({}));
  await ctx.close();
  return { got, S, flag, bar };
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
  let flag;
  try {
    for (const c of CASES) {
      const r = await one(browser, origin, c);
      if (c === CASES[0]) {
        flag = r.flag.flag;
        ok('preflight', `config.js as served: WN_V5 'pilot' or 'on' (${flag}), WN_V5_USERS ['dimitris']`, ['pilot', 'on'].includes(flag) && JSON.stringify(r.flag.users) === '["dimitris"]', r.flag);
      }
      c.want = want(flag, c);
      ok(c.name, `paints the ${c.want} board`, r.got === c.want, r.got);
      if (c.want === 'v5') {
        ok(c.name, 'reads GET /plan/board', r.S.plan.includes('GET /plan/board'), r.S.plan);
        ok(c.name, 'read-only at load: no /plan/* request other than GET', r.S.plan.every((x) => x.startsWith('GET ')), r.S.plan);
        ok(c.name, `«Παλιά προβολή» ${wantBtn(c) ? 'offered' : 'not offered (week ≥ L)'}`, r.bar.btn === wantBtn(c), r.bar);
        if (c.optIn === '0' && afterL(c)) ok(c.name, 'says why: «… μόνο για εβδομάδες πριν από 10/10»', r.bar.closed === 'Η παλιά προβολή υπάρχει μόνο για εβδομάδες πριν από 10/10', r.bar);
      } else {
        // Q-10: a stored old-view choice under an open flag asks the base for day L — that one read, nothing else
        const allowed = open(flag, c) && c.optIn === '0' ? ['GET /plan/config'] : [];
        ok(c.name, allowed.length ? 'only GET /plan/config (is this week ≥ L?)' : 'zero /plan/* requests', r.S.plan.every((x) => allowed.includes(x)), r.S.plan);
      }
      ok(c.name, 'no page errors', r.S.pageErrors.length === 0, r.S.pageErrors);
      ok(c.name, '0 console errors' + (r.S.planned.length ? ` (${r.S.planned.length} planned: aborted hosts / stub answers)` : ''), r.S.console.length === 0, r.S.console);
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(fails ? `NO-GO: ${fails} check(s) failed` : `GO: WN_V5 '${flag}' opens v5 for ${flag === 'on' ? 'every user' : 'the owner alone'}; «Παλιά προβολή» gives the old board`);
  process.exit(fails ? 1 : 0);
})();
