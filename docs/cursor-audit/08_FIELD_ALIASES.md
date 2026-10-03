# ΕΡΓΑΣΙΑ 8 — ΕΝΑ ΠΕΔΙΟ, ΔΥΟ ΟΝΟΜΑΤΑ

Στατικό audit. **Καμία αλλαγή κώδικα.** Κανένας ισχυρισμός για περιεχόμενο της
βάσης: ό,τι λέγεται εδώ αποδεικνύεται από γραμμές αρχείων αυτού του repo.

---

## 0. ΜΕΘΟΔΟΣ — τι σημαίνει «σωστό όνομα» και γιατί η λάθος ονομασία δεν φαίνεται

«Χάρτης του Worker» = το `var TABLES` στο `worker/src/index.js:656-1568`.
22 πίνακες. Για κάθε πίνακα το κλειδί είναι το **Airtable label** και η τιμή
το pg column. Ο χάρτης είναι ΚΑΙ το allowlist εγγραφής (`fields` doubles as the
write allowlist — το λέει ρητά το ίδιο το αρχείο, `worker/src/index.js:912-914`).

Το εξήγαγα προγραμματικά (`eval` του literal 656-1568) ώστε να μη χάσω κλειδιά
χειρωνακτικά· 22 πίνακες, 430 διακριτά labels χρησιμοποιούνται στο front end.

**Τέσσερις νόμοι που κάνουν μια λάθος ονομασία αόρατη.** Και οι τέσσερις
διαβάστηκαν στο αρχείο:

| # | Διαδρομή | Κώδικας | Τι κάνει με ΑΓΝΩΣΤΟ label |
|---|---|---|---|
| 1 | ΑΝΑΓΝΩΣΗ | `toAirtableRecord` `worker/src/index.js:1909-1918` | Το πεδίο απλώς **δεν υπάρχει** στην απάντηση. Ίδιο αποτέλεσμα και για τιμή NULL. |
| 2 | `fields[]` request | `handleFacadeGet` `worker/src/index.js:1937-1941` | `if (col) cols.push(col)` — **σιωπηλά αγνοείται**, χωρίς σφάλμα. |
| 3 | ΕΓΓΡΑΦΗ | `fieldsToColumns` `worker/src/index.js:1589-1597` | `if (column) row[column] = value` — **σιωπηλά πέφτει**. Σφάλμα ΜΟΝΟ αν πέσουν ΟΛΑ (`worker/src/index.js:2292-2294` → 400 «No writable fields in request»). |
| 4 | ΦΙΛΤΡΟ | `resolveColumn` `worker/src/index.js:1685-1691` | **ΠΕΤΑΕΙ** `UnsupportedFilter` → 422 (`worker/src/index.js:1950-1955`). |

Άρα ο κανόνας του έργου: **λάθος όνομα σε read/write = σιωπή· λάθος όνομα σε
filter = 422.** Ένα PATCH με δύο πεδία, ένα σωστό και ένα λάθος, γυρίζει 200
και γράφει μόνο το σωστό. Αυτός είναι ο μηχανισμός που παράγει την κατηγορία
«χαμένη εγγραφή με ένδειξη επιτυχίας».

**Απόδειξη νόμου 3 (ο πιο επικίνδυνος), `worker/src/index.js:1589-1597`:**

```js
function fieldsToColumns(cfg, fields) {
  const row = {};
  if (!fields || typeof fields !== "object") return row;
  for (const [label, value] of Object.entries(fields)) {
    const column = cfg.fields[label] || (cfg.aliases || {})[label];
    if (column) row[column] = value;          // ← αλλιώς: τίποτα, καμία αναφορά
  }
  return row;
}
```

---

## 8α — ΠΑΡΑΛΛΑΓΕΣ ΟΝΟΜΑΤΩΝ

### [R8-1] Η ημερομηνία Cross-Dock έχει δύο ονόματα· γράφεται με το ένα και διαβάζεται με το άλλο
**Τι:** Το ίδιο πεδίο λέγεται `Cross-dock Date` στη φόρμα παραγγελίας (σωστό
κατά τον Worker) και `VS CD Date` σε Daily Ops, Weekly International και
print (ανύπαρκτο).

**Απόδειξη:**

Ο χάρτης του Worker για ORDERS ξέρει ΜΟΝΟ το ένα, `worker/src/index.js:1007`:

```js
      "Cross-dock Date": "cross_dock_date",
```

Το `VS CD Date` **δεν υπάρχει σε κανέναν από τους 22 πίνακες** του χάρτη.

Ποιος γράφει το σωστό — `modules/orders_intl.js:1467-1471`:

```js
      const _cdDt = _cdDate ? _cdDate + 'T12:00:00.000Z' : null;
      fields['Cross-dock Date'] = _cdDt;
      ...
    } else {
      fields['Cross-dock Date'] = null;
    }
```

Ποιος χρησιμοποιεί το λάθος — 14 σημεία, 3 αρχεία:

```
modules/daily_ops.js:21    'Veroia Switch','VS CD Date',                    ← fields[] request
modules/daily_ops.js:48    IS_SAME({VS CD Date},'${tgt}','day')             ← filterByFormula
modules/daily_ops.js:163   if(ff['VS CD Date']) return String(ff['VS CD Date'])   ← 2 αναγνώσεις
modules/daily_ops.js:585   && !r0?.fields['VS CD Date']                     ← ανάγνωση
modules/daily_ops.js:586   patch['VS CD Date']=localToday();                ← ΕΓΓΡΑΦΗ
modules/daily_ops.js:589   r.fields['VS CD Date']=patch['VS CD Date']       ← τοπικό state
modules/weekly_intl.js:762  onclick="_wk3PickDate(event,'…','VS CD Date',…)"  ← ΕΓΓΡΑΦΗ
modules/weekly_intl.js:932  const real=f?.['VS CD Date'];                   ← ανάγνωση
modules/weekly_intl.js:955  if(field!=='VS CD Date'){                       ← κλάδος
modules/weekly_intl.js:1157 onclick="_wk3PickDate(event,'…','VS CD Date',…)"  ← ΕΓΓΡΑΦΗ
modules/weekly_intl.js:1179 onclick="_wk3PickDate(event,'…','VS CD Date',…)"  ← ΕΓΓΡΑΦΗ
print.html:400              var vcd=f['VS CD Date']?String(f['VS CD Date']):null   ← 2 αναγνώσεις
print.html:414              var vDt=f['VS CD Date']?…                       ← ανάγνωση
print.html:443              var vDt=f['VS CD Date']?…                       ← ανάγνωση
```

**Πόσα σημεία:** 21 εμφανίσεις του string σε 14 γραμμές / 3 αρχεία (λάθος
όνομα) έναντι 2 γραμμών σε 1 αρχείο (σωστό όνομα).

**Τι χαλάει — τρία διαφορετικά πράγματα, από το ίδιο λάθος:**

1. **Χαμένη εγγραφή με πράσινο toast (P0).** `modules/daily_ops.js:581-593`:
   ο dispatcher πατά «Σε μεταφορά» σε VS export. Το patch είναι
   `{'Status':'In Transit','VS CD Date':localToday()}`. Ο Worker κρατά το
   `Status`, **πετάει το `VS CD Date`** (νόμος 3), απαντά 200. Η γραμμή 589
   γράφει την ημερομηνία στο **τοπικό** αντικείμενο, η 593 δείχνει
   `toast(st+' ✓')`. Ο χρήστης βλέπει την ημερομηνία αναχώρησης από το
   Cross-Dock στην οθόνη· μετά το reload δεν υπάρχει. Καμία αναφορά, πουθενά.

2. **422 και σιωπηλή υποβάθμιση της λίστας της ημέρας (P1).**
   `modules/daily_ops.js:48` βάζει το `{VS CD Date}` σε filterByFormula →
   νόμος 4 → 422. Το `catch` στη γραμμή 57 πέφτει στο `dayFOld` (γραμμή 49)
   με **μόνο** `console.warn`:

   ```js
   }catch(e){
     // Πριν το worker deploy του VS CD Date το νέο φίλτρο μπορεί να απορριφθεί —
     // πέφτουμε στο παλιό, η σελίδα δεν σπάει ποτέ.
     console.warn('[ops] VS dayF fallback:', e.message);
   ```

   Το `dayFOld` χάνει ΚΑΙ τον όρο `AND({Veroia Switch}=1, IS_SAME({Loading
   DateTime},prev,'day'))`. Δηλαδή η Daily Ops δεν είναι «λίγο λιγότερο
   ακριβής»: το σκέλος VS που εμφανίζεται τη μέρα του Cross-Dock λείπει.
   Το σχόλιο υποθέτει «πριν το worker deploy» — ο Worker δεν έχει ούτε θα
   αποκτήσει αυτό το label· έχει άλλο.

3. **Η πραγματική ημερομηνία υπάρχει και δεν εμφανίζεται ποτέ (P1).**
   Το `Cross-dock Date` **γράφεται** από τη φόρμα (orders_intl.js:1468) και
   **δεν διαβάζεται από πουθενά** — 0 αναγνώσεις σε όλο το repo. Οι τρεις
   οθόνες που το θέλουν διαβάζουν `VS CD Date`, παίρνουν `undefined`, και
   πέφτουν στην εκτίμηση Loading+1 / Delivery−1, την οποία σημαίνουν με «≈»
   (`modules/weekly_intl.js:931-938`). Στο Weekly ο χρήστης βλέπει μόνιμα
   «εκτίμηση» για κάτι που είναι καταγεγραμμένο.

**Δύο διαδρομές εγγραφής, ένα λάθος, δύο συμπεριφορές — αξίζει προσοχή:**
το Weekly (`modules/weekly_intl.js:961`) στέλνει `{[field]: val}` **μόνο** με το
`VS CD Date`. Πέφτουν ΟΛΑ τα πεδία → ο Worker γυρίζει 400 «No writable fields
in request» (`worker/src/index.js:2292-2294`) → κόκκινο toast + `reportError`
(γραμμή 965). **Θορυβώδης αποτυχία.** Η Daily Ops στέλνει το ίδιο λάθος πεδίο
μαζί με ένα σωστό → 200 και σιωπή. Η σοβαρότητα δεν εξαρτάται από το λάθος,
εξαρτάται από το αν έτυχε να ταξιδεύει με ένα σωστό πεδίο δίπλα του.

**Αιτία:** το label δεν επιβεβαιώθηκε ποτέ απέναντι στον χάρτη, και ο μόνος
μηχανισμός που θα το έπιανε (νόμος 4, το 422) είχε από πριν catch που «η
σελίδα δεν σπάει ποτέ».

**Σοβαρότητα:** P0.
**Επιβεβαιώθηκε πώς:** διάβασα `worker/src/index.js` 978-1079 (χάρτης ORDERS),
1589-1597, 2281-2294· `modules/daily_ops.js` 14-70 και 580-593·
`modules/weekly_intl.js` 925-970· `modules/orders_intl.js` 1450-1480·
`print.html` 392-450.

---

### [R8-2] `ATP Expiry` vs `FRC Expiry` — το πιστοποιητικό ψύξης της ρυμούλκας (ο σπόρος, επεκτεταμένος)
**Τι:** Το πεδίο λήξης πιστοποιητικού ψύξης ρυμούλκας λέγεται `FRC Expiry`
(σωστό) σε 10 γραμμές και `ATP Expiry` (ανύπαρκτο) σε 6.

Ο ίδιος ο κώδικας **τεκμηριώνει** ότι είναι το ίδιο πράγμα με δύο ονόματα —
`modules/maintenance.js:27`:

```
 * Το FRC είναι πιστοποιητικό ψυκτικού θαλάμου (ATP): οι κουρτίνες δεν το
 * εκδίδουν ποτέ, οπότε το κενό πεδίο ΔΕΝ είναι έλλειψη.
```

Δηλαδή η γνώση ότι ATP = FRC υπάρχει γραμμένη· δεν έφτασε ποτέ στα πέντε άλλα
αρχεία.

**Απόδειξη — ο Worker, `worker/src/index.js:734-750` (TRAILERS):**

```js
      "KTEO Expiry": "kteo_expiry",
      "Insurance Expiry": "insurance_expiry",
      "FRC Expiry": "frc_expiry",
```

Το `ATP Expiry` δεν υπάρχει πουθενά στον χάρτη. Το `KEK Expiry` υπάρχει μόνο
στα **TRUCKS** (`worker/src/index.js:725`), όχι στις ρυμούλκες.

**ΣΩΣΤΟ (`FRC Expiry`) — 10 γραμμές, 3 αρχεία:**
```
core/entity.js:243          { f: 'FRC Expiry', label: 'ATP/FRC έως', type: 'date' }
core/entity.js:250          fields: ['KTEO Expiry','FRC Expiry','Insurance Expiry','Notes']
core/entity.js:428          : ['KTEO Expiry','FRC Expiry','Insurance Expiry']
core/ai-chat.js:554         obj.frc = f['FRC Expiry'] || null;
core/ai-chat.js:1259        fields: ['License Plate','Active','KTEO Expiry','FRC Expiry','Insurance Expiry']
core/ai-chat.js:1283        [['KTEO Expiry','KTEO'],['FRC Expiry','FRC'],['Insurance Expiry','Insurance']]
modules/maintenance.js:20   { field: 'FRC Expiry', label: 'FRC' }
modules/maintenance.js:47   if (ef.field !== 'FRC Expiry') return true;
modules/maintenance.js:149  'ATP Expiry','KTEO Expiry','Insurance Expiry','FRC Expiry',
modules/maintenance.js:1899 ${_maintCompBlock(f['FRC Expiry'], 'FRC')}
```
Το `core/entity.js:243` έχει το αποκαλυπτικό label `'ATP/FRC έως'`: ο ίδιος
κώδικας ξέρει ότι υπάρχουν δύο ονόματα και δεν αποφασίζει ποιο.
(`modules/maintenance.js:618` γράφει `'KEK/FRC Expiry'` — είναι επικεφαλίδα
CSV, όχι όνομα πεδίου· δεν μετριέται.)

**ΛΑΘΟΣ (`ATP Expiry`) — 6 γραμμές, 5 αρχεία:**
```
core/utils.js:1109        atGetAll(TABLES.TRAILERS, { fields: ['License Plate','ATP Expiry','Insurance Expiry'] }, true)
core/utils.js:1240        checkDocs(trailers, 'License Plate', ['ATP Expiry','Insurance Expiry'])
core/metrics.js:363       const a = _toISO(t.fields['ATP Expiry']); if (a && a <= cutoff) atp.push(t)
modules/dashboard.js:327  ['ATP Expiry', 'Insurance Expiry'].forEach(field => {
modules/maintenance.js:149 'ATP Expiry','KTEO Expiry','Insurance Expiry','FRC Expiry',
modules/metrics_audit.js:311 fields: ['License Plate','ATP Expiry','Insurance Expiry']
```

**Πόσα σημεία:** 6 γραμμές λάθος / 10 γραμμές σωστά. Το `modules/maintenance.js:149` ζητά **και
τα δύο** στο ίδιο `fields[]` — γι' αυτό η σελίδα Συντήρησης δείχνει σωστά (το
`FRC Expiry` έρχεται) ενώ το Dashboard και το metrics δείχνουν κενό.

**Τι χαλάει:** ο Dashboard (`modules/dashboard.js:324-335`) χτίζει τα
`fleetAlerts` για ρυμούλκες διατρέχοντας `['ATP Expiry','Insurance Expiry']`.
Το πρώτο είναι πάντα `undefined` → `(f[field] || '').substring(0,10)` → `''` →
`if (dt && …)` false → **κανένα alert για ληγμένο πιστοποιητικό ψύξης, ποτέ**.
Ίδια σιωπή στο `core/utils.js:1240` (ειδοποιήσεις Thodoris/management) και στο
`core/metrics.js:358-366` (`expiryAlertsTrailers` γυρίζει πάντα `atp: []`).
Ο χρήστης δεν βλέπει λάθος νούμερο — βλέπει «όλα καλά».

**Αιτία:** ATP είναι το παλιό εμπορικό όνομα του πιστοποιητικού (Συμφωνία ATP),
FRC ο κωδικός κλάσης. Κανένας δεν είναι λάθος στα ελληνικά του κλάδου· λάθος
είναι ότι ο χάρτης ξέρει το ένα και ο κώδικας γράφτηκε με το άλλο, και ο
νόμος 2 δεν διαμαρτύρεται.

**Σοβαρότητα:** P1 (κρυμμένο ρίσκο συμμόρφωσης — «ο χρήστης βλέπει ήσυχη οθόνη
για ληγμένο έγγραφο»). Το εύρημα R7-1 στέκει ανεξάρτητα: η ρυμούλκα με το
ληγμένο πιστοποιητικό δεν θα εμφανιστεί σε καμία από αυτές τις τρεις οθόνες.
**Επιβεβαιώθηκε πώς:** διάβασα `worker/src/index.js` 734-750 και 715-733·
`modules/dashboard.js` 318-336· `core/utils.js` 1104-1120 και 1232-1241·
`core/metrics.js` 355-367· `modules/maintenance.js` 140-160 και 15-50.

---

### [R8-3] `Groupage Lines` — το φίλτρο που κυνηγά τον σύνδεσμο από τη λάθος πλευρά, σε 8 διαδρομές διαγραφής
**Τι:** Ο σύνδεσμος GL↔CL υπάρχει **μόνο** στην πλευρά του GL
(`Linked Consolidated Load`). Οκτώ σημεία τον ψάχνουν από την πλευρά του CL,
με label `Groupage Lines` που δεν υπάρχει στον χάρτη.

**Απόδειξη — ο Worker το λέει ρητά, `worker/src/index.js:1143-1152`:**

```js
    links: {
      "Loading Location": { column: "loading_location_id", table: "locations" },
      ...
      // GL->CL is the REAL direction (0016 / spec §3 reconciliation); the CL-side
      // 'Groupage Lines' field the old code read is never populated, so it is not
      // modeled here. An Unassigned GL has no CL yet (FK null -> label omitted).
      "Linked Consolidated Load": { column: "cons_load_id", table: "consolidated_loads" }
```

Και ο κώδικας **γράφει** σωστά αυτή την πλευρά, `modules/orders_natl.js:488-490`:

```js
  for (const glId of created.gls) {
    try { await atPatch(TABLES.GL_LINES, glId, { 'Linked Consolidated Load': [cl.id] }); }
```

**Πόσα σημεία:** 10 εμφανίσεις σε 8 κλήσεις, 3 αρχεία — **όλες** στο ίδιο
μοτίβο `FIND("<glId>",ARRAYJOIN({Groupage Lines},","))>0` πάνω σε `CONS_LOADS`:

```
core/order-sync.js:125        (+ γραμμή 126 στο fields[], + γραμμή 140 ανάγνωση cl.fields['Groupage Lines'])
modules/orders_intl.js:1198   _deleteGrpForIntl
modules/orders_intl.js:1557   (restore μονής παραγγελίας)
modules/orders_intl.js:2580   (διαγραφή international order)
modules/orders_intl.js:2709   (bulk διαγραφή)
modules/orders_intl.js:2822   (καθάρισμα orphan GL)
modules/orders_natl.js:1066   (stale GL cleanup)
modules/orders_natl.js:1493   (restore national)
```

**Τι χαλάει:**

1. **Ορφανά CONSOLIDATED LOADS (P0).** Και οι 7 διαδρομές διαγραφής/restore
   χρησιμοποιούν αυτό το φίλτρο για να βρουν το CL που πρέπει να σβήσουν.
   Νόμος 4 → 422 → δεν επιστρέφεται κανένα CL → η `for (const cl of cls)`
   δεν εκτελείται → **το CL μένει στη βάση**. Στο `modules/orders_intl.js:1197`
   δεν υπάρχει `.catch(()=>[])`, οπότε πετάει και πιάνεται στο 1207 με
   `logError` — η καθαριότητα σταματά, ο χρήστης δεν μαθαίνει. Ο σχεδιασμός
   λέει ρητά ότι το CL είναι ο ΜΟΝΟΣ κόμβος που επιτρέπεται να σβήνει
   (`worker/src/index.js:1154-1161`); αυτό είναι το πράγμα που δεν σβήνει.
2. **Ο επανυπολογισμός των συνόλων του CL δεν εκτελείται ποτέ (P1).**
   `core/order-sync.js:140-141`:
   ```js
   const clGlIds = cl.fields['Groupage Lines'] || [];
   if (!clGlIds.length) continue;
   ```
   Το label δεν έρχεται ποτέ (νόμος 1) → `[]` → `continue`. Τα
   `Total Pallets` / `Temperature C` / `Goods` του CL δεν ενημερώνονται μετά
   από αλλαγή σε GL. Δεν υπάρχει σφάλμα να δει κανείς: το `|| []` το κάνει
   «δεν έχει γραμμές».
3. Στο `modules/orders_intl.js:2829` η ίδια διαδρομή προσπαθεί
   `atDelete(TABLES.GL_LINES, gl.id)` — δηλαδή διαγραφή GL, που ο σχεδιασμός
   απαγορεύει (`worker/src/index.js:1116-1121`: RBAC grants NO DELETE on
   groupage_lines). Θα πάρει 403 και θα προσαυξήσει `_delFail`. Καταγράφεται
   ξεχωριστά στην ΕΡΓΑΣΙΑ 4/5, εδώ μόνο ως συνέπεια της ίδιας διαδρομής.

**Αιτία:** ο σύνδεσμος μοντελοποιήθηκε με μία κατεύθυνση στη Supabase, ο
παλιός Airtable κώδικας διάβαζε την άλλη, και το 422 πέφτει σε `.catch(()=>[])`
ή σε `logError` — ποτέ σε οθόνη.
**Σοβαρότητα:** P0.
**Επιβεβαιώθηκε πώς:** διάβασα `worker/src/index.js` 1115-1152 και 1154-1230·
`core/order-sync.js` 118-170· `modules/orders_intl.js` 1190-1217, 1554-1572,
2577-2592, 2706-2730, 2819-2830· `modules/orders_natl.js` 455-491, 1062-1082,
1490-1506.

---

### [R8-4] Τα formula πεδία των ORDERS: έξι labels, 156 σημεία, μηδέν δεδομένα
**Τι:** Ο Worker εξηγεί ότι τα derived formula πεδία των ORDERS **δεν**
μοντελοποιήθηκαν. Δύο από αυτά σώθηκαν σε view (`computed`). Τα υπόλοιπα έξι
συνεχίζουν να διαβάζονται από όλο το front end.

**Απόδειξη — `worker/src/index.js:1077-1078`, μέσα στο `fields` των ORDERS:**

```js
      // DERIVED (formula) fields are intentionally absent: Order Number, Net
      // Price, Total Pallets, Week Number, Loading/Delivery Summary, Created By.
```

Δύο **σώθηκαν** μέσω του view (`worker/src/index.js:968-972`):

```js
    readView: "orders_with_derived",
    computed: {
      "Week Number": "week_number",
      "Total Pallets": "total_pallets"
    },
```

Τα άλλα **όχι**. Επαληθεύτηκε προγραμματικά ότι τα παρακάτω labels δεν
υπάρχουν σε **κανέναν** από τους 22 πίνακες:

| Label | Εμφανίσεις | Αρχεία |
|---|---|---|
| `Delivery Summary` | 49 | print.html, core/utils.js, core/entity.js, core/ai-chat.js, core/metrics.js, weekly_intl, dashboard, performance, orders_intl, invoicing |
| `Loading Summary` | 45 | print.html, core/utils.js, core/entity.js, core/metrics.js, dashboard, weekly_intl, orders_intl, invoicing, performance |
| `Order Number` | 31 | print.html, core/utils.js, core/api.js, orders_intl, invoicing, pallet_upload, metrics_audit, performance, weekly_intl, weekly_natl, dashboard |
| `Client Name` | 23 | core/utils.js, core/ai-chat.js, invoicing, weekly_intl, ceo_dashboard, dashboard |
| `Net Price` | 18 | ceo_dashboard, performance, orders_intl, invoicing |
| `Client Summary` | 15 | core/utils.js, dashboard, invoicing, weekly_intl |

**Πόσα σημεία:** 181 εμφανίσεις, 6 labels, 15 αρχεία.

**Τι χαλάει:**

- **Ο αριθμός παραγγελίας στην τιμολόγηση δεν μπορεί να εμφανιστεί ΠΟΤΕ.**
  `modules/invoicing.js:42-50`:
  ```js
  return rec.fields['Order Number'] || rec.fields['National Order ID'] || '(χωρίς αριθμό)';
  ```
  Και τα δύο labels είναι ghosts (`National Order ID`: 1 σημείο, ανύπαρκτο).
  Το σχόλιο από πάνω εξηγεί σωστά γιατί απορρίφθηκε το `rec.id.slice(-6)`· το
  αποτέλεσμα όμως είναι ότι **η στήλη γράφει πάντα «(χωρίς αριθμό)»**. Η
  Eirini δεν έχει κανέναν αριθμό να βάλει στο τιμολόγιο.
- **Η διαδρομή στην τιμολόγηση.** `modules/invoicing.js:33-40` (`_invRoute`):
  `Loading Summary` → `Delivery Summary` → και τα δύο κενά → «— → —».
- **Η επωνυμία πελάτη έχει fallback που κρατά.** `modules/invoicing.js:17-22`
  προσπαθεί πρώτα `getClientName(id)` από το `Client` link (υπαρκτό) και
  ΜΕΤΑ τα δύο ghosts. Άρα εδώ η αλυσίδα σώζει. Το ίδιο ΔΕΝ ισχύει στο
  `core/utils.js:1258` ή στο `modules/dashboard.js:171,290`, όπου η σειρά είναι
  αντίστροφη ή το link δεν ζητήθηκε.
- **`Net Price`:** ΑΝΥΛΟΠΟΙΗΤΟ ΣΧΕΔΙΟ, όχι σφάλμα — ο owner το σχεδίασε για
  τον επιμερισμό τιμής VS (650 € στο εθνικό leg) και το ανέβαλε ως το PnL.
  Καταγράφεται εδώ μόνο για να φανεί η **συνέπεια στον κώδικα που γράφτηκε
  σαν να υπάρχει**: `modules/invoicing.js:58-73`:
  ```js
  function _invPrice(rec) {
    const v = parseFloat(f['Price']);        if (Number.isFinite(v)) return v;
    const v2 = parseFloat(f['Net Price']);   if (Number.isFinite(v2)) return v2;
    const v3 = parseFloat(f['Total Price'] || f['Amount'] || f['Revenue']);
    return Number.isFinite(v3) ? v3 : 0;
  }
  function _invNetPrice(rec) {
    const v = parseFloat(f['Net Price']);    if (Number.isFinite(v)) return v;
    const v2 = parseFloat(f['Price']);       return Number.isFinite(v2) ? v2 : 0;
  }
  ```
  `Net Price`, `Total Price`, `Amount`, `Revenue` — τέσσερα labels, **και τα
  τέσσερα ανύπαρκτα**. Άρα `_invNetPrice` επιστρέφει το **ακαθάριστο** `Price`.
  Η στήλη λέει «Net» και δείχνει gross. Για μια παραγγελία VS αυτό είναι
  ολόκληρη η τιμή, μαζί με το εθνικό σκέλος που ο owner θέλει χωριστά.
  Δεν είναι λάθος προς διόρθωση σήμερα· είναι η ένδειξη ότι όταν έρθει το PnL
  η ίδια οθόνη θα αλλάξει νούμερο χωρίς να αλλάξει κώδικας.

**Αιτία:** το cutover μετέφερε δύο formula πεδία σε view και άφησε τα άλλα
έξι· καμία από τις 181 αναγνώσεις δεν παράγει σφάλμα (νόμοι 1-2).
**Σοβαρότητα:** P1 (λάθος/κενό νούμερο σε οθόνη). Το `Net Price` ξεχωριστά:
ΑΝΥΛΟΠΟΙΗΤΟ ΣΧΕΔΙΟ.
**Επιβεβαιώθηκε πώς:** διάβασα `worker/src/index.js` 961-1079·
`modules/invoicing.js` 15-75· έμετρα τις εμφανίσεις με `rg -o` ανά label.

---

### [R8-5] `CMR Photo Received` / `CMR Received` / `CMR Archived` — τρία ονόματα, ένα υπαρκτό, δύο δείκτες που γίνονται proxy
**Τι:** Ο Worker ξέρει `CMR Photo Received` (ORDERS + NATIONAL ORDERS). Το
`performance.js` δοκιμάζει επιπλέον `CMR Received` και `CMR Archived`, που δεν
υπάρχουν, και όταν αποτύχει ο έλεγχος ύπαρξης **αλλάζει μετρική** χωρίς να το πει.

**Απόδειξη — `worker/src/index.js:1029` (ORDERS) και `:1284` (NATIONAL ORDERS):**
```js
      "CMR Photo Received": "cmr_photo_received",
```

`modules/performance.js:282-293`:
```js
  // CMR collected — use explicit 'CMR Photo Received' or 'CMR Received' field if present,
  // fall back to Delivery Performance presence as proxy only if field is missing entirely.
  const cmrFieldPresent = deliveredForCmr.some(r => 'CMR Photo Received' in r.fields || 'CMR Received' in r.fields);
  let cmr_collected;
  if (cmrFieldPresent) { … }
  else {
    // Proxy: Delivery Performance set implies order was closed with docs
    cmr_collected = withPerf.length && deliveredForCmr.length ? Math.round(withPerf.length / deliveredForCmr.length * 100) : 0;
  }
```

`modules/performance.js:363-374` κάνει το ίδιο με `CMR Archived` (ghost, 3
εμφανίσεις, μόνο σε αυτό το αρχείο) και proxy το `Status==='Invoiced'`.

**Πόσα σημεία:** 3 labels, 6 γραμμές, 1 αρχείο. `CMR Received` 3 εμφανίσεις,
`CMR Archived` 3.

**Τι χαλάει:** ο έλεγχος `in r.fields` είναι διπλά τρωτός (βλ. 8δ): αποτυγχάνει
και όταν το πεδίο **δεν ζητήθηκε/δεν υπάρχει**, και όταν υπάρχει αλλά είναι
**NULL/false σε όλες** τις παραδομένες παραγγελίες — γιατί ο
`toAirtableRecord` παραλείπει τα null. Δηλαδή: όσο κανείς δεν έχει τσεκάρει
CMR, ο δείκτης «CMR collected» **σιωπηλά αλλάζει σε ποσοστό Delivery
Performance**. Ο management βλέπει ένα ποσοστό με τίτλο «CMR» που μετρά κάτι
άλλο. Δεν είναι κενό — είναι εύλογο και λάθος.
**Αιτία:** «χρησιμοποίησε ό,τι υπάρχει» χωρίς πηγή αλήθειας για το τι υπάρχει.
**Σοβαρότητα:** P1.
**Επιβεβαιώθηκε πώς:** διάβασα `modules/performance.js` 280-300 και 335-380·
`worker/src/index.js` 1029, 1284, 1909-1918.

---

### [R8-6] `Last Modified` / `Modified` / `lastModifiedTime` — ο έλεγχος σύγκρουσης είναι νεκρός επειδή το πεδίο δεν υπάρχει
**Τι:** Ο optimistic-locking μηχανισμός (`atSafePatch`) και ο έλεγχος
σύγκρουσης της offline ουράς κρίνονται με τρία labels, **κανένα** από τα οποία
δεν υπάρχει σε κανέναν πίνακα του χάρτη.

**Απόδειξη:**

`core/api.js:856-860` — τι καταγράφεται ως «έκδοση»:
```js
function atTrackVersion(record) {
  if (record && record.id) {
    _recordVersions[record.id] = record.fields?.['Last Modified'] || record.fields?.['Modified'] || null;
  }
}
```

`core/api.js:866-894` — πώς χρησιμοποιείται:
```js
async function atSafePatch(tableId, recId, fields) {
  const tracked = _recordVersions[recId];
  if (tracked) {                                    // ← ποτέ αληθές
    …
    const currentMod = current.fields?.['Last Modified'] || current.fields?.['Modified'] || null;
    if (currentMod && tracked && currentMod !== tracked) { … confirm(…) }
  }
  const result = await atPatch(tableId, recId, fields);
```

`core/api.js:129` — η offline ουρά:
```js
const lastMod = currentData.fields['Last Modified'] || currentData.fields['lastModifiedTime'];
```
με το σχόλιο στη γραμμή 140: `// If no Last Modified field, proceed with the
mutation (can't detect conflicts)`.

**Πόσα σημεία:** 3 labels, 5 γραμμές (`core/api.js` 129, 858, 877, 891 + το
`F.LAST_MODIFIED` στο `config.js:300`).

**Τι χαλάει:** `_recordVersions[recId]` είναι πάντα `null` → `if (tracked)`
πάντα false → **ο έλεγχος «κάποιος άλλος το άλλαξε» δεν εκτελείται ποτέ**.
Κάθε `atSafePatch` είναι απλό `atPatch`. Συνέπεια στον καλούντα:
`modules/orders_natl.js:942-943`
```js
      const patchRes = await atSafePatch(TABLES.NAT_ORDERS, recId, fields);
      if (patchRes?.conflict) { toast('Record modified by another user — reload and try again','warn'); return; }
```
Το `conflict` γυρίζει μόνο από τη γραμμή 883 του `api.js`, μέσα στο `if
(tracked)` — άρα ο κλάδος είναι **αδύνατο** να εκτελεστεί. Δύο dispatcher στην
ίδια παραγγελία: ο δεύτερος γράφει πάνω από τον πρώτο, σιωπηλά, και η
προστασία που φαίνεται να υπάρχει στον κώδικα δεν υπάρχει στην πράξη.
Το ίδιο για την offline ουρά — εκεί τουλάχιστον υπάρχει σχόλιο που το παραδέχεται.
**Αιτία:** το Airtable έδινε `lastModifiedTime` σε ειδικό πεδίο· ο facade δεν
εκθέτει τίποτα αντίστοιχο και κανείς δεν ξαναέλεγξε τον locking κώδικα.
**Σοβαρότητα:** P1 (σιωπηλή απώλεια της αλλαγής του άλλου χρήστη· δεν το
βαθμολογώ P0 γιατί απαιτεί ταυτόχρονη επεξεργασία).
**Επιβεβαιώθηκε πώς:** διάβασα `core/api.js` 114-166, 855-894·
`modules/orders_natl.js` 940-945· επαλήθευσα την απουσία των τριών labels στα
22 tables του χάρτη προγραμματικά.

---

### [R8-7] Πεδία λήξης εγγράφων στη Συντήρηση που δεν υπάρχουν στον χάρτη
**Τι:** Η σελίδα Συντήρησης ζητά 5 labels για TRUCKS/TRAILERS που δεν υπάρχουν.

**Απόδειξη — `modules/maintenance.js:144-152`:**
```js
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Brand','Model','Year','Active',
        'KTEO Expiry','Insurance Expiry','Tachograph Expiry','ADR Expiry','KEK Expiry',
        'Insurance Partner','Next Maintenance Date'] }, true),
      atGetAll(TABLES.TRAILERS, { fields: ['License Plate','Brand','Model','Year','Trailer Type','Active',
        'ATP Expiry','KTEO Expiry','Insurance Expiry','FRC Expiry',
        'Pallet Capacity','Next Maintenance Date'] }, true),
```

Έναντι `worker/src/index.js:715-750`. Άγνωστα: `Tachograph Expiry`,
`ADR Expiry`, `Next Maintenance Date` (TRUCKS), `ATP Expiry` (R8-2),
`Pallet Capacity`, `Next Maintenance Date` (TRAILERS).

**Πόσα σημεία:** 5 διακριτά ghost labels σε 2 κλήσεις.
**Τι χαλάει:** νόμος 2 — σιωπηλά αγνοούνται. Ό,τι στη σελίδα εξαρτάται από
ταχογράφο, ADR ή «επόμενη συντήρηση» μένει κενό χωρίς εξήγηση.
**Αιτία:** το `fields[]` γράφτηκε από το παλιό Airtable schema.
**Σοβαρότητα:** P2 (κενό, όχι λάθος νούμερο) — εκτός του `ATP Expiry` που
είναι P1 στο R8-2.
**Επιβεβαιώθηκε πώς:** διάβασα `modules/maintenance.js` 140-160 και
`worker/src/index.js` 715-751.

---

### [R8-8] `Linked Trip` / `NATIONAL TRIPS` / `NATIONAL TRIPS 2` — η στήλη «ΔΡΟΜΟΛΟΓΙΟ» δεν μπορεί να δείξει «Assigned»
**Τι:** Τρία labels για τον ίδιο σκοπό (σύνδεση με TRIPS), όλα ανύπαρκτα, και
ο κώδικας τα προσθέτει και τα τρία για να βγάλει ένα boolean.

**Απόδειξη — `modules/orders_natl.js:140`:**
```js
  { key: 'trip', label: 'ΔΡΟΜΟΛΟΓΙΟ', type: 'text',
    get: (f) => ((f['Linked Trip']?.length||0)+(f['NATIONAL TRIPS']?.length||0)+(f['NATIONAL TRIPS 2']?.length||0))>0?'Assigned':'Pending' },
```
Ίδιο μοτίβο στη γραμμή 171 (`_onRowHtml`), και στις 303, 306, 325, 1969, 1993.

Ο Worker για NATIONAL ORDERS (`worker/src/index.js:1238-1320`) δεν έχει κανένα
από τα τρία. Το επιβεβαιώνει και το σχόλιο 1109-1112 στα ORDERS: `TRIPS*
(Wave-4 parent not built)`.

**Πόσα σημεία:** 3 labels × 7 γραμμές = 21 εμφανίσεις, 1 αρχείο.
**Τι χαλάει:** το άθροισμα είναι πάντα 0 → η στήλη δείχνει μόνιμα κίτρινο
«Pending» για κάθε εθνική παραγγελία, ανεξάρτητα από την πραγματικότητα, και
το ταξινόμημα σε αυτή τη στήλη είναι no-op (`_natlSortRecords`, γραμμές
155-166, ταξινομεί σε σταθερή τιμή).
**Αιτία:** τρία ονόματα από τρεις εποχές του ίδιου συνδέσμου, κρατημένα «για
ασφάλεια», σε πίνακα (TRIPS) που δεν έχει χτιστεί.
**Σοβαρότητα:** P2 σήμερα (0 εγγραφές στα NATIONAL ORDERS, βλ. ΓΝΩΣΤΕΣ
ΠΑΓΙΔΕΣ), λανθάνον P1 μόλις χρησιμοποιηθεί ο πίνακας.
**Επιβεβαιώθηκε πώς:** διάβασα `modules/orders_natl.js` 135-180·
`worker/src/index.js` 1238-1320 και 1109-1112.

---

### [R8-9] `National Order` στο RAMP — link που ο Worker αρνείται σκόπιμα
**Τι:** `National Order` (και `Order`) χρησιμοποιούνται ως πεδία του RAMP· ο
Worker αφήνει ρητά τα link πεδία του RAMP έξω από τον χάρτη.

**Απόδειξη — `worker/src/index.js:873-877`:**
```js
      // Link fields ('Order','National Order','Trip','Driver','Truck') are NOT
      // mapped here: they are FK bigint columns, not label-valued fields, and the
      // facade cannot round-trip a recXXX link array to an FK until the parents
      // migrate (Wave 4/5). Kept out of the map so a write can't set them yet and
      // a read doesn't surface an unresolved FK as a bad Airtable link (§4.3).
```

Χρήσεις: `modules/daily_ramp.js:126`, `:672`, `modules/orders_intl.js:2790`,
`modules/orders_natl.js:1518`, και οι σταθερές `F.RAMP_ORDER` (`config.js:227`)
/ `F.RAMP_NAT_ORDER` (`config.js:228`).

**Πόσα σημεία:** 2 labels, 4 γραμμές κώδικα + 2 σταθερές.
**Τι χαλάει:** αυτό είναι η ρίζα του επιβεβαιωμένου νεκρού μπλοκ
`modules/daily_ramp.js:678-705`: τα link πεδία της ράμπας δεν γράφονται ποτέ,
άρα δεν υπάρχει παραγγελία να προαχθεί. Αναλύεται στην ΕΡΓΑΣΙΑ 5.
**Σοβαρότητα:** P2 (νεκρός κώδικας, όχι λάθος δεδομένα).
**Επιβεβαιώθηκε πώς:** διάβασα `worker/src/index.js` 819-879· εντόπισα τις 4
χρήσεις με αναζήτηση.

---

### [R8-10] `Temp Graph Sent` — ένα ghost που μηδενίζει έναν δείκτη του CEO
**Τι:** Ο δείκτης «Ποιότητα» του CEO dashboard κρίνεται από label που δεν υπάρχει.

**Απόδειξη — `modules/ceo_dashboard.js:456-461`:**
```js
  function _calcQuality(deliveredOrders) {
    const withField = deliveredOrders.filter(r => 'Temp Graph Sent' in r.fields);
    if (withField.length === 0) return { value: 0, sent: 0, total: deliveredOrders.length, hasData: false };
```
`Temp Graph Sent` δεν υπάρχει σε κανέναν από τους 22 πίνακες.

**Πόσα σημεία:** 2 εμφανίσεις, 1 αρχείο, 1 δείκτης.
**Τι χαλάει:** `withField` πάντα 0 → `hasData:false`, `value:0`. Αν το UI
τιμά το `hasData` δείχνει «—»· αν διαβάζει το `value` δείχνει 0%. Δεν
επιβεβαιώνω ποιο από τα δύο εμφανίζεται χωρίς να τρέξω τη σελίδα → πάει στα
ΑΒΕΒΑΙΑ ως προς την οθόνη, βέβαιο ως προς τον υπολογισμό.
**Σοβαρότητα:** P1.
**Επιβεβαιώθηκε πώς:** διάβασα `modules/ceo_dashboard.js` 445-475.

---

### Δύο έλεγχοι που βγήκαν ΚΑΘΑΡΟΙ — καταγράφονται για να μην ξαναγίνουν

**`Adress` vs `Address` (το ένα `d` των PARTNERS).** Ο χάρτης θέλει `Adress`
σε CLIENTS (`worker/src/index.js:680`) και PARTNERS (`:695`), και `Address` σε
LOCATIONS (`:664`) και WORKSHOPS (`:759`). Ο κώδικας το κάνει **σωστά σε όλα
τα 10 σημεία**: `core/api.js:735`, `core/entity.js:38,48,83,92` (Adress για
clients/partners), `core/entity.js:299,308` (Address για workshops, με σχόλιο
που το εξηγεί στις 296-297), `modules/locations.js:536` (Address),
`print.html:318` (Address για location), `print.html:678` (Adress για partner).
Κανένα εύρημα.

**Το τρίο θερμοκρασίας.** Τρία διαφορετικά labels για την ίδια έννοια, κατά
τον χάρτη: `Temperature °C` (ORDERS, NATIONAL ORDERS), `Temperature C`
(GROUPAGE LINES, CONSOLIDATED LOADS, NATIONAL LOADS), `Temperature` (RAMP,
ORDER STOPS). Έλεγξα και τις 12 χρήσεις του `'Temperature C'` — **όλες σε
GL/CL/NL**. Οι μεταφράσεις μεταξύ πινάκων γίνονται ρητά και σωστά:
`modules/orders_intl.js:1059` και `modules/orders_natl.js:1341` γράφουν
`'Temperature C': …['Temperature °C']`. Κανένα εύρημα. Το ρίσκο παραμένει
σχεδιαστικό (πέντε σταθερές στο `F` για τρία labels — βλ. 8β).

---

## 8β — ΤΟ `F` (FIELDS) ΤΟΥ `config.js` ΑΠΕΝΑΝΤΙ ΣΤΟΝ ΧΑΡΤΗ

158 σταθερές (`config.js:104-301`). Πέρασα κάθε μία από τον χάρτη, με
«προοριζόμενο πίνακα» = η ενότητα κάτω από την οποία δηλώνεται στο ίδιο το
αρχείο (τα section comments `── ORDERS (International) ──` κ.λπ.).

| Κατηγορία | Πλήθος |
|---|---|
| **ΦΑΝΤΑΣΜΑ** — το label δεν υπάρχει σε κανέναν από τους 22 πίνακες | **20** |
| **ΛΑΘΟΣ ΣΤΟΧΟΣ** — το label υπάρχει, αλλά σε άλλον πίνακα από τον δηλωμένο | **16** |
| ΤΙΜΗ, όχι όνομα πεδίου (δηλωμένο ως τέτοιο) | 5 |
| ΣΩΣΤΗ | 117 |

### [R8-11] ΦΑΝΤΑΣΜΑΤΑ — 20 σταθερές, όχι έξι

Τα έξι επιβεβαιωμένα (ORDER_NUMBER:106, LOADING_SUMMARY:113,
DELIVERY_SUMMARY:114, NET_PRICE:131, PA_NAT_LOAD:273, LAST_MODIFIED:300)
επιβεβαιώνονται. Δεκατέσσερα ακόμη:

| config.js | Σταθερά | Τιμή | Σημείωση |
|---|---|---|---|
| 116 | `CLIENT_NAME` | `Client Name` | formula/lookup, 23 χρήσεις (R8-4) |
| 117 | `CLIENT_SUMMARY` | `Client Summary` | formula/lookup, 15 χρήσεις (R8-4) |
| 150 | `TRIPS_EXPORT` | `TRIPS (Export Order)` | TRIPS = Wave 4, δεν χτίστηκε |
| 151 | `TRIPS_IMPORT` | `TRIPS (Import Order)` | ίδιο |
| 171 | `PICKUP_LOC` | `Pickup Location` | υπάρχουν μόνο τα αριθμημένα `Pickup Location 1..10` |
| 175 | `LINKED_TRIP` | `Linked Trip` | R8-8 |
| 176 | `NAT_TRIPS` | `NATIONAL TRIPS` | R8-8 |
| 177 | `NAT_TRIPS2` | `NATIONAL TRIPS 2` | R8-8 |
| 228 | `RAMP_NAT_ORDER` | `National Order` | R8-9 |
| 265 | `STOP_PALLET_SHEET` | `Pallet Sheet` | attachment, δεν μοντελοποιήθηκε (`worker/src/index.js:888-889`) |
| 281 | `RE_SOURCE_STOP` | `Source Stop` | RAMP_EVENTS: όλος ο πίνακας εκτός χάρτη |
| 284 | `RE_TIME_SLOT` | `Time Slot` | ίδιο |
| 285 | `RE_RAMP_NUMBER` | `Ramp Number` | ίδιο |
| 292 | `RE_LOC_NAME` | `Location Name` | ίδιο |

### [R8-12] ΛΑΘΟΣ ΣΤΟΧΟΣ — 16 σταθερές· η επικίνδυνη κατηγορία
**Τι:** Σταθερές που δείχνουν σε label που **υπάρχει**, αλλά σε άλλον πίνακα
από αυτόν κάτω από τον οποίο δηλώνονται. Δεν παράγουν κενό — γράφουν σωστά σε
λάθος στήλη, ή σιωπηλά πέφτουν, χωρίς ίχνος.

**Δύο που είναι λάθος στόχος σε *υπαρκτό* πίνακα — τα σοβαρά:**

| config.js | Σταθερά | Τιμή | Δηλωμένος πίνακας | Πού υπάρχει ΟΝΤΩΣ |
|---|---|---|---|---|
| 188 | `LOADING_DATE` | `Loading Date` | NAT_LOADS | **μόνο GROUPAGE LINES** (`worker/src/index.js:1131`) |
| 189 | `DELIVERY_DATE` | `Delivery Date` | NAT_LOADS | **μόνο GROUPAGE LINES** (`:1132`) |
| 227 | `RAMP_ORDER` | `Order` | RAMP PLAN | PALLET_LEDGER_SUPPLIERS (`:925`), PARTNER ASSIGNMENTS (`:1533`) — **όχι** RAMP |

Ο πίνακας NATIONAL LOADS έχει `Loading DateTime` / `Delivery DateTime` και,
χωριστά, `Loading Appointment` / `Delivery Appointment`
(`worker/src/index.js:1377-1384`). Δεν έχει `Loading Date`. Όποιος υιοθετήσει
τα `F.LOADING_DATE` / `F.DELIVERY_DATE` για NAT_LOADS θα γράφει πεδίο που
πέφτει σιωπηλά (νόμος 3) — και επειδή το label υπάρχει αλλού, καμία αναζήτηση
για «ανύπαρκτο πεδίο» δεν θα το βρει.

**Δεκατρείς που είναι λάθος στόχος επειδή ο ΠΙΝΑΚΑΣ τους δεν υπάρχει στον χάρτη:**
όλες οι `RE_*` (`config.js:281-297`) ανήκουν στο RAMP_EVENTS
(`TABLES.RAMP_EVENTS = 'tbllHu40WSq4yWg5S'`, `config.js:77`), που **δεν είναι
στον χάρτη** → κάθε κλήση 404 (`worker/src/index.js:1922-1925`). Οι
`RE_PLAN_DATE`, `RE_STATUS`, `RE_TRUCK`, `RE_DRIVER`, `RE_PALLETS`,
`RE_CLIENT`, `RE_GOODS`, `RE_TEMPERATURE`, `RE_NOTES`, `RE_IS_VS`,
`RE_RAMP_CAT`, `RE_DIRECTION`, `RE_SOURCE_ORDER` έχουν τιμές που υπάρχουν σε
άλλους πίνακες — δηλαδή μοιάζουν έγκυρες σε κάθε έλεγχο που δεν κοιτά
ΠΙΝΑΚΑ+ΠΕΔΙΟ μαζί. Αυτό είναι το χειρότερο σχήμα του «λάθος στόχου»: 13
σταθερές που περνούν κάθε επιφανειακό grep.

**Ειδική περίπτωση — δύο σταθερές με λάθος ΤΙΜΗ (όχι όνομα):**
`config.js:241-242`
```js
  CL_KATHODOS:      'North→South',        // unified — was 'ΚΑΘΟΔΟΣ'
  CL_ANODOS:        'South→North',        // unified — was 'ΑΝΟΔΟΣ'
```
Ο Worker λέει για το `Direction` των CONSOLIDATED LOADS
(`worker/src/index.js:1176-1177`): `// Greek: ΑΝΟΔΟΣ|ΚΑΘΟΔΟΣ, verbatim (#9)`.
Και ο κώδικας που γράφει όντως το CL συμφωνεί με τον Worker, όχι με το `F` —
`modules/orders_natl.js:468`:
```js
    'Direction': common.direction === 'South→North' ? DIR.ANODOS : DIR.KATHODOS,
```
όπου `DIR.ANODOS === 'ΑΝΟΔΟΣ'` (`core/constants.js:28-29`). Άρα το σχόλιο
«unified» στο `config.js` **δεν έχει γίνει** και οι δύο σταθερές είναι
παγίδα: όποιος τις χρησιμοποιήσει σε φίλτρο θα φέρνει σιωπηλά μηδέν CL, και σε
εγγραφή θα γράφει τιμή που κανένα φίλτρο του υπάρχοντος κώδικα δεν βρίσκει.
**Σοβαρότητα:** P2 σήμερα (αχρησιμοποίητες), λανθάνον P0.

**Σοβαρότητα R8-12 συνολικά:** P2 λανθάνον — καμία από τις 16 δεν
χρησιμοποιείται σήμερα ως `F.X` (βλ. 8γ), οπότε δεν υπάρχει ενεργή ζημιά. Η
ζημιά έρχεται με το πρώτο «ας μεταναστεύσουμε αυτό το module στο `F`».
**Επιβεβαιώθηκε πώς:** έγραψα την ταξινόμηση προγραμματικά (section comment →
προοριζόμενος πίνακας, label → κάθε πίνακας του χάρτη) και διάβασα
`config.js` 104-301, `worker/src/index.js` 715-1568, `core/constants.js` 25-32,
`modules/orders_natl.js` 462-491.

---

## 8γ — ΠΑΡΑΚΑΜΨΗ ΤΩΝ ΣΤΑΘΕΡΩΝ

### [R8-13] Η «μοναδική πηγή αλήθειας» χρησιμοποιείται στο 18% της έκτασής της
**Τι:** Από τις 158 σταθερές του `F`, **29** αναφέρονται ποτέ ως `F.X`.
Το `core/constants.js` έχει **έναν** καταναλωτή σε όλο το repo.

**Απόδειξη (μέτρηση):**
- 259 συνολικές αναφορές `F.<KEY>` σε 14 αρχεία, **29 διακριτά κλειδιά**.
- Το `core/constants.js` δηλώνει ότι είναι registry: `config.js:101-102`
  *«Single source of truth. Modules should migrate to F.XXX over time.»* και
  `core/constants.js:4-7` *«Modules still use hardcoded strings for now — this
  file is the single-source-of-truth reference for a future refactor pass.»*
- Καταναλωτές του `core/constants.js` εκτός του εαυτού του: **1 αρχείο**
  (`modules/orders_natl.js`, μέσω `DIR.ANODOS`/`DIR.KATHODOS` στη γραμμή 468).
  Κανένας για `STATUS`, `RAMP_STATUS`, `RAMP_TYPE`, `RAMP_CAT`, `SOURCE_TYPE`,
  `INV_STATUS`, `MAINT_STATUS`, `STATUS_BADGE`, `DELIVERY_PERF`, `STOCK_STATUS`.

**Οι μεγαλύτερες παρακάμψεις** (hardcoded literal με υπαρκτή σταθερά):

| Label | Hardcoded εμφανίσεις | Σταθερά | `F.X` σε χρήση; |
|---|---|---|---|
| `Status` | 234 | `F.STATUS` + 5 συνώνυμες | μόνο `F.PA_STATUS` |
| `Loading DateTime` | 151 | `F.LOADING_DT` | όχι |
| `Delivery DateTime` | 137 | `F.DELIVERY_DT` | όχι |
| `Truck` | 136 | `F.TRUCK` / `F.RE_TRUCK` | όχι |
| `Direction` | 122 | `F.DIRECTION` / `F.RE_DIRECTION` | όχι |
| `Client` | 88 | `F.CLIENT` / `F.RE_CLIENT` | όχι |
| `Active` | 80 | `F.ACTIVE` | όχι |
| `Invoiced` | 68 | `F.INVOICED` | όχι |
| `License Plate` | 64 | `F.LICENSE_PLATE` | όχι |
| `Total Pallets` | 60 | `F.TOTAL_PALLETS` | όχι |

**Δεκαπέντε σταθερές είναι εντελώς αχρησιμοποίητες** — ούτε `F.X`, ούτε καν το
literal τους εμφανίζεται πουθενά: `LOADING_PALLETS1`, `UNLOADING_PALLETS1`,
`LOADING_LOC2`, `LOADING_LOC3`, `UNLOADING_LOC1`, `UNLOADING_LOC2`,
`UNLOADING_LOC3`, `STOP_PALLET_SHEET`, `STOP_PALLETS_LOADED`,
`STOP_PALLETS_EXCHANGED`, `PA_PAYMENT_TERMS`, `RE_SOURCE_STOP`,
`RE_TIME_SLOT`, `RE_RAMP_NUMBER`, `RE_LOC_NAME`.

**Τι χαλάει:** τίποτα άμεσα — και αυτό είναι το εύρημα. Το `F` δεν είναι πηγή
αλήθειας, είναι **δεύτερος, ανεξάρτητος και ανέλεγκτος χάρτης** που συμφωνεί
με τον πραγματικό στο 74% (117/158). Επειδή δεν το διαβάζει σχεδόν κανείς, τα
36 λάθη του δεν εκδηλώνονται· γι' αυτό επέζησαν. Κάθε μελλοντική «μετανάστευση
στο `F`» μεταφέρει αυτόματα ένα από τα 36 λάθη στην παραγωγή, και τα 16 του
λάθους στόχου θα το κάνουν σιωπηλά.

### [R8-14] Πόσες παρακάμψεις χρησιμοποιούν string ΔΙΑΦΟΡΕΤΙΚΟ από τη σταθερά
**Τι:** Η ερώτηση 8γ («σε πόσα το string διαφέρει από τη σταθερά») έχει
απάντηση **οκτώ ομάδες**, και είναι ακριβώς τα ευρήματα του 8α:

| # | Έννοια | Σταθερά στο `F` | String που χρησιμοποιείται | Σημεία |
|---|---|---|---|---|
| 1 | Ημ. Cross-Dock | *καμία σταθερά* | `VS CD Date` (λάθος) vs `Cross-dock Date` (σωστό) | 14 vs 2 |
| 2 | Πιστοπ. ψύξης ρυμούλκας | *καμία σταθερά* | `ATP Expiry` (λάθος) vs `FRC Expiry` (σωστό) | 6 vs 10 |
| 3 | GL↔CL σύνδεσμος | *καμία* | `Groupage Lines` (λάθος) vs `Linked Consolidated Load` (σωστό) | 10 vs 1 |
| 4 | CMR ελήφθη | `F.CMR_PHOTO` = `CMR Photo Received` | + `CMR Received`, `CMR Archived` | 6 |
| 5 | Έκδοση εγγραφής | `F.LAST_MODIFIED` (ghost) | + `Modified`, `lastModifiedTime` | 5 |
| 6 | Έσοδο | `F.PRICE`, `F.NET_PRICE` (ghost) | + `Total Price`, `Amount`, `Revenue`, `Gross Revenue` | 8 |
| 7 | Ημ. ολοκλήρωσης service | *καμία* | `Date` (σωστό) + `Date Completed` (ghost) | 1 |
| 8 | Direction CL (ΤΙΜΗ) | `F.CL_ANODOS` = `South→North` | `DIR.ANODOS` = `ΑΝΟΔΟΣ` | 1 vs 0 |

Στις **τρεις πρώτες** ομάδες — τις μόνες με ενεργή ζημιά — το `F` **δεν έχει
καθόλου σταθερά**. Δηλαδή το registry δεν αστόχησε: δεν κάλυπτε το πεδίο. Η
ίδια αιτία που το `F` δεν βοηθά είναι που δεν πρόλαβε να βλάψει.

**Σοβαρότητα:** P2 (σχεδιαστικό).
**Επιβεβαιώθηκε πώς:** μέτρησα προγραμματικά τα literals ανά τιμή του `F` σε
όλα τα `core/` + `modules/` + `print.html` + `app.html` και τις αναφορές
`F.<KEY>`· διάβασα `config.js` 101-104 και `core/constants.js` 1-10.

---

## 8δ — Ο ΤΕΛΕΣΤΗΣ `in` ΚΑΙ ΚΑΘΕ ΕΛΕΓΧΟΣ ΥΠΑΡΞΗΣ ΠΕΔΙΟΥ

### [R8-15] Πέντε έλεγχοι ύπαρξης πεδίου, και οι πέντε συμπεραίνουν λάθος όταν η αιτία είναι NULL
**Τι:** Ο facade παραλείπει από την απάντηση **και** τα πεδία που δεν
μοντελοποιήθηκαν **και** τα πεδία με τιμή NULL. Άρα `'X' in fields === false`
δεν σημαίνει «το X δεν υπάρχει»: σημαίνει «το X δεν υπάρχει **ή** είναι κενό σε
αυτή την εγγραφή».

**Απόδειξη του μηχανισμού — `worker/src/index.js:1909-1918`:**
```js
function toAirtableRecord(row, colToLabel) {
  const fields = {};
  for (const [col, label] of Object.entries(colToLabel)) {
    if (row[col] !== void 0 && row[col] !== null) {   // ← NULL = απών
      fields[label] = row[col];
    }
  }
  return { id: row.legacy_id, fields };
}
```

**Πλήρης απαρίθμηση. Πέντε σημεία με `in` / `Object.keys` πάνω σε `fields`, και
ένας βρόχος `for…in` που κάνει το ίδιο:**

| # | Σημείο | Τι συμπεραίνει όταν βγει false | Σωστό όταν η αιτία είναι NULL; |
|---|---|---|---|
| 1 | `modules/performance.js:285` `'CMR Photo Received' in r.fields \|\| 'CMR Received' in r.fields` | «το πεδίο δεν υπάρχει» → αλλάζει μετρική σε proxy Delivery Performance | **ΟΧΙ.** Αν κανείς δεν τσέκαρε CMR σε κανένα delivered, ο δείκτης CMR μετρά κάτι άλλο και δεν το λέει. |
| 2 | `modules/performance.js:366` `'CMR Archived' in r.fields` | ίδιο, proxy `Status==='Invoiced'` | **ΟΧΙ** — και επιπλέον το label είναι ghost, άρα ο proxy είναι ο μόνος κλάδος που θα εκτελεστεί ποτέ. |
| 3 | `modules/ceo_dashboard.js:457` `'Temp Graph Sent' in r.fields` | `hasData:false, value:0` | Λάθος συμπέρασμα, σωστή σιωπή: το `hasData:false` **παραδέχεται** ότι δεν ξέρει. Το καλύτερο των πέντε. |
| 4 | `core/entity.js:338` `records.some(r => 'Active' in (r.fields \|\| {}))` | δεν αναφέρει καθόλου το `active` count | **ΟΧΙ**, αλλά ακίνδυνο: μόνο ένα metric λείπει. `Active` είναι checkbox — αν όλες οι εγγραφές είναι false, ο facade το παραλείπει από όλες και ο έλεγχος πέφτει. |
| 5 | `core/entity.js:1062` `cfg.columns.find(c => c.primary)?.field \|\| Object.keys(f)[0]` | «πρώτο πεδίο ό,τι να ‘ναι» ως τίτλος καρτέλας | Μη ντετερμινιστικό: το `Object.keys` εξαρτάται από ποια πεδία ήταν NULL. Πάει στα ΑΒΕΒΑΙΑ (υπάρχει `primary` στα περισσότερα cfg). |
| 6 | `core/api.js:1089-1100` `_validateFields`: `for (const key in f) actualFields.add(key)` + `expectedFields.filter(f => !actualFields.has(f))` | λογίζει «Missing fields in ORDERS: Status» και το γράφει στο error log | **ΟΧΙ — αυτή είναι η πηγή των 60 ψευδών.** |

**Το #6 αναλυτικά.** `core/api.js:1077-1101` έχει ήδη έναν μηχανισμό άμυνας
που δεν αρκεί:

```js
  const MIN_RECORDS_FOR_VALIDATION = 5;
  if (records.length < MIN_RECORDS_FOR_VALIDATION) return;
```
με σχόλιο (1079-1085) που **περιγράφει σωστά** το πρόβλημα: *«Airtable omits
ANY field whose value is empty… we'd raise false positives»*. Το κατώφλι των 5
όμως δεν σώζει το `Status` στα ORDERS: αν ένα φιλτραρισμένο query γυρίσει 5+
εγγραφές που **όλες** έχουν κενό `Status`, το label λείπει από όλες και
καταγράφεται ψευδώς. Οι τρεις προσδοκίες είναι
`core/api.js:1105-1107`:
```js
_FIELD_EXPECTATIONS[…ORDERS…] = { fields: ['Direction','Status','Loading DateTime','Delivery DateTime','Client'], context: 'ORDERS' };
_FIELD_EXPECTATIONS[…TRUCKS…] = { fields: ['License Plate','Active'], context: 'TRUCKS' };
_FIELD_EXPECTATIONS[…RAMP…]   = { fields: ['Type','Plan Date','Status','Supplier/Client'], context: 'RAMP PLAN' };
```
Σημείωση: `Client` στα ORDERS είναι **link**, όχι scalar. Ο facade το προσθέτει
στην απάντηση μόνο αν το FK δεν είναι NULL (`worker/src/index.js:1826-1829`:
`if (id == null) continue`). Και το `TRUCKS.Active` είναι checkbox. Δηλαδή
**τρεις από τις 11 προσδοκίες** είναι πεδία που ο facade παραλείπει νόμιμα
όταν είναι κενά — και ο validator το ονομάζει «rename».

**Τι χαλάει, συνολικά:** ο μηχανισμός που υπάρχει για να πιάνει μετονομασίες
πεδίων παράγει θόρυβο (60 ψευδή για ένα πεδίο), και **δεν έπιασε κανένα από τα
10 πραγματικά** ευρήματα αυτού του εγγράφου — γιατί κανένα από τα
`VS CD Date`, `ATP Expiry`, `Groupage Lines`, `Order Number`,
`Loading Summary`, `Last Modified` δεν είναι στη λίστα προσδοκιών. Ο ανιχνευτής
κοιτά 11 πεδία σε 3 πίνακες· τα λάθη είναι σε 15 πεδία σε 8 πίνακες.
**Αιτία:** ο έλεγχος «υπάρχει το πεδίο;» υλοποιήθηκε ως «ήρθε το πεδίο;», που
ήταν σωστό στο Airtable-with-typecast και είναι λάθος στον facade, γιατί ο
facade δεν διακρίνει το «άγνωστο» από το «κενό».
**Σοβαρότητα:** P1 (λάθος νούμερο σε οθόνη στα #1, #2, #3· θόρυβος που κρύβει
τα αληθινά στο #6).
**Επιβεβαιώθηκε πώς:** διάβασα `worker/src/index.js` 1909-1918 και 1807-1834·
`core/api.js` 380-432 και 1069-1107· `modules/performance.js` 280-300, 363-374·
`modules/ceo_dashboard.js` 445-461· `core/entity.js` 325-343, 1055-1064.
Απαρίθμηση με πλήρη αναζήτηση για `in .*fields`, `hasOwnProperty`,
`Object.keys(*fields*)` σε `core/`, `modules/`, `*.html` — **κανένα**
`hasOwnProperty` σε δεδομένα Airtable πουθενά στο repo.

---

## ΣΥΝΟΨΗ ΕΡΓΑΣΙΑΣ 8

| ID | Εύρημα | Σημεία | Σοβαρότητα |
|---|---|---|---|
| R8-1 | `VS CD Date` vs `Cross-dock Date` | 14 vs 2 | **P0** |
| R8-3 | `Groupage Lines` — 8 διαδρομές διαγραφής CL | 10 | **P0** |
| R8-4 | 6 formula labels των ORDERS, 181 αναγνώσεις | 181 | P1 |
| R8-2 | `ATP Expiry` vs `FRC Expiry` | 6 vs 10 | P1 |
| R8-5 | `CMR Received` / `CMR Archived` → proxy metric | 6 | P1 |
| R8-6 | `Last Modified` ghost → νεκρός έλεγχος σύγκρουσης | 5 | P1 |
| R8-10 | `Temp Graph Sent` → δείκτης CEO στο 0 | 2 | P1 |
| R8-15 | 6 έλεγχοι ύπαρξης πεδίου, NULL = απών | 6 | P1 |
| R8-11 | 20 ΦΑΝΤΑΣΜΑΤΑ στο `F` (όχι 6) | 20 | P2 λανθάνον |
| R8-12 | 16 ΛΑΘΟΣ ΣΤΟΧΟΙ στο `F`, 13 σε ανύπαρκτο πίνακα | 16 | P2 λανθάνον |
| R8-7 | 5 ghost expiry labels στη Συντήρηση | 5 | P2 |
| R8-8 | 3 ονόματα για τον σύνδεσμο TRIPS | 21 | P2 |
| R8-9 | `National Order` / `Order` στο RAMP | 6 | P2 |
| R8-13 | `F` σε χρήση 29/158· `constants.js` 1 καταναλωτής | — | P2 |
| R8-14 | 8 ομάδες «δύο ονόματα», 3 με ενεργή ζημιά | — | P2 |

**Καθαροί έλεγχοι:** `Adress`/`Address` (10/10 σωστά), τρίο θερμοκρασίας
(12/12 σωστά), `hasOwnProperty` (0 χρήσεις σε δεδομένα).

## ΑΒΕΒΑΙΑ
- **`worker/src/index.js` είναι bundle, όχι πηγή.** Ο χάρτης που διάβασα είναι
  ό,τι έχει το repo. Αν το deployed Worker διαφέρει, όλα τα «δεν υπάρχει στον
  χάρτη» πρέπει να επανελεγχθούν απέναντι στην πηγή.
- **Τι εμφανίζεται τελικά στην οθόνη** στα R8-10 (`hasData:false` vs `value:0`)
  και R8-15#5 (`Object.keys(f)[0]`): δεν έτρεξα τη σελίδα. Ο υπολογισμός είναι
  βέβαιος, το rendering όχι.
- **Οι μετρήσεις εμφανίσεων** είναι μετρήσεις string literals σε
  `core/` + `modules/` + `print.html` + `app.html` + `index.html`. Δεν
  περιλαμβάνουν το `tests/`, το `worker/archive/`, το `docs/`, ούτε το sister
  repo (`national_consolidation.html`, `fuel_import.html`,
  `pallet_upload_v2.html`) — το οποίο **δεν είναι σε αυτό το repo** και
  μπορεί να έχει τα ίδια aliases.
- **Δεν έλεγξα κανένα δεδομένο βάσης.** Καμία πρόταση εδώ δεν λέει «ο πίνακας
  Χ είναι κενός» ή «η τιμή είναι Ψ».

## ΕΡΩΤΗΣΕΙΣ
1. **R8-1:** το `Cross-dock Date` γράφεται από τη φόρμα και δεν διαβάζεται
   από πουθενά· το `VS CD Date` διαβάζεται από τρεις οθόνες και δεν υπάρχει.
   Ποιο είναι το όνομα που θέλεις να μείνει — και θέλεις οι τρεις οθόνες να
   δείχνουν την καταγεγραμμένη ημερομηνία αντί για την εκτίμηση «≈»;
2. **R8-3:** ο σύνδεσμος GL→CL υπάρχει σωστά στην πλευρά του GL. Οι 8
   διαδρομές καθαρισμού τον ψάχνουν αντίστροφα. Επιβεβαιώνεις ότι ο κανόνας
   «μόνο τα CONSOLIDATED LOADS σβήνουν» ισχύει ακόμη, ώστε το ερώτημα να γίνει
   «βρες τα CL από τα GL» και όχι το αντίστροφο;
3. **R8-4:** το `Order Number` είναι formula πεδίο που ο facade δεν εκθέτει,
   και η τιμολόγηση δεν έχει κανέναν αριθμό να δείξει. Τι νούμερο θέλει η
   Eirini στο τιμολόγιο — το `Reference` (υπαρκτό πεδίο) ή θέλουμε το
   `Order Number` σε view όπως έγινε με το `Week Number`;
4. **R8-6:** ο έλεγχος «κάποιος άλλος άλλαξε την εγγραφή» δεν εκτελείται ποτέ.
   Είναι πραγματικό ρίσκο στη ροή σου (δύο dispatcher στην ίδια παραγγελία), ή
   να το καταγράψω ως αποδεκτό και να φύγει ο κώδικας που υπονοεί ότι υπάρχει;
5. **8β:** το `F` συμφωνεί με τον χάρτη στο 74%. Θέλεις να παραμείνει ως
   πρόθεση («εδώ πάμε»), ή να γίνει παραγόμενο από τον χάρτη του Worker ώστε
   να μην μπορεί να αποκλίνει;
