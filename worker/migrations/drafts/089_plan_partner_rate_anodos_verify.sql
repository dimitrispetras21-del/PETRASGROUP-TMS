-- 089 VERIFY - read only (SELECT), after 089_plan_partner_rate_anodos.sql. One row.
-- EXPECTED: applied = '089 in place', changed_texts 0, has_column 1, check_rule 1, split_trigger 1, b54_follows true.
-- The split segments: the query at the end (0 right after the run; it grows only by saves of the two-field form, each
-- with its audit_log row).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure)
                 = 'f232250e4672f3133b4a3fe06cb1da5c' THEN '089 in place' ELSE '089 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_rt_update(jsonb,text,text)', 'f232250e4672f3133b4a3fe06cb1da5c'),
          ('public.plan_h_seg_json(bigint)', 'b92f3666e087ddfd621959d47f95a4cb')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'partner_rate_anodos'
          AND NOT attisdropped) AS has_column,
       (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
          AND conname = 'seg_partner_rate_anodos' AND contype = 'c' AND convalidated) AS check_rule,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.rt_vehicle_segments'::regclass AND tgname = 'plan_seg_rate_split'
          AND tgenabled <> 'D') AS split_trigger,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_follows;
-- split segments (read only after the run; 0 right after it): SELECT count(*) FROM rt_vehicle_segments WHERE partner_rate_anodos IS NOT NULL;
