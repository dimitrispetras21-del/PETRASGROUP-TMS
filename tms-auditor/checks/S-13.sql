-- id: S-13
-- title: Απόθεμα: παραγγελία προς την αποθήκη ανοιχτής παρτίδας χωρίς παρτίδα
-- flows: F-05,F-30
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: orders
-- impact: Παραγγελία του ίδιου πελάτη παραδίδει στην αποθήκη μιας ανοιχτής παρτίδας χωρίς να είναι παρτίδα: οι παλέτες δεν φαίνονται στο ΑΠΟΘΕΜΑ, κανένα κομμάτι δεν βγαίνει από αυτές, και η παραγγελία μοιάζει έτοιμη για τιμολόγηση από την παραλαβή, ενώ ο πελάτης δεν έχει παραλάβει.
-- next: Φόρμα της παραγγελίας (ανάγνωση): είναι απόθεμα πελάτη; Τότε «Παρτίδα αποθέματος». Αλλιώς ο προορισμός μπήκε λάθος.
-- exceptions: Μόνο παραγγελίες του ίδιου πελάτη προς τον προορισμό μιας ζωντανής, μη πλήρους, μη ακυρωμένης παρτίδας, γραμμένες μετά από αυτήν (οποιαδήποτε τοποθεσία, owner 4/10)· ακυρωμένες δεν μετρούν. Μια δεύτερη αποστολή του πελάτη στην ίδια αποθήκη γίνεται δεύτερη παρτίδα.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· impact map 4/10 G-14 · γύρος 2: OWNER-Q5 answered 4/10 (any location can be a warehouse) · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND NOT EXISTS (SELECT 1 FROM stock_lots s WHERE s.order_id = o.id AND s.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.intake_status IS DISTINCT FROM 'Cancelled' AND l.client_id = o.client_id AND l.warehouse_location_id = o.unloading_location_1_id AND o.created_at > a.created_at)
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND NOT EXISTS (SELECT 1 FROM stock_lots s WHERE s.order_id = o.id AND s.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.intake_status IS DISTINCT FROM 'Cancelled' AND l.client_id = o.client_id AND l.warehouse_location_id = o.unloading_location_1_id AND o.created_at > a.created_at) ORDER BY o.legacy_id LIMIT 50) s
