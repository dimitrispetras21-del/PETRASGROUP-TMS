# Εθνικά v5 · Φ5 · Ημέρα L (`074_plan_cutover`): πλάνο υλοποίησης

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** η ημέρα L. Από αυτήν κάθε νέα εθνική δουλειά γεννιέται μόνο στο v5. Τα VS με εθνικό σκέλος από το L και μετά μπαίνουν στο v5 μόνο μέσω της γέφυρας. Το παλιό μοντέλο (NL/GL/CL) μένει ιστορικό. Οι εγγραφές `/plan/*` και το `WN_V5` ανοίγουν την ίδια μέρα.

**Architecture:** τρία μέρη, με αυτή τη σειρά.
- **Βάση:** `074a` (μόνο αναγνώσεις, πριν από το L), `074` (Παρασκευή L−1 μετά τις 15:00), `074b` (έλεγχοι ελεγκτή, αμέσως μετά). Στην `074`:
  - η ημέρα L ζει σε μία γραμμή του `plan_config`·
  - ένας trigger γέφυρας κρατά τις αποστολές VS ίσες με τις στάσεις εθνικής πλευράς·
  - η ίδια συναλλαγή αποσυνδέει (soft delete) το Direct NL·
  - ένα πάγωμα INSERT στη βάση κλείνει το παλιό μοντέλο.
- **Worker:** δύο deploy στην ίδια αλυσίδα, πάνω στη ζωντανή πηγή `f1e97f07`.
  - Deploy 1, πριν από το L: νέες αναγνώσεις, Ε18 και Ε19· ο κώδικας της Ε16 μπαίνει, αλλά κλειστός.
  - Deploy 2, ημέρα L: μία γραμμή, `PLAN_WRITES_OPEN = true`, με φρουρό `--plan 2`.
- **Front end:**
  - ένα PR «αδρανές» πριν από το L, που αλλάζει συμπεριφορά μόνο όταν η βάση πει ότι η μετάβαση έγινε (`GET /plan/config`)·
  - ένα PR την ημέρα L, που ανοίγει το `WN_V5`.

**Tech Stack:** Postgres (Supabase), PL/pgSQL σε ένα DO block ανά αρχείο, PGlite harness (`tms-auditor/test`), Cloudflare Worker (`worker/src/index.js`, wrangler), vanilla JS SPA, Playwright rigs (`tests/critics`).

**Τι ΔΕΝ έχει αυτό το πλάνο: κώδικα.** Ο owner ζήτησε «μόνο πλάνο, χωρίς κώδικα σε αυτό το session»· η υλοποίηση ξεκινά μετά την έγκρισή του. Κάθε Task δίνει:
- υπογραφές, κανόνες, και περιπτώσεις δοκιμής με αναμενόμενο κωδικό·
- εντολές και αναμενόμενη έξοδο·
- όχι πλήρη κείμενα συναρτήσεων.

Ο κώδικας γράφεται από το Task 0 και μετά, όπως στις Φ2 και Φ3: πρώτα οι δοκιμές, που αποτυγχάνουν, μετά η υλοποίηση.

## Global Constraints

- **Βάση = SELECT μόνο** σε κάθε session. Εκτελεί ο owner στον SQL editor, μετά τις 15:00, με ρητό «ναι» στη συνομιλία, πρώτα dry run (κανόνας 5).
- **Κάθε migration = ένα DO block, μόνο ASCII:**
  - `lock_timeout 5s`· ελληνικά κείμενα σε base64, όπως η 072·
  - συνοδευτικά: `_dryrun` (τελειώνει με σκόπιμο σφάλμα, δεν κρατά τίποτα), `_verify` (μόνο SELECT), `_test` (PGlite), `_rollback`, `_fingerprint`·
  - ένας builder `worker/migrations/drafts/tools/build-074.mjs` τα παράγει, με έλεγχο drift (`--check`), όπως ο `build-073b.mjs`.
- **Γεννιέται κλειστό** (αρχή 5):
  - κάθε νέα συνάρτηση: `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`· `EXECUTE` στον `service_role` **μόνο** όσες καλεί ο Worker·
  - κάθε νέος πίνακας: RLS on χωρίς policy, εκτός από τη `monitor_read` του ελεγκτή.
- **Κάθε άρνηση** = `23514` + `HINT 'plan:<code>'`. Ο Worker τη μεταφράζει στον **έναν** χαρτογράφο (`stockRuleError` / `PLAN_RULE_TEXT`)· δεύτερος δεν φτιάχνεται.
- **Κάθε συνάρτηση που ξαναγράφεται** ξεκινά από το **ζωντανό** κείμενο, με φρουρό md5 του `prosrc` και μία γραμμή-patch (πρότυπο 071 §9 / 072 PART 0). Ποτέ ξαναπληκτρολόγηση.
- **Σειρά:**
  - 073b (ζωντανή 28/10) → `074a` → Worker deploy 1 → FE-1·
  - την ημέρα L: `074` + `074b` + Worker deploy 2 + FE-2.
- **Αλυσίδα Worker** (CLAUDE.md, «Τρεις κανόνες μίας πηγής»):
  - νέος κλάδος `deploy/worker-plan-f5` από `origin/deploy/worker-plan-f3`· tip `d4c3dbae`, πηγή `worker/` ίδια με το `main` @ `f1e97f07` = ζωντανός `ffd5531f`·
  - `git merge-base --is-ancestor f1e97f07 <κλάδος deploy>` πριν από κάθε deploy.
- **Ποτέ push στο `main`, ποτέ merge, ποτέ force push.** Κάθε PR περνά `/code-review`, με το επίπεδο ανάλογα με το περιεχόμενο:
  - `xhigh`: 074a / 074 / 074b και Worker·
  - `high`: FE-1·
  - `medium`: FE-2.
- **Αρχεία που ΔΕΝ αγγίζει κανείς ως το merge του PR `prev_partner_rate`** (άλλο session, 28/10): `modules/weekly_natl_v5.js`, `modules/wn5_*.js`, `app.html`, `sw.js`. Το FE-1 ξεκινά από φρέσκο `origin/main` μετά από εκείνο το merge (κανόνας 8).
- **Δημόσιο repo:** ποτέ ονόματα πελατών, μυστικά ή ευρήματα ασφαλείας. Στα tests και στα docs μόνο ids.
- **Ερωτήσεις owner:** μία τη φορά, με πρόταση (§4). Το πλάνο ακολουθεί την πρόταση. Αν ο owner την αλλάξει, αλλάζει πρώτα το αντίστοιχο Task και μετά γράφεται κώδικας.

---

## 0. Πηγές και μετρημένη αφετηρία

**Πηγές** (όλες στο `origin/main` @ `9193f707`, 28/10):
- spec `docs/superpowers/specs/2026-10-21-national-v5-design.md`: §2.2 (καθαρή αντικατάσταση), §3 VS, §5 (Ε1–Ε21), §8.
  - **Το spec υπερισχύει του τεχνικού προσχεδίου.** Στο §7 «φεύγουν»: συνύπαρξη ≥ W, πάγωμα, `planEraOf`, `legacy_nl`, B-82, `piece_planned`, `bridge_moved`, `bridge_split`.
- `docs/national-v5/tech-draft-2026-10-21.md` §Φ5: μόνο ό,τι το spec δεν ακύρωσε.
- `docs/national-v5/f2/requirements.md`: X-3, C-16, C-17.
- `docs/national-v5/f3/requirements.md`: X-01, F3-11 (σειρές 1, 2, 6).
- `docs/national-v5/handover/f2-interfaces.md`: 074 = Φ5.
- `docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md`, αποφάσεις 1–2: `via_hub` χωρίς backfill ως τη 074· `plan_config` στη 074.
- `docs/superpowers/plans/2026-10-21-national-v5-master.md`: Task Φ5.
- DECISION_LOG:
  - 21/10: αρχιτεκτονική, κανόνες VS, δικαιώματα.
  - 22/10 Φ1: με το ανοιχτό «η διόρθωση παλετών … ξανακόβει τα κομμάτια στην ίδια συναλλαγή».
  - 23/10 Φ2: απόφαση 22 (εγγραφές κλειστές ως το L), 27 (`"Via Hub"`), 28 (Ε16).
  - 24/10 M-5: ο έλεγχος «εθνική ≥ L χωρίς μερίδια» στη Φ5.
  - 26/10, κριτική του PR #90: ανοιχτό (3), φρουρός βάσης για το `via_hub`.
  - 26/10 Φ4α Ε-1..Ε-44: τα αιτήματα που εμποδίζουν το L, Ε-2, Ε-26, Ε-27/44, Ε-34, Ε-41/43.
- `docs/order-route/ROUTE-GRAMMAR.md` §5–§6: 74 από τα 81 φορτία είναι VS (27/10)· ανοιχτό το VS σε `Cancelled`.
- Ζωντανά:
  - `worker/migrations/071*`, `072*`, `072b*`, `073*`, `073b*`·
  - `worker/src/index.js`: `PLAN_PERMS` :5711, `PLAN_WRITES_OPEN` :5727, `writes_closed` :5972, `closedUntilPlan: ["Via Hub"]` :1771/:2697, dispatcher facade :602-640·
  - `worker/tools/worker-guard.mjs`·
  - `config.js:399` (`WN_V5: 'off'`)·
  - `core/plan-ids.js:22` (`LOOKUPS_PENDING = true`).

**Μέτρηση παραγωγής 28/10/2026** (μόνο SELECT, `count(*)`, project `gatejgbpyodlepkvqkgf`):

| Τι | Τιμή |
|---|---|
| Ζωντανές διεθνείς VS (`veroia_switch`) | **79**· με `cross_dock_date` **79**, χωρίς **0**, `Cancelled` **0** |
| Μέγιστη `cross_dock_date` | 2/11/2026 · ≥ 31/10: **4** · ≥ 7/11: **0** |
| Στάσεις εθνικής πλευράς των VS (εισαγωγή `Unloading`, εξαγωγή `Loading`, ζωντανές) | **99**· χωρίς παλέτες 0, χωρίς τόπο 0, χωρίς ημέρα 0 |
| Στάσεις `Cross-dock` των VS | 79 (δεν παίρνουν γέφυρα: είναι ο ίδιος ο κόμβος) |
| Χώρα στάσης | γραμμένη `Greece` ή `GR`, μία εισαγωγή χωρίς χώρα → **ο κανόνας της γέφυρας ΔΕΝ διαβάζει χώρα**, μόνο τον ρόλο της στάσης |
| `national_loads` ζωντανά | **86** = 79 `Direct` + 6 `National` + 1 `Groupage` |
| VS με ακριβώς ένα ζωντανό Direct NL | **79 / 79**· χωρίς NL 0, με 2+ 0, NL σε μη-VS 0 |
| NL με φορτηγό ή συνεργάτη | 14, όλα παλιά· στα 7 VS με ημέρα κόμβου ≥ 28/10: **0** |
| `ct_rt_legs` σε NL | **0** |
| Διαφορά ημερών NL ↔ ημέρα κόμβου | εισαγωγή: παράδοση NL = ημέρα κόμβου **+1** (57/57)· εξαγωγή: φόρτωση NL = ημέρα κόμβου **−1** (19/22), ίδια μέρα (2), −2 (1) |
| `national_orders` ζωντανές | **6**, όλες δοκιμές (24/8–14/9)· NL `National`/`Groupage` 7, δοκιμές (9–14/9)· GL **2** (`Assigned`)· CL **1** |
| `local_moves` | `relay_delivery` 1 (σβησμένη)· `local` **0**· `nat_loading` **0** |
| `order_stops.via_hub` | `true` **0** / `false` 1.507 |
| Γραμμές v5 | `shipments`, `shipment_pieces`, `rt_stops`, `piece_legs`, `plan_notices`, `rt_vehicle_segments`, `ct_round_trips model=2`: **όλα 0** |
| `plan_config` | **δεν υπάρχει** |
| B-54 (triggers) | **50** |
| Έλεγχοι | τελευταίος ο B-94 → **ο επόμενος ελεύθερος είναι ο B-95**· υπάρχουν οι B-10, B-26, B-42, B-47, B-59 |
| Triggers στο `national_loads` | `rt_sync_national_load`, `national_load_soft_delete_unlink`, `trg_national_loads_soft_delete_cascade`· **κανένας φρουρός INSERT** |
| VS που δημιουργούνται ανά εβδομάδα (6 εβδομάδες) | 4, 4, 6, 12, 8, 5, 4 |

**Δύο συνέπειες της μέτρησης που αλλάζουν το προσχέδιο:**
1. Ο κανόνας της γέφυρας ορίζεται από τον **ρόλο της στάσης**, όχι από τη χώρα: η χώρα είναι γραμμένη με δύο τρόπους και μία φορά λείπει.
2. Η τομή «ημέρα κόμβου ≥ L» του spec αφήνει ουρά και στις δύο πλευρές (Q-2, Q-3):
   - μια εισαγωγή VS με ημέρα κόμβου Παρασκευή **παραδίδει το Σάββατο L** στο παλιό μοντέλο·
   - μια εξαγωγή VS με ημέρα κόμβου Σάββατο **φορτώνει την Παρασκευή** στο παλιό board.

---

## 1. Τι είναι η Φ5 (ορισμοί, ώστε κάθε λέξη να σημαίνει ένα πράγμα)

- **Ημέρα L** = ένα Σάββατο (αρχή εβδομάδας TMS). Γράφεται **μία φορά**, στο `plan_config.cutover_day`. Όλοι οι φρουροί, οι έλεγχοι και το front end τη διαβάζουν από εκεί (αρχή 3: μία πηγή).
- **Γέφυρα VS** = μία γραμμή `shipments` (`order_id` + `order_stop_id`) για κάθε ζωντανή στάση εθνικής πλευράς μιας ζωντανής VS που «ανήκει στο v5», μαζί με ένα κομμάτι με τις παλέτες της στάσης.
  - Η γέφυρα δεν αντιγράφει τίποτα: τόποι, ημέρες και παλέτες διαβάζονται από `order_stops`/`orders` μέσω `v_shipments` (071).
- **«Ανήκει στο v5»** = ο κανόνας τομής, ένας ορισμός, στη συνάρτηση `plan_h_vs_in_v5(order_id)`. Ισχύει όταν:
  - η VS είναι ζωντανή, όχι `Cancelled` (Q-5), με `cross_dock_date` όχι NULL, **και**
  - το εθνικό της σκέλος ξεκινά ≥ L (πρόταση Q-2): εισαγωγή → `cross_dock_date ≥ L`· εξαγωγή → η νωρίτερη ημέρα στάσης φόρτωσης εθνικής πλευράς ≥ L·
  - **ή** η VS έχει ήδη ζωντανή γέφυρα: «μια φορά v5, πάντα v5». Μια μετακίνηση προς τα πίσω δεν τη γυρίζει ποτέ στο NL, που έχει ήδη σβηστεί.
- **Αποσύνδεση NL** = soft delete του ζωντανού Direct NL της ίδιας διεθνούς (`deleted_reason = 'v5 bridge (074)'`), στην **ίδια συναλλαγή** με τη γέφυρα.
  - Το id του γράφεται στο `plan_cutover_log`, ώστε να γυρίζει πίσω.
  - Αν το NL είχε όχημα, πηγαίνει ειδοποίηση στο γραφείο εθνικών (Q-3).
- **Πάγωμα.** Το spec καταργεί το πάγωμα ανά εβδομάδα. Μένει ένα, ολικό, από τη στιγμή της 074:
  - BEFORE INSERT στα `national_loads`, `groupage_lines`, `consolidated_loads` και στο `local_moves` με `move_kind = 'local'` → `plan:legacy_frozen`.
  - UPDATE και soft delete των ιστορικών **δεν** κόβονται στη βάση· τα κόβει ο Worker ανά ρόλο (Ε16, Q-10).
  - Τα 028/030 σταματούν να μετακινούν ιστορικά NL. Το 069 μένει: μετακινεί τη στάση `Cross-dock` της διεθνούς και τη ράμπα, που το v5 διαβάζει.
- **Συνύπαρξη** (spec §5 Ε20): δεν υπάρχει διπλό board. Υπάρχει διπλή **ανάγνωση** σε ένα σημείο, στα πλακίδια ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ του Weekly Διεθνών:
  - VS με γέφυρα → `/plan/vs-state`·
  - VS χωρίς γέφυρα → το ιστορικό NL, όπως σήμερα.

  Ο κανόνας είναι ένας («έχει γέφυρα;») και τον λέει η βάση· η οθόνη δεν ξαναϋπολογίζει την τομή.
- **Σημείο χωρίς επιστροφή** = όποιο έρθει πρώτο από: η πρώτη ζωντανή `piece_legs`, η πρώτη `national_orders` με αποστολή v5, η πρώτη `rt_stops`.
  - Ως τότε οι μόνες γραμμές v5 είναι οι γέφυρες της 074. Το `074_rollback` τις αποσύρει και ξαναζωντανεύει τα NL από το `plan_cutover_log`.
  - Μετά, μόνο διορθώσεις προς τα εμπρός. Ο owner το διαβάζει ρητά πριν από το «ναι» (Runbook R-3).

---

## 2. Πύλες της ημέρας L (όλες πράσινες πριν οριστεί ημερομηνία)

| # | Πύλη | Κάτοχος | Σήμερα (28/10) |
|---|---|---|---|
| P-1 | Φ4α merged (PR #113) | owner | ✅ 28/10 |
| P-2 | PR `prev_partner_rate` (H2, μόνο front) merged | άλλο session → owner | σε εξέλιξη |
| P-3 | `074a` εκτελεσμένη: board με Ε-26 / Ε-27 / Ε-34 / Ε-41 και `plan_lookups()` | Task A | — |
| P-4 | Worker deploy 1: `/plan/config`, `/plan/lookups`, Ε18, Ε19, Ε16 κλειστό | Task W | — |
| P-5 | FE-1 merged (αδρανές), `LOOKUPS_PENDING = false` | Task F | — |
| P-6 | Οι αναγνώστες της Φ4β που εμποδίζουν το L (Q-7) merged | δικό τους πλάνο | δεν υπάρχει πλάνο Φ4β |
| P-7 | Pilot μίας εβδομάδας, `WN_V5 = 'pilot'`, χωρίς εγγραφές (Q-9) | owner | — |
| P-8 | Πρόβα την Πέμπτη L−2: dry run της 074 στην παραγωγή, κόκκινο σκόπιμα, με τα αναμενόμενα νούμερα | owner | — |
| P-9 | Ερωτήσεις owner Q-1..Q-10 απαντημένες | owner | — |
| P-10 | Ανοιχτά άλλων εγγράφων που αφορούν το L: B-79 και NULL (073b)· ROUTE-GRAMMAR §7 ερ. 1/3 (Γ1+Γ4, Γ2). Ό,τι απαντηθεί «ναι, έλεγχος» μπαίνει στην `074b` ως B-100+ | owner | ανοιχτά |

---

## 3. Δομή αρχείων

**Βάση** (`worker/migrations/drafts/` ως την εκτέλεση, μετά ένα επίπεδο πάνω, κανόνας 5):

| Αρχείο | Ευθύνη |
|---|---|
| `074a_plan_reads.sql` (+ `_dryrun`, `_rollback`, `_verify`, `_test`) | Μόνο αναγνώσεις, 0 γραμμές: το `plan_board` μαθαίνει τα κλειδιά Ε-26/Ε-27/Ε-34/Ε-41· νέα `plan_lookups()`· στήλη `shipment_pieces.for_split_at` και η μία γραμμή στο `plan_move_pieces` που τη γράφει (Ε-41) |
| `074_plan_cutover.sql` (+ `_dryrun`, `_rollback`, `_verify`, `_test`, `_fingerprint`) | `plan_config` + `plan_cutover_log`· `plan_h_vs_in_v5`, `plan_bridge_sync` και οι βοηθοί της· triggers γέφυρας· πάγωμα INSERT· 028/030 χωρίς κλάδο NL μετά το L· backfill (γέφυρες, `via_hub`, αποσύνδεση NL)· καθάρισμα δοκιμών· `plan_config_read()`· `order_delete_preview()` (Ε19) |
| `074b_plan_cutover_monitoring.sql` (+ `_dryrun`, `_rollback`) | Έλεγχοι B-95..B-99· Ε17 (B-10, B-26, B-42, B-47)· παράγεται από τα `tms-auditor/checks/` |
| `drafts/tools/build-074.mjs` | Παράγει dryrun / rollback / verify και την `074b` από τα checks, με `--check` για drift |

**Ελεγκτής:**
- `tms-auditor/checks/B-95.sql` … `B-99.sql`·
- νέα κείμενα για `B-10.sql`, `B-26.sql`, `B-42.sql`, `B-47.sql`·
- `tms-auditor/test/plan-074.test.mjs`·
- `tms-auditor/test/fixtures/live-073b.sql` (νέα λήψη).

**Δοκιμές repo:** `tests/sql-074-drafts.test.js`.

**Worker** (κλάδος `deploy/worker-plan-f5`):
- `worker/src/index.js`, `worker/tools/worker-guard.mjs`·
- νέα tests: `worker/test/plan-config.test.mjs`, `plan-lookups.test.mjs`, `legacy-closed.test.mjs`, `costs-rt-range.test.mjs`, `delete-order-confirm.test.mjs`, `worker-guard-f5.test.mjs`·
- ενημέρωση των `plan-contract`, `plan-perms`, `plan-routes`, `plan-tables-guard` (+ `plan_config`, `plan_cutover_log` στο `V5_TABLES`).

**Front end:**
- **FE-1 (αδρανές):**
  - `core/plan-config.js` (νέο)·
  - `modules/weekly_intl.js:710-741`, `modules/weekly_intl_v2.js:279-291, 1184-1194`·
  - `modules/orders_intl.js:1685-1955`, `core/order-sync.js:96-235`, `core/stops-helpers.js:50-100`·
  - `modules/orders_natl.js` (σημεία εισόδου)·
  - `core/ai-chat.js` (`update_record`), `core/order-quick-edit.js`, `core/api.js:1360-1448` (Επαναφορά Κάδου)·
  - `modules/daily_ops.js` (αλλαγή ημέρας VS)·
  - `core/plan-ids.js:22`·
  - νέα tests και rigs.
- **FE-2 (ημέρα L):** `config.js:399`, μενού (`core/router.js` ή όπου ζει το μενού), bump `?v=` και `SW_VERSION`.

**Docs:** `CLAUDE.md` (λίστα φρουρού, «Sync chain» με σημείωση L), `docs/DECISION_LOG.md`, `docs/sessions/`.

---

## 4. Ερωτήσεις προς τον owner (μία τη φορά, η πρόταση πρώτη)

Το πλάνο ακολουθεί την **Πρόταση**. Δίπλα σε κάθε ερώτηση γράφεται ποιο Task αλλάζει, αν ο owner διαλέξει άλλο.

1. **Q-1 · Ποια ημέρα είναι το L;**
   - **Πρόταση:** όχι πριν πρασινίσουν οι πύλες P-1..P-10. Ρεαλιστικά, το νωρίτερο είναι το **Σάββατο 14/11/2026**:
     - 074a + deploy 1 + FE-1 την εβδομάδα 2–6/11·
     - pilot 7–13/11·
     - πρόβα την Πέμπτη 12/11·
     - εκτέλεση την Παρασκευή 13/11, μετά τις 15:00.
   - **Εναλλακτική:** 21/11, αν η Φ4β (Q-7) αργήσει.
   - Η ημερομηνία είναι απόφαση του owner. Γράφεται ως σταθερά μόνο στο `074_plan_cutover.sql`, με φρουρό ότι είναι Σάββατο και στο μέλλον.
   - *(Αλλάζει: η σταθερά της Task B1 και το Runbook.)*
2. **Q-2 · Τι κόβει: η ημέρα κόμβου ή η ημέρα που ξεκινά το εθνικό σκέλος;**
   - Το spec λέει «ημέρα κόμβου ≥ L». Η μέτρηση δείχνει ότι η εξαγωγή φορτώνει μία μέρα **πριν** από την ημέρα κόμβου (19/22). Άρα μια εξαγωγή με ημέρα κόμβου Σάββατο L φορτώνει την Παρασκευή, ήδη σχεδιασμένη στο παλιό board.
   - **Πρόταση:** τομή κατά την **ημέρα που ξεκινά το εθνικό σκέλος**:
     - εισαγωγή → ημέρα κόμβου, όπως το spec·
     - εξαγωγή → η νωρίτερη φόρτωση εθνικής πλευράς.

     Ό,τι ξεκίνησε στο παλιό μοντέλο τελειώνει εκεί.
   - **Εναλλακτική:** το spec κατά γράμμα. Θα έφτιαχνε γέφυρα για εξαγωγή που φορτώθηκε την Παρασκευή, με κομμάτι «ΠΡΟΣ ΑΝΑΘΕΣΗ» σε περασμένη μέρα, άρα B-81 κόκκινο από το πρώτο πρωί.
   - *(Αλλάζει: `plan_h_vs_in_v5`, Task B2.)*
3. **Q-3 · VS ≥ L που την Παρασκευή έχει ήδη φορτηγό ή συνεργάτη στο παλιό board** (σήμερα 0 από 7, αλλά ως την Παρασκευή ο εθνικών μπορεί να αναθέσει).
   - **Πρόταση:**
     - γέφυρα για όλα· το NL σβήνεται (soft)·
     - η 074 τυπώνει στο dry run τη λίστα των NL με όχημα (ids)·
     - ο εθνικών τα ξαναναθέτει στο v5 το Σάββατο πρωί·
     - ειδοποίηση `legacy_nl_replaced` στο board.
   - **Εναλλακτική:** όσα έχουν όχημα μένουν στο παλιό μοντέλο. Αυτό σημαίνει δύο μοντέλα στην ίδια εβδομάδα, που το spec απέρριψε.
   - *(Αλλάζει: Task B2 βήμα 4.)*
4. **Q-4 · Αλλαγή του διεθνών που αδειάζει εθνικό κύκλο με παραστατικά** (μισθοδοσία με ποσό, έξοδα, τοπική φόρτωση). Το spec λέει «η αλλαγή περνά», αλλά δεν λέει τι γίνεται με τα χρήματα του κύκλου που άδειασε.
   - **Πρόταση (α):**
     - ο trigger ακυρώνει έναν κύκλο μόνο αν αδειάσει **και** δεν έχει παραστατικά·
     - αλλιώς τον αφήνει άδειο, με ειδοποίηση στον εθνικών, και τον δείχνει ο B-82 (άδειος κύκλος)·
     - ο εθνικών αποφασίζει με τον «Καθαρισμό» και τη λίστα του.

     Χρήματα δεν χάνονται ποτέ σιωπηλά (αρχή 1).
   - **Εναλλακτικές:** (β) ακύρωση με σβήσιμο, όπως η Μεταφορά της Φ2· (γ) άρνηση 422 στη διεθνή φόρμα.
   - *(Αλλάζει: `plan_h_bridge_unplan` / `retire`, Task B2.)*
5. **Q-5 · Διεθνής VS σε `Cancelled` (όχι διαγραφή).** Σήμερα 0 από 79· ανοιχτό από τη ROUTE-GRAMMAR §6.
   - **Πρόταση:** λογίζεται όπως το «VS off»:
     - τα κομμάτια βγαίνουν από τα φορτηγά, με τον κανόνα του Q-4·
     - η γέφυρα αποσύρεται, ειδοποίηση `vs_withdrawn`·
     - επαναφορά από `Cancelled` = νέα γέφυρα «ΠΡΟΣ ΑΝΑΘΕΣΗ».
   - **Εναλλακτική:** η γέφυρα μένει ζωντανή (σήμερα η `v_shipments.live` κοιτά μόνο το `deleted_at`). Τότε ένα ακυρωμένο φορτίο μένει στο φορτηγό.
   - *(Αλλάζει: `plan_h_vs_in_v5`.)*
6. **Q-6 · Δήλωση κόμβου ανά στάση (`via_hub`).** Το spec θέλει κουτάκι ανά στάση στη διεθνή φόρμα. Η Φ4α δεν το έχτισε, και το πάνελ Διεθνών περιμένει την απόδειξη των εθνικών (owner 26/10).
   - **Πρόταση:**
     - για αρχή, το `via_hub` το γράφει **μόνο η βάση** (`plan_bridge_sync`): `true` σε κάθε στάση εθνικής πλευράς μιας VS «στο v5», `false` αλλού·
     - το label `"Via Hub"` του facade μένει κλειστό για εγγραφή και μετά το L (σήμερα `closedUntilPlan`)·
     - το κουτάκι ανά στάση έρχεται με το πάνελ Διεθνών, και τότε το `via_hub` γίνεται είσοδος.
   - **Εναλλακτική:** κουτάκι τώρα. Θέλει αλλαγή στη διεθνή φόρμα πριν από το L, ενώ καμία μεικτή VS δεν έχει μετρηθεί.
   - *(Αλλάζει: Task B2, Task W4, νέο Task F.)*
7. **Q-7 · Ποιοι αναγνώστες της Φ4β (spec §5) εμποδίζουν το L;** Η Φ4α δεν τους έχτισε (S-167 «Φ4β»), και δεν υπάρχει ακόμη πλάνο Φ4β.
   - **Πρόταση, πριν από το L:**
     - **Ε14** Ράμπα: αλλιώς χάνονται οι εθνικές φορτώσεις της Βέροιας από τη ράμπα·
     - **Ε3** λίστα εθνικών / «Εβδομάδα»: αλλιώς κάθε εθνική v5 βγαίνει «ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ»·
     - **Ε2** και **Ε1/Ε20** είναι ήδη σε αυτό το πλάνο (FE-1).
   - **Πρόταση, στις δύο πρώτες εβδομάδες (Φ6):** Ε5, Ε12, Ε13, Ε15. Ως τότε δείχνουν ορατή γραμμή «εθνικά v5: εκτός», ποτέ ψεύτικο 0 (αρχή 1). Πλάνο Φ4β-L χωριστά.
   - **Εναλλακτική:** όλα πριν από το L.
   - *(Αλλάζει: πύλη P-6.)*
8. **Q-8 · Δύο deploy Worker ή ένα;**
   - **Πρόταση:**
     - deploy 1 πριν από το L: αναγνώσεις, Ε18, Ε19, και ο κώδικας της Ε16 κλειστός πίσω από τον `PLAN_WRITES_OPEN`·
     - deploy 2 την ημέρα L: **μία γραμμή**, `PLAN_WRITES_OPEN = true`.

     Έτσι η αλλαγή της ημέρας L είναι μία, και η επαναφορά είναι `wrangler rollback` στο deploy 1 (αρχή 7).
   - **Εναλλακτική:** ένα deploy την ημέρα L, με όλα μαζί.
   - *(Αλλάζει: Task W, Runbook.)*
9. **Q-9 · Pilot πριν από το L** (Ε-1: το όνομα το δίνει ο owner).
   - **Πρόταση:**
     - `WN_V5 = 'pilot'` για έναν χρήστη (τον εθνικών), μία εβδομάδα πριν από το L·
     - εγγραφές κλειστές (409 `writes_closed`): μόνο ανάγνωση και προεπισκόπηση·
     - ο χρήστης αναφέρει ό,τι δεν μοιάζει με τη δουλειά του.
   - **Ερώτηση: ποιος, και από πότε;**
10. **Q-10 · Ποιος κρατά εγγραφές στα ιστορικά NL/GL/CL μετά το L.** Το spec §3 λέει «ο dispatcher χάνει POST/PATCH/DELETE», αλλά δεν λέει τίποτα για τους άλλους ρόλους. Μένουν και VS με ημέρα κόμβου < L που εκτελούνται το Σάββατο L (εισαγωγή Παρασκευής → παράδοση Σαββάτου, 57/57).
    - **Πρόταση:**
      - INSERT: κανείς, στη βάση (πάγωμα)·
      - PATCH/DELETE ιστορικών: **μόνο owner**, για 14 ημέρες, μέσω της «Παλιάς προβολής»· μετά μόνο ανάγνωση (Φ7)·
      - `national_orders`: ο accountant κρατά PATCH (Invoiced, αριθμός τιμολογίου, τιμή)· ο dispatcher PATCH μόνο σε τιμή / reference / σημειώσεις (spec §3)·
      - η «Παλιά προβολή» μένει ορατή μόνο για εβδομάδες < L.
    - **Εναλλακτική:** κανείς δεν γράφει από το L. Τότε μια βλάβη το Σάββατο σε παλιό φορτίο δεν διορθώνεται στο TMS.
    - *(Αλλάζει: Task W4, FE-2.)*

---

## 5. Tasks

### Task 0: Αφετηρία και φρουροί πριν από τον κώδικα

**Files:**
- Create: `tms-auditor/test/fixtures/live-073b.sql` (λήψη των ζωντανών κειμένων με SELECT, όπως το `live-072.sql`)
- Modify: `docs/SESSION.md` (γραμμή «Now»)

**Interfaces:**
- Consumes: ζωντανή βάση (SELECT)· `origin/main`.
- Produces: τα md5 των ζωντανών κειμένων που ξαναγράφουν η 074a και η 074, γραμμένα στην κεφαλίδα της Task B1:
  - συναρτήσεις: `plan_board(date,text)`, `plan_move_pieces(jsonb,text,text)`, `order_dates_follow()`, `national_load_follow_order()`, `plan_chk()`, `plan_h_vs_day(bigint,date,text,text)`, `plan_vs_set_place(jsonb,text,text)`, `delete_order_cascade(text)`·
  - τα τέσσερα κείμενα ελέγχων B-10, B-26, B-42, B-47.

- [ ] **Step 1:** `git fetch origin && git switch -c feat/national-v5-f5 origin/main && git log --oneline -15 origin/main`. Αν το `main` έχει νέο commit στα `worker/migrations/07*` ή στο `worker/src/index.js`, διάβασέ το πρώτα.
- [ ] **Step 2:** Βεβαιώσου ότι υπάρχουν απαντήσεις owner στις Q-1..Q-10. Όπου η απάντηση διαφέρει από την Πρόταση, διόρθωσε **πρώτα** το αντίστοιχο Task αυτού του αρχείου (commit «F5 plan: Q-n answered»).
- [ ] **Step 3:** Ξαναμέτρησε τον πίνακα του §0 με το ίδιο SELECT, και γράψε το αποτέλεσμα στο `docs/sessions/` του Task 0. Κάθε διαφορά καταγράφεται· αν οι γραμμές v5 ≠ 0, ΣΤΑΜΑΤΑ και ρώτα.
- [ ] **Step 4:** Πάρε με SELECT τα `md5(prosrc)` των συναρτήσεων του Produces και τα `md5(sql)` των τεσσάρων ελέγχων. Expected: ίδια με τα αρχεία του repo (072, 073, 047b/058)· αλλιώς ΣΤΑΜΑΤΑ.
- [ ] **Step 5:** Commit `F5 Task 0: live fingerprints and fixtures`.

### Task A: `074a_plan_reads` (πριν από το L, 0 γραμμές, αναστρέψιμο)

**Files:**
- Create: `worker/migrations/drafts/074a_plan_reads{,_dryrun,_rollback,_verify,_test}.sql`
- Test: `tms-auditor/test/plan-074.test.mjs` (μέρος «074a»), `tests/sql-074-drafts.test.js`

**Interfaces:**
- Consumes: η ζωντανή `plan_board(date,text)` (072, μετά 072b/073) και η `plan_move_pieces`.
- Produces:
  - **`plan_board` με νέα κλειδιά, μόνο προσθήκες.** Κανένα υπάρχον κλειδί δεν αλλάζει όνομα ή τύπο.
    - `hub[]`: `nat_to_location_id`, `load_from`, `load_to`, `deliver_from`, `deliver_to` (Ε-26) και `for_split: boolean` (Ε-41)·
    - κάθε στάση κύκλου: `is_hub: boolean` (Ε-27/Ε-44)·
    - κάθε `legs[]`: `price`, `shipment_id`, `order_stop_id`, `pallet_exchange`, `goods`, `notes` (Ε-34).
  - **`plan_lookups(p_role text) RETURNS jsonb`:** `{locations:[{id,legacy_id,name,address,city,phone,is_hub,active}], clients, trucks, trailers, drivers:[…,phone], partners}`· `SECURITY DEFINER`, `EXECUTE` μόνο ο `service_role`.
  - **`shipment_pieces.for_split_at timestamptz NULL`:** τη γράφει μόνο ο κλάδος «→ Βέροια για σπάσιμο» του `plan_move_pieces`. Η 071 κλειδώνει στο κομμάτι μόνο τα `shipment_id`/`parent_piece_id`, οπότε η νέα στήλη δεν σπάει το `plan_chk`.

- [ ] **Step 1:** Γράψε τις περιπτώσεις του `074a_plan_reads_test.sql` (PGlite, σχήμα παραγωγής: `prodShaped()` + `live-073b.sql`):
  - A1: εβδομάδα με VS: `hub[0].nat_to_location_id` = ο τόπος της στάσης εθνικής πλευράς.
  - A2: εβδομάδα **χωρίς** VS: κάθε στάση στο 360 έχει `is_hub=true`, και καμία άλλη.
  - A3: το σκέλος κύκλου έχει `price` = η τιμή της εθνικής, και `pallet_exchange` boolean.
  - A4: κομμάτι που στάλθηκε «→ Βέροια» → `for_split=true`· κομμάτι που δεν πήρε ποτέ φορτηγό → `false`.
  - A5: `plan_lookups('warehouse')` επιστρέφει 6 λίστες, με ακριβώς έναν `is_hub`.
  - A6: `anon`/`authenticated` χωρίς `EXECUTE` στο `plan_lookups` (`permission denied`).
  - A7: το παλιό σχήμα του board μένει ίδιο. Test σύγκρισης κλειδιών: το νέο είναι υπερσύνολο του παλιού.
  - A8: 0 γραμμές v5 μετά την εφαρμογή.
- [ ] **Step 2:** `node --test tms-auditor/test/plan-074.test.mjs`. Expected: FAIL στα A1–A6 (`function plan_lookups does not exist`, ή λείπει κλειδί).
- [ ] **Step 3:** Γράψε την `074a`:
  - PART 0: φρουροί (073b εφαρμοσμένη, md5 του Task 0, 0 γραμμές v5)·
  - PART 1: `ALTER TABLE shipment_pieces ADD COLUMN for_split_at`·
  - PART 2: `plan_move_pieces`, ζωντανό κείμενο + μία γραμμή·
  - PART 3: `plan_board`, ζωντανό κείμενο + κλειδιά (`CREATE OR REPLACE`, κρατά oid και grants)·
  - PART 4: `plan_lookups`·
  - PART 5: δικαιώματα + αποδείξεις.
- [ ] **Step 4:** Παρήγαγε `_dryrun`/`_rollback`/`_verify` με `node worker/migrations/drafts/tools/build-074.mjs` και τρέξε τα tests. Expected: PASS A1–A8· η μετάλλαξη «χωρίς `is_hub`» ρίχνει μόνο την A2.
- [ ] **Step 5:** `/code-review xhigh` και PR «074a: plan reads for day L (Ε-2, Ε-26, Ε-27, Ε-34, Ε-41)». Εκτελεί ο owner μετά τις 15:00, με «ναι».
- [ ] **Step 6 (μετά την εκτέλεση):**
  - verify στην παραγωγή·
  - τα αρχεία βγαίνουν από το `drafts/`·
  - εγγραφή στο DECISION_LOG·
  - το B-54 μένει ίδιο (η 074a δεν προσθέτει trigger).

### Task B1: `074` · φρουροί, `plan_config`, `plan_cutover_log`

**Files:**
- Create: `worker/migrations/drafts/074_plan_cutover.sql` (PART 0–1), `074_plan_cutover_test.sql`, `074_plan_cutover_fingerprint.sql`

**Interfaces:**
- Produces:
  - `plan_config(id smallint PRIMARY KEY CHECK (id = 1), cutover_day date NOT NULL CHECK (extract(isodow from cutover_day) = 6), opened_at timestamptz NOT NULL, opened_by text NOT NULL)`: RLS on, `monitor_read` για `tms_check_runner`/`tms_reader`, καμία εγγραφή από API.
  - `plan_cutover_log(id bigint identity, kind text CHECK (kind IN ('nl_unlinked','test_cleanup','gl_unassigned')), table_name text, row_id bigint, at timestamptz, reason text)`: το ίχνος για το rollback.
  - `plan_cutover_day() RETURNS date STABLE`: NULL πριν από τη 074.
  - `plan_config_read() RETURNS jsonb`: `{cutover_day, opened_at}`, ή `{cutover_day:null}`· `EXECUTE` στον `service_role`.

- [ ] **Step 1:** Περιπτώσεις στο `074_plan_cutover_test.sql`:
  - B1: L όχι Σάββατο → `plan:bad_cutover_day`.
  - B2: L στο παρελθόν (ημέρα Αθήνας) → άρνηση.
  - B3: δεύτερη γραμμή στο `plan_config` → άρνηση.
  - B4: ο `service_role` δεν κάνει INSERT/UPDATE στο `plan_config`.
  - B5: `plan_config_read()` πριν από τη 074 → `{cutover_day:null}`.
- [ ] **Step 2:** FAIL (λείπει ο πίνακας).
- [ ] **Step 3:** PART 0, φρουροί που σταματούν το block:
  - εφαρμοσμένη η 073b (B-78..B-94) και η 074a (`plan_lookups` υπάρχει)·
  - md5 του Task 0·
  - ακριβώς ένας `is_hub`·
  - B-54 = μετρημένο·
  - 0 γραμμές v5·
  - κάθε ζωντανή VS έχει ≤ 1 ζωντανό Direct NL·
  - το `plan_config` δεν υπάρχει·
  - η σταθερά `c_cutover_day` (Q-1) είναι Σάββατο και > σήμερα Αθήνας.

  PART 1: πίνακες + συναρτήσεις.
- [ ] **Step 4:** PASS B1–B5.
- [ ] **Step 5:** Commit.

### Task B2: `074` · ο κανόνας τομής και ο συγχρονισμός γέφυρας

**Files:**
- Modify: `074_plan_cutover.sql` (PART 2), `074_plan_cutover_test.sql`

**Interfaces:**
- Consumes:
  - `v_shipments`, `v_piece_state`, `v_vs_state` (071)·
  - `plan_h_notice`, `plan_h_audit`, `plan_h_vs_follow`, `plan_h_rt_cancel_if_empty` (072)·
  - το σήμα `plan.writer = 'natl'` (072, απόφαση 17)· το γράφουν το `plan_h_vs_day` και το `plan_vs_set_place`, τοπικό στη συναλλαγή.
- Produces: όλες `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` και κλειστές για όλους (τις καλούν μόνο οι triggers).
  - **`plan_h_vs_nat_side(o orders, s order_stops) RETURNS boolean`:** εισαγωγή → `stop_type = 'Unloading'`· εξαγωγή → `'Loading'`. Ποτέ `Cross-dock`, ποτέ χώρα.
  - **`plan_h_vs_in_v5(p_order bigint) RETURNS boolean`:** ο κανόνας τομής του §1 (Q-2, Q-5).
  - **`plan_bridge_sync(p_order bigint, p_why text) RETURNS void`,** idempotent. Επιθυμητό σύνολο = οι στάσεις εθνικής πλευράς αν ισχύει το `plan_h_vs_in_v5`, αλλιώς κενό.
    1. Στάση επιθυμητή χωρίς ζωντανή γέφυρα → `INSERT shipments(order_id, order_stop_id, created_by='074 bridge')` + ένα κομμάτι με `pallets = stop.pallets`.
    2. Ζωντανή γέφυρα σε στάση που δεν είναι επιθυμητή → `plan_h_bridge_retire`.
    3. `via_hub := (στάση επιθυμητή)` σε κάθε στάση της παραγγελίας, μόνο όπου διαφέρει.
    4. Αν δημιουργήθηκε έστω μία γέφυρα:
       - soft delete του ζωντανού Direct NL·
       - γραμμή στο `plan_cutover_log`·
       - ειδοποίηση `legacy_nl_replaced` όταν το NL είχε όχημα (Q-3).
  - **`plan_h_bridge_retire(p_shipment bigint, p_reason text)`:**
    - τα **μη εκτελεσμένα** σκέλη των κομματιών του σβήνονται (soft)·
    - οι κύκλοι που άδειασαν ακυρώνονται μόνο χωρίς παραστατικά· αλλιώς μένουν άδειοι, με ειδοποίηση (Q-4)·
    - κομμάτια και γέφυρα σβήνονται (soft)· ειδοποίηση `vs_withdrawn` στον εθνικών·
    - αν υπάρχει **εκτελεσμένο** σκέλος, τίποτα δεν σβήνεται από την ιστορία· ειδοποίηση `vs_changed_after_execution`.
  - **`plan_h_bridge_recut(p_shipment bigint)`:** όταν οι παλέτες της στάσης ≠ το άθροισμα των φύλλων (spec §3).
    - Ένα φύλλο: παίρνει τον νέο αριθμό.
    - Σπασμένο, μείωση: πρώτα από το απόθεμα της ίδιας αποστολής (κομμάτι χωρίς σκέλος στον κόμβο), μετά από το κομμάτι της πρώτης ημέρας.
    - Σπασμένο, αύξηση: στο κομμάτι της πρώτης ημέρας.
    - Ειδοποίηση `vs_pallets_changed` πριν από την εκτέλεση· καμία μετά (είναι διόρθωση).
    - Αν η μείωση δεν χωρά, τα φύλλα με 0 σβήνονται (soft). Αν ούτε έτσι χωρά → `plan:bridge_recut` (δεν πρέπει να συμβεί· ο `pieces_sum` της 071 μένει δίχτυ).
  - **`plan_h_bridge_unplan(p_order bigint, p_reason text)`:** η ημέρα άλλαξε από τον διεθνών (όχι `plan.writer='natl'`).
    - Τα μη εκτελεσμένα σκέλη κάθε κομματιού της παραγγελίας σβήνονται (soft).
    - Το σπάσιμο αναιρείται: τα παιδιά σβήνονται (soft), και ο γονιός ξαναγίνεται φύλλο με τις παλέτες της στάσης.
    - Οι κύκλοι που άδειασαν, όπως στο `retire` (Q-4). Ειδοποίηση `vs_day_moved`.
  - **`plan_h_bridge_place(p_stop bigint, p_old bigint, p_new bigint)`:** ο διεθνών άλλαξε τόπο.
    - Τα σκέλη ξαναδείχνουν τη νέα θέση με τον **ίδιο** εσωτερικό βοηθό που χρησιμοποιεί το `plan_vs_set_place`· ποτέ δεύτερο αντίγραφο (αρχή 3).
    - Αν ο βοηθός ζει μέσα στο σώμα του `plan_vs_set_place`, η 074 τον βγάζει σε `plan_h_vs_repoint` και τον καλεί και από εκεί (ζωντανό κείμενο + patch, md5).
    - Ειδοποίηση `vs_place_changed`.
  - **Σειρά κλειδωμάτων:** πρώτα οι κύκλοι κατά id (όπως κάθε `plan_*`, 072:1152), μετά τα κομμάτια.
    - Ο trigger τρέχει με τη γραμμή `orders` ήδη κλειδωμένη, οπότε ο συγχρονισμός κλειδώνει τους κύκλους με `lock_timeout`.
    - Το 55P03 / 40P01 φτάνει στον Worker ως `busy_retry` (Task W, W3), ποτέ ως σιωπηλό 500.

- [ ] **Step 1:** Περιπτώσεις σε PGlite. Κάθε μία ελέγχει **τις γραμμές**, όχι το μήνυμα:
  - **Δημιουργία γέφυρας**
    - C1: εισαγωγή VS, ημέρα κόμβου ≥ L, 2 στάσεις εκφόρτωσης → 2 γέφυρες, 2 κομμάτια· `via_hub` true σε 2, false στο `Cross-dock` και στη φόρτωση· το Direct NL soft-deleted, 1 γραμμή log.
    - C2: εισαγωγή, ημέρα κόμβου = L−1 → 0 γέφυρες, το NL ζωντανό.
    - C3: εξαγωγή, ημέρα κόμβου = L, φόρτωση L−1 → 0 γέφυρες (Q-2)· με φόρτωση L → γέφυρα.
    - C4: VS χωρίς `cross_dock_date` → 0 γέφυρες, το NL όπως είναι.
  - **Παλέτες**
    - C5: 26 → 20 χωρίς σκέλος → κομμάτι 20, ειδοποίηση· ο `pieces_sum` δεν κοκκινίζει στο COMMIT.
    - C6: σπασμένο 12+14 (απόθεμα 14), μείωση 26 → 20 → απόθεμα 8, πρώτη ημέρα 12.
    - C7: σπασμένο, αύξηση 26 → 30 → πρώτη ημέρα 16.
    - C8: σπασμένο, μείωση 26 → 10 → απόθεμα 0 (σβησμένο), πρώτη ημέρα 10.
  - **Ημέρα**
    - C9: ο διεθνών μετακινεί την ημέρα κόμβου +1, με το κομμάτι σε κύκλο → σκέλος σβησμένο, κομμάτι ΠΡΟΣ ΑΝΑΘΕΣΗ, ειδοποίηση `vs_day_moved`· ο κύκλος, άδειος χωρίς παραστατικά → `cancelled`.
    - C10: όπως το C9, αλλά ο κύκλος έχει μισθοδοσία με ποσό → **δεν** ακυρώνεται· μένει άδειος, με ειδοποίηση (Q-4).
    - C11: η ίδια αλλαγή από το `plan_vs_set_day` (writer `natl`) → κανένα σκέλος δεν σβήνεται.
    - C12: σπασμένο VS και αλλαγή ημέρας από τον διεθνών → το σπάσιμο αναιρείται: ένα κομμάτι με όλες τις παλέτες.
  - **Τόπος και στάσεις**
    - C13: αλλαγή τόπου από τον διεθνών → τα σκέλη στη νέα θέση, ειδοποίηση· από το `plan_vs_set_place` → καμία δεύτερη μετακίνηση.
    - C14: σβήσιμο στάσης με γέφυρα → γέφυρα, κομμάτια και σκέλη σβησμένα, ειδοποίηση.
  - **Η διεθνής αλλάζει κατάσταση**
    - C15: VS off → όπως το C14 για όλες τις στάσεις· `via_hub` false.
    - C16: `Cancelled` → όπως το C15 (Q-5)· επαναφορά → νέα γέφυρα, νέο κομμάτι.
    - C17: διαγραφή της διεθνούς (`deleted_at`) → όπως το C15.
  - **Ειδικές περιπτώσεις**
    - C18: «μια φορά v5, πάντα v5»: ημέρα κόμβου ≥ L → < L → η γέφυρα μένει.
    - C19: παλιά VS (< L) που μετακινείται ≥ L μετά το L → γέφυρα + αποσύνδεση NL στην ίδια συναλλαγή.
    - C20: εκτελεσμένο σκέλος και αλλαγή ημέρας → τίποτα δεν σβήνεται, ειδοποίηση `vs_changed_after_execution`.
    - C21: αλλαγή σειράς στάσεων (αλλάζει μόνο το `stop_number`) → καμία κίνηση· η ταυτότητα της στάσης είναι το id.
    - C22: idempotent: δεύτερη κλήση `plan_bridge_sync` → καμία νέα γραμμή, κανένα audit.
  - **Δίχτυα**
    - C23: B-78 = 0 μετά από κάθε περίπτωση.
    - C24: κανένα `plan_*` της 072 δεν αλλάζει συμπεριφορά: το `072_plan_functions_test.sql` ξανατρέχει πάνω στη 074 και δίνει `Result: N OK, 0 FAIL`.
- [ ] **Step 2:** FAIL όλα (`function plan_bridge_sync does not exist`).
- [ ] **Step 3:** Υλοποίηση του PART 2 (οι συναρτήσεις του Produces).
- [ ] **Step 4:** PASS C1–C24. Μεταλλάξεις, που η καθεμία ρίχνει ακριβώς τις περιπτώσεις της:
  - χωρίς έλεγχο writer → C11, C13·
  - χωρίς «πρώτα το απόθεμα» → C6, C8·
  - χωρίς «παραστατικά» → C10·
  - τομή κατά ημέρα κόμβου → C3.
- [ ] **Step 5:** Commit.

### Task B3: `074` · οι triggers γέφυρας

**Files:**
- Modify: `074_plan_cutover.sql` (PART 3), test

**Interfaces:**
- Produces: δύο triggers `AFTER … FOR EACH ROW`, **άμεσοι**, ώστε η ξανακοπή να γίνει πριν από τον deferred `plan_chk_bridge_stop` της 071.
  - **`plan_bridge_on_order`:** `AFTER INSERT OR UPDATE OF veroia_switch, cross_dock_date, deleted_at, status, direction ON orders`.
    - Αν άλλαξε το `cross_dock_date`, ο writer δεν είναι `natl` και υπάρχει γέφυρα → `plan_h_bridge_unplan`.
    - Μετά, πάντα, `plan_bridge_sync`.
  - **`plan_bridge_on_stop`:** `AFTER INSERT OR UPDATE OF location_id, pallets, deleted_at, stop_type, datetime, order_id ON order_stops`, `WHEN (coalesce(new.order_id, old.order_id) IS NOT NULL)`.
    - Τόπος → `plan_h_bridge_place`.
    - Παλέτες → `plan_h_bridge_recut`.
    - Ημέρα στάσης εθνικής πλευράς, όχι από `natl` → `plan_h_bridge_unplan` για τα κομμάτια της.
    - Μετά, πάντα, `plan_bridge_sync`.
  - Και οι δύο κάνουν `RETURN` χωρίς τίποτα όταν το `plan_cutover_day()` είναι NULL. Έτσι υπάρχουν και πριν από την τιμή, για το rollback και τις δοκιμές.
  - Το B-54 μετρά +2 (+4 μαζί με το Task B4) και ενημερώνεται στο ίδιο block.

- [ ] **Step 1:** Περιπτώσεις C25–C30, από την πραγματική διαδρομή εγγραφής (UPDATE σε `orders`/`order_stops` ως `service_role`, όπως ο facade):
  - C25: PATCH παλετών στάσης → μία συναλλαγή, COMMIT επιτυχές, κομμάτι ίσο.
  - C26: PATCH `cross_dock_date` από το `028` (μετατόπιση ημερομηνιών φόρτωσης εισαγωγής) → `unplan` + ειδοποίηση.
  - C27: `plan_vs_set_day` → καμία `unplan` (writer).
  - C28: χωρίς `plan_config` → κανένα UPDATE δεν φτιάχνει γραμμή v5.
  - C29: `order_soft_delete_unlink` (023) + `delete_order_cascade` → η γέφυρα αποσύρεται, χωρίς ωμό σφάλμα.
  - C30: 50 VS σε ένα UPDATE (το backfill) → < 2 s στο PGlite, ώστε να φανεί κλείδωμα ή βρόχος.
- [ ] **Step 2–4:** FAIL → υλοποίηση → PASS.
- [ ] **Step 5:** Commit.

### Task B4: `074` · πάγωμα, 028/030, backfill, καθάρισμα δοκιμών, Ε19

**Files:**
- Modify: `074_plan_cutover.sql` (PART 4–7), test

**Interfaces:**
- Produces:
  - **Πάγωμα:** `plan_legacy_frozen()` + triggers `BEFORE INSERT` στα `national_loads`, `groupage_lines`, `consolidated_loads`, και στο `local_moves` όταν `new.move_kind = 'local'`. Όταν το `plan_cutover_day()` δεν είναι NULL → `23514 plan:legacy_frozen`. Τα `relay_*` και `nat_loading` δεν αγγίζονται (spec §3, αρχιτεκτονική §3).
  - **028/030:** `order_dates_follow()` (028) και `national_load_follow_order()` (030) = ζωντανό κείμενο + **μία γραμμή**, που παραλείπει τον κλάδο `national_loads` όταν το `plan_cutover_day()` δεν είναι NULL. Το 069 μένει ως έχει.
  - **Ε19:** `order_delete_preview(p_order_legacy_id text) RETURNS jsonb`. Οι συνέπειες της διαγραφής μιας διεθνούς με γέφυρες, στη μορφή της λίστας της Φ2 (`plan_h_confirm`):
    - κομμάτια σε κύκλους, και κύκλοι που αδειάζουν·
    - παραστατικά, χωρίς ποσά για ρόλους εκτός owner/accountant·
    - `confirm_token`.

    Το `delete_order_cascade` **δεν αλλάζει**: ο Worker ζητά πρώτα την προεπισκόπηση.
  - **Backfill** (PART 6, μία φορά, με κενό `plan.writer`):
    - `INSERT INTO plan_config` (Q-1)·
    - για κάθε ζωντανή VS, `plan_bridge_sync(id, '074 backfill')`·
    - αναμενόμενο στο dry run: γέφυρες = οι στάσεις εθνικής πλευράς των VS «στο v5»· NL που σβήνονται = εκείνες οι VS· λίστα NL με όχημα (Q-3).
  - **Καθάρισμα δοκιμών** (PART 7, spec §2.2 βήμα 1), με γραμμή στο `plan_cutover_log`:
    - soft delete των 6 `national_orders`, των 7 NL τους (`National`/`Groupage`) και του 1 CL·
    - τα 2 GL → `Unassigned`·
    - φρουρός: ακριβώς τα ids του dry run της πρόβας (P-8), αλλιώς ΣΤΑΜΑΤΑ.
  - `RAISE NOTICE '074 OK: cutover <L>, bridges <n> on <m> VS, NL unlinked <m>, NL with vehicle <k>, tests cleaned 6/7/1/2, via_hub <n>, triggers <T>, B-54 <T>, legs 0'`.
- [ ] **Step 1:** Περιπτώσεις C31–C40:
  - **Πάγωμα**
    - C31: INSERT NL μετά το L → `plan:legacy_frozen`· πριν → περνά.
    - C32: INSERT GL / CL / `local` → ίδιο· `relay_delivery` → περνά.
    - C33: UPDATE ιστορικού NL (status) → περνά (το κόβει ο Worker, Q-10).
  - **028/030**
    - C34: μετακίνηση παλιάς VS < L μετά το L → το NL **δεν** μετακινείται (028 χωρίς κλάδο)· η διεθνής μετακινείται.
    - C35: `status` Delivered σε παλιά VS → το NL δεν ακολουθεί (030).
  - **Backfill και καθάρισμα**
    - C36: backfill σε αντίγραφο της μέτρησης του §0 (79 VS, 99 στάσεις) με L = 14/11 → γέφυρες = ό,τι δίνει η ίδια τομή σε SELECT· B-95 = 0, B-78 = 0.
    - C37: καθάρισμα → 6/7/1/2, τίποτα άλλο.
  - **Ε19**
    - C38: `order_delete_preview` σε διεθνή χωρίς σκέλη → κενή λίστα, χωρίς token· με σκέλη → λίστα + token· για ρόλο dispatcher, χωρίς ποσά.
  - **Ολόκληρο το block**
    - C39: dry run (όλο το block + σκόπιμο σφάλμα) → 0 γραμμές v5, `plan_config` ανύπαρκτο.
    - C40: verify μετά → `074 in place`, triggers +6 = B-54, 0 `piece_legs`.
- [ ] **Step 2–4:** FAIL → υλοποίηση → PASS. Η μετάλλαξη «πάγωμα και σε UPDATE» ρίχνει C33 και C34.
- [ ] **Step 5:** Commit.

### Task B5: `074` · rollback, verify, fingerprint, builder, δοκιμή αρχείων

**Files:**
- Create: `074_plan_cutover_rollback.sql`, `_verify.sql`, `_fingerprint.sql`, `drafts/tools/build-074.mjs`, `tests/sql-074-drafts.test.js`

**Interfaces:**
- **`_rollback`:** δρόμος έκτακτης ανάγκης, με δικό του dry run (κανόνας 5).
  - **Αρνείται** αν υπάρχει έστω μία ζωντανή `piece_legs`, `rt_stops`, `national_orders` με αποστολή, `local_moves` `nat_loading`, ή γραμμή `audit_log` από εγγραφή `plan_*` **χρήστη** → «μετά το σημείο χωρίς επιστροφή: μόνο προς τα εμπρός». Οι γραμμές `audit_log` της ίδιας της 074 (backfill, triggers γέφυρας, actor `074 …` / `trigger:plan_bridge_sync`) δεν μετρούν: αλλιώς το rollback θα αρνιόταν πάντα.
  - Αλλιώς:
    - γέφυρες και κομμάτια soft-deleted (`'074 rollback'`)·
    - τα NL του `plan_cutover_log` ξαναζωντανεύουν·
    - οι δοκιμές γυρίζουν πίσω (σε `Assigned` μόνο τα GL που άλλαξε η 074)·
    - `via_hub` false·
    - `DROP` των triggers και των συναρτήσεων της 074·
    - 028/030 στο ζωντανό τους κείμενο, byte προς byte (md5)·
    - `DROP plan_config`, `plan_cutover_log`·
    - B-54 πίσω.
  - Η 074a μένει (είναι αναγνώσεις).
- **`_fingerprint`:** το SELECT του §0 + md5 των 79 Direct NL + `orders`/`order_stops` χωρίς `via_hub`. Τρέχει πριν και μετά· η μόνη επιτρεπτή διαφορά είναι όσα δηλώνει το NOTICE.
- **`tests/sql-074-drafts.test.js`** ελέγχει:
  - ASCII, ένα DO·
  - κάθε ζεύγος md5 του PART 0 υπάρχει δύο φορές (φρουρός + απόδειξη)·
  - ο builder δεν έχει drift·
  - το dry run = το αρχείο + σκόπιμο σφάλμα·
  - η σταθερά L υπάρχει **μία** φορά.
- [ ] **Step 1:** Περιπτώσεις R1–R4:
  - R1: rollback αμέσως μετά → όλα όπως πριν (ίσο fingerprint).
  - R2: rollback μετά από ένα σκέλος → άρνηση.
  - R3: νέο apply μετά το R1 → ίδιο αποτέλεσμα.
  - R4: harness με τις προεπιλεγμένες άδειες της Supabase → ένα `REVOKE` που λείπει ρίχνει το block.
- [ ] **Step 2–4:** FAIL → υλοποίηση → PASS. `node worker/migrations/drafts/tools/build-074.mjs --check` → `0 drift`.
- [ ] **Step 5:** **NO-GO στο προηγούμενο tip:** τρέξε το `plan-074.test.mjs` πάνω στο `origin/main` χωρίς τα αρχεία της 074. Expected: FAIL (απόδειξη ότι ελέγχει κάτι).
- [ ] **Step 6:** `/code-review xhigh` στο PR «074 + 074b: day L». Ο owner εκτελεί μόνο μέσα από το Runbook.

### Task C: `074b_plan_cutover_monitoring` (ο ελεγκτής μαθαίνει το L)

**Files:**
- Create: `tms-auditor/checks/B-95.sql` … `B-99.sql`
- Modify: `tms-auditor/checks/B-10.sql`, `B-26.sql`, `B-42.sql`, `B-47.sql`
- Create: `074b_plan_cutover_monitoring{,_dryrun,_rollback}.sql` (παραγόμενα), περιπτώσεις στο `plan-074.test.mjs`

**Interfaces:** για όλους, «ποιος το μαθαίνει» = ειδοποίηση 048 σε owner και εθνικών. Όλοι δίνουν **0 σήμερα** και κοκκινίζουν σε σενάριο PGlite.

| id | Τίτλος | Σοβαρ. | Κανόνας |
|---|---|---|---|
| B-95 | VS στο v5 με γέφυρες ≠ στάσεις εθνικής πλευράς | P1, ωριαίος | Για κάθε VS με `plan_h_vs_in_v5`, κοκκινίζει όταν ισχύει ένα από τα τρία: (α) στάση εθνικής πλευράς χωρίς ζωντανή γέφυρα· (β) ζωντανή γέφυρα σε στάση σβησμένη ή όχι εθνικής πλευράς· (γ) `via_hub` ≠ «επιθυμητή». Είναι η ισότητα του spec §8 και της αποδοχής |
| B-96 | Νέα γραμμή του παλιού μοντέλου μετά το L | P1, ωριαίος | `created_at ≥ plan_config.opened_at` σε NL / GL / CL / `local_moves` `local`, ή `national_orders` χωρίς ζωντανή αποστολή |
| B-97 | VS χωρίς ημέρα κόμβου | P1, ημερήσιος | ζωντανή VS, όχι `Cancelled`, `cross_dock_date` NULL, δημιουργημένη μετά το `opened_at` (spec §2.3) |
| B-98 | Εθνική ≥ L με τιμή και χωρίς μερίδια | P2, ημερήσιος | M-5: `national_orders` ζωντανή, `price > 0`, δημιουργημένη μετά το `opened_at`, χωρίς γραμμή `kind = 'price'` στο `ct_v_v5_revenue`. Ο B-80 μένει απενεργοποιημένος |
| B-99 | «Μέσω Βέροιας» σε στάση που δεν είναι VS | P2, ημερήσιος | `order_stops.via_hub` true σε παραγγελία όχι VS, σε σβησμένη παραγγελία, ή σε στάση όχι εθνικής πλευράς. Είναι ο φρουρός του ανοιχτού (3) της 26/10 (αρχή 1) |

**Ε17 (νέα κείμενα, με φρουρό md5 του ζωντανού κειμένου πριν από το UPDATE):**
- **B-26** «Veroia Switch χωρίς εθνικό φορτίο»: μόνο για VS **χωρίς** `plan_h_vs_in_v5`. Τις άλλες τις μετρά ο B-95.
- **B-42** «Εθνική παραγγελία χωρίς groupage/φορτίο > 15′»: εξαιρεί όσες έχουν ζωντανή αποστολή.
- **B-10** «Γύροι ξεχασμένοι > 14 ημέρες»: `AND model = 1`.
- **B-47** «Τοπικές κινήσεις: καμία εγγραφή σε 30 ημέρες»: μετρά και τις `nat_loading`. Αλλιώς, από το L θα κοκκίνιζε κάθε μέρα, αφού οι `local` παγώνουν.

- [ ] **Step 1:** Ένα σενάριο PGlite ανά έλεγχο: πράσινος στο αντίγραφο της παραγωγής, κόκκινος στο σενάριό του. Παράδειγμα για τον B-95: σβήσε με το χέρι μία γέφυρα μέσα σε `SET session_replication_role = replica` → 1.
- [ ] **Step 2–4:** FAIL → κείμενα + `build-074.mjs` για την `074b` → PASS. Πρότυπο το `build-073b.mjs`: base64, md5 ανά έλεγχο μέσα στο block, απόδειξη «0 σήμερα».
- [ ] **Step 5:** Όλη η σουίτα `tms-auditor` (σήμερα 142/142) + οι νέες. Commit. Πάει στο ίδιο PR με τη 074.

### Task W: Worker, αλυσίδα `deploy/worker-plan-f5`

**Files:**
- Modify: `worker/src/index.js`, `worker/tools/worker-guard.mjs`
- Create: `worker/test/plan-config.test.mjs`, `plan-lookups.test.mjs`, `legacy-closed.test.mjs`, `costs-rt-range.test.mjs`, `delete-order-confirm.test.mjs`, `worker-guard-f5.test.mjs`
- Modify: `worker/test/plan-contract.test.mjs`, `plan-perms.test.mjs`, `plan-routes.test.mjs`, `plan-tables-guard.test.mjs`

**Interfaces:**
- Consumes: `plan_config_read()`, `plan_lookups(text)`, `order_delete_preview(text)`, και οι νέοι κωδικοί `plan:legacy_frozen`, `plan:bad_cutover_day`, `plan:bridge_recut`.
- Produces:
  - **W1 `GET /plan/config`** → `{cutover_day, opened_at, writes_open}`, με `writes_open` = `PLAN_WRITES_OPEN`. Και οι 5 ρόλοι, `PLAN_PERMS` `config: ["GET"]`.
  - **W2 `GET /plan/lookups`** → η `plan_lookups(role)`, για τους 5 ρόλους (Ε-2).
  - **W3 κείμενα και σφάλματα,** στον **ίδιο** χαρτογράφο:
    - `PLAN_RULE_TEXT` για τους νέους κωδικούς, με ελληνικό κείμενο. Για το `legacy_frozen`: «Το παλιό μοντέλο εθνικών έκλεισε την ημέρα μετάβασης· νέα εθνικά μόνο από το Εβδομαδιαίο Εθνικών».
    - Τα 55P03 / 40P01 μέσα σε facade εγγραφή σε `orders`/`order_stops` → 503 `busy_retry` «δοκίμασε ξανά».
  - **W4 Ε16:** μία σταθερά `var LEGACY_CLOSED_AFTER_L = {…}` (σημάδι φρουρού), που διαβάζεται **μόνο** όταν ο `PLAN_WRITES_OPEN` είναι true (Q-10):
    - NL / GL / CL: POST για κανέναν· PATCH / DELETE μόνο ο owner.
    - `national_orders`: POST/DELETE για κανέναν (περνούν από το `/plan/*`). PATCH: ο accountant σε {Invoiced, αριθμός τιμολογίου, Price}, ο dispatcher σε {Price, Reference, Notes}, ο owner σε όλα.
    - `local_moves`: POST με `Move Kind = local` → 409 `legacy_closed`.
    - Κάθε άρνηση = 409 `{error:{type:"LEGACY_CLOSED", code:"legacy_closed", message}}`, **πριν** από κλήση βάσης.
    - Το `"Via Hub"` μένει στο `closedUntilPlan` **και μετά** το L (Q-6). Ο φρουρός του γίνεται «πάντα κλειστό», με δικό του κωδικό, και δεν ανοίγει με τον διακόπτη.
  - **W5 Ε18 `GET /costs/rt`:**
    - `from` και `to` υποχρεωτικά (400 `bad_input` χωρίς αυτά)·
    - όριο 1000· `truncated: true` όταν το φτάσει.

    **Πριν από το merge:** `grep -rn "costs/rt" modules core`, και διόρθωση κάθε κλήσης χωρίς `from/to` μέσα στο FE-1. Αλλιώς ΣΤΑΜΑΤΑ (αρχή 1: σιωπηλά κομμένη λίστα).
  - **W6 Ε19 `DELETE /orders/:id`** (`index.js:4017`):
    - μη κενή λίστα από την `order_delete_preview` χωρίς `confirm_token` → 428 με τη λίστα·
    - με token → `delete_order_cascade`, όπως σήμερα·
    - token που άλλαξε → 422 `stale_confirm`.
  - **W7 `PLAN_WRITES_OPEN`:** **false** στο deploy 1, **true** στο deploy 2. Το deploy 2 δεν αλλάζει τίποτα άλλο.
  - **W8 φρουρός `worker-guard.mjs`:**
    - `--plan 0|1|2`. Το 2 θέλει `var PLAN_WRITES_OPEN = true;` = 1 και `= false` = 0, και απαιτεί `--handover 1 --f3 1 --f5 1`.
    - `--f5 0|1`, προαιρετικό όπως το `--f3`, με **ένα σημάδι ανά λειτουργία**: `rpc: "plan_config_read"` (W1), `rpc: "plan_lookups"` (W2), `var LEGACY_CLOSED_AFTER_L` (W4), `truncated: ` (W5), `rpc: "order_delete_preview"` (W6).
    - Χωρίς `--f5`: ακριβώς όπως σήμερα (20 σημάδια). Άγνωστο όρισμα → exit 2.

- [ ] **Step 1:** `git fetch origin && git switch -c deploy/worker-plan-f5 origin/deploy/worker-plan-f3`. Έλεγχος: `git merge-base --is-ancestor f1e97f07 HEAD && git diff --quiet origin/main -- worker/src worker/test worker/tools`. Expected: exit 0.
- [ ] **Step 2:** Γράψε τα tests:
  - `plan-config`: 5 ρόλοι· το `writes_open` ίσο με τη σταθερά.
  - `legacy-closed`: 5 ρόλοι × {NL, GL, CL, `national_orders`, `local_moves`} × {POST, PATCH, DELETE}.
    - Με `PLAN_WRITES_OPEN` false: όλα όπως σήμερα, κλειδωμένα στον σημερινό πίνακα.
    - Με `PLAN_WRITES_OPEN` true: ο πίνακας της Q-10.
    - Καμία κλήση βάσης στις αρνήσεις.
  - `costs-rt-range`: χωρίς `from` → 400· με 1000 γραμμές → `truncated`.
  - `delete-order-confirm`: 428 → token → 200· αλλαγμένη λίστα → 422.
  - `worker-guard-f5`:
    - `--plan 2` χωρίς `--f5 1` → 2·
    - bundle με false και `--plan 2` → STOP·
    - double esbuild bundle και multipart.
- [ ] **Step 3:** FAIL.
- [ ] **Step 4:** Υλοποίηση W1–W8.
- [ ] **Step 5:** `node --test worker/test/*.test.mjs worker/src/rt-rules.test.mjs`. Expected: όλα pass, εκτός από τον έναν γνωστό skip του main.
- [ ] **Step 6:** Φρουρός στην πηγή:
  - `node worker/tools/worker-guard.mjs worker/src/index.js --plan 1 --handover 1 --f3 1 --f5 1` → `GUARD OK (25 markers, plan=1, handover=1, f3=1, f5=1)`.
  - Αντίγραφο με `PLAN_WRITES_OPEN = true`: με `--plan 2` → `GUARD OK (…, plan=2, …)`· με `--plan 1` → STOP.
- [ ] **Step 7:** `/code-review xhigh` και PR «Worker F5 deploy 1». Deploy 1 από τον owner μετά τις 15:00 (Runbook R-0). Μετά το deploy:
  - commit «sync worker source with deployed <version>» στο `main`·
  - η λίστα φρουρού του CLAUDE.md παίρνει τα 5 σημάδια και την εντολή με `--f5 1`·
  - το `LOOKUPS_PENDING` γίνεται false στο FE-1 (το απαιτεί το test του `core/plan-ids.js`).
- [ ] **Step 8:** Deploy 2 = νέο commit στον ίδιο κλάδο. Περιέχει **μόνο** τη γραμμή `var PLAN_WRITES_OPEN = true;` και τη λίστα φρουρού του CLAUDE.md με `--plan 2`.
  - Δικό του PR, με `/code-review xhigh` που ελέγχει ότι το diff είναι μία γραμμή κώδικα.
  - Το deploy γίνεται μόνο μέσα από το Runbook.

### Task F: Front end FE-1 (αδρανές ως το L)

**Files:** όπως στο §3, FE-1.

**Interfaces:**
- Produces:
  - **`PlanConfig.load()`** → `Promise<{state:'before'|'after'|'unknown', cutoverDay:string|null, writesOpen:boolean}>`. Μία ανάγνωση ανά session.
    - Σε αποτυχία: `'unknown'`, με `logError` και ορατή λωρίδα όπου χρειάζεται. **Ποτέ** σιωπηλά `'before'` (αρχή 1).
    - 404 `no_route` πριν από το deploy 1 = `'before'`: γνωστό κενό, όπως το `LOOKUPS_PENDING`.
  - **Weekly Διεθνών (Ε1/Ε20):** `natBySrc[oid] = {carrier, done, src:'nl'|'v5'}`, από **δύο** αναγνώσεις:
    - `/plan/vs-state` για όλες τις VS της εβδομάδας (≤ 500 ids ανά κλήση)·
    - τα NL, για όσες απάντησαν `"missing"`.

    Κανόνες:
    - για v5, `done = all_executed`, όχι το Status·
    - αποτυχία μίας ανάγνωσης → `nlState = 'err'`, πλακίδιο «απέτυχε», ποτέ «χωρίς εθνικό»·
    - το `_carrierOf` (`weekly_intl_v2.js:279`) και το `natDone` (`:1184`) διαβάζουν μόνο από τον χάρτη·
    - **καμία ημερομηνία L στην οθόνη:** ο κανόνας «έχει γέφυρα;» είναι της βάσης.
  - **`_syncVeroiaSwitch`** (`orders_intl.js:1709`, Ε2): όταν `state==='after'`, δεν γράφει, δεν σβήνει και δεν διαβάζει NL. Μετά την αποθήκευση διαβάζει το `/plan/vs-state` της παραγγελίας:
    - με γέφυρα → στάδιο ✓ «VS chain: η βάση έφτιαξε τις αποστολές (n)»·
    - `"missing"` με VS on → ✗ «δεν δημιουργήθηκε εθνικό σκέλος (ημέρα κόμβου; ημέρα πριν από το L;)»·
    - 422 `legacy_frozen` → ✗ με το κείμενο του Worker.
  - **`core/order-sync.js`:** όταν `state==='after'`, το `syncGLtoCLtoNL` (`:122`) δεν τρέχει, και το `plOnOrderSaved` (`:96`) δεν καλείται για εθνικές με αποστολή.
  - **`core/stops-helpers.js`:**
    - το `stopsSave` ταυτίζει τη στάση με το **record id** που κουβαλά η φόρμα· το `(type, number)` μένει fallback μόνο για νέες στάσεις·
    - η αποτυχία διαγραφής στάσης **πετάει** στον καλούντα, και η φόρμα δείχνει ✗ (σήμερα μόνο `console.error`, γρ. 95)·
    - ισχύει από τη συγχώνευση, όχι μόνο μετά το L, γιατί είναι σφάλμα ήδη σήμερα.
  - **`orders_natl.js`:** όταν `state==='after'`:
    - το «Νέα εθνική» ανοίγει τη φόρμα v5 (`wn5_forms`, ίδια διαδρομή με το board)·
    - η επεξεργασία παλιάς εθνικής ανοίγει την παλιά φόρμα, μόνο με τα πεδία που επιτρέπει η Q-10· τα υπόλοιπα disabled, με λόγο.
  - **Άλλες διαδρομές εγγραφής** (Ε16): `core/ai-chat.js` `update_record`, `core/order-quick-edit.js` και η Επαναφορά Κάδου (`core/api.js:1360`).
    - Όταν `state==='after'`, αρνούνται για `national_orders` / NL / GL / CL / τους νέους πίνακες, με ορατό μήνυμα.
    - Ο Worker αρνείται ούτως ή άλλως· η άρνηση στην οθόνη υπάρχει για να μη φαίνεται πράσινο toast.
  - **`daily_ops.js`, «Αλλαγή ημέρας» VS:** γράφει μόνο τη διεθνή (`cross_dock_date`)· ποτέ NL όταν `state==='after'`.
  - **`core/plan-ids.js:22`:** `LOOKUPS_PENDING = false`, μετά το deploy 1.
- [ ] **Step 1:** Tests:
  - `tests/plan-config.test.mjs`: 200 / 404 / 5xx → before / before / unknown.
  - `tests/wi4-vs-state.test.mjs`: συγχώνευση· `"missing"` → NL· αποτυχία → err.
  - `tests/stops-helpers-identity.test.mjs`: αλλαγή σειράς = ίδια ids· αποτυχία διαγραφής = throw.
  - Στατικό test: κανένα γράψιμο σε `TABLES.NAT_LOADS|GL_LINES|CONS_LOADS` χωρίς έλεγχο `PlanConfig`, στα `orders_intl.js`, `order-sync.js`, `daily_ops.js`.
- [ ] **Step 2:** Rigs (πρότυπο `tests/critics/wi4-board-rig.js`, με stub για το `/plan/*`):
  - `wi4-board-rig`, σενάριο `v5`: πλακίδια από το `vs-state`, σβήσιμο με `all_executed`.
  - `orders-intl-vs-rig`: αποθήκευση VS σε `after` → στάδιο ✓ και 0 κλήσεις NL· σε `before` → όπως σήμερα.
  - `daily-ops-vs-chain` + περίπτωση `after`.
  - Rig διεθνούς φόρμας: αλλαγή σειράς στάσεων → ίδια ids στο PATCH.
- [ ] **Step 3:** **NO-GO στο προηγούμενο tip:** κάθε νέο rig και test τρέχει στο `origin/main`. Expected: FAIL. Καταγραφή στο PR.
- [ ] **Step 4:** Υλοποίηση. Όλα τρέχουν με 0 σφάλματα κονσόλας εφαρμογής (κανόνας κονσόλας 27/10). Bump `?v=` + `SW_VERSION`.
- [ ] **Step 5:** Για κάθε διαδρομή που αλλάζει, οι πέντε ερωτήσεις του CLAUDE.md «μέχρι τον πίνακα»: endpoint, πίνακας/στήλες, τι γράφτηκε, αποτυχία, δικαίωμα. Γράφονται στο PR.
- [ ] **Step 6:** `/code-review high` και PR. Ο owner κάνει merge **μετά** το deploy 1. Μετά το merge, ζωντανός έλεγχος: `state === 'before'`, τα πλακίδια όπως πριν, 0 σφάλματα.

### Task G: Front end FE-2 (ημέρα L)

**Files:**
- `config.js:399`: `WN_V5: 'on'`
- μενού: χωρίς το παλιό board και την παλιά φόρμα· η «Παλιά προβολή» μόνο για εβδομάδες < L (Q-10)
- bump `?v=` + `SW_VERSION`

- [ ] **Step 1:** Test: με `WN_V5='on'` και `PlanConfig` σε `after`:
  - το μενού δεν έχει «Νέα εθνική (παλιά)»·
  - η «Παλιά προβολή» ανοίγει μόνο εβδομάδα < L.
- [ ] **Step 2:** PR έτοιμο από την Πέμπτη, με `/code-review medium`. Merge **μόνο** στο βήμα R-8 του Runbook.

### Task H: Ίχνος

- [ ] **DECISION_LOG:** μία εγγραφή «Φ5 πλάνο + απαντήσεις Q-1..Q-10». Μετά, μία ανά εκτέλεση: 074a, deploy 1, 074/074b, deploy 2, FE-2.
- [ ] **CLAUDE.md:**
  - λίστα φρουρού: τα σημάδια της Φ5· η γραμμή «ως την ημέρα L … `PLAN_WRITES_OPEN = false`» γίνεται «από την ημέρα L: `--plan 2`»·
  - «Sync chain»: σημείωση «από το L τα εθνικά δεν περνούν από NL/GL/CL»·
  - πίνακας «ΚΛΕΙΔΩΜΕΝΕΣ ΑΠΟΦΑΣΕΙΣ»: η Q-10.
- [ ] **`docs/sessions/`:** ένα αρχείο ανά βήμα, και η γραμμή «Now».

---

## 6. Runbook ημέρας L (εκτελεί ο owner· εμείς δίνουμε αρχεία και μετρήσεις)

**Την εβδομάδα L−1:**
- 074a, deploy 1 και FE-1 ζωντανά.
- Pilot (Q-9).
- Την Πέμπτη, μετά τις 15:00, η πρόβα P-8: dry run της 074 στην παραγωγή, κόκκινο σκόπιμα. Το dry run τυπώνει: γέφυρες n, VS m, NL με όχημα k, ids δοκιμών. Τα νούμερα γράφονται στο `docs/sessions/`.

**Παρασκευή L−1, μετά τις 15:00, με αυτή τη σειρά.** Κάθε βήμα που δεν δίνει το αναμενόμενο = ΣΤΑΜΑΤΑ και επαναφορά του προηγούμενου.

| # | Βήμα | Αναμενόμενο |
|---|---|---|
| R-1 | `074_plan_cutover_fingerprint.sql` | τιμές πριν (στο αρχείο session) |
| R-2 | `074_plan_cutover_dryrun.sql` | `DRY RUN 074 finished - EVERYTHING UNDONE …` με n/m/k ίσα με την πρόβα, ± ό,τι μπήκε από την Πέμπτη (εξηγείται ανά id) |
| R-3 | Ο owner διαβάζει και απαντά «ναι»: *«Μετά την πρώτη ανάθεση στο νέο board, η επιστροφή στο παλιό μοντέλο δεν γίνεται· μόνο διορθώσεις προς τα εμπρός.»* | ρητό «ναι» στη συνομιλία |
| R-4 | `074_plan_cutover.sql` | `074 OK: …` |
| R-5 | `074_plan_cutover_verify.sql` + fingerprint μετά | `074 in place`· B-54 = triggers· `piece_legs` 0· διαφορές μόνο όσες δηλώνει το NOTICE |
| R-6 | `074b`: dry run → εφαρμογή → verify | οι B-95..B-99 υπάρχουν, όλοι 0· οι B-10/26/42/47 με τα νέα md5 |
| R-7 | Worker deploy 2 | βλ. «Λεπτομέρεια του R-7» κάτω από τον πίνακα |
| R-8 | Merge του FE-2 | Pages σε 1–3 λεπτά· στο Chrome του owner, μετά από hard reload: Weekly Εθνικών εβδομάδας L = v5, με πλήθος ΠΡΟΣ ΑΝΑΘΕΣΗ = γέφυρες· Weekly Διεθνών: VS < L από NL όπως πριν, VS ≥ L «ΠΡΟΣ ΑΝΑΘΕΣΗ» από v5· 0 σφάλματα κονσόλας |
| R-9 | SELECT μετά | γραμμές v5 = μόνο γέφυρες + κομμάτια· `app_errors` 0 στα 60 λεπτά· B-78 0· B-95 0 |

**Λεπτομέρεια του R-7 (Worker deploy 2):**
- Φρουρός **πριν**, στη λήψη του ζωντανού: `--plan 1 --handover 1 --f3 1 --f5 1` OK.
- Φρουρός στο bundle και **μετά**: `--plan 2 --handover 1 --f3 1 --f5 1` OK.
- Bindings ίδια (CF API).
- Smoke:
  - `GET /plan/config` → `writes_open:true`·
  - `POST /plan/orders` χωρίς σώμα → 400 (όχι 409)·
  - facade `POST national_loads` ως dispatcher → 409 `legacy_closed`·
  - `GET /plan/vs-state` για μία VS με γέφυρα → `carriers:[]`, `n_pieces ≥ 1`·
  - `GET /plan/board` της εβδομάδας L → οι γέφυρες ΠΡΟΣ ΑΝΑΘΕΣΗ.
- **Καμία εγγραφή δοκιμής** (Ε2 της Φ6).

**Επαναφορά** (μόνο πριν από το σημείο χωρίς επιστροφή, §1), με αντίστροφη σειρά:
1. Revert του FE-2 (bump).
2. `wrangler rollback <deploy 1>`, με φρουρό `--plan 1 … --f5 1`.
3. `074b_…_rollback`.
4. `074_…_rollback`: πρώτα dry run, μετά rollback. Fingerprint = όσο στο R-1.
5. Ίχνος στο DECISION_LOG.

Μετά το σημείο χωρίς επιστροφή: μόνο διορθώσεις προς τα εμπρός, με νέο migration και τον ίδιο κύκλο (dry run, «ναι», 15:00).

**Αποδοχή** (Φ6: κάθε πρωί στις 07:30 και στις 13:00, για δύο εβδομάδες, στο `docs/sessions/`):
- B-96 = 0: καμία νέα γραμμή NL/GL/CL/`local` μετά το L.
- B-95 = 0: γέφυρες = στάσεις εθνικής πλευράς των VS στο v5 (**ισότητα**).
- B-78 = 0: κανένα NL μαζί με αποστολή.
- B-97 = 0 και B-99 = 0.
- `pieces_sum` ποτέ κόκκινο σε αποθήκευση διεθνούς: `app_errors` με `plan:pieces_sum` = 0.
- Πλακίδια ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ του Weekly Διεθνών = οι VS της εβδομάδας (SELECT έναντι οθόνης).
- `dl_v_rt_gap` = 0 για τους κύκλους v5.
- Υιοθέτηση: κύκλοι v5 ανά ημέρα / φορτηγά που βγήκαν.

---

## 7. Αν σπάσει, πώς θα το μάθουμε

| Τι σπάει | Πώς το μαθαίνουμε |
|---|---|
| Γέφυρα που δεν δημιουργήθηκε, ή που έμεινε σε σβησμένη στάση | B-95 (P1, ωριαίος), ειδοποίηση owner + εθνικών |
| Παλιά οθόνη (cache του SW) γράφει NL | 422 `legacy_frozen` στην οθόνη· το B-96 = 0 αποδεικνύει ότι δεν πέρασε |
| Η διεθνής αλλάζει παλέτες και η ξανακοπή αποτυγχάνει | 422 `plan:pieces_sum` / `bridge_recut` στη διεθνή φόρμα, και `app_errors`· ποτέ σιωπηλά |
| Ο trigger κλειδώνει απέναντι σε `plan_*` | 503 `busy_retry` «δοκίμασε ξανά»· `app_errors` |
| Κύκλος άδειασε με παραστατικά (Q-4) | ειδοποίηση στο board + B-82 |
| Μισθοδοσία / έξοδα | B-82, B-84, B-87, B-91..B-94 (ζωντανοί από τη 073b) |
| Το Weekly Διεθνών χάνει μία από τις δύο αναγνώσεις | πλακίδιο «απέτυχε», `nlState='err'`, `logError` |
| Ο Worker ανέβηκε χωρίς διακόπτη ή χωρίς σημάδι | φρουρός `--plan 2 --f5 1` πριν και μετά· exit 1 = επαναφορά |

---

## 8. Αυτοέλεγχος του πλάνου (κάλυψη πηγών)

| Πηγή | Πού στο πλάνο |
|---|---|
| spec §2.2.1: καθάρισμα δοκιμών | B4 PART 7 |
| spec §2.2.2: γέφυρα + αποσύνδεση NL στην ίδια συναλλαγή | B2 (βήμα 4), B4 backfill, C1, C19 |
| spec §2.2.3: 028/030/069 | B4 (028/030 με μία γραμμή· το 069 μένει, με αιτιολογία στο §1) |
| spec §2.2.4: `WN_V5`, παλιό board και φόρμα, facade | G, W4, F |
| spec §2.3: VS χωρίς ημέρα κόμβου | C4, B-97 |
| spec §3 VS: ημέρα, παλέτες, τόπος, σπάσιμο, «ακολουθεί + ειδοποίηση» | B2, C5–C20 |
| spec §5: Ε1, Ε2, Ε16–Ε20 | F, W4–W6, C (Ε17), B4 (Ε19) |
| spec §5: Ε3, Ε5, Ε12–Ε15 | Q-7, πύλη P-6 (πλάνο Φ4β-L) |
| spec §8: έλεγχοι που θέλουν το L | B-95..B-99 (F3-11 σειρές 1, 2, 6· M-5) |
| F1, αποφάσεις 1–2: `via_hub`, `plan_config` | B2 (βήμα 3), B1 |
| F2: C-16 (`"Via Hub"`), C-17 (εγγραφές πριν από το L), αποφάσεις 17 (writer), 22, 28 | W4, W7, B2 (writer), C11/C13 |
| 26/10, ανοιχτό (3): φρουρός `via_hub` | B-99, Q-6 (το γράφει μόνο η βάση) |
| Φ4α: Ε-2, Ε-26, Ε-27/44, Ε-34, Ε-41/43 | Task A, W2 |
| ROUTE-GRAMMAR §6: `Cancelled` | Q-5, C16 |
| ROUTE-GRAMMAR §7: Γ1/Γ2/Γ4 | P-10 (αν «ναι», B-100+ στην 074b) |
| `stops-helpers.js:95` | F |
| φρουρός `--plan 2` | W8 |
| Rollback μόνο πριν από την 1η γραμμή | §1 (ορισμός), B5 `_rollback`, Runbook |

**Τι μένει ρητά εκτός Φ5:**
- **Φ4β:** Ε3/Ε5/Ε12–Ε15, το πάνελ Διεθνών, το H8, και το κουτάκι `via_hub` ανά στάση.
- **Φ7:** ρόλοι μόνο ανάγνωσης, και ο νεκρός κώδικας (`_natlWriteGroupageChain`, `_syncNationalLoad`, οι κλάδοι NL του `_syncVeroiaSwitch`).
- **Groupage διεθνούς εξαγωγής:** αναβολή από τον owner, 21/10.
