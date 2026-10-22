-- RULES TEST 071b (one truck / one driver at a time): 8 cases on TEST rows, then undone. Runs AFTER 071b said
-- "071b OK". On PGlite at build time; on production OPTIONAL, after 15:00, with an explicit yes (identity and code
-- sequences advance, nothing else stays).
-- Every case starts from cycle A: OWNED, truck T1, driver D1, day D 06:00-14:00, no stops.
-- Cases: 1 same truck 10-18 -> refused (truck); 2 same truck 14-20 -> OK (half-open: ends 14:00, next starts 14:00);
-- 3 another truck, same driver 10-18 -> refused (driver); 4 same truck 10-18 but cancelled -> OK; 5 a PARTNER cycle
-- 10-18 -> OK; 6 a model=1 round trip on the same truck -> OK (today's round trips untouched); 7 a cycle 15-18 whose
-- first stop moves to 12:00 -> refused at commit (the window follows the stops, the constraint sees it);
-- 8 another truck and driver 10-18 -> OK.
-- EXPECTED: "RULES TEST 071b finished - EVERYTHING UNDONE, nothing kept. Result: 8 OK, 0 FAIL". ASCII only.
DO $dry$
DECLARE
  d date; k int; la bigint; lb bigint; t1 bigint; t2 bigint; d1 bigint; d2 bigint; pa bigint; a bigint; b bigint; s bigint;
  want text[] := ARRAY['con:rt_v2_truck_once', 'ok', 'con:rt_v2_driver_once', 'ok', 'ok', 'ok', 'con:rt_v2_truck_once', 'ok'];
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_truck_once')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_driver_once') THEN
    RAISE EXCEPTION 'RULES TEST 071b: 071b is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec071bT%') OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-071B-%')
     OR EXISTS (SELECT 1 FROM drivers WHERE full_name LIKE 'TEST 071B %') OR EXISTS (SELECT 1 FROM partners WHERE company_name LIKE 'TEST 071B %') THEN
    RAISE EXCEPTION 'RULES TEST 071b: test ids already exist - stop';
  END IF;
  d := (now() AT TIME ZONE 'Europe/Athens')::date + 41;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071bTA', 'TEST 071B A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071bTB', 'TEST 071B B') RETURNING id INTO lb;
  INSERT INTO trucks (license_plate) VALUES ('TEST-071B-1') RETURNING id INTO t1;
  INSERT INTO trucks (license_plate) VALUES ('TEST-071B-2') RETURNING id INTO t2;
  INSERT INTO drivers (full_name) VALUES ('TEST 071B 1') RETURNING id INTO d1;
  INSERT INTO drivers (full_name) VALUES ('TEST 071B 2') RETURNING id INTO d2;
  INSERT INTO partners (company_name) VALUES ('TEST 071B partner') RETURNING id INTO pa;

  FOR k IN 1..8 LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', t1, d1, d, d, (d + time '06:00') AT TIME ZONE 'Europe/Athens',
              (d + time '14:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:071b') RETURNING id INTO a;
      IF k IN (1, 2, 3, 4, 8) THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', CASE WHEN k IN (3, 8) THEN t2 ELSE t1 END, CASE WHEN k = 3 THEN d1 ELSE d2 END, d, d,
                (d + CASE WHEN k = 2 THEN time '14:00' ELSE time '10:00' END) AT TIME ZONE 'Europe/Athens',
                (d + CASE WHEN k = 2 THEN time '20:00' ELSE time '18:00' END) AT TIME ZONE 'Europe/Athens',
                CASE WHEN k = 4 THEN 'cancelled' ELSE 'planned' END, 'planner', 'test:071b');
      ELSIF k = 5 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, partner_id, date_start, date_end, start_at, end_at, status, source, created_by)
        VALUES (2, 'NATL', 'PARTNER', pa, d, d, (d + time '10:00') AT TIME ZONE 'Europe/Athens',
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:071b');
      ELSIF k = 6 THEN
        INSERT INTO ct_round_trips (scope, trip_type, truck_id, driver_id, date_start, status, source, created_by)
        VALUES ('NATL', 'OWNED', t1, d2, d, 'planned', 'manual', 'test:071b');
      ELSE   -- 7
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', t1, d2, d, d, (d + time '15:00') AT TIME ZONE 'Europe/Athens',
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:071b') RETURNING id INTO b;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (b, 1, la, 'KATHODOS', (d + time '15:00') AT TIME ZONE 'Europe/Athens',
                (d + time '16:00') AT TIME ZONE 'Europe/Athens', 'test:071b') RETURNING id INTO s;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (b, 2, lb, 'KATHODOS', (d + time '17:00') AT TIME ZONE 'Europe/Athens',
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'test:071b');
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        UPDATE rt_stops SET planned_from = (d + time '12:00') AT TIME ZONE 'Europe/Athens' WHERE id = s;
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;
      verdict := CASE WHEN want[k] = 'ok' THEN 'ok' ELSE 'FAIL no error' END;
      RAISE EXCEPTION 'wn071b undo' USING HINT = 'wn071b_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn071b_undo' THEN coalesce(verdict, 'FAIL no verdict')
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

  RAISE EXCEPTION 'RULES TEST 071b finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$dry$;
