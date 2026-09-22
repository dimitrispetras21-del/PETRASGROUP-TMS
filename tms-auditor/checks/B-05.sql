-- id: B-05
-- title: Γύρος με δύο διαφορετικούς οδηγούς
-- flows: F-14
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: ct_round_trips
-- impact: Η μισθοδοσία πάει σε λάθος οδηγό (ένα φορτηγό, ένας οδηγός — 5/9).
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-05 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM (SELECT l.rt_id FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE o.deleted_at IS NULL AND r.status<>'cancelled' AND o.driver_id IS NOT NULL GROUP BY l.rt_id HAVING count(DISTINCT o.driver_id)>1) x;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT l.rt_id::text AS x FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE o.deleted_at IS NULL AND r.status<>'cancelled' AND o.driver_id IS NOT NULL GROUP BY l.rt_id HAVING count(DISTINCT o.driver_id)>1 LIMIT 50) s;
