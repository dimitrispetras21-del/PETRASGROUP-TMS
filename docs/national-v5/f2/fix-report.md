# Φ2 · εφαρμογή της δεύτερης κριτικής στο πλάνο και ξανα-απόδειξη (23/10/2026, νύχτα, χωρίς παρέμβαση)

**Αρχείο που άλλαξε:** `docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md`, 8.539 → **9.042 γραμμές**, 29 Tasks (νέα βήματα: Task 0 Step 0–5, Β9 Step 2β, Γ3 Step 3β, Κ2 Step 12, Κ3 σε δύο χρόνους, παράρτημα «Απόφαση 21 = εκτός»). Κανένα commit, push ή deploy. Στη Supabase μόνο SELECT (triggers της `orders` και το σώμα του `order_parent_to_legs`, για την απόφαση 35).

**Κριτικές:** `review-sql.md` (1 Critical, 3 Important, 11 Minor), `review-worker.md` (0 / 6 / 11), `review-plan.md` (0 / 5 / 16). Τέσσερα ευρήματα επικαλύπτονται (token: SQL 1 = Worker 1· τόπος VS: SQL 2 = πλάνο 5· ειδοποιήσεις στο board: Worker 9 = πλάνο 11· `drafts/`: Worker 13 = πλάνο 4).

**Πώς έγινε:** οι αλλαγές γράφτηκαν ως script ακριβών αντικαταστάσεων με έλεγχο πλήθους (`scratch/fix_head.py`, `fix_a.py`, `fix_b.py`, `fix_c.py`, `run_fix.py`) πάνω στο αρχικό πλάνο (`scratch/plan-orig.md` = `9f98208d`), ώστε να ξανατρέχουν από την αρχή. Οι αριθμοί μπήκαν μόνο αφού μετρήθηκαν (`fill.py`).

---

## Ξανα-απόδειξη (κατά γράμμα από το τελικό πλάνο)

Scratch: `.superpowers/f2rev/scratch/` (git-excluded). Η μέθοδος είναι αυτή του `.superpowers/f2/final-report.md`: `extract.py` / `extract2.py` ακολουθούν κάθε «πρόσθεσε πάνω από…» και φτιάχνουν τα αρχεία της 072, το `check.mjs` τα τρέχει σε PGlite 0.5.8 (`live-071.sql` + 071 + 071b + ζωντανό 069, **χωρίς** την πλήρη λήψη `live-072.sql`).

| Έλεγχος | Αποτέλεσμα |
|---|---|
| Αφετηρία (πλάνο `9f98208d`, ίδιο scratch) | 169 OK, 0 FAIL· build 12/12 (αναπαράχθηκε πριν από κάθε αλλαγή) |
| 072 apply | «072 OK», 52 `plan_%`, **16** δημόσιες, triggers = B-54, 0 γραμμές v5 |
| verify / dry run / rollback / ξανά apply | `072 in place`, 16/16, `open_to_api 0`· dry run `public 16, service_role EXECUTE 16, open to API 0`· rollback αρνείται με 1 γραμμή v5, μετά `072 ROLLED BACK | 6`· ξανά «072 OK». (`changed_live 7` όπως και στην αφετηρία: λείπει η πλήρης λήψη) |
| **Rules test** | **`Result: 179 OK, 0 FAIL`** (82 Α + 97 Β) |
| `tests/sql-072-drafts.test.js` | 12/12· bootstrap του Α1 6/6· `DRYRUN-IDIO`· ASCII 0 μη-ASCII χαρακτήρες |
| Μεταλλαγές, μία τη φορά | 18/18 ρίχνουν ακριβώς τις περιπτώσεις τους (πίνακας πιο κάτω) |
| Worker (Γ), Task προς Task σε αντίγραφο `worker/` @ `a3117aac…` με την τελική 072 (md5 `d881b2e2…`) | Γ2 Step 4 `fail 4` → Step 7 **195** (contract `pass 6`) → Γ3 Step 4 `pass 6, fail 5` → Step 7 **223** → Γ4 Step 2 `fail 3` → Step 5 **226** → Γ5 Step 2 `fail 6` → Step 4 **232/232**. Κάθε Expected του πλάνου βγήκε ακριβώς |
| Φρουρός | `GUARD OK (11 markers, plan=1)` στη νέα πηγή και σε **διπλό bundle esbuild 0.20.2**· `GUARD OK (9 markers, plan=0)` στην παλιά πηγή· χωρίς `Country` μόνο στα WORKSHOPS: `STOP  WORKSHOPS Country: "country" = 0` (πηγή και bundle) |
| Μεταλλαγές Worker | λάθος όνομα RPC μόνο στον Worker, μετονομασμένο όρισμα μόνο στην 072, στενότερο `PLAN_MONEY_KEYS`, χωρίς try/catch στο Bearer, χωρίς `plan_unknown`, χωρίς 42883, χωρίς μήνυμα conflict, μόνο `amount`: καθεμία `ℹ fail 1`· επαναφορά `fail 0` |
| `node --check` στα JS blocks | 34 blocks: 23 περνούν αυτούσια· 11 είναι αποσπάσματα find/replace (ίδια κατηγορία με πριν) και περνούν μέσα στα αρχεία που συναρμολογούνται (`index.js`, tests, εργαλείο: όλα `node --check` + 232/232) |

**Μεταλλαγές SQL (18):**

| Μεταλλαγή | Πέφτει |
|---|---|
| παλιό token (md5 της λίστας με ποσά) | 5 |
| χωρίς `piece_split` πριν από τη λίστα | B88 (δίνει token) |
| χωρίς «κομμάτι χωρίς σκέλος» | B89 (`need_token` αντί για `bad_input`) |
| χωρίς έλεγχο `stops` = πίνακας | B90 |
| χωρίς άρνηση οδηγού του ίδιου κύκλου | B91 |
| χωρίς τα τρία «ένα δεκαδικό» | B92 (καμία άρνηση), B93 (`pieces_sum` 10,1 ≠ 10), B94 (`not_stock`) |
| χωρίς ανάγνωση «πρώτου» μετά την αλλαγή | B95 (η διεθνής μένει D+1) |
| ειδοποίηση εξόδων ανεξάρτητα από το UPDATE | B96 (δεύτερη ειδοποίηση) |
| «recent» κατά `created_at` | B97 |
| χωρίς στήλη της διεθνούς | B56, B57, B58 |
| αύξηση μόνο σε κομμάτι σε αναμονή | 69 (`piece_dead`) |
| ειδοποιήσεις board για όλους | B72 |
| οι έξι παλιές (first, later, localpay, sweep, keys, payroll) | 78 · 79+80 · 81 · B85 · B79 · B38, όπως πριν |

**Δεν αποδείχθηκε απόψε:** η πλήρης λήψη `live-072.sql` (μένει στο Α1/Σ1), η σειρά κλειδωμάτων σε ταυτόχρονες συνεδρίες (το PGlite είναι μία σύνδεση· η αλλαγή είναι μηχανική, `FOR NO KEY UPDATE` και κύκλοι πριν από παραγγελίες), το smoke στο πραγματικό PostgREST (Γ7 Step 6).

---

## Ευρήματα → τι έγινε

`fixed` = μέσα στον κώδικα/τα βήματα του πλάνου· `owner N` = απόφαση N στη λίστα «Αποφάσεις του πλάνου» (πρόταση + εναλλακτική· όπου υπάρχει κώδικας, γράφει την πρόταση).

### Κριτική SQL (`review-sql.md`)

| # | Σοβ. | Εύρημα | Αποτέλεσμα |
|---|---|---|---|
| 1 | Critical | `confirm_token` δίνει πίσω ποσά | **fixed**: `plan_h_token` = λίστα χωρίς ποσά + έκδοση (xmin, ctid) γραμμών με ποσό, `plpgsql STABLE`· περίπτωση 5 ξαναγραμμένη (ίδιο token με άλλο ποσό, ≠ md5 της λίστας)· απόφαση 7 ξαναγραμμένη, εναλλακτική HMAC/Vault στην ίδια απόφαση· Global Constraints· Κ1 DECISION_LOG. Οι 61, B39, B46 (stale με αλλαγή ποσού) και 65, B37 (ίδιο token ανά ρόλο) πράσινες |
| 2 | Important | `plan_vs_set_place` αφήνει τις στήλες της διεθνούς | **fixed** (κώδικας του κριτή, μόνο όταν η στήλη έδειχνε τον παλιό τόπο, με audit· B frame με `loading/unloading_location_*_id`· B56–B58 ελέγχουν στήλη και κωδικό αναφοράς) + **owner 35** (εναλλακτική: μόνο `order_stops` + προειδοποίηση). SELECT 23/10: `order_parent_to_legs` επιστρέφει αμέσως χωρίς σκέλη |
| 3 | Important | αύξηση σε ανατεθειμένη εθνική = `piece_busy` | **fixed** (`plan_h_resize`: απόθεμα → αναμονή → κομμάτι πρώτης ημέρας· περίπτωση 69 επεκτάθηκε: 10→12 σε αναμονή, μετά 12→14 στο φορτηγό· απόφαση 21, Interfaces) |
| 4 | Important | Μεταφορά πλευράς: μεταφόρτωση στη Βέροια / σπασμένο κομμάτι | **fixed το ελάχιστο (β):** `piece_split` πριν από τη λίστα (B88)· **owner 36** για την «επαναδείκτηση σκέλους» (προτείνεται, πριν από το L, σε δικό της Task· **δεν** γράφτηκε απόψε) |
| 5 | Minor | dry run Μεταφοράς/Διαγραφής ≠ δρόμος εκτέλεσης | **owner 39** (πρόταση: μένει, η λίστα λέει περισσότερα ποτέ λιγότερα, η μόνη μετρημένη «token για αδύνατο» κλείνει από το #4· εναλλακτική: μοτίβο Β2). Το «ελάχιστο» του κριτή (εξαίρεση στάσεων του αιτήματος από το `local_loading`) **δεν** εφαρμόστηκε: θα έκρυβε φόρτωση που όντως φεύγει όταν η στάση δηλώνεται αλλά δεν ξαναχρησιμοποιείται ως φόρτωση (λιγότερα στη λίστα = σιωπή) |
| 6 | Minor | σειρά κλειδωμάτων, `FOR UPDATE` | **fixed**: και τα 28 κλειδώματα γραμμής → `FOR NO KEY UPDATE`· `plan_vs_set_place` κλειδώνει κύκλους πριν από στάση/παραγγελία· `plan_split_piece` κλειδώνει τους στόχους κατά id· σχόλιο της Α6 διορθωμένο (αδιέξοδο που ξεφεύγει = 409 `busy_retry`)· Global Constraints, απόφαση 11 |
| 7 | Minor | ημέρα VS μετά από shift | **fixed** (`plan_rt_update` διαβάζει «πρώτο» και μετά την αλλαγή· preview «from» σωστό· B95) + **owner 37** (εναλλακτική: μόνο `vs_day_differs`) |
| 8 | Minor | τοπική φόρτωση από τον οδηγό του κύκλου | **fixed** (`driver_busy` με τον κωδικό του κύκλου· B91) + **owner 38** (εναλλακτική: δικός κωδικός ή προειδοποίηση· επικάλυψη με άλλον κύκλο → ελεγκτής μαζί με C-27) |
| 9 | Minor | παλέτες με 2 δεκαδικά | **fixed** σε `plan_orders_create`, `take_pallets`, μέρη σπασίματος, `plan_order_update` (απόφαση 20· B92–B94) |
| 10 | Minor | Μεταφορά βάζει σιωπηλά κομμάτι σε αναμονή | **fixed** (`bad_input` `from:no live leg:<id>`· απόφαση 15· B89) |
| 11 | Minor | `stops` όχι πίνακας | **fixed** (B2· B90· Interfaces) |
| 12 | Minor | `search_path` χωρίς `pg_temp` | **owner 43** (πρόταση: γραπτή αποδοχή ως κληρονομιά, καμία αλλαγή κώδικα· εναλλακτική: `public, pg_temp` στην 072) |
| 13 | Minor | δημιουργίες όχι ιδεμπότητες | **owner 44** (πρόταση: όχι `request_id`· Φ4 χωρίς αυτόματη επανάληψη εγγραφής + `plan_unknown`· εναλλακτική: `request_id`) |
| 14 | Minor | (α) `VS #id`, (β) δεύτερη ειδοποίηση, (γ) `recent` κατά `created_at`, (δ) κείμενο χρήστη στο `stock_lot` | **fixed και τα τέσσερα** (α κωδικός αναφοράς, ελέγχεται στις B56–B58· β ειδοποίηση μόνο όταν άλλαξε ο κύκλος, B96· γ `read_at`, B97· δ λεπτομέρεια `order`) |
| 15 | Minor | tests που περνούν ενώ ο κώδικας είναι λάθος | **fixed**: 5, 69, B56–B58, B72 και B88–B97, όλες με μεταλλαγή που τις ρίχνει· σχόλιο B77 με τα νούμερα του συνθετικού έτους (317/185/85 ms)· σχόλιο pgcrypto του Β8 |

### Κριτική Worker (`review-worker.md`)

| # | Σοβ. | Εύρημα | Αποτέλεσμα |
|---|---|---|---|
| 1 | Important | token αποκαλύπτει ποσά | **fixed** = SQL 1 (υλοποίηση του κριτή SQL: όλα μέσα στο `plan_h_token`· η εκδοχή `'ver'` του κριτή Worker θα άλλαζε τέσσερις κατασκευαστές λιστών) |
| 2 | Important | `preview.conflict` χωρίς ελληνικά | **fixed** (`planConflictMessage` στον Worker, από `PLAN_RULE_TEXT`/`PLAN_CHECK_TEXT`· test στο `plan-routes`· Interfaces `conflict.message`) |
| 3 | Important | τίποτα δεν δένει RPC/ορίσματα με την 072 | **fixed** (Γ3 Step 3β: test `PLAN_ROUTES` ↔ υπογραφές 072, και κάθε δημόσια δρομολογημένη· Γ7 Step 6 smoke 8–10: τα τρία dry run μέσα από το πραγματικό PostgREST) |
| 4 | Important | δύο ανοιχτά branch Worker | **fixed** (Αφετηρία, Γ1 Step 2 έλεγχος, Γ4 Step 4 εναλλακτική άγκυρα, Γ7 Step 2) + **owner 42** |
| 5 | Important | το deploy μπορεί να κουβαλά κι άλλα | **fixed** (Γ7 Step 1: `commits-in-deploy.txt` + `diff --stat` μόνο `worker/src/index.js`, αλλιώς ΣΤΑΜΑΤΑ· Γ6 Step 1 το ίδιο για τη VD) |
| 6 | Important | φρουρός WORKSHOPS σε όλο το αρχείο | **fixed** (μέτρηση μέσα στο μπλοκ στο εργαλείο και στο `plan-tables-guard`· regex dispatcher μέσα στο μπλοκ· νέο test στο `worker-guard.test.mjs`· επαληθευμένο σε πηγή, διπλό bundle, μεταλλαγή) |
| 7 | Minor | φρουρός ποσών μόνο `amount` | **fixed** (`PLAN_MONEY_KEYS` + test ισότητας με `plan_h_strip_amounts` + επέκταση του test ποσών· απόφαση 34) |
| 8 | Minor | 500 εγγραφής λέει «δεν ολοκληρώθηκε» | **fixed** (`plan_unknown` σε εγγραφή, `plan_failed` σε ανάγνωση/dry run· test· Interfaces) + παράδοση Φ4 στο «Δεν πιάνει ακόμη η Φ2» + **owner 44** |
| 9 | Minor | ειδοποιήσεις στο board για accountant/warehouse | **fixed** (`plan_board` κατά ρόλο· B72) + **owner 40** |
| 10 | Minor | `PLAN_PERMS` χωρίς απόφαση | **owner 41** |
| 11 | Minor | ξεπερασμένα νούμερα | **fixed** (36 ονόματα· το md5 του `index.js` αντικαταστάθηκε από αναπαραγώγιμο κριτήριο) |
| 12 | Minor | 42883 / 42501 → 500 | **fixed**, στενότερα από την πρόταση: μόνο όταν το μήνυμα ονομάζει την **ίδια** τη συνάρτηση (ένα 42883 εσωτερικού βοηθού είναι bug της 072 και μένει 500)· `db_grant` 503· tests |
| 13 | Minor | `SQL-IDIO` μετά το `drafts/` | **fixed** = πλάνο 4 |
| 14 | Minor | χωρίς Γ6, η VD χωρίς smoke/ίχνος | **fixed** (Γ7 Step 6 smoke 11–12· γραμμή DECISION_LOG στο Κ3 Step 3) |
| 15 | Minor | παρένθεση με αγγλικά | **skipped**: αλλάζει τον κοινό χαρτογράφο (`stockRuleError`) και τα μηνύματα του 057/060 για αισθητικό όφελος· οι αγγλικές λεπτομέρειες εμφανίζονται μόνο σε `bad_input` (σφάλμα πελάτη, όχι χρήστη) και σε `need_token`/`stale_confirm` (που η Φ4 χειρίζεται ανοίγοντας τη λίστα)· η παρένθεση είναι και το ίχνος για υποστήριξη. Ξανανοίγει στη Φ4 αν φανεί στην οθόνη |
| 16 | Minor | κακοσχηματισμένο Bearer = CF 1101 | **fixed** (try/catch μόνο στο `handlePlan`· test με `Bearer a.b.c!!` σε όλες τις διαδρομές) |
| 17 | Minor | Κ3 Step 1 ζητά test που λείπει | **fixed** (η εντολή πήγε στο Κ3 Step 4, μετά το `git merge origin/main`) |

### Κριτική εκτελεσιμότητας (`review-plan.md`)

| # | Σοβ. | Εύρημα | Αποτέλεσμα |
|---|---|---|---|
| 1 | Important | «απόφαση 21 = εκτός» ελλιπές | **fixed** (παράρτημα με 12 σημεία: αρχεία, γραμμές, αριθμοί 15/169/26/35, επαναρίθμηση Α8) |
| 2 | Important | πηγές εκτός repo | **fixed** στα βήματα (Task 0 Step 0: αντιγραφή στο `docs/national-v5/f2/` μετά από έλεγχο ασφαλείας, PR, έλεγχος `git cat-file`· χάρτης αρχείων· παραπομπές). Η αντιγραφή η ίδια **δεν** έγινε απόψε (θα ήταν commit) |
| 3 | Important | κανένα βήμα επαναφοράς της βάσης | **fixed** (Κ2 Step 12 με σειρά, «ναι», Expected, SELECT μετά, DECISION_LOG) + **owner 45** (χωρίς δικό του dry run) |
| 4 | Important | `drafts/` ↔ κανόνας 5 | **fixed** με τον δρόμο (α): Γ7 Step 1 βρίσκει την 072 σε όποια θέση, Κ3 Step 1 αμέσως μετά το Κ2 (δικό του PR), Κ3 Steps 2–5 μετά το Γ7 |
| 5 | Important | τόπος VS, δεύτερη πηγή | **fixed** = SQL 2 + **owner 35** |
| 6 | Minor | κείμενο σημαδιού `@pub` | **fixed** (6 θέσεις) |
| 7 | Minor | `grep '^# checked'` στο Node 24 | **fixed** (`^(ℹ|#) checked` σε Γ2, Σ1, Κ3· μετρημένο: `ℹ checked: …`) |
| 8 | Minor | άγκυρα Κ3 Step 1 | **fixed** |
| 9 | Minor | Expected που θέλουν πλήρη 072 | **fixed** (σημείωση στη σειρά εκτέλεσης) |
| 10 | Minor | κενά harness | **fixed** ως «Known limit» στην κεφαλίδα του Β8· οι λίστες λήψης **δεν** επεκτάθηκαν (το `order_parent_to_legs`, που πυροδοτεί πλέον η 072, διαβάστηκε: επιστρέφει αμέσως χωρίς σκέλη) |
| 11 | Minor | ειδοποιήσεις στο board | **fixed** = Worker 9 + **owner 40** |
| 12 | Minor | 37 → 36 | **fixed** |
| 13 | Minor | τρία παλιά σχόλια | **fixed** (B1–B97 κεφαλίδα, `ELSE -- 41 (costs)`, pgcrypto) |
| 14 | Minor | «RT-/PM-» στο Κ2 Step 9 | **fixed** (~120 RT-, ids· PM- όχι) |
| 15 | Minor | `app_errors` δεν μπορεί να αποτύχει | **fixed** (`wrangler tail --search PLAN` στο Γ7 Step 6, Expected «καμία γραμμή»· το `app_errors` μένει ως έλεγχος Φ4) |
| 16 | Minor | διάγνωση `rt_md5` | **fixed** (Κ2 Step 7) |
| 17 | Minor | Task 0 χωρίς πύλη/Expected | **fixed** (Step 1 εγκρίσεις 1–45, Expected σε κάθε εντολή, η έκδοση CF μόνο στο Γ7) |
| 18 | Minor | `npx wrangler` χωρίς έκδοση | **fixed** (Expected: ίδια έκδοση με το προηγούμενο deploy, αλλιώς `npx wrangler@<εκείνη>` ή ΣΤΑΜΑΤΑ, Γ6 και Γ7) |
| 19 | Minor | `PLAN_RULE` στο `core/api.js` | **fixed** ως παράδοση Φ4 (καμία αλλαγή κώδικα τώρα) |
| 20 | Minor | λεπτομέρεια 23P01 | **fixed** ως σχόλιο (δεκτό ως έχει: ο προέλεγχος καλύπτει τον κανονικό δρόμο· ο περιορισμός με `xmin = txid_current()` απορρίφθηκε, 32-bit `xmin` απέναντι σε 64-bit txid) |
| 21 | Minor | rollback χωρίς dry run | **owner 45** |

---

## Αποφάσεις owner που προστέθηκαν (35–45)

35 στήλες της διεθνούς στον τόπο VS · 36 βλάβη με μεταφόρτωση (επαναδείκτηση σκέλους, **δεν** γράφτηκε) · 37 ημέρα VS μετά από shift · 38 τοπική φόρτωση από τον οδηγό του κύκλου · 39 dry run Μεταφοράς/Διαγραφής · 40 ειδοποιήσεις στο board κατά ρόλο · 41 πίνακας `PLAN_PERMS` · 42 σειρά με τα branch presence/stop-delay · 43 `search_path` χωρίς `pg_temp` · 44 ιδεμπότητα · 45 rollback χωρίς dry run. Και η 7 ξαναγραμμένη. Η πύλη του Task 0 Step 1 ζητά απάντηση και στις 1–45.

## Αρχεία scratch (εκτός repo, `.superpowers/` στο `.git/info/exclude`)

- `.superpowers/f2rev/scratch/run_fix.py` (+ `fixlib.py`, `fix_head.py`, `fix_a.py`, `fix_b.py`, `fix_c.py`, `fill.py`): οι αλλαγές, αναπαραγώγιμες από το `plan-orig.md`.
- `.superpowers/f2rev/scratch/extract.py`, `extract2.py`, `wt/tms-auditor/test/check.mjs`, `mut.mjs`, `muts/*.json`, `muts/original6.txt`, `reproof-sql.txt`: η απόδειξη SQL.
- `.superpowers/f2rev/scratch/apply_g.py`, `wk0/` (καθαρό αντίγραφο), `wk/` (εφαρμοσμένη Γ), `bundle/b2.js`, `reproof-worker.txt`: η απόδειξη Worker.
