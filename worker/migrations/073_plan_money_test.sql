-- RULES TEST 073 (national v5 money, route, pallets): every case on TEST rows, then undone.
-- Runs AFTER 073 said "073 OK". At build time it runs on the PGlite copy (tms-auditor/test/plan-073.test.mjs). On
-- production it is OPTIONAL, after 15:00, with an explicit yes: it writes TEST rows (locations, clients, a partner,
-- trucks, drivers, national orders, VS orders with stops, v5 cycles, pallet rows, cost lines, a stock lot) and undoes
-- ALL of them with a deliberate final error. Only trace: identity and code sequences advance (RT-... and PM-...).
-- ONE statement. The red error message IS the result:
--   "RULES TEST 073 finished - EVERYTHING UNDONE, nothing kept. Result: <N> OK, 0 FAIL || ...".
-- Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Each case builds S (two OWNED v5 cycles: R1 truck 1 / driver 1 on day D, KATHODOS stops A 06-08, Veroia 09-10,
-- B 12-14; R2 truck 2 / driver 2 the same on D+1; national order N1 A->B, 10 pallets, price 400, pallet exchange,
-- one shipment and one piece p1 waiting at A), makes its calls, reads the verdict, undoes (marker exception).
-- The money cases are written for the owner's choices (DECISION_LOG 24/10): M-1 gamma (a leaf's share split equally
-- over every leg that carried it), M-2 alpha (the international loses the whole X from registration), M-3 beta
-- (running sums, to the cent). X is read from ct_settings (never typed here: principle 3).
-- Written on 072 AS IMPLEMENTED + 072b (order 072 -> 072b -> 073): every creation (plan_orders_create,
-- plan_split_piece) carries a fresh request_id (decision 44: refused without one), and the vehicle of a v5 cycle is
-- changed only through plan_* (072b: the cycle's vehicle fields are the first segment's copy, a direct UPDATE is
-- refused at COMMIT as seg_copy).
-- ASCII only. Test ids: legacy_id rec073T..., reference WN073-TEST, names "TEST 073 ...", plates TEST-073-..., actor
-- test:073, day D = Athens today + 40.
DO $t073$
DECLARE
  td date; d date; e date; k int;
  hub bigint; la bigint; lb bigint; lc bigint; cl1 bigint; cl2 bigint; pa bigint; pb bigint;
  trk1 bigint; trk2 bigint; trk3 bigint; drv1 bigint; drv2 bigint;
  a06 timestamptz; a08 timestamptz; a09 timestamptz; a10 timestamptz; a12 timestamptz; a14 timestamptz;
  a15 timestamptz; a16 timestamptz; a17 timestamptz; a18 timestamptz;
  b06 timestamptz; b08 timestamptz; b09 timestamptz; b10 timestamptz; b12 timestamptz; b14 timestamptz;
  rt1 bigint; rt2 bigint; rt3 bigint; s1a bigint; s1h bigint; s1b bigint; s2a bigint; s2h bigint; s2b bigint;
  n1 bigint; sh1 bigint; p1 bigint; jsh1 jsonb; jo1 jsonb; vso bigint; vs_b bigint; xim numeric;
  x bigint; y bigint; z bigint; q bigint; n int; m int; t1 text;
  r jsonb; r2 jsonb; j jsonb; tgt1 jsonb; tgt2 jsonb; st1 jsonb; st2 jsonb;
  want text[] := ARRAY[
    NULL
    , 'ok'               -- 1 a national with pallet exchange onto a cycle: pending LOADING at A, pending DELIVERY at B (taken = given)
    , 'ok'               -- 2 without pallet exchange: no pallet row
    , 'ok'               -- 3 through Veroia, split 6 + 4: LOADING 10 at A, DELIVERY 6 at B, nothing at the hub
    , 'ok'               -- 4 move: the pending rows are withdrawn (reversed, never deleted) and the new leg writes its own
    , 'ok'               -- 5 move after a confirmed LOADING: listed (pallets_confirmed), withdrawn after the token
    , 'plan:need_token'  -- 6 the same move without the token
    , 'ok'               -- 7 the cycle moves a day: the pending rows follow, the confirmed one stays
    , 'ok'               -- 8 pallet exchange off: pending withdrawn, confirmed stays
    , 'ok'               -- 9 10 -> 8 pallets while it rides: the pending rows follow
    , 'plan:pallet_fraction' -- 10 10.5 pallets with pallet exchange: never rounded in silence
    , 'ok'               -- 11 delete: the pending rows are withdrawn, the count of pallet rows never shrinks
    , 'ok'               -- 12 a VS bridge with pallet exchange: no v5 row (the international stop has one writer)
    , 'con:pl_mov_stop_once' -- 13 two live DELIVERY rows on one international stop
    , 'ok'               -- 14 a reversed row and its replacement on the same stop
    , 'con:pl_mov_leg_once' -- 15 a second LOADING row on the same leg
    , 'ok'               -- 16 revenue: the national's price in revenue_natl of its cycle; revenue = intl + natl
    , 'ok'               -- 17 groupage of 3 orders on one cycle: the three prices
    , 'ok'               -- 18 through Veroia, split 6 + 4 (M-1 gamma): each leaf's share split equally over the legs that carried it
    , 'ok'               -- 19 VS 33 pallets split 20 + 13: X shared per pallet, the 13 unassigned
    , 'ok'               -- 20 the international trip of that VS (M-2 alpha): minus the whole X, from registration
    , 'ok'               -- 21 100 euro over 3 pallets: 33.33 + 33.34 + 33.33 (M-3 beta), the sum to the cent
    , 'ok'               -- 22 waiting: the share has no cycle; the cycle earns 0
    , 'ok'               -- 23 a VS with a bridge and a Direct national load: X is never counted twice
    , 'ok'               -- 24 a v5 PARTNER trip: rate = partner_planned; no rate = partner_rate_missing; invoiced = not missing
    , 'ok'               -- 25 a partner trip of today's model: never partner_rate_missing
    , 'ok'               -- 26 route: one block per side, KATHODOS first, first and last stop, + stops
    , 'ok'               -- 27 route of an ANODOS-only cycle
    , 'ok'               -- 28 a cancelled v5 cycle has no route
    , 'ok'               -- 29 partner pallet gate: a direct v5 leg has its sheet only when LOADING AND DELIVERY are confirmed
    , 'ok'               -- 30 stock 057: a national lot piece with v5 shipments is delivered when its leg executed
    , 'ok'               -- 31 wear: a v5 cycle without km adds nothing to the truck's km and its wear is 0 (E8)
    , 'ok'               -- 32 the dispatcher's list shows the confirmed pallet rows (counts), never an amount
    , 'ok'               -- 33 Q9-1: the user's taken on a pending DELIVERY ("not got back") survives a later change of the leg
    , 'ok'               -- 34 a national order with v5 shipments AND an old home NL on a trip: its price counts once
    -- cross-cutting input rule (coordinator 25/10): the feeder refuses by name what would reach the ledger endless
    , 'ok'               -- 35 a riding piece whose pallets became NaN: bad_input piece:<id>:finite, no pallet row written
    , 'ok'               -- 36 a stop whose window ends at 'infinity': bad_input leg:<id>:finite, no pallet row written
    -- final round 1 (26/10): owner Q6-1, coordinator Q9-1, final review finding 3
    , 'ok'               -- 37 Q9-1, 10 -> 8 pallets: LOADING taken follows, the user's given stays; DELIVERY given follows, the user's taken stays
    , 'ok'               -- 38 a split parent's pending LOADING follows the order's correction (its leaves' pallets now)
    , 'ok'               -- 39 Q6-1, two partners with rates: planned = the sum; one partner's invoice replaces only its own rate
    , 'ok'               -- 40 Q6-1, two partners, one without a rate: pending until THAT partner invoices; an unnamed line is counted, replaces nothing
    , 'ok'               -- 41 the X shared for a child order uses its parent's direction, as the international deducts it
    -- @want (one line per case: "    , '<ok|plan:code|con:name|state:XXXXX>'  -- <k> <what>")
  ]::text[];
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  want := want[2:];   -- drop the leading NULL that keeps every want line in the same ", '...'" shape
  IF to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 073: 073 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec073T%') OR EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec073T%')
     OR EXISTS (SELECT 1 FROM national_orders WHERE legacy_id LIKE 'rec073T%' OR reference = 'WN073-TEST')
     OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-073-%')
     OR EXISTS (SELECT 1 FROM clients WHERE company_name LIKE 'TEST 073 %') THEN
    RAISE EXCEPTION 'RULES TEST 073: test ids (rec073T..., WN073-TEST, TEST 073 ..., TEST-073-...) already exist - stop';
  END IF;
  xim := ct_setting('x_import');
  IF xim IS NULL OR ct_setting('full_truck_pallets') IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 073: ct_settings x_import / full_truck_pallets missing';
  END IF;

  -- Fixture (undone by the final error).
  td := (now() AT TIME ZONE 'Europe/Athens')::date; d := td + 40; e := d + 1;
  a06 := (d + time '06:00') AT TIME ZONE 'Europe/Athens'; a08 := (d + time '08:00') AT TIME ZONE 'Europe/Athens';
  a09 := (d + time '09:00') AT TIME ZONE 'Europe/Athens'; a10 := (d + time '10:00') AT TIME ZONE 'Europe/Athens';
  a12 := (d + time '12:00') AT TIME ZONE 'Europe/Athens'; a14 := (d + time '14:00') AT TIME ZONE 'Europe/Athens';
  a15 := (d + time '15:00') AT TIME ZONE 'Europe/Athens'; a16 := (d + time '16:00') AT TIME ZONE 'Europe/Athens';
  a17 := (d + time '17:00') AT TIME ZONE 'Europe/Athens'; a18 := (d + time '18:00') AT TIME ZONE 'Europe/Athens';
  b06 := (e + time '06:00') AT TIME ZONE 'Europe/Athens'; b08 := (e + time '08:00') AT TIME ZONE 'Europe/Athens';
  b09 := (e + time '09:00') AT TIME ZONE 'Europe/Athens'; b10 := (e + time '10:00') AT TIME ZONE 'Europe/Athens';
  b12 := (e + time '12:00') AT TIME ZONE 'Europe/Athens'; b14 := (e + time '14:00') AT TIME ZONE 'Europe/Athens';
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec073TA', 'TEST 073 A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec073TB', 'TEST 073 B') RETURNING id INTO lb;
  INSERT INTO locations (legacy_id, name) VALUES ('rec073TC', 'TEST 073 C') RETURNING id INTO lc;
  INSERT INTO clients (company_name) VALUES ('TEST 073 client 1') RETURNING id INTO cl1;
  INSERT INTO clients (company_name) VALUES ('TEST 073 client 2') RETURNING id INTO cl2;
  INSERT INTO partners (company_name) VALUES ('TEST 073 partner') RETURNING id INTO pa;
  INSERT INTO partners (company_name) VALUES ('TEST 073 partner 2') RETURNING id INTO pb;
  INSERT INTO trucks (license_plate) VALUES ('TEST-073-1') RETURNING id INTO trk1;
  INSERT INTO trucks (license_plate) VALUES ('TEST-073-2') RETURNING id INTO trk2;
  INSERT INTO trucks (license_plate) VALUES ('TEST-073-3') RETURNING id INTO trk3;
  INSERT INTO drivers (full_name) VALUES ('TEST 073 driver 1') RETURNING id INTO drv1;
  INSERT INTO drivers (full_name) VALUES ('TEST 073 driver 2') RETURNING id INTO drv2;
  jsh1 := jsonb_build_object('origin_location_id', la, 'dest_location_id', lb, 'pallets', 2, 'load_from', a06,
                             'load_to', a08, 'deliver_from', a12, 'deliver_to', a14);
  jo1 := jsonb_build_object('client_id', cl2, 'price', 100, 'reference', 'WN073-TEST', 'goods', 'TEST',
                            'temperature_c', 2, 'shipments', jsonb_build_array(jsh1));

  FOR k IN 1..coalesce(array_length(want, 1), 0) LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      -- S
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk1, drv1, d, d, a06, a14, 'planned', 'planner', 'test:073') RETURNING id INTO rt1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 1, la, 'KATHODOS', a06, a08, 'test:073') RETURNING id INTO s1a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 2, hub, 'KATHODOS', a09, a10, 'test:073') RETURNING id INTO s1h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 3, lb, 'KATHODOS', a12, a14, 'test:073') RETURNING id INTO s1b;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk2, drv2, e, e, b06, b14, 'planned', 'planner', 'test:073') RETURNING id INTO rt2;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 1, la, 'KATHODOS', b06, b08, 'test:073') RETURNING id INTO s2a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 2, hub, 'KATHODOS', b09, b10, 'test:073') RETURNING id INTO s2h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 3, lb, 'KATHODOS', b12, b14, 'test:073') RETURNING id INTO s2b;
      INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, temperature_c, pallet_exchange)
      VALUES ('rec073TN1', cl1, 'WN073-TEST', 400, 10, 'TEST', 2, true) RETURNING id INTO n1;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      VALUES (n1, la, lb, 10, a06, a08, a12, a14, 'test:073') RETURNING id INTO sh1;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh1, 10, 'test:073') RETURNING id INTO p1;
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;
      tgt1 := jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS');
      tgt2 := jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS');
      st1 := jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b));
      st2 := jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a), jsonb_build_object('ref', 'b', 'stop_id', s2b));

      IF k IN (1, 2, 16) THEN
        IF k = 2 THEN UPDATE national_orders SET pallet_exchange = false WHERE id = n1; END IF;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
      ELSIF k IN (3, 18) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1, 'to_hub', true)),
               'target', tgt1, 'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a),
                                                          jsonb_build_object('ref', 'h', 'stop_id', s1h))), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('piece_id', p1, 'parts', '[{"pallets": 6}, {"pallets": 4}]'::jsonb), 'test:073', 'owner');
        y := (SELECT id FROM shipment_pieces WHERE parent_piece_id = p1 AND pallets = 6 AND deleted_at IS NULL);
        z := (SELECT id FROM shipment_pieces WHERE parent_piece_id = p1 AND pallets = 4 AND deleted_at IS NULL);
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', y)),
               'target', tgt2, 'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h),
                                                          jsonb_build_object('ref', 'b', 'stop_id', s2b))), 'test:073', 'owner');
        q := (r->'ids'->'leg_ids'->>0)::bigint;
      ELSIF k IN (4, 5, 6, 32) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        -- a second order (no pallet exchange) rides on R1 too, so the move does not empty R1
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('orders', jsonb_build_array(jo1), 'target', tgt1, 'stops', st1),
                                   'test:073', 'owner');
        IF k IN (5, 6, 32) THEN
          UPDATE pl_movements SET status = 'confirmed', confirmed_by = 'test:073', confirmed_at = now(), given = 9,
                 sheet_source = 'MANUAL'
           WHERE piece_leg_id = x AND event_type = 'LOADING' RETURNING id INTO q;
        END IF;
        SELECT count(*) INTO n FROM pl_movements;
        j := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)), 'target', tgt2, 'stops', st2);
        IF k = 4 THEN
          r := plan_move_pieces(j, 'test:073', 'owner');
        ELSIF k = 5 THEN
          r := plan_move_pieces(j || '{"dry_run": true}', 'test:073', 'owner');
          r2 := plan_move_pieces(j || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:073', 'owner');
        ELSIF k = 6 THEN
          PERFORM plan_move_pieces(j, 'test:073', 'owner');
        ELSE
          r := plan_move_pieces(j || '{"dry_run": true}', 'test:073', 'dispatcher');
        END IF;
        y := (SELECT id FROM piece_legs WHERE piece_id = p1 AND deleted_at IS NULL);
      ELSIF k IN (7, 8, 9, 15, 29) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        IF k IN (7, 8) THEN
          UPDATE pl_movements SET status = 'confirmed', confirmed_by = 'test:073', confirmed_at = now(), sheet_source = 'MANUAL'
           WHERE piece_leg_id = x AND event_type = 'LOADING' RETURNING id INTO q;
        END IF;
        IF k = 7 THEN
          r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day')),
                              'test:073', 'dispatcher');
        ELSIF k = 8 THEN
          r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'set', '{"pallet_exchange": false}'::jsonb), 'test:073', 'dispatcher');
        ELSIF k = 9 THEN
          r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments',
                 jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 8))), 'test:073', 'dispatcher');
        ELSIF k = 15 THEN
          INSERT INTO pl_movements (movement_date, counterparty_type, client_id, location_id, event_type, taken, given,
                                    created_by, piece_leg_id)
          VALUES (d, 'CLIENT', cl1, la, 'LOADING', 10, 0, 'test:073', x);
        ELSE   -- 29
          SELECT legs_needing_sheet, legs_with_sheet INTO n, m FROM ct_v_rt_pallet_gate WHERE rt_id = rt1;
          UPDATE pl_movements SET status = 'confirmed', confirmed_by = 'test:073', confirmed_at = now(), sheet_source = 'MANUAL'
           WHERE piece_leg_id = x AND event_type = 'LOADING';
          -- the LOADING alone is not the leg's sheet (final review 26/10, finding 7)
          SELECT legs_with_sheet::text || '/' || sheets_ok::text INTO t1 FROM ct_v_rt_pallet_gate WHERE rt_id = rt1;
          UPDATE pl_movements SET status = 'confirmed', confirmed_by = 'test:073', confirmed_at = now()
           WHERE piece_leg_id = x AND event_type = 'DELIVERY';
        END IF;
      ELSIF k = 10 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('pallet_exchange', true,
                  'shipments', jsonb_build_array(jsh1 || '{"pallets": 10.5}'))), 'target', tgt1, 'stops', st1), 'test:073', 'owner');
      ELSIF k IN (11, 28) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        SELECT count(*) INTO n FROM pl_movements;
        r := plan_delete(jsonb_build_object('nat_order_id', n1, 'reason', 'TEST 073 reason', 'dry_run', true), 'test:073', 'owner');
        r2 := plan_delete(jsonb_build_object('nat_order_id', n1, 'reason', 'TEST 073 reason', 'confirm_token', r->>'confirm_token'),
                          'test:073', 'owner');
      ELSIF k IN (12, 13, 14, 19, 20, 23) THEN
        -- a VS import: loads abroad at C, Veroia day D+1, the Greek delivery at B (33 pallets)
        INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                            cross_dock_date, reference, client_id, price, pallet_exchange)
        VALUES ('rec073TO1', 'International', 'Import', 'Pending', true, d - 3, e, e, 'WN073-TEST', cl2, 3000, true) RETURNING id INTO vso;
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
        VALUES ('rec073TS1', 'Loading', 1, d - 3, vso, lc, 33);
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
        VALUES ('rec073TS2', 'Cross-dock', 1, e, vso, hub, 33);
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
        VALUES ('rec073TS3', 'Unloading', 1, e, vso, lb, 33) RETURNING id INTO vs_b;
        IF k IN (12, 19, 20, 23) THEN
          INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:073') RETURNING id INTO y;
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (y, 33, 'test:073') RETURNING id INTO z;
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
        END IF;
        IF k = 12 THEN
          r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', z)),
                 'target', tgt2, 'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h),
                                                            jsonb_build_object('ref', 'b', 'stop_id', s2b))), 'test:073', 'owner');
          x := (r->'ids'->'leg_ids'->>0)::bigint;
        ELSIF k IN (13, 14) THEN
          INSERT INTO pl_movements (movement_date, counterparty_type, client_id, location_id, event_type, taken, given, status,
                                    order_id, order_stop_id, created_by, confirmed_by, confirmed_at)
          VALUES (e, 'CLIENT', cl2, lb, 'DELIVERY', 33, 33, 'confirmed', vso, vs_b, 'test:073', 'test:073', now()) RETURNING id INTO q;
          IF k = 14 THEN UPDATE pl_movements SET status = 'reversed', reason = 'TEST 073' WHERE id = q; END IF;
          INSERT INTO pl_movements (movement_date, counterparty_type, client_id, location_id, event_type, taken, given, status,
                                    order_id, order_stop_id, created_by, reversal_of)
          VALUES (e, 'CLIENT', cl2, lb, 'DELIVERY', 33, 30, 'pending', vso, vs_b, 'test:073', CASE WHEN k = 14 THEN q END);
        ELSIF k IN (19, 20) THEN
          r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('piece_id', z, 'parts', jsonb_build_array(
                 jsonb_build_object('pallets', 20, 'target', tgt2,
                   'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b))),
                 jsonb_build_object('pallets', 13))), 'test:073', 'owner');
          IF k = 20 THEN
            INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, date_start, date_end, status, source, created_by)
            VALUES ('RT-T073I', 'INTL', 'OWNED', trk3, d - 3, e, 'planned', 'planner', 'test:073') RETURNING id INTO rt3;
            INSERT INTO ct_rt_legs (rt_id, order_id, direction, seq) VALUES (rt3, vso, 'IMPORT', 1);
          END IF;
        ELSE   -- 23: today's Direct national load of the same VS, on a trip of today's model
          INSERT INTO national_loads (legacy_id, source_type, source_order_id, pickup_location_1_id, delivery_location_1_id,
                                      loading_datetime, delivery_datetime, status)
          VALUES ('rec073TNL1', 'Direct', vso, hub, lb, e, e, 'Pending') RETURNING id INTO q;
          INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, date_start, date_end, status, source, created_by)
          VALUES ('RT-T073N', 'INTL', 'OWNED', trk3, e, e, 'planned', 'planner', 'test:073') RETURNING id INTO rt3;
          INSERT INTO ct_rt_legs (rt_id, nat_load_id, direction, seq) VALUES (rt3, q, 'KATHODOS', 1);
        END IF;
      ELSIF k = 17 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('orders', jsonb_build_array(jo1, jo1 || '{"price": 200}', jo1 || '{"price": 300}'),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
      ELSIF k = 21 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(jsh1 || '{"pallets": 1}', jsh1 || '{"pallets": 1}', jsh1 || '{"pallets": 1}'))),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'nat_order_ids'->>0)::bigint;
      ELSIF k = 22 THEN
        NULL;   -- p1 waits at A
      ELSIF k IN (24, 25) THEN
        IF k = 24 THEN
          r := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pa, 'partner_rate', 300),
                 'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'location_id', lc, 'side', 'ANODOS',
                                                               'planned_from', a15, 'planned_to', a16))), 'test:073', 'owner');
          rt3 := (r->>'rt_id')::bigint;
          PERFORM plan_h_finish();
          SET CONSTRAINTS ALL DEFERRED;
          SELECT partner_planned INTO q FROM ct_v_rt_costs WHERE rt_id = rt3;
        ELSE
          INSERT INTO ct_round_trips (code, scope, trip_type, partner_id, date_start, date_end, status, source, created_by)
          VALUES ('RT-T073P', 'INTL', 'PARTNER', pa, d, e, 'planned', 'planner', 'test:073') RETURNING id INTO rt3;
        END IF;
      ELSIF k IN (26, 27) THEN
        IF k = 26 THEN
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt1, 4, lc, 'ANODOS', a15, a16, 'test:073'), (rt1, 5, hub, 'ANODOS', a17, a18, 'test:073');
          PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                    'target', tgt1, 'stops', st1), 'test:073', 'owner');
        ELSE
          r := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk3),
                 'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'location_id', lc, 'side', 'ANODOS',
                                                               'planned_from', a15, 'planned_to', a16),
                                            jsonb_build_object('ref', 'h', 'location_id', hub, 'side', 'ANODOS',
                                                               'planned_from', a17, 'planned_to', a18))), 'test:073', 'owner');
          rt3 := (r->>'rt_id')::bigint;
          PERFORM plan_h_finish();
          SET CONSTRAINTS ALL DEFERRED;
        END IF;
      ELSIF k = 30 THEN
        -- a stock lot (057): an international intake at C (33 pallets, delivered) and a national piece of it, 10 pallets
        INSERT INTO orders (legacy_id, order_type, direction, status, client_id, price, loading_datetime, delivery_datetime,
                            unloading_location_1_id, loading_pallets_1, reference)
        VALUES ('rec073TO2', 'International', 'Import', 'Delivered', cl1, 900, td - 9, td - 6, lc, 33, 'WN073-TEST') RETURNING id INTO q;
        INSERT INTO stock_lots (legacy_id, order_id) VALUES ('rec073TL1', q) RETURNING id INTO z;
        INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, stock_lot_id, pickup_location_1_id)
        VALUES ('rec073TN2', cl1, 'WN073-TEST', NULL, 10, z, lc) RETURNING id INTO x;   -- no price: 057 stock_piece_no_money
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by)
        VALUES (x, lc, lb, 10, ((td - 3) + time '06:00') AT TIME ZONE 'Europe/Athens', ((td - 3) + time '08:00') AT TIME ZONE 'Europe/Athens',
                ((td - 2) + time '12:00') AT TIME ZONE 'Europe/Athens', ((td - 2) + time '14:00') AT TIME ZONE 'Europe/Athens', 'test:073')
        RETURNING id INTO y;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (y, 10, 'test:073') RETURNING id INTO z;
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        SELECT delivered::text || '/' || on_truck::text INTO t1 FROM stock_v_pieces WHERE piece_kind = 'natl' AND piece_id = x;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', z)),
               'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk3), 'side', 'KATHODOS'),
               'stops', jsonb_build_array(
                 jsonb_build_object('ref', 'c', 'location_id', lc, 'side', 'KATHODOS',
                   'planned_from', ((td - 3) + time '06:00') AT TIME ZONE 'Europe/Athens', 'planned_to', ((td - 3) + time '08:00') AT TIME ZONE 'Europe/Athens'),
                 jsonb_build_object('ref', 'b', 'location_id', lb, 'side', 'KATHODOS',
                   'planned_from', ((td - 2) + time '12:00') AT TIME ZONE 'Europe/Athens', 'planned_to', ((td - 2) + time '14:00') AT TIME ZONE 'Europe/Athens'))),
               'test:073', 'owner');
      ELSIF k = 31 THEN
        INSERT INTO maint_history (truck_id, service_date, cost) VALUES (trk1, td - 10, 1000);
        INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, date_start, date_end, status, source, created_by, total_km)
        VALUES ('RT-T073W', 'INTL', 'OWNED', trk1, td - 5, td - 4, 'closed', 'planner', 'test:073', 100) RETURNING id INTO rt3;
      ELSIF k IN (33, 34) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        IF k = 33 THEN
          -- Q9-1: the user corrects taken (8 of 10 came back) before confirming, as PATCH /pallets/movements does
          UPDATE pl_movements SET taken = 8 WHERE piece_leg_id = x AND event_type = 'DELIVERY';
          r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day')),
                              'test:073', 'dispatcher');
        ELSE
          -- today's model: a National load of the same national order (its "home"), on a trip of today's model
          INSERT INTO national_loads (legacy_id, source_type, source_national_order_id, pickup_location_1_id, delivery_location_1_id,
                                      loading_datetime, delivery_datetime, status)
          VALUES ('rec073TNL2', 'National', n1, la, lb, d, d, 'Pending') RETURNING id INTO q;
          INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, date_start, date_end, status, source, created_by)
          VALUES ('RT-T073H', 'INTL', 'OWNED', trk3, d, d, 'planned', 'planner', 'test:073') RETURNING id INTO rt3;
          INSERT INTO ct_rt_legs (rt_id, nat_load_id, direction, seq) VALUES (rt3, q, 'KATHODOS', 1);
        END IF;
      ELSIF k IN (35, 36) THEN
        -- written past the plan_* (their input rule refuses NaN / infinity first), so only the feeder's own rule
        -- stands between it and the ledger; the rows of an earlier sync must stay as they were
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        SELECT count(*), md5(string_agg(to_jsonb(pm)::text, '|' ORDER BY pm.id)) INTO n, t1 FROM pl_movements pm WHERE pm.piece_leg_id = x;
        SET CONSTRAINTS ALL DEFERRED;   -- plan_h_finish made them IMMEDIATE; 071's rules wait for the end of the case
        IF k = 35 THEN
          UPDATE shipment_pieces SET pallets = 'NaN' WHERE id = p1;
        ELSE
          UPDATE rt_stops SET planned_to = 'infinity' WHERE id = s1b;
        END IF;
        BEGIN
          PERFORM plan_h_pallet_sync(ARRAY[x], 'test:073', 'owner');
          msg := 'no error';
        EXCEPTION WHEN others THEN
          GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, hint = PG_EXCEPTION_HINT;
          msg := coalesce(hint, '') || ' ' || msg;
        END;
        -- back as it was, so the verdict reads the feeder alone: 071's COMMIT rules refuse the same rows too
        -- (pieces_sum for the NaN piece, rt_window for the endless stop), one layer lower
        IF k = 35 THEN UPDATE shipment_pieces SET pallets = 10 WHERE id = p1; ELSE UPDATE rt_stops SET planned_to = a14 WHERE id = s1b; END IF;
      ELSIF k = 37 THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        -- the user's sides, before confirming (PATCH /pallets/movements): we gave back 3 at loading, got back 7 at delivery
        UPDATE pl_movements SET given = 3 WHERE piece_leg_id = x AND event_type = 'LOADING';
        UPDATE pl_movements SET taken = 7 WHERE piece_leg_id = x AND event_type = 'DELIVERY';
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments',
               jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 8))), 'test:073', 'dispatcher');
      ELSIF k = 38 THEN
        -- p1 to Veroia on R1 (LOADING 10 at A), split 6 + 4 there, the 6 on R2 to B; the 4 stay in stock
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1, 'to_hub', true)),
               'target', tgt1, 'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a),
                                                          jsonb_build_object('ref', 'h', 'stop_id', s1h))), 'test:073', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || jsonb_build_object('piece_id', p1, 'parts', '[{"pallets": 6}, {"pallets": 4}]'::jsonb), 'test:073', 'owner');
        y := (SELECT id FROM shipment_pieces WHERE parent_piece_id = p1 AND pallets = 6 AND deleted_at IS NULL);
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', y)),
               'target', tgt2, 'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h),
                                                          jsonb_build_object('ref', 'b', 'stop_id', s2b))), 'test:073', 'owner');
        q := (r->'ids'->'leg_ids'->>0)::bigint;
        -- 10 -> 8: the 2 come off the stock (plan_h_resize), the parent's own row keeps 10
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments',
               jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 8))), 'test:073', 'dispatcher');
      ELSIF k IN (39, 40) THEN
        r := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pa, 'partner_rate', 300),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'location_id', lc, 'side', 'ANODOS',
                                                             'planned_from', a15, 'planned_to', a16))), 'test:073', 'owner');
        rt3 := (r->>'rt_id')::bigint;
        PERFORM plan_h_finish();
        SET CONSTRAINTS ALL DEFERRED;
        -- a handover inside the cycle to a second partner (072b): rate 200, or none (40)
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt3, 'at', a15 + interval '30 minutes',
                  'place_note', 'TEST 073', 'reason', 'planned_truck',
                  'vehicle', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pb)
                             || CASE WHEN k = 39 THEN '{"partner_rate": 200}'::jsonb ELSE '{}'::jsonb END), 'test:073', 'dispatcher');
        SET CONSTRAINTS ALL DEFERRED;
        SELECT partner_planned::text || '/' || lines_net::text INTO t1 FROM ct_v_rt_costs WHERE rt_id = rt3;
        n := (SELECT CASE WHEN partner_rate_missing THEN 1 ELSE 0 END FROM ct_v_rt_pnl WHERE id = rt3);
        -- the first partner's invoice: 280, naming it
        INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, pay_source, line_date, created_by, partner_id)
        VALUES (rt3, 'partner_rate', 280, 0, 'allocated', 'CREDIT', d, 'test:073', pa);
        m := (SELECT CASE WHEN partner_rate_missing THEN 1 ELSE 0 END FROM ct_v_rt_pnl WHERE id = rt3);
        SELECT lines_net INTO q FROM ct_v_rt_costs WHERE rt_id = rt3;
        IF k = 40 THEN
          -- then the second partner's own invoice (150), and a line that names nobody on a two-partner cycle (50)
          INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, pay_source, line_date, created_by, partner_id)
          VALUES (rt3, 'partner_rate', 150, 0, 'allocated', 'CREDIT', d, 'test:073', pb),
                 (rt3, 'partner_rate', 50, 0, 'allocated', 'CREDIT', d, 'test:073', NULL);
        END IF;
      ELSIF k = 41 THEN
        -- an Export with its Greek leg as a child order (034: leg 2, no direction of its own, the parent's VS switch)
        INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                            cross_dock_date, reference, client_id, price)
        VALUES ('rec073TO3', 'International', 'Export', 'Pending', true, d, d + 4, e, 'WN073-TEST', cl2, 3000) RETURNING id INTO q;
        INSERT INTO orders (legacy_id, order_type, status, loading_datetime, delivery_datetime, cross_dock_date, reference,
                            client_id, parent_order_id, leg_no)
        VALUES ('rec073TO4', 'International', 'Pending', d, d + 4, e, 'WN073-TEST', cl2, q, 2) RETURNING id INTO vso;
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
        VALUES ('rec073TS4', 'Loading', 1, d, vso, la, 10) RETURNING id INTO vs_b;
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:073') RETURNING id INTO y;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (y, 10, 'test:073');
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
      -- @case (each task adds its "ELSIF k = <n> THEN" branches above this line)
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;

      -- Verdicts (only reached when nothing refused).
      IF want[k] <> 'ok' THEN
        verdict := 'FAIL no error';
      ELSIF k = 1 THEN
        verdict := CASE WHEN (SELECT count(*) FROM pl_movements WHERE piece_leg_id = x) = 2
                          AND EXISTS (SELECT 1 FROM pl_movements WHERE piece_leg_id = x AND event_type = 'LOADING' AND status = 'pending'
                                        AND taken = 10 AND given = 0 AND location_id = la AND movement_date = d AND client_id = cl1
                                        AND counterparty_type = 'CLIENT' AND order_id IS NULL AND order_stop_id IS NULL
                                        AND created_by = 'test:073')
                          AND EXISTS (SELECT 1 FROM pl_movements WHERE piece_leg_id = x AND event_type = 'DELIVERY' AND status = 'pending'
                                        AND taken = 10 AND given = 10 AND location_id = lb AND movement_date = d AND client_id = cl1)
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'pl_movements' AND actor = 'test:073' AND action = 'create') = 2
                        THEN 'ok LOADING 10/0 at A and DELIVERY 10/10 at B, pending, one audit row each'
                        ELSE 'FAIL feeder: ' || coalesce((SELECT string_agg(to_jsonb(pm)::text, ' ') FROM pl_movements pm WHERE pm.piece_leg_id = x), 'none') END;
      ELSIF k = 2 THEN
        verdict := CASE WHEN x IS NOT NULL AND (SELECT count(*) FROM pl_movements WHERE piece_leg_id = x) = 0
                        THEN 'ok no pallet row without pallet exchange' ELSE 'FAIL no-exchange rows' END;
      ELSIF k = 3 THEN
        verdict := CASE WHEN (SELECT count(*) FROM pl_movements WHERE piece_leg_id = x) = 1
                          AND EXISTS (SELECT 1 FROM pl_movements WHERE piece_leg_id = x AND event_type = 'LOADING' AND taken = 10 AND location_id = la)
                          AND (SELECT count(*) FROM pl_movements WHERE piece_leg_id = q) = 1
                          AND EXISTS (SELECT 1 FROM pl_movements WHERE piece_leg_id = q AND event_type = 'DELIVERY' AND taken = 6 AND given = 6 AND location_id = lb)
                          AND NOT EXISTS (SELECT 1 FROM pl_movements WHERE piece_leg_id IS NOT NULL AND location_id = hub)
                        THEN 'ok LOADING 10 at A, DELIVERY 6 at B, nothing at Veroia, nothing for the 4 in stock'
                        ELSE 'FAIL hub feeder' END;
      ELSIF k = 4 THEN
        verdict := CASE WHEN (SELECT count(*) FROM pl_movements WHERE piece_leg_id = x AND status = 'reversed' AND reason LIKE '%(test:073)') = 2
                          AND (SELECT count(*) FROM pl_movements WHERE piece_leg_id = y AND status = 'pending') = 2
                          AND (SELECT count(*) FROM pl_movements) = n + 2
                          AND (r->'ids'->'cancelled_rt_ids') = '[]'::jsonb
                        THEN 'ok old rows reversed with the reason, two new pending rows, nothing deleted'
                        ELSE 'FAIL move pending: ' || r::text END;
      ELSIF k = 5 THEN
        verdict := CASE WHEN (r->>'needs_confirm')::boolean
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'pallets_confirmed', 'pl_movement_id', q,
                                                                     'event_type', 'LOADING', 'taken', 10, 'given', 9))
                          AND (SELECT status FROM pl_movements WHERE id = q) = 'reversed'
                          AND EXISTS (SELECT 1 FROM pl_movements WHERE piece_leg_id = y AND event_type = 'LOADING' AND status = 'pending')
                        THEN 'ok the confirmed LOADING listed, withdrawn after the token, the new leg writes a pending one'
                        ELSE 'FAIL move confirmed: ' || r::text END;
      ELSIF k = 7 THEN
        verdict := CASE WHEN (SELECT movement_date FROM pl_movements WHERE piece_leg_id = x AND event_type = 'DELIVERY' AND status = 'pending') = e
                          AND (SELECT movement_date FROM pl_movements WHERE id = q AND status = 'confirmed') = d
                        THEN 'ok the pending DELIVERY moved to D+1, the confirmed LOADING kept D'
                        ELSE 'FAIL rt_update dates' END;
      ELSIF k = 8 THEN
        verdict := CASE WHEN (SELECT status FROM pl_movements WHERE piece_leg_id = x AND event_type = 'DELIVERY') = 'reversed'
                          AND (SELECT status FROM pl_movements WHERE id = q) = 'confirmed'
                        THEN 'ok exchange off: pending DELIVERY withdrawn, confirmed LOADING kept' ELSE 'FAIL exchange off' END;
      ELSIF k = 9 THEN
        verdict := CASE WHEN (SELECT taken FROM pl_movements WHERE piece_leg_id = x AND event_type = 'LOADING' AND status = 'pending') = 8
                          AND (SELECT taken = 8 AND given = 8 FROM pl_movements WHERE piece_leg_id = x AND event_type = 'DELIVERY' AND status = 'pending')
                        THEN 'ok both pending rows follow 8 pallets' ELSE 'FAIL fewer pallets' END;
      ELSIF k = 11 THEN
        verdict := CASE WHEN (SELECT status FROM ct_round_trips WHERE id = rt1) = 'cancelled'
                          AND (SELECT count(*) FROM pl_movements WHERE piece_leg_id = x AND status = 'reversed') = 2
                          AND (SELECT count(*) FROM pl_movements) = n
                          AND NOT (r->'consequences' @> '[{"kind": "pallets_confirmed"}]')
                        THEN 'ok deleted: pending rows withdrawn, the ledger keeps its rows'
                        ELSE 'FAIL delete pallets: ' || r::text END;
      ELSIF k = 12 THEN
        verdict := CASE WHEN x IS NOT NULL AND (SELECT count(*) FROM pl_movements WHERE piece_leg_id = x) = 0
                        THEN 'ok a VS bridge writes no v5 pallet row' ELSE 'FAIL bridge feeder' END;
      ELSIF k = 14 THEN
        verdict := CASE WHEN (SELECT count(*) FROM pl_movements WHERE order_stop_id = vs_b) = 2
                        THEN 'ok a reversal and its replacement on one stop' ELSE 'FAIL reversal pair' END;
      ELSIF k = 16 THEN
        verdict := CASE WHEN (SELECT count(*) = 1 AND sum(amount) = 400 AND min(rt_id) = rt1 AND min(kind) = 'price'
                                FROM ct_v_v5_revenue WHERE nat_order_id = n1)
                          AND (SELECT revenue = 400 AND revenue_natl = 400 AND revenue_intl = 0 FROM ct_v_rt_revenue WHERE rt_id = rt1)
                          AND (SELECT revenue FROM ct_v_rt_pnl WHERE id = rt1) = 400
                        THEN 'ok 400 in revenue_natl of R1, in the P&L too' ELSE 'FAIL revenue one order' END;
      ELSIF k = 17 THEN
        verdict := CASE WHEN (SELECT revenue_natl FROM ct_v_rt_revenue WHERE rt_id = rt1) = 600
                          AND jsonb_array_length(r->'ids'->'nat_order_ids') = 3
                        THEN 'ok 100 + 200 + 300 on R1' ELSE 'FAIL groupage revenue' END;
      ELSIF k = 18 THEN   -- M-1 gamma: each leaf's share split equally over the legs that carried it
        verdict := CASE WHEN (SELECT revenue_natl FROM ct_v_rt_revenue WHERE rt_id = rt1) = 280
                          AND (SELECT revenue_natl FROM ct_v_rt_revenue WHERE rt_id = rt2) = 120
                          AND (SELECT sum(amount) FROM ct_v_v5_revenue WHERE nat_order_id = n1) = 400
                        THEN 'ok M-1 gamma: R1 120 + 160 = 280, R2 120'
                        ELSE 'FAIL split revenue: ' || coalesce((SELECT string_agg(to_jsonb(v)::text, ' ') FROM ct_v_v5_revenue v WHERE nat_order_id = n1), 'none') END;
      ELSIF k = 19 THEN
        verdict := CASE WHEN (SELECT string_agg(coalesce(rt_id::text, '-') || ':' || round(amount, 2)::text, ',' ORDER BY rt_id NULLS LAST)
                                FROM ct_v_v5_revenue WHERE order_id = vso AND kind = 'x')
                             = rt2 || ':' || round(xim * 20 / 33, 2) || ',-:' || (xim - round(xim * 20 / 33, 2))
                          AND (SELECT round(revenue_natl, 2) FROM ct_v_rt_revenue WHERE rt_id = rt2) = round(xim * 20 / 33, 2)
                        THEN 'ok X per pallet: 20/33 to R2, 13/33 waiting'
                        ELSE 'FAIL X share: ' || coalesce((SELECT string_agg(to_jsonb(v)::text, ' ') FROM ct_v_v5_revenue v WHERE order_id = vso), 'none') END;
      ELSIF k = 20 THEN   -- M-2 alpha: the international keeps today's charge, the whole X
        verdict := CASE WHEN (SELECT revenue_intl FROM ct_v_rt_revenue WHERE rt_id = rt3) = 3000 - xim
                        THEN 'ok M-2 alpha: the international loses the whole X from registration'
                        ELSE 'FAIL intl X: ' || coalesce((SELECT to_jsonb(v)::text FROM ct_v_rt_revenue v WHERE rt_id = rt3), 'none') END;
      ELSIF k = 21 THEN
        verdict := CASE WHEN (SELECT string_agg(amount::text, ',' ORDER BY piece_id) FROM ct_v_v5_revenue WHERE nat_order_id = x) = '33.33,33.34,33.33'
                          AND (SELECT sum(amount) FROM ct_v_v5_revenue WHERE nat_order_id = x) = 100
                        THEN 'ok M-3 draft: 33.33 + 33.34 + 33.33 = 100.00' ELSE 'FAIL rounding' END;
      ELSIF k = 22 THEN
        verdict := CASE WHEN (SELECT count(*) = 1 AND bool_and(rt_id IS NULL) AND sum(amount) = 400 FROM ct_v_v5_revenue WHERE nat_order_id = n1)
                          AND (SELECT revenue FROM ct_v_rt_revenue WHERE rt_id = rt1) = 0
                        THEN 'ok waiting: 400 with no cycle, R1 earns 0' ELSE 'FAIL waiting revenue' END;
      ELSIF k = 23 THEN
        verdict := CASE WHEN (SELECT revenue_natl FROM ct_v_rt_revenue WHERE rt_id = rt3) = 0
                        THEN 'ok no X through the Direct NL of a VS with a bridge' ELSE 'FAIL double X' END;
      ELSIF k = 24 THEN
        n := (SELECT CASE WHEN partner_rate_missing THEN 1 ELSE 0 END FROM ct_v_rt_pnl WHERE id = rt3);
        -- 072b: the rate is the segment's; a direct UPDATE of the cycle's copy is refused at COMMIT (seg_copy)
        PERFORM plan_rt_update(jsonb_build_object('rt_id', rt3, 'set', '{"partner_rate": null}'::jsonb), 'test:073', 'owner');
        SET CONSTRAINTS ALL DEFERRED;
        m := (SELECT CASE WHEN partner_rate_missing THEN 1 ELSE 0 END FROM ct_v_rt_pnl WHERE id = rt3);
        INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, pay_source, line_date, created_by)
        VALUES (rt3, 'partner_rate', 280, 0, 'allocated', 'CREDIT', d, 'test:073');
        verdict := CASE WHEN q = 300 AND n = 0 AND m = 1
                          AND (SELECT NOT partner_rate_missing AND partner_invoiced = 280 FROM ct_v_rt_pnl WHERE id = rt3)
                        THEN 'ok rate 300 planned; empty = pending; invoiced = not pending'
                        ELSE 'FAIL partner rate: ' || coalesce(q::text, 'null') || '/' || n || '/' || m END;
      ELSIF k = 25 THEN
        verdict := CASE WHEN (SELECT partner_rate_missing FROM ct_v_rt_pnl WHERE id = rt3) = false
                        THEN 'ok today''s partner trips are never flagged' ELSE 'FAIL v1 partner flag' END;
      ELSIF k = 26 THEN
        verdict := CASE WHEN (SELECT jsonb_array_length(route_legs) FROM dl_v_rt_route WHERE rt_id = rt1) = 2
                          AND (SELECT route_legs->0 @> jsonb_build_object('dir', 'KATHODOS', 'load', d, 'deliv', d, 'extra_stops', 1,
                                        'from', jsonb_build_object('name', 'TEST 073 A'), 'to', jsonb_build_object('name', 'TEST 073 B'))
                                 AND route_legs->1 @> jsonb_build_object('dir', 'ANODOS', 'extra_stops', 0,
                                        'from', jsonb_build_object('name', 'TEST 073 C'), 'to', jsonb_build_object('name', 'CROSS-DOCK'))
                                 FROM dl_v_rt_route WHERE rt_id = rt1)
                          AND (SELECT route_text FROM dl_v_rt_route WHERE rt_id = rt1)
                              = 'TEST 073 A' || U&' \2192 ' || 'TEST 073 B' || U&' \00B7 ' || 'TEST 073 C' || U&' \2192 ' || 'CROSS-DOCK'
                        THEN 'ok KATHODOS A->B (+1) then ANODOS C->Veroia'
                        ELSE 'FAIL route: ' || coalesce((SELECT to_jsonb(v)::text FROM dl_v_rt_route v WHERE rt_id = rt1), 'none') END;
      ELSIF k = 27 THEN
        verdict := CASE WHEN (SELECT jsonb_array_length(route_legs) = 1 AND route_legs->0->>'dir' = 'ANODOS' FROM dl_v_rt_route WHERE rt_id = rt3)
                        THEN 'ok one ANODOS block' ELSE 'FAIL anodos-only route' END;
      ELSIF k = 28 THEN
        verdict := CASE WHEN (SELECT status FROM ct_round_trips WHERE id = rt1) = 'cancelled'
                          AND NOT EXISTS (SELECT 1 FROM dl_v_rt_route WHERE rt_id = rt1)
                        THEN 'ok a cancelled cycle has no route' ELSE 'FAIL cancelled route' END;
      ELSIF k = 29 THEN
        verdict := CASE WHEN n = 1 AND m = 0 AND t1 = '0/false'
                          AND (SELECT legs_needing_sheet = 1 AND legs_with_sheet = 1 AND sheets_ok FROM ct_v_rt_pallet_gate WHERE rt_id = rt1)
                        THEN 'ok 1 leg needs a sheet; LOADING alone is not it, LOADING + DELIVERY confirmed is'
                        ELSE 'FAIL v5 gate: ' || n || '/' || m || ' ' || coalesce(t1, 'null') END;
      ELSIF k = 30 THEN
        verdict := CASE WHEN t1 = 'false/false'
                          AND (SELECT delivered AND on_truck AND delivered_on = td - 2 FROM stock_v_pieces WHERE piece_kind = 'natl' AND piece_id = x)
                        THEN 'ok before: not delivered, not on a truck; after the leg of D-2: delivered on D-2, on a truck'
                        ELSE 'FAIL stock natl: ' || coalesce(t1, 'null') || ' ' || coalesce((SELECT to_jsonb(v)::text FROM stock_v_pieces v WHERE piece_kind = 'natl' AND piece_id = x), 'none') END;
      ELSIF k = 31 THEN
        verdict := CASE WHEN (SELECT eur_per_km FROM ct_v_wear_rate WHERE truck_id = trk1) = 10
                          AND (SELECT wear FROM ct_v_rt_costs WHERE rt_id = rt1) = 0
                        THEN 'ok 1000 / 100 km = 10 per km (the v5 cycle without km adds nothing); its wear is 0'
                        ELSE 'FAIL wear' END;
      ELSIF k = 32 THEN
        verdict := CASE WHEN r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'pallets_confirmed', 'taken', 10, 'given', 9))
                          AND strpos(r::text, '"amount"') = 0
                        THEN 'ok the dispatcher sees the confirmed pallet row, no amount' ELSE 'FAIL dispatcher list: ' || r::text END;
      ELSIF k = 33 THEN
        verdict := CASE WHEN (SELECT movement_date = e AND taken = 8 AND given = 10 FROM pl_movements
                               WHERE piece_leg_id = x AND event_type = 'DELIVERY' AND status = 'pending')
                          AND (SELECT movement_date = e AND taken = 10 AND given = 0 FROM pl_movements
                               WHERE piece_leg_id = x AND event_type = 'LOADING' AND status = 'pending')
                        THEN 'ok the row moved to D+1 and kept the user''s taken 8 (the plan never undoes a correction)'
                        ELSE 'FAIL taken overwritten: ' || coalesce((SELECT string_agg(to_jsonb(pm)::text, ' ') FROM pl_movements pm WHERE pm.piece_leg_id = x), 'none') END;
      ELSIF k = 34 THEN
        verdict := CASE WHEN (SELECT revenue_natl FROM ct_v_rt_revenue WHERE rt_id = rt3) = 0
                          AND (SELECT revenue_natl FROM ct_v_rt_revenue WHERE rt_id = rt1) = 400
                        THEN 'ok the price once: 400 on the v5 cycle, 0 through the old home NL'
                        ELSE 'FAIL price twice: ' || coalesce((SELECT string_agg(to_jsonb(v)::text, ' ') FROM ct_v_rt_revenue v WHERE rt_id IN (rt1, rt3)), 'none') END;
      ELSIF k IN (35, 36) THEN
        verdict := CASE WHEN msg LIKE 'plan:bad_input %' || CASE k WHEN 35 THEN 'piece:' || p1 ELSE 'leg:' || x END || ':finite%'
                          AND (SELECT count(*) = n AND md5(string_agg(to_jsonb(pm)::text, '|' ORDER BY pm.id)) = t1
                                 FROM pl_movements pm WHERE pm.piece_leg_id = x)
                          AND n = 2
                        THEN 'ok refused by name, the two pending rows unchanged'
                        ELSE 'FAIL finite: ' || coalesce(msg, 'null') END;
      ELSIF k = 37 THEN
        verdict := CASE WHEN (SELECT taken = 8 AND given = 3 FROM pl_movements WHERE piece_leg_id = x AND event_type = 'LOADING' AND status = 'pending')
                          AND (SELECT taken = 7 AND given = 8 FROM pl_movements WHERE piece_leg_id = x AND event_type = 'DELIVERY' AND status = 'pending')
                        THEN 'ok LOADING 8 loaded / the user''s 3; DELIVERY 8 delivered / the user''s 7'
                        ELSE 'FAIL Q9-1: ' || coalesce((SELECT string_agg(to_jsonb(pm)::text, ' ') FROM pl_movements pm WHERE pm.piece_leg_id = x), 'none') END;
      ELSIF k = 38 THEN
        verdict := CASE WHEN (SELECT count(*) = 1 AND min(taken) = 8 AND min(given) = 0 FROM pl_movements
                               WHERE piece_leg_id = x AND event_type = 'LOADING' AND status = 'pending')
                          AND (SELECT taken = 6 AND given = 6 FROM pl_movements WHERE piece_leg_id = q AND event_type = 'DELIVERY' AND status = 'pending')
                          AND (SELECT sum(pallets) FROM v_piece_state WHERE shipment_id = sh1) = 8
                        THEN 'ok the parent''s LOADING 10 -> 8 with its leaves, the 6 delivered as before'
                        ELSE 'FAIL split parent: ' || coalesce((SELECT string_agg(to_jsonb(pm)::text, ' ') FROM pl_movements pm WHERE pm.piece_leg_id IN (x, q)), 'none') END;
      ELSIF k = 39 THEN
        verdict := CASE WHEN t1 = '500.00/500.00' AND n = 0 AND m = 0 AND q = 480
                          AND (SELECT partner_planned = 500 AND partner_invoiced = 280 FROM ct_v_rt_costs WHERE rt_id = rt3)
                          AND (SELECT count(*) = 2 AND NOT bool_or(unmatched) FROM ct_v_rt_partner_cost WHERE rt_id = rt3)
                        THEN 'ok 300 + 200 planned; the first partner''s 280 replaces its 300 only: 480'
                        ELSE 'FAIL two partners: ' || coalesce(t1, 'null') || ' ' || n || '/' || m || ' ' || coalesce(q::text, 'null') END;
      ELSIF k = 40 THEN
        verdict := CASE WHEN t1 = '300.00/300.00' AND n = 1 AND m = 1 AND q = 280
                          AND (SELECT NOT partner_rate_missing FROM ct_v_rt_pnl WHERE id = rt3)
                          AND (SELECT lines_net = 480 AND partner_planned = 300 AND partner_invoiced = 480 FROM ct_v_rt_costs WHERE rt_id = rt3)
                          AND (SELECT count(*) = 1 FROM ct_v_rt_partner_cost WHERE rt_id = rt3 AND unmatched AND partner_id IS NULL AND cost = 50)
                        THEN 'ok missing until the second partner invoices (the first one''s invoice does not cover it); 280 + 150 + 50 unnamed = 480'
                        ELSE 'FAIL one rate missing: ' || coalesce(t1, 'null') || ' ' || n || '/' || m || ' ' || coalesce(q::text, 'null') || ' '
                             || coalesce((SELECT string_agg(to_jsonb(v)::text, ' ') FROM ct_v_rt_partner_cost v WHERE rt_id = rt3), 'none') END;
      ELSIF k = 41 THEN
        verdict := CASE WHEN (SELECT count(*) = 1 AND min(total) = ct_setting('x_export') AND sum(amount) = ct_setting('x_export')
                                FROM ct_v_v5_revenue WHERE order_id = vso AND kind = 'x')
                        THEN 'ok the X of the child order is the parent''s Export X'
                        ELSE 'FAIL child X: ' || coalesce((SELECT string_agg(to_jsonb(v)::text, ' ') FROM ct_v_v5_revenue v WHERE order_id = vso), 'none') END;
      -- @verdict (each task adds its "ELSIF k = <n> THEN verdict := ..." branches above this line)
      END IF;
      RAISE EXCEPTION 'wn073 undo' USING HINT = 'wn073_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn073_undo' THEN coalesce(verdict, 'FAIL no verdict')
                  WHEN hint LIKE 'plan:%' THEN hint
                  WHEN coalesce(cname, '') <> '' THEN 'con:' || cname
                  ELSE 'state:' || st END;
      IF (want[k] = 'ok' AND got LIKE 'ok%') OR got = want[k] THEN
        ok := ok + 1; res := res || k::text;
      ELSE
        bad := bad + 1; res := res || (k || ' FAIL want ' || want[k] || ' got ' || got || ' (' || msg || ')');
      END IF;
    END;
  END LOOP;
  RAISE EXCEPTION 'RULES TEST 073 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$t073$;
