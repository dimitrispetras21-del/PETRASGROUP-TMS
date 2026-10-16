// CEO dashboard, user left during the load (vd 16/10): _loadAll draws nothing
// and never paints its error over the next page. Before the guard, _renderAll
// threw on a null element and the catch wrote «Ο πίνακας διοίκησης δεν
// φόρτωσε» into #content, which by then was another page's (app_errors: 14
// rows «CEO Dashboard loadAll: Cannot set properties of null», 3/8 to 25/8).
// UNIT ONLY: _loadAll and _onDashboard are extracted from the module, as in
// tests/stock-kpis.test.js, and run in a vm with stubbed reads.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const S = fs.readFileSync(path.join(__dirname, '..', 'modules', 'ceo_dashboard.js'), 'utf8');
const pick = (re, name) => { const m = S.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const LOAD = pick(/\n {2}async function _loadAll\(\) \{[\s\S]*?\n {2}\}\n/, '_loadAll');
const ON = pick(/\n {2}function _onDashboard\(\) \{[\s\S]*?\n {2}\}\n/, '_onDashboard');

function run({ page, shell, renderThrows }) {
  const content = { innerHTML: 'ANOTHER PAGE' };
  const seen = { rendered: 0, logged: [] };
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, Date,
    OrdersStock: { isLoose: () => false }, getLinkedId: () => null,
    TABLES: { ORDERS: 'tblO', DRIVERS: 'tblD', TRIP_COSTS: 'tblTC', MAINT_HISTORY: 'tblMH' },
    _getPeriodRange: () => ({ start: new Date(), end: new Date() }), _iso: d => d.toISOString().slice(0, 10),
    safeFetch: f => f(), didFail: () => false, atGet: async () => [], atGetAll: async () => [],
    logError: (e, c) => seen.logged.push(c), currentPage: page,
    document: { getElementById: id => (id === 'content' ? content : id === 'brand-speed-val' && shell ? {} : null) },
    _renderAll: () => { if (renderThrows) throw new TypeError("Cannot set properties of null (setting 'textContent')"); seen.rendered++; },
  };
  vm.runInNewContext('var _loadId = 0, _period = "month";\n' + ON + LOAD + '\nthis._loadAll = _loadAll;', ctx);
  return { ctx, content, seen };
}

test('both functions found', () => { assert.ok(LOAD && ON); });

test('still on the dashboard: it renders', async () => {
  const r = run({ page: 'ceo_dashboard', shell: true });
  await r.ctx._loadAll();
  assert.strictEqual(r.seen.rendered, 1);
});

test('left for another page during the load: nothing drawn, the other page untouched', async () => {
  const r = run({ page: 'weekly_intl', shell: false });
  await r.ctx._loadAll();
  assert.strictEqual(r.seen.rendered, 0);
  assert.strictEqual(r.content.innerHTML, 'ANOTHER PAGE');
});

test('a render failure after leaving is logged, never painted over the next page', async () => {
  // currentPage still says ceo_dashboard but the shell is gone (mid-navigation).
  const r = run({ page: 'ceo_dashboard', shell: false, renderThrows: true });
  await r.ctx._loadAll();
  assert.strictEqual(r.content.innerHTML, 'ANOTHER PAGE');
});

test('a real failure while on the dashboard still shows its message', async () => {
  const r = run({ page: 'ceo_dashboard', shell: true, renderThrows: true });
  await r.ctx._loadAll();
  assert.match(r.content.innerHTML, /δεν φόρτωσε/);
  assert.deepStrictEqual(r.seen.logged, ['CEO Dashboard loadAll']);
});
