-- 096 - NATIONAL v5: THE VEHICLE CHANGE ACCEPTS A BUSY TRUCK / DRIVER LIKE EVERY OTHER SAVE (086 accept_busy)
-- (coordinator 2/11 for the owner: relaxed rules - "a truck or driver on another trip at those hours" is said and
-- saved with one press, kept with a trace; only data integrity refuses). Stacked on 095 (#217).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
--
-- WHAT WAS THERE (SELECT 2/11): 086 gave accept_busy to plan_h_target (/plan/legs, /plan/move) and plan_rt_update
-- (PATCH /plan/rt). The handover (plan_seg_change, POST /plan/rt/:id/handover) and the segment correction
-- (plan_seg_fix, PATCH /plan/segments/:id) refused an unknown key accept_busy (plan_h_keys) and their busy pre-check
-- (plan_h_seg_busy -> plan_h_busy) refused truck_busy / driver_busy with no way through: a new truck that already has
-- a load the same day could not take over a trip at all.
-- NOW: both take accept_busy (a boolean, at the top of the body, beside rt_id / segment_id) and call 086's
-- plan_h_accept_busy, exactly as plan_rt_update does. With accept_busy: true the pre-check passes, 086's BEFORE trigger
-- plan_seg_overlap_mark names the overlapping trips on the segments this call writes (one audit_log row each time), and
-- the COMMIT rules check the pairs (a third overlap nobody accepted is still refused). Without it, or false: exactly
-- as today. A non-boolean is bad_input ('p.accept_busy'). The dry run with accept_busy previews the same.
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L set; plan_seg_change and plan_seg_fix = the texts 095 writes (md5; before 095 it stops:
--           "095 first"); plan_h_accept_busy, plan_h_busy, plan_h_seg_busy and plan_seg_overlap_mark = their live texts
--           (relied on, NOT patched); the trigger plan_seg_overlap_mark enabled on rt_vehicle_segments
--   PART 1  live text + hunks: plan_seg_change, plan_seg_fix (the key and the call, one hunk each)
--   PART 2  proofs, NOTICE "096 OK: ..."
-- No table, no column, no trigger, no grant, no row written. No Worker change: /plan/rt/:id/handover and PATCH
-- /plan/segments/:id pass their bodies as p; truck_busy / driver_busy already have their Worker texts (086).
-- ORDER: 093 -> 095 -> 096. RUN: 096_plan_handover_accept_busy_dryrun.sql, then this file, then
-- 096_plan_handover_accept_busy_verify.sql. REVERSE: 096_plan_handover_accept_busy_rollback.sql, BEFORE 095's rollback
-- (095's rollback guards on the texts 095 wrote). Overlaps already accepted (overlap_rts, audit rows) STAY.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  c_1a CONSTANT text := $h$                               'request_id', 'dry_run', 'prev_partner_rate', 'confirm_token'], 'p');
$h$;
  c_1b CONSTANT text := $h$                               'request_id', 'dry_run', 'prev_partner_rate', 'confirm_token', 'accept_busy'], 'p');
  -- 096: accept_busy = true lets this handover overlap another trip of the same truck / driver, with a trace (086)
  perform plan_h_accept_busy(p, 'p', p_actor, p_role);
$h$;
  f_1a CONSTANT text := $h$  perform plan_h_keys(p, array['segment_id', 'set', 'dry_run', 'prev_partner_rate', 'confirm_token'], 'p');
$h$;
  f_1b CONSTANT text := $h$  perform plan_h_keys(p, array['segment_id', 'set', 'dry_run', 'prev_partner_rate', 'confirm_token', 'accept_busy'], 'p');
  -- 096: accept_busy = true lets this correction overlap another trip of the same truck / driver, with a trace (086)
  perform plan_h_accept_busy(p, 'p', p_actor, p_role);
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '096: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      -- the texts 095 writes (order 095 -> 096)
      ('public.plan_seg_change(jsonb,text,text)', '8f69e9c540c95551930688d9b3141862'),
      ('public.plan_seg_fix(jsonb,text,text)', 'be2d212cac2351c4f363d780237af2af'),
      -- relied on, not patched (086, live 2/11)
      ('public.plan_h_accept_busy(jsonb,text,text,text)', '1e5d0fe69ff7468ca42d2867d0a21001'),
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', 'ffbfbf45a9b3cc353862b943a1761388'),
      ('public.plan_h_seg_busy(bigint)', '606fc317bcfe42f2f13560bb0cc8a195'),
      ('public.plan_seg_overlap_mark()', 'bfbcba61f7d738c8c49925fedbd3454e')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '096: % is not the text 096 builds on (095 first; or 096 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.rt_vehicle_segments'::regclass
                   AND tgname = 'plan_seg_overlap_mark' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION '096: the trigger plan_seg_overlap_mark (086) is not enabled on rt_vehicle_segments - stop';
  END IF;

  -- ===== PART 1: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_seg_change(jsonb,text,text)', ARRAY[c_1a], ARRAY[c_1b], '8b10443cb30cf09fe75e69893cbef0bc'),
      ('public.plan_seg_fix(jsonb,text,text)', ARRAY[f_1a], ARRAY[f_1b], 'fa4f5ba1c2379ddf68491208a4b52fd8')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '096: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '096: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '096: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '096 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 2: PROOFS =====
  -- the base rules beside it are untouched: the relied-on texts are still theirs
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'::regprocedure)
       <> 'ffbfbf45a9b3cc353862b943a1761388' THEN
    RAISE EXCEPTION '096 proof: plan_h_busy changed';
  END IF;
  RAISE NOTICE '096 OK: the vehicle change and the segment correction take accept_busy (086): a busy truck / driver is saved with one press and a trace';
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_seg_change(jsonb,text,text)'::regprocedure) AS change_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_seg_fix(jsonb,text,text)'::regprocedure) AS fix_md5;
