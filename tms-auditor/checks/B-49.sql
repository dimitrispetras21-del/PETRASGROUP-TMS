-- id: B-49
-- title: Παλέτες: ποσότητες χωρίς επιβεβαίωση > 24 ώρες (μισή επιβεβαίωση)
-- flows: F-31
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: pl_movements
-- impact: Το δελτίο ανέβηκε και οι ποσότητες γράφτηκαν, η επιβεβαίωση όχι — μπλοκάρει τιμολόγηση.
-- next: 
-- exceptions: 
-- tolerance: 24h από created_at — ο πίνακας ΔΕΝ έχει updated_at· πιο αδύναμο: δεν ξέρουμε πότε γράφτηκαν οι ποσότητες
-- source: 04 ΝΕΟΣ Β-49
-- enabled: no: ΟΡΙΣΜΟΣ ΛΑΘΟΣ (μέτρηση παραγωγής 22/9 19:33 UTC = 49 από 51 εκκρεμείς): οι feeders γράφουν ποσότητες ΚΑΤΑ τη δημιουργία, άρα «ποσότητες χωρίς επιβεβαίωση» είναι η κανονική κατάσταση. Χωρίς updated_at στο pl_movements δεν φαίνεται πότε γράφτηκαν. Το σήμα «μισή επιβεβαίωση» το κρατά το P-08 (ίχνος audit).
SELECT count(*) FROM pl_movements WHERE status='pending' AND (coalesce(taken,0)>0 OR coalesce(given,0)>0) AND created_at < now()-interval '24 hours';
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT id::text AS x FROM pl_movements WHERE status='pending' AND (coalesce(taken,0)>0 OR coalesce(given,0)>0) AND created_at < now()-interval '24 hours' LIMIT 50) s;
