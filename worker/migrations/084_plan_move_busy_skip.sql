-- 084 - NATIONAL v5: A MOVE TO A NEW TRUCK IS NOT REFUSED BY THE TRIP IT IS LEAVING (F67, owner 31/10).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
-- Found in the owner's simulation of W44 (31/10): Kagkelidis IAZ7245, RT-1325 (Fri 30 - Mon 2 with VS 630) split into
--   RT-1325 (Fri 30 - Sat 31) and a new trip (Sun 1 - Mon 2, VS 630 -> Veroia). Moving VS 630's pieces to the new trip
--   with the SAME driver was refused "driver_busy (RT-1325)": plan_move_pieces builds the target first (step 1, B139:
--   so a stop the request creates is never swept) and its early check plan_h_busy saw RT-1325 still holding the very
--   legs being moved (they go off in step 2), so RT-1325 still ran to Mon 2. Six writes and a temporary day change
--   were needed to get around it. The owner (31/10): relaxed rules - only data integrity refuses.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: 081 applied (the last v5 migration that ran before this one), 084 not applied, the LIVE texts of
--           plan_move_pieces (072 + 074a's hook + 072b) and plan_h_busy (072b: the segments), day L set, B-54
--   PART 1  plan_move_pieces = live text + 1 hunk: around the target's build only, a transaction-local setting
--           plan.busy_skip names the cycles the moved legs are leaving; it is emptied right after.
--   PART 2  plan_h_busy = live text + 1 hunk: the cycles named in plan.busy_skip are not counted (empty = every cycle,
--           as before, for every other caller).
--   PART 3  proofs, NOTICE "084 OK: ..."
-- The RULE does not move: the deferred EXCLUDE rt_v2_truck_once / rt_v2_driver_once (071b, on rt_vehicle_segments
-- since 072b) still checks every window at COMMIT, as the move left them - the leaving trip shrunk to its own stops.
-- A move that still overlaps the trip it leaves is refused there, with the same truck_busy / driver_busy text
-- (the Worker maps both constraint names, index.js PLAN_CONSTRAINT_CODE). Only the early, too-early check is narrowed.
-- No table, no column, no trigger, no grant, no row written. No Worker change.
-- RUN: 084_plan_move_busy_skip_dryrun.sql, then this file, then 084_plan_move_busy_skip_verify.sql.
-- REVERSE: 084_plan_move_busy_skip_rollback.sql.
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  m_1a CONSTANT text := $h$  if not v_wait then v_tgt := plan_h_target(p->'target', p->'stops', p_actor, p_role); end if;
$h$;
  m_1b CONSTANT text := $h$  -- 084 (F67, owner 31/10): the early busy check of the target skips the cycles these legs are leaving - here
  -- they still hold them (they go off in step 2). The rule itself is the deferred EXCLUDE at COMMIT, on the final windows.
  perform set_config('plan.busy_skip', coalesce(array_to_string(v_src, ','), ''), true);
  if not v_wait then v_tgt := plan_h_target(p->'target', p->'stops', p_actor, p_role); end if;
  perform set_config('plan.busy_skip', '', true);
$h$;
  b_1a CONSTANT text := $h$   where g.deleted_at is null and not g.rt_cancelled and g.trip_type = 'OWNED' and g.rt_id is distinct from p_except
$h$;
  b_1b CONSTANT text := $h$   where g.deleted_at is null and not g.rt_cancelled and g.trip_type = 'OWNED' and g.rt_id is distinct from p_except
     -- 084: the cycles a move is leaving (set by plan_move_pieces around its target only; empty for every other caller)
     and not (g.rt_id = any (coalesce(string_to_array(nullif(current_setting('plan.busy_skip', true), ''), ',')::bigint[], '{}'::bigint[])))
$h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.plan_h_reseq(bigint,text,text)')) = '14322e7190d6431cc11c267f49bb5735' THEN
    RAISE EXCEPTION '084: 081 is not applied (order 081 -> 084) - stop';
  END IF;
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '084: day L is not set (074 / 079) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_move_pieces(jsonb,text,text)', '9bfa8d7fc5978efe84cb5990309b076f'),
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', '99d86d5c59c88264b4825b5410c09a59')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '084: % is not its live text of 31/10 (084 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '084: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1 + PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_move_pieces(jsonb,text,text)', ARRAY[m_1a], ARRAY[m_1b], '70e21dad2a56d7db294e45ac592ed380'),
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', ARRAY[b_1a], ARRAY[b_1b], '285ca0f03cae41e3ddbc22bf41ccfb8b')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
      RAISE EXCEPTION '084: % is not a plpgsql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '084: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '084: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
      RAISE EXCEPTION '084 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '084 proof: triggers % -> % (084 adds none)', v_trg0, v_trg1; END IF;
  -- the rule at COMMIT is untouched: both EXCLUDE constraints are there, deferred
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
       AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') AND contype = 'x' AND condeferrable AND condeferred) <> 2 THEN
    RAISE EXCEPTION '084 proof: the deferred EXCLUDE rt_v2_truck_once / rt_v2_driver_once is not in place';
  END IF;
  RAISE NOTICE '084 OK: plan_move_pieces skips the cycles it leaves in the early busy check (the EXCLUDE at COMMIT stays), triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_move_pieces(jsonb,text,text)'::regprocedure) AS move_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'::regprocedure) AS busy_md5;
