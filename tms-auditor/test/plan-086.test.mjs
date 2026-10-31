// 086 (owner 1/11: relaxed rules - a busy truck / driver allowed when the save accepts it, an all-day drop follows its
// pickup) on the production-shaped PGlite copy as production holds it on 1/11: prod-shaped-074.mjs + 075, 076, 077,
// 078, 080, 082 and 081 (executed), plus 084 (#188, 086 needs it). Each scenario runs inside a transaction that is always
// rolled back, with the deferred rules (the EXCLUDE on rt_vehicle_segments, 071's plan_chk) fired before the rows are
// read: first on the LIVE texts (NO-GO), then after 086 (GO, and what must still be refused), then after the rollback.
// Every case reads ROWS (segments, audit_log, seq), never a message alone.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-086.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const SIGS = ['public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', 'public.plan_h_target(jsonb,jsonb,text,text)',
  'public.plan_rt_update(jsonb,text,text)', 'public.plan_rt_problem(bigint)', 'public.plan_h_reseq(bigint,text,text)'];
const md5s = async (db) => Promise.all(SIGS.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));
const XDEF = `SELECT string_agg(conname || '=' || md5(pg_get_constraintdef(oid)), ',' ORDER BY conname) AS x FROM pg_constraint
  WHERE conrelid = 'public.rt_vehicle_segments'::regclass AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')`;

// test rows only: legacy ids rec86..., references T86-..., locations TEST 086 ..., plates TEST-086-..., drivers TEST 086
const HELPERS = `
CREATE FUNCTION t86_vs(p_ref text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec86X' || p_ref, 'TEST 086 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec86O' || p_ref, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 3, p_hub, 'T86-' || p_ref,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec86A' || p_ref, 'Loading', 1, p_hub - 3, o, lx, 20);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec86H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, 20);
  for i in 1 .. 2 loop
    insert into locations (legacy_id, name) values ('rec86G' || p_ref || i, 'TEST 086 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec86S' || p_ref || i, 'Unloading', i, p_hub + 1, o, lg, 10);
  end loop;
  return o;
end $t$;
CREATE FUNCTION t86_piece(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
       where st.legacy_id = 'rec86S' || p_ref || p_i and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
CREATE FUNCTION t86_dest(p_piece bigint) RETURNS bigint LANGUAGE sql AS
  $t$ select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece $t$;
CREATE SEQUENCE t86_seq;
CREATE FUNCTION t86_at(p_day date, p_hm text) RETURNS timestamptz LANGUAGE sql AS
  $t$ select (p_day + p_hm::time) at time zone 'Europe/Athens' $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
const truck = (db) => num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-086-' || nextval('t86_seq')) RETURNING id`);
const driver = (db) => num(db, `INSERT INTO drivers (full_name) VALUES ('TEST 086 driver ' || nextval('t86_seq')) RETURNING id`);
const at = async (db, day, hm) => (await one(db, `SELECT t86_at(${day}, $1)::text AS t`, [hm])).t;
// a refused call leaves the scenario's transaction usable (its rows are read after it), as PostgREST's own call would
async function put(db, body) {
  await db.exec('SAVEPOINT put');
  try {
    const r = (await one(db, `SELECT plan_put_pieces($1::jsonb, 'test:086', 'dispatcher') AS r`, [JSON.stringify(body)])).r;
    await db.exec('RELEASE SAVEPOINT put');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT put'); return { r: null, err: String(e.message) }; }
}

// BUSY: trip A (truck T, driver DA) Fri 06:00 -> Sat 14:00, committed. Trip B of the SAME truck (or, by: 'driver', a
// new truck with DA) loads at Veroia Sat 09:00 - inside A's window. accept: target.accept_busy (true / false / 'yes').
const busy = (db, L, tag, { accept, by = 'truck' } = {}) => scenario(db, async () => {
  const fri = `DATE '${L}' + 3`;
  await num(db, `SELECT t86_vs('${tag}A', ${fri})`);
  await num(db, `SELECT t86_vs('${tag}B', ${fri} + 1)`);
  const hub = await num(db, `SELECT id FROM locations WHERE is_hub`);
  const [a1, a2, b1] = [await num(db, `SELECT t86_piece('${tag}A', 1)`), await num(db, `SELECT t86_piece('${tag}A', 2)`), await num(db, `SELECT t86_piece('${tag}B', 1)`)];
  const t = await truck(db), da = await driver(db), db2 = await driver(db), t2 = await truck(db);
  const A = await put(db, { pieces: [{ piece_id: a1 }, { piece_id: a2 }],
    target: { new_rt: { trip_type: 'OWNED', truck_id: t, driver_id: da }, side: 'KATHODOS' },
    stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(db, fri, '06:00'), planned_to: await at(db, fri, '07:00') },
      { ref: 'd1', location_id: await num(db, `SELECT t86_dest(${a1})`), side: 'KATHODOS', planned_from: await at(db, `${fri} + 1`, '09:00'), planned_to: await at(db, `${fri} + 1`, '10:00') },
      { ref: 'd2', location_id: await num(db, `SELECT t86_dest(${a2})`), side: 'KATHODOS', planned_from: await at(db, `${fri} + 1`, '12:00'), planned_to: await at(db, `${fri} + 1`, '14:00') }] });
  if (A.err) throw new Error('trip A: ' + A.err);
  const a = Number(A.r.ids.rt_id);
  await db.exec(`SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;`);   // A's own rules, as its COMMIT
  const target = { new_rt: by === 'truck' ? { trip_type: 'OWNED', truck_id: t, driver_id: db2 } : { trip_type: 'OWNED', truck_id: t2, driver_id: da }, side: 'KATHODOS' };
  if (accept !== undefined) target.accept_busy = accept;
  const B = await put(db, { pieces: [{ piece_id: b1 }], target,
    stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(db, `${fri} + 1`, '09:00'), planned_to: await at(db, `${fri} + 1`, '10:00') },
      { ref: 'd', location_id: await num(db, `SELECT t86_dest(${b1})`), side: 'KATHODOS', planned_from: await at(db, `${fri} + 2`, '09:00'), planned_to: await at(db, `${fri} + 2`, '10:00') }] });
  const b = B.r ? Number(B.r.ids.rt_id) : null;
  const hasCol = await num(db, `SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_ok' AND NOT attisdropped`);
  const marked = b && hasCol ? await num(db, `SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = $1 AND overlap_ok`, [b]) : 0;
  const markedA = hasCol ? await num(db, `SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = $1 AND overlap_ok`, [a]) : 0;
  const audit = b ? (await db.query(`SELECT actor, role, action, after_data FROM audit_log WHERE table_name = 'rt_vehicle_segments'
      AND after_data ? 'overlaps' AND (after_data->>'rt_id')::bigint = $1`, [b])).rows : [];
  const aCode = (await one(db, `SELECT code FROM ct_round_trips WHERE id = $1`, [a])).code;
  return { err: B.err, b, marked, markedA, audit, aCode };
});

// ALL-DAY: one VS piece, Veroia loading Fri 16:00-18:00 and its drop on the SAME Fri all day (00:00-23:59), or at
// [from, to] (an impossible 08:00-10:00, before the loading)
const allDay = (db, L, tag, drop = ['00:00', '23:59']) => scenario(db, async () => {
  const fri = `DATE '${L}' + 3`;
  await num(db, `SELECT t86_vs('${tag}', ${fri})`);
  const p1 = await num(db, `SELECT t86_piece('${tag}', 1)`);
  const hub = await num(db, `SELECT id FROM locations WHERE is_hub`);
  const R = await put(db, { pieces: [{ piece_id: p1 }],
    target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db), driver_id: await driver(db) }, side: 'KATHODOS' },
    stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(db, fri, '16:00'), planned_to: await at(db, fri, '18:00') },
      { ref: 'd', location_id: await num(db, `SELECT t86_dest(${p1})`), side: 'KATHODOS', planned_from: await at(db, fri, drop[0]), planned_to: await at(db, fri, drop[1]) }] });
  const rt = R.r ? Number(R.r.ids.rt_id) : null;
  const order = rt ? (await db.query(`SELECT s.location_id = (SELECT id FROM locations WHERE is_hub) AS hub, s.seq FROM rt_stops s
      WHERE s.rt_id = $1 AND s.deleted_at IS NULL ORDER BY s.seq`, [rt])).rows.map((x) => (x.hub ? 'veroia' : 'drop')) : [];
  return { err: R.err, order };
});

test('086 on the production-shaped copy (1/11): busy and all-day refused on the live texts, allowed with a trace after 086, integrity kept', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  await db.query(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') WHERE id = 'B-54'`);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(read('081_plan_stop_order_follows.sql'));
  const src = read('086_plan_busy_overlap_ok.sql');
  await t.test('086 before 084 is refused by its guard', async () => {
    assert.match(await errorOf(db, src) ?? '', /086: 084 is not applied/);
  });
  await db.exec(read('084_plan_move_busy_skip.sql'));
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const F = facts(src);
  const live = await md5s(db);
  const x0 = (await one(db, XDEF)).x;
  const trg0 = await num(db, TRG);
  const gen = SIGS.map((s) => F.gen.find((g) => g.sig === s).m);

  await t.test('the copy holds the LIVE texts and EXCLUDE 086 guards on (plan_h_busy = 084\'s)', async () => {
    assert.deepStrictEqual(live, SIGS.map((s) => F.live[s]));
    assert.strictEqual(x0, `rt_v2_driver_once=${F.xLive.driver},rt_v2_truck_once=${F.xLive.truck}`);
  });
  await t.test('NO-GO on the live texts: a busy truck is refused, accept_busy is an unknown key; an all-day drop on its loading day is refused (leg_order)', async () => {
    assert.match((await busy(db, L, 'N1')).err ?? '', /truck_busy/);
    assert.match((await busy(db, L, 'N2', { accept: true })).err ?? '', /bad_input/);
    const ad = await allDay(db, L, 'N3');
    assert.match((ad.err || ad.late) ?? '', /leg_order/, ad.err || ad.late);
  });
  await t.test('086 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('086_plan_busy_overlap_ok_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 086 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}086 ran: busy ${gen[0]}, reseq ${gen[4]}`), msg);
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual((await one(db, XDEF)).x, x0);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_ok' AND NOT attisdropped`), 0);
    assert.strictEqual(await num(db, TRG), trg0);
  });
  await t.test('086 applies: generated texts with their old rights, partial EXCLUDE, one trigger, B-54 follows, verify', async () => {
    const acl0 = (await db.query(`SELECT proacl::text AS a, prosecdef, provolatile FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), gen);
    assert.deepStrictEqual((await db.query(`SELECT proacl::text AS a, prosecdef, provolatile FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows, acl0);
    assert.strictEqual((await one(db, XDEF)).x, `rt_v2_driver_once=${F.xGen.driver},rt_v2_truck_once=${F.xGen.truck}`);
    assert.strictEqual(await num(db, TRG), trg0 + 1);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0 + 1);
    const v = await one(db, read('086_plan_busy_overlap_ok_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.changed_texts), Number(v.exclude_partial), Number(v.mark_trigger), Number(v.has_column)],
      ['086 in place', 0, 2, 1, 1]);
    // internal: no role may call the two new functions directly (only the owner, whom PGlite runs as)
    const acl = (await db.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('plan_h_accept_busy', 'plan_seg_overlap_ok')`)).rows;
    assert.strictEqual(acl.length, 2);
    for (const r of acl) assert.ok(r.a && !/(^|[{,])(=|anon=|authenticated=|service_role=)/.test(r.a), `${r.proname}: ${r.a}`);
  });
  await t.test('086 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /086: public\.plan_h_busy.* is not its live text of 1\/11/);
    assert.deepStrictEqual(await md5s(db), gen);
  });
  await t.test('still refused without accept_busy: the same truck_busy / driver_busy; a non-boolean is bad_input', async () => {
    assert.match((await busy(db, L, 'G0')).err ?? '', /truck_busy/);
    assert.match((await busy(db, L, 'G0d', { by: 'driver' })).err ?? '', /driver_busy/);
    assert.match((await busy(db, L, 'G0f', { accept: false })).err ?? '', /truck_busy/);
    assert.match((await busy(db, L, 'G0s', { accept: 'yes' })).err ?? '', /bad_input/);
  });
  await t.test('GO with accept_busy: B saved over A, COMMIT passes, only B marked, one audit row naming A, the person and the role', async () => {
    for (const by of ['truck', 'driver']) {
      const r = await busy(db, L, 'G1' + by[0], { accept: true, by });
      assert.strictEqual(r.err, null, r.err);
      assert.strictEqual(r.late, null, 'the partial EXCLUDE passes at COMMIT');
      assert.ok(r.marked >= 1, `B marked (${by})`);
      assert.strictEqual(r.markedA, 0, 'A is never marked by B\'s save');
      assert.strictEqual(r.audit.length, r.marked, 'one audit row per mark');
      assert.deepStrictEqual([r.audit[0].actor, r.audit[0].role, r.audit[0].action], ['test:086', 'dispatcher', 'update']);
      assert.deepStrictEqual(r.audit[0].after_data.overlaps, [{ rt_code: r.aCode, by }]);
    }
  });
  await t.test('plan_rt_update (truck change): refused without accept_busy, saved and marked with it', async () => {
    for (const accept of [undefined, true]) {
      const r = await scenario(db, async () => {
        const fri = `DATE '${L}' + 3`;
        await num(db, `SELECT t86_vs('U${accept ? 1 : 0}A', ${fri})`); await num(db, `SELECT t86_vs('U${accept ? 1 : 0}B', ${fri})`);
        const hub = await num(db, `SELECT id FROM locations WHERE is_hub`), tA = await truck(db), tC = await truck(db);
        const mk = async (ref, tk) => {
          const p = await num(db, `SELECT t86_piece('${ref}', 1)`);
          const x = await put(db, { pieces: [{ piece_id: p }], target: { new_rt: { trip_type: 'OWNED', truck_id: tk, driver_id: await driver(db) }, side: 'KATHODOS' },
            stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(db, fri, '06:00'), planned_to: await at(db, fri, '07:00') },
              { ref: 'd', location_id: await num(db, `SELECT t86_dest(${p})`), side: 'KATHODOS', planned_from: await at(db, `${fri} + 1`, '09:00'), planned_to: await at(db, `${fri} + 1`, '10:00') }] });
          if (x.err) throw new Error(x.err);
          return Number(x.r.ids.rt_id);
        };
        await mk(`U${accept ? 1 : 0}A`, tA);
        const c = await mk(`U${accept ? 1 : 0}B`, tC);
        await db.exec(`SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;`);
        const body = { rt_id: c, set: { truck_id: tA } };
        if (accept) body.accept_busy = true;
        await db.exec('SAVEPOINT u');
        let err = null;
        try { await db.query(`SELECT plan_rt_update($1::jsonb, 'test:086', 'dispatcher')`, [JSON.stringify(body)]); await db.exec('RELEASE SAVEPOINT u'); }
        catch (e) { err = String(e.message); await db.exec('ROLLBACK TO SAVEPOINT u'); }
        return { err, marked: await num(db, `SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = $1 AND overlap_ok AND truck_id = $2`, [c, tA]) };
      });
      if (accept) {
        assert.strictEqual(r.err, null, r.err);
        assert.strictEqual(r.late, null, r.late);
        assert.ok(r.marked >= 1, 'the changed trip\'s segment is marked');
      } else {
        assert.match(r.err ?? r.late ?? '', /truck_busy|rt_v2_truck_once/, r.err || r.late);
      }
    }
  });
  await t.test('GO: an all-day drop on its loading day is saved, AFTER the Veroia loading', async () => {
    const r = await allDay(db, L, 'G2');
    assert.strictEqual(r.err, null, r.err);
    assert.strictEqual(r.late, null, r.late);
    assert.deepStrictEqual(r.order, ['veroia', 'drop']);
  });
  await t.test('still refused: a drop that ENDS before its loading starts (08:00-10:00 vs 16:00) - stop_order, at COMMIT', async () => {
    const r = await allDay(db, L, 'R2', ['08:00', '10:00']);
    assert.match((r.err || r.late) ?? '', /stop_order/, r.err || r.late);
  });
  await t.test('rollback: STOPS with the list while an accepted overlap is in the base; dry run keeps nothing; then the texts and full EXCLUDE before 086 come back', async () => {
    await db.exec('BEGIN');
    let msg = null, codes = [];
    try {
      const fri = `DATE '${L}' + 3`;
      await num(db, `SELECT t86_vs('K1A', ${fri})`); await num(db, `SELECT t86_vs('K1B', ${fri} + 1)`);
      const hub = await num(db, `SELECT id FROM locations WHERE is_hub`), tk = await truck(db);
      const A = await put(db, { pieces: [{ piece_id: await num(db, `SELECT t86_piece('K1A', 1)`) }],
        target: { new_rt: { trip_type: 'OWNED', truck_id: tk, driver_id: await driver(db) }, side: 'KATHODOS' },
        stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(db, fri, '06:00'), planned_to: await at(db, fri, '07:00') },
          { ref: 'd', location_id: await num(db, `SELECT t86_dest(t86_piece('K1A', 1))`), side: 'KATHODOS', planned_from: await at(db, `${fri} + 1`, '12:00'), planned_to: await at(db, `${fri} + 1`, '14:00') }] });
      assert.strictEqual(A.err, null, A.err);
      await db.exec(`SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;`);
      const B = await put(db, { pieces: [{ piece_id: await num(db, `SELECT t86_piece('K1B', 1)`) }],
        target: { new_rt: { trip_type: 'OWNED', truck_id: tk, driver_id: await driver(db) }, side: 'KATHODOS', accept_busy: true },
        stops: [{ ref: 'p', location_id: hub, side: 'KATHODOS', planned_from: await at(db, `${fri} + 1`, '09:00'), planned_to: await at(db, `${fri} + 1`, '10:00') },
          { ref: 'd', location_id: await num(db, `SELECT t86_dest(t86_piece('K1B', 1))`), side: 'KATHODOS', planned_from: await at(db, `${fri} + 2`, '09:00'), planned_to: await at(db, `${fri} + 2`, '10:00') }] });
      assert.strictEqual(B.err, null, B.err);
      await db.exec(`SET CONSTRAINTS ALL IMMEDIATE`);
      codes = (await db.query(`SELECT code FROM ct_round_trips WHERE id = ANY($1::bigint[]) ORDER BY id`, [[A.r.ids.rt_id, B.r.ids.rt_id]])).rows.map((x) => x.code);
      msg = await errorOf(db, read('086_plan_busy_overlap_ok_rollback.sql'));
    } finally { await db.exec('ROLLBACK'); }
    assert.match(msg ?? '', /086 rollback: trips that overlap are in the base, the full EXCLUDE cannot be rebuilt/, msg);
    assert.ok(codes.length === 2 && codes.every((c) => msg.includes(c)), `both trips named: ${codes} in ${msg}`);
    assert.deepStrictEqual(await md5s(db), gen, 'the stopped rollback changed nothing');
    const dry = await errorOf(db, read('086_plan_busy_overlap_ok_rollback_dryrun.sql'));
    assert.match(dry ?? '', new RegExp(`DRY RUN 086 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: busy ${live[0]}, reseq ${live[4]}`), dry);
    assert.deepStrictEqual(await md5s(db), gen);
    await db.exec(read('086_plan_busy_overlap_ok_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual((await one(db, XDEF)).x, x0);
    assert.strictEqual(await num(db, TRG), trg0);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_ok' AND NOT attisdropped`), 0);
    assert.strictEqual((await one(db, read('086_plan_busy_overlap_ok_verify.sql'))).applied, '086 NOT APPLIED');
    assert.match((await busy(db, L, 'B1')).err ?? '', /truck_busy/);
    const ad = await allDay(db, L, 'B2');
    assert.match((ad.err || ad.late) ?? '', /leg_order/, ad.err || ad.late);
  });
});
