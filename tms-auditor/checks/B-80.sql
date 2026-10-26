-- id: B-80
-- title: Εθνική v5: τα μερίδια της τιμής δεν αθροίζουν στην τιμή
-- flows: F-23,F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: national_orders
-- impact: Το έσοδο των κύκλων συν όσα δεν ανατέθηκαν ακόμη δεν ισούται με την τιμή της παραγγελίας: χάνεται ή διπλασιάζεται έσοδο στο P&L.
-- next: Owner: ct_v_v5_revenue της παραγγελίας. Συνήθως σπασμένο κομμάτι που ξέμεινε ή αλλαγή κανόνα στρογγύλευσης.
-- exceptions: [M-5 δ, owner 24/10] Ανά παραγγελία (ανατεθειμένα + μη ανατεθειμένα = τιμή, ανοχή 0,01). Με M-3 β τα μερίδια βγαίνουν από την ίδια την τιμή με τρέχον άθροισμα, άρα δεν μπορεί να κοκκινίσει: απενεργοποιημένος ως το L. Στη Φ5 μπαίνει ο έλεγχος «εθνική ≥ L με τιμή και χωρίς μερίδια» (LEFT JOIN).
-- tolerance: 0,01 ανά παραγγελία
-- source: DRAFT 073b (plan F3, spec 8, M-5 δ) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy and in the scenario of plan-073b.test.mjs; disabled (owner 24/10)
-- enabled: no: ταυτολογία ως το L (owner 24/10, M-5 δ): με M-3 β τα μερίδια αθροίζουν στην τιμή εκ κατασκευής· στη Φ5 τον αντικαθιστά ο έλεγχος «εθνική ≥ L με τιμή και χωρίς μερίδια»
SELECT count(*) FROM national_orders n
 JOIN (SELECT v.nat_order_id, sum(v.amount) AS s FROM ct_v_v5_revenue v WHERE v.kind = 'price' GROUP BY v.nat_order_id) z ON z.nat_order_id = n.id
 WHERE n.deleted_at IS NULL AND abs(z.s - coalesce(n.price, 0)) > 0.01;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT n.legacy_id AS x FROM national_orders n
 JOIN (SELECT v.nat_order_id, sum(v.amount) AS s FROM ct_v_v5_revenue v WHERE v.kind = 'price' GROUP BY v.nat_order_id) z ON z.nat_order_id = n.id
 WHERE n.deleted_at IS NULL AND abs(z.s - coalesce(n.price, 0)) > 0.01 ORDER BY n.legacy_id LIMIT 50) s
