-- 079 VERIFY - read only (SELECT), after 079_plan_cutover_move.sql and any time after. One row.
-- EXPECTED: applied = '079 in place', cutover_day = 2026-10-24, opened_at unchanged (28/10 11:39 UTC), floor = true,
-- week_vs_in_v5 = week_vs (every live VS of 24-30/10, Cancelled aside), week_nl_live = 0 (their NL; a
-- Cancelled VS keeps its own), gap = 0 (B-95's
-- equality), b78 = 0, b54_matches = true. bridges_079 grows only if the desk adds VS to the week (the trigger
-- bridges them as 'trigger:plan_bridge_sync', not '079 backfill').
SELECT CASE WHEN public.plan_cutover_day() = DATE '2026-10-24' THEN '079 in place' ELSE '079 NOT APPLIED' END AS applied,
       public.plan_cutover_day() AS cutover_day,
       (SELECT opened_at FROM public.plan_config WHERE id = 1) AS opened_at,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plan_config'::regclass AND conname = 'plan_config_floor')
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plan_config'::regclass AND conname = 'plan_config_future') AS floor,
       (SELECT count(*) FROM public.orders o WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled'
          AND o.cross_dock_date >= DATE '2026-10-24' AND o.cross_dock_date < DATE '2026-10-31') AS week_vs,
       (SELECT count(*) FROM public.orders o WHERE o.veroia_switch AND o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled'
          AND o.cross_dock_date >= DATE '2026-10-24' AND o.cross_dock_date < DATE '2026-10-31' AND public.plan_h_vs_in_v5(o.id)) AS week_vs_in_v5,
       (SELECT count(*) FROM public.national_loads nl JOIN public.orders o ON o.id = nl.source_order_id
         WHERE nl.deleted_at IS NULL AND nl.source_type = 'Direct' AND o.veroia_switch AND o.deleted_at IS NULL
           AND o.status IS DISTINCT FROM 'Cancelled' AND o.cross_dock_date >= DATE '2026-10-24' AND o.cross_dock_date < DATE '2026-10-31') AS week_nl_live,
       (SELECT count(*) FROM public.shipments WHERE created_by = '079 backfill' AND deleted_at IS NULL) AS bridges_079,
       (SELECT count(*) FROM public.plan_cutover_log WHERE kind = 'nl_unlinked' AND reason = '079 backfill') AS nl_unlinked_079,
       (SELECT count(*) FROM public.plan_notices WHERE created_by = '079 backfill' AND kind = 'legacy_nl_replaced') AS notices_079,
       (SELECT count(*) FROM public.order_stops WHERE via_hub) AS via_hub,
       (SELECT count(*) FROM public.order_stops s WHERE s.order_id IS NOT NULL
          AND (public.plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM public.shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
               OR s.via_hub <> public.plan_h_bridge_wanted(s.id))) AS gap,
       (SELECT count(*) FROM public.orders o WHERE o.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
          AND EXISTS (SELECT 1 FROM public.national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)) AS b78,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public')
         = (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_matches;
