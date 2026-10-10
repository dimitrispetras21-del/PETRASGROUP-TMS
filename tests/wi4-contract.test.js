// node --test tests/wi4-contract.test.js
// Weekly International v4 — the frozen contract between parallel packages
// (docs/weekly-intl-redesign/TECH_DESIGN.md §a.1, §a.6, §b, §g.3; WP0).
//
// Every real module must export every name of tests/wi4-contract.stub.js with
// the same DECLARED arity (parameters as written, defaults and rest included).
// A package that is not integrated yet is reported as TODO — visible in the
// summary, never a silent pass — and turns strict the moment it lands:
//   - WI_INTERNAL: pending while modules/weekly_intl.js has no
//     `window.WI_INTERNAL =` (WP2);
//   - WIV2 / WI4Actions: pending while the global still carries the WP0
//     `__wi4Placeholder` marker (WP4 / WP5);
//   - core/api.js: pending while NONE of atPatch/atSafePatch/_atRetry has its
//     opts parameter yet (WP6). Some but not all = drift = failure.
// No dependencies: the browser files run in a vm with recorders, the old
// module and core/api.js are read as text.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('./wi4-contract.stub.js');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Declared arity of a function source: the text from its parameter list on.
// Counts top-level commas inside the first (...) while skipping strings,
// template literals, comments and nested brackets, so `a = {x:1}, ...rest`
// counts 2. Function.length is NOT used: it stops at the first default, so
// `_atRetry(fn, retries = 3, opts)` would read as 1 and hide a real change.
function declaredArity(text) {
  const bare = /^\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/.exec(text);
  if (bare) return 1;
  const open = text.indexOf('(');
  if (open < 0) throw new Error('no parameter list in: ' + text.slice(0, 60));
  let depth = 0, seg = '', count = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (ch === '/' && nx === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && nx === '*') { i = text.indexOf('*/', i + 2) + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      seg += 'x'; i = j; continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; if (depth === 1) continue; }
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { if (seg.trim()) count++; return count; }
    } else if (ch === ',' && depth === 1) { if (seg.trim()) count++; seg = ''; continue; }
    if (depth >= 1) seg += ch;
  }
  throw new Error('unbalanced parameter list in: ' + text.slice(0, 60));
}

const esc = (s) => s.replace(/[$]/g, '\\$');
// The text of `[async] function ident(` onwards, or null when not defined.
function fnSourceIn(src, ident) {
  const m = new RegExp('(?:^|\\n)[ \\t]*(?:async[ \\t]+)?function[ \\t]+' + esc(ident) + '[ \\t]*\\(').exec(src);
  return m ? src.slice(m.index) : null;
}
const constIn = (src, ident) => new RegExp('(?:^|\\n)[ \\t]*(?:const|let|var)[ \\t]+' + esc(ident) + '[ \\t]*=').test(src);
const stubArity = (part, key) => declaredArity(C[part][key].toString());
const isValue = (part, key) => Object.prototype.hasOwnProperty.call(C.VALUES[part], key);

test('self-check: the arity parser reads defaults, rest, destructuring, arrows and methods', () => {
  assert.strictEqual(declaredArity('async function _atRetry(fn, retries = 3) {'), 2);
  assert.strictEqual(declaredArity('function f(a, {b, c} = {b: ")"}, [d, e], ...rest) {'), 4);
  assert.strictEqual(declaredArity('function f( ) {'), 0);
  assert.strictEqual(declaredArity('m(a, /* x, y */ b,) { return 1; }'), 2);
  assert.strictEqual(declaredArity('x => x + 1'), 1);
  assert.strictEqual(declaredArity('async (a, b) => a'), 2);
});

test('stub: every WI_INTERNAL key has exactly one origin identifier (§a.6)', () => {
  assert.deepStrictEqual(Object.keys(C.WI_INTERNAL).sort(), Object.keys(C.WI_INTERNAL_ORIGIN).sort());
  for (const [part, vals] of Object.entries(C.VALUES))
    for (const [k, type] of Object.entries(vals))
      assert.strictEqual(typeof C[part][k], type, `${part}.${k} should be a ${type}`);
});

test('stub vs today: every origin that already exists in weekly_intl.js has the stub\'s arity', (t) => {
  const src = read(C.META.WI_INTERNAL.file);
  const missing = [];
  for (const [key, ident] of Object.entries(C.WI_INTERNAL_ORIGIN)) {
    if (isValue('WI_INTERNAL', key)) { assert.ok(constIn(src, ident), `${key}: const ${ident} not found`); continue; }
    const def = fnSourceIn(src, ident);
    if (!def) { missing.push(ident); continue; }
    assert.strictEqual(declaredArity(def), stubArity('WI_INTERNAL', key),
      `WI_INTERNAL.${key} = ${ident}: arity in weekly_intl.js ≠ stub — a signature change is a coordinator commit to the stub`);
  }
  // Only the §a.5 extractions may be missing, and only until WP2 lands.
  const NEW = ['_wiPaintMetrics', '_wiCrossWeekIncoming', '_wiDateWrite', '_wiCtxItems', '_wiImpCtxItems',
    '_wiSegCtxItems', '_wiPreCtxItems', '_wiLotCtxItems', '_wiLegCtxItems', '_wiRelayCtxItems',
    '_wiSplitHeaderCtxItems', '_wiExpectOpt'];
  const unexpected = missing.filter((m) => !NEW.includes(m));
  assert.deepStrictEqual(unexpected, [], 'an existing function named in §a.6 is gone or renamed');
  if (missing.length) t.diagnostic(`not written yet (WP2, §a.5): ${missing.join(', ')}`);
});

test('WI_INTERNAL (WP2): frozen, every key, direct references, same arity', (t) => {
  const src = read(C.META.WI_INTERNAL.file);
  const assigns = src.match(/window\.WI_INTERNAL\s*=/g) || [];
  if (!assigns.length) { t.todo('WP2 not integrated: modules/weekly_intl.js has no window.WI_INTERNAL yet'); return; }
  assert.strictEqual(assigns.length, 1, 'WI_INTERNAL must be assigned exactly once');
  const m = /window\.WI_INTERNAL\s*=\s*Object\.freeze\(\s*\{([\s\S]*?)\}\s*\)\s*;/.exec(src);
  assert.ok(m, 'expected `window.WI_INTERNAL = Object.freeze({ … });`');
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const got = {};
  for (const raw of body.split(',')) {
    const e = raw.trim();
    if (!e) continue;
    const em = /^([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?$/.exec(e);
    assert.ok(em, `entry «${e}» is not a direct reference (key: _identifier)`);
    assert.ok(!(em[1] in got), `duplicate key ${em[1]}`);
    got[em[1]] = em[2] || em[1];
  }
  const want = Object.keys(C.WI_INTERNAL_ORIGIN).sort();
  assert.deepStrictEqual(Object.keys(got).filter((k) => !want.includes(k)), [], 'keys not in the stub (coordinator commit first)');
  assert.deepStrictEqual(want.filter((k) => !(k in got)), [], 'stub keys missing from WI_INTERNAL');
  for (const key of want) {
    assert.strictEqual(got[key], C.WI_INTERNAL_ORIGIN[key], `WI_INTERNAL.${key} must reference ${C.WI_INTERNAL_ORIGIN[key]}`);
    if (isValue('WI_INTERNAL', key)) { assert.ok(constIn(src, got[key]), `const ${got[key]} not found`); continue; }
    const def = fnSourceIn(src, got[key]);
    assert.ok(def, `function ${got[key]} is not defined in weekly_intl.js`);
    assert.strictEqual(declaredArity(def), stubArity('WI_INTERNAL', key), `WI_INTERNAL.${key}: arity ≠ stub`);
  }
});

// One sandbox, the four files in app.html order, after config.js. Recorders on
// everything that would make a file ACT at load (§b step 6): with the flag
// 'off' each new file may only define its global.
function loadNewFiles() {
  const acts = [];
  const rec = (what) => (...a) => { acts.push(what); return 0; };
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    addEventListener: rec('window.addEventListener'), removeEventListener() {},
    setTimeout: rec('setTimeout'), setInterval: rec('setInterval'), requestAnimationFrame: rec('requestAnimationFrame'),
    queueMicrotask: rec('queueMicrotask'), fetch: rec('fetch'),
    MutationObserver: function () { acts.push('MutationObserver'); this.observe = () => {}; this.disconnect = () => {}; },
    ResizeObserver: function () { acts.push('ResizeObserver'); this.observe = () => {}; this.disconnect = () => {}; },
    IntersectionObserver: function () { acts.push('IntersectionObserver'); this.observe = () => {}; this.disconnect = () => {}; },
    BroadcastChannel: function () { acts.push('BroadcastChannel'); this.postMessage = () => {}; this.close = () => {}; },
    XMLHttpRequest: function () { acts.push('XMLHttpRequest'); },
    navigator: { onLine: true, userAgent: 'test', sendBeacon: rec('sendBeacon') },
    location: { search: '', hash: '#weekly_intl', href: 'https://x/PETRASGROUP-TMS/app.html#weekly_intl', pathname: '/PETRASGROUP-TMS/app.html', hostname: 'x' },
    history: { state: null, replaceState() {}, pushState() {} },
    localStorage: store(), sessionStorage: store(),
    document: {
      addEventListener: rec('document.addEventListener'), removeEventListener() {},
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {} }),
      head: { appendChild: rec('document.head.appendChild') }, body: { appendChild: rec('document.body.appendChild'), classList: { add: rec('body.classList'), remove: rec('body.classList'), toggle: rec('body.classList') } },
    },
    currentPage: 'dashboard',
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('config.js'), ctx, { filename: 'config.js' });
  const added = {};
  for (const nf of C.NEW_FILES) {
    const before = new Set(Object.keys(ctx));
    const n = acts.length;
    vm.runInContext(read(nf.file), ctx, { filename: nf.file });
    added[nf.file] = { keys: Object.keys(ctx).filter((k) => !before.has(k)), acts: acts.slice(n) };
  }
  return { ctx, added };
}

test('config.js: every new value is born closed (§b, principle 5)', () => {
  const { ctx } = loadNewFiles();
  const v = (e) => vm.runInContext(e, ctx);
  // Opening the flag is an owner decision (§j.5): it changes this line in the
  // same commit, so the switch never moves without a trace.
  assert.strictEqual(v('FEATURES.WI_V2'), 'off', 'WI_V2 must ship \'off\' until the owner opens the pilot');
  assert.strictEqual(v('FEATURES.WI_PRESENCE'), false);
  assert.deepStrictEqual(v('JSON.stringify(WI_V2_USERS)'), '[]');
  assert.deepStrictEqual(JSON.parse(v('JSON.stringify(WI_PRESENCE_MS)')), { active: 5000, idle: 30000, idleAfter: 120000 });
});

test('the four new files load in app.html order (§a.1), each right after its anchor, stamped', () => {
  const html = read('app.html');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const plain = srcs.map((s) => s.replace(/\?.*$/, ''));
  for (const nf of C.NEW_FILES) {
    assert.strictEqual(plain.filter((s) => s === nf.file).length, 1, `${nf.file} must be loaded exactly once`);
    const i = plain.indexOf(nf.file);
    assert.strictEqual(plain[i - 1], nf.after, `${nf.file} must come right after ${nf.after}`);
    assert.match(srcs[i], /\?v=\d+$/, `${nf.file} needs a ?v= stamp`);
  }
});

test('at load each new file defines ONLY its global: no listener, timer, observer or fetch (§b step 6)', () => {
  const { added } = loadNewFiles();
  for (const nf of C.NEW_FILES) {
    assert.deepStrictEqual(added[nf.file].keys, [nf.global], `${nf.file} must add exactly window.${nf.global}`);
    assert.deepStrictEqual(added[nf.file].acts, [], `${nf.file} acted at load`);
  }
});

function checkModule(t, part) {
  const meta = C.META[part];
  const { ctx } = loadNewFiles();
  const g = ctx[meta.global];
  assert.ok(g && typeof g === 'object', `window.${meta.global} missing`);
  if (g.__wi4Placeholder) {
    assert.strictEqual(g.__wi4Placeholder, meta.owner);
    if (part === 'WIV2') {
      // The old module's hooks (§a.4) reach only these two while v4 is unbuilt:
      // they must say «inactive» so the old board stays byte-identical.
      assert.strictEqual(g.active(), false);
      assert.strictEqual(g.switchHTML(), '');
      assert.strictEqual(g._broken, false);
    }
    t.todo(`${meta.owner} not integrated: ${meta.file} is still the WP0 placeholder`);
    return;
  }
  for (const key of Object.keys(C[part])) {
    if (isValue(part, key)) { assert.strictEqual(typeof g[key], C.VALUES[part][key], `${part}.${key} type`); continue; }
    assert.strictEqual(typeof g[key], 'function', `${part}.${key} missing`);
    assert.strictEqual(declaredArity(g[key].toString()), stubArity(part, key), `${part}.${key}: arity ≠ stub`);
  }
  const extra = Object.keys(g).filter((k) => !(k in C[part]) && !k.startsWith('_'));
  assert.deepStrictEqual(extra, [], `${part} exposes names that are not in the stub (coordinator commit first)`);
}

test('WIV2 (WP4) exports every name of the stub with the same arity', (t) => checkModule(t, 'WIV2'));
test('WI4Actions (WP5) exports every name of the stub with the same arity', (t) => checkModule(t, 'WI4Actions'));

test('core/api.js (WP6): atPatch / atSafePatch / _atRetry carry the opts parameter (§g.3)', (t) => {
  const src = read(C.META.API.file);
  const rows = Object.keys(C.API).map((k) => {
    const def = fnSourceIn(src, k);
    assert.ok(def, `${k} is not a top-level function of core/api.js`);
    return { k, real: declaredArity(def), want: stubArity('API', k) };
  });
  const bad = rows.filter((r) => r.real > r.want);
  assert.deepStrictEqual(bad, [], 'more parameters than the stub (coordinator commit first)');
  const done = rows.filter((r) => r.real === r.want);
  if (done.length === 0) { t.todo('WP6 not integrated: no opts parameter yet'); return; }
  assert.deepStrictEqual(rows.filter((r) => r.real !== r.want), [], 'only some api functions carry opts: drift');
});
