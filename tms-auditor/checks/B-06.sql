-- id: B-06
-- title: Όχημα/οδηγός γύρου ≠ παραγγελίας
-- flows: F-14,F-15
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Οι triggers 013 παρακάμφθηκαν ή απενεργοποιήθηκαν· το RT λέει άλλο από την παραγγελία.
-- next: 
-- exceptions: 
-- tolerance: καμία (σύγχρονοι triggers)
-- source: 02b Β-06 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE o.deleted_at IS NULL AND r.status<>'cancelled' AND o.status<>'Cancelled'
 AND (o.truck_id IS DISTINCT FROM r.truck_id OR o.driver_id IS DISTINCT FROM r.driver_id);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE o.deleted_at IS NULL AND r.status<>'cancelled' AND o.status<>'Cancelled'
 AND (o.truck_id IS DISTINCT FROM r.truck_id OR o.driver_id IS DISTINCT FROM r.driver_id) LIMIT 50) s;
