# 2026-10-31 · dimitris · 080 εκτελεσμένη: αρχεία έξω από drafts/, καταγραφή

- **Τι άλλαξε:** τα 4 αρχεία της 080 (`080_plan_optional_price_pallets*.sql`) πήγαν από `worker/migrations/drafts/` στο `worker/migrations/`· ο `build-080.mjs` δείχνει τον νέο φάκελο (`--check`: 0 drift)· `tests/sql-080-drafts.test.js` 6/6 (βρίσκει και τις δύο θέσεις).
- **Εκτέλεση (owner, 31/10):** dry run, εκτέλεση και verify όπως στο DECISION_LOG· όλα πράσινα, μετρητές 0.
- **Αποφασίστηκε:** η cache 60″ της αναζήτησης πελάτη (#172) γράφεται ως εγκεκριμένη από τον owner (28/10).
- **Μένει:** μέτρηση NULL / B-100 με την πρώτη εθνική χωρίς τιμή ή παλέτες· το PGlite `plan-080` δεν έτρεξε τοπικά (χωρίς `tms-auditor/node_modules` στο worktree), το CI το καλύπτει.
