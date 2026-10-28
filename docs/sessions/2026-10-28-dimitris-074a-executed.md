# 2026-10-28 · dimitris · Εθνικά v5 Φ5 · η `074a` εκτελέστηκε

- **Εκτελέστηκε:** 28/10, περίπου 13:00 ώρα Αθήνας, από τον owner στον SQL editor. Το γραφείο ήταν κλειστό και ο owner έδωσε ρητό «ναι» πριν από τις 15:00. Το SQL είναι αυτό του `main` στο merge του PR #120 (`1e7e58e5`), md5 `5ddf3c36ecab7914da3f58f4183a0ae1`.
- **Αποτελέσματα:**
  - dry run: κόκκινο σκόπιμα, με την αναμενόμενη γραμμή (`hooked functions 3 … triggers 50, B-54 50, v5 rows 0`);
  - εφαρμογή: `074a OK | 3 | 0 | 50 | 50 | 0`;
  - verify (SELECT, συντονιστής): `074a in place`, hooks 3, `worker_can_call 5`, `open_to_api 0`, `plan_config` άδειος, `b54_matches true`, γραμμές v5 0.

  Μετά ανέβηκε το Worker deploy 1, `c0ccdf77` (φρουρός 28 σημάδια, smoke 18/18).
- **Ίχνος:** τα πέντε αρχεία `074a_plan_reads{,_dryrun,_rollback,_verify,_test}.sql` βγήκαν από το `drafts/`, αμετάβλητα byte προς byte. Ο builder μένει στο `drafts/tools/`, γράφει ένα επίπεδο πάνω, και δίνει 0 drift. Οι δύο δοκιμές τα βρίσκουν εκεί, και ελέγχουν ότι στο `drafts/` δεν έμεινε αντίγραφο.
- **Δοκιμές:** `tests/sql-074a-drafts.test.js` 7/7· `plan-074a.test.mjs` 20/20· `tms-auditor` 162/162· `tests/sql-*` 74/74.
  - Η 074 του stream (a2, PR #130) διαβάζει την 074a μέσω `migrationFile`, που τη βρίσκει όπου κι αν είναι, εφόσον υπάρχει ένα αντίγραφο.
  - Το contract test του Worker δοκιμάζει και τις δύο διαδρομές.
- **Τι μένει:** η ημέρα L (074 + 074b + deploy 2 + FE-2), σύμφωνα με το Runbook §6 του πλάνου Φ5.
