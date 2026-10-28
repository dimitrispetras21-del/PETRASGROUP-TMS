// 074 (national v5 F5, day L) on the production-shaped PGlite copy of plan-073b.test.mjs (ONE builder,
// prod-shaped-072.mjs with the live money views and 072b; then the v1 money fixture, 073 and 073b, as production
// holds them 28/10), plus fixtures/live-074.sql (028, 030, the national-load and order soft-delete triggers, captured
// 28/10) and 074a. Every case checks ROWS, never a message only, and commits (071's deferred rules fire at COMMIT, as
// through PostgREST): a case builds its own VS with its own reference, so cases do not share rows.
// 074a: the real file (PR #120), read from where it is (drafts/ or one up, migrationFile).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072, TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { IDS as IDS_073B } from '../../worker/migrations/drafts/tools/build-073b.mjs';
import { NEW_IDS, OLD, REWRITTEN_IDS } from '../../worker/migrations/drafts/tools/build-074.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

// The test rows of the old model at their production ids (074 PART 7 refuses any other live row of these kinds).
// The v1 money fixture's national order and its National load (073's proof of today's money) are not production's:
// production's only live national orders ARE the test rows (28/10), so they leave first.
const PROD_TESTS = `
UPDATE national_loads SET deleted_at = now() WHERE legacy_id = 'rec073VNL2';
UPDATE national_orders SET deleted_at = now() WHERE legacy_id = 'rec073VN1';
INSERT INTO national_orders (id, legacy_id, reference, price) OVERRIDING SYSTEM VALUE
  SELECT i, 'rec074TN' || i, 'WN074-OLD', 10 FROM unnest('{5,6,7,8,13,14}'::bigint[]) i;
INSERT INTO national_loads (id, legacy_id, source_type, status, source_national_order_id) OVERRIDING SYSTEM VALUE
  SELECT i, 'rec074TL' || i, CASE WHEN i < 99 THEN 'National' ELSE 'Groupage' END, 'Pending', 5 FROM unnest('{93,96,97,98,99,102,103}'::bigint[]) i;
INSERT INTO consolidated_loads (id, legacy_id, status) OVERRIDING SYSTEM VALUE VALUES (5, 'rec074TC5', 'Assigned');
INSERT INTO groupage_lines (id, legacy_id, status, cons_load_id, national_order_id) OVERRIDING SYSTEM VALUE
  VALUES (52, 'rec074TG52', 'Assigned', 5, 6), (53, 'rec074TG53', 'Assigned', 5, 7);
SELECT setval(pg_get_serial_sequence('public.' || t, 'id'), (SELECT max(id) FROM national_loads) + 1000)
  FROM unnest(ARRAY['national_orders', 'national_loads', 'consolidated_loads', 'groupage_lines']) t;`;

// Day L for the copy: the next Saturday after today (Athens), so the guard "after today" holds whenever this runs.
// The migration's own constant (Q-1) is replaced in ONE place (tests/sql-074-drafts.test.js: it appears once).
const L_CONST = "DATE '2026-10-31'";
const athensToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
function nextSaturday() {
  const d = athensToday(); d.setHours(12, 0, 0, 0);
  do d.setDate(d.getDate() + 1); while (d.getDay() !== 6);
  return d.toISOString().slice(0, 10);
}
const withL = (sql, L) => { assert.ok(sql.includes(L_CONST), 'the Q-1 constant'); return sql.replace(L_CONST, `DATE '${L}'`); };

async function base() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(read('073_plan_money.sql'));
  // the local seed (047b, generated from every check file) holds 073b's checks; production got them from 073b itself
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [IDS_073B]);
  await db.exec(read('073b_plan_monitoring.sql'));
  await db.exec(fixture('live-074.sql'));
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}) WHERE id = 'B-54'`);   // + the 5 triggers of live-074.sql
  await db.exec(read('074a_plan_reads.sql'));   // 074a as executed (PR #120): plan_config empty, plan_lookups, ...
  await db.exec(PROD_TESTS);
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return { msg: String(e.message), hint: e.hint ?? null }; } }
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
// a BEGIN ... COMMIT script: on an error the transaction is rolled back, so the next case starts clean
async function tx(db, sql) { try { await db.exec(sql); } catch (e) { await db.exec('ROLLBACK').catch(() => {}); throw e; } }
const n = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);

// ---- scenario helpers (test rows only: legacy ids rec74..., references C<k>-..., plates TEST-074-...) ----
const HELPERS = `
CREATE FUNCTION t74_vs(p_ref text, p_dir text, p_hub date, p_pallets numeric[], p_nl boolean DEFAULT true) RETURNS bigint
LANGUAGE plpgsql AS $t$
declare o bigint; i int; hub bigint; lx bigint; lg bigint; tot numeric := 0;
begin
  select id into hub from locations where is_hub;
  select coalesce(sum(x), 0) into tot from unnest(p_pallets) x;
  insert into locations (legacy_id, name) values ('rec74X' || p_ref, 'TEST 074 abroad ' || p_ref) returning id into lx;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec74O' || p_ref, 'International', p_dir, 'Pending', true, p_hub - 2, p_hub + 2, p_hub, p_ref,
          (select min(id) from clients)) returning id into o;
  if p_nl then   -- today's Direct national load of the VS, written as 069/the browser does before day L
    set local session_replication_role = replica;
    insert into national_loads (legacy_id, source_type, source_order_id, status, loading_datetime, delivery_datetime)
    values ('rec74N' || p_ref, 'Direct', o, 'Pending', p_hub, p_hub + 1);
    set local session_replication_role = origin;
  end if;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec74A' || p_ref, case when p_dir = 'Import' then 'Loading' else 'Unloading' end, 1,
          case when p_dir = 'Import' then p_hub - 2 else p_hub + 2 end, o, lx, tot);
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  values ('rec74H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, tot);
  for i in 1 .. coalesce(array_length(p_pallets, 1), 0) loop
    insert into locations (legacy_id, name) values ('rec74G' || p_ref || i, 'TEST 074 GR ' || p_ref || ' ' || i) returning id into lg;
    insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    values ('rec74S' || p_ref || i, case when p_dir = 'Import' then 'Unloading' else 'Loading' end, i,
            case when p_dir = 'Import' then p_hub + 1 else p_hub - 1 end, o, lg, p_pallets[i]);
  end loop;
  return o;
end $t$;
CREATE FUNCTION t74_stop(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select id from order_stops where legacy_id = 'rec74S' || p_ref || p_i $t$;
CREATE FUNCTION t74_piece(p_ref text, p_i int) RETURNS bigint LANGUAGE sql AS
  $t$ select sp.id from shipment_pieces sp join shipments s on s.id = sp.shipment_id
       where s.order_stop_id = t74_stop(p_ref, p_i) and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null $t$;
CREATE SEQUENCE t74_plate;
-- a new OWNED cycle that carries the piece across Veroia: an import from the hub to its Greek stop on day p_day, an
-- export from its Greek stop to the hub; p_driver gives the cycle a driver (011 then writes its payroll line)
CREATE FUNCTION t74_put(p_piece bigint, p_day date, p_driver boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $t$
declare ps v_piece_state%rowtype; vs v_shipments%rowtype; trk bigint; drv bigint; a timestamptz; b timestamptz; c timestamptz; d timestamptz;
begin
  select * into ps from v_piece_state where piece_id = p_piece;
  select * into vs from v_shipments where shipment_id = ps.shipment_id;
  insert into trucks (license_plate) values ('TEST-074-' || nextval('t74_plate')) returning id into trk;
  if p_driver then insert into drivers (full_name) values ('TEST 074 driver ' || trk) returning id into drv; end if;
  a := (p_day + time '06:00') at time zone 'Europe/Athens'; b := (p_day + time '08:00') at time zone 'Europe/Athens';
  c := (p_day + time '12:00') at time zone 'Europe/Athens'; d := (p_day + time '14:00') at time zone 'Europe/Athens';
  return plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p_piece)),
    'target', jsonb_build_object('new_rt', jsonb_strip_nulls(jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk, 'driver_id', drv)),
                                 'side', case when vs.kind = 'vs_import' then 'KATHODOS' else 'ANODOS' end),
    'stops', jsonb_build_array(
      jsonb_build_object('ref', 'p', 'location_id', ps.position_location_id, 'planned_from', a, 'planned_to', b,
                         'side', case when vs.kind = 'vs_import' then 'KATHODOS' else 'ANODOS' end),
      jsonb_build_object('ref', 'd', 'location_id', vs.nat_to_location_id, 'planned_from', c, 'planned_to', d,
                         'side', case when vs.kind = 'vs_import' then 'KATHODOS' else 'ANODOS' end))),
    'test:074', 'dispatcher');
end $t$;`;
const B78 = `SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
  AND EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)`;
// B-95's equality, read here directly (the check itself is proven in the 074b part)
const GAP = `SELECT count(*) FROM order_stops s WHERE s.order_id IS NOT NULL
  AND (plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
       OR s.via_hub <> plan_h_bridge_wanted(s.id))`;
const bridgesOf = (db, ref) => n(db, `SELECT count(*) FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.reference = $1 AND s.deleted_at IS NULL`, [ref]);
const piecesOf = (db, ref) => db.query(`SELECT sp.pallets::numeric AS p FROM shipment_pieces sp JOIN shipments s ON s.id = sp.shipment_id
  JOIN orders o ON o.id = s.order_id WHERE o.reference = $1 AND sp.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM shipment_pieces c WHERE c.parent_piece_id = sp.id AND c.deleted_at IS NULL) ORDER BY sp.pallets`, [ref]).then((r) => r.rows.map((x) => Number(x.p)));
const nlLive = (db, ref) => n(db, `SELECT count(*) FROM national_loads nl JOIN orders o ON o.id = nl.source_order_id WHERE o.reference = $1 AND nl.deleted_at IS NULL`, [ref]);
const legsOf = (db, ref) => n(db, `SELECT count(*) FROM piece_legs l JOIN shipment_pieces sp ON sp.id = l.piece_id JOIN shipments s ON s.id = sp.shipment_id
  JOIN orders o ON o.id = s.order_id WHERE o.reference = $1 AND l.deleted_at IS NULL`, [ref]);
const noticesOf = (db, ref, kind) => n(db, `SELECT count(*) FROM plan_notices pn JOIN orders o ON o.id = pn.order_id WHERE o.reference = $1 AND pn.kind = $2`, [ref, kind]);
const orderId = (db, ref) => n(db, `SELECT id FROM orders WHERE reference = $1`, [ref]);
const rtOf = (put) => Number(put.ids.rt_id);

// 26 split at Veroia 12 + 14 (as plan_split_piece leaves it); the 12 ride on L+1 when rideFirst
async function splitPiece(db, ref, L, rideFirst) {
  const p = await n(db, `SELECT t74_piece($1, 1)`, [ref]);
  await tx(db, `BEGIN; SET CONSTRAINTS ALL DEFERRED;
    UPDATE shipment_pieces SET split_at = now(), split_by = 'test:074' WHERE id = ${p};
    INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) SELECT shipment_id, id, 12, 'test:074' FROM shipment_pieces WHERE id = ${p};
    INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) SELECT shipment_id, id, 14, 'test:074' FROM shipment_pieces WHERE id = ${p};
    COMMIT;`);
  if (rideFirst) await db.query(`SELECT t74_put((SELECT id FROM shipment_pieces WHERE parent_piece_id = $1 AND pallets = 12), $2::date + 1)`, [p, L]);
  return p;
}

// the cases, each on its own VS (k = case number); L = day L of the copy, d(L, k) = L + k days
const day = (L, k) => { const d = new Date(L + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
export const CASES = {
  async C1(db, L) {   // import >= L, 2 unloadings: 2 bridges, 2 pieces, via_hub on the 2 only, NL unlinked + 1 log row
    await db.query(`SELECT t74_vs('C1', 'Import', $1::date, '{10,16}')`, [L]);
    assert.strictEqual(await bridgesOf(db, 'C1'), 2);
    assert.deepStrictEqual(await piecesOf(db, 'C1'), [10, 16]);
    assert.strictEqual(await n(db, `SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE o.reference = 'C1' AND s.via_hub`), 2);
    assert.strictEqual(await n(db, `SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE o.reference = 'C1' AND s.via_hub AND s.stop_type = 'Unloading'`), 2);
    assert.strictEqual(await nlLive(db, 'C1'), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_cutover_log l JOIN national_loads nl ON nl.id = l.row_id JOIN orders o ON o.id = nl.source_order_id
      WHERE o.reference = 'C1' AND l.kind = 'nl_unlinked'`), 1);
  },
  async C2(db, L) {   // import with hub day L-1: no bridge, NL alive
    await db.query(`SELECT t74_vs('C2', 'Import', $1::date - 1, '{10}')`, [L]);
    assert.strictEqual(await bridgesOf(db, 'C2'), 0);
    assert.strictEqual(await nlLive(db, 'C2'), 1);
  },
  async C3(db, L) {   // Q-2: export with hub day L (loads L-1) -> bridge; hub day L-1 -> none
    await db.query(`SELECT t74_vs('C3a', 'Export', $1::date, '{12}'), t74_vs('C3b', 'Export', $1::date - 1, '{12}')`, [L]);
    assert.strictEqual(await bridgesOf(db, 'C3a'), 1);
    assert.strictEqual(await nlLive(db, 'C3a'), 0);
    assert.strictEqual(await bridgesOf(db, 'C3b'), 0);
    assert.strictEqual(await nlLive(db, 'C3b'), 1);
  },
  async C4(db, L) {   // no hub day: no bridge, the NL as it is
    await db.query(`SELECT t74_vs('C4', 'Import', $1::date, '{10}')`, [L]);
    // the VS was bridged at birth: the NULL case is a VS born without a day (spec 2.3)
    await tx(db, `BEGIN; SET session_replication_role = replica;
      INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, reference, client_id)
      VALUES ('rec74OC4n', 'International', 'Import', 'Pending', true, 'C4n', (SELECT min(id) FROM clients));
      INSERT INTO national_loads (legacy_id, source_type, source_order_id, status) VALUES ('rec74NC4n', 'Direct', (SELECT id FROM orders WHERE reference = 'C4n'), 'Pending');
      SET session_replication_role = origin;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, order_id, location_id, pallets)
      VALUES ('rec74SC4n1', 'Unloading', 1, (SELECT id FROM orders WHERE reference = 'C4n'), (SELECT min(id) FROM locations WHERE NOT is_hub), 8);
      COMMIT;`);
    assert.strictEqual(await bridgesOf(db, 'C4n'), 0);
    assert.strictEqual(await nlLive(db, 'C4n'), 1);
    assert.strictEqual(await n(db, `SELECT count(*) FROM order_stops WHERE legacy_id = 'rec74SC4n1' AND via_hub`), 0);
  },
  async C5(db, L) {   // 26 -> 20 without a leg: the piece is 20, a notice; COMMIT passes
    await db.query(`SELECT t74_vs('C5', 'Import', $1::date, '{26}')`, [L]);
    await db.exec(`UPDATE order_stops SET pallets = 20 WHERE id = t74_stop('C5', 1)`);
    assert.deepStrictEqual(await piecesOf(db, 'C5'), [20]);
    assert.strictEqual(await noticesOf(db, 'C5', 'vs_pallets_changed'), 1);
  },
  async C6(db, L) {   // split 12 (rides) + 14 (stock), 26 -> 20: stock 8, first day 12
    await db.query(`SELECT t74_vs('C6', 'Import', $1::date, '{26}')`, [L]);
    await splitPiece(db, 'C6', L, true);
    await db.exec(`UPDATE order_stops SET pallets = 20 WHERE id = t74_stop('C6', 1)`);
    assert.deepStrictEqual(await piecesOf(db, 'C6'), [8, 12]);
    assert.strictEqual(await legsOf(db, 'C6'), 1);
  },
  async C7(db, L) {   // split, 26 -> 30: the first day's piece 16
    await db.query(`SELECT t74_vs('C7', 'Import', $1::date, '{26}')`, [L]);
    await splitPiece(db, 'C7', L, true);
    await db.exec(`UPDATE order_stops SET pallets = 30 WHERE id = t74_stop('C7', 1)`);
    assert.deepStrictEqual(await piecesOf(db, 'C7'), [14, 16]);
  },
  async C8(db, L) {   // split, 26 -> 10: the stock goes (0), the first day 10
    await db.query(`SELECT t74_vs('C8', 'Import', $1::date, '{26}')`, [L]);
    await splitPiece(db, 'C8', L, true);
    await db.exec(`UPDATE order_stops SET pallets = 10 WHERE id = t74_stop('C8', 1)`);
    assert.deepStrictEqual(await piecesOf(db, 'C8'), [10]);
    assert.strictEqual(await legsOf(db, 'C8'), 1);
  },
  async C9(db, L) {   // the international moves the hub day +1 with the piece on a cycle: leg off, piece to assign, notice, cycle cancelled
    await db.query(`SELECT t74_vs('C9', 'Import', $1::date, '{10}')`, [L]);
    const put = (await one(db, `SELECT t74_put(t74_piece('C9', 1), $1::date + 1) AS r`, [L])).r;
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE reference = 'C9'`);
    assert.strictEqual(await legsOf(db, 'C9'), 0);
    assert.strictEqual(await noticesOf(db, 'C9', 'vs_day_moved'), 1);
    assert.strictEqual((await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rtOf(put)])).status, 'cancelled');
    assert.strictEqual(await n(db, `SELECT count(*) FROM v_piece_state WHERE piece_id = t74_piece('C9', 1) AND waiting`), 1);
  },
  async C10(db, L) {   // Q-4: the same, the cycle has payroll with an amount: NOT cancelled, empty, notice rt_empty_kept
    await db.query(`SELECT t74_vs('C10', 'Import', $1::date, '{10}')`, [L]);
    const put = (await one(db, `SELECT t74_put(t74_piece('C10', 1), $1::date + 1, true) AS r`, [L])).r;
    await db.query(`UPDATE dl_entries SET trip_value = 100 WHERE rt_id = $1 AND deleted_at IS NULL`, [rtOf(put)]);
    assert.strictEqual(await n(db, `SELECT count(*) FROM dl_entries WHERE rt_id = $1 AND trip_value = 100 AND deleted_at IS NULL`, [rtOf(put)]), 1);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE reference = 'C10'`);
    assert.strictEqual(await legsOf(db, 'C10'), 0);
    assert.strictEqual((await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rtOf(put)])).status, 'planned');
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_notices WHERE rt_id = $1 AND kind = 'rt_empty_kept'`, [rtOf(put)]), 1);
    assert.strictEqual(await n(db, `SELECT count(*) FROM dl_entries WHERE rt_id = $1 AND trip_value = 100 AND deleted_at IS NULL`, [rtOf(put)]), 1);
  },
  async C10b(db, L) {   // Q-4: the same, the cycle's only document is a local loading (TOPIKO line): NOT cancelled
    await db.query(`SELECT t74_vs('C10b', 'Export', $1::date, '{9}')`, [L]);
    const put = (await one(db, `SELECT t74_put(t74_piece('C10b', 1), $1::date - 1) AS r`, [L])).r;
    const pick = await n(db, `SELECT l.pickup_stop_id FROM piece_legs l WHERE l.piece_id = t74_piece('C10b', 1) AND l.deleted_at IS NULL`);
    const drv = await n(db, `INSERT INTO drivers (full_name) VALUES ('TEST 074 local C10b') RETURNING id`);
    const trk = await n(db, `INSERT INTO trucks (license_plate) VALUES ('TEST-074-C10b') RETURNING id`);
    await db.query(`SELECT plan_local_loading(jsonb_build_object('rt_stop_id', $1::bigint, 'driver_id', $2::bigint, 'truck_id', $3::bigint,
      'request_id', gen_random_uuid()), 'test:074', 'dispatcher')`, [pick, drv, trk]);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE reference = 'C10b'`);
    assert.strictEqual(await legsOf(db, 'C10b'), 0);
    assert.strictEqual((await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rtOf(put)])).status, 'planned');
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_notices WHERE rt_id = $1 AND kind = 'rt_empty_kept'`, [rtOf(put)]), 1);
  },
  async C11(db, L) {   // the same change by the national desk (plan_vs_set_day, writer natl): no leg goes
    await db.query(`SELECT t74_vs('C11', 'Import', $1::date, '{10}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C11', 1), $1::date + 1)`, [L]);
    await db.query(`SELECT plan_vs_set_day(jsonb_build_object('order_id', $1::bigint, 'day', $2::date + 2), 'test:074', 'dispatcher')`, [await orderId(db, 'C11'), L]);
    assert.strictEqual(await legsOf(db, 'C11'), 1);
    assert.strictEqual(await noticesOf(db, 'C11', 'vs_day_moved'), 0);
  },
  async C12(db, L) {   // a split VS, the international moves the day: the split is undone, one piece with all pallets
    await db.query(`SELECT t74_vs('C12', 'Import', $1::date, '{26}')`, [L]);
    await splitPiece(db, 'C12', L, true);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE reference = 'C12'`);
    assert.deepStrictEqual(await piecesOf(db, 'C12'), [26]);
    assert.strictEqual(await legsOf(db, 'C12'), 0);
  },
  async C13(db, L) {   // a new place from the international: the leg follows, a notice; from plan_vs_set_place: one move only
    await db.query(`SELECT t74_vs('C13', 'Import', $1::date, '{10}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C13', 1), $1::date + 1)`, [L]);
    const nl = await n(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec74C13N', 'TEST 074 C13 new') RETURNING id`);
    await db.exec(`UPDATE order_stops SET location_id = ${nl} WHERE id = t74_stop('C13', 1)`);
    assert.strictEqual(await n(db, `SELECT count(*) FROM piece_legs l JOIN rt_stops s ON s.id = l.drop_stop_id
      WHERE l.piece_id = t74_piece('C13', 1) AND l.deleted_at IS NULL AND s.location_id = ${nl}`), 1);
    assert.strictEqual(await noticesOf(db, 'C13', 'vs_place_changed'), 1);
    const nl2 = await n(db, `INSERT INTO locations (legacy_id, name) VALUES ('rec74C13M', 'TEST 074 C13 natl') RETURNING id`);
    const audits0 = await n(db, `SELECT count(*) FROM audit_log WHERE table_name = 'rt_stops'`);
    await db.query(`SELECT plan_vs_set_place(jsonb_build_object('order_stop_id', t74_stop('C13', 1), 'location_id', $1::bigint), 'test:074', 'dispatcher')`, [nl2]);
    assert.strictEqual(await n(db, `SELECT count(*) FROM piece_legs l JOIN rt_stops s ON s.id = l.drop_stop_id
      WHERE l.piece_id = t74_piece('C13', 1) AND l.deleted_at IS NULL AND s.location_id = ${nl2}`), 1);
    // the stop served only this VS: moved in place ONCE (one rt_stops audit row), never a second time by the bridge
    assert.strictEqual(await n(db, `SELECT count(*) FROM audit_log WHERE table_name = 'rt_stops'`) - audits0, 1);
    assert.strictEqual(await noticesOf(db, 'C13', 'vs_place_changed'), 2);   // one to each desk (072's own + 074's)
  },
  async C14(db, L) {   // a stop with a bridge deleted: bridge, pieces and legs go, a notice
    await db.query(`SELECT t74_vs('C14', 'Import', $1::date, '{10,6}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C14', 1), $1::date + 1)`, [L]);
    await db.exec(`UPDATE order_stops SET deleted_at = now() WHERE id = t74_stop('C14', 1)`);
    assert.strictEqual(await bridgesOf(db, 'C14'), 1);
    assert.strictEqual(await legsOf(db, 'C14'), 0);
    assert.strictEqual(await noticesOf(db, 'C14', 'vs_withdrawn'), 1);
  },
  async C15(db, L) {   // VS off: every bridge goes, via_hub false
    await db.query(`SELECT t74_vs('C15', 'Import', $1::date, '{10,6}')`, [L]);
    await db.exec(`UPDATE orders SET veroia_switch = false WHERE reference = 'C15'`);
    assert.strictEqual(await bridgesOf(db, 'C15'), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE o.reference = 'C15' AND s.via_hub`), 0);
  },
  async C16(db, L) {   // Q-5: Cancelled = VS off; back to Pending = a new bridge, a new piece
    await db.query(`SELECT t74_vs('C16', 'Import', $1::date, '{10}')`, [L]);
    const p0 = await n(db, `SELECT t74_piece('C16', 1)`);
    await db.exec(`UPDATE orders SET status = 'Cancelled' WHERE reference = 'C16'`);
    assert.strictEqual(await bridgesOf(db, 'C16'), 0);
    await db.exec(`UPDATE orders SET status = 'Pending' WHERE reference = 'C16'`);
    assert.strictEqual(await bridgesOf(db, 'C16'), 1);
    assert.notStrictEqual(await n(db, `SELECT t74_piece('C16', 1)`), p0);
  },
  async C17(db, L) {   // the international deleted: as VS off
    await db.query(`SELECT t74_vs('C17', 'Import', $1::date, '{10}')`, [L]);
    await db.exec(`UPDATE orders SET deleted_at = now() WHERE reference = 'C17'`);
    assert.strictEqual(await bridgesOf(db, 'C17'), 0);
  },
  async C18(db, L) {   // once v5, always v5: hub day >= L -> < L, the bridge stays
    await db.query(`SELECT t74_vs('C18', 'Import', $1::date, '{10}')`, [L]);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date - 3 WHERE reference = 'C18'`);
    assert.strictEqual(await bridgesOf(db, 'C18'), 1);
    assert.strictEqual(await nlLive(db, 'C18'), 0);
  },
  async C19(db, L) {   // an old VS (< L) moved >= L after day L: bridge + NL unlinked in the same transaction
    await db.query(`SELECT t74_vs('C19', 'Import', $1::date - 2, '{10}')`, [L]);
    assert.strictEqual(await nlLive(db, 'C19'), 1);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 3 WHERE reference = 'C19'`);
    assert.strictEqual(await bridgesOf(db, 'C19'), 1);
    assert.strictEqual(await nlLive(db, 'C19'), 0);
  },
  async C19b(db, L) {   // owner 28/10: an old VS whose NL already DELIVERED, moved onto day L: the normal bridge path
    await db.query(`SELECT t74_vs('C19b', 'Import', $1::date - 9, '{10}')`, [L]);
    await db.exec(`UPDATE national_loads SET status = 'Delivered' WHERE legacy_id = 'rec74NC19b'`);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 10 WHERE reference = 'C19b'`);
    assert.strictEqual(await bridgesOf(db, 'C19b'), 1);
    assert.strictEqual(await nlLive(db, 'C19b'), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_cutover_log l JOIN national_loads nl ON nl.id = l.row_id
      WHERE nl.legacy_id = 'rec74NC19b' AND l.kind = 'nl_unlinked'`), 1);
  },
  async C20(db, L) {   // an executed leg (yesterday) and a day change: nothing goes, notice vs_changed_after_execution
    await db.query(`SELECT t74_vs('C20', 'Import', $1::date, '{10}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C20', 1), (now() AT TIME ZONE 'Europe/Athens')::date - 1)`);
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE reference = 'C20'`);
    assert.strictEqual(await legsOf(db, 'C20'), 1);
    assert.strictEqual(await noticesOf(db, 'C20', 'vs_changed_after_execution'), 1);
  },
  async C14b(db, L) {   // owner 28/10: the national stop deleted AFTER its leg executed (yesterday) - allowed, all soft
    await db.query(`SELECT t74_vs('C14b', 'Import', $1::date, '{10,6}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C14b', 1), (now() AT TIME ZONE 'Europe/Athens')::date - 1)`);
    assert.strictEqual(await errorOf(db, `UPDATE order_stops SET deleted_at = now() WHERE id = t74_stop('C14b', 1)`), null);
    assert.strictEqual(await bridgesOf(db, 'C14b'), 1);
    assert.strictEqual(await legsOf(db, 'C14b'), 0);
    assert.strictEqual(await noticesOf(db, 'C14b', 'vs_withdrawn'), 1);
  },
  async C29b(db, L) {   // owner 28/10: the international deleted after the national leg executed - allowed, nothing left live
    await db.query(`SELECT t74_vs('C29b', 'Import', $1::date, '{10}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C29b', 1), (now() AT TIME ZONE 'Europe/Athens')::date - 1, true)`);
    await db.query(`UPDATE dl_entries SET trip_value = 80 WHERE rt_id = (SELECT l.rt_id FROM piece_legs l WHERE l.piece_id = t74_piece('C29b', 1) AND l.deleted_at IS NULL)`);
    const rt = await n(db, `SELECT l.rt_id FROM piece_legs l WHERE l.piece_id = t74_piece('C29b', 1) AND l.deleted_at IS NULL`);
    await tx(db, `BEGIN;
      UPDATE order_stops SET deleted_at = now() WHERE order_id = (SELECT id FROM orders WHERE reference = 'C29b') AND deleted_at IS NULL;
      UPDATE orders SET deleted_at = now() WHERE reference = 'C29b';
      COMMIT;`);
    assert.strictEqual(await bridgesOf(db, 'C29b'), 0);
    assert.strictEqual(await legsOf(db, 'C29b'), 0);
    // Q-4: the cycle with money stays (empty, told), its payroll line too
    assert.strictEqual((await one(db, `SELECT status FROM ct_round_trips WHERE id = $1`, [rt])).status, 'planned');
    assert.strictEqual(await n(db, `SELECT count(*) FROM dl_entries WHERE rt_id = $1 AND trip_value = 80 AND deleted_at IS NULL`, [rt]), 1);
  },
  async C21(db, L) {   // only stop_number changes: no move (the stop's identity is its id)
    await db.query(`SELECT t74_vs('C21', 'Import', $1::date, '{10,6}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C21', 1), $1::date + 1)`, [L]);
    const a0 = await n(db, `SELECT count(*) FROM audit_log`);
    await db.exec(`UPDATE order_stops SET stop_number = 9 WHERE id = t74_stop('C21', 1)`);
    assert.strictEqual(await n(db, `SELECT count(*) FROM audit_log`), a0);
    assert.strictEqual(await legsOf(db, 'C21'), 1);
  },
  async C22(db, L) {   // idempotent: a second plan_bridge_sync writes nothing
    await db.query(`SELECT t74_vs('C22', 'Import', $1::date, '{10,6}')`, [L]);
    const a0 = await n(db, `SELECT count(*) FROM audit_log`);
    const s0 = await n(db, `SELECT count(*) FROM shipments`);
    await db.query(`SELECT plan_bridge_sync($1, 'test:074')`, [await orderId(db, 'C22')]);
    assert.strictEqual(await n(db, `SELECT count(*) FROM audit_log`), a0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipments`), s0);
  },
  async C25(db, L) {   // the facade's PATCH of pallets (one transaction, as PostgREST): COMMIT passes, piece equal
    await db.query(`SELECT t74_vs('C25', 'Export', $1::date, '{18}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C25', 1), $1::date - 1)`, [L]);
    await tx(db, `BEGIN; UPDATE order_stops SET pallets = 15 WHERE id = t74_stop('C25', 1); COMMIT;`);
    assert.deepStrictEqual(await piecesOf(db, 'C25'), [15]);
    assert.strictEqual(await legsOf(db, 'C25'), 1);
  },
  async C26(db, L) {   // 028: the international moves its delivery day; 028 moves the stops and the hub day -> unplan + notice
    await db.query(`SELECT t74_vs('C26', 'Import', $1::date, '{10}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C26', 1), $1::date + 1)`, [L]);
    await db.exec(`UPDATE orders SET delivery_datetime = delivery_datetime + 1 WHERE reference = 'C26'`);
    // the put already moved the hub day to L+1 (072 decision 16, the national desk's write); 028 adds the +1 on top
    assert.strictEqual((await one(db, `SELECT cross_dock_date::text AS d FROM orders WHERE reference = 'C26'`)).d, day(L, 2));
    assert.strictEqual(await legsOf(db, 'C26'), 0);
    assert.strictEqual(await noticesOf(db, 'C26', 'vs_day_moved'), 1);
  },
  async C28(db, L) {   // without day L in plan_config no UPDATE writes a v5 row
    await db.exec(`BEGIN; DELETE FROM plan_config;`);
    try {
      await db.query(`SELECT t74_vs('C28', 'Import', $1::date, '{10}')`, [L]);
      await db.exec(`UPDATE order_stops SET pallets = 9 WHERE id = t74_stop('C28', 1)`);
      assert.strictEqual(await bridgesOf(db, 'C28'), 0);
      assert.strictEqual(await nlLive(db, 'C28'), 1);
    } finally { await db.exec('ROLLBACK'); }
  },
  async C29(db, L) {   // delete_order_cascade's statements in its order (stops, NL, order) + 023: the bridge goes, no raw error
    await db.query(`SELECT t74_vs('C29', 'Import', $1::date, '{10}')`, [L]);
    await db.query(`SELECT t74_put(t74_piece('C29', 1), $1::date + 1)`, [L]);
    await tx(db, `BEGIN;
      UPDATE order_stops SET deleted_at = now() WHERE order_id = (SELECT id FROM orders WHERE reference = 'C29') AND deleted_at IS NULL;
      UPDATE national_loads SET deleted_at = now() WHERE source_order_id = (SELECT id FROM orders WHERE reference = 'C29') AND deleted_at IS NULL;
      UPDATE orders SET deleted_at = now() WHERE reference = 'C29';
      COMMIT;`);
    assert.strictEqual(await bridgesOf(db, 'C29'), 0);
    assert.strictEqual(await legsOf(db, 'C29'), 0);
  },
  async C30(db, L) {   // 50 VS into v5 in ONE UPDATE: < 2 s on PGlite
    for (let i = 0; i < 50; i++) await db.query(`SELECT t74_vs($1, 'Import', $2::date - 1, '{4}')`, [`C30-${i}`, L]);
    const t0 = Date.now();
    await db.exec(`UPDATE orders SET cross_dock_date = cross_dock_date + 1 WHERE reference LIKE 'C30-%'`);
    const ms = Date.now() - t0;
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.reference LIKE 'C30-%' AND s.deleted_at IS NULL`), 50);
    assert.ok(ms < 2000, `${ms} ms`);
  },
  async C31(db) {   // INSERT of a national load after day L: legacy_frozen
    const e = await errorOf(db, `INSERT INTO national_loads (legacy_id, source_type, status) VALUES ('rec74C31', 'National', 'Pending')`);
    assert.strictEqual(e?.hint, 'plan:legacy_frozen', JSON.stringify(e));
  },
  async C32(db) {   // GL / CL / local: the same; relay_delivery passes
    for (const sql of [`INSERT INTO groupage_lines (legacy_id, status) VALUES ('rec74C32g', 'Unassigned')`,
      `INSERT INTO consolidated_loads (legacy_id, status) VALUES ('rec74C32c', 'Pending')`,
      `INSERT INTO local_moves (move_date, move_kind, status) VALUES (current_date, 'local', 'Pending')`]) {
      assert.strictEqual((await errorOf(db, sql))?.hint, 'plan:legacy_frozen', sql);
    }
    const o = await n(db, `SELECT min(id) FROM orders WHERE deleted_at IS NULL AND veroia_switch IS NOT TRUE`);
    const loc = await n(db, `SELECT min(id) FROM locations WHERE NOT is_hub`);
    assert.strictEqual(await errorOf(db, `INSERT INTO local_moves (move_date, move_kind, status, parent_order_id, from_location_id)
      VALUES (current_date, 'relay_delivery', 'Pending', ${o}, ${loc})`), null);
  },
  async C33(db) {   // UPDATE of an old national load passes (the Worker cuts it by role, Q-10)
    const id = await n(db, `SELECT min(id) FROM national_loads WHERE deleted_at IS NULL AND source_type = 'Direct'`);
    assert.strictEqual(await errorOf(db, `UPDATE national_loads SET status = 'Assigned' WHERE id = ${id}`), null);
  },
  async C34(db, L) {   // an old VS (< L) moves after day L: its NL does NOT move (028 without the branch); the international does
    await db.query(`SELECT t74_vs('C34', 'Export', $1::date - 4, '{10}')`, [L]);
    const nl0 = await one(db, `SELECT nl.loading_datetime::text AS l FROM national_loads nl JOIN orders o ON o.id = nl.source_order_id WHERE o.reference = 'C34'`);
    await db.exec(`UPDATE orders SET loading_datetime = loading_datetime + 1 WHERE reference = 'C34'`);
    assert.strictEqual((await one(db, `SELECT nl.loading_datetime::text AS l FROM national_loads nl JOIN orders o ON o.id = nl.source_order_id WHERE o.reference = 'C34'`)).l, nl0.l);
    assert.strictEqual((await one(db, `SELECT cross_dock_date::text AS d FROM orders WHERE reference = 'C34'`)).d, day(L, -3));
    assert.strictEqual(await bridgesOf(db, 'C34'), 0);
  },
  async C35(db, L) {   // status Delivered on an old VS: the NL does not follow (030)
    await db.query(`SELECT t74_vs('C35', 'Import', $1::date - 4, '{10}')`, [L]);
    await db.exec(`UPDATE orders SET status = 'Delivered' WHERE reference = 'C35'`);
    assert.strictEqual((await one(db, `SELECT nl.status FROM national_loads nl JOIN orders o ON o.id = nl.source_order_id WHERE o.reference = 'C35'`)).status, 'Pending');
  },
};
const NETS = async (db) => {   // C23: after every case, no order lives in both models, the bridge = the wanted stops
  assert.strictEqual(await n(db, B78), 0, 'B-78');
  assert.strictEqual(await n(db, GAP), 0, 'bridge gap (B-95)');
};

// ---- the backfill scenario (C36): VS of every kind BEFORE 074, each with its Direct NL, as production holds them ----
async function seedBefore(db, L) {
  await db.exec(HELPERS);
  const rows = [['B1', 'Import', 0, '{10,16}'], ['B2', 'Import', -1, '{8}'], ['B3', 'Export', 0, '{12}'], ['B4', 'Export', -1, '{5}'],
    ['B5', 'Import', 2, '{20}'], ['B6', 'Export', 7, '{3,4}']];
  for (const [ref, dir, k, p] of rows) await db.query(`SELECT t74_vs($1, $2, $3::date + $4::int, $5::numeric[])`, [ref, dir, L, k, p]);
  // B7: a VS with a vehicle on its NL (Q-3: listed, the desk is told)
  await db.exec(`UPDATE national_loads SET truck_id = (SELECT min(id) FROM trucks) WHERE legacy_id = 'rec74NB5'`);
  // B3: an export of hub day L that loaded on Friday - its NL already Delivered (030 on In Transit): Q-3, unlinked by
  // the backfill and listed for the desk
  await db.exec(`UPDATE national_loads SET status = 'Delivered' WHERE legacy_id = 'rec74NB3'`);
  // B1: its old NL Cancelled (still live): unlinked, but nothing to re-record - no notice, not in the list
  await db.exec(`UPDATE national_loads SET status = 'Cancelled' WHERE legacy_id = 'rec74NB1'`);
  // B8: a VS without a hub day (spec 2.3): no bridge, its NL stays
  await db.exec(`UPDATE orders SET cross_dock_date = NULL WHERE reference = 'B6'`);
}

test('Task 0 Step 6 / C41: a v5 leg can be planned with a past window (the Friday loading of an export of day L)', async (t) => {
  const db = await base();
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
  const legsOfPiece = async (pc) => (await one(db, `SELECT count(*)::int AS n FROM piece_legs WHERE piece_id = $1 AND deleted_at IS NULL`, [pc])).n;
  const hubDay = async (o) => (await one(db, `SELECT cross_dock_date::text AS d FROM orders WHERE id = $1`, [o])).d;

  await t.test('variant 1: drop at Veroia on Friday (the past) - accepted, COMMIT passes; the hub day follows to Friday', async () => {
    const r = (await put(vs[0].pc, trk, S.f12, S.f14)).rows[0].r;
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(await legsOfPiece(vs[0].pc), 1);
    // decision 16: the first ride rewrites the international's hub day to the day the truck reaches Veroia
    assert.strictEqual(await hubDay(vs[0].o), S.fri);
  });

  await t.test('variant 2: drop at Veroia on Saturday (day L) - accepted, the hub day stays L', async () => {
    const r = (await put(vs[1].pc, trk2, S.s06, S.s08)).rows[0].r;
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(await legsOfPiece(vs[1].pc), 1);
    assert.strictEqual(await hubDay(vs[1].o), S.td);
  });
});

test('074 on the production-shaped copy', async (t) => {
  const L = nextSaturday();
  const db = await base();
  await seedBefore(db, L);
  const src = withL(read('074_plan_cutover.sql'), L);
  const trg0 = await n(db, TRG);

  await t.test('the live texts in the copy are production\'s (live-074.sql and the earlier captures, by md5)', async () => {
    const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
    const pairs = [...part0.matchAll(/\('(public\.[a-z0-9_]+\([a-z0-9_,[\]]*\))', '([0-9a-f]{32})'\)/g)];
    assert.strictEqual(pairs.length, 10);
    for (const [, sig, m] of pairs) assert.strictEqual((await one(db, `SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig]))?.m, m, sig);
  });

  await t.test('C39: the dry run runs to its end and keeps nothing (no bridge, plan_config empty)', async () => {
    const e = await errorOf(db, withL(read('074_plan_cutover_dryrun.sql'), L));
    assert.match(e?.msg ?? '', /DRY RUN 074 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}074 ran: cutover \S+, bridges 4 on 3 VS, NL unlinked 3, NL to re-record 2 \[\d+,\d+\], tests cleaned 6\/7\/1\/2/, e?.msg);
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipments`), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_config`), 0);
    assert.strictEqual(await n(db, TRG), trg0);
  });

  await t.test('C36 + C37: 074 applies; the bridges are what the same cut gives in SELECT; tests 6/7/1/2; B-54 +6', async () => {
    await db.exec(src);
    // C36: the cut as a SELECT on the rows, independent of the functions
    const want = await n(db, `SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id
      WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.status <> 'Cancelled' AND o.cross_dock_date >= $1::date AND s.deleted_at IS NULL
        AND s.pallets > 0 AND ((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'))`, [L]);
    assert.strictEqual(want, 4);
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipments WHERE deleted_at IS NULL`), want);
    assert.strictEqual(await n(db, `SELECT count(*) FROM order_stops WHERE via_hub`), want);
    for (const [ref, b, nl] of [['B1', 2, 0], ['B2', 0, 1], ['B3', 1, 0], ['B4', 0, 1], ['B5', 1, 0], ['B6', 0, 1]]) {
      assert.strictEqual(await bridgesOf(db, ref), b, ref);
      assert.strictEqual(await nlLive(db, ref), nl, ref);
    }
    // Q-3: the NL with a vehicle is listed and the desk is told
    assert.strictEqual(await noticesOf(db, 'B5', 'legacy_nl_replaced'), 1);
    assert.strictEqual(await noticesOf(db, 'B3', 'legacy_nl_replaced'), 1);   // Delivered on Friday, no vehicle
    assert.strictEqual(await noticesOf(db, 'B1', 'legacy_nl_replaced'), 0);   // Cancelled: nothing to re-record
    // C37: exactly the test rows, nothing else
    assert.strictEqual(await n(db, `SELECT count(*) FROM national_orders WHERE deleted_at IS NULL`), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM national_loads WHERE deleted_at IS NULL AND source_type <> 'Direct'`), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM consolidated_loads WHERE deleted_at IS NULL`), 0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM groupage_lines WHERE status = 'Unassigned' AND cons_load_id IS NULL AND deleted_at IS NULL`), 2);
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_cutover_log WHERE kind IN ('test_cleanup', 'gl_unassigned')`), 16);
    assert.strictEqual(await n(db, TRG), trg0 + 6);
    assert.strictEqual(await n(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0 + 6);
    await NETS(db);
  });

  await t.test('C40: verify says in place, B-54 = triggers, 0 legs', async () => {
    const r = await one(db, read('074_plan_cutover_verify.sql'));
    assert.strictEqual(r.applied, '074 in place');
    assert.strictEqual(r.b54_matches, true);
    for (const k of ['legs', 'gap', 'b78', 'open_functions', 'changed_texts']) assert.strictEqual(Number(r[k]), 0, k);
  });

  for (const [k, fn] of Object.entries(CASES)) {
    await t.test(`${k}`, async () => { await fn(db, L); await NETS(db); });
  }

  await t.test('R2: a rollback after the first leg is refused (point of no return)', async () => {
    const e = await errorOf(db, read('074_plan_cutover_rollback.sql'));
    assert.match(e?.msg ?? '', /074 rollback: after the point of no return/, e?.msg);
  });

});

// C24 on its own copy: 074 applied with no VS in the copy (no bridge, no notice), so the 072 / 072b rules tests see the
// board they were written for. Their fixtures write VS rows by hand: with day L in plan_config the bridge trigger would
// bridge them first, so they run with plan_config empty (the triggers inert) - what they prove is that 074's function
// changes (plan_vs_set_place calling plan_h_vs_repoint, 028, 030) broke none of their cases.
test('C24: the 072 and 072b rules tests still pass on top of 074', async () => {
  const db = await base();
  await db.exec(withL(read('074_plan_cutover.sql'), nextSaturday()));
  for (const [f, re] of [['072_plan_functions_test.sql', /RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, 0 FAIL/],
    ['072b_plan_vehicle_segments_test.sql', /RULES TEST 072b finished - EVERYTHING UNDONE, nothing kept\. Result: (\d+) OK, 0 FAIL/]]) {
    await db.exec('BEGIN; DELETE FROM plan_config;');
    const e = await errorOf(db, read(f));
    await db.exec('ROLLBACK');
    assert.match(e?.msg ?? '', re, `${f}: ${e?.msg?.slice(0, 400)}`);
  }
});

test('074 rollback right after (R1), then again (R3); a missing REVOKE fails the block (R4)', async (t) => {
  const L = nextSaturday();
  const db = await base();
  await seedBefore(db, L);
  const src = withL(read('074_plan_cutover.sql'), L);
  const fp = withL(read('074_plan_cutover_fingerprint.sql'), L);
  const trg0 = await n(db, TRG);
  const fp0 = await one(db, fp);
  await db.exec(src);
  await t.test('R-5: right after 074 the international rows are untouched (orders_md5, stops_md5); the patched texts move as declared', async () => {
    const fp1 = await one(db, fp);
    assert.strictEqual(fp1.orders_md5, fp0.orders_md5);
    assert.strictEqual(fp1.stops_md5, fp0.stops_md5);
    assert.notStrictEqual(fp1.f028_md5, fp0.f028_md5);
  });
  await t.test('R1: the rollback dry run keeps everything, the rollback puts back every row and text (fingerprint equal)', async () => {
    const e = await errorOf(db, read('074_plan_cutover_rollback_dryrun.sql'));
    assert.match(e?.msg ?? '', /DRY RUN 074 ROLLBACK finished - EVERYTHING UNDONE/, e?.msg);
    assert.ok(await n(db, `SELECT count(*) FROM shipments WHERE deleted_at IS NULL`) > 0);
    assert.strictEqual(await errorOf(db, read('074_plan_cutover_rollback.sql')), null);
    assert.deepStrictEqual(await one(db, fp), fp0);
    assert.strictEqual(await n(db, TRG), trg0);
    assert.strictEqual(await n(db, `SELECT red_value FROM monitoring.checks WHERE id = 'B-54'`), trg0);
    assert.strictEqual(await n(db, `SELECT count(*) FROM plan_config`), 0);
    assert.strictEqual((await one(db, `SELECT to_regclass('public.plan_cutover_log')::text AS r`)).r, null);
  });
  await t.test('R3: 074 again after the rollback gives the same bridges (a notice the first run left does not stop it)', async () => {
    await db.exec(`INSERT INTO plan_notices (to_desk, kind, message, created_by, created_at)
      VALUES ('natl', 'vs_withdrawn', 'left by the first run', 'trigger:plan_bridge_sync', now() - interval '1 hour')`);
    await db.exec(src);
    assert.strictEqual(await n(db, `SELECT count(*) FROM shipments WHERE deleted_at IS NULL`), 4);
    await NETS(db);
  });
  await t.test('R4: without the REVOKE of PART 5 the block stops (Supabase gives EXECUTE to PUBLIC by default)', async () => {
    const db2 = await base();
    const mut = src.replace(/    EXECUTE format\('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_g\.sig\);\n/, '    NULL;\n');
    assert.notStrictEqual(mut, src);
    const e = await errorOf(db2, mut);
    assert.match(e?.msg ?? '', /074 proof: a new function or plan_cutover_log is open to an API role/, e?.msg);
  });
});

// Mutations (plan B2 Step 4): each mutant breaks exactly the cases of its rule.
const MUTANTS = [
  ['no writer check', (s) => s.replaceAll("current_setting('plan.writer', true) is distinct from 'natl'", 'true'), ['C11', 'C13']],
  ['no stock first', (s) => s.replace('order by ps.is_stock desc,', 'order by ps.is_stock asc,'), ['C6', 'C8']],
  ['no money check (Q-4)', (s) => s.replace("elsif not (v_rt = any (v_docs)) and plan_h_rt_consequences(v_rt) = '[]'::jsonb then", 'elsif true then'), ['C10', 'C10b']],
  ['a local loading is not a document (Q-4)', (s) => s.replace('elsif not (v_rt = any (v_docs)) and ', 'elsif '), ['C10b']],
  ['an executed bridge kept on a delete', (s) => s.replace('  if v_live and plan_h_bridge_executed(p_sh) then', '  if plan_h_bridge_executed(p_sh) then'), ['C14b', 'C29b']],
  ['cut by the export loading day (not Q-2)', (s) => s.replace('and ((o.cross_dock_date is not null and o.cross_dock_date >= plan_cutover_day())',
    "and ((o.cross_dock_date is not null and o.cross_dock_date - case when o.direction = 'Export' then 1 else 0 end >= plan_cutover_day())"), ['C3']],
];
for (const [name, mutate, broken] of MUTANTS) {
  test(`mutant "${name}" breaks ${broken.join(', ')}`, async () => {
    const L = nextSaturday();
    const db = await base();
    await db.exec(HELPERS);
    const src = withL(read('074_plan_cutover.sql'), L);
    const mut = mutate(src);
    assert.notStrictEqual(mut, src, 'the mutation applied');
    await db.exec(mut);
    for (const k of broken) await assert.rejects(async () => { await CASES[k](db, L); await NETS(db); }, `${k} must fail under "${name}"`);
  });
}

// ---- 074b (plan Task C): the auditor learns day L ----
// The local seed (047b, generated from every check file) already holds B-95..B-99 and the new texts of B-10 / B-26 /
// B-42; production holds neither before 074b: take the new ones out and put the live texts back, as production.
async function asProduction074b(db) {
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [NEW_IDS]);
  for (const [id, o] of Object.entries(OLD)) {
    await db.query('UPDATE monitoring.checks SET sql_text = $2, ids_sql = $3, exceptions = $4 WHERE id = $1', [id, o.sql, o.ids_sql, o.exceptions]);
  }
}
async function checkValue(db, id) {   // as monitoring.run_checks: the auditor's role, the check's text and its ids
  const { sql_text: sql, ids_sql: ids } = await one(db, 'SELECT sql_text, ids_sql FROM monitoring.checks WHERE id = $1', [id]);
  await db.exec('SET ROLE tms_check_runner');
  try {
    const v = Number(Object.values((await db.query(sql)).rows[0])[0]);
    const named = ids ? Object.values((await db.query(ids)).rows[0])[0] : null;
    if (ids && (v === 0) !== (named.length === 0)) throw new Error(`${id}: value ${v} but ids ${JSON.stringify(named)}`);
    return v;
  } finally { await db.exec('RESET ROLE'); }
}
async function redIn(db, id, scenario) {   // the value of a check inside a scenario that is undone afterwards
  await db.exec('BEGIN');
  try { await db.exec(scenario); return await checkValue(db, id); } finally { await db.exec('ROLLBACK'); }
}

test('074b: B-95..B-99 + B-10/B-26/B-42 are 0 on the production copy after 074, each new one red in its scenario', async (t) => {
  const L = nextSaturday();
  const db = await base();
  await asProduction074b(db);
  await seedBefore(db, L);
  await db.exec(withL(read('074_plan_cutover.sql'), L));
  const ALL = [...NEW_IDS, ...REWRITTEN_IDS];

  await t.test('074b dry run keeps nothing; 074b applies; every check 0 as the auditor', async () => {
    const e = await errorOf(db, read('074b_plan_cutover_monitoring_dryrun.sql'));
    assert.match(e?.msg ?? '', /DRY RUN 074b finished - EVERYTHING UNDONE, nothing kept\./, e?.msg);
    assert.strictEqual(await n(db, `SELECT count(*) FROM monitoring.checks WHERE id = ANY($1)`, [NEW_IDS]), 0);
    assert.strictEqual(await errorOf(db, read('074b_plan_cutover_monitoring.sql')), null);
    assert.strictEqual(await n(db, `SELECT count(*) FROM monitoring.checks WHERE id = ANY($1) AND enabled`, [NEW_IDS]), 5);
    for (const id of ALL) assert.strictEqual(await checkValue(db, id), 0, id);
  });

  const bridged = `(SELECT s.id FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.reference = 'B1' AND s.deleted_at IS NULL ORDER BY s.id LIMIT 1)`;
  for (const [id, why, scenario] of [
    ['B-95', 'a bridge gone behind the trigger\'s back', `SET LOCAL session_replication_role = replica;
       UPDATE shipment_pieces SET deleted_at = now(), deleted_reason = 't', deleted_by = 't' WHERE shipment_id = ${bridged};
       UPDATE shipments SET deleted_at = now(), deleted_reason = 't', deleted_by = 't' WHERE id = ${bridged};`],
    ['B-95', 'via_hub false on a bridged stop', `UPDATE order_stops SET via_hub = false WHERE id = (SELECT order_stop_id FROM shipments WHERE id = ${bridged});`],
    ['B-96', 'a national load inserted past the freeze', `SET LOCAL session_replication_role = replica;
       INSERT INTO national_loads (legacy_id, source_type, status) VALUES ('rec74B96', 'National', 'Pending');`],
    ['B-96', 'a national order without a shipment', `INSERT INTO national_orders (legacy_id, reference, price) VALUES ('rec74B96n', 'B96', 10);`],
    ['B-97', 'a VS born without a hub day', `INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, reference)
       VALUES ('rec74B97', 'International', 'Import', 'Pending', true, 'B97');`],
    ['B-98', 'a national order with a price and no share', `INSERT INTO national_orders (legacy_id, reference, price) VALUES ('rec74B98', 'B98', 120);`],
    // past the bridge trigger: through it, plan_bridge_sync sets via_hub back to what the rule says
    ['B-99', 'via_hub on a stop of an order that is not a VS', `SET LOCAL session_replication_role = replica;
       INSERT INTO order_stops (legacy_id, stop_type, stop_number, order_id, location_id, pallets, via_hub)
       VALUES ('rec74B99', 'Unloading', 1, (SELECT min(id) FROM orders WHERE veroia_switch IS NOT TRUE AND deleted_at IS NULL),
               (SELECT min(id) FROM locations WHERE NOT is_hub), 5, true);`],
  ]) {
    await t.test(`${id} red: ${why}`, async () => { assert.ok(await redIn(db, id, scenario) > 0, id); assert.strictEqual(await checkValue(db, id), 0); });
  }

  await t.test('E17: B-26 leaves the bridged VS to B-95; B-42 the national orders with a shipment; B-10 the v5 cycles', async () => {
    // B-26: a VS in v5 without NL (the bridge took it) is not counted; a VS out of v5 without NL still is
    assert.strictEqual(await redIn(db, 'B-26', `UPDATE orders SET created_at = now() - interval '1 hour' WHERE reference IN ('B1', 'B3', 'B5');`), 0);
    assert.strictEqual(await redIn(db, 'B-26', `UPDATE orders SET created_at = now() - interval '1 hour' WHERE reference = 'B2';
      UPDATE national_loads SET deleted_at = now() WHERE legacy_id = 'rec74NB2';`), 1);
    const nat = `INSERT INTO national_orders (legacy_id, reference, price, created_at) VALUES ('rec74E17', 'E17', 50, now() - interval '1 hour');`;
    assert.strictEqual(await redIn(db, 'B-42', nat), 1);
    assert.strictEqual(await redIn(db, 'B-42', nat + `SET LOCAL session_replication_role = replica;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from, deliver_to, created_by)
      SELECT n.id, (SELECT min(id) FROM locations WHERE NOT is_hub), (SELECT max(id) FROM locations WHERE NOT is_hub), 5, now(), now(), now(), now(), 't'
        FROM national_orders n WHERE n.legacy_id = 'rec74E17';`), 0);
    const rt = (m) => `SET LOCAL session_replication_role = replica;
      INSERT INTO trucks (license_plate) VALUES ('TEST-074-E17-${m}');
      INSERT INTO ct_round_trips (code, model, scope, trip_type, truck_id, date_start, date_end, start_at, end_at, status, source, created_by)
      VALUES ('RT-E17-${m}', ${m}, 'NATL', 'OWNED', (SELECT id FROM trucks WHERE license_plate = 'TEST-074-E17-${m}'), current_date - 30, current_date - 20,
              ${m === 2 ? "now() - interval '30 days', now() - interval '20 days'" : 'NULL, NULL'}, 'planned', 'planner', 't');`;
    const b10 = await checkValue(db, 'B-10');
    assert.strictEqual(await redIn(db, 'B-10', rt(2)), b10);
    assert.strictEqual(await redIn(db, 'B-10', rt(1)), b10 + 1);
  });

  await t.test('074b rollback: the 5 checks out, the 3 texts back byte for byte; then 074b again', async () => {
    assert.strictEqual(await errorOf(db, read('074b_plan_cutover_monitoring_rollback.sql')), null);
    assert.strictEqual(await n(db, `SELECT count(*) FROM monitoring.checks WHERE id = ANY($1)`, [NEW_IDS]), 0);
    for (const [id, o] of Object.entries(OLD)) {
      assert.strictEqual((await one(db, `SELECT md5(sql_text) AS m FROM monitoring.checks WHERE id = $1`, [id])).m, o.md5, id);
    }
    assert.strictEqual(await errorOf(db, read('074b_plan_cutover_monitoring.sql')), null);
  });
});
