// 087 (pack 4: P-16 last change, A-3 waiting per week, P-8 rate history, P-11 one place per piece at Veroia) on the
// production-shaped PGlite copy: prod-shaped-074.mjs + 075 ... 082 as plan-086.test.mjs builds it, then 084 and 086
// (087 patches plan_move_pieces AFTER 086; plan_board is the live text, 086 does not touch it).
// Each scenario runs inside a transaction that is always rolled back, with the deferred rules fired before the rows
// are read: first on the LIVE texts (NO-GO: no keys, target.hub refused), then after 087 (GO), then after the
// rollback (the live behaviour again). Every case reads ROWS (shipment_pieces, audit_log) or the board's answer.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts } from '../../worker/migrations/drafts/tools/build-087.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql, p) { try { await (p ? db.query(sql, p) : db.exec(sql)); return null; } catch (e) { return String(e.message); } }
const SIGS = ['public.plan_board(date,text)', 'public.plan_move_pieces(jsonb,text,text)'];
const md5s = async (db) => Promise.all(SIGS.map(async (s) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${s}'::regprocedure`)).m));
const B54 = `UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') WHERE id = 'B-54'`;

// test rows only: legacy ids rec87..., references T87-..., locations TEST 087 ..., plates TEST-087-...
const HELPERS = `
CREATE SEQUENCE t87_n;
-- a VS import that stands at Veroia (one unloading of p_pallets on p_hub + 1): its one piece is at the hub, waiting
CREATE FUNCTION t87_vs(p_hub date, p_pallets numeric) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint; r text := nextval('t87_n')::text;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec87X' || r, 'TEST 087 abroad ' || r) returning id into lx;
  insert into locations (legacy_id, name) values ('rec87G' || r, 'TEST 087 GR ' || r) returning id into lg;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec87O' || r, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 1, p_hub, 'T87-' || r,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec87A' || r, 'Loading', 1, p_hub - 3, o, lx, p_pallets);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec87H' || r, 'Cross-dock', 1, p_hub, o, hub, p_pallets);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec87S' || r, 'Unloading', 1, p_hub + 1, o, lg, p_pallets);
  return (select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id
           where s.order_id = o and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null);
end $t$;
-- ONE new cycle on day p_day that takes p_piece from Veroia to its Greek stop; OWNED, or PARTNER with p_rate
CREATE FUNCTION t87_put(p_piece bigint, p_day date, p_rate numeric) RETURNS bigint LANGUAGE plpgsql AS $t$
declare trk bigint; pa bigint; hub bigint; r jsonb; nr jsonb;
begin
  select id into hub from locations where is_hub;
  if p_rate is null then
    insert into trucks (license_plate) values ('TEST-087-' || nextval('t87_n')) returning id into trk;
    nr := jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk);
  else
    insert into partners (company_name) values ('TEST 087 partner ' || nextval('t87_n')) returning id into pa;
    nr := jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pa, 'partner_rate', p_rate);
  end if;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece, 'drop', 'd')),
         'target', jsonb_build_object('new_rt', nr, 'side', 'KATHODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', hub, 'side', 'KATHODOS',
             'planned_from', (p_day + time '06:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '07:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd', 'side', 'KATHODOS',
             'location_id', (select vs.nat_to_location_id from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece),
             'planned_from', (p_day + time '10:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '11:00') at time zone 'Europe/Athens'))),
       'test:087', 'dispatcher');
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
const board = async (db, week, role = 'dispatcher') => (await one(db, `SELECT plan_board($1::date, $2) AS b`, [week, role])).b;
const hubMark = (db, pieces, hub, extra = {}) => errorOf(db, `SELECT plan_move_pieces($1::jsonb, 'test:087', 'dispatcher')`,
  [JSON.stringify({ from: { piece_ids: pieces }, target: { hub }, ...extra })]);
const markOf = (db, p) => one(db, `SELECT for_split_at IS NOT NULL AS m FROM shipment_pieces WHERE id = $1`, [p]).then((r) => r.m);
const weekOf = (db, ymd) => one(db, `SELECT ($1::date - ((extract(isodow from $1::date)::int + 1) % 7))::text AS w`, [ymd]).then((r) => r.w);
const readyOf = (db, p) => one(db, `SELECT nat_ready_day::text AS d FROM v_piece_state WHERE piece_id = $1`, [p]).then((r) => r.d);
const waitingIn = (b, wk) => ((b.waiting_weeks || []).find((x) => x.week === wk) || { orders: 0 }).orders;

test('087 on the production-shaped copy (1/11): the board says last change / weeks / rates, one place per piece at Veroia', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  await db.query(B54);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(read('081_plan_stop_order_follows.sql'));
  await db.exec(read('084_plan_move_busy_skip.sql'));
  await db.query(B54);
  await db.exec(read('086_plan_busy_overlap_ok.sql'));
  await db.query(B54);
  await db.exec(HELPERS);
  const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
  const src = read('087_plan_board_reads_hub_mark.sql');
  const F = facts(src);
  const live = await md5s(db);
  const trg0 = await num(db, TRG);

  await t.test('the copy holds the texts 087 patches (plan_board live 1/11, plan_move_pieces after 086)', async () => {
    assert.deepStrictEqual(live, SIGS.map((s) => F.live[s]));
    assert.deepStrictEqual(live, ['670f72f60edcf09f955fb1f6a74143b9', '2a8c746b726a9b37f0247166da0ecae5']);
  });
  await t.test('NO-GO on the live texts: no last_change / waiting_weeks / rate_history, target.hub refused', async () => {
    const r = await scenario(db, async () => {
      const p = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 10)`);
      const b = await board(db, L);
      return { keys: ['waiting_weeks', 'rate_history'].filter((k) => k in b), err: await hubMark(db, [p], true) };
    });
    assert.deepStrictEqual(r.keys, []);
    assert.match(r.err ?? '', /bad_input/, r.err);
  });

  await t.test('087 dry run keeps nothing', async () => {
    const msg = await errorOf(db, read('087_plan_board_reads_hub_mark_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 087 finished - EVERYTHING UNDONE, nothing kept\\. The block ran to its end {2}\\|\\| {2}087 ran: board ${F.gen[0].m}, move ${F.gen[1].m}, helper true`), msg);
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_h_last_change(bigint)') IS NULL AS n`)).n, true);
  });
  await t.test('087 applies; texts generated, rights as before, the helper born closed, no trigger', async () => {
    const acl0 = (await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows;
    await db.exec(src);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    assert.deepStrictEqual((await db.query(`SELECT proacl::text AS a, prosecdef FROM pg_proc WHERE oid = ANY($1::regprocedure[]) ORDER BY oid`, [SIGS])).rows, acl0);
    assert.strictEqual(await num(db, TRG), trg0);
    const v = await one(db, read('087_plan_board_reads_hub_mark_verify.sql'));
    assert.strictEqual(v.applied, '087 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(v.helper_closed, true);
    assert.strictEqual(v.worker_execute, true);
  });
  await t.test('087 a second time is refused by its guard, nothing changes', async () => {
    assert.match(await errorOf(db, src) ?? '', /087: plan_h_last_change exists/);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
  });
  await t.test('the Worker role reads the board through the closed helper (plan_board is SECURITY DEFINER), never the helper itself', async () => {
    await db.exec('SET ROLE service_role');
    try {
      const b = (await db.query(`SELECT public.plan_board($1::date, 'dispatcher') AS b`, [L])).rows[0].b;
      assert.ok(Array.isArray(b.waiting_weeks) && Array.isArray(b.rate_history));
      await assert.rejects(db.query(`SELECT public.plan_h_last_change(1)`), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
  });

  await t.test('GO P-16: a cycle just assigned has no last change; a later change by a person is the one shown (role, table, keys)', async () => {
    const r = await scenario(db, async () => {
      const p = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 10)`);
      const rt = await num(db, `SELECT t87_put($1, DATE '${L}' + 4, 450)`, [p]);
      const cyc = () => board(db, L).then((b) => b.cycles.find((c) => Number(c.rt_id) === rt));
      const fresh = (await cyc()).last_change;
      // the assignment happened an hour ago (one transaction here: its rows all carry one now())
      await db.exec(`UPDATE ct_round_trips SET created_at = created_at - interval '1 hour' WHERE id = ${rt}`);
      await db.exec(`SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;`);
      await db.query(`SELECT plan_rt_update($1::jsonb, 'test:087', 'owner')`, [JSON.stringify({ rt_id: rt, set: { partner_rate: 500 } })]);
      const after = (await cyc()).last_change;
      // a machine row later still is not a change of plan
      await db.query(`INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
        VALUES ('trigger:rt_sync', 'system', 'update', 'ct_round_trips', $1, '{"x":1}', '{"x":2}', now() + interval '1 minute')`, [String(rt)]);
      const sys = (await cyc()).last_change;
      return { fresh, after, sys };
    });
    assert.strictEqual(r.late, null, r.late);
    assert.strictEqual(r.fresh, null, 'the assignment itself is not a change after it');
    assert.strictEqual(r.after.role, 'owner');
    assert.strictEqual(r.after.table, 'ct_round_trips');
    assert.ok(r.after.keys.includes('partner_rate'), JSON.stringify(r.after));
    assert.ok(!JSON.stringify(r.after).includes('500'), 'names only, never the value');
    assert.deepStrictEqual(r.sys, r.after, 'a trigger row does not replace it');
  });

  await t.test('GO A-3: a VS at Veroia counts in its week until it is sent to the panel; back with <- Weekly, counted again', async () => {
    const r = await scenario(db, async () => {
      const p = await num(db, `SELECT t87_vs(DATE '${L}' + 10, 10)`);
      const wk = await weekOf(db, await readyOf(db, p));
      const n0 = waitingIn(await board(db, L), wk);
      const e1 = await hubMark(db, [p], true);
      const n1 = waitingIn(await board(db, L), wk);
      const e2 = await hubMark(db, [p], false);
      const n2 = waitingIn(await board(db, L), wk);
      const weeks = (await board(db, L)).waiting_weeks.map((x) => x.week);
      return { n0, n1, n2, e1, e2, weeks, wk };
    });
    assert.strictEqual(r.e1, null, r.e1);
    assert.strictEqual(r.e2, null, r.e2);
    assert.deepStrictEqual([r.n1, r.n0 - r.n1, r.n2], [r.n0 - 1, 1, r.n0]);
    assert.ok(r.weeks.every((w) => w >= new Date(Date.parse(L) - 21 * 864e5).toISOString().slice(0, 10)
      && w <= new Date(Date.parse(L) + 21 * 864e5).toISOString().slice(0, 10)), 'seven weeks around p_week');
  });

  await t.test('GO P-8: a PARTNER cycle with a rate is in rate_history with its partner, rate, first and last place per side', async () => {
    const r = await scenario(db, async () => {
      const p = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 10)`);
      const rt = await num(db, `SELECT t87_put($1, DATE '${L}' + 4, 450)`, [p]);
      const own = await num(db, `SELECT t87_put($1, DATE '${L}' + 4, NULL)`, [await num(db, `SELECT t87_vs(DATE '${L}' + 3, 5)`)]);
      const h = (await board(db, L, 'warehouse')).rate_history;
      const hub = await num(db, `SELECT id FROM locations WHERE is_hub`);
      const dest = await num(db, `SELECT vs.nat_to_location_id FROM shipment_pieces sp JOIN v_shipments vs ON vs.shipment_id = sp.shipment_id WHERE sp.id = $1`, [p]);
      return { mine: h.find((x) => Number(x.rt_id) === rt), owned: h.some((x) => Number(x.rt_id) === own), hub, dest };
    });
    assert.strictEqual(r.late, null, r.late);
    assert.ok(r.mine, 'the partner cycle is listed');
    assert.strictEqual(Number(r.mine.partner_rate), 450);
    assert.ok(String(r.mine.partner).startsWith('TEST 087 partner'));
    assert.deepStrictEqual(r.mine.sides.map((x) => [x.side, Number(x.from_location_id), Number(x.to_location_id)]), [['KATHODOS', r.hub, r.dest]]);
    assert.strictEqual(r.owned, false, 'an owned cycle is not a rate');
  });

  await t.test('GO P-11: hub true sets the mark (one audit row), again leaves it; hub false clears it', async () => {
    const r = await scenario(db, async () => {
      const p = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 10)`);
      const a0 = await num(db, `SELECT count(*) FROM audit_log WHERE table_name = 'shipment_pieces' AND record_id = $1`, [String(p)]);
      const e1 = await hubMark(db, [p], true); const m1 = await markOf(db, p);
      const e2 = await hubMark(db, [p], true);
      const a2 = await num(db, `SELECT count(*) FROM audit_log WHERE table_name = 'shipment_pieces' AND record_id = $1`, [String(p)]);
      const forSplit = ((await board(db, L)).hub.find((h) => Number(h.piece_id) === p) || {}).for_split;
      const e3 = await hubMark(db, [p], false); const m3 = await markOf(db, p);
      return { e1, e2, e3, m1, m3, audits: a2 - a0, forSplit };
    });
    assert.strictEqual(r.late, null, r.late);
    assert.deepStrictEqual([r.e1, r.e2, r.e3], [null, null, null]);
    assert.deepStrictEqual([r.m1, r.m3], [true, false]);
    assert.strictEqual(r.audits, 1, 'a second true writes nothing');
    assert.strictEqual(r.forSplit, true, 'the board reads it as hub[].for_split');
  });
  for (const [why, mk, extra, code] of [
    ['a piece on a truck (not waiting at Veroia)', 'ride', {}, /bad_input:target\.hub:not waiting at Veroia/],
    ['hub not a boolean', 'hub', { target: { hub: 'yes' } }, /bad_input:target\.hub$/],
    ['with a dry run', 'hub', { dry_run: true }, /bad_input:target\.hub$/],
    ['another key beside hub', 'hub', { target: { hub: true, rt_id: 1 } }, /bad_input/],
    ['no piece', 'none', { from: { piece_ids: [] } }, /bad_input:from\.piece_ids/],
  ]) {
    await t.test(`refused, nothing written: ${why}`, async () => {
      const r = await scenario(db, async () => {
        const p = await num(db, `SELECT t87_vs(DATE '${L}' + 3, 10)`);
        if (mk === 'ride') await num(db, `SELECT t87_put($1, DATE '${L}' + 4, NULL)`, [p]);
        const body = { from: { piece_ids: [p] }, target: { hub: true }, ...extra };
        await db.exec('SAVEPOINT h');
        const err = await errorOf(db, `SELECT plan_move_pieces($1::jsonb, 'test:087', 'dispatcher')`, [JSON.stringify(body)]);
        await db.exec(err ? 'ROLLBACK TO SAVEPOINT h' : 'RELEASE SAVEPOINT h');
        return { err, m: await markOf(db, p) };
      });
      assert.match(r.err ?? '', code, r.err);
      assert.strictEqual(r.m, false);
    });
  }

  await t.test('rollback dry run keeps nothing; the rollback brings the texts back, drops the helper, refuses target.hub', async () => {
    const msg = await errorOf(db, read('087_plan_board_reads_hub_mark_rollback_dryrun.sql'));
    assert.match(msg ?? '', new RegExp(`DRY RUN 087 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: board ${live[0]}, move ${live[1]}, helper false`), msg);
    assert.deepStrictEqual(await md5s(db), F.gen.map((g) => g.m));
    await db.exec(read('087_plan_board_reads_hub_mark_rollback.sql'));
    assert.deepStrictEqual(await md5s(db), live);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_h_last_change(bigint)') IS NULL AS n`)).n, true);
    const r = await scenario(db, async () => ({ err: await hubMark(db, [await num(db, `SELECT t87_vs(DATE '${L}' + 3, 10)`)], true) }));
    assert.match(r.err ?? '', /bad_input/);
    assert.strictEqual((await one(db, read('087_plan_board_reads_hub_mark_verify.sql'))).applied, '087 NOT APPLIED');
  });
});
