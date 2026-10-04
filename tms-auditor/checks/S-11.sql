-- id: S-11
-- title: Απόθεμα: παρτίδα χωρίς επιμερισμό (χωρίς τιμή ή χωρίς χρέωση αποθήκης) > 2 ημέρες
-- flows: F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: stock_lots
-- impact: Χωρίς τιμή πελάτη ή χωρίς χρέωση αποθήκης (ούτε ανάθεση συνεργάτη ούτε «Χρέωση αποθήκης») η παρτίδα δεν επιμερίζεται: όλη η τιμή μένει στη γραμμή της παρτίδας και τα RT των κομματιών δείχνουν έσοδο 0 στο TRIP PnL.
-- next: Owner: φόρμα της παρτίδας → «Χρέωση αποθήκης» (0 αν η αποθήκη δεν χρεώνει τίποτα) ή τιμή πελάτη· ή Partner Rate στην ανάθεση της αποθήκης.
-- exceptions: Παρτίδα με δικό μας φορτηγό ή εθνική πηγή: χτυπά μέχρι να μπει η «Χρέωση αποθήκης» — σκόπιμα (owner 4/10: ένας κανόνας για κάθε παρτίδα). «Χωρίς παλέτες» = παρακαμμένοι φρουροί, βλ. S-02.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · γύρος 2 (owner 4/10): «χωρίς χρέωση αποθήκης» = no_charge · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2 ORDER BY l.legacy_id LIMIT 50) s
