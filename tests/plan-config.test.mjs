// node --test tests/plan-config.test.mjs
// National v5 F5 (FE-1): core/plan-config.js. GET /plan/config says whether 074 ran (day L written in the base).
// 200 / 404 no_route / 5xx → before-or-after / before / unknown; never a silent 'before' on a failure.
// The REAL core/constants.js, core/utils.js, core/api.js, core/plan-api.js and core/plan-config.js run in a vm with a
// scripted fetch. Synthetic data only. Nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
const FILES = ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-api.js', 'core/plan-config.js'];

function sandbox(answers, files = FILES) {
  const calls = [], store = new Map();
  const clock = { t: Date.UTC(2026, 9, 30, 12, 0, 0) };
  class FakeDate extends Date { static now() { return clock.t; } }
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController,
    Response, Headers, JSON, Math, Date: FakeDate, Promise, Array, Uint8Array, Error, Object, Set, Map, Intl,
    setTimeout: () => 0, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#weekly_intl' },
    history: { state: null, replaceState() {}, pushState() {} },
    document: { currentScript: { src: 'https://x/core/plan-config.js?v=1' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX', invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = ctx;
  store.set('tms_jwt', 'test.jwt.not-real');
  ctx.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/app-errors')) return new Response('{}', { status: 201 });
    calls.push({ url: u, method: init.method || 'GET' });
    const next = answers.shift();
    if (!next) throw new Error('unexpected request ' + u);
    if (next instanceof Error) throw next;
    return next;
  };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  // logError keeps a copy in localStorage (tms_errors): the one trace that does not depend on the network
  const errs = () => { try { return JSON.parse(store.get('tms_errors') || '[]'); } catch (_) { return []; } };
  return { calls, errs, clock, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const cfg = (s) => s.calls.filter((c) => new URL(c.url).pathname === '/plan/config');
const LOAD = (o) => `PlanConfig.load(${o || ''}).then((r) => JSON.stringify({ state: r.state, day: r.cutoverDay, open: r.writesOpen, code: r.err && r.err.code }))`;
const BEFORE = { cutover_day: null, opened_at: null, writes_open: false };

test('F5-FE1: 200 {cutover_day:null} → before; kept for the session (one GET)', async () => {
  const s = sandbox([json(200, BEFORE)]);
  assert.deepStrictEqual(JSON.parse(await s.run(LOAD())), { state: 'before', day: null, open: false, code: null });
  await s.run('PlanConfig.load()');
  assert.strictEqual(cfg(s).length, 1, 'a definite answer is read once per session');
  assert.strictEqual(s.errs().length, 0, 'nothing logged');
});

test('F5-FE1: 200 with cutover_day → after, with the day and writes_open as the Worker said', async () => {
  const s = sandbox([json(200, { cutover_day: '2026-10-31', opened_at: '2026-10-30T13:10:00Z', writes_open: true })]);
  assert.deepStrictEqual(JSON.parse(await s.run(LOAD())), { state: 'after', day: '2026-10-31', open: true, code: null });
});

test('F5-FE1: 404 no_route (Worker before deploy 1) → before, not logged (the known gap)', async () => {
  const s = sandbox([json(404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig sentinel' } })]);
  assert.deepStrictEqual(JSON.parse(await s.run(LOAD())), { state: 'before', day: null, open: false, code: null });
  assert.strictEqual(s.errs().length, 0, 'a designed gap is not an app error (B-34)');
  await s.run('PlanConfig.load()');
  assert.strictEqual(cfg(s).length, 1);
});

test('F5-FE1: 5xx → unknown, logged, NOT kept (the next call reads again); never a silent before', async () => {
  const s = sandbox([json(500, { error: { type: 'PLAN', code: 'plan_failed', message: 'rig sentinel 500' } }), json(200, BEFORE)]);
  assert.deepStrictEqual(JSON.parse(await s.run(LOAD())), { state: 'unknown', day: null, open: false, code: 'plan_failed' });
  assert.ok(s.errs().length >= 1, 'the failure is logged');
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before');
  assert.strictEqual(cfg(s).length, 2, 'one GET per call, never a retry inside load()');
});

test('F5-FE1: no network → unknown', async () => {
  const s = sandbox([new TypeError('Failed to fetch')]);
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'unknown');
});

test('F5-FE1: 403 (a PLAN_PERMS bug: every role has GET) → unknown AND logged although planFetch calls it designed', async () => {
  const s = sandbox([json(403, { error: { type: 'FORBIDDEN', code: 'forbidden', message: 'rig sentinel 403' } })]);
  assert.deepStrictEqual(JSON.parse(await s.run(LOAD())), { state: 'unknown', day: null, open: false, code: 'forbidden' });
  assert.ok(s.errs().length >= 1);
});

test('F5-FE1: a 200 in another shape → unknown config_shape, logged (bad day, missing writes_open, not an object)', async () => {
  for (const body of [{ cutover_day: '31/10/2026', writes_open: false }, { cutover_day: '2026-13-45', writes_open: false },
                      { cutover_day: '2026-02-30', writes_open: false }, { cutover_day: null }, { cutover_day: '2026-10-31', writes_open: 'true' }, []]) {
    const s = sandbox([json(200, body)]);
    const r = JSON.parse(await s.run(LOAD()));
    assert.deepStrictEqual(r, { state: 'unknown', day: null, open: false, code: 'config_shape' }, JSON.stringify(body));
    assert.ok(s.errs().length >= 1, 'logged: ' + JSON.stringify(body));
  }
});

test('F5-FE1: {fresh:true} reads again after a before, never after an after (after is final)', async () => {
  const s = sandbox([json(200, BEFORE), json(200, { cutover_day: '2026-10-31', opened_at: '2026-10-30T13:10:00Z', writes_open: false })]);
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before');
  assert.strictEqual(JSON.parse(await s.run(LOAD('{ fresh: true }'))).state, 'after', '074 ran between the two reads');
  await s.run('PlanConfig.load({ fresh: true })');
  assert.strictEqual(cfg(s).length, 2, 'after is final: no third GET');
});

test('F5-FE1: before is kept 5 minutes only — a tab opened before 074 learns after (review finding 1)', async () => {
  const s = sandbox([json(200, BEFORE), json(200, { cutover_day: '2026-10-31', opened_at: '2026-10-30T13:30:00Z', writes_open: false })]);
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before');
  s.clock.t += 4 * 60 * 1000;
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before', 'within 5 minutes: kept');
  assert.strictEqual(cfg(s).length, 1);
  s.clock.t += 2 * 60 * 1000;
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'after', 'past 5 minutes: read again');
  s.clock.t += 60 * 60 * 1000;
  await s.run('PlanConfig.load()');
  assert.strictEqual(cfg(s).length, 2, 'after is final: never read again');
});

test('F5-FE1: a fresh read that fails forgets the old before (review finding 3)', async () => {
  const s = sandbox([json(200, BEFORE), json(503, { error: { type: 'PLAN', code: 'slow', message: 'rig sentinel 503' } }), json(200, BEFORE)]);
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before');
  assert.strictEqual(JSON.parse(await s.run(LOAD('{ fresh: true }'))).state, 'unknown');
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before', 'the next plain call reads again, not the old answer');
  assert.strictEqual(cfg(s).length, 3);
});

test('F5-FE1: two callers at once share one GET', async () => {
  const s = sandbox([json(200, BEFORE)]);
  const both = JSON.parse(await s.run('Promise.all([PlanConfig.load(), PlanConfig.load()]).then((a) => JSON.stringify(a.map((r) => r.state)))'));
  assert.deepStrictEqual(both, ['before', 'before']);
  assert.strictEqual(cfg(s).length, 1);
});

test('F5-FE1: without core/plan-api.js → unknown config_no_client, logged, no fetch', async () => {
  const s = sandbox([], ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-config.js']);
  assert.deepStrictEqual(JSON.parse(await s.run(LOAD())), { state: 'unknown', day: null, open: false, code: 'config_no_client' });
  assert.strictEqual(cfg(s).length, 0);
  assert.ok(s.errs().length >= 1);
});

test('F5-FE1: nothing at load — defining PlanConfig fetches nothing', () => {
  const s = sandbox([]);
  assert.strictEqual(s.calls.length, 0);
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(PlanConfig.STATE)')), { BEFORE: 'before', AFTER: 'after', UNKNOWN: 'unknown' });
});
