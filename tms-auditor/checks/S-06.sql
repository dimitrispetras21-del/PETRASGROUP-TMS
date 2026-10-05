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
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · ζωντανό μόνο μετά τα 057 + 057b · γύρος 1 D3: διαβάζει stock_v_lots.pieces_moving — ο ίδιος ορισμός με το κόκκινο τσιπ του ραφιού («Pieces Moving»)
-- enabled: yes
SELECT count(*) FROM stock_v_lots WHERE pieces_moving > 0
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE pieces_moving > 0 ORDER BY legacy_id LIMIT 50) s
