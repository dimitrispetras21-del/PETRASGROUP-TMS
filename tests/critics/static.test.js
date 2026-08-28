const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('hex-looking sequences inside comments are not counted', () => {
  const fixture = path.join(os.tmpdir(), `static-critic-comment-fixture-${process.pid}.js`);
  fs.writeFileSync(fixture, [
    '// Πελάτης #1314 — see modules/pallet_ledger.js:72',
    '/* SESSION.md learning #105 — see modules/metrics_audit.js:299 */',
  ].join('\n'));
  try {
    const unit = { unit: 'fixture', tier: 0, routes: [], files: [fixture] };
    const m = measure(unit);
    assert.strictEqual(m.hex, 0);
  } finally {
    fs.unlinkSync(fixture);
  }
});
