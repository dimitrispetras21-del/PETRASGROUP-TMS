-- 072 VERIFY - read-only (SELECT only, writes nothing). Run after 072_plan_functions.sql and any time later.
-- ONE row. ASCII only. Works before 072 too (then applied = '072 NOT in place').
-- EXPECTED right after 072 (before any /plan/* write, i.e. until day L):
--   applied = '072 in place' ; public_functions = 16 ; service_role_execute = 16 ; open_to_api = 0 ;
--   not_definer = 0 ; bad_shape = 0 ; f1_open = 0 ; b54_matches = true ; changed_live = 0 ; v5_rows = 0 ;
--   v5_cycles = 0 ; plan_functions = 6 (071) + the 072 ones (the dry run and 072's NOTICE print the same number)
-- After L: v5_rows and v5_cycles grow; every other value stays as above for ever.
SELECT
  CASE WHEN (SELECT count(*) FROM unnest(ARRAY[
              'public.plan_orders_create(jsonb,text,text)', 'public.plan_order_update(jsonb,text,text)',
              'public.plan_put_pieces(jsonb,text,text)', 'public.plan_put_group(jsonb,text,text)',
              'public.plan_move_pieces(jsonb,text,text)', 'public.plan_split_piece(jsonb,text,text)',
              'public.plan_rt_update(jsonb,text,text)', 'public.plan_rt_clear(jsonb,text,text)',
              'public.plan_delete(jsonb,text,text)', 'public.plan_vs_set_day(jsonb,text,text)',
              'public.plan_vs_set_place(jsonb,text,text)', 'public.plan_local_loading(jsonb,text,text)',
              'public.plan_notice_read(jsonb,text,text)', 'public.plan_board(date,text)',
              'public.plan_vs_state(bigint[])', 'public.plan_notices_list(text,text)']) s
             WHERE to_regprocedure(s) IS NOT NULL) = 16
       THEN '072 in place' ELSE '072 NOT in place' END AS applied,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%') AS plan_functions,
  (SELECT count(*) FROM unnest(ARRAY[
     'public.plan_orders_create(jsonb,text,text)', 'public.plan_order_update(jsonb,text,text)',
     'public.plan_put_pieces(jsonb,text,text)', 'public.plan_put_group(jsonb,text,text)',
     'public.plan_move_pieces(jsonb,text,text)', 'public.plan_split_piece(jsonb,text,text)',
     'public.plan_rt_update(jsonb,text,text)', 'public.plan_rt_clear(jsonb,text,text)',
     'public.plan_delete(jsonb,text,text)', 'public.plan_vs_set_day(jsonb,text,text)',
     'public.plan_vs_set_place(jsonb,text,text)', 'public.plan_local_loading(jsonb,text,text)',
     'public.plan_notice_read(jsonb,text,text)', 'public.plan_board(date,text)',
     'public.plan_vs_state(bigint[])', 'public.plan_notices_list(text,text)']) s
    WHERE to_regprocedure(s) IS NOT NULL) AS public_functions,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_role_execute,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) AS open_to_api,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
     AND has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT p.prosecdef) AS not_definer,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
     AND (pg_get_userbyid(p.proowner) <> 'postgres' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public'])) AS bad_shape,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('plan_chk', 'plan_rt_window_sync', 'plan_rt_problem', 'plan_shipment_problem', 'plan_leg_problem',
                       'plan_local_loading_problem')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')) AS f1_open,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
  (SELECT count(*) FROM (VALUES
      ('public.dl_sync_from_rt()', '331cea3a8987b74a9b0add698df9b158'),
      ('public.dl_local_day_sync(bigint,date)', '151dab06e2676f3c8885d7298d0ac6af'),
      ('public.dl_sync_from_local_move()', 'f053c478c79ef55dcc62b65a61939b9b'),
      ('public.local_moves_before()', '3b9f0a27c9921c63ce9fb41f09ef0462'),
      ('public.dl_local_line_guard()', 'e7f0348ccc5764d29608b8701f0e83b6'),
      ('public.dl_cash_sync_entry()', '6d702bad6485f06535c6a0d5aff0bd0c'),
      ('public.order_cd_stop_follow()', '433a1a7205fceb264e77f5a0c71a1521'),
      ('public.ramp_follows_stop()', '6fa6a83c4191af271dbae85935d710c5'),
      ('public.invoice_mark_guard()', 'dd975c4f04f95f528c7c79a80eb4d387'),
      ('public.stock_guard_natl()', 'e941edbca9ff1bbeba0c89d49eb71cb3'),
      ('public.stock_guard_orders()', '63aa751d93cc8b34afa5587912de7045'),
      ('public.national_orders_soft_delete_cascade()', '6c423b14397c659272b1c9256189933d'),
      ('public.rt_status_guard()', 'd7757f99c3443ac167d5bdaf3e34b142'),
      ('public.plan_chk()', '8f2fa7e5541aded2dffc853a57c54c22'),
      ('public.plan_rt_window_sync()', '050cbabe34493018f4335f748029761e'),
      ('public.plan_rt_problem(bigint)', 'f383f449d55e657cfa929bb51a9120f6'),
      ('public.plan_shipment_problem(bigint)', '8dd2beb159142bf5a6a4e32688688875'),
      ('public.plan_leg_problem(bigint)', '24803f176f12355faa84c07e43cb0df0'),
      ('public.plan_local_loading_problem(bigint)', '4c3dbec3810121a2a585fe8b49ceadf1'),
      ('public.ct_rt_legs_v2_guard()', '6240d699bc114ffd49c7d62780432c94'),
      ('public.rt_sync_to_orders()', 'a63234c844c2b6236b1e6dfe1410b8fc'),
      ('public.rt_sync_to_national_loads()', '028efb76373a0a6517134feaea88bc2f')) v(sig, m)
    WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_live,
  (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
    + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices) AS v5_rows,
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles;
