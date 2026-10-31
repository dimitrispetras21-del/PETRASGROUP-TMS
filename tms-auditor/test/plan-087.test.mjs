// 087 (B-26, the day a part that stays at Veroia leaves by) on the production-shaped PGlite copy as production holds
// it on 1/11: prod-shaped-074.mjs (072 ... 074a, 074, 074b) + 075, 076, 077, 078, 080 (the last one that patched
// plan_split_piece: its md5 is production's, SELECT 1/11). 079, 081 and 082 touch neither plan_split_piece nor what it
// reads (079 only moved day L; the copy has its own L).
// Each scenario runs inside a transaction that is always rolled back, with the deferred rules (071's plan_chk) fired
// before the rows are read: first on the LIVE text (a leave_by is refused = NO-GO), then after 087 (GO), then after the
// rollback (the live behaviour again). Every case reads ROWS (shipment_pieces, v_piece_state, audit_log).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-087.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql, p) { try { await (p ? db.query(sql, p) : db.exec(sql)); return null; } catch (e) { return String(e.message); } }
const SIG = 'public.plan_split_piece(jsonb,text,text)';
const md5 = async (db) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${SIG}'::regprocedure`)).m;

// test rows only: legacy ids rec87..., references T87-..., locations TEST 087 ...
const HELPERS = `
CREATE SEQUENCE t87_n;
-- a VS import that stands at Veroia (one unloading of p_pallets on p_hub + 1): plan_bridge_sync makes its one piece,
-- positioned at the hub, nat_due_day = the unloading day
CREATE FUNCTION t87_vs(p_hub date, p_pallets numeric) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint; r text := nextval('t87_n')::text;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec87X' || r, 'TEST 087 abroad ' || r) returning id into lx;
  insert into locations (legacy_id, name) values ('rec87G' || r, 'TEST 087 GR ' || r) returning id into lg;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec87O' || r, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 1, p_hub, 'T87-' || r,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec87A' || r, 'Loading', 1, p_hub - 3, o, lx, p_pallets);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec87H' || r, 'Cross-dock', 1, p_hub, o, hub, p_pallets);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec87S' || r, 'Unloading', 1, p_hub + 1, o, lg, p_pallets);
  return (select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id
           where s.order_id = o and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null);
end $t$;
-- ONE new OWNED cycle on day p_day that takes p_piece from Veroia to its Greek stop (as plan-082's t82_put)
CREATE FUNCTION t87_put(p_piece bigint, p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare trk bigint; hub bigint; r jsonb;
begin
  select id into hub from locations where is_hub;
  insert into trucks (license_plate) values ('TEST-087-' || nextval('t87_n')) returning id into trk;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece, 'drop', 'd')),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk), 'side', 'KATHODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', hub, 'side', 'KATHODOS',
             'planned_from', (p_day + time '06:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '07:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'side', 'KATHODOS',
             'location_id', (select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece),
             'planned_from', (p_day + time '10:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '11:00') at time zone 'Europe/Athens'))),
       'test:087', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;`;

// A scenario inside a transaction that is always rolled back; the deferred rules fire before the rows are read
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
let rq = 0;
const rid = () => `00000000-0000-4087-8000-${String(++rq).padStart(12, '0')}`;
// one split of an 11-pallet piece into two parts that stay (4 + 7); parts[i] is merged into its { pallets }
const split = (db, L, parts) => scenario(db, async () => {
  const pc = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 11)`);
  const due = (await one(db, `SELECT nat_due_day::text AS d FROM v_piece_state WHERE piece_id = $1`, [pc])).d;
  const body = { piece_id: pc, request_id: rid(), parts: [{ pallets: 4, ...parts[0] }, { pallets: 7, ...parts[1] }] };
  const err = await errorOf(db, `SELECT plan_split_piece($1::jsonb, 'test:087', 'dispatcher')`, [JSON.stringify(body)]);
  if (err) return { err, due };
  const kids = (await db.query(`SELECT sp.id, sp.pallets::numeric AS pallets, sp.leave_by::text AS leave_by, ps.overdue, ps.is_stock
    FROM shipment_pieces sp JOIN v_piece_state ps ON ps.piece_id = sp.id
    WHERE sp.parent_piece_id = $1 AND sp.deleted_at IS NULL ORDER BY sp.pallets`, [pc])).rows;
  const audit = (await db.query(`SELECT after_data->>'leave_by' AS leave_by FROM audit_log
    WHERE table_name = 'shipment_pieces' AND action = 'create' AND record_id = ANY($1::text[])`,
    [kids.map((k) => String(k.id))])).rows.map((r) => r.leave_by);
  return { err: null, due, kids, audit };
});
// a split whose FIRST part rides a real cycle: the piece's own empty-run cycle (made for a twin piece of the same place,
// the cycle's Veroia stop + its drop stop), the second part stays with p_stay merged in
const splitRide = (db, L, stay) => scenario(db, async () => {
  const pc = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 11)`);
  const due = (await one(db, `SELECT nat_due_day::text AS d FROM v_piece_state WHERE piece_id = $1`, [pc])).d;
  // the twin: another delivery to the SAME place, put on a new cycle the part can join
  const twin = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 5)`);
  await db.query(`UPDATE order_stops SET location_id = (SELECT vs.nat_to_location_id FROM shipment_pieces sp JOIN v_shipments vs ON vs.shipment_id = sp.shipment_id WHERE sp.id = $1)
    WHERE id = (SELECT s.order_stop_id FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id WHERE sp.id = $2)`, [pc, twin]);
  const rt = await num(db, `SELECT t87_put($1, DATE '${L}' + 4)`, [twin]);
  const stops = (await db.query(`SELECT id FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL ORDER BY planned_from`, [rt])).rows.map((r) => Number(r.id));
  const body = { piece_id: pc, request_id: rid(), parts: [
    { pallets: 4, target: { rt_id: rt, side: 'KATHODOS' }, stops: [{ ref: 'p', stop_id: stops[0] }, { ref: 'd', stop_id: stops[1] }] },
    { pallets: 7, ...stay }] };
  const err = await errorOf(db, `SELECT plan_split_piece($1::jsonb, 'test:087', 'dispatcher')`, [JSON.stringify(body)]);
  if (err) return { err, due };
  const kids = (await db.query(`SELECT sp.pallets::numeric AS pallets, sp.leave_by::text AS leave_by, ps.is_stock,
      (SELECT count(*)::int FROM piece_legs l WHERE l.piece_id = sp.id AND l.deleted_at IS NULL) AS legs
    FROM shipment_pieces sp JOIN v_piece_state ps ON ps.piece_id = sp.id
    WHERE sp.parent_piece_id = $1 AND sp.deleted_at IS NULL ORDER BY sp.pallets`, [pc])).rows;
  return { err: null, due, kids };
});
const dayBefore = (ymd) => new Date(Date.parse(ymd) - 864e5).toISOString().slice(0, 10);

test('087 on the production-shaped copy (1/11): leave_by refused on the live text, written after 087', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  // the copy's seed is the whole catalog (B-100's file included): 080 seeds its own check, as plan-080.test.mjs
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('087_plan_split_leave_by.sql');
  const F = facts(src);
  const live = await md5(db);
  const trg0 = await num(db, TRG);
  await db.query(`UPDATE monitoring.checks SET red_value = $1 WHERE id = 'B-54'`, [trg0]);
  const day = (n) => new Date(Date.parse(L) + n * 864e5).toISOString().slice(0, 10);

  await t.test('the copy holds the LIVE text 087 guards on (production md5, SELECT 1/11)', async () => {
    assert.strictEqual(live, F.live[SIG]);
    assert.strictEqual(live, '4a61314bbab1492431750fd75cffdb14');
  });
  await t.test('NO-GO on the live text: a leave_by on a part that stays is refused (bad_input)', async () => {
    const r = await split(db, L, [{}, { leave_by: day(10) }]);
    assert.match(r.err ?? '', /bad_input:part\.leave_by$/, r.err);   // plan_h_keys: an unknown key of a part
  });
  await t.test('live: without leave_by both parts get nat_due_day - 1', async () => {
    const r = await split(db, L, [{}, {}]);
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null);
    assert.deepStrictEqual(r.kids.map((k) => k.leave_by), [dayBefore(r.due), dayBefore(r.due)]);
  });

  await t.test('087 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('087_plan_split_leave_by_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 087 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}087 ran: split ${F.gen[0].m}`), msg);
    assert.strictEqual(await md5(db), live);
  });
  await t.test('087 applies; the text is the generated one, the rights as before, no trigger', async () => {
    const acl0 = await one(db, `SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = '${SIG}'::regprocedure`);
    await db.exec(src);
    assert.strictEqual(await md5(db), F.gen[0].m);
    assert.deepStrictEqual(await one(db, `SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = '${SIG}'::regprocedure`), acl0);
    assert.strictEqual(await num(db, TRG), trg0);
    assert.strictEqual((await one(db, read('087_plan_split_leave_by_verify.sql'))).applied, '087 in place');
  });
  await t.test('087 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /087: public\.plan_split_piece.* is not its live text of 1\/11/);
    assert.strictEqual(await md5(db), F.gen[0].m);
  });

  await t.test('GO: the chosen day is written on its part (row and audit), the other part keeps nat_due_day - 1', async () => {
    const r = await split(db, L, [{}, { leave_by: day(10) }]);
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null, 'the deferred rules pass');
    assert.deepStrictEqual(r.kids.map((k) => [Number(k.pallets), k.leave_by, k.is_stock]), [[4, dayBefore(r.due), true], [7, day(10), true]]);
    assert.deepStrictEqual(r.audit.sort(), [dayBefore(r.due), day(10)].sort(), 'the audit rows hold what was written');
  });
  await t.test('GO: a part on a truck rides with NO leave_by (decision 18), the part that stays gets the chosen day', async () => {
    const r = await splitRide(db, L, { leave_by: day(9) });
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null, 'the deferred rules pass');
    assert.deepStrictEqual(r.kids.map((k) => [Number(k.pallets), k.leave_by, k.is_stock, k.legs]), [[4, null, false, 1], [7, day(9), true, 0]]);
  });
  await t.test('GO: a day already gone is written (relaxed rules), and the part reads late at once', async () => {
    const r = await split(db, L, [{ leave_by: '2026-01-05' }, {}]);
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null);
    const k = r.kids.find((x) => Number(x.pallets) === 4);
    assert.strictEqual(k.leave_by, '2026-01-05');
    assert.strictEqual(k.overdue, true);
  });
  for (const [why, part, code] of [
    ['with a target (a part that rides has no deadline)', { leave_by: '2026-11-20', target: { rt_id: 1, side: 'KATHODOS' } }, /bad_input:part\.leave_by with target$/],
    ['null', { leave_by: null }, /bad_input:part\.leave_by: YYYY-MM-DD$/],
    ['a number', { leave_by: 20261120 }, /bad_input:part\.leave_by: YYYY-MM-DD$/],
    ['a time in it', { leave_by: '2026-11-20T10:00' }, /bad_input:part\.leave_by: YYYY-MM-DD$/],
    ['a day that does not exist', { leave_by: '2026-02-30' }, /bad_input:22008$/],   // the handler: invalid_datetime_format / field overflow
  ]) {
    await t.test(`refused (bad_input): leave_by ${why}`, async () => {
      const r = await split(db, L, [{}, part]);
      assert.match(r.err ?? '', code, r.err);
    });
  }

  await t.test('rollback dry run keeps nothing; the rollback brings the live text and the live refusal back', async () => {
    const msg = await errorOf(db, read('087_plan_split_leave_by_rollback_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 087 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: split ${live}`), msg);
    assert.strictEqual(await md5(db), F.gen[0].m);
    await db.exec(read('087_plan_split_leave_by_rollback.sql'));
    assert.strictEqual(await md5(db), live);
    assert.match((await split(db, L, [{}, { leave_by: day(10) }])).err ?? '', /bad_input/);
    assert.strictEqual((await one(db, read('087_plan_split_leave_by_verify.sql'))).applied, '087 NOT APPLIED');
  });
});
