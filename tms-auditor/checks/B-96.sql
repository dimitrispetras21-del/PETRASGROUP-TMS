-- id: B-96
-- title: Νέα γραμμή του παλιού μοντέλου εθνικών μετά την ημέρα L
-- flows: F-12,F-14,F-23
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: national_loads
-- impact: Από την ημέρα L κάθε εθνική δουλειά γεννιέται μόνο στο v5: μια νέα γραμμή NL / groupage / CL / τοπική, ή εθνική παραγγελία χωρίς αποστολή v5, δεν φαίνεται στο νέο board και δεν τιμολογείται σωστά.
-- next: Owner: ποια οθόνη την έγραψε (παλιά καρτέλα στην cache του service worker;). Το πάγωμα της 074 κόβει τα INSERT στους τέσσερις πίνακες· αυτός ο έλεγχος αποδεικνύει ότι δεν πέρασε τίποτα.
-- exceptions: Μετρά από plan_config.opened_at (η στιγμή της 074). Οι relay_* και nat_loading δεν είναι παλιό μοντέλο. Πριν από το L: 0 (plan_config άδειος).
-- tolerance:
-- source: DRAFT 074b (plan F5 Task C, F3-11 σειρά 1) · PGlite 28/10: 0 on the production copy, red in the scenario of plan-074.test.mjs
-- enabled: yes
SELECT (SELECT count(*) FROM national_loads x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c))
 + (SELECT count(*) FROM groupage_lines x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c))
 + (SELECT count(*) FROM consolidated_loads x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c))
 + (SELECT count(*) FROM local_moves x WHERE x.move_kind = 'local' AND x.created_at >= (SELECT c.opened_at FROM plan_config c))
 + (SELECT count(*) FROM national_orders x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c) AND x.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.nat_order_id = x.id AND s.deleted_at IS NULL));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (
 SELECT 'NL:' || x.id AS x FROM national_loads x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c)
 UNION ALL SELECT 'GL:' || x.id FROM groupage_lines x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c)
 UNION ALL SELECT 'CL:' || x.id FROM consolidated_loads x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c)
 UNION ALL SELECT 'LM:' || x.id FROM local_moves x WHERE x.move_kind = 'local' AND x.created_at >= (SELECT c.opened_at FROM plan_config c)
 UNION ALL SELECT 'NO:' || x.id FROM national_orders x WHERE x.created_at >= (SELECT c.opened_at FROM plan_config c) AND x.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.nat_order_id = x.id AND s.deleted_at IS NULL)
 ORDER BY 1 LIMIT 50) s;
