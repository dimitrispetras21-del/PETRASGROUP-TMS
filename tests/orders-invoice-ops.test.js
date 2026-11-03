// tests/orders-invoice-ops.test.js — run: TZ=Europe/Athens node --test tests/orders-invoice-ops.test.js
// modules/orders_invoice_ops.js: the ONE copy of the invoicing rules and writes, shared by «Προς τιμολόγηση»
// and «Εβδομάδα» (owner 3/11/2026). The writes are proven on the record the Worker returns, never on the
// absence of an error — a fake atPatch plays the Worker.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersStock } = require('../core/orders-common.js');
global.OrdersCommon = OrdersCommon;
global.OrdersStock = OrdersStock;
global.TABLES = { ORDERS: 'tblORD', NAT_ORDERS: 'tblNAT' };
const IO = require('../modules/orders_invoice_ops.js');
const V = require('../modules/orders_invoicing_view.js');

const it = (id, type, f, state, extra) => Object.assign({ id, type, f, state, reason: state === 'blocked' ? 'price' : '', num: '#' + id, client: 'C ' + id, clientId: 'rec' + id }, extra || {});

test('«Προς τιμολόγηση» uses the very same functions (one copy)', () => {
  for (const k of ['dupCheck', 'dateCheck', 'invoiceFields', 'selfFields', 'undoFields']) assert.strictEqual(V[k], IO[k], k);
});

test('the fields of each write', () => {
  assert.deepStrictEqual(IO.invoiceFields('0434', '2026-11-03'), { Invoiced: true, 'Invoice Number': '0434', 'Invoice Date': '2026-11-03' });
  assert.deepStrictEqual(IO.selfFields('2026-11-03'), { Invoiced: true, 'Self Delivery': true, 'Invoice Number': null, 'Invoice Date': '2026-11-03' });
  assert.deepStrictEqual(IO.undoFields(false), { Invoiced: false, 'Invoice Number': null, 'Invoice Date': null });
  assert.deepStrictEqual(IO.undoFields(true), { Invoiced: false, 'Invoice Number': null, 'Invoice Date': null, 'Self Delivery': false });
  assert.deepStrictEqual(IO.tpyFields('0435', '2026-11-02'), { 'Invoice Number': '0435', 'Invoice Date': '2026-11-02' });
});

test('date, duplicate ΤΠΥ and the words under the box', () => {
  assert.ok(IO.dateCheck('', '2026-11-03').error);
  assert.ok(IO.dateCheck('2026-11-04', '2026-11-03').error, 'tomorrow');
  assert.deepStrictEqual(IO.dateCheck('2026-11-03', '2026-11-03'), {});
  const self = it('A', 'intl', {}, 'ready', { clientId: 'recX' });
  const items = [
    it('B', 'intl', { 'Invoice Number': ' 0434 ' }, 'invoiced', { clientId: 'recX' }),
    it('C', 'natl', { 'Invoice Number': '0434' }, 'invoiced', { clientId: 'recY', client: 'Other' }),
    it('D', 'intl', { 'Invoice Number': '0434' }, 'ready', { clientId: 'recY' }),
  ];
  const dup = IO.dupCheck(items, '0434', self);
  assert.deepStrictEqual([dup.same.map(x => x.id), dup.other.map(x => x.id)], [['B'], ['C']]);
  const h = IO.tpyHints('0434', {}, dup);
  assert.deepStrictEqual(h.map(x => x.kind), ['muted', 'warn']);
  assert.match(h[1].text, /υπάρχει ήδη στην #C άλλου πελάτη \(Other\)/);
  assert.strictEqual(IO.tpyHints('9', { error: 'x' }, { same: [], other: [] })[0].kind, 'bad');
});

test('«Αυτοπαράδοση» is offered on ready, and on an unpriced order but never an unpriced stock lot', () => {
  assert.strictEqual(IO.selfAllowed(it('A', 'intl', {}, 'ready')), true);
  assert.strictEqual(IO.selfAllowed(it('A', 'natl', {}, 'blocked')), true);
  assert.strictEqual(IO.selfAllowed(it('A', 'intl', { 'Own Stock Lot': true }, 'blocked')), false);
  assert.strictEqual(IO.selfAllowed(it('A', 'intl', { 'Own Stock Lot': true }, 'ready')), true);
  assert.strictEqual(IO.selfAllowed(it('A', 'intl', {}, 'invoiced')), false);
});

test('an invoiced order\'s price: owner and accountant only (owner 3/11) — the «Διόρθωση» rule, asked, never copied', () => {
  delete global.OrderQuickEdit;
  assert.strictEqual(IO.priceLocked({ Invoiced: true, 'Self Delivery': true, Price: 1 }), true, 'without the rule: every invoiced price locked (fail closed)');
  assert.strictEqual(IO.priceLocked({}), false, 'without the rule: an unpriced, uninvoiced order is never called invoiced');
  global.OrderQuickEdit = require('../core/order-quick-edit.js');
  const inv = { Invoiced: true, 'Invoice Number': '1', Price: 5 }, self = { Invoiced: true, 'Self Delivery': true, Price: 5 };
  for (const r of ['owner', 'accountant']) { global.ROLE = r; assert.strictEqual(IO.priceLocked(inv), false, r); assert.strictEqual(IO.priceLocked(self), false, r + ' self'); }
  for (const r of ['dispatcher', 'management', 'warehouse', undefined]) {
    if (r) global.ROLE = r; else delete global.ROLE;
    assert.strictEqual(IO.priceLocked(inv), true, String(r)); assert.strictEqual(IO.priceLocked(self), true, String(r) + ' self');
  }
  global.ROLE = 'dispatcher';
  assert.strictEqual(IO.priceLocked({ Price: 5 }), false, 'not invoiced: never locked');
  // a stock LOT's price freezes with its invoice for everyone (the base: lot_invoiced) — no box she would type in vain
  global.ROLE = 'accountant';
  assert.strictEqual(IO.priceLocked(Object.assign({ 'Own Stock Lot': true }, inv)), true, 'invoiced lot: locked for the accountant too');
  assert.match(IO.priceLockText(Object.assign({ 'Own Stock Lot': true }, inv)), /Η παρτίδα τιμολογήθηκε/);
  assert.strictEqual(IO.priceLocked({ 'Own Stock Lot': true, Price: 5 }), false, 'a lot not invoiced: open');
  delete global.ROLE;
});

test('the question before an invoiced price changes: ΤΠΥ and «το τιμολόγιο στο ERP ΔΕΝ αλλάζει», a self delivery without it', async () => {
  const asked = [];
  global.confirmAction = async (msg, opts) => { asked.push({ msg, opts }); return true; };
  await IO.confirmPrice({ num: '#1244', f: { Invoiced: true, 'Invoice Number': '0463', Price: 1150 } }, 1200);
  await IO.confirmPrice({ num: '#1255', f: { Invoiced: true, 'Self Delivery': true, Price: 2950 } }, 3000);
  assert.match(asked[0].msg, /Αλλαγή τιμής της #1244 \(ΤΠΥ 0463\)/);
  assert.match(asked[0].msg, /1\.150,00 € γίνεται 1\.200,00 €/);
  assert.match(asked[0].msg, /Το τιμολόγιο στο ERP ΔΕΝ αλλάζει από εδώ/);
  assert.match(asked[1].msg, /\(αυτοπαράδοση\)/);
  assert.doesNotMatch(asked[1].msg, /ΔΕΝ αλλάζει/);
  assert.strictEqual(asked[0].opts.danger, true);
});

test('who may write: owner and accountant (costs full), nobody else', () => {
  global.can = k => (k === 'costs' ? 'full' : 'none'); assert.strictEqual(IO.canWrite(), true);
  global.can = k => (k === 'costs' ? 'view' : 'full'); assert.strictEqual(IO.canWrite(), false);
  delete global.can; assert.strictEqual(IO.canWrite(), false);
});

// The Worker, played: answers with `back(fields)`; records every PATCH.
function worker(back) {
  const calls = [];
  global.atPatch = async (table, id, fields) => { calls.push({ table, id, fields }); return back(fields); };
  return calls;
}

test('writes go to the order\'s own table and return only on the Worker\'s word', async () => {
  const intl = it('O1', 'intl', {}, 'ready'), natl = it('N1', 'natl', {}, 'ready');
  const calls = worker(f => ({ id: 'x', fields: Object.assign({}, f) }));
  await IO.writeInvoice(intl, '0434', '2026-11-03');
  await IO.writeSelf(natl, '2026-11-03');
  await IO.writeUndo(intl, true);
  await IO.writeTpy(intl, '0435', '2026-11-03');
  assert.strictEqual(await IO.writePrice(natl, 950), 950);
  assert.deepStrictEqual(calls.map(c => [c.table, c.id]), [['tblORD', 'O1'], ['tblNAT', 'N1'], ['tblORD', 'O1'], ['tblORD', 'O1'], ['tblNAT', 'N1']]);
  assert.deepStrictEqual(calls[4].fields, { Price: 950 });
});

test('a write the Worker did not keep is a failure, never a success', async () => {
  const o = it('O1', 'intl', {}, 'ready');
  // trap #1: the label dropped, 200 with the old row
  worker(() => ({ id: 'x', fields: {} }));
  await assert.rejects(IO.writeInvoice(o, '0434', '2026-11-03'), /δεν επιβεβαίωσε τον ΤΠΥ/);
  await assert.rejects(IO.writeSelf(o, '2026-11-03'), /δεν επιβεβαίωσε την αυτοπαράδοση/);
  await assert.rejects(IO.writeTpy(o, '0435', '2026-11-03'), /δεν επιβεβαίωσε τον ΤΠΥ/);
  await assert.rejects(IO.writePrice(o, 950), /δεν επέστρεψε την τιμή/);
  worker(() => ({ id: 'x', fields: { Invoiced: true } }));
  await assert.rejects(IO.writeUndo(o, false), /δεν επιβεβαίωσε την αναίρεση/);
  worker(() => ({ id: 'x', fields: { Price: 905 } }));
  await assert.rejects(IO.writePrice(o, 950), /γράφτηκε 905,00 αντί για 950,00/);
  // offline: atPatch queued it — nothing reached the table yet
  worker(f => ({ id: 'x', fields: f, _offline: true }));
  for (const p of [IO.writeInvoice(o, '1', '2026-11-03'), IO.writeSelf(o, '2026-11-03'), IO.writeUndo(o, false), IO.writeTpy(o, '1', '2026-11-03'), IO.writePrice(o, 1)]) {
    await assert.rejects(p, /Εκτός σύνδεσης/);
  }
  // a refusal (422 from 043 / 101) keeps its own words
  global.atPatch = async () => { throw new Error('Δεν σημαίνεται τιμολογημένη χωρίς τιμή'); };
  await assert.rejects(IO.writeInvoice(o, '1', '2026-11-03'), /χωρίς τιμή/);
});
