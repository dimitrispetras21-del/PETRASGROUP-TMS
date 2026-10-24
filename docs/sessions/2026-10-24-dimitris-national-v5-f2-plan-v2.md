# 2026-10-24 · dimitris · Εθνικά v5 Φ2: πλάνο v2 (κώδικας = αποφάσεις owner 23/10)

- Άλλαξε: ο κώδικας του πλάνου Φ2 ακολουθεί πλέον τις αποφάσεις 10 (`month`, καμία «πληρωμένη», `tms_week` έξω από τον φρουρό: 22 md5), 41 (`PLAN_PERMS` για όλους, `rt-clear`/`delete` owner/dispatcher, ένα board για όλους), 44 (`request_id` + `plan:request_reused`, ο Worker δεν ξαναστέλνει εγγραφή) και 42 (βάση main @ `639a5a50`, Worker b00d59f3, Γ6 εκτελεσμένο, φρουρός 14 σημάδια).
- Αποδείχθηκε κατά γράμμα σε scratch, με την πραγματική λήψη `live-072.sql` (SELECT, md5 `1df9d47d…`): rules test 186 OK / 0 FAIL, build 12/12, harness 9/9, 22 μεταλλαγές· Worker 236 → 281 (1 skip του main), `GUARD OK (14 markers, plan=1)` (`docs/national-v5/f2/fix-report-v2.md`).
- Αποφασίστηκε (για επιβεβαίωση owner στο Task 0 Step 1): ίδιο `request_id` με άλλο σώμα = άρνηση `request_reused`· το ίχνος είναι μία γραμμή `audit_log` `plan_request`, όχι νέος πίνακας.
- Μένει: επιβεβαίωση owner για το `request_reused`· μετά η Φ2 ξεκινά από το Task 0 χωρίς αναγέννηση κώδικα. Η αλλαγή οχήματος (36) μένει στο δικό της spec.
- Βρέθηκε: η λίστα σημαδιών του CLAUDE.md δεν έχει ακόμη τα σημάδια stop-delay / presence / `Temp Per CMR`· ένα test του presence παραλείπεται γιατί ψάχνει το 068 στο `drafts/`.
