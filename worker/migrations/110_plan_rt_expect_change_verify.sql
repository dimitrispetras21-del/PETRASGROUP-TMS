-- 110 VERIFY (read-only). Expected one row: md5_ok = true, worker_exec = true, takes_key = true.
SELECT md5(prosrc) = 'b005474aae99761ea71473d085ffc053' AS md5_ok,
       has_function_privilege('service_role', 'public.plan_rt_update(jsonb,text,text)', 'EXECUTE') AS worker_exec,
       position('expect_change' in prosrc) > 0 AS takes_key
  FROM pg_proc WHERE oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure;
