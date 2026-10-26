// 073b (the auditor learns v5, spec 8) on the production-shaped PGlite copy of plan-073.test.mjs (ONE builder,
// prod-shaped-072.mjs with the live money views and 072b; then the v1 money fixture and 073): every check 073b seeds
// (F3's B-78..B-90 + B-94 and 072b's B-91..B-93, handover P3-6) is 0 on today's data (no false alarm before day L), and
// each enabled F3 check is RED in a scenario that breaks its rule. The owner's answers: B-79 compares with the X of
// the order (M-4 beta), so a change of X in the settings keeps it green and only a broken share rule turns it red;
// B-80 is DISABLED (M-5 delta) and is counted as such, never as red; B-90 stays (M-6 alpha). B-91..B-93 stay 0
// through the scenario: every cycle of it was written through the plan_* (the segments follow). Without the read
// policies the auditor's role sees no v5 row, so the same scenario stays green (why D-14 exists).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072 } from './prod-shaped-072.mjs';
import { DRAFTS, migrationFile } from '../lib/db.mjs';
import { IDS, F3_IDS, V5, RUNNER_FN } from '../../worker/migrations/drafts/tools/build-073b.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');                  // 072b / 073 / 073b: drafts/ until executed, then one up
const readDone = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');    // 071: executed 22/10
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');
const DISABLED = ['B-80'];   // M-5 delta (owner 24/10): a tautology until day L

async function prodShaped() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(read('073_plan_money.sql'));
  // the seed of the local catalog already holds the 17 (047b is generated from the files): take them out, as production
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [IDS]);
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const n = async (db, sql, p) => Number((await db.query(sql, p)).rows[0].n);
const canExec = async (db, role) => (await db.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS b`, [role, RUNNER_FN])).rows[0].b;
async function values(db, ids = IDS) {   // each check as the auditor's role, as run_checks does (the disabled one too)
  const out = {};
  for (const id of ids) {
    const { sql_text: sql } = (await db.query(`SELECT sql_text FROM monitoring.checks WHERE id = $1`, [id])).rows[0];
    await db.exec('SET ROLE tms_check_runner');
    try { out[id] = Number(Object.values((await db.query(sql)).rows[0])[0]); } finally { await db.exec('RESET ROLE'); }
  }
  return out;
}
async function runAll(db) {   // the production path: monitoring.run_checks for both tags, one row per check that ran
  const out = {};
  for (const tag of ['hourly', 'daily']) {
    const run = (await db.query('SELECT monitoring.run_checks($1) AS r', [tag])).rows[0].r;
    for (const x of (await db.query('SELECT check_id, status, value, err FROM monitoring.results WHERE run_id = $1 AND check_id = ANY($2)', [run, IDS])).rows) out[x.check_id] = x;
  }
  return out;
}
// One scenario that breaks every enabled F3 rule once (written with the plan_* where a rule allows it, directly where
// only a bypass can break it - that is what the check is for).
const SCENARIO = `DO $s$
DECLARE td date := (now() AT TIME ZONE 'Europe/Athens')::date; d date; hub bigint; la bigint; lb bigint; cl bigint; pa bigint; pa2 bigint; trk bigint; trk2 bigint;
  r jsonb; rtp bigint; nn bigint; lg bigint; vso bigint; vsb bigint; vsh bigint;
  f timestamptz; t timestamptz; lot_o bigint; lot bigint; nn2 bigint; sh2 bigint;
BEGIN
  d := td + 40; f := (d + time '06:00') AT TIME ZONE 'Europe/Athens'; t := (d + time '08:00') AT TIME ZONE 'Europe/Athens';
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec073bA', 'S073b A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec073bB', 'S073b B') RETURNING id INTO lb;
  INSERT INTO clients (company_name) VALUES ('S073b client') RETURNING id INTO cl;
  INSERT INTO partners (company_name) VALUES ('S073b partner') RETURNING id INTO pa;
  INSERT INTO trucks (license_plate) VALUES ('S073B-1') RETURNING id INTO trk;
  INSERT INTO trucks (license_plate) VALUES ('S073B-2') RETURNING id INTO trk2;
  -- B-82 an empty cycle (plan_rt_create alone, never through a plan_* that cancels it) ; B-83 a partner without a rate ;
  -- B-94 an invoice on that cycle naming a partner who drives none of its segments (only a bypass: the Worker refuses
  -- it, final review 26/10) - counted, replaces no rate, so the cycle stays B-83 too
  r := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk),
         'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'location_id', la, 'side', 'KATHODOS', 'planned_from', f, 'planned_to', t))), 's073b', 'owner');
  r := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pa),
         'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'location_id', la, 'side', 'KATHODOS', 'planned_from', f, 'planned_to', t))), 's073b', 'owner');
  rtp := (r->>'rt_id')::bigint;   -- plan_rt_create answers {rt_id} at the top (r->'ids' was null: never used before B-94)
  IF rtp IS NULL THEN RAISE EXCEPTION 'scenario: no rt_id from plan_rt_create'; END IF;
  INSERT INTO partners (company_name) VALUES ('S073b partner 2') RETURNING id INTO pa2;
  INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, pay_source, line_date, created_by, partner_id)
  VALUES (rtp, 'partner_rate', 280, 0, 'allocated', 'CREDIT', td, 's073b', pa2);
  PERFORM plan_h_finish();
  -- B-84 a cost line left on a cancelled trip
  INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, pay_source, line_date, created_by)
  SELECT id, 'fuel', 50, 12, 'allocated', 'DKV', td, 's073b' FROM ct_round_trips WHERE code = 'RT-T734';
  -- B-81 + B-90: a national whose day passed and still waits, with its price wiped later (a facade PATCH)
  r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid(), 'orders', jsonb_build_array(jsonb_build_object('client_id', cl, 'price', 100,
         'reference', 'S073b', 'temperature_c', 2, 'pallet_exchange', true, 'shipments', jsonb_build_array(jsonb_build_object(
         'origin_location_id', la, 'dest_location_id', lb, 'pallets', 5, 'load_from', f - interval '50 days', 'load_to', t - interval '50 days',
         'deliver_from', f - interval '49 days', 'deliver_to', t - interval '49 days'))))), 's073b', 'owner');
  nn := (r->'ids'->'nat_order_ids'->>0)::bigint;
  UPDATE national_orders SET price = 0 WHERE id = nn;
  -- B-78 (national half): the same national order also has a load of today's model
  INSERT INTO national_loads (legacy_id, source_type, source_national_order_id, status) VALUES ('rec073bNL2', 'National', nn, 'Pending');
  -- B-85 two temperatures 2 and 6 on one side ; B-88 the pending row of a leg that went around the plan
  r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid(), 'orders', jsonb_build_array(
         jsonb_build_object('client_id', cl, 'price', 50, 'reference', 'S073b', 'temperature_c', 2, 'pallet_exchange', true,
           'shipments', jsonb_build_array(jsonb_build_object('origin_location_id', la, 'dest_location_id', lb, 'pallets', 3,
             'load_from', f, 'load_to', t, 'deliver_from', f + interval '4 hours', 'deliver_to', t + interval '4 hours'))),
         jsonb_build_object('client_id', cl, 'price', 50, 'reference', 'S073b', 'temperature_c', 6,
           'shipments', jsonb_build_array(jsonb_build_object('origin_location_id', la, 'dest_location_id', lb, 'pallets', 3,
             'load_from', f, 'load_to', t, 'deliver_from', f + interval '4 hours', 'deliver_to', t + interval '4 hours'))),
         jsonb_build_object('client_id', cl, 'price', 50, 'reference', 'S073b', 'temperature_c', 2, 'pallet_exchange', true,
           'shipments', jsonb_build_array(jsonb_build_object('origin_location_id', la, 'dest_location_id', lb, 'pallets', 2,
             'load_from', f, 'load_to', t, 'deliver_from', f + interval '4 hours', 'deliver_to', t + interval '4 hours')))),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2), 'side', 'KATHODOS'),
         'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'location_id', la, 'side', 'KATHODOS', 'planned_from', f, 'planned_to', t),
                                    jsonb_build_object('ref', 'b', 'location_id', lb, 'side', 'KATHODOS', 'planned_from', f + interval '4 hours', 'planned_to', t + interval '4 hours'))),
         's073b', 'owner');
  lg := (r->'ids'->'leg_ids'->>2)::bigint;   -- the third order's leg: the other two keep the mix of B-85
  UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'bypass', deleted_by = 's073b' WHERE id = lg;
  -- B-86 a notice nobody read for 25 hours
  INSERT INTO plan_notices (to_desk, kind, message, created_by, created_at) VALUES ('natl', 'costs_without_rt', 'S073b', 's073b', now() - interval '25 hours');
  -- B-78 + B-89: a VS import with a bridge (two pieces, 6 + 4: B-79's mutation below needs two leaves) AND a Direct
  -- NL, and a v5 pallet row on its bridge leg
  SET CONSTRAINTS ALL DEFERRED;   -- plan_h_finish above left them IMMEDIATE for this transaction
  INSERT INTO orders (legacy_id, direction, status, veroia_switch, client_id, price, cross_dock_date, pallet_exchange)
  VALUES ('rec073bO1', 'Import', 'Pending', true, cl, 2000, d, true) RETURNING id INTO vso;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets) VALUES ('rec073bS1', 'Unloading', 1, d, vso, lb, 10) RETURNING id INTO vsb;
  INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vsb, 's073b') RETURNING id INTO vsh;
  INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (vsh, 6, 's073b'), (vsh, 4, 's073b');
  INSERT INTO national_loads (legacy_id, source_type, source_order_id, status) VALUES ('rec073bNL', 'Direct', vso, 'Pending');
  -- NOT B-90 (final review 26/10, finding 5): a national piece of a stock lot has no price by 057's own rule
  -- (stock_piece_no_money; its money is the lot's) - with v5 shipments it must never read as "without a price"
  INSERT INTO orders (legacy_id, order_type, direction, status, client_id, price, loading_datetime, delivery_datetime,
                      unloading_location_1_id, loading_pallets_1, reference)
  VALUES ('rec073bO2', 'International', 'Import', 'Delivered', cl, 900, td - 9, td - 6, la, 33, 'S073b') RETURNING id INTO lot_o;
  INSERT INTO stock_lots (legacy_id, order_id) VALUES ('rec073bL1', lot_o) RETURNING id INTO lot;
  INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, stock_lot_id, pickup_location_1_id)
  VALUES ('rec073bN2', cl, 'S073b', NULL, 4, lot, la) RETURNING id INTO nn2;
  INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from, deliver_to, created_by)
  VALUES (nn2, la, lb, 4, f, t, f + interval '4 hours', t + interval '4 hours', 's073b') RETURNING id INTO sh2;
  INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh2, 4, 's073b');
END $s$;`;
const SCENARIO2 = `DO $s$
DECLARE hub bigint; lb bigint; vpc bigint; r jsonb; lg bigint; cl bigint; d date := (now() AT TIME ZONE 'Europe/Athens')::date + 40;
  pd date := (now() AT TIME ZONE 'Europe/Athens')::date - 3; tr bigint;
BEGIN
  SELECT id INTO hub FROM locations WHERE is_hub;
  SELECT id INTO lb FROM locations WHERE legacy_id = 'rec073bB';
  SELECT id INTO cl FROM clients WHERE company_name = 'S073b client';
  SELECT p.id INTO vpc FROM shipment_pieces p JOIN shipments s ON s.id = p.shipment_id JOIN orders o ON o.id = s.order_id
   WHERE o.legacy_id = 'rec073bO1' ORDER BY p.id LIMIT 1;
  INSERT INTO trucks (license_plate) VALUES ('S073B-3') RETURNING id INTO tr;
  -- B-87: a cycle that ended 3 days ago (OWNED, no km)
  r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', vpc)),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', tr), 'side', 'KATHODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'h', 'location_id', hub, 'side', 'KATHODOS', 'planned_from', (pd + time '06:00') AT TIME ZONE 'Europe/Athens', 'planned_to', (pd + time '07:00') AT TIME ZONE 'Europe/Athens'),
           jsonb_build_object('ref', 'b', 'location_id', lb, 'side', 'KATHODOS', 'planned_from', (pd + time '10:00') AT TIME ZONE 'Europe/Athens', 'planned_to', (pd + time '11:00') AT TIME ZONE 'Europe/Athens'))),
         's073b', 'owner');
  lg := (r->'ids'->'leg_ids'->>0)::bigint;
  -- B-89: a second writer on the VS stop (only a bypass can do it: the feeder never writes for a bridge)
  INSERT INTO pl_movements (movement_date, counterparty_type, client_id, location_id, event_type, taken, given, created_by, piece_leg_id)
  VALUES (d, 'CLIENT', cl, lb, 'DELIVERY', 10, 10, 's073b', lg);
END $s$;`;

test('073b on the production-shaped copy', async (t) => {
  const db = await prodShaped();

  await t.test('the guards: 073b refuses before 073, without 072b\'s policy on the segments, and when the runner already executes stock_vs_charge', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec('DROP POLICY monitor_read ON public.rt_vehicle_segments');
      assert.match(await errorOf(db, read('073b_plan_monitoring.sql')) ?? '', /072b \(rt_vehicle_segments and its monitor_read policy\) must be applied first/);
    } finally { await db.exec('ROLLBACK'); }
    await db.exec('BEGIN');
    try {
      await db.exec(`ALTER FUNCTION public.plan_h_pallet_sync(bigint[],text,text) RENAME TO plan_h_pallet_sync_x`);
      assert.match(await errorOf(db, read('073b_plan_monitoring.sql')) ?? '', /073 must be applied first/);
    } finally { await db.exec('ROLLBACK'); }
    await db.exec('BEGIN');
    try {
      await db.exec(`GRANT EXECUTE ON FUNCTION ${RUNNER_FN} TO tms_check_runner`);
      assert.match(await errorOf(db, read('073b_plan_monitoring.sql')) ?? '', /the runner already executes stock_vs_charge - stop, re-measure/);
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('production\'s function rights: the runner cannot execute stock_vs_charge, and 073b without its GRANT fails as the production dry run did', async () => {
    // the harness holds production's ACLs (prod-shaped-072.mjs, LIVE_FN_ACL): no EXECUTE to PUBLIC, so the runner
    // is refused exactly as on 26/10 - the mutation that would have caught it before the owner ran it
    assert.strictEqual(await canExec(db, 'tms_check_runner'), false);
    assert.strictEqual(await canExec(db, 'tms_reader'), false);
    assert.strictEqual(await canExec(db, 'service_role'), true);
    const grant = `GRANT EXECUTE ON FUNCTION ${RUNNER_FN} TO tms_check_runner;`;
    const without = read('073b_plan_monitoring_dryrun.sql').replace(grant, '');
    assert.notStrictEqual(without, read('073b_plan_monitoring_dryrun.sql'), 'the GRANT is where the mutation goes');
    assert.match(await errorOf(db, without) ?? '', /permission denied for function stock_vs_charge/);
  });

  await t.test('dry run keeps nothing; 073b applies; every check it seeds is 0 today, B-80 seeded disabled', async () => {
    assert.match(await errorOf(db, read('073b_plan_monitoring_dryrun.sql')) ?? '', /DRY RUN 073b finished - EVERYTHING UNDONE/);
    assert.strictEqual(await canExec(db, 'tms_check_runner'), false, 'the dry run keeps no EXECUTE');
    assert.strictEqual(await n(db, `SELECT count(*) AS n FROM pg_policies WHERE policyname = 'monitor_read' AND tablename = ANY($1)`, [V5]), 0);
    assert.strictEqual(await n(db, 'SELECT count(*) AS n FROM monitoring.checks WHERE id = ANY($1)', [IDS]), 0);
    assert.strictEqual((await db.query(`SELECT has_table_privilege('tms_check_runner', 'public.ct_settings', 'SELECT') AS b`)).rows[0].b, false);
    assert.strictEqual(await errorOf(db, read('073b_plan_monitoring.sql')), null);
    assert.strictEqual(await n(db, 'SELECT count(*) AS n FROM monitoring.checks WHERE id = ANY($1)', [IDS]), IDS.length);
    assert.strictEqual(await canExec(db, 'tms_check_runner'), true, 'the runner computes X (B-79 / B-80)');
    assert.strictEqual(await canExec(db, 'tms_reader'), false, 'never tms_reader (D-15)');
    assert.deepStrictEqual((await db.query('SELECT id FROM monitoring.checks WHERE id = ANY($1) AND NOT enabled ORDER BY id', [IDS])).rows.map((r) => r.id), DISABLED);
    assert.match((await db.query(`SELECT disabled_reason AS r FROM monitoring.checks WHERE id = 'B-80'`)).rows[0].r, /owner 24\/10, M-5/);
    const v = await values(db);
    assert.deepStrictEqual(Object.entries(v).filter(([, x]) => x !== 0), [], JSON.stringify(v));
    const res = await runAll(db);
    assert.deepStrictEqual(Object.values(res).filter((x) => x.status === 'error'), []);
    assert.deepStrictEqual(Object.keys(res).sort(), IDS.filter((id) => !DISABLED.includes(id)).sort(), 'every enabled check ran, the disabled one did not');
    assert.match(await errorOf(db, read('073b_plan_monitoring.sql')) ?? '', /073b: already applied/);
    // the runbook's after-check (K-15, P3-6): 071's verify shows its 5 policies, 072b's keeps its one
    assert.strictEqual(Number((await db.query(readDone('071_plan_schema_verify.sql'))).rows[0].policies), 5);
    assert.strictEqual(Number((await db.query(read('072b_plan_vehicle_segments_verify.sql'))).rows[0].auditor_policy), 1);
    // order 073b -> 073 on the way back: 073's rollback refuses while 073b's checks read its view
    assert.match(await errorOf(db, read('073_plan_money_rollback.sql')) ?? '', /073 rollback: 073b's checks \(B-78\.\.B-90, B-94\) exist - run 073b's rollback first/);
  });

  await t.test('the scenario turns every enabled F3 check red but B-79 (M-4 beta); B-80 counts as disabled; 072b\'s stay 0', async () => {
    assert.strictEqual(await errorOf(db, SCENARIO), null);
    assert.strictEqual(await errorOf(db, SCENARIO2), null);
    await db.exec(`UPDATE ct_settings SET value = 700 WHERE key = 'x_import'`);   // the owner changes X: no alarm (M-4 beta)
    const v = await values(db);
    const green = F3_IDS.filter((id) => v[id] === 0 && id !== 'B-79' && !DISABLED.includes(id));
    assert.deepStrictEqual(green, [], JSON.stringify(v));
    assert.strictEqual(v['B-79'], 0, 'B-79 stays 0 when X changes in the settings: it compares with the X of the order (M-4 beta)');
    assert.strictEqual(v['B-80'], 0, 'B-80: the shares add up to the price by construction (M-3 beta), why it is disabled (M-5 delta)');
    assert.strictEqual(v['B-78'], 2, 'B-78 names the VS with a Direct NL AND the national order with a load of today');
    assert.strictEqual(v['B-90'], 1, 'B-90: the national whose price was wiped, never the stock-lot national without a price (finding 5)');
    // Q6-1 / principle 3: B-83 and the P&L flag read the same rule (ct_v_rt_partner_cost) - they agree on the scenario
    assert.strictEqual(v['B-83'], await n(db, `SELECT count(*) AS n FROM ct_v_rt_pnl WHERE partner_rate_missing`), 'B-83 = the P&L\'s partner_rate_missing');
    assert.strictEqual(v['B-83'], 1, 'B-83: the partner cycle without a rate');
    // final round 2 (finding 2): the invoice no partner of the cycle owns is counted (cost 280 on top), and said
    assert.strictEqual(v['B-94'], await n(db, `SELECT count(DISTINCT rt_id) AS n FROM ct_v_rt_partner_cost WHERE unmatched`), 'B-94 = the view\'s unmatched cycles');
    assert.strictEqual(v['B-94'], 1, 'B-94: the invoice of a partner who drives no segment of the cycle');
    // written out, not taken from the builder: a builder that stopped seeding 072b's checks must fail here too
    for (const id of ['B-91', 'B-92', 'B-93']) assert.strictEqual(v[id], 0, `${id}: seeded by 073b, and every cycle of the scenario went through the plan_*`);
    const res = await runAll(db);
    assert.ok(!('B-80' in res), 'run_checks skips the disabled B-80 (reported as a GAP, never green, never red)');
    assert.deepStrictEqual(Object.values(res).filter((x) => x.status === 'error'), []);
    for (const id of F3_IDS.filter((x) => x !== 'B-79' && !DISABLED.includes(x))) {
      assert.ok(['red', 'queue'].includes(res[id].status) && Number(res[id].value) > 0, `${id} through run_checks: ${JSON.stringify(res[id])}`);
    }
  });

  await t.test('B-79 (M-4 beta) turns red on a broken share rule: a wrong denominator in ct_v_v5_revenue', async () => {
    const def = (await db.query(`SELECT pg_get_viewdef('public.ct_v_v5_revenue'::regclass, true) AS d`)).rows[0].d;
    const bad = def.replace(/PARTITION BY lf\.share_key\) AS all_pallets/, 'PARTITION BY lf.piece_id) AS all_pallets');
    assert.notStrictEqual(bad, def, 'the denominator of the shares is where the mutation goes');
    await db.exec('BEGIN');
    try {
      await db.exec(`CREATE OR REPLACE VIEW public.ct_v_v5_revenue AS ${bad}`);
      const v = await values(db, ['B-79']);
      assert.strictEqual(v['B-79'], 1, 'the VS of the scenario (two leaves, 6 + 4): each leaf takes the whole X');
    } finally { await db.exec('ROLLBACK'); }
    assert.strictEqual((await values(db, ['B-79']))['B-79'], 0);
  });

  await t.test('without the read policies the auditor sees no v5 row: silent checks and a false alarm', async () => {
    await db.exec('BEGIN');
    try {
      for (const tb of V5) await db.exec(`DROP POLICY monitor_read ON public.${tb}`);
      const v = await values(db);
      for (const id of ['B-85', 'B-86', 'B-88', 'B-89']) assert.strictEqual(v[id], 0, `${id} silent without the policy`);
      const live = await n(db, `SELECT count(*) AS n FROM ct_round_trips WHERE model = 2 AND status <> 'cancelled'`);
      assert.ok(live > 0);
      assert.strictEqual(v['B-82'], live, 'B-82 counts EVERY v5 cycle as empty: it cannot see a single leg');
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('the rollback takes out the 17 checks, the 5 policies and the two grants, closes their open incidents; 072b\'s policy stays; with v5 rows 073b refuses by name', async () => {
    // incidents has no FK to checks (047): a removed check's open incident would stay red in the report for ever
    const open = `SELECT count(*) AS n FROM monitoring.incidents WHERE state IN ('new','confirmed','recurred')
                   AND (check_id = ANY($1) OR incident_key = ANY($2))`;
    const keys = IDS.flatMap((id) => [`MECH:check:${id}`, `MECH:stale:${id}`]);
    assert.ok(await n(db, open, [IDS, keys]) > 0, 'the scenario left red incidents of 073b\'s checks (the case the rollback must close)');
    assert.strictEqual(await errorOf(db, read('073b_plan_monitoring_rollback.sql')), null);
    assert.strictEqual(await n(db, open, [IDS, keys]), 0, 'no open incident of a removed check');
    assert.ok(await n(db, `SELECT count(*) AS n FROM monitoring.incidents WHERE check_id = ANY($1) AND state = 'resolved' AND state_changed_by = '073b rollback (check removed)'`, [IDS]) > 0);
    assert.strictEqual(await n(db, 'SELECT count(*) AS n FROM monitoring.checks WHERE id = ANY($1)', [IDS]), 0);
    assert.strictEqual(await n(db, 'SELECT count(*) AS n FROM monitoring.results WHERE check_id = ANY($1)', [IDS]), 0);
    assert.strictEqual(await n(db, `SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`, [V5]), 0);
    assert.strictEqual(await n(db, `SELECT count(*) AS n FROM pg_policies WHERE tablename = 'rt_vehicle_segments' AND policyname = 'monitor_read'`), 1);
    assert.strictEqual((await db.query(`SELECT has_table_privilege('tms_check_runner', 'public.ct_settings', 'SELECT') AS b`)).rows[0].b, false);
    assert.strictEqual(await canExec(db, 'tms_check_runner'), false, 'stock_vs_charge back to service_role only (057)');
    assert.strictEqual(await canExec(db, 'service_role'), true);
    // 073b's proof says "0 today": with the scenario's v5 rows in place it refuses, by name - never a silent seed
    assert.match(await errorOf(db, read('073b_plan_monitoring.sql')) ?? '', /073b proof: B-\d+ gives \d+ today, expected 0 before day L/);
  });
});
