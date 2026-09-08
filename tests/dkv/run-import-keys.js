#!/usr/bin/env node
// Proof for the two commit blockers the read-only critic found on 8/9/2026:
//   1. every parsed line must map to a ct_cost_lines row with a EUR amount and
//      a date (toCostLineRow) — foreign-currency lines must use the EUR equivalent;
//   2. import_key must be unique across the whole real statement (it collided
//      19 times before `seq` was added to the key).
// Runs against the real ZIP in .local/dkv (gitignored) when present; the
// synthetic fixtures are covered by run-synthetic.js. Counts only — nothing
// from the real file is printed.
//
//   cd /Users/dimitrispetras/PETRASGROUP-TMS
//   NODE_PATH=$PWD/node_modules node tests/dkv/run-import-keys.js
const path = require('path');
const fs = require('fs');

async function main() {
  const rules = await import(path.join(__dirname, '..', '..', 'worker', 'src', 'import-rules.mjs'));
  const DkvParser = require(path.join(__dirname, '..', '..', 'core', 'dkv-parser.js'));
  const { extractZip } = require('./extract.js');
  const dir = path.resolve(__dirname, '..', '..', '.local', 'dkv');
  let zip = null;
  try { const f = fs.readdirSync(dir).find((n) => /\.zip$/i.test(n)); if (f) zip = path.join(dir, f); } catch (e) { /* no local dir */ }
  if (!zip) { console.log('SKIP: no .local/dkv/*.ZIP (real statement not present on this machine)'); return; }

  const files = await extractZip(zip);
  const parsed = DkvParser.parseDkv(files);
  const lines = parsed.lines;
  let failed = 0;
  const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failed++; console.log('  ✗ ' + msg); } };

  // 1. keys
  const keyed = lines.map((l) => ({ ...l, import_key: rules.buildImportKey(l) }));
  const dupes = rules.findDuplicateImportKeys(keyed);
  check(lines.length > 0, `parsed lines: ${lines.length}`);
  check(lines.every((l) => Number.isInteger(l.seq)), 'every line carries an integer seq');
  check(dupes.length === 0, `duplicate import keys: ${dupes.length} (must be 0)`);

  // 2. row mapping
  let missingNet = 0, missingDate = 0, foreign = 0, foreignMapped = 0, litersOk = 0, litersExpected = 0;
  for (const l of lines) {
    const { row, missing } = rules.toCostLineRow(l);
    if (missing.includes('net_eur')) missingNet++;
    if (missing.includes('line_date')) missingDate++;
    if (l.currency && l.currency !== 'EUR') { foreign++; if (row.net === l.net_eur && row.net !== l.net) foreignMapped++; }
    if (l.unit && /^(LTR|L)$/i.test(String(l.unit))) { litersExpected++; if (row.liters === l.quantity) litersOk++; }
    if (row.category !== l.category) { failed++; console.log('  ✗ category changed by mapping'); }
  }
  check(missingNet === 0, `lines without a EUR amount: ${missingNet} (must be 0)`);
  check(missingDate === 0, `lines without a date: ${missingDate} (must be 0)`);
  check(foreign === 0 || foreignMapped === foreign, `foreign-currency lines mapped to EUR: ${foreignMapped}/${foreign}`);
  check(litersOk === litersExpected, `fuel lines with liters carried over: ${litersOk}/${litersExpected}`);

  console.log(failed ? `\n${failed} FAILED` : '\nOK — keys unique, every line has EUR amount + date');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
