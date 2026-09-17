#!/usr/bin/env node
'use strict';
/*
 * DKV Φ1 proof: parse the real ZIP (if present locally — it is gitignored,
 * this is a public repo, see CLAUDE.md "ΚΑΘΕ SESSION" / .gitignore) and
 * reconcile every invoice/statement/reverse-charge document's Σ gross
 * against its E-SUMMARY line (spec §6 gate #1, tolerance 0,01).
 *
 * Usage:
 *   NODE_PATH=/path/to/main-repo/node_modules node tests/dkv/run.js [zip-path | pdf-dir]
 *
 * Exit code 1 if any (non-excluded) document's parsed total differs from
 * its E-SUMMARY total by more than 0,01.
 */

const path = require('path');
const fs = require('fs');
const { extractAny } = require('./extract');
const DkvParser = require('../../core/dkv-parser.js');

// Public repo: the real statement is never committed; default = first *.ZIP under .local/dkv (gitignored).
const DEFAULT_ZIP = (() => { const d = require('path').resolve(__dirname, '..', '..', '.local', 'dkv'); try { const f = require('fs').readdirSync(d).find(n => /\.zip$/i.test(n)); return f ? require('path').join(d, f) : null; } catch (e) { return null; } })();
const PLATES_PATH = path.join(__dirname, '../../.local/dkv/plates.json');

// Documents whose real-world layout is known (spec §1) not to fit the
// standard column parser — reported separately, never silently skipped.
const KNOWN_UNPARSED_DOC_RE = [];

function loadPlates() {
  try {
    const raw = fs.readFileSync(PLATES_PATH, 'utf8');
    return new Set(JSON.parse(raw));
  } catch (e) {
    return null; // no local plate list — skip that check (task instructions)
  }
}

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

async function main() {
  const zipPath = process.argv[2] || DEFAULT_ZIP;
  if (!zipPath || !fs.existsSync(zipPath)) {
    console.log(`No local DKV ZIP at ${zipPath} — skipping real-data run (expected on CI / public clones; the file is gitignored, see .local/ in .gitignore).`);
    process.exit(0);
  }

  const files = await extractAny(zipPath);
  const result = DkvParser.parseDkv(files);

  const summaryByDocNo = new Map();
  if (result.summary) {
    for (const d of result.summary.docs) summaryByDocNo.set(d.doc_no, d);
  }

  // Group parsed lines by doc_no for the per-document report.
  const linesByDocNo = new Map();
  for (const ln of result.lines) {
    if (!linesByDocNo.has(ln.doc_no)) linesByDocNo.set(ln.doc_no, []);
    linesByDocNo.get(ln.doc_no).push(ln);
  }

  const reconcilable = result.docs.filter((d) => ['invoice', 'statement', 'reverse_charge'].includes(d.doc_type));
  console.log(`Parser ${DkvParser.VERSION} · ${path.basename(zipPath)} · ${files.length} PDF(s)`);

  console.log('=== DKV Φ1 — per-document reconciliation ===');
  console.log('doc_no | type | country | vehicles | lines | parsed_gross | summary_total | status');

  let anyDiff = false;
  const knownUnparsed = [];
  const rows = [];

  for (const d of reconcilable) {
    const docLines = linesByDocNo.get(d.doc_no) || [];
    const vehicles = new Set(docLines.map((l) => l.plate).filter(Boolean));
    const parsedGross = round2(docLines.reduce((sum, l) => sum + (l.gross || 0), 0));
    const summaryRow = summaryByDocNo.get(d.doc_no);
    const summaryTotal = summaryRow ? summaryRow.total_native : null;

    let status;
    if (docLines.length === 0) {
      status = 'UNPARSED';
      knownUnparsed.push(d);
    } else if (summaryTotal === null) {
      status = 'NO-SUMMARY-MATCH';
      anyDiff = true;
    } else if (Math.abs(parsedGross - summaryTotal) <= 0.01) {
      status = 'OK';
    } else {
      status = `DIFF ${fmtMoney(parsedGross - summaryTotal)}`;
      anyDiff = true;
    }

    rows.push({
      doc_no: d.doc_no, type: d.doc_type, country: d.country,
      vehicles: vehicles.size, lines: docLines.length,
      parsedGross, summaryTotal, status, currency: d.currency,
    });
  }

  for (const r of rows) {
    console.log([
      r.doc_no, r.type, r.country || '—', r.vehicles, r.lines,
      `${fmtMoney(r.parsedGross)} ${r.currency || ''}`.trim(),
      r.summaryTotal !== null ? fmtMoney(r.summaryTotal) : '—',
      r.status,
    ].join(' | '));
  }

  // Passages summary.
  console.log('\n=== Passages ===');
  console.log(`Groups (plate × day): ${result.passages.length}`);
  const passagesWithTotals = result.passages.filter((p) => p.gross !== null);
  console.log(`Groups with a computed net/gross (AT-style "» Total" line, or summed entry/exit rows): ${passagesWithTotals.length} / ${result.passages.length}`);

  // Ref join check: does each passages group's ref match the tail of some
  // invoice line's ref? (spec: "Ref. equals the tail of the transaction number")
  let joined = 0;
  for (const p of result.passages) {
    if (!p.ref) continue;
    const hit = result.lines.some((l) => l.ref && l.ref.endsWith(p.ref));
    if (hit) joined++;
  }
  console.log(`Passages groups whose Ref. joins to an invoice line: ${joined} / ${result.passages.filter((p) => p.ref).length}`);

  // Unparsed docs.
  console.log('\n=== Unparsed ===');
  for (const d of knownUnparsed) {
    console.log(`- ${d.name} (${d.doc_type}/${d.country}) — no lines parsed`);
  }
  for (const e of result.errors.unparsed) {
    if (e.reason === 'no-lines-parsed') continue; // already listed above via knownUnparsed
    console.log(`- ${e.doc} (${e.doc_no || '—'}): ${e.reason}${e.line ? ' :: ' + e.line : ''}`);
  }

  // w9 (17/9/2026): the E-SUMMARY footer, the REMOBIS refund statement and
  // the T4E operator statements are gates too (import-rules reconcile meta +
  // parser errors.t4e). A footer figure that is missing fails, never passes.
  console.log('\n=== E-SUMMARY footer / refund / T4E ===');
  const sum = result.summary || {};
  const rowsSum = round2(((sum.docs) || []).reduce((s, d) => s + (d.total_eur || 0), 0));
  const refundDocs = round2(result.refunds.reduce((s, r) => s + (r.total_eur || 0), 0));
  const vatRefund = Math.abs(sum.vat_refund_eur || 0);
  const rowsOk = sum.rows_total_eur != null && Math.abs(rowsSum - sum.rows_total_eur) <= 0.01;
  const refundOk = Math.abs(refundDocs - vatRefund) <= 0.01;
  const payableOk = sum.payable_eur != null && sum.rows_total_eur != null && Math.abs(round2(sum.rows_total_eur - vatRefund) - sum.payable_eur) <= 0.01;
  console.log(`Σ summary rows ${fmtMoney(rowsSum)} vs printed rows total ${fmtMoney(sum.rows_total_eur)} → ${rowsOk ? 'OK' : 'FAIL'}`);
  console.log(`Refund documents (${result.refunds.length}) ${fmtMoney(refundDocs)} vs summary «VAT Refund total» ${fmtMoney(vatRefund)} → ${refundOk ? 'OK' : 'FAIL'}`);
  console.log(`Payable ${fmtMoney(sum.payable_eur)} == rows − refund → ${payableOk ? 'OK' : 'FAIL'}`);
  console.log(`T4E operator statements: ${result.t4e.length} · statement lines with period from T4E: ${result.lines.filter((l) => l.period_source === 't4e').length} · per-vehicle mismatches: ${result.errors.t4e.length}`);
  for (const e of result.errors.t4e) console.log(`- ${e.doc_no} ${e.plate} ${e.ref}: line ${fmtMoney(e.line_gross)} ≠ T4E ${fmtMoney(e.t4e_amount)} ${e.currency || ''}`);
  if (!rowsOk || !refundOk || !payableOk || result.errors.t4e.length) anyDiff = true;

  console.log('\n=== Unknown product codes ===');
  console.log(result.errors.unknownProductCodes.length ? result.errors.unknownProductCodes.join(', ') : '(none)');

  const plates = loadPlates();
  console.log('\n=== Unknown plates ===');
  if (!plates) {
    console.log(`(skipped — no ${path.relative(process.cwd(), PLATES_PATH)})`);
  } else {
    const seen = new Set(result.lines.map((l) => l.plate).filter(Boolean));
    for (const p of result.passages) if (p.plate) seen.add(p.plate);
    const unknown = [...seen].filter((p) => !plates.has(p));
    console.log(unknown.length ? unknown.join(', ') : '(none)');
  }

  console.log('\n=== Totals ===');
  console.log(`Documents: ${result.docs.length} | reconcilable (invoice/statement/reverse_charge): ${reconcilable.length}`);
  console.log(`Parsed lines: ${result.lines.length} | passages groups: ${result.passages.length}`);
  console.log(`OK: ${rows.filter((r) => r.status === 'OK').length} | DIFF: ${rows.filter((r) => r.status.startsWith('DIFF')).length} | UNPARSED: ${knownUnparsed.length} | NO-SUMMARY-MATCH: ${rows.filter((r) => r.status === 'NO-SUMMARY-MATCH').length}`);

  // Fuel lines carry liters + unit price? (spec iteration criterion)
  const LITER_UNITS = new Set(['LTR', 'л.']); // 'л.' = BG Cyrillic "liters"
  const fuelLines = result.lines.filter((l) => l.category === 'fuel');
  const fuelOk = fuelLines.filter((l) => LITER_UNITS.has(l.unit) && l.quantity && l.unit_price);
  console.log(`Fuel lines with liters+unit price: ${fuelOk.length} / ${fuelLines.length}`);
  const noPlateTolls = result.lines.filter((l) => !l.plate && l.category === 'tolls');
  const noPlateJoinable = noPlateTolls.filter((l) => result.passages.some((g) => (l.ticket_no && g.invoice_ref === l.ticket_no) || g.invoice_no === l.doc_no || g.invoice_ref === l.doc_no));
  console.log(`Toll lines without a vehicle: ${noPlateTolls.length} · with a passages list to split over: ${noPlateJoinable.length}`);
  console.log(`Lines in category 'other': ${result.lines.filter((l) => l.category === 'other').length} (seeded codes: ${[...new Set(result.lines.filter((l) => l.category === 'other').map((l) => l.product_code))].join(', ') || '—'})`);

  process.exitCode = anyDiff ? 1 : 0;
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
