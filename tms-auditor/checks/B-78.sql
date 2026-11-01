-- id: B-78
-- title: Παραγγελία με ζωντανό εθνικό φορτίο του παλιού μοντέλου (NL/GL) ΚΑΙ αποστολή v5
-- flows: F-23,F-14
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: orders
-- impact: Η ίδια παραγγελία κινείται και στα δύο μοντέλα: το X της VS ή η τιμή της εθνικής θα μετρούσε δύο φορές (Direct/«σπίτι» NL και μερίδια v5). Η 073 το κόβει στην όψη, αλλά η ίδια παραγγελία φαίνεται και στα δύο board.
-- next: Εβδομαδιαίο Εθνικών: ποιο από τα δύο ισχύει; Το NL/GL αποσυνδέεται (074) ή η αποστολή σβήνεται, με «ναι» του owner.
-- exceptions: spec 8 «ίδια παραγγελία με NL και με αποστολή»: VS με ζωντανή αποστολή γέφυρας (shipments.order_id) και ζωντανό Direct NL της ίδιας διεθνούς, και εθνική με ζωντανή αποστολή v5 (shipments.nat_order_id) και ζωντανό NL (source_national_order_id) ή γραμμή groupage. Πριν από το L δεν υπάρχει αποστολή: 0.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT (SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
 AND EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL))
 + (SELECT count(*) FROM national_orders n WHERE n.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL)
 AND (EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_national_order_id = n.id AND nl.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM groupage_lines gl WHERE gl.national_order_id = n.id AND gl.deleted_at IS NULL)));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
 AND EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)
 UNION ALL
 SELECT n.legacy_id FROM national_orders n WHERE n.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM shipments s WHERE s.nat_order_id = n.id AND s.deleted_at IS NULL)
 AND (EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_national_order_id = n.id AND nl.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM groupage_lines gl WHERE gl.national_order_id = n.id AND gl.deleted_at IS NULL))
 ORDER BY 1 LIMIT 50) s
