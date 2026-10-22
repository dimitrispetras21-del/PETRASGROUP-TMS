-- 071 VERIFY - read-only (SELECT only, writes nothing). Run after 071_plan_schema.sql and any time later.
-- ONE row. ASCII only. It errors before 071 (the new relations do not exist yet) - that is expected.
-- EXPECTED right after 071 (F1, before any F2 call):
--   applied = '071 in place' ; b54_matches = true ; new_triggers = 9 ; new_rows = 0 ; v5_cycles = 0 ;
--   v1_cycles = the round trips before 071 ; hub = '360 CROSS-DOCK' ; via_hub_stops = 0 ; nat_loadings = 0 ;
--   open_relations = 0 ; rls_off = 0 ; policies = 0 ; open_functions = 0
-- After F2/F5 new_rows, v5_cycles, via_hub_stops and nat_loadings grow; the last four stay 0 for ever.
SELECT
  CASE WHEN to_regclass('public.shipments') IS NOT NULL AND to_regclass('public.rt_stops') IS NOT NULL
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_status_guard()'::regprocedure) = 'd7757f99c3443ac167d5bdaf3e34b142'
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) = '5fa0a08418147b22d2852db3b8c72c3e'
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_auto_close(bigint)'::regprocedure) = 'eba2146ca4c521da6365edd28c4507af'
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure) = '151dab06e2676f3c8885d7298d0ac6af'
       THEN '071 in place' ELSE '071 NOT in place' END AS applied,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'
     AND tgname IN ('ct_rt_legs_v2_guard', 'plan_rt_window_sync', 'plan_chk_rt', 'plan_chk_stops', 'plan_chk_legs',
                    'plan_chk_pieces', 'plan_chk_shipments', 'plan_chk_bridge_stop', 'plan_chk_local_loading')) AS new_triggers,
  (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
    + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices) AS new_rows,
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles,
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 1) AS v1_cycles,
  (SELECT string_agg(id || ' ' || name, ', ') FROM public.locations WHERE is_hub) AS hub,
  (SELECT count(*) FROM public.order_stops WHERE via_hub) AS via_hub_stops,
  (SELECT count(*) FROM public.local_moves WHERE move_kind = 'nat_loading') AS nat_loadings,
  (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices', 'v_shipments', 'v_piece_pos',
                       'v_piece_state', 'v_rt_stop_state', 'v_rt_cycle', 'v_hub_bucket', 'v_national_order_state', 'v_vs_state')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) AS open_relations,
  (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
     AND relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices') AND NOT relrowsecurity) AS rls_off,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
     AND tablename IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices')) AS policies,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('plan_chk', 'plan_rt_window_sync', 'ct_rt_legs_v2_guard', 'plan_shipment_problem', 'plan_leg_problem',
                       'plan_rt_problem', 'plan_local_loading_problem')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('service_role', p.oid, 'EXECUTE'))) AS open_functions;
