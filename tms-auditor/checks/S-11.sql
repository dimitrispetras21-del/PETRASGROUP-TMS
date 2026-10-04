-- id: S-11
-- title: Απόθεμα: παρτίδα χωρίς επιμερισμό > 2 ημέρες ή με χρεώσεις πάνω από την τιμή
-- flows: F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: stock_lots
-- impact: Χωρίς τιμή πελάτη, χωρίς «Κόμιστρο συνεργάτη» στην ανάθεση ή χωρίς καμία χρέωση (ούτε ανάθεση ούτε «Χρέωση αποθήκης») η παρτίδα δεν επιμερίζεται: όλη η τιμή μένει στη γραμμή της παρτίδας και τα RT των κομματιών δείχνουν έσοδο 0 στο TRIP PnL. Με «Σύνολο χρεώσεων» πάνω από την τιμή το «Καθαρό» είναι αρνητικό και κάθε RT κομματιού γράφει ζημιά.
-- next: Owner: φόρμα της παρτίδας → «Χρέωση αποθήκης» (0 αν η αποθήκη δεν χρεώνει τίποτα) ή τιμή πελάτη· «Κόμιστρο συνεργάτη» στην ανάθεση της αποθήκης. Αρνητικό «Καθαρό» = λάθος ποσό (π.χ. 6500 αντί 650).
-- exceptions: Παρτίδα με δικό μας φορτηγό ή εθνική πηγή: χτυπά μέχρι να μπει η «Χρέωση αποθήκης» — σκόπιμα (owner 4/10: ένας κανόνας για κάθε παρτίδα). Αρνητικό «Καθαρό» χτυπά αμέσως, χωρίς τις 2 ημέρες. «Χωρίς παλέτες» = παρακαμμένοι φρουροί, βλ. S-02.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · γύρος 2 (owner 4/10): «χωρίς χρέωση αποθήκης» = no_charge · γύρος 3: no_partner_rate (Σ2-03), αρνητικό καθαρό (Σ2-04) · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE (m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2) OR m.net < 0
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE (m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2) OR m.net < 0 ORDER BY l.legacy_id LIMIT 50) s
