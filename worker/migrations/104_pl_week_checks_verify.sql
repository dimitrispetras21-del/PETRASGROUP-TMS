-- 104 VERIFY - read-only, ONE row. Run after 104_pl_week_checks.sql (and any time after). ASCII.
-- EXPECTED after 104: applied = '104 in place', acts 3, helpers 3, policies 1, open_to_api 0, live_index true,
--   b54_equals_triggers true, marks <how many marks exist>, live_marks <how many weeks are checked now>.
-- Before 104: applied = 'before 104' and zeros.
SELECT CASE WHEN to_regclass('public.pl_week_checks') IS NOT NULL AND to_regprocedure('public.pl_week_check(jsonb,text,text)') IS NOT NULL
            THEN '104 in place' ELSE 'before 104' END AS applied,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('pl_week_check', 'pl_week_uncheck', 'pl_week_check_changes') AND prosecdef) AS acts,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('plw_h_raise', 'plw_h_json', 'plw_h_no_delete')) AS helpers,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pl_week_checks' AND policyname = 'monitor_read') AS policies,
       (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'pl_week_checks'
          AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT')
            OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE'))) AS open_to_api,
       coalesce((SELECT i.indisunique FROM pg_index i WHERE i.indexrelid = to_regclass('public.pl_week_checks_live')), false) AS live_index,
       (SELECT red_value::int FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_equals_triggers,
       CASE WHEN to_regclass('public.pl_week_checks') IS NULL THEN 0
            ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.pl_week_checks', false, true, '')))[1]::text::int END AS marks,
       CASE WHEN to_regclass('public.pl_week_checks') IS NULL THEN 0
            ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.pl_week_checks WHERE undone_at IS NULL', false, true, '')))[1]::text::int END AS live_marks;
