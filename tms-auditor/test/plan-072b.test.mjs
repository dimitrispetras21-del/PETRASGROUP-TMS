// 072b (national v5 vehicle handover: segments) on a production-shaped PGlite copy, at build time (principle 6).
// Lives in tms-auditor/test/ (Task B1 moves it there from docs/national-v5/handover/tests/, git mv).
// Production shape = the same as plan-072.test.mjs (the 22/9 columns + live-071.sql + live-072.sql, 071 and 071b as
// executed 22/10) + 072 as executed 26/10 (worker/migrations/), then 072b. Never edit a fixture by hand.
// What it proves: the guards hold the texts 072b was written against; the dry run keeps nothing; 072b applies with
// +4 triggers and B-54 following; the verify row; born closed for the API roles; the 153 rules; F2's 237 rules, 071's
// 56 and 071b's 8 still pass ON TOP of 072b (the EXCLUDE moved, the 20 hooks changed nothing F2 decided); the three
// auditor checks go the PRODUCTION path (review R4, finding 1): each passes the repo lint (lintSql) and the in-DB
// guard (monitoring.check_sql_guard), is seeded as 073b will seed it and run by monitoring.run_checks as
// tms_check_runner through 072b's own policy (no policy made by the test, review R1 finding 4): green on the copy,
// red on a forced violation - also when the copy rt_cancelled drifts and blinds the EXCLUDE (review R2, DB finding
// 3); a lag() put back into B-91 is refused by both guards (a mutation); 071b's verify finds the EXCLUDE on the
// segments (review R2, spec E2); the rollback refuses (a v5 row, 073 present), then undoes the 20 hooks in reverse
// and returns every hooked function and both EXCLUDE byte for byte; fifteen mutations that each make one case fail,
// and six on the live hooked functions (a hook's own text is pinned by its md5, so it cannot be mutated in the source).
// The checks live in tms-auditor/checks-072b/ until 073b moves them into the catalog (plan: the handover to F3, P3-6): in checks/ they
// would enter the 047b seed and the catalog tests before the fixture and the grants know rt_vehicle_segments.
// Limits (as plan-072): money views are STUBS; the capture holds only the functions of its f/trg lists.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onlyChecks } from './helpers.mjs';
import { prodShaped072, TRG } from './prod-shaped-072.mjs';
import { DRAFTS } from '../lib/db.mjs';
import { parseCheck, seedSql } from '../checks/load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');          // 072b: drafts until executed
const readDone = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8'); // 071 / 071b executed 22/10, 072 26/10
// B-91..B-93: tms-auditor/checks-072b/ after Task B1, OUT of the catalog until 073b (review R4, finding 1);
// HANDOVER_CHECKS=docs/national-v5/handover/checks before it
const CHECKS = process.env.HANDOVER_CHECKS || path.join(HERE, '..', 'checks-072b');

const PLAN_FNS = `SELECT count(*)::int AS n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\\_%'`;
const EXCL = `SELECT conrelid::regclass::text || ':' || pg_get_constraintdef(oid) AS d FROM pg_constraint
  WHERE conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') ORDER BY conname`;
const HOOKED = ['public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', 'public.plan_h_finish()',
  'public.plan_rt_update(jsonb,text,text)', 'public.plan_rt_clear(jsonb,text,text)', 'public.plan_board(date,text)',
  'public.plan_vs_state(bigint[])', 'public.plan_local_loading(jsonb,text,text)',
  'public.plan_h_drop_consequences(bigint[],bigint,bigint[])', 'public.plan_move_pieces(jsonb,text,text)',
  'public.plan_delete(jsonb,text,text)'];

async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);
const md5Of = async (db, sig) => (await db.query('SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig])).rows[0]?.m;
const rules = (name) => new RegExp(`RULES TEST ${name} finished - EVERYTHING UNDONE, nothing kept\\. Result: (\\d+) OK, (\\d+) FAIL`);
// the pairs of PART 0 of 072b, read from the migration itself (one source; the build test holds them equal)
function guardPairs(src) {
  const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
  return [...part0.matchAll(/\('(public\.[^']+)', '([0-9a-f]{32})'\)/g)].map((m) => [m[1], m[2]]);
}
const firstSelect = (sql) => sql.split('-- @ids')[0].split('\n').filter((l) => !l.startsWith('--')).join('\n');
async function asRunner(db, sql) {
  await db.exec('SET ROLE tms_check_runner');
  try { return Number((await db.query(sql)).rows[0].count); } finally { await db.exec('RESET ROLE'); }
}
// Review R4 (finding 1): a check reaches production only through the repo lint (load.mjs), the 047b seed and
// monitoring.run_checks, which calls monitoring.check_sql_guard and runs it as tms_check_runner. The raw SELECT
// skipped all of that and proved a lag() / tstzrange() check that production would never run. This is that path.
async function viaAuditor(db, files) {
  const checks = files.map(([id, text]) => {
    const { check, errs } = parseCheck(`${id}.sql`, text);
    assert.deepEqual(errs, [], `${id}: the repo lint (load.mjs): ${errs.join('; ')}`);
    return check;
  });
  for (const c of checks) {
    await db.query('SELECT monitoring.check_sql_guard($1)', [c.sql]);
    if (c.ids_sql) await db.query('SELECT monitoring.check_sql_guard($1)', [c.ids_sql]);
  }
  await db.exec(seedSql(checks));
  await onlyChecks(db, checks.map((c) => c.id));
}
async function runAuditor(db) {
  const out = {};
  for (const tag of ['hourly', 'daily']) {
    const run = (await db.query('SELECT monitoring.run_checks($1) AS r', [tag])).rows[0].r;
    for (const x of (await db.query('SELECT check_id, status, value, err FROM monitoring.results WHERE run_id = $1', [run])).rows) {
      out[x.check_id] = x;
    }
  }
  return out;
}
const CHECK_TEXT = (id) => fs.readFileSync(path.join(CHECKS, `${id}.sql`), 'utf8');

test('072b on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped072();
  const triggers = await count(db, TRG);
  const src = read('072b_plan_vehicle_segments.sql');
  const md5Before = Object.fromEntries(await Promise.all(HOOKED.map(async (s) => [s, await md5Of(db, s)])));
  const exclBefore = (await db.query(EXCL)).rows.map((r) => r.d);
  // the owner's eye (K-H2 Steps 1 and 5): the fingerprint row is the same before and after 072b, read_at aside
  const fingerprint = async () => { const f = (await db.query(read('072b_plan_vehicle_segments_fingerprint.sql'))).rows[0]; delete f.read_at_athens; return f; };
  const fp0 = await fingerprint();

  await t.test('the copy holds every text 072b guards on (re-capture or re-measure if this fails)', async () => {
    const pairs = guardPairs(src);
    assert.equal(pairs.length, 47, '22 of 072 + 25 of 072 that 072b hooks (10), calls or relies on (15)');
    for (const [sig, m] of pairs) assert.equal(await md5Of(db, sig), m, sig);
    assert.equal(await count(db, PLAN_FNS), 54, '6 of 071 + 48 of 072');
    assert.deepEqual(exclBefore.map((d) => d.split(':')[0]), ['ct_round_trips', 'ct_round_trips']);
    const v = (await db.query(readDone('071b_plan_one_vehicle_verify.sql'))).rows[0];
    assert.deepEqual([v.truck_once, v.driver_once, v.exclude_on, Number(v.truck_overlaps), Number(v.driver_overlaps)],
      [true, true, 'ct_round_trips', 0, 0], '071b verify before 072b');
  });

  await t.test('072b dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read('072b_plan_vehicle_segments_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 072b finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}072b ran: segments table yes, exclude on segments 2, on cycles 0, hooked functions 10, acts 3, open to API 0, auditor policy 1, triggers \d+, B-54 \d+, v5 rows 0/, msg);
    const [, trg, b54] = /triggers (\d+), B-54 (\d+)/.exec(msg);
    assert.equal(Number(trg), triggers + 4); assert.equal(Number(b54), triggers + 4);
    assert.equal(await count(db, PLAN_FNS), 54, 'nothing kept');
    assert.equal(await count(db, TRG), triggers);
    assert.deepEqual((await db.query(EXCL)).rows.map((r) => r.d), exclBefore);
  });

  await t.test('072b applies: +4 triggers, B-54 follows, the EXCLUDE on the segments', async () => {
    assert.equal(await errorOf(db, src), null);
    assert.equal(await count(db, TRG), triggers + 4);
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), triggers + 4);
    assert.equal(await count(db, PLAN_FNS), 54 + 25);
    assert.deepEqual((await db.query(EXCL)).rows.map((r) => r.d.split(':')[0]), ['rt_vehicle_segments', 'rt_vehicle_segments']);
    assert.match(await errorOf(db, src) ?? '', /072b: already applied/, 'a second run refuses');
    assert.deepEqual(await fingerprint(), fp0, 'the fingerprint row is the same after 072b');
  });

  await t.test('072b verify: in place, 10 hooked functions at their final text, 0 changed, closed, the auditor policy, 0 rows', async () => {
    const r = (await db.query(read('072b_plan_vehicle_segments_verify.sql'))).rows[0];
    assert.equal(r.applied, '072b in place');
    assert.equal(r.b54_matches, true);
    for (const [k, v] of [['exclude_on_segments', 2], ['hooks_in_place', 10], ['public_acts', 3], ['new_triggers', 4], ['auditor_policy', 1]]) assert.equal(Number(r[k]), v, k);
    for (const k of ['exclude_on_cycles', 'changed_live', 'open_to_api', 'open_relations', 'rls_off', 'other_policies', 'segments',
      'v5_cycles', 'seg_problems', 'overlaps', 'cancel_copy_drift']) assert.equal(Number(r[k]), 0, k);
    // 072's own verify after 072b, as the plan writes it (Interfaces): changed_live 0, 19 executable plan_*, 79 plan_*
    const v = (await db.query(readDone('072_plan_functions_verify.sql'))).rows[0];
    assert.equal(v.applied, '072 in place');
    assert.equal(Number(v.changed_live), 0);
    assert.equal(Number(v.service_role_execute), 19);
    assert.equal(Number(v.plan_functions), 79);
    // 071b's verify after 072b (review R2, spec E2): the rule is in place, on the segments; the cycle counts are NULL
    const w = (await db.query(readDone('071b_plan_one_vehicle_verify.sql'))).rows[0];
    assert.deepEqual([w.truck_once, w.driver_once, w.exclude_on, w.truck_overlaps, w.driver_overlaps],
      [true, true, 'rt_vehicle_segments', null, null], '071b verify after 072b');
  });

  await t.test('the API roles: service_role reaches only the three acts; anon nothing', async () => {
    await db.exec('SET ROLE service_role');
    try {
      await assert.rejects(db.query(`SELECT public.plan_seg_change('{}'::jsonb, 'x', 'owner')`), /plan rule broken: bad_input|vehicle/);
      await assert.rejects(db.query(`SELECT public.plan_h_seg_json(1)`), /permission denied/);
      await assert.rejects(db.query(`SELECT public.plan_seg_problem(1)`), /permission denied/);
      await assert.rejects(db.query(`INSERT INTO public.rt_vehicle_segments (rt_id, from_at, to_at, trip_type, created_by) VALUES (1, now(), now(), 'OWNED', 'x')`), /permission denied/);
      // coordinator 26/10 (review of the live F2 Worker): a direct write to the FIRST segment would be copied onto the
      // cycle by plan_seg_copy without plan_seg_fix's payroll_locked. No API role can make it: service_role (the
      // Worker's key) holds SELECT only, so the vehicle of a v5 cycle changes through the three acts or not at all
      await assert.rejects(db.query(`UPDATE public.rt_vehicle_segments SET driver_id = 1`), /permission denied/);
      await assert.rejects(db.query(`DELETE FROM public.rt_vehicle_segments`), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
    await db.exec('SET ROLE anon');
    try {
      await assert.rejects(db.query(`SELECT public.plan_seg_remove('{}'::jsonb, 'x', 'owner')`), /permission denied/);
      await assert.rejects(db.query(`SELECT count(*) FROM public.rt_vehicle_segments`), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
  });

  await t.test('072b rules test: 153 OK, 0 FAIL, nothing kept', async () => {
    const msg = await errorOf(db, read('072b_plan_vehicle_segments_test.sql'));
    const m = rules('072b').exec(msg ?? '');
    assert.ok(m, msg);
    assert.equal(Number(m[2]), 0, msg);
    assert.equal(Number(m[1]), 153);
    assert.equal(await count(db, `SELECT count(*)::int AS n FROM rt_vehicle_segments`), 0, 'the test keeps nothing');
  });

  await t.test('F2 still holds ON TOP of 072b: 072 rules 237, 071 rules 56, 071b rules 8', async () => {
    for (const [file, name, n, own] of [['072_plan_functions_test.sql', '072', 237, readDone], ['071_plan_schema_test.sql', '071', 56, readDone],
      ['071b_plan_one_vehicle_test.sql', '071b', 8, readDone]]) {
      const msg = await errorOf(db, own(file));
      const m = rules(name).exec(msg ?? '');
      assert.ok(m, `${file}: ${msg}`);
      assert.deepEqual([Number(m[1]), Number(m[2])], [n, 0], `${file}: ${msg?.slice(0, 600)}`);
    }
  });

  await t.test('the auditor checks B-91..B-93 the production way (lint, guard, seed, run_checks as tms_check_runner) through 072b\'s own policy: green on the copy, red on a forced violation', async () => {
    // NO policy made here (review R1 finding 4): 072b's monitor_read is the only door; without it the runner would
    // see 0 segments, B-91 would be red on every v5 cycle and B-92 / B-93 silently green
    assert.equal(await count(db, `SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'rt_vehicle_segments'`), 1);
    const ids = ['B-91', 'B-92', 'B-93'];
    const q = Object.fromEntries(ids.map((id) => [id, firstSelect(CHECK_TEXT(id))]));
    await db.exec('BEGIN');
    try {
      await viaAuditor(db, ids.map((id) => [id, CHECK_TEXT(id)]));
      const res = await runAuditor(db);
      for (const id of ids) assert.deepEqual([res[id]?.status, Number(res[id]?.value), res[id]?.err ?? null], ['green', 0, null], `${id} green through run_checks`);
    } finally { await db.exec('ROLLBACK'); }
    const seed = `
      INSERT INTO trucks (license_plate) VALUES ('TEST-CHK-1'); INSERT INTO drivers (full_name) VALUES ('TEST CHK');
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at, status, source, created_by)
      SELECT 2, 'NATL', 'OWNED', (SELECT id FROM trucks WHERE license_plate = 'TEST-CHK-1'), (SELECT id FROM drivers WHERE full_name = 'TEST CHK'),
             current_date + 60, current_date + 60, (current_date + 60)::timestamptz, (current_date + 60)::timestamptz + interval '8 hours',
             'planned', 'planner', 'test:chk';`;
    // B-91: a gap - the COMMIT rule off (the trigger disabled inside the test transaction only)
    for (const [id, broken] of [
      ['B-91', `ALTER TABLE rt_vehicle_segments DISABLE TRIGGER plan_seg_verify;
                UPDATE rt_vehicle_segments SET to_at = to_at - interval '1 hour' WHERE created_by = 'test:chk';`],
      ['B-92', `ALTER TABLE rt_vehicle_segments DROP CONSTRAINT rt_v2_truck_once;
                ALTER TABLE rt_vehicle_segments DISABLE TRIGGER plan_seg_verify;
                INSERT INTO rt_vehicle_segments (rt_id, from_at, to_at, trip_type, truck_id, created_by)
                SELECT rt_id, from_at, to_at, 'OWNED', truck_id, 'test:chk2' FROM rt_vehicle_segments WHERE created_by = 'test:chk';`],
      ['B-93', `ALTER TABLE rt_vehicle_segments DROP CONSTRAINT seg_other_note;
                ALTER TABLE rt_vehicle_segments DISABLE TRIGGER plan_seg_verify;
                UPDATE rt_vehicle_segments SET reason = 'other', place_note = 'x' WHERE created_by = 'test:chk';`],
      // review R2, DB finding 3: the copy rt_cancelled drifts to true on a live cycle (the COMMIT rule off): B-91 reads
      // it against the status ...
      ['B-91', `ALTER TABLE rt_vehicle_segments DISABLE TRIGGER plan_seg_verify;
                UPDATE rt_vehicle_segments SET rt_cancelled = true WHERE created_by = 'test:chk';`],
      // ... and the drifted copy blinds the EXCLUDE (it filters on the copy): a second live segment of the same truck
      // at the same time is accepted; B-92 reads the cycle's status, so it is red
      ['B-92', `ALTER TABLE rt_vehicle_segments DISABLE TRIGGER plan_seg_verify;
                UPDATE rt_vehicle_segments SET rt_cancelled = true WHERE created_by = 'test:chk';
                INSERT INTO rt_vehicle_segments (rt_id, from_at, to_at, trip_type, truck_id, created_by)
                SELECT rt_id, from_at, to_at, 'OWNED', truck_id, 'test:chk2' FROM rt_vehicle_segments WHERE created_by = 'test:chk';`]]) {
      await db.exec('BEGIN');
      try {
        await viaAuditor(db, ids.map((x) => [x, CHECK_TEXT(x)]));
        await db.exec(seed);
        await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
        // the runner sees the seeded cycle's segment, and B-91 is green on it before the violation
        assert.equal(await asRunner(db, `SELECT count(*) FROM rt_vehicle_segments WHERE created_by = 'test:chk'`), 1, 'the runner sees the segment');
        assert.equal((await runAuditor(db))['B-91'].status, 'green', 'B-91 green on a cycle with its segment');
        await db.exec(broken);
        const res = await runAuditor(db);
        assert.ok(res[id].status === 'red' && Number(res[id].value) > 0, `${id} red on its violation through run_checks: ${JSON.stringify(res[id])}`);
        assert.ok(await asRunner(db, q[id]) > 0, `${id} red on its violation (the raw SELECT agrees)`);
      } finally { await db.exec('ROLLBACK'); }
    }
    for (const id of Object.keys(q)) assert.equal(await asRunner(db, q[id]), 0, `${id} green again`);
  });

  await t.test('072b rollback: refuses with a v5 row and with 073; then the 20 hooks out in reverse, both EXCLUDE back; 072b again', async () => {
    const rb = read('072b_plan_vehicle_segments_rollback.sql');
    await db.exec(`INSERT INTO plan_notices (to_desk, kind, message, created_by) VALUES ('natl', 'test_notice', 'TEST 072b', 'test:072b')`);
    assert.match(await errorOf(db, rb) ?? '', /1 v5 row\(s\) or segment\(s\) exist/);
    await db.exec(`DELETE FROM plan_notices WHERE created_by = 'test:072b'`);
    await db.exec(`CREATE FUNCTION public.plan_h_pallet_sync() RETURNS void LANGUAGE sql AS 'select'`);
    assert.match(await errorOf(db, rb) ?? '', /073 is applied - run the rollback of 073 first/);
    await db.exec(`DROP FUNCTION public.plan_h_pallet_sync()`);
    assert.equal(await errorOf(db, rb), null);
    for (const s of HOOKED) assert.equal(await md5Of(db, s), md5Before[s], `${s} back to 072's text`);
    assert.deepEqual((await db.query(EXCL)).rows.map((r) => r.d), exclBefore, 'the EXCLUDE of 071b back, word for word');
    assert.equal(await count(db, PLAN_FNS), 54);
    assert.equal(await count(db, TRG), triggers);
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), triggers);
    assert.equal(await count(db, `SELECT count(*)::int AS n FROM pg_class WHERE relname = 'rt_vehicle_segments'`), 0);
    const m = rules('072').exec(await errorOf(db, readDone('072_plan_functions_test.sql')) ?? '');
    assert.deepEqual([Number(m[1]), Number(m[2])], [237, 0], 'F2 rules after the rollback');
    assert.equal(await errorOf(db, src), null, 'reversible: 072b applies again');
    assert.equal((await db.query(read('072b_plan_vehicle_segments_verify.sql'))).rows[0].applied, '072b in place');
  });
});

// R-1 and R-13: 072b runs only after 072, and only while there is no v5 row (the EXCLUDE move needs 0 v5 cycles)
test('072b refuses without 072, and with a v5 row; nothing kept either time', async () => {
  let db = await prodShaped072(false);
  assert.match(await errorOf(db, read('072b_plan_vehicle_segments.sql')) ?? '', /072b: 072 is not applied - run 072 first/);
  assert.equal(await count(db, `SELECT count(*)::int AS n FROM pg_class WHERE relname = 'rt_vehicle_segments'`), 0);
  db = await prodShaped072();
  await db.exec(`INSERT INTO plan_notices (to_desk, kind, message, created_by) VALUES ('natl', 'test_notice', 'TEST 072b', 'test:072b')`);
  assert.match(await errorOf(db, read('072b_plan_vehicle_segments.sql')) ?? '', /072b: 1 v5 row\(s\) exist - the EXCLUDE move needs 0 v5 cycles/);
  assert.deepEqual((await db.query(EXCL)).rows.map((r) => r.d.split(':')[0]), ['ct_round_trips', 'ct_round_trips'], 'the EXCLUDE stay on the cycles');
});

// A test that cannot fail proves nothing: each mutation takes one rule out and exactly its case must fail.
for (const [name, from, to, want] of [
  ['the window edges do not follow', /-- mut:edges-begin[\s\S]*?-- mut:edges-end/, '-- (mutated: no edge follow)', /24 FAIL want ok/],
  ['a gap is not refused', /-- mut:cover-begin[\s\S]*?-- mut:cover-end/, '-- (mutated: no cover rule)', /21 FAIL want plan:seg_cover/],
  // review R1 finding 2: the v1 warning read on the cycle's copy (the ARCHIKO) instead of each segment
  ['the v1 warning reads the ARCHIKO\'s copy', /-- mut:v1-begin[\s\S]*?-- mut:v1-end/,
   "join ct_round_trips cc on cc.id = g.rt_id cross join lateral jsonb_array_elements(plan_h_v1_warn(cc.truck_id, cc.date_start, cc.date_end, p_rt)) x(w)",
   /73 FAIL want ok/],
  // review R1 finding 3: the stop rule read on the departure (planned_to) instead of the arrival
  ['the stop rule reads the departure', /-- mut:stop-begin[\s\S]*?-- mut:stop-end/,
   'and g.from_at <= s.planned_to and g.to_at > s.planned_to', /54 FAIL want ok/],
  // review R2, DB finding 1: without its own code the narrowed cycle is a bare seg_time again (now the net, case 111)
  ['a narrowed cycle is not seg_outside', /-- mut:outside-begin[\s\S]*?-- mut:outside-end/, '-- (mutated: no seg_outside)',
   /111 FAIL want plan:seg_outside got plan:net_detail_wrong \(net: plan:seg_time/],
  // owner question 7 = (b): without the seg_removed lines there is nothing to confirm - the change runs without a
  // token and the net refuses it at the end
  ['the list names no handover', /-- mut:cutlist-begin[\s\S]*?-- mut:cutlist-end/, 'and false',
   /25 FAIL want plan:need_token got plan:seg_outside/],
  // ... and with the lines but no removal after the token, the act the user confirmed is refused
  ['the token removes nothing', /-- mut:cutapply-begin[\s\S]*?-- mut:cutapply-end/, '-- (mutated: no removal)',
   /87 FAIL want ok got plan:seg_outside/],
  // review R2, DB finding 2: the payroll lock without "the driver leaves the cycle" refuses the same-driver correction
  ['the payroll lock ignores a driver who stays', /-- mut:leaves-begin[\s\S]*?-- mut:leaves-end/, '-- (mutated: no leaves)',
   /92 FAIL want ok got plan:payroll_locked/],
  // review R3, DB finding 2: every segment that holds the old end follows it - a swap through the handover time breaks the chain
  ['the end takes every segment that holds it', /-- mut:oneedge-begin[\s\S]*?-- mut:oneedge-end/,
   'where rt_id = new.id and deleted_at is null and to_at = old.end_at', /103 FAIL want ok got plan:seg_cover/],
  // re-proof of review R3: the copy takes the LATER of two segments at the start - the TELIKO's driver for a moment
  ['the copy takes the later segment at the start', /-- mut:copyfirst-begin[\s\S]*?-- mut:copyfirst-end/,
   'order by s.to_at desc, s.id limit 1;', /104 FAIL want ok got FAIL start edge/],
  // review R5 (both critics): a side moved within its own cycle, the target not read as a source - the net refuses
  // the Move the owner's answer says to list (the exception (b) does not have)
  ['the target that is also a source is not read', /-- mut:keep-begin[\s\S]*?-- mut:keep-end/,
   'v_s := null;', /117 FAIL want ok got plan:seg_outside/],
  // review R5 (DB finding 3): a stop named twice reaches the list again - the dry run answers without a refusal
  ['a stop named twice is not refused', /-- mut:twice-begin[\s\S]*?-- mut:twice-end/, '-- (mutated: twice allowed)',
   /118 FAIL want plan:bad_input got FAIL no error/],
  // review R6 (DB finding 1): every named stop counted as kept again - the dry run gives a token without the list, and
  // the net refuses the execution (the stop the put does not use is swept)
  ['a named stop the put does not use counts as kept', /-- mut:used-begin[\s\S]*?-- mut:used-end/,
   "v_used := (select array_agg((x->>'stop_id')::bigint) from jsonb_array_elements(v_stops) x where x ? 'stop_id');",
   /119 FAIL want ok got plan:seg_outside/],
  // review R6 (DB finding 2): the target that is also a source read only at its end - the narrowing from the start
  // is not listed, and the net refuses it
  ['the target that is also a source is read only at its end', /return plan_h_seg_cut_list\(p_keep, v_s, v_e\);/,
   "return plan_h_seg_cut_list(p_keep, '-infinity', v_e);", /120 FAIL want ok got plan:seg_outside/],
  // fix round 2 (26/10): the cut of a cycle the same act cancels writes its costs notice again - the desk reads the
  // same DKV line twice (the cancellation's notice already counts it)
  ['the cut tells the desk again about a cycle the act cancels', /-- mut:cancelnote-begin[\s\S]*?-- mut:cancelnote-end/, 'true',
   /136 FAIL want ok got FAIL notices/],
]) {
  test(`072b mutation: ${name}`, async () => {
    const db = await prodShaped072();
    const src = read('072b_plan_vehicle_segments.sql');
    const mutant = src.replace(from, to);
    assert.notStrictEqual(mutant, src, 'the mutation markers are in 072b');
    assert.equal(await errorOf(db, mutant), null);
    const msg = await errorOf(db, read('072b_plan_vehicle_segments_test.sql'));
    assert.match(msg ?? '', want, msg);
  });
}

// Fix round 2 (26/10): hooks 14 and 17 carry 072's OWN notice ids (the put's VS notice in a Move, the VS day's in
// plan_rt_update's step 6) beside the cut's. No case read them until 138 / 139: a broken hook that dropped them
// passed all 135 + 237 rules. A hook's text is pinned by its md5 (072b refuses a changed hook), so these break the LIVE
// function after 072b, as a hand edit would, and exactly that case must fail.
for (const [name, sig, from, to, want] of [
  ['a Move drops the put\'s own notice ids (hook 14)', 'public.plan_move_pieces(jsonb,text,text)',
   "coalesce(v_put->'notice_ids', '[]'::jsonb)", "'[]'::jsonb", /139 FAIL want ok got FAIL notice ids/],
  ['plan_rt_update drops the VS day\'s notice ids (hook 17)', 'public.plan_rt_update(jsonb,text,text)',
   'v_notices := v_notices || plan_h_vs_follow(', 'perform plan_h_vs_follow(', /138 FAIL want ok got FAIL notice ids/],
  // owner 26/10 ("in one step"): plan_rt_update that narrows past a handover AND changes the vehicle (hooks 5, 6, 19, 20)
  ['the vehicle is set before the listed handover goes (hook 6)', 'public.plan_rt_update(jsonb,text,text)',
   "      v_notices := v_notices || plan_h_seg_cut(v_cut, 'plan_rt_update', p_actor, p_role);\n      v_cut := null;\n", '',
   /147 FAIL want ok got FAIL owner:/],
  ['the vehicle change is not a line of the list (hook 5)', 'public.plan_rt_update(jsonb,text,text)',
   'if jsonb_array_length(v_cut) > 0 and v_keep is not null', 'if false and v_keep is not null', /150 FAIL want plan:stale_confirm/],
  ['072 judges the vehicle against the ARCHIKO, not the segment left (hook 19)', 'public.plan_rt_update(jsonb,text,text)',
   '  if v_keep is not null then\n    select g.trip_type', '  if false then\n    select g.trip_type', /148 FAIL want ok/],
  ['a listed payroll line still locks the driver change (hook 20)', 'public.plan_rt_update(jsonb,text,text)',
   "and not (e.id::text in (select c->>'dl_entry_id'", "and not (false and e.id::text in (select c->>'dl_entry_id'",
   /148 FAIL want ok got plan:payroll_locked/],
]) {
  test(`072b live mutation: ${name}`, async () => {
    const db = await prodShaped072();
    assert.equal(await errorOf(db, read('072b_plan_vehicle_segments.sql')), null);
    const def = (await db.query('SELECT pg_get_functiondef(to_regprocedure($1)) AS d', [sig])).rows[0].d;
    assert.equal(def.split(from).length, 2, `the hooked text is in ${sig} exactly once`);
    assert.equal(await errorOf(db, def.split(from).join(to)), null);
    const msg = await errorOf(db, read('072b_plan_vehicle_segments_test.sql'));
    assert.match(msg ?? '', want, msg);
  });
}

// Review R4 (finding 1): the v3 B-91 used lag() and B-92 tstzrange(); production's monitoring.check_sql_guard (and
// the repo lint) refuse both, so the two nets would have stood in run_checks as 'error' for ever while every proof
// was green on the raw SELECT. Put lag() back: the auditor path above must refuse it, at both guards.
test('auditor mutation: a lag() back in B-91 is refused by the repo lint and by the in-DB guard (run_checks: error)', async () => {
  const db = await prodShaped072();
  assert.equal(await errorOf(db, read('072b_plan_vehicle_segments.sql')), null);
  const text = CHECK_TEXT('B-91');
  const gap = /     OR \(g\.to_at <> r\.end_at AND NOT EXISTS \(SELECT 1 FROM rt_vehicle_segments h WHERE h\.rt_id = r\.id AND h\.deleted_at IS NULL\n\s+AND h\.from_at = g\.to_at\)\)\n/g;
  const mutant = text.replace(gap, '     OR g.from_at <> coalesce(lag(g.to_at) OVER (ORDER BY g.from_at, g.id), g.from_at)\n');
  assert.notStrictEqual(mutant, text, 'the gap clause of B-91 is where the mutation puts lag()');
  assert.deepEqual(parseCheck('B-91.sql', text).errs, [], 'the committed B-91 passes the lint');
  assert.match(parseCheck('B-91.sql', mutant).errs.join('; '), /function \u00ablag\(\)\u00bb not in allowlist/);
  await assert.rejects(viaAuditor(db, [['B-91', mutant]]), /lag/);
  const c = parseCheck('B-91.sql', mutant).check;
  await assert.rejects(db.query('SELECT monitoring.check_sql_guard($1)', [c.sql]), /function lag\(\) not allowed/);
  // seeded past the lint (as a hand-edited 047b would be), run_checks records it as an error, never a number
  await db.exec('BEGIN');
  try {
    await db.exec(seedSql([c]));
    await onlyChecks(db, ['B-91']);
    const res = await runAuditor(db);
    assert.deepEqual([res['B-91'].status, res['B-91'].value], ['error', null]);
    assert.match(res['B-91'].err, /lag\(\) not allowed/);
  } finally { await db.exec('ROLLBACK'); }
});
