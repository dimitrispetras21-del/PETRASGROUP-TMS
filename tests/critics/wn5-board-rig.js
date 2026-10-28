// Rig — National v5 board (F4α, plan docs/superpowers/plans/2026-10-26-f4a-national-v5-screens.md, Tasks T3–T8).
//
// Why: v5 owns its data (GET /plan/board) and its writes (/plan/*). A screenshot or a green toast proves nothing
// about either (CLAUDE.md «η απόδειξη είναι ο πίνακας»). This rig drives the REAL app against a fake /plan/* and
// judges every scenario by what reached it — method, path, query, raw body, count: S.plan is «the table» of this rig —
// and by what the page shows. Synthetic data only (the repo is public).
//
// The fake answers with THE ONE error shape of /plan/* (worker/src/index.js planError) and SENTINEL messages
// («rig sentinel <code>»): the screen must show exactly the body's message, which also proves it holds no Greek
// copy of a Worker text. Default for every non-dry write: 409 WRITES_CLOSED/writes_closed, as deployed until day L.
//
// Usage (Playwright; this worktree has node_modules — else cwd = the main repo, memory note «Κριτές από worktree»):
//   node tests/critics/wn5-board-rig.js [scenario …] [--shots <dir>]
//   WN5_TREE=<tree> node tests/critics/wn5-board-rig.js …      plain-main proof: WN5_TREE=<git archive origin/main>
//   node tests/critics/wn5-board-rig.js --check-fixture         no browser: the synthetic week is invented, mirrors the
//                                                               base's per-day rule at the rig clock, holds every case
// The flag lives in config.js; it is rewritten in memory (WN_V5 'on' unless a scenario says otherwise), never on
// disk. A tree without the key (plain main) is a ✗ line of the preflight, never a crash: every scenario still runs
// and says what is missing. Nothing leaves the machine. Clock frozen at Tue 13/10/2026 09:30 Athens (W42, the «now»
// of Figma 2035:7735), role dispatcher, 1920×1080.
// Exit: 0 all green · 1 a check failed · 2 usage (unknown scenario).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const WT = path.join(__dirname, '../..');
const TREE = path.resolve(process.env.WN5_TREE || WT);
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const NOW = '2026-10-13T09:30:00+03:00';
const WEEK = '2026-10-10';                  // the Saturday of W42
const argv = process.argv.slice(2);
const shotsAt = argv.indexOf('--shots');
const OUT = shotsAt >= 0 ? argv[shotsAt + 1] : null;
const want = argv.filter((a, i) => !a.startsWith('--') && !(shotsAt >= 0 && i === shotsAt + 1));
const clone = (o) => JSON.parse(JSON.stringify(o));
const EMPTY = (week) => ({ week, cycles: [], waiting: [], hub: [], notices: [] });

let fails = 0;
function ok(scn, name, cond, detail) {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond || detail === undefined ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`);
  return !!cond;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json' };
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

// Runs in the page before any script: a demo_* roster user (config.js USERS), or the tamper guard bounces.
function initScript(role) {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role, username: 'demo_' + role, loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
  localStorage.setItem('tms_jwt', 'rig.wn5.no-real-token');
  localStorage.setItem('tms_page', 'weekly_natl');
  localStorage.setItem('tms_sidebar_v2_migrated', '1');
  localStorage.setItem('tms_sidebar_collapsed', 'true');
}

// The one error shape of /plan/*. Texts are SENTINELS, never Greek copies.
const planErr = (status, type, code) => [status, { error: { type, code, message: `rig sentinel ${code}` } }];
function defaultPlan(e, S) {
  if (e.m === 'GET' && e.path === '/plan/board') return [200, Object.assign(clone(S.board), { week: e.q.week })];
  if (e.m === 'GET' && e.path === '/plan/notices') return [200, { desk: e.q.desk, unread: [], recent: [] }];
  return planErr(409, 'WRITES_CLOSED', 'writes_closed');   // PLAN_WRITES_OPEN = false until day L
}
// The rig catalogue every board open gets (GET /plan/lookups, live since Worker deploy 1): the fixture's places by id
// (stops name 1–7; 8 = the N-T020 national's Lamia), id 1 the one hub — the shape of 074a plan_lookups.
const DEF_LOOKUPS = () => {
  const names = { 1: 'ΒΕΡΟΙΑ TEST', 2: 'Rentis Test', 3: 'Aspropyrgos Test', 4: 'Oinofyta Test', 5: 'Larisa Test', 6: 'Thessaloniki Test', 7: 'Athens Test', 8: 'Lamia Test' };
  return { locations: Object.keys(names).map((k) => ({ id: Number(k), legacy_id: 'recDEF' + k, name: names[k], address: null, city: null, phone: null, is_hub: k === '1' })),
    clients: [], trucks: [], trailers: [], drivers: [], partners: [] };
};
const routeKey = (m, p) => `${m} ${p.replace(/\/\d+(?=\/|$)/g, '/:id')}`;

// opts: role · flag ('on' | 'pilot' | 'off') · board · plan { 'POST /plan/x/:id/y': (entry, S) => [status, body] } · viewport
// · sidebar ('open': the app's default 228px sidebar, as router.js opens it for a new user; else collapsed)
async function openBoard(browser, origin, opts = {}) {
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: opts.viewport || { width: 1920, height: 1080 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));                         // BEFORE the session is stamped
  const S = { plan: [], pageErrors: [], preflight: [], board: clone(opts.board || EMPTY(WEEK)), routes: opts.plan || {}, n: {} };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(initScript, opts.role || 'dispatcher');
  if (opts.sidebar === 'open') await page.addInitScript(() => localStorage.setItem('tms_sidebar_collapsed', 'false'));
  await page.route((u) => !u.href.startsWith(origin) && !u.href.includes(HOST), (route) => route.abort());
  await page.route((u) => u.href.startsWith(origin) && new URL(u.href).pathname === '/config.js', async (route) => {
    const r = await route.fetch(); let body = await r.text();
    const re = /WN_V5:\s*(?:false|true|'(?:off|pilot|on)')/;
    if (re.test(body)) body = body.replace(re, `WN_V5: '${opts.flag || 'on'}'`);
    else S.preflight.push('FEATURES.WN_V5 not found in config.js');
    await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
  });
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    // F5 FE-2: the board asks GET /plan/config (is this week ≥ day L? Q-10). Answered as the deploy-1 Worker does
    // before L and counted in S.config, not S.plan: S.plan stays the board's own traffic that every scenario judges;
    // the day-L rule has its own rig (tests/critics/wn5-pilot-rig.js).
    if (m === 'GET' && u.pathname === '/plan/config' && !S.routes['GET /plan/config']) {
      S.config = (S.config || 0) + 1;
      return json(route, { cutover_day: null, opened_at: null, writes_open: false });
    }
    // Live fix 1 (28/10): the board reads GET /plan/lookups beside /plan/board for its place names. Answered with the
    // rig catalogue and counted in S.lookups (like S.config): S.plan stays the traffic every scenario judges. A
    // scenario that stubs the route itself (plan['GET /plan/lookups']) sees it in S.plan, as before.
    if (m === 'GET' && u.pathname === '/plan/lookups' && !S.routes['GET /plan/lookups']) {
      S.lookups = (S.lookups || 0) + 1;
      return json(route, clone(opts.lookups || DEF_LOOKUPS()));
    }
    if (u.pathname.startsWith('/plan/')) {
      const raw = req.postData();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = '<<not json>>'; }
      const entry = { m, path: u.pathname, q: Object.fromEntries(u.searchParams), raw, body, headers: req.headers() };
      S.plan.push(entry);
      const fn = S.routes[routeKey(m, u.pathname)] || defaultPlan;
      const [status, out] = await fn(entry, S);   // a stub may answer late (T16 fix r1: a preview in flight)
      entry.status = status;
      return json(route, out, status);
    }
    return json(route, m === 'GET' ? { records: [] } : { ok: true });   // the facade: masters, the old board's reads
  });
  await page.goto('app.html');
  // v5 settled (any state but loading) or the old board painted. Never a throw: plain main must reach the checks.
  await page.waitForFunction(() => {
    const r = document.querySelector('#content .wn5');
    return (r && r.dataset.state !== 'loading') || !!document.querySelector('#content .wn4');
  }, null, { timeout: 20000 }).catch(() => {});
  await instrument(page);
  return { page, S };
}
// After load: wrap what the screen may call, to read back what it did. copyPlates is not run (no clipboard here).
async function instrument(page) {
  await page.evaluate(() => {
    const E = window.__ev = [];
    const snap = (x) => { try { return x instanceof Error ? { message: x.message, kind: x.kind, code: x.code } : (x && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : String(x).slice(0, 300)); } catch (_) { return String(x); } };
    const wrap = (name, k, call = true) => { const fn = window[name]; if (typeof fn !== 'function') return;
      window[name] = function () { E.push({ k, a: [...arguments].map(snap) }); return call ? fn.apply(this, arguments) : undefined; }; };
    wrap('toast', 'toast'); wrap('showErrorToast', 'errtoast'); wrap('logError', 'logError');
    wrap('copyPlates', 'copy', false); wrap('tmsSessionExpired', 'expired', false);
  }).catch(() => {});
}
// Wait until the page satisfies fn (evaluated in the page), quietly: a timeout is a ✗ of the caller, not a crash.
const until = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
// logError rows of this page (core/utils.js keeps them in localStorage.tms_errors, also from before instrument()).
const errRows = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tms_errors') || '[]'); } catch (_) { return []; } });
async function shot(page, name) { if (!OUT) return; fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false }); }
const boardReads = (S) => S.plan.filter((x) => x.m === 'GET' && x.path === '/plan/board');

async function preflight(browser, origin) {
  const scn = 'preflight';
  const { page, S } = await openBoard(browser, origin);
  const st = await page.evaluate(() => ({ api: typeof planFetch === 'function', root: !!document.querySelector('#content .wn5') }));
  ok(scn, 'FEATURES.WN_V5 exists in config.js', !S.preflight.length, S.preflight);
  ok(scn, 'core/plan-api.js loaded (planFetch)', st.api, st);
  ok(scn, 'the v5 board painted (#content .wn5)', st.root, st);
  ok(scn, 'board read through GET /plan/board?week=<Saturday>', boardReads(S).some((x) => x.q.week === WEEK), S.plan.map((x) => `${x.m} ${x.path} ${JSON.stringify(x.q)}`));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

const SCN = {};

// Δ12 πλακ. 1: an empty week is said in words, never with a 0.
SCN['paint-empty'] = async (browser, origin) => {
  const scn = 'paint-empty';
  const { page, S } = await openBoard(browser, origin, { board: EMPTY(WEEK) });
  const st = await page.evaluate(() => {
    const r = document.querySelector('#content .wn5');
    if (!r) return null;
    const leaves = [...r.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => e.textContent.trim());
    return { state: r.dataset.state, week: r.dataset.week,
      days: [...r.querySelectorAll('.wn5-day')].map((d) => ({ date: d.dataset.date, head: d.querySelector('.wn5-dayh').textContent.replace(/\s+/g, ' ').trim(), today: d.classList.contains('today') })),
      q: (r.querySelector('.wn5-q .wi4-q-hd') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(), zeros: leaves.filter((t) => t === '0').length };
  });
  ok(scn, 'state empty, data-week = the Saturday', !!st && st.state === 'empty' && st.week === WEEK, st && { state: st.state, week: st.week });
  const heads = ['ΣΑΒΒΑΤΟ 10/10', 'ΚΥΡΙΑΚΗ 11/10', 'ΔΕΥΤΕΡΑ 12/10', 'ΤΡΙΤΗ 13/10', 'ΤΕΤΑΡΤΗ 14/10', 'ΠΕΜΠΤΗ 15/10', 'ΠΑΡΑΣΚΕΥΗ 16/10'];
  ok(scn, 'seven days Sat–Fri, each «· καμία φόρτωση»', !!st && st.days.length === 7 && st.days.every((d, i) => d.head.startsWith(heads[i]) && d.head.endsWith('· καμία φόρτωση')), st && st.days);
  ok(scn, 'today (Τρί 13/10) marked «· σήμερα»', !!st && !!st.days[3] && st.days[3].today && /· σήμερα/.test(st.days[3].head), st && st.days[3]);
  ok(scn, '«ΕΠΟΜΕΝΑ · κανένα»', !!st && /^ΕΠΟΜΕΝΑ · κανένα/.test(st.q), st && st.q);
  ok(scn, 'no counter shows «0» (Δ12 πλακ. 1: empty is said in words)', !!st && st.zeros === 0, st && st.zeros);
  ok(scn, 'one board read, nothing else sent to /plan/*', S.plan.length === 1 && S.plan[0].m === 'GET', S.plan.map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await shot(page, 'paint-empty');
  await page.context().close();
};

// Δ12 πλακ. 3: a failed read is NOT an empty week — the Worker's message, «—», «Ανανέωση ↻», no automatic retry.
SCN['read-error'] = async (browser, origin) => {
  const scn = 'read-error';
  const plan = { 'GET /plan/board': (e, S) => ((S.n.board = (S.n.board || 0) + 1) === 1 ? planErr(500, 'SERVER', 'plan_failed') : [200, EMPTY(e.q.week)]) };
  const { page, S } = await openBoard(browser, origin, { plan });
  await page.waitForTimeout(3500);                                       // longer than _atRetry's 1 s + 2 s: a retry would show
  const st = await page.evaluate(() => {
    const r = document.querySelector('#content .wn5');
    if (!r) return null;
    const strip = r.querySelector('.wn5-strip[data-kind="failed"]');
    return { state: r.dataset.state, strip: strip ? strip.textContent.replace(/\s+/g, ' ').trim() : null,
      reload: !!(strip && strip.querySelector('[data-act="reload"]')), q: (r.querySelector('.wn5-q .wi4-q-hd') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
      text: r.textContent };
  });
  ok(scn, 'state err', !!st && st.state === 'err', st && st.state);
  ok(scn, 'the strip shows the Worker message as it came (sentinel)', !!st && !!st.strip && st.strip.includes('rig sentinel plan_failed'), st && st.strip);
  ok(scn, 'counters say «—», never 0 (ΕΠΟΜΕΝΑ · —)', !!st && /^ΕΠΟΜΕΝΑ · —/.test(st.q), st && st.q);
  ok(scn, 'never «καμία φόρτωση» or «κενή εβδομάδα» on a failed read', !!st && !/καμία φόρτωση|κενή εβδομάδα/.test(st.text), st && st.text.slice(0, 200));
  ok(scn, 'exactly one GET, no automatic retry', boardReads(S).length === 1, boardReads(S).length);
  const rows = (await errRows(page)).filter((e) => String(e.ctx || '').startsWith('planFetch GET /plan/board'));
  ok(scn, 'the 500 is logged once (app_errors)', rows.length === 1, rows);
  const clicked = await page.evaluate(() => { const b = document.querySelector('#content .wn5 .wn5-strip [data-act="reload"]'); if (b) b.click(); return !!b; });
  const back = clicked && await until(page, () => { const r = document.querySelector('#content .wn5'); return r && r.dataset.state === 'empty'; });
  ok(scn, '«Ανανέωση ↻» re-reads by hand → the empty week, the strip gone', back && !(await page.$('#content .wn5 .wn5-strip')), { clicked, back });
  ok(scn, 'two board reads in total (one per press)', boardReads(S).length === 2, boardReads(S).length);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await shot(page, 'read-error');
  await page.context().close();
};

// A paint that throws is STICKY: the old board, one banner, no v5 until the next load (v4 rule §a.4).
SCN.broken = async (browser, origin) => {
  const scn = 'broken';
  const { page, S } = await openBoard(browser, origin, { board: { week: WEEK, cycles: {}, waiting: [], hub: [], notices: [] } });
  await until(page, () => !!document.querySelector('#content .wn4'));
  const st = await page.evaluate(() => ({ broken: typeof WN5 !== 'undefined' && WN5._broken === true, old: !!document.querySelector('#content .wn4'),
    v5: !!document.querySelector('#content .wn5'), banner: (document.querySelector('.wi4-banner') || { textContent: '' }).textContent.trim() }));
  ok(scn, 'WN5._broken is set', st.broken, st);
  ok(scn, 'the old board is on screen (#content .wn4), no .wn5', st.old && !st.v5, st);
  ok(scn, 'one banner says so', st.banner === 'Η νέα προβολή απέτυχε — δείχνουμε την παλιά μέχρι την επόμενη φόρτωση', st.banner);
  const rows = (await errRows(page)).filter((e) => String(e.ctx || '').startsWith('weekly natl v5: paint failed'));
  ok(scn, 'the failure is logged once', rows.length === 1, rows.map((e) => e.ctx + ': ' + e.msg));
  const before = boardReads(S).length;
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  ok(scn, 'a week change stays on the old board (no new /plan/board read)', boardReads(S).length === before && !(await page.$('#content .wn5')), { before, after: boardReads(S).length });
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
};

// The week stays ONE (WNATL.week): ←/→ of core/ui.js and the tabs move it; /plan/board always gets a Saturday.
SCN.week = async (browser, origin) => {
  const scn = 'week';
  const { page, S } = await openBoard(browser, origin);
  ok(scn, 'the first read is W42 (2026-10-10)', boardReads(S).length >= 1 && boardReads(S)[0].q.week === WEEK, boardReads(S).map((x) => x.q.week));
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  const next = await until(page, () => { const r = document.querySelector('#content .wn5'); return r && r.dataset.week === '2026-10-17' && r.dataset.state !== 'loading'; });
  ok(scn, '→ moves to W43: data-week 2026-10-17', next, await page.evaluate(() => (document.querySelector('#content .wn5') || {}).dataset));
  ok(scn, '→ read GET /plan/board?week=2026-10-17', boardReads(S).some((x) => x.q.week === '2026-10-17'), boardReads(S).map((x) => x.q.week));
  const tab = await page.evaluate(() => { const b = document.querySelector('.wn5-bar .wi4-tab[data-w="41"]'); if (b) b.click(); return !!b; });
  const w41 = tab && await until(page, () => { const r = document.querySelector('#content .wn5'); return r && r.dataset.week === '2026-10-03' && r.dataset.state !== 'loading'; });
  ok(scn, 'tab W41 → data-week 2026-10-03', w41, { tab });
  const weeks = boardReads(S).map((x) => x.q.week);
  ok(scn, 'every week sent is a Saturday (TmsWeek)', weeks.length === 3 && weeks.every((w) => new Date(w + 'T00:00:00Z').getUTCDay() === 6), weeks);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
};

// Figma H1 2120:7738 (owner 25/10) on the synthetic W42: geometry, words, days, ✈ menu, plates.
SCN.paint = async (browser, origin) => {
  const scn = 'paint';
  const { page, S } = await openBoard(browser, origin, { board: fixture() });
  const st = await page.evaluate(() => {
    const r = document.querySelector('#content .wn5');
    if (!r) return null;
    const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; };
    const hAsg = r.querySelector('.wn5-cols .wn5-h-asg'), hAd = r.querySelector('.wn5-cols .wn5-c-ad');
    return { state: r.dataset.state, rows: r.querySelectorAll('.wn5-row').length,
      asgW: [...r.querySelectorAll('.wn5-row > .wn5-asg')].map((e) => Math.round(box(e).w)),
      anodShift: hAsg && hAd ? Math.round(box(hAd).l - box(hAsg).l) : null,
      asgTimes: [...r.querySelectorAll('.wn5-asg')].map((e) => e.textContent).filter((t) => /\d{1,2}:\d{2}/.test(t)),
      vtime: [...r.querySelectorAll('.wn5-vtime')].map((e) => ({ inFl: !!e.closest('.wn5-fl'), row: e.closest('.wn5-row').dataset.key, t: e.textContent })),
      days: [...r.querySelectorAll('.wn5-day')].map((d) => ({ date: d.dataset.date, closed: d.classList.contains('closed'), rows: d.querySelectorAll('.wn5-row').length })),
      head: (r.querySelector('.wn5-cols .wn5-h-asg') || {}).textContent,
      q: (r.querySelector('.wn5-q .wi4-q-hd') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
      qcards: [...r.querySelectorAll('.wn5-qcard[data-piece]')].map((c) => ({ piece: c.dataset.piece, assign: !!c.querySelector('[data-act="assign"]') })),
      p104: ((r.querySelector('.wn5-row[data-key="rt:104"] .wn5-asg') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      miss: ((r.querySelector('.wn5-miss[data-qi="wait:4101"]') || {}).textContent || '').trim(),
      strip: ((r.querySelector('.wn5-strip[data-kind="client"]') || {}).textContent || '').trim(),
      text: r.textContent.replace(/\s+/g, ' ') };
  });
  ok(scn, 'state ok, 12 rows (8 cycles + 4 loads waiting for a vehicle)', !!st && st.state === 'ok' && st.rows === 12, st && { state: st.state, rows: st.rows });
  ok(scn, 'ΑΝΑΘΕΣΗ is 266px on every row (owner 25/10)', !!st && st.asgW.length === 12 && st.asgW.every((w) => Math.abs(w - 266) <= 1), st && st.asgW);
  ok(scn, 'ΑΝΟΔΟΣ starts 282px after ΑΝΑΘΕΣΗ (266 + 16, Figma §Σ2: 1172 → 1188)', !!st && st.anodShift !== null && Math.abs(st.anodShift - 282) <= 1, st && st.anodShift);
  ok(scn, 'the head is «ΑΝΑΘΕΣΗ» alone', !!st && st.head === 'ΑΝΑΘΕΣΗ', st && st.head);
  ok(scn, 'no hh:mm anywhere in ΑΝΑΘΕΣΗ', !!st && !st.asgTimes.length, st && st.asgTimes);
  ok(scn, 'the Veroia time sits under «Βέροια» in ΦΟΡΤΩΣΗ on all 9 rows that load there', !!st && st.vtime.length === 9 && st.vtime.every((v) => v.inFl), st && st.vtime);
  ok(scn, 'every day with rows is open at paint (never folded by the board)', !!st && st.days.filter((d) => d.rows).every((d) => !d.closed), st && st.days);
  for (const w of ['Χωρίς κάθοδο', 'Κενό γύρισμα · ελεύθερο από Τρί 11:00', 'Μόνο κάθοδος · συνεργάτης', '↳ Φόρτωση με τοπικό · Driver Test 11', 'ως Δευ 22:00']) {
    ok(scn, `shows «${w}»`, !!st && st.text.includes(w));
  }
  ok(scn, 'a one-segment partner tile = «Partner Test Pelagos» / «—», never the rate (F0 7745 / H1, Ε-36)', !!st && st.p104 === 'Partner Test Pelagos—', st && st.p104);
  // FE-2 (owner 28/10): no «… δεν ήρθαν (Worker)» line under ΠΡΟΣ ΑΝΑΘΕΣΗ, and the 074a-shaped week draws clean
  ok(scn, 'VS-T118 is a ΠΡΟΣ ΑΝΑΘΕΣΗ row with no waiting line, and no shape strip (FE-2)', !!st && st.miss === '' && !st.strip, st && { miss: st.miss, strip: st.strip });
  ok(scn, '«ΕΠΟΜΕΝΑ · 3», three cards, each with «Ανάθεση» (data-act=assign)', !!st && /^ΕΠΟΜΕΝΑ · 3/.test(st.q) && st.qcards.length === 3 && st.qcards.every((c) => c.assign), st && { q: st.q, cards: st.qcards });
  // A day folds only by the user's click, and only that day.
  await page.evaluate(() => { const h = document.querySelector('#content .wn5 .wn5-day[data-date="2026-10-12"] .wn5-dayh'); if (h) h.click(); });
  const fold = await page.evaluate(() => [...document.querySelectorAll('#content .wn5 .wn5-day')].map((d) => [d.dataset.date, d.classList.contains('closed')]));
  ok(scn, 'a click folds ΔΕΥΤΕΡΑ 12/10 only', fold.length === 7 && fold.every(([d, c]) => c === (d === '2026-10-12')), fold);
  await page.evaluate(() => { const h = document.querySelector('#content .wn5 .wn5-day[data-date="2026-10-12"] .wn5-dayh'); if (h) h.click(); });
  // ✈ menu: role=menu, ←/→ do not move the week while it is open, Esc closes it.
  const reads = boardReads(S).length;
  const opened = await page.evaluate(() => { const b = document.querySelector('#content .wn5 .wn5-row[data-rt="102"] .wi4-plane'); if (b) b.click(); return !!b; });
  const menu = opened && await page.evaluate(() => { const m = document.getElementById('wn5-menu'); return m ? { role: m.getAttribute('role'), hd: m.querySelector('.wn5-m-hd').textContent.replace(/\s+/g, ' ').trim(), items: [...m.querySelectorAll('[data-item]')].map((i) => i.getAttribute('data-item')) } : null; });
  ok(scn, '✈ opens #wn5-menu[role=menu] with «Αντιγραφή πινακίδων»', !!menu && menu.role === 'menu' && menu.items.includes('plates'), menu);
  ok(scn, 'menu head «TST-2106 · κύκλος 1/2» / «Δευ 12/10 · Βέροια 16:00–18:00»', !!menu && menu.hd === 'TST-2106 · κύκλος 1/2Δευ 12/10 · Βέροια 16:00–18:00', menu && menu.hd);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  ok(scn, '→ under the open menu changes no week (no new read)', boardReads(S).length === reads && (await page.evaluate(() => { const r = document.querySelector('#content .wn5'); return r ? r.dataset.week : null; })) === WEEK, { reads, after: boardReads(S).length });
  await page.keyboard.press('Escape');
  ok(scn, 'Esc closes the menu', !(await page.$('#wn5-menu')));
  // A «›» line (T20/T23 add the real ones, Figma 2011:8858): → opens its submenu (role=menu), ← closes it.
  // typeof guard: on plain main there is no WN5, and a ReferenceError here would end the scenario before the checks
  // below run — the plain-main proof must reach every line (each then fails or holds by itself).
  await page.evaluate(() => { if (typeof WN5 !== 'undefined') WN5.MENU_ITEMS.push({ id: 'rig-sub', order: 65, label: 'rig submenu', children: [{ id: 'rig-sub-a', label: 'A', run: () => {} }] }); });
  await page.evaluate(() => { const b = document.querySelector('#content .wn5 .wn5-row[data-rt="102"] .wi4-plane'); if (b) b.click(); });
  await page.focus('#wn5-menu [data-item="rig-sub"]').catch(() => {});
  await page.keyboard.press('ArrowRight');
  const subOpen = await page.evaluate(() => { const x = document.querySelector('#wn5-menu [data-sub="rig-sub"]'); return !!x && !x.hidden && x.getAttribute('role') === 'menu' && document.activeElement === x.querySelector('[data-item="rig-sub-a"]'); });
  await page.keyboard.press('ArrowLeft');
  const subShut = await page.evaluate(() => { const x = document.querySelector('#wn5-menu [data-sub="rig-sub"]'); return !!x && x.hidden && !!document.activeElement && document.activeElement.getAttribute('data-item') === 'rig-sub'; });
  ok(scn, 'a «›» line: → opens its submenu (role=menu, focus inside), ← closes it back to its line, and no week moves', subOpen && subShut && boardReads(S).length === reads,
    { subOpen, subShut, reads, after: boardReads(S).length });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { if (typeof WN5 === 'undefined') return; const i = WN5.MENU_ITEMS.findIndex((x) => x.id === 'rig-sub'); if (i >= 0) WN5.MENU_ITEMS.splice(i, 1); });
  await page.evaluate(() => { const b = document.querySelector('#content .wn5 .wn5-row[data-rt="102"] .wi4-plane'); if (b) b.click(); });
  await page.evaluate(() => { const i = document.querySelector('#wn5-menu [data-item="plates"]'); if (i) i.click(); });
  const copied = (await page.evaluate(() => window.__ev || [])).filter((e) => e.k === 'copy').map((e) => e.a[0]);
  ok(scn, '«Αντιγραφή πινακίδων» copies the cycle truck and trailer only', copied.length === 1 && copied[0] === 'TST-2106 / TRL-5101', copied);
  // whole-frame r2 (Figma 2011:9279 / 9282): the same copy on row hover, a 13px glyph inside the box's top-right corner
  // (6 in, 3 down); «Αντιγράφηκε» over it once the clipboard took the text (copyPlates answers true here). No glyph on
  // the partner cycle RT-T104 (no plates to copy).
  await page.keyboard.press('Escape');
  await page.hover('#content .wn5 .wn5-row[data-rt="102"] .wn5-c-idx').catch(() => {});
  const cpyAt = await page.evaluate(() => {
    const row = document.querySelector('#content .wn5 .wn5-row[data-rt="102"]');
    const b = row && row.querySelector('.wn5-asg > .wn5-cpy'), box = row && row.querySelector('.wn5-asg .wi4-box');
    if (!b || !box) return null;
    const g = b.getBoundingClientRect(), x = box.getBoundingClientRect();
    return { op: getComputedStyle(b).opacity, w: Math.round(g.width), h: Math.round(g.height), inR: Math.round(x.right - g.right), inT: Math.round(g.top - x.top),
      partner: !!document.querySelector('#content .wn5 .wn5-row[data-rt="104"] .wn5-cpy') };
  });
  await page.evaluate(() => { const w = window.copyPlates; window.copyPlates = function () { w.apply(this, arguments); return true; }; });
  await page.evaluate(() => { const b = document.querySelector('#content .wn5 .wn5-row[data-rt="102"] .wn5-cpy'); if (b) b.click(); });
  const tip = await until(page, () => { const t = document.querySelector('#content .wn5 .wn5-row[data-rt="102"] .wn5-cpy-tip'); return !!t && t.textContent === 'Αντιγράφηκε'; }, null, 3000);
  const copied2 = (await page.evaluate(() => window.__ev || [])).filter((e) => e.k === 'copy').map((e) => e.a[0]);
  ok(scn, 'row hover: the plates glyph in ΑΝΑΘΕΣΗ (13px, 6 in / 3 down in the box), a click copies «TST-2106 / TRL-5101» and says «Αντιγράφηκε»; none on the partner cycle',
    !!cpyAt && cpyAt.op === '1' && cpyAt.w === 13 && cpyAt.h === 13 && Math.abs(cpyAt.inR - 6) <= 1 && Math.abs(cpyAt.inT - 3) <= 1 && !cpyAt.partner
    && copied2.length === 2 && copied2[1] === 'TST-2106 / TRL-5101' && tip, { cpyAt, copied: copied2, tip });
  // whole-frame r2: «· τέλος κύκλου» and «ως … 22:00» DM Sans Medium 10.5 grey-2 (2120:8885 / 8886); the dashed
  // «Κενό γύρισμα» / «Χωρίς κάθοδο» text 12px (2120:8287 / 2011:9038).
  const ty = await page.evaluate(() => {
    const cs = (sel) => { const e = document.querySelector('#content .wn5 ' + sel); if (!e) return null; const c = getComputedStyle(e); return [c.fontWeight, c.fontSize, c.color].join(' '); };
    return { endx: cs('.wn5-endx'), by: cs('.wn5-end .wi4-l2'), gap: [...document.querySelectorAll('#content .wn5 .wn5-gapbox')].map((e) => getComputedStyle(e).fontSize) };
  });
  ok(scn, 'ΠΡΟΣ «· τέλος κύκλου» / «ως …» 500 10.5px grey-2; the dashed gap boxes 12px', ty.endx === '500 10.5px rgb(91, 107, 127)' && ty.by === '500 10.5px rgb(91, 107, 127)'
    && ty.gap.length >= 2 && ty.gap.every((f) => f === '12px'), ty);
  ok(scn, 'nothing was sent to /plan/* but the board read', S.plan.every((x) => x.m === 'GET' && x.path === '/plan/board'), S.plan.map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await shot(page, 'paint-1920');
  await page.context().close();
  // 1440: the point columns shrink, nothing spills out of its cell.
  const narrow = await openBoard(browser, origin, { board: fixture(), viewport: { width: 1440, height: 900 } });
  const spill = await narrow.page.evaluate(() => {
    const out = [];
    for (const row of document.querySelectorAll('#content .wn5 .wn5-row')) {
      for (const cell of row.children) {
        const c = cell.getBoundingClientRect();
        for (const el of cell.querySelectorAll('.wi4-pt, .wi4-box, .wi4-more, .wn5-gapbox, .wn5-vtime')) {
          const b = el.getBoundingClientRect();
          if (b.left < c.left - 1 || b.right > c.right + 1) out.push(row.dataset.key + ' ' + cell.className + ' ' + el.className);
        }
      }
    }
    return { out, rows: document.querySelectorAll('#content .wn5 .wn5-row').length };
  });
  ok(scn, '1440: 12 rows, no stop / tile spills out of its column', spill.rows === 12 && !spill.out.length, spill);
  // whole-frame r1 (2120:7826): a web font that lands after the paint widens the bar's words without resizing #content;
  // the bar is measured again then, so «Ενημερώθηκε» gives way and the range stays whole. The swap is played here by
  // moving the title's right margin (room for all, then half a word too little), each time with the FontFaceSet's own
  // «loadingdone»; independent of how the rig's fallback font fits at paint.
  const fit = await narrow.page.evaluate(() => {
    const bl = document.querySelector('.wn5-bar .wi4-bar-l');
    const t = bl && bl.querySelector('.wi4-title'), rg = bl && bl.querySelector('.wi4-range'), w = bl && bl.querySelector('.wn5-upd-w');
    if (!t || !rg || !w || !document.fonts) return null;
    const was = bl.classList.contains('wn5-upd-short');
    bl.classList.remove('wn5-upd-short');
    bl.classList.add('wn5-fit');
    const over = bl.scrollWidth - bl.clientWidth, ww = w.getBoundingClientRect().width;
    bl.classList.remove('wn5-fit');
    const swap = (px) => { t.style.marginRight = px; document.fonts.dispatchEvent(new Event('loadingdone')); return bl.classList.contains('wn5-upd-short'); };
    const r = { over, ww: Math.round(ww) };
    r.roomy = swap(-(over + 4) + 'px');                     // everything fits: the word shows
    r.short = swap(-(over - Math.ceil(ww / 2)) + 'px');     // half a word too little: the word goes
    r.cut = rg.scrollWidth > rg.clientWidth + 1;
    r.back = swap('') === was;                              // the paint's own state again
    return r;
  });
  ok(scn, '1440: a font landing after the paint re-fits the bar — «Ενημερώθηκε» gives way, the range stays whole, and comes back when room returns',
    !!fit && fit.roomy === false && fit.short && !fit.cut && fit.back, fit);
  await shot(narrow.page, 'paint-1440');
  // The reload time is how the user sees how stale the board is: at 1440 a week whose range crosses months (W40,
  // «26 Σεπτεμβρίου – 2 Οκτωβρίου») gives way in the range, never in «↻ hh:mm» — and the range itself is drawn whole
  // (whole-frame r2, 2120:7829): the short months when the long form has no room, the long form in its title.
  await narrow.page.keyboard.press('ArrowLeft');
  await narrow.page.keyboard.press('ArrowLeft');
  await until(narrow.page, () => { const r = document.querySelector('#content .wn5'); return !!r && r.dataset.week === '2026-09-26' && r.dataset.state !== 'loading'; });
  // measured once the fonts have landed and their loadingdone re-fit has run (a frame later), as the user sees it
  await narrow.page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
  await narrow.page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))).catch(() => {});
  const bar = await narrow.page.evaluate(() => {
    const bl = document.querySelector('.wn5-bar .wi4-bar-l');
    const up = bl && bl.querySelector('.wn5-upd');
    const rg = bl && bl.querySelector('.wi4-range');
    if (!up) return null;
    return { barR: Math.round(bl.getBoundingClientRect().right), updR: Math.round(up.getBoundingClientRect().right), upd: up.textContent, range: rg && rg.getAttribute('title'),
      sw: rg && rg.scrollWidth, cw: rg && rg.clientWidth, shown: rg && rg.innerText };
  });
  ok(scn, '1440, W40: the range is drawn whole (scrollWidth ≤ clientWidth), «26 Σεπτεμβρίου – 2 Οκτωβρίου» or «26 Σεπ – 2 Οκτ»',
    !!bar && bar.sw <= bar.cw && /^26 Σεπ(?:τεμβρίου)? – 2 Οκτ(?:ωβρίου)?$/.test((bar.shown || '').trim()), bar);
  ok(scn, '1440, W40: «↻ hh:mm» ends inside the bar (the long range gives way, not the time)',
    !!bar && /26 Σεπτεμβρίου/.test(bar.range || '') && bar.updR <= bar.barR + 1 && /↻ (?:Ενημερώθηκε )?\d{2}:\d{2}/.test(bar.upd), bar);
  ok(scn, '1440: no page errors', !narrow.S.pageErrors.length, narrow.S.pageErrors);
  await shot(narrow.page, 'paint-1440-w40');
  await narrow.page.context().close();
  // Ε-27/Ε-44: a week with no VS leg and no PlanIds.hub() (a catalogue without its one hub) cannot place Veroia —
  // the board says so in a strip, never Veroia as an ordinary stop in silence.
  const hubless = fixture();
  for (const c of hubless.cycles) for (const s of c.stops) for (const l of s.legs) if (String(l.kind).startsWith('vs_')) l.kind = 'national';
  const noHub = DEF_LOOKUPS();
  for (const l of noHub.locations) l.is_hub = false;
  const hl = await openBoard(browser, origin, { board: hubless, lookups: noHub });
  const hlText = await hl.page.evaluate(() => { const x = document.querySelector('#content .wn5 .wn5-strip[data-kind="client"]'); return x ? x.textContent : null; });
  ok(scn, 'a week whose Veroia is not identified shows the WN5L.HUB_UNKNOWN strip', !!hlText && hlText.includes('Η Βέροια δεν αναγνωρίστηκε'), hlText);
  await hl.page.context().close();
  { // FE-2: the 072 shape (hub[] without the Ε-26 keys) is a broken board from day L — said in the strip, by key
    const raw = await openBoard(browser, origin, { board: fixture072() });
    const t = await raw.page.evaluate(() => ({ strip: ((document.querySelector('#content .wn5 .wn5-strip[data-kind="client"]') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      miss: document.querySelectorAll('#content .wn5 .wn5-miss').length }));
    ok(scn, 'the 072 shape: «ΔΕΔΟΜΕΝΑ ΠΟΥ ΔΕΝ ΣΧΕΔΙΑΣΤΗΚΑΝ» names VS-T118 and «deliver_from», no waiting line', /ΔΕΔΟΜΕΝΑ ΠΟΥ ΔΕΝ ΣΧΕΔΙΑΣΤΗΚΑΝ/.test(t.strip)
      && t.strip.includes('VS-T118: ο πίνακας ήρθε χωρίς «deliver_from»') && t.miss === 0, t);
    await raw.page.context().close();
  }
};
// Figma 2035:7735 «εκτελεσμένα σβηστά ανά ημέρα», now = Tue 13/10 09:30: what the base flags is at 40%, nothing else.
// whole-frame r3 (Figma 2120:7825 «Top bar 60px», as 2011:7745): ONE 60px bar holds title, range, ↻, tabs, actions,
// bell and avatar — the board's bar moves into the app's top bar (the Weekly International v4 mechanism), the app's
// title and Sign out give way, the queue starts at y 70 (Content y 60 + 10). «Παλιά προβολή» and a page change give
// the app its own top bar back; the flag-off board never touches it (wn5-identity-rig).
SCN.topbar = async (browser, origin) => {
  const scn = 'topbar';
  const { page, S } = await openBoard(browser, origin, { board: fixture(), viewport: { width: 1440, height: 900 } });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
  await page.waitForTimeout(300);   // the sidebar's 0.22 s collapse (the app restarts it at load and at a week change)
  const read = () => page.evaluate(() => {
    const tb = document.querySelector('.main > .topbar');
    const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const q = document.querySelector('#content .wn5 .wn5-q');
    const chip = document.querySelector('.topbar .user-chip');
    const titles = [...document.querySelectorAll('body *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === 'Εβδομαδιαίο Εθνικών')).length;
    const tabs = tb && tb.querySelector('.wn5-bar .wi4-tabs'), av = document.getElementById('userAvatar');
    const tr = tabs && tabs.getBoundingClientRect(), tbr = tb && tb.getBoundingClientRect();
    return { inTop: !!(tb && tb.querySelector(':scope > #wn5-top > .wn5-bar')), inContent: !!document.querySelector('#content .wn5-bar'),
      on: document.body.classList.contains('wn5-top-on'), tbH: tbr ? Math.round(tbr.height) : null,
      titleShown: vis(document.getElementById('topbarTitle')), crumbShown: vis(document.getElementById('topbarBreadcrumb')),
      logoutShown: vis(document.querySelector('.topbar .btn-logout')), nameShown: vis(document.getElementById('userName')), avatar: vis(av),
      menu: !!(chip && chip.querySelector('.wn5-umenu')), chipRole: chip ? chip.getAttribute('role') : null,
      titles, qTop: q ? Math.round(q.getBoundingClientRect().top) : null,
      tabsMid: tr ? Math.round(tr.left + tr.width / 2) : null, barMid: tbr ? Math.round((tbr.left + 28 + tbr.right - 20) / 2) : null };
  });
  const a = await read();
  ok(scn, '1440: the v5 bar is inside .main > .topbar (#wn5-top), not in #content; body.wn5-top-on', a.inTop && !a.inContent && a.on, a);
  ok(scn, '1440: one 60px top bar — the app title / breadcrumb, the name and «Sign out» give way, the avatar stays', a.tbH === 60 && !a.titleShown && !a.crumbShown && !a.logoutShown && !a.nameShown && a.avatar, a);
  ok(scn, '1440: «Εβδομαδιαίο Εθνικών» is drawn once', a.titles === 1, a);
  ok(scn, '1440: the queue starts at the frame\'s y 70 (Content 60 + 10)', a.qTop != null && Math.abs(a.qTop - 70) <= 1, a);
  ok(scn, '1440: the week tabs centred between the title\'s left edge and the avatar\'s right edge (±12px)', a.tabsMid != null && Math.abs(a.tabsMid - a.barMid) <= 12, a);
  // the avatar holds name, role and «Αποσύνδεση» (never a bar without a way out)
  await page.click('.topbar .user-chip', { timeout: 3000 }).catch(() => {});
  const um = await page.evaluate(() => { const m = document.querySelector('.topbar .user-chip .wn5-umenu'); return m ? { open: !m.hidden, text: m.innerText.replace(/\s+/g, ' ').trim() } : null; });
  ok(scn, 'the avatar opens name · role and «Αποσύνδεση»', !!um && um.open && /Rig/.test(um.text) && um.text.includes('Αποσύνδεση'), um);
  await page.keyboard.press('Escape');
  // the tabs still work from the top bar
  await page.evaluate(() => { const b = document.querySelector('.topbar .wn5-bar .wi4-tab[data-w="43"]'); if (b) b.click(); });
  const w43 = await until(page, () => { const r = document.querySelector('#content .wn5'); return r && r.dataset.week === '2026-10-17' && r.dataset.state !== 'loading'; });
  const b = await read();
  const bars = await page.evaluate(() => document.querySelectorAll('.wn5-bar').length);
  ok(scn, 'tab W43 from the top bar → data-week 2026-10-17, the new bar replaces the old (one bar)', w43 && b.inTop && !b.inContent && bars === 1, Object.assign({ bars }, b));
  await page.waitForTimeout(300);
  await shot(page, 'topbar-1440');
  // «Παλιά προβολή» → the old board: the app's own top bar comes back whole
  await page.evaluate(() => { if (window.WN5 && WN5._switch) WN5._switch('0'); });
  await until(page, () => !document.querySelector('#content .wn5'));
  await page.waitForTimeout(300);
  const c = await read();
  ok(scn, '«Παλιά προβολή»: no #wn5-top, no wn5-top-on, the app title and «Sign out» back, the chip is the app\'s again',
    !c.inTop && !c.on && c.titleShown && c.logoutShown && c.nameShown && !c.menu && c.chipRole === null, c);
  // back to v5, then another page: the same
  await page.evaluate(() => { if (window.WN5 && WN5._switch) WN5._switch('1'); });
  const again = await until(page, () => !!document.querySelector('#wn5-top > .wn5-bar'));
  await page.evaluate(() => { if (typeof navigate === 'function') navigate('dashboard'); });
  await until(page, () => !document.querySelector('#content .wn5'));
  await page.waitForTimeout(300);
  const d = await read();
  ok(scn, 'leaving the board (dashboard): the app\'s top bar is restored', again && !d.inTop && !d.on && d.titleShown && d.logoutShown && !d.menu && d.chipRole === null, Object.assign({ again }, d));
  // whole-frame fix round 1: Weekly International v4 → v5. WIV2's page-leave observer runs its _umenuUnmount AFTER v5's
  // first paint mounted the v5 menu and strips the chip's button attributes; v5 must put them back (keyboard way out).
  await page.evaluate(() => { if (typeof navigate === 'function') navigate('weekly_intl'); });
  const wi = await until(page, () => !!document.querySelector('#wi4-top') || !!document.querySelector('#content .wi4'));
  await page.evaluate(() => { if (typeof navigate === 'function') navigate('weekly_natl'); });
  const v5 = await until(page, () => { const r = document.querySelector('#content .wn5'); return !!document.querySelector('#wn5-top > .wn5-bar') && r && r.dataset.state !== 'loading'; });
  await page.waitForTimeout(300);
  const e = await page.evaluate(() => {
    const chip = document.querySelector('.topbar .user-chip');
    return chip ? { role: chip.getAttribute('role'), tabindex: chip.getAttribute('tabindex'), popup: chip.getAttribute('aria-haspopup'),
      expanded: chip.getAttribute('aria-expanded'), title: chip.getAttribute('title'), menu: !!chip.querySelector('.wn5-umenu'), wiMenu: !!chip.querySelector('.wi4-umenu:not(.wn5-umenu)') } : null;
  });
  ok(scn, 'Weekly International → v5: the chip is the v5 menu\'s button again (role button, tabindex 0, aria-haspopup, aria-expanded false, title), no WI menu',
    wi && v5 && !!e && e.role === 'button' && e.tabindex === '0' && e.popup === 'true' && e.expanded === 'false' && !!e.title && e.menu && !e.wiMenu, Object.assign({ wi, v5 }, e));
  await page.evaluate(() => { const c = document.querySelector('.topbar .user-chip'); if (c) c.focus(); });
  await page.keyboard.press('Enter');
  const kb = await page.evaluate(() => { const m = document.querySelector('.topbar .user-chip .wn5-umenu'), a = document.activeElement;
    return m ? { open: !m.hidden, focus: a ? a.textContent.trim() : null } : null; });
  ok(scn, 'Weekly International → v5: Enter on the focused avatar opens the menu, «Αποσύνδεση» focused', !!kb && kb.open && kb.focus === 'Αποσύνδεση', kb);
  await page.keyboard.press('Escape');
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
};
SCN.dim = async (browser, origin) => {
  const scn = 'dim';
  const { page, S } = await openBoard(browser, origin, { board: fixture() });
  const st = await page.evaluate(() => {
    const op = (el) => (el ? Number(getComputedStyle(el).opacity) : null);
    const row = (k) => document.querySelector(`#content .wn5 .wn5-row[data-key="${k}"]`);
    const r = (k) => row(k) || document.createElement('div');
    const dimIn = (el) => (el ? el.querySelectorAll('.wn5-dim').length + (el.classList.contains('wn5-dim') ? 1 : 0) : -1);
    return {
      r101: { cls: r('rt:101').classList.contains('wn5-dim'), op: op(row('rt:101')) },
      heads: ['rt:102', 'rt:103', 'rt:104'].map((k) => ({ k, row: r(k).classList.contains('wn5-dim'),
        chip: op(r(k).querySelector('.wn5-kd .wi4-dc')), vh: op(r(k).querySelector('.wn5-vh')), vt: op(r(k).querySelector('.wn5-vtime')),
        tue: [...r(k).querySelectorAll('.wn5-kto .wn5-pt')].map(op) })),
      work: ['wait:4101', 'wait:4103', 'rt:108'].map((k) => ({ k, n: dimIn(row(k)) })),
      late: op(document.querySelector('#content .wn5 .wn5-pt[data-stop="1303"]')),
      future: dimIn(row('rt:105')) + dimIn(row('rt:106')) + dimIn(row('rt:107')),
      ad: [...document.querySelectorAll('#content .wn5 .wn5-ad .wi4-dc')].map((el) => {
        const cs = getComputedStyle(el);
        return { cls: el.classList.contains('past') ? 'past' : el.classList.contains('today') ? 'today' : 'next', bd: cs.borderTopColor, bg: cs.backgroundColor, fg: cs.color };
      }),
      tok: (() => { const cs = getComputedStyle(document.querySelector('#content .wn5'));
        const probe = (prop, v) => { const d = document.createElement('i'); d.style[prop] = v; document.body.appendChild(d); const c = getComputedStyle(d)[prop]; d.remove(); return c; };
        return { blue: probe('color', cs.getPropertyValue('--wi4-blue')), ink: probe('color', cs.getPropertyValue('--wi4-blue-ink')),
          card: probe('backgroundColor', cs.getPropertyValue('--surface-card')), chip: probe('backgroundColor', cs.getPropertyValue('--wi4-chip')) }; })(),
    };
  });
  ok(scn, 'row 1 (RT-T101, Σάβ → Δευ, ended Δευ 22:00) dimmed whole, computed opacity 0.4', st.r101.cls && Math.abs(st.r101.op - 0.4) < 0.01, st.r101);
  ok(scn, 'rows 2–4: only the Monday head (chip, «Βέροια», its window) at 0.4, the row itself not', st.heads.every((h) => !h.row
    && [h.chip, h.vh, h.vt].every((o) => o !== null && Math.abs(o - 0.4) < 0.01)), st.heads);
  ok(scn, 'rows 2–4: the Tuesday deliveries stay bold (opacity 1)', st.heads.every((h) => h.tue.length > 0 && h.tue.every((o) => o === 1)), st.heads.map((h) => [h.k, h.tue]));
  ok(scn, 'ΠΡΟΣ ΑΝΑΘΕΣΗ (VS-T118, VS-T121) and the cycle without a vehicle never dim', st.work.every((w) => w.n === 0), st.work);
  ok(scn, 'the late stop (RT-T104 Larisa) stays bold', st.late === 1, st.late);
  ok(scn, 'nothing of Wednesday–Friday is dimmed', st.future === 0, st.future);
  // Figma 2035:7735 / 7745 row 1: an ΑΝΟΔΟΣ day that has passed is the blue outlined chip (fading with its row); today
  // and later ΑΝΟΔΟΣ days keep the light grey chip (H1 2120:7738).
  const adPast = st.ad.filter((c) => c.cls === 'past'), adRest = st.ad.filter((c) => c.cls !== 'past');
  ok(scn, 'a past ΑΝΟΔΟΣ day is the outlined chip (blue border and ink, card fill)', adPast.length > 0
    && adPast.every((c) => c.bd === st.tok.blue && c.fg === st.tok.ink && c.bg === st.tok.card), { adPast, tok: st.tok });
  ok(scn, 'today / later ΑΝΟΔΟΣ days keep the light grey chip', adRest.length > 0 && adRest.every((c) => c.bg === st.tok.chip), { adRest, tok: st.tok });
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await shot(page, 'dim');
  await page.context().close();
  // 1440: one stop per point column; the late stop takes the slot, it is never folded into a grey «+1» (rule 2036:7735).
  const nw = await openBoard(browser, origin, { board: fixture(), viewport: { width: 1440, height: 900 } });
  const late = await nw.page.evaluate(() => {
    const el = document.querySelector('#content .wn5 .wn5-pt[data-stop="1303"]');
    const t = el && el.querySelector('.wi4-l2');
    return el ? { op: Number(getComputedStyle(el).opacity), amber: getComputedStyle(t).color, plain: getComputedStyle(el.querySelector('.wi4-l1')).color } : null;
  });
  ok(scn, '1440: the late stop (RT-T104 Larisa) is drawn, bold, its window amber', !!late && late.op === 1 && late.amber !== late.plain, late);
  ok(scn, '1440: no page errors', !nw.S.pageErrors.length, nw.S.pageErrors);
  await shot(nw.page, 'dim-1440');
  await nw.page.context().close();
};
// Figma 2036:7752: «/» focuses, matches raised, the rest at .35, nothing hidden; Δ12 πλακ. 6: no match said in words, the table hidden until «Καθάρισμα».
SCN.search = async (browser, origin) => {
  const scn = 'search';
  const { page, S } = await openBoard(browser, origin, { board: fixture() });
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.keyboard.press('/');
  ok(scn, '«/» focuses #wn5-search', await page.evaluate(() => !!document.activeElement && document.activeElement.id === 'wn5-search'));
  await page.keyboard.type('τστ 2104');
  const st = await page.evaluate(() => {
    const r = document.querySelector('#content .wn5');
    if (!r) return null;
    const op = (el) => Number(getComputedStyle(el).opacity);
    const rows = [...r.querySelectorAll('.wn5-row')];
    return { sm: rows.filter((e) => e.classList.contains('wi4-sm')).map((e) => e.dataset.key),
      dimmed: rows.filter((e) => e.classList.contains('wi4-dim')).length, total: rows.length,
      r101: op(r.querySelector('.wn5-row[data-key="rt:101"]')), other: op(r.querySelector('.wn5-row[data-key="rt:102"]')),
      still: [...r.querySelectorAll('.wn5-dayh, .wn5-q, .wn5-qcard, #wn5-notices, #wn5-hub')].filter((e) => e.classList.contains('wi4-dim') || op(e) < 1).length,
      n: (document.getElementById('wn5-search-n') || { textContent: '' }).textContent.trim() };
  });
  ok(scn, '«τστ 2104» raises the two cycles of TST-2104 (Greek → Latin, no dash)', !!st && JSON.stringify(st.sm) === '["rt:101","rt:107"]', st && st.sm);
  ok(scn, 'every other row fades (.wi4-dim), none is hidden', !!st && st.dimmed === st.total - 2 && st.total === 12, st && { dimmed: st.dimmed, total: st.total });
  ok(scn, 'the executed row 1 is raised to full strength; a faded row is at .35', !!st && st.r101 === 1 && Math.abs(st.other - 0.35) < 0.01, st && { r101: st.r101, other: st.other });
  ok(scn, 'day heads, ΕΠΟΜΕΝΑ, notices and the Veroia line do not fade', !!st && st.still === 0, st && st.still);
  ok(scn, 'the counter says «1/2»', !!st && st.n === '1/2', st && st.n);
  // fidelity T7 r1 (Figma 2036:7902/7903): «1/2» sits in the same key-cap chip as «/»; a plain text field, so the
  // browser draws no native «×» of its own beside it (the Weekly International's field is type="text" too).
  const fld = await page.evaluate(() => ({ chip: !!document.querySelector('#wn5-search-n > .wi4-key'), type: (document.getElementById('wn5-search') || {}).type }));
  ok(scn, 'fidelity: «1/2» in the key-cap chip, the field is type="text" (no native ×)', fld.chip && fld.type === 'text', fld);
  await page.keyboard.press('Enter');
  ok(scn, 'Enter → «2/2»', (await page.evaluate(() => (document.getElementById('wn5-search-n') || { textContent: '' }).textContent.trim())) === '2/2');
  await page.keyboard.press('Escape');
  const cleared = await page.evaluate(() => ({ v: (document.getElementById('wn5-search') || {}).value, dim: document.querySelectorAll('#content .wn5 .wi4-dim, #content .wn5 .wi4-sm').length }));
  ok(scn, 'Esc clears the text and every fade', cleared.v === '' && cleared.dim === 0, cleared);
  await page.evaluate(() => { const i = document.getElementById('wn5-search'); if (i) i.focus(); });
  await page.keyboard.type('pelagoss');
  const none = await page.evaluate(() => ({ t: (document.getElementById('wn5-snone') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
    shown: [...document.querySelectorAll('#content .wn5 .wn5-row')].filter((e) => e.getClientRects().length).length,
    inDom: document.querySelectorAll('#content .wn5 .wn5-row').length }));
  ok(scn, 'no match: «ΑΝΑΖΗΤΗΣΗ · Κανένα αποτέλεσμα για «pelagoss» στη W42 Καθάρισμα ×»', none.t === 'ΑΝΑΖΗΤΗΣΗ · Κανένα αποτέλεσμα για «pelagoss» στη W42 Καθάρισμα ×', none.t);
  ok(scn, 'no match: the table hides until «Καθάρισμα ×» (Δ12 tile 6, Ε-29) — the 12 rows are still in the page', none.shown === 0 && none.inDom === 12, none);
  // fidelity T7 r1 (Δ12 2069:10269/10411): the words are a strip of their own under the band — full width, bordered,
  // the label in the strip-label blue, letter-spaced, «Καθάρισμα ×» at its end; the field keeps its «/» key cap; the
  // column heads go with the table.
  const strip = await page.evaluate(() => {
    const s = document.getElementById('wn5-snone'), r = document.querySelector('#content .wn5'), b = s && s.querySelector('b'), btn = s && s.querySelector('button');
    if (!s || !r || !b || !btn) return null;
    const cs = getComputedStyle(s), bs = getComputedStyle(b), sr = s.getBoundingClientRect(), q = r.querySelector('.wn5-q').getBoundingClientRect();
    const cols = r.querySelector('.wn5-cols');
    return { inBand: !!s.closest('.wn5-q'), w: Math.round(sr.width), qw: Math.round(q.width), below: sr.top >= q.bottom - 1,
      border: cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0, label: bs.color, ink: cs.color, ls: parseFloat(bs.letterSpacing) || 0,
      fam: bs.fontFamily, fw: bs.fontWeight, fs: parseFloat(bs.fontSize), tw: getComputedStyle(s.querySelector('.wn5-snone-t')).fontWeight, bw: getComputedStyle(btn).fontWeight,
      gap: Math.round(s.querySelector('.wn5-snone-t').getBoundingClientRect().left - b.getBoundingClientRect().right), pl: Math.round(b.getBoundingClientRect().left - sr.left),
      endGap: Math.round(sr.right - btn.getBoundingClientRect().right), cap: (document.querySelector('#wn5-search-n > .wi4-key') || { textContent: '' }).textContent,
      cols: !cols || !cols.getClientRects().length };
  });
  ok(scn, 'fidelity: no match is a full-width bordered strip of its own under the band, «Καθάρισμα ×» at its end', !!strip && !strip.inBand && strip.below && strip.border && Math.abs(strip.w - strip.qw) <= 2 && strip.endGap <= 16, strip);
  // fidelity T7 r2 (2069:10411/10414/10415/10418): the label is set like the day names — Syne 600 12.5px, tracking .8px
  // (round 1 measured «letter-spaced» as ≥1px, which the frame does not say); the message and «Καθάρισμα ×» are DM Sans
  // Medium (500, not the shared .wi4-link 600); the strip starts its label 10px in (1px border + 10px) with an 8px gap.
  ok(scn, 'fidelity: «ΑΝΑΖΗΤΗΣΗ» in the strip-label blue, Syne 600 12.5px, tracking .8px', !!strip && strip.label !== strip.ink && /Syne/.test(strip.fam)
    && strip.fw === '600' && Math.abs(strip.fs - 12.5) < 0.01 && Math.abs(strip.ls - 0.8) < 0.01, strip && { label: strip.label, ink: strip.ink, fam: strip.fam, fw: strip.fw, fs: strip.fs, ls: strip.ls });
  ok(scn, 'fidelity: message and «Καθάρισμα ×» Medium (500); label 10px in, 8px gap', !!strip && strip.tw === '500' && strip.bw === '500' && strip.pl === 11 && strip.gap === 8,
    strip && { tw: strip.tw, bw: strip.bw, pl: strip.pl, gap: strip.gap });
  ok(scn, 'fidelity: with no match the field keeps its «/» key cap; the column heads hide with the table', !!strip && strip.cap === '/' && strip.cols, strip && { cap: strip.cap, cols: strip.cols });
  await page.evaluate(() => { const b = document.querySelector('#wn5-snone button'); if (b) b.click(); });
  ok(scn, '«Καθάρισμα ×» clears and the 12 rows are back', await page.evaluate(() => (document.getElementById('wn5-search') || {}).value === '' && !document.querySelector('#content .wn5 .wi4-dim')
    && [...document.querySelectorAll('#content .wn5 .wn5-row')].filter((e) => e.getClientRects().length).length === 12
    && !!document.querySelector('#content .wn5 .wn5-cols') && document.querySelector('#content .wn5 .wn5-cols').getClientRects().length > 0));
  await page.evaluate(() => { const i = document.getElementById('wn5-search'); if (i) { i.focus(); } });
  await page.keyboard.type('τστ');
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  const moved = await until(page, () => { const r = document.querySelector('#content .wn5'); return r && r.dataset.week === '2026-10-17' && r.dataset.state !== 'loading'; });
  const after = await page.evaluate(() => ({ v: (document.getElementById('wn5-search') || {}).value, dim: document.querySelectorAll('#content .wn5 .wi4-dim').length }));
  ok(scn, 'a week change clears the search (Ε-25)', moved && after.v === '' && after.dim === 0, { moved, after });
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await shot(page, 'search');
  await page.context().close();
};

// Notices strip: the DB's text as it is; «Σημείωσα ✓» = one POST per notice, body {}, never twice; writes closed until
// day L (409) → the Worker's message, the notices stay, the button off; 422 notice_gone → its message + a re-read.
SCN.notices = async (browser, origin) => {
  const scn = 'notices';
  const strip = (page) => page.evaluate(() => {
    const n = document.getElementById('wn5-notices');
    return n ? { notes: [...n.querySelectorAll('.wn5-note[data-id]')].map((e) => [e.getAttribute('data-id'), e.textContent.trim()]),
      head: (n.querySelector('.wn5-notes-h') || { textContent: '' }).textContent.trim(),
      // T11: the strip is WN5Act.strip's (a heading word + .wn5-strip-t); the text checked is the Worker's message
      err: [...n.querySelectorAll('.wn5-strip')].map((e) => [e.getAttribute('data-kind'), (e.querySelector('.wn5-strip-t') || e).textContent.trim()]),
      off: !!(document.getElementById('wn5-note-read') || {}).disabled } : null;
  });
  const reads = (S) => S.plan.filter((x) => x.m === 'POST' && /^\/plan\/notices\/\d+\/read$/.test(x.path));
  const press = (page) => page.evaluate(() => { const b = document.getElementById('wn5-note-read'); if (b) b.click(); return !!b; });
  // A: the texts as they came; «Σημείωσα ✓» marks both, then the board comes back without them.
  const okAnswer = (e, S) => { const id = Number(e.path.split('/')[3]); S.board.notices = S.board.notices.filter((n) => n.id !== id);
    return [200, { ok: true, op: 'plan_notice_read', dry_run: false, already: false, read_at: '2026-10-13T09:30:00+03:00', read_by: 'demo_dispatcher', ids: { notice_id: id }, warnings: [], notice_ids: [] }]; };
  const a = await openBoard(browser, origin, { board: fixture(), plan: { 'POST /plan/notices/:id/read': okAnswer } });
  const s0 = await strip(a.page);
  ok(scn, '«ΕΙΔΟΠΟΙΗΣΕΙΣ · 2» and each text = the board message as it is (sentinel)', !!s0 && s0.head === 'ΕΙΔΟΠΟΙΗΣΕΙΣ · 2'
    && JSON.stringify(s0.notes) === JSON.stringify([['9002', '· rig sentinel notice 9002'], ['9001', '· rig sentinel notice 9001']]), s0);
  const before = boardReads(a.S).length;
  await press(a.page);
  const gone = await until(a.page, () => !document.getElementById('wn5-notices') && document.querySelector('#content .wn5').dataset.state === 'ok');
  ok(scn, '«Σημείωσα ✓» → one POST per notice, body {}, nothing else', JSON.stringify(reads(a.S).map((x) => [x.path, x.raw])) === JSON.stringify([['/plan/notices/9002/read', '{}'], ['/plan/notices/9001/read', '{}']]), reads(a.S).map((x) => [x.path, x.raw]));
  ok(scn, '200 → the board is read again and the strip is gone', gone && boardReads(a.S).length === before + 1, { gone, reads: boardReads(a.S).length - before });
  ok(scn, 'no page errors (A)', !a.S.pageErrors.length, a.S.pageErrors);
  await shot(a.page, 'notices-read');
  await a.page.context().close();
  // B: writes closed until day L (the default answer of the fake = production until L).
  const one = fixture(); one.notices = one.notices.slice(0, 1);
  const b = await openBoard(browser, origin, { board: one });
  await press(b.page);
  await until(b.page, () => !!document.querySelector('#wn5-notices .wn5-strip'));
  const s1 = await strip(b.page);
  ok(scn, '409 writes_closed → one POST, the Worker message in the strip, the notice stays', reads(b.S).length === 1 && !!s1
    && JSON.stringify(s1.err) === JSON.stringify([['preview', 'rig sentinel writes_closed']]) && s1.notes.length === 1, { posts: reads(b.S).length, s1 });
  const place = await b.page.evaluate(() => { const x = document.querySelector('#wn5-notices > .wn5-strip');
    return x ? { head: (x.querySelector('.wn5-strip-h') || { textContent: '' }).textContent, next: x.nextElementSibling && x.nextElementSibling.id } : null; });
  ok(scn, 'the 409 is the Ε-6 preview strip of WN5Act.strip («ΠΡΟΕΠΙΣΚΟΠΗΣΗ»), in its T8 place just before «Σημείωσα ✓»', !!place && place.head === 'ΠΡΟΕΠΙΣΚΟΠΗΣΗ' && place.next === 'wn5-note-read', place);
  ok(scn, 'after writes_closed the button is off and WN5 knows writes are closed', !!s1 && s1.off && (await b.page.evaluate(() => WN5.snapshot().writesClosed)), s1);
  await press(b.page);
  await b.page.waitForTimeout(500);
  ok(scn, 'a second press sends nothing', reads(b.S).length === 1, reads(b.S).length);
  await shot(b.page, 'notices-closed');
  await b.page.context().close();
  // C: notice_gone (someone else got there first) → its message, a re-read, what is left stays.
  const goneAnswer = (e, S) => { const id = Number(e.path.split('/')[3]); S.board.notices = S.board.notices.filter((n) => n.id !== id); return planErr(422, 'PLAN_RULE', 'notice_gone'); };
  const c = await openBoard(browser, origin, { board: fixture(), plan: { 'POST /plan/notices/:id/read': goneAnswer } });
  const cb = boardReads(c.S).length;
  await press(c.page);
  await until(c.page, () => !!document.querySelector('#wn5-notices .wn5-strip'));
  const s2 = await strip(c.page);
  ok(scn, '422 notice_gone → one POST, its message, the board re-read, the other notice still there', reads(c.S).length === 1 && boardReads(c.S).length === cb + 1 && !!s2
    && JSON.stringify(s2.err) === JSON.stringify([['refusal', 'rig sentinel notice_gone']]) && JSON.stringify(s2.notes.map((x) => x[0])) === '["9001"]', { posts: reads(c.S).length, s2 });
  await c.page.context().close();
  // D: no notices → no strip at all.
  const none = fixture(); none.notices = [];
  const d = await openBoard(browser, origin, { board: none });
  ok(scn, 'notices: [] → no #wn5-notices', !(await d.page.$('#wn5-notices')) && !!(await d.page.$('#content .wn5[data-state="ok"]')));
  ok(scn, 'no page errors (B–D)', !b.S.pageErrors.length && !c.S.pageErrors.length && !d.S.pageErrors.length, [b.S.pageErrors, c.S.pageErrors, d.S.pageErrors]);
  await d.page.context().close();
};

// T11 fidelity round 1: the result strips as Δ12 (2069:9518 / 2104:145961 / 2078:7787 / 2069:10146) and the two-step
// dialog as Δ5 (2053:8080) / H4 (2125:7738). Every check was ✗ on fcc3fe19 (the T11 tip before this round).
SCN.strips = async (browser, origin) => {
  const scn = 'strips';
  // A: a stale answer on the board host (the dry run itself answers 422 stale_confirm): «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ», the
  // Worker's message, «Ανανέωση ↻» at the strip's end; a press re-reads the board once and the strip goes with the old root.
  const a = await openBoard(browser, origin, { board: fixture(), viewport: { width: 1440, height: 900 },
    plan: { 'POST /plan/rt/:id/clear': () => planErr(422, 'PLAN_RULE', 'stale_confirm') } });
  if (!(await a.page.evaluate(() => typeof WN5Act !== 'undefined' && !!WN5Act._kit))) { ok(scn, 'WN5Act is on the page', false); await a.page.context().close(); return; }
  await a.page.evaluate(() => { WN5Act.twoStep({ method: 'POST', path: '/plan/rt/1201/clear', body: {}, kind: 'clear', title: 't', verb: 'v' }); });
  await until(a.page, () => !!document.querySelector('.wn5-acthost .wn5-strip'));
  const st = await a.page.evaluate(() => {
    const x = document.querySelector('.wn5-acthost .wn5-strip'); if (!x) return null;
    const b = x.querySelector('.wn5-strip-act'); const r = x.getBoundingClientRect(); const br = b && b.getBoundingClientRect();
    return { kind: x.dataset.kind, head: x.querySelector('.wn5-strip-h').textContent, msg: x.querySelector('.wn5-strip-t').textContent,
      act: b && b.textContent, reload: !!(b && b.getAttribute('data-act') === 'reload'), atEnd: !!br && Math.abs(r.right - 13 - br.right) < 2,
      actW: b && getComputedStyle(b).fontWeight };
  });
  ok(scn, 'stale on the board: «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ» (every 422 of Δ12), the Worker message as it came', !!st && st.kind === 'stale' && st.head === 'ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ' && st.msg === 'rig sentinel stale_confirm', st);
  ok(scn, 'stale: «Ανανέωση ↻» at the strip\'s right end, Medium (2069:9518)', !!st && st.act === 'Ανανέωση ↻' && st.reload && st.atEnd && st.actW === '500', st);
  const r0 = boardReads(a.S).length;
  const pressed = await a.page.evaluate(() => { const x = document.querySelector('.wn5-acthost .wn5-strip-act'); if (x) x.click(); return !!x; });
  const gone = pressed && await until(a.page, () => !document.querySelector('.wn5-acthost .wn5-strip') && document.querySelector('#content .wn5').dataset.state === 'ok');
  ok(scn, '«Ανανέωση ↻» re-reads the board once, the strip goes', gone && boardReads(a.S).length === r0 + 1, { pressed, gone, reads: boardReads(a.S).length - r0 });
  // B: the strip's type and the ways on, drawn by WN5Act.strip on a host of the board
  const sb = await a.page.evaluate(() => {
    const host = WN5Act._kit.boardHost();
    const mk = (kind, code, message) => Object.assign(new Error(message), { kind, code, message });
    const put = (x) => { const d = document.createElement('div'); host.appendChild(d); return WN5Act.strip(d, x); };
    const g = (el, ...k) => { const c = getComputedStyle(el); return Object.fromEntries(k.map((x) => [x, c[x]])); };
    const ref = put(mk('refusal', 'truck_overlap', 'rig sentinel truck_overlap'));
    const ask = put(mk('refusal', 'rt_gone', 'rig sentinel rt_gone · ανανέωσε'));
    const unk = put(mk('unknown', 'plan_unknown', 'rig sentinel plan_unknown'));
    const w1 = put([{ code: 'over_33', rt_id: 1, side: 'KATHODOS', pallets: 54, saved_on: 'TST-2106' }]);
    const w2 = put([{ code: 'over_33', rt_id: 1, side: 'KATHODOS', pallets: 54, saved_on: 'TST-2106' }, { code: 'mixed_temp', side: 'KATHODOS', delta_c: 4 }]);
    const ua = unk.querySelector('.wn5-strip-act'); const ur = unk.getBoundingClientRect(); const uar = ua && ua.getBoundingClientRect();
    return { box: Object.assign(g(ref, 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'columnGap'), { h: ref.getBoundingClientRect().height }),
      head: g(ref.querySelector('.wn5-strip-h'), 'fontFamily', 'fontWeight', 'fontSize', 'letterSpacing'),
      msg: g(ref.querySelector('.wn5-strip-t'), 'fontWeight', 'fontSize', 'color'), dot: getComputedStyle(ref.querySelector('.wn5-strip-t'), '::before').content,
      headAfter: getComputedStyle(ref.querySelector('.wn5-strip-h'), '::after').content,
      refAct: !!ref.querySelector('.wn5-strip-act'), askAct: !!ask.querySelector('.wn5-strip-act[data-act="reload"]'),
      unk: ua && { text: ua.textContent, w: getComputedStyle(ua).fontWeight, c: getComputedStyle(ua).color, head: getComputedStyle(unk.querySelector('.wn5-strip-h')).color, atEnd: Math.abs(ur.right - 13 - uar.right) < 2 },
      w1: { ul: !!w1.querySelector('ul'), t: (w1.querySelector('.wn5-strip-t') || { textContent: null }).textContent, h: w1.getBoundingClientRect().height },
      w2: w2.querySelectorAll('ul > li').length,
      // T11 fidelity round 2: the «↻» drawn as an icon the height of the text; several warnings with the dialog's «•»
      ico: (() => { const i = ask.querySelector('.wn5-strip-act .wn5-ico-re'); if (!i) return null; const c = getComputedStyle(i); const r = i.getBoundingClientRect();
        const b = ask.querySelector('.wn5-strip-act'); const br = b.getBoundingClientRect(); const up = document.querySelector('.wn5-bar .wn5-upd'); const ui = up && up.querySelector('.wn5-ico-re');
        const mid = (e) => { const q = e.getBoundingClientRect(); return (q.top + q.bottom) / 2; };
        return { w: r.width, h: r.height, fs: c.fontSize, mask: c.maskImage || c.webkitMaskImage, hidden: i.getAttribute('aria-hidden'), bg: c.backgroundColor, color: getComputedStyle(b).color,
          linkH: br.height, mid: Math.abs(mid(i) - mid(b)), stripH: ask.getBoundingClientRect().height,
          bar: ui && { h: up.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(up).lineHeight) || null, mid: Math.abs(mid(ui) - mid(up)) } }; })(),
      list: (() => { const ul = w2.querySelector('ul'); const li = ul && ul.querySelector('li'); if (!li) return null;
        return { ls: getComputedStyle(ul).listStyleType, pl: getComputedStyle(ul).paddingLeft, gap: getComputedStyle(li).columnGap, bullet: getComputedStyle(li, '::before').content }; })() };
  });
  ok(scn, 'strip box as Δ12: 34px, padding 8/12/8/10, 8px between label and message', sb.box.h === 34 && sb.box.paddingTop === '8px' && sb.box.paddingRight === '12px'
    && sb.box.paddingBottom === '8px' && sb.box.paddingLeft === '10px' && sb.box.columnGap === '8px', sb.box);
  ok(scn, 'label Syne SemiBold 12.5px, tracking .8px', /Syne/.test(sb.head.fontFamily) && sb.head.fontWeight === '600' && sb.head.fontSize === '12.5px' && sb.head.letterSpacing === '0.8px', sb.head);
  ok(scn, 'message DM Sans Medium 12px grey-1 (#344054) also on a refusal, «· » before it, none after the label', sb.msg.fontWeight === '500' && sb.msg.fontSize === '12px'
    && sb.msg.color === 'rgb(52, 64, 84)' && /·/.test(sb.dot) && !/·/.test(sb.headAfter), sb);
  ok(scn, '«Ανανέωση ↻» only where the base asks for a re-read (stale, «ανανέωσε»), never on a plain refusal', !sb.refAct && sb.askAct, { ref: sb.refAct, ask: sb.askAct });
  ok(scn, '«Έλεγχος στο board» at the end, Medium, in the strip\'s own colour', !!sb.unk && sb.unk.text === 'Έλεγχος στο board' && sb.unk.w === '500' && sb.unk.c === sb.unk.head && sb.unk.atEnd, sb.unk);
  ok(scn, 'one warning is one 34px line «ΠΡΟΕΙΔΟΠΟΙΗΣΗ · …» (2104:145961); two are a list', !sb.w1.ul && sb.w1.t === 'Υπέρβαση 21π στο TST-2106 — αποθηκεύτηκε' && sb.w1.h === 34 && sb.w2 === 2, sb);
  ok(scn, '«↻» is a 12px round-arrow icon in the link colour (a mask, the glyph sized 0, aria-hidden), not the text glyph (Δ12)', !!sb.ico && sb.ico.w === 12 && sb.ico.h === 12
    && sb.ico.fs === '0px' && /svg/.test(sb.ico.mask || '') && sb.ico.hidden === 'true' && sb.ico.bg === sb.ico.color, sb.ico);
  ok(scn, 'the icon sits on the word\'s line: the link one 16px line, the strip still 34, the icon centred on it (±1.5); the bar\'s «↻ hh:mm» too',
    !!sb.ico && sb.ico.linkH === 16 && sb.ico.stripH === 34 && sb.ico.mid <= 1.5 && !!sb.ico.bar && sb.ico.bar.mid <= 1.5 && sb.ico.bar.h <= 18, sb.ico);
  ok(scn, 'several warnings: the dialog\'s «•» with 8px, no browser disc, no 16px indent', !!sb.list && sb.list.ls === 'none' && sb.list.pl === '0px' && sb.list.gap === '8px' && /•/.test(sb.list.bullet), sb.list);
  ok(scn, 'no page errors (A–B)', !a.S.pageErrors.length, a.S.pageErrors);
  await shot(a.page, 'strips');
  await a.page.context().close();
  // C: the two-step dialog (owner: amounts present)
  const dry = (e) => e.body && e.body.dry_run ? [200, { ok: true, op: 'plan_rt_clear', dry_run: true, needs_confirm: true, confirm_token: 'tok-1',
    consequences: [{ kind: 'costs', rt_id: 1201, count: 2, pay_source: 'DKV', amount: 186.4 }, { kind: 'payroll_amount', rt_id: 1201, month: '2026-10', amount: 120 },
      { kind: 'rt_cancelled', rt_id: 1201, code: 'RT-T104' }], warnings: [] }] : planErr(409, 'WRITES_CLOSED', 'writes_closed');
  const c = await openBoard(browser, origin, { board: fixture(), viewport: { width: 1440, height: 900 }, role: 'owner', plan: { 'POST /plan/rt/:id/clear': dry } });
  c.page.evaluate(() => { WN5Act.twoStep({ method: 'POST', path: '/plan/rt/1201/clear', body: {}, kind: 'clear', title: 'Καθαρισμός · rig;', verb: 'Καθαρισμός', danger: true, intro: ['rig intro'] }); });
  await until(c.page, () => !!document.querySelector('.wn5-dlg[data-wn5="clear"] .wn5-cons'));
  const dl = await c.page.evaluate(() => {
    const d = document.querySelector('.wn5-dlg'); const g = (sel, ...k) => { const e = d.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return Object.fromEntries(k.map((x) => [x, c[x]])); };
    const lis = [...d.querySelectorAll('.wn5-cons li')]; const r = d.getBoundingClientRect(); const s = getComputedStyle(d);
    return { w: r.width, rad: s.borderRadius, pad: s.padding, shadow: s.boxShadow, x: !!d.querySelector('.wi4-dlg-x'),
      title: g('.wi4-dlg-t', 'fontFamily', 'fontWeight', 'fontSize', 'color'), intro: g('.wn5-dlg-b > p', 'fontSize', 'color'), ch: g('.wn5-cons-h', 'fontWeight', 'fontSize', 'color'),
      li: g('.wn5-cons li', 'fontSize', 'color', 'listStyleType'), bullet: lis[0] && getComputedStyle(lis[0], '::before').content,
      pitch: lis.length > 1 ? lis[1].getBoundingClientRect().top - lis[0].getBoundingClientRect().top : null,
      texts: lis.map((x) => x.textContent), ft: g('.wi4-dlg-ft', 'columnGap'),
      // vertical rhythm against the frame's metadata (2053:8080), measured from the dialog's top edge
      v: (() => { const top = (e) => e.getBoundingClientRect().top - r.top; const bot = (e) => e.getBoundingClientRect().bottom - r.top;
        const t = d.querySelector('.wi4-dlg-t'), p = d.querySelector('.wn5-dlg-b > p'), h = d.querySelector('.wn5-cons-h'), b = d.querySelector('[data-act="confirm"]');
        const h1 = h.nextElementSibling.querySelector('li'), last = lis[lis.length - 1];
        return { title: top(t), titleH: bot(t) - top(t), introGap: top(p) - bot(t), introH: bot(p) - top(p), headH: bot(h) - top(h),
          headRow: top(h1) - bot(h), rowBtn: top(b) - bot(last), btnEnd: r.height - bot(b) }; })(),
      cancel: g('[data-act="cancel"]', 'height', 'fontSize', 'fontWeight', 'paddingLeft', 'borderTopColor'), confirm: g('[data-act="confirm"]', 'height', 'fontSize', 'fontWeight', 'paddingLeft') };
  });
  ok(scn, 'Δ5 frame: 600 wide, radius 12, padding 18/22, shadow 0 8 24 rgba(10,26,41,.16), no «×»', dl.w === 600 && dl.rad === '12px' && dl.pad === '18px 22px'
    && dl.shadow === 'rgba(10, 26, 41, 0.16) 0px 8px 24px 0px' && !dl.x, dl);
  ok(scn, 'title Syne Bold 18px ink; intro 12.5px grey; headings SemiBold 12px grey', !!dl.title && /Syne/.test(dl.title.fontFamily) && dl.title.fontWeight === '700' && dl.title.fontSize === '18px'
    && dl.title.color === 'rgb(11, 25, 41)' && dl.intro.fontSize === '12.5px' && dl.intro.color === 'rgb(91, 107, 127)'
    && dl.ch.fontWeight === '600' && dl.ch.fontSize === '12px' && dl.ch.color === 'rgb(91, 107, 127)', dl);
  ok(scn, 'rows 13px grey-1, a «•» glyph (no CSS disc), 29px pitch', !!dl.li && dl.li.fontSize === '13px' && dl.li.color === 'rgb(52, 64, 84)' && dl.li.listStyleType === 'none'
    && /•/.test(dl.bullet) && dl.pitch === 29, dl);
  ok(scn, 'rhythm as 2053:8080: title at 19 (22 tall), 12 to the intro, intro and headings 16 tall, heading→row 12, last row→buttons 20, 19 under the buttons',
    dl.v.title === 19 && dl.v.titleH === 22 && dl.v.introGap === 12 && dl.v.introH === 16 && dl.v.headH === 16 && dl.v.headRow === 12 && dl.v.rowBtn === 20 && dl.v.btnEnd === 19, dl.v);
  ok(scn, 'the payroll row starts «Μισθοδοσία · γραμμή μισθοδοσίας με ποσό (Οκτώβριος)» (Δ5 / H4)', dl.texts.some((t) => t.startsWith('Μισθοδοσία · γραμμή μισθοδοσίας με ποσό (Οκτώβριος)')), dl.texts);
  ok(scn, 'buttons 36px 13px, «Άκυρο» Medium padding 14 #d0d5dd border, the verb SemiBold padding 16, gap 10', !!dl.cancel && dl.cancel.height === '36px' && dl.cancel.fontSize === '13px'
    && dl.cancel.fontWeight === '500' && dl.cancel.paddingLeft === '14px' && dl.cancel.borderTopColor === 'rgb(208, 213, 221)'
    && dl.confirm.height === '36px' && dl.confirm.fontWeight === '600' && dl.confirm.paddingLeft === '16px' && dl.ft.columnGap === '10px', dl);
  ok(scn, 'no page errors (C)', !c.S.pageErrors.length, c.S.pageErrors);
  await shot(c.page, 'strips-dialog');
  await c.page.context().close();
};

// ═══ Batch B (T12–T19): one synthetic week for the action scenarios ═════════════════════════════════
// The plan_board shape of 072 (worker/migrations/072_plan_functions.sql:2365) with ids of their own, so the action
// checks do not depend on the case list of tests/fixtures/wn5-week.json. Keys marked E26 are NOT in the live 072
// hub[] (plan Ε-26): the screen uses them only when present; one scenario of T19 drops them on purpose. As on the
// live 072, VS-T118 (no national truck yet) is in hub[], so WN5L draws it as a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row + ΕΠΟΜΕΝΑ card;
// VS-T125 carries for_split (plan Ε-41, not in 072 either: «sent with ✈ Σπάσιμο»), so it is the «ΓΙΑ ΜΟΙΡΑΣΜΑ» item.
const B_WEEK = '2026-10-10';
const bT = (day, hm) => `${day}T${hm}:00+03:00`;
const B_LOC = { 1: 'ΒΕΡΟΙΑ TEST', 2: 'RENTIS TEST', 3: 'ASPROPYRGOS TEST', 4: 'ATHENS TEST', 5: 'THESSALONIKI TEST', 6: 'LARISA TEST' };
function bLeg(leg_id, piece_id, act, pallets, o) {
  return Object.assign({ leg_id, piece_id, act, pallets, kind: 'national', order_id: null, nat_order_id: 3000 + piece_id % 1000, reference: 'N-T' + piece_id,
    client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 2 }, o || {});
}
function bStop(stop_id, side, loc, day, from, to, legs, extra) {
  return Object.assign({ stop_id, seq: 0, side, location_id: loc, location: B_LOC[loc], planned_from: bT(day, from), planned_to: bT(day, to), stop_day: day,
    executed: false, has_vehicle: true, has_late: false, dim: false, side_dim: false, cycle_dim: false, local_loading: null, legs }, extra || {});
}
function bCycle(rt_id, o, stops) {
  stops.forEach((s, i) => { s.seq = i + 1; });
  return Object.assign({ rt_id, code: 'RT-T' + rt_id, trip_type: 'OWNED', truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null,
    partner_id: null, partner: null, start_at: stops[0].planned_from, end_at: stops[stops.length - 1].planned_to, date_start: stops[0].stop_day,
    date_end: stops[stops.length - 1].stop_day, ended: false, stops, partner_rate: null }, o);
}
const e26 = (loc, day, from, to) => ({ nat_to_location_id: loc, deliver_from: bT(day, from), deliver_to: bT(day, to),
  load_from: bT('2026-10-12', '14:00'), load_to: bT('2026-10-12', '17:00') });
function bHub(piece_id, o) {
  return Object.assign({ piece_id, shipment_id: piece_id + 100, kind: 'vs_import', order_id: null, nat_order_id: null, order_stop_id: null, pallets: 0, is_stock: false,
    leave_by: null, overdue: false, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13', inbound_rt_id: null, client_id: 42, client: 'ΠΕΛΑΤΗΣ Β',
    reference: 'VS-T118', temperature_c: 2 }, o);
}
function bBoard() {
  const SAT = '2026-10-10', SUN = '2026-10-11', MON = '2026-10-12', TUE = '2026-10-13';
  const vs = { kind: 'vs_import', order_id: 2201, nat_order_id: null, reference: 'VS-T201', client: 'ΠΕΛΑΤΗΣ Δ', client_id: 44 };
  const n111 = { nat_order_id: 3111, reference: 'N-T111', client: 'ΠΕΛΑΤΗΣ Ε', client_id: 45 };
  return {
    week: B_WEEK,
    cycles: [
      bCycle(201, { truck_id: 12, truck: 'TST-2106', trailer_id: 21, trailer: 'TRL-5101', driver_id: 32, driver: 'Driver Test 02' }, [
        bStop(2001, 'KATHODOS', 1, MON, '16:00', '18:00', [bLeg(6001, 5101, 'load', 12, vs), bLeg(6002, 5102, 'load', 15, vs)]),
        bStop(2002, 'KATHODOS', 2, TUE, '06:00', '08:00', [bLeg(6001, 5101, 'unload', 12, vs)]),
        bStop(2003, 'KATHODOS', 3, TUE, '07:00', '09:00', [bLeg(6002, 5102, 'unload', 15, vs)]) ]),
      bCycle(202, { trip_type: 'PARTNER', partner_id: 51, partner: 'Partner Test 01', partner_rate: null }, [
        bStop(2011, 'KATHODOS', 1, MON, '19:00', '20:00', [bLeg(6011, 5111, 'load', 23, n111)]),
        bStop(2012, 'KATHODOS', 4, TUE, '08:00', '10:00', [bLeg(6011, 5111, 'unload', 23, n111)]) ]),
      bCycle(203, { truck_id: 11, truck: 'TST-2104', trailer_id: 22, trailer: 'TRL-5102', driver_id: 31, driver: 'Driver Test 01' }, [
        bStop(2021, 'KATHODOS', 1, SAT, '15:00', '17:00', [bLeg(6021, 5121, 'load', 10)], { executed: true, dim: true }),
        bStop(2022, 'KATHODOS', 2, SUN, '06:00', '08:00', [bLeg(6021, 5121, 'unload', 10)], { executed: true, dim: true }),
        bStop(2023, 'ANODOS', 3, MON, '12:00', '14:00', [bLeg(6023, 5123, 'load', 8)]),
        bStop(2024, 'ANODOS', 1, MON, '20:00', '22:00', [bLeg(6023, 5123, 'unload', 8)]) ]),
      bCycle(204, { truck_id: 13, truck: 'TST-2103', trailer_id: 23, trailer: 'TRL-5103', driver_id: 33, driver: 'Driver Test 03' }, [
        bStop(2033, 'KATHODOS', 5, MON, '11:00', '12:00', [bLeg(6032, 5132, 'load', 10)]),
        bStop(2031, 'KATHODOS', 1, MON, '18:00', '19:00', [bLeg(6031, 5131, 'load', 6)]),
        bStop(2032, 'KATHODOS', 6, TUE, '05:00', '07:00', [bLeg(6031, 5131, 'unload', 6)]),
        bStop(2034, 'KATHODOS', 4, TUE, '10:00', '12:00', [bLeg(6032, 5132, 'unload', 10)]),
        bStop(2035, 'ANODOS', 3, TUE, '12:00', '14:00', [bLeg(6035, 5135, 'load', 9)]),
        bStop(2036, 'ANODOS', 1, TUE, '20:00', '22:00', [bLeg(6035, 5135, 'unload', 9)]) ]),
    ],
    waiting: [
      { piece_id: 4201, shipment_id: 4211, kind: 'national', order_id: null, nat_order_id: 3201, order_stop_id: null, pallets: 6, leave_by: null,
        position_location_id: 5, nat_from_location_id: 5, nat_to_location_id: 4, nat_ready_day: MON, nat_due_day: TUE, overdue: false, is_stock: false,
        client_id: 46, client: 'ΠΕΛΑΤΗΣ ΣΤ', reference: 'N-T201', temperature_c: 4, pallet_exchange: false,
        load_from: bT(MON, '11:00'), load_to: bT(MON, '12:00'), deliver_from: bT(TUE, '08:00'), deliver_to: bT(TUE, '10:00'), price: 310 },
      { piece_id: 4202, shipment_id: 4212, kind: 'national', order_id: null, nat_order_id: 3202, order_stop_id: null, pallets: 8, leave_by: null,
        position_location_id: 3, nat_from_location_id: 3, nat_to_location_id: 1, nat_ready_day: MON, nat_due_day: MON, overdue: false, is_stock: false,
        client_id: 47, client: 'ΠΕΛΑΤΗΣ Ζ', reference: 'N-T202', temperature_c: 4, pallet_exchange: false,
        load_from: bT(MON, '12:00'), load_to: bT(MON, '15:00'), deliver_from: bT(MON, '20:00'), deliver_to: bT(MON, '22:00'), price: 280 },
    ],
    hub: [
      bHub(4101, Object.assign({ order_id: 2101, order_stop_id: 6101, pallets: 9 }, e26(2, TUE, '06:00', '08:00'))),
      bHub(4102, Object.assign({ order_id: 2101, order_stop_id: 6102, pallets: 12 }, e26(3, TUE, '07:00', '09:00'))),
      bHub(4103, Object.assign({ order_id: 2101, order_stop_id: 6103, pallets: 6 }, e26(4, TUE, '09:00', '10:00'))),
      bHub(4401, Object.assign({ order_id: 2125, order_stop_id: 6125, pallets: 33, reference: 'VS-T125', client: 'ΠΕΛΑΤΗΣ Η', client_id: 47, for_split: true }, e26(3, TUE, '07:00', '09:00'))),
      bHub(4301, Object.assign({ kind: 'national', nat_order_id: 3101, pallets: 13, is_stock: true, leave_by: MON, reference: 'N-T013', client: 'ΠΕΛΑΤΗΣ Γ', client_id: 43, temperature_c: 4 }, e26(4, TUE, '08:00', '10:00'))),
      bHub(4302, Object.assign({ kind: 'national', nat_order_id: 3102, pallets: 4, is_stock: true, leave_by: SUN, overdue: true, reference: 'N-T014', client: 'ΠΕΛΑΤΗΣ Θ', client_id: 48, temperature_c: 4 }, e26(6, '2026-10-15', '09:00', '11:00'))),
    ],
    notices: [],
  };
}
const B_LOOKUPS = {
  locations: Object.keys(B_LOC).map((k) => ({ id: Number(k), legacy_id: 'recLOC' + k, name: B_LOC[k], address: 'Test street ' + k, city: 'Test city ' + k, phone: null, is_hub: k === '1' })),
  clients: [41, 42, 43, 44, 45, 46, 47, 48].map((id) => ({ id, legacy_id: 'recCLI' + id, company_name: 'ΠΕΛΑΤΗΣ ' + id })),
  trucks: [[11, 'TST-2104'], [12, 'TST-2106'], [13, 'TST-2103'], [14, 'TST-2108'], [15, 'TST-2107']].map(([id, p]) => ({ id, legacy_id: 'recTRK' + id, license_plate: p, active: true })),
  trailers: [21, 22, 23, 24, 25].map((id) => ({ id, legacy_id: 'recTRL' + id, license_plate: 'TRL-51' + String(id - 20).padStart(2, '0'), active: true })),
  drivers: [31, 32, 33, 34, 35].map((id) => ({ id, legacy_id: 'recDRV' + id, full_name: 'Driver Test 0' + (id - 30), active: true })),
  partners: [[51, 'Partner Test 01'], [52, 'Partner Test 02']].map(([id, n]) => ({ id, legacy_id: 'recPRT' + id, company_name: n, active: true })),
};
const bPlan = (extra) => Object.assign({ 'GET /plan/lookups': () => [200, clone(B_LOOKUPS)] }, extra || {});
async function bOpen(browser, origin, opts) {
  opts = opts || {};
  const o = await openBoard(browser, origin, Object.assign({}, opts, { board: opts.board || bBoard(), plan: bPlan(opts.plan) }));
  await o.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  return o;
}
const bHas = (page, sel) => page.$(sel).then((h) => !!h, () => false);
async function bClick(page, sel) { const h = await page.$(sel).catch(() => null); if (!h) return false; await h.click(); await page.waitForTimeout(200); return true; }
const bText = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => '');
const bOff = (page, sel) => page.$eval(sel, (b) => b.disabled).catch(() => null);   // true / false / null (absent)
// a <select> behind fhSelectSearch: set it as the page would and say so to its listeners
const bPick = (page, sel, value) => page.$eval(sel, (s, v) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, value).then(() => true, () => false);
const bCalls = (S, m, p) => S.plan.filter((x) => x.m === m && (p instanceof RegExp ? p.test(x.path) : x.path === p));
const bDlg = (kind) => `.wi4-dlg[role="dialog"][data-wn5="${kind}"]`;
const bEv = (page) => page.evaluate(() => (window.__ev || []).map((e) => e.k + ': ' + JSON.stringify(e.a))).catch(() => []);
async function bMenu(page, rtId, item) {
  if (!(await bClick(page, `.wn5-row[data-rt="${rtId}"] .wi4-plane`))) return false;
  // a child of a «›» line (Figma 2011:8858 submenus): open its line first, as a user does
  const parent = await page.$eval(`#wn5-menu [data-item="${item}"]`, (b) => { const s = b.closest('[data-sub]'); return s ? s.getAttribute('data-sub') : null; }).catch(() => null);
  if (parent && !(await bClick(page, `#wn5-menu[role="menu"] [data-item="${parent}"]`))) return false;
  return bClick(page, `#wn5-menu[role="menu"] [data-item="${item}"]`);
}
const B_QVS = ['4101', '4102', '4103'].map((p) => `.wn5-qcard[data-piece="${p}"] [data-act="assign"]`).join(', ');
const OK_PUT = (extra) => [200, Object.assign({ ok: true, op: 'plan_put_group', dry_run: false, ids: { rt_id: 201, stop_ids: [], leg_ids: [], piece_ids: [] }, warnings: [], notice_ids: [] }, extra || {})];

// T12 — the assignment window Δ1 (Figma 2051:7735): one window, four entries, the body = the window's state.
async function scnAssign(browser, origin) {
  const scn = 'assign';
  const D = bDlg('assign');
  { // A · ΕΠΟΜΕΝΑ «Ανάθεση» → groups, capacity, rate field, «Ένωση» (writes closed: the preview)
    const { page, S } = await bOpen(browser, origin);
    ok(scn, 'the batch-B board painted', await bHas(page, '#content > .wi4.wn5[data-state="ok"]'), S.pageErrors);
    ok(scn, 'ΕΠΟΜΕΝΑ «Ανάθεση» opens .wi4-dlg[data-wn5=assign]', (await bClick(page, B_QVS)) && await bHas(page, D));
    const txt = await bText(page, D);
    ok(scn, 'groups «ΚΥΚΛΟΙ ΤΗΣ ΔΕΥΤΕΡΑΣ 12/10», «ΕΛΕΥΘΕΡΑ ΦΟΡΤΗΓΑ», «ΣΥΝΕΡΓΑΤΗΣ»', /ΚΥΚΛΟΙ ΤΗΣ ΔΕΥΤΕΡΑΣ 12\/10/.test(txt) && txt.includes('ΕΛΕΥΘΕΡΑ ΦΟΡΤΗΓΑ') && txt.includes('ΣΥΝΕΡΓΑΤΗΣ'), txt.slice(0, 400));
    ok(scn, '«Όλο το VS-T118 μαζί · σπάσιμο μόνο στον Πίνακα Βέροιας»', txt.includes('Όλο το VS-T118 μαζί · σπάσιμο μόνο στον Πίνακα Βέροιας'), txt.slice(0, 300));
    // fidelity round 1 (Figma Δ1 2051:7735): title «ref → first place +N», meta and filter in the header, plates in mono
    await shot(page, 'assign-queue');
    const t1 = await bText(page, `${D} .wi4-dlg-t`), m1 = await bText(page, `${D} .wi4-dlg-hd .wn5-dlg-meta`);
    ok(scn, 'title «Ανάθεση · VS-T118 → RENTIS TEST +2», meta inline, «Μόνο ελεύθερα | Όλα» in the header', t1 === 'Ανάθεση · VS-T118 → RENTIS TEST +2'
      && m1 === '· Δευ 12/10 · 3 παραδόσεις · 27π · φτάνει 14:00' && await bHas(page, `${D} .wi4-dlg-hd .wn5-seg [data-v="free"]`), { t1, m1 });
    ok(scn, 'cycle plates as .wi4-plate; the partner cycle says «Μόνο κάθοδος · συνεργάτης»; the road box «κύκλος 1», «Βέροια ως Δευ 22:00»',
      (await bHas(page, `${D} [data-line="rt"] .wi4-l1.wi4-plate`)) && await bHas(page, `${D} [data-line="free"] .wi4-l1.wi4-plate`)
      && txt.includes('Μόνο κάθοδος · συνεργάτης') && txt.includes('Βέροια ως Δευ 22:00') && /Driver Test 01 · κύκλος 1/.test(await bText(page, `${D} [data-line="road"]`)), txt.slice(0, 700));
    // fidelity round 2 (Figma Δ1 2051:7735): rows edge to edge (pl 24 / pr 12), chips right against the button even
    // when they wrap, the over chip flat amber, the filter a borderless tray; «Μόνο ελεύθερα» hides an emptied group
    const geo = await page.$eval(D, (dlg) => {
      const r = (e) => e.getBoundingClientRect(), dr = r(dlg), bl = parseFloat(getComputedStyle(dlg).borderLeftWidth) || 0;
      const rows = [...dlg.querySelectorAll('.wn5-cand')].map((row) => {
        const rr = r(row), third = row.children[2], btn = row.querySelector(':scope > .wi4-btn');
        const tr = r(third), kids = [...third.children].map(r).filter((k) => k.width || k.height);   // a display:none child (the hidden «Κράτα», T14 r1) paints nothing
        const lines = {};
        for (const k of kids) { const key = Math.round(k.top + k.height / 2); const near = Object.keys(lines).find((x) => Math.abs(x - key) < 8); lines[near || key] = Math.max(lines[near || key] || 0, k.right); }
        return { line: row.dataset.line, l: Math.round(rr.left - dr.left - bl), w: Math.round(rr.width), box: Math.round(r(row.children[0]).left - rr.left),
          gapBtn: btn && kids.length ? Math.round(r(btn).left - tr.right) : null, ends: Object.values(lines).map((x) => Math.round(tr.right - x)), h: Math.round(rr.height) };
      });
      return { inner: Math.round(dr.width - 2 * bl), rows };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'every candidate row runs edge to edge (full window width), its box 24px in', !!geo.rows && geo.rows.length > 0
      && geo.rows.every((x) => x.l === 0 && x.w === geo.inner && x.box === 24), geo);
    ok(scn, 'chips sit right against the button: every line of the third column ends at its right edge, 8px before the button',
      !!geo.rows && geo.rows.filter((x) => x.gapBtn !== null).length >= 4 && geo.rows.every((x) => x.gapBtn === null || (x.gapBtn === 8 && x.ends.every((e) => Math.abs(e) <= 1))), geo.rows);
    const chip = await page.$eval(`${D} .wn5-cap.over`, (e) => { const s = getComputedStyle(e); return [s.borderTopColor, s.fontSize, s.fontWeight].join('|'); }).catch(() => '');
    const blue = await page.$eval(`${D} .wn5-cap:not(.over)`, (e) => { const s = getComputedStyle(e); return [s.borderTopColor, s.fontSize, s.fontWeight].join('|'); }).catch(() => '');
    ok(scn, 'over-capacity chip flat (no border), 10.5px/500; blue chips keep their 1px edge', chip === 'rgba(0, 0, 0, 0)|10.5px|500' && /^rgb\(186, 230, 253\)\|10\.5px\|500$/.test(blue), { chip, blue });
    const seg = await page.$eval(`${D} .wn5-seg`, (e) => { const s = getComputedStyle(e), o = e.querySelector('.on'), so = o && getComputedStyle(o);
      return [s.borderTopWidth, s.paddingTop, s.borderTopLeftRadius, o && Math.round(o.getBoundingClientRect().height), so && so.borderTopLeftRadius].join('|'); }).catch(() => '');
    ok(scn, 'filter «Μόνο ελεύθερα | Όλα»: borderless tray, padding 3, radius 9; chosen tab 28px, radius 6', seg === '0px|3px|9px|28|6px', seg);
    // fidelity round 3 (Figma Δ1 2051:7735 metadata): header 44 (title DM Sans 600 13px), band right under it, rows of
    // 40 that touch, the 287×28 search field holds its whole placeholder at 12px, row buttons 22px
    const v3 = await page.$eval(D, (dlg) => {
      const r = (e) => e.getBoundingClientRect(), top = r(dlg).top + (parseFloat(getComputedStyle(dlg).borderTopWidth) || 0);
      const hd = dlg.querySelector('.wi4-dlg-hd'), t = dlg.querySelector('.wi4-dlg-t'), ts = getComputedStyle(t), band = dlg.querySelector('.wn5-grey');
      const q = dlg.querySelector('.wn5-dq'), qs = getComputedStyle(q), cv = document.createElement('canvas').getContext('2d');
      cv.font = qs.fontWeight + ' ' + qs.fontSize + ' ' + qs.fontFamily;
      // Chrome lays a type=search field's hidden «×» (14px) beside the text even when empty, so it is not room
      const room = q.clientWidth - parseFloat(qs.paddingLeft) - parseFloat(qs.paddingRight) - (q.type === 'search' ? 14 : 0);
      const rows = [...dlg.querySelectorAll('[data-line="rt"], [data-line="road"]')].filter((x) => !x.hidden).map((x) => ({ top: Math.round(r(x).top), h: Math.round(r(x).height) }));
      const pitch = rows.slice(1).map((x, i) => x.top - rows[i].top);
      return { hd: Math.round(r(hd).height), hdTop: Math.round(r(hd).top - top), band: band && Math.round(r(band).top - top), title: [ts.fontFamily.split(',')[0].replace(/["']/g, ''), ts.fontWeight, ts.fontSize].join('|'),
        q: [Math.round(r(q).width), Math.round(r(q).height), qs.fontSize].join('|'), text: Math.ceil(cv.measureText(q.placeholder).width), fits: Math.ceil(cv.measureText(q.placeholder).width) <= room, room,
        rows, pitch, btn: [...dlg.querySelectorAll('.wn5-cand > .wi4-btn.sm')].map((b) => Math.round(r(b).height)) };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'fidelity r3: header 44px from the top edge, the band starts right under it, title DM Sans 600 13px',
      v3.hd === 44 && v3.hdTop === 0 && v3.band === 44 && v3.title === 'DM Sans|600|13px', v3);
    ok(scn, 'fidelity r3: one-line cycle rows are 40px and touch (pitch 40, no gap); the partner row wrapping «Κράτα» is the only taller one',
      !!v3.rows && v3.rows.length >= 4 && v3.rows.filter((x) => x.h !== 40).length <= 1 && v3.pitch.every((p, i) => p === v3.rows[i].h), v3.rows && { rows: v3.rows, pitch: v3.pitch });
    ok(scn, 'fidelity r3: search field 287×28 at 12px and its whole placeholder fits; row buttons 22px tall',
      v3.q === '287|28|12px' && v3.fits === true && !!v3.btn && v3.btn.length >= 4 && v3.btn.every((h) => h === 22), v3);
    // fidelity run 2 r1 (Figma Δ1 2051:7735): fields edged in the board line #E2E8F0 with grey-3 hints (#98A2B3, as
    // .wi4-search); group suffix 6px after the label (flex gap, 2051:7752); filter tabs 12.5px, 500 / chosen 600;
    // the Veroia-window label as the field labels (12px grey-1); band text at x 15 like the title (14 + the edge)
    const v4 = await page.$eval(D, (dlg) => {
      const cs = (e) => getComputedStyle(e), r = (e) => e.getBoundingClientRect();
      const fields = [...dlg.querySelectorAll('.wn5-dq, .wn5-hm')].map((e) => [cs(e).borderTopColor, getComputedStyle(e, '::placeholder').color].join('|'));
      const gh = dlg.querySelector('[data-grp="rt"]'), sp = gh && gh.querySelector('span'), rg = document.createRange();
      if (gh) rg.selectNodeContents(gh.firstChild);
      // label end → the suffix's first glyph «·» (the suffix's leading space is part of the gap, as the critic measured)
      const lr = gh ? rg.getBoundingClientRect().right : 0, tn = sp && sp.firstChild, i0 = tn ? tn.data.search(/\S/) : -1;
      if (i0 >= 0) { rg.setStart(tn, i0); rg.setEnd(tn, i0 + 1); }
      const gap = i0 >= 0 ? Math.round(rg.getBoundingClientRect().left - lr) : null;
      const tabs = [...dlg.querySelectorAll('.wn5-seg button')].map((b) => [b.classList.contains('on') ? 'on' : 'off', cs(b).fontSize, cs(b).fontWeight].join('|'));
      const hw = dlg.querySelector('.wn5-hubwin > span'), band = dlg.querySelector('.wn5-grey');
      const bl = parseFloat(cs(dlg).borderLeftWidth) || 0;
      if (band) rg.selectNodeContents(band);
      return { fields, gap, tabs, hub: hw && [cs(hw).fontSize, cs(hw).color].join('|'), bandX: band && Math.round(rg.getBoundingClientRect().left - r(dlg).left), bl };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'fidelity run2: search and ΗΗ:ΛΛ fields edged #E2E8F0, placeholder #98A2B3 (grey-3)', !!v4.fields && v4.fields.length === 3
      && v4.fields.every((f) => f === 'rgb(226, 232, 240)|rgb(152, 162, 179)'), v4.fields);
    ok(scn, 'fidelity run2: group suffix 6px after the label; filter tabs 12.5px, 500 / chosen 600', v4.gap === 6
      && JSON.stringify((v4.tabs || []).slice().sort()) === JSON.stringify(['off|12.5px|500', 'on|12.5px|600']), { gap: v4.gap, tabs: v4.tabs });
    ok(scn, 'fidelity run2: «Παράθυρο φόρτωσης Βέροιας *» 12px grey-1 as the field labels; band text at x 15', v4.hub === '12px|rgb(52, 64, 84)' && v4.bandX === 15, v4);
    await bClick(page, `${D} .wn5-seg [data-v="free"]`);
    const hidRt = await page.$eval(`${D} [data-grp="rt"]`, (e) => e.offsetParent === null).catch(() => null);
    const shownFree = await page.$eval(`${D} [data-grp="free"]`, (e) => e.offsetParent !== null).catch(() => null);
    await bClick(page, `${D} .wn5-seg [data-v="all"]`);
    const backRt = await page.$eval(`${D} [data-grp="rt"]`, (e) => e.offsetParent !== null).catch(() => null);
    ok(scn, '«Μόνο ελεύθερα» hides the emptied «ΚΥΚΛΟΙ …» header (free trucks keep theirs); «Όλα» brings it back', hidRt === true && shownFree === true && backRt === true, { hidRt, shownFree, backRt });
    ok(scn, '«ΣΥΝΕΡΓΑΤΗΣ · 2» and the partner line carries its capacity «→ 27/33 · δρομολόγιο συνεργάτη»', (await bText(page, `${D} [data-grp="partner"]`)) === 'ΣΥΝΕΡΓΑΤΗΣ · 2'
      && (await bText(page, `${D} [data-line="partner"]`)).includes('→ 27/33 · δρομολόγιο συνεργάτη'));
    ok(scn, 'over capacity is a warning, «Ένωση» stays enabled («→ 54/33 · υπέρβαση 21»)', txt.includes('→ 54/33 · υπέρβαση 21') && (await bOff(page, `${D} [data-act="save"][data-cand="rt:201"]`)) === false, txt.slice(0, 500));
    ok(scn, 'the rate field is there for the dispatcher (decision 41), «κόμιστρο λείπει» on the partner cycle', (await bHas(page, `${D} input[data-rate]`)) && txt.includes('κόμιστρο λείπει'));
    ok(scn, 'a cycle still on the road is listed dimmed, without a button («στο δρόμο»)', txt.includes('στο δρόμο') && !(await bHas(page, `${D} [data-cand="rt:203"]`)));
    await bClick(page, `${D} [data-act="save"][data-cand="rt:201"]`);
    const legs = bCalls(S, 'POST', '/plan/legs');
    ok(scn, '«Ένωση» → exactly one POST /plan/legs with group, target.rt_id and side KATHODOS', legs.length === 1
      && JSON.stringify(legs[0].body.group) === '{"order_id":2101}' && JSON.stringify(legs[0].body.target) === '{"rt_id":201,"side":"KATHODOS"}', legs.map((x) => x.raw));
    const stops = (legs[0] && legs[0].body.stops) || null;
    ok(scn, 'stops: the cycle\'s own by stop_id, a new place with its window; no seq, no request_id, no stop twice', legs.length === 1
      && JSON.stringify(stops) === JSON.stringify([{ ref: 's2001', stop_id: 2001 }, { ref: 's2002', stop_id: 2002 }, { ref: 's2003', stop_id: 2003 },
        { ref: 'n4', location_id: 4, side: 'KATHODOS', planned_from: '2026-10-13T09:00:00+03:00', planned_to: '2026-10-13T10:00:00+03:00' }])
      && !/"seq"|request_id/.test(legs[0].raw), stops);
    ok(scn, '409 writes_closed → preview strip with the Worker text, window open, saving locked (Ε-6)',
      (await bText(page, `${D} .wn5-strip[data-kind="preview"]`)).includes('rig sentinel writes_closed') && (await bOff(page, `${D} [data-act="save"][data-cand="rt:201"]`)) === true);
    await page.context().close();
  }
  { // B · busy, then 200 with a warning and a notice: same bytes twice, reload, strip, toast
    let n = 0;
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/legs': () => (++n === 1 ? planErr(409, 'PLAN_RULE', 'busy_retry')
      : OK_PUT({ warnings: [{ code: 'over_33', rt_id: 201, side: 'KATHODOS', pallets: 54 }], notice_ids: [9101] })) } });
    await bClick(page, B_QVS);
    await bClick(page, `${D} [data-act="save"][data-cand="rt:201"]`);
    ok(scn, 'busy_retry → busy strip with the Worker text, the button enabled again (the user presses)',
      (await bText(page, `${D} .wn5-strip[data-kind="busy"]`)).includes('rig sentinel busy_retry') && (await bOff(page, `${D} [data-act="save"][data-cand="rt:201"]`)) === false);
    const boards0 = bCalls(S, 'GET', '/plan/board').length;
    await bClick(page, `${D} [data-act="save"][data-cand="rt:201"]`);
    await page.waitForTimeout(400);
    const legs = bCalls(S, 'POST', '/plan/legs');
    ok(scn, 'two presses send the same bytes (the body is the window\'s state)', legs.length === 2 && legs[0].raw === legs[1].raw, legs.map((x) => x.raw));
    ok(scn, '200 → the window closes and the board is read again', !(await bHas(page, D)) && bCalls(S, 'GET', '/plan/board').length === boards0 + 1);
    ok(scn, 'warnings → «Υπέρβαση 21π στο TST-2106 — αποθηκεύτηκε» on the board strip (Δ12 tile 7)', (await bText(page, '#content .wn5-acthost .wn5-strip[data-kind="warning"]')).includes('Υπέρβαση 21π στο TST-2106 — αποθηκεύτηκε'));
    const ev = await bEv(page);
    ok(scn, 'notice_ids → the success says «ενημερώθηκε και ο υπεύθυνος διεθνών» (Ε-3)', ev.some((e) => e.startsWith('toast') && e.includes('ενημερώθηκε και ο υπεύθυνος διεθνών')), ev);
    await page.context().close();
  }
  { // C · new truck (the Veroia window is the user's, Ε-5), its refusal, a partner without a rate
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/legs': (e) => (e.body && e.body.target && e.body.target.new_rt && e.body.target.new_rt.trip_type === 'OWNED'
      ? planErr(422, 'PLAN_RULE', 'truck_busy') : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bClick(page, B_QVS);
    await bClick(page, `${D} [data-act="pick"][data-cand="truck:14"]`);
    // F12 (live 28/10): the window the shipment already has (14:00–17:00 at Veroia, the assignment's day) fills the field;
    // emptied, «Ανάθεση» locks again — the screen still invents no hour (Ε-5)
    const pre = await page.evaluate((d) => [...document.querySelectorAll(`${d} input[data-hub]`)].map((i) => i.value), D);
    await page.fill(`${D} input[data-hub="from"]`, '', { timeout: 2000 }).catch(() => {});
    await page.fill(`${D} input[data-hub="to"]`, '', { timeout: 2000 }).catch(() => {});
    ok(scn, 'a free truck: the Veroia window comes from the shipment (14:00 – 17:00, F12); emptied, «Ανάθεση» is disabled (no invented hour)',
      pre.join('|') === '14:00|17:00' && (await bOff(page, `${D} [data-act="save"][data-cand="truck:14"]`)) === true, pre);
    // quiet on a tree without the window (plain main): a missing field is the ✗ of the checks below, never a 30 s abort
    await page.fill(`${D} input[data-hub="from"]`, '16:00', { timeout: 2000 }).catch(() => {});
    await page.fill(`${D} input[data-hub="to"]`, '18:00', { timeout: 2000 }).catch(() => {});
    await bClick(page, `${D} [data-act="save"][data-cand="truck:14"]`);
    const p = bCalls(S, 'POST', '/plan/legs')[0];
    ok(scn, 'new truck → new_rt OWNED {truck 14, no trailer, no driver}, every stop new, Veroia with the typed hours', !!p
      && JSON.stringify(p.body.target) === '{"new_rt":{"trip_type":"OWNED","truck_id":14,"trailer_id":null,"driver_id":null},"side":"KATHODOS"}'
      && JSON.stringify(p.body.stops[0]) === '{"ref":"n1","location_id":1,"side":"KATHODOS","planned_from":"2026-10-12T16:00:00+03:00","planned_to":"2026-10-12T18:00:00+03:00"}'
      && p.body.stops.length === 4 && p.body.stops.every((s) => !('stop_id' in s)), p && p.raw);
    ok(scn, '422 truck_busy → refusal strip with the Worker text, the window stays', (await bText(page, `${D} .wn5-strip[data-kind="refusal"]`)).includes('rig sentinel truck_busy') && await bHas(page, D));
    await bPick(page, `${D} select[data-partner]`, '52');
    await bClick(page, `${D} [data-act="save"][data-cand="partner"]`);
    const q = bCalls(S, 'POST', '/plan/legs')[1];
    ok(scn, 'partner with an empty rate → new_rt PARTNER partner_rate:null («κόμιστρο λείπει», S-44)', !!q && JSON.stringify(q.body.target.new_rt) === '{"trip_type":"PARTNER","partner_id":52,"partner_rate":null}', q && q.raw);
    await page.context().close();
  }
  { // D · warehouse: the red box and ✈ open the same window; ✈ changes the vehicle with PATCH /plan/rt
    const { page, S } = await bOpen(browser, origin, { role: 'warehouse' });
    ok(scn, 'the red «ΠΡΟΣ ΑΝΑΘΕΣΗ» box of a waiting order opens the same window', (await bClick(page, '.wn5-row[data-piece] [data-act="assign"]')) && await bHas(page, D));
    await shot(page, 'assign-national');
    const tD = await bText(page, `${D} .wi4-dlg-t`), xD = await bText(page, D);
    ok(scn, 'a one-delivery national: «Ανάθεση · N-T201 → ATHENS TEST», no «Όλο το … μαζί» band (nothing to split)', tD === 'Ανάθεση · N-T201 → ATHENS TEST' && !xD.includes('Όλο το'), { tD });
    await bClick(page, `${D} [data-act="cancel"]`);
    // fidelity run 2 r1 (Figma 2011:9152/9153/9161): ✈ head line 1 SemiBold 600 12px navy, line 2 11px; items 12.5px Regular
    const mst = (await bClick(page, '.wn5-row[data-rt="201"] .wi4-plane')) && await page.evaluate(() => {
      const m = document.getElementById('wn5-menu'); if (!m) return null;
      const f = (e) => e && [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight, getComputedStyle(e).color].join('|');
      return { l1: f(m.querySelector('.wn5-m-hd > .wi4-l1')), l2: f(m.querySelector('.wn5-m-hd > .wi4-l2')), item: f(m.querySelector('.wn5-m-i[data-item="assign"] > .wi4-l1')) };
    }).catch(() => null);
    await page.keyboard.press('Escape');
    ok(scn, 'fidelity run2: ✈ head 600 12px navy / 11px grey-2; item label 12.5px Regular navy', !!mst && mst.l1 === '12px|600|rgb(11, 25, 41)'
      && mst.l2 === '11px|400|rgb(91, 107, 127)' && mst.item === '12.5px|400|rgb(11, 25, 41)', mst);
    ok(scn, 'warehouse: ✈ «Ανάθεση / αλλαγή φορτηγού ή συνεργάτη» opens it too (no role gate)', (await bMenu(page, 201, 'assign')) && await bHas(page, D));
    await bClick(page, `${D} [data-act="pick"][data-cand="truck:14"]`);
    await bClick(page, `${D} [data-act="save"][data-cand="truck:14"]`);
    const p = bCalls(S, 'PATCH', '/plan/rt/201');
    ok(scn, 'vehicle change → one PATCH /plan/rt/201 {set:{trip_type:OWNED, truck_id:14}}, no key it would empty', p.length === 1 && p[0].raw === '{"set":{"trip_type":"OWNED","truck_id":14}}', p.map((x) => x.raw));
    await page.context().close();
  }
  { // E · /plan/lookups not deployed (Ε-2): said, catalogue acts off, «Ένωση» still on
    const { page } = await bOpen(browser, origin, { plan: { 'GET /plan/lookups': () => planErr(404, 'NOT_FOUND', 'no_route') } });
    await bClick(page, B_QVS);
    const txt = await bText(page, D);
    ok(scn, 'lookups 404 → «Οι κατάλογοι δεν είναι διαθέσιμοι ακόμη», new truck/partner off, «Ένωση» on', txt.includes('Οι κατάλογοι δεν είναι διαθέσιμοι ακόμη')
      && (await bOff(page, `${D} [data-act="pick"][data-cand="truck:14"]`)) !== false && (await bOff(page, `${D} [data-act="save"][data-cand="partner"]`)) === true
      && (await bOff(page, `${D} [data-act="save"][data-cand="rt:201"]`)) === false, txt.slice(0, 300));
    await shot(page, 'assign-nolookups');
    const fh = await bText(page, `${D} [data-grp="free"]`);
    ok(scn, 'lookups 404 → «ΕΛΕΥΘΕΡΑ ΦΟΡΤΗΓΑ · νέος κύκλος» with no count (unknown, never 0)', fh === 'ΕΛΕΥΘΕΡΑ ΦΟΡΤΗΓΑ · νέος κύκλος' && (await bText(page, `${D} [data-grp="partner"]`)) === 'ΣΥΝΕΡΓΑΤΗΣ', fh);
    await page.context().close();
  }
}
SCN['assign'] = scnAssign;

// T13 — «+» on a side (Figma 2011:10022): from waiting, whole loads, «πόσες» only for Veroia stock, no truck choice.
async function scnPlus(browser, origin) {
  const scn = 'plus';
  const D = bDlg('plus');
  const K201 = '.wn5-row[data-rt="201"] [data-act="plus"][data-side="KATHODOS"]';
  { // A · KATHODOS of RT-T201: the groups, the line texts, the body of a whole VS piece (writes closed)
    const { page, S } = await bOpen(browser, origin);
    // whole-frame r3 (2011:10089 / 2120:8167): on the row's hover the «+» is the info fill with a 1px #027bbd border
    // and the 11px icon/plus — never the #bae6fd border and a text «+»
    await page.hover('.wn5-row[data-rt="201"] .wn5-kd', { timeout: 3000 }).catch(() => {});
    const hv = await page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return null; const cs = getComputedStyle(b); const sv = b.querySelector('svg');
      const r = sv && sv.getBoundingClientRect();
      return { op: cs.opacity, bc: cs.borderTopColor, bw: cs.borderTopWidth, bg: cs.backgroundColor, svg: r ? [Math.round(r.width), Math.round(r.height)] : null, text: b.textContent.trim(), ink: sv ? getComputedStyle(sv).color : null }; }, K201);
    ok(scn, 'row hover: the «+» bg #f0f9ff, border 1px #027bbd, the 11px plus icon in #0369a1, no text glyph', !!hv && hv.op === '1' && hv.bc === 'rgb(2, 123, 189)' && hv.bw === '1px'
      && hv.bg === 'rgb(240, 249, 255)' && !!hv.svg && hv.svg.join('×') === '11×11' && hv.text === '' && hv.ink === 'rgb(3, 105, 161)', hv);
    ok(scn, 'the «+» of a KATHODOS opens .wi4-dlg[data-wn5=plus] as a popover', (await bClick(page, K201)) && await bHas(page, `.wn5-pop-back ${D}`));
    const txt = await bText(page, D);
    ok(scn, 'header «Πρόσθεσε στην ΚΑΘΟΔΟ» · TST-2106 · Δευ 12/10 · φόρτωση 16:00–18:00 · 27/33', txt.includes('Πρόσθεσε στην ΚΑΘΟΔΟ') && txt.includes('TST-2106 · Δευ 12/10 · φόρτωση 16:00–18:00 · 27/33'), txt.slice(0, 300));
    ok(scn, 'segmented «Νέα παραγγελία | Από αναμονή», «Από αναμονή» on', (await bText(page, `${D} .wn5-seg button.on`)) === 'Από αναμονή' && txt.includes('Νέα παραγγελία'));
    ok(scn, 'groups per VS, ΕΘΝ, «ΑΠΟΘΕΜΑ ΒΕΡΟΙΑΣ», «ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ»', txt.includes('VS-T118 · ΠΕΛΑΤΗΣ Β') && txt.includes('VS-T125 · ΠΕΛΑΤΗΣ Η')
      && txt.includes('ΕΘΝ · ΠΕΛΑΤΗΣ ΣΤ') && txt.includes('ΑΠΟΘΕΜΑ ΒΕΡΟΙΑΣ') && txt.includes('ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ'), txt.slice(0, 800));
    const l4101 = await bText(page, `${D} .wn5-pline[data-piece="4101"]`);
    ok(scn, 'a line says «→ 36/33 · υπέρβαση 3» and «μπαίνει kη»', l4101.includes('→ 36/33 · υπέρβαση 3') && /μπαίνει \d+η/.test(l4101), l4101);
    ok(scn, '«πόσες» only on stock lines (2), never on an arriving load', (await page.$$(`${D} [data-take]`)).length === 2 && !(await bHas(page, `${D} .wn5-pline[data-piece="4101"] [data-take]`)));
    ok(scn, 'ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ in the KATHODOS «+» have no «Πρόσθεσε»', (await bHas(page, `${D} .wn5-pline[data-piece="4202"]`)) && !(await bHas(page, `${D} .wn5-pline[data-piece="4202"] [data-act="save"]`)));
    ok(scn, 'no truck to choose (S-68): no select, no candidate in the popover', !(await bHas(page, `${D} select`)) && !(await bHas(page, `${D} [data-cand]`)));
    await bClick(page, `${D} .wn5-pline[data-piece="4101"] [data-act="save"]`);
    const p = bCalls(S, 'POST', '/plan/legs');
    ok(scn, '«Πρόσθεσε» → one POST /plan/legs {pieces:[{piece_id:4101}]} onto RT-T201 KATHODOS, no take_pallets', p.length === 1
      && p[0].raw === '{"pieces":[{"piece_id":4101}],"target":{"rt_id":201,"side":"KATHODOS"},"stops":[{"ref":"s2001","stop_id":2001},{"ref":"s2002","stop_id":2002}]}', p.map((x) => x.raw));
    ok(scn, '409 writes_closed → the preview strip in the popover', (await bText(page, `${D} .wn5-strip[data-kind="preview"]`)).includes('rig sentinel writes_closed'));
    await page.context().close();
  }
  { // B · stock: «πόσες» goes as take_pallets, an impossible number disables, not_stock is the Worker's words
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/legs': () => planErr(422, 'PLAN_RULE', 'not_stock') } });
    await bClick(page, K201);
    await page.fill(`${D} [data-take="4301"]`, '20', { timeout: 2000 }).catch(() => {});
    ok(scn, '«πόσες» above the stock (20 of 13) → «Πρόσθεσε» disabled', (await bOff(page, `${D} .wn5-pline[data-piece="4301"] [data-act="save"]`)) === true);
    await page.fill(`${D} [data-take="4301"]`, '4', { timeout: 2000 }).catch(() => {});
    await bClick(page, `${D} .wn5-pline[data-piece="4301"] [data-act="save"]`);
    const p = bCalls(S, 'POST', '/plan/legs')[0];
    ok(scn, 'stock → take_pallets 4, the Veroia stop by id, the delivery as a new stop with its window', !!p
      && p.raw === '{"pieces":[{"piece_id":4301,"take_pallets":4}],"target":{"rt_id":201,"side":"KATHODOS"},"stops":[{"ref":"s2001","stop_id":2001},{"ref":"n4","location_id":4,"side":"KATHODOS","planned_from":"2026-10-13T08:00:00+03:00","planned_to":"2026-10-13T10:00:00+03:00"}]}', p && p.raw);
    ok(scn, '422 not_stock → refusal strip with the Worker text, the popover stays', (await bText(page, `${D} .wn5-strip[data-kind="refusal"]`)).includes('rig sentinel not_stock') && await bHas(page, D));
    await page.fill(`${D} [data-q]`, 'ΠΕΛΑΤΗΣ ΣΤ', { timeout: 2000 }).catch(() => {});
    const vis = await page.$$eval(`${D} .wn5-pline`, (ls) => ls.filter((l) => !l.hidden).map((l) => l.dataset.piece)).catch(() => []);
    ok(scn, 'search with fhSearchNorm: «ΠΕΛΑΤΗΣ ΣΤ» leaves the one line of that client', vis.length === 1 && vis[0] === '4201', vis);
    await page.context().close();
  }
  { // C · ANODOS of RT-T204: the requests, both stops of the side by id
    const { page, S } = await bOpen(browser, origin);
    await bClick(page, '.wn5-row[data-rt="204"] [data-act="plus"][data-side="ANODOS"]');
    const txt = await bText(page, D);
    ok(scn, 'the ANODOS «+» says «Πρόσθεσε στην ΑΝΟΔΟ» and offers «ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ»', txt.includes('Πρόσθεσε στην ΑΝΟΔΟ') && (await bHas(page, `${D} .wn5-pline[data-piece="4202"] [data-act="save"]`)), txt.slice(0, 400));
    // fidelity T20 (Figma 2011:10488): ΠΡΟΡΥΘΜΙΣΗ is one line from the 24px inset — label 500 12px ink, sub 10.5px grey-2
    // on the same line, «Άνοιγμα» at the right end; no hint band on ΑΝΟΔΟΣ (2011:10446 has none)
    const pr = await page.$eval(D, (d) => {
      const r = d.querySelector('[data-line="preset"]'); if (!r) return null;
      const b = r.querySelector('b'), s = r.querySelector('b + span'), btn = r.querySelector('[data-act="preset"]'), cs = (e) => getComputedStyle(e), q = (e) => e.getBoundingClientRect();
      return { bx: Math.round(q(b).left - q(r).left), b: [cs(b).fontSize, cs(b).fontWeight, cs(b).color].join('|'), s: [cs(s).fontSize, cs(s).color].join('|'),
        line: Math.abs(q(b).top - q(s).top) < 6 && q(s).left > q(b).right, end: Math.round(q(r).right - q(btn).right), hint: !!d.querySelector('.wn5-phint') };
    }).catch(() => null);
    ok(scn, 'ANODOS ΠΡΟΡΥΘΜΙΣΗ: one line at x 24, label 12px 500 ink, sub 10.5px grey-2, «Άνοιγμα» 12px from the end, no hint band', !!pr
      && pr.bx === 24 && pr.b === '12px|500|rgb(11, 25, 41)' && pr.s === '10.5px|rgb(91, 107, 127)' && pr.line && pr.end === 12 && !pr.hint, pr);
    await bClick(page, `${D} .wn5-pline[data-piece="4202"] [data-act="save"]`);
    const p = bCalls(S, 'POST', '/plan/legs')[0];
    ok(scn, 'request → pieces 4202 onto RT-T204 ANODOS, pickup and Veroia arrival by stop_id', !!p
      && p.raw === '{"pieces":[{"piece_id":4202}],"target":{"rt_id":204,"side":"ANODOS"},"stops":[{"ref":"s2035","stop_id":2035},{"ref":"s2036","stop_id":2036}]}', p && p.raw);
    await page.context().close();
  }
  { // D · «Νέα παραγγελία»: the short form (T20) when it exists, else a line that says it is not there yet
    const { page } = await bOpen(browser, origin);
    await bClick(page, K201);
    await bClick(page, `${D} .wn5-seg button[data-v="new"]`);
    // T20: the form opens async (places, catalogues, a fresh board). This stub serves no facade masters, so the form's
    // own refusal «Οι τοποθεσίες δεν φορτώθηκαν» (orders_natl.js:806-822 rule) is its answer here; the open form with
    // its body is proven by tests/critics/wn5-form-rig.js «order» (the kit serves places).
    const handed = await until(page, (dlg) => !!document.querySelector(dlg)
      || (window.__ev || []).some((e) => e.k === 'toast' && /τοποθεσίες δεν φορτώθηκαν/.test(String(e.a[0]))), bDlg('order'));
    const line = (await bText(page, D)).includes('Η σύντομη φόρμα ανοίγει με τη φόρμα εθνικής v5');
    ok(scn, '«Νέα παραγγελία» opens the order form (T20) or says it is not there yet — never a dead button', handed || line, await bEv(page));
    await page.context().close();
  }
  { // E · fidelity r2 at 1440×900 (Figma 2011:10305 / 10319 / 10445): opens under its row, whole placeholder, band copy
    const { page } = await bOpen(browser, origin, { viewport: { width: 1440, height: 900 } });
    // fidelity r3 (Figma 2011:10140/10217/10299): every «+» of a side at one x, inside its row, count or no count
    const px = await page.evaluate(() => ['KATHODOS', 'ANODOS'].map((side) => [...document.querySelectorAll(`.wn5-row [data-act="plus"][data-side="${side}"]`)].map((b) => {
      const r = b.getBoundingClientRect(), row = b.closest('.wn5-row').getBoundingClientRect();
      return { rt: b.closest('.wn5-row').dataset.rt, x: Math.round(r.left), inRow: r.right <= row.right - 4 };
    }))).catch(() => null);
    ok(scn, 'board: every «+» of a side at one x (gap and partner sides too), never past the row edge', !!px && px.every((l) => l.length >= 3
      && l.every((e) => e.x === l[0].x && e.inRow)) && px[1].some((e) => e.rt === '201') && px[1].some((e) => e.rt === '203'), px);
    await bClick(page, K201);
    await shot(page, 'plus-kathodos-1440');
    const st = await page.evaluate((dSel) => {
      const d = document.querySelector(dSel); if (!d) return null;
      const cs = (e) => e && getComputedStyle(e), band = d.querySelector('.wn5-pnote'), take = d.querySelector('[data-take]'), leave = d.querySelector('.wn5-leave');
      return { band: band && [Math.round(band.getBoundingClientRect().height), cs(band).fontSize, cs(band).paddingTop, cs(band).borderTopStyle].join('|'),
        leave: leave && cs(leave).fontWeight, take: take && [cs(take).borderTopWidth, cs(take).color, Math.round(take.getBoundingClientRect().width)].join('|'),
        caps: [...d.querySelectorAll('.wn5-cap')].map((c) => Math.round(c.getBoundingClientRect().height)),
        // Chrome floors a border to whole device pixels: the 1.5px edge computes 1px at DPR 1 (this rig), 1.5px on Retina
        edge: devicePixelRatio >= 2 ? '1.5px' : '1px' };
    }, D).catch(() => null);
    ok(scn, 'popover r3: band 30px · 11px · no padding/rule; leave-by 600; «πόσες» 1.5px edge, ink value, 23 wide; chips 20px', !!st
      && st.band === '30|11px|0px|none' && st.leave === '600' && st.take === `${st.edge}|rgb(11, 25, 41)|23` && st.caps.length > 0 && st.caps.every((h) => h === 20), st);
    const g = await page.evaluate(([dSel, kSel]) => {
      const d = document.querySelector(dSel), row = document.querySelector(kSel) && document.querySelector(kSel).closest('.wn5-row');
      const q = d && d.querySelector('[data-q]');
      if (!d || !row || !q) return null;
      const dr = d.getBoundingClientRect(), rr = row.getBoundingClientRect(), hd = d.querySelector('.wi4-dlg-hd').getBoundingClientRect();
      const cs = getComputedStyle(q);
      return { top: dr.top, bottom: dr.bottom, rowBottom: rr.bottom, scrolls: d.scrollHeight > d.clientHeight, hdTop: hd.top, vh: innerHeight,
        room: q.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        band: (d.querySelector('.wn5-pnote') || {}).textContent || '' };
    }, [D, K201]).catch(() => null);
    ok(scn, 'the tall KATHODOS popover opens under RT-T201 (never over the row), inside the window, its body scrolls', !!g
      && g.top >= g.rowBottom && g.top <= g.rowBottom + 8 && g.bottom <= g.vh && g.scrolls, g);
    await page.$eval(D, (d) => { d.scrollTop = 200; }).catch(() => {});
    const hdTop = await page.$eval(`${D} .wi4-dlg-hd`, (h) => h.getBoundingClientRect().top).catch(() => null);
    ok(scn, 'scrolled, the header (title · segmented) stays at the top of the popover', !!g && hdTop != null && Math.abs(hdTop - g.top) <= 2, { hdTop, top: g && g.top });
    // The «×» of an empty type=search lives in Chrome's closed UA shadow (getComputedStyle cannot see it): the proof
    // is the pixels — the empty field drawn as is, then with the «×» room forced back; same pixels = room still kept.
    const qSel = `${D} [data-q]`;
    await page.$eval(D, (d) => { d.scrollTop = 0; }).catch(() => {});
    const free = await page.locator(qSel).screenshot().catch(() => null);
    await page.addStyleTag({ content: '.wn5-dlg .wn5-dq::-webkit-search-cancel-button { display:block !important; }' }).catch(() => {});
    const kept = await page.locator(qSel).screenshot().catch(() => null);
    ok(scn, 'the search field leaves the 266px of the Figma placeholder (no hidden «×» room while empty)', !!g && g.room >= 266
      && !!free && !!kept && !free.equals(kept), g && { room: g.room, pixelsDiffer: !!free && !!kept && !free.equals(kept) });
    ok(scn, 'the closing band carries «(owner 21/10)» and «(π.χ. VS-T118)», the first arriving VS of the list', !!g
      && g.band.includes('στη Βέροια (owner 21/10):') && g.band.includes('Φορτίο που φτάνει (π.χ. VS-T118) μπαίνει ολόκληρο'), g && g.band);
    // fidelity T20 (Figma 2011:10315/10316): under the ΚΑΘΟΔΟΣ header, the 30px grey hint of what the short form pre-fills
    const hint = await page.$eval(D, (d) => { const h = d.querySelector('.wn5-phint'), hd = d.querySelector('.wi4-dlg-hd'); if (!h) return null;
      const cs = getComputedStyle(h);
      return { t: h.textContent, h: Math.round(h.getBoundingClientRect().height), under: Math.round(h.getBoundingClientRect().top - hd.getBoundingClientRect().bottom),
        st: [cs.fontSize, cs.color, cs.backgroundColor].join('|') }; }).catch(() => null);
    ok(scn, 'KATHODOS hint band: «… με Δευ 12/10, ΚΑΘΟΔΟ και TST-2106 έτοιμα· Τιμή € (χωρίς ΦΠΑ) υποχρεωτική.», 30px, 11px grey-2 on chip grey, under the header', !!hint
      && hint.t === '«Νέα παραγγελία» ανοίγει τη σύντομη φόρμα με Δευ 12/10, ΚΑΘΟΔΟ και TST-2106 έτοιμα· Τιμή € (χωρίς ΦΠΑ) υποχρεωτική.'
      && hint.h === 30 && hint.under === 0 && hint.st === '11px|rgb(91, 107, 127)|rgb(241, 245, 249)', hint);
    // fidelity T13 r4 (Figma 2011:10310-10314): the segmented at the base 12.5px (236px control at 1440 with DM Sans)
    const seg = await page.$eval(`${D} .wn5-seg button`, (b) => getComputedStyle(b).fontSize).catch(() => null);
    ok(scn, 'popover r4: the segmented buttons are 12.5px, as the base rule (Figma 2011:10310)', seg === '12.5px', seg);
    // fidelity T13 r4 (2011:10435-10443): the read-only request greys place, window and «για την ΑΝΟΔΟ» (grey-3), not the line
    const ro = await page.$eval(`${D} .wn5-pline.wn5-na`, (l) => {
      const c = (e) => e && getComputedStyle(e).color;
      return { op: getComputedStyle(l).opacity, place: c(l.querySelector('.wn5-pl-who b')), when: c(l.querySelector('.wn5-pl-when b')),
        city: c(l.querySelector('[data-city]')), ro: c(l.querySelector('.wn5-pl-ro')) };
    }).catch(() => null);
    ok(scn, 'popover r4: read-only line opacity 1, place/window/«για την ΑΝΟΔΟ» grey-3, city grey-2', !!ro && ro.op === '1'
      && ro.place === 'rgb(152, 162, 179)' && ro.when === ro.place && ro.ro === ro.place && ro.city === 'rgb(91, 107, 127)', ro);
    // fidelity T13 r4 (2011:10373/10390): a group shows its count only from two lines up
    const heads = await page.$$eval(`${D} .wn5-grp-h`, (hs) => hs.map((h) => h.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    const hd = (p) => heads.find((h) => h.startsWith(p)) || '';
    ok(scn, 'popover r4: count only from 2 lines (VS-T118 · 3, stock · 2; VS-T125, ΕΘΝ and the one request without «· 1»)',
      / · 3 · 27π$/.test(hd('VS-T118')) && / · 2 · 17π$/.test(hd('ΑΠΟΘΕΜΑ')) && !/ · 1 · /.test(hd('VS-T125')) && hd('ΕΘΝ · ΠΕΛΑΤΗΣ ΣΤ').endsWith('ΠΕΛΑΤΗΣ ΣΤ · 6π')
      && !/ · 1 · /.test(hd('ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ')) && hd('ΑΙΤΗΜΑΤΑ ΑΝΟΔΟΥ').includes('μόνο από'), heads);
    ok(scn, 'popover r4: a VS that is not overdue has no «αργό VS» chip; a national picked up at its own place has no «φτάνει»',
      !(await bHas(page, `${D} .wn5-grp-c`)) && !hd('ΕΘΝ').includes('φτάνει'), heads);
    await page.context().close();
  }
  { // F · fidelity T13 r4: an overdue VS → grey «αργό VS» chip in its head (the base's flag, no time — Ε-35); a national
    // whose pickup is Veroia → «· φτάνει hh:mm» (its load_from is then its time at Veroia, as a VS's)
    const board = bBoard();
    const h4401 = board.hub.find((h) => h.piece_id === 4401);
    Object.assign(h4401, { overdue: true, nat_due_day: '2026-10-12' });   // 071 v_piece_state: nat_due_day < today
    Object.assign(board.waiting.find((w) => w.piece_id === 4201), { position_location_id: 1, nat_from_location_id: 1 });
    const { page } = await bOpen(browser, origin, { board, viewport: { width: 1440, height: 900 } });
    await bClick(page, K201);
    await shot(page, 'plus-kathodos-overdue-1440');
    const heads = await page.$$eval(`${D} .wn5-grp-h`, (hs) => hs.map((h) => h.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    const chip = await page.$eval(`${D} .wn5-grp-c`, (c) => ({ t: c.textContent, bg: getComputedStyle(c).backgroundColor, head: c.closest('.wn5-grp-h').innerText }))
      .catch(() => null);
    ok(scn, 'overdue VS-T125: the «αργό VS» chip (chip grey) between its head and «· φτάνει 14:00 · 33π», only there', !!chip && chip.t === 'αργό VS'
      && chip.bg === 'rgb(241, 245, 249)' && /^VS-T125 · ΠΕΛΑΤΗΣ Η\s*αργό VS\s*· φτάνει 14:00 · 33π$/.test(chip.head.replace(/\s+/g, ' ').trim())
      && (await page.$$(`${D} .wn5-grp-c`)).length === 1, { chip, heads });
    ok(scn, 'a national picked up at Veroia: «ΕΘΝ · ΠΕΛΑΤΗΣ ΣΤ · φτάνει 11:00 · 6π»', heads.includes('ΕΘΝ · ΠΕΛΑΤΗΣ ΣΤ · φτάνει 11:00 · 6π'), heads);
    await page.context().close();
  }
  { // G · fidelity T13 r4, board at 1440: ΦΟΡΤΩΣΗ of RT-T204 «THESSALONIKI TEST» wraps at a word boundary, never mid-word
    const { page } = await bOpen(browser, origin, { viewport: { width: 1440, height: 900 } });
    const w = await page.evaluate(() => {
      const cell = document.querySelector('.wn5-row[data-rt="204"] .wn5-fl');
      if (!cell) return null;
      const out = [];
      for (const l1 of cell.querySelectorAll('.wi4-l1')) {
        const tw = document.createTreeWalker(l1, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          for (const m of n.data.matchAll(/\S+/g)) {
            const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
            const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
            out.push({ word: m[0], lines: lines.size });
          }
        }
      }
      const c = cell.getBoundingClientRect();
      const spill = [...cell.querySelectorAll('.wn5-pt')].some((p) => p.getBoundingClientRect().right > c.right + 0.5);
      // the stop number sits on the line of the place's first word (T14 fidelity r2: «1» stood alone on its own line)
      const n = cell.querySelector('.wi4-pt-n'), l1 = n && n.nextElementSibling;
      let numLine = null;
      if (l1) {
        const tn = [...l1.childNodes].find((x) => x.nodeType === 3 && x.data.trim());
        const m = tn && /\S+/.exec(tn.data);
        if (m) { const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length); numLine = Math.abs(r.getClientRects()[0].top - n.getBoundingClientRect().top) < 4; }
      }
      return { words: out, spill, numLine };
    }).catch(() => null);
    ok(scn, 'board 1440: RT-T204 ΦΟΡΤΩΣΗ «THESSALONIKI TEST» — no word on two lines, nothing past the cell', !!w && w.words.some((x) => x.word === 'THESSALONIKI')
      && w.words.every((x) => x.lines === 1) && !w.spill, w);
    ok(scn, 'board 1440: RT-T204 ΦΟΡΤΩΣΗ — the stop number «1» on the line of «THESSALONIKI», not alone above it', !!w && w.numLine === true, w);
    await page.context().close();
  }
}
SCN['plus'] = scnPlus;

// T14 — «Μεταφορά σε…» (Δ6): the Δ1 list, then the two steps of S-82 (dry run → list → the same body + token).
async function scnMove(browser, origin) {
  const scn = 'move';
  const D = bDlg('move');
  const RTC = { kind: 'rt_cancelled', rt_id: 201, code: 'RT-T201' };
  const PAY = { kind: 'payroll_amount', rt_id: 201, dl_entry_id: 7, driver_id: 32, month: '2026-10' };
  const dry = (tok, cons) => [200, { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: cons.length > 0, confirm_token: tok, consequences: cons }];
  const BODY = { from: { piece_ids: [5101], rt_id: 201 }, target: { rt_id: 204, side: 'KATHODOS' },
    stops: [{ ref: 's2031', stop_id: 2031 }, { ref: 'n2', location_id: 2, side: 'KATHODOS', planned_from: '2026-10-13T06:00:00+03:00', planned_to: '2026-10-13T08:00:00+03:00' }] };
  const strip = (b) => { const o = Object.assign({}, b); delete o.dry_run; delete o.confirm_token; return JSON.stringify(o); };
  // the leg form (T21) is not there yet: the rig calls the entry point the form will call (no return value: a dialog is not serialisable)
  const openMove = (page) => page.evaluate(() => { WN5Act.move({ piece_ids: [5101], rt_id: 201 }, {}); }).then(() => page.waitForTimeout(300), () => {});
  { // A · the list, the dry run, the consequence list without amounts, the execution with the token (closed)
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/move': (e) => (e.body && e.body.dry_run === true ? dry('tokM1', [RTC, PAY]) : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await openMove(page);
    const txt = await bText(page, D);
    ok(scn, '«Μεταφορά σε…» = the Δ1 list: the day\'s cycles without the source, free trucks, partner, «Πίσω στη Βέροια» (Figma 9294)',
      /ΚΥΚΛΟΙ ΤΗΣ ΔΕΥΤΕΡΑΣ 12\/10/.test(txt) && txt.includes('ΕΛΕΥΘΕΡΑ ΦΟΡΤΗΓΑ') && txt.includes('ΣΥΝΕΡΓΑΤΗΣ') && txt.includes('Πίσω στη Βέροια')
      && !(await bHas(page, `${D} [data-cand="rt:201"]`)), txt.slice(0, 500));
    await bClick(page, `${D} [data-act="save"][data-cand="rt:204"]`);
    const c = bCalls(S, 'POST', '/plan/move');
    ok(scn, 'the dry run: {from, target RT-T204 KATHODOS, stops from the source\'s places} + dry_run:true', c.length === 1 && c[0].body.dry_run === true && strip(c[0].body) === JSON.stringify(BODY), c.map((x) => x.raw));
    // T11 draws two lists (Δ5: «Παραστατικά που υπάρχουν» = payroll, «Τι θα γίνει» = the cancelled cycle): read both
    const list = await page.$$eval(`${D} .wn5-cons`, (els) => els.map((e) => e.innerText).join('\n')).catch(() => '');
    ok(scn, 'the list says «το δρομολόγιο RT-T201 θα σβηστεί» and «γραμμή μισθοδοσίας με ποσό (Οκτώβριος)», no amount for the dispatcher',
      list.includes('το δρομολόγιο RT-T201 θα σβηστεί') && list.includes('γραμμή μισθοδοσίας με ποσό (Οκτώβριος)') && !(await bText(page, D)).includes('€'), list);
    await bClick(page, `${D} [data-act="confirm"]`);
    const c2 = bCalls(S, 'POST', '/plan/move');
    ok(scn, '«Μεταφορά» sends the same body + confirm_token, without dry_run', c2.length === 2 && !('dry_run' in c2[1].body) && c2[1].body.confirm_token === 'tokM1' && strip(c2[1].body) === strip(c2[0].body), c2.map((x) => x.raw));
    ok(scn, '409 writes_closed at execution → the preview strip in the list (the dry run went through)', (await bText(page, `${D} .wn5-strip[data-kind="preview"]`)).includes('rig sentinel writes_closed'));
    await page.context().close();
  }
  { // B · stale_confirm → a new dry run, a new list, the new token; then 200 → board re-read
    let n = 0;
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/move': (e) => {
      if (e.body && e.body.dry_run === true) return ++n === 1 ? dry('tokM1', [RTC]) : dry('tokM2', [RTC, { kind: 'executed_leg', leg_id: 6001, rt_id: 201, stop_day: '2026-10-12' }]);
      return e.body.confirm_token === 'tokM1' ? planErr(422, 'PLAN_RULE', 'stale_confirm') : [200, { ok: true, op: 'plan_move_pieces', dry_run: false, ids: { rt_id: 204 }, warnings: [], notice_ids: [] }];
    } } });
    await openMove(page);
    await bClick(page, `${D} [data-act="save"][data-cand="rt:204"]`);
    await bClick(page, `${D} [data-act="confirm"]`);
    await page.waitForTimeout(300);
    const newList = await bText(page, `${D} .wn5-cons`);
    const boards0 = bCalls(S, 'GET', '/plan/board').length;
    await bClick(page, `${D} [data-act="confirm"]`);
    await page.waitForTimeout(400);
    const c = bCalls(S, 'POST', '/plan/move');
    ok(scn, 'stale_confirm → a new dry run and the NEW list («διόρθωση: … έχει ήδη γίνει»), sent with the new token',
      c.length === 4 && c[2].body.dry_run === true && c[3].body.confirm_token === 'tokM2' && newList.includes('διόρθωση: η παράδοση της 12/10 έχει ήδη γίνει'), c.map((x) => x.raw));
    ok(scn, '200 → the list closes and the board is read again', !(await bHas(page, D)) && bCalls(S, 'GET', '/plan/board').length === boards0 + 1);
    await page.context().close();
  }
  { // C · piece_split comes before any list: a refusal strip, no token, no list
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/move': () => planErr(422, 'PLAN_RULE', 'piece_split') } });
    await openMove(page);
    await bClick(page, `${D} [data-act="save"][data-cand="rt:204"]`);
    ok(scn, 'piece_split → refusal strip in the «Μεταφορά σε…» window, no confirmation list', (await bText(page, `${D} .wn5-strip[data-kind="refusal"]`)).includes('rig sentinel piece_split')
      && !(await bHas(page, `${D} .wn5-cons`)) && bCalls(S, 'POST', '/plan/move').length === 1);
    await page.context().close();
  }
  { // D · owner: the amounts the DB left in the list are shown
    const { page } = await bOpen(browser, origin, { role: 'owner', plan: { 'POST /plan/move': (e) => (e.body && e.body.dry_run === true
      ? dry('tokO', [RTC, Object.assign({ amount: 120, advance: null, expenses: null }, PAY)]) : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await openMove(page);
    await bClick(page, `${D} [data-act="save"][data-cand="rt:204"]`);
    ok(scn, 'owner: the amount that came in the list is shown («ποσό 120,00 €»)', (await bText(page, `${D} .wn5-cons`)).includes('ποσό 120,00 €'));
    await page.context().close();
  }
  { // E · ✈ «Σπάσιμο παραγγελιών → Βέροια»: the whole KATHODOS back to Veroia; an empty list runs at once
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/move': (e) => (e.body && e.body.dry_run === true ? dry('tokE', []) : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bMenu(page, 201, 'split-hub');
    await page.waitForTimeout(300);
    const c = bCalls(S, 'POST', '/plan/move');
    ok(scn, '✈ «Σπάσιμο παραγγελιών → Βέροια» → dry run {from:{rt_id:201, side:KATHODOS}, target:{wait:true}}, no stops', c.length >= 1 && c[0].body.dry_run === true
      && strip(c[0].body) === '{"from":{"rt_id":201,"side":"KATHODOS"},"target":{"wait":true}}', c.map((x) => x.raw));
    ok(scn, 'an empty list runs at once (no dialog); writes closed → the preview strip on the board', c.length === 2 && !(await bHas(page, D))
      && (await bText(page, '#content .wn5-acthost .wn5-strip[data-kind="preview"]')).includes('rig sentinel writes_closed'));
    await page.context().close();
  }
  { // F · ✈ «Σπάσιμο» where the ΚΑΘΟΔΟΣ also loads at Thessaloniki (RT-T204): a visible refusal, nothing sent;
    //     and on RT-T201 a saved move says where the re-read board shows the pieces (072: no for_split → ΠΡΟΣ ΑΝΑΘΕΣΗ)
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/move': (e) => (e.body && e.body.dry_run === true ? dry('tokF', [])
      : [200, { ok: true, op: 'plan_move_pieces', dry_run: false, ids: { rt_id: 201 }, warnings: [], notice_ids: [] }]) } });
    await bMenu(page, 204, 'split-hub');
    await page.waitForTimeout(300);
    ok(scn, '✈ «Σπάσιμο» on a ΚΑΘΟΔΟΣ not all loading at Veroia (RT-T204) → a client strip on the board, no POST /plan/move',
      bCalls(S, 'POST', '/plan/move').length === 0 && (await bText(page, '#content .wn5-acthost .wn5-strip[data-kind="client"]')).includes('φορτώνουν στη Βέροια'));
    await bMenu(page, 201, 'split-hub');
    await page.waitForTimeout(500);
    const ev = await bEv(page);
    ok(scn, 'a saved ✈ «Σπάσιμο» says «… ως ΠΡΟΣ ΑΝΑΘΕΣΗ» when the Veroia board does not list them, never «για μοίρασμα»',
      bCalls(S, 'POST', '/plan/move').length === 2 && ev.some((x) => x.startsWith('toast') && x.includes('γύρισαν στη Βέροια ως ΠΡΟΣ ΑΝΑΘΕΣΗ')) && !ev.some((x) => x.includes('για μοίρασμα')), ev);
    await page.context().close();
  }
  { // G · fidelity r1 (Figma Move list 2011:9294 / 2013:7751-7777, Δ1 2051:7735): header names place + pallets, then
    //     reference · side · delivery day, never the client; «ΑΛΛΟ» is a choice like the others; the source after the
    //     move closes the list; no Veroia-window field a move does not wait for; the partner cycle line on one 40px row
    const { page, S } = await bOpen(browser, origin, { plan: { 'POST /plan/move': (e) => (e.body && e.body.dry_run === true ? dry('tokG', [RTC]) : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await openMove(page);
    const v = await page.$eval(D, (dlg) => {
      const r = (e) => e.getBoundingClientRect(), cs = (e) => getComputedStyle(e);
      const alt = dlg.querySelector('[data-line="wait"]'), at = alt && alt.querySelector('b'), sub = at && at.nextElementSibling;
      const box = dlg.querySelector('[data-line="rt"] .wi4-box'), pal = alt && alt.querySelector('.wn5-alt-p'), btn = alt && alt.querySelector('[data-cand="wait"]');
      const par = dlg.querySelector('[data-line="rt"] [data-rate-rt]'), parLine = par && par.closest('.wn5-cand'), keep = parLine && parLine.querySelector('[data-act="rate"]');
      return { title: dlg.querySelector('.wi4-dlg-t').innerText, meta: (dlg.querySelector('.wn5-dlg-meta') || {}).innerText || '',
        alt: at && sub && box ? { x: Math.round(r(at).left), boxX: Math.round(r(box).left), t: [cs(at).fontSize, cs(at).color].join('|'), ink: cs(dlg.querySelector('.wi4-dlg-t')).color,
          sub: cs(sub).fontSize, h: Math.round(r(alt).height), pal: pal ? pal.innerText : '', palGap: pal && btn ? Math.round(r(btn).left - r(pal).right) : null,
          palSt: pal ? [cs(pal).fontSize, cs(pal).fontWeight, cs(pal).color].join('|') : '' } : null,
        after: (dlg.querySelector('[data-src-after]') || {}).innerText || '', hubwin: !!dlg.querySelector('.wn5-hubwin'),
        afterSt: (() => { const a = dlg.querySelector('[data-src-after]'); return a ? [cs(a).fontSize, cs(a).fontWeight, cs(a).color].join('|') : ''; })(),
        grey2: (() => { const g = dlg.querySelector('.wn5-alt > span'); return g ? cs(g).color : ''; })(),
        par: parLine ? { h: Math.round(r(parLine).height), keepShown: !!keep && r(keep).width > 0, fs: cs(par).fontSize } : null };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'fidelity r1: header «Μεταφορά σε… · RENTIS TEST · 12π» · «VS-T201 · ΚΑΘΟΔΟΣ · παράδοση Τρί 13/10», no client (Figma 2013:7751/7752)',
      v.title === 'Μεταφορά σε… · RENTIS TEST · 12π' && v.meta.includes('VS-T201 · ΚΑΘΟΔΟΣ · παράδοση Τρί 13/10') && !/ΠΕΛΑΤΗΣ/.test(v.title + v.meta), v);
    ok(scn, 'fidelity r1/r2: «Πίσω στη Βέροια» at the list\'s left edge (the boxes\' x), 12.5px ink over 11px, «12π» right against its button, one 40px line (2013:7773-7775)',
      !!v.alt && v.alt.x === v.alt.boxX && v.alt.t === '12.5px|' + v.alt.ink && v.alt.sub === '11px' && v.alt.h === 40 && v.alt.pal === '12π' && v.alt.palGap >= 4 && v.alt.palGap <= 12, v.alt);
    ok(scn, 'fidelity r1: the source after the move closes the list «TST-2106 · 27 → 15/33» (2013:7777)', v.after === 'TST-2106 · 27 → 15/33', v.after);
    ok(scn, 'fidelity r2: «12π» SemiBold 12px grey-2 (2013:7775); «TST-2106 · 27 → 15/33» Medium 11px grey-2 (2013:7777)',
      !!v.alt && !!v.grey2 && v.alt.palSt === '12px|600|' + v.grey2 && v.afterSt === '11px|500|' + v.grey2, { pal: v.alt && v.alt.palSt, after: v.afterSt, grey2: v.grey2 });
    ok(scn, 'fidelity r1: partner cycle line 40px with field + € + its button, «Κράτα» hidden while the field is empty, field 11.5px (Δ1 2051:7735)',
      !!v.par && v.par.h === 40 && v.par.keepShown === false && v.par.fs === '11.5px', v.par);
    await page.fill(`${D} [data-rate-rt]`, '350');
    ok(scn, 'fidelity r1: a typed rate brings «Κράτα» back (the rate stays its own act)', await page.$eval(`${D} [data-act="rate"]`, (b) => b.getBoundingClientRect().width > 0).catch(() => false));
    // no Veroia-window field: the moved piece's new Veroia stop takes the source stop's window (072:1208-1215)
    await bClick(page, `${D} [data-act="pick"][data-cand="truck:14"]`);
    const off = await bOff(page, `${D} .wn5-more [data-act="save"]`);
    if (off === false) await bClick(page, `${D} .wn5-more [data-act="save"]`);   // a disabled button is a ✗ below, not a 30 s wait
    const c = bCalls(S, 'POST', '/plan/move');
    const s0 = c[0] && c[0].body.stops && c[0].body.stops[0];
    ok(scn, 'fidelity r1: no «Παράθυρο φόρτωσης Βέροιας *» in a move; a free truck sends the source Veroia window 16:00–18:00 of Δευ 12/10',
      v.hubwin === false && off === false && c.length === 1 && !!s0 && s0.planned_from === '2026-10-12T16:00:00+03:00' && s0.planned_to === '2026-10-12T18:00:00+03:00' && !('stop_id' in s0), { hubwin: v.hubwin, off, raw: c.map((x) => x.raw) });
    ok(scn, 'fidelity r1: the two-step title names the load and its place, never the client («Μεταφορά · VS-T201 · RENTIS TEST»)',
      (await bText(page, `${D} .wi4-dlg-t`)) === 'Μεταφορά · VS-T201 · RENTIS TEST');
    await shot(page, 'move-g-twostep');
    await page.context().close();
  }
  { // H · fidelity r2 at 1440 (Figma 2013:7751/7752): a whole side's meta is its own row under the title, 11px grey-2,
    //     never cut — inline it lost «13/10» (319px of text in 303px)
    const { page } = await bOpen(browser, origin, { viewport: { width: 1440, height: 900 } });
    await page.evaluate(() => { WN5Act.move({ rt_id: 204, side: 'KATHODOS' }, {}); }).then(() => page.waitForTimeout(300), () => {});
    const h = await page.$eval(D, (dlg) => {
      const t = dlg.querySelector('.wi4-dlg-t'), m = dlg.querySelector('.wi4-dlg-hd > .wn5-dlg-meta'), seg = dlg.querySelector('.wi4-dlg-hd > .wn5-seg');
      const r = (e) => e.getBoundingClientRect(), cs = getComputedStyle(m);
      return { meta: m.innerText, cut: m.scrollWidth > m.clientWidth, below: r(m).top >= r(t).bottom - 0.5, left: Math.round(r(m).left) === Math.round(r(t).left),
        segRow: !!seg && r(seg).bottom <= r(m).top + 0.5, st: [cs.fontSize, cs.color].join('|') };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'fidelity r2: whole side meta «RT-T204 · ΚΑΘΟΔΟΣ · 2 παραδόσεις · παράδοση Τρί 13/10» on its own row under the title, not cut, 11px',
      h.meta === 'RT-T204 · ΚΑΘΟΔΟΣ · 2 παραδόσεις · παράδοση Τρί 13/10' && !h.cut && h.below && h.left && h.segRow && /^11px\|/.test(h.st || ''), h);
    await shot(page, 'move-h-side-1440');
    await page.context().close();
  }
}
SCN['move'] = scnMove;

// T15 — «Καθαρισμός ανάθεσης» (Δ5 2053:8079): empty list = at once; a list = the dialog; no hidden button.
async function scnClear(browser, origin) {
  const scn = 'clear';
  const D = bDlg('clear');
  const P = '/plan/rt/201/clear';
  const K = 'POST /plan/rt/:id/clear';   // the stub's route key (routeKey: digits → :id)
  const dry = (tok, cons) => [200, { ok: true, op: 'plan_rt_clear', dry_run: true, needs_confirm: cons.length > 0, confirm_token: tok, consequences: cons }];
  const PAY = { kind: 'payroll_amount', rt_id: 201, dl_entry_id: 7, driver_id: 32, month: '2026-10' };
  const DKV = { kind: 'costs', rt_id: 201, pay_source: 'DKV', count: 2 };
  const cleared = () => { const b = bBoard(); const c = b.cycles.find((x) => x.rt_id === 201);
    Object.assign(c, { truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null });
    c.stops.forEach((s) => { s.has_vehicle = false; }); return b; };
  { // A · empty list: at once, then the row is «ΠΡΟΣ ΑΝΑΘΕΣΗ» after the re-read
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: (e, St) => {
      if (e.body && e.body.dry_run === true) return dry('tokC0', []);
      St.board = cleared();
      return [200, { ok: true, op: 'plan_rt_clear', dry_run: false, ids: { rt_id: 201 }, warnings: [], notice_ids: [] }];
    } } });
    await bMenu(page, 201, 'clear');
    await page.waitForTimeout(400);
    const c = bCalls(S, 'POST', P);
    ok(scn, 'empty list → at once, no dialog: {dry_run:true}, then {confirm_token}', c.length === 2 && c[0].raw === '{"dry_run":true}' && c[1].raw === '{"confirm_token":"tokC0"}' && !(await bHas(page, D)), c.map((x) => x.raw));
    ok(scn, 'after the 200 the board is read again and RT-T201 shows «ΠΡΟΣ ΑΝΑΘΕΣΗ»', await bHas(page, '.wn5-row[data-rt="201"] .wi4-box.un'));
    await page.context().close();
  }
  { // B · a list (dispatcher): the Δ5 dialog without amounts, the red button, the execution with the token (closed)
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: (e) => (e.body && e.body.dry_run === true ? dry('tokC1', [DKV, PAY]) : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bMenu(page, 201, 'clear');
    const txt = await bText(page, D);
    ok(scn, 'a list → the Δ5 dialog: «Καθαρισμός ανάθεσης», the Δ5 text, «Παραστατικά που υπάρχουν» with the DKV and payroll lines',
      txt.includes('Καθαρισμός ανάθεσης') && txt.includes('Λάθος ανάθεση: ό,τι καθαρίζεται, δεν έγινε. Βλάβη: «Αλλαγή οχήματος» στην καρτέλα κύκλου.')
      && txt.includes('Παραστατικά που υπάρχουν') && txt.includes('2 γραμμές DKV') && txt.includes('γραμμή μισθοδοσίας με ποσό (Οκτώβριος)'), txt.slice(0, 600));
    ok(scn, 'dispatcher: no amount anywhere in the dialog', !txt.includes('€'));
    // fidelity r1 (Δ5 2053:8081): «Τι θα γίνει» under the documents, four rows; truck · driver only, the cycle once
    const what = await page.$$eval(`${D} .wn5-cons li[data-row="what"]`, (ls) => ls.map((l) => l.innerText)).catch(() => []);
    ok(scn, '«Τι θα γίνει» rows: truck · driver leave the whole cycle, 2 deliveries → ΠΡΟΣ ΑΝΑΘΕΣΗ, payroll deleted, DKV notice',
      JSON.stringify(what) === JSON.stringify(['TST-2106 · Driver Test 02 βγαίνουν από όλο τον κύκλο (κάθοδος + άνοδος)',
        '2 παραδόσεις (Τρί 13/10) → μαζί ΠΡΟΣ ΑΝΑΘΕΣΗ', 'η μισθοδοσία του κύκλου σβήνεται', 'DKV: οι 2 γραμμές μένουν χωρίς δρομολόγιο → ειδοποίηση']), what);
    const iD = txt.indexOf('Λάθος ανάθεση'), iP = txt.indexOf('Παραστατικά που υπάρχουν'), iW = txt.indexOf('Τι θα γίνει');
    ok(scn, 'order as Δ5: the Δ5 line, then «Παραστατικά που υπάρχουν», then «Τι θα γίνει»; no trailer, no «κύκλος 1» in the body',
      iD >= 0 && iD < iP && iP < iW && !txt.includes('TRL-5101') && txt.split('\n').slice(1).every((l) => !l.includes('κύκλος 1')), txt.slice(0, 600));
    await shot(page, 'clear-b-dispatcher');
    ok(scn, 'the confirm button is the red «Καθαρισμός»', (await bText(page, `${D} [data-act="confirm"].wn5-danger`)) === 'Καθαρισμός');
    await bClick(page, `${D} [data-act="confirm"]`);
    const c = bCalls(S, 'POST', P);
    ok(scn, '«Καθαρισμός» → {confirm_token} only; 409 → the preview strip in the dialog', c.length === 2 && c[1].raw === '{"confirm_token":"tokC1"}'
      && (await bText(page, `${D} .wn5-strip[data-kind="preview"]`)).includes('rig sentinel writes_closed'), c.map((x) => x.raw));
    await page.context().close();
  }
  { // C · owner: the amounts the DB kept for the role are shown
    // fidelity r1: TST-2106 has a second cycle (205) and RT-T201 an ΑΝΟΔΟΣ loading, so the rows read «1/2· ο 2/2 μένει»
    const b2 = bBoard(); const i201 = b2.cycles.findIndex((x) => x.rt_id === 201); const c201 = b2.cycles[i201];
    const own12 = { truck_id: 12, truck: 'TST-2106', trailer_id: 21, trailer: 'TRL-5101', driver_id: 32, driver: 'Driver Test 02' };
    b2.cycles[i201] = bCycle(201, own12, c201.stops.concat([bStop(2004, 'ANODOS', 3, '2026-10-13', '12:00', '14:00', [bLeg(6004, 5104, 'load', 8)]),
      bStop(2005, 'ANODOS', 1, '2026-10-13', '20:00', '22:00', [bLeg(6004, 5104, 'unload', 8)])]));
    b2.cycles.push(bCycle(205, own12, [bStop(2051, 'KATHODOS', 1, '2026-10-14', '16:00', '18:00', [bLeg(6051, 5151, 'load', 10)]),
      bStop(2052, 'KATHODOS', 2, '2026-10-15', '06:00', '08:00', [bLeg(6051, 5151, 'unload', 10)])]));
    const { page } = await bOpen(browser, origin, { role: 'owner', board: b2, plan: { [K]: (e) => (e.body && e.body.dry_run === true
      ? dry('tokC2', [Object.assign({ amount: 186.4 }, DKV), Object.assign({ amount: 120, advance: null, expenses: null }, PAY)]) : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bMenu(page, 201, 'clear');
    const txt = await bText(page, D);
    ok(scn, 'owner: «2 γραμμές DKV · 186,40 €» and «ποσό 120,00 €»', txt.includes('2 γραμμές DKV · 186,40 €') && txt.includes('ποσό 120,00 €'), txt.slice(0, 500));
    const what = await page.$$eval(`${D} .wn5-cons li[data-row="what"]`, (ls) => ls.map((l) => l.innerText)).catch(() => []);
    ok(scn, 'owner, 2 cycles of TST-2106: title «κύκλος 1/2;», «… βγαίνουν από τον κύκλο 1/2· ο 2/2 μένει», «2 παραδόσεις (Τρί 13/10) + 1 φόρτωση ΑΝΟΔΟΥ (Τρί 13/10)»',
      txt.includes('Καθαρισμός ανάθεσης · TST-2106 · κύκλος 1/2;') && what[0] === 'TST-2106 · Driver Test 02 βγαίνουν από τον κύκλο 1/2· ο 2/2 μένει'
      && what[1] === '2 παραδόσεις (Τρί 13/10) + 1 φόρτωση ΑΝΟΔΟΥ (Τρί 13/10) → μαζί ΠΡΟΣ ΑΝΑΘΕΣΗ', what);
    await shot(page, 'clear-c-owner');
    await page.context().close();
  }
  { // D · management: the button is there, the Worker says no (Δ12 tile 8)
    const { page, S } = await bOpen(browser, origin, { role: 'management', plan: { [K]: () => planErr(403, 'FORBIDDEN', 'forbidden') } });
    ok(scn, 'management sees «Καθαρισμός ανάθεσης» in ✈ and can press it (no role gate)', await bMenu(page, 201, 'clear'));
    await page.waitForTimeout(300);
    ok(scn, '403 → the forbidden strip on the board with the Worker text; nothing else sent', (await bText(page, '#content .wn5-acthost .wn5-strip[data-kind="forbidden"]')).includes('rig sentinel forbidden')
      && bCalls(S, 'POST', P).length === 1);
    await page.context().close();
  }
}
SCN['clear'] = scnClear;

// T16 — the date panel Δ4 (Figma 2053:7837): a dry run per change, the same body on save, a conflict = no save.
async function scnDate(browser, origin) {
  const scn = 'date';
  const D = bDlg('date');
  const P = '/plan/rt/204';
  const K = 'PATCH /plan/rt/:id';   // the stub's route key (routeKey: digits → :id); bCalls checks the literal path
  const CHIP = '.wn5-row[data-rt="204"] [data-act="date"][data-side="KATHODOS"]';
  const PV = (o) => [200, { ok: true, op: 'plan_rt_update', dry_run: true, preview: Object.assign({
    before: { start_at: '2026-10-12T11:00:00+03:00', end_at: '2026-10-13T22:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-13' },
    after: { start_at: '2026-10-13T11:00:00+03:00', end_at: '2026-10-14T22:00:00+03:00', date_start: '2026-10-13', date_end: '2026-10-14' },
    next_rt: null, conflict: null, vs_day: [], warnings: [] }, o || {}) }];
  const bodyOf = (x) => { const o = Object.assign({}, x.body); delete o.dry_run; return JSON.stringify(o); };
  { // A · a day: one dry run, the result, the international, the warning; save = the same body (closed)
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: (e) => (e.body && e.body.dry_run === true
      ? PV({ vs_day: [{ order_id: 2101, from: '2026-10-12', to: '2026-10-13' }], warnings: [{ code: 'local_payroll_review', dl_entry_id: 8, local_move_id: 7001 }] })
      : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bClick(page, CHIP);
    const head = await bText(page, D);
    ok(scn, 'the day chip opens .wi4-dlg[data-wn5=date]: «Ημερομηνία φόρτωσης Βέροιας», «ΚΑΘΟΔΟΣ · TST-2103», «Οκτώβριος 2026»',
      head.includes('Ημερομηνία φόρτωσης Βέροιας') && head.includes('ΚΑΘΟΔΟΣ · TST-2103') && head.includes('Οκτώβριος 2026'), head.slice(0, 300));
    ok(scn, 'nothing changed → no dry run, «Αποθήκευση» disabled', bCalls(S, 'PATCH', P).length === 0 && (await bOff(page, `${D} [data-act="save"]`)) === true);
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await page.waitForTimeout(300);
    const c = bCalls(S, 'PATCH', P);
    ok(scn, 'a day → ONE dry run PATCH /plan/rt/204 {shift:{side:KATHODOS, delta:"1 days"}, dry_run:true}', c.length === 1 && c[0].body.dry_run === true
      && bodyOf(c[0]) === '{"shift":{"side":"KATHODOS","delta":"1 days"}}', c.map((x) => x.raw));
    const res = await bText(page, D);
    ok(scn, '«ΑΠΟΤΕΛΕΣΜΑ · +1 ΗΜΕΡΑ», «Φόρτωση Βέροιας» Δευ 12/10 → Τρί 13/10 · 18:00–19:00, «Επόμενος κύκλος · κανένας»',
      res.includes('ΑΠΟΤΕΛΕΣΜΑ · +1 ΗΜΕΡΑ') && /Φόρτωση Βέροιας\s+Δευ 12\/10 → Τρί 13\/10 · 18:00–19:00/.test(res) && res.includes('Επόμενος κύκλος · κανένας'), res.slice(0, 600));
    // fidelity r1 (Figma 2053:7838): two-line rows, only deliveries numbered, the ANODOS in the result, the calendar
    const fa = await page.$eval(D, (dlg) => {
      const li = (sel) => dlg.querySelector('.wn5-res li' + sel);
      const two = (e) => (e ? [e.querySelector('.wn5-res-n'), e.querySelector('.wn5-res-s')].map((x) => (x ? x.innerText.replace(/\s+/g, ' ').trim() : null)) : null);
      const v = li('[data-stop="2031"]'); const vb = v && v.querySelector('.wn5-res-s b');
      const cs = (e) => (e ? getComputedStyle(e) : {});
      const meta = dlg.querySelector('.wi4-dlg-hd > .wn5-dlg-meta');
      const x = dlg.querySelector('.wi4-dlg-x');
      const cell = dlg.querySelector('.wn5-cal-d[data-day="2026-10-13"]').getBoundingClientRect();
      return { v: two(v), vbColor: cs(vb).color, vbW: cs(vb).fontWeight, nSize: cs(v && v.querySelector('.wn5-res-n')).fontSize, sSize: cs(v && v.querySelector('.wn5-res-s')).fontSize,
        thess: two(li('[data-stop="2033"]')), d1: two(li('[data-stop="2032"]')), d2: two(li('[data-stop="2034"]')),
        anod: two(li('[data-row="anod"]')), anodWarn: !!dlg.querySelector('.wn5-res li[data-row="anod"].wn5-res-warn'),
        chk: !!dlg.querySelector('.wn5-datep-r input[data-anod]'), chkLeft: !!dlg.querySelector('.wn5-datep > div:first-child input[data-anod]'),
        chkSub: (dlg.querySelector('.wn5-res-chk .wn5-res-s') || {}).innerText || '',
        meta: meta ? meta.innerText : '', metaH: meta ? meta.getBoundingClientRect().height : 0, metaSize: cs(meta).fontSize,
        noX: !x || x.offsetParent === null, prose: [...dlg.querySelectorAll('.wn5-datep > div:first-child p')].length, w: dlg.getBoundingClientRect().width,
        orig: dlg.querySelector('.wn5-cal-d[data-day="2026-10-12"]').classList.contains('orig'), sel: dlg.querySelector('.wn5-cal-d[data-day="2026-10-13"]').classList.contains('sel'),
        out: [...dlg.querySelectorAll('.wn5-cal-d.out')].map((e) => e.textContent), cell: [Math.round(cell.width), Math.round(cell.height)],
        rule: cs(dlg.querySelector('.wn5-datep-r')).borderLeftStyle, hd: cs(dlg.querySelector('.wn5-datep-r .wn5-cons-h')).fontSize };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'Δ4 rows: name over «Δευ 12/10 → » + the new value in blue SemiBold (11.5 / 11px)', !!fa.v && fa.v[0] === 'Φόρτωση Βέροιας' && fa.v[1] === 'Δευ 12/10 → Τρί 13/10 · 18:00–19:00'
      && fa.vbColor === 'rgb(2, 132, 199)' && Number(fa.vbW) >= 600 && fa.nSize === '11.5px' && fa.sSize === '11px', fa);
    ok(scn, 'only deliveries numbered: «ΚΑΘΟΔΟΣ · TST-2103 · κύκλος 1 · 2 παραδόσεις»; THESSALONIKI is «Φόρτωση · …», LARISA 1, ATHENS 2',
      /ΚΑΘΟΔΟΣ · TST-2103 · κύκλος 1 · 2 παραδόσεις$/.test(fa.meta) && !!fa.thess && fa.thess[0] === 'Φόρτωση · ΠΕΛΑΤΗΣ Α · THESSALONIKI TEST'
      && !!fa.d1 && /^1 ΠΕΛΑΤΗΣ Α · LARISA TEST$/.test(fa.d1[0]) && !!fa.d2 && /^2 ΠΕΛΑΤΗΣ Α · ATHENS TEST$/.test(fa.d2[0]), fa);
    ok(scn, 'the ANODOS in the result: «ΑΝΟΔΟΣ · 1 φορτίο · 12:00–14:00» over amber «Τρί 13/10 · πριν τελειώσει η ΚΑΘΟΔΟΣ (Τετ 12:00)», the box under it',
      !!fa.anod && fa.anod[0] === 'ΑΝΟΔΟΣ · 1 φορτίο · 12:00–14:00' && fa.anod[1] === 'Τρί 13/10 · πριν τελειώσει η ΚΑΘΟΔΟΣ (Τετ 12:00)' && fa.anodWarn
      && fa.chk && !fa.chkLeft && fa.chkSub.trim() === '→ Τετ 14/10 · τέλος κύκλου ως Τετ 14/10 22:00', fa);
    ok(scn, 'Δ4 shell: 568 wide, no «×», meta one 11px line under the title, no prose under the calendar, a rule left of the result, its header 10px',
      Math.round(fa.w) === 568 && fa.noX && fa.metaSize === '11px' && fa.metaH > 0 && fa.metaH <= 16 && fa.prose === 0 && fa.rule === 'solid' && fa.hd === '10px', fa);
    ok(scn, 'calendar: the chosen day filled, the cycle\'s own day a dashed ring, a greyed «1» after 31, cells 30×26',
      fa.orig && fa.sel && fa.out.join(',') === '1' && fa.cell.join('×') === '30×26', fa);
    // whole-frame r3 (2053:7838): the compact shell — padding 12, the pop shadow, title DM Sans SemiBold 12.5 ink,
    // footer buttons 26 / 11.5 SemiBold / r5 / px 10 — not the generic wi4 dialog (Syne 15, 32px, 16 padding)
    const sh = await page.$eval(D, (dlg) => { const cs = (e) => getComputedStyle(e); const t = dlg.querySelector('.wi4-dlg-t');
      const btns = [...dlg.querySelectorAll('.wi4-dlg-ft .wi4-btn')].filter((b) => b.offsetParent !== null);
      return { pad: cs(dlg).paddingTop + ' ' + cs(dlg).paddingLeft, shadow: cs(dlg).boxShadow, tf: cs(t).fontFamily, ts: cs(t).fontSize, tw: cs(t).fontWeight, tc: cs(t).color,
        b: btns.map((b) => ({ h: Math.round(b.getBoundingClientRect().height), fs: cs(b).fontSize, fw: cs(b).fontWeight, r: cs(b).borderTopLeftRadius, px: cs(b).paddingLeft + ' ' + cs(b).paddingRight, t: b.innerText.trim() })) };
    }).catch((e) => ({ err: String(e) }));
    ok(scn, 'Δ4 shell: padding 12, shadow 0 8 12 rgba(10,26,41,.16), title DM Sans 600 12.5px ink, buttons 26px / 11.5px 600 / r5 / px 10',
      sh.pad === '12px 12px' && /rgba\(10, 26, 41, 0\.16\) 0px 8px 12px/.test(sh.shadow || '') && /^"?DM Sans/.test(sh.tf || '') && sh.ts === '12.5px' && sh.tw === '600' && sh.tc === 'rgb(11, 25, 41)'
      && Array.isArray(sh.b) && sh.b.length >= 2 && sh.b.every((x) => x.h === 26 && x.fs === '11.5px' && x.fw === '600' && x.r === '5px' && x.px === '10px 10px'), sh);
    await shot(page, 'date-A-day13');
    ok(scn, 'preview.vs_day → «ενημερώνει τη διεθνή #2101 · 12/10 → 13/10»; preview.warnings → the label line',
      res.includes('ενημερώνει τη διεθνή #2101 · 12/10 → 13/10') && res.includes('Η γραμμή μισθοδοσίας του τοπικού οδηγού με ποσό πάει για έλεγχο στο λογιστήριο'));
    await bClick(page, `${D} [data-act="save"]`);
    const c2 = bCalls(S, 'PATCH', P);
    ok(scn, '«Αποθήκευση» sends the dry-run body without dry_run (no confirm_token in 072)', c2.length === 2 && c2[1].raw === '{"shift":{"side":"KATHODOS","delta":"1 days"}}', c2.map((x) => x.raw));
    ok(scn, '409 writes_closed → the preview strip in the panel', (await bText(page, `${D} .wn5-strip[data-kind="preview"]`)).includes('rig sentinel writes_closed'));
    ok(scn, 'no page errors (A)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  // 072 sends next_rt:null with EVERY conflict (072:1820-1824); truck_busy / driver_busy name the other cycle in
  // detail (plan_h_busy 072:1434-1450). The stubs below are that shape, never next_rt next to a conflict.
  const CF = (code, detail) => PV({ after: null, next_rt: null, conflict: { code, sqlstate: '23514', detail, message: 'rig sentinel conflict ' + code } });
  const cfRead = (page) => page.$eval(D, (dlg) => {
    const li = dlg.querySelector('.wn5-res li[data-row="next"], .wn5-res li[data-row="conflict"]');
    const n = li && li.querySelector('.wn5-res-n');
    const s = li ? [...li.querySelectorAll('.wn5-res-s')] : [];
    const b = dlg.querySelector('.wi4-dlg-ft [data-act="next"]');
    return { row: li ? li.dataset.row : null, name: n ? n.innerText : null, red: s[0] && s[0].classList.contains('wn5-conflict') ? s[0].innerText : '',
      redColor: s[0] ? getComputedStyle(s[0]).color : '', hint: s[1] ? s[1].innerText : null, box: !!dlg.querySelector('.wn5-res > .wn5-conflict, .wn5-datep-r > .wn5-conflict'),
      btn: b && b.offsetParent !== null ? b.innerText : null, btnFirst: b === dlg.querySelector('.wi4-dlg-ft').firstElementChild,
      save: (dlg.querySelector('[data-act="save"]') || {}).disabled };
  }).catch((e) => ({ err: String(e) }));
  { // B · truck_busy naming a cycle that is not on the loaded board: its code, neutral, no way out, no save
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: () => CF('truck_busy', 'RT-T205') } });
    await bClick(page, CHIP);
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await page.waitForTimeout(300);
    const x = await cfRead(page);
    ok(scn, 'truck_busy RT-T205 (not on the board) → «Κύκλος · RT-T205» over the red Worker line, no hint, no «Ανάθεση…», «Αποθήκευση» disabled',
      x.row === 'conflict' && x.name === 'Κύκλος · RT-T205' && x.red === 'rig sentinel conflict truck_busy · δεν αποθηκεύεται' && x.hint === null && x.btn === null && x.save === true, x);
    ok(scn, 'no page errors (B)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // B2 · truck_busy naming the NEXT cycle of the truck (on the board, starts after): «Επόμενος κύκλος», the hint, «Ανάθεση 2/2…»
    const board = bBoard();
    board.cycles.push(bCycle(206, { truck_id: 13, truck: 'TST-2103', trailer_id: 23, trailer: 'TRL-5103', driver_id: 33, driver: 'Driver Test 03' }, [
      bStop(2061, 'KATHODOS', 1, '2026-10-14', '16:00', '18:00', [bLeg(6061, 5161, 'load', 10)]),
      bStop(2062, 'KATHODOS', 4, '2026-10-15', '06:00', '08:00', [bLeg(6061, 5161, 'unload', 10)])]));
    const { page, S } = await bOpen(browser, origin, { board, plan: { [K]: () => CF('truck_busy', 'RT-T206') } });
    await bClick(page, CHIP);
    await bClick(page, `${D} [data-day="2026-10-14"]`);
    await page.waitForTimeout(300);
    const nx = await cfRead(page);
    ok(scn, 'conflict = the red sub-line of «Επόμενος κύκλος · TST-2103 · 2/2» (from conflict.detail), the grey hint under it, no separate red box',
      nx.row === 'next' && nx.name === 'Επόμενος κύκλος · TST-2103 · 2/2' && nx.red === 'rig sentinel conflict truck_busy · δεν αποθηκεύεται' && nx.redColor === 'rgb(185, 28, 28)'
      && nx.hint === 'Άλλη ημέρα ή ανάθεση του 2/2 σε άλλο φορτηγό.' && !nx.box && nx.save === true, nx);
    ok(scn, '«Ανάθεση 2/2…» left of «Άκυρο» (Figma 2082:7735)', nx.btn === 'Ανάθεση 2/2…' && nx.btnFirst, nx);
    await shot(page, 'date-B2-conflict');
    await bClick(page, `${D} .wi4-dlg-ft [data-act="next"]`);
    await page.waitForTimeout(300);
    ok(scn, '«Ανάθεση 2/2…» closes the date panel and opens the assignment of RT-T206', !(await bHas(page, D)) && (await bText(page, bDlg('assign'))).includes('RT-T206'));
    ok(scn, 'no page errors (B2)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // B3 · driver_busy naming an EARLIER cycle (RT-T203 starts Sat 10/10): named neutrally, no «Επόμενος», no hint, no button
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: () => CF('driver_busy', 'RT-T203') } });
    await bClick(page, CHIP);
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await page.waitForTimeout(300);
    const x = await cfRead(page);
    ok(scn, 'driver_busy RT-T203 (earlier) → «Κύκλος · TST-2104» over the red line; no «Επόμενος», no hint, no «Ανάθεση…»',
      x.row === 'conflict' && x.name === 'Κύκλος · TST-2104' && x.red === 'rig sentinel conflict driver_busy · δεν αποθηκεύεται' && x.hint === null && x.btn === null, x);
    ok(scn, 'no page errors (B3)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // B4 · any other code (a window rule with a detail): the Worker's words alone, no name, no hint, no button
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: () => CF('window_order', '2031') } });
    await bClick(page, CHIP);
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await page.waitForTimeout(300);
    const x = await cfRead(page);
    ok(scn, 'window_order → only «rig sentinel conflict window_order · δεν αποθηκεύεται»: no name row, no hint, no button, «Αποθήκευση» disabled',
      x.row === 'conflict' && x.name === null && x.red === 'rig sentinel conflict window_order · δεν αποθηκεύεται' && x.hint === null && x.btn === null && x.save === true, x);
    ok(scn, 'no page errors (B4)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // E · own cycle without ANODOS, with a local loading (RT-T201): «↳ Φόρτωση με τοπικό» under its stop, «Κενό γύρισμα»
    const board = bBoard();
    board.cycles[0].stops[2].local_loading = { local_move_id: 7101, driver: 'Driver Test 05', move_date: '2026-10-12', time_from: '11:00:00', time_to: '12:00:00' };
    const { page, S } = await bOpen(browser, origin, { board, plan: { [K]: () => PV() } });
    await bClick(page, '.wn5-row[data-rt="201"] [data-act="date"][data-side="KATHODOS"]');
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await page.waitForTimeout(300);
    const e = await page.$eval(D, (dlg) => {
      const two = (el) => (el ? [...el.children].map((x) => x.innerText.replace(/\s+/g, ' ').trim()) : null);
      const loc = dlg.querySelector('.wn5-res li[data-local="7101"]');
      return { loc: two(loc), prev: loc && loc.previousElementSibling ? loc.previousElementSibling.dataset.stop : null,
        locPad: loc ? getComputedStyle(loc).paddingLeft : '', gap: two(dlg.querySelector('.wn5-res li[data-row="gap"]')), anod: !!dlg.querySelector('.wn5-res li[data-row="anod"]') };
    }).catch((x) => ({ err: String(x) }));
    ok(scn, '«↳ Φόρτωση με τοπικό · Driver Test 05» under stop 2003, indented 14px; 072 moves its day with the stop → «Δευ 12/10 11:00–12:00 → Τετ 14/10»',
      !!e.loc && e.loc[0] === '↳ Φόρτωση με τοπικό · Driver Test 05' && e.loc[1] === 'Δευ 12/10 11:00–12:00 → Τετ 14/10' && e.prev === '2003' && e.locPad === '14px', e);
    ok(scn, '«Κενό γύρισμα · ASPROPYRGOS TEST» / «ελεύθερο από Τρί 13/10 09:00 → Τετ 14/10 09:00»; no ANODOS row',
      !!e.gap && e.gap[0] === 'Κενό γύρισμα · ASPROPYRGOS TEST' && e.gap[1] === 'ελεύθερο από Τρί 13/10 09:00 → Τετ 14/10 09:00' && !e.anod, e);
    await shot(page, 'date-E-201-local');
    ok(scn, 'no page errors (E)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  // wait until the n-th dry run is answered and drawn (the result column no longer reads «Διαβάζει…»)
  const dryDone = async (page, S, n) => {
    for (let i = 0; i < 60 && bCalls(S, 'PATCH', P).length < n; i++) await page.waitForTimeout(50);
    await until(page, (sel) => { const r = document.querySelector(sel + ' .wn5-datep-r'); return !!r && !r.innerText.includes('Διαβάζει'); }, D, 3000);
  };
  { // C · window + «Μετακίνηση και της ΑΝΟΔΟΥ»: ONE body (explicit stops + one shift); each step after its dry run
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: () => PV() } });
    await bClick(page, CHIP);
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await dryDone(page, S, 1);
    await page.check(`${D} input[data-anod]`).catch(() => {});
    await dryDone(page, S, 2);
    await page.fill(`${D} input[data-win="from"]`, '18:30').catch(() => {}); await page.press(`${D} input[data-win="from"]`, 'Tab').catch(() => {});
    await dryDone(page, S, 3);
    await page.fill(`${D} input[data-win="to"]`, '19:30').catch(() => {}); await page.press(`${D} input[data-win="to"]`, 'Tab').catch(() => {});
    await dryDone(page, S, 4);
    const c = bCalls(S, 'PATCH', P);
    const last = c[c.length - 1];
    ok(scn, 'window + ANODOS → one body: the Veroia stop on its old day, the ANODOS stops +1 day, one shift of the KATHODOS', c.length === 4 && !!last && bodyOf(last) === JSON.stringify({
      stops: [{ stop_id: 2031, planned_from: '2026-10-12T18:30:00+03:00', planned_to: '2026-10-12T19:30:00+03:00' },
              { stop_id: 2035, planned_from: '2026-10-14T12:00:00+03:00', planned_to: '2026-10-14T14:00:00+03:00' },
              { stop_id: 2036, planned_from: '2026-10-14T20:00:00+03:00', planned_to: '2026-10-14T22:00:00+03:00' }],
      shift: { side: 'KATHODOS', delta: '1 days' } }), c.map((x) => x.raw));
    ok(scn, 'no page errors (C)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // C2 · typing an hour while a dry run is in flight (stub answers after 500ms): the field, its focus and the
    // keystrokes survive the answer; the checkbox stays the same element; then ONE dry run with the typed window
    const late = (ms, v) => new Promise((res) => setTimeout(() => res(v), ms));
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: () => late(500, PV()) } });
    await bClick(page, CHIP);
    await page.$eval(`${D} input[data-win="from"]`, (e) => { e.__rig = 1; }).catch(() => {});
    await bClick(page, `${D} [data-day="2026-10-13"]`);      // dry run 1 in flight (bClick waits 200ms)
    await page.click(`${D} input[data-win="from"]`, { clickCount: 3 }).catch(() => {});
    await page.keyboard.type('18:3', { delay: 120 });          // ~360ms: the answer lands mid-typing
    await page.waitForTimeout(250);
    await page.keyboard.type('0');
    const mid = await page.$eval(`${D} input[data-win="from"]`, (e) => ({ same: e.__rig === 1, focus: document.activeElement === e, v: e.value })).catch((x) => ({ err: String(x) }));
    const drawn = await page.$eval(`${D} .wn5-datep-r`, (r) => !r.innerText.includes('Διαβάζει') && r.innerText.includes('ΑΠΟΤΕΛΕΣΜΑ')).catch(() => false);
    ok(scn, 'a preview answer while typing: the same «from» input, still focused, value «18:30» (the answer was drawn meanwhile)', mid.same && mid.focus && mid.v === '18:30' && drawn, mid);
    await page.$eval(`${D} input[data-anod]`, (e) => { e.__rig = 1; }).catch(() => {});
    await page.keyboard.press('Tab');
    await dryDone(page, S, 2);
    await page.check(`${D} input[data-anod]`).catch(() => {});
    await page.waitForTimeout(100);
    const kept = await page.$eval(`${D} input[data-anod]`, (e) => ({ same: e.__rig === 1, on: e.checked })).catch((x) => ({ err: String(x) }));
    await dryDone(page, S, 3);
    const after = await page.$eval(`${D} input[data-anod]`, (e) => ({ same: e.__rig === 1, on: e.checked })).catch((x) => ({ err: String(x) }));
    ok(scn, 'the ΑΝΟΔΟΣ checkbox is one element across previews and keeps its tick', kept.same && kept.on && after.same && after.on, [kept, after]);
    const c = bCalls(S, 'PATCH', P);
    ok(scn, 'the dry runs: day, then the typed window 18:30–19:00, then + ΑΝΟΔΟΣ (3 in all, the typed hour in the last two)',
      c.length === 3 && !c[0].raw.includes('stops') && c[1].raw.includes('"planned_from":"2026-10-12T18:30:00+03:00"') && c[2].raw.includes('"stop_id":2035')
      && c[2].raw.includes('"planned_from":"2026-10-12T18:30:00+03:00"'), c.map((x) => x.raw));
    ok(scn, 'no page errors (C2)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // D · a shape refusal in the dry run is a 422: the Worker's words
    const { page, S } = await bOpen(browser, origin, { plan: { [K]: () => planErr(422, 'PLAN_RULE', 'vehicle_clear_use_clear') } });
    await bClick(page, CHIP);
    await bClick(page, `${D} [data-day="2026-10-13"]`);
    await page.waitForTimeout(300);
    ok(scn, 'a 422 in the dry run → refusal strip with the Worker text, «Αποθήκευση» disabled', (await bText(page, `${D} .wn5-strip[data-kind="refusal"]`)).includes('rig sentinel vehicle_clear_use_clear')
      && (await bOff(page, `${D} [data-act="save"]`)) === true);
    ok(scn, 'no page errors (D)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
}
SCN['date'] = scnDate;

// T17 — «Φόρτωση με τοπικό» (decision 44): request_id on the creation only, the same id on every press until a 200.
async function scnLocal(browser, origin) {
  const scn = 'local';
  const D = bDlg('local');
  const P = '/plan/local-loading';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const noId = (x) => { const o = Object.assign({}, x.body); delete o.request_id; return JSON.stringify(o); };
  const fillForm = async (page) => {
    await bPick(page, `${D} select[data-stop]`, '2033');
    await bPick(page, `${D} select[data-driver]`, '34');
    await bPick(page, `${D} select[data-truck]`, '15');
    await page.fill(`${D} input[data-time="from"]`, '11:00', { timeout: 1500 }).catch(() => {});   // short: absent on main, never the watchdog
    await page.fill(`${D} input[data-time="to"]`, '12:00', { timeout: 1500 }).catch(() => {});   // short: absent on main, never the watchdog
  };
  { // A · plan_unknown then replayed: one POST per press, the same request_id, success with the first ids
    let n = 0;
    const { page, S } = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => (++n === 1 ? planErr(500, 'SERVER', 'plan_unknown')
      : [200, { ok: true, op: 'plan_local_loading', dry_run: false, already: false, replayed: true, ids: { local_move_id: 7001, rt_id: 204 }, warnings: [], notice_ids: [] }]) } });
    await bMenu(page, 204, 'local');
    const opts = await page.$$eval(`${D} select[data-stop] option`, (os) => os.map((o) => o.value).filter(Boolean)).catch(() => []);
    ok(scn, 'the ✈ item opens .wi4-dlg[data-wn5=local]; the stops offered = the cycle\'s loads outside Veroia (Thessaloniki)', JSON.stringify(opts) === '["2033"]', opts);
    ok(scn, '«Αποθήκευση» disabled until stop, driver and truck are chosen', (await bOff(page, `${D} [data-act="save"]`)) === true);
    await fillForm(page);
    await bClick(page, `${D} [data-act="save"]`);
    await page.waitForTimeout(3500);                // longer than _atRetry's 1 s + 2 s: a resend would show here
    const c = bCalls(S, 'POST', P);
    ok(scn, 'one POST {rt_stop_id, driver_id, truck_id, time_from, time_to} + a uuid v4 request_id', c.length === 1
      && noId(c[0]) === '{"rt_stop_id":2033,"driver_id":34,"truck_id":15,"time_from":"11:00","time_to":"12:00"}' && UUID.test(c[0].body.request_id || ''), c.map((x) => x.raw));
    ok(scn, '500 plan_unknown → exactly one POST, the «ΜΠΟΡΕΙ ΝΑ ΑΠΟΘΗΚΕΥΤΗΚΕ» strip with the Worker text, the window stays', c.length === 1
      && (await bText(page, `${D} .wn5-strip[data-kind="unknown"]`)).includes('rig sentinel plan_unknown'));
    const kept = await page.evaluate(() => JSON.stringify(sessionStorage) + JSON.stringify(localStorage) + JSON.stringify(history.state)).catch(() => '');
    ok(scn, 'the request_id lives in memory only (not in sessionStorage / localStorage / history.state)', !!c[0] && !kept.includes(c[0].body.request_id));
    await bClick(page, `${D} [data-act="save"]`);
    await page.waitForTimeout(400);
    const c2 = bCalls(S, 'POST', P);
    ok(scn, 'the second press carries the SAME request_id and the same bytes', c2.length === 2 && c2[0].raw === c2[1].raw, c2.map((x) => x.raw));
    const ev = await bEv(page);
    ok(scn, '200 replayed:true → success, no third POST, the window closes', c2.length === 2 && !(await bHas(page, D)) && ev.some((e) => e.startsWith('toast') && e.includes('Γράφτηκε η φόρτωση με τοπικό')), ev);
    await page.context().close();
  }
  { // B · a refusal is the Worker's words; closing the window drops the id, the next window has a new one
    const { page, S } = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => planErr(422, 'PLAN_RULE', 'driver_busy') } });
    await bMenu(page, 204, 'local');
    await fillForm(page);
    await bClick(page, `${D} [data-act="save"]`);
    ok(scn, '422 driver_busy → refusal strip with the Worker text', (await bText(page, `${D} .wn5-strip[data-kind="refusal"]`)).includes('rig sentinel driver_busy'));
    await bClick(page, `${D} [data-act="cancel"]`);
    await bMenu(page, 204, 'local');
    await fillForm(page);
    await bClick(page, `${D} [data-act="save"]`);
    const c = bCalls(S, 'POST', P);
    ok(scn, 'closing the window drops the request_id: the next window sends a new one', c.length === 2 && c[0].body.request_id && c[1].body.request_id && c[0].body.request_id !== c[1].body.request_id, c.map((x) => x.body && x.body.request_id));
    await page.context().close();
  }
  { // C · cancel from the ↳ line: no request_id; already:true and the payroll warning are said
    const board = bBoard();
    board.cycles.find((x) => x.rt_id === 204).stops.find((s) => s.stop_id === 2033).local_loading =
      { local_move_id: 7002, driver_id: 34, driver: 'Driver Test 04', move_date: '2026-10-12', time_from: '11:00', time_to: '12:00' };
    const { page, S } = await bOpen(browser, origin, { board, plan: { ['POST ' + P]: () => [200, { ok: true, op: 'plan_local_loading', dry_run: false, already: true,
      ids: { local_move_id: 7002 }, warnings: [{ code: 'local_payroll_review', dl_entry_id: 9, local_move_id: 7002 }], notice_ids: [] }] } });
    // fidelity T17 (Figma 2011:8305): on the pickup 2033 the ↳ line names what is loaded → Βέροια and the delivery
    // it is for (leg 6032 unloads at 2034 = delivery 2), never the pickup's own place after «για»
    // the whole sub-row: since whole-frame r4 its «↳» is in the index column, before .wn5-sub-t
    const sub = (await bText(page, '.wn5-sub[data-key="local:7002"]')).replace(/\s+/g, ' ').trim();
    ok(scn, '↳ «… · ΠΕΛΑΤΗΣ Α, THESSALONIKI TEST → Βέροια · 10π · για ΠΕΛΑΤΗΣ Α (στάση 2)»',
      sub.startsWith('↳ Φόρτωση με τοπικό · Driver Test 04 · Δευ 12/10 11:00–12:00 · ΠΕΛΑΤΗΣ Α, THESSALONIKI TEST → Βέροια · 10π · για ΠΕΛΑΤΗΣ Α (στάση 2)')
      && !sub.includes('για THESSALONIKI TEST'), sub);
    await bClick(page, '[data-act="local-cancel"][data-lm="7002"]');
    await bClick(page, `${D} [data-act="confirm"]`);
    await page.waitForTimeout(400);
    const c = bCalls(S, 'POST', P);
    ok(scn, 'the ↳ «Ακύρωση» → {local_move_id:7002, cancel:true}, no request_id', c.length === 1 && c[0].raw === '{"local_move_id":7002,"cancel":true}', c.map((x) => x.raw));
    const ev = await bEv(page);
    ok(scn, 'already:true → «ήταν ήδη ακυρωμένη»; the local payroll warning on the board', ev.some((e) => e.startsWith('toast') && e.includes('ήταν ήδη ακυρωμένη'))
      && (await bText(page, '#content .wn5-acthost .wn5-strip[data-kind="warning"]')).includes('τοπικού οδηγού'), ev);
    await page.context().close();
  }
}
SCN['local'] = scnLocal;

// T18 — order card and «Διαγραφή παραγγελίας» (Figma 2011:10496): only in the card, a reason, the list, no restore.
async function scnDelete(browser, origin) {
  const scn = 'delete';
  const C = bDlg('card'), D = bDlg('delete');
  const P = '/plan/delete';
  const dry = [200, { ok: true, op: 'plan_delete', dry_run: true, needs_confirm: true, confirm_token: 'tokD', consequences: [{ kind: 'invoiced', nat_order_id: 3111 }] }];
  const noDry = (x) => { const o = Object.assign({}, x.body); delete o.dry_run; return JSON.stringify(o); };
  { // A · dispatcher: the card, the list without invoice number, the reason, the execution (closed)
    const { page, S } = await bOpen(browser, origin, { plan: { ['POST ' + P]: (e) => (e.body && e.body.dry_run === true ? dry : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bMenu(page, 202, 'orders');
    const card = await bText(page, C);
    ok(scn, '✈ «Άνοιγμα παραγγελιών» of a one-order cycle opens the card: ΣΤΟΙΧΕΙΑ, ΣΤΑΣΕΙΣ, ΚΥΚΛΟΣ, ΤΙΜΟΛΟΓΗΣΗ',
      ['ΣΤΟΙΧΕΙΑ', 'ΣΤΑΣΕΙΣ', 'ΚΥΚΛΟΣ', 'ΤΙΜΟΛΟΓΗΣΗ', 'N-T111', 'ΠΕΛΑΤΗΣ Ε'].every((w) => card.includes(w)), card.slice(0, 500));
    // fidelity T18 (Figma 2011:10506 / 10556): «#N-…» with the '#', and «Φορτηγό» without the RT code
    const kv = (k) => page.$$eval(`${C} .wn5-kv`, (rs, key) => { const r = rs.find((e) => e.firstElementChild.innerText === key); return r ? r.lastElementChild.innerText : null; }, k).catch(() => null);
    ok(scn, 'fidelity: card title «#N-T111 · ΠΕΛΑΤΗΣ Ε»', (await bText(page, `${C} .wi4-dlg-t`)) === '#N-T111 · ΠΕΛΑΤΗΣ Ε', await bText(page, `${C} .wi4-dlg-t`));
    const fpar = await kv('Φορτηγό');
    ok(scn, 'fidelity: partner «Φορτηγό» = «Partner Test 01», no RT code', fpar === 'Partner Test 01', fpar);
    ok(scn, 'delete lives only in the card: none on any stop of the board', (await bHas(page, `${C} [data-act="delete"]`))
      && (await page.$$('#content .wn5-pt [data-act="delete"], #content .wn5-pt .wn5-x')).length === 0);
    await bClick(page, `${C} [data-act="delete"]`);
    const c = bCalls(S, 'POST', P);
    ok(scn, 'the dry run is {nat_order_id:3111} + dry_run:true — no reason yet', c.length === 1 && c[0].body.dry_run === true && noDry(c[0]) === '{"nat_order_id":3111}', c.map((x) => x.raw));
    const txt = await bText(page, D);
    ok(scn, 'the list: «τιμολογήθηκε: το ERP κάνει το πιστωτικό», no invoice number, no «Επαναφορά»',
      txt.includes('τιμολογήθηκε: το ERP κάνει το πιστωτικό') && !/τιμολογήθηκε \(/.test(txt) && !txt.includes('Επαναφορά'), txt.slice(0, 500));
    ok(scn, 'fidelity: title «Διαγραφή παραγγελίας #N-T111;»; the one-order cycle empties — no «ο κύκλος μένει»',
      (await bText(page, `${D} .wi4-dlg-t`)) === 'Διαγραφή παραγγελίας #N-T111;' && !txt.includes('ο κύκλος μένει'), txt.slice(0, 500));
    ok(scn, 'an empty reason keeps «Διαγραφή» disabled (bad_input never reaches the Worker)', (await bOff(page, `${D} [data-act="confirm"]`)) === true);
    await page.fill(`${D} textarea[data-field]`, 'rig λόγος').catch(() => {});
    await bClick(page, `${D} [data-act="confirm"]`);
    const c2 = bCalls(S, 'POST', P);
    ok(scn, '«Διαγραφή» → {nat_order_id, reason, confirm_token}', c2.length === 2 && c2[1].raw === '{"nat_order_id":3111,"reason":"rig λόγος","confirm_token":"tokD"}', c2.map((x) => x.raw));
    ok(scn, '409 writes_closed → the preview strip in the list', (await bText(page, `${D} .wn5-strip[data-kind="preview"]`)).includes('rig sentinel writes_closed'));
    await page.context().close();
  }
  { // B · accountant presses it: the Worker's 403 in the card
    const { page } = await bOpen(browser, origin, { role: 'accountant', plan: { ['POST ' + P]: () => planErr(403, 'FORBIDDEN', 'forbidden') } });
    await bMenu(page, 202, 'orders');
    await bClick(page, `${C} [data-act="delete"]`);
    ok(scn, 'accountant: «Διαγραφή παραγγελίας» is there, the 403 strip in the card says the Worker text', (await bText(page, `${C} .wn5-strip[data-kind="forbidden"]`)).includes('rig sentinel forbidden'));
    await page.context().close();
  }
  { // C · not a v5 order: the Worker's words
    const { page } = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => planErr(422, 'PLAN_RULE', 'order_not_v5') } });
    await bMenu(page, 202, 'orders');
    await bClick(page, `${C} [data-act="delete"]`);
    ok(scn, 'order_not_v5 → refusal strip with the Worker text', (await bText(page, `${C} .wn5-strip[data-kind="refusal"]`)).includes('rig sentinel order_not_v5'));
    await page.context().close();
  }
  { // D · a VS on the cycle is the international's order: listed, no card, no delete
    const { page } = await bOpen(browser, origin);
    await bMenu(page, 201, 'orders');
    const txt = await bText(page, C);
    ok(scn, 'a VS of the cycle is listed as the international order, without card or delete', txt.includes('VS-T201') && txt.includes('διεθνής παραγγελία') && !(await bHas(page, `${C} [data-act="delete"]`)), txt.slice(0, 300));
    await page.context().close();
  }
  { // E · Ε-9: an order outside the loaded week is a line, not a card
    const { page } = await bOpen(browser, origin);
    await page.evaluate(() => { WN5Act.orderCard(999999); }).catch(() => {});
    await page.waitForTimeout(200);
    const ev = await bEv(page);
    ok(scn, 'an order not on the loaded board → «σε άλλη εβδομάδα», no card (Ε-9)', ev.some((e) => e.startsWith('toast') && e.includes('σε άλλη εβδομάδα')) && !(await bHas(page, C)), ev);
    await page.context().close();
  }
  { // F · fidelity T18: N-T5132 leaves RT-T204, which keeps N-T5131 / N-T5135 (Figma 2011:10548 / 10556 / 10597)
    const consq = (list) => [200, { ok: true, op: 'plan_delete', dry_run: true, needs_confirm: true, confirm_token: 'tokF', consequences: list }];
    let list = [];
    const { page } = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => consq(list) } });
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    await page.evaluate(() => { WN5Act.orderCard(3132); }).catch(() => {});
    await page.waitForTimeout(200);
    const kv = (k) => page.$$eval(`${C} .wn5-kv`, (rs, key) => rs.filter((e) => e.firstElementChild.innerText === key).map((r) => r.lastElementChild.innerText), k).catch(() => []);
    const fo = await kv('Φορτηγό');
    ok(scn, 'fidelity: owned «Φορτηγό» = «TST-2103 · Driver Test 03 · κύκλος 1» (no trailer, no RT code)', fo.length === 1 && fo[0] === 'TST-2103 · Driver Test 03 · κύκλος 1', fo);
    // every « · » part of a stop line on one line: the window «hh:mm–hh:mm» never splits at the dash
    const parts = await page.$$eval(`${C} .wn5-kv .wn5-np`, (ps) => ps.map((p) => ({ t: p.innerText, n: p.getClientRects().length, ws: getComputedStyle(p).whiteSpace }))).catch(() => []);
    const win = parts.filter((p) => /^\d\d:\d\d–\d\d:\d\d$/.test(p.t));
    ok(scn, 'fidelity: ΣΤΑΣΕΙΣ wrap only between « · » parts — each window one box, nowrap', win.length >= 2 && win.every((p) => p.n === 1 && p.ws === 'nowrap'), parts);
    await bClick(page, `${C} [data-act="delete"]`);
    const t1 = await bText(page, D);
    ok(scn, 'fidelity: RT-T204 keeps other legs and the base sent no rt_cancelled → «η μισθοδοσία δεν αλλάζει · ο κύκλος μένει»',
      t1.includes('η μισθοδοσία δεν αλλάζει · ο κύκλος μένει') && (await bText(page, `${D} .wi4-dlg-t`)) === 'Διαγραφή παραγγελίας #N-T5132;', t1.slice(0, 600));
    await page.context().close();
    // the base says the cycle goes (rt_cancelled): the screen never contradicts it with «μένει»
    list = [{ kind: 'rt_cancelled', rt_id: 204, code: 'RT-T204' }];
    const o2 = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => consq(list) } });
    await o2.page.evaluate(() => { WN5Act.orderCard(3132); }).catch(() => {});
    await o2.page.waitForTimeout(200);
    await bClick(o2.page, `${C} [data-act="delete"]`);
    const t2 = await bText(o2.page, D);
    ok(scn, 'fidelity: with rt_cancelled for RT-T204 → «θα σβηστεί», no «ο κύκλος μένει»', t2.includes('RT-T204 θα σβηστεί') && !t2.includes('ο κύκλος μένει'), t2.slice(0, 600));
    await o2.page.context().close();
  }
}
SCN['delete'] = scnDelete;

// T19 — the Veroia board (Figma 2011:8744, Δ11 2069:8356): one line closed, ≤ 1/3 open, the only place a delivery splits.
async function scnVeroia(browser, origin) {
  const scn = 'veroia';
  const D = bDlg('split');
  const P = '/plan/pieces/split';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const PANEL = '#wn5-hub-panel';
  const pe = [];                                   // page errors of every context A–F, checked once at the end
  { // A · line, panel, stock, the split window, request_reused (re-read before «αποθηκεύτηκε»)
    const { page, S } = await bOpen(browser, origin, { plan: { ['POST ' + P]: (e, St) => {
      const b = bBoard(); b.hub = b.hub.filter((h) => h.piece_id !== 4401); St.board = b;      // the FIRST press was saved
      return planErr(422, 'PLAN_RULE', 'request_reused');
    } } });
    await page.evaluate(() => { const f = WN5.findAfterReuse; WN5.findAfterReuse = function () { window.__ev.push({ k: 'find', a: [] }); return f.apply(this, arguments); }; }).catch(() => {});
    const line = await bText(page, '#wn5-hub');
    ok(scn, 'closed = one line #wn5-hub «ΒΕΡΟΙΑ · … για μοίρασμα · … απόθεμα …», no panel', line.includes('ΒΕΡΟΙΑ') && line.includes('για μοίρασμα') && line.includes('απόθεμα') && !(await bHas(page, PANEL)), line);
    await bClick(page, '#wn5-hub [data-hub="open"]');
    const box = await page.$eval(PANEL, (e) => e.getBoundingClientRect().height).catch(() => null);
    ok(scn, 'open → #wn5-hub-panel at most 1/3 of the window', box !== null && box <= 1080 / 3 + 2, box);
    const txt = await bText(page, PANEL);
    // B1 (owner 28/10): a VS import at Veroia with no truck is a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row AND an item of the panel («ΓΙΑ ΜΟΙΡΑΣΜΑ»)
    ok(scn, 'VS-T118 (hub[], no truck ever) is a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row AND an item of the open panel (B1)', (await bHas(page, PANEL))
      && await bHas(page, `${PANEL} [data-piece="4101"]`) && await bHas(page, '.wn5-row[data-key="wait:4101"]') && await bHas(page, `${PANEL} [data-piece="4401"]`));
    ok(scn, 'sections «ΓΙΑ ΜΟΙΡΑΣΜΑ», «ΑΠΟΘΕΜΑ», «ΦΟΡΤΗΓΑ ΔΕΥ 12/10 · χωρητικότητα» with «27/33»', txt.includes('ΓΙΑ ΜΟΙΡΑΣΜΑ') && txt.includes('ΑΠΟΘΕΜΑ')
      && txt.includes('ΦΟΡΤΗΓΑ ΔΕΥ 12/10 · χωρητικότητα') && txt.includes('27/33'), txt.slice(0, 600));
    const capL2 = await page.$$eval(`${PANEL} [data-line="cap"] .wi4-l2`, (es) => es.map((e) => e.innerText)).catch(() => []);
    ok(scn, 'fidelity: the capacity box line 2 is the driver only (Figma 2011:8786), never «· κύκλος n»', capL2.includes('Driver Test 02') && capL2.every((t) => !t.includes('κύκλος')), capL2);
    const late = await page.$eval(`${PANEL} [data-piece="4302"]`, (e) => ({ t: e.innerText, red: !!e.querySelector('.wn5-late'), dim: !!e.closest('.wn5-dim') || e.classList.contains('wn5-dim'), op: getComputedStyle(e).opacity })).catch(() => null);
    ok(scn, 'stock past its «φεύγει ως» is red «καθυστέρηση», never dimmed', !!late && late.red && /καθυστέρηση/.test(late.t) && !late.dim && late.op === '1', late);
    await bClick(page, `${PANEL} [data-piece="4401"] [data-hub="split"]`);
    const head = await bText(page, D);
    ok(scn, 'the «Σπάσε…» window: «Σπάσε · ΠΕΛΑΤΗΣ Η · 33π», «Σπάσε» off until the parts add up', head.includes('Σπάσε · ΠΕΛΑΤΗΣ Η · 33π') && (await bOff(page, `${D} [data-act="save"]`)) === true, head.slice(0, 300));
    await bPick(page, `${D} select[data-part-target][data-i="0"]`, 'rt:201');
    await page.fill(`${D} input[data-part-pal][data-i="0"]`, '20').catch(() => {});
    await page.fill(`${D} input[data-part-pal][data-i="1"]`, '10').catch(() => {});
    ok(scn, 'a sum that is not 33 («20 + 10 = 30») keeps «Σπάσε» off', (await bText(page, `${D} .wn5-sum`)).includes('20 + 10 = 30') && (await bOff(page, `${D} [data-act="save"]`)) === true);
    await page.fill(`${D} input[data-part-pal][data-i="1"]`, '13').catch(() => {});
    ok(scn, '«20 + 13 = 33 ✓» turns «Σπάσε» on', (await bText(page, `${D} .wn5-sum`)).includes('20 + 13 = 33 ✓') && (await bOff(page, `${D} [data-act="save"]`)) === false);
    await bClick(page, `${D} [data-act="save"]`);
    await page.waitForTimeout(500);
    const c = bCalls(S, 'POST', P);
    const noId = c[0] ? (() => { const o = Object.assign({}, c[0].body); delete o.request_id; return JSON.stringify(o); })() : '';
    ok(scn, 'one POST {piece_id, parts:[{20, target RT-T201, stops}, {13}]} + a uuid v4 request_id', c.length === 1 && UUID.test(c[0].body.request_id || '')
      && noId === '{"piece_id":4401,"parts":[{"pallets":20,"target":{"rt_id":201,"side":"KATHODOS"},"stops":[{"ref":"s2001","stop_id":2001},{"ref":"s2003","stop_id":2003}]},{"pallets":13}]}', c.map((x) => x.raw));
    const ev = await bEv(page);
    const iFind = ev.findIndex((e) => e.startsWith('find'));
    const iOk = ev.findIndex((e) => e.startsWith('toast') && e.includes('Αποθηκεύτηκε'));
    const after = S.plan.findIndex((x) => x.m === 'GET' && x.path === '/plan/board' && S.plan.indexOf(c[0]) < S.plan.indexOf(x));
    ok(scn, 'request_reused → the board is read again BEFORE «Αποθηκεύτηκε», and the panel is open again', iFind >= 0 && iOk > iFind && after > 0 && await bHas(page, PANEL), ev);
    pe.push(...S.pageErrors);
    await page.context().close();
  }
  { // B · «Σε φορτηγό ▾» = the Δ1 window with the piece (S-115)
    const { page, S } = await bOpen(browser, origin);
    await bClick(page, '#wn5-hub [data-hub="open"]');
    await bClick(page, `${PANEL} [data-piece="4301"] [data-hub="truck"]`);
    await bClick(page, `${bDlg('assign')} [data-act="save"][data-cand="rt:201"]`);
    const p = bCalls(S, 'POST', '/plan/legs');
    ok(scn, '«Σε φορτηγό ▾» → the Δ1 window; «Ένωση» → POST /plan/legs {pieces:[{piece_id:4301}]} onto RT-T201', p.length === 1
      && p[0].raw === '{"pieces":[{"piece_id":4301}],"target":{"rt_id":201,"side":"KATHODOS"},"stops":[{"ref":"s2001","stop_id":2001},{"ref":"n4","location_id":4,"side":"KATHODOS","planned_from":"2026-10-13T08:00:00+03:00","planned_to":"2026-10-13T10:00:00+03:00"}]}', p.map((x) => x.raw));
    pe.push(...S.pageErrors);
    await page.context().close();
  }
  { // C · the live 072 hub[] (no Ε-26 keys): the destination is missing, said, and nothing is sent
    const b = bBoard();
    for (const h of b.hub) for (const k of ['nat_to_location_id', 'deliver_from', 'deliver_to', 'load_from', 'load_to']) delete h[k];
    const LONG = 'ΑΓΡΟΤΙΚΟΣ ΣΥΝΕΤΑΙΡΙΣΜΟΣ ΒΕΡΟΙΑΣ ΚΑΙ ΠΕΡΙΧΩΡΩΝ';   // DESIGN.md #6: a company name is never cut
    b.hub.find((h) => h.piece_id === 4401).client = LONG;
    const { page, S } = await bOpen(browser, origin, { board: b });
    // the closed line: no «…»; each name either whole inside the line or wrapped out of sight, never cut (1920 and 1100)
    const cut = async () => page.$eval('#wn5-hub .wn5-hub-names', (c) => {
      const r = c.getBoundingClientRect();
      const bad = [...c.children].filter((s) => { const q = s.getBoundingClientRect(); const inLine = q.top < r.bottom - 1; return inLine && (q.right > r.right + 0.5 || q.left < r.left - 0.5); }).map((s) => s.innerText);
      return { to: getComputedStyle(c).textOverflow, bad, n: c.children.length };
    }).catch((e) => ({ err: String(e) }));
    const c1920 = await cut();
    await page.setViewportSize({ width: 1100, height: 900 }).catch(() => {});
    await page.waitForTimeout(400);                 // the board repaints on resize
    const c1100 = await cut();
    await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => {});
    await page.waitForTimeout(400);
    ok(scn, 'closed line: client names never cut — no ellipsis, each name whole or out of sight (1920, 1100)',
      [c1920, c1100].every((c) => c.n >= 1 && c.to !== 'ellipsis' && Array.isArray(c.bad) && !c.bad.length), { c1920, c1100 });
    await bClick(page, '#wn5-hub [data-hub="open"]');
    const nm = await page.$eval(`${PANEL} [data-piece="4401"] .wn5-hub-c1 > b`, (e) => ({ t: e.innerText, sw: e.scrollWidth, cw: e.clientWidth, to: getComputedStyle(e).textOverflow })).catch(() => null);
    ok(scn, 'open panel: a long client name is shown whole (wraps, no ellipsis, nothing hidden)', !!nm && nm.t.replace(/\s+/g, ' ') === LONG && nm.to !== 'ellipsis' && nm.sw <= nm.cw + 0.5, nm);
    const place = await bText(page, `${PANEL} [data-piece="4301"] .wn5-hub-c1 > span`);
    ok(scn, 'without nat_to_location_id (072 today, Ε-26) the place line says «—», as «παρ. —»', place === '—', place);
    await bClick(page, `${PANEL} [data-piece="4301"] [data-hub="truck"]`);
    ok(scn, 'without the hub destination (072 today, Ε-26): the window says so and «Ένωση» stays off', (await bHas(page, `${bDlg('assign')} [data-place-miss]`))
      && (await bOff(page, `${bDlg('assign')} [data-act="save"][data-cand="rt:201"]`)) === true && bCalls(S, 'POST', '/plan/legs').length === 0);
    pe.push(...S.pageErrors);
    await page.context().close();
  }
  { // D · an empty Veroia board is hidden
    const b = bBoard(); b.hub = [];
    const { page, S } = await bOpen(browser, origin, { board: b });
    ok(scn, 'an empty Veroia board is hidden (no #wn5-hub)', (await bHas(page, '#content > .wi4.wn5[data-state="ok"]')) && !(await bHas(page, '#wn5-hub')));
    pe.push(...S.pageErrors);
    await page.context().close();
  }
  { // E · request_reused that the re-read board does NOT show (another week, a form edited after plan_unknown): the
    //     Worker's strip, «Σπάσε» locked until the window closes, and a second press sends nothing (T11 _send: the
    //     same request_id would be refused again — a dead end, never a loop)
    const { page, S } = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => planErr(422, 'PLAN_RULE', 'request_reused') } });
    await bClick(page, '#wn5-hub [data-hub="open"]');
    await bClick(page, `${PANEL} [data-piece="4401"] [data-hub="split"]`);
    await bPick(page, `${D} select[data-part-target][data-i="0"]`, 'rt:201');
    await page.fill(`${D} input[data-part-pal][data-i="0"]`, '20').catch(() => {});
    await page.fill(`${D} input[data-part-pal][data-i="1"]`, '13').catch(() => {});
    await bClick(page, `${D} [data-act="save"]`);
    await page.waitForTimeout(500);
    // the second press by script, so a locked button cannot make the rig wait: a disabled <button> fires no click
    await page.$eval(`${D} [data-act="save"]`, (b) => b.click()).catch(() => {});
    await page.waitForTimeout(300);
    const strip = await bText(page, `${D} .wn5-strip[data-kind="reused"]`);
    ok(scn, 'request_reused not on the board → the Worker strip, «Σπάσε» locked, and a second press sends nothing', bCalls(S, 'POST', P).length === 1
      && strip.includes('rig sentinel request_reused') && (await bOff(page, `${D} [data-act="save"]`)) === true, { posts: bCalls(S, 'POST', P).length, strip });
    pe.push(...S.pageErrors);
    await page.context().close();
  }
  { // F · rule 3 / decision 44: the window's ONE request_id on every press until a confirmed 200 — 500 plan_unknown,
    //     then a second press (answered 409 writes_closed) carries the same id; a new PlanApi.slot() per press goes red here
    let n = 0;
    const { page, S } = await bOpen(browser, origin, { plan: { ['POST ' + P]: () => (++n === 1 ? planErr(500, 'SERVER', 'plan_unknown') : planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
    await bClick(page, '#wn5-hub [data-hub="open"]');
    await bClick(page, `${PANEL} [data-piece="4401"] [data-hub="split"]`);
    await bPick(page, `${D} select[data-part-target][data-i="0"]`, 'rt:201');
    await page.fill(`${D} input[data-part-pal][data-i="0"]`, '20').catch(() => {});
    await page.fill(`${D} input[data-part-pal][data-i="1"]`, '13').catch(() => {});
    await bClick(page, `${D} [data-act="save"]`);
    await page.waitForTimeout(3500);                // longer than _atRetry's 1 s + 2 s: a resend would show here
    const unk = await bText(page, `${D} .wn5-strip[data-kind="unknown"]`);
    await bClick(page, `${D} [data-act="save"]`);
    await page.waitForTimeout(400);
    const c = bCalls(S, 'POST', P);
    ok(scn, '500 plan_unknown then a second press → two POSTs with the SAME uuid v4 request_id and the same bytes', c.length === 2
      && unk.includes('rig sentinel plan_unknown') && UUID.test(c[0].body.request_id || '') && c[0].body.request_id === c[1].body.request_id && c[0].raw === c[1].raw,
      { unk, raw: c.map((x) => x.raw) });
    pe.push(...S.pageErrors);
    await page.context().close();
  }
  ok(scn, 'no page errors (A–F)', !pe.length, pe);
}

SCN['veroia'] = scnVeroia;


// T23 — ✈ «Εκτύπωση / WhatsApp › Κάθοδος»: the A4 of the KATHODOS only, the WhatsApp text in the clipboard.
// Uses the batch-C kit for its synthetic week and its /plan/* stub (tests/critics/wn5-rig-kit.js).
const KC = require('./wn5-rig-kit.js');
async function scnSheet(browser, origin) {
  const scn = 'sheet';
  const { page, S } = await KC.openApp(browser, origin, { clipboard: true });
  // the print window is a new page: the kit's page.route does not reach it — nothing leaves the machine from it either
  await page.context().route((u) => !u.href.startsWith(origin) && !u.href.includes(KC.HOST) && !u.href.startsWith('about:'), (route) => route.abort());
  const popErr = [];
  page.context().on('page', (p) => { p.on('pageerror', (e) => popErr.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) popErr.push(m.text().slice(0, 300)); }); });
  if (!ok(scn, 'WN5Sheet present', await KC.has(page, 'WN5Sheet'))) { await page.context().close(); return; }
  // T23 adds the last ✈ line: from here the menu is the whole approved list of Figma 2011:8858, in its order, one
  // line per item («›» lines with their submenus, the same label never twice)
  const labels = await page.evaluate(() => (WN5._menuItems ? WN5._menuItems(101) : []).map((x) => x.label + (x.children.length ? ' › ' + x.children.join(' · ') : ''))).catch(() => []);
  ok(scn, '✈ labels = Figma 2011:8858, in order', JSON.stringify(labels) === JSON.stringify(['Άνοιγμα παραγγελιών', 'Ανάθεση / αλλαγή φορτηγού ή συνεργάτη',
    'Νέα παραγγελία σε αυτό το σκέλος › Κάθοδος · Άνοδος', 'Φόρτωση με τοπικό', 'Σπάσιμο παραγγελιών', 'Εκτύπωση / WhatsApp › Κάθοδος · Άνοδος · Όλο το δρομολόγιο',
    'Αντιγραφή πινακίδων', 'Καθαρισμός ανάθεσης']), labels);
  // fidelity T23 (Figma 2011:9284): the ΚΑΘΟΔΟΣ printer stands clear of the «+» (a write control) and of the ΑΝΑΘΕΣΗ
  // tile — 14px / 2px in Figma; it touched both (0 / 0) at 1440 and 1920. Geometry only: opacity does not move it.
  for (const vw of [1920, 1440]) {
    await page.setViewportSize({ width: vw, height: vw === 1920 ? 1080 : 900 });
    const g = await page.evaluate(() => {
      const row = document.querySelector('#content .wn5-row[data-rt="101"]');
      const r = (sel) => { const e = row && row.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
      const plus = r('.wn5-kpal > .wn5-plus'), prt = r('.wn5-kpal > .wn5-prt'), tile = r('.wn5-asg .wi4-box');
      return plus && prt && tile ? { fromPlus: Math.round(prt.left - plus.right), toTile: Math.round(tile.left - prt.right) } : null;
    }).catch(() => null);
    ok(scn, `fidelity @${vw}: ΚΑΘΟΔΟΣ printer ≥12px clear of the «+», ≥2px before ΑΝΑΘΕΣΗ`, !!g && g.fromPlus >= 12 && g.toTile >= 2, g);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.click('#content .wn5-row[data-rt="101"] .wi4-plane').catch(() => {});
  const nOrders = await page.$eval('#wn5-menu [data-item="orders"] .wn5-m-n', (e) => e.textContent).catch(() => null);
  ok(scn, '«Άνοιγμα παραγγελιών» carries the number of the cycle\'s orders', nOrders !== null && /^\d+$/.test(nOrders), nOrders);
  await page.click('#wn5-menu [data-item="sheet"]').catch(() => {});
  const item = await page.$eval('#wn5-menu [data-sub="sheet"]', (e) => !e.hidden && !!e.querySelector('[data-item="sheet-k"]')).catch(() => false);
  ok(scn, '✈ «Εκτύπωση / WhatsApp ›» opens its submenu with «Κάθοδος»', item === true);
  const [pop] = await Promise.all([
    page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
    item ? page.click('#wn5-menu [data-item="sheet-k"]') : page.evaluate(() => WN5Sheet.print(101, 'KATHODOS')),
  ]);
  ok(scn, 'a print window opened', !!pop);
  if (pop) {
    await pop.waitForLoadState().catch(() => {});
    await pop.waitForSelector('.s-stop', { state: 'attached', timeout: 5000 }).catch(() => {});   // written by document.write after open
    const a4 = await pop.evaluate(() => ({ sides: [...document.querySelectorAll('.s-stop')].map((x) => x.dataset.side), body: document.body.innerText }));
    ok(scn, 'the A4 holds the KATHODOS stops only', a4.sides.length === 3 && a4.sides.every((s) => s === 'KATHODOS'), a4.sides);
    ok(scn, 'Veroia only as «Αποθήκη Βέροιας», no price', a4.body.includes('Αποθήκη Βέροιας') && !a4.body.includes('ΒΕΡΟΙΑ TEST') && !/€/.test(a4.body));
    // fidelity T23: TST-2104 has one cycle in the week → «Κύκλος 1» as on the board tile and the ✈ head, never «1/1»
    ok(scn, 'fidelity: the A4 says «Κύκλος 1» for a one-cycle truck, never «1/1»', /· Κύκλος 1\b/.test(a4.body) && !a4.body.includes('1/1'), a4.body.slice(0, 300));
    await pop.close();
  }
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(scn, 'fidelity: WhatsApp line 2 «W.. · κύκλος 1» for a one-cycle truck (board rule, owner 22/10)', /^W\d+ · κύκλος 1$/.test(clip.split('\n')[1] || ''), clip.split('\n')[1]);
  ok(scn, 'the WhatsApp text is in the clipboard, KATHODOS only', clip.startsWith('*TST-2104 · TRL-5102 · Driver Test 01*') && clip.includes('*ΚΑΘΟΔΟΣ*') && !clip.includes('*ΑΝΟΔΟΣ*'), clip.slice(0, 200));
  ok(scn, 'read only: no /plan write', !S.plan.some((x) => x.m !== 'GET'), S.plan.filter((x) => x.m !== 'GET').map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  // the A4 window and the board page: no console error (aborted external fonts aside, «Failed to load resource»)
  const con = S.console.filter((m) => !/^Failed to load resource/.test(m)).concat(popErr);
  ok(scn, 'no console errors (board + print window)', !con.length, con);
  await page.context().close();
}
SCN['sheet'] = scnSheet;

// Whole-frame r4 (critic r4, 28/10), fix round 1 — 1440×900 with the app sidebar OPEN (router default, #content ≈1212px;
// the plan's ≤1600 grid names «1440 with the sidebar open» as a target) and closed. DESIGN.md #6 and plan T5 («No
// text-overflow anywhere: names are never cut»; at 1440 stops wrap to a second line): no stop line, cycle end or
// «Κενό γύρισμα» slot is cut — no «…», a name either fits or wraps (r4 had cut them at ≤1600 for 36px rows; that
// trade-off is the owner's). The points keep the whole stop in title (r4 extra). Also: «Thessaloniki Test» in ΦΟΡΤΩΣΗ on one line (2011:7745 row 5), the
// «↳ Φόρτωση με τοπικό» arrow in the index column (as the ⇄ sub-row), the «Σπάσε…» popover opening to the left of its
// row's buttons so the ΦΟΡΤΗΓΑ capacity column stays seen (2011:8822). Measured row heights are printed (report).
const R4_LINES = `#content .wn5 .wn5-row :is(.wn5-pt > .wi4-l1, .wn5-pt > .wi4-l2, .wn5-end > .wi4-l1, .wn5-end > .wi4-l2, .wn5-gapbox)`;
function r4Measure(sel) {
  const lines = (el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const tops = [];
    for (const x of r.getClientRects()) { if (x.width < 0.5 || x.height < 1) continue; if (!tops.some((t) => Math.abs(t - x.top) < 4)) tops.push(x.top); }
    return tops.length;
  };
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const out = { content: Math.round((document.getElementById('content') || document.body).getBoundingClientRect().width), wrapped: [], cut: [], untitled: [], rows: {} };
  for (const el of document.querySelectorAll(sel)) {
    const n = lines(el), row = el.closest('.wn5-row');
    if (n > 1) out.wrapped.push({ row: row && row.dataset.key, t: norm(el.textContent), lines: n });   // report only: wrapping is allowed
    // never cut (the line's own box, or the slot's inner run): no «…» rule on it, and nothing hidden past its edge
    for (const c of [el, ...el.querySelectorAll(':scope > .wi4-ell')]) {
      const cs = getComputedStyle(c);
      if (cs.textOverflow === 'ellipsis' || (cs.overflowX !== 'visible' && c.scrollWidth > c.clientWidth + 1))
        out.cut.push({ row: row && row.dataset.key, t: norm(c.textContent), to: cs.textOverflow, ws: cs.whiteSpace, sw: c.scrollWidth, cw: c.clientWidth });
    }
  }
  // the r4 extra: each point's title holds its whole first line (who · place)
  for (const p of document.querySelectorAll('#content .wn5 .wn5-row .wn5-pt')) {
    const l1 = p.querySelector(':scope > .wi4-l1');
    if (l1 && !norm(p.title).startsWith(norm(l1.textContent))) out.untitled.push({ t: norm(l1.textContent), title: p.title || null });
  }
  for (const r of document.querySelectorAll('#content .wn5 .wn5-row')) {
    const fl = r.querySelector('.wn5-fl');
    out.rows[r.dataset.key] = { h: Math.round(r.getBoundingClientRect().height), fl: fl ? fl.querySelectorAll('.wn5-pt, .wn5-vh').length : 0,
      tiles: r.querySelectorAll('.wn5-asg .wn5-tile').length, kdLines: r.querySelectorAll('.wn5-kd > *').length };
  }
  out.gaps = [...document.querySelectorAll('#content .wn5 .wn5-row .wn5-gapbox')].map((g) => `${g.closest('.wn5-row').dataset.key} ${Math.round(g.getBoundingClientRect().height)}`);
  return out;
}
SCN.narrow = async (browser, origin) => {
  const scn = 'narrow';
  const pe = [];
  const plainRows = (m) => Object.entries(m.rows).filter(([k, r]) => k.startsWith('rt:') && r.fl <= 1 && r.tiles <= 2);
  for (const sb of ['open', 'collapsed']) {
    // 1 · board (the synthetic week) and the action board (bBoard, the Veroia week)
    for (const [name, open] of [['board', () => openBoard(browser, origin, { board: fixture(), viewport: { width: 1440, height: 900 }, sidebar: sb })],
      ['Veroia board', () => bOpen(browser, origin, { viewport: { width: 1440, height: 900 }, sidebar: sb })]]) {
      const { page, S } = await open();
      await page.waitForTimeout(300);   // the sidebar's 0.22 s transition
      const m = await page.evaluate(r4Measure, R4_LINES).catch((e) => ({ err: String(e), cut: [{}], untitled: [], wrapped: [], rows: {} }));
      // row heights and wrapped lines are the report for the owner's 36px-row-vs-DESIGN.md-#6 question, not a check
      console.log(`  · ${name} 1440 sidebar ${sb}: #content ${m.content}px, rows ${JSON.stringify(Object.fromEntries(Object.entries(m.rows).map(([k, r]) => [k, r.h])))}, slots ${JSON.stringify(m.gaps)}, wrapped lines ${(m.wrapped || []).length}, plain rows >37px ${plainRows(m).filter(([, r]) => r.h > 37).length}/${plainRows(m).length}`);
      ok(scn, `${name} 1440 sidebar ${sb}: no stop line, cycle end or «Κενό γύρισμα» slot is cut — no «…», a name fits or wraps (DESIGN.md #6, plan T5)`, !m.err && !m.cut.length && Object.keys(m.rows).length > 0, m.err || m.cut);
      ok(scn, `${name} 1440 sidebar ${sb}: every point keeps its whole stop in title (extra)`, !m.err && !m.untitled.length, m.untitled);
      // 2 · the outside loading's client on one line beside its number (2011:7745 row 5): RT-T105 «Thessaloniki Test» on
      // the board, RT-T204 «THESSALONIKI TEST» on the Veroia board; Βέροια and its window stay stacked under it (T5 3830)
      {
        const [rt, want] = name === 'board' ? [105, 'Thessaloniki Test'] : [204, 'THESSALONIKI TEST'];
        const t = await page.evaluate((id) => {
          const row = document.querySelector(`#content .wn5-row[data-rt="${id}"]`), l1 = row && row.querySelector('.wn5-fl .wn5-pt .wi4-l1');
          if (!l1) return null;
          const r = document.createRange(); r.selectNodeContents(l1);
          const tops = [];
          for (const x of r.getClientRects()) if (x.width > 0.5 && !tops.some((y) => Math.abs(y - x.top) < 4)) tops.push(x.top);
          const p = l1.closest('.wn5-pt');
          const cs = getComputedStyle(l1);
          return { t: l1.textContent, lines: tops.length, cut: cs.textOverflow === 'ellipsis' || (cs.overflowX !== 'visible' && l1.scrollWidth > l1.clientWidth + 1), title: p ? p.title : null, vh: !!row.querySelector('.wn5-fl .wn5-vh + .wn5-vtime'), h: Math.round(row.getBoundingClientRect().height) };
        }, rt);
        console.log(`  · RT-T${rt} row (${name}, sidebar ${sb}): ${t && t.h}px, ΦΟΡΤΩΣΗ place on ${t && t.lines} line(s)`);
        ok(scn, `${name} 1440 sidebar ${sb}: RT-T${rt} ΦΟΡΤΩΣΗ «${want}» whole — never cut, on one line or wrapped between words; Βέροια and its window still under it`,
          !!t && t.t === want && !t.cut && t.lines >= 1 && t.lines <= 2 && t.vh, t);
      }
      if (name === 'board') {
        // 4 · the local loading sub-row of RT-T103: «↳» in the index column, the text at the ΚΑΘΟΔΟΣ chip column
        const l = await page.evaluate(() => {
          const sub = document.querySelector('#content .wn5-sub[data-key^="local:"]'), row = sub && sub.previousElementSibling;
          const chip = row && row.querySelector('.wn5-kd .wi4-dc'), b = sub && sub.querySelector('.wn5-sub-t > b');
          if (!sub || !chip || !b) return null;
          const ar = sub.querySelector(':scope > .wn5-c-idx > .wn5-hand-ar');
          const t = sub.querySelector('.wn5-sub-t');
          return { ar: ar ? ar.textContent : null, inText: /↳/.test(t.textContent), text: Math.round(b.getBoundingClientRect().left * 10) / 10, chip: Math.round(chip.getBoundingClientRect().left * 10) / 10,
            arX: ar ? Math.round(ar.getBoundingClientRect().left - sub.getBoundingClientRect().left) : null };
        });
        ok(scn, `board 1440 sidebar ${sb}: «↳ Φόρτωση με τοπικό» — the ↳ in the index column (.wn5-hand-ar), the text at the ΚΑΘΟΔΟΣ chip column (±1)`,
          !!l && l.ar === '↳' && !l.inText && Math.abs(l.text - l.chip) <= 1, l);
      }
      if (name === 'Veroia board') {
        // 3 · «Σπάσε…» on ΠΕΛΑΤΗΣ Η: the popover ends at the row's buttons and opens leftwards; ΦΟΡΤΗΓΑ stays seen
        await bClick(page, '#wn5-hub [data-hub="open"]');
        await bClick(page, '#wn5-hub-panel [data-piece="4401"] [data-hub="split"]');
        await page.waitForTimeout(200);
        const p = await page.evaluate(() => {
          const d = document.querySelector('.wi4-dlg[data-wn5="split"]'), r = document.querySelector('#wn5-hub-panel .wn5-hub-r');
          const a = document.querySelector('#wn5-hub-panel [data-piece="4401"] .wn5-hub-a'), b = document.querySelector('#wn5-hub-panel [data-piece="4401"] [data-hub="split"]');
          if (!d || !r || !a || !b) return null;
          const g = d.getBoundingClientRect(), x = (e) => Math.round(e.getBoundingClientRect().left * 10) / 10;
          return { l: Math.round(g.left * 10) / 10, r: Math.round(g.right * 10) / 10, w: Math.round(g.width), top: Math.round(g.top), trucksL: x(r), btnL: x(b),
            btnsR: Math.round(a.getBoundingClientRect().right * 10) / 10, btnB: Math.round(b.getBoundingClientRect().bottom), vw: innerWidth };
        });
        ok(scn, `Veroia board 1440 sidebar ${sb}: the «Σπάσε…» popover ends at the row's buttons (±1) and opens to their left, its right ≤ the ΦΟΡΤΗΓΑ column's left, inside the window`,
          !!p && Math.abs(p.r - p.btnsR) <= 1 && p.l < p.btnL && p.r <= p.trucksL && p.l >= 8 && p.r <= p.vw - 8 && p.top >= p.btnB, p);
        await page.keyboard.press('Escape');
      }
      pe.push(...S.pageErrors);
      await page.context().close();
    }
  }
  ok(scn, 'no page errors', !pe.length, pe);
};
// ── scenarios end (each Task adds its own above this line) ──

// ── fixture check (T4): plain node, no browser ──
// The synthetic week every scenario serves (tests/fixtures/wn5-week.json). Its SHAPE is held to 072 plan_board by
// tests/wn5-logic.test.js; here the rig holds its DATA: invented names only (public repo), the flags of the base's
// per-day rule at the rig's clock (else the dim scenario would test the fixture, not the screen), and every case
// the scenarios need present.
function fixture072() { return JSON.parse(fs.readFileSync(path.join(WT, 'tests/fixtures/wn5-week.json'), 'utf8')); }
// From day L (F5 FE-2) the board is 074a's: every hub[] item carries the Ε-26 window keys. They come here with null
// (no window on the stop: «—», as the fixture painted before), so every scenario sees the 074a shape and the same
// screen; the 072 shape (keys absent) is a shape error, which SCN.paint proves on fixture072().
function fixture() {
  const b = fixture072();
  for (const h of b.hub) for (const k of ['load_from', 'load_to', 'deliver_from', 'deliver_to']) if (!(k in h)) h[k] = null;
  return b;
}
function checkFixture() {
  const scn = 'fixture';
  const before = fails;
  const F = fixture();
  const today = NOW.slice(0, 10);
  const athensDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const stops = F.cycles.flatMap((c) => c.stops);
  const legs = stops.flatMap((s) => s.legs);
  const uniq = (xs) => new Set(xs).size === xs.length;
  ok(scn, 'week = the W42 Saturday, the rig clock inside it', F.week === WEEK && today >= WEEK && today <= '2026-10-16', { week: F.week, today });
  ok(scn, 'cycle, stop, waiting/hub piece and notice ids are unique', uniq(F.cycles.map((c) => c.rt_id)) && uniq(stops.map((s) => s.stop_id))
    && uniq([...F.waiting, ...F.hub].map((w) => w.piece_id)) && uniq(F.notices.map((n) => n.id)));
  const byLeg = {};
  legs.forEach((l) => { (byLeg[l.leg_id] = byLeg[l.leg_id] || []).push(l.act); });
  const badLegs = Object.entries(byLeg).filter(([, a]) => a.filter((x) => x === 'load').length !== 1 || a.filter((x) => x === 'unload').length > 1);
  ok(scn, 'every leg is loaded once and unloaded at most once', !badLegs.length, badLegs);
  const plates = F.cycles.flatMap((c) => [c.truck, c.trailer]).filter(Boolean);
  ok(scn, 'plates are invented (TST/TRL-nnnn)', plates.every((p) => /^(TST|TRL)-\d{4}$/.test(p)), plates.filter((p) => !/^(TST|TRL)-\d{4}$/.test(p)));
  const drivers = [...F.cycles.map((c) => c.driver), ...stops.map((s) => s.local_loading && s.local_loading.driver)].filter(Boolean);
  ok(scn, 'drivers are «Driver Test NN»', drivers.every((d) => /^Driver Test \d{2}$/.test(d)), drivers);
  const clients = [...legs.map((l) => l.client), ...F.waiting.map((w) => w.client), ...F.hub.map((h) => h.client)];
  ok(scn, 'clients «ΠΕΛΑΤΗΣ <letter>», partners «Partner Test …», places «… Test»',
    clients.every((x) => /^ΠΕΛΑΤΗΣ [Α-Ω]$/.test(x)) && F.cycles.filter((c) => c.partner).every((c) => /^Partner Test /.test(c.partner))
    && stops.every((s) => /^(ΒΕΡΟΙΑ TEST|[A-Z][a-z]+ Test)$/.test(s.location)), { clients: [...new Set(clients)], places: [...new Set(stops.map((s) => s.location))] });
  ok(scn, 'no e-mail, phone or VAT-looking strings', !/@[a-z0-9-]+\.[a-z]{2,}|\+30|\b69\d{8}\b|\bEL\d{9}\b/i.test(JSON.stringify(F)));
  // 071 v_rt_stop_state at the rig's «now»: executed = the Athens day of planned_to has passed; dim = executed ∧
  // has_vehicle ∧ ¬has_late; side_dim / cycle_dim = every stop of the side / cycle dim.
  const bad = [];
  for (const c of F.cycles) {
    const hv = c.trip_type === 'OWNED' ? c.truck_id != null : c.partner_id != null;
    for (const s of c.stops) {
      const day = athensDay(s.planned_to), exe = day < today;
      if (s.stop_day !== day || s.executed !== exe || s.has_vehicle !== hv || s.dim !== (exe && hv && !s.has_late)) bad.push(s.stop_id);
    }
    for (const side of ['KATHODOS', 'ANODOS']) {
      const ss = c.stops.filter((s) => s.side === side);
      if (ss.some((s) => s.side_dim !== ss.every((x) => x.dim))) bad.push(`${c.rt_id}/${side}`);
    }
    if (c.stops.some((s) => s.cycle_dim !== c.stops.every((x) => x.dim))) bad.push(c.rt_id);
  }
  ok(scn, 'stop_day / executed / dim / side_dim / cycle_dim follow the base rule at the rig clock', !bad.length, bad);
  const WN5L = require(path.join(WT, 'core/wn5-logic.js'));
  const m = WN5L.model(F, { today });
  // Where a piece lives is the base's rule, not the fixture's choice: waiting[] = «waiting and not at_hub»
  // (072:2443) — nothing standing at the hub; hub[] = v_hub_bucket (071:470) with its keys only (no Ε-26 keys).
  ok(scn, 'waiting[] holds no piece standing at the hub (072:2443): an import VS no truck took is in hub[]',
    F.waiting.every((w) => w.position_location_id !== m.hubId && w.kind !== 'vs_import'), F.waiting.map((w) => [w.piece_id, w.kind, w.position_location_id]));
  ok(scn, 'hub[] items carry the v_hub_bucket keys only (no nat_to_location_id / load_* / deliver_*: Ε-26)',
    F.hub.every((h) => !['nat_to_location_id', 'load_from', 'load_to', 'deliver_from', 'deliver_to', 'position_location_id'].some((k) => k in h)));
  // overdue is the base's (071 v_piece_state: waiting ∧ coalesce(leave_by, nat_due_day) < today): a «late» piece the
  // base cannot produce would let the red point and the queue reason 'late' pass on impossible data.
  const badOver = [...F.waiting, ...F.hub].filter((w) => { const d = w.leave_by || w.nat_due_day; return w.overdue !== (d != null && d < today); })
    .map((w) => [w.piece_id, w.reference, w.leave_by, w.nat_due_day, w.overdue]);
  ok(scn, 'overdue = coalesce(leave_by, nat_due_day) < today on every waiting[] / hub[] piece (071 v_piece_state)', !badOver.length, badOver);
  // inbound_rt_id is the cycle that last unloaded the piece (or its split parent) at the hub: a cycle of THIS board
  // named there must show that order's unload at the hub.
  const badIn = F.hub.filter((h) => {
    const c = h.inbound_rt_id != null && F.cycles.find((x) => x.rt_id === h.inbound_rt_id);
    return c && !c.stops.some((s) => s.location_id === m.hubId && s.legs.some((l) => l.act === 'unload'
      && (h.order_id != null ? l.order_id === h.order_id : l.nat_order_id === h.nat_order_id)));
  }).map((h) => [h.piece_id, h.reference, h.inbound_rt_id]);
  ok(scn, 'a hub[] inbound_rt_id naming a cycle of the board has that order\'s unload at the hub on it', !badIn.length, badIn);
  const CASES = {
    'Veroia loading on ΚΑΘΟΔΟΣ (time under «Βέροια»)': () => F.cycles.some((c) => c.stops[0].side === 'KATHODOS' && c.stops[0].location_id === m.hubId),
    'ΑΝΟΔΟΣ-only cycle («Χωρίς κάθοδο»)': () => F.cycles.some((c) => c.stops.every((s) => s.side === 'ANODOS')),
    'own cycle without ΑΝΟΔΟΣ («Κενό γύρισμα»)': () => F.cycles.some((c) => c.trip_type === 'OWNED' && c.truck_id != null && c.stops.every((s) => s.side === 'KATHODOS')),
    'partner without a rate («κόμιστρο λείπει»)': () => F.cycles.some((c) => c.trip_type === 'PARTNER' && c.partner_rate == null),
    'a late stop (has_late)': () => stops.some((s) => s.has_late),
    'a local loading («Φόρτωση με τοπικό»)': () => stops.some((s) => s.local_loading),
    'a cycle without a vehicle': () => F.cycles.some((c) => c.trip_type === 'OWNED' && c.truck_id == null),
    'two cycles of one truck («1/2», «2/2»)': () => [...WN5L.cycleNumbers(F.cycles).values()].some((x) => x.m === 2),
    'loading outside Veroia and at Veroia on one ΚΑΘΟΔΟΣ': () => F.cycles.some((c) => { const k = c.stops.filter((s) => s.side === 'KATHODOS'); return k.length > 1 && k[0].location_id !== m.hubId && k.some((s) => s.location_id === m.hubId); }),
    'a whole cycle executed (row dimmed)': () => F.cycles.some((c) => c.stops.every((s) => s.cycle_dim)),
    'loaded before today, delivering today (head dimmed only)': () => F.cycles.some((c) => c.stops.some((s) => s.dim) && c.stops.some((s) => !s.dim && s.stop_day === today)),
    'a VS waiting with two deliveries (one row)': () => m.days.flatMap((d) => d.rows).some((r) => r.kind === 'unassigned' && r.pieceIds.length > 1),
    'a VS no truck took, in hub[] (live 072 shape)': () => F.hub.some((h) => h.kind === 'vs_import' && h.is_stock !== true && h.inbound_rt_id == null),
    'a late VS (overdue)': () => [...F.waiting, ...F.hub].some((w) => String(w.kind).startsWith('vs_') && w.overdue),
    'a hub[] VS without nat_ready_day (cross_dock_date empty: its day is nat_due_day − 1)': () => F.hub.some((h) => h.kind === 'vs_import' && h.nat_ready_day == null && h.nat_due_day != null),
    'a national waiting load (price key)': () => F.waiting.some((w) => w.kind === 'national' && 'price' in w),
    'stock overdue at the hub': () => F.hub.some((h) => h.is_stock && h.overdue),
    'a split candidate at the hub (unloaded there by a cycle)': () => F.hub.some((h) => !h.is_stock && h.inbound_rt_id != null),
    'two notices, sentinel texts': () => F.notices.length === 2 && F.notices.every((n) => /^rig sentinel notice \d+$/.test(n.message)),
    'an empty day inside the week («καμία φόρτωση»)': () => m.days.some((d) => d.empty),
  };
  for (const [name, fn] of Object.entries(CASES)) ok(scn, 'case: ' + name, fn());
  ok(scn, 'the model draws it without a shape error', !m.errors.length, m.errors);
  console.log(fails === before ? '\nFIXTURE GO: every case is in the week' : `\nFIXTURE NO-GO: ${fails - before} check(s) failed`);
  return fails === before;
}
// Live W45 (28/10, the first day of the v5 board): the shape plan_board sends today — VS pieces with ids for their
// places and no windows (074a), three vs_export waiting for a ΑΝΟΔΟΣ to Veroia, four vs_import at the hub. The six
// owner-approved fixes of 28/10, each a check that is ✗ on the main of that morning (eea29d62).
function live45() {
  const base = { load_from: null, load_to: null, deliver_from: null, deliver_to: null, overdue: false, is_stock: false, leave_by: null,
    reference: null, nat_order_id: null, pallet_exchange: true, temperature_c: null };
  const ex = (o) => Object.assign({}, base, { kind: 'vs_export', nat_to_location_id: 1, nat_ready_day: '2026-10-10', nat_due_day: '2026-10-11' }, o, { position_location_id: o.nat_from_location_id });
  const im = (o) => Object.assign({}, base, { kind: 'vs_import', for_split: false, inbound_rt_id: null, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13' }, o);
  return { week: WEEK, cycles: [], notices: [],
    waiting: [ex({ piece_id: 19, shipment_id: 19, order_id: 607, order_stop_id: 2112, client_id: 41, client: 'ΠΕΛΑΤΗΣ ΕΞ 1', pallets: 33, nat_from_location_id: 8 }),
      ex({ piece_id: 20, shipment_id: 20, order_id: 616, order_stop_id: 2141, client_id: 42, client: 'ΠΕΛΑΤΗΣ ΕΞ 2', reference: 'EX-616', pallets: 24, temperature_c: 7, nat_from_location_id: 6 }),
      ex({ piece_id: 21, shipment_id: 21, order_id: 616, order_stop_id: 2142, client_id: 42, client: 'ΠΕΛΑΤΗΣ ΕΞ 2', reference: 'EX-616', pallets: 8, temperature_c: 7, nat_from_location_id: 8 })],
    hub: [im({ piece_id: 15, shipment_id: 15, order_id: 603, order_stop_id: 2091, client_id: 43, client: 'ΠΕΛΑΤΗΣ ΕΙ 1', pallets: 30, nat_ready_day: '2026-10-11', nat_due_day: '2026-10-12', nat_to_location_id: 2 }),
      im({ piece_id: 16, shipment_id: 16, order_id: 604, order_stop_id: 2096, client_id: 44, client: 'ΠΕΛΑΤΗΣ ΕΙ 2', reference: 'IM-604', pallets: 11, temperature_c: 4, nat_to_location_id: 3 }),
      im({ piece_id: 17, shipment_id: 17, order_id: 604, order_stop_id: 2097, client_id: 44, client: 'ΠΕΛΑΤΗΣ ΕΙ 2', reference: 'IM-604', pallets: 6, temperature_c: 4, nat_to_location_id: 4 }),
      im({ piece_id: 18, shipment_id: 18, order_id: 604, order_stop_id: 2098, client_id: 44, client: 'ΠΕΛΑΤΗΣ ΕΙ 2', reference: 'IM-604', pallets: 15, temperature_c: 4, nat_to_location_id: 5 })] };
}
const liveRows = (page) => page.evaluate(() => [...document.querySelectorAll('#content .wn5 .wn5-row[data-piece]')].map((r) => {
  const t = (sel) => { const e = r.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  // the shown points' titles + the «+N» title (the folded ones, one per line): every point of the cell
  const pts = (sel) => [...r.querySelectorAll(sel + ' .wn5-pt')].map((p) => p.getAttribute('title') || '')
    .concat([...r.querySelectorAll(sel + ' .wi4-more')].flatMap((m) => (m.getAttribute('title') || '').split('\n')));
  return { piece: r.dataset.piece, ksp: t('.wn5-kspan'), asp: t('.wn5-aspan'), kgap: !!r.querySelector('.wn5-kspan .wn5-gapbox'), agap: !!r.querySelector('.wn5-aspan .wn5-gapbox'), kto: t('.wn5-kto'), afl: t('.wn5-afl'), ato: t('.wn5-ato'), asg: t('.wn5-asg'), kpts: pts('.wn5-kto'), apts: pts('.wn5-afl'), tpts: pts('.wn5-ato'), text: r.textContent.replace(/\s+/g, ' ') };
}));
SCN.live45 = async (browser, origin) => {
  const scn = 'live45';
  const { page, S } = await openBoard(browser, origin, { board: live45() });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  const rows = await liveRows(page);
  const by = (p) => rows.find((r) => r.piece === String(p)) || {};
  // 1 · place names from GET /plan/lookups (the page never read it: every place «—»)
  ok(scn, '1 · the board reads GET /plan/lookups once beside the board', (S.lookups || 0) === 1, S.lookups);
  ok(scn, '1 · VS import 604: its three deliveries name their places (Aspropyrgos / Oinofyta / Larisa), never «—»',
    ['Aspropyrgos Test', 'Oinofyta Test', 'Larisa Test'].every((n) => (by(16).kpts || []).some((x) => x.includes(n) && x.endsWith('ΠΕΛΑΤΗΣ ΕΙ 2'))) && !(by(16).kpts || []).some((x) => /^(\d+\. )?— /.test(x)), by(16).kpts);
  ok(scn, '1 · VS import 603: «Rentis Test …», not «— · 30π»', (by(15).kpts || []).some((x) => x.startsWith('Rentis Test')), by(15).kpts);
  // 2 · ΑΝΟΔΟΣ (vs_export): the supplier's place in ΦΟΡΤΩΣΗ, «Βέροια» in ΠΡΟΣ
  ok(scn, '2 · VS export 607: ΦΟΡΤΩΣΗ names the supplier place (Lamia Test), ΠΡΟΣ = «Βέροια»',
    (by(19).apts || []).some((x) => x.startsWith('Lamia Test')) && /Βέροια/.test(by(19).ato || ''), { afl: by(19).apts, ato: by(19).ato });
  ok(scn, '2 · VS export 616: two loading places (Thessaloniki Test, Lamia Test), ΠΡΟΣ «Βέροια»',
    ['Thessaloniki Test', 'Lamia Test'].every((n) => (by(20).apts || []).some((x) => x.includes(n)) || /\+1/.test(by(20).afl || '')) && /Βέροια/.test(by(20).ato || ''), { afl: by(20).apts, ato: by(20).ato });
  // 3 · a waiting row of one side (owner 28/10): the box names its side, the empty side is the dashed slot of H1 RT-T106/T107
  ok(scn, '3 · VS export 607 / 616: dashed «Χωρίς κάθοδο», box «ΠΡΟΣ ΑΝΑΘΕΣΗ / ΑΝΟΔΟΣ →»; VS import 603 / 604: box «← ΚΑΘΟΔΟΣ», dashed «Χωρίς άνοδο»',
    [19, 20].every((p) => by(p).asg === 'ΠΡΟΣ ΑΝΑΘΕΣΗΑΝΟΔΟΣ →' && by(p).ksp === 'Χωρίς κάθοδο' && by(p).kgap)
    && [15, 16].every((p) => by(p).asg === 'ΠΡΟΣ ΑΝΑΘΕΣΗ← ΚΑΘΟΔΟΣ' && by(p).asp === 'Χωρίς άνοδο' && by(p).agap),
    [19, 20, 15, 16].map((p) => ({ p, asg: by(p).asg, ksp: by(p).ksp, asp: by(p).asp, kgap: by(p).kgap, agap: by(p).agap })));
  // 4 · temperature as the driver sheet writes it, only where the base has one
  ok(scn, '4 · temperature: «+7 °C» on export 616, «+4 °C» on import 604, none on 603 / 607',
    /\+7 °C/.test(by(20).text || '') && /\+4 °C/.test(by(16).text || '') && !/°C/.test(by(15).text || '') && !/°C/.test(by(19).text || ''), { e616: by(20).text, i604: by(16).text });
  // 6 · the queue counts with nouns: 4 VS orders, 7 pieces
  const qh = await page.evaluate(() => { const h = document.querySelector('#content .wn5 .wn5-q .wi4-q-hd'); const a = document.querySelector('#content .wn5 .wn5-q .wi4-q-all'); return { h: h ? h.textContent.replace(/\s+/g, ' ').trim() : '', a: a ? a.textContent.trim() : '' }; });
  ok(scn, '6 · «ΕΠΟΜΕΝΑ · 4 · 7 κομμάτια» (B-7, owner 28/10), the link «Όλες οι 4 ▾»', /^ΕΠΟΜΕΝΑ · 4 · 7 κομμάτια/.test(qh.h) && qh.a === 'Όλες οι 4 ▾', qh);
  // 5 · days always open: no chevron on an empty day, an open one on a day with rows
  const days = await page.evaluate(() => [...document.querySelectorAll('#content .wn5 .wn5-day')].map((d) => ({ date: d.dataset.date, empty: d.classList.contains('empty'), chev: !!d.querySelector('.wi4-chev'), open: d.querySelector('.wn5-dayh').getAttribute('aria-expanded') })));
  ok(scn, '5 · W45-like week: empty days draw no chevron, days with rows are open', days.length === 7 && days.every((d) => (d.empty ? !d.chev : d.chev && d.open === 'true')), days);
  ok(scn, 'no shape strip, no catalogue strip', !(await page.$('#content .wn5 .wn5-strip')), await page.evaluate(() => [...document.querySelectorAll('#content .wn5 .wn5-strip')].map((e) => e.textContent)));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await shot(page, 'live45');
  await page.context().close();
  // 5 · a week with no load at all (W44 before L): no day looks folded
  const e = await openBoard(browser, origin, { board: EMPTY(WEEK) });
  const ed = await e.page.evaluate(() => [...document.querySelectorAll('#content .wn5 .wn5-day')].map((d) => !!d.querySelector('.wi4-chev')));
  ok(scn, '5 · an empty week (W44): no «›» on any day', ed.length === 7 && ed.every((c) => !c), ed);
  await e.page.context().close();
  // 1 · the catalogue fails: the rows still paint, places «—», and a strip says why (never a silent «—»)
  const f = await openBoard(browser, origin, { board: live45(), plan: { 'GET /plan/lookups': () => planErr(500, 'SERVER', 'plan_failed') } });
  await f.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  const fs1 = await f.page.evaluate(() => { const st = document.querySelector('#content .wn5 .wn5-strip[data-ids="failed"]'); return { strip: st ? st.textContent.replace(/\s+/g, ' ') : null, rows: document.querySelectorAll('#content .wn5 .wn5-row').length }; });
  ok(scn, '1 · lookups 500 → «ΟΝΟΜΑΤΑ ΤΟΠΩΝ» strip with the Worker message, the 4 rows still painted', !!fs1.strip && /ΟΝΟΜΑΤΑ ΤΟΠΩΝ/.test(fs1.strip) && /rig sentinel plan_failed/.test(fs1.strip) && fs1.rows === 4, fs1);
  // a failed catalogue is not asked again on every reload (each save reloads the board): only the user's ↻ asks at once
  const nL = () => f.S.plan.filter((x) => x.m === 'GET' && x.path === '/plan/lookups').length;
  const l0 = nL();
  await f.page.evaluate(() => WN5.reload('write'));
  await f.page.waitForTimeout(400);
  const l1 = nL();
  await f.page.evaluate(() => WN5.reload('user'));
  await f.page.waitForTimeout(400);
  const l2 = nL();
  ok(scn, '1 · after a failure: a write\'s reload does not ask the catalogue again, the user\'s ↻ does', l0 === 1 && l1 === 1 && l2 === 2, { l0, l1, l2 });
  await f.page.context().close();
};
// Live F6 (28/10, real-user test): a national order waiting for a vehicle had no way to its card (edit / delete) — only
// a cycle's ✈ «Άνοιγμα παραγγελιών» opened it. And 075's waiting[].direction: a national whose ends are both outside
// the hub goes on its own direction's side, on the board AND in the assignment window (one rule, WN5L.waitSide).
SCN['live-f6'] = async (browser, origin) => {
  const scn = 'live-f6';
  const b = live45();
  const nat = (o) => Object.assign({ kind: 'national', order_id: null, overdue: false, is_stock: false, leave_by: null, pallet_exchange: false, temperature_c: null,
    load_from: null, load_to: null, deliver_from: null, deliver_to: null, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-12', price: null }, o);
  b.waiting.push(nat({ piece_id: 31, shipment_id: 31, nat_order_id: 17, client_id: 45, client: 'ΠΕΛΑΤΗΣ ΕΘ 17', pallets: 10, nat_from_location_id: 6, nat_to_location_id: 2, position_location_id: 6 }));
  b.waiting.push(nat({ piece_id: 32, shipment_id: 32, nat_order_id: 18, client_id: 46, client: 'ΠΕΛΑΤΗΣ ΕΘ 18', pallets: 12, nat_from_location_id: 5, nat_to_location_id: 3, position_location_id: 5, direction: 'ANODOS' }));
  const { page, S } = await openBoard(browser, origin, { board: b });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const row = (p) => document.querySelector(`#content .wn5 .wn5-row[data-piece="${p}"]`);
    const plane = (p) => !!(row(p) && row(p).querySelector('.wn5-c-idx .wi4-plane[data-act="ocard"]'));
    return { n17: plane(31), n18: plane(32), vs: plane(20) || plane(15),
      d18: row(32) ? { kpts: row(32).querySelectorAll('.wn5-kto .wn5-pt, .wn5-fl .wn5-pt').length, apts: row(32).querySelectorAll('.wn5-afl .wn5-pt').length } : null,
      d17: row(31) ? { kpts: row(31).querySelectorAll('.wn5-kto .wn5-pt').length, apts: row(31).querySelectorAll('.wn5-afl .wn5-pt').length } : null,
      side18: typeof WN5Act !== 'undefined' && WN5Act._kit && WN5Act._kit.sideFor ? WN5Act._kit.sideFor((WN5.state().board.waiting || []).find((x) => x.piece_id === 32)) : null };
  });
  ok(scn, 'F6 · a waiting national order (#17, #18) has the ✈ of its card; a VS row has none (the Weekly International owns it)', r.n17 && r.n18 && !r.vs, r);
  await page.click('#content .wn5 .wn5-row[data-piece="31"] .wi4-plane[data-act="ocard"]').catch(() => {});
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => { const d = document.querySelector('.wi4-dlg.wn5-ocard'); return d ? { t: d.querySelector('.wi4-dlg-hd').textContent.replace(/\s+/g, ' '), edit: !!d.querySelector('[data-act="edit"]'), del: !!d.querySelector('[data-act="delete"]') } : null; });
  ok(scn, 'F6 · ✈ opens the order card of #17 with «Επεξεργασία» and «Διαγραφή παραγγελίας»', !!card && /ΠΕΛΑΤΗΣ ΕΘ 17/.test(card.t) && card.edit && card.del, card);
  ok(scn, '075 · #18 (Thessaloniki → Aspropyrgos, direction ANODOS) sits on ΑΝΟΔΟΣ; #17 (no direction) on ΚΑΘΟΔΟΣ as before',
    !!r.d18 && r.d18.apts >= 1 && r.d18.kpts === 0 && !!r.d17 && r.d17.kpts >= 1 && r.d17.apts === 0, { d17: r.d17, d18: r.d18 });
  ok(scn, '075 · the assignment window takes the same side (WN5Act._kit.sideFor = ANODOS for #18)', r.side18 === 'ANODOS', r.side18);
  ok(scn, 'nothing written: only the board read on /plan/*', S.plan.every((x) => x.m === 'GET'), S.plan.map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
};
// Live F11 / F7 / F12 (28/10, real-user test): a save whose board read fails must say the save happened and mark the
// rows old (never «ΣΦΑΛΜΑ» alone, an invitation to assign twice); «Ανάθεση · #17 → …» when an order has no reference;
// the Veroia window the order already has fills Δ1's field; the order card shows the price / PE the legs carry (074)
// and does not repeat the client under each delivery.
SCN['live-f11'] = async (browser, origin) => {
  const scn = 'live-f11';
  const b = live45();
  b.waiting.push({ piece_id: 31, shipment_id: 31, kind: 'national', nat_order_id: 17, order_id: null, client_id: 45, client: 'ΠΕΛΑΤΗΣ ΕΘ 17', reference: null, pallets: 10,
    nat_from_location_id: 6, nat_to_location_id: 2, position_location_id: 6, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-12', overdue: false, is_stock: false,
    leave_by: null, pallet_exchange: false, temperature_c: null, price: 1, load_from: '2026-10-12T08:00:00+03:00', load_to: '2026-10-12T10:00:00+03:00', deliver_from: '2026-10-12T14:00:00+03:00', deliver_to: '2026-10-12T16:00:00+03:00' });
  b.hub.push({ piece_id: 33, shipment_id: 33, kind: 'national', nat_order_id: 19, order_id: null, client_id: 47, client: 'ΠΕΛΑΤΗΣ ΕΘ 19', reference: 'N-19', pallets: 9,
    nat_to_location_id: 4, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-12', overdue: false, is_stock: false, for_split: false, inbound_rt_id: null, leave_by: null,
    pallet_exchange: true, temperature_c: null, load_from: '2026-10-12T07:00:00+03:00', load_to: '2026-10-12T09:30:00+03:00', deliver_from: '2026-10-12T15:00:00+03:00', deliver_to: '2026-10-12T17:00:00+03:00' });
  let boards = 0;
  const plan = { 'GET /plan/board': (e) => (++boards === 2 ? planErr(503, 'SLOW', 'slow') : [200, Object.assign(clone(b), { week: e.q.week })]) };
  const { page, S } = await openBoard(browser, origin, { board: b, plan });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  // F7 · the Δ1 title of #17 (no reference)
  await page.click('#content .wn5 .wn5-row[data-piece="31"] .wi4-box.un').catch(() => {});
  await page.waitForTimeout(700);
  const t17 = await page.evaluate(() => { const d = document.querySelector('.wi4-dlg .wi4-dlg-t'); return d ? d.textContent : null; });
  ok(scn, 'F7 · «Ανάθεση · #17 → Rentis Test» — the order number when there is no reference, never «— →»', !!t17 && /^Ανάθεση · #17 → Rentis Test/.test(t17), t17);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // F12 · the Veroia window of #19 (a national loading at Veroia, its shipment 07:00–09:30) fills Δ1's field
  await page.click('#content .wn5 .wn5-row[data-piece="33"] .wi4-box.un').catch(() => {});
  await page.waitForTimeout(700);
  const hw = await page.evaluate(() => { const f = document.querySelector('.wi4-dlg [data-hub="from"]'), t = document.querySelector('.wi4-dlg [data-hub="to"]'); return f && t ? [f.value, t.value, f.disabled || t.disabled] : null; });
  ok(scn, 'F12 · Δ1 «Παράθυρο φόρτωσης Βέροιας» of #19 = 07:00 – 09:30 from its shipment, still editable', !!hw && hw[0] === '07:00' && hw[1] === '09:30' && !hw[2], hw);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // F11 · a save's board read fails (503): the strip says it was saved, the rows are marked old, «Ανανέωση» clears it
  await page.evaluate(() => WN5.reload('save'));
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => { const r = document.querySelector('#content .wn5'); const x = r && r.querySelector('.wn5-strip[data-stale]'); return { stale: r && r.dataset.stale, strip: x ? x.textContent.replace(/\s+/g, ' ') : null, rows: document.querySelectorAll('#content .wn5 .wn5-row').length, op: getComputedStyle(document.getElementById('wn5-rows')).opacity }; });
  ok(scn, 'F11 · a failed read after a save: «ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ», «μην την ξανακάνεις», rows kept and dimmed',
    st.stale === '1' && !!st.strip && /ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ/.test(st.strip) && /μην την ξανακάνεις/.test(st.strip) && /rig sentinel slow/.test(st.strip) && st.rows > 0 && Number(st.op) < 1, st);
  await page.evaluate(() => WN5.reload('user'));
  await page.waitForTimeout(400);
  const st2 = await page.evaluate(() => ({ stale: (document.querySelector('#content .wn5') || {}).dataset ? document.querySelector('#content .wn5').dataset.stale || null : null, strip: !!document.querySelector('#content .wn5 .wn5-strip[data-stale]') }));
  ok(scn, 'F11 · «Ανανέωση» that reads the board clears the stale mark', !st2.stale && !st2.strip, st2);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
  // F12 · the card of an ASSIGNED order (from a cycle): price and PE from its legs (074), no client under the delivery
  const fx = fixture();
  for (const c of fx.cycles) for (const s0 of c.stops) for (const l of s0.legs) if (l.nat_order_id === 3001) Object.assign(l, { price: 1, pallet_exchange: false });
  const c2 = await openBoard(browser, origin, { board: fx });
  await c2.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  await c2.page.evaluate(() => WN5Act.orderCard(3001));
  await c2.page.waitForTimeout(400);
  const card = await c2.page.evaluate(() => {
    const d = document.querySelector('.wi4-dlg.wn5-ocard'); if (!d) return null;
    const kv = [...d.querySelectorAll('.wn5-kv')].map((x) => [x.querySelector('span').textContent, x.querySelector('b').textContent.replace(/\s+/g, ' ')]);
    return kv;
  });
  const val = (k) => (card || []).filter((x) => x[0] === k).map((x) => x[1]);
  ok(scn, 'F12 · assigned order card: «Τιμή 1 € …» and «PE Όχι» from the legs, never «—»', /^1 € \(χωρίς ΦΠΑ\)/.test(val('Τιμή')[0] || '') && val('PE')[0] === 'Όχι', { price: val('Τιμή'), pe: val('PE') });
  ok(scn, 'F12 · «Παράδοση» names the place, the day and the window, not the client again', val('Παράδοση').length > 0 && val('Παράδοση').every((v) => !/ΠΕΛΑΤΗΣ Α/.test(v)), val('Παράδοση'));
  await c2.page.context().close();
};
// B1 (live 28/10, blocker): a VS bridge (hub[] item: destination as nat_to_location_id, NO window — order_stops hold
// dates only) could not be assigned: 072 wants planned_from/to on every new stop and Δ1 had a field only for Veroia.
// Now each window-less stop has its own field on its day, filled with the whole day; the split's «Σε φορτηγό» and
// the «+» take the same whole-day window and say so.
SCN.b1 = async (browser, origin) => {
  const scn = 'b1';
  const lk = DEF_LOOKUPS();
  lk.trucks = [{ id: 14, legacy_id: 'recDEFT14', license_plate: 'TST-2108', active: true }];
  lk.drivers = [{ id: 34, legacy_id: 'recDEFD34', full_name: 'Driver Test 04', active: true }];
  const { page, S } = await openBoard(browser, origin, { board: live45(), lookups: lk });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  await page.click('#content .wn5 .wn5-row[data-piece="15"] .wi4-box.un').catch(() => {});
  await page.waitForTimeout(700);
  const D = '.wi4-dlg';
  const f = await page.evaluate((d) => [...document.querySelectorAll(`${d} [data-stopwin]`)].map((w) => ({ key: w.dataset.stopwin, t: w.textContent.replace(/\s+/g, ' ').trim(), v: [...w.querySelectorAll('input')].map((i) => i.value) })), D);
  ok(scn, 'Δ1 of VS 603: a «Παράδοση Rentis Test · Δευ 12/10 *» window, filled 00:00 – 23:59', f.length === 1 && /^Παράδοση Rentis Test · Δευ 12\/10 \*/.test(f[0].t) && f[0].v.join('|') === '00:00|23:59', f);
  await page.fill(`${D} input[data-hub="from"]`, '08:00', { timeout: 2000 }).catch(() => {});
  await page.fill(`${D} input[data-hub="to"]`, '10:00', { timeout: 2000 }).catch(() => {});
  await page.click(`${D} [data-act="pick"][data-cand="truck:14"]`, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  const off = await page.evaluate((d) => { const b = document.querySelector(`${d} [data-act="save"][data-cand="truck:14"]`); return b ? b.disabled : null; }, D);
  ok(scn, 'with the Veroia window typed, «Ανάθεση» to a new truck is ENABLED (was disabled: «window missing»)', off === false, off);
  await page.click(`${D} [data-act="save"][data-cand="truck:14"]`, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
  const legs = S.plan.filter((x) => x.m === 'POST' && x.path === '/plan/legs');
  const stops = legs[0] && legs[0].body && legs[0].body.stops;
  ok(scn, 'POST /plan/legs: Veroia 08:00–10:00 and the delivery on its day 00:00–23:59 (072 wants a window on every new stop)', !!stops
    && JSON.stringify(stops) === JSON.stringify([{ ref: 'n1', location_id: 1, side: 'KATHODOS', planned_from: '2026-10-11T08:00:00+03:00', planned_to: '2026-10-11T10:00:00+03:00' },
      { ref: 'n2', location_id: 2, side: 'KATHODOS', planned_from: '2026-10-12T00:00:00+03:00', planned_to: '2026-10-12T23:59:00+03:00' }]), legs.map((x) => x.raw));
  // the split / «+» rule (WN5Act._kit.dayWin): a window-less delivery gets its whole day, no «window» missing
  const kit = await page.evaluate(() => {
    if (!WN5Act._kit || typeof WN5Act._kit.dayWin !== 'function') return null;
    const it = (WN5.state().board.hub || []).find((h) => h.piece_id === 16);
    const r = WN5Act._kit.stopsFor(WN5Act._kit.needs(Object.assign({ at_hub: true }, it), false, 1), null, 'KATHODOS', ['2026-10-12T08:00:00+03:00', '2026-10-12T10:00:00+03:00'], (n) => WN5Act._kit.dayWin(n));
    return r;
  });
  ok(scn, 'split / «+»: a hub VS delivery with no window takes its day 00:00–23:59, nothing missing', !!kit && !kit.missing.length && kit.stops[1] && kit.stops[1].planned_from === '2026-10-13T00:00:00+03:00' && kit.stops[1].planned_to === '2026-10-13T23:59:00+03:00', kit);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
  // B1 part 2 (owner 28/10): VS imports at Veroia with no truck are ALSO «ΓΙΑ ΜΟΙΡΑΣΜΑ» in the Πίνακας Βέροιας (rows stay),
  // and «Σπάσε…» puts a part on a Veroia truck of the day with the delivery on its day, whole day
  const wk = fixture();
  // piece 16 delivers to Athens Test (7): no stop of the day's Veroia truck RT-T102 (1, 2, 3, 5), so its part needs a NEW
  // delivery stop — the whole-day window path, not an existing stop_id
  wk.hub = live45().hub.map((h) => Object.assign(h, { nat_ready_day: '2026-10-12' }, h.piece_id === 16 ? { nat_to_location_id: 7 } : {}));
  const v = await openBoard(browser, origin, { board: wk, lookups: lk });
  await v.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  await v.page.click('#wn5-hub [data-hub="open"]', { timeout: 2000 }).catch(() => {});   // the Veroia line opens the panel
  await v.page.waitForTimeout(300);
  const shelf = await v.page.evaluate(() => ({ items: [...document.querySelectorAll('#content .wn5 .wn5-hub-it')].map((x) => [x.dataset.piece, !!x.querySelector('[data-hub="split"]'), !!x.querySelector('[data-hub="truck"]')]),
    rows: [15, 16].map((p) => !!document.querySelector(`#content .wn5 .wn5-row[data-piece="${p}"] .wi4-box.un`)) }));
  ok(scn, 'part 2 · the VS bridges 15–18 are in «ΓΙΑ ΜΟΙΡΑΣΜΑ» with «Σπάσε…» and «Σε φορτηγό ▾», and their ΠΡΟΣ ΑΝΑΘΕΣΗ rows stay',
    ['15', '16', '17', '18'].every((p) => shelf.items.some((x) => x[0] === p && x[1] && x[2])) && shelf.rows.every(Boolean), shelf);
  await v.page.click('#content .wn5 .wn5-hub-it[data-piece="16"] [data-hub="split"]').catch(() => {});
  await v.page.waitForTimeout(500);
  const SP = '.wi4-dlg[data-wn5="split"]';
  const rtOpt = await v.page.evaluate((d) => { const o = [...document.querySelectorAll(`${d} select[data-part-target][data-i="0"] option`)].find((x) => /^rt:/.test(x.value)); return o ? o.value : null; }, SP);
  if (rtOpt) await v.page.selectOption(`${SP} select[data-part-target][data-i="0"]`, rtOpt).catch(() => {});
  await v.page.fill(`${SP} input[data-part-pal][data-i="0"]`, '5', { timeout: 2000 }).catch(() => {});
  await v.page.fill(`${SP} input[data-part-pal][data-i="1"]`, '6', { timeout: 2000 }).catch(() => {});
  await v.page.waitForTimeout(300);
  const badge = await v.page.evaluate((d) => { const b = document.querySelector(`${d} .wn5-pbadge[data-i="0"]`); const s = document.querySelector(`${d} [data-act="save"]`); return { b: b ? b.textContent : null, off: s ? s.disabled : null }; }, SP);
  ok(scn, 'part 2 · «Σπάσε…» of VS 16 onto a Veroia truck: the badge says «παράδοση Τρί 13/10 όλη η ημέρα», «Σπάσε» enabled (was «λείπει ο προορισμός»)',
    !!rtOpt && !!badge.b && /παράδοση Τρί 13\/10 όλη η ημέρα/.test(badge.b) && !/λείπει ο προορισμός/.test(badge.b) && badge.off === false, { rtOpt, badge });
  await v.page.click(`${SP} [data-act="save"]`).catch(() => {});
  await v.page.waitForTimeout(500);
  const sp = v.S.plan.filter((x) => x.m === 'POST' && x.path === '/plan/pieces/split')[0];
  const p0 = sp && sp.body && sp.body.parts && sp.body.parts[0];
  ok(scn, 'part 2 · POST /plan/pieces/split: part 1 on the truck with the delivery stop 2026-10-13 00:00–23:59, part 2 stays', !!p0 && p0.pallets === 5
    && (p0.stops || []).some((x) => x.location_id === 7 && x.planned_from === '2026-10-13T00:00:00+03:00' && x.planned_to === '2026-10-13T23:59:00+03:00')
    && sp.body.parts[1].pallets === 6 && !sp.body.parts[1].target, sp && sp.raw);
  ok(scn, 'part 2 · no page errors', !v.S.pageErrors.length, v.S.pageErrors);
  await v.page.context().close();
};
// Owner 28/10 (over Figma's «who, then where»): a point reads as on the Weekly International — the place in bold on
// line 1, its city under it on line 2 with the window / pallets / temperature; the client only in the title (and the
// order card). A long company name had filled four lines and hidden the place.
SCN['place-city'] = async (browser, origin) => {
  const scn = 'place-city';
  const lk = DEF_LOOKUPS();
  for (const l of lk.locations) l.city = 'City ' + l.id;
  const b = live45();
  b.hub[0].client = 'IFCO SYSTEMS HELLAS R P C PALLET SYSTEMS ΕΤΑΙΡΕΙΑ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΕΥΘΥΝΗΣ - IFCO S';
  const { page, S } = await openBoard(browser, origin, { board: b, lookups: lk });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  const pt = await page.evaluate(() => {
    const p = document.querySelector('#content .wn5 .wn5-row[data-piece="15"] .wn5-kto .wn5-pt');
    const row = document.querySelector('#content .wn5 .wn5-row[data-piece="15"]');
    if (!p) return null;
    const l1 = p.querySelector('.wi4-l1'), l2 = p.querySelector('.wi4-l2');
    return { l1: l1 && l1.textContent.trim(), l1w: l1 && [getComputedStyle(l1).fontWeight, getComputedStyle(l1).fontSize, getComputedStyle(l1).color].join(' '), l2: l2 && l2.textContent.replace(/\s+/g, ' ').trim(), title: p.title,
      rowText: row.querySelector('.wn5-kto').textContent, h: Math.round(p.getBoundingClientRect().height) };
  });
  // the Weekly International point's own line 1 (.wi4-l1: DM Sans 500 12px, ink) — the same size and style
  ok(scn, 'line 1 = the place «Rentis Test» in the Weekly International point style (500 12px ink)', !!pt && pt.l1 === 'Rentis Test' && /^500 12px rgb\(/.test(pt.l1w), pt);
  ok(scn, 'line 2 = its city first, then the window and the pallets («City 2 · — · 30π»)', !!pt && /^City 2 · — · 30π/.test(pt.l2 || ''), pt && pt.l2);
  ok(scn, 'the client is OFF the row and in the title (place first, client last)', !!pt && !/IFCO/.test(pt.rowText) && /^Rentis Test, City 2 · .* · IFCO SYSTEMS/.test(pt.title || ''), pt && { row: pt.rowText, title: pt.title });
  ok(scn, 'two lines: the point is not four lines tall (≤ 40px)', !!pt && pt.h <= 40, pt && pt.h);
  const qc = await page.evaluate(() => { const c = document.querySelector('#content .wn5 .wn5-qcard[data-piece="15"]'); return c ? { pl: (c.querySelector('.wn5-qc-cl') || {}).textContent, text: c.textContent, title: (c.querySelector('.wn5-qc-l1') || {}).title } : null; });
  ok(scn, 'the ΕΠΟΜΕΝΑ card names the place («→ Rentis Test»), the client only in its title', !!qc && qc.pl === 'Rentis Test' && !/IFCO/.test(qc.text) && /IFCO/.test(qc.title || ''), qc);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
};
// F23 (live 28/10): a national order sent back to Veroia (hub[], for_split) had only «Σπάσε…» / «Σε φορτηγό ▾» — no
// way to its card, so its dates could not be fixed nor the order deleted. Now each national piece of the Veroia panel
// has the ✈ of the ΠΡΟΣ ΑΝΑΘΕΣΗ rows. The card's «Επεξεργασία» (its windows) is the form rig's «veroia-edit»: this
// stub serves no facade places, so the order form refuses to open here by design.
SCN['veroia-card'] = async (browser, origin) => {
  const scn = 'veroia-card';
  const b = live45();
  b.hub.push({ piece_id: 55, shipment_id: 55, kind: 'national', nat_order_id: 50, order_id: null, order_stop_id: null, client_id: 48, client: 'ΠΕΛΑΤΗΣ ΕΘ 50', reference: null, pallets: 4,
    nat_to_location_id: 2, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-12', overdue: false, is_stock: false, for_split: true, inbound_rt_id: null, leave_by: null, temperature_c: null,
    load_from: '2026-10-15T07:00:00+03:00', load_to: '2026-10-15T09:00:00+03:00', deliver_from: '2026-10-16T14:00:00+03:00', deliver_to: '2026-10-16T16:00:00+03:00' });
  const { page, S } = await openBoard(browser, origin, { board: b });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  await page.click('#wn5-hub [data-hub="open"]', { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  const shelf = await page.evaluate(() => {
    const it = (p) => document.querySelector(`#content .wn5 .wn5-hub-it[data-piece="${p}"]`);
    const pl = (p) => !!(it(p) && it(p).querySelector('.wi4-plane[data-act="ocard"]'));
    return { n50: pl(55), vs: [15, 16, 17, 18].some(pl), split: !!(it(55) && it(55).querySelector('[data-hub="split"]')), truck: !!(it(55) && it(55).querySelector('[data-hub="truck"]')) };
  });
  ok(scn, 'the national #50 on the Veroia panel («ΓΙΑ ΜΟΙΡΑΣΜΑ») has the ✈ of its card beside «Σπάσε…» / «Σε φορτηγό ▾»; a VS item has none',
    shelf.n50 && shelf.split && shelf.truck && !shelf.vs, shelf);
  await page.click('#content .wn5 .wn5-hub-it[data-piece="55"] .wi4-plane[data-act="ocard"]', { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => { const d = document.querySelector('.wi4-dlg.wn5-ocard'); return d ? { t: d.querySelector('.wi4-dlg-hd').textContent.replace(/\s+/g, ' '), edit: !!d.querySelector('[data-act="edit"]'), del: !!d.querySelector('[data-act="delete"]') } : null; });
  ok(scn, '✈ opens the card of #50 with «Επεξεργασία» and «Διαγραφή παραγγελίας»', !!card && /#50 · ΠΕΛΑΤΗΣ ΕΘ 50/.test(card.t) && card.edit && card.del, card);
  ok(scn, 'nothing written: only reads on /plan/*', S.plan.every((x) => x.m === 'GET'), S.plan.map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
};
// Figma audit 28/10 (PR #154), group 1 — front end only, one check per item, each NO-GO on main:
// B-6 «+ Νέα παραγγελία» 135 × 32 (H1 2120:7872) · B-7 «ΕΠΟΜΕΝΑ · 4 · 7 κομμάτια» (in live45 check 6) · B-8 the «+»
// seen without hover · B-11 no «—» before the arrow of a VS without reference · B-12 an ΑΝΟΔΟΣ to Veroia reads
// «Βέροια · τέλος κύκλου» + its deadline, no city «Veroia». B-18 / B-21 / B-25 (Δ1 and the order card, both in
// wn5_actions.js) follow in their own PR, stacked on the Δ1 quick fix (coordinator 28/10).
SCN['figma-g1'] = async (browser, origin) => {
  const scn = 'figma-g1';
  const lk = DEF_LOOKUPS();
  lk.locations.find((l) => l.id === 1).city = 'Veroia';
  const b = live45();
  // export 616 (pieces 20, 21) has a delivery window at Veroia that crosses midnight: its deadline is the window's end
  for (const w of b.waiting) if (w.order_id === 616) Object.assign(w, { deliver_from: '2026-10-11T22:00:00+03:00', deliver_to: '2026-10-12T02:00:00+03:00' });
  const { page, S } = await openBoard(browser, origin, { board: b, lookups: lk });
  await page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  const to20 = await page.evaluate(() => { const c = document.querySelector('#content .wn5 .wn5-row[data-piece="20"] .wn5-ato .wn5-end'); return c ? { t: c.textContent.replace(/\s+/g, ' ').trim(), title: c.title } : null; });
  ok(scn, 'B-12 · with a window (Κυρ 22:00 → Δευ 02:00) the deadline is its end «ως Δευ 02:00», in the row and its title',
    !!to20 && /ως Δευ 02:00$/.test(to20.t) && /^Βέροια · τέλος κύκλου · ως Δευ 02:00 · /.test(to20.title), to20);
  const nb = await page.evaluate(() => { const x = [...document.querySelectorAll('.btn-new-order')].find((e) => e.offsetParent && /Νέα παραγγελία/.test(e.textContent)); if (!x) return null; const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  ok(scn, 'B-6 · «+ Νέα παραγγελία» 135 × 32 (Figma H1 2120:7872)', !!nb && nb[0] === 135 && nb[1] === 32, nb);
  await page.click('#content .wn5 .wn5-q .wi4-q-all', { timeout: 2000 }).catch(() => {});
  const k607 = await page.evaluate(() => { const c = document.querySelector('#content .wn5 .wn5-qcard[data-piece="19"] .wn5-qc-k'); return c ? c.textContent.trim() : null; });
  ok(scn, 'B-11 · ΕΠΟΜΕΝΑ card of VS 607 (no reference) starts at its arrow «←» (an ΑΝΟΔΟΣ export), no «—» before it', k607 === '←', k607);
  const to19 = await page.evaluate(() => { const c = document.querySelector('#content .wn5 .wn5-row[data-piece="19"] .wn5-ato'); return c ? { t: c.textContent.replace(/\s+/g, ' ').trim(), l1: (c.querySelector('.wi4-l1') || {}).textContent, title: (c.querySelector('[title]') || {}).title } : null; });
  ok(scn, 'B-12 · ΠΡΟΣ of export 607: «Βέροια · τέλος κύκλου» and «ως Κυρ 11/10» (its day; the base has no hour), no city «Veroia»',
    !!to19 && to19.l1 === 'Βέροια · τέλος κύκλου' && /ως Κυρ 11\/10/.test(to19.t) && !/Veroia/.test(to19.t), to19);
  ok(scn, 'nothing written: only reads on /plan/*', S.plan.every((x) => x.m === 'GET'), S.plan.map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
  // B-8 · the «+» of a cycle side is seen without hover (Figma: always there), lighter until hover; touch has no hover
  const c = await openBoard(browser, origin, { board: fixture() });
  await c.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  await c.page.mouse.move(0, 0);
  const op = await c.page.evaluate(() => { const x = document.querySelector('#content .wn5 .wn5-row .wn5-plus'); return x ? Number(getComputedStyle(x).opacity) : null; });
  ok(scn, 'B-8 · a «+» with no hover is visible and lighter (0 < opacity < 1)', op != null && op > 0 && op < 1, op);
  await c.page.context().close();
};
// ── main ──
(async () => {
  if (argv.includes('--check-fixture')) process.exit(checkFixture() ? 0 : 1);
  const unknownScn = want.filter((w) => !(w in SCN));
  if (unknownScn.length) { console.error('unknown scenario(s): ' + unknownScn.join(', ') + ' · known: ' + Object.keys(SCN).join(' ')); process.exit(2); }
  const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), WT] }));
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const WATCHDOG_MS = 180000;
  try {
    await preflight(browser, origin);                                 // ✗ lines on plain main, never an early exit
    for (const [name, fn] of Object.entries(SCN)) {
      if (want.length && !want.includes(name)) continue;
      let t = null;
      try { await Promise.race([fn(browser, origin), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`watchdog: still running after ${WATCHDOG_MS / 1000} s`)), WATCHDOG_MS); })]); }
      catch (e) { ok(name, 'scenario ran to the end', false, String(e && e.stack || e).slice(0, 600)); for (const c of browser.contexts()) await c.close().catch(() => {}); }
      finally { clearTimeout(t); }
    }
  } finally {
    await browser.close(); srv.close();
    console.log(fails ? `\nNO-GO: ${fails} check(s) failed` : `\nGO: the v5 board holds (${want.length ? want.join(' ') : Object.keys(SCN).join(' ')})`);
    process.exit(fails ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
