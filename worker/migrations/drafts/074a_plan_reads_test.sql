-- RULES TEST 074a (the reads day L needs): every case on TEST rows, then undone.
-- Runs AFTER 074a said "074a OK". At build time it runs on the PGlite copy (tms-auditor/test/plan-074a.test.mjs). On
-- production it is OPTIONAL, after 15:00, with an explicit yes: it writes TEST rows (locations, clients, trucks,
-- drivers, a national order, a VS order with stops, v5 cycles, a payroll line, a plan_config row) and undoes ALL of
-- them with a deliberate final error. Only trace: identity and code sequences advance (RT-...).
-- ONE statement. The red error message IS the result:
--   "RULES TEST 074a finished - EVERYTHING UNDONE, nothing kept. Result: <N> OK, 0 FAIL || ...".
-- Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Each case builds S (day D = a Monday 40+ days ahead, E = D + 1, week W = the Saturday before D): two OWNED v5 cycles,
-- R1 on D (A 06-08, Veroia 09-10, B 12-14) and R2 on E (the same); a national N1 A->B (10 pallets, price 400, pallet
-- exchange, goods, notes) with piece p1 waiting at A; a national N2 Veroia->B (5 pallets) with piece p2 waiting at the
-- hub; a VS import (abroad C -> Veroia on E -> B, 33 pallets, the Greek stop with goods / notes) with its bridge and
-- piece z waiting at the hub. Then it makes its calls, reads the verdict, undoes (marker exception).
-- Written on 072 + 072b + 073 + 073b as live 28/10. ASCII only. Test ids: legacy_id rec074aT..., reference
-- WN074a-TEST, names "TEST 074a ...", plates TEST-074a-..., actor test:074a.
DO $t074a$
DECLARE
  td date; d date; e date; wk date; sat date; k int;
  hub bigint; la bigint; lb bigint; lc bigint; cl1 bigint; cl2 bigint; trk1 bigint; trk2 bigint; drv1 bigint; drv2 bigint;
  a06 timestamptz; a08 timestamptz; a09 timestamptz; a10 timestamptz; a12 timestamptz; a14 timestamptz;
  b06 timestamptz; b08 timestamptz; b09 timestamptz; b10 timestamptz; b12 timestamptz; b14 timestamptz;
  rt1 bigint; rt2 bigint; s1a bigint; s1h bigint; s1b bigint; s2a bigint; s2h bigint; s2b bigint;
  n1 bigint; n2 bigint; sh1 bigint; sh2 bigint; p1 bigint; p2 bigint; vso bigint; vs_b bigint; vsh bigint; z bigint;
  x bigint; y bigint; n int; t1 text; t2 text;
  r jsonb; r2 jsonb; j jsonb; h jsonb; tgt1 jsonb; tgt2 jsonb; st1 jsonb; st2v jsonb;
  -- the keys of plan_board as live before 074a (072 + 072b hook 10): every one must still be there (A7)
  k_cycle CONSTANT text[] := ARRAY['code', 'date_end', 'date_start', 'driver', 'driver_id', 'end_at', 'ended', 'partner',
    'partner_id', 'partner_rate', 'rt_id', 'segments', 'start_at', 'stops', 'trailer', 'trailer_id', 'trip_type', 'truck', 'truck_id'];
  k_stop CONSTANT text[] := ARRAY['cycle_dim', 'dim', 'executed', 'has_late', 'has_vehicle', 'legs', 'local_loading', 'location',
    'location_id', 'planned_from', 'planned_to', 'seq', 'side', 'side_dim', 'stop_day', 'stop_id'];
  k_leg CONSTANT text[] := ARRAY['act', 'client', 'client_id', 'kind', 'leg_id', 'nat_order_id', 'order_id', 'pallets',
    'piece_id', 'reference', 'temperature_c'];
  k_hub CONSTANT text[] := ARRAY['client', 'client_id', 'inbound_rt_id', 'is_stock', 'kind', 'leave_by', 'nat_due_day',
    'nat_order_id', 'nat_ready_day', 'order_id', 'order_stop_id', 'overdue', 'pallets', 'piece_id', 'reference',
    'shipment_id', 'temperature_c'];
  want text[] := ARRAY[
    NULL
    , 'ok'               -- 1 A1 a VS import nobody took: hub[] names its Greek stop (nat_to_location_id), windows null (a bridge copies no time), for_split false
    , 'ok'               -- 2 A1 a national loading at Veroia nobody took: hub[] with its destination and its four windows
    , 'ok'               -- 3 A2 every cycle stop has is_hub, true only at the hub
    , 'ok'               -- 4 A3 a national leg: price 400, pallet_exchange, shipment_id, order_stop_id null, goods, notes
    , 'ok'               -- 5 A3 a VS leg: price null (invoiced as the international), order_stop_id = the Greek stop, the stop's goods / notes
    , 'ok'               -- 6 A4 a VS sent back to waiting at Veroia (Split -> Veroia): for_split true, for_split_at set, one audit row
    , 'ok'               -- 7 A4 the mark goes stale once a cycle took the piece again: for_split false
    , 'ok'               -- 8 A4 a national sent back to waiting where it is not at the hub: no mark
    , 'ok'               -- 9 A5 plan_lookups: six lists, one hub, phone on drivers and places, a deleted truck left out
    , 'plan:bad_input'   -- 10 A5 plan_lookups for an unknown role
    , 'state:42501'      -- 11 A6 anon calls plan_lookups: permission denied
    , 'ok'               -- 12 A6 EXECUTE: the Worker's three to service_role only; plan_cutover_day to nobody
    , 'ok'               -- 13 A7 the old keys of the board all there; the new ones exactly the asked ones
    , 'con:plan_config_saturday' -- 14 B1 day L not a Saturday
    , 'con:plan_config_future'   -- 15 B2 day L not after the day it is opened (Athens)
    , 'con:plan_config_pkey'     -- 16 B3 a second row (id 1 again: the primary key)
    , 'con:plan_config_one'      -- 17 B3 a second row with another id
    , 'state:42501'      -- 18 B4 service_role cannot INSERT into plan_config
    , 'state:42501'      -- 19 B4 service_role cannot UPDATE plan_config
    , 'ok'               -- 20 B5 plan_config_read / plan_cutover_day: null before, the row's day after
    , 'ok'               -- 21 E-19 a VS with a bridge but nothing on a truck: empty list, no token
    , 'ok'               -- 22 E-19 a VS on a cycle that empties: piece_on_rt + rt_cancelled, a token, the same for every role
    , 'ok'               -- 23 E-19 the payroll amount: shown to the owner, cut for the dispatcher, the same token
    , 'ok'               -- 24 E-19 the amount changes: another token (the Worker answers stale_confirm)
    , 'ok'               -- 25 E-19 an unknown order: the empty answer, order_id null
    , 'plan:bad_input'   -- 26 E-19 an unknown role
    -- @want (one line per case: "    , '<ok|plan:code|con:name|state:XXXXX>'  -- <k> <what>")
  ]::text[];
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  want := want[2:];   -- drop the leading NULL that keeps every want line in the same ", '...'" shape
  IF to_regprocedure('public.plan_lookups(text)') IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 074a: 074a is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM plan_config) THEN
    RAISE EXCEPTION 'RULES TEST 074a: plan_config has its row (074 ran) - the B cases are for before day L';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec074aT%') OR EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec074aT%')
     OR EXISTS (SELECT 1 FROM national_orders WHERE legacy_id LIKE 'rec074aT%' OR reference = 'WN074a-TEST')
     OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-074a-%')
     OR EXISTS (SELECT 1 FROM clients WHERE company_name LIKE 'TEST 074a %') THEN
    RAISE EXCEPTION 'RULES TEST 074a: test ids (rec074aT..., WN074a-TEST, TEST 074a ..., TEST-074a-...) already exist - stop';
  END IF;

  -- Fixture (undone by the final error).
  td := (now() AT TIME ZONE 'Europe/Athens')::date;
  d := td + 40; d := d + ((8 - extract(isodow FROM d)::int) % 7); e := d + 1; wk := d - 2;   -- D a Monday, W its Saturday
  sat := td + 1 + ((12 - extract(isodow FROM td)::int) % 7);                                 -- the first Saturday after today
  a06 := (d + time '06:00') AT TIME ZONE 'Europe/Athens'; a08 := (d + time '08:00') AT TIME ZONE 'Europe/Athens';
  a09 := (d + time '09:00') AT TIME ZONE 'Europe/Athens'; a10 := (d + time '10:00') AT TIME ZONE 'Europe/Athens';
  a12 := (d + time '12:00') AT TIME ZONE 'Europe/Athens'; a14 := (d + time '14:00') AT TIME ZONE 'Europe/Athens';
  b06 := (e + time '06:00') AT TIME ZONE 'Europe/Athens'; b08 := (e + time '08:00') AT TIME ZONE 'Europe/Athens';
  b09 := (e + time '09:00') AT TIME ZONE 'Europe/Athens'; b10 := (e + time '10:00') AT TIME ZONE 'Europe/Athens';
  b12 := (e + time '12:00') AT TIME ZONE 'Europe/Athens'; b14 := (e + time '14:00') AT TIME ZONE 'Europe/Athens';
  IF extract(isodow FROM sat) <> 6 OR sat <= td OR sat > td + 7 OR extract(isodow FROM wk) <> 6 OR extract(isodow FROM d) <> 1 THEN
    RAISE EXCEPTION 'RULES TEST 074a: the fixture days are wrong (sat %, W %, D %)', sat, wk, d;
  END IF;
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name, phone) VALUES ('rec074aTA', 'TEST 074a A', '+30 000') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec074aTB', 'TEST 074a B') RETURNING id INTO lb;
  INSERT INTO locations (legacy_id, name) VALUES ('rec074aTC', 'TEST 074a C') RETURNING id INTO lc;
  INSERT INTO clients (company_name) VALUES ('TEST 074a client 1') RETURNING id INTO cl1;
  INSERT INTO clients (company_name) VALUES ('TEST 074a client 2') RETURNING id INTO cl2;
  INSERT INTO trucks (license_plate) VALUES ('TEST-074a-1') RETURNING id INTO trk1;
  INSERT INTO trucks (license_plate) VALUES ('TEST-074a-2') RETURNING id INTO trk2;
  INSERT INTO drivers (full_name, phone) VALUES ('TEST 074a driver 1', '+30 111') RETURNING id INTO drv1;
  INSERT INTO drivers (full_name) VALUES ('TEST 074a driver 2') RETURNING id INTO drv2;

  FOR k IN 1..coalesce(array_length(want, 1), 0) LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      -- S
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk1, drv1, d, d, a06, a14, 'planned', 'planner', 'test:074a') RETURNING id INTO rt1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 1, la, 'KATHODOS', a06, a08, 'test:074a') RETURNING id INTO s1a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 2, hub, 'KATHODOS', a09, a10, 'test:074a') RETURNING id INTO s1h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 3, lb, 'KATHODOS', a12, a14, 'test:074a') RETURNING id INTO s1b;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk2, drv2, e, e, b06, b14, 'planned', 'planner', 'test:074a') RETURNING id INTO rt2;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 1, la, 'KATHODOS', b06, b08, 'test:074a') RETURNING id INTO s2a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 2, hub, 'KATHODOS', b09, b10, 'test:074a') RETURNING id INTO s2h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 3, lb, 'KATHODOS', b12, b14, 'test:074a') RETURNING id INTO s2b;
      INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, notes, temperature_c, pallet_exchange)
      VALUES ('rec074aTN1', cl1, 'WN074a-TEST', 400, 10, 'TEST goods N1', 'TEST notes N1', 2, true) RETURNING id INTO n1;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      VALUES (n1, la, lb, 10, a06, a08, a12, a14, 'test:074a') RETURNING id INTO sh1;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh1, 10, 'test:074a') RETURNING id INTO p1;
      INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, temperature_c, pallet_exchange)
      VALUES ('rec074aTN2', cl1, 'WN074a-TEST', 150, 5, 'TEST goods N2', 2, false) RETURNING id INTO n2;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      VALUES (n2, hub, lb, 5, a09, a10, a12, a14, 'test:074a') RETURNING id INTO sh2;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (sh2, 5, 'test:074a') RETURNING id INTO p2;
      -- a VS import: loads abroad at C, Veroia day E, the Greek delivery at B (33 pallets)
      INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                          cross_dock_date, reference, client_id, price, pallet_exchange)
      VALUES ('rec074aTO1', 'International', 'Import', 'Pending', true, d - 3, e, e, 'WN074a-TEST', cl2, 3000, true) RETURNING id INTO vso;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
      VALUES ('rec074aTS1', 'Loading', 1, d - 3, vso, lc, 33);
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
      VALUES ('rec074aTS2', 'Cross-dock', 1, e, vso, hub, 33);
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets, goods, notes)
      VALUES ('rec074aTS3', 'Unloading', 1, e, vso, lb, 33, 'TEST goods VS', 'TEST notes VS') RETURNING id INTO vs_b;
      INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:074a') RETURNING id INTO vsh;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (vsh, 33, 'test:074a') RETURNING id INTO z;
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;
      tgt1 := jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS');
      tgt2 := jsonb_build_object('rt_id', rt2, 'side', 'KATHODOS');
      st1 := jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b));
      st2v := jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s2h), jsonb_build_object('ref', 'b', 'stop_id', s2b));

      IF k IN (1, 2) THEN
        j := plan_board(wk, 'dispatcher');
        SELECT x0 INTO h FROM jsonb_array_elements(j->'hub') x0 WHERE (x0->>'piece_id')::bigint = CASE k WHEN 1 THEN z ELSE p2 END;
      ELSIF k IN (3, 4, 5, 13) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:074a', 'owner');
        x := (r->'ids'->'leg_ids'->>0)::bigint;
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', z)),
               'target', tgt2, 'stops', st2v), 'test:074a', 'owner');
        y := (r->'ids'->'leg_ids'->>0)::bigint;
        j := plan_board(wk, 'dispatcher');
      ELSIF k IN (6, 7) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', z)),
               'target', tgt2, 'stops', st2v), 'test:074a', 'owner');
        r := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(z)),
               'target', '{"wait": true}'::jsonb, 'dry_run', true), 'test:074a', 'dispatcher');
        r2 := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(z)),
                'target', '{"wait": true}'::jsonb, 'confirm_token', r->>'confirm_token'), 'test:074a', 'dispatcher');
        IF k = 7 THEN
          -- an older mark (one transaction has one now()), then a cycle takes the piece and another path drops it
          UPDATE shipment_pieces SET for_split_at = now() - interval '1 hour' WHERE id = z;
          r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', z)),
                 'target', tgt1, 'stops', jsonb_build_array(jsonb_build_object('ref', 'h', 'stop_id', s1h),
                                                            jsonb_build_object('ref', 'b', 'stop_id', s1b))), 'test:074a', 'owner');
          UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'TEST 074a dropped', deleted_by = 'test:074a'
           WHERE id = (r->'ids'->'leg_ids'->>0)::bigint;
        END IF;
        j := plan_board(wk, 'dispatcher');
        SELECT x0 INTO h FROM jsonb_array_elements(j->'hub') x0 WHERE (x0->>'piece_id')::bigint = z;
      ELSIF k = 8 THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', p1)),
               'target', tgt1, 'stops', st1), 'test:074a', 'owner');
        r := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
               'target', '{"wait": true}'::jsonb, 'dry_run', true), 'test:074a', 'owner');
        r2 := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(p1)),
                'target', '{"wait": true}'::jsonb, 'confirm_token', r->>'confirm_token'), 'test:074a', 'owner');
      ELSIF k = 9 THEN
        INSERT INTO trucks (license_plate, deleted_at) VALUES ('TEST-074a-gone', now()) RETURNING id INTO x;
        j := plan_lookups('warehouse');
      ELSIF k = 10 THEN
        j := plan_lookups('nobody');
      ELSIF k = 11 THEN
        SET LOCAL ROLE anon;
        j := plan_lookups('owner');
      ELSIF k IN (14, 15, 16, 17, 20) THEN
        IF k = 20 THEN t1 := plan_config_read()::text; t2 := coalesce(plan_cutover_day()::text, 'null'); END IF;
        INSERT INTO plan_config (id, cutover_day, opened_at, opened_by)
        VALUES (1, CASE k WHEN 14 THEN sat + 6 WHEN 15 THEN sat - 7 ELSE sat END, now(), 'test:074a');
        IF k = 16 THEN INSERT INTO plan_config (id, cutover_day, opened_at, opened_by) VALUES (1, sat + 7, now(), 'test:074a'); END IF;
        IF k = 17 THEN INSERT INTO plan_config (id, cutover_day, opened_at, opened_by) VALUES (2, sat + 7, now(), 'test:074a'); END IF;
      ELSIF k IN (18, 19) THEN
        SET LOCAL ROLE service_role;
        IF k = 18 THEN
          INSERT INTO plan_config (id, cutover_day, opened_at, opened_by) VALUES (1, sat, now(), 'test:074a');
        ELSE
          UPDATE plan_config SET opened_by = 'test:074a';
        END IF;
      ELSIF k = 21 THEN
        r := order_delete_preview('rec074aTO1', 'owner');
      ELSIF k IN (22, 23, 24) THEN
        r := plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', z)),
               'target', tgt2, 'stops', st2v), 'test:074a', 'owner');
        y := (r->'ids'->'leg_ids'->>0)::bigint;
        IF k IN (23, 24) THEN
          -- the cycle's own payroll line (011 writes one per cycle, dl_rt_live), given an amount
          UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt2 AND deleted_at IS NULL RETURNING id INTO STRICT x;
        END IF;
        r := order_delete_preview('rec074aTO1', 'owner');
        r2 := order_delete_preview('rec074aTO1', 'dispatcher');
        IF k = 24 THEN
          UPDATE dl_entries SET trip_value = 120 WHERE id = x;
          r2 := order_delete_preview('rec074aTO1', 'dispatcher');
        END IF;
      ELSIF k = 25 THEN
        r := order_delete_preview('rec074aT-none', 'owner');
      ELSIF k = 26 THEN
        r := order_delete_preview('rec074aTO1', 'nobody');
      END IF;

      -- verdicts
      IF k = 1 THEN
        verdict := CASE WHEN h IS NOT NULL AND h->>'kind' = 'vs_import' AND (h->>'nat_to_location_id')::bigint = lb
                          AND h ?& ARRAY['load_from', 'load_to', 'deliver_from', 'deliver_to', 'for_split']
                          AND jsonb_typeof(h->'load_from') = 'null' AND jsonb_typeof(h->'deliver_to') = 'null'
                          AND h->'for_split' = 'false'::jsonb AND (h->>'nat_ready_day')::date = e
                        THEN 'ok VS: destination B, windows null, ready on E, not for splitting'
                        ELSE 'FAIL hub VS: ' || coalesce(h::text, 'not in hub[]') END;
      ELSIF k = 2 THEN
        verdict := CASE WHEN h IS NOT NULL AND (h->>'nat_to_location_id')::bigint = lb
                          AND (h->>'load_from')::timestamptz = a09 AND (h->>'load_to')::timestamptz = a10
                          AND (h->>'deliver_from')::timestamptz = a12 AND (h->>'deliver_to')::timestamptz = a14
                          AND h->'for_split' = 'false'::jsonb
                        THEN 'ok national at the hub: B and its four windows'
                        ELSE 'FAIL hub national: ' || coalesce(h::text, 'not in hub[]') END;
      ELSIF k = 3 THEN
        verdict := CASE WHEN (SELECT bool_and(s ? 'is_hub') AND count(*) FILTER (WHERE (s->>'is_hub')::boolean) = 2
                                AND bool_and((s->>'is_hub')::boolean = ((s->>'location_id')::bigint = hub))
                                FROM jsonb_array_elements(j->'cycles') c, jsonb_array_elements(c->'stops') s
                               WHERE (c->>'rt_id')::bigint IN (rt1, rt2))
                        THEN 'ok is_hub on every stop, true at the two Veroia stops only'
                        ELSE 'FAIL is_hub: ' || coalesce((SELECT string_agg(s->>'stop_id' || '=' || coalesce(s->>'is_hub', 'missing'), ' ')
                               FROM jsonb_array_elements(j->'cycles') c, jsonb_array_elements(c->'stops') s), 'no stops') END;
      ELSIF k IN (4, 5) THEN
        SELECT l INTO h FROM jsonb_array_elements(j->'cycles') c, jsonb_array_elements(c->'stops') s, jsonb_array_elements(s->'legs') l
         WHERE (l->>'leg_id')::bigint = CASE k WHEN 4 THEN x ELSE y END AND l->>'act' = 'load';
        verdict := CASE WHEN k = 4 AND (h->>'price')::numeric = 400 AND h->'pallet_exchange' = 'true'::jsonb
                          AND (h->>'shipment_id')::bigint = sh1 AND jsonb_typeof(h->'order_stop_id') = 'null'
                          AND h->>'goods' = 'TEST goods N1' AND h->>'notes' = 'TEST notes N1'
                        THEN 'ok national leg: 400, PE, its shipment, goods, notes'
                        WHEN k = 5 AND h ? 'price' AND jsonb_typeof(h->'price') = 'null' AND h->'pallet_exchange' = 'true'::jsonb
                          AND (h->>'shipment_id')::bigint = vsh AND (h->>'order_stop_id')::bigint = vs_b
                          AND h->>'goods' = 'TEST goods VS' AND h->>'notes' = 'TEST notes VS'
                        THEN 'ok VS leg: no price, its Greek stop, the stop''s goods / notes'
                        ELSE 'FAIL leg: ' || coalesce(h::text, 'leg not on the board') END;
      ELSIF k = 6 THEN
        verdict := CASE WHEN h IS NOT NULL AND h->'for_split' = 'true'::jsonb
                          AND (SELECT for_split_at = now() FROM shipment_pieces WHERE id = z)
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'shipment_pieces' AND record_id = z::text
                                AND after_data ? 'for_split_at' AND actor = 'test:074a' AND role = 'dispatcher') = 1
                        THEN 'ok sent to Veroia to be split: for_split, the mark, one audit row'
                        ELSE 'FAIL for_split: ' || coalesce(h::text, 'not in hub[]') END;
      ELSIF k = 7 THEN
        verdict := CASE WHEN h IS NOT NULL AND h->'for_split' = 'false'::jsonb
                        THEN 'ok an old mark after a later cycle reads false' ELSE 'FAIL stale mark: ' || coalesce(h::text, 'not in hub[]') END;
      ELSIF k = 8 THEN
        verdict := CASE WHEN (SELECT for_split_at IS NULL FROM shipment_pieces WHERE id = p1)
                          AND (r2->>'ok')::boolean
                        THEN 'ok back to waiting at A: no mark' ELSE 'FAIL marked away from the hub' END;
      ELSIF k = 9 THEN
        verdict := CASE WHEN (SELECT count(*) FROM jsonb_each(j) WHERE jsonb_typeof(value) = 'array') = 6
                          AND (SELECT count(*) FROM jsonb_array_elements(j->'locations') l WHERE (l->>'is_hub')::boolean) = 1
                          AND (SELECT l->>'phone' FROM jsonb_array_elements(j->'locations') l WHERE (l->>'id')::bigint = la) = '+30 000'
                          AND (SELECT d0->>'phone' FROM jsonb_array_elements(j->'drivers') d0 WHERE (d0->>'id')::bigint = drv1) = '+30 111'
                          AND (SELECT bool_and(l ?& ARRAY['id', 'legacy_id', 'name', 'address', 'city', 'phone', 'is_hub', 'active'])
                                 FROM jsonb_array_elements(j->'locations') l)
                          AND EXISTS (SELECT 1 FROM jsonb_array_elements(j->'trucks') t0 WHERE (t0->>'id')::bigint = trk1)
                          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'trucks') t0 WHERE (t0->>'id')::bigint = x)
                          AND (SELECT count(*) FROM jsonb_array_elements(j->'clients')) = (SELECT count(*) FROM clients WHERE deleted_at IS NULL)
                        THEN 'ok six lists, one hub, phones, the deleted truck left out'
                        ELSE 'FAIL lookups' END;
      ELSIF k = 12 THEN
        SELECT count(*) INTO n FROM unnest(ARRAY['public.plan_cutover_day()', 'public.plan_config_read()',
            'public.plan_lookups(text)', 'public.order_delete_preview(text,text)']) f(sig)
         WHERE NOT has_function_privilege('anon', f.sig, 'EXECUTE') AND NOT has_function_privilege('authenticated', f.sig, 'EXECUTE')
           AND has_function_privilege('service_role', f.sig, 'EXECUTE') = (f.sig <> 'public.plan_cutover_day()');
        verdict := CASE WHEN n = 4 THEN 'ok service_role calls the three, nobody plan_cutover_day' ELSE 'FAIL rights: ' || n || ' of 4' END;
      ELSIF k = 13 THEN
        verdict := CASE WHEN (SELECT bool_and(array(SELECT jsonb_object_keys(c) ORDER BY 1) =
                                              (SELECT array_agg(q ORDER BY q) FROM unnest(k_cycle) q))
                                FROM jsonb_array_elements(j->'cycles') c)
                          AND (SELECT bool_and(array(SELECT jsonb_object_keys(s) ORDER BY 1) =
                                              (SELECT array_agg(q ORDER BY q) FROM unnest(k_stop || 'is_hub'::text) q))
                                FROM jsonb_array_elements(j->'cycles') c, jsonb_array_elements(c->'stops') s)
                          AND (SELECT bool_and(array(SELECT jsonb_object_keys(l) ORDER BY 1) =
                                              (SELECT array_agg(q ORDER BY q) FROM unnest(k_leg || ARRAY['goods', 'notes', 'order_stop_id',
                                                 'pallet_exchange', 'price', 'shipment_id']) q))
                                FROM jsonb_array_elements(j->'cycles') c, jsonb_array_elements(c->'stops') s, jsonb_array_elements(s->'legs') l)
                          AND (SELECT bool_and(array(SELECT jsonb_object_keys(x0) ORDER BY 1) =
                                              (SELECT array_agg(q ORDER BY q) FROM unnest(k_hub || ARRAY['deliver_from', 'deliver_to', 'for_split',
                                                 'load_from', 'load_to', 'nat_to_location_id']) q))
                                FROM jsonb_array_elements(j->'hub') x0)
                          AND jsonb_array_length(j->'hub') > 0 AND jsonb_array_length(j->'cycles') = 2
                        THEN 'ok old keys all there, new keys exactly the asked ones'
                        ELSE 'FAIL keys' END;
      ELSIF k = 20 THEN
        verdict := CASE WHEN t1 = '{"opened_at": null, "cutover_day": null}' AND t2 = 'null'
                          AND plan_config_read()->>'cutover_day' = sat::text AND plan_cutover_day() = sat
                          AND jsonb_typeof(plan_config_read()->'opened_at') = 'string'
                        THEN 'ok null before, the Saturday after' ELSE 'FAIL config read: ' || t1 || ' / ' || plan_config_read()::text END;
      ELSIF k = 21 THEN
        verdict := CASE WHEN (r->>'order_id')::bigint = vso AND r->'needs_confirm' = 'false'::jsonb
                          AND jsonb_typeof(r->'confirm_token') = 'null' AND r->'consequences' = '[]'::jsonb
                        THEN 'ok a bridge without a leg: nothing to confirm' ELSE 'FAIL preview empty: ' || r::text END;
      ELSIF k = 22 THEN
        verdict := CASE WHEN r->'needs_confirm' = 'true'::jsonb AND r->>'confirm_token' IS NOT NULL
                          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'consequences') c WHERE c->>'kind' = 'piece_on_rt'
                                       AND (c->>'leg_id')::bigint = y AND (c->>'order_stop_id')::bigint = vs_b AND (c->>'rt_id')::bigint = rt2)
                          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'consequences') c WHERE c->>'kind' = 'rt_cancelled'
                                       AND (c->>'rt_id')::bigint = rt2)
                          AND r->>'confirm_token' = r2->>'confirm_token'
                        THEN 'ok the piece on R2 and R2 that empties, with a token' ELSE 'FAIL preview: ' || r::text END;
      ELSIF k = 23 THEN
        verdict := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(r->'consequences') c
                                      WHERE c->>'kind' = 'payroll_amount' AND (c->>'amount')::numeric = 100)
                          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r2->'consequences') c WHERE c->>'kind' = 'payroll_amount')
                          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r2->'consequences') c WHERE c ? 'amount')
                          AND r->>'confirm_token' = r2->>'confirm_token'
                        THEN 'ok the owner sees 100, the dispatcher the line without it, one token'
                        ELSE 'FAIL amounts: ' || r2::text END;
      ELSIF k = 24 THEN
        verdict := CASE WHEN r->>'confirm_token' IS DISTINCT FROM r2->>'confirm_token' AND r2->>'confirm_token' IS NOT NULL
                        THEN 'ok a changed amount changes the token' ELSE 'FAIL same token after the change' END;
      ELSIF k = 25 THEN
        verdict := CASE WHEN jsonb_typeof(r->'order_id') = 'null' AND r->'needs_confirm' = 'false'::jsonb
                          AND jsonb_typeof(r->'confirm_token') = 'null' AND r->'consequences' = '[]'::jsonb
                        THEN 'ok unknown order: the empty answer' ELSE 'FAIL unknown: ' || r::text END;
      -- @verdict (each "ELSIF k = <n> THEN verdict := ..." above this line)
      END IF;
      RAISE EXCEPTION 'wn074a undo' USING HINT = 'wn074a_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn074a_undo' THEN coalesce(verdict, 'FAIL no verdict')
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
  RAISE EXCEPTION 'RULES TEST 074a finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$t074a$;
