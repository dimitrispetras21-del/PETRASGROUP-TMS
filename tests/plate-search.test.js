// _fhPlateNorm (core/form-helpers.js): the vehicle pickers' search (T33, walkthrough
// 13/10 item 1). Plates are stored in Latin letters; a Greek keyboard types the
// look-alike letter, and users type spaces or dashes at will.
// UNIT ONLY: the function is extracted verbatim from core/form-helpers.js (the file
// itself needs a browser) and run in a vm, like tests/csv-safe-cell.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'core', 'form-helpers.js'), 'utf8');
const map = (SRC.match(/const _FH_PLATE_GR = \{[^\n]*\};\n/) || [''])[0];
const fn = (SRC.match(/function _fhPlateNorm\(s\) \{[\s\S]*?\n\}\n/) || [''])[0];
const ctx = {};
if (map && fn) vm.runInNewContext(map + fn + '\nthis._fhPlateNorm = _fhPlateNorm;', ctx);
const norm = ctx._fhPlateNorm || (() => { throw new Error('_fhPlateNorm missing'); });
const finds = (query, label) => norm(label).includes(norm(query));

test('_fhPlateNorm source found in core/form-helpers.js', () => assert.ok(map && fn));

test('Greek look-alike letters find the Latin plate', () => {
  assert.ok(finds('ΙΑΒ', 'IAB-1234 (Φορτηγό)'));
  assert.ok(finds('ιαβ 12', 'IAB-1234 (Φορτηγό)'));
  assert.ok(finds('ΡΧΕ', 'PXE 5678'));
  assert.ok(finds('ΚΗΜ', 'KHM9012'));
});

test('case, spaces and dashes do not matter', () => {
  assert.ok(finds('iab1234', 'IAB-1234'));
  assert.ok(finds('IAB 1234', 'IAB-1234'));
  assert.ok(finds('cb 1286 ke', 'CB1286KE'));
});

test('a different plate does not match', () => {
  assert.ok(!finds('ΙΑΖ', 'IAB-1234'));
  assert.ok(!finds('1235', 'IAB-1234'));
});

test('Greek letters with no Latin look-alike stay Greek, so the type label is searchable', () => {
  assert.ok(finds('ρυμουλ', 'TR-77 (Ρυμουλκούμενο)'));
  assert.ok(finds('φορτηγό', 'IAB-1234 (Φορτηγό)'));
});
