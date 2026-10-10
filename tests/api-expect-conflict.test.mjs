// node --test tests/api-expect-conflict.test.mjs
// Weekly International v4, core/api.js (docs/weekly-intl-redesign/TECH_DESIGN.md §g.3, WP6):
//   - without opts every PATCH body is byte-identical to before (other pages never pass opts);
//   - opts.expect travels as the top-level body key `_expect`;
//   - a 409 {error:{type:'conflict'}} on such a PATCH is ONE request: no retry, no toast,
//     one «atPatch 409 conflict» line, and an Error('conflict') carrying {fields, by, at, current};
//   - a 409 on a PATCH without opts keeps today's path (retried, then «Save failed»);
//   - atSafePatch(…, {expect}) returns {conflict:true, …} — the shape weekly_intl.js handles;
//   - the offline queue drops `_expect` (a later replay would compare against a stale read);
//   - capability detection: _expectChecked true → TMS_EXPECT_LIVE=true; absent → false + one log;
//     'skipped' leaves it as it was.
// The REAL core/utils.js + core/api.js run in a vm with a scripted fetch — same sandbox as
// tests/api-stock-refusals.test.mjs. Nothing leaves the process. Synthetic ids only.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox(script) {
  const calls = [], toasts = [], store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#weekly_intl' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener() {}, location: ctx.location };
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', raw: init.body || null, body: init.body ? JSON.parse(init.body) : null });
    return script(String(url), init.method || 'GET', calls.length);
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__toasts = toasts;
  vm.runInContext("showErrorToast = function (m, t) { __toasts.push((t || 'error') + ': ' + m); }; toast = function (m, t) { __toasts.push((t || 'success') + ': ' + m); };", ctx);
  const patches = () => calls.filter((c) => c.method === 'PATCH' && c.url.includes('/v0/'));
  const queue = () => JSON.parse(store.get('tms_offline_queue') || '[]');
  return { ctx, calls, toasts, patches, queue, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const appErrors = (calls) => calls.filter((c) => c.url.includes('/app-errors')).map((c) => c.body.message);
const flush = () => new Promise((r) => setImmediate(r));

const FIELDS = { 'Loading DateTime': '2026-10-15T08:00:00.000Z' };
const SEEN = { 'Loading DateTime': '2026-10-14T08:00:00.000Z' };
const CONFLICT = { error: { type: 'conflict', fields: ['Loading DateTime'], by: 'user', at: '2026-10-11T05:40:00Z', current: { 'Loading DateTime': '2026-10-16T08:00:00.000Z' } } };
const okRec = (extra = {}) => json(200, { id: 'recTEST0001', fields: FIELDS, ...extra });
const answerV0 = (fn) => (url, m, n) => (url.includes('/v0/') ? fn(url, m, n) : json(201, {}));
const A = (code) => `(${code}).then((r) => JSON.stringify({ ok: r }), (e) => JSON.stringify({ err: { m: e.message, conflict: e.conflict || null, noRetry: !!e._noRetry } }))`;

test('no opts: the PATCH body is byte-identical to before (no _expect, same key order)', async () => {
  const s = sandbox(answerV0(() => okRec()));
  await s.run(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)})`);
  assert.strictEqual(s.patches().length, 1);
  assert.strictEqual(s.patches()[0].raw, JSON.stringify({ fields: FIELDS, typecast: true }));
  assert.strictEqual(s.run('window.TMS_EXPECT_LIVE'), undefined, 'a plain PATCH says nothing about the check');
});

test('no opts: atSafePatch sends the same single PATCH, no version GET, and returns the record', async () => {
  const s = sandbox(answerV0(() => okRec()));
  const r = JSON.parse(await s.run(A(`atSafePatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)})`)));
  assert.strictEqual(r.ok.id, 'recTEST0001');
  assert.deepStrictEqual(s.calls.filter((c) => c.url.includes('/v0/')).map((c) => c.method), ['PATCH']);
  assert.strictEqual(s.patches()[0].raw, JSON.stringify({ fields: FIELDS, typecast: true }));
});

test('expect: the body carries _expect at the top level; _expectChecked:true → TMS_EXPECT_LIVE=true', async () => {
  const s = sandbox(answerV0(() => okRec({ _expectChecked: true })));
  const r = JSON.parse(await s.run(A(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  assert.strictEqual(r.ok._expectChecked, true, 'the caller can read the answer');
  assert.strictEqual(s.patches().length, 1);
  assert.strictEqual(s.patches()[0].raw, JSON.stringify({ fields: FIELDS, typecast: true, _expect: SEEN }));
  assert.strictEqual(s.run('window.TMS_EXPECT_LIVE'), true);
  await flush();
  assert.deepStrictEqual(appErrors(s.calls), []);
});

test('409 conflict with expect: ONE request, no toast, one «atPatch 409 conflict» line, the error carries the conflict', async () => {
  const s = sandbox(answerV0(() => json(409, CONFLICT)));
  const r = JSON.parse(await s.run(A(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  await flush();
  assert.strictEqual(s.patches().length, 1, 'a conflict must not be retried');
  assert.deepStrictEqual(r.err, { m: 'conflict', noRetry: true, conflict: { fields: CONFLICT.error.fields, by: 'user', at: CONFLICT.error.at, current: CONFLICT.error.current } });
  assert.deepStrictEqual(s.toasts, [], 'v4 shows its own dialog — no toast here');
  const logged = appErrors(s.calls);
  assert.strictEqual(logged.length, 1, logged.join(' / '));
  assert.ok(logged[0].startsWith('atPatch 409 conflict: tblO · recTEST0001 · Loading DateTime'), logged[0]);
  assert.strictEqual(s.run('getUndoAction()'), null, 'nothing was written, nothing to undo');
});

test('409 conflict with by:null / at:null keeps the nulls (the dialog then names nobody)', async () => {
  const s = sandbox(answerV0(() => json(409, { error: { type: 'conflict', fields: ['Truck'], by: null, at: null, current: { Truck: ['recTRUCK001'] } } })));
  const r = JSON.parse(await s.run(A(`atPatch('tblO', 'recTEST0001', { Truck: ['recTRUCK002'] }, { expect: { Truck: [] } })`)));
  assert.deepStrictEqual(r.err.conflict, { fields: ['Truck'], by: null, at: null, current: { Truck: ['recTRUCK001'] } });
});

test('409 WITHOUT opts: retried as today, then «Save failed» (other pages unchanged)', async () => {
  const s = sandbox(answerV0(() => json(409, CONFLICT)));
  const r = JSON.parse(await s.run(A(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)})`)));
  await flush();
  assert.strictEqual(s.patches().length, 3, 'today a 409 is retried silently (3 attempts)');
  assert.strictEqual(r.err.conflict, null, 'no conflict object without opts.expect');
  assert.ok(s.toasts.includes('error: Save failed'), s.toasts.join(' / '));
  assert.ok(s.patches().every((c) => !('_expect' in c.body)));
});

test('409 with expect but NOT a conflict body: not retried, falls to today\'s «Save failed»', async () => {
  const s = sandbox(answerV0(() => json(409, { error: { type: 'DUPLICATE', message: 'duplicate key' } })));
  const r = JSON.parse(await s.run(A(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  assert.strictEqual(s.patches().length, 1);
  assert.strictEqual(r.err.m, 'duplicate key');
  assert.strictEqual(r.err.conflict, null);
  assert.ok(s.toasts.includes('error: Save failed'), s.toasts.join(' / '));
});

test('atSafePatch with expect: a conflict is the RETURN value {conflict:true, …}', async () => {
  const s = sandbox(answerV0(() => json(409, CONFLICT)));
  const r = JSON.parse(await s.run(A(`atSafePatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  assert.deepStrictEqual(r.ok, { conflict: true, fields: CONFLICT.error.fields, by: 'user', at: CONFLICT.error.at, current: CONFLICT.error.current });
  assert.strictEqual(s.patches().length, 1);
  assert.strictEqual(s.calls.filter((c) => c.method === 'GET' && c.url.includes('/v0/')).length, 0, 'no version GET');
});

test('atSafePatch with expect: success returns the record; other errors still throw', async () => {
  const ok = sandbox(answerV0(() => okRec({ _expectChecked: true })));
  const r1 = JSON.parse(await ok.run(A(`atSafePatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  assert.strictEqual(r1.ok.id, 'recTEST0001');
  assert.strictEqual(ok.patches()[0].body._expect['Loading DateTime'], SEEN['Loading DateTime']);
  const bad = sandbox(answerV0(() => json(422, { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: 'bad value' } })));
  const r2 = JSON.parse(await bad.run(A(`atSafePatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  assert.ok(r2.err && r2.err.conflict === null, JSON.stringify(r2));
});

test('offline: the queued body drops _expect (a later replay would compare against a stale read)', async () => {
  const s = sandbox(answerV0(() => okRec()));
  s.ctx.navigator.onLine = false;
  const r = await s.run(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`);
  assert.strictEqual(r._offline, true);
  const q = s.queue();
  assert.strictEqual(q.length, 1);
  assert.deepStrictEqual(q[0].body, { fields: FIELDS });
  assert.strictEqual(s.patches().length, 0);
});

test('capability: 2xx WITHOUT _expectChecked → TMS_EXPECT_LIVE=false, logged once per page', async () => {
  const s = sandbox(answerV0(() => okRec()));
  await s.run(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`);
  await s.run(`atPatch('tblO', 'recTEST0002', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`);
  await flush();
  assert.strictEqual(s.run('window.TMS_EXPECT_LIVE'), false);
  const logged = appErrors(s.calls).filter((m) => m.startsWith('atPatch _expect ignored'));
  assert.strictEqual(logged.length, 1, logged.join(' / '));
});

test('capability: _expectChecked:"skipped" leaves TMS_EXPECT_LIVE as it was, and is returned to the caller', async () => {
  let answer = { _expectChecked: true };
  const s = sandbox(answerV0(() => okRec(answer)));
  await s.run(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`);
  answer = { _expectChecked: 'skipped' };
  const r = JSON.parse(await s.run(A(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`)));
  assert.strictEqual(r.ok._expectChecked, 'skipped');
  assert.strictEqual(s.run('window.TMS_EXPECT_LIVE'), true);
  const fresh = sandbox(answerV0(() => okRec({ _expectChecked: 'skipped' })));
  await fresh.run(`atPatch('tblO', 'recTEST0001', ${JSON.stringify(FIELDS)}, { expect: ${JSON.stringify(SEEN)} })`);
  assert.strictEqual(fresh.run('window.TMS_EXPECT_LIVE'), undefined);
});

test('_atRetry: opts.conflict returns a 409 at once; without it the 409 is retried', async () => {
  const s = sandbox(answerV0(() => json(409, CONFLICT)));
  const st1 = await s.run("_atRetry((r) => fetch('https://w.invalid/v0/appX/tblO/recTEST0001', { method: 'PATCH' }), 3, { conflict: true }).then((res) => res.status)");
  assert.strictEqual(st1, 409);
  assert.strictEqual(s.patches().length, 1);
  const st2 = await s.run("_atRetry((r) => fetch('https://w.invalid/v0/appX/tblO/recTEST0001', { method: 'PATCH' })).then((res) => res.status)");
  assert.strictEqual(st2, 409);
  assert.strictEqual(s.patches().length, 4, 'without opts: 3 attempts, as today');
  assert.deepStrictEqual(s.toasts, []);
});
