-- id: B-45
-- title: Ρότα χωρίς σκέλος γύρου
-- flows: F-18
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: 
-- next: 
-- exceptions: Γνωστό ορφανό 162 / RT-1007 (ιστορικό) — baseline μέχρι απόφαση.
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-45
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status<>'Cancelled' AND coalesce(o.rotation_id,'')<>''
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status<>'Cancelled' AND coalesce(o.rotation_id,'')<>''
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled') LIMIT 50) s;
