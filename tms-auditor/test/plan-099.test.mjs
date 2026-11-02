// 099 (the act "Change on the road", plan_transfer; transfer at any point, piece 2b, owner 2/11) on the
// production-shaped PGlite copy as production will hold it after 098 (prod-shaped-093.mjs + 095 + 096 + 097 + 098).
// The fixture is written the normal way (plan_put_pieces): truck A carries a national load from its start to its end on
// Mon 7/12; truck B has its own trip the same day. Every case runs plan_transfer inside a transaction that is always
// rolled back (plan_h_finish fires the rules INSIDE the act: a refusal is its code), and reads ROWS - rt_stops,
// piece_legs, shipment_pieces, orders, audit_log - never only the answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { TRG } from './prod-shaped-072.mjs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, SIG } from '../../worker/migrations/drafts/tools/build-099.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const all = async (db, sql, p) => (await db.query(sql, p)).rows;
async function errorOf(db, sql, p) { try { if (p) await db.query(sql, p); else await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const P = '099_plan_transfer';
const DAY = '2026-12-07';
const at = (h) => `${DAY}T${String(h).padStart(2, '0')}:00:00+02:00`;
const uuid = () => crypto.randomUUID();
const N = (x) => (x === null || x === undefined ? x : Number(x));

// test rows only: TEST 099 ... names, T99- references
const HELPERS = `
CREATE SEQUENCE t99_n;
CREATE FUNCTION t99_loc(p_name text) RETURNS bigint LANGUAGE sql AS
  $t$ insert into locations (legacy_id, name) values ('r99L' || nextval('t99_n'), 'TEST 099 ' || p_name) returning id $t$;
CREATE FUNCTION t99_truck() RETURNS bigint LANGUAGE sql AS
  $t$ insert into trucks (license_plate) values ('TEST-099-' || nextval('t99_n')) returning id $t$;
-- a national load of p_pallets from p_from to p_to on 7/12
CREATE FUNCTION t99_national(p_from bigint, p_to bigint, p_pallets numeric) RETURNS bigint LANGUAGE plpgsql AS $t$
declare n bigint; sh bigint;
begin
  insert into national_orders (legacy_id, client_id, reference, price, pallets)
  values ('r99N' || nextval('t99_n'), (select min(id) from clients), 'T99-N', 100, p_pallets) returning id into n;
  insert into shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                         deliver_to, created_by)
  values (n, p_from, p_to, p_pallets, '2026-12-07 08:00+02', '2026-12-07 09:00+02', '2026-12-07 18:00+02', '2026-12-07 19:00+02', 'test:099')
  returning id into sh;
  insert into shipment_pieces (shipment_id, pallets, created_by) values (sh, p_pallets, 'test:099');
  return (select id from shipment_pieces where shipment_id = sh);
end $t$;
-- a VS export through Veroia (Greek loading -> Veroia), the international's day p_cd; returns its piece
CREATE FUNCTION t99_vs(p_from bigint, p_cd date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; k text := 'r99V' || nextval('t99_n');
begin
  select id into hub from locations where is_hub;
  lx := t99_loc('abroad');
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values (k || 'O', 'International', 'Export', 'Pending', true, p_cd - 1, p_cd + 3, p_cd, 'T99-' || k,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'A', 'Loading', 1, p_cd - 1, o, p_from, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'H', 'Cross-dock', 1, p_cd, o, hub, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'S', 'Unloading', 1, p_cd + 3, o, lx, 10);
  return (select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id
           where s.order_id = o and s.order_stop_id is not null and s.deleted_at is null and sp.deleted_at is null);
end $t$;
-- the normal way: a new OWNED trip of p_truck takes p_piece from its start (p_h1) to its end (p_h2) on 7/12
CREATE FUNCTION t99_put(p_piece bigint, p_truck bigint, p_h1 int, p_h2 int) RETURNS bigint LANGUAGE plpgsql AS $t$
declare r jsonb; v record;
begin
  select vs.nat_from_location_id f, vs.nat_to_location_id t into v
    from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece, 'pickup', 'p', 'drop', 'd')),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', p_truck), 'side', 'ANODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', v.f, 'side', 'ANODOS',
             'planned_from', ('2026-12-07'::date + make_time(p_h1, 0, 0)) at time zone 'Europe/Athens',
             'planned_to', ('2026-12-07'::date + make_time(p_h1 + 1, 0, 0)) at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'location_id', v.t, 'side', 'ANODOS',
             'planned_from', ('2026-12-07'::date + make_time(p_h2, 0, 0)) at time zone 'Europe/Athens',
             'planned_to', ('2026-12-07'::date + make_time(p_h2 + 1, 0, 0)) at time zone 'Europe/Athens'))),
       'test:099', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;
-- p_piece onto trip p_rt (a new trip of p_truck when p_rt is null) from p_from_loc (p_h1) to p_to_loc (p_h2) on 7/12
CREATE FUNCTION t99_put_at(p_piece bigint, p_rt bigint, p_truck bigint, p_from_loc bigint, p_h1 int, p_to_loc bigint, p_h2 int)
  RETURNS bigint LANGUAGE plpgsql AS $t$
declare r jsonb;
begin
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece, 'pickup', 'p', 'drop', 'd')),
         'target', case when p_rt is null then jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', p_truck), 'side', 'ANODOS')
                        else jsonb_build_object('rt_id', p_rt, 'side', 'ANODOS') end,
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', p_from_loc, 'side', 'ANODOS',
             'planned_from', ('2026-12-07'::date + make_time(p_h1, 0, 0)) at time zone 'Europe/Athens',
             'planned_to', ('2026-12-07'::date + make_time(p_h1 + 1, 0, 0)) at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'location_id', p_to_loc, 'side', 'ANODOS',
             'planned_from', ('2026-12-07'::date + make_time(p_h2, 0, 0)) at time zone 'Europe/Athens',
             'planned_to', ('2026-12-07'::date + make_time(p_h2 + 1, 0, 0)) at time zone 'Europe/Athens'))),
       'test:099', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try { return await steps(); } finally { await db.exec('ROLLBACK'); }
}
const transfer = (db, body) => one(db, `SELECT plan_transfer($1::jsonb, 'test:099', 'dispatcher') AS a`, [JSON.stringify(body)]).then((r) => r.a);
const errTransfer = (db, body) => errorOf(db, `SELECT plan_transfer($1::jsonb, 'test:099', 'dispatcher')`, [JSON.stringify(body)]);
const COUNTS = `SELECT (SELECT count(*) FROM rt_stops)::int s, (SELECT count(*) FROM piece_legs)::int l,
  (SELECT count(*) FROM shipment_pieces)::int p, (SELECT count(*) FROM audit_log)::int a`;

test('099 on the production-shaped copy (after 093, 095, 096, 097, 098)', async (t) => {
  const db = await prodShaped093();
  for (const f of ['095_plan_small_relaxed.sql', '096_plan_handover_accept_busy.sql', '097_plan_vs_state_hub_only.sql',
    '098_plan_transfer_point.sql']) await db.exec(read(f));
  await db.exec(HELPERS);
  const src = read(`${P}.sql`);
  const f = facts(src);
  // the fixture: A carries 10 pallets from G to E (08:00 -> 18:00); B has its own trip X -> Y the same day
  const loc = async (n) => N((await one(db, `SELECT t99_loc($1) id`, [n])).id);
  const g = await loc('G'), e = await loc('E'), x = await loc('X'), y = await loc('Y'), lar = await loc('Larisa');
  const hub = N((await one(db, `SELECT id FROM locations WHERE is_hub`)).id);
  const pc = N((await one(db, `SELECT t99_national($1, $2, 10) id`, [g, e])).id);
  const rtA = N((await one(db, `SELECT t99_put($1, t99_truck(), 8, 18) id`, [pc])).id);
  const q = N((await one(db, `SELECT t99_national($1, $2, 5) id`, [x, y])).id);
  const rtB = N((await one(db, `SELECT t99_put($1, t99_truck(), 8, 10) id`, [q])).id);
  const base = (extra = {}) => ({ rt_id: rtA, point: { location_id: lar }, side: 'ANODOS', planned_from: at(13), planned_to: at(14),
    reason: 'meeting', request_id: uuid(), ...extra });
  const toB = { target: { rt_id: rtB, side: 'ANODOS' }, stops: [{ ref: 'd', location_id: e, side: 'ANODOS', planned_from: at(16), planned_to: at(17) }] };
  const trg0 = (await one(db, TRG)).n;

  await t.test('before 099: no plan_transfer; the dry run keeps nothing and names the md5 it ends on', async () => {
    assert.strictEqual((await one(db, `SELECT to_regprocedure('${SIG}') AS r`)).r, null);
    const msg = await errorOf(db, read(`${P}_dryrun.sql`));
    assert.match(msg ?? '', /DRY RUN 099 finished - EVERYTHING UNDONE/);
    assert.ok(msg.includes(`099 ran: plan_transfer ${f.fn}, transfer_place 1, transfer point 1`), msg);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('${SIG}') AS r`)).r, null);
  });

  await t.test('099 runs: the measured text, service_role only, SECURITY DEFINER, one place; verify', async () => {
    assert.strictEqual(crypto.createHash('md5').update(f.body).digest('hex'), f.fn);
    assert.strictEqual(await errorOf(db, src), null);
    const fn = await one(db, `SELECT md5(prosrc) m, proacl::text a, prosecdef d FROM pg_proc WHERE oid = '${SIG}'::regprocedure`);
    assert.deepStrictEqual(fn, { m: f.fn, a: '{postgres=X/postgres,service_role=X/postgres}', d: true });
    assert.strictEqual((await one(db, TRG)).n, trg0);
    const v = await one(db, read(`${P}_verify.sql`));
    assert.deepStrictEqual([v.applied, v.rights, N(v.transfer_place), N(v.transfer_point), N(v.transfers), N(v.waiting_at_point),
      N(v.text_points), v.b54_matches], ['099 in place', true, 1, 1, 0, 0, 0, true]);
    assert.match(await errorOf(db, src) ?? '', /099: .* is not the text 099 builds on|plan_transfer exists/);
  });

  await t.test('GO: the whole load to truck B, which has its own trip - two legs, linked stops, A\'s old end gone, audited', async () => {
    const r = await scenario(db, async () => {
      const ans = await transfer(db, base({ loads: [{ piece_id: pc, go: 0 }], trucks: [toB] }));
      const stopsA = await all(db, `SELECT location_id, transfer_reason, deleted_at IS NOT NULL dead FROM rt_stops WHERE rt_id = $1 ORDER BY seq, id`, [rtA]);
      const legs = await all(db, `SELECT leg_no, rt_id, (SELECT location_id FROM rt_stops WHERE id = pickup_stop_id) pk,
                                   (SELECT location_id FROM rt_stops WHERE id = drop_stop_id) dr
                                   FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL ORDER BY leg_no`, [pc]);
      const link = await one(db, `SELECT b.location_id = a.location_id same, b.planned_from = a.planned_from win, b.rt_id
                                    FROM rt_stops a JOIN rt_stops b ON b.transfer_from_stop_id = a.id WHERE a.id = $1`, [ans.ids.stop_id]);
      const aud = await one(db, `SELECT count(*)::int n FROM audit_log WHERE table_name = 'rt_stops' AND record_id = $1::text AND action = 'update'
                                   AND actor = 'test:099' AND before_data->>'transfer_reason' IS NULL AND after_data->>'transfer_reason' = 'meeting'`, [ans.ids.stop_id]);
      return { ans, stopsA, legs, link, aud };
    });
    assert.strictEqual(r.ans.ok, true);
    assert.deepStrictEqual(r.legs.map((l) => [N(l.leg_no), N(l.rt_id), N(l.pk), N(l.dr)]), [[1, rtA, g, lar], [2, rtB, lar, e]]);
    assert.deepStrictEqual(r.stopsA.filter((s) => !s.dead).map((s) => [N(s.location_id), s.transfer_reason]), [[g, null], [lar, 'meeting']]);
    assert.ok(r.stopsA.some((s) => s.dead && N(s.location_id) === e), 'A\'s old end stop went (decision 4)');
    assert.deepStrictEqual({ ...r.link, rt_id: N(r.link.rt_id) }, { same: true, win: true, rt_id: rtB });
    assert.deepStrictEqual(r.ans.ids.rt_ids.map(N), [rtB]);
    assert.strictEqual(r.aud.n, 1, 'the transfer stop\'s reason is an audit row (who, when)');
  });

  await t.test('the dry run writes nothing; its preview names both trucks, B\'s new stop, no wait, not a whole-vehicle change', async () => {
    const before = await one(db, COUNTS);
    const ans = await transfer(db, base({ loads: [{ piece_id: pc, go: 0 }], trucks: [toB], dry_run: true }));
    assert.deepStrictEqual(await one(db, COUNTS), before);
    assert.strictEqual(ans.dry_run, true);
    assert.strictEqual(ans.preview.conflict, null, JSON.stringify(ans.preview.conflict));
    assert.deepStrictEqual(ans.preview.trucks.map((c) => N(c.rt_id)), [rtA, rtB]);
    assert.ok(ans.preview.trucks[1].stops.some((s) => s.new && s.transfer_from_stop_id));
    assert.ok(ans.preview.trucks[0].stops.some((s) => s.removed && N(s.location_id) === e));
    assert.deepStrictEqual(ans.preview.waiting, []);
    assert.strictEqual(ans.preview.whole_vehicle, false);
  });

  await t.test('whole_vehicle: every load whole to ONE new vehicle - the screen saves it as the vehicle change (072b)', async () => {
    const r = await scenario(db, async () => {
      const truck = N((await one(db, `SELECT t99_truck() id`)).id);
      return transfer(db, base({ dry_run: true, loads: [{ piece_id: pc, go: 0 }], trucks: [{
        target: { new_rt: { trip_type: 'OWNED', truck_id: truck }, side: 'ANODOS' },
        stops: [{ ref: 'd', location_id: e, side: 'ANODOS', planned_from: at(16), planned_to: at(17) }] }] }));
    });
    assert.strictEqual(r.preview.conflict, null, JSON.stringify(r.preview.conflict));
    assert.strictEqual(r.preview.whole_vehicle, true);
  });

  await t.test('split: 6 to B, the rest 4 stays on A (A\'s stop names itself) - children, legs and the link', async () => {
    const r = await scenario(db, async () => {
      const ans = await transfer(db, base({ loads: [{ piece_id: pc, pallets: 6, go: 0, rest: 'stay' }], trucks: [toB] }));
      const kids = await all(db, `SELECT id, pallets FROM shipment_pieces WHERE parent_piece_id = $1 ORDER BY id`, [pc]);
      const legs = await all(db, `SELECT l.piece_id, l.rt_id, (SELECT location_id FROM rt_stops WHERE id = l.drop_stop_id) dr
                                    FROM piece_legs l WHERE l.piece_id = ANY($1) AND l.deleted_at IS NULL ORDER BY l.piece_id`, [kids.map((k) => k.id)]);
      const st = await one(db, `SELECT transfer_from_stop_id = id self, transfer_waits w FROM rt_stops WHERE id = $1`, [ans.ids.stop_id]);
      return { ans, kids, legs, st };
    });
    assert.deepStrictEqual(r.kids.map((k) => N(k.pallets)), [6, 4]);
    assert.deepStrictEqual(r.legs.map((l) => [N(l.rt_id), N(l.dr)]), [[rtB, e], [rtA, e]]);
    assert.deepStrictEqual(r.st, { self: true, w: false });
    assert.deepStrictEqual(r.ans.ids.new_piece_ids.map(N), r.kids.map((k) => N(k.id)));
  });

  await t.test('wait: the whole load waits at a free-text point - the stop says so, its text apart from the note', async () => {
    const r = await scenario(db, async () => {
      const body = (extra) => base({ point: { text: 'Lamia, parking EKO' }, note: 'reefer checked', reason: 'vehicle_breakdown',
        loads: [{ piece_id: pc, go: 'wait' }], ...extra });
      const pre = await transfer(db, body({ dry_run: true }));
      const ans = await transfer(db, body({}));
      const st = await one(db, `SELECT s.transfer_place, s.transfer_note, s.transfer_waits, l.legacy_id FROM rt_stops s
                                 JOIN locations l ON l.id = s.location_id WHERE s.id = $1`, [ans.ids.stop_id]);
      const pos = await one(db, `SELECT waiting, at_hub FROM v_piece_state WHERE piece_id = $1`, [pc]);
      return { pre, st, pos };
    });
    assert.deepStrictEqual(r.pre.preview.waiting.map((w) => N(w.piece_id)), [pc]);
    assert.deepStrictEqual(r.st, { transfer_place: 'Lamia, parking EKO', transfer_note: 'reefer checked', transfer_waits: true, legacy_id: 'v5_transfer_point' });
    assert.deepStrictEqual(r.pos, { waiting: true, at_hub: false });
  });

  await t.test('VS export met at Larisa, B reaches Veroia the next day: the international follows B, the preview says so', async () => {
    const r = await scenario(db, async () => {
      const vs = N((await one(db, `SELECT t99_vs($1, DATE '2026-12-07') id`, [g])).id);
      const rA = N((await one(db, `SELECT t99_put($1, t99_truck(), 8, 18) id`, [vs])).id);
      const oid = (await one(db, `SELECT s.order_id o FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id WHERE sp.id = $1`, [vs])).o;
      const rB2 = N((await one(db, `SELECT t99_put(t99_national($1, $2, 3), t99_truck(), 8, 10) id`, [x, y])).id);
      const body = base({ rt_id: rA, loads: [{ piece_id: vs, go: 0 }], trucks: [{ target: { rt_id: rB2, side: 'ANODOS' },
        stops: [{ ref: 'd', location_id: hub, side: 'ANODOS', planned_from: `2026-12-08T09:00:00+02:00`, planned_to: `2026-12-08T10:00:00+02:00` }] }] });
      const pre = await transfer(db, { ...body, dry_run: true });
      await transfer(db, body);
      const cd1 = (await one(db, `SELECT cross_dock_date::text d FROM orders WHERE id = $1`, [oid])).d;
      return { cd1, pre, oid: N(oid) };
    });
    assert.strictEqual(r.pre.preview.conflict, null, JSON.stringify(r.pre.preview.conflict));
    assert.deepStrictEqual(r.pre.preview.vs_day, [{ order_id: r.oid, from: DAY, to: '2026-12-08' }]);
    assert.strictEqual(r.cd1, '2026-12-08');
  });

  await t.test('via Veroia: a load A was taking to Veroia goes on with B to Veroia, not to its end (to_hub)', async () => {
    const r = await scenario(db, async () => {
      const p2 = N((await one(db, `SELECT t99_national($1, $2, 4) id`, [g, e])).id);
      const rA2 = N((await one(db, `SELECT t99_put_at($1, NULL, t99_truck(), $2, 8, $3, 18) id`, [p2, g, hub])).id);
      const ans = await transfer(db, base({ rt_id: rA2, loads: [{ piece_id: p2, go: 0 }], trucks: [{ target: { rt_id: rtB, side: 'ANODOS' },
        stops: [{ ref: 'd', location_id: hub, side: 'ANODOS', planned_from: at(16), planned_to: at(17) }] }] }));
      const st = await one(db, `SELECT at_hub, waiting FROM v_piece_state WHERE piece_id = $1`, [p2]);
      return { ans, st };
    });
    assert.strictEqual(r.ans.ok, true);
    assert.deepStrictEqual(r.st, { at_hub: true, waiting: true });
  });

  await t.test('a load already planned on from Veroia: refused by name (transfer_next_leg), nothing kept', async () => {
    const err = await scenario(db, async () => {
      const p2 = N((await one(db, `SELECT t99_national($1, $2, 4) id`, [g, e])).id);
      const rA2 = N((await one(db, `SELECT t99_put_at($1, NULL, t99_truck(), $2, 8, $3, 12) id`, [p2, g, hub])).id);
      await one(db, `SELECT t99_put_at($1, NULL, t99_truck(), $2, 15, $3, 18) id`, [p2, hub, e]);
      return errTransfer(db, base({ rt_id: rA2, planned_from: at(10), planned_to: at(11), loads: [{ piece_id: p2, go: 'wait' }] }));
    });
    assert.match(err ?? '', /transfer_next_leg/);
  });

  await t.test('two trucks in one act: 6 to B, the rest 4 to a new truck C - each its own stop at the point, linked', async () => {
    const r = await scenario(db, async () => {
      const truck = N((await one(db, `SELECT t99_truck() id`)).id);
      const ans = await transfer(db, base({ loads: [{ piece_id: pc, pallets: 6, go: 0, rest: 1 }], trucks: [toB, {
        target: { new_rt: { trip_type: 'OWNED', truck_id: truck }, side: 'ANODOS' },
        stops: [{ ref: 'd', location_id: e, side: 'ANODOS', planned_from: at(16), planned_to: at(17) }] }] }));
      const links = await all(db, `SELECT rt_id FROM rt_stops WHERE transfer_from_stop_id = $1 AND deleted_at IS NULL ORDER BY rt_id`, [ans.ids.stop_id]);
      return { ans, links };
    });
    assert.strictEqual(r.ans.ids.rt_ids.length, 2);
    assert.deepStrictEqual(r.links.map((x2) => N(x2.rt_id)).sort((a, b) => a - b), r.ans.ids.rt_ids.map(N).sort((a, b) => a - b));
  });

  await t.test('whole_vehicle is false when A loads something else after the point (a vehicle change would move it)', async () => {
    const r = await scenario(db, async () => {
      const later = N((await one(db, `SELECT t99_national($1, $2, 2) id`, [x, y])).id);
      await one(db, `SELECT t99_put_at($1, $2, NULL, $3, 15, $4, 17) id`, [later, rtA, x, y]);
      const truck = N((await one(db, `SELECT t99_truck() id`)).id);
      return transfer(db, base({ dry_run: true, loads: [{ piece_id: pc, go: 0 }], trucks: [{
        target: { new_rt: { trip_type: 'OWNED', truck_id: truck }, side: 'ANODOS' },
        stops: [{ ref: 'd', location_id: e, side: 'ANODOS', planned_from: at(16), planned_to: at(17) }] }] }));
    });
    assert.strictEqual(r.preview.conflict, null, JSON.stringify(r.preview.conflict));
    assert.strictEqual(r.preview.whole_vehicle, false);
  });

  await t.test('refused, nothing kept: no reason, the hub as point, a load not on board, a whole "stay", an unused truck, bad shapes', async () => {
    const cases = [
      [base({ reason: undefined, loads: [{ piece_id: pc, go: 'wait' }] }), /bad_input:reason/],
      [base({ point: { location_id: hub }, loads: [{ piece_id: pc, go: 'wait' }] }), /transfer_at_hub/],
      [base({ planned_from: at(19), planned_to: at(20), loads: [{ piece_id: pc, go: 'wait' }] }), /transfer_not_on_board/],
      [base({ loads: [{ piece_id: q, go: 'wait' }] }), /transfer_not_on_board/],
      [base({ loads: [{ piece_id: pc, go: 'stay' }] }), /bad_input:load\.go:stay/],
      [base({ loads: [{ piece_id: pc, go: 'wait' }], trucks: [toB] }), /bad_input:trucks\[0\]:no load/],
      [base({ point: { location_id: lar, text: 'x' }, loads: [{ piece_id: pc, go: 'wait' }] }), /bad_input:point: location_id or text/],
      [base({ loads: [{ piece_id: pc, go: 3 }] }), /bad_input:load\.go/],
      [base({ loads: [{ piece_id: pc, pallets: 12, go: 'wait', rest: 'wait' }] }), /parts_sum/],
      [base({ loads: [{ piece_id: pc, go: 'wait' }], color: 'red' }), /bad_input:p\.color/],
      [base({ reason: 'coffee', loads: [{ piece_id: pc, go: 'wait' }] }), /rt_stops_transfer_reason/],
      [base({ loads: [{ piece_id: pc, pallets: 6, go: 'stay', rest: 'stay' }] }), /bad_input:loads:nothing leaves/],
      [base({ loads: [{ piece_id: pc, go: 0 }], trucks: [{ target: { rt_id: rtA, side: 'ANODOS' } }] }), /bad_input:trucks:same trip/],
      [base({ loads: [{ piece_id: pc, pallets: 6, go: 0, rest: 1 }], trucks: [toB, toB] }), /bad_input:trucks:same trip/],
      [{ ...base({ loads: [{ piece_id: pc, go: 'wait' }] }), request_id: undefined }, /request_missing/],
    ];
    const before = await one(db, COUNTS);
    for (const [body, re] of cases) {
      const err = await scenario(db, () => errTransfer(db, JSON.parse(JSON.stringify(body))));
      assert.match(err ?? 'no error', re, JSON.stringify(body));
    }
    assert.deepStrictEqual(await one(db, COUNTS), before);
  });

  await t.test('the same request again: the first answer, replayed, nothing written twice; another body - request_reused', async () => {
    const r = await scenario(db, async () => {
      const body = base({ loads: [{ piece_id: pc, go: 'wait' }] });
      const a1 = await transfer(db, body);
      const n1 = await one(db, COUNTS);
      const a2 = await transfer(db, body);
      const n2 = await one(db, COUNTS);
      const e3 = await errTransfer(db, { ...body, note: 'other' });
      return { a1, a2, n1, n2, e3 };
    });
    assert.strictEqual(r.a2.replayed, true);
    assert.deepStrictEqual(r.a2.ids, r.a1.ids);
    assert.deepStrictEqual(r.n2, r.n1);
    assert.match(r.e3 ?? '', /request_reused/);
  });

  await t.test('a dry run that would break a rule shows its code in the preview, writes nothing', async () => {
    const before = await one(db, COUNTS);
    // B would unload at E (09:00) before it loads at the point (13:00)
    const ans = await transfer(db, base({ dry_run: true, loads: [{ piece_id: pc, go: 0 }], trucks: [{
      target: { rt_id: rtB, side: 'ANODOS' }, stops: [{ ref: 'd', location_id: e, side: 'ANODOS', planned_from: at(9), planned_to: at(10) }] }] }));
    assert.strictEqual(ans.dry_run, true);
    assert.ok(ans.preview.conflict && ans.preview.conflict.code, JSON.stringify(ans.preview));
    assert.deepStrictEqual(await one(db, COUNTS), before);
  });

  await t.test('rollback: refused while a transfer exists; then plan_transfer, transfer_place and the place go', async () => {
    await transfer(db, base({ loads: [{ piece_id: pc, go: 'wait' }] }));
    assert.match(await errorOf(db, read(`${P}_rollback.sql`)) ?? '', /099 rollback: a stop holds a transfer value/);
    // take the transfer away by hand (the screens' undo is a later piece; here only the rows)
    await db.exec(`BEGIN; SET CONSTRAINTS ALL DEFERRED;
      UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:099' WHERE piece_id = ${pc} AND deleted_at IS NULL;
      UPDATE rt_stops SET transfer_reason = NULL, transfer_waits = false, transfer_place = NULL, transfer_note = NULL,
        transfer_from_stop_id = NULL WHERE transfer_reason IS NOT NULL OR transfer_from_stop_id IS NOT NULL;
      UPDATE rt_stops SET location_id = ${lar} WHERE location_id = (SELECT id FROM locations WHERE legacy_id = 'v5_transfer_point');
      COMMIT;`);
    const dry = await errorOf(db, read(`${P}_rollback_dryrun.sql`));
    assert.match(dry ?? '', /DRY RUN 099 ROLLBACK finished - EVERYTHING UNDONE/);
    assert.match(dry, /rollback ran: plan_transfer none, transfer_place 0, transfer point 0/);
    assert.strictEqual(await errorOf(db, read(`${P}_rollback.sql`)), null);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('${SIG}') AS r`)).r, null);
    assert.strictEqual(N((await one(db, `SELECT count(*) n FROM locations WHERE legacy_id = 'v5_transfer_point'`)).n), 0);
    assert.strictEqual((await one(db, TRG)).n, trg0);
    assert.match(await errorOf(db, read(`${P}_dryrun.sql`)) ?? '', /099 ran: plan_transfer /);
  });
});
