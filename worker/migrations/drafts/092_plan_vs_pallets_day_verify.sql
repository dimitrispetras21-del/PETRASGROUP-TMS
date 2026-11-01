-- 092 VERIFY - read only (SELECT), after 092_plan_vs_pallets_day.sql. One row.
-- EXPECTED: applied = '092 in place', changed_texts 0, recut_untouched true.
--   pallets_notices: notices vs_pallets_set to the international desk (0 right after the run, then one per pallets
--   change made from the Weekly National).
--   stop_vs_order_off: live VS bridge stops whose order column (loading_pallets_N / unloading_pallets_N) differs from
--   the stop (0 on 1/11 over 193 VS stops of 60 days; 092 writes both, it must stay 0).
--   leaves_vs_stop_off: live VS bridges whose national pieces do not sum to their stop (071 refuses it at COMMIT: 0).
--   day_off: VS whose international Veroia day differs from the first Veroia day of their trucks (the board's mark).
--   0 on 1/11: 630 (Mon 2/11) and 644 (Wed 4/11) agree with their trucks, only the dispatcher's Excel differs (Sun 1/11,
--   Tue 3/11); the dispatcher sets them from the screen after the release - 092 repairs no row.
--   stop_vs_order_off 0 and leaves_vs_stop_off 0 on 1/11 (SELECT before 092).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_vs_set_day(jsonb,text,text)'::regprocedure)
                 = '4c25fb6028b6edb37a5a4c864ceef6c3' THEN '092 in place' ELSE '092 NOT APPLIED' END AS applied,
       (SELECT count(*) FROM (VALUES
          ('public.plan_vs_set_day(jsonb,text,text)', '4c25fb6028b6edb37a5a4c864ceef6c3'),
          ('public.plan_vs_state(bigint[])', '4decce12c3ca9b3ebd30a7a6b3447d5d')) v(sig, m)
         WHERE (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v.sig)) IS DISTINCT FROM v.m) AS changed_texts,
       (SELECT md5(prosrc) = '53a6022f8f851641de134cdcf1462d55' FROM pg_proc
         WHERE oid = 'public.plan_h_bridge_recut(bigint,text,text,text)'::regprocedure) AS recut_untouched,
       (SELECT count(*) FROM public.plan_notices WHERE kind = 'vs_pallets_set') AS pallets_notices,
       (SELECT count(*) FROM public.shipments s JOIN public.order_stops st ON st.id = s.order_stop_id
          JOIN public.orders o ON o.id = st.order_id
         WHERE s.deleted_at IS NULL AND st.deleted_at IS NULL AND st.stop_type IN ('Loading', 'Unloading')
           AND st.stop_number BETWEEN 1 AND 10
           AND (to_jsonb(o) ->> (lower(st.stop_type) || '_pallets_' || st.stop_number::int))::numeric
               IS DISTINCT FROM st.pallets) AS stop_vs_order_off,
       (SELECT count(*) FROM (SELECT s.id FROM public.shipments s JOIN public.order_stops st ON st.id = s.order_stop_id
          LEFT JOIN public.v_piece_state ps ON ps.shipment_id = s.id
         WHERE s.deleted_at IS NULL AND st.deleted_at IS NULL
         GROUP BY s.id, st.pallets HAVING coalesce(sum(ps.pallets), 0) <> coalesce(st.pallets, 0)) q) AS leaves_vs_stop_off,
       (SELECT count(*) FROM public.v_vs_state v JOIN public.orders o ON o.id = v.order_id
         WHERE v.first_hub_day IS NOT NULL AND o.cross_dock_date IS DISTINCT FROM v.first_hub_day) AS day_off;
