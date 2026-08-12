# ΠΑΛΕΤΕΣ Φ2 — Τροφοδότες (Feeders) — Spec

**Ημερομηνία:** 2026-08-12 · **Κατάσταση:** Σχεδιασμός εγκεκριμένος από owner (session 12/8)
**Προϋπόθεση:** Φ1 LIVE (pl_movements + /pallets/* — docs/PALLETS_SCHEMA_APPLIED_2026-08-10.md)
**Γονικό spec:** docs/PALLETS_ARCHITECTURE.md

---

## §1. Σκοπός

Το ημερολόγιο παλετών να γεμίζει ΑΥΤΟΜΑΤΑ από τις ροές που ήδη τρέχουν
(orders, status, αναθέσεις), ώστε η καταγραφή να μη στηρίζεται στη μνήμη
κανενός. Ό,τι δεν καλύπτεται αυτόματα, καλύπτεται από χειροκίνητη φόρμα.

---

## §2. Ο κανόνας του partner — ΚΛΕΙΔΩΜΕΝΟΣ (owner 12/8)

**Εθνικό leg με partner = διαφανής αγωγός. ΚΑΜΙΑ εγγραφή partner, ΚΑΝΕΝΑ
δελτίο.** Η ισοφάριση γίνεται επί τόπου στη ράμπα με δική μας απόφαση: αν
έδωσε παλέτες κάτω (στον προμηθευτή), του τις επιστρέφουμε· αν όχι, δεν
του δίνουμε. Net 0 πάντα — δεν μένει οφειλή. Ό,τι έδωσε κάτω περνάει στο
`given` της LOADING εγγραφής του ΠΕΛΑΤΗ (feeder §3.1).

**Διεθνές leg που αγγίζει τη Βέροια (VS) = ΠΑΝΤΑ pallet sheet** — είτε
έγινε ανταλλαγή είτε όχι, το έγγραφο αποδεικνύει τι έγινε:
- Διεθνής partner ΦΟΡΤΩΝΕΙ από εμάς (export leg) → εκκρεμής
  **PARTNER_PICKUP** (`given` = παλέτες φορτίου, `taken` = 0)· κλείνει με
  το δελτίο (`taken` = ό,τι άφησε — συχνά 0 → μας χρωστάει, και φαίνεται).
- Διεθνής partner ΜΑΣ ΦΕΡΝΕΙ φορτίο (import leg) → εκκρεμής
  **PARTNER_DROPOFF** (`taken` = παλέτες, `given` = 0)· το δελτίο
  αποδεικνύει αν του δώσαμε άδειες.
- Διεθνές leg με ΔΙΚΟ ΜΑΣ όχημα → καμία εγγραφή (εσωτερική μετακίνηση,
  case #6 του γονικού spec).

Direct διεθνές με partner (χωρίς VS): η οφειλή πελάτη καλύπτεται από τη
LOADING του order· ο partner δεν αγγίζει δικές μας παλέτες στη Βέροια.

---

## §3. Οι τροφοδότες

### 3.1 Φόρτωση — trigger: αποθήκευση order (ΚΛΕΙΔΩΜΕΝΟ)

Order (διεθνές ή εθνικό) με **Pallet Exchange ON** αποθηκεύεται →
μία εκκρεμής **LOADING** ανά στάση φόρτωσης:
`counterparty_type=CLIENT, client_id = πελάτης order, location_id = σημείο
στάσης, taken = pallets στάσης (προσυμπλήρωση), given = 0, order_stop_id,
status = pending`.

- Sync σε επεξεργασία: νέα στάση → νέα pending· διαγραμμένη στάση → η
  pending της σβήνεται· αλλαγή pallets → ενημερώνεται το `taken` της
  pending (μόνο pending — confirmed δεν αγγίζεται ποτέ).
- Pallet Exchange → OFF: σβήνονται ΜΟΝΟ οι pending του order.
- Cascade delete order: σβήνονται ΜΟΝΟ οι pending· confirmed μένουν
  (ιστορικό — αναλογία με τον κανόνα GL never-delete).

### 3.2 Παράδοση — trigger: Status → Delivered (ΚΛΕΙΔΩΜΕΝΟ)

Order με Pallet Exchange περνάει σε **Delivered** (stepper orders_intl /
αντίστοιχο εθνικών) → μία **confirmed** DELIVERY ανά στάση παράδοσης:
`given = taken = pallets στάσης (net 0), sheet_source = κενό (δεν
απαιτείται δελτίο), POST με confirm:true`. Αν το status γυρίσει πίσω, οι
εγγραφές ΔΕΝ σβήνονται — διόρθωση μόνο με αντιλογισμό.

**«Διόρθωση ανταλλαγής» — το σενάριο Lidl (owner 12/8):** 1-2 στις 100
παραδόσεις ο παραλήπτης δεν έχει άδειες και δεν παίρνουμε πίσω (καθόλου ή
μερικώς). Πάνω στην confirmed DELIVERY, κουμπί **«Διόρθωση ανταλλαγής»**:
ο χρήστης γράφει το πραγματικό `taken` (π.χ. 0) + σημείωση → το UI καλεί
`POST /reverse` με `reason` («δεν δόθηκαν άδειες — <σημείωση>») και
`replacement` = DELIVERY με `given=Ν, taken=πραγματικό`, status pending →
confirm. Αποτέλεσμα: ο πελάτης εμφανίζεται να **μας χρωστάει** τη διαφορά
(given−taken > 0), με πλήρες ιστορικό. Κανένας νέος μηχανισμός — ο
αντιλογισμός της Φ1 με UI ενός κλικ.

### 3.3 Partner (διεθνές VS) — trigger: ανάθεση σε partner στο weekly_intl

Διεθνές order με Pallet Exchange + VS ανατίθεται σε partner →
εκκρεμής PARTNER_PICKUP (export) ή PARTNER_DROPOFF (import) κατά §2, με
`partner_id`, `location_id = Βέροια (recJucKOhC1zh4IP3 → pg id)`,
`order_stop_id` του VS σκέλους αν υπάρχει, αλλιώς μόνο σύνδεση order.
Αλλαγή partner σε pending → ενημερώνεται· αφαίρεση ανάθεσης → σβήνεται η
pending.

### 3.4 Χειροκίνητη φόρμα — «Νέα κίνηση»

RETURN_OUT / RETURN_IN / PARTNER_PICKUP / PARTNER_DROPOFF / ADJUSTMENT
(ADJUSTMENT: μόνο owner — API το επιβάλλει ήδη). Πεδία: ημερομηνία,
αντισυμβαλλόμενος (πελάτης Ή partner), σημείο, ποσότητες, δελτίο, σημείωση.
Καλύπτει και την ετεροχρονισμένη τακτοποίηση εξωτερικού (partner παίρνει
άδειες από ξένη αποθήκη → RETURN_IN στον partner, σημείο = ξένη αποθήκη).

### Κοινοί κανόνες feeders

- **Idempotency**: πριν από κάθε δημιουργία, έλεγχος
  `GET /pallets/movements?order_stop_id=` (ή cons/order σύνδεση) — ξανά-
  αποθήκευση ΔΕΝ δημιουργεί διπλά.
- **Μη-μπλοκάρον**: αποτυχία feeder ΔΕΝ μπλοκάρει το order (toast
  προειδοποίηση + δυνατότητα χειροκίνητης δημιουργίας). Ίδια φιλοσοφία με
  τη sync chain.

---

## §4. Ποιος καταχωρεί — ΚΛΕΙΔΩΜΕΝΟ (owner 12/8)

**Η Αλεξία (λογιστήριο) έχει αναλάβει πλήρως την ανταλλαγή παλετών.**
Ταιριάζει με το οργανόγραμμα: η «Παρακολούθηση ΕΥΡΩΠΑΛΕΤΩΝ» ανήκει στο
Τμήμα Τιμολόγησης. **Backup: οι dispatchers** (όταν λείπει).

Ρόλος Αλεξίας στο TMS: **accountant** → απαιτεί επέκταση `PL_PERMS`
(Worker): `accountant: movements GET/POST/PATCH + confirm + reverse +
sheets + balances + lookups`. Το reverse χρειάζεται για τη «Διόρθωση
ανταλλαγής» (§3.2) — καθημερινό operational, όχι σπάνια διόρθωση. ΟΧΙ
delete, ΟΧΙ ADJUSTMENT (owner). Αν δεν υπάρχει user για την Αλεξία στον
πίνακα users, τον δημιουργεί ο owner (κωδικοί).

| Σενάριο | Ποιος |
|---|---|
| Δελτία φορτώσεων (γυρνάνε με τα χαρτιά) | Αλεξία (accountant) |
| Δελτία διεθνούς leg στη ράμπα (VS) | Αλεξία ή warehouse (tablet) |
| Δελτία από partners (direct) | Αλεξία |
| Διόρθωση ανταλλαγής παράδοσης (Lidl) | Αλεξία |
| Επιστροφές/τακτοποιήσεις | Αλεξία· ADJUSTMENT μόνο owner |
| Backup σε όλα | dispatchers |

---

## §5. Pallet sheets — αποθήκευση αρχείων

- **Νούμερα**: πάνω στην κίνηση (`taken/given/sheet_source`) — υπάρχουν.
- **Αρχείο**: private bucket **`pallet-sheets`** στο Supabase Storage.
  Upload ΜΟΝΟ μέσω Worker: νέο `POST /pallets/sheets` (αρχείο →
  Storage path, γράφεται στο `sheet_url`), `GET /pallets/sheets?path=`
  (signed URL για προβολή). Ρόλοι: owner/dispatcher/warehouse/accountant.
- Φ2: `sheet_source = MANUAL` (νούμερα από το χαρτί, χωρίς upload) ή
  `UPLOAD` (και το αρχείο). `UPLOAD_AI` = Φ5.
- Bucket: migration 004 (insert στο storage.buckets) — εκτέλεση όπως το 003.

---

## §6. Παλιοί πίνακες & κώδικας

- PALLET_LEDGER_SUPPLIERS / PARTNERS: **άδεια, κανείς δεν γράφει**. Στη
  βάση μένουν άθικτα.
- Αφαιρούνται τα 4 νεκρά cleanup μπλοκ: `orders_intl.js:919, :2584`,
  `orders_natl.js:1444`, `core/order-sync.js:205` (+ ο κλάδος PE-toggle
  του order-sync αντικαθίσταται από το plOnExchangeOff).
- Το read του `invoicing.js` (_invFetchPalletBalance) ΜΕΝΕΙ ως έχει —
  αλλάζει στη Φ4 (θα δείξει στο /pallets/balances).

---

## §7. Αρχιτεκτονική αλλαγών

**Backend (Worker 2):**
1. `PL_PERMS.accountant` επέκταση (§4) + νέο resource `sheets`.
2. `POST /pallets/sheets` + `GET /pallets/sheets?path=` (Storage).
3. Deploy με `wrangler deploy`.

**Frontend:**
1. **Νέο `core/pallet-feed.js`** — ΟΛΗ η λογική feeder σε ένα αρχείο:
   `plOnOrderSaved(orderId, fields, stops)`, `plOnDelivered(orderId)`,
   `plOnIntlPartnerAssigned(orderId, partnerId)`, `plOnOrderDeleted(orderId)`,
   `plOnExchangeOff(orderId)`. Idempotent, μη-μπλοκάρον.
2. **Κουμπώματα** (1-2 γραμμές το καθένα): `orders_intl.js` (save, stepper
   Delivered, cascade delete), `orders_natl.js` (save), `weekly_intl.js`
   (ανάθεση partner), `core/order-sync.js` (PE OFF).
3. **`pallet_ledger.js`**: νέο minimal UI Φ2 — τρεις προβολές:
   - **«Εκκρεμείς (Ν)»**: λίστα pending + modal επιβεβαίωσης
     (taken/given/δελτίο/upload). Λειτουργικό σε tablet.
   - **«Χωρίς πλήρη επιστροφή»**: όλες οι confirmed DELIVERY με
     `given > taken` (σενάριο Lidl) — πελάτης, σημείο, ημερομηνία,
     διαφορά. Φίλτρο client-side στη Φ2· view στη Φ3 αν χρειαστεί.
   - Κουμπί **«Νέα κίνηση»** (φόρμα §3.4) + κουμπί «Διόρθωση
     ανταλλαγής» στις DELIVERY (§3.2).
   Ελληνικά labels. (Πλήρες Ισοζύγιο με υπόλοιπα/drill-down = Φ3.)
4. `?v=` bump στο app.html για κάθε αλλαγμένο αρχείο.

**Κανόνας δοκιμής (CLAUDE.md):** ό,τι αγγίζει φόρμες παραγγελιών ανοίγει
και δοκιμάζεται στον browser ΠΡΙΝ το push — ρητό βήμα σε κάθε task του
πλάνου που αγγίζει orders_intl/orders_natl.

---

## §8. Όρια Φ2 (τι ΔΕΝ κάνει)

1. Όχι πλήρες UI Ισοζυγίου (υπόλοιπα/drill-down/ιστορικό) — Φ3.
2. Όχι gates Invoiced/PnL — Φ4.
3. Όχι AI εξαγωγή δελτίων — Φ5.
4. Όχι αναδρομική τροφοδότηση από υπάρχοντα orders — μόνο ό,τι
   αποθηκεύεται/αλλάζει μετά το go-live (κλειδωμένο από Φ1).
5. Όχι εγγραφές εθνικών partner legs (§2 — συνειδητά).
