-- RULES TEST 072 (national v5 plan_* functions): every case on TEST rows, then undone.
-- Runs AFTER 072 said "072 OK". At build time it runs on the PGlite copy (tms-auditor/test/plan-072.test.mjs). On
-- production it is OPTIONAL, after 15:00, with an explicit yes: it writes TEST rows (locations, clients, partners,
-- trucks, drivers, national orders, one VS import order with its stops, v5 cycles, payroll lines, cost lines, local
-- moves, notices, audit rows) and undoes ALL of them with a deliberate final error. Only trace: identity and code
-- sequences advance (RT-... numbers skip the ones used here).
-- ONE statement. The red error message IS the result:
--   "RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept. Result: <N> OK, 0 FAIL || ...".
-- Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Each case: build S (two OWNED v5 cycles: R1 truck 1 / driver 1 on day D with stops A 06-08, Veroia 09-10, B 12-14;
-- R2 truck 2 / driver 2 the same on D+1; national order N1 A->B 10 pallets with one shipment sh1 and one piece p1,
-- written directly, waiting at A), make the case's calls, read the verdict, undo (marker exception). want[k] = 'ok' (the
-- verdict must start with ok), 'plan:<code>' (the HINT), 'con:<constraint>' or 'state:<SQLSTATE>'.
-- One want line per case, in the case's order: the plan's tasks append lines above "-- @want" and branches above
-- "-- @case" and "-- @verdict".
-- ASCII only. Test ids: legacy_id rec072T..., reference WN072-TEST, names "TEST 072 ...", plates TEST-072-..., actor
-- test:072, day D = Athens today + 40.
DO $t072$
DECLARE
  td date; d date; e date; k int;
  hub bigint; la bigint; lb bigint; lc bigint; ld bigint; le bigint;
  cl1 bigint; cl2 bigint; cl3 bigint; pa bigint; trk1 bigint; trk2 bigint; drv1 bigint; drv2 bigint; drvl bigint;
  nold bigint; vso bigint; vs_ld bigint; vs_cd bigint; vs_b bigint; vs_d bigint; vs_e bigint;
  a05 timestamptz; a06 timestamptz; a08 timestamptz; a09 timestamptz; a10 timestamptz; a12 timestamptz;
  a13 timestamptz; a14 timestamptz; a15 timestamptz; a16 timestamptz;
  b06 timestamptz; b07 timestamptz; b08 timestamptz; b09 timestamptz; b10 timestamptz; b11 timestamptz;
  b12 timestamptz; b13 timestamptz; b14 timestamptz; b15 timestamptz; b16 timestamptz;
  rt1 bigint; rt2 bigint; rt3 bigint; s1a bigint; s1h bigint; s1b bigint; s2a bigint; s2h bigint; s2b bigint;
  n1 bigint; sh1 bigint; p1 bigint; jsh1 jsonb; jo1 jsonb;
  x bigint; y bigint; z bigint; q bigint; c1 bigint; c2 bigint; n int; m int; t1 text; t2 text;
  r jsonb; r2 jsonb; j jsonb; b1 boolean; b2 boolean;
  want text[] := ARRAY[
    NULL
    , 'ok'               -- 1 identity accepted, one audit row with the person and the role
    , 'plan:no_actor'    -- 2 empty actor
    , 'plan:no_actor'    -- 3 role outside the five
    , 'plan:bad_input'   -- 4 unknown key refused, never ignored
    , 'ok'               -- 5 token: stable, never hashes an amount (row versions); amounts stripped for the dispatcher only
    , 'plan:truck_busy'  -- 6 EXCLUDE 23P01 on the truck becomes truck_busy
    , 'plan:driver_busy' -- 7 EXCLUDE 23P01 on the driver becomes driver_busy
    , 'plan:rt_gone'     -- 8 target cycle does not exist
    , 'plan:rt_cancelled' -- 9 target cycle cancelled
    , 'plan:stop_gone'   -- 10 a stop of another cycle
    , 'plan:bad_input'   -- 11 target side not KATHODOS / ANODOS
    , 'ok'               -- 12 a new stop is created and the base renumbers seq by side and time
    , 'ok'               -- 13 an empty cycle is cancelled: payroll with amount deleted, 0 needs_review, notice for costs
    , 'ok'               -- 14 decision 10: the payroll line's month, never "paid" (even with a payment after the cycle)
    , 'ok'               -- 15 a cycle with a live leg is not cancelled
    , 'ok'               -- 16 groupage of 3 clients = 1 call, 3 orders, no mirror, facade id, audit by the person
    , 'ok'               -- 17 two shipments (Veroia as B): the summary fields follow the shipments
    , 'plan:no_price'    -- 18 price 0
    , 'plan:no_price'    -- 19 no price
    , 'plan:no_client'   -- 20 no client
    , 'plan:no_window'   -- 21 a window end missing
    , 'plan:stock_lot'   -- 22 a lot piece (057) does not enter here
    , 'plan:bad_input'   -- 23 no orders
    , 'plan:bad_input'   -- 24 an unknown key (a mirror field) is refused, never ignored
    , 'con:shipments_ends' -- 25 A = B
    , 'con:shipments_win' -- 26 delivery before loading
    , 'con:shipments_pallets' -- 27 0 pallets
    , 'plan:bad_input'   -- 28 a location that does not exist
    , 'plan:bad_input'   -- 29 stops without a target
    , 'ok'               -- 30 a whole piece onto a cycle: one leg, planned to B
    , 'ok'               -- 31 with a new stop: seq by the base, the window and the payroll day follow
    , 'plan:piece_busy'  -- 32 the same piece again
    , 'plan:piece_split' -- 33 a split piece
    , 'plan:not_stock'   -- 34 a part of a piece that is not stock
    , 'ok'               -- 35 split + put 8 of a 13 stock: 8 ride, 5 stay with the same leave_by
    , 'ok'               -- 36 VS onto a truck of another day: the international's day, an audit row, one intl notice
    , 'ok'               -- 37 VS stock (its other part already rides) onto a truck: the day does not move
    , 'ok'               -- 38 over 33 pallets: a warning, not a refusal
    , 'plan:chain'       -- 39 a pickup where the piece is not (071 at the end of the call)
    , 'plan:stop_order'  -- 40 an ANODOS stop earlier than a KATHODOS one (071 at the end of the call)
    , 'plan:leg_order'   -- 41 a pickup after the delivery (071 at the end of the call)
    , 'plan:truck_busy'  -- 42 the window grows onto another cycle of the same truck
    , 'plan:bad_input'   -- 43 no stop of the request where the piece is
    , 'plan:piece_dead'  -- 44 a piece that does not exist
    , 'ok'               -- 45 plan_orders_create with a target: the "+" in a row, one transaction
    , 'plan:parts_sum'   -- 46 more than the stock holds
    , 'ok'               -- 47 a VS of 3 deliveries onto a truck of D+1 = 1 call, 3 legs, the international's day follows
    , 'plan:group_empty' -- 48 nothing waiting in the group
    , 'plan:bad_input'   -- 49 a group with neither order_id nor nat_order_id
    , 'ok'               -- 50 a national order of 2 shipments as one card; no piece split
    -- @want (one line per case: "    , '<ok|plan:code|con:name|state:XXXXX>'  -- <k> <what>")
  ]::text[];
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  want := want[2:];   -- drop the leading NULL that keeps every want line in the same ", '...'" shape
  IF to_regprocedure('public.plan_h_raise(text,text)') IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 072: 072 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec072T%') OR EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec072T%')
     OR EXISTS (SELECT 1 FROM national_orders WHERE legacy_id LIKE 'rec072T%' OR reference = 'WN072-TEST')
     OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-072-%')
     OR EXISTS (SELECT 1 FROM drivers WHERE full_name LIKE 'TEST 072 %')
     OR EXISTS (SELECT 1 FROM clients WHERE company_name LIKE 'TEST 072 %')
     OR EXISTS (SELECT 1 FROM partners WHERE company_name LIKE 'TEST 072 %') THEN
    RAISE EXCEPTION 'RULES TEST 072: test ids (rec072T..., WN072-TEST, TEST 072 ..., TEST-072-...) already exist - stop';
  END IF;

  -- Fixture (undone by the final error).
  td := (now() AT TIME ZONE 'Europe/Athens')::date; d := td + 40; e := d + 1;
  a05 := (d + time '05:00') AT TIME ZONE 'Europe/Athens'; a06 := (d + time '06:00') AT TIME ZONE 'Europe/Athens';
  a08 := (d + time '08:00') AT TIME ZONE 'Europe/Athens'; a09 := (d + time '09:00') AT TIME ZONE 'Europe/Athens';
  a10 := (d + time '10:00') AT TIME ZONE 'Europe/Athens'; a12 := (d + time '12:00') AT TIME ZONE 'Europe/Athens';
  a13 := (d + time '13:00') AT TIME ZONE 'Europe/Athens'; a14 := (d + time '14:00') AT TIME ZONE 'Europe/Athens';
  a15 := (d + time '15:00') AT TIME ZONE 'Europe/Athens'; a16 := (d + time '16:00') AT TIME ZONE 'Europe/Athens';
  b06 := (e + time '06:00') AT TIME ZONE 'Europe/Athens'; b07 := (e + time '07:00') AT TIME ZONE 'Europe/Athens';
  b08 := (e + time '08:00') AT TIME ZONE 'Europe/Athens'; b09 := (e + time '09:00') AT TIME ZONE 'Europe/Athens';
  b10 := (e + time '10:00') AT TIME ZONE 'Europe/Athens'; b11 := (e + time '11:00') AT TIME ZONE 'Europe/Athens';
  b12 := (e + time '12:00') AT TIME ZONE 'Europe/Athens'; b13 := (e + time '13:00') AT TIME ZONE 'Europe/Athens';
  b14 := (e + time '14:00') AT TIME ZONE 'Europe/Athens'; b15 := (e + time '15:00') AT TIME ZONE 'Europe/Athens';
  b16 := (e + time '16:00') AT TIME ZONE 'Europe/Athens';
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072TA', 'TEST 072 A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072TB', 'TEST 072 B') RETURNING id INTO lb;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072TC', 'TEST 072 C') RETURNING id INTO lc;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072TD', 'TEST 072 D') RETURNING id INTO ld;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072TE', 'TEST 072 E') RETURNING id INTO le;
  INSERT INTO clients (company_name) VALUES ('TEST 072 client 1') RETURNING id INTO cl1;
  INSERT INTO clients (company_name) VALUES ('TEST 072 client 2') RETURNING id INTO cl2;
  INSERT INTO clients (company_name) VALUES ('TEST 072 client 3') RETURNING id INTO cl3;
  INSERT INTO partners (company_name) VALUES ('TEST 072 partner') RETURNING id INTO pa;
  INSERT INTO trucks (license_plate) VALUES ('TEST-072-1') RETURNING id INTO trk1;
  INSERT INTO trucks (license_plate) VALUES ('TEST-072-2') RETURNING id INTO trk2;
  INSERT INTO drivers (full_name) VALUES ('TEST 072 driver 1') RETURNING id INTO drv1;
  INSERT INTO drivers (full_name) VALUES ('TEST 072 driver 2') RETURNING id INTO drv2;
  INSERT INTO drivers (full_name) VALUES ('TEST 072 local') RETURNING id INTO drvl;
  -- a national order of today's model (no shipment): not v5
  INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec072TN0', cl1, 'WN072-TEST', 50) RETURNING id INTO nold;
  -- a VS import: loads abroad at C, Veroia day D, three Greek deliveries on D+1 (B 20, D 26, E 4 pallets)
  INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  VALUES ('rec072TO1', 'International', 'Import', 'Pending', true, d - 3, e, d, 'WN072-TEST', cl1) RETURNING id INTO vso;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072TS1', 'Loading', 1, d - 3, vso, lc, 50) RETURNING id INTO vs_ld;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072TS2', 'Cross-dock', 1, d, vso, hub, 50) RETURNING id INTO vs_cd;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072TS3', 'Unloading', 1, e, vso, lb, 20) RETURNING id INTO vs_b;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072TS4', 'Unloading', 2, e, vso, ld, 26) RETURNING id INTO vs_d;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072TS5', 'Unloading', 3, e, vso, le, 4) RETURNING id INTO vs_e;
  jsh1 := jsonb_build_object('origin_location_id', la, 'dest_location_id', lb, 'pallets', 10, 'load_from', a06,
                             'load_to', a08, 'deliver_from', a12, 'deliver_to', a14);
  jo1 := jsonb_build_object('client_id', cl1, 'price', 100, 'reference', 'WN072-TEST', 'goods', 'TEST',
                            'temperature_c', 2, 'shipments', jsonb_build_array(jsh1));

  FOR k IN 1..coalesce(array_length(want, 1), 0) LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      -- S
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk1, drv1, d, d, a06, a14, 'planned', 'planner', 'test:072') RETURNING id INTO rt1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 1, la, 'KATHODOS', a06, a08, 'test:072') RETURNING id INTO s1a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 2, hub, 'KATHODOS', a09, a10, 'test:072') RETURNING id INTO s1h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 3, lb, 'KATHODOS', a12, a14, 'test:072') RETURNING id INTO s1b;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk2, drv2, e, e, b06, b14, 'planned', 'planner', 'test:072') RETURNING id INTO rt2;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 1, la, 'KATHODOS', b06, b08, 'test:072') RETURNING id INTO s2a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 2, hub, 'KATHODOS', b09, b10, 'test:072') RETURNING id INTO s2h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 3, lb, 'KATHODOS', b12, b14, 'test:072') RETURNING id INTO s2b;
      INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, temperature_c)
      VALUES ('rec072TN1', cl1, 'WN072-TEST', 100, 10, 'TEST', 2) RETURNING id INTO n1;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      VALUES (n1, la, lb, 10, a06, a08, a12, a14, 'test:072') RETURNING id INTO sh1;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh1, 10, 'test:072') RETURNING id INTO p1;
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;

      IF k = 0 THEN
        NULL;
      ELSIF k = 1 THEN
        PERFORM plan_h_ctx('test:072', 'dispatcher');
        PERFORM plan_h_audit('test:072', 'dispatcher', 'update', 'ct_round_trips', rt1::text, '{"a":1}', '{"a":2}');
      ELSIF k = 2 THEN
        PERFORM plan_h_ctx('  ', 'owner');
      ELSIF k = 3 THEN
        PERFORM plan_h_ctx('test:072', 'boss');
      ELSIF k = 4 THEN
        PERFORM plan_h_keys('{"rt_id": 1, "truck_id": 2}', array['rt_id'], 'target');
      ELSIF k = 5 THEN
        j := jsonb_build_array(jsonb_build_object('kind', 'payroll_amount', 'dl_entry_id', 1, 'amount', 230),
                               jsonb_build_object('kind', 'costs', 'nested', jsonb_build_object('amount', 3, 'invoice_number', 'X', 'count', 2)));
        t1 := plan_h_token('plan_x', '1', j);
        t2 := plan_h_token('plan_x', '1', jsonb_set(j, '{0,amount}', '231'));
      ELSIF k IN (6, 7) THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', CASE WHEN k = 6 THEN trk1 ELSE trk2 END, CASE WHEN k = 6 THEN drv2 ELSE drv1 END,
                d, d, a13, a15, 'planned', 'planner', 'test:072') RETURNING id INTO rt3;
        PERFORM plan_h_finish();
      ELSIF k = 8 THEN
        PERFORM plan_h_target(jsonb_build_object('rt_id', -1, 'side', 'KATHODOS'), NULL, 'test:072', 'owner');
      ELSIF k = 9 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, partner_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'PARTNER', pa, d, d, a06, a14, 'cancelled', 'planner', 'test:072') RETURNING id INTO rt3;
        PERFORM plan_h_target(jsonb_build_object('rt_id', rt3, 'side', 'KATHODOS'), NULL, 'test:072', 'owner');
      ELSIF k = 10 THEN
        PERFORM plan_h_target(jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                              jsonb_build_array(jsonb_build_object('ref', 'x', 'stop_id', s2a)), 'test:072', 'owner');
      ELSIF k = 11 THEN
        PERFORM plan_h_target(jsonb_build_object('rt_id', rt1, 'side', 'NORTH'), NULL, 'test:072', 'owner');
      ELSIF k = 12 THEN
        r := plan_h_target(jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                           jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a),
                                             jsonb_build_object('ref', 'c', 'location_id', lc, 'planned_from', a10,
                                                                'planned_to', (d + time '11:00') AT TIME ZONE 'Europe/Athens')),
                           'test:072', 'owner');
        PERFORM plan_h_reseq(rt1, 'test:072', 'owner');
        x := (r->'stops'->>'c')::bigint;
      ELSIF k IN (13, 14) THEN
        UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt2 AND deleted_at IS NULL;
        INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, created_by, pay_source)
        VALUES (rt2, 'tolls', 10, 2.4, 'allocated', 'test:072', 'DKV');
        IF k = 14 THEN
          INSERT INTO dl_entries (driver_id, entry_type, entry_date, amount, source, created_by)
          VALUES (drv2, 'payment_bank', e + 5, 500, 'manual', 'test:072');
        END IF;
        j := plan_h_rt_consequences(rt2);
        IF k = 13 THEN b1 := plan_h_rt_cancel_if_empty(rt2, 'test cancel', 'test:072', 'owner'); END IF;
      ELSIF k = 15 THEN
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
        VALUES (p1, 1, rt1, s1a, s1b, 'test:072');
        b1 := plan_h_rt_cancel_if_empty(rt1, 'test cancel', 'test:072', 'owner');
      ELSIF k = 16 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1,
               jo1 || jsonb_build_object('client_id', cl2), jo1 || jsonb_build_object('client_id', cl3, 'price', 70)))),
               'test:072', 'dispatcher');
      ELSIF k = 17 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(
                 jsonb_build_object('origin_location_id', la, 'dest_location_id', hub, 'pallets', 4, 'load_from', a06,
                                    'load_to', a08, 'deliver_from', a09, 'deliver_to', a10),
                 jsonb_build_object('origin_location_id', lc, 'dest_location_id', lb, 'pallets', 6, 'load_from', b06,
                                    'load_to', b08, 'deliver_from', b12, 'deliver_to', b14)))))), 'test:072', 'owner');
        -- review A2 r1: the same two shipments in the other order prove the rule "in the shipments' order" (first
        -- origin C, last destination Veroia), not "the origin of the earliest load / the destination of the latest"
        r2 := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(
                 jsonb_build_object('origin_location_id', lc, 'dest_location_id', lb, 'pallets', 6, 'load_from', b06,
                                    'load_to', b08, 'deliver_from', b12, 'deliver_to', b14),
                 jsonb_build_object('origin_location_id', la, 'dest_location_id', hub, 'pallets', 4, 'load_from', a06,
                                    'load_to', a08, 'deliver_from', a09, 'deliver_to', a10)))))), 'test:072', 'owner');
      ELSIF k = 18 THEN
        -- review A2 r1: NaN sorts above every number in Postgres and Infinity passes "> 0": both are refused like 0
        FOREACH t1 IN ARRAY ARRAY['NaN', 'Infinity'] LOOP
          BEGIN
            PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('price', t1)))), 'test:072', 'owner');
            t2 := 'accepted';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT;
          END;
          IF t2 IS DISTINCT FROM 'plan:no_price' THEN
            RAISE EXCEPTION 'FAIL price % got %', t1, coalesce(t2, 'no hint');
          END IF;
        END LOOP;
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || '{"price": 0}'))), 'test:072', 'owner');
      ELSIF k = 19 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 - 'price'))), 'test:072', 'owner');
      ELSIF k = 20 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 - 'client_id'))), 'test:072', 'owner');
      ELSIF k = 21 THEN
        -- review A2 r2: 'infinity' / '-infinity' are valid timestamptz input and pass the 071 CHECK shipments_win;
        -- such an order would exist but fall out of every week / day read. Each end alone is refused as no_window.
        FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                   jsh1 || '{"load_from": "-infinity"}', jsh1 || '{"load_to": "infinity"}',
                   jsh1 || '{"deliver_from": "infinity"}', jsh1 || '{"deliver_to": "infinity"}')) LOOP
          BEGIN
            PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                      jsonb_build_array(j))))), 'test:072', 'owner');
            t2 := 'accepted';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT;
          END;
          IF t2 IS DISTINCT FROM 'plan:no_window' THEN
            RAISE EXCEPTION 'FAIL % got %', j::text, coalesce(t2, 'no hint');
          END IF;
        END LOOP;
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 - 'deliver_to'))))), 'test:072', 'owner');
      ELSIF k = 22 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || '{"stock_lot_id": 1}'))), 'test:072', 'owner');
      ELSIF k = 23 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || ('{"orders": []}'), 'test:072', 'owner');
      ELSIF k = 24 THEN
        -- review A2 r1: a non-finite number (NaN passes the 071 CHECK pallets > 0) or a text field that is not text
        -- is refused as bad_input, never written
        FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                   jsonb_build_object('temperature_c', 'NaN'), jsonb_build_object('temperature_c', '-Infinity'),
                   jsonb_build_object('reference', jsonb_build_object('x', 1)), jsonb_build_object('notes', jsonb_build_array(1)),
                   jsonb_build_object('goods', true),
                   jsonb_build_object('shipments', jsonb_build_array(jsh1 || '{"pallets": "NaN"}')),
                   jsonb_build_object('shipments', jsonb_build_array(jsh1 || '{"pallets": "Infinity"}')))) LOOP
          BEGIN
            PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || j))), 'test:072', 'owner');
            t2 := 'accepted';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT;
          END;
          IF t2 IS DISTINCT FROM 'plan:bad_input' THEN
            RAISE EXCEPTION 'FAIL % got %', j::text, coalesce(t2, 'no hint');
          END IF;
        END LOOP;
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('truck_id', trk1)))),
                                   'test:072', 'owner');
      ELSIF k = 25 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || jsonb_build_object('dest_location_id', la)))))), 'test:072', 'owner');
      ELSIF k = 26 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || jsonb_build_object('deliver_from', a05, 'deliver_to', a05)))))), 'test:072', 'owner');
      ELSIF k = 27 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || '{"pallets": 0}'))))), 'test:072', 'owner');
      ELSIF k = 28 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || '{"origin_location_id": -1}'))))), 'test:072', 'owner');
      ELSIF k = 29 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1), 'stops', '[]'::jsonb)), 'test:072', 'owner');
      ELSIF k IN (30, 32) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
               'test:072', 'owner');
        IF k = 32 THEN
          PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                    'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a), jsonb_build_object('ref', 'b', 'stop_id', s2b))),
                    'test:072', 'owner');
        END IF;
      ELSIF k = 31 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(jsh1 || jsonb_build_object('dest_location_id', lc, 'pallets', 5, 'deliver_to', a16)))))),
               'test:072', 'owner');
        x := (r->'ids'->'piece_ids'->>0)::bigint;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', x)),
               'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a),
                                          jsonb_build_object('ref', 'c', 'location_id', lc, 'planned_from', a15, 'planned_to', a16))),
               'test:072', 'owner');
        y := (SELECT drop_stop_id FROM piece_legs WHERE id = (r->'ids'->'leg_ids'->>0)::bigint);
      ELSIF k = 33 THEN
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1a, s1h, 'test:072');
        UPDATE shipment_pieces SET split_at = now(), split_by = 'test:072' WHERE id = p1;
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (sh1, p1, 4, 'test:072');
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (sh1, p1, 6, 'test:072');
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b))),
                  'test:072', 'owner');
      ELSIF k = 34 THEN
        -- coordinator 25/10 (cross-cutting input rule): a NaN part of a piece that is not stock is bad_input
        -- 'take_pallets:finite' (the size is refused before the stock test; case 46 proves the stock side)
        BEGIN
          msg := NULL;
          PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1, 'take_pallets', 'NaN')),
                    'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                    'test:072', 'owner');
          t2 := 'accepted';
        EXCEPTION WHEN others THEN
          GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
        END;
        IF t2 IS DISTINCT FROM 'plan:bad_input' OR msg NOT LIKE '%take_pallets:finite%' THEN
          RAISE EXCEPTION 'FAIL take_pallets NaN on a piece that is not stock got % (%)', coalesce(t2, 'no hint'), coalesce(msg, '-');
        END IF;
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1, 'take_pallets', 5)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072', 'owner');
      ELSIF k IN (35, 46) THEN   -- p1 (made 20) rode A -> Veroia on R1 and split there 7 + 13; the 13 are stock
        UPDATE shipments SET pallets = 20 WHERE id = sh1;
        UPDATE shipment_pieces SET pallets = 20 WHERE id = p1;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1a, s1h, 'test:072');
        UPDATE shipment_pieces SET split_at = now(), split_by = 'test:072' WHERE id = p1;
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (sh1, p1, 7, 'test:072') RETURNING id INTO c1;
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by) VALUES (sh1, p1, 13, e, 'test:072') RETURNING id INTO c2;
        IF k = 46 THEN
          -- coordinator 25/10 (cross-cutting input rule): NaN (sorts above every number) and +-Infinity are refused
          -- as bad_input 'take_pallets:finite', never read as a size (here on stock; case 34 on a piece that is not)
          FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                     jsonb_build_object('piece_id', c2, 'take_pallets', 'NaN'), jsonb_build_object('piece_id', c2, 'take_pallets', 'Infinity'),
                     jsonb_build_object('piece_id', c2, 'take_pallets', '-Infinity'))) LOOP
            msg := NULL;
            BEGIN
              PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(j),
                        'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                        'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b))),
                        'test:072', 'owner');
              t2 := 'accepted';
            EXCEPTION WHEN others THEN
              GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
            END;
            IF t2 IS DISTINCT FROM 'plan:bad_input' OR msg NOT LIKE '%take_pallets:finite%' THEN
              RAISE EXCEPTION 'FAIL % got % (%)', j::text, coalesce(t2, 'no hint'), coalesce(msg, '-');
            END IF;
          END LOOP;
        END IF;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', c2,
               'take_pallets', CASE WHEN k = 46 THEN 20 ELSE 8 END)),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b))),
               'test:072', 'owner');
      ELSIF k IN (36, 37) THEN   -- the VS bridge of the 20 pallets to B, waiting at Veroia
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 20, 'test:072') RETURNING id INTO y;
        IF k = 37 THEN   -- split earlier at Veroia 12 + 8 and the 12 already ride on R1: the 8 are stock
          UPDATE shipment_pieces SET split_at = now(), split_by = 'test:072' WHERE id = y;
          INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (x, y, 12, 'test:072') RETURNING id INTO z;
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (z, 1, rt1, s1h, s1b, 'test:072');
          INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by) VALUES (x, y, 8, d, 'test:072') RETURNING id INTO y;
        END IF;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', y)),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b))),
               'test:072', 'dispatcher');
      ELSIF k = 38 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(jsh1 || '{"pallets": 34}'))))), 'test:072', 'owner');
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', (r->'ids'->'piece_ids'->>0)::bigint)),
               'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
               'test:072', 'owner');
      ELSIF k = 39 THEN
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1, 'pickup', 'h')),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s1h), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072', 'owner');
      ELSIF k = 40 THEN
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a),
                                             jsonb_build_object('ref', 'b', 'location_id', lb, 'side', 'ANODOS', 'planned_from', a05,
                                                                'planned_to', (d + time '05:30') AT TIME ZONE 'Europe/Athens'))),
                  'test:072', 'owner');
      ELSIF k = 41 THEN
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'location_id', la, 'planned_from', a15, 'planned_to', a16),
                                             jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072', 'owner');
      ELSIF k = 42 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', trk1, drvl, e, e, b07, b12, 'planned', 'planner', 'test:072') RETURNING id INTO rt3;
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a),
                                             jsonb_build_object('ref', 'b', 'location_id', lb, 'planned_from', b10, 'planned_to', b11))),
                  'test:072', 'owner');
      ELSIF k = 43 THEN
        -- coordinator 25/10 (cross-cutting input rule): a new stop with an infinite end ('infinity' / '-infinity'
        -- are valid timestamptz input) is refused as bad_input 'stop.planned:finite', never written to rt_stops
        FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                   jsonb_build_object('ref', 'b', 'location_id', lb, 'planned_from', a15, 'planned_to', 'infinity'),
                   jsonb_build_object('ref', 'b', 'location_id', lb, 'planned_from', '-infinity', 'planned_to', a16))) LOOP
          msg := NULL;
          BEGIN
            PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                      'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                      'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), j)), 'test:072', 'owner');
            t2 := 'accepted';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
          END;
          IF t2 IS DISTINCT FROM 'plan:bad_input' OR msg NOT LIKE '%stop.planned:finite%' THEN
            RAISE EXCEPTION 'FAIL % got % (%)', j::text, coalesce(t2, 'no hint'), coalesce(msg, '-');
          END IF;
        END LOOP;
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'b', 'stop_id', s1b))), 'test:072', 'owner');
      ELSIF k = 44 THEN
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', -1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a))), 'test:072', 'owner');
      ELSIF k = 45 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(jsh1 || '{"pallets": 3}'))),
               'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b)))),
               'test:072', 'owner');
      ELSIF k = 47 THEN   -- three bridges (B 20, D 26, E 4), each one piece waiting at Veroia
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 20, 'test:072');
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_d, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 26, 'test:072');
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_e, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 4, 'test:072');
        r := plan_put_group(jsonb_build_object('group', jsonb_build_object('order_id', vso),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b),
                                          jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', b14, 'planned_to', b15),
                                          jsonb_build_object('ref', 'e', 'location_id', le, 'planned_from', b15, 'planned_to', b16))),
               'test:072', 'owner');
      ELSIF k = 48 THEN
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1a, s1b, 'test:072');
        PERFORM plan_put_group(jsonb_build_object('group', jsonb_build_object('nat_order_id', n1),
                  'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a))), 'test:072', 'owner');
      ELSIF k = 49 THEN
        -- coordinator 25/10 (cross-cutting input rule): a group id 'NaN' / 'Infinity' / '-Infinity' is refused as
        -- bad_input (the bigint cast, 22P02), never read as "no group"; a new stop with an infinite end is refused as
        -- bad_input 'stop.planned:finite' on this path too, never written to rt_stops
        FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                   jsonb_build_object('group', jsonb_build_object('order_id', 'NaN')),
                   jsonb_build_object('group', jsonb_build_object('order_id', 'Infinity')),
                   jsonb_build_object('group', jsonb_build_object('nat_order_id', '-Infinity')),
                   jsonb_build_object('group', jsonb_build_object('nat_order_id', 'NaN')),
                   jsonb_build_object('group', jsonb_build_object('nat_order_id', n1), 'stops', jsonb_build_array(
                     jsonb_build_object('ref', 'a', 'location_id', la, 'planned_from', b06, 'planned_to', 'infinity'),
                     jsonb_build_object('ref', 'b', 'stop_id', s2b))),
                   jsonb_build_object('group', jsonb_build_object('nat_order_id', n1), 'stops', jsonb_build_array(
                     jsonb_build_object('ref', 'a', 'location_id', la, 'planned_from', '-infinity', 'planned_to', b07),
                     jsonb_build_object('ref', 'b', 'stop_id', s2b))))) LOOP
          msg := NULL;
          BEGIN
            PERFORM plan_put_group(j || jsonb_build_object('target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS')),
                      'test:072', 'owner');
            t2 := 'accepted';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
          END;
          IF t2 IS DISTINCT FROM 'plan:bad_input'
             OR msg NOT LIKE (CASE WHEN j->'stops' IS NOT NULL THEN '%stop.planned:finite%' ELSE '%bad_input:22P02%' END) THEN
            RAISE EXCEPTION 'FAIL % got % (%)', j::text, coalesce(t2, 'no hint'), coalesce(msg, '-');
          END IF;
        END LOOP;
        IF EXISTS (SELECT 1 FROM rt_stops WHERE rt_id = rt2 AND location_id = la AND id <> s2a) THEN
          RAISE EXCEPTION 'FAIL an infinite stop was written to rt_stops';
        END IF;
        PERFORM plan_put_group(jsonb_build_object('group', '{}'::jsonb,
                  'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS')), 'test:072', 'owner');
      ELSIF k = 50 THEN
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
               jsonb_build_array(jsh1 || '{"pallets": 3}', jsh1 || jsonb_build_object('dest_location_id', lc, 'pallets', 4, 'deliver_to', a16)))))),
               'test:072', 'owner');
        x := (r->'ids'->'nat_order_ids'->>0)::bigint;
        r := plan_put_group(jsonb_build_object('group', jsonb_build_object('nat_order_id', x),
               'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b),
                                          jsonb_build_object('ref', 'c', 'location_id', lc, 'planned_from', a15, 'planned_to', a16))),
               'test:072', 'owner');
      -- @case (each task adds its "ELSIF k = <n> THEN" branches above this line)
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;

      -- Verdicts (only reached when nothing refused).
      IF want[k] <> 'ok' THEN
        verdict := 'FAIL no error';
      ELSIF k = 1 THEN
        verdict := CASE WHEN (SELECT count(*) FROM audit_log WHERE actor = 'test:072' AND role = 'dispatcher'
                                AND table_name = 'ct_round_trips' AND record_id = rt1::text AND after_data = '{"a":2}') = 1
                        THEN 'ok one audit row with the person and the role' ELSE 'FAIL audit row' END;
      ELSIF k = 5 THEN
        -- review 23/10: the token never hashes an amount (an md5 over the dispatcher's list + one unknown amount is
        -- found by trying values); a changed amount is still stale_confirm through the row version (61, B39, B46)
        verdict := CASE WHEN t1 = plan_h_token('plan_x', '1', j) AND length(t1) = 32
                          AND t1 = t2 AND t1 <> md5('072|plan_x|1|' || j::text)
                          AND plan_h_strip_amounts(j, 'dispatcher')::text NOT LIKE '%"amount"%'
                          AND plan_h_strip_amounts(j, 'dispatcher')::text NOT LIKE '%"invoice_number"%'
                          AND plan_h_strip_amounts(j, 'dispatcher')->1->'nested'->>'count' = '2'
                          AND plan_h_strip_amounts(j, 'accountant') = j AND plan_h_strip_amounts(j, 'owner') = j
                        THEN 'ok token stable and blind to amounts; amounts only for owner/accountant'
                        ELSE 'FAIL token or strip' END;
      ELSIF k = 12 THEN
        verdict := CASE WHEN (SELECT seq FROM rt_stops WHERE id = x) = 3 AND (SELECT seq FROM rt_stops WHERE id = s1b) = 4
                          AND (SELECT seq FROM rt_stops WHERE id = s1a) = 1 AND (SELECT created_by FROM rt_stops WHERE id = x) = 'test:072'
                          AND (SELECT start_at = a06 AND end_at = a14 FROM ct_round_trips WHERE id = rt1)
                          AND (r->'stops'->>'a')::bigint = s1a
                        THEN 'ok new stop C between Veroia and B, seq by side and time, window unchanged'
                        ELSE 'FAIL new stop / reseq' END;
      ELSIF k = 13 THEN
        verdict := CASE WHEN b1 AND (SELECT status FROM ct_round_trips WHERE id = rt2) = 'cancelled'
                          AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rt2 AND deleted_at IS NULL)
                          AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rt2 AND needs_review)
                          AND (SELECT deleted_reason FROM dl_entries WHERE rt_id = rt2) = 'test cancel (test:072)'
                          AND NOT EXISTS (SELECT 1 FROM rt_stops WHERE rt_id = rt2 AND deleted_at IS NULL)
                          AND (SELECT count(*) FROM plan_notices WHERE rt_id = rt2 AND to_desk = 'natl' AND kind = 'costs_without_rt') = 1
                          AND (SELECT count(*) FROM ct_cost_lines WHERE rt_id = rt2) = 1
                          AND j @> jsonb_build_array(jsonb_build_object('kind', 'payroll_amount', 'amount', 100))
                          AND j @> jsonb_build_array(jsonb_build_object('kind', 'costs', 'pay_source', 'DKV', 'count', 1, 'amount', 12.4))
                        THEN 'ok cancelled; payroll with amount deleted by the person, 0 needs_review; costs stay, natl notice'
                        ELSE 'FAIL cancel_if_empty: ' || coalesce(j::text, 'null') END;
      ELSIF k = 14 THEN
        -- decision 10 (owner 23/10): the base cannot know what was paid (monthly payments, not tied to trips), so
        -- the list says the line's month and nothing about payment, even with a payment of the driver after the cycle
        verdict := CASE WHEN j @> jsonb_build_array(jsonb_build_object('kind', 'payroll_amount',
                                  'month', (SELECT to_char(entry_date, 'YYYY-MM') FROM dl_entries
                                             WHERE rt_id = rt2 AND deleted_at IS NULL AND trip_value = 100)))
                          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) c WHERE c ? 'paid' OR c ? 'paid_week')
                        THEN 'ok the payroll line with its month, no paid flag' ELSE 'FAIL month: ' || j::text END;
      ELSIF k = 15 THEN
        verdict := CASE WHEN NOT b1 AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'planned'
                        THEN 'ok a cycle with a live leg stays' ELSE 'FAIL cancelled a cycle with a leg' END;
      ELSIF k = 16 THEN
        verdict := CASE WHEN jsonb_array_length(r->'ids'->'nat_order_ids') = 3
                          AND (SELECT count(*) FROM national_orders WHERE id IN (SELECT jsonb_array_elements_text(r->'ids'->'nat_order_ids')::bigint)
                                 AND legacy_id ~ '^rec[A-Za-z0-9]{14}$' AND truck_id IS NULL AND partner_id IS NULL
                                 AND status IS NULL AND direction IS NULL AND type IS NULL AND pallets = 10
                                 AND loading_datetime = d AND delivery_datetime = d AND pickup_location_1_id = la
                                 AND delivery_location_1_id = lb AND reference = 'WN072-TEST' AND pallet_exchange = false) = 3
                          AND (SELECT count(DISTINCT client_id) FROM national_orders WHERE id IN (SELECT jsonb_array_elements_text(r->'ids'->'nat_order_ids')::bigint)) = 3
                          AND (SELECT count(*) FROM v_piece_state WHERE piece_id IN (SELECT jsonb_array_elements_text(r->'ids'->'piece_ids')::bigint)
                                 AND waiting AND position_location_id = la AND kind = 'national') = 3
                          AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072' AND role = 'dispatcher' AND action = 'create'
                                 AND table_name IN ('national_orders', 'shipments', 'shipment_pieces')) = 9
                          AND r->>'op' = 'plan_orders_create' AND r->'warnings' = '[]'::jsonb AND r->'ids'->'leg_ids' = '[]'::jsonb
                        THEN 'ok 3 orders in one call, no mirror, facade id, 9 audit rows by the person'
                        ELSE 'FAIL groupage: ' || r::text END;
      ELSIF k = 17 THEN
        x := (r->'ids'->'nat_order_ids'->>0)::bigint;
        verdict := CASE WHEN (SELECT pallets = 10 AND loading_datetime = d AND delivery_datetime = e AND pickup_location_1_id = la
                                     AND delivery_location_1_id = lb FROM national_orders WHERE id = x)
                          AND (SELECT count(*) FROM v_shipments WHERE nat_order_id = x AND live) = 2
                          AND EXISTS (SELECT 1 FROM v_shipments WHERE nat_order_id = x AND nat_to_location_id = hub)
                          AND (SELECT pallets = 10 AND loading_datetime = d AND delivery_datetime = e AND pickup_location_1_id = lc
                                      AND delivery_location_1_id = hub FROM national_orders
                                WHERE id = (r2->'ids'->'nat_order_ids'->>0)::bigint)
                        THEN 'ok summary = 10 pallets, first load day D, last delivery day D+1, first origin A, last destination B; swapped: C, Veroia'
                        ELSE 'FAIL summary' END;
      ELSIF k = 30 THEN
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        verdict := CASE WHEN (SELECT piece_id = p1 AND rt_id = rt1 AND pickup_stop_id = s1a AND drop_stop_id = s1b AND leg_no = 1
                                     AND created_by = 'test:072' FROM piece_legs WHERE id = x)
                          AND (SELECT NOT waiting AND end_stop_id = s1b FROM v_piece_state WHERE piece_id = p1)
                          AND (SELECT planned FROM v_national_order_state WHERE nat_order_id = n1)
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'piece_legs' AND record_id = x::text AND actor = 'test:072') = 1
                          AND (r->'ids'->>'rt_id')::bigint = rt1 AND r->'notice_ids' = '[]'::jsonb
                        THEN 'ok one leg A -> B on R1, the order is planned' ELSE 'FAIL put: ' || r::text END;
      ELSIF k = 31 THEN
        verdict := CASE WHEN (SELECT seq FROM rt_stops WHERE id = y) = 4 AND (SELECT location_id FROM rt_stops WHERE id = y) = lc
                          AND (SELECT end_at = a16 AND date_end = d FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND entry_date = d AND date_end = d) = 1
                        THEN 'ok new stop C last (seq 4), the window ends 16:00, one payroll line' ELSE 'FAIL new stop' END;
      ELSIF k = 35 THEN
        verdict := CASE WHEN (SELECT count(*) FROM shipment_pieces WHERE parent_piece_id = c2 AND deleted_at IS NULL) = 2
                          AND (SELECT split_by FROM shipment_pieces WHERE id = c2) = 'test:072'
                          AND (SELECT count(*) FROM v_piece_state WHERE shipment_id = sh1 AND pallets = 8 AND NOT waiting AND end_stop_id = s2b) = 1
                          AND (SELECT count(*) FROM v_hub_bucket WHERE shipment_id = sh1 AND pallets = 5 AND is_stock AND leave_by = e) = 1
                          AND (SELECT count(*) FROM v_hub_bucket WHERE shipment_id = sh1 AND pallets = 7 AND is_stock) = 1
                          AND jsonb_array_length(r->'ids'->'new_piece_ids') = 2
                        THEN 'ok 13 -> 8 on R2 + 5 stock (leave_by kept), in one call' ELSE 'FAIL split+put: ' || r::text END;
      ELSIF k = 36 THEN
        verdict := CASE WHEN (SELECT cross_dock_date FROM orders WHERE id = vso) = e
                          AND (SELECT datetime FROM order_stops WHERE id = vs_cd) = e
                          AND (SELECT count(*) FROM plan_notices WHERE order_id = vso AND to_desk = 'intl' AND kind = 'vs_day_changed'
                                 AND created_by = 'test:072') = 1
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'orders' AND record_id = 'rec072TO1' AND actor = 'test:072'
                                 AND role = 'dispatcher' AND after_data->>'cross_dock_date' = e::text) = 1
                          AND current_setting('plan.writer', true) = 'natl'
                          AND jsonb_array_length(r->'notice_ids') = 1
                        THEN 'ok VS day D -> D+1 on the international, its Cross-dock stop followed (069), one intl notice'
                        ELSE 'FAIL VS day: ' || r::text END;
      ELSIF k = 37 THEN
        verdict := CASE WHEN (SELECT cross_dock_date FROM orders WHERE id = vso) = d
                          AND NOT EXISTS (SELECT 1 FROM plan_notices WHERE order_id = vso)
                          AND (SELECT NOT waiting FROM v_piece_state WHERE piece_id = y)
                        THEN 'ok stock rides, the international keeps its day' ELSE 'FAIL stock moved the VS day' END;
      ELSIF k = 38 THEN
        verdict := CASE WHEN r->'warnings' @> '[{"code": "over_33", "side": "KATHODOS", "pallets": 34}]'
                        THEN 'ok over 33: a warning' ELSE 'FAIL no over_33 warning: ' || r::text END;
      ELSIF k = 45 THEN
        verdict := CASE WHEN jsonb_array_length(r->'ids'->'leg_ids') = 1 AND (r->'ids'->>'rt_id')::bigint = rt1
                          AND (SELECT NOT waiting FROM v_piece_state WHERE piece_id = (r->'ids'->'piece_ids'->>0)::bigint)
                        THEN 'ok created and put in one call' ELSE 'FAIL create with target: ' || r::text END;
      ELSIF k = 47 THEN
        verdict := CASE WHEN jsonb_array_length(r->'ids'->'leg_ids') = 3
                          AND (SELECT all_planned FROM v_vs_state WHERE order_id = vso)
                          AND (SELECT cross_dock_date FROM orders WHERE id = vso) = e
                          AND (SELECT count(*) FROM plan_notices WHERE order_id = vso AND kind = 'vs_day_changed') = 1
                          AND (SELECT count(*) FROM rt_stops WHERE rt_id = rt2 AND deleted_at IS NULL) = 5
                          AND r->'warnings' @> '[{"code": "over_33"}]'
                        THEN 'ok one call: 3 legs, all planned, the international on D+1, one notice, over 33 warned'
                        ELSE 'FAIL VS group: ' || r::text END;
      ELSIF k = 50 THEN
        verdict := CASE WHEN jsonb_array_length(r->'ids'->'leg_ids') = 2
                          AND (SELECT planned FROM v_national_order_state WHERE nat_order_id = x)
                          AND (SELECT count(*) FROM shipment_pieces p JOIN shipments s ON s.id = p.shipment_id WHERE s.nat_order_id = x) = 2
                        THEN 'ok 2 shipments, 2 legs, no split' ELSE 'FAIL national group: ' || r::text END;
      -- @verdict (each task adds its "ELSIF k = <n> THEN verdict := ..." branches above this line)
      ELSE
        verdict := 'FAIL no verdict for case ' || k;
      END IF;
      RAISE EXCEPTION 'wn072 undo' USING HINT = 'wn072_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn072_undo' THEN coalesce(verdict, 'FAIL no verdict')
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

  -- [SECTION B CASES]
  RAISE EXCEPTION 'RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$t072$;
