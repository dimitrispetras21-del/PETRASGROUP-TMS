-- id: B-27
-- title: Εθνικό φορτίο VS δεν ακολούθησε το status
-- flows: F-10,F-07,F-26
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: 
-- next: 
-- exceptions: 5 Import 9–11/9 πριν τον trigger 13/9 — ΡΗΤΑ ids 275/281/302/306/309 (02b). Το φίλτρο ημερομηνίας ΔΕΝ αρκούσε: η 309 έχει actual_delivery_date 13/9 (μέτρηση 22/9 19:55 UTC). Αφαιρούνται όταν ο owner αποφασίσει την εφάπαξ διόρθωση.
-- tolerance: 
-- source: 02b Β-27 · 22/9 = 0 με φίλτρο
-- enabled: yes
SELECT count(*) FROM orders o JOIN national_loads nl ON nl.source_order_id=o.id AND nl.deleted_at IS NULL AND nl.source_type='Direct'
 WHERE o.deleted_at IS NULL AND o.veroia_switch AND coalesce(o.actual_delivery_date,o.delivery_datetime) >= date '2026-09-13'
 AND o.id NOT IN (275, 281, 302, 306, 309)
 AND ((o.status='Cancelled' AND nl.status<>'Cancelled') OR (o.status='Delivered' AND nl.status NOT IN ('Delivered','Cancelled')));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o JOIN national_loads nl ON nl.source_order_id=o.id AND nl.deleted_at IS NULL AND nl.source_type='Direct'
 WHERE o.deleted_at IS NULL AND o.veroia_switch AND coalesce(o.actual_delivery_date,o.delivery_datetime) >= date '2026-09-13'
 AND o.id NOT IN (275, 281, 302, 306, 309)
 AND ((o.status='Cancelled' AND nl.status<>'Cancelled') OR (o.status='Delivered' AND nl.status NOT IN ('Delivered','Cancelled'))) LIMIT 50) s;
