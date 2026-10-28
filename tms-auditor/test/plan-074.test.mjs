// 074 (national v5 F5, day L) on the production-shaped PGlite copy of plan-073b.test.mjs (ONE builder,
// prod-shaped-072.mjs with the live money views and 072b; then the v1 money fixture, 073 and 073b, as production
// holds them 28/10).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072 } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { IDS as IDS_073B } from '../../worker/migrations/drafts/tools/build-073b.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

async function prodShaped() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(read('073_plan_money.sql'));
  // the local seed (047b, generated from every check file) holds 073b's checks; production got them from 073b itself
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [IDS_073B]);
  await db.exec(read('073b_plan_monitoring.sql'));
  return db;
}
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];

// Task 0 Step 6 (owner 28/10, Q-2: the cut is the hub day, for exports too). An export VS whose hub day is day L
// (Saturday) loads on Friday L-1 on the old board; 074 bridges it, and on Saturday the national desk records the
// Friday loading in v5. That needs plan_put_pieces to accept a leg whose window is already in the past. Here
// "today" plays day L: hub day = today, loading = yesterday, the cycle is written today with yesterday's window.
test('Task 0 Step 6: a v5 leg can be planned with a past window (the Friday loading of an export of day L)', async (t) => {
  const db = await prodShaped();
  const S = await one(db, `WITH x AS (SELECT (now() AT TIME ZONE 'Europe/Athens')::date AS td)
    SELECT td::text AS td, (td - 1)::text AS fri,
           ((td - 1) + time '06:00') AT TIME ZONE 'Europe/Athens' AS f06, ((td - 1) + time '08:00') AT TIME ZONE 'Europe/Athens' AS f08,
           ((td - 1) + time '12:00') AT TIME ZONE 'Europe/Athens' AS f12, ((td - 1) + time '14:00') AT TIME ZONE 'Europe/Athens' AS f14,
           (td + time '06:00') AT TIME ZONE 'Europe/Athens' AS s06, (td + time '08:00') AT TIME ZONE 'Europe/Athens' AS s08 FROM x`);
  const hub = (await one(db, 'SELECT id FROM locations WHERE is_hub')).id;
  const la = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec074S6A', 'TEST 074 A') RETURNING id`)).id;
  const lc = (await one(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec074S6C', 'TEST 074 C') RETURNING id`)).id;
  const cl = (await one(db, `INSERT INTO clients (company_name) VALUES ('TEST 074 client') RETURNING id`)).id;
  // two exports, one per variant: the truck drops at Veroia on Friday (as the old board does, 19/22) / on Saturday
  const vs = [];
  for (const k of [1, 2]) {
    const o = (await one(db, `INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime,
        delivery_datetime, cross_dock_date, reference, client_id)
      VALUES ($1, 'International', 'Export', 'Pending', true, $2::date - 1, $2::date + 3, $2::date, 'WN074-TEST', $3) RETURNING id`,
      [`rec074S6O${k}`, S.td, cl])).id;
    const ld = (await one(db, `INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
      VALUES ($1, 'Loading', 1, $2::date - 1, $3, $4, 20) RETURNING id`, [`rec074S6L${k}`, S.td, o, la])).id;
    await db.query(`INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
      VALUES ($1, 'Cross-dock', 1, $2::date, $3, $4, 20)`, [`rec074S6X${k}`, S.td, o, hub]);
    await db.query(`INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
      VALUES ($1, 'Unloading', 1, $2::date + 3, $3, $4, 20)`, [`rec074S6U${k}`, S.td, o, lc]);
    // the bridge as 074 writes it (one shipment per national-side stop + one piece with its pallets)
    await db.exec('BEGIN; SET CONSTRAINTS ALL DEFERRED;');
    const sh = (await one(db, `INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES ($1, $2, 'test:074') RETURNING id`, [o, ld])).id;
    const pc = (await one(db, `INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES ($1, 20, 'test:074') RETURNING id`, [sh])).id;
    await db.exec('COMMIT');
    vs.push({ o, pc });
  }
  const trk = (await one(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-074-1') RETURNING id`)).id;
  const trk2 = (await one(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-074-2') RETURNING id`)).id;
  const put = (pc, truck, hubFrom, hubTo) => db.query(`SELECT plan_put_pieces($1::jsonb, 'test:074', 'dispatcher') AS r`, [JSON.stringify({
    pieces: [{ piece_id: pc }],
    target: { new_rt: { trip_type: 'OWNED', truck_id: truck }, side: 'ANODOS' },
    stops: [{ ref: 'a', location_id: la, side: 'ANODOS', planned_from: S.f06, planned_to: S.f08 },
            { ref: 'h', location_id: hub, side: 'ANODOS', planned_from: hubFrom, planned_to: hubTo }],
  })]);
  const legsOf = async (pc) => (await one(db, `SELECT count(*)::int AS n FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL`, [pc])).n;
  const hubDay = async (o) => (await one(db, `SELECT cross_dock_date::text AS d FROM orders WHERE id = $1`, [o])).d;

  await t.test('variant 1: drop at Veroia on Friday (the past) - accepted, COMMIT passes; the hub day follows to Friday', async () => {
    const r = (await put(vs[0].pc, trk, S.f12, S.f14)).rows[0].r;
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(await legsOf(vs[0].pc), 1);
    // decision 16: the first ride rewrites the international's hub day to the day the truck reaches Veroia
    assert.strictEqual(await hubDay(vs[0].o), S.fri);
  });

  await t.test('variant 2: drop at Veroia on Saturday (day L) - accepted, the hub day stays L', async () => {
    const r = (await put(vs[1].pc, trk2, S.s06, S.s08)).rows[0].r;
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(await legsOf(vs[1].pc), 1);
    assert.strictEqual(await hubDay(vs[1].o), S.td);
  });
});
