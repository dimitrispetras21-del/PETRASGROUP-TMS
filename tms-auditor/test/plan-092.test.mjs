// 092 (F45, owner 1/11 option a) on the production-shaped PGlite copy as production holds it on 1/11:
// prod-shaped-074.mjs (072 ... 074a, 074, 074b) + 075, 076, 077, 078, 080, the live-082 fixture and 082 itself (081
// patches only the stop order). The copy holds the LIVE texts 092 guards on (production md5, SELECT 1/11).
// Each scenario runs inside a transaction that is always rolled back, with the deferred rules (071's plan_chk) fired
// before the rows are read: first on the LIVE texts (NO-GO: the national desk cannot set the pallets), then after 092
// (GO), then after the rollback (the live behaviour again). Every case reads ROWS (shipment_pieces, order_stops,
// orders, plan_notices, audit_log, piece_legs), never only an answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-092.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const SIGS = ['public.plan_vs_set_day(jsonb,text,text)', 'public.plan_vs_state(bigint[])'];
const md5s = async (db) => Promise.all(SIGS.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));

// test rows only: legacy ids rec92..., references T92-..., locations TEST 092 ..., plates TEST-092-...
// A VS of the given direction: the abroad side one stop of the total, the Greek side one bridged stop per element of
// p_pallets (Export: Greek loadings -> Veroia -> abroad; Import: abroad -> Veroia -> Greek deliveries), the Cross-dock
// stop = the sum of the loadings and the order's columns = the stops, as the international form writes them.
const HELPERS = `
CREATE FUNCTION t92_vs(p_ref text, p_dir text, p_hub date, p_pallets numeric[]) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint; tot numeric := 0; gr text; ab text;
begin
  select id into hub from locations where is_hub;
  select coalesce(sum(x), 0) into tot from unnest(p_pallets) x;
  gr := case when p_dir = 'Export' then 'Loading' else 'Unloading' end;
  ab := case when p_dir = 'Export' then 'Unloading' else 'Loading' end;
  insert into locations (legacy_id, name) values ('rec92X' || p_ref, 'TEST 092 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec92O' || p_ref, 'International', p_dir, 'Pending', true,
          case when p_dir = 'Export' then p_hub - 1 else p_hub - 3 end, case when p_dir = 'Export' then p_hub + 3 else p_hub + 1 end,
          p_hub, 'T92-' || p_ref, (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec92A' || p_ref, ab, 1, case when p_dir = 'Export' then p_hub + 3 else p_hub - 3 end, o, lx, tot);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec92H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, tot);
  for i in 1 .. array_length(p_pallets, 1) loop
    insert into locations (legacy_id, name) values ('rec92G' || p_ref || i, 'TEST 092 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec92S' || p_ref || i, gr, i, case when p_dir = 'Export' then p_hub - 1 else p_hub + 1 end, o, lg, p_pallets[i]);
  end loop;
  if p_dir = 'Export' then
    update orders set unloading_pallets_1 = tot, loading_pallets_1 = p_pallets[1], loading_pallets_2 = p_pallets[2] where id = o;
  else
    update orders set loading_pallets_1 = tot, unloading_pallets_1 = p_pallets[1], unloading_pallets_2 = p_pallets[2] where id = o;
  end if;
  return o;
end $t$;
CREATE FUNCTION t92_piece(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
       where st.legacy_id = 'rec92S' || p_ref || p_i and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
-- the pallets of a stop by its legacy id: t92_stop('S', '6101') = the first Greek stop of 610, t92_stop('H', '610') its Cross-dock
CREATE FUNCTION t92_stop(p_kind text, p_key text) RETURNS numeric LANGUAGE sql AS
  $t$ select pallets from order_stops where legacy_id = 'rec92' || p_kind || p_key $t$;
CREATE SEQUENCE t92_plate;
-- ONE new OWNED cycle on day p_day that takes the given import pieces from Veroia to their Greek stops (082's t82_put)
CREATE FUNCTION t92_put(p_pieces bigint[], p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare trk bigint; st jsonb; i int; r jsonb; hub bigint;
begin
  select id into hub from locations where is_hub;
  insert into trucks (license_plate) values ('TEST-092-' || nextval('t92_plate')) returning id into trk;
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
         'stops', st), 'test:092', 'dispatcher');
  perform set_config('plan.writer', '', true);   -- the board's move and the next request are two transactions
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;
-- ONE new OWNED cycle that takes the given EXPORT pieces from their Greek loading to Veroia on its ANODOS (VS 610's
-- shape: the supplier loading on p_day 09:00, the Veroia arrival the same day 18:00)
CREATE FUNCTION t92_put_anodos(p_pieces bigint[], p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare trk bigint; st jsonb := '[]'::jsonb; i int; r jsonb; hub bigint;
begin
  select id into hub from locations where is_hub;
  insert into trucks (license_plate) values ('TEST-092-' || nextval('t92_plate')) returning id into trk;
  for i in 1 .. cardinality(p_pieces) loop
    st := st || jsonb_build_object('ref', 'p' || i, 'side', 'ANODOS',
            'location_id', (select vs.nat_from_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_pieces[i]),
            'planned_from', (p_day + make_time(8 + i, 0, 0)) at time zone 'Europe/Athens',
            'planned_to', (p_day + make_time(9 + i, 0, 0)) at time zone 'Europe/Athens');
  end loop;
  st := st || jsonb_build_object('ref', 'd', 'location_id', hub, 'side', 'ANODOS',
          'planned_from', (p_day + time '18:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '19:00') at time zone 'Europe/Athens');
  r := plan_put_pieces(jsonb_build_object(
         'pieces', (select jsonb_agg(jsonb_build_object('piece_id', x, 'pickup', 'p' || n, 'drop', 'd')) from unnest(p_pieces) with ordinality u(x, n)),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk), 'side', 'ANODOS'),
         'stops', st), 'test:092', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;
-- the split a dispatcher leaves at Veroia: 4 + the rest, as plan_split_piece does (082's t82_split)
CREATE FUNCTION t92_split(p_piece bigint) RETURNS void LANGUAGE sql AS $t$
  update shipment_pieces set split_at = now(), split_by = 'test:092' where id = p_piece;
  insert into shipment_pieces (shipment_id, parent_piece_id, pallets, created_by)
    select shipment_id, id, 4, 'test:092' from shipment_pieces where id = p_piece;
  insert into shipment_pieces (shipment_id, parent_piece_id, pallets, created_by)
    select shipment_id, id, pallets - 4, 'test:092' from shipment_pieces where id = p_piece;
$t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// the national desk's call, as the Worker makes it (POST /plan/vs/day -> plan_vs_set_day(p, actor, role)); a refusal
// is caught in a savepoint so the scenario reads the rows after it
async function setDay(db, body) {
  await db.exec('SAVEPOINT c');
  try {
    const r = await one(db, `SELECT plan_vs_set_day($1::jsonb, 'test:092', 'dispatcher') AS r`, [JSON.stringify(body)]);
    await db.exec('RELEASE SAVEPOINT c');
    return { ans: r.r, err: null };
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT c');
    return { ans: null, err: { msg: String(e.message), hint: e.hint ?? null } };
  }
}
const lastId = (db, t) => num(db, `SELECT coalesce(max(id), 0) FROM ${t}`);
const noticesOf = async (db, o, after) => (await db.query(
  `SELECT to_desk, kind, message FROM plan_notices WHERE order_id = $1 AND id > $2 ORDER BY id`, [o, after])).rows;
const auditOf = async (db, after) => (await db.query(
  `SELECT table_name, before_data, after_data FROM audit_log WHERE id > $1 AND actor = 'test:092' AND table_name <> 'plan_notices' ORDER BY id`, [after])).rows;
const pal = (db, id) => num(db, `SELECT pallets FROM shipment_pieces WHERE id = $1`, [id]);
const col = (db, o, c) => num(db, `SELECT ${c} FROM orders WHERE id = $1`, [o]);
const dayOf = async (db, k) => (await one(db, `SELECT (plan_cutover_day() + ${k})::text AS d`)).d;

// VS 610's shape: an export of two Greek loadings 24 + 8, waiting; the truck loaded 22 of the first
const export610 = (db, L, body = (o, p) => ({ order_id: o, piece_id: p, pallets: 22 })) => scenario(db, async () => {
  const o = await num(db, `SELECT t92_vs('610', 'Export', DATE '${L}' + 3, '{24,8}')`);
  const p = await num(db, `SELECT t92_piece('610', 1)`);
  const n0 = await lastId(db, 'plan_notices'), a0 = await lastId(db, 'audit_log');
  const r = await setDay(db, body(o, p));
  return { o, p, ...r, piece: await pal(db, p), stop: await num(db, `SELECT t92_stop('S', '6101')`),
    cd: await num(db, `SELECT t92_stop('H', '610')`), lp1: await col(db, o, 'loading_pallets_1'),
    lp2: await col(db, o, 'loading_pallets_2'), total: await num(db, `SELECT order_pallets(o.*) FROM orders o WHERE id = $1`, [o]),
    notices: await noticesOf(db, o, n0), audit: await auditOf(db, a0) };
});

test('092 on the production-shaped copy (1/11): the national desk sets the pallets of a VS, the international follows', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  // the copy's seed is the whole catalog (B-100's file included): 080 seeds its own check, as plan-080.test.mjs
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  const trg0 = await num(db, TRG);
  await db.query(`UPDATE monitoring.checks SET red_value = $1 WHERE id = 'B-54'`, [trg0]);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('092_plan_vs_pallets_day.sql');
  const F = facts(src);
  const live = await md5s(db);

  await t.test('the copy holds the LIVE texts 092 guards on (production md5, SELECT 1/11)', async () => {
    assert.deepStrictEqual(live, SIGS.map((s) => F.live[s]));
    const other = Object.fromEntries((await db.query(`SELECT proname, md5(prosrc) AS m FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('plan_h_vs_day', 'plan_h_bridge_recut')`)).rows.map((r) => [r.proname, r.m]));
    assert.deepStrictEqual(other, { plan_h_vs_day: F.live['public.plan_h_vs_day(bigint,date,text,text)'],
      plan_h_bridge_recut: F.live['public.plan_h_bridge_recut(bigint,text,text,text)'] });
  });

  await t.test('NO-GO on the live texts: the national desk cannot set the pallets of VS 610 (24 stays, 22 was loaded)', async () => {
    const r = await export610(db, L);
    assert.strictEqual(r.late, null);
    assert.match(r.err?.msg ?? '', /bad_input:p\.p/, 'an unknown key is refused (plan_h_keys)');
    assert.strictEqual(r.piece, 24);
    assert.strictEqual(r.stop, 24);
    assert.strictEqual(r.lp1, 24);
    assert.deepStrictEqual(r.notices, []);
  });

  await t.test('092 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('092_plan_vs_pallets_day_dryrun.sql'));
    const gen = F.gen.map((g) => g.m);
    assert.match(msg ?? '', new RegExp(`DRY RUN 092 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}092 ran: set_day ${gen[0]}, vs_state ${gen[1]}`), msg);
    assert.deepStrictEqual(await md5s(db), live);
  });

  await t.test('092 applies; the texts are the generated ones, the rights as before, no trigger', async () => {
    const acl0 = (await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.deepStrictEqual((await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows, acl0);
    assert.strictEqual(await num(db, TRG), trg0);
    const v = await one(db, read('092_plan_vs_pallets_day_verify.sql'));
    assert.strictEqual(v.applied, '092 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(v.recut_untouched, true);
    assert.strictEqual(Number(v.stop_vs_order_off), 0);
    assert.strictEqual(Number(v.leaves_vs_stop_off), 0);
  });
  await t.test('092 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /092: public\.plan_vs_set_day.* is not its live text of 1\/11/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
  });

  await t.test('GO: VS 610 - 24 -> 22: the piece, its stop, the order column and the Cross-dock follow; one notice to the international', async () => {
    const r = await export610(db, L);
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null, 'the deferred rules (pieces_sum) pass');
    assert.strictEqual(r.piece, 22);
    assert.strictEqual(r.stop, 22);
    assert.strictEqual(r.lp1, 22);
    assert.strictEqual(r.lp2, 8, 'the other loading is not touched');
    assert.strictEqual(r.cd, 30, 'Cross-dock 32 -> 30');
    assert.strictEqual(r.total, 30, 'what the Weekly International sums (order_pallets)');
    assert.deepStrictEqual(r.notices.map((n) => [n.to_desk, n.kind]), [['intl', 'vs_pallets_set']], 'no notice of the national desk to itself');
    assert.match(r.notices[0].message, /T92-610, φόρτωση TEST 092 GR 610 1: 24 → 22 · έλεγξε τις παραδόσεις/);
    assert.deepStrictEqual(r.audit.map((a) => a.table_name), ['shipment_pieces', 'order_stops', 'orders', 'order_stops']);
    assert.deepStrictEqual(r.audit[2].before_data, { loading_pallets_1: 24 });
    assert.strictEqual(r.audit[2].after_data.loading_pallets_1, 22);
    assert.strictEqual(r.audit[0].after_data.by, 'national desk (092)');
    assert.strictEqual(r.ans.notice_ids.length, 1);
    assert.deepStrictEqual(r.ans.warnings, []);
  });
  await t.test('GO: the same number again changes nothing and tells nobody', async () => {
    const r = await export610(db, L, (o, p) => ({ order_id: o, piece_id: p, pallets: 24 }));
    assert.strictEqual(r.err, null);
    assert.strictEqual(r.piece, 24);
    assert.deepStrictEqual(r.notices, []);
    assert.deepStrictEqual(r.audit, []);
    assert.deepStrictEqual(r.ans.notice_ids, []);
  });
  await t.test('GO: bad bodies are refused and nothing is written (0, -1, NaN, Infinity, a piece without pallets, a piece of another order)', async () => {
    for (const [mk, re] of [[(o, p) => ({ order_id: o, piece_id: p, pallets: 0 }), /bad_input:pallets:positive/],
                            [(o, p) => ({ order_id: o, piece_id: p, pallets: -1 }), /bad_input:pallets:positive/],
                            [(o, p) => ({ order_id: o, piece_id: p, pallets: 'NaN' }), /bad_input:pallets:positive/],
                            [(o, p) => ({ order_id: o, piece_id: p, pallets: 'Infinity' }), /bad_input:pallets:positive/],
                            [(o, p) => ({ order_id: o, piece_id: p, pallets: 2.55 }), /bad_input:pallets:positive/],
                            [(o, p) => ({ order_id: o, piece_id: p, pallets: 100000 }), /bad_input:pallets:positive/],
                            [(o, p) => ({ order_id: o, piece_id: p }), /bad_input:piece_id and pallets/],
                            [(o) => ({ order_id: o }), /bad_input:order_id and day/],
                            [(o, p) => ({ order_id: o, piece_id: p + 100000, pallets: 20 }), /bad_input:piece_id:/]]) {
      const r = await export610(db, L, mk);
      assert.match(r.err?.msg ?? '', re, JSON.stringify(r.err));
      assert.strictEqual(r.piece, 24);
      assert.strictEqual(r.stop, 24);
      assert.deepStrictEqual(r.notices, []);
    }
  });
  await t.test('GO: a piece of ANOTHER VS sent with this order is refused, nothing is written', async () => {
    const r = await scenario(db, async () => {
      const a = await num(db, `SELECT t92_vs('XA', 'Export', DATE '${L}' + 3, '{10,5}')`);
      await num(db, `SELECT t92_vs('XB', 'Export', DATE '${L}' + 3, '{12,6}')`);
      const pb = await num(db, `SELECT t92_piece('XB', 1)`);
      return { ...(await setDay(db, { order_id: a, piece_id: pb, pallets: 11 })), b: await pal(db, pb) };
    });
    assert.match(r.err?.msg ?? '', /bad_input:piece_id:/);
    assert.strictEqual(r.b, 12);
  });
  await t.test('GO: the international\'s own change still reaches the national desk (recut + its notice), no loop with 092', async () => {
    const r = await scenario(db, async () => {
      const o = await num(db, `SELECT t92_vs('IN', 'Export', DATE '${L}' + 3, '{24,8}')`);
      const p = await num(db, `SELECT t92_piece('IN', 1)`);
      const set = await setDay(db, { order_id: o, piece_id: p, pallets: 22 });
      // the national desk's request ends (its COMMIT): plan.writer is of that transaction only
      await db.exec(`SELECT set_config('plan.writer', '', true)`);
      const n0 = await lastId(db, 'plan_notices');
      // the international form re-saves the stop with the number it now shows (22): nothing moves, nobody is told
      await db.exec(`UPDATE order_stops SET pallets = 22 WHERE legacy_id = 'rec92SIN1'`);
      const same = await noticesOf(db, o, n0);
      // then the international changes it itself (22 -> 20): recut as before, the national desk is told
      await db.exec(`UPDATE order_stops SET pallets = 20 WHERE legacy_id = 'rec92SIN1'`);
      return { set, same, after: await noticesOf(db, o, n0), piece: await pal(db, p) };
    });
    assert.strictEqual(r.set.err, null, JSON.stringify(r.set.err));
    assert.strictEqual(r.late, null);
    assert.deepStrictEqual(r.same, []);
    assert.deepStrictEqual(r.after.map((n) => [n.to_desk, n.kind]), [['natl', 'vs_pallets_changed']]);
    assert.strictEqual(r.piece, 20);
  });
  await t.test('GO: an import piece on a cycle (11 -> 9): it keeps its leg, the delivery column follows, the Cross-dock does not', async () => {
    const r = await scenario(db, async () => {
      const o = await num(db, `SELECT t92_vs('IM', 'Import', DATE '${L}' + 4, '{11,7}')`);
      const p = await num(db, `SELECT t92_piece('IM', 1)`);
      const rt = await num(db, `SELECT t92_put(ARRAY[$1::bigint], DATE '${L}' + 5)`, [p]);
      const n0 = await lastId(db, 'plan_notices');
      const res = await setDay(db, { order_id: o, piece_id: p, pallets: 9 });
      return { ...res, rt, piece: await pal(db, p), up1: await col(db, o, 'unloading_pallets_1'), cd: await num(db, `SELECT t92_stop('H', 'IM')`),
        legs: await num(db, `SELECT count(*) FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL AND rt_id = $2`, [p, rt]),
        notices: await noticesOf(db, o, n0) };
    });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.piece, 9);
    assert.strictEqual(r.up1, 9);
    assert.strictEqual(r.cd, 18, 'the Cross-dock is the loadings abroad: unchanged');
    assert.strictEqual(r.legs, 1);
    assert.deepStrictEqual(r.notices.map((n) => n.kind), ['vs_pallets_set']);
    assert.match(r.notices[0].message, /παράδοση TEST 092 GR IM 1: 11 → 9 · έλεγξε τη φόρτωση$/);
  });
  await t.test('GO: VS 610 on its ΑΝΟΔΟΣ truck (24 -> 22): the leg and its two stops stay, the order column and the Cross-dock follow', async () => {
    const r = await scenario(db, async () => {
      const o = await num(db, `SELECT t92_vs('AN', 'Export', DATE '${L}' + 3, '{24,8}')`);
      const p = await num(db, `SELECT t92_piece('AN', 1)`);
      const rt = await num(db, `SELECT t92_put_anodos(ARRAY[$1::bigint], DATE '${L}' + 2)`, [p]);
      const stops0 = await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]);
      const n0 = await lastId(db, 'plan_notices');
      const res = await setDay(db, { order_id: o, piece_id: p, pallets: 22 });
      return { ...res, stops0, piece: await pal(db, p), lp1: await col(db, o, 'loading_pallets_1'), cd: await num(db, `SELECT t92_stop('H', 'AN')`),
        legs: await num(db, `SELECT count(*) FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL AND rt_id = $2`, [p, rt]),
        stops: await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]),
        status: (await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rt])).status, notices: await noticesOf(db, o, n0) };
    });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null, 'the deferred rules pass with the leg kept');
    assert.strictEqual(r.piece, 22);
    assert.strictEqual(r.lp1, 22);
    assert.strictEqual(r.cd, 30);
    assert.strictEqual(r.legs, 1);
    assert.strictEqual(r.stops, r.stops0);
    assert.notStrictEqual(r.status, 'cancelled');
    assert.deepStrictEqual(r.notices.map((n) => [n.to_desk, n.kind]), [['intl', 'vs_pallets_set']]);
  });
  // a load splits only at Veroia (071 split_not_at_hub): an import piece, waiting at the hub
  await t.test('GO: a split piece (4 + 20) - the 4 becomes 3, the stop 23, the other part untouched', async () => {
    const r = await scenario(db, async () => {
      const o = await num(db, `SELECT t92_vs('SP', 'Import', DATE '${L}' + 3, '{24,8}')`);
      const root = await num(db, `SELECT t92_piece('SP', 1)`);
      await db.exec(`SELECT t92_split(${root})`);
      const kids = (await db.query(`SELECT id FROM shipment_pieces WHERE parent_piece_id = $1 ORDER BY pallets`, [root])).rows;
      const res = await setDay(db, { order_id: o, piece_id: kids[0].id, pallets: 3 });
      return { ...res, a: await pal(db, kids[0].id), b: await pal(db, kids[1].id), stop: await num(db, `SELECT t92_stop('S', 'SP1')`),
        up1: await col(db, o, 'unloading_pallets_1') };
    });
    assert.strictEqual(r.err, null, JSON.stringify(r.err));
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.a, 3);
    assert.strictEqual(r.b, 20);
    assert.strictEqual(r.stop, 23);
    assert.strictEqual(r.up1, 23);
  });
  await t.test('GO: day and pallets in one call - two notices; the day alone is the 072 call as it was', async () => {
    const want = await dayOf(db, 1);
    const r = await scenario(db, async () => {
      const o = await num(db, `SELECT t92_vs('DP', 'Export', DATE '${L}' + 3, '{24,8}')`);
      const p = await num(db, `SELECT t92_piece('DP', 1)`);
      const n0 = await lastId(db, 'plan_notices');
      const both = await setDay(db, { order_id: o, day: await dayOf(db, 2), piece_id: p, pallets: 22 });
      const dayOnly = await setDay(db, { order_id: o, day: want });
      return { both, dayOnly, notices: await noticesOf(db, o, n0), cd: (await one(db, `SELECT cross_dock_date::text AS d FROM orders WHERE id = $1`, [o])).d,
        cdStop: (await one(db, `SELECT datetime::text AS d FROM order_stops WHERE legacy_id = 'rec92HDP'`)).d,
        state: (await one(db, `SELECT plan_vs_state(ARRAY[$1::bigint]) AS s`, [o])).s[String(o)] };
    });
    assert.strictEqual(r.both.err, null, JSON.stringify(r.both.err));
    assert.strictEqual(r.dayOnly.err, null, JSON.stringify(r.dayOnly.err));
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.both.ans.notice_ids.length, 2);
    assert.deepStrictEqual(r.notices.map((n) => n.kind), ['vs_day_changed', 'vs_pallets_set', 'vs_day_changed']);
    assert.ok(r.notices.every((n) => n.to_desk === 'intl'));
    assert.strictEqual(r.cd, want);
    assert.strictEqual(r.cdStop, want, '069 moves the Cross-dock stop with the day, as before');
    assert.strictEqual(r.state.cross_dock_date, want, 'plan_vs_state answers the international\'s Veroia day');
  });

  await t.test('rollback dry run keeps nothing; the rollback brings the live texts and the live behaviour back', async () => {
    const msg = await errorOf(db, read('092_plan_vs_pallets_day_rollback_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 092 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: set_day ${live[0]}, vs_state ${live[1]}`), msg);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    await db.exec(read('092_plan_vs_pallets_day_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), live);
    const r = await export610(db, L);
    assert.match(r.err?.msg ?? '', /bad_input:p\.p/);
    assert.strictEqual(r.piece, 24);
    assert.strictEqual((await one(db, read('092_plan_vs_pallets_day_verify.sql'))).applied, '092 NOT APPLIED');
  });
});
