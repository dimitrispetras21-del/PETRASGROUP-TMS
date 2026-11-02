-- 095 - NATIONAL v5: TWO SMALL RULES BECOME THE DISPATCHER'S JUDGMENT (owner 31/10 + 2/11, "relaxed rules now, strict
-- after the build": allowed with a trace and a warning; only data integrity refuses). Group 6 of the owner's list.
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
--
-- 1. LOCAL LOADING ON ANOTHER DAY. 071 refused a local loading (local_moves nat_loading) whose day was not its stop's
--    Athens day (plan_local_loading_problem: local_loading_day), and plan_rt_update step 3 snapped every loading of a
--    cycle back to its stop's day on ANY edit of that cycle. A loading may run on another day (loaded the evening
--    before). Now:
--      - plan_local_loading_problem no longer compares the days (gone, stop and leg rules unchanged);
--      - plan_local_loading takes an optional move_date ('YYYY-MM-DD', the stop's Athens day when absent or null):
--        another day is kept, answered as the warning local_loading_other_day {local_move_id, move_date, stop_day} and
--        written in its audit row (the created local_moves row holds the day); a malformed day is bad_input; a day on a
--        cancel is bad_input (a cancel changes no day);
--      - plan_rt_update step 3: a loading moves with its stop by the days the stop moved IN THIS CALL (its distance to
--        the stop is kept); a call that moves no stop (a vehicle change) leaves its day as it is. Only plan_rt_update
--        moves stop times (SELECT 2/11: the one function that updates rt_stops.planned_from).
--    The payroll day (060 dl_local_day_sync) is the loading's own move_date, as before.
-- 2. VEHICLE CHANGE WITHOUT A REASON. 072b required a point AND a reason on every handover (plan_seg_change and
--    plan_seg_fix: bad_input; CHECK seg_change_pair: reason and point together; plan_seg_problem: seg_reason at
--    COMMIT) and a note with "other" (CHECK seg_other_note). Now:
--      - the POINT stays required (without it the change says nothing: the card's line, the board's tile and the
--        removal dialog all name it); a handover is the segment with a point, the first segment has neither;
--      - the REASON is optional (none = "-" on the screen); when given, its value is still CHECK seg_reason_list's;
--      - "other" without a note is allowed: CHECK seg_other_note is dropped, and the auditor's B-93 (which reads its
--        absence as a broken rule) is disabled with its reason;
--      - CHECK seg_change_pair is rebuilt with the same name: a reason only with a point (reason IS NULL OR
--        place_note IS NOT NULL); plan_seg_problem answers a later segment without a point as seg_place_text (the
--        Worker's text of that code: "write the point of the change"), never seg_reason.
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L set; the LIVE texts of five functions (md5 of prosrc, SELECT 2/11 = the production-shaped
--           PGlite copy after 092) and plan_rt_update as 093 writes it; the two CHECKs as 072b made them; B-93
--           enabled; B-54 = the enabled triggers
--   PART 1  schema: CHECK seg_other_note dropped, CHECK seg_change_pair rebuilt (same name, validated over every row:
--           32 of 32 on 2/11, all first segments); B-93 disabled
--   PART 2  live text + hunks: plan_local_loading_problem, plan_local_loading, plan_rt_update, plan_seg_problem,
--           plan_seg_change, plan_seg_fix
--   PART 3  proofs, NOTICE "095 OK: ..."
-- No table, no column, no trigger, no grant, no row of a plan table written. No Worker change: /plan/local-loading,
-- /plan/rt/:id/handover and PATCH /plan/segments/:id pass their bodies as p. Worker texts left unreached (follow-up of
-- the Worker chain, not of 095): seg_reason, seg_other_note and local_loading_day are no longer raised.
-- OWNERSHIP (coordinator 2/11): 093 owns plan_rt_problem / plan_leg_problem / plan_h_reseq, 094 the order create /
-- edit functions; 095 touches none of them. plan_rt_update: 093 adds one warning line to it, 095 patches its step 3
-- only (the local loading's day): ORDER 093 -> 095 (095's guard is 093's text; run before 093, it stops at once).
-- RUN: after 093. 095_plan_small_relaxed_dryrun.sql, then this file, then 095_plan_small_relaxed_verify.sql.
-- REVERSE: 095_plan_small_relaxed_rollback.sql (it STOPS and lists the cycles if a handover without a reason, or an
-- "other" without a note, is in the base: the old CHECKs could not be rebuilt over them). ROLLBACK ORDER 095 -> 093:
-- once 095 has run, 093's rollback stops at its own guard on plan_rt_update (it expects 093's text) - reverse 095 first.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  k_1a CONSTANT text := $h$  -- the payroll day (dl_local_day_sync) is the Athens day the loading starts
  if lm.move_date <> (s.planned_from at time zone 'Europe/Athens')::date then return 'local_loading_day:' || p_lm; end if;
$h$;
  k_1b CONSTANT text := $h$  -- 095 (owner 2/11, relaxed rules): the loading may run on another day than its stop (loaded the evening
  -- before): the dispatcher's judgment, never a refusal here. plan_local_loading answers local_loading_other_day and
  -- its audit row holds the day; the payroll day (dl_local_day_sync) is the loading's own move_date.
$h$;
  l_1a CONSTANT text := $h$  s rt_stops%rowtype; r ct_round_trips%rowtype; lm local_moves%rowtype; v_old jsonb; v_warn jsonb; v_ans jsonb;
$h$;
  l_1b CONSTANT text := $h$  s rt_stops%rowtype; r ct_round_trips%rowtype; lm local_moves%rowtype; v_old jsonb; v_warn jsonb; v_ans jsonb;
  v_day date; v_sday date;  -- 095: the loading's own day (optional) and its stop's Athens day
$h$;
  l_2a CONSTANT text := $h$                               'local_move_id', 'cancel', 'request_id'], 'p');
$h$;
  l_2b CONSTANT text := $h$                               'local_move_id', 'cancel', 'request_id', 'move_date'], 'p');
$h$;
  l_3a CONSTANT text := $h$  if v_lm is not null then
$h$;
  l_3b CONSTANT text := $h$  -- 095 (owner 2/11): move_date = the loading's own day, 'YYYY-MM-DD' or null (= the stop's day); anything else is
  -- refused, never read as "no day": the date type alone would take 'tomorrow' / 'today' (the server's clock) and
  -- 'infinity'. A cancel changes no day.
  if p ? 'move_date' and (jsonb_typeof(p->'move_date') not in ('string', 'null')
                          or p->>'move_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    perform plan_h_raise('bad_input', 'move_date');
  end if;
  begin
    v_day := (p->>'move_date')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    perform plan_h_raise('bad_input', 'move_date');
  end;
  if v_lm is not null and v_day is not null then perform plan_h_raise('bad_input', 'move_date on cancel'); end if;
  if v_lm is not null then
$h$;
  l_4a CONSTANT text := $h$  -- status is written: local_moves_before derives none for nat_loading (K-16); the day is the stop's Athens day
  insert into local_moves (move_kind, rt_stop_id, driver_id, truck_id, trailer_id, move_date, time_from, time_to,
                           notes, status, sequence)
  values ('nat_loading', v_stop, v_driver, v_truck, v_trailer, (s.planned_from at time zone 'Europe/Athens')::date,
$h$;
  l_4b CONSTANT text := $h$  -- status is written: local_moves_before derives none for nat_loading (K-16); the day is the body's move_date,
  -- else the stop's Athens day (095)
  v_sday := (s.planned_from at time zone 'Europe/Athens')::date;
  insert into local_moves (move_kind, rt_stop_id, driver_id, truck_id, trailer_id, move_date, time_from, time_to,
                           notes, status, sequence)
  values ('nat_loading', v_stop, v_driver, v_truck, v_trailer, coalesce(v_day, v_sday),
$h$;
  l_5a CONSTANT text := $h$                              'ids', jsonb_build_object('local_move_id', v_lm, 'rt_id', s.rt_id), 'warnings', '[]'::jsonb,
$h$;
  l_5b CONSTANT text := $h$                              'ids', jsonb_build_object('local_move_id', v_lm, 'rt_id', s.rt_id),
                              -- 095: another day than the stop's is said, never silent (principle 1)
                              'warnings', case when coalesce(v_day, v_sday) <> v_sday
                                then jsonb_build_array(jsonb_build_object('code', 'local_loading_other_day',
                                       'local_move_id', v_lm, 'move_date', v_day, 'stop_day', v_sday))
                                else '[]'::jsonb end,
$h$;
  u_1a CONSTANT text := $h$  v_cut jsonb; v_conf jsonb;  -- 072b: the handovers this change removes (owner question 7 = b) and their token
$h$;
  u_1b CONSTANT text := $h$  v_cut jsonb; v_conf jsonb;  -- 072b: the handovers this change removes (owner question 7 = b) and their token
  v_lday0 jsonb;  -- 095: stop -> its Athens day before this call, for the stops that hold a local loading
$h$;
  u_2a CONSTANT text := $h$    -- 1. explicit stop windows
$h$;
  u_2b CONSTANT text := $h$    -- 095: the Athens day of every stop of this cycle that holds a live local loading, before steps 1-2 move it
    select coalesce(jsonb_object_agg(s.id::text, (s.planned_from at time zone 'Europe/Athens')::date), '{}'::jsonb)
      into v_lday0
      from rt_stops s join local_moves lm on lm.rt_stop_id = s.id
     where s.rt_id = v_rt and s.deleted_at is null and lm.move_kind = 'nat_loading' and lm.deleted_at is null
       and lm.status <> 'Cancelled';
    -- 1. explicit stop windows
$h$;
  u_3a CONSTANT text := $h$    -- 3. a local loading follows the Athens day of its stop (071 local_loading_day); its payroll day follows by 060
    for x in select lm.id, lm.driver_id, lm.move_date, to_jsonb(lm) as old,
                    (s.planned_from at time zone 'Europe/Athens')::date as day
               from local_moves lm join rt_stops s on s.id = lm.rt_stop_id
              where s.rt_id = v_rt and s.deleted_at is null and lm.move_kind = 'nat_loading' and lm.deleted_at is null
                and lm.status <> 'Cancelled' and lm.move_date <> (s.planned_from at time zone 'Europe/Athens')::date
              order by lm.id loop
$h$;
  u_3b CONSTANT text := $h$    -- 3. a local loading follows its stop by the days the stop moved IN THIS CALL (095, owner 2/11: its day may
    -- differ from the stop's - loaded the evening before - and keeps that distance; a call that moves no stop, a
    -- vehicle change, leaves it as it is). Its payroll day follows by 060.
    for x in select lm.id, lm.driver_id, lm.move_date, to_jsonb(lm) as old,
                    lm.move_date + ((s.planned_from at time zone 'Europe/Athens')::date - (v_lday0->>s.id::text)::date) as day
               from local_moves lm join rt_stops s on s.id = lm.rt_stop_id
              where s.rt_id = v_rt and s.deleted_at is null and lm.move_kind = 'nat_loading' and lm.deleted_at is null
                and lm.status <> 'Cancelled' and v_lday0 ? s.id::text
                and (s.planned_from at time zone 'Europe/Athens')::date <> (v_lday0->>s.id::text)::date
              order by lm.id loop
$h$;
  p_1a CONSTANT text := $h$        where h.rt_id = p_rt and h.deleted_at is null and h.reason is not null
$h$;
  p_1b CONSTANT text := $h$        -- 095: a handover is a segment with a point (its reason is optional)
        where h.rt_id = p_rt and h.deleted_at is null and h.place_note is not null
$h$;
  p_2a CONSTANT text := $h$      if g.reason is null then return 'seg_reason:' || r.code; end if;
$h$;
  p_2b CONSTANT text := $h$      -- 095 (owner 2/11): a handover needs its point; its reason is optional (none = "-" on the screen)
      if g.place_note is null then return 'seg_place_text:' || r.code; end if;
$h$;
  c_1a CONSTANT text := $h$  -- the reason's VALUE is the CHECK's (seg_reason_list, one list): only its presence is checked here
  if v_rt is null or v_at is null or coalesce(p->>'reason', '') = '' or coalesce(p->>'place_note', '') !~ '[^[:space:]]' then
    perform plan_h_raise('bad_input', 'rt_id, at, place_note and reason');
  end if;
$h$;
  c_1b CONSTANT text := $h$  -- 095 (owner 2/11, relaxed rules): the point is required (without it the change says nothing), the reason is
  -- optional; when given, its VALUE is the CHECK's (seg_reason_list, one list)
  if v_rt is null or v_at is null or coalesce(p->>'place_note', '') !~ '[^[:space:]]' then
    perform plan_h_raise('bad_input', 'rt_id, at and place_note');
  end if;
$h$;
  c_2a CONSTANT text := $h$            p->>'reason', nullif(btrim(coalesce(p->>'reason_note', '')), ''), p_actor)
$h$;
  c_2b CONSTANT text := $h$            nullif(btrim(coalesce(p->>'reason', '')), ''), nullif(btrim(coalesce(p->>'reason_note', '')), ''), p_actor)
$h$;
  f_1a CONSTANT text := $h$  -- code review xhigh 26/10: a later segment's point and reason are refused as plan_seg_change refuses them
  -- (bad_input), not left to the CHECKs (seg_place_text / seg_change_pair): one rule, one refusal shape. The
  -- reason's VALUE stays the CHECK's (seg_reason_list, one list), as in plan_seg_change.
  if (v_set ? 'place_note' and coalesce(v_set->>'place_note', '') !~ '[^[:space:]]')
     or (v_set ? 'reason' and coalesce(v_set->>'reason', '') = '') then
    perform plan_h_raise('bad_input', 'place_note and reason');
  end if;
$h$;
  f_1b CONSTANT text := $h$  -- code review xhigh 26/10: a later segment's point is refused as plan_seg_change refuses it (bad_input), not
  -- left to the CHECK (seg_place_text): one rule, one refusal shape. 095 (owner 2/11): the reason is optional - an
  -- empty one clears it; its VALUE stays the CHECK's (seg_reason_list, one list), as in plan_seg_change.
  if v_set ? 'place_note' and coalesce(v_set->>'place_note', '') !~ '[^[:space:]]' then
    perform plan_h_raise('bad_input', 'place_note');
  end if;
$h$;
  f_2a CONSTANT text := $h$           reason = case when v_set ? 'reason' then v_set->>'reason' else reason end,
$h$;
  f_2b CONSTANT text := $h$           reason = case when v_set ? 'reason' then nullif(btrim(coalesce(v_set->>'reason', '')), '') else reason end,
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int; v_bad text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '095: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_local_loading_problem(bigint)', '4c3dbec3810121a2a585fe8b49ceadf1'),
      ('public.plan_local_loading(jsonb,text,text)', 'f40c4a548ec192af781ef8e62d3227a5'),
      -- 093's text (093 patches plan_rt_update too, one line elsewhere; order 093 -> 095, coordinator 2/11)
      ('public.plan_rt_update(jsonb,text,text)', '70476c188bab027722ceab6c81c6702c'),
      ('public.plan_seg_problem(bigint)', '5e183cd30e6b2f88a8ffd708733c0f8c'),
      ('public.plan_seg_change(jsonb,text,text)', '83f50d99a6afd1a10c310eb9b18d7797'),
      ('public.plan_seg_fix(jsonb,text,text)', '7bbb85d8de29b0b4c6a3e6da7e211a4e')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '095: % is not its live text of 2/11 (plan_rt_update: 093 first; or 095 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  -- the two CHECKs exactly as 072b made them (md5 of pg_get_constraintdef, SELECT 2/11)
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'seg_change_pair') IS DISTINCT FROM '0a84a8c84651dea65eb8d7447c47eca3'
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'seg_other_note') IS DISTINCT FROM '176a16938a0aad6164d3c3d6419cdd11' THEN
    RAISE EXCEPTION '095: seg_change_pair / seg_other_note are not the CHECKs of 072b (095 already applied?) - stop';
  END IF;
  IF (SELECT enabled FROM monitoring.checks WHERE id = 'B-93') IS DISTINCT FROM true THEN
    RAISE EXCEPTION '095: B-93 is not an enabled check - stop, re-measure';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '095: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1: SCHEMA =====
  -- a reason only on a handover (a segment with a point); a point without a reason is a handover too. "other" needs
  -- no note any more. The ADD validates every row.
  ALTER TABLE public.rt_vehicle_segments DROP CONSTRAINT seg_change_pair, DROP CONSTRAINT seg_other_note,
    ADD CONSTRAINT seg_change_pair CHECK (reason IS NULL OR place_note IS NOT NULL);
  COMMENT ON CONSTRAINT seg_change_pair ON public.rt_vehicle_segments IS
    '095 (owner 2/11): a reason only with a point. The point marks a handover (required by plan_seg_change / plan_seg_fix and at COMMIT by plan_seg_problem); the reason is optional, "other" needs no note.';
  -- B-93 counted "other" without a note as a broken CHECK: now it is allowed, so a non-zero would be a false alarm
  UPDATE monitoring.checks SET enabled = false,
    disabled_reason = '095 (owner 2/11, relaxed rules): "other" without a note is allowed, CHECK seg_other_note dropped; the rollback of 095 enables it again'
   WHERE id = 'B-93';

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_local_loading_problem(bigint)', ARRAY[k_1a], ARRAY[k_1b], '0f915c05ff0d83458f6fb1ad79e3c4a1'),
      ('public.plan_local_loading(jsonb,text,text)', ARRAY[l_1a, l_2a, l_3a, l_4a, l_5a], ARRAY[l_1b, l_2b, l_3b, l_4b, l_5b], '725c915709b53d283e2991b07ae57d39'),
      ('public.plan_rt_update(jsonb,text,text)', ARRAY[u_1a, u_2a, u_3a], ARRAY[u_1b, u_2b, u_3b], 'c2cedb4ed68bcab2dd85ffbe5bc13d9c'),
      ('public.plan_seg_problem(bigint)', ARRAY[p_1a, p_2a], ARRAY[p_1b, p_2b], '5287a43951d2656fb5270059b906b1a8'),
      ('public.plan_seg_change(jsonb,text,text)', ARRAY[c_1a, c_2a], ARRAY[c_1b, c_2b], '8f69e9c540c95551930688d9b3141862'),
      ('public.plan_seg_fix(jsonb,text,text)', ARRAY[f_1a, f_2a], ARRAY[f_1b, f_2b], 'be2d212cac2351c4f363d780237af2af')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '095: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '095: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '095: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '095 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 OR (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') IS DISTINCT FROM v_trg1 THEN
    RAISE EXCEPTION '095 proof: triggers % -> % (095 adds none), B-54 must hold', v_trg0, v_trg1;
  END IF;
  IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'seg_change_pair' AND contype = 'c' AND convalidated) IS DISTINCT FROM '452e98822f263804e7015c2347d781d4'
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass AND conname = 'seg_other_note')
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'seg_place_text') IS DISTINCT FROM 'ee2c6054cfa13cb75517245444dc6f9e'
     OR (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
        AND conname = 'seg_reason_list') IS DISTINCT FROM '1a592443e440b92c3fb356c040a312de' THEN
    RAISE EXCEPTION '095 proof: seg_change_pair is not the new validated CHECK, seg_other_note is still there, or seg_place_text / seg_reason_list changed';
  END IF;
  IF (SELECT enabled FROM monitoring.checks WHERE id = 'B-93') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '095 proof: B-93 is still enabled';
  END IF;
  -- every cycle with segments still holds its segment rules (095 writes no segment; a later segment without a point
  -- would now be seg_place_text - none exists)
  SELECT string_agg(DISTINCT r.code, ', ') INTO v_bad FROM public.rt_vehicle_segments g JOIN public.ct_round_trips r ON r.id = g.rt_id
   WHERE g.deleted_at IS NULL AND public.plan_seg_problem(g.rt_id) IS NOT NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '095 proof: plan_seg_problem refuses cycles: %', v_bad;
  END IF;
  RAISE NOTICE '095 OK: a local loading may run on another day (warning + audit row, keeps its distance to its stop), a vehicle change needs its point only (reason optional, "other" without a note), B-93 off, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_local_loading(jsonb,text,text)'::regprocedure) AS local_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_seg_change(jsonb,text,text)'::regprocedure) AS change_md5,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
         AND conname = 'seg_change_pair') AS seg_change_pair,
       (SELECT enabled FROM monitoring.checks WHERE id = 'B-93') AS b93_enabled;
