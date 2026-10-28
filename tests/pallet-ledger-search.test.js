// node --test tests/pallet-ledger-search.test.js
// The pallet screen's order number and search (Alexia 27/10: «#385» and
// «Δεληγιαννίδης, εβδομάδα 43» found nothing). Runs the REAL pallet_ledger.js,
// the Weekly search rule from core/form-helpers.js and core/tms-week.js on
// synthetic movements, so a change in any of the three is caught.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function grab(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found');
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}

const FH = read('core/form-helpers.js');
const ctx = {
  console, document: { getElementById: () => null }, window: {},
  escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'),
  getLinkedId: (v) => (Array.isArray(v) ? v[0] : v || null),
  getRefDrivers: () => [{ id: 'recD1', fields: { 'Full Name': 'Papadopoulos Nikos' } }],
  getRefPartners: () => [], getTruckPlate: (id) => (id === 'recT1' ? 'XYZ1234' : ''),
};
vm.createContext(ctx);
vm.runInContext(FH.match(/const _FH_EL = \{[^}]*\};/)[0] + '\n' + grab(FH, '_fhNorm') + '\n' + grab(FH, 'fhSearchNorm')
  + '\n' + grab(FH, 'fhSearchBlob') + '\nthis.fhSearchNorm = fhSearchNorm; this.fhSearchBlob = fhSearchBlob;', ctx);
vm.runInContext(read('core/tms-week.js') + '\nthis.TmsWeek = TmsWeek;', ctx);
vm.runInContext(read('modules/pallet_ledger.js') + '\nthis.PLV = PLV; this._plvRows = _plvRows; this._plvNo = _plvNo;'
  + ' this._plvMovementRow = _plvMovementRow;', ctx);

const mv = (id, order_id, date, extra = {}) => ({ id, code: 'PM-' + (1000 + id), order_id, movement_date: date,
  status: 'confirmed', event_type: 'LOADING', counterparty_type: 'CLIENT', client_id: 1,
  clients: { company_name: 'Client A' }, locations: { name: 'Place A' }, taken: 1, given: 0, ...extra });
const MOVES = [
  mv(1, 385, '2026-09-25'),
  mv(2, 3850, '2026-09-26'),
  mv(3, 7, '2026-10-24'),             // order of week 43, movement of week 44
  mv(4, 8, '2026-10-20'),
  mv(5, null, '2026-10-01', { code: 'PM-1385' }),
];
ctx.PLV.movements = MOVES;
ctx.PLV.orderById = {
  385: { fields: { 'Week Number': 39 } },
  7: { fields: { 'Week Number': 43, Driver: ['recD1'], Truck: ['recT1'] } },
  8: { fields: { 'Week Number': 42 } },
};
ctx.PLV.tab = 'all';
const ids = (q) => { ctx.PLV.q = q; return ctx._plvRows().map((m) => m.id).sort(); };

test('the number column is #order_id, empty only without an order', () => {
  assert.strictEqual(ctx._plvNo(MOVES[0]), '#385');
  assert.strictEqual(ctx._plvNo(MOVES[4]), '');
  assert.ok(ctx._plvMovementRow(MOVES[0], false).includes('<td class="plv-ref plv-no">#385</td>'));
});

test('«#385» is that order exactly; a bare 385 stays a substring', () => {
  assert.deepStrictEqual(ids('#385'), [1]);
  assert.deepStrictEqual(ids('385'), [1, 2, 5]);
});

test('the driver is found in Greek and in Latin', () => {
  assert.deepStrictEqual(ids('Παπαδόπουλος'), [3]);
  assert.deepStrictEqual(ids('papadopoulos'), [3]);
});

test('«w43» finds the order week and the movement week', () => {
  assert.deepStrictEqual(ids('w43'), [3, 4]);   // 3: order week 43 · 4: movement 20/10 = week 43
  assert.deepStrictEqual(ids('w44'), [3]);      // 3: its movement falls in week 44
});
