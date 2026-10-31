// node --test tests/relogin.test.mjs
// F36 (owner 31/10/2026): a 401 opens the login window over the page (core/relogin.js) instead of leaving for
// index.html. Proven here on the REAL core/constants.js + core/utils.js + core/api.js + core/plan-api.js in a vm with
// a scripted fetch and a recording tmsReloginOpen (the window's DOM is proven in real Chromium:
// tests/critics/f36-reload-relogin-rig.js):
//   1. no navigation on a 401 when the window exists; the window is told whether a WRITE was lost;
//   2. a facade write is never re-sent by itself — after the login only the user's next press sends;
//   3. a /plan/* write with a request_id waits for the login and is sent once more with the SAME request_id;
//      one without a request_id is refused (one fetch) and the window says «πάτα ξανά Αποθήκευση»;
//   4. the offline queue left unsent at the session's end is flushed after the window login;
//   5. index.html and core/relogin.js read the JWT expiry with the same function body.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RID = '0b6f4b52-5d43-4c0e-9a51-0d6a3c0f5e11';

function sandbox(answer) {
  const calls = [], hrefs = [], opens = [], store = new Map([['tms_user', '{"username":"t","role":"dispatcher"}'], ['tms_jwt', 'jwt.old']]);
  const location = { hostname: 'dimitrispetras21-del.github.io', origin: 'https://x', hash: '#weekly_natl' };
  let href = 'https://x/app.html#weekly_natl';
  Object.defineProperty(location, 'href', { get: () => href, set: (v) => { hrefs.push(v); href = v; } });
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location,
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, referrer: '', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    performance: { getEntriesByType: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = ctx; ctx.addEventListener = () => {};
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '', auth: (init.headers || {}).Authorization || null });
    return answer(String(url), init.method || 'GET', calls.length);
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-api.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__opens = opens;
  vm.runInContext('showErrorToast = function () {}; window.tmsReloginOpen = function (lost) { __opens.push(!!lost); };', ctx);
  // what core/relogin.js does after a login of the same user: a new token, then the page works again
  const relogin = () => { store.set('tms_jwt', 'jwt.new'); vm.runInContext('tmsSessionRestored()', ctx); };
  return { calls, hrefs, opens, store, relogin, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const PLAN401 = { error: { type: 'AUTH', code: 'unauthorized', message: 'rig' } };
const tick = () => new Promise((r) => setImmediate(r));

test('a facade PATCH that gets 401: no navigation, the window opens saying a write was lost, nothing is re-sent after the login', async () => {
  const s = sandbox((url, m, n) => (n === 1 ? json(401, { error: 'Unauthorized' }) : json(200, { id: 'recT1', fields: {} })));
  const e = await s.run("atPatch('tblEAPExIAjiA3asD', 'recT1', { Active: true }).catch((e) => e)");
  assert.strictEqual(e._sessionGone, true);
  assert.strictEqual(e.message, 'Η σύνδεση έληξε');
  assert.deepStrictEqual(s.hrefs, [], 'never leaves the page');
  assert.ok(s.opens.length >= 1 && s.opens.includes(true), 'the window says «πάτα ξανά Αποθήκευση»: ' + s.opens);
  s.relogin();
  await tick(); await tick();
  assert.strictEqual(s.calls.length, 1, 'the refused PATCH is never sent again by itself');
  // the user presses Save again: sent, with the new token
  const r = await s.run("atPatch('tblEAPExIAjiA3asD', 'recT1', { Active: true })");
  assert.strictEqual(r.id, 'recT1');
  assert.strictEqual(s.calls.length, 2);
  assert.strictEqual(s.calls[1].auth, 'Bearer jwt.new');
});

test('a GET that gets 401: the window opens WITHOUT the «πάτα ξανά Αποθήκευση» line', async () => {
  const s = sandbox(() => json(401, { error: 'Unauthorized' }));
  await s.run("atGet('tblEAPExIAjiA3asD', '', true).catch((e) => e)");
  assert.deepStrictEqual(s.hrefs, []);
  assert.ok(s.opens.length >= 1 && !s.opens.includes(true), String(s.opens));
});

test('a /plan/* write WITH a request_id: waits for the login, then is sent once more with the same request_id', async () => {
  const s = sandbox((url, m, n) => (n === 1 ? json(401, PLAN401) : json(200, { ok: true, order_id: 7 })));
  let out = null;
  s.run(`planFetch('POST', '/plan/orders', { body: { client_id: 1 }, requestId: '${RID}' })`).then((v) => { out = v; }, (e) => { out = 'threw ' + e.message; });
  await tick(); await tick(); await tick();
  assert.strictEqual(out, null, 'still waiting for the login, neither answered nor refused');
  assert.strictEqual(s.calls.length, 1);
  assert.deepStrictEqual(s.hrefs, []);
  assert.ok(s.opens.length >= 1 && !s.opens.includes(true), 'it will be sent by itself: no «πάτα ξανά» line');
  s.relogin();
  for (let i = 0; i < 6 && out === null; i++) await tick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), { ok: true, order_id: 7 });
  assert.strictEqual(s.calls.length, 2, 'exactly one more send');
  assert.strictEqual(JSON.parse(s.calls[0].body).request_id, RID);
  assert.strictEqual(JSON.parse(s.calls[1].body).request_id, RID, 'the SAME request_id: the DB replays, never writes twice');
  assert.strictEqual(s.calls[1].auth, 'Bearer jwt.new');
});

test('a /plan/* write WITHOUT a request_id: one fetch, refused, the window says «πάτα ξανά Αποθήκευση», not sent after the login', async () => {
  const s = sandbox((url, m, n) => (n === 1 ? json(401, PLAN401) : json(200, { ok: true })));
  const out = await s.run("planFetch('POST', '/plan/move', { body: { piece_id: 1 } }).then(() => 'answered', (e) => e)");
  assert.strictEqual(out._sessionGone, true);
  assert.ok(s.opens.includes(true), String(s.opens));
  s.relogin();
  await tick(); await tick();
  assert.strictEqual(s.calls.length, 1);
  assert.deepStrictEqual(s.hrefs, []);
});

test('a /plan/* write with a request_id made while the session is already gone: no fetch until the login, then one', async () => {
  const s = sandbox((url, m, n) => (url.includes('/plan/') ? json(200, { ok: true }) : json(401, { error: 'Unauthorized' })));
  await s.run("atGet('tblEAPExIAjiA3asD', '', true).catch((e) => e)");   // the page's first 401 ends the session
  let out = null;
  s.run(`planFetch('POST', '/plan/pieces/split', { body: { piece_id: 3 }, requestId: '${RID}' })`).then((v) => { out = v; }, (e) => { out = 'threw ' + e.message; });
  await tick(); await tick();
  assert.strictEqual(s.calls.filter((c) => c.url.includes('/plan/')).length, 0, 'nothing sent while the window is open');
  s.relogin();
  for (let i = 0; i < 6 && out === null; i++) await tick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), { ok: true });
  assert.strictEqual(s.calls.filter((c) => c.url.includes('/plan/')).length, 1);
});

test('the offline queue kept at the session\'s end is flushed after the window login (it used to be the next page\'s load)', async () => {
  const s = sandbox((url, m) => (m === 'GET' && s.calls.length === 1 ? json(401, { error: 'Unauthorized' }) : json(200, { id: 'recQ1', fields: {} })));
  await s.run("atGet('tblEAPExIAjiA3asD', '', true).catch((e) => e)");   // the session ends
  s.store.set('tms_offline_queue', JSON.stringify([{ method: 'POST', url: 'https://w.invalid/v0/appX/tblEAPExIAjiA3asD', body: { fields: { Plate: 'Q' } }, timestamp: 1 }]));
  s.run('_loadOfflineQueue()');
  assert.strictEqual(s.calls.length, 1, 'nothing sent while the session is gone');
  s.relogin();
  for (let i = 0; i < 6 && s.calls.length < 2; i++) await tick();
  assert.strictEqual(s.calls.length, 2, 'the queued change is sent once, after the login');
  assert.strictEqual(s.calls[1].method, 'POST');
  assert.strictEqual(s.calls[1].auth, 'Bearer jwt.new');
});

test('index.html and core/relogin.js read the JWT expiry with the same function body', () => {
  const body = (src) => (src.match(/function _jwtExpiryMs\(token\) \{[\s\S]*?\n {0,2}\}\n/) || [])[0];
  const a = body(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const b = body(fs.readFileSync(path.join(ROOT, 'core/relogin.js'), 'utf8'));
  assert.ok(a && b, 'both found');
  assert.strictEqual(a.replace(/^ +/gm, ''), b.replace(/^ +/gm, ''));
});
