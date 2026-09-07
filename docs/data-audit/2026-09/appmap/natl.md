# Εθνικές παραγγελίες — κόμβοι/ακμές (πηγή: docs/data-audit/2026-09/2026-09-07-national-architecture*.md)

## Οθόνες/πηγές
- orders_natl.js — γράφει national_orders (776,1423 · 4 rows) · partial, φορτίο ποτέ
- weekly_natl.js — ανάθεση φορτηγού (1969,1976 ok) · status-sync πίσω σπάει για VS (1990-1992) broken
- daily_ramp.js — «Ολοκληρώθηκε» ρωτά λάθος πίνακα (664-706) broken
- orders_intl.js — Veroia Switch → national_loads (1486-1491 · 25/25) ok
- invoicing.js — batch «Invoiced» γράφει Status (927-935) partial
## Πίνακες
- national_orders·4 — status NULL σε όλες, source_order_id NULL· partial
- national_loads·25 — όλες από VS, καμία στήλη/FK προς national_orders· partial
- groupage_lines 0 + consolidated_loads 0 — αχρησιμοποίητη αλυσίδα· unused
- order_stops·389 — 66 σε φορτία, 14 σε διαγραμμένα φορτία· partial
- ramp 44 + local_moves 0 — ramp 0/44 με εθνικό link, local_moves 0 γραμμές· unused
- partner_assignments·23 — paSyncStatus δουλεύει και για natl· ok
## Ποιος το διαβάζει
- Weekly National — national_loads (weekly_natl.js:150 · 25 ορατά) ok
- Ράμπα «Ολοκληρώθηκε» — ρωτά national_orders με id national_loads (674,694,705) broken
- Μισθοδοσία/RT — καμία διαδρομή, order-sync.js:90 μόνο intl, 0/98 nat_load_id, broken
- Τιμολόγηση (λίστα) — invoicing.js:313, formula αντισταθμίζει ότι Status ποτέ Delivered· partial
- Weekly badge groupage — μετρητής unassigned GL, πάντα 0· unused
## Ακμές (status · evidence)
- VS→φορτίο: ok · orders_intl.js:1486-1491, 25/25
- εθνική→φορτίο: broken · orders_natl.js:1717-1800, 400 «Unknown linked record», 0/4
- groupage chain: unused · orders_natl.js:1471-1512, GL 0 / CL 0
- φορτίο→στάσεις: partial · handleFacadeDelete χωρίς cascade (γρ.2605-2629), 14 ορφανές
- φορτίο→ράμπα: partial · daily_ramp.js:135-272, ramp 0/44 συνδεδεμένο
- φορτίο→Weekly: ok · weekly_natl.js:150, 25 ορατά
- φορτίο→μισθοδοσία: broken · order-sync.js:90 μόνο intl, 0/98 nat_load_id
- εθνική→τιμολόγηση: partial · invoicing.js:313,930, Status='Invoiced'
- local_moves: unused · 0 γραμμές, χωρίς cascade στη διαγραφή
## Βαρύτερα ευρήματα
1. Κρίσιμο — national_loads χωρίς στήλη/FK προς national_orders· εθνική δεν γίνεται ποτέ φορτίο (app_errors 7/9 12:22, 0/4).
2. Υψηλό — διαγραφή φορτίου χωρίς cascade στάσεων: 14 ζωντανές order_stops σε 7 διαγραμμένα φορτία.
3. Υψηλό — Ράμπα «Ολοκληρώθηκε» ρωτά λάθος πίνακα· προαγωγή status αποτυγχάνει πάντα, μόνο warn.
4. Μεσαίο — μαζική τιμολόγηση Status='Invoiced' (αντίθετα με απόφαση owner 23/8)· Μισθοδοσία/RT τυφλά στα εθνικά (rtOnOrderSaved μόνο source==='intl').
## Ερωτήσεις owner (πλήρεις στα δύο detail maps)
1. Στήλη+FK national_loads↔national_orders — προχωράμε στη migration §5;
2. Ράμπα «Ολοκληρώθηκε»: διάβασμα national_loads ή νέο πραγματικό link;
3. Αφαιρείται Status='Invoiced' από τη μαζική τιμολόγηση;
