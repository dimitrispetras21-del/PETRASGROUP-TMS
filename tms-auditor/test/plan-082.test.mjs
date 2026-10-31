// 082 (F40 + F41, owner's real-user entry of W44, 28/10) on the production-shaped PGlite copy as production holds it on
// 28/10: prod-shaped-074.mjs (072 ... 074a, 074, 074b) + 075, 076, 077, 078. 079 only moved day L (the copy has its
// own L, the next Saturday) and touches neither function 082 patches.
// Each scenario runs inside a transaction that is always rolled back, with the deferred rules (071's plan_chk) fired
// before the rows are read (SET CONSTRAINTS ALL IMMEDIATE): the same scenario first on the LIVE texts (it must show
// F40 / F41 as production did = NO-GO), then after 082 (GO), then after the rollback (the live behaviour again).
// Every case reads ROWS (piece_legs, rt_stops, ct_round_trips, plan_notices, audit_log), never only an answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-082.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const SIGS = ['public.plan_h_bridge_unplan(bigint,bigint,text,text,text)', 'public.rt_sync_from_order()'];
const RECOMPUTE = '5fa0a08418147b22d2852db3b8c72c3e';   // rt_recompute, production 28/10: 082 never patches it
const recomputeMd5 = async (db) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure`)).m;
const md5s = async (db) => Promise.all(SIGS.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));

// test rows only: legacy ids rec82..., references T82-..., locations TEST 082 ..., plates TEST-082-...
const HELPERS = `
CREATE FUNCTION t82_vs(p_ref text, p_hub date, p_pallets numeric[]) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint; tot numeric := 0;
begin
  select id into hub from locations where is_hub;
  select coalesce(sum(x), 0) into tot from unnest(p_pallets) x;
  insert into locations (legacy_id, name) values ('rec82X' || p_ref, 'TEST 082 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec82O' || p_ref, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 1, p_hub, 'T82-' || p_ref,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec82A' || p_ref, 'Loading', 1, p_hub - 3, o, lx, tot);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec82H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, tot);
  for i in 1 .. array_length(p_pallets, 1) loop
    insert into locations (legacy_id, name) values ('rec82G' || p_ref || i, 'TEST 082 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec82S' || p_ref || i, 'Unloading', i, p_hub + 1, o, lg, p_pallets[i]);
  end loop;
  return o;
end $t$;
CREATE FUNCTION t82_piece(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
       where st.legacy_id = 'rec82S' || p_ref || p_i and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
CREATE SEQUENCE t82_plate;
-- ONE new OWNED cycle on day p_day that takes the given pieces from Veroia to their Greek stops (RT-1304's shape:
-- one pickup at the hub, one drop per piece, in time order)
CREATE FUNCTION t82_put(p_pieces bigint[], p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare trk bigint; st jsonb; i int; r jsonb; hub bigint;
begin
  select id into hub from locations where is_hub;
  insert into trucks (license_plate) values ('TEST-082-' || nextval('t82_plate')) returning id into trk;
  st := jsonb_build_array(jsonb_build_object('ref', 'p', 'location_id', hub, 'side', 'KATHODOS',
          'planned_from', (p_day + time '06:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '07:00') at time zone 'Europe/Athens'));
  for i in 1 .. cardinality(p_pieces) loop
    st := st || jsonb_build_object('ref', 'd' || i, 'side', 'KATHODOS',
            'location_id', (select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_pieces[i]),
            'planned_from', (p_day + make_time(8 + 2 * i, 0, 0)) at time zone 'Europe/Athens',
            'planned_to', (p_day + make_time(9 + 2 * i, 0, 0)) at time zone 'Europe/Athens');
  end loop;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', (select jsonb_agg(jsonb_build_object('piece_id', x, 'drop', 'd' || n)) from unnest(p_pieces) with ordinality u(x, n)),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk), 'side', 'KATHODOS'),
         'stops', st), 'test:082', 'dispatcher');
  -- the board's move and the international's save are two requests in production (two transactions): the 'natl'
  -- writer mark the move leaves for the rest of ITS transaction must not cover the save that follows here
  perform set_config('plan.writer', '', true);
  set constraints all deferred;   -- and its rules fire at that request's COMMIT, not in the middle of the next one
  return (r->'ids'->>'rt_id')::bigint;
end $t$;
-- the split a dispatcher leaves at Veroia (a piece that rides nothing yet): 4 + the rest, as plan_split_piece does
CREATE FUNCTION t82_split(p_piece bigint) RETURNS void LANGUAGE sql AS $t$
  update shipment_pieces set split_at = now(), split_by = 'test:082' where id = p_piece;
  insert into shipment_pieces (shipment_id, parent_piece_id, pallets, created_by)
    select shipment_id, id, 4, 'test:082' from shipment_pieces where id = p_piece;
  insert into shipment_pieces (shipment_id, parent_piece_id, pallets, created_by)
    select shipment_id, id, pallets - 4, 'test:082' from shipment_pieces where id = p_piece;
$t$;`;

// A scenario inside a transaction that is always rolled back; the deferred rules fire before the rows are read
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// the notices a date move wrote (after = the last notice id before it: the board move writes its own, decision 16)
const lastNotice = (db) => num(db, `SELECT coalesce(max(id), 0) FROM plan_notices`);
const noticesOf = async (db, o, after) => Object.fromEntries((await db.query(
  `SELECT kind, count(*)::int AS n FROM plan_notices WHERE order_id = $1 AND id > $2 GROUP BY kind`, [o, after])).rows.map((r) => [r.kind, r.n]));
const legsOf = (db, o) => num(db, `SELECT count(*) FROM piece_legs l JOIN shipment_pieces sp ON sp.id = l.piece_id
  JOIN shipments s ON s.id = sp.shipment_id WHERE s.order_id = $1 AND l.deleted_at IS NULL`, [o]);

// F40: VS 576's shape (Import, 3 unloadings of 11), all three on ONE cycle; then the international's form moves the
// delivery one day (the stops follow, then the hub day follows: order_dates_follow, as 28/10 20:11 UTC)
const f40 = (db, L, how = 'delivery') => scenario(db, async () => {
  const hub = `DATE '${L}' + 3`;
  const o = await num(db, `SELECT t82_vs('F40', ${hub}, '{11,11,11}')`);
  const pcs = await db.query(`SELECT t82_piece('F40', i) AS p FROM generate_series(1, 3) i`);
  const rt = await num(db, `SELECT t82_put($1::bigint[], ${hub} + 1)`, [pcs.rows.map((r) => r.p)]);
  const code = (await one(db, `SELECT code FROM ct_round_trips WHERE id = $1`, [rt])).code;
  const legs0 = await legsOf(db, o);
  const stops0 = await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]);
  const n0 = await lastNotice(db);
  if (how === 'executed') {   // the cycle ran: its stops are of yesterday (v_rt_stop_state.executed = an Athens day gone)
    // the cycle's day (hub + 1) moved back to yesterday, every stop by the same days (the order of the stops kept)
    await db.exec(`UPDATE rt_stops SET planned_from = planned_from - make_interval(days => ${hub} + 1 - ((now() AT TIME ZONE 'Europe/Athens')::date - 1)),
      planned_to = planned_to - make_interval(days => ${hub} + 1 - ((now() AT TIME ZONE 'Europe/Athens')::date - 1)) WHERE rt_id = ${rt}`);
  }
  await db.exec(how === 'hub' ? `UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE id = ${o}`
    : how === 'hub5' ? `UPDATE orders SET cross_dock_date = cross_dock_date + 5 WHERE id = ${o}`
    : `UPDATE orders SET delivery_datetime = delivery_datetime + interval '1 day' WHERE id = ${o}`);
  return {
    legs0, stops0, code, legs: await legsOf(db, o),
    stops: await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]),
    status: (await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rt])).status,
    notices: await noticesOf(db, o, n0),
    kept: (await one(db, `SELECT message, rt_id FROM plan_notices WHERE order_id = $1 AND kind = 'vs_day_moved_kept' AND id > $2`, [o, n0])) ?? null,
    rt,
  };
});
// Pieces that ride nothing, each split at Veroia: the date move undoes the splits (as before 082), told once
const free = (db, L) => scenario(db, async () => {
  const hub = `DATE '${L}' + 4`;
  const o = await num(db, `SELECT t82_vs('FR', ${hub}, '{10,12}')`);
  await db.exec(`SELECT t82_split(t82_piece('FR', 1)); SELECT t82_split(t82_piece('FR', 2));`);
  const n0 = await lastNotice(db);
  await db.exec(`UPDATE orders SET delivery_datetime = delivery_datetime + interval '1 day' WHERE id = ${o}`);
  return { notices: await noticesOf(db, o, n0),
    children: await num(db, `SELECT count(*) FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id
      WHERE s.order_id = $1 AND sp.parent_piece_id IS NOT NULL AND sp.deleted_at IS NULL`, [o]) };
});
// One piece on a cycle, the other split and waiting: the riding one is kept, the waiting split undone, each told once
const mixed = (db, L) => scenario(db, async () => {
  const hub = `DATE '${L}' + 5`;
  const o = await num(db, `SELECT t82_vs('MX', ${hub}, '{10,12}')`);
  await num(db, `SELECT t82_put(ARRAY[t82_piece('MX', 1)], ${hub} + 1)`);
  await db.exec(`SELECT t82_split(t82_piece('MX', 2))`);
  const n0 = await lastNotice(db);
  await db.exec(`UPDATE orders SET delivery_datetime = delivery_datetime + interval '1 day' WHERE id = ${o}`);
  return { legs: await legsOf(db, o), notices: await noticesOf(db, o, n0),
    children: await num(db, `SELECT count(*) FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id
      WHERE s.order_id = $1 AND sp.parent_piece_id IS NOT NULL AND sp.deleted_at IS NULL`, [o]) };
});

// VS 601's shape (28/10 20:32 UTC, RT-1305): the cycle also carries a piece of ANOTHER order; the international moves
// 601's delivery two days. Live: only 601's leg and its stops go (leg 32, rt_stops 60/61), the cycle stays, notice 8.
const f601 = (db, L) => scenario(db, async () => {
  const hub = `DATE '${L}' + 6`;
  const o = await num(db, `SELECT t82_vs('601', ${hub}, '{10}')`);
  const other = await num(db, `SELECT t82_vs('OTH', ${hub}, '{8}')`);
  const rt = await num(db, `SELECT t82_put(ARRAY[t82_piece('601', 1), t82_piece('OTH', 1)], ${hub} + 1)`);
  const stops0 = await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]);
  const n0 = await lastNotice(db);
  await db.exec(`UPDATE orders SET delivery_datetime = delivery_datetime + interval '2 days' WHERE id = ${o}`);
  return { stops0, legs: await legsOf(db, o), other: await legsOf(db, other),
    stops: await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]),
    status: (await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rt])).status, notices: await noticesOf(db, o, n0) };
});

// F41: an international RT of two Delivered legs (an export 0 -> 3, an import 4 -> 8), as RT-1252
async function rt1252(db, status, importStatus = 'Delivered') {
  const d = (k) => `(DATE '2026-10-19' + ${k})`;
  const e = await num(db, `INSERT INTO orders (legacy_id, order_type, direction, status, loading_datetime, delivery_datetime, reference, client_id)
    VALUES ('rec82E' || nextval('t82_plate'), 'International', 'Export', 'Delivered', ${d(0)}, ${d(3)}, 'T82-E', (SELECT min(id) FROM clients)) RETURNING id`);
  const i = await num(db, `INSERT INTO orders (legacy_id, order_type, direction, status, loading_datetime, delivery_datetime, reference, client_id)
    VALUES ('rec82I' || nextval('t82_plate'), 'International', 'Import', '${importStatus}', ${d(4)}, ${d(8)}, 'T82-I', (SELECT min(id) FROM clients)) RETURNING id`);
  const trk = await num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-082-' || nextval('t82_plate')) RETURNING id`);
  const rt = await num(db, `INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, date_start, date_end, status, closed_at, source, created_by)
    VALUES ('RT-T82-' || nextval('t82_plate'), 'INTL', 'OWNED', ${trk}, ${d(0)}, ${d(8)}, '${status}', CASE WHEN '${status}' = 'closed' THEN now() END, 'planner', 'test:082') RETURNING id`);
  await db.exec(`INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (${rt}, 'EXPORT', ${e}, 1), (${rt}, 'IMPORT', ${i}, 2)`);
  return { e, i, rt, d };
}
const f41 = (db) => scenario(db, async () => {
  const { i, rt, d } = await rt1252(db, 'closed');
  // the front end's write (core/rt-feed.js before this PR: the export's own delivery), then a save of the import
  await db.exec(`UPDATE ct_round_trips SET date_end = ${d(3)} WHERE id = ${rt}`);
  const a0 = await num(db, `SELECT max(id) FROM audit_log`);
  await db.exec(`UPDATE orders SET delivery_datetime = ${d(9)} WHERE id = ${i}`);
  const r = await one(db, `SELECT status, date_end::text AS e FROM ct_round_trips WHERE id = $1`, [rt]);
  return { status: r.status, end: r.e, synced: await num(db, `SELECT count(*) FROM audit_log WHERE id > $1 AND actor = 'trigger:rt_sync'
    AND table_name = 'ct_round_trips' AND record_id = $2`, [a0, String(rt)]) };
});
// controls: an open RT still follows its legs; a closed RT that gains an open leg reopens AND re-dates
const openRt = (db) => scenario(db, async () => {
  const { i, rt, d } = await rt1252(db, 'planned', 'Pending');
  await db.exec(`UPDATE orders SET delivery_datetime = ${d(9)} WHERE id = ${i}`);
  return one(db, `SELECT status, date_end::text AS e FROM ct_round_trips WHERE id = $1`, [rt]);
});
const gainsLeg = (db) => scenario(db, async () => {
  const { rt, d } = await rt1252(db, 'closed');
  const n = await num(db, `INSERT INTO orders (legacy_id, order_type, direction, status, loading_datetime, delivery_datetime, reference, client_id)
    VALUES ('rec82N' || nextval('t82_plate'), 'International', 'Import', 'Pending', ${d(5)}, ${d(12)}, 'T82-N', (SELECT min(id) FROM clients)) RETURNING id`);
  await db.exec(`INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (${rt}, 'IMPORT', ${n}, 3)`);
  return one(db, `SELECT status, date_end::text AS e FROM ct_round_trips WHERE id = $1`, [rt]);
});

test('082 on the production-shaped copy (28/10): F40 and F41 reproduced on the live texts, gone after 082', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(HELPERS);
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('082_plan_bridge_keeps_cycles.sql');
  const F = facts(src);
  const live = await md5s(db);
  const trg0 = await num(db, TRG);
  // B-54 as production holds it (56 = the enabled triggers, SELECT 28/10): 082's guard compares the two
  await db.query(`UPDATE monitoring.checks SET red_value = $1 WHERE id = 'B-54'`, [trg0]);

  await t.test('the copy holds the LIVE texts 082 guards on, and the RT sync F41 runs through (production md5, SELECT 28-31/10)', async () => {
    assert.deepStrictEqual(live, SIGS.map((s) => F.live[s]));
    assert.strictEqual(await recomputeMd5(db), RECOMPUTE);
    const sync = Object.fromEntries((await db.query(`SELECT proname, md5(prosrc) AS m FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('rt_sync_from_order', 'rt_auto_close_order', 'rt_auto_close', 'rt_auto_close_legs', 'order_dates_follow',
                      'plan_bridge_on_order', 'plan_bridge_on_stop')`)).rows.map((r) => [r.proname, r.m]));
    assert.deepStrictEqual(sync, { rt_sync_from_order: '68d7a46e020c13a6b5a6edbd5578c985', rt_auto_close_order: 'c928dc1343f4e0394388cb0f13525d63',
      rt_auto_close: 'eba2146ca4c521da6365edd28c4507af', rt_auto_close_legs: 'fb3423feaf64d13c5f91f125651f965c',
      order_dates_follow: 'a55eb83e75fc4e442ea026f4a6c858e5', plan_bridge_on_order: '90cc2010915885ac441095fd83de863e',
      plan_bridge_on_stop: 'c133ef3f4928da5a625af58072e5af32' });
  });

  await t.test('NO-GO on the live texts: F40 - the date move empties and cancels the cycle, 3 notices', async () => {
    const r = await f40(db, L);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.legs0, 3);
    assert.strictEqual(r.stops0, 4);
    assert.strictEqual(r.legs, 0, 'the 3 legs deleted');
    assert.strictEqual(r.stops, 0, 'the 4 rt_stops deleted');
    assert.strictEqual(r.status, 'cancelled', 'RT-1304 cancelled');
    assert.deepStrictEqual(r.notices, { vs_day_moved: 3 }, '3 identical notices, one per piece');
  });
  await t.test('live: a bridge whose national leg already ran keeps everything, but is told once per stop', async () => {
    const r = await f40(db, L, 'executed');
    assert.strictEqual(r.legs, 3);
    assert.strictEqual(r.stops, 4);
    assert.ok((r.notices.vs_changed_after_execution ?? 0) > 1, JSON.stringify(r.notices));
  });
  await t.test('NO-GO on the live texts: VS 601 - the moved VS loses its leg and stops, the other piece stays', async () => {
    const r = await f601(db, L);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.stops0, 3);
    assert.strictEqual(r.legs, 0, 'leg 32 deleted');
    assert.strictEqual(r.other, 1);
    assert.strictEqual(r.stops, 2, 'its own drop stop deleted');
    assert.notStrictEqual(r.status, 'cancelled');
    assert.deepStrictEqual(r.notices, { vs_day_moved: 1 });
  });
  await t.test('NO-GO on the live texts: F41 - a save of the import re-dates the CLOSED RT', async () => {
    const r = await f41(db);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.status, 'closed');
    assert.strictEqual(r.end, '2026-10-28', 'the sync wrote date_end 22 -> 28 on a closed RT');
    assert.strictEqual(r.synced, 1);
  });
  await t.test('live: two waiting splits moved = 2 notices (one per stop)', async () => {
    const r = await free(db, L);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.children, 0);
    assert.deepStrictEqual(r.notices, { vs_day_moved: 2 });
  });

  await t.test('082 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('082_plan_bridge_keeps_cycles_dryrun.sql'));
    const gen = F.gen.map((g) => g.m);
    assert.match(msg ?? '', new RegExp(`DRY RUN 082 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}082 ran: unplan ${gen[0]}, sync ${gen[1]}`), msg);
    assert.deepStrictEqual(await md5s(db), live);
  });

  await t.test('082 applies; the texts are the generated ones, the rights as before, no trigger', async () => {
    const acl0 = (await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.deepStrictEqual((await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows, acl0);
    assert.strictEqual(await num(db, TRG), trg0);
    assert.strictEqual(await recomputeMd5(db), RECOMPUTE, 'rt_recompute is not patched (leg joins and rt_merge re-date as before)');
    const v = await one(db, read('082_plan_bridge_keeps_cycles_verify.sql'));
    assert.strictEqual(v.applied, '082 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(v.unplan_drops, false);
    assert.strictEqual(v.recompute_untouched, true);
  });
  await t.test('082 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /082: public\.plan_h_bridge_unplan.* is not its live text of 28\/10/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
  });

  await t.test('GO: F40 - the cycle stays whole, ONE notice names it', async () => {
    const r = await f40(db, L);
    assert.strictEqual(r.late, null, 'the deferred rules pass with the legs kept');
    assert.strictEqual(r.legs, 3);
    assert.strictEqual(r.stops, 4);
    assert.notStrictEqual(r.status, 'cancelled');
    assert.deepStrictEqual(r.notices, { vs_day_moved_kept: 1 });
    assert.ok(r.kept.message.includes(r.code) && r.kept.message.includes('T82-F40'), r.kept.message);
    assert.strictEqual(Number(r.kept.rt_id), r.rt, 'one cycle: the notice points at it');
  });
  await t.test('GO: F40 by the hub day itself (cross_dock_date) - kept, one notice', async () => {
    const r = await f40(db, L, 'hub');
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.legs, 3);
    assert.strictEqual(r.stops, 4);
    assert.deepStrictEqual(r.notices, { vs_day_moved_kept: 1 });
  });
  await t.test('GO: the hub day moves 5 days, past the cycle\'s own day - the cycle is kept and the request commits', async () => {
    const r = await f40(db, L, 'hub5');
    assert.strictEqual(r.late, null, 'no 071 rule refuses the kept legs at COMMIT');
    assert.strictEqual(r.legs, 3);
    assert.strictEqual(r.stops, 4);
    assert.deepStrictEqual(r.notices, { vs_day_moved_kept: 1 });
  });
  await t.test('GO: a bridge whose national leg already ran - kept, told ONCE', async () => {
    const r = await f40(db, L, 'executed');
    assert.strictEqual(r.legs, 3);
    assert.deepStrictEqual(r.notices, { vs_changed_after_execution: 1 });
  });
  await t.test('GO: VS 601 - its leg and stops stay, one notice', async () => {
    const r = await f601(db, L);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.legs, 1);
    assert.strictEqual(r.other, 1);
    assert.strictEqual(r.stops, 3);
    assert.deepStrictEqual(r.notices, { vs_day_moved_kept: 1 });
  });
  await t.test('GO: waiting splits are still undone, told once', async () => {
    const r = await free(db, L);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.children, 0);
    assert.deepStrictEqual(r.notices, { vs_day_moved: 1 });
  });
  await t.test('GO: one riding + one waiting split - the riding one kept, the split undone, each told once', async () => {
    const r = await mixed(db, L);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.legs, 1);
    assert.strictEqual(r.children, 0);
    assert.deepStrictEqual(r.notices, { vs_day_moved_kept: 1, vs_day_moved: 1 });
  });
  await t.test('GO: F41 - a closed RT keeps its dates, the sync writes nothing', async () => {
    const r = await f41(db);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.status, 'closed');
    assert.strictEqual(r.end, '2026-10-22');
    assert.strictEqual(r.synced, 0);
  });
  await t.test('controls: an open RT still follows its legs; a closed RT that gains an open leg reopens and re-dates', async () => {
    const o = await openRt(db);
    assert.strictEqual(o.late, null);
    assert.strictEqual(o.e, '2026-10-28');
    const g = await gainsLeg(db);
    assert.strictEqual(g.late, null);
    assert.strictEqual(g.status, 'planned');
    assert.strictEqual(g.e, '2026-10-31');
  });

  await t.test('rollback dry run keeps nothing; the rollback brings the live texts and the live behaviour back', async () => {
    const msg = await errorOf(db, read('082_plan_bridge_keeps_cycles_rollback_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 082 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: unplan ${live[0]}, sync ${live[1]}`), msg);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    await db.exec(read('082_plan_bridge_keeps_cycles_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), live);
    const r = await f40(db, L);
    assert.strictEqual(r.status, 'cancelled');
    assert.strictEqual((await f41(db)).end, '2026-10-28');
    assert.strictEqual((await one(db, read('082_plan_bridge_keeps_cycles_verify.sql'))).applied, '082 NOT APPLIED');
  });
});
