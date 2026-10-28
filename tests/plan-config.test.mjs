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
  const s = sandbox([json(200, BEFORE), json(200, { cutover_day: '2026-10-31', opened_at: '2026-10-30T13:30:00Z', writes_open: false }),
    json(200, { cutover_day: '2026-10-31', opened_at: '2026-10-30T13:30:00Z', writes_open: false })]);
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before');
  s.clock.t += 4 * 60 * 1000;
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'before', 'within 5 minutes: kept');
  assert.strictEqual(cfg(s).length, 1);
  s.clock.t += 2 * 60 * 1000;
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'after', 'past 5 minutes: read again');
  s.clock.t += 4 * 60 * 1000;
  await s.run('PlanConfig.load()');
  assert.strictEqual(cfg(s).length, 2, 'after is kept 5 minutes');
  // F25: its DAY is asked again after 5 minutes (079 moved it); the state stays 'after'
  s.clock.t += 60 * 60 * 1000;
  assert.strictEqual(JSON.parse(await s.run(LOAD())).state, 'after');
  assert.strictEqual(cfg(s).length, 3, 'after is read again after 5 minutes (F25)');
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

// ── vsState (Ε1/Ε2/Ε20): rec → base id through /pallets/gate, then /plan/vs-state ──
const VSF = ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-api.js', 'core/pallet-feed.js', 'core/plan-config.js'];
const gate = (rows) => json(200, { records: rows.map(([rec, id]) => ({ order_rec: rec, order_id: id })) });
const VS = (s, recs) => s.run(`PlanConfig.vsState(${JSON.stringify(recs)}).then((m) => JSON.stringify([...m]), (e) => JSON.stringify({ err: e.code || e.message }))`);

test('F5-FE1 vsState: a bridge → its entry; «missing» stays the base\'s word; keyed by rec', async () => {
  const st = { carriers: [{ kind: 'owned', text: 'TST-1 / D1', code: 'R1', hub_day: '2026-10-31' }], all_executed: false, all_planned: true, first_hub_day: '2026-10-31', n_pieces: 2 };
  const s = sandbox([gate([['recVS1', 101], ['recVS2', 102]]), json(200, { 101: st, 102: 'missing' })], VSF);
  assert.deepStrictEqual(JSON.parse(await VS(s, ['recVS1', 'recVS2', 'recVS1'])), [['recVS1', st], ['recVS2', 'missing']]);
  const paths = s.calls.map((c) => new URL(c.url).pathname + new URL(c.url).search);
  assert.deepStrictEqual(paths, ['/pallets/gate?order_recs=recVS1%2CrecVS2', '/plan/vs-state?order_ids=101,102']);
});

test('F5-FE1 vsState: a rec the gate does not map → error vs_unmapped, no vs-state call (never «missing»); the caller logs it, once', async () => {
  const s = sandbox([gate([['recVS1', 101]])], VSF);
  assert.deepStrictEqual(JSON.parse(await VS(s, ['recVS1', 'recVS9'])), { err: 'vs_unmapped' });
  assert.strictEqual(s.calls.length, 1);
  assert.strictEqual(s.errs().length, 0, 'not logged here: the caller logs (review finding 4: never twice)');
});

test('F5-FE1 vsState: vs-state fails or answers another shape → throws (the caller shows «απέτυχε»)', async () => {
  let s = sandbox([gate([['recVS1', 101]]), json(500, { error: { type: 'PLAN', code: 'plan_failed', message: 'rig 500' } })], VSF);
  assert.deepStrictEqual(JSON.parse(await VS(s, ['recVS1'])), { err: 'plan_failed' });
  s = sandbox([gate([['recVS1', 101]]), json(200, { 101: { n_pieces: 1 } })], VSF);
  assert.deepStrictEqual(JSON.parse(await VS(s, ['recVS1'])), { err: 'vs_shape' });
  s = sandbox([json(500, { error: 'rig gate down' })], VSF);
  assert.ok(JSON.parse(await VS(s, ['recVS1'])).err, 'a gate failure throws');
});

test('F5-FE1 vsState: no recs → empty map, no request; 301 recs → two gate calls', async () => {
  let s = sandbox([], VSF);
  assert.deepStrictEqual(JSON.parse(await VS(s, [])), []);
  assert.strictEqual(s.calls.length, 0);
  const recs = Array.from({ length: 301 }, (_, i) => 'recV' + i);
  s = sandbox([gate(recs.slice(0, 300).map((r, i) => [r, i + 1])), gate([[recs[300], 301]]),
               json(200, Object.fromEntries(recs.map((_, i) => [String(i + 1), 'missing'])))], VSF);
  assert.strictEqual(JSON.parse(await VS(s, recs)).length, 301);
  assert.strictEqual(s.calls.filter((c) => c.url.includes('/pallets/gate')).length, 2);
});

test('F5-FE1 isLegacyTable: NAT_ORDERS / NAT_LOADS / GL_LINES / CONS_LOADS only', () => {
  const s = sandbox([]);
  s.run("globalThis.TABLES = { ORDERS: 'tO', NAT_ORDERS: 'tNO', NAT_LOADS: 'tNL', GL_LINES: 'tGL', CONS_LOADS: 'tCL', TRUCKS: 'tT' }");
  assert.deepStrictEqual(JSON.parse(s.run("JSON.stringify(['tO','tNO','tNL','tGL','tCL','tT',null].map((t) => PlanConfig.isLegacyTable(t)))")),
    [false, true, true, true, true, false, false]);
});

// F25 (live 28/10): 079 moved day L 31/10 → 24/10; a tab opened before kept 31/10 forever ('after' was final).
const AFTER = (day) => ({ cutover_day: day, opened_at: '2026-10-28T12:00:00Z', writes_open: true });
const LOADR = (o) => `PlanConfig.load(${o}).then((r) => JSON.stringify({ state: r.state, day: r.cutoverDay, rerr: !!r.recheckErr }))`;

test('F25: an \'after\' older than 5 min is read again — the board ({recheck:true}) waits for it, every other call gets the kept one at once and the new day next', async () => {
  const s = sandbox([json(200, AFTER('2026-10-31')), json(200, AFTER('2026-10-24')), json(200, AFTER('2026-10-17'))]);
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR(''))), { state: 'after', day: '2026-10-31', rerr: false });
  // within 5 minutes: from memory, every kind of call
  s.clock.t += 4 * 60 * 1000;
  await s.run('PlanConfig.load({ fresh: true })');
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR('{ recheck: true }'))), { state: 'after', day: '2026-10-31', rerr: false });
  assert.strictEqual(cfg(s).length, 1, 'no re-read within 5 minutes');
  // a write path ({fresh}) after 5 minutes: answered at once with the kept day, the re-read runs behind it
  s.clock.t += 60 * 1000;
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR('{ fresh: true }'))), { state: 'after', day: '2026-10-31', rerr: false });
  assert.strictEqual(cfg(s).length, 2, 'the re-read started');
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));   // the re-read behind the call lands
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR(''))), { state: 'after', day: '2026-10-24', rerr: false });
  // the board after 5 more minutes: it waits for the answer and gets the moved day in the same call
  s.clock.t += 6 * 60 * 1000;
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR('{ recheck: true }'))), { state: 'after', day: '2026-10-17', rerr: false });
  assert.strictEqual(cfg(s).length, 3);
});

test('F25: recheck \'now\' asks at once; a failed recheck keeps the day read before, flagged for EVERY caller, logged, asked again after 5 min', async () => {
  const s = sandbox([json(200, AFTER('2026-10-31')), json(500, { error: { type: 'INTERNAL', code: 'plan_failed', message: 'boom' } }),
    json(200, BEFORE), json(200, AFTER('2026-10-31'))]);
  await s.run(LOADR(''));
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR("{ recheck: 'now' }"))), { state: 'after', day: '2026-10-31', rerr: true });
  assert.ok(s.errs().length >= 1, 'the failed recheck is logged');
  // another screen's plain call: the same flag, from memory (not asked again within 5 minutes)
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR(''))), { state: 'after', day: '2026-10-31', rerr: true });
  assert.strictEqual(cfg(s).length, 2);
  // a 'before' after 074 ran is not believed: the kept day stays, flagged — as what the base SAID, not a failed read
  assert.deepStrictEqual(JSON.parse(await s.run("PlanConfig.load({ recheck: 'now' }).then((r) => JSON.stringify({ state: r.state, day: r.cutoverDay, code: r.recheckErr && r.recheckErr.code }))")),
    { state: 'after', day: '2026-10-31', code: 'config_went_before' });
  // a good answer clears the flag
  assert.deepStrictEqual(JSON.parse(await s.run(LOADR("{ recheck: 'now' }"))), { state: 'after', day: '2026-10-31', rerr: false });
});

test('F25 code review: a recheck answered 404 no_route keeps the day, says the route is gone, logs nothing', async () => {
  const s = sandbox([json(200, AFTER('2026-10-31')), json(404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'no route' } })]);
  await s.run(LOADR(''));
  const n0 = s.errs().length;
  assert.deepStrictEqual(JSON.parse(await s.run("PlanConfig.load({ recheck: 'now' }).then((r) => JSON.stringify({ state: r.state, day: r.cutoverDay, code: r.recheckErr && r.recheckErr.code }))")),
    { state: 'after', day: '2026-10-31', code: 'config_no_route' });
  assert.strictEqual(s.errs().length, n0, 'no app_errors row for the known gap');
});
