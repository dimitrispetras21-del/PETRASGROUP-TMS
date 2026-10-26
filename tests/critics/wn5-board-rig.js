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
