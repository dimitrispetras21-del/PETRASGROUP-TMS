// Rig (real Chromium): the «session: …» rows of app.html, counted where they land — the intercepted
// POST /app-errors — never in a vm. Why a browser: when core/auth.js turns a page away at load it assigns
// location.href while the page is still parsing, and Chromium then runs NO script after auth.js (measured
// 7/10). A vm runs every file to the end, so the round-2 vm tests passed for a hand-off (auth.js → api.js →
// utils.js) that never happens in a browser, and such a page wrote nothing. Asserted here:
//   1. unknown username at load        → exactly 1 row «session: login rejected at load — unknown username»
//   2. role mismatch at load           → exactly 1 row «… — role mismatch»
//   3. plain expiry / no login at load → 0 rows (every morning's first page), the page still counted
//   4. an at-load loop in one tab      → 0 rows for loads 1–49, 1 «redirect loop — 50 loads in N s» row at 50
//   5. first 401 of a page that passed auth.js (unchanged path) → 1 row, no «Unauthorized» rows
//   6. rows 1, 2, 4, 5 are counted by B-34 (tms-auditor/checks/B-34.sql patterns); the routine prefix is not
//   and no page sends a single facade request without a token.
//
// Usage (cwd = the MAIN repo root: it holds node_modules):
//   node <worktree>/tests/critics/session-at-load-rig.js <baseURL>
// baseURL serves the code under test, e.g. http://127.0.0.1:8991/.claude/worktrees/<dir>/. The page is opened
// as host «tms.test» mapped to the baseURL's host, because _postAppError and tmsStreakPost refuse to post from
// localhost/127.0.0.1 (the production log must stay true) and the posts ARE the proof here. Every request
// that leaves tms.test (the Worker, fonts, the Sentry CDN) is answered by the rig: POST /app-errors → 201
// (recorded), anything else → 401. Nothing reaches the network.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');   // the worktree under test
const req = (m) => require(require.resolve(m, { paths: [process.cwd(), ROOT] }));
const { chromium } = req('playwright');

const [,, BASE_ARG] = process.argv;
if (!BASE_ARG) { console.error('usage: node session-at-load-rig.js <baseURL>'); process.exit(2); }
const baseUrl = new URL(BASE_ARG);
const MAP_TO = baseUrl.hostname;
baseUrl.hostname = 'tms.test';
const BASE = baseUrl.toString().replace(/\/?$/, '/');

// B-34's exclusions, read from the catalog (one source): a row is «counted» unless a NOT LIKE matches it
const B34 = fs.readFileSync(path.join(ROOT, 'tms-auditor/checks/B-34.sql'), 'utf8');
const EXCLUDED = [...B34.matchAll(/message NOT LIKE '([^']*)'/g)].map((m) =>
  new RegExp('^' + m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 's'));
const countedByB34 = (msg) => !EXCLUDED.some((re) => re.test(msg));

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok || detail === undefined ? '' : '\n      ' + detail}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP tms.test ${MAP_TO}`] });
  const ctx = await browser.newContext();
  const rows = [];      // { message, page } of every POST /app-errors
  const facade = [];    // every facade request (/v0/…)
  let facadeAnswer = 401;
  await ctx.route((u) => u.hostname !== 'tms.test', async (route) => {
    const r = route.request();
    const u = r.url();
    if (u.endsWith('/app-errors') && r.method() === 'POST') {
      let b = {}; try { b = JSON.parse(r.postData() || '{}'); } catch (_) {}
      rows.push({ message: b.message, page: b.page });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (/\/v0\//.test(u)) facade.push(`${r.method()} ${u.split('/').slice(-1)[0].split('?')[0]}`);
    return route.fulfill({ status: facadeAnswer, contentType: 'application/json', body: '{"error":"Unauthorized"}' });
  });

  const goto = async (p, url) => {
    for (let attempt = 1; ; attempt++) {
      try { await p.goto(url, { timeout: 20000 }); return; } catch (e) {
        if (/interrupted by another navigation/i.test(e.message)) return;   // auth.js left during the load: expected
        if (attempt === 1 && /Timeout/i.test(e.message)) continue;          // flaky host: one retry
        throw e;
      }
    }
  };
  const settle = (p, ms) => p.waitForTimeout(ms);
  // A fresh tab (fresh sessionStorage) standing on index.html, with the given login in localStorage
  const newTab = async () => { const p = await ctx.newPage(); await goto(p, BASE + 'index.html'); return p; };
  const setLogin = (p, login) => p.evaluate((l) => {
    localStorage.removeItem('tms_user'); localStorage.removeItem('tms_jwt');
    if (l) { localStorage.setItem('tms_user', JSON.stringify(l)); localStorage.setItem('tms_jwt', 'x.y.z'); }
  }, login);
  // app.html, turned away (or not) — returns the rows that one load wrote
  const loadApp = async (p, login, waitMs = 400) => {
    await setLogin(p, login);
    const before = rows.length;
    await goto(p, BASE + 'app.html#dashboard');
    await p.waitForURL(/index\.html/, { timeout: 15000 });
    await settle(p, waitMs);
    return rows.slice(before);
  };
  const streak = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('tms_session_expired') || 'null'));

  const probe = await newTab();
  const users = await probe.evaluate(() => (typeof USERS !== 'undefined' ? USERS : []).map((u) => ({ username: u.username, role: u.role })));
  await probe.close();
  if (!users.length) throw new Error('index.html exposes no USERS roster');
  const real = users[0];
  const otherRole = ['owner', 'dispatcher', 'management', 'accountant', 'warehouse'].find((r) => r !== real.role);
  const H = 3600e3;
  const msgs = (rs) => rs.map((r) => r.message);
  const counted = [];

  // 1. unknown username
  {
    const p = await newTab();
    const got = await loadApp(p, { name: 'G', username: 'ghost_zz', role: real.role, expiresAt: Date.now() + H });
    check(got.length === 1 && /^session: login rejected at load — unknown username \(user ghost_zz; exp in 60 min; nav navigate; from none; [^;]+; #dashboard\)$/.test(got[0].message),
      'unknown username at load → exactly 1 row', JSON.stringify(msgs(got)));
    check(got.every((r) => /app\.html/.test(r.page || '')), 'the row is posted by the page that was turned away (app.html)', JSON.stringify(got));
    const s = await streak(p);
    check(s && s.n === 1 && s.user === 'ghost_zz', 'the page is counted in the tab streak, with its user', JSON.stringify(s));
    counted.push(...msgs(got));
    await p.close();
  }
  // 2. role mismatch (a roster user whose stored role is not the roster's)
  {
    const p = await newTab();
    const got = await loadApp(p, { name: 'R', username: real.username, role: otherRole, expiresAt: Date.now() + 2 * H });
    check(got.length === 1 && got[0].message.startsWith(`session: login rejected at load — role mismatch (user ${real.username}; exp in 120 min;`),
      'role mismatch at load → exactly 1 row', JSON.stringify(msgs(got)));
    counted.push(...msgs(got));
    await p.close();
  }
  // 3. plain expiry / no login: silent, still counted
  for (const [what, login] of [['plain expiry', { name: 'E', username: real.username, role: real.role, expiresAt: Date.now() - 60e3 }], ['no login', null]]) {
    const p = await newTab();
    const got = await loadApp(p, login, 800);
    check(got.length === 0, `${what} at load → 0 rows`, JSON.stringify(msgs(got)));
    const s = await streak(p);
    check(s && s.n === 1, `${what} at load → counted (n = 1)`, JSON.stringify(s));
    await p.close();
  }
  // 4. an at-load loop in ONE tab: an expired login, 50 loads
  {
    const p = await newTab();
    const t0 = Date.now();
    const mark = rows.length;
    for (let i = 1; i <= 49; i++) await loadApp(p, { name: 'L', username: real.username, role: real.role, expiresAt: t0 - 3 * 60e3 }, 30);
    await settle(p, 500);   // a late POST of loads 1–49 would land by now
    const early = rows.slice(mark);
    check(early.length === 0, 'at-load loop: loads 1–49 write nothing', JSON.stringify(msgs(early)));
    const got = await loadApp(p, { name: 'L', username: real.username, role: real.role, expiresAt: t0 - 3 * 60e3 }, 800);
    const re = new RegExp(`^session: redirect loop — 50 loads in \\d+ s \\(user ${real.username}, reason expired; expired ×50; exp \\d+ min ago; nav navigate; from none; [^;]+; #dashboard\\)$`);
    check(got.length === 1 && re.test(got[0].message), 'at-load loop: load 50 writes ONE loop row with the count', JSON.stringify(msgs(got)));
    const s = await streak(p);
    check(s && s.n === 50, 'at-load loop: streak n = 50', JSON.stringify(s && { n: s.n, seen: s.seen }));
    counted.push(...msgs(got));
    await p.close();
  }
  check(facade.length === 0, 'no page turned away at load sent a facade request', JSON.stringify(facade));

  // 5. the first-401 path (a page that passed auth.js; the Worker refuses the token): unchanged, 1 row
  {
    const p = await newTab();
    const got = await loadApp(p, { name: 'R', username: real.username, role: real.role, expiresAt: Date.now() + 5 * H }, 1200);
    check(got.length === 1 && got[0].message.startsWith(`session: rejected before expiry → login (user ${real.username}; first 401: `),
      'first 401 → exactly 1 row (rejected before expiry)', JSON.stringify(msgs(got)));
    check(!got.some((r) => /Unauthorized/.test(r.message)), 'first 401 → no «Unauthorized» rows', JSON.stringify(msgs(got)));
    check(facade.length >= 1, 'first 401: the page did reach the facade (it passed auth.js)', JSON.stringify(facade));
    counted.push(...msgs(got));
    await p.close();
  }

  // 6. B-34
  check(counted.length === 4 && counted.every(countedByB34), 'B-34 counts the tamper, role, loop and rejected rows', JSON.stringify(counted));
  check(!countedByB34('session: expired → login (user x; first 401: TRUCKS; nav navigate; from none; Win Chrome 149; #dashboard)'),
    'B-34 excludes the routine «session: expired» prefix');

  await browser.close();
  console.log(`\n${failures ? 'FAIL' : 'PASS'}: ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('RIG ERROR', e); process.exit(1); });
