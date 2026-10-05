-- id: S-12
-- title: Απόθεμα: φόρτωση από την αποθήκη ανοιχτής παρτίδας, όχι ως κομμάτι
-- flows: F-05,F-30
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: orders
-- impact: Παλέτες του ίδιου πελάτη φεύγουν από την αποθήκη μιας ανοιχτής παρτίδας με απλή παραγγελία, όχι ως κομμάτι: το απόθεμα δεν μειώνεται, ο επιμερισμός δεν τις βλέπει και η παρτίδα δεν κλείνει ποτέ σωστά — ή φορτώνουμε κάτι που δεν μπήκε ποτέ στο απόθεμα.
-- next: Weekly → η παραγγελία (ανάγνωση): είναι κομμάτι που γράφτηκε ως απλή παραγγελία; Τότε «+ Κομμάτι από απόθεμα» στο ίδιο φορτηγό και σβήσιμο της απλής.
-- exceptions: «Αποθήκη» = ο προορισμός μιας ζωντανής, μη πλήρους, μη ακυρωμένης παρτίδας (οποιαδήποτε τοποθεσία, owner 4/10). Μετρούν μόνο παραγγελίες του ίδιου πελάτη, γραμμένες μετά την παρτίδα (Ε4: το παρελθόν δεν συνδέεται· μια διαγραμμένη παρτίδα-δοκιμή δεν μετρά). Ακυρωμένες δεν μετρούν.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· impact map 4/10 PR-17/G-15 · γύρος 2: OWNER-Q5 answered 4/10 (any location can be a warehouse) · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.intake_status IS DISTINCT FROM 'Cancelled' AND l.client_id = o.client_id AND l.warehouse_location_id = o.loading_location_1_id AND o.created_at > a.created_at)
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.intake_status IS DISTINCT FROM 'Cancelled' AND l.client_id = o.client_id AND l.warehouse_location_id = o.loading_location_1_id AND o.created_at > a.created_at) ORDER BY o.legacy_id LIMIT 50) s
