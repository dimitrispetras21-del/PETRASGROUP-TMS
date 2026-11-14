# Catalog B — daily work and orders

Source: code read only (no app run, no database, deployed Worker not compared with `worker/src`). Line numbers are from the worktree at commit `eac5a928`. Built from four slices; tags: [BROKEN] [MISSING] [EXTRA] [INCONSISTENT] [LOCKED]. Security and role-visibility notes are kept out of this file (see `B-daily-orders-private.md`).

Pages: 1 «Ημερήσιο Πλάνο» · 2 «Πίνακας Ράμπας» · 3 «Παραγγελίες» (hub, catalog, week, invoicing, «Χωρίς τιμή», row tools) · 4 international order form (stops, scan, cascade, Veroia dates) · 5 national order form · 6 prints.

---

## Daily plan — «Ημερήσιο Πλάνο» (`modules/daily_ops.js`, 1909 lines, loaded `app.html:204`)

International ORDERS only. One page, one day at a time, four stacked sections that are a locked owner decision (`daily_ops.js:5-6`, `828-833`).

### 1. Who sees it

| Role | Reaches page | What the module lets them do | Evidence |
|---|---|---|---|
| owner, dispatcher (`planning:full`) | yes | everything: declare loaded / delivered / delayed, change day, ETA, advance, open local-driver panel, convert pre-order | `daily_ops.js:92-96` |
| management, accountant (`planning:view`) | yes | read only. Buttons are still DRAWN; every writer starts with `_opsBlockReadOnly()` → toast «Μόνο ανάγνωση για τον ρόλο σου» | `daily_ops.js:92-96`, callers at `1260, 1282, 1305, 1475, 1497, 1516, 1534, 1567, 1578, 1630, 1687, 1770, 1810, 1874` |
| warehouse (`planning:view`) | yes (sidebar) | page does not load: reference tables (trucks/drivers/clients/partners) answer 403 for this role, `preloadReferenceData` rejects, whole page falls to the error box | `daily_ops.js:141-146`, `core/api.js:1185-1191`, `worker/src/index.js:726-751` (comment `744-746` says so) |

Only other gate: the local-driver («ΤΟΠ.») chip is clickable only for `planning:full` (`daily_ops.js:1177`, `1205-1209`). No `ROLE` / username gates in the file.

Job (inference from code + intent doc): the dispatcher opens it at start of shift, first clears the two red «εκκρεμείς» zones from previous days, then works top to bottom through the four sections during the day, pressing «Φορτώθηκε» / «Παραδόθηκε» as phone calls come in; weekend work is declared on Monday via «Χθες» / date picker (`daily_ops.js:429-434`). Used many times a day. Management reads it as a status board.

### 2. Inventory

#### Top bar (`daily_ops.js:786-815`)

| Element | What it does | Line |
|---|---|---|
| H1 «Ημερήσιο Πλάνο» | title | 787 |
| Sub-line | «<weekday> <d> <mon> · N παραγγελίες σήμερα/αύριο/χθες · **N εκκρεμείς**» + «τοπικές παραδόσεις/φορτώσεις: φόρτωση…» while relays load | 788, 772 |
| Pre-order counter chip | from `preorderCounterHtml`; click jumps to first `.do-pre` row | 789 |
| Day segmented control «Χθες» / «Σήμερα» / «Αύριο» + date input (title «Άλλη ημερομηνία») | sets `OPS.date`, full reload | 790-796 |
| Select «Κατεύθυνση: Όλες» / «Εξαγωγή» / «Εισαγωγή» | client-side filter; option disabled when 0 rows | 797-801, 779-781 |
| Select «Κατάσταση: Όλες» / «Σε αναμονή» / «Ανατεθειμένο» / «Σε μεταφορά» / «Παραδόθηκε» | client-side exact match on DB `Status` | 802-808 |
| Text «Αναζήτηση…» | matches client, truck plate, driver, first loading / unloading location | 809, 463-472 |
| «Καθαρισμός» | only when a filter is set; clears and reloads | 810 |
| «Εκτύπωση» | print window (see Print) | 812 |
| «Ανανέωση» | full reload | 813 |

#### KPI strip (`daily_ops.js:726-728`, `816`)

Two tiles: «ΦΟΡΤΩΣΕΙΣ» and «ΠΑΡΑΔΟΣΕΙΣ», each «x / y δηλωμένες» + thin bar; «καμία σήμερα» when y = 0. Pre-orders excluded from both; stock-lot intakes excluded from deliveries (`718-723`).

#### Overdue zones — today only (`daily_ops.js:745-765`)

| Zone | Title | Row content | Line |
|---|---|---|---|
| Overdue deliveries | «N εκκρεμείς παραδόσεις από προηγούμενες ημέρες» | client · route (first loading → first unloading) · **(plates · driver)** or **(ΣΥΝ. partner · plates)** · «παράδοση d/m · πριν N ημέρες» · action slots | 752-757 |
| Overdue loadings | «N εκκρεμείς φορτώσεις από προηγούμενες ημέρες» + note «δεν φορτώθηκε και δεν μετατέθηκε» | same shape, «φόρτωση d/m · πριν N ημέρες»; pre-order chip; piece sub-line | 758-765 |

Both are collapsible buttons («▲ Απόκρυψη» / «▼ Εμφάνιση», `749`, `835-844`); open by default. Multi-stop rows expand into per-point sub-rows inside the zone (`757`, `765`).

Error strips (red box + «Ξαναδοκίμασε»): overdue-loadings query failed (`773`), local relays failed (`767`).

#### Four sections (`daily_ops.js:819-822`, `852-884`)

«ΦΟΡΤΩΣΕΙΣ ΕΞΑΓΩΓΗΣ», «ΠΑΡΑΔΟΣΕΙΣ ΕΞΑΓΩΓΗΣ», «ΦΟΡΤΩΣΕΙΣ ΕΙΣΑΓΩΓΗΣ», «ΠΑΡΑΔΟΣΕΙΣ ΕΙΣΑΓΩΓΗΣ». Header count «N · M δηλωμένες · K pre-order · J παραλαβές αποθήκης» (`877-879`). Same 8-column grid in all four (one `<colgroup>`, `867`); numbering restarts at 1 per section (`846-851`).

| Col | Export loadings | Import loadings | Deliveries (both) | Line |
|---|---|---|---|---|
| 1 | «#» | «#» | «#» | 866 |
| 2 | «ΠΕΛΑΤΗΣ» (name + «CITY · COUNTRY» sub-line) | same | same | 1090, 409-418 |
| 3 | «ΦΟΡΤΩΣΗ» first loading point; sub-line «(→ first delivery +N)» and piece line «ΑΠ · Np · παρτίδα #n» | «ΦΟΡΤΩΣΗ» | «ΠΑΡΑΔΟΣΗ» (+ tag «→ ΑΠΟΘΗΚΗ» for a stock lot) | 1096-1125, 692 |
| 4 | «ΑΝΑΘΕΣΗ» | same | same | 1149-1161 |
| 5-6 | «ΠΑΛ.» (number or «—») and «ΠΡΟΚ. €» (number input, hidden on partner trips) | «ΩΡΑ» (half-hour select, spans 2) | «ΕΚΤ. ΑΦΙΞΗ» (same select, spans 2) | 863-865, 1078-1082, 1123-1125 |
| 7 | «ΚΑΤΑΣΤΑΣΗ» | same | same | 950-963 |
| 8 | «ΕΝΕΡΓΕΙΕΣ» (right-aligned slots + paperclip) | same | same | 985-1055 |

«ΑΝΑΘΕΣΗ» cell variants (`1149-1161`, `1186-1240`):
- own fleet: «plate / trailer» + driver sub-line, no tag;
- partner: green tag «ΣΥΝ.» + partner name, sub-line plates · driver;
- nothing: red tag «ΠΡΟΣ ΑΝΑΘΕΣΗ»;
- local relay: dark tag «ΤΟΠ.» + local driver · time, sub-line vehicle words + «διεθν. <driver>» / «συν. <partner>»; red «ΤΟΠ. ΠΡΟΣ ΑΝΑΘΕΣΗ» when the relay has no driver; extra red line «διεθν. ΠΡΟΣ ΑΝΑΘΕΣΗ» / «διεθν. χωρίς τράκτορα» when the order itself has no vehicle;
- collapsed group: «ΤΟΠ. x/y · names» (`1230-1240`);
- hover-only copy-plates icon button (`1142-1148`, CSS `578-581`).

«ΚΑΤΑΣΤΑΣΗ» cell (`950-975`, `1108-1110`): bold «Εκκρεμεί» (+ small «μετατέθηκε» if `Postponed To`, + pill «x/y φορτώθηκαν|παραδόθηκαν ▸» for multi-stop) or green «Φορτώθηκε ✓» / «Παραδόθηκε ✓» / «Στην αποθήκη ✓» (+ « από τοπικό <driver>»); stamp line «από <user> · HH:MM» (date added if another day); delay line «**Καθυστέρηση** · <whose>: <reason> — note» (`1743-1748`). Pre-order: chip + notes instead.

«ΕΝΕΡΓΕΙΕΣ» slots (`985-1046`): primary «Φορτώθηκε» / «Παραδόθηκε» / «Παραλαβή αποθήκης»; red text button «Καθυστέρηση» (lot: «Παραλαβή (καθυστέρηση)»); ghost «Αλλαγή ημέρας»; pre-order: only «Μετατροπή»; loose stock piece: text «χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ του Εβδομαδιαίου»; done rows: no slots; future day: only «Αλλαγή ημέρας». Paperclip badge (document count) at far right on every row (`1053-1055`, `1089`).

Row variants:
- Export group summary row (same Group ID, else same truck): «N φορτώσεις» + client list, loading points (or «N σημεία»), pallet sum, pill «x/y φορτώθηκαν ▸», number range «2–4»; click opens indented member rows (`886-936`).
- Multi-stop order: row click or pill opens one sub-row per point: «①…⑨», location, date, pallets, own «Φορτώθηκε» / «Παραδόθηκε» + «Καθυστέρηση», or result «Στην ώρα ✓» / «Καθυστέρηση ✓» + who · when (`1432-1470`).
- Empty section: dashed box «Καμία παραγγελία εξαγωγής για φόρτωση σήμερα» etc. (`880`).

Footer line: «ORDERS · φίλτρο ημέρας dd/mm/yyyy · N εγγραφές + N εκκρεμείς · ενημερώθηκε HH:MM» (`824`).

#### Popovers, dialogs, panels

| Element | Fields / options | Line |
|---|---|---|
| Confirm dialog (`confirmAction`) | «Φορτώθηκε;», «Παραδόθηκε;», «Παραλαβή αποθήκης;», with « από τοπικό <driver>» when a relay exists; «<word> σημείο N;»; «Παραλήφθηκε στην αποθήκη με καθυστέρηση;» | 1023, 1038, 1041, 1248-1251, 1448, 1454 |
| Popover «Αλλαγή ημέρας φόρτωσης / παράδοσης» (440px, anchored to the button) | context line (client · place · pallets · «τώρα d/m»); option buttons «Αύριο» (default), «Μεθαύριο», «Δευτέρα» (only if not a duplicate), «Άλλη…» with date input; checkbox «Μετακίνηση και της παράδοσης» with live hint «Δευ 3/11 → Τρι 4/11 (ίδια απόσταση)» (loadings only); footer «Γράφεται στην παραγγελία · ιστορικό στο audit log», «Άκυρο», «Αλλαγή ↵» | 1629-1669 |
| Popover «Καθυστέρηση φόρτωσης / παράδοσης [· σημείο N]» (560px) | question «Γιατί καθυστέρησε; Η ευθύνη ακολουθεί την αιτία.»; 17 radio reasons in 6 groups («Εμείς», «Πελάτης / αποστολέας», «Παραλήπτης», «Σύνορα / αρχές», «Εξωτερικοί», «Άλλο»); «Σημείωση» text (max 300, «προαιρετική» / «υποχρεωτική για «Άλλο»»); inline error line; «Άκυρο», «Αποθήκευση» | 57-86, 1769-1802 |
| Local-driver panel | `Relay.openPanel` (core/relay.js) hosted in the app modal; Daily Ops only opens it | 1259-1277 |
| Pre-order conversion | `convertPreorder(id)` (modules/preorder.js) | 1516 |

Keyboard: Escape closes either popover (`1609`, `1767`); Enter saves only inside the change-day popover (`1608-1614`); Enter does NOT save the delay panel (by design, `1726-1727`); Enter / Space on the «ΤΟΠ.» chip (`1208`). Click outside closes popovers (`1668`, `1800`).

#### Print (`_opsPrint`, `daily_ops.js:1828-1864`)

`window.open` popup, black-and-white, title + sub-line + the four sections only. Hides buttons, inputs, selects and the «ΕΝΕΡΓΕΙΕΣ» column. Refuses while relays are still loading (toast, `1834`). No CSV / export.

#### Toasts / banners

| Type | Texts | Line |
|---|---|---|
| success | «Φορτώθηκε ✓», «Φορτώθηκε με καθυστέρηση ✓ · <reason>», «Παραδόθηκε ✓», «Στην αποθήκη ✓», «Μετατέθηκε → dd/mm/yyyy», «Σημειώθηκε ως παραδοθείσα» | 1565, 1592, 1716, 1888 |
| info | «x/y — η παραγγελία μένει ως έχει μέχρι να δηλωθούν όλα» | 1493 |
| warn | read-only; «Δεν δηλώθηκε — η σφραγίδα του σημείου αναιρέθηκε· η γραμμή μένει εκκρεμής»; VS-chain notes («…το εθνικό φορτίο ΔΕΝ ακολούθησε την ημέρα Βέροιας…»); «…η ανάθεση συνεργάτη ΔΕΝ ενημερώθηκε»; «Μετατέθηκε … — ΔΕΝ ενημερώθηκαν: …»; relay panel unavailable; print while loading | 94, 1374, 1524-1533, 1551, 1716, 1264, 1834 |
| danger | «Η αποθήκευση απέτυχε — δεν γράφτηκε τίποτα. Ξαναδοκίμασε.»; «Η σφραγίδα φόρτωσης/παράδοσης ΔΕΝ γράφτηκε (χωρίς δικαίωμα)…»; «Καθυστέρηση — καταχωρήθηκε · <reason>»; «Η σφραγίδα γράφτηκε, η παραγγελία ΔΕΝ επιβεβαιώθηκε (σύνδεση) — Ανανέωση πριν ξαναδοκιμάσεις»; «Διάλεξε ημερομηνία»; reason not kept by server (15 s sticky) | 1282, 1510, 1574, 1592, 1380, 1689, 1348 |

### 3. Business logic that must survive

- **Four sections, fixed order** export load → export deliver → import load → import deliver; the page groups by JOB, so one order may appear in two sections and in an overdue zone at once (`daily_ops.js:193-199`, `485-486`).
- **Which day a row belongs to**: loading day / delivery day; a Veroia-Switch export shows on its cross-dock day (`VS CD Date`, else loading + 1) (`149-153`, `474-482`). Split-order parents are hidden, legs shown (`203-224`).
- **Overdue** (today only): delivery date before today and status not Delivered; loading date before today and status Pending / Assigned / empty (`154-159`). A loose stock piece appears only in the loadings zone (`183-200`).
- **Display-only inheritance**: an import with no vehicle shows the matched export's truck / driver / partner; partner plates are fetched separately; neither is written (`226-268`).
- **Screen status has two words per section** («Εκκρεμεί» vs done); DB vocabulary is untouched (`939-963`). «Loaded» = `In Transit` or `Delivered`; «Delivered» = `Delivered`.
- **Declaration = stop stamp first, then order.** Stamp: PATCH ORDER STOPS (`tblaeY5QOHAS1gyE8` → `order_stops`) `Completed At`, `Completed By`, `Performance` (`On Time` / `Delayed`), `Delay Reason`, `Delay Note` in ONE request (`1304-1335`). Then PATCH ORDERS (`tblgHlNmLBH3JTdIM` → `orders`): loaded → `Status='In Transit'` (+ `VS CD Date` = viewed day for a VS export without one, + clears `Postponed To`) (`1534-1565`); delivered → `Status='Delivered'`, `Delivery Performance`, `Actual Delivery Date`, clears `Postponed To` (`1578-1592`, `1874-1888`). No stamp → no order write; order write refused (4xx) → the stamp is rolled back (`1353-1386`).
- **Multi-stop**: the summary button never declares, it opens the points; the order moves only when every point of that kind is declared; aggregate = Delayed if any point Delayed (`1474-1495`). Same for export groups (`886-895`).
- **Retroactive declarations allowed, future days closed**; every write stamps the VIEWED day, not today (`429-438`, `1019`).
- **Delay reasons**: 17 codes / 6 responsibilities pinned to migration 067 by a drift test; «Άλλο» requires a note; responsibility is derived by the database; read-back checks the reason actually stuck (`50-86`, `1341-1352`, `1751-1755`). A stock-lot intake is never asked why (`1032-1041`).
- **Change day**: PATCH ORDERS `Loading DateTime` (and optionally `Delivery DateTime` shifted by the same number of days) or `Delivery DateTime`; `Postponed To` = the new date; then `syncOrderDownstream` (national load / groupage / ramp) is awaited and its failures are named in the toast (`1686-1717`). Options are relative to TODAY, not to the row's old date (`1636-1647`).
- **Side effects after a declaration**: partner assignment status mirror (`paSyncStatus`, `1550`, `1588`); pallet feed `plOnDelivered` (stock-lot intake movement via `/pallets/*`, `core/pallet-feed.js:195-208`); VS chain after stamping the Veroia day (`1558-1564`); the top-bar Undo of a lot intake also removes its pending pallet movement (`1397-1408`).
- **Inline fields**: «ΠΡΟΚ. €» → ORDERS `Advance Paid` on blur; «ΩΡΑ» / «ΕΚΤ. ΑΦΙΞΗ» → ORDERS `ETA` on change (`1078-1082`, `1282`). All three labels exist in the Worker ORDERS map (`worker/src/index.js:1384, 1401`).
- **Relay repaint is held** while a field has focus, a popover is open, a save is in flight or a mouse button is down — a redesign must keep "no repaint under the user's hand" (`324-374`).

### 4. Findings

- [BROKEN] Warehouse role reaches the page from the sidebar but it cannot load: reference tables are 403 for that role and the whole page shows the error box. `core/api.js:1185-1191`, `worker/src/index.js:726-751`, `daily_ops.js:141-146`.
- [BROKEN] Typing in «Αναζήτηση…» redraws the whole page on every keystroke (`oninput` → `_opsSetFilter` → `_opsDraw` replaces `#content`), so the input is destroyed and focus is lost after each character; no focus restore anywhere in the file. `daily_ops.js:809`, `492-496`, `784`.
- [BROKEN] Print loses data: the sheet hides every `input` and `select`, so «ΠΡΟΚ. €», «ΩΡΑ» and «ΕΚΤ. ΑΦΙΞΗ» print as empty columns under their headers; the overdue zones and KPIs are not printed at all (only `.ops-sections` is copied). `daily_ops.js:1829`, `1849`, `1860`.
- [BROKEN] A legacy `Cancelled` order whose date falls on the day is drawn as «Εκκρεμεί» with live «Φορτώθηκε» / «Παραδόθηκε» buttons: the day query has no status condition and the status word / slots only know In Transit and Delivered. (Cancel was removed from the forms, legacy rows remain: `modules/orders_intl.js:4092-4094`.) `daily_ops.js:152`, `950-962`, `1007`.
- [INCONSISTENT] Two status vocabularies on one screen: the filter offers «Σε αναμονή / Ανατεθειμένο / Σε μεταφορά / Παραδόθηκε» (DB statuses) while the column only ever says «Εκκρεμεί» or «Φορτώθηκε ✓ / Παραδόθηκε ✓». `daily_ops.js:804-807` vs `950-962`.
- [INCONSISTENT] One field, two headings: `ETA` is edited under «ΩΡΑ» in import loadings and under «ΕΚΤ. ΑΦΙΞΗ» in both delivery sections; an order that appears in both shows the same value as two different things. Export loadings have no time at all. `daily_ops.js:864-865`, `1124-1125`.
- [INCONSISTENT] The same delivery is written by two paths that differ: the day row awaits the partner-assignment mirror and warns on failure (`1588-1589`); the overdue zone fires `syncOrderDownstream` without awaiting, failure goes to `console.warn` only (`1884-1887`). Overdue path also lacks the `_opsCloseFloat()` call the other writers have (`1866` vs `1568`).
- [INCONSISTENT] Filters apply to the four sections, the KPIs and the header count, but not to the overdue zones or the footer count. `daily_ops.js:444-489`, `752-765`, `824`.
- [INCONSISTENT] Inline saves give no success feedback (ETA, advance: silent on success, toast only on failure) while every button action toasts; the advance input also PATCHes on every blur, changed or not. `daily_ops.js:1082`, `1282`.
- [INCONSISTENT] View-only roles see every action button enabled; the refusal comes only as a toast after the click (the relay chip is the one control that is actually not rendered clickable). `daily_ops.js:92-96`, `1177`.
- [EXTRA] Nine fields are requested on every load and never rendered or read: `Goods`, `Temperature °C`, `Ops Notes`, `CMR Photo Received`, `Client Notified`, `Docs Ready`, `Temp OK`, `Driver Notified`, `Second Card` (kept on purpose so the request stays identical to a recording, `18-21`). `daily_ops.js:22-30`. The dispatcher therefore cannot see goods or temperature on this page.
- [EXTRA] Search reads `Loading Points` / `Delivery Points` as fallbacks, but they are neither in `OPS_FIELDS` nor in the Worker ORDERS map — always undefined. `daily_ops.js:468-469`.
- [MISSING] No time of day anywhere: loading / delivery datetimes are `date` columns, so rows cannot be ordered or read by hour (`1091-1095`); sections are in fetch order.
- [MISSING] No way to undo a declaration from this page (a wrongly pressed «Παραδόθηκε» leaves a row with no buttons, `1008`); only the global top-bar Undo right after the click.
- [LOCKED] Four sections, not one merged time-sorted table. `daily_ops.js:5-6`, `828-833`.
- Not verified: database column types for `eta` / `advance_paid`; whether production Worker equals `worker/src`.

### 5. States the redesign must draw

| State | Today | Line |
|---|---|---|
| Loading | full-page `showLoading('Φόρτωση…')`; then page paints and relays arrive later («…φόρτωση…» in the sub-line) | 109, 772 |
| Whole-page error | red box «Το Ημερήσιο Πλάνο δεν φορτώθηκε — δεν σημαίνει ότι δεν υπάρχουν παραγγελίες σήμερα.» + «Ξαναδοκίμασε» | 135 |
| Partial error | red strip per failed part (overdue loadings, relays), rest of page live | 767, 773 |
| Empty section | header «— καμία σήμερα» + dashed box | 879-880 |
| Empty KPI | «καμία σήμερα», bar 0% | 727 |
| View-only | identical page, toast on click | 92-96 |
| Future day | no declare buttons, only «Αλλαγή ημέρας» | 1019, 1044 |
| Half-filled | delay panel: inline red error, panel stays open (`1816`); change-day with no date: toast «Διάλεξε ημερομηνία» (`1689`) | |
| Half-declared | multi-stop pill «1/3 παραδόθηκαν ▸», amber outline; full = grey | 1411-1419 |
| Many rows | no paging, no virtualisation, no sort control; table min-width 1040px with horizontal scroll; export groups collapse | 558, 882 |
| Unknown value | «—» for missing pallets / location; nothing (not «—») for missing time | 1069, 1091-1097 |

---

## Ramp board — «Πίνακας Ράμπας» (`modules/daily_ramp.js`, 1175 lines, loaded `app.html:175`)

Dock plan of the Veroia warehouse for one day: arrivals, departures, a combined timeline, postponed rows, stock.

### 1. Who sees it

| Role | Reaches page | What the module lets them do | Evidence |
|---|---|---|---|
| owner, dispatcher (`planning:full`) | yes | add row, set time, mark done, postpone, restore; opening the page also CREATES ramp rows (auto-sync) | `daily_ramp.js:36-40`, `95` |
| management, accountant (`planning:view`) | yes | read only; buttons drawn, toast «Μόνο ανάγνωση για τον ρόλο σου» on click; auto-sync skipped | `daily_ramp.js:36-40`, `95` |
| warehouse (`planning:view`) | yes (sidebar) | cannot load: no `ramp` row and no wildcard in the Worker for this role (403), and reference tables are 403 too | `worker/src/index.js:726-751`, `daily_ramp.js:83-89`, `102` |

Only gate: `can('planning')==='full'` (`37`, `95`). Job (inference): someone with a dispatcher login keeps it open during the day (auto-refresh every 2 minutes, `51-79`), sets the hour of each truck, presses «Παρελήφθη» / «Φορτώθηκε» when the dock work is done, and prints the sheet for the warehouse floor.

### 2. Inventory

#### Header and toolbars (`daily_ramp.js:594-634`)

| Element | What it does | Line |
|---|---|---|
| Title «Πίνακας Ράμπας», sub-line «<hard-coded warehouse company name> · dd/mm/yyyy» | | 595-596 |
| «+ Άφιξη» / «+ Αναχώρηση» | open the new-row modal | 598-599 |
| «Εξαγωγή CSV» | downloads `ramp_<date>.csv` | 600, 1074-1108 |
| «Εκτύπωση» | print window | 601, 1110-1153 |
| «Ανανέωση» | full reload | 602 |
| Day buttons «Σήμερα» / «Αύριο» + date input | change `RAMP.date` | 606-609 |
| Refresh note «Ενημερώθηκε HH:MM» | filled only after an automatic refresh | 608, 66-68 |
| Search «Αναζήτηση πελάτη / εμπορεύματος / τόπου…» | client, goods, loading / delivery points, truck | 614, 557-560 |
| Select «Τύπος: Όλα» / «↓ Εισερχόμενα» / «↑ Εξερχόμενα» | | 616-620 |
| Select «Κατάσταση: Όλες» / «Προγραμματισμένο» / «Ολοκληρωμένο» | | 621-625 |
| Select «Κατηγορία: Όλες» / «VF (…)» / «VS (Veroia Switch)» / «VS + Groupage» / «Απευθείας» | | 626-632 |
| Count chip «n / total» | | 633 |
| v5 strip | red «Οι εθνικές κινήσεις v5 δεν διαβάστηκαν — η ράμπα δείχνει μόνο τις υπόλοιπες.» or amber «Η κατάσταση μετάβασης εθνικών (v5) δεν διαβάστηκε…» + «Ξαναδοκίμασε» | 253-260 |

#### KPI row (`daily_ramp.js:635-646`)

«Πρόοδος» (% and done/total), «Εισερχόμενα σήμερα» (+pallets), «Εξερχόμενα σήμερα» (−pallets), «Καθαρό σήμερα», «Σύνολο αποθέματος». Unknown v5 pallets shown as «+;», «−;», «±;» (`572-576`).

#### Tables

| Region | Columns | Line |
|---|---|---|
| «↓ ΕΙΣΕΡΧΟΜΕΝΑ» (left) | «#», «Ώρα» (half-hour select), «Πελάτης» (no category badge, see findings), «Τόπος φόρτωσης», «Εμπόρευμα», «Θερμ.», «Παλέτες», «Φορτηγό», «Ενέργειες» | 650-654, 701-773 |
| «↑ ΕΞΕΡΧΟΜΕΝΑ» (right) | same, with «Τόπος παράδοσης» | 656-660 |
| «ΧΡΟΝΟΔΙΑΓΡΑΜΜΑ — ΟΛΕΣ ΟΙ ΚΙΝΗΣΕΙΣ» | «Ώρα», «Τύπος» (badge «ΕΙΣ» / «ΕΞ»), «Πελάτης», «Τόπος», «Εμπόρευμα», «Θερμ.», «Παλέτες», «Φορτηγό», «Οδηγός», «Κατάσταση» («Προγραμματισμένο», «Αναβλήθηκε», «✓ Ολοκληρώθηκε», v5 variants) — read-only duplicate of the two tables above, sorted by time | 663-666, 776-799 |
| «ΑΝΑΒΛΗΘΗΚΑΝ ΑΠΟ ΣΗΜΕΡΑ» (only when non-empty) | «#», «Τύπος» («↓ ΕΙΣ» / «↑ ΕΞ»), «Πελάτης», «Εμπόρευμα», «Θερμ.», «Παλέτες», «Μεταφέρθηκε στις», «Ενέργειες» («Επαναφορά») | 668-686 |
| «ΑΠΟΘΕΜΑ ΣΤΗΝ ΑΠΟΘΗΚΗ» | «#», «Πελάτης», «Παλέτες», «Παρελήφθη» (mm-dd of oldest), «Ημέρες» («Nd», classes fresh ≤1 / aging ≤3 / old) | 688-697 |

Row actions (`714-721`): «Παρελήφθη» (inbound) or «Φορτώθηκε» (outbound) with confirm «Σήμανση ως …;»; «Αναβολή» with confirm «Αναβολή;»; done row shows «✓ Ολοκληρώθηκε». v5 (national board) rows are read-only: plain time, «v5 · Εβδομαδιαίο Εθνικών» / «v5 · προς ανάθεση» / «✓ Εκτελέστηκε (v5)». Sub-rows «↳ client / location / ref / temp / pallets» for category `VS + Groupage` (`730-762`).

Two table columns («Εμπόρευμα», «Φορτηγό») hide below a CSS breakpoint and the pair stacks to one column (`assets/style.css:3448-3461`).

#### Modal «Νέα άφιξη» / «Νέα αναχώρηση» (`daily_ramp.js:1023-1051`)

Fields: «Ώρα» (free text, placeholder 08:00), «Κατηγορία» (select: warehouse company / `VS Simple` / `VS + Groupage` / `Other`), «Πελάτης» (free text), «Εμπόρευμα», «Θερμοκρασία °C» (text), «Παλέτες» (number), «Φορτηγό» (searchable select), «Οδηγός» (select). Buttons «Άκυρο», «Αποθήκευση». No required fields, no validation.

#### Print / export

- Print (`1110-1153`): copies the whole page HTML into a popup with its own stylesheet (colours read from live tokens); hides `.btn`, the time selects and the day toolbar.
- CSV (`1074-1108`): English header `Type, Time, Status, Client, Goods, Pallets, Temp, Loading Points, Delivery Points, Truck, Driver, Postponed To, Notes`; all loaded rows of the day incl. v5 rows; UTF-8 BOM.

#### Toasts

«Done ✓», «Time saved ✓», «Postponed → yyyy-mm-dd», «Restored ✓», «Added ✓», «CSV exported», «✓» / «—» (`971, 857, 1014, 983, 1069, 1103, 825`); danger «Error» (`973`), «Η ράμπα ολοκληρώθηκε αλλά η παραγγελία ΔΕΝ πέρασε σε μεταφορά» and two siblings (`906, 925, 965`); warn «Η γραμμή v5 αλλάζει μόνο από το Εβδομαδιαίο Εθνικών» (`814`), «Ramp sync: N εγγραφές απέτυχαν — δες Error Log» (`483`), «Ramp auto-refresh disabled (3 failures) — refresh page» (`75`); `reportError('Save failed' / 'Time save failed' / 'Restore failed' / 'Postpone failed' / 'Add failed' / 'Export failed')`. No keyboard shortcuts.

### 3. Business logic that must survive

- **Rows come from three sources**: (a) RAMP rows (`tblT8W5WcuToBQNiY` → `ramp`) for the day; (b) national v5 lines read live from `GET /plan/board?week=` and never stored (`118-125`, `149-180`); (c) rows typed by hand in the modal.
- **Auto-sync creates ramp rows** from ORDER STOPS of the day whose location is the Veroia cross-dock record and whose parent is an international order or a national load (`263-486`). Runs on every board load for `planning:full` roles and, detached, after every order save (`core/order-sync.js:94-103`). Writes `Plan Date`, `Type`, `Status='Planned'`, `Is Veroia Switch`, `Goods`, `Pallets`, `Supplier/Client`, `Notes='STOP:<stop id>'`, `Ramp Category`, `Temperature`, link `Order` or `National Load`, `Truck`, `Driver`, `Loading Points`, `Delivery Points` (`425-459`).
- **Type rule**: Loading at Veroia = «Φόρτωση» (outbound), Unloading = «Παραλαβή» (inbound); Cross-dock: export / ΑΝΟΔΟΣ = outbound, else inbound (`376-387`). `Type` values are Greek strings stored as-is.
- **Category rule**: international parent → `VS + Groupage` / `VS Simple` / warehouse-company category; national-load parent by `Source Type` (`389-406`).
- **Dedup is three keys**: stop id in `Notes`, legacy parent+type+category, and (hand-typed rows only) client+type+pallets (`274-298`, `408-422`). The `STOP:` marker in `Notes` must never be shown (`532-539`).
- **Done**: PATCH RAMP `Status='Done'` (+ `Stock Status='In Stock'` for inbound) (`865-875`). Then: outbound, or inbound non-VS, with an `Order` link → ORDERS `Status='In Transit'` unless already In Transit / Delivered / Cancelled, + partner-assignment mirror (`893-909`); same for a `National Order` link (`910-928`); outbound with a `National Load` link → NATIONAL LOADS `Status='In Transit'` and its source national order (`934-968`). A failed downstream write is said in a red toast and logged; the row stays Done.
- **Postpone** = `Plan Date` + 1 day and `Postponed To` = the ORIGINAL date (marker, despite the name) (`991-1021`); the row then lists under «ΑΝΑΒΛΗΘΗΚΑΝ ΑΠΟ ΣΗΜΕΡΑ» on the original date; «Επαναφορά» puts `Plan Date` back and clears the marker (`976-990`).
- **Time**: stored as UTC ISO built from plan day + chosen local hour (`event_time` is timestamptz); shown as HH:MM (`832-863`).
- **v5 lines are born closed**: every writer refuses an id starting `v5:` (`810-816`); their pallets may be unknown and are shown as such, never 0 (`235-239`).
- **Stock table** = inbound rows with `Status='Done'` and `Stock Status='In Stock'`, grouped by the free-text client string, age from oldest `Plan Date` (`109`, `581-584`, `691-695`).
- **Auto-refresh** every 2 min, skipped while an input has focus or within 10 s of an edit; stops after 3 failures (`48-79`, `805-807`).

### 4. Findings

Known history, as verified in today's code (database counts not queried; production Worker not compared):

- Verified fixed in source: the RAMP table now has a `links` block for `Order`, `National Order`, `National Load`, `Truck`, `Driver` (`worker/src/index.js:1227-1234`); the module reads and writes exactly those labels (`daily_ramp.js:18`, `437`, `444`, `450-451`, `1063-1064`). The module itself issues no `FIND(...)` filter on a RAMP linked field.
- Verified present: «Φορτώθηκε» / «Παρελήφθη» promotes the linked order to `In Transit` (`daily_ramp.js:893-909`). It can only fire for rows that carry an `Order` link, i.e. auto-synced rows; hand-typed rows and v5 lines never promote anything.

Findings:

- [BROKEN] Warehouse role cannot load its own board: the Worker gives this role no `ramp` row and no wildcard, and no trucks / drivers / clients rows either. `worker/src/index.js:726-751`, `daily_ramp.js:83-89`, `102`.
- [BROKEN] New-row modal with a time typed fails to save: `_rampSaveNew` sends the bare «08:00» text as `Time`, while the column is timestamptz — the same defect the inline time select was fixed for (see the comment at `832-835`). `daily_ramp.js:1057` vs `848-851`; column type `tms-auditor/test/fixtures/schema.sql:592`. The field is also free text with no format check (`1032`).
- [BROKEN] Stock only ever grows: inbound Done sets `Stock Status='In Stock'` (`872`); no code in the repo writes any other value (repo-wide grep: only this line writes it), so an outbound «Φορτώθηκε» never takes pallets out of «ΑΠΟΘΕΜΑ ΣΤΗΝ ΑΠΟΘΗΚΗ» or the «Σύνολο αποθέματος» KPI. `daily_ramp.js:109`, `579`, `872`.
- [BROKEN] Search loses focus on every keystroke (`oninput` → `_rampSearch` → `_rampDraw` replaces `#content`). `daily_ramp.js:614`, `1156`, `593`.
- [BROKEN] Auto-sync failures read as "nothing to sync": the ORDER STOPS and parent fetches end in `.catch(()=>[])`, so a failed read silently produces a board with missing rows. `daily_ramp.js:307`, `331`, `335`.
- [BROKEN] Print: the time selects are hidden, so the «Ώρα» column of both main tables prints empty (the hour survives only in the timeline); the filter bar (search box, three selects, count chip) is not hidden and prints. `daily_ramp.js:1140`, `611-634`.
- [BROKEN] Every row that was ever postponed is fetched on every load of every day (`{Postponed To}!=BLANK()` with no date bound, twice: dedup query and main query); the marker is cleared only by «Επαναφορά», not by Done. `daily_ramp.js:100`, `270`.
- [INCONSISTENT] Two writers of "loaded" with different rules: the ramp sets ORDERS `Status='In Transit'` only; Daily Ops also stamps the stop (who / when), clears `Postponed To`, stamps the Veroia day and runs the VS chain. `daily_ramp.js:898` vs `daily_ops.js:1534-1564`.
- [INCONSISTENT] «Παρελήφθη» on an inbound non-VS row (an order UNLOADING at the warehouse) moves the order to `In Transit`, while the same event in Daily Ops is a delivery (`Delivered`). `daily_ramp.js:376-380`, `889-898` vs `daily_ops.js:1581`. Needs an owner ruling before redesign.
- [INCONSISTENT] Category vocabulary differs in three places: auto-sync writes `Direct` for some national loads (`404`), the modal offers `Other` (`1027`), the filter «Απευθείας» matches only rows with NO category (`565`) — so neither `Direct` nor `Other` rows are reachable by any filter option.
- [INCONSISTENT] Language: page is Greek, but toasts, loading text and CSV header are English («Done ✓», «Time saved ✓», «Postponed →», «Restored ✓», «Added ✓», «Loading ramp board…», «Error»). `daily_ramp.js:43, 857, 971, 973, 983, 1014, 1069`.
- [INCONSISTENT] Labels say «σήμερα» whatever day is shown: KPIs «Εισερχόμενα σήμερα» etc., empty states «Καμία άφιξη σήμερα», section «ΑΝΑΒΛΗΘΗΚΑΝ ΑΠΟ ΣΗΜΕΡΑ», confirm «Επαναφορά στο σήμερα;» (which restores to the viewed day). `daily_ramp.js:638-642`, `653`, `669`, `684`.
- [INCONSISTENT] Day navigation differs from Daily Ops: no «Χθες»; `RAMP.date` is fixed to the date the script loaded, so a tab left open overnight opens on yesterday with no button lit. `daily_ramp.js:10`, `606-607` vs `daily_ops.js:428`.
- [INCONSISTENT] A postponed row shows «Αναβλήθηκε» in the timeline on its NEW day while the same row in the table above has normal action buttons. `daily_ramp.js:786` vs `721`.
- [INCONSISTENT] CSV exports all loaded rows, ignoring the on-screen filters, though its comment says "current view … + stock" (no stock is exported). `daily_ramp.js:1073-1077`.
- [INCONSISTENT] View-only roles see «+ Άφιξη», «Παρελήφθη», «Αναβολή», time selects and the empty-state call-to-action enabled; refusal is a toast. For them the auto-sync is skipped, so a day nobody with write rights has opened may show fewer rows. `daily_ramp.js:36-40`, `95`, `653`.
- [EXTRA] `_rampSvF` (generic field save) has no caller in the app, only a test. `daily_ramp.js:817-831`, `1170`.
- [EXTRA] Category badge helper `_rCat` (VF / VS / VS+G) is defined and never called — the category is not visible on any row. `daily_ramp.js:541-547`.
- [EXTRA] VS+Groupage sub-rows read `Stop Client 1..5` etc., which no client code writes (repo grep: only the Worker map); for auto-synced rows the `Notes` fallback is filtered out too, so the sub-rows never render. `daily_ramp.js:730-762`, `21-25`.
- [EXTRA] `f['Temperature °C']` fallbacks (not in `RAMP_FIELDS`, not in the RAMP map) and the `'Invoiced'` status checks (not a status) are dead conditions. `daily_ramp.js:708`, `795`, `1088`, `897`, `914`, `939`, `951`.
- [EXTRA] The timeline repeats every row of the two tables above with two extra columns (driver, status); the page shows each movement twice. `daily_ramp.js:590`, `663-666`.
- [MISSING] No edit or delete for a ramp row from this page (only time, done, postpone); a mistyped hand-made row cannot be corrected or removed here.
- [MISSING] No un-done: a wrong «Παρελήφθη» leaves «✓ Ολοκληρώθηκε» with no action (`720`).
- [MISSING] Postpone is always "+1 day", no date choice (`1000`), unlike Daily Ops' popover.
- Messages name records by client text only; no record codes shown (consistent with the plain-message rule).

### 5. States the redesign must draw

| State | Today | Line |
|---|---|---|
| Loading | `showLoading('Loading ramp board…')` (English) | 43 |
| Whole-page error | red box «Ο Πίνακας Ράμπας δεν φορτώθηκε — δεν σημαίνει ότι δεν υπάρχουν κινήσεις σήμερα.» + «Ξαναδοκίμασε» | 47 |
| Partial error | v5 strip (red / amber) above the KPIs | 253-260 |
| Empty | per table `showEmpty` illustration: «Καμία άφιξη σήμερα» (+ button «+ Άφιξη»), «Καμία αναχώρηση σήμερα», «Καμία κίνηση σήμερα», «Η αποθήκη είναι άδεια»; postponed section simply absent | 653, 659, 666, 696, 668 |
| View-only | same page, toast on click | 36-40 |
| Read-only row | v5 line: text instead of controls | 714-719 |
| Done row | `tr.done`, «✓ Ολοκληρώθηκε» | 720, 766 |
| Half-filled form | saves whatever is filled; an empty form creates a row with only date / type / status | 1055-1069 |
| Unknown pallets | «12+;» / «;» text and «+;» on KPI sums | 235-239, 572-576 |
| Many rows | no paging or collapse; two tables side by side, then the same rows again in the timeline; long text truncated at 25-35 chars with `title` | 707, 680, 768-770 |
| Narrow screen | pair stacks, two columns hidden | `assets/style.css:3460-3461` |
| Background refresh | silent redraw every 2 min; «Ενημερώθηκε HH:MM» | 51-69 |


---

## Παραγγελίες (list / overview side)

One page, route `orders` → `renderOrders()` → `OrdersHub.render()` (`modules/orders_hub.js:240`). Old ids `orders_intl`, `orders_natl`, `invoicing` are presets into it (`core/router.js:265-275`). Create / edit forms and the two order cards (`modules/orders_intl.js`, `modules/orders_natl.js`) are another slice; here they appear only as "the card the row opens".
Legacy `modules/invoicing.js`: **file does not exist** and is not in `app.html` (only `orders_invoicing_view.js` at `app.html:200`, `sw.js:85`); it survives only as a name in comments (`core/router.js:15`, `core/orders-common.js:76,84,775`, `modules/orders_invoicing_view.js:6,252,1141`).

Scripts loaded (all confirmed in `app.html`): `core/tms-week.js:127`, `plain-ref.js:132`, `doc-text.js:135`, `doc-viewer.js:137`, `order-docs.js:138`, `orders-list.js:147`, `orders-common.js:148`, `order-quick-edit.js:149`, hub + views `195-200`.

### Who sees what (all five roles reach the page: sidebar perm `orders`, `core/router.js:43`)

| Role | Tabs visible | Can write here | Lands on | Job (inference) |
|---|---|---|---|---|
| owner | Κατάλογος · Προς τιμολόγηση · Εβδομάδα · Χωρίς τιμή | everything | Κατάλογος | fill missing prices (sidebar badge = unpriced count, `orders_hub.js:192`), weekly money review once a week |
| dispatcher | Κατάλογος · Προς τιμολόγηση (read-only, no counters) | create / edit / delete orders, scan | Κατάλογος | register and look up orders, many times a day |
| management | all four | nothing in these views (`costs:'view'`, `orders:'view'`) | Κατάλογος | read-only review |
| accountant | all four | ΤΠΥ, «Αυτοπαράδοση», price, undo; quick edit «Διόρθωση» | **Προς τιμολόγηση** (`orders_hub.js:36`) | invoice queue daily (sidebar badge = ready count), week table as main working table (`orders_week_view.js:1505`) |
| warehouse | Κατάλογος only | nothing | Κατάλογος | look up an order |

In-module gates (every one found):

| Gate | Where | Effect |
|---|---|---|
| `_role()==='accountant'` | `orders_hub.js:36` | default view = invoicing |
| `can('costs') !== 'none'` | `orders_hub.js:176` | tab counters + sidebar counter only for owner / management / accountant |
| `ROLE` accountant / owner | `orders_hub.js:192` | sidebar counter: accountant = «προς κοπή» all scopes, owner = «χωρίς τιμή», others none |
| `can('orders') === 'full'` | `orders_catalog.js:88,186,311` | «Στείλε →», pre-order «Μετατροπή / Διαγραφή», «+ Νέα παραγγελία ▾», «Σάρωση» |
| `can('orders')!=='none' && can('clients')!=='none'` | `orders_invoicing_view.js:1328` | tab «Προς τιμολόγηση» (hides it from warehouse) |
| `can('costs') === 'full'` (`InvoiceOps.canWrite`) | `orders_invoice_ops.js:89` | every invoicing write, in both «Προς τιμολόγηση» and «Εβδομάδα» |
| `ROLE === 'owner'` | `orders_invoicing_view.js:303,613` | «Επιμερισμός (μόνο owner)» section of a stock lot |
| `can('costs') !== 'none'` | `orders_week_view.js:919,2362` | tab «Εβδομάδα» |
| `can('costs') !== 'none'` | `orders_noprice_view.js:708` | tab «Χωρίς τιμή» |
| `ROLE` owner or accountant (`_canPrice`) | `orders_noprice_view.js:173` | price input column |
| `ROLE` owner / management | `orders_noprice_view.js:214` | reads `/audit` for «Συμπληρώθηκαν σήμερα» |
| `ROLE==='accountant' && can('orders')!=='full'` | `core/order-quick-edit.js:28` | «Διόρθωση» modal |
| `PRICE_ROLES = owner, accountant` | `core/order-quick-edit.js:42-46` | price of an invoiced order editable |
| `ROLE` owner / dispatcher / accountant | `core/orders-common.js:482` | «Κλείσιμο υπολοίπου…» of a stock lot |
| `ROLE === 'warehouse'` | `core/orders-common.js:834` | skips the STOCK LOTS read |

### Hub shell (`modules/orders_hub.js`)

| Region | What it does | file:line |
|---|---|---|
| Title «Παραγγελίες» + subtitle `#ohSub` | subtitle is set by the current view | `:66-67,102` |
| Actions slot `#ohActions` | buttons supplied by the view (CSV, print, new, scan) | `:70,103` |
| Scope segment «Όλες / Διεθνείς / Εθνικές» | filters every view; re-renders body + counters | `:59-60,122-128` |
| View tabs with count badge | «Κατάλογος», «Προς τιμολόγηση» (n ready), «Εβδομάδα», «Χωρίς τιμή» (n, red) | `:61-62,190-191` |
| Tabs-extra slot | week view puts «Ανά ημέρα / Ανά όχημα» there | `:74,104` |
| Body `#ordersBody` | one view at a time; a render token drops late paints | `:90-120` |
| Locations warning strip | «⚠ Οι τοποθεσίες δεν φορτώθηκαν …» above any view | `:110-112` |
| Sidebar counter `.oh-navbadge` | role queue number on the nav item | `:196-202` |
| Remembered scope + view | `localStorage` key per username | `:28-32` |
| `OrdersHub.openOrder(type,id)` | «Άνοιγμα →» from money views: switches to Κατάλογος and opens that card | `:151-162` |

### Catalog «Κατάλογος» (`modules/orders_catalog.js`)

| Item | What it does | file:line |
|---|---|---|
| KPI band: «Σύνολο», «Διεθνείς», «Εθνικές», «Σε μεταφορά», «Παραδόθηκαν» | counts of the scope (not of the text filters) | `:238-245` |
| Hero «Αξία περιόδου» + «εκτός N χωρίς τιμή» | sum of `Price` of non-cancelled rows | `:228-229,246` |
| Chips «Προς ανάθεση», «Εκτός Εβδομαδιαίου» (red), «Χωρίς τιμή» (red) | toggle filters; hidden when count is 0 | `:243,247,496` |
| Search «Αριθμός, αναφορά, πελάτης, τόπος, ΤΠΥ» | substring over number, ref, client, places, goods, ΤΠΥ; a non-empty search silently widens the period to all dates | `:199-203,443-494` |
| Filters: «Κατεύθυνση», «Κατάσταση», «Μάρκα», «Εβδομάδα», period (60 d / 6 m / «Όλα»), «Καθαρισμός» | `Brand` narrows to international; «Καθαρισμός» also widens period to all | `:296-301,495-503` |
| Table, 10 sortable columns: ΑΡ. · ΑΝΑΦΟΡΑ · ΠΕΛΑΤΗΣ · ΦΟΡΤΩΣΗ · ΠΑΡΑΔΟΣΗ · ΠΑΛ. · ΑΝΑΘΕΣΗ · ΚΑΤΑΣΤΑΣΗ · ΤΙΜΗ € · ΤΙΜΟΛΟΓΙΟ | fixed widths for 1440; virtual scroll, row 46px; 3-state sort | `:143-158,262-279,504-508` |
| Row tags: `ΑΠ`, `→ ΑΠΟΘΗΚΗ`, `VS`, `GRP`, `PE`, `HR`, «2 σκέλη» | under the reference, with direction word | `:128-137,165-181` |
| Legend line above table | explains `#`, `Ε-`, tags, «✓ ΤΠΥ» | `:268-271` |
| Paperclip next to number | international only; opens document viewer | `:180`, `core/orders-common.js:249` |
| Pre-order row | status pill; «Μετατροπή» / «Διαγραφή» in the ΑΝΑΘΕΣΗ cell | `:169,186-187` |
| ΑΝΑΘΕΣΗ cell | plate · trailer / driver, partner / plates, «— προς ανάθεση», «μέσω ομαδοπ.», red «εκτός» + «Στείλε →» | `core/orders-common.js:260-319` |
| ΤΙΜΟΛΟΓΙΟ cell | «✓ ΤΠΥ n», «✓ Αυτοπαράδοση», «✓ χωρίς αριθμό», «—» | `core/orders-common.js:213-222` |
| Row click → order card | right panel `#intlDetail` / `#natlDetail` (~480px), the type's own card | `:303-306,426-435` |
| «+ Νέα παραγγελία ▾» menu: «Διεθνής», «Εθνική», «Pre-order» | opens the forms | `:313-321,515-520` |
| «Σάρωση» (1 per scope; 2 on «Όλες») | scan → order | `:329-334` |
| «CSV» | 16 columns, filtered rows, file `paraggelies_<date>.csv` | `:527-540` |
| «Εκτύπωση» | popup window, A4 landscape, 9 columns, auto `window.print()` | `:541-554` |
| Esc | closes the open card (not while a modal is open) | `:341-353` |
| Warning strips `#ocWarns` | one per failed loader / late name warnings | `:365-366,389,401` |
| Toast | «Φορτώνουν ακόμη τα ονόματα — δοκίμασε ξανά …» (warn) on CSV/print too early | `:526` |

### Week «Εβδομάδα» (`modules/orders_week_view.js`)

| Item | What it does | file:line |
|---|---|---|
| Subtitle | week in words («3 – 9 Οκτωβρίου») | `:671,922` |
| Actions «Εκτύπωση», «CSV» | see below | `:923-927` |
| «Ανά ημέρα / Ανά όχημα» | grouping of international rows (hidden on scope Εθνικές) | `:925,950-959` |
| Failure strips (one per failed read, red dot, «Ξαναδοκιμή») | 12 possible texts; grey info strip for undated orders with «Προς τιμολόγηση →» | `:977-1003` |
| Week strip ‹ 5 weeks › | 3 back, 1 ahead; each cell: date range + turnover · status word («N προς κοπή», «όλα τιμολογημένα», «N μπλοκ», «χωρίς παραγγελίες») | `:62,127,431-436,1032-1037,1152` |
| Summary line «Ατιμολόγητες N · €» | + «N προς κοπή €», «N χωρίς τιμή → owner», «παλαιότερη εκκρεμής N ημέρες», link «Προς τιμολόγηση →» | `:1045-1053` |
| Section «Διεθνείς» | mirrored row per round trip: `RT` · ΕΞΑΓΩΓΗ (ΔΙΑΔΡΟΜΗ, ΠΕΛΑΤΗΣ, ΤΠΥ, ΠΟΣΟ €) ‖ ΑΝΑΘΕΣΗ (ΟΧΗΜΑ, Σ RT €) ‖ ΕΙΣΑΓΩΓΗ mirrored | `:1099-1100,1332-1340,1405-1438` |
| Day headers | per day, «… · καμία κίνηση», «ΜΕΤΑΦΕΡΘΗΚΕ ΣΕ ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ», «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ», «ΧΩΡΙΣ RT» | `:1080-1092` |
| RT cell tags | «χωρίς RT», «από d/m» (guest), «μεταφορά», «συνεργάτης», «groupage» | `:1428-1429` |
| Empty side words | «Χωρίς εξαγωγή», «Χωρίς εισαγωγή», «Κενό γύρισμα», «Άνοδος/Κάθοδος εθνικών» | `:1412-1426` |
| Order line | Weekly line number box, route with `+N` stops, dates, client, number · reference · VS, paperclip, ΤΠΥ word, amount | `:1345-1384` |
| Amount variants (grey) | «ακυρωμένη», «στην παρτίδα #n», «αρχική εκτός ανάγνωσης», «στο <RT>», other-week amount + «εβδ. d/m», «—» unpriced | `:1368-1374` |
| ΑΝΑΘΕΣΗ cell | plate + driver / partner; verdict under it («τιμολογημένο», «προς κοπή», «k από n παραγγ. · ατιμολόγητα €», «τιμή → owner/λογιστήριο»); Σ with `*` / `†` | `:224-232,1387-1403` |
| Section «Εθνικές» | ΗΜΕΡΑ · ΚΑΘΟΔΟΣ ‖ ΑΝΑΘΕΣΗ ‖ ΑΝΟΔΟΣ, paired by `Matched Load` or v5 board | `:1105-1116,1440-1473` |
| «Κατάσταση εβδομάδας» | table ΤΖΙΡΟΣ € / ΤΙΜΟΛΟΓΗΜΕΝΑ € / ΑΤΙΜΟΛΟΓΗΤΑ € × Διεθνή, Εθνικά, Σύνολο; % vs previous week; footnotes `*` `†` | `:1119-1139,1316-1329` |
| Inline invoicing editor `#owvEd` | click (or Enter/Space) on an order's ΤΠΥ or ΠΟΣΟ cell → box under the line: ΤΠΥ number + date, «Αυτοπαράδοση», price, «Αναίρεση τιμολόγησης»; Enter saves, Esc closes | `:1156-1168,1516-1519,1547-1596,1655-1691` |
| Click on a line → order card over the board | same cards as Κατάλογος, floating right; gets an extra section «Τιμολόγηση» (same editor) and, from an RT row, the RT route | `:1801-1878,1880-1888` |
| Click on ΑΝΑΘΕΣΗ → «Έγγραφα ανάθεσης» overlay | `print.html?…&noprint=1` in one iframe per sheet («Φύλλο Οδηγού» / «Φύλλο Συνεργάτη», group packet); v5 national: `srcdoc` driver sheet with its own «Εκτύπωση» | `:2050-2129` |
| Esc | closes documents first, then editor, then card | `:1683-1691,2137-2140` |
| «Εκτύπωση» | «Εβδομάδα τιμολόγησης», A4 portrait, in-page print layer `#owvPrint` + `window.print()`; refuses to print while any read failed | `:2197-2332` |
| «CSV» | 14 columns, one line per order, «Μετρά εδώ» ναι/όχι, file `orders_week_<week>.csv` | `:2334-2355` |
| Toasts | «Η εβδομάδα δεν έχει φορτώσει ακόμη …», «Η εκτύπωση δεν βγήκε: …», «Καμία παραγγελία για εξαγωγή …», write refusal when the editor is gone | `:1706,2319,2324,2353` |

Not read line by line (described from their header comments only): pairing / numbering internals `:258-660`, text-fitting `:1192-1315`, RT route in the card `:1910-2011`.

### Invoicing «Προς τιμολόγηση» (`modules/orders_invoicing_view.js` + `orders_invoice_ops.js`)

| Item | What it does | file:line |
|---|---|---|
| Subtitle | «Ανά πελάτη, από την καταχώρηση · εβδομάδα όπως στο Weekly …» | `:348` |
| Actions «Φύλλο ERP (CSV)», «Εκτύπωση» | CSV `fyllo-erp_<week>_<tab>.csv` (self deliveries left out); popup A4 landscape | `:350-351,1131-1173` |
| Banners (role=alert) | nationals failed, v5 state failed, pallet gate failed, client ERP data failed, stock lots failed | `:396-406` |
| Week strip ‹ 5 weeks › + «Όλες οι ανοιχτές · N» | cell word: «N προς κοπή», «σε εξέλιξη», «N ανοιχτές», «κλειστή», «—» | `:149-157,446-461` |
| KPI band | «Προς κοπή» (hero €), «Διεθνείς», «Εθνικές», «Τιμολογημένες», «Παλαιότερη εκκρεμής» | `:463-473` |
| Sub-tabs with counts | «Προς κοπή», «Μπλοκαρισμένες», «Τιμολογημένες», «Όλες» | `:475-479` |
| Search «Πελάτης, αριθμός, τόπος, πινακίδα, ΤΠΥ» | accent- and case-insensitive, 120 ms debounce | `:40,170-173,413,1114` |
| Table grouped by client | group header: client, ΑΦΜ, «όροι N ημ.», count · sum (+ «N χωρίς τιμή»); 7 columns ΑΡ. · ΑΝΑΦΟΡΑ · ΦΟΡΤΩΣΗ · ΠΑΡΑΔΟΣΗ · ΠΑΛ. · ΤΙΜΗ € · ΚΑΤΑΣΤΑΣΗ | `:416-419,501-531` |
| Footer | «N προς κοπή · N πελάτες · Enter καταχωρεί και ανοίγει την επόμενη» + «Σύνολο €» | `:533-538` |
| Card (right, auto-opens on first ready row) | header (number · ref, client · direction, status dots); sections «Στοιχεία για το ERP» (+ «Αντιγραφή όλων»), «Παραγγελία» (+ «Άνοιγμα →»), «Έλεγχοι» (✓ / ✗ / –), lot «Κομμάτια», «Επιμερισμός (μόνο owner)», action block | `:700-789` |
| Action block, state ready | «Καταχώριση τιμολογίου ERP»: «Αριθμός (ΤΠΥ)», «Ημερομηνία» (max today), live hints, «Αυτοπαράδοση» checkbox, «Καταχώριση Enter», «Επόμενη …» | `:813-828` |
| Action block, state invoiced | «Διόρθωση ΤΠΥ», «Διόρθωση τιμής», «Αναίρεση τιμολόγησης» | `:793-802,840-853` |
| Action block, state blocked | price box «Τιμή €» with last-price hint, «Καταχώριση τιμής», «Αυτοπαράδοση» | `:855-870` |
| Stock lot controls | «Κλείσιμο υπολοίπου…» (modal), «Άνοιγμα ξανά» (confirm) | `:556-574,662-694` |
| Undo bar (10 s countdown) | «Καταχωρήθηκε ΤΠΥ n» / «… ως αυτοπαράδοση» + «Αναίρεση» | `:1081-1098` |
| Confirm dialogs | duplicate ΤΠΥ on another client, ΤΠΥ correction, undo, price of an invoiced order | `orders_invoice_ops.js:155-177` |
| Toasts | undo done (warn), ΤΠΥ corrected, price saved, copied / copy refused, empty list on export / print, lot reopened | `:690,999,1041,1076,1125-1126,1134-1146` |

### «Χωρίς τιμή» (`modules/orders_noprice_view.js`)

| Item | What it does | file:line |
|---|---|---|
| Subtitle (two variants: can price / cannot) | | `:238-240` |
| Actions «Εκτύπωση» (primary for non-writers), «CSV» | A4 portrait sheet with an empty price box + note line per order and a sign-off block; CSV 17 columns | `:249-251,532-633` |
| Banners | national loads / v5 state / nationals failed | `:343-346,431` |
| KPI band | «Εκκρεμούν», «Παλαιότερη», «Πελάτες», «Συμπληρώθηκαν σήμερα» + a help sentence | `:352-361` |
| Table grouped by client (ΑΦΜ · όροι) | ΑΡ. · ΑΝΑΦΟΡΑ · ΦΟΡΤΩΣΗ · ΠΑΡΑΔΟΣΗ · ΗΜΕΡΟΜΗΝΙΕΣ · ΑΝΑΘΕΣΗ · ΠΑΛ. · ΕΙΔΟΣ · ΜΕΡΕΣ · ΤΕΛΕΥΤ. ΤΙΜΗ · [ΤΙΜΗ € input] · «Άνοιγμα →» | `:363-395` |
| Price input | Enter saves one row; message under the box («Αποθήκευση…», error); focus jumps to next empty box | `:376-381,452-522` |
| Red row | waiting more than 10 days since delivery | `:26,299,382` |
| Section «Συμπληρώθηκαν σήμερα» | price · who · time · where it went; from `/audit` for owner / management, from this browser tab only for the accountant | `:310-327,410-439` |
| Footer legend + small notes | sort rule, red row rule, what «τελευταία τιμή» means | `:440-441` |
| Toast | «Η τιμή καταχωρήθηκε — η παραγγελία … πέρασε στα Προς τιμολόγηση» | `:488` |

### Shared row tools

| Tool | What it does | file:line |
|---|---|---|
| Quick edit «Διόρθωση παραγγελίας» (modal) | accountant only; fields «Τιμή €», «Αναφορά πελάτη», «Ημ. φόρτωσης», «Ημ. παράδοσης», «Σημειώσεις»; sends only changed fields in one PATCH; opened from the cards (`orders_intl.js:380`, `orders_natl.js:231`) | `core/order-quick-edit.js:18-24,52-70,85-119` |
| Paperclip badge | one order, or a count for several; never on nationals | `core/order-docs.js:281-326`, `core/orders-common.js:249-259` |
| «Έγγραφα παραγγελίας» modal | list: filename, date · size · source · uploader; «Προβολή» (inline), «Νέο παράθυρο ↗» (PDF / images), «Λήψη» | `core/order-docs.js:368-424` |
| Inline viewer | PDF → canvases, image → `<img>`, .doc / .docx → plain text, others → download only | `core/doc-viewer.js:17-24,33-41,80-128` |
| «Επισύναψη εγγράφου» | hidden file input; accepts pdf, jpg, png, doc, docx, eml, msg, txt; 15 MB; sha256 dedupe | `core/order-docs.js:26-38,188-212,494-525` |
| Upload-failed banner (persistent, stacked, «Ξαναδοκίμασε») | never a fading toast | `core/order-docs.js:536-575` |
| `OrdersList` | sort, table shell, virtual scroll, CSV download (toast «Το CSV αποθηκεύτηκε»), print popup (toast when popup blocked) | `core/orders-list.js:82-151` |
| `PlainRef` | the one wording of an order / a trip in messages | `core/plain-ref.js:65-131` |

### Business logic that must survive

- **One week definition**: Saturday → Friday, `TmsWeek.startOfDate` (`core/tms-week.js:41-54`). An order's week = week where the Weekly shows it: export by delivery, import by loading, national by loading, and an explicit `Plan Week Start` wins (`core/orders-common.js:41-52`). Labels are date ranges, never W-numbers (`:53-61`).
- **One invoicing state per order** (`OrdersData.stateOf`, `core/orders-common.js:886-893`): `invoiced` · `cancelled` · `blocked` (only reason: no price > 0) · `ready`. Every non-cancelled order is «προς κοπή» from registration; delivery, stock pieces and pallet slips do not block. A missing pallet slip is only a red check on the card.
- **0 € = no price** everywhere (`core/orders-common.js:66-69`); shown «—» / «χωρίς τιμή», never summed.
- **Counters = lists**: tab badges, sidebar badge, «Προς τιμολόγηση», «Χωρίς τιμή» and week states all read the one cached set (60 s) `OrdersData.loadInvoicingSet` (`core/orders-common.js:762-796`); split legs and stock pieces are dropped there (`:780-784,822`).
- **Invoicing writes** (one copy, `orders_invoice_ops.js`): PATCH on facade `tblgHlNmLBH3JTdIM` → `orders` or `tblGHCCsTMqAy4KR2` → `national_orders` (`:90`). Mark: `Invoiced`, `Invoice Number`, `Invoice Date` (`:58`); self delivery: + `Self Delivery`, number null (`:63`); undo: `Invoiced` false, number / date null (`:69`); ΤΠΥ fix: number + date (`:71`); price: `Price` (`:128`). Never `Status`.
- **Proof of write = the record the Worker returns**, not the 200 (`orders_invoice_ops.js:96-134`, `orders_noprice_view.js:469-480`); an offline stand-in is a failure.
- **ΤΠΥ rules**: typed every time, never pre-filled, never bulk; date ≤ today (`orders_invoice_ops.js:42-46`); same number on another client asks first, on the same client is normal (`:27-37`).
- **Week money rules** (`orders_week_view.js:14-38`): turnover = `Price`, net, no costs or margins; an order counts in exactly one week and one row; other-week legs are grey with «εβδ. d/m» and marked `*`; unpriced marked `†`; old national orders of Type «Veroia Switch» never counted.
- **Week row day and number** follow the Weekly International board (`WI4.rowDt`, `WI4.weekBoard`) (`orders_week_view.js:104-111,2016-2036`); national numbers follow the Weekly National v5 board.
- **Week print never prints half numbers**: refused while any failure strip is on screen (`orders_week_view.js:2204,2324`).
- **Catalog status words are display only**; a stock lot reads «Στην αποθήκη» / «Ολοκληρώθηκε» / «Τιμολογήθηκε · …» (`orders_catalog.js:65-74`); national empty Status stays «—», international empty = Pending (`:46`).
- **Search always covers all dates** (`orders_catalog.js:436-448`).

### Invoicing permission check (verified in code, not in the database)

- Worker `PERMISSIONS.accountant` now has `orders: ["GET","PATCH"]` and `national_orders: ["GET","PATCH"]` (`worker/src/index.js:613,617`). The 0/89 cause recorded in CLAUDE.md (no `orders` row → wildcard GET) is no longer in the source.
- Labels the view writes are all in the Worker map for both tables: `Invoiced`, `"Invoice Number"`, `"Invoice Date"`, `"Self Delivery"` (`worker/src/index.js:1402,1417,1431,1436` and `1709-1714`).
- After the national transition the accountant keeps exactly `Invoiced`, `Invoice Number`, `Invoice Date`, `Price`, `Self Delivery` on `national_orders` (`worker/src/index.js:6187`); these are the labels `InvoiceOps` sends.
- Server rule `invoiceMarkError`: no invoiced without ΤΠΥ and price > 0, unless self delivery (`worker/src/index.js:3277-3297`).
- Not verified: the deployed Worker, and how many rows have `invoiced = true` today (no database access in this task).

### Findings

| # | Tag | Finding | Evidence |
|---|---|---|---|
| 1 | [INCONSISTENT] | Two week strips with different shape and no shared state: «Εβδομάδα» (3 back / 1 ahead, opens on last complete week, shows €) vs «Προς τιμολόγηση» (5 weeks ending at current, opens on latest week with ready orders, plus «Όλες οι ανοιχτές»). Switching tab loses the chosen week. | `orders_week_view.js:62,127,683-687` · `orders_invoicing_view.js:136-147,363-366` |
| 2 | [INCONSISTENT] | The same set (no price) has three homes and four words: hub tab «Χωρίς τιμή», sub-tab «Μπλοκαρισμένες», strip word «N μπλοκ», CSV «μπλοκαρισμένη: τιμή → owner/λογιστήριο». Since price is the only block, «Μπλοκαρισμένες» = «Χωρίς τιμή». | `orders_invoicing_view.js:477` · `orders_week_view.js:435,2338` · `orders_noprice_view.js:706` · `core/orders-common.js:890` |
| 3 | [INCONSISTENT] | Who unblocks a price: summary line says «χωρίς τιμή → owner», verdict says «τιμή → owner/λογιστήριο»; the no-price print sheet says «Για συμπλήρωση από τον owner» although the accountant types prices herself. | `orders_week_view.js:66,1047` · `orders_noprice_view.js:173,598` |
| 4 | [INCONSISTENT] | Stale wording after "invoiced from registration": empty states and subtitle still say «παραδομένες». | `orders_invoicing_view.js:506-507` · `orders_noprice_view.js:240,400` |
| 5 | [INCONSISTENT] | Two assignment formatters: `OrdersCommon.assignOf` (truck · trailer on top, driver below, «— προς ανάθεση») vs week `vehicleOf` (plate + driver, no trailer, «Προς ανάθεση»). | `core/orders-common.js:260-319` · `orders_week_view.js:692-717` |
| 6 | [INCONSISTENT] | Three search behaviours: catalog is accent-sensitive, invoicing folds accents, «Χωρίς τιμή» and «Εβδομάδα» have no search. | `orders_catalog.js:199-203` · `orders_invoicing_view.js:40,170` |
| 7 | [INCONSISTENT] | Four print mechanisms and looks: catalog / invoicing / no-price open a popup window with their own inline CSS (no-price also loads web fonts), week prints an in-page layer, assignment papers are `print.html` iframes. | `orders_catalog.js:547` · `orders_invoicing_view.js:1162` · `orders_noprice_view.js:564-613` · `orders_week_view.js:2317-2332,2100` |
| 8 | [INCONSISTENT] | Price write duplicated: «Χωρίς τιμή» has its own copy of the PATCH + read-back that `InvoiceOps.writePrice` also implements ("ONE copy" file). Write permission also asked two ways (`ROLE` list vs `can('costs')==='full'`). | `orders_noprice_view.js:173,469-480` · `orders_invoice_ops.js:89,127-134` |
| 9 | [INCONSISTENT] | Quick edit accepts price `0` and an emptied price (sent as null); every other screen requires > 0. | `core/order-quick-edit.js:80,89` vs `orders_noprice_view.js:465` |
| 10 | [INCONSISTENT] | Quick edit shows date-only inputs for `Loading DateTime` / `Delivery DateTime` and sends `YYYY-MM-DD`; effect on the stored time of day not verified. | `core/order-quick-edit.js:21-22,31-32,80` |
| 11 | [BROKEN] | Upload-failed banner from «Επισύναψη εγγράφου» names the order as `#` + last 6 characters of the record id (no label passed) — breaks the plain-message rule and names nothing a user can look up. | `core/order-docs.js:521,540` |
| 12 | [BROKEN] | Multi-order document viewer heads a section «Παραγγελία <record id>» when no label was carried. | `core/order-docs.js:421` |
| 13 | [INCONSISTENT] | A staff first name is hard-coded in UI strings and on the printed sheet (card status / check line, section caption, sign-off block), while other strings say «λογιστήριο». | `orders_invoicing_view.js:728,757` · `orders_noprice_view.js:436,607,609` |
| 14 | [MISSING] | National orders cannot carry documents (schema links documents to `orders` only); no paperclip, save shows «Η φύλαξη εγγράφου για εθνικές δεν υποστηρίζεται ακόμη». | `core/order-docs.js:17-20,808` · `core/orders-common.js:250` |
| 15 | [MISSING] | A document cannot be deleted or renamed; no document kind (order vs CMR), only the filename tells them apart. | `core/order-docs.js:15,582-584` |
| 16 | [MISSING] | «Συμπληρώθηκαν σήμερα» is incomplete for the accountant (only what this browser tab saved; `/audit` is closed to her); shown as «—» with a tooltip. | `orders_noprice_view.js:214,339,357-359,426-428` |
| 17 | [MISSING] | Catalog print has no ΑΝΑΘΕΣΗ column although screen and CSV have it. | `orders_catalog.js:533,552` |
| 18 | [EXTRA] | Status `Confirmed` («Επιβεβαιώθηκε») is offered in the catalog filter; no writer of it found in `modules/` or `core/` (only `orders_catalog.js:37` and a badge colour in `core/constants.js:130`). Not in the locked vocabulary. Database not checked. | `orders_catalog.js:37,297` |
| 19 | [EXTRA] | `Status === 'Invoiced'` is still read as "invoiced" and mapped in the catalog; per the code's own note a CHECK refuses that status. Database not checked. | `core/orders-common.js:77,317` · `orders_catalog.js:40` · `orders_invoice_ops.js:56-57` |
| 20 | [EXTRA] | Viewer fallback "while core/doc-viewer.js is still a placeholder" cannot run: `DocViewer.render` is defined and loaded before `order-docs.js`. | `core/order-docs.js:433-443` · `core/doc-viewer.js:140` · `app.html:137-138` |
| 21 | [EXTRA] | Comments still point at the removed `modules/invoicing.js` as if it were a live reference. | `orders_invoicing_view.js:6,252,1141` · `core/router.js:15` |
| 22 | [INCONSISTENT] | Card layouts differ per view: catalog pushes the table (card inside the layout), week floats the same card over the board, invoicing has a different card of its own; the week view also injects a «Τιμολόγηση» section into the borrowed card. | `orders_catalog.js:303-306` · `orders_week_view.js:1835,1801-1813` · `orders_invoicing_view.js:424,700` |
| 23 | [BROKEN] | Week CSV exports a v5 national row's vehicle as «Προς ανάθεση»: only `assign.kind === 'load'` is passed, anything else goes in as null and `vehicleOf(null)` answers «Προς ανάθεση»; screen and print show the real truck. | `orders_week_view.js:2351,693` vs `:2269-2270` |
| 24 | [LOCKED] | TMS never issues invoices: the view only records the ERP number; «Αναίρεση» says the ERP invoice is not cancelled from here. | `orders_invoice_ops.js:163,175` |
| 25 | [LOCKED] | Invoiced is a checkbox, never a Status; writes send no `Status`. | `orders_invoice_ops.js:56-58` |
| 26 | [LOCKED] | Dispatcher sees ΤΙΜΗ € in the catalog but not «Εβδομάδα» / «Χωρίς τιμή». | `orders_catalog.js:156` · `orders_week_view.js:2360-2362` |
| 27 | [LOCKED] | Old national orders of Type «Veroia Switch» shown but never invoiced or summed. | `orders_week_view.js:85,1372` |
| 28 | [LOCKED] | Messages name an order in words through `PlainRef` (toasts, confirms). Row cells, card titles and footnotes still show `#n` / `Ε-n` as identifiers, which the rule allows. | `orders_invoice_ops.js:137-149` · `orders_noprice_view.js:486` |

### States the redesign must draw

| State | Today | file:line |
|---|---|---|
| Loading (page / view) | `showLoading('Φόρτωση…')`; week: «Φόρτωση εβδομάδας…»; lot pieces «Φόρτωση κομματιών…»; docs modal «Φόρτωση…» | `orders_hub.js:98` · `orders_week_view.js:2167` · `orders_invoicing_view.js:579` · `core/order-docs.js:387` |
| Names still loading | cells show «…» (never «—»), CSV / print refused with a toast | `orders_catalog.js:110-115,526` |
| Whole view failed | `showError('Η σελίδα δεν φορτώθηκε. Δεν σημαίνει ότι λείπουν δεδομένα …')` | `orders_hub.js:113-118` · `orders_week_view.js:2168-2173` |
| Partial failure | yellow strips (catalog, hub), `role=alert` banners (invoicing, no-price), white strips with red dot + «Ξαναδοκιμή» (week); affected cells print «—», never 0 | `orders_catalog.js:365-366,423` · `orders_invoicing_view.js:396-406` · `orders_week_view.js:977-1003` |
| Empty | catalog: `showEmpty` with «Καθαρισμός φίλτρων»; invoicing: one grey table row per tab; week: «καμία κίνηση» per day, «Καμία εθνική παραγγελία αυτή την εβδομάδα.», note under the statement; no-price: one row | `orders_catalog.js:252-260` · `orders_invoicing_view.js:504-508` · `orders_week_view.js:1082,1108,1138` · `orders_noprice_view.js:398-400` |
| View-only role | controls simply absent: no new / scan (catalog), no form in the invoicing card (blocked order shows a note «Χωρίς τιμή. Χωρίς τιμή δεν καταχωρείται τιμολόγιο.»), no input column (no-price), week cells not clickable | `orders_catalog.js:311,331` · `orders_invoicing_view.js:813,862` · `orders_noprice_view.js:363,376` · `orders_week_view.js:1516-1519` |
| No permission for a tab | tab not rendered; a remembered hidden view falls back to the default | `orders_hub.js:39,52-53` |
| Half-filled / refused form | typed ΤΠΥ and price kept across a refusal and across repaints; error text inside the card / under the line; «Καταχώριση» disabled until number + valid date; busy label «Καταχώριση…» / «Αποθήκευση…» | `orders_invoicing_view.js:292-293,812,885,919,927-929` · `orders_week_view.js:1616-1622,1695-1708` · `orders_noprice_view.js:467,490-497` |
| After success | invoicing: next ready order of the same client selected + 10 s undo bar; no-price: row moves to «Συμπληρώθηκαν σήμερα», focus to next box; week: line repaints, editor moves from price to ΤΠΥ | `orders_invoicing_view.js:935-940,1081` · `orders_noprice_view.js:514-522` · `orders_week_view.js:1717-1763` |
| Very many rows | catalog virtualised (46 px rows, buffer 12, default period 60 days); invoicing / no-price render every row of an all-time set with no paging; week reads RTs capped at 500 and says so in a strip | `orders_catalog.js:20,277-279` · `core/orders-common.js:769-773` · `orders_week_view.js:766,832,980` |
| Narrow width | catalog columns are fixed for 1440 and scale when the card opens; week lines are fitted by script word by word and scroll sideways when floors do not fit | `orders_catalog.js:141-149` · `orders_week_view.js:1181-1190` |
| Offline | a queued write is reported as not written («Εκτός σύνδεσης — …») | `orders_invoice_ops.js:96-98` · `orders_noprice_view.js:472` |


---

## Φόρμα διεθνούς παραγγελίας

Scope: `modules/orders_intl.js` (4557 lines, one IIFE), `core/form-helpers.js`, `core/stops-helpers.js`, `core/scan-helpers.js`, `core/scan-engine-v2.js`, `core/order-sync.js`, `core/vs-dates.js`. All are loaded by `app.html` (lines 133, 134, 136, 139, 140, 146, 182). The module no longer renders a page: the list lives in `modules/orders_catalog.js` / `orders_hub.js`; this file supplies the data loader, the order card, the form, the scan dialog, delete, and the legacy Veroia Switch chain. No print trigger and no keyboard listener exist in the module (grep for `print`, `keydown` = 0 hits).

Worker map check below = `worker/src/index.js` in this repo (ORDERS map at :1317-1533, ORDER STOPS at :1769-1831). Not checked against the deployed bundle.

### 1. Who sees it

| Role | Reaches | What the module gates (file:line) |
|---|---|---|
| owner, dispatcher (`orders` full) | card with actions, full form, scan, delete, duplicate | `can('orders') === 'full'` → `canEdit`, `orders_intl.js:443`; catalog shows «Σάρωση» / new-order menu only when `canEdit` (`orders_catalog.js:325-334`) |
| owner only | «Χρέωση αποθήκης» block on a lot edit | `ROLE === 'owner'`, `orders_intl.js:1555` |
| owner, dispatcher (stock) | «σε απόθεμα» tick | `OrdersStock.on() && OrdersStock.canWrite()`, `orders_intl.js:1437` |
| accountant | card, one action «Διόρθωση» (5-field quick edit, other module) | `OrderQuickEdit.can()`, `orders_intl.js:543` |
| management, warehouse | card without «Ενέργειες» section | `orders_intl.js:536-544, 582` |
| any role on Weekly Εθνικών (legacy board) | floating read-only card of a VS order | `openIntlReadOnlyCard`, `orders_intl.js:588-615`; `readOnly` forces no actions (`:442`) |

Job and order (inference from code + comments): a dispatcher creates 1 order at a time, mostly 1 loading + 1 delivery (design doc: about 7 of 10), from the «Παραγγελίες» catalog, from an empty box of Weekly Διεθνών (`weekly_intl.js:912, 3050`), or from a scanned customer PDF (single or a batch of up to 10). Edit is opened from the card, from Weekly Διεθνών (`weekly_intl.js:1906, 7498, 7541`), from a pre-order conversion (`preorder.js:252`, Daily Ops). Many times a day; the form is also the conversion screen of a pre-order and the piece/lot screen of stock.

Entry points (all `window.*`, `orders_intl.js:4488-4556`): `openIntlCreate`, `openIntlEdit`, `openIntlEditWith(recId, fields)`, `openIntlPieceCreate(lot, presets)`, `openIntlScan`, `duplicateIntlOrder`, `deleteIntlOrder`, `selectIntlOrder`, `openIntlCardWith`, `openIntlReadOnlyCard`, `intlQuickEdit`, `loadOrdersIntlData`, `renderOrdersIntl`, `_syncVeroiaSwitch`.

### 2. Inventory

#### 2.1 Order card (detail panel `#intlDetail`, `_oiCardHtml` `orders_intl.js:437-583`)

| Region | Content | file:line |
|---|---|---|
| Head | «Reference · client», close «×» (title «Κλείσιμο (Esc)»; Esc handled by the catalog, `orders_catalog.js:345`) | :548 |
| Read-only note | «Veroia Switch · μόνο ανάγνωση — επεξεργασία από το Weekly Διεθνών» | :549 |
| Sub lines | direction word · «W»+Week Number · Brand; «Ref (…) · #Order No» | :550-551 |
| Chips | status (Greek), pre-order chip, «Παρτίδα → αποθήκη», «Ανταλλαγή παλετών», «Veroia Switch», «Ομαδοποίηση», «Προς ανάθεση», «Υψηλό ρίσκο» | :469-478 |
| «Στοιχεία» | Reference (only when missing), Εμπόρευμα, Θερμοκρασία (+reefer), Παλέτες (+type), Μικτό βάρος, Ανταλλαγή παλετών (with pending sheets), Μεταφορέας, Τιμή, Τιμολογήθηκε; empty = «— δεν έχει καταχωρηθεί» | :554-570, :479 |
| «Διαδρομή» | shared route diagram (`RouteDiagram.render`) over the stop list; fallbacks: «Φόρτωση στάσεων…», «Οι στάσεις δεν φορτώθηκαν — …», legacy summary strings | :425-435, :503-520, :571 |
| «Δελτία παλετών» (PE only) | Δελτίο 1 / Δελτίο 2 (cross-dock) state, link «Ισοζύγιο παλετών →» | :572-576 |
| «Ανάθεση» | partner + plates, or truck + driver, or «Προς ανάθεση — η ανάθεση γίνεται στο Εβδομαδιαίο Διεθνών»; link «άνοιγμα στο Εβδομαδιαίο Διεθνών →» | :521-532, :577-579 |
| «Σημειώσεις» | only when filled | :580 |
| «Έγγραφα» | `OrderDocs.sectionHtml` (other module) | :581 |
| «Ενέργειες» | «Επεξεργασία» / «Μετατροπή σε παραγγελία» (pre-order), «Επεξεργασία pre-order», «Διπλασιασμός» (not on a piece), «Διαγραφή»; or «Διόρθωση» for the accountant | :536-544 |

#### 2.2 Form: create + edit (`_openModal`, `orders_intl.js:939-1180`; one modal, 960px class `modal--oi2`)

Titles (`:1141-1144`): «Νέα παραγγελία», «Παραγγελία #N» / «Επεξεργασία παραγγελίας», «Μετατροπή pre-order σε παραγγελία», «Κομμάτι από απόθεμα», «Επεξεργασία κομματιού από απόθεμα». Head extras (`:1149-1157`): grey «city → city · day» on an edit, lot chip on a new piece, button «Από PDF» on a plain new order.

Fields. "Map" = label present in the ORDERS (or ORDER STOPS) map of `worker/src/index.js`.

| Label on screen | Input | Required? | Facade label written | Map |
|---|---|---|---|---|
| «Κατεύθυνση» (ΕΞΑΓΩΓΗ / ΕΙΣΑΓΩΓΗ) | 2 buttons over hidden `f_Direction` (:1053) | hard (:2949) | `Direction` | yes (unquoted, :1368) |
| «Πελάτης» | async search picker, 2+ chars (`fhClientSelect`, form-helpers:228) | hard (:2950) | `Client` (link) | yes (links :1493) |
| «Reference» | text (:1062) | no; duplicate asks | `Reference` | yes |
| «Τιμή € · καθαρή» | number (:1035); read-only on an invoiced lot; replaced by text on a piece | soft, 2nd press saves (:794) | `Price` | yes (unquoted) |
| «Εμπόρευμα» | text (:1069) | no | `Goods` | yes |
| «Βάρος kg» | number (:1071) | no | `Gross Weight kg` | yes |
| «°C» + tick «CMR» | number + checkbox (:1075-1078) | soft unless «Χωρίς» or CMR (:798) | `Temperature °C`, `Temp Per CMR` (sent on every save, read back :3157) | yes, yes |
| «Ψυκτικό» (Συνεχής / Start-Stop / Χωρίς) | 3 buttons, hidden `f_ReeferMode` (:1080) | soft | `Refrigerator Mode` (Continuous / Start-Stop / No temp) | yes |
| «Παλέτα» (EUR / CHEP / Industrial) | 3 buttons, hidden `f_PalletType` (:1081) | soft | `Pallet Type` | yes |
| «Ανταλλαγή» (Ναι / Όχι) | 2 radios styled as buttons (:766-772); locked «Όχι» for CHEP/Industrial (form-helpers:587-631) and on a piece | hard on create only (:2956) | `Pallet Exchange` (left out of an edit PATCH when unanswered, :2820) | yes |
| «Σημειώσεις» | textarea 1 row (:1104) | no | `Notes` | yes (unquoted) |
| «Εντολή πελάτη» | file attach (`OrderDocs.formFieldHtml`, :1105) | no | not through the facade (`order_documents`) | n/a |
| «υψηλό ρίσκο» | checkbox (:1106) | no | `High Risk Flag` (always sent) | yes |
| «VS» (head of the VS column) | checkbox `f_VeroiaSwitch`, tri-state aggregate of the point ticks (:1108-1109, :710-725) | no | `Veroia Switch` (always sent; forced false on a lot, :2824) | yes |
| (hidden) National Groupage | hidden checkbox kept so the stored value is re-sent (:1110-1114) | n/a | `National Groupage` | yes |
| «σε απόθεμα» | checkbox `f_StockLot` in the «Παράδοση» head (:1707-1711) | n/a | no ORDERS field; second write = POST STOCK LOTS (`_oiMarkLot`) | n/a |
| «Αποθήκη *» | search picker over all locations abroad (:1712-1740, :1935-2015) | hard when lot ticked (:2959) | becomes the one delivery stop | n/a |
| «Χρέωση αποθήκης (μόνο owner)» | number + own button «Αποθήκευση χρέωσης» (:1562-1593) | no | own save path (`_oiChargeSave`, not ORDERS) | not checked |

Written without a field (`:2793, :2919-2944, :3099, :3107`): `Brand`='Petras Group' and `Type`='International' (create only), `Status`='Pending' (create only), `Loading DateTime` / `Delivery DateTime` (first stop of each type), `Cross-dock Date`, flat `Loading Location 1..10`, `Loading Pallets 1..10`, `Unloading Location 1..10`, `Unloading Pallets 1..10`, and on a pre-order conversion `Ops Status`=null, `Destination Country`=null. All are in the ORDERS map (`Brand`, `Type`, `Status` unquoted). No label the form writes is missing from the map.

Footer (`:1119-1123`): «Διπλασιασμός» (edit, not a piece), «Παράλειψη → (N ακόμη)» (scan queue), «Άκυρο», «Αποθήκευση» (text becomes «Αποθήκευση…» while busy).

Bands above the form: stops-not-loaded banner (`:1133-1138`), pre-order conversion band (`:1139`), partner-warehouse warning `#oiWhWarn` «Υπάρχει παρτίδα αυτού του πελάτη εδώ — κομμάτι; από το ΑΠΟΘΕΜΑ» (`:1864-1876`), lot band with remaining pallets and «Άνοιγμα ξανά» (`:1511-1520`), piece band and piece warning (`:1499-1502, :1912-1929`), client prefill chip «από #N» + «αναίρεση» (`:1269-1272`).

#### 2.3 Stops editor (`_stopRow` `:637-670`, sections «Φόρτωση» / «Παράδοση» `:1085-1098`)

One head row per section (`:1039-1040`): «Σημείο» (or «Αποθήκη»), «Ημέρα», «Ώρα», «Παλέτες», «ανταλλαγή», VS, remove.

| Per-point control | Input | Required? | ORDER STOPS label | Map |
|---|---|---|---|---|
| point | location picker over the cached list, 25 hits max (form-helpers:296-303) | hard for point 1 of each type (:2951-2952); typed-not-picked blocks (:862-893) | `Location` (link) | yes |
| «Ημέρα» | `type=date` | hard for point 1 (:2953-2954); delivery before loading blocks (:2976) | `DateTime` | yes (unquoted) |
| «όλη η ημέρα» / «ώρες…» | two text inputs «ΩΩ:ΛΛ» (:655-662), normalised on blur (:675-681) | never; bad format blocks (:2859) | `Time From`, `Time To` | yes |
| «Παλέτες» | number, min 0 | no; negative blocks (:2982-2987) | `Pallets` | yes (unquoted) |
| «ανταλλαγή» tick (+ number on a loading point under «διόρθωση…») | checkbox + number (:664-665) | number must be 0..pallets (:2871) | `Pallets Exchanged` (null = all, 0 = none, n) | yes |
| «Μέσω Βέροιας» tick | checkbox, national side only (:666, :689-707) | no | `Via Hub` (false = direct, null = follows VS) | yes |
| «×» | remove, not on point 1 (:642-644) | n/a | stop record deleted by `stopsSave` | n/a |

Also written per stop from order-level values (`stops-helpers.js:128-150`): `Parent Order` (link), `Stop Number`, `Stop Type`, `Stop Label`, `Client at Stop` (link), `Temperature`, `Reference`, `Goods`. All in the ORDER STOPS map. Per-point values of migration 111 are sent only when changed (`:2856`), and hours are read back after the save (`:3233-3244`).

Buttons: «+ σημείο φόρτωσης», «+ σημείο παράδοσης» (max 10 each, `:1089, :1097, :1357-1374`).

Summary line `#oiBalance` (`_oiBalanceUpdate`, `:1295-1341`), display only: «N → M παλέτες», «λείπουν / περισσεύουν N στην παράδοση», exchange line («όλες με ανταλλαγή» + «διόρθωση…», «ανταλλαγή: φόρτωση N · παράδοση M ✓», «όλες ξανά»), «χωρίς ανταλλαγή (CHEP)», chip «Βέροια <day> · N παλέτες», «γέμισμα φορτηγού N/33».

#### 2.4 Save pipeline (`submitIntlOrder`, `:2703-3305`; `_oiFinishSave`, `:3311-3351`)

| Step | What | file:line |
|---|---|---|
| 0 | owner's changed warehouse charge saved first; failure stops the save | :2722-2727 |
| 1 | retry-only-the-lot-mark path; mark-only path for an existing order | :2733-2775 |
| 2 | typed-not-picked locations marked in place | :2782-2788 |
| 3 | hard validation → one toast, messages joined with « \| » | :2948-2993 |
| 4 | soft-required: red «Υποχρεωτικό — δεν συμπληρώθηκε» under the field, toast, second press saves | :805-828, :2997-3003 |
| 5 | pallet mismatch toast (non-blocking) | :3006-3010 |
| 6 | groupage pre-save native confirm (legacy, before day L only) | :3015-3054 |
| 7 | duplicate Reference: two native confirms in a row | :3059-3095 |
| 8 | lot untick: native confirm, then unmark | :3117-3131 |
| 9 | ORDERS write: `atCreate` or `atSafePatch(TABLES.ORDERS …)` → Postgres `orders` | :3133-3135 |
| 10 | read-back checks: `Stock Lot` link, `Temp Per CMR`, `Ops Status` | :3148-3170 |
| 11 | scan file + «Εντολή πελάτη» uploads; scan correction saved as training example | :3179-3223 |
| 12 | `stopsSave` → ORDER STOPS create/patch/delete (`order_stops`) | :3229-3245 |
| 13 | `plOnOrderSaved`, `rtOnOrderSaved` (pallet feed, trip feed; other modules) | :3248-3249 |
| 14 | `_syncVeroiaSwitch`, then `syncOrderDownstream(…, {skipVS, skipGRP})` fire-and-forget | :3251-3268 |
| 15 | lot mark (second write), piece joins its truck on the Weekly | :3277-3285 |
| 16 | close, toast, repaint of the page that is open (Weekly Διεθνών / Εθνικών / Daily Ops / Orders), next scan of the queue | :3334-3350 |

Toasts of the save: «Order created ✓», «Order updated ✓», «Το pre-order έγινε παραγγελία ✓», «Η παραγγελία έγινε παρτίδα ✓», «… · ανάθεση ✓» (`:3340`); «Συγχρονισμός εθνικού φορτίου VS…», «Το εθνικό φορτίο συγχρονίστηκε ✓» or the v5 text (`:3252, :3261`); failures at `:3138-3139, :3150, :3160-3163, :3168, :3240, :3267, :3296-3301`.

#### 2.5 Scan (document → prefilled form)

| Step | UI | file:line |
|---|---|---|
| Dialog | modal 520px, title «New Order from Scan»; drop zone «Σύρε αρχεία εδώ ή κάνε κλικ για μεταφόρτωση», hint «JPG · PNG · PDF · Word — έως 10MB · έως 10 αρχεία μαζί», button «📷 Λήψη με κάμερα», footer «Άκυρο» + «🤖 Εξαγωγή στοιχείων & συμπλήρωση φόρμας» | :3373-3415 |
| File chosen | name, size, image / PDF first-page preview (pdf.js) | :3423-3472, :3649-3673 |
| Extract | status line with spinner; engine v2 by default (`scanEngineV2On`, scan-engine-v2.js:62-63; fallback v1 per browser via `localStorage tms_scan_engine='v1'`) | :3474-3495 |
| Engine v2 | one structured-output call, text layer first (PDF, .doc, .docx), client/location matching in code over all cached records, warnings list | scan-engine-v2.js:1-40, :725-870 |
| Engine v1 (fallback) | doc-type call → tool loop (`search_clients`, `search_locations`) → optional retry with the top model | :3496-3626; scan-helpers.js:288, :723 |
| Endpoint | `POST PROXY_URL + '/v1/ai/messages'` with the user's JWT | scan-helpers.js:220-234 |
| Preview | box «AI Extraction» with doc-type badge, model label, confidence HIGH/MEDIUM/LOW, rows Client / Reference / Loading / Delivery / Load Date / Del Date / Goods / Weight / Pallets / Temp / Direction, each ✓ or ⚠; legend «⚠ = δεν βρέθηκε match · …»; unmatched stop gets inline «νέα τοποθεσία» control (`locScanNewHTML`, other module) | :3887-3929, :4000-4010 |
| Preview warnings | delivery before loading, pallets > 33, temperature out of range, v2 warnings; duplicate Reference banner (red) and a second banner with links to the existing orders | :3931-3992 |
| Footer after extract | «Άκυρο», «↩ Νέα σάρωση», «Άνοιγμα φόρμας →» | :3964-3968 |
| Batch | up to 10 files scanned in sequence, banner «✓ Έτοιμα n/N — …» + «Άνοιγμα 1ης φόρμας →»; each form's title gets « — Σκαν i/N · file»; «Παράλειψη →» in the form footer; Save opens the next | :3675-3734, :1121, :3350 |
| Prefill | Client, Reference, Goods, Notes, Gross Weight, Temperature (+ reefer forced to Continuous), Direction, Price, Pallet Type; stops with place, day, pallets, hours | :4017-4080 |
| Training examples | every saved scan stores AI output vs saved values: localStorage `tms_scan_training` (last 30) + facade table `TABLES.SCAN_TRAINING`; synced when the dialog opens | :3193-3223, :3378; scan-helpers.js:344-436 |

#### 2.6 Delete (`deleteIntlOrder`, `:4126-4263`) and duplicate (`:904-937`)

| Item | What | file:line |
|---|---|---|
| Confirm | native `confirm`; generic text names the order in words (`PlainRef.orderOf`) then lists «Τα linked NAT_LOADS · GROUPAGE LINES + CONS_LOADS · RAMP records · PALLET LEDGER entries · ORDER_STOPS»; separate short texts for a piece and a lot | :4108-4125 |
| Order first | soft delete of ORDERS (with a 428 «consequences» confirm from `atWithDeleteConfirm`); a refusal stops before any child is touched | :4139-4163 |
| Children | NATIONAL LOADS by `{Source Record}` deleted; GROUPAGE LINES → `Status='Unassigned'` (never deleted); CONSOLIDATED LOADS + their NL deleted only if no other order's line stays; RAMP deleted; PARTNER ASSIGNMENTS deleted; pallet / trip feeds told | :4165-4241 |
| Stops | removed by the base in the order's transaction (comment) | :4222-4227 |
| Toasts | «Διαγραφή παραγγελίας...», «Order deleted», «Order deleted (N linked records failed — δες error log)», «Χωρίς δικαίωμα διαγραφής παραγγελίας — ζήτα από τον owner», «Η διαγραφή δεν έγινε — δεν άλλαξε τίποτα» | :4130, :4158-4160, :4250 |
| Duplicate | copies order fields except assignment / status / stock labels, opens a new form; refuses on a piece | :904-937 |

### 3. Business logic that must survive

- **Blocking rules** (`:2948-2993`): direction, client, point + day of loading 1 and delivery 1, exchange answered on a new order, delivery not before loading, no negative pallets, location picked from the list, hour format, correction number ≤ pallets of the point, lot rules. Price, °C, reefer, pallet type warn once and save on the second press (`:793-828`); «Χωρίς» and «CMR» excuse the temperature.
- **ORDER STOPS is the only stop source**; the flat `Loading/Unloading Location N` + `Pallets N` on ORDERS are written as a mirror (`:2932-2945`); an emptied link is `[]`, not null.
- **A stop is the same stop by record id** (`sid_` hidden input, `stops-helpers.js:54-90`); removed rows leave index gaps and the save renumbers 1..n (`:2884-2898`).
- **Exchange**: CHEP / Industrial force «Όχι» and lock it (form-helpers:587-631); «Ναι» ticks every point; per-point column shows only with more than one loading or delivery point (`:697-707`); a piece never has its own exchange or price.
- **Veroia Switch** = aggregate of the point ticks on the national side (import: deliveries; export: loadings) (`:689-725`). VS on adds one `Cross-dock` stop at the fixed Veroia location with pallets = sum of ticked points (`:2901-2920`). VS is forced off on a lot.
- **Veroia day** (`core/vs-dates.js:95-103`): estimate Export = loading + 1, Import = delivery − 1, sent only for a new order, VS just switched on, empty cross-dock, or changed direction; otherwise `Cross-dock Date` is left out of the PATCH so a day set on the boards survives. VS off writes `Cross-dock Date`=null. The server answers the column only as `VS CD Date`; one reader, `VsDates.cdOf` (`vs-dates.js:38-41`).
- **National side after day L** (`_syncVeroiaSwitch`, `:2173-2179`): `PlanConfig.load({fresh:true})`; state `after` → nothing is written, the base's bridge makes one shipment per national-side stop, the form only reports it («VS chain: η βάση έφτιαξε την εθνική πλευρά (N κομμάτια) ✓») or throws when missing (`:2131-2136`); state `unknown` → fails loudly, the old chain never runs on a guess.
- **Legacy chain (state `before`)**, still shipped (`:2181-2467`): VS on + groupage off → one NATIONAL LOADS row created or patched (`Source Type`='Direct', found by `{Source Record}`), its own ORDER STOPS rewritten, `National Order Created` patched on the order; VS on + groupage on → one GROUPAGE LINES row per loading stop created/patched (`:2548-2700`), Direct NL deleted; VS off → NL deleted, RAMP rows of the order deleted, groupage lines set `Unassigned`. NATIONAL ORDERS are never created (legacy ones are deleted, `:2272-2281`).
- **Never deleted**: GROUPAGE LINES — every path sets `Status='Unassigned'` (`:2536, :2591, :2682, :4204`; `order-sync.js:228-229`). A CONSOLIDATED LOAD and its NL are deleted only when no other order's line stays Assigned on it (`order-sync.js:214-260`).
- **`syncOrderDownstream`** (`order-sync.js:29-133`): PARTNER ASSIGNMENTS status follow (`paSyncStatus`), VS chain, groupage totals, RAMP background sync, pallet feed on a PE change, cache invalidation; returns `{ok, failed[]}`. The form calls it with `skipVS, skipGRP` and no `changedFields`, so only the PA status and RAMP steps run from the form.
- **Stock**: a lot = order whose one delivery is a warehouse abroad + a STOCK LOTS row (second write); an existing order is marked by that one write only, with no ORDERS PATCH (`:2763-2775`); a piece = import from the lot's warehouse linked by `Stock Lot`, client/direction/loading locked (`:1757-1783`).
- **Double create guard**: the id of the order this modal created is kept until it closes, so a retry after a failed later step patches instead of creating again (`:2710, :3171`).
- **After save**, the page that is open is repainted, not the Orders page (`:3344-3348`); a new import opened from an empty Weekly box is matched to its export (`:3316-3325`).

### 4. Findings

Verified by reading the cited lines; nothing was run.

1. **[BROKEN]** «Διπλασιασμός» opens the copy without its stops. `duplicateIntlOrder` passes an array of stops as the 4th argument (`orders_intl.js:927-930`), `_openModal` reads `.loadStops` / `.unloadStops` of that argument (`:985-988`), so both sections open with one empty row. The button's tooltip promises «αλλάζεις μόνο ημερομηνίες» (`:1120`).
2. **[BROKEN]** No conflict check on the form's save. `atSafePatch(TABLES.ORDERS, recId, fields)` is called without `opts.expect` (`orders_intl.js:3134`); without it the function is plain `atPatch` (`core/api.js:1294-1301`), so the «άλλαξε από άλλον χρήστη» branch (`:3137-3141`) cannot fire. The design doc §5 lists that check as existing behaviour. Last save wins.
3. **[BROKEN]** The «stops did not load» guard is unreachable. `stopsLoad` catches every error and returns `[]` (`core/stops-helpers.js:39-42`), so `INTL_ORDERS._stopsFail` is never set (`orders_intl.js:975-979`), the red banner (`:1133-1138`) and the save lock (`:2743-2748`) never appear: a failed read opens the edit form with empty points, exactly the case the banner describes. Same cause in `stopsSave` (`stops-helpers.js:55`): a failed read of existing stops is taken as «none», so every form stop is created again.
4. **[BROKEN]** «+ σημείο …» dies after 9 adds in one form. `_removeStop` deliberately does not decrement the counter and shows the button again (`orders_intl.js:1380-1386`); `_addStop` returns when the counter is 10 (`:1358-1360`). Add 9, remove some: the button is visible and does nothing.
5. **[BROKEN]** Delete cascade filters CONSOLIDATED LOADS by `{Groupage Lines}` (`orders_intl.js:4188`; also `:4317, :4430`), a label the CL map does not model (`worker/src/index.js:1575-1577`); `order-sync.js:155-157` records that this filter answers 422. For an order with groupage lines the step lands in the catch, the truck is not checked or removed, and the toast reads «Order deleted (N linked records failed…)». Related: `syncGLtoCLtoNL` reads `cl.fields['Groupage Lines']` (`order-sync.js:173-174`), always empty, so the CL/NL totals cascade never patches anything.
6. **[MISSING]** Design-doc items not in code (`docs/design/intl-order-form-2026-11-08.md`): «το κουμπί λέει τι λείπει, αντί για toast» (validation is still a toast, `:2991`); «+ Νέα τοποθεσία» in the point list (no such item in `fhShowDrop`, form-helpers:339-349; the list just hides when nothing matches); read-only line for an order split in legs (Φ4η; no leg text in `_openModal`); Veroia «αλλαγή…» in the form (the chip is display only, `:1342-1355`); invoiced marker in the form head (only an invoiced lot shows a locked price, `:1033-1034`); inline «ίδιο Reference» state (still native confirms). Implemented as designed: direction first, one point column with one head, button groups, summary line, «Από PDF», client prefill with «αναίρεση», hours, VS per point, exchange per point with «διόρθωση…», «σε απόθεμα» in «Παράδοση», «Εντολή πελάτη», 960px.
7. **[MISSING]** No loading state between the click and the form: `_openModal` awaits locations, stock context, client name, stops and the lot shape (`orders_intl.js:948, 956, 971, 977, 992`) before `openModal` (`:1145`). Nothing is drawn meanwhile.
8. **[INCONSISTENT]** Duplicate Reference is asked twice on create, by two different readers: `findDuplicateOrders` (`:3059-3079`, case-insensitive, lists `f['Order Number'] || id slice`) then a second exact-match query (`:3083-3095`). `Order Number` is not in the ORDERS map (`worker/src/index.js:1495-1496`), so the first confirm lists six characters of a record id, against the plain-message rule of CLAUDE.md.
9. **[INCONSISTENT]** Language mix inside one flow. English: validation («Direction is required», «Loading Location 1 is required», «Delivery date cannot be before loading date», `:2949-2978`), save toasts («Order created ✓», «Order updated ✓», `:3340`; «Order deleted», `:4250`), pallet mismatch (`:3009`), «Sync already in progress for this order» (`:2140`), «VS sync failed and was rolled back» (`:2487-2489`), pickers «Search location...», «Type 2+ chars to search...», «Searching...» (form-helpers:212, 232, 328), scan title «New Order from Scan» (`:3380`), preview rows «Client / Load Date / Del Date…» (`:3910-3922`). The scan button starts Greek (`:3413`) and becomes «Extract & Fill Form» after any file pick or error (`:3630, :3668, :3822`).
10. **[INCONSISTENT]** One thing, several words: «Παρτίδα → αποθήκη» (card chip `:472`), «σε απόθεμα» (form tick `:1710`), «Παρτίδα» (toasts `:935, :2766`); «Ανάθεση πελάτη» (toast `:3338`, «ανάθεση ✓» `:3340`) vs «Εντολή πελάτη» (form `:1105`); «Διαδρομή» stop types «Φόρτωση / Παράδοση» vs delete confirm naming tables («NAT_LOADS», «CONS_LOADS», «ORDER_STOPS», `:4118`).
11. **[INCONSISTENT]** The cross-dock day has two labels on one column: the form writes `Cross-dock Date` (`:2919, :2922`), every read must use `VS CD Date` because the facade answers only that label (`vs-dates.js:28-41`). Any new reader of `f['Cross-dock Date']` sees empty. (The single column itself is [LOCKED].)
12. **[INCONSISTENT]** Truck capacity warns at 33 in the form and the v1 preview (`:1339, :3935`) and at 34 in engine v2 (`scan-engine-v2.js:811`).
13. **[EXTRA]** Dead or console-only code still shipped: `cleanupOrphanGL`, `cleanupOrphans` (`orders_intl.js:4273-4474`, «Run from console», no caller in app.html / core / modules); `stopsValidate` (`stops-helpers.js:157-189`, no caller); `patchWithSync` (`order-sync.js:270-283`, no caller); `scanFastExtract` (`scan-helpers.js:851`, no caller). `selectIntlOrder` still toggles `#intlTable` rows and `irow_` ids that no module renders (`:401-402`). The card's fallback reads `Loading Summary` / `Delivery Summary` (`:518-519`), labels absent from the map (`worker/src/index.js:1495-1496`), so it can only print «—».
14. **[EXTRA]** Scan engine v1 (doc-type call, tool loop, system prompt builder, model escalation: `orders_intl.js:3496-3626, 3737-3818`; most of `scan-helpers.js`) is reachable only through a per-browser localStorage switch (`scan-engine-v2.js:58-63`).
15. **[EXTRA]** The whole legacy national chain in this module (`:2181-2700`, plus the groupage pre-save confirm `:3015-3054` and the hidden «National Groupage» input `:1114`) runs only while `PlanConfig` state is `before`. Whether production is `after` was not verified here (docs say day L has passed).
16. **[LOCKED]** Card shows «Τιμολογήθηκε Ναι / Όχι» as a fact, never as a status (`:567-569`); «Τιμή» is visible to every role that opens the card (`:562`); no Net Price; the form never creates NATIONAL ORDERS; GROUPAGE LINES are only set `Unassigned`.
17. **[BROKEN]** Scan-correction training stores `pallets: fields['Total Pallets'] ?? …` (`:3200`), but the save never sets `Total Pallets` (computed, `:2930`), so the «corrected» pallets are always the AI's own value: a pallet correction by the user is never learned.

### 5. States the redesign must draw

| State | Today | file:line |
|---|---|---|
| Form opening | nothing on screen until all reads end (finding 7) | :948-1145 |
| Card stops loading | «Φόρτωση στάσεων…» in the «Διαδρομή» section | :514 |
| Card stops failed | «Οι στάσεις δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν. Κλείσε και ξαναάνοιξε την καρτέλα.» | :513 |
| Route diagram failed | red «Η διαδρομή δεν σχεδιάστηκε.» + plain stop list | :433 |
| Names not loaded (list / card) | two warning sentences passed to the catalog (`_OI_WARN_REF`, `_OI_WARN_LOC`) | :40-41, :296-306 |
| Empty value on the card | «— δεν έχει καταχωρηθεί» | :479-481 |
| No stops at all (old record) | legacy summary lines, in practice «—» | :516-520 |
| View-only role | card without «Ενέργειες»; accountant gets «Διόρθωση» only | :536-544 |
| Read-only VS card | grey note + no actions, floating panel | :549, :604-614 |
| Half-filled form, hard gap | one warning toast listing all gaps; exchange control gets a red border + «Υποχρεωτικό — διάλεξε ΝΑΙ ή ΟΧΙ» | :2991; form-helpers:637-643 |
| Half-filled form, soft gap | red field + «Υποχρεωτικό — δεν συμπληρώθηκε», toast «… Πάτησε ξανά «Αποθήκευση» …» | :805-828, :2999-3001 |
| Location typed, not picked | red field, « — διάλεξε από τη λίστα» in the label, focus moves there | :862-893 |
| Picker: no match | dropdown simply hides (no «nothing found») | form-helpers:342 |
| Picker: client search running | «Searching...» | form-helpers:328 |
| Client prefill failed | «Η τελευταία παραγγελία του πελάτη δεν διαβάστηκε — συμπλήρωσε τα πεδία» | :1243 |
| Saving | button «Αποθήκευση…», disabled; waits for file uploads too | :2705, :3332 |
| Save refused by a rule (4xx) | the API's own message + «Δεν αποθηκεύτηκε τίποτα — η φόρμα μένει ανοιχτή» or «Η παραγγελία αποθηκεύτηκε, αλλά ένα επόμενο βήμα δεν έγινε — ξαναδοκίμασε την Αποθήκευση» | :3295-3298 |
| Half save (order written, later step failed) | form stays open, next press patches the same order | :2710, :3171 |
| Server dropped a new label | red toasts for `Temp Per CMR`, hours, piece link, pre-order mark | :3150, :3160, :3168, :3240 |
| Lot / piece | bands, locked client / loading point / pallets, hidden VS, price replaced by «στην παρτίδα #N» | :1030, :1037, :1486-1520, :1757-1795 |
| Lot charge loading / failed | «Φόρτωση…» / «Η χρέωση αποθήκης δεν φορτώθηκε — … Δεν σημαίνει ότι δεν υπάρχει.» | :1566-1570 |
| Scan: working / failed | spinner line with the step text; red box with the error text | :3478-3486, :3629 |
| Scan: nothing matched | ⚠ per row + legend; unmatched stop offers «νέα τοποθεσία» | :3887-3896, :3927 |
| Scan batch: none succeeded | toast «Κανένα αρχείο δεν σκαναρίστηκε επιτυχώς» | :3705 |
| Many stops | hard cap 10 per type; over 33 pallets only a warning | :1360, :1339 |
| Close with typed data | «Άκυρο» and Esc close at once, no question (`core/ui.js:157`); only «Από PDF» asks before replacing a typed form | :1122, :1210-1215 |
| Native dialogs inside the flow | groupage, duplicate Reference ×2, lot untick, «Από PDF», delete: all browser `confirm` (chosen so the form survives a Cancel) | :3030, :3068, :3089, :3118, :1213, :4127 |


---

## Φόρμα εθνικής παραγγελίας (`modules/orders_natl.js`, 2598 lines)

Loaded by `app.html:183`. Since 28/9 the module draws **no list** (`orders_natl.js:19-23`); it owns: the national data load for the catalog, the right-hand order card, the create/edit modal (normal + groupage), the scan flow, delete, and the cascades to NATIONAL LOADS / GROUPAGE LINES / CONSOLIDATED LOADS / ORDER STOPS.

### 1. Who sees it

| Role | Reaches | In-module gate | Job here |
|---|---|---|---|
| owner, dispatcher | card + form + scan + delete | `can('orders')==='full'` → «Επεξεργασία», «Διαγραφή» (`:279`, `:334`, `:367`); «+ Νέα παραγγελία ▾ › Εθνική» and «Σάρωση» in the catalog only when `canEdit` (`orders_catalog.js:313-334`) | enter / correct a national order (before day L); after L only price/notes of an old order (dispatcher) or everything (owner) |
| accountant | card only | not `canEdit`; gets «Διόρθωση» if `OrderQuickEdit.can()` (role accountant, `order-quick-edit.js:28`) (`:335`) | fix price on a row (one PATCH) |
| management, warehouse | card only, no buttons | `:334-335`, `:367` | read |
| any role without `costs` | card hides «Τιμή» | `can('costs')!=='none'` (`:348`) — dispatcher and warehouse do not see the price **on the card**, while the form (dispatcher) has «Τιμή (€)» (`:1020`) | — |

Second layer, at runtime, not a role: **day L** (`_natlAfterL`, `:845-849`, answer of `OrdersCommon._planState({fresh:true})` = PlanConfig read from the base):

| Entry | Before L / state `unknown` | After L |
|---|---|---|
| `openNatlCreate` (`:870`) | opens the modal | toast «Οι νέες εθνικές καταχωρούνται από το Εβδομαδιαίο Εθνικών («+ Νέα παραγγελία»)» + `navigate('weekly_natl')` (`:861-869`) |
| `openNatlScan` (`:1964`) | scan modal | same redirect (`:1965`) |
| `openNatlEdit` (`:881`) | full form | v5 order → redirect to the board on the order's week (`:892`); old order → form locked to Q-10 fields: dispatcher «Τιμή» + «Σημειώσεις», accountant «Τιμή», owner everything, other roles read-only note (`:856`, `:893-915`) |
| `deleteNatlOrder` (`:1824`) | confirm + cascade | never deletes; one of three warn toasts (`:1827-1832`) |
| `_natlSendToWeekly` (`:1130`) | creates the missing load | warn toast, nothing written (`:1131`) |
| state `unknown` | — | warn toast «Δεν διαβάστηκε αν έγινε η μετάβαση…» and the old path opens (`:847`) |

Relation to national v5 (code only): with `FEATURES.WN_V5 'on'` the Weekly National renders the v5 board (`weekly_natl.js:146`), whose «+ Νέα παραγγελία» opens `WN5Form.openOrder` (`weekly_natl_v5.js:653`) and writes only `POST/PATCH /plan/orders` (`wn5_forms.js:6`, `:902`, `:1283`). The legacy board's own callers of this form (`weekly_natl.js:388`, `:395`, `:1580`, `:1932`) sit behind that seam. So this module is the entry path **only while the base answers "before L"**; after L it is a card + a restricted legacy editor + redirects. Whether production is "after" is a base value, not visible in code (CLAUDE.md's guard line `--plan 2` implies it is — inference).

Frequency (inference): card = many times a day by accountant/dispatcher from «Παραγγελίες»; form = rare after L.

### 2. Inventory

#### 2a. Order card (`#natlDetail`, 480px right panel; mounted by `orders_catalog.js:306` and `orders_week_view.js:1835`)

| Region | Content | file:line |
|---|---|---|
| Dark head | title = `Reference` upper-case or «ΧΩΡΙΣ ΑΝΑΦΟΡΑ» + « · client»; «Επεξεργασία» (full) or «Διόρθωση» (accountant); × «Κλείσιμο (Esc)» | `:288`, `:331-337` |
| Sub line | «Ε-n» · ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ · «Ανεξάρτητη»/«Veroia Switch» | `:292-293`, `:120-125` |
| Chips | status word (ΣΕ ΑΝΑΜΟΝΗ, ΕΠΙΒΕΒΑΙΩΜΕΝΗ, ΑΝΑΤΕΘΕΙΜΕΝΗ, ΣΕ ΜΕΤΑΦΟΡΑ, ΠΑΡΑΔΟΘΗΚΕ, ΑΚΥΡΩΘΗΚΕ, ΤΙΜΟΛΟΓΗΘΗΚΕ) · ΜΕ ΟΧΗΜΑ / ΑΝΑΘΕΣΗ ΑΓΝΩΣΤΗ / ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ / ΠΡΟΣ ΑΝΑΘΕΣΗ · ΤΙΜΟΛΟΓΗΘΗΚΕ / ΧΩΡΙΣ ΤΙΜΟΛΟΓΗΣΗ · GRP · VS · «PE · ΑΝΤΑΛΛΑΓΗ ΠΑΛΕΤΩΝ» | `:296-306` |
| «Στοιχεία» | Πελάτης, Κατάσταση, Εμπόρευμα, Παλέτες, Θερμοκρασία, Τιμή (gated), Τιμολογήθηκε («Ναι», «Ναι · αυτοπαράδοση», «Όχι»); empty = «— δεν έχει καταχωρηθεί» | `:341-350`, `:223` |
| «Διαδρομή» (sunken) | rows: date d/M · mini chip ΠΑΡΑΛΑΒΗ/ΠΑΡΑΔΟΣΗ · location · pallets (only on a single delivery) | `:311-325`, `:351-354` |
| «Ανάθεση» | dot + vehicle text or one of 5 sentences (`_ON_ASSIGN_LINE`); link «άνοιγμα στο Weekly National →» | `:144-150`, `:355-362` |
| «Σημειώσεις» | only when present | `:363-366` |
| «Ενέργειες» | «Επεξεργασία», «Διαγραφή» (danger; tooltip names NL/GL/CL/Ramp) — `canEdit` only | `:367-373` |
| Hook | `OrdersWeekView.cardPainted(panel)` mounts «Τιμολόγηση» in the Week view | `:375` |
| Motion | slide-in only when opening from closed | `:270-277` |

#### 2b. Modal «Νέα εθνική παραγγελία» / «Επεξεργασία εθνικής παραγγελίας» (`#modal.modal--wide`, 1100px; `:948-1125`)

"In map" = label present in the NATIONAL ORDERS block of `worker/src/index.js:1665-1761`.

| Label on screen | Input | Required | Facade label written | In map |
|---|---|---|---|---|
| «Κατεύθυνση *» | select: «ΚΑΘΟΔΟΣ (Βορράς→Νότος)» = `North→South`, «ΑΝΟΔΟΣ (Νότος→Βορράς)» = `South→North` (`:997-999`) | yes (`:1203`) | `Direction` | yes (unquoted, `:1680`) |
| «Τύπος» | select: «Ανεξάρτητη» = `Independent`; «Veroia Switch (παλιά εγγραφή)» only if the record already has it (`:1002-1009`) | no | `Type` | yes (`:1699`) |
| «Πελάτης *» | search-as-you-type (`fhClientSelect`), hidden in groupage mode | yes (`:1204`) | `Client` (link) | yes (links, `:1730`) |
| «Τιμή (€)» | number, hidden in groupage mode | no | `Price` | yes (unquoted) |
| «Εμπόρευμα» | text, placeholder «π.χ. Φρέσκα λαχανικά» | no | `Goods` | yes |
| «Θερμοκρασία °C» | number | no | `Temperature °C` | yes (`"Temperature \xB0C"`, `:1701`) |
| «Ανταλλαγή παλετών (PE) *» | radio ΝΑΙ / ΟΧΙ, no default (`form-helpers.js:589-600`) | yes on create only (`:1209`); on edit unanswered = not written | `Pallet Exchange` | yes |
| «Τύπος καταχώρησης» (create only) | two mode cards: «Κανονικό φορτίο — Ένας πελάτης — 1 παραγγελία» / «Groupage — Πολλές παραγγελίες, ένα φορτηγό» (`:1036-1046`) | — | hidden checkbox → `National Groupage` (`:1034`, `:1186`) | yes |
| «Φόρτωση» › «Σημείο φόρτωσης *» (+ hint «(κοινό για το φορτίο)» in groupage) | location search (`fhLocSelect`) | yes | `Pickup Location 1` (link) | yes |
| «Ημ. φόρτωσης *» | date | yes | `Loading DateTime` (date only) | yes |
| «Παραδόσεις — μία κάρτα ανά σημείο» (normal) | per row: «Τοποθεσία παράδοσης *», «Παλέτες» (0–99), «Ημερομηνία», «Σημείωση», ×; «+ Προσθήκη σημείου»; max 10, min 1 (`:592-624`) | ≥1 location + ≥1 date (`:1206-1208`); on edit with 2+ points every row needs pallets + date (`:1214-1217`) | `Delivery Location 1..10` (unused slots written `[]`), `Delivery DateTime` = first dated row, `Pallets` = sum (only if > 0) | yes |
| «Παραδόσεις — μία κάρτα ανά πελάτη» (groupage) | per client card: «Πελάτης *», «Αξία € (ανά πελάτη)», ×; rows as above; «+ σημείο για αυτόν τον πελάτη», «+ Προσθήκη πελάτη»; live preview box «N παραγγελίες θα δημιουργηθούν · 1 φορτίο · X/33 παλέτες» (`:640-766`) | ≥1 card with client + location; ≤10 stops total (`:798-800`) | see chain below | — |
| «Σημειώσεις» | textarea | no | `Notes` | yes |
| Footer | «Άκυρο»; «Καταχώρηση» / «Αποθήκευση» / «Καταχώρηση N παραγγελιών»; busy text «Αποθήκευση…» | | | `:1087-1091`, `:765`, `:803` |
| After-L note | grey box on top: «Παλιά εθνική (πριν από το νέο Εβδομαδιαίο): αλλάζει μόνο τιμή και σημειώσεις…» or «…μόνο ανάγνωση για τον ρόλο σου…»; all other inputs disabled; submit hidden if nothing is allowed | | | `:900-916` |

No «Αναφορά»/Reference field, no status field, no time-of-day, no pallet type, no partner/vehicle on this form.

ORDER STOPS written by `stopsSave` (parent `Parent Nat Order`, `config.js:264`): `Stop Number`, `Stop Type` (Loading/Unloading), `Location`, `Pallets`, `DateTime`, `Client at Stop`, `Reference`, `Goods`, `Temperature`, `Notes` — all in the ORDER STOPS map (`worker/src/index.js:1772-1834`).

Direction vocabulary as shown: the select prints Greek words with the arrow value underneath (`:999`); the card prints «ΑΝΟΔΟΣ»/«ΚΑΘΟΔΟΣ» via `_ON_DIR_WORD` (`:120`); NATIONAL ORDERS, GROUPAGE LINES and NATIONAL LOADS store the arrow strings; CONSOLIDATED LOADS stores Greek via `DIR.ANODOS/KATHODOS` (`:459`).

#### 2c. Scan (`openNatlScan`, `:1964-2537`)

| Step | What | file:line |
|---|---|---|
| Modal «Νέα National Order από Scan» (520px) | drop zone «Σύρε το αρχείο εδώ ή κάνε κλικ για επιλογή», «JPG · PNG · PDF (· Word) — max 10MB», «Λήψη με κάμερα», footer «Cancel» / «Εξαγωγή & συμπλήρωση φόρμας» | `:1966-1999` |
| File picked | ✓ file name + KB, image / PDF page-1 preview, Word = name only | `:2008-2043` |
| Extract | spinner lines «Προετοιμασία αρχείου…», «AI αναλύει το έγγραφο (v2)…»; engine v2 by default (`scan-engine-v2.js:62`), v1 prompt path as fallback | `:2045-2182` |
| Preview «AI Extraction» | rows Client, Reference, Direction, Pickup, Delivery n, Load Date, Pallets, Goods, Temp with ✓ / ~ / ⚠ marks; confidence HIGH/MEDIUM/LOW; warning strips; inline «νέα τοποθεσία» for an unmatched stop; amber «⚠ Πιθανό διπλότυπο» box | `:2329-2410`, `:2416-2426` |
| Footer after extract | «Cancel», «← Νέα σάρωση», «Άνοιγμα φόρμας →» | `:2384-2387` |
| Open form (v2) | prefilled `_openNatlModal`; per-row pallets/dates filled after open | `:2474-2537` |
| After save | toast «Η φύλαξη εγγράφου για εθνικές δεν υποστηρίζεται ακόμη» (`order-docs.js:804-809`) | `:1307` |

#### 2d. Dialogs, toasts, shortcuts

| Type | Text / trigger | file:line |
|---|---|---|
| native `confirm()` | «Διαγραφή αυτής της εθνικής παραγγελίας; Θα αφαιρεθούν και τα συνδεδεμένα φορτία και οι γραμμές groupage.» | `:1833` |
| `confirmAction` | «Πιθανό duplicate … Αποθήκευση ως νέα»; «Ο έλεγχος για διπλότυπα δεν μπόρεσε να εκτελεστεί. Συνέχεια χωρίς έλεγχο;»; «Υπάρχει ήδη order με ίδιο client + ημερομηνία. Δημιουργία duplicate;» | `:1251`, `:1291`, `:1296` |
| validation toast | all errors joined with « \| », 8 s | `:1233-1236` |
| success | «Η παραγγελία καταχωρήθηκε» / «…ενημερώθηκε»; groupage «N παραγγελίες · M γραμμές · 1 φορτίο»; legacy «Αποθηκεύτηκε» / «Καμία αλλαγή — δεν γράφτηκε τίποτα» | `:1467`, `:809`, `:934-940` |
| partial failure | stops not saved (15 s warn); «…αποθηκεύτηκε αλλά ΔΕΝ μπήκε στο Weekly…»; groupage «Η καταχώρηση απέτυχε — έλεγξε για ημιτελές φορτίο στα CONSOLIDATED LOADS»; conflict «Η εγγραφή άλλαξε από άλλον χρήστη…» | `:1360`, `:1436`, `:816`, `:1241` |
| delete | «Deleting order...», «Order deleted», «Order deleted (n linked records failed — check data)», 403 → «Χωρίς δικαίωμα διαγραφής…» | `:1836`, `:1950`, `:1850` |
| Undo | toolbar Undo of a new order = the order's own delete, only for owner/dispatcher | `:1449-1455`, `:1820` |
| Keyboard | none registered here; Esc is the shell's / the Week view's | — |
| Print / export | none in this module | — |

### 3. Business logic that must survive

- One national order = one client, one pickup (`Pickup Location 1`), up to 10 deliveries; pallets and date live **per delivery row** and are summed/derived, never typed as a total (`:585-590`, `:1167-1180`).
- Save order (normal): PATCH/POST NATIONAL ORDERS (`tblGHCCsTMqAy4KR2` → `national_orders`) → ORDER STOPS (`order_stops`) → pallet feed `plOnOrderSaved` → groupage release or sync → NATIONAL LOADS (`tblVW42cZnfC47gTb` → `national_loads`, `Source Type 'National'`, link `Source National Order`) with its own ORDER STOPS → `syncOrderDownstream` (`:1238-1461`).
- If the stops write fails, the load is **not** re-synced and no green toast is shown (`:1341-1366`, `:1409-1413`, `:1467`).
- Load `Status 'Pending'` only when the load is born; an edit never resets an assigned load (`:1703-1706`).
- Removed delivery slots are cleared explicitly with `[]` on the order and on the load (`:1194-1199`, `:1715-1718`).
- Edit of a multi-stop order pre-fills each row from its own ORDER STOPS row and refuses to save a row without pallets + date (`:968-984`, `:1111-1121`, `:1214`).
- Edit uses `atSafePatch` (conflict detection) (`:1240`).
- Groupage create writes a chain: N NATIONAL ORDERS (one per client, own `Price`, `National Groupage true`, `Status Pending`) → ORDER STOPS per order → GROUPAGE LINES one per delivery (`Status 'Assigned'`) → 1 CONSOLIDATED LOAD (`Is Groupage`, `Groupage ID 'G-…'`, `Pallets 1..10`) → GL patched with `Linked Consolidated Load` → 1 NATIONAL LOAD (`Source Type 'Groupage'`, `Client` text «X +n») → ORDER STOPS of the load (`:400-530`). Not transactional.
- Groupage is ΚΑΘΟΔΟΣ only: `South→North` is refused with an error toast (`:793-796`); 33 pallets is a warning colour, not a block (`:751-757`).
- GROUPAGE LINES are never deleted: turn-off and delete set `Status 'Unassigned'`; a shared truck (CL + its NL) is deleted only when no other order's line is still assigned (`:1375-1396`, `:1886-1908`). [LOCKED]
- Delete: soft-delete of the order **first**; then NL, GL release, RAMP rows, pallet feed, PARTNER ASSIGNMENTS; ORDER STOPS by a DB trigger (`:1846-1940`).
- Veroia Switch can no longer be chosen as `Type` on a national order (`:1005-1009`). [LOCKED]
- Duplicate guard: same client + same loading day → confirm, soft (`:1278-1300`).

### 4. Findings

| # | Tag | Finding | Evidence |
|---|---|---|---|
| A1 | [BROKEN] | The form has no Reference input and `submitNatlOrder` never sets `fields['Reference']`; so every order born here has no reference, the card title reads «ΧΩΡΙΣ ΑΝΑΦΟΡΑ», and the "duplicate by Reference" dialog can never fire. A reference read by the scan is shown in the preview and then dropped. | `:288`, `:1161-1199` (no assignment), `:1244-1263`, `:2371`, `:2474-2499` |
| A2 | [BROKEN] | Scan sets inline `max-width:520px` on `#modal`; `closeModal` does not clear it and `_openNatlModal` only adds `.modal--wide` (`width:1100px; max-width:96vw`, lower priority than inline). The form opened from a scan is 520px wide with 360px+ grid columns; after «Cancel» the next modal of any module inherits 520px. Verified in code, not run. | `:1966`, `:1093-1096`, `:1464` (only reset), `core/ui.js:40-52`, `assets/style.css:1331-1334` |
| A3 | [BROKEN] | Scan duplicate box links each hit by `f['Name'] \|\| d.id.slice(-6)`; `Name` is not a field of NATIONAL ORDERS, so the link text is always six characters of the record id (messages rule: never a code as the name). | `:2307`, `:2395`; map `worker/src/index.js:1679-1728` |
| A4 | [BROKEN] | v1 scan → form prefill matches `[data-field]`, `[name]`, `#fld_*`; the form has none, so the v1 path opens an empty form (the code's own comment says so). Only reachable with `localStorage tms_scan_engine='v1'`. | `:2428-2463`, `:2539-2557`, comment `:2466-2473` |
| A5 | [INCONSISTENT] | Two groupage shapes in one file: create writes one GL **per delivery** with `Status 'Assigned'` (`:434-451`); editing a groupage order runs `_syncGroupageLinesFromNO`, which builds GL **per pickup** with `Status 'Unassigned'` (`:1514-1605`). | as cited |
| A6 | [INCONSISTENT] | Price: the card hides «Τιμή» from a role without `costs` (dispatcher) while the same role types «Τιμή (€)» in the form and after L keeps exactly Price + Notes. CLAUDE.md says the dispatcher sees `Price`. | `:348` vs `:1018-1021`, `:856` |
| A7 | [INCONSISTENT] | Language mix inside one flow: delete toasts in English, scan modal «Cancel» / «Analyzing...» / «AI Extraction» / «Only JPG / PNG / PDF supported», confirm «…order με ίδιο client… duplicate;», title «Νέα National Order από Scan». | `:1836`, `:1950`, `:1996`, `:2057`, `:2015`, `:1296`, `:1967` |
| A8 | [INCONSISTENT] | Same board, three names: «Weekly National» (card link, `:361`), «Εβδομαδιαίο» (`:146-148`), «Εβδομαδιαίο Εθνικών» (`:869`, sidebar). Same for «Groupage» vs «Εθνική Ομαδοποίηση» (`:1402`) vs «ομαδοποίηση» (`:145`). | as cited |
| A9 | [INCONSISTENT] | Internal table names reach the user: preview «Θα γραφτούν: N NAT ORDERS → M GROUPAGE LINES → 1 CONSOLIDATED LOAD → 1 NAT LOAD», error «…στα CONSOLIDATED LOADS», tooltip «…αφαιρεί NL/GL/CL/Ramp/Παλέτες». | `:761`, `:816`, `:371` |
| A10 | [INCONSISTENT] | Delete asks with native `confirm()`; every other question in the file uses `confirmAction`. | `:1833` vs `:1251` |
| A11 | [EXTRA] | After L the card still shows «Επεξεργασία» / «Διαγραφή» for owner and dispatcher, but for a v5 order the first only redirects and the second only prints a refusal toast. | `:334`, `:370-371`, `:889-892`, `:1827-1831` |
| A12 | [EXTRA] | `_NATL_Q10.accountant` and the «μόνο ανάγνωση για τον ρόλο σου» branch: `openNatlEdit` is called only from the card behind `canEdit` (owner/dispatcher) and from the legacy board (`weekly_natl.js:1579`, behind the v5 seam `:146`). Unreachable with the shipped flags. | `:856`, `:911`, `:334` |
| A13 | [EXTRA] | Dead exports / leftovers: `window._grpSet`, `_natlClientDrop`, `_natlLocDrop`, `_natlShowDrop`, `_natlPickLinked` (no caller in app.html, core, modules); `window._natlScanPending` written, never read; `closeNatlDetail` / `selectNatlOrder` still query `#natlTable` / `#nrow_*`, which no module renders; `fields['Total Pallets']` validation on a key never set; stale `FIXME(audit)` comments above code that already only un-assigns. | `:710`, `:2584`, `:2594-2597`, `:2455`, `:2511`, `:213`, `:265-266`, `:1226`, `:1386`, `:1607`, `:1906` |
| A14 | [EXTRA] | With `WN_V5 'on'` and state "after", the create form, groupage mode, scan and `_natlSendToWeekly` are redirects/refusals: ~1,500 lines shipped for a path the code itself closes. Not verified which state production returns. | `:870-872`, `:1965`, `:1131`; `weekly_natl.js:146` |
| A15 | [MISSING] | A scanned national document cannot be stored with the order; the user is told after save. | `:1303-1307`, `order-docs.js:804-809` |
| A16 | [MISSING] | No print / driver sheet from this card or form (print.html reads ORDERS only — see section B). | `print.html:257`, `:746` |
| A17 | [LOCKED] | Invoiced is a chip/row, not a status; Veroia Switch not offered as a national type; GL never deleted; `national_orders` holds no VS rows. | `:303`, `:349`, `:1005`, `:1390` |

### 5. States the redesign must draw

| State | Today | file:line |
|---|---|---|
| Form cannot open | locations list empty/failed → danger toast, no modal | `:960-966` |
| Loading | none for the modal (awaits locations + stops before opening, no spinner); scan has spinner lines; submit button «Αποθήκευση…» disabled | `:961`, `:978`, `:1153`, `:2057` |
| Half-filled | one warn toast listing every missing item; PE box gets red border + hint «Υποχρεωτικό — διάλεξε ΝΑΙ ή ΟΧΙ» (`form-helpers.js:637-642`); no per-field markers otherwise | `:1202-1236` |
| Edit, stops read failed | delivery rows open without pallets/date; save refused until filled | `:975-984`, `:1214` |
| View-only role | card without buttons; accountant gets «Διόρθωση» | `:334-335` |
| After-L locked edit | disabled inputs + grey note; submit hidden when nothing allowed | `:900-916` |
| Card: unknown assignment | chip «ΑΝΑΘΕΣΗ ΑΓΝΩΣΤΗ» + long sentence; v5 variant | `:147-149`, `:300`, `:359` |
| Card: empty values | «— δεν έχει καταχωρηθεί» dimmed; route with no stops shows the same | `:223`, `:325` |
| Names still loading | card prints the record id for an unresolved client/location | `:285`, `:319` |
| Many rows | 10 delivery rows max per order / per groupage truck; add buttons silently do nothing at the limit | `:615`, `:695`, `:800` |
| Groupage over capacity | counter turns amber ≥30, red >33 with «Ξεπερνά τις 33 παλέτες.»; save still allowed | `:751-757` |
| Partial write | see toasts in 2d; groupage chain leaves orphans and says so | `:811-817` |

---

## Εκτυπώσεις (`print.html`, 1518 lines, and every print opened from the scope modules)

### 1. Who sees it

`print.html` is a standalone page (no `config.js`, no `core/utils.js`; loads only `core/share-helpers.js` and `core/countries.js`, `print.html:247-248`). It has no role check of its own: it sends the app's JWT from `localStorage` and shows what the Worker returns (`:330-345`). It is opened by dispatchers/owner from the Weekly International printer buttons and, read-only in an iframe, by anyone using «Παραγγελίες › Εβδομάδα» and «Παλέτες › Εβδομάδα» (`orders_week_view.js:2093-2101`, `pallets_week.js:9`). Use (inference): once per assigned truck, per leg; the WhatsApp text is the main hand-over to the driver.

It prints **international orders only**: one table constant for orders (`T_ORDERS`, `:257`) and `atGet(T_ORDERS, id)` (`:746`).

### 2. Inventory

#### 2a. Query parameters

| Param | Meaning | file:line |
|---|---|---|
| `orderId` | one order | `:274` |
| `orderIds=a,b,c` | group packet: cover + one sheet per order, page break between, tag «ΟΜΑΔΙΚΟ ΦΟΡΤΙΟ — ΕΓΓΡΑΦΟ i / N» | `:278-279`, `:759-767`, `:1476` |
| `leg=export\|import` (default export) | labels, which end is replaced by the Veroia cross-dock, which half of a group follows the dispatcher's order | `:284`, `:846-861`, `:1078` |
| `sheet=partner\|driver` | forces the sheet; absent → partner if `Is Partner Trip` or a `Partner` link | `:283`, `:1038-1040` |
| `noprint=1` | no automatic print dialog (iframe preview, Worker PDF render) | `:1512` |

#### 2b. Document types

| Document | Language | Regions, top to bottom | file:line |
|---|---|---|---|
| **Driver sheet** «Εντολή Οδηγού — Εξαγωγή/Εισαγωγή — Wnn» | Greek (`LBL_GR`) | brand block left (PETRAS GROUP + legal entity, address, e-mail) · doc tag right (title, week · leg, «Έκδοση» date-time · printing user, «ORDER n · REF x», «Ακυρώνει κάθε προηγούμενη εντολή…») · navy vehicle bar: Οδηγός, Φορτηγό, Τρέιλερ, Μικτό βάρος/Απόβαρο · route box Από → Προς with dates · cargo chips (Παλέτες × type, Ανταλλαγή παλετών, Θερμοκρασία, Εμπόρευμα, Μικτό βάρος, «Σημάνσεις High Risk») · CMR line · meta grid (Ημερομηνία, Εβδομάδα, Κατηγορία, Dispatcher, Αρ. Εντολής, Reference, Απόθεμα, Σημάνσεις badges) · timeline of stop cards (loading, cross-dock, delivery; numbered per section) · notes box · checklist «ΠΡΙΝ ΤΗΝ ΑΝΑΧΩΡΗΣΗ» (4 boxes) · contact strip · two signature boxes | `:1215-1276`, `:1128-1175` |
| **Partner sheet** «Partner Assignment Order — Export/Import — PAO-Wnn-n» | English (`LBL_EN`) | carrier block left (company, VAT, address, e-mail, plates tag) · brand block right (with legal entity + VAT) · title bar · meta grid · route box · rate bar «Agreed Rate» + fixed payment terms text · cargo chips (no High Risk chip) · timeline · notes · contact strip · signatures | `:1179-1214` |
| **Group cover** «Εντολή Οδηγού · Ομάδα» / «Partner Assignment Order — Group» | follows the first order's sheet | brand + doc tag · vehicle bar (driver sheet only) · route box (first loading → last delivery of the whole route) · 4 chips merged across orders (pallets by type, PE «ΝΑΙ — μόνο A …», temperatures, goods) · CMR line · meta (week, category, order numbers, «ΣΕΙΡΑ ΠΑΡΑΔΟΣΗΣ» A → B) · section «ΦΟΡΤΩΣΕΙΣ» cards, section «ΠΑΡΑΔΟΣΕΙΣ» cards, each tagged «ΠΑΡΑΓΓΕΛΙΑ A · n · last drop» · checklist · contact · signatures | `:1293-1445` |
| **WhatsApp text** (not paper) | GR driver / EN partner | header 🚛 ΕΝΤΟΛΗ Wnn · leg · number; 👤 driver · plates; sections ΦΟΡΤΩΣΗ/ΦΟΡΤΩΣΕΙΣ and ΠΑΡΑΔΟΣΗ/ΠΑΡΑΔΟΣΕΙΣ with keycap numbers, date, pallets, name, address, coordinates line, Maps link; cargo block under the first loading (Ref, pallets, goods, temperature, PE, stock, notes); CMR line; office line; «Αυτοματοποιημένο μήνυμα…» | `:863-1028` |

Stop card (`buildCard`, `:438-473`): number bubble, QR (image from a third-party QR service, hidden on load error, `:398-402`), type badge ΦΟΡΤΩΣΗ / ΠΑΡΑΔΟΣΗ / CROSS-DOCK, location name, address + coordinates + Maps link, date («& ώρα» wording only when a real time exists, `:412-416`, `:458-460`), Ωράριο, Ημέρες παράδοσης, Παλέτες × type; on the first card of a section also Εμπόρευμα, Ανταλλαγή παλετών, Μικτό βάρος, Θερμοκρασία, Ψυγείο.

Screen-only toolbar (`.pbar`, navy, fixed): logo, document title, «📋 WhatsApp» (copy to clipboard, turns «✓ Αντιγράφηκε»), «Print / PDF» (`window.print()`); right-click / long-press on «Print / PDF» opens the share menu (`:1154-1159`, `:1499-1509`). Auto print 700 ms after render (`:1512`). Paper: `@page A4, margin 9mm` (`:233`).

Branding: one brand only — «PETRAS GROUP» wordmark, sub-line «International Road Transport Services», legal entity line. No DPS variant anywhere in the file (grep "DPS": none).

#### 2c. Data read (all GET through the Worker facade, `PROXY_URL/v0/<base>/<table>`, `:334-345`)

| Table (facade id → Postgres) | Fields | file:line |
|---|---|---|
| PARTNERS → `partners` | Company Name, VAT Number, Adress, Email | `:730` |
| TRUCKS, TRAILERS | License Plate, Tare Weight kg | `:731-732` |
| DRIVERS | Full Name | `:733` |
| LOCATIONS | whole table, all fields, paged by 100 | `:728`, `:734` |
| ORDERS → `orders` | one GET per id, all fields, sequential | `:745-746` |
| ORDER STOPS | `OR(RECORD_ID()=…)` over the order's `ORDER STOPS` ids | `:748-753` |
| CLIENTS | one GET per client, only for a stock piece on a driver sheet | `:680-695` |
| POST `/app-errors` | failure of the group WhatsApp text | `:317-328`, `:777` |

Order fields read include: `Order No`, `Reference`, `Week Number`, `Loading/Delivery DateTime`, `Loading/Delivery Summary`, `Loading Location 1`, `Unloading Location 1..10`, `Total Pallets`, `Pallet Type`, `Goods`, `Pallet Exchange`, `Gross Weight kg`, `Temperature °C`, `Temp Per CMR`, `Refrigerator Mode`, `Veroia Switch`, `Veroia Cross-dock`, `Cross-dock Date` / `VS CD Date`, `Partner`, `Is Partner Trip`, `Partner Rate`, `Partner Truck Plates`, `Driver`, `Truck`, `Trailer`, `High Risk Flag`, `National Groupage`, `Notes`, `Parent Order`, `Leg No`, `Stock Lot*`, `Own Stock Lot`, `Client`.

#### 2d. PDF / share path

`core/share-helpers.js` — one menu for every print button: «Εκτύπωση», «Λήψη PDF», «Κοινή χρήση PDF», «Κοινή χρήση κειμένου», «Αντιγραφή κειμένου» (`share-helpers.js:125-134`); opened by right-click or 550 ms long-press (`:158-180`); PDF options only when the caller gives `pdfUrl`. PDF = `GET <Worker>/print/pdf?<same query>` with the JWT (`:33-43`); the Worker checks the caller, accepts only `orderId`, `orderIds`, `leg`, `sheet`, renders this same `print.html` (`noprint=1`) in a headless browser, waits for `.p-doc`, returns PDF or `format=text` (the page's `_waArr`), cached 60 s per query (`worker/src/index.js:7815-7866`). Fallback chain: share file → share text + toast → download + toast (`share-helpers.js:60-81`). Failures: toast + `logError` when available (`:48-51`).

#### 2e. Every print opened from the scope modules

| Caller | Button / trigger | What prints | How | file:line |
|---|---|---|---|---|
| `modules/orders_week_view.js` «Έγγραφα ανάθεσης» overlay | click on a row's ΑΝΑΘΕΣΗ (`data-owvdoc`) | `print.html` per leg (driver/partner, group packet) in iframes, read-only, each printed from its own bar | **relative** `print.html?…&noprint=1` | `:2050-2076`, `:2093-2101` |
| same, national v5 row | `data-owvnatdoc` | v5 driver sheet from `WN5Sheet.sheetDoc` in `srcdoc` iframes; «Εκτύπωση» calls the iframe's `print()`; «δεν βγήκε» when a sheet cannot be built | in page | `:2107-2127`, `:1496` |
| same, «Εκτύπωση» of the week | toolbar | «Εβδομάδα τιμολόγησης» A4 portrait built into `#owvPrint`, `body.owv-printing`, `window.print()` | in-page print layer, `assets/style.css:10580-10586` | `:2319-2332` |
| `modules/orders_catalog.js` | «Εκτύπωση» | list of filtered orders, A4 landscape, 9 columns (ΑΡ., ΑΝΑΦΟΡΑ, ΠΕΛΑΤΗΣ, ΦΟΡΤΩΣΗ, ΠΑΡΑΔΟΣΗ, ΠΑΛ., ΚΑΤΑΣΤΑΣΗ, ΤΙΜΗ €, ΤΙΜΟΛΟΓΙΟ) | `OrdersList.printOpen` popup, auto print 300 ms | `:336`, `:542-554` |
| `modules/orders_invoicing_view.js` | «Εκτύπωση» | «Προς τιμολόγηση — period», grouped by client with VAT, total row, A4 landscape | popup, print on load | `:351`, `:1144-1173` |
| `modules/orders_noprice_view.js` | «Εκτύπωση» | «Παραγγελίες χωρίς τιμή» A4 portrait: brand, sub-title, 8 columns incl. empty price box and note line, sign-off grid | popup, auto print | `:251`, `:560-613` |
| `modules/daily_ops.js` | «Εκτύπωση» | «Ημερήσιο Πλάνο»: copy of `.ops-sections` innerHTML, buttons and last column hidden, no colours | bare `window.open` popup, print after 400 ms | `:812`, `:1827-1864` |
| `modules/daily_ramp.js` | «Εκτύπωση» | «Πίνακας Ράμπας — Vermion Fresh»: copy of `#content` innerHTML, token colours read from `:root` | bare `window.open` popup, print after 500 ms | `:601`, `:1110-1153` |
| `core/utils.js` `printOrderSheet` / `printSheetQuery` | used by Weekly International only (`weekly_intl.js:1577`, `:3083`, `:6995`) — none of the scope modules call `printOrderSheet`; the Week view reuses `printSheetQuery` | `print.html` in a new tab | **absolute production URL** | `core/utils.js:2005-2011` |
| `core/utils.js` `_printWeekShell` | Weekly boards | week table | popup with blocked-popup toast | `core/utils.js:1985-1995` |
| `core/order-docs.js` | — | no print: opens an attached file in a new tab | — | `order-docs.js:457-470` |
| `modules/orders_intl.js`, `modules/orders_natl.js` | — | no print of their own | — | grep: none |

`@media print` in `assets/style.css`: Weekly boards landscape block (`:4166`), wi4 (`:9003`), wn5 (`:9895`), Week view (`:10544`), docs overlay hidden (`:10575`), week paper (`:10583`), editor hidden (`:10660`).

Out of scope, exist: `print_payroll.html` (payroll A4, opened by `modules/payroll_print.js:17`); `core/week-paper.js` (week print of the Weekly boards); `modules/pnl_paper.js` (P&L papers); also `modules/wn5_sheet.js` (v5 national driver sheet).

### 3. Business logic that must survive

- One renderer for paper, PDF and WhatsApp text: the Worker renders this page; the text is the page's `_waArr` (`print.html:1498-1507`, Worker `:7852`).
- Sheet language is a rule: partner = English, driver = Greek, country names follow (`:357-361`, `:1090`).
- The partner sheet names the Veroia stop by its address only — no cross-dock wording, no internal brand (`:1062-1066`). [LOCKED: Veroia Switch is never told to third parties]
- Veroia leg date = the one cross-dock date, else export Loading +1 day / import Delivery −1 day, shifted on the written date, not through UTC (`:500-513`). [LOCKED]
- «Κατά CMR» wins over any number; every sheet and every text ends with the keep-CMR-temperature line (`:424-433`, `:972`).
- Stop dates come from the stop's own `DateTime`, order date only as fallback; header strip and cards read the same value (`:531-538`).
- Fallback chain for places: ORDER STOPS → summary text → flat `Loading Location 1` / last `Unloading Location n` → «—» (`:476-487`, `:799-822`).
- Group route: loadings 1..N then deliveries 1..M, numbering restarts per section; the dispatcher's order decides drops of an export group / pickups of an import group, the other half by date (`:846-861`). Cover and text share it.
- Pallets per stop; an order total is used only for an order's single stop on that side (`:903-910`).
- Gross weight on the driver sheet = truck tare + trailer tare + cargo only when all three are known; otherwise «Απόβαρο» or cargo with a red «χωρίς απόβαρο …» (`:1220-1243`).
- Stock piece: «Απόθεμα · Ref … · παρτίδα n · client» on the driver sheet; lot delivery never says pallet exchange YES (`:665-670`, `:607`).
- Rate («Agreed Rate», `Partner Rate`) prints on the partner sheet only (`:1203-1206`).

### 4. Findings

| # | Tag | Finding | Evidence |
|---|---|---|---|
| B1 | [INCONSISTENT] | Three ways to address the same page: absolute production URL (`core/utils.js:2009`, `weekly_intl.js:6860`, `:6878`, `:8259`), relative `print.html?` (`orders_week_view.js:2100`; `payroll_print.js:17` for its own page), and the Worker's `ALLOWED_ORIGIN + "/PETRASGROUP-TMS/print.html"` (`worker/src/index.js:7841-7842`). A local or staging copy of the app opens production's print page from the Weekly but its own from the Week view. | as cited |
| B2 | [BROKEN] | No `response.ok` check on any read (`:338`, `:343`). With an expired session the reference tables come back as empty lists and the order read has no `fields`, so `orderR.fields['ORDER STOPS']` throws and the page shows a raw English «Error: …» instead of the "not logged in" text, which only covers a missing token. Code path verified; the 401 body shape is inferred. | `:334-345`, `:746-748`, `:718-723`, `:781` |
| B3 | [BROKEN] | A failed ORDER STOPS read is `console.warn` only; the sheet is then built from the summary / flat columns (one loading, last unloading) with no banner — a multi-stop order prints as two stops. The locations and client failures do get a red banner. | `:750-753` vs `:1457-1468` |
| B4 | [MISSING] | National orders and national loads have no sheet in `print.html` (ORDERS only). The legacy national card/form has no print; v5 nationals print through a different renderer (`wn5_sheet.js`) with its own layout. Two driver-sheet designs for one driver. | `:257`, `:746`; `orders_week_view.js:2103-2105` |
| B5 | [MISSING] | Office and emergency phone constants are empty strings; the labels «Γραφείο κίνησης» / «Έκτακτα 24h» / «Dispo» / «Emergency 24h» and the ☎️ line can never print. The WhatsApp closing tells the driver to "contact the office" without a number. | `:267-268`, `:940-942`, `:1144-1145` |
| B6 | [INCONSISTENT] | The Greek driver sheet carries English labels: «Dispatcher», «Reference», «ORDER … · REF …», «Notes:», «High Risk», toolbar «Print / PDF», loader «Loading…», error «Error: …». | `:1164`, `:1255`, `:1112`, `:1139`, `:1158`, `:244`, `:781` |
| B7 | [INCONSISTENT] | Payment terms on the partner sheet are fixed text; the printing user's name falls back to a hard-coded person; the legal entity, address and e-mails are literals repeated in three places (partner header, driver header, cover). No single company block. | `:1205`, `:265`, `:1197`, `:1249`, `:1435`, `:269-270` |
| B8 | [INCONSISTENT] | Paper margins differ by route: browser print `@page margin 9mm` (`:233`) vs Worker PDF `10mm/8mm` (`worker/src/index.js:7855-7857`). | as cited |
| B9 | [EXTRA] | Dead CSS from earlier designs still shipped in the page: `.driver-block`, `.price-bar`, `.stop-card` family, `.stop-badge`, `.temp-*`, `.sig-table`, `.route-strip`/`.rs-*`, `.stop-n`, `.pal-n`, `.hd2`, `.notes2` — no element uses them (grep of the script part). Also `wk=f['Week Number']\|\|f['Week Number']` and the unused `num` argument of `buildCard`. | `:54-59`, `:78-86`, `:96-118`, `:136-157`, `:160`, `:218-219`, `:1080`, `:438` |
| B10 | [INCONSISTENT] | Six print mechanisms in scope: standalone page (`print.html`), in-page print layer (Week), `OrdersList.printOpen` popup with its own inline CSS (catalog, invoicing, no-price — three different type scales and headers), raw `window.open` + innerHTML copy (Daily Ops, Ramp), `_printWeekShell`. Only `printOpen` and `_printWeekShell` handle a blocked popup; Daily Ops and Ramp call `win.document.write` on a possibly null window. | `orders-list.js:146-151`, `daily_ops.js:1835-1836`, `daily_ramp.js:1117-1118`, `core/utils.js:1986-1987` |
| B11 | [INCONSISTENT] | Brand on paper varies: «PETRAS GROUP» wordmark + legal entity (`print.html`), «PETRAS GROUP» only (no-price list, `orders_noprice_view.js:596`), «Πίνακας Ράμπας — Vermion Fresh» (window title, `daily_ramp.js:1118`), no brand (catalog list, invoicing list, Daily Ops). | as cited |
| B12 | [INCONSISTENT] | The no-price paper prints a staff member's first name twice as fixed text (sign-off line and return instruction) instead of a role or the logged-in user. | `orders_noprice_view.js:607`, `:609` |
| B13 | [LOCKED] | The TMS prints no invoice; the invoicing list is a worksheet for the ERP. The partner sheet hides the Veroia naming. | `orders_invoicing_view.js:1128-1139` (ERP sheet CSV), `print.html:1062-1066` |

### 5. States the redesign must draw

| State | Today | file:line |
|---|---|---|
| No `orderId`/`orderIds` | centred card «Λείπει ο κωδικός παραγγελίας» + explanation + link «Επιστροφή στο TMS» | `print.html:706-715` |
| No token | red bilingual line (Greek + English) | `:718-723` |
| Loading | spinner + «Loading…» | `:244` |
| Any exception | red «Error: <message>» in place of the page | `:781` |
| Locations not loaded | red box «⚠ ΟΙ ΤΟΠΟΘΕΣΙΕΣ ΔΕΝ ΦΟΡΤΩΘΗΚΑΝ … ΜΗΝ δώσεις αυτό το φύλλο στον οδηγό», printed on paper too | `:1457-1462` |
| Piece client not read | red box «⚠ ΤΟ ΟΝΟΜΑ ΠΕΛΑΤΗ ΤΟΥ ΚΟΜΜΑΤΙΟΥ ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ…»; a 403 (role by design) prints «—» quietly | `:1463-1468`, `:676-693` |
| Group text failed | amber box (screen only, hidden on paper) + per-order texts as fallback | `:1469-1474`, `:235` |
| Missing values | «—» for place, driver, plates, rate, weight; chips for temperature/goods/weight simply absent | `:289`, `:305`, `:1136-1138`, `:1260-1263` |
| Unassigned order on a driver sheet | vehicle bar prints three «—» | `:1260-1262` |
| Many stops | cards avoid page breaks; WhatsApp numbers past 10 become two keycaps | `:195`, `:868` |
| Group | cover first, then N sheets without toolbar, each tagged i / N | `:759-767`, `:1476` |
| Notes with alarm words | notes box switches to the "urgent" style with ⚠ | `:1111-1112` |
| Preview in app | iframe 1180px tall per document, title above; legs on another week said in a line | `orders_week_view.js:2094-2100`, `assets/style.css:10574` |
| Share menu | white floating menu, 5 items; PDF failure → danger toast «Το PDF δεν δημιουργήθηκε: …» | `share-helpers.js:124-150`, `:61`, `:109` |
| Empty list prints | invoicing: warn toast, nothing opens (`orders_invoicing_view.js:1146`); no-price: table row «Καμία παραγγελία χωρίς τιμή.» (`orders_noprice_view.js:603`); catalog: prints an empty table (`orders_catalog.js:542-554`) | as cited |
| Names still loading | catalog print/CSV refused with a warn toast | `orders_catalog.js:526` |
| Daily Ops relays loading | print refused with a warn toast | `daily_ops.js:1834` |
