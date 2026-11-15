# D — Master data and fleet: catalogue for the redesign

Read-only code catalogue, worktree tip `eac5a928`, 14/11/2026. Nothing was run, no database was queried.
"Verified" below means "read in the client code at that line". Table contents and the deployed Worker were **not** checked.
Security-related notes are in `D-master-fleet-private.md`, not here.

Files read in full: `core/entity.js` (3155 lines), `modules/maintenance.js` (2431), `modules/locations.js` (1360),
`modules/locations_map.js` (619), `core/countries.js`, `core/ui.js`, `core/data-helpers.js`, `core/router.js`, `core/auth.js`;
parts of `core/form-helpers.js`, `core/utils.js`, `core/api.js`, `core/constants.js`, `config.js`, `worker/src/index.js` (field maps only).

## 0. Map of the scope

| Route id | Menu label (router.js) | Renderer | Perm key |
|---|---|---|---|
| `clients` | «Πελάτες» | `renderEntity('clients')` router.js:373 | `clients` |
| `partners` | «Συνεργάτες» | `renderEntity('partners')` :374 | `clients` |
| `drivers` | «Οδηγοί» | `renderEntity('drivers')` :387 | `drivers` |
| `trucks` | «Φορτηγά» | `renderEntity('trucks')` :384 | `maintenance` |
| `trailers` | «Ρυμούλκες» | `renderEntity('trailers')` :385 | `maintenance` |
| `workshops` | «Συνεργεία» | `renderEntity('workshops')` :383 | `maintenance` |
| `locations` | «Τοποθεσίες» | `renderLocations()` :371 | `orders` (section «Παραγγελίες») |
| `maint_dash` | «Επισκόπηση Στόλου» | `renderMaintDash()` :377 | `maintenance` |
| `maint_req` | «Εντολές Εργασίας» | `renderMaintRequests()` :378 | `maintenance` |
| `maint_expiry` | «Λήξεις Εγγράφων» | `renderExpiryAlerts()` :379 | `maintenance` |
| `maint_svc` | «Ιστορικό Service» | `renderServiceRecords()` :380 | `maintenance` |
| `maint_trucks` / `maint_trailers` | «Ιστορικό Φορτηγών / Ρυμουλκών» | `_renderHistory()` :381-382 | `maintenance` |

Role matrix (`config.js:353-366`, `can()` = `core/auth.js:76`; `navigate()` refuses `none`, router.js:276-291):

| Role | clients | drivers | maintenance | orders (Locations) |
|---|---|---|---|---|
| owner | full | full | full | full |
| management | full | full | full | view |
| accountant | full | full | view | view |
| dispatcher | full | view | view | full |
| warehouse | none | none | none | view |

No feature flag in `config.js:417` (`FEATURES`) switches anything in this scope. The entity cards read the national-v5
half through `PlanConfig` / `/plan/activity` (entity.js:1276-1352), which is a data gate, not a UI flag.

Who does what (inference from the perm matrix and code comments, not from user research):
- **dispatcher**: looks up a client/partner phone, creates clients/partners/locations while entering orders (daily); checks a
  vehicle's documents and open work orders before assigning (daily, read-only by perm).
- **management** (fleet manager): owns Συντήρηση + Στόλος. Morning: «Εντολές Εργασίας» and the two print lists for the planners;
  weekly: «Λήξεις Εγγράφων»; after each invoice: «Ιστορικό Service» (new record / scan).
- **accountant**: clients/partners/drivers master data (VAT, payment terms), read-only on fleet.
- **owner**: everything; the only role with the «όλα →» link from a vehicle card to TRIP PnL.

---

## 1. Entity engine (shared by the six pages) — `core/entity.js`

### 1.1 Inventory

| Region | What it does | file:line |
|---|---|---|
| Loading skeleton | 4 card placeholders + 6 rows + «Φόρτωση…» | ui.js:244-260, entity.js:728 |
| Load error block | «Δεν φορτώθηκαν οι εγγραφές…» + «Ξαναδοκίμασε» (re-enters `renderEntity`) | entity.js:734-745 |
| Header bar `.ev2-bar` | title, count («πρώτες 500 από N» when capped), filters, search, «Νέα εγγραφή» (only `can()==='full'`) | entity.js:866-883, 856-860, 2000-2002 |
| KPI card row (trucks, trailers only) | «Ηλικία στόλου», «Ανά χώρα», «Λήγουν σε 30 ημ.» (click = filter `due30`), trucks also «Συντήρηση 14 ημ.» (click = sort by next maintenance) | entity.js:1030-1146 |
| Stats strip `.ev2-stats` | fleet/drivers: Σύνολο · Ενεργά · Ληγμένο έγγραφο/δίπλωμα · Λήγει <30 ημ. · Χωρίς ημερομηνία; workshops: Σύνολο · Ενεργά · Σε χρήση · Εργασίες · Δαπάνη (money only if `can('costs')!=='none'`); clients/partners: Σύνολο · Ενεργοί · Χώρες · Χωρίς τηλέφωνο. Not clickable | entity.js:953-1012 |
| Filters | `<select>` per config: bool/select (zero-match options disabled, :819-823), dynamic (country options grouped on ISO code + «άγνωστη γραφή» bucket, :778-799, 830-842). Default filter «Κατάσταση: Ενεργός» on all six (`defaultFilters`) | entity.js:812-845 |
| Search | substring over `searchFields`, plus normalized-plate match (Greek/Latin look-alikes) | entity.js:1963-1976 |
| Table | sortable headers (3-state, ▲▼, `aria-sort`, keyboard), country group rows for trucks/trailers while default sort holds, row click = open card, row pencil = edit, «⚠ διπλότυπο;» badge on look-alike plates, 500-row cap with footer warning | entity.js:1684-1888 |
| Hidden-empty-columns note | under the table: «Κρυμμένες στήλες — καμία τιμή…: X, Y» + «Εμφάνιση/Απόκρυψη» | entity.js:62-136, 1997 |
| Empty states | filtered: «Καμία εγγραφή με αυτά τα φίλτρα» + «Καθαρισμός φίλτρων»; empty table: «Δεν υπάρχει καμία εγγραφή ακόμη» + CTA | entity.js:1614-1640 |
| Record card (right panel, 480px, inline not overlay) | header: title, status pill (a live toggle button for editors), type pill, subtitle, «ΣΕ ΣΕΡΒΙΣ» badge, edit, ✕; then config-driven sections (below) | entity.js:2124-2279 |
| Card sections | «Χιλιόμετρα» (last odometer from service history) · «Έγγραφα»/«Δίπλωμα» (dot + date + words, link «Διαχείριση →» to `maint_expiry`) · notice (driver salary) · specs · «Χρήση» (workshops) · «Round trips» (5 newest, leg block) · «Με ποια φορτηγά» (driver) · «Τοπικές κινήσεις» (driver, 10 newest) · activity KPIs + 3 recent (clients/drivers: orders; partners: assignments) · «Ζημιές & επισκευές» / «Πρόσφατες εργασίες» (count, total, «χωρίς κόστος», 3 newest) | entity.js:2214-2272, loaders 2283-2714 |
| Create/edit modal | shared `openModal`; sections from `formFields`; field types text, number, date (with spelled-out readout), email, select, country select, list (comma-separated → array), textarea; disabled field with reason; inline error slot per field; footer note «Τα πεδία με σφάλμα εμποδίζουν την αποθήκευση» | entity.js:2944-3053 |
| Toasts | «Η εγγραφή ενημερώθηκε/δημιουργήθηκε» (3148); «Marked as Active/Inactive» (2929); save error via `reportError` (3153) | |

### 1.2 Business logic to keep

- Read: `atGet(tableId)` whole table, cached (entity.js:732). Write: `atPatch` / `atCreate` to the facade table id; then `invalidateCache` and full re-render (3134-3150).
- **Emptied field on edit is sent as `null`** only if it had a value (3101-3113); a disabled field is never sent (3106).
- Required check only on submit; live validation only runs `validators` (3059-3085). Only rule today: tare weight ≥ 0 (502, 544).
- `list` fields go to the wire as arrays (3118) — a plain string is a server error for that column.
- After creating a client/partner/truck/trailer/driver, `PlanIds.stale()` so the national forms see it (3143-3144).
- Country: stored ISO code, shown Greek name, unknown spelling kept and shown muted, never guessed (countries.js:62-102; entity.js:1860-1869, 2988-2993).
- Plates: search and duplicate flag use `normalizePlate`; duplicates are flagged, never merged (1686-1699).
- Expiry on these pages (see E-05 for the mismatch): filter/KPI = `ceil`, `<0` expired, `<30` expiring (1024-1028); "no date" is its own state, never "ok" (973-975, 2114).
- KPI cards count **active** records only; «Λήγουν σε 30 ημ.» = expired ∪ expiring, same predicate as the filter option `due30` (1076-1095, 1946).
- Unknown ≠ zero: enrichment columns stay «—» for unused workshops (1244-1249, 1813); cost totals show «—» plus «N χωρίς κόστος» (2340-2347).
- "On time %" = share of orders the dispatcher marked `On Time` vs `Delayed`; never computed from dates; denominator shown (2573-2581, 2634).
- Card async sections each fail on their own with their own sentence (2293-2297, 2369-2384, 2522-2533, 2708-2713); stale responses are dropped by element id (2076-2082).
- No RT code on screen; it lives in `title` only (2488, 2667). [LOCKED — plain-messages rule]
- Money on cards: client «τζίρος» = sum of order `Price` (2637-2639); partner «τζίρος» = sum of partner rates (2677-2679). Margin/revenue per assignment are not shown in v2. [LOCKED — dispatcher sees price and partner rate, not P&L]
- Empty columns are hidden per **visible rows**, threshold 100 %, with a visible note (44-46, 62-129); columns filled after first paint carry `keepEmpty` (671-673, 1719).

### 1.3 Per-entity differences

| | Clients | Partners | Drivers | Trucks | Trailers | Workshops |
|---|---|---|---|---|---|---|
| Config | :141 | :216 | :278 | :383 | :509 | :614 |
| List columns | Εταιρεία, Χώρα, Πόλη, Επαφή, Τηλέφωνο, Κατάσταση | Εταιρεία, Χώρα, Επαφή, Τηλέφωνο, Email, Κατάσταση | Οδηγός, Τηλέφωνο, Τύπος, Αρ. διπλώματος, Δίπλωμα έως, Κατάσταση | Πινακίδα, Χώρα, Μάρκα, Μοντέλο, Έτος, Euro, Απόβαρο, VIN, Κατάσταση | Πινακίδα, Χώρα, Μάρκα, Μοντέλο, Έτος, Τύπος, VIN, Απόβαρο, Κατάσταση | Όνομα, Πόλη, Ειδικότητα, Τηλέφωνο, Εργασίες, Δαπάνη, Τελευταία χρήση, Κατάσταση |
| Filters | Χώρα, Κατάσταση | Χώρα, Κατάσταση | Τύπος, Κατάσταση | Χώρα, Μάρκα, Κατάσταση, Έγγραφα | Χώρα, Τύπος, Κατάσταση, Έγγραφα | Ειδικότητα, Χώρα, Κατάσταση |
| Search | name, city, contact, VAT | name, contact, VAT | name, licence no. | plate, VIN, brand, model, insurer | plate, VIN, brand, model, type | name, city, contact, specialty, aliases, notes, phone, VAT |
| Form sections | Στοιχεία εταιρείας (+3-col row) · Επικοινωνία | Στοιχεία εταιρείας · Επικοινωνία | Στοιχεία · Δίπλωμα | Ταυτότητα · Τεχνικά · Έγγραφα · Συντήρηση · Σημειώσεις | Ταυτότητα · Τεχνικά · Έγγραφα | Στοιχεία · Επικοινωνία · Διεύθυνση |
| Required | Επωνυμία | Επωνυμία | Ονοματεπώνυμο, Τύπος | Πινακίδα | Πινακίδα | Επωνυμία |
| Card extras | activity (orders, on-time, τζίρος), recent orders | activity (assignments + v5 cycles), recent | licence, salary notice, round trips, per-truck bars, local moves, deliveries | km, 4 documents, specs, round trips, repairs | type pill, 3 documents, specs, round trips, repairs | specialty pill, contact, usage, recent jobs |
| Extra reads | ORDERS + NAT_ORDERS by link filter (2596-2603) | PARTNER_ASSIGN, `/plan/activity`, ORDERS (2642-2695) | `/costs/lookups`, `/costs/rt`, `/plan/activity`, local moves, ORDERS | MAINT_HISTORY, MAINT_REQ, `/costs/*` | same | MAINT_HISTORY (list enrichment 1220-1264) |
| Default order | DB order | DB order | active first (1523-1527) | country, then plate, grouped (428, 1730-1738) | same | DB order |

Documents tracked: trucks ΚΤΕΟ, ΚΕΚ, Ασφάλεια, Ταχογράφος (406-411); trailers ΚΤΕΟ, ATP/FRC, Ασφάλεια (532-536); drivers Δίπλωμα (303-307).

### 1.4 State of the form fields CLAUDE.md lists as "not reaching the table"

| Field | Client code today | Worker source map (`worker/src/index.js`, repo copy) | Table |
|---|---|---|---|
| Clients «Υπεύθυνος επαφής» | editable, sent as `Contact Person` (entity.js:205); also list column, search, card | present (:1005) | not verified |
| Clients «Όροι πληρωμής (ημέρες)» | editable number, sent as `Payment Terms Days` (:209); card spec without unit (:166); not a list column | present (:1006) | not verified |
| Partners «Υπεύθυνος επαφής» | editable, sent (:269); card comment still says "dead" (:233) | present (:1022) | not verified |
| Workshops «Υπεύθυνος επαφής» | editable, sent (:695) | present (:1093) | not verified |
| Work order «Εκτ. Κόστος €» | editable, sent as `Estimated Cost`, empty → null (maintenance.js:2359, 2403); shown only on the printed sheet / share text (:1999), not in the list | present (:1162) | not verified |
| Drivers «Βασικός μισθός» | **disabled** with reason «Δεν αποθηκεύεται — δεν υπάρχει στήλη στη βάση» (entity.js:367-373); never sent (:3106); card notice «Δεν έχει καταχωρηθεί» for `full` roles only (:312-316) | no such label in the DRIVERS map | no column (per code comments; owner decision pending) [LOCKED-pending] |

### 1.5 Findings — entity engine

| ID | Tag | Finding | Evidence |
|---|---|---|---|
| E-01 | EXTRA | All six configs are `v2: true`, so the whole pre-v2 path is unreachable: old header/toolbar layout, old detail panel, three stats strips, order/assignment history tables, English footer + `alert()`, column types `compliance` / `temp_range` / `city`. Roughly 600 lines. | flags entity.js:152, 225, 286, 390, 516, 622; dead code :893-931, 1182-1211, 1355-1485, 1785-1808, 2021-2074, 2726-2923, 3029-3033, 3123-3129 |
| E-02 | EXTRA | `renderComingSoon()` is called for an unknown entity key but defined nowhere (would throw). Unreachable from the router today. | entity.js:725 |
| E-03 | INCONSISTENT | The page has no drawn read-only variant: some controls follow the role («Νέα εγγραφή», card edit/toggle), the row pencil does not. The redesign must define what a view-only role sees on list, card and form. Details in the private notes. | entity.js:1881 vs 856, 2198-2209 |
| E-04 | INCONSISTENT | Empty-table CTA is English and ungated: `+ Truck`, `+ Client`… | entity.js:1638, labels :144, 219, 281, 386, 512, 617 |
| E-05 | INCONSISTENT | One vehicle, four expiry rules on the same screen: stats strip `floor`, ≤30, over ALL records (971-977); KPI + filter `ceil`, <30, ACTIVE only (1024-1028, 1079); card `ceil`, ≤30 (2115-2117); list cell <30 (utils.js:347-350). Elsewhere: Λήξεις 30 days / 60 for a Bulgarian ΚΤΕΟ (maintenance.js:350-360), pickers and print lists 14 (utils.js:288; maintenance.js:1807, 2122). The strip and the KPI card can show different counts side by side. | as cited |
| E-06 | BROKEN | Sorting «Ειδικότητα» on Συνεργεία does nothing: the numeric test `/Year|Salary|Tank|Weight|Capacity|Pallets|Lt|kg|HP/i` matches the field name `Specialty`, so text is compared as `parseFloat` → 0. | entity.js:1559-1560, 1567; column :668 |
| E-07 | INCONSISTENT | Status toggle on the card: English toast «Marked as Active/Inactive», no `try/catch` of its own, and a full page re-render. | entity.js:2925-2930 |
| E-08 | INCONSISTENT | Every save or toggle calls `renderEntity`, which rebuilds state: search text, filters (back to «Ενεργός») and the open card are lost; sort survives. | entity.js:749-754, 2928, 3150 |
| E-09 | MISSING | No delete on any of the six pages (only deactivate). Look-alike plates are flagged «⚠ διπλότυπο;» but the screen offers no way to resolve them. | no `atDelete`/`atSoftDelete` in entity.js; flag :1855-1857 |
| E-10 | INCONSISTENT | Config comment says the client card "never shows revenue"; the card shows «τζίρος» (sum of `Price`). Showing price is allowed [LOCKED]; the comment is stale. | entity.js:150-151 vs 2637-2639 |
| E-11 | INCONSISTENT | Card links are unfiltered: «όλες →» on client and driver cards opens the orders hub with no client/driver preset; «όλα →» on a vehicle's round trips opens TRIP PnL (owner only) with no vehicle preset. | entity.js:2261, 2181 |
| E-12 | INCONSISTENT | English left inside Greek cards: «Round trips», «N round trip(s)», row codes `INTL`/`NAT`, raw statuses `Assigned`/`Delivered` in partner recent rows. | entity.js:2244, 2514, 2661-2667 |
| E-13 | MISSING | Drivers have no «Έγγραφα» filter, so the strip's «Ληγμένο δίπλωμα / Λήγει <30 ημ.» numbers cannot be opened; strip numbers are not clickable on any entity (KPI cards are). | entity.js:327-338 vs 979-983; 959-961 |
| E-14 | INCONSISTENT | Trailer type select mixes Greek and English options («Ψυγείο», «Τέντα», `Box`, `Flatbed`, `Tanker`, «Ρυμούλκα»). | entity.js:599-601 |
| E-15 | INCONSISTENT | Three list-length strategies: entity 500-row cap + warning (1682, 1744), Locations 50 per page (locations.js:13), map list cap 400 (locations_map.js:468), maintenance tables uncapped. | as cited |
| E-16 | EXTRA | Stale comments describing fields as dead that the form now writes (partners contact; engine header counts). | entity.js:233, 9-14 |
| E-17 | LOCKED | Driver salary stays a disabled field + card notice until a column exists. | entity.js:308-316, 367-373 |

### 1.6 States

| State | Today | file:line |
|---|---|---|
| Loading | generic skeleton | entity.js:728 |
| Load error | red block + retry; never an empty table | :734-745 |
| No permission | route refused with toast «Δεν έχετε πρόσβαση σε αυτή τη σελίδα»; no drawn view-only state inside the page (E-03) | router.js:280-290 |
| Empty (filtered / truly empty) | two different messages | :1626-1639 |
| Many rows | first 500 + warning row + count prefix | :1723-1744, 2000 |
| Half-filled form | modal does not close on backdrop click; Esc closes (no dirty check); errors inline, save disabled while errors | ui.js:149-157; entity.js:3059-3085 |
| Card section loading / failed / forbidden | «Φόρτωση…» → own sentence per section; 403 on round trips reads «Ο ρόλος σου δεν έχει πρόσβαση στα δρομολόγια.» | entity.js:2216-2271, 2525-2527 |
| Enrichment failed (workshops) | «⚠ Εργασίες/Δαπάνη δεν φόρτωσαν» in the bar | :1254-1263 |

---

## 2. Locations — `modules/locations.js`, `modules/locations_map.js`, `core/countries.js`

### 2.1 Who
Every role (section perm `orders`: owner/dispatcher `full`, management/accountant/warehouse `view`). The module itself never calls `can()`.
Job (inference): dispatcher adds/fixes a place while entering orders, fills missing coordinates, looks up opening hours/phone;
uses the map to find "what is near" (workshop, fuel, customs) for a truck on the road.

### 2.2 Inventory

| Region | What it does | file:line |
|---|---|---|
| Bar | title, count («N εγγραφές» / «X από N»), filters Χώρα (ISO-grouped, + «— Ελλιπή στοιχεία», + «άγνωστη γραφή»), Τύπος (values from data), Κίνηση (ΕΞΑΓΩΓΗ/ΕΙΣΑΓΩΓΗ/ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ, index built lazily), chip «N χωρίς συντεταγμένες» (toggle filter, disabled at 0), search, «Χάρτης/Λίστα» toggle, «+ Νέα τοποθεσία» | locations.js:59-105, 210-241 |
| Table | ΟΝΟΜΑΣΙΑ (name + address below), ΠΟΛΗ, ΧΩΡΑ, ΤΥΠΟΣ, ΣΥΝΤΕΤΑΓΜΕΝΕΣ (link to Google Maps, or «— δεν έχει καταχωρηθεί»), actions edit / delete (lock icon on the cross-dock record). Sort on name/city/country | :300-353, 185-193 |
| Pager | 50 per page, «1–50 από N», ‹ 1 … n › | :355-384 |
| Form (shared modal) | Όνομα*, Χώρα (select), Πόλη, Διεύθυνση, Τύπος (free text + 7 suggestions), Ωράριο, Ημέρες παράδοσης, Lat, Lon, Τηλέφωνο, Σημειώσεις, link «Εύρεση συντεταγμένων»; duplicate warning box «Υπάρχει ήδη:» with «Άνοιξε αυτή», save button turns «Δημιουργία νέας» | :387-468, 516-527, 806-812 |
| Delete dialog | modal «Διαγραφή τοποθεσίας;» with warning that orders lose the reference | :917-947 |
| Location card (right drawer 560px, backdrop) | navy head (name, city · country, address, chips «ΕΞΑΓΩΓΗ 3×»…), «Στοιχεία» (hours, days, type, phone, notes, coordinates), «Προϊόντα» (goods aggregated from stops), «Ιστορικό» (two-line rows: date · stop type · client · pallets / order ref · plate), v5 rows merged | :979-1360 |
| Inline "new place from scan" form | used inside order-scan previews: name, city, country, address, lat/lon, auto geocode, map link, duplicate box «Χρήση αυτής» | :605-914 |
| Map view | left pane: search, «Καρφίτσες/Ομάδες», «Χρώμα: κατηγορία/πελάτης», accordion «Τι είναι το σημείο» (8 categories with counts), «Επίπεδα ανά πελάτη» (top 12), list (cap 400, km when radius active, category chips); map: pins, clusters, zoom, radius tool «Τι υπάρχει κοντά» 50/100/200/400 km with bar; right detail: facts, contact, «Άνοιγμα καρτέλας τοποθεσίας →», Google Maps, «Τι έχει κοντά», «Επεξεργασία τοποθεσίας»; hint «N εκτός Ευρώπης…» | locations_map.js:259-386, 435-496, 523-603 |
| Toasts | saved/created, name transliterated (info), country not from list, geocode found (success/warn with what was matched) / not found / failed, move-index failed, cross-dock not deletable | locations.js:483-495, 549, 585-589, 935, 1192 |

### 2.3 Business logic to keep

- Reads `atGetAll(LOCATIONS)` with an explicit field list (951-961); the technical "transfer point" place is filtered out (960).
- Names and cities are **Latin only**: Greek input is transliterated, not refused, and the user is told (470-474, 487-494).
- Country must come from the list; an unknown spelling is refused in plain words before the database refuses it (475-479, 495).
- Duplicate check on create only: same name after stripping company forms/punctuation/country tail in the same country, or a shared word within 500 m. A warning, never a refusal; second press creates (760-804, 516-527).
- Geocoding (OpenStreetMap Nominatim): address first and it must hit a house number; then name + city; towns/roads/postcodes are refused; one request per second; "did not run" is never reported as "not found" (556-592, 609-659).
- The cross-dock location cannot be deleted (lock in the row, guard in the handler) (338-340, 928-937).
- Delete = `atSoftDelete` (browser-side trash of 50 + server delete, api.js:1425-1447); list and map refresh (938-947).
- After save: `fhLocationSaved` so order-form pickers see the place at once; map points rebuilt (536, 548).
- Movement type of a place is derived for display from its stops' parents (Export/Import, North→South/South→North); nothing is written (1141-1157).
- Map: only points with numeric coordinates; frame fitted to Europe so one bad coordinate cannot zoom the map out, and such points are named in a hint (169-172, 277-282, 382-384); library and workshop list load on first open only (56-80, 196-227).
- Map category is computed from the free-text Type + name by regex; a workshop record lends its specialty/phone/contact to a location only when names match after transliteration AND the location looks like a workshop (87-105, 126-160).
- Card history failure is shown as failure with retry; the instant "Στοιχεία" half stays (1283-1288).

### 2.4 Findings — Locations

| ID | Tag | Finding | Evidence |
|---|---|---|---|
| L-01 | BROKEN | On edit, an emptied Χώρα / Πόλη / Διεύθυνση / Τύπος / Lat / Lon / Ωράριο / Ημέρες is not sent at all, so the old value stays while the toast says «ενημερώθηκε». Only Σημειώσεις and Τηλέφωνο send `null`. | locations.js:500-509 vs 512-513 |
| L-02 | BROKEN | Map detail «Τηλέφωνο» ignores the location's own phone: map points are built with empty phone/contact and only a matched workshop fills them, so a place with a phone shows «δεν έχει καταχωρηθεί». | locations_map.js:183-190, 153-158, 586-587 |
| L-03 | INCONSISTENT | No read-only variant: the module draws the same controls for every role (it never asks `can()`). Details in the private notes. | locations.js:83, 337-340 |
| L-04 | INCONSISTENT | Page search is a plain lowercase substring; the order-form pickers use a folded, transliterated match. With Latin-only names, a Greek query finds nothing here. | locations.js:268-271 vs form-helpers.js:256-296 |
| L-05 | INCONSISTENT | Sort headers carry a fixed «↕», no direction mark, no keyboard/`aria-sort`, 3 of 5 columns; entity tables have all of these. | locations.js:90-94, 185-193 vs entity.js:1704-1722 |
| L-06 | INCONSISTENT | Emoji as controls (edit, delete, lock in the table; pin/cluster toggles on the map) next to SVG icons everywhere else. | locations.js:337-340; locations_map.js:291-292 |
| L-07 | MISSING | No real category on a location: Type is free text (7 mixed-language suggestions), the map guesses the category by regex, and code comments say almost all points land in «Αταξινόμητα». | locations.js:408, 432; locations_map.js:83-105, 270-274 |
| L-08 | MISSING | Workshops have no coordinates of their own; a workshop appears on the map only if a similarly named location exists (name heuristics). | locations_map.js:112-160 |
| L-09 | INCONSISTENT | The location card has no edit/delete action and no Esc close; the entity card has both, and the map detail has «Επεξεργασία». | locations.js:1261-1307; ui.js:440-442; locations_map.js:599-600 |
| L-10 | INCONSISTENT | Delete confirmation is a hand-built modal; maintenance uses `confirmAction`. | locations.js:917-925 vs maintenance.js:1224 |
| L-11 | INCONSISTENT | Third copy of the "did not load" block, built inline. | locations.js:43-46 vs ui.js:262-280, maintenance.js:392-396 |

### 2.5 States

| State | Today | file:line |
|---|---|---|
| Loading | skeleton «Φόρτωση τοποθεσιών…»; map «Φόρτωση χάρτη…»; card «Φόρτωση ιστορικού…»; count text «υπολογισμός τύπων κίνησης…» | locations.js:30, 1057, 1164; locations_map.js:201 |
| Error | page block + retry; map message + retry; card note + retry; move filter cleared with toast | locations.js:43-47, 1286-1288, 1186-1193; locations_map.js:223-225 |
| Empty | «Καμία τοποθεσία με αυτά τα φίλτρα.» / «Καμία τοποθεσία καταχωρημένη.»; map «Καμία τοποθεσία με συντεταγμένες.»; card «Καμία κίνηση καταγεγραμμένη…» | locations.js:310, 1301-1303; locations_map.js:214 |
| Many rows | 50/page pager; map list cap 400 with «…και άλλα N» | locations.js:355-378; locations_map.js:466-479 |
| Half-filled form | shared modal (no backdrop close); duplicate warning keeps the form open; geocode button shows «Αναζήτηση…» | locations.js:516-527, 576-591 |
| No permission / view-only | no state drawn (L-03) | — |

---

## 3. Maintenance — `modules/maintenance.js`

Shared: one load for trucks, trailers, workshops (cached for the session) + full service history (`_maintLoad`, :240-281);
header row `.mnt-head` with pills, search, actions, refresh icon; error block `_mntErrorHtml` (:392-396);
body-level hosts for the record drawer and the module's own modal (`.mf-overlay`) (:413-419). No `can()` anywhere in the file.

### 3.1 «Επισκόπηση Στόλου» (`maint_dash`) — page title on screen: «Κέντρο Συντήρησης»

Who: management daily (inference); dispatcher/accountant read.

| Region | What | file:line |
|---|---|---|
| Header | title, subtitle, «Ενημερώθηκε hh:mm · ανανέωση κάθε 5'», refresh | :1611-1618 |
| 6 KPI cards | Σύνολο στόλου · Συμμόρφωση % · Ληγμένα έγγραφα · Λήγουν σύντομα (first four open Λήξεις pre-filtered) · Ζημιές <year> · Δαπάνη <year> | :1620-1653 |
| Card: 6-month spend bars | peak month highlighted + sentence naming the single biggest job | :1656-1667 |
| Card: 6 worst vehicles by expiry | row click → Λήξεις searched on that plate | :1669-1682 |
| Card: 5 recent services | row click → service drawer; link «όλο το ιστορικό →» | :1684-1693 |
| Card: year spend by category, top 5 | bars | :1695-1701 |

Logic: active vehicles only (:430, 451); compliance = vehicles without an expired document / active fleet (:1542-1543);
"expired" here counts **documents**, the Λήξεις page counts **vehicles** (:1587-1590); cost sums skip records without cost and say how many (:317-325); auto-refresh every 5 minutes while open (:1504-1515); paint guarded against late arrival on another page (:1606).

### 3.2 «Εντολές Εργασίας» (`maint_req`)

Who: management creates/closes; dispatcher reads (inference); printed sheets go to the workshop and to the planners.

| Region | What | file:line |
|---|---|---|
| Header | pills ενεργές / SOS / άμεσα / ολοκληρωμένες / όλες (zero → disabled), search, «Εκτύπωση εντολών», «Εκτύπωση λήξεων», «Ιστορικό Service», «Νέα εντολή», refresh | :1888-1903 |
| Table (sortable) | ΠΡΟΤΕΡΑΙΟΤΗΤΑ, ΟΧΗΜΑ (+ type or «εκτός ενεργού στόλου»), ΠΕΡΙΓΡΑΦΗ (+ notes), ΣΥΝΕΡΓΕΙΟ, ΑΝΑΦΕΡΘΗΚΕ (+ «από <χρήστης> · ώρα» for owner/management, read from the audit trail), ΚΑΤΑΣΤΑΣΗ + printer icon + «✓ Ολοκληρώθηκε». SOS rows tinted. Row click = edit form | :1865-1915, 1723-1771 |
| Collapsed band «ΑΠΟ ΛΗΞΕΙΣ ΕΓΓΡΑΦΩΝ (N)» | documents expired or due ≤14 days without an open order naming them; first 10; action «✓ Ανανεώθηκε»; link to Λήξεις | :1796-1827, 1921-1942 |
| Form (module modal) | Όχημα* (searchable select of active vehicles + «Άλλο όχημα (πληκτρολόγηση)»), Ημ. αναφοράς, Προτεραιότητα (SOS/Άμεσα/Κανονικό), Κατάσταση (Εκκρεμεί/Σε εξέλιξη/Ολοκληρώθηκε), Περιγραφή*, Συνεργείο (active workshops + «Άλλο»), Εκτ. Κόστος €, Σημειώσεις; footer Διαγραφή, Εκτύπωση, Άκυρο, Αποθήκευση | :2318-2375 |
| **Print: one work order** (A4 portrait, hidden iframe) | title «ΕΝΤΟΛΗ ΕΡΓΑΣΙΑΣ» (+ SOS badge), company, print date; table Όχημα / Προτεραιότητα / Κατάσταση / Ημ. αναφοράς / Συνεργείο / Εκτ. κόστος; Περιγραφή; Σημειώσεις; 5 blank lines «Παρατηρήσεις συνεργείου»; three signature boxes | :2010-2056 |
| Share menu (right-click / long-press on a printer) | same content as plain text | :2002-2009, 2058-2061, 1943-1950 |
| **Print: list «Εντολές εργασίας»** (A4 landscape) | sections ΣΤΟΝ ΔΡΟΜΟ / ΦΟΡΤΗΓΑ / ΡΥΜΟΥΛΚΟΥΜΕΝΑ; one block per vehicle: plate, badge, what, workshop, date opened, «ΔΡΟΜΟΛΟΓΙΟ 7 ΗΜ.» (state, route, driver, paired vehicle); header stamp, KPI line, footer legend, page numbers | :2106-2300 |
| **Print: list «Λήξεις εγγράφων»** | same sheet, documents expired or due ≤14 days, one line per vehicle | same, mode `docs` |

Logic:
- Stored: `Vehicle Plate`, `Vehicle Type`, `Description`, `Priority`, `Status`, `Date Reported`, `Workshop` (a **name string**), `Notes`, `Estimated Cost` → MAINT_REQ (:2389-2404). Delete = soft delete after confirm (:2423-2431).
- Sort: SOS → Άμεσα → Κανονικό, then newest (:1841-1847). Missing priority = Κανονικό (:2394).
- «✓ Ανανεώθηκε» writes a *Done* order «<doc> — Renewal», which the Λήξεις page reads back as its «ΑΝΑΝΕΩΘΗΚΕ» column (:1955-1972, 623-635).
- Print lists ignore tab and search on purpose; rank: expired ΚΤΕΟ/insurance/tachograph 1 · SOS 2 · other expired 3 · Άμεσα 4 · due 5 · normal 6; «Στον δρόμο» = rank ≤3 while running or leaving within 7 days; failed trip read prints «?» and says so in the title; a plate not in the fleet prints «? … δεν ελέγχθηκε» (:2066-2075, 2141-2199, 2231-2234, 2281-2282). No prices on the sheets.
- An in-progress order on a plate puts «ΣΕ ΣΕΡΒΙΣ» on the vehicle card (entity.js:2386-2397) and a warning in the assign pickers (utils.js:326).

### 3.3 «Λήξεις Εγγράφων» (`maint_expiry`)

| Region | What | file:line |
|---|---|---|
| Header | «N ενεργά οχήματα», pills όλα / ληγμένα / λήγουν σύντομα / σε ισχύ, chip «μόνο <έγγραφο> ✕» when arriving from the dashboard, search, «Εξαγωγή CSV», «Εκτύπωση», refresh | :722-736 |
| 4 KPI cards | Συμμόρφωση στόλου (with bar) · Οχήματα με ληγμένο · Λήγουν σύντομα · Ανανεώθηκαν — 7 ημ. (first three are filters) | :738-760 |
| Table ΦΟΡΤΗΓΑ | ΟΧΗΜΑ (plate + brand/model), KTEO, KEK, ΑΣΦΑΛΕΙΑ, ΤΑΧΟΓΡΑΦΟΣ, ΑΣΦΑΛΙΣΤΗΣ, ΑΝΑΝΕΩΘΗΚΕ; grouped by registration country; each date cell = date + coloured pill «σε N ημ.» / «ληγμένο N ημ.» | :762-766, 678-716 |
| Table ΡΥΜΟΥΛΚΕΣ | ΟΧΗΜΑ, KTEO, FRC («δεν απαιτείται» when not applicable), ΑΣΦΑΛΕΙΑ, ΑΣΦΑΛΙΣΤΗΣ (always «—»), ΑΝΑΝΕΩΘΗΚΕ | :768-772 |
| Inline edit | click a date → date input + spelled-out readout, saves on Enter/blur, Esc cancels, half-typed date = cancel; click truck insurer → text input | :494-587 |
| Footer note | «Ασφαλιστής ρυμουλκών: δεν υπάρχει στήλη… · Κλικ σε ημερομηνία ή ασφαλιστή για επεξεργασία.» | :773 |
| CSV | Τύπος, Πινακίδα, Μάρκα, Μοντέλο, KTEO, KEK/FRC, Ασφάλεια (date + days each), Ασφαλιστής; respects tab + search | :789-807 |
| Print | new window with the page's own HTML and stylesheet | :810-827 |

Logic: active vehicles only; FRC applies if a date exists, or the trailer type is Reefer, unless Notes carry `NO-FRC` (:38-45);
warning window 30 days, 60 for a Bulgarian-registered vehicle's ΚΤΕΟ (:350-354); colour bands >60 green, 31-60 light green, 15-30 orange, 0-14 red, expired dark red, always with words (:355-361);
per-vehicle status = its worst document (:458-461); days computed date-only, local (:284-295); inline save writes one field to TRUCKS/TRAILERS and saves once, not per keystroke (:520-551).

### 3.4 «Ιστορικό Service» (`maint_svc`)

| Region | What | file:line |
|---|---|---|
| Header | count («· εμφανίζονται N»), selects Όχημα / Τύπος / Συνεργείο / Έτος / Κατάσταση, pill «N θέλουν έλεγχο», «καθαρισμός ✕», search, «Σάρωση τιμολογίου», «Νέα εγγραφή», refresh | :933-950 |
| Table (sortable, fixed layout) | ΗΜ/ΝΙΑ, ΟΧΗΜΑ (+type), ΕΡΓΑΣΙΑ (+category), ΣΥΝΕΡΓΕΙΟ (name + qualifier/city), ΑΡ. ΑΝΤ/ΚΟΥ, ΚΟΣΤΟΣ, ΟΔΟΜΕΤΡΟ, ΚΑΤΑΣΤΑΣΗ (+ «θέλει έλεγχο») | :952-963, 868-892 |
| Record drawer (480px, backdrop) | navy head (plate, category · type, date · status), Εργασία, Στοιχεία (κόστος, οδόμετρο, αρ. τιμολογίου, επόμενο σέρβις), Ανταλλακτικά, Συνεργείο (+ «καρτέλα →»), Σημειώσεις; footer Διαγραφή / Κλείσιμο / Επεξεργασία | :975-1017 |
| Form (module modal) | scan row «Σάρωση τιμολογίου (AI)» + status line; Όχημα* (searchable), Ημερομηνία, Τύπος (10 categories), Συνεργείο, Περιγραφή, Κόστος €, Χιλιόμετρα, Αρ. Τιμολογίου, Ανταλλακτικά, Επόμενο Service (ημ/νία, km), Κατάσταση, Σημειώσεις | :1035-1100 |
| Invoice scan | image/PDF → fills only empty fields; plate and workshop matched to the selects; user reviews before saving | :1103-1159 |

Logic: categories are 10 stable keys with Greek labels (:64-76); a **Completed** record requires cost and odometer (:1168-1177);
the record links to the vehicle (`Truck`/`Trailer`) and keeps the plate text for display/search (:1197-1205); workshop is a link (:1194-1195);
delete = confirm + soft delete (:1223-1232); after a write the screen that opened the form is repainted (:1236-1242).

### 3.5 «Ιστορικό Φορτηγών / Ρυμουλκών» (`maint_trucks`, `maint_trailers`)

| Region | What | file:line |
|---|---|---|
| Header | searchable vehicle select (active only), then Έτος, Κατηγορία, count pill, search, «Εξαγωγή CSV», «Νέα εγγραφή» (both disabled until a vehicle is chosen), refresh | :1351-1374 |
| Nothing selected | illustration + «Κανένα φορτηγό επιλεγμένο» + explanatory note; nothing is auto-selected | :1376-1382 |
| 4 KPI cards | Δαπάνη <year> (+ % vs last year) · Εργασίες <year> · Μ.Ο. ανά εργασία · Τελευταίο σέρβις (+ next service) | :1384-1405 |
| 2 cards | «Ανάλυση ανά κατηγορία — <year>» bars · «Κορυφαία συνεργεία — όλα τα έτη» | :1407-1427 |
| Table | same row as Ιστορικό Service without the vehicle column | :1429-1440 |
| CSV | Ημερομηνία, Κατηγορία, Συνεργείο, Εργασία, Ανταλλακτικά, Κόστος, Οδόμετρο, Κατάσταση | :1451-1475 |

Entry with a preselected vehicle from the vehicle card «όλα →» (:1252-1256; entity.js:2269).

### 3.6 Findings — Maintenance

| ID | Tag | Finding | Evidence |
|---|---|---|---|
| M-01 | INCONSISTENT | Menu and breadcrumb say «Επισκόπηση Στόλου», the page title says «Κέντρο Συντήρησης». | router.js:59 vs maintenance.js:1613 |
| M-02 | BROKEN | The `NO-FRC` rule cannot work on the maintenance screens: the check reads the trailer's Notes, but the loader does not request Notes (the code comment says so). | maintenance.js:41 vs 259-263, comment 246-250 |
| M-03 | BROKEN | Service drawer never shows the workshop's phone: it reads `Phone`, the loader requests only Name/City/Specialty/Active. | maintenance.js:985 vs 264 |
| M-04 | BROKEN | Work-order form: «Άλλο» in Συνεργείο has no text box and saves `null`; an order whose stored workshop name is not in the active list opens on «Άλλο» and loses the name on any save. | maintenance.js:2357, 2397 |
| M-05 | BROKEN | «✓ Ανανεώθηκε» does not dismiss the alert row: the generator skips a document only when a **non-Done** order names it, and the renewal it writes is Done. The row stays until the date is edited in Λήξεις; each further click writes another record. | maintenance.js:1809-1814, 1955-1972 |
| M-06 | BROKEN | A tachograph renewal is never shown as renewed: the action writes «ΤΑΧΟΓΡΑΦΟΣ — Renewal», the reader matches only `KTEO|KEK|FRC|Insurance`. | maintenance.js:1961 with constants.js:110 vs maintenance.js:627 |
| M-07 | BROKEN | Expiry print loses three of the four KPI cards and all pills: the print CSS hides every `button`, and those KPI cards are buttons. | maintenance.js:821 vs 739-754 |
| M-08 | BROKEN | Service form on edit: the workshop cannot be cleared (sent only when chosen); the Type select has no empty option, so a stored type outside the ten keys is silently saved as the first option; cost `0` is saved as empty. | maintenance.js:1194-1195, 1071 + 1183, 1185 |
| M-09 | INCONSISTENT | Workshop on a work order is a name string, on a service record a link. Renaming a workshop detaches its work orders; the two screens cannot be joined by workshop. | maintenance.js:2355, 2397 vs 1195; worker map `Workshop: "workshop_name"` |
| M-10 | INCONSISTENT | The module's own modal closes on a backdrop click (half-filled form lost); the shared modal was changed not to. Two modal systems, two drawer systems (see X-01). | maintenance.js:1053, 2333 vs ui.js:149-151 |
| M-11 | INCONSISTENT | No read-only variant on any maintenance page: the module never asks `can()`; only the creator stamp looks at the role. Details in the private notes. | maintenance.js:1731 |
| M-12 | MISSING | Expiry CSV has no tachograph columns although it is a tracked truck document; ΚΕΚ and FRC share one column. | maintenance.js:795-800; constants.js:103-111 |
| M-13 | MISSING | Closing a work order does not create or offer a service record; nothing links MAINT_REQ to MAINT_HISTORY; estimated cost is never set against actual cost. | maintenance.js:1974-1981, 2377-2421 |
| M-14 | MISSING | Driver licence expiry is outside Λήξεις, the dashboard, the alert band and both print lists (vehicles only). | constants.js:103-116; entity.js:296 |
| M-15 | INCONSISTENT | Vehicle history page matches records by plate text + vehicle type; the vehicle card matches by link, then normalized plate. Totals can differ for the same vehicle. The page's select lists active vehicles only, but the card can open it for an inactive one — the select then reads «Επίλεξε…» above that vehicle's data. | maintenance.js:1309, 1299, 1252-1255 vs entity.js:2312-2316 |
| M-16 | INCONSISTENT | Vehicle-history table is not sortable; the Service and Work-order tables are. | maintenance.js:1429-1433 vs 952-955, 1905-1907 |
| M-17 | INCONSISTENT | A renewal is recorded as a work order with priority SOS and status Done, so «ολοκληρωμένες» / «όλες» mix real jobs with renewal stamps. | maintenance.js:1961-1963 |
| M-18 | EXTRA | Tooltip `title="MS-2"` (an audit id) on the «Ιστορικό Service» button. | maintenance.js:1900 |
| M-19 | EXTRA | Trailer «ΑΣΦΑΛΙΣΤΗΣ» column is drawn for a field that does not exist (always «—», explained in a footnote, then auto-hidden). | maintenance.js:702, 770, 773 |
| M-20 | INCONSISTENT | Search placeholder says «Αναζήτηση πινακίδας…» but also searches description, notes, workshop. Every keystroke repaints the whole page and restores focus by hand (Service, Expiry, Work orders, History). | maintenance.js:1897 vs 1856; 845-855, 782-787, 1829-1834 |
| M-21 | INCONSISTENT | Drawer and module modal have no consistent Esc: the global handler removes `.mf-overlay` but not the service drawer. | ui.js:436-442; maintenance.js:986-988 |

### 3.7 States — Maintenance

| State | Today | file:line |
|---|---|---|
| Loading | skeleton with page-specific text | :479, 835, 1263, 1500, 1774 |
| Error | `_mntErrorHtml`: what did not load, what it does not mean, retry | :392-396 and each page's `catch` |
| Partial failure | Λήξεις: renewals unreadable → KPI «—» + «το ιστορικό ενεργειών δεν φορτώθηκε» (:484-485, 757-758); print list: trips unreadable → «?» + banner (:2281-2282) | |
| Empty | per table with illustration; filtered vs truly empty distinguished on Service and History; History before selection has its own state | :957-962, 1376-1382, 1434-1439, 1909-1914, 717 |
| Zero-count filter | pill disabled, not hidden | :675-676, 1862-1863, 942 |
| Many rows | no cap, no paging; full history loaded on purpose (:271-279) | |
| Half-filled form | inline errors under vehicle/cost/odometer/description; backdrop click closes (M-10); no busy state on «Αποθήκευση» | :1162-1177, 2378-2386 |
| Saving inline | cell shows «Αποθήκευση…», failure toast + repaint | :524-535 |
| No permission / view-only | no state drawn (M-11) | — |

---

## 4. Shared helpers these pages rely on

| Helper | Role | file:line |
|---|---|---|
| `openModal` / `closeModal` / `modalSetBusy` | single shared modal; title + accent "chip"; focus trap; Esc closes unless busy; backdrop never closes | ui.js:12-73, 148-166 |
| `confirmAction` | promise-based confirm on the shared modal; Enter = OK | ui.js:98-145 |
| `showLoading`, `showError`, `showEmpty` (+ legacy), `showAccessDenied`, `showComingSoon` | page states; 6 inline SVG illustrations | ui.js:177-337 |
| `toast(msg, type)` | one floating toast, 3 s, types success/danger/warn/info (`error`→danger); message is HTML | ui.js:386-431 |
| `TableSort` | opt-in click-to-sort for plain tables (`data-sort-id`, `data-sort`) | ui.js:501-580 |
| Global keys | Esc closes module modal → shared modal → entity card | ui.js:434-443 |
| `collapseEmptyColumns` | hide all-empty columns + note | entity.js:62-136 |
| `countryCode/Name/OptionsHtml`, `groupByCountry` | one country vocabulary and grouping order (Greece first, then by size, unknown last) | countries.js:62-126 |
| `fhSelectSearch` | turns a `<select>` into a type-to-find list | form-helpers.js:394 |
| `fhLocationSaved`, `_fhTranslit`, `_fhNorm`, `_fhLocLabel` | picker refresh, Greek→Latin, folding, label | form-helpers.js:25-86, 256-320 |
| `getLocationName`, `getLinkedId`, `orderRoute` … | reference lookups used by cards and prints | data-helpers.js:12-182 |
| `expiryLabel`, `dateReadout`, `normalizePlate`, `vehicleWarnings` | expiry text (<30), spelled-out date, plate key, 14-day picker warnings | utils.js:345, 242, 502, 288-329 |
| `atSoftDelete` | delete + browser-local trash entry (last 50) + undo | api.js:1425-1447 |

### Cross-page findings

| ID | Tag | Finding | Evidence |
|---|---|---|---|
| X-01 | INCONSISTENT | Three record-detail surfaces (inline 480px panel; fixed 480px drawer with backdrop; fixed 560px drawer with backdrop + its own CSS), two modal systems, three "did not load" blocks, three toast entry points (`toast`, `showErrorToast`, `reportError`) with both `'danger'` and `'error'` in use. | entity.js:882, 2183; maintenance.js:213-226, 986; locations.js:981-1027; ui.js:262, 386; utils.js:30, 89 |
| X-02 | INCONSISTENT | Role-dependent display is handled three different ways (entity: partly; locations and maintenance: not at all; router: page-level only). One rule for "view-only" is needed before drawing. | entity.js:802, 856; router.js:276-291 |
| X-03 | INCONSISTENT | Three expiry windows and several rounding rules across the scope (see E-05). | as E-05 |
| X-04 | LOCKED | No record codes as the subject of a line (round-trip code only in `title`); dispatcher sees price and partner rate but no margin. | entity.js:2488, 2556-2559, 2667 |

---

## 5. Counts

| Tag | Count |
|---|---|
| BROKEN | 10 (E-06, L-01, L-02, M-02, M-03, M-04, M-05, M-06, M-07, M-08) |
| MISSING | 7 (E-09, E-13, L-07, L-08, M-12, M-13, M-14) |
| EXTRA | 5 (E-01, E-02, E-16, M-18, M-19) |
| INCONSISTENT | 28 (E-03, E-04, E-05, E-07, E-08, E-10, E-11, E-12, E-14, E-15, L-03, L-04, L-05, L-06, L-09, L-10, L-11, M-01, M-09, M-10, M-11, M-15, M-16, M-17, M-20, M-21, X-01, X-02; X-03 repeats E-05 and is not counted) |
| LOCKED | 2 (E-17, X-04) |

Not verified anywhere in this file: what the tables hold, what the deployed Worker accepts or refuses per role, how any screen looks when rendered.
