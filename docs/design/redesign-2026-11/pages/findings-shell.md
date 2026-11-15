# Κέλυφος: έλεγχος λειτουργιών της σημερινής εφαρμογής (15/11/2026)

Είσοδος, μενού, γρήγορη μετάβαση (⌘K), καμπανάκι και σελίδα «Ειδοποιήσεις», βοηθός «Νάκης», «Αναίρεση», «Ιστορικό Ενεργειών», «Ρυθμίσεις», «Κάδος».

**Όλα τα παρακάτω είναι ευρήματα από ανάγνωση κώδικα. Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο Worker που τρέχει. Τίποτα δεν διορθώθηκε εδώ.**

## Σύνοψη

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Το καμπανάκι λέει «Όλα ΟΚ · καλή δουλειά!» όταν δεν μπόρεσε να διαβάσει τις παραγγελίες ή τον στόλο.** Η κουκκίδα σβήνει, η σελίδα «Ειδοποιήσεις» γράφει 0 κρίσιμες. Κανένα μήνυμα ότι ο έλεγχος δεν έγινε (F12).
2. **Φορτίο που δόθηκε σε συνεργάτη βγαίνει ως κρίσιμο «χωρίς ανάθεση»** στο καμπανάκι και στον βοηθό, και στέλνει ειδοποίηση στην επιφάνεια εργασίας. Ο Πίνακας Ελέγχου το μετρά σωστά· το καμπανάκι όχι (F1).
3. **Η κρίσιμη βλάβη (SOS / Άμεσα) δεν φτάνει στον υπεύθυνο στόλου.** Τη βλέπει ο υπεύθυνος εθνικών και ο ιδιοκτήτης. Ο υπεύθυνος στόλου παίρνει μόνο τις λήξεις εγγράφων (F2).
4. **Η «Αναίρεση» λέει «Reverted» χωρίς να αναιρέσει**, όταν το πεδίο ήταν άδειο πριν. Και αναιρεί μόνο την τελευταία από πολλές εγγραφές μιας ενέργειας (π.χ. ανάθεση που γράφει σε δύο σημεία) (F7, F8).
5. **Ο βοηθός γράφει «Record updated» ακόμη κι αν δεν γράφτηκε τίποτα.** Τα ονόματα πεδίων τα διαλέγει ο ίδιος· ό,τι όνομα δεν αναγνωρίζεται πετιέται σιωπηλά. Και η επιβεβαίωση που βλέπεις δείχνει κωδικό εγγραφής και ακατέργαστο κείμενο, όχι ποια παραγγελία ή ποιο φορτηγό είναι (F9).
6. **Οι υπενθυμίσεις του βοηθού δεν εμφανίζονται ποτέ στο καμπανάκι** (γράφονται σε άλλο σημείο από αυτό που διαβάζει το καμπανάκι) και δεν σβήνουν ποτέ: δεν υπάρχει τρόπος να πεις «έγινε» (F10).
7. **Κάθε είδος ειδοποίησης κόβεται στις 5 (τιμολόγηση στις 8) χωρίς να το λέει.** Οι αριθμοί στην κεφαλίδα μετρούν τις κομμένες λίστες. Τα ατιμολόγητα παλαιότερα των 14 ημερών φεύγουν από την ειδοποίηση (F3, F14).
8. **Στο καμπανάκι ο αριθμός της κεφαλίδας δεν συμφωνεί με το «Όλες οι ειδοποιήσεις (N)»**: οκτώ ατιμολόγητες μετρούν ως «1 προς ενέργεια» πάνω και «8» κάτω. Αν κρύψεις όλες τις κάρτες με το ✕, η λίστα μένει κενή χωρίς λέξη ενώ η κεφαλίδα λέει ακόμη «N προς ενέργεια» (F13).
9. **Ειδοποιήσεις χωρίς όνομα.** Το «CMR εκκρεμεί» δεν γράφει ποια παραγγελία είναι (διαβάζει δύο πεδία που δεν υπάρχουν)· το «Παραγγελία χωρίς τιμολόγιο» δεν γράφει πελάτη. Πέντε ίδιες γραμμές χωρίς τρόπο να τις ξεχωρίσεις, και το «Άνοιγμα» πάει στη σελίδα, όχι στην εγγραφή (F5, F17).
10. **Ο «Κάδος» κρατά μόνο ό,τι σβήστηκε από αυτόν τον υπολογιστή, και μόνο από πέντε σημεία της εφαρμογής.** Διαγραφές από τα εβδομαδιαία, από στάσεις, από παλέτες δεν μπαίνουν. Η «Επαναφορά» φτιάχνει **νέα** εγγραφή, δεν ξαναζωντανεύει την παλιά (F11, F19).
11. **Στο «Ιστορικό Ενεργειών» η διαγραφή δεν λέει τι διαγράφηκε** (μόνο κωδικός), οι λίστες «Χρήστης» και «Πίνακας» προσφέρουν μόνο όσους φάνηκαν στις τελευταίες 200 γραμμές, και δεν υπάρχει «παλαιότερες» (F4, F15, F20).
12. **Η γρήγορη μετάβαση (⌘K)** δείχνει σελίδες που μετά αρνούνται να ανοίξουν και κρύβει σελίδες που ο ρόλος έχει· δεν βρίσκει «παραγγελιες» χωρίς τόνο· δείχνει μόνο τις πρώτες 20 σελίδες (F6).
13. **Λογαριασμός που υπάρχει στη βάση αλλά λείπει από τη λίστα του browser**: η είσοδος πετυχαίνει και αμέσως σε γυρίζει στη σελίδα εισόδου χωρίς καμία εξήγηση (F16).
14. **Ο βοηθός έχει δικό του, διαφορετικό έλεγχο ειδοποιήσεων** (λήξεις στις 30 ημέρες αντί 14, άλλος ορισμός «χωρίς ανάθεση», δεν μετρά τις σημερινές παραδόσεις) και μία ειδοποίησή του («χωρίς ανάθεση πάνω από 24 ώρες») δεν μπορεί να βγει ποτέ (F18).

### (β) Τι δεν κρίθηκε από τον κώδικα

- Τι γράφει ο Worker στο ιστορικό για μια διαγραφή (αν κρατά την εγγραφή πριν σβηστεί).
- Αν η βάση δέχεται την «Επαναφορά» μιας διεθνούς παραγγελίας από τον Κάδο και τι γίνεται με τις στάσεις της.
- Πόσες ειδοποιήσεις βγαίνουν στην πράξη ανά είδος (αν τα όρια 5 και 8 κόβουν κάθε μέρα ή σπάνια).
- Αν ο βοηθός χρησιμοποιείται καθόλου, και από ποιους.
- Η σελίδα «Καταγραφή Σφαλμάτων» και οι τρεις πίνακες (Ελέγχου, Διοίκησης, Απόδοσης): έξω από αυτόν τον έλεγχο.

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- ⌘K με ανοιχτή φόρμα: αλλάζει η σελίδα από κάτω και η φόρμα μένει ανοιχτή; (F21)
- «Επαναφορά» διεθνούς παραγγελίας από τον Κάδο: τι ακριβώς ξαναφτιάχνει (F11).
- Δύο γρήγορες αλλαγές φίλτρου στο Ιστορικό: ο πίνακας δείχνει το πρώτο ή το δεύτερο φίλτρο; (F22)
- Το καμπανάκι με κομμένη σύνδεση για λίγα δευτερόλεπτα: γράφει «Όλα ΟΚ»; (F12)

---

## Owner rule applied to every fix (15/11)

Some moves are corrective: entered after the fact while the work is already running. None of the findings below is answered with a refusal or by hiding a choice. A list shows the fitting candidates first and keeps the rest selectable with the reason; a check warns and records.

## Q1. What lists, typeaheads and filters offer

**F1. The «χωρίς ανάθεση» alert treats a partner load as unassigned.** `core/utils.js:1472-1481` tests only `Truck`; the board writes a partner assignment as `Truck: []` + `Partner` + `Is Partner Trip` (`modules/weekly_intl.js:3854-3856`, `:5016`). The dashboard's own rule is truck OR partner (`modules/dashboard.js:20`). Loose stock pieces are not excluded either (the dashboard excludes them, `dashboard.js:234`). The assistant's observer repeats the truck-only rule (`core/ai-chat.js:1336-1339`).
Scenario: a dispatcher gives tomorrow's export to a partner. Within 5 minutes every user gets a red «Export χωρίς ανάθεση» card and, if desktop notifications are on, a system pop-up «Κρίσιμη ειδοποίηση»; it stays until the load is stamped delivered. Conversely «Οδηγός μη ενημερωμένος» / «Πελάτης μη ενημερωμένος» require a truck (`:1504`, `:1516`), so partner loads never raise them.
Confidence: confirmed in code.
Redesign: one definition of "assigned" (own truck or partner) shared by bell, dashboard and assistant; the alert names who carries the load.

**F2. Critical breakdown alerts go to the wrong desk.** The «Κρίσιμη βλάβη» block sits inside the national-desk branch (`core/utils.js:1541`, `:1575-1590`); the fleet branch (`:1594-1613`) only checks document expiries, although the work orders are fetched for the fleet audience too (`:1456`).
Scenario: a work order is saved as SOS. The national dispatcher and the owner see it in the bell; the fleet manager, whose job it is, sees nothing.
Confidence: confirmed in code.
Redesign: alert families belong to a job (fleet, daily control, invoicing…), chosen per person in one visible place, not wired to named accounts in code.

**F3. Every alert family is cut silently.** `.slice(0, 5)` on return loads, driver not informed, client not informed, CMR, national performance, late national, breakdowns (`core/utils.js:1491`, `:1506`, `:1518`, `:1533`, `:1551`, `:1566`, `:1585`); `.slice(0, 8)` on un-invoiced (`:1626`). Which five survive is the read order, not urgency. The un-invoiced family also drops anything delivered more than 14 days ago (`:1625`), and «Export χωρίς return load» looks only at the current week number (`:1485-1490`).
Scenario: twelve delivered orders wait for an invoice; the page says «8 προς ενέργεια». The four oldest, and anything older than two weeks, are not listed anywhere on this page.
Confidence: confirmed in code. How often the caps bite: not judged.
Redesign: a family shows its true count («12, οι 8 πιο παλιές») with a link to the full list on the owning page; oldest first.

**F4. Audit filters offer only what the last page happened to contain.** «Χρήστης» and «Πίνακας» options are the actors and tables seen in loaded responses (`modules/audit_trail.js:66-71`, `:119-122`, `:578-583`), and one response is at most 200 rows (`:38`).
Scenario: management wants everything a colleague did last month. That person made no change among the latest 200 rows, so the name is not in the list and cannot be chosen.
Confidence: confirmed in code.
Redesign: fixed lists (all active users, all record kinds in work words), independent of what is on screen.

**F5. «Άνοιγμα» and the bell card open a page, not the record.** Every alert carries only a page id (`core/utils.js:1480`, `:1494`, `:1509`, `:1629`; `modules/notifications.js:205-210`). «Χωρίς ανάθεση» opens the order catalogue, not the board where assignment happens. A grouped card («5× …») has no destination at all, only expand (`core/utils.js:1787-1790`).
Confidence: confirmed in code.
Redesign: an alert opens its record in place (the row on the board, the order's sheet), with the action it asks for one click away.

**F6. Quick jump (⌘K) list does not match the menu.** It filters by the group's permission and the item's role only (`core/command-palette.js:21-27`); the menu also applies the item's own permission (`core/router.js:144-157`). Result: pages that answer «Δεν έχετε πρόσβαση» are offered, and pages the role does have («Η Απόδοσή μου», «Ειδοποιήσεις» for some roles) are missing. Matching is lower-case only, no accent folding (`:63-70`): «παραγγελιες» finds nothing. With no query the list is the first 20 menu items in menu order (`:62`), so for a role with more pages the rest, and all three actions, are invisible until typed. It searches pages only: no order, client, plate or driver.
Confidence: confirmed in code.
Redesign: one source for "what this role can open"; accent-insensitive; recent pages first; and real search of orders / clients / plates / drivers with the plain reference form.

## Q2. Written wrong or lost

**F7. «Αναίρεση» reports success without undoing when the field was empty before.** The undo snapshot copies the previous value of each changed field from the cached record (`core/api.js:828-829`; same in `:1371-1372`). A NULL column is absent from a record, so the previous value is `undefined`, which the JSON body drops; the revert PATCH (`:1394`) then carries nothing for that field and the toast still says «Reverted …» (`:1395`).
Scenario: a user fills a field that was blank, sees it was the wrong row, presses Undo within 60 s. Green «Reverted». The value is still there.
Confidence: confirmed in code.
Redesign: undo belongs to the action that offers it (a toast «Αναίρεση» that names what it reverts), and says honestly when it cannot.

**F8. One undo slot for multi-record actions.** Every `atPatch` / `atCreate` overwrites the single slot (`core/api.js:886-888`, `:924-926`, `:1353-1358`); only a few flows suppress or replace it (`modules/orders_intl.js:2150`, custom undo in `modules/orders_natl.js:1452` and `modules/daily_ops.js:1402`).
Scenario: an action that writes the order and then a second record leaves an undo for the second write only. Undo reverts half the action, says «Reverted», and repaints the page.
Also: the button labels the record by `Name`, `Order Number` (a label that never arrives), `Full Name` or plate, else the raw record id (`:887`, `:925`, `:1438`), so for an order the topbar reads «Revert: rec…». All undo texts are English (`:1383`, `:1389`, `:1392`, `:1395`, `:1404`).
Confidence: confirmed in code.
Redesign: undo per action, described in work words («Αναίρεση: ανάθεση φορτηγού στη …»), covering every record that action wrote.

**F9. The assistant's «update record» can write nothing and say it did.** `update_record` passes model-chosen field labels straight to `atPatch` and then toasts «Record updated» and returns success (`core/ai-chat.js:578-594`); the Worker drops any label not in the table's map. The confirm dialog shows the table key, the record id and raw JSON (`:488-493`). The write also bypasses the order's own save chain (stops, national load, ramp).
Scenario: the owner asks the assistant to change a delivery day. The dialog shows a code and a raw field list; he confirms; «Record updated». The label is not the real one, nothing changed; or it is the real one and the stops keep the old day.
Related: `read_orders` returns the first 10 records in read order with no sort (`:538-540`) and reads `Client Name`, which the orders map does not carry (client is a link), so the assistant sees a record id instead of a client name (`:542`). Its work-order tool creates a text-plate order with English toast «Work order created!» (`:565-576`).
Confidence: confirmed in code (the silent drop is the facade rule; which labels the model picks cannot be judged).
Redesign: the assistant proposes and opens the real form pre-filled; it never writes on its own. Any confirmation shows the record in plain words and before → after.

**F10. Assistant reminders never reach the bell and never end.** `set_reminder` stores under the assistant's own per-user key (`core/ai-chat.js:605-618`); the bell reads a different key that nothing writes (`core/utils.js:1654`, the only reference in `core/` and `modules/`). The tool's own description promises a notification. No code ever sets `dismissed` (`ai-chat.js:614` is the only write), so a due reminder stays in the assistant's context for good; the only removal is wiping the whole profile.
Confidence: confirmed in code.
Redesign: a reminder is an ordinary notification with «Έγινε»; one store.

**F11. «Επαναφορά» from the bin creates a new record.** `atRestoreFromTrash` POSTs the saved fields (`core/api.js:1561`). National orders and stock pieces are refused with a reason (`:1536-1551`); everything else is re-created with a new identity, without whatever hung from the original, and the page says «Η εγγραφή επαναφέρθηκε» (`core/utils.js:1968-1972`). If the pre-delete read failed, the delete still happens, nothing enters the bin, and «Restore: rec…» is offered; pressing it answers «Trash entry no longer available» (`core/api.js:1433-1457`, `:1389`). Entry 51 pushes the oldest out silently (`:1448`).
Confidence: new-record behaviour confirmed in code; what an international order loses on restore: needs a look in the live app.
Redesign: deleting is a state on the record (who, when), reversible from the record's own list on any computer; the bin page becomes a filter, not a store.

## Q3. What the shell does not tell

**F12. A failed check reads as "all clear".** Orders, trucks and trailers are read without the failure tag (`core/utils.js:1443-1448`); a failure lands in the outer `catch` that only writes to the console (`:1660`). The list is then empty: dot hidden (`:1725`), header «Όλα ΟΚ» (`:1763`), body «Δεν υπάρχουν εκκρεμότητες · καλή δουλειά!» (`:1813`), page header «0 κρίσιμες…» and «Καμία ειδοποίηση με αυτά τα φίλτρα.» (`modules/notifications.js:145`, `:151`). Only two of the sources raise «Έλεγχος ειδοποιήσεων ελλιπής» (`:1639-1651`).
Confidence: confirmed in code.
Redesign: three distinct states everywhere: nothing due · could not check (with time of last good check) · filters hide everything.

**F13. Bell header, bell footer and list disagree.** Header counts cards after grouping (`core/utils.js:1759-1763`), footer counts alerts before grouping (`:1671`, `:1815`). Cards hidden with ✕ are filtered after the "is there anything" test (`:1776-1780`), so hiding them all leaves a blank list under a header that still says «N προς ενέργεια», and the dot stays lit. ✕ hides until reload; «Αργότερα» on the page persists: two snoozes with different lifetimes (`:1823`, `:1833-1838`).
Confidence: confirmed in code.
Redesign: one count, one snooze, same on bell and page.

**F14. Read / snoozed state lives in one browser.** `NotifStore` is localStorage per username (`core/utils.js:1348-1380`). «Ώσπου να λυθεί» on one PC is «Νέα» on another; nothing says who handled an alert or since when it is open (`modules/notifications.js:15-21`).
Confidence: confirmed in code.
Redesign: state stored centrally, with "since" and "handled by".

**F15. A deletion in the history does not say what was deleted.** The record label comes from the entry's own snapshot (`modules/audit_trail.js:473-484`); for a delete the "after" is empty and the neighbour-derived "before" is switched off for deletes (`:208`, `:228`), so the row shows a bare id and «Διαγραφή εγγραφής» (`:502`, `:542-548`). Linked values show as «#52» (`:373`); records are named by code or reference, not the plain form. With a user or action filter on, every change reads «άγνωστο — το φίλτρο κρύβει τη σειρά των αλλαγών» (`:217`, `:504-508`), which is exactly the "what did this person change" question.
Confidence: confirmed in code, unless the Worker stores a before-snapshot for deletes (not judged).
Redesign: each row names the record in plain words (client, route · day; plate · driver) and names linked values; a delete keeps the last known description.

**F16. Silent bounce at login.** A login the server accepts but whose username is missing from the browser's roster is redirected back to the login page with nothing shown (`core/auth.js:24-30`, `:44-66`; `index.html` has no reason parameter). Same silent bounce for a session that expired before the page loaded.
Confidence: confirmed in code.
Redesign: the login page states why you are here again («η σύνδεση έληξε» / «ο λογαριασμός δεν έχει ρυθμιστεί ακόμη»).

**F17. Alerts that cannot be told apart.** «CMR εκκρεμεί» builds its line from `Order Number` and `Delivery Summary` (`core/utils.js:1536`); the orders map carries neither (`worker/src/index.js:1328`, `:1495-1496`), so the line is blank. «Παραγγελία χωρίς τιμολόγιο» reads `Client Summary` / `Client Name` (`:1629`), also absent: reference only. Titles mix languages («Export χωρίς return load», «National χωρίς Performance»).
Confidence: confirmed in code and map (both quoting forms searched).
Redesign: every alert uses the one plain reference form.

**F18. Two alert engines.** The assistant builds its own list (`core/ai-chat.js:1261-1398`): expiries at 30 days (bell: 14), vehicles with no "active" value skipped (bell: counted), unassigned = international, no truck, delivery strictly after today (`:1337`, so today's deliveries are left out of «delivery <48h»). Its «unassigned >24h» alert needs a creation time on the record (`:1351-1354`) that the facade does not return (no such key in `worker/src/index.js`), so it can never fire. A failure is console-only (`:1376`, `:1392`); top 8 kept (`:1395`). Quick buttons and placeholder are English (`:1432-1445`); the built-in help text still describes the old menus and says Veroia Switch creates a national order (`:654-672`).
Confidence: confirmed in code.
Redesign: the assistant reads the same notification list the bell shows; one definition per alert.

## Q4. Missing for the job

**F19. The bin sees five delete paths on one computer.** Only locations, international orders (one branch), national orders (restore refused), service history and work orders use the soft delete (`modules/locations.js:940`, `orders_intl.js:4143`, `orders_natl.js:1847`, `maintenance.js:1226`, `:2426`); about 37 other delete calls do not. No search, no filter, entries named by internal table key and English field names (`core/utils.js:1913-1964`). Confidence: confirmed in code.

**F20. History has no "older", no export, no search by name.** 200 newest rows per query (`modules/audit_trail.js:38`, `:812-813`), record search by exact id only (`:748`, `:766`), custom range end is cut about three hours before local midnight (`:87-97`, stated in the code). Confidence: confirmed in code.

**F21. Leaving a page has no "unsaved" guard.** `navigate()` (`core/router.js:271-360`) and the palette's actions (`core/command-palette.js:48-56`, including «Αποσύνδεση» with no confirm) run with a form open; the shared modal lives outside the page container. Confidence: likely; needs a look in the live app.

**F22. Audit filter changes are not sequenced.** Each change starts a fetch and paints when it returns (`modules/audit_trail.js:744-761`, `:777-836`); no token ties a response to the filter that asked. Confidence: likely.

**F23. «Ρυθμίσεις» is an empty menu entry** (`core/router.js:414-421`), while real per-person settings exist scattered in the browser (menu groups, sidebar, notification state, assistant profile, desktop notifications asked on first bell open, `core/utils.js:1400-1410`). Confidence: confirmed in code.

**F24. Shell chrome is half English and the role shows as a code**: «Sign out», «Quick jump…», «Nothing to undo», «Loading...», «Offline Mode — data may not be current», role badge in English (`app.html:54`, `:75`, `:343`; `core/router.js:132-135`). Footer «v2.0» and login «v1.0» are both constants (`core/router.js:472`). Confidence: confirmed in code.

**F25. Old-board comparison uses its own week arithmetic** tied to the current calendar year (`core/command-center.js:179-186`), not the shared week definition; the rest of that file's widgets have no caller. Confidence: confirmed in code; only the old national board calls it.

## What is sound (keep)

- Failed load ≠ empty table in the shared error block and in the audit trail (`core/ui.js:262-280`, `audit_trail.js:787-805`).
- Derived "before" values are marked «≈» and explained (`audit_trail.js:516-529`, `:821-824`).
- A refused delete leaves no bin entry and no undo (`core/api.js:1425-1435`).
- Alert state is pruned only after a complete refresh (`core/utils.js:1669`).
- Unknown route says so and shows the id as evidence (`core/router.js:451-459`); a remembered page the role cannot open is forgotten (`:283-289`).
- Login error persists until the next keystroke; double submit is blocked (`index.html:331-381`).

## What was read, what was not

Read: `index.html` script; `app.html` shell markup and boot; `core/router.js`; `core/command-palette.js`; `core/command-center.js`; `core/ai-chat.js` (tools, observer, panel; not the streaming / file-attach code); `modules/audit_trail.js`; `modules/notifications.js`; in `core/utils.js` the notification engine, undo button and bin viewer; in `core/api.js` patch / create / undo / soft delete / restore; `core/auth.js` reject path; the ORDERS and MAINT_REQ maps and the formula translator hits in `worker/src/index.js`; the catalogue sections A, B, C1–C7, C9 as a map.

Not read: `core/ui.js` beyond the catalogue's inventory; `core/relogin.js`, `core/sw-update.js`, `sw.js`; the error-log page; the three dashboards; the Worker's `/audit` route and its write path; CSS. Nothing was run; no table was counted.
