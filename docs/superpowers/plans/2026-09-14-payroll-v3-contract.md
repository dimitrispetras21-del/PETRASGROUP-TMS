# Μισθοδοσία v3 — συμβόλαιο DOM/API μεταξύ των τριών agents (Φάση 1, 14/9/2026)

Spec: `docs/superpowers/specs/2026-09-14-payroll-v3-design.md`. Figma εγκεκριμένα: 600:1011 (καρτέλα), 601:1011 (A4).
Τρεις agents σε worktrees: **A** καρτέλα (`modules/payroll.js`), **B** εκτύπωση+CSV (`modules/payroll_print.js`,
`print_payroll.html`), **C** rig (`tests/critics/payroll-proof.js`). Κανείς δεν αγγίζει το αρχείο του άλλου.
Ό,τι δεν είναι εδώ, ο agent το επιλέγει μόνος — αλλά ό,τι ΕΙΝΑΙ εδώ είναι δεσμευτικό, γιατί το rig το ελέγχει.

## Κοινός helper (ήδη στο `modules/payroll.js`, exported)
`dlPeriod(entries, year, month)` → `{ from, to, rows, opening, closing, totals }`.
`entries` = ΠΛΗΡΕΣ ιστορικό οδηγού (`GET /costs/ledger/:id` ΧΩΡΙΣ `?year=` — αλλιώς χάνεται το υπόλοιπο έναρξης
του Ιανουαρίου). `year` `'YYYY'|'all'`, `month` `''|'01'..'12'`. `rows` χρονολογικά (παλιό→νέο).
`totals = { trips, pendingCount, value, advance, expenses, payments, adjustments, delta }` — μόνο ζωντανές γραμμές.
Οθόνη (A), A4 (B) και CSV (B) περνούν ΟΛΑ από εδώ. Άλλοι helpers: `dlNum` (χωρίς €), `dlMoney` (με €, αρνητικό σε
παρένθεση), `dlDateRange`, `dlDelta` (±, U+2212), `dlTypeWord`, `dlInitials`, `escapeHtml`, `userDisplayName`.

## Καρτέλα οδηγού — view `driver` (A)
State: `_dl.driver` (id), `_dl.year` ('YYYY'|'all'), `_dl.month` ('' | '01'..'12'), `_dl.entries` (πλήρες ιστορικό).
Προεπιλογή: τρέχον έτος, τρέχων μήνας.

| Στοιχείο | Selector / κείμενο |
|---|---|
| ρίζα | `.dl-page` · κεφαλίδα `.dl-head` με σύνδεσμο «← Μισθοδοσία» |
| κουμπιά | `#dlBtnPayment` «Πληρωμή» (`.dl-btn.primary`, το ΜΟΝΟ navy) · `#dlBtnAdjust` «Προσαρμογή» · `#dlBtnTrip` «Δρομολόγιο» · `#dlBtnPrintCard` «Εκτύπωση καρτέλας» · `#dlBtnCsvCard` «CSV» |
| στατιστικά έτους | `.dl-stats` — 5 κουτιά ΔΡΟΜΟΛΟΓΙΑ · ΑΞΙΑ · ΕΞΟΔΑ · ΠΛΗΡΩΜΕΣ · ΧΩΡΙΣ ΑΞΙΑ (dlPeriod(entries, year, ''))· εδώ επιτρέπεται «€» (δεν είναι κελί πίνακα) |
| περίοδος | έτος = ψηφίδες `.dl-ychip[data-year="2026"|"2025"|"2024"|"all"]` (επιλεγμένη `.sel`, navy) · `#dlMonth` `<select>` (`''`=«Όλο το έτος», `'01'..'12'` ελληνικά ονόματα) + κουμπί «Όλο το έτος»· δεξιά «Περίοδος 01–14/09/2026 · 8 κινήσεις»· αλλαγή → re-render χωρίς νέο fetch (διόρθωση 14/9 από Figma 600:1011 — το αρχικό συμβόλαιο έλεγε select `#dlYear`) |
| πίνακας | `.dl-ledger` · κεφαλίδα `.dl-th` (2px κάτω γραμμή) με κελιά ΗΜ/ΝΙΑ · ΚΙΝΗΣΗ · ΑΞΙΑ · ΕΛΑΒΕ · ΕΞΟΔΑ · ΜΕΤΑΒΟΛΗ · ΥΠΟΛΟΙΠΟ (και ένα κενό για το «···») |
| έναρξη | `.dl-row.opening` — «Υπόλοιπο έναρξης περιόδου» + `.n` ποσό (dlNum, χωρίς €) στη στήλη ΥΠΟΛΟΙΠΟ |
| γρήγορη καταχώριση | `.dl-row.qe` με `#dlQeDate` (date, σήμερα) `#dlQeRoute` `#dlQeValue` `#dlQeAdvance` `#dlQeExpenses` και κουμπί `#dlQeSave` «Καταχώριση»· Enter = ίδιο· POST trip όπως σήμερα |
| γραμμή κίνησης | `.dl-row[data-entry="ID"]`· `.dl-row.pending` = δρομολόγιο χωρίς αξία: πορτοκαλί αριστερή ράβδος (`var(--warn)`), ΑΞΙΑ «—», λέξη «χωρίς αξία» μέσα στη γραμμή (`.dl-word`)· `.dl-row.canc` = ακυρωμένη (διαγράμμιση) |
| κελιά ποσών | `.dl-row .n` — ΠΟΤΕ «€» μέσα σε κελί (dlNum)· ΜΕΤΑΒΟΛΗ = `balance_delta` με πρόσημο (dlDelta), ΥΠΟΛΟΙΠΟ = `running_balance` |
| μενού | `.dl-more` («···») ανά ζωντανή γραμμή → `.dl-menu` ανοιχτό με `.dl-menu-edit` «Διόρθωση» (μόνο trip → inline edit όπως σήμερα, Enter=PATCH με reason αν αλλάζει γραμμένο ποσό) και `.dl-menu-cancel` «Ακύρωση» (prompt αιτιολογίας → PATCH `{cancel:true, reason}`) |
| σύνολα | `.dl-totals` (διπλή γραμμή πάνω) — ΑΞΙΑ/ΕΛΑΒΕ/ΕΞΟΔΑ/ΜΕΤΑΒΟΛΗ περιόδου + «Υπόλοιπο τέλους περιόδου» `.dl-closing` (dlNum)· «€» εμφανίζεται ΜΙΑ φορά, στο `.dl-foot` (π.χ. «Ποσά σε €») |
| modal πληρωμής | `#dlModal` ανοιχτό με `#dlPayDate` `#dlPaySeg` (Τράπεζα/Μετρητά) `#dlPayAmount` `#dlPaySave` → POST payment_bank/payment_cash |
| modal προσαρμογής | `#dlModal` με `#dlAdjDate` `#dlAdjAmount` (± , ≠0) `#dlAdjReason` (υποχρεωτικό) `#dlAdjSave` → POST `{driver_id, entry_type:'adjustment', entry_date, amount, note: reason}`· κενός λόγος = μήνυμα `#dlErr`, κανένα POST |
| εκτύπωση/CSV | `#dlBtnPrintCard` → `dlPrintCard(_dl.driver, _dl.year, _dl.month)` · `#dlBtnCsvCard` → `dlCsvCard(driverName, _dl.entries, _dl.year, _dl.month)` — και οι δύο ορίζονται από τον B σε `modules/payroll_print.js` |

Ύφος: formal των Εξόδων (`exStyles`): tokens μόνο, `.dl-btn.primary{background:var(--navy)}`, χωρίς hex, χωρίς pills,
κατάσταση ως γκρι λέξη, `tabular-nums`, σειρές 40px, κεφαλίδα 2px, σύνολα διπλή γραμμή. Λέξεις «του χρωστάμε/μας
χρωστά» ΜΟΝΟ στο hero υπόλοιπο ως γκρι λέξη κάτω από το ποσό (spec #10), πουθενά αλλού.

## Εκτύπωση + CSV (B) — `modules/payroll_print.js` + `print_payroll.html`
Global functions (καλούνται από A και, αργότερα, από την αρχική):
- `dlPrintCard(driverId, year, month)` → `window.open('print_payroll.html?doc=card&driver=ID&year=YYYY[&month=MM]', '_blank')`
- `dlPrintDrivers()` → `window.open('print_payroll.html?doc=drivers', '_blank')`
- `dlCsvCard(driverName, entries, year, month)` → κατέβασμα `μισθοδοσία-<όνομα>-<YYYY[-MM]>.csv`
- `dlCsvDrivers(balances)` → κατέβασμα `μισθοδοσία-οδηγοί-<YYYY-MM-DD>.csv`
- CSV: UTF-8 BOM, διαχωριστής `;`, δεκαδικά με κόμμα, ημερομηνίες `DD/MM/YYYY`. Στήλες καρτέλας:
  `Ημερομηνία;Κίνηση;Αξία;Έλαβε;Έξοδα;Μεταβολή;Υπόλοιπο` (πρώτη γραμμή δεδομένων = «Υπόλοιπο έναρξης περιόδου»).
  Στήλες λίστας: `Οδηγός;Τύπος;Υπόλοιπο;Δρομολόγια έτους;Χωρίς αξία;Τελευταία κίνηση;Τελευταία πληρωμή`.
- `print_payroll.html`: σχετικό URL (ίδιο origin — δουλεύει και τοπικά στο rig)· φορτώνει `core/utils.js`, `modules/payroll.js`
  (για `dlPeriod/dlNum/dlDateRange`) και `config.js` (USERS για `userDisplayName`)· JWT από `localStorage.tms_jwt`,
  `PROXY_URL` όπως το `print.html`· `&noprint=1` = χωρίς διάλογο εκτύπωσης· αλλιώς `window.print()` μετά το render.
  DOM: `#doc` · `.doc-title` («Κατάσταση λογαριασμού οδηγού» / «Κατάσταση οφειλών οδηγών» — το rig ελέγχει case-insensitive) ·
  `.p-meta` (οδηγός, τύπος, περίοδος «01/09/2026 – 30/09/2026», υπόλοιπο έναρξης) · `.p-opening` · `table.p-ledger` (6 στήλες στο
  χαρτί: ΗΜ/ΝΙΑ · ΚΙΝΗΣΗ · ΑΞΙΑ · ΕΛΑΒΕ · ΕΞΟΔΑ · ΥΠΟΛΟΙΠΟ — χωρίς ΜΕΤΑΒΟΛΗ, Figma 601:1011) · `.p-totals` · `.p-closing` (bold, με «€») ·
  `.p-sign` με «Ο οδηγός» και «Για την εταιρεία» · `.p-printed` «Εκτυπώθηκε DD/MM/YYYY από <όνομα από tms_user.name>».
  Χωρίς χρώμα εκτός της navy γραμμής τίτλου (όπως `print.html`). Σφάλμα φόρτωσης = ορατό μήνυμα στη σελίδα (`#err`), όχι κενό.

## Rig (C) — `tests/critics/payroll-proof.js`
Ίδιο σκελετό με `expenses-proof.js`: `preparePage(page,'accountant')`, mocks με `page.route('**/costs/ledger**')`
ΜΕΤΑ το preparePage, captured bodies, `assert()` με ✓, screenshots στο scratchpad, 1280/1440. Route `payroll`
(`gotoPage(page,'payroll',BASE_URL)`), μετά `page.evaluate(() => renderPayrollDriver(11))`.
Fixture: 1 οδηγός (id 11) με τις 6 κινήσεις του `tests/payroll-format.test.js` (dlPeriod test) ώστε τα νούμερα
(opening 450 · closing 130 · Αύγουστος 2026) να είναι ΤΑ ΙΔΙΑ σε unit test, οθόνη, A4 και CSV.
Το σήμερα του rig: `preparePage` δεν παγώνει την ημερομηνία — ο rig ΘΕΤΕΙ περίοδο ρητά (`#dlYear`=2026, `#dlMonth`=08).

## Αρχική με κάρτες — view `home` (Φάση 2, Figma 614:1011 «fin-formal · Μισθοδοσία E», σημειώσεις 616:1011, owner «αποδέχομαι» 14/9 μέσω συντονιστή)
Το master-detail (596:1011) και το φύλλο (607:1011) απορρίφθηκαν από τον owner ως δύσχρηστα. Screenshot στο scratchpad της
συνεδρίας (`figma-614-home-cards.png`). ΔΕΝ υλοποιείται πριν κλείσει η Φάση 1 (ίδιο αρχείο `modules/payroll.js`).

| Στοιχείο | Selector / κείμενο |
|---|---|
| κεφαλίδα | `.dl-head` «Μισθοδοσία Οδηγών» · `#dlBtnBulk` «Μαζική πληρωμή» (`.primary`, το ΜΟΝΟ navy) · `#dlBtnTripHome` «Δρομολόγιο» · `#dlBtnPrintHome` «Εκτύπωση ▾» → `.dl-menu` με `.dl-menu-print-drivers` «Κατάσταση οφειλών οδηγών» (→ `dlPrintDrivers()`) · `#dlBtnCsvHome` «CSV» (→ `dlCsvDrivers(balances)`) |
| λωρίδα μηνών | `.dl-mstrip` 44px, `.dl-marrow` ‹ ›, `.dl-m[data-month="YYYY-MM"]`, επιλεγμένος `.sel` (navy) με «Σεπτέμβριος 2026 · 17 ενεργοί · 34 χωρίς αξία», παρελθόντες «κλειστός», μελλοντικοί «—». State `_dl.homeMonth` = 'YYYY-MM' (προεπιλογή τρέχων). Αλλάζει ΜΟΝΟ τα ποσά μήνα στις κάρτες, όχι το υπόλοιπο |
| φίλτρα | `.dl-filters`: κείμενο «Οφειλή σήμερα <b>» · `.dl-chip[data-filter="pending"]` «Χωρίς αξία n» (πορτοκαλί, ενεργό = ΤΑΞΙΝΟΜΕΙ πρώτους τους εκκρεμείς, δεν κρύβει) · κείμενο «Πληρωμές μήνα <b>» · `.dl-chip[data-filter="active"]` «Ενεργοί n» · `.dl-chip[data-filter="all"]` «Όλοι n» · `#dlSort` select (balance/name/pending) · `#dlSearch` |
| πλέγμα | `.dl-grid` — 4 στήλες ≥1400px, 3 στα 1280 (κάρτα ~275×170, κενό 16) |
| κάρτα | `.dl-card[data-driver="ID"]`, `.dl-card.pending` (3px πορτοκαλί άνω περίγραμμα) · `.dl-avatar` 36px · `.m` όνομα · `.s` τύπος (τίποτα αν null) · `.dl-bal` (Syne 22, dlNum χωρίς €) + `.dl-balword` «του χρωστάμε» / «μας χρωστά» (πορτοκαλί, αρνητικό) / «τακτοποιημένο» · `.dl-ms` 3 mini-stats ΔΡΟΜ. ΜΗΝΑ · ΑΞΙΑ · ΠΛΗΡΩΜΕΣ (dlNum) · `.dl-lastpay` «Τελ. πληρωμή 12/09 · Μετρητά 400,00» ή «Καμία πληρωμή τον μήνα · τελ. 28/08» · `.dl-badge` «n χωρίς αξία» (πορτοκαλί περίγραμμα) όταν pending_count>0 · `.dl-card-pay` «Πληρωμή» · `.dl-card-open` «Καρτέλα →» (→ `renderPayrollDriver(id)`) |
| πληρωμή στην κάρτα | `.dl-cardpay` μέσα στην κάρτα (μία ανοιχτή τη φορά): `.dl-cp-date` (date, σήμερα) · `.dl-cp-seg` (Τράπεζα/Μετρητά, navy η επιλεγμένη) · `.dl-cp-amount` · `.dl-cp-save` «Καταχώριση» (navy) · `.dl-cp-cancel` «Άκυρο» · υπόδειξη «Enter = καταχώριση · Esc = κλείσιμο» · POST `/costs/ledger {driver_id, entry_type:'payment_bank'|'payment_cash', entry_date, amount}` → refetch (όχι τοπική αλλαγή) |
| footer | `.dl-foot` sticky κάτω: «17 οδηγοί · 34 δρομολόγια χωρίς αξία · οφειλή 12.571,64 € του χρωστάμε» + «Ποσά σε €. Υπόλοιπο = συνολικό έως σήμερα · μήνας = κινήσεις με ημερομηνία μέσα στον μήνα» — η ΜΟΝΗ εμφάνιση «€» στην οθόνη (μαζί με «Οφειλή σήμερα»/«Πληρωμές μήνα» στα φίλτρα) |
| δεδομένα | `GET /costs/ledger` (balances)· ποσά μήνα: **εκκρεμεί απόφαση** — 49 ενεργοί οδηγοί με κινήσεις (μέτρηση 14/9) = 49–68 κλήσεις ανά άνοιγμα αν γίνει ανά οδηγό· πρόταση `GET /costs/ledger?month=YYYY-MM` (Worker, μία κλήση PostgREST σε dl_v_entries + άθροιση) και `last_payment_amount` στο dl_v_balance (migration DRAFT). Αν το `month` λείπει από την απάντηση: ορατό «Δεν φορτώθηκαν τα ποσά μήνα», όχι σιωπή |
