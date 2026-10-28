// «Εκτύπωση εντολών» / «Εκτύπωση λήξεων» (Thodoris 27/10): the planning list
// of modules/maintenance.js prints as two sheets. Each sheet must carry only
// its own kind, and its title and counts must say which one it is.
// UNIT ONLY: the block is extracted verbatim and run in a vm with stubs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'modules', 'maintenance.js'), 'utf8');
const a = SRC.indexOf("const _MREQ_LEGAL_DOCS"), b = SRC.indexOf('// Right-click / long-press: the same list as text');
const block = a > 0 && b > a ? SRC.slice(a, b).replace(/let _mreqListBusy = false;[\s\S]*?\nfunction _mreqListPrintHtml/, 'function _mreqListPrintHtml') : '';

const today = '2026-10-27';
const plus = d => { const x = new Date(today + 'T00:00:00'); x.setDate(x.getDate() + d); return [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-'); };
let written = '';
const frame = { id: '', style: {}, setAttribute() {}, remove() {}, contentWindow: { document: { open() {}, write(h) { written = h; }, close() {}, querySelector: () => null, fonts: null }, focus() {}, print() {} } };
const ctx = {
  localToday: () => today, toLocalDate: s => String(s || '').slice(0, 10), escapeHtml: s => String(s),
  _vwPlate: p => String(p || '').replace(/\W/g, '').toUpperCase(),
  _daysUntil: s => Math.round((new Date(s + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5),
  _expiryFieldsFor: (f, fields) => fields, _VW_DOC_GR: { KTEO: 'ΚΤΕΟ' }, _normP: p => p || '',
  TRUCK_EXPIRY_FIELDS: [{ field: 'KTEO Expiry', label: 'KTEO' }], TRAILER_EXPIRY_FIELDS: [],
  MAINT: { trucks: [{ id: 'recT1', fields: { Active: true, 'License Plate': 'AAA-1', 'KTEO Expiry': plus(-3) } },
    { id: 'recT2', fields: { Active: true, 'License Plate': 'BBB-2', 'KTEO Expiry': plus(60) } }], trailers: [] },
  MREQ: { data: [{ fields: { 'Vehicle Plate': 'BBB-2', Priority: 'SOS', Description: 'Φρένα', 'Date Reported': plus(-1) } },
    { fields: { 'Vehicle Plate': 'AAA-1', Priority: 'Άμεσα', Description: 'ΚΤΕΟ ραντεβού', 'Date Reported': plus(-2) } }] },
  getRefLocations: () => [], getRefDrivers: () => [], getRefTrucks: () => [], getRefTrailers: () => [],
  document: { getElementById: () => null, createElement: () => frame, body: { appendChild() {} } },
  setTimeout, Promise,
};
if (block) vm.runInNewContext(block + '\nthis.model = _mreqListModel; this.html = _mreqListPrintHtml;', ctx);

test('print-list block found in modules/maintenance.js', () => assert.ok(block && ctx.model));

test('work-order sheet: only work orders, no document lines', () => {
  const m = ctx.model([], 'wo');
  const items = m.sections.flatMap(s => s.rows.flatMap(v => v.items));
  assert.strictEqual(items.length, 2);
  assert.ok(items.every(it => !it.doc));
  assert.deepStrictEqual([m.sos, m.urgent, m.expired, m.due], [1, 1, 0, 0]);
  ctx.html(m);
  assert.match(written, /<h1>Εντολές εργασίας/);
  assert.match(written, /1 SOS · 1 Άμεσα/);
  assert.doesNotMatch(written, /ΚΤΕΟ έληξε/);
});

test('documents sheet: only documents, the work order naming ΚΤΕΟ does not hide it', () => {
  const m = ctx.model([], 'docs');
  const rows = m.sections.flatMap(s => s.rows);
  assert.deepStrictEqual(Array.from(rows, v => v.plate), ['AAA-1']);
  assert.ok(rows[0].items.every(it => it.doc));
  assert.deepStrictEqual([m.sos, m.urgent, m.expired, m.due], [0, 0, 1, 0]);
  ctx.html(m);
  assert.match(written, /<h1>Λήξεις εγγράφων/);
  assert.match(written, /ΚΤΕΟ έληξε πριν 3 ημ\./);
  assert.doesNotMatch(written, /Φρένα|SOS ·/);
});

test('trip read failed: sheet still says so in both modes', () => {
  for (const mode of ['wo', 'docs']) { ctx.html(ctx.model(null, mode)); assert.match(written, /ΔΡΟΜΟΛΟΓΙΑ ΔΕΝ ΕΛΕΓΧΘΗΚΑΝ/); }
});
