// node --test tests/wn5-contract.test.js
// National v5 F4α — every new browser file of the v5 board is INERT at load (it may only define its globals: no
// listener, timer, observer or fetch — with FEATURES.WN_V5 'off' production must not feel it), and app.html loads it
// exactly once, right after its anchor, with a ?v= stamp. Same recorders as loadNewFiles() of
// tests/wi4-contract.test.js. Each Task that creates a file adds its row to V5.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// file · the globals it may add (sorted) · the app.html tag it must follow
const V5 = [
  { file: 'core/plan-api.js', globals: ['PlanApi', 'PlanError', 'planFetch'], after: 'core/api.js' },
];

function loadV5() {
  const acts = [];
  const rec = (what) => () => { acts.push(what); return 0; };
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
    location: { search: '', hash: '#weekly_natl', href: 'https://x/PETRASGROUP-TMS/app.html#weekly_natl', pathname: '/PETRASGROUP-TMS/app.html', hostname: 'x' },
    history: { state: null, replaceState: rec('history.replaceState'), pushState: rec('history.pushState') },
    localStorage: store(), sessionStorage: store(),
    document: {
      addEventListener: rec('document.addEventListener'), removeEventListener() {},
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {} }),
      head: { appendChild: rec('document.head.appendChild') },
      body: { appendChild: rec('document.body.appendChild'), classList: { add: rec('body.classList'), remove: rec('body.classList'), toggle: rec('body.classList') } },
    },
    currentPage: 'dashboard',
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('config.js'), ctx, { filename: 'config.js' });
  const added = {};
  for (const f of V5) {
    const before = new Set(Object.keys(ctx));
    const n = acts.length;
    vm.runInContext(read(f.file), ctx, { filename: f.file });
    added[f.file] = { keys: Object.keys(ctx).filter((k) => !before.has(k)).sort(), acts: acts.slice(n) };
  }
  return { ctx, added };
}

test('F4α: each v5 file adds exactly its globals and acts zero times at load', () => {
  const { added } = loadV5();
  for (const f of V5) {
    assert.deepStrictEqual(added[f.file].keys, f.globals, `${f.file} must add exactly ${f.globals.join(', ')}`);
    assert.deepStrictEqual(added[f.file].acts, [], `${f.file} acted at load`);
  }
});

test('F4α: app.html loads each v5 file once, right after its anchor, with ?v=', () => {
  const html = read('app.html');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const plain = srcs.map((s) => s.replace(/\?.*$/, ''));
  for (const f of V5) {
    assert.strictEqual(plain.filter((s) => s === f.file).length, 1, `${f.file} must be loaded exactly once`);
    const i = plain.indexOf(f.file);
    assert.strictEqual(plain[i - 1], f.after, `${f.file} must come right after ${f.after}`);
    assert.match(srcs[i], /\?v=\d+$/, `${f.file} needs a ?v= stamp`);
  }
});
