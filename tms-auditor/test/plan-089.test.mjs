// 089 (P-7: the partner rate of the ANODOS, owner 31/10 + 1/11) on the production-shaped PGlite copy as production
// holds it once 084 and 086 have run (prod-shaped-086.mjs). Each scenario runs inside a transaction that is always
// rolled back, with the deferred rules fired before the rows are read: first on the texts before 089 (the key is
// refused = NO-GO), then after 089 (GO, and what must still be refused), then after the rollback. Every case reads ROWS
// (rt_vehicle_segments, ct_round_trips, audit_log, the cost views), never only an answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped086 } from './prod-shaped-086.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, applyHunks, UPDATE, SEGJSON } from '../../worker/migrations/drafts/tools/build-089.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5 = async (db, sig) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).m;
const trg = (db) => num(db, `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`);

// test rows only: legacy ids rec89..., references T89-..., locations TEST 089 ..., partners TEST 089 ...
const HELPERS = `
CREATE FUNCTION t89_vs(p_ref text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec89X' || p_ref, 'TEST 089 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec89O' || p_ref, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 3, p_hub, 'T89-' || p_ref,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec89A' || p_ref, 'Loading', 1, p_hub - 3, o, lx, 10);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec89H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, 10);
  insert into locations (legacy_id, name) values ('rec89G' || p_ref, 'TEST 089 GR ' || p_ref) returning id into lg;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec89S' || p_ref, 'Unloading', 1, p_hub + 1, o, lg, 10);
  return o;
end $t$;
CREATE SEQUENCE t89_seq;
-- one partner cycle (new_rt PARTNER, the given rate) carrying the one VS piece of p_ref from Veroia to its Greek stop
CREATE FUNCTION t89_cycle(p_ref text, p_day date, p_partner bigint, p_rate numeric) RETURNS bigint LANGUAGE plpgsql AS $t$
declare hub bigint; pc bigint; r jsonb;
begin
  perform t89_vs(p_ref, p_day);
  select id into hub from locations where is_hub;
  select sp.id into pc from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
   where st.legacy_id = 'rec89S' || p_ref and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null;
  r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pc)),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', p_partner, 'partner_rate', p_rate), 'side', 'KATHODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', hub, 'side', 'KATHODOS',
             'planned_from', (p_day + time '16:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '18:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'side', 'KATHODOS',
             'location_id', (select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = pc),
             'planned_from', ((p_day + 1) + time '09:00') at time zone 'Europe/Athens', 'planned_to', ((p_day + 1) + time '10:00') at time zone 'Europe/Athens'))),
         'test:089', 'dispatcher');
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
// a refused call leaves the scenario's transaction usable (its rows are read after it), as PostgREST's own call would
async function call(db, sql, p) {
  await db.exec('SAVEPOINT c');
  try {
    const r = (await one(db, sql, p)).r;
    await db.exec('RELEASE SAVEPOINT c');
    return { r, err: null };
  } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT c'); return { r: null, err: String(e.message) }; }
}
const upd = (db, rt, set, extra = {}) => call(db, `SELECT plan_rt_update($1::jsonb, 'test:089', 'dispatcher') AS r`,
  [JSON.stringify({ rt_id: rt, set, ...extra })]);
const partner = (db) => num(db, `INSERT INTO partners (company_name) VALUES ('TEST 089 partner ' || nextval('t89_seq')) RETURNING id`);
const seg = (db, rt) => one(db, `SELECT id, trip_type, partner_id, partner_rate, partner_rate_anodos FROM rt_vehicle_segments
  WHERE rt_id = $1 AND deleted_at IS NULL`, [rt]);
// the board's segment (plan_h_seg_json) and the P&L's partner cost of the cycle (the views 089 leaves as they are)
const money = async (db, rt) => ({
  json: (await one(db, `SELECT plan_h_seg_json($1::bigint)->0 AS j`, [rt])).j,
  cycle: (await one(db, `SELECT partner_rate FROM ct_round_trips WHERE id = $1`, [rt])).partner_rate,
  planned: (await one(db, `SELECT sum(planned) AS p FROM ct_v_rt_partner_cost WHERE rt_id = $1`, [rt])).p,
  cost: (await one(db, `SELECT sum(cost) AS c FROM ct_v_rt_partner_cost WHERE rt_id = $1`, [rt])).c,
  missing: (await one(db, `SELECT bool_or(rate_missing) AS m FROM ct_v_rt_partner_cost WHERE rt_id = $1`, [rt])).m,
  linesNet: (await one(db, `SELECT lines_net FROM ct_v_rt_costs WHERE rt_id = $1`, [rt])).lines_net,
});
const segAudit = (db, segId) => db.query(`SELECT role, before_data->>'partner_rate_anodos' AS b, after_data->>'partner_rate_anodos' AS a,
  after_data->>'partner_rate' AS fee FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = $1 ORDER BY id`, [String(segId)]).then((x) => x.rows);

test('089 on the production-shaped copy (after 084 + 086): the ANODOS part refused before 089, kept after it, the money unchanged', async (t) => {
  const db = await prodShaped086();
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const day = `DATE '${L}' + 3`;
  const src = read('089_plan_partner_rate_anodos.sql');
  const f = facts(src);
  const live = { u: await md5(db, UPDATE), j: await md5(db, SEGJSON) };

  await t.test('the copy holds the texts 089 guards on (plan_rt_update = 086\'s, plan_h_seg_json = live), and the hunks give PART 2', async () => {
    assert.strictEqual(live.u, f.live[UPDATE]);
    assert.strictEqual(live.j, f.live[SEGJSON]);
    for (const g of f.gen) {
      const txt = (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = '${g.sig}'::regprocedure`)).prosrc;
      assert.strictEqual((await one(db, `SELECT md5($1) AS m`, [applyHunks(txt, g, f.consts)])).m, g.m, g.sig);
    }
  });

  await t.test('NO-GO before 089: set.partner_rate_anodos is an unknown key (bad_input), nothing written', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('N1', ${day}, $1, 700)`, [await partner(db)]);
      const u = await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 });
      return { u, s: await one(db, `SELECT partner_rate FROM rt_vehicle_segments WHERE rt_id = $1`, [rt]) };
    });
    assert.match(r.u.err ?? '', /bad_input/);
    assert.strictEqual(Number(r.s.partner_rate), 700);
    assert.strictEqual(r.late, null);
  });

  await t.test('089 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('089_plan_partner_rate_anodos_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 089 finished - EVERYTHING UNDONE/);
    assert.match(msg, new RegExp(`update ${f.gen[0].m}, seg_json ${f.gen[1].m}`));
    assert.strictEqual(await md5(db, UPDATE), live.u);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_attribute WHERE attrelid = 'rt_vehicle_segments'::regclass AND attname = 'partner_rate_anodos'`), 0);
  });

  const trg0 = await trg(db);
  await t.test('089 applies: generated texts with their old rights and language, the column, the CHECK, one trigger, B-54 follows, verify', async () => {
    const acl0 = await db.query(`SELECT proname, proacl::text AS a, prolang, provolatile FROM pg_proc WHERE proname IN ('plan_rt_update', 'plan_h_seg_json') ORDER BY 1`);
    await db.exec(src);
    for (const g of f.gen) assert.strictEqual(await md5(db, g.sig), g.m, g.sig);
    assert.deepStrictEqual((await db.query(`SELECT proname, proacl::text AS a, prolang, provolatile FROM pg_proc WHERE proname IN ('plan_rt_update', 'plan_h_seg_json') ORDER BY 1`)).rows, acl0.rows);
    assert.strictEqual(await trg(db), trg0 + 1);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0 + 1);
    const v = await one(db, read('089_plan_partner_rate_anodos_verify.sql'));
    assert.deepStrictEqual({ ...v, changed_texts: Number(v.changed_texts), has_column: Number(v.has_column), check_rule: Number(v.check_rule), split_trigger: Number(v.split_trigger) },
      { applied: '089 in place', changed_texts: 0, has_column: 1, check_rule: 1, split_trigger: 1, b54_follows: true });
    const a = (await one(db, `SELECT proacl::text AS a FROM pg_proc WHERE proname = 'plan_seg_rate_split'`)).a;
    assert.ok(a && !/(^|[{,])(=|anon=|authenticated=|service_role=)/.test(a), a);
    assert.strictEqual(await num(db, `SELECT count(*) FROM rt_vehicle_segments WHERE partner_rate_anodos IS NOT NULL`), 0);
  });

  await t.test('089 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /089: public\.plan_rt_update\(jsonb,text,text\) is not its text after 086/);
    assert.strictEqual(await trg(db), trg0 + 1);
  });

  await t.test('GO: KATHODOU 400 + ANODOU 300 = fee 700, part 300; the board reads 700 / 300, the P&L the same 700; one audit row', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('G1', ${day}, $1, NULL)`, [await partner(db)]);
      const u = await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 });
      const s = await seg(db, rt);
      return { u, s, m: await money(db, rt), audit: await segAudit(db, s.id) };
    });
    assert.strictEqual(r.u.err, null, r.u.err);
    assert.strictEqual(r.late, null, r.late);
    assert.strictEqual(Number(r.s.partner_rate), 700);
    assert.strictEqual(Number(r.s.partner_rate_anodos), 300);
    assert.strictEqual(Number(r.m.json.partner_rate), 700);
    assert.strictEqual(Number(r.m.json.partner_rate_anodos), 300);
    // the P&L reads the whole fee the screen shows as KATHODOU + ANODOU (coordinator 1/11, condition 3)
    assert.strictEqual(Number(r.m.cycle), 700);
    assert.strictEqual(Number(r.m.planned), 700);
    assert.strictEqual(Number(r.m.cost), 700);
    assert.strictEqual(r.m.missing, false);
    assert.ok(Number(r.m.linesNet) >= 700, String(r.m.linesNet));
    assert.ok(r.audit.some((x) => Number(x.a) === 300 && x.b === null && x.role === 'dispatcher'), JSON.stringify(r.audit));
  });

  await t.test('only the KATHODOU typed: fee 400, part NULL (never 0); the P&L reads 400 and is not "missing" (the fee is there)', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('G2', ${day}, $1, NULL)`, [await partner(db)]);
      const u = await upd(db, rt, { partner_rate: 400, partner_rate_anodos: null });
      return { u, s: await seg(db, rt), m: await money(db, rt) };
    });
    assert.strictEqual(r.u.err, null, r.u.err);
    assert.strictEqual(Number(r.s.partner_rate), 400);
    assert.strictEqual(r.s.partner_rate_anodos, null);
    assert.ok(!('partner_rate_anodos' in r.m.json) || r.m.json.partner_rate_anodos === null, JSON.stringify(r.m.json));
    assert.strictEqual(Number(r.m.planned), 400);
  });

  await t.test('a fee change that does not name the part empties it, said in the audit row (300 -> null); naming it keeps it', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('G3', ${day}, $1, NULL)`, [await partner(db)]);
      await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 });
      const s0 = await seg(db, rt);
      const u1 = await upd(db, rt, { partner_rate: 800 });       // the «κόμιστρο» quick write of Δ1: the fee only
      const s1 = await seg(db, rt);
      const u2 = await upd(db, rt, { partner_rate: 900, partner_rate_anodos: 300 });
      const s2 = await seg(db, rt);
      return { u1, u2, s1, s2, audit: await segAudit(db, s0.id), m: await money(db, rt) };
    });
    assert.strictEqual(r.u1.err, null, r.u1.err);
    assert.strictEqual(Number(r.s1.partner_rate), 800);
    assert.strictEqual(r.s1.partner_rate_anodos, null);
    assert.ok(r.audit.some((x) => Number(x.b) === 300 && x.a === null && Number(x.fee) === 800), JSON.stringify(r.audit));
    assert.strictEqual(r.u2.err, null, r.u2.err);
    assert.strictEqual(Number(r.s2.partner_rate), 900);
    assert.strictEqual(Number(r.s2.partner_rate_anodos), 300);
    assert.strictEqual(Number(r.m.planned), 900);
    assert.strictEqual(r.late, null);
  });

  await t.test('another partner, or PARTNER -> OWNED: the part goes with the old fee; COMMIT passes', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('G4', ${day}, $1, NULL)`, [await partner(db)]);
      await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 });
      const u1 = await upd(db, rt, { partner_id: await partner(db) });
      const s1 = await seg(db, rt);
      await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 });
      // a correction of the segment (plan_seg_fix, the vehicle-change form) that changes the fee: no hunk, the trigger
      const fx = await call(db, `SELECT plan_seg_fix($1::jsonb, 'test:089', 'dispatcher') AS r`,
        [JSON.stringify({ segment_id: Number(s1.id), set: { partner_rate: 750 } })]);
      const sf = await seg(db, rt);
      const fxAudit = await segAudit(db, s1.id);
      await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 });
      const tk = await num(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-089-' || nextval('t89_seq')) RETURNING id`);
      const u2 = await upd(db, rt, { trip_type: 'OWNED', truck_id: tk, partner_id: null, partner_rate: null });
      return { u1, u2, s1, fx, sf, fxAudit, s2: await seg(db, rt) };
    });
    assert.strictEqual(r.fx.err, null, r.fx.err);
    assert.deepStrictEqual([Number(r.sf.partner_rate), r.sf.partner_rate_anodos], [750, null]);
    assert.ok(r.fxAudit.some((x) => Number(x.b) === 300 && x.a === null && Number(x.fee) === 750), JSON.stringify(r.fxAudit));
    assert.strictEqual(r.u1.err, null, r.u1.err);
    assert.strictEqual(Number(r.s1.partner_rate), 700);
    assert.strictEqual(r.s1.partner_rate_anodos, null);
    assert.strictEqual(r.u2.err, null, r.u2.err);
    assert.deepStrictEqual([r.s2.trip_type, r.s2.partner_rate, r.s2.partner_rate_anodos], ['OWNED', null, null]);
    assert.strictEqual(r.late, null, r.late);
  });

  await t.test('still refused: a part above the fee, a negative part, a part without a fee (CHECK seg_partner_rate_anodos); NaN / Infinity / past numeric(10,2) (bad_input)', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('R1', ${day}, $1, NULL)`, [await partner(db)]);
      const out = {};
      out.above = (await upd(db, rt, { partner_rate: 300, partner_rate_anodos: 400 })).err;
      out.neg = (await upd(db, rt, { partner_rate: 300, partner_rate_anodos: -1 })).err;
      out.nofee = (await upd(db, rt, { partner_rate_anodos: 100 })).err;
      out.nan = (await upd(db, rt, { partner_rate: 300, partner_rate_anodos: 'NaN' })).err;
      out.inf = (await upd(db, rt, { partner_rate: 300, partner_rate_anodos: 'Infinity' })).err;
      out.big = (await upd(db, rt, { partner_rate: 300, partner_rate_anodos: 123456789 })).err;
      out.text = (await upd(db, rt, { partner_rate: 300, partner_rate_anodos: 'abc' })).err;
      out.s = await seg(db, rt);
      return out;
    });
    for (const k of ['above', 'neg', 'nofee']) assert.match(r[k] ?? '', /seg_partner_rate_anodos/, k);
    assert.match(r.nan ?? '', /partner_rate_anodos:finite/);
    assert.match(r.inf ?? '', /partner_rate_anodos:finite/);
    assert.match(r.big ?? '', /partner_rate_anodos:range/);
    assert.match(r.text ?? '', /bad_input/);
    assert.deepStrictEqual([r.s.partner_rate, r.s.partner_rate_anodos], [null, null], 'nothing kept from a refused call');
  });

  await t.test('a dry run with the part keeps nothing; an OWNED cycle cannot hold a part (CHECK)', async () => {
    const r = await scenario(db, async () => {
      const rt = await num(db, `SELECT t89_cycle('D1', ${day}, $1, 500)`, [await partner(db)]);
      const d = await upd(db, rt, { partner_rate: 700, partner_rate_anodos: 300 }, { dry_run: true });
      const s = await seg(db, rt);
      const own = await call(db, `UPDATE rt_vehicle_segments SET trip_type = 'OWNED', partner_id = NULL, partner_rate = NULL, partner_rate_anodos = 10 WHERE id = $1 RETURNING 1 AS r`, [s.id]);
      return { d, s, own };
    });
    assert.strictEqual(r.d.err, null, r.d.err);
    assert.strictEqual(r.d.r.dry_run, true);
    assert.deepStrictEqual([Number(r.s.partner_rate), r.s.partner_rate_anodos], [500, null]);
    assert.match(r.own.err ?? '', /seg_partner_rate_anodos/);
  });

  await t.test('rollback: dry run keeps nothing; then the texts before 089 come back, column / CHECK / trigger gone, B-54 back, the lost parts counted', async () => {
    // one split row kept across the rollback, to see it counted (the fee stays)
    const rt = await num(db, `SELECT t89_cycle('K1', ${day}, $1, NULL)`, [await partner(db)]);
    await db.query(`SELECT plan_rt_update($1::jsonb, 'test:089', 'dispatcher')`, [JSON.stringify({ rt_id: rt, set: { partner_rate: 700, partner_rate_anodos: 300 } })]);
    assert.strictEqual(Number((await seg(db, rt)).partner_rate_anodos), 300);
    const dry = await errorOf(db, read('089_plan_partner_rate_anodos_rollback_dryrun.sql'));
    assert.match(dry ?? '', /DRY RUN 089 ROLLBACK finished - EVERYTHING UNDONE/);
    assert.match(dry, new RegExp(`update ${live.u}, seg_json ${live.j}`));
    assert.strictEqual(await md5(db, UPDATE), f.gen[0].m);
    const notices = [];
    await db.query(read('089_plan_partner_rate_anodos_rollback.sql'), [], { onNotice: (n) => notices.push(n.message) });
    assert.ok(notices.some((n) => /089 ROLLBACK OK: 1 splits dropped/.test(n)), notices.join(' | '));
    assert.strictEqual(await md5(db, UPDATE), live.u);
    assert.strictEqual(await md5(db, SEGJSON), live.j);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_attribute WHERE attrelid = 'rt_vehicle_segments'::regclass AND attname = 'partner_rate_anodos' AND NOT attisdropped`), 0);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_proc WHERE proname = 'plan_seg_rate_split'`), 0);
    assert.strictEqual(await trg(db), trg0);
    assert.strictEqual(await num(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0);
    assert.strictEqual(Number((await one(db, `SELECT partner_rate FROM rt_vehicle_segments WHERE rt_id = $1 AND deleted_at IS NULL`, [rt])).partner_rate), 700, 'the fee stays');
    const again = await scenario(db, async () => {
      const r2 = await num(db, `SELECT t89_cycle('K2', ${day}, $1, 700)`, [await partner(db)]);
      return { u: await upd(db, r2, { partner_rate_anodos: 300 }) };
    });
    assert.match(again.u.err ?? '', /bad_input/, 'refused again after the rollback');
  });
});
