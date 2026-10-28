-- 077 VERIFY - read only (SELECT), after 077_plan_order_edit.sql. One row.
-- EXPECTED: applied = '077 in place', changed_texts 0, open_read 0, worker_execute true; edit_requests /
-- points_added / points_removed count what the edit form did through 077 (0 right after the run; #84 adds 1
-- request and 1 point after its repair).
SELECT CASE WHEN to_regprocedure('public.plan_order_read(bigint,text)') IS NOT NULL THEN '077 in place' ELSE '077 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_order_update(jsonb,text,text)', 'a6c62b6cfc7850cbe5a5d90a64ad6db6')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'plan_order_read'
          AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) AS open_read,
       has_function_privilege('service_role', 'public.plan_order_update(jsonb,text,text)', 'EXECUTE')
         AND coalesce((SELECT has_function_privilege('service_role', p.oid, 'EXECUTE') FROM pg_proc p
                        WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'plan_order_read'), false) AS worker_execute,
       (SELECT count(*) FROM public.audit_log WHERE table_name = 'plan_request' AND after_data->>'op' = 'plan_order_update') AS edit_requests,
       (SELECT coalesce(sum(jsonb_array_length(after_data->'answer'->'ids'->'new_shipment_ids')), 0) FROM public.audit_log
         WHERE table_name = 'plan_request' AND after_data->>'op' = 'plan_order_update') AS points_added,
       (SELECT count(*) FROM public.shipments WHERE deleted_reason = 'plan_order_update: point removed') AS points_removed;
