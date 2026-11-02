// 098 (the transfer stop and its rules; transfer at any point, piece 2a, design 2/11) on the production-shaped PGlite
// copy as production holds it on 2/11 (prod-shaped-093.mjs + 095 + 096 + 097). No operation writes a transfer yet (099),
// so every transfer here is written raw, inside a transaction that is always rolled back, and the deferred rules are
// fired before the ROLLBACK (SET CONSTRAINTS ALL IMMEDIATE): their refusal, or none, is the verdict. Every case reads
// the rule's code - the base, never a screen.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { TRG } from './prod-shaped-072.mjs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, applyHunks, PATCHED } from '../../worker/migrations/drafts/tools/build-098.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5s = (db) => Promise.all(PATCHED.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));
const P = '098_plan_transfer_point';

// test rows only: TEST 098 ... names, T98- references
const HELPERS = `
CREATE SEQUENCE t98_n;
-- a VS order through Veroia (export: Greek loading -> Veroia; import: Veroia -> Greek stop) or a national order
-- (Greek A -> Greek B); returns its piece
CREATE FUNCTION t98_piece(p_kind text, p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; n bigint; sh bigint; hub bigint; lx bigint; lg bigint; lb bigint; k text := 'r98' || nextval('t98_n');
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values (k || 'X', 'TEST 098 abroad') returning id into lx;
  insert into locations (legacy_id, name) values (k || 'G', 'TEST 098 GR') returning id into lg;
  if p_kind = 'national' then
    insert into locations (legacy_id, name) values (k || 'B', 'TEST 098 GR B') returning id into lb;
    insert into national_orders (legacy_id, client_id, reference, price, pallets)
    values (k || 'N', (select min(id) from clients), 'T98-' || k, 100, 10) returning id into n;
    insert into shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                           deliver_to, created_by)
    values (n, lg, lb, 10, (p_day + time '08:00') at time zone 'Europe/Athens', (p_day + time '09:00') at time zone 'Europe/Athens',
            (p_day + 1 + time '14:00') at time zone 'Europe/Athens', (p_day + 1 + time '15:00') at time zone 'Europe/Athens', 'test:098')
    returning id into sh;
    insert into shipment_pieces (shipment_id, pallets, created_by) values (sh, 10, 'test:098');
    return (select id from shipment_pieces where shipment_id = sh);
  end if;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values (k || 'O', 'International', p_kind, 'Pending', true, p_day - 3, p_day + 3, p_day + 3, 'T98-' || k,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'A', 'Loading', 1, p_day - 3, o, case when p_kind = 'Import' then lx else lg end, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'H', 'Cross-dock', 1, p_day + 3, o, hub, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values (k || 'S', 'Unloading', 1, p_day + 3, o, case when p_kind = 'Import' then lg else lx end, 10);
  return (select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id
           where s.order_id = o and s.order_stop_id is not null and s.deleted_at is null and sp.deleted_at is null
             and sp.parent_piece_id is null);
end $t$;
CREATE FUNCTION t98_rt(p_day date) RETURNS bigint LANGUAGE sql AS $t$
  insert into ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
  values (2, 'NATL', 'OWNED', p_day, p_day, (p_day + time '06:00') at time zone 'Europe/Athens',
          (p_day + time '20:00') at time zone 'Europe/Athens', 'planned', 'planner', 'test:098') returning id $t$;
CREATE FUNCTION t98_stop(p_rt bigint, p_seq int, p_loc bigint, p_day date, p_hour int) RETURNS bigint LANGUAGE sql AS $t$
  insert into rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
  values (p_rt, p_seq, p_loc, 'ANODOS', (p_day + make_time(p_hour, 0, 0)) at time zone 'Europe/Athens',
          (p_day + make_time(p_hour + 1, 0, 0)) at time zone 'Europe/Athens', 'test:098') returning id $t$;
CREATE FUNCTION t98_leg(p_piece bigint, p_no int, p_rt bigint, p_pk bigint, p_dr bigint) RETURNS bigint LANGUAGE sql AS $t$
  insert into piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
  values (p_piece, p_no, p_rt, p_pk, p_dr, 'test:098') returning id $t$;
-- A transfer at Larisa: truck A takes the piece from its national start to Larisa (stop a2) on p_day; truck B loads it
-- there (stop b1) on p_day + 1 and takes it to its national end. p_reason / p_waits on a2, p_link: b1 names a2, p_b: B
-- exists. Without reason, waits and link it writes no transfer column (it runs before 098 too).
CREATE FUNCTION t98_transfer(p_piece bigint, p_day date, p_reason text, p_link boolean, p_b boolean, p_waits boolean)
  RETURNS jsonb LANGUAGE plpgsql AS $t$
declare v record; la bigint; ra bigint; rb bigint; a1 bigint; a2 bigint; b1 bigint; b2 bigint;
begin
  set constraints all deferred;
  select vs.nat_from_location_id f, vs.nat_to_location_id t into v
    from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece;
  insert into locations (legacy_id, name) values ('r98L' || nextval('t98_n'), 'TEST 098 Larisa') returning id into la;
  ra := t98_rt(p_day); a1 := t98_stop(ra, 1, v.f, p_day, 8); a2 := t98_stop(ra, 2, la, p_day, 13);
  if p_reason is not null or p_waits then
    update rt_stops set transfer_reason = p_reason, transfer_waits = p_waits where id = a2;
  end if;
  perform t98_leg(p_piece, 1, ra, a1, a2);
  if p_b then
    rb := t98_rt(p_day + 1); b1 := t98_stop(rb, 1, la, p_day + 1, 8); b2 := t98_stop(rb, 2, v.t, p_day + 1, 13);
    if p_link then update rt_stops set transfer_from_stop_id = a2 where id = b1; end if;
    perform t98_leg(p_piece, 2, rb, b1, b2);
  end if;
  return jsonb_build_object('piece', p_piece, 'rt_a', ra, 'rt_b', rb, 'a2', a2, 'b1', b1, 'larisa', la,
    'order_id', (select s.order_id from shipment_pieces sp join shipments s on s.id = sp.shipment_id where sp.id = p_piece));
end $t$;`;

// A scenario inside a transaction that is always rolled back; the deferred rules fire after the steps (late)
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try {
    const out = await steps();
    const late = await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE');
    return { ...out, late };
  } finally { await db.exec('ROLLBACK'); }
}
const tr = (db, kind, reason, link, b, waits) => one(db,
  `SELECT t98_transfer(t98_piece($1, DATE '2026-12-08'), DATE '2026-12-07', $2, $3, $4, $5) AS x`, [kind, reason, link, b, waits]).then((r) => r.x);
const split2 = (piece) => `SELECT plan_split_piece(jsonb_build_object('piece_id', ${piece}, 'request_id', gen_random_uuid()::text,
  'parts', jsonb_build_array(jsonb_build_object('pallets', 6), jsonb_build_object('pallets', 4))), 'test:098', 'dispatcher')`;

test('098 on the production-shaped copy (after 093, 095, 096, 097)', async (t) => {
  const db = await prodShaped093();
  for (const f of ['095_plan_small_relaxed.sql', '096_plan_handover_accept_busy.sql', '097_plan_vs_state_hub_only.sql']) {
    await db.exec(read(f));
  }
  await db.exec(HELPERS);
  const src = read(`${P}.sql`);
  const f = facts(src);
  const trg0 = (await one(db, TRG)).n;
  const acl = `SELECT proacl::text a FROM pg_proc WHERE oid = ANY(ARRAY[${PATCHED.map((s) => `'${s}'::regprocedure`).join(',')}]) ORDER BY oid`;

  await t.test('the copy holds the live texts 098 guards on; the hunks give PART 2', async () => {
    assert.deepStrictEqual(await md5s(db), PATCHED.map((s) => f.live[s]));
    assert.strictEqual((await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = 'public.plan_chk()'::regprocedure`)).m,
      f.live['public.plan_chk()']);
    for (const g of f.gen) {
      const live = (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = '${g.sig}'::regprocedure`)).prosrc;
      assert.strictEqual(crypto.createHash('md5').update(applyHunks(live, g, f.consts)).digest('hex'), g.m, g.sig);
    }
  });

  await t.test('NO-GO on the live texts: a load met by another truck at Larisa is refused (leg_place)', async () => {
    const r = await scenario(db, () => tr(db, 'national', null, false, true, false));
    assert.match(r.late ?? '', /leg_place/);
  });

  await t.test('098 dry run keeps nothing and names the five texts it ends on', async () => {
    const msg = await errorOf(db, read(`${P}_dryrun.sql`));
    assert.match(msg ?? '', /DRY RUN 098 finished - EVERYTHING UNDONE/);
    assert.ok(msg.includes(`098 ran: leg ${f.gen[0].m}, shipment ${f.gen[1].m}, split ${f.gen[2].m}, rt_update ${f.gen[3].m}, carriers ${f.gen[4].m}, transfer columns 4`), msg);
    assert.deepStrictEqual(await md5s(db), PATCHED.map((s) => f.live[s]));
  });

  await t.test('098 runs: the five texts, four columns, rights kept, triggers unchanged; verify', async () => {
    const acl0 = (await db.query(acl)).rows;
    assert.strictEqual(await errorOf(db, src), null);
    assert.deepStrictEqual(await md5s(db), f.gen.map((g) => g.m));
    assert.deepStrictEqual((await db.query(acl)).rows, acl0);
    assert.strictEqual((await one(db, TRG)).n, trg0);
    const v = await one(db, read(`${P}_verify.sql`));
    const num = (x) => (typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x);
    assert.deepStrictEqual(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, num(x)])),
      { applied: '098 in place', changed_texts: 0, transfer_columns: 4, transfer_stops: 0, linked_stops: 0, waiting_at_point: 0,
        shipments_refused: 0, b54_matches: true });
    assert.match(await errorOf(db, src) ?? '', /098: public\.plan_leg_problem\(bigint\) is not the text 098 builds on/);
  });

  await t.test('GO: a transfer at Larisa with a reason, B\'s loading naming A\'s stop - national, VS export, VS import', async () => {
    for (const kind of ['national', 'Export', 'Import']) {
      const r = await scenario(db, () => tr(db, kind, 'meeting', true, true, false));
      assert.strictEqual(r.late, null, kind);
    }
  });

  await t.test('still refused: no reason on A\'s stop, B not naming it (leg_place); a reason off the list, a note without one (CHECK)', async () => {
    assert.match((await scenario(db, () => tr(db, 'national', null, true, true, false))).late ?? '', /leg_place/);
    assert.match((await scenario(db, () => tr(db, 'national', 'meeting', false, true, false))).late ?? '', /leg_place/);
    const bad = await scenario(db, async () => ({ err: await errorOf(db,
      `SELECT t98_transfer(t98_piece('national', DATE '2026-12-08'), DATE '2026-12-07', 'coffee', true, true, false)`) }));
    assert.match(bad.err ?? '', /rt_stops_transfer_reason/);
    const note = await scenario(db, async () => ({ err: await errorOf(db,
      `INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by, transfer_note)
       SELECT t98_rt(DATE '2026-12-07'), 1, (SELECT id FROM locations WHERE is_hub), 'ANODOS', now(), now() + interval '1 hour', 'test:098', 'note'`) }));
    assert.match(note.err ?? '', /rt_stops_transfer_note/);
  });

  await t.test('transfer_chain: B names ANOTHER transfer stop at the same place (two free-text points never join)', async () => {
    const r = await scenario(db, async () => {
      const x = await tr(db, 'national', 'meeting', true, true, false);
      const y = await tr(db, 'national', 'other', true, true, false);
      // both points on one place (as two free-text points will be), and x's B names y's stop
      await db.query(`UPDATE rt_stops SET location_id = $1 WHERE id IN ($2, $3)`, [y.larisa, x.a2, x.b1]);
      await db.query(`UPDATE rt_stops SET transfer_from_stop_id = $1 WHERE id = $2`, [y.a2, x.b1]);
      return {};
    });
    assert.match(r.late ?? '', /transfer_chain/);
  });

  await t.test('transfer_left: unloaded at the point with no next truck - refused, unless the stop says "waits there"', async () => {
    assert.match((await scenario(db, () => tr(db, 'national', 'vehicle_breakdown', false, false, false))).late ?? '', /transfer_left/);
    assert.strictEqual((await scenario(db, () => tr(db, 'national', 'vehicle_breakdown', false, false, true))).late, null);
  });

  await t.test('split within a transfer: one part to B, one stays on A (A\'s stop names itself) - GO; without a reason - refused', async () => {
    const parts = async (x) => {
      const p = await one(db, `SELECT shipment_id FROM shipment_pieces WHERE id = $1`, [x.piece]);
      const ins = `INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES ($1, $2, $3, 'test:098') RETURNING id`;
      return { sh: p.shipment_id, c1: (await one(db, ins, [p.shipment_id, x.piece, 6])).id, c2: (await one(db, ins, [p.shipment_id, x.piece, 4])).id };
    };
    const go = await scenario(db, async () => {
      const x = await tr(db, 'national', 'meeting', false, false, false);
      const c = await parts(x);
      const to = (await one(db, `SELECT vs.nat_to_location_id t FROM v_shipments vs WHERE vs.shipment_id = $1`, [c.sh])).t;
      // part 1 on truck B from Larisa (b1 names a2)
      const rb = (await one(db, `SELECT t98_rt(DATE '2026-12-08') AS r`)).r;
      const b1 = (await one(db, `SELECT t98_stop($1, 1, $2, DATE '2026-12-08', 8) AS s`, [rb, x.larisa])).s;
      const b2 = (await one(db, `SELECT t98_stop($1, 2, $2, DATE '2026-12-08', 13) AS s`, [rb, to])).s;
      await db.query(`UPDATE rt_stops SET transfer_from_stop_id = $1 WHERE id = $2`, [x.a2, b1]);
      await db.query(`SELECT t98_leg($1, 1, $2, $3, $4)`, [c.c1, rb, b1, b2]);
      // part 2 stays on A: it loads at A's own stop a2 (which names itself) and goes on to the end
      const a3 = (await one(db, `SELECT t98_stop($1, 3, $2, DATE '2026-12-07', 17) AS s`, [x.rt_a, to])).s;
      await db.query(`UPDATE rt_stops SET transfer_from_stop_id = id WHERE id = $1`, [x.a2]);
      await db.query(`SELECT t98_leg($1, 1, $2, $3, $4)`, [c.c2, x.rt_a, x.a2, a3]);
      return {};
    });
    assert.strictEqual(go.late, null);
    const no = await scenario(db, async () => {
      const x = await tr(db, 'national', null, false, false, false);
      await parts(x);
      return {};
    });
    assert.match(no.late ?? '', /split_not_at_hub|leg_place/);
  });

  await t.test('plan_split_piece: at a transfer stop that says "waits there" - split, kept; at the national start - not_at_hub', async () => {
    const r = await scenario(db, async () => {
      const x = await tr(db, 'national', 'vehicle_breakdown', false, false, true);
      return { err: await errorOf(db, split2(x.piece)) };
    });
    assert.strictEqual(r.err, null);
    assert.strictEqual(r.late, null);
    const home = await scenario(db, async () => {
      const pc = (await one(db, `SELECT t98_piece('national', DATE '2026-12-08') AS p`)).p;
      return { err: await errorOf(db, split2(pc)) };
    });
    assert.match(home.err ?? '', /not_at_hub/);
  });

  await t.test('a VS export met at Larisa: its Veroia day is B\'s; the "follows" lists B (with the day), then A; a change of A moves no day', async () => {
    const r = await scenario(db, async () => {
      const x = await tr(db, 'Export', 'meeting', true, true, false);
      const st = await one(db, `SELECT first_hub_day::text d FROM v_vs_state WHERE order_id = $1`, [x.order_id]);
      const ans = (await one(db, `SELECT plan_vs_state(ARRAY[$1::bigint]) a`, [x.order_id])).a[String(x.order_id)];
      const pre = await errorOf(db, `SELECT plan_rt_update(jsonb_build_object('rt_id', ${x.rt_a}::bigint, 'dry_run', true,
        'shift', jsonb_build_object('side', 'ANODOS', 'delta', '1 hour')), 'test:098', 'dispatcher')`);
      return { st, ans, pre, x };
    });
    assert.strictEqual(r.late, null);
    assert.strictEqual(r.st.d, '2026-12-08');
    assert.deepStrictEqual(r.ans.carriers.map((c) => c.hub_day ?? null), ['2026-12-08', null]);
    assert.strictEqual(r.pre, null, 'plan_rt_update runs on 098\'s text');
  });

  await t.test('plan_h_vs_carriers: a cycle with and without a Veroia day is listed once (with its day)', async () => {
    const out = (await one(db, `SELECT plan_h_vs_carriers(0, '[{"rt_id":5,"hub_day":"2026-12-07"},{"rt_id":5,"hub_day":null},{"rt_id":6,"hub_day":null}]'::jsonb) a`)).a;
    assert.deepStrictEqual(out.map((c) => [c.rt_id, c.hub_day]), [[5, '2026-12-07'], [6, null]]);
  });

  await t.test('rollback: refused while a stop holds a transfer value; its dry run keeps nothing; then the live texts back, no column', async () => {
    const r = await scenario(db, async () => {
      await tr(db, 'national', 'meeting', true, true, false);
      return { err: await errorOf(db, read(`${P}_rollback.sql`)) };
    });
    assert.match(r.err ?? '', /098 rollback: a stop holds a transfer value/);
    const dry = await errorOf(db, read(`${P}_rollback_dryrun.sql`));
    assert.match(dry ?? '', /DRY RUN 098 ROLLBACK finished - EVERYTHING UNDONE/);
    assert.match(dry, /transfer columns 0/);
    assert.deepStrictEqual(await md5s(db), f.gen.map((g) => g.m));
    assert.strictEqual(await errorOf(db, read(`${P}_rollback.sql`)), null);
    assert.deepStrictEqual(await md5s(db), PATCHED.map((s) => f.live[s]));
    assert.strictEqual(Number((await one(db, `SELECT count(*) n FROM information_schema.columns WHERE table_name = 'rt_stops' AND column_name LIKE 'transfer%'`)).n), 0);
    assert.strictEqual((await one(db, TRG)).n, trg0);
    assert.match(await errorOf(db, read(`${P}_dryrun.sql`)) ?? '', /098 ran: leg /);
  });
});
