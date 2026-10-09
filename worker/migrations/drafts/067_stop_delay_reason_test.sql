-- 067 RULES TEST - every rule of 067 on PROBE rows, then a deliberate error that undoes all of it.
--
-- WHEN: after 067_stop_delay_reason.sql (it refuses before). Safe on production: the probes are
-- order_stops rows with ids -6701..-6799 written with OVERRIDING SYSTEM VALUE (no sequence moves),
-- legacy_id 'recTEST067-..', no parent order; order_stops has no trigger (refused if it ever has one,
-- the probes would fire it); the final RAISE rolls every probe back. ONE DO block, ASCII only.
-- EXPECTED (the red ERROR is deliberate):
--   ERROR: P0001: RULES TEST 067 finished - EVERYTHING UNDONE, nothing kept. Result: 11 OK, 0 FAIL  ||  S1 ok ... | ... | S11 ok ...
-- Anything with FAIL or ERROR in it: copy the panel to the coordinator.
-- The expected mapping in S1 is the list the owner approved 9/10 (Pantelis): if 067's CASE is ever
-- edited, this list is edited with it, and the front constant (modules/daily_ops.js OPS_DELAY, pinned
-- by tests/daily-ops-delay.test.js) too.

DO $t$
DECLARE
  ok int := 0; bad int := 0; res text[] := '{}';
  exp text[][] := ARRAY[
    ['vehicle_breakdown', 'us'], ['driver_hours', 'us'], ['planning_error', 'us'], ['previous_stop', 'us'],
    ['cargo_not_ready', 'client'], ['loading_wait', 'client'], ['order_change', 'client'], ['missing_docs', 'client'],
    ['unloading_wait', 'consignee'], ['closed_refused', 'consignee'],
    ['border_queue', 'borders'], ['customs', 'borders'],
    ['traffic', 'external'], ['weather', 'external'], ['ferry_train', 'external'], ['strike_roads', 'external'],
    ['other', 'other']];
  i int; got text; st text; cn text; miss text; real_reason bigint; real_delayed bigint; tries text;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.order_stops') IS NULL
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility')) <> 3 THEN
    RAISE EXCEPTION 'RULES TEST 067: 067 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.order_stops'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'RULES TEST 067: order_stops has a trigger now - the probe rows would fire it; re-measure before running this';
  END IF;
  SELECT count(*) FILTER (WHERE delay_reason IS NOT NULL OR delay_note IS NOT NULL), count(*) FILTER (WHERE performance = 'Delayed')
    INTO real_reason, real_delayed FROM public.order_stops;

  -- S1: each of the 17 codes on a Delayed probe is stored with its responsibility, derived by the base
  BEGIN
    miss := '';
    FOR i IN 1 .. array_length(exp, 1) LOOP
      INSERT INTO public.order_stops (id, legacy_id, stop_type, performance, delay_reason, delay_note) OVERRIDING SYSTEM VALUE
        VALUES (-6700 - i, 'recTEST067-S1-' || i, 'Unloading', 'Delayed', exp[i][1], CASE WHEN exp[i][1] = 'other' THEN 'TEST note' END)
        RETURNING delay_responsibility INTO got;
      IF got IS DISTINCT FROM exp[i][2] THEN miss := miss || ' ' || exp[i][1] || '->' || coalesce(got, 'NULL'); END IF;
    END LOOP;
    IF miss = '' THEN ok := ok + 1; res := res || format('S1 ok %s codes, each with its responsibility', array_length(exp, 1));
    ELSE bad := bad + 1; res := res || ('S1 FAIL' || miss); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S1 ERROR ' || SQLERRM);
  END;

  -- S2: a code the CASE does not know is refused by order_stops_delay_reason_check (also '' and 'TRAFFIC')
  tries := '';
  FOREACH got IN ARRAY ARRAY['lost_keys', '', 'TRAFFIC'] LOOP
    BEGIN
      INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason) OVERRIDING SYSTEM VALUE
        VALUES (-6731, 'recTEST067-S2', 'Delayed', got);
      tries := tries || ' accepted:' || quote_literal(got);
      DELETE FROM public.order_stops WHERE id = -6731;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
      IF cn <> 'order_stops_delay_reason_check' THEN tries := tries || ' wrong:' || cn; END IF;
    END;
  END LOOP;
  IF tries = '' THEN ok := ok + 1; res := res || 'S2 ok unknown codes refused (delay_reason_check)'::text;
  ELSE bad := bad + 1; res := res || ('S2 FAIL' || tries); END IF;

  -- S3: "other" needs a note with a non-space character; with one it is stored as other
  tries := '';
  FOREACH got IN ARRAY ARRAY[NULL, '', '   ', E'\t\n '] LOOP
    BEGIN
      INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason, delay_note) OVERRIDING SYSTEM VALUE
        VALUES (-6732, 'recTEST067-S3', 'Delayed', 'other', got);
      tries := tries || ' accepted:' || coalesce(quote_literal(got), 'NULL');
      DELETE FROM public.order_stops WHERE id = -6732;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
      IF cn <> 'order_stops_delay_other_note_check' THEN tries := tries || ' wrong:' || cn; END IF;
    END;
  END LOOP;
  BEGIN
    INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason, delay_note) OVERRIDING SYSTEM VALUE
      VALUES (-6733, 'recTEST067-S3b', 'Delayed', 'other', 'TEST the ramp was flooded') RETURNING delay_responsibility INTO got;
    IF got IS DISTINCT FROM 'other' THEN tries := tries || ' with-note:' || coalesce(got, 'NULL'); END IF;
  EXCEPTION WHEN others THEN tries := tries || ' with-note refused: ' || SQLERRM;
  END;
  IF tries = '' THEN ok := ok + 1; res := res || 'S3 ok other: NULL/blank note refused, a real note kept'::text;
  ELSE bad := bad + 1; res := res || ('S3 FAIL' || tries); END IF;

  -- S4 + S5: a reason only on a Delayed stop; a note only beside a reason
  tries := '';
  FOR i IN 1 .. 3 LOOP
    BEGIN
      INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason, delay_note) OVERRIDING SYSTEM VALUE
        VALUES (-6734, 'recTEST067-S4', CASE i WHEN 1 THEN 'On Time' WHEN 2 THEN NULL ELSE 'Delayed' END,
                CASE WHEN i < 3 THEN 'traffic' END, CASE WHEN i = 3 THEN 'TEST lone note' END);
      tries := tries || ' accepted:' || i;
      DELETE FROM public.order_stops WHERE id = -6734;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS cn = CONSTRAINT_NAME;
      IF cn <> 'order_stops_delay_only_delayed_check' THEN tries := tries || ' wrong:' || cn; END IF;
    END;
  END LOOP;
  IF tries = '' THEN ok := ok + 2; res := res || 'S4 ok reason on On Time / NULL refused'::text || 'S5 ok lone note refused'::text;
  ELSE bad := bad + 1; res := res || ('S4/S5 FAIL' || tries); END IF;

  -- S6: Delayed without a reason stays allowed (the 2 existing rows, today's Daily Ops, a lot's late
  --     intake); a non-other reason needs no note
  BEGIN
    INSERT INTO public.order_stops (id, legacy_id, performance) OVERRIDING SYSTEM VALUE VALUES (-6736, 'recTEST067-S6a', 'Delayed');
    INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason) OVERRIDING SYSTEM VALUE
      VALUES (-6737, 'recTEST067-S6b', 'Delayed', 'customs') RETURNING delay_responsibility INTO got;
    IF got = 'borders' AND (SELECT delay_responsibility FROM public.order_stops WHERE id = -6736) IS NULL THEN
      ok := ok + 1; res := res || 'S6 ok Delayed without reason allowed; customs without note -> borders'::text;
    ELSE bad := bad + 1; res := res || ('S6 FAIL got ' || coalesce(got, 'NULL')); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S6 ERROR ' || SQLERRM);
  END;

  -- S7: nobody writes the responsibility (generated): UPDATE and INSERT both refused (428C9)
  tries := '';
  BEGIN
    UPDATE public.order_stops SET delay_responsibility = 'us' WHERE id = -6737;
    tries := tries || ' update accepted';
  EXCEPTION WHEN generated_always THEN NULL;
  END;
  BEGIN
    INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason, delay_responsibility) OVERRIDING SYSTEM VALUE
      VALUES (-6738, 'recTEST067-S7', 'Delayed', 'traffic', 'client');
    tries := tries || ' insert accepted';
  EXCEPTION WHEN generated_always THEN NULL;
  END;
  IF tries = '' THEN ok := ok + 1; res := res || 'S7 ok delay_responsibility not writable (428C9)'::text;
  ELSE bad := bad + 1; res := res || ('S7 FAIL' || tries); END IF;

  -- S8: correcting a delayed stop to On Time works in ONE write that clears reason and note, and
  --     only so (keeping the reason is refused)
  tries := '';
  BEGIN
    INSERT INTO public.order_stops (id, legacy_id, performance, delay_reason, delay_note) OVERRIDING SYSTEM VALUE
      VALUES (-6739, 'recTEST067-S8', 'Delayed', 'traffic', 'TEST A1 closed');
    BEGIN
      UPDATE public.order_stops SET performance = 'On Time' WHERE id = -6739;
      tries := tries || ' kept-reason accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE public.order_stops SET performance = 'On Time', delay_reason = NULL, delay_note = NULL WHERE id = -6739
      RETURNING delay_responsibility INTO got;
    IF got IS NOT NULL THEN tries := tries || ' responsibility left ' || got; END IF;
  EXCEPTION WHEN others THEN tries := tries || ' ERROR ' || SQLERRM;
  END;
  IF tries = '' THEN ok := ok + 1; res := res || 'S8 ok On Time + clear in one write; On Time keeping the reason refused'::text;
  ELSE bad := bad + 1; res := res || ('S8 FAIL' || tries); END IF;

  -- S9: Daily Ops' stamp rollback (_opsWriteOrder: the order write was refused) puts back every key of
  --     the stamp in ONE write - Completed At/By, Performance, reason and note together
  BEGIN
    INSERT INTO public.order_stops (id, legacy_id, completed_at, completed_by, performance, delay_reason, delay_note) OVERRIDING SYSTEM VALUE
      VALUES (-6740, 'recTEST067-S9', now(), 'TEST', 'Delayed', 'weather', 'TEST snow');
    UPDATE public.order_stops SET completed_at = NULL, completed_by = NULL, performance = NULL, delay_reason = NULL, delay_note = NULL
     WHERE id = -6740;
    ok := ok + 1; res := res || 'S9 ok the stamp rollback passes'::text;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S9 ERROR ' || SQLERRM);
  END;

  -- S10: privileges as 067 left them - the Worker (service_role) reads all three and writes reason/note;
  --      anon/authenticated reach none of them
  BEGIN
    IF has_column_privilege('service_role', 'public.order_stops', 'delay_reason', 'UPDATE')
       AND has_column_privilege('service_role', 'public.order_stops', 'delay_note', 'UPDATE')
       AND has_column_privilege('service_role', 'public.order_stops', 'delay_responsibility', 'SELECT')
       AND NOT has_column_privilege('anon', 'public.order_stops', 'delay_reason', 'SELECT')
       AND NOT has_column_privilege('anon', 'public.order_stops', 'delay_responsibility', 'SELECT')
       AND NOT has_column_privilege('authenticated', 'public.order_stops', 'delay_reason', 'SELECT')
       AND NOT has_column_privilege('authenticated', 'public.order_stops', 'delay_note', 'UPDATE') THEN
      ok := ok + 1; res := res || 'S10 ok service_role reads/writes, anon/authenticated nothing'::text;
    ELSE bad := bad + 1; res := res || 'S10 FAIL privileges not as 067 left them'::text; END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S10 ERROR ' || SQLERRM);
  END;

  -- S11: real rows untouched by this test (reported: what dispatchers have declared so far)
  BEGIN
    IF (SELECT count(*) FILTER (WHERE delay_reason IS NOT NULL OR delay_note IS NOT NULL) FROM public.order_stops WHERE id > 0) = real_reason
       AND (SELECT count(*) FILTER (WHERE performance = 'Delayed') FROM public.order_stops WHERE id > 0) = real_delayed THEN
      ok := ok + 1; res := res || format('S11 ok real stops: %s Delayed, %s with a reason or note', real_delayed, real_reason);
    ELSE bad := bad + 1; res := res || 'S11 FAIL a real stop changed during the test'::text; END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S11 ERROR ' || SQLERRM);
  END;

  RAISE EXCEPTION 'RULES TEST 067 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %', ok, bad, array_to_string(res, '  |  ');
END
$t$;
