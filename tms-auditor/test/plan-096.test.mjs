// 096 (coordinator 2/11: the vehicle change takes 086's accept_busy) on the production-shaped PGlite copy as production
// will hold it after 093 and 095 (prod-shaped-093.mjs + 095). Each scenario runs inside a transaction that is always
// rolled back, with the deferred rules fired before the rows are read: first on 095's texts (NO-GO: accept_busy is an
// unknown key, the busy truck refused), then after 096 (GO with a trace, still refused without it, a third overlap
// nobody accepted still refused at COMMIT), then the rollback. Every case reads ROWS (rt_vehicle_segments, audit_log).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, applyHunks, PATCHED } from '../../worker/migrations/drafts/tools/build-096.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5s = (db) => Promise.all(PATCHED.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));

// test rows only: TEST-096-... plates, TEST 096 ... names. Two OWNED cycles on the same day: B uses truck X all day;
// A is handed over at 12:00 to truck X (the busy one).
const HELPERS = `
CREATE SEQUENCE t96_seq;
CREATE FUNCTION t96_truck() RETURNS bigint LANGUAGE sql AS
  $t$ insert into trucks (license_plate) values ('TEST-096-' || nextval('t96_seq')) returning id $t$;
CREATE FUNCTION t96_driver() RETURNS bigint LANGUAGE sql AS
  $t$ insert into drivers (full_name) values ('TEST 096 driver ' || nextval('t96_seq')) returning id $t$;
-- an export VS with ONE Greek loading -> Veroia on p_day (as 095's t95_vs), on a new OWNED cycle of p_truck: the Greek
-- loading 09:00-10:00, Veroia 18:00-19:00 (ANODOS) - so two such cycles of one truck overlap 09:00-19:00
CREATE FUNCTION t96_cycle(p_day date, p_truck bigint) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint; pc bigint; r jsonb; k text := 'r96' || nextval('t96_seq');
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values (k || 'X', 'TEST 096 abroad') returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id, loading_pallets_1, unloading_pallets_1)
  values (k || 'O', 'International', 'Export', 'Pending', true, p_day, p_day + 3, p_day, 'T96-' || k,
          (select min(id) from clients), 10, 10) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'A', 'Unloading', 1, p_day + 3, o, lx, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'H', 'Cross-dock', 1, p_day, o, hub, 10);
  insert into locations (legacy_id, name) values (k || 'G', 'TEST 096 GR') returning id into lg;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'S', 'Loading', 1, p_day, o, lg, 10);
  select sp.id into pc from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
   where st.legacy_id = k || 'S' and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null;
  r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pc, 'pickup', 'p', 'drop', 'd')),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', p_truck, 'driver_id', t96_driver()), 'side', 'ANODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'side', 'ANODOS', 'location_id', lg,
             'planned_from', (p_day + time '09:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '10:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'location_id', hub, 'side', 'ANODOS',
             'planned_from', (p_day + time '18:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '19:00') at time zone 'Europe/Athens'))),
         'test:096', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
async function call(db, fn, body) {
  await db.exec('SAVEPOINT c');
  try {
    const r = (await one(db, `SELECT ${fn}($1::jsonb, 'test:096', 'dispatcher') AS r`, [JSON.stringify(body)])).r;
    await db.exec('RELEASE SAVEPOINT c');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT c'); return { r: null, err: String(e.message) }; }
}
const handover = (db, rt, day, truck, extra) => call(db, 'plan_seg_change', {
  rt_id: rt, at: `${day}T12:00:00+02:00`, place_note: 'Lamia', vehicle: { trip_type: 'OWNED', truck_id: truck },
  same_driver: true, request_id: crypto.randomUUID(), ...extra });
const segs = async (db, rt) => (await db.query(`SELECT id, truck_id, overlap_rts FROM rt_vehicle_segments
  WHERE rt_id = $1 AND deleted_at IS NULL ORDER BY from_at, id`, [rt])).rows;

test('096 on the production-shaped copy (after 093 and 095): a vehicle change over a busy truck, one press with a trace', async (t) => {
  const db = await prodShaped093();
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const day = (await one(db, `SELECT ($1::date + 3)::text AS d`, [L])).d;
  const src = read('096_plan_handover_accept_busy.sql');
  const F = facts(src);

  await t.test('before 095, 096 stops at its first guard and changes nothing (order 095 -> 096)', async () => {
    const before = await md5s(db);
    assert.match(await errorOf(db, src) ?? '', /096: public\.plan_seg_change\(jsonb,text,text\) is not the text 096 builds on \(095 first/);
    assert.deepStrictEqual(await md5s(db), before);
  });

  await db.exec(read('095_plan_small_relaxed.sql'));
  await db.exec(HELPERS);
  const base = await md5s(db);

  await t.test('the copy holds 095\'s texts and the 086 texts 096 relies on; the hunks give PART 1', async () => {
    assert.deepStrictEqual(base, PATCHED.map((s) => F.live[s]));
    for (const [sig, m] of Object.entries(F.live)) {
      assert.strictEqual((await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).m, m, sig);
    }
    for (const g of F.gen) {
      const txt = (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = '${g.sig}'::regprocedure`)).prosrc;
      assert.strictEqual(crypto.createHash('md5').update(applyHunks(txt, g, F.consts)).digest('hex'), g.m, g.sig);
    }
  });

  const busyCase = (extra, fixExtra) => scenario(db, async () => {
    const x = await num(db, `SELECT t96_truck()`);
    const b = await num(db, `SELECT t96_cycle($1::date, $2)`, [day, x]);
    const a = await num(db, `SELECT t96_cycle($1::date, t96_truck())`, [day]);
    const ho = await handover(db, a, day, x, extra);
    const sa = await segs(db, a);
    let fix = null;
    if (fixExtra) {
      // the correction of A's first segment to truck X too (it overlaps B the whole morning)
      fix = await call(db, 'plan_seg_fix', { segment_id: sa[0].id, set: { truck_id: x }, ...fixExtra });
    }
    const audit = await num(db, `SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND actor = 'test:096'
      AND after_data ? 'overlaps'`);
    return { a, b, ho, fix, sa: await segs(db, a), audit };
  });

  await t.test('NO-GO on 095\'s texts: accept_busy is an unknown key; without it the busy truck is refused (truck_busy)', async () => {
    const r1 = await busyCase({ accept_busy: true });
    assert.match(r1.ho.err ?? '', /bad_input/);
    assert.strictEqual(r1.sa.length, 1);
    const r2 = await busyCase({});
    assert.match(r2.ho.err ?? '', /truck_busy/);
    assert.strictEqual(r2.sa.length, 1);
  });

  await t.test('096 dry run keeps nothing and names the md5 it ends on', async () => {
    const msg = await errorOf(db, read('096_plan_handover_accept_busy_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 096 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}096 ran: /, msg);
    for (const g of F.gen) assert.ok(msg.includes(g.m), g.sig);
    assert.deepStrictEqual(await md5s(db), base);
  });

  await t.test('096 runs: the two texts', async () => {
    assert.strictEqual(await errorOf(db, src), null);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.match(await errorOf(db, src) ?? '', /is not the text 096 builds on/, 'a second run stops');
  });

  await t.test('GO: accept_busy: true - the handover to the busy truck is kept, the overlap named on the segment, an audit row', async () => {
    const r = await busyCase({ accept_busy: true });
    assert.strictEqual(r.ho.err, null);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.sa.length, 2);
    assert.deepStrictEqual(r.sa[1].overlap_rts.map(Number), [r.b]);
    assert.ok(r.audit >= 1, 'one audit row names the overlap');
  });

  await t.test('GO: the dry run with accept_busy previews the change (no conflict); without it the conflict is truck_busy', async () => {
    const r = await scenario(db, async () => {
      const x = await num(db, `SELECT t96_truck()`);
      await num(db, `SELECT t96_cycle($1::date, $2)`, [day, x]);
      const a = await num(db, `SELECT t96_cycle($1::date, t96_truck())`, [day]);
      return { yes: await handover(db, a, day, x, { dry_run: true, accept_busy: true }), no: await handover(db, a, day, x, { dry_run: true }), n: (await segs(db, a)).length };
    });
    assert.strictEqual(r.yes.err, null);
    assert.ok(!r.yes.r.preview.conflict, JSON.stringify(r.yes.r.preview.conflict));
    assert.strictEqual((r.yes.r.preview.segments || []).length, 2);
    assert.match(JSON.stringify(r.no.r?.preview?.conflict ?? r.no.err), /truck_busy/);
    assert.strictEqual(r.n, 1, 'a dry run writes nothing');
  });

  await t.test('still refused: without accept_busy (truck_busy); accept_busy not a boolean (bad_input)', async () => {
    const r = await busyCase({});
    assert.match(r.ho.err ?? '', /truck_busy/);
    const s = await busyCase({ accept_busy: 'yes' });
    assert.match(s.ho.err ?? '', /bad_input:p\.accept_busy/);
  });

  await t.test('GO: plan_seg_fix takes accept_busy too; without it the correction is refused', async () => {
    const yes = await busyCase({ accept_busy: true }, { accept_busy: true });
    assert.strictEqual(yes.fix.err, null, yes.fix.err);
    assert.strictEqual(yes.late, null);
    assert.strictEqual(Number(yes.sa[0].truck_id), Number(yes.sa[1].truck_id));
    const no = await busyCase({ accept_busy: true }, {});
    assert.match(no.fix.err ?? '', /truck_busy/);
  });

  await t.test('still refused: a later save of ANOTHER trip onto the same truck, without accept_busy (truck_busy)', async () => {
    // the acceptance holds for the pair it named, never for a new overlap (086): a third trip moved to truck X is refused
    const r = await scenario(db, async () => {
      const x = await num(db, `SELECT t96_truck()`);
      await num(db, `SELECT t96_cycle($1::date, $2)`, [day, x]);
      const a = await num(db, `SELECT t96_cycle($1::date, t96_truck())`, [day]);
      const c = await num(db, `SELECT t96_cycle($1::date, t96_truck())`, [day]);
      const ho = await handover(db, a, day, x, { accept_busy: true });
      const upd = await call(db, 'plan_rt_update', { rt_id: c, set: { truck_id: x } });
      return { ho, upd, x, cx: (await segs(db, c)).map((g) => Number(g.truck_id)) };
    });
    assert.strictEqual(r.ho.err, null);
    assert.match(r.upd.err ?? '', /truck_busy/);
    assert.ok(!r.cx.includes(r.x), 'the third trip keeps its own truck');
    assert.strictEqual(r.late, null);
  });

  await t.test('rollback: back to 095\'s texts; an accepted overlap already kept stays (the pair rule holds it)', async () => {
    await db.exec('BEGIN');
    const x = await num(db, `SELECT t96_truck()`);
    await num(db, `SELECT t96_cycle($1::date, $2)`, [day, x]);
    const a = await num(db, `SELECT t96_cycle($1::date, t96_truck())`, [day]);
    const ho = await handover(db, a, day, x, { accept_busy: true });
    await db.exec('COMMIT');
    assert.strictEqual(ho.err, null);
    const dry = await errorOf(db, read('096_plan_handover_accept_busy_rollback_dryrun.sql'));
    assert.match(dry ?? '', /DRY RUN 096 ROLLBACK finished - EVERYTHING UNDONE/, dry);
    assert.strictEqual(await errorOf(db, read('096_plan_handover_accept_busy_rollback.sql')), null);
    assert.deepStrictEqual(await md5s(db), base);
    assert.strictEqual(await num(db, `SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = $1 AND deleted_at IS NULL AND overlap_rts <> '{}'`, [a]), 1);
    assert.match(await errorOf(db, read('096_plan_handover_accept_busy_dryrun.sql')) ?? '', /DRY RUN 096 finished/);
  });
});
