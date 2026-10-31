-- 086 VERIFY - read only (SELECT), after 086_plan_busy_overlap_ok.sql. One row.
-- EXPECTED: applied = '086 in place', changed_texts 0, exclude_partial 2 (the two EXCLUDE, partial on overlap_rts =
-- '{}'), pair_rule 1 (the deferred trigger beside them), mark_trigger 1, has_column 1. The named segments: the query at the end
-- (0 right after the run; it grows only by accepted saves, each with its audit_log row).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure)
                 = '6f0c0daebd0963472291dd3546df93a9' THEN '086 in place' ELSE '086 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', 'ffbfbf45a9b3cc353862b943a1761388'),
          ('public.plan_h_target(jsonb,jsonb,text,text)', 'a56f5d9fe6a321aeef3db7b030ccdb6e'),
          ('public.plan_move_pieces(jsonb,text,text)', '2a8c746b726a9b37f0247166da0ecae5'),
          ('public.plan_rt_update(jsonb,text,text)', 'd8de8c443ddc601469c53a90c4e5c1fc'),
          ('public.plan_rt_problem(bigint)', '1b256db4b2a6ff7d0d8ed0e948a1894c'),
          ('public.plan_h_reseq(bigint,text,text)', '6f0c0daebd0963472291dd3546df93a9')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
          AND ((conname = 'rt_v2_truck_once' AND md5(pg_get_constraintdef(oid)) = '4b6dc90d32d0acea6475d94fad282a50')
            OR (conname = 'rt_v2_driver_once' AND md5(pg_get_constraintdef(oid)) = 'e45254c4bf19b503f0d78e7377cf061f'))
          AND contype = 'x' AND condeferrable AND condeferred) AS exclude_partial,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.rt_vehicle_segments'::regclass AND tgname = 'plan_seg_overlap_verify'
          AND tgdeferrable AND tginitdeferred AND tgenabled <> 'D') AS pair_rule,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.rt_vehicle_segments'::regclass AND tgname = 'plan_seg_overlap_mark'
          AND tgenabled <> 'D') AS mark_trigger,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_rts'
          AND NOT attisdropped) AS has_column;
-- named segments (read only after the run; 0 right after it): SELECT count(*) FROM rt_vehicle_segments WHERE overlap_rts <> '{}';
