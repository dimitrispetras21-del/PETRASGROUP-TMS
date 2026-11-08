-- 111 VERIFY - read-only, one row. Expected: result = '111 in place', b95 = 0, b99 = 0, anon_execute = false.
-- stops_with_hour / stops_with_choice / stops_exchange_set count what the new form has written since (0 right after 111).
SELECT CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops'
                    AND column_name IN ('time_from', 'time_to')) = 2
             AND (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'via_hub') = 'YES'
             AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname IN ('order_stops_time_from_fmt', 'order_stops_time_to_fmt')) = 2
             AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_h_bridge_wanted(bigint)'::regprocedure) LIKE '%s.via_hub is distinct from false%'
             AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_bridge_sync(bigint,text)'::regprocedure) NOT LIKE '%update order_stops set via_hub%'
             AND (SELECT prosrc FROM pg_proc WHERE oid = 'public.pl_h_delivery_write(bigint,bigint,text)'::regprocedure) LIKE '%pallets_exchanged IS DISTINCT FROM 0%'
             AND pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgname = 'plan_bridge_on_stop' AND tgrelid = 'public.order_stops'::regclass)) LIKE '%order_id, via_hub ON%'
             AND pg_get_viewdef('public.pl_v_missing_delivery'::regclass, true) LIKE '%pallets_exchanged IS DISTINCT FROM 0%'
        THEN '111 in place' ELSE '111 NOT in place' END AS result,
       (SELECT count(*) FROM orders o WHERE EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id = o.id AND ((o.deleted_at IS NULL AND coalesce(o.veroia_switch, false) AND o.status IS DISTINCT FROM 'Cancelled' AND s.deleted_at IS NULL AND coalesce(s.pallets, 0) > 0 AND s.via_hub IS DISTINCT FROM false AND coalesce((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'), false) AND EXISTS (SELECT 1 FROM plan_config c WHERE coalesce(o.cross_dock_date >= c.cutover_day, false) OR EXISTS (SELECT 1 FROM shipments b0 WHERE b0.order_id = o.id AND b0.order_stop_id IS NOT NULL AND b0.deleted_reason IS DISTINCT FROM '074 rollback'))) <> EXISTS (SELECT 1 FROM shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)))) AS b95,
       (SELECT count(*) FROM order_stops s JOIN orders o ON o.id = s.order_id WHERE s.via_hub IS NOT NULL AND NOT coalesce((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'), false)) AS b99,
       has_function_privilege('anon', 'public.pl_h_delivery_write(bigint,bigint,text)', 'EXECUTE')
         OR has_function_privilege('anon', 'public.plan_bridge_sync(bigint,text)', 'EXECUTE') AS anon_execute,
       (SELECT count(*) FROM order_stops WHERE time_from IS NOT NULL OR time_to IS NOT NULL) AS stops_with_hour,
       (SELECT count(*) FROM order_stops WHERE via_hub IS NOT NULL) AS stops_with_choice,
       (SELECT count(*) FROM order_stops WHERE pallets_exchanged IS NOT NULL) AS stops_exchange_set;
