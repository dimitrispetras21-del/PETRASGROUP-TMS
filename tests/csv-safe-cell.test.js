// csvSafeCell (core/utils.js): CSV cells starting with = + - @ (or a tab / CR)
// are written as text — a leading ' — in every CSV exporter (4/10/2026).
// UNIT ONLY: the function is extracted verbatim from core/utils.js (the file
// itself needs a browser) and run in a vm, like tests/toast-types.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const UTILS = fs.readFileSync(path.join(ROOT, 'core', 'utils.js'), 'utf8');
const src = (UTILS.match(/function csvSafeCell\(v\) \{[\s\S]*?\n\}\n/) || [''])[0];
const ctx = {};
if (src) vm.runInNewContext(src + '\nthis.csvSafeCell = csvSafeCell;', ctx);
const csvSafeCell = ctx.csvSafeCell || (() => { throw new Error('csvSafeCell missing'); });

test('csvSafeCell source found in core/utils.js', () => assert.ok(src, 'csvSafeCell() not found'));

test('text starting with = + - @ tab CR gets a leading quote', () => {
  assert.strictEqual(csvSafeCell('=SUM(A1)'), "'=SUM(A1)");
  assert.strictEqual(csvSafeCell('+30 days'), "'+30 days");
  assert.strictEqual(csvSafeCell('+30 2310 123456'), "'+30 2310 123456");
  assert.strictEqual(csvSafeCell('@x'), "'@x");
  assert.strictEqual(csvSafeCell('-x'), "'-x");
  assert.strictEqual(csvSafeCell('-1+2'), "'-1+2");
  assert.strictEqual(csvSafeCell('+1-2'), "'+1-2");
  assert.strictEqual(csvSafeCell('+12,50 €'), "'+12,50 €");
  assert.strictEqual(csvSafeCell('-12,'), "'-12,");
  assert.strictEqual(csvSafeCell('+'), "'+");
  assert.strictEqual(csvSafeCell('\tx'), "'\tx");
  assert.strictEqual(csvSafeCell('\rx'), "'\rx");
  assert.strictEqual(csvSafeCell('\t12'), "'\t12");
});

test('numbers stay numbers — typeof number, and a text that is entirely a signed number', () => {
  assert.strictEqual(csvSafeCell(-12.5), -12.5);
  assert.strictEqual(csvSafeCell(0), 0);
  assert.strictEqual(csvSafeCell(42), 42);
  for (const s of ['+12,50', '-12,50', '+1.234,56', '-1.234,50', '-3', '+30', '-12.50', '12,50']) {
    assert.strictEqual(csvSafeCell(s), s, JSON.stringify(s));
  }
});

test('ordinary text unchanged — Greek, ampersand, quotes, inner = or -', () => {
  for (const s of ['Παλέτες Βέροια', 'A & B Α.Ε.', 'say "hi"', 'Ref 12-34', 'a=b', '', '—', '−12,50', ' =x']) {
    assert.strictEqual(csvSafeCell(s), s, JSON.stringify(s));
  }
});

test('null / undefined / booleans pass through (each exporter keeps its own blanks)', () => {
  assert.strictEqual(csvSafeCell(null), null);
  assert.strictEqual(csvSafeCell(undefined), undefined);
  assert.strictEqual(csvSafeCell(true), true);
});

// Every CSV builder in the app routes its cells through csvSafeCell — a new
// exporter that skips it shows up here, not in a spreadsheet.
test('every text/csv builder in core/ and modules/ calls csvSafeCell', () => {
  const files = [];
  for (const dir of ['core', 'modules']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.js')) files.push(path.join(dir, f));
  }
  const builders = files.filter(f => /text\/csv/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.ok(builders.length >= 9, 'found ' + builders.length + ' CSV builders');
  for (const f of builders) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const blobs = (code.match(/text\/csv/g) || []).length;
    const guarded = (code.match(/csvSafeCell\(/g) || []).length - (f === path.join('core', 'utils.js') ? 1 : 0);
    assert.ok(guarded >= blobs, f + ': ' + blobs + ' CSV builder(s), ' + guarded + ' csvSafeCell call(s)');
  }
});
