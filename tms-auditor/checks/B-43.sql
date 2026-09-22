-- id: B-43
-- title: Ενεργός γύρος με σκέλος χωρίς όχημα
-- flows: F-15
-- severity: P3
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: ct_round_trips
-- impact: 
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-43 (ασάφεια Α10)
-- enabled: yes
SELECT count(DISTINCT r.id) FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status NOT IN ('cancelled','closed','complete') AND o.deleted_at IS NULL AND o.status<>'Cancelled'
 AND o.truck_id IS NULL AND o.partner_id IS NULL;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT r.id::text AS x FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status NOT IN ('cancelled','closed','complete') AND o.deleted_at IS NULL AND o.status<>'Cancelled'
 AND o.truck_id IS NULL AND o.partner_id IS NULL LIMIT 50) s;
