-- id: B-50b
-- title: Έγγραφα στόλου: λήξη εντός 30 ημερών ή μη καταχωρημένη
-- flows: F-38
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: yes
-- entity: 
-- impact: 
-- next: 
-- exceptions: Ουρά εργασίας — ποτέ κόκκινο.
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-50 (δεύτερο μισό)
-- enabled: yes
SELECT (SELECT count(*) FROM trucks WHERE deleted_at IS NULL AND active IS NOT FALSE
          AND (kteo_expiry IS NULL OR insurance_expiry IS NULL OR tachograph_expiry IS NULL
               OR least(kteo_expiry, kek_expiry, insurance_expiry, tachograph_expiry) BETWEEN current_date AND current_date+30))
     + (SELECT count(*) FROM trailers WHERE deleted_at IS NULL AND active IS NOT FALSE
          AND (kteo_expiry IS NULL OR insurance_expiry IS NULL OR frc_expiry IS NULL
               OR least(kteo_expiry, insurance_expiry, frc_expiry) BETWEEN current_date AND current_date+30));
