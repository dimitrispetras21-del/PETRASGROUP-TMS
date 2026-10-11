-- 069 VERIFY - read-only (SELECT only, writes nothing). Run after 069_hub_day_once.sql, again after
-- 069_hub_day_once_repair.sql, and any time later (the coordinator runs it in the days after the push,
-- plan docs/weekly-natl-redesign/PLAN.md section 3.6).
-- ONE row. ASCII only.
-- EXPECTED after 069 + repair:
--   applied = '069 in place' ; b54_matches = true
--   cd_ne_load = 0 ; hub_stop_ne_cd = 0 ; cd_stop_ne_cd = 0 ; hub_stop_ne_load = 0 ; ramp_two_same_day = 0 ; pe_diff = 0
-- Before the repair: cd_ne_load = 7, hub_stop_ne_cd = 7, cd_stop_ne_cd = 7 (the 7 "double moved"
-- cross-docks: orders 318, 341, 388, 409, 418, 460, 467), the rest 0.
-- Any other non-zero: copy the row to the coordinator. ramp_left_behind is INFORMATION: Ramp lines already
-- on a day their stop no longer has before 069 (26 on 11/10, all past and Planned) - 069 moves lines only
-- from now on; that history is a separate decision.
-- Scope: live (not deleted) VS orders with a live Direct national load - every status (the Veroia day of
-- an executed load is history, and history must agree too).
WITH vs AS (
  SELECT o.id AS oid, o.direction, o.cross_dock_date AS cd, nl.id AS nlid,
         CASE WHEN o.direction = 'Export' THEN (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date
              ELSE (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date END AS load_hub,
         (SELECT min(s.datetime) FROM order_stops s JOIN locations l ON l.id = s.location_id
           WHERE s.national_load_id = nl.id AND s.deleted_at IS NULL AND l.legacy_id = 'recJucKOhC1zh4IP3'
             AND s.stop_type = CASE WHEN o.direction = 'Export' THEN 'Unloading' ELSE 'Loading' END) AS hub_stop,
         (SELECT min(s.datetime) FROM order_stops s WHERE s.order_id = o.id AND s.stop_type = 'Cross-dock' AND s.deleted_at IS NULL) AS cd_stop,
         coalesce(nl.pallet_exchange, false) <> coalesce(o.pallet_exchange, false) AS pe_differs
  FROM orders o JOIN national_loads nl ON nl.source_order_id = o.id AND nl.deleted_at IS NULL AND nl.source_type = 'Direct'
  WHERE o.deleted_at IS NULL AND o.veroia_switch
), ramp_stop AS (
  SELECT r.id, r.plan_date, r.status, s.datetime AS stop_day, s.legacy_id
  FROM ramp r JOIN order_stops s ON r.notes = 'STOP:' || s.legacy_id
  WHERE r.deleted_at IS NULL AND s.deleted_at IS NULL
)
SELECT
  CASE WHEN to_regprocedure('public.order_cd_stop_follow()') IS NOT NULL AND to_regprocedure('public.ramp_follows_stop()') IS NOT NULL
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) = '4b5d279f21f981a11d35a5deb655269a'
        AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname IN ('order_cd_stop_follow', 'ramp_follows_stop')) = 2
       THEN '069 in place' ELSE '069 NOT in place' END AS applied,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
  (SELECT count(*) FROM vs) AS vs_loads,
  (SELECT count(*) FROM vs WHERE cd IS DISTINCT FROM load_hub) AS cd_ne_load,
  (SELECT count(*) FROM vs WHERE hub_stop IS DISTINCT FROM cd) AS hub_stop_ne_cd,
  (SELECT count(*) FROM vs WHERE cd_stop IS DISTINCT FROM cd) AS cd_stop_ne_cd,
  (SELECT count(*) FROM vs WHERE hub_stop IS DISTINCT FROM load_hub) AS hub_stop_ne_load,
  (SELECT string_agg(oid::text, ',' ORDER BY oid) FROM vs WHERE cd IS DISTINCT FROM load_hub OR hub_stop IS DISTINCT FROM cd
      OR cd_stop IS DISTINCT FROM cd) AS orders_off,
  (SELECT count(*) FROM (SELECT legacy_id, plan_date FROM ramp_stop WHERE status = 'Planned' GROUP BY legacy_id, plan_date HAVING count(*) > 1) x) AS ramp_two_same_day,
  (SELECT count(*) FROM ramp_stop WHERE status = 'Planned' AND plan_date IS DISTINCT FROM stop_day) AS ramp_left_behind,
  (SELECT count(*) FROM vs WHERE pe_differs) AS pe_diff;
