-- id: B-64
-- title: Τοπικός οδηγός ↔ μισθοδοσία (δουλειά χωρίς γραμμή, γραμμή χωρίς δουλειά, άγνωστος τύπος αμοιβής)
-- flows: F-22,F-35
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity:
-- impact: Τοπικός οδηγός που πληρώνεται ανά δρομολόγιο μένει χωρίς γραμμή «ΤΟΠΙΚΟ» (απλήρωτη δουλειά), ή υπάρχει γραμμή χωρίς δουλειά ή σε μισθωτό· ή ο οδηγός έκανε τοπική χωρίς δηλωμένο τύπο αμοιβής.
-- next: Μισθοδοσία → ο οδηγός → η μέρα· για «paybasis» Οδηγοί → ο οδηγός → «Τύπος αμοιβής» (ανάγνωση).
-- exceptions: Μισθωτοί (pay_basis='salary'): η τοπική τους είναι μόνο ιστορικό, ΧΩΡΙΣ γραμμή (owner 4/10). Άγνωστος τύπος (κενό) = σαν ανά δρομολόγιο, ώστε να μη χαθεί πληρωμή — και αναφέρεται ως «paybasis» μέχρι να δηλωθεί. Γραμμές «θέλει έλεγχο» εκτός (τις μετρά ο B-08). ids: unpaid:<οδηγός>:<μέρα> · orphan:<γραμμή> · salaried:<γραμμή> · paybasis:<οδηγός>.
-- tolerance:
-- source: σχέδιο local-relay v4 έλεγχος «B-59» → B-64 + απάντηση owner στο Q2 4/10 (μισθωτοί = μόνο ιστορικό) · DRAFT 060 · 4/10 = 0 (καμία τοπική)
-- enabled: yes
SELECT (SELECT count(*) FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm JOIN drivers d ON d.id=lm.driver_id
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND coalesce(d.pay_basis,'')<>'salary'
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date))
 + (SELECT count(*) FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled'))
 + (SELECT count(*) FROM dl_entries e JOIN drivers d ON d.id=e.driver_id WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review AND d.pay_basis='salary')
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
 UNION ALL SELECT 'paybasis:' || d.id FROM drivers d WHERE d.pay_basis IS NULL
  AND EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id=d.id AND lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled') LIMIT 50) s;
