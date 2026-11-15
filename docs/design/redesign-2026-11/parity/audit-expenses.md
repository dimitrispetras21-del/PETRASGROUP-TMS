# Parity audit 4 — «Έξοδα Δρομολογίων» (trip expenses)

Read-only audit, 15/11/2026. Today = code in the worktree (`modules/expenses.js` = `ex`, `modules/costs.js`, `worker/src/index.js` = `wk`, `worker/src/costs-line-rules.mjs`, `worker/migrations/042_cash_lines_to_payroll.sql`). Mock-up = `docs/design/redesign-2026-11/index.html`, blocks «screen 4: expenses», «expenses, rethought», «A4 portrait» (line numbers in that file were moving during the audit, so blocks are named, not numbered) + `shots/04-expenses.png`, `04-expenses-a4.png`.

Roles today: owner, accountant = full; management = read-only; dispatcher, warehouse = no access (`config.js:354-365`, `ex:558-559`, `wk:4446-4476`). Partner trips never appear (own fleet only, `ex:197, 607, 674`). Cancelled trips never appear (`ex:607`).

Column "In mock-up?": YES same / YES changed / NO. "Where" = placement that adds no always-visible words.

---

## A. Page header and tabs

| Today | What it does, who | `file:line` | In mock-up? | Where it should live | Risk if left out |
|---|---|---|---|---|---|
| Title «Έξοδα δρομολογίων — Εβδομάδα N» | Names the week (all roles with access) | `ex:1064` | YES changed (title + subtitle «Εβδομάδα N · dates») | — | none |
| Tabs «Εβδομάδα» / «Όχημα» | Switch view; filter and open card reset on switch | `ex:1049, 574-587` | YES same (tab offered, inside not drawn) | — | none |
| «Όχημα» tab = entry point: truck picker (active trucks, searchable), «Εύρος» 4 / 8 / 12 weeks, same trips list for that truck, «Διόδια ανά χώρα» line, no unassigned row | Per-truck history, all roles with access | `ex:1099-1109, 658-686, 1238-1244` | YES (entry only) | To draw next: picker + range in the place of the week strip | slower (per-truck control lost) if never drawn |
| «Εισαγωγή DKV» button | Opens import page in place; owner + accountant only (hidden for management, second check in handler) | `ex:1081`, `expenses_import.js:210-218` | YES same | Hide for read-only role | none |
| «Εκτύπωση» | Does not exist today | — | NEW in mock-up | see §2 | — |
| Access denied block | dispatcher / warehouse on direct URL | `ex:558` | NO (not a design item) | keep | none |

## B. Week strip and counters

| Today | What it does, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| 5 chips (2 back, 2 forward) «Εβδ. N · dd–dd/mm · count» | Jump to week; count = number of own-fleet trips starting in that week | `ex:99, 1118-1137` | YES changed: number only + small red counter; dates only for the selected week (subtitle) | Dates of other weeks in hover of the chip | slower (week numbers alone are not how people name weeks) |
| Selected chip adds «n ελλείψεις» (amber) | Gaps of the selected week only; other weeks never show gaps (their lines are not loaded) | `ex:1127-1133` | YES changed: red counter on every week | see §2 (NEW: needs data) | — |
| Arrows ‹ › | ±1 week | `ex:1136, 627` | YES same | — | none |
| Future weeks styled paler | Hint only | `ex:1125, 1134` | NO | chip state (paler) | none |
| Week = Saturday → Friday, trip belongs to the week of its start date | `ctWeekOf(date_start)` | `costs.js:111-126`, `ex:608` | YES (dates shown agree with Sat–Fri) | — | wrong money if the new screen uses another week rule |

## C. Summary / totals

| Today | What it does | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Δρομολόγια n» | Trip count of the week | `ex:1154` | YES changed (count per group; total only on paper) | fine | none |
| «Σύνολο εξόδων» | Σ all lines of the week's trips + Σ «Μετρητά Μ» + Σ unassigned lines dated in the week | `ex:771-799` | YES changed: mock-up says unassigned lines do NOT count | see §3 | wrong money (two totals for one week) |
| «Λίτρα» | Σ litres of «Καύσιμα» group (truck + reefer diesel, not AdBlue), incl. unassigned in-week | `ex:788-789, 1156` | YES same («8.815 L» beside Καύσιμα) | — | none |
| Totals row per category (9 columns) + grand total + «(n δρομολόγια, n γραμμές)» | Column totals follow search / filter; grand total never does | `ex:1195-1213` | YES changed: bar Καύσιμα / Διόδια / «Υπόλοιπα ⌄»; nine totals only on paper | The «⌄» must open the other seven totals (state not drawn) | slower |
| «Σ n L» under fuel total; «αναμ. x» under «Λοιπά» total | Litres and restated part of the week | `ex:1202-1210` | litres YES; «αναμ.» NO | inside the «Υπόλοιπα ⌄» list, as a sub-line of «Λοιπά» | wrong money for the accountant (restated expenses are a tax figure) |
| Per trip: «Πληρωμή: DKV x · Revolut y · Μετρητά z · Πίστωση w» | Sum by payment method, zero ones omitted | `ex:1463-1468, 1506` | YES changed: one pill per category row («DKV», «DKV + χέρι», «μετρητά», «πίστωση») | Card footer: hover on the trip total shows the four sums | slower; and «χέρι» is not a payment method (§3) |
| Per trip: «Διόδια ανά χώρα: flag amount · …» | Tolls by country, descending | `ex:1229-1234, 1507` | YES changed («5 χώρες», expanded state not drawn) | Opening «Διόδια» = one line per country, then its lines | slower |
| Per trip: «Σύνολο λίτρων» | Litres of the trip | `ex:1505` | YES same («1.300 L · 3 γεμίσματα») | — | none |
| Week by payment method / by country | Does not exist today (only per trip; by country also on «Όχημα») | — | not shown either | — | none |
| Footer legend «Ποσά σε €… Κενό κελί = … «—» = …» and key hints | Explains cells and keys | `ex:1215` | NO (sheet is gone; correct to drop) | key hints: hover on «+» | none |

## D. Status groups — exact rule today

| Today | Rule | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Σε εξέλιξη» | trip status is not `closed` / `complete` | `ex:750, 763` | YES same (group) | — | none |
| «Ελλείψεις» (chip «Με ελλείψεις») | trip is closed AND has no line in «Καύσιμα» (fuel or reefer fuel) OR no line in «Διόδια». Nothing else is ever "missing" | `ex:92, 757-765` | YES changed: «Θέλουν ματιά», reason in the sign | — | none for these two reasons |
| «Πλήρες» | closed and has ≥1 fuel line and ≥1 toll line | `ex:764` | YES same («Πλήρη») | — | none |
| «Χωρίς δρομολόγιο» chip | count of unassigned in-week lines, DKV fee lines excluded | `ex:782, 796, 1162` | YES changed (own group at the bottom) | — | none |
| Chips are filters, one at a time; counts never change with the filter | | `ex:816-833` | YES changed (groups replace filters) | — | none |
| Status source | Status comes from the database (derived from the legs); the screen never closes a trip | `core/rt-feed.js:8-11` | n/a | — | none |
| Trips of the new national board (model 2) | Their status never becomes `closed`; the server sends a separate `ended` flag that this screen does not read → today they stay «Σε εξέλιξη» for ever and never show gaps | `wk:4776-4793`; no reader in `ex` | not addressed | New screen should use `ended` for these trips (owner decision) | wrong money (finished trips never flagged) |
| Open-trip card text «RT κλειστό» / «RT σε εξέλιξη», «λείπουν: …» | Says the same in the card | `ex:1483` | YES changed (group + sign) | — | none |

## E. Trip row

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Truck plate over trailer plate («—» if none) | click opens card | `ex:1332` | YES same | — | none |
| Driver | click opens card | `ex:1333` | YES same | — | none |
| Dates dd–dd/mm | | `ex:1339` | YES same | — | none |
| Route «Πόλη, CC flag → …», «/» between orders; flags only for foreign stops | click expands | `ex:909-916, 1340` | YES changed: city names only, no country code, no flag | Card header may carry codes; row stays short | none |
| Chevron: full leg block (stop names, countries, dates) under the row | `rtLegBlockHtml` | `ex:1319-1344` | NO | Card header: click on the route line opens the legs | slower (accountant checks which stop a receipt belongs to) |
| Nine amount cells with sub-label (litres, «n γρ.», payment mark when all lines agree, «x αναμ.») | click opens card on that category | `ex:1254-1288` | NO by design | Card sections | none (owner decision) |
| «—» in a missing fuel / toll cell of a closed trip | | `ex:1282-1286` | YES changed (sign + hover text; «λείπουν» box on paper) | — | none |
| «Μετρητά Μ» cell | driver cash from payroll | `ex:1293-1302` | YES changed (card row «Μετρητά») | — | see §3 |
| Row total (blank when the trip has nothing) | lines + «Μετρητά Μ» | `ex:870, 1342` | YES same («–» when nothing) | — | none |
| Status word + «+» | «+» opens the card and focuses the category | `ex:1343, 1353-1358` | YES changed (row click opens card; entry always at card bottom) | — | none |
| Other rows fade while a card is open | | `ex:1218` | YES changed (side card, selected row tinted) | — | none |
| Sort: start date, then id | | `ex:609` | YES changed (three groups) | §2 | — |

## F. Open trip: header, lines, fields

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Card title «plate / trailer · driver · dates», route, total, «+ Έξοδο», «Επόμενο δρομολόγιο ↓», «Κλείσιμο ▲» | all roles (write buttons only for full) | `ex:1470-1516` | YES changed («Επόμενο ↓», ×; entry row always visible) | — | none |
| «εκ των οποίων αναμόρφωση x» under the trip total | restated part | `ex:1512` | NO | hover on the trip total, or sub-line of «Λοιπά» | wrong money for tax reporting |
| Note «κατάσταση DKV …: n γραμμές σβησμένες μετά την καταχώρηση» | a statement that lost lines after import touches this trip | `ex:1478-1483` | NO | amber sign beside the «DKV» pill of the card, text on hover (statement named by its period, not a bare number) | wrong money (statement no longer agrees and nobody sees it) |
| Section per category that has lines: «label · n γραμμές · amount»; «Πρόστιμα … · μπαίνει στο σύνολο» | empty categories not listed | `ex:1487-1498` | YES changed (one row per category, collapsible) | — | none |
| Line columns: «Ημερομηνία», «Κατηγορία», «Πληρωμή», «Παραστατικό / σημείωση», «Λίτρα», «Χώρα», «Ποσό €», «Ποιος», actions | | `ex:863-865, 2030-2040` | YES changed: «date · country · litres · amount» only | below | below |
| — «Πληρωμή» per line (mark for DKV / Revolut, word for Μετρητά / Πίστωση; «—» if unknown) | | `ex:1003, 2006` | NO per line (pill per category) | line: small mark at the right of the date when it differs from the category pill | wrong money when one category mixes methods |
| — «Παραστατικό / σημείωση» | receipt number / note | `ex:2034` | NO | second faint line of the sub-row when present; full on hover | data lost |
| — «Ποιος» (who entered, first name) | from `created_by` | `ex:204-208, 2038` | NO | hover on the line | none (audit trail still holds it) |
| — Second line under the category: «Προμηθευτής» (fuel seller), «Χλμ», «Πρατήριο», «Ρυμούλκα» | fuel family only | `ex:2009-2014` | NO | line expands on click (same place as edit) | slower (fuel control: litres vs km per fill) |
| — Sub-category inside a group (truck fuel vs reefer fuel; «Διαμονή», «Κόμιστρο συνεργάτη», «Αναμόρφωση» inside «Λοιπά») | label per line | `ex:2032` | NO | first word of the sub-row when it is not the group's main category | wrong money (reefer fuel is charged to the trailer) |
| — Imported (DKV statement) mark on the category | `ex-cat dkv` style | `ex:2032` | YES changed (pill «DKV» at category level) | lock icon on the sub-row | slower |
| Category switch keeps typed values; payment follows the kind of receipt | | `ex:1842-1865` | not drawn | behaviour | slower |

### Fields of a new line (today's entry row «Νέο έξοδο»)

| Field | Rule today | `file:line` | In mock-up entry? | Where | Risk |
|---|---|---|---|---|---|
| «Κατηγορία» | 12 choices (see §4) | `ex:30, 1803-1811` | YES (select; list not drawn) | — | wrong money if the list is cut to nine |
| «Πληρωμή» | required; DKV / Μετρητά / Revolut / ΠΙΣΤΩΣΗ (list from the server); default DKV for fuel and tolls, Μετρητά for the rest; last used value remembered per bucket for the session | `ex:59-67, 745-748, 1760-1770`, `wk:4899` | YES | — | none |
| Hint under «Πληρωμή» when DKV: «Οι πληρωμές DKV έρχονται από την κατάσταση DKV — …» | warns; server refuses only if the statement already has the same fill | `ex:1774-1780`, `wk:4878-4892` | NO | amber sign in the payment select when DKV, text on hover | wrong money (double entry) |
| «Προμηθευτής» (fuel + reefer fuel only) | DKV / DADI / Nikolai / Revoil Petras / Τρίτος; default DKV | `ex:45-48, 1750-1753` | NO | appears in the entry block only for fuel categories | data lost (own-station vs card fuel) |
| «Ημερομηνία» | required; default = trip start date (today for unassigned) | `ex:1789, 1814, 1892` | YES | — | none |
| «Χώρα» | tolls: required, picked from a search list (ISO code stored, never typed); fuel / reefer / AdBlue: optional | `ex:1636-1708, 1920-1931`, `costs-line-rules.mjs` | YES for tolls (shown as a typed «AT»); fuel not drawn | must be a pick list with search | wrong money (tolls by country) |
| «Ποσό €» | required; one gross figure (stored as net, VAT 0) | `ex:1893-1897` | YES | — | none |
| «Παραστατικό / σημείωση» | optional | `ex:1817` | NO | second row of the entry block, placeholder only | data lost |
| «Λίτρα», «Χιλιόμετρα», «Πρατήριο» (fuel, reefer fuel, AdBlue) | optional; km whole number | `ex:1822-1827, 1901-1906` | NO | extra row appears only for these categories | data lost (litres feed the week litres and per-truck control) |
| «Ρυμούλκα» (reefer fuel only) | shows «plate · από το δρομολόγιο · αλλαγή»; if the trip has no trailer, a required select with «Το δρομολόγιο δεν έχει ρυμούλκα — επίλεξε» | `ex:1714-1746, 1910-1919`, `wk:4917-4925` | NO | same extra row; red sign when the trip has no trailer | wrong money (reefer cost on no trailer) |
| Buttons «Καταχώρηση» / «+ Ίδια κατηγορία» / «Άκυρο»; Enter = «+ Ίδια κατηγορία», Esc = «Άκυρο» | Enter keeps category, date, payment, supplier; clears amount, note, litres, km, station. «Καταχώρηση» returns the row to the category it opened on. Esc resets, card stays | `ex:1829-1832, 1868-1883, 1942-1978` | YES changed (single «+») | «+» / Enter = today's Enter; no second button needed | slower if Enter stops keeping the four values |
| «σε παράθυρο» | same form as a dialog (also used by TRIP PnL) | `ex:1832, 2279-2391` | NO | drop on this screen; keep for TRIP PnL | none |
| Success | silent re-read from server, focus back on amount | `ex:1974-1976, 2211-2215` | n/a | brief flash of the new line | none |

## G. Edit, delete, locks

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Διόρθωση» | owner, accountant on every line; opens the same fields in place; «Αποθήκευση» / «Άκυρο» | `ex:1991, 2043-2085` | YES (pencil on hover) | — | none |
| Reason on every correction | native prompt «Αιτιολογία διόρθωσης (υποχρεωτική)»; server refuses without it; stored in the audit trail | `ex:2142`, `wk:4999-5001` | NO | one reason field inside the edit state of the line, required | data lost (audit reason) — server would refuse the save |
| «Διαγραφή» | confirm «Διαγραφή γραμμής εξόδου; Δεν αναιρείται.» + mandatory reason; permanent | `ex:2188-2196`, `wk:5062-5093` | YES (bin on hover), reason NO | bin → small confirm with the reason field | same |
| Imported line (from a DKV statement) | Only category, country, note and trip can change; amount, litres, date, payment, km, station greyed with «Από κατάσταση DKV — αλλάζει μόνο …»; server enforces | `ex:2058-2063, 2152-2164`, `wk:5010-5013` | NO | lock icon on the sub-row; edit opens only the three free fields | wrong money (statement broken silently if not enforced in the design) |
| Deleting an imported line | allowed with reason; the statement's «σβήστηκαν» counter goes up and shows in the import list and in the card | `wk:5075-5090`, `ex:723, 1480-1482` | NO | see F (amber sign) | wrong money |
| Restatement («Αναμόρφωση») | a category inside «Λοιπά»; counts in totals; shown as «αναμ.» sub-total in cell, week total and card | `ex:28-30, 1207-1210, 1274-1278, 1512` | NO | sub-line under «Λοιπά» wherever «Λοιπά» is shown; in the nine totals on paper | wrong money for tax |
| Move a line to another trip / back to unassigned | Not possible from this screen (only unassigned lines get the trip select); the server would accept it | `ex:2021-2026`, `wk:5046` | NO | «···» on the line: «Άλλο δρομολόγιο» (owner decides; NEW) | slower today (delete + retype) |

## H. «Μετρητά Μ» and payroll

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Μετρητά Μ» = the «Έξοδα» figure of the trip's payroll line (one place for the same money) | read from the trip record | `wk:4796-4825`, `ex:1293-1302` | YES changed (row «Μετρητά», pill «μετρητά») | — | — |
| Trip has cash lines → field is read-only: «Από n γραμμές μετρητών του δρομολογίου (x) — διόρθωση μόνο μέσω των γραμμών»; flag «≠ ποσό Μισθοδοσίας» if payroll differs | database sets payroll = Σ cash lines and refuses a typed value | `ex:1567-1584`, `042_cash_lines_to_payroll.sql`, `wk:4325-4335, 5259` | NO | «Μετρητά» row: lock icon, hover text; red sign when it differs from payroll | wrong money (driver balance) |
| Trip has no cash lines → one field «Ποσό €», Enter saves to payroll; reason prompt when an existing value changes; Esc restores | owner, accountant | `ex:1585-1627` | NO | click on the «Μετρητά» amount edits in place | data lost (no way to enter driver cash without a receipt line) |
| «Το δρομολόγιο δεν έχει εγγραφή Μισθοδοσίας.» | nothing to write to | `ex:1577` | NO | «Μετρητά» row greyed, hover text | slower |
| After save the whole week reloads | | `ex:1631-1634` | n/a | — | none |

## I. Unassigned lines («Χωρίς δρομολόγιο») and their assignment

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Row «Χωρίς δρομολόγιο · n προς ανάθεση», amount per category, total, «Ανάθεση» | lines with no trip, dated inside the selected week | `ex:751, 1367-1393` | YES changed («n γραμμές DKV», dates, «Ταίριασμα», amount) | — | see §3 (not only DKV) |
| Card-fee lines without a trip: quiet line «Τέλη DKV χωρίς δρομολόγιο: n γραμμές, x €», not counted as pending, not clickable | general card fees have no trip by nature | `ex:778-783, 1378-1380` | NO | second faint line in the «Χωρίς δρομολόγιο» group, no action | wrong count (work nobody can do shown as pending) |
| Lines dated outside the selected week, or with no date | computed, never shown; no backlog view | `ex:751, 796` | NO | «Ταίριασμα» screen should list all waiting lines, selected week first | wrong money (charges never assigned) |
| Fetch of unassigned lines | one request, first 300 only, no paging loop | `ex:621`, `wk:4975` | n/a | new screen must page | data lost from view past 300 |
| Click a category cell → panel: lines of that category + entry row limited to that category group | owner, accountant | `ex:1417-1426, 1520-1533` | NO («Ταίριασμα» not drawn) | below | — |
| Per line: select «Ανάθεση σε δρομολόγιο…» listing only the selected week's trips as «plate · dates» → prompt «Αιτιολογία ανάθεσης (υποχρεωτική)» → saved | reason mandatory (server) | `ex:2021-2026, 2198-2206`, `wk:4999-5059` | NO | below | — |
| New line without a trip can be typed here (any payment method) | | `ex:1417-1423, 1531` | NO | «+» in the «Χωρίς δρομολόγιο» group | slower |

**What the «Ταίριασμα» screen must carry (to draw next):**
1. List of waiting lines: date, category, amount, litres, country, station, payment, note, who / which statement; and the **truck plate of the charge** (stored on the line as read from the statement; today's panel does not show it, so the user assigns blind).
2. Card-fee lines kept apart, no action asked.
3. For each line a trip picker that names trips as «plate · driver · dates» (not only the selected week: at least the trips whose dates cover the line date; the import page already offers statement period ±7 days, `expenses_import.js:478-515`).
4. A mandatory reason (one field; allow one reason for several lines picked together — today one prompt per line).
5. On assigning a reefer-fuel line the trailer is taken from the trip automatically (`wk:5034-5042`).
6. Edit / delete of a waiting line with the same rules as section G (imported lines locked).
7. Read-only role sees the list without pickers.
8. After each save: re-read from the server; the week total rule must be decided first (§3).

## J. Import entry and import history

| Today | What, who | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| «Εισαγωγή DKV» → import page replaces the content, «← Έξοδα Δρομολογίων» back | owner, accountant | `expenses_import.js:210-231` | YES (button) | — | none |
| Card «Εισαγωγές DKV» under the sheet: per statement «number or file · period · n γραμμές · επιστροφή ΦΠΑ x · status (πρόχειρο …) · who date» + «ZIP» link | all roles with access (management reads) | `ex:688-734`, `wk:4460-4474` | NO | «···» beside «Εισαγωγή DKV»: «Ιστορικό εισαγωγών» (panel) | data lost from view (which statements are in, the ZIP, VAT refund receivable) |
| «n γραμμές σβήστηκαν μετά την καταχώρηση — δεν συμφωνεί πλέον 1:1 με την κατάσταση» | on the statement row | `ex:720-723` | NO | red sign on that row of the history panel, and on «Εισαγωγή DKV» when any statement has it | wrong money |
| «Δεν φορτώθηκαν: …» / «Καμία εισαγωγή DKV ακόμη.» | states | `ex:702-705` | NO | inside the panel | none |

## K. Export / print, search, read-only, errors

| Today | What | `file:line` | In mock-up? | Where | Risk |
|---|---|---|---|---|---|
| Print / export | None on this screen today | — | NEW («Εκτύπωση», A4) | §2 | — |
| Search box «Πινακίδα, οδηγός, πελάτης» | Filters trips by plate, driver, route text, stop names and cities (client name is not searched despite the placeholder) | `ex:801-807, 1151, 1164` | YES («Αναζήτηση») | — | none |
| «Κανένα δρομολόγιο για αυτή την αναζήτηση.» / «… σε αυτή την εβδομάδα.» | empty states | `ex:1184-1188` | NO | one line in the list | none |
| Read-only (management) | No entry row, no «+», no edit / delete, no «Εισαγωγή DKV», no «Μετρητά» field; card opens from plate / driver | `ex:559, 1081, 1256-1258, 1343, 1514, 1991` | NO (state not drawn) | same card without the entry block and hover icons | none if hidden; a 403 otherwise |
| Loading «Φόρτωση εξόδων…» / «Φόρτωση εβδομάδας…» | | `ex:564, 1090` | NO | skeleton rows | none |
| Load error «Τα έξοδα δεν φορτώθηκαν: …» (header and strip stay) | | `ex:1091` | NO | same, in the list area | wrong money if a failed load looks like an empty week |
| «Η καταχώρηση έγινε, αλλά τα σύνολα δεν ανανεώθηκαν: …» | save done, refresh failed | `ex:2213, 1633` | NO | toast | wrong money read off stale totals |
| Validation: «Χρειάζεται ημερομηνία / ποσό / πηγή πληρωμής / τρόπος πληρωμής / χώρα διοδίων / ρυμούλκα.» | before sending | `ex:1892-1921, 1951, 2128-2141` | NO | red outline on the field + sign with hover | slower |
| Server refusals shown as toast: duplicate of an imported DKV line; locked fields of an imported line; cash rule; unknown trailer; partner-rate rule; «Δεν έχεις δικαίωμα για αυτή την ενέργεια» | | `wk:4892, 5012, 5259, 4919`; `ex:210-213` | NO | toast in plain words (one imported-line message is English today) | slower |
| Session ended / no network wording | shared fetch helper | `costs.js:36-60` | n/a | keep | none |
| Reasons and confirms are native browser prompts | | `ex:1619, 2142, 2189-2190, 2200` | NO | inline reason field (sections G, H, I) | — |

---

## 1. Forgotten, must add (most important first)

1. **Mandatory reason** on every correction, deletion, assignment and change of driver cash — the server refuses without it; the card has no place for it.
2. **Locked imported lines**: only category, country, note, trip may change; needs a lock mark and a reduced edit state.
3. **Extra fields per category in the entry block**: litres, km, station, fuel seller (fuel / reefer / AdBlue), trailer (reefer), country as a pick list (required for tolls), receipt / note for every category.
4. **Full category list in the select** (12, not 9): truck fuel vs reefer fuel, «Διαμονή», «Κόμιστρο συνεργάτη», «Αναμόρφωση» (see §4), and the sub-category visible on each line.
5. **«Μετρητά» behaviour**: read-only with lock when the trip has cash lines, editable otherwise, "differs from payroll" sign, "no payroll line" state.
6. **Restatement («Αναμόρφωση») sub-total** in «Λοιπά» (trip, week, paper).
7. **Import history** («Εισαγωγές DKV»: statements, ZIP, VAT refund, "lines deleted after import" warning) — also the warning inside the trip card.
8. **Card-fee lines without a trip** kept apart from the lines that wait for assignment.
9. **Payment method per line** and the per-trip sums by method (the category pill cannot show a mixed category).
10. **Who entered a line** and the **leg details of the trip** (hover / expand).
11. **Read-only role state**, loading, load-error and "saved but totals not refreshed" states.
12. **DKV hint / duplicate refusal** when a manual line is entered as paid by DKV.
13. Dates on the other week chips (hover) and the «Υπόλοιπα ⌄» expanded state with the seven totals.

## 2. Shown in the mock-up but not true today (NEW — owner decides)

1. **«Ίσως διπλό» check on a trip** (manual + DKV same amount): today the duplicate check runs only when saving a manual DKV-paid line and inside the import; the week screen never flags an existing pair.
2. **A trip joins «Θέλουν ματιά» for a duplicate**: today's only reasons are "closed and no fuel" / "closed and no tolls".
3. **Three groups in the order needs-look → in progress → complete**: today one list by start date, with filter chips.
4. **Red counter on every week tab**: today only the trip count per week, and gaps only for the selected week (other weeks' lines are not loaded; needs a server count).
5. **«Επόμενο» = next trip that needs a look**: today it is simply the next row of the visible list.
6. **«Εκτύπωση» and the A4 page** (incl. footnotes, user and time stamp): no print or export exists on this screen today.
7. **«Ταίριασμα» as one action for all waiting lines**: today assignment is per line, per category panel, selected-week trips only.
8. **Bar Καύσιμα / Διόδια / Υπόλοιπα** and «n γεμίσματα», «n χώρες» counts: new presentation of existing numbers (no new data).
9. **Pill «DKV + χέρι»**: "by hand" as an origin label does not exist today (a mixed category shows no mark).
10. **Reason text «Τελείωσε και δεν έχει κανένα έξοδο»**: new wording; today it would read as missing fuel and tolls.
11. **«δεν μετρούν στο σύνολο» for unassigned lines**: opposite of today (§3).
12. **«προσωρινό»**: the word appears neither in the mock-up nor in today's screen; the nearest thing today is the import status «πρόχειρο» (a statement read but not yet saved).

## 3. Wrong or doubtful business content in the mock-up

1. **Week total vs unassigned lines.** Paper says the unassigned lines «δεν μετρούν στο σύνολο». Today «Σύνολο εξόδων», the line count and the litres all INCLUDE unassigned lines dated in the week (`ex:789-793`). One rule must be chosen; the owner decides.
2. **«n γραμμές DKV» for the unassigned group.** Unassigned lines are not only card lines: a manual line of any payment method can be entered without a trip. And the general card-fee lines are today deliberately NOT part of the "to assign" count.
3. **«Μετρητά» as a ninth category added to the trip total.** Today «Μετρητά Μ» is the payroll figure, not an expense category. Since migration 042 that figure equals the sum of the trip's cash-paid lines whenever such lines exist — and those lines already sit in their own categories. By code, today's trip total = all lines + «Μετρητά Μ» (`ex:870`), so cash lines are counted twice in the trip and week totals. The mock-up repeats this (entry block shows «Διόδια» paid «Μετρητά» while «Μετρητά» is its own row in the sum). Verify on real data, then decide: either «Μετρητά» is shown as information ("of which cash") or it is added only when the trip has no cash lines.
4. **Category names.** Mock-up «Καράβια» = today column «Καράβια/Τρένα» (select label «Ferry/Τρένα»). Mock-up «Μετρητά» = today «Μετρητά Μ». Mock-up «Τέλη DKV» = column name today; the select calls the same category «DKV κάρτα». Today already has two names for two categories; the redesign should settle one each.
5. **Nine categories.** Nine is the number of sheet columns, not of categories: the select has 12 (two fuels in «Καύσιμα»; «Διαμονή», «Κόμιστρο συνεργάτη», «Αναμόρφωση» inside «Λοιπά»).
6. **Pill «DKV + χέρι» / «πίστωση» on a category.** Payment method (DKV, Μετρητά, Revolut, Πίστωση) and origin (statement vs typed) are two different facts; «χέρι» is not a payment method. A category with mixed methods needs the per-line mark.
7. **Country typed as «AT».** Today the country is picked from a list and stored as a code; never typed.
8. **Status of finished trips of the new national board** would never reach «Θέλουν ματιά» with today's rule (§D); the mock-up's texts «Τελείωσε και …» assume every finished trip is known as finished.
9. **Sums.** All mock-up sums agree with each other (row totals, three-part bar, nine category totals, litres). No arithmetic error found; the only issue is what is included (points 1 and 3).
10. **Week chips without dates**: weeks are Saturday → Friday; the subtitle dates in the mock-up agree with that rule.

## 4. Expense categories today (exact)

Order of the entry select (`ex:30`); labels from `costs.js:9-21`; sheet column from `ex:77-91`. Every line also needs: «Ημερομηνία» (required), «Ποσό €» (required, one gross figure), «Πληρωμή» (required: DKV / Μετρητά / Revolut / ΠΙΣΤΩΣΗ), «Παραστατικό / σημείωση» (optional).

| Code | Label in select | Sheet column | Extra fields | Default payment |
|---|---|---|---|---|
| `fuel` | «Καύσιμα φορτηγού» | «Καύσιμα» | «Προμηθευτής» (DKV, DADI, Nikolai, Revoil Petras, Τρίτος); «Λίτρα», «Χιλιόμετρα», «Πρατήριο», «Χώρα» — all optional | DKV |
| `reefer_fuel` | «Καύσιμα θαλάμου» | «Καύσιμα» | as fuel + «Ρυμούλκα» (from the trip; required pick when the trip has none or on «αλλαγή») | DKV |
| `tolls` | «Διόδια» | «Διόδια» | «Χώρα» required (pick list, ISO code) | DKV |
| `dkv` | «DKV κάρτα» | «Τέλη DKV» | none | Μετρητά (bucket default; normally arrives by import) |
| `adblue` | «AdBlue» | «AdBlue» | «Λίτρα», «Χιλιόμετρα», «Πρατήριο», «Χώρα» optional; no «Προμηθευτής» on screen | Μετρητά |
| `spedition` | «Spedition» | «Spedition» | none | Μετρητά |
| `accommodation` | «Διαμονή» | «Λοιπά» | none | Μετρητά |
| `ferry_train` | «Ferry/Τρένα» | «Καράβια/Τρένα» | none | Μετρητά |
| `fines` | «Πρόστιμα» | «Πρόστιμα» | none (counts in the total) | Μετρητά |
| `partner_rate` | «Κόμιστρο συνεργάτη» | «Λοιπά» | none on screen; server checks it against the trip's partner (`wk` `ctPartnerLineCheck`) | Μετρητά |
| `other` | «Λοιπά» | «Λοιπά» | none | Μετρητά |
| `restatement` | «Αναμόρφωση» | «Λοιπά» (own sub-total «αναμ.») | none | Μετρητά |

Not offered on screen: `fixed_alloc` «Πάγια (Tier-2)» (server accepts, nothing writes it). Removed for good: driver pay and driver cash as categories (they live in payroll). «Μετρητά Μ» is a sheet column fed by payroll, not a category. The payment default is "last value used in this session" per bucket (fuel + tolls / everything else), seeded DKV and Μετρητά (`ex:745-748`).
