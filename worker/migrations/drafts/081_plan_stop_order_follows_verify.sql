-- 081 VERIFY - read only (SELECT), after 081_plan_stop_order_follows.sql. One row.
-- EXPECTED: applied = '081 in place', changed_texts 0, rt_update_untouched true, order_update_via_rt_update true,
--   order_broken 0, legs_broken 0.
--   live_cycles: v5 cycles not cancelled (14 on 31/10).
--   same_time_groups: live cycles with 2+ stops of one side and one planned_from on a day not yet executed - the
--   only cycles 081's road walk can reorder at their next write (an upper bound: a group already in road order counts
--   too). 1 on 31/10 = RT-1315. It moves as cycles are written or their day passes; it is NOT a fault.
--   order_broken: live stop pairs that break 071 stop_order / side_order (must stay 0: 081 keeps the groups).
--   legs_broken: live legs whose pickup is not before their drop (071 leg_order; must stay 0).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_reseq(bigint,text,text)'::regprocedure)
                 = 'f246c362c3f3bb1746a1d536ad1338bb' THEN '081 in place' ELSE '081 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_h_reseq(bigint,text,text)', 'f246c362c3f3bb1746a1d536ad1338bb'),
          ('public.plan_order_update(jsonb,text,text)', '1500396fb85a204dc6a1bcbbbd75ad25')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT md5(prosrc) = 'be70612fb940356278c7c66705c8ee33' FROM pg_proc
         WHERE oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure) AS rt_update_untouched,
       (SELECT prosrc LIKE '%plan_rt_update(%' FROM pg_proc
         WHERE oid = 'public.plan_order_update(jsonb,text,text)'::regprocedure) AS order_update_via_rt_update,
       (SELECT count(*) FROM public.ct_round_trips WHERE model = 2 AND status <> 'cancelled') AS live_cycles,
       (SELECT count(DISTINCT s.rt_id) FROM public.rt_stops s JOIN public.ct_round_trips r ON r.id = s.rt_id
         WHERE r.model = 2 AND r.status <> 'cancelled' AND s.deleted_at IS NULL
           AND (s.planned_to AT TIME ZONE 'Europe/Athens')::date >= (now() AT TIME ZONE 'Europe/Athens')::date
           AND EXISTS (SELECT 1 FROM public.rt_stops o WHERE o.rt_id = s.rt_id AND o.id <> s.id AND o.deleted_at IS NULL
                        AND o.side = s.side AND o.planned_from = s.planned_from)) AS same_time_groups,
       (SELECT count(*) FROM public.rt_stops a JOIN public.rt_stops b ON b.rt_id = a.rt_id AND b.seq > a.seq
          JOIN public.ct_round_trips r ON r.id = a.rt_id
         WHERE r.model = 2 AND r.status <> 'cancelled' AND a.deleted_at IS NULL AND b.deleted_at IS NULL
           AND (b.planned_from < a.planned_from OR (a.side = 'ANODOS' AND b.side = 'KATHODOS'))) AS order_broken,
       (SELECT count(*) FROM public.piece_legs l JOIN public.rt_stops pk ON pk.id = l.pickup_stop_id
          JOIN public.rt_stops dr ON dr.id = l.drop_stop_id
         WHERE l.deleted_at IS NULL AND pk.seq >= dr.seq) AS legs_broken;
