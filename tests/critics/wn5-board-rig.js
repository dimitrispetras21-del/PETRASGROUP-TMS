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
const routeKey = (m, p) => `${m} ${p.replace(/\/\d+(?=\/|$)/g, '/:id')}`;

// opts: role · flag ('on' | 'pilot' | 'off') · board · plan { 'POST /plan/x/:id/y': (entry, S) => [status, body] } · viewport
async function openBoard(browser, origin, opts = {}) {
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: opts.viewport || { width: 1920, height: 1080 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));                         // BEFORE the session is stamped
  const S = { plan: [], pageErrors: [], preflight: [], board: clone(opts.board || EMPTY(WEEK)), routes: opts.plan || {}, n: {} };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(initScript, opts.role || 'dispatcher');
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
    if (u.pathname.startsWith('/plan/')) {
      const raw = req.postData();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = '<<not json>>'; }
      const entry = { m, path: u.pathname, q: Object.fromEntries(u.searchParams), raw, body, headers: req.headers() };
      S.plan.push(entry);
      const fn = S.routes[routeKey(m, u.pathname)] || defaultPlan;
      const [status, out] = fn(entry, S);
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
  const tab = await page.evaluate(() => { const b = document.querySelector('#content .wn5 .wi4-tab[data-w="41"]'); if (b) b.click(); return !!b; });
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
  ok(scn, 'VS-T118 (hub[] of the live 072) is a ΠΡΟΣ ΑΝΑΘΕΣΗ row that says its destination did not come (Ε-26)', !!st && /δεν ήρθαν με τον πίνακα/.test(st.miss), st && st.miss);
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
  await shot(narrow.page, 'paint-1440');
  // The reload time is how the user sees how stale the board is: at 1440 a week whose range crosses months (W40,
  // «26 Σεπτεμβρίου – 2 Οκτωβρίου») gives way in the range (ellipsis, full text in its title), never in «↻ hh:mm».
  await narrow.page.keyboard.press('ArrowLeft');
  await narrow.page.keyboard.press('ArrowLeft');
  await until(narrow.page, () => { const r = document.querySelector('#content .wn5'); return !!r && r.dataset.week === '2026-09-26' && r.dataset.state !== 'loading'; });
  const bar = await narrow.page.evaluate(() => {
    const bl = document.querySelector('#content .wn5 .wn5-bar .wi4-bar-l');
    const up = bl && bl.querySelector('.wn5-upd');
    const rg = bl && bl.querySelector('.wi4-range');
    if (!up) return null;
    return { barR: Math.round(bl.getBoundingClientRect().right), updR: Math.round(up.getBoundingClientRect().right), upd: up.textContent, range: rg && rg.getAttribute('title') };
  });
  ok(scn, '1440, W40: «↻ hh:mm» ends inside the bar (the long range gives way, not the time)',
    !!bar && /26 Σεπτεμβρίου/.test(bar.range || '') && bar.updR <= bar.barR + 1 && /↻ (?:Ενημερώθηκε )?\d{2}:\d{2}/.test(bar.upd), bar);
  ok(scn, '1440: no page errors', !narrow.S.pageErrors.length, narrow.S.pageErrors);
  await shot(narrow.page, 'paint-1440-w40');
  await narrow.page.context().close();
  // Ε-27/Ε-44: a week with no VS leg and no PlanIds.hub() (live: GET /plan/lookups is 404) cannot place Veroia —
  // the board says so in a strip, never Veroia as an ordinary stop in silence.
  const hubless = fixture();
  for (const c of hubless.cycles) for (const s of c.stops) for (const l of s.legs) if (String(l.kind).startsWith('vs_')) l.kind = 'national';
  const hl = await openBoard(browser, origin, { board: hubless });
  const hlText = await hl.page.evaluate(() => { const x = document.querySelector('#content .wn5 .wn5-strip[data-kind="client"]'); return x ? x.textContent : null; });
  ok(scn, 'a week whose Veroia is not identified shows the WN5L.HUB_UNKNOWN strip', !!hlText && hlText.includes('Η Βέροια δεν αναγνωρίστηκε'), hlText);
  await hl.page.context().close();
};
// Figma 2035:7735 «εκτελεσμένα σβηστά ανά ημέρα», now = Tue 13/10 09:30: what the base flags is at 40%, nothing else.
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
        const b = ask.querySelector('.wn5-strip-act'); const br = b.getBoundingClientRect(); const up = document.querySelector('#content .wn5 .wn5-upd'); const ui = up && up.querySelector('.wn5-ico-re');
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
        const tr = r(third), kids = [...third.children].map(r);
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
    ok(scn, 'a free truck needs the Veroia window: «Ανάθεση» disabled until it is typed (no default)', (await bOff(page, `${D} [data-act="save"][data-cand="truck:14"]`)) === true);
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
    const form = await bHas(page, bDlg('order'));
    const line = (await bText(page, D)).includes('Η σύντομη φόρμα ανοίγει με τη φόρμα εθνικής v5');
    ok(scn, '«Νέα παραγγελία» opens the order form (T20) or says it is not there yet — never a dead button', form || line);
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
      return { words: out, spill };
    }).catch(() => null);
    ok(scn, 'board 1440: RT-T204 ΦΟΡΤΩΣΗ «THESSALONIKI TEST» — no word on two lines, nothing past the cell', !!w && w.words.some((x) => x.word === 'THESSALONIKI')
      && w.words.every((x) => x.lines === 1) && !w.spill, w);
    await page.context().close();
  }
}
SCN['plus'] = scnPlus;

// ── scenarios end (each Task adds its own above this line) ──

// ── fixture check (T4): plain node, no browser ──
// The synthetic week every scenario serves (tests/fixtures/wn5-week.json). Its SHAPE is held to 072 plan_board by
// tests/wn5-logic.test.js; here the rig holds its DATA: invented names only (public repo), the flags of the base's
// per-day rule at the rig's clock (else the dim scenario would test the fixture, not the screen), and every case
// the scenarios need present.
function fixture() { return JSON.parse(fs.readFileSync(path.join(WT, 'tests/fixtures/wn5-week.json'), 'utf8')); }
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
