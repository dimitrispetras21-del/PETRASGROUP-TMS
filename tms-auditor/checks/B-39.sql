-- id: B-39
-- title: Παραγγελία < 24 ωρών χωρίς καμία στάση
-- flows: F-05
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Η παραγγελία γράφτηκε αλλά οι στάσεις απέτυχαν — δεν φαίνεται σωστά στον προγραμματισμό.
-- next: 
-- exceptions: 
-- tolerance: 15′
-- source: 04 ΝΕΟΣ Β-39
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status<>'Cancelled'
 AND o.created_at BETWEEN now()-interval '24 hours' AND now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status<>'Cancelled'
 AND o.created_at BETWEEN now()-interval '24 hours' AND now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL) LIMIT 50) s;
