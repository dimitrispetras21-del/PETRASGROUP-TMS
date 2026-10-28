-- 074 FINGERPRINT - read only (SELECT). Runbook R-1 (before 074) and R-5 (after), and after a rollback (= R-1).
-- One row. Before = after a rollback, column for column. After 074 the ONLY differences allowed are what its NOTICE
-- declares: vs_ge_l / nat_side_ge_l become bridges, nl_direct_live and the NL md5s lose the unlinked NL, the test
-- rows leave natl_orders_live / nl_other_live / cl_live and gl_md5 changes. orders_md5 and stops_md5 never change
-- (via_hub is left out of stops_md5 on purpose: 074 writes it; so are the NL's own stops, which have no order).
SELECT
  (SELECT count(*) FROM public.orders WHERE veroia_switch AND deleted_at IS NULL) AS vs_live,
  (SELECT count(*) FROM public.orders WHERE veroia_switch AND deleted_at IS NULL AND cross_dock_date >= DATE '2026-10-31') AS vs_ge_l,
  (SELECT count(*) FROM public.order_stops s JOIN public.orders o ON o.id = s.order_id WHERE o.veroia_switch AND o.deleted_at IS NULL
      AND s.deleted_at IS NULL AND ((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'))) AS nat_side,
  (SELECT count(*) FROM public.order_stops s JOIN public.orders o ON o.id = s.order_id WHERE o.veroia_switch AND o.deleted_at IS NULL
      AND s.deleted_at IS NULL AND o.cross_dock_date >= DATE '2026-10-31'
      AND ((o.direction = 'Import' AND s.stop_type = 'Unloading') OR (o.direction = 'Export' AND s.stop_type = 'Loading'))) AS nat_side_ge_l,
  (SELECT count(*) FROM public.national_loads WHERE deleted_at IS NULL AND source_type = 'Direct') AS nl_direct_live,
  (SELECT count(*) FROM public.national_loads WHERE deleted_at IS NULL AND source_type IS DISTINCT FROM 'Direct') AS nl_other_live,
  (SELECT md5(coalesce(string_agg(id || ':' || coalesce(deleted_at::text, '-') || ':' || coalesce(status, '-') || ':' || coalesce(truck_id::text, '-'), ',' ORDER BY id), ''))
     FROM public.national_loads) AS nl_md5,
  (SELECT count(*) FROM public.national_orders WHERE deleted_at IS NULL) AS natl_orders_live,
  (SELECT count(*) FROM public.consolidated_loads WHERE deleted_at IS NULL) AS cl_live,
  (SELECT md5(coalesce(string_agg(id || ':' || coalesce(status, '-') || ':' || coalesce(cons_load_id::text, '-') || ':' || coalesce(deleted_at::text, '-'), ',' ORDER BY id), ''))
     FROM public.groupage_lines) AS gl_md5,
  (SELECT md5(coalesce(string_agg(id || ':' || coalesce(deleted_at::text, '-'), ',' ORDER BY id), '')) FROM public.ramp) AS ramp_md5,
  (SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY o.id), '')) FROM public.orders o) AS orders_md5,
  (SELECT md5(coalesce(string_agg((to_jsonb(s) - 'via_hub')::text, '|' ORDER BY s.id), '')) FROM public.order_stops s) AS stops_md5,
  (SELECT count(*) FROM public.order_stops WHERE via_hub) AS via_hub,
  (SELECT count(*) FROM public.shipments WHERE deleted_at IS NULL) + (SELECT count(*) FROM public.shipment_pieces WHERE deleted_at IS NULL)
    + (SELECT count(*) FROM public.piece_legs WHERE deleted_at IS NULL) + (SELECT count(*) FROM public.rt_stops WHERE deleted_at IS NULL) AS v5_live_rows,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) AS f028_md5,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.national_load_follow_order()'::regprocedure) AS f030_md5,
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_vs_set_place(jsonb,text,text)'::regprocedure) AS set_place_md5;
