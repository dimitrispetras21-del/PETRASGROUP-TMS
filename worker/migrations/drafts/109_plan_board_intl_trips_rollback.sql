-- 109 ROLLBACK: plan_board back to the text 087 left (md5 0de34e06dab0bb1315ba94c6934ca915), by removing the one hunk. The front end
-- needs no revert: without intl_trips the forms behave as before 109.
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
  p pg_proc%rowtype; v_new text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure('public.plan_board(date,text)');
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '1fcb789ba0cf08aea836c3aa98270610' THEN
    RAISE EXCEPTION '109 rollback: plan_board is not the text 109 wrote - stop';
  END IF;
  v_new := replace(p.prosrc, b_1b, b_1a);
  IF md5(v_new) <> '0de34e06dab0bb1315ba94c6934ca915' THEN RAISE EXCEPTION '109 rollback: the text back is not 087''s (md5 %) - stop', md5(v_new); END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_board(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
    pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> '0de34e06dab0bb1315ba94c6934ca915'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text THEN
    RAISE EXCEPTION '109 rollback proof: plan_board is not 087''s text with its old rights';
  END IF;
  RAISE NOTICE '109 ROLLBACK OK: plan_board is 087''s text again';
END $do$;
