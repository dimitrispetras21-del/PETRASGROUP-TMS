-- id: B-64
-- title: Τοπικός οδηγός ↔ μισθοδοσία (δουλειά χωρίς γραμμή, γραμμή χωρίς δουλειά)
-- flows: F-22,F-35
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity:
-- impact: Οδηγός που έκανε τοπική κίνηση μένει χωρίς γραμμή «ΤΟΠΙΚΟ» στη μισθοδοσία του (απλήρωτη δουλειά), ή υπάρχει γραμμή «ΤΟΠΙΚΟ» χωρίς ποσό και χωρίς ζωντανή τοπική κίνηση εκείνη τη μέρα.
-- next: Μισθοδοσία → ο οδηγός → η μέρα. orphan: «Ακύρωση» με αιτιολογία (η βάση την επιτρέπει μόνο σε μέρα χωρίς ζωντανή τοπική του οδηγού). unpaid: η γραμμή γράφεται μόνη της — αν λείπει, κοίτα τον B-54 (triggers).
-- exceptions: Κάθε οδηγός που κάνει τοπική κίνηση παίρνει γραμμή «ΤΟΠΙΚΟ» στη μισθοδοσία του, μία ανά μέρα — χωρίς διάκριση οδηγών (owner 5/10). Γραμμές «θέλει έλεγχο» εκτός (τις μετρά ο B-08). orphan = μόνο γραμμή ΧΩΡΙΣ ποσό: γραμμή με ποσό που έμεινε χωρίς τοπική πηγαίνει πρώτα σε «θέλει έλεγχο» (B-08)· αν το λογιστήριο την ελέγξει και την κρατήσει, είναι απόφαση, όχι λάθος — και ξαναμπαίνει σε έλεγχο μόλις αλλάξουν ξανά οι τοπικές της μέρας. «Αξία 0» = χωρίς ποσό. ids: unpaid:<οδηγός>:<μέρα> · orphan:<γραμμή>.
-- tolerance:
-- source: σχέδιο local-relay v4 έλεγχος «B-59» → B-64 · DRAFT 060 · 4/10 = 0 (καμία τοπική) · ελεγκτής 4/10: έξοδος = ακύρωση με αιτιολογία · γύρος 3 (5/10): το orphan μόνο χωρίς ποσό · owner 5/10: καμία διάκριση οδηγών («ας μην μπουμε ακομα σε αλλο τροπο μισθοδοσιας») — έφυγαν τα salaried / paybasis και ο τύπος αμοιβής
-- enabled: yes
SELECT (SELECT count(*) FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND lm.driver_id IS NOT NULL
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date))
 + (SELECT count(*) FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND coalesce(e.trip_value,0)=0 AND coalesce(e.advance,0)=0 AND coalesce(e.expenses,0)=0
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled'));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT 'unpaid:' || k.driver_id || ':' || k.move_date AS x FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND lm.driver_id IS NOT NULL
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date)
 UNION ALL SELECT 'orphan:' || e.id FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND coalesce(e.trip_value,0)=0 AND coalesce(e.advance,0)=0 AND coalesce(e.expenses,0)=0
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled') LIMIT 50) s;
