// 111 (the base of the new international order form, owner 8/11): the four files are the builder's output (so the
// rollback's old bodies stay byte for byte what 074 / 107 / 108 wrote), ASCII, and, where PGlite is installed
// (PGLITE=<path to @electric-sql/pglite/dist/index.js>), 074's bridge + 107 + 108 as they are live, then 111, run on a
// small copy of the tables: the dry run keeps nothing; the bridges do not move on apply; a stop set direct loses its
// bridge and gets it back; the hours take HH:MM only; the delivery follows the stop's exchange; rollback restores it
// all (a direct stop is bridged again) and 111 runs again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, oldBodies, OLD_CHECKS, LIVE_VIEW_MD5 } from '../migrations/drafts/tools/build-111.mjs';

const M = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const read = (f) => fs.readFileSync(path.join(M, f), 'utf8');
const d = (f) => f;   // 111 ran 8/11 (owner): its files left drafts/ (CLAUDE.md, rule 5)

test('the four 111 files are the builder output', () => {
  for (const [f, t] of Object.entries(buildAll())) assert.equal(read(d(f)), t, f);
});
test('111 files are ASCII', () => {
  for (const f of Object.keys(buildAll())) assert.ok(!/[^\x00-\x7F]/.test(read(d(f))), f);
});

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE tms_check_runner;
  CREATE SCHEMA monitoring;
  CREATE TABLE monitoring.checks (id text PRIMARY KEY, red_value text, baseline text, sql_text text, ids_sql text, title text, impact text, next_step text, exceptions text);
  CREATE TABLE plan_config (id int PRIMARY KEY, cutover_day date);
  INSERT INTO plan_config VALUES (1, '2026-10-24');
  CREATE TABLE clients (id bigint PRIMARY KEY, company_name text);
  CREATE TABLE locations (id bigint PRIMARY KEY, name text, city text, country text);
  CREATE TABLE orders (id bigint PRIMARY KEY, legacy_id text, reference text, stock_lot_id bigint, status text, pallet_exchange boolean,
    parent_order_id bigint, deleted_at timestamptz, client_id bigint, direction text, delivery_datetime date, actual_delivery_date date,
    veroia_switch boolean, cross_dock_date date);
  CREATE TABLE order_stops (id bigint PRIMARY KEY, legacy_id text, order_id bigint, stop_type text, pallets numeric, datetime date,
    location_id bigint, deleted_at timestamptz, pallets_exchanged numeric, via_hub boolean NOT NULL DEFAULT false,
    CONSTRAINT order_stops_via_hub_intl CHECK ((NOT via_hub) OR (order_id IS NOT NULL)));
  CREATE TABLE stock_lots (id bigint PRIMARY KEY, order_id bigint, deleted_at timestamptz);
  CREATE SEQUENCE sh_seq START 500;
  CREATE TABLE shipments (id bigint PRIMARY KEY DEFAULT nextval('sh_seq'), order_id bigint, nat_order_id bigint, order_stop_id bigint, created_by text,
    deleted_at timestamptz, deleted_reason text, deleted_by text, executed boolean NOT NULL DEFAULT false);
  CREATE TABLE shipment_pieces (id bigint PRIMARY KEY DEFAULT nextval('sh_seq'), shipment_id bigint, pallets numeric, created_by text,
    deleted_at timestamptz, deleted_reason text, deleted_by text);
  CREATE TABLE piece_legs (id bigint PRIMARY KEY DEFAULT nextval('sh_seq'), piece_id bigint, deleted_at timestamptz);
  CREATE TABLE national_loads (id bigint PRIMARY KEY, legacy_id text, source_order_id bigint, source_type text, truck_id bigint,
    partner_id bigint, status text, deleted_at timestamptz);
  CREATE TABLE plan_cutover_log (kind text, table_name text, row_id bigint, reason text, before_data jsonb);
  CREATE TABLE notices (kind text, args text[], order_id bigint);
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
  -- 074's helpers the bodies call, small: the cut is plan_config's day; retire = soft delete, or a notice once executed
  CREATE FUNCTION plan_cutover_day() RETURNS date LANGUAGE sql STABLE AS $f$ select cutover_day from plan_config where id = 1 $f$;
  CREATE FUNCTION plan_h_vs_nat_side(p_direction text, p_stop_type text) RETURNS boolean LANGUAGE sql IMMUTABLE AS
    $f$ select coalesce((p_direction = 'Import' and p_stop_type = 'Unloading') or (p_direction = 'Export' and p_stop_type = 'Loading'), false) $f$;
  CREATE FUNCTION plan_h_vs_in_v5(p_order bigint) RETURNS boolean LANGUAGE sql STABLE AS $f$
    select coalesce((select o.deleted_at is null and o.veroia_switch is true and o.status is distinct from 'Cancelled'
       and o.cross_dock_date >= plan_cutover_day() from orders o where o.id = p_order), false) $f$;
  CREATE FUNCTION plan_h_bridge_executed(p_sh bigint) RETURNS boolean LANGUAGE sql STABLE AS $f$ select executed from shipments where id = p_sh $f$;
  CREATE FUNCTION plan_h_notice(text, text, text, text[], bigint, bigint, bigint, text, text) RETURNS void LANGUAGE sql AS
    $f$ insert into notices values ($2, $4, $5) $f$;
  CREATE FUNCTION plan_h_bridge_retire(p_sh bigint, p_reason text, p_actor text, p_role text) RETURNS void LANGUAGE plpgsql AS $f$
  begin
    if (select executed from shipments where id = p_sh) then
      perform plan_h_notice('natl', 'vs_changed_after_execution', '', null, null, null, null, p_actor, p_role); return;
    end if;
    update shipment_pieces set deleted_at = now(), deleted_reason = p_reason where shipment_id = p_sh and deleted_at is null;
    update shipments set deleted_at = now(), deleted_reason = p_reason where id = p_sh and deleted_at is null;
  end $f$;
  CREATE FUNCTION plan_h_bridge_place(bigint, bigint, bigint, text, text) RETURNS void LANGUAGE sql AS $f$ select $f$;
  CREATE FUNCTION plan_h_bridge_recut(bigint, text, text, text) RETURNS void LANGUAGE sql AS $f$ insert into notices values ('recut', null, null) $f$;
  CREATE FUNCTION plan_h_bridge_unplan(bigint, bigint, text, text, text) RETURNS void LANGUAGE sql AS $f$ insert into notices values ('unplan', null, $1) $f$;
  INSERT INTO monitoring.checks (id, red_value) VALUES ('B-54', '2');   -- the live order + stop triggers below
  INSERT INTO clients VALUES (1, 'Demo Client');
  INSERT INTO locations VALUES (1, 'Demo Point', 'Demo City', 'AT');
  -- o1 import VS in v5: 11 loading, 12 / 13 national side, 14 with 0 pallets · o2 export, not VS
  -- o3 export with exchange, four unloading stops of 8 (for 108)
  INSERT INTO orders (id, status, pallet_exchange, client_id, direction, delivery_datetime, veroia_switch, cross_dock_date) VALUES
    (1, 'Assigned', false, 1, 'Import', '2026-11-12', true, '2026-11-11'), (2, 'Assigned', false, 1, 'Export', '2026-11-12', false, null),
    (3, 'In Transit', true, 1, 'Export', '2026-11-05', false, null);
  INSERT INTO order_stops (id, order_id, stop_type, pallets, datetime, location_id) VALUES
    (11, 1, 'Loading', 20, '2026-11-09', 1), (12, 1, 'Unloading', 12, '2026-11-12', 1), (13, 1, 'Unloading', 8, '2026-11-12', 1),
    (14, 1, 'Unloading', 0, '2026-11-12', 1), (21, 2, 'Loading', 10, '2026-11-09', 1), (22, 2, 'Unloading', 10, '2026-11-12', 1),
    (31, 3, 'Unloading', 8, '2026-11-05', 1), (32, 3, 'Unloading', 8, '2026-11-05', 1), (33, 3, 'Unloading', 8, '2026-11-05', 1),
    (34, 3, 'Unloading', 8, '2026-11-05', 1);`;

// 074's three bodies as they are live (the builder finds them by md5), with the stop trigger of today
// the live order trigger of 074 (pg_get_functiondef on production 8/11)
const ON_ORDER = `
begin
  if plan_cutover_day() is null then return null; end if;
  -- the common case first: an order that is not a VS and never was bridged is not the bridge's
  if new.veroia_switch is not true and (tg_op = 'INSERT' or old.veroia_switch is not true)
     and not exists (select 1 from shipments s where s.order_id = new.id and s.deleted_at is null) then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.cross_dock_date is distinct from new.cross_dock_date
     and current_setting('plan.writer', true) is distinct from 'natl' then
    perform plan_h_bridge_unplan(new.id, null, 'trigger:plan_bridge_sync', 'trigger:plan_bridge_sync', 'system');
  end if;
  perform plan_bridge_sync(new.id, 'trigger:plan_bridge_sync');
  return null;
end
`;
function liveBridge() {
  const o = oldBodies();
  return `
  CREATE FUNCTION plan_bridge_on_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$${ON_ORDER}$f$;
  CREATE TRIGGER plan_bridge_on_order AFTER INSERT OR UPDATE OF veroia_switch, cross_dock_date, deleted_at, status, direction
    ON orders FOR EACH ROW EXECUTE FUNCTION plan_bridge_on_order();
  CREATE FUNCTION plan_h_bridge_wanted(p_stop bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$${o.wanted}$f$;
  CREATE FUNCTION plan_bridge_sync(p_order bigint, p_why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$${o.sync}$f$;
  CREATE FUNCTION plan_bridge_on_stop() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$${o.onStop}$f$;
  CREATE TRIGGER plan_bridge_on_stop AFTER INSERT OR UPDATE OF location_id, pallets, deleted_at, stop_type, datetime, order_id
    ON order_stops FOR EACH ROW EXECUTE FUNCTION plan_bridge_on_stop();`;
}

test('PGlite: live bridge + 107 + 108, then 111: dry run, apply, every case, rollback, apply again', { skip: !process.env.PGLITE && 'set PGLITE to run' }, async () => {
  const { PGlite } = await import(process.env.PGLITE);
  const db = new PGlite();
  await db.exec(SCHEMA);
  const runs = async (sql) => { try { await db.exec(sql); return 'ok'; } catch (e) { return e.message; } };
  const rows = async (q) => (await db.query(q)).rows;
  const n = async (q) => Number((await rows(q))[0].n);
  const ids = async (q) => (await rows(q)).map((r) => Number(r.i));
  const bridged = async (stop) => n(`SELECT count(*) n FROM shipments WHERE order_stop_id = ${stop} AND deleted_at IS NULL`);
  const liveBridges = () => ids(`SELECT order_stop_id i FROM shipments WHERE deleted_at IS NULL ORDER BY 1`);
  const check = async (id) => Number((await rows((await rows(`SELECT sql_text FROM monitoring.checks WHERE id = '${id}'`))[0].sql_text))[0].count);
  assert.equal(await runs(liveBridge()), 'ok');
  assert.equal(await runs(read('107_pl_missing_delivery.sql')), 'ok');
  assert.equal(await runs(read('108_pl_delivery_trigger.sql')), 'ok');
  for (const [id, c] of Object.entries(OLD_CHECKS)) {
    await db.query(`INSERT INTO monitoring.checks (id, sql_text, ids_sql) VALUES ($1, $2, $3)`, [id, c.sql_text, c.ids_sql]);
  }
  // the bridge as it is live: o1's two national-side stops with pallets are bridged and via_hub is echoed on them
  await db.exec(`SELECT plan_bridge_sync(1, 'seed')`);
  // stop 12's piece is already on a national truck (a live leg): the dry run must prove on stop 13, never on it
  await db.exec(`INSERT INTO piece_legs (piece_id) SELECT sp.id FROM shipment_pieces sp JOIN shipments b ON b.id = sp.shipment_id WHERE b.order_stop_id = 12`);
  assert.deepEqual(await liveBridges(), [12, 13]);
  assert.deepEqual(await ids(`SELECT id i FROM order_stops WHERE via_hub ORDER BY 1`), [12, 13]);
  assert.equal(await check('B-95'), 0); assert.equal(await check('B-99'), 0);
  // the 107 view deparses to the very text production holds (its md5 is the guard's), and a changed body is refused
  const localView = (await rows(`SELECT md5(pg_get_viewdef('pl_v_missing_delivery'::regclass, true)) h`))[0].h;
  assert.equal(localView, LIVE_VIEW_MD5);
  const local = (sql) => sql;
  const files = buildAll();
  await db.exec(`CREATE OR REPLACE FUNCTION plan_h_bridge_wanted(p_stop bigint) RETURNS boolean LANGUAGE sql STABLE AS $f$ select false $f$`);
  assert.match(await runs(files['111_intl_form_stops.sql']), /plan_h_bridge_wanted\(bigint\) is not the text 111 was written against/);
  assert.equal(await runs(`CREATE OR REPLACE FUNCTION plan_h_bridge_wanted(p_stop bigint) RETURNS boolean LANGUAGE sql STABLE
    SECURITY DEFINER SET search_path = public AS $f$${oldBodies().wanted}$f$`), 'ok', 'the live body back');

  // dry run: o1's stop 12 direct and back; delivery proof skipped (nothing listed yet); NOTHING kept
  const dry = await runs(local(files['111_intl_form_stops_dryrun.sql']));
  assert.match(dry, /DRY RUN 111 finished: via_hub 2 true \+ 8 false -> NULL; B-95 0, B-99 0, shipments 2 = 2; stop 13 of order 1 direct and back \(bridges 2 -> 1 -> 2\); delivery stop none/, dry);
  assert.equal(await n(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'order_stops' AND column_name = 'time_from'`), 0, 'dry run kept a column');
  assert.equal(await n(`SELECT count(*) n FROM order_stops WHERE via_hub`), 2, 'dry run kept the reset');
  assert.deepEqual(await liveBridges(), [12, 13]);

  // apply
  assert.equal(await runs(local(files['111_intl_form_stops.sql'])), 'ok');
  assert.equal(await n(`SELECT count(*) n FROM order_stops WHERE via_hub IS NOT NULL`), 0, 'every echo is NULL');
  assert.deepEqual(await liveBridges(), [12, 13], 'bridges unchanged');
  assert.match(await runs(local(files['111_intl_form_stops.sql'])), /111 has run/);

  // (b) the desk's choice, stop by stop, each on its own
  const notes = (kinds) => n(`SELECT count(*) n FROM notices WHERE kind IN (${kinds.map((k) => `'${k}'`).join(', ')})`);
  const before = await notes(['recut', 'unplan']);
  await db.exec(`UPDATE order_stops SET via_hub = false, pallets = 9, datetime = '2026-11-13' WHERE id = 13`);
  assert.equal(await bridged(13), 0, 'direct: no bridge');
  assert.equal(await notes(['recut', 'unplan']), before, 'no recut / unplan for a load leaving the board');
  await db.exec(`UPDATE order_stops SET pallets = 10 WHERE id = 12`);
  assert.equal(await notes(['recut']), 1, 'a bridged stop still recuts');
  // an executed bridge kept on a direct stop still follows its stop
  await db.exec(`UPDATE order_stops SET via_hub = NULL WHERE id = 13`);
  await db.exec(`UPDATE shipments SET executed = true WHERE order_stop_id = 13 AND deleted_at IS NULL`);
  await db.exec(`UPDATE order_stops SET via_hub = false WHERE id = 13`);
  assert.equal(await bridged(13), 1, 'executed: kept, with a notice');
  await db.exec(`UPDATE order_stops SET pallets = 7 WHERE id = 13`);
  assert.equal(await notes(['recut']), 2, 'the kept bridge is recut');
  await db.exec(`UPDATE shipments SET executed = false WHERE order_stop_id = 13; UPDATE order_stops SET via_hub = NULL WHERE id = 13`);
  await db.exec(`UPDATE order_stops SET via_hub = false, pallets = 8 WHERE id = 13`);
  assert.equal(await bridged(13), 0);
  assert.equal(await bridged(12), 1, 'the other stop never moves');
  await db.exec(`UPDATE order_stops SET via_hub = true WHERE id = 13`);
  assert.equal(await bridged(13), 1, 'through Veroia: bridged again');
  await db.exec(`INSERT INTO order_stops (id, order_id, stop_type, pallets, datetime, location_id) VALUES (15, 1, 'Unloading', 4, '2026-11-12', 1)`);
  assert.equal(await bridged(15), 1, 'a new stop without a choice follows the VS');
  await db.exec(`UPDATE order_stops SET via_hub = true WHERE id = 11`);
  assert.equal(await bridged(11), 0, 'a tick on the loading of an import is never a bridge');
  assert.equal(await check('B-95'), 0);
  assert.equal(await check('B-99'), 1, 'B-99 says the tick on the wrong side (stop 11)');
  await db.exec(`UPDATE order_stops SET via_hub = NULL WHERE id = 11`);
  await db.exec(`UPDATE orders SET veroia_switch = false WHERE id = 1`);
  assert.equal(await n(`SELECT count(*) n FROM shipments WHERE order_id = 1 AND deleted_at IS NULL`), 0, 'VS off: every bridge goes');
  await db.exec(`UPDATE orders SET veroia_switch = true WHERE id = 1`);
  assert.deepEqual(await liveBridges(), [12, 13, 15], 'VS on again: the choices hold');
  assert.equal(await check('B-95'), 0); assert.equal(await check('B-99'), 0);

  // (a) the hours: HH:MM only, both optional, a night window allowed
  assert.equal(await runs(`UPDATE order_stops SET time_from = '08:00', time_to = '14:30' WHERE id = 12`), 'ok');
  assert.equal(await runs(`UPDATE order_stops SET time_from = '22:00', time_to = '06:00' WHERE id = 13`), 'ok', 'a night window');
  assert.match(await runs(`UPDATE order_stops SET time_from = '8:00' WHERE id = 12`), /order_stops_time_from_fmt/);
  assert.match(await runs(`UPDATE order_stops SET time_to = '24:00' WHERE id = 12`), /order_stops_time_to_fmt/);

  // (c) the delivery follows the stop's exchange: 31 none (0), 32 three of 8, 33 every pallet (NULL), 34 a typo (40)
  await db.exec(`UPDATE order_stops SET pallets_exchanged = 0 WHERE id = 31; UPDATE order_stops SET pallets_exchanged = 3 WHERE id = 32;
                 UPDATE order_stops SET pallets_exchanged = 40 WHERE id = 34; UPDATE orders SET status = 'Delivered' WHERE id = 3`);
  const mv = await rows(`SELECT order_stop_id::int s, taken, given FROM pl_movements WHERE order_id = 3 ORDER BY 1`);
  assert.deepEqual(mv.map((r) => [r.s, r.taken, r.given]), [[32, 3, 3], [33, 8, 8], [34, 8, 8]]);
  assert.equal((await rows(`SELECT after_data ->> 'stop_exchanged' x FROM audit_log WHERE after_data ->> 'source' = 'trigger:108'
                             AND (after_data ->> 'order_stop_id')::int = 34`))[0].x, '40', 'the typo is in the trace');
  assert.equal(await n(`SELECT count(*) n FROM pl_v_missing_delivery WHERE order_id = 3`), 0, 'the stop at 0 is not missing');

  const v = (await rows(files['111_intl_form_stops_verify.sql']))[0];
  assert.equal(v.result, '111 in place'); assert.equal(Number(v.b95), 0); assert.equal(Number(v.b99), 0); assert.equal(v.anon_execute, false);
  assert.equal(Number(v.stops_with_hour), 2); assert.equal(Number(v.stops_exchange_set), 3);

  // rollback with hours written: everything back, the hour columns kept and said; a direct stop is bridged again
  await db.exec(`UPDATE order_stops SET via_hub = false WHERE id = 13`);
  assert.equal(await bridged(13), 0);
  assert.equal(await runs(files['111_intl_form_stops_rollback.sql']), 'ok');
  assert.equal(await bridged(13), 1, 'rollback: the direct stop is bridged again (074 rule)');
  assert.deepEqual(await ids(`SELECT id i FROM order_stops WHERE via_hub ORDER BY 1`), [12, 13, 15], 'the old echo is back');
  assert.equal((await rows(`SELECT is_nullable x FROM information_schema.columns WHERE table_name = 'order_stops' AND column_name = 'via_hub'`))[0].x, 'NO');
  assert.equal(await n(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'order_stops' AND column_name IN ('time_from', 'time_to')`), 2, 'hours kept');
  const o = oldBodies();
  for (const [sig, k] of [['plan_h_bridge_wanted(bigint)', 'wanted'], ['plan_bridge_sync(bigint,text)', 'sync'], ['plan_bridge_on_stop()', 'onStop'], ['pl_h_delivery_write(bigint,bigint,text)', 'delivery']]) {
    assert.equal((await rows(`SELECT prosrc FROM pg_proc WHERE oid = '${sig}'::regprocedure`))[0].prosrc, o[k], sig + ' back byte for byte');
  }
  assert.equal((await rows(`SELECT md5(pg_get_viewdef('pl_v_missing_delivery'::regclass, true)) h`))[0].h, localView, 'view back');
  assert.equal(await check('B-95'), 0); assert.equal(await check('B-99'), 0);
  assert.equal((await rows(files['111_intl_form_stops_verify.sql']))[0].result, '111 NOT in place');

  // with the hour columns kept, 111 says so (never «has run»); once they are gone, 111 runs again and its rollback
  // drops the empty columns
  assert.match(await runs(local(files['111_intl_form_stops.sql'])), /a rollback kept the hours/);
  await db.exec(`ALTER TABLE order_stops DROP CONSTRAINT order_stops_time_from_fmt, DROP CONSTRAINT order_stops_time_to_fmt, DROP COLUMN time_from, DROP COLUMN time_to`);
  assert.equal(await runs(local(files['111_intl_form_stops.sql'])), 'ok', '111 runs again');
  assert.equal(await runs(files['111_intl_form_stops_rollback.sql']), 'ok');
  assert.equal(await n(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'order_stops' AND column_name IN ('time_from', 'time_to')`), 0, 'empty hours dropped');
});
