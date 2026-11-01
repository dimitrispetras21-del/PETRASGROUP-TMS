// Helper, not a test (no «.test.» in the name, so `node --test tests/*.test.mjs` does not run it alone).
// National v5 F4α — the REAL core/constants.js, core/utils.js, core/api.js and core/plan-api.js run in a vm with a
// scripted fetch: the sandbox of tests/api-stock-refusals.test.mjs, with window === the context so the three
// globals of plan-api.js are reachable as in the browser. Every tests/wn5-*.mjs that drives planFetch uses THIS one
// (one sandbox, principle 3). Nothing leaves the process.
// Timers: a wait under 5 s runs at once — so if planFetch ever went through _atRetry (core/api.js), its 1 s / 2 s
// pauses would show up as extra fetches instead of hanging the test; a longer one (the fetch timeout of
// _fetchWithTimeout) waits until the test calls fire(ms), which is how an abort is staged.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// TMS_ROOT=<plain main tree> runs the same test against main (the «fails on main» proof).
export const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
export const FILES = ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-api.js'];   // app.html order
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function planSandbox(script, o = {}) {
  const calls = [], timers = [], store = new Map(), session = new Map(), errors = [], toasts = [], expired = [];
  const mkStore = (m) => ({
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
  });
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, Request, TextEncoder, TextDecoder,
    setTimeout: (fn, ms) => { if (!(ms >= 5000)) { setImmediate(fn); return 0; } timers.push({ fn, ms, done: false }); return timers.length; },
    clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: o.offline !== true, userAgent: 'test' },
    location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#weekly_natl', search: '', hash: '#weekly_natl', pathname: '/app.html' },
    // A request id must never reach the history (a «duplicate tab» copies it): any write here fails the test.
    history: { state: null, replaceState() { throw new Error('history.replaceState called'); }, pushState() { throw new Error('history.pushState called'); } },
    document: { currentScript: { src: 'https://x/core/plan-api.js?v=1' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    localStorage: mkStore(store), sessionStorage: mkStore(session),
    addEventListener() {}, removeEventListener() {},
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = ctx;
  store.set('tms_jwt', 'test.jwt.not-real');
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: Object.assign({}, init.headers || {}), body: init.body });
    return script(String(url), init.method || 'GET', init);
  };
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__errors = errors; ctx.__toasts = toasts; ctx.__expired = expired;
  vm.runInContext([
    "showErrorToast = function (m, t) { __toasts.push((t || 'error') + ': ' + m); };",
    "toast = function (m, t) { __toasts.push((t || 'success') + ': ' + m); };",
    'const __realLog = logError; logError = function (e, c) { __errors.push({ msg: e && e.message, ctx: c, kind: e && e.kind }); return __realLog(e, c); };',
    'const __realExp = tmsSessionExpired; tmsSessionExpired = function (w, r) { __expired.push(w); return __realExp(w, r); };',
  ].join('\n'), ctx, { filename: 'wn5-plan-sandbox-hooks' });
  const plan = () => calls.filter((c) => { try { return new URL(c.url).pathname.startsWith('/plan/'); } catch (_) { return false; } });
  return {
    ctx, calls, plan, errors, toasts, expired, store, session, timers,
    run: (code) => vm.runInContext(code, ctx),
    // Fire the long timers of `ms` (the fetch timeout); returns how many fired.
    fire: (ms) => { const due = timers.filter((t) => t.ms === ms && !t.done); due.forEach((t) => { t.done = true; t.fn(); }); return due.length; },
  };
}

// Runs one planFetch(…) expression inside the sandbox and brings back a plain record of how it ended.
export async function outcome(s, call) {
  return JSON.parse(await s.run(`(${call}).then(
    (x) => JSON.stringify({ ok: true, x }),
    (e) => JSON.stringify({ ok: false, name: e && e.name, kind: (e && e.kind) || null, code: (e && e.code) || null,
      status: e && e.status, type: (e && e.type) || null, m: e && e.message, maybeSaved: !!(e && e.maybeSaved), write: !!(e && e.write),
      route: (e && e.route) || null, gone: !!(e && e._sessionGone) }))`));
}
