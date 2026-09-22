-- id: B-01
-- title: Ανάθεση χωρίς ζωντανό γύρο (RT)
-- flows: F-14,F-13
-- severity: P1
-- schedule: fast
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Ο οδηγός δεν πληρώνεται για το δρομολόγιο και το κόστος δεν προσγειώνεται σε κανένα γύρο.
-- next: Άνοιγμα της παραγγελίας στο Weekly: υπάρχει γύρος RT στην καρτέλα; (ανάγνωση)
-- exceptions: Ίδιοι όροι με τον trigger 033 (γρ. 99-118): Cancelled/διαγραμμένες, σκέλος ΣΥΝΕΡΓΑΤΗ split, γονείς split. Τα σκέλη ιδιόκτητου στόλου ΜΕΤΡΟΥΝ (22/9: το SQL του 02b τα απέκλειε όλα — εύρημα της διάγνωσης Claude στη δοκιμαστική αλυσίδα).
-- tolerance: 15′ (το front γράφει σε δύο PATCH)
-- source: 02b Β-01 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status IN ('Assigned','In Transit','Delivered') AND NOT (coalesce(o.is_partner_trip,false) AND o.parent_order_id IS NOT NULL)
 AND (o.truck_id IS NOT NULL OR (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL))
 AND NOT EXISTS (SELECT 1 FROM orders c WHERE c.parent_order_id=o.id AND c.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled')
 AND coalesce(o.assigned_at,o.created_at) < now()-interval '15 minutes';
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status IN ('Assigned','In Transit','Delivered') AND NOT (coalesce(o.is_partner_trip,false) AND o.parent_order_id IS NOT NULL)
 AND (o.truck_id IS NOT NULL OR (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL))
 AND NOT EXISTS (SELECT 1 FROM orders c WHERE c.parent_order_id=o.id AND c.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled')
 AND coalesce(o.assigned_at,o.created_at) < now()-interval '15 minutes' LIMIT 50) s;
