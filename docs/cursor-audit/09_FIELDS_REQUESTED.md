# ΕΡΓΑΣΙΑ 9 — ΖΗΤΑΕΙ ΑΥΤΟ ΠΟΥ ΔΙΑΒΑΖΕΙ;

Ημερομηνία: 2026-08-23 · Εύρος: κάθε `atGet`/`atGetAll` με `fields[]`, συν τις σταθερές λίστες (`OPS_FIELDS`, `RAMP_FIELDS`, `_REF_FIELDS`, `MAINT_HISTORY_FIELDS`, και τα inline arrays σε weekly/performance/metrics_audit/maintenance/entity/ai-chat/order-sync).

**Τι ΔΕΝ λέει αυτή η αναφορά:** τίποτα για περιεχόμενο βάσης. Κάθε ισχυρισμός είναι «ο κώδικας θα κάνει Χ». Τα ήδη επιβεβαιωμένα (R7-1 FRC στο preload, R7-3 Net Price) σημειώνονται ως τέτοια.

Όταν το `fields[]` παραλείπει ένα label, ο Worker το αφήνει έξω από το `select` χωρίς προειδοποίηση (`worker/src/index.js:1933-1945`). Το front end παίρνει `undefined` — το ίδιο σχήμα με την Εργασία 7, αλλά εδώ το πεδίο **υπάρχει** στον χάρτη. Η προφανής διόρθωση ονόματος χωρίς προσθήκη στη λίστα αφήνει το κενό.

---

## 0. Διόρθωση στον χάρτη — τα unquoted κλειδιά

Το `Price` **υπάρχει** στον χάρτη ORDERS (`worker/src/index.js:990`, `Price: "price"` χωρίς εισαγωγικά στο κλειδί). Ίδιο σχήμα: `Status`, `Invoiced`, `Brand`, `Goods`, `DONE`.

Οι Εργασίες 1 και 7 **δεν** έχασαν αυτά τα κλειδιά. Ο χάρτης βγήκε με AST + `new Function('return ' + slice)` (`docs/cursor-audit/06_METHOD.md` §1), όχι με regex `"Price"`. Επανέλεγχος τώρα:

- `readable.has('Price')` = true για ORDERS και NAT_ORDERS
- `readable.has('Net Price')` = false
- `computed` = μόνο `Week Number`, `Total Pallets` (όπως επιβεβαιώθηκε)

**Κανένα εύρημα των Εργασιών 1/7 δεν αλλάζει.** Το R7-3 στέκει γιατί διαβάζει `Net Price`, όχι γιατί έλειπε το `Price` από τον χάρτη. Το `modules/invoicing.js:58-72` πέφτει σωστά στο `Price`.

---

## 1. `_REF_FIELDS` — ένα preload, όλα τα modules

```729:736:core/api.js
const _REF_FIELDS = {
  trucks:    ['License Plate', 'Active', 'KTEO Expiry', 'KEK Expiry', 'Insurance Expiry'],
  drivers:   ['Full Name', 'Active'],
  trailers:  ['License Plate', 'Active', 'KTEO Expiry', 'Insurance Expiry'],
  locations: ['Name', 'City', 'Country', 'Latitude', 'Longitude'],
  clients:   ['Company Name'],
  partners:  ['Company Name', 'Adress', 'Country'],
};
```

Καταναλωτές: `getRefTrucks/Trailers/Drivers/Locations/Clients/Partners` σε dashboard, daily_ops, daily_ramp, weekly_intl, weekly_natl, performance, invoicing, orders_intl/natl, pallet_upload, scan-helpers, data-helpers. Ό,τι λείπει εδώ λείπει **παντού ταυτόχρονα**.

Οι σελίδες entity (`core/entity.js:327` `atGet(cfg.tableId)` χωρίς `fields[]`) και η Συντήρηση (δικό της `atGetAll`) **δεν** τρέφονται από εδώ — γι' αυτό η σελίδα Λήξεων βλέπει FRC και το Dashboard όχι.

---

## Α. ΣΙΩΠΗΛΗ ΚΑΤΑΠΙΩΣΗ — υπάρχει στον χάρτη, δεν ζητήθηκε, το undefined βγαίνει false/0

### [R9-1] `FRC Expiry` λείπει από το preload και από τις ειδοποιήσεις

*(Επιβεβαιώθηκε: η καλύτερη παρατήρηση της Εργασίας 7. Εδώ η πλευρά `fields[]`.)*

Τι: το πεδίο υπάρχει στις TRAILERS (`worker/src/index.js:743`). Τρία αιτήματα που τροφοδοτούν ελέγχους λήξης **δεν το ζητούν**.

| # | αίτημα | τι ζητά | τι διαβάζει μετά |
|---|---|---|---|
| 1 | `core/api.js:732` `_REF_FIELDS.trailers` → Dashboard `:327` | Plate, Active, KTEO, Insurance | `'ATP Expiry'` (φάντασμα) και `'Insurance Expiry'` |
| 2 | `core/utils.js:1109` ειδοποιήσεις | Plate, **ATP Expiry**, Insurance | `checkDocs(…, ['ATP Expiry','Insurance Expiry'])` `:1240` |
| 3 | `modules/metrics_audit.js:311` | Plate, **ATP Expiry**, Insurance | `expiryAlertsTrailers` διαβάζει ATP `:363` |

Απόδειξη ότι η διόρθωση ονόματος μόνη της δεν φτάνει: ακόμα και αν το `:327` άλλαζε σε `'FRC Expiry'`, το preload δεν το φέρνει. Αντίθεση: `modules/maintenance.js:149` ζητά και τα δύο και διαβάζει FRC (`:19-21`) — γι' αυτό η σελίδα Λήξεων δούλεψε. `core/ai-chat.js:1259` ζητά σωστά FRC.

Πόσα σημεία: **3 αιτήματα** που τροφοδοτούν ελέγχους.

Τι χαλάει: Thodoris / owner — καμπανάκι, κάρτα στόλου, audit trailers. Βλέπουν ασφάλειες (ζητείται και υπάρχει) και νομίζουν ότι ο έλεγχος τρέχει.

Σοβαρότητα: **P0** (επιβεβαιωμένο).

Επιβεβαιώθηκε πώς: διάβασα `core/api.js:729-752`, `core/utils.js:1108-1240`, `modules/dashboard.js:19-22` και `:324-335`, `modules/maintenance.js:145-150`.

---

### [R9-2] `Price` λείπει από το `fields[]` του Performance — η προφανής διόρθωση του R7-3 πιάνει μόνο τη μία οθόνη

Τι: το `modules/performance.js:110-114` ζητά 16 labels ORDERS. Δεν ζητά `Price` ούτε `Net Price`. Το `:379` αθροίζει `Net Price`.

Απόδειξη:

```110:114:modules/performance.js
      fields: ['Direction','Delivery Performance','Status','Truck','Driver','Partner',
               'Is Partner Trip','Loading DateTime','Delivery DateTime','Matched Import ID',
               'Total Pallets','Client','Week Number','Client Notified','ORDER STOPS',
               'Assigned At','Actual Delivery Date',
               'Loading Summary','Delivery Summary']
```

```376:379:modules/performance.js
  const outstandingOrders = orders.filter(r => r.fields['Status'] === 'Delivered');
  const outstanding = Math.round(outstandingOrders.reduce((s, r) => s + (parseFloat(r.fields['Net Price']) || 0), 0));
```

Αν το `:379` άλλαζε σε `'Price'` (όπως το `_invPrice`), το `Price` **δεν είναι στη λίστα** → πάλι 0. Το KPI «ΑΝΕΞΟΦΛΗΤΑ» έχει `target: 0`, `invert: true` (`:56`) → πράσινο.

Αντίθεση που αποδεικνύει τα δύο σφάλματα στη σειρά:

| Οθόνη | fetch | τι διαβάζει | αποτέλεσμα |
|---|---|---|---|
| Invoicing | `atGet` χωρίς `fields[]` (`invoicing.js:259`) | `Price` με fallback | αριθμοί |
| CEO | `atGet` χωρίς `fields[]` (`ceo_dashboard.js:126`) | μόνο `Net Price` | €0 (R7-3, ένα σφάλμα) |
| Performance | `fields[]` χωρίς Price | μόνο `Net Price` | €0 **και** η διόρθωση ονόματος μένει 0 |
| Metrics audit | `fields[]` **με** Price (`metrics_audit.js:303`) | `metrics.outstandingBalance` → `Price` (`metrics.js:258`) | ο σωστός αριθμός |

Πόσα σημεία: **1 λίστα + 1 ανάγνωση**.

Τι χαλάει: Ειρήνη, KPI ΑΝΕΞΟΦΛΗΤΑ. (Το ποσό στη βάση επιβεβαιώθηκε ήδη στο R7-3 — δεν το ξαναγράφω.)

Σοβαρότητα: **P0**.

Επιβεβαιώθηκε πώς: διάβασα `modules/performance.js:104-114`, `:52-57`, `:376-379` και `core/metrics.js:254-258`.

---

### [R9-3] `CMR Photo Received` υπάρχει, δεν ζητείται στο Performance — ο KPI πέφτει μόνιμα σε proxy

Τι: το πεδίο υπάρχει στα ORDERS. Το `performance.js:285-292` το διαβάζει. Η λίστα `:110-114` **δεν το ζητά**.

```282:292:modules/performance.js
  const cmrFieldPresent = deliveredForCmr.some(r => 'CMR Photo Received' in r.fields || 'CMR Received' in r.fields);
  …
  } else {
    // Proxy: Delivery Performance set implies order was closed with docs
    cmr_collected = withPerf.length && deliveredForCmr.length ? Math.round(withPerf.length / deliveredForCmr.length * 100) : 0;
  }
```

`'X' in r.fields` είναι πάντα false όταν το X δεν ζητήθηκε → **πάντα** ο proxy. Ο proxy μετρά «έχει Delivery Performance», όχι «ήρθε φωτογραφία CMR». Το σχόλιο λέει ότι ο proxy είναι για όταν το πεδίο λείπει εντελώς από τον πίνακα — εδώ λείπει από το αίτημα.

Αντίθεση: το `metrics_audit.js:306` ζητά `CMR Photo Received` και το `metrics.cmrSameDayPct` (`metrics.js:192`) το διαβάζει σωστά. Δύο οθόνες, δύο CMR %.

Πόσα σημεία: **1**.

Τι χαλάει: όποιος κοιτάει Performance → CMR collected. Βλέπει ποσοστό που μοιάζει με μέτρηση εγγράφων.

Σοβαρότητα: **P0** (λάθος KPI που δεν μοιάζει άδειο).

Επιβεβαιώθηκε πώς: διάβασα `modules/performance.js:110-114` και `:282-292`, `core/metrics.js:185-193`, `modules/metrics_audit.js:302-306`.

---

### [R9-4] `Notes` στις ρυμούλκες της Συντήρησης — το `NO-FRC` δεν μπορεί να διαβαστεί

Τι: το `_expiryFieldsFor` (`maintenance.js:45-51`) εξαιρεί ρυμούλκα αν τα Notes περιέχουν `NO-FRC` (απόφαση owner 6-8, σχόλιο `:27-36`). Το fetch `:148-150` **δεν ζητά `Notes`**. Το `Notes` υπάρχει στις TRAILERS.

```45:51:modules/maintenance.js
function _expiryFieldsFor(f, fields) {
  return fields.filter(ef => {
    if (ef.field !== 'FRC Expiry') return true;
    if (/\bNO-FRC\b/i.test(String(f['Notes'] || ''))) return false;
    if (f[ef.field]) return true;
    return String(f['Trailer Type'] || '').trim().toLowerCase() === 'reefer';
  });
}
```

`f['Notes']` είναι πάντα `undefined` → το `NO-FRC` δεν ταιριάζει ποτέ. Η εξαίρεση είναι νεκρή. Ρυμούλκα με `NO-FRC` στα notes και ημερομηνία FRC **μένει** στη λίστα λήξεων (`if (f[ef.field]) return true` τρέχει επειδή το Notes-check απέτυχε).

Πόσα σημεία: **1 fetch, 1 ανάγνωση** (η συνάρτηση καλείται από `:219`, `:256`).

Τι χαλάει: Thodoris στη σελίδα Λήξεων — βλέπει FRC alert σε όχημα που ο owner σήμανε να μην παρακολουθείται. Αντίστροφο του R7-1: εκεί χάθηκε αληθινός συναγερμός· εδώ εμφανίζεται ψεύτικος.

Σοβαρότητα: **P1** (λάθος στη λίστα, φαίνεται) — όχι P0, γιατί δεν κρύβει λήξη.

Επιβεβαιώθηκε πώς: διάβασα `modules/maintenance.js:24-51`, `:148-150`, `:213-226`.

---

## Β. ΚΕΝΟ / ΛΑΘΟΣ ΑΡΙΘΜΟΣ ΠΟΥ ΔΕΝ ΚΡΥΒΕΤΑΙ ΩΣ «ΟΛΑ ΚΑΛΑ»

### [R9-5] `Opening Hours`, `Delivery Days` στη φόρμα τοποθεσιών

Τι: υπάρχουν στις LOCATIONS. Το `_locFetchAll` (`locations.js:535-537`) ζητά Name/Country/City/Address/Type/Lat/Lng. Η φόρμα `:412` / `:416` διαβάζει Hours και Days → πάντα κενό input.

Το save (`:450-451`) γράφει μόνο `if (hours)` / `if (days)` — άρα **δεν σβήνει** υπάρχουσες τιμές. Ο χρήστης βλέπει κενό, νομίζει ότι δεν έχουν συμπληρωθεί, και δεν μπορεί να τα καθαρίσει από τη φόρμα.

Πόσα σημεία: **2 πεδία, 1 fetch**.

Σοβαρότητα: **P2**.

Επιβεβαιώθηκε πώς: διάβασα `modules/locations.js:410-451` και `:534-537`.

---

### [R9-6] `Active` στους πελάτες του preload — οι ανενεργοί μπαίνουν στο scan

Τι: το `Active` υπάρχει στους CLIENTS. Το `_REF_FIELDS.clients` ζητά μόνο `Company Name`.

```644:646:core/scan-helpers.js
  const activeClients = allClients.filter(c => c.fields?.['Active'] !== false);
```

`undefined !== false` → **όλοι** περνούν, και οι απενεργοποιημένοι. Ίδιο στο `:701`. Δεν κρύβει πρόβλημα· προσθέτει λάθος υποψηφίους στο OCR match.

Οι σελίδες entity φέρνουν πλήρη εγγραφή (`entity.js:327`) — εκεί το Active δουλεύει.

Πόσα σημεία: **2 αναγνώσεις** πάνω στο ίδιο preload.

Σοβαρότητα: **P2**.

Επιβεβαιώθηκε πώς: διάβασα `core/api.js:734`, `core/scan-helpers.js:640-705`.

---

### [R9-7] `Invoice Date` / `Delivery DateTime` λείπουν από NAT_ORDERS στο metrics audit

Τι: το `metrics.revenueInvoiced(…, {period})` (`metrics.js:266`) κάνει `_inPeriod(f['Invoice Date']||f['Delivery DateTime'], period)`. Το `_inPeriod` (`:13-14`) αν δεν έχει ημερομηνία γυρίζει **true** (συμπεριλαμβάνει τη γραμμή).

Το `metrics_audit.js:308` για NAT_ORDERS ζητά `Status, Invoiced, Price, Truck, Partner, Loading DateTime` — ούτε Invoice Date ούτε Delivery DateTime (και τα δύο υπάρχουν στον χάρτη). Άρα το «Revenue Invoiced (30d)» μετρά **όλα** τα τιμολογημένα εθνικά, όχι 30 ημερών.

Για ORDERS το Delivery DateTime ζητείται (`:303`) — το fallback σώζει τα διεθνή. Τα εθνικά είναι ΣΩΣΤΑ άδεια στην παραγωγή (VS → NAT_LOADS)· το εύρημα είναι μηχανισμός, λανθάνον.

Πόσα σημεία: **1 λίστα**.

Σοβαρότητα: **P2** (λανθάνον, πίνακας κενός).

Επιβεβαιώθηκε πώς: διάβασα `core/metrics.js:13-19`, `:261-267`, `modules/metrics_audit.js:308`, `:422`.

---

### [R9-8] Ιστορικό πελάτη — διαδρομή «— → —»

`core/entity.js:1126` ζητά `Loading Summary`/`Delivery Summary` (φαντάσματα, Εργασία 7) και **όχι** `ORDER STOPS` / `Loading Location 1`. Το `:1130` χτίζει `route` από τα Summary → πάντα ` — → — `. Τα NAT_ORDERS στο `:1127` ζητούν Pickup/Delivery Location 1 — αυτά υπάρχουν και δουλεύουν.

Σοβαρότητα: **P2**.

---

## Γ. ΚΑΤΑΡΡΕΥΣΗ

**0** αποδεδειγμένα. Τα κενά από `fields[]` περνούν από `|| ''` / `in r.fields` / `!== false`.

---

## Δ. Πλήρης απογραφή αιτημάτων — τι ελέγχθηκε και ήταν ευθυγραμμισμένο

Κλήσεις με `fields[]` που η ροή διαβάζει **μόνο** ό,τι ζήτησε (ή διαβάζει φάντασμα ήδη στην Εργασία 7, χωρίς επιπλέον υπαρκτό που να λείπει):

| Σταθερά / σημείο | Πίνακας | Σχόλιο |
|---|---|---|
| `OPS_FIELDS` `daily_ops.js:15-24` | ORDERS | Ό,τι ζωγραφίζει η γραμμή είναι στη λίστα. `Loading Points`/`Delivery Points` (`:154-155`) είναι φαντάσματα + fallback αναζήτησης. `VS CD Date` ζητείται αλλά δεν επιστρέφεται (Εργ. 7). Το inherit ζεύγους (`:81`) ζητά ό,τι αντιγράφει |
| `RAMP_FIELDS` `daily_ramp.js:15-26` | RAMP | Temperature ζητείται και διαβάζεται. Order/Truck/Driver ζητούνται αλλά δεν υπάρχουν (Εργ. 7). `Temp Checked`/`Pallets Counted`/`Goods Staged`/`Temp Set` υπάρχουν στον χάρτη και **δεν διαβάζονται** πουθενά στο module — όχι εύρημα 9 |
| `weekly_natl.js:106-121` | NAT_LOADS | 1–10 locations, appointments, Source Type. Διαβάζει `Source Record` (alias, δεν επιστρέφεται) αντί `Source Orders` (υπάρχει, δεν ζητείται) — διπλό, λανθάνον, Εργ. 7 |
| `weekly_intl.js:212-213` | ORDERS | **χωρίς** `fields[]` — πλήρης εγγραφή |
| `weekly_intl.js:2019-2022` | ORDERS | λίστα συγχρονισμού VS· ό,τι ζητά το διαβάζει το `_syncVeroiaSwitch` |
| `weekly_intl.js:584` | ORDERS | ζητά Loading Summary (φάντασμα) + Loading DateTime |
| `ceo_dashboard.js:126+` | ORDERS κ.ά. | **χωρίς** `fields[]` |
| `invoicing.js:259` | ORDERS/NAT | **χωρίς** `fields[]` |
| `dashboard.js:24-28` | ORDERS/NAT_LOADS | **χωρίς** `fields[]` για παραγγελίες· trailers από preload (R9-1) |
| `command-center.js:192` | ORDERS | Truck/Partner/Status — μόνο αυτά διαβάζει `:197` |
| `command-center.js:216` | ORDERS | Week Number + Delivery Performance — μόνο αυτά `:221-225` |
| `entity.js:327` | master data | χωρίς `fields[]` |
| `entity.js:467` | MAINT_HISTORY | Workshop/Cost/Date — αυτά αθροίζει |
| `entity.js:557-558` | PARTNER_ASSIGN | τα 4 F.PA_* που διαβάζει |
| `entity.js:623-624` | ORDERS/NAT | Client/Status/Price/Loading DateTime — αυτά αθροίζει (σωστό Price) |
| `maintenance.js` trucks `:145-147` | TRUCKS | η σελίδα Λήξεων διαβάζει τα expiry + Brand/Model/Insurance Partner που ζητά. Tachograph/ADR/Next Maintenance ζητούνται και δεν διαβάζονται (θόρυβος, Πίν. Β Εργ. 1) |
| `ai-chat.js:1258-1259` | TRUCKS/TRAILERS | FRC σωστά |
| `order-sync.js:115-144` | GL/CL | εκτός του `Groupage Lines` (φάντασμα) |
| `form-helpers.js:87` | CLIENTS | μόνο Company Name, μόνο αυτό δείχνει |
| `locations_map.js:181` | WORKSHOPS | Name/City/Specialty/Phone/Contact/Active — αυτά κάνει enrich. Lat/Lng τα παίρνει από LOC.records |

---

## Ε. Διπλό σφάλμα (όνομα λάθος **και** σωστό όνομα εκτός λίστας)

Το μοτίβο που έκανε πολύτιμη την Εργασία 9 χωρίς να έχει τρέξει:

| Σωστό label (υπάρχει) | Τι ζητά / διαβάζει | Πού | Αν διορθώσεις μόνο το όνομα |
|---|---|---|---|
| `FRC Expiry` | `ATP Expiry` | preload + ειδοποιήσεις + audit | μένει κενό (R9-1) |
| `Price` | `Net Price` | Performance `:379` | μένει 0 (R9-2) |
| `Source Orders` | `Source Record` | weekly_natl `:108` / `:1548` | μένει κενό (λανθάνον) |
| `CMR Photo Received` | δεν ζητείται· `'in fields'` πέφτει σε proxy | Performance `:285` | — (R9-3, ένα σφάλμα: η λίστα) |

---

## ΣΤ. Τι δεν είναι εύρημα αυτής της εργασίας

- Αναγνώσεις φαντασμάτων που **δεν υπάρχουν** στον χάρτη (Order Number, Loading Summary, Net Price στον CEO χωρίς `fields[]`, VS CD Date, ATP Expiry ως όνομα): Εργασία 7. Εδώ μπαίνουν μόνο όταν **και** λείπουν από τη λίστα **και** υπάρχει σωστό label που επίσης λείπει.
- `atGet` χωρίς `fields[]`: ο Worker γυρίζει όλο το readable σύνολο. Δεν κόβει υπαρκτά.
- `_inPeriod` χωρίς ημερομηνία σε ORDERS του audit: το Delivery DateTime ζητείται, το fallback σώζει.
- `Nat Load` διπλοεγγραφές: όχι ενεργό (0 διπλότυπα).

---

## Ζ. Σύνοψη

| ID | Πεδίο που λείπει από `fields[]` | Υπάρχει στον χάρτη; | Συνέπεια undefined | Σοβ. |
|---|---|---|---|---|
| R9-1 | `FRC Expiry` (3 αιτήματα) | ναι | καμία ειδοποίηση FRC | P0 επιβεβ. |
| R9-2 | `Price` στο Performance | ναι | ΑΝΕΞΟΦΛΗΤΑ = 0· η διόρθωση ονόματος δεν φτάνει | P0 |
| R9-3 | `CMR Photo Received` στο Performance | ναι | μόνιμος proxy από Delivery Performance | P0 |
| R9-4 | `Notes` στις ρυμούλκες Συντήρησης | ναι | `NO-FRC` νεκρό | P1 |
| R9-5 | `Opening Hours`, `Delivery Days` | ναι | κενή φόρμα | P2 |
| R9-6 | `Active` στους clients του preload | ναι | ανενεργοί στο scan | P2 |
| R9-7 | `Invoice Date`/`Delivery DateTime` NAT_ORDERS audit | ναι | 30d = all-time | P2 λανθάνον |
| R9-8 | σωστή διαδρομή στο ιστορικό πελάτη | Summary δεν υπάρχει· STOPS δεν ζητείται | `— → —` | P2 |

Εργασίες 8, 3–6: δεν ξεκίνησαν.
