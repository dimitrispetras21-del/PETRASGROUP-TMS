// node --test tests/session-expired-quiet.test.mjs
// The 5/10/2026 storm: between 21:11 and 21:15 UTC one Windows PC (Chrome 149) wrote 2010 rows to app_errors
// («preload_<TRUCKS>: Unauthorized» ×1320, …), 2002 of them from app.html with no hash over 188 distinct seconds:
// a tab that kept LOADING the app. It kept the auditor's B-34 red for a day, and no row said whose PC it was or how
// the tab got back. Proven here, on the REAL core/constants.js + core/utils.js + core/api.js (and core/auth.js in
// the app's own script order) in a vm with a scripted fetch, a controllable clock and timers (nothing leaves):
//   1. after the first 401 of a page no facade request reaches fetch; the redirect is retried ≤ every 5 s;
//   2. the end of a session is heard per TAB (sessionStorage streak), never per request:
//      - a page's first 401 → ONE «session: expired → login (user X; …)» row per streak (routine);
//        a 401 while the login is still valid by this browser's clock → «session: rejected before expiry …»;
//      - a page turned away at load: silent for a plain expiry / no login, ONE «session: login rejected at load …»
//        row per streak for an unknown username / role mismatch (the tamper guard);
//      - every 50th load of a streak → «session: redirect loop — N loads in M s (user X, reason R; …)», whatever
//        the reason — also when no load ever had a login (review 6/10 P2-1);
//      - the first 2xx of a page with a session ends the streak (P3-1); rows wait for logError (auth.js and
//        api.js run before utils.js) and survive a page that leaves first;
//      - every row says who (read before the login is removed), how the page was reached, the browser, the hash;
//   3. the offline-queue replay stops at the session's end: items kept, no raw 401 sent or logged (P2-2);
//   4. logError's burst throttle: copies 1–5 of one (message, context) within 60 s are posted, the 6th+ are
//      counted and ONE summary row carries the right N (window close, next copy, or pagehide); another
//      message is posted normally; a first occurrence is never held.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const T0 = 1_790_000_000_000;
const USER_T = { name: 'Δοκιμή', username: 't', role: 'dispatcher' };
const TEST_ORDER = ['core/constants.js', 'core/utils.js', 'core/api.js'];
const APP_ORDER = ['core/constants.js', 'core/auth.js', 'core/api.js', 'core/utils.js'];   // app.html:112-116

// opts.session: shared Map acting as the TAB's sessionStorage (survives «reloads» = new sandboxes)
// opts.atLoad:  what core/auth.js sets when it turns the page away at load ({ reason, user, exp } or legacy true)
// opts.login:   the stored tms_user (default USER_T; null = none) · opts.files: which scripts, in which order
// opts.nav / opts.referrer / opts.hash / opts.ua: how the page was reached, and in what browser
function sandbox(script, opts = {}) {
  const calls = [], hrefs = [], timers = [], listeners = {};
  const login = opts.login === undefined ? USER_T : opts.login;
  const store = new Map(login ? [['tms_user', JSON.stringify(login)], ['tms_jwt', 'jwt.old']] : []);
  const session = opts.session || new Map();
  const clock = { now: opts.now || T0 };
  let timerSeq = 0;
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const location = { hostname: 'dimitrispetras21-del.github.io', origin: 'https://x', hash: opts.hash === undefined ? '#dashboard' : opts.hash };
  let href = 'https://x/app.html' + location.hash;
  Object.defineProperty(location, 'href', { get: () => href, set: (v) => { hrefs.push(v); href = v; } });
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math,
    Date: FakeDate, Promise, Array, Uint8Array, Error, Object, Set, Map, Number, String,
    setTimeout: (fn, ms = 0) => { const id = ++timerSeq; timers.push({ id, fn, at: clock.now + ms }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: opts.ua || UA_WIN }, location,
    performance: { getEntriesByType: (t) => (t === 'navigation' ? [{ type: opts.nav || 'navigate' }] : []) },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, referrer: opts.referrer === undefined ? 'https://x/index.html' : opts.referrer,
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    TABLES: { TRUCKS: 'tblEAPExIAjiA3asD', TRAILERS: 'tblDcrqRJXzPrtYLm', DRIVERS: 'tbl7UGmYhc2Y82pPs' },
    invalidateCache() {}, atNotifyChange() {},
  };
  if (opts.users) ctx.USERS = opts.users;   // config.js's roster, read by auth.js's tamper guard
  ctx.window = { addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }, location };
  if (opts.atLoad) ctx.window._tmsNoSessionAtLoad = opts.atLoad;
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' });
    const res = await script(String(url), init.method || 'GET');
    Object.defineProperty(res, 'url', { value: String(url) });   // a real response knows its URL
    return res;
  };
  vm.createContext(ctx);
  for (const f of opts.files || TEST_ORDER)
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('if (typeof showErrorToast === "function") showErrorToast = function () {};', ctx);   // no DOM here
  const posts = () => calls.filter((c) => c.url.endsWith('/app-errors')).map((c) => JSON.parse(c.body).message);
  const facade = () => calls.filter((c) => c.url.includes('/v0/'));
  // advance the clock and fire every timer that is due (in order)
  const tick = (ms) => {
    clock.now += ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > clock.now) break;
      timers.shift().fn();
    }
  };
  return { ctx, calls, hrefs, store, session, clock, tick, listeners, posts, facade, run: (code) => vm.runInContext(code, ctx) };
}
const settle = () => new Promise((r) => setImmediate(r));
const all401 = (url) => (url.endsWith('/app-errors') ? json(201, {}) : json(401, { error: 'Unauthorized' }));
// what atPreload / auth.js / every module does with a failure: log it under its own context
const preload = (s, table) => s.run(`atGet(TABLES.${table}, '', true).catch((e) => { logError(e, 'preload_' + TABLES.${table}); return e; })`);
const streak = (tab) => JSON.parse(tab.get('tms_session_expired') || 'null');
const DIAG = 'nav navigate; from index.html; Win Chrome 149; #dashboard';

test('401 short-circuit: after the first 401 the next facade request never calls fetch', async () => {
  const s = sandbox(all401);
  const e1 = await preload(s, 'TRUCKS');
  assert.strictEqual(e1.message, 'Unauthorized');
  assert.strictEqual(e1._noRetry, true);
  assert.strictEqual(s.facade().length, 1, 'the first request goes to the network once (no retries)');
  assert.strictEqual(s.store.has('tms_user') || s.store.has('tms_jwt'), false, 'the login is cleared on the first 401');
  assert.deepStrictEqual(s.hrefs, ['index.html']);

  const e2 = await preload(s, 'TRAILERS');
  const e3 = await preload(s, 'DRIVERS');
  const e4 = await s.run("atPatch('tblEAPExIAjiA3asD', 'recT1', { Active: true }).catch((e) => e)");
  assert.strictEqual(s.facade().length, 1, 'no fetch after the session is gone');
  for (const e of [e2, e3, e4]) {
    assert.strictEqual(e.message, 'Unauthorized', 'callers get the same error as before');
    assert.strictEqual(e._noRetry, true);
    assert.strictEqual(e._sessionGone, true);
  }
  assert.deepStrictEqual(s.hrefs, ['index.html'], 'no redirect per request inside 5 s');

  s.tick(5000);
  await preload(s, 'TRUCKS');
  assert.deepStrictEqual(s.hrefs, ['index.html', 'index.html'], 'the redirect is retried after 5 s');
  assert.strictEqual(s.facade().length, 1);
});

test('Unauthorized is logged once: one «session: expired → login (user …)» row, no «preload_…: Unauthorized» rows', async () => {
  const s = sandbox(all401);
  // the 5/10 shape: three preloads in flight together, then the reference preload, then the dashboard
  await Promise.all([preload(s, 'TRUCKS'), preload(s, 'TRAILERS'), preload(s, 'DRIVERS')]);
  await s.run("atGetAll(TABLES.TRUCKS, {}, true).catch((e) => logError(e, 'auth: preloadReferenceData'))");
  await s.run("atGet(TABLES.DRIVERS).catch((e) => logError(e, 'renderDashboard'))");
  await settle();
  const rows = s.posts();
  assert.strictEqual(rows.length, 1, 'exactly one app_errors row: ' + JSON.stringify(rows));
  // whose login (read BEFORE it was removed), where the first 401 came from, how the page was reached, the browser
  assert.match(rows[0], new RegExp(`^session: expired → login \\(user t; first 401: (TRUCKS|TRAILERS); ${DIAG}\\)$`));
  assert.doesNotMatch(rows.join('\n'), /Unauthorized/);
  // requests in flight together: both reached the network before the first answer, both answered 401;
  // the second 401 must not write a second row
  assert.ok(s.facade().length <= 2);
});

test('a 401 while the login is still valid by this clock is NOT routine: «rejected before expiry», with the minutes', async () => {
  const ahead = sandbox(all401, { login: { ...USER_T, expiresAt: T0 + 300 * 60_000 } });
  await preload(ahead, 'TRUCKS'); await settle();
  assert.deepStrictEqual(ahead.posts(), [`session: rejected before expiry → login (user t; first 401: TRUCKS; exp in 300 min; ${DIAG})`]);
  const past = sandbox(all401, { login: { ...USER_T, expiresAt: T0 - 2 * 60_000 } });
  await preload(past, 'TRUCKS'); await settle();
  assert.deepStrictEqual(past.posts(), [`session: expired → login (user t; first 401: TRUCKS; exp 2 min ago; ${DIAG})`]);
  // a clock a few minutes behind the Worker's is still the routine end of the login
  const skew = sandbox(all401, { login: { ...USER_T, expiresAt: T0 + 4 * 60_000 } });
  await preload(skew, 'TRUCKS'); await settle();
  assert.match(skew.posts()[0], /^session: expired → login \(user t; first 401: TRUCKS; exp in 4 min;/);
});

test('a page turned away at load for a plain expiry sends nothing and logs nothing — and is counted', async () => {
  const tab = new Map();
  const s = sandbox(all401, { session: tab, login: null, atLoad: { reason: 'expired', user: 't', exp: T0 - 60_000 } });
  await Promise.all([preload(s, 'TRUCKS'), preload(s, 'TRAILERS'), preload(s, 'DRIVERS')]);
  await settle();
  assert.strictEqual(s.facade().length, 0, 'no facade request without a token');
  assert.deepStrictEqual(s.posts(), [], 'every morning\'s first page: silent');
  assert.strictEqual(streak(tab).n, 1);
  assert.strictEqual(streak(tab).user, 't');
});

test('P2-1: a loop that NEVER has a login at load is heard — one row in 50 loads, with the count, the time and the reason', async () => {
  const tab = new Map();
  let rows = [], facade = 0;
  for (let i = 0; i < 50; i++) {
    const s = sandbox(all401, { session: tab, login: null, atLoad: { reason: 'no login', user: null, exp: null }, now: T0 + i * 1000, hash: '' });
    await Promise.all([preload(s, 'TRUCKS'), preload(s, 'TRAILERS')]); await settle();
    if (i < 49) assert.deepStrictEqual(s.posts(), [], `load ${i + 1} must not write`);
    rows = rows.concat(s.posts()); facade += s.facade().length;
  }
  assert.strictEqual(facade, 0);
  assert.deepStrictEqual(rows, ['session: redirect loop — 50 loads in 49 s (user ?, reason no login; no login ×50; nav navigate; from index.html; Win Chrome 149; no hash)']);
  // the old window (10 min) would have let a slow loop stay silent for ever: no window now
  const slow = new Map(); let slowRows = [];
  for (let i = 0; i < 50; i++) {
    const s = sandbox(all401, { session: slow, login: null, atLoad: { reason: 'no login' }, now: T0 + i * 60_000, nav: 'reload', referrer: '' });
    await settle(); slowRows = slowRows.concat(s.posts());
  }
  assert.deepStrictEqual(slowRows, ['session: redirect loop — 50 loads in 2940 s (user ?, reason no login; no login ×50; nav reload; from none; Win Chrome 149; #dashboard)']);
});

test('P2-1: the tamper guard (real core/auth.js, app script order): unknown username → one row per streak, loop row at 50', async () => {
  const tab = new Map();
  const users = [{ username: 't', role: 'dispatcher' }];
  const ghost = { name: 'Ghost', username: 'ghost', role: 'dispatcher', expiresAt: T0 + 480 * 60_000 };
  const load = async (i, login) => {
    const s = sandbox(all401, { session: tab, files: APP_ORDER, users, login, now: T0 + i * 200 });
    s.tick(300); await settle();   // auth.js's preload timers fire: they must send nothing
    assert.strictEqual(s.facade().length, 0, `load ${i + 1}: nothing sent`);
    assert.deepStrictEqual(s.hrefs, ['index.html']);
    assert.strictEqual(s.store.has('tms_user'), false);
    return s.posts();
  };
  assert.deepStrictEqual(await load(0, ghost), [`session: login rejected at load — unknown username (user ghost; exp in 480 min; ${DIAG})`]);
  for (let i = 1; i < 49; i++) assert.deepStrictEqual(await load(i, ghost), [], `load ${i + 1} must not write`);
  const fiftieth = await load(49, ghost);
  assert.strictEqual(fiftieth.length, 1);
  assert.match(fiftieth[0], /^session: redirect loop — 50 loads in 10 s \(user ghost, reason unknown username; unknown username ×50; exp in 480 min; nav navigate;/);
  // a stored role that is not the roster's: the other tamper reason, its own row
  const tab2 = new Map();
  const s = sandbox(all401, { session: tab2, files: APP_ORDER, users, login: { ...USER_T, role: 'owner', expiresAt: T0 + 60 * 60_000 } });
  await settle();
  assert.deepStrictEqual(s.posts(), [`session: login rejected at load — role mismatch (user t; exp in 60 min; ${DIAG})`]);
});

test('app script order: auth.js and api.js run before logError exists — a plain expiry stays silent, its user is kept', async () => {
  const tab = new Map();
  const s = sandbox(all401, { session: tab, files: APP_ORDER, users: [{ username: 't', role: 'dispatcher' }], login: { ...USER_T, expiresAt: T0 - 60_000 } });
  s.tick(300); await settle();
  assert.deepStrictEqual(s.posts(), []);
  assert.strictEqual(s.facade().length, 0);
  assert.deepStrictEqual({ n: streak(tab).n, user: streak(tab).user, seen: streak(tab).seen, pending: streak(tab).pending },
    { n: 1, user: 't', seen: { expired: 1 }, pending: [] });
});

test('a page that leaves before utils.js runs hands its row to the next app page of the tab (sent once)', async () => {
  const tab = new Map();
  const users = [{ username: 't', role: 'dispatcher' }];
  const ghost = { name: 'Ghost', username: 'ghost', role: 'dispatcher' };
  const cut = sandbox(all401, { session: tab, files: ['core/constants.js', 'core/auth.js', 'core/api.js'], users, login: ghost });
  await settle();
  assert.deepStrictEqual(cut.posts(), [], 'no logError on that page');
  assert.strictEqual(streak(tab).pending.length, 1, 'the row waits in the tab');
  // the user logs in properly: the next app page sends the waiting row at the end of utils.js, then works
  const ok = (url) => (url.endsWith('/app-errors') ? json(201, {}) : json(200, { records: [] }));
  const next = sandbox(ok, { session: tab, files: APP_ORDER, users, login: { ...USER_T, expiresAt: T0 + 60_000 * 60 } });
  assert.deepStrictEqual(next.posts(), [`session: login rejected at load — unknown username (user ghost; ${DIAG})`]);
  await preload(next, 'TRUCKS'); await settle();
  assert.strictEqual(next.posts().length, 1, 'sent once');
  assert.strictEqual(tab.has('tms_session_expired'), false, 'its first 2xx ended the streak');
});

test('a reload loop through the first 401: row at the 1st load, silence for loads 2–49, the 50th says the count', async () => {
  const tab = new Map();
  const loadOnce = async (i) => { const s = sandbox(all401, { session: tab, now: T0 + i * 300 }); await preload(s, 'TRUCKS'); await settle(); return s.posts(); };
  assert.deepStrictEqual(await loadOnce(0), [`session: expired → login (user t; first 401: TRUCKS; ${DIAG})`]);
  for (let i = 1; i < 49; i++) assert.deepStrictEqual(await loadOnce(i), [], `load ${i + 1} must not write`);
  assert.deepStrictEqual(await loadOnce(49), [`session: redirect loop — 50 loads in 15 s (user t, reason 401 at TRUCKS; 401 ×50; ${DIAG})`]);
});

test('P3-1: the first 2xx of a page ends the streak — a second real expiry in the same tab is reported again', async () => {
  const tab = new Map();
  const s1 = sandbox(all401, { session: tab }); await preload(s1, 'TRUCKS'); await settle();
  assert.strictEqual(s1.posts().length, 1);
  // the user logs in again; the page works (2xx), and 5 minutes later its login is refused
  let n = 0;
  const okThen401 = (url) => (url.endsWith('/app-errors') ? json(201, {}) : ++n === 1 ? json(200, { records: [] }) : json(401, {}));
  const s2 = sandbox(okThen401, { session: tab, now: T0 + 5 * 60_000 });
  await preload(s2, 'TRUCKS');
  assert.strictEqual(tab.has('tms_session_expired'), false, 'the 2xx ended the streak');
  s2.clock.now += 60_000;
  await preload(s2, 'TRAILERS'); await settle();
  assert.deepStrictEqual(s2.posts(), [`session: expired → login (user t; first 401: TRAILERS; ${DIAG})`]);
  // without a 2xx in between (a loop), the same tab stays quiet
  const s3 = sandbox(all401, { session: tab, now: T0 + 7 * 60_000 }); await preload(s3, 'TRUCKS'); await settle();
  assert.deepStrictEqual(s3.posts(), []);
});

test('P3-3: the row prefixes against the auditor\'s B-34 text — routine excluded, loop / rejected / tamper counted', async () => {
  const sql = fs.readFileSync(path.join(ROOT, 'tms-auditor/checks/B-34.sql'), 'utf8');
  const excluded = [...sql.matchAll(/message NOT LIKE '([^']*)'/g)].map((m) => new RegExp('^' + m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 's'));
  const counted = (msg) => !excluded.some((re) => re.test(msg));
  const rows = {};
  { const s = sandbox(all401); await preload(s, 'TRUCKS'); await settle(); rows.routine = s.posts()[0]; }
  { const s = sandbox(all401, { login: { ...USER_T, expiresAt: T0 + 120 * 60_000 } }); await preload(s, 'TRUCKS'); await settle(); rows.rejected = s.posts()[0]; }
  { const s = sandbox(all401, { atLoad: { reason: 'unknown username', user: 'ghost' }, login: null }); await settle(); rows.tamper = s.posts()[0]; }
  { const tab = new Map(); let last = [];
    for (let i = 0; i < 50; i++) { const s = sandbox(all401, { session: tab, atLoad: { reason: 'no login' }, login: null }); await settle(); last = s.posts(); }
    rows.loop = last[0]; }
  assert.match(rows.routine, /^session: expired → login \(user t;/);
  assert.match(rows.loop, /^session: redirect loop — 50 loads in \d+ s \(user \?, reason no login;/);
  assert.strictEqual(counted(rows.routine), false, 'the routine end of a login must not count in B-34');
  for (const k of ['rejected', 'tamper', 'loop']) assert.strictEqual(counted(rows[k]), true, `${k} must count in B-34: ${rows[k]}`);
});

test('the browser in short: the order of the tests (Edge and Opera also say Chrome, Chrome says Safari)', () => {
  const s = sandbox(all401);
  const ua = (u) => { s.ctx.navigator.userAgent = u; return s.run('_tmsUaShort()'); };
  assert.strictEqual(ua(UA_WIN), 'Win Chrome 149');
  assert.strictEqual(ua(UA_WIN + ' Edg/149.0.0.0'), 'Win Edge 149');
  assert.strictEqual(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'), 'Win Firefox 140');
  assert.strictEqual(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'), 'Mac Safari 18');
  assert.strictEqual(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/149.0 Mobile/15E148 Safari/604.1'), 'iOS Chrome 149');
  assert.strictEqual(ua('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'), 'Android Chrome 149');
  assert.strictEqual(ua(''), 'other OS other browser');
});

// ── Offline-queue replay at the session's end (review 6/10 P2-2) ─────────────
const qItem = (method, rec, req) => ({ method, url: `https://w.invalid/v0/appX/tblEAPExIAjiA3asD${rec ? '/' + rec : ''}`, body: { fields: { A: 1 } }, recordId: rec, timestamp: 1, req });
const flush = async (s) => { await s.run('_loadOfflineQueue(); _flushOfflineQueue()'); await settle(); await settle(); };
const queued = (s) => JSON.parse(s.store.get('tms_offline_queue') || '[]');

test('P2-2: a PATCH queue whose conflict check ends the session — no PATCH sent, no 401 row, both items kept', async () => {
  const s = sandbox(all401);
  s.store.set('tms_offline_queue', JSON.stringify([qItem('PATCH', 'recT1', 'r1'), qItem('PATCH', 'recT2', 'r2')]));
  await flush(s);
  assert.deepStrictEqual(s.facade().map((c) => `${c.method} ${c.url.split('/').pop()}`), ['GET recT1'], 'only the conflict check reached the network');
  assert.deepStrictEqual(s.posts(), [`session: expired → login (user t; first 401: TRUCKS; ${DIAG})`]);
  assert.deepStrictEqual(queued(s).map((q) => q.recordId), ['recT1', 'recT2'], 'nothing lost');
  assert.strictEqual(s.run('tmsSessionGone()'), true);
  assert.deepStrictEqual(s.hrefs, ['index.html']);
});

test('P2-2: a POST-only queue — the first raw 401 ends the session (login cleared, redirect), the rest are not sent', async () => {
  const s = sandbox(all401);
  s.store.set('tms_offline_queue', JSON.stringify([1, 2, 3].map((i) => qItem('POST', null, 'q' + i))));
  await flush(s);
  assert.strictEqual(s.facade().length, 1, 'one raw POST, then nothing');
  assert.deepStrictEqual(s.posts(), [`session: expired → login (user t; first 401: offline queue; ${DIAG})`], 'the 401 itself is not logged');
  assert.strictEqual(queued(s).length, 3, 'all three kept for the next login');
  assert.strictEqual(s.run('tmsSessionGone()'), true);
  assert.strictEqual(s.store.has('tms_jwt'), false);
  assert.deepStrictEqual(s.hrefs, ['index.html']);
});

test('P2-2: a replay the session ends half-way — the flush line counts what was decided and what was kept', async () => {
  let posts = 0;
  const s = sandbox((url, m) => {
    if (url.endsWith('/app-errors')) return json(201, {});
    if (m === 'GET') return json(200, { id: 'recT1', fields: {} });
    return m === 'PATCH' ? json(200, { id: 'recT1', fields: {} }) : (++posts, json(401, {}));
  });
  s.store.set('tms_offline_queue', JSON.stringify([qItem('PATCH', 'recT1', 'r1'), qItem('POST', null, 'q2'), qItem('POST', null, 'q3')]));
  await flush(s);
  assert.strictEqual(posts, 1, 'the second POST is never sent');
  assert.deepStrictEqual(queued(s).map((q) => q.req), ['q2', 'q3']);
  const rows = s.posts();
  assert.ok(rows.includes('queue: offline flush synced 1, conflicts 0, failed 0, kept 2 (session ended) · r1,q2,q3'), JSON.stringify(rows));
  assert.ok(!rows.some((m) => /offline replay HTTP 401/.test(m)), JSON.stringify(rows));
});

test('the other 4xx answers are untouched: a 403 is still logged and does not end the session', async () => {
  const s = sandbox((url) => (url.endsWith('/app-errors') ? json(201, {}) : json(403, { error: 'Forbidden' })));
  await preload(s, 'TRUCKS');
  await preload(s, 'TRAILERS');
  await settle();
  assert.strictEqual(s.facade().length, 2, 'a 403 is not a session end — the next request is sent');
  assert.strictEqual(s.store.get('tms_jwt'), 'jwt.old');
  assert.ok(s.posts().some((m) => /_atRetry 403/.test(m)));
});

// ── logError burst throttle ──────────────────────────────────────────────────
const rowsOf = (s, re) => s.posts().filter((m) => re.test(m));

test('throttle: the 6th identical error within 60 s is counted, not posted; the summary says N=1', async () => {
  const s = sandbox(all401);
  for (let i = 0; i < 6; i++) { s.run("logError(new Error('boom'), 'ctxA')"); s.tick(1000); }
  await settle();
  assert.strictEqual(rowsOf(s, /^ctxA: boom$/).length, 5, 'copies 1–5 are posted as before');
  assert.strictEqual(rowsOf(s, /repeated/).length, 0, 'the summary waits for the window to close');
  s.tick(60_000);   // the window closes → its timer writes the summary
  await settle();
  const sum = rowsOf(s, /^ctxA: boom — repeated/);
  assert.strictEqual(sum.length, 1);
  assert.match(sum[0], /repeated 1 more time within \d+ s/);
});

test('throttle: N counts every held copy; a different message in the burst is posted normally', async () => {
  const s = sandbox(all401);
  for (let i = 0; i < 9; i++) s.run("logError(new Error('boom'), 'ctxA')");
  s.run("logError(new Error('other'), 'ctxA')");
  s.run("logError(new Error('boom'), 'ctxB')");   // same message, another context = another key
  await settle();
  assert.strictEqual(rowsOf(s, /^ctxA: other$/).length, 1);
  assert.strictEqual(rowsOf(s, /^ctxB: boom$/).length, 1);
  s.tick(60_000); await settle();
  assert.deepStrictEqual(rowsOf(s, /repeated/), ['ctxA: boom — repeated 4 more times within 60 s (collapsed; first 5 sent)']);
});

test('throttle: the first copy after the window is posted at once; the old summary goes first', async () => {
  const s = sandbox(all401);
  s.ctx.setTimeout = () => 0;   // a background tab whose timers never fire
  for (let i = 0; i < 7; i++) s.run("logError(new Error('boom'), 'ctxA')");
  s.clock.now += 61_000;
  s.run("logError(new Error('boom'), 'ctxA')");
  await settle();
  const rows = rowsOf(s, /^ctxA: boom/);
  assert.strictEqual(rows.length, 7, '5 + summary + the new first copy');
  assert.match(rows[5], /repeated 2 more times/);
  assert.strictEqual(rows[6], 'ctxA: boom', 'a first occurrence is never held');
});

test('throttle: leaving the page (pagehide) writes the pending summary', async () => {
  const s = sandbox(all401);
  for (let i = 0; i < 8; i++) s.run("logError(new Error('boom'), 'ctxA')");
  (s.listeners.pagehide || []).forEach((f) => f());
  await settle();
  const sum = rowsOf(s, /repeated/);
  assert.strictEqual(sum.length, 1);
  assert.match(sum[0], /repeated 3 more times/);
});
