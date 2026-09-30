# ΕΡΓΑΣΙΑ 7 — Ο ΧΑΡΤΗΣ ΤΗΣ ΑΝΑΓΝΩΣΗΣ

Ημερομηνία: 2026-08-23 · Εύρος: `config.js`, `core/*.js`, `modules/*.js`, `worker/src/index.js`
Μέθοδος εξαγωγής: ίδιος χάρτης Worker με την Εργασία 1 (`fields ∪ computed ∪ links ∪ reverseLinks` = αναγνώσιμα). Τα `aliases` **δεν** εκπέμπονται στην ανάγνωση (`worker/src/index.js:1574-1583`).

**Τι ΔΕΝ λέει αυτή η αναφορά:** τίποτα για περιεχόμενο βάσης. Κάθε ισχυρισμός είναι «ο κώδικας θα κάνει Χ». Τα ήδη επιβεβαιωμένα στην παραγωγή σημειώνονται ως τέτοια και δεν ξαναγράφονται ως νέα ανακάλυψη.

Το μοτίβο που ψάχνουμε:

```js
const a = f['ATP Expiry'];     // η στήλη λέγεται FRC Expiry
if (a && a <= cutoff) alert(); // undefined → false → «όλα καλά»
```

Καμία εξαίρεση, κανένα 4xx. Το Airtable API παρέλειπε τα κενά πεδία· ο Worker κάνει το ίδιο για άγνωστα labels (`:1933-1945`, σιωπηλή παράλειψη από το `select`). Το front end δεν μπορεί να ξεχωρίσει «κενό» από «ανύπαρκτο».

---

## 0. Πώς μετρήθηκαν οι αναγνώσεις

1. AST (`acorn`) σε κάθε `core/*.js` και `modules/*.js`: κάθε `recv['Literal']` και `recv[F.X]` όπου `recv` είναι `fields` / `f` / `ff` / `r.fields` κ.λπ.
2. Διασταύρωση με το `readable` σύνολο του πίνακα που αγγίζει η ροή — όχι με την ένωση όλων των πινάκων του αρχείου (αυτό έβγαλε ψευδή στον πρώτο αυτόματο πέρασμα: το `metrics.js` φάνηκε να αγγίζει μόνο `METRICS_SNAPSHOTS`).
3. Κάθε γραμμή του πίνακα Α/Β/Γ **ανοίχτηκε στο αρχείο**. Τα δυναμικά (`fields[F.STOP_TYPE]`, `` `Loading Location ${i}` ``) λύθηκαν από το scope.

Το αυτόματο πέρασμα έβγαλε 48 ονόματα που δεν υπάρχουν σε **κανέναν** πίνακα του Worker, και δεκάδες «άγνωστα ανά αρχείο» που ήταν ψευδή (π.χ. `License Plate` σε αρχείο που αγγίζει και TRUCKS). Παρακάτω μένουν μόνο όσα αποδεικνύονται μετά από ανάγνωση.

---

## Α. ΣΙΩΠΗΛΗ ΚΑΤΑΠΙΩΣΗ — το undefined βγαίνει false και ο χρήστης βλέπει «κανένα πρόβλημα»

### [R7-1] `ATP Expiry` αντί `FRC Expiry` στις ειδοποιήσεις / dashboard / metrics

*(Επιβεβαιώθηκε στην παραγωγή: μία ρυμούλκα με ληγμένο πιστοποιητικό ψυκτικού επί 3 μήνες, καμία ειδοποίηση. Εδώ μόνο ο πλήρης χάρτης σημείων.)*

Τι: ο κώδικας διαβάζει `'ATP Expiry'` από TRAILERS. Ο χάρτης έχει μόνο `'FRC Expiry'` (`worker/src/index.js:743`).

Απόδειξη — 5 ενεργά σημεία ελέγχου + 1 άχρηστο αίτημα:

| # | αρχείο:γραμμή | τι κάνει με το undefined |
|---|---|---|
| 1 | `core/utils.js:1109` | `fields: […,'ATP Expiry',…]` — ο Worker το παραλείπει από το `select` |
| 2 | `core/utils.js:1240` | `checkDocs(trailers, 'License Plate', ['ATP Expiry','Insurance Expiry'])` → `:1227-1235`: `(t.fields[field] \|\| '').substring(0,10)` · κενό → **καμία ειδοποίηση** |
| 3 | `core/metrics.js:363` | `const a = _toISO(t.fields['ATP Expiry']); if (a && a <= cutoff) atp.push(t)` → `atp` πάντα `[]` |
| 4 | `modules/dashboard.js:327` | `['ATP Expiry','Insurance Expiry'].forEach` πάνω σε `getRefTrailers()` → καμία καρτέλα FRC |
| 5 | `modules/metrics_audit.js:311` + `:452` | ζητά `ATP Expiry`· καλεί `expiryAlertsTrailers` → 0 ATP alerts |
| 6 | `modules/maintenance.js:149` | το ζητά στο `fields[]` **αλλά δεν το διαβάζει** — η σελίδα Λήξεων χρησιμοποιεί `FRC Expiry` (`:19-21`, `:45-51`, `:1899`) |

Πόσα σημεία: **5 ενεργά** (το #6 δεν καταπίνει έλεγχο).

Τι χαλάει: Thodoris / owner / maintenance — καμπανάκι ειδοποιήσεων, κάρτα στόλου στο Dashboard, KPI `expiryAlertsTrailers`. Βλέπουν ασφάλειες (δουλεύει το `Insurance Expiry`) και νομίζουν ότι ο έλεγχος τρέχει. Η σελίδα Συντήρησης δείχνει σωστά FRC — γι' αυτό το εύρημα φάνηκε «τυχαία» εκεί και όχι στις ειδοποιήσεις.

Αιτία: δύο ονόματα για το ίδιο πεδίο στον **ίδιο** κώδικα. Το `core/entity.js:243` και το `core/ai-chat.js:1283` γράφουν/διαβάζουν `FRC Expiry`. Οι ειδοποιήσεις έμειναν στο παλιό Airtable όνομα.

Σοβαρότητα: **P0** (επιβεβαιωμένο).

Επιβεβαιώθηκε πώς: διάβασα `core/utils.js:1104-1240`, `core/metrics.js:358-366`, `modules/dashboard.js:324-335`, `modules/maintenance.js:13-51` και `:149`, `worker/src/index.js:743`.

---

### [R7-2] `Pallets` αντί `Total Pallets` στο partner feeder

*(Το σφάλμα στέκει — ο χάρτης ORDERS έχει μόνο `Total Pallets` computed. Δεν ισχυρίζομαι τι γράφτηκε στη βάση.)*

Τι: `core/pallet-feed.js:142` κάνει `parseInt(f['Pallets'], 10) || 0` πάνω σε εγγραφή **ORDERS** (`:122` `atGetOne(TABLES.ORDERS, …)`).

Απόδειξη:

```142:146:core/pallet-feed.js
    const pallets = parseInt(f['Pallets'], 10) || 0;
    const qty = { // PICKUP: δίνουμε γεμάτες· DROPOFF: παίρνουμε γεμάτες (spec §3)
      taken: evType === 'PARTNER_DROPOFF' ? pallets : 0,
      given: evType === 'PARTNER_PICKUP' ? pallets : 0
    };
```

`undefined → NaN → 0`. Η κίνηση γράφεται με `taken+given = 0`. Το `/pallets/movements/:id/confirm` απορρίπτει με 400 «taken + given must be > 0» (`worker/src/index.js:2824-2826`).

Πόσα σημεία: **1** ανάγνωση (το `:62`/`:103` διαβάζουν `F.STOP_PALLETS` από ORDER STOPS — αυτό υπάρχει).

Τι χαλάει: όποιος αναθέτει διεθνές VS σε partner — η εκκρεμής κίνηση δεν επιβεβαιώνεται ποτέ.

Σοβαρότητα: **P0**.

Επιβεβαιώθηκε πώς: διάβασα `core/pallet-feed.js:119-159` και τον χάρτη ORDERS (`01_FIELD_MAP.md` §ORDERS: «ΔΕΝ υπάρχουν … `Pallets`»).

---

### [R7-3] `Net Price` στα KPI εσόδων / ανεξόφλητων — το 0 μοιάζει με στόχο

Τι: το `'Net Price'` δεν υπάρχει στον χάρτη ORDERS (ρητά εξαιρείται, `worker/src/index.js:1077-1078`). Τα σημεία που κάνουν `parseFloat(f['Net Price']) || 0` **χωρίς** fallback στο `'Price'` βγάζουν πάντα 0.

Απόδειξη — σημεία που αθροίζουν χωρίς fallback:

| αρχείο:γραμμή | συνάρτηση | τι δείχνει το 0 |
|---|---|---|
| `modules/performance.js:379` | `outstanding` = άθροισμα Net Price των Delivered | KPI «ΑΝΕΞΟΦΛΗΤΑ», `target: 0`, `invert: true` (`:56`) → **πράσινο, στόχος πιάστηκε** |
| `modules/ceo_dashboard.js:565` | `_calcCashMetrics` → `uninvoicedRev` | `:392` `uninvoicedRev > 0 ? '…αδρανούν' : 'Όλα τιμολογημένα'` → **πάντα «Όλα τιμολογημένα»** |
| `modules/ceo_dashboard.js:770` | brief: `if (uninvoicedRev > 5000)` | η προειδοποίηση του brief **δεν ανάβει ποτέ** |
| `modules/ceo_dashboard.js:492` | `_calcRevenue` | στρατηγικά έσοδα €0 (`:303`) |
| `modules/ceo_dashboard.js:526/:529` | `_topClients` | όλοι «Unknown» με €0 (`:328` πέφτει σε «Χωρίς δεδομένα» μόνο αν δεν υπάρχουν παραγγελίες· αν υπάρχουν, λίστα Unknown/€0) |
| `modules/ceo_dashboard.js:563/:577` | deliveredRev / partner margin | έσοδα παραδοθέντων €0, περιθώριο 0% |

Αντίθεση που αποδεικνύει την παγίδα: το `modules/invoicing.js:58-72` πέφτει στο `'Price'` (`_invPrice` / `_invNetPrice`). Η λίστα τιμολόγησης έχει αριθμούς· τα KPI του CEO και της Ειρήνης όχι. Δύο οθόνες, δύο αλήθειες, από τον ίδιο πίνακα.

Πόσα σημεία: **7 αναγνώσεις που κάνουν αριθμητική χωρίς fallback** + 1 εμφάνιση «—» (`modules/orders_intl.js:590`, κατηγορία Β).

Τι χαλάει: Ειρήνη (Performance → ΑΝΕΞΟΦΛΗΤΑ = €0 = στόχος) και owner (CEO → «Όλα τιμολογημένα» στο subtitle, brief χωρίς flag). Ο μετρητής πλήθους Delivered (`uninvoicedCount`, `:390`) μπορεί να δείχνει >0 με πορτοκαλί — αλλά το ευρώ και το κείμενο λένε το αντίθετο.

Αιτία: το `config.js:131` δηλώνει `NET_PRICE: 'Net Price'` ως σταθερά. Το πεδίο δεν σερβίρεται. Όποιος αντέγραψε τη σταθερά χωρίς fallback κληρονόμησε το μηδέν.

Σοβαρότητα: **P0** για outstanding / «Όλα τιμολογημένα» · **P1** για το στρατηγικό €0 εσόδων (φαίνεται λάθος αν υπάρχει στόχος).

Επιβεβαιώθηκε πώς: διάβασα `modules/performance.js:52-57` και `:376-379`, `modules/ceo_dashboard.js:491-493`, `:558-566`, `:380-392`, `:770-771`, `modules/invoicing.js:56-72`.

---

### [R7-4] `Matched Export ID` — το κλείδωμα «το import είναι ήδη ταιριασμένο» δεν πυροδοτείται ποτέ

Τι: το ταίριασμα γράφεται **μόνο** στο export, ως `'Matched Import ID'` (`modules/weekly_intl.js:1533`). Ο χάρτης ORDERS έχει `Matched Import ID`, όχι `Matched Export ID`.

Απόδειξη:

```1471:1479:modules/weekly_intl.js
  try {
    const importRec = await atGetOne(TABLES.ORDERS, impId);
    const existingMatch = importRec.fields?.['Matched Export ID'] || importRec.fields?.['Matched Import ID'];
    if (existingMatch) {
      if (typeof showErrorToast === 'function') showErrorToast('This import was already matched by another user. Refreshing...', 'warn');
      …
      return;
    }
```

Στο import record: `Matched Export ID` = undefined (δεν υπάρχει), `Matched Import ID` = undefined (δεν γράφεται εκεί). `existingMatch` πάντα falsy → ο έλεγχος προχωρά. Δύο export μπορούν να γράψουν το ίδιο import id.

Το δεύτερο κλείδωμα (`:1492`, στο export) πιάνει μόνο σύγκρουση στο **ίδιο** export, όχι δύο export στο ίδιο import.

Πόσα σημεία: **1** ανάγνωση (`:1474`).

Τι χαλάει: dispatcher στο Weekly International — drag ενός ήδη ταιριασμένου import σε άλλο export. Βλέπει επιτυχία και στα δύο. Δεν ισχυρίζομαι πόσο συχνά γίνεται· ισχυρίζομαι ότι ο φύλακας δεν μπορεί να πυροδοτηθεί.

Αιτία: το κλείδωμα διαβάζει ένα πεδίο που ουδέποτε μοντελοποιήθηκε (το αντίστροφο link του match).

Σοβαρότητα: **P0** (σιωπηλή αποδοχή διπλού match).

Επιβεβαιώθηκε πώς: διάβασα `modules/weekly_intl.js:1468-1538` και επιβεβαίωσα ότι κανένα `atPatch`/`atSafePatch` στο repo δεν γράφει `'Matched Export ID'` (μόνο `'Matched Import ID'`).

---

### [R7-5] `Last Modified` / `Modified` — το optimistic lock δεν συγκρίνει ποτέ

Τι: κανένας πίνακας του Worker δεν εκπέμπει `'Last Modified'`, `'Modified'` ή `'lastModifiedTime'`. Το `columnToLabel` είναι `fields ∪ computed` (`:1574-1583`).

Απόδειξη:

```856:858:core/api.js
function atTrackVersion(record) {
  if (record && record.id) {
    _recordVersions[record.id] = record.fields?.['Last Modified'] || record.fields?.['Modified'] || null;
```

```877:885:core/api.js
      const currentMod = current.fields?.['Last Modified'] || current.fields?.['Modified'] || null;
      if (currentMod && tracked && currentMod !== tracked) {
        const proceed = confirm('This record was modified by another user…');
```

`tracked` είναι πάντα `null` (`atTrackVersion` γράφει null). Ακόμα κι αν κάποιος το καλούσε μετά από GET, `currentMod` είναι null → η συνθήκη `currentMod && tracked && …` είναι false → **καμία confirm**. Το σχόλιο στο `:140` το λέει: «If no Last Modified field, proceed».

Ίδιο μοτίβο στο offline flush (`core/api.js:129-140`).

Πόσα σημεία: **4 αναγνώσεις** (`:129`, `:858`, `:877`, `:891`) + 1 στο offline (`:129`).

Τι χαλάει: οποιοσδήποτε `atSafePatch` (Daily Ops toggles, Weekly date pick, Ramp Done, …). Δύο χρήστες στο ίδιο record: ο δεύτερος overwrite χωρίς προειδοποίηση. Το UI υπόσχεται conflict detection που ο Worker δεν μπορεί να τροφοδοτήσει.

Σοβαρότητα: **P0** ως νεκρός φύλακας · η ζημιά εξαρτάται από ταυτόχρονη χρήση (ΑΒΕΒΑΙΟ πόσο συχνά).

Επιβεβαιώθηκε πώς: διάβασα `core/api.js:124-145` και `:851-893`· αναζήτηση `'Last Modified'` στον χάρτη TABLES του Worker = 0.

---

### [R7-6] `Source Record` στην ανάγνωση NAT_LOADS — νεκρή διακλάδωση (λανθάνον)

*(Λανθάνον: οι σχετικοί πίνακες είναι άδειοι στην παραγωγή. Ο μηχανισμός στέκει. Δεν το ξαναγράφω ως ενεργό.)*

Τι: alias μόνο για write/filter (`worker/src/index.js:1403-1409`). Στην ανάγνωση επιστρέφεται `'Source Orders'`.

| αρχείο:γραμμή | τι κάνει με το undefined |
|---|---|
| `modules/weekly_natl.js:1548` | `srcId` falsy → η πηγαία NAT_ORDER δεν γίνεται `Assigned`, το `syncOrderDownstream` (`:1551`) δεν καλείται |
| `modules/weekly_natl.js:922-923` | το μπλοκ στάσεων από την πηγή (η διόρθωση owner 12/08) δεν τρέχει → fallback χωρίς παλέτες |
| `modules/orders_intl.js:2797` | ορφανά Direct VS: `if (!src) return false` → η κατηγορία μένει 0· toast «όλα καθαρά» (`:2803-2804`) |

Σοβαρότητα: **P0 μηχανισμός**, λανθάνων μέχρι να γεμίσουν οι πίνακες.

---

### [R7-7] `Order` / `National Order` στη ράμπα — το Done δεν προάγει

*(Επιβεβαιώθηκε: `order_id`, `national_order_id` NULL και στις 30 εγγραφές.)*

Τι: ο RAMP δεν έχει `links` (`worker/src/index.js:873-878`). `modules/daily_ramp.js:671-672` → `getLinkId(undefined)` = `null` (`core/utils.js:386-387`) → το μπλοκ `:678-705` δεν μπαίνει. Toast «Done ✓» (`:707`).

Ίδιο label στο orphan check (`modules/orders_intl.js:2789-2792`): `if (!ordLinks.length) return false` → 0 ορφανά ράμπας, «όλα καθαρά».

Σοβαρότητα: **P0**, επιβεβαιωμένο.

---

### [R7-8] `VS CD Date` στην ανάγνωση — η συνθήκη «λείπει» είναι πάντα αληθής

*(Γνωστό ως WP-1 / A-7. Εδώ μόνο η όψη ανάγνωσης.)*

- `modules/daily_ops.js:163`: `if (ff['VS CD Date'])` πάντα false → πέφτει στην εκτίμηση Loading+1.
- `modules/daily_ops.js:585`: `!r0?.fields['VS CD Date']` πάντα true → προσπαθεί να γράψει σε κάθε In Transit (και χάνεται σιωπηλά στην εγγραφή).
- `modules/weekly_intl.js:932`: `real` πάντα κενό → πάντα `≈` εκτίμηση.

Σοβαρότητα: **P0** (γνωστό).

---

### [R7-9] `emptyLegs` μετρά 0 γιατί τα Summary δεν έρχονται ποτέ

Τι: `core/metrics.js:207-214` παίρνει 3 γράμματα από `'Delivery Summary'` / `'Loading Summary'`. Και τα δύο **δεν υπάρχουν** στον χάρτη ORDERS.

```207:214:core/metrics.js
  function emptyLegs(exports, imports) {
    const exp = exports.map(e => ((e.fields['Delivery Summary']||'').split(',').pop()||'').trim().slice(0,3).toUpperCase());
    const imp = imports.map(i => ((i.fields['Loading Summary']||'').split(',').pop()||'').trim().slice(0,3).toUpperCase());
    …
    const soloExp = exp.filter(r => r && !impSet.has(r)).length;
```

`''` → `filter(Boolean)` τα πετάει → `soloExp = soloImp = 0`. Καλείται από `modules/metrics_audit.js:409` (και εκεί το `fields[]` των ORDERS, `:302-307`, **δεν** ζητά καν τα Summary). Το audit δείχνει 0 άδεια σκέλη = «όλα ζευγαρωμένα».

Πόσα σημεία: **1 συνάρτηση**, 1 caller στο audit. (Το Weekly International τα ανακατασκευάζει από ORDER STOPS — `modules/weekly_intl.js:121-169` — αυτό είναι το σωστό μοτίβο και **δεν** ισχύει εδώ.)

Σοβαρότητα: **P1** (λάθος νούμερο που μοιάζει με «όλα καλά»). Δεν το βάζω P0 γιατί είναι οθόνη audit, όχι ειδοποίηση λήξης.

Επιβεβαιώθηκε πώς: διάβασα `core/metrics.js:207-214` και `modules/metrics_audit.js:302-307`, `:409`.

---

## Β. ΚΕΝΟ ΣΤΗΝ ΟΘΟΝΗ — «—» ή κενό κελί, όχι ψεύτικη ηρεμία

| # | όνομα που ζητείται | πίνακας | παρόμοιο στον χάρτη; | αρχείο:γραμμή (αντιπρόσωποι) | τι κάνει το undefined |
|---|---|---|---|---|---|
| B-1 | `Order Number` | ORDERS | — (δεν υπάρχει· υπάρχει `Reference`) | `modules/invoicing.js:49`, `modules/orders_intl.js:507`, `modules/weekly_intl.js:51`/`783`, `core/utils.js:1186`/`1258`, `modules/metrics_audit.js:373` | `'(χωρίς αριθμό)'` ή `id.slice(-6)`. Το σχόλιο `invoicing.js:42-48` το ξέρει |
| B-2 | `Loading Summary`, `Delivery Summary` | ORDERS | — · σωστό μοτίβο = ORDER STOPS | 37+42 σημεία· κύρια: `invoicing.js:35-36`, `utils.js:1129`, `dashboard.js:174`, `orders_intl.js:118`, `performance.js:640-641` | `'— → —'` στη διαδρομή. **Εξαίρεση:** `weekly_intl.js:162-168` τα χτίζει από στάσεις |
| B-3 | `Client Name`, `Client Summary` | ORDERS | `Client` (link) | `invoicing.js:21`/`862`, `weekly_intl.js:687-688`, `dashboard.js:171`, `ai-chat.js:537` | fallback· η κύρια διαδρομή μέσω `Client` + `getClientName` δουλεύει. Στο `:862` η αναφορά αποτυχίας δείχνει recid |
| B-4 | `Name` | NAT_ORDERS | — | `orders_natl.js:191`, `:132`, `:1970` | `id.slice(-6)` στη λίστα / κενό στο CSV |
| B-5 | `Net Price` (εμφάνιση) | ORDERS | `Price` | `orders_intl.js:590` | σειρά «Net Price» = `—`. (Η αριθμητική είναι R7-3.) |
| B-6 | `TRIPS (Export/Import Order)` | ORDERS | `Truck` / `Partner` | `orders_intl.js:480`, `:529` | badge πάντα «No Trip» (κίτρινο) — **φαίνεται**, δεν κρύβεται |
| B-7 | `Linked Trip`, `NATIONAL TRIPS`, `NATIONAL TRIPS 2` | NAT_ORDERS | `Truck` / `Partner` / `Status` | `orders_natl.js:140`/`171`/`325`/`1969`/`1993` | badge πάντα «Pending» / CSV πάντα Pending. Ίδιο: **φαίνεται** |
| B-8 | `Temp Range Min/Max °C` | (renderer `entity.js:918-919`) | — · κανένας πίνακας | μόνο εκεί· κανένα `columns: [{type:'temp_range'}]` στο `ENTITY_CONFIG` | νεκρός κλάδος renderer — δεν φτάνει στην οθόνη |
| B-9 | `Estimated Cost`, `Workshop` | MAINT_REQ | — (A-4) | `maintenance.js:2279`/`2154` | στήλη/input πάντα κενά |
| B-10 | `Loading Points`, `Delivery Points` | ORDERS | υπάρχουν στον **RAMP** | `daily_ops.js:154-155` (search fallback), `weekly_natl.js:1833-1834` | η αναζήτηση χάνει τη διαδρομή αν λείπουν οι στάσεις |
| B-11 | `National Order ID` | ORDERS | — | `invoicing.js:49` | δεύτερο fallback του B-1, επίσης κενό |
| B-12 | `Delivery Date` | ORDERS / NAT_ORDERS | `Delivery DateTime` | `invoicing.js:148` | fallback· το πρωτεύον υπάρχει |
| B-13 | `_serviceCount`, `_totalSpend`, `_lastUsed` | — | — | `entity.js:511-513` | **όχι ανάγνωση Airtable** — γράφονται στη μνήμη μία γραμμή πάνω. Ψευδώς θετικό του scanner |
| B-14 | `Groupage Lines` (ανάγνωση CL) | CONS_LOADS | — (ρητή απόφαση `:1148-1151`) | `core/order-sync.js:140` | `\|\| []` → `continue`. Λανθάνον (πίνακες άδειοι) |

---

## Γ. ΚΑΤΑΡΡΕΥΣΗ — `undefined.something` → TypeError

Δεν αποδείχθηκε κανένα. Τα σημεία που διαβάζουν άγνωστο label φυλάσσονται:

- `(t.fields[field] \|\| '').substring(0,10)` — `utils.js:1227`, `dashboard.js:328`
- `f['Linked Trip']?.length \|\| 0` — `orders_natl.js:171`
- `getLinkId(undefined)` → `null` — `utils.js:386-387`
- `(s.fields[F.STOP_LOCATION] \|\| [])[0]` — `pallet-feed.js:68`
- `parseFloat(x) \|\| 0` / `Number(x)` — δεν πετάει

Αν υπήρχε crash, θα φαινόταν. Το πρόβλημα αυτού του ελέγχου είναι το αντίθετο.

---

## Δ. Τι ΔΕΝ είναι εύρημα (παγίδες του scanner)

| Label | Γιατί έφυγε |
|---|---|
| `License Plate`, `Active`, `Full Name`, `Company Name`, `City`, `Latitude`, `Longitude` | υπάρχουν στους σωστούς πίνακες (TRUCKS/DRIVERS/CLIENTS/LOCATIONS). Το αρχείο αγγίζει και άλλους πίνακες· ο πρώτος αυτόματος έλεγχος ένωσε λάθος σύνολα |
| `F.STOP_TYPE`, `F.STOP_DATETIME`, `F.STOP_LOCATION`, `F.STOP_PALLETS`, `F.STOP_PALLET_SHEET_OK` | υπάρχουν στον ORDER STOPS |
| `CMR Received`, `CMR Archived`, `Temp Graph Sent` | ο κώδικας ελέγχει `'X' in r.fields` πριν μετρήσει (`performance.js:285-292`, `:366-373`· `ceo_dashboard.js:457-460`). Λείπει το κλειδί → `hasData: false` / proxy, **όχι** «0% = όλα καλά». Το Quality του CEO δείχνει «—» |
| `Dead KM`, `Loaded KM`, `Total KM` | `_calcDeadKM` (`ceo_dashboard.js:495-521`) πέφτει σε εκτίμηση από `Matched Import ID` και τη μαρκάρει `ESTIMATE`. Δεν είναι σιωπηλή καταπίεση γνωστού πεδίου |
| `Date Completed` | fallback δίπλα στο υπαρκτό `Date` του MAINT_HISTORY (`performance.js:341`) |
| `AI Output`, `Created`, `Summary` στο SCAN_TRAINING | ο φύλακας `TABLES.SCAN_TRAINING` είναι `''` (A-8) — οι αναγνώσεις **δεν εκτελούνται** |
| `Unit`/`Source`/`Value Numeric`… | πίνακας `METRICS_SNAPSHOTS` → 404 (A-9), κανένας caller εκτός `metrics.js` |
| `Nat Load` ανάγνωση | ο μηχανισμός (national_load_id NULL) επιβεβαιώθηκε· **0 διπλότυπα** στην παραγωγή — δεν το ξαναγράφω ως ενεργή αλυσίδα |
| `FRC Expiry` στη σελίδα Συντήρησης | **σωστό**. `TRAILER_EXPIRY_FIELDS` (`maintenance.js:18-21`) και `_expiryFieldsFor` (`:45-51`) διαβάζουν FRC. Γι' αυτό η σελίδα Λήξεων είδε το ληγμένο πιστοποιητικό ενώ οι ειδοποιήσεις όχι |

---

## Ε. Δεύτερη παγίδα στο ίδιο FRC — το preload δεν το ζητάει καν

Αυτό ανήκει και στην Εργασία 9· το σημειώνω γιατί αλλάζει την επιδιόρθωση του R7-1.

```729:732:core/api.js
const _REF_FIELDS = {
  trucks:    ['License Plate', 'Active', 'KTEO Expiry', 'KEK Expiry', 'Insurance Expiry'],
  trailers:  ['License Plate', 'Active', 'KTEO Expiry', 'Insurance Expiry'],
```

Το Dashboard (`modules/dashboard.js:22` → `getRefTrailers()`) διαβάζει ATP από αυτό το σύνολο. Ακόμη και αν το `:327` άλλαζε σε `'FRC Expiry'`, το πεδίο **δεν ζητείται** — θα έμενε undefined. Οι ειδοποιήσεις (`utils.js:1109`) ζητούν ATP (λάθος όνομα) και **όχι** FRC. Μόνο το `maintenance.js:149` ζητά και τα δύο (και διαβάζει το σωστό).

---

## ΣΤ. Ρίζα: το `config.js` F κωδικοποιεί φαντάσματα

Το σχόλιο `config.js:101-102` λέει «Single source of truth». Μέσα στο `F` υπάρχουν labels που ο Worker δεν σερβίρει ποτέ:

| σταθερά | τιμή | στον χάρτη Worker; |
|---|---|---|
| `F.ORDER_NUMBER` | `Order Number` | όχι |
| `F.LOADING_SUMMARY` / `F.DELIVERY_SUMMARY` | `Loading/Delivery Summary` | όχι |
| `F.CLIENT_NAME` / `F.CLIENT_SUMMARY` | `Client Name/Summary` | όχι |
| `F.NET_PRICE` | `Net Price` | όχι |
| `F.TRIPS_EXPORT` / `F.TRIPS_IMPORT` | `TRIPS (Export/Import Order)` | όχι |
| `F.PA_NAT_LOAD` | `Nat Load` | όχι (A-1) |

Όποιο module «μετανάστευσε» στις σταθερές κληρονόμησε το κενό. Λεπτομέρεια διπλών ονομάτων → Εργασία 8.

---

## Ζ. Σύνοψη κατάταξης

| Κατηγορία | Πόσα ευρήματα | IDs |
|---|---|---|
| (α) Σιωπηλή καταπίεση, ενεργά | 5 νέα ή επεκτεταμένα | R7-1 (επιβεβαιωμένο), R7-2 (στέκει), R7-3, R7-4, R7-5 |
| (α) Σιωπηλή καταπίεση, ήδη γνωστά / λανθάνοντα | 3 | R7-6, R7-7 (επιβεβαιωμένο), R7-8 |
| (α/P1) Λάθος νούμερο που μοιάζει OK | 1 | R7-9 |
| (β) Κενό στην οθόνη | 12 οικογένειες | B-1…B-12 |
| (γ) Κατάρρευση | 0 | — |

Τα 10 που θα έβαζα πρώτα σε διόρθωση (χωρίς να προχωρήσω σε υλοποίηση):

1. R7-1 ATP→FRC **και** προσθήκη `FRC Expiry` στα `fields[]` ειδοποιήσεων / `_REF_FIELDS.trailers` / metrics_audit
2. R7-3 outstanding / «Όλα τιμολογημένα» → ίδια αλυσίδα με `_invPrice` (`Price`)
3. R7-2 `Total Pallets` στο partner feeder
4. R7-4 κλείδωμα import από την πλευρά των export (`Matched Import ID` = αυτό το import)
5. R7-7 RAMP links (ήδη επιβεβαιωμένο)
6. R7-5 έκθεση `updated_at` ως `Last Modified` ή αφαίρεση του νεκρού lock
7. R7-8 VS CD Date (γνωστό)
8. R7-6 Source Record ανάγνωση = `Source Orders` (λανθάνον)
9. B-6/B-7 badges Trip από `Truck`/`Partner`, όχι από νεκρά reverse links
10. B-1 `Order Number` → `Reference` ή computed

---

## Η. Τι δεν ελέγχθηκε εδώ

- `print.html`, `index.html`, `sw.js` — εκτός του πεδίου `core/`+`modules/`.
- Endpoints εκτός facade (`/pallets/*`, `/costs/*`, `/audit`) — δικά τους σχήματα.
- Αν το deployed Worker είναι **αυτό** το bundle — παραμένει στα ΑΒΕΒΑΙΑ (`05_UNCERTAIN.md` §1).
- `delete_order_cascade`: το SQL **υπάρχει** στο `db/migrations/2026-08-12_wipe_orders.sql` (επιβεβαίωση owner). Δεν είναι πλέον αβέβαιο ως προς την ύπαρξη· το τι ακριβώς σβήνει το σώμα του SQL είναι θέμα άλλης εργασίας, όχι αυτής.

Εργασίες 8, 9, 3–6: δεν ξεκίνησαν. Αυτό το αρχείο είναι μόνο ο χάρτης ανάγνωσης.
