#!/usr/bin/env node
// Round 4, task 2: apply `contested: true` to golden-full.json fields that
// analyze-failures-r4.mjs mechanically found are NOT derivable from the
// source document (verdict b_candidate / b_or_c_candidate) — never a silent
// truth change. Values themselves are never touched, only a `contested` flag
// and a reason-code `note` (no values, so it stays safe to mention in a
// public-repo commit message). A pre-change copy is written once, next to
// the golden file, so the correction is reversible.
//
// Usage:
//   node tools/scan-eval/mark-contested-r4.mjs --golden <golden-full.json> --rows <rows.json> [--apply]
// Without --apply: dry run, prints what WOULD change and exits 0.
import fs from 'node:fs';
import path from 'node:path';

function arg(name, dflt = null) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
}
const flag = name => process.argv.includes('--' + name);

function assertLocal(p, what) {
  if (!path.resolve(p).split(path.sep).includes('.local')) {
    throw new Error(`${what} must live under .local/ (gitignored): ${p}`);
  }
}

const CONTESTABLE = new Set(['b_candidate', 'b_or_c_candidate']);
// Top-level order fields the eval's `check` name maps 1:1 onto.
const TOP_LEVEL = new Set(['pallets', 'pallet_type', 'temperature_c', 'reference', 'client_id']);

function findStop(order, type, idx) {
  const matches = (order.stops || []).filter(s => s.type === type);
  return matches[idx];
}

function main() {
  const goldenPath = arg('golden');
  const rowsPath = arg('rows');
  const apply = flag('apply');
  if (!goldenPath || !rowsPath) {
    console.error('usage: mark-contested-r4.mjs --golden <golden-full.json> --rows <rows.json> [--apply]');
    process.exit(1);
  }
  assertLocal(goldenPath, 'golden');
  assertLocal(rowsPath, 'rows');

  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
  const byDoc = new Map(golden.docs.map(d => [d.doc_id, d]));

  let changed = 0, alreadySet = 0, skippedUnmapped = 0;
  const byReason = {};
  for (const r of rows) {
    if (!CONTESTABLE.has(r.verdict)) continue;
    const doc = byDoc.get(r.doc_id);
    if (!doc) { skippedUnmapped++; continue; }
    const order = (doc.orders || [])[r.order ?? 0];
    if (!order) { skippedUnmapped++; continue; }

    let target = null, isLocation = false;
    if (TOP_LEVEL.has(r.check) && r.key === r.check) {
      target = order[r.check];
    } else {
      const m = /^(loading|delivery)\[(\d+)\]\.(\w+)$/.exec(r.key);
      if (m) {
        const stop = findStop(order, m[1], Number(m[2]));
        if (stop) {
          if (m[3] === 'location') { isLocation = true; target = stop; }
          else target = stop[m[3]];
        }
      }
    }
    if (!target) { skippedUnmapped++; continue; }

    const note = `not in document: ${r.reason}`;
    const key = `${r.check}::${r.reason}`;
    byReason[key] = (byReason[key] || 0) + 1;
    if (isLocation) {
      if (target.contested_location) { alreadySet++; continue; }
      if (apply) { target.contested_location = true; target.location_note = note; }
      changed++;
    } else {
      if (target.contested) { alreadySet++; continue; }
      if (apply) { target.contested = true; target.note = note; }
      changed++;
    }
  }

  console.log(`${apply ? 'applied' : 'dry run (pass --apply to write)'}: ${changed} field(s) newly marked contested, ${alreadySet} already contested, ${skippedUnmapped} rows could not be mapped to a golden field.`);
  console.log('by reason code:');
  for (const [k, n] of Object.entries(byReason).sort()) console.log(`  ${k}: ${n}`);

  if (apply) {
    const preCopy = path.join(path.dirname(goldenPath), 'golden-full.pre-r4.json');
    if (!fs.existsSync(preCopy)) {
      console.error(`refusing to write: expected a pre-existing backup at ${preCopy} (copy golden-full.json there BEFORE running with --apply)`);
      process.exit(1);
    }
    fs.writeFileSync(goldenPath, JSON.stringify(golden, null, 1) + '\n');
    console.log(`written: ${goldenPath} (backup already at ${preCopy})`);
  }
}

main();
