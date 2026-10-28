// 079 (day L moves back from 31/10 to 24/10, owner 28/10) on the production-shaped PGlite copy as production holds
// it on 28/10: prod-shaped-074.mjs (072 ... 074a, 074, 074b), then 075 and 076, with plan_config as production holds
// it (L 31/10, opened 28/10 11:39 UTC). The week of 24-30/10 is built as production's (SELECT 28/10 16:10): 9 VS,
// 19 national-side stops, 8 live Direct NL (2 Delivered), hub days 25/10 x2, 26/10 x3, 28/10 x2, 30/10 x2; plus four
// controls the move must not touch (a VS of 23/10, a Cancelled VS of the week, a VS of 7/11 bridged by the trigger,
// a VS bridged on 7/11 that the desk then moved into the week - "once v5"). Every case reads ROWS.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const n = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
// a case that must change nothing: inside a transaction that is always rolled back
async function inTx(db, setup, sql) {
  await db.exec('BEGIN');
  try { if (setup) await db.exec(setup); return await errorOf(db, sql); } finally { await db.exec('ROLLBACK'); }
}

const SRC = '079_plan_cutover_move.sql';
const DRY = '079_plan_cutover_move_dryrun.sql';
const RB = '079_plan_cutover_move_rollback.sql';
const RB_DRY = '079_plan_cutover_move_rollback_dryrun.sql';
const VERIFY = '079_plan_cutover_move_verify.sql';

// test rows only: legacy ids rec79..., references T79-..., locations TEST 079 ...
const HELPERS = `
CREATE FUNCTION t79_vs(p_ref text, p_dir text, p_hub date, p_pallets numeric[], p_nl text, p_status text DEFAULT 'Pending') RETURNS bigint
LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint; nl bigint; tot numeric := 0;
begin
  select id into hub from locations where is_hub;
  select coalesce(sum(x), 0) into tot from unnest(p_pallets) x;
  insert into locations (legacy_id, name) values ('rec79X' || p_ref, 'TEST 079 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec79O' || p_ref, 'International', p_dir, p_status, true, p_hub - 2, p_hub + 2, p_hub, 'T79-' || p_ref,
          (select min(id) from clients)) returning id into o;
  if p_nl is not null then   -- the Direct national load the old model wrote before day L (the freeze bypassed, as then)
    set local session_replication_role = replica;
    insert into national_loads (legacy_id, source_type, source_order_id, status, loading_datetime, delivery_datetime)
    values ('rec79N' || p_ref, 'Direct', o, p_nl, p_hub, p_hub + 1) returning id into nl;
    -- its own stop and ramp line, as production's NL have (the soft delete cascades to both)
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, national_load_id, pallets)
    values ('rec79L' || p_ref, 'Loading', 1, p_hub, nl, tot);
    insert into ramp (legacy_id, plan_date, type, status, national_load_id) values ('rec79R' || p_ref, p_hub, 'Loading', 'Planned', nl);
    set local session_replication_role = origin;
  end if;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec79A' || p_ref, case when p_dir = 'Import' then 'Loading' else 'Unloading' end, 1,
          case when p_dir = 'Import' then p_hub - 2 else p_hub + 2 end, o, lx, tot);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec79H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, tot);
  for i in 1 .. coalesce(array_length(p_pallets, 1), 0) loop
    insert into locations (legacy_id, name) values ('rec79G' || p_ref || i, 'TEST 079 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec79S' || p_ref || i, case when p_dir = 'Import' then 'Unloading' else 'Loading' end, i,
            case when p_dir = 'Import' then p_hub + 1 else p_hub - 1 end, o, lg, p_pallets[i]);
  end loop;
  return o;
end $t$;`;
// production's week (28/10): direction, hub day, pallets per national-side stop, NL status (null = no NL)
const WEEK = [
  ['A1', 'Import', '2026-10-25', [5], 'Delivered'], ['A2', 'Import', '2026-10-25', [5], 'Pending'],
  ['A3', 'Import', '2026-10-26', [3, 3, 3], 'Delivered'], ['A4', 'Import', '2026-10-26', [2, 2, 2], 'Pending'],
  ['A5', 'Import', '2026-10-26', [1, 1, 1, 1], null], ['A6', 'Import', '2026-10-28', [4], 'Pending'],
  ['A7', 'Export', '2026-10-28', [3, 3], 'Pending'], ['A8', 'Export', '2026-10-30', [6], 'Pending'],
  ['A9', 'Export', '2026-10-30', [2, 2, 2], 'Pending'],
];
const vs = (r, dir, hub, p, nl, st = 'Pending') =>
  `SELECT t79_vs('${r}', '${dir}', DATE '${hub}', ARRAY[${p.join(',')}]::numeric[], ${nl ? `'${nl}'` : 'NULL'}, '${st}');`;
const ref = (r) => `T79-${r}`;
const GAP = `SELECT count(*) FROM order_stops s WHERE s.order_id IS NOT NULL
  AND (plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
       OR s.via_hub <> plan_h_bridge_wanted(s.id))`;
const B78 = `SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)`;
const STATE = `SELECT (SELECT cutover_day::text FROM plan_config) AS l, (SELECT opened_at FROM plan_config) AS opened,
  (SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.plan_config'::regclass AND contype = 'c') AS checks,
  (SELECT count(*) FROM shipments WHERE deleted_at IS NULL)::int AS bridges, (SELECT count(*) FROM order_stops WHERE via_hub)::int AS via,
  (SELECT count(*) FROM national_loads WHERE deleted_at IS NULL)::int AS nl, (SELECT count(*) FROM plan_cutover_log)::int AS log,
  (SELECT count(*) FROM order_stops WHERE order_id IS NULL AND deleted_at IS NULL)::int AS nl_stops,
  (SELECT count(*) FROM ramp WHERE deleted_at IS NULL)::int AS ramp,
  (SELECT count(*) FROM plan_notices)::int AS notices, (SELECT count(*) FROM audit_log)::int AS audit`;
const inV5 = (db, r) => one(db, `SELECT plan_h_vs_in_v5(id) AS v FROM orders WHERE reference = $1`, [ref(r)]).then((x) => x.v);
const bridgesOf = (db, r) => n(db, `SELECT count(*) FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.reference = $1 AND s.deleted_at IS NULL`, [ref(r)]);
const nlLive = (db, r) => n(db, `SELECT count(*) FROM national_loads nl JOIN orders o ON o.id = nl.source_order_id WHERE o.reference = $1 AND nl.deleted_at IS NULL`, [ref(r)]);
const shipIds = (db, r) => db.query(`SELECT s.id FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.reference = $1 AND s.deleted_at IS NULL ORDER BY 1`, [ref(r)]).then((x) => x.rows.map((y) => Number(y.id)));
// B-26's ids as the runner holds them, without its 15' tolerance (every row of the copy is minutes old)
const b26 = (db) => one(db, `SELECT ids_sql FROM monitoring.checks WHERE id = 'B-26'`)
  .then((x) => one(db, x.ids_sql.replace("interval '15 minutes'", "interval '-1 minute'"))).then((x) => Object.values(x)[0]);
const checkSql = (db, id) => one(db, `SELECT sql_text FROM monitoring.checks WHERE id = $1`, [id]).then((x) => x.sql_text);

async function copy() {
  const db = await prodShaped074();
  await db.exec(read('075_plan_order_side.sql'));
  await db.exec(read('076_plan_board_speed.sql'));
  // production's row: L 31/10, opened 28/10 11:39 UTC (the copy's 074 ran with the next Saturday, now())
  await db.exec(`UPDATE plan_config SET cutover_day = DATE '2026-10-31', opened_at = TIMESTAMPTZ '2026-10-28 11:39:17+00'`);
  await db.exec(HELPERS);
  for (const w of WEEK) await db.exec(vs(...w));
  await db.exec(vs('C1', 'Import', '2026-10-23', [4], 'Pending'));               // before the week: stays old
  await db.exec(vs('C2', 'Import', '2026-10-27', [4], 'Pending', 'Cancelled'));  // the week, Cancelled: VS off
  await db.exec(vs('C3', 'Import', '2026-11-07', [4], 'Pending'));               // after 31/10: bridged by the trigger
  await db.exec(vs('C4', 'Export', '2026-11-07', [2], 'Pending'));               // bridged, then moved into the week:
  await db.exec(`UPDATE orders SET cross_dock_date = DATE '2026-10-29' WHERE reference = 'T79-C4'`);   // once v5
  return db;
}

test('079 on the production-shaped copy', async (t) => {
  const db = await copy();
  const src = read(SRC);
  const trg0 = await n(db, TRG);
  const before = await one(db, STATE);
  const legs0 = await n(db, `SELECT count(*) FROM piece_legs`);
  const c3 = await shipIds(db, 'C3'), c4 = await shipIds(db, 'C4');
  const b26before = await b26(db);

  await t.test('NO-GO on main as it is: the week is the old model, and the table refuses a day L of 24/10', async () => {
    assert.strictEqual(before.l, '2026-10-31');
    for (const [r] of WEEK) {
      assert.strictEqual(await inV5(db, r), false, `${r} not in v5`);
      assert.strictEqual(await bridgesOf(db, r), 0, `${r} no bridge`);
    }
    assert.strictEqual(await n(db, `SELECT count(*) FROM national_loads nl JOIN orders o ON o.id = nl.source_order_id
      WHERE nl.deleted_at IS NULL AND o.reference LIKE 'T79-A%'`), 8, 'the 8 NL of the week live');
    assert.strictEqual(c3.length, 1, 'C3 bridged by the trigger (hub 7/11 >= L)');
    assert.strictEqual(await nlLive(db, 'C3'), 0);
    assert.strictEqual(c4.length, 1, 'C4 stays bridged after its move into the week (once v5)');
    assert.strictEqual(await inV5(db, 'C4'), true);
    assert.strictEqual(await n(db, GAP), 0);
    assert.strictEqual(await n(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0);
    // the feasibility read of 28/10 missed this CHECK of 074a: a bare UPDATE cannot move L into the past
    const e = await inTx(db, null, `UPDATE plan_config SET cutover_day = DATE '2026-10-24'`);
    assert.match(e ?? '', /plan_config_future/, e);
  });

  await t.test('guards: 076 missing, a changed live text, B-54, B-95 red, a day that is not a Saturday', async () => {
    assert.match(await inTx(db, read('076_plan_board_speed_rollback.sql'), src) ?? '', /079: 076 is not applied/);
    assert.match(await inTx(db, `DO $x$ BEGIN EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_config_read() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS %L',
      (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_config_read()'::regprocedure) || E'\\n'); END $x$;`, src) ?? '',
      /079: public\.plan_config_read\(\) is not the live text measured 28\/10/);
    assert.match(await inTx(db, `UPDATE monitoring.checks SET red_value = red_value + 1 WHERE id = 'B-54'`, src) ?? '', /079: B-54 red_value is not the live trigger count/);
    assert.match(await inTx(db, `UPDATE order_stops SET via_hub = true WHERE legacy_id = 'rec79SC11'`, src) ?? '', /079: B-95 is red before 079/);
    const bad = src.replace("c_new CONSTANT date := DATE '2026-10-24'", "c_new CONSTANT date := DATE '2026-10-23'");
    assert.notStrictEqual(bad, src);
    assert.match(await errorOf(db, bad) ?? '', /079: the new day L 2026-10-23 is not a Saturday/);
    assert.deepStrictEqual(await one(db, STATE), before, 'nothing kept');
  });

  await t.test('the dry run runs to its end with production\'s numbers and keeps nothing', async () => {
    const msg = await errorOf(db, read(DRY));
    assert.match(msg ?? '', new RegExp('DRY RUN 079 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end  \\|\\|  079 ran: '
      + `cutover 2026-10-24, bridges 19 on 9 VS \\(by hub day 10-25:2 10-26:3 10-28:2 10-30:2\\), NL unlinked 8 `
      + `\\(their stops 8, ramp lines 8, local moves 0 off with them\\), NL to re-record 2 \\[\\d+,\\d+\\], `
      + `via_hub ${before.via + 19}, legs ${legs0}, triggers ${trg0}, B-54 ${trg0}`), msg);
    assert.deepStrictEqual(await one(db, STATE), before, 'nothing kept');
  });

  await t.test('079 applies: the week is v5, 19 bridges on 9 VS, 8 NL unlinked, 2 to re-record, the controls untouched', async () => {
    const r = (await db.exec(src)).at(-1).rows[0];
    assert.strictEqual(r.result, '079 OK');
    assert.strictEqual(Number(r.bridges_079), 19);
    assert.strictEqual(Number(r.via_hub), before.via + 19);
    const after = await one(db, STATE);
    assert.strictEqual(after.l, '2026-10-24');
    assert.deepStrictEqual(after.opened, before.opened, 'opened_at stays (B-96..B-98 count from it)');
    assert.strictEqual(after.checks, 'plan_config_floor,plan_config_one,plan_config_saturday');
    assert.strictEqual(after.bridges, before.bridges + 19);
    assert.strictEqual(after.nl, before.nl - 8);
    assert.strictEqual(after.log, before.log + 8);
    assert.strictEqual(after.notices, before.notices + 2);
    assert.strictEqual(after.nl_stops, before.nl_stops - 8, 'the NL\'s own stops went with them');
    assert.strictEqual(after.ramp, before.ramp - 8, 'their ramp lines too');
    for (const [r, , , p, nl] of WEEK) {
      assert.strictEqual(await inV5(db, r), true, `${r} in v5`);
      assert.strictEqual(await bridgesOf(db, r), p.length, `${r} one bridge per national-side stop`);
      assert.strictEqual(await nlLive(db, r), 0, `${r} NL unlinked`);
      assert.strictEqual(await n(db, `SELECT count(*) FROM plan_notices pn JOIN orders o ON o.id = pn.order_id
        WHERE o.reference = $1 AND pn.kind = 'legacy_nl_replaced'`, [ref(r)]), nl === 'Delivered' ? 1 : 0, `${r} notice`);
    }
    assert.strictEqual(await inV5(db, 'C1'), false);
    assert.strictEqual(await nlLive(db, 'C1'), 1, 'C1 (23/10) keeps its NL');
    assert.strictEqual(await inV5(db, 'C2'), false);
    assert.strictEqual(await nlLive(db, 'C2'), 1, 'C2 (Cancelled) keeps its NL');
    assert.deepStrictEqual(await shipIds(db, 'C3'), c3);
    assert.deepStrictEqual(await shipIds(db, 'C4'), c4);
    assert.strictEqual(await n(db, GAP), 0);
    assert.strictEqual(await n(db, B78), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM piece_legs`), legs0);
    assert.strictEqual(await n(db, TRG), trg0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM audit_log WHERE actor = '079' AND table_name = 'plan_config'`), 1);
    assert.strictEqual((await one(db, `SELECT plan_config_read() AS j`)).j.cutover_day, '2026-10-24');
    // the auditor's own texts (as the runner holds them) read the new cut: B-95 0, B-26 0
    assert.strictEqual(await n(db, await checkSql(db, 'B-95')), 0);
    // before: A5 (production's 555, a VS with no NL that the freeze will never give one) is red on B-26; after: no
    // VS of the week (the copy's own 073 VS aside)
    assert.ok(b26before.includes('rec79OA5'), `B-26 before ${b26before}`);
    assert.deepStrictEqual(await b26(db), b26before.filter((x) => x !== 'rec79OA5'));
  });

  await t.test('verify reads it; a second run refuses; the table refuses an L before 24/10', async () => {
    const v = await one(db, read(VERIFY));
    assert.strictEqual(v.applied, '079 in place');
    assert.strictEqual(v.floor, true);
    assert.strictEqual(Number(v.week_vs), 10, 'the 9 of production + C4 (C2 is Cancelled)');
    assert.strictEqual(Number(v.week_vs_in_v5), 10);
    assert.strictEqual(Number(v.week_nl_live), 0);
    assert.deepStrictEqual([v.bridges_079, v.nl_unlinked_079, v.notices_079, v.gap, v.b78].map(Number), [19, 8, 2, 0, 0]);
    assert.strictEqual(v.b54_matches, true);
    assert.match(await errorOf(db, src) ?? '', /079: day L is already 2026-10-24/);
    assert.match(await inTx(db, null, `UPDATE plan_config SET cutover_day = DATE '2026-10-17'`) ?? '', /plan_config_floor/);
  });

  await t.test('after 079 the cut is live: a new VS of the week is bridged by the trigger, its NL unlinked', async () => {
    await db.exec(vs('N1', 'Import', '2026-10-27', [3], 'Pending'));
    assert.strictEqual(await bridgesOf(db, 'N1'), 1);
    assert.strictEqual(await nlLive(db, 'N1'), 0);
    assert.strictEqual(await n(db, GAP), 0);
  });

  await t.test('the rollback refuses once a person touched a piece 079 brought (a leg, an audit row)', async () => {
    const piece = await n(db, `SELECT sp.id FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id JOIN orders o ON o.id = s.order_id
      WHERE o.reference = 'T79-A2' AND sp.deleted_at IS NULL`);
    const leg = `SET CONSTRAINTS ALL DEFERRED;
      DO $x$ DECLARE rt bigint; s1 bigint; s2 bigint; f timestamptz := TIMESTAMPTZ '2026-10-26 06:00+02'; BEGIN
        INSERT INTO ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', DATE '2026-10-26', DATE '2026-10-26', f, f + interval '8 hours', 'planned', 'planner', 'test:079') RETURNING id INTO rt;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt, 1, (SELECT id FROM locations WHERE is_hub), 'KATHODOS', f, f + interval '1 hour', 'test:079') RETURNING id INTO s1;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt, 2, (SELECT id FROM locations WHERE legacy_id = 'rec79GA21'), 'KATHODOS', f + interval '3 hours', f + interval '4 hours', 'test:079') RETURNING id INTO s2;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (${piece}, 1, rt, s1, s2, 'test:079');
      END $x$;`;
    assert.match(await inTx(db, leg, read(RB)) ?? '', /079 rollback: after the point of no return/);
    assert.match(await inTx(db, `INSERT INTO audit_log (actor, role, action, table_name, record_id) VALUES ('a dispatcher', 'dispatcher', 'update', 'shipment_pieces', '${piece}')`, read(RB)) ?? '',
      /079 rollback: after the point of no return/);
  });

  await t.test('the rollback refuses an NL that changed since 079 (its log row is the only trace)', async () => {
    assert.match(await inTx(db, `UPDATE national_loads SET deleted_at = deleted_at + interval '1 second' WHERE legacy_id = 'rec79NA2'`, read(RB)) ?? '',
      /079 rollback: national load \d+ is not as 079 left it/);
  });

  await t.test('rollback: dry run keeps nothing; then L 31/10, the week out of v5 with its NL back, the controls untouched; 079 again', async () => {
    // a bridge 079 brought and the trigger retired since (its stop lost its pallets): the cut must forget it too
    await db.exec(`UPDATE order_stops SET pallets = 0 WHERE legacy_id = 'rec79SA33'`);
    assert.strictEqual(await bridgesOf(db, 'A3'), 2);
    const at79 = await one(db, STATE);
    const msg = await errorOf(db, read(RB_DRY));
    assert.match(msg ?? '', /DRY RUN 079 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: day L 2026-10-31, live bridges \d+, via_hub \d+, live NL of the week 10, triggers \d+/, msg);
    assert.deepStrictEqual(await one(db, STATE), at79, 'nothing kept (the 10: the 8, N1\'s, the Cancelled C2\'s own)');

    await db.exec(read(RB));
    const back = await one(db, STATE);
    assert.strictEqual(back.l, '2026-10-31');
    assert.deepStrictEqual(back.opened, before.opened);
    assert.strictEqual(back.checks, 'plan_config_future,plan_config_one,plan_config_saturday');
    assert.strictEqual(back.bridges, before.bridges, 'the 19 of 079 and N1\'s out');
    assert.strictEqual(back.via, before.via);
    assert.strictEqual(back.nl, before.nl + 1, 'the 8 NL back, plus N1\'s (written after 079)');
    assert.strictEqual(back.log, before.log, '079\'s log rows go');
    assert.strictEqual(back.nl_stops, before.nl_stops + 1, 'their own stops back (N1\'s too)');
    assert.strictEqual(back.ramp, before.ramp + 1, 'their ramp lines back (N1\'s too)');
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.reference = 'T79-A3'
      AND s.deleted_reason IS DISTINCT FROM '074 rollback'`), 0, 'A3\'s retired bridge relabelled');
    assert.strictEqual(await n(db, `SELECT count(*) FROM audit_log WHERE actor = '079 rollback' AND table_name = 'shipments' AND action = 'update'`), 1,
      'the relabel of an already retired bridge is an update, not a second delete');
    for (const [r] of [...WEEK, ['N1']]) {
      assert.strictEqual(await inV5(db, r), false, `${r} out of v5`);
      assert.strictEqual(await bridgesOf(db, r), 0, `${r} no live bridge`);
    }
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_notices WHERE created_by = '079 backfill' AND read_by = '079 rollback'`), 2);
    assert.deepStrictEqual(await shipIds(db, 'C3'), c3);
    assert.deepStrictEqual(await shipIds(db, 'C4'), c4);
    assert.strictEqual(await inV5(db, 'C4'), true, 'C4 stays v5 (bridged by 074, before 079)');
    assert.strictEqual(await n(db, GAP), 0);
    assert.strictEqual(await n(db, B78), 0);
    assert.strictEqual(await n(db, TRG), trg0);
    assert.strictEqual(await n(db, await checkSql(db, 'B-95')), 0);
    assert.match(await errorOf(db, read(RB)) ?? '', /079 rollback: day L is not 2026-10-24/);

    // 079 again: the same move, N1 now among the week (its first bridge is gone with the reason the cut ignores),
    // A3's third stop without pallets
    const r = (await db.exec(src)).at(-1).rows[0];
    assert.strictEqual(r.result, '079 OK');
    assert.strictEqual(Number(r.bridges_079), 19);
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_cutover_log WHERE reason = '079 backfill'`), 9);
    assert.strictEqual(await n(db, GAP), 0);
    assert.strictEqual(await n(db, B78), 0);
  });
});
