-- 084 VERIFY - read only (SELECT), after 084_plan_move_busy_skip.sql. One row.
-- EXPECTED: applied = '084 in place', changed_texts 0, exclude_deferred 2 (the rule at COMMIT is untouched).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_move_pieces(jsonb,text,text)'::regprocedure)
                 = '70e21dad2a56d7db294e45ac592ed380' THEN '084 in place' ELSE '084 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_move_pieces(jsonb,text,text)', '70e21dad2a56d7db294e45ac592ed380'),
          ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', '285ca0f03cae41e3ddbc22bf41ccfb8b')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
          AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') AND contype = 'x' AND condeferrable AND condeferred) AS exclude_deferred;
