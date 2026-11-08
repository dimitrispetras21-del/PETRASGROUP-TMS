-- 109 VERIFY (read-only): the live text is 109's, the Worker can call it, and this week's board names the
-- international trips. Expected one row: md5_ok = true, worker_exec = true, intl_trips >= 0.
SELECT md5(prosrc) = '1fcb789ba0cf08aea836c3aa98270610' AS md5_ok,
       has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') AS worker_exec,
       (SELECT jsonb_array_length(public.plan_board((now() AT TIME ZONE 'Europe/Athens')::date
          - ((extract(isodow from (now() AT TIME ZONE 'Europe/Athens')::date)::int + 1) % 7), 'dispatcher')->'intl_trips')) AS intl_trips
  FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure;
