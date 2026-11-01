# 2026-10-31 · dimitris · 083: φορτίο χωρίς φορτηγό (προσχέδιο SQL)

- **Τι άλλαξε:** προσχέδιο `worker/migrations/drafts/083_plan_load_without_truck*.sql` (πηγή, dry run, verify, rollback, rollback dry run), με builder `build-083.mjs`, test αρχείων `tests/sql-083-drafts.test.js` και PGlite `tms-auditor/test/plan-083.test.mjs` 9/9. **Δεν εκτελέστηκε.**
- **Αποφασίστηκε:** το φορτίο χωρίς φορτηγό είναι κύκλος χωρίς όχημα. Είναι η κατάσταση που ήδη αφήνει ο «Καθαρισμός»· η 083 αλλάζει μόνο τη γέννηση, με το ρητό `new_rt.later` (DECISION_LOG 31/10).
- **Worker:** καμία αλλαγή. Το `/plan/legs` περνά το σώμα ως έχει, και τα κείμενα `bad_input` / `no_vehicle` υπάρχουν ήδη.
- **Μένει:**
  - εκτέλεση από τον owner μετά τις 15:00: dry run → 083 → verify·
  - το front end «Φορτηγό αργότερα» μπαίνει σε stacked PR.
