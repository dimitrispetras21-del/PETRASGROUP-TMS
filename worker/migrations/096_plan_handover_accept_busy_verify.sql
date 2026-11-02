-- 096 VERIFY - read only (SELECT), after 096_plan_handover_accept_busy.sql. One row.
-- EXPECTED: applied = '096 in place', changed_texts 0, busy_untouched true.
--   accepted_handover_overlaps: live later segments (a vehicle change) that name an accepted overlap (overlap_rts) -
--   0 right after the run, then one per vehicle change saved over a busy truck / driver (each with its audit row).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_seg_change(jsonb,text,text)'::regprocedure)
                 = '8b10443cb30cf09fe75e69893cbef0bc' THEN '096 in place' ELSE '096 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_seg_change(jsonb,text,text)', '8b10443cb30cf09fe75e69893cbef0bc'),
          ('public.plan_seg_fix(jsonb,text,text)', 'fa4f5ba1c2379ddf68491208a4b52fd8')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT md5(prosrc) = 'ffbfbf45a9b3cc353862b943a1761388' FROM pg_proc
         WHERE oid = 'public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)'::regprocedure) AS busy_untouched,
       (SELECT count(*) FROM public.rt_vehicle_segments g
         WHERE g.deleted_at IS NULL AND g.place_note IS NOT NULL AND g.overlap_rts <> '{}') AS accepted_handover_overlaps;
