# Πίνακας Ελέγχου, Πίνακας Διοίκησης, «Η Απόδοσή μου»: έλεγχος λειτουργιών των σημερινών σελίδων (15/11/2026)

Ένας ανεξάρτητος έλεγχος διάβασε τον κώδικα των τριών σελίδων και των κοινών μετρήσεων. **Όλα τα παρακάτω είναι ευρήματα από ανάγνωση κώδικα. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο Worker που τρέχει.** Κάθε εύρημα έχει βαθμό βεβαιότητας. Τίποτα δεν διορθώθηκε εδώ.

Οι τρεις σελίδες μόνο διαβάζουν. Δεν γράφουν τίποτα στη βάση· ό,τι «αποθηκεύουν» (κλήσεις πελατών, στόχος εσόδων, προσωπικοί στόχοι) μένει μόνο στον browser του ίδιου υπολογιστή. Άρα ο κανόνας του owner για τις διορθωτικές κινήσεις δεν αλλάζει κάτι εδώ: το πρόβλημα αυτών των σελίδων δεν είναι τι επιτρέπουν, είναι **τι αριθμό δείχνουν και αν αυτός ο αριθμός είναι αληθινός**.

## Σύνοψη

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Στον Πίνακα Διοίκησης πέντε πλακίδια δεν μπορούν ποτέ να δείξουν αληθινό αριθμό.** Η «Ποιότητα» (γράφημα θερμοκρασίας) μένει πάντα κενή. Οι «Top 5 Πελάτες» βγάζουν μία μόνο γραμμή «Unknown» με 100%. Τα «Κενά χιλιόμετρα» είναι πάντα εκτίμηση με σταθερά νούμερα (50, 600, 1.200 χλμ), όχι μέτρηση. Το «Περιθώριο συνεργατών» και οι «Ζημιογόνες διαδρομές» δεν γεμίζουν ποτέ, γιατί ζητούν στοιχεία κόστους που αυτή η σελίδα δεν μπορεί να διαβάσει. (F12–F16)
2. **Τα «Αδρανή τιμολόγια» δεν κοιτούν το κουτάκι «Τιμολογήθηκε».** Κάθε παραδομένο φορτίο μετριέται ως ατιμολόγητο για πάντα, όσα κι αν έχει περάσει το λογιστήριο. Το «Όλα τιμολογημένα» δεν μπορεί να εμφανιστεί. Το ίδιο λάθος υπάρχει στην «Απόδοσή μου» του λογιστηρίου. (F17, F22)
3. **Στην «Απόδοσή μου» οι τέσσερις κάρτες του λογιστηρίου είναι όλες ψεύτικες:** «Τιμολογημένα» πάντα 0%, «CMR στο αρχείο» πάντα 0%, «Ανεξόφλητα» πάντα 0 € και πράσινο (η σελίδα δεν ζητά καν την τιμή), «Ισοζύγιο παλετών» πάντα 0 και πράσινο (δεν διαβάζει το ισοζύγιο). Η δεύτερη λογίστρια, που κάνει παλέτες και έξοδα, βλέπει τις κάρτες της τιμολόγησης. (F22–F25)
4. **Η «Συνέπεια παράδοσης» του Πίνακα Διοίκησης μετρά με την ημέρα που πατήθηκε το κουμπί «Παραδόθηκε»,** κανόνας που ο owner απέρριψε στις 30/8 (μια παράδοση Κυριακής σημειώνεται Δευτέρα και βγαίνει «καθυστέρηση»). Ο Πίνακας Ελέγχου μετρά σωστά, με την κρίση του dispatcher. Οι δύο σελίδες δείχνουν διαφορετικό ποσοστό για το ίδιο πράγμα. (F18)
5. **Ο Πίνακας Διοίκησης δεν μετρά την τελευταία ημέρα κάθε περιόδου** (Κυριακή της εβδομάδας, τελευταία του μήνα, σήμερα στο «από αρχή έτους»), και μετρά στα έσοδα και τα ακυρωμένα φορτία. (F19, F20)
6. **Ο Πίνακας Ελέγχου αγνοεί τη δουλειά των εθνικών.** Φορτηγό που δουλεύει εθνικά όλη την εβδομάδα φαίνεται «διαθέσιμο για ανάθεση» και ρίχνει το ποσοστό «Φορτηγά σε δρόμο». Τα εθνικά φορτία διαβάζονται και δεν χρησιμοποιούνται πουθενά. (F1)
7. **Στον Πίνακα Ελέγχου η «Συμμόρφωση» μπορεί να γράφει 100% δίπλα σε λίστα με ληγμένα έγγραφα:** η μπάρα μετρά μόνο ΚΤΕΟ, ΚΕΚ και ασφάλεια φορτηγών, και θεωρεί έγκυρο ό,τι δεν έχει ημερομηνία· η λίστα δείχνει και ταχογράφο, ρυμούλκες και «άγνωστο». (F27)
8. **Ό,τι δεν διαβάστηκε δεν λέγεται.** Στην «Απόδοσή μου», αν δεν φορτώσουν τα εθνικά ή η συντήρηση, οι κάρτες αλλάζουν τιμή χωρίς καμία ένδειξη (η ένδειξη υπολογίζεται και δεν εμφανίζεται ποτέ). Στον Πίνακα Ελέγχου, αν αποτύχει η ανάγνωση των εθνικών που δεν χρησιμοποιείται καν, πέφτει όλη η σελίδα. (F28, F29)
9. **Κάρτες που λένε το αντίθετο από τον τίτλο τους ή είναι πάντα πράσινες:** «Κρίσεις που λύθηκαν» μετρά τις ανοιχτές επείγουσες βλάβες και είναι πάντα πράσινη· «Έλεγχος πλάνου» πάντα 0· «Πρόγραμμα συντήρησης» 0% μόλις κλείσει έστω μία εντολή· οι «Κλήσεις αγωνίας πελάτη» γράφουν «0» πράσινο όταν απλώς κανείς δεν καταχώρησε. (F26, F30, F31)
10. **Η επιλογή εβδομάδας στην «Απόδοσή μου» αλλάζει μόνο τις μισές κάρτες.** Η τάση, οι συγκρίσεις και τα κενά χιλιόμετρα μένουν στην τρέχουσα εβδομάδα· πολλές κάρτες μετρούν «από πάντα» κάτω από τίτλο «Εβδομάδα Ν». Το CSV βγάζει όλες τις παραγγελίες όλων των εβδομάδων, με κενή την πρώτη στήλη. (F6, F7, F32)
11. **Συγκρίσεις που δεν συγκρίνουν ίδια πράγματα:** στον Πίνακα Ελέγχου η «Συνέπεια 30 ημερών» συγκρίνεται με την προηγούμενη εβδομάδα· στον Πίνακα Διοίκησης ο στόχος ζητείται «μηνιαίος» και συγκρίνεται με εβδομάδα, τρίμηνο ή έτος. (F33, F8)
12. **Η λέξη «ISO» δίπλα στην εβδομάδα του Πίνακα Ελέγχου είναι λάθος** (η εβδομάδα είναι η δική μας, Σάββατο–Παρασκευή), ενώ ο Πίνακας Διοίκησης μετρά πράγματι Δευτέρα–Κυριακή. Τρεις σελίδες, δύο ορισμοί εβδομάδας. (F34)
13. **Καμία από τις τρεις σελίδες δεν ανοίγει το ίδιο το φορτίο ή το όχημα.** Κάθε γραμμή οδηγεί σε γενική λίστα· το κουμπί «Νέα παραγγελία» ανοίγει τη λίστα παραγγελιών, όχι φόρμα. (F9, F10)

### (β) Τι δεν κρίθηκε από τον κώδικα

- Πόσες παραγγελίες, τοποθεσίες και οχήματα έχουν τα στοιχεία που χρειάζεται κάθε μέτρηση (συντεταγμένες, κρίση παράδοσης, ημερομηνίες εγγράφων). Ο κώδικας λέει τι θα συμβεί αν λείπουν, όχι πόσο συχνά λείπουν.
- Αν τα σκέλη σπασμένων παραγγελιών έχουν δική τους τιμή· αν ναι, ο Πίνακας Διοίκησης τα μετρά δύο φορές στα έσοδα (F21).
- Τι ακριβώς απαντά ο Worker όταν του ζητηθεί ο πίνακας κόστους δρομολογίων που δεν γνωρίζει (η σελίδα το χειρίζεται ως «δεν φόρτωσε»).
- Αν το όνομα χρήστη που κρατά η εφαρμογή είναι με ελληνικά ή λατινικά γράμματα· από αυτό εξαρτάται αν οι προσωπικοί στόχοι εμφανίζονται μετά την αποθήκευση (F35).
- Ποιος ανοίγει στην πράξη κάθε σελίδα και πόσο συχνά· δεν υπάρχει καταγραφή στα έγγραφα.

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Πίνακας Διοίκησης, γραμμή ώρας πάνω δεξιά: αναμένεται μόνιμα «⚠ δεν φόρτωσε: κόστος δρομολογίων» (F16).
- Πίνακας Διοίκησης, «Top 5 Πελάτες»: αναμένεται μία γραμμή «Unknown» (F13).
- «Η Απόδοσή μου» με λογαριασμό λογιστηρίου: τέσσερις κάρτες 0 (F22–F24).
- Πίνακας Ελέγχου, «Διαθέσιμα για ανάθεση»: αν οι πινακίδες που δείχνει δουλεύουν εκείνη την εβδομάδα σε εθνικά (F1).
- Πίνακας Ελέγχου στις πρώτες εβδομάδες του έτους: η τάση τεσσάρων εβδομάδων και η σύγκριση (F36).
- Προσθήκη προσωπικού στόχου στην «Απόδοσή μου»: εμφανίζεται μετά την αποθήκευση; (F35)
- Πίνακας Ελέγχου ανοιχτός για ώρα: κάθε 5 λεπτά η σελίδα ξαναζωγραφίζεται από την αρχή και χάνεται η θέση κύλισης (F37).

---

# Detailed findings (English)

Conventions: `dash` = `modules/dashboard.js`, `ceo` = `modules/ceo_dashboard.js`, `perf` = `modules/performance.js`, `met` = `core/metrics.js`, `worker` = `worker/src/index.js`. Confidence: **confirmed** (follows from code and the Worker map), **likely** (follows from code plus one stated assumption), **live** (needs a look in the running app).

Facts used throughout, checked in the Worker map (both quoted and unquoted key forms grepped inside each table block):

| Label read by the pages | Table | In the map? |
|---|---|---|
| `Temp Graph Sent`, `Dead KM`, `Loaded KM`, `Total KM`, `Client Name`, `Client Summary`, `Order Number`, `CMR Received`, `CMR Archived` | ORDERS (`worker:1317-1560`) | no |
| `Invoiced`, `Price`, `Status`, `Delivery Performance`, `Actual Delivery Date`, `Week Number`, `Partner Rate`, `Is Partner Trip`, `Matched Import ID`, `CMR Photo Received`, `Client Notified`, `Reference` | ORDERS | yes |
| `Price`, `Cost`, `Total Cost`, `Week Number` | NATIONAL LOADS (`worker:1847-2025`) | no |
| `Date`, `Date Completed` | MAINT_REQ (`worker:1141-1164`) | no (`Date Reported` yes) |
| `Total Cost` | MAINT_HISTORY (`worker:1105-1140`) | no (`Cost`, `Date` yes) |
| table ids `TRIP_COSTS`, `METRICS_SNAPSHOTS` (`config.js:51,83`) | — | not in the Worker table map at all |

Date filters are strict: `IS_AFTER` → `gt`, `IS_BEFORE` → `lt` (`worker:2290-2299`). No page in scope writes to the database; the only "saves" are three `localStorage` values (`ceo:695,708`; `perf:1002`).

## Question 1 — what the selectors, filters and lists offer

**F1. Fleet figures and the "available trucks" list ignore national work.** `dash:138-143`, `dash:451-455`, `met:379-389`; national loads fetched and discarded at `dash:68-75`.
Scenario: a truck runs national loads all week and carries no international order. The dispatcher opens the page at 05:30: its plate is listed under «ΔΙΑΘΕΣΙΜΑ ΓΙΑ ΑΝΑΘΕΣΗ», «ΦΟΡΤΗΓΑ ΣΕ ΔΡΟΜΟ» is lower by one truck, and the score's first bar counts only international orders. Confidence: confirmed (the national v5 board is not read at all).
Redesign: one definition of "truck is busy this week" that includes national work, or label the figure «διεθνή» and drop the "available" list until it can be true.

**F2. «Αναμονή ανάθεσης» is cut by a 30-day loading window and says so only in developer words.** `dash:63-69`, `dash:234`, `dash:439`.
Scenario: an order entered after the fact with a loading date five weeks back and still without truck or partner does not appear; the header reads «N ανοιχτές … · ORDERS 30 ημ». Confidence: confirmed.
Redesign: state the window in plain words next to the count and keep older open items reachable by one link.

**F3. Departures and deliveries list every order of today and tomorrow, cancelled ones included, in no meaningful order.** `dash:205-223`, `dash:546-553`, `dash:576-580`.
Scenario: a cancelled order loading today shows among «Αναχωρήσεις» with the word «ΑΚΥΡΩΘΗΚΕ»; the afternoon summary «x/y φόρτωσαν σήμερα» counts it in y. Rows inside a day are sorted by an hour that never exists (date columns carry no time), so the order is the fetch order. Confidence: confirmed.
Redesign: leave cancelled out of the count; sort by status then truck; do not reserve a slot for an hour the data does not have.

**F4. CEO period control offers four periods but no dates, and its week is Monday–Sunday.** `ceo:43-65`, `ceo:865-870`.
Scenario: the owner picks «Εβδομάδα» on a Saturday; the boards already show the new Saturday–Friday week, this page shows the week that started last Monday. Nothing on screen says which days are counted or what "previous" means for the arrows. Confidence: confirmed.
Redesign: one week definition for the whole app; print the date range and the comparison range next to the control.

**F5. «Κρίσιμα — επόμενες 48ω» has no lower bound and ignores assignment.** `ceo:153`, `ceo:393-397`; compare `met:135-149`.
Scenario: an order delivered three weeks ago that nobody stamped «Παραδόθηκε» counts as "critical in the next 48 hours" every day, in red; an assigned order on its way counts too. Confidence: confirmed in code; how many such orders exist: live.
Redesign: two plain counts — "due in two days without truck or partner" and "past delivery day, not stamped" — each opening its list. Not a refusal anywhere: a late stamp is a normal after-the-fact correction.

**F6. Week picker in «Η Απόδοσή μου»: eight options, nine positions, and it moves only part of the page.** `perf:1038-1051` (allows −8; the select is built for 0…−7), `perf:261-263`, `perf:596`, `perf:715-721`, `perf:286`.
Scenario: the user steps back to last week: the four cards recompute, but the trend bars, the arrows and the empty-km card still belong to the current week (empty km turns «—» because stops were fetched only for the current week). At the ninth step back the dropdown shows no selection. Week = current number plus offset, no year: in January the list offers week 0 and negative weeks. Confidence: confirmed.
Redesign: one period control that every block obeys, or no control.

**F7. Mixed periods under one «Εβδομάδα N» title.** `perf:302-309` (on-time: every order ever loaded), `perf:420-423`, `perf:425-436`, `perf:438-442`, `perf:526-531` (all-time), versus `perf:289` (selected week). «ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΔΟΣΕΙΣ» is the last ten of all orders, not of the week or of the user (`perf:808-812`).
Scenario: the dispatcher switches to last week; «ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ» does not move, because it never was a weekly number. Confidence: confirmed.
Redesign: print the period on each figure; group figures by period.

**F8. Revenue target is asked as monthly and applied to any period.** `ceo:684`, `ceo:325-332`, `ceo:694`.
Scenario: the owner enters a monthly target, then looks at «YTD»: the bar reads several hundred percent "of target"; on «Εβδομάδα» about a quarter. Entering 0 or clearing the box does nothing, so a target cannot be removed. Confidence: confirmed.
Redesign: a target belongs to a period; store it with its period, shared (F38).

**F9. Every row and tile leads to a generic list, never to the thing itself.** `dash:567`, `dash:443`, `dash:463`, `dash:589`; `ceo` has no click target at all; `perf:808-834` rows are inert.
Scenario: the dispatcher clicks a departure → the weekly board opens at its default position; clicks an alert that says «άγνωστο · συμπλήρωση ›» → the full truck list opens, not the vehicle or the field; clicks a waiting order → the orders list filtered to direction and «Προς ανάθεση», where he looks for the row again. Confidence: confirmed.
Redesign: a row opens its own record; a tile opens the list already filtered to what it counted.

**F10. «Νέα παραγγελία» opens the orders list, not a form, and shows to everyone.** `dash:348` (plain navigation, no role check in the module).
Scenario: a view-only user sees the primary button; a dispatcher presses it and lands on a list where he must start a new order again. Confidence: confirmed.
Redesign: the button does what it says or is renamed; shown only to those who enter orders.

**F11. Card sets in «Η Απόδοσή μου» are chosen by hard-coded login names.** `perf:94-145`, `perf:645`.
Scenario: six logins have their own four cards; anyone else gets a role default. A second accountant whose work is pallets and expenses gets the invoicing set; a new dispatcher gets the planner's set; an unknown role gets the owner's set. Confidence: confirmed.
Redesign: cards follow the job (a setting on the person), not a name in code.

## Question 2 — what is read wrong, lost or overwritten

**F12. «ΠΟΙΟΤΗΤΑ — επιβεβαιωμένη φρεσκάδα» can never have a value.** `ceo:484-489`, `ceo:262-268`; label absent from the ORDERS map.
Scenario: the owner opens the page any day: the second promise shows «—» with a badge asking for a field to be added. Confidence: confirmed.
Redesign: remove the card until a real source exists, or show "not measured" once, small.

**F13. «Top 5 Πελάτες (Revenue)» is one row «Unknown» at 100 %.** `ceo:552-565` reads `Client Name`, which ORDERS does not carry (the client is a link).
Scenario: any period with orders: the table shows one row, the whole revenue, 100 %. Confidence: confirmed; live look to see it.
Redesign: group by the client link and show the company name; a row opens that client's orders for the period.

**F14. «Κενά χιλιόμετρα» on the CEO page is always a constant-based estimate; its sparkline is all zeros.** `ceo:523-550`, `ceo:656-669`, `ceo:347-349`.
Scenario: with 10 matched and 5 unmatched exports the tile shows 3,500 km and 19.4 % whatever the trucks actually drove; the small trend line under it is flat at zero because it reads only the three missing fields. Meanwhile the dashboard measures real distances between stops (`dash:498-533`) and the performance page a third way (`perf:358-383`). Confidence: confirmed.
Redesign: one measured figure, shown identically on every page, with "N of M pairs measured".

**F15. «Περιθώριο συνεργατών» is hidden behind a table it does not use.** `ceo:427-431`, `ceo:603-611`.
Scenario: sale price and partner fee are both on the order and the margin is computed, but the tile prints «N/A · Trip Costs ?» because it shows the value only when the cost-table read returned rows — and that read cannot succeed (F16). Confidence: confirmed.
Redesign: show the computed margin with its sample ("N partner loads with fee, M without").

**F16. «Top 3 Ζημιογόνες Διαδρομές», the loss banner and the loss line of the summary can never show data; the time line carries a permanent warning.** `ceo:146`, `ceo:183-190`, `ceo:449-458`, `ceo:613-634`; the table id is not in the Worker map.
Scenario: every load ends with «Ενημερώθηκε HH:MM · ⚠ δεν φόρτωσε: κόστος δρομολογίων» in amber and a table reading «Απαιτείται Trip Costs data». A warning that is always on is no longer read — a real failure of the comparison or maintenance read sits in the same line and looks the same. Confidence: confirmed that the read cannot return rows; exact response: live.
Redesign: take trip results from the trip-costs page's own source or drop the block; keep the warning line for real failures only.

**F17. «Αδρανή Τιμολόγια» ignores the «Τιμολογήθηκε» tick.** `ceo:586-596`, `ceo:418-420`, summary `ceo:801-803`; `Invoiced` is mapped; nothing writes status «Invoiced».
Scenario: the accountant ticks twenty delivered orders as invoiced; the owner's tile still counts all twenty as idle money and stays red; «Όλα τιμολογημένα» cannot appear while any delivered order exists. Confidence: confirmed.
Redesign: use the invoicing page's own rule ("ready to invoice" / "waiting"; `met:327-351` already delegates to it) and open that list.

**F18. CEO «ΤΑΧΥΤΗΤΑ» / «Συνέπεια παράδοσης» judges by the stamp date first.** `ceo:468-474`, sparkline `ceo:644-650`; the rule and why it was rejected: `core/entity.js:2565-2577`; the dashboard uses the dispatcher's mark only (`dash:145-149`).
Scenario: a Sunday delivery is stamped on Monday morning; the dashboard counts it on time (the dispatcher's mark), the CEO page counts it late because the stamp date is after the planned date. Same week, two percentages, the lower one on the owner's screen with the words «κάτω από στόχο». Confidence: confirmed in code (the date path wins whenever any delivered order of the period has both dates).
Redesign: one on-time definition (the dispatcher's mark, with "N judged, M not judged") everywhere.

**F19. The last day of every CEO period is not counted.** `ceo:67`, `ceo:102-103`, `ceo:126`, with strict `lt` (`worker:2295-2299`).
Scenario: «Μήνας»: the end bound is the last day of the month as a date and the filter is "before" → orders loading on that day are outside. «Εβδομάδα»: Sunday is outside. «YTD»: today is outside. The start is included only by accident (local midnight converted to the previous UTC date). Revenue, counts and every arrow are short by one day's orders. Confidence: confirmed in code for a date column; magnitude: live.
Redesign: periods defined as inclusive day ranges in one shared helper, printed on screen.

**F20. CEO revenue counts cancelled orders.** `ceo:519-521`, `ceo:330` (no status filter); also in «Top 5» and the target bar.
Scenario: a priced order is cancelled; «Έσοδα vs στόχος» still includes its price. Confidence: confirmed (whether cancelled international orders exist in practice: not judged).
Redesign: revenue excludes cancelled and says which states it includes.

**F21. The CEO page does not exclude split legs.** No `Parent Order` filter anywhere in `ceo` (`dash:82-84`, `perf:244-246` and `met:41-47` all have one).
Scenario: an order split in two legs counts as three rows in «φορτία», assignment %, partner %, Veroia Switch % and driver load. Confidence: confirmed for counts; for money only if a leg carries a price — not judged.
Redesign: the same pre-filters on every page (one shared "orders for counting" source).

**F22. «ΤΙΜΟΛΟΓΗΜΕΝΑ» is always 0 %.** `perf:420-423`; the tick `Invoiced` is neither requested (`perf:189-197`) nor read.
Scenario: the invoicing accountant opens her page after a month of ticking invoices: 0 %, red, target 100 %. Confidence: confirmed.
Redesign: invoiced ÷ delivered from the tick, for the selected period, opening the "to invoice" list.

**F23. «ΑΝΕΞΟΦΛΗΤΑ» is always 0 EUR and green.** `perf:526-531` sums `Price`, but `Price` is not in the requested field list (`perf:189-197`) and the Worker returns only requested fields. With target 0 and "lower is better", 0 paints as success. Even with the price it would count every delivered order regardless of the tick, and "delivered" is not "unpaid".
Scenario: the accountant sees «0EUR» in green whatever is waiting. Confidence: confirmed.
Redesign: never call anything «ανεξόφλητα» — the app knows invoiced, not paid. Show "delivered, not yet invoiced" with amount, from the invoicing rule.

**F24. «CMR ΣΤΟ ΑΡΧΕΙΟ» is always 0 %; «ΙΣΟΖΥΓΙΟ ΠΑΛΕΤΩΝ» is always 0 and green.** `perf:513-524` (label not mapped → falls to the status proxy); `perf:533-537` reads a browser value that nothing writes; the pallet ledger is not read.
Scenario: the pallet balance with partners is several hundred pallets; the card reads 0 with a full green bar. Confidence: confirmed.
Redesign: read the ledger's own balance (the pallets page has the rule) or remove the card.

**F25. National cards: on-time 0 % in red before the national start day, margin 0 % or "outside".** `perf:385-418`, `perf:491-511`; NATIONAL LOADS has no price or cost label; nationals never get status «Delivered».
Scenario: the national dispatcher's four cards are a national on-time that depends on a status nobody writes, a plan-review flag nobody can set, a "crises solved" count that counts open breakdowns, and a margin that by rule is not shown to him. None is a usable number. Confidence: confirmed in code; what the v5 branch shows after the start day: live.
Redesign: OWNER DECISION on what a national dispatcher's figures are; until then, no cards rather than four empty ones.

**F26. Fleet cards.** «ΠΡΟΓΡΑΜΜΑ ΣΥΝΤΗΡΗΣΗΣ» is 0 % as soon as one work order is done and 100 % when none is (`perf:477-489` needs a completion date; neither candidate label is mapped or requested, `perf:222`). «ΕΛΕΓΧΟΣ ΠΛΑΝΟΥ» is always 0 (`perf:539-542`, no writer). «ΚΡΙΣΕΙΣ ΠΟΥ ΛΥΘΗΚΑΝ» counts OPEN urgent requests and is always green (`perf:544-550`, target 0 not inverted). «ΑΚΙΝΗΣΙΑ ΣΤΟΛΟΥ» is open requests × 24, not hours (`met:442-445`).
Scenario: the fleet manager closes his first work order on time; the card drops from 100 % to 0 %. Confidence: confirmed.
Redesign: figures a fleet manager acts on — expired today, expiring in 30 days, open work orders by age — each opening its list.

**F27. «Συμμόρφωση» can read 100 % beside a list of expired or unknown documents.** `met:431-440` (trucks only; KTEO, KEK, insurance; a blank date counts as valid) versus `dash:253-286` (adds tachograph, trailers and «άγνωστο»).
Scenario: every truck has the three dates in order, one tachograph is expired, two trailers have no insurance date: the bar reads «Συμμόρφωση 100% (N/N)» and the alert card on the same page lists three vehicles. Confidence: confirmed.
Redesign: one rule for "vehicle in order" used by the bar and the list; unknown is not valid.

**F28. A failed side read on «Η Απόδοσή μου» changes numbers silently.** `perf:236-239` fills a list of failed sources; no other line reads it. The stops read fails to the console only (`perf:276`).
Scenario: the maintenance read fails: «ΕΝΤΟΛΕΣ ΠΟΥ ΕΚΛΕΙΣΑΝ» shows 100 %, «ΑΚΙΝΗΣΙΑ» 0 h green; nothing says a source is missing. The stops read fails: empty km reads «—» with the reason "no pair with coordinates", which is false. Confidence: confirmed.
Redesign: a figure whose source failed shows "not read — retry", never a value.

**F29. The dashboard falls over if an unused read fails.** `dash:68-74`: national loads are fetched in the same group as the orders, without the soft wrapper, then discarded.
Scenario: that read errors once: the whole page shows «Το dashboard δεν φόρτωσε», although nothing on it uses national loads. Confidence: confirmed.
Redesign: read what the page shows (or use national loads — F1).

## Question 3 — what the pages do not tell the user

**F30. «ΗΡΕΜΙΑ — μηδέν αγωνία πελάτη» shows a green zero when nothing was entered.** `ceo:491-497`, `ceo:279-288`.
Scenario: a new week starts, nobody typed a count: the ring is green, «0 κλήσεις», goal met. Confidence: confirmed.
Redesign: "not entered this week" is a state of its own; if the count matters, it is a shared record with who and when.

**F31. Other numbers that are structurally empty or constant.** Goal «ΗΜΕΡΕΣ ΧΩΡΙΣ ΛΗΓΜΕΝΟ ΕΓΓΡΑΦΟ» is always «—» (`dash:428-429`); «4-εβδ. μέσος: N/A%» prints when there is no weekly data (`ceo:387`, `ceo:672-675`); unknown empty km is scored as a perfect 100 inside the performance weekly score (`perf:561-565`) while the dashboard gives a partial score with an asterisk (`dash:173-188`) and the trend uses a fixed 75 (`perf:602`) — the "same" weekly score has three values. Confidence: confirmed.
Redesign: one score function with one rule for a missing part; a goal that cannot be measured is not shown.

**F32. The CSV is not what the screen shows.** `perf:1062-1080`.
Scenario: the user is on last week and presses «Εξαγωγή CSV»: the file holds every order ever loaded, first column «Order No» empty on every row (it reads a label that does not exist; the reference is not requested either), headers in English, no figure of the page in it. Confidence: confirmed.
Redesign: export what is on screen for the chosen period, with the names on screen — or no export on a personal page.

**F33. «ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ · 30 ΗΜ» is compared with last week's figure.** `dash:148-149`, `dash:409`.
Scenario: 30-day on-time is 92 %, last week's was 100 % from three judged deliveries: the tile prints a drop of 8 points against last week. Confidence: confirmed.
Redesign: compare like with like, and only above a minimum sample.

**F34. Week wording.** `dash:345`, `dash:387` print «ISO», but the number comes from the shared Saturday–Friday week (`core/utils.js:371-373`); `ceo:87-93` computes a true ISO week and a Monday–Sunday range; the call count is stored under that ISO week (`ceo:494`).
Scenario: on a Saturday the dashboard and the CEO page show different week numbers, and the dashboard's label names the wrong system. Confidence: confirmed.
Redesign: one week, one label, with its dates.

**F35. Personal goals are read with one key and written with another.** Read `perf:861-862` (spaces → `_`), write `perf:992-996` (every character outside A–Z, a–z, 0–9 → `_`). Ticking a goal does not redraw (`perf:1021-1028`).
Scenario: if the stored display name has Greek letters or punctuation, the user types a goal, presses «+», the page reloads and still says «Δεν έχουν οριστεί στόχοι»; after fifty attempts it says the list is full. A tick leaves the strike-through and «done/total» stale. Confidence: confirmed for the mismatch; whether names are Latin: live.
Redesign: if goals stay, they are shared records of the person; otherwise remove the block.

**F36. First weeks of the year.** `dash:120` (weeks below 1 dropped), `perf:604`, `met:193-209`, `ceo:652`, `ceo:668` (week labels sorted as text, no year); week number without year over all orders (`perf:205`, `perf:289`).
Scenario: in the first week of January the dashboard's four-week trend has one point and no comparison; the CEO sparklines put week 9 after week 52 and week 10 before week 9; performance mixes in the same week number of the previous year once a second year of data exists. Confidence: confirmed (computed, not run).
Redesign: weeks are (year, week) everywhere, from the shared week helper.

**F37. Auto-refresh repaints the whole dashboard and may show an old picture with a new time.** `dash:58`, `dash:475-479`; cache `core/api.js:24-26,733-742`.
Scenario: the dispatcher is reading the fleet alerts at the bottom; at the five-minute tick the page becomes a skeleton and comes back at the top. «ενημερώθηκε HH:MM» is the time of the repaint; reference data (trucks, trailers, locations) may come from a longer-lived cache. Confidence: confirmed for the repaint; cache age per table: likely.
Redesign: refresh values in place; show the age of the oldest source, not the clock.

**F38. Three things the user "saves" exist only in that browser.** `ceo:495,679,695,708`; `perf:1002`.
Scenario: the owner sets the revenue target at the office and opens the page elsewhere: «Πατήστε ✎ για στόχο». The weekly call counts have no history view at all. Confidence: confirmed.
Redesign: shared settings and shared weekly entries, or remove.

**F39. Developer words on screen.** `dash:372,387,399,412,439,450,469,486`; `ceo:19,213-216,343,396,431,457,778,785-799,894,914`; `perf:172`. Loads are named «EXP / IMP + reference» (`dash:237-239`), against the plain-messages rule.
Scenario: the dispatcher reads a function name and weights under the score, table names under every tile; the owner reads «Έλεγχος Airtable filters», «Trip Costs ?», «Απαιτείται πεδίο …». Confidence: confirmed.
Redesign: plain work words; a load is "client, loading → delivery · day".

**F40. Same word, different numbers across the three pages.** Fleet use: busy trucks ÷ active (`met:379-389`) vs a truck-days formula (`perf:316-335`). Assigned: truck or partner (`met:449-459`) vs truck only (`ceo:577-584`, `perf:337-340`). «Έσοδα»: all period orders (`ceo:330`) vs delivered only (`ceo:414`), on one page. Expired document: before today (`met:436`) vs today included (`perf:470`). Partner trip: partner link (`ceo:511`) vs a tick (`perf:446`).
Scenario: the owner compares «ΑΞΙΟΠΟΙΗΣΗ ΣΤΟΛΟΥ» on his performance page with the dashboard goal of the same name: different numbers, no explanation. Confidence: confirmed.
Redesign: a short list of company figures, each with one definition and one name, shown wherever needed.

## Question 4 — what is missing for the job

**F41. No page for "what must I do now" per job.** The dashboard is the landing page of all five roles with identical content (`app.html:267`; no role branch in `dash`). The accountants find nothing about invoicing, pallets or expenses; the national dispatcher no national figure; the fleet manager only the alert card; warehouse nothing about the ramp. Confidence: confirmed.

**F42. No way from a number to its rows** on the CEO and performance pages (F9); no print or export of the management view; no visible date range and no "compared with" label (`ceo:829-840`).

**F43. Nothing on «Η Απόδοσή μου» is about the person.** Every figure is company-wide under the user's name (`perf:283-592`); card descriptions exist in code and are not shown (`perf:104-135`), so nobody can tell what a card counts.

**F44. National work, pallets, expenses and trip results are absent from the management view** although the app holds them. Money shown is sale price only (locked until the P&L phase — keep).

**F45. No "how much was measured" on the CEO and performance pages.** Several figures depend on fields being filled (coordinates, the dispatcher's on-time mark, document dates). The dashboard says "N without coordinates / N not judged" (`dash:398`, `dash:411`); the other two do not, so a small sample looks like a result.

## Kept as correct (do not "fix")

- "Too early" rule: no percentage with zero orders, no verdict under five (`dash:122-135`, `perf:296-299`).
- Without assignment = no truck and no partner; loose stock pieces are not waiting work (`dash:20-21`, `dash:234`).
- On-time from the dispatcher's mark only (`dash:145-149`).
- Deadline in whole days (`dash:30-43`). One row per vehicle in alerts, nothing cut (`dash:288-302`).
- Error states that say "this does not mean there are no orders" (`dash:481-489`, `ceo:212-218`, `perf:161-175`).
- CEO page owner-only; dispatcher sees no margin (`ceo:18-21`); sale price as the only money field.

## What was read, and what was not

Read in full: `modules/dashboard.js` logic and render (1–595; the style block after it skimmed). Read in part and checked against the catalogue: `modules/ceo_dashboard.js` (1–240 loader, 240–460 render, 460–720 calculators, 740–850 lists, summary, helpers; the shell markup 855–1134 taken from the catalogue), `modules/performance.js` (84–313, 414–452, 524–580, 594–690, 700–760, 806–872, 990–1082; other lines from the catalogue), `core/metrics.js` (1–70, 377–460, 518–526; the rest from the catalogue). Supporting: `core/api.js` (fetch, cache, paging), `core/utils.js` (week number, soft fetch), `core/entity.js:2565-2577`, `modules/orders_catalog.js:376-379`, `config.js` (table ids, permissions), the Worker table-map blocks for ORDERS, NATIONAL LOADS, MAINT_REQ, MAINT_HISTORY, TRUCKS, DRIVERS and the filter translator (`worker:2225-2320`). Catalogue sections B, C8 and E2 §1, §2, §4 of `catalog/E-shell-dashboards-people.md`.

Not read: `modules/metrics_audit.js`, `assets/style.css`, the national v5 helper used by performance, database rules, the Worker's request handlers beyond the map and the filter translator. Nothing was run; no database, network or live app was touched.
