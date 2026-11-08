-- 110 ROLLBACK: plan_board back to the text 109 left (md5 1fcb789ba0cf08aea836c3aa98270610), by removing the one hunk. The front end needs no
-- revert: without the truck key the panel says "topikos" alone, as before 110.
DO $do$
DECLARE
  b_a CONSTANT text := $h$'time_from', lm.time_from, 'time_to', lm.time_to)
                                from local_moves lm left join drivers d2 on d2.id = lm.driver_id$h$;
  b_b CONSTANT text := $h$'time_from', lm.time_from, 'time_to', lm.time_to,
                                                        -- 110 (owner 8/11): the local driver truck, for the TOPIKA panel of the board
                                                        'truck_id', lm.truck_id, 'truck', tl2.license_plate)
                                from local_moves lm left join drivers d2 on d2.id = lm.driver_id
                                left join trucks tl2 on tl2.id = lm.truck_id$h$;
  p pg_proc%rowtype; v_new text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure('public.plan_board(date,text)');
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM 'd8fa4ba5ea2ce1d4d87b33e22f499956' THEN
    RAISE EXCEPTION '110 rollback: plan_board is not the text 110 wrote - stop';
  END IF;
  v_new := replace(p.prosrc, b_b, b_a);
  IF md5(v_new) <> '1fcb789ba0cf08aea836c3aa98270610' THEN RAISE EXCEPTION '110 rollback: the text back is not 109''s (md5 %) - stop', md5(v_new); END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_board(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
    pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> '1fcb789ba0cf08aea836c3aa98270610'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text THEN
    RAISE EXCEPTION '110 rollback proof: plan_board is not 109''s text with its old rights';
  END IF;
  RAISE NOTICE '110 ROLLBACK OK: plan_board is 109''s text again';
END $do$;
