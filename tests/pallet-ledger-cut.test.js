// node --test tests/pallet-ledger-cut.test.js
// The pallet list says when it is cut (owner 28/10): the Worker answers truncated + cap; the old Worker cut at 300
// without saying it. Runs the REAL _plvCut / _plvCutNote from modules/pallet_ledger.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, document: { getElementById: () => null }, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules/pallet_ledger.js'), 'utf8')
  + '\nthis._plvCut = _plvCut; this._plvCutNote = _plvCutNote;', ctx);
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

test('paged Worker: whole list is not cut, no note', () => {
  assert.strictEqual(ctx._plvCut({ records: rows(291), truncated: false, cap: 9990 }), null);
  assert.strictEqual(ctx._plvCutNote(null), '');
});

test('paged Worker: truncated is said, in the list and in the card', () => {
  const cut = ctx._plvCut({ records: rows(9990), truncated: true, cap: 9990 });
  assert.deepStrictEqual({ ...cut }, { n: 9990, cap: 9990, cut: true });
  assert.match(ctx._plvCutNote(cut, false), /9990 νεότερες.*λείπουν από τη λίστα/);
  assert.match(ctx._plvCutNote(cut, true), /τρεχούμενο δεν ξεκινά από την αρχή/);
});

test('paged Worker: near the cap (90%) is said before it cuts', () => {
  const cut = ctx._plvCut({ records: rows(9000), truncated: false, cap: 9990 });
  assert.strictEqual(cut.cut, false);
  assert.match(ctx._plvCutNote(cut, false), /κοντά στο όριο των 9990/);
  assert.strictEqual(ctx._plvCut({ records: rows(8990), truncated: false, cap: 9990 }), null);
});

test('old Worker (no «truncated»): 300 rows read as cut, fewer not', () => {
  assert.strictEqual(ctx._plvCut({ records: rows(300) }).cut, true);
  assert.strictEqual(ctx._plvCut({ records: rows(299) }), null);
  assert.strictEqual(ctx._plvCut({}), null);
});
