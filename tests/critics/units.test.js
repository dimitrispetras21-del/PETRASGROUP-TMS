// Plain node:test — no Playwright needed, these are pure data assertions.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const UNITS = require('./units');

test('exactly 12 units, matching the spec', () => {
  // 11 code units from the spec + 'styles' (assets/style.css), added because
  // the stylesheet was covered by no unit at all — see units.js.
  assert.strictEqual(UNITS.length, 12);
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

// Assert MEMBERSHIP, not a count. A count passes if two units swap tiers,
// and — worse — it passes if 'entity' is demoted from tier 1, which would
// silently disarm the suite's hardest gate: entity is the only unit covering
// six master-data screens, so losing its hard field contract loses six
// screens' protection at once. Naming the members makes any retiering show up
// as a failed test that says exactly which unit moved.
test('tier 1 is exactly the hard-gate units, by name', () => {
  const tier1 = UNITS.filter(u => u.tier === 1).map(u => u.unit).sort();
  assert.deepStrictEqual(tier1,
    ['audit', 'entity', 'locations', 'maintenance', 'pallets', 'styles']);
});

test('tier 3 is exactly the report-only units, by name', () => {
  const tier3 = UNITS.filter(u => u.tier === 3).map(u => u.unit).sort();
  assert.deepStrictEqual(tier3,
    ['daily_ops', 'dashboard', 'orders_intl', 'orders_natl', 'weekly_intl', 'weekly_natl']);
});

// Every unit is either a hard gate or report-only; a typo'd tier (2, '1',
// undefined) would otherwise sit in neither list above and be checked by
// nothing.
test('every unit is tier 1 or tier 3', () => {
  for (const u of UNITS) {
    assert.ok(u.tier === 1 || u.tier === 3, `unit ${u.unit} has tier ${u.tier}`);
  }
});
