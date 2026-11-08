// 106 on the production-shaped PGlite copy (prod-shaped-086 + fixtures/live-097.sql + 097 as executed 2/11): the
// export-groupage match repair (owner 8/11). Builds the production shape of GRP-iTOtMMoR with synthetic rows (two
// exports of one GRP on one closed round trip with their import, the match on the first export only), swaps the
// production ids for the synthetic ones, then reads ROWS: orders, legs, the round trip, cost lines, payroll, audit_log.
// Synthetic rows only: legacy ids rec106..., plates TEST-...
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

async function copy() {
  const db = await prodShaped086();
  await db.exec(fs.readFileSync(new URL('./fixtures/live-097.sql', import.meta.url), 'utf8'));
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}) WHERE id = 'B-54'`);
  await db.exec(read('097_rt_split_vehicle_recheck.sql'));          // executed in production 2/11 (moves B-54 by one)
  return db;
}
let n = 0;
async function order(db, dir, group) {
  n++;
  return (await one(db, `INSERT INTO orders (legacy_id, order_type, direction, status, loading_datetime, delivery_datetime, client_id, group_id)
    VALUES ($1, 'International', $2, 'Pending', current_date, current_date + 2, (SELECT min(id) FROM clients), $3) RETURNING id, legacy_id`,
    [`rec106${dir[0]}${n}`, dir, group]));
}
const rtIds = async (db, id) => (await db.query(`SELECT rt_id FROM ct_rt_legs WHERE order_id = $1 ORDER BY rt_id`, [id])).rows.map((r) => r.rt_id);
const matchOf = async (db, id) => (await one(db, `SELECT matched_import_id AS m FROM orders WHERE id = $1`, [id])).m;

// The shape of GRP-iTOtMMoR on 8/11: E1 matched to I, E2 not, all three on ONE closed round trip with fuel and payroll
async function shape(db, { secondImport = false } = {}) {
  const t = await truck(db), d = await driver(db);
  const g = `GRP-TEST106${n}`;
  const e1 = await order(db, 'Export', g), e2 = await order(db, 'Export', g), i = await order(db, 'Import', null);
  await db.query(`UPDATE orders SET matched_import_id = $2 WHERE id = $1`, [e1.id, i.legacy_id]);
  for (const o of [e1, e2, i]) await db.query(`UPDATE orders SET truck_id = $2, driver_id = $3, status = 'Assigned' WHERE id = $1`, [o.id, t, d]);
  if (secondImport) {
    const i2 = await order(db, 'Import', null);
    await db.query(`UPDATE orders SET matched_import_id = $2 WHERE id = $1`, [e2.id, i2.legacy_id]);
  }
  const rt = (await rtIds(db, e1.id))[0];
  await db.query(`INSERT INTO ct_cost_lines (rt_id, category, net, line_date, created_by, pay_source) VALUES ($1, 'fuel', 812.40, current_date, 'test', 'CREDIT')`, [rt]);
  await db.query(`UPDATE orders SET status = 'Delivered' WHERE id IN ($1, $2, $3)`, [e1.id, e2.id, i.id]);
  return { t, d, g, e1, e2, i, rt };
}
// production ids -> synthetic ids (placeholders first, so a synthetic id never meets a production number)
const withIds = (src, x) => src
  .replaceAll('GRP-iTOtMMoR', '@G@').replaceAll('recR5tH3Mw2nLFX0n', '@L@')
  .replace(/\b464\b/g, '@E2@').replace(/\b442\b/g, '@E1@').replace(/\b505\b/g, '@I@').replace(/\b225\b/g, '@RT@')
  .replaceAll('@G@', x.g).replaceAll('@L@', x.i.legacy_id)
  .replaceAll('@E2@', String(x.e2.id)).replaceAll('@E1@', String(x.e1.id)).replaceAll('@I@', String(x.i.id)).replaceAll('@RT@', String(x.rt));
const snap = async (db, x) => one(db, `SELECT
  (SELECT jsonb_agg(jsonb_build_object('o', order_id, 'rt', rt_id) ORDER BY order_id) FROM ct_rt_legs WHERE rt_id = $1 OR order_id IN ($2, $3, $4)) AS legs,
  (SELECT row_to_json(r)::jsonb - 'updated_at' FROM (SELECT status, truck_id, trailer_id, driver_id, date_start, date_end FROM ct_round_trips WHERE id = $1) r) AS rt,
  (SELECT count(*)::int FROM ct_cost_lines WHERE rt_id = $1) AS lines,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'drv', driver_id, 'del', deleted_at IS NOT NULL) ORDER BY id) FROM dl_entries WHERE rt_id = $1) AS pay`,
  [x.rt, x.e1.id, x.e2.id, x.i.id]);
const verify = async (db, x) => one(db, withIds(read('106_grp_match_converge_verify.sql'), x));

test('the copy builds the production shape: one closed round trip, the match on the first export only', async () => {
  const db = await copy();
  const x = await shape(db);
  for (const o of [x.e1, x.e2, x.i]) assert.deepStrictEqual(await rtIds(db, o.id), [x.rt], `#${o.id} on the one round trip`);
  assert.strictEqual((await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [x.rt])).status, 'closed');
  assert.strictEqual(await matchOf(db, x.e1.id), x.i.legacy_id);
  assert.strictEqual(await matchOf(db, x.e2.id), null);
  assert.strictEqual(Number((await verify(db, x)).partly_matched_groups), 1);
});

test('106 dry run keeps nothing; 106 matches the second export, the round trip and its money do not move', async () => {
  const db = await copy();
  const x = await shape(db);
  const before = await snap(db, x);
  assert.match(await errorOf(db, withIds(read('106_grp_match_converge_dryrun.sql'), x)), /DRY RUN 106 finished - EVERYTHING UNDONE/);
  assert.strictEqual(await matchOf(db, x.e2.id), null, 'the dry run kept nothing');
  assert.strictEqual(await errorOf(db, withIds(read('106_grp_match_converge.sql'), x)), null);
  assert.strictEqual(await matchOf(db, x.e2.id), x.i.legacy_id);
  assert.deepStrictEqual(await snap(db, x), before, 'legs, round trip, cost lines, payroll unchanged');
  const v = await verify(db, x);
  assert.strictEqual(v.state, '106 in place');
  assert.strictEqual(Number(v.partly_matched_groups), 0);
  const a = await one(db, `SELECT actor, before_data, after_data->>'matched_import_id' AS m FROM audit_log
    WHERE table_name = 'orders' AND record_id = $1 AND actor LIKE 'migration:%'`, [String(x.e2.id)]);
  assert.deepStrictEqual([a.actor, a.before_data, a.m], ['migration:106', { matched_import_id: null }, x.i.legacy_id]);
  assert.match(await errorOf(db, withIds(read('106_grp_match_converge.sql'), x)), /106: #\d+ is no longer NULL/, 'a second run refuses');
});

test('106 rollback: dry run keeps nothing; rollback puts NULL back with the round trip unchanged', async () => {
  const db = await copy();
  const x = await shape(db);
  const before = await snap(db, x);
  await db.exec(withIds(read('106_grp_match_converge.sql'), x));
  assert.match(await errorOf(db, withIds(read('106_grp_match_converge_rollback_dryrun.sql'), x)), /DRY RUN 106 ROLLBACK finished/);
  assert.strictEqual(await matchOf(db, x.e2.id), x.i.legacy_id, 'the rollback dry run kept nothing');
  assert.strictEqual(await errorOf(db, withIds(read('106_grp_match_converge_rollback.sql'), x)), null);
  assert.strictEqual(await matchOf(db, x.e2.id), null);
  assert.deepStrictEqual(await snap(db, x), before);
  const v = await verify(db, x);
  assert.deepStrictEqual([v.state, Number(v.partly_matched_groups)], ['106 NOT APPLIED', 1]);
});

test('106 rollback refuses when a person wrote the order after 106 (audited under the legacy id)', async () => {
  const db = await copy();
  const x = await shape(db);
  await db.exec(withIds(read('106_grp_match_converge.sql'), x));
  await db.query(`INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    VALUES ('dispatcher-test', 'dispatcher', 'update', 'orders', $1, '{}', '{}', now() + interval '1 second')`, [x.e2.legacy_id]);
  assert.match(await errorOf(db, withIds(read('106_grp_match_converge_rollback.sql'), x)), /written after 106/);
  assert.strictEqual(await matchOf(db, x.e2.id), x.i.legacy_id, 'nothing undone');
});

test('106 refuses a group that carries two different imports (a person decides)', async () => {
  const db = await copy();
  const x = await shape(db, { secondImport: true });
  assert.match(await errorOf(db, withIds(read('106_grp_match_converge.sql'), x)), /106: #\d+ is no longer NULL|more than one import/);
});
