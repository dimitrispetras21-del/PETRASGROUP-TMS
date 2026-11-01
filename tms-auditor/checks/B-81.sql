-- id: B-81
-- title: Κομμάτι που δεν έφυγε στην ώρα του
-- flows: F-23,F-14
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: yes
-- entity: national_orders
-- impact: Η ζητούμενη ημέρα (ή το «φεύγει ως» του αποθέματος) πέρασε και το κομμάτι δεν έχει κίνηση ως τον προορισμό του: ο πελάτης περιμένει.
-- next: Εβδομαδιαίο Εθνικών → ΠΡΟΣ ΑΝΑΘΕΣΗ / Πίνακας Βέροιας: ανάθεση ή ενημέρωση πελάτη.
-- exceptions: 071 v_piece_state.overdue (ημέρα Αθήνας). Σήμερα 0 κομμάτια.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM v_piece_state WHERE overdue;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT coalesce(n.legacy_id, o.legacy_id) AS x FROM v_piece_state p
 LEFT JOIN national_orders n ON n.id = p.nat_order_id LEFT JOIN orders o ON o.id = p.order_id WHERE p.overdue ORDER BY 1 LIMIT 50) s
