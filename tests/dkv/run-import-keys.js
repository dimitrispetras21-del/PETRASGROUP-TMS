#!/usr/bin/env node
// Proof for the commit blockers the read-only critic found on 8/9/2026, plus
// the round 2 (splitByPassages / ref-join / none_reason) proof against the
// real ZIP:
//   1. every parsed line must map to a ct_cost_lines row with a EUR amount and
//      a date (toCostLineRow) — foreign-currency lines must use the EUR equivalent;
//   2. import_key must be unique across the whole real statement, INCLUDING
//      the per-day lines splitByPassages creates (it collided 19 times before
//      `seq` was added to the key; `sub` is what keeps split children apart);
//   3. splitting a half-month toll line into per-day lines must not change
//      Σ gross_eur per document — reconcile() must still read 17/17 OK on the
//      post-split lines, same as it does on the raw parsed lines (run.js);
//   4. how many half-month lines were split, how many day-lines that created,
//      how many AT/SI/SK-style lines joined their real day via `ref`;
//   5. 0 lines left in category 'other' except a genuinely new/unseen code
//      (round 2 seeded every code that was landing there on the 31/08 ZIP).
// Runs against the real ZIP in .local/dkv (gitignored) when present; the
// synthetic fixtures are covered by run-synthetic.js / run-import-rules.js.
// Counts only — nothing from the real file is printed.
//
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=$PWD/node_modules node tests/dkv/run-import-keys.js
const path = require('path');
const fs = require('fs');

async function main() {
  const rules = await import(path.join(__dirname, '..', '..', 'worker', 'src', 'import-rules.mjs'));
  const DkvParser = require(path.join(__dirname, '..', '..', 'core', 'dkv-parser.js'));
  const { extractZip } = require('./extract.js');
  // A worktree checkout has no .local/dkv of its own (gitignored, never
  // copied) — the real ZIP only exists under the main repo. Try relative to
  // this file first (works when the script itself lives in the main repo),
  // then relative to the current working directory (the documented way to
  // run this script from a worktree: `cd <main repo> && node <worktree>/tests/dkv/...`).
  const candidates = [
    path.resolve(__dirname, '..', '..', '.local', 'dkv'),
    path.resolve(process.cwd(), '.local', 'dkv'),
  ];
  let dir = null;
  let zip = null;
  for (const d of candidates) {
    try {
      const f = fs.readdirSync(d).find((n) => /\.zip$/i.test(n));
      if (f) { dir = d; zip = path.join(d, f); break; }
    } catch (e) { /* try next candidate */ }
  }
  if (!zip) { console.log('SKIP: no .local/dkv/*.ZIP (real statement not present on this machine)'); return; }

  const files = await extractZip(zip);
  const parsed = DkvParser.parseDkv(files);

  let failed = 0;
  const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } };

  // ── 1+2: import_key uniqueness on the RAW parsed lines (pre-split) ──────
  const keyedRaw = parsed.lines.map((l) => ({ ...l, import_key: rules.buildImportKey(l) }));
  const dupesRaw = rules.findDuplicateImportKeys(keyedRaw);
  check(parsed.lines.length > 0, `parsed lines (pre-split): ${parsed.lines.length}`);
  check(parsed.lines.every((l) => Number.isInteger(l.seq)), 'every line carries an integer seq');
  check(dupesRaw.length === 0, `duplicate import keys, pre-split: ${dupesRaw.length} (must be 0)`);

  // ── splitByPassages: same call the Worker's /costs/import/parse makes,
  // right after parseDkv and before applyRules ──────────────────────────
  const split = rules.splitByPassages(parsed.lines, parsed.passages);
  console.log(`\nhalf-month toll lines split: ${split.stats.lines_split} → ${split.stats.lines_created} day-lines`);
  console.log(`split gate failures (left untouched, reported): ${split.errors.split.length}`);
  const refJoined = split.lines.filter((l) => l.service_date_source === 'passages' && l.sub == null).length;
  console.log(`AT/SI/SK-style lines whose real day was joined via ref: ${refJoined}`);

  // ── import_key uniqueness on the POST-split lines (the real commit path) ──
  const keyedSplit = split.lines.map((l) => ({ ...l, import_key: rules.buildImportKey(l) }));
  const dupesSplit = rules.findDuplicateImportKeys(keyedSplit);
  check(split.lines.length >= parsed.lines.length, `post-split line count: ${split.lines.length} (>= pre-split ${parsed.lines.length})`);
  check(dupesSplit.length === 0, `duplicate import keys, post-split (with sub): ${dupesSplit.length} (must be 0)`);

  // ── reconcile: splitting must not move Σ gross_eur per document ─────────
  const summaryDocs = (parsed.summary && parsed.summary.docs) || [];
  const recBefore = rules.reconcile(parsed.lines, summaryDocs);
  const recAfter = rules.reconcile(split.lines, summaryDocs);
  const okBefore = recBefore.per_doc.filter((d) => d.ok).length;
  const okAfter = recAfter.per_doc.filter((d) => d.ok).length;
  check(recBefore.per_doc.length === recAfter.per_doc.length, `reconcile: same doc count before/after split (${recBefore.per_doc.length})`);
  check(okBefore === recBefore.per_doc.length, `reconcile pre-split: ${okBefore}/${recBefore.per_doc.length} OK`);
  console.log(`reconcile post-split: ${okAfter}/${recAfter.per_doc.length} OK`);
  check(okAfter === recAfter.per_doc.length, `reconcile: splitting did not break any document's Σ gross_eur (${okAfter}/${recAfter.per_doc.length} OK)`);

  // ── 5: nothing left in 'other' except a genuinely new/unseen code ───────
  const otherLines = split.lines.filter((l) => l.category === 'other');
  const otherCodes = [...new Set(otherLines.map((l) => l.product_code))];
  console.log(`\nlines in category 'other': ${otherLines.length}${otherCodes.length ? ' — codes: ' + otherCodes.join(', ') : ''}`);
  check(otherLines.length === 0, `0 lines in 'other' (round 2 seed covers every code seen in the real ZIP)`);

  // ── row mapping (toCostLineRow) on the post-split lines ──────────────────
  let missingNet = 0, missingDate = 0, foreign = 0, foreignMapped = 0, litersOk = 0, litersExpected = 0;
  for (const l of split.lines) {
    const { row, missing } = rules.toCostLineRow(l);
    if (missing.includes('net_eur')) missingNet++;
    if (missing.includes('line_date')) missingDate++;
    if (l.currency && l.currency !== 'EUR') { foreign++; if (row.net === l.net_eur && row.net !== l.net) foreignMapped++; }
    if (l.unit && /^(LTR|L)$/i.test(String(l.unit))) { litersExpected++; if (row.liters === l.quantity) litersOk++; }
    if (row.category !== l.category) { failed++; console.log('  ✗ category changed by mapping'); }
    if (l.sub != null && row.note !== 'από λίστα διελεύσεων') { failed++; console.log('  ✗ split child note not carried into toCostLineRow'); }
  }
  check(missingNet === 0, `lines without a EUR amount: ${missingNet} (must be 0)`);
  check(missingDate === 0, `lines without a date: ${missingDate} (must be 0)`);
  check(foreign === 0 || foreignMapped === foreign, `foreign-currency lines mapped to EUR: ${foreignMapped}/${foreign}`);
  check(litersOk === litersExpected, `fuel lines with liters carried over: ${litersOk}/${litersExpected}`);

  console.log(failed ? `\n${failed} FAILED` : '\nOK — keys unique (pre and post split), reconcile unaffected, every line has EUR amount + date');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
