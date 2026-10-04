-- id: B-60
-- title: Γραμμές groupage «Unassigned» σε ζωντανή παραγγελία groupage
-- flows: F-11,F-25
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: groupage_lines
-- impact: Γραμμή groupage χωρίς φορτηγό — ο προμηθευτής δεν παραλαμβάνεται και δεν φαίνεται σε καμία στήλη του Εβδομαδιαίου Εθνικών.
-- next: Εβδομαδιαίο Εθνικών / Παραγγελίες → Groupage: σε ποιο φορτηγό έπρεπε να μπει η γραμμή; (ανάγνωση)
-- exceptions: Γραμμές που επανήλθαν σε Unassigned με τον κανόνα never-delete (η παραγγελία δεν είναι πια groupage, ακυρώθηκε ή διαγράφηκε) ΔΕΝ μετρούν.
-- tolerance: 15′ (γραμμές και φορτηγό γράφονται σε χωριστά αιτήματα)
-- source: έκθεση εθνικών 5/10 §4 έλεγχος 2 (+ PU-1) · DRAFT 058 · 4/10 = 0
-- enabled: yes
SELECT count(*) FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
 WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
 AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
   OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false)));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT g.legacy_id AS x FROM groupage_lines g LEFT JOIN orders o ON o.id=g.order_id LEFT JOIN national_orders n ON n.id=g.national_order_id
 WHERE g.deleted_at IS NULL AND g.status='Unassigned' AND g.created_at < now()-interval '15 minutes'
 AND ((g.order_id IS NOT NULL AND o.deleted_at IS NULL AND coalesce(o.status,'')<>'Cancelled' AND coalesce(o.national_groupage,false))
   OR (g.national_order_id IS NOT NULL AND n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND coalesce(n.national_groupage,false))) LIMIT 50) s;
