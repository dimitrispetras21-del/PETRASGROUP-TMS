// 107 (U4, owner 27–28/10): the dry run is 107 verbatim + one checked act + a deliberate error (generated), and,
// where PGlite is installed (PGLITE=<path to @electric-sql/pglite/dist/index.js>), the whole sequence runs on a
// small copy of the tables 107 reads: the dry run keeps nothing, 107 lists exactly the stops the feeder would have
// written, the act refuses every case the owner named and switches one order with its trace in one transaction,
// a second 107 stops, the rollback drops it (writes stay) and 107 runs again. Invented rows only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build107Dryrun } from '../migrations/drafts/tools/build-107-dryrun.mjs';

const D = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/drafts');
const read = (f) => fs.readFileSync(path.join(D, f), 'utf8');

test('the dry run is 107 verbatim plus the checked act and the deliberate error', () => {
  assert.equal(read('107_pl_missing_delivery_dryrun.sql'), build107Dryrun(read('107_pl_missing_delivery.sql')));
});

test('107 files are ASCII (the SQL editor and the clipboard mangle the rest)', () => {
  for (const f of ['107_pl_missing_delivery.sql', '107_pl_missing_delivery_dryrun.sql', '107_pl_missing_delivery_rollback.sql', '107_pl_missing_delivery_verify.sql']) {
    assert.ok(!/[^\x00-\x7F]/.test(read(f)), f);
  }
});

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE tms_check_runner;
  CREATE TABLE clients (id bigint PRIMARY KEY, company_name text);
  CREATE TABLE locations (id bigint PRIMARY KEY, name text, city text, country text);
  CREATE TABLE orders (id bigint PRIMARY KEY, legacy_id text, status text, pallet_exchange boolean, parent_order_id bigint, deleted_at timestamptz,
    client_id bigint, direction text, delivery_datetime date, actual_delivery_date date);
  CREATE TABLE order_stops (id bigint PRIMARY KEY, order_id bigint, stop_type text, pallets numeric, datetime date, location_id bigint, deleted_at timestamptz);
  CREATE TABLE stock_lots (id bigint PRIMARY KEY, order_id bigint, deleted_at timestamptz);
  CREATE TABLE shipments (id bigint PRIMARY KEY, order_id bigint, deleted_at timestamptz);
  CREATE TABLE pl_movements (id bigint PRIMARY KEY, order_id bigint, order_stop_id bigint, event_type text, status text, taken int, given int);
  CREATE TABLE audit_log (id bigserial PRIMARY KEY, actor text NOT NULL, role text NOT NULL, action text NOT NULL, table_name text NOT NULL,
    record_id text, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE FUNCTION plan_h_audit(p_actor text, p_role text, p_action text, p_table text, p_id text, p_before jsonb, p_after jsonb) RETURNS void
    LANGUAGE plpgsql AS $f$ begin insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data)
    values (p_actor, p_role, p_action, p_table, p_id, p_before, p_after); end $f$;
  INSERT INTO clients VALUES (1, 'Demo Client');
  INSERT INTO locations VALUES (1, 'Demo Point', 'Demo City', 'AT');
  -- o1 one stop, missing, a pending loading · o2 two stops, both missing (+ a 0-pallet stop) · o3 delivery written
  -- o4 split leg · o5 own stock lot · o6 not delivered · o7 national leg · o8 reversed delivery only · o9 no exchange
  INSERT INTO orders (id, status, pallet_exchange, parent_order_id, client_id, direction, delivery_datetime) VALUES
    (1,'Delivered',true,null,1,'Export','2026-10-20'), (2,'Delivered',true,null,1,'Export','2026-10-21'), (3,'Delivered',true,null,1,'Export','2026-10-22'),
    (4,'Delivered',true,2,1,'Export','2026-10-22'), (5,'Delivered',true,null,1,'Import','2026-10-23'), (6,'In Transit',true,null,1,'Export','2026-10-24'),
    (7,'Delivered',true,null,1,'Import','2026-10-25'), (8,'Delivered',true,null,1,'Export','2026-10-26'), (9,'Delivered',false,null,1,'Export','2026-10-27');
  INSERT INTO order_stops VALUES
    (11,1,'Loading',30,'2026-10-18',1,null), (12,1,'Unloading',30,'2026-10-20',1,null),
    (21,2,'Unloading',10,'2026-10-21',1,null), (22,2,'Unloading',5,'2026-10-21',1,null), (23,2,'Unloading',0,'2026-10-21',1,null),
    (31,3,'Unloading',8,'2026-10-22',1,null), (41,4,'Unloading',8,'2026-10-22',1,null), (51,5,'Unloading',8,'2026-10-23',1,null),
    (61,6,'Unloading',8,'2026-10-24',1,null), (71,7,'Unloading',8,'2026-10-25',1,null), (81,8,'Unloading',8,'2026-10-26',1,null),
    (91,9,'Unloading',8,'2026-10-27',1,null);
  INSERT INTO stock_lots VALUES (1, 5, null);
  INSERT INTO shipments VALUES (1, 7, null);
  INSERT INTO pl_movements VALUES (100,1,11,'LOADING','pending',30,0), (101,1,null,'RETURN_OUT','confirmed',0,4),
    (300,3,31,'DELIVERY','confirmed',8,8), (800,8,81,'DELIVERY','reversed',8,8);`;

test('PGlite: dry run, apply, refusals, the act, re-apply, rollback, apply again', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  await db.exec(SCHEMA);
  const runs = async (sql) => { try { await db.exec(sql); return 'ok'; } catch (e) { return e.message; } };
  const one = async (q) => (await db.query(q)).rows[0];
  const act = async (p, role = 'accountant') => {
    try { return (await db.query(`SELECT pl_no_exchange($1::jsonb, 'demo', $2) r`, [JSON.stringify(p), role])).rows[0].r; }
    catch (e) { return e.message; }
  };

  // the dry run: 5 stops (12, 21, 22, 71, 81); the candidate = newest single-stop order without a national leg = o8
  const dry = await runs(read('107_pl_missing_delivery_dryrun.sql'));
  assert.match(dry, /DRY RUN 107 finished: 5 stops listed, act checked on order 8 \(0 pending deleted\)/, dry);
  assert.equal((await one(`SELECT to_regclass('public.pl_v_missing_delivery')::text v`)).v, null, 'dry run kept the view');
  assert.equal((await one(`SELECT count(*)::int n FROM audit_log`)).n, 0, 'dry run kept audit rows');
  assert.equal((await one(`SELECT pallet_exchange FROM orders WHERE id = 8`)).pallet_exchange, true, 'dry run kept the switch');

  assert.equal(await runs(read('107_pl_missing_delivery.sql')), 'ok');
  const list = (await db.query(`SELECT order_stop_id::int s, unloading_stops, has_nat_leg FROM pl_v_missing_delivery ORDER BY order_stop_id`)).rows;
  assert.deepEqual(list.map((r) => r.s), [12, 21, 22, 71, 81],
    'listed: o1, o2 x2, o7 (national), o8 (reversed delivery); not o3 (written), o4 (leg), o5 (lot), o6 (not delivered), o9 (no exchange), the 0-pallet stop');
  assert.equal(list.find((r) => r.s === 21).unloading_stops, 2);
  assert.equal(list.find((r) => r.s === 71).has_nat_leg, true);

  for (const [p, role, code] of [
    [{ order_id: 1, order_stop_id: 12, reason: 'x y z' }, 'dispatcher', 'role'],
    [{ order_id: 1, order_stop_id: 12, reason: '  ' }, 'accountant', 'reason'],
    [{ order_id: 'x', order_stop_id: 12, reason: 'no exchange' }, 'accountant', 'bad_ids'],
    [{ order_id: 99, order_stop_id: 12, reason: 'no exchange' }, 'accountant', 'gone'],
    [{ order_id: 2, order_stop_id: 21, reason: 'no exchange' }, 'accountant', 'multi'],
    [{ order_id: 7, order_stop_id: 71, reason: 'no exchange' }, 'accountant', 'nat_leg'],
    [{ order_id: 6, order_stop_id: 61, reason: 'no exchange' }, 'accountant', 'not_delivered'],
    [{ order_id: 4, order_stop_id: 41, reason: 'no exchange' }, 'accountant', 'split_leg'],
    [{ order_id: 5, order_stop_id: 51, reason: 'no exchange' }, 'accountant', 'lot'],
    [{ order_id: 9, order_stop_id: 91, reason: 'no exchange' }, 'accountant', 'already'],
    [{ order_id: 1, order_stop_id: 11, reason: 'no exchange' }, 'accountant', 'stop'],
    [{ order_id: 3, order_stop_id: 31, reason: 'no exchange' }, 'accountant', 'done']]) {
    const r = await act(p, role);
    assert.match(String(r), new RegExp('pln rule broken: ' + code + ':'), JSON.stringify(p) + ' → ' + r);
  }
  assert.equal((await one(`SELECT count(*)::int n FROM audit_log`)).n, 0, 'a refusal writes nothing');

  await db.exec(`UPDATE orders SET legacy_id = 'recO1' WHERE id = 1`);
  const ok = await act({ order_id: 1, order_stop_id: 12, reason: 'client keeps no empties' });
  assert.deepEqual(ok.deleted.map(Number), [100]);
  assert.deepEqual(ok.confirmed_kept.map(Number), [101]);
  assert.equal((await one(`SELECT pallet_exchange FROM orders WHERE id = 1`)).pallet_exchange, false);
  assert.equal((await one(`SELECT count(*)::int n FROM pl_movements WHERE order_id = 1 AND status = 'pending'`)).n, 0);
  const tr = (await db.query(`SELECT actor, action, table_name, record_id, after_data FROM audit_log ORDER BY id`)).rows;
  assert.deepEqual(tr.map((r) => `${r.action}:${r.table_name}:${r.record_id}`), ['delete:pl_movements:100', 'update:orders:recO1']);
  assert.equal(tr[1].actor, 'demo');
  assert.equal(tr[1].after_data.reason, 'client keeps no empties');
  assert.equal(tr[1].after_data.invoice_gate, 'open');
  assert.equal((await one(`SELECT count(*)::int n FROM pl_v_missing_delivery WHERE order_stop_id = 12`)).n, 0, 'the stop leaves the list');

  assert.match(await runs(read('107_pl_missing_delivery.sql')), /107 has run/);
  const v = await one(read('107_pl_missing_delivery_verify.sql'));
  assert.equal(v.result, '107 in place');
  assert.equal(v.anon_select, false);
  assert.equal(v.auth_execute, false);
  assert.equal(v.runner_select, true);
  assert.equal(v.runner_reads_bases, false, 'the stub runner reads no base table: said, not hidden');
  assert.equal(await runs(read('107_pl_missing_delivery_rollback.sql')), 'ok');
  assert.equal((await one(`SELECT to_regclass('public.pl_v_missing_delivery')::text v`)).v, null);
  assert.equal((await one(`SELECT pallet_exchange FROM orders WHERE id = 1`)).pallet_exchange, false, 'rollback keeps the writes made');
  assert.equal(await runs(read('107_pl_missing_delivery.sql')), 'ok', '107 runs again after the rollback');
});
