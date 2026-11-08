-- 108 VERIFY - read-only, one row. Expected: result = '108 in place', b54_matches = true, anon_execute = false.
-- deliveries_by_trigger counts what the base wrote since 108 (0 right after it; it grows with each delivered order).
SELECT CASE WHEN to_regprocedure('public.pl_h_delivery_write(bigint,bigint,text)') IS NOT NULL
             AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pl_delivery_from_order' AND tgrelid = 'public.orders'::regclass AND tgenabled <> 'D')
             AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pl_delivery_from_stop' AND tgrelid = 'public.order_stops'::regclass AND tgenabled <> 'D')
             AND NOT has_function_privilege('anon', 'public.pl_h_delivery_write(bigint,bigint,text)', 'EXECUTE')
        THEN '108 in place' ELSE '108 NOT in place' END AS result,
       (SELECT red_value::int FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
       has_function_privilege('anon', 'public.pl_h_delivery_write(bigint,bigint,text)', 'EXECUTE') AS anon_execute,
       (SELECT count(*) FROM public.audit_log WHERE actor = 'system' AND after_data ->> 'source' = 'trigger:108') AS deliveries_by_trigger,
       (SELECT count(*) FROM public.pl_v_missing_delivery) AS missing_stops;
