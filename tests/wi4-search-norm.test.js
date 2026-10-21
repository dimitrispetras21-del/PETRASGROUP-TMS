// node --test tests/wi4-search-norm.test.js
// Weekly International v4 search (Pantelis 21/10): both the query and every
// row's text go through _sNorm — any case, no accents, no spaces, dashes,
// dots or slashes, final «ς» as «σ». The REAL _sNorm is cut out of
// modules/weekly_intl_v2.js (private to its IIFE), so a change there is caught.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'modules', 'weekly_intl_v2.js'), 'utf8');
function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found in weekly_intl_v2.js');
  let depth = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}' && --depth === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const norm = new Function(grab('_sNorm') + '\nreturn _sNorm;')();
const finds = (q, text) => norm(text).includes(norm(q));

test('accents and case do not matter', () => {
  assert.ok(finds('πελατης', 'Πελάτης Α.Ε.'));
  assert.ok(finds('ΠΕΛΆΤΗΣ', 'πελατης'));
  assert.ok(finds('Βέροια', 'ΒΕΡΟΙΑ'));
  assert.ok(finds('müller', 'Muller Milch'));
});

test('final sigma counts as sigma', () => {
  assert.ok(finds('πελατησ', 'ΠΕΛΑΤΗΣ'));
  assert.ok(finds('ΠΕΛΑΤΗΣ', 'πελατης'));
});

test('spaces, dashes, dots and slashes do not matter', () => {
  assert.ok(finds('iaz4471', 'IAZ 4471 · P11990'));
  assert.ok(finds('IAZ 4471', 'iaz4471'));
  assert.ok(finds('tst1017', 'TST-1017'));
  assert.ok(finds('tst – 1017', 'TST1017'));
  assert.ok(finds('α.ε.', 'ΒΕΡΜΙΟΝ ΑΕ'));
});

test('a query of only separators is no search', () => {
  assert.strictEqual(norm(' - '), '');
  assert.strictEqual(norm(null), '');
});

test('parts of a word still find', () => {
  assert.ok(finds('berg', 'Berglandmilch'));
  assert.ok(finds('alpha fa', 'Alpha Farm'));
});
