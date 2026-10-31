-- 082 VERIFY - read only (SELECT), after 082_plan_bridge_keeps_cycles.sql. One row.
-- EXPECTED: applied = '082 in place', changed_texts 0, unplan_drops false.
--   kept_notices / day_moved_notices count what the desk was told (day_moved 4 on 28/10 before 082; kept 0 right
--   after the run, then one per save of an international that moved the dates of a VS whose pieces ride a cycle).
--   repeated_notices: saves that wrote the same kind twice for one VS. 1 on 28/10 = F40 itself (3 notices of one
--   save, 20:11 UTC); it must stay 1.
--   closed_dates_off: closed RTs whose dates differ from the rule of their legs (14 on 28/10, written by the front end;
--   NOT repaired by 082 - owner 28/10: the root first, the code next, the data last). It must not grow once the front
--   end of this PR is live.
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_bridge_unplan(bigint,bigint,text,text,text)'::regprocedure)
                 = '18edaee1e5a5e855a81e50b838b05d99' THEN '082 in place' ELSE '082 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_h_bridge_unplan(bigint,bigint,text,text,text)', '18edaee1e5a5e855a81e50b838b05d99'),
          ('public.rt_recompute(bigint)', 'b014c26613d448d6b34ea2065ccd467f')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT prosrc LIKE '%plan_h_bridge_drop(%' FROM pg_proc
         WHERE oid = 'public.plan_h_bridge_unplan(bigint,bigint,text,text,text)'::regprocedure) AS unplan_drops,
       (SELECT count(*) FROM public.plan_notices WHERE kind = 'vs_day_moved_kept') AS kept_notices,
       (SELECT count(*) FROM public.plan_notices WHERE kind = 'vs_day_moved') AS day_moved_notices,
       (SELECT count(*) FROM (SELECT 1 FROM public.plan_notices
          WHERE kind IN ('vs_day_moved_kept', 'vs_day_moved', 'vs_changed_after_execution')
          GROUP BY kind, order_id, created_at HAVING count(*) > 1) q) AS repeated_notices,
       (SELECT count(*) FROM (SELECT r.id FROM public.ct_round_trips r JOIN public.ct_rt_legs l ON l.rt_id = r.id
          LEFT JOIN public.orders o ON o.id = l.order_id LEFT JOIN public.national_loads nl ON nl.id = l.nat_load_id
          WHERE r.model = 1 AND r.status IN ('closed', 'complete') GROUP BY r.id, r.date_start, r.date_end
          HAVING min(coalesce(o.loading_datetime, nl.loading_datetime)::date) IS NOT NULL
             AND (r.date_start <> min(coalesce(o.loading_datetime, nl.loading_datetime)::date)
                  OR r.date_end IS DISTINCT FROM greatest(max(coalesce(o.actual_delivery_date, nl.actual_delivery_date,
                       o.delivery_datetime::date, nl.delivery_datetime::date)), min(coalesce(o.loading_datetime, nl.loading_datetime)::date)))) q)
         AS closed_dates_off;
