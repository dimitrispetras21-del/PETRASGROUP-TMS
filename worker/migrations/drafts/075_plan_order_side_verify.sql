-- 075 VERIFY - read only (SELECT), after 075_plan_order_side.sql. One row.
-- EXPECTED: applied = '075 in place', changed_texts 0, open_helpers 0, worker_execute true; orders_with_side counts
-- the live national orders whose side is stored (it grows as the form saves; #17 is 1 after its repair).
SELECT CASE WHEN to_regprocedure('public.plan_h_side_dir(text)') IS NOT NULL AND to_regprocedure('public.plan_h_dir_side(text)') IS NOT NULL
            THEN '075 in place' ELSE '075 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_orders_create(jsonb,text,text)', 'b0c6b0ac835066e1c21c99c9aee7604c'),
          ('public.plan_order_update(jsonb,text,text)', 'b614c9b9d45a1b4d7345ca811e1d3e7c'),
          ('public.plan_board(date,text)', '670f72f60edcf09f955fb1f6a74143b9')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('plan_h_side_dir', 'plan_h_dir_side')
          AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE'))) AS open_helpers,
       has_function_privilege('service_role', 'public.plan_orders_create(jsonb,text,text)', 'EXECUTE')
         AND has_function_privilege('service_role', 'public.plan_order_update(jsonb,text,text)', 'EXECUTE')
         AND has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE') AS worker_execute,
       (SELECT count(*) FROM public.national_orders WHERE deleted_at IS NULL AND direction IS NOT NULL) AS orders_with_side,
       (SELECT count(*) FROM public.national_orders WHERE deleted_at IS NULL) AS orders_live;
