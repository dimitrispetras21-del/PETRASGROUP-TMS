-- id: B-91
-- title: Κύκλος v5 που τα τμήματα οχήματος δεν τον καλύπτουν ακριβώς (κενό, επικάλυψη, άκρα, χωρίς τμήμα, αντίγραφο ΑΡΧΙΚΟΥ, αντίγραφο ακύρωσης)
-- flows: F-23,F-14
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: ct_round_trips
-- impact: Για κάποιες ώρες του κύκλου δεν ξέρουμε ποιο όχημα τον εκτελεί, ή το ξέρουμε δύο φορές, ή ο κύκλος δείχνει άλλο όχημα από το ΑΡΧΙΚΟ, ή ένα τμήμα ζωντανού κύκλου μετρά ως ακυρωμένο (rt_cancelled ≠ status): ο έλεγχος «ένα φορτηγό τη φορά» (το EXCLUDE φιλτράρει με το αντίγραφο), η μισθοδοσία ανά οδηγό και το DKV κατά ώρα δουλεύουν πάνω σε λάθος παράθυρα.
-- next: Owner: SELECT * FROM v_rt_segments WHERE code = '<RT>' ORDER BY n. Η βάση το αρνείται στο COMMIT (plan_seg_problem): ένα μη μηδενικό σημαίνει απενεργοποιημένο trigger ή εγγραφή εκτός plan_*. Διόρθωση μόνο με plan_seg_fix / plan_seg_remove, με «ναι» του owner.
-- exceptions: Κανένα. Κύκλος ακυρωμένος μετρά επίσης (τα τμήματά του κρατούν το ίδιο παράθυρο).
-- tolerance: 0
-- source: DRAFT 072b (plan vehicle handover, spec 6 «κενό ή επικάλυψη»; review R2 DB finding 3: the copy rt_cancelled against the status; review R4: only allow-listed functions, no lag() - a gap = a segment that is not the last and that no segment follows, an overlap = two live segments that meet) · PGlite 25/10: passes lintSql and monitoring.check_sql_guard, run by monitoring.run_checks as tms_check_runner: 0 on the production copy, red with plan_seg_verify disabled (a gap; the copy flipped)
-- enabled: yes
SELECT count(*) FROM ct_round_trips r WHERE r.model = 2 AND (
 NOT EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL)
 OR (SELECT min(g.from_at) FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL) <> r.start_at
 OR (SELECT max(g.to_at) FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL) <> r.end_at
 OR EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL AND (g.to_at <= g.from_at
     OR (g.to_at <> r.end_at AND NOT EXISTS (SELECT 1 FROM rt_vehicle_segments h WHERE h.rt_id = r.id AND h.deleted_at IS NULL
                                             AND h.from_at = g.to_at))
     OR EXISTS (SELECT 1 FROM rt_vehicle_segments h WHERE h.rt_id = r.id AND h.deleted_at IS NULL AND h.id <> g.id
                  AND h.from_at < g.to_at AND g.from_at < h.to_at)))
 OR EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL AND g.from_at = r.start_at
             AND (g.trip_type, g.truck_id, g.trailer_id, g.driver_id, g.partner_id, g.partner_rate)
                 IS DISTINCT FROM (r.trip_type, r.truck_id, r.trailer_id, r.driver_id, r.partner_id, r.partner_rate))
 OR EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL
             AND g.rt_cancelled IS DISTINCT FROM (r.status = 'cancelled')));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT r.code AS x FROM ct_round_trips r WHERE r.model = 2 AND (
 NOT EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL)
 OR (SELECT min(g.from_at) FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL) <> r.start_at
 OR (SELECT max(g.to_at) FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL) <> r.end_at
 OR EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL AND (g.to_at <= g.from_at
     OR (g.to_at <> r.end_at AND NOT EXISTS (SELECT 1 FROM rt_vehicle_segments h WHERE h.rt_id = r.id AND h.deleted_at IS NULL
                                             AND h.from_at = g.to_at))
     OR EXISTS (SELECT 1 FROM rt_vehicle_segments h WHERE h.rt_id = r.id AND h.deleted_at IS NULL AND h.id <> g.id
                  AND h.from_at < g.to_at AND g.from_at < h.to_at)))
 OR EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL AND g.from_at = r.start_at
             AND (g.trip_type, g.truck_id, g.trailer_id, g.driver_id, g.partner_id, g.partner_rate)
                 IS DISTINCT FROM (r.trip_type, r.truck_id, r.trailer_id, r.driver_id, r.partner_id, r.partner_rate))
 OR EXISTS (SELECT 1 FROM rt_vehicle_segments g WHERE g.rt_id = r.id AND g.deleted_at IS NULL
             AND g.rt_cancelled IS DISTINCT FROM (r.status = 'cancelled')))
 ORDER BY r.code LIMIT 50) s
