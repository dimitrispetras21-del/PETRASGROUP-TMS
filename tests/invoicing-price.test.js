// «Έχει τιμή» για την πύλη τιμολόγησης = price > 0 — ο ΙΔΙΟΣ κανόνας με τον
// Worker (invoiceMarkError) και τη migration 043. Runs the REAL _invPrice /
// _invHasPrice extracted from modules/invoicing.js (no copy), so a drift in the
// screen shows up here before a λογίστρια sees a 422. Measured 22/9: 14 orders
// with Price 0 and one with −2 slipped through the old «=== null» gate.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../modules/invoicing.js'), 'utf8');
const grab = name => { const m = src.match(new RegExp(`function ${name}\\(rec\\) \\{[\\s\\S]*?\\n\\}\\n`)); if (!m) throw new Error(name + ' not found'); return m[0]; };
const grab0 = name => { const m = src.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\n\\}\\n`)); if (!m) throw new Error(name + ' not found'); return m[0]; };
const { _invPrice, _invHasPrice, _invUndoFields } = new Function(grab('_invPrice') + grab('_invHasPrice') + grab0('_invUndoFields') + '; return { _invPrice, _invHasPrice, _invUndoFields };')();
const rec = p => ({ fields: p === undefined ? {} : { Price: p } });

test('_invHasPrice: only a positive price opens the ΤΠΥ form', () => {
  assert.strictEqual(_invHasPrice(rec(undefined)), false);   // δεν καταχωρήθηκε
  assert.strictEqual(_invHasPrice(rec(null)), false);
  assert.strictEqual(_invHasPrice(rec('')), false);
  assert.strictEqual(_invHasPrice(rec(0)), false);           // 22/9: 14 rows
  assert.strictEqual(_invHasPrice(rec('0')), false);
  assert.strictEqual(_invHasPrice(rec(-2)), false);          // 22/9: id 335
  assert.strictEqual(_invHasPrice(rec(1)), true);
  assert.strictEqual(_invHasPrice(rec('3100')), true);
});

test('_invPrice stays a display value: 0 is 0 €, not «missing»', () => {
  assert.strictEqual(_invPrice(rec(0)), 0);
  assert.strictEqual(_invPrice(rec(null)), null);
  assert.strictEqual(_invPrice(rec('abc')), null);
});

test('_invUndoFields: undo clears exactly the three invoice fields, never Status/Price', () => {
  const f = _invUndoFields();
  assert.deepStrictEqual(Object.keys(f).sort(), ['Invoice Date', 'Invoice Number', 'Invoiced']);
  assert.strictEqual(f['Invoiced'], false);
  assert.strictEqual(f['Invoice Number'], null);
  assert.strictEqual(f['Invoice Date'], null);
});
