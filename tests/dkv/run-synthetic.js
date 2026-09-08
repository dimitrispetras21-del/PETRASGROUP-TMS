#!/usr/bin/env node
'use strict';
/*
 * DKV Φ1 regression test — runs against fixtures/synthetic-*.txt (fake
 * company "EXAMPLE FRESH S.A.", fake plates XX1234/XX5678, fake amounts).
 * No PDF/pdf.js involved here: these files already contain the LINE TEXT
 * the parser consumes (i.e. what pdfTextItemsToLines would have produced),
 * so this checks the parsing logic itself, independent of pdf.js/pdfjs-dist
 * being installed. The real-ZIP proof (run.js) is what exercises the
 * pdf.js extraction path end to end.
 *
 * No NODE_PATH needed — this file has no pdfjs-dist/jszip dependency.
 * Usage: node tests/dkv/run-synthetic.js
 */

const fs = require('fs');
const path = require('path');
const DkvParser = require('../../core/dkv-parser.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function assertClose(actual, expected, msg) {
  const ok = actual !== null && actual !== undefined && Math.abs(actual - expected) < 0.005;
  assert(ok, `${msg} (expected ~${expected}, got ${actual})`);
}

function loadFixture(name) {
  const p = path.join(__dirname, 'fixtures', name);
  const text = fs.readFileSync(p, 'utf8');
  return text.split('\n').filter((l) => l.length > 0);
}

// ── unit-level assertions ──────────────────────────────────────────

// parseNum
assertClose(DkvParser.parseNum('48,79'), 48.79, 'parseNum 2dp');
assertClose(DkvParser.parseNum('1.234,56'), 1234.56, 'parseNum thousands+2dp');
assertClose(DkvParser.parseNum('149,240'), 149.24, 'parseNum 3dp (liters)');
assertClose(DkvParser.parseNum('1,9790'), 1.979, 'parseNum 4dp (unit price)');
assertClose(DkvParser.parseNum('18.846'), 18846, 'parseNum thousands, no decimals (HUF)');
assertClose(DkvParser.parseNum('-15,04'), -15.04, 'parseNum negative (discount)');
assertEqual(DkvParser.parseNum('n/a'), null, 'parseNum rejects non-numeric');
assertEqual(DkvParser.parseNum(''), null, 'parseNum rejects empty string');

// normalizePlate
assertEqual(DkvParser.normalizePlate('IAB1096'), 'IAB1096', 'normalizePlate passthrough');
assertEqual(DkvParser.normalizePlate('IAZ 8302'), 'IAZ8302', 'normalizePlate strips space');
assertEqual(DkvParser.normalizePlate('ιαβ1096'), 'IAB1096', 'normalizePlate uppercases + maps Greek lookalikes');
assertEqual(DkvParser.normalizePlate(null), null, 'normalizePlate handles null');

// categoryForProduct
assertEqual(DkvParser.categoryForProduct('0009'), 'fuel', 'category 0009 fuel');
assertEqual(DkvParser.categoryForProduct('0016'), 'adblue', 'category 0016 adblue');
assertEqual(DkvParser.categoryForProduct('0902'), 'tolls', 'category 0902 tolls');
assertEqual(DkvParser.categoryForProduct('0063'), 'ferry_train', 'category 0063 ferry_train');
assertEqual(DkvParser.categoryForProduct('0949'), 'dkv', 'category 0949 dkv');
assertEqual(DkvParser.categoryForProduct('ZZZZ'), 'other', 'unknown product code falls to other, not silently guessed');

// detectDocType / detectCountry (filename-driven)
assertEqual(DkvParser.detectDocType('9999999_2026-09-30_EX_E-INVOICE_99-999999999-001.pdf', []), 'invoice', 'detectDocType invoice');
assertEqual(DkvParser.detectDocType('9999999_2026-09-30_EX_E-STATEMENT OF ACCOUNT_99-999999999-001.pdf', []), 'statement', 'detectDocType statement');
assertEqual(DkvParser.detectDocType('9999999_2026-09-30_EX_E-List of passages_99-999999999-001.pdf', []), 'passages', 'detectDocType passages');
assertEqual(DkvParser.detectDocType('9999999_2026-09-30_EX_Reverse Charge_99-999999999-001.pdf', []), 'reverse_charge', 'detectDocType reverse_charge');
assertEqual(DkvParser.detectDocType('9999999_2026-09-30_E-SUMMARY_99-999999999-000.pdf', []), 'summary', 'detectDocType summary');
assertEqual(DkvParser.detectDocType('9999999_2026-09-30_CZ_E-T4E2026-CZE-0000000000_EN_99-999999999-005.pdf', []), 't4e', 'detectDocType t4e');
assertEqual(DkvParser.detectCountry('9999999_2026-09-30_EX_E-INVOICE_99-999999999-001.pdf'), 'EX', 'detectCountry from filename');
assertEqual(DkvParser.detectCountry('9999999_2026-09-30_E-SUMMARY_99-999999999-000.pdf'), null, 'detectCountry null for E-SUMMARY');

// detectCurrency (locale label variants)
assertEqual(DkvParser.detectCurrency(['Währung: EUR']), 'EUR', 'detectCurrency German label');
assertEqual(DkvParser.detectCurrency(['Waluta: PLN']), 'PLN', 'detectCurrency Polish label');
assertEqual(DkvParser.detectCurrency(['Pénznem: HUF']), 'HUF', 'detectCurrency Hungarian label');
assertEqual(DkvParser.detectCurrency(['no currency label here']), 'EUR', 'detectCurrency defaults to EUR');

// halfMonthBounds
assertEqual(JSON.stringify(DkvParser.halfMonthBounds('05.09.2026')), JSON.stringify({ from: '2026-09-01', to: '2026-09-15' }), 'halfMonthBounds first half');
assertEqual(JSON.stringify(DkvParser.halfMonthBounds('16.09.2026')), JSON.stringify({ from: '2026-09-01', to: '2026-09-15' }), 'halfMonthBounds: billing day 16 closes the FIRST half');
assertEqual(JSON.stringify(DkvParser.halfMonthBounds('30.09.2026')), JSON.stringify({ from: '2026-09-16', to: '2026-09-30' }), 'halfMonthBounds second half (30-day month)');
assertEqual(JSON.stringify(DkvParser.halfMonthBounds('01.10.2026')), JSON.stringify({ from: '2026-09-16', to: '2026-09-30' }), 'halfMonthBounds: billing day 1 closes the previous month second half');
assertEqual(JSON.stringify(DkvParser.halfMonthBounds('28.02.2026')), JSON.stringify({ from: '2026-02-16', to: '2026-02-28' }), 'halfMonthBounds Feb (non-leap)');

// toIsoDate
assertEqual(DkvParser.toIsoDate('17.08.2026'), '2026-08-17', 'toIsoDate');

// ── full parseDkv over the synthetic fixtures ──────────────────────

const files = [
  { name: '9999999_2026-09-30_EX_E-INVOICE_99-000000001-999.pdf', lines: loadFixture('synthetic-invoice.txt') },
  { name: '9999999_2026-09-30_EX_E-List of passages_99-999999999-001.pdf', lines: loadFixture('synthetic-passages.txt') },
  { name: '9999999_2026-09-30_E-SUMMARY_99-000000001-000.pdf', lines: loadFixture('synthetic-summary.txt') },
];

const result = DkvParser.parseDkv(files);

assertEqual(result.docs.length, 3, 'parseDkv sees all 3 fixture docs');
assertEqual(result.lines.length, 4, 'parseDkv extracts 4 transaction lines from the invoice');
assertEqual(result.passages.length, 1, 'parseDkv extracts 1 passages group');
assert(!!result.summary, 'parseDkv parses the E-SUMMARY doc');
assertEqual(result.summary.docs.length, 1, 'E-SUMMARY has 1 document row');

const invLines = result.lines;
const feeLine = invLines.find((l) => l.product_code === '0949');
const tollLine = invLines.find((l) => l.product_code === '0902');
const fuelLine = invLines.find((l) => l.product_code === '0009');
const unknownLine = invLines.find((l) => l.product_code === 'ZZZZ');

assert(!!feeLine, 'found the general (no-vehicle) fee line');
assertEqual(feeLine.plate, null, 'general fee line has no vehicle');
assertEqual(feeLine.category, 'dkv', 'fee line category');
assertClose(feeLine.net, 5.00, 'fee line net');
assertClose(feeLine.vat, 1.00, 'fee line vat');
assertClose(feeLine.gross, 6.00, 'fee line gross');

assert(!!tollLine, 'found the toll line');
assertEqual(tollLine.plate, 'XX1234', 'toll line plate normalized');
assertEqual(tollLine.category, 'tolls', 'toll line category');
assertEqual(tollLine.service_date, '2026-09-01', 'toll line service_date');
assertClose(tollLine.net, 10.00, 'toll line net');
assertClose(tollLine.vat, 2.00, 'toll line vat');
assertClose(tollLine.gross, 12.00, 'toll line gross');
assertEqual(tollLine.ref, '10000000000000000001', 'toll line ref (long transaction number)');

assert(!!fuelLine, 'found the fuel line');
assertEqual(fuelLine.plate, 'XX5678', 'fuel line plate normalized');
assertEqual(fuelLine.category, 'fuel', 'fuel line category');
assertEqual(fuelLine.unit, 'LTR', 'fuel line unit');
assertClose(fuelLine.quantity, 100.0, 'fuel line quantity (liters)');
assertClose(fuelLine.unit_price, 1.5, 'fuel line unit price');
assertClose(fuelLine.gross, 150.0, 'fuel line gross');
assertEqual(fuelLine.time, '03:15', 'fuel line time captured');

assert(!!unknownLine, 'found the unknown-product-code line');
assertEqual(unknownLine.category, 'other', 'unknown product falls to other category');
assertClose(unknownLine.gross, 5.0, 'unknown-product line gross (single trailing amount)');
assert(result.errors.unknownProductCodes.includes('ZZZZ'), 'unknown product code ZZZZ is flagged, not silently absorbed');

// Reconciliation: Σ gross across the 4 lines must equal the E-SUMMARY total.
const sumGross = Math.round(invLines.reduce((s, l) => s + l.gross, 0) * 100) / 100;
const summaryTotal = result.summary.docs[0].total_native;
assertEqual(result.summary.docs[0].doc_no, '99/000000001/999', 'E-SUMMARY doc_no matches the invoice number (not the DKV ticket number)');
assertClose(sumGross, summaryTotal, 'Σ gross reconciles with E-SUMMARY total within 0,01 (spec §6 gate #1)');
assertClose(sumGross, 173.0, 'Σ gross is exactly the expected 173,00');

// Passages: ref join to the toll line, and per-day totals from the "» Total" line.
const passageGroup = result.passages[0];
assertEqual(passageGroup.plate, 'XX1234', 'passages group plate normalized');
assertEqual(passageGroup.service_date, '2026-09-01', 'passages group service_date from Datum:');
assertEqual(passageGroup.passages.length, 2, 'passages group has 2 detail rows');
assertClose(passageGroup.net, 16.0, 'passages group net from » Total line');
assertClose(passageGroup.vat, 3.2, 'passages group vat from » Total line');
assertClose(passageGroup.gross, 19.2, 'passages group gross from » Total line');
assert(tollLine.ref.endsWith(passageGroup.ref), 'passages Ref. is a suffix of the invoice transaction number (spec §1 join rule)');

// ── Entry/exit-style passages (the BG/CZ/DE/HR/HU/PL/SI/SK layout) ────
// The PAN header carries no Ref./Datum and is followed by a tail such as
// «Emission class …» (CZ/PL/SI/SK) or «CO2 class …» (DE). Regression for
// 8/9/2026: the plate capture ran to end-of-line, so those plates came out
// 17–38 chars long and no passages group ever matched a statement line.
const eeResult = DkvParser.parseDkv([
  { name: '9999999_2026-09-30_EX_E-List of passages_99-999999999-002.pdf', lines: loadFixture('synthetic-passages-entryexit.txt') },
]);
assertEqual(eeResult.passages.length, 3, 'entry/exit passages: 3 (plate × day) groups');
const eeDay1 = eeResult.passages.find((g) => g.service_date === '2026-09-01');
const eeDay2 = eeResult.passages.find((g) => g.service_date === '2026-09-02');
const eeDay3 = eeResult.passages.find((g) => g.service_date === '2026-09-03');
assert(!!eeDay1 && !!eeDay2 && !!eeDay3, 'entry/exit passages: one group per entry date');
if (eeDay1 && eeDay2 && eeDay3) {
  assertEqual(eeDay1.plate, 'XX5678', 'entry/exit plate stops before the «Emission class …» tail');
  assertEqual(eeDay2.plate, 'XX5678', 'entry/exit plate: second day of the same PAN header');
  assertEqual(eeDay3.plate, 'XX9012', 'entry/exit plate with inner space stops before the «CO2 class …» tail');
  assertEqual(eeDay1.passages.length, 2, 'entry/exit day 1 has 2 rows');
  assertClose(eeDay1.net, 8.0, 'entry/exit day 1 net = Σ row nets');
  assertClose(eeDay2.net, 4.0, 'entry/exit day 2 net');
  assertClose(eeDay3.net, 7.0, 'entry/exit day 3 net = last numeric token of the row');
  assertEqual(eeDay1.ref, null, 'entry/exit groups carry no ref');
  assertEqual(eeDay1.currency, 'EUR', 'entry/exit groups default to EUR');
}

// ── report ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
