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

// invoiceNeedsBefore — when the «before» read FAILED (undefined, not «not
// found»), only a patch that marks invoiced or sets the ERP number is refused
// (503, retry); price-only edits still pass (3/10, audit 28/9 fail-open).
const m2 = src.match(/function invoiceNeedsBefore\(table, patch\) \{[\s\S]*?\n\}\n/);
assert.ok(m2, 'invoiceNeedsBefore not found in worker/src/index.js');
const invoiceNeedsBefore = new Function(m2[0] + '\nreturn invoiceNeedsBefore;')();

test('unreadable row: marking invoiced / setting the ERP number waits; price and other edits pass', () => {
  assert.strictEqual(invoiceNeedsBefore('orders', { invoiced: true, invoice_number: 'ΤΠΥ-1' }), true);
  assert.strictEqual(invoiceNeedsBefore('national_orders', { invoice_number: 'ΤΠΥ-1' }), true);
  assert.strictEqual(invoiceNeedsBefore('orders', { price: 1200 }), false, 'owner fills prices daily');
  assert.strictEqual(invoiceNeedsBefore('orders', { invoiced: false }), false, 'un-marking passes');
  assert.strictEqual(invoiceNeedsBefore('clients', { invoiced: true }), false);
  // the handler distinguishes the two «before» values
  assert.ok(/before === void 0 && invoiceNeedsBefore\(cfg\.pg, patch\)/.test(src), 'handler refuses only on a FAILED read');
  assert.ok(/return void 0;\s*\}\s*\}\s*__name\(readRowBefore/.test(src), 'readRowBefore returns undefined on failure');
});

// «Αυτοπαράδοση» (owner 2/11/2026, migration 101): our own group's goods, no
// ERP transport invoice. Invoiced with self_delivery = true needs no number and
// no price; everything else is 043's rule, unchanged. Same cases as the PGlite
// proof of 101 (tms-auditor/test/plan-101.test.mjs), so the 422 and the base agree.
test('self delivery: invoiced with no number and no price passes; without the box it is 043 again', () => {
  const sd = { invoiced: false, invoice_number: null, price: null, self_delivery: false };
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true, self_delivery: true, invoice_date: '2026-11-02' }, sd), null);
  assert.strictEqual(invoiceMarkError('national_orders', { invoiced: true, self_delivery: true }, sd), null);
  assert.match(invoiceMarkError('orders', { invoiced: true, self_delivery: false }, sd), /ΤΠΥ/);
  assert.match(invoiceMarkError('orders', { invoiced: true }, sd), /ΤΠΥ/);
  // a row already marked self delivery (not invoiced) still passes when invoiced alone
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true }, { ...sd, self_delivery: true }), null);
});

test('self delivery: an invoiced one keeps any price; unticking it without a number is refused; the undo passes', () => {
  const inv = { invoiced: true, invoice_number: null, price: null, self_delivery: true };
  assert.strictEqual(invoiceMarkError('orders', { price: 950 }, inv), null, 'a price added later');
  assert.strictEqual(invoiceMarkError('orders', { price: null }, { ...inv, price: 950 }), null, 'and removed');
  assert.match(invoiceMarkError('orders', { self_delivery: false }, inv), /ΤΠΥ/, 'unticking alone: never clears Invoiced by itself');
  assert.match(invoiceMarkError('national_orders', { self_delivery: false }, inv), /ΤΠΥ/);
  assert.strictEqual(invoiceMarkError('orders', { invoiced: false, invoice_number: null, invoice_date: null, self_delivery: false }, inv), null, 'the screen undo');
  assert.strictEqual(invoiceMarkError('orders', { self_delivery: false, invoice_number: 'ΤΠΥ-9' }, { ...inv, price: 800 }), null, 'unticking with a number + price = an ordinary invoice');
  assert.match(invoiceMarkError('orders', { self_delivery: false, invoice_number: 'ΤΠΥ-9' }, inv), /τιμή/, 'unticking with a number but no price');
});

test('self delivery: an unreadable row waits (503) for a patch that names it', () => {
  assert.strictEqual(invoiceNeedsBefore('orders', { self_delivery: false }), true);
  assert.strictEqual(invoiceNeedsBefore('national_orders', { invoiced: true, self_delivery: true }), true);
});

// 101's CHECK, repeated as a 422 in her words: a self delivery IS an invoiced row WITHOUT a number.
test('self delivery CHECK: never on an uninvoiced row, never beside a ΤΠΥ; invoiced off alone refused; a boolean only', () => {
  const plain = { invoiced: false, invoice_number: null, price: 500, self_delivery: false };
  const numbered = { invoiced: true, invoice_number: 'ΤΠΥ-7', price: 700, self_delivery: false };
  const sd = { invoiced: true, invoice_number: null, price: null, self_delivery: true };
  assert.match(invoiceMarkError('orders', { self_delivery: true }, plain), /αναίρεσε πρώτα/, 'uninvoiced row');
  assert.match(invoiceMarkError('orders', { self_delivery: true }, numbered), /αναίρεσε πρώτα/, 'beside a real ΤΠΥ');
  assert.match(invoiceMarkError('national_orders', { invoice_number: 'ΤΠΥ-8' }, sd), /αναίρεσε πρώτα/, 'a number on a self delivery');
  assert.match(invoiceMarkError('orders', { invoiced: false }, sd), /αναίρεσε πρώτα/, 'invoiced off alone (the box would stay)');
  assert.match(invoiceMarkError('orders', { invoiced: true, self_delivery: true, invoice_number: 'ΤΠΥ-9' }, plain), /αναίρεσε πρώτα/);
  assert.match(invoiceMarkError('orders', { self_delivery: null }, sd), /ναι ή όχι/);
  assert.match(invoiceMarkError('orders', { self_delivery: 'true' }, plain), /ναι ή όχι/);
  // the screen's two writes and an ordinary edit of a self delivery still pass
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true, self_delivery: true, invoice_number: null, invoice_date: '2026-11-02' }, plain), null);
  assert.strictEqual(invoiceMarkError('orders', { invoiced: false, invoice_number: null, invoice_date: null, self_delivery: false }, sd), null);
  assert.strictEqual(invoiceMarkError('orders', { delivery_datetime: '2026-11-03' }, sd), null);
  // rows read before 101 carry no self_delivery at all: unchanged behaviour
  assert.strictEqual(invoiceMarkError('orders', { invoiced: true, invoice_number: 'ΤΠΥ-1' }, { invoiced: false, invoice_number: null, price: 100 }), null);
});
