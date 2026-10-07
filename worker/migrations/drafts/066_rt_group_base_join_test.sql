-- RULES TEST 066 (related orders join one round trip whatever the group suffix): every rule of the
-- two walks exercised on TEST orders, then undone.
-- (Not the dry run: 066_rt_group_base_join_dryrun.sql runs 066 itself and undoes it, BEFORE 066. This
-- file runs AFTER 066, the way 063_local_line_guard_test.sql ran after 063.)
-- ONE statement. It ends with a deliberate RAISE EXCEPTION, so Postgres undoes ALL of it - no order,
-- round trip, leg, payroll line or audit row stays behind. The red error message IS the result:
--   "RULES TEST 066 finished - EVERYTHING UNDONE, nothing kept. Result: 13 OK, 0 FAIL || ...".
-- EXPECTED: "Result: 13 OK, 0 FAIL" (proven on the PGlite copy: 13 OK, 0 FAIL after 066; with the
--   7/10 walks the same file gives 5 OK, 8 FAIL - S1 is the 7/10 incident replayed second by second).
--   Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Only trace: identity/sequence numbers (orders, round trips and their RT-n codes, legs, audit rows,
-- payroll lines) are skipped.
--
-- DRAFT - run ONLY after 066 said "066 OK", after 15:00, with an explicit yes (it writes, then undoes).
-- ASCII only (clipboard-safe). Picked BY QUERY inside the block, never hard-coded: two active trucks,
-- two active drivers, one trailer, one client, two locations - only as references of the TEST orders
-- (legacy_id rec066T..., reference RT066-TEST, group ids ...-066T...), dated 40 days ahead. Real orders,
-- round trips and legs are never written: a test order relates only to test orders. B-77 is measured
-- before (b77_0, production's own value) and after each scenario, run as run_checks runs it
-- (tms_check_runner), so a real split elsewhere cannot make a scenario fail.
-- Each scenario runs in its own sub-block and is UNDONE at its end by a marker exception, so the next
-- one starts from the same database; an unexpected error is recorded as ERROR with its message.
-- Scenarios: S1 the 7/10 replay (suffix on one member, bare on the other when it gets its truck ->
-- it ATTACHES to the sibling's round trip); S2 bare/bare; S3 suffix/suffix (different member order);
-- S4 suffix on the newcomer, bare on the holder; S5 a GRP- export group; S6 matched pair; S7 rota;
-- S8 no related round trip -> a new one; S9 relatives on two live round trips -> audit "conflict", no
-- round trip for the newcomer, B-77 +1; S10 related round trip on another truck -> a separate round
-- trip as today, B-77 +1; S11 rt_link_split sees the base (the 7/10 step-7 shape: import-only vs
-- export+import) -> audit "split", NOT merged, B-77 +1; S12 rt_link_split's ONE auto-merge shape
-- (same truck, export-only + import-only), related only through the base -> merged (037, unchanged);
-- S13 B-77 skips settled history (#268 / #302 shape): a related pair on two trips counts while one
-- trip is open (open+open, closed+planned: +1) and not once both are closed (+0).
DO $dry$
DECLARE
  t1 bigint; t2 bigint; d1 bigint; d2 bigint; tr bigint; cl bigint; loc1 bigint; loc2 bigint; day0 date;
  b77_sql text; b77_0 numeric; b77_v numeric;
  rt_max bigint; aud_max bigint;
  o1 bigint; o2 bigint; o3 bigint; rt1 bigint; rt2 bigint; rt3 bigint;
  n_rt bigint; why text; verdict text; hint text; msg text; lbl text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  -- 066 applied: both walks compare the base Group ID, B-77 is in the catalog
  IF md5(pg_get_functiondef('public.rt_create_from_order()'::regprocedure)) <> '8e964f66556677a284eca13db70665c6' OR md5(pg_get_functiondef('public.rt_link_split()'::regprocedure)) <> 'd8a4a03dca0e8e26d4e8d227f1287590' THEN RAISE EXCEPTION 'RULES TEST 066: 066 is not applied - nothing to test'; END IF;
  SELECT sql_text INTO b77_sql FROM monitoring.checks WHERE id = 'B-77' AND enabled;
  IF b77_sql IS NULL THEN RAISE EXCEPTION 'RULES TEST 066: check B-77 is missing - 066 is not applied'; END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec066T%' OR group_id LIKE '%-066T%' OR reference = 'RT066-TEST') THEN
    RAISE EXCEPTION 'RULES TEST 066: test ids (rec066T..., ...-066T..., RT066-TEST) already exist - stop';
  END IF;

  -- ---- picks (live data, by query; only referenced, never written) ---------------------------
  SELECT min(id) INTO t1 FROM trucks WHERE deleted_at IS NULL AND coalesce(active, true);
  SELECT min(id) INTO t2 FROM trucks WHERE deleted_at IS NULL AND coalesce(active, true) AND id <> t1;
  SELECT min(id) INTO d1 FROM drivers WHERE deleted_at IS NULL AND coalesce(active, true);
  SELECT min(id) INTO d2 FROM drivers WHERE deleted_at IS NULL AND coalesce(active, true) AND id <> d1;
  SELECT min(id) INTO tr FROM trailers WHERE deleted_at IS NULL AND coalesce(active, true);
  SELECT min(id) INTO cl FROM clients WHERE deleted_at IS NULL;
  SELECT min(id) INTO loc1 FROM locations WHERE deleted_at IS NULL;
  SELECT min(id) INTO loc2 FROM locations WHERE deleted_at IS NULL AND id <> loc1;
  IF t2 IS NULL OR d2 IS NULL OR tr IS NULL OR cl IS NULL OR loc2 IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 066: not enough trucks/drivers/trailers/clients/locations to pick (t2 % d2 % tr % cl % loc2 %)', t2, d2, tr, cl, loc2;
  END IF;
  day0 := current_date + 40;
  -- B-77 as run_checks runs it (texts read above, before the role switch)
  SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO b77_0; RESET ROLE;
  res := res || format('picks t1=%s t2=%s d1=%s d2=%s tr=%s cl=%s day=%s B-77 before=%s', t1, t2, d1, d2, tr, cl, day0, b77_0);

  -- ================================================================================================
  -- S1. THE 7/10 INCIDENT, replayed in its order (05/10 15:06:56 - 15:07:06). E = export #438,
  --     I1 = #451, I2 = #449. With the 7/10 walk I2 opened RT-1220; now it must join E + I1.
  verdict := NULL; lbl := 'S1 7/10 replay';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips; SELECT max(id) INTO aud_max FROM audit_log;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T1E', 'Export', 'Pending', cl, loc1, loc2, day0, day0 + 2, 'RT066-TEST') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T1I1', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST') RETURNING id INTO o2;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T1I2', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST') RETURNING id INTO o3;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;     -- the export's own trip
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    UPDATE orders SET group_id = 'GI-066T1' WHERE id = o2;                                                    -- 15:06:56
    UPDATE orders SET group_id = 'GI-066T1' WHERE id = o3;                                                    -- 15:06:57
    UPDATE orders SET matched_import_id = 'rec066T1I1' WHERE id = o1;                                         -- 15:07:04
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o2;     -- 15:07:05
    UPDATE orders SET group_id = 'GI-066T1|rec066T1I1,rec066T1I2' WHERE id = o2;                             -- 15:07:06 suffix on I1
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o3;     -- same second: I2, still bare
    UPDATE orders SET group_id = 'GI-066T1|rec066T1I1,rec066T1I2' WHERE id = o3;                             -- then the suffix on I2
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    rt3 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o3 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
    SELECT string_agg(after_data->>'reason', ' / ' ORDER BY id) INTO why FROM audit_log
     WHERE id > aud_max AND actor = 'trigger:rt_sync' AND table_name = 'orders' AND record_id IN (o1::text, o2::text, o3::text)
       AND (after_data ? 'split' OR after_data ? 'conflict');
    SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO b77_v; RESET ROLE;
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 = rt1 AND rt3 = rt1 AND n_rt = 1 AND why IS NULL AND b77_v = b77_0
                    THEN format('ok E, I1, I2 on one round trip (%s new), no split/conflict, B-77 %s', n_rt, b77_v)
                    ELSE format('FAIL E rt %s, I1 rt %s, I2 rt %s, %s new round trips, audit %s, B-77 %s -> %s', rt1, rt2, rt3, n_rt, why, b77_0, b77_v) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S2..S5. A second member of a group gets the same truck: it joins the first member's round trip,
  --     whatever suffix each one carries at that moment.
  DECLARE g1 text; g2 text; dir text; k int;
  BEGIN
    FOR k IN 2..5 LOOP
      verdict := NULL;
      lbl := CASE k WHEN 2 THEN 'S2 bare/bare' WHEN 3 THEN 'S3 suffix/suffix' WHEN 4 THEN 'S4 bare holder, suffixed newcomer' ELSE 'S5 GRP export group' END;
      g1 := CASE k WHEN 2 THEN 'GI-066T2' WHEN 3 THEN 'GI-066T3|rec066T3A,rec066T3B' WHEN 4 THEN 'GI-066T4' ELSE 'GRP-066T5|rec066T5A,rec066T5B' END;
      g2 := CASE k WHEN 2 THEN 'GI-066T2' WHEN 3 THEN 'GI-066T3|rec066T3B,rec066T3A' WHEN 4 THEN 'GI-066T4|rec066T4A,rec066T4B' ELSE 'GRP-066T5' END;
      dir := CASE WHEN k = 5 THEN 'Export' ELSE 'Import' END;
      BEGIN
        SELECT max(id) INTO rt_max FROM ct_round_trips;
        INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
        VALUES ('rec066T' || k || 'A', dir, 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST', g1) RETURNING id INTO o1;
        INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
        VALUES ('rec066T' || k || 'B', dir, 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST', g2) RETURNING id INTO o2;
        UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
        UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o2;
        rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
        rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
        SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
        verdict := CASE WHEN rt1 IS NOT NULL AND rt2 = rt1 AND n_rt = 1 THEN format('ok %s + %s on one round trip', g1, g2)
                        ELSE format('FAIL %s on rt %s, %s on rt %s, %s new round trips', g1, rt1, g2, rt2, n_rt) END;
        RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
      EXCEPTION WHEN others THEN
        GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
        IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
        ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
        ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
      END;
    END LOOP;
  END;

  -- ================================================================================================
  -- S6. Matched pair (unchanged by 066): the import joins the export's round trip.
  verdict := NULL; lbl := 'S6 matched pair';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T6E', 'Export', 'Pending', cl, loc1, loc2, day0, day0 + 2, 'RT066-TEST') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T6I', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST') RETURNING id INTO o2;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    UPDATE orders SET matched_import_id = 'rec066T6I' WHERE id = o1;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o2;
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 = rt1 AND n_rt = 1 THEN 'ok export + matched import on one round trip'
                    ELSE format('FAIL export rt %s, import rt %s, %s new', rt1, rt2, n_rt) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S7. Rota (unchanged by 066): the order whose rotation_id names a placed order joins its trip.
  verdict := NULL; lbl := 'S7 rota';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T7A', 'Import', 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, rotation_id)
    VALUES ('rec066T7B', 'Export', 'Pending', cl, loc1, loc2, day0 + 3, day0 + 5, 'RT066-TEST', 'rec066T7A') RETURNING id INTO o2;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o2;
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 = rt1 AND n_rt = 1 THEN 'ok rota leg on its anchor''s round trip'
                    ELSE format('FAIL anchor rt %s, rota rt %s, %s new', rt1, rt2, n_rt) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S8. No related round trip: a new one, with 033's reason.
  verdict := NULL; lbl := 'S8 no related round trip';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips; SELECT max(id) INTO aud_max FROM audit_log;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T8A', 'Import', 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST', 'GI-066T8|rec066T8A') RETURNING id INTO o1;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
    SELECT string_agg(after_data->>'reason', ' / ' ORDER BY id) INTO why FROM audit_log
     WHERE id > aud_max AND actor = 'trigger:rt_sync' AND table_name = 'ct_round_trips' AND after_data->>'source_order' = o1::text;
    verdict := CASE WHEN rt1 > rt_max AND n_rt = 1 AND why LIKE 'no related round trip%' THEN 'ok a new round trip, reason "no related round trip"'
                    ELSE format('FAIL rt %s, %s new, reason %s', rt1, n_rt, why) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S9. Relatives already on TWO live round trips: 033 does not merge - audit "conflict", the newcomer
  --     gets no round trip (B-01 shows it), and the two trips' related pair is B-77 (+1).
  --     X export (truck 1) and Y import (truck 2) each get their own trip, THEN X is matched to Y and Y
  --     carries the group suffix; Z (bare group) gets truck 1 -> its walk reaches Y (base) and X (pair).
  verdict := NULL; lbl := 'S9 two related round trips';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips; SELECT max(id) INTO aud_max FROM audit_log;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T9X', 'Export', 'Pending', cl, loc1, loc2, day0, day0 + 2, 'RT066-TEST') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T9Y', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST') RETURNING id INTO o2;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T9Z', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST', 'GI-066T9') RETURNING id INTO o3;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    UPDATE orders SET truck_id = t2, driver_id = d2, trailer_id = tr, status = 'Assigned' WHERE id = o2;
    UPDATE orders SET matched_import_id = 'rec066T9Y' WHERE id = o1;
    UPDATE orders SET group_id = 'GI-066T9|rec066T9Y,rec066T9Z' WHERE id = o2;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o3;
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    rt3 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o3 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
    SELECT string_agg(after_data->>'reason', ' / ' ORDER BY id) INTO why FROM audit_log
     WHERE id > aud_max AND actor = 'trigger:rt_sync' AND table_name = 'orders' AND record_id = o3::text AND (after_data->>'conflict')::boolean;
    SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO b77_v; RESET ROLE;
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 IS NOT NULL AND rt1 <> rt2 AND rt3 IS NULL AND n_rt = 2 AND why LIKE 'conflict:%' AND b77_v = b77_0 + 1
                    THEN format('ok Z left without a round trip, audit "conflict", B-77 %s -> %s', b77_0, b77_v)
                    ELSE format('FAIL X rt %s, Y rt %s, Z rt %s, %s new, audit %s, B-77 %s -> %s', rt1, rt2, rt3, n_rt, why, b77_0, b77_v) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S10. The related round trip runs ANOTHER truck: a separate round trip, as today (033's reason
  --      "runs another vehicle" - reachable now through the base), and B-77 counts the pair (+1).
  verdict := NULL; lbl := 'S10 another truck';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips; SELECT max(id) INTO aud_max FROM audit_log;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T10A', 'Import', 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST', 'GI-066T10') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T10B', 'Import', 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST', 'GI-066T10|rec066T10A,rec066T10B') RETURNING id INTO o2;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    UPDATE orders SET truck_id = t2, driver_id = d2, trailer_id = tr, status = 'Assigned' WHERE id = o2;
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max;
    SELECT string_agg(after_data->>'reason', ' / ' ORDER BY id) INTO why FROM audit_log
     WHERE id > aud_max AND actor = 'trigger:rt_sync' AND table_name = 'ct_round_trips' AND after_data->>'source_order' = o2::text;
    SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO b77_v; RESET ROLE;
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 IS NOT NULL AND rt1 <> rt2 AND n_rt = 2 AND why LIKE '%runs another vehicle%' AND b77_v = b77_0 + 1
                    THEN format('ok a separate round trip ("runs another vehicle"), B-77 %s -> %s', b77_0, b77_v)
                    ELSE format('FAIL rt %s / %s, %s new, reason %s, B-77 %s -> %s', rt1, rt2, n_rt, why, b77_0, b77_v) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S11. rt_link_split sees the base: the 7/10 shape after the fact. E + I1 share a trip (pair; I1
  --      carries the suffix); I2 has its own trip on the same truck, then joins the group bare.
  --      Import-only vs export+import is NOT 037's auto-merge shape: audit "split", no merge, B-77 +1.
  verdict := NULL; lbl := 'S11 split seen, not merged';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips; SELECT max(id) INTO aud_max FROM audit_log;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T11E', 'Export', 'Pending', cl, loc1, loc2, day0, day0 + 2, 'RT066-TEST') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
    VALUES ('rec066T11I1', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST') RETURNING id INTO o2;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T11I2', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST', 'GI-066T11X') RETURNING id INTO o3;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    UPDATE orders SET matched_import_id = 'rec066T11I1' WHERE id = o1;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o2;
    UPDATE orders SET group_id = 'GI-066T11|rec066T11I1,rec066T11I2' WHERE id = o2;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o3;   -- own trip (other group)
    UPDATE orders SET group_id = 'GI-066T11' WHERE id = o3;                                                -- joins the group, bare
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    rt3 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o3 AND r.status <> 'cancelled');
    SELECT count(*) INTO n_rt FROM ct_round_trips WHERE id > rt_max AND status <> 'cancelled';
    SELECT string_agg(after_data->>'reason', ' / ' ORDER BY id) INTO why FROM audit_log
     WHERE id > aud_max AND actor = 'trigger:rt_sync' AND table_name = 'orders' AND record_id = o3::text
       AND (after_data->>'split')::boolean AND after_data->>'other_rt_ids' = rt1::text;
    SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO b77_v; RESET ROLE;
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 = rt1 AND rt3 IS NOT NULL AND rt3 <> rt1 AND n_rt = 2 AND why LIKE 'split:%' AND b77_v = b77_0 + 1
                    THEN format('ok audit "split" (other RT = the pair''s), both trips live, B-77 %s -> %s', b77_0, b77_v)
                    ELSE format('FAIL E rt %s, I1 rt %s, I2 rt %s, %s live new, audit %s, B-77 %s -> %s', rt1, rt2, rt3, n_rt, why, b77_0, b77_v) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S12. 037's ONE auto-merge shape, unchanged (same truck, one trip export-only, the other
  --      import-only), now also when the relation is the base only: merged into the older trip.
  verdict := NULL; lbl := 'S12 037 shape merges';
  BEGIN
    SELECT max(id) INTO rt_max FROM ct_round_trips;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T12E', 'Export', 'Pending', cl, loc1, loc2, day0, day0 + 2, 'RT066-TEST', 'GX-066T12|rec066T12E,rec066T12I') RETURNING id INTO o1;
    INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference, group_id)
    VALUES ('rec066T12I', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST', 'GX-066T12Z') RETURNING id INTO o2;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
    UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o2;
    rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
    rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    UPDATE orders SET group_id = 'GX-066T12' WHERE id = o2;
    rt3 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
    verdict := CASE WHEN rt1 IS NOT NULL AND rt2 IS NOT NULL AND rt1 <> rt2 AND rt3 = least(rt1, rt2)
                         AND (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled') = rt3
                    THEN 'ok two trips merged into the older one (037 shape, rt_merge)'
                    ELSE format('FAIL export rt %s, import rt %s -> %s after the relation', rt1, rt2, rt3) END;
    RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
    IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
    ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
    ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
  END;

  -- ================================================================================================
  -- S13. Settled history is out of B-77 (coordinator 7/10; the production pair #268 / #302): two
  --      imports on two trucks, each on its own round trip, then a stale IMPORT->IMPORT
  --      matched_import_id links them (rt_link_split: audit "split" only - two vehicles, no merge).
  --      Both trips open -> B-77 +1; the first delivered (its trip auto-closes, 046) -> still +1, one
  --      trip is open; both delivered (both trips closed) -> back to b77_0. Counted only while one
  --      trip can still be acted on; two closed trips have their payroll/expenses booked already.
  DECLARE v_open numeric; v_half numeric; st1h text; st2h text; st1 text; st2 text;
  BEGIN
    verdict := NULL; lbl := 'S13 closed+closed out, closed+open in';
    BEGIN
      INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
      VALUES ('rec066T13X', 'Import', 'Pending', cl, loc2, loc1, day0, day0 + 2, 'RT066-TEST') RETURNING id INTO o1;
      INSERT INTO orders (legacy_id, direction, status, client_id, loading_location_1_id, unloading_location_1_id, loading_datetime, delivery_datetime, reference)
      VALUES ('rec066T13Y', 'Import', 'Pending', cl, loc2, loc1, day0 + 3, day0 + 5, 'RT066-TEST') RETURNING id INTO o2;
      UPDATE orders SET truck_id = t1, driver_id = d1, trailer_id = tr, status = 'Assigned' WHERE id = o1;
      UPDATE orders SET truck_id = t2, driver_id = d2, trailer_id = tr, status = 'Assigned' WHERE id = o2;
      UPDATE orders SET matched_import_id = 'rec066T13Y' WHERE id = o1;                                       -- the stale link
      rt1 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o1 AND r.status <> 'cancelled');
      rt2 := (SELECT l.rt_id FROM ct_rt_legs l JOIN ct_round_trips r ON r.id = l.rt_id WHERE l.order_id = o2 AND r.status <> 'cancelled');
      SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO v_open; RESET ROLE;
      UPDATE orders SET status = 'Delivered' WHERE id = o1;
      SELECT status INTO st1h FROM ct_round_trips WHERE id = rt1; SELECT status INTO st2h FROM ct_round_trips WHERE id = rt2;
      SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO v_half; RESET ROLE;
      UPDATE orders SET status = 'Delivered' WHERE id = o2;
      SELECT status INTO st1 FROM ct_round_trips WHERE id = rt1; SELECT status INTO st2 FROM ct_round_trips WHERE id = rt2;
      SET LOCAL ROLE tms_check_runner; EXECUTE b77_sql INTO b77_v; RESET ROLE;
      verdict := CASE WHEN rt1 IS NOT NULL AND rt2 IS NOT NULL AND rt1 <> rt2 AND st1h = 'closed' AND st2h = 'planned'
                           AND st1 = 'closed' AND st2 = 'closed' AND v_open = b77_0 + 1 AND v_half = b77_0 + 1 AND b77_v = b77_0
                      THEN format('ok B-77 %s -> open+open %s, closed+planned %s, closed+closed %s', b77_0, v_open, v_half, b77_v)
                      ELSE format('FAIL rt %s / %s, %s+%s then %s+%s, B-77 %s -> open+open %s, half %s, both delivered %s',
                                  rt1, rt2, st1h, st2h, st1, st2, b77_0, v_open, v_half, b77_v) END;
      RAISE EXCEPTION 'rt066 undo' USING HINT = 'rt066_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
      IF hint = 'rt066_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
      ELSIF hint = 'rt066_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
      ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
    END;
  END;

  RAISE EXCEPTION 'RULES TEST 066 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %', ok, bad, array_to_string(res, '  |  ');
END
$dry$;
