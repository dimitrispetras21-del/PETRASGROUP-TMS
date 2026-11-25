// The «Save as PDF» file name (document.title) = «<carrier> - <Reference>» (owner 25/11): one rule,
// window.pdfFileTitle (core/share-helpers.js), used by print.html (international sheets) and
// modules/wn5_sheet.js (the national driver sheet). The real files run in a vm.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function shared() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('core/share-helpers.js'), ctx, { filename: 'core/share-helpers.js' });
  return ctx.window.pdfFileTitle;
}

function printFns() {
  const html = read('print.html');
  const m = html.match(/function pdfCarrierOf\(f,isPartner\)\{[\s\S]*?\n\}/);
  assert.ok(m, 'pdfCarrierOf found in print.html');
  assert.ok(!/function pdfFileTitle/.test(html), 'print.html keeps no copy of the shared rule');
  const ctx = {
    allPartners: [{ id: 'recP1', fields: { 'Company Name': 'Trans Hellas' } }],
    allDrivers: [{ id: 'recD1', fields: { 'Full Name': 'Papadopoulos Giorgos' } }],
    allTrucks: [{ id: 'recT1', fields: { 'License Plate': 'KZT1234' } }],
  };
  vm.runInNewContext(m[0] + '\nthis.pdfCarrierOf=pdfCarrierOf;', ctx);
  return ctx;
}

test('print.html carrier: the partner company; the own fleet = driver and truck plate', () => {
  const P = printFns();
  assert.strictEqual(P.pdfCarrierOf({ Partner: ['recP1'] }, true), 'Trans Hellas');
  assert.strictEqual(P.pdfCarrierOf({ Driver: ['recD1'], Truck: ['recT1'] }, false), 'Papadopoulos Giorgos KZT1234');
  assert.strictEqual(P.pdfCarrierOf({ Truck: ['recT1'] }, false), 'KZT1234');
  assert.strictEqual(P.pdfCarrierOf({ Driver: ['recD1'] }, false), 'Papadopoulos Giorgos');
  assert.strictEqual(P.pdfCarrierOf({}, false), '');
  assert.strictEqual(P.pdfCarrierOf({ Partner: ['recMissing'] }, true), '');
});

test('pdfFileTitle: carrier - reference, illegal file-name characters removed', () => {
  const T = shared();
  assert.strictEqual(T('Trans Hellas', ['4500123'], 'x'), 'Trans Hellas - 4500123');
  assert.strictEqual(T('A/B: "Co"', ['PO*12?<3>|x\\y'], 'x'), 'A B Co - PO 12 3 x y');
});

test('pdfFileTitle: never blank — fallbacks for a missing carrier or reference', () => {
  const T = shared();
  assert.strictEqual(T('', ['4500123'], 'Εντολή Οδηγού'), 'Εντολή Οδηγού - 4500123');
  assert.strictEqual(T('', [], ''), 'Petras Group');
  assert.strictEqual(T('Trans Hellas', [], 'x'), 'Trans Hellas');
  assert.strictEqual(T('Trans Hellas', ['', null], 'x'), 'Trans Hellas');
  assert.strictEqual(T('Trans Hellas', ['REF.'], 'x'), 'Trans Hellas - REF');
});

test('pdfFileTitle: a group lists unique references, at most three then +N', () => {
  const T = shared();
  assert.strictEqual(T('X', ['A', 'B', 'A'], 'x'), 'X - A, B');
  assert.strictEqual(T('X', ['A', 'B', 'C', 'D', 'E'], 'x'), 'X - A, B, C +2');
});

function wn5(withShared) {
  const win = {};
  const ctx = { window: win, console };
  if (withShared) ctx.pdfFileTitle = shared();
  vm.createContext(ctx);
  vm.runInContext(read('modules/wn5_sheet.js'), ctx, { filename: 'modules/wn5_sheet.js' });
  return win.WN5Sheet;
}

test('national driver sheet: driver + truck, or partner, then the stops\' references', () => {
  const S = wn5(true);
  const own = [{ t: 'head', partner: null, driver: 'Papadopoulos Giorgos', truck: 'KZT1234' },
    { t: 'side' }, { t: 'stop', refs: 'PO-1 · PO-2' }, { t: 'stop', hub: true, refs: 'PO-2' }, { t: 'stop', refs: '—' }, { t: 'check' }];
  assert.strictEqual(S.fileTitle(own, { week: 'W48' }, 'old'), 'Papadopoulos Giorgos KZT1234 - PO-1, PO-2');
  const partner = [{ t: 'head', partner: 'Trans Hellas', driver: null, truck: null }, { t: 'stop', refs: '4500123' }];
  assert.strictEqual(S.fileTitle(partner, { week: 'W48' }, 'old'), 'Trans Hellas - 4500123');
  // no reference on any stop: the week names the sheet; no carrier known: the kind of sheet
  const bare = [{ t: 'head', partner: null, driver: '—', truck: '—' }, { t: 'stop', refs: '—' }];
  assert.strictEqual(S.fileTitle(bare, { week: 'W48' }, 'old'), 'Φύλλο οδηγού - W48');
});

test('national driver sheet: without share-helpers the old title stays (the print never breaks)', () => {
  const S = wn5(false);
  assert.strictEqual(S.fileTitle([{ t: 'head', driver: 'X' }], { week: 'W48' }, 'Φύλλο οδηγού · RT-1'), 'Φύλλο οδηγού · RT-1');
});
