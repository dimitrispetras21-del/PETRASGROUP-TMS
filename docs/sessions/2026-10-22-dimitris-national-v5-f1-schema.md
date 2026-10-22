# 2026-10-22 · dimitris · Εθνικά v5 Φ1: σχήμα 071 + 071b (DRAFT)

- Γράφτηκαν τα `071_plan_schema*` (σχήμα κλειστό, 0 γραμμές, B-54 37 → 46) και `071b_plan_one_vehicle*` (`btree_gist` + ένα φορτηγό/ένας οδηγός τη φορά, χωριστό «ναι»). Πλάνο: `docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md`.
- Το αντίγραφο της παραγωγής (μόνο SELECT) χρειάστηκε μία διόρθωση στο ερώτημα λήψης: η στήλη `dl_entries.balance_delta` είναι `GENERATED ALWAYS`· το πλάνο ενημερώθηκε. Η αφετηρία ξαναμετρήθηκε 22/10 και ισχύει (md5 ×4, 37 triggers, `btree_gist` όχι εγκατεστημένο).
- Αποδείχθηκαν σε PGlite με σχήμα παραγωγής (`tms-auditor/test/plan-071.test.mjs`): 071 54/54, 071b 8/8, το rollback επαναφέρει τα 4 ζωντανά κείμενα byte προς byte. Έλεγχοι build: `tests/sql-071-drafts.test.js`.
- Αποφάσεις πλάνου (via_hub χωρίς backfill, plan_config στη 074, nat_loading χωρίς ρυμουλκούμενο, κ.ά.) στο DECISION_LOG 22/10· ο owner ενέκρινε και τις 9 (22/10).
- Μένει: εκτέλεση από τον owner μετά τις 15:00 (Task 8), μετά καθρέφτης B-54 = 46 και μεταφορά εκτός `drafts/` (Task 9). Οι καθρέφτες B-54 λένε σήμερα 35, ενώ η παραγωγή έχει 37.
