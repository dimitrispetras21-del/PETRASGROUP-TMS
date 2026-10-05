-- id: S-03
-- title: Απόθεμα: τιμολογημένη παρτίδα που δεν είναι πλήρης
-- flows: F-30
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: stock_lots
-- impact: Ένα τιμολόγιο εκδόθηκε ενώ μένουν παλέτες στην αποθήκη ή κομμάτια σε κίνηση: ο πελάτης χρεώθηκε για κάτι που δεν παραδόθηκε ακόμη.
-- next: Προς τιμολόγηση → η παρτίδα → λίστα κομματιών (ανάγνωση). Ο φρουρός 057 το αρνείται — αν χτυπήσει, γράφτηκε με SQL ή με ανενεργούς φρουρούς (S-02).
-- exceptions:
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lots WHERE invoiced AND NOT complete
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE invoiced AND NOT complete ORDER BY legacy_id LIMIT 50) s
