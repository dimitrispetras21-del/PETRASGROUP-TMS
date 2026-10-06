-- RULES TEST 063 (local line guard): every rule of 063 exercised on a REAL live order, then undone.
-- (Not the dry run: 063_local_line_guard_dryrun.sql runs 063 itself and undoes it, BEFORE 063. This file
-- runs AFTER 063, the way 060_local_relay_test.sql ran after 060.)
-- ONE statement. It ends with a deliberate RAISE EXCEPTION, so Postgres undoes ALL of it - no relay, no
-- payroll line, no audit row stays behind. The red error message IS the result:
--   "RULES TEST 063 finished - EVERYTHING UNDONE, nothing kept. Result: N OK, 0 FAIL || ...".
-- EXPECTED: "Result: N OK, 0 FAIL" with N + (the number of "skipped" items in the panel) = 25.
--   25 = every example exists (proven on the PGlite copy: 25 OK, 0 FAIL, nothing skipped). The only
--   example production could lack is a live RT payroll line (S10c): then "S10c skipped (...)".
--   Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Only trace: identity/sequence numbers (local_moves and dl_entries ids) are skipped.
--
-- DRAFT - run ONLY after 063 said "063 OK", after 15:00, with an explicit yes (it attempts writes).
-- ASCII only (clipboard-safe). Picked BY QUERY inside the block, never hard-coded: T1 = a live own-fleet
-- import with a trailer and a delivery day X and no live local delivery yet; D1 = an active driver who
-- is not T1's driver and has no live relay and no live local line on X (so the line below is the test's
-- own); D2 = another active driver. Real relays and lines of other drivers/days are never touched.
-- Each scenario runs in its own sub-block (BEGIN ... EXCEPTION WHEN others): an unexpected error is
-- recorded as FAIL with its message and undoes only that scenario. A write that SHOULD be refused and is
-- not is undone at once too (marker exception), so one broken rule never leaks into the next scenario.
DO $dry$
DECLARE
  t1 bigint; t1_drv bigint; x date; trl bigint; d1 bigint; d2 bigint; loc bigint; any_rt bigint;
  r1 bigint; r2 bigint; r3 bigint; r4 bigint; lid bigint; lid2 bigint; nid bigint; rtl bigint;
  e dl_entries%rowtype; n bigint; v numeric;
  st text; hint text; t record;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  -- 063 applied = its guard rule is there. Not "the sync carries the flag": a sync that lost it is a
  -- broken 063, and S7b must say so (its relabel refused), not this line.
  IF position('local_relay:line_locked' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'RULES TEST 063: 063 is not applied - nothing to test';
  END IF;

  -- ---- picks (live data, by query) ----------------------------------------------------------
  SELECT o.id, o.driver_id, o.delivery_datetime, o.trailer_id INTO t1, t1_drv, x, trl FROM orders o
   WHERE o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' AND o.direction = 'Import'
     AND NOT coalesce(o.veroia_switch, false) AND o.ops_status IS DISTINCT FROM 'Provisional'
     AND o.parent_order_id IS NULL AND o.driver_id IS NOT NULL AND o.trailer_id IS NOT NULL AND o.delivery_datetime IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.parent_order_id = o.id AND lm.move_kind = 'relay_delivery'
                      AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled')
   ORDER BY o.delivery_datetime DESC, o.id DESC LIMIT 1;
  IF t1 IS NULL THEN RAISE EXCEPTION 'RULES TEST 063: no candidate import order'; END IF;
  SELECT d.id INTO d1 FROM drivers d WHERE d.deleted_at IS NULL AND coalesce(d.active, true) AND d.id <> t1_drv
     AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id = d.id AND lm.move_date = x AND lm.move_kind <> 'local'
                      AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM dl_entries de WHERE de.driver_id = d.id AND de.entry_date = x
                      AND de.local_move_id IS NOT NULL AND de.deleted_at IS NULL)
   ORDER BY d.id LIMIT 1;
  SELECT d.id INTO d2 FROM drivers d WHERE d.deleted_at IS NULL AND coalesce(d.active, true) AND d.id NOT IN (d1, t1_drv)
   ORDER BY d.id LIMIT 1;
  IF d1 IS NULL OR d2 IS NULL THEN RAISE EXCEPTION 'RULES TEST 063: not enough free drivers (d1 % d2 %)', d1, d2; END IF;
  SELECT id INTO loc FROM locations WHERE legacy_id = 'recJucKOhC1zh4IP3';        -- the Veroia cross-dock
  IF loc IS NULL THEN SELECT min(id) INTO loc FROM locations WHERE deleted_at IS NULL; END IF;
  SELECT min(id) INTO any_rt FROM ct_round_trips;
  SELECT max(id) INTO rtl FROM dl_entries WHERE local_move_id IS NULL AND rt_id IS NOT NULL AND deleted_at IS NULL AND entry_type = 'trip';
  res := res || format('picks t1=%s day=%s d1=%s d2=%s loc=%s rt=%s rt_line=%s', t1, x, d1, d2, loc, any_rt, rtl);

  -- S1. A local delivery on T1 by D1: the sync writes D1's day line (its own writes pass the guard),
  --     and the flag is closed again the moment the sync returns.
  INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
  VALUES ('relay_delivery', t1, d1, trl, loc) RETURNING id INTO r1;
  SELECT id INTO lid FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
  IF lid IS NULL THEN RAISE EXCEPTION 'RULES TEST 063: setup failed - no day line for d1 % on % after relay %', d1, x, r1; END IF;
  SELECT * INTO e FROM dl_entries WHERE id = lid;
  IF e.local_move_id = r1 AND e.date_end = x AND current_setting('tms.local_day_sync', true) IS DISTINCT FROM 'on' THEN
    ok := ok + 1; res := res || format('S1 ok line %s', lid);
  ELSE bad := bad + 1; res := res || format('S1 FAIL anchor %s/%s end %s flag %s', e.local_move_id, r1, e.date_end, current_setting('tms.local_day_sync', true)); END IF;

  -- S2. Each column that ties the line to its relays, written by hand (the SQL editor's role): refused
  --     with 23514 + local_relay:line_locked - BEFORE the CHECKs (dl_one_origin, dl_lm_is_trip) and the FK
  --     would have spoken, and where nothing else would have (day, end, driver, route, detach).
  FOR t IN SELECT * FROM (VALUES
      ('S2a day moved (F4)', format('UPDATE dl_entries SET entry_date = entry_date + 1, date_end = date_end + 1 WHERE id = %s', lid)),
      ('S2b end moved',      format('UPDATE dl_entries SET date_end = date_end + 1 WHERE id = %s', lid)),
      ('S2c driver',         format('UPDATE dl_entries SET driver_id = %s WHERE id = %s', d2, lid)),
      ('S2d route',          format('UPDATE dl_entries SET route = coalesce(route, %L) || %L WHERE id = %s', '', ' rt063', lid)),
      ('S2e rt_id',          format('UPDATE dl_entries SET rt_id = %s WHERE id = %s', coalesce(any_rt, 0), lid)),
      ('S2f type',           format('UPDATE dl_entries SET entry_type = %L WHERE id = %s', 'payment_cash', lid)),
      ('S2g detach',         format('UPDATE dl_entries SET local_move_id = NULL WHERE id = %s', lid))
    ) v(lbl, stmt) LOOP
    BEGIN
      EXECUTE t.stmt;
      RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, hint = PG_EXCEPTION_HINT;
      IF st = '23514' AND hint = 'local_relay:line_locked' THEN ok := ok + 1; res := res || (t.lbl || ' ok');
      ELSE bad := bad + 1; res := res || format('%s FAIL got %s/%s %s', t.lbl, st, hint, SQLERRM); END IF;
    END;
  END LOOP;

  -- S3. The same move as the Worker's role (service_role via PostgREST): the rule is the base's, not
  --     the editor's - and EXECUTE on the (revoked) guard is not needed for it to fire.
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE dl_entries SET entry_date = entry_date + 1, date_end = date_end + 1 WHERE id = lid;
    RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, hint = PG_EXCEPTION_HINT;
    IF st = '23514' AND hint = 'local_relay:line_locked' THEN ok := ok + 1; res := res || 'S3 ok'::text;
    ELSE bad := bad + 1; res := res || format('S3 FAIL got %s/%s %s', st, hint, SQLERRM); END IF;
  END;
  RESET ROLE;

  -- S4. F4 end to end: the line holds money, a hand move to the next day is refused, and afterwards the
  --     day still has exactly ONE live line - the valued one - and the next day none; a re-sync of the
  --     relay changes nothing.
  BEGIN
    UPDATE dl_entries SET trip_value = 50 WHERE id = lid;
    BEGIN
      UPDATE dl_entries SET entry_date = entry_date + 1, date_end = date_end + 1 WHERE id = lid;
      RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
    END;
    UPDATE local_moves SET move_date = move_date WHERE id = r1;              -- a repeat sync of that day
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF hint = 'local_relay:line_locked' AND n = 1 AND e.entry_date = x AND e.trip_value = 50 AND e.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM dl_entries WHERE driver_id = d1 AND entry_date = x + 1 AND local_move_id IS NOT NULL AND deleted_at IS NULL) THEN
      ok := ok + 1; res := res || 'S4 ok'::text;
    ELSE bad := bad + 1; res := res || format('S4 FAIL hint %s lines on day %s line day %s value %s', hint, n, e.entry_date, e.trip_value); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S4 ERROR ' || SQLERRM);
  END;

  -- S5. A write that repeats the system columns unchanged (PostgREST sends whole rows) passes.
  BEGIN
    UPDATE dl_entries SET entry_date = entry_date, date_end = date_end, driver_id = driver_id, route = route, rt_id = rt_id,
           entry_type = entry_type, local_move_id = local_move_id, note = 'rt063 same values' WHERE id = lid;
    IF (SELECT note FROM dl_entries WHERE id = lid) = 'rt063 same values' THEN ok := ok + 1; res := res || 'S5 ok'::text;
    ELSE bad := bad + 1; res := res || 'S5 FAIL note not written'::text; END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S5 ERROR ' || SQLERRM);
  END;

  -- S6. What accounting does on a local line stays open: a) amounts and note; b) review on, then off.
  BEGIN
    UPDATE dl_entries SET trip_value = 12.5, advance = 2, expenses = 3, note = 'rt063 note' WHERE id = lid;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF e.trip_value = 12.5 AND e.advance = 2 AND e.expenses = 3 AND e.note = 'rt063 note' THEN ok := ok + 1; res := res || 'S6a ok'::text;
    ELSE bad := bad + 1; res := res || format('S6a FAIL %s/%s/%s/%s', e.trip_value, e.advance, e.expenses, e.note); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S6a ERROR ' || SQLERRM);
  END;
  BEGIN
    UPDATE dl_entries SET needs_review = true, review_note = 'rt063 look' WHERE id = lid;
    n := (SELECT count(*) FROM dl_entries WHERE id = lid AND needs_review AND review_note = 'rt063 look');
    UPDATE dl_entries SET needs_review = false, review_note = 'rt063 checked' WHERE id = lid;
    IF n = 1 AND (SELECT NOT needs_review AND review_note = 'rt063 checked' FROM dl_entries WHERE id = lid) THEN
      ok := ok + 1; res := res || 'S6b ok'::text;
    ELSE bad := bad + 1; res := res || format('S6b FAIL review on=%s', n); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S6b ERROR ' || SQLERRM);
  END;

  -- S7. The sync's own write of a system column passes, and leaves nothing open behind it.
  --     a) the relay is deleted while the line holds money: flagged, kept (060, unchanged);
  --     b) a relay is added again on the same order and day: the sync re-points the SAME line to it
  --        (local_move_id - a column of rule 1 - written by dl_local_day_sync);
  --     c) right after that sync the flag is closed: a hand write of the route is still refused;
  --     d) the sync gives back the CALLER's value, not '': a block that had set the flag itself still
  --        has it after a relabel (then undone by its own marker exception).
  BEGIN
    UPDATE local_moves SET deleted_at = now() WHERE id = r1;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF e.deleted_at IS NULL AND e.needs_review THEN ok := ok + 1; res := res || 'S7a ok'::text;
    ELSE bad := bad + 1; res := res || format('S7a FAIL deleted %s review %s', e.deleted_at, e.needs_review); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S7a ERROR ' || SQLERRM);
  END;
  BEGIN
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
    VALUES ('relay_delivery', t1, d1, trl, loc) RETURNING id INTO r2;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF e.deleted_at IS NULL AND e.local_move_id = r2 THEN ok := ok + 1; res := res || 'S7b ok'::text;
    ELSE bad := bad + 1; res := res || format('S7b FAIL deleted %s anchor %s/%s', e.deleted_at, e.local_move_id, r2); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S7b ERROR ' || SQLERRM);
  END;
  BEGIN
    st := coalesce(current_setting('tms.local_day_sync', true), '');
    BEGIN
      UPDATE dl_entries SET route = 'rt063 by hand' WHERE id = lid;
      RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
    END;
    IF st <> 'on' AND hint = 'local_relay:line_locked' THEN ok := ok + 1; res := res || 'S7c ok'::text;
    ELSE bad := bad + 1; res := res || format('S7c FAIL flag after sync %s, hand route %s', st, hint); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S7c ERROR ' || SQLERRM);
  END;
  BEGIN
    st := NULL; n := NULL;
    BEGIN
      PERFORM set_config('tms.local_day_sync', 'on', true);
      UPDATE local_moves SET deleted_at = now() WHERE id = r2;              -- line kept, flagged (no relabel)
      INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
      VALUES ('relay_delivery', t1, d1, trl, loc) RETURNING id INTO r4;     -- the sync re-points the line: relabel
      st := current_setting('tms.local_day_sync', true);
      n := (SELECT local_move_id FROM dl_entries WHERE id = lid);
      RAISE EXCEPTION 'rt063: undo S7d' USING HINT = 'rt063_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
    END;
    IF hint = 'rt063_undo' AND st = 'on' AND n = r4
       AND current_setting('tms.local_day_sync', true) IS DISTINCT FROM 'on'
       AND (SELECT local_move_id FROM dl_entries WHERE id = lid) = r2 THEN
      ok := ok + 1; res := res || 'S7d ok'::text;
    ELSE bad := bad + 1; res := res || format('S7d FAIL caller flag after relabel %s (want on), anchor %s/%s, %s', st, n, r4, hint); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S7d ERROR ' || SQLERRM);
  END;

  -- S8. 060's two rules, unchanged: a) no cancel while a relay of that driver and day lives;
  --     b) the relay goes, the valued line stays flagged, and then accounting may cancel it;
  --     c) a cancelled local line is never restored.
  BEGIN
    BEGIN
      UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'rt063' WHERE id = lid;
      RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
    END;
    IF hint = 'local_relay:line_has_relay' THEN ok := ok + 1; res := res || 'S8a ok'::text;
    ELSE bad := bad + 1; res := res || format('S8a FAIL got %s', hint); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S8a ERROR ' || SQLERRM);
  END;
  BEGIN
    UPDATE local_moves SET deleted_at = now() WHERE id = r2;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF e.deleted_at IS NULL AND e.needs_review THEN
      UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'rt063 nothing left' WHERE id = lid;
    END IF;
    IF (SELECT deleted_at IS NOT NULL FROM dl_entries WHERE id = lid) THEN ok := ok + 1; res := res || 'S8b ok'::text;
    ELSE bad := bad + 1; res := res || format('S8b FAIL flagged %s, not cancelled', e.needs_review); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S8b ERROR ' || SQLERRM);
  END;
  BEGIN
    BEGIN
      UPDATE dl_entries SET deleted_at = NULL, deleted_reason = NULL WHERE id = lid;
      RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
    END;
    IF hint = 'local_relay:line_restore' THEN ok := ok + 1; res := res || 'S8c ok'::text;
    ELSE bad := bad + 1; res := res || format('S8c FAIL got %s', hint); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S8c ERROR ' || SQLERRM);
  END;

  -- S9. The sync's own new-line and cancel paths still run: a relay returns -> a NEW line (the old one
  --     stays cancelled); that relay goes without money on the line -> the sync cancels its line.
  BEGIN
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
    VALUES ('relay_delivery', t1, d1, trl, loc) RETURNING id INTO r3;
    SELECT id INTO lid2 FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE local_moves SET deleted_at = now() WHERE id = r3;
    IF lid2 IS NOT NULL AND lid2 <> lid AND (SELECT deleted_at IS NOT NULL FROM dl_entries WHERE id = lid2)
       AND (SELECT deleted_at IS NOT NULL FROM dl_entries WHERE id = lid) THEN
      ok := ok + 1; res := res || 'S9 ok'::text;
    ELSE bad := bad + 1; res := res || format('S9 FAIL new line %s (old %s)', lid2, lid); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S9 ERROR ' || SQLERRM);
  END;

  -- S10. Non-local lines are untouched: a) a manual trip line moves day, end, driver and route freely;
  --      b) but it cannot be given a relay (it would become a local line no relay created);
  --      c) a live RT payroll line takes a route and a note as today.
  BEGIN
    INSERT INTO dl_entries (driver_id, entry_type, entry_date, date_end, route, source, created_by)
    VALUES (d2, 'trip', x, x, 'RULES TEST 063', 'manual', 'rules-test-063') RETURNING id INTO nid;
    UPDATE dl_entries SET entry_date = x - 1, date_end = x + 1, driver_id = d1, route = 'RULES TEST 063 moved', note = 'rt063' WHERE id = nid;
    SELECT * INTO e FROM dl_entries WHERE id = nid;
    IF e.entry_date = x - 1 AND e.date_end = x + 1 AND e.driver_id = d1 AND e.route = 'RULES TEST 063 moved' THEN
      ok := ok + 1; res := res || 'S10a ok'::text;
    ELSE bad := bad + 1; res := res || format('S10a FAIL %s/%s/%s/%s', e.entry_date, e.date_end, e.driver_id, e.route); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S10a ERROR ' || SQLERRM);
  END;
  BEGIN
    BEGIN
      UPDATE dl_entries SET local_move_id = r1 WHERE id = nid;
      RAISE EXCEPTION 'rt063: not refused' USING HINT = 'rt063_not_refused';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, hint = PG_EXCEPTION_HINT;
    END;
    IF nid IS NOT NULL AND st = '23514' AND hint = 'local_relay:line_locked' THEN ok := ok + 1; res := res || 'S10b ok'::text;
    ELSE bad := bad + 1; res := res || format('S10b FAIL got %s/%s', st, hint); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S10b ERROR ' || SQLERRM);
  END;
  IF rtl IS NULL THEN
    res := res || 'S10c skipped (no live RT payroll line)'::text;
  ELSE
    BEGIN
      UPDATE dl_entries SET route = coalesce(route, '') || ' rt063', note = coalesce(note, '') || ' rt063' WHERE id = rtl;
      IF (SELECT route LIKE '% rt063' AND note LIKE '% rt063' FROM dl_entries WHERE id = rtl) THEN
        ok := ok + 1; res := res || 'S10c ok'::text;
      ELSE bad := bad + 1; res := res || 'S10c FAIL not written'::text; END IF;
    EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S10c ERROR ' || SQLERRM);
    END;
  END IF;

  -- S11. B-54 is still green: this test added no trigger, and 063 moved none.
  BEGIN
    EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-54') INTO v;
    IF v = (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') THEN ok := ok + 1; res := res || format('S11 ok B-54 %s', v);
    ELSE bad := bad + 1; res := res || format('S11 FAIL B-54 %s vs red_value %s', v, (SELECT red_value FROM monitoring.checks WHERE id = 'B-54')); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S11 ERROR ' || SQLERRM);
  END;

  RAISE EXCEPTION 'RULES TEST 063 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, '  |  ');
END
$dry$;
