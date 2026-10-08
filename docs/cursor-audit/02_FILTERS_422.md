# ΕΡΓΑΣΙΑ 2 — ΠΟΙΑ ΕΡΩΤΗΜΑΤΑ ΘΑ ΠΑΡΟΥΝ 422

## 1. Η γραμματική, ακριβώς όπως είναι γραμμένη

Πηγή: `worker/src/index.js:1604-1779` (`UnsupportedFilter`, `translateTerm`,
`resolveColumn`, `splitArgs`, `orTerm`, `applyFilter`) + `:2014-2047`
(`preResolveLinkTerms`). Κάθε άλλη μορφή → `UnsupportedFilter` →
`handleFacadeGet :1946-1958` → **HTTP 422 `{"error":"Unsupported query for this table"}`**.

### 1.1 Δεκτοί όροι (term) — και μόνο αυτοί

| # | Μορφή | Γραμμή | Μετάφραση |
|---|---|---|---|
| 1 | `{F}=<αριθμός>` | `:1616` | `F=eq.<n>` |
| 2 | `{F}!=BLANK()` | `:1621` | `not.is.null` |
| 3 | `{F}!=""` ή `{F}!=''` | `:1626` | `not.is.null` |
| 4 | `{F}!="τιμή"` | `:1631` | `or(F.neq.τιμή,F.is.null)` — **σκάει** αν η τιμή περιέχει `(`, `)` ή `,` (`:1634-1636`) |
| 5 | `{F}=BLANK()` | `:1639` | `is.null` |
| 6 | `LOWER(TRIM({F}))="τιμή"` | `:1644` | `ilike.τιμή` (κενή τιμή → `is.null`· τα `*` και `%` αφαιρούνται) |
| 7 | `{F}="τιμή"` | `:1651` | `eq.τιμή` (κενή → `is.null`) |
| 8 | `IS_SAME({F},"τιμή","day")` | `:1657` | `eq.<πρώτοι 10 χαρακτήρες>` |
| 9 | `SEARCH(LOWER("q"),LOWER({F}))` | `:1662` | `ilike.*q*` |
| 10 | `IS_AFTER({F},"τιμή"\|TODAY())` | `:1668` | `gt.` |
| 11 | `IS_BEFORE({F},"τιμή"\|TODAY())` | `:1673` | `lt.` |
| 12 | `RECORD_ID()="recXXX"` | `:1678` | `legacy_id=eq.` |

Και τα μονά και τα διπλά εισαγωγικά δεκτά. Το label λύνεται από
`fields ∪ computed ∪ aliases` (`filterFieldMap :1599-1602`) — άγνωστο label →
`Unknown field in filter` → 422 (`:1685-1691`).

### 1.2 Δεκτή δομή (applyFilter `:1744-1779`)

```
formula := term
         | OR( arg, arg, ... )              // arg := term | AND(term, term, ...)
         | AND( arg, arg, ... )             // arg := term | OR(arg', ...) , arg' := term | AND(...)
```

Δηλαδή: **ένα** επίπεδο `OR` μέσα σε `AND`, και `AND` μέσα σε `OR`. Τίποτα βαθύτερο.

### 1.3 Το πέρασμα των links (preResolveLinkTerms `:2014-2047`)

Εκτελείται **πριν** τον μεταφραστή και **μόνο** για labels που υπάρχουν στο
`cfg.links` του συγκεκριμένου πίνακα:

- `COUNTA({L})>0` → `{__col:fk}!=BLANK()`
- `{L}=BLANK()` / `{L}!=BLANK()` / `{L}=''` / `{L}!=''` → το ίδιο σε στήλη FK
- `FIND("recXXX",ARRAYJOIN({L}[,"…"]))[>0]` → `{__col:fk}="<pg id>"`, με πραγματική
  αναζήτηση του recid (`:2039`)· αν δεν βρεθεί, μπαίνει `-1` ώστε να μηδενίσει το
  αποτέλεσμα αντί να το αγνοήσει

Το recid **πρέπει** να είναι literal σε **διπλά** εισαγωγικά και να αρχίζει με
`rec` (`:2024`). Αν το label δεν είναι link του πίνακα, το `FIND(...)` περνά
αμετάβλητο στον μεταφραστή → 422.

### 1.4 ΔΕΝ υποστηρίζονται

`>=`, `<=`, `>`, `<` σε τιμή · `NOT()` · `AND` μέσα σε `AND` · δεύτερο επίπεδο
`OR` μέσα σε `OR` · αριθμητικές πράξεις · `DATETIME_DIFF`, `DATEADD`, `YEAR()`,
`MONTH()` · `{F}=TRUE()`/`FALSE()` (μόνο `=1`) · `FIND` πάνω σε μη-link ή με
μονά εισαγωγικά · `ARRAYJOIN` μόνο του · `SEARCH` χωρίς `LOWER` · `maxRecords`
(δεν το στέλνει καν το `atGetAll`, δες §4) · sort σε `computed`/`link`.

---

## 2. Τι κάνει το front end όταν έρθει 422

`core/api.js:256-283`: για 400/422 δείχνει κόκκινο toast με το **αγγλικό**
κείμενο του Worker («Unsupported query for this table»), γράφει στο `logError`,
και θέτει `_noRetry` ώστε να μη γίνει retry. Άρα το 422 **δεν** είναι αθέατο —
είναι ορατό αλλά ανενέργητο. Το μοτίβο WP-2 συμβαίνει στο επόμενο βήμα: ο
caller πιάνει την εξαίρεση και συνεχίζει σαν να μην υπήρχε τίποτα να βρεθεί.

---

## 3. Κάθε φίλτρο που θα αποτύχει

Εντοπίστηκαν **90** σημεία `atGet`/`atGetAll` με φίλτρο. Τρέχοντας τον
**πραγματικό** μεταφραστή του Worker (κώδικας κομμένος από το ίδιο το `index.js`,
δες `06_METHOD.md`) με τον χάρτη του κάθε πίνακα: **49** μεταφράστηκαν καθαρά,
**23** απέτυχαν, **18** είχαν φίλτρο ή πίνακα που χτίζεται δυναμικά και
διαβάστηκαν χειροκίνητα.

Και τα 23 + τα 18 ελέγχθηκαν στη συνέχεια με άνοιγμα του αρχείου. **8 από τα 23
ήταν ψευδώς θετικά** της αυτόματης αντικατάστασης τιμών — φίλτρα που στην
πραγματικότητα μεταφράζονται σωστά, είτε γιατί το recid μπαίνει σε
`FIND("…",ARRAYJOIN({link},","))` πάνω σε **υπαρκτό** link
(`core/order-sync.js:113`, `modules/orders_intl.js:1253`,
`modules/orders_natl.js:1058`, `:1217`), είτε γιατί είναι
`OR(${ids.map(id=>'RECORD_ID()="'+id+'"').join(',')})`
(`core/order-sync.js:142`, `modules/daily_ramp.js:160`, `:164`, `:182`).
Παρακάτω μόνο τα επιβεβαιωμένα με ανάγνωση.

### 3.1 `{Groupage Lines}` σε CONSOLIDATED LOADS — 8 σημεία, όλα 422

Το label δεν υπάρχει στον χάρτη· ο Worker το εξαιρεί ρητά με σχόλιο ότι «η
πλευρά του CL δεν συμπληρώνεται ποτέ» (`worker/src/index.js:1148-1151`). Η
σωστή κατεύθυνση (`GROUPAGE LINES.Linked Consolidated Load`) **υπάρχει** στον
χάρτη και χρησιμοποιείται σωστά στο `modules/weekly_natl.js:930-936`.

| Σημείο | Συνάρτηση | Τι πιάνει το σφάλμα | Πραγματική συνέπεια |
|---|---|---|---|
| `core/order-sync.js:125` | `syncGLtoCLtoNL` | `.catch(() => [])` `:127` | Κανένα CL δεν βρίσκεται → ο επανυπολογισμός `Total Pallets`/`Temperature C`/`Goods` σε CL και NL (`:151`, `:165`) **δεν γίνεται ποτέ** μετά από αλλαγή GL. (Και δεύτερος φραγμός: το `:140` διαβάζει `cl.fields['Groupage Lines']`, που ο Worker επίσης δεν επιστρέφει) |
| `modules/orders_intl.js:1198` | `_deleteGrpForIntl` (Groupage OFF) | `catch` `:1207` → `logError` | Τα CL και NL **δεν σβήνονται ποτέ** όταν κλείνει το National Groupage· το GL γίνεται σωστά `Unassigned` (`:1209`). Μένει φορτηγό-φορτίο στο πλάνο χωρίς γραμμές |
| `modules/orders_intl.js:1557` | auto-restore στην αποθήκευση | `catch` `:1569` `console.warn` | Το CL δεν σβήνεται, το GL γίνεται `Unassigned` (`:1570`), και ο χρήστης βλέπει toast **«Το φορτίο διαλύθηκε — συνεχίζει η αποθήκευση…»** (`:1575`). Ψευδής επιβεβαίωση + ασυνεπής κατάσταση |
| `modules/orders_intl.js:2580` | `deleteIntlOrder` | `catch` `:2591` → `_delFail++` | CL/NL μένουν ορφανά **και** ψευδής προειδοποίηση (δες `04_ERROR_COUNTING.md`) |
| `modules/orders_intl.js:2709` | `cleanupOrphanGL` | `catch` `:2722` → `_delFail++` | Ίδιο· το μήνυμα μπορεί να πει «Καθαρίστηκαν 0» ενώ όλα τα GL σβήστηκαν |
| `modules/orders_intl.js:2822` | `cleanupOrphans` | `catch` `:2830` → `_delFail++` | Ίδιο |
| `modules/orders_natl.js:1066` | αποθήκευση NAT_ORDER με Groupage OFF | `catch` `:1079` `console.warn` | CL/NL δεν σβήνονται |
| `modules/orders_natl.js:1493` | `deleteNatlOrder` | `catch` `:1507` → `_delFail++` | CL/NL ορφανά + ψευδής προειδοποίηση |

### 3.2 RAMP φιλτραρισμένο με link labels — 3 σημεία, όλα 422

Ο RAMP **δεν έχει `links` block** (`worker/src/index.js:873-878`), άρα το
`preResolveLinkTerms` δεν μετατρέπει τίποτα και το `FIND(...)` φτάνει αμετάβλητο
στον μεταφραστή.

| Σημείο | Φίλτρο | Συνέπεια |
|---|---|---|
| `modules/orders_intl.js:937` | `FIND("<order>",ARRAYJOIN({Order},","))>0` | Στο «Veroia Switch OFF» οι εγγραφές ράμπας δεν σβήνονται ποτέ (`catch :941`) |
| `modules/orders_intl.js:2600` | ίδιο | `deleteIntlOrder`: εγγραφές ράμπας ορφανές + `_delFail++` (`catch :2606`) |
| `modules/orders_natl.js:1518` | `FIND("<no>",ARRAYJOIN({National Order},","))>0` | `deleteNatlOrder`: ίδιο (`catch :1524`) |

### 3.3 PARTNER ASSIGNMENTS φιλτραρισμένο με `{Nat Load}` — 1 σημείο, 422

`modules/orders_natl.js:1540`:
`OR(FIND("rec…",ARRAYJOIN({Order},",")) > 0, FIND("rec…",ARRAYJOIN({Nat Load},",")) > 0)`

Το `{Order}` **είναι** link και θα μετατρεπόταν κανονικά· το `{Nat Load}` δεν
είναι (εύρημα A-1), και επειδή ο ένας όρος σκάει, **χάνεται όλο το `OR`** → 422 →
`catch :1546` → `_delFail++` → οι εγγραφές PARTNER ASSIGNMENTS δεν σβήνονται
ποτέ κατά τη διαγραφή εθνικής παραγγελίας.

Παρένθεση για την τεκμηρίωση: το σχόλιο στο `core/pa-helpers.js:13-16` λέει ότι
«το FIND/ARRAYJOIN ΔΕΝ υποστηρίζεται σε αυτόν τον πίνακα». Με βάση τον κώδικα, η
διάγνωση είναι μισή: για `{Order}` υποστηρίζεται, για `{Nat Load}` όχι. Η
επιλεγμένη λύση (φέρε όλα, φιλτράρισε στη JS) δουλεύει και για τα δύο, αλλά ο
λόγος που καταγράφηκε θα στείλει τον επόμενο σε λάθος κατεύθυνση.

### 3.4 `{VS CD Date}` σε ORDERS — WP-2, επιβεβαιωμένο

`modules/daily_ops.js:48` → 422 → `catch :57` → επανάληψη με `dayFOld` (`:49`).
Επειδή το label **δεν πρόκειται** να υπάρξει χωρίς αλλαγή στον Worker, το
fallback είναι μόνιμο, όχι μεταβατικό όπως λέει το σχόλιο στο `:58-59`.

### 3.5 Πίνακες εκτός χάρτη → 404 (όχι 422)

| Σημείο | Πίνακας | Κατάσταση |
|---|---|---|
| `modules/ceo_dashboard.js:146` | TRIP_COSTS | **Τεκμηριωμένο και χειρισμένο**: `safeFetch` + το σχόλιο `:118-121` λέει ρητά ότι 404άρει και γι' αυτό ονομάζεται η πηγή που έλειψε. Καμία ενέργεια |
| `core/metrics.js:548` | METRICS_SNAPSHOTS | Αδρανές (κανένας caller) |

### 3.6 Αδρανές: μη υποστηριζόμενος τελεστής `>=`

`core/command-center.js:213`: `AND({Week Number}>=${fromWeek},{Status}='Delivered')`.
Ο `>=` δεν υπάρχει στη γραμματική → 422 → `.catch(() => [])` (`:217`) → η
συνάρτηση θα γύριζε πάντα `{currentWeekPct:0, streakWeeks:0}`.
**Δεν εκτελείται σήμερα**: η `fetchOnTimeStreak` δεν καλείται από πουθενά (το
`modules/weekly_natl.js:415` καταγράφει ότι αφαιρέθηκε). Αν ξανασυνδεθεί, θα
είναι σιωπηλό μηδενικό.

---

## 4. Δύο παράμετροι που αγνοούνται σιωπηλά από το ίδιο το front end

Δεν είναι θέμα Worker, αλλά ίδιο μοτίβο «στέλνω και χάνεται»:

- **`maxRecords`**: το `atGetAll` (`core/api.js:405-432`) διαβάζει μόνο
  `filterByFormula`, `fields`, `sort`. Τα 4 σημεία που περνούν `maxRecords`
  (`core/data-helpers.js:137`, `core/scan-helpers.js:436`,
  `modules/orders_natl.js:983`, `:1795`) κατεβάζουν **όλες** τις σελίδες.
- **`sort`**: ο Worker το λύνει μόνο από `cfg.fields` (`:1959-1966`), άρα
  ταξινόμηση σε computed (`Week Number`, `Captured At`) αγνοείται σιωπηλά. Τα δύο
  σημεία που το χρησιμοποιούν είναι και τα δύο σε νεκρές διαδρομές
  (`core/scan-helpers.js:437`, `core/metrics.js:550`).
