// OrderQuickEdit (owner 20/10/2026): the accountant's five-field «Διόρθωση».
const test = require('node:test');
const assert = require('node:assert');
global.ROLE = 'accountant';
global.can = k => (k === 'orders' ? 'view' : 'none');
const Q = require('../core/order-quick-edit.js');

test('only the accountant without full orders gets it', () => {
  assert.strictEqual(Q.can(), true);
  global.can = () => 'full'; assert.strictEqual(Q.can(), false, 'full form wins');
  global.can = k => (k === 'orders' ? 'view' : 'none');
  global.ROLE = 'dispatcher'; assert.strictEqual(Q.can(), false);
  global.ROLE = 'accountant';
});

test('the five fields are order-row labels only — nothing that cascades', () => {
  assert.deepStrictEqual(Q.FIELDS.map(x => x.key), ['Price', 'Reference', 'Loading DateTime', 'Delivery DateTime', 'Notes']);
});

test('only changed fields are sent; dates compare by day; blank clears', () => {
  const f = { Price: 0, Reference: 'R-1', 'Loading DateTime': '2026-09-24T00:00:00+00:00', 'Delivery DateTime': '2026-09-28', Notes: 'x' };
  const typed = { Price: '4100', Reference: 'R-1', 'Loading DateTime': '2026-09-24', 'Delivery DateTime': '2026-09-29', Notes: '' };
  assert.deepStrictEqual(Q.changes(f, k => typed[k]), { Price: 4100, 'Delivery DateTime': '2026-09-29', Notes: null });
  assert.deepStrictEqual(Q.changes(f, k => (k === 'Price' ? '0' : k.endsWith('DateTime') ? String(f[k]).slice(0, 10) : f[k])), {});
});

test('an invoiced order: the price is locked, the other fields still go out', () => {
  const f = { Invoiced: true, 'Invoice Number': '0431', Price: 3200, Reference: 'R-1' };
  assert.deepStrictEqual(Q.changes(f, k => ({ Price: '3500', Reference: 'R-2' })[k] ?? ''), { Reference: 'R-2' });
});
