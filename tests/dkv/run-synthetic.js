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

// ── w9 (17/9/2026): the second DKV entity (BG) — shapes the GR ZIP never had ──
// Every fixture here is fake (EXAMPLE FRESH OOD, XX plates, invented amounts
// that only have to be internally consistent). See docs/data-audit/2026-09/
// 2026-09-17-w9-dkv-import.md for the real-ZIP measurements behind each rule.

// (1) E-SUMMARY with a third «VAT refund in payment currency» column.
// Regression: the BG entity's summary parsed 0/19 rows → gate failed on every
// document → draft never committable (ct_cost_docs id 2, 0 lines).
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_E-SUMMARY_99-000000002-000.pdf', lines: loadFixture('synthetic-summary-refund.txt') },
  ]);
  assert(!!r.summary, 'summary(refund): E-SUMMARY parsed');
  assertEqual(r.summary.docs.length, 5, 'summary(refund): 5 document rows with the 3-column layout');
  const ro = r.summary.docs.find((d) => d.doc_no === '99/000000002/014');
  assert(!!ro, 'summary(refund): foreign-currency row found');
  if (ro) {
    assertEqual(ro.currency, 'XXX', 'summary(refund): row currency');
    assertClose(ro.total_native, 6550.60, 'summary(refund): total in service-country currency');
    assertClose(ro.total_eur, 1277.85, 'summary(refund): total in payment currency (EUR)');
    assertClose(ro.vat_refund_eur, 1395.21, 'summary(refund): VAT refund column captured');
  }
  const rc = r.summary.docs.find((d) => d.doc_no === '99/000000002/901');
  assert(!!rc && rc.vat_refund_eur === 0, 'summary(refund): 0,00 refund column parses as 0');
  assertClose(r.summary.rows_total_eur, 2598.19, 'summary(refund): «»» rows total captured (no EUR suffix on this layout)');
  assertClose(r.summary.vat_refund_eur, -1395.21, 'summary(refund): «VAT Refund total» captured (negative)');
  assertClose(r.summary.payable_eur, 1202.98, 'summary(refund): «» Total» payable captured');
  // The 2-column layout (GR entity) must still parse and carry no refund.
  const r2 = DkvParser.parseDkv([
    { name: '9999999_2026-09-30_E-SUMMARY_99-000000001-000.pdf', lines: loadFixture('synthetic-summary.txt') },
  ]);
  assertEqual(r2.summary.docs.length, 1, 'summary(2 columns): still 1 row');
  assertEqual(r2.summary.docs[0].vat_refund_eur, null, 'summary(2 columns): vat_refund_eur null when the column is absent');
  assertClose(r2.summary.rows_total_eur, 173.0, 'summary(2 columns): rows total with EUR suffix');
  assertEqual(r2.summary.vat_refund_eur, 0, 'summary(2 columns): no refund line → 0');
  assertClose(r2.summary.payable_eur, 173.0, 'summary(2 columns): payable = rows total');
}

// (2) Reverse charge ⇒ vat = 0, net = gross. The RC column set is «Base net ·
// Discount net · Service fee net · Total net» — there is no VAT column at all,
// and the old net+vat≈gross heuristic read a discount (−15,04) or a service
// fee (8,83) as VAT (production doc 1: Analytics line net 19,95 / vat −15,04).
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_EX_Reverse Charge_99-000000002-003.pdf', lines: loadFixture('synthetic-reverse-charge.txt') },
  ]);
  assertEqual(r.lines.length, 4, 'reverse charge: 4 lines');
  const analytics = r.lines.find((l) => l.product_code === '01AP');
  const kombi = r.lines.find((l) => l.product_code === '0605');
  const box = r.lines.find((l) => l.product_code === '0920');
  assert(!!analytics && !!kombi && !!box, 'reverse charge: the discount, service-fee and plain lines all found');
  if (analytics) {
    assertClose(analytics.gross, 4.91, 'reverse charge: discount line gross = Total net (4,91)');
    assertClose(analytics.net, 4.91, 'reverse charge: discount line net = gross (no VAT column)');
    assertEqual(analytics.vat, 0, 'reverse charge: discount line vat = 0 (−15,04 is a discount, not VAT)');
    assertEqual(analytics.plate, null, 'reverse charge: customer-related line has no vehicle');
  }
  if (kombi) {
    assertClose(kombi.gross, 376.83, 'reverse charge: service-fee line gross = Total net (368,00 + fee 8,83)');
    assertClose(kombi.net, 376.83, 'reverse charge: service-fee line net = gross');
    assertEqual(kombi.vat, 0, 'reverse charge: 8,83 is a service fee, not VAT');
    assertEqual(kombi.category, 'ferry_train', 'reverse charge: 0605 Kombiverkehr (rail) → ferry_train');
    assertEqual(kombi.plate, 'XX1234', 'reverse charge: vehicle line keeps its plate');
  }
  if (box) { assertClose(box.net, 44.0, 'reverse charge: plain line net'); assertEqual(box.vat, 0, 'reverse charge: plain line vat 0'); }
  const sum = Math.round(r.lines.reduce((s, l) => s + l.gross, 0) * 100) / 100;
  assertClose(sum, 434.74, 'reverse charge: Σ gross == document total (gate #1 still holds)');
  assertEqual(r.errors.unknownProductCodes.length, 0, 'reverse charge: 0605 is seeded, not «unknown»');
}

// (3) REMOBIS refund-service fee (BG entity RC «…-901»): no date-first line at
// all — «Y <year> <claim> <country> Refund <cur> <amount> * <fee> <fee> <fee>».
// Was: 0 lines, «no-lines-parsed». Now: one general DKV fee line.
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_EX_Reverse Charge_99-000000002-901.pdf', lines: loadFixture('synthetic-remobis-fee.txt') },
  ]);
  assertEqual(r.lines.length, 1, 'remobis fee: exactly one line');
  assertEqual(r.errors.unparsed.length, 0, 'remobis fee: nothing left unparsed');
  const f = r.lines[0];
  assertEqual(f.category, 'dkv', 'remobis fee: category dkv (general fee, never a trip cost)');
  assertEqual(f.plate, null, 'remobis fee: no vehicle');
  assertClose(f.gross, 125.0, 'remobis fee: gross = payment amount (last number)');
  assertClose(f.net, 125.0, 'remobis fee: net = gross (reverse charge)');
  assertEqual(f.vat, 0, 'remobis fee: vat 0');
  assertEqual(f.service_date, '2026-09-30', 'remobis fee: service_date = invoice date (the doc has no line date)');
  assertEqual(f.ref, '0000000001', 'remobis fee: ref = claim number');
  assertEqual(f.doc_no, '99/000000002/901', 'remobis fee: doc_no from Invoice number');
  assertEqual(f.product_code, 'REMOBIS', 'remobis fee: synthetic product code (DKV prints none on this doc)');
}

// (4) REMOBIS VAT-refund statement («E-STATEMENT OF ACCOUNT …-900»): a credit,
// NOT a cost line (owner 17/9: separate amount on the document, «γενικά»).
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_E-STATEMENT OF ACCOUNT_99-000000002-900.pdf', lines: loadFixture('synthetic-refund-statement.txt') },
  ]);
  assertEqual(r.docs[0].doc_type, 'refund', 'refund statement: doc_type refund (not statement)');
  assertEqual(r.lines.length, 0, 'refund statement: generates no cost lines');
  assertEqual(r.errors.unparsed.length, 0, 'refund statement: not flagged as unparsed');
  assertEqual(r.refunds.length, 1, 'refund statement: one refund document');
  const rf = r.refunds[0];
  assertEqual(rf.doc_no, '99/000000002/900', 'refund statement: doc_no');
  assertClose(rf.total_eur, 1395.21, 'refund statement: total EUR from «» Total»');
  assertEqual(rf.claims.length, 1, 'refund statement: one claim row');
  assertEqual(rf.claims[0].country, 'Other Country', 'refund statement: claim country');
  assertEqual(rf.claims[0].currency, 'XXX', 'refund statement: claim currency');
  assertClose(rf.claims[0].amount_native, 7525.31, 'refund statement: claim native amount');
  assertClose(rf.claims[0].amount_eur, 1395.21, 'refund statement: claim EUR amount');
}

// (5) Italian invoice: unit «PZ», code 0914 (Pedaggio) — was 2 lines rejected
// as «unrecognized-transaction-line» and the doc UNPARSED.
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_IT_E-INVOICE_99-000000002-012.pdf', lines: loadFixture('synthetic-invoice-it.txt') },
  ]);
  assertEqual(r.lines.length, 2, 'IT invoice: both PZ lines parse');
  assertEqual(r.errors.unparsed.length, 0, 'IT invoice: nothing unparsed');
  const toll = r.lines.find((l) => l.product_code === '0914');
  assert(!!toll, 'IT invoice: Pedaggio line found');
  if (toll) {
    assertEqual(toll.category, 'tolls', 'IT invoice: 0914 → tolls');
    assertClose(toll.net, 476.20, 'IT invoice: net');
    assertClose(toll.vat, 104.76, 'IT invoice: vat');
    assertClose(toll.gross, 580.96, 'IT invoice: gross');
    assertClose(toll.base_gross, 544.50, 'IT invoice: base gross (Price/Unit gross × qty) kept for the passages join');
    assertEqual(toll.ticket_no, '99/000000002/012', 'IT invoice: DKV ticket number kept on the line');
  }
  assertEqual(r.docs[0].ticket_no, '99/000000002/012', 'IT invoice: DKV ticket number on the doc entry');
}

// (6) Italian passages layout: «PAN …, Targa N. <plate>, ID OBU …», rows with
// seconds and a transaction number, «DIREZIONE» rows with exit date only.
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_IT_E-List of passages_99-000000002-012.pdf', lines: loadFixture('synthetic-passages-it.txt') },
  ]);
  assertEqual(r.passages.length, 4, 'IT passages: 4 (plate × day) groups');
  const d18a = r.passages.find((g) => g.plate === 'XX1234' && g.service_date === '2026-09-18');
  const d19 = r.passages.find((g) => g.plate === 'XX1234' && g.service_date === '2026-09-19');
  const d27 = r.passages.find((g) => g.plate === 'XX1234' && g.service_date === '2026-09-27');
  const d18b = r.passages.find((g) => g.plate === 'XX5678' && g.service_date === '2026-09-18');
  assert(!!d18a && !!d19 && !!d27 && !!d18b, 'IT passages: groups keyed by plate + entry date (exit date for DIREZIONE rows)');
  if (d19) {
    assertEqual(d19.passages.length, 3, 'IT passages: 19/09 has the full row + 2 DIREZIONE rows');
    assertClose(d19.gross, 46.80, 'IT passages: day gross = Σ «Imp. lordo»');
  }
  if (d18b) assertEqual(d18b.plate, 'XX5678', 'IT passages: «Targa N. XX 5678» inner space normalized');
  const total = Math.round(r.passages.reduce((s, g) => s + g.gross, 0) * 100) / 100;
  assertClose(total, 544.50, 'IT passages: Σ groups == RIEPILOGO total');
  assertEqual(r.passages[0].invoice_ref, '99/000000002/012', 'IT passages: «Reference to the invoice» (DKV ticket) on every group');
  assertEqual(r.passages[0].invoice_no, '99/000000012/991', 'IT passages: «Riferimento alla fattura / …» invoice number on every group');
  assertEqual(r.passages[0].passages[0].ref, '400000001', 'IT passages: per-row transaction number kept');
}

// (7) Croatian passages: «Card N. <card>» header, no plate — the plate comes
// from the card→plate map built from every VEHICLE header in the same ZIP.
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_HR_E-INVOICE_99-000000002-009.pdf', lines: loadFixture('synthetic-invoice-card.txt') },
    { name: '9999998_2026-09-30_HR_E-List of passages_99-000000002-009.pdf', lines: loadFixture('synthetic-passages-card.txt') },
    { name: '9999999_2026-09-30_EX_E-INVOICE_99-000000001-999.pdf', lines: loadFixture('synthetic-invoice.txt') },
  ]);
  assertEqual(r.passages.length, 1, 'HR passages: one group');
  const g = r.passages[0];
  assertEqual(g.plate, 'XX1234', 'HR passages: plate resolved through card 00000000.0000000001 seen on another invoice');
  assertEqual(g.card_no, '00000000.0000000001', 'HR passages: card number kept');
  assertEqual(g.service_date, '2026-09-26', 'HR passages: 2-digit year «26.09.26» → 2026-09-26');
  assertClose(g.gross, 30.10, 'HR passages: gross');
  assertClose(g.net, 24.08, 'HR passages: net');
  assertEqual(g.invoice_ref, '99/000000002/009', 'HR passages: reference to the invoice');
  const hrLine = r.lines.find((l) => l.doc_no === '99/000000002/009');
  assert(!!hrLine && hrLine.plate === null, 'HR invoice: the toll line itself has no vehicle (joined later via passages)');
  if (hrLine) assertClose(hrLine.base_gross, 30.10, 'HR invoice: base gross == passages gross (the join amount)');
}

// (8) Toll4Europe operator statement (T4E): the authoritative half-month period
// and the per-vehicle amounts — a second gate for statement lines.
{
  const r = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_EX_E-STATEMENT OF ACCOUNT_99-000000002-004.pdf', lines: loadFixture('synthetic-statement.txt') },
    { name: '9999998_2026-09-30_EX_E-T4E2026-EXA-0000000001_EN_99-000000002-004.pdf', lines: loadFixture('synthetic-t4e.txt') },
  ]);
  assertEqual(r.t4e.length, 1, 'T4E: one operator statement parsed');
  const t = r.t4e[0];
  assertEqual(t.ref, '2026-EXA-0000000001', 'T4E: toll statement reference');
  assertEqual(t.period_from, '2026-09-01', 'T4E: billing period from');
  assertEqual(t.period_to, '2026-09-15', 'T4E: billing period to');
  assertEqual(t.vehicles.length, 2, 'T4E: two vehicle rows');
  assertEqual(t.vehicles[0].plate, 'XX1234', 'T4E: vehicle plate');
  assertClose(t.vehicles[0].amount, 115.63, 'T4E: vehicle amount');
  assertClose(t.total, 368.93, 'T4E: total amount');
  assertEqual(r.lines.length, 2, 'T4E: statement lines parsed');
  const l1 = r.lines.find((l) => l.plate === 'XX1234');
  assertEqual(l1.period_ref, '2026-EXA-0000000001', 'statement line: toll statement reference kept as period_ref');
  // Line dated 17.09 → the date rule alone would say 16–30/09; the T4E says 01–15.
  assertEqual(l1.period_from, '2026-09-01', 'statement line: period_from taken from the T4E billing period, not guessed from the date');
  assertEqual(l1.period_to, '2026-09-15', 'statement line: period_to from T4E');
  assertEqual(l1.period_source, 't4e', 'statement line: period_source = t4e');
  assertEqual(r.errors.t4e.length, 0, 'T4E gate: both vehicle amounts match their statement line');
  // Mismatch is reported, never rounded away (αρχή 1).
  const bad = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_EX_E-STATEMENT OF ACCOUNT_99-000000002-004.pdf', lines: loadFixture('synthetic-statement.txt').map((x) => x.replace('115,63 115,63 115,63', '115,63 115,63 115,64')) },
    { name: '9999998_2026-09-30_EX_E-T4E2026-EXA-0000000001_EN_99-000000002-004.pdf', lines: loadFixture('synthetic-t4e.txt') },
  ]);
  assertEqual(bad.errors.t4e.length, 1, 'T4E gate: a 0,01 difference between statement line and operator amount is reported');
  if (bad.errors.t4e.length) assertEqual(bad.errors.t4e[0].plate, 'XX1234', 'T4E gate: the report names the vehicle');
  // No T4E in the ZIP → the date rule still applies (GR entity behaviour unchanged).
  const noT4e = DkvParser.parseDkv([
    { name: '9999998_2026-09-30_EX_E-STATEMENT OF ACCOUNT_99-000000002-004.pdf', lines: loadFixture('synthetic-statement.txt') },
  ]);
  assertEqual(noT4e.lines[0].period_from, '2026-09-16', 'statement line without T4E: half-month from the billing date (17.09 → 16–30)');
  assertEqual(noT4e.lines[0].period_source, 'date', 'statement line without T4E: period_source = date');
}

// (9) Seed map additions (0 «unknown» codes on the BG ZIP).
assertEqual(DkvParser.categoryForProduct('0914'), 'tolls', 'category 0914 Pedaggio (IT) → tolls');
assertEqual(DkvParser.categoryForProduct('0605'), 'ferry_train', 'category 0605 Kombiverkehr → ferry_train');
assertEqual(DkvParser.categoryForProduct('0096'), 'other', 'category 0096 lubricants → other (owner 17/9: «ας πάνε Λοιπά»)');
assertEqual(DkvParser.categoryForProduct('0088'), 'other', 'category 0088 parking (HU) → other (owner 17/9)');
assert(!!DkvParser.PRODUCT_CATEGORY['0096'] && !!DkvParser.PRODUCT_CATEGORY['0088'], 'seed map: lubricants/parking are seeded, so they are never flagged «unknown»');
assertEqual(DkvParser.toIsoDate('26.09.26'), '2026-09-26', 'toIsoDate: 2-digit year (HR passages)');
assertEqual(DkvParser.VERSION, '1.2.0', 'parser VERSION bumped for the w9 rule changes');

// Foreign currency: vat_eur is the remainder gross_eur − net_eur, so net_eur +
// vat_eur == gross_eur EXACTLY on every line (accountant critic 17/9: two
// independent roundings drifted 0,01 — net 111,10 / vat 221,90 / gross 333,00
// with a printed 99,91 EUR gave 33,33 + 66,57 = 99,90).
{
  const fx = DkvParser.parseTransactionLine('05.09.2026 EXAMPLE STATION 1000001 Toll X 0902 ST 1 333,00 111,10 221,90 333,00 99,91', { docType: 'invoice', country: 'XX', currency: 'CZK', vehicle: null, ticketNo: null });
  assert(!!fx, 'foreign line parses');
  if (fx) {
    assertClose(fx.gross_eur, 99.91, 'foreign line: gross_eur = printed EUR equivalent');
    assertClose(fx.net_eur, 33.33, 'foreign line: net_eur = net × fx, 2dp');
    assertClose(fx.vat_eur, 66.58, 'foreign line: vat_eur = gross_eur − net_eur (remainder), not round2(vat × fx) = 66,57');
    assertEqual(Math.round((fx.net_eur + fx.vat_eur) * 100), Math.round(fx.gross_eur * 100), 'foreign line: net_eur + vat_eur == gross_eur exactly');
  }
}

// ── report ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
