# 2026-11-01 · dimitris · Π-7: κόμιστρο ΚΑΘΟΔΟΥ + ΑΝΟΔΟΥ (089 + Worker + φόρμα)

- **Τι άλλαξε:** τρία PR.
  - SQL 089, προσχέδιο πάνω στην 086: στήλη `rt_vehicle_segments.partner_rate_anodos`, CHECK, trigger `plan_seg_rate_split`, `plan_rt_update` set.partner_rate_anodos, `plan_h_seg_json`. PGlite 13/13.
  - Worker πάνω στο #191: `PLAN_RULE_TEXT.seg_partner_rate_anodos` και σημάδι φρουρού `--rate2`.
  - Front end: δύο πεδία στη φόρμα του φορτηγού, «ΑΝΟΔΟΥ λείπει» στη λίστα Δ1, και τα δύο ποσά στα τμήματα.
- **Αποφασίστηκε:** κρατάμε σύνολο + μέρος ΑΝΟΔΟΥ, γιατί και οι 4 ζωντανοί κύκλοι συνεργάτη είναι ΜΟΝΟ ΑΝΟΔΟΣ. Οι όψεις κόστους, τα fingerprints της 073 και το plan_board μένουν ως έχουν (DECISION_LOG 1/11).
- **Σειρά:** 084 → 086 → 089 (owner, μετά τις 15:00) → Worker (#191 → αυτό) → merge front end. Το front end πριν την 089 = `bad_input`, γιατί το κλειδί είναι άγνωστο, άρα καμία σιωπηλή απώλεια.
- **Μένει:** εκτέλεση 089 + deploy από τον owner. Μετά την εκτέλεση, `SELECT count(*) FROM rt_vehicle_segments WHERE partner_rate_anodos IS NOT NULL` (0 αμέσως μετά).
