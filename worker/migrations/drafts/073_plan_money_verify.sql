-- 073 VERIFY - read-only (SELECT only, writes nothing). Run after 073_plan_money.sql and any time later.
-- ONE row. ASCII only. Works before 073 too (then applied = '073 NOT in place').
-- EXPECTED right after 073 (and until day L): applied = '073 in place' ; views_changed = 0 ; functions_changed = 0 ;
--   invoker_lost = 0 ; open_money = 0 ; open_helper = 0 ; stop_once = true ; b54_matches = true ; v5_rows = 0.
-- After L: v5_rows grows; every other value stays as above for ever (a change = someone rewrote a view or a function).
-- The md5s are the texts 073 proves (its PART 5 views and PART 2 hooks; tests/sql-073-drafts.test.js keeps the lists
--   equal). plan_h_drop_consequences and plan_rt_update hold 072b's hooks too: their md5 here is derived on the
--   production-shaped PGlite copy from 072 + the 072b draft and is re-derived from production after 072b runs.
SELECT
  CASE WHEN to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NOT NULL
        AND to_regclass('public.ct_v_v5_revenue') IS NOT NULL AND to_regclass('public.pl_mov_stop_once') IS NOT NULL
       THEN '073 in place' ELSE '073 NOT in place' END AS applied,
  (SELECT count(*) FROM (VALUES
      ('public.ct_v_v5_revenue', 'c9dc289ac9effdcff38a5a4847ca3e70'),
      ('public.ct_v_rt_revenue', 'ad3c2b619ee826b3c8250a07011807da'),
      ('public.ct_v_rt_costs', 'ffd8d8191117b0833fb656faa10d3fa2'),
      ('public.ct_v_rt_pnl', '26e49204998a386c22f45ebf1746b177'),
      ('public.dl_v_rt_route', 'b21405a7856b912d2ea697235461cbd6'),
      ('public.ct_v_rt_pallet_gate', '92daf0df9d41c2028880fac7be0167c5'),
      ('public.stock_v_pieces', 'db95036d7dcc8cb02d32843ee0b2fb7c')) g(rel, m)
    WHERE to_regclass(g.rel) IS NULL OR md5(pg_get_viewdef(to_regclass(g.rel), true)) <> g.m) AS views_changed,
  (SELECT count(*) FROM (VALUES
      ('public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)', '0d95758b35f6095d42b551c287e3008b'),
      ('public.plan_h_leg_drop(bigint,text,text,text)', 'cb48e1aeba2d8e78191b9fc47eae6d67'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])', 'e370e52c9dd96d7e4e152b3ce348736e'),
      ('public.plan_order_update(jsonb,text,text)', '114a6555848062a18b7f7fe8e57d70d6'),
      ('public.plan_rt_update(jsonb,text,text)', 'b7acd8a07c9e45ea7c51f29e8c3a190b')) f(sig, m)
    WHERE to_regprocedure(f.sig) IS NULL OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(f.sig)) <> f.m) AS functions_changed,
  (SELECT count(*) FROM pg_class c WHERE c.oid IN ('public.dl_v_rt_route'::regclass, 'public.ct_v_rt_pallet_gate'::regclass)
     AND c.reloptions IS DISTINCT FROM ARRAY['security_invoker=true']) AS invoker_lost,
  (SELECT count(*) FROM unnest(ARRAY['anon', 'authenticated', 'tms_reader']) r(role)
    WHERE to_regclass('public.ct_v_v5_revenue') IS NOT NULL AND has_table_privilege(r.role, 'public.ct_v_v5_revenue', 'SELECT')) AS open_money,
  (SELECT count(*) FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r(role)
    WHERE to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NOT NULL
      AND has_function_privilege(r.role, 'public.plan_h_pallet_sync(bigint[],text,text)', 'EXECUTE')) AS open_helper,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pl_mov_stop_once'
           AND indexdef LIKE '%UNIQUE%(order_stop_id, event_type)%'
           AND indexdef LIKE '%LOADING%DELIVERY%') AS stop_once,   -- D-9 narrow: LOADING / DELIVERY only
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
  (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
    + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices)
    + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL) AS v5_rows,
  (SELECT count(*) FROM public.ct_v_rt_pnl) AS pnl_rows,
  (SELECT count(*) FROM public.dl_v_rt_route) AS route_rows;
