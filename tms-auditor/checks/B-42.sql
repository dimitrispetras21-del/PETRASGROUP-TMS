-- id: B-42
-- title: Εθνική παραγγελία χωρίς groupage/φορτίο > 15′
-- flows: F-12
-- severity: P3
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: national_orders
-- impact: Η εθνική παραγγελία δεν εμφανίζεται στο Weekly Εθνικών (ούτε γραμμή groupage ούτε φορτίο).
-- next: 
-- exceptions: national_orders άδειο = ΣΩΣΤΟ (το VS γράφει κατευθείαν στο national_loads, 23/8)· Cancelled.
-- tolerance: 15′
-- source: 04 ΝΕΟΣ Β-42 · στήλες national_loads.source_national_order_id, groupage_lines.national_order_id (κατάλογος 22/9)
-- enabled: yes
SELECT count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM national_loads l WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM groupage_lines g WHERE g.national_order_id=n.id AND g.deleted_at IS NULL);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT n.legacy_id AS x FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM national_loads l WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM groupage_lines g WHERE g.national_order_id=n.id AND g.deleted_at IS NULL) LIMIT 50) s;
