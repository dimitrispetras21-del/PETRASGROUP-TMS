-- id: B-44
-- title: Ταίριασμα εισαγωγής χωρίς σκέλος γύρου
-- flows: F-16,F-17
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Η εισαγωγή δεν μπαίνει στο κόστος/μισθοδοσία του γύρου της εξαγωγής.
-- next: 
-- exceptions: 
-- tolerance: 15′ από assigned_at/created_at (το orders ΔΕΝ έχει updated_at — κατάλογος 22/9)
-- source: 04 ΝΕΟΣ Β-44
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status<>'Cancelled' AND coalesce(o.matched_import_id,'')<>''
 AND coalesce(o.assigned_at,o.created_at) < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status<>'Cancelled' AND coalesce(o.matched_import_id,'')<>''
 AND coalesce(o.assigned_at,o.created_at) < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled') LIMIT 50) s;
