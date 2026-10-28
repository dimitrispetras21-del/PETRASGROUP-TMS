// 080 (F1/F4 of the real-user test, owner 28/10: price and pallets optional) on the production-shaped PGlite copy as
// production holds it on 28/10 (prod-shaped-075.mjs + 076 + 077: plan_order_read exists live, measured 28/10 - the
// pallets a desk writes on a riding point go through 077's plan_order_update). Every case reads ROWS: national_orders, shipments,
// shipment_pieces, pl_movements, the money views and the auditor's B-100 / B-90 - never only the answer of a call.
// Synthetic rows only (TEST 080 ..., references WN080-...).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped075 } from './prod-shaped-075.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const n = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql, p) { try { await db.query(sql, p); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
const SRC = '080_plan_optional_price_pallets.sql';
const SIGS = ['public.plan_orders_create(jsonb,text,text)', 'public.plan_h_order_summary(jsonb)', 'public.plan_shipment_problem(bigint)',
  'public.plan_h_resize(bigint,numeric,text,text)', 'public.plan_h_put(jsonb,jsonb,text,text,bigint[])', 'public.plan_split_piece(jsonb,text,text)',
  'public.plan_h_pallet_sync(bigint[],text,text)'];
const md5s = async (db) => (await db.query(`SELECT string_agg(md5(prosrc), ',' ORDER BY s.o) AS m FROM unnest($1::text[]) WITH ORDINALITY s(sig, o)
  JOIN pg_proc p ON p.oid = to_regprocedure(s.sig)`, [SIGS])).rows[0].m;
const cols = async (db, v) => (await one(db, `SELECT string_agg(attname, ',' ORDER BY attnum) AS c FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0`, [v])).c;
// what the auditor's runner sees (B-90 / B-100), as monitoring.run_checks runs them
async function check(db, id) {
  const c = await one(db, `SELECT sql_text, ids_sql FROM monitoring.checks WHERE id = $1`, [id]);
  await db.exec('SET ROLE tms_check_runner');
  try { return { n: Number(Object.values((await db.query(c.sql_text)).rows[0])[0]), ids: Object.values((await db.query(c.ids_sql)).rows[0])[0] }; }
  finally { await db.exec('RESET ROLE'); }
}

// Two places, a client, a truck; the day d (+20, Athens) and its TMS week.
async function scene(db) {
  const r = await one(db, `WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Athens')::date + 20 AS d)
    SELECT d::text AS day, (d - ((extract(isodow FROM d)::int + 1) % 7))::text AS week, (d + time '06:00') AT TIME ZONE 'Europe/Athens' AS lf, (d + time '08:00') AT TIME ZONE 'Europe/Athens' AS lt,
           (d + time '12:00') AT TIME ZONE 'Europe/Athens' AS df, (d + time '14:00') AT TIME ZONE 'Europe/Athens' AS dt FROM d`);
  r.la = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec080A', 'TEST 080 A') RETURNING id`)).id;
  r.lb = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec080B', 'TEST 080 B') RETURNING id`)).id;
  r.lc = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec080C', 'TEST 080 C') RETURNING id`)).id;
  r.hub = (await one(db, `SELECT id FROM locations WHERE is_hub`)).id;
  r.cl = (await one(db, `INSERT INTO clients (company_name) VALUES ('TEST 080 client') RETURNING id`)).id;
  // a truck per new cycle: two cycles of one truck at the same hours are truck_busy (071b)
  let k = 0;
  r.truck = async () => (await one(db, `INSERT INTO trucks (license_plate) VALUES ($1) RETURNING id`, ['TEST-080-' + (++k)])).id;
  r.ship = (extra = {}) => ({ origin_location_id: r.la, dest_location_id: r.lb, pallets: 6, load_from: r.lf, load_to: r.lt, deliver_from: r.df, deliver_to: r.dt, ...extra });
  r.order = (extra = {}, ships) => ({ client_id: r.cl, price: 100, reference: 'WN080-TEST', goods: 'TEST', direction: 'KATHODOS', pallet_exchange: false,
    shipments: ships || [r.ship()], ...extra });
  return r;
}
const call = (db, fn, body) => db.query(`SELECT ${fn}($1::jsonb, 'test:080', 'dispatcher') AS r`, [JSON.stringify(body)]).then((x) => x.rows[0].r);
const create = (db, orders, extra = {}) => call(db, 'plan_orders_create', { request_id: crypto.randomUUID(), orders, ...extra });
const tgt = (S, trk) => ({ target: { new_rt: { trip_type: 'OWNED', truck_id: trk }, side: 'KATHODOS' },
  stops: [{ ref: 'a', location_id: S.la, side: 'KATHODOS', planned_from: S.lf, planned_to: S.lt },
          { ref: 'b', location_id: S.lb, side: 'KATHODOS', planned_from: S.df, planned_to: S.dt }] });

test('080 on the production-shaped copy (28/10)', async (t) => {
  const db = await prodShaped075();
  await db.exec(read('076_plan_board_speed.sql'));
  await db.exec(read('077_plan_order_edit.sql'));
  // the seed of the copy is the whole catalog (B-100's file included): 080 seeds its own check
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  const live = await md5s(db);
  const trg0 = Number((await one(db, TRG)).n);
  const S = await scene(db);

  await t.test('the copy holds the LIVE texts 080 guards on (075 measured create on production)', async () => {
    const src = read(SRC);
    const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
    assert.strictEqual(live, [...part0.matchAll(/'([0-9a-f]{32})'\)/g)].map((m) => m[1]).join(','));
    assert.ok(live.startsWith('b0c6b0ac835066e1c21c99c9aee7604c'), 'plan_orders_create = the text 075 left on production');
  });

  await t.test('before 080: no price and no pallets are refused (F1/F4, measured)', async () => {
    let e = await errorOf(db, `SELECT plan_orders_create($1::jsonb, 'test:080', 'dispatcher')`, [JSON.stringify({ request_id: crypto.randomUUID(), orders: [S.order({ price: null })] })]);
    assert.strictEqual(e?.hint, 'plan:no_price');
    e = await errorOf(db, `SELECT plan_orders_create($1::jsonb, 'test:080', 'dispatcher')`, [JSON.stringify({ request_id: crypto.randomUUID(), orders: [S.order({}, [S.ship({ pallets: null })])] })]);
    assert.match(e?.msg ?? '', /shipments_shape|null value/, 'pallets null: refused by 071');
  });

  await t.test('080 dry run keeps nothing', async () => {
    let msg = null;
    try { await db.exec(read('080_plan_optional_price_pallets_dryrun.sql')); } catch (e) { msg = String(e.message); }
    assert.match(msg ?? '', /DRY RUN 080 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}080 ran: pallets nullable yes, B-100 yes, create [0-9a-f]{32}, pnl last column v5_revenue_missing/, msg);
    assert.strictEqual(await md5s(db), live);
    assert.strictEqual(await n(db, `SELECT count(*) FROM monitoring.checks WHERE id = 'B-100'`), 0);
    assert.strictEqual((await one(db, `SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'pallets'`)).attnotnull, true);
  });

  await t.test('a money view with options (reloptions) stops 080: CREATE OR REPLACE would drop them in silence', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec('ALTER VIEW public.ct_v_rt_pnl SET (security_barrier = true)');
      let msg = null;
      try { await db.exec(read(SRC)); } catch (e) { msg = String(e.message); }
      assert.match(msg ?? '', /a money view has options \(reloptions\) that CREATE OR REPLACE would drop/);
    } finally { await db.exec('ROLLBACK'); }
    assert.strictEqual(await md5s(db), live);
  });

  let fp0;
  await t.test('080 applies; verify: in place, texts as generated, the flags, B-100 on; no trigger; v5 money unchanged', async () => {
    fp0 = (await one(db, `SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.piece_id, x.leg_id)) AS m FROM ct_v_v5_revenue x`)).m;
    const r = await db.exec(read(SRC));
    assert.strictEqual(r.at(-1).rows[0].result, '080 OK');
    const v = await one(db, read('080_plan_optional_price_pallets_verify.sql'));
    assert.strictEqual(v.applied, '080 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    for (const k of ['pallets_nullable', 'pieces_check', 'shape_check', 'pnl_flag', 'b100_on', 'worker_execute']) assert.strictEqual(v[k], true, k);
    assert.strictEqual(Number((await one(db, TRG)).n), trg0);
    assert.strictEqual((await one(db, `SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.piece_id, x.leg_id)) AS m FROM ct_v_v5_revenue x`)).m, fp0);
    assert.strictEqual(await cols(db, 'ct_v_rt_revenue'), 'rt_id,revenue,revenue_intl,revenue_natl,revenue_missing');
    assert.ok((await cols(db, 'ct_v_rt_pnl')).endsWith(',partner_rate_missing,v5_revenue_missing'));
  });

  let noPrice, noPal;
  await t.test('P1 (F4): no price = NULL, never 0; B-90 lists it; a written price is still > 0', async () => {
    noPrice = (await create(db, [S.order({ price: null })])).ids.nat_order_ids[0];
    const absent = (await create(db, [(({ price, ...o }) => o)(S.order())])).ids.nat_order_ids[0];
    for (const id of [noPrice, absent]) assert.strictEqual((await one(db, `SELECT price FROM national_orders WHERE id = $1`, [id])).price, null);
    const b90 = await check(db, 'B-90');
    assert.ok(b90.n >= 2, 'B-90 lists the orders without a price');
    for (const bad of [0, -5, 'NaN', 'Infinity']) {
      const e = await errorOf(db, `SELECT plan_orders_create($1::jsonb, 'test:080', 'dispatcher')`, [JSON.stringify({ request_id: crypto.randomUUID(), orders: [S.order({ price: bad })] })]);
      assert.strictEqual(e?.hint, 'plan:no_price', JSON.stringify(bad));
    }
  });

  await t.test('P2 (F1): no pallets = NULL on the shipment, its ONE piece and the order; B-100 lists it', async () => {
    noPal = (await create(db, [S.order({}, [S.ship({ pallets: null })])])).ids;
    const sh = await one(db, `SELECT pallets FROM shipments WHERE id = $1`, [noPal.shipment_ids[0]]);
    const pc = await db.query(`SELECT pallets, parent_piece_id FROM shipment_pieces WHERE shipment_id = $1 AND deleted_at IS NULL`, [noPal.shipment_ids[0]]);
    assert.strictEqual(sh.pallets, null);
    assert.deepStrictEqual(pc.rows, [{ pallets: null, parent_piece_id: null }]);
    assert.strictEqual((await one(db, `SELECT pallets FROM national_orders WHERE id = $1`, [noPal.nat_order_ids[0]])).pallets, null);
    const b = await check(db, 'B-100');
    assert.strictEqual(b.n, 1);
    assert.strictEqual(b.ids.length, 1);
    // the board carries the piece with pallets null (the screen draws «;π»), never 0
    const w = (await one(db, `SELECT plan_board($1::date, 'owner') AS b`, [S.week])).b.waiting.find((x) => Number(x.piece_id) === Number(noPal.piece_ids[0]));
    assert.ok(w && 'pallets' in w && w.pallets === null, JSON.stringify(w));
  });

  await t.test('P3: one known + one unknown shipment = the order\'s pallets NULL (never a partial sum)', async () => {
    const id = (await create(db, [S.order({}, [S.ship({ pallets: 4 }), S.ship({ dest_location_id: S.lc, pallets: null })])])).ids.nat_order_ids[0];
    assert.strictEqual((await one(db, `SELECT pallets FROM national_orders WHERE id = $1`, [id])).pallets, null);
    const k = (await create(db, [S.order({}, [S.ship({ pallets: 4 }), S.ship({ dest_location_id: S.lc, pallets: 2.5 })])])).ids.nat_order_ids[0];
    assert.strictEqual(Number((await one(db, `SELECT pallets FROM national_orders WHERE id = $1`, [k])).pallets), 6.5, 'known: the sum as before');
  });

  await t.test('P4: the schema holds it - a NULL piece is only a root never split; a known shipment never has a NULL piece', async () => {
    const pid = noPal.piece_ids[0];
    await db.exec('BEGIN');
    try {
      const e = await errorOf(db, `INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES ($1, $2, NULL, 'test')`, [noPal.shipment_ids[0], pid]);
      assert.match(e?.msg ?? '', /pieces_pallets/);
    } finally { await db.exec('ROLLBACK'); }
    const known = (await create(db, [S.order()])).ids;
    await db.exec('BEGIN');
    try {
      await db.query(`UPDATE shipment_pieces SET pallets = NULL WHERE id = $1`, [known.piece_ids[0]]);
      const e = await errorOf(db, 'COMMIT');
      assert.match(e?.msg ?? '', /pieces_sum/, 'known shipment, NULL piece: refused at COMMIT');
    } finally { await db.exec('ROLLBACK').catch(() => {}); }
    assert.strictEqual(Number((await one(db, `SELECT pallets FROM shipment_pieces WHERE id = $1`, [known.piece_ids[0]])).pallets), 6);
  });

  await t.test('P5: an unknown piece is not split and gives no «how many»', async () => {
    // a national loading at Veroia waits AT the hub: the one place a piece splits
    const h = (await create(db, [S.order({}, [S.ship({ origin_location_id: S.hub, pallets: null })])])).ids;
    let e = await errorOf(db, `SELECT plan_split_piece($1::jsonb, 'test:080', 'dispatcher')`,
      [JSON.stringify({ request_id: crypto.randomUUID(), piece_id: h.piece_ids[0], parts: [{ pallets: 2 }, { pallets: 3 }] })]);
    assert.strictEqual(e?.hint, 'plan:parts_sum', JSON.stringify(e));
    assert.match(e.msg, /pallets unknown/);
    e = await errorOf(db, `SELECT plan_put_pieces($1::jsonb, 'test:080', 'dispatcher')`,
      [JSON.stringify({ pieces: [{ piece_id: h.piece_ids[0], take_pallets: 2 }], ...tgt(S, await S.truck()),
        stops: [{ ref: 'a', location_id: S.hub, side: 'KATHODOS', planned_from: S.lf, planned_to: S.lt }, { ref: 'b', location_id: S.lb, side: 'KATHODOS', planned_from: S.df, planned_to: S.dt }] })]);
    assert.strictEqual(e?.hint, 'plan:parts_sum');
    assert.match(e.msg, /pallets unknown/);
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipment_pieces WHERE shipment_id = $1`, [h.shipment_ids[0]]), 1, 'nothing split');
  });

  let rtUnk, unkPe;
  await t.test('P6: an unknown piece rides whole; PE writes no ledger row until the pallets are known, then it does', async () => {
    const r = await create(db, [S.order({ pallet_exchange: true }, [S.ship({ pallets: null })])], tgt(S, await S.truck()));
    rtUnk = r.ids.rt_id; unkPe = r.ids;
    assert.strictEqual(r.ids.leg_ids.length, 1, 'the piece is on the truck');
    assert.strictEqual(await n(db, `SELECT count(*) FROM pl_movements WHERE piece_leg_id = ANY($1::bigint[])`, [r.ids.leg_ids]), 0, 'no ledger row for unknown pallets');
    await call(db, 'plan_order_update', { nat_order_id: r.ids.nat_order_ids[0], shipments: [{ shipment_id: r.ids.shipment_ids[0], pallets: 7 }] });
    assert.strictEqual(Number((await one(db, `SELECT pallets FROM shipment_pieces WHERE id = $1`, [r.ids.piece_ids[0]])).pallets), 7, 'the one piece takes them');
    assert.strictEqual(Number((await one(db, `SELECT pallets FROM national_orders WHERE id = $1`, [r.ids.nat_order_ids[0]])).pallets), 7);
    const m = await db.query(`SELECT event_type, taken, given, status FROM pl_movements WHERE piece_leg_id = ANY($1::bigint[]) ORDER BY event_type`, [r.ids.leg_ids]);
    assert.ok(m.rows.length >= 1 && m.rows.every((x) => x.status === 'pending'), JSON.stringify(m.rows));
    assert.ok(m.rows.some((x) => x.event_type === 'LOADING' && Number(x.taken) === 7), JSON.stringify(m.rows));
    const a = await one(db, `SELECT before_data, after_data FROM audit_log WHERE table_name = 'shipment_pieces' AND record_id = $1 ORDER BY id DESC LIMIT 1`, [String(r.ids.piece_ids[0])]);
    assert.deepStrictEqual([a.before_data, a.after_data], [{ pallets: null }, { pallets: 7 }], 'one audit row says what changed');
  });

  await t.test('P7: known -> unknown is refused (pieces_sum at COMMIT), nothing changes', async () => {
    const e = await errorOf(db, `SELECT plan_order_update($1::jsonb, 'test:080', 'dispatcher')`,
      [JSON.stringify({ nat_order_id: unkPe.nat_order_ids[0], shipments: [{ shipment_id: unkPe.shipment_ids[0], pallets: null }] })]);
    assert.ok(e, 'refused');
    assert.match(`${e.hint} ${e.msg}`, /pieces_sum/);
    assert.strictEqual(Number((await one(db, `SELECT pallets FROM shipments WHERE id = $1`, [unkPe.shipment_ids[0]])).pallets), 7);
  });

  await t.test('P8 money: a cycle carrying an order without a price is FLAGGED in the P&L (never read as complete)', async () => {
    const r = await create(db, [S.order({ price: null })], tgt(S, await S.truck()));
    const x = await db.query(`SELECT amount, total FROM ct_v_v5_revenue WHERE nat_order_id = $1`, [r.ids.nat_order_ids[0]]);
    assert.deepStrictEqual(x.rows, [{ amount: null, total: null }], 'its share is NULL (unknown), not 0');
    const rev = await one(db, `SELECT revenue_missing FROM ct_v_rt_revenue WHERE rt_id = $1`, [r.ids.rt_id]);
    assert.strictEqual(rev.revenue_missing, true);
    const p = await one(db, `SELECT v5_revenue_missing, revenue FROM ct_v_rt_pnl WHERE id = $1`, [r.ids.rt_id]);
    assert.strictEqual(p.v5_revenue_missing, true);
    // the flag names a NATIONAL share only (code review xhigh r3): a VS stock-charge row ('x') without a charge setting is
    // not «a national order without price or pallets»
    assert.match((await one(db, `SELECT pg_get_viewdef('public.ct_v_rt_revenue'::regclass) AS d`)).d, /amount IS NULL\) AND \(x\.kind = 'price'::text\)\) AS missing/);
    // the price written later: the flag goes, the revenue is the price
    await call(db, 'plan_order_update', { nat_order_id: r.ids.nat_order_ids[0], set: { price: 250 } });
    const p2 = await one(db, `SELECT v5_revenue_missing, revenue FROM ct_v_rt_pnl WHERE id = $1`, [r.ids.rt_id]);
    assert.deepStrictEqual([p2.v5_revenue_missing, Number(p2.revenue)], [false, 250]);
  });

  await t.test('P9 money: unknown pallets - one shipment takes the whole price; two shipments with one unknown are NULL and flagged', async () => {
    const one1 = await create(db, [S.order({ price: 300 }, [S.ship({ pallets: null })])], tgt(S, await S.truck()));
    assert.strictEqual(Number((await one(db, `SELECT amount FROM ct_v_v5_revenue WHERE nat_order_id = $1`, [one1.ids.nat_order_ids[0]])).amount), 300);
    assert.strictEqual((await one(db, `SELECT v5_revenue_missing FROM ct_v_rt_pnl WHERE id = $1`, [one1.ids.rt_id])).v5_revenue_missing, false);
    const two = await create(db, [S.order({ price: 300 }, [S.ship({ pallets: 4 }), S.ship({ dest_location_id: S.lc, pallets: null })])]);
    const a = await db.query(`SELECT amount FROM ct_v_v5_revenue WHERE nat_order_id = $1`, [two.ids.nat_order_ids[0]]);
    assert.deepStrictEqual(a.rows.map((x) => x.amount), [null, null], 'no share is guessed');
    assert.strictEqual(rtUnk != null, true);
  });

  await t.test('P9b money (code review xhigh): a stock-lot national keeps its 0 share (057 holds its price NULL on purpose), no flag', async () => {
    // an international intake of 33 pallets at A, delivered (the lot's stock, as 073's case 30)
    const q = (await one(db, `INSERT INTO orders (legacy_id, order_type, direction, status, client_id, price, loading_datetime, delivery_datetime,
      unloading_location_1_id, loading_pallets_1, reference)
      VALUES ('rec080TO1', 'International', 'Import', 'Delivered', $1, 900, $2::date - 9, $2::date - 6, $3, 33, 'WN080-TEST') RETURNING id`, [S.cl, S.day, S.la])).id;
    const lot = (await one(db, `INSERT INTO stock_lots (legacy_id, order_id) VALUES ('rec080TL1', $1) RETURNING id`, [q])).id;
    const x = (await one(db, `INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, stock_lot_id)
      VALUES ('rec080TN1', $1, 'WN080-TEST', NULL, 10, $2) RETURNING id`, [S.cl, lot])).id;
    await db.query(`UPDATE national_orders SET pickup_location_1_id = $2 WHERE id = $1`, [x, S.la]);
    await db.exec('BEGIN');   // shipment and piece in one transaction: 071's pieces_sum is checked at COMMIT
    let pc;
    try {
      const sh = (await one(db, `INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from, deliver_to, created_by)
        VALUES ($1, $2, $3, 10, $4, $5, $6, $7, 'test:080') RETURNING id`, [x, S.la, S.lb, S.lf, S.lt, S.df, S.dt])).id;
      pc = (await one(db, `INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES ($1, 10, 'test:080') RETURNING id`, [sh])).id;
      await db.exec('COMMIT');
    } catch (e) { await db.exec('ROLLBACK').catch(() => {}); throw e; }
    const r = await call(db, 'plan_put_pieces', { pieces: [{ piece_id: pc }], ...tgt(S, await S.truck()) });
    assert.strictEqual(Number((await one(db, `SELECT amount FROM ct_v_v5_revenue WHERE nat_order_id = $1`, [x])).amount), 0);
    assert.strictEqual((await one(db, `SELECT revenue_missing FROM ct_v_rt_revenue WHERE rt_id = $1`, [r.ids.rt_id])).revenue_missing, false);
    // code review xhigh r4: a stock-lot order cannot have unknown pallets at all - 057 refuses it (piece_empty) - so a
    // lot's share is never NULL and never flagged; nothing in 080's views has to cover that case
    const e = await errorOf(db, `INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, stock_lot_id)
      VALUES ('rec080TN2', $1, 'WN080-TEST', NULL, NULL, $2)`, [S.cl, lot]);
    assert.match(e?.msg ?? '', /Κομμάτι χωρίς παλέτες/, JSON.stringify(e));
  });

  await t.test('P10: the auditor\'s money checks stay green (B-79, B-80): a NULL share is not a wrong sum', async () => {
    for (const id of ['B-79', 'B-80']) assert.strictEqual((await check(db, id)).n, 0, id);
  });

  await t.test('P11: as the Worker (service_role) an order without price and pallets is created', async () => {
    // the view rights are 080 PART 5's proof (has_table_privilege): the copy gives service_role no table reads
    await db.exec('SET ROLE service_role');
    let r;
    try { r = await create(db, [S.order({ price: null }, [S.ship({ pallets: null })])]); } finally { await db.exec('RESET ROLE'); }
    assert.strictEqual(r.ids.nat_order_ids.length, 1);
    const o = await one(db, `SELECT price, pallets FROM national_orders WHERE id = $1`, [r.ids.nat_order_ids[0]]);
    assert.deepStrictEqual([o.price, o.pallets], [null, null]);
  });

  await t.test('the 072 / 072b / 073 rules tests on top of 080: only 072 case 19 («no price» refused) changes, by the owner\'s decision', async () => {
    for (const [f, re] of [['072_plan_functions_test.sql', /RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept\. Result: 236 OK, 1 FAIL {2}\|\| .*\| 19 FAIL want plan:no_price got FAIL no error/],
      ['072b_plan_vehicle_segments_test.sql', /RULES TEST 072b finished - EVERYTHING UNDONE, nothing kept\. Result: \d+ OK, 0 FAIL/],
      ['073_plan_money_test.sql', /RULES TEST 073 finished - EVERYTHING UNDONE, nothing kept\. Result: \d+ OK, 0 FAIL/]]) {
      await db.exec('BEGIN; DELETE FROM plan_config;');
      let msg = null;
      try { await db.exec(read(f)); } catch (e) { msg = String(e.message); }
      await db.exec('ROLLBACK');
      assert.match(msg ?? '', re, `${f}: ${msg?.slice(0, 300)}`);
      if (f.startsWith('072_')) assert.strictEqual((msg.match(/FAIL want/g) || []).length, 1, 'exactly one case changes');
    }
  });

  await t.test('080 rollback: a DELETED order of unknown pallets is history - no rollback, fix forward (nothing changes)', async () => {
    const r = await create(db, [S.order({}, [S.ship({ pallets: null })])]);
    await db.exec('BEGIN');
    try {
      await db.query(`UPDATE shipment_pieces SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test' WHERE id = $1`, [r.ids.piece_ids[0]]);
      await db.query(`UPDATE shipments SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test' WHERE id = $1`, [r.ids.shipment_ids[0]]);
      let msg = null;
      try { await db.exec(read('080_plan_optional_price_pallets_rollback.sql')); } catch (e) { msg = String(e.message); }
      assert.match(msg ?? '', /deleted shipment \/ piece row\(s\) keep unknown pallets as history - no rollback, fix forward/);
    } finally { await db.exec('ROLLBACK'); }
    assert.strictEqual((await one(db, read('080_plan_optional_price_pallets_verify.sql'))).applied, '080 in place');
  });

  await t.test('080 rollback: a money view with options stops it before any DROP (nothing changes)', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(`UPDATE shipment_pieces SET pallets = 1 WHERE pallets IS NULL; UPDATE shipments SET pallets = 1 WHERE order_stop_id IS NULL AND pallets IS NULL;
        ALTER VIEW public.ct_v_rt_pnl SET (security_barrier = true)`);
      let msg = null;
      try { await db.exec(read('080_plan_optional_price_pallets_rollback.sql')); } catch (e) { msg = String(e.message); }
      assert.match(msg ?? '', /080 rollback: a money view has options \(reloptions\) the way back would drop/);
    } finally { await db.exec('ROLLBACK'); }
    assert.strictEqual((await one(db, read('080_plan_optional_price_pallets_verify.sql'))).applied, '080 in place');
  });

  await t.test('080 rollback refuses while pallets are unknown; with them written it puts everything back, then 080 again', async () => {
    let msg = null;
    try { await db.exec(read('080_plan_optional_price_pallets_rollback.sql')); } catch (e) { msg = String(e.message); }
    assert.match(msg ?? '', /080 rollback: \d+ shipment \/ piece row\(s\) have unknown pallets - write their pallets first/);
    await db.exec(`UPDATE shipment_pieces SET pallets = 1 WHERE pallets IS NULL; UPDATE shipments SET pallets = 1 WHERE order_stop_id IS NULL AND pallets IS NULL;`);
    await db.exec(read('080_plan_optional_price_pallets_rollback.sql'));
    assert.strictEqual(await md5s(db), live);
    assert.strictEqual(await cols(db, 'ct_v_rt_revenue'), 'rt_id,revenue,revenue_intl,revenue_natl');
    assert.ok((await cols(db, 'ct_v_rt_pnl')).endsWith(',partner_rate_missing'));
    assert.strictEqual((await one(db, `SELECT relacl::text AS a FROM pg_class WHERE oid = 'public.ct_v_rt_pnl'::regclass`)).a.includes('service_role=r'), true, 'rights given back');
    assert.strictEqual((await one(db, `SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.shipment_pieces'::regclass AND attname = 'pallets'`)).attnotnull, true);
    assert.strictEqual(await n(db, `SELECT count(*) FROM monitoring.checks WHERE id = 'B-100'`), 0);
    assert.strictEqual(Number((await one(db, TRG)).n), trg0);
    await db.exec(read(SRC));
    assert.strictEqual((await one(db, read('080_plan_optional_price_pallets_verify.sql'))).applied, '080 in place');
  });
});
