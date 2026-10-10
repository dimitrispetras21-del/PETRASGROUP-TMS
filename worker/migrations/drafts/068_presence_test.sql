-- ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ — owner, μετά τις 15:00
-- RULES TEST 068 (presence): every rule of presence_beat exercised on TEST rows, then undone.
-- (Not the dry run: 068_presence_dryrun.sql runs 068 itself and undoes it, BEFORE 068. This file runs
-- AFTER 068 said "068 OK" and 068_presence_verify.sql said "0 FAIL".)
-- ONE statement (ONE DO block). It ends with a deliberate RAISE EXCEPTION, so Postgres undoes ALL of it:
-- no presence row and no audit row stays behind. The red error message IS the result:
--   "RULES TEST 068 finished - EVERYTHING UNDONE, nothing kept. Result: 12 OK, 0 FAIL || ...".
-- EXPECTED: "Result: 12 OK, 0 FAIL". Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Only trace: audit_log identity numbers are skipped (the test inserts and undoes eight audit rows).
--
-- DRAFT - run ONLY after 068, after 15:00, with an explicit yes (it writes, then undoes). ASCII only after
-- the first line (clipboard-safe).
-- WHAT IT TOUCHES: presence rows of the test users t068a / t068b / t068c only, and eight TEST audit_log
-- rows (actors t068a / t068b / t068c / trigger:... with record ids of ONE real international order,
-- picked BY QUERY - the newest one with a legacy id). That order is only REFERENCED by the test audit
-- rows; the order itself is never written. Every presence_beat call runs as service_role (SET LOCAL
-- ROLE), exactly as the Worker calls it through PostgREST, so a missing GRANT fails here.
-- Counts are measured as DELTAS against each test user's own baseline beat taken before the test audit
-- rows exist, so real changes by colleagues in the last 15 minutes cannot make a scenario fail. (A real
-- save that lands DURING the few hundred milliseconds of the block can move a delta by one: run it again.)
-- Time cannot pass inside one statement (now() is fixed), so "30 seconds later" is simulated by moving a
-- test row's seen_at / expires_at back - the same arithmetic the reader applies.
-- Scenarios:
--   S1  two users beat: each sees the other, never himself
--   S2  an idle beat with TTL 45 s is still returned 30 s later; past its expires_at it is not
--   S3  TTL clamp: 1 ms -> 7.5 s, 10 000 000 ms -> 90 s
--   S4  the same user in two tabs: two rows, ONE entry in the other's "others", holding both records
--   S5  leave removes only its own tab, answers {"others": []}
--   S6  since: kept while record+action are unchanged on a live row; restarts on a new action, and on an
--       expired row coming back
--   S7  the CHECKs refuse (23514): action 'x<script>', bad tab, bad record, unknown role, other board,
--       week 54, unknown part
--   S8  housekeeping: a row expired 2 days ago is deleted by any beat; one expired 1 hour ago stays but
--       is invisible
--   S9  changes for t068a, with p_changes_since a WEEK ago (clamped to 15 minutes): +2 human (t068b 5 min
--       ago, t068c newest); the t068b row 1 hour ago is NOT counted (clamp); t068a's own Worker row NOT
--       counted; last_by = t068c (p_names true)
--   S10 p_names false: the same count, last_by null
--   S11 auto_n for t068a: +1 = the trigger:rt_sync row keyed by id::text (the join on both key styles);
--       the trigger row within 1 s of t068a's own save on the same order is his (not counted); a trigger
--       row on order_stops is not an orders change (not counted); trigger rows never count in n
--   S12 the same rows seen by t068b: +2 human (t068a, t068c), +2 auto (both trigger rows - neither is his)

DO $tst$
DECLARE
  sig constant text := 'public.presence_beat(text,text,text,text,text,integer,text,text,text,integer,boolean,timestamptz,boolean)';
  ua constant text := 't068a'; ub constant text := 't068b'; uc constant text := 't068c';
  ta1 constant text := 't068tabaa001'; ta2 constant text := 't068tabaa002'; tb1 constant text := 't068tabbb001';
  tc1 constant text := 't068tabcc001'; tc2 constant text := 't068tabcc002';
  rec1 constant text := 'recT068REC0001'; rec2 constant text := 'recT068REC0002';
  o_id bigint; o_leg text;
  j jsonb; jb jsonb;
  na0 int; aa0 int; nb0 int; ab0 int;
  n int; m int; iv interval; ts timestamptz; st text;
  verdict text; lbl text;
  ok int := 0; bad int := 0; res text[] := '{}';
  bad_case record;
BEGIN
  -- 068 applied
  IF to_regprocedure(sig) IS NULL OR to_regclass('public.presence') IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 068: 068 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM public.presence WHERE user_sub LIKE 't068%')
     OR EXISTS (SELECT 1 FROM public.audit_log WHERE actor LIKE 't068%') THEN
    RAISE EXCEPTION 'RULES TEST 068: test users t068* already exist in presence or audit_log - stop';
  END IF;
  -- one real international order, only REFERENCED by the test audit rows below (never written)
  SELECT id, legacy_id INTO o_id, o_leg FROM public.orders
   WHERE order_type = 'International' AND legacy_id ~ '^rec' ORDER BY id DESC LIMIT 1;
  IF o_id IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 068: no international order with a legacy id to reference';
  END IF;

  -- baselines: each test user's own view BEFORE any test audit row exists
  SET LOCAL ROLE service_role;
  SELECT public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, true) INTO j;
  SELECT public.presence_beat(ub, tb1, 'TEST 068 B', 'owner', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, false) INTO jb;
  RESET ROLE;
  na0 := (j -> 'changes' ->> 'n')::int; aa0 := (j -> 'changes' ->> 'auto_n')::int;
  nb0 := (jb -> 'changes' ->> 'n')::int; ab0 := (jb -> 'changes' ->> 'auto_n')::int;
  res := res || format('picks order id=%s; baselines A n=%s auto=%s, B n=%s auto=%s', o_id, na0, aa0, nb0, ab0);

  -- ================================================================================================
  -- S1. each sees the other, never himself
  lbl := 'S1 see each other'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, true) INTO j;
    SELECT public.presence_beat(ub, tb1, 'TEST 068 B', 'owner', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, false) INTO jb;
    RESET ROLE;
    IF (SELECT count(*) FROM jsonb_array_elements(j -> 'others') e WHERE e ->> 'sub' = ub) = 1
       AND (SELECT count(*) FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua) = 1
       AND (SELECT count(*) FROM jsonb_array_elements(j -> 'others') e WHERE e ->> 'sub' = ua) = 0
       AND (SELECT count(*) FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ub) = 0
       AND (SELECT e ->> 'name' FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua) = 'TEST 068 A' THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL A sees %s | B sees %s', j -> 'others', jb -> 'others'); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S2. idle TTL 45 s: visible 30 s later, gone 50 s later
  lbl := 'S2 idle TTL'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, NULL, NULL, 'view', 45000, false, NULL, true);
    RESET ROLE;
    UPDATE public.presence SET seen_at = seen_at - interval '30 seconds', expires_at = expires_at - interval '30 seconds'
     WHERE user_sub = ua AND tab_id = ta1;
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ub, tb1, 'TEST 068 B', 'owner', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, false) INTO jb;
    RESET ROLE;
    n := (SELECT count(*) FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua);
    UPDATE public.presence SET seen_at = seen_at - interval '20 seconds', expires_at = expires_at - interval '20 seconds'
     WHERE user_sub = ua AND tab_id = ta1;
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ub, tb1, 'TEST 068 B', 'owner', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, false) INTO jb;
    -- A comes back (live again) for the next scenarios
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, true);
    RESET ROLE;
    m := (SELECT count(*) FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua);
    IF n = 1 AND m = 0 THEN verdict := 'ok';
    ELSE verdict := format('FAIL seen after 30 s: %s (want 1), after 50 s: %s (want 0)', n, m); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S3. TTL clamp
  lbl := 'S3 TTL clamp'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, NULL, NULL, 'view', 1, false, NULL, true);
    RESET ROLE;
    SELECT expires_at - seen_at INTO iv FROM public.presence WHERE user_sub = ua AND tab_id = ta1;
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, NULL, NULL, 'view', 10000000, false, NULL, true);
    RESET ROLE;
    IF iv = interval '7.5 seconds' AND (SELECT expires_at - seen_at FROM public.presence WHERE user_sub = ua AND tab_id = ta1) = interval '90 seconds' THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL low %s (want 7.5 s), high %s (want 90 s)', iv,
                           (SELECT expires_at - seen_at FROM public.presence WHERE user_sub = ua AND tab_id = ta1)); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S4. same user, two tabs
  lbl := 'S4 two tabs'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'menu', 7500, false, NULL, true);
    PERFORM public.presence_beat(ua, ta2, 'TEST 068 A', 'dispatcher', 'weekly_intl', 42, rec2, 'export', 'date:Loading DateTime', 7500, false, NULL, true);
    SELECT public.presence_beat(ub, tb1, 'TEST 068 B', 'owner', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, false) INTO jb;
    RESET ROLE;
    SELECT count(*) INTO n FROM public.presence WHERE user_sub = ua;
    IF n = 2
       AND (SELECT count(*) FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua) = 1
       AND (SELECT jsonb_array_length(e -> 'records') FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua) = 2
       AND (SELECT e -> 'weeks' FROM jsonb_array_elements(jb -> 'others') e WHERE e ->> 'sub' = ua) = '[41, 42]'::jsonb THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL rows %s, B sees %s', n, jb -> 'others'); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S5. leave removes only its own tab
  lbl := 'S5 leave own tab'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ua, ta2, 'TEST 068 A', 'dispatcher', 'weekly_intl', NULL, NULL, NULL, NULL, NULL, true, NULL, true) INTO j;
    RESET ROLE;
    IF j = '{"others": []}'::jsonb
       AND (SELECT array_agg(tab_id) FROM public.presence WHERE user_sub = ua) = ARRAY[ta1] THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL answer %s, tabs left %s', j, (SELECT array_agg(tab_id) FROM public.presence WHERE user_sub = ua)); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S6. since kept / restarted
  lbl := 'S6 since'; verdict := NULL;
  BEGIN
    ts := now() - interval '10 minutes';
    UPDATE public.presence SET since = ts WHERE user_sub = ua AND tab_id = ta1;              -- tab1: rec1 / menu
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'menu', 7500, false, NULL, true);
    RESET ROLE;
    n := CASE WHEN (SELECT since FROM public.presence WHERE user_sub = ua AND tab_id = ta1) = ts THEN 1 ELSE 0 END;      -- kept
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'assign', 7500, false, NULL, true);
    RESET ROLE;
    n := n + CASE WHEN (SELECT since FROM public.presence WHERE user_sub = ua AND tab_id = ta1) = now() THEN 1 ELSE 0 END; -- new action
    UPDATE public.presence SET since = ts, expires_at = now() - interval '1 second' WHERE user_sub = ua AND tab_id = ta1;
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'assign', 7500, false, NULL, true);
    RESET ROLE;
    n := n + CASE WHEN (SELECT since FROM public.presence WHERE user_sub = ua AND tab_id = ta1) = now() THEN 1 ELSE 0 END; -- came back
    IF n = 3 THEN verdict := 'ok'; ELSE verdict := format('FAIL %s of 3 since rules held', n); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S7. the CHECKs refuse what the whitelists do not hold
  lbl := 'S7 checks'; verdict := NULL; n := 0; m := 0;
  BEGIN
    FOR bad_case IN
      SELECT * FROM (VALUES
        ('action', ta1, 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'x<script>'),
        ('tab', 'BAD', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'menu'),
        ('record', ta1, 'dispatcher', 'weekly_intl', 41, 'javascript:alert(1)', 'truck', 'menu'),
        ('role', ta1, 'admin', 'weekly_intl', 41, rec1, 'truck', 'menu'),
        ('board', ta1, 'dispatcher', 'weekly_natl', 41, rec1, 'truck', 'menu'),
        ('week', ta1, 'dispatcher', 'weekly_intl', 54, rec1, 'truck', 'menu'),
        ('part', ta1, 'dispatcher', 'weekly_intl', 41, rec1, 'cab', 'menu')
      ) AS t(what, tab, rol, brd, wk, rec, prt, act)
    LOOP
      m := m + 1;
      BEGIN
        SET LOCAL ROLE service_role;
        PERFORM public.presence_beat(ua, bad_case.tab, 'TEST 068 A', bad_case.rol, bad_case.brd, bad_case.wk,
                                     bad_case.rec, bad_case.prt, bad_case.act, 7500, false, NULL, true);
        RESET ROLE;
        verdict := concat_ws(', ', verdict, bad_case.what || ' accepted');
      EXCEPTION WHEN others THEN
        GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE;
        RESET ROLE;
        IF st = '23514' THEN n := n + 1; ELSE verdict := concat_ws(', ', verdict, bad_case.what || ' got ' || st); END IF;
      END;
    END LOOP;
    IF n = 7 AND m = 7 THEN verdict := 'ok'; ELSE verdict := format('FAIL %s of 7 refused: %s', n, verdict); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S8. housekeeping
  lbl := 'S8 housekeeping'; verdict := NULL;
  BEGIN
    INSERT INTO public.presence (user_sub, tab_id, user_name, role, board, week, since, seen_at, expires_at) VALUES
      (uc, tc1, 'TEST 068 C', 'warehouse', 'weekly_intl', 41, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'),
      (uc, tc2, 'TEST 068 C', 'warehouse', 'weekly_intl', 41, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour');
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'assign', 7500, false, NULL, true) INTO j;
    RESET ROLE;
    IF (SELECT array_agg(tab_id) FROM public.presence WHERE user_sub = uc) = ARRAY[tc2]
       AND (SELECT count(*) FROM jsonb_array_elements(j -> 'others') e WHERE e ->> 'sub' = uc) = 0 THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL C tabs left %s, A sees %s', (SELECT array_agg(tab_id) FROM public.presence WHERE user_sub = uc), j -> 'others'); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- ---- the test audit rows (as the Worker and the triggers write them; undone at the end) ---------
  --   r1 t068b human, legacy id, 5 min ago          -> A: n+1        B: own
  --   r2 trigger:rt_sync system, id::text, 2 min ago -> A: auto+1     B: auto+1
  --   r3 t068a human, legacy id, 3 min ago          -> A: own        B: n+1
  --   r4 trigger:order_legs system, id::text, r3 + 0.4 s -> A: his (0) B: auto+1
  --   r5 t068b human, legacy id, 1 HOUR ago         -> nobody (clamp to 15 min)
  --   r8 t068c management, legacy id, 1 min AHEAD (the newest, so last_by is deterministic) -> A: n+1, B: n+1
  --   r9 trigger:order_dates_follow system, table order_stops -> nobody (not an orders row)
  --   r10 t068b human, table orders, a record id that is no order -> nobody (the join)
  INSERT INTO public.audit_log (actor, role, action, table_name, record_id, created_at) VALUES
    (ub, 'dispatcher', 'update', 'orders', o_leg, now() - interval '5 minutes'),
    ('trigger:rt_sync', 'system', 'update', 'orders', o_id::text, now() - interval '2 minutes'),
    (ua, 'dispatcher', 'update', 'orders', o_leg, now() - interval '3 minutes'),
    ('trigger:order_legs', 'system', 'update', 'orders', o_id::text, now() - interval '3 minutes' + interval '0.4 seconds'),
    (ub, 'dispatcher', 'update', 'orders', o_leg, now() - interval '1 hour'),
    (uc, 'management', 'update', 'orders', o_leg, now() + interval '1 minute'),
    ('trigger:order_dates_follow', 'system', 'update', 'order_stops', o_id::text, now() - interval '1 minute'),
    (ub, 'dispatcher', 'update', 'orders', 'recT068NOTANORDER', now() - interval '1 minute');

  -- S9. human changes for A: clamp, own row excluded, last_by with names
  lbl := 'S9 changes A (clamp, own excluded, last_by)'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'assign', 7500, false,
                                now() - interval '7 days', true) INTO j;
    RESET ROLE;
    IF (j -> 'changes' ->> 'n')::int = na0 + 2
       AND j -> 'changes' ->> 'last_by' = uc
       AND (j -> 'changes' ->> 'last_at')::timestamptz = now() + interval '1 minute' THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL changes %s (want n=%s, last_by %s)', j -> 'changes', na0 + 2, uc); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S10. no names without p_names
  lbl := 'S10 no names'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'assign', 7500, false, NULL, false) INTO j;
    RESET ROLE;
    IF (j -> 'changes' ->> 'n')::int = na0 + 2 AND (j -> 'changes' -> 'last_by') = 'null'::jsonb
       AND (j -> 'changes' ->> 'last_at') IS NOT NULL THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL changes %s', j -> 'changes'); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S11. automatic changes for A (id::text join, attribution to his own save, order_stops excluded)
  lbl := 'S11 auto A'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ua, ta1, 'TEST 068 A', 'dispatcher', 'weekly_intl', 41, rec1, 'truck', 'assign', 7500, false, NULL, true) INTO j;
    RESET ROLE;
    IF (j -> 'changes' ->> 'auto_n')::int = aa0 + 1 AND (j -> 'changes' ->> 'n')::int = na0 + 2 THEN verdict := 'ok';
    ELSE verdict := format('FAIL changes %s (want auto_n=%s, n=%s)', j -> 'changes', aa0 + 1, na0 + 2); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  -- S12. the same rows seen by B
  lbl := 'S12 changes B'; verdict := NULL;
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat(ub, tb1, 'TEST 068 B', 'owner', 'weekly_intl', 41, NULL, NULL, 'view', 7500, false, NULL, false) INTO jb;
    RESET ROLE;
    IF (jb -> 'changes' ->> 'n')::int = nb0 + 2 AND (jb -> 'changes' ->> 'auto_n')::int = ab0 + 2
       AND (jb -> 'changes' -> 'last_by') = 'null'::jsonb THEN
      verdict := 'ok';
    ELSE verdict := format('FAIL changes %s (want n=%s, auto_n=%s)', jb -> 'changes', nb0 + 2, ab0 + 2); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; verdict := format('ERROR %s %s', SQLSTATE, SQLERRM); END;
  IF verdict = 'ok' THEN ok := ok + 1; ELSE bad := bad + 1; END IF; res := res || (lbl || ' ' || verdict);

  RAISE EXCEPTION 'RULES TEST 068 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL || %',
    ok, bad, array_to_string(res, ' | ');
END
$tst$;
