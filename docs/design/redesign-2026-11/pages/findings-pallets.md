# Παλέτες: έλεγχος λειτουργιών της σημερινής σελίδας (15/11/2026)

Ένας ανεξάρτητος έλεγχος διάβασε τον κώδικα της σελίδας «Παλέτες», καρτέλα προς καρτέλα. **Όλα τα παρακάτω είναι ευρήματα από ανάγνωση κώδικα. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο διακομιστής που τρέχει.** Κάθε εύρημα έχει βαθμό βεβαιότητας. Τίποτα δεν διορθώθηκε εδώ.

## Σύνοψη

Κανόνας του owner που ισχύει παντού: κάποιες κινήσεις γράφονται εκ των υστέρων, ενώ η δουλειά ήδη τρέχει. Άρα όπου «λείπει έλεγχος», η σωστή απάντηση είναι προειδοποίηση, ποτέ άρνηση. Σημειώνεται σε κάθε εύρημα που τον αφορά.

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Φόρτωση που αντιλογίστηκε δεν ξαναγράφεται.** Αν μια οριστική φόρτωση έχει λάθος νούμερα, ο μόνος δρόμος είναι ο αντιλογισμός. Η οθόνη λέει «μπορείς να γράψεις τη σωστή», αλλά δεν υπάρχει πουθενά τρόπος να γραφτεί φόρτωση με το χέρι. Η «Εβδομάδα» δείχνει κόκκινο «λείπει», το πατάς, και απαντά «δεν γράφτηκε τίποτα». Οι παλέτες αυτής της φόρτωσης μένουν εκτός υπολοίπου. (F7)
2. **Η εκκρεμής φόρτωση κρατά την παλιά ημέρα, το παλιό σημείο και τον παλιό πελάτη.** Όταν αλλάξει η παραγγελία μετά την πρώτη αποθήκευση, η εκκρεμής κίνηση ενημερώνεται μόνο στις παλέτες. Η «Αναμονή» μετρά από λάθος ημέρα, και αν άλλαξε ο πελάτης, η επιβεβαίωση χρεώνει τον παλιό. Το παράθυρο επιβεβαίωσης δεν αφήνει να αλλάξεις ημέρα ή σημείο. (F8)
3. **Στη διόρθωση παράδοσης χάνεται το δελτίο και διορθώνεται μόνο το «πήραμε».** Η νέα κίνηση δεν κρατά το δελτίο της παλιάς, και η παλιά δεν φαίνεται πια πουθενά. Το «δώσαμε» δεν αλλάζει. Παράδοση που γράφτηκε κατά λάθος δεν αντιλογίζεται καθόλου. (F9)
4. **Η «Εβδομάδα» δείχνει κενά αντί για «δεν διαβάστηκε».** Αν οι κινήσεις δεν ήρθαν από τον διακομιστή και η καρτέλα είναι η «Εβδομάδα», ο πίνακας βγαίνει κανονικά, με άδεια κουτάκια και κόκκινα «λείπει καταγραφή», χωρίς κανένα μήνυμα αποτυχίας. (F14)
5. **Άρνηση στο «Ελέγχθηκε» βγαίνει ως ακατανόητο μήνυμα.** Αν κάποιος άλλος πρόλαβε να σημειώσει την εβδομάδα, το μήνυμα γράφει «[object Object]» αντί για την ελληνική εξήγηση. (F15)
6. **Η «Εβδομάδα» μένει παλιά όλη μέρα.** Αν ξαναμπείς στη σελίδα στην ίδια εβδομάδα, ο πίνακας δεν ξαναδιαβάζει τις παραγγελίες. Δεν υπάρχει κουμπί ανανέωσης. (F16)
7. **Η λίστα «Λείπει παράδοση» δεν ενημερώνεται μετά από καταχώρηση στην «Εβδομάδα».** Η στάση που μόλις έκλεισες εκεί φαίνεται ακόμη να λείπει στο «Προς ενέργεια». (F17)
8. **Οι πιο παλιές εκκρεμείς είναι οι πιο κρυμμένες.** Η λίστα δείχνει πρώτα τους πελάτες με την πιο πρόσφατη κίνηση και μόνο τις τρεις πρώτες ομάδες. Όσες περιμένουν πάνω από 14 ημέρες πέφτουν στο «N ακόμη πελάτες». (F1)
9. **Το μήνυμα «καταχώρησε χειροκίνητα από το Ισοζύγιο» ζητά κάτι που δεν γίνεται.** Όταν αποτύχει η αυτόματη δημιουργία εκκρεμών φόρτωσης, το μήνυμα στέλνει τον χρήστη να τη γράψει με το χέρι, αλλά η «Νέα κίνηση» δεν έχει είδος «Φόρτωση» ούτε σύνδεση με παραγγελία. (F12, F24)
10. **Δύο αντίθετοι κανόνες για την ίδια δουλειά.** Στο «Προς ενέργεια» η παράδοση που λείπει θέλει τα πραγματικά νούμερα από το δελτίο. Στην «Εβδομάδα» το ίδιο κλείνει με ένα πάτημα, ως οριστική «πήραμε όσες δώσαμε». (F10)
11. **Η «Νέα κίνηση» προσφέρει πελάτες και συνεργάτες μαζί για κάθε είδος**, δείχνει μόνο το όνομα (δύο ίδια ονόματα δεν ξεχωρίζουν), κόβει στα 20 χωρίς να το λέει, και δέχεται «πήραμε» σε κίνηση που λέει «δίνουμε». (F2, F3, F13)
12. **Νούμερα που δεν συμφωνούν μεταξύ τους.** «Εκκρεμείς» πάνω μετρά όσες είναι έως σήμερα· η στήλη «Εκκρεμείς» στα Υπόλοιπα μετρά και τις προγραμματισμένες. Στην «Εβδομάδα» το «3 εκκρεμείς →» γίνεται φίλτρο «Εκκρεμείς 2». (F18)
13. **Μηνύματα στα αγγλικά.** Αρκετές αρνήσεις του διακομιστή φτάνουν αμετάφραστες στον χρήστη. (F19)
14. **Η καρτέλα πελάτη με μηδενικό υπόλοιπο και χωρίς εκκρεμείς δεν ανοίγει από πουθενά.** Δεν μπορείς να του τυπώσεις κατάσταση. (F23)
15. **Οι παραδόσεις γίνονται οριστικές μόνες τους, «πήραμε όσες δώσαμε», χωρίς δελτίο.** Η σελίδα δεν έχει λίστα «παραδόσεις που κανείς δεν έλεγξε με το δελτίο». (F22)

### (β) Τι δεν κρίθηκε από τον κώδικα

- Πόσο συχνά αλλάζει ημέρα ή πελάτης μετά την πρώτη αποθήκευση παραγγελίας (καθορίζει πόσο βαρύ είναι το 2).
- Αν υπάρχουν σήμερα οριστικές φορτώσεις του προγραμματισμού εθνικών (για αυτές ο αντιλογισμός απορρίπτεται πάντα, F11).
- Τι ακριβώς υπολογίζουν οι όψεις υπολοίπων και ο έλεγχος «Ελέγχθηκε» μέσα στη βάση. Διαβάστηκαν μόνο τα αρχεία τους, όχι η ζωντανή βάση.
- Ό,τι αφορά δικαιώματα ρόλων: μένει εκτός αυτού του αρχείου.
- Το όχημα και ο οδηγός κάθε γραμμής είναι της παραγγελίας. Αν την παράδοση την έκανε άλλος (συνεργάτης, αλλαγή οδηγού), ο πίνακας «Δεν γύρισαν ανά οδηγό» χρεώνει λάθος άνθρωπο. Πιθανό, όχι αποδεδειγμένο (F21).

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Αντιλογισμός μιας δοκιμαστικής φόρτωσης και προσπάθεια να ξαναγραφτεί (F7).
- Παραγγελία με εκκρεμή φόρτωση: αλλαγή ημέρας και αποθήκευση· τι ημέρα δείχνει μετά η εκκρεμής (F8).
- Διόρθωση παράδοσης που είχε δελτίο: φαίνεται το δελτίο στη νέα κίνηση; (F9)
- Άνοιγμα της «Εβδομάδας» χωρίς δίκτυο: βγαίνει μήνυμα ή άδειος πίνακας; (F14)
- Πόσο μένει παλιά η «Εβδομάδα» όταν αλλάζεις εβδομάδα και γυρνάς (F16).
- Ονόματα σημείων στο πάνελ της «Εβδομάδας» για σημεία που είναι αλφαβητικά μετά τα πρώτα χίλια (F21).
- Φωτογραφία δελτίου από κινητό: ανεβαίνει, ανοίγει στην προβολή; (F19)

---

# Detailed findings

Confidence: **confirmed** = follows from the code as read; **likely** = the code allows it, a second condition was not proven; **live** = needs a look in the running app. Line numbers are of the worktree at commit `f793d224`.

Short names: `PL` = `modules/pallet_ledger.js`, `PW` = `modules/pallets_week.js`, `PF` = `core/pallet-feed.js`, `W` = `worker/src/index.js`.

## Q1. What lists, typeaheads and filters offer

### F1. Pending queue: the oldest rows are the most hidden
- Where: `PL:466-481` (client groups sorted by their latest movement, newest first), `PL:540` (only the first three groups drawn), `PL:552-556` (the rest behind «N ακόμη πελάτες»), `PL:521` (the confirm wizard walks the same order).
- Scenario: twelve clients have pending loadings. A client whose only pending loading is five weeks old sorts last, behind the expander. The accountant confirms the visible three groups, sees a short list and stops. The red «over 14 days» bar exists (`PL:437`) but sits on rows she never opened.
- Confidence: confirmed.
- Redesign: the queue is ordered by what is late first (or offers that order), and a collapsed group says how many of its rows are late.

### F2. «Νέα κίνηση»: one party list for every kind of movement
- Where: `PL:1778` (the party field always searches `party`), `PL:1757-1758` (the kinds), `W:7239-7247` (clients and partners concatenated, clients first), `W:7161-7175` (the Worker ties party type to the id, never to the kind).
- Scenario: she picks «Παραλαβή από συνεργάτη», types three letters, and the list shows up to 20 clients before the first partner. Picking a client saves a partner-kind movement on a client's balance. The reverse (a return of empties booked on a partner) saves too.
- Confidence: confirmed that nothing filters or warns; whether a given combination is ever legitimate is a business answer.
- Owner rule: applies. Do not hide the other group; show the fitting group first and mark the other.
- Redesign: the kind decides which parties come first; a party that does not fit the kind stays selectable with a visible mark.

### F3. Party and point candidates: name only, cut at 20, no mark for inactive
- Where: `W:7224-7234` (select `id, name`, `limit 20`, alphabetical, no `active` filter), `PL:1731-1734` (the row shows the name, plus «συνεργάτης» for partners).
- Scenario: two clients or two points share a name. Both rows read the same; she cannot tell which one she picks. A common fragment returns the first 20 alphabetically and the list does not say that more exist, so the wanted one may simply not appear.
- Confidence: confirmed.
- Redesign: each candidate carries a second fact (city and country for a point; city and current balance for a party), an «inactive» mark, and a «more results, type more» line when the list is cut.

### F4. Point typeahead offers every point of the system
- Where: `PL:1780`, `W:7236`. The duplicate warning needs a point to work (`PL:1816`).
- Scenario: a return of empties to a client. The point list is the whole locations table by name, not the points where this client has an open balance. Leaving the point empty (it is optional) also switches off the «already written at this point» warning.
- Confidence: confirmed.
- Owner rule: applies. Any point must stay selectable.
- Redesign: the party's own points with a balance come first; the duplicate check also runs per party when no point is given.

### F5. «Κινήσεις»: no filter by kind or state, reversed rows visible nowhere
- Where: `PL:252`, `PL:269-275` (reversed filtered out of the list), `PL:1115` (and out of the card), `PL:958-971` (period select: all, six months, custom), `PL:972-977` (no search on «Υπόλοιπα»).
- Scenario: she wants «all pending of October» or «only deliveries»: there is only free-text search. She wants to see what was reversed last week and why: no view shows it. A custom period with «from» after «to» answers «Καμία κίνηση σε αυτή την περίοδο».
- Confidence: confirmed.
- Redesign: kind and state are filters next to the period; reversed rows can be shown on demand, struck through, with their reason.

### F6. Week view: Enter jumps to the first pending of the week, not the next one
- Where: `PW:321` (`_next`), `PW:546-550` (opens the first `conf:` cell of the board).
- Scenario: the first pending row of the week has no slip yet, so she closes it and confirms the fourth. After Enter the editor opens again on the first row. Every confirmation returns her to the row she skipped.
- Confidence: confirmed.
- Redesign: «next» means the next one below the row just saved; a skipped row stays skipped until she comes back.

**Found correct:** typing after a pick clears the pick (`PL:1715`); a failed search says «Σφάλμα αναζήτησης» instead of an empty list (`PL:1724-1728`); the search box matches number, party, point, vehicle, driver, both weeks and three date forms (`PL:224-240`).

## Q2. What is written wrong or lost

Labels: the page writes through `/pallets/*` with column names, not through the label map. Every key the page sends is in the Worker's allowed list (`W:7130`). The order and stop labels it reads («Reference», «Week Number», «Is Partner Trip», «Partner Truck Plates», «Pallet Exchange», «Parent Order», «Total Pallets», «Pallets Exchanged», «Stop Type», «DateTime», «Completed At») are all in the map of their table (`W:1317-1551`, `W:1769-1847`). **No silently dropped label was found.**

### F7. A reversed loading cannot be written again
- Where: `PL:1512-1516` (a confirmed loading offers only «Αντιλογισμός», with the text «μπορείς να γράψεις τη σωστή»), `PL:1757-1758` (no «Φόρτωση» kind and no order link in «Νέα κίνηση»), `PF:94-97` (the per-stop check reads movements of any state; `W:7264-7286` has no default state filter), `PF:173-181` (an existing row is «claimed», a reversed one included), `PW:61-67` (the week counts only live rows, so it shows «missing»), `PW:315-317` (the click answers «Δεν γράφτηκε τίποτα: οι στάσεις έχουν ήδη κίνηση…»).
- Scenario: a loading was confirmed with 30 instead of 33. She reverses it with a reason. The client's balance loses the whole loading. Re-saving the order does not create a new pending row. The week shows a red «—» for the loading; clicking it writes nothing and says the stop already has a movement. The only thing left is a hand-typed «Παραλαβή αδειών» with no link to the order.
- Confidence: confirmed in code; worth one run in the live app.
- Redesign: a confirmed loading gets the same «correct it» action a delivery has (reverse and replacement in one step, both numbers editable), and «missing» and «already has a movement» use one definition.

### F8. A pending loading keeps its first date, point and client
- Where: `PF:172-180` (on re-save only `taken` is patched), `PL:1335-1345` and `PL:1462` (the confirm dialog edits and sends only the two numbers and the slip). No database sync of these fields was found in `worker/migrations`.
- Scenario: an order is saved for Monday, then moved to Thursday, or its client is corrected. The pending movement still says Monday and the first client. «Αναμονή» counts from Monday, the row may turn red while the truck has not loaded, and on confirmation the pallets land on the first client's card with Monday's date. The printed statement then shows a date the client does not recognise.
- Confidence: confirmed in code; frequency unknown.
- Redesign: a pending row always shows the order's current day, point and client (it is a mirror until confirmed), and the confirm step shows them as editable facts with «differs from the order» when they do.

### F9. Delivery correction loses the slip, fixes one number, and a wrong delivery cannot be removed
- Where: `PL:1472-1483` (the replacement carries no slip fields and takes «given» from the old row), `PL:1664-1672` («Δώσαμε» disabled, no slip field), `PL:1510-1511` (a confirmed delivery has no reversal action), `PL:252` (the reversed original, which holds the slip, is listed nowhere).
- Scenario A: a delivery was confirmed with a slip; she corrects «taken». The new row shows «Δελτίο: δεν έχει ανέβει» and the old row can no longer be opened. Scenario B: the slip shows we delivered 31, not 33: «given» cannot be changed. Scenario C: a delivery was written for the wrong order: it can only be «corrected», never taken out.
- Also: an empty «Πήραμε πραγματικά» is read as 0 and saved (`PL:1690`), and saving with no change still reverses and rewrites the row.
- Confidence: confirmed.
- Redesign: one correction form for any confirmed movement: both numbers, the slip kept or replaced, «what happened», and a plain «this movement should not exist» path with a reason.

### F10. Two opposite rules for a delivery that has no movement
- Where: action tab `PL:767-769`, `PL:785`, `PL:825-828` (both numbers typed by her, none prefilled); week `PF:110-126` and `PW:249`, `PW:316` (one click writes a confirmed row with taken = given = the stop's pallets).
- Scenario: the same missing delivery is closed with real numbers from the slip in one tab, and with an assumed full exchange in the other. The week's version also uses all pallets of the stop, while the loading side counts only the pallets with exchange (`PF:77-87`).
- Confidence: confirmed.
- Redesign: one way to close a missing delivery on both surfaces; if a one-click «full exchange» stays, it is marked as assumed until a slip is attached.

### F11. Movements owned by the national plan: two offered actions always fail
- Where: `PL:1509` («Διαγραφή εκκρεμούς») against `W:7492-7494`; `PL:1512-1516`, `PL:1648` («Αντιλογισμός» sends only a reason) against `W:7556-7559` (refused without a replacement).
- Scenario: she opens a confirmed loading that came from the national plan and presses «Αντιλογισμός»: always refused. The refusal text is Greek and explains, but the panel offered the action and offers no working one.
- Confidence: confirmed in code; live for whether such rows exist today.
- Redesign: a plan-owned row says so in the panel and offers only what works (its exchange side, the slip, the note), with a link to where the rest is changed.

### F12. Multi-step writes: where they can stop
| Write | Stops after | What the user sees | Verdict |
|---|---|---|---|
| Confirm (numbers, then confirm) `PL:1461-1469` | numbers written, not confirmed | «Τα νούμερα … γράφτηκαν, η επιβεβαίωση όχι», retry button `PL:1414-1416` | handled |
| «Χωρίς ανταλλαγή» + reversal of the loading `PL:880-894` | switch written, reversal failed | long toast naming what did happen | handled |
| Delivery correction, replacement refused `W:7598-7607` | old row reversed, no new row | toast «Η διόρθωση δεν έγινε: Ο αντιλογισμός έγινε, η διόρθωση όχι…»; the form stays open and the lists are not re-read (`PL:1695-1700` reloads only for the confirm step) | contradictory message, stale screen; a second press answers in English (F19) |
| Automatic pending loadings on order save `PF:155-191` | some stops written, orphans not removed | one toast: «απέτυχε δημιουργία εκκρεμών φόρτωσης — καταχώρησε χειροκίνητα από το Ισοζύγιο» (`PF:31-38`) | the instruction cannot be followed: the page has no manual loading (F7, F24) |
| Week quick entry, re-read fails after a good write `PW:319-327` | write done, list not re-read | the editor shows an error with no step named, as if the write failed | misleading; a second Enter gets a refusal |
- Confidence: confirmed for each row.
- Redesign: every multi-step act ends with a re-read and one sentence of what stands now; a failure message never tells the user to do something the page cannot do.

### F13. «Νέα κίνηση» accepts a side that contradicts its kind, and 0 / 0
- Where: `PL:1783-1784`, `PL:1859-1870`; `W:7169-7172` (only «non-negative integers»), `W:7423` (the zero rule only when confirming).
- Scenario: kind «Επιστροφή αδειών · δίνουμε άδειες», number typed into «Πήραμε». It saves, and the balance moves the wrong way. With 0 / 0 and no slip it saves as pending, which the confirm dialog then refuses.
- Confidence: confirmed.
- Owner rule: applies. A warning («this kind normally fills Δώσαμε»), not a lock.
- Redesign: the kind puts the expected field first and names it in work words; the other field is a deliberate second step.

## Q3. What the page does not tell

### F14. Week tab with unread movements looks like «nothing recorded»
- Where: `PL:70-74` (a failed read empties the list and sets the error), `PL:992-997` (the week branch draws before the error branch at `PL:998`), `PW:164-168` (no movement on a delivered order = red «—»).
- Scenario: she left the page on «Εβδομάδα». Next visit the movements request fails. The week draws with every exchange cell empty, delivered orders marked «λείπει καταγραφή», zero pending, and no failure card. Clicking a red cell is safe (the write checks the server) but the picture is false.
- Confidence: confirmed in code; live to see it.
- Redesign: the week says «οι κινήσεις δεν διαβάστηκαν» in its own header and draws no exchange cells until they are.

### F15. A refused week mark reads «[object Object]»
- Where: `W:7720` (the refusal is sent as an object), `PF:19-20` (the fetch helper builds the error from that value as text), `PW:343`, `PW:351` (toast).
- Scenario: two people check the same week. The second gets «Το σημάδι δεν γράφτηκε: [object Object]» instead of «Η εβδομάδα είναι ήδη ελεγμένη — ανανέωσε τη σελίδα.» (`W:3428-3435`).
- Confidence: confirmed.
- Redesign: a refusal is always one Greek sentence with the next step; the design assumes that sentence exists.

### F16. The week board is never re-read for the same week
- Where: `PW:731` (same week in memory → draw, no read), `PW:659-664` (retry only on an error). The state object lives for the whole browser session.
- Scenario: she opens the week at 08:00, works elsewhere, returns at 13:00. Orders delivered since, assignments changed, an order switched to «no exchange» from the action tab: the board shows the 08:00 picture with no «as of» time and no refresh control.
- Confidence: confirmed for the same week; live for how long the shared week read is cached when she changes week and back.
- Redesign: the week shows when it was read and has a refresh; returning to the page re-reads.

### F17. «Λείπει παράδοση» goes stale after a write in the week
- Where: `PW:89-93` (after a week write only movements and client balances are re-read), `PL:346-355` (changing tab only redraws), `PL:700-716` (the missing list is read on page load).
- Scenario: she records a missing delivery in the week, then opens «Προς ενέργεια»: the counter and the list still show that stop. «Συμπλήρωση» on it is refused by the base with a Greek sentence, after she typed the numbers.
- Confidence: confirmed.
- Redesign: one refresh after any write, for every list and counter of the page.

### F18. Counts that do not match the list under them
- «Εκκρεμείς» in the top strip counts rows dated up to today (`PL:922`, `PL:253`); the «Εκκρεμείς» column and total of «Υπόλοιπα» count every pending row, scheduled ones included (`PL:644`, `PL:666`; view in `worker/migrations/003_pallets_schema.sql:60`); the summary box beside it counts a third way, from the loaded list (`PL:649-656`).
- Week: «3 εκκρεμείς →» counts movements, «λείπει καταγραφή» counts stops (`PW:116-131`), and the filter chip they open shows the number of truck rows (`PW:524`). Rows also carry legs of neighbouring weeks, which the filter matches but the summary does not count (`PW:111-118` against `PW:483-495`).
- Confidence: confirmed.
- Redesign: one unit per counter, written beside the number, and the same number on the link and on the list it opens.

### F19. Refusals that reach the user in English or as a code
- Where: `W:7165-7171`, `W:7424`, `W:7450`, `W:7488`, `W:7504`, `W:7516`, `W:7671`, `W:7687`, shown through `PL:1873`, `PL:1639`, `PL:1418`, `PW:325`.
- Scenario: a negative number, a second press after someone else confirmed, a photo over 8 MB, a failed upload: the toast ends in an English sentence. Sentences of the page also name a movement by its order number or internal code (`PL:216-217`, `PL:1412-1418`, `PL:1501`, `PW:193`).
- Confidence: confirmed for the texts; live for phone photos (type and size).
- Redesign: every message names the movement as «client, point · day» and says what to do next.

### F20. A printed card would be wrong if a party's list were ever cut
- Where: `PL:1132-1146` (the running balance starts at 0 from the rows loaded), `PL:1178` and `PL:1220-1242` (grand row and printed balance come from that sum; the print has no cut note, the CSV has one at `PL:1039`). The cap is 9,990 rows (`W:7266`).
- Scenario: far from today's volume. If it is ever reached, the paper sent to a client states a balance that differs from the screen's header.
- Confidence: confirmed in code, not reachable soon.
- Redesign: the statement's closing balance always comes from the balance source, never from a sum of listed rows.

### F21. Facts shown from a neighbour, not from the movement
- Vehicle and driver of every row are the order's own fields (`PL:188-205`); the week's «Δεν γύρισαν ανά οδηγό» groups by the order's driver and puts every partner trip under «χωρίς οδηγό» (`PW:431-434`). A delivery made by someone else is attributed to the order's driver. Confidence: likely.
- The week panel names a movement's point from the general lookup list (`PW:628`), read in one request (`W:7256-7260`, `W:160-165`), while the ledger uses the name that comes with the movement. If the lookup is cut by the database's row limit, points late in the alphabet show blank in the panel. Confidence: likely; live.
- Redesign: who carried the pallets is a fact of the movement; the table says «οδηγός παραγγελίας» only where that is what it is.

**Found correct:** a failed read of the main lists is a failure card, never «0» (`PL:998-1003`, `PL:734`); missing order details are said with a retry (`PL:935`); the confirm step names which half happened; the typeahead never shows an empty list for an error; the duplicate warning warns and does not lock (`PL:1802-1826`); the balance mismatch between the view and the sum is flagged, though only as a hover mark (`PL:1156-1158`).

## Q4. What is missing for the job

### F22. No list of deliveries nobody checked against a slip
- Where: `worker/migrations/108_pl_delivery_trigger.sql:90-94` (every delivery is written confirmed, taken = given = the stop's pallets, by the system), `PL:1497-1500` (the panel can say «δεν έχει ανέβει»), no filter anywhere.
- Scenario: the balance assumes a full exchange at every delivery until someone corrects one. «Χωρίς πλήρη επιστροφή» fills only after a correction. The accountant with a pile of delivery slips has no queue «deliveries without a slip» to work through.
- Confidence: confirmed in code; the trigger was read from its file, not from the live base.
- Redesign: «assumed» is a visible state of a delivery, with its own count in «Θέλουν δράση».

### F23. The card of a settled party cannot be opened
- Where: `PL:632` (only parties with a balance or a pending row are listed), `PL:662` (the only entry to the card), `PL:503-506` (a group head in «Κινήσεις» only folds).
- Scenario: a client returned everything last month and asks for a statement. He is in no list of «Υπόλοιπα», and no other control opens his card.
- Confidence: confirmed.
- Redesign: any party name on the page opens its card, and «Υπόλοιπα» has a search that finds settled parties.

### F24. No manual loading or delivery, and no order on a manual movement
- Where: `PL:1757-1758`, `PL:1855-1869`.
- Scenario: the automatic row was not created (F12) or was reversed (F7), or the exchange happened for an order entered after the fact. She cannot write it as what it is; a manual return is not tied to the order, so the week view and the order never show it.
- Confidence: confirmed.
- Owner rule: this is exactly the after-the-fact entry the rule protects.
- Redesign: «Νέα κίνηση» can start from an order and a stop, with a warning when that stop already has a live movement.

### F25. The week covers one kind of work and cannot leave the screen
- Partner, no-order and national movements are three count lines with nothing to open (`PW:451-459`).
- No export or print of the week or of «Κατάσταση εβδομάδας» (`PL:1029-1033` offers only the balances while the week is open).
- «Ελέγχθηκε» can be set on a week that still has pending rows and missing records, with no warning; the list of missing stops is always sent empty (`PW:340`; rules at `W:3428-3435`).
- Confidence: confirmed.
- Owner rule: for the mark, a warning with the two counts, not a refusal.
- Redesign: the three lines open their lists; the week has a paper; the mark states what was still open when it was set.

### F26. Confirm step: no way to fix the day or the point, no warning on a future day
- Where: `PL:1314-1349`.
- Scenario: the slip is dated a day later than the row, or the pending row is dated next week and she confirms it today by habit (Enter). Neither can be corrected or is questioned.
- Confidence: confirmed.
- Owner rule: applies; warn, do not block.
- Redesign: the day is editable at confirmation and a day after today asks once.

---

## What was read, what was not

Read in full: `modules/pallet_ledger.js` (lines 1–1890; the stylesheet after that was skipped), `modules/pallets_week.js` (1–736), `core/pallet-feed.js`, the pallets handler of `worker/src/index.js` (7093–7780) with its rule texts (3424–3456) and `dbSelect` (160–175), the ORDERS and ORDER STOPS label maps (grep of every label the page uses, both quoted and unquoted forms), the catalog section C-5, and the format models in `findings/`.

Read in part: `worker/migrations/003`, `006`, `107`, `108` (only the lines that define pending counts, the missing-delivery list and what the delivery trigger writes); the call sites of the feeders in `orders_intl.js`, `orders_natl.js`, `daily_ops.js`, `weekly_intl.js`, `core/order-sync.js` (by grep).

Not read: `modules/pallet_upload.js` (not called by the page, per the catalog), `OrdersWeekView` / `OrdersCommon` / `WI4` internals the week borrows, `core/api.js` caching, the 104 week-check functions, the route diagram. Nothing was run, no database or network service was queried, nothing was tested against a live system. Permissions and security were left out on purpose.
