// Synthetic data for the local tests — every id/plate/name here is invented («TEST-…», «recTEST…»).
import { createDb } from '../lib/db.mjs';

export async function freshDb(opts = {}) {
  return createDb({ roles: true, ...opts });
}

// Isolate the checks under test (the rest are exercised by catalog.test.mjs).
export async function onlyChecks(db, ids) {
  await db.query(`UPDATE monitoring.checks SET enabled = false, disabled_reason = 'test: isolated' WHERE NOT (id = ANY($1))`, [ids]);
}

let seq = 0;
export async function truck(db) {
  seq++; const r = await db.query(`INSERT INTO trucks (legacy_id, license_plate, active) VALUES ($1, $2, true) RETURNING id`, [`recTRK${seq}`, `TEST-${seq}`]);
  return r.rows[0].id;
}
export async function driver(db) {
  seq++; const r = await db.query(`INSERT INTO drivers (legacy_id, full_name, active) VALUES ($1, 'TEST driver', true) RETURNING id`, [`recDRV${seq}`]);
  return r.rows[0].id;
}
// An international order assigned to a truck `minutesAgo` minutes ago (B-01 tolerance is 15′).
export async function assignedOrder(db, { minutesAgo = 20, legacy } = {}) {
  seq++; const t = await truck(db); const d = await driver(db);
  const r = await db.query(`INSERT INTO orders (legacy_id, status, truck_id, driver_id, assigned_at, created_at, loading_datetime, delivery_datetime)
     VALUES ($1, 'Assigned', $2, $3, now() - make_interval(mins => $4), now() - make_interval(mins => $4), current_date, current_date + 2)
     RETURNING id, legacy_id`, [legacy || `recTEST${String(seq).padStart(4, '0')}`, t, d, minutesAgo]);
  return { ...r.rows[0], truck_id: t, driver_id: d };
}
// What trigger 033 would have done: a live round trip with a leg for the order.
export async function roundTripFor(db, order) {
  const rt = await db.query(`INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, driver_id, date_start, status, source, created_by, updated_at)
     VALUES ($1, 'intl', 'OWNED', $2, $3, current_date, 'planned', 'auto', 'trigger:rt_create', now()) RETURNING id`,
     [`RT-T${order.id}`, order.truck_id, order.driver_id]);
  await db.query(`INSERT INTO ct_rt_legs (rt_id, direction, order_id) VALUES ($1, 'export', $2)`, [rt.rows[0].id, order.id]);
  return rt.rows[0].id;
}
export async function vault(db, secrets) {
  for (const [k, v] of Object.entries(secrets)) await db.query('INSERT INTO vault.mock_secrets VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret', [k, v]);
}
export const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
export const all = async (db, sql, p) => (await db.query(sql, p)).rows;
