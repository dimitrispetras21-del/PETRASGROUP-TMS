# Παραγγελίες: «Προς τιμολόγηση», «Εβδομάδα», «Χωρίς τιμή» — έλεγχος της σημερινής σελίδας από τον κώδικα (15/11/2026)

Ανεξάρτητος έλεγχος, μόνο με ανάγνωση κώδικα. **Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο Worker που τρέχει.** Τίποτα δεν διορθώθηκε. Κάθε εύρημα έχει βαθμό βεβαιότητας.

## Σύνοψη

Κανόνας του owner που ισχύει παντού (15/11): κάποιες κινήσεις είναι διορθωτικές και γράφονται εκ των υστέρων. Άρα όπου γράφει «λείπει έλεγχος», η σωστή απάντηση είναι **προειδοποίηση, ποτέ άρνηση**.

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Δύο άνθρωποι στην ίδια παραγγελία: κερδίζει ο τελευταίος, χωρίς λέξη.** Οι τρεις όψεις δουλεύουν πάνω σε μια «φωτογραφία» της λίστας. Αν κάποιος άλλος γράψει ΤΠΥ ή τιμή στο μεταξύ, η οθόνη δεν το μαθαίνει. Ο δεύτερος ΤΠΥ σβήνει τον πρώτο. Μια τιμή από την ανοιχτή από το πρωί λίστα «Χωρίς τιμή» γράφεται πάνω στην τιμή που μπήκε στις 10:00, ακόμη κι αν η παραγγελία έχει ήδη τιμολογηθεί, και χωρίς την ερώτηση «αλλαγή τιμής τιμολογημένης;». (F7)
2. **Τιμολογημένη παραγγελία της επόμενης εβδομάδας δεν ξαναβρίσκεται στο «Προς τιμολόγηση».** Η λωρίδα εβδομάδων σταματά στην τρέχουσα. Το «Όλες οι ανοιχτές» δεν δείχνει τιμολογημένες. Η αναζήτηση ψάχνει μόνο στην εβδομάδα και στην καρτέλα που είναι ανοιχτή. Αφού τιμολογούμε από την καταχώρηση, μια εξαγωγή που παραδίδει την άλλη εβδομάδα χάνεται από εκεί μόλις πάρει ΤΠΥ. Το ίδιο και μια παραγγελία χωρίς ημερομηνία. Διόρθωση ΤΠΥ γίνεται μόνο από την «Εβδομάδα» ή στα 10 δευτερόλεπτα της «Αναίρεσης». (F1, F2)
3. **Η «Διόρθωση» της κάρτας λέει «Η παραγγελία αποθηκεύτηκε» χωρίς απόδειξη.** Δεν κοιτά τι γύρισε πίσω. Χωρίς σύνδεση λέει το ίδιο, ενώ η αλλαγή απλώς περιμένει στην ουρά. Δέχεται τιμή 0 και σβήσιμο τιμής, με το ίδιο πράσινο μήνυμα. (F8, F9)
4. **Τρεις διαφορετικοί αριθμοί για το «πόσα έχω να κόψω».** Ο αριθμός στην καρτέλα μετρά όλες τις εβδομάδες. Το «Προς κοπή» μέσα μετρά μία εβδομάδα. Το «Όλες οι ανοιχτές» μετρά και όσες δεν έχουν τιμή. Κανένας δεν συμφωνεί με τη λίστα που βλέπει από κάτω. (F14)
5. **Οι «ημέρες αναμονής» ξεκινούν μόνο αν κάποιος πατήσει «παραδόθηκε» στο Ημερήσιο.** Διεθνής παραγγελία που παραδόθηκε πριν τρεις εβδομάδες αλλά δεν σημειώθηκε, δείχνει «—», δεν κοκκινίζει, δεν μετρά στην «Παλαιότερη εκκρεμή» και δεν ελέγχεται για δελτίο παλετών. (F16)
6. **Στην «Εβδομάδα», μια ημέρα γράφει «καμία κίνηση» ενώ οι παραγγελίες της είναι στο κάτω μέρος, στο «ΧΩΡΙΣ RT».** (F17)
7. **Το CSV της «Εβδομάδας» βγαίνει και όταν κάτι δεν διαβάστηκε**, χωρίς λέξη (η εκτύπωση αρνείται σωστά). Γράφει «Προς ανάθεση» σε εθνικές που έχουν φορτηγό. Δεν έχει ημερομηνία ΤΠΥ. (F18)
8. **Λάθος ή παλιά λόγια.** «Καμία ανοιχτή παραγγελία — όλες οι παραδομένες έχουν τιμολογηθεί» εμφανίζεται σε άδεια καρτέλα ενώ η διπλανή έχει δουλειά. Τέσσερα κείμενα μιλούν ακόμη για «παραδομένες», ενώ τιμολογούμε από την καταχώρηση. Η μία όψη λέει «ανοιχτές», η άλλη «ατιμολόγητες». (F15, F6)
9. **Στην εκτύπωση του «Προς τιμολόγηση», πελάτης με παραγγελίες χωρίς τιμή τυπώνεται με σύνολο 0,00.** Η οθόνη το αποφεύγει σωστά. (F19)
10. **Η «Διόρθωση» σε εθνική παραγγελία δείχνει πέντε πεδία· τα τέσσερα δεν αποθηκεύονται ποτέ** (μετά την ημέρα μετάβασης περνά μόνο η τιμή). Το μαθαίνει αφού πατήσει «Αποθήκευση». (F3)
11. **«Ανά όχημα»:** όλα τα φορτία χωρίς φορτηγό μπαίνουν σε μία ομάδα με τίτλο ό,τι έτυχε πρώτο· οι παραγγελίες χωρίς δρομολόγιο και οι εθνικές δεν ομαδοποιούνται καθόλου. (F5)

**Βρέθηκαν σωστά:** κάθε όνομα πεδίου που γράφουν ή διαβάζουν οι τρεις όψεις υπάρχει στον χάρτη του Worker για τον πίνακά του (τίποτα δεν πετιέται σιωπηλά). Κάθε ενέργεια είναι **μία** εγγραφή (δεν μένει τίποτα μισό). ΤΠΥ, αυτοπαράδοση, αναίρεση και τιμή ελέγχουν την εγγραφή που γύρισε πίσω πριν πουν «έγινε». Οι λίστες διαβάζονται ολόκληρες, χωρίς όριο. Κάθε αποτυχημένη ανάγνωση (εθνικές, δελτία, παρτίδες, πελάτες, δρομολόγια) λέγεται με λωρίδα.

### (β) Τι δεν κρίθηκε από τον κώδικα

- Αν οι κανόνες της βάσης (triggers) πιάνουν κάτι από τα παραπάνω· διαβάστηκε μόνο ο κώδικας της οθόνης και η πηγή του Worker στο repo.
- Το ζευγάρωμα κάθοδος–άνοδος των εθνικών και η αρίθμηση όπως στο Weekly: δεν διαβάστηκαν γραμμή προς γραμμή.
- Η κάρτα παραγγελίας που ανοίγει μέσα στην «Εβδομάδα», τα έγγραφα ανάθεσης, ο «Κατάλογος»: άλλο κομμάτι.
- Πόσο συχνά συμβαίνει καθένα (π.χ. πόσες παραδομένες δεν έχουν σημειωθεί): θέλει μέτρηση στη βάση.

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Όταν η «Διόρθωση» αλλάζει ημερομηνία παραγγελίας, ακολουθούν οι στάσεις της; Και χάνεται η ώρα; (F10)
- Μετά από «Εκτός σύνδεσης — δεν γράφτηκε ακόμη»: όταν γυρίσει η σύνδεση, τι βλέπει; (F11)
- Η «τελευταία τιμή ίδιας διαδρομής» μέσα στο κουτί της τιμής: διαβάζεται ως πρόταση ή ως ήδη γραμμένη τιμή; (F4)
- Οι «όροι πληρωμής» στην κάρτα: γράφουν σχεδόν πάντα «δεν έχει καταχωρηθεί»;
- Το όριο των δρομολογίων: η λωρίδα λέει 500, η πηγή του Worker κόβει στα 999. (F21)

---

## Facts that shape every finding

Abbreviations: `hub` = `modules/orders_hub.js`, `inv` = `modules/orders_invoicing_view.js`, `ops` = `modules/orders_invoice_ops.js`, `wk` = `modules/orders_week_view.js`, `np` = `modules/orders_noprice_view.js`, `oc` = `core/orders-common.js`, `qe` = `core/order-quick-edit.js`, `w` = `worker/src/index.js`.

- «Προς τιμολόγηση», «Χωρίς τιμή» and the hub counters read ONE set: every international and national order that is not cancelled (or is invoiced), all time, kept 60 s (`oc:762-796`). Split legs and stock pieces are dropped (`oc:782-784,822`). The read pages through everything (`core/api.js:674-697`); there is no cap.
- «Εβδομάδα» reads its own window (five weeks ± 8 days, `wk:744-750`) plus the same set for states and the duplicate check (`wk:769,1529-1537`).
- State of an order (`oc:886-893`): invoiced · cancelled · blocked (no price > 0) · ready. Nothing else blocks since 21/10.
- Each view keeps what it loaded until it is rendered again (tab change, scope change, retry). A write updates the one record in memory and repaints (`inv:893-897`, `wk:1539-1545,1709-1713`, `np:481-489`). No write sends the "what I saw" guard that `atPatch` supports (`core/api.js:813`; no `expect` in `ops`, `np`, `qe`).
- There is no typeahead and no candidate chooser on these three views. What a user chooses from: scope (Όλες / Διεθνείς / Εθνικές), a week strip, state tabs, one search box (invoicing only), «Ανά ημέρα / Ανά όχημα», and the fields of the quick-edit form.

## Question 1 — what the lists and filters offer

**F1. The week strip of «Προς τιμολόγηση» ends at the current week, so an invoiced order of a later week cannot be reached there.** `inv:1107-1112` (`shift` caps at the current week), `inv:160-163` («Όλες οι ανοιχτές» = ready + blocked only), `inv:136-141` (default week ≤ today).
Scenario: on Thursday the accountant types the ΤΠΥ of an export registered today that delivers next Tuesday (its week is next week, `oc:41-51`). She finds it under «Όλες οι ανοιχτές». After Enter the card jumps to the next order and a 10-second undo bar shows. A minute later she notices a wrong digit. The order is now invoiced, so «Όλες οι ανοιχτές» no longer lists it, and `›` is disabled at the current week. Nothing on this view can show it. The same holds for an invoiced order with no date at all (`inv:126` skips it from every week). She must know to go to «Εβδομάδα» and step forward.
Confidence: confirmed in code.
Redesign: one list where the period is a filter that also goes forward, and «τιμολογημένες» is reachable for any period; the last few orders she invoiced stay visible on the page («μόλις καταχωρήθηκαν»), not only for 10 seconds.

**F2. The search box searches only the selected week and the selected tab.** `inv:384-390` (`searchFilter(tabFilter(base, tab), q)`), empty text `inv:505`.
Scenario: a client phones about an invoice number. She types the ΤΠΥ in the box while the strip is on this week and the tab on «Προς κοπή». The page answers «Καμία παραγγελία για «…»». The order exists, invoiced, three weeks back. The message reads as "no such order".
Confidence: confirmed in code.
Redesign: a search that looks across periods and states and says where the hit is; or an empty text that says "σε αυτή την εβδομάδα και καρτέλα" with one click to widen.

**F3. The accountant's «Διόρθωση» on a national order offers five fields, four of which can never be saved.** Fields `qe:18-24`; refusal `qe:94-100`; rule in the Worker source `w:6184-6189` (accountant on national orders: invoicing fields and price only).
Scenario: she opens a national order's card from «Εβδομάδα», presses «Διόρθωση», corrects the customer reference and presses «Αποθήκευση». Only then a red line says the old model is closed and "(εδώ μόνο η τιμή)". What she typed stays in a form that cannot keep it.
Confidence: confirmed in screen code and Worker source; the deployed Worker was not checked.
Redesign: a form that shows only what this person can change on this order; the rest is read-only text with the place where it is changed.

**F4. «Τελευταία τιμή ίδιας διαδρομής» is offered from any age and any load size, and sits inside the price box as grey text.** `np:97-122` (same client, same FIRST loading and FIRST delivery place, most recent date, the whole all-time set), placeholders `np:379`, `inv:866`, `wk:1581`.
Scenario: a client's 4-pallet order last spring was priced low. Today's 33-pallet order on the same two places shows that amount in grey inside the empty box, and in the «ΤΕΛΕΥΤ. ΤΙΜΗ» column without pallets beside it. Enter on the empty box is refused correctly (`np:464-465`), so nothing is written by accident; the risk is a wrong memory aid.
Confidence: confirmed in code that size and age are ignored; whether it misleads needs a look in the live app.
Redesign: the hint is shown beside the box, never inside it, with its date and pallets; orders with more stops are not called "same route".

**F5. «Ανά όχημα» in «Εβδομάδα» groups unevenly.** `wk:1071-1078,417-427,692-715`.
Every row with no truck gets the same key, and the group's title is the text of its first row: «Προς ανάθεση» or «—» (a delivered order with no vehicle written), whichever comes first. Orders with no round trip stay in «ΧΩΡΙΣ RT» at the bottom even when they carry a truck (`wk:1089-1092`). National rows keep their day order; the toggle is hidden only when the scope is «Εθνικές» (`wk:925`).
Scenario: the owner picks «Ανά όχημα» to see what one truck earned this week. Its two round trips are under its plate; a third order of the same truck that has no round trip is at the bottom under another heading, and its nationals are in a different table.
Confidence: confirmed in code.
Redesign: «Ανά όχημα» is one list per vehicle across international and national, with "χωρίς φορτηγό" as its own clearly named group.

**F6. The same list has two names, and the same state has two words.** «Μπλοκαρισμένες» inside «Προς τιμολόγηση» (`inv:477`) is exactly the orders of the tab «Χωρίς τιμή» for one week (`oc:890`, `np:54-60`). «Εβδομάδα» says «Ατιμολόγητες» and sends her to "όλες οι ατιμολόγητες" (`wk:1000,1050`), while the button there is «Όλες οι ανοιχτές» (`inv:459`); the week view's own comment says an accountant reads «ανοιχτά» as "invoiced and unpaid" (`wk:429-430`).
Confidence: confirmed in code.
Redesign: one word per state on all three views («προς κοπή», «χωρίς τιμή», «τιμολογημένη»).

**Found right:** scope filter (`inv:118-120`, `np:56`); the duplicate-ΤΠΥ check looks at both order types whatever the scope (`inv:882`, `wk:1533-1537`); «Αυτοπαράδοση» is offered only where the base accepts it (`ops:79`); the accountant's default week is the latest with work (`inv:136-141`); /audit paging says when it is cut (`np:221,350`).

## Question 2 — what is written wrong or lost

**F7. Two people on one order: the later write replaces the earlier one, and neither is told.** Writes `ops:100-134`, `np:469`; snapshots `inv:352-360`, `np:241-247`, `wk:932-944`; Worker rule `w:3277-3297` (a new number on an already invoiced row is an accepted edit).
Scenario A: two accountants both have «Προς κοπή» open. Both type a ΤΠΥ for the same order from two ERP screens. The first write marks it invoiced. The second screen still shows it as ready, sends its number, and the Worker accepts it as a correction. The first number is gone. The duplicate check (`ops:27-37`) cannot help: each ran against its own snapshot.
Scenario B: the owner opened «Χωρίς τιμή» at 08:00 and left the tab open. At 10:00 the accountant typed the price in «Προς τιμολόγηση» and invoiced the order. At 12:00 the owner's list still shows the row with an empty box; he types another amount and presses Enter. The price of an invoiced order changes, without the question that every other path asks first (`ops:170-177` is asked only where the screen knows the order is invoiced), and the toast says the order "πέρασε στα Προς τιμολόγηση" (`np:488`).
Confidence: confirmed in the code of the screens and the Worker source; base triggers were not read.
By the owner's rule this is not solved with a refusal.
Redesign: before a ΤΠΥ or a price is written, the page checks that the order is still as she saw it and, if not, asks («στο μεταξύ πήρε ΤΠΥ…· αντικατάσταση;»); a list that has been open for long says how old it is and refreshes on return to the tab.

**F8. «Διόρθωση» reports success without looking at what came back, and also when offline.** `qe:102-117`.
`atPatch` returns a stand-in when there is no connection and does not throw (`core/api.js:839-845`); the form does not look at it, closes and says «Η παραγγελία αποθηκεύτηκε». The other writes of this page do check (`ops:96-99`, `np:472-480`).
Scenario: on a weak connection she corrects a price in «Διόρθωση». Green toast, the card shows the new price (`qe:111`). Nothing has reached the table yet; if the queued change is later refused, a red toast appears on whatever page she is by then.
Confidence: confirmed in code.
Redesign: one save behaviour for every money field on the page: "αποθηκεύτηκε" only from the returned record; "περιμένει σύνδεση" is its own visible state on the row.

**F9. «Διόρθωση» accepts a price of 0 and an emptied price, with the same success message.** `qe:80,89` (≥ 0 passes; empty is sent as "no value"); every other entry requires > 0 (`np:46-49`).
Scenario: she clears the price box by mistake and saves. The order silently returns to «Χωρίς τιμή» and the owner's counter goes up by one.
Confidence: confirmed in code for an order that is not invoiced (an invoiced one is refused by the Worker rule, `w:3295`).
Redesign: clearing a price is a named action with a question, not an empty box.

**F10. «Διόρθωση» writes the order's loading and delivery day as a bare date.** `qe:21-22,31-32,80`.
The form shows the day only and sends the day only. Whether the stops of the order follow, and what happens to a stored time of day, is decided in the base, not in this code. «Εβδομάδα» places a row by its stops' earliest date when it has them (`wk:104-111`) and by the order's own date for the week (`oc:41-51`), so a date changed here and not on the stops would move the order's week but not its day.
Confidence: needs a look in the live app and the base.
Redesign: dates are changed in one place that shows the stops they belong to.

**F11. "Εκτός σύνδεσης — δεν γράφτηκε ακόμη" is true, and then the write happens later on its own.** `ops:96-99` throws the message; the change is already queued (`core/api.js:839-845`) and is replayed when the connection returns (`core/api.js:242`), announced only as a count of synced changes.
Scenario: she types a ΤΠΥ, reads "δεν γράφτηκε ακόμη", and the draft stays in the box. When the connection returns the queued write lands; the row on her screen still says «προς κοπή» until the view is read again. If she presses Enter again it is harmless (same number); if she corrected the number in between, which write lands last was not traced.
Confidence: likely; needs a look in the live app.
Redesign: a row waiting for the connection shows it and turns to its real state by itself when the write lands.

**F12. One tick on «Αυτοπαράδοση» marks the order invoiced with no number and no question.** `inv:805-808,946-972`, `wk:1568,1765-1771`. The box sits directly under the ΤΠΥ field.
In «Προς τιμολόγηση» a 10-second undo bar follows and the card moves to the next order; in «Εβδομάδα» there is no undo bar, the line simply turns to «✓ αυτοπαράδοση».
Confidence: confirmed in code. The single tick was asked for by the owner (2/11); by his rule the answer is not a question that blocks.
Redesign: the tick stays one action; the result stays on screen with «Αναίρεση» beside it for as long as she is on the page.

**Found right:** every label the three views write or read is in the Worker map of its table — ORDERS, NATIONAL ORDERS, CLIENTS, NATIONAL LOADS, ORDER STOPS, STOCK LOTS (checked label by label, quoted and unquoted forms; `w:988-1009,1317-1550,1665-1768,1769-1846,1847-1970,2142-2240`). Every action is one write, so there is no half-saved state; the lot close and reopen read the record back (`oc:626-664`). ΤΠΥ, self delivery, undo and price compare the returned record with what was sent (`ops:100-134`). A refused write keeps what she typed (`inv:928,1053`, `wk:1616-1622`). The facade's list order ends with the row id in the repo source (`w:2646`), so paging does not skip rows.

## Question 3 — what the page does not tell

**F14. Three counts for "how many do I have to invoice", none equal to the list under it.**
- Tab badge on «Προς τιμολόγηση» and the sidebar number: ready orders of ALL weeks (`hub:181-193`).
- «Προς κοπή · n» inside the view: ready orders of the SELECTED week (`inv:164-168,478`).
- «Όλες οι ανοιχτές · N»: ready AND unpriced, all weeks (`inv:450,459`).
- The strip word of the current week is always «σε εξέλιξη», whatever is ready in it (`inv:153`).
Scenario: the badge says 41. She opens the view: «Προς κοπή · 6». She presses «Όλες οι ανοιχτές · 58» and the tab inside says «Προς κοπή · 41». The comment in the code promises that a counter never disagrees with its list (`hub:171-172`); it holds only after that click. When the counters' read fails the old numbers stay with no sign (`hub:178`).
Confidence: confirmed in code.
Redesign: the number on the tab is the number of rows she lands on; a period filter shows its own count beside it.

**F15. Empty and helper texts say things that are not true.**
- «Καμία ανοιχτή παραγγελία — όλες οι παραδομένες έχουν τιμολογηθεί» is printed for ANY empty tab under «Όλες οι ανοιχτές» (`inv:506`), e.g. on «Μπλοκαρισμένες · 0» while «Προς κοπή · 41» is next to it.
- "παραδομένες" is still said in four places although an order is invoiced from registration (`inv:506,507`, `np:240,400`).
Scenario: the owner opens «Χωρίς τιμή» on scope «Εθνικές» and reads "όλες οι παραδομένες έχουν τιμή"; undelivered orders are on this list too since 21/10, so the sentence describes another rule.
Confidence: confirmed in code.
Redesign: one empty text per state, written from today's rule («καμία παραγγελία χωρίς τιμή»).

**F16. Waiting days exist only for an order somebody marked delivered.** `oc:86-96,862-866` (international: the written status; national: the date), used by `inv:69,484,204`, `np:298-299,340`, `wk:158-164`, and by the pallet-slip check (`oc:804,891`).
Scenario: an international order was delivered three weeks ago; nobody pressed the delivery in the daily page. In «Προς τιμολόγηση» it reads «προς κοπή» with no days, «Παλαιότερη εκκρεμής» ignores it, in «Χωρίς τιμή» it shows «—» and never gets the red line, and a missing pallet slip is never asked about.
Confidence: confirmed in code; how many orders are in this state needs a count in the base.
Redesign: age is shown from the planned delivery day when no one confirmed it, marked «δεν επιβεβαιώθηκε παράδοση», so the oldest work is still on top.

**F17. «Εβδομάδα», by day: a day says «καμία κίνηση» while its orders are listed under «ΧΩΡΙΣ RT».** `wk:1080-1092` (days are built from round-trip rows only; orders with no round trip are appended after the seventh day).
Scenario: two exports deliver on Tuesday and have no truck yet, so no round trip. Tuesday reads «Τρίτη · καμία κίνηση». The two orders, with their amounts, are at the bottom.
Confidence: confirmed in code.
Redesign: an order with no round trip stands on its day, marked «χωρίς δρομολόγιο».

**F18. The CSV of «Εβδομάδα» is not held to the rules of its own print.** `wk:2334-2355`.
- The print refuses while any read failed (`wk:2204,2324`); the CSV exports anyway, with nothing in the file or on screen saying that nationals or round trips are missing.
- A national order planned on the new national board is exported with vehicle «Προς ανάθεση» even when it has a truck (`wk:2351` passes a vehicle only for an old-model load; `wk:693`). Screen and print show the truck (`wk:1457,2270`).
- There is a ΤΠΥ column and no invoice date; the state says «τιμολογήθηκε» only.
Confidence: confirmed in code.
Redesign: one export per view built from what the screen shows; if the screen carries a warning, the file carries it in its first line.

**F19. The print of «Προς τιμολόγηση» shows 0,00 for a client whose orders have no price, and lists self deliveries the CSV leaves out.** `inv:1158` (group amount printed as is) against the screen's rule (`inv:515-517`); `inv:233` (CSV skips self deliveries) against `inv:1153-1157` (print keeps them and adds their price to the total).
Confidence: confirmed in code.
Redesign: paper, file and screen from one row builder.

**F20. In «Προς τιμολόγηση» a failed read of the national loads has no banner.** `inv:396-403` lists five failures; the loads' failure flag (`oc:755-761`) is shown only in «Χωρίς τιμή» (`np:344`). The card then shows «—» for the vehicle of every old-model national order (`inv:497-498`).
Confidence: confirmed in code.
Redesign: one place on the page for "what did not load", shared by all views.

**F21. The round-trip limit message and the Worker source disagree.** The page raises "έφτασαν το όριο ανάγνωσης (500)" at 500 rows (`wk:832,980`) and the print then refuses; the Worker source reads up to 999 and answers a `truncated` flag (`w:4698-4707`) that the page does not read.
Confidence: confirmed in repo code; the deployed Worker was not checked. Far from both numbers today by the code's own figures (15–22 trips a week).
Redesign: the page reports a cut only when the answer says it was cut.

**F22. A view-only role sees a card with no action and no reason.** For a ready order the card of a dispatcher or management user ends after «Έλεγχοι» (`inv:813,872`); only the unpriced case has a note (`inv:862`).
Confidence: confirmed in code. Minor.
Redesign: one grey line «η τιμολόγηση γίνεται από το λογιστήριο».

## Question 4 — what is missing for the job

**F25. One ERP invoice for several orders is typed once per order.** The code knows the case («ένα τιμολόγιο για πολλές παραγγελίες», `ops:53`) and moves her to the next order of the same client (`inv:210-217`), but the number and date start empty each time (`inv:819-820`).
Scenario: one invoice covers six orders of a client for the week: six times the same number, six Enters.
Confidence: confirmed (absence).
Redesign: tick several rows of one client, one number, one date; or the next order of the same client opens with the last number offered beside the box.

**F26. The client data shown "for the ERP" has no postal code and no tax office.** The card and the ERP sheet build the address from street, city, country (`inv:219-222,315`); the Worker map of clients has no other address field (`w:988-1009`). The code's own example line carries a postal code (`inv:218`).
Confidence: confirmed in the map; whether the ERP needs them is the accountant's answer.
Redesign: decide with her which client fields the ERP entry needs, and show a missing one as missing.

**F27. No search in «Εβδομάδα» and «Χωρίς τιμή»; no way to find an order by ΤΠΥ across weeks.** Search exists only in `inv:413`, limited as in F2.
Confidence: confirmed (absence).
Redesign: one search for the whole «Παραγγελίες» page.

**F28. A self delivery with no price stays on the owner's «Χωρίς τιμή» list.** The list is "no price, not invoiced" (`oc:890`); the tick exists only in the other two views (`inv:869`, `wk:1582`). Until someone ticks it there, the owner is asked for a price that is not needed.
Confidence: confirmed in code.
Redesign: «Αυτοπαράδοση» is offered wherever a price is asked for.

**F29. Nothing says that someone else is working on, or has just changed, the same list.** See F7. No presence, no "changed since you opened", no refresh on returning to the tab (`hub:139-146` refreshes only after this browser's own save).
Confidence: confirmed (absence).
Redesign: a quiet «άλλαξαν 3 παραγγελίες — ανανέωση» line; never a lock.

**F30. No warning for an invoice date far in the past.** `ops:42-46` refuses a future date and accepts anything else; the hint is always «σήμερα ή παλαιότερη».
Scenario: last year's date typed by habit in January is accepted in silence.
Confidence: confirmed in code. By the owner's rule: a warning, not a refusal (a late entry is normal).
Redesign: a yellow line when the date is more than a few weeks before the order's own dates.

**F31. A stale price list cannot be told from a fresh one.** «Χωρίς τιμή» is the page the owner leaves open; it has no "last read at" and no refresh control (`np:236-257`). «Εβδομάδα» has «Ξαναδοκιμή» only on a failure strip (`wk:997`).
Confidence: confirmed (absence).
Redesign: the time of the last read and a refresh, in the same place on all views.

## What was read and what was not

Read in full: `modules/orders_hub.js`, `modules/orders_invoice_ops.js`, `modules/orders_noprice_view.js` (without its CSS), `core/order-quick-edit.js`, `core/orders-common.js`; `modules/orders_invoicing_view.js` lines 20–1180; `modules/orders_week_view.js` lines 60–440, 660–1180, 1316–1880, 2143–2374.
Read in part: `core/api.js` (paged read, `atGet`, `atGetAll`, `atPatch`, offline queue replay); `core/orders-list.js` (CSV, print popup); `worker/src/index.js` — the field maps of ORDERS, NATIONAL ORDERS, CLIENTS, NATIONAL LOADS, ORDER STOPS, STOCK LOTS, the invoicing rule (`3277-3297`), the old-model national rule (`6160-6230`), the round-trip list (`4695-4730`).
Used as a map and spot-checked: `docs/design/redesign-2026-11/catalog/B-daily-orders.md` 302–533 (its findings 9, 10, 23 are confirmed here as F9, F10, F18).
Not read: the pairing and numbering of national rows in the week view (`wk:440-660`), the document panels and route diagram (`wk:1889-2140`), the fitting code and all CSS, `modules/orders_catalog.js`, the order cards of `orders_intl.js` / `orders_natl.js`, `core/plan-config.js` beyond its names, any migration or trigger, the deployed Worker, the database, the live app.

===== END FILE CONTENT =====

Notes for the caller:
- Finding numbers skip F13, F23, F24 (merged into F12, F14 while drafting); renumber on save if a gapless sequence is wanted.
- No real customers, people, plates, amounts or tax numbers are quoted; nothing about security or permissions weaknesses is included; role rules are mentioned only as "what the form offers versus what is saved" (F3).
