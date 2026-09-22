# Part B — Μισθοδοσία / Έξοδα / DKV / TRIP PnL (Worker `/costs/*`)

Ομάδα β. Βάση: `549a2a4`, worktree `compassionate-clarke-35f715`. Read-only· καμία εγγραφή στη βάση, κανένα
δίκτυο πέρα από ανάγνωση repo. `docs/tms-auditor/graph/part-b.json` είναι η μηχανική αναπαράσταση· εδώ η αφήγηση.

## Τι επαληθεύτηκε από το 02a/02b και τι προστέθηκε

Τα F-33 έως F-36 (02a) και τα B-04 έως B-10 + B-20 έως B-25 (02b) διαβάστηκαν και έγιναν κόμβοι/ακμές με
`file:line`. Πάνω σε αυτά προστέθηκαν: ο πλήρης χάρτης routes→functions→tables/views/triggers που λείπει από το
02b (`worker/src/index.js` handleCosts 3005-4141, `worker/src/rt-rules.mjs`, `ledger-rules.mjs`,
`import-rules.mjs`, `ledger-month.mjs`, `costs-line-rules.mjs` — αρχεία που το 02b αναφέρει μόνο περιφραστικά),
οι 9 πραγματικοί triggers της αλυσίδας χρήματος (`dl_sync_from_rt`, `dl_cash_sync_line/entry`, `dl_cash_lock`,
`rt_reopen_on_leg`) με τον πλήρη ορισμό τους από τα migrations 011/042/045, και 6 `failure_modes` που το 02a/02b
δεν είχαν εντοπίσει καθόλου (βλ. παρακάτω).

## Η αλυσίδα χρήματος, όπως επαληθεύτηκε στον κώδικα

`orders`(team α) --trg 031/033--> `ct_round_trips`/`ct_rt_legs` --trg 011 `dl_sync_from_rt`--> `dl_entries`
(γραμμή `trip`, ποσά NULL = pending, ΠΟΤΕ 0). Παράλληλα `ct_cost_lines` (χειροκίνητα από modules/expenses.js, ή
εισαγωγή DKV) --trg 042 `dl_cash_sync_line`--> `dbfn:dl_cash_sync` γράφει `dl_entries.expenses` = Σ CASH του RT,
με κλείδωμα (`dl_cash_lock`) που εμποδίζει χειροκίνητη αντικατάσταση όσο υπάρχουν γραμμές CASH. Το TRIP PnL
(`view:ct_v_rt_pnl`) διαβάζει και τα δύο: `ct_cost_lines` ΚΑΙ `dl_entries.trip_value/expenses`
(`view:ct_v_rt_costs`, migration 011 γρ. 277-290) — η μισθοδοσία είναι μέρος του κόστους, όχι ξεχωριστό βιβλίο.

## Τα 6 ευρήματα σιωπηλής αποτυχίας (FM-b-01 … FM-b-06)

1. **FM-b-01 (το πιο σοβαρό).** `modules/costs.js:812-815` (`ctCloseRt`, το χειροκίνητο κουμπί «Κλείσιμο» στο
   TRIP PnL) στέλνει `PATCH /costs/rt/:id {status:'closed'}` χωρίς κανέναν έλεγχο ανοιχτού σκέλους. Ο Worker
   (`worker/src/index.js:3249-3261`) δεν ελέγχει τίποτα τέτοιο ούτε αυτός. Αντίθετα, η αυτόματη διαδρομή κλεισίματος
   στο `core/rt-feed.js:439` (team α) ελέγχει ρητά `_rtOpenLegs` πριν κλείσει το ίδιο RT. Το 045
   (`rt_reopen_on_leg`) ΞΑΝΑΝΟΙΓΕΙ ένα κλειστό RT όταν προσαρτηθεί ΝΕΟ ανοιχτό σκέλος — αλλά δεν εμποδίζει το
   αρχικό, λάθος, κλείσιμο. Ο έλεγχος B-02 το πιάνει (0 στις 22/9) αλλά **δεν τρέχει αυτόματα** (δεν υπάρχει
   pg_cron, 02b §1.6) — μόνο χειροκίνητα SQL.
2. **FM-b-02.** Στο `POST /costs/import/commit`, όταν η λογίστρια επιλέγει «σβήσε τη χειροκίνητη» για ένα διπλό
   ζευγάρι, ο Worker σβήνει τη χειροκίνητη γραμμή ΜΕΤΑ την εισαγωγή (`worker/src/index.js:4010-4029`)· αν η
   διαγραφή αποτύχει, το id πάει σε `manualDeleteErrors` που **επιστρέφεται** στην απάντηση
   (γρ. 4090) αλλά το `modules/expenses_import.js:1155-1161` (`eiCommit`) διαβάζει μόνο `res.manual_deleted`
   (πλήθος), ποτέ `res.manual_delete_errors`. Αποτέλεσμα: το toast λέει «επιτυχία», η διπλή γραμμή μπορεί να
   μείνει ζωντανή δίπλα στην εισαγόμενη — διπλό κόστος στο PnL, και αν είναι CASH, διπλό στη μισθοδοσία μέσω 042.
3. **FM-b-03.** `ctFetch` (`modules/costs.js:36-64`, κοινό σε costs/expenses/expenses_import/payroll) πετάει
   σκέτο `Error('HTTP 401')` χωρίς ανακατεύθυνση στο login — ήδη σημειωμένο γενικά στο 02a F-02, εδώ επιβεβαιώθηκε
   με ακριβή πηγή στο δικό μου αρχείο. Φανερό (φαίνεται σφάλμα) αλλά ανεξήγητο για τον χρήστη.
4. **FM-b-04.** `dbfn:dl_cash_sync` (migration 042, γρ. 73-74) επιστρέφει αμέσως χωρίς καμία ενέργεια αν το RT
   δεν έχει ζωντανή γραμμή `dl_entries` τύπου `trip`. Μια γραμμή CASH σε τέτοιο RT δεν φτάνει ΠΟΤΕ στη
   μισθοδοσία, και ούτε το B-04 (μετρά μόνο RT χωρίς γραμμή, όχι «CASH ορφανό») ούτε το B-07 (χρειάζεται ήδη
   `dl_entries` για να συγκρίνει) το πιάνουν.
5. **FM-b-05.** Η μαζική πληρωμή (`modules/payroll.js:1508-1529`, `dlBulkSubmit`) στέλνει διαδοχικά POST και
   σταματά στο πρώτο σφάλμα — **σωστά** σχεδιασμένο (δείχνει ✓/✕ ανά γραμμή), αλλά χωρίς `batch_id`· μετά τα
   γεγονότα κανείς δεν μπορεί να ανασυνθέσει «αυτό ήταν ένα μαζικό run N από M» χωρίς να ταιριάξει timestamps.
6. **FM-b-06 (νεκρός κώδικας, όχι ενεργό σφάλμα).** `GET /costs/lines` (γρ. 3333-3335) φιλτράρει ακόμη
   `category==='cash_m'` για μη-owner ρόλους — κατηγορία που η migration 011 αφαίρεσε από το CHECK constraint.
   Αβλαβές σήμερα, αλλά κάθεται πάνω στη διαδρομή ανάγνωσης χρήματος.

## Δικαιώματα — COSTS_PERMS (`worker/src/index.js:2967-2990`)

Κανένα wildcard (`ctCan`, γρ. 2991-2994) — αντίθετα από το facade `/v0`. owner: όλα. accountant: lines πλήρες
(GET/POST/PATCH/DELETE, από 7/9), ledger GET/POST/PATCH, import GET/POST, rt μόνο GET/POST, settings μόνο GET.
dispatcher: **μόνο** rt (GET/POST/PATCH/DELETE) + lookups — το χρησιμοποιεί το `core/rt-feed.js` (team α), όχι
κάποια δική μου σελίδα· το front-end (`config.js:335`) κλειδώνει `costs:'none'` οπότε ο dispatcher δεν βλέπει καν
τις σελίδες Μισθοδοσία/Έξοδα/TRIP PnL — δύο διαφορετικοί κανόνες, συνεπείς μεταξύ τους σε αυτή την περίπτωση.
management: ανάγνωση σε rt/lines, αλλά **γραφή** στο ledger (ο Θοδωρής μπαίνει μισθοδοσία, owner 15/9).
warehouse: τίποτα.

## Έλεγχοι — τι υπάρχει, τι τρέχει

Όλα τα B-01…B-25/B-33 του 02b είναι **χειροκίνητα SQL**, όχι εγκατεστημένα (καμία pg_cron, 02b §1.6). Τα
Playwright critics (`expenses-proof.js` 280, `payroll-proof.js` 258, `expenses-import-proof.js` 155 assertions)
τρέχουν με `page.route` πάνω από HAR — **mockάρουν** ολόκληρο το `/costs/*`, άρα αποδεικνύουν μόνο ότι η οθόνη
στέλνει/δείχνει το σωστό σχήμα, ποτέ ότι ο Worker/η βάση επιβάλλουν πραγματικά τον κανόνα. Τα `worker/test/*.mjs`
+ `worker/src/rt-rules.test.mjs` (node:test, χωρίς Worker runtime) καλύπτουν τη λογική επικύρωσης καθαρά — αλλά
`canRemoveLeg` έχει test, ενώ **δεν υπάρχει αντίστοιχος έλεγχος για το κλείσιμο RT** (FM-b-01) γιατί δεν υπάρχει
κανόνας να ελεγχθεί.

## Cross-deps

Προς **α**: η δημιουργία/συγχρονισμός RT εξαρτάται πλήρως από τα triggers στο `orders` (031/033/013) — δικό τους
πίνακας, δικός τους κώδικας εκκίνησης. Προς **γ**: `GET /costs/pallet-gate` διαβάζει `ct_v_rt_pallet_gate` πάνω σε
`pl_movements`. Προς **ε** (×2): το κοινό `audit()`/`getCaller()` infra (ποτέ δεν μπλοκάρει σε αποτυχία INSERT
audit) και η σύγκριση `ctFetch` vs `core/api.js` `_atRetry` (το 401 redirect που λείπει).

## Τι ΔΕΝ επαληθεύτηκε

- Migration **046** (`rt_auto_close`) — αναφέρεται μόνο σε git log, όχι ως αρχείο στο worktree· άγνωστο αν κλείνει
  το FM-b-01 ή αν παρακάμπτεται από το `ctCloseRt` (η ίδια η λέξη «παρακάμπτοντας» υπάρχει σε commit μήνυμα).
- `ct_plate_aliases` — δεν εντοπίστηκε το CREATE TABLE με filename grep στα migrations.
- Το ακριβές σημείο upsert του `ct_cost_docs` draft μέσα στο `/costs/import/parse` (3760-3858, μεγάλο block, δεν
  ξαναανοίχτηκε γραμμή-γραμμή).
- Καμία μέτρηση στη ζωντανή βάση (μόνο ανάγνωση repo + το ήδη μετρημένο 02b της 22/9).

## Στατιστικά

147 κόμβοι, 153 ακμές (0 σπασμένες αναφορές, επαληθεύτηκε με `node -e` JSON.parse), 6 failure_modes, 27
checks_existing, 6 gaps, 5 cross_deps.
