# ΕΡΓΑΣΙΑ 1 — Ο ΠΛΗΡΗΣ ΧΑΡΤΗΣ ΠΕΔΙΩΝ

## 0. Γιατί ένα λάθος label είναι αόρατο

Ο Worker μεταφράζει label → στήλη σε τρία διαφορετικά σημεία, με **τρεις
διαφορετικές** ενώσεις συνόλων. Αυτή η ασυμμετρία είναι η αιτία σχεδόν κάθε
ευρήματος:

| Πράξη | Συνάρτηση | Δεκτά labels | Τι γίνεται στο άγνωστο |
|---|---|---|---|
| Εγγραφή (scalar) | `fieldsToColumns` — `worker/src/index.js:1589-1598` | `fields` ∪ `aliases` | **σιωπηλή απόρριψη** (δεν υπάρχει `else`) |
| Εγγραφή (link) | `resolveLinksOnWrite` — `:1836-1870` μέσω `buildWriteRow` `:2060-2086` | `links` (+ `linkAliases`) | άγνωστο recid → **400 «Unknown linked record in request»** (`:2078-2081`) |
| Εγγραφή, όλα άγνωστα | `handleFacadeCreate` `:2133-2135`, `handleFacadeUpdate` `:2292-2294` | — | **400 «No writable fields in request»** |
| Ανάγνωση `fields[]` | `handleFacadeGet` `:1933-1945` | `fields` ∪ `computed` ∪ `links` | **σιωπηλή παράλειψη** από το `select` (τα `aliases` **ΔΕΝ** αναγνωρίζονται) |
| Ανάγνωση, ονόματα εξόδου | `columnToLabel` `:1574-1583` | `fields` ∪ `computed` (+ `links`/`reverseLinks` χωριστά) | τα `aliases` **ΔΕΝ** εκπέμπονται ποτέ σε ανάγνωση |
| Φίλτρο | `filterFieldMap` `:1599-1602` + `translateTerm` `:1685-1691` | `fields` ∪ `computed` ∪ `aliases` (+ `links` μέσω `preResolveLinkTerms` `:2014-2047`) | **422 «Unsupported query for this table»** |
| Sort | `handleFacadeGet` `:1959-1966` | **μόνο** `fields` | σιωπηλή παράλειψη της ταξινόμησης |

Πρακτικά: ένα label μπορεί να είναι **εγγράψιμο αλλά μη αναγνώσιμο** (κάθε
alias — δες `Source Record`), ή **φιλτραρίσιμο αλλά μη εγγράψιμο** (κάθε
computed), ή **αναγνώσιμο αλλά μη ταξινομήσιμο** (κάθε computed/link).

---

## 1. Πλήρη σύνολα αποδεκτών labels ανά πίνακα

22 table configs βρέθηκαν στο `worker/src/index.js:656-1569` (`var TABLES`).
Εξήχθησαν προγραμματιστικά (δες `06_METHOD.md`), όχι με grep.

### LOCATIONS — `tblxu8DRfTQOFRCzS` → pg `locations`
- fields (10): `Name`, `Type`, `Address`, `State/province`, `City`, `Country`, `Latitude`, `Longitude`, `Opening Hours`, `Delivery Days`

### CLIENTS — `tblFWKAQVUzAM8mCE` → pg `clients`
- fields (8): `Company Name`, `Adress`, `City`, `Country`, `VAT Number`, `Email`, `Phone`, `Active`

### PARTNERS — `tblLHl5m8bqONfhWv` → pg `partners`
- fields (7): `Company Name`, `Adress`, `Country`, `VAT Number`, `Phone`, `Email`, `Active`

### DRIVERS — `tbl7UGmYhc2Y82pPs` → pg `drivers`
- fields (6): `Full Name`, `Phone`, `Type`, `License Number`, `License Expiry`, `Active`

### TRUCKS — `tblEAPExIAjiA3asD` → pg `trucks`
- fields (13): `License Plate`, `VIN`, `Brand`, `Model`, `Active`, `KTEO Expiry`, `KEK Expiry`, `Insurance Expiry`, `Insurance Partner`, `Euro Standard`, `Year`, `Tare Weight kg`, `Notes`

### TRAILERS — `tblDcrqRJXzPrtYLm` → pg `trailers`
- fields (12): `License Plate`, `VIN`, `Active`, `KTEO Expiry`, `Insurance Expiry`, `FRC Expiry`, `Brand`, `Model`, `Year`, `Trailer Type`, `Tare Weight kg`, `Notes`

### WORKSHOPS — `tblMiFxbm9ky8PCQi` → pg `workshops`
- fields (9): `Name`, `Phone`, `Address`, `City`, `Specialty`, `Contact Person`, `Email`, `Notes`, `Active`

### MAINT_HISTORY — `tbllPbPPd6N3zEZF1` → pg `maint_history`
- fields (15): `Vehicle Plate`, `Vehicle Type`, `Date`, `Type`, `Description`, `Cost`, `Odometer km`, `Parts`, `Invoice Number`, `Next Service Date`, `Next Service km`, `Status`, `Notes`, `Source Ref`, `Needs Review`
- aliases (1): `Odometer`
- links (3): `Workshop`, `Truck`, `Trailer`

### MAINT_REQ — `tbl3vhUmzKDWhJynR` → pg `maint_req`
- fields (7): `Vehicle Plate`, `Vehicle Type`, `Description`, `Priority`, `Status`, `Date Reported`, `Notes`
- **links: κανένα** (γι' αυτό πέφτει το `Workshop`, εύρημα A-4)

### RAMP — `tblT8W5WcuToBQNiY` → pg `ramp`
- fields (44): `Plan Date`, `Time`, `Type`, `Status`, `Pallets`, `Goods`, `Supplier/Client`, `Notes`, `Postponed To`, `Ramp Category`, `Stock Status`, `Temperature`, `Loading Points`, `Delivery Points`, `Is Veroia Switch`, `Temp Checked`, `Pallets Counted`, `Goods Staged`, `Temp Set`, `Stop Client 1-5`, `Stop Location 1-5`, `Stop Temp 1-5`, `Stop Ref 1-5`, `Stop Pallets 1-5`
- **links: κανένα** — ρητή απόφαση, `worker/src/index.js:873-878`. Εκεί καταλήγουν τα ευρήματα A-2, A-3 και τρία 422.

### PALLET_LEDGER_SUPPLIERS — `tblAAH3N1bIcBRPXi` → pg `pallet_ledger_suppliers`
- fields (9): `Date`, `Direction`, `Pallets`, `Pallet Type`, `Counterparty Type`, `Stop Type`, `AI Extracted`, `Verified`, `Notes`
- links (5): `Client Account`, `Partner Account`, `Loading Supplier`, `Order`, `Order Stop`

### PALLET_LEDGER_PARTNERS — `tblAUixdjwpgnJ1hK` → pg `pallet_ledger_partners`
- fields (7): `Date`, `Direction`, `Pallets`, `Pallet Type`, `AI Extracted`, `Verified`, `Notes`
- links (2): `Partner`, `Order Stop`

### ORDERS — `tblgHlNmLBH3JTdIM` → pg `orders`, readView `orders_with_derived`
- fields (94): `Brand`, `Type`, `Direction`, `Status`, `Ops Status`, `Invoice Status`, `Delivery Performance`, `Carrier Type`, `Refrigerator Mode`, `Pallet Type`, `Price`, `Partner Rate`, `Advance Paid`, `Goods`, `Gross Weight kg`, `Temperature °C`, `Reference`, `Groupage ID`, `Matched Import ID`, `Partner Truck Plates`, `ETA`, `Invoice Number`, `Notes`, `Ops Notes`, `High Risk Auto Flag`, `Loading DateTime`, `Delivery DateTime`, `Cross-dock Date`, `Postponed To`, `Actual Delivery Date`, `Invoice Date`, `Assigned At`, `Pallet Exchange`, `Temp Check`, `Docs Ready`, `Pallet Exchange Confirmed`, `SMS to Driver`, `Money Confirmed`, `Client Updated`, `DONE`, `Veroia Switch`, `High Risk Flag`, `National Order Created`, `Invoiced`, `National Groupage`, `Is Partner Trip`, `Pallet Sheet 1 Uploaded`, `Pallet Sheet 2 Uploaded`, `CMR Photo Received`, `Client Notified`, `Temp OK`, `Driver Notified`, `Second Card`, `Loading Pallets 1-10`, `Unloading Pallets 1-10`, `Loading DateTime 2-10`, `Unloading DateTime 1-10`, `Group ID`, `Rotation ID`
- computed (2, read-only): `Week Number`, `Total Pallets`
- links (27): `Client`, `Record`, `Partner`, `Truck`, `Trailer`, `Driver`, `Veroia Cross-dock`, `Loading Location 1-10`, `Unloading Location 1-10`
- reverseLinks (1, read-only): `ORDER STOPS`
- **ΔΕΝ υπάρχουν** (και τα ζητάει το front end): `VS CD Date`, `Order Number`, `Net Price`, `Loading Summary`, `Delivery Summary`, `Client Name`, `Client Summary`, `Pallets`

### GROUPAGE LINES — `tblxUAaIsUMEDl3qQ` → pg `groupage_lines`
- fields (10): `Name`, `Reference`, `Pallets`, `Loading Date`, `Delivery Date`, `Direction`, `Status`, `Goods`, `Temperature C`, `Notes`
- links (5): `Loading Location`, `Delivery Location`, `Linked International Order`, `Linked National Order`, `Linked Consolidated Load`
- **ΔΕΝ υπάρχει**: `Groupage ID` (derived)

### CONSOLIDATED LOADS — `tbl5XSLQjOnG6yLCW` → pg `consolidated_loads`
- fields (25): `Name`, `Date`, `Direction`, `Status`, `Total Pallets`, `Goods`, `Temperature C`, `Loading DateTime`, `Delivery DateTime`, `Notes`, `Groupage ID`, `Matched Order`, `Is Groupage`, `Partner Truck Plates`, `Partner Rate`, `Pallets 1-10`
- links (25): `Client`, `Truck`, `Trailer`, `Driver`, `Partner`, `Loading Location 1-10`, `Delivery Location 1-10`
- **ΔΕΝ υπάρχει**: `Groupage Lines` — ρητή απόφαση, `worker/src/index.js:1148-1151`. Εκεί καταλήγουν 8 από τα 422 του `02_FILTERS_422.md`.

### NATIONAL ORDERS — `tblGHCCsTMqAy4KR2` → pg `national_orders`
- fields (35): `Direction`, `Status`, `Goods`, `Reference`, `Notes`, `Price`, `Partner Rate`, `Loading DateTime`, `Delivery DateTime`, `Actual Delivery Date`, `National Groupage`, `Is Partner Trip`, `Type`, `Pallets`, `Temperature °C`, `Pallet Exchange`, `Invoiced`, `Invoice Number`, `Invoice Date`, `Partner Truck Plates`, `Groupage ID`, `Matched Order ID`, `Ops Status`, `Delivery Performance`, `Ops Notes`, `Postponed To`, `ETA`, `Assigned At`, `CMR Photo Received`, `Client Notified`, `Docs Ready`, `Temp OK`, `Driver Notified`, `Second Card`, `Advance Paid`
- links (26): `Client`, `Partner`, `Truck`, `Trailer`, `Driver`, `Linked Order`, `Pickup Location 1-10`, `Delivery Location 1-10`
- reverseLinks (1): `ORDER STOPS`
- **ΔΕΝ υπάρχει**: `Name`, `Veroia Switch` (ο δείκτης είναι το `Type`, `:1256-1263`)

### ORDER STOPS — `tblaeY5QOHAS1gyE8` → pg `order_stops`
- fields (12): `Stop Label`, `Stop Number`, `Stop Type`, `DateTime`, `Pallets`, `Temperature`, `Reference`, `Goods`, `Notes`, `Pallet Sheet OK`, `Pallets Loaded`, `Pallets Exchanged`
- links (5): `Location`, `Client at Stop`, `Parent Order`, `Parent Nat Order`, `Parent Nat Load`

### NATIONAL LOADS — `tblVW42cZnfC47gTb` → pg `national_loads`
- fields (21): `Name`, `Direction`, `Status`, `Goods`, `Client` (πλην text), `Total Pallets`, `Temperature C`, `Loading DateTime`, `Delivery DateTime`, `Loading Appointment`, `Delivery Appointment`, `Actual Delivery Date`, `Reference`, `Matched Load`, `Is Partner Trip`, `Partner Truck Plates`, `Partner Rate`, `Pallet Exchange`, `Notes`, `Source Type`, `Source Orders`
- aliases (1): `Source Record` → `source_orders_raw` — **write/filter μόνο**
- linkAliases (1): `Source Record` → `Source Order` (FK προς **orders**)
- links (26): `Source Order`, `Source Consolidated Load`, `Truck`, `Trailer`, `Driver`, `Partner`, `Pickup Location 1-10`, `Delivery Location 1-10`
- reverseLinks (1): `ORDER STOPS`

### LOCAL MOVES — `local_moves` → pg `local_moves`
- fields (8): `Date`, `Sequence`, `Description`, `Pallets`, `Time From`, `Time To`, `Status`, `Notes`
- links (8): `Driver`, `Truck`, `Trailer`, `Partner`, `From Location`, `To Location`, `Parent Nat Load`, `Parent Order`

### SCAN TRAINING — `tblScanTraining000` → pg `scan_examples`
- fields (4): `Doc Type`, `Client ID`, `Corrected`, `Created At`

### PARTNER ASSIGNMENTS — `tblUhgqnmiam5MGNK` → pg `partner_assignments`, readView `partner_assignments_computed`
- fields (7): `Id`, `Partner Rate`, `Assignment Date`, `Status`, `Payment Terms`, `Notes`, `TRIPS`
- computed (3, read-only): `Client Revenue`, `Gross Profit`, `Margin Percent`
- links (2): `Partner`, `Order`
- **ΔΕΝ υπάρχει**: `Nat Load` — η στήλη υπάρχει στο 0018 αλλά δεν είναι συνδεδεμένη, `worker/src/index.js:1493-1495`. Εύρημα A-1.

### FUEL — `tblxRFsMeVhlLrBjF` → pg `fuel`
- fields (11): `Receipt ID`, `Date`, `Odometer KM`, `Liters`, `Total Cost`, `Station`, `Country`, `Invoice Number`, `Notes`, `Assignment Status`, `Fuel Type`

### Πίνακες του `config.js` που ΔΕΝ υπάρχουν στον Worker → 404
`TABLES.TRIPS`, `TRIP_COSTS`, `DRIVER_LEDGER`, `NAT_TRIPS`, `RAMP_EVENTS`,
`METRICS_SNAPSHOTS` (`config.js:49-80`). Ζωντανές χρήσεις: `modules/ceo_dashboard.js:146`
(τεκμηριωμένο και χειρισμένο με `safeFetch`), `core/metrics.js:502/533/548`
(αδρανές — δες A-9). Οι υπόλοιποι δεν χρησιμοποιούνται πουθενά.

---

## 2. ΠΙΝΑΚΑΣ Α — ΑΓΝΩΣΤΑ LABELS ΠΟΥ ΣΤΕΛΝΟΝΤΑΙ

Στήλη «Μόνο του;»: **ΜΑΖΙ** = σιωπηλή απώλεια με HTTP 200 (P0) ·
**ΜΟΝΟ ΤΟΥ** = 400 ορατό.
Δεν επαναλαμβάνονται τα WP-1 (`VS CD Date` στο `daily_ops.js:586`) και WP-7.

| # | Label | Πίνακας | Σημείο (αρχείο:γραμμή) | Μόνο του; | Αποτέλεσμα και συνέπεια |
|---|---|---|---|---|---|
| A-1 | `Nat Load` | PARTNER ASSIGNMENTS | `core/pa-helpers.js:40` (μέσα στο `paUpsert`, γράφεται στο `:47` patch / `:49` create) | ΜΑΖΙ με `Partner`, `Assignment Date`, `Status` (+`Partner Rate`, `Notes`) | 200 OK, η PA μένει χωρίς γονέα. Επειδή το ίδιο label δεν επιστρέφεται ούτε σε ανάγνωση, το `_paFindExisting` (`:11-18`) γυρίζει **πάντα κενό** για `parentType='nat_load'` → κάθε αποθήκευση στο Weekly National (`modules/weekly_natl.js:1566`) **δημιουργεί νέα** εγγραφή, και τα `paDelete` (`:1570`, `:1595`) / `paSyncStatus` δεν βρίσκουν τίποτα να σβήσουν ή να ενημερώσουν |
| A-2 | `Order` | RAMP | `modules/daily_ramp.js:269` | ΜΑΖΙ με 8 έγκυρα (`Plan Date`, `Type`, `Status`, `Is Veroia Switch`, `Goods`, `Pallets`, `Supplier/Client`, `Notes`, …) | 200 OK. Το `_rampDone` διαβάζει `r.fields['Order']` (`:671`) → πάντα `undefined` → **το «Done» της ράμπας δεν προάγει ποτέ** την παραγγελία σε `In Transit` (νεκρό `:678-689`) |
| A-2β | `National Order` | RAMP | `modules/daily_ramp.js:270` | ΜΑΖΙ | Ίδιο, για NAT_ORDERS (νεκρό `:690-704`) |
| A-3 | `Truck`, `Driver` | RAMP | `modules/daily_ramp.js:276-277` (auto-sync) και `:792-793` (`_rampSaveNew`, φόρμα «Νέα άφιξη/αναχώρηση») | ΜΑΖΙ | 200 OK. `_rTruck`/`_rDriver` (`:347-348`) πάντα κενά → οι στήλες ΦΟΡΤΗΓΟ/ΟΔΗΓΟΣ (`:609`), η αναζήτηση (`:382`) και το CSV (`:820-821`) είναι πάντα κενά. Τα δύο `select` της φόρμας (`:774-777`) δεν κάνουν τίποτα |
| A-4 | `Workshop`, `Estimated Cost` | MAINT_REQ | `modules/maintenance.js:2312`, `:2316` (`_mreqSave` → `:2320` patch / `:2324` create) | ΜΑΖΙ με `Vehicle Plate`, `Description`, `Priority`, `Status`, `Date Reported`, `Notes` | 200 OK. Το συνεργείο και το εκτιμώμενο κόστος δεν αποθηκεύονται ποτέ· η στήλη «Συνεργείο» (`:2154`) και το input κόστους (`:2279`) είναι πάντα κενά, και το `MREQ_FIELDS` (`:1963`) ζητάει το `Workshop` που δεν επιστρέφεται |
| A-5α | `Contact Person`, `Payment Terms Days` | CLIENTS | δήλωση `core/entity.js:41`, `:44` → συλλογή `:1388` → `atPatch :1403` / `atCreate :1405` | ΜΑΖΙ με `Company Name` (υποχρεωτικό, `:34`) | 200 OK. Εμφανίζονται σε στήλη (`:28`) και σε λεπτομέρειες (`:49-50`) → πάντα κενά. Το `Contact Person` είναι και στα `searchFields` (`:14`) |
| A-5β | `Contact Person` | PARTNERS | `core/entity.js:86` → `:1388` | ΜΑΖΙ | Ίδιο (στήλη `:73`, searchFields `:60`) |
| A-5γ | `Salary Base` | DRIVERS | `core/entity.js:132` → `:1388` | ΜΑΖΙ | 200 OK. Ο βασικός μισθός δεν γράφεται ποτέ· η στήλη (`:122`, με `perm:'full'`) και το detail (`:140`) πάντα κενά |
| A-6 | `Source Record` με τιμή id **NAT_ORDER** | NATIONAL LOADS | `modules/orders_natl.js:1336` (`_syncNationalLoad` → `:1362` patch / `:1367` create) | — (**400**) | Το `linkAliases` (`worker/src/index.js:1409` + `:2061-2068`) παράγει `Source Order: [id]` και το `resolveLinksOnWrite` το ψάχνει στον πίνακα **orders** → δεν βρίσκεται → **400 «Unknown linked record in request»**. Ο caller καταπίνει (`:1105 console.warn`) και ο χρήστης βλέπει «Order updated ✓» (`:1117`) — παρότι ο διακομιστής έχει ήδη δείξει κόκκινο toast από το `core/api.js:256-283`. Καμία μη-groupage εθνική παραγγελία δεν αποκτά NAT_LOADS → δεν εμφανίζεται στο Weekly National. (Το ίδιο label με id **ORDER** στο `modules/orders_intl.js:1055` λύνεται σωστά.) |
| A-7 | `VS CD Date` | ORDERS | `modules/weekly_intl.js:961`, καλείται από `:762`, `:1157`, `:1179` | **ΜΟΝΟ ΤΟΥ** | `row` κενό → **400 «No writable fields in request»** → κόκκινο toast + `reportError('Η αλλαγή ημερομηνίας απέτυχε')`. Το «κλικ στην ημερομηνία CD για να βάλεις την πραγματική» (owner 10/8) είναι αδύνατο σε 3 σημεία του Weekly International |
| A-8 | `Doc Type`, `Corrected`, `Client ID` | SCAN TRAINING | `core/scan-helpers.js:355-360` | — (**δεν στέλνεται καν**) | Το `config.js` δηλώνει `SCAN_TRAINING` **δύο φορές** (`:79` = `tblScanTraining000`, `:85` = `''`) και υπερισχύει το δεύτερο → ο φύλακας `if (tableId && ...)` (`core/scan-helpers.js:353`) είναι πάντα false. Ίδιο και στα `:381`, `:432`. Η κοινή μάθηση scan (owner 10/8) είναι εκτός λειτουργίας, ενώ Worker + RBAC την υποστηρίζουν |
| A-9 | 12 labels snapshot (`Snapshot ID`, `Captured At`, `Period Type`, `Period Label`, `Metric Key`, `Metric Category`, `Unit`, `Source`, `Notes`, `Value Numeric`, `Value Text`, `Value JSON`) | METRICS_SNAPSHOTS (**άγνωστος πίνακας**) | `core/metrics.js:483-500` → `:502` / `:533`; ανάγνωση `:548` | — (**404**) | `Table not available on this backend`. **Αδρανές**: `captureSnapshot`/`captureSnapshotsBatch`/`getSnapshotHistory` δεν καλούνται από κανένα άλλο αρχείο (grep σε `core/`, `modules/`, `*.html`) |
| A-10 | οποιοδήποτε label επιλέξει το μοντέλο | ORDERS / NAT_ORDERS / TRUCKS / TRAILERS / MAINT_REQ | `core/ai-chat.js:576` (`update_record`), schema `:406-417` με `fields: {type:'object'}` χωρίς allowlist | εξαρτάται από το μοντέλο | Ό,τι δεν είναι στον χάρτη χάνεται σιωπηλά και το εργαλείο γυρίζει `{success:true}` + πράσινο toast «Record updated» (`:577-578`) → ο βοηθός βεβαιώνει αλλαγή που δεν έγινε. Αν **όλα** τα labels είναι άγνωστα → 400 και το μοντέλο το βλέπει (`:617`) |

### Σημεία που ελέγχθηκαν και είναι ΚΑΘΑΡΑ (για να μη ξαναψαχτούν)

`core/stops-helpers.js:106-122` (ORDER STOPS, 13 labels) · `modules/pallet_upload.js:593-612`
(PALLET_LEDGER_SUPPLIERS, 13) · `modules/locations.js:435-451` (LOCATIONS, 9) ·
`modules/weekly_natl.js:702-710` (LOCAL MOVES, 11) · `modules/orders_natl.js:416-511`
(NAT_ORDERS/GL/CL/NAT_LOADS groupage chain) · `modules/orders_intl.js:1484-1494`
(`Loading/Unloading Location|Pallets 1-10`, loop 1..10 = ακριβώς το εύρος του χάρτη) ·
`modules/weekly_intl.js:1553-1564`, `:1960-1971`, `:2106-2146` (ανάθεση ORDERS) ·
`modules/weekly_natl.js:1512-1521`, `:1588` (ανάθεση NAT_LOADS) ·
`modules/invoicing.js:753-758`, `:852-857` (ORDERS **και** NAT_ORDERS έχουν και τα 4) ·
`modules/maintenance.js:319` (μόνο τα 4 χαρτογραφημένα expiry, `:13-22`), `:373`
(`Insurance Partner`, καλείται μόνο για Truck, `:578`), `:1027` (`Workshop` — τα
MAINT_HISTORY **έχουν** links) · `core/entity.js:1310` (`Active` — υπάρχει σε
όλους τους 6 entity πίνακες) · `modules/daily_ops.js:449-454` (τα δυναμικά
`fld` του checklist είναι όλα χαρτογραφημένα).

---

## 3. ΠΙΝΑΚΑΣ Β — ΑΧΡΗΣΙΜΟΠΟΙΗΤΑ LABELS (ο Worker τα ξέρει, κανείς δεν τα στέλνει)

Ταξινομημένα κατά τι σημαίνουν. «Εμφανίζεται» = διαβάζεται/δείχνεται κάπου στο
UI (νεκρό πεδίο, κλάση WP-7) — λεπτομέρειες στο `03_DEAD_READS.md`.

### ORDERS (43 από 121)
- **Ποτέ σε καμία διαδρομή, ούτε ανάγνωση**: `Ops Status`, `High Risk Auto Flag`, `Temp Check`, `Pallet Exchange Confirmed`, `SMS to Driver`, `Money Confirmed`, `Client Updated`, `DONE`, `Record` (legacy 2ο partner link), `Loading DateTime 2-10`, `Unloading DateTime 1-10` (29 labels: οι ώρες στάσεων ζουν πλέον στα ORDER STOPS)
- **Εμφανίζονται στην οθόνη χωρίς κανέναν writer** (WP-7): `Carrier Type` (`modules/orders_intl.js:576`), `Invoice Status` (`:591`), `Ops Notes` (`modules/daily_ops.js:19` στο `OPS_FIELDS`)
- **Γράφονται μόνο από εξωτερικό εργαλείο / δεν γράφονται από την εφαρμογή**: `Groupage ID` (γράφεται σε CL, όχι σε ORDERS), `Veroia Cross-dock` (μόνο ανάγνωση στο `print.html:597-598`, με hardcoded fallback στο `:606`)

### NATIONAL ORDERS (45 από 61)
Ολόκληρο το ops checklist και η ανάθεση: `Ops Status`, `Ops Notes`, `Delivery Performance`,
`Postponed To`, `ETA`, `Assigned At`, `Docs Ready`, `Temp OK`, `CMR Photo Received`,
`Client Notified`, `Driver Notified`, `Second Card`, `Advance Paid`, `Actual Delivery Date`,
`Reference`, `Partner Rate`, `Partner Truck Plates`, `Is Partner Trip`, `Matched Order ID`,
`Partner`, `Truck`, `Trailer`, `Driver`, `Linked Order`, `Pickup Location 2-10`,
`Delivery Location 1-10`. **Αιτία, όχι υπόθεση**: το `modules/daily_ops.js` δηλώνει
στο `:3` ότι είναι «International ORDERS only», και το Weekly National γράφει σε
NAT_LOADS (`modules/weekly_natl.js:1527`), όχι σε NAT_ORDERS. Άρα το εθνικό σκέλος
δεν έχει κανένα σημείο όπου να συμπληρωθούν αυτά τα πεδία.

### CONSOLIDATED LOADS (38 από 50)
`Notes`, `Matched Order`, `Partner Truck Plates`, `Partner Rate`, `Pallets 1-10`,
`Client`, `Truck`, `Trailer`, `Driver`, `Partner`, `Loading Location 2-10`,
`Delivery Location 1-10` — γράφεται μόνο ό,τι φτιάχνει το
`modules/orders_natl.js:465-483` (`_natlWriteGroupageChain`) και το
`core/order-sync.js:151-155`. Η ανάθεση οχήματος γίνεται στο NAT_LOADS, όχι εδώ.

### RAMP (29 από 44)
`Temp Checked`, `Pallets Counted`, `Goods Staged`, `Temp Set` (καμία αναφορά πουθενά) ·
`Stop Client/Location/Temp/Ref/Pallets 1-5` (25 labels — ζητούνται μόνο σε
`fields[]` στο `modules/daily_ramp.js:21-25` και δεν γράφονται ποτέ)

### NATIONAL LOADS (3 από 48)
`Actual Delivery Date`, `Notes`, `Source Order` (το τελευταίο γράφεται **έμμεσα**
από το `linkAliases` όταν σταλεί `Source Record`)

### ORDER STOPS (3 από 17)
`Pallet Sheet OK`, `Pallets Loaded`, `Pallets Exchanged` — καμία αναφορά στο front
end· υπάρχουν σταθερές `F.STOP_PALLET_SHEET_OK`, `F.STOP_PALLETS_LOADED`,
`F.STOP_PALLETS_EXCHANGED` (`config.js:266-268`) που δεν χρησιμοποιούνται.

### PARTNER ASSIGNMENTS (3 από 9)
`Id` (Airtable autoNumber), `Payment Terms` (υπάρχει `F.PA_PAYMENT_TERMS` στο
`config.js:278`, χωρίς χρήση), `TRIPS` (stray text — το λέει και ο Worker, `:1523`)

### MAINT_HISTORY (5 από 19)
`Source Ref`, `Odometer` (alias, ζωντανός για παλιά δεδομένα), `Needs Review`
(διαβάζεται στο `modules/maintenance.js:697`/`:721`, δεν γράφεται), `Truck`, `Trailer`
(γράφεται δυναμικά **ένα** από τα δύο, `:1037` — άρα το άλλο μένει άγραφο)

### MAINT_REQ (1), LOCAL MOVES (5), PALLET_LEDGER_PARTNERS (9), FUEL (11), SCAN TRAINING (4), LOCATIONS/CLIENTS/PARTNERS/DRIVERS/TRUCKS/TRAILERS/WORKSHOPS
- MAINT_REQ: `Vehicle Type`
- LOCAL MOVES: `Time To`, `Notes`, `Trailer`, `Partner`, `Parent Order`
- PALLET_LEDGER_PARTNERS: **όλα** (9) — ο πίνακας δεν έχει κανέναν writer· το
  `modules/pallet_upload.js` γράφει μόνο στο SUPPLIERS (`TABLES.PALLET_LEDGER`,
  `:546`). Οι κινήσεις partner πάνε πλέον στο `pl_movements` (`/pallets/*`)
- FUEL: **όλα** (11) — by design, γράφεται από το sister repo (`worker/src/index.js:1536-1541`)
- SCAN TRAINING: **όλα** (4) — λόγω A-8
- Master data (CLIENTS/PARTNERS/DRIVERS/TRUCKS/TRAILERS/WORKSHOPS/LOCATIONS):
  αχρησιμοποίητα μόνο `State/province` (LOCATIONS) και `Vehicle Type` (MAINT_REQ).
  Όλα τα υπόλοιπα γράφονται από το `core/entity.js` / `modules/locations.js`.
