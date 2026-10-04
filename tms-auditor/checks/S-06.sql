-- id: S-06
-- title: Απόθεμα: κομμάτια κινούνται ενώ η παραλαβή δεν σημειώθηκε
-- flows: F-26,F-14
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: stock_lots
-- impact: Φεύγουν παλέτες από αποθήκη όπου η παρτίδα δεν έχει μπει ακόμη: είτε ξεχάστηκε το «Παραδόθηκε» της παραλαβής, είτε φορτώνουμε κάτι που δεν υπάρχει.
-- next: Weekly → η γραμμή της παρτίδας (σήμα «→ ΑΠΟΘΗΚΗ»): σημειώθηκε η παράδοση στην αποθήκη; (ανάγνωση)
-- exceptions: Κομμάτια με φόρτωση σήμερα δεν μετρούν (η παραλαβή μπορεί να σημειωθεί αργότερα μέσα στη μέρα).
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(DISTINCT l.id) FROM stock_v_lots l JOIN stock_v_pieces p ON p.lot_id = l.id WHERE NOT l.intake_delivered AND p.status IN ('In Transit','Delivered') AND p.loading_date < current_date
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT DISTINCT l.legacy_id AS x FROM stock_v_lots l JOIN stock_v_pieces p ON p.lot_id = l.id WHERE NOT l.intake_delivered AND p.status IN ('In Transit','Delivered') AND p.loading_date < current_date ORDER BY l.legacy_id LIMIT 50) s
