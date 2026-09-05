# Μισθοδοσία Οδηγών — Καρτέλα οδηγού (driver ledger) — Σχέδιο

_2026-09-05 · owner: Δημήτρης · συγγραφή: Claude (Fable 5.1) · κατάσταση: **εγκεκριμένο σχέδιο, προς πλάνο υλοποίησης**_

Figma: `KO7l2AfucR3HJEDIg1Yptr` → Screens → `w5-payroll-balances` (454:901),
`w5-payroll-driver-ledger` (454:902), `w5-payroll-entry-form` (454:903).

---

## 0. Τι είναι και τι δεν είναι

Η «Μισθοδοσία Οδηγών» του TMS είναι **καρτέλα οδηγού**: τρεχούμενος λογαριασμός
ανά οδηγό που απαντά «τι χρωστάμε σήμερα σε κάθε οδηγό, από ποια δρομολόγια
προκύπτει, και τι έχει ήδη πληρωθεί». Αντικαθιστά ένα Excel ανά οδηγό
(πρότυπο: `ΟΔΗΓΟΣ-Α.xlsx`, 168 γραμμές, 2024–2026).

**Δεν είναι** νομική μισθοδοσία (εισφορές, υπερωρίες, νυχτερινά). Αυτή μένει
στον λογιστή, όπως έκρινε το pre-mortem της 11/7 (T2). Το TMS δεν εκδίδει
τίποτα· καταγράφει και αθροίζει.

### Πώς πληρώνονται οι οδηγοί (owner 5/9/2026)
- **Μόνο ανά δρομολόγιο.** Καμία σταθερή βάση, καμία στήλη μισθού.
- Το ποσό ορίζεται **χειροκίνητα** τους πρώτους μήνες. Υπάρχει τρόπος
  υπολογισμού που θα αυτοματοποιηθεί αργότερα — **όχι τώρα**.
- Μονάδα = το **round trip** (κύκλος). Τα εθνικά (ΑΘΗΝΑ 230, ΠΑΤΡΑ 230,
  ΘΕΣΣΑΛΟΝΙΚΗ 80) είναι επίσης δρομολόγια της καρτέλας.
- Ροή μετρητών: ο οδηγός παίρνει προκαταβολή στην αναχώρηση (συνήθως 300
  διεθνές, 100 εθνικό), πληρώνει από αυτά έξοδα της εταιρείας χωρίς
  παραστατικό (τα «Έξοδα Μ» του TRIP PnL), φέρνει λίστα στην επιστροφή, και
  **κρατά τα ρέστα ως μέρος της αμοιβής**.
- Πληρωμές: μετρητά ή κατάθεση τράπεζας (η κατάθεση είναι σταθερή ανά μήνα).

### Η αριθμητική μιας γραμμής (ακριβώς όπως το Excel)
```
Δρομολόγιο:  Κράτησε = Έλαβε − Έξοδα
             Υπόλοιπο γραμμής = Αξία − Κράτησε          (θετικό = οφείλουμε)
Πληρωμή:     Υπόλοιπο γραμμής = −Ποσό
Προοδευτικό = άθροισμα υπολοίπων γραμμών κατά ημερομηνία, id
```
Επαλήθευση στο πρότυπο: 168 γραμμές, χρονολογικά ταξινομημένες → **123,45 €**,
ίσο με το τελευταίο ΠΡΟΟΔΕΥΤΙΚΟ του Excel. Αυτό είναι το τεστ αποδοχής της
εισαγωγής.

---

## 1. Αρχιτεκτονική επιλογή (Α) και τι αναθεωρεί

**Η καρτέλα είναι η πηγή αλήθειας για τα χρήματα του οδηγού.** Νέος πίνακας
`dl_entries`. Το TRIP PnL **διαβάζει** από εκεί την αμοιβή οδηγού και τα
Έξοδα Μ της συνδεδεμένης γραμμής· οι κατηγορίες `driver_pay` και `cash_m`
**αφαιρούνται** από την άμεση καταχώρηση στο `ct_cost_lines`.

Αναθεωρεί το TRIP_COSTS_SPEC §10.1 #5 **μόνο ως προς τον πίνακα**: η αρχή
«ανά δρομολόγιο, χειροκίνητο v1» μένει· η αρχή του pre-mortem T1 «μία πηγή,
όχι δύο» μένει — αλλάζει ποια είναι η πηγή. Λόγος: το ιστορικό των Excel
(2.500+ γραμμές) δεν αντιστοιχεί σε round trips του συστήματος, και σήμερα
υπάρχουν 20 RT με 0 γραμμές `driver_pay`. Απορρίφθηκαν: (Β) όλα μέσα στο
`ct_cost_lines` (θέλει ψευδο-RT για κάθε παλιό δρομολόγιο)· (Γ) μόνο
πληρωμές + υπόλοιπο έναρξης (ο owner ζήτησε πλήρη εισαγωγή).
→ Εγγραφή στο `docs/DECISION_LOG.md` και στο `docs/TRIP_COSTS_DECISION_LOG.md`.

---

## 2. Μοντέλο δεδομένων — migration `worker/migrations/011_driver_ledger.sql`

### 2.1 `dl_entries`
| Στήλη | Τύπος | Σημείωση |
|---|---|---|
| `id` | bigint identity PK | |
| `driver_id` | bigint NOT NULL FK `drivers(id)` | |
| `entry_type` | text NOT NULL | `trip` · `payment_cash` · `payment_bank` · `adjustment` |
| `entry_date` | date NOT NULL | trip: αναχώρηση · πληρωμή: ημερομηνία |
| `date_end` | date | trip μόνο· NULL όσο ο οδηγός είναι στον δρόμο |
| `route` | text | ελεύθερο κείμενο (Excel / χειροκίνητο). NULL όταν υπάρχει `rt_id`: η διαδρομή υπολογίζεται από τα σκέλη |
| `rt_id` | bigint FK `ct_round_trips(id)`, UNIQUE όπου NOT NULL | προαιρετικός σύνδεσμος |
| `trip_value` | numeric(10,2) | Αξία· **NULL = εκκρεμεί** (ποτέ 0 για άγνωστο) |
| `advance` | numeric(10,2) | Έλαβε· NULL = δεν καταχωρήθηκε |
| `expenses` | numeric(10,2) | Έξοδα Μ· NULL = δεν καταχωρήθηκε |
| `amount` | numeric(10,2) | ποσό πληρωμής / προσαρμογής (με πρόσημο για adjustment) |
| `balance_delta` | numeric(10,2) GENERATED | trip: `coalesce(trip_value,0) − (coalesce(advance,0) − coalesce(expenses,0))` · payment: `−amount` · adjustment: `amount` |
| `source` | text NOT NULL | `manual` · `auto` (trigger) · `excel_import` |
| `import_batch` | uuid | ίδιο για όλες τις γραμμές ενός αρχείου |
| `needs_review` | boolean NOT NULL default false | βλ. §3 (αλλαγή οδηγού μετά την καταχώρηση) |
| `review_note` | text | γιατί θέλει έλεγχο |
| `note` | text | |
| `deleted_at`, `deleted_reason` | timestamptz, text | ακύρωση με αιτιολογία· **ποτέ DELETE** |
| `created_by`, `created_at`, `updated_at` | | |

**Κανόνες στη βάση** (αρχή 4 — κάθε διαδρομή, και η μελλοντική):
- CHECK ανά τύπο: `trip` ⇒ `amount IS NULL`· `payment_*` ⇒ `amount > 0` και
  `trip_value/advance/expenses/rt_id/date_end IS NULL`· `adjustment` ⇒
  `amount <> 0` και τα ίδια NULL.
- CHECK `date_end IS NULL OR date_end >= entry_date`.
- CHECK `deleted_at IS NULL OR deleted_reason IS NOT NULL`.
- UNIQUE partial index σε `rt_id WHERE rt_id IS NOT NULL AND deleted_at IS NULL`.
- Grants: `REVOKE ALL FROM public, anon, authenticated`· `service_role`:
  SELECT, INSERT, UPDATE — **όχι DELETE** (πρότυπο `groupage_lines`).
- Indexes: `(driver_id, entry_date, id)`, `(rt_id)`, `(import_batch)`.

### 2.2 Views (όλα `security_invoker`, γεννημένα κλειστά)
- `dl_v_entries`: κάθε ζωντανή γραμμή + `running_balance` (window sum ανά
  οδηγό, ORDER BY `entry_date, id`) + `route_text` (από `route`, ή από τα
  σκέλη του RT: ονόματα τοποθεσιών φόρτωσης/παράδοσης) + `rt_code` +
  `pending` (= `entry_type='trip' AND trip_value IS NULL`). Οι ακυρωμένες
  γραμμές επιστρέφονται με `cancelled=true` και **δεν** μετρούν στο σύνολο.
- `dl_v_balance`: ανά ενεργό οδηγό: `balance`, `trips_ytd`, `pending_count`,
  `last_entry_date`, `last_trip_date`, `last_trip_route`, `last_trip_rt_code`,
  `last_payment_date`, `last_payment_type`, `days_since_last_entry`.
- `dl_v_rt_gap`: RT ιδιόκτητα, μη ακυρωμένα, με `driver_id`, **χωρίς** ζωντανή
  γραμμή καρτέλας. Ο μετρητής συμφωνίας της λίστας. Κανονικά 0.

### 2.3 Σύνδεση με TRIP PnL
- `ct_v_rt_costs`: `lines_net` += `coalesce(dl.trip_value,0) + coalesce(dl.expenses,0)`
  της ζωντανής γραμμής με ίδιο `rt_id`. Νέες στήλες `driver_pay_pending`
  (γραμμή υπάρχει, αξία NULL) και `driver_pay_missing` (καμία γραμμή). Το
  PnL δείχνει «αμοιβή οδηγού: εκκρεμεί», **όχι 0**.
- `ct_cost_lines.category` CHECK: αφαιρούνται `driver_pay`, `cash_m`. Η μία
  υπάρχουσα γραμμή `cash_m` (id 3, 50 €, RT-1014, οδηγός-Β) μεταφέρεται
  ως γραμμή trip στην καρτέλα (`expenses=50`, `trip_value NULL`, `rt_id=14`)
  και μετά διαγράφεται από το `ct_cost_lines` μέσα στο ίδιο migration, με
  audit σχόλιο.
- Worker `CT_CATEGORIES` και `CT_CATEGORY_LABELS` (costs.js): αφαιρούνται οι
  δύο κατηγορίες. Το PnL δείχνει τις τιμές της καρτέλας ως ξεχωριστή γραμμή
  «Οδηγός (από καρτέλα)» με σύνδεσμο.

---

## 3. Αυτόματη γραμμή από την ανάθεση — trigger στο `ct_round_trips`

Πηγή γεγονότων: `core/rt-feed.js` (Φ2 Costs, ζωντανό) δημιουργεί RT όταν
διεθνής παραγγελία γίνει In Transit/Delivered με ανάθεση, γράφει `driver_id`,
κλείνει στο Delivered. Ισχύει και για το χειροκίνητο modal του PnL και για
μελλοντικό feeder εθνικών — το trigger τα πιάνει όλα.

`AFTER INSERT OR UPDATE ON ct_round_trips` (function `dl_sync_from_rt()`):

| Γεγονός | Ενέργεια στην καρτέλα |
|---|---|
| RT `trip_type='OWNED'`, `driver_id` NOT NULL, status ≠ cancelled, χωρίς ζωντανή γραμμή | INSERT trip: `driver_id`, `entry_date=date_start`, `date_end`, `rt_id`, **`trip_value NULL`, `advance NULL`, `expenses NULL`** (owner 5/9: το Έλαβε δεν προσυμπληρώνεται), `source='auto'`, `created_by='trigger:'||rt.created_by` |
| `driver_id` άλλαξε | UPDATE `driver_id` **πάντα**. Αν η γραμμή έχει οποιοδήποτε ποσό ⇒ `needs_review=true`, `review_note='άλλαξε οδηγός <παλιός>→<νέος> στις <ημ/νία>, μετά την καταχώρηση ποσών'` |
| `date_start`/`date_end` άλλαξαν | UPDATE **πάντα** (η διαδρομή δεν αποθηκεύεται, άρα είναι πάντα η τρέχουσα) |
| status → `cancelled` | χωρίς ποσά ⇒ `deleted_at=now(), deleted_reason='RT ακυρώθηκε'`. Με ποσά ⇒ `needs_review=true`, note |
| status → `closed`/`complete` | `date_end` συγχρονίζεται. Η αξία **μένει εκκρεμής** μέχρι να γραφτεί |
| RT PARTNER | τίποτα (δεν έχει οδηγό μας) |

Το trigger **δεν** υπολογίζει αξία. Δεν αγγίζει γραμμές `source='excel_import'`
ή `manual` παρά μόνο αν έχουν `rt_id` (τότε είναι συνδεδεμένες και συγχρονίζονται
όπως οι auto).

---

## 4. Worker — πόρος `ledger` μέσα στο `handleCosts`

| Διαδρομή | Ρόλοι | Τι κάνει |
|---|---|---|
| `GET /costs/ledger` | owner, accountant, management | `dl_v_balance` + `dl_v_rt_gap` count |
| `GET /costs/ledger/:driverId?year=` | ίδιοι | `dl_v_entries` του οδηγού (ζωντανές + ακυρωμένες) |
| `POST /costs/ledger` | ίδιοι | νέα κίνηση. Επικυρώνει `entry_type`, ποσά ανά τύπο, οδηγό ενεργό, `rt_id` υπαρκτό και ελεύθερο. **Άγνωστο πεδίο ⇒ 400 με το όνομά του** (όχι σιωπηλή απόρριψη) |
| `PATCH /costs/ledger/:id` | ίδιοι | Συμπλήρωση **κενού** πεδίου: χωρίς reason. Αλλαγή **γραμμένου** ποσού/ημερομηνίας: `reason` υποχρεωτικό. Ακύρωση: `{cancel:true, reason}` ⇒ `deleted_at`. Επαναφορά ακύρωσης: μόνο owner, με reason. `needs_review=false` με reason («ελέγχθηκε») |
| `POST /costs/ledger/import` | owner | καλεί RPC `dl_import(driver_id, batch uuid, file_hash, rows jsonb)` — ατομικά ανά οδηγό |

`COSTS_PERMS`: `ledger: ["GET","POST","PATCH"]` σε owner, accountant,
management (owner 5/9: «accountant/management όλα»). Dispatcher, warehouse:
**τίποτα** — δεν προστίθενται (σχόλιο RBAC γρ. ~457 το προβλέπει ήδη).
Κάθε mutation ⇒ `audit()` before/after, όπως το `ct_cost_lines`.

Front end gate: το route `payroll` ελέγχει `can('costs') !== 'none'` (owner,
accountant `full`· management `view` — αρκεί για να ανοίξει η σελίδα). Την
εγγραφή την κρίνει ο Worker, όπου η management έχει POST/PATCH. Ένα κλειδί
δικαιωμάτων, όχι δύο. Ο dispatcher (`costs:'none'`) δεν βλέπει τη σελίδα.

---

## 5. Οθόνες (Figma, 1384×898, ίδιες συμβάσεις με κύματα 2–4)

### 5.1 Λίστα οδηγών — `w5-payroll-balances`
Header: τίτλος · chips `Όλοι (30)` · `Με υπόλοιπο` · `Εκκρεμείς αξίες (n)` ·
`Χωρίς κίνηση 30+ ημ. (n)` · `Ανενεργοί` · αναζήτηση · **Νέα κίνηση** (Primary).
Metrics: «Χρωστάμε Χ € σε n οδηγούς» · «n δρομολόγια χωρίς αξία» (amber) ·
«n οδηγοί χωρίς καταχώρηση 30+ ημέρες» (amber) · δεξιά «RT χωρίς γραμμή
καρτέλας: 0 · πηγή: dl_v_balance». Πίνακας 40px/γραμμή: ΟΔΗΓΟΣ (όνομα /
τύπος · τελευταία πληρωμή) · ΤΕΛΕΥΤΑΙΟ ΔΡΟΜΟΛΟΓΙΟ (ημ/νίες + διαδρομή / RT ή
«χωρίς σύνδεση RT») · ΔΡΟΜΟΛΟΓΙΑ έτους · ΥΠΟΛΟΙΠΟ (ποσό **και λέξη**: «του
χρωστάμε» / «μας χρωστά» / «τακτοποιημένο») · «καρτέλα →». Footer: σύνολο
οφειλής. Καταστάσεις: κενό («καμία καρτέλα ακόμη») ≠ σφάλμα (StateMessage).

### 5.2 Καρτέλα οδηγού — `w5-payroll-driver-ledger`
Header: ← Μισθοδοσία · όνομα · ΕΝΕΡΓΟΣ · τύπος · IBAN · chips έτους · **Πληρωμή**
(Secondary) · **Νέο δρομολόγιο** (Primary). Ζώνη: ΥΠΟΛΟΙΠΟ ΣΗΜΕΡΑ (18px, με
λέξη) · ΔΡΟΜΟΛΟΓΙΑ έτους · ΑΞΙΑ έτους · ΠΛΗΡΩΜΕΣ έτους (μετρητά · τράπεζα).
Πίνακας, νεότερο πρώτο, 40px: # · ΗΜ/ΝΙΑ · ΕΙΔΟΣ (pill Δρομολόγιο / Μετρητά /
Τράπεζα) · ΔΙΑΔΡΟΜΗ/ΠΕΡΙΓΡΑΦΗ (δεύτερη σειρά: RT-xxxx · πινακίδα · «τρέφει το
TRIP PnL», ή «χωρίς σύνδεση RT», ή «auto από RT-xxxx · **εκκρεμεί αξία**» amber)
· ΕΛΑΒΕ · ΕΞΟΔΑ · ΚΡΑΤΗΣΕ · ΑΞΙΑ · ΥΠΟΛΟΙΠΟ · ΠΡΟΟΔΕΥΤΙΚΟ. Κενό = «—», ποτέ 0.
Ακυρωμένη γραμμή: διαγράμμιση + «ακυρώθηκε <ημ/νία> · <αιτία> · <ποιος>», δεν
μετρά. Footer: σύνολα έτους. Κλικ σε γραμμή ⇒ επεξεργασία στη θέση της.

### 5.3 Φόρμα νέας κίνησης — `w5-payroll-entry-form` (modal 640)
Είδος (segmented: Δρομολόγιο / Πληρωμή μετρητά / Πληρωμή τράπεζα). Δρομολόγιο:
Οδηγός* · Σύνδεση με RT (προαιρετικό, λίστα RT του οδηγού χωρίς γραμμή) ·
Αναχώρηση* · Επιστροφή · Διαδρομή* (ελεύθερο, ή αυτόματο από RT) · Αξία* ·
Έλαβε (κενό αν δεν δόθηκαν ακόμη) · Έξοδα · ζωντανός υπολογισμός (Κράτησε ·
Υπόλοιπο γραμμής · Νέο προοδευτικό) · Σημείωση. Πληρωμή: Οδηγός* · Ημερομηνία*
· Ποσό* · Σημείωση. Footer: «Η κίνηση δεν διαγράφεται. Αν γίνει λάθος,
ακυρώνεται με αιτιολογία και μένει ορατή.» · Άκυρο · Καταχώρηση. Σφάλμα Worker
⇒ μήνυμα με το πεδίο.

---

## 6. Εισαγωγή ιστορικού από τα Excel

Πηγή: φάκελος Google Drive «μισθοδοσία» (ο owner δίνει πρόσβαση), ένα xlsx ανά
οδηγό, διάταξη `ΟΔΗΓΟΣ-Α.xlsx`: κεφαλίδα γρ. 3, στήλες B Α/Α · C ημ/νία
έναρξης · D λήξης · E περιγραφή · F ΕΛΑΒΕ · G ΕΞΟΔΑ · I ΑΞΙΑ · K ΠΡΟΟΔΕΥΤΙΚΟ
(formula). Η γραμμή «ΣΥΝΟΛΟ» αγνοείται.

Εργαλείο: `tools/import-driver-ledger.mjs` (Node), **dry run προεπιλογή**,
`--commit` για εγγραφή. Ταξινόμηση γραμμής:
- `I > 0` ή `B` παρόν ⇒ `trip` (`trip_value=I`, `advance=F`, `expenses=G`,
  `route=E`, `entry_date=C||D`, `date_end=D`).
- `E ~* 'ΜΕΤΡΗΤ'` ⇒ `payment_cash` (`amount=F`).
- `E ~* 'ΚΑΤΑΘΕΣ'` ⇒ `payment_bank` (`amount=F`).
- Οτιδήποτε άλλο ⇒ **σταματά** και ζητά απόφαση (δεν μαντεύει).
Ανωμαλίες που σημαδεύονται και **δεν** διορθώνονται σιωπηλά: `C > D` (λάθος
χρονιά — στο πρότυπο 2 περιπτώσεις), ημερομηνία εκτός σειράς κατά > 1 έτος,
`F=0` σε δρομολόγιο (επιτρέπεται, απλώς αναφέρεται).

Το dry run τυπώνει ανά αρχείο: οδηγός (επιλέγεται με το χέρι — τα ονόματα των
αρχείων είναι ελληνικά, της βάσης λατινικά· η αντιστοίχιση δίνεται σε JSON
`tools/driver-ledger-map.json`), πλήθος ανά είδος, ανωμαλίες, **υπολογισμένο
τελικό υπόλοιπο vs τελευταίο ΠΡΟΟΔΕΥΤΙΚΟ του Excel**. Διαφορά ⇒ άρνηση.
Commit ⇒ `POST /costs/ledger/import` ⇒ RPC ατομική ανά οδηγό, `source=
'excel_import'`, κοινό `import_batch`, `file_hash` μοναδικό (ίδιο αρχείο δεύτερη
φορά ⇒ 409). Λάθος παρτίδα ακυρώνεται ολόκληρη: PATCH με `cancel_batch`.

Μετά την εισαγωγή, SQL απόδειξης (CLAUDE.md «επαναλαμβανόμενος έλεγχος»):
```sql
select d.full_name, count(*) rows, sum(e.balance_delta) balance
from dl_entries e join drivers d on d.id=e.driver_id
where e.deleted_at is null group by 1 order by 1;
```
Για τον οδηγό-Α: 168 γραμμές, 123,45.

---

## 7. «Αν σπάσει, πώς το μαθαίνω»
| Κίνδυνος | Πώς ακούγεται |
|---|---|
| Trigger δεν έγραψε γραμμή | `dl_v_rt_gap` > 0 ⇒ μετρητής στη λίστα οδηγών, amber |
| Λάθος τύπος/ποσό | CHECK στη βάση ⇒ 400 από Worker με το όνομα του πεδίου |
| Πεδίο εκτός χάρτη | Worker απορρίπτει με 400 (δεν χρησιμοποιείται ο facade) |
| Αλλαγή οδηγού μετά τα ποσά | `needs_review` ⇒ chip «Θέλουν έλεγχο» + amber σειρά |
| Διαγραφή | αδύνατη (κανένα grant)· ακύρωση μόνο με reason, ορατή |
| Εισαγωγή με λάθος άθροισμα | dry run αρνείται· `file_hash` κόβει διπλή |
| PnL χωρίς αμοιβή | `driver_pay_pending/missing` ⇒ «εκκρεμεί», όχι 0 |

Έλεγχοι στο repo: `tests/critics` — (α) SQL: υπόλοιπο οδηγού-Α = 123,45 και
`dl_v_rt_gap = 0`· (β) Playwright: η λίστα δεν δείχνει «0,00» για οδηγό με
γραμμές· (γ) `figma-map.js`: `LedgerRow`/`BalanceRow` ↔ `modules/payroll.js`.

---

## 8. Εκτός εμβέλειας (ρητά)
- Αυτόματος υπολογισμός αξίας δρομολογίου (owner: «όχι τώρα»).
- Feeder εθνικών RT (τα εθνικά καταχωρούνται χειροκίνητα μέχρι τότε).
- Κουμπί upload xlsx στην οθόνη (η εισαγωγή είναι μίας φοράς, με script).
- Εισφορές, υπερωρίες, εκτυπώσεις μισθοδοσίας.
- Πρόσβαση οδηγών στη δική τους καρτέλα.

## 9. Σειρά υλοποίησης
1. Migration 011 (πίνακας, views, trigger, grants, CHECK `ct_cost_lines`,
   μεταφορά γραμμής 50 €) — τρέχει ο owner· επαλήθευση με count.
2. Worker: `ledger` + RPC import + αφαίρεση κατηγοριών· deploy > 15:00, φρουρός.
3. Front end: `modules/payroll.js` (3 οθόνες), router, NAV χωρίς `soon`,
   costs.js (PnL διαβάζει από καρτέλα)· bump `?v=`.
4. Εισαγωγή: dry run ΟΔΗΓΟΣ-Α → 123,45 → commit → υπόλοιπα αρχεία Drive.
5. Ελεγκτής μέχρι τον πίνακα · DECISION_LOG · figma-map · μνήμη.
