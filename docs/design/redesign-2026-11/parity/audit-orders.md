# Parity audit 1 — «Παραγγελίες»: catalog list + order card

Read-only audit, 15/11/2026. Today = code in the worktree. Mock-up = `docs/design/redesign-2026-11/index.html:574-620` (CSS `:177-199`) and shots `01-orders-list.png`, `01-orders-card.png`, `01-orders-card-delivered.png`.
Not checked: the database, the deployed Worker, the live app. Mock-up menus that are only a chevron («Νέα παραγγελία ▾», «Εκτύπωση ▾», «···», filter chips) are judged by their label and `title`, their contents are not drawn.

Roles: O owner · D dispatcher · M management · A accountant · W warehouse. `can('orders')==='full'` = O, D. `can('costs')!=='none'` = O, M, A (`config.js:353-365`).
File shorthands: hub = `modules/orders_hub.js`, cat = `modules/orders_catalog.js`, com = `core/orders-common.js`, intl = `modules/orders_intl.js`, natl = `modules/orders_natl.js`, docs = `core/order-docs.js`, qe = `core/order-quick-edit.js`, pre = `modules/preorder.js`.

---

## 1. Header bar

| Today | What it does, who | `file:line` | In mock-up? | If NO / changed: where | Risk if left out |
|---|---|---|---|---|---|
| Title «Παραγγελίες» | page title, all | hub:66 | YES same | | none |
| Subtitle «Διεθνείς και εθνικές · N παραγγελίες · τελευταίες 60 ημέρες» | count of the scope + loaded period; while searching: «αναζήτηση σε όλες τις ημερομηνίες…» | cat:393,453,482 | YES changed («380 παραγγελίες · 60 ημέρες · αξία …») | keep the "searching all dates" wording as a state of the same line | slower (user thinks search covers 60 days only) |
| Scope «Όλες / Διεθνείς / Εθνικές» | filters every tab + its counters; remembered per user | hub:59-60,122-128,28-32 | YES same | | none |
| «CSV» | downloads filtered rows, all roles | cat:335,527-540 | YES changed (inside «Εκτύπωση ▾», title «Εκτύπωση ή CSV») | menu item | slower |
| «Εκτύπωση» | A4 landscape list of filtered rows, all roles | cat:336,541-554 | YES changed (menu) | menu item | none |
| «Σάρωση» (scope Διεθνείς or Εθνικές) / «Σάρωση διεθνούς» + «Σάρωση εθνικής» (scope Όλες) | document → prefilled order form, paid extraction; O, D only | cat:329-334 | YES changed (one «Σάρωση», no type choice) | on «Όλες»: two-item menu on the button; one scope: direct | data lost (wrong form type) / slower |
| «+ Νέα παραγγελία ▾» → «Διεθνής», «Εθνική», «Pre-order» | opens the forms; O, D only. After day L «Εθνική» does not open a form: toast + jump to Εβδομαδιαίο Εθνικών | cat:313-321,515-520 · natl:869-873 | YES changed (chevron, items not drawn) | menu must list the three; «Pre-order» is the forgotten one | slower (pre-order has no other door on this page) |
| KPI «Σύνολο», «Διεθνείς», «Εθνικές», «Σε μεταφορά», «Παραδόθηκαν» | counts of the scope, not of the filters; a stock lot in the warehouse is not counted delivered | cat:218-233,245 | NO (only total, in subtitle) | counts on the «Κατάσταση» filter options, or hover on the total | slower |
| «Αξία περιόδου» + «εκτός N χωρίς τιμή» | sum of Price of non-cancelled priced rows; says how many are not in the sum; drawn for every role | cat:228-229,246 | YES changed (value in subtitle, caveat gone) | hover/sign on the value: "N χωρίς τιμή δεν μετρούν" | data lost (value reads as complete) |
| Warning strips above the list (one type failed, national loads failed, v5 state failed, locations failed, names late) | each says what failed and what it does not mean; the other type still shows | cat:360-369,389,401 · hub:110-112 · natl:104-107 · com:352 | NO for this screen (generic «Δεν διαβάστηκε» panel exists, `index.html:549`) | one strip above the list, per failed part | data lost («—» read as "none") |
| Whole page failed | error text, not an empty list | hub:113-118 | generic only | same | data lost |

## 2. Tabs and filters

### 2a. What the tabs strip must carry (other tabs' bodies are out of scope)

| Today | What it does, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Κατάλογος» | order 1, all five roles | hub:207-210 | YES same | | none |
| «Προς τιμολόγηση» + counter | order 2; visible to O, D, M, A (not W: needs `clients`); counter = orders ready to invoice in the current scope; **counter drawn only for O, M, A** (D sees the tab with no number) | `orders_invoicing_view.js:1324-1330` · hub:176,190 | YES same (number shown; role variant not drawn) | | none |
| «Εβδομάδα» | order 3; O, M, A only; no counter | `orders_week_view.js:2358-2364` | YES same | | none |
| «Χωρίς τιμή» + red counter | order 4; O, M, A only; counter = unpriced, in scope | `orders_noprice_view.js:705-710` · hub:191 | YES same | | none |
| Default tab | A lands on «Προς τιμολόγηση», others on «Κατάλογος»; last tab + scope remembered per user; a remembered tab the role cannot see falls back | hub:36,44-54 | n/a | behaviour | slower |
| Right slot of the tabs row (`#ohTabsExtra`) | the tab's own control («Εβδομάδα» puts «Ανά ημέρα / Ανά όχημα» there) | hub:74,104 | YES changed: the mock-up puts the catalog search there | the slot must stay per-tab; search is only the catalog's | slower |
| Sidebar counter on «Παραγγελίες» | A: ready to invoice (all scopes); O: unpriced (all scopes); others none | hub:192-202 | NO (mock-up user is Owner, nav item has no number) | number on the nav item | slower (owner's queue invisible) |

### 2b. Catalog filters

| Today | What it does | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Search «Αριθμός, αναφορά, πελάτης, τόπος, ΤΠΥ» | substring over number, reference, client, place names + city, goods, ΤΠΥ; a non-empty search loads **all dates** in the background and returns to the period when emptied | cat:199-203,293-295,436-494 | YES changed («Αναζήτηση»; collapses to an icon with the card open) | keep the five things searchable (number and ΤΠΥ have no other home in the mock-up); hover on the icon lists them | data lost (order "looks deleted") |
| Chip «Προς ανάθεση N» | rows with no vehicle, not pre-orders; hidden at 0 | cat:210,230,247 | YES same | | none |
| Chip «Εκτός Εβδομαδιαίου N» (red) | national orders with no national load; hidden at 0 | cat:211,231,247 | YES same | | none |
| Chip «Χωρίς τιμή N» (red) | unpriced, not cancelled / pre-order / stock piece; **all roles**, incl. D and W who have no «Χωρίς τιμή» tab | cat:212,229,247 | NO | third chip, for roles without the tab at least | slower (D cannot list unpriced) |
| «Όλες N» chip | — (today the count is the foot line under the table) | orders-list.js:123 | NEW form of an existing fact | | none |
| «Κατεύθυνση»: Εξαγωγή, Εισαγωγή, Άνοδος, Κάθοδος | filter | cat:296 | YES same (options not drawn) | | none |
| «Κατάσταση»: Σε αναμονή, Ανατέθηκε, Επιβεβαιώθηκε, Σε μεταφορά, Παραδόθηκε, Ακυρώθηκε | filter on raw Status | cat:297 | YES same (options not drawn) | | none |
| «Μάρκα»: Petras Group, DPS | international only; picking one drops national rows | cat:298,208 | NO | fourth filter chip, or inside «···» of the filter row | slower |
| «Εβδομάδα» | Saturday–Friday weeks as date ranges («14 – 20/11»), current marked «→»; week = where the Weekly shows the order | cat:281-285,299 · com:40-61 | YES same (options not drawn; must be date ranges, not W-numbers) | | none |
| Period: «Τελευταίες 60 ημέρες», «Τελευταίοι 6 μήνες», «Όλα» | reloads by Loading date | cat:300,503 · orders-list.js:26-33 | YES changed («60 ημέρες» dotted link) | link opens the three options | slower |
| «Καθαρισμός» | clears filters **and** widens the period to all | cat:301,497-502 | NO | appears only when a filter is on (also in the empty state «Καθαρισμός φίλτρων», cat:258) | slower |
| One-shot filter from Dashboard tiles | arrives with direction / «προς ανάθεση» preset | cat:376-380 | n/a | behaviour | none |

## 3. List columns and row contents

Today: 10 columns, each sortable, 3-state (asc / desc / off); default Φόρτωση desc (cat:143-158,504-508,24).

| Today | What it shows | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «ΑΡ.» `#n` international / `Ε-n` national | order number, sortable; «—» when absent | cat:144,180 · com:122-126 | NO (nowhere, list or card) | small grey number in the card header; row `title`; searchable; column in CSV/print | slower (the number the team says on the phone; two orders of one client the same day cannot be told apart) |
| Paperclip next to the number | international only; opens «Έγγραφα παραγγελίας»; count when several | cat:180 · com:249-252 · docs:281-326 | NO in the list (card has «Έγγραφα 2») | sign on the row, after the tags | slower |
| «ΑΝΑΦΟΡΑ» line 1: customer reference, or «— χωρίς αναφορά» | main text of column 2; sortable | cat:149,181 | NO in the list (card only) | hover on the client name, or grey after the cargo line | slower |
| Line 2: direction word «Εξαγωγή / Εισαγωγή / Άνοδος / Κάθοδος» | | cat:43,181 | YES same | | none |
| Tags `VS`, `GRP`, `PE` | Veroia Switch (intl only), groupage, pallet exchange | cat:131-133 | YES same | each needs its hover word (legend line is gone) | none |
| Tags `ΑΠ`, `→ ΑΠΟΘΗΚΗ` | stock piece / stock lot; drawn before the direction | cat:129-130,165-167 | NO | same tag row | data lost (a piece without price reads as "χωρίς τιμή"; a lot "Παραδόθηκε" reads as delivered to the client) |
| Tag `HR` | High Risk Flag, intl | cat:134 | NO | tag, hover «υψηλό ρίσκο» | slower |
| Tag «2 σκέλη» | split order, parent listed once | cat:137,181 | NO | tag with hover | none |
| Legend line above the table | explains `#`, `Ε-`, each tag, «✓ ΤΠΥ» | cat:268-271 | NO | hover per tag (owner rule) | none |
| «ΠΕΛΑΤΗΣ» | client name; «…» while names load | cat:150,182,110-112 | YES changed (now the row's main line) | | none |
| «ΦΟΡΤΩΣΗ» / «ΠΑΡΑΔΟΣΗ» | place name; below «City CC · +N» (N = more points) and the date d/m; «—» for a pre-order or unknown; sortable by date | cat:151-152,183-184 · com:185-208 | YES changed (weekday + date first, city, «+2»; no country code) | country code on hover of the city | none |
| «ΠΑΛ.» | pallets (intl Total Pallets, natl Pallets), sortable | cat:153,185 | YES changed (in the cargo line «18 παλέτες») | | none |
| «ΑΝΑΘΕΣΗ» own fleet | «truck · trailer» / driver **full stored name** | com:276-288 | YES changed (initial + surname) | see section C | data lost (two drivers share a surname) |
| «ΑΝΑΘΕΣΗ» partner | company name / partner truck plates (word «συνεργάτης» only when no plates) | com:267-275 | YES changed (always «συνεργάτης», plates never) | plates on line 2 | slower |
| «— προς ανάθεση» | no vehicle; national: hover «Στο Εβδομαδιαίο Εθνικών, χωρίς όχημα» | com:289-290,312,318 | YES same («Προς ανάθεση» with + tile) | | none |
| Red «εκτός» + «Στείλε →» | national order with no load; button creates the missing load (O, D; not after day L) | com:307-310 · cat:86-91 · natl:1130-1148 | NO (chip exists, row state does not) | red tile + action in the card's dark box | data lost (order never reaches the board) |
| «μέσω ομαδοπ.» | national groupage order (old model): vehicle is set in the groupage | com:306 | NO | tile state with hover | slower |
| «—» with hover «Η κατάσταση των εθνικών v5 δεν διαβάστηκε» | unknown ≠ unassigned | com:305 | NO | grey tile | data lost |
| v5 national: first vehicle + «+n» | order split over several cycles | com:294-303 | NO | «+1» after the plate | slower |
| «—» for Delivered / Cancelled without vehicle | no "προς ανάθεση" on finished orders | com:316-317 | NO | grey dash | none |
| Pre-order: «Μετατροπή» · «Διαγραφή» in this cell | O, D | cat:186-187 | NO | row hover actions / card | slower |
| «ΚΑΤΑΣΤΑΣΗ» dot + word | Σε αναμονή · Ανατέθηκε · Επιβεβαιώθηκε · Σε μεταφορά · Παραδόθηκε · Τιμολογήθηκε · Ακυρώθηκε | cat:34-42,168-170 | YES changed (4 of 7 drawn) | add Ακυρώθηκε at least | data lost (cancelled rows have no look) |
| Stock lot words: «Στην αποθήκη», «Ολοκληρώθηκε», «Τιμολογήθηκε · στην αποθήκη» | a lot "Delivered" = received by the warehouse | cat:60-74 | NO | status word | data lost |
| National with no Status = «—» | national status is not written; intl empty = «Σε αναμονή» | cat:46 | NO (mock-up gives national rows live statuses) | see section B | — |
| «PRE» pill (urgency colour, hover = what is missing) | replaces the status on a pre-order | cat:169 · pre:90-93 | NO | status cell | slower |
| «ΤΙΜΗ €» | amount; red «χωρίς τιμή» (0 € counts as none); piece: lot number with hover «Στην παρτίδα … — τιμολογείται η παρτίδα»; cancelled / pre-order «—»; no role gate in the catalog | cat:117-119,171-178 | YES changed (amount and «χωρίς τιμή» only) | piece and cancelled variants | data lost (piece shown as unpriced) |
| «ΤΙΜΟΛΟΓΙΟ» | «✓ ΤΠΥ n» (hover: date) · «✓ Αυτοπαράδοση» · «✓ χωρίς αριθμό» · «—» | com:213-222 · cat:157,190 | YES changed (bare number / «εκκρεμεί» / «–») | add the two other "invoiced" forms; date on hover | data lost (self delivery reads as not invoiced) |
| Row count under the table | follows the filters | orders-list.js:123 | YES changed («Όλες 380») | | none |
| «…» while names load | never «—», never an id | cat:107-115 | NO | skeleton text | none |
| Empty: «Καμία παραγγελία με αυτά τα φίλτρα» + «Καθαρισμός φίλτρων» / «Καμία παραγγελία σε αυτή την περίοδο» | | cat:252-260 | generic only (`index.html:548,550`) | | none |
| Selected row highlight; row narrows when the card opens | | cat:162,303-306 | YES same (row collapses to client · route · tile · status · price · ΤΠΥ) | | none |

## 4. Row actions and quick edits

| Today | What it does, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Click row | opens the type's own card; waits for names in the first seconds | cat:426-435 | YES same | | none |
| Click paperclip | opens documents without opening the card | docs:289 | NO | sign on the row | slower |
| «Στείλε →» | see above | com:308 | NO | | data lost |
| Pre-order «Μετατροπή» (opens the full form) / «Διαγραφή» | O, D | cat:186-187 · pre:242-244 | NO | | slower |
| Sort by any column header | | cat:504-508 | YES changed (only «Φόρτωση ↓» drawn) | all headers clickable | slower |
| No inline cell edit in the catalog today | — | — | YES same (none drawn) | | none |

## 5. Order card

International card = `_oiCardHtml` (intl:437-583). National card = `selectNatlOrder` (natl:262-376). Two different cards today; the mock-up draws one.

### 5a. Header

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Title intl «Reference · Client»; natl «REFERENCE · CLIENT» or «ΧΩΡΙΣ ΑΝΑΦΟΡΑ» | | intl:548 · natl:288,333 | YES changed (client only; reference moved to facts) | | none |
| «×» «Κλείσιμο (Esc)» | | intl:548 · natl:336 | YES same | | none |
| Sub intl «Εξαγωγή · W47 · Brand»; natl «Ε-n · ΑΝΟΔΟΣ · Ανεξάρτητη / Veroia Switch» | direction, week number, brand (Petras Group / DPS), national type | intl:550 · natl:292-293 | YES changed (direction only) | brand: small sign in the header when not the default; week: not needed (dates are shown) | slower (brand decides which company's papers) |
| «Ref (…) · #n» | reference + order number | intl:551 | YES changed (reference in facts; number gone) | number small, next to the client name | slower |
| Chip: status word | intl uses «Ανατεθειμένη», catalog «Ανατέθηκε» (two words today) | intl:42-49,461-470 · natl:121-124,297 | YES same (one word, the catalog's) | | none |
| Chip «PRE-ORDER · when» | | intl:471 · pre:68-71 | NO | header sign | slower |
| Chip «Παρτίδα → αποθήκη» | stock lot | intl:472 | NO | header sign | data lost |
| Chip «Ανταλλαγή παλετών» / natl «PE · ΑΝΤΑΛΛΑΓΗ ΠΑΛΕΤΩΝ» | | intl:473 · natl:306 | YES changed («· ανταλλαγή» in the cargo line) | | none |
| Chip «Veroia Switch» / natl «VS» | | intl:474 · natl:305 | YES changed (shown as a route step) | | none |
| Chip «Ομαδοποίηση» / natl «GRP» | | intl:475 · natl:304 | NO in the card | header sign | slower |
| Chip «Προς ανάθεση» / natl «ΠΡΟΣ ΑΝΑΘΕΣΗ», «ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ», «ΑΝΑΘΕΣΗ ΑΓΝΩΣΤΗ», «ΜΕ ΟΧΗΜΑ» | | intl:476 · natl:299-302 | YES changed (dark box «Χωρίς φορτηγό»; other three states not drawn) | dark box variants | data lost («εκτός», «άγνωστη») |
| Chip «Υψηλό ρίσκο» | | intl:477 | NO | header sign | slower |
| natl chip «ΤΙΜΟΛΟΓΗΘΗΚΕ» / «ΧΩΡΙΣ ΤΙΜΟΛΟΓΗΣΗ» | | natl:303 | YES changed (ΤΠΥ fact) | | none |
| natl header button «Επεξεργασία» (O, D) / «Διόρθωση» (A) | | natl:334-335 | YES changed (bottom right; «Διόρθωση» not drawn) | | see 5g |

### 5b. Facts («Στοιχεία»)

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Reference» / «— δεν έχει καταχωρηθεί» | | intl:555 | YES same («Αναφορά πελάτη») | missing-value form | none |
| «Εμπόρευμα» | Goods | intl:556 · natl:345 | YES same (header line) | | none |
| «Θερμοκρασία» value «n °C» or **«CMR»** (temperature as the CMR states) + reefer mode «Συνεχής / Start-Stop / Χωρίς ψύξη» | | intl:482-483,557 · com:135-140 · natl:347 | YES changed («+4°»; no «CMR», no mode) | «CMR» as the value; mode as hover | data lost (an order "κατά CMR" would read as 0° or blank) |
| «Παλέτες» n · Pallet Type | intl: sum of loading stops | intl:484,558 · natl:346 | YES same («18 παλέτες EUR») | | none |
| «Μικτό βάρος» kg | intl only | intl:485,559 | YES changed («9 t») | see section C | none |
| «Ανταλλαγή παλετών»: «Όχι» / «Ναι — Δελτίο 1 & Δελτίο 2 εκκρεμεί» / «Ναι — δελτία καταχωρημένα» | | intl:490-497,560 | YES changed (word «ανταλλαγή» only) | slip state: see 5e | slower |
| «Μεταφορέας» (Carrier Type) when set | | intl:561 | NO | facts, only when set | slower |
| «Τιμή» / piece «στην παρτίδα #n» / «— δεν έχει καταχωρηθεί»; natl: row drawn only when `can('costs')!=='none'` | | intl:562 · natl:348 | YES changed (amount / «χωρίς τιμή») | piece variant; national role variant | data lost |
| «Τιμολογήθηκε»: «Όχι» / «Ναι · ΤΠΥ n · date» / «Ναι · αυτοπαράδοση» / piece «με την παρτίδα #n» | | intl:563-569 · natl:349 | YES changed («ΤΠΥ» number or «–») | date on hover; «Αυτοπαράδοση»; piece variant | data lost |
| natl «Πελάτης», «Κατάσταση» rows | | natl:343-344 | YES changed (header) | | none |
| «— δεν έχει καταχωρηθεί» for every missing fact | missing is said, not blank | intl:479-481 · natl:223 | NO | grey dash with hover | none |

### 5c. Route («Διαδρομή»)

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Intl: route diagram of **every stop**: day, place, city, pallets per stop, done mark; VS order split in «ΕΘΝΙΚΟ ΣΚΕΛΟΣ» + international section, a «Cross-dock · Βέροια» row, an executor per section; national executor unknown here → grey «εκτελεστής: στο Εβδομαδιαίο Εθνικών» | | intl:425-435,498-508,571 · `core/route-diagram-adapters.js:150-176` | YES changed (first loading + «και 2 ακόμη σημεία φόρτωσης», one Veroia step, last delivery) | the collapsed line expands to all stops with pallets per stop | data lost (which stop takes how many pallets, on which day) |
| «Φόρτωση στάσεων…» / «Οι στάσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν…» / «VS χωρίς στάση cross-dock» (red) / «Η διαδρομή δεν σχεδιάστηκε.» | stops load after the card opens | intl:509-515,160,433 | NO | route area states | data lost |
| Old record with no stops: «Φόρτωση» / «Παράδοση» summary text | | intl:516-520 | NO | same two rows | none |
| Natl: rows date · «ΠΑΡΑΛΑΒΗ» / «ΠΑΡΑΔΟΣΗ» · place · total pallets (only with a single delivery) | up to 10 deliveries, one date for all | natl:311-325,351-354 | YES changed (words «Φόρτωση / Παράδοση») | | none |

### 5d. Notes

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Σημειώσεις» (only when present) | | intl:580 · natl:363-366 | YES same («Σημείωση») | | none |

### 5e. Documents and pallet slips

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Έγγραφα»: «Προβολή εγγράφων» or «Κανένα έγγραφο» | intl only; opens a list (file, date · size · source · uploader) with «Προβολή», «Νέο παράθυρο ↗», «Λήψη» | intl:581 · docs:335-345,368-399 | YES changed («Έγγραφα 2») | | none |
| «Επισύναψη εγγράφου» | O, D; pdf / images / doc / eml / msg / txt, 15 MB; failure = persistent banner | docs:341-343,494-525 | NO | inside the documents sheet, or «···» | slower |
| National card: no documents section at all | documents attach to international orders only | natl:330-373 · docs:17-20 | NO (mock-up shows «Έγγραφα 2» on a national order) | hide on national | — (section B) |
| «Δελτία παλετών» (only with pallet exchange): «Δελτίο 1» καταχωρημένο / εκκρεμεί; «Δελτίο 2 (cross-dock)» only with VS; link «Ισοζύγιο παλετών →» | state only; no upload from the card since 7/9 | intl:572-576,3361-3367 | YES changed («···» lists «Δελτία παλετών») | a sign next to «ανταλλαγή» (hover: which slip is missing) + link to the ledger | slower |

### 5f. Assignment

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Intl: «Συνεργάτης» + «Πινακίδες», or «Φορτηγό» + «Οδηγός» (no trailer on the card) | | intl:521-531 | YES changed (plate · trailer / driver; partner without plates) | add partner plates | slower |
| Intl unassigned: «Προς ανάθεση — η ανάθεση γίνεται στο Εβδομαδιαίο Διεθνών» | | intl:532 | YES changed (dark box «Χωρίς φορτηγό · Φορτώνει …») | | none |
| Link «άνοιγμα στο Εβδομαδιαίο Διεθνών →» / natl «άνοιγμα στο Weekly National →» | **always**, also when assigned; plain navigation | intl:578 · natl:361 | YES changed (button only when unassigned) | keep a link on assigned orders too (hover on the vehicle) | slower |
| Natl line: vehicle text, or «Μέσω ομαδοποίησης — το φορτηγό ορίζεται στο groupage», «ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ — δεν έχει εθνικό φορτίο», «ΠΡΟΣ ΑΝΑΘΕΣΗ — στο Εβδομαδιαίο, χωρίς όχημα», «Άγνωστη — …» | | natl:136-150,355-360 | NO (three of four) | dark box variants | data lost |

### 5g. Actions

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Επεξεργασία» | full form; O, D. National after day L: v5 order → toast + jump to the board; old order → form locked to τιμή + σημειώσεις (D), whole form (O) | intl:537 · natl:370,881-897,856 | YES same (button; after-L behaviour not drawn) | | none |
| «Μετατροπή σε παραγγελία» + «Επεξεργασία pre-order» | pre-order only; O, D | intl:535-538 | NO | primary button changes its word on a pre-order | slower |
| «Διπλασιασμός» | intl only, not on a stock piece; new form prefilled, assignment / status / numbers cleared; O, D | intl:539,904-937 | YES changed («Αντίγραφο» in «···») | menu item, intl only | slower |
| «Διαγραφή» | cascade delete with a confirm that names the order in words; O, D see it; a refusal says so and changes nothing. National after day L: nothing is deleted here (toast) | intl:540,4108-4164 · natl:371,1824-1834 | YES same (in «···») | | none |
| «Διόρθωση» → «Διόρθωση παραγγελίας» | A only (replaces «Επεξεργασία»): «Τιμή €», «Αναφορά πελάτη», «Ημ. φόρτωσης», «Ημ. παράδοσης», «Σημειώσεις»; price of an invoiced order editable by O / A; a stock lot's invoiced price locked | intl:543-544,376-381 · natl:335,227-235 · qe:18-50 | NO | same place as «Επεξεργασία», other word | data lost (A has no way to fix a price / date from the card) |
| No actions at all | M, W: card is read-only | intl:443,536-544 · natl:279,367 | NO | card without the bottom bar | none |
| «Ισοζύγιο παλετών →» | navigates | intl:575 | NO | see 5e | slower |

## 6. Keyboard

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Esc | closes the open card and clears the row highlight; not while a form (modal) is open | cat:339-353 | not shown (close «×» drawn) | keep | slower |
| No other page shortcut (no arrows, no Enter on rows, no key for search) | — | — | — | — | none |

## 7. Export / print

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| CSV, 16 columns: ΑΡ., Τύπος, Αναφορά, Κατεύθυνση, Πελάτης, Φόρτωση, Ημ. φόρτωσης, Παράδοση, Ημ. παράδοσης, Παλέτες, Ανάθεση, Κατάσταση, Τιμή, ΤΠΥ, Ημ. ΤΠΥ, Σήμανση | filtered rows; file `paraggelies_<date>.csv`; toast «Το CSV αποθηκεύτηκε» | cat:527-540 · orders-list.js:136-142 | YES changed (inside «Εκτύπωση ▾») | menu item named «CSV» | slower |
| Print, 9 columns: ΑΡ., ΑΝΑΦΟΡΑ (+ direction · tags), ΠΕΛΑΤΗΣ, ΦΟΡΤΩΣΗ, ΠΑΡΑΔΟΣΗ, ΠΑΛ., ΚΑΤΑΣΤΑΣΗ, ΤΙΜΗ €, ΤΙΜΟΛΟΓΙΟ; heading count · period · date | new tab, A4 landscape; no ΑΝΑΘΕΣΗ column | cat:541-554 | button only (paper not drawn for this page) | | none |
| Refused while names load: «Φορτώνουν ακόμη τα ονόματα — δοκίμασε ξανά σε λίγα δευτερόλεπτα» | | cat:526 | NO | disabled menu items until names land | none |
| Pop-up blocked message | | orders-list.js:146-151 | NO | toast | none |

---

## A. Forgotten, must add (most important first)

1. **Order number** `#n` / `Ε-n`: not in the list, not in the card. Card header (small), row hover, search, CSV/print.
2. **Accountant's «Διόρθωση»** in place of «Επεξεργασία», and the **read-only card** for management / warehouse (no bottom bar).
3. **Assignment states** beyond truck / partner / to-assign: red «εκτός» with «Στείλε →», «μέσω ομαδοπ.», unknown «—», finished-without-vehicle «—», «+n» for split v5 orders. In the list tile and in the card's dark box.
4. **Pre-order**: «PRE» pill with urgency, places «—», row/card actions «Μετατροπή (σε παραγγελία)», «Επεξεργασία pre-order», «Διαγραφή»; «Pre-order» as third item of «Νέα παραγγελία ▾».
5. **Invoice forms other than a number**: «Αυτοπαράδοση», invoiced «χωρίς αριθμό», invoice date (hover), piece «με την παρτίδα».
6. **Stock lot / piece**: tags `ΑΠ`, `→ ΑΠΟΘΗΚΗ`; status words «Στην αποθήκη», «Ολοκληρώθηκε», «Τιμολογήθηκε · στην αποθήκη»; price cell «στην παρτίδα #n».
7. **All stops in the card route**, with day and pallets per stop, and who runs each leg of a Veroia Switch order; plus the "stops loading / not loaded" states.
8. **Status «Ακυρώθηκε»** (and «Επιβεβαιώθηκε», «Τιμολογήθηκε») as a row look and filter option; price «—» on cancelled.
9. **Customer reference in the list** (today the main line of a column; mock-up shows it only in the card).
10. **Documents**: paperclip sign on the row; «Επισύναψη εγγράφου» (O, D); «Κανένα έγγραφο» state.
11. **Temperature «CMR»** and reefer mode; **Brand** (Petras Group / DPS) on the card and as the «Μάρκα» filter; «Μεταφορέας»; tags `HR`, «2 σκέλη».
12. **Chip «Χωρίς τιμή»** in the catalog (dispatcher and warehouse have no «Χωρίς τιμή» tab) and the «εκτός N χωρίς τιμή» note on the period value.
13. **Scan type on «Όλες»** (international / national) and the after-day-L path of «Εθνική».
14. **Pallet slip state** (Δελτίο 1 / Δελτίο 2 εκκρεμεί) + «Ισοζύγιο παλετών →».
15. **«Καθαρισμός»**, period choices (6 μήνες / Όλα), sort on every column, KPI counts (Σε μεταφορά, Παραδόθηκαν, Διεθνείς, Εθνικές).
16. **Sidebar counter** on «Παραγγελίες» (owner: unpriced; accountant: ready to invoice); tab counters hidden for the dispatcher.
17. **Partial-failure strips** for this page and the «…» names-loading state.
18. Link to the Weekly board also on **assigned** orders; partner truck plates.

## B. Shown in the mock-up but not true today (NEW — owner decides)

1. **ΤΠΥ «εκκρεμεί»** on a delivered, not invoiced row: no such word or state in the catalog today (cell is «—»).
2. **«Έγγραφα 2»**: the card has no document count today, and a **national** order cannot carry documents at all (mock-up shows it on a national order).
3. **«···» → «Δελτία παλετών»** as an action: removed from the card on 7/9; today only state + link to the ledger.
4. **«···» → «Αντίγραφο» on a national order**: duplicate exists for international only.
5. **Button «Ανάθεση στο Εβδομαδιαίο»**: today a plain link that opens the board (not on the order, not on its week for international); no assignment starts from the card.
6. **National rows with live status** («Σε αναμονή», «Σε μεταφορά», «Παραδόθηκε»): national Status is not written; the catalog prints the raw value or «—».
7. **Truck + driver on a national `GRP` row**: old-model groupage rows read «μέσω ομαδοπ.».
8. **Goods · temperature · weight line on a national order** and **pallet type** there: the national card has no weight and no pallet type today.
9. **«Όλες 380» chip** and the value in the subtitle: same facts, new place (harmless).
10. Generic "no result" panel «3 παραγγελίες ταιριάζουν σε άλλες εβδομάδες · Δείξε τες» (`index.html:550`): today the catalog search widens to all dates by itself, no question asked.
11. One merged card for both types: today two cards with different sections (documents, duplicate, weight, route diagram exist only on the international one).

## C. Wrong business content in the mock-up

1. **«εκκρεμεί» tied to delivery**: since 21/10 every non-cancelled priced order is ready to invoice from registration (`com:874-893`), which is what the tab counter «Προς τιμολόγηση» counts. A word that appears only after «Παραδόθηκε» shows the old rule and disagrees with the counter next to it.
2. **Driver as initial + surname**: the rule in code is the stored full name, because two drivers share a surname (`com:281-287`).
3. **«Αλλαγή φορτηγού»** for the Veroia step: the team's words are «Veroia Switch» / «Cross-dock · Βέροια»; «αλλαγή οχήματος» already names a different function of the national board. The step also hides who runs the national leg.
4. **Veroia date = loading + 1 for every VS order** (`index.html:608`): the locked rule is export = loading + 1, **import = delivery − 1**; the sample has only exports so it looks right.
5. **Status on national rows**: see B6. Related: an international order with empty Status reads «Σε αναμονή», a national one «—» (`cat:46`, an open owner decision noted in code).
6. **Weight in tonnes** («9 t»): stored and shown in kg.
7. **«Αντίγραφο»** vs today's «Διπλασιασμός» (button) — one word needed; **«Σημείωση»** vs «Σημειώσεις»; **«ΤΠΥ»** vs column «ΤΙΜΟΛΟΓΙΟ» (the team's word in cells is already «ΤΠΥ», fine).
8. **Partner line 2 always «συνεργάτης»**: today line 2 is the partner's truck plates; the word is only the fallback.
9. **«Προς τιμολόγηση 39» with «Όλες 380» for an Owner but no sidebar number**: the owner's sidebar number is the unpriced count (10 here).
10. **Temperature «+4°»** has no form for «CMR» orders (no number on purpose).
11. Mock-up places search in the tabs row: that slot belongs to whichever tab is open; search exists only in the catalog (and differs per tab today).
