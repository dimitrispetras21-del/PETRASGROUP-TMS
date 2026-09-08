#!/usr/bin/env node
'use strict';
/*
 * DKV Φ2 proof — pure-logic tests for worker/src/import-rules.mjs (no Worker
 * runtime, no database, no network). Synthetic data only: fake plates
 * (XX1234/XX5678), fake truck ids, fake round-trip ids — nothing from a real
 * DKV statement or a real fleet (public repo).
 *
 * import-rules.mjs is an ESM file (named exports); this script stays a plain
 * CommonJS .js (root package.json has no "type": "module", same as every
 * other tests/dkv/*.js) and reaches it with a dynamic import() inside an
 * async main — the same trick Node allows from any CJS caller.
 *
 * Usage: node tests/dkv/run-import-rules.js
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

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg} (expected ${e}, got ${a})`);
}

async function main() {
  const mod = await import('../../worker/src/import-rules.mjs');
  const {
    buildImportKey, findDuplicateImportKeys, applyRules, splitByPassages, matchRoundTrip,
    reconcile, sumGrossEur, isMissingRelationError,
  } = mod;
  const DkvParser = require('../../core/dkv-parser.js');

  // ── buildImportKey (spec §6 gate #2) ────────────────────────────────
  // 7 parts (doc_no, seq, ref, plate, service_date, product_code, sub) → 6 separators.
  assertEqual(
    buildImportKey({ doc_no: 'D1', ref: 'R1', plate: 'XX1234', service_date: '2026-08-13', product_code: '0009' }),
    'D1||R1|XX1234|2026-08-13|0009|',
    'buildImportKey: full line, no sub (unsplit) → trailing blank'
  );
  assertEqual(
    buildImportKey({ doc_no: 'D1', ref: null, plate: 'XX1234', service_date: '2026-08-13', product_code: null }),
    'D1|||XX1234|2026-08-13||',
    'buildImportKey: missing pieces become blank, not skipped (positional stability)'
  );
  assertEqual(buildImportKey({}), '||||||', 'buildImportKey: fully empty line still has 6 separators (seq + sub slots included)');
  assertEqual(
    buildImportKey({ doc_no: 'D1', seq: 3, ref: 'R1', plate: 'XX1234', service_date: '2026-08-13', product_code: '0936', sub: 1 }),
    'D1|3|R1|XX1234|2026-08-13|0936|1',
    'buildImportKey: sub=1 (first split child) appears as the 7th field'
  );
  assertEqual(
    buildImportKey({ doc_no: 'D1', seq: 3, ref: 'R1', plate: 'XX1234', service_date: '2026-08-13', product_code: '0936', sub: 2 }),
    'D1|3|R1|XX1234|2026-08-13|0936|2',
    'buildImportKey: sub=2 differs from sub=1 → distinct keys even when every other field matches'
  );

  // ── seed categories (round 2, spec facts 8/9/2026 — codes that were
  // landing in 'other' on the real ZIP) ───────────────────────────────
  assertEqual(DkvParser.categoryForProduct('0517'), 'tolls', 'seed: 0517 Putarina u Srbiji (RS) → tolls');
  assertEqual(DkvParser.categoryForProduct('0519'), 'tolls', 'seed: 0519 Taxă de drum RO → tolls');
  assertEqual(DkvParser.categoryForProduct('0533'), 'tolls', 'seed: 0533 Cestarina Hrvatska → tolls');
  assertEqual(DkvParser.categoryForProduct('0900'), 'tolls', 'seed: 0900 Toll D - DKV BOX → tolls');
  assertEqual(DkvParser.categoryForProduct('0BGS'), 'dkv', 'seed: 0BGS service charge (BG) → dkv');
  assertEqual(DkvParser.categoryForProduct('0CZS'), 'dkv', 'seed: 0CZS service charge (CZ) → dkv');
  assertEqual(DkvParser.categoryForProduct('0DES'), 'dkv', 'seed: 0DES service charge (DE) → dkv');
  assertEqual(DkvParser.categoryForProduct('0PLS'), 'dkv', 'seed: 0PLS service charge (PL) → dkv');
  assertEqual(DkvParser.categoryForProduct('0920'), 'dkv', 'seed: 0920 DKV BOX EU central → dkv');
  assertEqual(DkvParser.categoryForProduct('0922'), 'dkv', 'seed: 0922 Increased DKV BOX → dkv');
  assertEqual(DkvParser.categoryForProduct('01AP'), 'dkv', 'seed: 01AP DKV Analytics → dkv');
  assertEqual(DkvParser.categoryForProduct('0GRS'), 'dkv', 'seed: 0GRS still dkv (already seeded, round 2 keeps it)');

  // ── findDuplicateImportKeys ──────────────────────────────────────────
  assertDeepEqual(findDuplicateImportKeys([{ import_key: 'a' }, { import_key: 'b' }]), [], 'findDuplicateImportKeys: no dupes → []');
  assertDeepEqual(findDuplicateImportKeys([{ import_key: 'a' }, { import_key: 'a' }, { import_key: 'b' }]), ['a'], 'findDuplicateImportKeys: one dupe found');
  assertDeepEqual(
    findDuplicateImportKeys([{ doc_no: 'D', ref: 'R', plate: 'XX1234', service_date: '2026-08-13', product_code: '0009' }, { doc_no: 'D', ref: 'R', plate: 'XX1234', service_date: '2026-08-13', product_code: '0009' }]),
    ['D||R|XX1234|2026-08-13|0009|'],
    'findDuplicateImportKeys: falls back to buildImportKey when import_key not set on the line'
  );

  // ── applyRules: plate → truck_id (spec §5 step c order: trucks, aliases, rule) ──
  const trucks = [{ id: 101, plate: 'XX1234' }, { id: 102, plate: 'XX5678' }];
  const plateAliases = [{ alias: 'YY9999', truck_id: 103 }];
  const plateRule = [{ kind: 'plate', key: 'ZZ0000', value: { truck_id: 104 } }];

  let out = applyRules([{ plate: 'XX1234', category: 'fuel' }], { trucks, plateAliases: [], rules: [] });
  assertEqual(out[0].truck_id, 101, 'applyRules: plate resolved via trucks table');

  out = applyRules([{ plate: 'YY9999', category: 'fuel' }], { trucks, plateAliases, rules: [] });
  assertEqual(out[0].truck_id, 103, 'applyRules: plate resolved via ct_plate_aliases when not in trucks');

  out = applyRules([{ plate: 'ZZ0000', category: 'fuel' }], { trucks, plateAliases, rules: plateRule });
  assertEqual(out[0].truck_id, 104, 'applyRules: plate resolved via ct_import_rules kind=plate when not in trucks or aliases');

  out = applyRules([{ plate: 'UNKNOWN1', category: 'fuel' }], { trucks, plateAliases, rules: plateRule });
  assertEqual(out[0].truck_id, undefined, 'applyRules: unresolved plate leaves truck_id unset, not guessed');

  out = applyRules([{ plate: null, category: 'fuel' }], { trucks, plateAliases, rules: [] });
  assertEqual(out[0].truck_id, undefined, 'applyRules: no plate on the line (reverse charge) → no truck lookup attempted');

  // ── applyRules: product/category rules override the parser's seed (spec §4) ──
  out = applyRules([{ product_code: '0902', category: 'tolls' }], { rules: [{ kind: 'product', key: '0902', value: { category: 'other' } }] });
  assertEqual(out[0].category, 'other', 'applyRules: a saved product rule overrides the parser seed map');

  out = applyRules([{ product_code: 'ZZZZ', category: 'other', product: 'Some Weird Fee' }], { rules: [{ kind: 'category', key: 'Some Weird Fee', value: { category: 'dkv' } }] });
  assertEqual(out[0].category, 'dkv', 'applyRules: text-based category rule fixes an unknown-code line');

  out = applyRules([{ product_code: '0009', category: 'fuel', product: 'DIESEL' }], { rules: [{ kind: 'category', key: 'DIESEL', value: { category: 'dkv' } }] });
  assertEqual(out[0].category, 'fuel', 'applyRules: text-based category rule is NOT applied when the code already resolved (only for category="other")');

  out = applyRules([{ station: 'SHELL PIERIAS' }], { rules: [{ kind: 'station', key: 'SHELL PIERIAS', value: { country: 'GR' } }] });
  assertEqual(out[0].country, 'GR', 'applyRules: station rule sets country');

  out = applyRules([{ plate: 'XX1234', category: 'fuel', product_code: '0009' }], {});
  assertEqual(out[0].category, 'fuel', 'applyRules: empty ctx (no trucks/aliases/rules) does not throw, line passes through');

  // ── matchRoundTrip (spec §4 score) ───────────────────────────────────
  const rtsSure = [{ id: 1, truck_id: 101, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-10' }];
  assertDeepEqual(
    matchRoundTrip({ plate: 'XX1234', truck_id: 101, service_date: '2026-08-05' }, rtsSure, []),
    { match: 'sure', rt_id: 1, alternatives: [], none_reason: null },
    'matchRoundTrip: one candidate in range → sure'
  );

  // ── round 2: DKV account/box fees are never a trip cost ─────────────
  const rFee = matchRoundTrip({ category: 'dkv', plate: 'XX1234', truck_id: 101, service_date: '2026-08-05' }, rtsSure, []);
  assertDeepEqual(
    rFee,
    { match: 'none', rt_id: null, alternatives: [], general: true, none_reason: 'general_fee' },
    'matchRoundTrip: category dkv → none/general_fee even with a resolvable plate+truck+date'
  );
  const rFeeNoPlate = matchRoundTrip({ category: 'dkv', plate: null }, rtsSure, []);
  assertEqual(rFeeNoPlate.none_reason, 'general_fee', 'matchRoundTrip: category dkv wins over the no-plate check too (checked first)');

  const rtsTwo = [
    { id: 1, truck_id: 101, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-15' },
    { id: 2, truck_id: 101, status: 'planned', date_start: '2026-08-14', date_end: '2026-08-25' },
  ];
  const half = { plate: 'XX1234', truck_id: 101, period_from: '2026-08-10', period_to: '2026-08-20' };
  const r2 = matchRoundTrip(half, rtsTwo, []);
  assertEqual(r2.match, 'suggest', 'matchRoundTrip: two overlapping candidates → suggest');
  // line window 10..20: RT1 (01-15) overlaps 10..15 = 6 days, RT2 (14-25) overlaps 14..20 = 7 days → RT2 wins.
  assertEqual(r2.rt_id, 2, 'matchRoundTrip: suggest picks the RT covering the most days of a half-month line (RT2: 7d beats RT1: 6d)');
  assertDeepEqual(r2.alternatives, [1], 'matchRoundTrip: the other candidate is listed as an alternative');

  const rPref = matchRoundTrip(half, rtsTwo, [{ kind: 'rt_pref', key: 'XX1234', value: { rt_id: 1 } }]);
  assertEqual(rPref.rt_id, 1, 'matchRoundTrip: a saved rt_pref rule overrides the most-days heuristic');
  assertDeepEqual(rPref.alternatives, [2], 'matchRoundTrip: rt_pref case still lists the non-chosen candidate as an alternative');

  const rNone = matchRoundTrip({ plate: 'XX1234', truck_id: 101, service_date: '2026-01-01' }, rtsSure, []);
  assertEqual(rNone.match, 'none', 'matchRoundTrip: no candidate in range → none');
  assertEqual(rNone.general, false, 'matchRoundTrip: known truck but no RT window → not general (still an allocation gap)');
  assertEqual(rNone.none_reason, 'no_rt_on_date', 'matchRoundTrip: known truck, no RT covers the date → none_reason no_rt_on_date');

  const rGeneral = matchRoundTrip({ plate: null }, rtsSure, []);
  assertDeepEqual(rGeneral, { match: 'none', rt_id: null, alternatives: [], general: true, none_reason: 'no_plate' }, 'matchRoundTrip: no plate at all (reverse charge) → none + general + no_plate');

  const rUnresolvedPlate = matchRoundTrip({ plate: 'UNKNOWN1', truck_id: null }, rtsSure, []);
  assertEqual(rUnresolvedPlate.match, 'none', 'matchRoundTrip: plate present but never resolved to a truck → none');
  assertEqual(rUnresolvedPlate.general, false, 'matchRoundTrip: unresolved plate is NOT a general fee — it needs a plate alias, not allocation');
  assertEqual(rUnresolvedPlate.none_reason, 'unknown_plate', 'matchRoundTrip: plate present, unresolved → none_reason unknown_plate');

  const rtsCancelled = [{ id: 9, truck_id: 101, status: 'cancelled', date_start: '2026-08-01', date_end: '2026-08-10' }];
  const rCancelled = matchRoundTrip({ plate: 'XX1234', truck_id: 101, service_date: '2026-08-05' }, rtsCancelled, []);
  assertEqual(rCancelled.match, 'none', 'matchRoundTrip: a cancelled RT is never a candidate, even in range');
  assertEqual(rCancelled.none_reason, 'no_rt_on_date', 'matchRoundTrip: cancelled-only RT reads the same as no RT at all → no_rt_on_date');

  const rtsHalfSingle = [{ id: 5, truck_id: 101, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-31' }];
  const rHalfSure = matchRoundTrip({ plate: 'XX1234', truck_id: 101, period_from: '2026-08-01', period_to: '2026-08-15' }, rtsHalfSingle, []);
  assertEqual(rHalfSure.match, 'sure', 'matchRoundTrip: half-month line inside one RT window → sure');

  // ── reconcile (spec §6 gate #1) ──────────────────────────────────────
  const rec1 = reconcile(
    [{ doc_no: 'D1', gross: 100 }, { doc_no: 'D1', gross: 50 }],
    [{ doc_no: 'D1', total_eur: 150 }]
  );
  assertEqual(rec1.ok, true, 'reconcile: sums match exactly → ok');
  assertEqual(rec1.per_doc[0].diff, 0, 'reconcile: diff is 0 on exact match');

  const rec2 = reconcile([{ doc_no: 'D1', gross: 100.01 }], [{ doc_no: 'D1', total_eur: 100 }]);
  assertEqual(rec2.ok, true, 'reconcile: diff of exactly 0.01 is within tolerance → ok');

  const rec3 = reconcile([{ doc_no: 'D1', gross: 100.02 }], [{ doc_no: 'D1', total_eur: 100 }]);
  assertEqual(rec3.ok, false, 'reconcile: diff of 0.02 exceeds tolerance → not ok');
  assertEqual(rec3.per_doc[0].diff, 0.02, 'reconcile: diff value reported for the mismatch');

  const rec4 = reconcile([{ doc_no: 'D_MISSING', gross: 10 }], []);
  assertEqual(rec4.ok, false, 'reconcile: doc_no absent from E-SUMMARY is a mismatch, never silently ok');
  assertEqual(rec4.per_doc[0].summary_total, null, 'reconcile: summary_total is explicitly null, not 0 (0 would look like a real reconciled zero)');

  const rec5 = reconcile(
    [{ doc_no: 'D_OK', gross: 10 }, { doc_no: 'D_BAD', gross: 5 }],
    [{ doc_no: 'D_OK', total_eur: 10 }, { doc_no: 'D_BAD', total_eur: 999 }]
  );
  assertEqual(rec5.ok, false, 'reconcile: one bad doc among several fails the overall gate');
  assertEqual(rec5.per_doc.find((d) => d.doc_no === 'D_OK').ok, true, 'reconcile: the good doc is still reported ok individually');
  assertEqual(rec5.per_doc.find((d) => d.doc_no === 'D_BAD').ok, false, 'reconcile: the bad doc is reported not ok individually');

  // currency: gross_eur used over native gross when present (non-EUR statement)
  const rec6 = reconcile([{ doc_no: 'D1', gross: 2500, currency: 'CZK', gross_eur: 100 }], [{ doc_no: 'D1', total_eur: 100 }]);
  assertEqual(rec6.ok, true, 'reconcile: uses gross_eur (not native gross) for non-EUR lines');

  // passages are simply never passed in — caller only sends invoice/statement/reverse_charge lines
  const rec7 = reconcile([{ doc_no: 'D1', gross: 10 }], [{ doc_no: 'D1', total_eur: 10 }, { doc_no: 'D_PASSAGES', total_eur: 500 }]);
  assertEqual(rec7.per_doc.length, 1, 'reconcile: a summary doc with no matching lines (e.g. a passages doc) is never gated — only doc_nos present in `lines` are checked');

  // ── sumGrossEur ───────────────────────────────────────────────────────
  assertEqual(sumGrossEur([{ gross: 10 }, { gross: 5.5 }]), 15.5, 'sumGrossEur: plain sum');
  assertEqual(sumGrossEur([{ gross: 10, gross_eur: 8 }]), 8, 'sumGrossEur: prefers gross_eur over native gross');
  assertEqual(sumGrossEur([{ gross: 10 }, { gross: -2.04 }]), 7.96, 'sumGrossEur: handles a negative discount line');
  assertEqual(sumGrossEur([]), 0, 'sumGrossEur: empty list → 0');

  // ── splitByPassages (round 2, half-month toll lines → per-day) ──────
  // Fake half-month CZ toll statement line (net 30, vat 0, gross 30) plus
  // three passages groups (days 3/8/13) that sum to the same net — gate passes.
  const halfLine = {
    doc_no: 'D_CZ', seq: 4, ref: null, plate: 'XX1234', country: 'CZ',
    category: 'tolls', period_from: '2026-08-01', period_to: '2026-08-15',
    net: 30, vat: 0, gross: 30, net_eur: 30, vat_eur: 0, gross_eur: 30, currency: 'EUR',
  };
  const passagesOk = [
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-03', net: 10, vat: 0, gross: 10, passages: [{}] },
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-08', net: 7, vat: 0, gross: 7, passages: [{}, {}] },
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-13', net: 13, vat: 0, gross: 13, passages: [{}] },
  ];
  const splitOk = splitByPassages([halfLine], passagesOk);
  assertEqual(splitOk.lines.length, 3, 'splitByPassages: gate passes → one line per passages group');
  assertEqual(splitOk.errors.split.length, 0, 'splitByPassages: gate passes → no split error recorded');
  assertEqual(splitOk.stats.lines_split, 1, 'splitByPassages: stats count the parent line as split once');
  assertEqual(splitOk.stats.lines_created, 3, 'splitByPassages: stats count 3 created day-lines');
  assertDeepEqual(splitOk.lines.map((l) => l.service_date), ['2026-08-03', '2026-08-08', '2026-08-13'], 'splitByPassages: children carry each group\'s own service_date, in order');
  assertDeepEqual(splitOk.lines.map((l) => l.period_from), [null, null, null], 'splitByPassages: children have period_from/period_to removed');
  assertDeepEqual(splitOk.lines.map((l) => l.sub), [1, 2, 3], 'splitByPassages: sub numbers children 1..n');
  assertDeepEqual(splitOk.lines.map((l) => l.split_from_seq), [4, 4, 4], 'splitByPassages: split_from_seq points back at the parent seq');
  assertDeepEqual(splitOk.lines.map((l) => l.passages_count), [1, 2, 1], 'splitByPassages: passages_count copied from each group');
  assert(splitOk.lines.every((l) => l.note === 'από λίστα διελεύσεων'), 'splitByPassages: every child carries the passages-source note');
  assert(splitOk.lines.every((l) => l.service_date_source === 'passages'), 'splitByPassages: every child is tagged service_date_source=passages');
  // EUR remainder absorption: 30 split across (10,7,13) local → EUR ratios 1/3, 7/30, 13/30
  // of 30 EUR = 10.00, 7.00, 13.00 exactly here, so verify the general property instead
  // (Σ children == parent, not float drift) with an amount that does NOT divide evenly.
  const halfLine2 = { ...halfLine, net: 30, gross_eur: 10, net_eur: 10, vat_eur: 0 };
  const passagesUneven = [
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-03', net: 10, vat: 0, gross: 10, passages: [] },
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-08', net: 10, vat: 0, gross: 10, passages: [] },
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-13', net: 10, vat: 0, gross: 10, passages: [] },
  ];
  const splitUneven = splitByPassages([halfLine2], passagesUneven);
  const sumChildrenEur = splitUneven.lines.reduce((s, l) => s + l.net_eur, 0);
  assertEqual(Math.round(sumChildrenEur * 100) / 100, 10, 'splitByPassages: Σ children net_eur == parent net_eur exactly (10/3 rounding absorbed by the last day)');
  const lastChild = splitUneven.lines[splitUneven.lines.length - 1];
  const firstTwoSum = splitUneven.lines[0].net_eur + splitUneven.lines[1].net_eur;
  assertEqual(Math.round((firstTwoSum + lastChild.net_eur) * 100) / 100, 10, 'splitByPassages: last child absorbs whatever the first two rounded away');

  // Gate fails: passages sum (10+7) does not match the line's own net (30).
  const passagesMismatch = [
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-03', net: 10, vat: 0, gross: 10, passages: [] },
    { plate: 'XX1234', country: 'CZ', service_date: '2026-08-08', net: 7, vat: 0, gross: 7, passages: [] },
  ];
  const splitFail = splitByPassages([halfLine], passagesMismatch);
  assertEqual(splitFail.lines.length, 1, 'splitByPassages: gate fails → line left untouched (not split)');
  assertEqual(splitFail.lines[0].period_from, '2026-08-01', 'splitByPassages: gate fails → period_from/to left as parsed');
  assertEqual(splitFail.errors.split.length, 1, 'splitByPassages: gate fails → one split error recorded');
  assertEqual(splitFail.errors.split[0].reason, 'passages-sum-mismatch', 'splitByPassages: error reason is passages-sum-mismatch');
  assertEqual(splitFail.errors.split[0].doc_no, 'D_CZ', 'splitByPassages: error carries doc_no');
  assertEqual(splitFail.errors.split[0].seq, 4, 'splitByPassages: error carries seq');
  assertEqual(splitFail.errors.split[0].groups, 2, 'splitByPassages: error reports how many groups were found');
  assertEqual(splitFail.stats.lines_split, 0, 'splitByPassages: a failed gate does not count as split');

  // No passages at all for the period → still goes through the gate (0 vs 30) and fails, not silently skipped.
  const splitNoGroups = splitByPassages([halfLine], []);
  assertEqual(splitNoGroups.lines.length, 1, 'splitByPassages: no passages found → line untouched, still reported as a gate failure');
  assertEqual(splitNoGroups.errors.split[0].groups, 0, 'splitByPassages: 0 groups recorded when none match plate/country/period');

  // A non-tolls or non-half-month line is never touched by the split logic itself.
  const plainFuelLine = { doc_no: 'D1', seq: 0, ref: null, plate: 'XX1234', category: 'fuel', service_date: '2026-08-05' };
  const splitPlain = splitByPassages([plainFuelLine], passagesOk);
  assertEqual(splitPlain.lines.length, 1, 'splitByPassages: a normal (non-half-month) line passes through unchanged in count');
  assertEqual(splitPlain.lines[0].service_date_source, 'invoice', 'splitByPassages: a line with no ref/no join stays service_date_source=invoice');

  // ── ref-suffix join (round 2, AT/SI/SK style — join by SUFFIX, not equality) ──
  const invoiceLine = { doc_no: 'D_AT', seq: 0, ref: '20260000000056155890', plate: 'XX1234', category: 'tolls', service_date: '2026-08-17' };
  const passageForRef = [{ plate: 'XX1234', country: 'AT', ref: '0000000056155890', service_date: '2026-08-13', passages: [{}, {}] }];
  const joined = splitByPassages([invoiceLine], passageForRef);
  assertEqual(joined.lines[0].service_date, '2026-08-13', 'ref join: real passage day (13th) replaces the invoice charge day (17th)');
  assertEqual(joined.lines[0].service_date_source, 'passages', 'ref join: service_date_source is set to passages on a successful join');
  assertEqual(joined.lines[0].passages_count, 2, 'ref join: passages_count copied from the joined group');

  // Ambiguous join (two groups suffix-match the same ref) is refused, not guessed.
  const passagesAmbiguous = [
    { plate: 'XX1234', country: 'AT', ref: '0000000056155890', service_date: '2026-08-13', passages: [] },
    { plate: 'XX1234', country: 'AT', ref: '56155890', service_date: '2026-08-14', passages: [] },
  ];
  const joinedAmbiguous = splitByPassages([invoiceLine], passagesAmbiguous);
  assertEqual(joinedAmbiguous.lines[0].service_date, '2026-08-17', 'ref join: two suffix matches → refused, invoice date kept');
  assertEqual(joinedAmbiguous.lines[0].service_date_source, 'invoice', 'ref join: two suffix matches → service_date_source stays invoice');

  // No ref at all → never attempts a join.
  const noRefLine = { doc_no: 'D1', seq: 1, ref: null, plate: 'XX1234', category: 'fuel', service_date: '2026-08-05' };
  const joinedNoRef = splitByPassages([noRefLine], passageForRef);
  assertEqual(joinedNoRef.lines[0].service_date, '2026-08-05', 'ref join: no ref on the line → service_date left as parsed');
  assertEqual(joinedNoRef.lines[0].service_date_source, 'invoice', 'ref join: no ref on the line → service_date_source invoice');

  // ── isMissingRelationError (migration 024 not executed yet) ─────────
  assert(isMissingRelationError('dbSelectRaw ct_import_rules 404: {"code":"42P01","message":"relation \\"public.ct_import_rules\\" does not exist"}'), 'isMissingRelationError: 42P01 (missing table) recognized');
  assert(isMissingRelationError('ctDbPatch ct_cost_docs 400: {"code":"42703","message":"column \\"parser_version\\" does not exist"}'), 'isMissingRelationError: 42703 (missing column) recognized');
  assert(!isMissingRelationError('dbInsert ct_cost_lines 409: {"code":"23505","message":"duplicate key"}'), 'isMissingRelationError: a real conflict (23505) is NOT mistaken for a missing-table error');
  assert(!isMissingRelationError(''), 'isMissingRelationError: empty message → false');
  assert(!isMissingRelationError(undefined), 'isMissingRelationError: undefined message → false, does not throw');

  // ── missing-table fallback objects (the shape the Worker falls back to) ──
  // The Worker itself (worker/src/index.js) does the actual PostgREST calls
  // and catches 42P01/42703 there — not unit-testable without a live DB/mocked
  // fetch. What IS pure and testable is that every function here degrades
  // gracefully when the caller passes empty collections (the exact shape the
  // Worker falls back to on rules_unavailable: true) instead of throwing.
  out = applyRules([{ plate: 'XX1234', category: 'fuel' }], { trucks: [], plateAliases: [], rules: [] });
  assertEqual(out[0].truck_id, undefined, 'fallback shape: applyRules with empty trucks/aliases/rules (ct_import_rules unavailable) still returns a line, unresolved not crashed');
  const fallbackMatch = matchRoundTrip({ plate: 'XX1234', truck_id: null }, [], []);
  assertEqual(fallbackMatch.match, 'none', 'fallback shape: matchRoundTrip with no RTs and no rules → none, not a throw');
  const fallbackReconcile = reconcile([], []);
  assertDeepEqual(fallbackReconcile, { ok: true, per_doc: [] }, 'fallback shape: reconcile with no lines and no summary → vacuously ok, empty per_doc');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
