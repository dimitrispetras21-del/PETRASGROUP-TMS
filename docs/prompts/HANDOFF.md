# HANDOFF — ενημερωτικό για εξωτερικό μοντέλο

Αυτό το αρχείο δίνεται **ολόκληρο** στην αρχή κάθε συνεδρίας με μοντέλο που δεν
έχει το `CLAUDE.md` στο context του (π.χ. Astra, όταν εξαντληθεί το εβδομαδιαίο
όριο του Fable). Χωρίς αυτό, το εξωτερικό μοντέλο θα γράψει κώδικα που φαίνεται
σωστός και αποτυγχάνει σιωπηλά — έχει ήδη συμβεί σε αυτό το έργο.

Δύο μέρη: **Α. Σταθερό** (σπάνια αλλάζει) · **Β. Κατάσταση** (ενημερώνεται στο
τέλος κάθε session).

---

# Α. ΣΤΑΘΕΡΟ

## Α0. Τι είναι το έργο

TMS (Transport Management System) της PETRAS GROUP — διεθνείς και εθνικές
μεταφορές ψυγείου. **Σε καθημερινή παραγωγική χρήση από ομάδα ανθρώπων,
05:30–14:30.** Δεν είναι project υπό ανάπτυξη· είναι εργαλείο που αν σπάσει,
σταματούν φορτηγά.

Ο ιδιοκτήτης (Δημήτρης) **δεν είναι developer**. Δεν κρίνει κώδικα. Κρίνει αν
δουλεύει η οθόνη και αν γράφτηκε η γραμμή στη βάση.

```
Browser (GitHub Pages, vanilla JS — χωρίς framework, χωρίς build step)
   │  fetch με Airtable-style URLs + JWT
   ▼
Cloudflare Worker  «petras-tms-backend-staging»   ← facade
   │  μεταφράζει labels → στήλες Postgres, μιμείται το Airtable API
   ▼
Supabase Postgres
```

**Το Airtable δεν χρησιμοποιείται πουθενά** από 28/7/2026. Τα «table IDs»
(`tblgHlNmLBH3JTdIM` κ.λπ.) είναι IDs διαδρομών του facade, όχι Airtable.

## Α1. ΟΙ ΤΡΕΙΣ ΠΑΓΙΔΕΣ ΤΟΥ FACADE — διάβασέ τες πριν γράψεις οτιδήποτε

Δεν είναι bugs προς διόρθωση. Είναι το έδαφος πάνω στο οποίο γράφεις.

### 1. Άγνωστο όνομα πεδίου = σιωπηλή απόρριψη, με ένδειξη επιτυχίας

```js
// Worker, εγγραφή
for (const [label, value] of Object.entries(fields)) {
  const column = cfg.fields[label] || (cfg.aliases || {})[label];
  if (column) row[column] = value;     // ← κανένα else, καμία καταγραφή
}
```

Γράφεις `fields['Order Number'] = 'X'`. Το πεδίο δεν υπάρχει στον χάρτη. Το
αίτημα γυρίζει **200 OK**. Το UI δείχνει πράσινο toast. **Τίποτα δεν γράφτηκε.**
Το ίδιο ισχύει και στην ανάγνωση: άγνωστο όνομα απλώς δεν μπαίνει στο `select`.

Εξαίρεση: άγνωστο όνομα σε **filterByFormula** πετάει `422` — η μόνη διαδρομή
που κάνει θόρυβο.

**Συνέπεια για σένα:** κάθε νέο όνομα πεδίου που χρησιμοποιείς, το επιβεβαιώνεις
πρώτα στον χάρτη `TABLES` του `worker/src/index.js`, **για τον συγκεκριμένο
πίνακα**.

**Παγίδα αναζήτησης:** τα μονολεκτικά κλειδιά γράφονται **χωρίς εισαγωγικά**
(`Price: "price"`), τα πολυλεκτικά **με** (`"VAT Number": "tax_id"`). Ένα
`grep '"Price"'` επιστρέφει ψευδώς «δεν υπάρχει». Ψάξε `grep -n 'Price' worker/src/index.js`.

### 2. Στήλη με NULL δεν εμφανίζεται καθόλου στην απάντηση

```js
if (row[col] !== void 0 && row[col] !== null) fields[label] = row[col];
```

Άρα `'X' in rec.fields` είναι **false** και για το κενό και για το ανύπαρκτο. Μη
γράψεις κώδικα που μεταφράζει την απουσία σε `0` ή σε «όλα εντάξει» — έτσι το
άγραφο φαίνεται ξοφλημένο και η ληγμένη πιστοποίηση φαίνεται έγκυρη.

### 3. RBAC: το wildcard αντικαθιστά, δεν συγχωνεύεται

```js
const tableRule = roleMap[table] || roleMap["*"];
```

Αν ο πίνακας δεν έχει ρητή γραμμή για τον ρόλο, ισχύει το `*`. Μια ρητή γραμμή
που ξεχνά μια μέθοδο την **αφαιρεί** σιωπηλά. Πραγματικό παράδειγμα: ο
`accountant` έχει `"*": ["GET"]` χωρίς γραμμή `orders` → κάθε PATCH σε
παραγγελία γυρίζει 403. Το checkbox «Invoiced» έδειχνε επιτυχία και δεν
γράφτηκε **ποτέ**, σε 0/89 παραγγελίες, επί δέκα μέρες παραγωγής.

## Α2. Ο ΚΑΝΟΝΑΣ ΠΑΡΑΔΟΣΗΣ — τα πέντε ερωτήματα

Καμία αλλαγή που διαβάζει ή γράφει δεδομένα δεν είναι τελειωμένη επειδή
«φάνηκε σωστή». **Πριν πεις ότι τελείωσες**, απάντησε γραπτά:

1. **Ποιο endpoint** χτυπάει η ενέργεια;
2. **Ποιον πίνακα Postgres και ποιες στήλες** γράφει ή διαβάζει;
3. **Τι γράφτηκε ΟΝΤΩΣ** — αριθμός γραμμών από τη βάση, όχι μήνυμα επιτυχίας.
4. **Τι γίνεται στην αποτυχία** — και είναι σωστό να ανοίγει ή να κλειδώνει;
5. **Έχει δικαίωμα** ο ρόλος στο `PERMISSIONS` του Worker για αυτή την πράξη;

Αν **δεν έχεις πρόσβαση στη Supabase**, το (3) δεν μπορείς να το απαντήσεις. Τότε
γράφεις ρητά: *«Το (3) εκκρεμεί — χρειάζεται μέτρηση στη βάση.»* **Μην το
παρακάμψεις και μην πεις ότι τελείωσε.** Είναι το μοναδικό βήμα που έχει πιάσει
πραγματικά λάθη σε αυτό το έργο.

Πρότυπο ερωτήματος μέτρησης:

```sql
SELECT count(*) FILTER (WHERE <στήλη> IS NOT NULL) AS γραμμένα,
       count(*) AS σύνολο
FROM <πίνακας> WHERE deleted_at IS NULL;
```

## Α3. ΤΙ ΔΕΝ ΑΓΓΙΖΕΙΣ ΠΟΤΕ χωρίς ρητή εντολή του Δημήτρη

- **`worker/` — κανένα deploy.** Το `wrangler deploy` έχει σβήσει δουλεύοντα
  χαρακτηριστικά δύο φορές. Επιτρέπεται να *διαβάσεις* το `worker/src/index.js`
  για να επιβεβαιώσεις ονόματα πεδίων· τίποτα άλλο.
- **Supabase: SELECT μόνο.** Κάθε INSERT/UPDATE/DELETE/migration/GRANT/REVOKE
  θέλει ρητή έγκριση του Δημήτρη στη συνομιλία, πριν εκτελεστεί.
- **Ποτέ δοκιμή exploit.** Ευπάθεια τεκμηριώνεται διαβάζοντας δικαιώματα, δεν
  επιβεβαιώνεται εκτελώντας την.
- **Το repo δεν γίνεται ιδιωτικό.** Το GitHub Pages σε δωρεάν λογαριασμό σερβίρει
  μόνο από δημόσιο repo — δοκιμάστηκε 24/8/2026 και έριξε την εφαρμογή σε ώρες
  λειτουργίας.
- **GROUPAGE LINES δεν διαγράφονται ποτέ.** Στην επαναφορά:
  `Status = 'Unassigned'` και τίποτα άλλο. Η βάση το επιβάλλει με
  `ON DELETE RESTRICT`.
- **Ρίσκα μόνο μετά τις 15:00.** Η ομάδα δουλεύει 05:30–14:30.

## Α4. Κλειδωμένες αποφάσεις — μην τις «διορθώσεις» ως bugs

- **`Net Price` και επιμερισμός τιμής VS**: σκόπιμα ανυλοποίητα μέχρι τη φάση
  P&L. Δεν υπάρχουν ούτε στον χάρτη ούτε ως στήλη. Χρησιμοποίησε `Price`.
- **`national_orders` άδειο = σωστό.** Το Veroia Switch γράφει κατευθείαν στο
  `national_loads`.
- **Το TMS δεν εκδίδει τιμολόγια** — το ERP τα εκδίδει. Το TMS έχει μόνο
  checkbox «Invoiced», ώστε να μη μείνει τίποτα ατιμολόγητο. Το «Invoiced»
  **δεν είναι status**.
- **Ο dispatcher δεν βλέπει P&L** (περιθώρια, κέρδη, κόστη, καύσιμα). Η τιμή
  πώλησης (`Price`) μένει ορατή.
- **Cross-dock: ΜΙΑ στήλη**, η `cross_dock_date`. Όταν είναι κενή:
  export = Loading Date + 1 · import = Delivery Date − 1.
- **Status — ενιαίο λεξιλόγιο**: `Pending → Assigned → In Transit → Delivered`,
  συν `Cancelled`. Εξαιρέσεις: GROUPAGE LINES (`Unassigned/Assigned`), RAMP
  (`Planned/Done`).
- **Daily Ops = τέσσερις ενότητες.** Η ενοποίηση DO-2/DO-3 ακυρώθηκε από τον
  owner. Μην την ξαναπροτείνεις.
- **Ράμπα και National Pick Up πάνε τελευταία.** Μην τα προτείνεις ως επόμενο.

## Α5. Παγίδες ονομάτων — επαληθευμένες στον deployed χάρτη

```
'Order Number'  ← ΔΕΝ ΥΠΑΡΧΕΙ. Χρησιμοποίησε 'Reference'.
'Net Price'     ← ΔΕΝ ΥΠΑΡΧΕΙ. Χρησιμοποίησε 'Price'.
'Week Number'   ← χωρίς κενό· formula field, ΔΕΝ γράφεται
'Veroia Switch' ← χωρίς κενό στο τέλος
'Adress'        ← ένα 'd' σε CLIENTS και PARTNERS· 'Address' σε LOCATIONS/WORKSHOPS
```

Σύνταξη προς το facade (Airtable-style, αλλά ο παραλήπτης είναι ο Worker):

```js
fields['Driver'] = ['recABC123']                 // ✅ σκέτος πίνακας string
fields['Driver'] = [{ id: 'recABC123' }]         // ❌

filterByFormula = `FIND("recXXX", ARRAYJOIN({Linked Order}, ","))>0`   // FIND, όχι SEARCH
// ⚠️ Δουλεύει ΜΟΝΟ αν ο πίνακας έχει `links` block στον Worker.
//    Το RAMP ΔΕΝ έχει → κάθε τέτοιο φίλτρο εκεί γυρίζει 422.

filterByFormula = `{National Groupage}=1`        // 1, όχι TRUE()
```

Κατεύθυνση: **NATIONAL ORDERS** χρησιμοποιεί βελάκια (`North→South`,
`South→North`) · **CONSOLIDATED LOADS** ελληνικά (`ΚΑΘΟΔΟΣ`, `ΑΝΟΔΟΣ`).
ΑΝΟΔΟΣ = South→North (προμηθευτές → Βέροια).

## Α6. Χάρτης facade ID → Postgres

| Facade ID | Όνομα | Πίνακας |
|---|---|---|
| tblgHlNmLBH3JTdIM | ORDERS | `orders` |
| tblGHCCsTMqAy4KR2 | NATIONAL ORDERS | `national_orders` |
| tblVW42cZnfC47gTb | NATIONAL LOADS | `national_loads` |
| tblaeY5QOHAS1gyE8 | ORDER STOPS | `order_stops` |
| tblxUAaIsUMEDl3qQ | GROUPAGE LINES | `groupage_lines` |
| tbl5XSLQjOnG6yLCW | CONSOLIDATED LOADS | `consolidated_loads` |
| tblUhgqnmiam5MGNK | PARTNER ASSIGNMENTS | `partner_assignments` |
| tblT8W5WcuToBQNiY | RAMP | `ramp` |
| tblxRFsMeVhlLrBjF | FUEL | `fuel` |
| tblAAH3N1bIcBRPXi | PALLET_LEDGER_SUPPLIERS | `pallet_ledger_suppliers` |
| tblAUixdjwpgnJ1hK | PALLET_LEDGER_PARTNERS | `pallet_ledger_partners` |
| tblMiFxbm9ky8PCQi | WORKSHOPS | `workshops` |
| tbllPbPPd6N3zEZF1 | MAINT_HISTORY | `maint_history` |
| tbl3vhUmzKDWhJynR | MAINT_REQ | `maint_req` |
| tblFWKAQVUzAM8mCE | CLIENTS | `clients` |
| tblLHl5m8bqONfhWv | PARTNERS | `partners` |
| tblxu8DRfTQOFRCzS | LOCATIONS | `locations` |
| tbl7UGmYhc2Y82pPs | DRIVERS | `drivers` |
| tblEAPExIAjiA3asD | TRUCKS | `trucks` |
| tblDcrqRJXzPrtYLm | TRAILERS | `trailers` |

Veroia Cross-Dock location = `recJucKOhC1zh4IP3`

## Α7. Δομή αρχείων

```
app.html · index.html · print.html · config.js · sw.js
assets/style.css
core/     api.js (atGet/atGetAll/atPatch/atCreate/atDelete + cache) · auth.js (can())
          router.js · ui.js · utils.js · entity.js (generic CRUD master data)
          order-sync.js (cascade ORDERS → NL/GL/CL/RAMP/PA) · stops-helpers.js
          form-helpers.js · data-helpers.js · pa-helpers.js · metrics.js
modules/  orders_intl.js · orders_natl.js · weekly_intl.js · weekly_natl.js
          daily_ops.js · daily_ramp.js · dashboard.js · invoicing.js · costs.js
          pallet_ledger.js · maintenance.js · locations.js · audit_trail.js
worker/   src/index.js (ΜΟΝΟ ΑΝΑΓΝΩΣΗ) · wrangler.toml
docs/     DECISION_LOG.md · ARCHITECTURE.md · SCHEMA.md · prompts/
```

## Α8. Πώς παραδίδεις

**Μετά από ΚΑΘΕ αλλαγή αρχείου:**

```bash
# 1. bump το ?v=TIMESTAMP του αρχείου μέσα στο app.html
#    π.χ.  modules/orders_intl.js?v=20260904T1530
# 2.
git add . && git commit -m "..." && git push
```

Χωρίς το bump, ο browser σερβίρει την παλιά έκδοση από cache και η αλλαγή σου
είναι αόρατη. Τα `CLAUDE.md` και `docs/` δεν φορτώνονται από το app.html — δεν
θέλουν bump.

**Μηνύματα commit στα ελληνικά** (ακολούθησε το ύφος του `git log`).
**Σχόλια κώδικα στα αγγλικά.** **Συνομιλία με τον Δημήτρη στα ελληνικά.**

**Σχόλια:** γράφε το *γιατί*, όχι το *τι*. Σχόλιο μπαίνει μόνο όπου η επιλογή δεν
είναι προφανής — τι απορρίφθηκε, ποια παγίδα υπάρχει, τι σπάει χωρίς αυτό.

**Κάθε ουσιαστική απόφαση πάει στο `docs/DECISION_LOG.md`** (επιλογή /
εναλλακτικές / απόδειξη / ποιος).

## Α9. Οι κανόνες που δεν παραβιάζονται

1. **Ό,τι δεν γίνεται, πρέπει να ακούγεται.** Σιωπηλή αποτυχία είναι χειρότερη
   από κατάρρευση. Έλεγχος: *«αν σπάσει στις 06:00 Δευτέρα, ποιος το μαθαίνει;»*
2. **Η απόδειξη είναι ο πίνακας, ποτέ η οθόνη.** Νούμερο γραμμών, όχι screenshot.
3. **Δύο πηγές αλήθειας σημαίνει καμία.** Κάθε «και εκεί πρέπει να το αλλάξω»
   είναι μελλοντικό σφάλμα.
4. **Ο κανόνας μπαίνει όσο πιο χαμηλά αντέχει** — `CHECK`/`FK` στη βάση πιάνει
   κάθε διαδρομή· διόρθωση σε οθόνη πιάνει μία.
5. **Ό,τι γεννιέται, γεννιέται κλειστό.** Τα defaults ορίζουν το σύστημα.
6. **Πιάσε το λάθος τη στιγμή που γράφεται.** Η απόσταση λάθους↔ανακάλυψης
   είναι το κόστος.
7. **Μία αλλαγή, αναστρέψιμη, εκτός ωρών.**
8. **Ο νεκρός κώδικας λέει ψέματα.** Ή ζωντανεύει, ή φεύγει.

**Χειρουργικές αλλαγές:** άγγιξε μόνο ό,τι πρέπει. Μη «βελτιώνεις» διπλανό
κώδικα, μη κάνεις refactor ό,τι δεν είναι χαλασμένο, ταίριαξε το υπάρχον ύφος.
Κάθε αλλαγμένη γραμμή πρέπει να ανάγεται στο αίτημα.

## Α10. Ο ΚΑΝΟΝΑΣ ΤΗΣ ΣΚΥΤΑΛΗΣ — ένα κανάλι τη φορά

Στο repo δουλεύει **ένας** agent τη φορά. Το split-brain repo↔παραγωγής συνέβη
δύο φορές ακριβώς επειδή υπήρχαν παράλληλα κανάλια αλλαγών χωρίς ίχνος.

Όταν πιάνεις τη σκυτάλη:

1. `git pull` και `git log --oneline -10` — δες πού σταμάτησε ο προηγούμενος.
2. Διάβασε το **Μέρος Β** παρακάτω.
3. Δούλεψε **μόνο** στα αρχεία που ορίζει η εργασία σου.
4. Κλείσε με commit + push. **Όχι «σου δίνω τον κώδικα να τον βάλεις».** Ο
   Δημήτρης δεν κάνει copy-paste κώδικα.
5. Γράψε στο Μέρος Β πού σταμάτησες, πριν αποχωρήσεις.

---

# Β. ΚΑΤΑΣΤΑΣΗ — πού είμαστε τώρα

> Ενημερώνεται στο τέλος κάθε session, από όποιον κρατάει τη σκυτάλη.

**Τελευταία ενημέρωση:** 2026-09-04 · **από:** Fable (Claude Code)
**Commit:** `77d339a` — *fix(orders_intl): νέα παραγγελία παίρνει κατάσταση, και το φίλτρο τη βρίσκει*

### Σε εξέλιξη
Καμία ανοιχτή εργασία κώδικα. Μόλις στήθηκε η δομή σκυτάλης (αυτό το αρχείο).

### Ανοιχτά ευρήματα — πεδία που η οθόνη υποτίθεται γράφει και ο πίνακας είναι κενός

Μετρημένα στη Supabase 24/8/2026, ενημερωμένα 30/8/2026:

| Πεδίο φόρμας | Στήλη | Κατάσταση |
|---|---|---|
| Ράμπα: παραγγελία / φορτηγό / οδηγός | `order_id`, `truck_id`, `driver_id` | **0 / 30** — παγωμένο με εντολή owner, η ράμπα πάει τελευταία |
| Πελάτες: υπεύθυνος επικοινωνίας | `contact_person` | ✅ ΛΥΘΗΚΕ 30/8 — έλειπε ο χάρτης στον Worker, μπήκε, αποδεδειγμένη εγγραφή (πελάτης 1094) |
| Πελάτες: ημέρες πίστωσης | `payment_terms_days` | **0 / 1.920** — χάρτης deployed 30/8, **αδοκίμαστο**. Τύπος `integer`, διαφορετικός από το διπλανό — μη θεωρηθεί λυμένο επειδή εκείνο πέρασε |
| Συνεργάτες: υπεύθυνος επικοινωνίας | `contact_person` | **0 / 214** — χάρτης deployed 30/8, αδοκίμαστο |
| Συντήρηση: εκτιμώμενο κόστος | `estimated_cost` | **0** |
| Παραγγελίες: τιμολογήθηκε | `invoiced` | **0 / 89** — ⚠ ΟΧΙ σιωπηλή απόρριψη. Ο χάρτης είναι σωστός (`Invoiced: "invoiced"`). Αιτία = δικαίωμα: ο accountant έχει `"*": ["GET"]` χωρίς γραμμή `orders` → PATCH 403. **Μη «φτιάξεις» χάρτη που είναι ήδη σωστός** |
| Οδηγοί: βασικός μισθός | — | δεν υπάρχει στήλη |

### Κατάσταση modules

**Σε παραγωγική χρήση:** Weekly International · Weekly National · Daily Ops ·
Daily Ramp Board · International/National Orders CRUD · Locations (+ χάρτης) ·
Clients / Partners / Drivers / Trucks / Trailers · Maintenance · Dashboard ·
Audit Trail

**Χτισμένα με ανοιχτά ζητήματα:** Invoicing (βλ. πίνακα πάνω) · Pallet Ledger ·
CEO Dashboard / Performance (αρκετοί δείκτες δείχνουν δομικά 0)

**Επόμενα κατά σειρά:** Trip Costs / P&L · Fuel Receipts UI · Driver Payroll ·
MyGeotab GPS μέσω Make.com · Settings
