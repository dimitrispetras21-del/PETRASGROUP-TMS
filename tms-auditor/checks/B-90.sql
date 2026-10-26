-- id: B-90
-- title: Εθνική v5 χωρίς τιμή
-- flows: F-23,F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: national_orders
-- impact: Η plan_* αρνείται «Χωρίς τιμή» στη δημιουργία· μια τιμή που σβήστηκε αργότερα (PATCH του λογιστηρίου) δίνει έσοδο 0 στους κύκλους της.
-- next: Λογιστήριο: τιμή στην εθνική (ή 1 € για τις άδειες παλέτες, spec 3).
-- exceptions: [M-6 α, owner 24/10] Εθνικές με ζωντανή αποστολή v5 και τιμή κενή ή <= 0.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.price, 0) <= 0
 AND EXISTS (SELECT 1 FROM shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT n.legacy_id AS x FROM national_orders n WHERE n.deleted_at IS NULL AND coalesce(n.price, 0) <= 0
 AND EXISTS (SELECT 1 FROM shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL) ORDER BY n.legacy_id LIMIT 50) s
