# Κύκλωμα «Παλέτες» — χάρτης, μετρήσεις 7/9/2026

Πηγές: `docs/PALLETS_ARCHITECTURE.md` (Φ1, 10/8) + `docs/PALLETS_F2_FEEDERS.md` (Φ2, 12/8). Μόνο ανάγνωση.

## 1. Πίνακες — τι έχει ζωντανές γραμμές

| Πίνακας | Γραμμές | Κατάσταση |
|---|---|---|
| `pl_movements` | 95 (60 pending LOADING, 32 confirmed DELIVERY, 2 confirmed LOADING, 1 reversed) | **ok** — ζωντανό ημερολόγιο Φ1/Φ2 |
| `pallet_ledger_suppliers` | 0 | **unused** — παλιός πίνακας (pre-Φ1), μόνος στόχος του OCR upload σήμερα |
| `pallet_ledger_partners` | 0 | **unused** — ίδιο |
| `scan_examples` | 2, **και οι δύο** soft-deleted δοκιμαστικές (`client_id='recTEST'`, `"ΔΟΚΙΜΗ"`) | **unused** — καμία πραγματική διόρθωση ποτέ |
| `pl_v_order_gate` (view) | 128 | **ok** — τροφοδοτεί το gate τιμολόγησης |
| `pl_v_balance_clients` (view) | 9 σειρές (1 με μη-μηδενικό υπόλοιπο) | **ok** |
| `pl_v_balance_partners` (view) | 0 | συνέπεια του Ε2 παρακάτω — καμία partner κίνηση να δώσει υπόλοιπο |
| `ct_v_rt_pallet_gate` (view) | 0 | **partial** — ζωντανό endpoint, αδοκίμαστο |
| bucket `pallet-sheets` | υπάρχει (`storage.buckets`) | ok, αλλά 0/95 κινήσεις έχουν `sheet_url` (μόνο 3 `sheet_source='MANUAL'`) |

## 2. Οθόνες → τι γράφουν/διαβάζουν

- **`modules/orders_intl.js:2097`, `modules/orders_natl.js:1466`** (αποθήκευση order) → `plOnOrderSaved` (`core/pallet-feed.js:51-96`) → **POST/PATCH/DELETE `pl_movements`** pending LOADING, μία ανά στάση φόρτωσης όταν `Pallet Exchange=true`. Idempotent (ελέγχει `order_stop_rec` πριν δημιουργήσει). **ok** — 60 pending + 2 confirmed LOADING υπάρχουν.
- **`modules/daily_ops.js:782,926`** (status → Delivered) → `plOnDelivered` (`core/pallet-feed.js:99-125`) → confirmed DELIVERY net 0 ανά στάση παράδοσης, χωρίς δελτίο. **ok** — 32 confirmed DELIVERY.
- **`modules/weekly_intl.js:2869,2879,2994`** (ανάθεση partner σε VS παραγγελία) → `plOnIntlPartnerAssigned` (`core/pallet-feed.js:128-177`) → PARTNER_PICKUP/DROPOFF pending. **broken/αναπόδεικτο** — 0 τέτοιες κινήσεις σε ολόκληρη τη βάση, ενώ υπάρχει τουλάχιστον 1 επιλέξιμη παραγγελία (id 175: Delivered, Export, Pallet Exchange+Veroia Switch+Partner Trip, partner_id 207) που δεν έχει καμία partner κίνηση καταγεγραμμένη.
- **`modules/orders_intl.js:934`** «Δελτίο παλετών →» → `openPalletUpload` (`modules/pallet_upload.js:30`) → AI OCR (Claude Sonnet) εξάγει ποσότητες → **`atCreate(TABLES.PALLET_LEDGER)`** (`pallet_upload.js:556`) γράφει στο `pallet_ledger_suppliers`/`partners`, **ΟΧΙ** στο `pl_movements`. Πατά επίσης `PATCH orders`/`order_stops` για τα flags `pallet_sheet_1/2_uploaded` / `pallet_sheet_ok` (αυτά ΓΡΑΦΟΝΤΑΙ κανονικά — mapped στον Worker). Το ίδιο το ποσοτικό αποτέλεσμα καταλήγει σε πίνακα με 0 γραμμές συνολικά: **broken** — ορατό κουμπί, νεκρή διαδρομή δεδομένων. Το Φ5 (spec: «ενσωμάτωση pallet_upload AI → pl_movements») δεν έχει υλοποιηθεί.
- **`modules/pallet_ledger.js`** (σελίδα «Ισοζύγιο Παλετών», μενού `core/router.js:69`): `renderPalletLedger` διαβάζει `/pallets/movements`+`/pallets/lookups`+`/pallets/balances` (γραμμές 19-33). Καρτέλα «Εκκρεμείς» + modal επιβεβαίωσης (γρ. 799-928) → `POST .../confirm`. «Διόρθωση ανταλλαγής» (Lidl, γρ. 979-1010) → `POST .../reverse` με replacement. Φόρμα «+ Νέα κίνηση» (γρ. 433, 1097-1101) καλύπτει RETURN_OUT/IN/PARTNER_*/ADJUSTMENT. **ok** — πλήρες Φ2, χρησιμοποιείται (60 pending αναμένουν εδώ).

## 3. Gates (Φ4)

- **Τιμολόγηση** (`modules/invoicing.js:136-146,257`): `GET /pallets/gate?order_recs=` → `pl_v_order_gate` (Worker `index.js:3510-3521`) → μπλοκάρει το checkbox «Invoiced» όταν λείπει δελτίο φόρτωσης. `POST /pallets/override` (owner-only, γρ. 3494-3509) καταγράφει παράκαμψη με αιτιολογία στο `app_errors`/audit. **ok**, αποδεδειγμένα (128 gate-εγγραφές).
- **Partner PnL** (`modules/costs.js:175`): `GET /costs/pallet-gate` → `ct_v_rt_pallet_gate` (Worker `index.js:3104-3112`). Ζωντανό endpoint, αλλά **0 σειρές πάντα** — δεν υπάρχει καμία partner κίνηση να δείξει. Δεν προκύπτει αν το μπλοκάρισμα δουλεύει στην πράξη, γιατί ποτέ δεν δοκιμάστηκε με πραγματικά δεδομένα.

## 4. Δικαιώματα (Worker `PL_PERMS`, `index.js:3179-3198`)

owner/dispatcher: πλήρες CRUD+confirm+reverse. warehouse: GET/POST/PATCH+confirm (όχι DELETE, όχι reverse). accountant: GET/POST/PATCH+confirm+reverse (όχι DELETE, όχι ADJUSTMENT — επιβάλλεται server-side, γρ. 3356-3358). management: μόνο GET (movements/balances/gate/lookups). Ταιριάζει με το spec §4 (Αλεξία=accountant κύριος χειριστής, dispatchers backup).

## 5. Ασυνέπειες / νεκρός κώδικας

1. **Δύο ασύνδετες διαδρομές δεδομένων για το ίδιο πράγμα**: το χειροκίνητο upload γράφει σε `pallet_ledger_*` (0 γραμμές, κανείς δεν το διαβάζει — τα gates/balances διαβάζουν αποκλειστικά `pl_movements`/views). Ο χρήστης βλέπει «αποθηκεύτηκε» αλλά η κίνηση δεν εμφανίζεται πουθενά στο Ισοζύγιο ή στο gate τιμολόγησης.
2. **Ο feeder partner δεν έχει αποδειχθεί ποτέ** — 0 PARTNER_PICKUP/DROPOFF σε 95 κινήσεις, παρότι υπάρχει επιλέξιμη παραγγελία. Δεν προκύπτει αν η ανάθεση του order 175 έγινε πριν το deploy του feeder (12/8) ή αν ο κώδικας δεν πυροδοτείται σωστά από το `weekly_intl.js`.
3. **Sheet σχεδόν ποτέ δεν επισυνάπτεται**: 0/95 κινήσεις με `sheet_url`, μόνο 3 με `sheet_source='MANUAL'` (αριθμοί χωρίς αρχείο) — το bucket `pallet-sheets` υπάρχει αλλά ουσιαστικά αχρησιμοποίητο.
4. **scan_examples** (η μνήμη του AI OCR) δεν έχει καμία πραγματική εγγραφή — 2/2 δοκιμαστικές, διαγραμμένες.

## Ερωτήσεις για τον owner

1. Το `pallet_upload.js` (OCR) να ξαναγραφεί ώστε να στέλνει `POST /pallets/movements` αντί για τον νεκρό πίνακα `PALLET_LEDGER`, ή μένει σκόπιμα εκτός μέχρι τη Φ5;
2. Γιατί δεν έχει γραφτεί ποτέ καμία partner κίνηση παλετών (feeder του weekly_intl) — να το ελέγξουμε ζωντανά με μια νέα ανάθεση VS+Partner;
3. Θέλεις ειδοποίηση όταν οι pending κινήσεις μένουν πολύ καιρό (η παλαιότερη σήμερα είναι 26 ημερών);
4. Οι νεκροί πίνακες `pallet_ledger_suppliers/partners` να μείνουν «άθικτοι» όπως λέει το spec, ή τους κάνουμε DROP τώρα που επιβεβαιώθηκε ξανά ότι είναι άδειοι;
5. Το `scan_examples`/few-shot training να ενεργοποιηθεί (πραγματική καταγραφή διορθώσεων) ή να αφαιρεθεί ο μηχανισμός αφού δεν χρησιμοποιείται;
