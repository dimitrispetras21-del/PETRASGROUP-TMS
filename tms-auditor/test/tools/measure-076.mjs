// The volume test of 076 (asked by the coordinator 28/10: "under 200 ms for the week, the same order at 10x, proved
// on PGlite or synthetic volume"). Production's shape (the 074 harness), production's statistics (none: no table of
// public was ever analyzed, 28/10), synthetic v5 volume over 8 weeks around one week W: 5 x scale cycles a week with
// 4 stops, 4 nationals (3 on the cycle, 1 waiting) and 2 VS imports (1 on the cycle, every third one late) per cycle,
// plus production's 460 international orders with 3 stops each. It measures plan_board(W) as it is, applies the REAL
// 076 (the migration file: its view, its ANALYZE, its row proof), measures again and checks the board answers the
// same bytes before and after.
//   node tms-auditor/test/tools/measure-076.mjs <scale>        (1 = a busy week of today's size, 10 = ten times)
// Not part of the test suite (it times a wasm Postgres; the numbers go to docs/sessions, by hand).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072, TRG } from '../prod-shaped-072.mjs';
import { migrationFile } from '../../lib/db.mjs';
import { IDS as IDS_073B } from '../../../worker/migrations/drafts/tools/build-073b.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const fixture = (f) => fs.readFileSync(path.join(HERE, '..', 'fixtures', f), 'utf8');
const args = process.argv.slice(2);
const scale = Number(args[0] || 1);

const db = await prodShaped072(true, { money: 'live', with072b: true });
await db.exec(fixture('v1-money-073.sql'));
await db.exec(read('073_plan_money.sql'));
await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [IDS_073B]);
await db.exec(read('073b_plan_monitoring.sql'));
await db.exec(fixture('live-074.sql'));
await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}) WHERE id = 'B-54'`);
await db.exec(read('074a_plan_reads.sql'));

const W = '2026-12-05';
await db.exec(`BEGIN; SET CONSTRAINTS ALL DEFERRED;
DO $g$ DECLARE s int := ${scale}; hub bigint; loc bigint[] := '{}'; trk bigint; drv bigint; cl bigint; rt bigint; st bigint[];
  d date; n bigint; sh bigint; p bigint; k int; w int; c int; i int; f timestamptz; o bigint; os bigint;
BEGIN
  SELECT id INTO hub FROM locations WHERE is_hub;
  FOR i IN 1..60 LOOP INSERT INTO locations (legacy_id, name) VALUES ('recPERF' || i, 'PERF ' || i) RETURNING id INTO n; loc := loc || n; END LOOP;
  INSERT INTO clients (company_name) VALUES ('PERF client') RETURNING id INTO cl;
  FOR i IN 1..460 LOOP
    INSERT INTO orders (legacy_id, order_type, direction, status, reference, client_id) VALUES ('recPERFO' || i, 'International', 'Import', 'Delivered', 'PERF', cl) RETURNING id INTO o;
    FOR k IN 1..3 LOOP
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
      VALUES ('recPERFS' || i || '-' || k, (ARRAY['Loading','Cross-dock','Unloading'])[k], 1, DATE '${W}' - 100, o, loc[1 + (i + k) % 60], 10);
    END LOOP;
  END LOOP;
  FOR w IN -4..3 LOOP
    FOR c IN 1..(5 * s) LOOP
      d := DATE '${W}' + w * 7 + (c % 6);
      f := (d + time '06:00') AT TIME ZONE 'Europe/Athens';
      INSERT INTO trucks (license_plate) VALUES ('PERF-' || w || '-' || c) RETURNING id INTO trk;
      INSERT INTO drivers (full_name) VALUES ('PERF ' || w || '-' || c) RETURNING id INTO drv;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at, status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk, drv, d, d, f, f + interval '10 hours', 'planned', 'planner', 'perf') RETURNING id INTO rt;
      st := '{}';
      FOR k IN 1..4 LOOP
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt, k, CASE WHEN k = 2 THEN hub ELSE loc[1 + ((c * 4 + k + w + 60) % 60)] END, CASE WHEN k <= 2 THEN 'KATHODOS' ELSE 'ANODOS' END,
                f + (k * 2) * interval '1 hour', f + (k * 2 + 1) * interval '1 hour', 'perf') RETURNING id INTO n;
        st := st || n;
      END LOOP;
      FOR i IN 1..4 LOOP
        INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, temperature_c, pallet_exchange)
        VALUES ('recPERFN' || w || '-' || c || '-' || i, cl, 'PERF', 100, 3, 'g', 2, i = 1) RETURNING id INTO n;
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from, deliver_to, created_by)
        VALUES (n, (SELECT location_id FROM rt_stops WHERE id = st[1]), (SELECT location_id FROM rt_stops WHERE id = st[3]), 3, f + interval '2 hours', f + interval '3 hours',
                f + interval '6 hours', f + interval '7 hours', 'perf') RETURNING id INTO sh;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh, 3, 'perf') RETURNING id INTO p;
        IF i < 4 THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p, 1, rt, st[1], st[3], 'perf');
        END IF;
      END LOOP;
      FOR i IN 1..2 LOOP
        INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, cross_dock_date, reference, client_id)
        VALUES ('recPERFV' || w || '-' || c || '-' || i, 'International', 'Import', 'Pending', true, d, 'PERFVS', cl) RETURNING id INTO o;
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
        VALUES ('recPERFVL' || w || '-' || c || '-' || i, 'Loading', 1, d - 3, o, loc[1 + (c % 60)], 8);
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
        VALUES ('recPERFVU' || w || '-' || c || '-' || i, 'Unloading', 1, CASE WHEN c % 3 = 0 THEN d - 1 ELSE d END, o, (SELECT location_id FROM rt_stops WHERE id = st[4]), 8) RETURNING id INTO os;
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (o, os, 'perf') RETURNING id INTO sh;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh, 8, 'perf') RETURNING id INTO p;
        IF i = 1 THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p, 1, rt, st[2], st[4], 'perf');
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $g$;
COMMIT;`).catch(async (e) => { console.log('gen error', e.message); process.exit(1); });
// production: no table of public was ever analyzed (28/10): forget what the inserts taught the planner here
await db.exec(`DELETE FROM pg_statistic WHERE starelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)`).catch((e) => console.log('stat reset skipped', e.message));
const cnt = (await db.query(`SELECT (SELECT count(*) FROM ct_round_trips WHERE model=2) rt, (SELECT count(*) FROM rt_stops) st, (SELECT count(*) FROM shipment_pieces) sp, (SELECT count(*) FROM piece_legs) pl, (SELECT count(*) FROM order_stops) os, (SELECT count(*) FROM v_piece_state WHERE late) late`)).rows[0];
console.log('scale', scale, JSON.stringify(cnt));
for (let i = 0; i < 3; i++) await db.query(`SELECT count(*) FROM generate_series(1, 200000) g, LATERAL (SELECT md5(g::text)) x`);   // wasm warm-up
async function measure(label, n) {
  const runs = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); await db.query(`SELECT length(plan_board(DATE '${W}', 'dispatcher')::text) n`); runs.push(performance.now() - t0); }
  const md5 = (await db.query(`SELECT md5(plan_board(DATE '${W}', 'dispatcher')::text) m`)).rows[0].m;
  const src = (await db.query(`SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure`)).rows[0].prosrc;
  const a = src.indexOf('return jsonb_build_object('), b = src.lastIndexOf('end');
  const Wc = `DATE '${W}'`;
  const body = src.slice(a + 'return '.length, src.lastIndexOf(';', b)).replace(/p_week/g, Wc).replace(/p_role/g, `'dispatcher'`)
    .replace(/v_from/g, `(${Wc}::timestamp at time zone 'Europe/Athens')`).replace(/v_to/g, `((${Wc}+7)::timestamp at time zone 'Europe/Athens')`);
  const r = (await db.query(`EXPLAIN (ANALYZE, SUMMARY) SELECT ${body}`)).rows.map((x) => x['QUERY PLAN']).join('\n');
  const sorted = [...runs].sort((x, y) => x - y);
  console.log(`${label}: board first ${Math.round(runs[0])} ms, median ${Math.round(sorted[Math.floor(n / 2)])} ms (${runs.map(Math.round).join(', ')}); `
    + `a fresh plan: planning ${Math.round(/Planning Time: ([0-9.]+)/.exec(r)[1])} ms + execution ${Math.round(/Execution Time: ([0-9.]+)/.exec(r)[1])} ms; answer md5 ${md5}`);
  return md5;
}
const before = await measure('before 076', scale > 3 ? 3 : 7);
const t0 = performance.now();
const res = await db.exec(fs.readFileSync(migrationFile('076_plan_board_speed.sql'), 'utf8'));
console.log(`076 applied in ${Math.round(performance.now() - t0)} ms: ${JSON.stringify(res.at(-1).rows[0])}`);
const after = await measure('after 076', 7);
console.log(before === after ? 'the board answers the same bytes before and after 076' : 'DIFFERENT ANSWER before / after 076');
process.exitCode = before === after ? 0 : 1;
