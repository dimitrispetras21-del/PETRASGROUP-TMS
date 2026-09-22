// Level A (feat/tms-auditor), front half: the REAL core/api.js + core/utils.js loaded in a vm sandbox with
// stubbed browser globals and a scripted fetch. Proves: (1) no x-tms-req until the Worker announces support
// (rollback-safe CORS), (2) retries share one id (-1/-2/-3), (3) offline writes replay as <id>-q and leave a
// central «queue: offline flush» line, (4) errors carry the id into /app-errors.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox(script) {
  const calls = []; const errors = []; const store = new Map(); const onlineHandlers = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#orders' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    showErrorToast() {}, invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener: (ev, fn) => { if (ev === 'online') onlineHandlers.push(fn); }, location: ctx.location };
  ctx.fetch = async (url, init = {}) => {
    const h = init.headers || {};
    calls.push({ url: String(url), method: init.method || 'GET', req: h['x-tms-req'] || null, app: h['x-tms-app'] || null, body: init.body });
    return script(calls.length, String(url), init);
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/constants.js'), 'utf8'), ctx, { filename: 'constants.js' });   // app.html order
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/utils.js'), 'utf8'), ctx, { filename: 'utils.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/api.js'), 'utf8'), ctx, { filename: 'api.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/pallet-feed.js'), 'utf8'), ctx, { filename: 'pallet-feed.js' });
  // wrap logError to observe it, keeping the real forwarding to /app-errors
  ctx.__errors = errors;
  vm.runInContext('showErrorToast = function () {};', ctx);   // utils.js brings a DOM toast; no DOM here
  vm.runInContext('const __realLog = logError; logError = function (e, c) { __errors.push({ msg: e && e.message, ctx: c, req: e && e._req }); return __realLog(e, c); };', ctx);
  return { ctx, calls, errors, run: (code) => vm.runInContext(code, ctx), online: () => Promise.all(onlineHandlers.map((f) => f())) };
}
// The Worker announces Level A with a unix timestamp; `ageS` simulates an old (cached/stale) response.
const cap = (ageS = 0) => ({ 'x-tms-worker-req': String(Math.floor(Date.now() / 1000) - ageS) });
const ok = (withCap, ageS = 0) => new Response(JSON.stringify({ id: 'recA', fields: {} }), { status: 200, headers: withCap ? cap(ageS) : {} });
const facade = (calls) => calls.filter((c) => c.url.includes('/v0/'));

test('no header until the Worker announces Level A; then one id per action with -attempt', async () => {
  const s = sandbox(() => ok(true));
  await s.run("atPatch('tblT', 'recA', { Notes: 'x' })");
  await s.run("atPatch('tblT', 'recA', { Notes: 'y' })");
  const f = facade(s.calls);
  assert.equal(f[0].req, null, 'first request: capability not yet seen ⇒ no custom header (CORS-safe)');
  assert.match(f[1].req, /^[a-z0-9]{8,32}-1$/);
  assert.equal(f[1].app, '1790200000', 'x-tms-app = ?v= of api.js');
});

test('a Worker WITHOUT Level A (or a rollback) never receives x-tms-req', async () => {
  const s = sandbox(() => ok(false));
  for (let i = 0; i < 3; i++) await s.run(`atPatch('tblT', 'recA', { Notes: '${i}' })`);
  assert.ok(s.calls.every((c) => c.req === null));
});

test('retries share ONE id: -1, -2, -3', async () => {
  let n = 0;
  const s = sandbox((i, url) => { if (!url.includes('/v0/')) return new Response('{}', { status: 201 }); n++; return n === 1 ? ok(true) : n < 4 ? new Response('{}', { status: 502 }) : ok(true); });
  await s.run("atPatch('tblT', 'recA', { Notes: 'warmup' })");          // learn the capability
  await s.run("atPatch('tblT', 'recA', { Notes: 'x' })");
  const r = facade(s.calls).slice(1).map((c) => c.req);
  assert.equal(r.length, 3);
  const base = r[0].slice(0, -2);
  assert.deepEqual(r, [`${base}-1`, `${base}-2`, `${base}-3`]);
});

test('offline write is queued with its id and replayed as <id>-q; the flush leaves a central line', async () => {
  const s = sandbox(() => ok(true));
  await s.run("atPatch('tblT', 'recA', { Notes: 'warmup' })");
  s.ctx.navigator.onLine = false;
  const res = await s.run("atPatch('tblT', 'recB', { Notes: 'offline' })");
  assert.equal(res._offline, true);
  const q = JSON.parse(s.ctx.localStorage.getItem('tms_offline_queue'));
  assert.match(q[0].req, /^[a-z0-9]{8,32}$/);
  s.ctx.navigator.onLine = true;
  await s.online();
  const replay = s.calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/recB'));
  assert.equal(replay.req, `${q[0].req}-q`);
  const flush = s.errors.find((e) => e.ctx === 'queue');
  assert.match(flush.msg, /^offline flush synced 1, conflicts 0, failed 0/);
  const post = s.calls.find((c) => c.url.endsWith('/app-errors') && c.body.includes('offline flush'));
  assert.ok(JSON.parse(post.body).message.startsWith('queue: offline flush'), 'B-34 excludes this prefix');
  assert.equal(JSON.parse(post.body).kind, 'offline', 'stored as a non-error (app_errors.kind)');
});

test('a 403 carries the action id into logError and the /app-errors body', async () => {
  let n = 0;
  const s = sandbox((i, url) => { if (url.endsWith('/app-errors')) return new Response('{}', { status: 201 }); n++; return n === 1 ? ok(true) : new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }); });
  await s.run("atPatch('tblT', 'recA', { Notes: 'warmup' })");
  await assert.rejects(s.run("atPatch('tblT', 'recA', { Notes: 'x' })"));
  const e = s.errors.find((x) => x.ctx === '_atRetry 403');
  const sent = facade(s.calls)[1].req;
  assert.equal(`${e.req}-1`, sent, 'the logged error names the same action id the Worker saw');
  const post = s.calls.find((c) => c.url.endsWith('/app-errors'));
  assert.equal(JSON.parse(post.body).req, e.req);
});

test('a STALE capability timestamp (cached/old response, > 10′) never switches the header on', async () => {
  const s = sandbox(() => ok(true, 3600));
  for (let i = 0; i < 3; i++) await s.run(`atPatch('tblT', 'recA', { Notes: '${i}' })`);
  assert.ok(s.calls.every((c) => c.req === null));
});

test('hand-written fetches (plFetch → /pallets/*) carry an id once the capability is known; errors keep it', async () => {
  const s = sandbox((i, url) => { if (url.endsWith('/app-errors')) return new Response('{}', { status: 201 });
    return url.includes('/confirm') ? new Response(JSON.stringify({ error: 'nope' }), { status: 409, headers: cap() }) : ok(true); });
  await s.run("plFetch('/pallets/gate?order_recs=recA')");                       // learns the capability
  await assert.rejects(s.run("plFetch('/pallets/movements/1/confirm', { method: 'POST' })"), (e) => /^[a-z0-9]{8,32}$/.test(e._req));
  const pl = s.calls.filter((c) => c.url.includes('/pallets/'));
  assert.equal(pl[0].req, null, 'first call: capability not yet known');
  assert.match(pl[1].req, /^[a-z0-9]{8,32}-1$/);
});
