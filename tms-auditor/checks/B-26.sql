-- id: B-26
-- title: Veroia Switch χωρίς εθνικό φορτίο
-- flows: F-10
-- severity: P1
-- schedule: fast
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Το φορτίο cross-dock δεν εμφανίζεται στο Weekly Εθνικών — κανείς δεν το προγραμματίζει.
-- next: Άνοιγμα της παραγγελίας και ξανά «Αποθήκευση» είναι διόρθωση — ΟΧΙ από τον ελεγκτή· ο dispatcher αποφασίζει.
-- exceptions: Από την ημέρα L (074b, Ε17) μόνο οι VS που ΔΕΝ είναι στο v5: εκείνες δεν έχουν πια NL (η γέφυρα το αποσύνδεσε) και τις μετρά ο B-95. Ίδιος κανόνας τομής με τον B-95.
-- tolerance: 15′ (το NL γράφεται από τον browser σε δεύτερο αίτημα)
-- source: 02b Β-26 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status<>'Cancelled' AND o.created_at < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id=o.id AND nl.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM plan_config c WHERE coalesce(o.cross_dock_date >= c.cutover_day, false) OR EXISTS (SELECT 1 FROM shipments b0 WHERE b0.order_id = o.id AND b0.order_stop_id IS NOT NULL AND b0.deleted_reason IS DISTINCT FROM '074 rollback'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status<>'Cancelled' AND o.created_at < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id=o.id AND nl.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM plan_config c WHERE coalesce(o.cross_dock_date >= c.cutover_day, false) OR EXISTS (SELECT 1 FROM shipments b0 WHERE b0.order_id = o.id AND b0.order_stop_id IS NOT NULL AND b0.deleted_reason IS DISTINCT FROM '074 rollback')) LIMIT 50) s;
