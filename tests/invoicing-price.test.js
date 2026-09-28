// «Έχει τιμή» για την πύλη τιμολόγησης = price > 0 — ο ΙΔΙΟΣ κανόνας με τον
// Worker (invoiceMarkError) και τη migration 043. Since 28/9/2026 the rule lives
// ONCE in core/orders-common.js (OrdersCommon.hasPrice/price) and the invoicing
// screen is the «Προς τιμολόγηση» view (modules/orders_invoicing_view.js) — this
// runs the REAL functions from there (no copy). Measured 22/9: 14 orders with
// Price 0 and one with −2 slipped through the old «=== null» gate.
const test = require('node:test');
const assert = require('node:assert');
const { OrdersCommon } = require('../core/orders-common.js');
const view = require('../modules/orders_invoicing_view.js');
const f = p => (p === undefined ? {} : { Price: p });

test('hasPrice: only a positive price opens the ΤΠΥ form', () => {
  assert.strictEqual(OrdersCommon.hasPrice(f(undefined)), false);   // δεν καταχωρήθηκε
  assert.strictEqual(OrdersCommon.hasPrice(f(null)), false);
  assert.strictEqual(OrdersCommon.hasPrice(f('')), false);
  assert.strictEqual(OrdersCommon.hasPrice(f(0)), false);           // 22/9: 14 rows
  assert.strictEqual(OrdersCommon.hasPrice(f('0')), false);
  assert.strictEqual(OrdersCommon.hasPrice(f(-2)), false);          // 22/9: id 335
  assert.strictEqual(OrdersCommon.hasPrice(f(1)), true);
  assert.strictEqual(OrdersCommon.hasPrice(f('3100')), true);
});

test('price stays a display value: 0 is 0 €, not «missing»', () => {
  assert.strictEqual(OrdersCommon.price(f(0)), 0);
  assert.strictEqual(OrdersCommon.price(f(null)), null);
  assert.strictEqual(OrdersCommon.price(f('abc')), null);
});

test('undoFields: undo clears exactly the three invoice fields, never Status/Price', () => {
  const u = view.undoFields();
  assert.deepStrictEqual(Object.keys(u).sort(), ['Invoice Date', 'Invoice Number', 'Invoiced']);
  assert.strictEqual(u['Invoiced'], false);
  assert.strictEqual(u['Invoice Number'], null);
  assert.strictEqual(u['Invoice Date'], null);
});
