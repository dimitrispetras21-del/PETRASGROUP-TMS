-- 069 REPAIR VERIFY - read-only (SELECT only). Run right after 069_hub_day_once_repair.sql.
-- One row per repaired order. ASCII only.
-- EXPECTED: 7 rows (318, 341, 388, 409, 418, 460, 467), each with
--   cd_now = new_cd ; load_hub = new_cd ; hub_stop = new_cd ; cd_stop = new_cd ; moved_since = 0
-- "No visible change on the Weekly National and the Ramp": load_hub and hub_stop are the days those
-- boards already showed, and moved_since counts any stop / national load / Ramp move recorded by the
-- triggers on that order's rows since the repair (expected 0 the same evening).
SELECT a.record_id::bigint AS order_id,
       (a.before_data->>'cross_dock_date')::date AS old_cd,
       (a.after_data->>'cross_dock_date')::date AS new_cd,
       o.cross_dock_date AS cd_now,
       CASE WHEN o.direction = 'Export' THEN (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date
            ELSE (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date END AS load_hub,
       (SELECT min(s.datetime) FROM order_stops s JOIN locations l ON l.id = s.location_id
         WHERE s.national_load_id = nl.id AND s.deleted_at IS NULL AND l.legacy_id = 'recJucKOhC1zh4IP3'
           AND s.stop_type = CASE WHEN o.direction = 'Export' THEN 'Unloading' ELSE 'Loading' END) AS hub_stop,
       (SELECT min(s.datetime) FROM order_stops s WHERE s.order_id = o.id AND s.stop_type = 'Cross-dock' AND s.deleted_at IS NULL) AS cd_stop,
       (SELECT count(*) FROM audit_log x
         WHERE x.created_at >= a.created_at
           AND x.actor IN ('trigger:order_cd_stop_follow', 'trigger:ramp_follows_stop', 'trigger:order_dates_follow')
           AND (x.record_id = o.id::text OR x.record_id = nl.id::text
                OR x.record_id IN (SELECT s.id::text FROM order_stops s WHERE s.order_id = o.id OR s.national_load_id = nl.id)
                OR x.record_id IN (SELECT r.id::text FROM ramp r JOIN order_stops s ON r.notes = 'STOP:' || s.legacy_id
                                    WHERE s.order_id = o.id OR s.national_load_id = nl.id))) AS moved_since
FROM audit_log a
JOIN orders o ON o.id = a.record_id::bigint
LEFT JOIN national_loads nl ON nl.source_order_id = o.id AND nl.deleted_at IS NULL AND nl.source_type = 'Direct'
WHERE a.actor = 'migration:069_hub_day_once_repair'
ORDER BY 1;
