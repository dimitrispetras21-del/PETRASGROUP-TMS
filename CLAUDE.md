# PETRAS GROUP TMS — Claude Code Context

## PRIME DIRECTIVE
Ask before making performance, caching, architecture, or infrastructure changes.
Only make the specific change requested. No unrequested improvements.
After every file change: bump its `?v=TIMESTAMP` in app.html + git add/commit/push.

---

## ΟΙ ΟΚΤΩ ΑΡΧΕΣ — διέπουν κάθε αλλαγή

Δεν είναι θεωρία. Καθεμία προέκυψε από ζημιά που πλήρωσε **αυτό** το έργο.
Κάθε κανόνας παρακάτω στο αρχείο είναι εφαρμογή μιας από αυτές.

**1. Ό,τι δεν γίνεται, πρέπει να ακούγεται.**
Σιωπηλή αποτυχία είναι χειρότερη από κατάρρευση: η κατάρρευση σε σταματά, η
σιωπή σε αφήνει να χτίζεις πάνω σε ψέμα. Το `if (column) row[column] = value`
χωρίς `else` κόστισε 10 ευρήματα και μήνες αόρατης απώλειας.
→ *Έλεγχος: «αν σπάσει στις 06:00 Δευτέρα, ποιος το μαθαίνει και πώς;»*

**2. Η απόδειξη είναι ο πίνακας, ποτέ η οθόνη.**
Το πράσινο toast ψεύτισε πέντε φορές σε ένα audit. Ζητάς **νούμερο γραμμών**,
όχι screenshot, όχι «φαίνεται σωστό».

**3. Δύο πηγές αλήθειας σημαίνει καμία.**
Worker repo≠παραγωγής· πέντε πίνακες δικαιωμάτων· τρεις λίστες χρηστών που
διαφωνούν· 20 σταθερές-φαντάσματα· δύο στήλες cross-dock με τη μία μονίμως άδεια.
Κάθε αντίγραφο αποκλίνει — όχι *αν*, **πότε**.
→ *Έλεγχος: «αν το αλλάξω εδώ, πού αλλού πρέπει να θυμηθώ;» Κάθε «και εκεί» είναι
μελλοντικό σφάλμα.*

**4. Ο κανόνας μπαίνει όσο πιο χαμηλά αντέχει.**
Ένα `CHECK`/`FK` στη βάση πιάνει **κάθε** διαδρομή — και τη μελλοντική. Μια
διόρθωση σε οθόνη πιάνει μία. Το «τα GL δεν σβήνονται» ήταν σχόλιο σε τρία
αρχεία· έγινε αληθινό μόνο με `ON DELETE RESTRICT`. Πρότυπο: `pl_movements`.

**5. Τα defaults ορίζουν το σύστημα, όχι οι αποφάσεις.**
Η Supabase δίνει αυτόματα πρόσβαση στον `anon` σε κάθε νέο πίνακα. Ο Worker
πέφτει σε wildcard `*` όταν δεν βρίσκει κανόνα. Κανείς δεν το αποφάσισε — απλώς
συνέβαινε. **Ό,τι γεννιέται, γεννιέται κλειστό.**

**6. Πιάσε το λάθος τη στιγμή που γράφεται.**
Το `ATP Expiry` βρέθηκε μήνες μετά, με audit, ενώ μια ρυμούλκα κυκλοφορούσε με
ληγμένο πιστοποιητικό ψύξης. **Η απόσταση λάθους↔ανακάλυψης είναι το κόστος**,
όχι το λάθος. Έλεγχος στο build, όχι έκπληξη στις 07:00.

**7. Μία αλλαγή, αναστρέψιμη, εκτός ωρών.**
`GRANT` πριν το `REVOKE` ώστε να μην υπάρξει στιγμή χωρίς πρόσβαση· συναλλαγή·
επαλήθευση· δοκιμή. Δύο φάσεις (πρώτα ακούει, μετά αρνείται). Η ομάδα δουλεύει
05:30–14:30 — τα ρίσκα πάνε μετά τις 15:00. Δεν είναι δειλία, είναι ταχύτητα.

**8. Ο νεκρός κώδικας λέει ψέματα.**
20 σταθερές σε ανύπαρκτα πεδία, 22 ακάλεστες συναρτήσεις, διαδρομές που ποτέ δεν
έτρεξαν. Καθένα έκανε κάποιον να υποθέσει ότι κάτι δουλεύει. **Ή ζωντανεύει, ή
φεύγει.**

> ### Η μία πρόταση
> **Το σύστημα πρέπει να σου λέει την αλήθεια χωρίς να το ρωτήσεις.**
> Όχι όταν κάνεις audit· από μόνο του, τη στιγμή που κάτι πάει στραβά.
>
> **Η ερώτηση σε κάθε παράδοση — δική μας ή τρίτου:**
> ## «Αν αυτό σπάσει, πώς θα το μάθω;»
> Χωρίς καθαρή απάντηση, η δουλειά δεν τελείωσε.

---

## ⛔ Ο WORKER — ΔΙΑΒΑΣΕ ΠΡΙΝ ΚΑΝΕΙΣ DEPLOY

### Το ιστορικό (γιατί υπάρχει αυτή η ενότητα)
Το split-brain συνέβη **δύο φορές**: αλλαγές από τον dashboard editor που δεν
επέστρεψαν στο repo, ενώ ταυτόχρονα το repo είχε κώδικα που δεν έγινε ποτέ deploy.
Κάθε `wrangler deploy` έσβηνε τρία πράγματα που δούλευαν στην παραγωγή. **Λύθηκε
23/8/2026** (commit `45ab989`): ο ζωντανός κώδικας κατέβηκε και έγινε το
`worker/src/index.js`.

### Ο φρουρός — ΤΑ ΤΡΙΑ ΠΟΥ ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΧΑΘΟΥΝ ΠΟΤΕ
Πριν **και** μετά από κάθε deploy, επιβεβαίωσε ότι υπάρχουν στο bundle:

1. `order_stops: [..., "DELETE"]` για **dispatcher** — χωρίς αυτό οι dispatchers
   δεν σβήνουν στάσεις (403· συνέβη 13/8, 05:50–07:51)
2. `"VS CD Date": "vs_cd_date"` στα ORDERS
3. Τα 4 πεδία WORKSHOPS: `Country`, `Aliases`, `"VAT Number"→tax_id`,
   `"Legal Name"→legal_name` — χωρίς αυτά σπάει η αναζήτηση με παλιά γραφή

**Αν λείπει έστω ένα: ΣΤΑΜΑΤΑ.** Μη συνεχίσεις «να το φτιάξουμε μετά».

### ⚠️ Ο έλεγχος γίνεται σε ΠΕΡΙΕΧΟΜΕΝΟ, ΠΟΤΕ σε ισότητα byte
Το `wrangler deploy` **ξανα-πακετάρει** το ήδη πακεταρισμένο `src/index.js` και
προσθέτει δικό του στρώμα (`__name2`, `__defProp2`). Μετρημένο 24/8: repo 2.536
γραμμές → παραγωγή 2.538. **Καμία αλλαγή λογικής.**

Συνέπεια: **το repo και η παραγωγή δεν είναι ποτέ ταυτόσημα byte-προς-byte, και
δεν πρέπει να είναι.** Το repo κρατά την *πηγή από την οποία γίνεται deploy*· η
παραγωγή κρατά την *έξοδο του wrangler*. Η παλιά σύμβαση του `worker/README.md`
(«το src/index.js είναι το ΑΚΡΙΒΕΣ deployed script») ίσχυε στην εποχή των
dashboard edits, όπου δεν υπήρχε βήμα build — **δεν ισχύει πλέον**. Ένα `diff`
θα βγάζει ψευδή συναγερμό split-brain σε κάθε deploy.

### Διαδικασία deploy
```bash
cd worker && CLOUDFLARE_API_TOKEN=$CF_API_TOKEN npx wrangler deploy
```
- **Μόνο μετά τις 15:00** (ομάδα 05:30–14:30) — αρχή 7.
- **Πριν:** φρουρός των τριών· κράτα αντίγραφο του τρέχοντος bundle για επαναφορά.
- **Μετά:** ξανακατέβασε από το CF API, **ξετύλιξε το multipart** (το CF
  επιστρέφει multipart, όχι σκέτο JS — το ωμό έχει ~5 γραμμές παραπάνω και το
  boundary είναι **τυχαίο ανά αίτημα**, άρα δύο downloads της ίδιας έκδοσης
  «διαφέρουν»), ξανατρέξε τον φρουρό, και κάνε smoke (login, μία αποθήκευση).
- **Έλεγξε τα bindings πριν και μετά.** Το wrangler εμφανίζει μόνο τα plain vars
  στην έξοδό του· τα secrets (`JWT_SECRET`, `SUPABASE_SERVICE_KEY`,
  `ANTHROPIC_API_KEY`) επιβιώνουν αλλά **επιβεβαίωσέ το** μέσω CF API.
- Ό,τι plain var λείπει από το `wrangler.toml` **σβήνεται** στο deploy.

Μελλοντικά: deploy **μόνο από CI**, με αυτόματο φρουρό (Μέτωπο Θ).

## ΚΑΘΕ ΑΛΛΑΓΗ ΣΤΟ FRONT END ΕΛΕΓΧΕΤΑΙ ΜΕΧΡΙ ΤΟΝ ΠΙΝΑΚΑ
Το UI είναι η βιτρίνα, όχι η απόδειξη. Καμία αλλαγή που διαβάζει ή γράφει
δεδομένα δεν θεωρείται ολοκληρωμένη επειδή «φάνηκε σωστή» ή επειδή βγήκε
πράσινο toast. **Πριν το push** απαντάς και τα πέντε:

1. **Ποιο endpoint** χτυπάει η ενέργεια;
2. **Ποιον πίνακα Postgres και ποιες στήλες** γράφει ή διαβάζει;
3. **Τι γράφτηκε ΟΝΤΩΣ** — δες την εγγραφή στη Supabase, όχι το μήνυμα επιτυχίας.
4. **Τι γίνεται στην αποτυχία** — και είναι σωστό να ανοίγει ή να κλειδώνει;
5. **Έχει δικαίωμα** ο ρόλος στο `PERMISSIONS` του Worker για αυτή την πράξη;

Γιατί υπάρχει ο κανόνας — όλα συνέβησαν στο ίδιο έργο (Αύγουστος 2026):
- Το `DELETE` κινήσεων παλετών γύριζε 403 από την πρώτη μέρα.
- Η τιμολόγηση έδειχνε υπόλοιπο παλετών `0` για κάθε πελάτη, γιατί διάβαζε άδειο
  πίνακα. Το άγραφο εμφανιζόταν ως ξοφλημένο.
- Το checkbox «τιμολογήθηκε» έδειχνε επιτυχία και **δεν γράφτηκε ποτέ**:
  `invoiced=true` σε **0 από 89** παραγγελίες, επί δέκα μέρες παραγωγής.
- Το κουμπί «Ολοκληρώθηκε» της ράμπας δεν προήγαγε ποτέ παραγγελία σε In Transit,
  γιατί ο σύνδεσμος `Order` δεν υπάρχει στον χάρτη του RAMP.
- Λίστα πελατών κομμένη στους 500: ονόματα εμφανίζονταν ως `#1314`.

Ισχύει και αντίστροφα: αλλαγή σε πίνακα ή στον Worker ⇒ βρες **ΠΟΙΟ** front end
το διαβάζει και τι θα δει.

### Ο ΕΠΑΝΑΛΑΜΒΑΝΟΜΕΝΟΣ ΕΛΕΓΧΟΣ (owner 24/8/2026 — ΚΑΘΕ session)

Δεν αρκεί ο κανόνας «όταν αλλάζω κάτι». **Σε κάθε session**, για ό,τι πεδίο
αγγίξαμε ή ό,τι φόρμα συζητήθηκε, μετράμε στη Supabase πόσες γραμμές έχουν
**όντως** τιμή στη στήλη που υποτίθεται γράφει η οθόνη:

```sql
-- πρότυπο: μηδέν σε πίνακα που χρησιμοποιείται = σιωπηλή απόρριψη
SELECT count(*) FILTER (WHERE <στήλη> IS NOT NULL) AS γραμμένα,
       count(*) AS σύνολο
FROM <πίνακας> WHERE deleted_at IS NULL;
```

**Γιατί:** η ValueDriven το επισήμανε στις 10/8 ως λάθος του owner. Μετρήθηκε
24/8 και ίσχυε μαζικά — αλλά η αιτία είναι **και τα δύο μισά**: το πεδίο
προστίθεται μπροστά χωρίς να μπει στον χάρτη, **και** ο Worker το κρύβει
απαντώντας «επιτυχία».

Κατάσταση 24/8/2026 (καμία δεν έχει διορθωθεί ακόμη):

| Πεδίο φόρμας | Στήλη | Γραμμένα |
|---|---|---|
| Ράμπα: παραγγελία / φορτηγό / οδηγός | `order_id`, `truck_id`, `driver_id` | **0 / 30** |
| Πελάτες: υπεύθυνος επικοινωνίας | `contact_person` | **0 / 1.920** |
| Πελάτες: ημέρες πίστωσης | `payment_terms_days` | **0 / 1.920** |
| Συντήρηση: εκτιμώμενο κόστος | `estimated_cost` | **0** |
| Παραγγελίες: τιμολογήθηκε | `invoiced` | **0 / 89** |
| Οδηγοί: βασικός μισθός | — | **δεν υπάρχει στήλη** |

---

## ΟΙ ΤΡΕΙΣ ΜΗΧΑΝΙΣΜΟΙ-ΠΑΓΙΔΕΣ ΤΟΥ FACADE

Ο Worker μιμείται το Airtable API πάνω από Postgres. Τρεις συμπεριφορές του
εξηγούν τη μεγάλη πλειοψηφία των σφαλμάτων του έργου. **Δεν είναι bugs που θα
διορθωθούν αύριο — είναι το έδαφος πάνω στο οποίο γράφεις σήμερα.**

### 1. Άγνωστο όνομα πεδίου = σιωπηλή απόρριψη, με ένδειξη επιτυχίας
```js
// deployed γρ. 1553-1560 — ΕΓΓΡΑΦΗ
for (const [label, value] of Object.entries(fields)) {
  const column = cfg.fields[label] || (cfg.aliases || {})[label];
  if (column) row[column] = value;     // ← κανένα else, καμία καταγραφή
}
```
Το ίδιο στην **ανάγνωση** (γρ. 1897-1904): ό,τι όνομα δεν αναγνωρίζεται απλώς δεν
μπαίνει στο `select`. Το αίτημα γυρίζει **200 OK**.

Εξαίρεση: άγνωστο όνομα σε **φίλτρο** πετάει `422` (`resolveColumn`, γρ. 1649) —
η μόνη διαδρομή που κάνει θόρυβο.

### 2. Στήλη με NULL δεν εμφανίζεται καθόλου
```js
// deployed γρ. 1873-1880
if (row[col] !== void 0 && row[col] !== null) fields[label] = row[col];
```
Άρα `'X' in rec.fields` είναι **false** και για το κενό και για το ανύπαρκτο. Οι
οθόνες συχνά μεταφράζουν την απουσία σε `0` ή «όλα εντάξει» — έτσι το άγραφο
φαίνεται ξοφλημένο και η λήξη που δεν φορτώθηκε φαίνεται εντάξει.

### 3. RBAC: το wildcard αντικαθιστά, δεν συγχωνεύεται
```js
// deployed γρ. 501-506
const tableRule = roleMap[table] || roleMap["*"];
```
Αν ο πίνακας **δεν** έχει ρητή γραμμή για τον ρόλο, ισχύει το `*`. Συνέπεια: κάθε
νέος πίνακας ανοίγει μόνος του σε όποιον ρόλο έχει `*`, και μια ρητή γραμμή που
ξεχνά μια μέθοδο την αφαιρεί σιωπηλά.

### ⇒ Ο ΚΑΝΟΝΑΣ
**Κάθε νέο όνομα πεδίου επιβεβαιώνεται στον χάρτη `TABLES` του κώδικα της
παραγωγής, ΓΙΑ ΤΟΝ ΣΥΓΚΕΚΡΙΜΕΝΟ πίνακα, πριν χρησιμοποιηθεί.**

Παγίδα αναζήτησης: τα **μονολεκτικά** κλειδιά γράφονται **χωρίς εισαγωγικά**
(`Price: "price"`, `Country: "country"`), τα πολυλεκτικά **με**
(`"VAT Number": "tax_id"`). Ένα `grep '"Price"'` επιστρέφει ψευδώς «δεν υπάρχει».
Αυτό το λάθος έγινε τρεις φορές στο audit — μην το ξανακάνεις.

---

## ΚΑΝΟΝΕΣ ΒΑΣΗΣ
- **Supabase = SELECT μόνο.** Κάθε εγγραφή, migration ή `REVOKE` θέλει **ρητή
  έγκριση του Δημήτρη στη συνομιλία**, πριν εκτελεστεί.
- **Ποτέ δοκιμή exploit.** Ευπάθεια τεκμηριώνεται με ανάγνωση δικαιωμάτων, δεν
  επιβεβαιώνεται εκτελώντας την.
- Ο Worker μιλάει στη βάση με `service_role`. Το RLS είναι ενεργό αλλά **χωρίς
  πολιτικές** — μη βασίζεσαι σε αυτό ως προστασία.

## ΚΑΝΟΝΑΣ ΕΝΟΣ ΚΑΝΑΛΙΟΥ
**Στο repo δουλεύει ΕΝΑΣ agent τη φορά** — Claude Code **ή** Cursor, όχι
παράλληλα στο ίδιο έδαφος. Το split-brain repo/παραγωγής προήλθε ακριβώς από
πολλαπλά κανάλια αλλαγών χωρίς ίχνος.

## RECORD ΚΑΘΕ SESSION
Κάθε ουσιαστικό session αφήνει γραπτό ίχνος στο repo (`docs/data-audit/` για το
audit, `docs/DECISION_LOG.md` για αποφάσεις). Ο owner θέλει η ValueDriven,
μπαίνοντας στο repo, να βλέπει τι έγινε χωρίς να ρωτήσει.
⚠️ **Το repo είναι ΔΗΜΟΣΙΟ** — ευρήματα ασφαλείας δεν ανεβαίνουν πριν κλείσουν.

### ⛔ ΜΗΝ ΤΟ ΚΑΝΕΙΣ ΙΔΙΩΤΙΚΟ — ρίχνει την εφαρμογή (δοκιμάστηκε 24/8/2026)
Το app φιλοξενείται σε **GitHub Pages από τη ρίζα του `main`**. Σε **δωρεάν**
λογαριασμό το Pages σερβίρει **μόνο από δημόσιο repo**: μόλις γίνει ιδιωτικό, το
GitHub **αποδημοσιεύει** τη σελίδα και όλες οι διευθύνσεις γυρίζουν 404.

Έγινε στις 24/8 μέσα σε ώρες λειτουργίας. Χειρότερα: η επαναφορά σε δημόσιο
**δεν** ξαναενεργοποιεί το Pages — η ρύθμιση μηδενίζεται και χρειάζεται
χειροκίνητο Settings → Pages → Source: `Deploy from a branch`, Branch: `main`,
Folder: `/ (root)` → Save, και 1-3 λεπτά rebuild.

Αν χρειαστεί ποτέ ιδιωτικό repo, **πρώτα** GitHub Pro (Pages από ιδιωτικό) ή
μεταφορά της φιλοξενίας αλλού. Ο Worker και η Supabase **δεν** επηρεάζονται —
μόνο η φιλοξενία των αρχείων.

## ΚΛΕΙΔΩΜΕΝΕΣ ΑΠΟΦΑΣΕΙΣ OWNER (23/8/2026)

Δεν ξανασυζητιούνται και δεν «διορθώνονται» ως bugs.

- **Dispatcher δεν βλέπει P&L** — περιθώρια, κέρδη, κόστη (`Gross Profit`,
  `Margin Percent`, `Client Revenue`, καύσιμα). Η **τιμή πώλησης** (`Price`)
  μένει ορατή μέχρι τη φάση P&L.
- **Τιμολόγηση: το TMS ΔΕΝ εκδίδει τιμολόγια** — το ERP τα εκδίδει. Το TMS δείχνει
  τα στοιχεία και προσφέρει checkbox «Invoiced», ώστε να μη μείνει τίποτα
  ατιμολόγητο. Ισχύει και για εθνικές: τα VS φορτία ζουν στο `national_loads`
  (θα προστεθεί εκεί στήλη invoiced όταν χρειαστεί).
- **`Net Price` / επιμερισμός τιμής VS**: σκόπιμα ανυλοποίητο μέχρι τη φάση P&L.
  **Δεν είναι bug.** Δεν υπάρχει ούτε στον χάρτη ούτε ως στήλη.
- **`national_orders` άδειο = ΣΩΣΤΟ.** Το Veroia Switch γράφει **κατευθείαν** στο
  `national_loads`. Δεν δημιουργούνται εγγραφές NATIONAL ORDERS.
- **Cross-dock: ΜΙΑ στήλη**, η `cross_dock_date`. Κανόνας εκτίμησης όταν είναι
  κενή: **export = Loading Date + 1 ημέρα**, **import = Delivery Date − 1 ημέρα**
  (επαληθεύτηκε σε 7/8 δείγματα παραγωγής· η 8η ήταν χειροκίνητη παρέκκλιση). Το
  label `VS CD Date` θα γίνει συνώνυμο της **ίδιας** στήλης — εκκρεμεί στη
  συμφιλίωση. Σήμερα: `cross_dock_date` 19/19 γεμάτη, `vs_cd_date` 0/19.
- **Δικαιώματα**: προσωρινά όλοι οι ρόλοι επεξεργάζονται ευρέως (αρχικό στάδιο —
  ένα 403 σε λάθος στιγμή σταματά δουλειά). Το `DELETE` μένει στενό όπως σήμερα.
  Θα σφίξουν σε πλήρη λειτουργία.
- **Dashboard**: διαβάζει `Price` μέχρι το P&L.
- **Status — ενιαίο λεξιλόγιο** στη ζωή της μεταφοράς (κατεύθυνση):
  `Pending → Assigned → In Transit → Delivered`, συν `Cancelled`.
  Εξαιρέσεις: τα **GROUPAGE LINES** κρατούν `Unassigned/Assigned` (κανόνας
  never-delete)· η **RAMP** κρατά το δικό της μικρό (`Planned/Done`) γιατί δεν
  είναι μεταφορά. Το «Invoiced» **δεν είναι status** — μόνο checkbox.

---

## COMMENTS — γράφε το ΓΙΑΤΙ, όχι το ΤΙ
Το «τι» φαίνεται από τον κώδικα. Το «γιατί» χάνεται σε μία εβδομάδα.

Σχόλιο μπαίνει όπου η επιλογή **δεν είναι προφανής**: όταν απορρίφθηκε κάτι
άλλο, όταν υπάρχει παγίδα, όταν το προφανές θα ήταν λάθος. Γράφεις την
απόφαση, τι σπάει χωρίς αυτήν, και ημερομηνία/πηγή αν είναι απόφαση του owner.

```js
// ΛΑΘΟΣ — περιγράφει τον κώδικα
// Θέτει το status σε Delivered

// ΣΩΣΤΟ — εξηγεί γιατί ΔΕΝ το θέτει
// Το «παραδόθηκε» υπολογίζεται, δεν γράφεται (owner 10/8): το Status δεν
// ισχυρίζεται γεγονός που κανείς δεν επιβεβαίωσε. Αν μια παράδοση μετατεθεί,
// δεν έχει γραφτεί ψέμα στη βάση.
```

Δεν σχολιάζουμε αυτονόητο κώδικα. Σχόλιο που περιγράφει κάτι που άλλαξε
ενημερώνεται ή φεύγει μαζί του — ένα ξεχασμένο σχόλιο είναι χειρότερο από
κανένα.

**Κάθε ουσιαστική απόφαση πάει ΚΑΙ στο `docs/DECISION_LOG.md`** με τη μορφή
του (επιλογή / εναλλακτικές / απόδειξη / ποιος). Το σχόλιο εξηγεί το σημείο,
το log εξηγεί τη διαδρομή.

## ΔΕΝ ΣΤΕΛΝΟΥΜΕ ΑΔΟΚΙΜΑΣΤΗ ΔΗΜΙΟΥΡΓΙΑ ΠΑΡΑΓΓΕΛΙΩΝ
Ό,τι αγγίζει φόρμες παραγγελιών ή εγγραφή σε ORDERS / NATIONAL LOADS /
GROUPAGE LINES / CONSOLIDATED LOADS / ORDER STOPS **ανοίγει και δοκιμάζεται πριν
το push**. Στις 10/08 στάλθηκε ενοποίηση φόρμας χωρίς να ανοίξει η φόρμα ούτε μία
φορά — έσπασαν αναζήτηση, συμπλήρωση και επεξεργασία, χρειάστηκε revert
(`68ecbf4`). Ο έλεγχος σύνταξης **ΔΕΝ** είναι δοκιμή.

---

## Αρχιτεκτονική

```
Browser (GitHub Pages)
   │  fetch με Airtable-style URLs + JWT
   ▼
Cloudflare Worker  «petras-tms-backend-staging»
   │  facade: μεταφράζει labels → στήλες, μιμείται το Airtable API
   │  μιλάει με service_role
   ▼
Supabase Postgres  (project «Petrasgroup TMS»)
```

**Το Airtable δεν χρησιμοποιείται πλέον πουθενά.** Cutover C2 στις 28/7/2026: ο
browser δεν του μιλάει καθόλου (`config.js:8-17`, `USE_PROXY = true`).

Τα «table IDs» (`tblgHlNmLBH3JTdIM` κ.λπ.) **δεν είναι πια Airtable** — είναι τα
IDs διαδρομών του facade, που ο Worker αντιστοιχίζει σε πίνακες Postgres.

### Χάρτης facade ID → Postgres

| Facade ID | Όνομα | Πίνακας Postgres |
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

Special: Veroia Cross-Dock location = `recJucKOhC1zh4IP3`

### Sync chain
```
ORDERS (Veroia Switch = ON) ──► NATIONAL LOADS   (απευθείας, Source Type)
                                 ΔΕΝ περνά από NATIONAL ORDERS

ORDERS / NATIONAL ORDERS (National Groupage = ON)
   └─► GROUPAGE LINES (1 ανά στάση, Status: Unassigned/Assigned)
          └─► CONSOLIDATED LOADS (1 ανά φορτηγό, drag & drop)
                 └─► εμφανίζεται στο Weekly National, στήλη ΑΝΟΔΟΣ
```

**GROUPAGE LINES — ΠΟΤΕ δεν διαγράφονται.** Στην επαναφορά ή στο σβήσιμο του
Groupage: `Status = 'Unassigned'` και τίποτα άλλο. Μόνο τα CONSOLIDATED LOADS
διαγράφονται. Η βάση το επιβάλλει με `ON DELETE RESTRICT`.

### Auth
Το login γίνεται μέσω Worker `/auth/login` → Postgres `verify_login` (bcrypt),
και επιστρέφει JWT 8 ωρών. Οι πίνακες `USERS` σε `config.js` και `index.html`
είναι **μόνο roster** για τον tamper guard του `core/auth.js:24-30` — τα SHA-256
hashes εκεί είναι **νεκρό legacy σχήμα**, δεν χρησιμοποιούνται για είσοδο.
Στη βάση υπάρχουν **6 πραγματικοί λογαριασμοί**.

⚠️ Χρήστης που λείπει από τη λίστα του `index.html` πετιέται έξω από τον tamper
guard· χρήστης που λείπει από τη **βάση** δεν μπορεί να μπει καθόλου. Νέος
λογαριασμός θέλει **και τα δύο**.

**Ρόλοι**: `owner`, `management`, `accountant`, `dispatcher`, `warehouse`
(`PERMISSIONS`, deployed γρ. 368).

### Σύνταξη προς το facade
Η σύνταξη παραμένει Airtable-style — **αλλά ο παραλήπτης είναι ο Worker, όχι το
Airtable.** Ισχύει μόνο ό,τι ο Worker μεταφράζει.

```js
// Linked records: σκέτος πίνακας string
fields['Driver'] = ['recABC123']       // ✅
fields['Driver'] = [{id:'recABC123'}]  // ❌

// Φίλτρο για linked record — FIND, όχι SEARCH
filterByFormula = `FIND("recXXX", ARRAYJOIN({Linked Order}, ","))>0`
// ⚠️ Δουλεύει ΜΟΝΟ αν ο πίνακας έχει `links` block στον Worker.
//    Το RAMP ΔΕΝ έχει → κάθε τέτοιο φίλτρο εκεί γυρίζει 422.

// Checkbox
filterByFormula = `{National Groupage}=1`   // 1, όχι TRUE()

// Direction — NATIONAL ORDERS: βελάκια | CONSOLIDATED LOADS: ελληνικά
'North→South' (ΚΑΘΟΔΟΣ) · 'South→North' (ΑΝΟΔΟΣ)
'ΚΑΘΟΔΟΣ' · 'ΑΝΟΔΟΣ'

// Παγίδες ονομάτων (επαληθευμένες στον deployed χάρτη 23/8/2026)
'Week Number'   ← χωρίς κενό, formula field, ΔΕΝ γράφεται
'Veroia Switch' ← χωρίς κενό στο τέλος
'Adress'        ← ένα 'd' σε CLIENTS και PARTNERS· 'Address' σε LOCATIONS/WORKSHOPS
'Order Number'  ← ΔΕΝ ΥΠΑΡΧΕΙ. Χρησιμοποίησε 'Reference'.
'Net Price'     ← ΔΕΝ ΥΠΑΡΧΕΙ (κλειδωμένη αναβολή). Χρησιμοποίησε 'Price'.
```

### Deploy pattern (front end)
```bash
# 1. Edit module file
# 2. Bump ?v= στο app.html:  modules/orders_natl.js?v=TIMESTAMP
# 3. git add . && git commit -m "..." && git push
```
Το `CLAUDE.md` και τα `docs/` **δεν** φορτώνονται από το app.html — δεν θέλουν
bump.

---

## Δομή αρχείων

```
PETRASGROUP-TMS/
├── app.html · index.html · print.html · sw.js · config.js
├── assets/style.css
├── core/
│   ├── api.js           ← atGet/atGetAll/atPatch/atCreate/atDelete + cache
│   ├── auth.js          ← ρόλοι + tamper guard· can()
│   ├── router.js · ui.js · utils.js · icons.js · constants.js
│   ├── entity.js        ← generic CRUD για master data
│   ├── order-sync.js    ← cascade ORDERS → NL/GL/CL/RAMP/PA
│   ├── pa-helpers.js    ← partner assignments
│   ├── stops-helpers.js · form-helpers.js · data-helpers.js
│   ├── scan-helpers.js · pallet-feed.js · metrics.js
│   ├── ai-chat.js · command-center.js · command-palette.js
├── modules/
│   ├── orders_intl.js · orders_natl.js
│   ├── weekly_intl.js · weekly_natl.js
│   ├── daily_ops.js · daily_ramp.js
│   ├── dashboard.js · ceo_dashboard.js · performance.js
│   ├── invoicing.js · costs.js · pallet_ledger.js · pallet_upload.js
│   ├── maintenance.js · locations.js · locations_map.js
│   └── audit_trail.js · metrics_audit.js
├── worker/
│   ├── src/index.js     ⚠️ ΔΕΝ είναι ο κώδικας της παραγωγής — βλ. ΠΑΓΙΔΑ DEPLOY
│   ├── migrations/ · wrangler.toml · archive/
├── db/migrations/
└── docs/
    ├── DECISION_LOG.md · ARCHITECTURE.md · SCHEMA.md · SECURITY.md
    ├── data-audit/2026-08/   ← audit ακεραιότητας + session log
    └── audit-findings/ · design/ · premortems/ · worker/
```

---

## Design System
- Accent: `#0284C7` (cold chain blue) · hover `#0369A1`
- Sidebar navy `#0B1929` · ενεργό item: μπλε αριστερό border `#38BDF8`
- Background `#F4F6F9`
- Fonts: **Syne** (τίτλοι) + **DM Sans** (σώμα)
- Buttons: `.btn-new-order` (navy→blue) · `.btn-scan` (blue outline)
- Κάρτες ανάθεσης: navy (ιδιόκτητος στόλος) · σκούρο πράσινο (συνεργάτης) ·
  σκούρο κόκκινο `#7F1D1D` (χωρίς ανάθεση)

---

## Βασικές επιχειρησιακές έννοιες
- **Veroia Switch** — εσωτερικό cross-docking στο Βέρμιο/Βέροια. **Ποτέ δεν
  λέγεται στους πελάτες.** Γράφει απευθείας στο `national_loads`· τιμολογείται
  μόνο η διεθνής παραγγελία.
- **Wednesday Cutoff** — παραγγελίες εξαγωγής γίνονται δεκτές ως Τετάρτη για
  παράδοση το Σαββατοκύριακο.
- **ΑΝΟΔΟΣ** = South→North (προμηθευτές → Βέροια) · **ΚΑΘΟΔΟΣ** = North→South
- **National Groupage** — πολλοί μικροί προμηθευτές σε ένα φορτηγό.
- **Proactive Pulse** — επικοινωνία πελάτη σε 3 στάδια (Mission Start /
  Pre-Alert / Fresh-Check Close).

---

## Κατάσταση modules (Αύγουστος 2026)

**Σε παραγωγική χρήση** — από 12/8/2026 με πραγματικά δεδομένα:
Weekly International · Weekly National · Daily Ops · Daily Ramp Board ·
International Orders CRUD · National Orders CRUD · Locations (+ χάρτης) ·
Clients / Partners / Drivers / Trucks / Trailers · Maintenance (συνεργεία,
ιστορικό, αιτήματα) · Dashboard · Audit Trail

**Χτισμένα, με ανοιχτά ζητήματα:** Invoicing (το checkbox «Invoiced» δεν έχει
γραφτεί ποτέ — ο `accountant` δεν έχει δικαίωμα εγγραφής στα `orders`) ·
Pallet Ledger · CEO Dashboard / Performance (αρκετοί δείκτες δείχνουν δομικά 0)

**Στο repo αλλά ΔΕΝ έχουν γίνει deploy** (→ 404 στην παραγωγή):
`/costs/*` · `/pallets/*` · `local_moves`. Μην τα «ενεργοποιήσεις» με deploy από
τον φάκελο — βλ. ΠΑΓΙΔΑ DEPLOY.

**Επόμενα:** Trip Costs / P&L · Fuel Receipts UI · Driver Payroll ·
MyGeotab GPS μέσω Make.com · Settings

---

## Credentials
Στο `.env.local` — **ποτέ σε commit**. Ζήτα τιμές από τον Δημήτρη.
Κλειδιά: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CF_API_TOKEN`.
Το παλιό Airtable PAT είναι **ανακλημένο** και δεν χρειάζεται πουθενά.

## Γλώσσα
Ο Δημήτρης επικοινωνεί στα **ελληνικά**. Απάντα στα ελληνικά στη συζήτηση,
**αγγλικά στα σχόλια κώδικα**.
