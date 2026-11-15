# Weekly International — feature audit, cluster 4 (dates, week shift, Veroia, forwarding leg, local driver, stock, pre-order, queue, search, print, week navigation)

Read-only, 15/11/2026, worktree tip `1ae0fcda`. **Nothing was run** except one pure calculation of `core/tms-week.js` in node (no network, no write). Every "today" statement is from reading code, not from the screen or the database.

Short names: `wi` = `modules/weekly_intl.js`, `wi2` = `modules/weekly_intl_v2.js`, `wi4a` = `modules/wi4_actions.js`, `wi4l` = `core/wi4-logic.js`, `pre` = `modules/preorder.js`, `relay` = `core/relay.js`, `sync` = `core/order-sync.js`, `wk` = `worker/src/index.js`, `mock` = `docs/design/redesign-2026-11/index.html` (section `#s5` lines 632–683, JS block lines 885–918).

Who may write on this board: the page lets only `planning: full` act (owner, dispatcher); every other role gets «Μόνο ανάγνωση για τον ρόλο σου» at each entry point (`wi:589-593`). Worker side: ORDERS PATCH for owner, dispatcher, management, accountant; LOCAL MOVES and STOCK LOTS write for owner / dispatcher (`wk:612, 645, 668, 724`).

All ORDERS labels this cluster writes are in the ORDERS map (`wk:1364-1494`, links `1499-1505`): `Loading DateTime`, `Delivery DateTime`, `VS CD Date` (→ `cross_dock_date`), `Plan Week Start`, `Rotation ID`, `Group ID`, `Ops Status`, `Destination Country`, `Notes`, `Brand`, `Type`, `Status`, `Direction`, `Veroia Switch`, `National Groupage`, `Client`, `Truck`, `Trailer`, `Driver`. None would be dropped silently. Read-only labels used (`Order No`, `Week Number`, `Total Pallets`) come from the view (`wk:1325-1334`).

---

## A + B. How each feature works today (short)

### 1. Date panel
- **Entry:** click on a date chip (`wi2:747`), key D (`wi4a:1761-1767`). No menu entry today.
- **Opens:** title, one identity line (client · first loading place — last delivery place), segments «Φόρτωση / Εκφόρτωση / Βέροια» (Βέροια only on a Veroia-Switch order, `wi4a:1131`), month calendar starting Saturday, «Ώρα» text field «ΩΩ:ΛΛ» (not on Βέροια), a note, «Άκυρο» / «Αλλαγή» (`wi4a:1116-1213`).
- **Defaults:** the stored day and time of the chosen field; with no stored day the calendar opens on today's month with nothing chosen and «Αλλαγή» is disabled (`wi4a:1094-1101, 1209`).
- **Which order:** the chip's order. On a groupage row that is the lead order only (`wi2:1246-1253`, `wi2:1057`).
- **Checks:** only the time format — «Η ώρα θέλει μορφή ΩΩ:ΛΛ (24ωρη), π.χ. 07:30.» (`wi4a:1273-1275`). Nothing compares loading, Veroia and delivery, and nothing looks at the matched import.
- **Note text:** «Αλλάζει και τις στάσεις και τη Βέροια όπου υπάρχει. Η Εβδομάδα δεν αλλάζει από εδώ.» / on Βέροια: «Αλλάζει την ημερομηνία Βέροιας και την ημέρα του εθνικού σκέλους εκεί. Η Εβδομάδα δεν αλλάζει από εδώ.» (`wi4a:1197-1199`).
- **Save:** one PATCH on ORDERS (`tblgHlNmLBH3JTdIM`) with the single label, plus `_expect` = the value the panel showed (`wi:1953-1966`). A day-only change keeps the old time; no time yet → 08:00 (`wi:2004-2009`).
- **What follows, in the base** (migrations 028 + 069, both outside `drafts/`): the stops of that side move by the same number of days; the Veroia day moves with loading (export) or delivery (import) when it is set; the still-pending direct national load moves; the cross-dock stop and its ramp line follow the Veroia day.
- **What follows, from the screen** (`wi:1984-1988`, `sync:29-133`): Veroia chain (after the national cutover it only reads what the base made and fails if nothing was made, `orders_intl.js:2131-2179`), groupage totals, ramp refresh. Partner assignments and pallets are skipped. The matched import, the other orders of a groupage, forwarding legs and the local driver line are **not** touched.
- **After:** toast «Ημερομηνία ενημερώθηκε ✓» (with a note when the "someone else changed it" check did not run), or «Η ημερομηνία άλλαξε — ο συγχρονισμός … απέτυχε· έλεγξε το Εβδομαδιαίο Εθνικών» (`wi4a:1252-1269`); board re-read; «↓ Πήγε στην …» trace at the old place (`wi2:2954-2968`).
- **Failures:** offline → «Χωρίς σύνδεση — η αλλαγή μπήκε σε αναμονή…» inline, no ✓ (`wi4a:1257, 1301-1305`); someone else changed it → «Ποια κρατάμε;» inside the panel with «Κράτα …» / «Γράψε τη δική μου» (`wi4a:913-978, 1306-1325`); anything else → «Δεν αποθηκεύτηκε — … Η ημερομηνία έμεινε όπως ήταν.» and «Ξαναδοκίμασε» (`wi4a:1346`). The base can refuse a change on a Veroia order whose national pieces are already cut («…τα κομμάτια δεν ξανακόβονται», `wk:3566`).

### 2. Week shift, `Plan Week Start`, «μεταφέρθηκε», «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ»
- **Entry:** menu of an **unmatched import row** only (`wi:5990`). Not on exports, matched imports, pre-orders, lots.
- **Panel:** «Πραγματική ημ. φόρτωσης: …», two buttons «← W(n−1)» / «W(n+1) →», «Οι ημερομηνίες δεν αλλάζουν — αλλάζει μόνο η εβδομάδα που εμφανίζεται.» (`wi:6013-6027`). The buttons are the confirmation.
- **Save:** PATCH ORDERS `Plan Week Start` = Saturday of the target week, or empty when the target is the load's own week; read back; toast «Θα εμφανίζεται στην W… ✓» (`wi:6038-6063`). Written on the row's lead order only.
- **Rule:** `Plan Week Start` alone decides the week, in both directions (`wi4l:104-112, 171-175`). A row moved in keeps its real day and is listed after Friday; the section title carries «μεταφέρθηκε · W…» only as hover text (`wi2:1637-1641`). Rows whose filing date is empty go under «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ» (`wi2:1636`).
- The board reads orders only 8 days either side of its week (`wi4l:95-98`, `wi:669, 684`).

### 3. Veroia Switch on this board
- **Row:** a single Veroia export shows «Βέροια · από <supplier>» as its loading point and its chip is the Veroia day; a Veroia import shows «Βέροια · μετά εθνικό: <customer>» and its delivery chip is the Veroia day (`wi2:1246-1250, 1026-1029, 1043-1047`).
- **Veroia day:** the stored day, else the estimate loading + 1 (export) / delivery − 1 (import), drawn «≈» with hover «εκτίμηση, κλικ για την πραγματική» (`wi:1912-1919`, `wi2:736`). Matches the locked rule.
- **National tiles** («ΠΡΟΣ ΒΕΡΟΙΑ» / «ΑΠΟ ΒΕΡΟΙΑ», foldable): name, weekday of the national leg, and one carrier tile — own (plates · driver), partner (name · plates), «ΠΡΟΣ ΑΝΑΘΕΣΗ», «δεν υπάρχει εθνικό» (click opens the order), or «—» while unread / failed (`wi2:1099-1131`). Information only: never red, never in the queue.
- **Carrier source:** after the cutover `/plan/vs-state`; for orders the base answers "missing", the old NATIONAL LOADS read (`wi:728-768`). Several national trucks are joined with « + » in one tile (`wi:2217-2221`).
- **Notice «✎»:** unread notices of the national desk (Veroia day or pallets changed) from `GET /plan/notices?desk=intl`; click shows the text and «Σημείωσα» → `POST /plan/notices/:id/read` (`wi:2196-2216`, `wi2:1073-1093`).
- **A change here writes** only the international order (dates as in feature 1). The national side is rebuilt by the base.
- A whole row fades as done only when the national leg is read and done (`wi2:1270-1283`).

### 4. Forwarding leg
- **Create:** menu «Σκέλος προώθησης (ρότα)…» on export, import, group and member menus. Panel with two lists in one choice: loads that follow this one, and «Ή: προσάρτηση αυτού ως σκέλος ΜΕΤΑ από…»; search; «Εκτός λίστας: N που φορτώνουν πριν τις … · N ήδη σε άλλη ρότα»; button «Σύνδεση» (`wi:4427-4488`).
- **Candidates:** every row of the board not in a forwarding chain, not the same group or pair, loading from the parent's delivery − 1 day (`wi:5219-5245`); parents: assigned rows delivering up to this load's loading + 1 day (`wi:4403-4426`).
- **Save:** the leg must have no assignment of its own («…έχει ήδη δική της ανάθεση — πρώτα «Καθαρισμός ανάθεσης»…», `wi:5415-5424`); PATCH ORDERS `Rotation ID` = parent; the parent's trip is fed; if the leg did not land on the trip the link is undone and the reason said; with no trip yet the parent's truck, trailer and driver are copied onto the leg (`wi:5425-5517`).
- **Edit:** «Επεξεργασία…» opens the order form; «Εκτύπωση / WhatsApp…» (`wi:5564-5575`).
- **Cancel:** «× αποσύνδεση» on the sub-row or «Ακύρωση προώθησης» → «Αποσύνδεση του σκέλους από τη ρότα; Η ανάθεση οχήματος μένει ως έχει.»; the leg leaves the trip first (`DELETE /costs/rt/:id/legs`, dispatcher allowed, `wk:4472`), then `Rotation ID` is emptied (`wi:5523-5555`).
- **Other week:** a leg dated in another week stands in its own day there with «truck · driver · σκέλος της <parent> (εβδ. …)»; the parent's week shows «συνέχεια: Σάβ 7/11 →» (`wi4l:206-234`, `wi2:1492-1517`). Its missing truck is flagged in its own week.

### 5. Local driver
- **Entry:** «Φόρτωση με τοπικό οδηγό…» (export) / «Παράδοση με τοπικό οδηγό…» (import), per order; on an existing one «Τοπική φόρτωση/παράδοση: αλλαγή…»; the sub-row itself (click = change, right-click = «Αλλαγή…», «Διαγραφή τοπικής»).
- **Not offered:** Veroia order, pre-order, cancelled, split parent, forwarding leg. **Disabled with the reason:** partner-run order, no date, relays still loading or failed (`relay:85-97`, `wi:5812-5833`).
- **Panel:** note that the international driver stays; the order's day (read only); Οδηγός (default «— ΠΡΟΣ ΑΝΑΘΕΣΗ —», the international driver disabled); Τράκτορας «ίδιος» / «άλλος»; Ρυμούλκα (default the order's); Ώρα; Από / Προς (default Veroia cross-dock) (`relay:258-356`).
- **Checks:** point required; other tractor chosen; trailer required with a driver; not the international driver; time format (`relay:382-386`).
- **Save:** LOCAL MOVES create / patch with `Parent Order`, `Move Kind`, `Driver`, `Truck`, `Trailer`, `From Location` or `To Location`, `Time From`; day and status are set by the base; the row is read back and every label compared (`relay:372-456`). Toasts «Η τοπική καταχωρήθηκε ✓» / «…γράφτηκε, αλλά ΔΕΝ επιβεβαιώθηκαν: …» (`wi:5858-5866`).
- **Delete:** confirm «Διαγραφή της … ; Η παραγγελία και ο διεθνής δεν αλλάζουν.», then a re-read decides the message (`wi:5890-5918`).
- **Sub-row states:** driver name or red «ΠΡΟΣ ΑΝΑΘΕΣΗ», day and time, «✓ φορτώθηκε / παραδόθηκε», «μέρα ≠ παραγγελίας», «δεν επιβεβαιώθηκε», «δεν διαβάστηκε», other truck / trailer / point (`wi2:1521-1580`). No driver = queue item, red from the day before.

### 6. Stock
- **Shelf** (only when stock exists, or is loading / failed): «ΑΠΟΘΕΜΑ · N · K προς έλεγχο», one chip per lot (warehouse · client · reference · remaining/total, flag «σε κίνηση χωρίς παραλαβή» / «να κλείσει;» / «>21 ημ.»), button «N κομμάτια χωρίς φορτηγό · N εκπρόθεσμα»; failed read = «ΑΠΟΘΕΜΑ — δεν φορτώθηκε ↻» (`wi:7261-7305`). Not for the warehouse role.
- **Lot panel:** client, reference, remaining, intake, one note for the problem, pieces (each opens its form; «Διαγραφή» only without truck), «+ Κομμάτι», «Κλείσιμο υπολοίπου…», «Άνοιγμα παρτίδας» (`wi:7420-7486`).
- **«+ Κομμάτι από απόθεμα…»:** own truck only; disabled «Πρώτα ανάθεση σε δικό μας φορτηγό» or «σε κίνηση — όχι νέο κομμάτι»; panel «Ελεύθερα Np (ενδεικτικά)», «Κομμάτια χωρίς φορτηγό», «Νέο κομμάτι από» (every lot with pallets left) (`wi:7605-7697`). Picking a waiting piece asks «Νέα ημέρα φόρτωσης …; Το κομμάτι (Np) μπαίνει στο φορτηγό …» and re-checks the piece on the server (`wi:7716-7765`).
- **Return:** «Επιστροφή στο απόθεμα» (confirm; refused while moving) (`wi:7631-7637`).
- Lot row menu: «Ανάθεση…», «Εκτύπωση…», «Άνοιγμα», «Απόθεμα…» (`wi:7391-7402`). Gap cell link «ή κομμάτι από ΑΠΟΘΕΜΑ» (`wi:7593-7598`).

### 7. Pre-order
- **Create:** bar button «Pre-order N» → form: Πελάτης, Κατεύθυνση, Ημερομηνία φόρτωσης, Χώρα προορισμού / φόρτωσης (optional), Πόσα φορτία 1–9, Σημειώσεις; «Λείπουν: …» when client, direction or date is missing (`pre:116-175`).
- **Save:** one ORDERS create per load with `Ops Status = Provisional`, `Status = Pending`, Veroia and groupage off; the answer is checked for the mark and the country (`pre:181-225`).
- **Row menu:** «Μετατροπή σε παραγγελία…» (the normal form on the same record), «Επεξεργασία pre-order», «Διαγραφή pre-order» (`wi:4784-4795`). Assignment stays allowed from the cell.
- **Levels:** red = loads tomorrow, today, past or no date; amber = 2–3 days; grey = 4 days or more (`pre:38-42`). Red and amber are queue items with «Μετατροπή».

### 8. «ΕΠΟΜΕΝΑ»
| Reason | Level | Date used | Group | Button |
|---|---|---|---|---|
| χωρίς φορτηγό | red up to tomorrow or no date, amber later | loading (Veroia day for a Veroia export) | stop | Ανάθεση |
| τοπική χωρίς οδηγό | same rule | the local move's day | stop | Τοπικός οδηγός |
| δεν αποθηκεύτηκε | red | loading | stop | Ξαναδοκίμασε |
| κενό γύρισμα (own truck, no import) | nothing until 2 days before the return, amber to the return day, red after; amber with no date | last delivery | cost | Νέα εισαγωγή |
| απόθεμα: κομμάτι με παράδοση που πέρασε | red | its delivery day | cost | Κομμάτια |
| πάνω από 33π | amber | loading | look | Άνοιγμα |
| παλέτες χωρίς καταγραφή (28+ with a gap) | amber | loading | look | Άνοιγμα |
| εισαγωγή εκτός προβολής | amber | — | look | Άνοιγμα |
| ίδια μέρα (truck or driver twice) | amber | loading | look | Άνοιγμα |
| καθυστέρηση | amber | delivery | look | Άνοιγμα |
| pre-order χωρίς μετατροπή | as the pre-order level | loading | look | Μετατροπή |
| απόθεμα: παρτίδα με σημάδι | amber | — | look | Παρτίδα |
| φορτίο της επόμενης εβδομάδας που φορτώνει ως αύριο | amber | loading | stop | «W48 →» |
| πηγή που δεν φορτώθηκε | amber | — | look | Ξαναδοκίμασε |

Rules: `wi4l:585-628, 638-647, 709-746`; next-week and stock items `wi2:613-645, 661-670`. Order: red first; then stop → cost → look; nearest date first, no date first; ties by order. Band: «ΕΠΟΜΕΝΑ · N», «X επείγοντα · Y προσοχή», «≥N» and «φορτώνει…» while a source is missing, three cards, «Όλα N ▾» (`wi2:1798-1827`). The panel groups by **level** («ΤΩΡΑ · n», «ΠΡΟΣΟΧΗ · n»), not by stop / cost / look (`wi4a:1449-1476`); Q, ↑↓, Enter, Esc; a user scroll closes it. The next-week tab badge is the count of the next-week items, shown only on the current week («…» loading, «—» failed) (`wi2:1727-1734`).

### 9. Search, «Κατάσταση», keys
- Search dims the rest and lifts the matches, counter «i/N», Enter = next, Esc = clear (`wi2:2525-2577`). Nothing is hidden.
- «Κατάσταση»: Όλες / Χωρίς ανάθεση / Ανατεθειμένα / Εισαγωγές χωρίς ταίριασμα; it dims the others (`wi2:2517-2524`), stays for the session.
- Keys: ↑ ↓, Enter, A, D, P, N, O, Q, «/», «?», Esc (`wi4l:763-776`); ← → change week when nothing is open (`core/ui.js:445-461`); a hint strip appears at the foot after the first key (`wi4a:1831-1845`).

### 10. Print, driver sheet, CSV, full screen
- Printed week = the board model on A4; leaves out the split header, «συνέχεια» and local-driver lines on purpose; says how many rows it could not read (`wi2:3025, 3118-3146`).
- Driver sheet: printer button on the row, on a leg, per group; right-click = share menu; key P.
- CSV: columns Order No, Direction, Client, Loading, Delivery, Load Date, Del Date, Pallets, Truck, Trailer, Driver, Partner, Status, Απόθεμα (`wi:8377-8405`).
- Full screen: the main area with the top bar (`wi:3069-3075`).

### 11. Week navigation
- Tabs W−3…W+3, chevrons, «Σήμερα» off the current week, dot on the current week (`wi2:1719-1745`). The week on screen is a bare number; its year is the week-year of today (`core/tms-week.js:75-82`).

---

## C. Defects and doubts in today's behaviour

All from reading code. "Data" = something wrong is stored, lost or missed; "confusing" = the screen misleads.

**C1. On a groupage row the date panel changes one order only.** `wi2:1246-1253`, `wi2:1057` (chip = lead order), `wi4a:1042, 1283`; no group handling anywhere in the panel. Three exports on one truck load Thursday → press D, move loading to Friday → the lead moves, the other two stay on Thursday, the chip shows Friday. Driver sheets, ramp and stops of the other two keep the old day. Confidence high · data.

**C2. A time-only change across 02:00 (03:00 in summer) moves the stops, the Veroia day and the pending national load by a day.** The base measures the shift as a difference of calendar days of the stored timestamps (`worker/migrations/028_order_dates_follow.sql`, function `order_dates_follow`, `d_load := new.loading_datetime::date - old.loading_datetime::date`), and the panel can change the time alone (`wi:1955`). Loading Mon 08:00 → Mon 01:30: the order still says Monday, every loading stop goes to Sunday, and for an export the Veroia day goes back one day. Confidence medium (depends on the base clock being UTC, as `wi4l:336` says, and on the live function still reading this way) · data.

**C3. The panel accepts any combination of days.** Only the time format is checked (`wi4a:1270-1277`). Delivery before loading, a Veroia day before loading or after delivery, an export delivery later than its matched import's loading: all saved without a word. The rule "a Veroia day that does not hold" exists (`core/vs-dates.js` `vsHubBad`) but the panel does not call it. Confidence high · data.

**C4. The note «Η Εβδομάδα δεν αλλάζει από εδώ» is wrong for almost every row.** The week comes from the dates unless a `Plan Week Start` exists (`wi4l:104-112`). Export delivering Friday moved to Saturday → it leaves this week's sheet. Confidence medium (wording) · confusing.

**C5. The Veroia day, once chosen, cannot go back to automatic; and the estimate is not preselected.** With an estimate on the chip the panel opens on today's month with nothing chosen (`wi4a:1096-1101`); there is no "clear". Confidence medium · confusing.

**C6. An import can end on no board at all after «Μεταφορά εβδομάδας».** The target is always "week on screen ± 1" (`wi:6042`) and a moved row offers the same menu again; the board reads only 8 days around its week (`wi:669`). Import loading Monday of W47 → moved to W48 → moved again to W49: W49 does not read it, W47 and W48 hide it as "another week's", and the missing-order banner skips such rows (`wi4l:405`). The toast still says «Θα εμφανίζεται στην W49 ✓». Same result when the loading date is later changed far from the pinned week: the pin stays. Confidence high (logic) · data.

**C7. The week shift is written on the lead order of an import group only.** `wi:6041, 6048`. The group follows its lead; if the delivery order of the group is rearranged and another order becomes the lead, the group returns to its old week. Confidence low–medium · data.

**C8. A queue card of an adjacent-week import does nothing on «Ανάθεση», and a shifted import is named with the wrong week.** `wi2:620-624` (card built with no row), `wi4a:1674-1681` (`if (!box) return;`), `wi:888` (week label = week of the loading date, not the pinned week). Friday, an import of next week loads tomorrow without truck → red card, button silent. Confidence medium · confusing.

**C9. The national desk's notice «✎» disappears when the national column is folded.** The fold hides everything in the cell except the dot (`assets/style.css:8705-8707`); the «✎» lives in the tile head (`wi2:1104`). The fold is remembered per browser. Confidence high · data (the only channel from the national desk on this board).

**C10. One «Σημείωσα» clears the notice for everybody.** A notice has one "read" mark (`wk:3623`), and the board lists only unread ones (`wi:2204`). Whoever presses first removes it for the colleague who never saw it. Confidence medium · data.

**C11. A Veroia order inside a groupage loses its Veroia face.** Tile, Veroia chip and notice are drawn only for a single order (`wi2:1246, 1316`); day order and "how near" read the lead's flag only (`wi2:365-369`). Confidence medium (whether such groups exist was not checked) · confusing.

**C12. The forwarding-leg list offers loads that cannot be taken.** Candidates are not filtered by assignment (`wi:5228-5237`); a load with its own truck or partner is listed and then refused on «Σύνδεση» («…έχει ήδη δική της ανάθεση…», `wi:5419-5420`). Same class as the owner's groupage example. Confidence high · confusing.

**C13. After «Ακύρωση προώθησης» the load keeps the parent's truck and driver as its own assignment.** Text and code agree («Η ανάθεση οχήματος μένει ως έχει», `wi:5526, 5550, 5594`). The truck will not continue, yet the load reads as assigned: no «χωρίς φορτηγό», nothing in the queue. Confidence medium · data.

**C14. A local delivery without a driver is not raised in the week it happens.** Local-driver items are built only under rows drawn this week (`wi2:468-498, 530`); for another week's imports only «χωρίς φορτηγό» is taken (`wi2:622`). Import loads Thursday of W46, delivers Monday of W47 with a local driver not chosen: on Monday the W47 queue is silent. Confidence medium · data.

**C15. «+ Κομμάτι από απόθεμα» lists every lot in every warehouse and every waiting piece of every week,** whatever the truck's route (`wi:7667-7668, 7678-7689`). A truck delivering in München is offered a lot lying in another country. Confidence high · confusing.

**C16. Stock items sit in the queue of every week you open,** and a lot older than 21 days is an item every day until it is closed (`wi2:626-640`, not tied to the week). They inflate «ΕΠΟΜΕΝΑ · N» on past and future weeks. Confidence high · confusing.

**C17. A pre-order with one of our trucks is at once «κενό γύρισμα».** No delivery day → the rule answers amber "no date" and sorts it first (`wi4l:601-608`, `wi2:370, 385`); the row also shows the gap cell with «Νέα εισαγωγή» (`wi2:1308`). Destination and day are still unknown. Confidence medium–high · confusing.

**C18. «Pre-order N»: the number counts open pre-orders, the click creates a new one** (`wi2:1795`). Nothing lists or jumps to the N. Confidence high · confusing.

**C19. An export pre-order is filed under its loading day, among exports filed by delivery day,** and in the week of its loading (`wi4l:87-90`, `pre:181`). When converted with a delivery in the next week it jumps to another sheet. Confidence high · confusing.

**C20. The next-week items and badge count loads that need nothing.** The read asks only for the loading place and date (`wi:1182-1188`); every next-week export loading from this week's start up to tomorrow becomes an amber "stop" item «… · η ανάθεση είναι στη W48», assigned or not, loaded or not (`wi2:661-670`). By Friday that is most of next week's exports that left during the week; with no red items they take the three cards. The card names the loading place, not client and destination. Confidence high (code); how many per week not measured · confusing.

**C21. A legacy cancelled order still raises reasons.** The reads keep cancelled orders and the facts have no status test (`wi2:357-396`). Confidence medium, small impact (the form no longer cancels, `orders_intl.js:4092`) · confusing.

**C22. «Κατάσταση» leaves no sign that it is on** and stays through week changes (`wi2:2585-2589`; the «Προβολή» button does not change). Most rows dim with no visible reason. Confidence high · confusing.

**C23. The CSV is not the week.** It writes this week's exports plus **every import read**, i.e. up to 8 days before and after the week, with no week column (`wi:8378`, `wi:669, 783`); also cancelled orders, forwarding legs, a split order together with its two legs (pallets twice). Dates are the raw stored text; «Status» says only Assigned / Unassigned. Confidence high · data.

**C24. The printed week does not show local drivers** (`wi2:3025`, by design). The paper is what the national dispatcher and the drivers' office read. Confidence high · confusing.

**C25. In «Πλήρης οθόνη» most answers of the board are not visible.** Full screen takes the main area (`wi:3072`); the date panel, the «Όλα» panel, the conflict dialog, the «?» sheet and every toast are attached to the page body (`wi4a:1058, 1482, 972, 1645`, `core/ui.js:398`), and the order / pre-order forms and confirm dialogs live in the modal beside it (`app.html:40, 87`). Only stock menus leave full screen first (`wi4a:773`). Click a date in full screen → nothing appears; a failed save says nothing. Confidence medium–high (browser rule, not tried) · confusing, can become data.

**C26. Turn of the year.** Checked by calculation: Sat 26/12/2026–Fri 1/1/2027 is W53; the next week is W2; "W1 of 2027" is the same week as W53.
- Tabs and chevrons clamp to 1…53 (`wi2:1721, 1726`): during W53 the next week cannot be opened with the mouse. ← → do not clamp (`core/ui.js:453`): they open it as «W54», with no tab lit.
- After 2/1/2027 the previous weeks of December cannot be opened with the mouse (clamp at 1); ← gives «W0», «W-1».
- During W53 the next-week read is declared unknown all week: «—» on the tab, «≥N», one queue item (`wi2:2484-2487`).
- «Μεταφορά εβδομάδας» offers «W54 →» / «← W0» (`wi:6017`); the date written is right.
- A page left open over New Year keeps the old number and shows the last week of the new year, empty (`wi:34`).
Confidence high · confusing, blocking for one week a year.

---

## D. Checklist — what the redesign must draw

Mock-up read at `1ae0fcda` (it is newer than the parity table of 15/11: forwarding leg, local-driver line, split row, partner tab, date panel and queue panel are now drawn).

### D1. Date panel
| Item | Mock-up | Where |
|---|---|---|
| Segments loading / Veroia / delivery | PRESENT («Παράδοση» for today's «Εκφόρτωση») | panel |
| Day and time | PRESENT | panel |
| Calendar starting Saturday | PARTLY (a day field, no grid) | panel |
| «Τι αλλάζει» list | PRESENT, but see D-wrong 2 | panel |
| Warning about the matched import | PRESENT (new; today none) | panel |
| What happens on a groupage (all orders or one) | MISSING | panel, one line + choice |
| Estimated Veroia day «≈» on the row and in the panel | MISSING | row date, panel |
| Clear the Veroia day back to automatic | MISSING (also today) | panel |
| Refusal of an impossible order of days | MISSING (also today) | panel |
| Saving, time-format error, "not saved" with retry | MISSING | panel foot |
| Someone else changed it: «Ποια κρατάμε;» | MISSING | inside the panel |
| Offline: queued, not saved | MISSING | panel |
| Saved but the national side / ramp did not follow | MISSING | line under the row |
| Trace «↓ Πήγε στην …» at the old place | MISSING | row place |
| Open by click on the date and by D | not shown | behaviour note |

### D2. Week shift
| Item | Mock-up | Where |
|---|---|---|
| Menu entry on an import without truck | PRESENT | menu |
| Two choices with the real loading day and "dates do not change" | MISSING | small popover |
| Section after Friday for rows moved in, with their real day | MISSING | after Friday |
| Mark on a moved row and a way back | MISSING | row tag |
| «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ» | MISSING | last card |
| A moved row that no week can show (C6) | MISSING (also today) | must be impossible or said |

### D3. Veroia Switch
| Item | Mock-up | Where |
|---|---|---|
| Tag on the load | PRESENT («VS») | row |
| A loading place without truck | PRESENT («!» + panel) | row, panel |
| «Μέσω Βέροιας» panel, export side | PRESENT (per place, new) | panel |
| Same panel, import side (who delivers each point) | MISSING | panel |
| Veroia day named as such | PARTLY (header «Rotterdam · Τρί 17/11» reads as the delivery) | panel header, row |
| States: national side not read yet, read failed, no national side made | MISSING | tag / panel |
| National leg done (row may fade) | MISSING | row |
| Notice «✎» of the national desk, its text, who, «Σημείωσα» | MISSING | on the tag (must not be foldable away) |
| Several national trucks on one order | PRESENT (per place) | panel |

### D4. Forwarding leg
| Item | Mock-up | Where |
|---|---|---|
| Sub-row under the parent | PRESENT | row |
| Menu entry | PRESENT | menu |
| Panel: loads that follow, "attach this after…", search, what was left out and why, «Σύνδεση» | MISSING | panel |
| Leg's own actions: open, driver sheet, cancel with its confirm | MISSING | sub-row menu |
| Refusals: load has its own assignment; leg did not land on the trip | MISSING | panel / line |
| Leg without truck, same-day clash on a leg | MISSING | sub-row |
| Leg in another week: line in its own day naming truck, driver, parent | MISSING | day card |
| «συνέχεια: Σάβ 7/11 →» under the parent | MISSING | sub-row |

### D5. Local driver
| Item | Mock-up | Where |
|---|---|---|
| Sub-row with "no driver" | PRESENT (on a load that cannot have one, D-wrong 1) | row |
| Menu entry for loading (export) | PRESENT | menu |
| Menu entry for delivery (import), per order of a group | MISSING | menu |
| Panel: driver, tractor same / other, trailer, time, from / to, the five refusals | MISSING | panel |
| Change, delete with confirm | MISSING | sub-row menu |
| States: done, day differs from the order, not confirmed, not read | MISSING | sub-row |
| Disabled reasons: partner load, no date, still loading, not loaded | MISSING | menu |
| Banner "local moves not loaded" with retry | MISSING | under the week strip |
| Queue item | PRESENT | queue panel |
| On the printed week | MISSING (also today) | paper |

### D6. Stock
| Item | Mock-up | Where |
|---|---|---|
| Stock chip | PRESENT («Απόθεμα 2 παρτίδες · 18π») | band |
| Loading / not loaded states of the chip | MISSING | band |
| Lots list with flags (moving without intake, to close, over 21 days) | MISSING | panel from the chip |
| Lot panel: pieces, new piece, close remainder, open the lot | MISSING | panel |
| Waiting pieces, late ones in red | MISSING | panel |
| Menu entry «Κομμάτι από απόθεμα» | PRESENT | menu |
| Pick panel: free pallets, waiting pieces, lots; warnings | MISSING | panel |
| Confirm with the new loading day | MISSING | panel |
| Piece mark and lot row («→ αποθήκη») on the board | MISSING | row tag |
| «Επιστροφή στο απόθεμα» | MISSING | menu |
| Stock link in the empty-return cell | MISSING | cell |
| Stock items in the queue | MISSING | queue panel |

### D7. Pre-order
| Item | Mock-up | Where |
|---|---|---|
| Button with count | PRESENT | header |
| Row: tag, client, loading day, country | PRESENT | row |
| «Μετατροπή» | PRESENT (in the assignment cell) | row |
| Assign a truck to a pre-order | MISSING (the cell is taken by «Μετατροπή») | cell or menu |
| Create form (client, direction, loading day, country, how many, notes) | MISSING | form sheet |
| Edit, delete | MISSING | row menu |
| Three levels (grey, amber, red) | PARTLY (amber only) | tag |
| What the count opens (C18) | MISSING | header |

### D8. «ΕΠΟΜΕΝΑ»
| Item | Mock-up | Where |
|---|---|---|
| Count split urgent / watch | PRESENT | band |
| Three cards | PARTLY (no action button on the card) | band |
| Full panel with one button per item | PRESENT | panel |
| Grouping | PRESENT but changed (by kind; today by level) | owner decision |
| Reasons drawn: no truck, local without driver, empty return, over 33, pre-order | PRESENT | panel |
| Reasons not drawn: late, same day, pallets not recorded, import outside the view, save failed, stock lot, late stock piece, next-week load, source not loaded | MISSING | panel |
| «≥N», «φορτώνει…», empty state | MISSING | band |
| Next-week badge and its three states | MISSING | week strip |
| Q to step, panel keys | not shown | key list |

### D9. Search, filter, keys
| Item | Mock-up | Where |
|---|---|---|
| Search box, fields named | PRESENT | week strip |
| Counter «i/N» | MISSING | box |
| Four filter choices | PRESENT | Προβολή |
| Sign that a filter is on | MISSING | Προβολή button |
| «Συντομεύσεις ?» entry | PRESENT | Προβολή |
| The key list itself, the hint strip | MISSING | sheet, board foot |

### D10. Print, driver sheet, CSV, full screen
| Item | Mock-up | Where |
|---|---|---|
| Print week | PRESENT (entry) | Προβολή |
| "N rows not read, missing from the paper" | MISSING | toast |
| Driver sheet | PRESENT | row end, menu |
| Print / WhatsApp / all or one member | PARTLY (arrow, content not drawn) | sub-menu |
| CSV | PRESENT | Προβολή |
| Full screen, with panels that stay visible | PRESENT (entry) | Προβολή |

### D11. Week navigation
| Item | Mock-up | Where |
|---|---|---|
| Seven tabs, chevrons | PRESENT (no «W») | week strip |
| «Σήμερα» | PRESENT (always) | header |
| Mark on the real current week | MISSING | week strip |
| Year on the strip / range, and stepping 53 → next year | MISSING | week strip |
| ← → keys | not shown | key list |

### D-wrong. Mock-up content that contradicts today's rules (owner to decide)
1. **Local driver on a load that goes through Veroia** (row 2, «Frutopia Packhouse», tagged VS). Today this is not offered and the base refuses it (`relay:89`).
2. **Date panel: moving the Veroia day moves the delivery** («Βέροια Τρί 17 → Τετ 18 · Rotterdam Τετ 18 → Πέμ 19»). Today a Veroia change moves only the Veroia day and the national side; loading moves Veroia, not the other way.
3. **A time on the Veroia day** («06:00»). Today the Veroia day is a day only; there is nowhere to store a time.
4. **«Μετατροπή» in the place of the assignment** on a pre-order: today a truck can be held for a pre-order.
5. **Queue panel headings** put amber items under a red «Σταματούν τη δουλειά»; today red and amber are the two groups.

---

## Not verified
- The app, the Worker and the database were not opened. No row counts.
- Whether migrations 028 and 069 are the live text of the date trigger, and the base clock (C2).
- Whether the base moves a local-driver line when its order's day moves; only the mismatch mark was read.
- What exactly `week_number` in the view is counted from (C20) and how many loads fall in that read on a normal Friday.
- Whether Veroia orders exist inside groupages (C11) and whether double week shifts happen in practice (C6).
- Full screen behaviour (C25) is a browser rule applied to the code, not tried.
- Stock: the join, lock and return paths (`wi:7774-8200`) were read for their messages only; `OrdersStock` (lot flags, close dialog) was not opened.
- Print paper layout (`core/week-paper.js`) and the driver sheet were not opened; only what the board hands to them.
- `core/api.js` (offline queue, conflict answer) was taken from the callers' comments.
- Assignment, matching, groupage build, split and their candidate lists were left to the other audits, except where a forwarding leg or stock piece uses one.
