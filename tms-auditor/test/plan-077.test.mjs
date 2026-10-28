// 077 (the edit of a national order is complete; live real-user test 28/10, F13 + F21) on the production-shaped PGlite
// copy after day L and 075 (prod-shaped-074.mjs + 075, as production holds them 28/10). Each case checks ROWS
// (shipments, shipment_pieces, piece_legs, rt_stops, audit_log, national_orders), never only the answer of the call.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number((await one(db, sql, p)).n);
async function errorOf(db, sql, p) { try { await db.query(sql, p); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
const UPD = 'public.plan_order_update(jsonb,text,text)';
const md5u = async (db) => (await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${UPD}'::regprocedure`)).m;
const rid = () => crypto.randomUUID();

// Places A, B, C (no Veroia: a plain national between Greek places), a client, a truck; day d = 20 days ahead,
// week = the TMS week (Saturday) that holds it. t[hh:mm] = the Athens instant of d at that hour.
async function scene(db) {
  const r = await one(db, `WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Athens')::date + 20 AS d)
    SELECT d::text AS d, (d - ((extract(isodow FROM d)::int + 1) % 7))::text AS week FROM d`);
  r.t = {};
  for (const hm of ['00:00', '06:00', '08:00', '12:00', '14:00', '23:59']) {
    r.t[hm] = (await one(db, `SELECT ($1::date + $2::time) AT TIME ZONE 'Europe/Athens' AS t`, [r.d, hm])).t;
  }
  for (const k of ['A', 'B', 'C']) r[k] = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ($1, $2) RETURNING id`, ['rec077' + k, 'TEST 077 ' + k])).id;
  r.cl = (await one(db, `INSERT INTO clients (company_name) VALUES ('TEST 077 client') RETURNING id`)).id;
  r.trk = (await one(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-077-1') RETURNING id`)).id;
  r.ship = (o, d, pallets = 6) => ({ origin_location_id: o, dest_location_id: d, pallets,
    load_from: r.t['06:00'], load_to: r.t['08:00'], deliver_from: r.t['12:00'], deliver_to: r.t['14:00'] });
  // the form's pre-filled whole day (never an invented hour)
  r.day = (o, d, pallets) => ({ origin_location_id: o, dest_location_id: d, pallets,
    load_from: r.t['00:00'], load_to: r.t['23:59'], deliver_from: r.t['00:00'], deliver_to: r.t['23:59'] });
  r.order = (shipments, extra = {}) => ({ client_id: r.cl, price: 100, reference: 'WN077-TEST', goods: 'TEST', notes: 'note 077',
    pallet_exchange: true, direction: 'KATHODOS', shipments, ...extra });
  return r;
}
const create = (db, orders, extra = {}) => db.query(`SELECT plan_orders_create($1::jsonb, 'test:077', 'dispatcher') AS r`,
  [JSON.stringify({ request_id: rid(), orders, ...extra })]).then((x) => x.rows[0].r);
const upd = (db, body, role = 'dispatcher') => db.query(`SELECT plan_order_update($1::jsonb, 'test:077', $2) AS r`, [JSON.stringify(body), role]).then((x) => x.rows[0].r);
const updErr = (db, body) => errorOf(db, `SELECT plan_order_update($1::jsonb, 'test:077', 'dispatcher')`, [JSON.stringify(body)]);
const orderRead = (db, id, role = 'dispatcher') => db.query(`SELECT plan_order_read($1, $2) AS r`, [id, role]).then((x) => x.rows[0].r);
// every row a plan_* can write for one order: the values that must not move when nothing changes. The order row is
// compared as jsonb VALUES: 072 re-sums pallets from numeric(6,1) (6 -> 6.0, the same number, no audit row)
async function footprint(db, natId) {
  return one(db, `SELECT (SELECT count(*) FROM shipments WHERE nat_order_id = $1) AS sh,
      (SELECT count(*) FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id WHERE s.nat_order_id = $1) AS pc,
      (SELECT coalesce(string_agg(l.id || ':' || l.pickup_stop_id || '>' || l.drop_stop_id || ':' || coalesce(l.deleted_at::text, ''), ',' ORDER BY l.id), '')
         FROM piece_legs l JOIN shipment_pieces sp ON sp.id = l.piece_id JOIN shipments s ON s.id = sp.shipment_id WHERE s.nat_order_id = $1) AS legs,
      (SELECT md5(string_agg(to_jsonb(s)::text, ',' ORDER BY s.id)) FROM shipments s WHERE s.nat_order_id = $1) AS ships_md5,
      (SELECT count(*) FROM audit_log) AS audit,
      (SELECT to_jsonb(n) FROM national_orders n WHERE n.id = $1) AS row`, [natId]);
}
const stopsOf = async (db, rt) => (await db.query(`SELECT id, location_id, side, planned_from, planned_to, deleted_at FROM rt_stops WHERE rt_id = $1 ORDER BY id`, [rt])).rows;

test('077 on the production-shaped copy after day L and 075', async (t) => {
  const db = await prodShaped074();
  await db.exec(read('075_plan_order_side.sql'));
  const live = await md5u(db);
  const trg0 = Number((await one(db, TRG)).n);
  const S = await scene(db);
  const src = read('077_plan_order_edit.sql');

  await t.test('the copy holds the LIVE text 077 guards on (075\'s generated text, production 28/10)', async () => {
    const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
    assert.deepStrictEqual([...part0.matchAll(/'([0-9a-f]{32})'/g)].map((m) => m[1]), [live]);
  });

  // The #84 shape: one point A -> B (6 pallets) on a cycle (KATHODOS); and an order of two points that waits.
  const onCycle = await create(db, [S.order([S.ship(S.A, S.B)])], {
    target: { new_rt: { trip_type: 'OWNED', truck_id: S.trk }, side: 'KATHODOS' },
    stops: [{ ref: 'a', location_id: S.A, side: 'KATHODOS', planned_from: S.t['06:00'], planned_to: S.t['08:00'] },
            { ref: 'b', location_id: S.B, side: 'KATHODOS', planned_from: S.t['12:00'], planned_to: S.t['14:00'] }] });
  const N = onCycle.ids.nat_order_ids[0], RT = onCycle.ids.rt_id;
  const W2 = (await create(db, [S.order([S.ship(S.A, S.B, 2), S.ship(S.A, S.C, 3)], { notes: null, reference: null })])).ids.nat_order_ids[0];

  await t.test('before 077: a new point is refused (F21 measured) and no read of one order exists (F13)', async () => {
    const e = await updErr(db, { nat_order_id: N, shipments: [S.day(S.A, S.C, 1)] });
    assert.strictEqual(e?.hint, 'plan:bad_input');
    assert.match(e.msg, /shipment_id/);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_order_read(bigint,text)')::text AS r`)).r, null);
  });

  await t.test('077 dry run keeps nothing', async () => {
    let msg = null;
    try { await db.exec(read('077_plan_order_edit_dryrun.sql')); } catch (e) { msg = String(e.message); }
    assert.match(msg ?? '', /DRY RUN 077 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}077 ran: read yes, update 39d38711b825e3ba698a814aeb53bbcc/, msg);
    assert.strictEqual(await md5u(db), live);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_order_read(bigint,text)')::text AS r`)).r, null);
  });

  await t.test('077 applies; verify: in place, text as generated, read closed, the Worker keeps EXECUTE; no trigger', async () => {
    await db.exec(src);
    const v = await one(db, read('077_plan_order_edit_verify.sql'));
    assert.strictEqual(v.applied, '077 in place');
    assert.strictEqual(Number(v.changed_texts), 0);
    assert.strictEqual(Number(v.open_read), 0);
    assert.strictEqual(v.worker_execute, true);
    assert.deepStrictEqual([Number(v.edit_requests), Number(v.points_added), Number(v.points_removed)], [0, 0, 0]);
    assert.strictEqual(Number((await one(db, TRG)).n), trg0);
    let e = null; try { await db.exec(src); } catch (x) { e = { msg: String(x.message) }; }
    assert.match(e?.msg ?? '', /077: already applied/);
  });

  await t.test('R1 (F13): an order ON a cycle reads every value, to the dispatcher too (price visible, owner 23/8)', async () => {
    const r = await orderRead(db, N, 'dispatcher');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual({ ...r.order, price: Number(r.order.price), pallets: Number(r.order.pallets) }, {
      nat_order_id: N, legacy_id: r.order.legacy_id, client_id: S.cl, client: 'TEST 077 client', price: 100, reference: 'WN077-TEST',
      goods: 'TEST', notes: 'note 077', temperature_c: null, pallet_exchange: true, direction: 'KATHODOS', pallets: 6 });
    assert.match(r.order.legacy_id, /^rec[A-Za-z0-9]{14}$/);
    assert.strictEqual(r.shipments.length, 1);
    const s = r.shipments[0];
    assert.deepStrictEqual([s.origin_location_id, s.dest_location_id, Number(s.pallets), s.rides, s.vs_locked], [S.A, S.B, 6, true, false]);
    assert.strictEqual(Date.parse(s.load_from), Date.parse(S.t['06:00']));
    assert.strictEqual(Date.parse(s.deliver_to), Date.parse(S.t['14:00']));
    const code = (await one(db, `SELECT code FROM ct_round_trips WHERE id = $1`, [RT])).code;
    assert.deepStrictEqual(s.rt_codes, [code]);
  });

  await t.test('R2: a waiting order: rides false, no cycle; an empty field is a JSON null, never a missing key', async () => {
    const r = await orderRead(db, W2, 'warehouse');
    for (const k of ['notes', 'reference', 'temperature_c']) assert.ok(k in r.order && r.order[k] === null, k);
    assert.deepStrictEqual(r.shipments.map((s) => [s.dest_location_id, Number(s.pallets), s.rides, s.rt_codes]), [[S.B, 2, false, []], [S.C, 3, false, []]]);
  });

  await t.test('R3: the read refuses by name: gone, old model, bad role', async () => {
    assert.strictEqual((await errorOf(db, `SELECT plan_order_read(-1, 'owner')`))?.hint, 'plan:order_gone');
    assert.strictEqual((await errorOf(db, `SELECT plan_order_read(NULL, 'owner')`))?.hint, 'plan:order_gone');
    // an order of the old model: a national_orders row without a v5 shipment (written as the facade did before day L)
    const old = (await one(db, `INSERT INTO national_orders (legacy_id, reference, price) VALUES ('rec077OLD', 'WN077-OLD', 10) RETURNING id`)).id;
    assert.strictEqual((await errorOf(db, `SELECT plan_order_read($1, 'owner')`, [old]))?.hint, 'plan:order_not_v5');
    for (const role of ['driver', null]) assert.strictEqual((await errorOf(db, `SELECT plan_order_read($1, $2)`, [N, role]))?.hint, 'plan:bad_input', String(role));
  });

  await t.test('U1: a save with nothing in it writes 0 rows (no audit, no row change, legs untouched)', async () => {    const f0 = await footprint(db, N);
    await upd(db, { nat_order_id: N });
    await upd(db, { nat_order_id: N, set: {}, shipments: [] });
    assert.deepStrictEqual(await footprint(db, N), f0);
  });

  let pieceNew, shipNew, stops0;
  await t.test('U2 (#84): + a delivery on an order ON a cycle = exactly one new shipment + one waiting piece; legs and stops untouched', async () => {
    const f0 = await footprint(db, N);
    stops0 = await stopsOf(db, RT);
    const a0 = await num(db, `SELECT max(id) AS n FROM audit_log`);
    const r = await upd(db, { nat_order_id: N, request_id: rid(), shipments: [S.day(S.A, S.C, 1)] });
    assert.strictEqual(r.ids.new_shipment_ids.length, 1);
    assert.strictEqual(r.ids.new_piece_ids.length, 1);
    assert.deepStrictEqual([r.ids.removed_shipment_ids, r.ids.shipment_ids], [[], []]);
    [shipNew] = r.ids.new_shipment_ids; [pieceNew] = r.ids.new_piece_ids;
    const f1 = await footprint(db, N);
    assert.strictEqual(Number(f1.sh) - Number(f0.sh), 1);
    assert.strictEqual(Number(f1.pc) - Number(f0.pc), 1);
    assert.strictEqual(f1.legs, f0.legs, 'the legs of the old point are the same rows');
    assert.deepStrictEqual(await stopsOf(db, RT), stops0, 'the cycle\'s stops are the same rows');
    const sh = await one(db, `SELECT * FROM shipments WHERE id = $1`, [shipNew]);
    assert.deepStrictEqual([sh.nat_order_id, sh.origin_location_id, sh.dest_location_id, Number(sh.pallets), sh.created_by], [N, S.A, S.C, 1, 'test:077']);
    assert.strictEqual(Date.parse(sh.load_from), Date.parse(S.t['00:00']));
    assert.strictEqual(Date.parse(sh.deliver_to), Date.parse(S.t['23:59']));
    assert.strictEqual(await num(db, `SELECT count(*) AS n FROM piece_legs WHERE piece_id = $1`, [pieceNew]), 0, 'the new piece waits');
    const n = await one(db, `SELECT pallets, delivery_location_1_id, pickup_location_1_id FROM national_orders WHERE id = $1`, [N]);
    assert.deepStrictEqual([Number(n.pallets), n.pickup_location_1_id, n.delivery_location_1_id], [7, S.A, S.C], 'the summary follows (decision 20)');
    const audit = (await db.query(`SELECT action, table_name, record_id FROM audit_log WHERE id > $1 ORDER BY id`, [a0])).rows;
    assert.deepStrictEqual(audit.map((x) => `${x.action} ${x.table_name}`), ['create shipments', 'create shipment_pieces', 'update national_orders', 'create plan_request']);
    assert.strictEqual(audit[0].record_id, String(shipNew));
    // the board shows it as waiting (the dispatcher's one board move comes next)
    const b = (await one(db, `SELECT plan_board($1::date, 'dispatcher') AS b`, [S.week])).b;
    const w = (b.waiting || []).find((x) => Number(x.piece_id) === Number(pieceNew));
    assert.ok(w, 'the new piece is in waiting[]');
    assert.strictEqual(Number(w.nat_order_id), N);
  });

  await t.test('U2b: the one board move puts the new point on the same cycle (legs extended, the old ones untouched)', async () => {
    const legs0 = (await footprint(db, N)).legs;
    const a = stops0.find((s) => s.location_id === S.A);
    await db.query(`SELECT plan_put_pieces($1::jsonb, 'test:077', 'dispatcher')`, [JSON.stringify({ pieces: [{ piece_id: pieceNew }],
      target: { rt_id: RT, side: 'KATHODOS' },
      stops: [{ ref: 'a', stop_id: a.id }, { ref: 'c', location_id: S.C, side: 'KATHODOS', planned_from: S.t['14:00'], planned_to: S.t['23:59'] }] })]);
    const legs1 = (await footprint(db, N)).legs;
    assert.ok(legs1.startsWith(legs0 + ','), 'the old legs are kept as they were, one more after them');
    assert.strictEqual(await num(db, `SELECT count(*) AS n FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL AND rt_id = $2`, [pieceNew, RT]), 1);
    assert.deepStrictEqual((await orderRead(db, N)).shipments.map((s) => s.rides), [true, true]);
  });

  await t.test('U3 (decision 44): the same request again = the first answer, nothing written; another body = refused; no id = refused', async () => {
    const body = { nat_order_id: W2, request_id: rid(), shipments: [S.day(S.B, S.C, 1)] };
    const r1 = await upd(db, body);
    const f1 = await footprint(db, W2);
    const r2 = await upd(db, body);
    assert.strictEqual(r2.replayed, true);
    assert.deepStrictEqual(r2.ids, r1.ids);
    assert.deepStrictEqual(await footprint(db, W2), f1, 'the replay wrote nothing');
    assert.strictEqual((await updErr(db, { ...body, shipments: [S.day(S.B, S.C, 2)] }))?.hint, 'plan:request_reused');
    assert.strictEqual((await updErr(db, { nat_order_id: W2, shipments: [S.day(S.B, S.C, 1)] }))?.hint, 'plan:request_missing');
    assert.deepStrictEqual(await footprint(db, W2), f1);
    // an edit without a new point needs no id (the leg form, WN5Act) and works as before
    await upd(db, { nat_order_id: W2, set: { goods: 'TEST 2' } });
    assert.strictEqual((await one(db, `SELECT goods FROM national_orders WHERE id = $1`, [W2])).goods, 'TEST 2');
  });

  await t.test('U4: a new point is checked as at creation; a refusal writes nothing', async () => {
    const f0 = await footprint(db, W2);
    const bad = [
      [{ ...S.day(S.A, S.C, 1), load_to: undefined }, 'plan:no_window', /shipment/],
      [{ ...S.day(S.A, S.C, 1), load_from: S.t['14:00'], load_to: S.t['12:00'] }, 'plan:no_window', /shipment:order/],
      [{ ...S.day(S.A, S.C, 1), deliver_to: 'infinity' }, 'plan:no_window', /shipment:finite/],
      [S.day(S.A, S.C, 0), 'plan:bad_input', /pallets:positive/],
      [S.day(S.A, S.C, 2.55), 'plan:bad_input', /pallets:one decimal/],
      [S.day(S.A, S.A, 1), 'plan:bad_input', /shipment:same_place/],
      [S.day(S.A, 999999, 1), 'plan:bad_input', /location:999999/],
      [{ ...S.day(S.A, S.C, 1), pallets: undefined }, 'plan:bad_input', /shipment:new/],
      [{ ...S.day(S.A, S.C, 1), remove: true }, 'plan:bad_input', /shipment:new/],
      [{ ...S.day(S.A, S.C, 1), price: 3 }, 'plan:bad_input', /shipment\.price/],
    ];
    for (const [s, hint, re] of bad) {
      const e = await updErr(db, { nat_order_id: W2, request_id: rid(), shipments: [s] });
      assert.strictEqual(e?.hint, hint, JSON.stringify(s));
      assert.match(e.msg, re, JSON.stringify(s));
    }
    assert.deepStrictEqual(await footprint(db, W2), f0);
  });

  await t.test('U5 (F21): a point that waits is removed (soft, audited, summary follows); riding / last / malformed are refused', async () => {
    const toC = (await orderRead(db, W2)).shipments.find((s) => s.dest_location_id === S.C && Number(s.pallets) === 3);
    const a0 = await num(db, `SELECT max(id) AS n FROM audit_log`);
    const p0 = Number((await one(db, `SELECT pallets FROM national_orders WHERE id = $1`, [W2])).pallets);
    const rmBody = { nat_order_id: W2, request_id: rid(), shipments: [{ shipment_id: toC.shipment_id, remove: true }] };
    const r = await upd(db, rmBody);
    assert.deepStrictEqual(r.ids.removed_shipment_ids, [toC.shipment_id]);
    const sh = await one(db, `SELECT deleted_at IS NOT NULL AS gone, deleted_reason, deleted_by FROM shipments WHERE id = $1`, [toC.shipment_id]);
    assert.deepStrictEqual(sh, { gone: true, deleted_reason: 'plan_order_update: point removed', deleted_by: 'test:077' });
    assert.strictEqual(await num(db, `SELECT count(*) AS n FROM shipment_pieces WHERE shipment_id = $1 AND deleted_at IS NULL`, [toC.shipment_id]), 0);
    const audit = (await db.query(`SELECT action, table_name FROM audit_log WHERE id > $1 ORDER BY id`, [a0])).rows.map((x) => `${x.action} ${x.table_name}`);
    assert.deepStrictEqual(audit, ['delete shipment_pieces', 'delete shipments', 'update national_orders', 'create plan_request']);
    // a second press after a lost answer = the first answer, never a refusal of a save that was kept
    const again = await upd(db, rmBody);
    assert.strictEqual(again.replayed, true);
    assert.deepStrictEqual(again.ids, r.ids);
    assert.strictEqual((await updErr(db, { nat_order_id: W2, shipments: [{ shipment_id: toC.shipment_id, remove: true }] }))?.hint, 'plan:request_missing');
    assert.strictEqual(Number((await one(db, `SELECT pallets FROM national_orders WHERE id = $1`, [W2])).pallets), p0 - 3);
    assert.ok(!(await orderRead(db, W2)).shipments.some((s) => s.shipment_id === toC.shipment_id));
    // refused, nothing written
    const riding = (await orderRead(db, N)).shipments[0].shipment_id;
    const f0 = [await footprint(db, N), await footprint(db, W2)];
    const live2 = (await orderRead(db, W2)).shipments.map((s) => s.shipment_id);
    for (const [id, body, hint, re] of [
      [N, { shipments: [{ shipment_id: riding, remove: true }] }, 'plan:piece_busy', /shipment:/],
      [W2, { shipments: live2.map((x) => ({ shipment_id: x, remove: true })) }, 'plan:bad_input', /shipments:last/],
      [W2, { shipments: [{ shipment_id: live2[0], remove: false }] }, 'plan:bad_input', /shipment:remove/],
      [W2, { shipments: [{ shipment_id: live2[0], remove: true, pallets: 1 }] }, 'plan:bad_input', /shipment:remove/],
      [W2, { shipments: [{ shipment_id: toC.shipment_id, remove: true }] }, 'plan:bad_input', /shipment_id/],
    ]) {
      const e = await updErr(db, { nat_order_id: id, request_id: rid(), ...body });
      assert.strictEqual(e?.hint, hint, JSON.stringify(body));
      assert.match(e.msg, re, JSON.stringify(body));
    }
    assert.deepStrictEqual([await footprint(db, N), await footprint(db, W2)], f0);
  });

  await t.test('U5b: a new point may start or end at Veroia (a normal place, spec 3) and waits like any other', async () => {
    const hub = (await one(db, `SELECT id FROM locations WHERE is_hub`)).id;
    const r = await upd(db, { nat_order_id: W2, request_id: rid(), shipments: [S.day(S.A, hub, 1), S.day(hub, S.C, 2)] });
    assert.strictEqual(r.ids.new_shipment_ids.length, 2);
    const pts = (await orderRead(db, W2)).shipments.filter((s) => r.ids.new_shipment_ids.includes(s.shipment_id));
    assert.deepStrictEqual(pts.map((s) => [s.origin_location_id, s.dest_location_id, Number(s.pallets), s.rides]), [[S.A, hub, 1, false], [hub, S.C, 2, false]]);
    // and leaves again by the same rule
    const x = await upd(db, { nat_order_id: W2, request_id: rid(), shipments: r.ids.new_shipment_ids.map((id) => ({ shipment_id: id, remove: true })) });
    assert.deepStrictEqual([...x.ids.removed_shipment_ids].sort(), [...r.ids.new_shipment_ids].sort());
  });

  await t.test('U6 (F13): a field emptied on purpose is stored as NULL; the price cannot be emptied', async () => {
    await upd(db, { nat_order_id: N, set: { notes: null, reference: null } });
    const n = await one(db, `SELECT notes, reference, price FROM national_orders WHERE id = $1`, [N]);
    assert.deepStrictEqual([n.notes, n.reference, Number(n.price)], [null, null, 100]);
    assert.strictEqual((await updErr(db, { nat_order_id: N, set: { price: null } }))?.hint, 'plan:no_price');
  });

  await t.test('as the Worker (service_role) both run; the API roles cannot call the read', async () => {
    await db.exec('SET ROLE service_role');
    try {
      assert.strictEqual((await orderRead(db, N)).ok, true);
      const r = await upd(db, { nat_order_id: W2, request_id: rid(), shipments: [S.day(S.C, S.A, 1)] });
      assert.strictEqual(r.ids.new_shipment_ids.length, 1);
    } finally { await db.exec('RESET ROLE'); }
    for (const role of ['anon', 'authenticated']) {
      assert.strictEqual((await one(db, `SELECT has_function_privilege($1, 'public.plan_order_read(bigint,text)', 'EXECUTE') AS x`, [role])).x, false, role);
    }
  });

  await t.test('the 072 and 072b rules tests still pass on top of 077', async () => {
    for (const [f, re] of [['072_plan_functions_test.sql', /RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, 0 FAIL/],
      ['072b_plan_vehicle_segments_test.sql', /RULES TEST 072b finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, 0 FAIL/]]) {
      // their fixtures write VS rows by hand: with day L the bridge trigger would bridge them first (as in plan-075)
      await db.exec('BEGIN; DELETE FROM plan_config;');
      let msg = null;
      try { await db.exec(read(f)); } catch (e) { msg = String(e.message); }
      await db.exec('ROLLBACK');
      assert.match(msg ?? '', re, `${f}: ${msg?.slice(0, 300)}`);
    }
  });

  await t.test('077 rollback: the text back byte for byte, the read gone, the added points stay; then 077 again', async () => {
    const before = await num(db, `SELECT count(*) AS n FROM shipments WHERE nat_order_id = $1 AND deleted_at IS NULL`, [N]);
    await db.exec(read('077_plan_order_edit_rollback.sql'));
    assert.strictEqual(await md5u(db), live);
    assert.strictEqual((await one(db, `SELECT to_regprocedure('public.plan_order_read(bigint,text)')::text AS r`)).r, null);
    assert.strictEqual(await num(db, `SELECT count(*) AS n FROM shipments WHERE nat_order_id = $1 AND deleted_at IS NULL`, [N]), before, 'the user\'s data stays');
    await db.exec(src);
    assert.strictEqual((await one(db, read('077_plan_order_edit_verify.sql'))).applied, '077 in place');
  });
});
