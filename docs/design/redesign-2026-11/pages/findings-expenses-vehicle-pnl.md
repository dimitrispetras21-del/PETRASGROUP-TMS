# Έξοδα δρομολογίων (όψη «Όχημα»), εισαγωγή κάρτας καυσίμων, αποτέλεσμα δρομολογίων και τα χαρτιά του: έλεγχος της σημερινής λειτουργίας

Έλεγχος από ανάγνωση κώδικα στις 15/11/2026. **Τίποτα δεν δοκιμάστηκε στη ζωντανή εφαρμογή, δεν διαβάστηκε η βάση, δεν ελέγχθηκε ο διακομιστής που τρέχει. Τίποτα δεν διορθώθηκε.** Κάθε εύρημα έχει βαθμό βεβαιότητας.

Κανόνας του owner που ισχύει για κάθε διόρθωση (15/11): κάποιες κινήσεις είναι διορθωτικές, γράφονται εκ των υστέρων ενώ η δουλειά ήδη εκτελείται. Όπου παρακάτω «λείπει έλεγχος», η σωστή απάντηση είναι προειδοποίηση, ποτέ άρνηση.

## Σύνοψη

### (α) Επιβεβαιωμένα προβλήματα, με σειρά σοβαρότητας

1. **Η απόδειξη που πληρώθηκε με μετρητά μετρά δύο φορές στα Έξοδα.** Μπαίνει στη στήλη της (π.χ. «Λοιπά») και ξανά στη στήλη «Μετρητά Μ», και το «Σύνολο» της γραμμής, του κάδρου και της εβδομάδας τα προσθέτει και τα δύο. Από τα αρχεία της βάσης φαίνεται ότι το ίδιο γίνεται και στο αποτέλεσμα δρομολογίου και στα χαρτιά του (αυτό θέλει επιβεβαίωση στη βάση). (F11, F12)
2. **Στο αποτέλεσμα δρομολογίων, τα δρομολόγια συνεργατών δεν δείχνουν ποτέ καθαρό.** Το κόμιστρο είναι γνωστό, αλλά η οθόνη θεωρεί «χωρίς κόστος» κάθε δρομολόγιο χωρίς γραμμή εξόδου. Έτσι το γενικό «Καθαρό» πάνω μένει παύλα για πάντα και η πρόταση «Ν από Μ χωρίς καταχωρημένο κόστος» δεν μηδενίζει ποτέ. (F21)
3. **Η κεφαλίδα κάθε εβδομάδας δείχνει καθαρό και περιθώριο ακόμη κι όταν λείπουν κόστη.** Μια εβδομάδα με τα μισά δρομολόγια ακοστολόγητα βγαίνει πράσινη με μεγάλο περιθώριο, ενώ το πάνω μπλοκ της ίδιας σελίδας γράφει παύλα για τον ίδιο λόγο. (F22)
4. **«Πλήρες» σημαίνει τρία διαφορετικά πράγματα.** Στα Έξοδα: κλειστό με καύσιμα και διόδια. Στο αποτέλεσμα: έστω μία γραμμή εξόδου (ένα μικρό τέλος κάρτας αρκεί για να βγει περιθώριο). Στο χαρτί: έξοδα και αξία οδηγού. Η οθόνη δείχνει κέρδος που το χαρτί αρνείται να τυπώσει. (F23)
5. **Στην εισαγωγή κάρτας, η ερώτηση «Να ισχύει στο εξής;» για επιλογή δρομολογίου δεν κάνει τίποτα.** Η απάντηση αποθηκεύεται με τρόπο που η επόμενη εισαγωγή δεν μπορεί να τη βρει. Ρωτιέται σε κάθε διόρθωση. (F13)
6. **Οι γραμμές «Χωρίς δρομολόγιο» δεν δείχνουν πινακίδα.** Η Αλεξία βλέπει ημερομηνία, ποσό, λίτρα, και πρέπει να μαντέψει σε ποιο φορτηγό ανήκει η γραμμή. Η λίστα ανάθεσης δείχνει μόνο τα δρομολόγια της εβδομάδας που είναι ανοιχτή, γραμμένα με πινακίδα και ημέρες, χωρίς οδηγό και διαδρομή. (F1, F2)
7. **Η όψη «Όχημα» δεν δείχνει όλα τα έξοδα του φορτηγού.** Λείπουν οι χρεώσεις της κάρτας που δεν έχουν δεθεί ακόμη σε δρομολόγιο, τα φορτηγά που έχουν βγει από τον στόλο δεν επιλέγονται καθόλου, και τα λίτρα του ψυγείου αθροίζονται μαζί με του φορτηγού. (F3, F4, F24)
8. **Τα εθνικά δρομολόγια του νέου πίνακα μένουν για πάντα «Σε εξέλιξη» στα Έξοδα.** Δεν γίνονται ποτέ «Ελλείψεις», άρα η σελίδα δεν ζητά ποτέ τα καύσιμα και τα διόδιά τους. (F25)
9. **Στην εισαγωγή, μια γραμμή «πρόταση» δείχνει κενό όνομα δρομολογίου («— · »)** όταν η κατάσταση είναι παλαιότερη από τις εβδομάδες που είχε ανοιχτές η σελίδα Εξόδων· σε δεύτερη εισαγωγή στην ίδια συνεδρία οι λίστες μένουν για λίγο με τα δρομολόγια της προηγούμενης. (F14)
10. **Στην εισαγωγή, το παράθυρο «Επιλογή δρομολογίου» ανοίγει με άλλο φορτηγό προεπιλεγμένο** όταν το φορτηγό της γραμμής δεν έχει δρομολόγιο στην περίοδο. Ένα κλικ δένει το καύσιμο σε ξένο φορτηγό χωρίς προειδοποίηση. (F5)
11. **Στη διόρθωση γραμμής, το σβήσιμο της σημείωσης δεν αποθηκεύεται.** Η παλιά σημείωση ξαναεμφανίζεται. Το ίδιο για λίτρα, χιλιόμετρα, πρατήριο. (F15)
12. **Στο «Νέο δρομολόγιο» του αποτελέσματος, η «Σημείωση» δεν αποθηκεύεται ποτέ.** (F16)
13. **Μετά από καταχώρηση κόστους από το αποτέλεσμα, το ανοιχτό πλαίσιο δείχνει τη νέα γραμμή με τα παλιά σύνολα.** (F17)
14. **Η «Εκτύπωση» εβδομάδας τυπώνει όλη την εβδομάδα**, ακόμη κι αν η οθόνη είναι φιλτραρισμένη σε ένα φορτηγό ή σε «Εθνικά», και η κεφαλίδα δείχνει τα φιλτραρισμένα ποσά. (F26)
15. **Μηνύματα και λίστες με κωδικούς** αντί για φορτηγό, οδηγό, ημέρα: κεφαλίδα κάρτας αποτελέσματος, «φορτίο #…», «Χειροκίνητη #…», «RT #…». (F33)

### (β) Τι δεν κρίθηκε από τον κώδικα

- Αν η βάση όντως μετρά δύο φορές τα μετρητά στο αποτέλεσμα (διαβάστηκε μόνο το αρχείο αλλαγής της βάσης, όχι η ζωντανή όψη).
- Αν ο αναγνώστης της κατάστασης κάρτας διαβάζει σωστά κάθε παραστατικό: κρίθηκε μόνο τι δείχνει η οθόνη όταν κάτι δεν διαβάζεται.
- Οι κανόνες του διακομιστή για την καταχώρηση της εισαγωγής (πέρα από όσα αναφέρονται ρητά), και οι όψεις της βάσης πίσω από τα χαρτιά.
- Πόσες γραμμές «Χωρίς δρομολόγιο» υπάρχουν σήμερα (αν ξεπερνούν τις 300, οι παλιές δεν φαίνονται: F27).
- Τίποτα για δικαιώματα και ασφάλεια (εκτός δημόσιου αρχείου, κατά κανόνα).

### (γ) Τι θέλει ματιά στη ζωντανή εφαρμογή

- Ένα δρομολόγιο με απόδειξη μετρητών: το «Σύνολο δρομολογίου» στα Έξοδα, το «Σύνολο κόστους» στο αποτέλεσμα και το χαρτί του, δίπλα δίπλα (F11, F12).
- Μια εβδομάδα με συνεργάτες στο αποτέλεσμα: τι γράφει η κεφαλίδα της και τι το πάνω μπλοκ (F21, F22).
- Εισαγωγή κατάστασης παλαιότερης των τεσσάρων εβδομάδων: τι γράφουν οι γραμμές «πρόταση» (F14).
- Γρήγορη αλλαγή εβδομάδας ή εύρους με τα βελάκια: αν μένει λάθος εβδομάδα στην οθόνη (F18).
- Αρχείο κατάστασης πάνω από 8 MB: αν υπάρχει το ZIP στη λίστα «Εισαγωγές DKV» (F28).
- Έξοδος από την προεπισκόπηση εισαγωγής μέσω του πλαϊνού μενού: αν χάνονται οι διορθώσεις χωρίς ερώτηση (F29).

---

# Detailed findings (English)

Conventions: `ex` = `modules/expenses.js`, `ei` = `modules/expenses_import.js`, `ct` = `modules/costs.js`, `pp` = `modules/pnl_paper.js`, `wk` = `worker/src/index.js`. Confidence: **C** confirmed in code · **L** likely · **LIVE** needs a look in the live app. "Redesign:" is a design answer, not a code fix.

## A. What the lists, typeaheads and filters offer

**F1 — Unallocated lines carry no vehicle.** `ex:2009-2014, 2030-2040`. The line row of the «Χωρίς δρομολόγιο» panel shows date, category, payment, note, litres, country, amount, who. The line's truck or the plate read from the card is never printed, although the table stores both (`wk:4900`). Scenario: the accountant opens the fuel cell of the row, sees six fuel lines, and has nothing to tell her which truck each belongs to. **C.** Redesign: an unallocated line is named by plate first; lines are grouped by plate, and each group offers that truck's trips.

**F2 — «Ανάθεση σε δρομολόγιο…» offers only the selected week, with a thin label.** `ex:2021-2025`. Candidates are `_ex.rts` (trips that *start* in the selected week), labelled plate · dates. No driver, no route, no "this truck first". A charge dated on the Friday before a trip's week, or on a trip that started the week before and is still on the road, has no valid candidate; all trucks' trips are listed for every line. **C.** Redesign: offer first the trips of the line's own truck that run over the line's date (whatever week), then the rest, each written as plate · driver · days · route.

**F3 — Vehicle picker lists active trucks only.** `ex:640, 1100`. A truck sold or parked mid-period cannot be selected, so its trips of the last 4/8/12 weeks cannot be reviewed per vehicle. **C.** Redesign: list every truck that has a trip in the range; mark the inactive ones, do not hide them.

**F4 — Vehicle range is three fixed windows ending this week.** `ex:101, 663-668`. «Τελευταίες 4/8/12 εβδομάδες» always end at the current week; trips are included by start date. There is no earlier period, no month, no year. Reviewing a truck for a past quarter is impossible here. **C.** Redesign: a period control (month / quarter / custom) with the same week arithmetic as the rest of the app.

**F5 — Import trip editor preselects another truck.** `ei:1060-1076`. The «Φορτηγό» select lists only trucks that have a trip in the statement period ±30 days. When the line's own truck has none (reason «καμία διαδρομή … την ημέρα»), the select falls to the first truck alphabetically and the trip list below shows that truck's trips. One click books the fuel on a foreign truck's trip; nothing marks the mismatch. **C.** Redesign: always show the line's truck, with "no trip in the period" said in words; choosing a trip of a different truck is allowed and carries a visible warning mark on the row.

**F6 — Import trip search drops the matcher's suggestions and searches by trip code.** `ei:1067-1068, 1105-1115`. Typing in the search box rebuilds the list without the ★ candidates-first order; the option label starts with the internal trip code. **C.** Redesign: one list, suggestions pinned on top, each option plate · driver · days · route.

**F7 — Import category chips cover five categories.** `ei:42-49`. Lines the reader classified as «Λοιπά» (every new product code lands there, `ei:630-632`), reefer fuel and anything else have no chip; they can be reached only through «Όλα». The lines that most need a decision are the ones without a filter. **C.** Redesign: chips are built from the categories present in this statement, with «Λοιπά / νέος κωδικός» first when non-empty.

**F8 — Search placeholders promise what the search does not do.** `ex:801-807, 1151`. Week tab says «Πινακίδα, οδηγός, πελάτης», vehicle tab «Οδηγός, πελάτης, ημερομηνία». The haystack is plate, driver, route text and stop names/cities. Customer and date are not searched. **C.** Redesign: search what the placeholder names, or name what is searched.

**F9 — Trailer and truck lists in entry and correction are unfiltered and unmarked.** `ex:1724-1725, 2052-2053`; `ei:984-985`. Reefer trailer select and the import's «σύνδεση με φορτηγό» list every unit including inactive, without a mark. Under the owner's rule this breadth is right (late entry for a unit that has left); what is missing is the mark and "the trip's own trailer first". **C.** Redesign: keep all, order by relevance, mark inactive.

**F10 — TRIP PnL has no period filter, and its quick filters count on the wrong base.** `ct:339-340, 682-700`. The page loads every trip ever; the Worker already accepts from/to/truck (`wk:5326-5329`) but the page never sends them. Type buttons are enabled by the count over all vehicles, so with one truck selected «Εθνικά» can be clickable and open an empty list. **C.** Redesign: period first (week / month / custom), then vehicle and type; every filter shows its own count under the other filters.

**Found sound:** country combobox (`ex:1645-1708`), payment list taken from the Worker's own vocabulary (`ex:63-67`), import reasons for "no trip" as a fixed vocabulary (`ei:926-947`), duplicate-ZIP refusal with who/when (`ei:413-419`).

## B. What is written wrong or lost

**F11 — A cash-paid receipt is counted twice on the expenses sheet.** `ex:870, 771-793, 1567-1570`; rule in `worker/migrations/042_cash_lines_to_payroll.sql:1-45`. Since 21/9 the database sets a trip's «Μετρητά Μ» to the sum of its cash-paid cost lines. The sheet's trip total is "all cost lines + Μετρητά Μ". Scenario: a cash parking receipt is entered under «Λοιπά»; the row shows it under «Λοιπά» and again under «Μετρητά Μ»; row total, frame total, summary «Σύνολο εξόδων» and the week grand total all include it twice. **C** for the screen arithmetic.

**F12 — The same double count appears to reach the P&L and its papers.** `worker/migrations/073_plan_money.sql:547, 598-602`; `pp:135-139`; `ct:1055-1062`. The cost view as written adds every cost line (cash ones included) plus the payroll expenses figure. The paper lists the receipt in its category and again in «Οδηγός · έξοδα», and its own proof passes because both sides double count. **L** (migration file read; live view not checked) → **LIVE**. Redesign for F11/F12: one euro appears in one column. Either «Μετρητά Μ» is a *view* of the cash lines (a payment-method subtotal, outside the sum) or it is the only place they count; the frame says which.

**F13 — «Να ισχύει στο εξής;» for a trip choice is stored in a form that is never read.** `ei:1131-1133`; `wk:6000-6008`; `worker/src/import-rules.mjs:517`. The screen sends the rule key as an object (plate + category); the matcher looks for a rule whose key *equals the plate text*. No match is possible. The lookup for an existing rule also uses the object as text, so every such rule collides on the same key. Even if matched, the rule points at one past trip. Scenario: the accountant answers OK forty times in one statement; the next statement behaves as if she had not. **C.** Redesign: remove the question for trips. Keep "from now on" only where it can be true: product code → category, card plate → truck.

**F14 — Suggested-trip labels are frozen from the wrong trip list.** `ei:448-453, 474, 485-487, 922-923, 1036-1053`. Line matches are normalised *before* the period's trips are fetched, against whatever the expenses page had loaded (five weeks around its selected week), or against the previous import's list (`_ei.rts` is not cleared in `ei:210-218`). Candidates not found keep only an id, so a «πρόταση» row reads «— · ⌄». The stored objects are never rebuilt when the right list arrives. **C** in logic; frequency **LIVE**. Redesign: a row is drawn only when its trip can be named; until then it says "loading trips of the period".

**F15 — A cleared field is not saved on correction.** `ex:2155-2156, 2166-2171`. Note, litres, km and station are sent only when non-empty; the Worker changes only the keys it receives (`wk:5002`). Scenario: remove a wrong receipt number, press «Αποθήκευση», give the reason; the old number is back. No message. **C.** Redesign: a correction shows before → after per field in the confirmation, including "emptied".

**F16 — «Σημείωση» of «Νέο δρομολόγιο (RT)» is never sent.** `ct:1216` vs `1231-1239`. **C.** Redesign: drop the field or store it; no input without a destination.

**F17 — After «Καταχώρηση κόστους» from TRIP PnL the open panel mixes new lines with old totals.** `ct:1159`. The reload is not awaited before the panel is redrawn: the panel shows the new line in «Γραμμές», while «Σύνολο κόστους», the two result tiles and the derived «Φθορά» come from the trip row read before the save (wear can shrink on screen by the new line's amount). It stays so until the panel is reopened. **C.** Redesign: the panel redraws from one fresh read, with a short "ενημερώνεται" state.

**F18 — Fast week or range changes can leave the wrong data under the right title.** `ex:594-616, 648-682`. Each load overwrites shared state when it returns; nothing ties a response to the request that is still current. Three quick clicks on ‹ can end with an older response drawn last: the title says the new week or range, the rows (or "no trips") belong to another window. **L** → **LIVE**. Redesign: none visible; the build must discard stale answers. Worth a loading state per week chip.

**F19 — Reason prompts that are cancelled leave the control showing the choice.** `ex:2198-2201`. Choosing a trip in «Ανάθεση σε δρομολόγιο…» and then cancelling the reason leaves the select on the chosen trip; nothing was written and nothing says so. **C.** Redesign: reason is a field inside the same small confirmation, with the action button; cancel restores the control.

**F20 — Import rules are written "best effort" and their failure is silent.** `wk:5996-6013`; `ei:1199-1205`. Lines are committed first; each rule is then written on its own, errors go to the server log only, and the screen never shows how many rules were kept. A category rule on a line without a product code is skipped (`wk:6002`) after the user was asked «…για τον κωδικό προϊόντος —;» (`ei:1142-1144`). **C** / **L** for how often a line lacks the code. Redesign: the commit summary lists "rules kept: n" and names any that were not.

## C. What the page does not tell

**F21 — Partner trips can never be "complete" on TRIP PnL.** `ct:548-551, 843-870 (ctCardNums), 631-653, 1108-1110`. Completeness = at least one cost *line*. A partner trip's cost is the agreed rate, which is not a line. Its card shows «+ Καταχώρηση κοστών» and dashes; its panel says «Κόστη ελλιπή — καμία γραμμή κόστους ακόμη» next to a note that the partner's fuel and tolls are not ours. The headline stays "N of M without cost" and the overall «Καθαρό» stays «—» for as long as one partner trip exists. **C.** Redesign: one completeness rule, the database's (expenses or partner rate, plus driver value for own trucks), shown as a per-trip checklist of what is missing.

**F22 — Week headers show net and margin over incomplete costs.** `ct:952-958, 993-997`. Week net = revenue − costs for all trips, blanked only when a *revenue* is missing. With half the trips uncosted the header shows a large green net and margin; the block at the top of the page shows «—» for the same data. **C.** Redesign: a week (and any group) follows the same rule as the total: result only over complete trips, with "n of m complete" beside it, as the week paper already does (`pp:325-335`).

**F23 — Three meanings of «πλήρες».** `ex:757-765`; `ct:548-551`; `pp:17-20, 265`. Expenses: closed + a fuel line + a toll line. P&L screen: one cost line of any kind (a single card-fee line unlocks net and margin). Paper: database rule. Scenario: the owner sees a trip with a healthy margin on screen, prints it, and the paper prints «Αποτέλεσμα —, Λείπει: καύσιμα». **C.** Redesign: one word, one rule, one source; the screen shows the same "λείπει: …" line as the paper.

**F24 — The vehicle view is not the vehicle's full cost.** `ex:683-686, 777, 1220`; `ex:78, 788-789, 1205-1206`. (a) Card lines of this truck that are still unallocated are not loaded or shown in the vehicle tab; the total is understated with no note. (b) «Καύσιμα» merges truck diesel and reefer diesel, and «Λίτρα» sums both, so litres cannot be read against kilometres. (c) Odometer readings are captured per fuel line (`ex:1824, 1903`) and never used: no km, no L/100 km, no €/km anywhere in the view. **C.** Redesign: vehicle view = everything charged to the truck in the period (allocated or not, said separately), with truck fuel and reefer fuel apart and consumption per trip when two readings exist.

**F25 — New-board national trips never ask for their expenses.** `ex:750, 757-765` (no reader of `ended`); `wk:4775-4790`. Those trips keep status "planned" for life; their end is a separate field the sheet ignores. They read «Σε εξέλιξη» for ever, never «Ελλείψεις», and never count in the week's gap number. On TRIP PnL the same trips read «Σχεδιασμένο» (`ct:196-203`). **C** (given the Worker's own comment on status). Redesign: "ended" is one derived fact used by every money screen.

**F26 — «Εκτύπωση» on a week header ignores the screen's filters.** `ct:992, 1141`; `wk:5391-5393`. The link carries only the week's dates. With «Όχημα» or «Εθνικά» selected the header shows filtered sums and the paper prints every trip of the week. Nothing on either says so. **C.** Redesign: the print button states its scope ("όλη η εβδομάδα · 14 δρομολόγια") or prints what is filtered and says so in the paper's header.

**F27 — Unallocated lines are read in one page of 300, newest first.** `ex:621`; `wk:4974-4991`. The sheet never follows the "more" marker. Card-fee lines stay unallocated for good, so the pile only grows; past 300, older weeks' «Χωρίς δρομολόγιο» rows silently lose lines and their totals. The per-trip read has the same cap (unlikely to bite). **C** in code; whether reached **LIVE**. Related: the count of unallocated lines outside the selected week is computed and never shown (`ex:796`), and a line without a date is never listed (`ex:751`).

**F28 — A statement over 8 MB is not stored, and the footer says it is.** `ei:395-401, 1160`. **C** (catalogue finding, re-verified). Redesign: say "the archive was too large to keep; keep your copy" on the preview and on the import's row.

**F29 — The import preview has no draft.** `ei:220-223`; `ex:709-724`. «Άκυρο» discards every correction after one confirm; leaving through the side menu is not guarded in this file (**L**, router not read → **LIVE**). The past-imports card lists drafts as «πρόχειρο» with only a «ZIP» link. A statement that does not reconcile (one unread document) cannot be saved, continued or partly booked. **C.** Redesign: an import is a document with a state (read → being reviewed → booked); corrections are kept as they are made.

**F30 — The import's tick boxes can only block.** `ei:535, 573-577, 896`. Every line is ticked; unticking any line disables «Καταχώρηση». The control has no successful use. **C.** Redesign: remove the column; "exclude a line" does not exist in an all-or-nothing statement.

**F31 — Group header of a plate names one trip as if it were the group's.** `ei:778-786`. The head shows the driver, dates and route of the first "sure" line's trip; a plate's half-month usually spans several trips and drivers. **C.** Redesign: group plate → trip → lines, so the header is true by construction.

**F32 — Unread documents are named by file and an internal reason word, five at most.** `ei:623-626`; `core/dkv-parser.js:975-1031`. «Δεν διαβάστηκαν (n): … · no-lines-parsed …». The rest are an ellipsis. **C.** Redesign: a list of every unread document with a plain reason and what to do (the amount it should carry, from the statement summary).

**F33 — Codes as the subject.** `ct:814, 820, 1102, 1121-1122` (trip code as card and panel headline; «διεθνές φορτίο #…», «εθνικό φορτίο #…»); `ei:863` («Χειροκίνητη #…»), `ei:918` («RT #…»), `ei:1068` (trip code first in options), `ei:1158` (document id in the footer); `ex:1482`. Against the plain-messages rule of 8/11. **C.** Redesign: plate · driver · day for trips, customer · from → to · day for loads, everywhere.

**F34 — Smaller silences.** (a) A successful manual save, edit, delete or assignment gives no confirmation; the import's success uses the error toast in "info" tone (`ex:1962-1977`; `ei:1205`). (b) Totals row: category columns follow search and chip filters, the grand total and the "lines" count do not, so the columns do not add up to the total under a filter; the vehicle label counts filtered trips next to unfiltered lines (`ex:1195-1199, 1213`). (c) Read-only role sees no sign that the page is read-only (`ex:1081, 1258`). (d) P&L settings change every past trip's result at once, with no date of effect and no history on screen (`ct:1258-1265`). (e) «Ανά Εβδομάδα» numbers weeks by a different formula than the list and the paper (`ct:777` vs `111-126`). (f) The P&L reconciliation note counts orders only from a fixed start date and names five (`ct:1024, 1038`). (g) After an import is booked the page returns to the week that was selected before, not to the statement's period (`ei:1206`). (h) The week paper refuses the whole week when one trip's rows do not add up, and when the week holds more than 120 trips (`pp:287-293`): correct by design, but the screen gives no hint before the click. All **C**.

## D. What is missing for the job

**F35 — No backlog of unallocated charges.** Lines appear only inside the week of their own date; there is no single list "waiting for a trip", by truck, across weeks (`ex:751, 796`). **C.**

**F36 — No bulk decision in the import.** Fifteen lines of one plate with the same reason need fifteen separate choices and fifteen native confirms (`ei:1122-1135`). No "all lines of this plate on these days → this trip". **C.**

**F37 — From "no trip that day" there is no way forward on the spot.** The row says «Πιθανό δρομολόγιο που δεν καταχωρήθηκε» and offers only a trip picker (`ei:933-934, 960`). There is no note to the dispatcher, no "leave on the truck, decide later" state distinct from "general". **C.**

**F38 — No export or print of expenses.** Neither the week sheet nor the vehicle view can be exported or printed (`ex`, whole file); the only papers are the owner's two P&L sheets. **C.**

**F39 — Vehicle view has no comparison.** One truck at a time; no fleet table (truck × €/km, L/100 km, tolls by country) to see which truck is out of line. **C.**

**F40 — TRIP PnL cannot be sorted or searched.** Cards are fixed at revenue descending inside weeks; grouped tables at margin ascending; no search by driver, customer or route; no export (`ct:766, 791`). **C.**

**F41 — The trip paper lacks the trailer, the kilometres and a per-km line**, although wear is computed from km (`pp:380-406`). **C.**

**F42 — One reason pattern.** Reasons and confirmations here are browser prompts (`ex:1619, 2142, 2189-2190, 2200`; `ct:1155-1172, 1240-1272`; `ei:221, 1024, 1131, 1142`), while payroll and pallets each use their own in-page pattern. **C.**

**F43 — A correction asks for a reason even when nothing changed**, and always sends the write (`ex:2142-2160`). **C.**

**F44 — Stale words on TRIP PnL.** Empty state and modal still describe automatic trip creation as a future step and a "pilot" (`ct:731-741, 1125, 1218`). **C** (catalogue finding, re-verified).

---

## What I read, and what I did not

Read in full or in the relevant parts: `modules/expenses.js` (state, loaders, stats, grid, frame, entry, edit, delete, assignment, modal; CSS skipped), `modules/expenses_import.js` (all logic; CSS skipped), `modules/costs.js` (fetch wrapper, week helper, load, completeness, summary, grouping, panel, modals, settings), `modules/pnl_paper.js` (all), `print_pnl.html` (script), `worker/src/index.js` routes `/costs/rt` GET/PATCH, `/costs/lines` GET/POST/PATCH/DELETE, `/costs/lookups`, `/costs/pnl`, `/costs/pnl-paper`, the rule-writing part of `/costs/import/commit`; `worker/src/import-rules.mjs` (trip matcher only); headers of migrations 042, 073 (cost view), 105; catalogue C sections 0–3.

Not read: the body of `core/dkv-parser.js` beyond its structure and error vocabulary; the Worker's `/costs/import/parse` and most of `/commit`; `/costs/ledger`, `/costs/settings`, `/costs/stock-lots`, `/costs/pallet-gate`; the database views themselves (only migration text); `core/router.js`; tests. Nothing was run. The facade table map was not involved: every read and write in scope goes through the `/costs/*` routes, which pick named columns, so the "label missing from the map" trap does not apply here.
