-- id: S-01
-- title: Απόθεμα: υπόλοιπο παρτίδας κάτω από 0
-- flows: F-14,F-30
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: stock_lots
-- impact: Βγήκαν περισσότερες παλέτες από όσες μπήκαν στην αποθήκη: ο φρουρός της βάσης παρακάμφθηκε· ο επιμερισμός και το τιμολόγιο της παρτίδας είναι λάθος.
-- next: Ράφι του Weekly → η παρτίδα → ποιο κομμάτι έχει λάθος παλέτες (ανάγνωση). Μετά: S-02 — είναι ενεργοί οι φρουροί;
-- exceptions: Καμία: ο κανόνας ζει στη βάση (stock_guard_orders / stock_guard_natl).
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lots WHERE remaining_pallets < 0
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE remaining_pallets < 0 ORDER BY legacy_id LIMIT 50) s
