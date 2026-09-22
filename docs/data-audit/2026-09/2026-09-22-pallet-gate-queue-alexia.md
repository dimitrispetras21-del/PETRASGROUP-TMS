# Ουρά πύλης παλετών για την Αλεξία — 22/9/2026 (πριν την έναρξη τιμολόγησης 28/9)

**Πηγή:** Grok Bot, SELECT 22/9 21:20 (Πιλότος Γ, συνέχεια ελέγχου ροής τιμολόγησης). Χωρίς ονόματα πελατών.
**Συμφιλίωση με το readiness doc 21/9 §7.4:** το «51» εκεί = εκκρεμείς **κινήσεις** (`pl_movements.status='pending'`, σήμερα
ακόμη 51, LOADING 50)· το «60» = **παραγγελίες** που μπλοκάρουν στην πύλη. Σήμερα 63: οι 60 όλες ακόμη μέσα (καμία δεν
ξεμπλόκαρε 21→22/9· audit pl_movements: 4 create, 2 update), +3 νέες (295, 296, 364) — **δεν αποδείχθηκε** πότε/γιατί προστέθηκαν (πιθανόν έλειπαν από τη χειροκίνητη λίστα 21/9· το audit δεν έδωσε αξιόπιστο φίλτρο μετάβασης σε Delivered). Ακριβώς (SELECT συντονιστή 21:30): 65 στάσεις = 49 Α + 16 Β· 63 παραγγελίες = 48 μόνο Α + 15 μόνο Β, 0 με και τα δύο.

## Τι κάνει η Αλεξία (Ισοζύγιο Παλετών)

- **A_confirm (49 στάσεις / 48 παραγγελίες):** υπάρχει ήδη εκκρεμής κίνηση LOADING. **Έλεγξε τα στοιχεία της (παλέτες, ημερομηνία, δελτίο) και επιβεβαίωσε ΜΟΝΟ εφόσον τεκμηριώνεται.** Η ύπαρξη εκκρεμούς εγγραφής δεν σημαίνει ότι είναι σωστή. Χωρίς upload.
- **B_create_then_confirm (16 στάσεις / 15 παραγγελίες):** καμία κίνηση LOADING στη στάση → πρώτα «+ κίνηση» με τα πραγματικά στοιχεία, μετά επιβεβαίωση.
- Κάθε επιβεβαίωση ξεμπλοκάρει την παραγγελία στην Τιμολόγηση αυτόματα (η πύλη διαβάζει confirmed LOADING ανά στάση).

Σειρά: πρώτα τα A, μετά τα B. Αν κάποια εκκρεμής κίνηση είναι λάθος, ΔΕΝ επιβεβαιώνεται — σημειώνεται στον owner. Στόχος ως Παρασκευή 25/9: 0 στην καρτέλα «Μπλοκαρισμένες» της Τιμολόγησης.

| order_id | παράδοση | stop_id | εργασία | χώρα στάσης |
|---:|---|---:|---|---|
| 169 | 2026-08-08 | 667 | A_confirm | Greece |
| 170 | 2026-08-09 | 669 | A_confirm | Germany |
| 182 | 2026-08-10 | 703 | A_confirm | Greece |
| 187 | 2026-08-10 | 714 | B_create_then_confirm | Greece |
| 185 | 2026-08-11 | 710 | B_create_then_confirm | Greece |
| 174 | 2026-08-12 | 680 | A_confirm | Greece |
| 184 | 2026-08-12 | 708 | A_confirm | Greece |
| 156 | 2026-08-14 | 629 | A_confirm | Greece |
| 161 | 2026-08-15 | 646 | A_confirm | Greece |
| 165 | 2026-08-15 | 654 | A_confirm | Hungary |
| 167 | 2026-08-16 | 661 | A_confirm | Germany |
| 153 | 2026-08-17 | 619 | A_confirm | Greece |
| 164 | 2026-08-17 | 652 | A_confirm | Greece |
| 152 | 2026-08-19 | 617 | A_confirm | Greece |
| 154 | 2026-08-19 | 625 | A_confirm | Greece |
| 206 | 2026-08-19 | 789 | B_create_then_confirm | Hungary |
| 218 | 2026-08-20 | 821 | B_create_then_confirm | Slovenia |
| 162 | 2026-08-21 | 648 | A_confirm | Greece |
| 233 | 2026-08-21 | 856 | B_create_then_confirm | Austria |
| 225 | 2026-08-22 | 835 | B_create_then_confirm | Hungary |
| 212 | 2026-08-23 | 808 | A_confirm | Greece |
| 215 | 2026-08-23 | 814 | B_create_then_confirm | Greece |
| 216 | 2026-08-23 | 816 | A_confirm | Greece |
| 222 | 2026-08-23 | 829 | B_create_then_confirm | Greece |
| 224 | 2026-08-23 | 833 | B_create_then_confirm | Greece |
| 232 | 2026-08-23 | 853 | A_confirm | Austria |
| 217 | 2026-08-24 | 819 | A_confirm | Greece |
| 238 | 2026-08-24 | 880 | B_create_then_confirm | Austria |
| 234 | 2026-08-25 | 858 | A_confirm | Greece |
| 242 | 2026-08-25 | 889 | A_confirm | Austria |
| 214 | 2026-08-26 | 812 | A_confirm | Greece |
| 235 | 2026-08-26 | 861 | B_create_then_confirm | Greece |
| 237 | 2026-08-26 | 866 | B_create_then_confirm | Greece |
| 223 | 2026-08-27 | 831 | B_create_then_confirm | Greece |
| 231 | 2026-08-27 | 850 | A_confirm | Greece |
| 243 | 2026-08-27 | 891 | A_confirm | Austria |
| 253 | 2026-08-28 | 920 | A_confirm | Austria |
| 254 | 2026-08-29 | 922 | A_confirm | Poland |
| 247 | 2026-08-30 | 908 | A_confirm | Greece |
| 256 | 2026-08-30 | 926 | A_confirm | Austria |
| 248 | 2026-08-31 | 910 | A_confirm | Greece |
| 249 | 2026-09-01 | 912 | A_confirm | Greece |
| 258 | 2026-09-01 | 934 | A_confirm | Austria |
| 250 | 2026-09-02 | 914 | A_confirm | Greece |
| 261 | 2026-09-02 | 940 | A_confirm | Hungary |
| 251 | 2026-09-03 | 916 | A_confirm | Greece |
| 268 | 2026-09-03 | 961 | A_confirm | Austria |
| 252 | 2026-09-04 | 918 | A_confirm | Greece |
| 277 | 2026-09-06 | 997 | A_confirm | Austria |
| 295 | 2026-09-07 | 1046 | B_create_then_confirm | Greece |
| 295 | 2026-09-07 | 1047 | B_create_then_confirm | Greece |
| 286 | 2026-09-08 | 1027 | A_confirm | Austria |
| 296 | 2026-09-09 | 1049 | B_create_then_confirm | Hungary |
| 305 | 2026-09-10 | 1073 | A_confirm | Austria |
| 320 | 2026-09-13 | 1131 | A_confirm | Austria |
| 322 | 2026-09-15 | 1148 | A_confirm | Austria |
| 323 | 2026-09-15 | 1150 | A_confirm | Hungary |
| 323 | 2026-09-15 | 1151 | A_confirm | Austria |
| 319 | 2026-09-17 | 1127 | A_confirm | Greece |
| 342 | 2026-09-17 | 1294 | A_confirm | Hungary |
| 346 | 2026-09-17 | 1317 | A_confirm | Hungary |
| 351 | 2026-09-20 | 1339 | A_confirm | Austria |
| 352 | 2026-09-20 | 1341 | A_confirm | Hungary |
| 361 | 2026-09-20 | 1360 | A_confirm | Greece |
| 364 | 2026-09-22 | 1369 | A_confirm | Austria |

65 γραμμές / 63 παραγγελίες. Το SQL της λίστας: `docs/grok-bot/reviews/2026-09-22-ροή-τιμολόγηση-grok.md` (συνέχεια, Grok 21:20).

## Έλεγχος προόδου (SELECT, όποιος θέλει)
```sql
SELECT count(*) AS blocked_orders
FROM orders o JOIN pl_v_order_gate g ON g.order_rec = o.legacy_id
WHERE o.deleted_at IS NULL AND o.status = 'Delivered'
  AND coalesce(o.invoiced,false) = false AND coalesce(o.pallet_exchange,false) = true
  AND g.sheets_ok IS FALSE;
```
22/9 21:20: 63. Στόχος 25/9: 0.
