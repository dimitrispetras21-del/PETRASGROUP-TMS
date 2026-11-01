// node --test tests/api-plan-no-resend.test.mjs
// National v5, review of PR #90 (Worker 39842d18), finding 1 — the client's side of the pin (the Worker's side:
// worker/test/plan-routes.test.mjs «finding 1»). A /plan/* write whose answer is lost after the COMMIT is
// answered plan_unknown; amount_leak after a write means the write IS kept. If the legacy client sent either
// again by itself, a PATCH /plan/rt/:id {shift} would move the stops twice (decision 44: no screen re-sends a
// /plan/* write). So the Worker answers both with 422, which the REAL core/api.js _atRetry answers at once:
// exactly one fetch. Every thrown fetch and every other non-ok status except 400 / 401 / 403 (a 5xx, a 404, a 428,
// a 409 without opts.conflict) it sends three times; pinned too, as the reason (r3 finding 8: the full list).
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

test('why not a 5xx, a 409 or a 404: the legacy _atRetry sends those three times by itself', async () => {
  for (const status of [500, 502, 503, 409, 404]) {
    const s = sandbox(json(status, { error: { type: 'SERVER', code: 'x', message: 'x' } }));
    await s.run(SEND);
    assert.strictEqual(planCalls(s), 3, `${status}: sent three times`);
  }
});

// F5 FE-1 / Ε19 (28/10): a 428 is the facade's order-delete preview (Worker deploy 1) — the same request gets the
// same answer, so _atRetry no longer resends it (tests/api-delete-confirm.test.mjs). /plan/* still never goes
// through _atRetry: its 428 is planFetch's NEED_TOKEN.
test('a 428: the legacy _atRetry sends it once (F5 Ε19)', async () => {
  const s = sandbox(json(428, { error: { type: 'PLAN_RULE', code: 'need_token', message: 'x' } }));
  await s.run(SEND);
  assert.strictEqual(planCalls(s), 1);
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
// A build-time check (αρχή 6) over the client — core/, modules/, the root .js and the inline <script> of the root
// .html. Round 2 read only the literal arguments of each _atRetry(...) call, and r3 finding 1 showed three helper
// shapes it missed: `planFetch(path, init) { return _atRetry(() => fetch(_apiUrl(path), init)); }`, the same with
// `PROXY_URL + p`, and a url built first (`const url = _apiUrl('/plan/rt/' + id); _atRetry(() => fetch(url))`).
// So four rules, any one of which fails the build:
//   A. a file that names a /plan/ path (in its code, comments aside), or whose name starts with «plan», never
//      names _atRetry at all — the /plan/* sender lives in its own file, away from core/api.js;
//   B. a function named plan… (planFetch, _planSend; not _wiPlanPatch, Weekly International's own «plan») never
//      names _atRetry, nor a «sender» — a function that reaches it (atPatch, atGetAll → _atFetch → _atRetry, …),
//      however it is declared (function, arrow, method);
//   C. no call of _atRetry names /plan/, plan[A-Z_] or PLAN_ in its arguments (the round-2 rule);
//   D. no call of a sender names a /plan/ path in its arguments (`send('/plan/rt/' + id)` through a wrapper).
// Today no client file sends /plan/* at all; this fails the day one is written on top of _atRetry.
const PLAN_FN = /^_?plan(?:[A-Z_$\d]|$)/;
const IDENT = /[A-Za-z0-9_$]/;
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
  return out.map((f) => ({ name: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }));
}
// an .html file: only its inline scripts are code (the rest blanked, offsets kept)
function scriptsOf(name, src) {
  if (!name.endsWith('.html')) return src;
  let out = src.replace(/[^\n]/g, ' ');
  for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const at = m.index + m[0].indexOf('>') + 1;
    out = out.slice(0, at) + m[1] + out.slice(at + m[1].length);
  }
  return out;
}
// Two views of a source, same offsets: `code` with the comments blanked, `bare` with the text of every string,
// template and regex literal blanked too (so a «(» or a «_atRetry» inside a string counts for nothing).
function lex(src) {
  const n = src.length, code = src.split(''), bare = src.split('');
  const blank = (arr, a, b) => { for (let k = a; k < b && k < n; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  const tpl = []; // brace depth at which each open ${ … } of a template closes
  let depth = 0, last = '', i = 0;
  const regexOk = () => last === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(last) || /^(return|typeof|case|do|else|in|of|void|yield|await|delete|new)$/.test(last);
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(code, i, e); blank(bare, i, e); i = e; continue; }
    if (c === '/' && d === '*') { let e = src.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; blank(code, i, e); blank(bare, i, e); i = e; continue; }
    if (c === "'" || c === '"') {
      let k = i + 1;
      while (k < n && src[k] !== c && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1;
      blank(bare, i + 1, k); i = k + 1; last = 'str'; continue;
    }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (c === '}') tpl.pop();
      let k = i + 1;
      while (k < n && src[k] !== '`' && !(src[k] === '$' && src[k + 1] === '{')) k += src[k] === '\\' ? 2 : 1;
      blank(bare, i + 1, k);
      if (src[k] === '$') { tpl.push(depth); i = k + 2; last = '('; } else { i = k + 1; last = 'str'; }
      continue;
    }
    if (c === '/' && regexOk()) {
      let k = i + 1, cls = false;
      while (k < n && src[k] !== '\n') {
        if (src[k] === '\\') { k += 2; continue; }
        if (src[k] === '[') cls = true; else if (src[k] === ']') cls = false; else if (src[k] === '/' && !cls) break;
        k++;
      }
      blank(bare, i + 1, k); i = k + 1;
      while (i < n && /[a-z]/.test(src[i])) i++;
      last = 'str'; continue;
    }
    if (IDENT.test(c)) { let k = i; while (k < n && IDENT.test(src[k])) k++; last = src.slice(i, k); i = k; continue; }
    if (c === '{') depth++; else if (c === '}') depth--;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return { code: code.join(''), bare: bare.join('') };
}
// in `bare`: the index after the bracket that closes the one at `at`
function closeOf(bare, at) {
  const open = bare[at], shut = { '(': ')', '{': '}', '[': ']' }[open];
  let d = 0;
  for (let k = at; k < bare.length; k++) {
    if (bare[k] === open) d++;
    else if (bare[k] === shut && --d === 0) return k + 1;
  }
  return bare.length;
}
// an arrow's expression body: up to the first , ; ) ] } at its own depth
function exprEnd(bare, at) {
  let d = 0;
  for (let k = at; k < bare.length; k++) {
    const c = bare[k];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { if (d === 0) return k; d--; }
    else if ((c === ',' || c === ';') && d === 0) return k;
  }
  return bare.length;
}
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with', 'do', 'else', 'typeof', 'new', 'await', 'yield', 'delete', 'void', 'in', 'of', 'case']);
// every named function of a source: { name, at (index of the name), body: [from, to) in the source }
function functionsOf(bare) {
  const out = [];
  const after = (k) => { while (k < bare.length && /\s/.test(bare[k])) k++; return k; };
  const bodyAt = (k) => {
    k = after(k);
    if (bare.startsWith('=>', k)) k = after(k + 2);
    return bare[k] === '{' ? [k, closeOf(bare, k)] : [k, exprEnd(bare, k)];
  };
  for (const m of bare.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    const p = m.index + m[0].length - 1;
    const b = after(closeOf(bare, p));
    if (bare[b] === '{') out.push({ name: m[1], at: m.index + m[0].indexOf(m[1], 8), body: [b, closeOf(bare, b)] });
  }
  for (const m of bare.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s+)?(?:function\b\s*\*?\s*[\w$]*\s*(\()|(\()|([A-Za-z_$][\w$]*)\s*=>)/g)) {
    if (m[4]) { out.push({ name: m[1], at: m.index, body: bodyAt(m.index + m[0].length) }); continue; }
    const p = m.index + m[0].length - 1;
    const e = closeOf(bare, p);
    if (m[2]) { const b = after(e); if (bare[b] === '{') out.push({ name: m[1], at: m.index, body: [b, closeOf(bare, b)] }); continue; }
    if (bare.startsWith('=>', after(e))) out.push({ name: m[1], at: m.index, body: bodyAt(e) });
  }
  // method shorthand: `name(args) {` in an object or a class
  for (const m of bare.matchAll(/(?<![\w$.])(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (KEYWORDS.has(m[1])) continue;
    const p = m.index + m[0].length - 1;
    const b = after(closeOf(bare, p));
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(bare[k])) k--;
    if (bare[b] === '{' && (k < 0 || '{},;'.includes(bare[k]))) {
      out.push({ name: m[1], at: m.index + m[0].indexOf(m[1]), body: [b, closeOf(bare, b)] });
    }
  }
  return out;
}
// every call `name(`: { name, args (text of the arguments, strings kept) }; definitions are not calls
function callsOf(code, bare, names, defs) {
  const out = [];
  const defAt = new Set(defs.map((f) => f.at));
  // `window._atRetry(` / `self._atRetry(` is the same call (review r3 #3, P5); other qualified names are methods
  for (const m of bare.matchAll(/(?<![\w$])(?:(?<=\.\s*)_atRetry|(?<!\.\s*)[A-Za-z_$][\w$]*)\s*\(/g)) {
    m[1] = m[0].replace(/\s*\($/, '');
    if (!names.has(m[1]) || defAt.has(m.index)) continue;
    if (/\bfunction\s*\*?\s*$/.test(bare.slice(Math.max(0, m.index - 12), m.index))) continue;
    const p = m.index + m[0].length - 1;
    out.push({ name: m[1], args: code.slice(p + 1, closeOf(bare, p) - 1) });
  }
  return out;
}
const RETRY = /(?<![\w$])_atRetry(?![\w$])/;
// files: [{ name, src }] → { offences: [text], retryCalls: n }
function planResendOffences(files) {
  const views = files.map((f) => ({ ...f, ...lex(scriptsOf(f.name, f.src)) }));
  for (const v of views) {
    v.defs = functionsOf(v.bare);
    v.depth = new Int32Array(v.bare.length + 1);
    for (let k = 0, d = 0; k < v.bare.length; k++) { v.depth[k] = d; if (v.bare[k] === '{') d++; else if (v.bare[k] === '}') d--; }
  }
  // The senders, to a fixed point: a top-level function whose body calls _atRetry or another sender (atGetAll →
  // _atFetch → _atRetry). Top-level only, and calls only: a nested helper or a method named `map` / `e` would
  // otherwise make every `.map(` or `catch (e)` a sender and fail a correct F4 helper.
  const calls = (text) => {
    const out = new Set();
    for (const m of text.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) out.add(m[1]);
    if (/\.\s*_atRetry\s*\(/.test(text)) out.add('_atRetry'); // window._atRetry(…) (review r3 #3, P5)
    return out;
  };
  const senders = new Set();
  const top = views.flatMap((v) => v.defs.filter((f) => f.name !== '_atRetry' && v.depth[f.at] === 0).map((f) => ({ name: f.name, uses: calls(v.bare.slice(...f.body)) })));
  for (let grew = true; grew;) {
    grew = false;
    for (const f of top) if (!senders.has(f.name) && (f.uses.has('_atRetry') || [...f.uses].some((u) => senders.has(u)))) { senders.add(f.name); grew = true; }
  }
  const reaches = (text) => RETRY.test(text) || [...calls(text)].some((u) => senders.has(u));
  const offences = [];
  let retryCalls = 0;
  for (const v of views) {
    // A
    // `/plan\b`, not `/plan/`: a base held apart (`const BASE = '/plan'`, review r3 #3, P1) names it too
    if ((/\/plan\b/.test(v.code) || /^plan/i.test(path.basename(v.name))) && RETRY.test(v.bare)) offences.push(`${v.name}: names /plan/ and _atRetry (rule A)`);
    // B
    for (const f of v.defs) if (PLAN_FN.test(f.name) && reaches(v.bare.slice(...f.body))) offences.push(`${v.name}: ${f.name}() reaches _atRetry (rule B)`);
    // C and D
    for (const c of callsOf(v.code, v.bare, new Set(['_atRetry', ...senders]), v.defs)) {
      if (c.name === '_atRetry') {
        retryCalls++;
        if (/\/plan\/|\bplan[A-Z_]|PLAN_/.test(c.args)) offences.push(`${v.name}: _atRetry(${c.args.slice(0, 120)}…) names a /plan/* request (rule C)`);
      } else if (/\/plan\//.test(c.args)) offences.push(`${v.name}: ${c.name}(${c.args.slice(0, 120)}…) sends a /plan/ path through _atRetry (rule D)`);
    }
  }
  return { offences, retryCalls, senders };
}
test('r2/r3 finding 1: no client path sends a /plan/* request through _atRetry (decision 44: F4 sends each /plan/* write once)', () => {
  const { offences, retryCalls, senders } = planResendOffences(clientFiles());
  assert.deepEqual(offences, []);
  // the scanner must see what it judges, or it would pass on nothing: today 8 calls, all in core/api.js (round 2
  // counted 13 because it also read mentions inside comments; r3 reads code only)
  assert.ok(retryCalls >= 8, `only ${retryCalls} _atRetry calls read`);
  for (const s of ['atGet', 'atGetAll', 'atPatch', 'atCreate', 'atDelete']) assert.ok(senders.has(s), `${s} is a sender`);
});
test('r3 finding 1: the scan catches the helper shapes round 2 missed, and lets a single-fetch F4 helper through', () => {
  const API = { name: 'core/api.js', src: 'async function _atRetry(fn, retries = 3, opts) { return fn(); }\nasync function atPatch(t, id, f) { return _atRetry((_r) => fetch(_apiUrl(`/v0/x/${t}/${id}`))); }\n' };
  const bad = {
    'a plan* helper with a path variable (method)': [{ name: 'core/plan-api.js', src: 'const PlanApi = {\n  planFetch(path, init) { return _atRetry(() => fetch(_apiUrl(path), init)); },\n};' }],
    'a plan* helper on PROXY_URL + p, in core/api.js itself': [{ name: 'core/api.js', src: API.src + 'const planSend = (p, init) => _atRetry(() => fetch(PROXY_URL + p, init));\n' }],
    'a url built first, in a module': [API, { name: 'modules/weekly_natl.js', src: "async function shiftRt(id) {\n  const url = _apiUrl('/plan/rt/' + id);\n  return _atRetry(() => fetch(url, { method: 'PATCH' }));\n}" }],
    'a generic wrapper called with a /plan/ path': [{ name: 'core/api.js', src: API.src + 'function sendRetry(p, init) { return _atRetry(() => fetch(_apiUrl(p), init)); }\n' }, { name: 'modules/weekly_natl.js', src: "function shiftRt(id) { return sendRetry(`/plan/rt/${id}`, { method: 'PATCH' }); }" }],
    'a plan* helper on top of a sender': [API, { name: 'modules/weekly_natl.js', src: 'async function planMove(b) { return atPatch(T, 1, b); }' }],
    'the round-2 shape': [{ name: 'modules/x.js', src: "x = _atRetry((_r) => fetch(_apiUrl('/plan/rt/' + id), { method: 'PATCH' }));" }],
    // review r3 #3: the two shapes r3 still let through
    'P1: a /plan base held apart, under a name without plan': [{ name: 'core/api.js', src: API.src + "const BASE = '/plan';\nfunction nationalWrite(p, i) { return _atRetry(() => fetch(_apiUrl(BASE + p), i)); }\n" }, { name: 'modules/weekly_natl.js', src: "function shiftRt(id) { return nationalWrite('/rt/' + id, { method: 'PATCH' }); }" }],
    'P5: window._atRetry in one file, the /plan/ path in another': [{ name: 'core/api.js', src: API.src + 'function sendRetry(p, init) { return window._atRetry(() => fetch(_apiUrl(p), init)); }\n' }, { name: 'modules/weekly_natl.js', src: "function shiftRt(id) { return sendRetry(`/plan/rt/${id}`, { method: 'PATCH' }); }" }],
  };
  for (const [label, files] of Object.entries(bad)) assert.ok(planResendOffences(files).offences.length > 0, `missed: ${label}`);
  // F4 as decided: core/plan-api.js sends with one fetch of its own, and a module calls it
  const good = [API, { name: 'core/plan-api.js', src: "async function planFetch(path, init) {\n  // ONE fetch: a lost answer reads «μπορεί να έγινε» (decision 44)\n  return fetch(_apiUrl(path), init);\n}" },
    { name: 'modules/weekly_natl.js', src: "function shiftRt(id, b) { return planFetch('/plan/rt/' + id, { method: 'PATCH', body: JSON.stringify(b) }); }\nconst rows = await atGetAll(T, { filterByFormula: '{Week}=1' });" }];
  assert.deepEqual(planResendOffences(good).offences, []);
  // and a comment or a string that only mentions _atRetry / /plan/ is not code
  assert.deepEqual(planResendOffences([API, { name: 'core/plan-api.js', src: "// never _atRetry here\nconst why = 'not _atRetry';\nfunction planFetch(p) { return fetch(_apiUrl(p)); }" }]).offences, []);
});
