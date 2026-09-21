// invoiceMarkError — the Worker half of migration 043 (owner 21/9/2026,
// Eirini readiness §7.1 decisions 2+3): an order is marked invoiced only with
// a price and the ERP's invoice number. The function lives inside the bundled
// worker/src/index.js (no module exports there), so this test lifts its
// source text out and evaluates it — the same code that is deployed, not a
// copy that could drift (αρχή 3).
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');
const m = src.match(/function invoiceMarkError\(table, patch, before\) \{[\s\S]*?\n\}\n/);
assert.ok(m, 'invoiceMarkError not found in worker/src/index.js');
const invoiceMarkError = new Function(m[0] + '\nreturn invoiceMarkError;')();

const ok = { invoiced: false, invoice_number: null, price: 1200 };
const noPrice = { invoiced: false, invoice_number: null, price: null };
const oldMarked = { invoiced: true, invoice_number: null, price: 900 }; // the two 21/8 rows

test('becoming invoiced without a number → refused (422), with number → allowed', () => {
  assert.match(invoiceMarkError('orders', { invoiced: true }, ok), /ΤΠΥ/);
  assert.match(invoiceMarkError('orders', { invoiced: true, invoice_number: '   ' }, ok), /ΤΠΥ/);
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true, invoice_number: 'ΤΠΥ-1042', invoice_date: '2026-09-21' }, ok), null);
});

test('becoming invoiced without a price → refused, even with a number', () => {
  assert.match(invoiceMarkError('orders', { invoiced: true, invoice_number: 'ΤΠΥ-1042' }, noPrice), /τιμή/);
  assert.match(invoiceMarkError('orders', { invoiced: true, invoice_number: 'ΤΠΥ-1042', price: 0 }, ok), /τιμή/);
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true, invoice_number: 'ΤΠΥ-1042', price: 350 }, noPrice), null);
});

test('same rule on national_orders; any other table is not touched', () => {
  assert.match(invoiceMarkError('national_orders', { invoiced: true }, ok), /ΤΠΥ/);
  assert.strictEqual(invoiceMarkError('clients', { invoiced: true }, ok), null);
});

test('the two 21/8 rows (invoiced, no number) stay editable — only the transition is guarded', () => {
  assert.strictEqual(invoiceMarkError('orders', { delivery_datetime: '2026-08-22' }, oldMarked), null, 'a date fix passes');
  assert.strictEqual(invoiceMarkError('orders', { invoiced: false, invoice_number: null }, oldMarked), null, 'un-marking passes');
  assert.match(invoiceMarkError('orders', { invoice_number: '' }, oldMarked), /ΤΠΥ/, 'blanking the number of an invoiced row is refused');
  assert.match(invoiceMarkError('orders', { price: null }, { invoiced: true, invoice_number: 'ΤΠΥ-0007', price: 900 }), /τιμή/, 'removing the price of an invoiced row is refused');
  assert.strictEqual(invoiceMarkError('orders', { invoice_number: 'ΤΠΥ-0007' }, oldMarked), null, 'filling the missing number passes');
});

test('unknown record (before=null) → the 404 path decides, not this guard', () => {
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true }, null), null);
});
