-- id: B-98
-- title: Εθνική μετά την ημέρα L με τιμή και χωρίς μερίδια v5
-- flows: F-23,F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: national_orders
-- impact: Η τιμή της εθνικής δεν μοιράζεται σε κανέναν κύκλο ούτε φαίνεται ως «μη ανατεθειμένη» (ct_v_v5_revenue): χάνεται έσοδο από το P&L.
-- next: Owner: η εθνική στο board· συνήθως γεννήθηκε χωρίς αποστολή (το δείχνει και ο B-96) ή άλλαξε ο κανόνας των μεριδίων.
-- exceptions: [M-5, owner 24/10] ο έλεγχος του L που αντικαθιστά τον απενεργοποιημένο B-80 (που μένει απενεργοποιημένος). Μόνο εθνικές μετά το plan_config.opened_at.
-- tolerance:
-- source: DRAFT 074b (plan F5 Task C, M-5) · PGlite 28/10: 0 on the production copy, red in the scenario of plan-074.test.mjs
-- enabled: yes
SELECT count(*) FROM national_orders n WHERE n.deleted_at IS NULL AND n.price > 0 AND n.created_at >= (SELECT c.opened_at FROM plan_config c) AND NOT EXISTS (SELECT 1 FROM ct_v_v5_revenue v WHERE v.kind = 'price' AND v.nat_order_id = n.id);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(n.legacy_id, n.id::text) AS x FROM national_orders n WHERE n.deleted_at IS NULL AND n.price > 0 AND n.created_at >= (SELECT c.opened_at FROM plan_config c) AND NOT EXISTS (SELECT 1 FROM ct_v_v5_revenue v WHERE v.kind = 'price' AND v.nat_order_id = n.id) ORDER BY 1 LIMIT 50) s;
