-- 087 VERIFY - read only (SELECT), after 087_plan_board_reads_hub_mark.sql. One row.
-- EXPECTED: applied = '087 in place', changed_texts 0, helper_closed true, worker_execute true.
--   marks_now: pieces at Veroia sent to the panel (for_split_at set): compare with the panel's "GIA MOIRASMA" before
--   and after (087 writes none; it changes only who can set and clear the mark).
--   vs_both_lists: VS imports at Veroia that the screen BEFORE 087's front end showed on both lists (no mark, no truck,
--   not stock); after the front end they show only as PROS ANATHESI until sent to the panel.
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure)
                 = '7c266059ad7e3b967626cf9d3bdc3800' THEN '087 in place' ELSE '087 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_board(date,text)', '7c266059ad7e3b967626cf9d3bdc3800'),
          ('public.plan_move_pieces(jsonb,text,text)', 'ec3b8073dc7d8e3666d89082433553b4')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (to_regprocedure('public.plan_h_last_change(bigint)') IS NOT NULL
        AND NOT has_function_privilege('service_role', 'public.plan_h_last_change(bigint)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.plan_h_last_change(bigint)', 'EXECUTE')) AS helper_closed,
       (has_function_privilege('service_role', 'public.plan_board(date,text)', 'EXECUTE')
        AND has_function_privilege('service_role', 'public.plan_move_pieces(jsonb,text,text)', 'EXECUTE')) AS worker_execute,
       (SELECT count(*) FROM public.shipment_pieces WHERE for_split_at IS NOT NULL AND deleted_at IS NULL) AS marks_now,
       (SELECT count(*) FROM public.v_hub_bucket hb JOIN public.shipment_pieces sp ON sp.id = hb.piece_id
         WHERE hb.kind = 'vs_import' AND hb.is_stock IS NOT TRUE AND hb.inbound_rt_id IS NULL AND sp.for_split_at IS NULL) AS vs_both_lists;
