// node --test tests/wi4-search-norm.test.js
// The Weekly boards' search rule (Pantelis 21/10): fhSearchNorm / fhSearchBlob
// in core/form-helpers.js — any case, no accents, Greek → Latin like the stored
// place names, no spaces/dashes/dots/slashes, and the fields of a row kept apart
// so a query never matches across two of them. The REAL functions (and the
// _fhNorm they build on) are cut out of the file, so a change there is caught.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'core', 'form-helpers.js'), 'utf8');
function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found in core/form-helpers.js');
  let depth = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}' && --depth === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const EL = SRC.match(/const _FH_EL = \{[^}]*\};/);
assert.ok(EL, '_FH_EL not found');
const { norm, blob } = new Function(EL[0] + '\n' + grab('_fhNorm') + '\n' + grab('fhSearchNorm') + '\n' + grab('fhSearchBlob')
  + '\nreturn { norm: fhSearchNorm, blob: fhSearchBlob };')();
const finds = (q, parts) => blob(parts).includes(norm(q));

test('accents and case do not matter', () => {
  assert.ok(finds('πελατης', ['Πελάτης Α.Ε.']));
  assert.ok(finds('ΠΕΛΆΤΗΣ', ['πελατης']));
  assert.ok(finds('πελατησ', ['ΠΕΛΑΤΗΣ']));
});

test('Greek finds the Latin-stored place names (and the other way round)', () => {
  assert.ok(finds('Βέροια', ['Veroia, GR']));
  assert.ok(finds('Θεσσαλονίκη', ['Thessaloniki, GR']));
  assert.ok(finds('Κοζάνη', ['Kozani']));
  assert.ok(finds('pelatis', ['ΠΕΛΑΤΗΣ Β']));
});

test('spaces, dashes, dots and slashes do not matter', () => {
  assert.ok(finds('iaz4471', ['IAZ 4471']));
  assert.ok(finds('IAZ 4471', ['iaz4471']));
  assert.ok(finds('tst1017', ['TST-1017']));
  assert.ok(finds('tst – 1017', ['TST1017']));
});

test('a query never matches across two fields', () => {
  assert.ok(!finds('tst1010trl', ['TST-1010', 'TRL-2010']));
  assert.ok(finds('tst1010', ['TST-1010', 'TRL-2010']));
  assert.ok(finds('trl2010', ['TST-1010', 'TRL-2010']));
});

test('a query of only separators is no search; parts of a word still find', () => {
  assert.strictEqual(norm(' - '), '');
  assert.ok(finds('berg', ['Berglandmilch']));
  assert.ok(finds('alpha fa', ['Alpha Farm']));
});
