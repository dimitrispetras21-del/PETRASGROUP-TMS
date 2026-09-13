#!/usr/bin/env node
'use strict';
/*
 * COSTS lines validation proof — pure-logic tests for
 * worker/src/costs-line-rules.mjs (no Worker runtime, no database, no
 * network). Synthetic category/fuel_source/toll_country values only.
 *
 * costs-line-rules.mjs is an ESM file (named exports); this script stays a
 * plain CommonJS .js (root package.json has no "type": "module", same as
 * every other tests/dkv/*.js) and reaches it with a dynamic import() inside
 * an async main — the same trick tests/dkv/run-import-rules.js uses.
 *
 * Usage: node tests/costs/lines-validation-proof.js
 */

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

async function main() {
  const { validateLineBody, CT_FUEL_SOURCE_CATEGORIES, CT_FUEL_SOURCES } = await import('../../worker/src/costs-line-rules.mjs');

  // ── fuel_source: category gate ─────────────────────────────────────
  let r = validateLineBody({ category: 'tolls', fuel_source: 'DKV' });
  assertEqual(r.ok, false, 'fuel_source rejected on a non-fuel category (tolls)');
  assert(/fuel_source/.test(r.error), 'fuel_source rejection names the field');
  assertEqual(r.status, 400, 'fuel_source rejection is a 400');

  for (const cat of CT_FUEL_SOURCE_CATEGORIES) {
    r = validateLineBody({ category: cat, fuel_source: 'DKV' });
    assertEqual(r.ok, true, `fuel_source=DKV accepted on category ${cat}`);
  }

  // ── fuel_source: value gate ─────────────────────────────────────────
  r = validateLineBody({ category: 'fuel', fuel_source: 'SHELL' });
  assertEqual(r.ok, false, 'fuel_source rejects a value outside the 5 allowed');
  assert(/fuel_source/.test(r.error), 'fuel_source value rejection names the field');

  for (const src of CT_FUEL_SOURCES) {
    r = validateLineBody({ category: 'reefer_fuel', fuel_source: src });
    assertEqual(r.ok, true, `fuel_source=${src} accepted on reefer_fuel`);
  }

  // ── fuel_source: absent is fine on any category (optional field) ───
  r = validateLineBody({ category: 'other' });
  assertEqual(r.ok, true, 'no fuel_source at all -> ok regardless of category');

  // ── toll_country: required for manual tolls lines ───────────────────
  r = validateLineBody({ category: 'tolls' }, { isImport: false });
  assertEqual(r.ok, false, 'manual tolls line with no toll_country is rejected');
  assertEqual(r.error, 'toll_country required (ISO-2)', 'toll_country rejection uses the exact spec message');

  r = validateLineBody({ category: 'tolls', toll_country: 'gr' }, { isImport: false });
  assertEqual(r.ok, true, 'lowercase 2-letter toll_country accepted');
  assertEqual(r.toll_country, 'GR', 'toll_country is uppercased');

  r = validateLineBody({ category: 'tolls', toll_country: 'GRE' }, { isImport: false });
  assertEqual(r.ok, false, '3-letter toll_country rejected (must be ISO-2)');

  r = validateLineBody({ category: 'tolls', toll_country: '' }, { isImport: false });
  assertEqual(r.ok, false, 'empty-string toll_country rejected like absent');

  // ── toll_country: import lines are out of scope (spec: "do not touch") ──
  r = validateLineBody({ category: 'tolls' }, { isImport: true });
  assertEqual(r.ok, true, 'an already-imported line (doc_id present) skips the toll_country requirement');

  // ── toll_country: irrelevant outside category=tolls ─────────────────
  r = validateLineBody({ category: 'fuel' }, { isImport: false });
  assertEqual(r.ok, true, 'no toll_country check outside category=tolls');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
