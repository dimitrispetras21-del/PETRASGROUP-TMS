// 075 (the side of a national order is stored; live bug 28/10, order #17) on the production-shaped PGlite copy AFTER
// day L (prod-shaped-074.mjs: 073 + 073b + 074a + 074 + 074b, as production holds them 28/10). Each case checks ROWS:
// national_orders.direction and the waiting[] item of plan_board, never only the answer of the call.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql, p) { try { await db.query(sql, p); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
const SIGS = ['public.plan_orders_create(jsonb,text,text)', 'public.plan_order_update(jsonb,text,text)', 'public.plan_board(date,text)'];
const md5s = async (db) => (await db.query(`SELECT string_agg(md5(prosrc), ',' ORDER BY s.o) AS m FROM unnest($1::text[]) WITH ORDINALITY s(sig, o)
  JOIN pg_proc p ON p.oid = to_regprocedure(s.sig)`, [SIGS])).rows[0].m;
const ARROW = { KATHODOS: 'North→South', ANODOS: 'South→North' };

// A national order between two Greek places (no Veroia on either end: the hub cannot tell its side), day d; week =
// the TMS week (Saturday) that holds it, as plan_board asks.
async function scene(db) {
  const r = await one(db, `WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Athens')::date + 20 AS d)
    SELECT d::text AS day, (d - ((extract(isodow FROM d)::int + 1) % 7))::text AS week, (d + time '06:00') AT TIME ZONE 'Europe/Athens' AS lf, (d + time '08:00') AT TIME ZONE 'Europe/Athens' AS lt,
           (d + time '12:00') AT TIME ZONE 'Europe/Athens' AS df, (d + time '14:00') AT TIME ZONE 'Europe/Athens' AS dt FROM d`);
  r.la = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec075A', 'TEST 075 A') RETURNING id`)).id;
  r.lb = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec075B', 'TEST 075 B') RETURNING id`)).id;
  r.cl = (await one(db, `INSERT INTO clients (company_name) VALUES ('TEST 075 client') RETURNING id`)).id;
  r.order = (extra = {}) => ({ client_id: r.cl, price: 100, reference: 'WN075-TEST', goods: 'TEST',
    shipments: [{ origin_location_id: r.la, dest_location_id: r.lb, pallets: 6, load_from: r.lf, load_to: r.lt, deliver_from: r.df, deliver_to: r.dt }], ...extra });
  return r;
}
const create = (db, orders, extra = {}) => db.query(`SELECT plan_orders_create($1::jsonb, 'test:075', 'dispatcher') AS r`,
  [JSON.stringify({ request_id: crypto.randomUUID(), orders, ...extra })]).then((x) => x.rows[0].r);
const dirOf = async (db, id) => (await one(db, `SELECT direction FROM national_orders WHERE id = $1`, [id])).direction;
async function boardItem(db, day, natOrderId) {
  const b = (await one(db, `SELECT plan_board($1::date, 'owner') AS b`, [day])).b;
  return (b.waiting || []).find((w) => Number(w.nat_order_id) === Number(natOrderId));
}

test('075 on the production-shaped copy after day L', async (t) => {
  const db = await prodShaped074();
  const live = await md5s(db);
  const trg0 = Number((await one(db, TRG)).n);
  const S = await scene(db);

  await t.test('the copy holds the LIVE texts 075 guards on (production 28/10)', async () => {
    const src = read('075_plan_order_side.sql');
    const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
    const want = [...part0.matchAll(/'([0-9a-f]{32})'/g)].map((m) => m[1]).join(',');
    assert.strictEqual(live, want);
  });

  let before;
  await t.test('before 075: the side is lost (the bug, measured)', async () => {
    const e = await errorOf(db, `SELECT plan_orders_create($1::jsonb, 'test:075', 'dispatcher')`,
      [JSON.stringify({ request_id: crypto.randomUUID(), orders: [S.order({ direction: 'ANODOS' })] })]);
    assert.strictEqual(e?.hint, 'plan:bad_input', 'today an unknown key is refused: the form cannot even send it');
    before = (await create(db, [S.order()])).ids.nat_order_ids[0];
    assert.strictEqual(await dirOf(db, before), null);
  });

  await t.test('075 dry run keeps nothing', async () => {
    let msg = null;
    try { await db.exec(read('075_plan_order_side_dryrun.sql')); } catch (e) { msg = String(e.message); }
    assert.match(msg ?? '', /DRY RUN 075 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}075 ran: helpers yes, create b0c6b0ac835066e1c21c99c9aee7604c, update b614c9b9d45a1b4d7345ca811e1d3e7c, board 670f72f60edcf09f955fb1f6a74143b9/, msg);
    assert.strictEqual(await md5s(db), live);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_h_side_dir(text)')::text AS r`)).r, null);
  });

  await t.test('075 applies; verify: in place, texts as generated, helpers closed, the Worker keeps EXECUTE; no trigger', async () => {
    await db.exec(read('075_plan_order_side.sql'));
    const v = await one(db, read('075_plan_order_side_verify.sql'));
    assert.strictEqual(v.applied, '075 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(Number(v.open_helpers), 0);
    assert.strictEqual(v.worker_execute, true);
    assert.strictEqual(Number((await one(db, TRG)).n), trg0);
  });

  await t.test('D1/D2: the side is stored in the column\'s vocabulary and the board shows it (no hub on either end)', async () => {
    for (const side of ['ANODOS', 'KATHODOS']) {
      const id = (await create(db, [S.order({ direction: side })])).ids.nat_order_ids[0];
      assert.strictEqual(await dirOf(db, id), ARROW[side], side);
      const w = await boardItem(db, S.week, id);
      assert.ok(w, `${side}: the order waits on the board`);
      assert.strictEqual(w.direction, side, side);
    }
  });

  await t.test('D3: without direction (an old caller) the column stays NULL and the board says null, never a guess', async () => {
    const id = (await create(db, [S.order()])).ids.nat_order_ids[0];
    assert.strictEqual(await dirOf(db, id), null);
    const w = await boardItem(db, S.week, id);
    assert.ok(w && 'direction' in w && w.direction === null);
  });

  await t.test('D4: a side that is not KATHODOS / ANODOS (or null) is refused by name; nothing is written', async () => {
    const n0 = Number((await one(db, `SELECT count(*) AS n FROM national_orders`)).n);
    for (const bad of ['NORTH', 'anodos', null, 1]) {
      const e = await errorOf(db, `SELECT plan_orders_create($1::jsonb, 'test:075', 'dispatcher')`,
        [JSON.stringify({ request_id: crypto.randomUUID(), orders: [S.order({ direction: bad })] })]);
      assert.strictEqual(e?.hint, 'plan:bad_input', JSON.stringify(bad));
      assert.match(e.msg, /order\.direction/);
    }
    assert.strictEqual(Number((await one(db, `SELECT count(*) AS n FROM national_orders`)).n), n0);
  });

  await t.test('D5: with a target the side must be the target\'s side', async () => {
    const trk = (await one(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-075-1') RETURNING id`)).id;
    const target = { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'ANODOS' };
    const stops = [{ ref: 'a', location_id: S.la, side: 'ANODOS', planned_from: S.lf, planned_to: S.lt },
                   { ref: 'b', location_id: S.lb, side: 'ANODOS', planned_from: S.df, planned_to: S.dt }];
    const e = await errorOf(db, `SELECT plan_orders_create($1::jsonb, 'test:075', 'dispatcher')`,
      [JSON.stringify({ request_id: crypto.randomUUID(), orders: [S.order({ direction: 'KATHODOS' })], target, stops })]);
    assert.strictEqual(e?.hint, 'plan:bad_input');
    const r = await create(db, [S.order({ direction: 'ANODOS' })], { target, stops });
    assert.strictEqual(await dirOf(db, r.ids.nat_order_ids[0]), ARROW.ANODOS);
  });

  await t.test('D6: the edit form corrects the side (the repair of #17); a bad side is refused, nothing changes', async () => {
    const upd = (set) => db.query(`SELECT plan_order_update($1::jsonb, 'test:075', 'dispatcher') AS r`, [JSON.stringify({ nat_order_id: before, set })]);
    await upd({ direction: 'ANODOS' });
    assert.strictEqual(await dirOf(db, before), ARROW.ANODOS);
    assert.strictEqual((await boardItem(db, S.week, before)).direction, 'ANODOS');
    const a = await one(db, `SELECT after_data FROM audit_log WHERE table_name = 'national_orders' ORDER BY id DESC LIMIT 1`);
    assert.strictEqual(a.after_data.direction, ARROW.ANODOS, 'one audit row says what changed');
    const e = await errorOf(db, `SELECT plan_order_update($1::jsonb, 'test:075', 'dispatcher')`, [JSON.stringify({ nat_order_id: before, set: { direction: 'UP' } })]);
    assert.strictEqual(e?.hint, 'plan:bad_input');
    assert.match(e.msg, /set\.direction/);
    assert.strictEqual(await dirOf(db, before), ARROW.ANODOS);
  });

  await t.test('the 072 and 072b rules tests still pass on top of 075', async () => {
    for (const [f, re] of [['072_plan_functions_test.sql', /RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, 0 FAIL/],
      ['072b_plan_vehicle_segments_test.sql', /RULES TEST 072b finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, 0 FAIL/]]) {
      // their fixtures write VS rows by hand: with day L the bridge trigger would bridge them first (as in plan-074)
      await db.exec('BEGIN; DELETE FROM plan_config;');
      let msg = null;
      try { await db.exec(read(f)); } catch (e) { msg = String(e.message); }
      await db.exec('ROLLBACK');
      assert.match(msg ?? '', re, `${f}: ${msg?.slice(0, 300)}`);
    }
  });

  await t.test('075 rollback: the three texts back byte for byte, helpers gone, stored sides stay; then 075 again', async () => {
    await db.exec(read('075_plan_order_side_rollback.sql'));
    assert.strictEqual(await md5s(db), live);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_h_dir_side(text)')::text AS r`)).r, null);
    assert.strictEqual(await dirOf(db, before), ARROW.ANODOS, 'the user\'s data stays');
    await db.exec(read('075_plan_order_side.sql'));
    assert.strictEqual((await one(db, read('075_plan_order_side_verify.sql'))).applied, '075 in place');
  });
});
