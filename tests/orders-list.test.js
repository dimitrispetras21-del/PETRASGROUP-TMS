// node --test tests/orders-list.test.js
// Pure parts of core/orders-list.js (step 1 of the orders-lists unification,
// 22/9/2026): the period cutoff formula both lists send to the facade, and the
// virtual-scroll range math. UNIT ONLY — no critics/e2e spec drives the DOM
// painter or cancelOrder; the painting was verified with a one-off Playwright
// probe against the HAR rig (scroll → rows/spacers), not with a rig spec.
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

test('sortRecords: number / date / text, asc + desc, untouched when no sort', () => {
  const cols = [{ key: 'n', type: 'number', get: f => f.n }, { key: 'd', type: 'date', get: f => f.d }, { key: 't', type: 'text', get: f => f.t }];
  const recs = [{ fields: { n: '10', d: '2026-09-02', t: 'b' } }, { fields: { n: '2', d: '2026-09-10', t: 'A' } }, { fields: { n: '', d: '', t: 'c' } }];
  assert.strictEqual(OrdersList.sortRecords(recs, cols, null, 0), recs);
  assert.deepStrictEqual(OrdersList.sortRecords(recs, cols, 'n', 1).map(r => r.fields.n), ['', '2', '10']);
  assert.deepStrictEqual(OrdersList.sortRecords(recs, cols, 'd', 2).map(r => r.fields.d), ['2026-09-10', '2026-09-02', '']);
  assert.deepStrictEqual(OrdersList.sortRecords(recs, cols, 't', 1).map(r => r.fields.t), ['A', 'b', 'c']);
  assert.strictEqual(OrdersList.sortRecords(recs, cols, 'missing', 1), recs);
});

test('chunk + countLabel', () => {
  assert.deepStrictEqual(OrdersList.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepStrictEqual(OrdersList.chunk([], 90), []);
  assert.strictEqual(OrdersList.countLabel(1), '1 παραγγελία');
  assert.strictEqual(OrdersList.countLabel(3), '3 παραγγελίες');
  assert.strictEqual(OrdersList.countLabel(0), '0 παραγγελίες');   // reviewer P4 on 5d8250f
});

// ── step 2a, reviewer P3 (22/9): csvDownload and the OR() batching union ──
test('csvDownload: BOM + quoted cells with "" escaping, filename, one click, Greek toast', () => {
  const clicks = [], toasts = [], created = [];
  global.toast = (m, t) => toasts.push([m, t]);
  global.Blob = class { constructor(parts, opts) { this.text = parts.join(''); this.type = opts.type; } };
  global.URL = { createObjectURL: b => { created.push(b); return 'blob:x'; }, revokeObjectURL: () => {} };
  global.document = { createElement: () => ({ click() { clicks.push({ href: this.href, download: this.download }); } }) };
  try {
    OrdersList.csvDownload([['A', 'B'], ['plain', 'say "hi", ok'], [0, '']], 'orders_intl_2026-09-22.csv');
  } finally { delete global.toast; delete global.Blob; delete global.URL; delete global.document; }
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].type, 'text/csv;charset=utf-8');
  assert.strictEqual(created[0].text, '﻿"A","B"\n"plain","say ""hi"", ok"\n"0",""');
  assert.deepStrictEqual(clicks, [{ href: 'blob:x', download: 'orders_intl_2026-09-22.csv' }]);
  assert.deepStrictEqual(toasts, [['Το CSV αποθηκεύτηκε', undefined]]);
});

test('chunk: batches of 90 cover every id exactly once — the union equals the single-OR() set', () => {
  const ids = Array.from({ length: 275 }, (_, i) => 'rec' + i);
  const parts = OrdersList.chunk(ids, 90);
  assert.deepStrictEqual(parts.map(p => p.length), [90, 90, 90, 5]);
  const union = new Set(parts.flat());
  assert.strictEqual(union.size, ids.length);
  assert.deepStrictEqual(parts.flat(), ids);            // order preserved, no duplicates
  assert.deepStrictEqual(OrdersList.chunk(ids.slice(0, 90), 90), [ids.slice(0, 90)]);  // exact multiple → one batch
});

// ── step 2b-b: the shared table shell ──
test('tableShell: one colgroup in both tables, ids, arrows, nosort, spacer height, count', () => {
  const cols = [{ key: 'a', label: 'A', w: 40, t: 'tip' }, { key: 'b', label: 'B', w: 60, nosort: true }];
  const html = OrdersList.tableShell({ colDefs: cols, sortCol: 'a', sortDir: 2, sortToggle: '_xSort', ids: { scroller: 'sc', top: 'tp', bottom: 'bt' }, rowH: 40, total: 3, legend: 'LEG', legendClass: 'lg', footClass: 'ft' });
  assert.strictEqual((html.match(/<colgroup><col style="width:40px"><col style="width:60px"><\/colgroup>/g) || []).length, 2);
  assert.ok(html.includes(`<th style="cursor:pointer;user-select:none" onclick="_xSort('a')" title="tip">A ▼</th>`));
  assert.ok(html.includes('<th style="cursor:default;user-select:none">B</th>'));   // nosort: no onclick, no arrow
  assert.ok(html.includes('id="sc"') && html.includes('id="tp" style="height:0"') && html.includes('id="bt" style="height:120px"'));
  assert.ok(html.includes('<div class="lg">LEG</div>') && html.includes('<div class="ft">3 παραγγελίες</div>'));
  assert.ok(html.includes('overflow-anchor:none') && html.includes('table-layout:fixed'));
  assert.ok(!html.includes('scrollbar-'));   // scrollbar look belongs to each module's CSS, not the shell
  assert.ok(OrdersList.tableShell({ colDefs: cols, sortCol: null, sortDir: 0, sortToggle: '_xSort', ids: { scroller: 'sc', top: 'tp', bottom: 'bt' }, rowH: 40, total: 0, legend: '', legendClass: 'lg', footClass: 'ft' }).includes('<div class="ft">0 παραγγελίες</div>'));
});
