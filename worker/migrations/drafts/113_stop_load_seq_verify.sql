-- 113 VERIFY - read-only, one row. Expected right after 113: result = '113 in place', stops_with_position = 0,
-- triggers_on_stops = the number the 113 NOTICE printed. Later, stops_with_position counts what the form has written
-- (the five checks to the table: a groupage saved from the form must show its points here).
-- anon_reads_order_stops says whether the anon role can read the table, so the new column with it (a new column
-- follows the table's grant; reported, not changed by 113).
SELECT CASE
         WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'load_seq')
           THEN '113 NOT in place (column absent)'
         WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'load_seq') <> 'integer'
           OR (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_stops' AND column_name = 'load_seq') <> 'YES'
           THEN '113 NOT in place (column has the wrong shape)'
         WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname = 'order_stops_load_seq_pos'
                          AND contype = 'c' AND convalidated
                          AND replace(pg_get_constraintdef(oid), ' ', '') LIKE '%load_seqISNULL%load_seq>0%order_idISNOTNULL%')
           THEN '113 NOT in place (CHECK order_stops_load_seq_pos missing)'
         ELSE '113 in place' END AS result,
       -- read through to_jsonb so the same file answers after a rollback too (the column named directly would fail the
       -- whole SELECT where it does not exist)
       (SELECT count(*) FROM public.order_stops s WHERE to_jsonb(s) ->> 'load_seq' IS NOT NULL) AS stops_with_position,
       (SELECT count(*) FROM public.order_stops) AS stops_total,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.order_stops'::regclass AND NOT tgisinternal) AS triggers_on_stops,
       has_table_privilege('anon', 'public.order_stops', 'SELECT') AS anon_reads_order_stops;
