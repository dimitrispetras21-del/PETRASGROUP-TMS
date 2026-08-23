# AUDIT — ΧΑΡΤΗΣ ΠΕΔΙΩΝ & ΓΡΑΜΜΑΤΙΚΗ ΦΙΛΤΡΩΝ (στατικός έλεγχος)

Ημερομηνία: 2026-08-22 · Εύρος: `config.js`, `core/*.js`, `modules/*.js`, `worker/src/index.js`
Μέθοδος και αναπαραγωγή: [`06_METHOD.md`](06_METHOD.md)

**Τι ΔΕΝ λέει αυτή η αναφορά:** τίποτα για δεδομένα. Δεν υπάρχει πρόσβαση σε
βάση, Worker ή `.env.local`. Κάθε ισχυρισμός είναι της μορφής «ο κώδικας θα
κάνει Χ», με `αρχείο:γραμμή`. Ό,τι δεν αποδεικνύεται από τον κώδικα είναι στο
[`05_UNCERTAIN.md`](05_UNCERTAIN.md).

---

## Τα αρχεία

| Αρχείο | Περιεχόμενο |
|---|---|
| [`01_FIELD_MAP.md`](01_FIELD_MAP.md) | ΕΡΓΑΣΙΑ 1 — πλήρη σύνολα αποδεκτών labels ανά πίνακα, **Πίνακας Α** (άγνωστα labels που στέλνονται), **Πίνακας Β** (labels που ο Worker ξέρει και κανείς δεν στέλνει) |
| [`02_FILTERS_422.md`](02_FILTERS_422.md) | ΕΡΓΑΣΙΑ 2 — η ακριβής γραμματική του μεταφραστή και κάθε φίλτρο του front end που θα πάρει 422/404 |
| [`03_DEAD_READS.md`](03_DEAD_READS.md) | Labels που το front end **διαβάζει** και ο Worker δεν σερβίρει ποτέ (επέκταση του WP-7) |
| [`04_ERROR_COUNTING.md`](04_ERROR_COUNTING.md) | Λάθος μέτρηση σφαλμάτων / καταπινόμενα σφάλματα (επέκταση του WP-5) |
| [`05_UNCERTAIN.md`](05_UNCERTAIN.md) | ΑΒΕΒΑΙΑ — τι δεν αποδεικνύεται στατικά |
| [`06_METHOD.md`](06_METHOD.md) | Πώς βγήκαν τα ευρήματα, με τα scripts, ώστε να ξανατρέξουν |
| [`07_READ_MAP.md`](07_READ_MAP.md) | ΕΡΓΑΣΙΑ 7 — κάθε ανάγνωση πεδίου: σιωπηλή καταπίεση / κενό / κατάρρευση |

---

## Σύνοψη ευρημάτων (νέα, εκτός των WP-1/2/5/7)

### P0 — σιωπηλή απώλεια εγγραφής με HTTP 200

| # | Label → πίνακας | Σημείο εγγραφής | Τι χάνεται |
|---|---|---|---|
| A-1 | `Nat Load` → PARTNER ASSIGNMENTS | `core/pa-helpers.js:40` | Η ανάθεση συνεργάτη σε εθνικό φορτίο μένει **χωρίς γονέα**. Και επειδή το ίδιο label δεν επιστρέφεται στην ανάγνωση (`core/pa-helpers.js:17`), κάθε αποθήκευση φτιάχνει **νέα** εγγραφή, και τα `paDelete`/`paSyncStatus` για nat_load δεν βρίσκουν ποτέ τίποτα |
| A-2 | `Order`, `National Order` → RAMP | `modules/daily_ramp.js:269-270` | Η σύνδεση ράμπας↔παραγγελίας. Συνέπεια: το «Done» στη ράμπα **δεν προάγει ποτέ** την παραγγελία σε `In Transit` — όλο το μπλοκ `modules/daily_ramp.js:678-705` είναι νεκρό |
| A-3 | `Truck`, `Driver` → RAMP | `modules/daily_ramp.js:276-277`, `:792-793` | Φορτηγό/οδηγός στη ράμπα. Οι δύο στήλες του πίνακα και το CSV είναι πάντα κενά (`:347-348`, `:609`, `:820-821`) |
| A-4 | `Workshop`, `Estimated Cost` → MAINT_REQ | `modules/maintenance.js:2312`, `:2316` | Συνεργείο και εκτιμώμενο κόστος του work order |
| A-5 | `Contact Person`, `Payment Terms Days` → CLIENTS · `Contact Person` → PARTNERS · `Salary Base` → DRIVERS | `core/entity.js:1388` → `:1403`/`:1405` | Πεδία της φόρμας master data που δεν γράφονται ποτέ, ενώ εμφανίζονται σε στήλες/λεπτομέρειες και υπάρχουν και στην αναζήτηση |

### P0 — η εγγραφή απορρίπτεται ολόκληρη (HTTP 400) και το σφάλμα καταπίνεται

| # | Σημείο | Τι συμβαίνει |
|---|---|---|
| A-6 | `modules/orders_natl.js:1336` | `'Source Record': <id NAT_ORDER>` → το `linkAliases` του Worker (`worker/src/index.js:1409`) το ανάγει σε FK προς **orders** → `Unknown linked record in request` (400). Το `catch` στο `:1105` γράφει μόνο στο console και ο χρήστης βλέπει «Order updated ✓» (`:1117`). Καμία μη-groupage εθνική παραγγελία δεν αποκτά γραμμή NAT_LOADS → δεν εμφανίζεται στο Weekly National |

### P1 — ορατό 400, η λειτουργία είναι αδύνατη

| # | Σημείο | Τι συμβαίνει |
|---|---|---|
| A-7 | `modules/weekly_intl.js:961` (από `:762`, `:1157`, `:1179`) | Στέλνει **μόνο** `VS CD Date` → `No writable fields in request` (400). Το «κλικ στην ημερομηνία CD για την πραγματική» (owner 10/8) δεν δουλεύει σε κανένα από τα τρία σημεία |

### P1 — σιωπηλή ακύρωση λειτουργίας από διπλό κλειδί / άγνωστο πίνακα

| # | Σημείο | Τι συμβαίνει |
|---|---|---|
| A-8 | `config.js:79` και `config.js:85` | Το `SCAN_TRAINING` δηλώνεται **δύο φορές**· υπερισχύει το δεύτερο (`''`), οπότε ο φύλακας στο `core/scan-helpers.js:353` είναι πάντα false. Η κοινή μάθηση των scan (owner 10/8) δεν γράφει ποτέ, παρότι ο Worker έχει τον πίνακα (`tblScanTraining000`) και RBAC |
| A-9 | `core/metrics.js:502`, `:533`, `:548` | `TABLES.METRICS_SNAPSHOTS` δεν υπάρχει στον χάρτη του Worker → 404 σε κάθε μέθοδο. **Αδρανές**: κανένας caller εκτός του `core/metrics.js` |

### P0/P1 — ανάγνωση label που ο Worker δεν σερβίρει ποτέ (λεπτομέρειες στο `03_DEAD_READS.md`)

| # | Σημείο | Τι συμβαίνει |
|---|---|---|
| R-1 | `core/pallet-feed.js:142` | Διαβάζει `'Pallets'` από **ORDERS** (δεν υπάρχει· το σωστό είναι `'Total Pallets'`) → η κίνηση partner γράφεται με `taken/given = 0` και μετά το `/confirm` την απορρίπτει με 400 «taken + given must be > 0» (`worker/src/index.js:2824`) |
| R-2 | `modules/weekly_natl.js:1548` | `'Source Record'` δεν επιστρέφεται ποτέ (aliases εξαιρούνται από τις αναγνώσεις, `worker/src/index.js:1574-1583` + `:1403-1405`) → η ενημέρωση της πηγαίας NAT_ORDER σε `Assigned` δεν γίνεται ποτέ |
| R-3 | `modules/weekly_natl.js:922-923` | Ίδιο label → το μπλοκ που φέρνει τις στάσεις από την πηγή (η διόρθωση για το «δεν βρέθηκαν στάσεις», owner 12/08) δεν εκτελείται ποτέ |
| R-4 | `core/utils.js:1109` + `:1240`, `core/metrics.js:363` | `'ATP Expiry'` στα TRAILERS (η στήλη είναι `FRC Expiry`) → οι ειδοποιήσεις λήξης ATP/FRC ρυμούλκας δεν χτυπούν ποτέ |

### 422 — φίλτρα (πλήρης λίστα στο `02_FILTERS_422.md`)

Το μεγαλύτερο σύνολο: **8 σημεία** φιλτράρουν CONSOLIDATED LOADS με
`{Groupage Lines}`, label που ο Worker επίτηδες δεν μοντελοποιεί
(`worker/src/index.js:1148-1151`). Κάθε ένα → 422. Άμεσες συνέπειες:

- «Groupage OFF» δεν σβήνει ποτέ CL/NL (`modules/orders_intl.js:1198`, `modules/orders_natl.js:1066`)
- Το auto-restore στην αποθήκευση δείχνει toast «Το φορτίο διαλύθηκε» ενώ το CL ζει (`modules/orders_intl.js:1556-1575`)
- Η cascade διαγραφή αφήνει CL/NL/RAMP/PA και **προειδοποιεί ψευδώς** (`04_ERROR_COUNTING.md`)
- Ο επανυπολογισμός συνόλων CL/NL μετά από αλλαγή GL δεν γίνεται ποτέ (`core/order-sync.js:124-127`, `:140`)

Επιπλέον: 3 σημεία φιλτράρουν RAMP με `{Order}`/`{National Order}` (ο RAMP δεν
έχει καθόλου `links`), 1 σημείο φιλτράρει PARTNER ASSIGNMENTS με `{Nat Load}`.

---

## Πού συγκεντρώνεται ο κίνδυνος

Τρία labels εξηγούν τα περισσότερα ευρήματα:

1. **`{Groupage Lines}` (CL)** — 8 φίλτρα, όλη η αλυσίδα groupage teardown.
2. **RAMP links (`Order`/`National Order`/`Truck`/`Driver`)** — ο πίνακας RAMP
   δεν έχει `links` block· 4 εγγραφές και 3 φίλτρα βασίζονται σε αυτά.
3. **`Source Record` (NAT_LOADS)** — γράφεται σωστά, **διαβάζεται πάντα κενό**
   (alias μόνο για write/filter), και για γονέα NAT_ORDER απορρίπτει την εγγραφή.

Το κοινό μοτίβο σε όλα: **ο Worker λέει «200 OK» ή γυρίζει κενό πεδίο, και το
front end το εκλαμβάνει ως επιτυχία ή ως «δεν υπάρχει τίποτα»**. Ούτε ένα από
τα παραπάνω δεν σπάει την οθόνη.
