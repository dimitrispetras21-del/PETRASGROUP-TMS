-- RULES TEST 071 (national v5 schema): 54 cases on TEST rows, then undone.
-- Runs AFTER 071 said "071 OK". At build time it runs on the PGlite copy (tms-auditor/test/plan-071.test.mjs). On
-- production it is OPTIONAL, after 15:00, with an explicit yes: it writes TEST rows (locations, clients, partners,
-- trucks, drivers, two national orders, one VS import order with two stops, round trips, payroll lines, local moves,
-- pallet movements, audit rows) and undoes ALL of them with a deliberate final error. Only trace: identity and code
-- sequences advance (RT-... and PM-... numbers skip the ones used here).
-- ONE statement. The red error message IS the result:
--   "RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept. Result: 54 OK, 0 FAIL || ...".
-- Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Each case: build S (national order A->B, 10 pallets, one piece; one OWNED v5 cycle with truck and driver, stops
-- A 06-08, Veroia 09-10, B 12-14 on day D; one leg A->B), check it (SET CONSTRAINTS ALL IMMEDIATE), make the case's
-- change, check again, read the verdict, undo (marker exception). want[k] = 'ok' (the verdict must start with ok),
-- 'plan:<code>' (the HINT), 'con:<constraint>' or 'state:<SQLSTATE>'.
-- ASCII only. Test ids: legacy_id rec071T..., reference WN071-TEST, names "TEST 071 ...", plates TEST-071-..., day
-- D = Athens today + 40; cases 46-49 use yesterday and today (the "executed" rule of spec 2.3).
DO $dry$
DECLARE
  td date; dp date; d date; k int;
  la bigint; lb bigint; lc bigint; hub bigint; cl bigint; pa bigint; trk bigint; drv bigint; drv2 bigint;
  no1 bigint; no2 bigint; vso bigint; vs_ld bigint; vs_ul bigint; v1rt bigint;
  at5 timestamptz; at6 timestamptz; at7 timestamptz; at730 timestamptz; at8 timestamptz; at9 timestamptz;
  at10 timestamptz; at12 timestamptz; at13 timestamptz; at14 timestamptz; at16 timestamptz;
  u1 timestamptz; u2 timestamptz; u3 timestamptz; u4 timestamptz; shift interval;
  rt1 bigint; rt2 bigint; s1 bigint; sv bigint; s2 bigint; s4 bigint; shp bigint; shp2 bigint; p1 bigint;
  c1 bigint; c2 bigint; lg1 bigint; x bigint; y bigint; q1 bigint; q2 bigint; pq bigint;
  n int; b1 boolean; b2 boolean; t1 text;
  want text[] := ARRAY[
    'ok', 'ok', 'plan:pieces_sum', 'con:shipments_shape', 'con:shipments_one_parent',                 -- 1-5
    'con:shipments_intl_is_bridge', 'con:shipments_ends', 'plan:leg_order', 'plan:chain', 'ok',         -- 6-10
    'plan:chain_time', 'plan:stop_seq', 'plan:stop_order', 'plan:side_order', 'plan:rt_window',         -- 11-15
    'plan:model_locked', 'con:rt_v2_status', 'plan:rt_cancelled', 'ok', 'plan:v1_link_on_v2',           -- 16-20
    'ok', 'con:rt_partner_rate', 'con:rt_v2_window', 'con:rt_v2_dates', 'ok',                           -- 21-25
    'plan:rt_not_v2', 'ok', 'plan:split_not_at_hub', 'plan:piece_dead', 'plan:leg_stop_dead',          -- 26-30
    'plan:leg_place', 'ok', 'plan:pieces_sum', 'con:shipments_shape', 'con:shipments_bridge_once',      -- 31-35
    'con:order_stops_via_hub_intl', 'ok', 'plan:local_loading_day', 'plan:local_loading_stop',          -- 36-39
    'con:local_moves_nat_loading', 'plan:local_loading_stop', 'con:pl_mov_leg_once', 'plan:leg_locked', -- 40-43
    'plan:stop_locked', 'plan:piece_locked', 'ok', 'ok', 'ok', 'ok', 'state:P0001',                     -- 44-50
    'plan:pieces_alive', 'plan:piece_parent', 'plan:local_loading_gone', 'plan:shipment_locked'];       -- 51-54
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  IF to_regclass('public.shipments') IS NULL
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) <> '5fa0a08418147b22d2852db3b8c72c3e' THEN
    RAISE EXCEPTION 'RULES TEST 071: 071 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec071T%') OR EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec071T%')
     OR EXISTS (SELECT 1 FROM national_orders WHERE legacy_id LIKE 'rec071T%')
     OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-071-%')
     OR EXISTS (SELECT 1 FROM drivers WHERE full_name LIKE 'TEST 071 %')
     OR EXISTS (SELECT 1 FROM clients WHERE company_name LIKE 'TEST 071 %')
     OR EXISTS (SELECT 1 FROM partners WHERE company_name LIKE 'TEST 071 %') THEN
    RAISE EXCEPTION 'RULES TEST 071: test ids (rec071T..., TEST 071 ..., TEST-071-...) already exist - stop';
  END IF;

  -- Fixture (undone by the final error).
  td := (now() AT TIME ZONE 'Europe/Athens')::date; dp := td - 1; d := td + 40;
  at5 := (d + time '05:00') AT TIME ZONE 'Europe/Athens';   at6 := (d + time '06:00') AT TIME ZONE 'Europe/Athens';
  at7 := (d + time '07:00') AT TIME ZONE 'Europe/Athens';   at730 := (d + time '07:30') AT TIME ZONE 'Europe/Athens';
  at8 := (d + time '08:00') AT TIME ZONE 'Europe/Athens';   at9 := (d + time '09:00') AT TIME ZONE 'Europe/Athens';
  at10 := (d + time '10:00') AT TIME ZONE 'Europe/Athens';  at12 := (d + time '12:00') AT TIME ZONE 'Europe/Athens';
  at13 := (d + time '13:00') AT TIME ZONE 'Europe/Athens';  at14 := (d + time '14:00') AT TIME ZONE 'Europe/Athens';
  at16 := (d + time '16:00') AT TIME ZONE 'Europe/Athens';
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071TA', 'TEST 071 A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071TB', 'TEST 071 B') RETURNING id INTO lb;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071TC', 'TEST 071 C') RETURNING id INTO lc;
  INSERT INTO clients (company_name) VALUES ('TEST 071 client') RETURNING id INTO cl;
  INSERT INTO partners (company_name) VALUES ('TEST 071 partner') RETURNING id INTO pa;
  INSERT INTO trucks (license_plate) VALUES ('TEST-071-1') RETURNING id INTO trk;
  INSERT INTO drivers (full_name) VALUES ('TEST 071 driver') RETURNING id INTO drv;
  INSERT INTO drivers (full_name) VALUES ('TEST 071 local') RETURNING id INTO drv2;
  INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec071TN1', cl, 'WN071-TEST', 100) RETURNING id INTO no1;
  INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec071TN2', cl, 'WN071-TEST', 50) RETURNING id INTO no2;
  INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  VALUES ('rec071TO1', 'International', 'Import', 'Pending', true, d - 3, d + 1, d, 'WN071-TEST', cl) RETURNING id INTO vso;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec071TS1', 'Loading', 1, d - 3, vso, lc, 20) RETURNING id INTO vs_ld;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec071TS2', 'Unloading', 1, d + 1, vso, lb, 20) RETURNING id INTO vs_ul;
  INSERT INTO ct_round_trips (scope, trip_type, date_start, status, source, created_by)
  VALUES ('NATL', 'OWNED', d, 'planned', 'manual', 'test:071') RETURNING id INTO v1rt;

  FOR k IN 1..54 LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      -- S
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk, drv, d, d, at6, at14, 'planned', 'planner', 'test:071') RETURNING id INTO rt1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 1, la, 'KATHODOS', at6, at8, 'test:071') RETURNING id INTO s1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 2, hub, 'KATHODOS', at9, at10, 'test:071') RETURNING id INTO sv;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 3, lb, 'KATHODOS', at12, at14, 'test:071') RETURNING id INTO s2;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      VALUES (no1, la, lb, 10, at6, at8, at12, at14, 'test:071') RETURNING id INTO shp;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp, 10, 'test:071') RETURNING id INTO p1;
      INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
      VALUES (p1, 1, rt1, s1, s2, 'test:071') RETURNING id INTO lg1;
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;

      IF k = 1 THEN
        NULL;
      ELSIF k = 2 THEN   -- a stop moves to the next day: the cycle's window and its payroll line follow
        UPDATE rt_stops SET planned_from = (d + 1 + time '12:00') AT TIME ZONE 'Europe/Athens',
                            planned_to = (d + 1 + time '14:00') AT TIME ZONE 'Europe/Athens' WHERE id = s2;
      ELSIF k = 3 THEN
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp, 4, 'test:071');
      ELSIF k = 4 THEN
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, load_from, load_to, deliver_from,
                               deliver_to, created_by) VALUES (no1, la, lb, at6, at8, at12, at14, 'test:071');
      ELSIF k = 5 THEN
        INSERT INTO shipments (order_id, nat_order_id, order_stop_id, created_by) VALUES (vso, no1, vs_ul, 'test:071');
      ELSIF k = 6 THEN
        INSERT INTO shipments (order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                               deliver_to, created_by) VALUES (vso, la, lb, 5, at6, at8, at12, at14, 'test:071');
      ELSIF k = 7 THEN
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by) VALUES (no1, la, la, 5, at6, at8, at12, at14, 'test:071');
      ELSIF k IN (8, 9, 10, 11, 19, 27, 31) THEN
        IF k = 31 THEN
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt1, 4, lc, 'KATHODOS', at14, at16, 'test:071') RETURNING id INTO s4;
        END IF;
        IF k = 11 THEN
          INSERT INTO ct_round_trips (model, scope, trip_type, partner_id, partner_rate, date_start, date_end, start_at,
                                      end_at, status, source, created_by)
          VALUES (2, 'NATL', 'PARTNER', pa, 250, d, d, at7, at13, 'planned', 'planner', 'test:071') RETURNING id INTO rt2;
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt2, 1, hub, 'KATHODOS', at7, at730, 'test:071') RETURNING id INTO y;
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt2, 2, lb, 'KATHODOS', at12, at13, 'test:071') RETURNING id INTO x;
        END IF;
        UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = lg1;
        IF k = 8 THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s2, s1, 'test:071');
        ELSIF k = 9 THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, sv, s2, 'test:071');
        ELSIF k IN (10, 11, 27) THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1, sv, 'test:071');
          IF k = 10 THEN
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 2, rt1, sv, s2, 'test:071');
          ELSIF k = 11 THEN
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 2, rt2, y, x, 'test:071');
          ELSE   -- 27: split at the hub 10 -> 6 + 4; the 6 go on to B, the 4 stay as stock
            UPDATE shipment_pieces SET split_at = now(), split_by = 'test:071' WHERE id = p1;
            INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp, p1, 6, 'test:071') RETURNING id INTO c1;
            INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by)
            VALUES (shp, p1, 4, d + 2, 'test:071') RETURNING id INTO c2;
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (c1, 1, rt1, sv, s2, 'test:071');
          END IF;
        ELSIF k = 19 THEN
          UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1;
        ELSE   -- 31
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1, s4, 'test:071');
        END IF;
      ELSIF k = 12 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (rt1, 2, la, 'KATHODOS', at10, at10, 'test:071');
      ELSIF k = 13 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (rt1, 4, la, 'KATHODOS', at6, at8, 'test:071');
      ELSIF k = 14 THEN
        UPDATE rt_stops SET side = 'ANODOS' WHERE id = s1;
      ELSIF k = 15 THEN
        UPDATE ct_round_trips SET start_at = at5 WHERE id = rt1;
      ELSIF k = 16 THEN
        UPDATE ct_round_trips SET model = 2, start_at = at6, end_at = at14, date_start = d, date_end = d WHERE id = v1rt;
      ELSIF k = 17 THEN
        UPDATE ct_round_trips SET status = 'closed', closed_at = now() WHERE id = rt1;
      ELSIF k = 18 THEN
        UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1;
      ELSIF k = 20 THEN
        INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (rt1, 'IMPORT', vso, 1);
      ELSIF k = 21 THEN   -- without 071's line rt_recompute would cancel a cycle with 0 order links
        PERFORM rt_recompute(rt1);
        PERFORM rt_auto_close(rt1);
      ELSIF k = 22 THEN
        UPDATE ct_round_trips SET partner_rate = 100 WHERE id = rt1;
      ELSIF k = 23 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, date_start, status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', d, 'planned', 'planner', 'test:071');
      ELSIF k = 24 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', d + 1, d + 1, at6, at14, 'planned', 'planner', 'test:071');
      ELSIF k = 25 THEN   -- plan_rt_create's order (spec 7): stops first, then the cycle with their window
        x := nextval(pg_get_serial_sequence('public.ct_round_trips', 'id'));
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (x, 1, la, 'KATHODOS', at6, at8, 'test:071');
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (x, 2, lb, 'KATHODOS', at12, at14, 'test:071');
        INSERT INTO ct_round_trips (id, model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
        OVERRIDING SYSTEM VALUE VALUES (x, 2, 'NATL', 'OWNED', d, d, at6, at14, 'planned', 'planner', 'test:071');
      ELSIF k = 26 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (v1rt, 1, la, 'KATHODOS', at6, at8, 'test:071');
      ELSIF k = 28 THEN
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp, p1, 6, 'test:071');
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp, p1, 4, 'test:071');
      ELSIF k = 29 THEN
        UPDATE shipment_pieces SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = p1;
      ELSIF k = 30 THEN
        UPDATE rt_stops SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = s2;
      ELSIF k IN (32, 33, 35) THEN   -- a VS bridge on the import's Greek unloading stop, one piece of 20
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_ul, 'test:071') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 20, 'test:071') RETURNING id INTO y;
        IF k = 33 THEN
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          UPDATE order_stops SET pallets = 18 WHERE id = vs_ul;
        ELSIF k = 35 THEN
          INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_ul, 'test:071');
        END IF;
      ELSIF k = 34 THEN
        INSERT INTO shipments (order_id, order_stop_id, pallets, created_by) VALUES (vso, vs_ul, 20, 'test:071');
      ELSIF k = 36 THEN
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, national_order_id, via_hub) VALUES ('rec071TS9', 'Loading', 1, no1, true);
      ELSIF k IN (37, 38, 39, 41, 53) THEN   -- loading by a local driver
        INSERT INTO local_moves (move_kind, rt_stop_id, driver_id, move_date, status)
        VALUES ('nat_loading', CASE WHEN k = 39 THEN s2 ELSE s1 END, drv2, CASE WHEN k = 38 THEN d + 1 ELSE d END, 'Assigned')
        RETURNING id INTO x;
        IF k IN (41, 53) THEN
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = lg1;
          IF k = 53 THEN UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1; END IF;
        END IF;
      ELSIF k = 40 THEN
        INSERT INTO local_moves (move_kind, driver_id, move_date, status) VALUES ('nat_loading', drv2, d, 'Assigned');
      ELSIF k = 42 THEN
        INSERT INTO pl_movements (movement_date, counterparty_type, client_id, event_type, piece_leg_id, created_by)
        VALUES (d, 'CLIENT', cl, 'DELIVERY', lg1, 'test:071');
        INSERT INTO pl_movements (movement_date, counterparty_type, client_id, event_type, piece_leg_id, created_by)
        VALUES (d, 'CLIENT', cl, 'DELIVERY', lg1, 'test:071');
      ELSIF k = 43 THEN
        UPDATE piece_legs SET drop_stop_id = sv WHERE id = lg1;
      ELSIF k = 44 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt1, 4, lb, 'KATHODOS', at14, at16, 'test:071') RETURNING id INTO s4;
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        UPDATE rt_stops SET rt_id = v1rt WHERE id = s4;
      ELSIF k IN (45, 52) THEN
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by)
        VALUES (no2, la, lb, 5, at6, at8, at12, at14, 'test:071') RETURNING id INTO shp2;
        IF k = 45 THEN
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp2, 5, 'test:071');
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          UPDATE shipment_pieces SET shipment_id = shp2 WHERE id = p1;
        ELSE   -- 52: a piece hanging on a parent of ANOTHER shipment
          INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp2, p1, 5, 'test:071');
        END IF;
      ELSIF k BETWEEN 46 AND 49 THEN   -- 46 yesterday | 47 late | 48 no vehicle | 49 today, across midnight
        IF k = 49 THEN
          u1 := (dp + time '22:00') AT TIME ZONE 'Europe/Athens'; u2 := (td + time '00:10') AT TIME ZONE 'Europe/Athens';
          u3 := (td + time '00:20') AT TIME ZONE 'Europe/Athens'; u4 := (td + time '00:30') AT TIME ZONE 'Europe/Athens';
        ELSE
          u1 := (dp + time '06:00') AT TIME ZONE 'Europe/Athens'; u2 := (dp + time '08:00') AT TIME ZONE 'Europe/Athens';
          u3 := (dp + time '12:00') AT TIME ZONE 'Europe/Athens'; u4 := (dp + time '14:00') AT TIME ZONE 'Europe/Athens';
        END IF;
        shift := CASE WHEN k = 47 THEN interval '1 day' ELSE interval '0' END;   -- 47: requested one day earlier
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', CASE WHEN k = 48 THEN NULL ELSE trk END, drv, (u1 AT TIME ZONE 'Europe/Athens')::date,
                (u4 AT TIME ZONE 'Europe/Athens')::date, u1, u4, 'planned', 'planner', 'test:071') RETURNING id INTO rt2;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt2, 1, la, 'KATHODOS', u1, u2, 'test:071') RETURNING id INTO q1;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt2, 2, lb, 'KATHODOS', u3, u4, 'test:071') RETURNING id INTO q2;
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by)
        VALUES (no2, la, lb, 5, u1 - shift, u2 - shift, u3 - shift, u4 - shift, 'test:071') RETURNING id INTO shp2;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp2, 5, 'test:071') RETURNING id INTO pq;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (pq, 1, rt2, q1, q2, 'test:071');
      ELSIF k = 50 THEN   -- today's rule stays: a v1 round trip with an open order leg does not close by hand
        INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (v1rt, 'IMPORT', vso, 1);
        UPDATE ct_round_trips SET status = 'closed', closed_at = now() WHERE id = v1rt;
      ELSIF k = 51 THEN
        UPDATE shipments SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = shp;
      ELSIF k = 54 THEN
        UPDATE shipments SET nat_order_id = no2 WHERE id = shp;
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;

      -- Verdicts (only reached when nothing refused).
      IF want[k] <> 'ok' THEN
        verdict := 'FAIL no error';
      ELSIF k = 1 THEN
        SELECT count(*) INTO n FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND entry_date = d AND date_end = d;
        SELECT waiting, end_stop_id = s2 INTO b1, b2 FROM v_piece_state WHERE piece_id = p1;
        verdict := CASE WHEN (SELECT start_at = at6 AND end_at = at14 AND date_start = d AND date_end = d FROM ct_round_trips WHERE id = rt1)
                          AND n = 1 AND NOT b1 AND b2
                          AND (SELECT NOT executed FROM v_piece_state WHERE piece_id = p1)
                          AND (SELECT n_stops = 3 AND n_legs = 1 AND NOT ended FROM v_rt_cycle WHERE rt_id = rt1)
                          AND (SELECT planned AND NOT executed FROM v_national_order_state WHERE nat_order_id = no1)
                          AND (SELECT kind = 'national' AND nat_from_location_id = la AND nat_to_location_id = lb AND live
                                 FROM v_shipments WHERE shipment_id = shp)
                        THEN 'ok S: window from the stops, one payroll line on day D, piece planned to B, order planned not executed'
                        ELSE format('FAIL S: payroll lines %s, waiting %s, ends at B %s', n, b1, b2) END;
      ELSIF k = 2 THEN
        verdict := CASE WHEN (SELECT end_at = (d + 1 + time '14:00') AT TIME ZONE 'Europe/Athens' AND date_end = d + 1
                                FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL
                                 AND entry_date = d AND date_end = d + 1) = 1
                        THEN 'ok the window and the payroll line follow the stop to D+1'
                        ELSE 'FAIL the window or the payroll line did not follow the stop' END;
      ELSIF k = 10 THEN
        verdict := CASE WHEN (SELECT end_stop_id = s2 AND NOT waiting FROM v_piece_state WHERE piece_id = p1)
                        THEN 'ok via the hub in two legs' ELSE 'FAIL two legs via the hub' END;
      ELSIF k = 19 THEN
        verdict := CASE WHEN NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL)
                          AND (SELECT waiting FROM v_piece_state WHERE piece_id = p1)
                          AND (SELECT status = 'cancelled' AND NOT ended FROM v_rt_cycle WHERE rt_id = rt1)
                          AND NOT EXISTS (SELECT 1 FROM v_rt_stop_state WHERE rt_id = rt1 AND executed)
                        THEN 'ok cancel: legs off, cycle cancelled, empty payroll line gone (011), piece waiting again'
                        ELSE 'FAIL cancel' END;
      ELSIF k = 21 THEN
        verdict := CASE WHEN (SELECT status = 'planned' AND notes IS NULL FROM ct_round_trips WHERE id = rt1)
                        THEN 'ok rt_recompute / rt_auto_close leave a v5 cycle alone' ELSE 'FAIL rt_recompute touched a v5 cycle' END;
      ELSIF k = 25 THEN
        verdict := CASE WHEN (SELECT start_at = at6 AND end_at = at14 FROM ct_round_trips WHERE id = x)
                          AND (SELECT n_stops FROM v_rt_cycle WHERE rt_id = x) = 2
                        THEN 'ok stops first, cycle after, in one transaction' ELSE 'FAIL stops first' END;
      ELSIF k = 27 THEN
        verdict := CASE WHEN (SELECT pallets = 4 AND is_stock FROM v_hub_bucket WHERE piece_id = c2)
                          AND (SELECT end_stop_id = s2 AND NOT waiting FROM v_piece_state WHERE piece_id = c1)
                          AND (SELECT count(*) FROM v_piece_state WHERE shipment_id = shp) = 2
                        THEN 'ok split at the hub: 6 go on to B, 4 wait as stock' ELSE 'FAIL split at the hub' END;
      ELSIF k = 32 THEN
        verdict := CASE WHEN (SELECT kind = 'vs_import' AND nat_from_location_id = hub AND nat_to_location_id = lb
                                     AND origin_location_id = lc AND dest_location_id = lb AND pallets = 20
                                     AND nat_ready_day = d AND nat_due_day = d + 1 AND live
                                FROM v_shipments WHERE shipment_id = x)
                          AND (SELECT at_hub AND waiting FROM v_piece_state WHERE piece_id = y)
                          AND (SELECT NOT is_stock FROM v_hub_bucket WHERE piece_id = y)
                          AND (SELECT n_pieces = 1 AND NOT all_planned AND carriers = '[]'::jsonb FROM v_vs_state WHERE order_id = vso)
                        THEN 'ok VS bridge: read from its stop, waits at the hub, no carrier yet' ELSE 'FAIL VS bridge' END;
      ELSIF k = 37 THEN
        SELECT code INTO t1 FROM ct_round_trips WHERE id = rt1;
        verdict := CASE WHEN (SELECT count(*) FROM dl_entries WHERE driver_id = drv2 AND entry_date = d AND deleted_at IS NULL
                                AND local_move_id = x AND route LIKE '%' || t1) = 1
                        THEN 'ok local loading: one TOPIKO payroll line for the local driver, named after the cycle'
                        ELSE 'FAIL local loading payroll line' END;
      ELSE   -- 46-49
        SELECT executed, late INTO b1, b2 FROM v_piece_state WHERE piece_id = pq;
        IF k = 46 THEN
          verdict := CASE WHEN b1 AND NOT b2
                            AND (SELECT bool_and(dim) AND bool_and(cycle_dim) FROM v_rt_stop_state WHERE rt_id = rt2)
                            AND (SELECT ended FROM v_rt_cycle WHERE rt_id = rt2)
                            AND (SELECT executed FROM v_national_order_state WHERE nat_order_id = no2)
                          THEN 'ok yesterday: executed, dims, cycle ended, order delivered'
                          ELSE format('FAIL yesterday: executed %s late %s', b1, b2) END;
        ELSIF k = 47 THEN
          verdict := CASE WHEN b1 AND b2
                            AND (SELECT dim FROM v_rt_stop_state WHERE stop_id = q1)
                            AND NOT (SELECT dim FROM v_rt_stop_state WHERE stop_id = q2)
                            AND (SELECT has_late FROM v_rt_stop_state WHERE stop_id = q2)
                            AND NOT (SELECT side_dim FROM v_rt_stop_state WHERE stop_id = q1)
                          THEN 'ok late never dims: the late delivery stays lit, the pickup dims'
                          ELSE format('FAIL late: executed %s late %s', b1, b2) END;
        ELSIF k = 48 THEN
          verdict := CASE WHEN b1 AND (SELECT NOT bool_or(dim) AND NOT bool_or(has_vehicle) FROM v_rt_stop_state WHERE rt_id = rt2)
                          THEN 'ok without a vehicle nothing dims' ELSE 'FAIL without a vehicle' END;
        ELSE
          verdict := CASE WHEN NOT b1 AND (SELECT NOT bool_or(executed) FROM v_rt_stop_state WHERE rt_id = rt2)
                            AND NOT (SELECT ended FROM v_rt_cycle WHERE rt_id = rt2)
                          THEN 'ok today (and a window across midnight) is not executed yet'
                          ELSE 'FAIL today counted as executed' END;
        END IF;
      END IF;
      RAISE EXCEPTION 'wn071 undo' USING HINT = 'wn071_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn071_undo' THEN coalesce(verdict, 'FAIL no verdict')
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

  RAISE EXCEPTION 'RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$dry$;
