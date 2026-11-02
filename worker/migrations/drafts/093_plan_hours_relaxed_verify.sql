-- 093 VERIFY - read only (SELECT), after 093_plan_hours_relaxed.sql. One row.
-- EXPECTED: applied = '093 in place', changed_texts 0, new_functions 2 (plan_h_before, plan_h_side_warn, internal: no
--   role may call them), refused_trips 0 and refused_legs 0 (the live v5 rows the rules refuse: 0 before 093 on 2/11,
--   and 093 only takes refusals away).
--   side_time_traces: the audit_log rows of plan_h_reseq on a trip whose ANODOS runs before one of its KATHODOS, or no
--   longer does (0 right after the run - the old rules refused that order; then one per change of such a plan).
--   Reads no 093 function: it answers after the rollback too (applied = '093 NOT APPLIED').
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_rt_problem(bigint)'::regprocedure)
                 = '5b627b94204f1c17ba021364157b337b' THEN '093 in place' ELSE '093 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_rt_problem(bigint)', '5b627b94204f1c17ba021364157b337b'),
          ('public.plan_leg_problem(bigint)', 'fd416369383af06a3e19786708cd1257'),
          ('public.plan_h_reseq(bigint,text,text)', 'b02f0d47d0f35cf539131f5e8378bad3'),
          ('public.plan_rt_update(jsonb,text,text)', '70476c188bab027722ceab6c81c6702c'),
          ('public.plan_h_put(jsonb,jsonb,text,text,bigint[])', '3b86b9a173e94a7cd45bb4fb53d9b387'),
          ('public.plan_move_pieces(jsonb,text,text)', 'f5f74b0ccdb8c1b7efff0a4d7084aea4')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.plan_h_before(timestamptz,timestamptz,timestamptz,timestamptz)'),
                                                 to_regprocedure('public.plan_h_side_warn(bigint)'))
          AND NOT has_function_privilege('service_role', oid, 'EXECUTE')
          AND NOT has_function_privilege('anon', oid, 'EXECUTE')
          AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) AS new_functions,
       (SELECT count(*) FROM public.ct_round_trips r WHERE r.model = 2 AND public.plan_rt_problem(r.id) IS NOT NULL) AS refused_trips,
       (SELECT count(*) FROM public.piece_legs l JOIN public.ct_round_trips r ON r.id = l.rt_id
         WHERE r.model = 2 AND l.deleted_at IS NULL AND public.plan_leg_problem(l.id) IS NOT NULL) AS refused_legs,
       (SELECT count(*) FROM public.audit_log WHERE table_name = 'ct_round_trips' AND after_data ? 'side_time') AS side_time_traces;
