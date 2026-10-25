-- 072b VERIFY - read-only (SELECT only, writes nothing). Run after 072b_plan_vehicle_segments.sql and any time later.
-- ONE row. ASCII only. It errors before 072b (rt_vehicle_segments does not exist yet) - that is expected.
-- EXPECTED right after 072b (before day L):
--   applied = '072b in place' ; exclude_on_segments = 2 ; exclude_on_cycles = 0 ; hooks_in_place = 10 ;
--   changed_live = 0 ; public_acts = 3 ; open_to_api = 0 ; open_relations = 0 ; rls_off = 0 ;
--   auditor_policy = 1 ; other_policies = 0 ; new_triggers = 4 ; b54_matches = true ; segments = 0 ; v5_cycles = 0 ;
--   seg_problems = 0 ; overlaps = 0 ; cancel_copy_drift = 0
-- hooks_in_place counts the 10 hooked functions at their FINAL text (plan_rt_update carries 7 hooks, chained; the
-- three of owner question 7 = b: plan_h_drop_consequences one, plan_delete two, plan_move_pieces two - the second
-- for a side moved within its own cycle, review R5; plan_rt_update's 7th and plan_delete's 2nd put the notices of a
-- removed handover in the act's answer, fix round 1 26/10).
-- After L: segments and v5_cycles grow (every v5 cycle has >= 1 segment); seg_problems, overlaps and
-- cancel_copy_drift stay 0 for ever (the base refuses them at COMMIT - these are independent counts that read the
-- cycle's status, not the copy rt_cancelled the EXCLUDE filters on). auditor_policy = the
-- one policy of 072b (monitor_read: SELECT, tms_check_runner + tms_reader only); the PGlite test runs B-91..B-93
-- as tms_check_runner on a cycle with segments to prove the auditor sees them.
-- 072's verify after 072b, by design (plan "Interfaces"): plan_functions = 79, service_role_execute = 19,
--   changed_live = 0 (072b changes none of 072's 22), every other value as before. 071b's verify finds the two
--   EXCLUDE wherever they live: after 072b truck_once = true, exclude_on = 'rt_vehicle_segments', and its cycle
--   overlap counts are NULL (they live here: overlaps).
SELECT
  CASE WHEN to_regclass('public.rt_vehicle_segments') IS NOT NULL
        AND to_regprocedure('public.plan_seg_change(jsonb,text,text)') IS NOT NULL
       THEN '072b in place' ELSE '072b NOT in place' END AS applied,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
     AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') AND contype = 'x' AND condeferrable AND condeferred) AS exclude_on_segments,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND contype = 'x') AS exclude_on_cycles,
  (SELECT count(*) FROM (VALUES
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', '99d86d5c59c88264b4825b5410c09a59'),
      ('public.plan_h_finish()', '59d88ec85661d3ef2ac957aecd0e0fcd'),
      ('public.plan_rt_update(jsonb,text,text)', 'e918ef7cb61693c941a4e755e7e5f94f'),
      ('public.plan_rt_clear(jsonb,text,text)', '07452fbac4ac9fe8c4dddd0d35b256f3'),
      ('public.plan_board(date,text)', '2e030bfc158de8a26d5814f618d1f5ac'),
      ('public.plan_vs_state(bigint[])', '99175b659207c5019f1599ed389f1895'),
      ('public.plan_local_loading(jsonb,text,text)', 'f40c4a548ec192af781ef8e62d3227a5'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])', 'ce5de5793080e0c5be1e886defcb0b0e'),
      ('public.plan_move_pieces(jsonb,text,text)', '97984f7500dead965ddcba0d2c3360ab'),
      ('public.plan_delete(jsonb,text,text)', 'abda0d8b5d0bf32766e4ecb46367420c')) v(sig, m)
    WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) = v.m) AS hooks_in_place,
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
      ('public.rt_sync_to_national_loads()', '028efb76373a0a6517134feaea88bc2f'),
      ('public.plan_h_raise(text,text)', '8c2b50932d181f8c674530cdddf8c328'),
      ('public.plan_h_ctx(text,text)', '3977cf1c3284b0d776384b045de95c36'),
      ('public.plan_h_keys(jsonb,text[],text)', 'd47dafd77a067aa6356efc6962a50e0e'),
      ('public.plan_h_replay(jsonb,text,text)', '28b01f380ea20eea9e38959767310fc2'),
      ('public.plan_h_remember(jsonb,text,jsonb,text,text)', 'cd4164c46d887b29e4410c6875381c5a'),
      ('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
      ('public.plan_h_confirm(text,text,jsonb,jsonb,text)', 'ba70b5d8c98d261f39874e78641f3c2c'),
      ('public.plan_h_token(text,text,jsonb)', '5ebb4630c920cf626c346dcc5aa2a34a'),
      ('public.plan_h_strip_amounts(jsonb,text)', 'cc19be0190b5b82d50ee8521cc7bee43'),
      ('public.plan_h_notice(text,text,text,text[],bigint,bigint,bigint,text,text)', '879f3396df6c4c730edb27550ff08c6b'),
      ('public.plan_h_ok(text,jsonb,jsonb,jsonb)', 'cc4b43dc712e5389398840bf7b687cf5'),
      ('public.plan_h_v1_warn(bigint,date,date,bigint)', 'a99553e279628b5795990c08bcb01db6'),
      ('public.plan_h_rt_cancel_if_empty(bigint,text,text,text)', '2f3cdfe09caa8c548e5a30e0f06c84fa'),
      ('public.plan_h_rt_consequences(bigint)', 'cddea3a5fb20a563283a16db3b50f133'),
      ('public.plan_rt_create(jsonb,text,text)', '37c04d5803944fdeaf9d0534a0b83506')
    ) v(sig, m)
    WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_live,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('plan_seg_change', 'plan_seg_fix', 'plan_seg_remove') AND p.prosecdef
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')) AS public_acts,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR (has_function_privilege('service_role', p.oid, 'EXECUTE')
           AND (p.proname LIKE 'plan\_h\_seg\_%' OR p.proname IN ('plan_h_vs_carriers', 'plan_seg_problem', 'plan_chk_seg',
                                                                'plan_seg_follow', 'plan_seg_copy'))))) AS open_to_api,
  (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('rt_vehicle_segments', 'v_rt_segments', 'v_rt_vehicle_windows')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) AS open_relations,
  (SELECT count(*) FROM pg_class WHERE oid = 'public.rt_vehicle_segments'::regclass AND NOT relrowsecurity) AS rls_off,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rt_vehicle_segments' AND policyname = 'monitor_read'
     AND cmd = 'SELECT' AND roles::text[] @> ARRAY['tms_check_runner', 'tms_reader'] AND cardinality(roles) = 2) AS auditor_policy,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rt_vehicle_segments' AND policyname <> 'monitor_read') AS other_policies,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'
     AND tgname IN ('plan_seg_follow', 'plan_seg_copy', 'plan_seg_verify', 'plan_seg_verify_rt')) AS new_triggers,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
  (SELECT count(*) FROM public.rt_vehicle_segments) AS segments,
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles,
  -- every v5 cycle against the COMMIT rules (run by the owner as postgres; the function is closed to the API)
  (SELECT count(*) FROM public.ct_round_trips r WHERE r.model = 2 AND public.plan_seg_problem(r.id) IS NOT NULL) AS seg_problems,
  -- an independent count of what the two EXCLUDE forbid (truck or driver in two live segments at once). It reads
  -- the cycle's STATUS, never the copy rt_cancelled the EXCLUDE filters on (review R2, DB finding 3): a copy that
  -- drifted to true would blind the EXCLUDE and this count together (principle 3: the net reads the source).
  (SELECT count(*) FROM public.rt_vehicle_segments a JOIN public.rt_vehicle_segments b ON a.id < b.id
     AND (a.truck_id = b.truck_id OR a.driver_id = b.driver_id)
     AND tstzrange(a.from_at, greatest(a.from_at, a.to_at), '[)') && tstzrange(b.from_at, greatest(b.from_at, b.to_at), '[)')
     JOIN public.ct_round_trips ra ON ra.id = a.rt_id JOIN public.ct_round_trips rb ON rb.id = b.rt_id
   WHERE a.trip_type = 'OWNED' AND b.trip_type = 'OWNED' AND a.deleted_at IS NULL AND b.deleted_at IS NULL
     AND ra.status <> 'cancelled' AND rb.status <> 'cancelled') AS overlaps,
  -- the copy against its source (the COMMIT rule seg_cancel catches it only through the trigger)
  (SELECT count(*) FROM public.rt_vehicle_segments g JOIN public.ct_round_trips r ON r.id = g.rt_id
    WHERE g.deleted_at IS NULL AND g.rt_cancelled IS DISTINCT FROM (r.status = 'cancelled')) AS cancel_copy_drift;
