// Plain node:test — no Playwright needed, these are pure data assertions.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const UNITS = require('./units');

test('exactly 11 units, matching the spec', () => {
  assert.strictEqual(UNITS.length, 11);
});

test('every listed file exists on disk', () => {
  for (const u of UNITS) {
    for (const f of u.files) {
      assert.ok(fs.existsSync(f), `missing file ${f} for unit ${u.unit}`);
    }
  }
});

test('entity is one unit covering six routes', () => {
  const e = UNITS.find(u => u.unit === 'entity');
  assert.strictEqual(e.routes.length, 6);
  assert.deepStrictEqual(e.files, ['core/entity.js']);
});

test('six units are tier 3', () => {
  assert.strictEqual(UNITS.filter(u => u.tier === 3).length, 6);
});
