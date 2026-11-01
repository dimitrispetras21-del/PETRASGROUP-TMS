-- 090 VERIFY - reads only. One row. After 090: applied = '090 APPLIED', not_code = 0, unclean = 0, trigger, check and
-- merge = true, merge_open = false, b54_ok = true. After the rollback: applied = '090 NOT APPLIED'. ASCII only.
-- The objects of 090 may be absent, so its tables are read through query_to_xml, which runs only when they exist,
-- never at parse time.
SELECT
  CASE WHEN to_regprocedure('public.entity_merge(text,bigint,bigint,text)') IS NOT NULL AND to_regclass('public.loc_090_before') IS NOT NULL
       THEN '090 APPLIED' ELSE '090 NOT APPLIED' END AS applied,
  (SELECT count(*) FROM public.locations WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$') AS not_code,
  (SELECT count(*) FROM public.locations
    WHERE name ~ '[\u00a0\u2007\u202f\u200b\t\n\r]|  |^ | $' OR city ~ '[\u00a0\u2007\u202f\u200b\t\n\r]|  |^ | $') AS unclean,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'locations_clean' AND tgrelid = 'public.locations'::regclass AND tgenabled <> 'D') AS trigger,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_country_iso' AND conrelid = 'public.locations'::regclass) AS "check",
  to_regprocedure('public.entity_merge(text,bigint,bigint,text)') IS NOT NULL AS merge,
  coalesce(has_function_privilege('anon', to_regprocedure('public.entity_merge(text,bigint,bigint,text)'), 'EXECUTE')
        OR has_function_privilege('authenticated', to_regprocedure('public.entity_merge(text,bigint,bigint,text)'), 'EXECUTE')
        OR has_function_privilege('service_role', to_regprocedure('public.entity_merge(text,bigint,bigint,text)'), 'EXECUTE'), false) AS merge_open,
  CASE WHEN to_regclass('public.loc_090_before') IS NULL THEN NULL ELSE
    (xpath('//n/text()', query_to_xml('SELECT count(*) AS n FROM public.loc_090_before', false, false, '')))[1]::text::bigint END AS kept_rows,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'locations'
                        AND column_name = 'merged_into_id') THEN NULL ELSE
    (xpath('//n/text()', query_to_xml('SELECT (SELECT count(*) FROM public.locations WHERE merged_into_id IS NOT NULL)
      + (SELECT count(*) FROM public.clients WHERE merged_into_id IS NOT NULL) AS n', false, false, '')))[1]::text::bigint END AS merged_rows,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_ok;
