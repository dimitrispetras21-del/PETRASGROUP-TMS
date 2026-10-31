// 084 (F67, owner's simulation of W44, 31/10) on the production-shaped PGlite copy as production holds it on 31/10:
// prod-shaped-074.mjs + 075, 076, 077, 078, 080, 082 and 081 (executed). Each scenario runs inside a transaction that is
// always rolled back, with the deferred rules (071b's EXCLUDE on rt_vehicle_segments, 071's plan_chk) fired before the
// rows are read: first on the LIVE texts (the move is refused by the trip it leaves = NO-GO), then after 084 (GO), and
// a real overlap is still refused at COMMIT; then after the rollback (refused again). Every case reads ROWS.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-084.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const SIGS = ['public.plan_move_pieces(jsonb,text,text)', 'public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'];
const md5s = async (db) => Promise.all(SIGS.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));

// test rows only: legacy ids rec84..., references T84-..., locations TEST 084 ..., plates TEST-084-..., drivers TEST 084
const HELPERS = `
CREATE FUNCTION t84_vs(p_ref text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec84X' || p_ref, 'TEST 084 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec84O' || p_ref, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 3, p_hub, 'T84-' || p_ref,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec84A' || p_ref, 'Loading', 1, p_hub - 3, o, lx, 20);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec84H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, 20);
  for i in 1 .. 2 loop
    insert into locations (legacy_id, name) values ('rec84G' || p_ref || i, 'TEST 084 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec84S' || p_ref || i, 'Unloading', i, p_hub + 1, o, lg, 10);
  end loop;
  return o;
end $t$;
CREATE FUNCTION t84_piece(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
       where st.legacy_id = 'rec84S' || p_ref || p_i and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
CREATE FUNCTION t84_dest(p_piece bigint) RETURNS bigint LANGUAGE sql AS
  $t$ select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece $t$;
CREATE SEQUENCE t84_seq;
CREATE FUNCTION t84_at(p_day date, p_hm text) RETURNS timestamptz LANGUAGE sql AS
  $t$ select (p_day + p_hm::time) at time zone 'Europe/Athens' $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// F67: trip A (truck T, driver D) Fri -> Mon carries VS pieces 1 (Sat) and 2 (Mon). Piece 2 moves to a NEW trip of
// another truck with the SAME driver from newFrom ([days after Fri, HH:MM]): Sun 06:00 is after A's own end once piece 2
// is off (Sat 10:00); Sat 08:00 overlaps A's Saturday delivery (a real clash).
const f67 = (db, L, tag, newFrom) => scenario(db, async () => {
  const fri = `DATE '${L}' + 3`;
  await num(db, `SELECT t84_vs('${tag}', ${fri})`);
  const p1 = await num(db, `SELECT t84_piece('${tag}', 1)`), p2 = await num(db, `SELECT t84_piece('${tag}', 2)`);
  const t1 = await num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-084-' || nextval('t84_seq')) RETURNING id`);
  const t2 = await num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-084-' || nextval('t84_seq')) RETURNING id`);
  const d = await num(db, `INSERT INTO drivers (full_name) VALUES ('TEST 084 driver ' || nextval('t84_seq')) RETURNING id`);
  const hub = await num(db, `SELECT id FROM locations WHERE is_hub`);
  const at = async (day, hm) => (await one(db, `SELECT t84_at(${day}, $1)::text AS t`, [hm])).t;
  const put = await one(db, `SELECT plan_put_pieces($1::jsonb, 'test:084', 'dispatcher') AS r`, [JSON.stringify({
    pieces: [{ piece_id: p1 }, { piece_id: p2 }],
    target: { new_rt: { trip_type: 'OWNED', truck_id: t1, driver_id: d }, side: 'KATHODOS' },
    stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(fri, '06:00'), planned_to: await at(fri, '07:00') },
      { ref: 'd1', location_id: await num(db, `SELECT t84_dest(${p1})`), side: 'KATHODOS', planned_from: await at(`${fri} + 1`, '09:00'), planned_to: await at(`${fri} + 1`, '10:00') },
      { ref: 'd2', location_id: await num(db, `SELECT t84_dest(${p2})`), side: 'KATHODOS', planned_from: await at(`${fri} + 3`, '09:00'), planned_to: await at(`${fri} + 3`, '10:00') }] })]);
  const a = Number(put.r.ids ? put.r.ids.rt_id : put.r.rt_id);
  await db.exec(`SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;`);   // the put's own rules, as its COMMIT
  const [day, hm] = newFrom;
  const body = { from: { rt_id: a, piece_ids: [p2] },
    target: { new_rt: { trip_type: 'OWNED', truck_id: t2, driver_id: d }, side: 'KATHODOS' },
    stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(`${fri} + ${day}`, hm), planned_to: await at(`${fri} + ${day}`, '23:00') },
      { ref: 'd', location_id: await num(db, `SELECT t84_dest(${p2})`), side: 'KATHODOS', planned_from: await at(`${fri} + 3`, '09:00'), planned_to: await at(`${fri} + 3`, '10:00') }] };
  let err = null;
  try {
    // the two steps of the screen: a dry run (its token when the base asks for one), then the execution
    const dry = (await one(db, `SELECT plan_move_pieces($1::jsonb, 'test:084', 'dispatcher') AS r`, [JSON.stringify({ ...body, dry_run: true })])).r;
    const exe = dry && dry.confirm_token ? { ...body, confirm_token: dry.confirm_token } : body;
    await db.query(`SELECT plan_move_pieces($1::jsonb, 'test:084', 'dispatcher')`, [JSON.stringify(exe)]);
  } catch (e) { err = String(e.message); }
  if (err) return { err };
  return { err,
    aEnd: (await one(db, `SELECT (end_at AT TIME ZONE 'Europe/Athens')::text AS e FROM ct_round_trips WHERE id = $1`, [a])).e,
    newRt: await num(db, `SELECT count(*) FROM ct_round_trips WHERE driver_id = $1 AND truck_id = $2 AND status <> 'cancelled'`, [d, t2]),
    p2On: await num(db, `SELECT count(*) FROM piece_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.piece_id = $1 AND l.deleted_at IS NULL AND r.truck_id = $2`, [p2, t2]),
    skipLeft: (await one(db, `SELECT coalesce(current_setting('plan.busy_skip', true), '') AS s`)).s };
});

test('084 on the production-shaped copy (31/10): F67 reproduced on the live texts, gone after 084, the COMMIT rule kept', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  await db.query(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') WHERE id = 'B-54'`);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(read('081_plan_stop_order_follows.sql'));
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('084_plan_move_busy_skip.sql');
  const F = facts(src);
  const live = await md5s(db);
  const trg0 = await num(db, TRG);

  await t.test('the copy holds the LIVE texts 084 guards on', async () => {
    assert.deepStrictEqual(live, SIGS.map((s) => F.live[s]));
  });
  await t.test('NO-GO on the live texts: F67 - the move is refused by the trip it leaves (driver_busy)', async () => {
    const r = await f67(db, L, 'N1', [2, '06:00']);
    assert.match(r.err ?? '', /driver_busy/, r.err);
  });
  await t.test('084 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('084_plan_move_busy_skip_dryrun.sql'));
    const gen = F.gen.map((g) => g.m);
    assert.match(msg ?? '', new RegExp(`DRY RUN 084 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}084 ran: move ${gen[0]}, busy ${gen[1]}`), msg);
    assert.deepStrictEqual(await md5s(db), live);
  });
  await t.test('084 applies; the texts are the generated ones, the rights as before, no trigger', async () => {
    const acl0 = (await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.deepStrictEqual((await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows, acl0);
    assert.strictEqual(await num(db, TRG), trg0);
    const v = await one(db, read('084_plan_move_busy_skip_verify.sql'));
    assert.strictEqual(v.applied, '084 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(Number(v.exclude_deferred), 2);
  });
  await t.test('084 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /084: public\.plan_move_pieces.* is not its live text of 31\/10/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
  });
  await t.test('GO: F67 - the move goes through, the leaving trip ends Sat 10:00, the COMMIT rule passes', async () => {
    const r = await f67(db, L, 'G1', [2, '06:00']);
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null, 'the deferred EXCLUDE passes on the final windows');
    assert.match(r.aEnd, / 10:00:00$/, r.aEnd);
    assert.strictEqual(r.newRt, 1);
    assert.strictEqual(r.p2On, 1);
    assert.strictEqual(r.skipLeft, '', 'the skip is emptied after the target');
  });
  await t.test('still refused: a real overlap with what the leaving trip keeps (Sat 08:00 vs its Sat 09-10 delivery), at COMMIT', async () => {
    const r = await f67(db, L, 'R1', [1, '08:00']);
    assert.ok(r.err || r.late, 'refused either early or at COMMIT');
    assert.match((r.err || r.late) ?? '', /driver_busy|rt_v2_driver_once|exclusion|conflicting/, r.err || r.late);
  });
  await t.test('rollback dry run keeps nothing; the rollback brings the live texts and the refusal back', async () => {
    const msg = await errorOf(db, read('084_plan_move_busy_skip_rollback_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 084 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: move ${live[0]}, busy ${live[1]}`), msg);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    await db.exec(read('084_plan_move_busy_skip_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), live);
    assert.match((await f67(db, L, 'B1', [2, '06:00'])).err ?? '', /driver_busy/);
    assert.strictEqual((await one(db, read('084_plan_move_busy_skip_verify.sql'))).applied, '084 NOT APPLIED');
  });
});
