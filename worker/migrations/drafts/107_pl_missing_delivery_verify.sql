-- 107 VERIFY - read-only, one row. Expected: result = '107 in place', anon/auth = false, runner_select = true.
-- runner_reads_bases: the view is security_invoker, so the auditor reads it only if it also reads its seven base
-- tables. false is not a 107 failure: it says a GRANT is needed before the auditor check of U5 (F-32) can run.
SELECT CASE WHEN to_regclass('public.pl_v_missing_delivery') IS NOT NULL
             AND to_regprocedure('public.pl_no_exchange(jsonb,text,text)') IS NOT NULL
             AND NOT has_table_privilege('anon', 'public.pl_v_missing_delivery', 'SELECT')
             AND NOT has_table_privilege('authenticated', 'public.pl_v_missing_delivery', 'SELECT')
             AND has_table_privilege('tms_check_runner', 'public.pl_v_missing_delivery', 'SELECT')
             AND NOT has_function_privilege('anon', 'public.pl_no_exchange(jsonb,text,text)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.pl_no_exchange(jsonb,text,text)', 'EXECUTE')
             AND has_function_privilege('service_role', 'public.pl_no_exchange(jsonb,text,text)', 'EXECUTE')
        THEN '107 in place' ELSE '107 NOT in place' END AS result,
       has_table_privilege('anon', 'public.pl_v_missing_delivery', 'SELECT') AS anon_select,
       has_function_privilege('authenticated', 'public.pl_no_exchange(jsonb,text,text)', 'EXECUTE') AS auth_execute,
       has_table_privilege('tms_check_runner', 'public.pl_v_missing_delivery', 'SELECT') AS runner_select,
       (SELECT bool_and(has_table_privilege('tms_check_runner', t, 'SELECT')) FROM unnest(ARRAY['public.orders', 'public.order_stops',
         'public.clients', 'public.locations', 'public.stock_lots', 'public.shipments', 'public.pl_movements']) t) AS runner_reads_bases,
       (SELECT count(*) FROM public.pl_v_missing_delivery) AS missing_stops,
       (SELECT count(DISTINCT order_id) FROM public.pl_v_missing_delivery) AS missing_orders;
