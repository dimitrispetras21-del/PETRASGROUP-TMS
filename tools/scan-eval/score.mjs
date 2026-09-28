#!/usr/bin/env node
// Score a scanner run against the golden set.
//
//   node tools/scan-eval/score.mjs --golden <golden.json> --results <results.json>
//        [--out <report.json>] [--aggregate-only] [--split dev|heldout|all]
//   node tools/scan-eval/score.mjs --golden <golden.json> --oracle
//        (scores the golden set against itself: must be 100%, else the golden set is malformed)
//
// --split (round 4, docs/scan/04 follow-up): golden docs can carry `split:
// 'dev'|'heldout'` (per sender-template — docs/scan/05). Default 'all' scores
// every scored doc; 'dev' or 'heldout' scores only that half. A doc with
// `scored:false` (no saved order to check against — golden-full.json's
// truth_rule_new) is excluded no matter which --split is asked for, so it
// never silently drags down the documents/critical_all_ok denominator.
//
// The per-field error list prints expected/got values, i.e. real client data
// when run on the real golden set. --aggregate-only prints numbers only (safe
// to paste into a report or commit message) — the per-template breakdown in
// that mode prints bare template ids (T01, T02, …) only, never the
// family/sender name in golden.templates. --out must point under .local/.
import fs from 'node:fs';
import { scoreRun, aggregate, goldenToResults, filterGolden, templateBreakdown, CRITICAL } from './lib/score.mjs';

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : null;
}
const flag = name => process.argv.includes('--' + name);

const pct = v => (v == null ? '  n/a' : (100 * v).toFixed(1).padStart(5) + '%');

export function formatReport(agg, scored, { aggregateOnly = false, byTemplate = null } = {}) {
  const lines = [];
  lines.push(`documents: ${agg.documents}   status: ${Object.entries(agg.status).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  lines.push(`all critical fields right: ${agg.critical_all_ok}/${agg.documents} (${pct(agg.critical_all_ok_pct).trim()})` +
    `   excluding contested truth: ${agg.critical_all_ok_uncontested}/${agg.documents}`);
  if (byTemplate && Object.keys(byTemplate).length) {
    lines.push('');
    lines.push('per template (bare id — see README before asking for names):');
    for (const [t, a] of Object.entries(byTemplate)) {
      lines.push(`  ${t.padEnd(14)} documents=${String(a.documents).padStart(3)}  all-critical-ok=${String(a.critical_all_ok).padStart(3)}/${a.documents}`);
    }
  }
  lines.push('');
  lines.push('check              scored  correct  accuracy  (uncontested)');
  const order = [...CRITICAL, ...Object.keys(agg.by_check).filter(k => !CRITICAL.includes(k)).sort()];
  for (const k of order) {
    const a = agg.by_check[k];
    if (!a) continue;
    lines.push(`${(CRITICAL.includes(k) ? '*' : ' ') + k.padEnd(17)} ${String(a.scored).padStart(6)}  ${String(a.correct).padStart(7)}  ${pct(a.accuracy)}   ${pct(a.accuracy_uncontested)}`);
  }
  lines.push('(* = critical)');
  lines.push('');
  if (agg.checks_with_confidence) {
    lines.push('calibration (confidence bucket → accuracy):');
    for (const b of agg.calibration) lines.push(`  ${b.bucket.padEnd(9)} n=${String(b.n).padStart(3)}  ${pct(b.accuracy)}`);
  } else {
    lines.push('calibration: no confidence values in results');
  }
  if (!aggregateOnly) {
    lines.push('');
    lines.push('errors:');
    for (const c of scored.checks.filter(c => !c.ok)) {
      lines.push(`  ${c.doc_id}#${c.order} ${c.key.padEnd(22)} ${c.status !== 'ok' ? '[' + c.status + '] ' : ''}expected=${JSON.stringify(c.expected)} got=${JSON.stringify(c.got)}${c.contested ? ' (contested)' : ''}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const goldenPath = arg('golden'), out = arg('out');
  const oracle = flag('oracle');
  const resultsPath = oracle ? '(oracle)' : arg('results');
  if (!goldenPath || !resultsPath) {
    console.error('usage: score.mjs --golden <golden.json> (--results <results.json> | --oracle) [--out report.json] [--aggregate-only]');
    process.exit(2);
  }
  if (out && !out.includes('/.local/') && !out.startsWith('.local/')) {
    console.error('refusing --out outside .local/ — reports carry real document values and the repo is public');
    process.exit(2);
  }
  const rawGolden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const split = arg('split') || 'all';
  if (!['all', 'dev', 'heldout'].includes(split)) { console.error(`--split must be dev|heldout|all, got ${split}`); process.exit(2); }
  const golden = filterGolden(rawGolden, { split });
  // --oracle answers the FILTERED set, so `--split heldout --oracle` is still
  // a meaningful "is this half well-formed" check on its own.
  const results = oracle ? goldenToResults(golden) : JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const scored = scoreRun(golden, results);
  const agg = aggregate(scored);
  // A golden doc without a result is scored as all-wrong ('missing'); say it
  // out loud so a partial run is never mistaken for a bad scanner.
  const missing = scored.docs.filter(d => d.status === 'missing').length;
  if (missing) console.error(`WARNING: ${missing} golden document(s) have no result in ${resultsPath}`);
  const byTemplate = templateBreakdown(golden, scored.docs);
  console.log(formatReport(agg, scored, { aggregateOnly: flag('aggregate-only'), byTemplate }));
  if (out) fs.writeFileSync(out, JSON.stringify({ aggregate: agg, by_template: byTemplate, docs: scored.docs, checks: scored.checks }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
