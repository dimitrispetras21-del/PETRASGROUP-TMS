-- id: B-79
-- title: X ανά παραγγελία VS: το άθροισμα των μεριδίων δεν είναι το X της παραγγελίας
-- flows: F-23,F-36
-- severity: P1
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: orders
-- impact: Τα μερίδια X μιας VS δεν αθροίζουν στο X της: λάθος παρονομαστής (παλέτες κόμβου) ή διπλό μερίδιο - το P&L των εθνικών κύκλων είναι λάθος.
-- next: Owner: ct_v_v5_revenue της παραγγελίας (μερίδια ανά κομμάτι και κίνηση): ποιο κομμάτι μετρά δύο φορές ή λείπει. Σημαίνει αλλαγή στον κανόνα της όψης, όχι στα δεδομένα.
-- exceptions: [M-4 β, owner 24/10] Σ μεριδίων X ανά VS σε σύγκριση με το X της ίδιας παραγγελίας από την ίδια όψη (στήλη total: μία πηγή, αρχή 3), όχι με τις σταθερές 650/850 του spec: μια αλλαγή του X στις ρυθμίσεις δεν κοκκινίζει, και κομμάτι παρτίδας 057 με VS (X x παλέτες/33, π.χ. 393,94) δεν είναι ψευδής συναγερμός. Με M-3 β (τρέχον άθροισμα) τα μερίδια αθροίζουν στο X εκ κατασκευής: ο έλεγχος είναι δίχτυ για αλλαγή του κανόνα της όψης.
-- tolerance: 0,01 ανά παραγγελία
-- source: DRAFT 073b (plan F3, spec 8, M-4 β) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy and in the scenario (also with X changed in the settings), red with a wrong denominator in ct_v_v5_revenue (plan-073b.test.mjs)
-- enabled: yes
SELECT count(*) FROM (SELECT x.order_id, sum(x.amount) AS s, max(x.total) AS t FROM ct_v_v5_revenue x WHERE x.kind = 'x' GROUP BY x.order_id) z
 WHERE abs(z.s - z.t) > 0.01;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT o.legacy_id AS x FROM orders o
 JOIN (SELECT v.order_id, sum(v.amount) AS s, max(v.total) AS t FROM ct_v_v5_revenue v WHERE v.kind = 'x' GROUP BY v.order_id) z ON z.order_id = o.id
 WHERE abs(z.s - z.t) > 0.01 ORDER BY o.legacy_id LIMIT 50) s
