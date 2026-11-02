// 095 (owner 2/11, relaxed rules, group 6) on the production-shaped PGlite copy as production holds it on 2/11 once
// 093 has run (prod-shaped-093.mjs: order 093 -> 095, both patch plan_rt_update). Each scenario runs inside a transaction that is always rolled back, with the deferred rules
// fired before the rows are read: first on the LIVE texts (NO-GO: a local loading on another day and a vehicle change
// without a reason are refused), then after 095 (GO, and what must still be refused), then the rollback (it stops
// over a row the old rules refuse, then puts every text, CHECK and B-93 back). Every case reads ROWS (local_moves,
// rt_vehicle_segments, audit_log, monitoring.checks), never only an answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { prodShaped092 } from './prod-shaped-092.mjs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, applyHunks, PATCHED } from '../../worker/migrations/drafts/tools/build-095.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5s = (db) => Promise.all(PATCHED.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));
const conDef = async (db, n) => (await one(db, `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
  WHERE conrelid = 'public.rt_vehicle_segments'::regclass AND conname = $1`, [n]))?.d ?? null;
const b93 = async (db) => (await one(db, `SELECT enabled FROM monitoring.checks WHERE id = 'B-93'`)).enabled;

// test rows only: legacy ids rec95..., references T95-..., locations TEST 095 ..., plates TEST-095-...
// An export VS with ONE Greek loading (10 pallets) -> Veroia on p_hub -> abroad, as the international form writes it;
// t95_cycle puts its piece on a new OWNED cycle: the Greek loading p_hub 09:00-10:00, Veroia 18:00-19:00 (ANODOS).
const HELPERS = `
CREATE SEQUENCE t95_seq;
CREATE FUNCTION t95_vs(p_ref text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec95X' || p_ref, 'TEST 095 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id, loading_pallets_1, unloading_pallets_1)
  values ('rec95O' || p_ref, 'International', 'Export', 'Pending', true, p_hub, p_hub + 3, p_hub, 'T95-' || p_ref,
          (select min(id) from clients), 10, 10) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec95A' || p_ref, 'Unloading', 1, p_hub + 3, o, lx, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec95H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, 10);
  insert into locations (legacy_id, name) values ('rec95G' || p_ref, 'TEST 095 GR ' || p_ref) returning id into lg;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec95S' || p_ref, 'Loading', 1, p_hub, o, lg, 10);
  return o;
end $t$;
CREATE FUNCTION t95_cycle(p_ref text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare hub bigint; pc bigint; trk bigint; drv bigint; r jsonb;
begin
  perform t95_vs(p_ref, p_hub);
  select id into hub from locations where is_hub;
  select sp.id into pc from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
   where st.legacy_id = 'rec95S' || p_ref and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null;
  insert into trucks (license_plate) values ('TEST-095-' || nextval('t95_seq')) returning id into trk;
  insert into drivers (full_name) values ('TEST 095 driver ' || nextval('t95_seq')) returning id into drv;
  r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pc, 'pickup', 'p', 'drop', 'd')),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk, 'driver_id', drv), 'side', 'ANODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'side', 'ANODOS',
             'location_id', (select vs.nat_from_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = pc),
             'planned_from', (p_hub + time '09:00') at time zone 'Europe/Athens', 'planned_to', (p_hub + time '10:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'location_id', hub, 'side', 'ANODOS',
             'planned_from', (p_hub + time '18:00') at time zone 'Europe/Athens', 'planned_to', (p_hub + time '19:00') at time zone 'Europe/Athens'))),
         'test:095', 'dispatcher');
  perform set_config('plan.writer', '', true);
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;
-- the pickup stop of a cycle (the Greek loading, the one a local loading serves)
CREATE FUNCTION t95_pick(p_rt bigint) RETURNS bigint LANGUAGE sql AS
  $t$ select l.pickup_stop_id from piece_legs l where l.rt_id = p_rt and l.deleted_at is null order by l.id limit 1 $t$;
CREATE FUNCTION t95_truck() RETURNS bigint LANGUAGE sql AS
  $t$ insert into trucks (license_plate) values ('TEST-095-' || nextval('t95_seq')) returning id $t$;
CREATE FUNCTION t95_driver() RETURNS bigint LANGUAGE sql AS
  $t$ insert into drivers (full_name) values ('TEST 095 driver ' || nextval('t95_seq')) returning id $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// a refused call leaves the scenario's transaction usable (its rows are read after it)
async function call(db, fn, body) {
  await db.exec('SAVEPOINT c');
  try {
    const r = (await one(db, `SELECT ${fn}($1::jsonb, 'test:095', 'dispatcher') AS r`, [JSON.stringify(body)])).r;
    await db.exec('RELEASE SAVEPOINT c');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT c'); return { r: null, err: String(e.message) }; }
}
const cycle = (db, ref, day) => num(db, `SELECT t95_cycle($1, $2::date)`, [ref, day]);
const local = async (db, rt, extra = {}) => call(db, 'plan_local_loading', {
  rt_stop_id: await num(db, `SELECT t95_pick($1)`, [rt]), driver_id: await num(db, `SELECT t95_driver()`),
  truck_id: await num(db, `SELECT t95_truck()`), request_id: crypto.randomUUID(), ...extra });
const lmDay = async (db, id) => (await one(db, `SELECT move_date::text AS d FROM local_moves WHERE id = $1`, [id])).d;
// a handover at 12:00 of the hub day: a new truck, the same driver
const handover = async (db, rt, day, extra) => call(db, 'plan_seg_change', {
  rt_id: rt, at: `${day}T12:00:00+02:00`, vehicle: { trip_type: 'OWNED', truck_id: await num(db, `SELECT t95_truck()`) },
  same_driver: true, request_id: crypto.randomUUID(), ...extra });
const segs = async (db, rt) => (await db.query(`SELECT id, place_note, reason, reason_note FROM rt_vehicle_segments
  WHERE rt_id = $1 AND deleted_at IS NULL ORDER BY from_at, id`, [rt])).rows;

test('095 before 093 stops at its first guard and changes nothing (order 093 -> 095)', async () => {
  const db = await prodShaped092();
  const before = await md5s(db);
  assert.match(await errorOf(db, read('095_plan_small_relaxed.sql')) ?? '', /095: public\.plan_rt_update\(jsonb,text,text\) is not its live text of 2\/11 \(plan_rt_update: 093 first/);
  assert.deepStrictEqual(await md5s(db), before);
  assert.strictEqual(await b93(db), true);
});

test('095 on the production-shaped copy (2/11, after 093): a local loading on another day, a vehicle change without a reason', async (t) => {
  const db = await prodShaped093();
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const day = (await one(db, `SELECT ($1::date + 3)::text AS d`, [L])).d;
  const eve = (await one(db, `SELECT ($1::date - 1)::text AS d`, [day])).d;
  const next = (await one(db, `SELECT ($1::date + 1)::text AS d`, [day])).d;
  const src = read('095_plan_small_relaxed.sql');
  const F = facts(src);
  const live = await md5s(db);

  await t.test('the copy holds the LIVE texts and CHECKs 095 guards on (production, SELECT 2/11), and the hunks give PART 2', async () => {
    assert.deepStrictEqual(live, PATCHED.map((s) => F.live[s]));
    for (const g of F.gen) {
      const txt = (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = '${g.sig}'::regprocedure`)).prosrc;
      assert.strictEqual(crypto.createHash('md5').update(applyHunks(txt, g, F.consts)).digest('hex'), g.m, g.sig);
    }
    assert.strictEqual(await conDef(db, 'seg_change_pair'), 'CHECK (((reason IS NULL) = (place_note IS NULL)))');
    assert.ok(await conDef(db, 'seg_other_note'));
    assert.strictEqual(await b93(db), true);
  });

  await t.test('NO-GO on the live texts: move_date is an unknown key; a handover without a reason is bad_input', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'N1', day);
      return { lm: await local(db, rt, { move_date: eve }), ho: await handover(db, rt, day, { place_note: 'Lamia' }), segs: await segs(db, rt) };
    });
    assert.strictEqual(r.late, null);
    assert.match(r.lm.err ?? '', /bad_input/);
    assert.match(r.ho.err ?? '', /bad_input/);
    assert.strictEqual(r.segs.length, 1);
  });

  await t.test('NO-GO on the live texts: a loading kept on another day is refused at COMMIT (local_loading_day)', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'N2', day);
      const lm = await local(db, rt);
      // a write behind the act (the deferred rule speaks at the statement once plan_* set the constraints immediate)
      const upd = await errorOf(db, `UPDATE local_moves SET move_date = '${eve}'::date WHERE id = ${lm.r.ids.local_move_id}`);
      return { lm, upd };
    });
    assert.strictEqual(r.lm.err, null);
    assert.match(r.upd ?? r.late ?? '', /local_loading_day/);
  });

  await t.test('095 dry run keeps nothing and names the md5 it ends on', async () => {
    const msg = await errorOf(db, read('095_plan_small_relaxed_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 095 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}095 ran: /, msg);
    for (const g of F.gen) assert.ok(msg.includes(g.m), g.sig);
    assert.match(msg, /pair CHECK \(\(\(reason IS NULL\) OR \(place_note IS NOT NULL\)\)\), b93 f/);
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual(await b93(db), true);
  });

  await t.test('095 runs: the six texts, the CHECK rebuilt, seg_other_note gone, B-93 off with its reason', async () => {
    assert.strictEqual(await errorOf(db, src), null);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.strictEqual(await conDef(db, 'seg_change_pair'), 'CHECK (((reason IS NULL) OR (place_note IS NOT NULL)))');
    assert.strictEqual(await conDef(db, 'seg_other_note'), null);
    const c = await one(db, `SELECT enabled, disabled_reason FROM monitoring.checks WHERE id = 'B-93'`);
    assert.strictEqual(c.enabled, false);
    assert.match(c.disabled_reason, /^095 /);
    assert.match(await errorOf(db, src) ?? '', /095: public\.plan_local_loading_problem\(bigint\) is not its live text/, 'a second run stops');
  });

  await t.test('GO: a local loading the evening before - kept, said (warning) and in its audit row; the COMMIT holds', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G1', day);
      const lm = await local(db, rt, { move_date: eve });
      const id = lm.r?.ids?.local_move_id;
      return { lm, d: await lmDay(db, id), audit: await one(db, `SELECT action, after_data->>'move_date' AS d FROM audit_log
        WHERE table_name = 'local_moves' AND record_id = $1 ORDER BY id DESC LIMIT 1`, [String(id)]) };
    });
    assert.strictEqual(r.lm.err, null);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.d, eve);
    assert.deepStrictEqual(r.lm.r.warnings, [{ code: 'local_loading_other_day', local_move_id: r.lm.r.ids.local_move_id, move_date: eve, stop_day: day }]);
    assert.deepStrictEqual([r.audit.action, r.audit.d], ['create', eve]);
  });

  await t.test('GO: without move_date (or null, or the stop\'s own day) the loading is on its stop\'s day, no warning', async () => {
    for (const extra of [{}, { move_date: null }, { move_date: day }]) {
      const r = await scenario(db, async () => {
        const rt = await cycle(db, 'G2', day);
        const lm = await local(db, rt, extra);
        return { lm, d: lm.r ? await lmDay(db, lm.r.ids.local_move_id) : null };
      });
      assert.strictEqual(r.lm.err, null, JSON.stringify(extra));
      assert.strictEqual(r.late, null);
      assert.strictEqual(r.d, day);
      assert.deepStrictEqual(r.lm.r.warnings, []);
    }
  });

  await t.test('still refused: a malformed, non-string or infinite day, and a day on a cancel (bad_input, nothing written)', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G3', day);
      const bad = [];
      for (const v of ['2026-13-40', 'tomorrow', 'today', '2026-11-3', 5, true, 'infinity']) bad.push((await local(db, rt, { move_date: v })).err);
      const ok = await local(db, rt);
      if (!ok.r) throw new Error('G3 ok: ' + ok.err + ' | bad: ' + JSON.stringify(bad));
      const cancel = await call(db, 'plan_local_loading', { local_move_id: ok.r.ids.local_move_id, cancel: true, move_date: eve });
      return { bad, cancel, n: await num(db, `SELECT count(*) FROM local_moves lm JOIN rt_stops s ON s.id = lm.rt_stop_id
        WHERE s.rt_id = $1 AND lm.status <> 'Cancelled'`, [rt]) };
    });
    for (const e of r.bad) assert.match(e ?? '', /bad_input/);
    assert.match(r.cancel.err ?? '', /bad_input/);
    assert.strictEqual(r.n, 1, 'the one good loading, not cancelled by a refused cancel');
    assert.strictEqual(r.late, null);
  });

  await t.test('GO: plan_rt_update - a vehicle change keeps the loading\'s day; a shift of the side moves it by the same days', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G4', day);
      const lm = await local(db, rt, { move_date: eve });
      const id = lm.r.ids.local_move_id;
      const veh = await call(db, 'plan_rt_update', { rt_id: rt, set: { truck_id: await num(db, `SELECT t95_truck()`) } });
      const d1 = await lmDay(db, id);
      const sh = await call(db, 'plan_rt_update', { rt_id: rt, shift: { side: 'ANODOS', delta: '1 day' } });
      return { veh, sh, d1, d2: await lmDay(db, id) };
    });
    assert.strictEqual(r.veh.err, null);
    assert.strictEqual(r.sh.err, null);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.d1, eve, 'a vehicle change does not snap it back to the stop\'s day');
    assert.strictEqual(r.d2, day, 'the stop moved one day, the loading too: still the evening before');
  });

  await t.test('GO: a loading on its stop\'s day still follows it to the new day (as before 095)', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G5', day);
      const lm = await local(db, rt);
      const sh = await call(db, 'plan_rt_update', { rt_id: rt, shift: { side: 'ANODOS', delta: '1 day' } });
      return { sh, d: await lmDay(db, lm.r.ids.local_move_id) };
    });
    assert.strictEqual(r.sh.err, null);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.d, next);
  });

  await t.test('GO: a vehicle change with a point and no reason; "other" without a note', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G6', day);
      const a = await handover(db, rt, day, { place_note: 'Lamia' });
      const s1 = await segs(db, rt);
      const json = (await one(db, `SELECT plan_h_seg_json($1::bigint) AS j`, [rt])).j;
      return { a, s1, json };
    });
    const r2 = await scenario(db, async () => {
      const rt2 = await cycle(db, 'G7', day);
      const b = await handover(db, rt2, day, { place_note: 'Larisa', reason: 'other' });
      return { b, s2: await segs(db, rt2) };
    });
    assert.strictEqual(r.a.err, null);
    assert.strictEqual(r2.b.err, null);
    assert.strictEqual(r.late, null);
    assert.strictEqual(r2.late, null);
    r.s2 = r2.s2;
    assert.deepStrictEqual(r.s1.map((s) => [s.place_note, s.reason]), [[null, null], ['Lamia', null]]);
    assert.strictEqual(r.json[1].reason ?? null, null);
    assert.deepStrictEqual(r.s2.map((s) => [s.place_note, s.reason, s.reason_note]), [[null, null, null], ['Larisa', 'other', null]]);
  });

  await t.test('still refused: no point (bad_input), an unknown reason (seg_reason_list), a point removed behind the acts (seg_place_text)', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G8', day);
      const noPlace = await handover(db, rt, day, { reason: 'accident' });
      const blank = await handover(db, rt, day, { place_note: '   ' });
      const bogus = await handover(db, rt, day, { place_note: 'Lamia', reason: 'bogus' });
      return { noPlace, blank, bogus, n: (await segs(db, rt)).length };
    });
    assert.match(r.noPlace.err ?? '', /bad_input/);
    assert.match(r.blank.err ?? '', /bad_input/);
    assert.match(r.bogus.err ?? '', /seg_reason_list/);
    assert.strictEqual(r.n, 1);
    assert.strictEqual(r.late, null);
    const net = await scenario(db, async () => {
      const rt = await cycle(db, 'G9', day);
      const a = await handover(db, rt, day, { place_note: 'Lamia' });
      const upd = await errorOf(db, `UPDATE rt_vehicle_segments SET place_note = NULL WHERE rt_id = ${rt} AND place_note IS NOT NULL`);
      return { a, upd };
    });
    assert.strictEqual(net.a.err, null);
    assert.match(net.upd ?? net.late ?? '', /seg_place_text/);
  });

  await t.test('GO: plan_seg_fix - a reason cleared (empty) or set; a point cannot be emptied', async () => {
    const r = await scenario(db, async () => {
      const rt = await cycle(db, 'G10', day);
      await handover(db, rt, day, { place_note: 'Lamia', reason: 'accident' });
      const sid = (await segs(db, rt))[1].id;
      const clear = await call(db, 'plan_seg_fix', { segment_id: sid, set: { reason: '' } });
      const r1 = (await segs(db, rt))[1].reason;
      const other = await call(db, 'plan_seg_fix', { segment_id: sid, set: { reason: 'other' } });
      const r2 = (await segs(db, rt))[1].reason;
      const place = await call(db, 'plan_seg_fix', { segment_id: sid, set: { place_note: ' ' } });
      return { clear, other, place, r1, r2 };
    });
    assert.strictEqual(r.clear.err, null);
    assert.strictEqual(r.r1, null);
    assert.strictEqual(r.other.err, null);
    assert.strictEqual(r.r2, 'other');
    assert.match(r.place.err ?? '', /bad_input/);
    assert.strictEqual(r.late, null);
  });

  await t.test('rollback: it STOPS over a row the old rules refuse, then puts every text, CHECK and B-93 back', async () => {
    // a committed handover without a reason (what 095 allows): the old seg_change_pair could not be rebuilt over it
    await db.exec('BEGIN');
    const rt = await cycle(db, 'R1', day);
    const ho = await handover(db, rt, day, { place_note: 'Lamia' });
    await db.exec('COMMIT');
    assert.strictEqual(ho.err, null);
    assert.match(await errorOf(db, read('095_plan_small_relaxed_rollback_dryrun.sql')) ?? '', /095 rollback: segments with a point and no reason/);
    assert.match(await errorOf(db, read('095_plan_small_relaxed_rollback.sql')) ?? '', /095 rollback: segments with a point and no reason/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m), 'nothing changed by the stopped rollback');
    await db.query(`UPDATE rt_vehicle_segments SET reason = 'accident' WHERE rt_id = $1 AND place_note IS NOT NULL`, [rt]);
    // a committed loading on another day: the rollback names it too
    await db.exec('BEGIN');
    const rt2 = await cycle(db, 'R2', day);
    const lm = await local(db, rt2, { move_date: eve });
    await db.exec('COMMIT');
    assert.match(await errorOf(db, read('095_plan_small_relaxed_rollback.sql')) ?? '', /local loadings on another day than their stop \(071 refuses them\) - stop: local_move \d+/);
    await db.query(`UPDATE local_moves SET move_date = $2::date WHERE id = $1`, [lm.r.ids.local_move_id, day]);
    const dry = await errorOf(db, read('095_plan_small_relaxed_rollback_dryrun.sql'));
    assert.match(dry ?? '', /DRY RUN 095 ROLLBACK finished - EVERYTHING UNDONE/, dry);
    for (const m of live) assert.ok(dry.includes(m));
    assert.strictEqual(await errorOf(db, read('095_plan_small_relaxed_rollback.sql')), null);
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual(await conDef(db, 'seg_change_pair'), 'CHECK (((reason IS NULL) = (place_note IS NULL)))');
    assert.ok(await conDef(db, 'seg_other_note'));
    assert.deepStrictEqual(await one(db, `SELECT enabled, disabled_reason FROM monitoring.checks WHERE id = 'B-93'`), { enabled: true, disabled_reason: null });
    // and 095's own guards hold again on the restored base
    assert.match(await errorOf(db, read('095_plan_small_relaxed_dryrun.sql')) ?? '', /DRY RUN 095 finished/);
  });
});
