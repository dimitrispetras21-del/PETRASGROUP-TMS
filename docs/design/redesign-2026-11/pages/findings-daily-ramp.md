# Ημερήσιο και Ράμπα: έλεγχος λειτουργιών της σημερινής σελίδας (15/11/2026)

Ανάγνωση κώδικα μόνο. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν συγκρίθηκε ο Worker που τρέχει με τον κώδικα του repo. Τίποτα δεν διορθώθηκε.

## Σύνοψη

Κανόνας του owner που ισχύει παντού: κάποιες κινήσεις γράφονται εκ των υστέρων, ενώ η δουλειά ήδη τρέχει. Άρα όπου λείπει έλεγχος, η απάντηση είναι προειδοποίηση, ποτέ άρνηση.

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Φόρτωση που δεν δηλώνεται ποτέ.** Μια παραγγελία με μία φόρτωση, που εκκρεμεί από προηγούμενη ημέρα και παραδίδει σήμερα, μπορεί σε γεμάτη ημέρα να φανεί σαν να έχει δύο ίδια σημεία. Πατάς «Φορτώθηκε» στο ένα, η οθόνη λέει «1/2» και η παραγγελία δεν προχωρά, όσες φορές κι αν πατήσεις. (F12)
2. **Παραδομένη παραγγελία γυρίζει σε «σε μεταφορά».** Σε παραγγελία με πολλά σημεία φόρτωσης, αν δηλώσεις το τελευταίο σημείο φόρτωσης αφού έχει ήδη δηλωθεί η παράδοση, η παραγγελία ξαναγίνεται «σε μεταφορά». (F13)
3. **Εκκρεμής παράδοση γράφεται με σημερινή ημερομηνία.** Ό,τι δηλώνεις από τη ζώνη «εκκρεμείς παραδόσεις» παίρνει ημέρα παράδοσης το σήμερα, ακόμη κι αν παραδόθηκε το Σάββατο. Για τη σωστή ημέρα πρέπει να πας σε εκείνη την ημέρα και να δηλώσεις από εκεί· η οθόνη δεν το λέει. (F15)
4. **Η Ράμπα δείχνει ό,τι ίσχυε όταν φτιάχτηκε η γραμμή.** Φορτηγό, οδηγός, παλέτες και πελάτης αντιγράφονται μία φορά. Αν το φορτηγό μπει μετά, η Ράμπα γράφει «—» για πάντα. Φορτηγό συνεργάτη δεν φαίνεται ποτέ. Γραμμές που φτιάχτηκαν ενώ ήσουν σε άλλη σελίδα μπορεί να έχουν πελάτη «—» και κανέναν τόπο. (F17, F18)
5. **Αλλαγή ημέρας αφήνει δύο γραμμές στη Ράμπα.** Η παλιά μένει «προγραμματισμένη» στην παλιά ημέρα και φτιάχνεται νέα στη νέα. Η «Αναβολή» της Ράμπας, αντίστροφα, δεν αλλάζει την ημέρα της παραγγελίας: το Ημερήσιο συνεχίζει να τη δείχνει σήμερα. (F19, F20)
6. **Εξαγωγή μέσω Βέροιας: το «Αύριο» τη στέλνει μεθαύριο.** Η γραμμή φαίνεται την ημέρα Βέροιας, αλλά η αλλαγή γράφει την ημέρα φόρτωσης, που είναι μία ημέρα πριν. (F14)
7. **Το απόθεμα της Ράμπας μόνο μεγαλώνει.** Κάθε «Παρελήφθη» προσθέτει παλέτες· καμία «Φορτώθηκε» δεν αφαιρεί. Οι εθνικές αφίξεις του νέου πίνακα δεν μπαίνουν καθόλου. Το νούμερο δεν είναι το απόθεμα. (F23)
8. **«Φορτώθηκε» στη Ράμπα δεν είναι το ίδιο με «Φορτώθηκε» στο Ημερήσιο.** Η Ράμπα αλλάζει μόνο την κατάσταση· δεν γράφει ποιος και πότε, ούτε την ημέρα Βέροιας. Και η παραλαβή εισαγωγής στην αποθήκη δεν κλείνει την παράδοση. (F21)
9. **Κοινό φορτηγό: η αλλαγή ημέρας και η δήλωση γίνονται ανά παραγγελία.** Πέντε φορτία στο ίδιο φορτηγό θέλουν πέντε αλλαγές ημέρας και πέντε «Φορτώθηκε» με πέντε επιβεβαιώσεις. Αν αλλάξεις το ένα, τα άλλα μένουν πίσω χωρίς προειδοποίηση. (F16, F35)
10. **Νέα γραμμή Ράμπας με ώρα ή με μισή παλέτα δεν αποθηκεύεται**, και το μήνυμα δεν λέει γιατί. (F22)
11. **Η οθόνη σωπαίνει όταν κάτι δεν διαβάστηκε.** Αν δεν διαβαστούν τα σημεία, το Ημερήσιο δείχνει «—» παντού και η δήλωση γράφεται χωρίς σφραγίδα σημείου. Αν δεν διαβαστεί η ανάθεση του ζεύγους, η εισαγωγή δείχνει κόκκινο «ΠΡΟΣ ΑΝΑΘΕΣΗ» ενώ έχει φορτηγό. Η Ράμπα, αν δεν διαβάσει τα σημεία της ημέρας, απλώς δείχνει λιγότερες γραμμές. (F28, F30, F31)
12. **Αναζήτηση και φίλτρα δεν βρίσκουν ό,τι περιμένεις.** Η αναζήτηση δεν ψάχνει συνεργάτη, πινακίδες συνεργάτη, ρυμούλκα ή δεύτερα σημεία, και δεν πιάνει τις εκκρεμείς. Ακυρωμένη παλιά παραγγελία εμφανίζεται ως «Εκκρεμεί» με κουμπί. (F5, F6, F11)
13. **Οι αριθμοί δεν συμφωνούν.** Η κεφαλίδα μετρά δύο φορές την παραγγελία που φορτώνει και παραδίδει την ίδια ημέρα· το υποσέλιδο μετρά και γραμμές που δεν φαίνονται πουθενά. (F32)

### (β) Τι δεν κρίθηκε από τον κώδικα

- Πόσο συχνά συμβαίνει το 1 (θέλει μέτρηση σε γεμάτη ημέρα).
- Αν η βάση αρνείται κάποια από τις λάθος εγγραφές (2, 10) με δικό της κανόνα.
- Το κομμάτι των παλετών που τρέχει μετά το «Παραδόθηκε», και το παράθυρο μετατροπής pre-order.
- Ο νέος πίνακας εθνικών, από όπου η Ράμπα διαβάζει τις εθνικές κινήσεις.

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Πόσες γραμμές Ράμπας έχουν σήμερα πελάτη «—» ή φορτηγό «—» ενώ η παραγγελία έχει φορτηγό.
- Πόσες «προγραμματισμένες» γραμμές Ράμπας έχουν μείνει σε περασμένες ημέρες.
- Πόσο μεγάλη είναι η ζώνη εκκρεμών (δεν έχει όριο προς τα πίσω).
- Αν δύο άνθρωποι που ανοίγουν τη Ράμπα μαζί φτιάχνουν διπλές γραμμές.
- Τι λέει το «Σύνολο αποθέματος» σε σχέση με ό,τι υπάρχει πραγματικά στην αποθήκη.

---

# Detailed findings (English)

Files: `modules/daily_ops.js` (DO), `modules/daily_ramp.js` (DR), `core/relay.js` (RL), `core/order-sync.js` (OS), `worker/src/index.js` (W). Confidence: **C** = confirmed in code, **L** = likely, **A** = needs a look in the live app. Label checks against the Worker maps: every label DO and DR write or read exists in its table map (ORDERS `W:1317-1560`, ORDER STOPS `W:1769-1835`, RAMP `W:1169-1234`), with the exceptions named in F5; both quoted and unquoted forms were searched.

## 1. What the lists, typeaheads and filters offer

**F1. Ramp «Νέα άφιξη / αναχώρηση»: the truck and driver lists cannot name most arrivals.** `DR:85-86`, `1025-1046`. The truck list is our own active tractors; the driver list is every active driver, not tied to the truck. No partner, no free plate, no trailer. The client is free text, not the client list. Scenario: a supplier's or partner's lorry arrives at the dock; the user can record client text and pallets, but no plate. The typed client name later becomes the stock grouping key (F23), so two spellings are two customers. **C.** Redesign: client from the client list with free text as fallback; vehicle = our truck, a partner with plates, or a typed plate.

**F2. Ramp category: three vocabularies, one unreachable.** `DR:404`, `1027`, `563-565`, `247`. The modal offers `Other`; the automatic rows write `Direct`; the filter «Απευθείας» matches only rows with no category, so neither is reachable, while the national-board rows without Veroia Switch fall under «Απευθείας». The category is not drawn on any row (`DR:541-547` has no caller). **C.** Redesign: one category list, shown on the row, same values in form and filter.

**F3. Half-hour lists hide any other time.** `DR:587`, `714`; `DO:1078-1080`. A stored time that is not on the half hour selects no option and reads «--:--», as if unset. **L.** Redesign: typed time with suggestions, the stored value always visible.

**F4. One field, two meanings.** `DO:864-865`, `1124-1125`. Import loadings edit it as «ΩΡΑ», both delivery sections as «ΕΚΤ. ΑΦΙΞΗ». Scenario: the loading hour is set on Monday; on Wednesday someone sets the expected arrival; the loading hour is gone. Export loadings have no hour at all. **C.** Redesign: an hour per point (the per-stop window labels exist in the map, `W:1817-1818`), not one hour per order.

**F5. Daily search misses what the dispatcher types.** `DO:463-471`, `752-765`. It reads client, own tractor plate, driver, the FIRST loading and FIRST unloading place. Not searched: trailer, partner name, partner plates, later points, pre-order country. Two fallbacks (`Loading Points`, `Delivery Points`) are neither requested nor in the ORDERS map, always empty. The overdue zones ignore search and both filters. **C.** Redesign: search everything the row shows, in the zones too.

**F6. Status filter speaks another language than the column, and silently rescales the counters.** `DO:802-808`, `950-962`, `718-723`, `779-781`. Options are the stored words («Σε αναμονή», «Ανατεθειμένο»…); the column says only «Εκκρεμεί» or done. With a filter on, «x / y δηλωμένες» and the header count shrink with no sign other than «Καθαρισμός». **C.** Redesign: filter by what the column says (pending / done / unassigned), counters always of the whole day.

**F7. No order inside a section.** `DO:882`, `DR:112`. Daily rows are in the order the request returned them; nothing sorts by truck, client or hour. Ramp rows sort by time, rows without time in fetch order at the end. **C.** Redesign: a stated order (by truck, then client), groups kept together.

**F8. Overdue zones: no floor, and one zone hides the other fact.** `DO:154`, `159`, `191-200`. Every order with a past date and an open status is listed, however old. An order that never loaded AND whose delivery day has passed appears only under «εκκρεμείς παραδόσεις» with «Παραδόθηκε»; that it was never declared loaded is not said. Corrective-move rule: declaring it delivered is legitimate; the page should say «δεν δηλώθηκε φόρτωση». **C** (size of the zone: **A**).

**F9. «Αλλαγή ημέρας» accepts any date.** `DO:1646-1659`, `1693-1699`. «Άλλη…» takes a delivery day before the loading day; with the box unticked a loading day after the delivery day. No word about it. Corrective-move rule: allowed, with a warning line in the popover, never a refusal. **C.**

**F10. Local-driver panel (opened from the «ΤΟΠ.» chip).** `RL:273-280`, `342`. Trailers: every trailer, inactive included. Drivers: every active driver alphabetically, the usual local drivers not first. Hand-over point: every location. Correct: the order's own driver is shown disabled with the reason, the order's own tractor is not offered under «άλλος». **C.** Redesign: usual choices first, inactive marked, the rest still selectable.

**F11. A cancelled order is offered as pending.** `DO:152`, `950-962`, `1007`. The day request has no status condition; the status word knows only loaded / delivered. A legacy cancelled order on the day reads «Εκκρεμεί» with a live «Φορτώθηκε». **C.** Redesign: its own word and no primary button.

## 2. What is written wrong or lost

**F12. A single-stop order can become undeclarable.** `DO:271-284`, `1289-1293`, `1477`, `1484-1493`. Stop ids are collected from day rows + overdue deliveries + overdue loadings without de-duplication; the same order is deliberately allowed in both the day and the overdue-loadings list (`DO:193-200`). Stops are fetched in batches of 90 and pushed into a per-order list, also without de-duplication. When the two copies of a stop id fall in different batches, the order holds the same stop twice. Scenario: one loading, overdue from Saturday, delivery today, busy day (more than about 90 stop ids). The row shows «0/2 φορτώθηκαν»; «Φορτώθηκε» only opens the points; pressing one point stamps it and says «1/2 — η παραγγελία μένει ως έχει»; the second button stamps the same stop again (lookup by id returns the first copy) and still says 1/2. After a reload both copies read declared, no button remains, the order is still not «σε μεταφορά». **C** for the mechanism; frequency **A**. Redesign: one point, one row, whatever list brought it.

**F13. A late loading declaration demotes a delivered order.** `DO:1130-1131`, `1454`, `1485-1491`, `1536`. On a multi-point order the row stays clickable when done; undeclared points keep their buttons. Declaring the last loading point always writes `In Transit`, with no look at the current status. Scenario: two loading points, one never declared; the order is delivered; next morning someone tidies up and declares the missing point; the order is «σε μεταφορά» again and returns to the overdue deliveries. **C** (whether the base refuses the step back: **A**). Redesign: a late point is stamped, the order's state never moves backwards.

**F14. Veroia-Switch export: «Αύριο» moves the row two days.** `DO:474-483`, `1634`, `1695`, `1703`. The row is listed on its Veroia day (loading + 1 when no Veroia day is stored); the popover's base and the written field are the loading day. Choosing «Αύριο» writes loading = tomorrow, so the row reappears the day after tomorrow, while the toast says it moved to tomorrow. **C.** Redesign: the popover changes the day the row is listed under, and says which day it is.

**F15. The overdue-deliveries zone dates everything today.** `DO:1874-1877`, `438`. The day rows write the VIEWED day as actual delivery date; the zone writes today, and the point's stamp is today too (the zone exists only on today). Scenario: Monday, a Saturday delivery is declared from the zone; actual delivery date = Monday. **C.** Redesign: the zone's action asks «πότε παραδόθηκε», default the planned day.

**F16. «Αλλαγή ημέρας» moves one order of a shared truck.** `DO:933-934`, `1686-1705`. The group row has no change-day; each member has its own. Moving one member leaves the others on the old day, the group silently splits. **C.** Redesign: on a shared truck the action asks «όλο το φορτηγό ή μόνο αυτό».

**F17. A ramp row is a one-time copy.** `DR:373-374`, `425-452`. Truck, driver, pallets, goods, temperature and client are copied when the row is created; an existing row is only skipped, never refreshed. Scenario: the row is created at 06:00 with no truck; the truck is assigned at 09:00; the ramp shows «—» all day. A partner trip never shows a plate (only our truck link is copied). A matched import with no vehicle of its own shows «—» though Daily Ops shows the pair's truck (`DO:226-250`). **C.** Redesign: the ramp reads vehicle and quantities live from the order; only time, done and notes belong to the ramp row.

**F18. Rows created in the background can be born without client and places.** `DR:83-89`, `413`, `432`, `455-459`; `OS:97-100`. The automatic creation also runs after an order save or a day change from other pages. It resolves client and place names from lists that only the ramp page loads. If the ramp page was not opened in that browser tab yet, the row is saved with client «—» and no places, and F17 keeps it so. **C** (how many such rows exist: **A**).

**F19. A day change leaves the old ramp row and makes a second one.** `DR:264`, `269-272`; `OS:97-104`; `worker/migrations/028_order_dates_follow.sql` (moves stops; no ramp statement found). The duplicate check reads only the viewed day and postponed rows, so a stop that moved to another day is "new". The old row stays «Προγραμματισμένο» on the old day. The background run uses the ramp page's own day, not the order's old or new day, and it is fire-and-forget: «η ράμπα» can never appear among the stages a toast names (`DO:1524`, `1712-1713`). **C** in code; rows in the base **A**.

**F20. Ramp «Αναβολή» is not a change of day.** `DR:991-1006`. It moves only the ramp row (+1 day, no choice). The order and its points keep their day: Daily Ops still lists the loading today, later as overdue. **C.** Redesign: one postponement, written to the order, with the day chosen.

**F21. Two «Φορτώθηκε» that write different things.** `DR:865-909` vs `DO:1304-1335`, `1534-1564`. The ramp writes the order status only: no point stamp (who, when), no Veroia day, no chain to the national side, the «μετατέθηκε» mark stays. In Daily Ops such an order reads «Φορτώθηκε ✓» with no name under it; on a multi-point order the x/y pill is hidden while its points are undeclared. «Παρελήφθη» on an import unloading at the warehouse moves the order to «σε μεταφορά» at most, never to delivered; the delivery must be declared again in Daily Ops. Rows typed by hand and national-board rows move nothing. **C.** Redesign: one declaration, the same from both screens.

**F22. Hand-typed ramp row: time and fractional pallets are refused.** `DR:1032`, `1057`, `1062`, `431`; column types in `tms-auditor/test/fixtures/schema.sql` (ramp: time is a timestamp, pallets an integer). «08:00» is sent as bare text; «12.5» as a decimal. The whole row is not saved, message «Add failed». An automatic row from a point with fractional pallets fails the same way and is reported only as «Ramp sync: N εγγραφές απέτυχαν». **C** against the fixture schema; live column types **A**.

**F23. Stock only grows and misses the national arrivals.** `DR:100`, `109`, `579-584`, `872`. «Παρελήφθη» marks the row in stock; nothing ever takes it out. National-board arrivals are never ramp rows, so they never enter. Grouping is by the client text; «Ημέρες» is the age of the oldest row. **C.** Redesign: stock is not derivable from this table; show it from the stock-lots data or not at all.

**F24. A postponed row that is done can be pulled back.** `DR:110`, `668-686`, `981`. Done does not clear the postponement mark. On the original day the row still lists under «ΑΝΑΒΛΗΘΗΚΑΝ» with «Επαναφορά», which moves the done row back to that day. **C.**

**F25. Two users opening the ramp together.** `DR:269-298`, `465-480`. Read, then create, with no uniqueness in the request. Both sessions may create the same rows; the 2-minute refresh repeats the window. **L**, rows in the base **A**.

**F26. «ΠΡΟΚ. €».** `DO:1082`, `1282`. Saved on every blur, changed or not; 0 is saved as empty; on failure the typed number stays on screen as if saved. **C.** Redesign: save on change, show saved / not saved on the field.

**F27. The pair's truck, shown in memory, misleads the local-driver panel.** `DO:226-250`, `1267-1268`; `RL:275`, `303`, `331-334`. For a matched import the tractor is borrowed from the export for display only. The panel opened from Daily Ops then says «ίδιος (πινακίδα)» and hides its own warning «η παραγγελία δεν έχει ακόμη τράκτορα», though the order itself has none. **L.**

## 3. What the page does not tell

**F28. Points not read: no message.** `DO:270-286`, `1507-1511`, `1574`. A failed read of the points is a console line. The page shows «—» for every place, no pills, and «Φορτώθηκε» / «Παραδόθηκε» then write the order with no point stamp, the half-write the 11/9 rule in the same file forbids. **C.** Redesign: a strip like the one for relays, and a warning on the declare buttons until the points are read.

**F29. A retry with a smaller question.** `DO:161-174`. If the day request fails for any reason, it is repeated without the Veroia-day terms. If the retry succeeds, Veroia-Switch exports of the day are missing with no word. **C** (rare: **A**).

**F30. Three quiet partial failures.** `DO:219`, `250`, `268`. Split-order lookup fails: the parent is listed next to its legs. Pair lookup fails: the import reads red «ΠΡΟΣ ΑΝΑΘΕΣΗ» though assigned. Partner-plate lookup fails: no plates. All console only. **C.**

**F31. Ramp: could not read = fewer rows.** `DR:307`, `315`, `331`, `335`, `361`. A failed read of the day's points or of their orders ends in an empty list; the board draws without those rows and without a strip. **C.**

**F32. Counts that do not match the lists.** `DO:713-714`, `788`, `824`. The header counts section rows, so an order loading and delivering the same day counts twice; the footer counts fetched records, including Veroia-Switch exports fetched for the day before that appear in no section. Ramp labels say «σήμερα» whatever day is shown (`DR:638-642`, `669`, `684`). **C.**

**F33. Messages without a reason, or in system words.** `DR:971-973` («Done ✓», «Error», the failure not logged), `DR:1070`; `DO:1713` (failed stages printed with their internal English names). **C.** Redesign: Greek, what was written, what was not, what to do.

**F34. Follow-ups nobody hears.** `DR:900-901` (partner-assignment mirror after ramp done: console only); `DO:1884-1887` (overdue path: not awaited, console only); `DO:1585`, `1881` (pallet feed started, not awaited here). **C** for the first two; the pallet feed's own reporting was not read.

## 4. What is missing for the job

**F35. Declare a whole truck.** `DO:917-935`. A group of N loadings needs N clicks and N confirmations; the summary button only opens the group. Same for «Αλλαγή ημέρας» (F16).

**F36. Take a declaration back.** `DO:1007-1008`; `DR:720`. A wrong «Παραδόθηκε» or «Παρελήφθη» leaves a row with no action. The only way back is the top-bar Undo right after the click.

**F37. Edit or delete a ramp row.** Only time, done and postpone exist; a mistyped hand-made row stays.

**F38. Give or remove a local driver from Daily Ops.** `DO:1171-1177`, `1205-1221`. The chip exists only where a local move already exists; creating one and deleting one are on the weekly board only.

**F39. Hours, goods, temperature.** `DO:22-30`, `1091-1097`. Daily Ops requests goods and temperature and draws neither; no hour per point. The ramp shows them, from its one-time copy.

**F40. Who and when on the ramp.** The ramp's «Ολοκληρώθηκε» keeps no name and no time; a hand-typed row cannot be tied to an order.

**F41. Yesterday on the ramp, and a day that follows the clock.** `DR:10`, `606-609`. No «Χθες»; the day is fixed when the script loads, so a tab left open overnight opens on yesterday.

**F42. National trucks are not on the daily plan.** `DO:3`. The page is international orders only, while the ramp does list national movements. Owner question for the redesign, not a defect.

## What was read, what was not

Read: `modules/daily_ops.js` (all but the style block, lines 500-686), `modules/daily_ramp.js` (all), `core/relay.js` (lines 30-551), `core/order-sync.js` (all), the RAMP, ORDER STOPS and ORDERS maps and the filter translator in `worker/src/index.js` (`1169-1234`, `1769-1835`, `1317-1560`, `2243-2303`), the label constants in `config.js:256-275`, the ramp and stop tables in `tms-auditor/test/fixtures/schema.sql`, a keyword search of `worker/migrations/028_order_dates_follow.sql`, `atSafePatch` and `atGetAll` in `core/api.js`, the catalog `catalog/B-daily-orders.md:9-300`.

Not read: `core/pallet-feed.js`, `core/pa-helpers.js`, `modules/preorder.js`, the stock-lot helpers, the national-board files the ramp reads from, the Worker's write path beyond the maps, any live data. Left out on purpose: anything about roles and access.
