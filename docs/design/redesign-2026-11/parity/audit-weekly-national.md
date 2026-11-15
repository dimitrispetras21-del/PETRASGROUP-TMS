# Business parity — «Εβδομαδιαίο Εθνικών» (live v5 board) vs the redesign mock-up

Read-only audit, 15/11/2026. Nothing was run, no base was read. Source of "today" = code at the worktree tip. Source of "mock-up" = `docs/design/redesign-2026-11/index.html` (screen 2 drawn at `:622-662`, row menu / day-hour popover / sign legend at `:516-521`, CSS `:217-246`) and the two screenshots.

File abbreviations: `wn5` = `modules/weekly_natl_v5.js` · `wn5a` = `modules/wn5_actions.js` · `wn5l` = `core/wn5-logic.js` · `edit` = `modules/wn5_edit.js` · `ver` = `modules/wn5_veroia.js` · `cmp` = `modules/wn5_compose.js` · `hand` = `modules/wn5_handover.js` · `road` = `modules/wn5_road.js` · `forms` = `modules/wn5_forms.js` · `sheet` = `modules/wn5_sheet.js` · `ui` = `core/ui.js` · `cfg` = `config.js` · `mock` = the mock-up `index.html`.

Feature switches (`cfg:417-427`): `WN_V5: 'on'` (everyone), `WN_EXPECT: true` (everyone), `WN_ROAD: 'pilot'` and `WN_COMPOSE: 'pilot'` = only the one user in `WN_V5_USERS` (plus, for compose, a browser that opted in, `cmp:27-30`). So for the daily user today: the row menu says «Αλλαγή οχήματος…» and the board shows the «ΒΕΡΟΙΑ» line, not «Σύνθεση φορτίων».

Risk words: **data** = something is lost, hidden or written wrong; **slower** = the job still gets done with more clicks; **none**.

---

## A. Page header

| Today (label as on screen) | What it does | `file:line` | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| «Εβδομαδιαίο Εθνικών» + range «14–20 Νοεμβρίου» (short form when narrow) | title, week range | `wn5:633-634`, `wn5:707-715` | YES same | — | none |
| «↻ Ενημερώθηκε HH:MM» / «Διαβάζει…» / «—» | button: re-reads board, place catalogue and cutover day; shows time of last good read | `wn5:632-635`, `wn5:431-440` | YES changed (icon + time, no word) | add the two other states to the same token: spinner while reading, «—» when never read | slower (user cannot tell "reading" from "old") |
| «+ Νέα παραγγελία» | opens the v5 national order form (entry point, dialog not drawn) | `wn5:652-653`, `forms:1399` | YES same | — | — |
| «Εκτύπωση εβδομάδας» (printer button in the head of the number column) | printed week A4; one extra read for the plates of international trucks | `wn5:863-868`, `wn5:2026-2050` | YES changed (moved to the header as «Εκτύπωση») | good move (owner did not find it today) | — |
| «Σήμερα» (at the end of the week tabs; always there, disabled on the current week) | jump to current week | `wn5:686` | YES changed (header pill) | must be inert on the current week | none |
| «Παλιά προβολή» + «Εβδομάδα πριν από D/M: τα εθνικά της είναι στην παλιά προβολή» | the only way to the national work of weeks before the cutover day (old model) | `wn5:644-663`, `wn5:755-762` | **NO** | tile state of the board for such a week: one line + one button (replaces the day cards) | data (old weeks look empty) |
| «Η ημέρα μετάβασης δεν διαβάστηκε» / recheck note | the cutover day could not be read | `wn5:639`, `wn5:647` | NO | note sign beside the refresh token, text on hover | none |
| «Προβολή ▾», «Σάρωση», CSV, full screen | do **not** exist on this board today | `wn5:649-651` | not shown (correct) | — | — |
| User chip menu («Νάκης · βοηθός», sign out) moved into the bar | assistant and sign-out stay reachable | `wn5:1845-1870` | YES changed (avatar bottom-left; assistant not drawn) | avatar menu | slower |

## B. Week strip and counters

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| «‹» «›» | previous / next week | `wn5:680`, `wn5:685` | YES same | — | — |
| Seven tabs «W45 … W51», starting two weeks before the current one; the strip moves only when the chosen week leaves it | week jump | `wn5:669-688` | YES changed (six tabs, no «W») | keep seven; number alone is fine under an `aria-label` | none |
| Dot on the **current** week's tab (separate from the selected tab) | "today is in this week" | `wn5:683` | NO (only the selected underline) | dot under the number | slower (on another week nothing says which is the current one) |
| Red number on a tab = orders without a truck in that week, as the base counts them (title «N παραγγελίες χωρίς φορτηγό»); keeps last counts while another week loads | where the open work is | `wn5:683`, `wn5:693-705` | YES same | hover text must stay | — |
| Keyboard ← / → (not under a menu or dialog) | previous / next week | `ui:452-461` | not shown | keep | slower |

## C. «ΕΠΟΜΕΝΑ» band

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| «ΕΠΟΜΕΝΑ · N» | N = Veroia Switch orders without a truck that this week shows (not national orders) | `wn5l:603-612`, `wn5:817` | YES same | — | — |
| «2 VS από Δευ · 1 Παρ» | per-day split of the queue | `wn5:821-826` | NO | drop; the chips carry the day | none |
| Card: day chip · «→»/«←» + **place** (first destination for κάθοδος, loading place for άνοδος) «+N» · pallets · «αργό» · button «Ανάθεση» | opens the assignment form for the whole order (entry point) | `wn5:831-852`, `wn5a:1475-1493` | YES changed (chip: arrow, day, **name**, pallets; no button; late = red day) | chip press = «Ανάθεση»; see section 3 for name vs place; «+N» for more places as a tag | slower if the chip is not pressable |
| Card hover: reference(s) and clients | which order it is | `wn5:850` | NO | hover text | none |
| Unknown pallets «;π» on a card | never shown as 0 | `wn5l:41-45` | NO | same notation as rows | data |
| «Όλες οι N ▾» / «Λιγότερα ▴» (3 cards wide, 2 at ≤1600px) | rest of the queue, in place | `wn5:811-818`, `wn5:853-857` | NO (mock has exactly 3) | «+N» chip at the end of the band | slower / data when N > 3 |
| «ΕΠΟΜΕΝΑ · κανένα» / «· …» / «· —» | empty / loading / not read | `wn5:805-807` | NO | label states | none |
| Every card is also a red row on its day in the board | same load, two places | `wn5l:606` | **NO** (two of the three mock chips have no row, see section 3) | — | data |

## D. Load composition entry («Σύνθεση φορτίων») — pilot only

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| Closed line «ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ · ΚΑΘΟΔΟΣ n στη Βέροια · Xπ · ΑΝΟΔΟΣ n προς Βέροια · Yπ · n πρόχειρα · n ακόμη στο Weekly · n αργά · Άνοιγμα ▸» | opens the composition panel **in place of** the Veroia panel (entry point) | `cmp:378-403`, `ver:239-240` | YES changed (chip «Σύνθεση φορτίων ↓3 ↑4» in the week strip) | chip is fine; add drafts count and late count as small numbers, rest on hover | slower |
| «τα πρόχειρα δεν διαβάστηκαν» | drafts read failed | `cmp:400` | NO | chip turns to "not read" state | data |
| «σε πρόχειρο» small grey mark beside «ΠΡΟΣ ΑΝΑΘΕΣΗ» on a waiting row | this load is already in someone's draft | `wn5:1407-1408`, `cmp:75-85` | NO | small sign on the red tile, text on hover | data (two people plan the same load) |
| Hidden when nothing to compose | — | `cmp:390-391` | not shown | hide chip | none |

## E. Veroia panel entry — everyone except the pilot

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| Closed line «ΒΕΡΟΙΑ · Δευ 16/11 · σήμερα · N για μοίρασμα · Xπ · απόθεμα Yπ · n αργά · places · Άνοιγμα ▸» | opens the Veroia panel (split, send to truck, new load, back to Weekly) — entry point | `ver:236-262` | YES changed (chip «Βέροια 3 για μοίρασμα · 46π») | chip; add stock («απόθεμα Yπ») and late count; places on hover | data if stock and late are dropped (stock lives **only** here, `wn5l:547`) |
| Hidden when nothing waits and no stock | — | `ver:241` | not shown | hide chip | none |
| ✈ «Στον Πίνακα Βέροιας» on a waiting VS row whose pieces stand at Veroia | sends that load to the panel; it leaves the Weekly | `wn5:949-951`, `wn5:1287-1290` | **NO** | row menu item of a waiting row | data (a VS cannot be split) |
| The band shows the Veroia line **or** the composition line, never both | one module draws the place | `ver:239-240` | mock shows **both** chips at once | owner decides (section 2) | — |

## F. «ΤΟΠΙΚΑ» / local drivers

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| Section «ΤΟΠΙΚΑ · οδηγός × ημέρα · N κινήσεις · Wnn» under the board; one line per day, per local driver, moves ①② in time order («Φόρτωση» / «Παράδοση»), plate(s), what and why | the day plan of each local driver | `wn5:776-801`, `wn5l:677-713` | **NO** | chip in the «ΕΠΟΜΕΝΑ» band («Τοπικοί 4») opening a side panel; or a sign on the day header with the list on hover | data (local drivers' work is nowhere on the board) |
| «Ακύρωση» on a loading move; «Άνοιγμα» on a delivery move (opens the trip card) | cancel local loading; open vehicle-change card | `wn5:793-794`, `wn5a:2674`, `hand:294` | NO | inside that panel | data |
| «κανένας τοπικός» per empty day | — | `wn5:786` | NO | — | none |
| Sub-line under a row «↳ Φόρτωση με τοπικό · driver · day hh:mm · what → Βέροια · Xπ · για place (στάση n) · Ακύρωση»; another day than the stop's = amber day | which stop a local driver loads, and cancel | `wn5:1417-1433`, `wn5l:343-371` | **NO** | small sign on the point it serves (hover = driver, day, hours); «Ακύρωση τοπικού» in the point's right-click menu | data |

## G. Day header, its signs, close / fold

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| «ΔΕΥΤΕΡΑ 16/11» | day name + date; all seven days always drawn | `wn5:887`, `wn5:898`, `wn5l:552-555` | YES changed (sentence case; mock draws four days) | all seven days, also empty ones | — |
| «· σήμερα» + today style | — | `wn5:893` | YES same | — | — |
| «· καμία φόρτωση» | empty day (no chevron, nothing to open) | `wn5:894` | NO | muted one-line day card | none |
| «· …» / «· —» | week loading / not read (never "empty") | `wn5:894` | NO (generic states only) | same card states | data (not-read must not read as empty) |
| Chevron + click on the head folds the day; «▸ N γραμμές κρυμμένες · άνοιγμα»; never folds by itself; forgets on week change | hide a finished day | `wn5:880-913` | **NO** | press on the day title; folded card shows «N» and a chevron | slower |
| Two grey bars under today while loading | — | `wn5:883`, `wn5:900` | generic skeleton | — | none |
| A point dragged onto a day head | opens the one-stop day/hour panel with that day chosen | `edit:248-253`, `edit:294-303` | not shown | keep the drop target on the day card | slower |
| Counts on the day head | **none today** (owner 31/10: no counts of "cycles", `wn5:860-861`) | — | mock adds four signs | NEW, see section 2 | — |

## H. Row anatomy

| Today | What it does | `file:line` | In mock-up? | Where it should live | Risk |
|---|---|---|---|---|---|
| Row number (trips of this week only, board order; shared with «Παραγγελίες › Εβδομάδα») | — | `wn5:933`, `wn5:942`, `wn5l:716-724` | YES same | — | — |
| ✈ button beside the number | opens the row menu | `wn5:943` | YES changed (number turns to «…» on the pointed row) | — | — |
| Waiting **national** order: page icon instead of ✈ | opens the order card («Επεξεργασία», «Διαγραφή») | `wn5:947`, `wn5:1300-1308` | NO (mock waiting row has «↑» titled «Μενού γραμμής», menu not drawn) | menu of a waiting row: «Καρτέλα παραγγελίας», «Ανάθεση», «Στον Πίνακα Βέροιας», «Διαγραφή» | data (cannot fix or delete an order before it has a truck) |
| Waiting **VS**: tag «VS» in the number column (hover «Παραγγελία του Εβδομαδιαίου Διεθνών») | says it changes in the International board | `wn5:950` | YES changed (tag «VS» beside the name) | — | — |
| ΚΑΘΟΔΟΣ day chip (loading day) + «→ day» (first delivery day) | chip press on a trip row opens the day panel of the side | `wn5:1055`, `wn5:1223-1226` | YES changed (day as underlined text in each cell) | — | — |
| ΦΟΡΤΩΣΗ of κάθοδος: «Βέροια» + its window; loadings before / after Veroia numbered | where and when the truck loads | `wn5:1120-1127` | YES same (row 2, 9) | numbered extra loadings as «+N» tag | — |
| Point = **place** (bold) / city · window · pallets · temperature; client only on hover | — | `wn5:1198-1220` | YES changed (name / day · place) | see section 3 (place vs client) | — |
| Window words: «όλη η ημέρα», «στις 08:00», «ως 23:59», «08:00–09:00» | one reader rule | `wn5l:76-83` | changed (mock prints «14:00–23:59») | print through the same rule | none (wording) |
| Up to 2 points per cell (1 at ≤1600px; άνοδος always 1) + «+N» with the full list on hover; a late point or a vehicle-change point is never folded; «+N» turns amber if a folded one is late or lacks a price | — | `wn5:1134-1160` | YES changed («+1» tag; place + pallets list on line 2) | keep "late never folded" and the amber «+N» | data |
| Day divider on a point of another day than its cell | — | `wn5:1158`, `wn5:1213` | NO | day text before that place | data (wrong delivery day read) |
| Press on a side's place / pallet cells | opens the side's form («+» loads, order of stops, «Αλλαγή ώρας στάσης ›») — entry point | `wn5:1230-1275`, `forms:1818` | NO (not stated) | press on the side | slower |
| Busy mark on the row while that form reads | — | `wn5:1243-1249` | NO | row loading state | none |
| ΑΝΑΘΕΣΗ own truck: «plate · trailer» / driver; «χωρίς οδηγό» | — | `wn5l:308-313`, `wn5:1412-1413` | YES same; «χωρίς οδηγό» not drawn | amber second line | data |
| ΑΝΑΘΕΣΗ partner: partner name (one segment: nothing under it; with vehicle change: rate «NNN €» or «κόμιστρο λείπει») | — | `wn5l:292-306` | YES changed (name + «συνεργάτης») | «κόμιστρο λείπει» as amber sign on the tile | data (missing rate unseen) |
| Copy-plates button on row hover («Αντιγράφηκε») | clipboard only; none for a partner | `wn5:1291-1325` | NO on the row (kept in the menu) | menu item is enough | slower |
| Red box «ΠΡΟΣ ΑΝΑΘΕΣΗ» on a waiting row | opens the assignment form (entry point) | `wn5:1407`, `wn5a:1475-1493` | YES changed (red dashed tile «Ανάθεση») | — | — |
| ΑΝΟΔΟΣ loading chip, delivery-day box, points, end «Βέροια / ως Τετ 12:00» | cycle end at Veroia; hour shown only if someone set one | `wn5:1080-1112` | YES changed (row 8 «clock 20:00») | — | — |
| Mark «VS Κυρ 1/11» beside a Veroia stop | the International has this VS at Veroia on **another day** than this truck (hover says both days) | `wn5:386-405` | unclear (row 2 has «clock Τρί 17» after the day; meaning not stated) | amber sign beside «Βέροια», hover = both days | data (two boards disagree unseen) |
| Pallets per side: number; red when over 33 (hover «υπέρβαση N»); unknown «;», «12+;» | 33 is display only, never a refusal | `wn5:1335-1345`, `wn5l:22`, `wn5l:41-45` | YES changed (number + bar; «40 +7» red); unknown **not drawn** | add the unknown state: «12+» with a «;» sign and a broken bar | data (unknown read as known) |
| «PE» chip over the pallets of a side (hover: clients with pallet exchange) | — | `wn5:1340-1344`, `wn5l:178-181` | YES changed (tag beside the name) | hover must name the clients | none |
| Temperature «+4 °C», «+2 / +4 °C» on the point; nothing when unknown | — | `wn5:1170-1173` | YES same (thermometer «+3°») | allow two values | none |
| «λείπει τιμή» (amber) on the first point of a national order saved without a price | nothing is forgotten | `wn5l:168-192`, `wn5:1211` | **NO** | small amber sign on the point, hover «λείπει τιμή» | data (orders stay unpriced) |
| Late: amber rail on a trip row with a late stop; late point amber; waiting late = red day chip, hover «αργό» | — | `wn5:937`, `wn5:1214-1219`, `wn5:1051-1055`, `wn5:1102-1105` | partly (red clock on the waiting row only) | amber clock sign on the late point of a trip row | data |
| Done parts at 40% — only in the current week, only by the base's flags per stop / side / row; never a row that needs work | — | `wn5:916-925` | changed (whole past **days** dimmed by date, `mock:243-245`) | see section 3 | data (undone work on a past day looks done) |
| Other-week row: whole row, number cell «n · Wxx» (press = go to that week and flash the row); «…» while read, «?» if that week was not read; earlier week on top of Saturday, later at the bottom of Friday | a truck that belongs to the neighbour week | `wn5:1438-1463`, `wn5l:585-601` | **NO** | number tile state «15 · 46», pressable | data (truck missing from the week it crosses) |
| Rota line inside the row (no number): day → day, pickup → delivery, own pallets; press = order card; right-click «Καρτέλα παραγγελίας» / «Αποσύνδεση από το δρομολόγιο → ΕΠΟΜΕΝΑ» | next load with the same truck | `wn5:967-1029`, `wn5l:247-275` | **NO** (only the menu item that creates it) | second line inside the same row, indented under its side, `corner-down-right` sign | data (the load exists and is not seen) |
| Vehicle change: segment tiles side by side «ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ / ΤΕΛΙΚΟ» (plate, driver or partner + rate); press = trip card («Διόρθωση», «Αφαίρεση») | who drives which part | `wn5:1354-1364`, `hand:288-307` | YES changed (one tile «plate → plate», one driver · place) | tile hover = every segment with driver; press = trip card | data (second driver, 3rd segment lost) |
| «⇄» on the side where the vehicle changes; segment colour on each point | which stops belong to which vehicle | `wn5:1378-1388`, `wn5:1353` | NO | thin mark on the first point of the next vehicle | slower |
| Sub-line «↳ ⇄ place · Δευ 14:30 · reason» | where, when, why | `wn5:1391-1399` | partly (place only, in the tile) | hover of the shuffle tile | none |
| Road change («Αλλαγή στον δρόμο», pilot) | loads move to another truck at a point; shows through the same tiles / marks | `road:480-516` | same as above | — | — |
| Empty return (own truck): dashed slot «Κενό γύρισμα · ελεύθερο από Δευ [hh:mm]» + «+» | free return to fill | `wn5l:276-285`, `wn5:1066-1078` | YES changed (amber slot «place · Δευ 16» + «+») | add the hour when it is not the day's end | none |
| Partner trip without άνοδος: plain text «Μόνο κάθοδος · συνεργάτης» (a fact, not a slot) + «+» | — | `wn5l:278`, `wn5:1067-1078` | NO | muted text, no amber | none (but amber would call it work to do) |
| Row without κάθοδος: «Χωρίς κάθοδο» + «+» | — | `wn5:1039` | YES changed (arrow-down slot + «+») | — | — |
| Waiting load of one side only: other side empty, no «+» | — | `wn5:1040`, `wn5:1063` | YES same | — | — |
| «+» on each side of a trip row (hover) | add load: «Νέα παραγγελία \| Από αναμονή» (entry point) | `wn5:1278-1281`, `wn5a:1945` | YES same | — | — |
| Printer on each side with stops (hover) | driver sheet of that side + WhatsApp text | `wn5:1329-1334` | YES changed (one send sign at row end) | press = the three choices (Κάθοδος · Άνοδος · Όλο) | slower |
| Waiting row order: trips first, then waiting loads, by time | — | `wn5l:52-57` | YES same | — | — |

## I. Row menu (✈) — see section 4 for the exact list

| Today | What it does | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Menu head: «plate · driver» (or partner) / «day · Βέροια window» | says which truck the menu is for (no code) | `wn5:1574-1583` | NO | first, non-pressable line of the menu | slower (wrong-row mistakes) |
| Twelve lines, same for every trip row | see section 4 | `wn5:2085-2127` | YES changed | section 4 | — |
| «›» lines open a sub-list «Κάθοδος / Άνοδος» (→ opens, ← closes) | side choice | `wn5:1525-1568`, `wn5:1503-1514` | only «Φύλλο οδηγού» has a chevron | chevron on the four other lines | data (which side?) |
| A line that fails to open says so in a toast | — | `wn5:1494-1498` | not shown | keep | none |

## J. Point (stop) press, right-click, drag and drop

| Today | What it does | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Right-click a point of a trip: «Μεταφορά σε άλλο φορτηγό…» | move that stop's loads (entry point; two-step) | `edit:66-73` | **NO** | point right-click menu, and a «⋯» on the pointed point | slower |
| …«Αλλαγή στον δρόμο από εδώ…» (pilot) | road change opened on this stop | `edit:74-75` | NO | same menu | slower |
| …«Διαγραφή σημείου» (per order when several: « · ref») | removes that point of the order (two acts, confirm) | `edit:77`, `edit:119` | **NO** | same menu, red | data (no way to delete a point from the board) |
| …«Διαγραφή παραγγελίας» | deletes the order (two-step) | `edit:78-79` | **NO** | same menu, red | data |
| Right-click anywhere on a waiting row: the two delete lines | — | `edit:265` | NO | waiting-row menu | data |
| Never on «Βέροια · τέλος» | — | `edit:265` | — | keep | — |
| Drag a waiting row onto a truck row | opens that truck's «+» with the load marked; never writes by itself | `wn5:940`, `wn5a:705-738` | not shown | keep | slower |
| Drag a point onto another truck row | «Μεταφορά» with one confirmation | `edit:1-12`, `edit:270-303` | not shown | keep | slower |
| Drag a point onto a day head | one-stop day panel with that day chosen | `edit:248-253` | not shown | keep | slower |
| Drag parts between drafts (composition, pilot) | inside the panel, not audited | `cmp:643-662` | — | — | — |

## K. Day / hour panel

| Today | What it does | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Side panel «Ημερομηνία φόρτωσης Βέροιας» / «Ημερομηνία ΑΝΟΔΟΥ» from the day chip; meta «ΚΑΘΟΔΟΣ · plate · N παραδόσεις» | moves the **whole side** by days | `wn5a:2355-2395`, `wn5a:2522` | YES changed (small popover «name · παράδοση», «Ημέρα», «Ώρες») | keep two modes: day press on the side head = whole side; day press on one point = that stop | data (one-stop popover cannot express "move the side") |
| One-stop panel «Ώρα στάσης · place» (from the side form's «Αλλαγή ώρας στάσης ›» or a point dropped on a day) | day and window of one stop | `wn5a:2353-2365`, `forms:1020`, `forms:1763` | YES changed (this is what the mock draws; opened by pressing the day text) | title by place, not client name | — |
| Month calendar (‹ ›, today ring, original day dashed) | pick day | `wn5a:2190-2212` | changed (one field) | calendar opens from the field | none |
| «Παράθυρο» / «Άφιξη Βέροιας» two hour fields | Veroia window (or the stop's) | `wn5a:2412-2414` | YES same («Ώρες») | — | — |
| «ΑΠΟΤΕΛΕΣΜΑ · +1 ΗΜΕΡΑ»: every stop old → new, from a dry run on each change | shows what will move before saving | `wn5a:2236-2300`, `wn5a:2455-2484` | **NO** | list under the two fields, appears after a change | data (stops shift unseen) |
| «Μετακίνηση και της ΑΝΟΔΟΥ +1» checkbox | moves the return too | `wn5a:2296`, `wn5a:2511` | **NO** | one check line | data (άνοδος left on the old day, or moved unasked) |
| Conflict line + «Ανάθεση <next trip>…»; busy truck / driver accepted with «Αποθήκευση έτσι κι αλλιώς» | warns, does not block | `wn5a:2428-2432`, `wn5a:2473-2477`, `wn5a:2306`, `wn5a:2495` | NO (generic state «Προειδοποιεί, δεν εμποδίζει») | strip inside the popover | data |
| «Άκυρο» / «Αποθήκευση» / «Αποθήκευση · επιβεβαίωση»; save locked until the dry run matches; «Λείπει: …» reason beside the buttons | — | `wn5a:2398-2406` | changed («Άκυρο» / «Εντάξει») | «Αποθήκευση» (it writes); reason as hover on the locked button | none (word) |
| Sends the last change the board showed; another person's newer change is refused | stale-write guard | `wn5a:2147`, `cfg:413-416` | generic state «Το άλλαξε κάποιος άλλος» | — | — |

## L. Print, search, keyboard, refresh, refused writes

| Today | What it does | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Printed week | A4 landscape; warns if international plates were not read | `wn5:2026-2050` | YES (header) | — | — |
| Driver sheet per side / whole trip + WhatsApp text; no prices; Veroia only as own warehouse | — | `sheet:1-7`, `wn5:2109-2112` | YES changed («Φύλλο οδηγού ›», send sign) | — | — |
| Search box «Αναζήτηση» with key cap «/»; non-matching rows fade, matches raised; counter «1/2»; Enter = next match; Esc = clear | finds truck, driver, partner, client, place, reference in **this week's rows** | `wn5:1903-1968`, `wn5l:395` | YES changed (box only) | counter inside the box; keep `/`, Enter, Esc | slower |
| No match: table hidden, strip «ΑΝΑΖΗΤΗΣΗ · Κανένα αποτέλεσμα για «…» στη Wnn» + «Καθάρισμα ×» | — | `wn5:1925-1942` | changed (states tile offers results in other weeks) | section 2 | — |
| Keys: `/`, Esc (menu, route panel, search), ← → week, → ← in the menu, Enter in search | — | `wn5:1719-1734`, `ui:452-461` | not shown | keep; a «?» sheet would be new | slower |
| Refresh only by press; **no timer**, no auto-refresh on focus; a save re-reads the board | — | `wn5:431-440` | same | — | — |
| «ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ» strip (+ «Ανανέωση ↻») | the save is done but the rows are old; "do not repeat it" | `wn5:721-726` | **NO** | dark note over the board with one button | data (double entry) |
| «ΣΦΑΛΜΑ» strip with «Η εβδομάδα δεν διαβάστηκε — δεν σημαίνει ότι είναι άδεια» / «Ό,τι ήρθε πριν μένει στην οθόνη · Τελευταία πλήρης HH:MM» | — | `wn5:727-730` | YES (states tile «Δεν διαβάστηκε») | add "last full read HH:MM" | none |
| «ΟΝΟΜΑΤΑ ΤΟΠΩΝ» strip (places read «—») ; «ΔΕΔΟΜΕΝΑ ΠΟΥ ΔΕΝ ΣΧΕΔΙΑΣΤΗΚΑΝ» strip | partial data is said, never dropped | `wn5:734-744` | NO | one warning sign beside the refresh token, list on hover / press | data |
| Action result heads: «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ», «ΕΙΧΕ ΗΔΗ ΑΠΟΘΗΚΕΥΤΕΙ», «ΧΡΕΙΑΖΕΤΑΙ ΕΠΙΒΕΒΑΙΩΣΗ», «ΜΠΟΡΕΙ ΝΑ ΑΠΟΘΗΚΕΥΤΗΚΕ», «ΑΡΓΗ ΑΠΑΝΤΗΣΗ», «ΧΩΡΙΣ ΣΥΝΔΕΣΗ», «ΠΡΟΕΙΔΟΠΟΙΗΣΗ», «ΣΦΑΛΜΑ» | one vocabulary for every answer of the base | `wn5a:35-39` | partly («Δεν αποθηκεύτηκε», warning, changed-by-other) | add «Μπορεί να αποθηκεύτηκε» (unknown outcome) and «Είχε ήδη αποθηκευτεί» | data (unknown outcome → double entry) |
| «ΠΡΟΕΠΙΣΚΟΠΗΣΗ»: writes closed → every save button locked for the session, dry runs stay | — | `wn5a:16-18`, `wn5a:449-451` | NO | page-level note; save buttons disabled | none (rare, rollback only) |
| No role gate: every role sees every control; the base's refusal is shown as «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ» | owner decision | `wn5a:14`, `wn5:2125` | mock has a «Μόνο ανάγνωση» state | do not hide controls per role on this board without asking | — |
| Destructive acts are two steps: dry run → list of what will happen → confirm | — | `wn5a:553-690` | not drawn (dialogs) | keep in every dialog | data |

---

## 1. Forgotten, must add (most important first)

1. **Waiting-row actions**: order card («Καρτέλα παραγγελίας» → edit / delete) for a waiting national order, and «Στον Πίνακα Βέροιας» for a waiting VS standing at Veroia. The mock waiting row has a menu button with no list.
2. **Point right-click menu**: «Μεταφορά σε άλλο φορτηγό…», «Διαγραφή σημείου», «Διαγραφή παραγγελίας» (+ «Αλλαγή στον δρόμο από εδώ…» when on).
3. **Rota line** inside the truck's row (next load with the same truck) with its own press and «Αποσύνδεση από το δρομολόγιο».
4. **Local drivers**: the «ΤΟΠΙΚΑ» day × driver list and the «Φόρτωση με τοπικό» mark on the row, each with «Ακύρωση».
5. **Other-week rows** («n · Wxx», pressable) at the edges of the week.
6. **Unknown pallets** («;», «12+;») — never 0, never a full-looking bar.
7. **«λείπει τιμή»** sign on a point, and **late** sign on a point of a trip row (amber), late never folded into «+N».
8. **Day panel content**: result list from the dry run, «Μετακίνηση και της ΑΝΟΔΟΥ», conflict / busy line, and the whole-side mode.
9. **Week before the cutover day**: the one line + «Παλιά προβολή» button.
10. **«ΑΠΟΘΗΚΕΥΤΗΚΕ · Ο ΠΙΝΑΚΑΣ ΔΕΝ ΑΝΑΝΕΩΘΗΚΕ»** and **«ΜΠΟΡΕΙ ΝΑ ΑΠΟΘΗΚΕΥΤΗΚΕ»** states (both prevent double entry).
11. **Sub-lists «Κάθοδος / Άνοδος»** on four menu lines, and the menu head naming the truck.
12. **Vehicle change detail**: every segment with its driver / partner and rate, «κόμιστρο λείπει», and the way into the trip card («Διόρθωση», «Αφαίρεση»).
13. **Mark «VS <day>»** when the International board has another Veroia day than the truck.
14. **Day fold** (press the day title; «N γραμμές κρυμμένες») and the **empty-day** / not-read day states for all seven days.
15. **Veroia chip**: stock («απόθεμα») and late count; **«σε πρόχειρο»** mark on waiting rows (composition).
16. **«ΕΠΟΜΕΝΑ» overflow** («Όλες οι N») and its empty / not-read states.
17. **Search**: match counter, Enter = next, Esc = clear, `/`.
18. Partner trip without άνοδος = «Μόνο κάθοδος · συνεργάτης» (a fact, not an amber slot); «χωρίς οδηγό» on a truck tile.
19. Partial-data notes («ΟΝΟΜΑΤΑ ΤΟΠΩΝ», «ΔΕΔΟΜΕΝΑ ΠΟΥ ΔΕΝ ΣΧΕΔΙΑΣΤΗΚΑΝ») and the current-week dot on the strip.

## 2. Shown in the mock-up but not true today (NEW — owner decides)

| # | Mock-up | Today | Note |
|---|---|---|---|
| NEW-1 | Day signs: trucks count, loads without truck, «γυρίζει άδειο», «πάνω από 33» (`mock:520`, `:630-646`) | No count on a day head. Owner 31/10 removed counts of "cycles" from the header (`wn5:860-861`) | All four can be counted from the rows already on screen; no new data. Decide whether counts come back. |
| NEW-2 | «Σύνθεση φορτίων» chip **and** «Βέροια» chip together, for everyone (`mock:659-661`) | One or the other; composition is pilot-only (`cfg:417`, `ver:239-240`) | Means opening composition to everyone and keeping the Veroia panel beside it — both show the same pieces. |
| NEW-3 | Pallet fill bar under each number (`mock:623`) | Number only; red over 33 | Display only; needs a rule for unknown pallets. |
| NEW-4 | Search state «3 παραγγελίες ταιριάζουν σε άλλες εβδομάδες · Δείξε τες» (`mock:546`) | Search looks at this week's rows only | Needs a read the board does not have. |
| NEW-5 | Empty-return slot names the **place** where the truck is free (`mock:644`, `:651`) | Says day and hour only («ελεύθερο από Δευ 14:30») | Place is on the board (last delivery); wording change. |
| NEW-6 | Second line «συνεργάτης» under a partner's name (`mock:634`) | Nothing under the name (one segment) | Harmless. |
| NEW-7 | One-stop day/hour popover opened by pressing the day text of any point (`mock:519`, `:229`) | Day chip opens the whole-side panel; one-stop panel only via the side form or a drag | Good shortcut, as long as the whole-side mode stays. |
| NEW-8 | Whole past **days** dimmed (`mock:243-245`) | Dimming per stop / side / row, by the base's flags, current week only | See section 3. |
| NEW-9 | States tile «Μόνο ανάγνωση» | This board has no read-only mode per role | Locked owner decision today (everyone sees every control). |
| NEW-10 | Row menu line «Αλλαγή οχήματος στον δρόμο» (one name) | Two names behind a flag: «Αλλαγή οχήματος…» (everyone) / «Αλλαγή στον δρόμο…» (pilot) | Fine as the single entry **once** road change is on for everyone; until then the line opens only the vehicle change. |

## 3. Wrong or doubtful business content in the mock-up

1. **Week definition** — correct: Saturday 14/11 to Friday 20/11, week 47, Saturday first.
2. **Which day a row is filed under** — correct in every drawn row: a κάθοδος row sits on its **first delivery day** (rows 1–4, 6–9), a row without κάθοδος on its **άνοδος loading day** (rows 5, 10), a waiting άνοδος load on its loading day (`wn5l:47-57`, `wn5l:376-382`, `wn5l:491`). Trips before waiting loads — correct.
3. **«ΕΠΟΜΕΝΑ» and the rows disagree.** The band shows three loads; only the Saturday one is also a red row. Today every «ΕΠΟΜΕΝΑ» card is a waiting row on its own day (`wn5l:606`), so Monday should carry two more red «Ανάθεση» rows, and Monday's signs should count them.
4. **Week-tab badge vs band.** The badge counts **all** orders without a truck (national too); «ΕΠΟΜΕΝΑ» counts only Veroia Switch ones. The mock shows 3 and 3, which reads as the same number; they differ whenever a national order waits.
5. **Name on a point.** Today line 1 is the **place** and line 2 its city; the client is off the row by owner decision 28/10 (`wn5:1184-1187`), also on the «ΕΠΟΜΕΝΑ» cards (`wn5:827-830`). The mock's samples read as client names (band chips especially). Confirm: place first, client on hover.
6. **Pallet capacity** — 33, correct; over 33 is red and never blocks — correct («40 +7»). Missing: unknown pallets. The bar must not look "full / fine" for «12+;».
7. **Veroia deadlines.** Today: (a) a trip's end at Veroia shows an hour only when someone set one («ως Τετ 12:00»), else just the day; (b) a **waiting** άνοδος load ending at Veroia shows «Βέροια · ως <window end, else the base's due day>», never an invented hour (`wn5:1189-1207`); (c) "late" is the base's flag, shown on the **loading day** chip in red, not on the deadline. The mock's row 2 («day, clock, another day») has no counterpart unless it is the «VS <day>» mismatch mark — then it must say so on hover. The red clock on the waiting row marks the deadline day; today the red goes on the loading day.
8. **Dimming by date.** The mock fades whole past days in the screen. Today the screen never compares a date: it follows the base's "done" flags, only in the current week, and never fades a row without a truck or a late stop (`wn5:916-925`). A Saturday trip whose άνοδος delivers on Tuesday is not done on Monday; the mock would fade it.
9. **Day signs.** If kept (NEW-1): "trucks" must count trip rows of that day (own and partner, not waiting rows, not other-week rows?) — undefined today; "χωρίς φορτηγό" = waiting rows of the day; "γυρίζει άδειο" must not count a partner's «Μόνο κάθοδος»; "πάνω από 33" is per side, not per row.
10. **Words.** «Ανάθεση ή αλλαγή φορτηγού» drops «ή συνεργάτη» (the form assigns partners too). «Εντάξει» on a panel that writes should be «Αποθήκευση». Column head «Φορτηγό» (today «ΑΝΑΘΕΣΗ») is fine but the cell also holds partners. «Φύλλο οδηγού» for «Εκτύπωση / WhatsApp» is fine. Window «14:00–23:59» should print through the one reader rule (`wn5l:76-83`).
11. **Seven tabs / current-week mark.** The mock shows six weeks and no mark for the current week separate from the selected one.
12. **Vehicle-change tile** shows one driver for two vehicles; today each part has its own driver or partner (and rate).
13. **Menu popover caption** says «οι πράξεις της γραμμής, όπως σήμερα» — not exactly: order, names and sub-lists differ (section 4).

## 4. Row menu: today vs mock-up

Today (`wn5:2085-2127`, sorted by `order`). **Every line appears on every trip row** — there is no per-row condition; a line that cannot act says why after the press. A waiting row has no ✈ menu.

| # | Today's label (exact) | Right side | Sub-list | What it opens | Condition / remark |
|---|---|---|---|---|---|
| head | «plate · driver» or partner / «day · Βέροια window» | — | — | — | always |
| 1 | «Άνοιγμα παραγγελιών» | count | — | list of the trip's orders → order card | always |
| 2 | «Διαδρομή» | — | — | route diagram side panel (read-only) | always |
| 3 | «Ανάθεση / αλλαγή φορτηγού ή συνεργάτη» | — | — | assignment form on this trip | always |
| 4 | «Νέα παραγγελία σε αυτό το δρομολόγιο» | › | Κάθοδος · Άνοδος | short order form on that side | always |
| 5 | «⤷ Επόμενο φορτίο με το ίδιο φορτηγό» | «κάθοδος · άνοδος» › | Κάθοδος · Άνοδος | the side's «+» in rota mode (from waiting loads) | always |
| 6 | «Φόρτωση με τοπικό» | «κάθοδος · άνοδος» › | Κάθοδος · Άνοδος | local-loading window (stop chosen inside) | always |
| 7 | «Παράδοση με τοπικό» | «κάθοδος · άνοδος» › | Κάθοδος · Άνοδος | vehicle change pre-filled at the side's first delivery | always; toast if that side has no delivery (`wn5:1593-1603`) |
| 8 | «Σπάσιμο παραγγελιών» | «→ Βέροια» | — | κάθοδος deliveries back to Veroia (two-step) | always |
| 9 | «Εκτύπωση / WhatsApp» | › | Κάθοδος · Άνοδος · Όλο το δρομολόγιο | driver sheet + WhatsApp text | always |
| 10 | «Αντιγραφή πινακίδων» | — | — | clipboard | always; a partner trip has no plates and says so |
| 11 | «Αλλαγή οχήματος…» **or** «Αλλαγή στον δρόμο…» | «›» / — | — | vehicle change entry / road change | second label only with `WN_ROAD` (pilot user) |
| — | separator | | | | |
| 12 | «Καθαρισμός ανάθεσης» (red) | «κάθοδος + άνοδος» | — | dry run → consequences → confirm | always (the base allows owner + dispatcher) |

Mock-up (`mock:518`):

| # | Mock label | Matches today's | Difference |
|---|---|---|---|
| 1 | «Άνοιγμα παραγγελιών» · 2 | 1 | same |
| 2 | «Διαδρομή» | 2 | same |
| 3 | «Ανάθεση ή αλλαγή φορτηγού» | 3 | «ή συνεργάτη» dropped |
| 4 | «Νέα παραγγελία σε αυτό το δρομολόγιο» | 4 | no chevron: side choice lost |
| 5 | «Επόμενο φορτίο με το ίδιο φορτηγό» | 5 | no chevron |
| — | separator | | new grouping |
| 6 | «Φόρτωση με τοπικό» | 6 | no chevron |
| 7 | «Παράδοση με τοπικό» | 7 | no chevron |
| 8 | «Αλλαγή οχήματος στον δρόμο» | 11 | moved up; one merged name (NEW-10) |
| 9 | «Σπάσιμο παραγγελιών προς Βέροια» | 8 | same meaning |
| — | separator | | |
| 10 | «Αντιγραφή πινακίδων» | 10 | moved before the sheet |
| 11 | «Φύλλο οδηγού» › | 9 | renamed; chevron kept |
| 12 | «Καθαρισμός ανάθεσης» (red) | 12 | no separator before it; «κάθοδος + άνοδος» dropped (it clears both sides — keep as hover) |
| — | (no head) | head | truck / day line missing |

Nothing is missing from the list itself: twelve lines today, twelve in the mock-up. What is lost is the four «Κάθοδος / Άνοδος» sub-lists, the head, and the red line's separator. The menus the mock-up does not have at all: waiting-row menu, point right-click menu, rota-line menu (section 1, items 1–3).
