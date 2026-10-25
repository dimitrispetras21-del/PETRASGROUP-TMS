// node --test tests/api-plan-no-resend.test.mjs
// National v5, review of PR #90 (Worker 39842d18), finding 1 — the client's side of the pin (the Worker's side:
// worker/test/plan-routes.test.mjs «finding 1»). A /plan/* write whose answer is lost after the COMMIT is
// answered plan_unknown; amount_leak after a write means the write IS kept. If the legacy client sent either
// again by itself, a PATCH /plan/rt/:id {shift} would move the stops twice (decision 44: no screen re-sends a
// /plan/* write). So the Worker answers both with 422, which the REAL core/api.js _atRetry answers at once:
// exactly one fetch. A 5xx — and a 409 without opts.conflict — it sends three times; pinned too, as the reason.
// Same vm sandbox as tests/api-stock-refusals.test.mjs; nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox(answer) {
  const calls = [], toasts = [], store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#weekly_natl' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener() {}, location: ctx.location };
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    return String(url).includes('/plan/') ? answer() : new Response('{}', { status: 201 });
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/api.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__toasts = toasts;
  vm.runInContext("showErrorToast = function (m, t) { __toasts.push((t || 'error') + ': ' + m); };", ctx);
  return { calls, toasts, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const SEND = "_atRetry(() => fetch(PROXY_URL + '/plan/rt/42', { method: 'PATCH', body: '{}' })).then((r) => 'answered ' + r.status, (e) => 'threw: ' + e.message)";
const planCalls = (s) => s.calls.filter((c) => c.url.includes('/plan/')).length;

// the exact bodies the Worker sends (worker/src/index.js handlePlan)
const UNKNOWN = { error: { type: 'OUTCOME_UNKNOWN', code: 'plan_unknown', message: 'Η πράξη PATCH /plan/rt/42 μπορεί να αποθηκεύτηκε — έλεγξε πρώτα στο Εβδομαδιαίο Εθνικών αν φαίνεται, και μόνο αν λείπει ξαναπάτησε το ίδιο κουμπί· ενημέρωσε τον Δημήτρη' } };
const LEAK = { error: { type: 'SERVER', code: 'amount_leak', message: 'Η πράξη αποθηκεύτηκε, αλλά η απάντηση της βάσης είχε ποσά για ρόλο χωρίς δικαίωμα — δεν στάλθηκε· μην την ξαναπατήσεις· ενημέρωσε τον Δημήτρη' } };

for (const [label, body] of [['plan_unknown', UNKNOWN], ['amount_leak', LEAK]]) {
  test(`${label} (422): the legacy _atRetry sends it exactly once and shows the Worker's text («μπορεί να έγινε» / «αποθηκεύτηκε»)`, async () => {
    const s = sandbox(json(422, body));
    const out = await s.run(SEND);
    assert.strictEqual(planCalls(s), 1, 'one fetch, never a second by the client');
    assert.strictEqual(out, 'threw: ' + body.error.message);
    assert.ok(s.toasts.includes('error: ' + body.error.message), s.toasts.join(' / '));
  });
}

test('why not a 5xx or a 409: the legacy _atRetry sends those three times by itself', async () => {
  for (const status of [500, 502, 503, 409]) {
    const s = sandbox(json(status, { error: { type: 'SERVER', code: 'x', message: 'x' } }));
    await s.run(SEND);
    assert.strictEqual(planCalls(s), 3, `${status}: sent three times`);
  }
});

// Review r2, finding 1: the Worker can only choose the status of an answer it SENDS. When that answer is lost —
// the fetch throws, or the CF edge answers a 5xx / 1101 page after the RPC committed — the legacy _atRetry sends
// the write again by itself, and PATCH /plan/rt/:id {shift: {side, delta}} is a relative delta: a second send
// moves the stops twice. Pinned here as the reason, together with the rule that follows from it.
test('r2 finding 1: a lost answer (the fetch throws, an edge 5xx page) is sent again by the legacy _atRetry — the reason the rule below exists', async () => {
  const thrown = sandbox(() => { throw new TypeError('Failed to fetch'); });
  assert.strictEqual(await thrown.run(SEND), 'threw: Failed to fetch');
  assert.strictEqual(planCalls(thrown), 3, 'a thrown fetch: three sends');
  const edge = sandbox(() => new Response('<html>Error 1101</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
  await edge.run(SEND);
  assert.strictEqual(planCalls(edge), 3, 'an edge page: three sends');
});

// The rule (decision 44, note 5 of the F2 plan for F4): no /plan/* request goes through core/api.js _atRetry.
// F4's core/plan-api.js sends each write with ONE fetch of its own, and a lost answer reads «μπορεί να έγινε».
// A build-time check (αρχή 6): every _atRetry(...) call in the client — core/, modules/, the root .js / .html —
// is read, and none may name a /plan/ path or a plan* helper. Today no client file sends /plan/* at all; this
// fails the day one is written on top of _atRetry, before it can move a cycle twice.
function clientFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(m?js|html)$/.test(e.name)) out.push(f);
    }
  };
  for (const d of ['core', 'modules']) walk(path.join(ROOT, d));
  for (const e of fs.readdirSync(ROOT)) if (/\.(m?js|html)$/.test(e)) out.push(path.join(ROOT, e));
  return out;
}
// the text of each call's arguments: parentheses counted outside strings and comments
function atRetryCalls(src) {
  const out = [];
  const re = /\b_atRetry\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue; // its definition
    let depth = 1, i = re.lastIndex, q = null;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    out.push(src.slice(re.lastIndex, i));
  }
  return out;
}
test('r2 finding 1: no client _atRetry(...) call sends a /plan/* request (decision 44: F4 sends each /plan/* write once)', () => {
  let seen = 0;
  for (const f of clientFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    for (const args of atRetryCalls(src)) {
      seen++;
      assert.ok(!/\/plan\/|\bplan[A-Z_]|PLAN_/.test(args), `${path.relative(ROOT, f)}: _atRetry(${args.slice(0, 160)}…) names a /plan/* request`);
    }
  }
  // the scanner itself must see the calls it judges (today: core/api.js, 13), or it would pass on nothing
  assert.ok(seen >= 10, `only ${seen} _atRetry calls read`);
  // and it would catch one: the shape F4 would most likely write
  assert.strictEqual(atRetryCalls("x = _atRetry((_r) => fetch(_apiUrl('/plan/rt/' + id), { method: 'PATCH' }))").length, 1);
  assert.ok(/\/plan\//.test(atRetryCalls("_atRetry((_r) => fetch(_apiUrl('/plan/rt/' + id), { method: 'PATCH' }))")[0]));
});
