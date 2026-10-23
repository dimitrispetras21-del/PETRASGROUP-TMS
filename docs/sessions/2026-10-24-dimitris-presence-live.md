# 2026-10-24 · dimitris · παρουσία: 068 + Worker ζωντανά, οθόνη κλειστή

- **Βάση:** το 068 ΕΚΤΕΛΕΣΤΗΚΕ 24/10 μετά τα μεσάνυχτα από τον owner. Dry run «4 OK, 0 FAIL», 068 «Success»· SELECT: `presence` με RLS, 0 γραμμές, 8 constraints, `service_role` ακριβώς DELETE/INSERT/SELECT/UPDATE, `anon`/`authenticated` χωρίς πρόσβαση, `presence_beat` μόνο `service_role`, triggers 46 = B-54.
- **Worker:** `deploy/worker-presence-v2` @ `0273aa06` (PR #82, πάνω στο stop-delay) → έκδοση `b00d59f3` (πριν `c652e758`). Φρουρός OK πριν/μετά, ζωντανό = bundle, bindings = πριν + `PRESENCE_MS`/`PRESENCE_OFF`, smoke 400 / 200 / 400 / 400.
- **Repo (PR #79, `fix/068-presence-review`):** τα 5 αρχεία 068 από `drafts/` στο `worker/migrations/` (κανόνας 5)· επικεφαλίδα «EXECUTED 24/10/2026 by the owner» στο 068 και στο dry run, το rollback μένει μη εκτελεσμένο· διαδρομές στα tests διορθώθηκαν· DECISION_LOG.
- **Σειρά merge απόψε:** #78 → #80 → #77 → #79 → #82. Το #79 περιέχει ήδη το #78 (merge), ώστε η ουρά του DECISION_LOG και το «Now» να μη συγκρούονται.
- **Τι μένει:** τα merge με αυτή τη σειρά· άνοιγμα της οθόνης (`FEATURES.WI_PRESENCE = true`) με χωριστή απόφαση του owner, και μέτρηση στον πίνακα (`presence` > 0 γραμμές όσο είναι ανοιχτό το Weekly).
