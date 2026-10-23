// tests/orders-catalog-status.test.js — run: node --test tests/orders-catalog-status.test.js
// The status word of the orders catalog (modules/orders_catalog.js _statusWord) for a stock lot.
// B0 review #4 (owner 22/10/2026): a lot is invoiced from its registration, so «invoiced» no longer
// means «finished». An invoiced lot whose pieces are not all done must not read as finished: it says
// where it is («Τιμολογήθηκε · στην αποθήκη»); only a COMPLETE invoiced lot reads «Τιμολογήθηκε».
// The functions are cut verbatim from the module (it is browser-only), as tests/stock-kpis.test.js does,
// and run on the REAL OrdersCommon / OrdersStock.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_catalog.js'), 'utf8');
const cut = (re, name) => { const m = src.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const STATUS = cut(/const STATUS = \{[\s\S]*?\n {2}\};/, 'STATUS');
const LOT_DONE = cut(/function _lotDone\(r\) \{[\s\S]*?\n {2}\}/, '_lotDone');
const WORD = cut(/function _statusWord\(r\) \{[\s\S]*?\n {2}\}/, '_statusWord');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersCommon, OrdersStock } = require('../core/orders-common.js');

// cache = OrdersData._cache (the invoicing set the hub already loaded), or null when not loaded yet.
function wordOf(fields, cache) {
  const ctx = { OrdersCommon, OrdersStock, OrdersData: { _cache: cache } };
  vm.runInNewContext(`const C = () => OrdersCommon;\n${STATUS}\n${LOT_DONE}\n${WORD}\nthis.w = _statusWord;`, ctx);
  const r = { f: fields, lot: OrdersStock.isLot(fields), status: fields.Status };
  return ctx.w(r);
}
const LOT = (f) => Object.assign({ 'Own Stock Lot': 'recLot1', Price: 3300 }, f);
const SET = (lotFields) => ({ stock: new Map([['recLot1', { id: 'recLot1', fields: lotFields }]]) });

test('an invoiced lot still waiting for its pieces is not «finished»: «Τιμολογήθηκε · στην αποθήκη»', () => {
  assert.strictEqual(wordOf(LOT({ Status: 'Delivered', Invoiced: true }), SET({ Complete: false })), 'Τιμολογήθηκε · στην αποθήκη');
});

test('an invoiced lot not yet in the warehouse says where it is', () => {
  assert.strictEqual(wordOf(LOT({ Status: 'In Transit', Invoiced: true }), SET({ Complete: false })), 'Τιμολογήθηκε · σε μεταφορά');
});

test('a complete invoiced lot reads «Τιμολογήθηκε»', () => {
  assert.strictEqual(wordOf(LOT({ Status: 'Delivered', Invoiced: true }), SET({ Complete: true })), 'Τιμολογήθηκε');
});

test('lots not read yet: never claimed finished (the facade row cannot know)', () => {
  assert.strictEqual(wordOf(LOT({ Status: 'Delivered', Invoiced: true }), null), 'Τιμολογήθηκε · στην αποθήκη');
});

test('unchanged: a lot not invoiced, and an ordinary order', () => {
  assert.strictEqual(wordOf(LOT({ Status: 'Delivered' }), SET({ Complete: false })), 'Στην αποθήκη');
  assert.strictEqual(wordOf(LOT({ Status: 'Delivered' }), SET({ Complete: true })), 'Ολοκληρώθηκε');
  assert.strictEqual(wordOf({ Status: 'Delivered', Invoiced: true }, null), 'Παραδόθηκε');
});
