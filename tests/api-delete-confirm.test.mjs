// node --test tests/api-delete-confirm.test.mjs
// F5 FE-1 / Ε19 (Worker deploy 1, stream b): DELETE of an order with consequences answers 428 {error:{code:
// 'need_token'}, preview:{consequences, confirm_token}}. core/api.js must NOT resend it (it used to, twice, and
// then fall out as a plain non-ok), must not log it as an app error, and atWithDeleteConfirm shows the list and
// resends with ?confirm_token= only on «yes». The REAL core/constants.js, utils.js, api.js in a vm. Synthetic data.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
function sandbox(answers, yes) {
  const calls = [], asked = [], store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController,
    Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map, Intl,
    setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html' },
    history: { state: null, replaceState() {}, pushState() {} },
    document: { currentScript: { src: 'https://x/core/api.js?v=1' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, confirm: (t) => { asked.push(t); return yes; },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
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
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext('showErrorToast = function () {}; toast = function () {};', ctx);   // no DOM here: the toasts are not under test
  const errs = () => { try { return JSON.parse(store.get('tms_errors') || '[]'); } catch (_) { return []; } };
  return { calls, asked, errs, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const P428 = () => json(428, { error: { type: 'PLAN_RULE', code: 'need_token', message: 'rig: confirm' }, preview: { consequences: ['Σβήνει 1 στάση', { text: 'Αποσύρει 2 κομμάτια' }], confirm_token: 'tok-1' } });
const dels = (s) => s.calls.filter((c) => c.method === 'DELETE').map((c) => new URL(c.url).pathname.split('/').pop() + new URL(c.url).search);
const DEL = "atWithDeleteConfirm((tok) => atDelete('tblORD', 'recO1', { confirmToken: tok })).then((r) => JSON.stringify({ ok: true, r }), (e) => JSON.stringify({ ok: false, m: e.message, c: !!e._cancelled, nt: !!e._needToken }))";

test('F5-FE1 Ε19: 428 → one DELETE only (never resent), thrown with the preview, not logged', async () => {
  const s = sandbox([P428()], false);
  const r = JSON.parse(await s.run("atDelete('tblORD', 'recO1').then(() => '{}', (e) => JSON.stringify({ nt: e._needToken, nr: e._noRetry, tok: e.preview && e.preview.confirm_token, n: e.preview.consequences.length }))"));
  assert.deepStrictEqual(r, { nt: true, nr: true, tok: 'tok-1', n: 2 });
  assert.deepStrictEqual(dels(s), ['recO1']);
  assert.strictEqual(s.errs().length, 0, 'a designed answer is not an app error');
});

test('F5-FE1 Ε19: «yes» → the list in words, then DELETE ?confirm_token=tok-1', async () => {
  const s = sandbox([P428(), json(200, { id: 'recO1', deleted: true })], true);
  assert.deepStrictEqual(JSON.parse(await s.run(DEL)), { ok: true, r: { id: 'recO1', deleted: true } });
  assert.deepStrictEqual(dels(s), ['recO1', 'recO1?confirm_token=tok-1']);
  assert.match(s.asked[0], /Σβήνει 1 στάση/); assert.match(s.asked[0], /Αποσύρει 2 κομμάτια/);
});

test('F5-FE1 Ε19: «no» → nothing more sent, a cancelled error', async () => {
  const s = sandbox([P428()], false);
  const r = JSON.parse(await s.run(DEL));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.c, true);
  assert.deepStrictEqual(dels(s), ['recO1']);
});

test('F5-FE1 Ε19: a delete without consequences (200) asks nothing; a changed list (422 stale_confirm) is a designed «no»', async () => {
  let s = sandbox([json(200, { id: 'recO1', deleted: true })], true);
  assert.strictEqual(JSON.parse(await s.run(DEL)).ok, true);
  assert.strictEqual(s.asked.length, 0);
  s = sandbox([P428(), json(422, { error: { type: 'PLAN_RULE', code: 'stale_confirm', message: 'rig: changed' } })], true);
  const r = JSON.parse(await s.run(DEL));
  assert.strictEqual(r.ok, false); assert.match(r.m, /rig: changed/);
  assert.deepStrictEqual(dels(s), ['recO1', 'recO1?confirm_token=tok-1'], 'never a third DELETE');
});
