// 097 / 097b on the production-shaped PGlite copy (prod-shaped-086 + fixtures/live-097.sql: the v1 pair rules as
// production holds them on 2/11/2026, md5-checked below). Each case first replays the incident of 2/11 step by step
// as audit_log recorded it for #606 / RT-1283 (import assigned alone -> truck removed -> export matched to it ->
// import gets the export's truck), then reads ROWS (legs, round trips, payroll lines, audit_log):
//   LIVE rules (no 097)  -> the split production shows (NO-GO, the cause reproduced)
//   097                  -> one round trip, the export's; the import's cancelled, its empty payroll line deleted (GO)
//   097 rollback         -> the live behaviour again
// plus: a pair on two different trucks stays two trips, the dry runs keep nothing, 097 twice refuses, and 097b /
// its rollback repair / restore the two production shapes (closed export + import on the road; both delivered).
// Synthetic rows only: legacy ids rec97..., plates TEST-...
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped086 } from './prod-shaped-086.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { truck, driver } from './helpers.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const LIVE = {   // md5(prosrc) on production 2/11 (SELECT): every function the incident ran through
  rt_create_from_order: '0845ec6170fd2918d21efd56856daa3e', rt_link_split: '6f954b256f103f1c6a8f8ab400a67808',
  rt_merge: '41d629e48ba519c458848a9572b346c8', rt_sync_from_order: '1a1c357803bc1c0c7368e1ba5b1335cc',
  rt_auto_close_order: 'c928dc1343f4e0394388cb0f13525d63', rt_recompute: '5fa0a08418147b22d2852db3b8c72c3e',
  rt_sync_audit: '8db481ca4a517ea82168f45e71fec338', dl_sync_from_rt: '331cea3a8987b74a9b0add698df9b158',
  rt_auto_close_legs: 'fb3423feaf64d13c5f91f125651f965c', rt_sync_legs: '998a0ce0830686954eba76d970d1a81a',
  rt_sync_to_orders: 'a63234c844c2b6236b1e6dfe1410b8fc', rt_auto_close: 'eba2146ca4c521da6365edd28c4507af',
  rt_status_guard: 'd7757f99c3443ac167d5bdaf3e34b142',
};

async function copy() {
  const db = await prodShaped086();
  await db.exec(fs.readFileSync(new URL('./fixtures/live-097.sql', import.meta.url), 'utf8'));
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}) WHERE id = 'B-54'`);
  return db;
}
let n = 0;
async function order(db, dir, load, del) {
  n++;
  return (await one(db, `INSERT INTO orders (legacy_id, order_type, direction, status, loading_datetime, delivery_datetime, client_id)
    VALUES ($1, 'International', $2, 'Pending', current_date + $3::int, current_date + $4::int, (SELECT min(id) FROM clients)) RETURNING id, legacy_id`,
    [`rec97${dir[0]}${n}`, dir, load, del]));
}
const assign = (db, id, t, d) => db.query(`UPDATE orders SET truck_id = $2, driver_id = $3, status = 'Assigned' WHERE id = $1`, [id, t, d]);
const rtOf = async (db, id) => (await one(db, `SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id
  WHERE l.order_id = $1 AND r.status <> 'cancelled'`, [id]))?.rt_id;
// The 2/11 sequence (audit_log 14700 ... 15257): returns the export, the import and their round trips
async function incident(db, { importTruck } = {}) {
  const t = await truck(db), d = await driver(db);
  const e = await order(db, 'Export', 0, 1);
  await assign(db, e.id, t, d);                                                     // 24/10: export -> RT A
  const i = await order(db, 'Import', 3, 6);
  await assign(db, i.id, t, d);                                                     // 27/10: import alone -> RT B
  const b = await rtOf(db, i.id);
  await db.query(`UPDATE orders SET truck_id = NULL, driver_id = NULL, status = 'Pending' WHERE id = $1`, [i.id]);   // 28/10 10:28
  await db.query(`UPDATE orders SET matched_import_id = $2 WHERE id = $1`, [e.id, i.legacy_id]);                    // 14:26:59
  await assign(db, i.id, importTruck ? await importTruck() : t, d);                // 14:27:01
  return { t, d, e, i, a: await rtOf(db, e.id), b };
}

test('the copy holds the production texts of every function on the path', async () => {
  const db = await copy();
  for (const [f, m] of Object.entries(LIVE)) {
    assert.strictEqual((await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace`, [f])).m, m, f);
  }
});

test('LIVE rules: the 2/11 sequence leaves the pair on two round trips (cause reproduced)', async () => {
  const db = await copy();
  const x = await incident(db);
  assert.notStrictEqual(x.a, x.b);
  assert.strictEqual(await rtOf(db, x.i.id), x.b, 'the import stays on its own round trip');
  assert.strictEqual((await one(db, `SELECT truck_id FROM ct_round_trips WHERE id = $1`, [x.b])).truck_id, x.t, 'with the same truck');
  // 037 saw it at the link and could not merge (the import's round trip had no vehicle at that moment)
  assert.ok((await one(db, `SELECT count(*)::int AS c FROM audit_log WHERE actor = 'trigger:rt_sync' AND table_name = 'orders'
    AND record_id = $1 AND after_data->>'split' = 'true'`, [String(x.e.id)])).c >= 1);
});

test('097: the same sequence ends on ONE round trip, the export\'s; the import\'s is cancelled with its empty payroll line', async () => {
  const db = await copy();
  await db.exec(read('097_rt_split_vehicle_recheck.sql'));
  const x = await incident(db);
  assert.strictEqual(await rtOf(db, x.i.id), x.a, 'the import joined the export\'s round trip');
  const b = await one(db, `SELECT status, (SELECT count(*)::int FROM ct_rt_legs WHERE rt_id = $1) AS legs,
    (SELECT count(*)::int FROM dl_entries WHERE rt_id = $1 AND deleted_at IS NULL) AS live_pay FROM ct_round_trips WHERE id = $1`, [x.b]);
  assert.deepStrictEqual(b, { status: 'cancelled', legs: 0, live_pay: 0 });
  const a = await one(db, `SELECT status, truck_id, (SELECT count(*)::int FROM dl_entries WHERE rt_id = $1 AND deleted_at IS NULL) AS live_pay
    FROM ct_round_trips WHERE id = $1`, [x.a]);
  assert.deepStrictEqual(a, { status: 'planned', truck_id: x.t, live_pay: 1 });
  assert.strictEqual((await one(db, `SELECT count(*)::int AS c FROM audit_log WHERE table_name = 'ct_round_trips' AND record_id = $1
    AND after_data->>'merged_from' IS NOT NULL`, [String(x.a)])).c, 1, 'one merge, audited');
  assert.strictEqual((await one(db, `SELECT count(*)::int AS c FROM orders WHERE id IN ($1, $2) AND truck_id = $3`, [x.e.id, x.i.id, x.t])).c, 2);
});

test('097: a pair on two different trucks stays two trips (033\'s rule)', async () => {
  const db = await copy();
  await db.exec(read('097_rt_split_vehicle_recheck.sql'));
  const x = await incident(db, { importTruck: () => truck(db) });
  assert.notStrictEqual(await rtOf(db, x.i.id), x.a);
  assert.strictEqual((await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [x.b])).status, 'planned');
});

test('097: the dry run keeps nothing, the source applies once, a second run refuses; the rollback gives the live behaviour back', async () => {
  const db = await copy();
  const trg = Number((await one(db, `SELECT (${TRG}) AS c`)).c);
  assert.match(await errorOf(db, read('097_rt_split_vehicle_recheck_dryrun.sql')),
    new RegExp(`DRY RUN 097 finished - EVERYTHING UNDONE.*097 ran: trigger rt_y_link_split_vehicle yes, public triggers ${trg + 1}, B-54 ${trg + 1}`));
  assert.strictEqual((await one(db, `SELECT count(*)::int AS c FROM pg_trigger WHERE tgname = 'rt_y_link_split_vehicle'`)).c, 0);
  await db.exec(read('097_rt_split_vehicle_recheck.sql'));
  assert.strictEqual(Number((await one(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`)).red_value), trg + 1);
  assert.strictEqual((await one(db, read('097_rt_split_vehicle_recheck_verify.sql'))).rule, '097 in place', 'verify reads the trigger 097 made');
  assert.match(await errorOf(db, read('097_rt_split_vehicle_recheck.sql')), /097: already applied/);
  assert.match(await errorOf(db, read('097_rt_split_vehicle_recheck_rollback_dryrun.sql')), /DRY RUN 097 ROLLBACK finished.*trigger rt_y_link_split_vehicle no/);
  await db.exec(read('097_rt_split_vehicle_recheck_rollback.sql'));
  assert.strictEqual(Number((await one(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`)).red_value), trg);
  const x = await incident(db);
  assert.notStrictEqual(await rtOf(db, x.i.id), x.a, 'after the rollback the live split comes back');
  const v = await one(db, read('097_rt_split_vehicle_recheck_verify.sql'));
  assert.strictEqual(v.rule, '097 NOT APPLIED');
  assert.strictEqual(Number(v.split_pairs), 1);
});

// 097b: the two production shapes, built with the LIVE rules (the split happens), then repaired by the file with the
// copy's ids in place of the production ones
async function shapes(db) {
  const p1 = await incident(db);                                                    // Voitsberg: export closed, import on the road
  await db.query(`UPDATE orders SET status = 'Delivered' WHERE id = $1`, [p1.e.id]);
  await db.query(`UPDATE orders SET status = 'In Transit' WHERE id = $1`, [p1.i.id]);
  await db.query(`INSERT INTO ct_cost_lines (rt_id, category, net, line_date, created_by, pay_source) VALUES ($1, 'fuel', 1247.02, current_date, 'test', 'CREDIT'), ($1, 'tolls', 37, current_date, 'test', 'REVOLUT')`, [p1.a]);
  const p2 = await incident(db);                                                    // mid-October: both delivered
  await db.query(`UPDATE orders SET status = 'Delivered' WHERE id IN ($1, $2)`, [p2.e.id, p2.i.id]);
  await db.query(`INSERT INTO ct_cost_lines (rt_id, category, net, line_date, created_by, pay_source) VALUES ($1, 'fuel', 1291.71, current_date, 'test', 'CREDIT')`, [p2.a]);
  return [p1, p2];
}
const withIds = (src, [p1, p2], extra) => src.replace(
  /pairs CONSTANT jsonb := '[^']*';/,
  `pairs CONSTANT jsonb := '[{"keep":${p1.a},"drop":${p1.b},"exp":${p1.e.id},"imp":${p1.i.id}${extra ? extra(1) : ''}},{"keep":${p2.a},"drop":${p2.b},"exp":${p2.e.id},"imp":${p2.i.id}${extra ? extra(2) : ''}}]';`);
const statusOf = async (db, id) => (await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [id])).status;
const livePay = async (db, id) => (await one(db, `SELECT count(*)::int AS c FROM dl_entries WHERE rt_id = $1 AND deleted_at IS NULL`, [id])).c;

test('097b: both shapes go back to the export\'s round trip, cost lines kept, status by the legs; the rollback restores the split', async () => {
  const db = await copy();
  const ps = await shapes(db);
  const st = async () => [await statusOf(db, ps[0].a), await statusOf(db, ps[0].b), await statusOf(db, ps[1].a), await statusOf(db, ps[1].b)];
  assert.deepStrictEqual(await st(), ['closed', 'planned', 'closed', 'closed'], 'the production shapes');
  assert.match(await errorOf(db, withIds(read('097b_rt_split_repair_dryrun.sql'), ps)), /DRY RUN 097b finished - EVERYTHING UNDONE/);
  assert.strictEqual(await rtOf(db, ps[0].i.id), ps[0].b, 'the dry run kept nothing');
  const src = withIds(read('097b_rt_split_repair.sql'), ps);
  await db.exec(src.split('\n-- The result row')[0]);
  for (const p of ps) {
    assert.strictEqual(await rtOf(db, p.i.id), p.a);
    assert.strictEqual(await statusOf(db, p.b), 'cancelled');
    assert.strictEqual(await livePay(db, p.b), 0);
  }
  assert.deepStrictEqual([await statusOf(db, ps[0].a), await statusOf(db, ps[1].a)], ['planned', 'closed'], 'reopened only where a leg is on the road');
  assert.deepStrictEqual(await one(db, `SELECT count(*)::int AS c, sum(net)::text AS s FROM ct_cost_lines WHERE rt_id = $1`, [ps[0].a]), { c: 2, s: '1284.02' });
  assert.ok(await errorOf(db, src), 'a second run refuses');
  const rb = withIds(read('097b_rt_split_repair_rollback.sql'), ps,
    (k) => (k === 1 ? ',"status":"planned","closed_at":null' : ',"status":"closed","closed_at":"2026-10-19 05:14:43.74223+00"'));
  assert.match(await errorOf(db, withIds(read('097b_rt_split_repair_rollback_dryrun.sql'), ps,
    (k) => (k === 1 ? ',"status":"planned","closed_at":null' : ',"status":"closed","closed_at":"2026-10-19 05:14:43.74223+00"'))), /DRY RUN 097b ROLLBACK finished/);
  await db.exec(rb.split('\n\nSELECT CASE')[0]);
  for (const p of ps) { assert.strictEqual(await rtOf(db, p.i.id), p.b); assert.strictEqual(await livePay(db, p.b), 1); }
  assert.deepStrictEqual(await st(), ['closed', 'planned', 'closed', 'closed'], 'back to the production shapes');
});

test('097b repairs its two pairs even when another split pair exists (two trucks): reported, not blocking', async () => {
  const db = await copy();
  const ps = await shapes(db);
  const other = await incident(db, { importTruck: () => truck(db) });                // 033 keeps it two trips on purpose
  await db.exec(withIds(read('097b_rt_split_repair.sql'), ps).split('\n-- The result row')[0]);
  for (const p of ps) assert.strictEqual(await rtOf(db, p.i.id), p.a);
  assert.notStrictEqual(await rtOf(db, other.i.id), other.a, 'the pair 097b does not name is left alone');
});

test('097b refuses when the import runs another driver than the kept round trip', async () => {
  const db = await copy();
  const ps = await shapes(db);
  await db.query(`UPDATE orders SET driver_id = $2 WHERE id = $1`, [ps[0].i.id, await driver(db)]);
  assert.match(await errorOf(db, withIds(read('097b_rt_split_repair.sql'), ps)), /another driver or trailer/);
  assert.strictEqual(await rtOf(db, ps[0].i.id), ps[0].b);
});

test('097b refuses when the import\'s round trip got money since 2/11', async () => {
  const db = await copy();
  const ps = await shapes(db);
  await db.query(`INSERT INTO ct_cost_lines (rt_id, category, net, line_date, created_by, pay_source) VALUES ($1, 'tolls', 10, current_date, 'test', 'REVOLUT')`, [ps[0].b]);
  assert.match(await errorOf(db, withIds(read('097b_rt_split_repair.sql'), ps)), /now has cost lines or a payroll amount/);
  assert.strictEqual(await rtOf(db, ps[0].i.id), ps[0].b);
});
