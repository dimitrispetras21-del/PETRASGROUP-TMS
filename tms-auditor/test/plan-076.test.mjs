// 076 (the board answers in time) on the production-shaped PGlite copy as production holds it after 28/10
// (prod-shaped-075.mjs: 072 ... 074a, 074, 075), with a small v5 week that HAS late pieces - so the rule 076 rewrites (has_late) is seen
// true and false, never only false. What it proves: the dry run keeps no definition; 076 replaces the view and
// analyzes the 17 tables; the view answers the same rows (076's own proof, and here again outside it); plan_board's
// text and B-54 stay; a changed rule is refused by the row proof; the rollback gives 071's view back byte for byte.
// The timings are tms-auditor/test/tools/measure-076.mjs (not a test: it times a wasm Postgres).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRG } from './prod-shaped-072.mjs';
import { prodShaped075 } from './prod-shaped-075.mjs';
import { migrationFile } from '../lib/db.mjs';
import { constants } from '../../worker/migrations/drafts/tools/build-076.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const one = async (db, sql) => (await db.query(sql)).rows[0];
const VIEW_MD5 = `SELECT md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) AS m`;
const ROWS = `SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.stop_id), '')) AS m, count(*) FILTER (WHERE v.has_late) AS late,
  count(*) FILTER (WHERE NOT v.has_late) AS on_time FROM v_rt_stop_state v`;
const BOARD_MD5 = `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure`;
// what the board ANSWERS for the week of the fixture (Saturday 5/12), for two roles
const ANSWER = `SELECT md5(plan_board(DATE '2026-12-05', 'dispatcher')::text || plan_board(DATE '2026-12-05', 'owner')::text) AS m,
  jsonb_array_length(plan_board(DATE '2026-12-05', 'dispatcher')->'cycles') AS cycles`;

// three v5 cycles of one week; each carries a national to its delivery and a VS import from Veroia, the VS of the
// second cycle asked one day earlier than the cycle delivers it (late) - written with the COMMIT rules deferred
const WEEK = `BEGIN; SET CONSTRAINTS ALL DEFERRED;
DO $g$ DECLARE hub bigint; la bigint; lb bigint; cl bigint; rt bigint; s1 bigint; s2 bigint; s3 bigint; n bigint; sh bigint;
  p bigint; o bigint; os bigint; d date; f timestamptz; c int;
BEGIN
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec076TA', 'TEST 076 A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec076TB', 'TEST 076 B') RETURNING id INTO lb;
  INSERT INTO clients (company_name) VALUES ('TEST 076 client') RETURNING id INTO cl;
  FOR c IN 1..3 LOOP
    d := DATE '2026-12-07' + c; f := (d + time '06:00') AT TIME ZONE 'Europe/Athens';
    INSERT INTO ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
    VALUES (2, 'NATL', 'OWNED', d, d, f, f + interval '10 hours', 'planned', 'planner', 'test:076') RETURNING id INTO rt;
    INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
    VALUES (rt, 1, la, 'KATHODOS', f, f + interval '1 hour', 'test:076') RETURNING id INTO s1;
    INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
    VALUES (rt, 2, hub, 'KATHODOS', f + interval '2 hours', f + interval '3 hours', 'test:076') RETURNING id INTO s2;
    INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
    VALUES (rt, 3, lb, 'KATHODOS', f + interval '5 hours', f + interval '6 hours', 'test:076') RETURNING id INTO s3;
    INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets) VALUES ('rec076TN' || c, cl, 'WN076-TEST', 100, 3) RETURNING id INTO n;
    INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from, deliver_to, created_by)
    VALUES (n, la, lb, 3, f, f + interval '1 hour', f + interval '5 hours', f + interval '6 hours', 'test:076') RETURNING id INTO sh;
    INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh, 3, 'test:076') RETURNING id INTO p;
    INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p, 1, rt, s1, s3, 'test:076');
    INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, cross_dock_date, reference, client_id)
    VALUES ('rec076TO' || c, 'International', 'Import', 'Pending', true, d, 'WN076-TEST', cl) RETURNING id INTO o;
    INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    VALUES ('rec076TS' || c, 'Unloading', 1, CASE WHEN c = 2 THEN d - 1 ELSE d END, o, lb, 8) RETURNING id INTO os;
    INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (o, os, 'test:076') RETURNING id INTO sh;
    INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh, 8, 'test:076') RETURNING id INTO p;
    INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p, 1, rt, s2, s3, 'test:076');
  END LOOP;
END $g$;
COMMIT;`;

async function prodShaped() {
  const db = await prodShaped075();
  await db.exec(WEEK);
  return db;
}

test('076 on the production-shaped copy', async (t) => {
  const db = await prodShaped();
  const src = read('076_plan_board_speed.sql');
  const { old, neu, tables } = constants(src);
  const trg0 = Number((await one(db, TRG)).n);
  const board0 = (await one(db, BOARD_MD5)).m;
  const rows0 = await one(db, ROWS);
  const answer0 = await one(db, ANSWER);

  await t.test('the copy holds 071\'s view as production (md5 of 28/10), and the week has late AND on-time stops', async () => {
    assert.strictEqual(old, 'f758827112c0a1a34f3feebb8cd36c44');
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
    assert.ok(Number(rows0.late) >= 1, `late stops ${rows0.late}`);
    assert.ok(Number(rows0.on_time) >= 3, `on-time stops ${rows0.on_time}`);
    assert.strictEqual(tables.length, 17);
  });

  await t.test('076 dry run runs to its end and keeps the view', async () => {
    const msg = await errorOf(db, read('076_plan_board_speed_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 076 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}076 ran: view new yes, analyzed 17, triggers (\d+), B-54 \1/, msg);
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
  });

  await t.test('a changed rule is refused by the row proof (same text measured, other rows)', async () => {
    // has_late without "late": every end stop would read late. Its md5 is measured as the migration measures its own,
    // so only the row proof can stop it.
    const bad = src.replace('WHERE ps.late AND ps.end_stop_id IS NOT NULL', 'WHERE ps.end_stop_id IS NOT NULL');
    assert.notStrictEqual(bad, src);
    const viewOnly = /(CREATE OR REPLACE VIEW public\.v_rt_stop_state[\s\S]*?\n  FROM st;)/.exec(bad)[1];
    await db.exec('BEGIN');
    await db.exec(viewOnly);
    const badMd5 = (await one(db, VIEW_MD5)).m;
    await db.exec('ROLLBACK');
    const msg = await errorOf(db, bad.replace(`m_view_new CONSTANT text := '${neu}'`, `m_view_new CONSTANT text := '${badMd5}'`));
    assert.match(msg ?? '', /076 proof: v_rt_stop_state answers other rows than before/, msg);
    assert.strictEqual((await one(db, VIEW_MD5)).m, old, 'nothing kept');
  });

  await t.test('076 applies: the new view, 17 tables analyzed, the same rows, plan_board and B-54 unchanged', async () => {
    const r = (await db.exec(src)).at(-1).rows[0];
    assert.strictEqual(r.result, '076 OK');
    assert.strictEqual(r.view_md5, neu);
    assert.strictEqual(Number(r.analyzed), 17);
    assert.strictEqual(Number(r.public_triggers), trg0);
    assert.strictEqual(Number(r.b54_red_value), trg0);
    assert.deepStrictEqual(await one(db, ROWS), rows0, 'the same rows, late and on time');
    assert.strictEqual((await one(db, BOARD_MD5)).m, board0);
    assert.strictEqual(Number(answer0.cycles), 3, 'the board of the week holds the three cycles');
    assert.deepStrictEqual(await one(db, ANSWER), answer0, 'the board answers the same bytes');
  });

  await t.test('076 verify: in place, analyzed, B-54 matches; a second run refuses', async () => {
    const v = await one(db, read('076_plan_board_speed_verify.sql'));
    assert.deepStrictEqual({ ...v, analyzed: Number(v.analyzed) }, { view_in_place: true, analyzed: 17, b54_matches: true });
    assert.match(await errorOf(db, src) ?? '', /076: already applied/);
  });

  await t.test('the rollback gives 071\'s view back byte for byte (same rows), then 076 again', async () => {
    const r = (await db.exec(read('076_plan_board_speed_rollback.sql'))).at(-1).rows[0];
    assert.strictEqual(r.result, '076 ROLLED BACK');
    assert.strictEqual(r.view_md5, old);
    assert.deepStrictEqual(await one(db, ROWS), rows0);
    assert.match(await errorOf(db, read('076_plan_board_speed_rollback.sql')) ?? '', /076 rollback: v_rt_stop_state is not 076's view/);
    assert.strictEqual((await db.exec(src)).at(-1).rows[0].result, '076 OK');
  });
});
