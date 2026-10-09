// 067 (why a stop was late and whose it was: order_stops.delay_reason / delay_note / generated
// delay_responsibility + 3 CHECKs), proved at build time (principle 6) - the evening run should only ever
// confirm what these tests already know.
// 1. The 067 dry run is GENERATED from 067 (same idea as 060/063/066): a hand-edited or stale copy would
//    «prove» statements the owner will never run (principle 3).
// 2. 067 stays ONE DO block, ASCII only, lock_timeout 5 s, guards on 35 triggers = B-54, and names no
//    auditor id but B-54 (B-66..B-76 are 062's, B-77 is 066's).
// 3. THE LIST: 067's CASE holds exactly the 17 codes the owner approved 9/10, each with its responsibility; the
//    rules test expects the same list; the rollback pins the same fingerprints as 067's proofs.
// 4. The ALTER TABLE of 067, run on the auditor's order_stops: every code gets its responsibility, an unknown
//    code / «other» without a note / a reason on a stop that is not Delayed / a lone note are refused, the
//    responsibility is not writable, the correction to On Time works only by clearing reason and note.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { buildDryRun, SOURCE, TARGET, DRAFTS } from '../../worker/migrations/drafts/tools/build-067-dryrun.mjs';
import { freshDb } from './helpers.mjs';

const OPEN = '\nDO $do$\n';
const nonAscii = (s) => [...s].filter((c) => c.charCodeAt(0) > 127);
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');

// The owner-approved list (9/10, Pantelis): code -> responsibility. The front constant
// (modules/daily_ops.js OPS_DELAY) is pinned to 067's CASE by tests/daily-ops-delay.test.js.
const APPROVED = {
  vehicle_breakdown: 'us', driver_hours: 'us', planning_error: 'us', previous_stop: 'us',
  cargo_not_ready: 'client', loading_wait: 'client', order_change: 'client', missing_docs: 'client',
  unloading_wait: 'consignee', closed_refused: 'consignee',
  border_queue: 'borders', customs: 'borders',
  traffic: 'external', weather: 'external', ferry_train: 'external', strike_roads: 'external',
  other: 'other',
};
// The CASE of 067: the lines between "GENERATED ALWAYS AS (CASE delay_reason" and "END) STORED".
function caseOf(src) {
  const a = src.indexOf('GENERATED ALWAYS AS (CASE delay_reason');
  const b = src.indexOf('END) STORED', a);
  assert.ok(a > 0 && b > a, 'the generated CASE of 067 not found');
  const out = {};
  for (const m of src.slice(a, b).matchAll(/WHEN '([a-z_]+)' THEN '([a-z]+)'/g)) {
    assert.ok(!(m[1] in out), `code ${m[1]} twice in the CASE`);
    out[m[1]] = m[2];
  }
  return out;
}
const alterOf = (src) => {
  const a = src.indexOf('  ALTER TABLE public.order_stops\n    ADD COLUMN delay_reason text,');
  const b = src.indexOf(';\n', a);
  assert.ok(a > 0 && b > a, 'the ALTER TABLE of 067 not found');
  return src.slice(a, b + 1);
};

test('067 dry run is regenerated from 067, never hand-edited (run: node worker/migrations/drafts/tools/build-067-dryrun.mjs)', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  assert.equal(fs.readFileSync(TARGET, 'utf8'), buildDryRun(src));
});

test('067, its dry run, rules test and rollback: ONE DO block each, ASCII only, lock_timeout 5 s', () => {
  for (const f of ['067_stop_delay_reason.sql', '067_stop_delay_reason_dryrun.sql', '067_stop_delay_reason_test.sql', '067_stop_delay_reason_rollback.sql']) {
    const s = read(f);
    assert.deepEqual(nonAscii(s), [], `${f} must stay ASCII`);
    assert.equal((s.match(/^DO \$/gm) || []).length, 1, `${f} must stay ONE DO block`);
    assert.match(s, /set_config\('lock_timeout', '5s', true\)/, `${f}: lock_timeout 5 s`);
  }
  const src = read('067_stop_delay_reason.sql');
  assert.match(src, /IF trg_before <> 35 OR b54_before IS DISTINCT FROM 35 OR b54_baseline IS NOT NULL THEN/);
  assert.deepEqual([...new Set(src.slice(src.indexOf(OPEN)).match(/\bB-\d\d\b/g))].sort(), ['B-54']);
  assert.ok(!/\bGRANT\b|\bREVOKE\b/.test(src.slice(src.indexOf(OPEN))), '067 grants nothing (born closed)');
});

test('THE LIST: 067\'s CASE = the 17 approved codes with their responsibilities; rules test and rollback agree', () => {
  const src = read('067_stop_delay_reason.sql');
  assert.deepEqual(caseOf(src), APPROVED);
  assert.equal(Object.keys(APPROVED).length, 17);
  // the rules test expects the same list, in the same order
  const t = read('067_stop_delay_reason_test.sql');
  const exp = Object.fromEntries([...t.matchAll(/\['([a-z_]+)', '([a-z]+)'\]/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(exp, APPROVED);
  // the fingerprints 067 proves are the ones its rollback checks before undoing
  const md5s = (s) => [...new Set(s.match(/'[0-9a-f]{32}'/g))].sort();
  assert.deepEqual(md5s(read('067_stop_delay_reason_rollback.sql')), md5s(src));
  for (const n of ['order_stops_delay_reason_check', 'order_stops_delay_other_note_check', 'order_stops_delay_only_delayed_check']) {
    assert.ok(src.includes('ADD CONSTRAINT ' + n), n);
    assert.ok(read('067_stop_delay_reason_rollback.sql').includes('DROP CONSTRAINT ' + n), 'rollback drops ' + n);
  }
});

test('067\'s ALTER TABLE on order_stops: the rules hold on real writes', async () => {
  const db = await freshDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const refused = async (sql, p) => { try { await db.query(sql, p); return null; } catch (e) { return e.constraint || e.code; } };
  await db.exec(`ALTER TABLE public.order_stops ADD CONSTRAINT order_stops_performance_check CHECK (performance = ANY (ARRAY['On Time'::text, 'Delayed'::text]));
    INSERT INTO public.order_stops (legacy_id, stop_type, performance) VALUES ('recTESTold1', 'Unloading', 'Delayed'), ('recTESTold2', 'Loading', 'On Time'), ('recTESTold3', 'Loading', NULL);`);
  await db.exec(alterOf(read('067_stop_delay_reason.sql')));
  // the existing rows: untouched, nothing derived
  assert.deepEqual(await q(`SELECT count(*)::int n FROM order_stops WHERE delay_reason IS NOT NULL OR delay_responsibility IS NOT NULL`), [{ n: 0 }]);
  for (const [code, resp] of Object.entries(APPROVED)) {
    const r = await q(`INSERT INTO order_stops (legacy_id, performance, delay_reason, delay_note) VALUES ($1, 'Delayed', $2, $3) RETURNING delay_responsibility`,
      ['recTEST-' + code, code, code === 'other' ? 'TEST note' : null]);
    assert.equal(r[0].delay_responsibility, resp, code);
  }
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_reason) VALUES ('recTESTx1', 'Delayed', 'lost_keys')`), 'order_stops_delay_reason_check');
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_reason) VALUES ('recTESTx2', 'Delayed', '')`), 'order_stops_delay_reason_check');
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_reason) VALUES ('recTESTx3', 'Delayed', 'other')`), 'order_stops_delay_other_note_check');
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_reason, delay_note) VALUES ('recTESTx4', 'Delayed', 'other', E' \\t\\n')`), 'order_stops_delay_other_note_check');
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_reason) VALUES ('recTESTx5', 'On Time', 'traffic')`), 'order_stops_delay_only_delayed_check');
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_reason) VALUES ('recTESTx6', NULL, 'traffic')`), 'order_stops_delay_only_delayed_check');
  assert.equal(await refused(`INSERT INTO order_stops (legacy_id, performance, delay_note) VALUES ('recTESTx7', 'Delayed', 'lone')`), 'order_stops_delay_only_delayed_check');
  assert.equal(await refused(`UPDATE order_stops SET delay_responsibility = 'us' WHERE legacy_id = 'recTEST-traffic'`), '428C9');
  // the correction to On Time: only by clearing reason and note in the same write
  assert.equal(await refused(`UPDATE order_stops SET performance = 'On Time' WHERE legacy_id = 'recTEST-traffic'`), 'order_stops_delay_only_delayed_check');
  const c = await q(`UPDATE order_stops SET performance = 'On Time', delay_reason = NULL, delay_note = NULL WHERE legacy_id = 'recTEST-traffic' RETURNING delay_responsibility`);
  assert.equal(c[0].delay_responsibility, null);
  // Delayed with no reason stays allowed (the 2 rows of 9/10, today's Daily Ops, a lot's late intake)
  assert.deepEqual(await q(`SELECT count(*)::int n FROM order_stops WHERE legacy_id = 'recTESTold1' AND performance = 'Delayed' AND delay_reason IS NULL`), [{ n: 1 }]);
  await db.close();
});
