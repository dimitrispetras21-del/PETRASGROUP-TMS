-- id: S-13
-- title: Απόθεμα: παραγγελία προς αποθήκη συνεργάτη χωρίς παρτίδα
-- flows: F-05,F-30
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: orders
-- impact: Παραγγελία πελάτη παραδίδει σε αποθήκη συνεργάτη χωρίς να είναι παρτίδα: οι παλέτες δεν φαίνονται στο ΑΠΟΘΕΜΑ, κανένα κομμάτι δεν βγαίνει από αυτές, και η παραγγελία μοιάζει έτοιμη για τιμολόγηση από την παραλαβή, ενώ ο πελάτης δεν έχει παραλάβει.
-- next: Φόρμα της παραγγελίας (ανάγνωση): είναι απόθεμα πελάτη; Τότε «Παρτίδα αποθέματος». Αλλιώς ο προορισμός μπήκε λάθος.
-- exceptions: Μόνο παραγγελίες μετά την πρώτη ζωντανή παρτίδα (μια διαγραμμένη παρτίδα-δοκιμή δεν ανοίγει το παράθυρο)· ακυρωμένες δεν μετρούν. Η τοποθεσία 92 έχει τύπο «Partner Warehouse» αλλά μοιάζει με σημείο πελάτη (plan §9, ερώτημα owner): αν χτυπά εκεί, διορθώνεται ο τύπος, όχι ο έλεγχος.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· impact map 4/10 G-14 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM orders o JOIN locations l ON l.id = o.unloading_location_1_id WHERE o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND l.type = 'Partner Warehouse' AND o.created_at > (SELECT min(s.created_at) FROM stock_lots s WHERE s.deleted_at IS NULL) AND NOT EXISTS (SELECT 1 FROM stock_lots s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o JOIN locations l ON l.id = o.unloading_location_1_id WHERE o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND l.type = 'Partner Warehouse' AND o.created_at > (SELECT min(s.created_at) FROM stock_lots s WHERE s.deleted_at IS NULL) AND NOT EXISTS (SELECT 1 FROM stock_lots s WHERE s.order_id = o.id AND s.deleted_at IS NULL) ORDER BY o.legacy_id LIMIT 50) s
