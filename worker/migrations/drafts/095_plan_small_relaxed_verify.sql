-- 095 VERIFY - read only (SELECT), after 095_plan_small_relaxed.sql. One row.
-- EXPECTED: applied = '095 in place', changed_texts 0, seg_change_pair = CHECK (((reason IS NULL) OR (place_note IS NOT
--   NULL))), other_note_gone true, b93_enabled false, seg_cycles_refused 0.
--   The counts below are what the relaxed rules now let through - 0 right after the run (SELECT 2/11: 0 local loadings,
--   32 segments, all first segments), then whatever the dispatchers do:
--   local_other_day: live local loadings on another day than their stop (each answered local_loading_other_day);
--   handover_no_reason: live handovers (a segment with a point) without a reason (the screen shows "-");
--   other_no_note: live handovers with reason "other" and no note.
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_seg_change(jsonb,text,text)'::regprocedure)
                 = '8f69e9c540c95551930688d9b3141862' THEN '095 in place' ELSE '095 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_local_loading_problem(bigint)', '0f915c05ff0d83458f6fb1ad79e3c4a1'),
          ('public.plan_local_loading(jsonb,text,text)', '725c915709b53d283e2991b07ae57d39'),
          ('public.plan_rt_update(jsonb,text,text)', 'c2cedb4ed68bcab2dd85ffbe5bc13d9c'),
          ('public.plan_seg_problem(bigint)', '5287a43951d2656fb5270059b906b1a8'),
          ('public.plan_seg_change(jsonb,text,text)', '8f69e9c540c95551930688d9b3141862'),
          ('public.plan_seg_fix(jsonb,text,text)', 'be2d212cac2351c4f363d780237af2af')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
         AND conname = 'seg_change_pair') AS seg_change_pair,
       NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
         AND conname = 'seg_other_note') AS other_note_gone,
       (SELECT enabled FROM monitoring.checks WHERE id = 'B-93') AS b93_enabled,
       (SELECT count(DISTINCT g.rt_id) FROM public.rt_vehicle_segments g
         WHERE g.deleted_at IS NULL AND public.plan_seg_problem(g.rt_id) IS NOT NULL) AS seg_cycles_refused,
       (SELECT count(*) FROM public.local_moves lm JOIN public.rt_stops s ON s.id = lm.rt_stop_id
         WHERE lm.move_kind = 'nat_loading' AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled' AND s.deleted_at IS NULL
           AND lm.move_date <> (s.planned_from AT TIME ZONE 'Europe/Athens')::date) AS local_other_day,
       (SELECT count(*) FROM public.rt_vehicle_segments g
         WHERE g.deleted_at IS NULL AND g.place_note IS NOT NULL AND g.reason IS NULL) AS handover_no_reason,
       (SELECT count(*) FROM public.rt_vehicle_segments g
         WHERE g.deleted_at IS NULL AND g.reason = 'other' AND NOT coalesce(g.reason_note ~ '[^[:space:]]', false)) AS other_no_note;
