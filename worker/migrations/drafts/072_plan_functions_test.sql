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
    , 'ok'               -- 51 26 -> 12 + 14 at Veroia: two stock pieces that leave by the evening before
    , 'plan:parts_sum'   -- 52 12 + 13 <> 26 (after the non-finite input probes: bad_input, nothing written)
    , 'plan:not_at_hub'  -- 53 a piece that is not at Veroia
    , 'plan:piece_split' -- 54 a piece already split
    , 'plan:bad_input'   -- 55 one part only
    , 'ok'               -- 56 a part onto a truck in the same call: it counts as the first piece of the VS
    , 'ok'               -- 57 one row to another cycle; the source keeps another load: no list, no token
    , 'ok'               -- 58 the source would be left empty: the dry run lists it and writes nothing
    , 'ok'               -- 59 with the token: source cancelled, its payroll with amount deleted, 0 needs_review
    , 'plan:need_token'  -- 60 the same without the token
    , 'plan:stale_confirm' -- 61 the payroll amount changed after the dry run
    , 'plan:same_rt'     -- 62 onto the side it is already on
    , 'ok'               -- 63 back to waiting
    , 'ok'               -- 64 a whole side (breakdown): both rows to another truck, the source cancelled
    , 'ok'               -- 65 the dispatcher's list has no amounts; the token is the same for every role
    , 'ok'               -- 66 the loading by a local driver is listed and goes with its stop
    , 'plan:piece_dead'  -- 67 one bad row: nothing moves (one transaction) (after the non-finite input probes: bad_input, nothing moved)
    , 'ok'               -- 68 price, reference, notes: one update, one audit row with what changed
    , 'ok'               -- 69 10 -> 12 waiting, then 12 -> 14 on a truck: the piece and the summary follow
    , 'ok'               -- 70 fewer pallets on a split shipment: off the stock first
    , 'plan:vs_locked'   -- 71 a VS bridge is the international desk's
    , 'plan:order_gone'  -- 72 a deleted order
    , 'plan:order_not_v5' -- 73 an order of today's model
    , 'plan:no_price'    -- 74 price 0 (after the non-finite input probes: no_price / bad_input / no_window, nothing written)
    , 'plan:piece_busy'  -- 75 a new origin while the piece rides
    , 'plan:bad_input'   -- 76 status is never written (no mirror): an unknown key
    , 'ok'               -- 77 a later delivery window: the requested delivery day follows
    , 'ok'               -- 78 a VS split at Veroia with no target, then its 12 onto D+1: the first ride moves the day
    , 'ok'               -- 79 a later leg on another cycle is listed (later_leg) and the move needs the token
    , 'plan:need_token'  -- 80 the same move without the token
    , 'ok'               -- 81 a local loading whose TOPIKO line has an amount: local_payroll, the amount for the owner only
    , 'ok'               -- 82 with the token: the loading goes, its TOPIKO line waits for accounting (060 needs_review)
    , 'ok'               -- 83 decision 44: plan_orders_create again with its request_id = the first ids, nothing written
    , 'plan:request_reused' -- 84 the same request_id with another body: refused, never the first answer
    , 'ok'               -- 85 plan_split_piece again with its request_id = the first children (no piece_split)
    , 'plan:bad_input'   -- 86 a request_id that is not a uuid
    , 'plan:request_reused' -- 87 the request_id of an order creation sent to plan_split_piece
    , 'plan:request_reused' -- 88 another person sends the same request_id and body: never their ids
    , 'plan:request_missing' -- 89 plan_orders_create without request_id: refused, never a silent pass
    , 'plan:request_missing' -- 90 plan_split_piece without request_id
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
      ELSIF k IN (51, 52, 54, 55, 56) THEN   -- the VS bridge of the 26 pallets to D, waiting at Veroia
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_d, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 26, 'test:072') RETURNING id INTO y;
        IF k IN (51, 54) THEN
          r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 12}, {"pallets": 14}]'::jsonb)), 'test:072', 'owner');
          IF k = 54 THEN
            PERFORM plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 6}, {"pallets": 20}]'::jsonb)), 'test:072', 'owner');
          END IF;
        ELSIF k = 52 THEN
          -- coordinator 25/10 (cross-cutting input rule): a part of 'NaN' / 'Infinity' / '-Infinity' pallets is refused
          -- as bad_input 'parts:finite' (never as parts_sum), a piece_id 'NaN' as bad_input (the bigint cast, 22P02),
          -- and a part riding to a new stop with an infinite end as bad_input 'stop.planned:finite'; nothing is written
          FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                     jsonb_build_object('piece_id', y, 'parts', '[{"pallets": "NaN"}, {"pallets": 26}]'::jsonb),
                     jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 12}, {"pallets": "Infinity"}]'::jsonb),
                     jsonb_build_object('piece_id', y, 'parts', '[{"pallets": "-Infinity"}, {"pallets": 26}]'::jsonb),
                     jsonb_build_object('piece_id', 'NaN', 'parts', '[{"pallets": 12}, {"pallets": 14}]'::jsonb),
                     jsonb_build_object('piece_id', y, 'parts', jsonb_build_array(
                       jsonb_build_object('pallets', 12, 'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                         'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h),
                                                    jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', b13, 'planned_to', 'infinity'))),
                       jsonb_build_object('pallets', 14))))) LOOP
            msg := NULL;
            BEGIN
              PERFORM plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || j, 'test:072', 'owner');
              t2 := 'accepted';
            EXCEPTION WHEN others THEN
              GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
            END;
            IF t2 IS DISTINCT FROM 'plan:bad_input'
               OR msg NOT LIKE (CASE WHEN j->>'piece_id' = 'NaN' THEN '%bad_input:22P02%'
                                     WHEN j->'parts'->0 ? 'target' THEN '%stop.planned:finite%'
                                     ELSE '%parts:finite%' END) THEN
              RAISE EXCEPTION 'FAIL % got % (%)', j::text, coalesce(t2, 'no hint'), coalesce(msg, '-');
            END IF;
          END LOOP;
          IF EXISTS (SELECT 1 FROM shipment_pieces WHERE id = y AND split_at IS NOT NULL)
             OR EXISTS (SELECT 1 FROM shipment_pieces WHERE parent_piece_id = y)
             OR EXISTS (SELECT 1 FROM rt_stops WHERE rt_id = rt2 AND location_id = ld) THEN
            RAISE EXCEPTION 'FAIL a split with a non-finite input was written';
          END IF;
          PERFORM plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 12}, {"pallets": 13}]'::jsonb)), 'test:072', 'owner');
        ELSIF k = 55 THEN
          PERFORM plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 26}]'::jsonb)), 'test:072', 'owner');
        ELSE
          r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', y, 'parts', jsonb_build_array(
                 jsonb_build_object('pallets', 12, 'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                   'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h),
                                              jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', b13, 'planned_to', b14))),
                 jsonb_build_object('pallets', 14)))), 'test:072', 'dispatcher');
        END IF;
      ELSIF k = 53 THEN
        PERFORM plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', p1, 'parts', '[{"pallets": 4}, {"pallets": 6}]'::jsonb)), 'test:072', 'owner');
      ELSIF k BETWEEN 57 AND 67 THEN
        -- p1 on R1 (A -> B); for 56, 62, 63 a second order (2 pallets, piece z) rides with it
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072', 'owner');
        IF k IN (57, 63, 64) THEN
          r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                 jsonb_build_array(jsh1 || '{"pallets": 2}'))),
                 'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                 'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b)))),
                 'test:072', 'owner');
          z := (r->'ids'->'piece_ids'->>0)::bigint;
        END IF;
        SET CONSTRAINTS ALL DEFERRED;
        UPDATE dl_entries SET trip_value = 50 WHERE rt_id = rt1 AND deleted_at IS NULL;
        IF k = 66 THEN
          INSERT INTO local_moves (move_kind, rt_stop_id, driver_id, truck_id, move_date, status)
          VALUES ('nat_loading', s1a, drvl, trk2, d, 'Assigned') RETURNING id INTO q;
        END IF;
        j := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a), jsonb_build_object('ref', 'b', 'stop_id', s2b)));
        SELECT count(*) INTO n FROM audit_log;
        IF k = 57 THEN
          r := plan_move_pieces(j, 'test:072', 'owner');
        ELSIF k IN (58, 59, 60, 61, 65, 66) THEN
          r := plan_move_pieces(j || '{"dry_run": true}', 'test:072', CASE WHEN k = 65 THEN 'dispatcher' ELSE 'owner' END);
          SELECT count(*) INTO m FROM audit_log;
          IF k = 65 THEN r2 := plan_move_pieces(j || '{"dry_run": true}', 'test:072', 'owner'); END IF;
          IF k = 61 THEN UPDATE dl_entries SET trip_value = 60 WHERE rt_id = rt1 AND deleted_at IS NULL; END IF;
          IF k IN (59, 61, 66) THEN
            r2 := plan_move_pieces(j || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072', 'owner');
          ELSIF k = 60 THEN
            PERFORM plan_move_pieces(j, 'test:072', 'owner');
          END IF;
        ELSIF k = 62 THEN
          PERFORM plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
                    'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS')), 'test:072', 'owner');
        ELSIF k = 63 THEN
          r := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
                 'target', '{"wait": true}'::jsonb), 'test:072', 'owner');
        ELSIF k = 64 THEN
          j := j || jsonb_build_object('from', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'));
          r := plan_move_pieces(j || '{"dry_run": true}', 'test:072', 'owner');
          r2 := plan_move_pieces(j || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072', 'owner');
        ELSE   -- 67
          -- coordinator 25/10 (cross-cutting input rule): a piece id, a from.rt_id or a target.rt_id of 'NaN' /
          -- 'Infinity' / '-Infinity' is refused as bad_input (the bigint cast, 22P02) before the list; a new target stop
          -- with an infinite end is refused at execution (after the token) as bad_input 'stop.planned:finite'
          -- (plan_h_stop_add, the one guard); nothing moves
          FOR r2 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                      j || jsonb_build_object('from', jsonb_build_object('piece_ids', '["NaN"]'::jsonb)),
                      j || jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1, 'Infinity'))),
                      j || jsonb_build_object('from', jsonb_build_object('rt_id', '-Infinity', 'side', 'KATHODOS')),
                      j || jsonb_build_object('target', jsonb_build_object('rt_id', 'NaN', 'side', 'KATHODOS')),
                      j || jsonb_build_object('stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a),
                             jsonb_build_object('ref', 'b', 'location_id', lb, 'planned_from', b12, 'planned_to', 'infinity'))),
                      j || jsonb_build_object('stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a),
                             jsonb_build_object('ref', 'b', 'location_id', lb, 'planned_from', '-infinity', 'planned_to', b14))))) LOOP
            msg := NULL;
            BEGIN
              IF r2->'stops'->1 ? 'location_id' THEN
                r := plan_move_pieces(r2 || '{"dry_run": true}', 'test:072', 'owner');
                PERFORM plan_move_pieces(r2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072', 'owner');
              ELSE
                PERFORM plan_move_pieces(r2, 'test:072', 'owner');
              END IF;
              t2 := 'accepted';
            EXCEPTION WHEN others THEN
              GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
            END;
            IF t2 IS DISTINCT FROM 'plan:bad_input'
               OR msg NOT LIKE (CASE WHEN r2->'stops'->1 ? 'location_id' THEN '%stop.planned:finite%'
                                     ELSE '%bad_input:22P02%' END) THEN
              RAISE EXCEPTION 'FAIL % got % (%)', r2::text, coalesce(t2, 'no hint'), coalesce(msg, '-');
            END IF;
          END LOOP;
          IF NOT EXISTS (SELECT 1 FROM piece_legs WHERE piece_id = p1 AND rt_id = rt1 AND deleted_at IS NULL)
             OR EXISTS (SELECT 1 FROM piece_legs WHERE rt_id = rt2)
             OR EXISTS (SELECT 1 FROM rt_stops WHERE rt_id = rt2 AND location_id = lb AND id <> s2b)
             OR (SELECT status FROM ct_round_trips WHERE id = rt1) <> 'planned' THEN
            RAISE EXCEPTION 'FAIL a move with a non-finite input was written';
          END IF;
          PERFORM plan_move_pieces(j || jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1, -5))),
                    'test:072', 'owner');
        END IF;
      ELSIF k = 68 THEN
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'set', '{"price": 120, "reference": "WN072-TEST", "notes": "TEST 072 note"}'::jsonb),
                               'test:072', 'dispatcher');
      ELSIF k = 69 THEN
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 12))),
                               'test:072', 'owner');
        -- review 23/10: an order already on a truck grows too - the riding piece takes it, never piece_busy
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072', 'owner');
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 14))),
                               'test:072', 'owner');
      ELSIF k = 70 THEN   -- p1 (made 20) rode A -> Veroia, split 7 (rides on R2) + 13 (stock); 20 -> 15 takes 5 off the stock
        UPDATE shipments SET pallets = 20 WHERE id = sh1;
        UPDATE shipment_pieces SET pallets = 20 WHERE id = p1;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1a, s1h, 'test:072');
        UPDATE shipment_pieces SET split_at = now(), split_by = 'test:072' WHERE id = p1;
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (sh1, p1, 7, 'test:072') RETURNING id INTO c1;
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by) VALUES (sh1, p1, 13, d, 'test:072') RETURNING id INTO c2;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (c1, 1, rt2, s2h, s2b, 'test:072');
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 15))),
                               'test:072', 'owner');
      ELSIF k = 71 THEN
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 20, 'test:072');
        PERFORM plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments', jsonb_build_array(jsonb_build_object('shipment_id', x, 'pallets', 18))),
                                  'test:072', 'owner');
      ELSIF k = 72 THEN
        UPDATE shipment_pieces SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:072' WHERE id = p1;
        UPDATE shipments SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:072' WHERE id = sh1;
        UPDATE national_orders SET deleted_at = now() WHERE id = n1;
        PERFORM plan_order_update(jsonb_build_object('nat_order_id', n1, 'set', '{"notes": "x"}'::jsonb), 'test:072', 'owner');
      ELSIF k = 73 THEN
        PERFORM plan_order_update(jsonb_build_object('nat_order_id', nold, 'set', '{"notes": "x"}'::jsonb), 'test:072', 'owner');
      ELSIF k = 74 THEN
        -- coordinator 25/10 (cross-cutting input rule): a price of 'NaN' / 'Infinity' / '-Infinity' is refused as
        -- no_price, a temperature_c or a shipment's pallets of the same as bad_input '<field>:finite', a window end of
        -- 'infinity' / '-infinity' as no_window 'shipment:finite', and an id of 'NaN' / 'Infinity' as bad_input (the
        -- bigint cast, 22P02); nothing is written
        FOR j IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
                   jsonb_build_object('want', 'no_price:', 'p', jsonb_build_object('nat_order_id', n1, 'set', '{"price": "NaN"}'::jsonb)),
                   jsonb_build_object('want', 'no_price:', 'p', jsonb_build_object('nat_order_id', n1, 'set', '{"price": "Infinity"}'::jsonb)),
                   jsonb_build_object('want', 'no_price:', 'p', jsonb_build_object('nat_order_id', n1, 'set', '{"price": "-Infinity"}'::jsonb)),
                   jsonb_build_object('want', 'bad_input:temperature_c:finite', 'p', jsonb_build_object('nat_order_id', n1, 'set', '{"temperature_c": "NaN"}'::jsonb)),
                   jsonb_build_object('want', 'bad_input:temperature_c:finite', 'p', jsonb_build_object('nat_order_id', n1, 'set', '{"temperature_c": "Infinity"}'::jsonb)),
                   jsonb_build_object('want', 'bad_input:temperature_c:finite', 'p', jsonb_build_object('nat_order_id', n1, 'set', '{"temperature_c": "-Infinity"}'::jsonb)),
                   jsonb_build_object('want', 'bad_input:pallets:finite', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 'NaN')))),
                   jsonb_build_object('want', 'bad_input:pallets:finite', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', 'Infinity')))),
                   jsonb_build_object('want', 'bad_input:pallets:finite', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'pallets', '-Infinity')))),
                   jsonb_build_object('want', 'no_window:shipment:finite', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'deliver_to', 'infinity')))),
                   jsonb_build_object('want', 'no_window:shipment:finite', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'load_from', '-infinity')))),
                   jsonb_build_object('want', 'bad_input:22P02', 'p', jsonb_build_object('nat_order_id', 'NaN', 'set', '{"notes": "x"}'::jsonb)),
                   jsonb_build_object('want', 'bad_input:22P02', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', 'Infinity', 'pallets', 12)))),
                   jsonb_build_object('want', 'bad_input:22P02', 'p', jsonb_build_object('nat_order_id', n1,
                     'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'dest_location_id', '-Infinity')))))) LOOP
          msg := NULL;
          BEGIN
            PERFORM plan_order_update(j->'p', 'test:072', 'owner');
            t2 := 'accepted';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS t2 = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
          END;
          IF t2 IS DISTINCT FROM 'plan:' || split_part(j->>'want', ':', 1) OR msg NOT LIKE '%rule broken: ' || (j->>'want') || '%' THEN
            RAISE EXCEPTION 'FAIL % got % (%)', (j->'p')::text, coalesce(t2, 'no hint'), coalesce(msg, '-');
          END IF;
        END LOOP;
        IF (SELECT price IS DISTINCT FROM 100 OR temperature_c IS DISTINCT FROM 2 OR pallets IS DISTINCT FROM 10 FROM national_orders WHERE id = n1)
           OR (SELECT pallets IS DISTINCT FROM 10 OR load_from IS DISTINCT FROM a06 OR deliver_to IS DISTINCT FROM a14 FROM shipments WHERE id = sh1)
           OR (SELECT pallets FROM shipment_pieces WHERE id = p1) IS DISTINCT FROM 10
           OR EXISTS (SELECT 1 FROM audit_log WHERE actor = 'test:072' AND table_name IN ('national_orders', 'shipments', 'shipment_pieces')
                        AND action = 'update') THEN
          RAISE EXCEPTION 'FAIL an update with a non-finite input was written';
        END IF;
        PERFORM plan_order_update(jsonb_build_object('nat_order_id', n1, 'set', '{"price": 0}'::jsonb), 'test:072', 'owner');
      ELSIF k = 75 THEN
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1a, s1b, 'test:072');
        PERFORM plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1, 'origin_location_id', lc))),
                                  'test:072', 'owner');
      ELSIF k = 76 THEN
        PERFORM plan_order_update(jsonb_build_object('nat_order_id', n1, 'set', '{"status": "Delivered"}'::jsonb), 'test:072', 'owner');
      ELSIF k = 77 THEN
        r := plan_order_update(jsonb_build_object('nat_order_id', n1, 'shipments', jsonb_build_array(jsonb_build_object('shipment_id', sh1,
               'deliver_from', (d + 2 + time '12:00') AT TIME ZONE 'Europe/Athens', 'deliver_to', (d + 2 + time '14:00') AT TIME ZONE 'Europe/Athens'))),
               'test:072', 'owner');
      ELSIF k = 78 THEN   -- the VS bridge of 26 to D, split 12 + 14 at Veroia (both stock), then the 12 on R2 (D+1)
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_d, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 26, 'test:072') RETURNING id INTO y;
        r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 12}, {"pallets": 14}]'::jsonb)), 'test:072', 'owner');
        c1 := (r->'ids'->'piece_ids'->>0)::bigint;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', c1)),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h),
                                          jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', b13, 'planned_to', b14))),
               'test:072', 'dispatcher');
      ELSIF k IN (79, 80) THEN   -- p1 rides A -> Veroia on R1 and Veroia -> B on R2; both cycles keep another load
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || '{"pallets": 2}'))),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b)))),
                  'test:072', 'owner');
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || jsonb_build_object('pallets', 2, 'load_from', b06, 'load_to', b08,
                                                               'deliver_from', b12, 'deliver_to', b14)))),
                  'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a), jsonb_build_object('ref', 'b', 'stop_id', s2b)))),
                  'test:072', 'owner');
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
        VALUES (p1, 1, rt1, s1a, s1h, 'test:072');
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
        VALUES (p1, 2, rt2, s2h, s2b, 'test:072') RETURNING id INTO q;
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        j := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a), jsonb_build_object('ref', 'b', 'stop_id', s2b)));
        IF k = 79 THEN
          r := plan_move_pieces(j || '{"dry_run": true}', 'test:072', 'dispatcher');
        ELSE
          PERFORM plan_move_pieces(j, 'test:072', 'dispatcher');
        END IF;
      ELSIF k IN (81, 82) THEN   -- p1 on R1 from A; a load from Veroia keeps R1 alive; a local driver loads at A
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072', 'owner');
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1 || jsonb_build_object('shipments',
                  jsonb_build_array(jsh1 || jsonb_build_object('origin_location_id', hub, 'pallets', 2, 'load_from', a09,
                                                               'load_to', a10)))),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s1h), jsonb_build_object('ref', 'b', 'stop_id', s1b)))),
                  'test:072', 'owner');
        INSERT INTO local_moves (move_kind, rt_stop_id, driver_id, truck_id, move_date, status, sequence)
        VALUES ('nat_loading', s1a, drvl, trk2, d, 'Assigned', 1) RETURNING id INTO q;
        -- accounting already valued the local driver's TOPIKO line of that day (060 wrote it, empty)
        UPDATE dl_entries SET trip_value = 50 WHERE driver_id = drvl AND entry_date = d AND local_move_id IS NOT NULL
           AND deleted_at IS NULL RETURNING id INTO x;
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        j := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
               'target', jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS'),
               'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s2a), jsonb_build_object('ref', 'b', 'stop_id', s2b)));
        r := plan_move_pieces(j || '{"dry_run": true}', 'test:072', 'owner');
        r2 := plan_move_pieces(j || '{"dry_run": true}', 'test:072', 'dispatcher');
        IF k = 82 THEN
          r2 := plan_move_pieces(j || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072', 'dispatcher');
        END IF;
      ELSIF k IN (83, 84) THEN   -- decision 44; the warehouse writes too (decision 41: the DB does not check rights)
        j := jsonb_build_object('orders', jsonb_build_array(jo1), 'request_id', '6F1C2A3E-0000-4000-8000-000000000083');
        r := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (j), 'test:072', 'warehouse');
        n := (SELECT count(*) FROM national_orders) + (SELECT count(*) FROM shipments) + (SELECT count(*) FROM shipment_pieces);
        m := (SELECT count(*) FROM audit_log);
        IF k = 83 THEN
          r2 := plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (j), 'test:072', 'warehouse');
        ELSE
          PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (j || jsonb_build_object('orders', jsonb_build_array(jo1 || '{"price": 101}'))),
                                     'test:072', 'warehouse');
        END IF;
      ELSIF k = 85 THEN   -- the VS bridge of 26 to D, split at Veroia twice with the same request_id
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_d, 'test:072') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 26, 'test:072') RETURNING id INTO y;
        j := jsonb_build_object('piece_id', y, 'parts', '[{"pallets": 12}, {"pallets": 14}]'::jsonb,
                                'request_id', '6f1c2a3e-0000-4000-8000-000000000085');
        r := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (j), 'test:072', 'management');
        n := (SELECT count(*) FROM shipment_pieces WHERE shipment_id = x);
        m := (SELECT count(*) FROM audit_log);
        r2 := plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (j), 'test:072', 'management');
      ELSIF k = 86 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1), 'request_id', 'abc-123')), 'test:072', 'owner');
      ELSIF k = 87 THEN
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('orders', jsonb_build_array(jo1),
                                   'request_id', '6f1c2a3e-0000-4000-8000-000000000087')), 'test:072', 'owner');
        PERFORM plan_split_piece(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('piece_id', p1, 'parts', '[{"pallets": 4}, {"pallets": 6}]'::jsonb,
                                 'request_id', '6f1c2a3e-0000-4000-8000-000000000087')), 'test:072', 'owner');
      ELSIF k = 88 THEN   -- the replay compares the JWT user too (review of PR #84)
        j := jsonb_build_object('orders', jsonb_build_array(jo1), 'request_id', '6f1c2a3e-0000-4000-8000-000000000088');
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (j), 'test:072', 'owner');
        PERFORM plan_orders_create(jsonb_build_object('request_id', gen_random_uuid()) || (j), 'test:072-other', 'owner');
      ELSIF k = 89 THEN   -- written public.plan_...: the cases that must arrive WITHOUT a request_id
        PERFORM public.plan_orders_create(jsonb_build_object('orders', jsonb_build_array(jo1)), 'test:072', 'owner');
      ELSIF k = 90 THEN
        PERFORM public.plan_split_piece(jsonb_build_object('piece_id', p1, 'parts', '[{"pallets": 4}, {"pallets": 6}]'::jsonb),
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
      ELSIF k = 51 THEN
        verdict := CASE WHEN (SELECT split_at IS NOT NULL AND split_by = 'test:072' FROM shipment_pieces WHERE id = y)
                          AND (SELECT count(*) FROM v_hub_bucket WHERE shipment_id = x AND is_stock AND leave_by = d) = 2
                          AND (SELECT sum(pallets) FROM v_piece_state WHERE shipment_id = x) = 26
                          AND (SELECT cross_dock_date FROM orders WHERE id = vso) = d
                        THEN 'ok 12 + 14 stock at Veroia, leave by D (the day before D+1)' ELSE 'FAIL split' END;
      ELSIF k = 56 THEN
        c1 := (r->'ids'->'piece_ids'->>0)::bigint; c2 := (r->'ids'->'piece_ids'->>1)::bigint;
        verdict := CASE WHEN (SELECT NOT waiting AND pallets = 12 FROM v_piece_state WHERE piece_id = c1)
                          AND (SELECT leave_by FROM shipment_pieces WHERE id = c1) IS NULL
                          AND (SELECT is_stock AND leave_by = d AND pallets = 14 FROM v_hub_bucket WHERE piece_id = c2)
                          AND (SELECT cross_dock_date FROM orders WHERE id = vso) = e
                          AND jsonb_array_length(r->'notice_ids') = 1 AND jsonb_array_length(r->'ids'->'leg_ids') = 1
                        THEN 'ok the 12 ride on D+1 (first piece: the international moves), the 14 stay as stock'
                        ELSE 'FAIL split with target: ' || r::text END;
      ELSIF k = 57 THEN
        verdict := CASE WHEN r->>'dry_run' = 'false'
                          AND (SELECT count(*) FROM piece_legs WHERE piece_id = p1 AND deleted_at IS NULL AND rt_id = rt2) = 1
                          AND (SELECT count(*) FROM piece_legs WHERE piece_id = p1 AND deleted_at IS NOT NULL AND rt_id = rt1
                                 AND deleted_by = 'test:072') = 1
                          AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'planned'
                          AND (SELECT count(*) FROM rt_stops WHERE rt_id = rt1 AND deleted_at IS NULL) = 3
                          AND (SELECT NOT waiting AND end_stop_id = s1b FROM v_piece_state WHERE piece_id = z)
                          AND (SELECT end_stop_id FROM v_piece_state WHERE piece_id = p1) = s2b
                        THEN 'ok moved to R2; R1 keeps the other load and its stops' ELSE 'FAIL move: ' || r::text END;
      ELSIF k = 58 THEN
        verdict := CASE WHEN r->>'dry_run' = 'true' AND (r->>'needs_confirm')::boolean AND length(r->>'confirm_token') = 32
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'rt_cancelled', 'rt_id', rt1))
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'payroll_amount', 'amount', 50))
                          AND m = n AND (SELECT count(*) FROM piece_legs WHERE piece_id = p1 AND deleted_at IS NULL AND rt_id = rt1) = 1
                        THEN 'ok the dry run lists R1 cancelled and its payroll, writes nothing' ELSE 'FAIL dry run: ' || r::text END;
      ELSIF k = 59 THEN
        verdict := CASE WHEN (SELECT status FROM ct_round_trips WHERE id = rt1) = 'cancelled'
                          AND NOT EXISTS (SELECT 1 FROM piece_legs WHERE rt_id = rt1 AND deleted_at IS NULL)
                          AND NOT EXISTS (SELECT 1 FROM rt_stops WHERE rt_id = rt1 AND deleted_at IS NULL)
                          AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rt1 AND (deleted_at IS NULL OR needs_review))
                          AND (SELECT deleted_reason FROM dl_entries WHERE rt_id = rt1) LIKE '%(test:072)'
                          AND (SELECT end_stop_id FROM v_piece_state WHERE piece_id = p1) = s2b
                          AND r2->'ids'->'cancelled_rt_ids' = jsonb_build_array(rt1)
                        THEN 'ok R1 cancelled with its stops; payroll deleted by the person, 0 needs_review; p1 on R2'
                        ELSE 'FAIL execute: ' || coalesce(r2::text, 'null') END;
      ELSIF k = 63 THEN
        verdict := CASE WHEN (SELECT waiting AND position_location_id = la FROM v_piece_state WHERE piece_id = p1)
                          AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'planned'
                          AND r->'ids'->'leg_ids' = '[]'::jsonb
                        THEN 'ok p1 waits at A again; R1 keeps the other load' ELSE 'FAIL wait: ' || r::text END;
      ELSIF k = 64 THEN
        verdict := CASE WHEN (SELECT count(*) FROM piece_legs WHERE rt_id = rt2 AND deleted_at IS NULL) = 2
                          AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'cancelled'
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'rt_cancelled', 'rt_id', rt1))
                        THEN 'ok the whole KATHODOS of R1 on R2, R1 cancelled' ELSE 'FAIL side: ' || coalesce(r2::text, r::text) END;
      ELSIF k = 65 THEN
        verdict := CASE WHEN r::text NOT LIKE '%"amount"%' AND r2::text LIKE '%"amount": 50%'
                          AND r->>'confirm_token' = r2->>'confirm_token'
                          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'consequences') c WHERE c->>'kind' = 'payroll_amount'
                                        AND c->>'month' ~ '^[0-9]{4}-[0-9]{2}$' AND NOT (c ? 'paid') AND NOT (c ? 'paid_week'))
                        THEN 'ok the dispatcher sees the payroll line, not its amount; one token for both'
                        ELSE 'FAIL amounts: ' || r::text END;
      ELSIF k = 66 THEN
        verdict := CASE WHEN r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'local_loading', 'local_move_id', q))
                          AND (SELECT deleted_at IS NOT NULL FROM local_moves WHERE id = q)
                          AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'cancelled'
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'local_moves' AND record_id = q::text AND actor = 'test:072') = 1
                        THEN 'ok the local loading was listed and went with its stop' ELSE 'FAIL local loading: ' || r::text END;
      ELSIF k = 68 THEN
        verdict := CASE WHEN (SELECT price = 120 AND notes = 'TEST 072 note' AND truck_id IS NULL AND status IS NULL FROM national_orders WHERE id = n1)
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'national_orders' AND record_id = 'rec072TN1'
                                 AND actor = 'test:072' AND role = 'dispatcher' AND (before_data->>'price')::numeric = 100
                                 AND (after_data->>'price')::numeric = 120 AND NOT (after_data ? 'reference')) = 1
                        THEN 'ok price 100 -> 120 and the note, one audit row of what changed' ELSE 'FAIL update: ' || r::text END;
      ELSIF k = 69 THEN
        verdict := CASE WHEN (SELECT pallets FROM shipment_pieces WHERE id = p1) = 14
                          AND (SELECT pallets FROM national_orders WHERE id = n1) = 14
                          AND (SELECT NOT waiting AND end_stop_id = s1b FROM v_piece_state WHERE piece_id = p1)
                        THEN 'ok 10 -> 12 waiting, then 12 -> 14 on the truck: the piece and the summary follow'
                        ELSE 'FAIL pallets: ' || coalesce((SELECT pallets::text FROM shipment_pieces WHERE id = p1), 'null') END;
      ELSIF k = 70 THEN
        verdict := CASE WHEN (SELECT pallets FROM shipment_pieces WHERE id = c2) = 8 AND (SELECT pallets FROM shipment_pieces WHERE id = c1) = 7
                          AND (SELECT pallets FROM national_orders WHERE id = n1) = 15
                        THEN 'ok 5 off the stock (13 -> 8), the riding 7 untouched, summary 15' ELSE 'FAIL reduce on split' END;
      ELSIF k = 77 THEN
        verdict := CASE WHEN (SELECT delivery_datetime FROM national_orders WHERE id = n1) = d + 2
                          AND (SELECT loading_datetime FROM national_orders WHERE id = n1) = d
                        THEN 'ok requested delivery day D+2 from the window' ELSE 'FAIL window' END;
      ELSIF k = 78 THEN
        verdict := CASE WHEN (SELECT cross_dock_date FROM orders WHERE id = vso) = e
                          AND (SELECT count(*) FROM plan_notices WHERE order_id = vso AND kind = 'vs_day_changed') = 1
                          AND jsonb_array_length(r->'notice_ids') = 1
                        THEN 'ok the first ride after a split without target moves the international to D+1, one notice'
                        ELSE 'FAIL first after split: ' || r::text END;
      ELSIF k = 79 THEN
        verdict := CASE WHEN (r->>'needs_confirm')::boolean
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'later_leg', 'leg_id', q, 'rt_id', rt2))
                          AND NOT (r->'consequences' @> '[{"kind": "rt_cancelled"}]')
                        THEN 'ok the later leg on R2 is in the list, the move waits for the token'
                        ELSE 'FAIL later_leg: ' || r::text END;
      ELSIF k = 81 THEN
        verdict := CASE WHEN (r->>'needs_confirm')::boolean
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'local_payroll', 'dl_entry_id', x, 'amount', 50,
                                                                                         'month', to_char(d, 'YYYY-MM')))
                          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'consequences') c WHERE c ? 'day')
                          AND r2->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'local_payroll', 'dl_entry_id', x))
                          AND r2::text NOT LIKE '%"amount"%'
                          AND r->>'confirm_token' = r2->>'confirm_token'
                          AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'planned'
                        THEN 'ok the TOPIKO line with 50 is listed; the dispatcher sees the line, not the amount'
                        ELSE 'FAIL local_payroll: ' || r::text END;
      ELSIF k = 82 THEN
        verdict := CASE WHEN (SELECT deleted_at IS NOT NULL FROM local_moves WHERE id = q)
                          AND (SELECT needs_review AND deleted_at IS NULL FROM dl_entries WHERE id = x)
                          AND (SELECT status FROM ct_round_trips WHERE id = rt1) = 'planned'
                          AND (SELECT end_stop_id FROM v_piece_state WHERE piece_id = p1) = s2b
                        THEN 'ok moved with the token: the loading went, its TOPIKO line waits for accounting (decision 33)'
                        ELSE 'FAIL local_payroll execute: ' || coalesce(r2::text, 'null') END;
      ELSIF k = 83 THEN
        verdict := CASE WHEN r2->'ids' = r->'ids' AND (r2->>'replayed')::boolean AND NOT (r ? 'replayed')
                          AND n = (SELECT count(*) FROM national_orders) + (SELECT count(*) FROM shipments)
                                  + (SELECT count(*) FROM shipment_pieces)
                          AND m = (SELECT count(*) FROM audit_log)
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'plan_request'
                                 AND record_id = '6f1c2a3e-0000-4000-8000-000000000083' AND role = 'warehouse'
                                 AND after_data->>'op' = 'plan_orders_create' AND after_data->'answer'->'ids' = r->'ids') = 1
                        THEN 'ok the same request_id again: the first ids, 0 new rows, no second audit row'
                        ELSE 'FAIL replay orders: ' || coalesce(r2::text, 'null') END;
      ELSIF k = 85 THEN
        verdict := CASE WHEN r2->'ids'->'piece_ids' = r->'ids'->'piece_ids' AND (r2->>'replayed')::boolean
                          AND jsonb_array_length(r->'ids'->'piece_ids') = 2
                          AND n = 3 AND (SELECT count(*) FROM shipment_pieces WHERE shipment_id = x) = 3
                          AND m = (SELECT count(*) FROM audit_log)
                        THEN 'ok the same split again: the first two children, nothing written, no piece_split'
                        ELSE 'FAIL replay split: ' || coalesce(r2::text, 'null') END;
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

  -- ===== SECTION B CASES (B1-B113): cycle, delete, VS, local loading, notices, reads, the week-scenario 19/32/31
  -- (B77), the reviews' cases (B78-B97), request_id of a local loading and a cancel without id (B98-B101), the
  -- vehicle never emptied by plan_rt_update (B102-B113, owner 25/10) =====
  -- Own fixture (rec072TB..., "TEST 072 B ...", TEST-072-B...), undone by the final error of the outer block;
  -- each case undone by its marker. Results go into the outer ok / bad / res. ASCII only.
  -- S (every case): an OWNED v5 cycle made by plan_rt_create (TEST-072-B1 / driver B1, stops A 06-08 and B 12-14
  -- KATHODOS on day D = Athens today + 40), and a national order A -> B of 10 pallets, one piece, one leg A -> B.
  DECLARE
    b_td date := (now() AT TIME ZONE 'Europe/Athens')::date;
    b_d date; b_w date; kb int; b_t0 timestamptz; b_el interval; b_n int;
    h03 timestamptz; h04 timestamptz; h05 timestamptz; h06 timestamptz; h07 timestamptz; h08 timestamptz;
    h09 timestamptz; h10 timestamptz; h11 timestamptz; h12 timestamptz; h13 timestamptz; h14 timestamptz;
    h16 timestamptz; h18 timestamptz; h20 timestamptz;
    b_hub bigint; b_la bigint; b_lb bigint; b_lc bigint; b_lx bigint; b_ln bigint; b_cl bigint; b_pa bigint;
    b_t1 bigint; b_t2 bigint; b_d1 bigint; b_d2 bigint; b_d3 bigint;
    b_vo bigint; b_vld bigint; b_vcd bigint; b_u1 bigint; b_u2 bigint; b_u3 bigint;
    b_no1 bigint; b_no2 bigint; b_no3 bigint; b_sh1 bigint; b_sh2 bigint; b_p1 bigint; b_p2 bigint;
    b_rt1 bigint; b_sa bigint; b_sb bigint; b_lg1 bigint; b_lg2 bigint;
    b_bs1 bigint; b_bs2 bigint; b_bs3 bigint; b_q1 bigint; b_q2 bigint; b_q3 bigint;
    b_x bigint; b_y bigint; b_z bigint; b_e1 bigint; b_e2 bigint; b_e3 bigint;
    b_v jsonb; b_v2 jsonb; b_v3 jsonb; b_tok text; b_txt text;
    b_want text[] := ARRAY[]::text[]
      || ARRAY['ok', 'plan:truck_busy', 'ok', 'ok', 'plan:no_vehicle',
               'ok', 'ok', 'con:rt_partner_rate', 'con:rt_partner_rate', 'plan:no_vehicle',
               'ok', 'ok', 'plan:driver_busy', 'plan:bad_input', 'plan:bad_input',
               'ok', 'plan:truck_busy']   -- B1-B17 (Task B1)
      || ARRAY['ok', 'ok', 'ok', 'ok', 'plan:truck_busy',
               'ok', 'ok', 'plan:rt_cancelled', 'plan:rt_gone', 'plan:payroll_locked',
               'plan:leg_order', 'ok', 'plan:stop_gone', 'plan:stop_order', 'plan:bad_input',
               'plan:no_vehicle']   -- B18-B33 (Task B2)
      || ARRAY['ok', 'plan:need_token', 'ok', 'ok', 'ok',
               'plan:stale_confirm', 'ok', 'ok', 'ok']   -- B34-B42 (Task B3)
      || ARRAY['ok', 'plan:order_not_v5', 'plan:order_gone', 'plan:stale_confirm', 'ok',
               'ok', 'plan:hard_delete', 'plan:need_token', 'plan:bad_input']   -- B43-B51 (Task B4)
      || ARRAY['ok', 'plan:vs_not_bridge', 'plan:order_gone', 'ok', 'ok',
               'ok', 'ok', 'plan:vs_not_bridge', 'ok']   -- B52-B60 (Task B5)
      ;  -- end of b_want
    b_verdict text; b_got text; b_hint text; b_msg text; b_cname text; b_st text;
  BEGIN
    b_d := b_td + 40;
    h03 := (b_d + time '03:00') AT TIME ZONE 'Europe/Athens'; h04 := (b_d + time '04:00') AT TIME ZONE 'Europe/Athens';
    h05 := (b_d + time '05:00') AT TIME ZONE 'Europe/Athens'; h06 := (b_d + time '06:00') AT TIME ZONE 'Europe/Athens';
    h07 := (b_d + time '07:00') AT TIME ZONE 'Europe/Athens'; h08 := (b_d + time '08:00') AT TIME ZONE 'Europe/Athens';
    h09 := (b_d + time '09:00') AT TIME ZONE 'Europe/Athens'; h10 := (b_d + time '10:00') AT TIME ZONE 'Europe/Athens';
    h11 := (b_d + time '11:00') AT TIME ZONE 'Europe/Athens'; h12 := (b_d + time '12:00') AT TIME ZONE 'Europe/Athens';
    h13 := (b_d + time '13:00') AT TIME ZONE 'Europe/Athens'; h14 := (b_d + time '14:00') AT TIME ZONE 'Europe/Athens';
    h16 := (b_d + time '16:00') AT TIME ZONE 'Europe/Athens'; h18 := (b_d + time '18:00') AT TIME ZONE 'Europe/Athens';
    h20 := (b_d + time '20:00') AT TIME ZONE 'Europe/Athens';
    SELECT id INTO b_hub FROM locations WHERE is_hub;
    INSERT INTO locations (legacy_id, name) VALUES ('rec072TBLA', 'TEST 072 B A') RETURNING id INTO b_la;
    INSERT INTO locations (legacy_id, name) VALUES ('rec072TBLB', 'TEST 072 B B') RETURNING id INTO b_lb;
    INSERT INTO locations (legacy_id, name) VALUES ('rec072TBLC', 'TEST 072 B C') RETURNING id INTO b_lc;
    INSERT INTO locations (legacy_id, name) VALUES ('rec072TBLX', 'TEST 072 B abroad') RETURNING id INTO b_lx;
    INSERT INTO locations (legacy_id, name) VALUES ('rec072TBLN', 'TEST 072 B new') RETURNING id INTO b_ln;
    INSERT INTO clients (company_name) VALUES ('TEST 072 B client') RETURNING id INTO b_cl;
    INSERT INTO partners (company_name) VALUES ('TEST 072 B partner') RETURNING id INTO b_pa;
    INSERT INTO trucks (license_plate) VALUES ('TEST-072-B1') RETURNING id INTO b_t1;
    INSERT INTO trucks (license_plate) VALUES ('TEST-072-B2') RETURNING id INTO b_t2;
    INSERT INTO drivers (full_name) VALUES ('TEST 072 B driver 1') RETURNING id INTO b_d1;
    INSERT INTO drivers (full_name) VALUES ('TEST 072 B driver 2') RETURNING id INTO b_d2;
    INSERT INTO drivers (full_name) VALUES ('TEST 072 B local') RETURNING id INTO b_d3;
    -- a VS import: loads abroad, crosses Veroia on D (Cross-dock stop), three Greek deliveries 4 / 6 / 10 on D; the
    -- order's own location columns mirror its stops, as orders_intl.js writes them (decision 35)
    INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                        cross_dock_date, reference, client_id, loading_location_1_id, unloading_location_1_id,
                        unloading_location_2_id, unloading_location_3_id)
    VALUES ('rec072TBO1', 'International', 'Import', 'Pending', true, b_d - 3, b_d, b_d, 'WN072-TEST', b_cl,
            b_lx, b_la, b_lb, b_lc) RETURNING id INTO b_vo;
    INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    VALUES ('rec072TBS0', 'Loading', 1, b_d - 3, b_vo, b_lx, 20) RETURNING id INTO b_vld;
    INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id)
    VALUES ('rec072TBSH', 'Cross-dock', 1, b_d, b_vo, b_hub) RETURNING id INTO b_vcd;
    INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    VALUES ('rec072TBS1', 'Unloading', 1, b_d, b_vo, b_la, 4) RETURNING id INTO b_u1;
    INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    VALUES ('rec072TBS2', 'Unloading', 2, b_d, b_vo, b_lb, 6) RETURNING id INTO b_u2;
    INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
    VALUES ('rec072TBS3', 'Unloading', 3, b_d, b_vo, b_lc, 10) RETURNING id INTO b_u3;

    FOR kb IN 1 .. array_length(b_want, 1) LOOP
      b_verdict := NULL;
      BEGIN
        SET CONSTRAINTS ALL DEFERRED;
        -- S
        b_v := plan_rt_create(jsonb_build_object(
                 'new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t1, 'driver_id', b_d1), 'side', 'KATHODOS',
                 'stops', jsonb_build_array(
                   jsonb_build_object('ref', 'a', 'location_id', b_la, 'side', 'KATHODOS', 'planned_from', h06, 'planned_to', h08),
                   jsonb_build_object('ref', 'b', 'location_id', b_lb, 'side', 'KATHODOS', 'planned_from', h12, 'planned_to', h14))),
               'test:072b', 'dispatcher');
        b_rt1 := (b_v->>'rt_id')::bigint; b_sa := (b_v->'stops'->>'a')::bigint; b_sb := (b_v->'stops'->>'b')::bigint;
        INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec072TBN1', b_cl, 'WN072-TEST', 100)
          RETURNING id INTO b_no1;
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                               deliver_to, created_by)
        VALUES (b_no1, b_la, b_lb, 10, h06, h08, h12, h14, 'test:072b') RETURNING id INTO b_sh1;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (b_sh1, 10, 'test:072b') RETURNING id INTO b_p1;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
        VALUES (b_p1, 1, b_rt1, b_sa, b_sb, 'test:072b') RETURNING id INTO b_lg1;
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        -- the VS bridges (cases that need the VS): one piece per Greek stop, waiting at the hub
        IF kb IN (16, 17, 21, 52, 55, 56, 57, 58, 60, 74) THEN
          INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (b_vo, b_u1, 'test:072b') RETURNING id INTO b_bs1;
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (b_bs1, 4, 'test:072b') RETURNING id INTO b_q1;
          INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (b_vo, b_u2, 'test:072b') RETURNING id INTO b_bs2;
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (b_bs2, 6, 'test:072b') RETURNING id INTO b_q2;
          INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (b_vo, b_u3, 'test:072b') RETURNING id INTO b_bs3;
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (b_bs3, 10, 'test:072b') RETURNING id INTO b_q3;
        END IF;

        IF kb = 1 THEN
          NULL;
        -- ---- Task B1: plan_rt_create and the target new_rt ----
        ELSIF kb IN (2, 3) THEN   -- the same truck Wed 05:00-07:00 while S runs 06:00-14:00
          b_v2 := jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t1, 'driver_id', b_d2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h05, 'planned_to', h07)));
          IF kb = 2 THEN
            PERFORM plan_rt_create(b_v2, 'test:072b', 'dispatcher');
          ELSE
            BEGIN
              PERFORM plan_rt_create(b_v2, 'test:072b', 'dispatcher');
              b_verdict := 'FAIL no refusal';
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              b_verdict := CASE WHEN b_hint = 'plan:truck_busy' AND b_msg LIKE '%' || (b_v->>'code') || '%'
                                THEN 'ok truck_busy names the other cycle' ELSE 'FAIL message ' || b_msg END;
            END;
          END IF;
        ELSIF kb = 4 THEN   -- 14:00 end and 14:00 start do not collide ([) ranges, 071b)
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t1, 'driver_id', b_d2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h14, 'planned_to', h20))), 'test:072b', 'dispatcher');
          PERFORM plan_h_finish();
          b_verdict := CASE WHEN (SELECT start_at = h14 AND end_at = h20 FROM ct_round_trips WHERE id = (b_v2->>'rt_id')::bigint)
                            THEN 'ok 14:00-20:00 after 06:00-14:00 on the same truck' ELSE 'FAIL back to back' END;
        ELSIF kb = 5 THEN
          PERFORM plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'driver_id', b_d2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h16, 'planned_to', h18))), 'test:072b', 'dispatcher');
        ELSIF kb IN (6, 7, 9, 10) THEN   -- PARTNER: with rate, without rate, negative rate, without partner
          b_v2 := plan_rt_create(jsonb_build_object('new_rt',
                    CASE kb WHEN 6 THEN jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa, 'partner_rate', 250)
                            WHEN 7 THEN jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa)
                            WHEN 9 THEN jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa, 'partner_rate', -5)
                            ELSE jsonb_build_object('trip_type', 'PARTNER', 'partner_rate', 250) END,
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h06, 'planned_to', h08))), 'test:072b', 'dispatcher');
          PERFORM plan_h_finish();
          b_x := (b_v2->>'rt_id')::bigint;
          b_verdict := CASE WHEN (SELECT trip_type = 'PARTNER' AND partner_id = b_pa AND truck_id IS NULL AND driver_id IS NULL
                                         AND partner_rate IS NOT DISTINCT FROM CASE kb WHEN 6 THEN 250::numeric END
                                    FROM ct_round_trips WHERE id = b_x)
                              AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = b_x)
                            THEN 'ok partner cycle, rate ' || coalesce((SELECT partner_rate::text FROM ct_round_trips WHERE id = b_x), 'empty')
                                 || ', no payroll line'
                            ELSE 'FAIL partner cycle' END;
        ELSIF kb = 8 THEN   -- a rate on an OWNED cycle: CHECK rt_partner_rate
          PERFORM plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2,
                    'driver_id', b_d2, 'partner_rate', 100),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h06, 'planned_to', h08))), 'test:072b', 'dispatcher');
        ELSIF kb = 11 THEN   -- a cycle of ANODOS only (spec 3, Board: allowed, empty KATHODOS)
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2),
                    'side', 'ANODOS', 'stops', jsonb_build_array(
                      jsonb_build_object('ref', 'h', 'location_id', b_hub, 'side', 'ANODOS', 'planned_from', h16, 'planned_to', h18),
                      jsonb_build_object('ref', 'c', 'location_id', b_lc, 'side', 'ANODOS', 'planned_from', h09, 'planned_to', h10))),
                    'test:072b', 'dispatcher');
          PERFORM plan_h_finish();
          b_x := (b_v2->>'rt_id')::bigint;
          b_verdict := CASE WHEN (SELECT string_agg(side || seq::text || ':' || location_id::text, ',' ORDER BY seq)
                                    FROM rt_stops WHERE rt_id = b_x AND deleted_at IS NULL)
                                 = 'ANODOS1:' || b_lc || ',ANODOS2:' || b_hub
                              AND (SELECT start_at = h09 AND end_at = h18 FROM ct_round_trips WHERE id = b_x)
                              AND (SELECT count(*) FROM dl_entries WHERE rt_id = b_x AND deleted_at IS NULL AND entry_date = b_d) = 1
                            THEN 'ok ANODOS-only cycle, stops numbered by time, one payroll line'
                            ELSE 'FAIL ANODOS-only cycle' END;
        ELSIF kb = 12 THEN   -- a today's (model=1) round trip of the same truck the same day: a warning, not a refusal
          INSERT INTO ct_round_trips (scope, trip_type, truck_id, date_start, status, source, created_by)
          VALUES ('NATL', 'OWNED', b_t2, b_d, 'planned', 'manual', 'test:072b') RETURNING code INTO b_txt;
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h06, 'planned_to', h08))), 'test:072b', 'dispatcher');
          PERFORM plan_h_finish();
          b_verdict := CASE WHEN b_v2->'warnings' = jsonb_build_array(jsonb_build_object('code', 'v1_same_truck', 'rt_code', b_txt))
                            THEN 'ok v1_same_truck warning with the v1 code' ELSE 'FAIL warnings ' || (b_v2->'warnings')::text END;
        ELSIF kb = 13 THEN   -- another truck, the same driver as S, overlapping
          PERFORM plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d1),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h07, 'planned_to', h09))), 'test:072b', 'dispatcher');
        ELSIF kb = 14 THEN
          PERFORM plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2),
                    'stops', '[]'::jsonb), 'test:072b', 'dispatcher');
        ELSIF kb = 15 THEN
          -- coordinator 25/10 (cross-cutting input rule): a partner_rate of NaN (it sorts above every number, so it
          -- passes CHECK rt_partner_rate) or +-Infinity is refused as bad_input 'partner_rate:finite', a stop end of
          -- 'infinity' / '-infinity' as bad_input 'stop.planned:finite', an id of 'NaN' as bad_input (the bigint
          -- cast, 'new_rt or stops'); nothing is written. Then the case itself: an unknown trip_type.
          FOR b_v3 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
              jsonb_build_object('want', 'partner_rate:finite', 'f', h16, 't', h18,
                                 'nr', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa, 'partner_rate', 'NaN')),
              jsonb_build_object('want', 'partner_rate:finite', 'f', h16, 't', h18,
                                 'nr', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa, 'partner_rate', 'Infinity')),
              jsonb_build_object('want', 'partner_rate:finite', 'f', h16, 't', h18,
                                 'nr', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa, 'partner_rate', '-Infinity')),
              jsonb_build_object('want', 'stop.planned:finite', 'f', h16, 't', 'infinity',
                                 'nr', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2)),
              jsonb_build_object('want', 'stop.planned:finite', 'f', '-infinity', 't', h18,
                                 'nr', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2)),
              jsonb_build_object('want', 'stop.planned:finite', 'f', h16, 't', 'infinity',
                                 'nr', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa)),
              jsonb_build_object('want', 'new_rt or stops', 'f', h16, 't', h18,
                                 'nr', jsonb_build_object('trip_type', 'OWNED', 'truck_id', 'NaN', 'driver_id', b_d2))))
          LOOP
            BEGIN
              PERFORM plan_rt_create(jsonb_build_object('new_rt', b_v3->'nr',
                        'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                      'planned_from', b_v3->'f', 'planned_to', b_v3->'t'))),
                      'test:072b', 'dispatcher');
              RAISE EXCEPTION 'FAIL a non-finite input was accepted (%)', b_v3->>'want';
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              IF b_hint IS DISTINCT FROM 'plan:bad_input' OR b_msg NOT LIKE '%' || (b_v3->>'want') || '%' THEN
                RAISE EXCEPTION 'FAIL non-finite probe % got % (%)', b_v3->>'want', coalesce(b_hint, 'no hint'), b_msg;
              END IF;
            END;
          END LOOP;
          IF (SELECT count(*) FROM ct_round_trips WHERE created_by = 'test:072b' AND model = 2) <> 1
             OR (SELECT count(*) FROM rt_stops WHERE created_by = 'test:072b') <> 2 THEN
            RAISE EXCEPTION 'FAIL a create with a non-finite input was written';
          END IF;
          PERFORM plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'X', 'truck_id', b_t2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h06, 'planned_to', h08))), 'test:072b', 'dispatcher');
        ELSIF kb IN (16, 17) THEN   -- the whole VS card on a free truck: 1 call, 1 cycle, 3 legs (section A's put_group)
          b_v2 := plan_put_group(jsonb_build_object('group', jsonb_build_object('order_id', b_vo),
                    'target', jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED',
                                'truck_id', CASE kb WHEN 16 THEN b_t2 ELSE b_t1 END, 'driver_id', b_d2), 'side', 'KATHODOS'),
                    'stops', jsonb_build_array(
                      jsonb_build_object('ref', 'h', 'location_id', b_hub, 'side', 'KATHODOS', 'planned_from', h06, 'planned_to', h07),
                      jsonb_build_object('ref', '1', 'location_id', b_la, 'side', 'KATHODOS', 'planned_from', h09, 'planned_to', h10),
                      jsonb_build_object('ref', '2', 'location_id', b_lb, 'side', 'KATHODOS', 'planned_from', h12, 'planned_to', h13),
                      jsonb_build_object('ref', '3', 'location_id', b_lc, 'side', 'KATHODOS', 'planned_from', h14, 'planned_to', h16))),
                  'test:072b', 'dispatcher');
          b_x := (b_v2->'ids'->>'rt_id')::bigint;
          b_verdict := CASE WHEN (SELECT count(*) FROM ct_round_trips WHERE model = 2 AND created_by = 'test:072b' AND id <> b_rt1) = 1
                              AND (SELECT n_legs FROM v_rt_cycle WHERE rt_id = b_x) = 3
                              AND (SELECT count(*) FROM dl_entries WHERE rt_id = b_x AND deleted_at IS NULL
                                     AND trip_value IS NULL AND advance IS NULL AND expenses IS NULL) = 1
                              AND (SELECT all_planned FROM v_vs_state WHERE order_id = b_vo)
                              AND (SELECT cross_dock_date FROM orders WHERE id = b_vo) = b_d
                            THEN 'ok VS of 3 deliveries on a free truck: 1 cycle, 3 legs, 1 empty payroll line, day kept'
                            ELSE 'FAIL put_group new_rt' END;
        -- ---- Task B2: plan_rt_update ----
        ELSIF kb IN (18, 29) THEN   -- dry runs write nothing; a broken rule is SHOWN, not raised (Figma D4)
          b_v2 := plan_rt_update(CASE kb WHEN 18
                    THEN jsonb_build_object('rt_id', b_rt1, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day'), 'dry_run', true)
                    ELSE jsonb_build_object('rt_id', b_rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', b_sb,
                           'planned_from', h03, 'planned_to', h04)), 'dry_run', true) END,
                  'test:072b-dry', 'dispatcher');
          b_verdict := CASE WHEN (SELECT start_at = h06 AND end_at = h14 AND date_start = b_d FROM ct_round_trips WHERE id = b_rt1)
                              AND (SELECT planned_from = h12 FROM rt_stops WHERE id = b_sb)
                              AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072b-dry') = 0
                              AND (SELECT entry_date = b_d FROM dl_entries WHERE rt_id = b_rt1 AND deleted_at IS NULL)
                              AND (b_v2->>'dry_run')::boolean
                              AND CASE kb WHEN 18
                                    THEN b_v2->'preview'->'after'->>'date_start' = (b_d + 1)::text
                                         AND b_v2->'preview'->'conflict' = 'null'::jsonb
                                    ELSE b_v2->'preview'->'conflict'->>'code' = 'leg_order' END
                            THEN 'ok dry run: preview ' || (b_v2->'preview'->'conflict')::text || ', 0 rows written'
                            ELSE 'FAIL dry run ' || b_v2::text END;
        ELSIF kb = 19 THEN   -- "change date" +1 day on KATHODOS: window, days and the payroll day follow
          b_v2 := plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day')),
                  'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT start_at = h06 + interval '1 day' AND end_at = h14 + interval '1 day'
                                         AND date_start = b_d + 1 AND date_end = b_d + 1 FROM ct_round_trips WHERE id = b_rt1)
                              AND (SELECT entry_date = b_d + 1 AND date_end = b_d + 1 FROM dl_entries
                                    WHERE rt_id = b_rt1 AND deleted_at IS NULL)
                              AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072b' AND table_name = 'rt_stops'
                                     AND action = 'update') = 2
                            THEN 'ok +1 day: window, days and payroll day follow' ELSE 'FAIL +1 day' END;
        ELSIF kb = 20 THEN   -- the local loading follows its stop to the new day, with its TOPIKO line
          b_v2 := plan_local_loading(jsonb_build_object('request_id', gen_random_uuid()) || (jsonb_build_object('rt_stop_id', b_sa, 'driver_id', b_d3, 'truck_id', b_t2)), 'test:072b', 'dispatcher');
          b_x := (b_v2->'ids'->>'local_move_id')::bigint;
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day')),
                  'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT move_date FROM local_moves WHERE id = b_x) = b_d + 1
                              AND (SELECT count(*) FROM dl_entries WHERE driver_id = b_d3 AND entry_date = b_d + 1
                                     AND deleted_at IS NULL AND local_move_id = b_x) = 1
                              AND (SELECT count(*) FROM dl_entries WHERE driver_id = b_d3 AND entry_date = b_d AND deleted_at IS NULL) = 0
                            THEN 'ok local loading and its TOPIKO line moved to D+1' ELSE 'FAIL local loading did not follow' END;
        ELSIF kb = 21 THEN   -- the cycle that carries the VS's first piece moves: the international day follows
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2),
                    'stops', jsonb_build_array(
                      jsonb_build_object('ref', 'h', 'location_id', b_hub, 'side', 'KATHODOS', 'planned_from', h06, 'planned_to', h07),
                      jsonb_build_object('ref', 'u', 'location_id', b_la, 'side', 'KATHODOS', 'planned_from', h09, 'planned_to', h10))),
                  'test:072b', 'dispatcher');
          b_x := (b_v2->>'rt_id')::bigint;
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
          VALUES (b_q1, 1, b_x, (b_v2->'stops'->>'h')::bigint, (b_v2->'stops'->>'u')::bigint, 'test:072b');
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_x, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day')),
                  'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT cross_dock_date FROM orders WHERE id = b_vo) = b_d + 1
                              AND (SELECT count(*) FROM plan_notices WHERE order_id = b_vo AND to_desk = 'intl'
                                     AND kind = 'vs_day_changed') = 1
                              AND (SELECT datetime FROM order_stops WHERE id = b_vcd) = b_d + 1
                              AND current_setting('plan.writer', true) = 'natl'
                            THEN 'ok VS day follows the cycle: orders, Cross-dock stop (069), one notice, writer natl'
                            ELSE 'FAIL VS day did not follow' END;
        ELSIF kb = 22 THEN   -- the new truck is busy in another v5 cycle
          PERFORM plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h07, 'planned_to', h09))), 'test:072b', 'dispatcher');
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'set', jsonb_build_object('truck_id', b_t2)), 'test:072b', 'dispatcher');
        ELSIF kb = 23 THEN   -- OWNED -> PARTNER: the empty payroll line goes (011), no needs_review
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'set', jsonb_build_object('trip_type', 'PARTNER',
                    'partner_id', b_pa, 'partner_rate', 300)), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT trip_type = 'PARTNER' AND truck_id IS NULL AND driver_id IS NULL AND partner_id = b_pa
                                         AND partner_rate = 300 FROM ct_round_trips WHERE id = b_rt1)
                              AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = b_rt1 AND (deleted_at IS NULL OR needs_review))
                            THEN 'ok OWNED -> PARTNER, empty payroll line gone' ELSE 'FAIL OWNED -> PARTNER' END;
        ELSIF kb = 24 THEN   -- PARTNER -> OWNED: rate and partner cleared, one payroll line for the new driver
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa,
                    'partner_rate', 200), 'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc,
                    'side', 'KATHODOS', 'planned_from', h16, 'planned_to', h18))), 'test:072b', 'dispatcher');
          b_x := (b_v2->>'rt_id')::bigint;
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_x, 'set', jsonb_build_object('trip_type', 'OWNED',
                    'truck_id', b_t2, 'driver_id', b_d2)), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT trip_type = 'OWNED' AND partner_id IS NULL AND partner_rate IS NULL AND truck_id = b_t2
                                    FROM ct_round_trips WHERE id = b_x)
                              AND (SELECT count(*) FROM dl_entries WHERE rt_id = b_x AND deleted_at IS NULL AND driver_id = b_d2) = 1
                            THEN 'ok PARTNER -> OWNED with one payroll line' ELSE 'FAIL PARTNER -> OWNED' END;
        ELSIF kb = 25 THEN
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc, 'side', 'KATHODOS',
                                                                  'planned_from', h16, 'planned_to', h18))), 'test:072b', 'dispatcher');
          UPDATE ct_round_trips SET status = 'cancelled' WHERE id = (b_v2->>'rt_id')::bigint;
          PERFORM plan_rt_update(jsonb_build_object('rt_id', (b_v2->>'rt_id')::bigint, 'set', jsonb_build_object('driver_id', b_d2)),
                  'test:072b', 'dispatcher');
        ELSIF kb = 26 THEN
          PERFORM plan_rt_update(jsonb_build_object('rt_id', -1, 'set', jsonb_build_object('driver_id', b_d2)), 'test:072b', 'dispatcher');
        ELSIF kb = 27 THEN   -- a driver change after amounts: through "clear assignment", never needs_review
          UPDATE dl_entries SET trip_value = 230 WHERE rt_id = b_rt1 AND deleted_at IS NULL;
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'set', jsonb_build_object('driver_id', b_d2)), 'test:072b', 'dispatcher');
        ELSIF kb = 28 THEN   -- B moved before A: the base renumbers, the leg would run backwards
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', b_sb,
                    'planned_from', h03, 'planned_to', h04))), 'test:072b', 'dispatcher');
        ELSIF kb = 30 THEN
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', -1,
                    'planned_from', h03, 'planned_to', h04))), 'test:072b', 'dispatcher');
        ELSIF kb = 31 THEN   -- KATHODOS +1 day past a declared ANODOS stop of day D: time and side disagree
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (b_rt1, 3, b_lc, 'ANODOS', h16, h18, 'test:072b');
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '1 day')),
                  'test:072b', 'dispatcher');
        ELSIF kb = 32 THEN
          -- coordinator 25/10 (cross-cutting input rule): a partner_rate of NaN / +-Infinity, a stop end of 'infinity' /
          -- '-infinity' and a shift delta of 'infinity' / '-infinity' are refused as bad_input '<field>:finite', in a
          -- dry run too (a malformed body is raised, not previewed). Then the case itself: an unknown side.
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa,
                    'partner_rate', 200), 'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc,
                    'side', 'KATHODOS', 'planned_from', h16, 'planned_to', h18))), 'test:072b', 'dispatcher');
          b_x := (b_v2->>'rt_id')::bigint;
          FOR b_v3 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
              jsonb_build_object('want', 'partner_rate:finite', 'p', jsonb_build_object('rt_id', b_x,
                                 'set', jsonb_build_object('partner_rate', 'NaN'))),
              jsonb_build_object('want', 'partner_rate:finite', 'p', jsonb_build_object('rt_id', b_x,
                                 'set', jsonb_build_object('partner_rate', 'Infinity'))),
              jsonb_build_object('want', 'partner_rate:finite', 'p', jsonb_build_object('rt_id', b_x,
                                 'set', jsonb_build_object('partner_rate', '-Infinity'))),
              jsonb_build_object('want', 'partner_rate:finite', 'p', jsonb_build_object('rt_id', b_x, 'dry_run', true,
                                 'set', jsonb_build_object('partner_rate', 'NaN'))),
              jsonb_build_object('want', 'stop.planned:finite', 'p', jsonb_build_object('rt_id', b_rt1,
                                 'stops', jsonb_build_array(jsonb_build_object('stop_id', b_sa, 'planned_from', h06,
                                                                               'planned_to', 'infinity')))),
              jsonb_build_object('want', 'stop.planned:finite', 'p', jsonb_build_object('rt_id', b_rt1,
                                 'stops', jsonb_build_array(jsonb_build_object('stop_id', b_sa, 'planned_from', '-infinity',
                                                                               'planned_to', h08)))),
              jsonb_build_object('want', 'stop.planned:finite', 'p', jsonb_build_object('rt_id', b_rt1, 'dry_run', true,
                                 'stops', jsonb_build_array(jsonb_build_object('stop_id', b_sa, 'planned_from', h06,
                                                                               'planned_to', 'infinity')))),
              jsonb_build_object('want', 'shift.delta:finite', 'p', jsonb_build_object('rt_id', b_rt1,
                                 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', 'infinity'))),
              jsonb_build_object('want', 'shift.delta:finite', 'p', jsonb_build_object('rt_id', b_rt1,
                                 'shift', jsonb_build_object('side', 'KATHODOS', 'delta', '-infinity')))))
          LOOP
            BEGIN
              PERFORM plan_rt_update(b_v3->'p', 'test:072b', 'dispatcher');
              RAISE EXCEPTION 'FAIL a non-finite input was accepted (%)', b_v3->>'want';
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              IF b_hint IS DISTINCT FROM 'plan:bad_input' OR b_msg NOT LIKE '%' || (b_v3->>'want') || '%' THEN
                RAISE EXCEPTION 'FAIL non-finite probe % got % (%)', b_v3->>'want', coalesce(b_hint, 'no hint'), b_msg;
              END IF;
            END;
          END LOOP;
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'shift', jsonb_build_object('side', 'X', 'delta', '1 day')),
                  'test:072b', 'dispatcher');
        ELSIF kb = 33 THEN
          PERFORM plan_rt_update(jsonb_build_object('rt_id', b_rt1, 'set', jsonb_build_object('trip_type', 'PARTNER')),
                  'test:072b', 'dispatcher');
        -- ---- Task B3: plan_rt_clear ----
        ELSIF kb = 34 THEN   -- clear with an empty payroll line: no question, the line goes (011), legs stay
          -- coordinator 25/10 (cross-cutting input rule): an rt_id of NaN / +-Infinity is refused as bad_input 'rt_id',
          -- in a dry run too (a malformed body is raised, not previewed); each probe is undone, nothing is cleared
          FOR b_v3 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
              jsonb_build_object('rt_id', 'NaN'), jsonb_build_object('rt_id', 'Infinity'),
              jsonb_build_object('rt_id', '-Infinity'), jsonb_build_object('rt_id', 'NaN', 'dry_run', true)))
          LOOP
            BEGIN
              PERFORM plan_rt_clear(b_v3, 'test:072b', 'dispatcher');
              RAISE EXCEPTION 'FAIL a non-finite rt_id was accepted (%)', b_v3::text;
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              IF b_hint IS DISTINCT FROM 'plan:bad_input' OR b_msg NOT LIKE '%bad_input:rt_id' THEN
                RAISE EXCEPTION 'FAIL non-finite rt_id probe % got % (%)', b_v3::text, coalesce(b_hint, 'no hint'), b_msg;
              END IF;
            END;
          END LOOP;
          b_v2 := plan_rt_clear(jsonb_build_object('rt_id', b_rt1), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT trip_type = 'OWNED' AND truck_id IS NULL AND driver_id IS NULL AND trailer_id IS NULL
                                    FROM ct_round_trips WHERE id = b_rt1)
                              AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = b_rt1 AND (deleted_at IS NULL OR needs_review))
                              AND (SELECT n_legs FROM v_rt_cycle WHERE rt_id = b_rt1) = 1
                              AND (SELECT bool_and(NOT has_vehicle) FROM v_rt_stop_state WHERE rt_id = b_rt1)
                            THEN 'ok cleared without a token: vehicle off, empty payroll line gone, legs stay to assign'
                            ELSE 'FAIL clear' END;
        ELSIF kb BETWEEN 35 AND 41 THEN   -- clear with documents: payroll with an amount, its month, costs
          UPDATE dl_entries SET trip_value = 230 WHERE rt_id = b_rt1 AND deleted_at IS NULL;
          IF kb = 40 THEN
            INSERT INTO dl_entries (driver_id, entry_type, entry_date, amount, source, created_by)
            VALUES (b_d1, 'payment_bank', b_d + 3, 500, 'manual', 'test:072b');
          ELSIF kb = 41 THEN
            UPDATE dl_entries SET trip_value = NULL WHERE rt_id = b_rt1 AND deleted_at IS NULL;
            INSERT INTO ct_cost_lines (rt_id, category, net, vat, pay_source, alloc_status, created_by)
            SELECT b_rt1, 'dkv', 10, 2.4, 'DKV', 'allocated', 'test:072b' FROM generate_series(1, 3);
          END IF;
          IF kb = 35 THEN
            PERFORM plan_rt_clear(jsonb_build_object('rt_id', b_rt1), 'test:072b', 'dispatcher');
          ELSE
            b_v := plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'dry_run', true), 'test:072b', 'owner');
            b_v2 := plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'dry_run', true), 'test:072b', 'dispatcher');
            IF kb = 36 THEN
              b_verdict := CASE WHEN (b_v->>'needs_confirm')::boolean AND b_v->>'confirm_token' IS NOT NULL
                                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(b_v->'consequences') c
                                               WHERE c->>'kind' = 'payroll_amount' AND (c->>'amount')::numeric = 230)
                                  AND (SELECT truck_id = b_t1 FROM ct_round_trips WHERE id = b_rt1)
                                THEN 'ok owner dry run: payroll 230 in the list, token, nothing changed'
                                ELSE 'FAIL owner dry run ' || b_v::text END;
            ELSIF kb = 37 THEN
              b_verdict := CASE WHEN position('"amount"' IN b_v2::text) = 0
                                  AND b_v2->>'confirm_token' = b_v->>'confirm_token'
                                  AND jsonb_array_length(b_v2->'consequences') = jsonb_array_length(b_v->'consequences')
                                THEN 'ok dispatcher: the same list and token, no amount'
                                ELSE 'FAIL dispatcher list ' || b_v2::text END;
            ELSIF kb = 38 THEN
              PERFORM plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'confirm_token', b_v2->>'confirm_token'), 'test:072b', 'dispatcher');
              b_verdict := CASE WHEN NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = b_rt1 AND (deleted_at IS NULL OR needs_review))
                                  AND (SELECT count(*) FROM dl_entries WHERE rt_id = b_rt1 AND trip_value = 230
                                         AND deleted_reason LIKE '% (test:072b)') = 1
                                  AND (SELECT truck_id IS NULL AND driver_id IS NULL FROM ct_round_trips WHERE id = b_rt1)
                                THEN 'ok with the token: the 230 line deleted by name, 0 needs_review'
                                ELSE 'FAIL clear with amount: needs_review '
                                     || (SELECT count(*) FROM dl_entries WHERE rt_id = b_rt1 AND needs_review) END;
            ELSIF kb = 39 THEN
              UPDATE dl_entries SET trip_value = 250 WHERE rt_id = b_rt1 AND deleted_at IS NULL;
              PERFORM plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'confirm_token', b_v2->>'confirm_token'), 'test:072b', 'dispatcher');
            ELSIF kb = 40 THEN
              -- decision 10: the line's month, no "paid" even with a payment of the driver after the cycle; decision 41:
              -- the base cuts the amount for every role outside owner/accountant (PLAN_PERMS decides who may clear)
              b_v3 := plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'dry_run', true), 'test:072b', 'warehouse');
              b_verdict := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(b_v2->'consequences') c
                                              WHERE c->>'kind' = 'payroll_amount' AND NOT (c ? 'amount')
                                                AND c->>'month' = (SELECT to_char(entry_date, 'YYYY-MM') FROM dl_entries
                                                                    WHERE rt_id = b_rt1 AND deleted_at IS NULL AND trip_value = 230))
                                  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b_v->'consequences') c WHERE c ? 'paid' OR c ? 'paid_week')
                                  AND position('"amount"' IN b_v3::text) = 0
                                  AND position('"amount"' IN plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'dry_run', true),
                                                                           'test:072b', 'management')::text) = 0
                                THEN 'ok the payroll line with its month, never paid; no amount for dispatcher, management, warehouse'
                                ELSE 'FAIL month ' || b_v2::text END;
            ELSE   -- 41 (costs)
              PERFORM plan_rt_clear(jsonb_build_object('rt_id', b_rt1, 'confirm_token', b_v2->>'confirm_token'), 'test:072b', 'dispatcher');
              b_verdict := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(b_v2->'consequences') c
                                              WHERE c->>'kind' = 'costs' AND (c->>'count')::int = 3 AND NOT (c ? 'amount'))
                                  AND (SELECT count(*) FROM ct_cost_lines WHERE rt_id = b_rt1) = 3
                                  AND (SELECT count(*) FROM plan_notices WHERE rt_id = b_rt1 AND to_desk = 'natl'
                                         AND kind = 'costs_without_rt') = 1
                                THEN 'ok costs listed (3, no amount), kept on the cycle, one notice' ELSE 'FAIL costs' END;
            END IF;
          END IF;
        ELSIF kb = 42 THEN   -- clear on PARTNER: OWNED with nothing (partner_needs_partner holds)
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', b_pa,
                    'partner_rate', 200), 'stops', jsonb_build_array(jsonb_build_object('ref', 'x', 'location_id', b_lc,
                    'side', 'KATHODOS', 'planned_from', h16, 'planned_to', h18))), 'test:072b', 'dispatcher');
          b_x := (b_v2->>'rt_id')::bigint;
          PERFORM plan_rt_clear(jsonb_build_object('rt_id', b_x), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT trip_type = 'OWNED' AND partner_id IS NULL AND partner_rate IS NULL FROM ct_round_trips WHERE id = b_x)
                            THEN 'ok PARTNER cleared to OWNED without anything' ELSE 'FAIL PARTNER clear' END;
        -- ---- Task B4: plan_delete ----
        ELSIF kb IN (43, 46, 50, 51) THEN   -- delete: list, token, the whole chain soft, the empty cycle cancelled
          IF kb IN (46, 50) THEN UPDATE dl_entries SET trip_value = 230 WHERE rt_id = b_rt1 AND deleted_at IS NULL; END IF;
          b_v2 := plan_delete(jsonb_build_object('nat_order_id', b_no1, 'dry_run', true), 'test:072b', 'owner');
          IF kb = 46 THEN UPDATE dl_entries SET trip_value = 250 WHERE rt_id = b_rt1 AND deleted_at IS NULL; END IF;
          PERFORM plan_delete(jsonb_build_object('nat_order_id', b_no1, 'reason', CASE WHEN kb = 51 THEN '' ELSE 'TEST 072 reason' END)
                    || CASE WHEN kb IN (43, 46) THEN jsonb_build_object('confirm_token', b_v2->>'confirm_token') ELSE '{}'::jsonb END,
                  'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (b_v2->>'needs_confirm')::boolean
                              AND EXISTS (SELECT 1 FROM jsonb_array_elements(b_v2->'consequences') c WHERE c->>'kind' = 'rt_cancelled')
                              AND (SELECT deleted_at IS NOT NULL FROM national_orders WHERE id = b_no1)
                              AND (SELECT deleted_reason = 'TEST 072 reason' AND deleted_by = 'test:072b' FROM shipments WHERE id = b_sh1)
                              AND (SELECT deleted_reason = 'TEST 072 reason' AND deleted_by = 'test:072b' FROM shipment_pieces WHERE id = b_p1)
                              AND (SELECT deleted_at IS NOT NULL AND deleted_by = 'test:072b' FROM piece_legs WHERE id = b_lg1)
                              AND NOT EXISTS (SELECT 1 FROM rt_stops WHERE rt_id = b_rt1 AND deleted_at IS NULL)
                              AND (SELECT status FROM ct_round_trips WHERE id = b_rt1) = 'cancelled'
                              AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = b_rt1 AND (deleted_at IS NULL OR needs_review))
                              AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072b' AND role = 'dispatcher'
                                     AND table_name = 'national_orders' AND record_id = 'rec072TBN1') = 1
                            THEN 'ok delete: list + token, every row soft with reason and actor, cycle cancelled, 0 needs_review'
                            ELSE 'FAIL delete' END;
        ELSIF kb = 44 THEN
          -- coordinator 25/10 (cross-cutting input rule): a nat_order_id of NaN / +-Infinity (or past bigint) is refused
          -- as bad_input 'nat_order_id', in a dry run too; each probe is undone, nothing is deleted
          FOR b_v3 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
              jsonb_build_object('nat_order_id', 'NaN', 'reason', 'TEST 072 reason'),
              jsonb_build_object('nat_order_id', 'Infinity', 'reason', 'TEST 072 reason'),
              jsonb_build_object('nat_order_id', '-Infinity', 'reason', 'TEST 072 reason'),
              jsonb_build_object('nat_order_id', 1e400::numeric, 'reason', 'TEST 072 reason'),
              jsonb_build_object('nat_order_id', 'NaN', 'dry_run', true)))
          LOOP
            BEGIN
              PERFORM plan_delete(b_v3, 'test:072b', 'dispatcher');
              RAISE EXCEPTION 'FAIL a non-finite nat_order_id was accepted (%)', b_v3::text;
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              IF b_hint IS DISTINCT FROM 'plan:bad_input' OR b_msg NOT LIKE '%bad_input:nat_order_id' THEN
                RAISE EXCEPTION 'FAIL non-finite nat_order_id probe % got % (%)', b_v3::text, coalesce(b_hint, 'no hint'), b_msg;
              END IF;
            END;
          END LOOP;
          INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec072TBN9', b_cl, 'WN072-TEST', 50)
            RETURNING id INTO b_x;
          PERFORM plan_delete(jsonb_build_object('nat_order_id', b_x, 'dry_run', true), 'test:072b', 'dispatcher');
        ELSIF kb = 45 THEN
          UPDATE national_orders SET deleted_at = now() WHERE id = b_no1;
          PERFORM plan_delete(jsonb_build_object('nat_order_id', b_no1, 'dry_run', true), 'test:072b', 'dispatcher');
        ELSIF kb = 47 THEN   -- an invoiced order is in the list; its invoice number only for owner / accountant
          UPDATE national_orders SET invoiced = true, invoice_number = 'TEST-072-TPY' WHERE id = b_no1;
          b_v := plan_delete(jsonb_build_object('nat_order_id', b_no1, 'dry_run', true), 'test:072b', 'owner');
          b_v2 := plan_delete(jsonb_build_object('nat_order_id', b_no1, 'dry_run', true), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(b_v->'consequences') c
                                          WHERE c->>'kind' = 'invoiced' AND c->>'invoice_number' = 'TEST-072-TPY')
                              AND EXISTS (SELECT 1 FROM jsonb_array_elements(b_v2->'consequences') c
                                           WHERE c->>'kind' = 'invoiced' AND NOT (c ? 'invoice_number'))
                              AND b_v->>'confirm_token' = b_v2->>'confirm_token'
                            THEN 'ok invoiced in the list; number for the owner only' ELSE 'FAIL invoiced' END;
        ELSIF kb IN (48, 49) THEN   -- a second order on the same cycle: the cycle stays, only this order goes
          INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec072TBN2', b_cl, 'WN072-TEST', 60)
            RETURNING id INTO b_no2;
          INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                                 deliver_to, created_by)
          VALUES (b_no2, b_la, b_lb, 5, h06, h08, h12, h14, 'test:072b') RETURNING id INTO b_sh2;
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (b_sh2, 5, 'test:072b') RETURNING id INTO b_p2;
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
          VALUES (b_p2, 1, b_rt1, b_sa, b_sb, 'test:072b') RETURNING id INTO b_lg2;
          b_v2 := plan_delete(jsonb_build_object('nat_order_id', b_no1, 'dry_run', true), 'test:072b', 'dispatcher');
          PERFORM plan_delete(jsonb_build_object('nat_order_id', b_no1, 'reason', 'TEST 072 reason'), 'test:072b', 'dispatcher');
          IF kb = 49 THEN   -- the net under every path: a hard DELETE is refused (071 hard_delete)
            DELETE FROM piece_legs WHERE id = b_lg1;
          END IF;
          b_verdict := CASE WHEN NOT (b_v2->>'needs_confirm')::boolean
                              AND (SELECT status FROM ct_round_trips WHERE id = b_rt1) = 'planned'
                              AND (SELECT deleted_at IS NULL FROM piece_legs WHERE id = b_lg2)
                              AND (SELECT deleted_at IS NOT NULL FROM piece_legs WHERE id = b_lg1)
                              AND (SELECT count(*) FROM rt_stops WHERE rt_id = b_rt1 AND deleted_at IS NULL) = 2
                              AND (SELECT count(*) FROM dl_entries WHERE rt_id = b_rt1 AND deleted_at IS NULL) = 1
                            THEN 'ok the shared cycle stays planned with the other order' ELSE 'FAIL shared cycle' END;
        -- ---- Task B5: plan_vs_set_day, plan_vs_set_place ----
        ELSIF kb IN (52, 55) THEN   -- the national desk gives the VS day (one field, 069 moves the Cross-dock stop)
          b_v2 := plan_vs_set_day(jsonb_build_object('order_id', b_vo, 'day', CASE kb WHEN 52 THEN b_d + 1 ELSE b_d END),
                  'test:072b', 'dispatcher');
          b_verdict := CASE WHEN kb = 52
                              AND (SELECT cross_dock_date FROM orders WHERE id = b_vo) = b_d + 1
                              AND (SELECT datetime FROM order_stops WHERE id = b_vcd) = b_d + 1
                              AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072b' AND table_name = 'orders'
                                     AND record_id IN (b_vo::text, 'rec072TBO1')) = 1
                              AND jsonb_array_length(b_v2->'notice_ids') = 1
                              AND (SELECT kind = 'vs_day_changed' AND to_desk = 'intl' AND order_id = b_vo FROM plan_notices
                                    WHERE id = (b_v2->'notice_ids'->>0)::bigint)
                              AND current_setting('plan.writer', true) = 'natl'
                              AND b_v2->'warnings' = '[]'::jsonb
                            THEN 'ok VS day D -> D+1: one orders row, its audit, one notice, Cross-dock stop moved'
                            WHEN kb = 55 AND b_v2->'notice_ids' = '[]'::jsonb
                              AND NOT EXISTS (SELECT 1 FROM plan_notices WHERE order_id = b_vo)
                            THEN 'ok the same day again: nothing written, nobody told'
                            ELSE 'FAIL VS day ' || b_v2::text END;
        ELSIF kb = 53 THEN
          PERFORM plan_vs_set_day(jsonb_build_object('order_id', b_vo, 'day', b_d + 1), 'test:072b', 'dispatcher');
        ELSIF kb = 54 THEN
          -- coordinator 25/10 (cross-cutting input rule): an order_id of NaN / +-Infinity (or past bigint) is refused as
          -- bad_input 'order_id or day', a day of 'infinity' / '-infinity' as bad_input 'day:finite'; each probe is undone
          FOR b_v3 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
              jsonb_build_object('order_id', 'NaN', 'day', b_d + 1),
              jsonb_build_object('order_id', 'Infinity', 'day', b_d + 1),
              jsonb_build_object('order_id', '-Infinity', 'day', b_d + 1),
              jsonb_build_object('order_id', 1e400::numeric, 'day', b_d + 1),
              jsonb_build_object('order_id', b_vo, 'day', 'infinity'),
              jsonb_build_object('order_id', b_vo, 'day', '-infinity')))
          LOOP
            BEGIN
              PERFORM plan_vs_set_day(b_v3, 'test:072b', 'dispatcher');
              RAISE EXCEPTION 'FAIL a non-finite VS day input was accepted (%)', b_v3::text;
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              IF b_hint IS DISTINCT FROM 'plan:bad_input'
                 OR b_msg NOT LIKE (CASE WHEN b_v3->>'day' LIKE '%infinity' THEN '%bad_input:day:finite'
                                         ELSE '%bad_input:order_id or day' END) THEN
                RAISE EXCEPTION 'FAIL non-finite VS day probe % got % (%)', b_v3::text, coalesce(b_hint, 'no hint'), b_msg;
              END IF;
            END;
          END LOOP;
          PERFORM plan_vs_set_day(jsonb_build_object('order_id', -1, 'day', b_d + 1), 'test:072b', 'dispatcher');
        ELSIF kb BETWEEN 56 AND 58 THEN   -- the VS destination after Veroia moves (K-06: national stops follow)
          IF kb IN (57, 58) THEN
            b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2),
                      'stops', jsonb_build_array(
                        jsonb_build_object('ref', 'h', 'location_id', b_hub, 'side', 'KATHODOS', 'planned_from', h06, 'planned_to', h07),
                        jsonb_build_object('ref', 'u', 'location_id', b_la, 'side', 'KATHODOS', 'planned_from', h09, 'planned_to', h10))),
                    'test:072b', 'dispatcher');
            b_x := (b_v2->>'rt_id')::bigint; b_y := (b_v2->'stops'->>'u')::bigint;
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
            VALUES (b_q1, 1, b_x, (b_v2->'stops'->>'h')::bigint, b_y, 'test:072b') RETURNING id INTO b_lg2;
            IF kb = 58 THEN   -- a national order of another client ends at the same stop
              INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec072TBN2', b_cl, 'WN072-TEST', 60)
                RETURNING id INTO b_no2;
              INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                                     deliver_from, deliver_to, created_by)
              VALUES (b_no2, b_hub, b_la, 5, h06, h07, h09, h10, 'test:072b') RETURNING id INTO b_sh2;
              INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (b_sh2, 5, 'test:072b') RETURNING id INTO b_p2;
              INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
              VALUES (b_p2, 1, b_x, (b_v2->'stops'->>'h')::bigint, b_y, 'test:072b') RETURNING id INTO b_z;
            END IF;
            SET CONSTRAINTS ALL IMMEDIATE;
            SET CONSTRAINTS ALL DEFERRED;
          END IF;
          b_v3 := plan_vs_set_place(jsonb_build_object('order_stop_id', b_u1, 'location_id', b_ln), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN (SELECT location_id FROM order_stops WHERE id = b_u1) = b_ln
                              AND (SELECT nat_to_location_id FROM v_shipments WHERE shipment_id = b_bs1) = b_ln
                              AND plan_shipment_problem(b_bs1) IS NULL
                              AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072b' AND table_name = 'order_stops'
                                     AND record_id = 'rec072TBS1') = 1
                              AND (SELECT count(*) FROM plan_notices WHERE order_id = b_vo AND kind = 'vs_place_changed') = 1
                              AND (SELECT message FROM plan_notices WHERE order_id = b_vo AND kind = 'vs_place_changed') LIKE '%WN072-TEST%'
                              AND (SELECT unloading_location_1_id FROM orders WHERE id = b_vo) = b_ln
                              AND (SELECT unloading_location_2_id FROM orders WHERE id = b_vo) = b_lb
                              AND CASE kb
                                    WHEN 56 THEN true
                                    WHEN 57 THEN (SELECT location_id FROM rt_stops WHERE id = b_y) = b_ln
                                                 AND (SELECT deleted_at IS NULL FROM piece_legs WHERE id = b_lg2)
                                    ELSE (SELECT location_id FROM rt_stops WHERE id = b_y) = b_la
                                         AND (SELECT deleted_at IS NOT NULL FROM piece_legs WHERE id = b_lg2)
                                         AND (SELECT deleted_at IS NULL FROM piece_legs WHERE id = b_z)
                                         AND (SELECT count(*) FROM piece_legs l JOIN rt_stops s ON s.id = l.drop_stop_id
                                               WHERE l.piece_id = b_q1 AND l.deleted_at IS NULL AND l.leg_no = 1
                                                 AND s.location_id = b_ln AND s.deleted_at IS NULL) = 1
                                         AND plan_shipment_problem(b_sh2) IS NULL END
                            THEN 'ok VS place moved: order stop, the order column, national stop and leg follow in one transaction'
                            ELSE 'FAIL VS place ' || b_v3::text END;
        ELSIF kb = 59 THEN   -- the loading stop abroad has no bridge
          -- coordinator 25/10 (cross-cutting input rule): an order_stop_id or location_id of NaN / +-Infinity (or past
          -- bigint) is refused as bad_input 'order_stop_id or location_id'; each probe is undone
          FOR b_v3 IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
              jsonb_build_object('order_stop_id', 'NaN', 'location_id', b_ln),
              jsonb_build_object('order_stop_id', 'Infinity', 'location_id', b_ln),
              jsonb_build_object('order_stop_id', '-Infinity', 'location_id', b_ln),
              jsonb_build_object('order_stop_id', 1e400::numeric, 'location_id', b_ln),
              jsonb_build_object('order_stop_id', b_vld, 'location_id', 'NaN'),
              jsonb_build_object('order_stop_id', b_vld, 'location_id', '-Infinity')))
          LOOP
            BEGIN
              PERFORM plan_vs_set_place(b_v3, 'test:072b', 'dispatcher');
              RAISE EXCEPTION 'FAIL a non-finite VS place input was accepted (%)', b_v3::text;
            EXCEPTION WHEN check_violation THEN
              GET STACKED DIAGNOSTICS b_msg = MESSAGE_TEXT, b_hint = PG_EXCEPTION_HINT;
              IF b_hint IS DISTINCT FROM 'plan:bad_input' OR b_msg NOT LIKE '%bad_input:order_stop_id or location_id' THEN
                RAISE EXCEPTION 'FAIL non-finite VS place probe % got % (%)', b_v3::text, coalesce(b_hint, 'no hint'), b_msg;
              END IF;
            END;
          END LOOP;
          PERFORM plan_vs_set_place(jsonb_build_object('order_stop_id', b_vld, 'location_id', b_ln), 'test:072b', 'dispatcher');
        ELSIF kb = 60 THEN   -- the national desk sets another day while the VS rides a truck of day D: said, not hidden
          b_v2 := plan_rt_create(jsonb_build_object('new_rt', jsonb_build_object('trip_type', 'OWNED', 'truck_id', b_t2, 'driver_id', b_d2),
                    'stops', jsonb_build_array(
                      jsonb_build_object('ref', 'h', 'location_id', b_hub, 'side', 'KATHODOS', 'planned_from', h06, 'planned_to', h07),
                      jsonb_build_object('ref', 'u', 'location_id', b_la, 'side', 'KATHODOS', 'planned_from', h09, 'planned_to', h10))),
                  'test:072b', 'dispatcher');
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
          VALUES (b_q1, 1, (b_v2->>'rt_id')::bigint, (b_v2->'stops'->>'h')::bigint, (b_v2->'stops'->>'u')::bigint, 'test:072b');
          b_v3 := plan_vs_set_day(jsonb_build_object('order_id', b_vo, 'day', b_d + 2), 'test:072b', 'dispatcher');
          b_verdict := CASE WHEN b_v3->'warnings' = jsonb_build_array(jsonb_build_object('code', 'vs_day_differs', 'first_hub_day', b_d))
                              AND (SELECT cross_dock_date FROM orders WHERE id = b_vo) = b_d + 2
                            THEN 'ok another day than the truck: written, and the answer warns vs_day_differs'
                            ELSE 'FAIL vs_day_differs ' || b_v3::text END;
        -- [B-CASES-NEXT]
        END IF;
        SET CONSTRAINTS ALL IMMEDIATE;

        IF b_want[kb] <> 'ok' THEN
          b_verdict := 'FAIL no error';
        ELSIF kb = 1 THEN
          b_verdict := CASE
            WHEN (SELECT model = 2 AND scope = 'NATL' AND status = 'planned' AND trip_type = 'OWNED' AND start_at = h06
                         AND end_at = h14 AND date_start = b_d AND date_end = b_d AND created_by = 'test:072b' AND source = 'planner'
                    FROM ct_round_trips WHERE id = b_rt1)
             AND (SELECT string_agg(seq::text, ',' ORDER BY planned_from) FROM rt_stops WHERE rt_id = b_rt1) = '1,2'
             AND (SELECT count(*) FROM dl_entries WHERE rt_id = b_rt1 AND deleted_at IS NULL AND entry_type = 'trip'
                    AND entry_date = b_d AND driver_id = b_d1 AND trip_value IS NULL AND advance IS NULL AND expenses IS NULL
                    AND created_by = 'trigger:test:072b') = 1
             AND (SELECT count(*) FROM audit_log WHERE actor = 'test:072b' AND role = 'dispatcher' AND action = 'create'
                    AND table_name IN ('rt_stops', 'ct_round_trips')) = 3
             AND b_v->>'code' LIKE 'RT-%' AND b_v->'warnings' = '[]'::jsonb
            THEN 'ok plan_rt_create: stops first, window exact, one empty payroll line, three audit rows'
            ELSE 'FAIL plan_rt_create ' || b_v::text END;
        END IF;
        RAISE EXCEPTION 'wn072b undo' USING HINT = 'wn072b_undo';
      EXCEPTION WHEN others THEN
        GET STACKED DIAGNOSTICS b_hint = PG_EXCEPTION_HINT, b_msg = MESSAGE_TEXT, b_cname = CONSTRAINT_NAME,
                                b_st = RETURNED_SQLSTATE;
        b_got := CASE WHEN b_hint = 'wn072b_undo' THEN coalesce(b_verdict, 'FAIL no verdict')
                      WHEN b_hint LIKE 'plan:%' THEN b_hint
                      WHEN coalesce(b_cname, '') <> '' THEN 'con:' || b_cname
                      ELSE 'state:' || b_st END;
        IF (b_want[kb] = 'ok' AND b_got LIKE 'ok%') OR b_got = b_want[kb] THEN
          ok := ok + 1; res := res || ('B' || kb);
        ELSE
          bad := bad + 1; res := res || ('B' || kb || ' FAIL want ' || b_want[kb] || ' got ' || b_got || ' (' || b_msg || ')');
        END IF;
      END;
    END LOOP;
  END;
  RAISE EXCEPTION 'RULES TEST 072 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$t072$;
