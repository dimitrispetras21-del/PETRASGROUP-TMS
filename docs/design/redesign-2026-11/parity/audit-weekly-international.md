# Parity check 5 — «Εβδομαδιαίο Διεθνών» (today v4) versus the redesign mock-up

Read-only business check, 15/11/2026. Nothing was run; no database, Worker or app was opened.

**Compared**

- TODAY: the live v4 board. Code read at the worktree tip (`7646272f`).
- MOCK-UP: `docs/design/redesign-2026-11/index.html`, section `#s5` (lines 627–655) and the JS block "screen 5" (lines 856–887); screenshots `shots/06-weekly-intl.png`, `shots/06-weekly-intl-panels.png`.

**File short names** (as in the catalogue): `wi` = `modules/weekly_intl.js`, `wi2` = `modules/weekly_intl_v2.js`, `wi4a` = `modules/wi4_actions.js`, `wi4l` = `core/wi4-logic.js`, `pre` = `modules/preorder.js`, `mock` = `docs/design/redesign-2026-11/index.html`.

**How far each reference was checked**

- "V" after a reference = I read that code path myself in this pass.
- No mark = taken from the catalogue `catalog/A-weekly-boards.md` §1 and not re-opened.

**Owner rules respected (not flagged):** days always open; no national reasons in «ΕΠΟΜΕΝΑ»; group on earliest delivery day; no explanation text, «!» on hover; no codes; Sat–Fri week; 33 is display only; assignment never locks; the three new things (drag to reorder points in the form, who takes each loading place through Veroia, one overview of a groupage load).

"In mock-up?" values: **YES same**, **YES changed**, **NO**.

---

## 1. Area tables

### 1.1 Header and top bar

| Today (label on screen) | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| «Εβδομαδιαίο Διεθνών» + date range «14–20 Νοεμβρίου» | title, range of the week | `wi2:1787` V, `wi2:1664` V | YES same | header | none |
| «↻ Ενημερώθηκε πριν N΄» | freshness of the read | `wi2:1689-1718` V | YES changed (clock «07:42», click = refresh) | header | none |
| «N αλλαγές από … · Ανανέωση» (button) | others changed international orders since load; click re-reads | `wi2:1691-1704` V | NO | same place as the clock, turns into this when N > 0 | data (stale board without knowing) |
| «N αλλαγές δεν αποθηκεύτηκαν» | counter of failed saves, own slot | `wi2:1677-1680` V | NO | header, beside the clock | data |
| Presence strip (who else is here) | switched off today (`WI_PRESENCE` false) | `wi2:1950-2020` | NO | none needed until switched on | none |
| «Προβολή ▾» | menu, see 1.11 | `wi2:1746-1767` V | YES changed | header | — |
| «Pre-order N» | opens the create form; N = pre-orders on the sheet | `wi2:1775`, `wi2:1795` V | YES same («Pre-order 2», tooltip «Νέο pre-order · 2 ανοιχτά») | header | none |
| «Σάρωση» | new order from a scanned document | `wi2:1776` V | YES same | header | none |
| «+ Νέα παραγγελία» | order form over the board | `wi2:1777` V | YES same | header | none |
| User chip → «Αποσύνδεση» | sign out | `wi2:2377-2450` | YES changed (initials at the bottom of the rail; menu not drawn) | rail | none |
| Banner: local relays not loaded + «↻ Ξαναδοκίμασε» | says a source failed | `wi2:1861-1866` V | NO | one line under the week strip (states sheet) | data |
| Banner: «N παραγγελίες δεν φαίνονται στον πίνακα» | orders loaded but drawn nowhere | `wi2:1871-1886` | NO | same line | data |
| Banner: «Η νέα προβολή απέτυχε — δείχνουμε την παλιά» | renderer fell back | `wi2:2075-2101` | NO | not needed if the old view is retired; otherwise states sheet | none |

### 1.2 Week strip

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| ‹ · W−3 … W+3 · › | week tabs, written «W47» | `wi2:1719-1745` V | YES changed (numbers without «W», 44–50) | week strip | none |
| Current-week dot | marks the real current week | `wi2:1737` V | NO (only the selected tab is marked) | week strip | slower (lost after browsing away) |
| W+1 badge | **only** on next week, only while on the current week: number of next-week loads that load by tomorrow; «…» loading, «—» failed | `wi2:1727-1734` V | YES changed — see §4.5 (mock has a badge on the current week too) | week strip | data if the meaning changes silently |
| «Σήμερα» | shown only when off the current week | `wi2:1743` V | YES changed (always shown, in the header) | header | none |
| ← / → keys change week | keyboard | `core/ui.js:445-461` | not shown | keyboard list | slower |

### 1.3 «ΕΠΟΜΕΝΑ» band and queue panel

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| «Αναζήτηση» with `i/N` counter and «/» hint; Enter next, Esc clear; non-matches dim | search across client, place, plate, driver, reference | `wi2:1826-1832` V, `wi2:2525-2577` | YES changed (box in the week strip; counter not drawn; tooltip names the fields) | week strip | slower (no `i/N`) |
| «ΕΠΟΜΕΝΑ · N» + «X επείγοντα · Y προσοχή» | count split by level | `wi2:1798-1806` V | YES changed (one red number, no split) | band | slower (cannot tell urgent from watch) |
| «≥N», «· φορτώνει…» | count is a lower bound while a source loads or failed | `wi2:1802-1806` V | NO | band (states sheet) | data (a failed source read as "nothing") |
| «Τίποτα επείγον αυτή την εβδομάδα» / «Φορτώνει — η λίστα δεν είναι πλήρης ακόμη» | empty band | `wi2:1807` V | NO | band (states sheet) | none |
| Up to 3 cards: day chip · load in words · pallets + reason · one button | card click scrolls to the row; button does the one action | `wi2:1808-1820` V | YES changed (chips without a button; no pallets except on the over-33 one) | band | slower (one extra click per item) |
| Card buttons: «Ανάθεση», «Νέα εισαγωγή», «Κομμάτια», «Άνοιγμα», «Παρτίδα», «Μετατροπή», «Ξαναδοκίμασε», «Τοπικός οδηγός», «W48 →» | one existing action per reason | `wi4a:75-80` V | NO | on the chip (hover) or in the queue panel rows | slower |
| «Όλα N ▾» | opens the queue panel: every item, grouped (stops a load / costs / wants a look), `Q` steps through | `wi2:1825` V, `wi4a:1430-1583` | YES changed («και 2 ακόμη»; the panel itself is not drawn) | panel under the band | slower; data if next-week and stock items have nowhere to appear |
| Next-week items in the queue | free imports of W±1 that need a truck today/tomorrow, and next week's loads due by tomorrow, sit in this queue | `wi2:613-622` V, `wi2:637-638` V | NO | queue panel, with the week named | data (a load of next Saturday is missed on Friday) |
| Stock items in the queue | lot to close / ageing / moving without intake; loose piece past delivery (red) | `wi2:623-636` V | NO | queue panel | data |
| "Source not loaded" items | one item per failed source | `wi4l:646-656` V | NO | queue panel | data |

### 1.4 Stock shelf

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| «Απόθεμα σε αποθήκες» strip of lot chips (warehouse · client · «18/24π», flags «να κλείσει;», «>21 ημ.», «σε κίνηση χωρίς παραλαβή») | each chip opens its lot; shown only when stock exists | `wi2:1834-1840` V, `wi:7211-7360`, `wi2:113` V | YES changed (one chip «Απόθεμα 2 παρτίδες · 18π»; what opens is not drawn) | chip opens a panel listing the lots with their flags | slower; data if the lot flags are dropped |
| Lot modal, loose-piece modal (contents, pieces, lock / return) | work on stock | `wi:7420-7600` | NO | panel from the chip | data (no way to place stock on a truck) |

### 1.5 Column header, incl. the collapsible national columns

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| `#` | row number 1…N over the week, shared with «Παραγγελίες › Εβδομάδα» | `wi4l:55-63` V | YES same | first column | none |
| «◂ ΠΡΟΣ ΒΕΡΟΙΑ» (click folds the column) | national leg to Veroia of a Veroia-Switch export: tile with place → Βέροια, day, national carrier or «ΠΡΟΣ ΑΝΑΘΕΣΗ» / «—» | `wi2:1855` V, `wi2:1099-1128` V | YES changed — no column; a «VS» tag, a «!» on hover, and the new panel «Μέσω Βέροιας · ποιος παίρνει κάθε φόρτωση» | tag + panel is a fair replacement **if** the tag itself shows state (carrier set / missing / not read) | slower (carrier no longer readable down the column) |
| «ΑΠΟ ΒΕΡΟΙΑ ▸» (click folds) | national delivery from Veroia of a Veroia-Switch import | `wi2:1860` V | YES changed — only a «VS» tag on the import; **no panel is drawn for the import side** | same panel, import wording («ποιος παραδίδει κάθε σημείο») | slower |
| «ΕΞΑΓΩΓΗ · N φορτία · ανά ημέρα εκφόρτωσης» + «ΠΑΛ.» | count of export rows; says how rows are filed | `wi2:1856` V | YES changed («Εξαγωγή · φόρτωση», «Παράδοση», «Παλ.»; no count, no filing note) | header; count optional | none |
| «ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ» | assignment + driver order | `wi2:1857` V | YES changed («Ανάθεση») | header | none |
| «ΕΙΣΑΓΩΓΗ · N φορτία» + «ΠΑΛ.» | count of import rows | `wi2:1858` V | YES changed (no count) | header | none |
| «Εθνικές στήλες» toggles in «Προβολή ▾» | same fold, from the menu; remembered per browser | `wi2:1755-1757` V | NO | not needed if the columns go | none |
| «✎» Veroia notice on a tile | read the national desk's note on that load | `wi2:1073-1098` | NO | inside the «Μέσω Βέροιας» panel | data (the note is the only channel from the national desk on this board) |

### 1.6 Day sections

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| Day name + date, «· σήμερα» | seven days Sat–Fri, always present | `wi2:1633-1663`, `wi4l:300` V | YES same | day card | none |
| Day line «4 φορτηγά · 1 χωρίς φορτηγό · 2 κενά γυρίσματα (1 από σήμερα)» | per-day summary | `wi4l:690-702` V, `wi2:1661` V | NO (the national mock-up has day marks; this one has none) | day header, as the small marks of the national board | slower |
| Chevron, click folds a day (session only) | user folds | `wi2:1622-1663` | NO (no fold control drawn) | day header | slower |
| Folded day with work: one dot (red filled / amber ring) | folded day still says it has work | `wi2:1633-1663` | NO | day header | data (a folded day hides a red item) |
| Empty day = name only | — | `wi2:1648-1652` | YES same (Κυριακή, Πέμπτη) | — | none |
| «μεταφέρθηκε» sections after Friday | rows moved into this week by «Μεταφορά εβδομάδας» keep their real day, listed after Friday | `wi4l:279-280` V, `wi4l:340` V | NO | after Friday, same card style | data (moved rows have no place) |
| «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ» | rows without a date | `wi2:1633-1663` | NO | last card | data |

### 1.7 Row types

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| Export row: number + ✈ menu button; points with «+N»; date chips; pallets; documents paperclip; assignment; matched import | one truck's work | `wi2:1237-1331` | YES changed (number turns into «…» on hover; «+2», «×3» tags; no paperclip) | row | paperclip: slower |
| Date chips with a green ✓ when the step is done, amber «καθυστέρηση» when late | progress of the load | `wi:1999` V, `wi2:871` V | YES changed (late drawn as a **red** clock on the day; done ✓ not drawn) | date in the row | slower |
| Pallets «N+?» when a member has no figure | unknown ≠ fine | `wi2:383-386` V | YES same (dotted meter, hover text) — helper exists (`mock:815` V), not used on a drawn row | row | none |
| Gap cell «Κενό γύρισμα · από Τρί 17/11 · Ulm» + «Νέα εισαγωγή» + stock link | own truck, no import; drop target; N key | `wi2:1370-1383` V | YES same («Κενό γύρισμα · Ulm · Τρί 17» + «+»); stock link not drawn | import side of the row | stock link: slower |
| «Μόνο εξαγωγή · συνεργάτης» | partner row never gets an empty return; the cell says so | `wi2:1308` V | YES changed (blank cell) | blank is acceptable (fewer words) | none |
| «Χωρίς εισαγωγή» + «Νέα εισαγωγή» on an export with no truck yet | match is allowed before assignment (owner 8/11) | `wi2:1310` V, `wi2:1384-1392` V | NO (row 4 import side is blank) | import side, grey «+» | slower |
| «εισαγωγή εκτός προβολής · Άνοιγμα» | matched import not read with this week | `wi2:1299-1304` V | NO | import side | data (looks like an open slot) |
| Import-only row, handle «⋮⋮», draggable | unmatched import on its loading day | `wi2:1398-1419` | YES changed (handle in the assignment cell + «Χωρίς ταίριασμα») — see §4.3 | row | — |
| Ghost row | an import group drawn on its own day while matched elsewhere / a failed match | `wi2:1354-1369` | NO | states sheet | data |
| Split header «ΣΠΑΣΜΕΝΗ ΣΕ N ΣΚΕΛΗ» + leg rows ↳1 ↳2 | order split in two legs, each leg with its own truck | `wi2:1420-1438` | NO | sub-rows under the row | data (legs have nowhere to be assigned) |
| Rota leg row; «συνέχεια» for a leg of another week | forwarding leg under its parent | `wi2:1439-1520` | NO | sub-row | data |
| Local relay sub-row «Παράδοση/Φόρτωση με τοπικό οδηγό» (+ «ΠΡΟΣ ΑΝΑΘΕΣΗ» when no driver) | local driver for one end | `wi2:1521-1580` | NO (only a menu entry) | sub-row | data (a relay without driver is a red queue item today) |
| Save-failure line «Δεν αποθηκεύτηκε — … · Ξαναδοκίμασε · ×» | under the row | `wi2:1935-1948` | NO | under the row | data |
| Missing-record row + «Ανανέωση» | order not in the read | `wi2:1229-1236` | NO | states sheet | data |
| Pre-order row: «PRE», client, country in place of the unknown point | provisional load | `wi2:3097` V, `pre:58-61` V | YES changed — see §4.6 | row | — |
| Lot row «ΠΑΡΤΙΔΑ → ΑΠΟΘΗΚΗ» | a lot going into stock | `wi:7391-7402` V | NO | row with a tag | data |

### 1.8 Assignment cell and popover

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| Own truck: plate · trailer / driver | — | `wi2:1139-1218` | YES same | cell | none |
| Partner: name / plates | — | `wi2:1139-1218` | YES same | cell | none |
| «ΠΡΟΣ ΑΝΑΘΕΣΗ» | empty; opens the popover | `wi2:1139-1218` | YES changed (red «Ανάθεση») | cell | none |
| «—» with a title for a set vehicle or person missing from the lists | unknown ≠ empty | `wi2:1132-1136` V | NO | cell | data |
| Same-day clash named on the cell | truck or driver on two loads the same day | `wi2:395` V | NO | «!» on the cell | data |
| Copy plates | copies the plates text | `wi:4701-4702` V | YES changed (menu only) | menu | none |
| Printer / paper plane (click = print, right-click = share menu with WhatsApp) | driver order | `wi2:1139-1218`, `wi:4678` | YES same («Φύλλο οδηγού», on hover) | row end | none |
| Popover «ΔΙΚΟΣ ΣΤΟΛΟΣ» / «ΣΥΝΕΡΓΑΤΗΣ» | switch | `wi:3593-3720` V | YES same (Φορτηγό / Συνεργάτης) | popover | none |
| «Φορτηγό», «Ρυμούλκα», «Οδηγός» (type-ahead) | — | `wi:3593-3720` V | YES same | popover | none |
| «Εταιρεία», «Πινακίδες» (placeholder «π.χ. ΙΑΒ 1099») | partner and his plates | `wi:3593-3720` V | NO (partner tab not drawn) | popover, partner tab | data |
| «Κόμιστρο εξαγωγής €», «Κόμιστρο εισαγωγής €» | partner fee per direction (the dispatcher agrees it himself) | `wi:3676-3679` V | NO | popover, partner tab | data (fee has no entry point on this board) |
| «Ιστορικό γραμμής … τελευταία κόμιστρα» | last fees on this lane | `wi:3749` V | NO | popover, partner tab, behind «!» or a small list | slower |
| «ΤΑΙΡΙΑΣΜΕΝΗ ΕΙΣΑΓΩΓΗ» chip | the popover says the import rides with it | `wi:3593-3720` V | NO | popover | none |
| «Καθαρισμός» | clears the assignment | `wi:3593-3720` V | YES same | popover | none |
| «Αποθήκευση/Ενημέρωση ανάθεσης» | save | `wi:3769-4031` | YES same («Αποθήκευση») | popover | none |
| Confirm before reassigning an executing order (says what follows downstream) | assignment never locks, one confirm | `wi:3167-3204` | NO | confirm inside the popover | data |

### 1.9 Date panel

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| Whole panel | opened by click on a date or key D | `wi4a:1037-1352` V (texts) | NO for this board — only a menu entry «Ημέρες και ώρες»; the national section has a date popover that could be reused | popover from the date | data |
| Segments «Φόρτωση / Εκφόρτωση / Βέροια» | which date is edited; Βέροια only on Veroia-Switch rows | `wi4a:1037-1352` V | NO | popover | data (the Veroia date has no editor) |
| Calendar starting Saturday; time «ΩΩ:ΛΛ» («π.χ. 07:30») | — | same | NO | popover | slower |
| Note «Αλλάζει και τις στάσεις και τη Βέροια όπου υπάρχει. Η Εβδομάδα δεν αλλάζει από εδώ.» | what follows the change | same | NO | as a «Τι αλλάζει» list (like the national popover) | data |
| Group line | date of a groupage applies to the group | same | NO | popover | data |
| After save: names what did not follow («του εθνικού φορτίου», «της ράμπας», «των αναθέσεων συνεργατών», «των παλετών», «του groupage εθνικών») | downstream sync failure is said | `wi4a:1261-1269` V (texts) | NO | toast / line under the row | data |
| «Χωρίς σύνδεση — η αλλαγή μπήκε σε αναμονή…» | offline | `wi4a:1257` | NO | states sheet | data |
| Dialog «Ποια κρατάμε;» («Γράψε τη δική μου») | someone else changed the same field | `wi4a:913-979` | NO | states sheet | data |

### 1.10 Per-load menu

Full comparison in §5.

### 1.11 «Προβολή ▾», side panels and dialogs

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| «Εκτύπωση εβδομάδας» | A4 landscape of the week | `wi2:1749` V | YES same | Προβολή | none |
| «CSV» | export | `wi2:1750` V | YES same | Προβολή | none |
| «Ανανέωση» | re-read | `wi2:1751` V | YES changed (the clock in the header) | header | none |
| «Πλήρης οθόνη» | board only, Esc leaves | `wi2:1752` V | YES same | Προβολή | none |
| «Κατάσταση»: «Όλες» / «Χωρίς ανάθεση» / «Ανατεθειμένα» / «Εισαγωγές χωρίς ταίριασμα» | dims the other rows | `wi2:115` V, `wi2:1754` V | YES changed — «Ανατεθειμένα» is missing; «Όλες» → «Όλα τα φορτία» | Προβολή | slower |
| «Παλιά προβολή» | switch to the v1 board | `wi2:1758` V | NO | intentionally gone (owner to confirm) | none |
| Panel «Groupage εξαγωγών» / «Groupage εισαγωγών» (pick loads, build) | build or add to a groupage | `wi:4328-4680` | NO (overview panel shows an existing group; building one is not drawn) | panel from the menu | data |
| Panel «Groupage εισαγωγών · σε αυτό το φορτίο» | add a 2nd/3rd import to a truck's return | `wi:5952-5953` V | NO | panel from the menu | data |
| Panel «Σκέλος προώθησης (ρότα)» | add a forwarding leg | `wi:4843` | NO (menu entry only) | panel | data |
| Panel «Σπάσιμο σκέλους» (hand-over place, time, who takes leg 2) | split an order in two legs | `wi:4815-4838` V | NO (menu entry only) | panel | data |
| Panel «Αλλαγή σημείου παράδοσης-παραλαβής» | move the hand-over point of a split | `wi:1561` V | NO | panel from the split header | data |
| Panel «Μεταφορά εβδομάδας»: «← W46» / «W48 →», shows the real loading day, «Οι ημερομηνίες δεν αλλάζουν» | shows an unmatched import on another week's sheet | `wi:6013-6027` V | NO (menu entry only) | small popover with the two choices | data |
| Confirm «Ακύρωση προώθησης» | remove a rota leg | `wi:5574` V | NO | confirm | data |
| Stock pick panel «+ Κομμάτι από απόθεμα» | put a stock piece on a truck | `wi:7662` | NO (menu entry only) | panel | data |
| Rota card of a group: reorder stops, save, split | order of deliveries of a groupage | `wi:6893-6990` | YES changed — the new «Ομαδικό φορτίο» overview («Αποθήκευση σειράς», grips, «Διάλυση», «Φύλλο οδηγού») | overview panel | none |
| Local relay panel (driver, vehicle, day) and delete confirm | — | `wi:5843` V, `wi:5870-5876` V | NO (submenu arrow only) | panel | data |
| Pre-order form (client, direction, loading day, country, how many 1–9, notes) | — | `pre:116-143` V | NO (button only; belongs to its own sheet) | form sheet | data |
| «?» shortcuts sheet | lists the keys | `wi4a:1586-1659` | NO | header «?» or Προβολή | slower |

### 1.12 Drag and drop

| Today | What it does | file:line | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| Import row → export row or its gap = match | — | `wi2:1314` V, `wi:3087-3153` | YES same (handle on row 5, tooltip «Σύρε την εισαγωγή πάνω σε φορτηγό») | row | none |
| Import → a row that already has an import = join the load | 2nd import on the same truck | `wi2:1312-1314` V | not shown | same gesture | slower |
| Groupage tiles reorder inside a group | delivery order | `wi:6546-6655`, `wi2:804` | YES changed (grips in the overview panel) | overview panel | none |
| Edge auto-scroll while dragging | — | `wi2:2272-2281` | not shown | behaviour note | slower |

### 1.13 Keyboard

| Today | file:line | In mock-up? | Risk if left out |
|---|---|---|---|
| ↑ / ↓ row · Enter menu · A ανάθεση · D ημερομηνία · P εκτύπωση / WhatsApp · N νέα εισαγωγή (on a gap) · O άνοιγμα παραγγελίας · Q επόμενο της ουράς · «/» search · «?» help · Esc; ← / → week; works on a Greek layout | `wi4l:762-775` V (A, D, P, N, O, Q read), `wi4a:1799` | NO — only «/» and Enter are named in the search tooltip (`mock:883` V) | slower (the dispatcher works by keyboard all shift) |

### 1.14 Print / CSV

| Today | file:line | In mock-up? | Risk if left out |
|---|---|---|---|
| Week on A4 landscape, from the board model | `wi2:3135-3146`, `core/week-paper.js:238-300` | YES same (menu entry; the paper itself is not drawn for this board) | none |
| Driver order per load / per group («Εκτύπωση / WhatsApp όλων…») / per split; right-click = share menu | `wi:4678`, `wi:6858-6892`, `wi:1568` | YES changed («Φύλλο οδηγού ▸»; what the arrow opens is not drawn) | slower if WhatsApp is not one of the choices |
| CSV | `wi:8377-8405` | YES same | none |
| Full screen | `wi:3069` | YES same | none |

### 1.15 States and messages

| Today | file:line | In mock-up? | Risk if left out |
|---|---|---|---|
| Loading «Φόρτωση εβδομάδας N…», 25 s watchdog | `wi:626-642` | NO for this board | none |
| Load error card «ΔΕΝ σημαίνει ότι δεν υπάρχουν παραγγελίες · Ξαναδοκίμασε» | `wi:612-620` | NO | data |
| Empty week «Άδειο φύλλο — W47 · Καμία διεθνής παραγγελία ακόμη…» | `wi2:2122-2124` | NO | none |
| Partial data («≥N», «…», «—») | `wi2:1802-1806` V, `wi2:1731-1732` V | NO | data |
| Failed save (line, counter, queue item) | `wi2:1935`, `wi2:1677` V | NO | data |
| Conflict «Ποια κρατάμε;» | `wi4a:913` | NO | data |
| Read-only role: every control drawn, each click answers «Μόνο ανάγνωση για τον ρόλο σου» | `wi:589-593` | NO | none (owner decision if it changes) |
| Toasts: saved «✓», «την είχε αλλάξει άλλος», offline queue, downstream sync failure, row gone «ανανέωσε» | `wi4a:1257-1269`, `wi4a:128` | NO | data |

---

## 2. Forgotten, must add (most important first)

1. **Partner side of the assignment popover**: «Εταιρεία», «Πινακίδες», «Κόμιστρο εξαγωγής €», «Κόμιστρο εισαγωγής €», the lane's last fees. Only the own-truck tab is drawn. Without it a partner cannot be assigned and the fee has no entry point on this board.
2. **Date panel for this board**: Φόρτωση / Εκφόρτωση / **Βέροια**, time, what follows the change, the group line. Today's most used edit after assignment; the Veroia date has no other editor.
3. **Row kinds with no drawing**: split order (header + two legs, each with its own truck), rota leg and «συνέχεια», local relay sub-row (with its «no driver» state), lot row, ghost row, «εισαγωγή εκτός προβολής». The menu offers «Σκέλος προώθησης», «Σπάσιμο σε σκέλη», «Τοπικός οδηγός», but the result of each has no place on the board.
4. **Failed save and stale data**: the line under the row, the header counter «N αλλαγές δεν αποθηκεύτηκαν», «N αλλαγές από … · Ανανέωση», the conflict dialog, the offline message, "what did not follow" after a date change.
5. **Queue panel («Όλα N»)** with its three groups, the one-action button per item, and the items that have no row on this sheet: next week's loads due by tomorrow, stock items, sources that did not load.
6. **«Αφαίρεση ταιριάσματος»** (undo a match) — no control anywhere in the mock-up.
7. **Build / change a groupage**: «Groupage εξαγωγών…», «Groupage εισαγωγών…», «Groupage εισαγωγών · σε αυτό το φορτίο…» (2nd import on a truck), and per member «Βγάλε από το groupage» / «Επιστροφή στο απόθεμα». The overview panel shows a finished group and «Διάλυση» only.
8. **«Άνοιγμα παραγγελίας»** for a single load (menu first item, key O). The mock-up menu has it only through the group overview.
9. **Stock**: what the «Απόθεμα» chip opens (lots with flags, loose pieces), the «+ Κομμάτι από απόθεμα» pick panel, the gap cell's stock link.
10. **Day header**: the per-day summary, the fold control, and the mark a folded day keeps when it holds work.
11. **«μεταφέρθηκε» sections and «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ»** — rows that today sit after Friday.
12. **Import side of «Μέσω Βέροιας»** (today's «ΑΠΟ ΒΕΡΟΙΑ» column) and the national desk's notice «✎».
13. **Split of the «ΕΠΟΜΕΝΑ» count** (urgent / watch) and the lower-bound form «≥N» while something is loading.
14. **Pre-order rows' own menu** («Μετατροπή σε παραγγελία…», «Επεξεργασία pre-order», «Διαγραφή pre-order»), split header menu («Ένωση ξανά», «Αλλαγή σημείου παράδοσης-παραλαβής…»), rota leg menu («Επεξεργασία…», «Ακύρωση προώθησης»), relay menu («Αλλαγή…», «Διαγραφή τοπικής»), lot menu («Απόθεμα…»).
15. **Keyboard list** and the «?» sheet.
16. **Filter «Ανατεθειμένα»** in «Προβολή»; a visible sign that a filter is on.
17. **Smaller**: current-week dot on the tabs; documents paperclip on the row; same-day clash on the assignment cell; «—» for a vehicle that is set but not in the list; open import slot on an export without a truck; confirm before reassigning a load on the road; empty-week and load-error states.

---

## 3. Shown in the mock-up but not true today (owner must decide)

1. **Badge on the current week tab («47 3»).** Today only next week carries a number. What the 3 counts is not defined (it is not the «ΕΠΟΜΕΝΑ» count, which is 5 on the same screen).
2. **«Μεταφορά εβδομάδας» in an export / groupage menu.** Today only an unmatched import row has it.
3. **«Σπάσιμο σε σκέλη» on a groupage row.** Today a groupage cannot be split; the item is not offered.
4. **«Κομμάτι από απόθεμα» always offered.** Today it is not offered on a partner row, on a leg, on a lot; it is disabled without an own truck or while the truck's import is on the road.
5. **«Τοπικός οδηγός ▸» as one item for the row.** Today it is one item per order («Φόρτωση με τοπικό οδηγό…» for an export, «Παράδοση με τοπικό οδηγό…» for an import), inside each member of a group, and disabled on a partner run or without a date.
6. **«Νέα εισαγωγή για το γύρισμα» in the menu.** Today it is the gap's button and key N, not a menu item. Harmless addition.
7. **«Ημέρες και ώρες» in the menu.** Today the date panel opens from the date itself or key D. Harmless addition.
8. **Price column in the group overview** («Τιμή», «χωρίς τιμή», total 4.800,00). Today nothing on this board shows the selling price; it is visible in the order card only.
9. **A pre-order with a delivery day and 33 pallets** (row 7). Today's pre-order form has loading day, country, notes; no delivery day, no pallets.
10. **Per-loading-place truck in «Μέσω Βέροιας»** (three places, three trucks, «22 από 32 παλέτες έχουν φορτηγό»). Intended new thing (2); today the board shows one national carrier per order. The pallet split per place and the "has truck" count are new data to read.
11. **«Σήμερα» always visible**; today only when off the current week.
12. **Search moved to the week strip**, queue chips without action buttons, «και 2 ακόμη» for «Όλα N ▾».
13. **Over-33 in red** (meter, «+3», queue chip). Today over 33 is amber, a "look", never urgent.
14. **Late delivery in red.** Today «καθυστέρηση» is amber.
15. **No national columns**; «VS» tag + «!» + panel. Replacement of «ΠΡΟΣ ΒΕΡΟΙΑ / ΑΠΟ ΒΕΡΟΙΑ» and of their toggles.
16. **No «Παλιά προβολή».**
17. **Week tabs without the «W».**

---

## 4. Wrong or doubtful business content in the mock-up

"Today" in the mock-up is Monday 16/11 (week 47 = Sat 14 – Fri 20).

### 4.1 Day each row is filed under

| Row | Drawn under | Today's rule gives | Verdict |
|---|---|---|---|
| 1 Veria Fruit Pack → Innsbruck, delivers Sat 14 | Sat 14 | Sat 14 (export by first delivery day, `wi4l:279` V) | correct |
| 2 Pella Peach → Wien, delivers Sat 14 | Sat 14 | Sat 14 | correct |
| 3 groupage ×3, deliveries Mon 16 / Mon 16 / Tue 17 | Mon 16 | Mon 16 (earliest member, `wi4l:272-275` V) | correct |
| 4 Messinia → Hamburg, delivers Mon 16 | Mon 16 | Mon 16 | correct |
| 5 import only, loads Tue 17 | Tue 17 | Tue 17 (import by loading day) | correct |
| 6 Βέροια → Rotterdam, delivers Wed 18 | Wed 18 | Wed 18 | correct |
| 7 pre-order, loads Wed 18, "delivers" Fri 20 | Fri 20 | **Wed 18** — a pre-order has no delivery day (`pre:128-133` V), and an export without one is filed by its loading day (`wi4l:279` V) | **wrong day** unless pre-orders gain a delivery day (§3.9) |

### 4.2 Order of rows inside a day

- **Saturday is in the wrong order.** Rule: Veroia-Switch rows last, then by delivery time (`wi4l:49-53` V). Row 1 is tagged «VS», row 2 is not, so today Pella Peach → Wien is number 1 and Veria Fruit Pack → Innsbruck is number 2. The numbers are shared with «Παραγγελίες › Εβδομάδα», so the swap matters.
- Monday is in the right order (row 3 plain, row 4 «VS»).
- Exports before import-only rows: nothing drawn contradicts it.

### 4.3 «ΕΠΟΜΕΝΑ»: count and cards for the drawn rows under today's rules

Today's queue counts **reasons**, not rows (`wi2:613` V), and adds items that have no row.

| Row | Reasons today | Level | Date on the card |
|---|---|---|---|
| 1 | none (a national loading point without a truck is not this board's work — correct that it is only a «!») | — | — |
| 2 | none (partner: never an empty return, `wi4l:597-601` V) | — | — |
| 3 | «κενό γύρισμα · από Τρί 17/11 · Ulm» | amber (return is tomorrow) | Tue 17 |
| 4 | «χωρίς φορτηγό» | red | **Fri 13**, not Mon 16: for a Veroia-Switch export the card carries the Veroia day = loading + 1 (`wi2:369-370` V) |
| 4 | «καθυστέρηση» | amber | Mon 16 |
| 5 | «χωρίς φορτηγό» (an import-only row needs a truck too, `wi4l:592` V) | **red** (loads tomorrow) | Tue 17 |
| 6 | «πάνω από 33π» | **amber** | Mon 16 (loading day), not Wed 18 |
| 7 | «χωρίς φορτηγό» | amber (loads in 2 days) | Wed 18 |
| 7 | «pre-order χωρίς μετατροπή» | amber (2–3 days, `pre:38-42` V) | Wed 18 |

- Count from the drawn rows: **7 = 2 επείγοντα · 5 προσοχή**. The mock-up says **5**, in red.
- On top of that, the «48 6» badge means six next-week loads due by tomorrow; today those six are queue items too (`wi2:637-638` V, "the SAME number" `wi2:1727` V). With that badge the count would be **13**, and stock flags would add more.
- First three cards today (red first; then what stops a load, what costs, what wants a look; nearest date first — `wi4l:731-747` V): row 4 «χωρίς φορτηγό» (Fri 13), **row 5 «χωρίς φορτηγό» (Tue 17)**, then row 7 «χωρίς φορτηγό». The mock-up shows row 4, row 3, row 6: the unmatched import that loads tomorrow without a truck — the second most urgent thing on the sheet — is hidden behind «και 2 ακόμη», and it is drawn grey on its row.
- The mock-up's own count is right only under a new rule "one item per row". If that is the intent, it is a decision (it hides that row 4 is both without truck and late).

### 4.4 Row 5 wording

«Χωρίς ταίριασμα» in grey understates it. Today the row says it has no truck, in red from the day before loading. "Unmatched" and "no truck" are the same fact for an import-only row, but the urgency is lost.

### 4.5 Week-tab badges

- «48 6»: matches today's meaning only if it is "loads of week 48 that load by tomorrow". On Monday 16/11 that would be loads of Sat 21 onwards loading by Tue 17 — none can exist by date. A 6 here is implausible for a Monday; the badge is realistic on Thursday/Friday.
- «47 3»: no such badge today; meaning undefined (§3.1).

### 4.6 Pre-order (row 7)

- Delivery day «Παρ 20» and 33 pallets do not exist on a pre-order today (§3.9, §4.1).
- «Ελλάδα» as the loading place and «Γερμανία» as the destination: the country is right for the foreign end (`pre:58-61` V); today the Greek end shows no place at all, not the word «Ελλάδα».
- «PRE» amber at two days before loading: correct (`pre:38-42` V). It would be red tomorrow.
- Red «Ανάθεση» on a pre-order: assigning a pre-order is allowed today (`pre:19-23` V); the level here would be amber (loads in two days), not red.
- Hover text «Pre-order: λείπουν τόποι»: fine.

### 4.7 Empty return

- Row 3 (own truck, no import): amber, place Ulm, from Tue 17 — correct, including that the return counts from the **last** delivery of the group (`wi2:371` V, `wi2:376-378` V).
- Row 2 (partner): no empty return — correct.
- Row 4 (no truck): no empty return — correct. Today it shows an open slot «Χωρίς εισαγωγή» for an early match; the mock-up is blank (§2.17).

### 4.8 33 pallets

- Row 6 «36 +3»: shown, never refused — correct in substance. Colour: today amber (§3.13).
- Row 3 «33 / 33» in the overview: fine (33 is allowed, only more is a flag, `wi4l:605-609` V).
- Overview total row: the «33» overlaps «3 φορτώσεις · 3 παραδόσεις» in the screenshot (layout, `shots/06-weekly-intl-panels.png`).
- Order-form summary «Φορτηγό 32 / 33» (`mock:918` V): display only — fine.

### 4.9 Veroia Switch dates

- Rule: export Veroia day = loading + 1; import Veroia day = delivery − 1 (`wi:1909-1916` V).
- **Row 1 and the «Μέσω Βέροιας» panel disagree.** The row says loading «Τετ 11 · Βέροια». The panel says the three places load **Tue 10/11** and «Στη Βέροια Τετ 11/11». If loading is Tue 10, the row should say Tue 10 and Veroia = Wed 11 is right. If loading is Wed 11 as the row says, Veroia = Thu 12 and the panel is wrong. One of the two must change.
- **Row 1's «!» is stale.** «ένα σημείο φόρτωσης δεν έχει φορτηγό» on a load that left Wed 11 and was delivered Sat 14, seen on Mon 16. A realistic case is a load of the coming days (row 4 or 6).
- The panel reads as if it belongs to row 1 (32 pallets, Veria Fruit Pack + 2), but the menu and overview beside it are row 3's. Say which row each panel opens from.
- Row 1 import (Modena → Νάουσα, «VS», delivers Thu 19): Veroia day would be Wed 18. Not shown; nothing to check it against (§2.12).
- Row 4 (Μεσσήνη, «VS», loads Thu 12): Veroia Fri 13; consistent with a delivery in Hamburg on Mon 16 only on paper — with no truck on Mon 16 the load cannot be delivering today. The row combines "no truck" with "late today"; plausible as "should have left, did not", but then the red date should be the loading / Veroia day, not only the delivery.

### 4.10 Group overview panel

- Header «παράδοση Δευ 16/11» while one member delivers Tue 17: acceptable with the «!» on that member; the row on the board says «Δευ 16 · München 12 · Augsburg 11 · Ulm 10», which reads as if Ulm also delivers on Mon 16.
- «Αποθήκευση σειράς»: today's rota card saves the order of **stops**; the overview reorders **orders**. With one loading and one delivery per order it is the same; with an order of two deliveries it is not. Decide what the grips move.
- «Διάλυση» = today's «Διάλυση groupage» (red, last) — fine. No per-member «Βγάλε από το groupage» (§2.7).
- Price column: §3.8.

### 4.11 Wording against today's and against the "one name per thing" decision

| Mock-up | Today | Note |
|---|---|---|
| «Ομαδικό φορτίο» | «Groupage εξαγωγής / εισαγωγής» | new word for the same thing; the national board and the order form must use the same one |
| «Φύλλο οδηγού» | «Εκτύπωση / WhatsApp…», column «ΕΝΤΟΛΗ» | new name; fine if used everywhere |
| «Σπάσιμο σε σκέλη» | «Σπάσιμο σκέλους…» | — |
| «Σκέλος προώθησης» | «Σκέλος προώθησης (ρότα)…» | «ρότα» dropped; the result is still called «ΣΚΕΛΟΣ ΡΟΤΑΣ» today |
| «Κομμάτι από απόθεμα» | «+ Κομμάτι από απόθεμα…» | same |
| «Μέσω Βέροιας», «VS» | «ΠΡΟΣ ΒΕΡΟΙΑ», «ΑΠΟ ΒΕΡΟΙΑ» | «VS» is a code on screen; hover text exists |
| «PE», «HR», «+2», «×3» tags | — | short codes; each needs its hover text («+2» and «×3» mean different things: more points / orders in a group) |
| «Ανάθεση» (red) | «ΠΡΟΣ ΑΝΑΘΕΣΗ» | fine |
| «Χωρίς ταίριασμα» | «χωρίς φορτηγό» on an import-only row | §4.4 |
| «Όλα τα φορτία» | «Όλες» | fine |

---

## 5. Row menu — today's exact items per row kind versus the mock-up

### 5.1 Today (v4 labels, in the order the menu shows them)

Rule of order in every list (`wi4a:361-373` V): the order's opener first, print second, the rest in builder order, red items last. Truck items are drawn once, on top (`wi4l:960` V).

| Row kind | Items |
|---|---|
| **Export, single order** (`wi:4702-4736` V) | Truck: «Ανάθεση…» · «+ Κομμάτι από απόθεμα…» (own truck only; disabled with the reason otherwise) · «Καθαρισμός ανάθεσης» (red, when assigned). ΕΞΑΓΩΓΗ: «Άνοιγμα παραγγελίας» · «Εκτύπωση / WhatsApp…» · «Αντιγραφή πινακίδων» (when plates exist) · «Groupage εξαγωγών…» (disabled when no free export) · «Σκέλος προώθησης (ρότα)…» · «Σπάσιμο σκέλους…» · «Φόρτωση με τοπικό οδηγό…» (or «Τοπική φόρτωση: αλλαγή…»). |
| **Export with a matched import** | The above, plus section ΕΙΣΑΓΩΓΗ (`wi:5946-5963` V): «Άνοιγμα παραγγελίας» · «Εκτύπωση / WhatsApp…» · «Groupage εισαγωγών · σε αυτό το φορτίο…» · «Σκέλος προώθησης (ρότα)…» · «Παράδοση με τοπικό οδηγό…» · «Αφαίρεση ταιριάσματος» (red) · «Επιστροφή στο απόθεμα» (red, only for a stock piece). |
| **Groupage export** | Truck: as above. GROUPAGE ΕΞΑΓΩΓΗΣ: «Εκτύπωση / WhatsApp όλων…» · «Αντιγραφή πινακίδων» · «Groupage εξαγωγών… (πρόσθεση)» · «Σκέλος προώθησης (ρότα)…» · «Διάλυση groupage» (red). No split. One «▸» per member (`wi:6657-6680` V): «Άνοιγμα παραγγελίας» · «Εκτύπωση / WhatsApp…» · «Σκέλος προώθησης (ρότα)…» · «Φόρτωση με τοπικό οδηγό…» · «Βγάλε από το groupage» (red) or «Επιστροφή στο απόθεμα» (red, for a piece). |
| **Import-only row** (`wi:5969-5991` V) | Truck: «Ανάθεση…» · «+ Κομμάτι από απόθεμα…». ΕΙΣΑΓΩΓΗ: «Άνοιγμα παραγγελίας» · «Εκτύπωση / WhatsApp…» · «Groupage εισαγωγών…» · «Σκέλος προώθησης (ρότα)…» · «Σπάσιμο σκέλους…» · «Παράδοση με τοπικό οδηγό…» · «Μεταφορά εβδομάδας…». |
| **Split header** (`wi:1538-1566` V) | «Άνοιγμα παραγγελίας» · «Εκτύπωση / WhatsApp όλων…» · «Ένωση ξανά» (disabled while a leg is on the road or delivered) · «Αλλαγή σημείου παράδοσης-παραλαβής…» · «Αφαίρεση ταιριάσματος» (when matched). |
| **Split leg** | As a single export/import, with «Αρχική παραγγελία…» first, without «Groupage…» and without «Σπάσιμο σκέλους…». |
| **Rota leg** (`wi:5565-5575` V) | «Επεξεργασία…» · «Εκτύπωση / WhatsApp…» · «Ακύρωση προώθησης» (red). |
| **Local relay sub-row** (`wi:5870-5876` V) | «Αλλαγή…» · «Διαγραφή τοπικής» (red). |
| **Pre-order** (`wi:4784-4795` V) | «Μετατροπή σε παραγγελία…» · «Επεξεργασία pre-order» · «Διαγραφή pre-order» (red). Assignment from the cell. |
| **Lot held for stock** (`wi:7391-7402` V) | «Άνοιγμα» · «Εκτύπωση / WhatsApp…» · «Ανάθεση…» · «Απόθεμα…». |

### 5.2 Mock-up (one menu drawn: the groupage export of row 3, own truck, no import)

«Ομαδικό φορτίο 3» · «Ανάθεση» · «Ημέρες και ώρες» · «Φύλλο οδηγού ▸» · «Αντιγραφή πινακίδων» — «Νέα εισαγωγή για το γύρισμα» · «Σκέλος προώθησης» · «Σπάσιμο σε σκέλη» · «Τοπικός οδηγός ▸» · «Κομμάτι από απόθεμα» · «Μεταφορά εβδομάδας» — «Καθαρισμός ανάθεσης» (red).

### 5.3 Difference for that row (groupage export, own truck, no import)

| Item | Today | Mock-up | Verdict |
|---|---|---|---|
| Open the orders | per member «Άνοιγμα παραγγελίας» | «Ομαδικό φορτίο» → row arrows | changed, fine |
| «Ανάθεση…» | yes | yes | same |
| Dates | date chip / key D | «Ημέρες και ώρες» | added, fine |
| Print / WhatsApp | «Εκτύπωση / WhatsApp όλων…» + per member | «Φύλλο οδηγού ▸» | changed; the arrow must offer all / one member, print / WhatsApp |
| «Αντιγραφή πινακίδων» | yes | yes | same |
| «Groupage εξαγωγών… (πρόσθεση)» | yes | **missing** | add |
| «Σκέλος προώθησης (ρότα)…» | yes | yes | same |
| «Σπάσιμο…» | **not offered on a groupage** | offered | remove here, or owner decides |
| Local driver | per member, «Φόρτωση με τοπικό οδηγό…» | «Τοπικός οδηγός ▸» | changed; the arrow must list the members |
| «+ Κομμάτι από απόθεμα…» | yes (own truck) | yes | same |
| «Μεταφορά εβδομάδας…» | **not offered on an export** | offered | remove here, or owner decides |
| «Νέα εισαγωγή» | gap button, key N | menu item | added, fine |
| «Βγάλε από το groupage» (per member) | yes | **missing** (not in the overview either) | add to the overview rows |
| «Διάλυση groupage» | yes, red | in the overview («Διάλυση») | moved, fine |
| «Καθαρισμός ανάθεσης» | yes, red, last | yes, red, last | same |

### 5.4 Row kinds with no menu drawn in the mock-up

Single export; export with a matched import (the whole ΕΙΣΑΓΩΓΗ section, incl. «Αφαίρεση ταιριάσματος» and «Groupage εισαγωγών · σε αυτό το φορτίο…»); import-only row; split header; split leg; rota leg; local relay; pre-order; lot. The national mock-up draws three menus for its board; this one draws one.

---

## Not verified

- The app was not run: every "today" statement is from reading code, not from the screen. Exact pixel wording of some cells may differ from the strings quoted.
- Catalogue references without "V" were not re-opened (most of: banners, ghost / split / rota / relay row markup, lot and stock modals, panel bodies for groupage build, rota, split, hand-over, stock pick, the «?» sheet, the conflict dialog, print paper, CSV, full screen, loading / error cards, drag handlers).
- How today's queue card writes its load name and sub-line for each reason (the decoration code before `wi2:600`) was read only in part.
- Whether «Delivery Performance = Delayed» can be set on a load that has no truck (row 4) was not checked; I counted the «καθυστέρηση» reason because the mock-up draws the row as late.
- The section assignment of «Αντιγραφή πινακίδων» and the exact position of each item inside a section were derived from the ordering rule, not from a rendered menu.
- The assignment popover's partner fields were read as labels only; their rules (when each fee field is enabled) were not traced.
- No data was read: whether real pre-orders carry pallets or a delivery day in the table was not checked, only that the form does not write them.
- The mock-up was read as HTML and two screenshots; hover states other than those in the source (`data-t`, `title`) were not exercised.
