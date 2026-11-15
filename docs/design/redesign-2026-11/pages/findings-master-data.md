# Στοιχεία (Πελάτες, Συνεργάτες, Οδηγοί, Τοποθεσίες και χάρτης): έλεγχος λειτουργιών της σημερινής σελίδας (15/11/2026)

**Όλα τα παρακάτω είναι ευρήματα από ανάγνωση κώδικα. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο διακομιστής που τρέχει. Τίποτα δεν διορθώθηκε.**

## Σύνοψη

Κανόνας του owner που ισχύει παντού (15/11): κάποιες κινήσεις γράφονται εκ των υστέρων, ενώ η δουλειά ήδη έγινε. Άρα ένας συνεργάτης που γίνεται «ανενεργός» ενώ έχει φορτίο στον δρόμο, μια τοποθεσία που μοιάζει με άλλη ή συντεταγμένες που φαίνονται λάθος **δεν απαγορεύονται**: η σελίδα προειδοποιεί και αφήνει τον άνθρωπο να συνεχίσει. Τα παρακάτω είναι λάθη εγγραφής και πράγματα που η σελίδα δεν λέει· αυτά δεν αλλάζουν από τον κανόνα.

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Ο χάρτης ανοίγει σωστά μόνο την πρώτη φορά.** Αν φύγεις από τις Τοποθεσίες και γυρίσεις, το «Χάρτης» δείχνει άδειο χώρο ως την επαναφόρτωση του browser· αν είχες φύγει με τον χάρτη ανοιχτό, το κουμπί θέλει και δύο πατήματα. (F20)
2. **Οι λίστες δεν είναι φρέσκες και δεν το λένε.** Οι Τοποθεσίες διαβάζονται μία φορά και μένουν ίδιες όσο είναι ανοιχτή η εφαρμογή: τοποθεσία που φτιάχτηκε από τη φόρμα παραγγελίας, από σάρωση ή από συνάδελφο δεν εμφανίζεται, και ο έλεγχος «υπάρχει ήδη» δεν τη βλέπει. Πελάτες και Συνεργάτες μπορεί να είναι ως 30 λεπτά παλιοί, Οδηγοί ως 4 ώρες, ακόμη και μετά από επαναφόρτωση. (F21, F22, F9)
3. **Η επεξεργασία γράφει πάνω από αλλαγή συναδέλφου.** Η φόρμα στέλνει όλα τα πεδία, όχι μόνο αυτό που άλλαξες, και τα παίρνει από το παλιό αντίγραφο. Αλλάζεις ένα τηλέφωνο και γυρίζεις πίσω τη λήξη διπλώματος που διόρθωσε άλλος πριν από μία ώρα. (F11)
4. **Όνομα με εισαγωγικά κόβεται.** Σε πελάτη, συνεργάτη ή οδηγό που έχει διπλά εισαγωγικά σε κάποιο πεδίο, η φόρμα επεξεργασίας δείχνει το κείμενο ως το πρώτο εισαγωγικό· η «Αποθήκευση» γράφει το κομμένο. (F10)
5. **Στην τοποθεσία, πεδίο που αδειάζεις δεν αδειάζει.** Σβήνεις λάθος συντεταγμένες, πόλη, διεύθυνση, ωράριο· το μήνυμα λέει «ενημερώθηκε» και η παλιά τιμή μένει. Μόνο τηλέφωνο και σημειώσεις σβήνουν. Και η φόρμα δέχεται ό,τι συντεταγμένες γράψεις, ακόμη και ανάποδα ή μόνο τη μία. (F12, F13)
6. **Η αναζήτηση δεν βρίσκει με τηλέφωνο, ούτε με άλλο τονισμό ή άλλο αλφάβητο.** Στις Τοποθεσίες τα ονόματα είναι πάντα με λατινικά· αν γράψεις ελληνικά δεν βγαίνει τίποτα, ενώ η φόρμα παραγγελίας βρίσκει. (F1, F2)
7. **Ο χάρτης δεν δείχνει ποτέ το τηλέφωνο της τοποθεσίας**, ούτε διεύθυνση, ωράριο ή σημειώσεις. Οι κατηγορίες του βγαίνουν με μάντεμα από ένα πεδίο που είναι σχεδόν πάντα κενό, άρα σχεδόν όλα τα σημεία είναι «Αταξινόμητα». Τα συνεργεία «κολλάνε» σε τοποθεσία με μάντεμα ονόματος. Τα φίλτρα της λίστας δεν ισχύουν στον χάρτη. (F24, F5, F8, F6)
8. **Αριθμοί που δεν συμφωνούν με τη λίστα από κάτω.** Η γραμμή με τα σύνολα μετρά και τους ανενεργούς, ενώ η λίστα δείχνει μόνο ενεργούς. Το «Χώρες» μετρά κάθε γραφή χωριστά, το φίλτρο τις ενώνει. Το «λήγει σε 30 ημέρες» μετριέται με τρεις τρόπους. (F23)
9. **Κάρτα πελάτη και συνεργάτη.** Ο πελάτης μετρά και τις ακυρωμένες παραγγελίες στον τζίρο και δεν διαβάζει τα νέα εθνικά· ο συνεργάτης αθροίζει και ακυρωμένες παλιές αναθέσεις. Οι σύνδεσμοι «όλες →» ανοίγουν τη λίστα χωρίς φίλτρο. (F25, F26)
10. **Η κατάσταση αλλάζει με ένα κλικ πάνω στην ετικέτα**, χωρίς ερώτηση, και το μήνυμα είναι στα αγγλικά. Μετά από κάθε αποθήκευση χάνονται η αναζήτηση, τα φίλτρα και η ανοιχτή κάρτα. (F15, F16)
11. **Η διαγραφή τοποθεσίας δεν λέει πόσες παραγγελίες τη χρησιμοποιούν**· γράφει την ίδια γενική προειδοποίηση για όλες. (F18)
12. **Χωρίς σύνδεση, η αποθήκευση λέει «δημιουργήθηκε».** Η εγγραφή περιμένει στη σειρά, αλλά η λίστα τη δείχνει σαν κανονική. (F14)
13. **Λείπουν:** προειδοποίηση για διπλό πελάτη ή συνεργάτη (ίδιο ΑΦΜ, ίδιο όνομα), ένωση διπλών, εξαγωγή ή εκτύπωση, κλικ για κλήση ή email, σύνδεση πελάτη με τις τοποθεσίες του. (F28–F36)

### (β) Τι δεν κρίθηκε από τον κώδικα

- Αν ο νέος πελάτης, συνεργάτης ή οδηγός γεννιέται «ενεργός». Η φόρμα δεν το γράφει· το αποφασίζει η βάση. (F16)
- Τι βλέπει μια παραγγελία όταν σβηστεί η τοποθεσία της. (F18)
- Πόσοι πελάτες έχουν εισαγωγικά στο όνομα, πόσες τοποθεσίες έχουν τύπο, πόσοι ενεργοί πελάτες υπάρχουν (πάνω από 500 η λίστα κόβεται).
- Ποιος ρόλος πρέπει να βλέπει ή να αλλάζει τι. Είναι απόφαση του owner και δεν γράφεται εδώ.
- Ποια στοιχεία χρειάζεται πράγματι η δουλειά για συνεργάτη και οδηγό (F35): είναι ερώτηση προς τον owner.

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Ο άδειος χάρτης στη δεύτερη επίσκεψη (F20) και η τοποθεσία από σάρωση που δεν φαίνεται στη λίστα (F21).
- Ένας πελάτης με εισαγωγικά στο όνομα: τι δείχνει η φόρμα επεξεργασίας (F10).
- Νέος πελάτης: εμφανίζεται αμέσως στη λίστα ή κρύβεται πίσω από το «Ενεργός»; (F16)
- Αποθήκευση χωρίς σύνδεση: τι μένει στην οθόνη (F14).
- Όροι πληρωμής με δεκαδικό: τι μήνυμα βγαίνει (F17).
- Ο τζίρος πελάτη με ακυρωμένη παραγγελία, και πελάτης που έχει μόνο νέα εθνικά (F25).

---

## Detailed findings

Code read at worktree tip `e1151e37`. "Confirmed" = read in the code at that line. `entity.js` = `core/entity.js`; `locations.js`, `locations_map.js` = `modules/…`; `api.js` = `core/api.js`; Worker = `worker/src/index.js` (repo copy, not the deployed bundle).

Worker map check for every label these screens write or read (quoted and unquoted forms both searched): CLIENTS (Worker :991-1008), PARTNERS (:1013-1024), DRIVERS (:1029-1036), LOCATIONS (:968-986) contain every label the forms send. The one label with no column, the driver's «Βασικός μισθός», is disabled in the form and never sent (entity.js:367-373, 3106). Dropped labels are logged by the Worker, not refused (Worker :2769-2783). No silent drop was found in this scope.

### Q1. What the lists, typeaheads and filters offer

**F1. Search on Πελάτες / Συνεργάτες / Οδηγοί misses the obvious keys.**
entity.js:172, 243, 325 (search fields), 1891-1893, 1970-1975.
Searched: clients = name, city, contact, VAT; partners = name, contact, VAT; drivers = name, licence number. Phone and email are searched nowhere; the match is a lowercase substring with no accent or alphabet folding.
Scenario: a number calls; the dispatcher types it in the search box on Πελάτες: «Καμία εγγραφή με αυτά τα φίλτρα». A name typed without the accent the record carries gives the same.
Confidence: confirmed in code.
Redesign: one search that matches name, contact, phone, email, VAT, city, folded for accents and Greek/Latin, and shows what it matched on.

**F2. Search on Τοποθεσίες does not find what the order form finds.**
locations.js:268-271, 470-474.
Substring over name, city, stored country, address. Names and cities are Latin-only by rule, so a Greek query returns nothing; the country is stored as a code, so its Greek name returns nothing; type, phone and notes are not searched.
Scenario: the dispatcher types a town in Greek, sees «Καμία τοποθεσία με αυτά τα φίλτρα», and creates the place again.
Confidence: confirmed in code.
Redesign: the same folded, transliterated match as the order-form picker, on the list and on the map.

**F3. The country filter offers countries that give an empty list.**
entity.js:782-797 (options from all records), 155 / 228 / 290 (default filter «Ενεργός»), 819-823 (only fixed options are greyed at zero), 839-842.
Scenario: with «Κατάσταση: Ενεργός» on, pick a country whose only records are inactive: empty table.
Confidence: confirmed in code. Low severity.
Redesign: each option carries its count under the other active filters; zero is greyed.

**F4. Clients and partners are listed in creation order, and the 500-row cap cuts that order.**
entity.js:141-276 (no default sort), 1518-1548, 1682, 1723-1744; Worker :2646.
Scenario: «Κατάσταση: Όλα» on Πελάτες with more than 500 records: the first 500 ever created are shown; the newest are reachable only by search. The cap is stated twice, the order is not.
Confidence: confirmed in code; whether the active list alone passes 500 needs a look.
Redesign: alphabetical by default with the sort visible, and paging or continuous scrolling in place of a cap.

**F5. «Τύπος» of a location is free text, and the map's two filter panels live on it.**
locations.js:408, 432, 237-240; locations_map.js:87-110, 262-268, 303-316.
Seven suggestions in two languages; the list filter offers every spelling in the data; the map derives the category by pattern over type + name, and «Επίπεδα ανά πελάτη» only from a type that literally starts with "client:". Code comments put the field at about 98 % empty, so nearly every pin is «Αταξινόμητα» and the client layers are close to empty.
Confidence: confirmed in code; the proportion is from code comments, not measured.
Redesign: a real category (short fixed list) chosen in the form; "whose place is this" taken from the orders, never typed.

**F6. The map ignores the list's filters.**
locations_map.js:175-191 (points from all records); locations.js:199-207.
Scenario: filter the list to one country, press «Χάρτης»: every point is drawn, with the map's own separate search and filters.
Confidence: confirmed in code.
Redesign: one filter state; the map is a view of the same result.

**F7. «— Ελλιπή στοιχεία» sits inside the Χώρα filter and means only "no country or no city".**
locations.js:213, 262. A place with no address, phone or pin is not "incomplete" by this option; the pin has its own chip.
Confidence: confirmed in code. Low severity.
Redesign: one "needs completing" view with the reason per row.

**F8. A workshop's phone and specialty are attached to a location by name guesswork.**
locations_map.js:131-159, 207-208.
Exact transliterated name first; otherwise the first location whose name contains any word of five letters or more from the workshop's name, if that location's name looks like a workshop. `Active` is fetched and never tested, so an inactive workshop lends its data too.
Scenario: two branches of one brand: the phone of one workshop record appears on the other branch's pin.
Confidence: likely.
Redesign: a workshop is a place with its own pin (or an explicit link to one); no matching by name.

**F9. The new-location duplicate warning compares against a list that can be hours old.**
locations.js:32-35, 782-790. On this page the check reads the page's own list, loaded once per session (F21).
Scenario: a colleague, or the scan form, created the place an hour ago; creating it again here raises no «Υπάρχει ήδη».
Confidence: confirmed in code.
Redesign: the duplicate check asks the server at save time.

### Q2. What is written wrong or lost

**F10. A value containing a double quote is cut in the edit form, and saving writes the cut text.**
entity.js:2999 (text), 2987 (email), 2969 (textarea) insert the stored value unescaped (the list type at :2997 is escaped); save reads the inputs back at :3104-3120.
Scenario: a company whose name carries a quoted trade name. «Επεξεργασία» shows the name up to the first quote. The user changes the phone and presses «Αποθήκευση»: the name is overwritten with the fragment, toast «Η εγγραφή ενημερώθηκε».
Confidence: confirmed in code; one look live for how many records are exposed.
Redesign: nothing to draw; the form must show exactly what is stored. Writing only changed fields (F11) would also contain it.

**F11. An edit sends every filled field from a stale copy, so it can undo a colleague's newer change.**
entity.js:2937-2941 (form filled from the cached list), 3101-3121 (all non-empty fields sent); api.js:14-26, 42-50, 733-743 (clients and partners 30 min, drivers 4 h, kept in the browser's storage), 1080-1087, 1336-1337 (only this browser's own writes clear it).
Scenario: fleet management corrects a driver's licence expiry at 09:00. At 10:00 a dispatcher whose list was read at 08:00 edits the same driver's phone. The save carries the old expiry with it.
Confidence: confirmed in code; how often two people touch one record is not known.
Redesign: edit in place, field by field; only the changed field is written, and a field someone else changed since it was shown is flagged before it is overwritten.

**F12. On a location, an emptied field is not written.**
locations.js:500-509 (sent only when filled) vs 512-513 (notes and phone always sent).
Scenario: a pin is in the wrong country; the user clears both coordinates and saves: «Η τοποθεσία ενημερώθηκε ✓», the pin stays. Same for country, city, address, type, hours, delivery days.
Confidence: confirmed in code.
Redesign: an explicit "remove pin" action; clearing any field is a real change, shown before saving.

**F13. The location form accepts any coordinates.**
locations.js:498-505 (no range check; one may be saved without the other) vs the scan form's check at :848-853.
Scenario: latitude and longitude typed the wrong way round: saved, shown in the list as coordinates; the pin lands outside the frame and is named only in the map's «εκτός Ευρώπης» hint.
Confidence: confirmed in code.
Redesign: a small map preview in the form, and a warning (not a refusal) when the pin is far from the stated city or country.

**F14. Saving while offline reports success and leaves an odd row.**
api.js:839-845, 907-910 (queued, returns a temporary answer), 99-101 (one warning toast); entity.js:3134-3150; locations.js:530-549.
Scenario: no connection. Entity pages: warning toast, then «Η εγγραφή δημιουργήθηκε», then the list reload fails with «Δεν φορτώθηκαν οι εγγραφές». Locations: a new row goes to the top with a temporary id and can be opened and edited; on an edit, the row in the list is replaced by only the fields that were sent, so its other columns go blank until reload.
Confidence: likely; needs a look offline.
Redesign: a queued change is drawn on the row as "waiting to be sent", never as saved.

**F15. The status pill on the card is a one-click write.**
entity.js:2198-2200, 2925-2930.
It looks like the read-only badge and flips «Ενεργός / Ανενεργός» at once: no question, no note of open orders or assignments, toast in English («Marked as Inactive»), page rebuilt. With the default filter on, the record then disappears from the list.
Confidence: confirmed in code.
Redesign: a labelled control with one confirming line that names open work as a warning; the record stays visible, greyed, until the user moves on.

**F16. Every save or status change throws away the user's place.**
entity.js:749-754, 2928, 3150.
Search text, filters (back to «Ενεργός») and the open card are reset. Separately, the create form never sends the active flag (no such form field, :191-212, 261-274, 358-379), so whether a new record is active is the table's default: if it is not, the new record is hidden by the default filter right after «Η εγγραφή δημιουργήθηκε».
Confidence: reset confirmed in code; the default needs a look.
Redesign: after a save the same view stays, the changed row is highlighted, and a new record is shown even when it falls outside the filters.

**F17. A refused save does not say which field or why.**
entity.js:3153 («Σφάλμα αποθήκευσης εγγραφής»); api.js:868, 920 (a second toast, «Save failed»).
Scenario: «Όροι πληρωμής (ημέρες)» typed with a decimal (the form parses any number, :3115; the column is a whole number, Worker :1000-1006): two toasts, neither names the field. Same for any other value the table refuses.
Confidence: likely; needs a look.
Redesign: the refusal lands on the field, in Greek, and the form keeps what was typed.

**F18. Deleting a location says the same sentence for every place.**
locations.js:917-947.
«Οι παραγγελίες που τη δηλώνουν ως σημείο θα χάσουν την αναφορά» appears whether the place has no stops or hundreds; the card already knows the count (:1060-1076). The delete can be undone for 60 seconds.
Confidence: confirmed in code (no count); what the orders show afterwards was not judged.
Redesign: the question states "N orders use this place, last on …" and offers "merge into another place" beside delete.

**F19. A place whose country is stored in an unknown spelling cannot be edited until the country is fixed.**
locations.js:477-479, 495; `core/countries.js`:98.
Scenario: add a phone to such a place: «Διάλεξε τη χώρα από τη λίστα», nothing saved, the country field is not marked.
Confidence: confirmed in code. Low severity: the message is honest but points nowhere.
Redesign: the country field is marked when the form opens, with the reason.

### Q3. What the page does not tell the user

**F20. After the first visit, the map opens blank.**
locations_map.js:199 (returns early once built), 218; locations.js:24, 36, 59-106, 199-207.
The map is built once into the page's host element and flagged as built. Leaving Τοποθεσίες and coming back rebuilds the page with a new, empty host; «Χάρτης» then only resizes the old, detached map. The "map is open" flag also survives the visit, so if the user left with the map open the first press does nothing visible and the button label is out of step.
Scenario: open the map, go to Παραγγελίες, come back, press «Χάρτης»: an empty area, no message.
Confidence: confirmed in code; worth one look live.
Redesign: list and map are two views of one page state rebuilt on entry; no hidden "already built" memory.

**F21. The Locations list is frozen for the session.**
locations.js:32-35 (read once), 880-890 (a place created from a scan is not added to it), 177 and 1185 (the «Κίνηση» index too).
Scenario: a place is created from the order form's scan. On Τοποθεσίες it is not in the list and not in the count; the user concludes it was not saved.
Confidence: confirmed in code.
Redesign: the page reads on entry, shows "as of hh:mm" and a refresh.

**F22. Clients, partners and drivers are shown from a browser copy with no age on it.**
api.js:14-26, 42-50, 733-743. Up to 30 minutes (clients, partners) or 4 hours (drivers); a page reload does not refresh it; only this browser's own saves do.
Scenario: accounting adds a client; the dispatcher's Πελάτες does not show it for up to half an hour, and nothing says the list is a copy.
Confidence: confirmed in code.
Redesign: as F21.

**F23. The summary strip counts something other than the list under it.**
entity.js:953-1011, 782-789, 2113-2118.
«Σύνολο», «Χώρες», «Χωρίς τηλέφωνο», «Ληγμένο δίπλωμα», «Λήγει <30 ημ.» are counted over all records, inactive included, while the list opens on active only. «Χώρες» counts raw spellings (two spellings of one country = 2) while the filter groups them. "Expiring" is ≤ 30 days rounded down in the strip, ≤ 30 rounded up on the card, < 30 in the list cell. None of the numbers can be clicked.
Scenario: Οδηγοί shows an expired-licence count above a list with fewer red rows; the rest are inactive drivers.
Confidence: confirmed in code.
Redesign: every number is a filter on the list below and counts exactly what that filter shows; one expiry rule.

**F24. The map's detail panel says «Τηλέφωνο: δεν έχει καταχωρηθεί» for a place that has a phone.**
locations_map.js:183-190 (points built with empty phone and contact), 585-587; only a matched workshop fills them (:153-158). Address, opening hours, delivery days and notes are not in the panel at all.
Confidence: confirmed in code.
Redesign: the map opens the same place card as the list.

**F25. The client card's numbers include cancelled orders and leave out the new national work.**
entity.js:2596-2640 (no status test; reads international orders and the old national orders only), against the driver, vehicle, partner and location cards, which also read the new national cycles (entity.js:2447, 2649; locations.js:1096-1101).
«παραγγελίες», «τον μήνα» and «τζίρος» count every order ever linked to the client. «όλες →» opens the orders page with no client filter (:2261). The three recent rows lead with a reference code (:2616), against the plain-messages rule; the location card's history rows carry an order code on line two (locations.js:1348).
Confidence: confirmed that no status test and no new-national read exist; the size of the effect needs a look.
Redesign: the card shows open work first (what is running now for this client), then counts with their rule stated; links land filtered.

**F26. The partner card mixes two rules and two languages.**
entity.js:2659-2679, 2685-2695.
«τζίρος» sums the rate of every old assignment, cancelled ones included, but leaves cancelled new national cycles out. Recent rows show raw English statuses and the codes `INTL` / `NAT`. If the on-time read fails, the figure is simply absent, with no note.
Confidence: confirmed in code.
Redesign: one rule for "what we paid / owe this partner", in Greek words, with open assignments listed by customer and route.

**F27. The driver card.**
entity.js:2420-2426, 2428-2435, 2470, 2504-2509, 312-316.
A driver created today reads «Ο οδηγός δεν έχει αντιστοιχιστεί στα δρομολόγια κόστους» in two sections (jargon for "no trips yet"). «Με ποια φορτηγά» counts from at most the newest 200 trips without saying so. «Μισθός» reads «Δεν έχει καταχωρηθεί» for every driver, permanently, because no column exists (owner decision pending).
Confidence: wording confirmed; the 200 limit is from a code comment, likely.
Redesign: "no trips yet" in plain words; the salary block leaves the card until it can hold a value, or points to Μισθοδοσία.

### Q4. What is missing for the job

**F28. No duplicate warning for a client, partner or driver.** entity.js:3087-3150 has no check; locations have one (locations.js:782-804). A second record with the same VAT number or the same name is created silently. Confidence: confirmed. Redesign: on create, "looks like …" with open-that-one or create-anyway (a warning, never a refusal).

**F29. No way to resolve a duplicate.** No delete or merge on Πελάτες / Συνεργάτες / Οδηγοί (only deactivate); Τοποθεσίες can delete but not merge, so the stops of the duplicate cannot move to the surviving place. Confidence: confirmed (no delete call in entity.js). Redesign: "merge into…" as the one tool for duplicates, with the count of orders that will move.

**F30. No format help on VAT, email, phone.** Only "required" is checked (entity.js:3059-3085); the email input's own check never runs because the form is not submitted as a form. Confidence: confirmed. Redesign: soft warnings under the field.

**F31. A client is not connected to its places.** Locations carry no client (Worker :968-986); the map guesses it from the type text (F5); the client card lists no places, and the location card derives clients from past stops only. Confidence: confirmed. Redesign: the client card shows "places we load / deliver for this client" from the orders, and a place shows its clients the same way: derived, not typed.

**F32. No export, print, call or mail action anywhere in scope.** No CSV, no print, no call or mail link, no copy button in the three files. Confidence: confirmed by search. Redesign: phone and email are actions; a list export for accounting.

**F33. Card links and filters that stop short.** «όλες →» / «όλα →» open unfiltered pages (entity.js:2181, 2261); Οδηγοί has no licence filter although the strip counts expired licences (entity.js:327-338); the location card has no edit or delete and does not close with Esc (locations.js:1261-1307), while the map panel has «Επεξεργασία». Confidence: confirmed.

**F34. "What is near" starts only from a click on the map or from an existing pin.** locations_map.js:523-547, 604-607. No typed address or town, no truck position; distances are straight-line and not labelled as such. Confidence: confirmed. Redesign: start from a typed place; say "σε ευθεία".

**F35. Fields the job may need and the screens do not have (owner question, not a defect).** Partner: city, payment terms, their plates and drivers. Client: notes, a second contact, a billing email. Driver: any document besides the licence, a usual truck. The Worker map already holds «State/province» and «Tags» for locations (Worker :972, 984) that no screen in scope writes. Confidence: confirmed that they are absent; whether they are needed is the owner's call.

**F36. No trace on the record of who changed it and when.** Nothing on the card or form shows the last change; with F11 in play this is how an overwritten value would be noticed. Confidence: confirmed (no such element in the three files).

---

## What was read, and what was not

Read, in the parts cited: `core/entity.js` (configs for clients, partners, drivers :141-381; list, filters, search :716-1012, 1518-1548, 1682-1744, 1838-2003; card and its loaders :2113-2298, 2400-2714; status toggle, form and save :2925-3155), `modules/locations.js` (:1-610, 752-966, 1030-1360), `modules/locations_map.js` (:20-619), `core/api.js` (cache rules, reads, single-record update and create, offline queue), `core/pa-helpers.js` (assignment status and list), `core/countries.js` (option list), `worker/src/index.js` (table maps :962-1104 and :1318-2092 by label; write, read, list order and delete paths :2211-2217, 2560-2660, 2765-2790, 4180-4200), and the catalogue `catalog/D-master-fleet.md` sections 0, 1, 2, 4 as a map. Its findings on roles (E-03, L-03, X-02) are left to the private notes.

Not read or not judged: the deployed Worker bundle; any table content, default or constraint; the trucks, trailers, workshops and maintenance pages (another audit); the inline "new place from scan" form beyond its save path; the order forms' own client, partner and location pickers (Orders audit); `core/relay.js`, `core/plan-*.js` and the `/costs/*`, `/plan/*` routes behind the cards; how any screen looks when rendered. Nothing about permissions or security is recorded here.
