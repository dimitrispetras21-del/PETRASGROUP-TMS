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
      w2: w2.querySelectorAll('ul > li').length };
  });
  ok(scn, 'strip box as Δ12: 34px, padding 8/12/8/10, 8px between label and message', sb.box.h === 34 && sb.box.paddingTop === '8px' && sb.box.paddingRight === '12px'
    && sb.box.paddingBottom === '8px' && sb.box.paddingLeft === '10px' && sb.box.columnGap === '8px', sb.box);
  ok(scn, 'label Syne SemiBold 12.5px, tracking .8px', /Syne/.test(sb.head.fontFamily) && sb.head.fontWeight === '600' && sb.head.fontSize === '12.5px' && sb.head.letterSpacing === '0.8px', sb.head);
  ok(scn, 'message DM Sans Medium 12px grey-1 (#344054) also on a refusal, «· » before it, none after the label', sb.msg.fontWeight === '500' && sb.msg.fontSize === '12px'
    && sb.msg.color === 'rgb(52, 64, 84)' && /·/.test(sb.dot) && !/·/.test(sb.headAfter), sb);
  ok(scn, '«Ανανέωση ↻» only where the base asks for a re-read (stale, «ανανέωσε»), never on a plain refusal', !sb.refAct && sb.askAct, { ref: sb.refAct, ask: sb.askAct });
  ok(scn, '«Έλεγχος στο board» at the end, Medium, in the strip\'s own colour', !!sb.unk && sb.unk.text === 'Έλεγχος στο board' && sb.unk.w === '500' && sb.unk.c === sb.unk.head && sb.unk.atEnd, sb.unk);
  ok(scn, 'one warning is one 34px line «ΠΡΟΕΙΔΟΠΟΙΗΣΗ · …» (2104:145961); two are a list', !sb.w1.ul && sb.w1.t === 'Υπέρβαση 21π στο TST-2106 — αποθηκεύτηκε' && sb.w1.h === 34 && sb.w2 === 2, sb);
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
      cancel: g('[data-act="cancel"]', 'height', 'fontSize', 'fontWeight', 'paddingLeft', 'borderTopColor'), confirm: g('[data-act="confirm"]', 'height', 'fontSize', 'fontWeight', 'paddingLeft') };
  });
  ok(scn, 'Δ5 frame: 600 wide, radius 12, padding 18/22, shadow 0 8 24 rgba(10,26,41,.16), no «×»', dl.w === 600 && dl.rad === '12px' && dl.pad === '18px 22px'
    && dl.shadow === 'rgba(10, 26, 41, 0.16) 0px 8px 24px 0px' && !dl.x, dl);
  ok(scn, 'title Syne Bold 18px ink; intro 12.5px grey; headings SemiBold 12px grey', !!dl.title && /Syne/.test(dl.title.fontFamily) && dl.title.fontWeight === '700' && dl.title.fontSize === '18px'
    && dl.title.color === 'rgb(11, 25, 41)' && dl.intro.fontSize === '12.5px' && dl.intro.color === 'rgb(91, 107, 127)'
    && dl.ch.fontWeight === '600' && dl.ch.fontSize === '12px' && dl.ch.color === 'rgb(91, 107, 127)', dl);
  ok(scn, 'rows 13px grey-1, a «•» glyph (no CSS disc), 29px pitch', !!dl.li && dl.li.fontSize === '13px' && dl.li.color === 'rgb(52, 64, 84)' && dl.li.listStyleType === 'none'
    && /•/.test(dl.bullet) && dl.pitch === 29, dl);
  ok(scn, 'the payroll row starts «Μισθοδοσία · γραμμή μισθοδοσίας με ποσό (Οκτώβριος)» (Δ5 / H4)', dl.texts.some((t) => t.startsWith('Μισθοδοσία · γραμμή μισθοδοσίας με ποσό (Οκτώβριος)')), dl.texts);
  ok(scn, 'buttons 36px 13px, «Άκυρο» Medium padding 14 #d0d5dd border, the verb SemiBold padding 16, gap 10', !!dl.cancel && dl.cancel.height === '36px' && dl.cancel.fontSize === '13px'
    && dl.cancel.fontWeight === '500' && dl.cancel.paddingLeft === '14px' && dl.cancel.borderTopColor === 'rgb(208, 213, 221)'
    && dl.confirm.height === '36px' && dl.confirm.fontWeight === '600' && dl.confirm.paddingLeft === '16px' && dl.ft.columnGap === '10px', dl);
  ok(scn, 'no page errors (C)', !c.S.pageErrors.length, c.S.pageErrors);
  await shot(c.page, 'strips-dialog');
  await c.page.context().close();
};

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
