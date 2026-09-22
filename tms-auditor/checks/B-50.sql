-- id: B-50
-- title: Ενεργό όχημα με ΛΗΓΜΕΝΟ έγγραφο (ΚΤΕΟ/ΚΕΚ/ασφάλεια/ταχογράφος/FRC)
-- flows: F-38
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: trucks
-- impact: Όχημα κυκλοφορεί με ληγμένο έγγραφο (η περίπτωση ATP/FRC — αρχή 6).
-- next: Συντήρηση → καρτέλα οχήματος: η ημερομηνία είναι λάθος καταχώρηση ή πραγματική λήξη; (ανάγνωση)
-- exceptions: Κενή ημερομηνία ΔΕΝ μετρά εδώ (ουρά B-50b): «μη καταχωρημένη», όχι «ληγμένη» (κανόνας εγχειριδίου 8/9).
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-50 · στήλες *_expiry (κατάλογος 22/9)
-- enabled: yes
SELECT (SELECT count(*) FROM trucks WHERE deleted_at IS NULL AND active IS NOT FALSE
          AND least(kteo_expiry, kek_expiry, insurance_expiry, tachograph_expiry) < current_date)
     + (SELECT count(*) FROM trailers WHERE deleted_at IS NULL AND active IS NOT FALSE
          AND least(kteo_expiry, insurance_expiry, frc_expiry) < current_date);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT legacy_id AS x FROM trucks WHERE deleted_at IS NULL AND active IS NOT FALSE
          AND least(kteo_expiry, kek_expiry, insurance_expiry, tachograph_expiry) < current_date LIMIT 50) s;
