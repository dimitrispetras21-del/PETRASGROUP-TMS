-- id: B-64
-- title: Τοπικός οδηγός ↔ μισθοδοσία (δουλειά χωρίς γραμμή, γραμμή χωρίς δουλειά, άγνωστος τύπος αμοιβής)
-- flows: F-22,F-35
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity:
-- impact: Τοπικός οδηγός που πληρώνεται ανά δρομολόγιο μένει χωρίς γραμμή «ΤΟΠΙΚΟ» (απλήρωτη δουλειά), ή υπάρχει γραμμή χωρίς δουλειά ή κενή γραμμή σε μισθωτό· ή ο οδηγός έκανε τοπική χωρίς δηλωμένο τύπο αμοιβής.
-- next: Μισθοδοσία → ο οδηγός → η μέρα. orphan / salaried: «Ακύρωση» με αιτιολογία (η βάση την επιτρέπει μόνο σε μισθωτό ή σε μέρα χωρίς ζωντανή τοπική). unpaid: η γραμμή γράφεται μόνη της — αν λείπει, κοίτα τον B-54 (triggers). paybasis: Οδηγοί → ο οδηγός → «Τύπος αμοιβής».
-- exceptions: Μισθωτοί (pay_basis='salary'): η τοπική τους είναι μόνο ιστορικό, ΧΩΡΙΣ γραμμή (owner 4/10). Άγνωστος τύπος (κενό) = σαν ανά δρομολόγιο, ώστε να μη χαθεί πληρωμή — και αναφέρεται ως «paybasis» μέχρι να δηλωθεί. Γραμμές «θέλει έλεγχο» εκτός (τις μετρά ο B-08). salaried = μόνο γραμμή ΧΩΡΙΣ ποσό: ποσό σε γραμμή μισθωτού γράφεται μόνο αφού το λογιστήριο ελέγξει παλιά μέρα «ανά δρομολόγιο» (απόφαση, όχι λάθος). «Αξία 0» = χωρίς ποσό. ids: unpaid:<οδηγός>:<μέρα> · orphan:<γραμμή> · salaried:<γραμμή> · paybasis:<οδηγός>.
-- tolerance:
-- source: σχέδιο local-relay v4 έλεγχος «B-59» → B-64 + απάντηση owner στο Q2 4/10 (μισθωτοί = μόνο ιστορικό) · DRAFT 060 · 4/10 = 0 (καμία τοπική) · ελεγκτής 4/10: salaried μόνο χωρίς ποσό, έξοδος = ακύρωση με αιτιολογία
-- enabled: yes
SELECT (SELECT count(*) FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm JOIN drivers d ON d.id=lm.driver_id
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND coalesce(d.pay_basis,'')<>'salary'
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date))
 + (SELECT count(*) FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled'))
 + (SELECT count(*) FROM dl_entries e JOIN drivers d ON d.id=e.driver_id WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review AND d.pay_basis='salary'
  AND coalesce(e.trip_value,0)=0 AND coalesce(e.advance,0)=0 AND coalesce(e.expenses,0)=0)
 + (SELECT count(*) FROM drivers d WHERE d.pay_basis IS NULL
  AND EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id=d.id AND lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT 'unpaid:' || k.driver_id || ':' || k.move_date AS x FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm JOIN drivers d ON d.id=lm.driver_id
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND coalesce(d.pay_basis,'')<>'salary'
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date)
 UNION ALL SELECT 'orphan:' || e.id FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled')
 UNION ALL SELECT 'salaried:' || e.id FROM dl_entries e JOIN drivers d ON d.id=e.driver_id WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review AND d.pay_basis='salary'
  AND coalesce(e.trip_value,0)=0 AND coalesce(e.advance,0)=0 AND coalesce(e.expenses,0)=0
 UNION ALL SELECT 'paybasis:' || d.id FROM drivers d WHERE d.pay_basis IS NULL
  AND EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id=d.id AND lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled') LIMIT 50) s;
