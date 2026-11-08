-- 112 VERIFY (read-only): the live text is 112's and the Worker can call it. Expected one row: md5_ok = true,
-- worker_exec = true.
SELECT md5(prosrc) = '6ee19458d60e62de1492fa72edec36c8' AS md5_ok,
       has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') AS worker_exec
  FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure;
