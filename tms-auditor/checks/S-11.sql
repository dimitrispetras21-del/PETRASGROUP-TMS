-- id: S-11
-- title: Απόθεμα: παραληφθείσα παρτίδα χωρίς επιμερισμό > 2 ημέρες
-- flows: F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: stock_lots
-- impact: Χωρίς τιμή πελάτη ή κόστος αποθήκης η παρτίδα δεν επιμερίζεται: όλη η τιμή μένει στη γραμμή της παρτίδας και τα RT των κομματιών δείχνουν έσοδο 0 στο TRIP PnL.
-- next: Συμπλήρωση της τιμής στην παρτίδα ή του Partner Rate στην ανάθεση της αποθήκης.
-- exceptions: Εθνική πηγή ή παραλαβή με δικό μας φορτηγό: χωρίς κόστος αποθήκης μέχρι τη Φ3 (Ε6/Ε7) — χτυπά σκόπιμα.
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2 ORDER BY l.legacy_id LIMIT 50) s
