// node --test tests/wi4-ref.test.js
// Weekly International v4, the reference under the date (Pantelis 21/10): a
// Reference holding several of the client's numbers shows the first and «+N»,
// all of them in the title. The REAL _refHTML/_ell are cut out of
// modules/weekly_intl_v2.js (they are private to its IIFE) and run with the
// module's own escape fallback, so a change there is caught here.
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
// The module's _esc without a page escapeHtml (its own fallback branch).
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const _refHTML = new Function('_esc', grab('_ell') + '\n' + grab('_refHTML') + '\nreturn _refHTML;')(_esc);

test('several numbers → the first and «+N», all of them in the title', () => {
  assert.strictEqual(_refHTML('2087, 1839, 2103, 2104, 2105, 2109, 2100'),
    '<span class="wi4-ref wi4-ell" title="2087, 1839, 2103, 2104, 2105, 2109, 2100">2087 +6</span>');
  assert.strictEqual(_refHTML('A;B'), '<span class="wi4-ref wi4-ell" title="A, B">A +1</span>');
});

test('one number stays as typed: a space or a dash is part of it', () => {
  assert.strictEqual(_refHTML('TA 1138630'), '<span class="wi4-ref wi4-ell" title="TA 1138630">TA 1138630</span>');
  assert.strictEqual(_refHTML('17609731 -17609400-17609732'),
    '<span class="wi4-ref wi4-ell" title="17609731 -17609400-17609732">17609731 -17609400-17609732</span>');
  assert.strictEqual(_refHTML('REF-1, '), '<span class="wi4-ref wi4-ell" title="REF-1, ">REF-1, </span>');
});

test('typed markup is escaped, in the text and in the title', () => {
  assert.strictEqual(_refHTML('<b>x</b>, y'), '<span class="wi4-ref wi4-ell" title="&lt;b&gt;x&lt;/b&gt;, y">&lt;b&gt;x&lt;/b&gt; +1</span>');
});
