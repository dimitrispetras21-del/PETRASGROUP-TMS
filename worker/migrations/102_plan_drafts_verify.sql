-- 102 VERIFY - read-only, ONE row. Run after 102_plan_drafts.sql (and any time after). ASCII.
-- EXPECTED after 102: applied = '102 in place', tables 2, acts 8, helpers 9, policies 2, open_to_api 0,
--   b54_equals_triggers true, live_drafts <how many are open now>, blocking_pieces <how many marks block now>.
-- Before 102: applied = 'before 102' and zeros.
SELECT CASE WHEN to_regclass('public.plan_drafts') IS NOT NULL AND to_regprocedure('public.plan_draft_realize(jsonb,text,text)') IS NOT NULL
            THEN '102 in place' ELSE 'before 102' END AS applied,
       (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('plan_drafts', 'plan_draft_pieces')) AS tables,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('plan_drafts_read', 'plan_draft_history',
          'plan_draft_create', 'plan_draft_update', 'plan_draft_pieces', 'plan_draft_move', 'plan_draft_delete', 'plan_draft_realize')) AS acts,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
          AND (proname LIKE 'plan\_h\_draft\_%' OR proname = 'plan_draft_no_delete')) AS helpers,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('plan_drafts', 'plan_draft_pieces')
          AND policyname = 'monitor_read') AS policies,
       (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
          AND c.relname IN ('plan_drafts', 'plan_draft_pieces', 'v_plan_draft_piece_state')
          AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT')
            OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE'))) AS open_to_api,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_equals_triggers,
       CASE WHEN to_regclass('public.plan_drafts') IS NULL THEN 0
            ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.plan_drafts WHERE deleted_at IS NULL AND realized_at IS NULL', false, true, '')))[1]::text::int END AS live_drafts,
       CASE WHEN to_regclass('public.v_plan_draft_piece_state') IS NULL THEN 0
            ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.v_plan_draft_piece_state WHERE blocking', false, true, '')))[1]::text::int END AS blocking_pieces;
