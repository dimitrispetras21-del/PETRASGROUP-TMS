// node --test tests/wn5-plan-ids.test.mjs
// National v5 F4α T12: core/plan-ids.js. /plan/* wants bigint ids; the pickers of the app hold rec… legacy ids,
// and the warehouse role has no /costs/lookups (Ε-2). One GET /plan/lookups per session gives the catalogues.
// The route is NOT in the live Worker 39842d18: until it is, load() answers {ok:false} (404 no_route) and the
// screens say so; a failed read is not kept (the next dialog asks again — a user's act, never an automatic resend).
// The REAL core/constants.js, core/utils.js, core/api.js, core/plan-api.js and core/plan-ids.js run in a vm with a
// scripted fetch. Synthetic data only. Nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
const FILES = ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-api.js', 'core/plan-ids.js'];

function sandbox(answers) {
  const calls = [], store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController,
    Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map, Intl,
    setTimeout: () => 0, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#weekly_natl' },
    history: { state: null, replaceState() {}, pushState() {} },
    document: { currentScript: { src: 'https://x/core/plan-ids.js?v=1' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
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
    return next;
  };
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { calls, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const LOOKUPS = {
  locations: [{ id: 1, legacy_id: 'recLOC1', name: 'ΒΕΡΟΙΑ TEST', address: 'Test street 1', city: 'Test city 1', phone: null, is_hub: true },
              { id: 2, legacy_id: 'recLOC2', name: 'RENTIS TEST', address: null, city: 'Test city 2', phone: null, is_hub: false }],
  clients: [{ id: 41, legacy_id: 'recCLI41', company_name: 'ΠΕΛΑΤΗΣ Α' }],
  trucks: [{ id: 14, legacy_id: 'recTRK14', license_plate: 'TST-2108', active: true }, { id: 12, legacy_id: 'recTRK12', license_plate: 'TST-2106', active: false }],
  trailers: [{ id: 21, legacy_id: 'recTRL21', license_plate: 'TRL-5101', active: true }],
  drivers: [{ id: 31, legacy_id: 'recDRV31', full_name: 'Driver Test 01', active: true }],
  partners: [{ id: 51, legacy_id: 'recPRT51', company_name: 'Partner Test 01', active: true }],
};
const plan = (s) => s.calls.filter((c) => new URL(c.url).pathname === '/plan/lookups');

test('F4α-T12: 404 no_route → {ok:false} with the Worker code; the failure is not kept (the next open reads again)', async () => {
  const s = sandbox([json(404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig sentinel no_route' } }),
                     json(404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig sentinel no_route' } })]);
  const a = JSON.parse(await s.run("PlanIds.load().then((r) => JSON.stringify({ ok: r.ok, code: r.err && r.err.code, m: r.err && r.err.message }))"));
  assert.deepStrictEqual(a, { ok: false, code: 'no_route', m: 'rig sentinel no_route' });
  await s.run('PlanIds.load()');
  assert.strictEqual(plan(s).length, 2, 'one GET per open, never a retry inside load()');
  assert.deepStrictEqual(JSON.parse(s.run("JSON.stringify(PlanIds.list('truck'))")), [], 'no catalogue → empty list, never an invented one');
});

test('F4α-T12: id(\'location\', \'recX\') → number; an unknown one → PlanError kind client code ids_missing', async () => {
  const s = sandbox([json(200, LOOKUPS)]);
  assert.strictEqual(JSON.parse(await s.run('PlanIds.load().then((r) => JSON.stringify(r))')).ok, true);
  assert.strictEqual(s.run("PlanIds.id('location', 'recLOC2')"), 2);
  assert.strictEqual(s.run("PlanIds.id('client', 'recCLI41')"), 41);
  const e = JSON.parse(s.run("(() => { try { PlanIds.id('client', 'recNOPE'); return 'null'; } catch (e) { return JSON.stringify({ kind: e.kind, code: e.code, pe: e instanceof PlanError }); } })()"));
  assert.deepStrictEqual(e, { kind: 'client', code: 'ids_missing', pe: true });
  await s.run('PlanIds.load()');
  assert.strictEqual(plan(s).length, 1, 'a good catalogue is read once per session');
});

test('F4α-T12: list / place / hub read the catalogue as it came (labels, active flag, the hub)', async () => {
  const s = sandbox([json(200, LOOKUPS)]);
  await s.run('PlanIds.load()');
  assert.deepStrictEqual(JSON.parse(s.run("JSON.stringify(PlanIds.list('truck'))")), [
    { id: 12, legacy_id: 'recTRK12', label: 'TST-2106', active: false }, { id: 14, legacy_id: 'recTRK14', label: 'TST-2108', active: true }]);
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(PlanIds.place(1))')), { id: 1, legacy_id: 'recLOC1', name: 'ΒΕΡΟΙΑ TEST', address: 'Test street 1', city: 'Test city 1', phone: null });
  assert.strictEqual(s.run('PlanIds.place(999)'), null);
  assert.strictEqual(s.run('PlanIds.hub()'), 1);
});

test('F4α-T12: no_route of GET /plan/lookups is unlogged ONLY while the Worker has no such route (Ε-2)', async () => {
  const W = fs.readFileSync(path.join(ROOT, 'worker/src/index.js'), 'utf8');
  const has = W.includes('\\/plan\\/lookups') || W.includes('"/plan/lookups"');
  const src = fs.readFileSync(path.join(ROOT, 'core/plan-ids.js'), 'utf8');
  const pending = /const LOOKUPS_PENDING = true;/.test(src);
  assert.strictEqual(pending, !has, has ? 'the Worker serves GET /plan/lookups now: set LOOKUPS_PENDING = false (a 404 is a logged bug again)'
    : 'LOOKUPS_PENDING must stay true while the Worker has no /plan/lookups');
  // the ONLY code silenced, and only behind the flag (planFetch's opts.designed is pinned by the T1 test)
  assert.ok(/LOOKUPS_PENDING \? \{ designed: \['no_route'\] \} : undefined/.test(src), 'PlanIds.load must pass designed:[no_route] only behind LOOKUPS_PENDING');
});

test('F4α-T12: a catalogue without one of its six lists is refused loudly (ids_shape), never half-used', async () => {
  const broken = Object.assign({}, LOOKUPS); delete broken.trailers;
  const s = sandbox([json(200, broken)]);
  const a = JSON.parse(await s.run("PlanIds.load().then((r) => JSON.stringify({ ok: r.ok, code: r.err && r.err.code }))"));
  assert.deepStrictEqual(a, { ok: false, code: 'ids_shape' });
});
