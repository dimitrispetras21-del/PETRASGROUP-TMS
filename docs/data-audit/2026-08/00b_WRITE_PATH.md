# 00b — ΦΤΑΝΕΙ ΟΤΙ ΓΙΝΕΤΑΙ ΣΤΟ FRONT END ΣΤΟ BACKEND;

**Ερώτημα owner (22/08/2026):** «Θέλω να ΞΕΡΩ αν οτιδήποτε γίνεται στο
frontend μεταφέρεται στο backend. Θέλω να δεις όλα τα error log όλων των
account και θέλω να δούμε αν μένουν κενοί πίνακες/στήλες ή δεν μεταφέρονται
σωστά δεδομένα στους πίνακες.»

**Read-only.** Καμία εγγραφή, καμία αλλαγή κώδικα. Πηγή: `app_errors`
(1.186 εγγραφές, όλες), `audit_log`, ανάλυση πληρότητας στηλών, ανάγνωση
`worker/src/index.js`.

## ΑΠΑΝΤΗΣΗ ΣΕ ΜΙΑ ΓΡΑΜΜΗ

**Όχι — υπάρχει ένα πεδίο που ο χρήστης βλέπει να αποθηκεύεται και δεν
αποθηκεύεται ποτέ.** Ο μηχανισμός που το επιτρέπει είναι γενικός: ο Worker
**πετάει σιωπηλά** κάθε πεδίο που δεν αναγνωρίζει και απαντά `200 OK`.

---

## ΤΟ ΣΦΑΛΜΑ-ΜΗΧΑΝΙΣΜΟΣ

`worker/src/index.js` → `fieldsToColumns()`:

```js
for (const [label, value] of Object.entries(fields)) {
  const column = cfg.fields[label] || (cfg.aliases || {})[label];
  if (column) row[column] = value;      // ← άγνωστο label: ΚΑΜΙΑ ενέργεια
}
```

Δεν υπάρχει `else`. Ούτε σφάλμα, ούτε `console.warn`, ούτε καταγραφή.
Το `handleFacadeUpdate` γυρίζει `200` με το ενημερωμένο record.

Το μόνο δίχτυ είναι στο `handleFacadeUpdate`: αν **όλα** τα πεδία είναι
άγνωστα, `patch` = `{}` → `400 No writable fields`. **Αν έστω ένα πεδίο
είναι γνωστό, το αίτημα πετυχαίνει και τα υπόλοιπα εξαφανίζονται.**

Το ίδιο ισχύει στην ανάγνωση με άλλη μορφή: άγνωστο label μέσα σε
`filterByFormula` → `resolveColumn()` πετάει `UnsupportedFilter` →
`422 Unsupported query for this table`.

---

## ΕΥΡΗΜΑ WP-1 · `VS CD Date` — P0 · **ΜΗ ΑΝΑΣΤΡΕΨΙΜΟ**

**Τι:** Η ημερομηνία άφιξης στο Cross-Dock Βέροιας δεν αποθηκεύτηκε **ποτέ**,
σε καμία παραγγελία, ενώ η οθόνη δείχνει ότι αποθηκεύτηκε.

**Απόδειξη:**

| | |
|---|---|
| Ο Worker **δεν γνωρίζει** το label | `tblgHlNmLBH3JTdIM` config (154 γραμμές): `grep "VS CD Date"` → **0**. Υπάρχει μόνο `"Cross-dock Date": "cross_dock_date"` |
| Το front end το γράφει | `modules/daily_ops.js:586` → `patch['VS CD Date']=localToday()` |
| …μαζί με το `Status` | `daily_ops.js:585` — άρα το `Status` περνά, το `VS CD Date` πέφτει, HTTP `200` |
| …και μετά ψεύδεται στην οθόνη | `daily_ops.js:589` → `r.fields['VS CD Date']=patch['VS CD Date']` ενημερώνει το **τοπικό** αντικείμενο |
| Και δεύτερο σημείο εγγραφής | `weekly_intl.js:762`, `:1157`, `:1179` — ο χρήστης κάνει κλικ στην ημερομηνία CD για να τη διορθώσει |
| Αποτέλεσμα στη βάση | `orders.vs_cd_date` = **NULL σε 90/90** ενεργές, **19/19** Veroia Switch |

**Πόσα:** 19 παραγγελίες Veroia Switch σε 10 μέρες. Κάθε φορά που ο
dispatcher πέρασε «In Transit» ή διόρθωσε την ημερομηνία CD, η τιμή χάθηκε.

**Τι χαλάει:** Ο dispatcher βλέπει την ημερομηνία στην οθόνη, φεύγει από τη
σελίδα, γυρίζει — κενή. Το Weekly Intl δείχνει μόνιμα την **εκτίμηση**
(`Loading+1`) αντί για την πραγματική άφιξη.

**Αιτία:** Το πεδίο προστέθηκε στο front end (owner 10/8) και **δεν
προστέθηκε ποτέ στον χάρτη πεδίων του Worker**. Το ίδιο το
`daily_ops.js:58` το ομολογεί: *«Πριν το worker deploy του VS CD Date το νέο
φίλτρο μπορεί να απορριφθεί»*. Ο deploy δεν έγινε ποτέ.

**Αναστρέψιμο;** **ΟΧΙ.** Οι πραγματικές ημερομηνίες άφιξης στο cross-dock
δεν γράφτηκαν πουθενά — ούτε στο `audit_log` (το `after_data` κρατά μόνο
ό,τι γράφτηκε όντως). Χάθηκαν. Ανακτώνται μόνο από τον άνθρωπο που τις ξέρει.

---

## ΕΥΡΗΜΑ WP-2 · Το Daily Ops πέφτει σιωπηλά σε παλιό φίλτρο — P1

**Τι:** Κάθε φόρτωση του Daily Ops αποτυγχάνει, πιάνεται από `catch` και
ξαναζητά τα δεδομένα **χωρίς τον κανόνα του Veroia Switch**.

**Απόδειξη:** `modules/daily_ops.js:48` στέλνει
`IS_SAME({VS CD Date},…)` → 422 → `:57-65` `catch` → `dayFOld`, που έχει μόνο
`Loading DateTime` και `Delivery DateTime`.

**Πόσα:** **148 σφάλματα `Unsupported query for this table`** στο 10ήμερο —
το πολυπληθέστερο σφάλμα του συστήματος. Σε **kelesmitos, pantelis, dimitris**.
Τελευταίο: **22/08 10:44**, δηλαδή συνεχίζεται τώρα.

| Ημέρα | 12/8 | 13/8 | 14/8 | 17/8 | 18/8 | 19/8 | 20/8 | 21/8 | 22/8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Πλήθος | 38 | 38 | 2 | 23 | 7 | 22 | 3 | 11 | 4 |

**Τι χαλάει:** Το διεθνές σκέλος μιας παραγγελίας VS **δεν εμφανίζεται στο
Daily Ops τη μέρα του Cross-Dock**. Η λειτουργία που ζητήθηκε στις 10/8 είναι
ανενεργή και κανείς δεν το ξέρει, γιατί η σελίδα «δουλεύει».

**Αιτία:** Το `catch` καταπίνει την αποτυχία με σχόλιο που την περιγράφει ως
προσωρινή. Δέκα μέρες αργότερα είναι η μόνιμη κατάσταση.

**Αναστρέψιμο;** Ναι — είναι θέμα εμφάνισης, όχι δεδομένων.

---

## ΕΥΡΗΜΑ WP-3 · 403 στη διαγραφή στάσης μέσα στην αποθήκευση — P1 · **ΕΚΛΕΙΣΕ**

**Τι:** Ο dispatcher αφαίρεσε στάση από παραγγελία· η διαγραφή απορρίφθηκε
με `403 Forbidden` **μέσα στη ροή αποθήκευσης**.

**Απόδειξη:**
```
atDelete(tblaeY5QOHAS1gyE8 = ORDER_STOPS, rectASDzP564IGsB0): Forbidden
  at atDelete (core/api.js:550)
  at async stopsSave (core/stops-helpers.js:95)
  at async submitIntlOrder (modules/orders_intl.js:1667)
```
`kelesmitos`, 13/08 05:50 · 05:51 · 05:52 · 05:54 — **τέσσερις προσπάθειες
στο ίδιο stop** (`Loading #3`, παραγγελία id 168).

**Πόσα:** 4 αποτυχίες + 3 όμοιες στις 12/8 από `pantelis` (τότε με το
ασαφές μήνυμα «Unknown Airtable error»).

**Κατάσταση σήμερα:** Το stop `rectASDzP564IGsB0` έχει
`deleted_at = 2026-08-13T07:51:12` — δύο ώρες μετά, πέρασε.
**Ορφανά stops σήμερα: 0. Ζόμπι stops σε διαγραμμένη παραγγελία: 0.**

**Αιτία:** Ο ρόλος `dispatcher` δεν είχε `DELETE` στο `order_stops` στο
RBAC του Worker. Διορθώθηκε με deploy μεταξύ 13/08 05:54 και 07:51.

**Αναστρέψιμο;** Ήδη έκλεισε μόνο του. Καμία εκκρεμότητα δεδομένων.

---

## ΕΥΡΗΜΑ WP-4 · `local_moves` επέστρεφε 404 δύο μέρες — P2 · **ΕΚΛΕΙΣΕ**

**Τι:** Το Weekly National απέτυχε να φορτώσει τις τοπικές κινήσεις.

**Απόδειξη:** 13 σφάλματα `safeFetch: weekly natl: local moves: Table not
available on this backend`, από `_wnLoadAll (weekly_natl.js:104)`.
Τελευταίο πραγματικό: **14/08 11:17:15**.
Ο Worker έγινε deploy στις **14/08 11:26:26 UTC** — εννέα λεπτά μετά.
Ένα μεμονωμένο σφάλμα στις 18/08 από `kelesmitos` αποδίδεται σε
Service-Worker cache παλιάς έκδοσης.

**Συνέπεια:** εξηγεί γιατί `local_moves` = **0 εγγραφές** — η λειτουργία ήταν
σπασμένη τις δύο πρώτες μέρες και μετά κανείς δεν την ξαναδοκίμασε.

**Αναστρέψιμο;** Ναι — τίποτα δεν χάθηκε, απλώς δεν καταχωρήθηκε.

---

## ΕΥΡΗΜΑ WP-5 · `deleteIntlOrder` δηλώνει αποτυχία σε κάθε διαγραφή — P2

**Τι:** Κάθε διαγραφή διεθνούς παραγγελίας εμφανίζει
`Order deleted (1 linked records failed — δες error log)`.

**Απόδειξη:** 5 εμφανίσεις — 12/08 (3 sub-deletes), 14/08, 18/08, 19/08,
**21/08 11:00** (1 sub-delete η καθεμία).

**Έλεγχος δεδομένων:** και οι 5 παραγγελίες ελέγχθηκαν εγγραφή προς εγγραφή.
Καμία δεν άφησε ενεργό stop· τα stops είναι όλα `deleted_at`.
**Πραγματική ζημιά: καμία.**

**Αιτία (πιθανή, χρειάζεται επιβεβαίωση):** το `orders_intl.js:2600` φιλτράρει
το `RAMP` με `FIND("rec…",ARRAYJOIN({Order},","))>0`, ενώ ο Worker σημειώνει
για το RAMP ότι *«Link fields ('Order','National Order','Trip','Driver',
'Truck') are NOT …»*. Ο μετρητής `_delFail` αυξάνεται και για αποτυχία
**ανάγνωσης**, όχι μόνο διαγραφής.

**Τι χαλάει:** Ο χρήστης βλέπει προειδοποίηση σε μια ενέργεια που πέτυχε.
Όταν όλα φαίνονται σπασμένα, κανείς δεν κοιτά όταν κάτι σπάσει στ' αλήθεια.

---

## ΕΥΡΗΜΑ WP-6 · «Missing fields in ORDERS: Status» — P2 · ψευδής συναγερμός

60 εμφανίσεις στο 10ήμερο, και στους τρεις λογαριασμούς. **Δεν είναι σφάλμα
χαρτογράφησης** — το `Status: "status"` υπάρχει κανονικά στον Worker
(γραμμή 23 του config).

Αιτία: ο facade παραλείπει τα `null` πεδία από την απάντηση
(`toAirtableRecord`), άρα μια παραγγελία με `status = NULL` γυρίζει **χωρίς
κλειδί `Status`**, και ο `_validateFields` το εκλαμβάνει ως εξαφανισμένο πεδίο.

**Πραγματικό υποκείμενο πρόβλημα:** **3 ενεργές παραγγελίες με `status = NULL`**
— `recfHqQy3hCMO4ibW` (19/8), `recKtBVE17hv2ZgNk` (19/8), `rec4gU12lrcvYYL4G` (21/8).
**Αναστρέψιμο:** ναι, με απόδοση status.

---

## ΕΥΡΗΜΑ WP-7 · Πεδία που εμφανίζονται στην οθόνη και κανείς δεν τα γράφει — P2

| Πεδίο | Εμφανίζεται | Γράφεται από | Τιμή στη βάση |
|---|---|---|---|
| `Carrier Type` | `orders_intl.js:576` («Carrier») | **πουθενά** | NULL σε 90/90 |
| `Invoice Status` | `orders_intl.js:591`, `utils.js:1249` | **πουθενά** | NULL σε 90/90 |
| `Ops Notes` | ζητείται στο `daily_ops.js:19` | **πουθενά** | NULL σε 90/90 |
| `Ops Status` | — | **πουθενά** | NULL σε 90/90 |

Ο χρήστης βλέπει «Carrier: —» και «Invoice Status: —» σε **κάθε** παραγγελία.
Δεν είναι ελλιπής καταχώρηση· δεν υπάρχει τρόπος να συμπληρωθούν.

---

## ΕΥΡΗΜΑ WP-8 · Πληρότητα στηλών — τι μένει κενό

**`orders` — 90 ενεργές γραμμές, 125 στήλες, 52 πάντα κενές (42%)**

| Ομάδα | Στήλες | Ερμηνεία |
|---|---|---|
| Τιμολόγηση | `invoice_status`, `invoice_number`, `invoice_date` | αναμενόμενο — δεν ξεκίνησε |
| Ops | `ops_status`, `ops_notes`, `carrier_type`, `high_risk_auto_flag` | **WP-7 — αγράφιστα** |
| Veroia | `vs_cd_date`, `veroia_crossdock_id` | **WP-1** / το cross-dock ζει στο `order_stops` |
| Groupage | `groupage_id` | αναμενόμενο — δεν χρησιμοποιήθηκε |
| Θέσεις 4–10 | 38 στήλες `*_location_*`, `*_pallets_*`, `*_datetime_*` | αναμενόμενο — flat legacy πεδία, το `order_stops` τα αντικατέστησε |

**Θέσεις 2–3 ελάχιστα γεμάτες:** `loading_location_2_id` 11%,
`loading_location_3_id` **1%**. Οι πραγματικές στάσεις είναι στο
`order_stops` (266 ενεργές για 90 παραγγελίες = **2,96 ανά παραγγελία**).
Τα flat πεδία είναι υπόλειμμα — μένουν συγχρονισμένα μόνο εν μέρει.

**`order_stops` — 266 γραμμές, 5/21 πάντα κενές:**
`notes`, `pallets_loaded`, `pallets_exchanged` (καμία αναφορά στο front end),
`national_order_id` (σωστό — v2), `deleted_at`.
`national_load_id` μόνο **16%** — 19 από 266 stops δείχνουν σε national load.

**`national_loads` — 19 γραμμές, 31/51 πάντα κενές:**
`truck_id`, `trailer_id`, `driver_id`, `partner_id` **όλα NULL** — κανένα
εθνικό σκέλος δεν έχει ανατεθεί σε όχημα ή οδηγό.
`source_type` = `'Direct'` σε 21/21, ενώ το σχόλιο `orders_intl.js:855`
υπόσχεται `'VS'`.

**`partner_assignments` — 20 γραμμές, 7/16 πάντα κενές:**
`payment_terms`, `notes`, `trips_text`, `trip_2_id`, `trip_3_id`,
`national_load_id`.

---

## ΤΟ ΠΛΗΡΕΣ ERROR LOG — 1.186 εγγραφές, όλοι οι λογαριασμοί

**Ανά λογαριασμό, όλη η ιστορία**

| Λογαριασμός | Ρόλος | Σφάλματα | Στο 10ήμερο |
|---|---|---:|---:|
| `dimitris` | owner | 632 | 90 |
| `kelesmitos` | dispatcher | 163 | **163** |
| `demo_dispatcher` | demo | 162 | 0 |
| `pantelis` | dispatcher | 137 | 74 |
| `thodoris` | management | 50 | 0 |
| `demo_owner` | demo | 39 | 0 |
| *(κενό)* | — | 3 | 0 |

Οι λογαριασμοί `demo_*` σταμάτησαν να παράγουν σφάλματα πριν τις 12/8 —
**το `AT-5` δεν συνεχίζεται.** Ο `sotiris`, η `eirini` και η `alexia` δεν
έχουν ούτε ένα σφάλμα, γιατί δεν μπήκαν καθόλου.

**Ανά ημέρα στο 10ήμερο**

| Ημέρα | 12/8 | 13/8 | 14/8 | 17/8 | 18/8 | 19/8 | 20/8 | 21/8 | 22/8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Σφάλματα | 181 | 48 | 15 | 27 | 14 | 23 | 3 | 12 | 4 |

**Πλήρης κατάταξη τύπων (10ήμερο)**

| # | Σφάλμα | Λογαριασμοί | Εύρημα |
|---:|---|---|---|
| 148 | `Unsupported query for this table` | και οι 3 | **WP-2** |
| 60 | `Missing fields in ORDERS: Status` | και οι 3 | WP-6 |
| 56 | `Validation error (422)` *(παλιό μήνυμα, ίδια αιτία)* | dimitris, pantelis | WP-2 |
| 26 | `Table not available on this backend` | dimitris, kelesmitos | WP-4 + TRIP_COSTS |
| 8 | `intl_scan_extract: x-api-key header is required` | pantelis | έκλεισε 12/8 09:33 |
| 5 | `intl_scan_extract: File read error` | kelesmitos | ανοιχτό, χαμηλό |
| 5 | `Cascade delete: N sub-deletes failed` | και οι 3 | **WP-5** |
| 5 | `atGetOne: Unknown Airtable error` | dimitris | 12/8 μόνο |
| 4 | `atDelete: Forbidden` | kelesmitos | **WP-3** |
| 3 | `CEO Dashboard: Cannot set properties of null` | dimitris | κατάρρευση μετά το 404 |
| 3 | `CEO dashboard: trip costs: 404` | dimitris | `TRIP_COSTS` ανύπαρκτος |
| 3 | `atDelete: Unknown Airtable error` | pantelis | WP-3, παλιό μήνυμα |
| 1 | `unhandledrejection: …reading 'orderIds'` | pantelis | 12/8, μεμονωμένο |

---

## ΤΙ ΔΕΝ ΜΠΟΡΕΣΑ ΝΑ ΕΛΕΓΞΩ

- **Αν το deployed bundle του Worker ταυτίζεται με το `worker/src/index.js`.**
  Ο deploy έγινε 14/08 11:26 UTC, το τελευταίο commit στην πηγή 12/08 12:24 —
  συμβατό, αλλά το περιεχόμενο του live bundle δεν διαβάζεται από εδώ.
  Όλα τα ευρήματα βασίζονται στην πηγή του repo.
- **Ο ακριβής όρος που προκαλεί το 422.** Ο Worker γράφει
  `[facade] unsupported filter on …` μόνο στην κονσόλα του (χωρίς
  `logpush`/`tail consumer`). Η ταύτιση με το `VS CD Date` προκύπτει από
  τον κώδικα και το ίδιο το `catch` του `daily_ops.js:58`, όχι από log του
  Worker. **Χρειάζεται ένα `wrangler tail` με μία φόρτωση Daily Ops για
  οριστική επιβεβαίωση.**
- **Πόσες φορές πατήθηκε το «VS CD Date» στο Weekly.** Οι επιτυχημένες
  εγγραφές καταγράφονται, οι σιωπηλά απορριφθείσες όχι.
- **Το WP-5 sub-delete που αποτυγχάνει** — η υπόθεση για το RAMP link δεν
  επιβεβαιώθηκε με εκτέλεση.
