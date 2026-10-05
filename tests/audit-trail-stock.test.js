// node --test tests/audit-trail-stock.test.js
// Stock lots Φ1 (impact map 4/10 AT-01): the audit trail names the new table and columns in Greek
// instead of «STOCK LOTS» / «stock_lot_id» / «closed_note». The two maps and their label functions
// are cut verbatim from modules/audit_trail.js and run in a vm.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const S = fs.readFileSync(path.join(__dirname, '..', 'modules', 'audit_trail.js'), 'utf8');
const cut = (re, name) => { const m = S.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const ctx = {};
vm.runInNewContext([
  cut(/const _AUDIT_FIELD = \{[\s\S]*?\n\};/, '_AUDIT_FIELD'),
  cut(/function _auditFieldLabel\(f\) \{[\s\S]*?\n\}/, '_auditFieldLabel'),
  cut(/const _AUDIT_TABLE = \{[\s\S]*?\n\};/, '_AUDIT_TABLE'),
  cut(/function _auditTableLabel\(t\) \{[\s\S]*?\n\}/, '_auditTableLabel'),
].join('\n') + '\nthis.f = _auditFieldLabel; this.t = _auditTableLabel;', ctx);

test('AT-01: stock lots table and columns read in Greek', () => {
  assert.strictEqual(ctx.t('stock_lots'), 'Παρτίδες αποθέματος');
  assert.strictEqual(ctx.f('stock_lot_id'), 'Παρτίδα αποθέματος');
  assert.strictEqual(ctx.f('closed_note'), 'Κλείσιμο υπολοίπου · αιτιολογία');
  // an unlisted column still shows raw (visible as unlabelled, never guessed)
  assert.strictEqual(ctx.f('some_new_column'), 'some_new_column');
});
