# Μισθοδοσία οδηγών: έλεγχος λειτουργιών της σημερινής σελίδας (15/11/2026)

**Όλα τα παρακάτω είναι ευρήματα από ανάγνωση κώδικα. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο διακομιστής που τρέχει. Τίποτα δεν διορθώθηκε.**

## Σύνοψη

Κανόνας του owner που ισχύει παντού (15/11): κάποιες κινήσεις γράφονται εκ των υστέρων, ενώ η δουλειά ήδη έγινε. Άρα μια πληρωμή μεγαλύτερη από την οφειλή, μια παλιά ημερομηνία ή μια προκαταβολή πριν από το πρώτο δρομολόγιο **δεν** είναι λάθος. Όπου λείπει έλεγχος, η σωστή απάντηση είναι προειδοποίηση, ποτέ άρνηση.

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Η ίδια πληρωμή μπορεί να γραφτεί δύο φορές**, με τρεις τρόπους:
   - Στη μαζική πληρωμή, αν μια γραμμή αποτύχει, το δεύτερο πάτημα ξαναστέλνει και όσες είχαν ήδη γραφτεί. (F8)
   - Σε κάθε καταχώρηση: αν η πληρωμή γραφτεί αλλά η οθόνη δεν προλάβει να ξαναδιαβάσει, το μήνυμα λέει «Δεν καταχωρήθηκε». Ο χρήστης την ξαναγράφει. (F9)
   - Κανένα κουμπί «Καταχώριση» δεν κλειδώνει όσο περιμένει. Δύο γρήγορα Enter = δύο πληρωμές. (F10)
2. **Το ίδιο δρομολόγιο μπορεί να μετρήσει δύο φορές.** Η γραμμή «Δρομολόγιο» στην καρτέλα γράφει διαδρομή με το χέρι και δεν δείχνει ποια δρομολόγια του οδηγού έχει ήδη ανοίξει το σύστημα. Η καρτέλα ανοίγει στον τρέχοντα μήνα, άρα η γραμμή του προηγούμενου μήνα δεν φαίνεται. (F1)
3. **Οδηγός χωρίς καμία κίνηση δεν υπάρχει πουθενά στη σελίδα.** Δεν μπορείς να του γράψεις προκαταβολή πριν από το πρώτο δρομολόγιο. Ανενεργός οδηγός με υπόλοιπο δεν έχει κάρτα· πληρώνεται μόνο από τη μαζική. (F2)
4. **Μαζική πληρωμή, τρία σημεία:** το «Ίδιο ποσό σε όλους» γεμίζει και ανενεργούς και όσους χρωστούν σε εμάς· η στήλη «Προηγ. μήνας» δείχνει την τελευταία πληρωμή οποτεδήποτε, όχι του προηγούμενου μήνα· πουθενά δεν φαίνεται ότι ένας οδηγός έχει δρομολόγια χωρίς αξία, άρα το «Όλη η οφειλή» πληρώνει λιγότερα από όσα πραγματικά χρωστάμε. (F3, F4, F16)
5. **Η οθόνη της μαζικής πληρωμής μπορεί να εμφανιστεί μόνη της πάνω σε άλλη σελίδα**, αν φύγεις πριν τελειώσει η φόρτωση των προηγούμενων πληρωμών. (F11)
6. **Ό,τι πληκτρολογείς και δεν έχεις αποθηκεύσει χάνεται** μόλις ανοίξεις ένα μενού «···», αλλάξεις μήνα ή πατήσεις «Ακύρωση» σε άλλη γραμμή. Χωρίς ερώτηση. (F12)
7. **Ακύρωση, «Σύνδεση» και «Επαναφορά» συγκρούονται.** Αν ακυρώσεις τη γραμμή ενός δρομολογίου, το δρομολόγιο μένει για πάντα στη λίστα «χωρίς γραμμή μισθοδοσίας», ακόμη κι αν το ακύρωσες επίτηδες. Αν πατήσεις «Σύνδεση», ανοίγει νέα άδεια γραμμή και η παλιά με τα ποσά δεν επαναφέρεται πια. (F5, F13)
8. **Σχεδόν κάθε άρνηση εμφανίζεται στα αγγλικά, με τεχνικές λέξεις.** (F17)
9. **Αριθμοί που δεν συμφωνούν μεταξύ τους:** οι «Πληρωμές μήνα» δεν περιέχουν τις πληρωμές σε ανενεργούς· το αρχείο Excel της αρχικής δεν έχει τους ανενεργούς ενώ το χαρτί τους έχει· ο μετρητής «N κινήσεις» της οθόνης μετρά και τις ακυρωμένες, του χαρτιού όχι· με αναζήτηση, το «N οδηγοί» δεν είναι όσες κάρτες βλέπεις. (F18, F19, F20)
10. **Η καρτέλα γράφει «τακτοποιημένο» όταν το υπόλοιπο είναι άγνωστο** (όλα τα δρομολόγια χωρίς αξία). Η κάρτα της αρχικής το λέει σωστά. (F21)
11. **Τα «χωρίς αξία» και τα «θέλει έλεγχο» δεν βρίσκονται εύκολα.** Η αρχική δεν δείχνει καθόλου πόσες γραμμές θέλουν έλεγχο. Η καρτέλα ανοίγει στον τρέχοντα μήνα, ενώ οι εκκρεμείς γραμμές είναι συνήθως παλαιότερες. (F22, F23)
12. **Η «Προσαρμογή» ζητά ποσό «±» χωρίς να λέει τι σημαίνει το συν και τι το πλην.** (F24)
13. **Δεν διορθώνεται πληρωμή.** Λάθος ποσό ή ημέρα σε πληρωμή, ή λάθος ημέρα σε δρομολόγιο: μόνο ακύρωση και ξανά από την αρχή. Η ακυρωμένη γραμμή δεν δείχνει πια τα ποσά της. (F26, F25)
14. **Χαρτί καρτέλας:** γράφει πάντα «Σελίδα 1 από 1», και τυπώνει τις ακυρωμένες γραμμές με την εσωτερική αιτιολογία στο φύλλο που υπογράφει ο οδηγός. (F27)

### (β) Τι δεν κρίθηκε από τον κώδικα

- Αν τα υπόλοιπα είναι σωστά. Το τρέχον υπόλοιπο κάθε γραμμής το υπολογίζει η βάση· εδώ ελέγχθηκε μόνο πώς το δείχνει η σελίδα.
- Πώς συμπεριφέρεται το υπόλοιπο έναρξης όταν η τελευταία κίνηση πριν από την περίοδο είναι ακυρωμένη.
- Ποιος ρόλος πρέπει να κάνει τι. Οι κανόνες ρόλων είναι του owner και δεν γράφονται εδώ.
- Οι κανόνες της βάσης για τις γραμμές τοπικού οδηγού και για τα μετρητά του δρομολογίου (διαβάστηκαν μόνο όσο φαίνονται στη σελίδα).

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Πόσο εύκολα γίνεται το διπλό Enter στην πράξη (F10).
- Αν η καρτέλα ενός οδηγού με πάνω από χίλιες κινήσεις κόβεται χωρίς να το λέει (F14).
- Αν στο χαρτί και στο Excel τα δρομολόγια του συστήματος βγαίνουν ως «Δρομολόγιο · —» (F28).
- Αν η αναζήτηση βρίσκει ονόματα γραμμένα με άλλο τονισμό ή άλλο αλφάβητο (F6).
- Αν το χαρτί φορτώνει παλιά έκδοση της σελίδας μετά από ενημέρωση (F28).

---

## Detailed findings

How the page talks to the backend: every read and write goes to `/costs/ledger*` with plain column names, **not** through the label facade. The Worker validates the body against a closed list and answers an unknown key with a 400 (`worker/src/ledger-rules.mjs:6-7, 19-20, 76`). So the facade's «unknown label = silent drop» trap does **not** apply to the money writes of this page. The facade is used only for the local-moves history (`core/relay.js:474-494`); its labels (`Date`, `Description`, `"Time From"`, `Status`, `"Move Kind"`, links `Driver`, `Truck`, `Trailer`, `"From Location"`, `"To Location"`, `"Parent Order"`) were all found in the `local_moves` map (`worker/src/index.js`, block starting ~1971; single-word and quoted forms both checked).

### Q1. What the lists, typeaheads and filters offer

**F1. Quick-entry «Δρομολόγιο» offers no list at all: free text, no view of the driver's existing trip lines.** `payroll.js:1263-1277, 1289-1304`; default period = current month `:1068-1069`.
Scenario: the system already opened a line for the driver's trip (dated at the trip's start, last month). The user opens the card on the 3rd, sees the current month only, types the route by hand with a value and saves. Two live lines now stand for one trip: the hand line adds to the balance, the system line still waits «χωρίς αξία» and will be filled later too. Nothing compares dates or routes. Under the owner's rule a hand trip must stay possible (trips entered after the fact), so the answer is a warning.
Confidence: confirmed in code (no check on either side; hand lines carry no trip link so the unique rule cannot catch them, `index.js:5179-5195`).
Redesign: the trip row starts from the driver's own trips that still have no value (pick one, type the amounts); a hand-written trip is the second choice and warns when a system line overlaps its dates.

**F2. Driver lists leave out people who need to be paid.** Home grid = active with at least one line (`payroll.js:704`); bulk = anyone with a line (`:1616-1618`); no other way to reach a card.
Scenario A: a newly hired driver gets a cash advance before the first trip. No card, no bulk row, no search hit; the advance cannot be recorded here. Scenario B: a driver who left still has a balance; the home shows one grey footer line with a count (`:757, 804`) and no way to open the card; the only place to pay is the bulk screen.
Confidence: confirmed in code.
Redesign: the driver picker lists everyone, grouped «με κίνηση / χωρίς κίνηση / ανενεργοί με υπόλοιπο»; inactive with balance are rows that open, not a count.

**F3. Bulk «Ίδιο ποσό σε όλους» fills every row, including inactive drivers and drivers whose balance is negative or zero.** `payroll.js:1715-1718` (no condition) vs «Όλη η οφειλή» `:1720-1722` (only balance > 0).
Scenario: 40 rows, the user fills the same advance for all and saves; drivers who left and drivers who owe money back also get a payment line. The «Νέα οφειλή» cell shows the negative figure in parentheses with no warning colour (`:1675-1679`).
Confidence: confirmed in code. An advance above the balance is legitimate (owner rule); the defect is that the fill is indiscriminate and unmarked.
Redesign: fill applies to the rows the user ticked (default: active with balance > 0); a row that goes negative carries a visible mark, and the footer counts them («3 πάνω από την οφειλή»).

**F4. «Προηγ. μήνας» and «Όπως τον προηγούμενο μήνα» are not about the previous month.** `payroll.js:1622-1634, 1725-1731`: the first live payment of that method in the full ledger (newest first), whatever its date. Rows with balance ≤ 0 are never looked up and show «—» exactly like «no payment ever» (`:1623, 1668`).
Scenario: a driver was last paid by bank four months ago; the column shows that amount under «Προηγ. μήνας» and the button fills it.
Confidence: confirmed in code (also in the catalogue).
Redesign: column «Τελευταία πληρωμή» with its date, or a true previous-month sum; «not looked up» is not drawn as «none».

**F5. The «χωρίς γραμμή μισθοδοσίας» list keeps offering trips whose line was cancelled on purpose.** View rule: an own trip with a driver and no live line (`worker/migrations/011_driver_ledger.sql:143-147`); list `payroll.js:818-832, 1198-1211`.
Scenario: the user cancels a trip line with a reason (the trip pays nothing). From then on the trip sits in the amber block on the home and on the card, with «Σύνδεση», forever; there is no «leave it». The home list has no sort (`index.js:5143`, no `order`), shows only driver name and start day (two trips of one driver on near days cannot be told apart; the code sits in a hover title), is capped at 500 without saying so, and names a driver missing from the balances as «οδηγός #…» (`payroll.js:821`).
Confidence: confirmed in code.
Redesign: one list «δρομολόγια που δεν πληρώνουν κανέναν» with plate, days and route; each row has «άνοιξε γραμμή» and «δεν πληρώνεται (λόγος)», and the second removes it from the list.

**F6. Home search matches the name only, by plain lower-case substring.** `payroll.js:705`. No folding of accents or of Greek/Latin spelling.
Scenario: the user types a surname without the accent, or in the other alphabet, and gets «Κανένας οδηγός · Άλλαξε αναζήτηση». The same empty text appears when there is simply nobody with a line and nothing was typed (`:763`).
Confidence: confirmed that no folding exists; whether it bites depends on how names are stored: needs a look in the live app.
Redesign: one accent-and-alphabet-blind search, as on the other pages; separate empty texts for «no match» and «no drivers yet».

**F7. Small list behaviours.** (a) Header «Δρομολόγιο» on the home opens the card of whoever is first in the current sort, with no choice of driver (`payroll.js:1021-1026`; also in the catalogue). (b) With the «Χωρίς αξία» tile on, the sort select still shows «Οφειλή φθίνουσα» but is ignored (`:706, 788-792`). (c) Month arrows go into future months without limit (`:677-681`). (d) Year chips offer three years plus «Όλα» (`:1040-1044`); fine today.
Confidence: confirmed in code.
Redesign: «Δρομολόγιο» asks which driver; one sort state, shown once.

**Found correct:** the row menu offers only what the Worker accepts for that line (local-driver lines: amounts and note; cancel only when no live move is left, `payroll.js:611-624` vs `ledger-rules.mjs:122-143`); the month select and the period slicing use one function for screen, paper and file (`payroll.js:191-229`).

### Q2. What is written wrong or lost

**F8. Bulk payment: a retry after a failure posts the already saved rows again.** `payroll.js:1736-1757`: rows are chosen by «has an amount» only; `results` is wiped at the start of each submit (`:1739`), so the ✓ marks disappear too; amounts of saved rows stay in their inputs.
Scenario: 30 payments, row 12 fails. Message: «…οι προηγούμενες πληρωμές καταχωρήθηκαν». The user fixes row 12 and presses «Καταχώριση 30 πληρωμών». Rows 1–11 are paid a second time.
Confidence: confirmed in code (also in the catalogue).
Redesign: a saved row turns into a read-only «καταχωρήθηκε» line and leaves the count; the button reads «Καταχώριση των 19 που μένουν».

**F9. «Δεν καταχωρήθηκε» can be shown for a write that succeeded.** In every save path the write and the two re-reads share one `try`: card pay `payroll.js:988-995`, payment modal `:1558-1564`, adjustment `:1591-1597`, quick trip `:1297-1303`, edit / cancel / restore `:1360-1366`, «Σύνδεση» `:840-845`. Only «Ελέγχθηκε» separates the two cases (`:1425-1461`).
Scenario: the payment is saved; the re-read of the list fails (network blink). The card form says «Δεν καταχωρήθηκε: δεν υπήρξε απάντηση…» with the amount still typed; the user presses again and the driver has two payments. In the payment and adjustment modals it is worse: the modal is closed before the re-read (`:1560, 1593`), so the error text is written into a hidden box and the card silently keeps the old balance.
Confidence: confirmed in code; how often depends on the network.
Redesign: after a write the page says exactly one of three things: saved (and shows the new line), not saved, or «στάλθηκε, δεν επιβεβαιώθηκε: ξαναφόρτωσε πριν ξαναγράψεις».

**F10. No save control locks while its request is in flight.** `payroll.js:960, 980, 1275, 1281, 1539, 1578` (plain `onclick` / Enter, no busy state; the bulk screen is the only one with `busy`, `:1687-1692`). The Worker takes each request as a new line (`index.js:5174-5198`); hand lines have no uniqueness rule.
Scenario: Enter twice on the amount, or a double click on a slow line: two identical payments (or two identical hand trips).
Confidence: confirmed that nothing prevents it; how easy it is in practice needs a look in the live app.
Redesign: the control shows «Καταχωρείται…» and ignores input until the answer; a second identical payment (same driver, day, method, amount) asks «υπάρχει ήδη ίδια πληρωμή σήμερα, να γραφτεί και δεύτερη;» (warning, not refusal).

**F11. The bulk screen repaints itself over whatever is on screen when its background reads finish.** `payroll.js:1622-1634`: one full-ledger read per driver with a positive balance, then `dlRenderBulk()` with no check that the bulk view is still open. Same pattern at the end of a bulk submit (`:1756`, `renderPayroll()` unconditionally).
Scenario: the user opens «Μαζική πληρωμή», changes mind, clicks «← Μισθοδοσία» or another page in the sidebar. A moment later the content area is replaced by the bulk payment table. If the user stayed, the same repaint lands while typing an amount and the field loses focus.
Confidence: confirmed in code (no guard); the window is the time of N parallel reads.
Redesign: late data fills its own cells only; nothing a page did not ask for may redraw it.

**F12. Unsaved typing is thrown away by unrelated clicks.** Every menu toggle, period change, cancel or review action redraws the whole card (`payroll.js:1046-1054, 1094-1099, 1492-1499, 1505-1508, 1378-1380, 1414-1418`), which rebuilds the quick-entry row empty (`:1263-1277`) and the inline-edit row from the stored values (`:550-563`). On the home, typing in the search redraws the grid and empties an open pay form (`:717-723, 950-966`).
Scenario: the user types value and advance in a row under «Διόρθωση», then opens «···» on the next row to look at something. The typed amounts are gone and the row shows the old ones, still in edit mode; pressing Enter saves nothing and closes it (`:1336`).
Confidence: confirmed in code.
Redesign: one row is in edit at a time and leaving it asks «αποθήκευση ή απόρριψη»; edit rows have visible «Αποθήκευση / Άκυρο» (today only Enter / Esc, with no hint on the row, `:551-562`).

**F13. Cancel → «Σύνδεση» → «Επαναφορά» ends in a dead end.** Cancel `payroll.js:1505-1510`; link creates a new empty line for the same trip `:838-846`; restore `:1378-1383`; the Worker refuses a second live line per trip (`index.js:5253`).
Scenario: a trip line with value and expenses is cancelled by mistake. The trip appears under «χωρίς γραμμή»; someone presses «Σύνδεση» (a new line, amounts empty). Later «Επαναφορά» on the old line answers «Δεν επαναφέρθηκε: rt_id: this round trip already has a ledger line». The written amounts stay on a cancelled row that shows only dashes (F25).
Confidence: confirmed in code.
Redesign: for a trip with a cancelled line the list offers «επαναφορά της γραμμής με τα ποσά της» first, «νέα κενή γραμμή» second.

**F14. Reads are capped without a «cut» signal.** Driver ledger `limit 2000`, month block `limit 5000`, balances `limit 300`, gap `limit 500` (`index.js:5126, 5142-5143, 5163`); none checks a row count, unlike other routes of the same Worker (`index.js:197-198`).
Scenario: if the database serves fewer rows per request than the limit asked, a long card loses its oldest lines: «από <ημέρα>» and the «Όλα» period start too late, with correct-looking totals.
Confidence: needs a look in the live app (depends on the row cap of the database API and on the longest card).
Redesign: a card that was cut says so on the opening-balance row.

**F15. Month change can show one month's label over another month's numbers.** `payroll.js:682-687`: the month is set before the read; on failure the toast appears but the label is not redrawn (state says the new month, screen the old); two quick clicks start two reads and the slower answer wins.
Confidence: confirmed in code; rare.
Redesign: the month label changes only together with its numbers.

**Found correct:** unknown keys are refused, not dropped (`ledger-rules.mjs:19-20, 76`); a changed written amount requires a reason on both sides (`payroll.js:1338-1351`, `index.js:5237`); cash-fed expenses are read-only here and the Worker refuses the same (`payroll.js:519, 556-558, 1331`; `index.js:5239-5242`); «Ελέγχθηκε» is proven by re-reading the row before and after (`payroll.js:1427-1461`); the late local-moves read paints only its own slot (`:1230-1250`).

### Q3. What the page does not tell the user

**F16. The bulk screen hides that a balance is incomplete.** Bulk rows print the balance with `dlMoney` and no «χωρίς αξία» mark (`payroll.js:1659-1672`); the home card and the hero use the «unknown» rule (`:34, 890-894`).
Scenario: a driver has three trips with no value yet and a small balance from older lines. «Όλη η οφειλή» fills the small figure; the «Νέα οφειλή» turns green «0,00 €», reading as settled.
Confidence: confirmed in code.
Redesign: the bulk row carries the same «N χωρίς αξία» badge as the card, and a settled-looking result with pending trips is not drawn green.

**F17. Refusals reach the user in English, with field names.** The Worker's ledger texts are English (`ledger-rules.mjs:18-99`; `index.js:5176-5195, 5204-5237, 5253-5254`) and the page prints them after a Greek prefix (`payroll.js:845, 994, 1303, 1366, 1564, 1597`). Examples: «Δεν αποθηκεύτηκε: trip_value must be a number ≥ 0», «Δεν ακυρώθηκε: entry is cancelled», «Δεν καταχωρήθηκε: entry_date must be YYYY-MM-DD» (the last one when the date field was cleared: `:989, 1559, 1592` send no date, which the Worker requires). Related: the local-move words name an order by its number («παράδοση 415», `payroll.js:147`; `core/relay.js:495-501`) and an unknown driver as «οδηγός #…» (`payroll.js:156, 821, 1113`), against the plain-words rule of 8/11.
Confidence: confirmed in code.
Redesign: every refusal of this page has a Greek sentence that names the driver and the line (day, route); an empty date is caught on the form.

**F18. Month tiles do not match the money that moved.** «Πληρωμές μήνα» and «Δρομολόγια μήνα» sum only active drivers with a card (`payroll.js:741-749`); a payment to an inactive driver in that month is in no tile. «Χωρίς αξία» sits among the month tiles but is all-time (`:743`, view `011_driver_ledger.sql:117`). «Ενεργοί οδηγοί» means active **with a line** (`:738-741`).
Scenario: the bank shows a higher total for the month than the tile.
Confidence: confirmed in code.
Redesign: month figures cover every payment dated in the month, with «εκ των οποίων σε ανενεργούς …»; all-time figures are labelled as such.

**F19. Counts that do not match the list under them.** (a) Footer «N οδηγοί» and the tiles ignore the search; the grid does not (`payroll.js:760` vs `:799-801`). (b) The card's «N κινήσεις» counts cancelled rows (`:1104-1109`); the paper counts live rows (`print_payroll.html`, totals row of `buildCardDoc`). (c) The note under the tiles still says the server «δεν υποστηρίζει ακόμη τον μήνα» for any missing month block (`payroll.js:795`).
Confidence: confirmed in code.
Redesign: a count is always the count of what is listed; filtered views say «12 από 49».

**F20. File and paper of the same list disagree.** Home CSV receives only active drivers (`payroll.js:773`) and then keeps those with lines (`payroll_print.js:113-115`); the printed «Κατάσταση οφειλών» keeps everyone with lines, inactive included (`print_payroll.html`, `buildDriversDoc`). The home footer sends the reader to «κατάσταση οφειλών» for the inactive ones; the file does not contain them. Column sets differ too («Τελευταία κίνηση» vs «Τελευταίο δρομολόγιο»). The code comment claims the same filter.
Confidence: confirmed in code.
Redesign: one list definition, exported two ways.

**F21. «Τακτοποιημένο» for an unknown balance.** Hero: `dlBal` prints «—» but the word comes from the plain sign rule (`payroll.js:1116, 1144`), so a driver whose every trip is valueless reads «— τακτοποιημένο»; the home card says «χωρίς αξία» (`:890-894`); the paper says «τακτοποιημένο» with 0,00 (`print_payroll.html`, `pClosingWord`). If the balances list could not be read when a card is opened directly, the hero shows «#<id>», 0,00 and «τακτοποιημένο» (`payroll.js:1072, 1113`).
Confidence: confirmed in code.
Redesign: «άγνωστο: N δρομολόγια χωρίς αξία» wherever a zero comes only from missing values; never a settled word for an unread balance.

**F22. Lines that need a check cannot be found from the home.** The balances view already returns a per-driver count (`011_driver_ledger.sql:118, 126`); the home never shows it (no use in `payroll.js:736-945`). The mark is visible only on the row, inside the period on screen.
Scenario: a database rule flags a paid line; nobody sees it until someone opens that driver and that month.
Confidence: confirmed in code.
Redesign: the home says «N γραμμές θέλουν έλεγχο» and opens them as one list.

**F23. The card opens on the current month, away from the open work.** `payroll.js:1068-1069`. The home badge says «3 χωρίς αξία»; the card opens on a month that may have none; the stat box repeats the number (`:1158`) with no jump. An existing Worker list of every valueless trip across drivers (`index.js:5098-5112`) is not used by any screen (no caller in `modules/` or `core/`).
Confidence: confirmed in code.
Redesign: arriving from a badge lands on those lines; a cross-driver «χωρίς αξία» list lets values be typed without opening each card.

**F24. «Προσαρμογή» asks for «Ποσό (±)» with no word on direction.** `payroll.js:1571-1580`; a positive amount increases what the company owes, a negative reduces it (`:119-124`).
Scenario: a deduction is typed as a positive number; the balance moves the wrong way and only the ledger row shows it.
Confidence: confirmed in code.
Redesign: two named choices («υπέρ του οδηγού» / «σε βάρος του οδηγού») and a line «νέο υπόλοιπο: …» before saving.

**F25. A cancelled row no longer shows its amounts.** `payroll.js:537-548`: every money cell is «—»; the reason is a hover title. On paper the same row prints with its reason (F27).
Confidence: confirmed in code.
Redesign: struck-through amounts stay readable; the reason is on the row.

**Not a defect under the owner's rule (say so, warn only):** payment above the balance, payment or trip dated in the past or future, advance above the trip value: none is checked (`payroll.js:983-996, 1553-1565, 1289-1304`) and none should be refused. A quiet note next to the field is enough.

### Q4. What is missing for the job

**F26. Corrections the Worker accepts but the page does not offer.** «Διόρθωση» exists only for trips and only for the three amounts (`payroll.js:620, 1323-1335`). The Worker also accepts a new day, amount or note on a payment or adjustment, and a new day, end day or route on a trip (`ledger-rules.mjs:12, 72`). Today a payment with the wrong amount or day is cancelled and typed again. Related: «Επαναφορά» is on the menu of two of the three roles that can cancel (`payroll.js:1371-1373`); who may undo is the owner's call.
Confidence: confirmed in code.
Redesign: «Διόρθωση» on every live row, for day and amount, with the reason.

**F27. Paper.** (a) «Σελίδα 1 από 1» is fixed text (`print_payroll.html`, `printedLine`); a year statement runs to several pages. (b) The statement the driver signs prints cancelled rows with the internal reason; the CSV leaves them out (`payroll_print.js:87-93`). (c) No way to print all cards of a month in one go; one window per driver (`payroll_print.js:14-18`). (d) No paper or file of a bulk payment run (who, how much, which day) for the bank; after the last row the screen just returns to the home (`payroll.js:1755-1756`), with no summary and no confirmation step before N money lines (`:1692`).
Confidence: confirmed in code.
Redesign: a bulk run ends on its own summary sheet (printable, exportable); the driver's statement shows live rows only; real page numbers.

**F28. Things to verify on the live pages.** (a) On paper and in the file a trip prints «Δρομολόγιο · » + route text or «—» (`print_payroll.html` `pKinisiBase`; `payroll_print.js:70-71`), while the screen draws system trips from their legs (`payroll.js:494-497`). If system lines carry legs and no route text, every such trip prints «Δρομολόγιο · —». (b) The print page loads the payroll script without a version mark (its own comment says so), so after a release it may run an older copy.
Confidence: needs a look in the live app.
Redesign: one line text per movement for screen, paper and file.

**F29. Smaller gaps.** The trip arrow on a row is not a link (`payroll.js:302, 503`): from a payroll line there is no way to open the trip or its expenses, even when the cash dot says «διαφέρει, έλεγξε» (`:519-522`). No filter inside a card for «μόνο χωρίς αξία / μόνο θέλει έλεγχο». Enter saves in the card pay form but not in the payment modal (`:980` vs `:1538`). No success message on any save except «Ελέγχθηκε»; the proof is the redrawn number, which F9 shows can fail silently.
Confidence: confirmed in code.
Redesign: the row opens its trip; one behaviour for Enter; every save ends with a visible result on the row it touched.

---

## What was read, and what was not

Read: `modules/payroll.js` (whole), `modules/payroll_print.js` (whole), `print_payroll.html` (script part, lines 150–355), `worker/src/ledger-rules.mjs`, `worker/src/ledger-month.mjs`, `worker/src/index.js` 5095–5266 (ledger routes) and the `local_moves` map, `modules/costs.js` 36–75 (the shared fetch), `core/relay.js` 16–46, 127–141, 474–501, `worker/migrations/011_driver_ledger.sql` 105–147 (balance and gap views), the catalogue section C §4, and `findings/weekly-international.md` as the format model.

Not read: the entries view and its running balance, the database triggers that open, cancel or flag lines (011, 037, 042, 046, 060), the Excel import route, `core/relay.js` beyond the parts above, the print page's styles, the tests. Nothing was run; no database, no network, no live page.
