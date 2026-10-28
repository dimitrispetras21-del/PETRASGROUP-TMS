-- 074 VERIFY - read only (SELECT), after 074_plan_cutover.sql (Runbook R-5) and any time after. One row.
-- EXPECTED: applied = '074 in place', b54_matches = true, legs = 0 on day L before the first assignment (it grows
-- after - expected), gap = 0 (B-95's equality), b78 = 0, open_functions = 0, changed_texts = 0.
SELECT CASE WHEN to_regprocedure('public.plan_bridge_sync(bigint,text)') IS NOT NULL AND to_regclass('public.plan_cutover_log') IS NOT NULL
             AND public.plan_cutover_day() IS NOT NULL THEN '074 in place' ELSE '074 NOT APPLIED' END AS applied,
       public.plan_cutover_day() AS cutover_day,
       (SELECT count(*) FROM public.shipments WHERE deleted_at IS NULL AND order_stop_id IS NOT NULL) AS bridges,
       (SELECT count(DISTINCT order_id) FROM public.shipments WHERE deleted_at IS NULL AND order_stop_id IS NOT NULL) AS vs_bridged,
       (SELECT count(*) FROM public.order_stops WHERE via_hub) AS via_hub,
       (SELECT count(*) FROM public.plan_cutover_log WHERE kind = 'nl_unlinked') AS nl_unlinked,
       (SELECT count(*) FROM public.plan_cutover_log WHERE kind IN ('test_cleanup', 'gl_unassigned')) AS test_rows,
       (SELECT count(*) FROM public.piece_legs WHERE deleted_at IS NULL) AS legs,
       (SELECT count(*) FROM public.order_stops s WHERE s.order_id IS NOT NULL
          AND (public.plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM public.shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
               OR s.via_hub <> public.plan_h_bridge_wanted(s.id))) AS gap,
       (SELECT count(*) FROM public.orders o WHERE o.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
          AND EXISTS (SELECT 1 FROM public.national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)) AS b78,
       (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('plan_h_vs_nat_side', 'plan_h_vs_in_v5', 'plan_h_bridge_wanted', 'plan_h_bridge_executed', 'plan_h_vs_repoint',
                            'plan_h_bridge_drop', 'plan_h_bridge_retire', 'plan_h_bridge_unplan', 'plan_h_bridge_recut', 'plan_h_bridge_place',
                            'plan_bridge_sync', 'plan_bridge_on_order', 'plan_bridge_on_stop', 'plan_legacy_frozen')
          AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE'))) AS open_functions,
       (SELECT count(*) FROM (VALUES
          ('public.plan_vs_set_place(jsonb,text,text)', 'c8814ab08d0a86cfb77b79a89b9ba8a8'),
          ('public.order_dates_follow()', 'a55eb83e75fc4e442ea026f4a6c858e5'),
          ('public.national_load_follow_order()', 'e6e1982837e46390b7a4dac514616ffb')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS triggers,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public')
         = (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_matches;
