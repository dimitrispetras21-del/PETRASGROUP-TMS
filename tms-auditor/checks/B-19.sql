-- id: B-19
-- title: Παραδομένη με στάση εκφόρτωσης χωρίς σφραγίδα
-- flows: F-26,F-09
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: 
-- next: 
-- exceptions: Παραδόσεις πριν 6/9 (backfill 029).
-- tolerance: 
-- source: 02b Β-19 · 22/9 = 2
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status='Delivered' AND coalesce(o.actual_delivery_date,o.delivery_datetime) >= date '2026-09-06'
 AND EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND s.completed_at IS NULL);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status='Delivered' AND coalesce(o.actual_delivery_date,o.delivery_datetime) >= date '2026-09-06'
 AND EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND s.completed_at IS NULL) LIMIT 50) s;
