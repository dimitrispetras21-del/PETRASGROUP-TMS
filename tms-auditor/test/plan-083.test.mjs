// 083 (a load without a truck, owner 31/10) on the production-shaped PGlite copy as production holds it on 31/10:
// prod-shaped-074.mjs (072 ... 074a, 074, 074b) + 075, 076, 077, 078, 080 and 082 (executed). 081 is a draft and patches
// other functions. Each scenario runs inside a transaction that is always rolled back, with the deferred rules (071's
// plan_chk) fired before the rows are read: first on the LIVE text (a load without a truck is refused = NO-GO), then
// after 083 (GO), then after the rollback (refused again). Every case reads ROWS (ct_round_trips, rt_vehicle_segments,
// rt_stops, piece_legs, v_rt_stop_state), never only an answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-083.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const SIG = 'public.plan_rt_create(jsonb,text,text)';
const md5 = async (db) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${SIG}'::regprocedure`)).m;

// test rows only: legacy ids rec83..., references T83-..., locations TEST 083 ..., plates TEST-083-...
const HELPERS = `
CREATE FUNCTION t83_vs(p_ref text, p_hub date, p_pallets numeric[]) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint; tot numeric := 0;
begin
  select id into hub from locations where is_hub;
  select coalesce(sum(x), 0) into tot from unnest(p_pallets) x;
  insert into locations (legacy_id, name) values ('rec83X' || p_ref, 'TEST 083 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec83O' || p_ref, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 1, p_hub, 'T83-' || p_ref,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec83A' || p_ref, 'Loading', 1, p_hub - 3, o, lx, tot);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec83H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, tot);
  for i in 1 .. array_length(p_pallets, 1) loop
    insert into locations (legacy_id, name) values ('rec83G' || p_ref || i, 'TEST 083 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec83S' || p_ref || i, 'Unloading', i, p_hub + 1, o, lg, p_pallets[i]);
  end loop;
  return o;
end $t$;
CREATE FUNCTION t83_piece(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
       where st.legacy_id = 'rec83S' || p_ref || p_i and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
CREATE SEQUENCE t83_plate;
-- the Veroia board's «Νέο φορτίο»: the given pieces from Veroia to their Greek stops, ONE request, the given new_rt
CREATE FUNCTION t83_put(p_pieces bigint[], p_day date, p_new jsonb, p_order bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $t$
declare st jsonb; i int; hub bigint;
begin
  select id into hub from locations where is_hub;
  st := jsonb_build_array(jsonb_build_object('ref', 'p', 'location_id', hub, 'side', 'KATHODOS',
          'planned_from', (p_day + time '16:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '18:00') at time zone 'Europe/Athens'));
  for i in 1 .. cardinality(p_pieces) loop
    st := st || jsonb_build_object('ref', 'd' || i, 'side', 'KATHODOS',
            'location_id', (select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_pieces[i]),
            'planned_from', ((p_day + 1) + make_time(8 + i, 0, 0)) at time zone 'Europe/Athens',
            'planned_to', ((p_day + 1) + make_time(9 + i, 0, 0)) at time zone 'Europe/Athens');
  end loop;
  if p_order is not null then   -- the whole order (plan_put_group), as the board's «Ανάθεση»
    return plan_put_group(jsonb_build_object('group', jsonb_build_object('order_id', p_order),
           'target', jsonb_build_object('new_rt', p_new, 'side', 'KATHODOS'), 'stops', st), 'test:083', 'dispatcher');
  end if;
  return plan_put_pieces(jsonb_build_object(
         'pieces', (select jsonb_agg(jsonb_build_object('piece_id', x)) from unnest(p_pieces) x),
         'target', jsonb_build_object('new_rt', p_new, 'side', 'KATHODOS'), 'stops', st), 'test:083', 'dispatcher');
end $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// one load from Veroia: two VS pieces on day L + 3, new_rt as given; the rows it wrote, or the refusal
const load = (db, L, newRt, tag, group = false) => scenario(db, async () => {
  const day = `DATE '${L}' + 3`;
  const o = await num(db, `SELECT t83_vs('${tag}', ${day}, '{12,10}')`);
  const pcs = (await db.query(`SELECT t83_piece('${tag}', i) AS p FROM generate_series(1, 2) i`)).rows.map((r) => r.p);
  let res = null;
  try { res = (await one(db, `SELECT t83_put($1::bigint[], ${day}, $2::jsonb, $3::bigint) AS r`, [pcs, JSON.stringify(newRt), group ? o : null])).r; } catch (e) { return { err: String(e.message) }; }
  const rt = Number(res.ids ? res.ids.rt_id : res.rt_id);
  const out = {
    err: null, rt,
    cyc: await one(db, `SELECT model, trip_type, truck_id, trailer_id, driver_id, partner_id, partner_rate, status FROM ct_round_trips WHERE id = $1`, [rt]),
    segs: (await db.query(`SELECT trip_type, truck_id, driver_id, partner_id FROM rt_vehicle_segments WHERE rt_id = $1 AND deleted_at IS NULL`, [rt])).rows,
    stops: await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]),
    legs: await num(db, `SELECT count(*) FROM piece_legs WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]),
    hasVehicle: (await one(db, `SELECT bool_or(has_vehicle) AS h FROM v_rt_stop_state WHERE rt_id = $1`, [rt])).h,
  };
  // the vehicle is given later, with the same act as for any cleared cycle (PATCH /plan/rt)
  const trk = await num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-083-' || nextval('t83_plate')) RETURNING id`);
  const drv = await num(db, `INSERT INTO drivers (full_name) VALUES ('TEST 083 driver ' || nextval('t83_plate')) RETURNING id`);
  out.payroll0 = await num(db, `SELECT count(*) FROM dl_entries WHERE rt_id = $1`, [rt]);
  try {
    await db.query(`SELECT plan_rt_update($1::jsonb, 'test:083', 'dispatcher')`, [JSON.stringify({ rt_id: rt, set: { trip_type: 'OWNED', truck_id: trk, driver_id: drv } })]);
    out.later = { truck: Number((await one(db, `SELECT truck_id FROM ct_round_trips WHERE id = $1`, [rt])).truck_id) === trk,
      segTruck: Number((await one(db, `SELECT truck_id FROM rt_vehicle_segments WHERE rt_id = $1 AND deleted_at IS NULL`, [rt])).truck_id) === trk,
      payroll: await num(db, `SELECT count(*) FROM dl_entries WHERE rt_id = $1 AND driver_id = $2`, [rt, drv]) };
  } catch (e) { out.later = { err: String(e.message) }; }
  return out;
});
const LATER = { trip_type: 'OWNED', later: true };

test('083 on the production-shaped copy (31/10): a load without a truck refused on the live text, made after 083', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  await db.query(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') WHERE id = 'B-54'`);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('083_plan_load_without_truck.sql');
  const F = facts(src);
  const live = await md5(db);
  const trg0 = await num(db, TRG);

  await t.test('the copy holds the LIVE text 083 guards on (072 as 072b proved it)', async () => {
    assert.strictEqual(live, F.live[SIG]);
    assert.strictEqual(live, '37c04d5803944fdeaf9d0534a0b83506');
  });
  await t.test('NO-GO on the live text: a load without a truck is refused', async () => {
    const r = await load(db, L, LATER, 'N1');
    assert.ok(r.err && /bad_input|later/.test(r.err), r.err);
    assert.match((await load(db, L, { trip_type: 'OWNED' }, 'N2')).err ?? '', /no_vehicle/);
  });
  await t.test('083 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('083_plan_load_without_truck_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 083 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}083 ran: create ${F.gen[0].m}`), msg);
    assert.strictEqual(await md5(db), live);
  });
  await t.test('083 applies; the text is the generated one, the rights as before, no trigger', async () => {
    const acl0 = await one(db, `SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = '${SIG}'::regprocedure`);
    await db.exec(src);
    assert.strictEqual(await md5(db), F.gen[0].m);
    assert.deepStrictEqual(await one(db, `SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = '${SIG}'::regprocedure`), acl0);
    assert.strictEqual(await num(db, TRG), trg0);
    const v = await one(db, read('083_plan_load_without_truck_verify.sql'));
    assert.strictEqual(v.applied, '083 in place');
    assert.strictEqual(v.still_refuses_missing_truck, true);
  });
  await t.test('083 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /083: public\.plan_rt_create.* is not its live text of 31\/10/);
    assert.strictEqual(await md5(db), F.gen[0].m);
  });
  await t.test('GO: a load without a truck - the cycle, its first segment and its legs exist, with no vehicle; a truck later', async () => {
    const r = await load(db, L, LATER, 'G1');
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null, 'the deferred rules pass');
    assert.deepStrictEqual({ ...r.cyc, model: Number(r.cyc.model) }, { model: 2, trip_type: 'OWNED', truck_id: null, trailer_id: null, driver_id: null,
      partner_id: null, partner_rate: null, status: 'planned' });
    assert.deepStrictEqual(r.segs, [{ trip_type: 'OWNED', truck_id: null, driver_id: null, partner_id: null }]);
    assert.strictEqual(r.stops, 3);
    assert.strictEqual(r.legs, 2);
    assert.strictEqual(r.hasVehicle, false, 'the board paints it PROS ANATHESI');
    assert.strictEqual(r.payroll0, 0, 'no driver, no payroll line');
    assert.deepStrictEqual(r.later, { truck: true, segTruck: true, payroll: 1 }, 'truck and driver given later with PATCH /plan/rt; the payroll line follows (011)');
  });
  await t.test('GO: the whole order (plan_put_group, the board\'s «Ανάθεση») as a load without a truck', async () => {
    const r = await load(db, L, LATER, 'G2', true);
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.cyc.truck_id, null);
    assert.strictEqual(r.legs, 2);
    assert.strictEqual(r.hasVehicle, false);
  });
  await t.test('still refused: a forgotten truck (no "later"), "later" with a vehicle or a partner, "later" not a boolean', async () => {
    assert.match((await load(db, L, { trip_type: 'OWNED' }, 'R1')).err ?? '', /no_vehicle/);
    assert.match((await load(db, L, { trip_type: 'OWNED', later: true, driver_id: 1 }, 'R2')).err ?? '', /bad_input/);
    assert.match((await load(db, L, { trip_type: 'PARTNER', later: true }, 'R3')).err ?? '', /bad_input/);
    assert.match((await load(db, L, { trip_type: 'OWNED', later: 'yes' }, 'R4')).err ?? '', /bad_input/);
  });
  await t.test('rollback dry run keeps nothing; the rollback brings the live text and the refusal back', async () => {
    const msg = await errorOf(db, read('083_plan_load_without_truck_rollback_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 083 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: create ${live}`), msg);
    assert.strictEqual(await md5(db), F.gen[0].m);
    await db.exec(read('083_plan_load_without_truck_rollback.sql'));
    assert.strictEqual(await md5(db), live);
    assert.ok((await load(db, L, LATER, 'B1')).err);
    assert.strictEqual((await one(db, read('083_plan_load_without_truck_verify.sql'))).applied, '083 NOT APPLIED');
  });
});
