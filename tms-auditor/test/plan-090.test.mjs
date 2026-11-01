// 090 (locations: ISO country, one space, the merge of duplicates; F16/F17, owner 1/11) on the production-shaped
// PGlite copy: prod-shaped-074.mjs + 075..078, 080 and fixtures/live-090.sql (the 25 foreign keys and the two
// order-leg triggers production holds and the copy lacked, md5 = production's). 081 and 082 patch plan functions that
// neither read nor write a location's name, country or id, so they are left out.
// Every case reads ROWS (locations, the referencing tables, audit_log, loc_090_before), never only a message.
// The merges run inside a transaction that is rolled back, so the rollback of 090 is proven on the same copy.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
const num = async (db, sql, p) => Number(Object.values((await db.query(sql, p)).rows[0])[0]);
async function errorOf(db, sql, p) { try { if (p) await db.query(sql, p); else await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const P = '090_locations_clean_merge';
const NBSP = String.fromCharCode(160);

// test rows only: legacy ids rec090..., references T90-...
const ROWS = `
INSERT INTO locations (legacy_id, name, city, country) VALUES
  ('rec090A', 'TEST 090 Kept' || chr(160) || ' (WAREHOUSE)', ' Veria  ', 'Greece'),
  ('rec090B', 'TEST 090  Dropped', 'Veria', 'GR'),
  ('rec090C', 'TEST 090 Italy', 'Verona', 'Italy'),
  ('rec090D', 'TEST 090 no country', NULL, NULL),
  ('rec090E', 'TEST 090 E', 'Naousa', 'Greece'),
  ('rec090F', 'TEST 090 F', 'Naousa', 'Greece');
UPDATE locations SET address = 'TEST 090 street 1', latitude = 40.5, longitude = 22.2, phone = '2310 000000' WHERE legacy_id = 'rec090B';
INSERT INTO clients (legacy_id, company_name, city) VALUES ('rec090K1', 'TEST 090 CLIENT KEPT', 'NAOUSA'), ('rec090K2', 'TEST 090 CLIENT DROPPED', 'NAOUSA');
UPDATE clients SET phone = '23320 00000' WHERE legacy_id = 'rec090K2';
-- an order that points at B (the duplicate) in two columns, with two legs that the order triggers keep in step
INSERT INTO orders (legacy_id, order_type, direction, status, reference, loading_datetime, delivery_datetime,
                    loading_location_1_id, unloading_location_1_id, unloading_location_2_id, client_id)
  SELECT 'rec090O', 'International', 'Export', 'Pending', 'T90-1', DATE '2026-11-03', DATE '2026-11-06',
         (SELECT id FROM locations WHERE legacy_id = 'rec090B'), (SELECT id FROM locations WHERE legacy_id = 'rec090C'),
         (SELECT id FROM locations WHERE legacy_id = 'rec090B'), (SELECT id FROM clients WHERE legacy_id = 'rec090K2');
INSERT INTO orders (legacy_id, order_type, direction, status, reference, parent_order_id, leg_no, loading_datetime, delivery_datetime,
                    loading_location_1_id, unloading_location_1_id, client_id)
  SELECT 'rec090L1', 'International', 'Export', 'Pending', 'T90-1', o.id, 1, o.loading_datetime, DATE '2026-11-04',
         o.loading_location_1_id, (SELECT id FROM locations WHERE legacy_id = 'rec090D'), o.client_id FROM orders o WHERE o.legacy_id = 'rec090O';
INSERT INTO orders (legacy_id, order_type, direction, status, reference, parent_order_id, leg_no, loading_datetime, delivery_datetime,
                    loading_location_1_id, unloading_location_1_id, unloading_location_2_id, client_id)
  SELECT 'rec090L2', 'International', 'Export', 'Pending', 'T90-1', o.id, 2, DATE '2026-11-04', o.delivery_datetime,
         (SELECT id FROM locations WHERE legacy_id = 'rec090D'), o.unloading_location_1_id, o.unloading_location_2_id, o.client_id
    FROM orders o WHERE o.legacy_id = 'rec090O';
INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, client_at_stop_id)
  SELECT 'rec090S', 'Loading', 1, DATE '2026-11-03', o.id, o.loading_location_1_id, o.client_id FROM orders o WHERE o.legacy_id = 'rec090O';
INSERT INTO national_orders (legacy_id, reference, pickup_location_1_id, client_id)
  SELECT 'rec090N', 'T90-2', id, (SELECT id FROM clients WHERE legacy_id = 'rec090K2') FROM locations WHERE legacy_id = 'rec090B';
INSERT INTO national_loads (legacy_id, status, source_type, delivery_location_3_id)
  SELECT 'rec090NL', 'Pending', 'National', id FROM locations WHERE legacy_id = 'rec090B';
INSERT INTO consolidated_loads (legacy_id, status, loading_location_7_id) SELECT 'rec090CL', 'Unassigned', id FROM locations WHERE legacy_id = 'rec090B';
INSERT INTO groupage_lines (legacy_id, status, delivery_location_id) SELECT 'rec090G', 'Unassigned', id FROM locations WHERE legacy_id = 'rec090B';
-- a parent whose leg 1 was moved by hand (its loading date differs from the parent's), at place E: a merge of E would
-- make the order triggers copy one date onto the other (one such family in production, SELECT 1/11)
INSERT INTO orders (legacy_id, order_type, direction, status, reference, loading_datetime, delivery_datetime, loading_location_1_id)
  SELECT 'rec090P', 'International', 'Export', 'Pending', 'T90-3', DATE '2026-11-03', DATE '2026-11-06', id FROM locations WHERE legacy_id = 'rec090E';
INSERT INTO orders (legacy_id, order_type, direction, status, reference, parent_order_id, leg_no, loading_datetime, delivery_datetime, loading_location_1_id)
  SELECT 'rec090PL', 'International', 'Export', 'Pending', 'T90-3', o.id, 1, DATE '2026-11-02', DATE '2026-11-04', o.loading_location_1_id
    FROM orders o WHERE o.legacy_id = 'rec090P';`;
const id = async (db, t, leg) => num(db, `SELECT id FROM ${t} WHERE legacy_id = $1`, [leg]);

// A v5 cycle on a VS import, as plan-082.test.mjs builds it (its helpers, prefixed t90): the order's Greek drop is
// then held by order_stops, shipments (dest) and rt_stops - the tables whose rules plan_chk runs at COMMIT.
const V5 = `
CREATE FUNCTION t90_vs(p_ref text, p_hub date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare o bigint; hub bigint; lx bigint; lg bigint;
begin
  select id into hub from locations where is_hub;
  insert into locations (legacy_id, name) values ('rec90X' || p_ref, 'TEST 090 abroad ' || p_ref) returning id into lx;
  insert into locations (legacy_id, name, country) values ('rec90G' || p_ref, 'TEST 090 GR ' || p_ref, 'GR') returning id into lg;
  insert into orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  values ('rec90O' || p_ref, 'International', 'Import', 'Pending', true, p_hub - 3, p_hub + 1, p_hub, 'T90-' || p_ref,
          (select min(id) from clients)) returning id into o;
  insert into order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets) values
    ('rec90A' || p_ref, 'Loading', 1, p_hub - 3, o, lx, 10), ('rec90H' || p_ref, 'Cross-dock', 1, p_hub, o, hub, 10),
    ('rec90S' || p_ref, 'Unloading', 1, p_hub + 1, o, lg, 10);
  return o;
end $t$;
CREATE FUNCTION t90_put(p_ref text, p_day date) RETURNS bigint LANGUAGE plpgsql AS $t$
declare trk bigint; pc bigint; hub bigint; r jsonb;
begin
  select id into hub from locations where is_hub;
  select sp.id into pc from shipment_pieces sp join shipments s on s.id = sp.shipment_id join order_stops st on st.id = s.order_stop_id
   where st.legacy_id = 'rec90S' || p_ref and s.deleted_at is null and sp.deleted_at is null and sp.parent_piece_id is null;
  insert into trucks (license_plate) values ('TEST-090-' || p_ref) returning id into trk;
  r := plan_put_pieces(jsonb_build_object(
         'pieces', jsonb_build_array(jsonb_build_object('piece_id', pc, 'drop', 'd1')),
         'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk), 'side', 'KATHODOS'),
         'stops', jsonb_build_array(
           jsonb_build_object('ref', 'p', 'location_id', hub, 'side', 'KATHODOS',
             'planned_from', (p_day + time '06:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '07:00') at time zone 'Europe/Athens'),
           jsonb_build_object('ref', 'd1', 'side', 'KATHODOS', 'location_id', (select id from locations where legacy_id = 'rec90G' || p_ref),
             'planned_from', (p_day + time '10:00') at time zone 'Europe/Athens', 'planned_to', (p_day + time '11:00') at time zone 'Europe/Athens'))),
         'test:090', 'dispatcher');
  perform set_config('plan.writer', '', true);
  return (r->'ids'->>'rt_id')::bigint;
end $t$;`;

test('090 on the production-shaped copy: ISO country and one space on every write, the merge with every reference moved', async (t) => {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-090.sql', import.meta.url), 'utf8'));
  // the old national model takes no NEW row after day L (plan_legacy_frozen, INSERT only): the test's rows of it are
  // made with that rule off for this one statement, then it is on again before anything is counted or run
  const FROZEN = ['national_loads', 'consolidated_loads', 'groupage_lines'];
  for (const f of FROZEN) await db.exec(`ALTER TABLE ${f} DISABLE TRIGGER plan_legacy_frozen`);
  await db.exec(ROWS);
  await db.exec(V5);
  for (const f of FROZEN) await db.exec(`ALTER TABLE ${f} ENABLE TRIGGER plan_legacy_frozen`);
  const trg0 = await num(db, TRG);
  await db.query(`UPDATE monitoring.checks SET red_value = $1 WHERE id = 'B-54'`, [trg0]);
  const A = await id(db, 'locations', 'rec090A'), B = await id(db, 'locations', 'rec090B');

  await t.test('the copy holds production\'s order-leg triggers (md5 = production 1/11) and its foreign keys', async () => {
    const m = Object.fromEntries((await db.query(`SELECT proname, md5(prosrc) AS m FROM pg_proc WHERE proname IN
      ('order_parent_to_legs', 'order_legs_to_parent', 'order_legs_audit', 'plan_bridge_on_stop')`)).rows.map((r) => [r.proname, r.m]));
    assert.deepStrictEqual(m, { order_parent_to_legs: '0c52d2d70a60ce6527a9ca740e21b8aa', order_legs_to_parent: 'c4c532b9feaa6d5619bf1666772fa77b',
      order_legs_audit: '9ad748e423f55aa721d9de2b2a172cc7', plan_bridge_on_stop: 'c133ef3f4928da5a625af58072e5af32' });
    // production: 91 onto locations, 6 onto clients (SELECT 1/11)
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.locations'::regclass`), 91);
    assert.strictEqual(await num(db, `SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.clients'::regclass`), 6);
  });

  await t.test('the dry run runs 090 to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read(`${P}_dryrun.sql`));
    assert.match(msg, /DRY RUN 090 finished - EVERYTHING UNDONE.*090 ran: trigger 1, check 1, merge yes, kept \d+, not code 0/);
    assert.strictEqual((await one(db, read(`${P}_verify.sql`))).applied, '090 NOT APPLIED');
    assert.strictEqual((await one(db, `SELECT country FROM locations WHERE id = $1`, [A])).country, 'Greece');
  });

  await t.test('090 codes every country, cleans the spaces, keeps what it changed, and B-54 follows', async () => {
    await db.exec(read(`${P}.sql`));
    const v = await one(db, read(`${P}_verify.sql`));
    assert.deepStrictEqual(
      [v.applied, Number(v.not_code), Number(v.unclean), v.trigger, v.check, v.merge, v.merge_open, Number(v.merged_rows), v.refs_to_merged, v.b54_ok],
      ['090 APPLIED', 0, 0, true, true, true, false, 0, '{}', true]);
    assert.ok(Number(v.kept_rows) >= 3);
    const a = await one(db, `SELECT name, city, country FROM locations WHERE id = $1`, [A]);
    assert.deepStrictEqual(a, { name: 'TEST 090 Kept (WAREHOUSE)', city: 'Veria', country: 'GR' });
    assert.strictEqual((await one(db, `SELECT country FROM locations WHERE legacy_id = 'rec090C'`)).country, 'IT');
    assert.strictEqual((await one(db, `SELECT country FROM locations WHERE legacy_id = 'rec090D'`)).country, null);
    const kept = await one(db, `SELECT name, city, country FROM loc_090_before WHERE id = $1`, [A]);
    assert.deepStrictEqual(kept, { name: `TEST 090 Kept${NBSP} (WAREHOUSE)`, city: ' Veria  ', country: 'Greece' });
    assert.strictEqual(await num(db, `SELECT count(*) FROM loc_090_before WHERE id = $1`, [B]), 1, 'the double space of B was kept too');
    assert.strictEqual(await num(db, TRG), trg0 + 1);
    assert.strictEqual(await num(db, `SELECT count(*) FROM audit_log WHERE actor = '090' AND table_name = 'locations'`), 1);
    assert.match(await errorOf(db, read(`${P}.sql`)), /090: already applied - stop/);
  });

  await t.test('every write after 090: a name becomes the code, one space; an unknown spelling is refused', async () => {
    const r = await one(db, `INSERT INTO locations (legacy_id, name, city, country) VALUES ('rec090W', $1, ' Kopanos ', 'netherlands') RETURNING name, city, country`,
      [`TEST${NBSP}${NBSP}090  W `]);
    assert.deepStrictEqual(r, { name: 'TEST 090 W', city: 'Kopanos', country: 'NL' });
    assert.strictEqual((await one(db, `UPDATE locations SET country = 'el' WHERE legacy_id = 'rec090W' RETURNING country`)).country, 'GR');
    assert.strictEqual((await one(db, `UPDATE locations SET country = '  ' WHERE legacy_id = 'rec090W' RETURNING country`)).country, null);
    assert.match(await errorOf(db, `UPDATE locations SET country = 'Narnia' WHERE legacy_id = 'rec090W'`), /locations_country_iso/);
    assert.strictEqual((await one(db, `SELECT country FROM locations WHERE legacy_id = 'rec090W'`)).country, null, 'the refused write left nothing');
    assert.match(await errorOf(db, `UPDATE locations SET country = 'xx' WHERE legacy_id = 'rec090W'`), /locations_country_iso/, 'two letters that are no country');
  });

  await t.test('the Worker (service_role) saves a place through the rule, while every helper stays closed to it', async () => {
    await db.exec('BEGIN');
    try {
      // production grants the Worker's role the table (has_table_privilege, SELECT 1/11); the copy does not
      await db.exec('GRANT SELECT, INSERT, UPDATE ON public.locations TO service_role');
      await db.exec('SET LOCAL ROLE service_role');
      const r = await one(db, `UPDATE locations SET country = 'Italy', city = $1 WHERE legacy_id = 'rec090W' RETURNING country, city`, [` Verona${NBSP} `]);
      assert.deepStrictEqual(r, { country: 'IT', city: 'Verona' });
      for (const sql of [`SELECT country_iso('Italy')`, `SELECT entity_merge('locations', 1, 2, 'x')`, `SELECT entity_merged_refs()`]) {
        await db.exec('SAVEPOINT p');
        assert.match(await errorOf(db, sql), /permission denied/, sql);
        await db.exec('ROLLBACK TO SAVEPOINT p');
      }
    } finally { await db.exec('ROLLBACK'); }
  });

  await t.test('the merge (inside a transaction that is rolled back)', async (tt) => {
    await db.exec('BEGIN');
    try {
      const O = await id(db, 'orders', 'rec090O'), L1 = await id(db, 'orders', 'rec090L1'), L2 = await id(db, 'orders', 'rec090L2');
      const D = await id(db, 'locations', 'rec090D');
      const res = (await one(db, `SELECT entity_merge('locations', $1, $2, 'test:090') AS r`, [A, B])).r;

      await tt.test('every reference to the duplicate now points at the kept place, in every table', async () => {
        assert.deepStrictEqual(res.moved, {
          'consolidated_loads.loading_location_7_id': 1, 'groupage_lines.delivery_location_id': 1,
          'national_loads.delivery_location_3_id': 1, 'national_orders.pickup_location_1_id': 1,
          'order_stops.location_id': 1, 'orders.loading_location_1_id': 2, 'orders.unloading_location_2_id': 2 });
        const refs = await one(db, `SELECT
          (SELECT count(*) FROM orders WHERE $1 IN (loading_location_1_id, unloading_location_2_id))::int AS o,
          (SELECT count(*) FROM order_stops WHERE location_id = $1)::int AS s,
          (SELECT count(*) FROM national_orders WHERE pickup_location_1_id = $1)::int AS no,
          (SELECT count(*) FROM national_loads WHERE delivery_location_3_id = $1)::int AS nl,
          (SELECT count(*) FROM consolidated_loads WHERE loading_location_7_id = $1)::int AS cl,
          (SELECT count(*) FROM groupage_lines WHERE delivery_location_id = $1)::int AS gl`, [B]);
        assert.deepStrictEqual(refs, { o: 0, s: 0, no: 0, nl: 0, cl: 0, gl: 0 });
        const fam = (await db.query(`SELECT legacy_id, loading_location_1_id AS l1, unloading_location_2_id AS u2
          FROM orders WHERE id = ANY($1) ORDER BY legacy_id`, [[O, L1, L2]])).rows;
        assert.deepStrictEqual(fam.map((r) => [r.legacy_id, Number(r.l1), r.u2 == null ? null : Number(r.u2)]),
          [['rec090L1', A, null], ['rec090L2', D, A], ['rec090O', A, A]]);
      });

      await tt.test('the kept place took what it lacked (address, phone, coordinates), the duplicate is deleted and says where it went', async () => {
        const a = await one(db, `SELECT address, phone, latitude::float AS lat, longitude::float AS lng, deleted_at, merged_into_id FROM locations WHERE id = $1`, [A]);
        assert.deepStrictEqual(a, { address: 'TEST 090 street 1', phone: '2310 000000', lat: 40.5, lng: 22.2, deleted_at: null, merged_into_id: null });
        const b = await one(db, `SELECT deleted_at IS NOT NULL AS gone, merged_into_id FROM locations WHERE id = $1`, [B]);
        assert.deepStrictEqual({ gone: b.gone, into: Number(b.merged_into_id) }, { gone: true, into: A });
        assert.deepStrictEqual([...res.filled].sort(), ['address', 'latitude', 'longitude', 'phone']);
      });

      await tt.test('one audit row per moved row and one per place, by the one who merged', async () => {
        assert.strictEqual(await num(db, `SELECT count(*) FROM audit_log WHERE actor = 'test:090'`), 9 + 2);
        const row = await one(db, `SELECT before_data, after_data FROM audit_log WHERE actor = 'test:090' AND table_name = 'order_stops'`);
        assert.deepStrictEqual(row.before_data, { location_id: B });
        assert.strictEqual(row.after_data.location_id, A);
      });

      await tt.test('it refuses: the same id twice, a merged or deleted row, the hub, a table other than the two', async () => {
        const hub = await num(db, `SELECT id FROM locations WHERE is_hub`);
        const C = await id(db, 'locations', 'rec090C');
        for (const [args, re] of [
          [['locations', A, A], /two different ids/], [['locations', A, B], /was already merged into/],
          [['locations', B, C], /is deleted \(merged into/], [['locations', hub, C], /hub is never merged/],
          [['orders', A, C], /only locations or clients/], [['locations', A, 999999999], /does not exist/]]) {
          await db.exec('SAVEPOINT r');
          assert.match(await errorOf(db, `SELECT entity_merge($1, $2, $3, 'test:090')`, args), re);
          await db.exec('ROLLBACK TO SAVEPOINT r');
        }
      });

      await tt.test('a merge that would make a trigger rewrite more than a place is refused whole', async () => {
        const E = await id(db, 'locations', 'rec090E'), F = await id(db, 'locations', 'rec090F');
        await db.exec('SAVEPOINT d');
        assert.match(await errorOf(db, `SELECT entity_merge('locations', $1, $2, 'test:090')`, [F, E]),
          /changed more than the reference columns in orders/);
        await db.exec('ROLLBACK TO SAVEPOINT d');
        assert.strictEqual(await num(db, `SELECT count(*) FROM orders WHERE loading_location_1_id = $1`, [E]), 2, 'nothing moved');
        assert.strictEqual(await num(db, `SELECT count(*) FROM locations WHERE id = $1 AND deleted_at IS NULL`, [E]), 1);
      });

      await tt.test('clients: the order family, the stop and the national order move; the kept client takes the phone', async () => {
        const K1 = await id(db, 'clients', 'rec090K1'), K2 = await id(db, 'clients', 'rec090K2');
        const r = (await one(db, `SELECT entity_merge('clients', $1, $2, 'test:090') AS r`, [K1, K2])).r;
        assert.deepStrictEqual(r.moved, { 'national_orders.client_id': 1, 'order_stops.client_at_stop_id': 1, 'orders.client_id': 3 });
        assert.strictEqual(await num(db, `SELECT count(*) FROM orders WHERE client_id = $1`, [K2]), 0);
        assert.strictEqual((await one(db, `SELECT phone FROM clients WHERE id = $1`, [K1])).phone, '23320 00000');
        assert.strictEqual(Number((await one(db, `SELECT merged_into_id FROM clients WHERE id = $1`, [K2])).merged_into_id), K1);
      });

      await tt.test('a place a v5 cycle uses: order stop, shipment and cycle stop move, and the COMMIT rules pass', async () => {
        const L = (await one(db, `SELECT plan_cutover_day()::text AS l`)).l;
        await db.exec('SAVEPOINT v5');
        try {
        await num(db, `SELECT t90_vs('M1', DATE '${L}' + 3)`);
        const rt = await num(db, `SELECT t90_put('M1', DATE '${L}' + 4)`);
        assert.strictEqual(await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE'), null, 'the cycle is valid before the merge');
        await db.exec('SET CONSTRAINTS ALL DEFERRED');
        const G = await id(db, 'locations', 'rec90GM1');
        const K = await num(db, `INSERT INTO locations (legacy_id, name, country) VALUES ('rec090VK', 'TEST 090 GR kept', 'GR') RETURNING id`);
        assert.strictEqual(await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND location_id = $2 AND deleted_at IS NULL`, [rt, G]), 1, 'the cycle stops at G');
        const r = (await one(db, `SELECT entity_merge('locations', $1, $2, 'test:090') AS r`, [K, G])).r;
        // the order stop moves; its trigger (081: the cycle's stop follows the order's point) carries the cycle stop
        // along before the merge reaches rt_stops, so that move is the trigger's, not counted twice
        assert.ok(r.moved['order_stops.location_id'] === 1, JSON.stringify(r.moved));
        assert.strictEqual(await errorOf(db, 'SET CONSTRAINTS ALL IMMEDIATE'), null, 'plan_chk at COMMIT accepts the moved cycle');
        assert.strictEqual(await num(db, `SELECT count(*) FROM rt_stops WHERE rt_id = $1 AND location_id = $2 AND deleted_at IS NULL`, [rt, K]), 1, 'the cycle stops at K');
        assert.strictEqual(await num(db, `SELECT count(*) FROM rt_stops WHERE location_id = $1`, [G]), 0);
        assert.strictEqual(await num(db, `SELECT count(*) FROM v_shipments WHERE nat_to_location_id = $1`, [G]), 0);
        } finally { await db.exec('ROLLBACK TO SAVEPOINT v5'); }
      });

      await tt.test('a row saved onto a merged place afterwards (a tab opened before the merge) is counted, never hidden', async () => {
        assert.deepStrictEqual(JSON.parse((await one(db, read(`${P}_verify.sql`))).refs_to_merged), {});
        await db.exec('SAVEPOINT late');
        const O = await id(db, 'orders', 'rec090O');
        await db.query(`INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id) VALUES ('rec090late', 'Unloading', 2, DATE '2026-11-06', $1, $2)`, [O, B]);
        assert.deepStrictEqual(JSON.parse((await one(db, read(`${P}_verify.sql`))).refs_to_merged), { 'order_stops.location_id': 1 });
        await db.exec('ROLLBACK TO SAVEPOINT late');
      });

      await tt.test('verify counts the merged rows, and the rollback of 090 refuses while they exist', async () => {
        assert.strictEqual(Number((await one(db, read(`${P}_verify.sql`))).merged_rows), 2);
        await db.exec('SAVEPOINT rb');
        assert.match(await errorOf(db, read(`${P}_rollback.sql`)), /2 rows are merged \(090b ran\)/);
        await db.exec('ROLLBACK TO SAVEPOINT rb');
      });
    } finally {
      await db.exec('ROLLBACK');
    }
    assert.strictEqual(await num(db, `SELECT count(*) FROM locations WHERE merged_into_id IS NOT NULL`), 0);
  });

  await t.test('the rollback: its dry run keeps nothing; then the old texts are back, a row edited after 090 keeps its edit', async () => {
    await db.query(`UPDATE locations SET name = 'TEST 090 renamed after 090' WHERE id = $1`, [B]);
    const msg = await errorOf(db, read(`${P}_rollback_dryrun.sql`));
    assert.match(msg, /DRY RUN 090 ROLLBACK finished - EVERYTHING UNDONE.*rollback ran: trigger 0, check 0, merge no, kept none/);
    assert.strictEqual((await one(db, read(`${P}_verify.sql`))).applied, '090 APPLIED');
    await db.exec(read(`${P}_rollback.sql`));
    const v = await one(db, read(`${P}_verify.sql`));
    assert.strictEqual(v.applied, '090 NOT APPLIED');
    assert.strictEqual(v.b54_ok, true);
    assert.deepStrictEqual(await one(db, `SELECT name, city, country FROM locations WHERE id = $1`, [A]),
      { name: `TEST 090 Kept${NBSP} (WAREHOUSE)`, city: ' Veria  ', country: 'Greece' });
    assert.strictEqual((await one(db, `SELECT name FROM locations WHERE id = $1`, [B])).name, 'TEST 090 renamed after 090');
    assert.strictEqual(await num(db, TRG), trg0);
    assert.match(await errorOf(db, read(`${P}_rollback.sql`)), /090 is not applied - nothing to undo/);
  });
});
