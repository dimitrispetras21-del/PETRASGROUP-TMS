-- id: S-05
-- title: Απόθεμα: παρτίδα στην αποθήκη > 21 ημέρες, όχι πλήρης
-- flows: F-30
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: stock_lots
-- impact: Παλέτες πελάτη κάθονται στην αποθήκη συνεργάτη πάνω από 3 εβδομάδες· η παρτίδα δεν τιμολογείται μέχρι να αδειάσει ή να κλείσει.
-- next: Ράφι του Weekly (πορτοκαλί τσιπ «>21η»): κομμάτι στο επόμενο φορτηγό ή «Κλείσιμο υπολοίπου» με αιτιολογία.
-- exceptions:
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lots WHERE intake_delivered AND NOT complete AND received_on < current_date - 21
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE intake_delivered AND NOT complete AND received_on < current_date - 21 ORDER BY legacy_id LIMIT 50) s
