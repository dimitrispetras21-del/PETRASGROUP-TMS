-- 112 - NATIONAL v5: THE BOARD NAMES THE LOCAL DRIVER'S TRUCK OF A LOCAL LOADING (owner 8/11, TOPIKA panel, #286).
-- EXECUTED 8/11/2026 by the owner: dry run "112 DRY RUN OK ... (0 in this week) - nothing kept", board_md5
-- 6ee19458d60e62de1492fa72edec36c8, verify md5_ok / worker_exec = true. Do NOT run again. The NEXT change to
-- plan_board guards on md5 6ee19458d60e62de1492fa72edec36c8 (this text), not on 109's.
-- Was: DRAFT. RUN after 15:00 by the owner: 112_plan_board_local_truck_dryrun.sql, then this file, then
-- 112_plan_board_local_truck_verify.sql. REVERSE: 112_plan_board_local_truck_rollback.sql.
-- The approved Figma (2607:7793, frame 3) names the local driver with his truck ("<plate> - topikos"); plan_board's
-- stops[].local_loading carried the driver only (072:2399-2406, unchanged by 109), although local_moves keeps the
-- truck (plan_local_loading writes truck_id). Measured 8/11 (SELECT): 0 live nat_loading rows, nothing to repair.
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: plan_board = the text 109 left (md5 1fcb789ba0cf08aea836c3aa98270610), plpgsql, search_path=public, the hunk once
--   PART 1  plan_board = live text + 1 hunk: local_loading adds truck_id and truck (the plate, trucks.license_plate,
--           as every plate of the board); a left join, so a loading without a truck reads truck = null
--   PART 2  proofs: md5 6ee19458d60e62de1492fa72edec36c8, rights and SECURITY DEFINER kept, the Worker can EXECUTE, this week's board reads and
--           every local loading in it has both keys
-- No table, no column, no trigger, no row written. No Worker change: GET /plan/board forwards the answer as it is.
-- No money key (PLAN_MONEY_KEYS): a plate. The front end (core/wn5-logic.js localPanel) reads truck when present and
-- says "topikos" alone when absent, so the front end may be merged first.
DO $do$
DECLARE
  b_a CONSTANT text := $h$'time_from', lm.time_from, 'time_to', lm.time_to)
                                from local_moves lm left join drivers d2 on d2.id = lm.driver_id$h$;
  b_b CONSTANT text := $h$'time_from', lm.time_from, 'time_to', lm.time_to,
                                                        -- 112 (owner 8/11): the local driver truck, for the TOPIKA panel of the board
                                                        'truck_id', lm.truck_id, 'truck', tl2.license_plate)
                                from local_moves lm left join drivers d2 on d2.id = lm.driver_id
                                left join trucks tl2 on tl2.id = lm.truck_id$h$;
  p pg_proc%rowtype; v_new text; v_ll int; v_ok int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '10min', true);   -- the proof reads this week's board
  -- ===== PART 0: GUARDS =====
  SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure('public.plan_board(date,text)');
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '1fcb789ba0cf08aea836c3aa98270610' THEN
    RAISE EXCEPTION '112: plan_board is not the text 112 patches (109, 8/11) - stop';
  END IF;
  IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
    RAISE EXCEPTION '112: plan_board is not a plpgsql function with search_path=public - stop';
  END IF;
  IF (length(p.prosrc) - length(replace(p.prosrc, b_a, ''))) <> length(b_a) THEN
    RAISE EXCEPTION '112: the patch target is not in plan_board exactly once - stop';
  END IF;
  -- ===== PART 1: LIVE TEXT + 1 HUNK =====
  v_new := replace(p.prosrc, b_a, b_b);
  IF md5(v_new) <> '6ee19458d60e62de1492fa72edec36c8' THEN
    RAISE EXCEPTION '112: the generated text is not the one measured (md5 %) - stop', md5(v_new);
  END IF;
  -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER and STABLE as they were
  EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_board(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
    pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
  -- ===== PART 2: PROOFS =====
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> '6ee19458d60e62de1492fa72edec36c8'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
     OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
    RAISE EXCEPTION '112 proof: plan_board does not hold its generated text with its old rights';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '112 proof: the Worker lost EXECUTE on plan_board';
  END IF;
  -- this week's board still reads, and every local loading it carries now has both truck keys (null when none)
  SELECT count(*), count(*) FILTER (WHERE x.s ? 'truck' AND x.s ? 'truck_id') INTO v_ll, v_ok
    FROM (SELECT public.plan_board((now() AT TIME ZONE 'Europe/Athens')::date
            - ((extract(isodow from (now() AT TIME ZONE 'Europe/Athens')::date)::int + 1) % 7), 'dispatcher') AS b) q,
         jsonb_array_elements(q.b->'cycles') c, jsonb_array_elements(c->'stops') st,
         LATERAL (SELECT st->'local_loading' AS s) x
   WHERE jsonb_typeof(x.s) = 'object';
  IF v_ll <> v_ok THEN RAISE EXCEPTION '112 proof: % local loadings, % with the truck keys', v_ll, v_ok; END IF;
  RAISE NOTICE '112 OK: plan_board names the truck of a local loading (% in this week)', v_ll;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT md5(prosrc) AS board_md5 FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure;
