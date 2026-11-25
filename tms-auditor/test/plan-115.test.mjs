// 115 (the partner's plates and driver on the national trip, free text; owner 25/11/2026 "Yes, on the trip") on the
// production-shaped PGlite copy as production holds it on 25/11: prod-shaped-093.mjs + 095 ... 112, the migrations that
// changed plan_rt_update / plan_rt_create / plan_board since (the copy's three texts are asserted equal to the live md5
// the source guards on, read 25/11 by SELECT). Every behaviour case runs inside a transaction that is always rolled
// back and reads ROWS - ct_round_trips, audit_log, the board - never only an answer.
// Run: cd tms-auditor && npm install && node --test test/plan-115.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { TRG } from './prod-shaped-072.mjs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';
import { facts, generated } from '../../worker/migrations/drafts/tools/build-115.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql, p) { try { if (p) await db.query(sql, p); else await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const P = '115_rt_partner_plates';
const N = (x) => (x === null || x === undefined ? x : Number(x));
const SIG = { upd: 'public.plan_rt_update(jsonb,text,text)', cre: 'public.plan_rt_create(jsonb,text,text)', brd: 'public.plan_board(date,text)' };
// production on 25/11 (SELECT): the migrations after 093 that wrote these three texts, in their order
const SINCE_093 = ['095_plan_small_relaxed.sql', '096_plan_handover_accept_busy.sql', '097_plan_vs_state_hub_only.sql',
  '098_plan_transfer_point.sql', '099_plan_transfer.sql', '102_plan_drafts.sql', '109_plan_board_intl_trips.sql',
  '110_plan_rt_expect_change.sql', '112_plan_board_local_truck.sql'];

// test rows only: TEST 115 ... names, T115- references; a national load of 10 pallets on Mon 7/12
const HELPERS = `
CREATE SEQUENCE t115_n;
CREATE FUNCTION t115_loc() RETURNS bigint LANGUAGE sql AS
  $t$ insert into locations (legacy_id, name) values ('r115L' || nextval('t115_n'), 'TEST 115 ' || currval('t115_n')) returning id $t$;
CREATE FUNCTION t115_partner() RETURNS bigint LANGUAGE sql AS
  $t$ insert into partners (company_name) values ('TEST 115 partner ' || nextval('t115_n')) returning id $t$;
CREATE FUNCTION t115_truck() RETURNS bigint LANGUAGE sql AS
  $t$ insert into trucks (license_plate) values ('TEST-115-' || nextval('t115_n')) returning id $t$;
CREATE FUNCTION t115_piece(p_from bigint, p_to bigint) RETURNS bigint LANGUAGE plpgsql AS $t$
declare n bigint; sh bigint;
begin
  insert into national_orders (legacy_id, client_id, reference, price, pallets)
  values ('r115N' || nextval('t115_n'), (select min(id) from clients), 'T115-N', 100, 10) returning id into n;
  insert into shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                         deliver_to, created_by)
  values (n, p_from, p_to, 10, '2026-12-07 08:00+02', '2026-12-07 09:00+02', '2026-12-07 18:00+02', '2026-12-07 19:00+02', 'test:115')
  returning id into sh;
  insert into shipment_pieces (shipment_id, pallets, created_by) values (sh, 10, 'test:115');
  return (select id from shipment_pieces where shipment_id = sh);
end $t$;
-- the normal way (POST /plan/legs): a NEW trip described by p_new_rt takes the piece from its start to its end on 7/12
CREATE FUNCTION t115_put(p_piece bigint, p_new_rt jsonb) RETURNS bigint LANGUAGE plpgsql AS $t$
declare r jsonb; v record;
begin
  select vs.nat_from_location_id f, vs.nat_to_location_id t into v
    from shipment_pieces sp join v_shipments vs on vs.shipment_id = sp.shipment_id where sp.id = p_piece;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece, 'pickup', 'p', 'drop', 'd')),
         'target', jsonb_build_object('new_rt', p_new_rt, 'side', 'ANODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', v.f, 'side', 'ANODOS',
             'planned_from', '2026-12-07 08:00+02', 'planned_to', '2026-12-07 09:00+02'),
           jsonb_build_object('ref', 'd', 'location_id', v.t, 'side', 'ANODOS',
             'planned_from', '2026-12-07 18:00+02', 'planned_to', '2026-12-07 19:00+02'))),
       'test:115', 'dispatcher');
  perform set_config('plan.writer', '', true);
  -- plan_h_finish fires the rules immediately inside the act; the next fixture row is checked at COMMIT again (as 099)
  set constraints all deferred;
  return (r->'ids'->>'rt_id')::bigint;
end $t$;`;

const state = (db) => one(db, `SELECT
  (SELECT count(*)::int FROM pg_attribute WHERE attrelid = 'public.ct_round_trips'::regclass AND NOT attisdropped
     AND attname IN ('partner_plates', 'partner_driver')) AS cols,
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
     AND conname IN ('rt_partner_text_shape', 'rt_partner_text_partner')) AS checks,
  (SELECT count(*)::int FROM pg_proc WHERE proname IN ('plan_h_partner_text', 'rt_partner_text_follow')) AS fns,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.upd}'::regprocedure) AS upd,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.cre}'::regprocedure) AS cre,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = '${SIG.brd}'::regprocedure) AS brd,
  (SELECT proacl::text FROM pg_proc WHERE oid = '${SIG.upd}'::regprocedure) AS acl_upd,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54, (${TRG}) AS trg`);
async function scenario(db, steps) {
  await db.exec('BEGIN');
  try { return await steps(); } finally { await db.exec('ROLLBACK'); }
}
const upd = (db, rt, set, extra = {}) => one(db, `SELECT plan_rt_update($1::jsonb, 'test:115', 'dispatcher') AS a`,
  [JSON.stringify({ rt_id: rt, set, ...extra })]).then((r) => r.a);
const errUpd = (db, rt, set) => errorOf(db, `SELECT plan_rt_update($1::jsonb, 'test:115', 'dispatcher')`, [JSON.stringify({ rt_id: rt, set })]);
const trip = (db, rt) => one(db, `SELECT trip_type, partner_id::int AS partner_id, partner_plates AS pl, partner_driver AS pd FROM ct_round_trips WHERE id = $1`, [rt]);
const boardCycle = async (db, rt) => {
  const b = (await one(db, `SELECT plan_board('2026-12-05'::date, 'dispatcher') AS b`)).b;
  return b.cycles.find((c) => Number(c.rt_id) === rt);
};

test('115 on the production-shaped copy (25/11): before, dry run, GO, the rules, rollback', async (t) => {
  const db = await prodShaped093();
  for (const f of SINCE_093) await db.exec(read(f));
  await db.exec(HELPERS);
  // B-54 = the copy's own trigger count, as production's red_value is production's (115 guards on it)
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  const { consts: c } = facts(read(`${P}.sql`));
  const live = await state(db);

  await t.test('the copy holds the live texts 115 guards on, and the hunks give the md5 the source expects', async () => {
    assert.deepStrictEqual([live.upd, live.cre, live.brd], [c.m_upd_live, c.m_cre_live, c.m_brd_live]);
    const src = async (sig) => (await one(db, `SELECT prosrc FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).prosrc;
    const g = generated({ upd: await src(SIG.upd), cre: await src(SIG.cre), brd: await src(SIG.brd) });
    assert.deepStrictEqual([md5(g.upd), md5(g.cre), md5(g.brd)], [c.m_upd_gen, c.m_cre_gen, c.m_brd_gen]);
    assert.strictEqual(live.cols, 0);
    assert.strictEqual(Number(live.b54), live.trg);
  });

  await t.test('the dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read(`${P}_dryrun.sql`));
    assert.match(msg ?? '', /DRY RUN 115 finished - EVERYTHING UNDONE/, msg);
    assert.ok(msg.includes(`columns 2, checks 2, trigger 1, helper 1, upd ${c.m_upd_gen}, cre ${c.m_cre_gen}, brd ${c.m_brd_gen}, B-54 ${live.trg + 1} of ${live.trg + 1}`), msg);
    assert.deepStrictEqual(await state(db), live);
  });

  await t.test('115 runs; verify is all true; a second run refuses', async () => {
    assert.strictEqual(await errorOf(db, read(`${P}.sql`)), null);
    const s = await state(db);
    assert.deepStrictEqual([s.cols, s.checks, s.fns, s.upd, s.cre, s.brd], [2, 2, 2, c.m_upd_gen, c.m_cre_gen, c.m_brd_gen]);
    assert.strictEqual(s.acl_upd, live.acl_upd, 'plan_rt_update keeps its rights');
    assert.deepStrictEqual([Number(s.b54), s.trg], [live.trg + 1, live.trg + 1]);
    const v = await one(db, read(`${P}_verify.sql`));
    assert.ok(Object.values(v).every((x) => x === true), JSON.stringify(v));
    assert.match(await errorOf(db, read(`${P}.sql`)) ?? '', /115 has run, nothing to do/);
  });

  const pc = async () => N((await one(db, `SELECT t115_piece(t115_loc(), t115_loc()) AS id`)).id);
  const partner = async () => N((await one(db, `SELECT t115_partner() AS id`)).id);

  await t.test('a new partner trip carries both texts, trimmed and on one line; the board and the audit row name them', () => scenario(db, async () => {
    const p1 = await partner();
    const rt = N((await one(db, `SELECT t115_put($1, $2::jsonb) AS id`, [await pc(), JSON.stringify({
      trip_type: 'PARTNER', partner_id: p1, partner_rate: 300, partner_plates: '  ABC 1234  ', partner_driver: 'Driver\n  One' })])).id);
    assert.deepStrictEqual(await trip(db, rt), { trip_type: 'PARTNER', partner_id: p1, pl: 'ABC 1234', pd: 'Driver One' });
    const cy = await boardCycle(db, rt);
    assert.deepStrictEqual([cy.partner_plates, cy.partner_driver], ['ABC 1234', 'Driver One']);
    const a = await one(db, `SELECT (after_data #>> '{}')::jsonb->>'partner_plates' AS pl FROM audit_log
      WHERE table_name = 'ct_round_trips' AND record_id = $1 AND action = 'create'`, [String(rt)]);
    assert.strictEqual(a.pl, 'ABC 1234');
    // a cycle without them names both keys as null (the front end shows the fields only when the keys are there)
    const rt2 = N((await one(db, `SELECT t115_put($1, $2::jsonb) AS id`, [await pc(), JSON.stringify({ trip_type: 'PARTNER', partner_id: p1, partner_rate: 1 })])).id);
    const c2 = await boardCycle(db, rt2);
    assert.ok('partner_plates' in c2 && 'partner_driver' in c2);
    assert.deepStrictEqual([c2.partner_plates, c2.partner_driver], [null, null]);
  }));

  await t.test('PATCH set: a present key wins, even null; blank = null; the other key stays; one audit row per change', () => scenario(db, async () => {
    const p1 = await partner();
    const rt = N((await one(db, `SELECT t115_put($1, $2::jsonb) AS id`, [await pc(), JSON.stringify({ trip_type: 'PARTNER', partner_id: p1, partner_rate: 300 })])).id);
    const audits = async () => N((await one(db, `SELECT count(*) n FROM audit_log WHERE table_name = 'ct_round_trips' AND record_id = $1`, [String(rt)])).n);
    const a0 = await audits();
    assert.strictEqual((await upd(db, rt, { partner_plates: 'XYZ 9', partner_driver: 'Two' })).ok, true);
    assert.deepStrictEqual([(await trip(db, rt)).pl, (await trip(db, rt)).pd], ['XYZ 9', 'Two']);
    assert.strictEqual(await audits(), a0 + 1);
    await upd(db, rt, { partner_driver: null });
    assert.deepStrictEqual([(await trip(db, rt)).pl, (await trip(db, rt)).pd], ['XYZ 9', null]);
    await upd(db, rt, { partner_plates: '   ' });
    assert.strictEqual((await trip(db, rt)).pl, null);
    const a1 = await audits();
    await upd(db, rt, { partner_plates: null });   // nothing to change: no audit row
    assert.strictEqual(await audits(), a1);
    // the dry run previews and keeps nothing
    const d = await upd(db, rt, { partner_plates: 'DRY 1' }, { dry_run: true });
    assert.strictEqual(d.dry_run, true);
    assert.strictEqual((await trip(db, rt)).pl, null);
  }));

  await t.test('refused in words: not a string, too long, on an OWNED trip, an unknown key; the base CHECK behind them', () => scenario(db, async () => {
    const p1 = await partner();
    const rt = N((await one(db, `SELECT t115_put($1, $2::jsonb) AS id`, [await pc(), JSON.stringify({ trip_type: 'PARTNER', partner_id: p1, partner_rate: 300 })])).id);
    // the fixture rows first: a refused act may leave the rules immediate for the rest of the transaction
    const pcOwn = await pc(), pcOwn2 = await pc();
    const own = N((await one(db, `SELECT t115_put($1, jsonb_build_object('trip_type', 'OWNED', 'truck_id', t115_truck())) AS id`, [pcOwn])).id);
    await db.exec('SAVEPOINT s');
    assert.match(await errUpd(db, rt, { partner_plates: 5 }) ?? '', /bad_input:partner_plates$/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    assert.match(await errUpd(db, rt, { partner_plates: 'A'.repeat(41) }) ?? '', /bad_input:partner_plates:length/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    assert.match(await errUpd(db, rt, { partner_driver: 'B'.repeat(81) }) ?? '', /bad_input:partner_driver:length/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    assert.match(await errUpd(db, rt, { partner_platez: 'X' }) ?? '', /partner_platez/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    assert.match(await errUpd(db, own, { partner_plates: 'X 1' }) ?? '', /bad_input:partner_plates on OWNED/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    assert.match(await errorOf(db, `SELECT t115_put($1, $2::jsonb)`, [pcOwn2, JSON.stringify({ trip_type: 'OWNED', truck_id: N((await one(db, 'SELECT t115_truck() id')).id), partner_driver: 'X' })]) ?? '',
      /bad_input:partner_plates on OWNED/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    // another writer (not plan_*) meets the rule in the base
    assert.match(await errorOf(db, `UPDATE ct_round_trips SET partner_plates = 'X' WHERE id = $1`, [own]) ?? '', /rt_partner_text_partner/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    assert.match(await errorOf(db, `UPDATE ct_round_trips SET partner_plates = ' X' WHERE id = $1`, [rt]) ?? '', /rt_partner_text_shape/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
  }));

  await t.test('the text follows the company: another partner empties it unless the same change sets it; OWNED empties both', () => scenario(db, async () => {
    const p1 = await partner(), p2 = await partner();
    const rt = N((await one(db, `SELECT t115_put($1, $2::jsonb) AS id`, [await pc(), JSON.stringify({
      trip_type: 'PARTNER', partner_id: p1, partner_rate: 300, partner_plates: 'P1 111', partner_driver: 'D1' })])).id);
    await upd(db, rt, { partner_id: p2 });
    assert.deepStrictEqual(await trip(db, rt), { trip_type: 'PARTNER', partner_id: p2, pl: null, pd: null });
    await upd(db, rt, { partner_id: p1, partner_plates: 'P1 222' });
    assert.deepStrictEqual(await trip(db, rt), { trip_type: 'PARTNER', partner_id: p1, pl: 'P1 222', pd: null });
    const tk = N((await one(db, 'SELECT t115_truck() id')).id);
    await upd(db, rt, { trip_type: 'OWNED', truck_id: tk, partner_id: null, partner_rate: null });
    assert.deepStrictEqual(await trip(db, rt), { trip_type: 'OWNED', partner_id: null, pl: null, pd: null });
    const cy = await boardCycle(db, rt);
    assert.deepStrictEqual([cy.partner_plates, cy.partner_driver], [null, null]);
  }));

  await t.test('the rollback refuses while a trip holds a text; its dry run keeps nothing; then it puts everything back', async () => {
    const p1 = await partner();
    const rt = N((await one(db, `SELECT t115_put($1, $2::jsonb) AS id`, [await pc(), JSON.stringify({
      trip_type: 'PARTNER', partner_id: p1, partner_rate: 300, partner_plates: 'KEEP 1' })])).id);
    assert.match(await errorOf(db, read(`${P}_rollback.sql`)) ?? '', /1 trips hold partner plates or a partner driver/);
    await db.exec(`UPDATE ct_round_trips SET partner_plates = NULL WHERE id = ${rt}`);
    const before = await state(db);
    const msg = await errorOf(db, read(`${P}_rollback_dryrun.sql`));
    assert.match(msg ?? '', /DRY RUN 115 ROLLBACK finished - EVERYTHING UNDONE/, msg);
    assert.ok(msg.includes(`columns 0, checks 0, trigger 0, helper 0, upd ${c.m_upd_live}, cre ${c.m_cre_live}, brd ${c.m_brd_live}, B-54 ${live.trg} of ${live.trg}`), msg);
    assert.deepStrictEqual(await state(db), before);
    assert.strictEqual(await errorOf(db, read(`${P}_rollback.sql`)), null);
    assert.deepStrictEqual(await state(db), live, 'every text, right and count as before 115');
    assert.match(await errorOf(db, read(`${P}_rollback.sql`)) ?? '', /115 has not run, nothing to reverse/);
  });

  await t.test('after the rollback 115 runs again (the reverse is complete)', async () => {
    assert.strictEqual(await errorOf(db, read(`${P}.sql`)), null);
    assert.strictEqual((await state(db)).upd, c.m_upd_gen);
  });
});
