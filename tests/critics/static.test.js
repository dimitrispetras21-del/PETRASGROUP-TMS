const { test } = require('node:test');
const assert = require('node:assert');
const { measure, check } = require('./static');
const UNITS = require('./units');

test('measure counts hex colours in a unit', () => {
  const entity = UNITS.find(u => u.unit === 'entity');
  const m = measure(entity);
  assert.ok(typeof m.hex === 'number');
  assert.ok(typeof m.truncate === 'number');
});

test('a unit at its allowance passes', () => {
  const entity = UNITS.find(u => u.unit === 'entity');
  const m = measure(entity);
  const r = check(entity, { hex: m.hex, truncate: m.truncate });
  assert.strictEqual(r.pass, true);
});

test('a unit over its allowance fails and says by how much', () => {
  const weekly = UNITS.find(u => u.unit === 'weekly_intl');
  const r = check(weekly, { hex: 0, truncate: 0 });
  assert.strictEqual(r.pass, false);
  assert.match(r.failures.join(' '), /hex/);
});
