// node --test tests/api-offline-queue.test.mjs
// Offline queue replay (core/api.js _flushOfflineQueue), critic-3 Σ-02 round 1 / X3:
// the replay used a bare fetch and never read the answer, so a REFUSED write (4xx — e.g. a 422 rule,
// a 403) counted as «N αλλαγές συγχρονίστηκαν» and left the queue: the change was lost and the screen
// said it was saved (principle 1). Now:
//   2xx            → synced (unchanged)
//   4xx refusal    → dropped from the queue, loud Greek message naming table + record, logged
//   5xx / network  → stays queued for the next flush (a network error always did; a 5xx now does too)
//   401/408/429    → stays queued: session / timeout / rate limit are not an answer about the change
// The REAL core/utils.js + core/api.js run in a vm with a scripted fetch (same sandbox as
// tests/level-a-api.test.mjs). Nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox(script) {
  const calls = [], toasts = [], errors = [], store = new Map(), onlineHandlers = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#daily_ops' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    TABLES: { ORDERS: 'tblO', ORDER_STOPS: 'tblS' },
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener: (ev, fn) => { if (ev === 'online') onlineHandlers.push(fn); }, location: ctx.location };
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    return script(String(url), init.method || 'GET');
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__toasts = toasts; ctx.__errors = errors;
  vm.runInContext("showErrorToast = function (m, t) { __toasts.push((t || 'error') + ': ' + m); };", ctx);
  vm.runInContext('const __realLog = logError; logError = function (e, c) { __errors.push({ msg: e && e.message, ctx: c }); return __realLog(e, c); };', ctx);
  const queue = () => JSON.parse(store.get('tms_offline_queue') || '[]');
  return { ctx, calls, toasts, errors, queue, run: (code) => vm.runInContext(code, ctx), online: () => Promise.all(onlineHandlers.map((f) => f())) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const RULE = { error: { type: 'STOCK_RULE', code: 'piece_no_truck', message: 'Το κομμάτι δεν είναι σε φορτηγό' } };

// One write made offline, then the browser comes back online and the queue is replayed. The replay
// of the queued PATCH answers `answer`; the conflict-check GET and /app-errors answer 200.
async function replay(answer) {
  const s = sandbox((url, m) => {
    if (!url.includes('/v0/')) return json(201, {});
    if (m === 'GET') return json(200, { id: 'recP1', fields: { Status: 'Pending' } });
    return answer();
  });
  s.ctx.navigator.onLine = false;
  const r = await s.run("atPatch('tblO', 'recP1', { Status: 'In Transit' })");
  assert.strictEqual(r._offline, true);
  assert.strictEqual(s.queue().length, 1);
  s.toasts.length = 0;
  s.ctx.navigator.onLine = true;
  await s.online();
  return s;
}
const synced = (s) => s.toasts.filter((t) => /συγχρονίστηκαν/.test(t));
const flushLine = (s) => (s.errors.find((e) => e.ctx === 'queue') || {}).msg || '';

test('2xx: the replay counts as synced and leaves the queue (unchanged)', async () => {
  const s = await replay(() => json(200, { id: 'recP1', fields: { Status: 'In Transit' } }));
  assert.strictEqual(s.queue().length, 0);
  assert.deepStrictEqual(synced(s), ['info: 1 αλλαγές συγχρονίστηκαν']);
  assert.match(flushLine(s), /^offline flush synced 1, conflicts 0, failed 0/);
});

test('4xx refusal (422 rule): NOT «συγχρονίστηκαν» — dropped, loud Greek message naming table + record, logged', async () => {
  const s = await replay(() => json(422, RULE));
  assert.deepStrictEqual(synced(s), [], 'a refused write was reported as synced');
  assert.strictEqual(s.queue().length, 0, 'a deterministic refusal must not be replayed forever');
  const loud = s.toasts.filter((t) => /^error: .*ΑΠΟΡΡΙΦΘΗΚΕ/.test(t));
  assert.strictEqual(loud.length, 1, s.toasts.join(' / '));
  assert.ok(loud[0].includes('ORDERS') && loud[0].includes('recP1') && loud[0].includes(RULE.error.message), loud[0]);
  assert.ok(s.errors.some((e) => e.ctx === 'queue rejected' && e.msg.includes('recP1')), JSON.stringify(s.errors));
  assert.match(flushLine(s), /^offline flush synced 0, conflicts 0, failed 0, rejected 1/);
});

test('4xx refusal (403): same — not synced, dropped, said', async () => {
  const s = await replay(() => json(403, { error: 'Forbidden' }));
  assert.deepStrictEqual(synced(s), []);
  assert.strictEqual(s.queue().length, 0);
  assert.ok(s.toasts.some((t) => /ΑΠΟΡΡΙΦΘΗΚΕ/.test(t) && t.includes('recP1')), s.toasts.join(' / '));
});

test('5xx: stays queued for the next flush, not «συγχρονίστηκαν»', async () => {
  const s = await replay(() => json(503, { error: 'unavailable' }));
  assert.deepStrictEqual(synced(s), []);
  assert.strictEqual(s.queue().length, 1, 'a server error must not lose the change');
  assert.strictEqual(s.queue()[0].url.endsWith('/tblO/recP1'), true);
  assert.match(flushLine(s), /^offline flush synced 0, conflicts 0, failed 1/);
});

test('network error: stays queued (unchanged)', async () => {
  const s = await replay(() => { throw new TypeError('Failed to fetch'); });
  assert.deepStrictEqual(synced(s), []);
  assert.strictEqual(s.queue().length, 1);
  assert.match(flushLine(s), /^offline flush synced 0, conflicts 0, failed 1/);
});

for (const st of [401, 429]) {
  test(`${st}: stays queued — session / rate limit are not an answer about the change`, async () => {
    const s = await replay(() => json(st, { error: 'x' }));
    assert.deepStrictEqual(synced(s), []);
    assert.strictEqual(s.queue().length, 1);
    assert.ok(!s.toasts.some((t) => /ΑΠΟΡΡΙΦΘΗΚΕ/.test(t)), s.toasts.join(' / '));
  });
}
