// Paging safety net (29/9/2026): the REAL core/api.js in a vm sandbox with a
// scripted Worker. The Worker paged with limit/offset and no total ORDER BY, so a
// page could repeat rows of another page while OTHER rows were never returned
// (measured: 23 repeated + 23 missing of 228). atGet/atGetAll must (1) never
// return the same record twice and (2) SAY that it happened — a repeat proves
// rows are missing, so a silent drop would hide the gap (principle 1).
// Run: node --test tests/api-paging-dedupe.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox(pages) {
  const errors = []; const warns = []; const store = new Map();
  const ctx = {
    console: { log() {}, warn: (m) => warns.push(String(m)), error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#orders' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    showErrorToast() {}, invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener() {}, location: ctx.location };
  ctx.fetch = async (url) => {
    const u = String(url);
    if (!u.includes('/v0/')) return new Response('{}', { status: 201 });
    const off = new URL(u).searchParams.get('offset') || '0';
    return new Response(JSON.stringify(pages[off]), { status: 200 });
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__errors = errors;
  vm.runInContext('showErrorToast = function () {};', ctx);
  vm.runInContext('logError = function (e, c) { __errors.push({ msg: e && e.message, ctx: c }); };', ctx);
  return { ctx, errors, warns, run: (code) => vm.runInContext(code, ctx) };
}
const rec = id => ({ id, fields: { Reference: id } });

test('a record repeated on the next page is returned ONCE, and the repeat is logged', async () => {
  const s = sandbox({
    '0':   { records: [rec('recA'), rec('recB'), rec('recC')], offset: '100' },
    '100': { records: [rec('recC'), rec('recD')] },            // recC again — another row was skipped
  });
  const out = await s.run("atGet('tblORD', '', false)");
  assert.deepStrictEqual(Array.from(out, r => r.id), ['recA', 'recB', 'recC', 'recD']);
  assert.strictEqual(s.errors.length, 1, 'one error-log line');
  assert.match(s.errors[0].msg, /tblORD: 1 διπλές εγγραφές/);
  assert.strictEqual(s.errors[0].ctx, '_atFetch paging');
  assert.ok(s.warns.some(w => /διπλές/.test(w)));
});

test('clean pages: same records, nothing logged', async () => {
  const s = sandbox({
    '0':   { records: [rec('recA'), rec('recB')], offset: '100' },
    '100': { records: [rec('recC')] },
  });
  const out = await s.run("atGetAll('tblORD', {}, false)");
  assert.deepStrictEqual(Array.from(out, r => r.id), ['recA', 'recB', 'recC']);
  assert.strictEqual(s.errors.length, 0);
});
