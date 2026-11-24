# Στόλος και Συντήρηση: έλεγχος λειτουργιών της σημερινής εφαρμογής (15/11/2026)

Σελίδες: Φορτηγά, Ρυμούλκες, Συνεργεία, Επισκόπηση Στόλου, Εντολές Εργασίας, Λήξεις Εγγράφων, Ιστορικό Service, Ιστορικό Φορτηγών / Ρυμουλκών.

**Όλα τα παρακάτω είναι ευρήματα από ανάγνωση κώδικα. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο Worker που τρέχει. Τίποτα δεν διορθώθηκε εδώ.**

Κανόνας του owner που ισχύει για κάθε διόρθωση (15/11): κάποιες κινήσεις γράφονται εκ των υστέρων, ενώ η δουλειά ήδη έγινε. Άρα όπου γράφει «λείπει έλεγχος», η απάντηση είναι προειδοποίηση, ποτέ άρνηση.

## Σύνοψη

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Όχημα χωρίς καταχωρημένη ημερομηνία εγγράφου μετράει «σε ισχύ».** Αν σε ένα φορτηγό δεν έχει γραφτεί ποτέ ημερομηνία ΚΤΕΟ, οι Λήξεις, η Επισκόπηση, η λωρίδα στις Εντολές, η εκτύπωση λήξεων και οι προειδοποιήσεις στην ανάθεση δεν λένε τίποτα· το όχημα ανεβάζει και το ποσοστό συμμόρφωσης. Μόνο η σελίδα Φορτηγά έχει μετρητή «Χωρίς ημερομηνία», και δεν πατιέται. (F23)
2. **Το «✓ Ανανεώθηκε» δεν ανανεώνει τίποτα.** Γράφει μια ολοκληρωμένη εντολή-σημείωση, δεν ρωτά τη νέα ημερομηνία, η γραμμή μένει στη λίστα, και κάθε επόμενο πάτημα γράφει άλλη μία. Η ανανέωση ταχογράφου δεν εμφανίζεται ποτέ ως «ανανεώθηκε». (F11)
3. **Οι σελίδες Συντήρησης κρατούν δικό τους αντίγραφο του στόλου για όλη τη συνεδρία.** Αλλάζεις ημερομηνία ή απενεργοποιείς όχημα στα Φορτηγά, πας στις Λήξεις ή στις Εντολές και βλέπεις τα παλιά, χωρίς ένδειξη, μέχρι να πατήσεις «Ανανέωση». Το ίδιο με τις εντολές που έγραψε άλλος χρήστης. (F17)
4. **Το συνεργείο μιας εντολής χάνεται στην επεξεργασία.** Αν το συνεργείο έγινε ανενεργό ή είχε γραφτεί ως «Άλλο», η φόρμα ανοίγει χωρίς αυτό και η αποθήκευση το σβήνει. Το «Άλλο» δεν έχει κουτί για όνομα. (F3)
5. **Η σάρωση τιμολογίου δεν βάζει ποτέ την ημερομηνία του τιμολογίου** (το πεδίο έχει ήδη «σήμερα» και η σάρωση γεμίζει μόνο κενά), και γράφει «✓ Συμπληρώθηκε» ακόμη κι όταν δεν βρήκε όχημα ή συνεργείο. (F13)
6. **Ολοκληρωμένο service ρυμούλκας ζητά χιλιόμετρα**, ενώ η ρυμούλκα δεν έχει οδόμετρο. Ο χρήστης πρέπει να γράψει ψεύτικο αριθμό ή να αφήσει την εργασία «Σε εξέλιξη». Είναι άρνηση εκεί που ο κανόνας θέλει προειδοποίηση. (F14)
7. **Αλλαγή οχήματος σε εγγραφή service αφήνει και τον παλιό σύνδεσμο.** Αν μια εγγραφή φορτηγού διορθωθεί σε ρυμούλκα, εμφανίζεται στην καρτέλα και των δύο. (F12)
8. **Διόρθωση πινακίδας στα Φορτηγά αποσυνδέει τις εντολές εργασίας και τη σελίδα «Ιστορικό Φορτηγών»** από το όχημα: και οι δύο ταιριάζουν με το κείμενο της πινακίδας. Η καρτέλα οχήματος και η σελίδα ιστορικού μπορούν να δείχνουν διαφορετικά σύνολα για το ίδιο όχημα. (F20, F5)
9. **Διπλό πάτημα στο «Αποθήκευση»** γράφει δύο εντολές ή δύο εγγραφές service: το κουμπί δεν κλειδώνει όσο αποθηκεύει. (F15)
10. **Η σήμανση «θέλει έλεγχο» δεν σβήνει ποτέ από την οθόνη**, ακόμη κι όταν η εγγραφή διορθωθεί. (F16)
11. **Η εκτύπωση των Λήξεων χάνει τις τρεις από τις τέσσερις κάρτες και τα φίλτρα**, άρα το χαρτί δεν λέει ποιο φίλτρο ίσχυε. (F25)
12. **«Δαπάνη» ανά συνεργείο και οι μπάρες ανά κατηγορία μετρούν ως μηδέν τις εργασίες χωρίς κόστος**, χωρίς να το λένε (αλλού η εφαρμογή γράφει «Ν χωρίς κόστος»). (F26)
13. **Τρεις τρόποι μέτρησης «λήγει» δίπλα δίπλα**: η Επισκόπηση μετρά έγγραφα, οι Λήξεις οχήματα, τα Φορτηγά με άλλο όριο ημερών. Οι αριθμοί δεν συμφωνούν και οι λέξεις είναι ίδιες. (F24)
14. Μικρότερα: σημάδι `NO-FRC` που δεν διαβάζεται στις σελίδες Συντήρησης, τηλέφωνο συνεργείου που δεν εμφανίζεται ποτέ στην κάρτα εργασίας (F10)· «Δες και τα άλλα Ν» που ανοίγει λίστα όπου αυτά δεν υπάρχουν (F8)· η εκτύπωση μέσα από τη φόρμα τυπώνει ό,τι είναι αποθηκευμένο, όχι ό,τι βλέπεις (F18)· κάθε αποθήκευση οχήματος σβήνει αναζήτηση, φίλτρα και ανοιχτή καρτέλα (F19).

**Τι βρέθηκε σωστό:** όλα τα πεδία που στέλνουν οι φόρμες φορτηγών, ρυμουλκών, συνεργείων, εντολών και service υπάρχουν στον χάρτη του Worker (τίποτα δεν πέφτει σιωπηλά)· αποτυχία φόρτωσης δεν φαίνεται ποτέ ως άδεια λίστα· η αλλαγή ημερομηνίας μέσα στις Λήξεις αποθηκεύει μία φορά και σε αποτυχία το λέει· τα σύνολα κόστους στην Επισκόπηση και στην καρτέλα λένε πόσες εργασίες δεν έχουν ποσό· η λίστα εκτύπωσης γράφει «?» όταν δεν διαβάστηκαν τα δρομολόγια.

### (β) Τι δεν κρίθηκε από τον κώδικα

- Αν νέο φορτηγό, ρυμούλκα ή συνεργείο γεννιέται «Ενεργό»: η φόρμα δεν στέλνει κατάσταση, το αποφασίζει η βάση (F31).
- Τι περιέχουν οι πίνακες: πόσα οχήματα δεν έχουν ημερομηνίες, πόσες εγγραφές service έχουν διπλό σύνδεσμο, πόσες εντολές έχουν συνεργείο που δεν υπάρχει πια.
- Τι δέχεται ή αρνείται ο Worker που τρέχει σήμερα ανά ρόλο (εκτός αντικειμένου εδώ).
- Αν η βάση κρατά ημερομηνία κλεισίματος εντολής: ο χάρτης δεν έχει τέτοιο πεδίο.

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Δημιουργία ενός οχήματος: εμφανίζεται αμέσως στη λίστα «Ενεργός»; (F31)
- Εκτύπωση «Εντολές εργασίας» για φορτηγό που κάνει εθνικό δρομολόγιο του νέου πίνακα εθνικών: γράφει δρομολόγιο ή «—»; (F28)
- Πληκτρολόγηση χιλιομέτρων με τελεία χιλιάδων στη φόρμα service: τι αποθηκεύεται; (F14)
- Esc μέσα στο κελί «Ασφαλιστής» των Λήξεων: ακυρώνει ή αποθηκεύει; (F21)
- Απενεργοποίηση οχήματος από την καρτέλα όταν η αποθήκευση αποτύχει: τι βλέπει ο χρήστης; (F19)

---

# Detailed findings (English)

File shorthand: `M` = `modules/maintenance.js`, `E` = `core/entity.js`, `W` = `worker/src/index.js`, `U` = `core/utils.js`, `C` = `core/constants.js`. Confidence: **confirmed** (in code) · **likely** · **needs look** (live app).

## 1. What lists, typeaheads and filters offer

**F1 — Service form, «Όχημα»: every vehicle, active or not, unmarked; on edit the choice is found by plate text only.**
`M:1039-1042` (no Active filter), `M:1061-1064` (`selected` by `Vehicle Plate` text), `M:1198-1204` (save needs an exact plate match in the fleet).
Scenario: the user opens an old service record to add its cost. The stored plate text is spelled differently from the fleet record (import spelling, or the plate was corrected later). The select opens on «Επιλογή οχήματος…»; «Αποθήκευση» answers «Επιλέξτε όχημα». The only way to save the cost is to re-pick a vehicle, which rewrites the plate text and the link.
Confidence: confirmed.
Redesign: the vehicle of an existing record is shown as a fixed line (taken from the link); changing it is a separate, deliberate action. Inactive vehicles are offered after the active ones, labelled.

**F2 — Work-order form, «Όχημα»: active vehicles plus free text; the free text is compared in three different ways.**
List `M:2322-2327`; type lookup by exact upper-case text `M:375-382`; print list and assign-picker warnings fold spaces and dashes `U:289`, `M:2126-2131`; the list row writes «εκτός ενεργού στόλου» when the plate is found nowhere `M:1870`, although an inactive vehicle is found and shown as «Φορτηγό».
Scenario: a plate typed with a space under «Άλλο όχημα» is listed as «εκτός ενεργού στόλου» on screen, yet the planners' sheet and the assign pickers treat it as the fleet vehicle. Nothing in the list says the chosen vehicle already has an open order, so a second order for the same fault is easy.
Confidence: confirmed.
Redesign: one vehicle picker for both forms (active first, inactive labelled, «όχι στον στόλο» as the last choice with its own wording); each candidate carries «έχει ανοιχτή εντολή» as a mark, never as a block.

**F3 — «Συνεργείο» offers active workshops only; anything else is lost on save.**
Work order: options `M:2351-2356`, «Άλλο» has no text box and saves `null` `M:2357`, `M:2397`. «Άλλο» is preselected only when the stored name matches no workshop at all; a stored name of an *inactive* workshop matches, is not drawn, and the select falls to «— Επιλογή —» → `null` on the next save. Service form: `M:1044-1047`; the workshop is sent only when chosen `M:1194-1195`, so it cannot be cleared, and an inactive one reads «—» in the form while the record keeps it.
Scenario: a work order was assigned to a workshop that was later deactivated. The user opens the order to change the priority and saves. The workshop is gone from the order, the list reads «δεν έχει οριστεί», the printed sheet «—».
Confidence: confirmed.
Redesign: the current value is always in the list (labelled «ανενεργό» or «εκτός λίστας»); free text is a real box; «χωρίς συνεργείο» is an explicit choice.

**F4 — Service «Τύπος» has no empty choice.**
`M:1071`; saved as is `M:1183`.
Scenario: a new record opens on «Προγραμματισμένο σέρβις». A user who goes straight to cost and description files a tyre invoice as scheduled service; the category bars are built from this field. An old record whose stored type is outside the ten keys opens on the first option and is rewritten on any save.
Confidence: confirmed.
Redesign: no default category; an unknown stored value stays visible as its own option.

**F5 — Service filters and the per-vehicle history match by exact plate text; the vehicle card matches by link.**
Filter options are the distinct plate texts in history `M:917`, compared exactly `M:902`. Vehicle history: active vehicles only in the select `M:1299-1305`, records by plate text + type `M:1309`, same in the CSV `M:1455-1457`. Vehicle card: link first, then folded plate `E:2309-2313`. Entry from the card can preselect an inactive vehicle `M:1252-1255`, and the select then reads its placeholder above that vehicle's data.
Scenario: the card of a truck says 14 jobs; «όλα →» opens «Ιστορικό Φορτηγών» with 11, because three imported rows carry another spelling or no type. Neither screen says why.
Also missing as filter values: «χωρίς συνεργείο», «χωρίς κόστος»; «Συνεργείο» filters by name, so two workshops with one name are one option `M:906`, `M:920`.
Confidence: confirmed (the size of the difference depends on data).
Redesign: one rule for "this vehicle's jobs" (the link), used by card, page, CSV and filter; the vehicle filter lists fleet vehicles, not text spellings.

**F6 — «Λήξεις» search does not fold look-alike letters; the fleet lists do.**
`M:625` vs `E:1963-1976`.
Scenario: the same plate typed with Latin letters finds the truck on «Φορτηγά» and nothing on «Λήξεις».
Confidence: confirmed.
Redesign: one plate search everywhere.

**F7 — Fleet list filters.**
«Έγγραφα: Όλα εντάξει» includes vehicles with no date at all `E:1949`; «Μάρκα» offers raw spellings, one option per spelling `E:796-800`; trailer «Τύπος» mixes Greek and English values `E:599-601`; after every save or status toggle the list is rebuilt with the default «Ενεργός», empty search and no open card `E:749-754`, `E:2928`, `E:3150`.
Scenario: the user filters «Ανενεργός», edits the third vehicle, saves, and is back on the active list with the card closed.
Confidence: confirmed.
Redesign: «χωρίς ημερομηνία» is a filter value of its own; a save keeps the view.

**F8 — «ΑΠΟ ΛΗΞΕΙΣ ΕΓΓΡΑΦΩΝ»: first ten rows, and the link for the rest opens the wrong set.**
`M:1933-1941` (slice to ten, then «Δες και τα άλλα N» → `_expiryGoto('expired')`). The band is sorted most-overdue first `M:1823`, so the rows cut off are mostly documents *due* within 14 days, which the «ληγμένα» tab cannot contain.
Confidence: confirmed.
Redesign: no cut; or the link lands on exactly the rows it counted.

## 2. What is written wrong or lost

**F9 — Field labels against the Worker map: nothing is dropped.**
Trucks `E:468-503` vs `W:1041-1059`; trailers `E:586-610` vs `W:1065-1079`; workshops `E:680-712` vs `W:1086-1102`; service form `M:1179-1205` vs `W:1108-1139`; work order `M:2389-2404` vs `W:1144-1161`; inline edits `M:522`, `M:573`. All labels present (both quoted and unquoted forms checked).
Confidence: confirmed against the repo copy of the Worker; the running Worker was not read.

**F10 — Two reads ask for less than the screen uses.**
The `NO-FRC` marker is read from the trailer's Notes `M:41`, but the loader does not request Notes `M:259-263` (the comment `M:246-250` says so). The service drawer prints the workshop's phone `M:985`, but the loader requests only name, city, specialty, active `M:264`.
Scenario: the owner writes `NO-FRC` on a trailer used only for national work. «Λήξεις», the dashboard, the band and the print still ask for its FRC. The drawer of every job says «πόλη/τηλέφωνο — δεν έχουν καταχωρηθεί» for a workshop that has a phone.
Confidence: confirmed.
Redesign: "this trailer needs FRC" is a field on the trailer form, not a word in notes.

**F11 — «✓ Ανανεώθηκε» records a stamp, not a renewal.**
`M:1955-1972`: creates a work order «<έγγραφο> — Renewal», priority SOS, status Done; the expiry date is not asked and not changed. The band hides a document only when a **non-Done** order names it `M:1809-1814`, so the row stays and each further click writes another record. The reader of renewals matches `KTEO|KEK|FRC|Insurance` only `M:627`, while the tachograph label is «ΤΑΧΟΓΡΑΦΟΣ» `C:110`: a tachograph renewal never appears under «ΑΝΑΝΕΩΘΗΚΕ». The "already has an order" test looks for the Latin label inside the description `M:1811-1813`, so an order written in Greek letters or as «ασφάλεια» does not count.
Scenario: the user renews a ΚΤΕΟ, clicks «✓ Ανανεώθηκε», sees «Καταγράφηκε η ανανέωση ✓». The document is still listed as expired here, on «Λήξεις», on the dashboard, on the print and in the assign pickers, until someone opens «Λήξεις» and types the new date. «ολοκληρωμένες» grows by one SOS order per click.
Confidence: confirmed.
Redesign: renewing a document is one action that asks for the new expiry date and writes it; the "renewed" trace comes from that write.

**F12 — Changing the vehicle of a service record leaves the old link in place.**
`M:1198-1205` sets `Truck` *or* `Trailer`; the other is never sent as empty.
Scenario: a job filed on the tractor is corrected to its trailer. The record now links to both; the card of each (`E:2309-2313`) lists it and adds its cost.
Confidence: confirmed in code; how many such rows exist was not measured.
Redesign: see F1 (changing the vehicle is one explicit move that replaces the link).

**F13 — Invoice scan: the date is never taken, and "filled" is said regardless.**
The date box opens on today `M:1065`; the scan fills only empty boxes `M:1126-1131`; the status line always ends «✓ Συμπληρώθηκε» `M:1157`, also when the plate or the workshop matched nothing `M:1137-1156`.
Scenario: «Σάρωση τιμολογίου» on an invoice of last month. Cost and number are filled; the date stays today; the vehicle select stays empty with no word that the plate on the paper was not found. The job lands in the wrong month of the spend chart.
Confidence: confirmed.
Redesign: the scan shows what it read next to each field, including what it could not place; the date starts empty when a scan is the entry.

**F14 — «Ολοκληρώθηκε» refuses without cost and odometer, for trailers too.**
`M:1168-1177`; trailers have no odometer (`E:404` comment). Cost `0` passes the test and is stored as empty `M:1185`; odometer goes through `parseInt` `M:1186`.
Scenario: the accountant enters a paid trailer repair after the fact. The form answers «Απαιτείται για ολοκληρωμένο service» under «Χιλιόμετρα». She types a made-up number or leaves the job «Σε εξέλιξη» for ever.
Confidence: confirmed (refusal); odometer typed with a thousands dot → needs look.
Redesign: a warning with «αποθήκευση χωρίς χιλιόμετρα», and no odometer question for a trailer.

**F15 — No busy state on «Αποθήκευση» in the two maintenance forms.**
`M:1100` / `M:1207-1214`; `M:2372` / `M:2406-2416`. The fleet form does lock its button `E:3131-3132`.
Scenario: slow connection, second click: two identical work orders, or two service records with the same invoice number.
Confidence: confirmed (no guard); frequency depends on the network.
Redesign: one save state for every form.

**F16 — «θέλει έλεγχο» cannot be cleared.**
Read `M:57`, shown `M:872`, filtered `M:907`, `M:942`; never sent by the form `M:1179-1193`.
Scenario: the user fixes the date of a flagged import row. The pill «N θέλουν έλεγχο» does not move.
Confidence: confirmed.
Redesign: «Ελέγχθηκε» as an action on the record.

**F17 — Maintenance keeps a session copy of fleet, workshops and work orders.**
Fleet and workshops load once `M:241`, `M:269`; reset only by the refresh buttons and the dashboard timer `M:735`, `M:1508`, `M:1617`. Work orders load once `M:1717`, reset only by the page's refresh `M:1903`.
Scenario: the user corrects an insurance date on «Φορτηγά», opens «Λήξεις»: the old date. Adds a workshop on «Συνεργεία», opens «Νέα εντολή»: it is not in the list. A colleague enters an SOS order; the user leaves and returns to «Εντολές Εργασίας»: not there. No screen says how old its data is, except the dashboard.
Confidence: confirmed.
Redesign: every page reads on entry, or shows «ενημερώθηκε hh:mm» as the dashboard does.

**F18 — «Εκτύπωση» inside the work-order form prints the saved order.**
`M:2010-2012` (comment `M:1988-1989`), button `M:2370`.
Scenario: the user changes the workshop in the form and presses «Εκτύπωση» before «Αποθήκευση». The sheet for the workshop names the old one.
Confidence: confirmed.
Redesign: print is offered on a saved order only, or saves first.

**F19 — Fleet card: the status button toggles on one click.**
`E:2199`, `E:2925-2930`: no confirmation, no handling of its own, English toast «Marked as Active/Inactive», full redraw. Nothing warns that the vehicle has open work orders or running trips; once inactive it leaves «Λήξεις», the dashboard, the band, both print lists and the work-order picker.
Confidence: confirmed; what the user sees on a failed toggle → needs look.
Redesign: deactivation is a named action with a line of consequences («2 ανοιχτές εντολές, 1 δρομολόγιο σε εξέλιξη») and an undo; a warning, not a refusal.

**F20 — A plate correction on the fleet page detaches text-matched records.**
Work orders hold the plate as text `M:2390`; the per-vehicle history matches text `M:1309`; service records keep both link and text `M:1197-1205`.
Scenario: a plate is retyped with the right letters. Its open work orders now read «εκτός ενεργού στόλου», the «ΣΕ ΣΕΡΒΙΣ» mark and the picker warning disappear unless the two spellings fold to the same key `U:289`, and «Ιστορικό Φορτηγών» for the new plate is empty.
Confidence: confirmed in code.
Redesign: work orders point to the vehicle, not to its text.

**F21 — The insurer cell saves on every blur, changed or not.**
`M:571-587`; the date cell does compare with the original `M:544`.
Scenario: click into «ΑΣΦΑΛΙΣΤΗΣ», click out: a write and an audit line with no change. Esc → needs look.
Confidence: confirmed (unchanged write).

**F22 — After a write the screen is updated from what was sent, not from what came back.**
Work-order edit `M:2409-2410`, quick status `M:1976-1978`, inline date `M:527-528`, insurer `M:575`. With all labels mapped (F9) the risk today is low; it is the pattern that hid dropped fields before.
Confidence: confirmed.

## 3. What the pages do not tell

**F23 — A missing date counts as "valid".**
Per-vehicle worst ignores empty dates `M:458-461`; «σε ισχύ» and compliance include vehicles with no date `M:639`, `M:654-657`; dashboard compliance the same `M:1541-1543`, and its worst-six card leaves them out `M:1544`; the band skips them `M:1803`; the print list skips them `M:2121-2122`; assign-picker warnings skip them `U:324`. The cell itself shows «—» `M:680`. The fleet list knows «Χωρίς ημερομηνία» `E:984`, not clickable, and its «Όλα εντάξει» filter includes them `E:1949`.
Scenario: a new truck is entered without its tachograph date. Every maintenance screen counts it compliant, no alert is ever raised, and the planners' sheet does not list it.
Confidence: confirmed.
Redesign: «χωρίς ημερομηνία» is a third state beside expired and due, counted, filterable, printed, and never part of "compliant".

**F24 — Same words, different counts.**
Dashboard «Ληγμένα έγγραφα» / «Λήγουν σύντομα» count documents `M:1529-1530`, `M:1629-1638`; «Λήξεις» counts vehicles `M:648-652`; fleet lists use `<30` days by `ceil` on active records `E:1024-1028`, `E:1079`; «Λήξεις» uses 30, or 60 for a Bulgarian ΚΤΕΟ `M:350-354`; band, print and pickers use 14 `M:1807`, `M:2122`, `U:288`. Menu «Επισκόπηση Στόλου», page title «Κέντρο Συντήρησης» (`core/router.js:59` vs `M:1612`).
Scenario: dashboard says 9 expired, the page it opens says 6.
Confidence: confirmed.
Redesign: one count unit (vehicles, with documents as detail) and named windows («λήγει σε 14», «σε 30»).

**F25 — The expiry print drops what explains it.**
Print CSS hides every `button` `M:821`; three KPI cards and all filter pills are buttons `M:725-728`, `M:739-754`.
Scenario: the user filters «ληγμένα», prints. The sheet shows one KPI card and a list, with only «N από M ενεργά» hinting that it is partial.
Confidence: confirmed.
Redesign: a print layout of its own with a stamp line (date, filter, counts), as the work-order list has.

**F26 — Sums that take "no cost" as zero without saying.**
Workshops list «Δαπάνη» `E:1238`; category bars on the dashboard `M:1571` and on vehicle history `M:1322`; top workshops `M:1325`. Elsewhere the same data is shown with «N χωρίς κόστος» `M:317-325`, `E:2340-2347`.
Scenario: a workshop with twenty jobs, three priced, shows a small «Δαπάνη» and looks cheap.
Confidence: confirmed.
Redesign: every money total carries its «N χωρίς κόστος».

**F27 — Supplementary reads that fail leave no trace on screen.**
«ΣΕ ΣΕΡΒΙΣ» on the vehicle card `E:2386-2397`; the picker's work-order line `U:296-310`; the creator stamp `M:1745-1747`.
Scenario: the work-order read fails; the card simply shows no «ΣΕ ΣΕΡΒΙΣ».
Confidence: confirmed.

**F28 — The planners' sheet reads trips from three tables only.**
`M:2084-2097`: orders, national loads, consolidated loads. National work entered on the newer national board is not among them.
Scenario: a truck with an SOS order is on a national run of the new board; the sheet prints «—» under «ΔΡΟΜΟΛΟΓΙΟ 7 ΗΜ.», which reads as free, and it is not placed under «ΣΤΟΝ ΔΡΟΜΟ».
Confidence: likely; needs a look with such a truck.
Redesign: the sheet says which sources it checked, or reads the same trip source as the boards.

**F29 — Closing a work order tells nothing and keeps nothing.**
«✓ Ολοκληρώθηκε» is one click, no confirmation `M:1883`, `M:1974-1981`; the map has no closing date `W:1144-1161`, so «ολοκληρωμένες» cannot say when. Renewal stamps (F11) sit in the same tab as real jobs, as SOS `M:1961-1963`.
Confidence: confirmed.

**F30 — Small untruths in labels.**
Placeholder «Αναζήτηση πινακίδας…» also searches description, notes, workshop `M:1897` vs `M:1856`; tooltip «MS-2» on «Ιστορικό Service» `M:1900`; trailer column «ΑΣΦΑΛΙΣΤΗΣ» for a field that does not exist `M:702`, `M:773`; English empty-table button `+ Truck` `E:1638`.
Confidence: confirmed.

**F31 — A new record is saved without a status.**
The three forms have no «Κατάσταση» field and send no `Active` `E:468-503`, `E:586-610`, `E:680-712`, `E:3103-3118`; the list then reopens on «Ενεργός» `E:749-754`.
Scenario: if the table does not default to active, the user saves a new trailer, sees «Η εγγραφή δημιουργήθηκε» and an unchanged list.
Confidence: needs look (depends on the table default).

## 4. What is missing for the job

**F32 — Work order and service record are two unrelated things.** Closing an order neither creates nor offers the service record; «Εκτ. Κόστος» appears only on the printed sheet and is never set against the invoice; the order's workshop is a name, the record's a link (`M:1974-1981`, `M:2389-2404`, `M:1999`, `M:1195`; `W:1160`). Renaming a workshop leaves its orders with the old name. Confirmed.
Redesign: one job with stages (reported → at the workshop → done and invoiced).

**F33 — Two places for "next service", not connected.** The truck's «Επόμενη συντήρηση» feeds the «Συντήρηση 14 ημ.» card, which also counts every past date for ever `E:491`, `E:1103-1109`; the service record's «Επόμενο Service» feeds the history page `M:1087-1088`, `M:1316-1317`. Recording a service moves neither. Trailers have neither card. Confirmed.

**F34 — Documents outside the expiry screens.** Driver licence is tracked only on the drivers page `E:945`; the CSV has no tachograph column and puts ΚΕΚ and FRC in one `M:795-800`; a trailer for which FRC «δεν απαιτείται» exports as blank, like a missing date. Confirmed.

**F35 — No way to resolve duplicates.** Look-alike plates are flagged «⚠ διπλότυπο;» `E:1686-1699`; there is no delete or merge on vehicles and workshops, and no warning when a new record repeats a plate, a workshop name or a tax number `E:3131-3150`. Confirmed.

**F36 — No history of a document.** A date typed over the old one leaves nothing on screen (comment `M:620-622`); the previous expiry, who renewed and when, and the paper itself have no place. Confirmed.

**F37 — Lists without totals or order.** Service list shows no sum for the filtered rows `M:934`; the per-vehicle table cannot be sorted while the other two can `M:1429-1433` vs `M:952-955`. Confirmed.

**F38 — No drawn view-only state.** The maintenance pages have one appearance for every role. The redesign needs a view-only drawing for list, card and form before anything else is decided. (Details are kept out of this repo.)

---

## What was read, and what was not

Read: `modules/maintenance.js` (logic from line 240 to the end; the style block skimmed; the print-list HTML and CSS after line 2240 only through its text variant); `core/entity.js` configs for trucks, trailers, workshops (383-715), loader, filters, search, KPI cards, workshop enrichment, card maintenance loader, status toggle, save path; `worker/src/index.js` table maps for TRUCKS, TRAILERS, WORKSHOPS, MAINT_HISTORY, MAINT_REQ (1038-1162) and the presence of the labels the print list filters on; `core/constants.js` expiry field lists; `core/utils.js` picker warnings (280-332); `core/api.js` `atSafePatch` and the cache invalidation points; the catalogue `catalog/D-master-fleet.md` sections 1 and 3 as a map (its items M-02 to M-09 and M-12 to M-17 were re-checked in code and agree).

Not read: the old (pre-v2) paths of `core/entity.js`; the vehicle card's round-trip section; `core/form-helpers.js` (`fhSelectSearch`), `core/ui.js` (modal, `TableSort`, `collapseEmptyColumns`), `atSoftDelete` and the scan engine internals; anything in the database; the Worker that is deployed; the rendered screens. Line numbers for the dashboard block (`M:1529-1571`) and the band (`M:1933-1941`) are within a few lines of the statement cited and should be re-checked when quoted.
