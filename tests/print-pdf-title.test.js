// print.html: the «Save as PDF» file name (document.title) = «<carrier> - <Reference>» (owner 25/11).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function printFns() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'print.html'), 'utf8');
  const grab = re => { const m = html.match(re); assert.ok(m, 'found in print.html: ' + re); return m[0]; };
  const src = [
    grab(/function pdfCarrierOf\(f,isPartner\)\{[\s\S]*?\n\}/),
    grab(/function pdfFileTitle\(carrier,refs,isPartner\)\{[\s\S]*?\n\}/),
  ].join('\n');
  const ctx = {
    allPartners: [{ id: 'recP1', fields: { 'Company Name': 'Trans Hellas' } }],
    allDrivers: [{ id: 'recD1', fields: { 'Full Name': 'Papadopoulos Giorgos' } }],
    allTrucks: [{ id: 'recT1', fields: { 'License Plate': 'KZT1234' } }],
  };
  vm.runInNewContext(src + '\nthis.pdfCarrierOf=pdfCarrierOf;this.pdfFileTitle=pdfFileTitle;', ctx);
  return ctx;
}

test('carrier: the partner company; the own fleet = driver and truck plate', () => {
  const P = printFns();
  assert.strictEqual(P.pdfCarrierOf({ Partner: ['recP1'] }, true), 'Trans Hellas');
  assert.strictEqual(P.pdfCarrierOf({ Driver: ['recD1'], Truck: ['recT1'] }, false), 'Papadopoulos Giorgos KZT1234');
  assert.strictEqual(P.pdfCarrierOf({ Truck: ['recT1'] }, false), 'KZT1234');
  assert.strictEqual(P.pdfCarrierOf({ Driver: ['recD1'] }, false), 'Papadopoulos Giorgos');
  assert.strictEqual(P.pdfCarrierOf({}, false), '');
  assert.strictEqual(P.pdfCarrierOf({ Partner: ['recMissing'] }, true), '');
});

test('title: carrier - reference, illegal file-name characters removed', () => {
  const P = printFns();
  assert.strictEqual(P.pdfFileTitle('Trans Hellas', ['4500123'], true), 'Trans Hellas - 4500123');
  assert.strictEqual(P.pdfFileTitle('A/B: "Co"', ['PO*12?<3>|x\\y'], true), 'A B Co - PO 12 3 x y');
});

test('title: never blank — fallbacks for a missing carrier or reference', () => {
  const P = printFns();
  assert.strictEqual(P.pdfFileTitle('', ['4500123'], false), 'Εντολή Οδηγού - 4500123');
  assert.strictEqual(P.pdfFileTitle('', ['4500123'], true), 'Partner Assignment Order - 4500123');
  assert.strictEqual(P.pdfFileTitle('Trans Hellas', [], true), 'Trans Hellas');
  assert.strictEqual(P.pdfFileTitle('Trans Hellas', ['', null], true), 'Trans Hellas');
  assert.strictEqual(P.pdfFileTitle('Trans Hellas', ['REF.'], true), 'Trans Hellas - REF');
});

test('title: a group lists unique references, at most three then +N', () => {
  const P = printFns();
  assert.strictEqual(P.pdfFileTitle('X', ['A', 'B', 'A'], true), 'X - A, B');
  assert.strictEqual(P.pdfFileTitle('X', ['A', 'B', 'C', 'D', 'E'], true), 'X - A, B, C +2');
});
