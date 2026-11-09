-- 110 DRY RUN: all of 110 in one DO block that ends in an exception, so nothing is kept. Expected: ERROR
-- "110 DRY RUN OK: plan_rt_update would take expect_change - nothing kept". Any other error = stop.
DO $do$
DECLARE
  h1a CONSTANT text := $h$  perform plan_h_keys(p, array['rt_id', 'set', 'stops', 'shift', 'dry_run', 'confirm_token', 'accept_busy'], 'p');$h$;
  h1b CONSTANT text := $h$  perform plan_h_keys(p, array['rt_id', 'set', 'stops', 'shift', 'dry_run', 'confirm_token', 'accept_busy', 'expect_change'], 'p');$h$;
  h2a CONSTANT text := $h$  if r.status = 'cancelled' then perform plan_h_raise('rt_cancelled', r.code); end if;$h$;
  h2b CONSTANT text := $h$  if r.status = 'cancelled' then perform plan_h_raise('rt_cancelled', r.code); end if;
  -- 110 (Sotiris report 8/11, item 7): two people changing the same trip - the second save no longer wins in silence.
  -- expect_change = the newest change by a person the screen saw (087 plan_h_last_change.at, null = none yet); another
  -- change since then refuses this one, its dry run too, and nothing is written. Without the key: as before.
  if p ? 'expect_change' then
    if jsonb_typeof(p->'expect_change') not in ('string', 'null') then perform plan_h_raise('bad_input', 'expect_change'); end if;
    if (plan_h_last_change(v_rt)->>'at')::timestamptz is distinct from (p->>'expect_change')::timestamptz then
      perform plan_h_raise('rt_changed', coalesce(plan_h_last_change(v_rt)->>'role', '') || ' ' || coalesce(plan_h_last_change(v_rt)->>'at', ''));
    end if;
  end if;$h$;
  p pg_proc%rowtype; v_new text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure('public.plan_rt_update(jsonb,text,text)');
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '2ed8efd0606344e2e3bca7efb933d4a6' THEN
    RAISE EXCEPTION '110: plan_rt_update is not the text 110 patches - stop';
  END IF;
  IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN
    RAISE EXCEPTION '110: plan_rt_update is not a plpgsql function with search_path=public - stop';
  END IF;
  v_new := p.prosrc;
  IF (length(v_new) - length(replace(v_new, h1a, ''))) <> length(h1a) OR (length(v_new) - length(replace(v_new, h2a, ''))) <> length(h2a) THEN
    RAISE EXCEPTION '110: a patch target is not in plan_rt_update exactly once - stop';
  END IF;
  v_new := replace(replace(v_new, h1a, h1b), h2a, h2b);
  IF md5(v_new) <> 'b005474aae99761ea71473d085ffc053' THEN RAISE EXCEPTION '110: the generated text is not the one measured (md5 %) - stop', md5(v_new); END IF;
  -- CREATE OR REPLACE keeps the oid, owner and grants; SECURITY DEFINER and volatility as they were
  EXECUTE format('CREATE OR REPLACE FUNCTION public.plan_rt_update(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
    pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> 'b005474aae99761ea71473d085ffc053'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
     OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef THEN
    RAISE EXCEPTION '110 proof: plan_rt_update does not hold its generated text with its old rights';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.plan_rt_update(jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '110 proof: the Worker lost EXECUTE on plan_rt_update';
  END IF;
  RAISE EXCEPTION '110 DRY RUN OK: plan_rt_update would take expect_change - nothing kept';
END $do$;
