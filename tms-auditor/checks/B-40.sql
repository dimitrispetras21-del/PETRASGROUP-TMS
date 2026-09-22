-- id: B-40
-- title: Ακυρωμένη παραγγελία με ενεργό γύρο
-- flows: F-07
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Γύρος RT (και μισθοδοσία) για μεταφορά που ακυρώθηκε.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-40
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status='Cancelled'
 AND EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status NOT IN ('cancelled'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status='Cancelled'
 AND EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status NOT IN ('cancelled')) LIMIT 50) s;
