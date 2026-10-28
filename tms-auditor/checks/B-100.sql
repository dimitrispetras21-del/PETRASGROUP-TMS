-- id: B-100
-- title: Εθνική v5 με άγνωστες παλέτες
-- flows: F-23,F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: national_orders
-- impact: Χωρίς παλέτες ο κύκλος δεν ξέρει τη χωρητικότητά του (το board γράφει «n+;/33»), το έσοδο μιας παραγγελίας με πολλές αποστολές δεν μοιράζεται (σημαία v5_revenue_missing στο P&L), και η ανταλλαγή παλετών (PE) δεν γράφεται στο καθολικό ως να γίνουν γνωστές.
-- next: Dispatcher εθνικών: παλέτες στην παραγγελία (Εβδομαδιαίο Εθνικών → Καρτέλα παραγγελίας → Επεξεργασία).
-- exceptions: [F1/F4 owner 28/10, 080] Ζωντανές εθνικές αποστολές v5 (όχι γέφυρες VS: εκείνες παίρνουν τις παλέτες της διεθνούς στάσης) με παλέτες NULL, ανά παραγγελία. Ουρά, όπως το B-90 για την τιμή: δεν είναι σφάλμα, είναι δουλειά που μένει.
-- tolerance: 
-- source: DRAFT 080 (F1/F4, owner 28/10) · PGlite 28/10: 0 on the production copy, red in the scenario of plan-080.test.mjs
-- enabled: yes
SELECT count(DISTINCT n.id) FROM national_orders n JOIN shipments s ON s.nat_order_id = n.id
 WHERE n.deleted_at IS NULL AND s.deleted_at IS NULL AND s.order_stop_id IS NULL AND s.pallets IS NULL;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT n.legacy_id AS x FROM national_orders n JOIN shipments s ON s.nat_order_id = n.id
 WHERE n.deleted_at IS NULL AND s.deleted_at IS NULL AND s.order_stop_id IS NULL AND s.pallets IS NULL ORDER BY 1 LIMIT 50) s
