-- 086 VERIFY - read only (SELECT), after 086_plan_busy_overlap_ok.sql. One row.
-- EXPECTED: applied = '086 in place', changed_texts 0, exclude_partial 2 (the rule at COMMIT is there, it skips only a
-- segment marked overlap_ok), marked 0 right after the run (it grows only by accepted saves, each with its audit row).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure)
                 = '6f0c0daebd0963472291dd3546df93a9' THEN '086 in place' ELSE '086 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', 'ddc1f26f185e7a8e2a7524471a169180'),
          ('public.plan_h_target(jsonb,jsonb,text,text)', 'a56f5d9fe6a321aeef3db7b030ccdb6e'),
          ('public.plan_rt_update(jsonb,text,text)', 'd8de8c443ddc601469c53a90c4e5c1fc'),
          ('public.plan_rt_problem(bigint)', '1b256db4b2a6ff7d0d8ed0e948a1894c'),
          ('public.plan_h_reseq(bigint,text,text)', '6f0c0daebd0963472291dd3546df93a9')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
          AND ((conname = 'rt_v2_truck_once' AND md5(pg_get_constraintdef(oid)) = '140cd0ded05accd213a0e619be63e953')
            OR (conname = 'rt_v2_driver_once' AND md5(pg_get_constraintdef(oid)) = 'efd66085a4dcf26fa68f51c176b36f06'))
          AND contype = 'x' AND condeferrable AND condeferred) AS exclude_partial,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.rt_vehicle_segments'::regclass AND tgname = 'plan_seg_overlap_ok'
          AND tgenabled <> 'D') AS mark_trigger,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'overlap_ok'
          AND NOT attisdropped) AS has_column;
