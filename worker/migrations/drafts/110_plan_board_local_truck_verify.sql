-- 110 VERIFY (read-only): the live text is 110's and the Worker can call it. Expected one row: md5_ok = true,
-- worker_exec = true.
SELECT md5(prosrc) = 'd8fa4ba5ea2ce1d4d87b33e22f499956' AS md5_ok,
       has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') AS worker_exec
  FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure;
