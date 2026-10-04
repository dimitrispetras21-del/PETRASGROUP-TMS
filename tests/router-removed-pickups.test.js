// node --test tests/router-removed-pickups.test.js
// core/router.js after «Εθνικές Παραλαβές» (weekly_pickups) was removed
// (4/10/2026): its iframe target returned 404, so the entry opened nothing.
// Loads the real router in a vm with DOM stubs — no browser, no HAR.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'core/router.js'), 'utf8');

function load(role) {
  const els = {};
  const el = id => (els[id] ||= {
    id, innerHTML: '', textContent: '', style: {}, scrollHeight: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    closest: () => null, insertAdjacentHTML() {},
  });
  const store = new Map();
  const rendered = [];
  const ctx = {
    ROLE: role,
    can: () => 'full',
    toast() {}, logError() {},
    showComingSoon: label => `<h1>${label}</h1>`,
    showAccessDenied: () => '<h1>ACCESS DENIED</h1>',
    escapeHtml: s => String(s),
    setTimeout() {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    location: { hash: '' },
    history: { replaceState() {} },
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      getElementById: id => (['content', 'topbarTitle', 'sidebar'].includes(id) ? el(id) : null),
      querySelectorAll: () => [],
      querySelector: () => null,
    },
  };
  // Every render* the router calls becomes a recorder, so a route that reaches
  // its own case is distinguishable from one that falls into `default:`.
  for (const m of SRC.matchAll(/\b(render\w+)\(/g)) {
    if (m[1] !== 'renderNav') ctx[m[1]] = (...a) => rendered.push([m[1], ...a]);
  }
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    ctx, rendered,
    content: () => el('content').innerHTML,
    topbar: () => el('topbarTitle').textContent || el('topbarTitle').innerHTML,
    run: code => vm.runInContext(code, ctx),
  };
}

test('NAV no longer lists weekly_pickups / «Εθνικές Παραλαβές»', () => {
  const r = load('owner');
  const items = r.run('NAV').flatMap(g => g.items);
  assert.ok(!items.some(i => i.id === 'weekly_pickups'));
  assert.ok(!items.some(i => i.label === 'Εθνικές Παραλαβές'));
});

test('#weekly_pickups (hash, bookmark, stale tms_page) falls into the default case like any unknown route', () => {
  for (const role of ['owner', 'dispatcher']) {
    const a = load(role);
    a.run("navigate('weekly_pickups')");
    const b = load(role);
    b.run("navigate('no_such_page')");
    assert.strictEqual(a.topbar(), 'Άγνωστη σελίδα', role);
    assert.strictEqual(a.content(), b.content().replace('no_such_page', 'weekly_pickups'), role);
    assert.ok(a.content().includes('Ζητήθηκε: <code>weekly_pickups</code>'), role);
    assert.ok(!/<iframe/i.test(a.content()), role);
    assert.strictEqual(a.rendered.length, 0, role);
  }
});

test('every remaining NAV item still reaches its own case (none falls to default)', () => {
  const ids = load('owner').run('NAV').flatMap(g => g.items.map(i => i.id));
  assert.ok(ids.length >= 30, 'NAV shrank unexpectedly: ' + ids.length);
  for (const id of ids) {
    const r = load('owner');
    r.run(`navigate(${JSON.stringify(id)})`);
    assert.ok(!r.content().includes('Ζητήθηκε'), id + ' fell into default');
    assert.notStrictEqual(r.topbar(), 'Άγνωστη σελίδα', id);
  }
});

test('no live code still links to the removed route or its iframe host', () => {
  const files = ['app.html', 'assets/style.css',
    ...fs.readdirSync(path.join(ROOT, 'core')).filter(f => f.endsWith('.js')).map(f => 'core/' + f),
    ...fs.readdirSync(path.join(ROOT, 'modules')).filter(f => f.endsWith('.js')).map(f => 'modules/' + f)];
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/['"]weekly_pickups['"]/.test(s), f + ' still names the route as a string');
    assert.ok(!/github\.io\/petras-assign/.test(s), f + ' still points at petras-assign');
    assert.ok(!/iframe\.embed|national_consolidation"\]/.test(s), f + ' still styles the pick-ups iframe');
  }
});
