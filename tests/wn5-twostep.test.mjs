// node --test tests/wn5-twostep.test.mjs
// National v5 F4α T11: WN5Act.twoStep — the ONE two-step mechanism of Move / Clear / Delete (S-82, decisions 7–8):
//   dry run → list → confirm sends the SAME body + confirm_token; an empty list with needs_confirm:false runs at once;
//   428 need_token → the list opens; 422 stale_confirm → a new dry run, a new list, a new token;
//   and never a resend the user did not press (decision 44): after a 500 plan_unknown nothing goes again by itself.
// The REAL core/constants.js, core/utils.js, core/api.js, core/plan-api.js, core/wn5-labels.js and
// modules/wn5_actions.js run in a vm with a scripted fetch; the dialog is replaced through the WN5Act._ui seam
// (the mechanism is under test here, the DOM in the rigs). Nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
const FILES = ['core/constants.js', 'core/utils.js', 'core/api.js', 'core/plan-api.js', 'core/wn5-labels.js', 'modules/wn5_actions.js'];

function sandbox(answers) {
  const calls = [], store = new Map(), session = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController,
    Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map, Intl,
    // never fire: _fetchWithTimeout's abort timer must not abort a scripted answer
    setTimeout: () => 0, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' },
    location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#weekly_natl', search: '', hash: '#weekly_natl' },
    history: { state: null, replaceState() { throw new Error('history.replaceState called'); }, pushState() { throw new Error('history.pushState called'); } },
    document: { currentScript: { src: 'https://x/modules/wn5_actions.js?v=1' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) },
    addEventListener() {}, removeEventListener() {},
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX', invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = ctx;                         // window.WN5Act must be the global the test reads
  store.set('tms_jwt', 'test.jwt.not-real');
  ctx.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/app-errors')) return new Response('{}', { status: 201 });
    calls.push({ url: u, method: init.method || 'GET', body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = answers.shift();
    // A runaway loop (a resend nobody pressed) would spin on the throw below forever, in microtasks only: past 10
    // requests it gets a 200 and ends, so the test's call count fails it instead of hanging the suite.
    if (!next && calls.length > 10) return OK();
    if (!next) throw new Error('script ran out of answers: an unexpected request ' + (init.method || 'GET') + ' ' + u);
    return next;
  };
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  // The dialog seam: every ask is recorded and answered from a list (null = the user pressed «Άκυρο»).
  vm.runInContext(`var __asks = [], __fails = [], __done = 0, __replies = [];
    WN5Act._ui = { ask(dry, s) { __asks.push({ token: dry.confirm_token, n: (dry.consequences || []).length, kind: s.kind }); return Promise.resolve(__replies.length ? __replies.shift() : (__asks.length > 5 ? null : { extra: {} })); },   // > 5 asks = a loop: cancel
                   fail(s, e) { __fails.push(e && e.code); }, done() { __done++; } };`, ctx);
  return { ctx, calls, session, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status, type, code) => json(status, { error: { type, code, message: 'rig sentinel ' + code } });
const DRY = (tok, cons, needs) => json(200, { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: needs === undefined ? cons.length > 0 : needs, confirm_token: tok, consequences: cons });
// a Response body is read once: every answer is a new object
const OK = () => json(200, { ok: true, op: 'plan_move_pieces', dry_run: false, ids: { rt_id: 204, piece_ids: [5101] }, warnings: [], notice_ids: [] });
const RTC = [{ kind: 'rt_cancelled', rt_id: 201, code: 'RT-T201' }];
const SPEC = `{ method: 'POST', path: '/plan/move', body: { from: { piece_ids: [5101], rt_id: 201 }, target: { rt_id: 204, side: 'KATHODOS' } }, kind: 'move', title: 'Μεταφορά', verb: 'Μεταφορά' }`;
const go = (s, spec = SPEC) => s.run(`var __spec = ${spec}; var __before = JSON.stringify(__spec.body);
  WN5Act.twoStep(__spec).then((r) => JSON.stringify({ r, same: JSON.stringify(__spec.body) === __before }))`).then(JSON.parse);
const BODY = { from: { piece_ids: [5101], rt_id: 201 }, target: { rt_id: 204, side: 'KATHODOS' } };

test('F4α-T11: dry run → list → confirm sends the SAME body + confirm_token', async () => {
  const s = sandbox([DRY('tok1', RTC), OK()]);
  const out = await go(s);
  assert.strictEqual(s.calls.length, 2, s.calls.map((c) => c.method + ' ' + c.url).join(' / '));
  assert.deepStrictEqual(s.calls[0].body, Object.assign({}, BODY, { dry_run: true }));
  assert.deepStrictEqual(s.calls[1].body, Object.assign({}, BODY, { confirm_token: 'tok1' }), 'the execution is the dry-run body without dry_run, plus the token');
  assert.strictEqual(out.r.ok, true);
  assert.strictEqual(out.same, true, 'twoStep must not mutate the caller\'s body');
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(__asks)')), [{ token: 'tok1', n: 1, kind: 'move' }]);
  assert.strictEqual(s.run('__done'), 1);
});

test('F4α-T11: empty list and needs_confirm:false → executes without a dialog', async () => {
  const s = sandbox([DRY('tok0', [], false), OK()]);
  const out = await go(s);
  assert.strictEqual(s.calls.length, 2);
  assert.strictEqual(s.calls[1].body.confirm_token, 'tok0');
  assert.strictEqual(s.run('__asks.length'), 0, 'no dialog for an empty list');
  assert.strictEqual(out.r.ok, true);
});

test('F4α-T11: 428 need_token → the list reopens (new dry run, the dialog, its token)', async () => {
  const s = sandbox([DRY('tok0', [], false), err(428, 'PLAN_RULE', 'need_token'), DRY('tok2', RTC), OK()]);
  const out = await go(s);
  assert.deepStrictEqual(s.calls.map((c) => !!(c.body && c.body.dry_run)), [true, false, true, false]);
  assert.strictEqual(s.calls[3].body.confirm_token, 'tok2');
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(__fails)')), ['need_token']);
  assert.strictEqual(s.run('__asks.length'), 1);
  assert.strictEqual(out.r.ok, true);
});

test('F4α-T11: 422 stale_confirm → dry run again, new list, new token', async () => {
  const s = sandbox([DRY('tok1', RTC), err(422, 'PLAN_RULE', 'stale_confirm'), DRY('tok2', RTC.concat([{ kind: 'executed_leg', leg_id: 1, rt_id: 201, stop_day: '2026-10-12' }])), OK()]);
  await go(s);
  assert.strictEqual(s.calls.length, 4);
  assert.strictEqual(s.calls[1].body.confirm_token, 'tok1');
  assert.strictEqual(s.calls[3].body.confirm_token, 'tok2');
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(__asks)')).map((a) => [a.token, a.n]), [['tok1', 1], ['tok2', 2]]);
});

test('F4α-T11: the dry run and the execution are two fetches, never three — a 500 plan_unknown is not re-sent by itself', async () => {
  const s = sandbox([DRY('tok1', RTC), err(500, 'SERVER', 'plan_unknown')]);
  s.run('__replies.push({ extra: {} }, null);');   // press «Μεταφορά», then the strip shows, then «Άκυρο»
  const out = await go(s);
  assert.strictEqual(s.calls.length, 2, 'a second execution went out without a second press');
  assert.strictEqual(out.r, null);
  assert.deepStrictEqual(JSON.parse(s.run('JSON.stringify(__fails)')), ['plan_unknown']);
  // The same with an empty list (no dialog ever opened): here a loop back would send the execution again with no
  // press at all — the plan's mutation (a), which the case above cannot see (its loop asks the dialog first).
  const e = sandbox([DRY('tok0', [], false), err(500, 'SERVER', 'plan_unknown')]);
  const out0 = await go(e);
  assert.strictEqual(e.calls.length, 2, 'no dialog, and a second execution went out by itself');
  assert.strictEqual(out0.r, null);
  assert.strictEqual(e.run('__asks.length'), 0);
});

test('F4α-T11: a required field goes into the execution body only (the reason of a delete)', async () => {
  const s = sandbox([DRY('tokD', [{ kind: 'invoiced', nat_order_id: 3111 }]), json(200, { ok: true, op: 'plan_delete', dry_run: false, ids: { nat_order_ids: [3111] }, warnings: [], notice_ids: [] })]);
  s.run(`__replies.push({ extra: { reason: 'λάθος καταχώρηση' } });`);
  await go(s, `{ method: 'POST', path: '/plan/delete', body: { nat_order_id: 3111 }, kind: 'delete', title: 'Διαγραφή', verb: 'Διαγραφή', danger: true, field: { key: 'reason', label: 'Λόγος *' } }`);
  assert.deepStrictEqual(s.calls[0].body, { nat_order_id: 3111, dry_run: true });
  assert.deepStrictEqual(s.calls[1].body, { nat_order_id: 3111, reason: 'λάθος καταχώρηση', confirm_token: 'tokD' });
});

test('F4α-T11: weekly_natl_v5.js hands its root to WN5Act.bind, exposes WN5.state and shows the notices error through WN5Act.strip', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'weekly_natl_v5.js'), 'utf8');
  assert.match(src, /WN5Act\.bind\(/, 'the painted root is never handed to WN5Act.bind');
  assert.match(src, /WN5Act\.closeAll\(/, 'leaving the page leaves a dialog open');
  assert.match(src, /\bstate\s*(?::|\()/, 'WN5.state() is missing');
  assert.match(src, /WN5Act\.strip\(/, 'the notices strip still writes its own error line (T8 → T11)');
});
