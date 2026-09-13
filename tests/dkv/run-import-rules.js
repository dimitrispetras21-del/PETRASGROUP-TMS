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
    reconcile, sumGrossEur, isMissingRelationError, allocateFees,
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

  // ── Δ1: dateOverlaps ±1 day tolerance (spec Δ 13/9 — DKV bills the
  // departure day before an RT's own date_start; measured 13/9: 10/98
  // unallocated lines are 1-2 days before an RT start) ─────────────────
  const rtsD1 = [{ id: 50, truck_id: 101, status: 'planned', date_start: '2026-08-10', date_end: '2026-08-15' }];
  const rOneDayBefore = matchRoundTrip({ plate: 'XX1234', truck_id: 101, service_date: '2026-08-09' }, rtsD1, []);
  assertEqual(rOneDayBefore.match, 'sure', 'Δ1: a line dated exactly one day before date_start now matches sure (departure-day billing cut)');
  assertEqual(rOneDayBefore.rt_id, 50, 'Δ1: one-day-before line resolves to the RT it precedes');

  const rOneDayAfter = matchRoundTrip({ plate: 'XX1234', truck_id: 101, service_date: '2026-08-16' }, rtsD1, []);
  assertEqual(rOneDayAfter.match, 'sure', 'Δ1: a line dated one day after date_end also matches sure (symmetrical tolerance)');

  const rTwoDaysBefore = matchRoundTrip({ plate: 'XX1234', truck_id: 101, service_date: '2026-08-08' }, rtsD1, []);
  assertEqual(rTwoDaysBefore.match, 'none', 'Δ1: a line dated two days before date_start is still outside the ±1 day tolerance → none');
  assertEqual(rTwoDaysBefore.none_reason, 'no_rt_on_date', 'Δ1: two-days-before line still reads as no_rt_on_date, not silently matched');

  // overlapDays must stay consistent with the same tolerance, since it picks
  // the best candidate when several RTs overlap a half-month line.
  const rtsD1Two = [
    { id: 51, truck_id: 101, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-09' },
    { id: 52, truck_id: 101, status: 'planned', date_start: '2026-08-20', date_end: '2026-08-25' },
  ];
  const halfD1 = { plate: 'XX1234', truck_id: 101, period_from: '2026-08-10', period_to: '2026-08-19' };
  const rD1Half = matchRoundTrip(halfD1, rtsD1Two, []);
  assertEqual(rD1Half.match, 'suggest', 'Δ1: overlapDays tolerance lets a half-month line reach both neighbouring RTs (10th touches RT1 via -1d, 19th touches RT2 via +1d)');
  assertDeepEqual([rD1Half.rt_id, ...rD1Half.alternatives].sort(), [51, 52], 'Δ1: both RT51 and RT52 are candidates once the same ±1 day tolerance widens overlapDays');

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

  // ── Δ2: allocateFees (spec Δ 13/9 — DKV account fees spread proportionally
  // over the RTs of the statement period, weighted by what each RT already
  // owes in this import). Fixtures simulate the state AFTER matchRoundTrip
  // has run (rt_id already set on the fuel/tolls lines, dkv line carries the
  // real none_reason matchRoundTrip always gives a category='dkv' line).
  // Fake plates/amounts only, no real fleet data.
  const feeRtsAB = [
    { id: 10, truck_id: 201, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
    { id: 11, truck_id: 202, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
  ];
  const feeLineAB = {
    doc_no: 'FEE1', seq: 9, ref: null, plate: null, truck_id: null, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee',
    service_date: '2026-08-03', net: 100, vat: 20, note: 'DKV · FEE1',
  };
  const allocAB = allocateFees(
    [{ category: 'fuel', rt_id: 10, net: 300 }, { category: 'fuel', rt_id: 11, net: 100 }, feeLineAB],
    feeRtsAB
  );
  const feeChildrenAB = allocAB.lines.filter((l) => l.category === 'dkv');
  assertEqual(feeChildrenAB.length, 2, 'allocateFees: fee over two RTs weighted 300/100 → 2 children, one per RT');
  assertEqual(allocAB.stats.fees_allocated, 1, 'allocateFees: stats count the fee line as allocated once');
  assertEqual(allocAB.stats.fee_children, 2, 'allocateFees: stats count 2 created children');
  assertEqual(allocAB.stats.fees_no_rt, 0, 'allocateFees: an allocated fee is not also counted as fees_no_rt');
  const child300 = feeChildrenAB.find((l) => l.rt_id === 10);
  const child100 = feeChildrenAB.find((l) => l.rt_id === 11);
  assertEqual(child300.net, 75, 'allocateFees: RT weighted 300/400 of the fee gets 75% of net 100 → 75.00');
  assertEqual(child100.net, 25, 'allocateFees: the other RT (weight 100/400) gets the remaining 25.00 exactly (last child absorbs rounding)');
  assertEqual(child300.vat, 15, 'allocateFees: vat is split with the same ratio as net (75%)');
  assertEqual(child100.vat, 5, 'allocateFees: vat remainder (25%) goes to the last child');
  assertEqual(child300.match, 'sure', 'allocateFees: every child is match=sure (it now has a real rt_id)');
  assertEqual(child300.alloc_status, 'allocated', 'allocateFees: every child is alloc_status=allocated');
  assertEqual(child300.none_reason, null, 'allocateFees: a child clears the parent none_reason (general_fee) — it is allocated now');
  assert(child300.note.startsWith('επιμερισμός · '), 'allocateFees: child note is prefixed επιμερισμός ·');
  assert(child300.note.includes('DKV · FEE1'), 'allocateFees: child note still carries the original note');
  assertEqual(
    buildImportKey(child300) === buildImportKey(child100), false,
    'allocateFees: the two children of the same fee get distinct import_key values (distinct sub)'
  );

  // Rounding case from the spec: fee 10.00 over three equal weights (1,1,1) → 3.33/3.33/3.34.
  const feeRts3 = [
    { id: 20, truck_id: 301, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
    { id: 21, truck_id: 302, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
    { id: 22, truck_id: 303, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
  ];
  const feeLine3 = {
    doc_no: 'FEE2', seq: 1, ref: null, plate: null, truck_id: null, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee',
    service_date: '2026-08-03', net: 10,
  };
  const allocRound = allocateFees(
    [{ category: 'fuel', rt_id: 20, net: 1 }, { category: 'fuel', rt_id: 21, net: 1 }, { category: 'fuel', rt_id: 22, net: 1 }, feeLine3],
    feeRts3
  );
  const roundChildren = allocRound.lines.filter((l) => l.category === 'dkv').map((l) => l.net).sort();
  assertDeepEqual(roundChildren, [3.33, 3.33, 3.34], 'allocateFees: equal-weight rounding case → 3.33/3.33/3.34 (last child absorbs the remainder)');
  const roundSum = Math.round(roundChildren.reduce((s, n) => s + n, 0) * 100) / 100;
  assertEqual(roundSum, 10, 'allocateFees: Σ children net == parent net exactly (10.00), not 9.99/10.01 from float drift');

  // (b) fee WITH a truck_id → only that truck's RT.
  const feeRtsB = [
    { id: 30, truck_id: 401, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
    { id: 31, truck_id: 402, status: 'planned', date_start: '2026-08-01', date_end: '2026-08-05' },
  ];
  const feeLineB = {
    doc_no: 'FEE3', seq: 1, ref: null, plate: 'XX9999', truck_id: 401, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee',
    service_date: '2026-08-03', net: 20,
  };
  const allocB = allocateFees(
    [{ category: 'fuel', rt_id: 30, net: 50 }, { category: 'fuel', rt_id: 31, net: 50 }, feeLineB],
    feeRtsB
  );
  const feeChildrenB = allocB.lines.filter((l) => l.category === 'dkv');
  assertEqual(feeChildrenB.length, 1, 'allocateFees: a fee with truck_id only ever produces a child for that truck\'s RT(s)');
  assertEqual(feeChildrenB[0].rt_id, 30, 'allocateFees: truck-scoped fee resolves to truck 401\'s RT (30), never RT 31 (truck 402)');
  assertEqual(feeChildrenB[0].net, 20, 'allocateFees: single-candidate truck-scoped fee gets the entire net (100% share)');

  // (c) no candidate RT at all → stays a fee with none_reason fee_no_rt, not counted as pending.
  const feeLineC = {
    doc_no: 'FEE4', seq: 1, ref: null, plate: null, truck_id: null, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee',
    service_date: '2026-01-01', net: 5,
  };
  const allocC = allocateFees([feeLineC], []);
  assertEqual(allocC.lines.length, 1, 'allocateFees: no candidate RT → the fee line itself is kept (not dropped)');
  assertEqual(allocC.lines[0].none_reason, 'fee_no_rt', 'allocateFees: no candidate RT → none_reason becomes fee_no_rt (never «προς ανάθεση»)');
  assertEqual(allocC.lines[0].rt_id, null, 'allocateFees: no candidate RT → rt_id stays null');
  assertEqual(allocC.stats.fees_no_rt, 1, 'allocateFees: stats.fees_no_rt counts this fee');
  assertEqual(allocC.stats.fees_allocated, 0, 'allocateFees: a fee_no_rt fee is not also counted as allocated');

  // A fee with no service_date/period of its own and no statement period passed
  // in either → nothing to compute a window from, left completely untouched
  // (not even fee_no_rt — no attempt was made, spec: "if none available, leave untouched").
  const feeLineNoDate = {
    doc_no: 'FEE5', seq: 1, ref: null, plate: null, truck_id: null, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee', net: 5,
  };
  const allocNoDate = allocateFees([feeLineNoDate], feeRtsAB);
  assertEqual(allocNoDate.lines[0].none_reason, 'general_fee', 'allocateFees: no date at all and no statement period arg → left untouched, none_reason unchanged');
  assertEqual(allocNoDate.stats.fees_no_rt, 0, 'allocateFees: an untouched fee (no date info) is not counted as fees_no_rt either');

  // Statement-period fallback (3rd arg): a fee with no service_date/period of
  // its own still allocates when the statement's own period is passed in.
  const feeLineStmt = {
    doc_no: 'FEE6', seq: 1, ref: null, plate: null, truck_id: null, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee', net: 40,
  };
  const allocStmt = allocateFees(
    [{ category: 'fuel', rt_id: 10, net: 10 }, feeLineStmt],
    feeRtsAB,
    { period_from: '2026-08-01', period_to: '2026-08-05' }
  );
  assertEqual(allocStmt.stats.fees_allocated, 1, 'allocateFees: statement-period 3rd arg lets a date-less fee still allocate');

  // (d) import keys of children are unique — already checked above for feeChildrenAB;
  // also verify the full set of import_key values across this whole test batch has no collisions.
  const allChildren = [...feeChildrenAB, ...allocRound.lines.filter((l) => l.category === 'dkv'), ...feeChildrenB];
  const allKeys = allChildren.map((l) => buildImportKey(l));
  assertEqual(new Set(allKeys).size, allKeys.length, 'allocateFees: import_key is unique across every child produced (no two collide)');

  // errors shape: always an array (spec return shape), empty in every case above.
  assertDeepEqual(allocAB.errors, [], 'allocateFees: errors is an empty array in the normal case');
  assertDeepEqual(allocC.errors, [], 'allocateFees: errors stays empty even for a fee_no_rt line (that is not an error)');

  // ── review regression 1: import_key must be RECOMPUTED per child, not
  // inherited from the parent ──────────────────────────────────────────
  // index.js's real call order (spec §Δ wiring) sets import_key on EVERY
  // line — via `import_key: buildImportKey(l)` inside the matchRoundTrip map
  // — BEFORE allocateFees ever runs. A child built as `{...line}` without
  // recomputing import_key would silently keep the PARENT's key on every
  // child → the commit path (index.js ~3436: `ln.import_key || buildImportKey(ln)`
  // only recomputes when the field is MISSING) would submit N rows with the
  // same import_key → 409 duplicate-key gate or a real unique-index violation.
  const feeLineKeyed = { ...feeLineAB };
  feeLineKeyed.import_key = buildImportKey(feeLineKeyed); // mirrors index.js's own pre-allocateFees step
  const parentKeyBeforeSplit = feeLineKeyed.import_key;
  const allocKeyed = allocateFees(
    [{ category: 'fuel', rt_id: 10, net: 300 }, { category: 'fuel', rt_id: 11, net: 100 }, feeLineKeyed],
    feeRtsAB
  );
  const keyedChildren = allocKeyed.lines.filter((l) => l.category === 'dkv');
  assertEqual(keyedChildren.length, 2, 'allocateFees regression: still 2 children when the parent already carries an import_key (real call order)');
  assert(keyedChildren.every((c) => c.import_key !== parentKeyBeforeSplit), 'allocateFees regression: no child keeps the PARENT\'s original import_key (would collide at commit)');
  assertEqual(keyedChildren[0].import_key === keyedChildren[1].import_key, false, 'allocateFees regression: the two children have distinct import_key values from each other too');
  assertEqual(keyedChildren[0].import_key, buildImportKey(keyedChildren[0]), 'allocateFees regression: child.import_key equals buildImportKey(child) — recomputed with its own sub as the 7th field');
  assertEqual(keyedChildren[1].import_key, buildImportKey(keyedChildren[1]), 'allocateFees regression: same for the second child');

  // ── review regression 2: a fee's window is the STATEMENT period, not its
  // own single service_date ──────────────────────────────────────────────
  // Owner rule (spec §0.5, 13/9): «επιμερίζονται στα δρομολόγια της
  // περιόδου» — the WHOLE statement period, not just the one calendar day
  // the fee happens to be dated (dkv-parser gives every line a service_date,
  // including a general fee — spec §1's makeLine). A fee dated 31/08 with a
  // statement period 01–31/08 must reach an RT in early August too, not only
  // RTs within ±1 day of the 31st.
  const feeRtsPeriod = [
    { id: 60, truck_id: 601, status: 'planned', date_start: '2026-08-03', date_end: '2026-08-04' }, // far from 31/08
    { id: 61, truck_id: 602, status: 'planned', date_start: '2026-08-30', date_end: '2026-09-01' }, // near 31/08
  ];
  const feeLinePeriodCase = {
    doc_no: 'FEE7', seq: 1, ref: null, plate: null, truck_id: null, category: 'dkv',
    match: 'none', rt_id: null, general: true, none_reason: 'general_fee',
    service_date: '2026-08-31', net: 90,
  };
  const allocPeriod = allocateFees(
    [{ category: 'fuel', rt_id: 60, net: 100 }, { category: 'fuel', rt_id: 61, net: 50 }, feeLinePeriodCase],
    feeRtsPeriod,
    { period_from: '2026-08-01', period_to: '2026-08-31' }
  );
  const periodChildren = allocPeriod.lines.filter((l) => l.category === 'dkv');
  assertEqual(periodChildren.length, 2, 'allocateFees regression: the statement period (01-31/08) takes priority over the fee\'s own 31/08 service_date — both RTs of the period qualify');
  assert(periodChildren.some((l) => l.rt_id === 60), 'allocateFees regression: the early-August RT (60, far from the 31st) is a candidate once the statement period is used instead of the single service_date');
  assert(periodChildren.some((l) => l.rt_id === 61), 'allocateFees regression: the late-August RT (61) is still a candidate too');

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
