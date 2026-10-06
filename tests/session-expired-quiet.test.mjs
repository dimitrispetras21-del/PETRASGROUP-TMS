// node --test tests/session-expired-quiet.test.mjs
// The 5/10/2026 storm: between 21:11 and 21:15 UTC one browser with an expired login wrote 2010 rows to
// app_errors («preload_<TRUCKS>: Unauthorized» ×1320, …) and kept the auditor's B-34 red for a day.
// Proven here, on the REAL core/constants.js + core/utils.js + core/api.js in a vm with a scripted fetch,
// a controllable clock and controllable timers (nothing leaves the process):
//   1. after the first 401 of a page no facade request reaches fetch; the redirect is retried ≤ every 5 s;
//   2. the expiry is ONE app_errors row («session: session expired → …»), the callers' «Unauthorized» none;
//      a reload loop in the same tab is reported at its 1st and every 50th load, with the count;
//      a page that starts with no login (auth.js flag) sends nothing at all;
//   3. logError's burst throttle: copies 1–5 of one (message, context) within 60 s are posted, the 6th+ are
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

// opts.session: shared Map acting as the TAB's sessionStorage (survives «reloads» = new sandboxes)
// opts.noSessionAtLoad: what core/auth.js sets when it redirects at load
function sandbox(script, opts = {}) {
  const calls = [], hrefs = [], timers = [], listeners = {};
  const store = new Map([['tms_user', '{"name":"Δοκιμή","username":"t","role":"dispatcher"}'], ['tms_jwt', 'jwt.old']]);
  const session = opts.session || new Map();
  const clock = { now: opts.now || 1_790_000_000_000 };
  let timerSeq = 0;
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const location = { hostname: 'dimitrispetras21-del.github.io' };
  let href = 'https://x/app.html#dashboard';
  Object.defineProperty(location, 'href', { get: () => href, set: (v) => { hrefs.push(v); href = v; } });
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math,
    Date: FakeDate, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn, ms = 0) => { const id = ++timerSeq; timers.push({ id, fn, at: clock.now + ms }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location,
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    TABLES: { TRUCKS: 'tblEAPExIAjiA3asD', TRAILERS: 'tblDcrqRJXzPrtYLm', DRIVERS: 'tbl7UGmYhc2Y82pPs' },
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }, location };
  if (opts.noSessionAtLoad) ctx.window._tmsNoSessionAtLoad = true;
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' });
    const res = await script(String(url), init.method || 'GET');
    Object.defineProperty(res, 'url', { value: String(url) });   // a real response knows its URL
    return res;
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('showErrorToast = function () {};', ctx);   // utils.js brings a DOM toast; no DOM here
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

test('Unauthorized is logged once: one «session expired» row, no «preload_…: Unauthorized» rows', async () => {
  const s = sandbox(all401);
  // the 5/10 shape: three preloads in flight together, then the reference preload, then the dashboard
  await Promise.all([preload(s, 'TRUCKS'), preload(s, 'TRAILERS'), preload(s, 'DRIVERS')]);
  await s.run("atGetAll(TABLES.TRUCKS, {}, true).catch((e) => logError(e, 'auth: preloadReferenceData'))");
  await s.run("atGet(TABLES.DRIVERS).catch((e) => logError(e, 'renderDashboard'))");
  await settle();
  const rows = s.posts();
  assert.strictEqual(rows.length, 1, 'exactly one app_errors row: ' + JSON.stringify(rows));
  assert.match(rows[0], /^session: session expired → redirect to login \(first 401: (TRUCKS|TRAILERS)\)$/);
  assert.doesNotMatch(rows.join('\n'), /Unauthorized/);
  // requests in flight together: both reached the network before the first answer, both answered 401;
  // the second 401 must not write a second row
  assert.ok(s.facade().length <= 2);
});

test('a page that starts with no login (auth.js redirected at load) sends nothing and logs nothing', async () => {
  const s = sandbox(all401, { noSessionAtLoad: true });
  await Promise.all([preload(s, 'TRUCKS'), preload(s, 'TRAILERS'), preload(s, 'DRIVERS')]);
  await settle();
  assert.strictEqual(s.facade().length, 0, 'no facade request without a token');
  assert.deepStrictEqual(s.posts(), []);
});

test('the offline queue is not replayed once the session is gone (it stays for the next login)', async () => {
  const s = sandbox(all401);
  s.store.set('tms_offline_queue', JSON.stringify([{ method: 'PATCH', url: 'https://w.invalid/v0/appX/tblEAPExIAjiA3asD/recT1', body: { fields: { Active: true } }, recordId: 'recT1', timestamp: 1 }]));
  await preload(s, 'TRUCKS');
  const before = s.calls.length;
  await s.run('_loadOfflineQueue(); _flushOfflineQueue()');
  await settle();
  assert.strictEqual(s.calls.length, before, 'no replay request');
  assert.strictEqual(JSON.parse(s.store.get('tms_offline_queue')).length, 1, 'the queued change is kept');
});

test('a reload loop in one tab: row at the 1st load, silence for loads 2–49, the 50th says the count', async () => {
  const tab = new Map();
  const loadOnce = async () => { const s = sandbox(all401, { session: tab }); await preload(s, 'TRUCKS'); await settle(); return s.posts(); };
  assert.strictEqual((await loadOnce()).length, 1, 'first load of the tab: the expiry row');
  for (let i = 2; i < 50; i++) assert.deepStrictEqual(await loadOnce(), [], `load ${i} must not write`);
  const fiftieth = await loadOnce();
  assert.strictEqual(fiftieth.length, 1);
  assert.match(fiftieth[0], /50 page loads in this tab hit an expired session since \d\d:\d\d:\d\d UTC: redirect loop\?/);
  // ten minutes later it is a new expiry, reported again as the first
  const later = sandbox(all401, { session: tab, now: 1_790_000_000_000 + 11 * 60 * 1000 });
  await preload(later, 'TRUCKS'); await settle();
  assert.strictEqual(later.posts().length, 1);
  assert.doesNotMatch(later.posts()[0], /page loads/);
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
