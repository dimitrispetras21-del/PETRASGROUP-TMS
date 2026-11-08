-- 109 DRY RUN: the whole of 109 inside one DO block that ends in an exception, so nothing is kept (the SQL editor
-- is not atomic across statements; one DO block is). Expected: ERROR "109 DRY RUN OK: plan_board would say
-- intl_trips (N for this week) - nothing kept". Any other error = stop, 109 is not run.
DO $do$
DECLARE
  b_1a CONSTANT text := $h$    -- decision 40 (changed with 41): the unread natl notices for every role, as PLAN_PERMS notices
    'notices', coalesce(($h$;
  b_1b CONSTANT text := $h$    -- 109 (Sotiris report 8/11, item 4): the INTERNATIONAL trips (model 1) of an own truck around the week, so the
    -- forms say a truck that drives one is not free (the rule of plan_h_v1_warn: its day span). Truck, plate, days.
    'intl_trips', coalesce((
      select jsonb_agg(jsonb_build_object('rt_id', r.id, 'truck_id', r.truck_id, 'truck', tr.license_plate,
                                          'date_start', r.date_start, 'date_end', r.date_end) order by r.date_start, r.id)
        from ct_round_trips r
        left join trucks tr on tr.id = r.truck_id
       where r.model = 1 and r.truck_id is not null and r.status <> 'cancelled'
         and r.date_start <= p_week + 13 and coalesce(r.date_end, r.date_start) >= p_week - 7), '[]'::jsonb),
    -- decision 40 (changed with 41): the unread natl notices for every role, as PLAN_PERMS notices
    'notices', coalesce(($h$;
  p pg_proc%rowtype; v_new text; v_n int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- ===== PART 0: GUARDS =====
  SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure('public.plan_board(date,text)');
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '0de34e06dab0bb1315ba94c6934ca915' THEN
    RAISE EXCEPTION '109: plan_board is not the text 109 patches (087, 1/11) - stop';
  END IF;
  IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
    RAISE EXCEPTION '109: plan_board is not a plpgsql function with search_path=public - stop';
  END IF;
  IF (length(p.prosrc) - length(replace(p.prosrc, b_1a, ''))) <> length(b_1a) THEN
    RAISE EXCEPTION '109: the patch target is not in plan_board exactly once - stop';
  END IF;
  -- ===== PART 1: LIVE TEXT + 1 HUNK =====
  v_new := replace(p.prosrc, b_1a, b_1b);
  IF md5(v_new) <> '1fcb789ba0cf08aea836c3aa98270610' THEN
    RAISE EXCEPTION '109: the generated text is not the one measured (md5 %) - stop', md5(v_new);
  END IF;
  -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER and STABLE as they were
  EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_board(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
    pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
  -- ===== PART 2: PROOFS =====
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> '1fcb789ba0cf08aea836c3aa98270610'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
     OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
    RAISE EXCEPTION '109 proof: plan_board does not hold its generated text with its old rights';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '109 proof: the Worker lost EXECUTE on plan_board';
  END IF;
  SELECT jsonb_array_length(b->'intl_trips') INTO v_n
    FROM (SELECT public.plan_board((now() AT TIME ZONE 'Europe/Athens')::date
            - ((extract(isodow from (now() AT TIME ZONE 'Europe/Athens')::date)::int + 1) % 7), 'dispatcher') AS b) q;
  IF v_n IS NULL THEN RAISE EXCEPTION '109 proof: the board of this week lacks intl_trips'; END IF;
  RAISE EXCEPTION '109 DRY RUN OK: plan_board would say intl_trips (% for this week) - nothing kept', v_n;
END $do$;
