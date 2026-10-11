-- RULES TEST 069 (one Veroia day: 028 moves the cross-dock once, order_cd_stop_follow, ramp_follows_stop):
-- the nine cases of plan docs/weekly-natl-redesign/PLAN.md section 6.1 ("SQL"), on TEST rows, then undone.
-- (Not the dry run: 069_hub_day_once_dryrun.sql runs 069 itself and undoes it, BEFORE 069. This file runs
-- AFTER 069, the way 066_rt_group_base_join_test.sql ran after 066.)
-- ONE statement. It ends with a deliberate RAISE EXCEPTION, so Postgres undoes ALL of it - no order, stop,
-- national load, ramp line or audit row stays behind. The red error message IS the result:
--   "RULES TEST 069 finished - EVERYTHING UNDONE, nothing kept. Result: 9 OK, 0 FAIL || ...".
-- EXPECTED: "Result: 9 OK, 0 FAIL". Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Proven on the PGlite copy of the schema (tms-auditor/test/fixtures/schema.sql + the live 028 text):
-- 9 OK, 0 FAIL after 069; with 028 as it lives today the same file stops at its first guard.
-- Only trace: identity/sequence numbers (orders, stops, national loads, ramp lines, audit rows) are skipped.
--
-- DRAFT - run ONLY after 069 said "069 OK", after 15:00, with an explicit yes (it writes, then undoes).
-- ASCII only (clipboard-safe). TEST rows only: legacy_id rec069T..., reference WN069-TEST, dated 40 days
-- ahead, no truck / driver / partner (so no round trip or payroll trigger has anything to do). Real rows
-- are never written. Each case runs in its own sub-block and is UNDONE at its end by a marker exception,
-- so the next one starts from the same database; an unexpected error is recorded as ERROR with its message.
-- The fixture of every case: a VS import order (loading D, delivery D+4, cross-dock D+3) with its stops
-- (Loading D, Unloading D+4, Cross-dock D+3), its Pending Direct national load (Veroia D+3 -> customer
-- D+4) with its stops (Veroia Loading D+3, Unloading D+4), and one Planned Ramp line per Veroia stop
-- (the national Veroia stop's and the order's Cross-dock stop's), dated D+3.
-- Cases: 1 only the delivery moves -> cross-dock +delta ONCE, its stop = cross-dock, the Pending load and
-- its stops +delta, both Ramp lines follow; 2 delivery AND cross-dock in one write -> the written value
-- stays (no second move), stop = cross-dock; 3 only the cross-dock -> its stop follows, the national load
-- is not touched (the front's sync owns it); 4 a stop's day moves -> its Planned line of the OLD day moves,
-- Done and postponed lines stay; then onto a day that already has its line -> the moving line gets
-- deleted_at, never two; 5 no VS / no cross-dock -> exactly as today (028 unchanged there); 6 THE LIMIT:
-- delivery + a cross-dock EQUAL to the old one -> the cross-dock moves by delta (written in 069's comment);
-- 7 empty cross-dock + a dated Cross-dock stop + a delivery move -> the stop moves by delta as today;
-- 8 cross-dock -> NULL (VS closes) -> order_cd_stop_follow touches nothing; 9 one stop with TWO Planned
-- lines on different days -> only the old day's line moves, the other stays.
DO $dry$
DECLARE
  d date; k int;
  o1 bigint; nl1 bigint; s_ld bigint; s_ul bigint; s_cd bigint; s_nh bigint; s_nu bigint;
  r1 bigint; r2 bigint; r3 bigint; r4 bigint; r5 bigint;
  aud_max bigint; n int; n2 int;
  v_cd date; v_cds date; v_ul date; v_ld date; v_nl date; v_nld date; v_nh date; v_nu date;
  p1 date; p2 date; p3 date; p4 date; p5 date; x1 boolean; x3 boolean; x4 boolean; x5 boolean;
  verdict text; lbl text; hint text; msg text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  -- 069 applied
  IF to_regprocedure('public.order_cd_stop_follow()') IS NULL OR to_regprocedure('public.ramp_follows_stop()') IS NULL
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) <> '4b5d279f21f981a11d35a5deb655269a' THEN
    RAISE EXCEPTION 'RULES TEST 069: 069 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec069T%' OR reference = 'WN069-TEST')
     OR EXISTS (SELECT 1 FROM order_stops WHERE legacy_id LIKE 'rec069T%')
     OR EXISTS (SELECT 1 FROM national_loads WHERE legacy_id LIKE 'rec069T%')
     OR EXISTS (SELECT 1 FROM ramp WHERE notes LIKE 'STOP:rec069T%') THEN
    RAISE EXCEPTION 'RULES TEST 069: test ids (rec069T..., WN069-TEST) already exist - stop';
  END IF;
  d := current_date + 40;
  res := res || format('day D = %s', d);

  FOR k IN 1..9 LOOP
    verdict := NULL;
    lbl := CASE k WHEN 1 THEN 'C1 delivery only' WHEN 2 THEN 'C2 delivery+cross-dock' WHEN 3 THEN 'C3 cross-dock only'
                  WHEN 4 THEN 'C4 ramp follows its stop' WHEN 5 THEN 'C5 no VS, no cross-dock' WHEN 6 THEN 'C6 the limit'
                  WHEN 7 THEN 'C7 empty cross-dock, dated stop' WHEN 8 THEN 'C8 cross-dock to NULL' ELSE 'C9 two Planned lines' END;
    BEGIN
      -- ---- the fixture (case 5: no VS and no cross-dock; case 7: no cross-dock) ----
      INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime, cross_dock_date, reference)
      VALUES ('rec069T' || k || 'O', 'International', 'Import', 'Pending', k <> 5, d, d + 4,
              CASE WHEN k IN (5, 7) THEN NULL ELSE d + 3 END, 'WN069-TEST') RETURNING id INTO o1;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id) VALUES ('rec069T' || k || 'L', 'Loading', 1, d, o1) RETURNING id INTO s_ld;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id) VALUES ('rec069T' || k || 'U', 'Unloading', 1, d + 4, o1) RETURNING id INTO s_ul;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id) VALUES ('rec069T' || k || 'C', 'Cross-dock', 1, d + 3, o1) RETURNING id INTO s_cd;
      INSERT INTO national_loads (legacy_id, status, source_type, source_order_id, loading_datetime, delivery_datetime, reference)
      VALUES ('rec069T' || k || 'N', 'Pending', 'Direct', o1, ((d + 3)::text || 'T12:00:00+00')::timestamptz, ((d + 4)::text || 'T12:00:00+00')::timestamptz, 'WN069-TEST')
      RETURNING id INTO nl1;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, national_load_id) VALUES ('rec069T' || k || 'H', 'Loading', 1, d + 3, nl1) RETURNING id INTO s_nh;
      INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, national_load_id) VALUES ('rec069T' || k || 'V', 'Unloading', 1, d + 4, nl1) RETURNING id INTO s_nu;
      INSERT INTO ramp (plan_date, type, status, notes) VALUES (d + 3, 'Loading', 'Planned', 'STOP:rec069T' || k || 'H') RETURNING id INTO r1;
      INSERT INTO ramp (plan_date, type, status, notes) VALUES (d + 3, 'Pickup', 'Planned', 'STOP:rec069T' || k || 'C') RETURNING id INTO r2;
      SELECT coalesce(max(id), 0) INTO aud_max FROM audit_log;

      -- ---- the act ----
      IF k IN (1, 5, 7) THEN UPDATE orders SET delivery_datetime = d + 5 WHERE id = o1;
      ELSIF k = 2 THEN UPDATE orders SET delivery_datetime = d + 5, cross_dock_date = d + 2 WHERE id = o1;
      ELSIF k = 3 THEN UPDATE orders SET cross_dock_date = d + 1 WHERE id = o1;
      ELSIF k = 4 THEN
        INSERT INTO ramp (plan_date, type, status, notes) VALUES (d + 3, 'Loading', 'Done', 'STOP:rec069T4H') RETURNING id INTO r3;
        INSERT INTO ramp (plan_date, type, status, notes, postponed_to) VALUES (d + 3, 'Loading', 'Planned', 'STOP:rec069T4H', d + 6) RETURNING id INTO r4;
        INSERT INTO ramp (plan_date, type, status, notes) VALUES (d + 1, 'Loading', 'Planned', 'STOP:rec069T4H') RETURNING id INTO r5;
        UPDATE order_stops SET datetime = d + 2 WHERE id = s_nh;   -- (a) to a free day
        SELECT plan_date INTO p2 FROM ramp WHERE id = r1;          -- r1 after (a)
        UPDATE order_stops SET datetime = d + 1 WHERE id = s_nh;   -- (b) onto r5's day
      ELSIF k = 6 THEN UPDATE orders SET delivery_datetime = d + 5, cross_dock_date = d + 3 WHERE id = o1;
      ELSIF k = 8 THEN UPDATE orders SET cross_dock_date = NULL WHERE id = o1;
      ELSE
        INSERT INTO ramp (plan_date, type, status, notes) VALUES (d + 1, 'Pickup', 'Planned', 'STOP:rec069T9C') RETURNING id INTO r3;
        UPDATE orders SET cross_dock_date = d + 2 WHERE id = o1;
      END IF;

      -- ---- what the table holds now ----
      SELECT cross_dock_date INTO v_cd FROM orders WHERE id = o1;
      SELECT datetime INTO v_cds FROM order_stops WHERE id = s_cd;
      SELECT datetime INTO v_ld FROM order_stops WHERE id = s_ld;
      SELECT datetime INTO v_ul FROM order_stops WHERE id = s_ul;
      SELECT (loading_datetime AT TIME ZONE 'UTC')::date, (delivery_datetime AT TIME ZONE 'UTC')::date INTO v_nl, v_nld FROM national_loads WHERE id = nl1;
      SELECT datetime INTO v_nh FROM order_stops WHERE id = s_nh;
      SELECT datetime INTO v_nu FROM order_stops WHERE id = s_nu;
      SELECT plan_date, deleted_at IS NOT NULL INTO p1, x1 FROM ramp WHERE id = r1;
      SELECT plan_date INTO p5 FROM ramp WHERE id = r2;
      SELECT count(*) INTO n FROM audit_log WHERE id > aud_max AND actor = 'trigger:order_dates_follow' AND table_name = 'orders' AND record_id = o1::text;
      SELECT count(*) INTO n2 FROM audit_log WHERE id > aud_max AND actor = 'trigger:order_cd_stop_follow' AND record_id = s_cd::text;

      IF k = 1 THEN
        verdict := CASE WHEN v_cd = d + 4 AND n = 1 AND v_cds = d + 4 AND v_nl = d + 4 AND v_nld = d + 5 AND v_nh = d + 4 AND v_nu = d + 5
                             AND p1 = d + 4 AND p5 = d + 4 AND v_ul = d + 5 AND v_ld = d
                        THEN 'ok cross-dock +1 once (1 audit row), its stop, the Pending load, its stops and both Ramp lines on D+4'
                        ELSE format('FAIL cd %s (audit %s), cd stop %s, load %s-%s, load stops %s/%s, ramp %s/%s, order stops %s/%s', v_cd, n, v_cds, v_nl, v_nld, v_nh, v_nu, p1, p5, v_ld, v_ul) END;
      ELSIF k = 2 THEN
        verdict := CASE WHEN v_cd = d + 2 AND n = 0 AND v_cds = d + 2 AND p5 = d + 2
                        THEN 'ok the written cross-dock D+2 stays (no second move), its stop and Ramp line on D+2'
                        ELSE format('FAIL cd %s (028 audit %s), cd stop %s, ramp %s', v_cd, n, v_cds, p5) END;
      ELSIF k = 3 THEN
        verdict := CASE WHEN v_cd = d + 1 AND v_cds = d + 1 AND n2 = 1 AND p5 = d + 1 AND v_nl = d + 3 AND v_nh = d + 3 AND p1 = d + 3
                        THEN 'ok its stop and Ramp line on D+1 (1 audit row); the national load and its line untouched'
                        ELSE format('FAIL cd %s, cd stop %s (audit %s), ramp %s; load %s, load stop %s, its line %s', v_cd, v_cds, n2, p5, v_nl, v_nh, p1) END;
      ELSIF k = 4 THEN
        SELECT plan_date, deleted_at IS NOT NULL INTO p3, x3 FROM ramp WHERE id = r3;
        SELECT plan_date, deleted_at IS NOT NULL INTO p4, x4 FROM ramp WHERE id = r4;
        SELECT deleted_at IS NOT NULL INTO x5 FROM ramp WHERE id = r5;
        verdict := CASE WHEN p2 = d + 2 AND p1 = d + 2 AND x1 AND NOT x5 AND p3 = d + 3 AND NOT x3 AND p4 = d + 3 AND NOT x4
                        THEN 'ok Planned line moved D+3 -> D+2; onto D+1 (which has a line) it got deleted_at, the D+1 line stays; Done and postponed stayed'
                        ELSE format('FAIL r1 after (a) %s, after (b) %s deleted %s; D+1 line deleted %s; Done %s/%s; postponed %s/%s', p2, p1, x1, x5, p3, x3, p4, x4) END;
      ELSIF k = 5 THEN
        verdict := CASE WHEN v_cd IS NULL AND n = 0 AND v_ld = d AND v_ul = d + 5 AND v_cds = d + 4 AND v_nl = d + 3 AND v_nh = d + 3
                        THEN 'ok as today: order stops follow, no cross-dock, no national load moved (no VS)'
                        ELSE format('FAIL cd %s, stops %s/%s/%s, load %s, load stop %s', v_cd, v_ld, v_ul, v_cds, v_nl, v_nh) END;
      ELSIF k = 6 THEN
        verdict := CASE WHEN v_cd = d + 4 AND n = 1 AND v_cds = d + 4
                        THEN 'ok THE LIMIT: a cross-dock written EQUAL to the old one still moves by delta (D+4), its stop follows'
                        ELSE format('FAIL cd %s (028 audit %s), cd stop %s', v_cd, n, v_cds) END;
      ELSIF k = 7 THEN
        verdict := CASE WHEN v_cd IS NULL AND v_cds = d + 4 AND v_nl = d + 4 AND p5 = d + 4
                        THEN 'ok empty cross-dock: the dated Cross-dock stop moved by delta as today (D+4), its Ramp line followed'
                        ELSE format('FAIL cd %s, cd stop %s, load %s, ramp %s', v_cd, v_cds, v_nl, p5) END;
      ELSIF k = 8 THEN
        verdict := CASE WHEN v_cd IS NULL AND v_cds = d + 3 AND n2 = 0 AND p5 = d + 3
                        THEN 'ok cross-dock NULL: its stop and Ramp line untouched'
                        ELSE format('FAIL cd %s, cd stop %s (audit %s), ramp %s', v_cd, v_cds, n2, p5) END;
      ELSE
        SELECT plan_date, deleted_at IS NOT NULL INTO p3, x3 FROM ramp WHERE id = r3;
        verdict := CASE WHEN v_cds = d + 2 AND p5 = d + 2 AND p3 = d + 1 AND NOT x3
                        THEN 'ok only the old day''s line moved (D+3 -> D+2); the D+1 line stayed'
                        ELSE format('FAIL cd stop %s, old-day line %s, D+1 line %s deleted %s', v_cds, p5, p3, x3) END;
      END IF;
      RAISE EXCEPTION 'wn069 undo' USING HINT = 'wn069_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
      IF hint = 'wn069_undo' AND verdict LIKE 'ok%' THEN ok := ok + 1; res := res || (lbl || ' ' || verdict);
      ELSIF hint = 'wn069_undo' THEN bad := bad + 1; res := res || (lbl || ' ' || verdict);
      ELSE bad := bad + 1; res := res || (lbl || ' ERROR ' || msg); END IF;
    END;
  END LOOP;

  RAISE EXCEPTION 'RULES TEST 069 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %', ok, bad, array_to_string(res, '  |  ');
END
$dry$;
