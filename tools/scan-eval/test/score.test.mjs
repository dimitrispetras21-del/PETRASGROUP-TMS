import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRun, aggregate, goldenToResults, filterGolden, templateBreakdown } from '../lib/score.mjs';
import { formatReport } from '../score.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const load = f => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const golden = load('synthetic-golden.json');
const results = load('synthetic-results.json');

test('per-document counts on the synthetic set', () => {
  const { docs } = scoreRun(golden, results);
  const by = Object.fromEntries(docs.map(d => [d.doc_id, d]));
  assert.deepEqual([by.s01.checks, by.s01.correct], [17, 16]);   // only delivery location missed
  assert.deepEqual([by.s02.checks, by.s02.correct], [8, 0]);     // rejected file: every scored check wrong
  assert.deepEqual([by.s03.checks, by.s03.correct], [21, 9]);    // 2nd order in file has no prediction
  assert.equal(docs.filter(d => d.critical_all_ok).length, 0);
});

test('null truth is not scored; contested is reported separately', () => {
  const scored = scoreRun(golden, results);
  const agg = aggregate(scored);
  assert.equal(scored.checks.filter(c => c.doc_id === 's01' && c.check === 'pallet_type').length, 0);
  assert.equal(scored.checks.filter(c => c.doc_id === 's02' && c.check === 'reference').length, 0);
  assert.deepEqual([agg.by_check.temperature_c.scored, agg.by_check.temperature_c.correct], [3, 1]);
  assert.deepEqual([agg.by_check.temperature_c.scored_uncontested, agg.by_check.temperature_c.correct_uncontested], [2, 1]);
  assert.deepEqual([agg.by_check.client_id.scored, agg.by_check.client_id.correct], [4, 2]);
  assert.equal(agg.status.rejected, 1);
});

test('fixing the one miss in s01 makes it all-critical-right', () => {
  const fixed = structuredClone(results);
  fixed.docs[0].orders[0].stops[1].location_id = 'recSynthLoc000002';
  const agg = aggregate(scoreRun(golden, fixed));
  assert.equal(agg.critical_all_ok, 1);
});

test('a golden doc with no result is counted as missing, not skipped', () => {
  const partial = { docs: results.docs.filter(d => d.doc_id !== 's01') };
  const agg = aggregate(scoreRun(golden, partial));
  assert.equal(agg.status.missing, 1);
  assert.equal(agg.documents, 3);
});

test('calibration uses the scanner confidence keys', () => {
  const scored = scoreRun(golden, results);
  const agg = aggregate(scored);
  const clientS01 = scored.checks.find(c => c.doc_id === 's01' && c.check === 'client_id');
  assert.equal(clientS01.confidence, 0.95);
  const stopsS01 = scored.checks.find(c => c.doc_id === 's01' && c.key === 'delivery[0].location');
  assert.equal(stopsS01.confidence, 0.6);                        // min(loading_stops, delivery_stops)
  assert.equal(agg.calibration.reduce((s, b) => s + b.n, 0), agg.checks_with_confidence);
});

test('oracle (golden scored against itself) is 100% — the golden set is well-formed', () => {
  const agg = aggregate(scoreRun(golden, goldenToResults(golden)));
  for (const [k, a] of Object.entries(agg.by_check)) assert.equal(a.correct, a.scored, k);
  assert.equal(agg.critical_all_ok, agg.documents);
});

// Round 4 (docs/scan/04 follow-up): scan-golden/v2 adds `scored`/`split`/
// `template` per doc. A v1 golden (no such fields, like the fixture above)
// must behave exactly as before — filterGolden's defaults (scoredOnly:true,
// split:'all') must not drop anything from it.
test('filterGolden is a no-op on a v1 golden set (no scored/split fields)', () => {
  const filtered = filterGolden(golden);
  assert.equal(filtered.docs.length, golden.docs.length);
  assert.deepEqual(filtered.docs.map(d => d.doc_id), golden.docs.map(d => d.doc_id));
});

test('filterGolden drops scored:false and honours --split', () => {
  const v2 = structuredClone(golden);
  v2.docs[0].scored = false;          // s01
  v2.docs[1].split = 'heldout';       // s02
  v2.docs[2].split = 'dev';           // s03
  assert.deepEqual(filterGolden(v2, { split: 'all' }).docs.map(d => d.doc_id), ['s02', 's03']);
  assert.deepEqual(filterGolden(v2, { split: 'dev' }).docs.map(d => d.doc_id), ['s03']);
  assert.deepEqual(filterGolden(v2, { split: 'heldout' }).docs.map(d => d.doc_id), ['s02']);
  // scoredOnly:false is an explicit opt-in (run-current.mjs's --include-unscored) —
  // s01 (scored:false) comes back once asked for.
  assert.deepEqual(filterGolden(v2, { split: 'all', scoredOnly: false }).docs.map(d => d.doc_id).sort(), ['s01', 's02', 's03']);
});

test('templateBreakdown groups by the golden doc\'s template, bare id only', () => {
  const v2 = structuredClone(golden);
  v2.docs[0].template = 'T01'; v2.docs[1].template = 'T01'; v2.docs[2].template = 'T02';
  const scored = scoreRun(v2, results);
  const bt = templateBreakdown(v2, scored.docs);
  assert.deepEqual(Object.keys(bt).sort(), ['T01', 'T02']);
  assert.equal(bt.T01.documents, 2);
  assert.equal(bt.T02.documents, 1);
});

test('--aggregate-only output carries no values', () => {
  const scored = scoreRun(golden, results);
  const txt = formatReport(aggregate(scored), scored, { aggregateOnly: true });
  assert.ok(!txt.includes('recSynth'));
  assert.ok(!txt.includes('B-77'));
  const full = formatReport(aggregate(scored), scored);
  assert.ok(full.includes('expected='));
});
