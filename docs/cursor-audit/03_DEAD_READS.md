# LABELS ΠΟΥ ΤΟ FRONT END ΔΙΑΒΑΖΕΙ ΚΑΙ Ο WORKER ΔΕΝ ΣΕΡΒΙΡΕΙ ΠΟΤΕ

Επέκταση του WP-7 προς την πλευρά της **ανάγνωσης**. Ο Worker χτίζει το
`fields` της απάντησης από `columnToLabel` (`worker/src/index.js:1574-1583`) =
`fields ∪ computed`, συν `links` και `reverseLinks` χωριστά. Ό,τι δεν είναι σε
αυτά τα σύνολα **δεν επιστρέφεται ποτέ** — και επειδή το Airtable API παρέλειπε
κιόλας τα κενά πεδία, το front end δεν έχει τρόπο να ξεχωρίσει «κενό» από
«ανύπαρκτο». Επιπλέον, όταν το `fields[]` ζητά άγνωστο label, η στήλη απλώς δεν
μπαίνει στο `select` (`:1933-1945`), χωρίς προειδοποίηση.

Ταξινομημένα κατά συνέπεια, όχι κατά αρχείο.

---

## 1. Λάθος αριθμός, όχι κενή οθόνη (P0/P1)

### R-1 · `Pallets` σε ORDERS → οι κινήσεις παλετών partner γεννιούνται με 0

`core/pallet-feed.js:122` φέρνει την **παραγγελία** (`atGetOne(TABLES.ORDERS, …)`)
και στο `:142` κάνει `parseInt(f['Pallets'], 10) || 0`. Ο ORDERS δεν έχει
`Pallets` — έχει `Total Pallets` (computed, σερβίρεται κανονικά από το
`orders_with_derived`). Άρα `pallets = 0` πάντα, και το `qty` στο `:143-146`
δίνει `taken=0, given=0`.

Δύο συνέπειες, και οι δύο από κώδικα:
1. Η pending κίνηση `PARTNER_PICKUP`/`PARTNER_DROPOFF` (`:148-156`) γράφεται με
   μηδέν παλέτες.
2. Το `/pallets/movements/:id/confirm` απορρίπτει με **400 «taken + given must be
   > 0»** (`worker/src/index.js:2824-2826`) — και το ίδιο ισχύει για την απευθείας
   επιβεβαίωση (`:2750-2752`). Η κίνηση **δεν μπορεί** να επιβεβαιωθεί ποτέ.

### R-2 · `Net Price` σε ORDERS → η οθόνη δείχνει το ακαθάριστο σαν καθαρό

`modules/orders_intl.js:590` εμφανίζει σειρά «Net Price» από `f['Net Price']`
(δεν υπάρχει στον χάρτη — derived, εξαιρείται ρητά, `worker/src/index.js:1077-1078`)
→ πάντα `—`. Χειρότερα, το `modules/invoicing.js:67-72` (`_invNetPrice`) πέφτει
στο `Price` όταν λείπει το `Net Price`, οπότε το πάνελ τιμολόγησης (`:732`)
δείχνει **δύο ίδιους αριθμούς** με διαφορετικές ετικέτες.

### R-3 · `ATP Expiry` σε TRAILERS → καμία ειδοποίηση λήξης ψυκτικού

Η στήλη λέγεται `FRC Expiry`. Το `ATP Expiry` ζητείται και διαβάζεται σε 4 σημεία:
`core/utils.js:1109` (fields[]) και `:1240` (`checkDocs`, το καμπανάκι),
`core/metrics.js:363` (`expiryAlertsTrailers`), `modules/metrics_audit.js:311`
και `:452`, `modules/maintenance.js:149`. Καμία ειδοποίηση ATP/FRC ρυμούλκας δεν
θα εμφανιστεί ποτέ· η ασφάλεια (`Insurance Expiry`) δουλεύει κανονικά, οπότε η
λίστα φαίνεται λειτουργική.

---

## 2. Νεκρή διακλάδωση: η διόρθωση δεν μπορεί να εκτελεστεί (P0)

### R-4 · `Source Record` σε NAT_LOADS — 3 σημεία ανάγνωσης, όλα πάντα κενά

Ο Worker ορίζει το `Source Record` **μόνο** ως alias για write/filter και
τεκμηριώνει ότι επίτηδες δεν μπαίνει στις αναγνώσεις (`worker/src/index.js:1403-1409`).
Στην ανάγνωση η ίδια στήλη επιστρέφεται με το label `Source Orders`.

| Σημείο | Τι νεκρώνει |
|---|---|
| `modules/weekly_natl.js:1548` | Μετά από ανάθεση, το `srcId` είναι `undefined` → η πηγαία NAT_ORDER **δεν** γίνεται ποτέ `Assigned` και το `syncOrderDownstream` (`:1551`) δεν καλείται |
| `modules/weekly_natl.js:922-923` | Το μπλοκ που φέρνει τις στάσεις από την πηγή δεν εκτελείται ποτέ → το πάνελ σημείων πέφτει **πάντα** στο fallback χωρίς παλέτες. Αυτό είναι ακριβώς το παράπονο που το σχόλιο στο `:917-921` λέει ότι διορθώνει (owner 12/08) |
| `modules/orders_intl.js:2797` | Ο εντοπισμός ορφανών NAT_LOADS (Direct VS) γυρίζει **πάντα** άδειο → η κατηγορία δεν αναφέρεται ποτέ (`:2812`) |
| `modules/weekly_natl.js:108` | Το ζητά και σε `fields[]` — αγνοείται σιωπηλά |

### R-5 · `Groupage Lines` σε CONSOLIDATED LOADS (ανάγνωση)

`core/order-sync.js:126` το ζητά σε `fields[]` και το `:140` το διαβάζει
(`cl.fields['Groupage Lines'] || []`) → πάντα `[]` → `continue`. Ακόμα κι αν
διορθωθεί το φίλτρο του `:125` (422, δες `02_FILTERS_422.md`), ο επανυπολογισμός
θα παραμείνει αδύνατος από αυτή τη διαδρομή.

### R-6 · `Order` / `National Order` σε RAMP (ανάγνωση)

- `modules/daily_ramp.js:18` (μέσα στο `RAMP_FIELDS`, που χρησιμοποιείται από τη
  βασική φόρτωση του πίνακα στο `:87`) και `:106` (`dedupFields`) τα ζητούν σε
  `fields[]`. Το `:125-127` χτίζει κλειδί dedup από αυτά → το κλειδί
  υποβαθμίζεται σε `r.id` και δεν ταιριάζει ποτέ με το κλειδί που χτίζεται στο
  `:241`. Ο dedup **σώζεται** από το δευτερεύον κλειδί `Notes: 'STOP:<recid>'`
  (`:119-120`, `:265`) — γι' αυτό δεν βλέπει κανείς πλημμύρα διπλών.
- `modules/orders_intl.js:2790` — ο εντοπισμός ορφανών RAMP γυρίζει πάντα
  `false` (κανένα link) → η κατηγορία αναφέρεται πάντα ως 0 (`:2811`).

### R-7 · `Nat Load` σε PARTNER ASSIGNMENTS (ανάγνωση)

`modules/orders_intl.js:2781` → `nlLinks` πάντα `[]` → ο εντοπισμός ορφανών PA
βλέπει μόνο τη πλευρά `Order`. Το ίδιο label στο `core/pa-helpers.js:17` είναι η
αιτία του A-1.

### R-8 · `VS CD Date` σε ORDERS (ανάγνωση) — η άλλη μισή όψη του WP-1

- `modules/daily_ops.js:21` (fields[]) → `modules/daily_ops.js:163`: η «effective»
  μέρα VS πέφτει πάντα στην εκτίμηση Loading+1.
- `modules/daily_ops.js:585`: η συνθήκη `!r0?.fields['VS CD Date']` είναι **πάντα
  αληθής**, άρα το `:586` προσπαθεί να γράψει την ημερομηνία σε **κάθε** μετάβαση
  σε `In Transit` (και χάνεται σιωπηλά, WP-1).
- `modules/weekly_intl.js:932` (`_wk3VsCd`): το `real` είναι πάντα κενό → το
  Weekly δείχνει **πάντα** την εκτίμηση με `≈`, και το κλικ για την πραγματική
  τιμή γυρίζει 400 (εύρημα A-7).

---

## 3. Κενό κελί στην οθόνη (WP-7, ίδια κλάση)

| Label | Πίνακας | Σημεία ανάγνωσης | Τι φαίνεται |
|---|---|---|---|
| `Order Number` | ORDERS | `modules/invoicing.js:49`, `modules/weekly_intl.js:51`/`:783`, `modules/metrics_audit.js:303`/`:373` | Στη λίστα τιμολόγησης **κάθε** γραμμή δείχνει «(χωρίς αριθμό)». Το σχόλιο `:42-48` τεκμηριώνει τη συνειδητή επιλογή να μη μπει το recid — αλλά όχι ότι το πεδίο δεν έρχεται καθόλου |
| `Loading Summary`, `Delivery Summary` | ORDERS | `modules/invoicing.js:35-36`, `core/entity.js:1126`/`:1130`, `modules/performance.js:114`/`:640-641`, `core/utils.js:1129`/`:1144` | Διαδρομή «— → —» στο πάνελ τιμολόγησης, στο ιστορικό πελάτη, στις ειδοποιήσεις. **Εξαίρεση**: το `modules/weekly_intl.js:121-168` τα ανακατασκευάζει από τα ORDER STOPS — αυτό είναι το σωστό μοτίβο και υπάρχει ήδη μέσα στο repo |
| `Client Name`, `Client Summary` | ORDERS / NAT_ORDERS | `modules/invoicing.js:21`, `modules/weekly_intl.js:687-688`/`:1103-1104`, `core/ai-chat.js:537`, `modules/invoicing.js:862` | Ακίνδυνα ως fallback (η κύρια διαδρομή μέσω `Client` link δουλεύει), **εκτός** από το `modules/invoicing.js:862`, όπου η αναφορά αποτυχιών batch δείχνει recid αντί ονόματος |
| `Name` | NAT_ORDERS, RAMP | `modules/orders_natl.js:951`/`:983`, `:1519` | Η λίστα διπλότυπων δείχνει `id.slice(-6)` |
| `Aliases`, `VAT Number`, `Country` | WORKSHOPS | `core/entity.js:262` (searchFields), `:266` (filter) | Αναζήτηση με «παλιά γραφή» και φίλτρο χώρας πάνω σε πεδία που δεν έρχονται ποτέ. Το σχόλιο `:259-261` εξηγεί γιατί τα θέλει — άρα η πρόθεση υπάρχει, το πεδίο όχι |
| `Pallet Balance` | CLIENTS / PARTNERS | `core/entity.js:50`, `:94` | Σειρά «Commercial → Pallet Balance» πάντα `—` |
| `Payment Terms Days`, `Contact Person`, `Salary Base` | CLIENTS/PARTNERS/DRIVERS | `core/entity.js:28`, `:49`, `:50`, `:73`, `:122`, `:140` | Κενά, επειδή δεν γράφονται ποτέ (A-5) |
| `Needs Review` | MAINT_HISTORY | `modules/maintenance.js:64`, `:697`, `:721` | Υπάρχει στον χάρτη, κανείς δεν το γράφει → το φίλτρο «προς έλεγχο» δεν θα βρει ποτέ κάτι |
| `Workshop`, `Estimated Cost` | MAINT_REQ | `modules/maintenance.js:1963` (fields[]), `:2154`, `:2274-2276`, `:2279` | Στήλη «Συνεργείο» πάντα `—`, το select δεν προεπιλέγει, το κόστος ανοίγει κενό (συνέπεια του A-4) |
| `Tachograph Expiry`, `ADR Expiry`, `Next Maintenance Date`, `Pallet Capacity` | TRUCKS/TRAILERS | `modules/maintenance.js:146-150` | Ζητούνται σε `fields[]` και δεν διαβάζονται πουθενά — μόνο θόρυβος στο αίτημα |
| `Stop Client/Location/Temp/Ref/Pallets 1-5` | RAMP | `modules/daily_ramp.js:21-25` | Ζητούνται, δεν γράφονται ποτέ (Πίνακας Β) |
| `Veroia Cross-dock` | ORDERS | `print.html:597-598` | Ο link δεν γράφεται από πουθενά· το print πέφτει στο hardcoded `recJucKOhC1zh4IP3` (`:606`), οπότε το κενό είναι αόρατο |
| `Temperature °C` σε RAMP | RAMP | `modules/daily_ramp.js:607`, `:817` | Ακίνδυνο fallback δίπλα στο σωστό `Temperature` |
