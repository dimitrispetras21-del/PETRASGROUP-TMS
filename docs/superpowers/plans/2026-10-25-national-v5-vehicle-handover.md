# Εθνικά v5 · Αλλαγή οχήματος σε σημείο (072b, Worker `/plan/*`): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Πλάνο v1, 25/10/2026, μετά την κριτική R1 (δύο κριτές: βάση/Worker/ρόλοι 6/10, πιστότητα στο spec 1/10).** Η R1 βρήκε ότι το πλάνο έλειπε και ότι τα προσχέδια της 072b είχαν γραφτεί πριν από αυτό (Ε1–Ε3), και πέντε σφάλματα στον κώδικα (ευρήματα 2–7). Όλα διορθώθηκαν· ό,τι θέλει τον owner πήγε στις ερωτήσεις 👤 1–5, τίποτα δεν αποφασίστηκε σιωπηλά (πίνακας «Απαντήσεις στην R1»). **Ξανα-απόδειξη, όλη, 25/10 18:00–18:40 (scratch εκτός repo, PGlite με τη λήψη `live-072.sql` της Φ2 και την 072 `483ffd6e…`):**
> - rules test της 072b **86 OK, 0 FAIL** (72 του προσχεδίου + 14 νέες για τα ευρήματα 2, 3, 5, 7)· οι 14 νέες τρέχουν και πάνω στο προσχέδιο της R1: **11 FAIL** (73–82, 84) και 3 περνούν και στα δύο (83, 85, 86, «καρφιά»), άρα πιάνουν τα σφάλματα που διόρθωσαν·
> - η Φ2 κρατά **πάνω** στην 072b: 072 rules **203 OK**, 071 **56 OK**, 071b **8 OK**·
> - harness `plan-072b.test.mjs` **15/15** (dry run, apply, verify, ρόλοι API, rules, Φ2 από πάνω, ελεγκτής ως `tms_check_runner` **χωρίς** πολιτική από το test, rollback με τα 10 άγκιστρα ανάποδα, άρνηση χωρίς 072 και με γραμμή v5, **4 μεταλλαγές** που ρίχνουν ακριβώς τις περιπτώσεις τους)· build test `sql-072b-drafts` **7/7**· `build-072b.mjs --check` χωρίς απόκλιση·
> - Worker (F2 + το patch της 072b, πάνω στον Worker-πρωτότυπο της Φ2 `59da9800…`): **283 tests, 282 pass, 1 skipped** (ο skip του main), από 282· `GUARD OK (16 markers, plan=1, handover=1)` στην πηγή **και** στο διπλό bundle του esbuild·
> - παραγωγή, ένα SELECT 25/10 18:18: `plan_%` = 6 (η 072 δεν έχει εκτελεστεί), `model=2` = 0, γραμμές v5 = 0, triggers 46 = B-54, τα δύο EXCLUDE στο `ct_round_trips` με md5 `45b24579…` / `93d31da4…` (ίδια με το PART 0), `rt_vehicle_segments` δεν υπάρχει, ρόλοι ελεγκτή `NOBYPASSRLS`.
>
> **Καμία εργασία δεν ξεκινά πριν ο owner απαντήσει στα 👤 1–5 και εγκρίνει τις αποφάσεις H-1..H-19.** Καμία εγγραφή στην παραγωγή από agent· εκτέλεση της 072b μόνο από τον owner, μετά τις 15:00, μετά την εκτέλεση της 072 (Κ2 της Φ2).

**Goal:** Να υπάρχει στη βάση η «αλλαγή οχήματος σε σημείο» του spec (τμήματα ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ / ΤΕΛΙΚΟ μέσα σε έναν κύκλο v5) με τους κανόνες της στη βάση, και στον Worker οι τρεις πράξεις της πίσω από το `PLAN_PERMS` και την ίδια κλειδαριά της απόφασης 22, με **0** γραμμές v5 στην παραγωγή μετά την εκτέλεση και το deploy.

**Architecture:**
- **Βάση (`072b_plan_vehicle_segments.sql`, ένα DO block, ASCII, 1.270 γραμμές):** νέος πίνακας `rt_vehicle_segments` (γεννιέται κλειστός, μία πολιτική ανάγνωσης για τον ελεγκτή), τα δύο EXCLUDE της 071b **μεταφέρονται** εκεί με τα ίδια ονόματα, δύο όψεις, 4 triggers (B-54 +4), 3 δημόσιες `plan_seg_*`, 16 κλειστές συναρτήσεις (12 βοηθοί, 1 κανόνας, 3 triggers), και **10 άγκιστρα σε 7 συναρτήσεις της 072** από το ζωντανό κείμενο, με md5 πριν και μετά σε κάθε βήμα, αναστρέψιμα byte προς byte (πρότυπο 071 §9). Καμία από τις 22 φρουρούμενες της 072 δεν αλλάζει.
- **Worker (`deploy/worker-plan`, μετά τη Φ2):** 3 γραμμές `PLAN_ROUTES` (και οι τρεις `dryRun: true`), 3 πόροι στο `PLAN_PERMS`, 14 κείμενα `plan:` και 10 κείμενα CHECK, σημάδι φρουρού `rpc: "plan_seg_change"` με νέα σημαία `--handover`. Καμία νέα λογική χαρτογράφησης: ο ΕΝΑΣ `stockRuleError` και το `handlePlan` της Φ2.
- **Tests:** rules test σε TEST γραμμές (`072b_plan_vehicle_segments_test.sql`, 86), harness PGlite (`plan-072b.test.mjs`, 15), build test (`sql-072b-drafts.test.js`, 7), Worker (`plan-contract`, `plan-perms`, `plan-routes`, `plan-tables-guard`, `worker-guard`· 282 → 283).

**Tech Stack:** Supabase Postgres 17.6 (plpgsql, DO blocks, deferred constraint triggers, EXCLUDE με `btree_gist`, RLS), PGlite 0.5.8 + `btree_gist` + `pgcrypto` (`tms-auditor`), Cloudflare Worker (ESM, wrangler/esbuild), `node --test` (Node 24).

---

## Global Constraints

Ισχύουν **κατά λέξη** τα «Global Constraints» του πλάνου Φ2 (`docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md`, ενότητα με το ίδιο όνομα): βάση μόνο SELECT για τον agent· dry run πρώτα, ρητό «ναι», εκτέλεση από τον owner μετά τις 15:00, έξοδος από το `drafts/` μετά την εκτέλεση· ASCII, ένα DO block ανά αρχείο που γράφει, `lock_timeout 5s`, ελληνικά μόνο base64· md5 του ζωντανού κειμένου πριν από κάθε στήριξη· γεννιέται κλειστό· `SECURITY DEFINER`, `p_actor`/`p_role`, μία γραμμή `audit_log` ανά αλλαγή· άρνηση `plan rule broken: <code>:<detail>` με `HINT plan:<code>`· κλειδώματα `FOR NO KEY UPDATE` με μία σειρά (κύκλος, μετά τα τμήματά του)· κανένα ποσό σε ρόλο χωρίς δικαίωμα· ο Worker στη μία αλυσίδα `deploy/worker-plan`, deploy μετά τις 15:00, φρουρός πριν και μετά σε περιεχόμενο, bindings 3/3· ποτέ push στο `main`, PR, merge ο Δημήτρης.

Επιπλέον, για αυτό το κομμάτι:
- **Η 072b τρέχει μόνο πάνω στην 072 όπως εκτελέστηκε** (φρουρός PART 0: `plan_h_raise` και `plan_board` υπάρχουν, 54 `plan_*`, 46 ζεύγη md5) και **μόνο με 0 γραμμές v5** (η μεταφορά των EXCLUDE δεν έχει τι να μεταφέρει, άρα ο κανόνας δεν μένει ούτε στιγμή χωρίς δίχτυ· spec §3).
- **Η 072b αρνείται αν υπάρχει η 073** (`plan_h_pallet_sync`, ο βοηθός παλετών του προσχεδίου Φ3): σειρά 072 → 072b → 073 (👤 1). Το ίδιο όνομα φρουρεί και το rollback. Το `plan_h_payroll_sync` της έρευνας Φ3 είναι **πρόταση** για νέο βοηθό της 073, όχι φρουρός (κριτική R1, εύρημα 8).
- **`PLAN_WRITES_OPEN` μένει `false` ως ότου εκτελεστεί και η 073** (προϋπόθεση της ημέρας L, γραμμένη και στο Κ-H4): ανάμεσα στην 072b και την 073 ένας κύκλος με δύο οδηγούς θα είχε μισθοδοσία μόνο για τον οδηγό του ΑΡΧΙΚΟΥ και κόστος συνεργάτη μόνο του ΑΡΧΙΚΟΥ. Με τις εγγραφές κλειστές και `v5_cycles = 0`, `segments = 0` στο verify, αυτό δεν μπορεί να γεννηθεί.
- Ο πίνακας τμημάτων και οι δύο όψεις του **ποτέ** στο `TABLES` του facade (`plan-tables-guard`).

---

## Πηγές και πού ζουν (κριτική R1, Ε2 και Ε3)

Με σειρά ισχύος:
1. spec `docs/superpowers/specs/2026-10-23-national-v5-vehicle-handover-design.md` (owner 23/10 + 25/10: Figma, πλακίδια, δρόμος A)·
2. `docs/DECISION_LOG.md`: «2026-10-23 · Εθνικά v5 Φ2 · οι 45 αποφάσεις» (36, 41, 44), «2026-10-25 · … δύο απαντήσεις ρόλων» (`vehicle_clear_use_clear`), «2026-10-25 · … Αλλαγή οχήματος: Figma» και «… Φ3 · DKV-1..3 και D-1..D-20» (D-14)·
3. πλάνο Φ2 (Interfaces, φρουρός 22 συναρτήσεων) και προσχέδιο Φ3 `docs/superpowers/plans/2026-10-23-f3-national-v5-money-DRAFT.md`·
4. **`docs/national-v5/handover/requirements.md` = η ΜΙΑ πηγή των R-1..R-72** (Ε3, επιλογή β). Το αντίγραφο του scratchpad δεν διορθώνεται πια· το αρχείο του repo το λέει στην κορυφή του·
5. `docs/national-v5/handover/f2-interfaces.md` και `f3-money.md`: έρευνα 25/10, στιγμιότυπα (το λένε στην κορυφή τους). Όπου διαφωνούν με αυτό το πλάνο, ισχύει το πλάνο.

**Τα προσχέδια (Ε2):** γράφτηκαν πριν από το πλάνο, και η R1 είχε δίκιο ότι αυτό αντέστρεψε τη σειρά. Από εδώ και πέρα **το πλάνο είναι η πηγή των αποφάσεων** (H-n, 👤 n) και τα αρχεία είναι η υλοποίησή του, το καθένα με md5 στον «Χάρτη αρχείων». Κάθε αλλαγή απόφασης αλλάζει πρώτα εδώ. Τα αρχεία ζουν στο `docs/national-v5/handover/` με την **ίδια σχετική δομή** που θα έχουν στο repo (`worker/migrations/drafts/`, `tests/`, `checks/`), ώστε το build test και η γεννήτρια να τρέχουν και από εκεί. Μπαίνουν στη θέση τους **με `git mv`** στο Task B1 (ποτέ αντίγραφο: μία πηγή). Πριν από το B1 δεν τα τρέχει κανένα CI του `main`, γιατί χρειάζονται την 072 στο `drafts/`, που υπάρχει μόνο στον κλάδο της Φ2. Οι τρεις άδειοι φάκελοι της R1 γέμισαν με αυτά.

---

## Αφετηρία (μέτρηση 25/10/2026 18:18 Αθήνα, ένα SELECT· ο Task 0 την ξαναμετρά)

| Τι | Τιμή |
|---|---|
| Συναρτήσεις `plan_%` | **6** (η 072 δεν έχει εκτελεστεί) |
| `ct_round_trips` / `model=2` | 208 / **0** |
| Γραμμές `shipments+shipment_pieces+rt_stops+piece_legs+plan_notices` | **0** |
| Ενεργά triggers `public` / B-54 | **46** / `46` |
| `rt_v2_truck_once` / `rt_v2_driver_once` | στο `ct_round_trips`, md5(`pg_get_constraintdef`) `45b24579c51959b4328e94bac01ff9cd` / `93d31da4a356adda56065657c8410959` (το κείμενο = `x_truck` / `x_driver` του PART 0, λέξη-λέξη· μέτρηση της R1) |
| `rt_vehicle_segments` | δεν υπάρχει |
| `monitoring.checks` | 89 (η 073b κρατά B-78..B-90· η 072b φέρνει τα **B-91..B-93**) |
| `tms_reader`, `tms_check_runner` | `rolbypassrls = false` (γι' αυτό η πολιτική της H-10) |
| `dl_sync_from_rt()` | `331cea3a8987b74a9b0add698df9b158` (ίδιο με τον φρουρό της Φ2· η 072b δεν το αγγίζει) |
| 072 που φρουρεί η 072b | το προσχέδιο `483ffd6eefdb17083a07b510e8de7237` (πλάνο Φ2 v2). **Τα 46 ζεύγη md5 του PART 0 είναι μετρημένα πάνω του**: ξαναμετριούνται από την παραγωγή μετά το Κ2 της Φ2 (Task B2) |
| Worker της Φ2 (πρωτότυπο: τα code blocks του πλάνου Φ2 εφαρμοσμένα) | `worker/src/index.js` md5 `59da98002a38574d60f44ab0671f8c24`, 282 tests (281 + 1 skip), `GUARD OK (15 markers, plan=1)` |

---

## 👤 Ερωτήσεις μόνο για τον owner (χωρίς αυτές δεν ξεκινά καμία εργασία)

1. **Σειρά 072 → 072b → 073 (H-0).** Σύσταση: **Α**. Η αλλαγή οχήματος μπαίνει πρώτη, και η 073 (Φ3, ακόμη προσχέδιο) μαθαίνει τα τμήματα: μισθοδοσία ανά οδηγό, κόστος συνεργάτη = άθροισμα, DKV ανά τμήμα. Έτσι κάθε όψη χρημάτων γράφεται μία φορά και το `matchRoundTrip` ανεβαίνει μία φορά. Τίμημα: ξαναγράφεται ένα μέρος του προσχεδίου της 073 πριν τρέξει ποτέ, και το L περιμένει και τα δύο. Εναλλακτική **Β**: η 073 πρώτη, και η 072b κουβαλά μετά τα χρήματα των τμημάτων (δύο εκτελέσεις πάνω στις ίδιες όψεις, δύο deploy στο `matchRoundTrip`). Λεπτομέρεια: `f3-money.md` §5. *Τα αρχεία είναι γραμμένα για την Α· με τη Β αλλάζουν ο φρουρός της 073 και η σειρά του rollback.*
2. **Στάση που «καλύπτει» την ώρα αλλαγής** (π.χ. παράδοση 12:00–16:00, βλάβη στις 14:30). Η στάση πάει πάντα με το τμήμα που τη **φτάνει** (H-9). Τι λέει η βάση; **(α)** προειδοποίηση `seg_stop_straddles` στην απάντηση και στην προεπισκόπηση, και η πράξη γίνεται· **(β)** άρνηση στο COMMIT (νέος κωδικός `seg_stop_split`). Σύσταση: **(α)**, γιατί τα παράθυρα παράδοσης είναι συχνά φαρδιά, και μια άρνηση θα εμπόδιζε να γραφτεί μια πραγματική βλάβη. *Υλοποιημένη είναι η (α)· η (β) είναι ένα βήμα στο Task B3.*
3. 💶 **Τιμολόγιο συνεργάτη σε κύκλο με δύο συνεργάτες** (για την 073). Το `ct_cost_lines` δεν ξέρει σε ποιο τμήμα ανήκει ένα τιμολόγιο. **(α)** το τιμολογημένο αντικαθιστά όλο το προγραμματισμένο, συν έλεγχος «τιμολογημένο < Σ κομίστρων»· **(β)** `max(τιμολογημένο, προγραμματισμένο)` μόνο σε κύκλους με > 1 συνεργάτη· **(γ)** νέα στήλη `ct_cost_lines.partner_id` και σύγκριση ανά συνεργάτη (αλλαγή σχήματος και οθόνης Εξόδων). Ο agent δεν προτείνει (χρήματα).
4. 💶 **«Έξοδα Μ» στο φύλλο Εξόδων όταν ο κύκλος έχει δύο οδηγούς** (073 / Φ4): άθροισμα και λίστα ανά οδηγό, ή μόνο λίστα. Ο agent δεν προτείνει.
5. **Δικαιώματα (επιβεβαίωση, κανόνας «αλλαγές ρόλων = ρώτα πρώτα»):** «Αλλαγή οχήματος» και «Διόρθωση» για **όλους τους 5 ρόλους** (είναι πράξεις του board, απόφαση 41), «Αφαίρεση» μόνο owner και dispatcher (41 (β), που την ονομάζει). Δηλαδή ο warehouse και ο accountant μπορούν να γράψουν βλάβη και αλλαγή φορτηγού. Σύσταση: ναι, όπως η 41.

---

## Αποφάσεις του πλάνου (το spec §9 τις αφήνει στο πλάνο· ο owner τις εγκρίνει μαζί)

| # | Απόφαση | Γιατί / εναλλακτική που απορρίφθηκε |
|---|---|---|
| H-1 | Πίνακας `rt_vehicle_segments`, **χωρίς στήλη σειράς**: η σειρά είναι το `from_at` μιας αλυσίδας χωρίς κενά και επικαλύψεις. Ετικέτα μόνο στην όψη `v_rt_segments`. | Με `seq`, μια αλλαγή στη μέση θα ξαναμέτραγε τα επόμενα, ενώ το spec §5 λέει «τα επόμενα μένουν όπως είναι». |
| H-2 | Το **πρώτο τμήμα γεννιέται από trigger** στο INSERT του κύκλου (`plan_seg_follow`), με το όχημα που έγραψε το `plan_rt_create`. Από εκεί και πέρα **πηγή = τα τμήματα**, και ο κύκλος κρατά αντίγραφο του ΑΡΧΙΚΟΥ που γράφει μόνο το `plan_seg_copy`. Τα άκρα ακολουθούν το παράθυρο στην ίδια εντολή. | Χωρίς αυτό, κάθε INSERT κύκλου της 072 (και οι 203 της Φ2) θα έσπαγε στο COMMIT (`seg_none`). Εναλλακτική: άγκιστρο στο `plan_rt_create`. Απορρίφθηκε, γιατί και οι απευθείας INSERT (tests, Φ5) θα έμεναν χωρίς τμήμα. |
| H-3 | Τα δύο EXCLUDE της 071b **μετακινούνται** στα τμήματα με **τα ίδια ονόματα** (spec §3, owner 23/10): ίδια συνθήκη, παράθυρο του τμήματος. Μαζί μια στήλη-αντίγραφο `rt_cancelled`, γιατί ένα EXCLUDE δεν κάνει join· την κρατά ίση ο κανόνας COMMIT `seg_cancel`. | Τα ίδια ονόματα κρατούν αμετάβλητους τον χάρτη 23P01 του Worker, τον κλάδο του `plan_h_finish` και τα κείμενα. Μετρήθηκε: τα ονόματα ελευθερώνονται με το DROP μέσα στο ίδιο block. |
| H-4 | **Αφαίρεση του ΑΡΧΙΚΟΥ = άρνηση** `seg_first` (απαντά στο Ε-1 των απαιτήσεων): διορθώνεται το όχημά του, ή αφαιρείται η επόμενη αλλαγή. | Η επέκταση του επόμενου προς τα πίσω θα έγραφε ότι άλλο φορτηγό έκανε τις ώρες πριν από την αλλαγή, δηλαδή ψέμα για το παρελθόν. |
| H-5 | Η «Αλλαγή» **θέλει `request_id`** (Ε-4: δημιουργεί τμήμα, άρα ισχύει η απόφαση 44)· η προεπισκόπηση όχι. Η διόρθωση δεν θέλει, γιατί δεν δημιουργεί. | Μια χαμένη απάντηση που ξαναπατιέται θα έκοβε το τμήμα δύο φορές. |
| H-6 | **Στένεμα του κύκλου πέρα από μια ώρα αλλαγής = άρνηση** `seg_time` στο COMMIT (Ε-2): ο χρήστης διορθώνει ή αφαιρεί πρώτα την αλλαγή. | Η αυτόματη αφαίρεση θα ήθελε λίστα και token μέσα σε μια μετακίνηση στάσης, δηλαδή μια δεύτερη πράξη κρυμμένη στην πρώτη. |
| H-7 | **«Δεν αδειάζει ποτέ το όχημα» ανά τμήμα** (Ε-3, κανόνας του owner 25/10): η διόρθωση αρνείται με `vehicle_clear_use_clear`. Ένας κύκλος έχει **ή όλα τα τμήματα με όχημα, ή ένα τμήμα «χωρίς ανάθεση»** (`seg_unassigned`, απόφαση 12 ανά τμήμα). | Αλλιώς το `has_vehicle` του board, που διαβάζει το αντίγραφο του ΑΡΧΙΚΟΥ, θα έλεγε ψέματα για τις στάσεις ενός άδειου ενδιάμεσου τμήματος. |
| H-8 | **Αφαίρεση τμήματος με DKV** (Ε-5): η λίστα δείχνει `costs` ανά `pay_source` για τις γραμμές του φορτηγού του τμήματος, όταν αυτό το φορτηγό δεν οδηγεί άλλο τμήμα του κύκλου. Οι γραμμές **μένουν** στον κύκλο (απόφαση 13) και γράφεται ειδοποίηση `costs_without_rt` με την πινακίδα. | Κανένα νέο είδος συνέπειας ή ειδοποίησης: η Φ4 τα ξέρει ήδη. |
| H-9 | **Ο κανόνας «ποιο τμήμα εκτελεί μια στάση»** = το τμήμα που κρατά την **άφιξη** της στάσης (`planned_from`), σε **έναν** βοηθό `plan_h_seg_of_stop(stop)`. Τον διαβάζουν το board (`stop_ids` ανά τμήμα), ο έλεγχος τοπικής φόρτωσης, το «ακολουθεί» των Διεθνών, το φύλλο οδηγού (Φ4) και το DKV (Φ3). Γράφεται στο DECISION_LOG. | Πριν την R1 υπήρχαν δύο κανόνες για το ίδιο ερώτημα: `planned_from` στην τοπική φόρτωση, `planned_to` για εξαγωγή στο «ακολουθεί» (ευρήματα 3 και 5). Η 071 κάνει `end_at` = το τελευταίο `planned_to`, που είναι > κάθε `planned_from`. Άρα κάθε ζωντανή στάση έχει **ακριβώς ένα** τμήμα, και η ειδική εξαίρεση «στο τέλος του κύκλου» δεν χρειάζεται πια. |
| H-10 | **Πολιτική `monitor_read`** (SELECT, μόνο `tms_check_runner` + `tms_reader`) στον πίνακα, **από την ίδια την 072b** (εύρημα 4· ο κανόνας της D-14 για τους άλλους πίνακες v5 της 073b). | Χωρίς αυτή ο ελεγκτής βλέπει 0 τμήματα: το B-91 κόκκινο για κάθε κύκλο v5, τα B-92/B-93 ψευδώς πράσινα. Η 073b **δεν** την ξαναφτιάχνει (Παράδοση Π3-6). |
| H-11 | **Άγκιστρα, όχι επαναγραφή**: 10 αντικαταστάσεις σε 7 συναρτήσεις της 072, η καθεμία από το ζωντανό κείμενο, ακριβώς μία φορά, md5 πριν/μετά, με σειρά `k`. Όπου μια συνάρτηση έχει πολλά (`plan_rt_update`: 4), το «πριν» του καθενός είναι το «μετά» του προηγούμενου· το rollback τα βγάζει **ανάποδα**. | Πρότυπο 071 §9 και C-03 της Φ3. Μια πλήρης επαναγραφή θα έφτιαχνε δεύτερο κείμενο της ίδιας συνάρτησης (αρχή 3). Η γραμμή «-- 6. the international day …» του `plan_rt_update`, το άγκιστρο της 073, **δεν** αγγίζεται. |
| H-12 | `plan_rt_update` που αλλάζει όχημα σε κύκλο **με** αλλαγή → `seg_many`· με ένα τμήμα, η συμπεριφορά της 072 ακριβώς. | Κύκλος με δύο οχήματα δεν έχει «ένα» όχημα να αλλάξει· η διόρθωση γίνεται ανά τμήμα. |
| H-13 | **Προειδοποιήσεις ανά τμήμα** σε `plan_rt_update`, `plan_seg_change`, `plan_seg_fix`, `plan_seg_remove`: `v1_same_truck` για κάθε τμήμα στις δικές του ημέρες (εύρημα 2)· `seg_stop_moved` όταν μια στάση αλλάζει τμήμα εκτελεστή μέσα στην πράξη (εύρημα 3)· `seg_stop_straddles` (👤 2). Το `next_rt` της προεπισκόπησης διαβάζει το **τελευταίο** τμήμα και τα τμήματα των άλλων κύκλων. | Με ένα τμήμα παντού δίνουν ακριβώς τις απαντήσεις της 072 (οι 203 της Φ2 περνούν από πάνω). Δύο νέες τιμές στο μητρώο `warnings[]` της Φ4. |
| H-14 | **Deadlock / serialization**: καμία αλλαγή στο `plan_h_finish` (εύρημα 6). Το `handlePlan` της Φ2 ήδη απαντά 40P01 / 40001 / 55P03 με **409 `busy_retry`** («Ταυτόχρονη αλλαγή … τίποτα δεν γράφτηκε· ξαναδοκίμασε»), χωρίς επανάληψη. Το test του Worker το καρφώνει τώρα και για την «Αλλαγή». | Το `plan_h_finish` δεν ξέρει αν το deadlock ήταν για φορτηγό ή για οδηγό· ένα `truck_busy` χωρίς κωδικό θα ήταν εικασία. Η συναλλαγή του θύματος ακυρώνεται όλη, άρα το «τίποτα δεν γράφτηκε» είναι αλήθεια. |
| H-15 | **Αφαίρεση: ξαναπάτημα από τον ίδιο χρήστη = η ίδια επιτυχία** (`replayed: true`), όταν το τμήμα αφαιρέθηκε ήδη **από αυτόν** και **ως αφαίρεση** (εύρημα 7). Από άλλον: `seg_gone`. | Μια χαμένη απάντηση δεν δείχνει ψευδή αποτυχία. Ο «Καθαρισμός» δεν μετρά ως αφαίρεση. |
| H-16 | **Η προεπισκόπηση της αφαίρεσης εκτελεί την πράξη** σε subtransaction και την ακυρώνει. Δείχνει `conflict` (`truck_busy` / `driver_busy` με τον κωδικό του άλλου κύκλου), τα τμήματα μετά και τις προειδοποιήσεις, δίπλα στη λίστα και το token (εύρημα 7). | Αλλιώς η λίστα H4 λέει «εντάξει», και μετά το token έρχεται άρνηση. |
| H-17 | **Διαδρομές:** `POST /plan/rt/:id/handover` → `plan_seg_change`· `PATCH /plan/segments/:id` → `plan_seg_fix`· `POST /plan/segments/:id/remove` → `plan_seg_remove`. Και οι τρεις `dryRun: true`. Πόροι `handover`, `segment`, `segment-remove`. | Ίδιο σχήμα με `PATCH /plan/rt/:id` και `POST /plan/rt/:id/clear`. |
| H-18 | **Σημάδι φρουρού** `rpc: "plan_seg_change"` (η γραμμή της διαδρομής) και υποχρεωτική σημαία `--handover 0|1` στο `worker-guard.mjs`. Καμία προεπιλογή: ξεχασμένη σημαία = λάθος χρήσης, ποτέ «OK». | CLAUDE.md «Τρεις κανόνες μίας πηγής», κανόνας 3. Μένει στη λίστα για πάντα μετά το deploy. |
| H-19 | Οι λόγοι (κωδικός → ελληνικό κείμενο → είδος) ζουν στην **οθόνη της Φ4** ως ένας παγωμένος χάρτης, με drift test πάνω στο CHECK `seg_reason_list` (πρότυπο `OPS_DELAY` του 067, R-18). Ο Worker έχει μόνο τα κείμενα αρνήσεων. | Μία λίστα τιμών (το CHECK), ένα σημείο κειμένων. Σημείωση: ο κωδικός `vehicle_breakdown` λέγεται «Βλάβη οχήματος» στο Ημερήσιο (067) και «Βλάβη φορτηγού» εδώ (spec §4, εγκεκριμένο): ίδιος κωδικός, ίδιο γεγονός, δύο οθόνες. |

---

## Απαντήσεις στην κριτική R1

| Εύρημα | Τι έγινε | Απόδειξη |
|---|---|---|
| Βάση 1 / Spec Ε1 [BLOCKING]: λείπει το πλάνο | Αυτό το αρχείο, με (α) τις 3 γραμμές `PLAN_ROUTES` με `dryRun: true`, (β) `PLAN_PERMS` + `EXPECT`, (γ) 14 κείμενα `plan:` + 10 κείμενα CHECK, και το `plan-contract` να διαβάζει την 072b, (δ) `rt_vehicle_segments` και οι δύο όψεις στο `V5_TABLES`, (ε) σημάδι φρουρού (H-17, H-18, Task W1) | Worker 283 (282 + 1 skip)· `plan-contract` 8/8 με `checked: …072b… md5 fa332775…`· `plan-perms` 4/4 (9 κελιά άρνησης)· `plan-routes` 23/23 (το dry run περνά τον διακόπτη μόνο στις 7 RPC)· guard 16 σημάδια |
| Βάση 2 [BLOCKING για την εκτέλεση]: `plan_rt_update` ελέγχει το αντίγραφο του ΑΡΧΙΚΟΥ (v1, `next_rt`)· `plan_seg_fix` / `plan_seg_remove` χωρίς v1 | Άγκιστρα k = 3–6 στο `plan_rt_update`: `plan_h_seg_v1_warn(v_rt)` αντί για τη γραμμή v1 της 072, `plan_h_seg_next_rt(v_rt)` αντί για το `next_rt`· το ίδιο v1 σε change/fix/remove (H-13) | Περιπτώσεις 73–76: πάνω στο προσχέδιο R1 **FAIL** (στη 73 προειδοποιούσε για το RT του 2104, που έφυγε στις 14:30), τώρα OK· η μεταλλαγή «v1 από το αντίγραφο» ρίχνει τη 73 |
| Βάση 3 [MEDIUM]: στάση αλλάζει εκτελεστή σιωπηλά· στάση που καλύπτει την ώρα | Ένας κανόνας `plan_h_seg_of_stop` (H-9)· `seg_stop_moved` στο `plan_rt_update` (τα άγκιστρα 3, 4 κρατούν το «πριν») και στο `plan_seg_fix`· `seg_stop_straddles` = 👤 2 (υλοποιημένη η σύσταση α)· `stop_ids` ανά τμήμα στο board | Περιπτώσεις 77–81: πάνω στο R1 **FAIL**, τώρα OK· η μεταλλαγή «ο κανόνας διαβάζει την αναχώρηση» ρίχνει τη 54 |
| Βάση 4 [MEDIUM]: ο ελεγκτής δεν βλέπει τον πίνακα· το test έφτιαχνε μόνο του την πολιτική | Πολιτική `monitor_read` μέσα στην 072b (H-10), απόδειξη στο PART 9 και στο verify (`auditor_policy = 1`, `other_policies = 0`)· το test **δεν** φτιάχνει πολιτική | Harness: ως `tms_check_runner` βλέπει το τμήμα (1), B-91 = 0 σε κύκλο με τμήμα, κόκκινα στην παραβίαση· build test: ακριβώς μία `CREATE POLICY`, μόνο για τους δύο ρόλους |
| Βάση 5 [LOW]: `plan_h_seg_driver_at` στο άκρο | Ο βοηθός έφυγε· η τοπική φόρτωση διαβάζει τον κανόνα H-9 | Περίπτωση 86 (στάση στην ώρα αλλαγής = νέο τμήμα → `driver_busy`) |
| Βάση 6 [LOW]: deadlock 40P01 | Ήδη 409 `busy_retry` στο `handlePlan` της Φ2 (H-14)· καμία αλλαγή στη βάση | `plan-routes`: το 40P01 στην «Αλλαγή» → 409 `busy_retry`, μία RPC |
| Βάση 7 [LOW]: προεπισκόπηση αφαίρεσης χωρίς busy, χωρίς replay | H-15, H-16 | Περιπτώσεις 82 (η προεπισκόπηση δείχνει `truck_busy` με τον κωδικό RT και token, τίποτα δεν κρατήθηκε) και 84 (replay): **FAIL** πάνω στο R1· 83, 85 καρφιά |
| Βάση 8 [INFO]: αλυσίδα md5, όνομα φρουρού της 073, κενό 072b→073 | Task B2 (ξαναμέτρηση πάνω στην εκτελεσμένη 072)· `plan_h_pallet_sync` = ο φρουρός· προϋπόθεση «εγγραφές κλειστές ως την 073» (Global Constraints, Κ-H4)· νέο «πριν» της 073 για το `plan_rt_update` = `14305bebe49df1629cd1a47788028b08` (Π3-1) | Interfaces «Τα 10 άγκιστρα» |
| Spec Ε2: υλοποίηση πριν από το πλάνο | Οι αποφάσεις έγιναν H-0 (👤 1), H-3, H-11, με τα md5 κάθε αγκίστρου· τα αρχεία αντιστοιχίζονται στο πλάνο με md5 | «Χάρτης αρχείων», «Interfaces» |
| Spec Ε3: μισή δουλειά untracked, άδειοι φάκελοι | Επιλογή β: το `requirements.md` του repo = η πηγή· οι φάκελοι γέμισαν με τα αρχεία του πλάνου, που μπαίνουν με `git mv` στο B1 | «Πηγές και πού ζουν» |

---

## Χάρτης αρχείων

Όλα κάτω από `docs/national-v5/handover/` σε αυτόν τον κλάδο (μπαίνουν στη θέση τους στο Task B1). md5 στις 25/10, μετά τη διόρθωση της R1:

| Αρχείο | Θέση μετά το B1 | Γραμμές | md5 |
|---|---|---|---|
| `worker/migrations/drafts/072b_plan_vehicle_segments.sql` | ίδια | 1.270 | `fa332775d640116ef83edf4fafa6f7f1` |
| `worker/migrations/drafts/072b_plan_vehicle_segments_dryrun.sql` (γεννημένο) | ίδια | 1.261 | `6ea028bdcf740a7d7cce7d023c373a65` |
| `worker/migrations/drafts/072b_plan_vehicle_segments_rollback.sql` (γεννημένο) | ίδια | 259 | `4179cda5ac7bdc3d0a949b6842457e0f` |
| `worker/migrations/drafts/072b_plan_vehicle_segments_test.sql` | ίδια | 766 | `0073174838fdd7e9124b24d9d3fb1270` |
| `worker/migrations/drafts/072b_plan_vehicle_segments_verify.sql` | ίδια | 104 | `d5b4fa89bc8ad49693539a64008e3084` |
| `worker/migrations/drafts/072b_plan_vehicle_segments_fingerprint.sql` | ίδια | 19 | `79bb9ab437531b1cf618f132077c479a` |
| `worker/migrations/drafts/tools/build-072b.mjs` | ίδια | 234 | `bba08b3abdcf47192884310d0974019d` |
| `tests/sql-072b-drafts.test.js` | `tests/` | 152 | `9f2a717155e22806399c56a4e4d4c483` |
| `tests/plan-072b.test.mjs` | `tms-auditor/test/` | 256 | `6d263bbddd3031f6eb64ebcb7cd2eeae` |
| `checks/B-91.sql`, `B-92.sql`, `B-93.sql` | `tms-auditor/checks/` | | `11de2906…`, `742013da…`, `8cddd008…` |
| `worker/worker-072b.patch` (Worker: `src/index.js`, `tools/worker-guard.mjs`, 5 tests) | εφαρμόζεται στο W1, δεν μένει | 539 | `cb99c81063f819049d70ea7fbd0167f9` |
| `requirements.md`, `f2-interfaces.md`, `f3-money.md` | μένουν | | πηγές (βλ. «Πηγές») |

Το patch εφαρμόζεται καθαρά (`git apply --check`) πάνω στον Worker της Φ2 `59da9800…`. Αν η Φ2 αλλάξει πριν από το W1, το patch ξαναπαράγεται από τον κώδικα (60 γραμμές στο `index.js`) και ξανατρέχουν τα tests.

---

## Interfaces

### Ο πίνακας `rt_vehicle_segments`

`id` (identity) · `rt_id → ct_round_trips` RESTRICT · `from_at`, `to_at` timestamptz NOT NULL · `trip_type` · `truck_id → trucks`, `trailer_id → trailers`, `driver_id → drivers`, `partner_id → partners` (όλα RESTRICT) · `partner_rate numeric(10,2)` · `place_note` · `reason` · `reason_note` · `rt_cancelled boolean` (αντίγραφο της κατάστασης του κύκλου, μόνο από το `plan_seg_follow`) · `created_at/by`, `updated_at` · `deleted_at/reason/by` (μόνο soft delete). Ευρετήριο `(rt_id, from_at) WHERE deleted_at IS NULL`. Καμία στήλη ετικέτας ή σειράς.

**CHECK (10, 23514 με όνομα, κείμενο στο `PLAN_CHECK_TEXT`):** `seg_type` (OWNED/PARTNER) · `seg_partner_needs_partner` · `seg_partner_no_vehicle` · `seg_owned_no_partner` · `seg_partner_rate` (≥ 0) · `seg_reason_list` (οι 8 του spec §4: `vehicle_breakdown, reefer_breakdown, accident, driver_hours, driver_unavailable, planned_driver, planned_truck, other`) · `seg_change_pair` (σημείο ⇔ λόγος) · `seg_place_text` · `seg_other_note` · `seg_del`.

**EXCLUDE (μετακινημένα, ίδια ονόματα, DEFERRABLE INITIALLY DEFERRED):** `rt_v2_truck_once` / `rt_v2_driver_once` = `EXCLUDE USING gist (<truck_id|driver_id> WITH =, tstzrange(from_at, greatest(from_at, to_at), '[)') WITH &&) WHERE (trip_type = 'OWNED' AND <…> IS NOT NULL AND deleted_at IS NULL AND NOT rt_cancelled)`. Στο `ct_round_trips` δεν μένει κανένα EXCLUDE.

**Δικαιώματα:** RLS on· `SELECT` σε `service_role`, `tms_reader`, `tms_check_runner`· πολιτική `monitor_read` (SELECT, μόνο οι δύο ρόλοι του ελεγκτή)· τίποτα σε `anon`/`authenticated`· η ακολουθία κλειστή.

### Όψεις (security_invoker, χωρίς ποσά)

- `v_rt_segments`: `segment_id, rt_id, code, from_at, to_at, trip_type, truck_id, trailer_id, driver_id, partner_id, partner_rate, place_note, reason, reason_note, rt_cancelled, n, n_segments, label ('initial'|'intermediate'|'final'|NULL με ένα τμήμα), has_vehicle`.
- `v_rt_vehicle_windows`: το μοντέλο ανάγνωσης του DKV της Φ3 (Ε10). Μία γραμμή ανά RT `model=1` με τις στήλες της σημερινής επιλογής (`id, truck_id, status, date_start, date_end`, `model`, `start_at/end_at` NULL), και μία ανά τμήμα OWNED με φορτηγό κύκλου v5 (`id = rt_id`, ημέρες και ώρες του τμήματος).

### Triggers (B-54 +4: 46 → 50 στην παραγωγή)

`plan_seg_follow` (AFTER INSERT / UPDATE OF start_at, end_at, status ON `ct_round_trips`, WHEN model = 2) · `plan_seg_copy` (AFTER INSERT / UPDATE OF όχημα, `from_at`, `deleted_at` ON τμήματα) · `plan_seg_verify` (constraint, deferred, ON τμήματα· και DELETE → `hard_delete`) · `plan_seg_verify_rt` (constraint, deferred, ON `ct_round_trips` WHEN model = 2). Η αλφαβητική σειρά των ονομάτων είναι σκόπιμη (σχόλιο στο PART 4).

### Κανόνες COMMIT (`plan_seg_problem(rt)`, `'<code>:<RT>'`)

`seg_not_v2` (τμήμα σε κύκλο `model=1`) · `seg_time` (τμήμα μηδενικού ή αρνητικού μήκους) · `seg_cover` (πρώτο ≠ `start_at`, κενό, τελευταίο ≠ `end_at`) · `seg_first` (λόγος/σημείο στο πρώτο) · `seg_copy` (αντίγραφο ΑΡΧΙΚΟΥ ≠ ΑΡΧΙΚΟ) · `seg_reason` (επόμενο τμήμα χωρίς λόγο) · `seg_cancel` · `seg_none` (κύκλος v5 χωρίς ζωντανό τμήμα) · `seg_unassigned` (κύκλος με > 1 τμήμα και ένα χωρίς όχημα). Στο trigger: `seg_locked` (τμήμα σε άλλο κύκλο, ή αλλαγή αφαιρεμένου), `hard_delete`.

### Οι 3 δημόσιες (`p jsonb, p_actor text, p_role text) RETURNS jsonb`, SECURITY DEFINER, EXECUTE μόνο `service_role`)

| Συνάρτηση | Κλειδιά του `p` | Απάντηση |
|---|---|---|
| `plan_seg_change` | `rt_id, at, place_note, reason, reason_note?, vehicle {trip_type, truck_id?, trailer_id?, driver_id?, partner_id?, partner_rate?}, same_driver?, request_id` (υποχρεωτικό εκτός dry run), `dry_run?` | `plan_h_ok('plan_seg_change', {rt_id, segment_id, cut_segment_id}, warnings, [])`· επανάληψη: η πρώτη απάντηση + `replayed: true`· dry run: `{ok, op, dry_run: true, preview: {segments, warnings, conflict}}` |
| `plan_seg_fix` | `segment_id, set {at?, place_note?, reason?, reason_note?, trip_type?, truck_id?, trailer_id?, driver_id?, partner_id?, partner_rate?}, dry_run?` | `{rt_id, segment_ids}` + warnings· dry run με το ίδιο σχήμα `preview` |
| `plan_seg_remove` | `segment_id, dry_run?, confirm_token?` | dry run: το σχήμα του `plan_h_confirm` (`needs_confirm, confirm_token, consequences`, χωρίς ποσά εκτός owner/accountant) **+** `preview {segments, warnings, conflict}`· εκτέλεση: `{rt_id, segment_id, prev_segment_id}` + warnings + `notice_ids`· ξαναπάτημα (H-15): το ίδιο + `replayed: true` |

`conflict = {code, sqlstate, detail}` (όπως στο `plan_rt_update` της Φ2· ο Worker προσθέτει `message`). `segments[]` = `plan_h_seg_json`: `segment_id, label, from_at, to_at, trip_type, truck_id, truck, trailer_id, trailer, driver_id, driver, partner_id, partner, partner_rate, place_note, reason, reason_note, has_vehicle, stop_ids[]`.

### Οι κλειστές (16· EXECUTE για κανέναν ρόλο API)

Βοηθοί: `plan_h_seg_busy(bigint)` · `plan_h_seg_set_only(bigint,text,bigint,bigint,bigint,bigint,numeric,text,text)` · `plan_h_seg_clear(bigint,text,text,text)` · `plan_h_seg_of_stop(bigint)` (H-9) · `plan_h_seg_stops(bigint)` · `plan_h_seg_stop_warn(bigint,jsonb)` · `plan_h_seg_v1_warn(bigint)` · `plan_h_seg_next_rt(bigint)` · `plan_h_seg_json(bigint)` · `plan_h_vs_carriers(bigint,jsonb)` · `plan_h_seg_vehicle_ok(text,bigint,bigint,bigint,bigint,numeric)` · `plan_h_seg_consequences(bigint)`. Κανόνας και triggers: `plan_seg_problem(bigint)` · `plan_chk_seg()` · `plan_seg_follow()` · `plan_seg_copy()`. Σύνολο `plan_%` μετά: **54 + 19 = 73**. Το `072_plan_functions_verify.sql` δείχνει τότε `plan_functions = 73`, `service_role_execute = 19`, `changed_live = 0`.

### Τα 10 άγκιστρα σε 7 συναρτήσεις της 072 (md5(prosrc) πριν → μετά, μετρημένα στο PGlite πάνω στην 072 `483ffd6e…`)

| k | Συνάρτηση | Τι αλλάζει | πριν | μετά |
|---|---|---|---|---|
| 1 | `plan_h_busy` | ο προέλεγχος διαβάζει τα τμήματα | `3083076d…` | `99d86d5c…` |
| 2 | `plan_h_finish` | η λεπτομέρεια του 23P01 από τα τμήματα | `c398052b…` | `59d88ec8…` |
| 3 | `plan_rt_update` | δήλωση `v_seg0` | `e1aa3e10…` | `ecb30f0e…` |
| 4 | `plan_rt_update` | `v_seg0 := plan_h_seg_stops(v_rt)` πριν από το βήμα 1 | `ecb30f0e…` | `c088b4c0…` |
| 5 | `plan_rt_update` | όχημα στο τμήμα (`seg_many`), busy ανά τμήμα, v1 ανά τμήμα, `seg_stop_*` | `c088b4c0…` | `2015ccfa…` |
| 6 | `plan_rt_update` | `next_rt` από το τελευταίο τμήμα | `2015ccfa…` | `14305beb…` |
| 7 | `plan_rt_clear` | ένα τμήμα «χωρίς ανάθεση» | `a46aae29…` | `ecead924…` |
| 8 | `plan_board` | `segments` ανά κύκλο | `2a600c21…` | `93ebc7aa…` |
| 9 | `plan_vs_state` | «ακολουθεί» = το τμήμα της στάσης Βέροιας (H-9) | `8e50d951…` | `99175b65…` |
| 10 | `plan_local_loading` | ο οδηγός του τμήματος της στάσης (H-9) | `d3107f05…` | `6c56db09…` |

Τα πλήρη md5 είναι στο PART 6 της 072b· το verify ξέρει το τελικό κείμενο των 7 (`hooks_in_place = 7`). Τα 46 ζεύγη του PART 0 (22 της 072 + 24 της 072 που η 072b καλεί, αγκιστρώνει ή προϋποθέτει) είναι ίδια σε PART 0, PART 9 (μείον τα 7 αγκιστρωμένα) και verify· το build test το φρουρεί.

### Κωδικοί `plan:` της 072b (14, `CODES_072B` στο `plan-contract`)

`seg_cancel, seg_copy, seg_cover, seg_first, seg_gone, seg_locked, seg_many, seg_no_vehicle, seg_none, seg_not_v2, seg_reason, seg_same, seg_time, seg_unassigned`. Ξαναχρησιμοποιούνται της 071/072: `bad_input, rt_gone, rt_cancelled, truck_busy, driver_busy, vehicle_clear_use_clear, payroll_locked, need_token, stale_confirm, request_missing, request_reused, no_actor, hard_delete`. Αποσυρμένοι: κανένας νέος.

### Μητρώο τιμών της Φ4 (νέες)

- `warnings[]`: `seg_stop_moved {stop_id, from_segment_id, to_segment_id}` · `seg_stop_straddles {stop_id, segment_id}` (το `v1_same_truck {rt_code}` υπάρχει ήδη).
- `consequences[].kind`: κανένα νέο (`payroll_amount` με `month`, `costs` ανά `pay_source`).
- `plan_notices.kind`: κανένα νέο (`costs_without_rt`).
- `ids`: `plan_seg_change {rt_id, segment_id, cut_segment_id}` · `plan_seg_fix {rt_id, segment_ids}` · `plan_seg_remove {rt_id, segment_id, prev_segment_id}`. Το `replayed: true` υπάρχει και στην «Αλλαγή» (H-5) και στο ξαναπάτημα της αφαίρεσης (H-15).

### Worker (το patch)

| Διαδρομή | Πόρος | RPC | `idKey` | `dryRun` | Ρόλοι |
|---|---|---|---|---|---|
| `POST /plan/rt/:id/handover` | `handover` | `plan_seg_change` | `rt_id` | ναι | όλοι οι 5 |
| `PATCH /plan/segments/:id` | `segment` | `plan_seg_fix` | `segment_id` | ναι | όλοι οι 5 |
| `POST /plan/segments/:id/remove` | `segment-remove` | `plan_seg_remove` | `segment_id` | ναι | owner, dispatcher |

Με `PLAN_WRITES_OPEN = false`, κάθε σώμα χωρίς `"dry_run": true` (ακριβώς boolean) → 409 `writes_closed`, με 0 κλήσεις στη βάση· με `"dry_run": true` περνούν **και οι τρεις** (R-33). Το dry run της αφαίρεσης είναι μόνο για owner/dispatcher (απόφαση 26). Κείμενα: 14 στο `PLAN_RULE_TEXT`, 10 στο `PLAN_CHECK_TEXT`· το `plan-contract` αποτυγχάνει σε κωδικό ή CHECK χωρίς κείμενο και σε κείμενο χωρίς αντίκρισμα. `V5_TABLES` + `rt_vehicle_segments, v_rt_segments, v_rt_vehicle_windows`. Φρουρός: `node worker/tools/worker-guard.mjs <file> --plan 1 --handover 0|1` (16 σημάδια).

---

## Αντιστοίχιση R-n → εργασία → έλεγχος

«Περ. N» = περίπτωση N του rules test της 072b. «H» = harness `plan-072b.test.mjs`. «B» = build test. «W:x» = Worker test x.

| R | Εργασία | Έλεγχος |
|---|---|---|
| R-1 | B1, Κ-H2 | H «refuses without 072»· αριθμός 072b > 072 |
| R-2 | — (καμία αλλαγή) | fingerprint `move_md5` πριν = μετά· PART 9 (`plan_move_pieces` στη λίστα) |
| R-3 | B1 | περ. 19 (`seg_not_v2`)· fingerprint `rt_md5`, `today_fn_md5` |
| R-4 | B1 | περ. 1, 20 |
| R-5 | B1 | περ. 28, 71, 72, 42· CHECK `seg_partner_*` |
| R-6 | B1 | περ. 1, 2, 24· verify `seg_problems = 0` |
| R-7 | B1 | περ. 5, 23, 67, 45 (`locations` ίδιο) |
| R-8 | B1 | περ. 1, 2, 3, 26, 34· B «no label column» |
| R-9 | B1 | περ. 21, 29· μεταλλαγή «gap»· B-91 |
| R-10 | B1 | περ. 24· μεταλλαγή «edges» |
| R-11 | B1 | περ. 7, 8, 9, 25, 30 |
| R-12 | B1 | περ. 18, 44, 59· B-91 (σκέλος αντιγράφου) |
| R-13 | B1, Κ-H2 | περ. 10–14· H «with a v5 row»· verify `exclude_on_segments = 2`, `exclude_on_cycles = 0`, `overlaps = 0` |
| R-14, R-32, R-68 | B1 | περ. 45 |
| R-15 | B1, W1 | περ. 15· B «eight reasons»· W:plan-contract (καμία διαδρομή λόγων: κάθε RPC = δημόσια συνάρτηση) |
| R-16 | B1 | περ. 58· B «067 has vehicle_breakdown, driver_hours» |
| R-17 | B1 | περ. 16, 17 |
| R-18 | Φ4 (H-19) | drift test της Φ4 πάνω στο `seg_reason_list` |
| R-19 | B1 | περ. 4, 5, 6 |
| R-20, R-21, R-22, R-23, R-24 | B1 | περ. 3 · 4 · 26 · 27 · 28 |
| R-25 | B1 | περ. 29, 30, 81 |
| R-26 | B1 | περ. 31 (H-7) |
| R-27 | B1 | περ. 33, 34, 35 (H-4) |
| R-28, R-28α | B1 | περ. 36–39, 64, 70, 82 |
| R-29 | B1, W1 | περ. 10–12, 82, 83· W:plan-contract (λεπτομέρεια σε αγκύλες) |
| R-30 | B1 | περ. 40, 41 |
| R-31 | B1 | περ. 42 |
| R-33 | W1 | W:plan-routes «writes closed», «dry_run passes ONLY on the seven» |
| R-34 | B1 | περ. 2, 66 (ιστορικό: create/update/delete με ρόλο) |
| R-35, R-36 | W1 | W:plan-contract (υπογραφές από 072 + 072b, κωδικοί ↔ κείμενα, CHECK ↔ κείμενα) |
| R-37, R-38 | W1 | W:plan-perms (`EXPECT`, 9 κελιά άρνησης)· W:plan-routes «decision 41» |
| R-39 | B1 | περ. 28 (ο dispatcher γράφει κόμιστρο)· `plan_h_seg_json.partner_rate` |
| R-40 | B1, W1 | περ. 64· W:plan-routes `amount_leak` |
| R-41–R-47 | Φ3 (Π3-1..Π3-7) | εκεί· εδώ μόνο η περ. 41 (το ποσό του πρώτου μένει) |
| R-48, R-49, R-51 | B1 | `checks/B-91..B-93` + H «auditor checks» (ως `tms_check_runner`, κόκκινα στην παραβίαση)· seed στην 073b (Π3-6) |
| R-50 | Φ3 | = B-83 ανά τμήμα (Π3-5) |
| R-52–R-64, R-66 | Φ4 | εκεί· η βάση δίνει ήδη `segments`, `label`, `stop_ids`, `place_note`, `reason` και ιστορικό (περ. 55, 66, 80) |
| R-65 | B1 (δεδομένα), Φ4 (οθόνη) | περ. 53, 54 |
| R-67 | — | `git diff --stat origin/main -- modules/weekly_intl.js` κενό στο PR· R-3 |
| R-69 | B1 | H «API roles»· verify `open_to_api = 0`, `open_relations = 0`· περ. 22 |
| R-70 | Κ-H2 | runbook |
| R-71 | W1, Κ-H3 | W:worker-guard, `--handover`· CLAUDE.md |
| R-72 | όλα | «Αν σπάσει» |

---

## Εργασίες

### Task 0: Προϋποθέσεις, εγκρίσεις, branch, επαναμέτρηση

**Files:** κανένα (μόνο git και SELECT).

- [ ] **Step 1: Εγκρίσεις.** Ο owner απάντησε στα 👤 1–5 και ενέκρινε τις H-1..H-19. Οι απαντήσεις γράφονται στο DECISION_LOG (Task Κ-H1 Step 1) **πριν** από κάθε κώδικα. Αν μια απάντηση αλλάζει κώδικα (👤 2 = β, 👤 1 = Β), πρώτα αλλάζει το πλάνο.
- [ ] **Step 2: Η Φ2 είναι έτοιμη.** Ο κλάδος `feat/national-v5-functions` υπάρχει και έχει περάσει το Β9 (commit της 072 στο `worker/migrations/drafts/`) και το Σ1.

```bash
git fetch origin
git log --oneline -1 origin/feat/national-v5-functions -- worker/migrations/drafts/072_plan_functions.sql
git show origin/feat/national-v5-functions:worker/migrations/drafts/072_plan_functions.sql | md5
```
Expected: ένα commit· md5 `483ffd6eefdb17083a07b510e8de7237` ή άλλο. Αν είναι άλλο, το Task B2 ξαναμετρά (υποχρεωτικό έτσι κι αλλιώς μετά το Κ2).

- [ ] **Step 3: Branch από τη Φ2.** `git switch -c feat/national-v5-handover origin/feat/national-v5-functions` και `git merge origin/main` (για να έρθουν τα αρχεία αυτού του πλάνου). Μετά: `git log --oneline HEAD..origin/main -- docs/national-v5/handover worker/migrations tms-auditor tests` κενό.
- [ ] **Step 4: Ξαναμέτρηση παραγωγής** (μόνο SELECT, το ερώτημα της «Αφετηρίας», project `gatejgbpyodlepkvqkgf`). Expected: όπως η Αφετηρία· μετά το Κ2 της Φ2: `plan_%` = 54, triggers = B-54 = 46. Αν `model=2` ή γραμμές v5 > 0: **ΣΤΑΜΑΤΑ** (η μεταφορά των EXCLUDE δεν γίνεται πια χωρίς μετάπτωση, spec §3).
- [ ] **Step 5: Harness.** `cd tms-auditor && npm ci && node -e "import('@electric-sql/pglite/contrib/btree_gist').then(()=>console.log('OK'))"` → `OK`.

### Task B1: Τα αρχεία στη θέση τους (git mv) και πράσινο τοπικά

**Files:** `git mv` από το `docs/national-v5/handover/` σε `worker/migrations/drafts/072b_*.sql`, `worker/migrations/drafts/tools/build-072b.mjs`, `tests/sql-072b-drafts.test.js`, `tms-auditor/test/plan-072b.test.mjs`, `tms-auditor/checks/B-91.sql`..`B-93.sql`.

- [ ] **Step 1: Έλεγχος md5 πριν από τη μεταφορά** με τον «Χάρτη αρχείων». Απόκλιση = κάποιος άλλαξε αρχείο χωρίς πλάνο: ΣΤΑΜΑΤΑ.
- [ ] **Step 2: Μεταφορά.**

```bash
H=docs/national-v5/handover
for f in $H/worker/migrations/drafts/072b_*.sql; do git mv "$f" worker/migrations/drafts/; done
git mv $H/worker/migrations/drafts/tools/build-072b.mjs worker/migrations/drafts/tools/
git mv $H/tests/sql-072b-drafts.test.js tests/
git mv $H/tests/plan-072b.test.mjs tms-auditor/test/
for f in $H/checks/B-9*.sql; do git mv "$f" tms-auditor/checks/; done
```
- [ ] **Step 3: Πράσινο.**

```bash
node worker/migrations/drafts/tools/build-072b.mjs --check && echo DRYRUN-IDIO
node --test tests/sql-072b-drafts.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'
(cd tms-auditor && node --test test/plan-072b.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)')
```
Expected: `DRYRUN-IDIO`· `ℹ tests 7`, `ℹ pass 7`, `ℹ fail 0`· `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0` (μέσα του: 072b `Result: 86 OK, 0 FAIL`, 072 `203 OK`, 071 `56 OK`, 071b `8 OK`). Και τα υπάρχοντα: `node --test tests/sql-072-drafts.test.js tests/sql-071-drafts.test.js` και `(cd tms-auditor && node --test test/plan-072.test.mjs test/plan-071.test.mjs)`, όπως στο Σ1 της Φ2.

### Task B2: Ξαναμέτρηση πάνω στην 072 όπως είναι (υποχρεωτικό μετά το Κ2 της Φ2)

**Files:** `worker/migrations/drafts/072b_plan_vehicle_segments.sql` (PART 0, PART 6, PART 9), `…_verify.sql`, τα γεννημένα dry run / rollback.

Γιατί: τα 46 ζεύγη και τα 10 «πριν/μετά» είναι μετρημένα πάνω στο **προσχέδιο** 072 `483ffd6e`. Η πηγή αλήθειας είναι η παραγωγή μετά το Κ2 (κριτική R1, εύρημα 8).

- [ ] **Step 1:** SELECT στην παραγωγή: `SELECT p.oid::regprocedure, md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%' ORDER BY 1`, και το ίδιο για τις 22 του PART 0. Σύγκριση με το PART 0. Ίδια → Step 4.
- [ ] **Step 2:** Διαφορετικά: πρώτα το **γιατί** (ποια διόρθωση της 072 μπήκε μετά το `483ffd6e`). Αν αγγίζει ένα από τα 10 σημεία αγκίστρου (το κείμενο `a` δεν βρίσκεται πια ακριβώς μία φορά), ξαναγράφεται εκείνο το `a`/`b` και αλλάζει πρώτα το πλάνο. Μετά, νέα ζεύγη σε PART 0 / PART 9 / verify, με την ίδια σειρά.
- [ ] **Step 3:** Τα «μετά» μετριούνται από την ίδια την 072b. Βάζεις ως «μετά» ενός αγκίστρου ένα σημάδι (`00000000000000000000000000000001`) και τρέχεις την 072b στο PGlite. Το μήνυμα `the generated text of … (hook k) is not the one measured (md5 …)` δίνει το σωστό. Το βάζεις και ως «πριν» του επόμενου αγκίστρου της ίδιας συνάρτησης, και επαναλαμβάνεις ως να περάσει (έτσι μετρήθηκαν στις 25/10, σε 5 γύρους). Το τελικό κάθε συνάρτησης πάει στο verify.
- [ ] **Step 4:** `node worker/migrations/drafts/tools/build-072b.mjs` και τα τρία του Task B1 Step 3. Expected: ίδια.

### Task B3: Μόνο αν ο owner διαλέξει 👤 2 (β): άρνηση για στάση που καλύπτει την αλλαγή

- [ ] **Step 1:** Στο `plan_seg_problem`, μέσα στον βρόχο, για `v_n > 1`: `if exists (select 1 from rt_stops s where s.rt_id = p_rt and s.deleted_at is null and g.from_at > s.planned_from and g.from_at < s.planned_to) then return 'seg_stop_split:' || r.code; end if;`. Το `seg_stop_straddles` φεύγει από το `plan_h_seg_stop_warn` και από το μητρώο της Φ4.
- [ ] **Step 2:** Οι περιπτώσεις 78 και 79 γίνονται `'plan:seg_stop_split'`· κείμενο στο `PLAN_RULE_TEXT` («Η αλλαγή οχήματος πέφτει μέσα σε στάση — άλλαξε την ώρα πριν ή μετά τη στάση»)· `CODES_072B` +1· μεταλλαγή «χωρίς seg_stop_split» → 78 FAIL. Expected: rules 86 OK, build 7/7, harness 16/16, Worker 283.

### Task B4: Commit του κλάδου SQL και έλεγχος κώδικα

- [ ] **Step 1:** `git add` μόνο τα αρχεία των B1–B3 (ρητές διαδρομές) και commit «national v5 vehicle handover 072b: drafts in place, re-proved».
- [ ] **Step 2:** `/code-review xhigh` (βάση, ρόλοι). Κάθε εύρημα διορθώνεται με νέα περίπτωση που αποτυγχάνει χωρίς τη διόρθωση, και ξανατρέχουν τα τρία του B1.
- [ ] **Step 3:** Push του κλάδου, PR προς `main` (ο owner κάνει merge).

### Task W1: Worker στη μία αλυσίδα `deploy/worker-plan` (μετά το deploy της Φ2)

**Files:** `worker/src/index.js`, `worker/tools/worker-guard.mjs`, `worker/test/plan-contract.test.mjs`, `plan-perms.test.mjs`, `plan-routes.test.mjs`, `plan-tables-guard.test.mjs`, `worker-guard.test.mjs`· αντίγραφο `worker/migrations/drafts/072b_plan_vehicle_segments.sql` (όπως η Φ2 κρατά αντίγραφο της 072 για το contract test).

- [ ] **Step 1: Βάση της αλυσίδας** (CLAUDE.md «Τρεις κανόνες μίας πηγής»): ο κλάδος ξεκινά από το deploy branch της **τελευταίας ζωντανής** έκδοσης (μετά τη Φ2: το sync commit της Γ7/Κ3 της Φ2). `git merge-base --is-ancestor <πηγή του ζωντανού Worker> HEAD` → 0.
- [ ] **Step 2: Το patch.** `git apply --check docs/national-v5/handover/worker/worker-072b.patch && git apply docs/national-v5/handover/worker/worker-072b.patch` (ή `--3way`, αν η Φ2 άλλαξε· σε σύγκρουση ξαναγράφεται με το χέρι από τα Interfaces και ξανατρέχουν όλα). Μετά: `git checkout feat/national-v5-handover -- worker/migrations/drafts/072b_plan_vehicle_segments.sql`.
- [ ] **Step 3: Πράσινο.**

```bash
node worker/tools/worker-guard.mjs worker/src/index.js --plan 1 --handover 1 | tail -1
node --check worker/src/index.js && node --test worker/test/*.test.mjs worker/src/rt-rules.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped)'
node --test worker/test/plan-contract.test.mjs 2>&1 | grep -E 'checked'
```
Expected: `GUARD OK (16 markers, plan=1, handover=1)`· `ℹ tests 283`, `ℹ pass 282`, `ℹ skipped 1`, `ℹ fail 0` (ο skip του main)· τέσσερις γραμμές `checked:`, η τελευταία της 072b. Και το διπλό bundle: `npx esbuild worker/src/index.js --bundle --format=esm --platform=neutral --external:@cloudflare/puppeteer '--external:node:*' --outfile=/tmp/b1.js`, ξανά πάνω στο `/tmp/b1.js` → `/tmp/b2.js`, και ο φρουρός πάνω στο `b2.js` → το ίδιο `GUARD OK`.
- [ ] **Step 4:** `/code-review xhigh` (Worker, ρόλοι), commit, push του κλάδου, PR.

### Task Κ-H1: Ίχνος

- [ ] **Step 1:** `docs/DECISION_LOG.md`: «<ημερομηνία> · Εθνικά v5 · Αλλαγή οχήματος: πλάνο και αποφάσεις (owner)», με τις απαντήσεις 👤 1–5 και τις H-1..H-19 (επιλογή / εναλλακτικές / απόδειξη / ποιος), ειδικά το H-9 (ο κανόνας της στάσης).
- [ ] **Step 2:** `docs/sessions/YYYY-MM-DD-dimitris-national-v5-handover-plan.md` (έως 5 κουκκίδες) και η γραμμή του στο «Now» του `docs/SESSION.md`.

### Task Κ-H2: Εκτέλεση της 072b από τον owner (runbook· ο agent μόνο διαβάζει)

Προϋποθέσεις: έγινε το Κ2 της Φ2 (072 ζωντανή), έγινε το B2 **πάνω στα md5 της παραγωγής**, merged το PR του B4, ώρα **μετά τις 15:00**, ρητό «ναι». Backup: ο νυχτερινός dump της ValueDriven (CLAUDE.md κανόνας 5).

- [ ] **Step 1:** `072b_plan_vehicle_segments_fingerprint.sql` → κράτα τη γραμμή.
- [ ] **Step 2:** `072b_plan_vehicle_segments_dryrun.sql` → Expected το κόκκινο `DRY RUN 072b finished - EVERYTHING UNDONE … 072b ran: segments table yes, exclude on segments 2, on cycles 0, hooked functions 7, acts 3, open to API 0, auditor policy 1, triggers 50, B-54 50, v5 rows 0`. Οτιδήποτε άλλο: ΣΤΑΜΑΤΑ, το μήνυμα στον συντονιστή.
- [ ] **Step 3:** `072b_plan_vehicle_segments.sql` → NOTICE `072b OK …` και η γραμμή `072b OK | 2 | 0 | 50 | 50 | 0 | 0`.
- [ ] **Step 4:** `072b_plan_vehicle_segments_verify.sql` → `applied = 072b in place`, `exclude_on_segments = 2`, `exclude_on_cycles = 0`, `hooks_in_place = 7`, `changed_live = 0`, `public_acts = 3`, `open_to_api = 0`, `open_relations = 0`, `rls_off = 0`, `auditor_policy = 1`, `other_policies = 0`, `new_triggers = 4`, `b54_matches = true`, `segments = 0`, `v5_cycles = 0`, `seg_problems = 0`, `overlaps = 0`. Και `072_plan_functions_verify.sql` → `plan_functions = 73`, `service_role_execute = 19`, `changed_live = 0`. Το verify της 071b δείχνει πλέον `truck_once = false` / `driver_once = false` (ζουν στα τμήματα): αναμενόμενο, γραμμένο εδώ.
- [ ] **Step 5:** fingerprint ξανά → ίδια γραμμή με το Step 1 (εκτός `read_at_athens`).
- [ ] **Step 6 (προαιρετικό, μόνο με «ναι»):** `072b_plan_vehicle_segments_test.sql` → `Result: 86 OK, 0 FAIL` (προχωρούν μόνο ακολουθίες).
- [ ] **Step 7:** Τα 6 αρχεία βγαίνουν από το `drafts/` (`git mv` στο `worker/migrations/`). Στο `build-072b.mjs` (`DIR`), στο `sql-072b-drafts.test.js` (`DIR`), στο `plan-072b.test.mjs` (`read`) και στο `plan-contract` (λίστα `readOne`) αλλάζει η διαδρομή· ξανατρέχουν τα τρία του B1 και ο Worker. Τα B-91..B-93 μπαίνουν στο seed της 073b (Π3-6).

### Task Κ-H3: Deploy του Worker (runbook, owner· μετά το Κ-H2)

- [ ] **Step 1:** Πριν: λήψη του ζωντανού script από το CF API, ξετύλιγμα multipart, `worker-guard.mjs <λήψη> --plan 1 --handover 0` → `GUARD OK (16 markers, plan=1, handover=0)`· bindings 3/3 και τα plain vars του `wrangler.toml` μέσω CF API· αντίγραφο του bundle για επαναφορά.
- [ ] **Step 2:** `cd worker && CLOUDFLARE_API_TOKEN=$CF_API_TOKEN npx wrangler deploy` **μετά τις 15:00**.
- [ ] **Step 3:** Μετά: ξανά λήψη, `--plan 1 --handover 1` → `GUARD OK (16 markers, plan=1, handover=1)`· bindings 3/3· smoke: login, `GET /plan/board?week=<Σάββατο>` 200, `POST /plan/rt/<id>/handover` **χωρίς** `dry_run` → 409 `writes_closed`, με `"dry_run": true` σε ανύπαρκτο κύκλο → 422 `rt_gone` στα ελληνικά. Μέτρηση: `SELECT count(*) FROM rt_vehicle_segments` = 0, `model=2` = 0.
- [ ] **Step 4:** CLAUDE.md, λίστα «σημάδι ανά λειτουργία»: `- αλλαγή οχήματος: rpc: "plan_seg_change"` (δεν αφαιρείται ποτέ)· commit «sync worker source with deployed <version>» στο `main` μέσω PR.

### Task Κ-H4: Πριν από την ημέρα L (υπενθύμιση, όχι εργασία αυτού του πλάνου)

- [ ] Η 073 έχει εκτελεστεί με τα Π3-1..Π3-7 (μισθοδοσία ανά οδηγό, κόστος συνεργάτη = άθροισμα, DKV ανά τμήμα, B-83 ανά τμήμα)· **μόνο τότε** το `PLAN_WRITES_OPEN = true` της Φ5. Η Φ4 έχει τις οθόνες της §7.

---

## Παράδοση στη Φ3 (073 / 073b· γράφεται στο προσχέδιό της στον Task 0 της Φ3, με 👤 1 = Α)

- **Π3-1 (άγκιστρο της 073 στο `plan_rt_update`):** το «πριν» του γίνεται `14305bebe49df1629cd1a47788028b08` (το τελικό της 072b πάνω στην 072 `483ffd6e`· ξαναμετριέται). Η γραμμή «-- 6. the international day …» είναι ανέγγιχτη, άρα το `a` της 073 βρίσκεται ακόμη ακριβώς μία φορά. Οι άλλες 4 συναρτήσεις με άγκιστρο της 073 (`plan_h_leg_add`, `plan_h_leg_drop`, `plan_h_drop_consequences`, `plan_order_update`) δεν τις αγγίζει η 072b.
- **Π3-2 (μισθοδοσία ανά οδηγό, R-41..R-44):** `dl_entries.per_driver` + δύο μερικοί δείκτες + constraint trigger (B-54 +1)· ένας βοηθός `plan_h_payroll_sync(rt)`, που καλείται από το `dl_sync_from_rt` (μία γραμμή, md5 `331cea3a…` πριν), από τις τρεις `plan_seg_*` και από το `plan_rt_clear`· `dl_v_rt_gap`, `dl_v_entries.segment_text` (τελευταία στήλη)· το `model=1` ως το byte (`f3-money.md` §1). Η αναζήτηση ποσού γίνεται με (`rt_id`, `driver_id`), όπως ήδη στην 072b (`payroll_locked`, λίστα αφαίρεσης), άρα δουλεύει πριν και μετά.
- **Π3-3 (DKV, R-46):** το Ε10 διαβάζει τη `v_rt_vehicle_windows` (της 072b) αντί για το `ct_round_trips`, με dedupe ανά `rt_id` στο `matchRoundTrip` και στο `allocateFees`· ο κανόνας «ποιο τμήμα» = H-9, για ό,τι δένεται με στάση.
- **Π3-4 (κόστη, R-45, R-47):** `ct_v_rt_costs` με άθροισμα γραμμών μισθοδοσίας ανά κύκλο και `partner_planned = Σ partner_rate` των τμημάτων PARTNER· τιμολόγιο συνεργάτη = 👤 3· «Έξοδα Μ» = 👤 4.
- **Π3-5 (B-83 ανά τμήμα, R-50):** «τμήμα PARTNER χωρίς κόμιστρο»· όχι δεύτερος έλεγχος.
- **Π3-6 (073b):** η λίστα πινάκων της πολιτικής D-14 **δεν** περιλαμβάνει το `rt_vehicle_segments` (την έχει ήδη, H-10)· το seed (τύπου `047b`) παίρνει τα B-91..B-93 από το `tms-auditor/checks/`· το scenario test μαθαίνει τα τμήματα· μετά την 073b το `071_plan_schema_verify` δείχνει `policies = 5` (οι πίνακες της 071) και το verify της 072b `auditor_policy = 1`.
- **Π3-7 (σειρά rollback):** 073 → 072b → 072· το rollback της 072b αρνείται όσο υπάρχει `plan_h_pallet_sync`.

## Παράδοση στη Φ4 (οθόνες, R-52..R-66)

Από τη βάση έρχονται έτοιμα: τα `segments[]` στο board με `label`, `stop_ids`, `place_note`, `reason`, `reason_note`, `partner_rate`, `has_vehicle`· τα σχήματα `preview` και `conflict` (με `message` από τον Worker)· οι προειδοποιήσεις `seg_stop_moved`, `seg_stop_straddles`, `v1_same_truck`· το ιστορικό από το `audit_log` (`table_name = 'rt_vehicle_segments'`, create/update/delete, actor, role). Η Φ4 χρωματίζει στάσεις **μόνο** από τα `stop_ids` (ποτέ δικός της υπολογισμός, H-9) και κρατά τον χάρτη λόγων με drift test (H-19). Μένουν της Φ4: πλακίδια με πλάγια πλευρά, στήλη ΑΝΑΘΕΣΗ 266px, ώρα Βέροιας στη ΦΟΡΤΩΣΗ, φόρμα H2/H3, λίστα H4 (και το `preview.conflict` της αφαίρεσης), φύλλο οδηγού H5, καρτέλα H6, σφάλματα H7, «ακολουθεί» H8 (Figma `2120:7735`). Το φίλτρο «ανά φορτηγό/οδηγό» του `/costs/pnl` και η πύλη παλετών συνεργάτη διαβάζουν το αντίγραφο του ΑΡΧΙΚΟΥ: μπαίνουν στη λίστα της Φ4 (`f3-money.md` §3).

---

## Επαναφορά (σειρά)

1. **Ο Worker** πρώτα (επαναφορά στο bundle του Κ-H3 Step 1). Αλλιώς οι διαδρομές θα απαντούσαν 503 `schema_behind`: ονομασμένο, αλλά άχρηστο.
2. **Η 073**, αν έχει εκτελεστεί (το rollback της 072b αρνείται όσο υπάρχει).
3. **`072b_plan_vehicle_segments_rollback.sql`** (μετά τις 15:00, «ναι»): αρνείται με την πρώτη γραμμή v5 ή τμήμα· βγάζει τα 10 άγκιστρα **ανάποδα**, με md5 σε κάθε βήμα· σβήνει triggers, όψεις, πίνακα (και την πολιτική του) και τις 19 συναρτήσεις· ξαναβάζει τα δύο EXCLUDE στο `ct_round_trips` **με τις λέξεις της 071b** και το αποδεικνύει με `pg_get_constraintdef`· B-54 −4. Expected: `072b ROLLED BACK | 2 | 0 | 54 | 46 | 46`. Δοκιμασμένο στο harness: μετά το rollback, 072 rules 203 OK, και η 072b ξαναμπαίνει.
4. Μόνο μετά, αν χρειαστεί, το rollback της 072.

Μετά την πρώτη πραγματική γραμμή v5 **δεν υπάρχει rollback**, μόνο διορθώσεις προς τα εμπρός (spec Εθνικών §2.2).

---

## Αν σπάσει, πώς θα το μάθουμε

- **Στην εκτέλεση:** ο φρουρός του PART 0 (072 όχι εφαρμοσμένη, 073 παρούσα, γραμμή v5, EXCLUDE όχι λέξη-λέξη, ένα από τα 46 md5, πλήθος `plan_*`, B-54) και οι αποδείξεις του PART 6/9: κάθε άγκιστρο ακριβώς μία φορά, αναστρέψιμο, με τα ίδια δικαιώματα· 10 άγκιστρα· 19 νέες συναρτήσεις· EXCLUDE μόνο στα τμήματα· 0 γραμμές· κλειστό στους ρόλους API· μία πολιτική· triggers +4 = B-54. Ένα λάθος → `RAISE`, και ακυρώνονται όλα (ένα DO block).
- **Στη βάση, για πάντα:** κενό, επικάλυψη, αντίγραφο ΑΡΧΙΚΟΥ που αποκλίνει, τμήμα σε κύκλο `model=1`, κύκλος v5 χωρίς τμήμα, σκληρό DELETE → άρνηση στο COMMIT με `plan:<code>`. Φορτηγό ή οδηγός σε δύο τμήματα την ίδια ώρα → EXCLUDE (23P01 → `truck_busy`/`driver_busy`).
- **Στην απάντηση:** κάθε άρνηση είναι 422 με κωδικό και ελληνικό κείμενο (το `plan-contract` το φρουρεί στο build). Κάθε στάση που αλλάζει εκτελεστή, κάθε αλλαγή μέσα σε στάση και κάθε σημερινό RT του ίδιου φορτηγού → προειδοποίηση. Η αφαίρεση δείχνει, πριν από το token, αν το προηγούμενο όχημα είναι πιασμένο. Ταυτόχρονη αλλαγή → 409 `busy_retry`. Χαμένη απάντηση → «μπορεί να αποθηκεύτηκε» (Φ2)· η επανάληψη με το ίδιο `request_id`, ή το ξαναπάτημα της αφαίρεσης, δίνει την ίδια απάντηση.
- **Στον ελεγκτή (ωριαίο, μετά το seed της 073b):** B-91 (κάλυψη / αντίγραφο), B-92 (ίδιος οδηγός σε δύο τμήματα), B-93 (`other` χωρίς σημείωση), όλα 0 πάντα. Τρέχουν ως `tms_check_runner` και **βλέπουν** τα τμήματα (H-10, αποδεδειγμένο στο harness). B-54, αν αλλάξει το πλήθος των triggers.
- **Στο deploy:** `worker-guard.mjs --handover 1` (το σημάδι λείπει = ΣΤΑΜΑΤΑ)· το verify της 072b (μία γραμμή), οποτεδήποτε.

---

## Self-review (έγινε, 25/10)

- Κάθε R-1..R-72 και το R-28α έχει γραμμή στον πίνακα αντιστοίχισης· όσα είναι της Φ3/Φ4 έχουν παράδοση με όνομα.
- Κάθε εύρημα της R1 έχει γραμμή στις «Απαντήσεις», με περίπτωση που αποτυγχάνει χωρίς τη διόρθωση (11 από τις 14 νέες αποτυγχάνουν πάνω στο προσχέδιο R1) ή με test του Worker.
- Ό,τι θέλει owner είναι στα 👤 1–5· όλες οι υπόλοιπες επιλογές είναι H-n με εναλλακτική, για έγκριση μαζί.
- Κανένα placeholder: κάθε md5, πλήθος και Expected είναι μετρημένο στις 25/10 (PGlite, Worker, SELECT). Όσα θα αλλάξουν με την εκτέλεση της 072 ξαναμετριούνται στο B2, με γραμμένη διαδικασία.
