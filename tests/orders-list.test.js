// node --test tests/orders-list.test.js
// Pure parts of core/orders-list.js (step 1 of the orders-lists unification,
// 22/9/2026). The DOM painter and cancelOrder are exercised by the Playwright
// rigs (tests/critics + the orders probe); here: the period cutoff formula
// both lists send to the facade, and the virtual-scroll range math.
const { test } = require('node:test');
const assert = require('node:assert');
const OrdersList = require('../core/orders-list.js');

const iso = d => d.toISOString().split('T')[0];

test('periodFormula: 60 (default) and 180 days back, ISO date, IS_AFTER on Loading DateTime', () => {
  for (const [period, days] of [['60', 60], ['180', 180], ['anything-else', 60]]) {
    const f = OrdersList.periodFormula(period);
    const m = f.match(/^IS_AFTER\(\{Loading DateTime\}, '(\d{4}-\d{2}-\d{2})'\)$/);
    assert.ok(m, period + ': ' + f);
    const expected = new Date(); expected.setDate(expected.getDate() - days);
    assert.strictEqual(m[1], iso(expected), period);
  }
});

test('periodFormula: all → empty string (callers skip the AND)', () => {
  assert.strictEqual(OrdersList.periodFormula('all'), '');
});

test('virtualRange: buffer above/below, clamped to [0, total]', () => {
  // 40px rows, 400px viewport, 10 rows buffer — the constants both lists use
  assert.deepStrictEqual(OrdersList.virtualRange(0, 400, 1000, 40, 10), { startIdx: 0, endIdx: 20 });
  assert.deepStrictEqual(OrdersList.virtualRange(4000, 400, 1000, 40, 10), { startIdx: 90, endIdx: 120 });
  assert.deepStrictEqual(OrdersList.virtualRange(39600, 400, 1000, 40, 10), { startIdx: 980, endIdx: 1000 });
  assert.deepStrictEqual(OrdersList.virtualRange(0, 400, 3, 40, 10), { startIdx: 0, endIdx: 3 });
  assert.deepStrictEqual(OrdersList.virtualRange(0, 400, 0, 40, 10), { startIdx: 0, endIdx: 0 });
});

test('virtualRange: partial rows round outward (floor start, ceil end)', () => {
  assert.deepStrictEqual(OrdersList.virtualRange(410, 405, 1000, 40, 0), { startIdx: 10, endIdx: 21 });
});
