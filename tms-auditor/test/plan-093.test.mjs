// 093 (owner 2/11: "we relax the rules" - the hours rules refuse only an order no truck can drive; the ANODOS before the
// KATHODOS is a warning with a trace) on the production-shaped PGlite copy as production holds it on 2/11:
// prod-shaped-086.mjs + 087 + 089 (the six texts 093 guards on: plan_rt_problem and plan_h_reseq = 086's,
// plan_leg_problem and plan_h_put = 072's, plan_rt_update = 089's, plan_move_pieces = 087's). Each scenario runs inside a transaction that is always rolled back, with the
// deferred rules (071's plan_chk) fired before the rows are read: first on the LIVE texts (NO-GO), then after 093 (GO,
// and what must still be refused), then after the rollback (the live behaviour again). Every case reads ROWS (rt_stops,
// piece_legs, audit_log), never a message alone.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { prodShaped086 } from './prod-shaped-086.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, applyHunks, PATCHED } from '../../worker/migrations/drafts/tools/build-093.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5s = async (db) => Promise.all(PATCHED.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));
const NEW_FNS = `SELECT count(*) FROM pg_proc WHERE proname IN ('plan_h_before', 'plan_h_side_warn')`;

// test rows only: legacy ids rec93..., references T93-..., locations TEST 093 ..., plates TEST-093-...
// A VS with ONE Greek point of 10 pallets: Export = Greek loading -> Veroia (an ANODOS piece), Import = Veroia -> Greek
// delivery (a KATHODOS piece); t93_piece the national piece of that point.
const HELPERS = `
CREATE FUNCTION t93_vs(p_ref text, p_dir text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec93X' || p_ref, 'TEST 093 abroad ' || p_ref) returning id into lx;
  insert into locations (legacy_id, name) values ('rec93G' || p_ref, 'TEST 093 GR ' || p_ref) returning id into lg;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec93O' || p_ref, 'International', p_dir, 'Pending', true,
          case when p_dir = 'Export' then p_hub - 1 else p_hub - 3 end, case when p_dir = 'Export' then p_hub + 3 else p_hub + 1 end,
          p_hub, 'T93-' || p_ref, (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec93A' || p_ref, case when p_dir = 'Export' then 'Unloading' else 'Loading' end, 1,
          case when p_dir = 'Export' then p_hub + 3 else p_hub - 3 end, o, lx, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec93H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec93S' || p_ref, case when p_dir = 'Export' then 'Loading' else 'Unloading' end, 1,
          case when p_dir = 'Export' then p_hub - 1 else p_hub + 1 end, o, lg, 10);
  update orders set loading_pallets_1 = 10, unloading_pallets_1 = 10 where id = o;
  return o;
end $t$;
CREATE FUNCTION t93_piece(p_ref text) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
       where st.legacy_id = 'rec93S' || p_ref and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
CREATE FUNCTION t93_end(p_piece bigint, p_from boolean) RETURNS bigint LANGUAGE sql AS
  $t$ select case when p_from then vs.nat_from_location_id else vs.nat_to_location_id end
        from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece $t$;
CREATE SEQUENCE t93_seq;
CREATE FUNCTION t93_at(p_day date, p_hm text) RETURNS timestamptz LANGUAGE sql AS
  $t$ select (p_day + p_hm::time) at time zone 'Europe/Athens' $t$;`;

async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
// a refused call leaves the scenario's transaction usable (its rows are read after it), as PostgREST's own call would
async function call(db, fn, body) {
  await db.exec('SAVEPOINT c');
  try {
    const r = (await one(db, `SELECT ${fn}($1::jsonb, 'test:093', 'dispatcher') AS r`, [JSON.stringify(body)])).r;
    await db.exec('RELEASE SAVEPOINT c');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT c'); return { r: null, err: String(e.message) }; }
}
const commit = (db) => db.exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;');   // a save's own COMMIT rules
const truck = (db) => num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-093-' || nextval('t93_seq')) RETURNING id`);
const hubOf = (db) => num(db, `SELECT id FROM locations WHERE is_hub`);
const W = async (db, k, from, to, L) => {
  const r = await one(db, `SELECT t93_at(DATE '${L}' + $1::int, $2)::text AS f, t93_at(DATE '${L}' + $1::int, $3)::text AS t`, [k, from, to]);
  return [r.f, r.t];
};
// a window from day kf at hf to day kt at ht (a night window: 22:00 of one day to 06:00 of the next)
const W2 = async (db, kf, hf, kt, ht, L) => {
  const r = await one(db, `SELECT t93_at(DATE '${L}' + $1::int, $2)::text AS f, t93_at(DATE '${L}' + $3::int, $4)::text AS t`, [kf, hf, kt, ht]);
  return [r.f, r.t];
};
const stop = (ref, location_id, side, [planned_from, planned_to]) => ({ ref, location_id, side, planned_from, planned_to });
const sideTime = (ans) => ((ans && ans.warnings) || []).filter((w) => w && w.code === 'side_time');
const trace = (db, rt) => db.query(`SELECT actor, role, before_data, after_data FROM audit_log WHERE table_name = 'ct_round_trips'
  AND record_id = $1 AND after_data ? 'side_time' ORDER BY id`, [String(rt)]).then((x) => x.rows);
const sides = (db, rt) => db.query(`SELECT side, seq FROM rt_stops WHERE rt_id = $1 AND deleted_at IS NULL ORDER BY seq`, [rt]).then((x) => x.rows.map((s) => s.side));

// JOIN (the W50 test, section 2): a trip whose ANODOS runs at L+2 / L+3 (all day); a KATHODOS load joins the SAME trip at
// L+5 / L+6 (all day). The base numbers KATHODOS first, so the ANODOS ends before the KATHODOS starts.
const join = (db, L, tag) => scenario(db, async () => {
  await num(db, `SELECT t93_vs('${tag}E', 'Export', DATE '${L}' + 3)`);
  await num(db, `SELECT t93_vs('${tag}I', 'Import', DATE '${L}' + 5)`);
  const e = await num(db, `SELECT t93_piece('${tag}E')`), i = await num(db, `SELECT t93_piece('${tag}I')`);
  const hub = await hubOf(db);
  const A = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: e }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'ANODOS' },
    stops: [stop('p', await num(db, `SELECT t93_end(${e}, true)`), 'ANODOS', await W(db, 2, '00:00', '23:59', L)),
      stop('d', hub, 'ANODOS', await W(db, 3, '00:00', '23:59', L))] });
  if (A.err) throw new Error('trip A: ' + A.err);
  const rt = Number(A.r.ids.rt_id);
  await commit(db);
  const B = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: i }], target: { rt_id: rt, side: 'KATHODOS' },
    stops: [stop('p', hub, 'KATHODOS', await W(db, 5, '00:00', '23:59', L)),
      stop('d', await num(db, `SELECT t93_end(${i}, false)`), 'KATHODOS', await W(db, 6, '00:00', '23:59', L))] });
  const late0 = B.err ? null : await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
  return { err: B.err || late0, rt, ans: B.r, sides: await sides(db, rt), trace: await trace(db, rt),
    legs: await num(db, `SELECT count(*) FROM piece_legs WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]) };
});

// ALLAGI ORAS (the screen's date panel, PATCH /plan/rt/:id): a trip KATHODOS at L+2 (Veroia, then the client, all day)
// and ANODOS at L+3 / L+4; the KATHODOS shifted by +4 days now starts after the ANODOS ended. dry run, then the save,
// then a second save that keeps that order (no new trace), then the shift back (the trace says it ended).
const shift = (db, L, tag) => scenario(db, async () => {
  await num(db, `SELECT t93_vs('${tag}I', 'Import', DATE '${L}' + 2)`);
  await num(db, `SELECT t93_vs('${tag}E', 'Export', DATE '${L}' + 4)`);
  const i = await num(db, `SELECT t93_piece('${tag}I')`), e = await num(db, `SELECT t93_piece('${tag}E')`);
  const hub = await hubOf(db);
  const A = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: i }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'KATHODOS' },
    stops: [stop('p', hub, 'KATHODOS', await W(db, 2, '00:00', '23:59', L)),
      stop('d', await num(db, `SELECT t93_end(${i}, false)`), 'KATHODOS', await W(db, 2, '00:00', '23:59', L))] });
  if (A.err) throw new Error('trip A: ' + A.err);
  const rt = Number(A.r.ids.rt_id);
  const B = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: e }], target: { rt_id: rt, side: 'ANODOS' },
    stops: [stop('p', await num(db, `SELECT t93_end(${e}, true)`), 'ANODOS', await W(db, 3, '00:00', '23:59', L)),
      stop('d', hub, 'ANODOS', await W(db, 4, '00:00', '23:59', L))] });
  if (B.err) throw new Error('ANODOS: ' + B.err);
  await commit(db);
  const body = { rt_id: rt, shift: { side: 'KATHODOS', delta: '4 days' } };
  const dry = await call(db, 'plan_rt_update', { ...body, dry_run: true });
  const save = await call(db, 'plan_rt_update', body);
  const late1 = save.err ? null : await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED');
  const trace1 = await trace(db, rt);
  const days = (await db.query(`SELECT side, (planned_from AT TIME ZONE 'Europe/Athens')::date - DATE '${L}' AS k FROM rt_stops
    WHERE rt_id = $1 AND deleted_at IS NULL ORDER BY seq`, [rt])).rows.map((s) => s.side[0] + s.k);
  // a later save that keeps the same order (a truck change): its warning again, no second trace row
  const again = save.err ? null : await call(db, 'plan_rt_update', { rt_id: rt, set: { truck_id: await truck(db) } });
  const trace2 = await trace(db, rt);
  const back = save.err ? null : await call(db, 'plan_rt_update', { rt_id: rt, shift: { side: 'KATHODOS', delta: '-4 days' } });
  return { dry: dry.r, dryErr: dry.err, save: save.r, err: save.err || late1, rt, days, trace1, again: again && again.r, trace2,
    back: back && back.r, trace3: await trace(db, rt) };
});

// CHAIN: a national load X -> Y via Veroia. Leg 1 on trip A (ANODOS) X -> Veroia, arriving at L+2 16:00-18:00 (or arr:
// [kf, hf, kt, ht], a night arrival L+2 22:00 - L+3 06:00); leg 2 on trip B (KATHODOS) from Veroia at L+k, [from, to] (all
// day by default), to Y at L+4.
const chain = (db, L, tag, k = 2, win = ['00:00', '23:59'], arr = [2, '16:00', 2, '18:00']) => scenario(db, async () => {
  const hub = await hubOf(db);
  const x = await num(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec93C${tag}x', 'TEST 093 chain from ${tag}') RETURNING id`);
  const y = await num(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec93C${tag}y', 'TEST 093 chain to ${tag}') RETURNING id`);
  const cl = await num(db, `SELECT min(id) FROM clients`);
  const [lf, lt] = await W(db, 2, '00:00', '23:59', L), [df, dt] = await W(db, 4, '00:00', '23:59', L);
  const o = await call(db, 'plan_orders_create', { request_id: crypto.randomUUID(), orders: [{ client_id: cl, price: 100, reference: 'T93-' + tag,
    goods: 'TEST', pallet_exchange: false, direction: 'ANODOS', shipments: [{ origin_location_id: x, dest_location_id: y, pallets: 6,
      load_from: lf, load_to: lt, deliver_from: df, deliver_to: dt }] }] });
  if (o.err) throw new Error('order: ' + o.err);
  const piece = await num(db, `SELECT sp.id FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id
    WHERE s.origin_location_id = $1 AND sp.deleted_at IS NULL`, [x]);
  const A = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: piece, to_hub: true }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'ANODOS' },
    stops: [stop('p', x, 'ANODOS', await W(db, 2, '08:00', '10:00', L)), stop('d', hub, 'ANODOS', await W2(db, ...arr, L))] });
  if (A.err) throw new Error('leg 1: ' + A.err);
  await commit(db);
  const B = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: piece }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'KATHODOS' },
    stops: [stop('p', hub, 'KATHODOS', await W(db, k, win[0], win[1], L)), stop('d', y, 'KATHODOS', await W(db, 4, '00:00', '23:59', L))] });
  const late0 = B.err ? null : await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
  return { err: B.err || late0, legs: await num(db, `SELECT count(*) FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL`, [piece]) };
});

// MOVE (plan_move_pieces, the board's «Μεταφορά σε…»): a KATHODOS load on trip K (L+5 / L+6, all day) moved to the KATHODOS
// of trip A, whose ANODOS ran at L+2 / L+3: the answer carries side_time once, read after the move's own sweep
const move = (db, L, tag) => scenario(db, async () => {
  await num(db, `SELECT t93_vs('${tag}E', 'Export', DATE '${L}' + 3)`);
  await num(db, `SELECT t93_vs('${tag}I', 'Import', DATE '${L}' + 5)`);
  const e = await num(db, `SELECT t93_piece('${tag}E')`), i = await num(db, `SELECT t93_piece('${tag}I')`);
  const hub = await hubOf(db), cli = await num(db, `SELECT t93_end(${i}, false)`);
  const A = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: e }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'ANODOS' },
    stops: [stop('p', await num(db, `SELECT t93_end(${e}, true)`), 'ANODOS', await W(db, 2, '00:00', '23:59', L)), stop('d', hub, 'ANODOS', await W(db, 3, '00:00', '23:59', L))] });
  const K = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: i }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'KATHODOS' },
    stops: [stop('p', hub, 'KATHODOS', await W(db, 5, '00:00', '23:59', L)), stop('d', cli, 'KATHODOS', await W(db, 6, '00:00', '23:59', L))] });
  if (A.err || K.err) throw new Error('trips: ' + (A.err || K.err));
  await commit(db);
  const a = Number(A.r.ids.rt_id), k = Number(K.r.ids.rt_id);
  const body = { from: { rt_id: k, piece_ids: [i] }, target: { rt_id: a, side: 'KATHODOS' },
    stops: [stop('p', hub, 'KATHODOS', await W(db, 5, '00:00', '23:59', L)), stop('d', cli, 'KATHODOS', await W(db, 6, '00:00', '23:59', L))] };
  const dry = await call(db, 'plan_move_pieces', { ...body, dry_run: true });
  const M = await call(db, 'plan_move_pieces', dry.r && dry.r.confirm_token ? { ...body, confirm_token: dry.r.confirm_token } : body);
  const late0 = M.err ? null : await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
  return { err: M.err || late0, ans: M.r, trace: await trace(db, a), legsA: await num(db, `SELECT count(*) FROM piece_legs WHERE rt_id = $1 AND deleted_at IS NULL`, [a]) };
});

// NIGHT (group 5 of 2/11: the order form sends a night window): one import piece, its Veroia loading L+2 22:00 - L+3
// 06:00, its delivery all day on L+2 (the evening's day) or L+3 (the morning's): never a refusal
const night = (db, L, tag, kd) => scenario(db, async () => {
  await num(db, `SELECT t93_vs('${tag}', 'Import', DATE '${L}' + 2)`);
  const i = await num(db, `SELECT t93_piece('${tag}')`);
  const R = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: i }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'KATHODOS' },
    stops: [stop('p', await hubOf(db), 'KATHODOS', await W2(db, 2, '22:00', 3, '06:00', L)),
      stop('d', await num(db, `SELECT t93_end(${i}, false)`), 'KATHODOS', await W(db, kd, '00:00', '23:59', L))] });
  const late0 = R.err ? null : await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
  return { err: R.err || late0, sides: R.r ? await sides(db, Number(R.r.ids.rt_id)) : [] };
});

// INTEGRITY: one import piece, its Veroia loading at L+3 16:00-18:00 and its drop at L+2 all day - delivered the day
// BEFORE it is loaded (same side): refused before and after 093
const dropBefore = (db, L, tag) => scenario(db, async () => {
  await num(db, `SELECT t93_vs('${tag}', 'Import', DATE '${L}' + 3)`);
  const i = await num(db, `SELECT t93_piece('${tag}')`);
  const R = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: i }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'KATHODOS' },
    stops: [stop('p', await hubOf(db), 'KATHODOS', await W(db, 3, '16:00', '18:00', L)),
      stop('d', await num(db, `SELECT t93_end(${i}, false)`), 'KATHODOS', await W(db, 2, '00:00', '23:59', L))] });
  return { err: R.err };
});

test('093 on the production-shaped copy (2/11): the hours refusals on the live texts, a warning with a trace after 093, integrity kept, rollback', async (t) => {
  const db = await prodShaped086();
  for (const f of ['087_plan_board_reads_hub_mark.sql', '089_plan_partner_rate_anodos.sql']) await db.exec(read(f));
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('093_plan_hours_relaxed.sql');
  const F = facts(src);
  const live = await md5s(db);
  const gen = F.gen.map((g) => g.m);

  await t.test('the copy holds the LIVE texts 093 guards on, and the hunks give PART 2', async () => {
    assert.deepStrictEqual(live, PATCHED.map((s) => F.live[s]));
    for (const g of F.gen) {
      const txt = (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = '${g.sig}'::regprocedure`)).prosrc;
      assert.strictEqual((await one(db, `SELECT md5($1) AS m`, [applyHunks(txt, g, F.consts)])).m, g.m, g.sig);
    }
  });
  await t.test('NO-GO on the live texts: the join is refused (stop_order), the date panel shows a conflict, the all-day loading after a 16:00 arrival is refused (chain_time)', async () => {
    const j = await join(db, L, 'N1');
    assert.match(j.err ?? '', /stop_order/);
    assert.strictEqual(j.legs, 1, 'only the ANODOS load is on the trip');
    const s = await shift(db, L, 'N2');
    assert.strictEqual(s.dryErr, null, s.dryErr);
    assert.strictEqual(s.dry.preview.conflict.code, 'stop_order');
    assert.match(s.err ?? '', /stop_order/);
    const c = await chain(db, L, 'N3');
    assert.match(c.err ?? '', /chain_time/);
    assert.strictEqual(c.legs, 1);
    assert.match((await move(db, L, 'N4')).err ?? '', /stop_order/);
    // a night arrival L+2 22:00 - L+3 06:00 and an all-day loading on L+2: refused today (00:00 < 22:00)
    assert.match((await chain(db, L, 'N5', 2, ['00:00', '23:59'], [2, '22:00', 3, '06:00'])).err ?? '', /chain_time/);
  });
  await t.test('093 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('093_plan_hours_relaxed_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 093 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}093 ran: rt_problem ${gen[0]}, leg_problem ${gen[1]}, reseq ${gen[2]}, rt_update ${gen[3]}, put ${gen[4]}, move ${gen[5]}`), msg);
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual(await num(db, NEW_FNS), 0);
  });
  await t.test('093 applies: generated texts with their old rights, two internal functions, the NOTICE counts, verify', async () => {
    const acl0 = (await db.query(`SELECT proacl::text AS a, prosecdef, provolatile FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [PATCHED])).rows;
    const notices = [];
    await db.exec(src, { onNotice: (n) => notices.push(n.message) });
    assert.deepStrictEqual(await md5s(db), gen);
    assert.deepStrictEqual((await db.query(`SELECT proacl::text AS a, prosecdef, provolatile FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [PATCHED])).rows, acl0);
    assert.ok(notices.some((n) => /^093 OK: .* \| refused by the live rules: 0 trips, 0 legs; by 093: 0 trips, 0 legs \| side_time now: 0 trips$/.test(n)), notices.join('\n'));
    const acl = (await db.query(`SELECT proname, proacl::text AS a FROM pg_proc WHERE proname IN ('plan_h_before', 'plan_h_side_warn')`)).rows;
    assert.strictEqual(acl.length, 2);
    for (const r of acl) assert.ok(r.a && !/(^|[{,])(=|anon=|authenticated=|service_role=)/.test(r.a), `${r.proname}: ${r.a}`);
    const v = await one(db, read('093_plan_hours_relaxed_verify.sql'));
    assert.deepStrictEqual([v.applied, Number(v.changed_texts), Number(v.new_functions), Number(v.refused_trips), Number(v.refused_legs), Number(v.side_time_traces)],
      ['093 in place', 0, 2, 0, 0, 0]);
  });
  await t.test('093 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /093: public\.plan_rt_problem\(bigint\) is not its live text of 2\/11/);
    assert.deepStrictEqual(await md5s(db), gen);
  });
  await t.test('GO, the join: saved, KATHODOS numbered first, COMMIT passes, ONE trace row with both stops, the person and the role', async () => {
    const j = await join(db, L, 'G1');
    assert.strictEqual(j.err, null, j.err);
    assert.strictEqual(j.late, null);
    assert.strictEqual(j.legs, 2);
    assert.deepStrictEqual(j.sides, ['KATHODOS', 'KATHODOS', 'ANODOS', 'ANODOS']);
    assert.strictEqual(j.trace.length, 1);
    const [tr] = j.trace;
    assert.deepStrictEqual([tr.actor, tr.role, tr.before_data], ['test:093', 'dispatcher', { side_time: null }]);
    assert.ok(tr.after_data.side_time.kathodos.stop_id && tr.after_data.side_time.anodos.stop_id, JSON.stringify(tr.after_data));
    assert.ok(!('location' in tr.after_data.side_time.kathodos), 'no place name in the trace');
    assert.strictEqual(sideTime(j.ans).length, 1, 'the join\'s answer says it (plan_h_put): ' + JSON.stringify(j.ans && j.ans.warnings));
  });
  await t.test('GO, the move: saved onto the trip whose ANODOS ran first, its answer says side_time ONCE, one trace row', async () => {
    const m = await move(db, L, 'G5');
    assert.strictEqual(m.err, null, m.err);
    assert.strictEqual(m.late, null);
    assert.strictEqual(m.legsA, 2);
    assert.strictEqual(sideTime(m.ans).length, 1, JSON.stringify(m.ans && m.ans.warnings));
    assert.strictEqual(m.trace.length, 1);
  });
  await t.test('GO, the night window: a Veroia loading 22:00 - 06:00 next to an all-day delivery of its evening or its morning is saved, never refused', async () => {
    for (const kd of [2, 3]) {
      const n = await night(db, L, 'G6' + kd, kd);
      assert.strictEqual(n.err, null, `delivery on L+${kd}: ${n.err}`);
      assert.strictEqual(n.late, null);
      assert.deepStrictEqual(n.sides, ['KATHODOS', 'KATHODOS']);
    }
    // a night arrival at Veroia and the all-day loading of its evening or its morning
    for (const k of [2, 3]) {
      const c = await chain(db, L, 'G7' + k, k, ['00:00', '23:59'], [2, '22:00', 3, '06:00']);
      assert.strictEqual(c.err, null, `loading on L+${k}: ${c.err}`);
      assert.strictEqual(c.legs, 2);
    }
  });
  await t.test('GO, the date panel: the dry run has no conflict and says side_time; the save keeps it and says it; one trace; a later save says it again without a second trace; the shift back ends it', async () => {
    const s = await shift(db, L, 'G2');
    assert.strictEqual(s.dryErr, null, s.dryErr);
    assert.strictEqual(s.dry.preview.conflict, null, JSON.stringify(s.dry.preview.conflict));
    const w = s.dry.preview.warnings.filter((x) => x.code === 'side_time');
    assert.strictEqual(w.length, 1, JSON.stringify(s.dry.preview.warnings));
    assert.ok(w[0].kathodos.location && w[0].anodos.location, 'both places named for the screen');
    assert.strictEqual(w[0].anodos.day, (await one(db, `SELECT (DATE '${L}' + 3)::text AS d`)).d, 'the Athens day the ANODOS ends');
    assert.strictEqual(w[0].pairs, 4, 'two KATHODOS stops after two ANODOS stops');
    assert.strictEqual(s.err, null, s.err);
    assert.strictEqual(s.late, null);
    assert.deepStrictEqual(s.days, ['K6', 'K6', 'A3', 'A4']);
    assert.ok(s.save.warnings.some((x) => x.code === 'side_time'));
    assert.strictEqual(s.trace1.length, 1, 'the dry run left no row, the save one');
    assert.ok(s.again.warnings.some((x) => x.code === 'side_time'), 'still said');
    assert.strictEqual(s.trace2.length, 1, 'same order: no second row');
    assert.ok(!s.back.warnings.some((x) => x.code === 'side_time'));
    assert.strictEqual(s.trace3.length, 2);
    assert.deepStrictEqual(s.trace3[1].after_data, { side_time: null }, 'the order ended: said in the history');
  });
  await t.test('GO, the chain: an all-day Veroia loading on the day of a 16:00 arrival there is saved; so is one overlapping it by the hour', async () => {
    const c = await chain(db, L, 'G3');
    assert.strictEqual(c.err, null, c.err);
    assert.strictEqual(c.late, null);
    assert.strictEqual(c.legs, 2);
    const h = await chain(db, L, 'G4', 2, ['17:00', '19:00']);
    assert.strictEqual(h.err, null, h.err);
  });
  await t.test('STILL REFUSED: a loading that ends before the arrival starts (the day before, all day; the same day by the hour); a delivery the day before its own loading', async () => {
    assert.match((await chain(db, L, 'R1', 1)).err ?? '', /chain_time/);
    assert.match((await chain(db, L, 'R2', 2, ['13:00', '15:00'])).err ?? '', /chain_time/);
    assert.match((await dropBefore(db, L, 'R3')).err ?? '', /stop_order|leg_order/);
  });
  await t.test('rollback: it STOPS while a trip holds an order only 093 allowed, and names it; nothing changes', async () => {
    await db.exec('BEGIN');
    try {
      await num(db, `SELECT t93_vs('RBE', 'Export', DATE '${L}' + 3)`);
      await num(db, `SELECT t93_vs('RBI', 'Import', DATE '${L}' + 5)`);
      const e = await num(db, `SELECT t93_piece('RBE')`), i = await num(db, `SELECT t93_piece('RBI')`);
      const hub = await hubOf(db);
      const A = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: e }], target: { new_rt: { trip_type: 'OWNED', truck_id: await truck(db) }, side: 'ANODOS' },
        stops: [stop('p', await num(db, `SELECT t93_end(${e}, true)`), 'ANODOS', await W(db, 2, '00:00', '23:59', L)), stop('d', hub, 'ANODOS', await W(db, 3, '00:00', '23:59', L))] });
      const B = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: i }], target: { rt_id: A.r.ids.rt_id, side: 'KATHODOS' },
        stops: [stop('p', hub, 'KATHODOS', await W(db, 5, '00:00', '23:59', L)), stop('d', await num(db, `SELECT t93_end(${i}, false)`), 'KATHODOS', await W(db, 6, '00:00', '23:59', L))] });
      assert.strictEqual(B.err, null, B.err);
      await commit(db);
      const code = (await one(db, `SELECT code FROM ct_round_trips WHERE id = $1`, [A.r.ids.rt_id])).code;
      await db.exec('SAVEPOINT rb');
      const msg = await errorOf(db, read('093_plan_hours_relaxed_rollback.sql'));
      await db.exec('ROLLBACK TO SAVEPOINT rb');
      assert.match(msg ?? '', new RegExp(`093 rollback: the restored rules refuse live rows that 093 allowed - trips: ${code} stop_order:`), msg);
      assert.deepStrictEqual(await md5s(db), gen);
    } finally { await db.exec('ROLLBACK'); }
  });
  await t.test('rollback dry run keeps nothing; the rollback restores the live texts byte for byte and drops the two functions; the live behaviour is back', async () => {
    const dry = await errorOf(db, read('093_plan_hours_relaxed_rollback_dryrun.sql'));
    assert.match(dry ?? '', new RegExp(`DRY RUN 093 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: rt_problem ${live[0]}, leg_problem ${live[1]}, reseq ${live[2]}, rt_update ${live[3]}, put ${live[4]}, move ${live[5]}`), dry);
    assert.deepStrictEqual(await md5s(db), gen);
    const notices = [];
    await db.query(read('093_plan_hours_relaxed_rollback.sql'), [], { onNotice: (n) => notices.push(n.message) });
    assert.ok(notices.includes('093 ROLLBACK OK'), notices.join('\n'));
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual(await num(db, NEW_FNS), 0);
    assert.strictEqual((await one(db, read('093_plan_hours_relaxed_verify.sql'))).applied, '093 NOT APPLIED');
    assert.match((await join(db, L, 'B1')).err ?? '', /stop_order/);
    assert.match((await chain(db, L, 'B2')).err ?? '', /chain_time/);
  });
});
