-- id: B-62
-- title: Εθνική πολυστάσια με στάση παράδοσης 0/κενές παλέτες
-- flows: F-12
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: national_orders
-- impact: Στάση παράδοσης με 0 παλέτες: λάθος φορτίο στο Εβδομαδιαίο Εθνικών και λάθος κίνηση στο Ισοζύγιο παλετών (το σφάλμα μηδενισμού του Κύματος 0).
-- next: Άνοιγμα της εθνικής → παλέτες ανά σημείο παράδοσης (ανάγνωση).
-- exceptions: Μετρά στάσεις της παραγγελίας (national_order_id) ΚΑΙ του φορτίου της (national_load_id). Μονοστάσιες εκτός.
-- tolerance: 15′ (οι στάσεις γράφονται σε δεύτερο αίτημα)
-- source: έκθεση εθνικών 5/10 §4 έλεγχος 4 (Κύμα 0 P1-α, f1419375) · DRAFT 058 · 4/10 = 0 (7 μονοστάσιες με 0 εκτός)
-- enabled: yes
SELECT count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
 AND (SELECT count(*) FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading') >= 2
 AND (EXISTS (SELECT 1 FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)
   OR EXISTS (SELECT 1 FROM order_stops s JOIN national_loads l ON l.id=s.national_load_id WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT n.legacy_id AS x FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.status,'')<>'Cancelled' AND n.created_at < now()-interval '15 minutes'
 AND (SELECT count(*) FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading') >= 2
 AND (EXISTS (SELECT 1 FROM order_stops s WHERE s.national_order_id=n.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)
   OR EXISTS (SELECT 1 FROM order_stops s JOIN national_loads l ON l.id=s.national_load_id WHERE l.source_national_order_id=n.id AND l.deleted_at IS NULL AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND coalesce(s.pallets,0)<=0)) LIMIT 50) s;
