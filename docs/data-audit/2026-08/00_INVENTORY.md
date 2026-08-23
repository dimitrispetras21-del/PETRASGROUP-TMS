# 00 — ΑΠΟΓΡΑΦΗ: τι υπάρχει στη βάση

**Ημερομηνία audit:** 2026-08-22 10:38 UTC
**Πηγή:** παραγωγική Supabase (`gatejgbpyodlepkvqkgf`) μέσω PostgREST με `service_role`
**Τρόπος:** αποκλειστικά `GET`. Καμία εγγραφή, καμία διαγραφή, καμία αλλαγή κώδικα.
**Repo state:** `72732c1`, working tree καθαρό.

> Αυτό το έγγραφο **δεν βγάζει συμπεράσματα**. Καταγράφει πλήθη, εύρη και
> συγγραφείς. Οι σημαίες στο τέλος είναι δείκτες προς το `01_INTEGRITY.md`,
> όχι ευρήματα.

---

## 1. Το παράθυρο των 10 ημερών — ορίζεται από τα ίδια τα δεδομένα

Το `min(created_at)` του πίνακα `orders` είναι **2026-08-12**. Δεν υπάρχει
ούτε μία παραγγελία παλαιότερη. Στον προηγούμενο έλεγχο (12/8, ίδια βάση)
ο πίνακας είχε **151 εγγραφές**· σήμερα έχει **95**, όλες γεννημένες από
12/8 και μετά.

**Άρα:** έγινε καθαρισμός των προ-παραγωγικών δεδομένων στις 12/8 και η
παραγωγική περίοδος είναι **12/08/2026 → 22/08/2026**. Όλες οι στήλες
«10ήμερο» παρακάτω μετρούν `created_at >= 2026-08-12T00:00:00Z`.

Ημέρες με δραστηριότητα: 12, 13, 14, 17, 18, 19, 20, 21, 22 Αυγούστου.
Κενά: 15–16/8 (Σαββατοκύριακο + Δεκαπενταύγουστος).

---

## 2. ΡΟΗ ΦΟΡΤΙΩΝ

| Πίνακας | Σύνολο | Ενεργά | Soft-del | 10ήμερο | Εύρος `created_at` |
|---|---:|---:|---:|---:|---|
| `orders` | **95** | 90 | 5 | **95** | 2026-08-12 → 2026-08-21 |
| `order_stops` | **282** | 266 | 16 | **282** | 2026-08-12 → 2026-08-21 |
| `national_loads` | 21 | 19 | 2 | 21 | 2026-08-12 → 2026-08-19 |
| `partner_assignments` | 21 | 20 | 1 | 20 | 2026-07-24 → 2026-08-21 |
| `national_orders` | **0** | 0 | 0 | 0 | — |
| `groupage_lines` | **0** | 0 | 0 | 0 | — |
| `consolidated_loads` | **0** | 0 | 0 | 0 | — |
| `cons_load_source_orders` | **0** | — | — | — | — |

**Σύνθεση των 95 παραγγελιών:**

| Πεδίο | Τιμές |
|---|---|
| `order_type` | `International` × 95 (100%) |
| `brand` | `Petras Group` × 95 (100%) |
| `veroia_switch` | `true` × **20** · `false` × 75 |
| `national_groupage` | `false` × **95** (καμία) |

**Ρυθμός δημιουργίας ανά ημέρα**

| | 12/8 | 13/8 | 14/8 | 17/8 | 18/8 | 19/8 | 20/8 | 21/8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `orders` | 17 | 34 | 3 | 12 | 3 | 17 | 0 | 9 |
| `order_stops` | 50 | 110 | 12 | 32 | 6 | 53 | 0 | 19 |
| `national_loads` | 3 | 10 | 2 | 1 | 0 | 5 | 0 | 0 |

---

## 3. DAILY OPS

| Πίνακας | Σύνολο | Ενεργά | Soft-del | 10ήμερο | Εύρος |
|---|---:|---:|---:|---:|---|
| `ramp` | 30 | 30 | 0 | **2** | 2026-07-24 → 2026-08-12 |
| `local_moves` | **0** | 0 | 0 | 0 | — |
| `RAMP_EVENTS` | *δεν υπάρχει στο backend* | | | | |

---

## 4. ΠΟΡΟΙ

| Πίνακας | Σύνολο | Ενεργά | Soft-del | 10ήμερο | Εύρος |
|---|---:|---:|---:|---:|---|
| `clients` | 1.920 | 1.920 | 0 | 2 | 2026-07-21 → 2026-08-17 |
| `locations` | 1.192 | 1.185 | 7 | 28 | 2026-07-21 → 2026-08-21 |
| `partners` | 432 | 432 | 0 | 1 | 2026-07-21 → 2026-08-12 |
| `drivers` | 59 | 59 | 0 | 2 | 2026-07-21 → 2026-08-12 |
| `trucks` | 46 | **36** | **10** | 0 | 2026-07-21 → 2026-08-06 |
| `trailers` | 42 | 40 | 2 | 0 | 2026-07-21 → 2026-08-06 |
| `users` | 17 | — | — | 0 | 2026-07-22 → 2026-07-27 |

---

## 5. ΠΑΡΑΠΛΕΥΡΑ

| Πίνακας | Σύνολο | Ενεργά | Soft-del | 10ήμερο | Εύρος |
|---|---:|---:|---:|---:|---|
| `maint_history` | 1.095 | 1.091 | 4 | **0** | 2026-08-06 → 2026-08-06 |
| `workshops` | 72 | 70 | 2 | 0 | 2026-07-22 → 2026-08-06 |
| `maint_req` | 1 | 1 | 0 | 0 | 2026-07-21 |
| `maint_plan` / `maint_plan_status` | 0 | 0 | 0 | 0 | — |
| `pl_movements` | 29 | — | — | 28 | 2026-08-10 → **2026-08-13** |
| `pallet_ledger_suppliers` | **0** | 0 | 0 | 0 | — |
| `pallet_ledger_partners` | **0** | 0 | 0 | 0 | — |
| `fuel` | **0** | 0 | 0 | 0 | — |
| `scan_examples` | 2 | **0** | 2 | 0 | 2026-08-09 |

Όλες οι 1.095 εγγραφές `maint_history` έχουν `created_at = 2026-08-06`:
είναι η μαζική μεταφορά, όχι καταχώρηση χρήστη.

**Trip Costs (ct_\*)** — το σχήμα υπάρχει, δεδομένα δεν υπάρχουν:
`ct_settings` 5 (seeds) · `ct_v_wear_rate` 46 (view πάνω σε στόλο) ·
`ct_cost_docs`, `ct_cost_lines`, `ct_round_trips`, `ct_rt_legs`,
`ct_plate_aliases` = **0**. Άρα `ct_v_rt_pnl`, `ct_v_rt_costs`,
`ct_v_rt_revenue`, `ct_v_consumption` επιστρέφουν όλα **0 γραμμές**.

**Views παλετών:** `pl_v_balance_clients` 6 · `pl_v_client_locations` 16 ·
`pl_v_balance_partners` **0**.

---

## 6. ΣΥΣΤΗΜΑ

| Πίνακας | Σύνολο | 10ήμερο | Εύρος |
|---|---:|---:|---|
| `audit_log` | 2.791 | **1.303** | 2026-07-22 → **2026-08-22** |
| `app_errors` | 1.182 | 323 | 2026-07-28 → 2026-08-21 |

> **`AT-1` ΔΕΝ ΙΣΧΥΕΙ.** Ο ισχυρισμός ότι το ίχνος σταμάτησε στις 28/7 είναι
> λάθος. Το `audit_log` γράφει συνεχώς, με τελευταία εγγραφή **σήμερα**.
> Οι 10 μέρες παραγωγής έχουν πλήρες ίχνος 1.303 εγγραφών. Αυτό **μειώνει**
> τη σοβαρότητα κάθε επόμενου ευρήματος: ό,τι έγινε, καταγράφηκε.

---

## 7. ΠΟΙΟΣ ΕΓΡΑΨΕ — από το `audit_log`, 10ήμερο

| Χρήστης | Ρόλος | Εγγραφές | % |
|---|---|---:|---:|
| `kelesmitos` | dispatcher | **1.068** | 82% |
| `pantelis` | dispatcher | 143 | 11% |
| `dimitris` | owner | 86 | 7% |
| `thodoris` | management | 6 | <1% |

Καμία εγγραφή από `sotiris` (dispatcher), `eirini`/`alexia` (accountant),
κανέναν `demo_*` ή `stg_*` λογαριασμό.

**Ανά πίνακα και ενέργεια**

| Πίνακας · ενέργεια | Ποιος |
|---|---|
| `orders` · create | kelesmitos 94 · pantelis 5 · dimitris 3 = **102** |
| `orders` · update | kelesmitos 390 · pantelis 83 · dimitris 35 · thodoris 3 = 511 |
| `orders` · cascade_delete | kelesmitos 3 · dimitris 3 · pantelis 1 = **7** |
| `order_stops` · create | kelesmitos 280 · pantelis 14 · dimitris 11 = **305** |
| `order_stops` · update | kelesmitos 171 · pantelis 10 · dimitris 8 = 189 |
| `order_stops` · delete | kelesmitos 11 · dimitris 11 = **22** |
| `national_loads` · create / update / delete | 22 / 12 / **3** |
| `partner_assignments` · create / update / delete | 20 / 20 / 1 |
| `pl_movements` · create / delete | **34** / 4 |
| `locations` · create / update | 28 / 9 |
| `clients` · create | kelesmitos 2 |
| `partners` · create | kelesmitos 1 |
| `drivers` · create / update | thodoris 2 / dimitris 6 |
| `ramp` · create | pantelis 2 |
| `trucks` · update | dimitris 1 |

**Ανά ημέρα**

| Ημέρα | kelesmitos | pantelis | dimitris | thodoris | Σύνολο |
|---|---:|---:|---:|---:|---:|
| 12/8 | 161 | 70 | 53 | 6 | 290 |
| 13/8 | 325 | 24 | 28 | — | 377 |
| 14/8 | 38 | — | 5 | — | 43 |
| 17/8 | 199 | 7 | — | — | 206 |
| 18/8 | 43 | 4 | — | — | 47 |
| 19/8 | 160 | 5 | — | — | 165 |
| 20/8 | 28 | 1 | — | — | 29 |
| 21/8 | 114 | 4 | — | — | 118 |
| 22/8 | — | 28 | — | — | 28 |

---

## 8. ΔΗΛΩΜΕΝΟΙ ΑΛΛΑ ΑΝΥΠΑΡΚΤΟΙ ΠΙΝΑΚΕΣ

Επτά κλειδιά του `TABLES` (config.js) **δεν αντιστοιχίζονται** σε κανέναν
πίνακα του Worker (`worker/src/index.js` γνωρίζει 22). Κάθε κλήση τους
επιστρέφει `404 Table not available on this backend`.

| Κλειδί | Τιμή | Αναφορές στο front end |
|---|---|---|
| `TRIP_COSTS` | `tblWUus6uSpqE1LMW` | **1** — `modules/ceo_dashboard.js` |
| `METRICS_SNAPSHOTS` | `tblakFiR37kf4uQXy` | **3** — `core/metrics.js` |
| `SCAN_TRAINING` | `''` (κενό) | **4** — `core/scan-helpers.js` |
| `TRIPS` | `tblgoyV26PBc6L9uE` | 0 |
| `NAT_TRIPS` | `tbloI9yAxxyOJpMyr` | 0 |
| `DRIVER_LEDGER` | `tblZVr4BCr9sGFf8n` | 0 |
| `RAMP_EVENTS` | `tbllHu40WSq4yWg5S` | 0 |

**Επιβεβαιωμένο διπλό κλειδί:** το `SCAN_TRAINING` δηλώνεται **δύο φορές**
στο ίδιο object literal — `config.js:79` ως `'tblScanTraining000'` και
`config.js:85` ως `''`. Στη JavaScript κερδίζει το δεύτερο, άρα η τιμή
είναι κενή. Δεν βρέθηκε άλλο διπλό κλειδί στο `TABLES`.
Το `PALLET_LEDGER` και το `PALLET_LEDGER_SUPPLIERS` μοιράζονται σκόπιμα
την ίδια τιμή (`tblAAH3N1bIcBRPXi`) — alias, όχι σφάλμα.

---

## 9. ΣΤΑΥΡΩΤΟΣ ΕΛΕΓΧΟΣ ΠΛΗΘΩΝ

Το `audit_log` πρέπει να εξηγεί το περιεχόμενο κάθε πίνακα.

| Πίνακας | creates | deletes | Αναμενόμενο | Πραγματικό | Διαφορά |
|---|---:|---:|---:|---:|---:|
| `orders` | 102 | 7 | 95 | **95** | **0** ✓ |
| `national_loads` | 22 | 3 | 19–22 | **21** | 0 ✓ |
| `partner_assignments` | 20 | 1 | 19–21 | 21 | 0 ✓ (+1 προ 12/8) |
| `order_stops` | 305 | 22 | 283 | **282** | **−1** |
| `pl_movements` | 34 | 4 | 30 | **29** | **−1** (+ 6 αταίριαστα) |

Οι δύο τελευταίες γραμμές δεν κλείνουν. Πάνε στο `01_INTEGRITY.md`.

---

## 10. ΣΗΜΑΙΕΣ ΓΙΑ ΤΟ ΕΠΟΜΕΝΟ ΕΓΓΡΑΦΟ

Δεν είναι ευρήματα — είναι μετρήσεις που απαιτούν ανάλυση:

1. ~~20 παραγγελίες με `veroia_switch = true`, 0 στο `national_orders`.~~
   **ΚΛΕΙΣΤΟ — δεν είναι εύρημα.** Βλ. §12.
2. ~~Ολόκληρη η εθνική ροή είναι άδεια.~~
   **ΚΛΕΙΣΤΟ ως προς `national_orders`** (σχεδιασμός v2, §12). Παραμένει
   ανοιχτό μόνο το ερώτημα γιατί `local_moves` = 0 ενώ ο πίνακας υπάρχει.
3. **`order_stops`: 22 delete στο audit, 16 `deleted_at`, 23 γραμμές
   λείπουν.** Soft και hard delete συνυπάρχουν στον ίδιο πίνακα.
4. **`pl_movements`: 34 creates καταγεγραμμένα, 28 γραμμές στο παράθυρο.**
   Και σταμάτησε στις 13/8 ενώ η υπόλοιπη χρήση συνεχίστηκε ως 22/8.
5. **`ramp` 2 εγγραφές, `local_moves` 0, `fuel` 0, `maint_history` 0 νέες.**
   Τα Daily Ops υποσυστήματα δεν χρησιμοποιήθηκαν παραγωγικά.
6. ~~`sotiris` δεν έγραψε ποτέ.~~ **ΚΛΕΙΣΤΟ — δεν είναι εύρημα.**
   Η περίοδος αφορά αποκλειστικά διεθνείς παραγγελίες· ο `sotiris` καλύπτει
   το εθνικό σκέλος, που δεν έχει ξεκινήσει (owner 22/8).
7. **`trucks`: 10 soft-deleted** (όχι 12 όπως αναφέρθηκε) — ο έλεγχος
   ορφανών αναφορών γίνεται στο `01`.

---

## 11. ΤΙ ΔΕΝ ΑΠΟΓΡΑΦΗΚΕ ΚΑΙ ΓΙΑΤΙ

- **Storage buckets** (δελτία παλετών, φωτογραφίες CMR): δεν ελέγχθηκαν —
  απαιτούν Storage API, εκτός PostgREST.
- **Εγγραφές που διαγράφηκαν οριστικά πριν τις 22/7** (έναρξη `audit_log`):
  δεν υπάρχει ίχνος, δεν ανακτώνται.
- **Το τι έδειχνε η οθόνη** τη στιγμή της καταχώρησης: το `audit_log`
  κρατά `after_data` αλλά **`before_data = NULL` σε κάθε `update`** —
  αναλύεται στο `01`.
- **`localStorage` των χρηστών** (cache 30 λεπτών, scan training σε
  τοπική λειτουργία): δεν είναι προσβάσιμο από εδώ.

---

## 12. ΔΙΕΥΚΡΙΝΙΣΗ OWNER (22/08/2026) + ΕΠΑΛΗΘΕΥΣΗ ΣΤΟΝ ΚΩΔΙΚΑ

> «Ξεκινήσαμε με την καταχώρηση μόνο διεθνών παραγγελιών (γι αυτό ο Σωτήρης
> δεν καταχωρεί). Είναι σωστό που δεν δημιουργούνται national orders, μιας
> και δεν είναι πραγματικό order (εμείς το σπάμε σε 2 leg). Στην
> πραγματικότητα η τιμολόγηση θα τιμολογήσει μόνο το international order.»

### Ο κώδικας συμφωνεί — δεν πρόκειται για σιωπηλή αποτυχία

| Απόδειξη | Τι λέει |
|---|---|
| `modules/orders_intl.js:853-856` | `// Veroia Switch → sync directly to NAT_LOADS (v2)` · `VS ON → create/update NAT_LOADS` · `VS OFF → delete NAT_LOADS + GL + CL + RAMP cascade` |
| `modules/orders_intl.js:1662` | `// Sync Veroia Switch → NAT_LOADS (direct, no intermediate NAT_ORDERS)` |
| `ARCHITECTURE.md:12` | `NAT_ORDERS … National orders (direct only, **NOT for VS**)` |

Η απουσία των `national_orders` είναι **ρητή σχεδιαστική απόφαση v2**, όχι
αποτυχία. Το Veroia Switch γράφει κατευθείαν στο `national_loads`.

### Και η αλυσίδα v2 είναι καθαρή — επαληθεύτηκε εγγραφή προς εγγραφή

| Έλεγχος | Αποτέλεσμα |
|---|---|
| Ενεργές `orders` με `veroia_switch=true` | **19** |
| Ενεργά `national_loads` | **19** |
| VS orders **χωρίς** `national_load` | **0** |
| `national_loads` **χωρίς** γονική VS order | **0** |
| Σύνδεσμος | `national_loads.source_order_id` → `orders.id`, 21/21 συμπληρωμένος |

Τα δύο soft-deleted ζεύγη έκλεισαν σωστά:
- `recUna5rFEmrLa2BD` — η γονική παραγγελία (id 194) διαγράφηκε, το load
  ακολούθησε.
- `recEjq06Fpxa2JDwm` — ο dispatcher ξετσέκαρε το Veroia Switch (id 227,
  `veroia_switch=false`), το load σβήστηκε από το cascade.

**Η ροή VS → NAT_LOADS δουλεύει σωστά σε 21 από 21 περιπτώσεις.**

### Τι μένει ανοιχτό από αυτή τη διευκρίνιση

1. **`source_type` = `Direct` σε 21/21 εγγραφές.** Το σχόλιο
   `orders_intl.js:855` υπόσχεται `VS`, ο κώδικας
   (`orders_intl.js:1054`) γράφει `Direct`. Συνέπεια: **από τα δεδομένα
   δεν ξεχωρίζει ποιο national load γεννήθηκε αυτόματα από Veroia Switch και
   ποιο έφτιαξε dispatcher στο χέρι.** Πάει στο `03`.
2. **`CLAUDE.md:136` περιγράφει ακόμη το v1**
   (`ORDERS (Veroia Switch=ON) → NATIONAL ORDERS (auto-created)`).
   Αντιφάσκει με τον κώδικα και με το `ARCHITECTURE.md`.
3. **`core/ai-chat.js:652` και `:657` διδάσκουν το v1 στους χρήστες:**
   «Veroia Switch: Toggle ON to **auto-create National Order**». Ο dispatcher
   που ρωτά τον βοηθό μέσα στην εφαρμογή παίρνει λάθος μοντέλο. Πάει στο `02`.
4. **Η τιμολόγηση:** ο owner δηλώνει ότι τιμολογείται **μόνο** το
   international order. Το `modules/invoicing.js:266` εξακολουθεί να
   ρωτά το `NAT_ORDERS` για `Status=Delivered`. Σήμερα ακίνδυνο (0
   γραμμές) — επαληθεύεται στο `02` ότι δεν διπλομετρά.
