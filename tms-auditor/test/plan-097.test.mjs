// 097 (the Veroia day of a VS only from a stop AT Veroia; transfer at any point, piece 1, design 2/11 L3) on the
// production-shaped PGlite copy as production holds it on 2/11 (prod-shaped-093.mjs + 095 + 096: none of them touches
// v_vs_state). The committed fixture: two VS through Veroia the normal way (plan_put_pieces), an export and an import.
// A transfer is not possible yet (leg_place, 071): the "transfer-shaped" rows are written raw inside a transaction that
// is always rolled back, read BEFORE the deferred rules fire - and the rules are fired after, to show they still refuse.
// NO-GO on 071's view: the export's Veroia day is the transfer day, plan_h_vs_follow writes it into cross_dock_date.
// GO after 097: the Veroia stop's day, the other carrier kept with no Veroia day. 097 refuses (names the order) while
// such rows exist, keeps every row of today, and its rollback gives 071's view back byte for byte.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { TRG } from './prod-shaped-072.mjs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { constants } from '../../worker/migrations/drafts/tools/build-097.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const VIEW_MD5 = `SELECT md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) AS m`;
// every VS order as the view answers it, and what plan_vs_state (the Worker's /plan/vs-state) answers for them
const ROWS = `SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.order_id), '')) AS m, count(*)::int AS n FROM v_vs_state v`;
const ANSWER = `SELECT md5(plan_vs_state(array(SELECT order_id FROM v_vs_state ORDER BY order_id))::text) AS m`;
const P = '097_plan_vs_state_hub_only';

// test rows only: TEST 097 ... names, T97- references
const HELPERS = `
CREATE SEQUENCE t97_n;
-- a VS order through Veroia; returns its national piece (export: Greek loading -> Veroia; import: Veroia -> Greek stop)
CREATE FUNCTION t97_vs(p_dir text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint; k text := 'r97' || nextval('t97_n');
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values (k || 'X', 'TEST 097 abroad') returning id into lx;
  insert into locations (legacy_id, name) values (k || 'G', 'TEST 097 GR') returning id into lg;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values (k || 'O', 'International', p_dir, 'Pending', true, p_hub - 3, p_hub + 3, p_hub, 'T97-' || k,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'A', 'Loading', 1, p_hub - 3, o, case when p_dir = 'Import' then lx else lg end, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'H', 'Cross-dock', 1, p_hub, o, hub, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'S', 'Unloading', 1, p_hub + 3, o, case when p_dir = 'Import' then lg else lx end, 10);
  return (select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id
           where s.order_id = o and s.order_stop_id is not null and s.deleted_at is null and sp.deleted_at is null
             and sp.parent_piece_id is null);
end $t$;
-- the normal way: ONE new OWNED cycle on p_day takes the piece from its national origin to its national end
CREATE FUNCTION t97_put(p_piece bigint, p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare r jsonb; v record; s text; trk bigint;
begin
  select vs.kind, vs.nat_from_location_id f, vs.nat_to_location_id t into v
    from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece;
  s := case when v.kind = 'vs_import' then 'KATHODOS' else 'ANODOS' end;
  insert into trucks (license_plate) values ('TEST-097-' || nextval('t97_n')) returning id into trk;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece, 'pickup', 'p', 'drop', 'd')),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk), 'side', s),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', v.f, 'side', s,
             'planned_from', (p_day + time '08:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '09:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'location_id', v.t, 'side', s,
             'planned_from', (p_day + time '14:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '15:00') at time zone 'Europe/Athens'))),
       'test:097', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;
-- what a transfer at Larisa will write (piece 2): truck A takes the piece from its origin to Larisa on p_day, truck B
-- from Larisa to its end on p_day + 1. Raw rows: leg_place refuses them at COMMIT today (see the test)
CREATE FUNCTION t97_transfer(p_piece bigint, p_day date) RETURNS jsonb LANGUAGE plpgsql AS $t$
declare v record; s text; la bigint; ra bigint; rb bigint; a1 bigint; a2 bigint; b1 bigint; b2 bigint;
  f1 timestamptz := (p_day + time '09:00') at time zone 'Europe/Athens';
  f2 timestamptz := (p_day + 1 + time '09:00') at time zone 'Europe/Athens';
begin
  set constraints all deferred;
  select vs.kind, vs.nat_from_location_id f, vs.nat_to_location_id t into v
    from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece;
  s := case when v.kind = 'vs_import' then 'KATHODOS' else 'ANODOS' end;
  insert into locations (legacy_id, name) values ('r97L' || nextval('t97_n'), 'TEST 097 Larisa') returning id into la;
  insert into ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
  values (2, 'NATL', 'OWNED', p_day, p_day, f1, f1 + interval '6 hours', 'planned', 'planner', 'test:097') returning id into ra;
  insert into rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
  values (ra, 1, v.f, s, f1, f1 + interval '1 hour', 'test:097') returning id into a1;
  insert into rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
  values (ra, 2, la, s, f1 + interval '5 hours', f1 + interval '6 hours', 'test:097') returning id into a2;
  insert into ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
  values (2, 'NATL', 'OWNED', p_day + 1, p_day + 1, f2, f2 + interval '6 hours', 'planned', 'planner', 'test:097') returning id into rb;
  insert into rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
  values (rb, 1, la, s, f2, f2 + interval '1 hour', 'test:097') returning id into b1;
  insert into rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
  values (rb, 2, v.t, s, f2 + interval '5 hours', f2 + interval '6 hours', 'test:097') returning id into b2;
  insert into piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) values (p_piece, 1, ra, a1, a2, 'test:097');
  insert into piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) values (p_piece, 2, rb, b1, b2, 'test:097');
  return jsonb_build_object('order_id', (select s2.order_id from shipment_pieces sp join shipments s2 on s2.id = sp.shipment_id where sp.id = p_piece),
                            'rt_a', ra, 'rt_b', rb);
end $t$;`;

// A scenario inside a transaction that is always rolled back; the deferred rules fire after the reads (late)
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}

// the two transfers of Mon 7/12 -> Tue 8/12, read from the view and from the follow. The export's international starts
// on a THIRD day (Thu 10/12), so the follow must write - neither the transfer day nor the Veroia day is there by chance
async function transfers(db) {
  const ex = await one(db, `SELECT t97_transfer(t97_vs('Export', DATE '2026-12-10'), DATE '2026-12-07') AS x`);
  const im = await one(db, `SELECT t97_transfer(t97_vs('Import', DATE '2026-12-07'), DATE '2026-12-07') AS x`);
  const state = async (x) => one(db, `SELECT first_hub_day::text AS first, carriers FROM v_vs_state WHERE order_id = $1`, [x.order_id]);
  const exState = await state(ex.x), imState = await state(im.x);
  // what the follow writes into the international (072 plan_h_vs_follow, the one writer of the day)
  await db.query(`SELECT plan_h_vs_follow(array(SELECT ps.piece_id FROM v_piece_state ps WHERE ps.order_id = $1), 'test:097', 'dispatcher')`, [ex.x.order_id]);
  const cd = (await one(db, `SELECT cross_dock_date::text AS d FROM orders WHERE id = $1`, [ex.x.order_id])).d;
  const answer = await one(db, `SELECT plan_vs_state(ARRAY[$1::bigint, $2::bigint]) AS a`, [ex.x.order_id, im.x.order_id]);
  return { ex: ex.x, im: im.x, exState, imState, cd, answer: answer.a };
}
const hubDays = (st, x) => Object.fromEntries(st.carriers.map((c) => [c.rt_id === x.rt_a ? 'A' : c.rt_id === x.rt_b ? 'B' : c.rt_id, c.hub_day]));

test('097 on the production-shaped copy (after 093, 095, 096)', async (t) => {
  const db = await prodShaped093();
  for (const f of ['095_plan_small_relaxed.sql', '096_plan_handover_accept_busy.sql']) await db.exec(read(f));
  await db.exec(HELPERS);
  // the committed fixture: an export VS brought to Veroia on 2/12 and an import VS taken from Veroia on 3/12
  await db.exec(`SELECT t97_put(t97_vs('Export', DATE '2026-12-02'), DATE '2026-12-02');
                 SELECT t97_put(t97_vs('Import', DATE '2026-12-03'), DATE '2026-12-03');`);
  const { old, neu } = constants(read(`${P}.sql`));
  const trg0 = (await one(db, TRG)).n;
  const rows0 = await one(db, ROWS);
  const answer0 = await one(db, ANSWER);

  await t.test('the copy holds 071\'s view (the md5 097 guards on) and two VS on trucks through Veroia', async () => {
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
    assert.strictEqual(rows0.n, 2);
    const days = (await db.query(`SELECT first_hub_day::text d FROM v_vs_state ORDER BY order_id`)).rows.map((r) => r.d);
    assert.deepStrictEqual(days, ['2026-12-02', '2026-12-03']);
  });

  await t.test('NO-GO on 071\'s view: a transfer at Larisa gives the export a wrong Veroia day, and the follow writes it', async () => {
    const r = await scenario(db, () => transfers(db));
    // export: A unloads at Larisa Mon 7/12, B delivers at Veroia Tue 8/12 - 071 says Mon
    assert.strictEqual(r.exState.first, '2026-12-07');
    assert.deepStrictEqual(hubDays(r.exState, r.ex), { A: '2026-12-07', B: '2026-12-08' });
    assert.strictEqual(r.cd, '2026-12-07', 'the international would get the transfer day as its cross-dock day');
    // import: A loads at Veroia Mon, B loads at Larisa Tue - 071 calls Tue a Veroia day of B
    assert.deepStrictEqual(hubDays(r.imState, r.im), { A: '2026-12-07', B: '2026-12-08' });
    // and today the base refuses the rows anyway (leg_place): why 097 changes nothing today
    assert.match(r.late ?? '', /leg_place/);
  });

  await t.test('097\'s guards: another live text, a view on top of it, the rollback before 097 - each stops, nothing kept', async () => {
    // another text of the view than 071's (max instead of min): 097 names its md5 and stops
    const other = await scenario(db, async () => {
      const v = (await one(db, `SELECT pg_get_viewdef('public.v_vs_state'::regclass, true) AS d`)).d;
      await db.exec(`CREATE OR REPLACE VIEW public.v_vs_state WITH (security_invoker = true) AS ${v.replace('min(', 'max(')}`);
      return { err: await errorOf(db, read(`${P}.sql`)) };
    });
    assert.match(other.err ?? '', /097: v_vs_state is not 071's view \(md5 [0-9a-f]{32}\) - stop, re-measure/);
    const dep = await scenario(db, async () => {
      await db.exec(`CREATE VIEW public.t97_dep AS SELECT order_id FROM public.v_vs_state`);
      return { err: await errorOf(db, read(`${P}.sql`)) };
    });
    assert.match(dep.err ?? '', /097: a view now depends on v_vs_state/);
    assert.match(await errorOf(db, read(`${P}_rollback.sql`)) ?? '', /097 rollback: v_vs_state is not 097's view/);
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
  });

  await t.test('097 dry run keeps nothing and gives the counts: 2 VS orders, 0 legs off Veroia', async () => {
    const msg = await errorOf(db, read(`${P}_dryrun.sql`));
    assert.match(msg ?? '', /DRY RUN 097 finished - EVERYTHING UNDONE/);
    assert.match(msg, /097 ran: view new yes, VS orders 2, VS legs off Veroia 0/);
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
  });

  await t.test('097 refuses while a VS stop off Veroia exists: names the order, the days and carriers that would change', async () => {
    const r = await scenario(db, async () => {
      const ex = (await one(db, `SELECT t97_transfer(t97_vs('Export', DATE '2026-12-08'), DATE '2026-12-07') AS x`)).x;
      return { ex, err: await errorOf(db, read(`${P}.sql`)) };
    });
    assert.match(r.err ?? '', new RegExp(`097 proof: VS orders that answer otherwise: ${r.ex.order_id} \\(Veroia day changed 1, carriers changed 1, VS legs off Veroia 1\\)`));
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
  });

  await t.test('097 runs: the measured text, every VS order answers as before, rights and triggers unchanged', async () => {
    const acl = `SELECT coalesce(relacl::text, '-') a, coalesce(reloptions::text, '-') o FROM pg_class WHERE oid = 'public.v_vs_state'::regclass`;
    const acl0 = await one(db, acl);
    assert.strictEqual(await errorOf(db, read(`${P}.sql`)), null);
    assert.strictEqual((await one(db, VIEW_MD5)).m, neu);
    assert.deepStrictEqual(await one(db, ROWS), rows0);
    assert.deepStrictEqual(await one(db, ANSWER), answer0);
    assert.deepStrictEqual(await one(db, acl), acl0);
    assert.match(acl0.o, /security_invoker=true/);
    assert.strictEqual((await one(db, TRG)).n, trg0);
    assert.match(await errorOf(db, read(`${P}.sql`)) ?? '', /097: already applied/);
  });

  await t.test('verify: in place, 2 VS orders, 0 legs off Veroia, 0 carried without a Veroia day, B-54 matches', async () => {
    const v = await one(db, read(`${P}_verify.sql`));
    assert.deepStrictEqual({ ...v, vs_orders: Number(v.vs_orders), vs_legs_off_veroia: Number(v.vs_legs_off_veroia),
      vs_carried_no_veroia_day: Number(v.vs_carried_no_veroia_day) },
    { applied: '097 in place', vs_orders: 2, vs_legs_off_veroia: 0, vs_carried_no_veroia_day: 0, b54_matches: true });
  });

  await t.test('GO after 097: the export\'s Veroia day is the day it reaches Veroia; the transfer truck stays a carrier, no Veroia day', async () => {
    const r = await scenario(db, () => transfers(db));
    assert.strictEqual(r.exState.first, '2026-12-08');
    assert.deepStrictEqual(hubDays(r.exState, r.ex), { A: null, B: '2026-12-08' });
    assert.strictEqual(r.cd, '2026-12-08', 'the follow writes the Veroia day, never the transfer day');
    assert.strictEqual(r.imState.first, '2026-12-07');
    assert.deepStrictEqual(hubDays(r.imState, r.im), { A: '2026-12-07', B: null });
    // the Weekly International's "follows" (plan_vs_state): both trucks, the one at Veroia first
    const exA = r.answer[String(r.ex.order_id)];
    assert.strictEqual(exA.first_hub_day, '2026-12-08');
    assert.strictEqual(exA.carriers.length, 2);
    assert.strictEqual(exA.carriers[0].hub_day, '2026-12-08');
    assert.strictEqual(exA.carriers[1].hub_day ?? null, null);
    assert.match(r.late ?? '', /leg_place/, 'leg_place still refuses at COMMIT: 097 relaxes nothing');
  });

  await t.test('rollback: refused while a VS stop off Veroia exists; its dry run keeps nothing; it gives 071\'s view back, rows equal', async () => {
    const r = await scenario(db, async () => {
      await one(db, `SELECT t97_transfer(t97_vs('Export', DATE '2026-12-08'), DATE '2026-12-07') AS x`);
      return { err: await errorOf(db, read(`${P}_rollback.sql`)) };
    });
    assert.match(r.err ?? '', /097 rollback: 1 live VS leg\(s\) have a counted stop off Veroia/);
    const dry = await errorOf(db, read(`${P}_rollback_dryrun.sql`));
    assert.match(dry ?? '', /DRY RUN 097 ROLLBACK finished - EVERYTHING UNDONE/);
    assert.match(dry, /rollback ran: view 071 yes, VS orders 2, VS legs off Veroia 0/);
    assert.strictEqual((await one(db, VIEW_MD5)).m, neu);
    assert.strictEqual(await errorOf(db, read(`${P}_rollback.sql`)), null);
    assert.strictEqual((await one(db, VIEW_MD5)).m, old);
    assert.deepStrictEqual(await one(db, ROWS), rows0);
    assert.deepStrictEqual(await one(db, ANSWER), answer0);
    assert.strictEqual((await one(db, TRG)).n, trg0);
    // and 097 runs again on the rolled-back copy
    assert.match(await errorOf(db, read(`${P}_dryrun.sql`)) ?? '', /097 ran: view new yes/);
  });
});
