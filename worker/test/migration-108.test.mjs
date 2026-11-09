// 108 (U5, owner 27/10 answer 4a/4b): the dry run is 108 verbatim + three proofs + a deliberate error (generated),
// and, where PGlite is installed (PGLITE=<path to @electric-sql/pglite/dist/index.js>), 107 then 108 run on a small
// copy of the tables: the dry run keeps nothing; a re-save writes nothing; a status transition and a late exchange
// write one delivery per stop with its audit row; split legs, lots, clientless orders and a corrected stop are left
// alone; a new stop of a delivered order gets its delivery; rollback drops it all (rows stay), 108 runs again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build108Dryrun } from '../migrations/drafts/tools/build-108-dryrun.mjs';

const M = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const read = (f) => fs.readFileSync(path.join(M, f), 'utf8');
const d = (f) => f;   // 108 ran 8/11 (owner): its files left drafts/ (CLAUDE.md, rule 5)

test('the dry run is 108 verbatim plus the proofs and the deliberate error', () => {
  assert.equal(read(d('108_pl_delivery_trigger_dryrun.sql')), build108Dryrun(read(d('108_pl_delivery_trigger.sql'))));
});
test('108 files are ASCII', () => {
  for (const f of ['108_pl_delivery_trigger.sql', '108_pl_delivery_trigger_dryrun.sql', '108_pl_delivery_trigger_rollback.sql', '108_pl_delivery_trigger_verify.sql']) {
    assert.ok(!/[^\x00-\x7F]/.test(read(d(f))), f);
  }
});

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE tms_check_runner;
  CREATE SCHEMA monitoring; CREATE TABLE monitoring.checks (id text PRIMARY KEY, red_value text, baseline text);
  CREATE TABLE clients (id bigint PRIMARY KEY, company_name text);
  CREATE TABLE locations (id bigint PRIMARY KEY, name text, city text, country text);
  CREATE TABLE orders (id bigint PRIMARY KEY, legacy_id text, stock_lot_id bigint, status text, pallet_exchange boolean, parent_order_id bigint, deleted_at timestamptz,
    client_id bigint, direction text, delivery_datetime date, actual_delivery_date date);
  CREATE TABLE order_stops (id bigint PRIMARY KEY, order_id bigint, stop_type text, pallets numeric, datetime date, location_id bigint, deleted_at timestamptz);
  CREATE TABLE stock_lots (id bigint PRIMARY KEY, order_id bigint, deleted_at timestamptz);
  CREATE TABLE shipments (id bigint PRIMARY KEY, order_id bigint, deleted_at timestamptz);
  CREATE SEQUENCE pl_seq START 1000;
  CREATE TABLE pl_movements (id bigint PRIMARY KEY DEFAULT nextval('pl_seq'), movement_date date NOT NULL, counterparty_type text NOT NULL,
    client_id bigint, partner_id bigint, location_id bigint, event_type text NOT NULL, taken int NOT NULL DEFAULT 0, given int NOT NULL DEFAULT 0,
    order_stop_id bigint, order_id bigint, status text NOT NULL DEFAULT 'pending', created_by text, confirmed_by text, confirmed_at timestamptz,
    CONSTRAINT one_counterparty CHECK ((counterparty_type = 'CLIENT' AND client_id IS NOT NULL AND partner_id IS NULL) OR (counterparty_type = 'PARTNER' AND partner_id IS NOT NULL AND client_id IS NULL)));
  CREATE UNIQUE INDEX pl_mov_stop_once ON pl_movements (order_stop_id, event_type)
    WHERE order_stop_id IS NOT NULL AND status <> 'reversed' AND event_type = ANY (ARRAY['LOADING'::text, 'DELIVERY'::text]);
  CREATE TABLE audit_log (id bigserial PRIMARY KEY, actor text NOT NULL, role text NOT NULL, action text NOT NULL, table_name text NOT NULL,
    record_id text, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE FUNCTION plan_h_audit(p_actor text, p_role text, p_action text, p_table text, p_id text, p_before jsonb, p_after jsonb) RETURNS void
    LANGUAGE plpgsql AS $f$ begin insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data)
    values (p_actor, p_role, p_action, p_table, p_id, p_before, p_after); end $f$;
  INSERT INTO monitoring.checks VALUES ('B-54', '0', NULL);
  INSERT INTO clients VALUES (1, 'Demo Client');
  INSERT INTO locations VALUES (1, 'Demo Point', 'Demo City', 'AT');
  -- o1 listed (old, one stop) · o2 listed (two stops) · o3 delivery written · o4 split leg · o5 own lot · o6 in transit
  -- o7 national leg (listed) · o8 reversed delivery only (listed) · o9 delivered, no exchange · o10 delivered, no client
  INSERT INTO orders (id, status, pallet_exchange, parent_order_id, client_id, direction, delivery_datetime) VALUES
    (1,'Delivered',true,null,1,'Export','2026-10-20'), (2,'Delivered',true,null,1,'Export','2026-10-21'), (3,'Delivered',true,null,1,'Export','2026-10-22'),
    (4,'Delivered',true,2,1,'Export','2026-10-22'), (5,'Delivered',true,null,1,'Import','2026-10-23'), (6,'In Transit',true,null,1,'Export','2026-10-24'),
    (7,'Delivered',true,null,1,'Import','2026-10-25'), (8,'Delivered',true,null,1,'Export','2026-10-26'), (9,'Delivered',false,null,1,'Export','2026-10-27'),
    (10,'Delivered',false,null,null,'Export','2026-10-28'), (11,'Delivered',true,null,null,'Export','2026-10-29');
  INSERT INTO order_stops VALUES
    (11,1,'Loading',30,'2026-10-18',1,null), (12,1,'Unloading',30,'2026-10-20',1,null),
    (21,2,'Unloading',10,'2026-10-21',1,null), (22,2,'Unloading',5,'2026-10-21',1,null),
    (31,3,'Unloading',8,'2026-10-22',1,null), (41,4,'Unloading',8,'2026-10-22',1,null), (51,5,'Unloading',8,'2026-10-23',1,null),
    (61,6,'Unloading',8,'2026-10-24',1,null), (62,6,'Unloading',0,'2026-10-24',1,null), (71,7,'Unloading',8,'2026-10-25',1,null),
    (81,8,'Unloading',8,'2026-10-26',1,null), (91,9,'Unloading',7,'2026-10-27',1,null), (101,10,'Unloading',8,'2026-10-28',1,null),
    (111,11,'Unloading',8,'2026-10-29',1,null);
  INSERT INTO stock_lots VALUES (1, 5, null);
  INSERT INTO shipments VALUES (1, 7, null);
  INSERT INTO pl_movements (id, movement_date, counterparty_type, client_id, event_type, taken, given, order_stop_id, order_id, status) VALUES
    (300,'2026-10-22','CLIENT',1,'DELIVERY',8,6,31,3,'confirmed'), (800,'2026-10-26','CLIENT',1,'DELIVERY',8,8,81,8,'reversed');`;

test('PGlite: 107, then 108: dry run, apply, every case, rollback, apply again', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  await db.exec(SCHEMA);
  const runs = async (sql) => { try { await db.exec(sql); return 'ok'; } catch (e) { return e.message; } };
  const n = async (q) => Number((await db.query(q)).rows[0].n);
  const dels = (oid) => n(`SELECT count(*) n FROM pl_movements WHERE order_id = ${oid} AND event_type = 'DELIVERY' AND status = 'confirmed'`);
  const trig = () => n(`SELECT count(*) n FROM audit_log WHERE actor = 'system' AND after_data ->> 'source' = 'trigger:108'`);
  assert.equal(await runs(read('107_pl_missing_delivery.sql')), 'ok');
  assert.equal(await n(`SELECT count(*) n FROM pl_v_missing_delivery`), 6, '107 lists 12, 21, 22, 71, 81 + 111 (clientless, the newest)');

  // dry run: re-save of the 4 listed orders writes 0; the transition of the newest listed order (o8, stop 81) writes 1
  const dry = await runs(read(d('108_pl_delivery_trigger_dryrun.sql')));
  assert.match(dry, /DRY RUN 108 finished: re-save of 5 listed orders wrote 0; transition of order 8 wrote 1 deliveries \(audit 1\); triggers 0 -> 2/, dry);
  assert.equal(await n(`SELECT count(*) n FROM pg_trigger WHERE tgname LIKE 'pl_delivery_from_%'`), 0, 'dry run kept a trigger');
  assert.equal(await n(`SELECT count(*) n FROM pl_movements WHERE created_by = 'system'`), 0, 'dry run kept a movement');
  assert.equal((await db.query(`SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`)).rows[0].red_value, '0');

  assert.equal(await runs(read(d('108_pl_delivery_trigger.sql'))), 'ok');
  assert.equal((await db.query(`SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`)).rows[0].red_value, '2');

  // a re-save of an old listed order (status and exchange unchanged) writes nothing
  await db.exec(`UPDATE orders SET status = status, pallet_exchange = pallet_exchange WHERE id IN (1, 2)`);
  assert.equal(await dels(1) + await dels(2), 0, 're-save: nothing');
  // a status transition writes one per stop with pallets, dated today (the 0-pallet stop 62 skipped)
  await db.exec(`UPDATE orders SET status = 'Delivered' WHERE id = 6`);
  const m6 = (await db.query(`SELECT order_stop_id::int s, taken, given, movement_date::text dt, created_by FROM pl_movements WHERE order_id = 6`)).rows;
  assert.deepEqual(m6.map((r) => r.s), [61]);
  assert.equal(m6[0].taken, 8); assert.equal(m6[0].given, 8); assert.equal(m6[0].created_by, 'system');
  assert.equal(m6[0].dt, (await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Athens')::date)::text t`)).rows[0].t);
  // exchange switched on after delivery: dated by the stop
  await db.exec(`UPDATE orders SET pallet_exchange = true WHERE id = 9`);
  assert.equal((await db.query(`SELECT movement_date::text dt FROM pl_movements WHERE order_id = 9`)).rows[0].dt, '2026-10-27');
  // split leg, lot, corrected stop, clientless order: nothing
  for (const oid of [4, 5, 3]) { await db.exec(`UPDATE orders SET pallet_exchange = false WHERE id = ${oid}; UPDATE orders SET pallet_exchange = true WHERE id = ${oid}`); }
  await db.exec(`UPDATE orders SET pallet_exchange = true WHERE id = 10`);
  assert.equal(await dels(4) + await dels(5) + await dels(10), 0, 'leg / lot / no client: nothing');
  assert.equal(await dels(3), 1, 'the corrected stop keeps its one live delivery (ON CONFLICT)');
  // a new unloading stop of a delivered order with exchange: its delivery only
  await db.exec(`INSERT INTO order_stops VALUES (82, 8, 'Unloading', 3, '2026-10-26', 1, null)`);
  assert.deepEqual((await db.query(`SELECT order_stop_id::int s FROM pl_movements WHERE order_id = 8 AND status = 'confirmed'`)).rows.map((r) => r.s), [82]);
  assert.equal(await trig(), 3, 'three rows by the trigger, three audit rows (61, 91, 82)');
  assert.deepEqual((await db.query(`SELECT order_stop_id::int s FROM pl_v_missing_delivery ORDER BY 1`)).rows.map((r) => r.s), [12, 21, 22, 71, 81, 101, 111],
    'the old listed stops untouched (12, 21, 22, 71, 81, 111) + the clientless order, said in the list (101)');

  const v = (await db.query(read(d('108_pl_delivery_trigger_verify.sql')))).rows[0];
  assert.equal(v.result, '108 in place'); assert.equal(v.b54_matches, true); assert.equal(v.anon_execute, false);
  assert.match(await runs(read(d('108_pl_delivery_trigger.sql'))), /108 has run/);
  assert.equal(await runs(read(d('108_pl_delivery_trigger_rollback.sql'))), 'ok');
  assert.equal(await n(`SELECT count(*) n FROM pg_trigger WHERE tgname LIKE 'pl_delivery_from_%'`), 0);
  assert.equal((await db.query(`SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`)).rows[0].red_value, '0');
  assert.equal(await trig(), 3, 'rollback keeps the rows written');
  assert.equal(await runs(read(d('108_pl_delivery_trigger.sql'))), 'ok', '108 runs again');
});
