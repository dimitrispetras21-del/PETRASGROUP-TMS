-- id: S-12
-- title: Απόθεμα: φόρτωση από αποθήκη συνεργάτη χωρίς παρτίδα
-- flows: F-05,F-30
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: orders
-- impact: Παλέτες φεύγουν από αποθήκη συνεργάτη με απλή παραγγελία, όχι ως κομμάτι παρτίδας: το απόθεμα δεν μειώνεται, ο επιμερισμός δεν τις βλέπει και η παρτίδα δεν κλείνει ποτέ σωστά — ή φορτώνουμε κάτι που δεν μπήκε ποτέ στο απόθεμα.
-- next: Weekly → η παραγγελία (ανάγνωση): είναι κομμάτι που γράφτηκε ως απλή παραγγελία; Τότε «+ Κομμάτι από απόθεμα» στο ίδιο φορτηγό και σβήσιμο της απλής.
-- exceptions: Μόνο παραγγελίες που γράφτηκαν μετά την πρώτη παρτίδα (πριν = 0· Ε4: το παρελθόν δεν συνδέεται). Ακυρωμένες δεν μετρούν.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· impact map 4/10 PR-17/G-15 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM orders o JOIN locations l ON l.id = o.loading_location_1_id WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND l.type = 'Partner Warehouse' AND o.created_at > (SELECT min(s.created_at) FROM stock_lots s)
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o JOIN locations l ON l.id = o.loading_location_1_id WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND l.type = 'Partner Warehouse' AND o.created_at > (SELECT min(s.created_at) FROM stock_lots s) ORDER BY o.legacy_id LIMIT 50) s
