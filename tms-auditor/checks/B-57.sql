-- id: B-57
-- title: Pre-order με φορτηγό, φόρτωση ως αύριο, χωρίς μετατροπή
-- flows: F-01,F-14
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: orders
-- impact: Το φορτηγό ξεκινά με παραγγελία χωρίς στάσεις, παλέτες ή τιμή· το RT της φαίνεται ελλιπές σε Έξοδα / TRIP PnL / Μισθοδοσία και η τιμολόγηση δεν έχει τι να δείξει.
-- next: Άνοιγμα της γραμμής PRE στο Weekly → δεξί κλικ → «Μετατροπή σε παραγγελία…» (συμπλήρωση στάσεων/παλετών/τιμής).
-- exceptions: Ακυρωμένες και διαγραμμένες εξαιρούνται. Χωρίς ημερομηνία φόρτωσης μετρά (δεν ξέρουμε πότε φεύγει).
-- tolerance: 
-- source: owner 28/9 («ναι, πρόσθεσε τον έλεγχο») — πίεση για συμπλήρωση pre-order· 28/9 = 1 (id 394)
-- enabled: yes
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.ops_status = 'Provisional' AND o.status <> 'Cancelled'
 AND o.truck_id IS NOT NULL AND (o.loading_datetime IS NULL OR o.loading_datetime <= current_date + 1)
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL
 AND o.ops_status = 'Provisional' AND o.status <> 'Cancelled' AND o.truck_id IS NOT NULL
 AND (o.loading_datetime IS NULL OR o.loading_datetime <= current_date + 1) ORDER BY o.legacy_id LIMIT 50) s
