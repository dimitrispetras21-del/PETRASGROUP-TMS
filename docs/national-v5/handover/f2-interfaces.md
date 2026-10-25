# Αλλαγή οχήματος: πού κουμπώνει πάνω στη Φ2 (072) και τη Φ1 (071/071b)

> **Έρευνα 25/10, στιγμιότυπο πριν από το πλάνο.** Τα ονόματα εργασίας και τα νούμερα εδώ (π.χ. «072 + 48 = 54», τα md5 της 072 `483ffd6e…`) ισχύουν όπως μετρήθηκαν τότε. Τα τελικά ονόματα, md5 και πλήθη είναι του πλάνου `docs/superpowers/plans/2026-10-25-national-v5-vehicle-handover.md` (Interfaces) και των αρχείων του `worker/migrations/drafts/`.

Πηγές (worktree `handover-plan`, `origin/main` @ `2dc9fdf6`): πλάνο Φ2 `docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md` (v2, 9.443 γραμμές), `worker/migrations/071_plan_schema.sql`, `071b_plan_one_vehicle*.sql`, `tms-auditor/test/plan-071.test.mjs`, `fixtures/live-071.sql`, spec `docs/superpowers/specs/2026-10-23-national-v5-vehicle-handover-design.md`, F3 `docs/national-v5/f3/requirements.md`. Μέτρηση παραγωγής: ένα SELECT, 25/10.

## 0. Τι υπάρχει, τι δεν υπάρχει (το πρώτο που πρέπει να ξέρει το πλάνο)

| Τι | Κατάσταση |
|---|---|
| 071, 071b | **Εκτελεσμένα** 22/10, στο `worker/migrations/` (όχι `drafts/`) |
| 072 (`072_plan_functions*.sql`), `tests/sql-072-drafts.test.js`, `tms-auditor/test/plan-072.test.mjs`, `fixtures/live-072.sql`, `worker/migrations/drafts/tools/build-072-dryrun.mjs` | **Δεν υπάρχουν σε κανέναν κλάδο του git** (`git log --all` κενό). Υπάρχουν μόνο ως code blocks του πλάνου Φ2. Ο κλάδος `feat/national-v5-functions` δεν έχει φτιαχτεί ακόμη. |
| Αντίγραφο αναφοράς (scratch, εκτός repo) | `/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-infallible-shamir-fc83ed/b5114ab0-7721-4fce-90ff-f67832ecc6bf/scratchpad/f2v2/wt`: 072 md5 `483ffd6eefdb17083a07b510e8de7237` (= ο αριθμός της κεφαλίδας του πλάνου), `live-072.sql` md5 `1df9d47dbf165795b62000ede7d0c26e`, `node_modules` έτοιμα. Ξανατρέχτηκε 25/10 από εμένα: `plan-072.test.mjs` **9/9**, rules `203 OK, 0 FAIL`, `build-072-dryrun.mjs --check` = καμία απόκλιση. Χρήσιμο **μόνο για πρωτότυπο**· ποτέ πηγή (αρχή 3). |
| Παραγωγή (SELECT 25/10) | 072 **όχι** (`plan_board` = NULL)· `plan_%` = 6· `model=2` = 0· γραμμές v5 = 0· triggers `public` = 46, B-54 = 46· `rt_v2_truck_once` και `rt_v2_driver_once` **πάνω στο `ct_round_trips`** |
| Αρίθμηση | 072 = Φ2, **073 = Φ3** (`073_plan_money`, `073b_plan_monitoring`), **074 = Φ5** (γέφυρα VS, ημέρα L). Η αλλαγή οχήματος χρειάζεται αριθμό που **δεν** είναι κανένας από αυτούς (απόφαση του πλάνου, π.χ. `072b_…` αν τρέχει πριν από τη 073, αλλιώς επόμενος ελεύθερος). |

**Συνέπεια:** το πλάνο της αλλαγής οχήματος δεν μπορεί να ξεκινήσει υλοποίηση πριν η Φ2 φτάσει τουλάχιστον στο Task Β9 (commit) στον `feat/national-v5-functions`: χωρίς τη λήψη `live-072.sql` (Task Α1 Step 1) και την πλήρη 072 δεν υπάρχει ούτε harness ούτε κείμενα να φρουρηθούν με md5. Εκτέλεση στην παραγωγή μόνο μετά το Κ2 της Φ2 (072 ζωντανή), και πριν από το L (εγγραφές κλειστές, άρα 0 κύκλοι v5).

---

## 1. Υπογραφές της 072 που πρέπει να καλέσει ή να επεκτείνει η αλλαγή οχήματος

Όλα από τα Interfaces του πλάνου Φ2 (η ΜΙΑ πηγή υπογραφών). Κάθε άλλη κλήση = `42883` την ώρα της κλήσης.

### 1.1 Σύμβαση κάθε δημόσιας `plan_*`
- `plan_<x>(p jsonb, p_actor text, p_role text) RETURNS jsonb`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, owner `postgres`, ποτέ `void`.
- Σώμα: πρώτη εντολή `perform plan_h_ctx(p_actor, p_role);`, μετά `perform plan_h_keys(p, array[...], 'p');` (άγνωστο κλειδί = `plan:bad_input`), κλείδωμα `FOR NO KEY UPDATE` με **μία** σειρά (κύκλοι κατά id → `orders`), μία γραμμή `audit_log` ανά αλλαγμένη γραμμή (`plan_h_audit`), τέλος `perform plan_h_finish();` και απάντηση `plan_h_ok(...)` ή το ίδιο σχήμα.
- Άρνηση: `RAISE EXCEPTION 'plan rule broken: <code>:<detail ASCII>' USING ERRCODE = '23514', HINT = 'plan:<code>'` (μέσω `plan_h_raise`).
- Γεννιέται κλειστό: `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`· `GRANT EXECUTE ... TO service_role` μόνο στις δημόσιες· οι `plan_h_*` SECURITY INVOKER και κλειστοί για όλους.
- Απάντηση εγγραφής: `{ "ok", "op", "dry_run": false, "ids": {...}, "warnings": [...], "notice_ids": [...] }`· κενά = `[]`, ποτέ απουσία.

### 1.2 Βοηθοί που θα καλέσει (υπογραφές κατά λέξη)

| Βοηθός | Υπογραφή | Σημασία για την αλλαγή οχήματος |
|---|---|---|
| `plan_h_raise` | `(p_code text, p_detail text) RETURNS void` | κάθε νέα άρνηση |
| `plan_h_ctx` | `(p_actor text, p_role text) RETURNS void` | `no_actor`· κάνει `SET CONSTRAINTS ALL DEFERRED` |
| `plan_h_keys` | `(p jsonb, p_allowed text[], p_what text) RETURNS void` | κάθε σώμα |
| `plan_h_audit` | `(p_actor text, p_role text, p_action text, p_table text, p_id text, p_before jsonb, p_after jsonb) RETURNS void` | `action` ∈ create/update/delete (CHECK του `audit_log`) |
| `plan_h_finish` | `() RETURNS void` | `SET CONSTRAINTS ALL IMMEDIATE`· πιάνει `exclusion_violation` **κατά όνομα** (βλ. §3) |
| `plan_h_ok` | `(p_op text, p_ids jsonb, p_warnings jsonb, p_notices jsonb) RETURNS jsonb` | LANGUAGE sql |
| `plan_h_confirm` | `(p_fn text, p_key text, p_full jsonb, p jsonb, p_role text) RETURNS jsonb` | ο ΕΝΑΣ μηχανισμός δύο βημάτων (Αφαίρεση τμήματος) |
| `plan_h_token` | `(p_fn text, p_key text, p_full jsonb) RETURNS text` | `md5('072|'||fn||'|'||key||'|'|| <λίστα χωρίς ποσά> ||'|'|| (xmin,ctid) των dl_entries με dl_entry_id της λίστας, των ct_cost_lines του rt_id κάθε στοιχείου kind='costs', των national_orders κάθε kind='invoiced')` |
| `plan_h_strip_amounts` | `(p jsonb, p_role text) RETURNS jsonb` | κόβει `amount, advance, expenses, invoice_number` εκτός owner/accountant |
| `plan_h_rt_consequences` | `(p_rt bigint) RETURNS jsonb` | `payroll_amount` (`dl_entry_id`, `driver_id`, `month`, ποσά) + `costs` ανά `pay_source` (ανά **κύκλο**, όχι ανά τμήμα) |
| `plan_h_drop_consequences` | `(p_legs bigint[], p_keep_rt bigint, p_chosen_rts bigint[] DEFAULT NULL) RETURNS jsonb` | μόνο για κινήσεις· δεν ξέρει τμήματα |
| `plan_h_notice` | `(p_desk text, p_kind text, p_tpl_b64 text, p_args text[], p_order bigint, p_nat_order bigint, p_rt bigint, p_actor text, p_role text) RETURNS bigint` | ελληνικά μόνο base64 |
| `plan_h_busy` | `(p_kind text, p_id bigint, p_from timestamptz, p_to timestamptz, p_except bigint) RETURNS void` | **διαβάζει `ct_round_trips`** (truck_id/driver_id/start_at/end_at)· πρέπει να περάσει στα τμήματα |
| `plan_h_v1_warn` | `(p_truck bigint, p_from date, p_to date, p_except bigint) RETURNS jsonb` | `v1_same_truck` |
| `plan_h_rt_cancel_if_empty` | `(p_rt bigint, p_reason text, p_actor text, p_role text) RETURNS boolean` | ακυρώνει κύκλο· δεν ξέρει τμήματα |
| `plan_h_reseq`, `plan_h_target`, `plan_h_stop_add`, `plan_h_leg_add` `(p_piece bigint, p_rt bigint, p_pickup bigint, p_drop bigint, p_actor text, p_role text, p_leg_no int DEFAULT NULL) RETURNS bigint`, `plan_h_leg_drop` `(p_leg bigint, p_reason text, p_actor text, p_role text) RETURNS void` | ως έχουν | το `plan_h_leg_add`/`_drop` είναι και **σημείο αγκίστρωσης της Φ3** (073) |

### 1.3 Δημόσιες της 072 που αγγίζουν το όχημα (θα πρέπει να αλλάξουν ή να σεβαστούν τα τμήματα)

| Συνάρτηση | Τι κάνει σήμερα με το όχημα | md5 προσωρινό (από 072 `483ffd6e…`, επαληθευμένο σε PGlite) |
|---|---|---|
| `plan_rt_create(jsonb,text,text)` (εσωτερική) | INSERT `ct_round_trips` με truck/driver/partner· `plan_h_busy` | `8a6f19ff9d3c400eb2a31722226332fa` |
| `plan_rt_update(jsonb,text,text)` | UPDATE όχημα στο `ct_round_trips`, `vehicle_clear_use_clear`, `payroll_locked`, `plan_h_busy` στο παράθυρο του κύκλου, dry run σε subtransaction | `e1aa3e103d3bbf4abd5b4a37b1a79829` |
| `plan_rt_clear(jsonb,text,text)` | `trip_type='OWNED'`, NULL σε όλο το όχημα, σβήνει μισθοδοσία με ποσό, `costs_without_rt` | `a46aae29841808f39b83b7737e7c6315` |
| `plan_delete(jsonb,text,text)` | ακυρώνει κύκλους που αδειάζουν | `c85450e28813d48023cb7f149949639c` |
| `plan_local_loading(jsonb,text,text)` | `driver_busy` αν ο τοπικός οδηγός = `r.driver_id` του κύκλου (απόφαση 38) | `d3107f05bf6ed170e673cccda48b4cb6` |
| `plan_board(date,text)` | `cycles[]` από `v_rt_cycle` (ένα όχημα ανά κύκλο) | `2a600c21f1aa75d84d35bb69235350cc` |
| `plan_vs_state(bigint[])` | `carriers` από `v_vs_state` (όχημα του κύκλου) | `8e50d9518eeed0ef688b0d8e13f6dff4` |
| `plan_h_finish()` | λεπτομέρεια 23P01 από `ct_round_trips` | `c398052b091723cdd9f7ae47516f8aa2` |
| `plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)` | προέλεγχος στο `ct_round_trips` | `3083076df503307b097472b99b121e23` |
| `plan_h_rt_cancel_if_empty(bigint,text,text,text)` | | `2f3cdfe09caa8c548e5a30e0f06c84fa` |
| `plan_h_rt_consequences(bigint)` | | `cddea3a5fb20a563283a16db3b50f133` |
| `plan_h_confirm(text,text,jsonb,jsonb,text)` | | `ba70b5d8c98d261f39874e78641f3c2c` |
| `plan_h_token(text,text,jsonb)` | | `5ebb4630c920cf626c346dcc5aa2a34a` |
| `plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,int)` / `plan_h_leg_drop(bigint,text,text,text)` | (και η 073 τις αγγίζει) | `aa9645fa495976bbca7c7de0635f4c22` / `4533385f7284c9ba5af52cf585a03250` |

Τα md5 είναι `md5(prosrc)`: το κείμενο ανάμεσα στα `$f$`. Τα υπολόγισα από το αρχείο και τα επιβεβαίωσα στο PGlite (`plan_h_finish`, `plan_h_busy`, `plan_rt_update`, `plan_h_ok`: ίδια). **Είναι προσωρινά:** η πηγή αλήθειας είναι το SELECT στην παραγωγή μετά το Κ2 της Φ2, και αλλάζουν με κάθε διόρθωση της 072 πριν από το merge.

### 1.4 Κωδικοί και μητρώα που επεκτείνονται

- **Της 071 (26):** `pieces_alive, piece_dead, pieces_sum, piece_parent, split_not_at_hub, rt_not_v2, rt_cancelled, leg_stop_dead, leg_order, leg_place, chain, chain_time, stop_seq, stop_order, side_order, rt_window, local_loading_gone, local_loading_day, local_loading_stop, model_locked, stop_locked, leg_locked, piece_locked, shipment_locked, v1_link_on_v2, hard_delete`.
- **`CODES_072` (31, κατά λέξη από το `plan-contract.test.mjs`):**
  ```js
  const CODES_072 = ['bad_input', 'driver_busy', 'group_empty', 'local_cancel_no_id', 'local_exists', 'need_token', 'no_actor', 'no_client',
    'no_price', 'no_vehicle', 'no_window', 'not_at_hub', 'not_stock', 'notice_gone', 'order_gone', 'order_not_v5',
    'parts_sum', 'payroll_locked', 'piece_busy', 'piece_split', 'request_missing', 'request_reused', 'rt_gone', 'same_rt', 'stale_confirm', 'stock_lot',
    'stop_gone', 'truck_busy', 'vehicle_clear_use_clear', 'vs_locked', 'vs_not_bridge'];
  ```
  Ο έλεγχος: `codes072(sql)` = κάθε `plan_h_raise('<code>'` και `HINT = 'plan:<code>'` της **072 μόνο**, μείον τους κωδικούς της 071, `deepEqual` με τη λίστα. Ένας νέος κωδικός (π.χ. αφαίρεση/επικάλυψη τμήματος) χρειάζεται **δική του λίστα** για το νέο αρχείο και επέκταση του test ώστε να διαβάζει και αυτό· αλλιώς ο κωδικός μένει χωρίς έλεγχο «κείμενο ↔ βάση».
- **Αποσυρμένοι (απαγορεύονται παντού):** `hub_endpoint, piece_planned, bridge_moved, bridge_split, legacy_nl, frozen, restore_expired, restore_conflict, partner_rate_on_owned, window_order`.
- **`PLAN_RULE_TEXT`** (Worker, ελληνικά ανά κωδικό· η μόνη πηγή ελληνικών)· `PLAN_CHECK_TEXT` (ανά όνομα constraint, 32 CHECK + 4 UNIQUE). Το test «dead keys» δέχεται μόνο constraints της 071 + `LIVE_PRE_071 = ['partner_needs_partner']`: κάθε νέο CHECK (π.χ. λόγος ∈ λίστα, `other` χωρίς σημείωση) θέλει κείμενο **και** επέκταση του test να διαβάζει το νέο αρχείο.
- **Μητρώο τιμών Φ4** (το build test της Β9 αρνείται τιμή εκτός λίστας): `warnings[]` = `local_payroll_review, mixed_temp, over_33, v1_same_truck, vs_day_differs`· `plan_notices.kind` = `vs_day_changed`, `costs_without_rt`, `vs_place_changed`· `consequences[].kind` = `invoiced, costs, payroll_amount, local_loading, local_payroll, rt_cancelled, executed_leg, later_leg`. Κάθε νέα τιμή = νέα γραμμή στο αντίστοιχο μητρώο.
- **Worker `stockRuleError` (23P01):** ψάχνει **με όνομα** `rt_v2_truck_once` → `truck_busy`, `rt_v2_driver_once` → `driver_busy`· κάθε άλλο exclusion = `null` (το σημερινό 500). `plan-contract` απαιτεί τα EXCLUDE του `071b_plan_one_vehicle.sql` να είναι **ακριβώς** αυτά τα δύο ονόματα.
- **`PLAN_ROUTES` ↔ υπογραφές:** το contract test διαβάζει τις υπογραφές **μόνο από την 072** (`sigs` από `f072()`) και απαιτεί κάθε δημόσια `plan_*` να δρομολογείται ακριβώς μία φορά (`plan_rt_create` εξαιρείται). Νέα δημόσια συνάρτηση σε άλλο αρχείο = το test πρέπει να διαβάζει και αυτό.
- **`PLAN_PERMS`** (deny-by-default, χωρίς `"*"`): απόφαση 41(β) «η αφαίρεση αλλαγής οχήματος μένει owner/dispatcher». Το `plan-perms.test.mjs` ελέγχει κελί-κελί ένα `EXPECT` με `ROLES` και `DESK = ['owner','dispatcher']`: νέοι πόροι (π.χ. αλλαγή/διόρθωση για όλους, αφαίρεση μόνο `DESK`) μπαίνουν και στο literal και στο `EXPECT`. Το `PLAN_WRITES_OPEN = false` ισχύει και για τις νέες διαδρομές· μόνο όσες έχουν `dryRun: true` περνούν με `{"dry_run": true}`.
- **`plan-tables-guard`:** `V5_TABLES = ['shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices', 'plan_config']`. Ο νέος πίνακας τμημάτων μπαίνει εδώ (ποτέ στο `TABLES` του facade).

### 1.5 Λίστα φρουρού md5 της 072 (22 συναρτήσεις, PART 0 και PART 5)

Μορφή `('<sig>', '<md5>')`, κάθε ζεύγος **ακριβώς δύο φορές** στο αρχείο (έλεγχος του `sql-072-drafts`): `dl_sync_from_rt() 331cea3a…`, `dl_local_day_sync(bigint,date) 151dab06…`, `dl_sync_from_local_move() f053c478…`, `local_moves_before() 3b9f0a27…`, `dl_local_line_guard() e7f0348c…`, `dl_cash_sync_entry() 6d702bad…`, `order_cd_stop_follow() 433a1a72…`, `ramp_follows_stop() 6fa6a83c…`, `invoice_mark_guard() dd975c4f…`, `stock_guard_natl() e941edbc…`, `stock_guard_orders() 63aa751d…`, `national_orders_soft_delete_cascade() 6c423b14…`, `rt_status_guard() d7757f99…`, `plan_chk() 8f2fa7e5…`, `plan_rt_window_sync() 050cbabe…`, `plan_rt_problem(bigint) f383f449…`, `plan_shipment_problem(bigint) 8dd2beb1…`, `plan_leg_problem(bigint) 24803f17…`, `plan_local_loading_problem(bigint) 4c3dbec3…`, `ct_rt_legs_v2_guard() 6240d699…`, `rt_sync_to_orders() a63234c8…`, `rt_sync_to_national_loads() 028efb76…` (πλήρη md5 στον πίνακα «Αφετηρία» του πλάνου Φ2, γρ. 81–104).

---

## 2. Τι ορίζει η 071/071b που η αλλαγή οχήματος συναντά

- `ct_round_trips` (071): `model smallint NOT NULL DEFAULT 1`, `start_at`, `end_at`, `partner_rate numeric(10,2)`· **χωρίς** `deleted_at` (κύκλος που δεν έγινε = `status='cancelled'`). CHECK:
  - `rt_model CHECK (model IN (1, 2))`
  - `rt_v2_scope CHECK (model = 1 OR scope = 'NATL')`: κύκλος v5 είναι μόνο εθνικός (για τα διεθνή, δρόμος A: τα τμήματα πρέπει να δουλεύουν και για `model=1`, άρα όχι FK/CHECK που προϋποθέτει `model=2`)
  - `rt_v2_status CHECK (model = 1 OR status IN ('planned', 'cancelled'))`
  - `rt_v2_window CHECK (model = 1 OR (start_at IS NOT NULL AND end_at > start_at))`
  - `rt_v1_no_window CHECK (model = 2 OR (start_at IS NULL AND end_at IS NULL))`: ένα RT `model=1` **δεν έχει ώρες αρχής/τέλους**· τα τμήματα με «από–έως» σε διεθνή (φάση μετά το L) θα συγκρούονταν με αυτό, ή θα χρειάζονταν ώρες μόνο στα τμήματα
  - `rt_v2_dates CHECK (model = 1 OR (date_start = (start_at AT TIME ZONE 'Europe/Athens')::date AND date_end = (end_at AT TIME ZONE 'Europe/Athens')::date))`
  - `rt_partner_rate CHECK (partner_rate IS NULL OR (model = 2 AND trip_type = 'PARTNER' AND partner_rate >= 0))`· live πριν από τη 071: `partner_needs_partner`.
- `plan_rt_window_sync()` (AFTER INSERT/UPDATE/DELETE ON `rt_stops`): γράφει `start_at/end_at/date_start/date_end` **μόνο** από τις ζωντανές στάσεις. Το spec θέλει «τα άκρα των τμημάτων ακολουθούν μόνα τους, όπως σήμερα το `plan_rt_window_sync`»: εδώ είναι το σημείο (νέος trigger ή αλλαγή του `plan_rt_window_sync`, που είναι στη λίστα των 22, βλ. §4).
- `plan_chk()` (SECURITY DEFINER), 7 constraint triggers `DEFERRABLE INITIALLY DEFERRED`: `plan_chk_rt` (ct_round_trips, INSERT/UPDATE), `plan_chk_stops`, `plan_chk_legs`, `plan_chk_pieces`, `plan_chk_shipments` (INSERT/UPDATE/DELETE), `plan_chk_bridge_stop` (order_stops pallets/deleted_at), `plan_chk_local_loading`. Ο κανόνας «κάθε τμήμα καλύπτει τον κύκλο χωρίς κενά» μπορεί να γίνει νέος deferred constraint trigger με το ίδιο σχήμα (`*_problem` που επιστρέφει `'<code>:<detail>'`, raise με `HINT 'plan:'||code`). Κάθε νέος trigger = **+1 στο B-54**.
- Όψεις (security_invoker, χωρίς ποσά): `v_rt_cycle` (ένα όχημα ανά κύκλο), `v_rt_stop_state.has_vehicle` (από `r.truck_id`/`r.partner_id`), `v_vs_state.carriers` (`r.truck_id, r.driver_id, r.partner_id` του κύκλου). Με το «ΑΡΧΙΚΟ = αντίγραφο στο `ct_round_trips`» το `has_vehicle` μένει σωστό· το «ακολουθεί» του Weekly Διεθνών (spec: όχημα του τμήματος στην ώρα της Βέροιας) θέλει αλλαγή του `v_vs_state` ή του `plan_vs_state`.
- Γεννιέται κλειστό (071 §10): `ENABLE ROW LEVEL SECURITY` χωρίς policy· `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`· `GRANT SELECT ... TO service_role, tms_reader, tms_check_runner`· `REVOKE ALL ON SEQUENCE ...`· απόδειξη μέσα στο block με `has_table_privilege` / `has_function_privilege` και `pg_policies`.
- Αλλαγή υπάρχουσας συνάρτησης (071 §9, το πρότυπο): ζωντανό κείμενο + μία γραμμή, **γεννημένο, ποτέ ξαναγραμμένο**: έλεγχος ότι ο στόχος υπάρχει ακριβώς μία φορά, `replace()`, απόδειξη ότι το αντίστροφο `replace()` δίνει το ζωντανό κείμενο, md5 του νέου ίσο με το μετρημένο, `EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', ...)`, ξανά md5 μετά. Έτσι το rollback επιστρέφει το κείμενο byte προς byte.

---

## 3. Το EXCLUDE της 071b: πού ζει και πώς περνά στα τμήματα

### 3.1 Πού ζει (παραγωγή, SELECT 25/10)
```
rt_v2_truck_once  @ ct_round_trips  md5(pg_get_constraintdef) 45b24579c51959b4328e94bac01ff9cd
rt_v2_driver_once @ ct_round_trips  md5(pg_get_constraintdef) 93d31da4a356adda56065657c8410959
EXCLUDE USING gist (truck_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&)
  WHERE (((model = 2) AND (trip_type = 'OWNED'::text) AND (truck_id IS NOT NULL) AND (status <> 'cancelled'::text)))
  DEFERRABLE INITIALLY DEFERRED
```
(το driver: ίδιο με `driver_id`). `btree_gist` στο σχήμα `extensions`. Το md5 του `pg_get_constraintdef` μετρήθηκε στην παραγωγή (PG 17.6)· στο PGlite μπορεί να τυπώνεται αλλιώς: πριν μπει ως φρουρός, μέτρησέ το και στο harness.

### 3.2 Ποιος εξαρτάται από αυτό (κάθε «και εκεί»)
1. **072 PART 0**: αρνείται αν `count(*) ... conrelid = 'public.ct_round_trips'::regclass AND conname IN ('rt_v2_truck_once','rt_v2_driver_once') <> 2` («072: 071 and 071b must be applied first»). Άρα η μεταφορά γίνεται **μετά** την 072, ποτέ πριν.
2. **`plan_h_finish`**: `exception when exclusion_violation` → `constraint_name`· `'rt_v2_driver_once'` → `driver_busy`, αλλιώς `truck_busy`· η λεπτομέρεια (κωδικοί RT) διαβάζεται από `ct_round_trips`.
3. **`plan_h_busy`**: προέλεγχος «ίδια συνθήκη με το EXCLUDE» πάνω στο `ct_round_trips`.
4. **Worker `stockRuleError`**: 23P01 κατά όνομα (§1.4).
5. **`plan-contract.test.mjs`**: «071b: each EXCLUDE (23P01, deferred) answers the same code as 072's pre-check» (διαβάζει το αρχείο 071b, ακριβώς τα δύο ονόματα).
6. **072 rules test**: οι περιπτώσεις **6, 7, 42** στηρίζονται στο δίχτυ (INSERT `ct_round_trips` απευθείας, αναμένουν `plan:truck_busy` / `plan:driver_busy` από το `plan_h_finish`).
7. **071b**: `_verify.sql` (truck_once/driver_once στο `ct_round_trips`, μετρά επικαλύψεις εκεί), `_test.sql` (8 περιπτώσεις με INSERT στο `ct_round_trips`), `_rollback.sql` (αρνείται αν δεν είναι και τα δύο στο `ct_round_trips`: ασφαλής άρνηση, όχι ζημιά).
8. **Φ3 (073), I-02**: «EXCLUDE `rt_v2_truck_once` (OWNED `model=2` δεν επικαλύπτονται → το Ε10 έχει το πολύ έναν υποψήφιο `model=2` ανά στιγμή ανά φορτηγό)». Το DKV κατά ώρα της Φ3 χτίζεται πάνω σε αυτή την υπόθεση· με τμήματα ο υποψήφιος είναι το **τμήμα** (spec: «καύσιμο του 2104 μετά τις 14:30 δεν πάει στο RT-1273»). Η σειρά 073 ↔ αλλαγή οχήματος είναι απόφαση owner.

### 3.3 Μέτρηση σε PGlite (scratch, 25/10, δεν άγγιξε το repo)
Probe `/private/tmp/claude-501/-Users-dimitrispetras-PETRASGROUP-TMS--claude-worktrees-infallible-shamir-fc83ed/b5114ab0-7721-4fce-90ff-f67832ecc6bf/scratchpad/handover-plan/probe.mjs` πάνω στο αντίγραφο αναφοράς: 071 + 071b + 072, μετά ένα DO block που (α) αρνείται αν υπάρχει `model=2`, (β) `ALTER TABLE ct_round_trips DROP CONSTRAINT rt_v2_truck_once, DROP CONSTRAINT rt_v2_driver_once`, (γ) φτιάχνει πίνακα τμημάτων και προσθέτει EXCLUDE **με τα ίδια ονόματα**.
- Τα ίδια ονόματα **γίνονται δεκτά** μέσα στο ίδιο block (το index του EXCLUDE απελευθερώνει το όνομα με το DROP): `rt_v2_driver_once@rt_vehicle_segments, rt_v2_truck_once@rt_vehicle_segments`. Έτσι μένουν αμετάβλητα ο χάρτης 23P01 του Worker, ο κλάδος `v_con` του `plan_h_finish` και τα κείμενα.
- 072 rules test: **πριν** `203 OK, 0 FAIL`· **μετά**, χωρίς να γράφει κανείς τμήματα, `200 OK, 3 FAIL`: `6 FAIL want plan:truck_busy`, `7 FAIL want plan:driver_busy`, `42 FAIL want plan:truck_busy` (όλα «no error»). Οι υπόλοιπες περνούν μόνο επειδή το `plan_h_busy` κοιτά ακόμη το `ct_round_trips`.

### 3.4 Τι σημαίνει «με ασφάλεια, όσο υπάρχουν 0 κύκλοι v5»
Μέσα σε **ένα** DO block, μετά τις 15:00, `PERFORM set_config('lock_timeout', '5s', true)`:
1. **Φρουροί (μόνο ανάγνωση):** 072 εφαρμοσμένη (`to_regprocedure('public.plan_h_raise(text,text)') IS NOT NULL`)· `SELECT count(*) FROM ct_round_trips WHERE model = 2` = 0 **και** 0 γραμμές στους 5 πίνακες v5 (ίδιο άθροισμα με το PART 0 της 072)· τα δύο EXCLUDE υπάρχουν στο `ct_round_trips` με το ορισμό του §3.1 (`md5(pg_get_constraintdef)` ή το κείμενο)· md5 κάθε ζωντανής συνάρτησης που θα αλλάξει ή θα κληθεί (§4)· B-54 = ζωντανό πλήθος triggers.
2. **Ο νέος πίνακας γεννιέται κλειστός** (πρότυπο 071 §10) και άδειος.
3. `DROP CONSTRAINT` τα δύο στο `ct_round_trips`, `ADD CONSTRAINT` τα δύο (ίδια ονόματα) στον πίνακα τμημάτων, `EXCLUDE USING gist (... tstzrange(<από>, <έως>, '[)') WITH &&) WHERE (<OWNED, όχημα όχι NULL, τμήμα ζωντανό, κύκλος όχι cancelled>) DEFERRABLE INITIALLY DEFERRED`. Το `status` του κύκλου δεν φτάνει μέσα σε EXCLUDE (καμία ένωση πινάκων): ή στήλη-αντίγραφο στο τμήμα που τη γράφει μόνο η βάση, ή soft delete των τμημάτων όταν ο κύκλος ακυρώνεται (τότε αλλάζει το `plan_h_rt_cancel_if_empty`). Απόφαση του πλάνου.
4. Με 0 κύκλους v5 **δεν** χρειάζεται backfill· γι' αυτό η μεταφορά έχει νόημα μόνο τώρα: μετά την πρώτη γραμμή v5 θα ήθελε μετάπτωση δεδομένων και δεν υπάρχει γυρισμός (spec 2.2).
5. **Όλα τα σημεία του §3.2** στην ίδια αλλαγή: `plan_h_busy` και `plan_h_finish` διαβάζουν τμήματα· τα τμήματα γράφονται από **κάθε** δρόμο που σήμερα γράφει όχημα στο `ct_round_trips` (`plan_rt_create`, `plan_rt_update`, `plan_rt_clear`), αλλιώς το δίχτυ είναι άδειο (μετρημένο: 6/7/42). Αν ο κανόνας είναι «κάθε κύκλος v5 έχει ≥ 1 τμήμα» και ελέγχεται στο COMMIT, το πλαίσιο S της 072 (INSERT `ct_round_trips` απευθείας σε **κάθε** περίπτωση) αποτυγχάνει σε όλες τις 203, εκτός αν το πρώτο τμήμα το γράφει trigger στο INSERT του κύκλου. Αυτό είναι επιλογή που θέλει owner (αρχή 3: «ΑΡΧΙΚΟ = αντίγραφο που γράφει μόνο η βάση», ποια κατεύθυνση).
6. **Αποδείξεις μέσα στο block:** δύο EXCLUDE στον νέο πίνακα, deferrable, initially deferred (`contype = 'x' AND condeferrable AND condeferred`)· 0 στο `ct_round_trips`· 0 γραμμές· κλειστό στους ρόλους API· triggers = πριν + N και `UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0` με `GET DIAGNOSTICS = 1` (πρότυπο 071), αλλιώς B-54 μένει ίδιο.
7. **Rollback:** αρνείται με την πρώτη γραμμή v5/τμήματος· ξαναβάζει τα δύο EXCLUDE στο `ct_round_trips` **με τον ορισμό του 071b κατά λέξη**· επιστρέφει κάθε αλλαγμένη συνάρτηση byte προς byte (πρότυπο 071 §9)· σβήνει τον πίνακα· B-54 πίσω. Σειρά: **πρώτα** αυτό το rollback, **μετά** οποιοδήποτε rollback της 072 (το 072 rollback σβήνει από τον κατάλογο κάθε `plan_%` εκτός των 6 της 071, και αποτυγχάνει με `2BP01` αν μια `plan_*` συνάρτηση χρησιμοποιείται από trigger).

---

## 4. Πώς μια νέα migration φρουρεί την 072 (md5)

Πρότυπο: PART 0 / PART 5 της 072.
```sql
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_finish()', '<md5 μετρημένο στην παραγωγή μετά το Κ2>'),
      ('public.plan_h_busy(text,bigint,timestamptz,timestamptz,bigint)', '<md5>'),
      ...
    ) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '<NNN>: % is not the live text read <ημερομηνία> (expected md5 %) - stop, re-measure', v_g.sig, v_g.m;
    END IF;
  END LOOP;
```
- **Ποια:** κάθε συνάρτηση της 072 που η νέα migration καλεί, αλλάζει ή της οποίας τη συμπεριφορά προϋποθέτει (§1.3), **και** όσες από τις 22 της λίστας της 072 αγγίζει (`plan_chk`, `plan_rt_window_sync`, `plan_rt_problem`, `dl_sync_from_rt`, `rt_status_guard`, ...). Ίδια λίστα, ίδια μορφή `('<sig>', '<md5>')`, **δύο φορές** (φρουρός πάνω, απόδειξη στο τέλος), και ελεγμένη στο build test όπως το `sql-072-drafts` («once in the guard, once in the proof»).
- **Μέτρηση:** τα md5 μπαίνουν από SELECT στην παραγωγή **μετά** το Κ2 της Φ2 (`SELECT p.oid::regprocedure, md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%' ORDER BY 1`). Ως τότε, οι τιμές του §1.3 είναι προσωρινές (072 `483ffd6e…`) και το harness τις επιβεβαιώνει πάνω στο PGlite (όπως «the fixture holds the LIVE texts»).
- **Πλήθος:** η 072 αρνείται αν τα `plan_%` δεν είναι ακριβώς 6· η νέα migration αντίστοιχα αρνείται αν τα `plan_%` δεν είναι `6 + <οι της 072>` (το πλήθος μετριέται μετά το Κ2· στο αντίγραφο αναφοράς η 072 έχει 48 `CREATE FUNCTION`, άρα 6 + 48 = 54, ξαναμέτρησέ το στην παραγωγή).
- **Αλυσίδα με τη 073:** και η Φ3 αλλάζει συναρτήσεις της 072 (`plan_h_leg_add` / `plan_h_leg_drop`, «F3 hook»). Όποια από τις δύο εκτελεστεί δεύτερη φρουρεί τα md5 **όπως τα άφησε η πρώτη**. Δύο ανεξάρτητες λίστες md5 = μία θα αρνηθεί (σωστά), αλλά η σειρά πρέπει να γραφτεί στο πλάνο.
- **Τι «βλέπει» η 072 μετά:** το `072_plan_functions_verify.sql` (ειπωμένο «σταθερό για πάντα») θα δείχνει διαφορές:
  - `service_role_execute` μετρά **κάθε** `plan_%` με EXECUTE: νέες δημόσιες ⇒ ≠ 16·
  - `changed_live` μετρά τις 22· αν η νέα αλλάξει μία από αυτές (π.χ. `plan_rt_window_sync`, `plan_chk`) ⇒ > 0 για πάντα·
  - το `072_plan_functions_rollback.sql` ελέγχει `plan_chk` = `8f2fa7e5…` και `dl_sync_from_rt` = `331cea3a…`: αλλαγή τους κάνει το rollback της 072 να αρνείται·
  - το `072_plan_functions_test.sql` (προαιρετικό στην παραγωγή, Κ2 Step 9) δίνει 3 FAIL (6, 7, 42) αν δεν γράφονται τμήματα.

  Το πλάνο πρέπει ή να τα αποφύγει (νέες συναρτήσεις/triggers αντί για αλλαγή των 22) ή να γράψει ρητά τα νέα Expected της 072 (αρχή 8: ένα verify που «αποτυγχάνει πάντα» λέει ψέματα).

---

## 5. Το harness PGlite: εντολές κατά λέξη από το πλάνο Φ2

Προετοιμασία (Task 0 Step 5):
```bash
cd tms-auditor && npm ci && node -e "import('@electric-sql/pglite/contrib/btree_gist').then(()=>import('@electric-sql/pglite/contrib/pgcrypto')).then(()=>console.log('PGLITE-CONTRIB-OK'))"
```
Expected: `npm ci` χωρίς σφάλμα και `PGLITE-CONTRIB-OK`. (Το worktree δεν έχει `node_modules`· το αντίγραφο αναφοράς έχει.)

Έλεγχος της λήψης (Task Α1 Step 1):
```bash
grep -c -E "is_hub|via_hub|rt_stop_id|piece_leg_id|rt_v2_|locations_one_hub|plan_chk" tms-auditor/test/fixtures/live-072.sql
```
Expected: `0`.

Η 071/071b (υπάρχει σήμερα, Task Α1 Step 5):
```bash
cd tms-auditor && node --test test/plan-071.test.mjs
```
Expected: `ℹ pass 8`, `ℹ fail 0`.

Η 072 (Β9 Step 6):
```bash
node --test tests/sql-072-drafts.test.js
```
Expected: `ℹ pass 12`, `ℹ fail 0`.
```bash
cd tms-auditor && node --test test/plan-072.test.mjs
```
Expected: `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`· στο μήνυμα του rules test `Result: 203 OK, 0 FAIL`· το dry run `072 ran: plan functions <N>, public 16, service_role EXECUTE 16, open to API 0, triggers <T>, B-54 <T>, v5 rows 0`· η μεταλλαγή ρίχνει ακριβώς τη `B38 FAIL want ok got FAIL clear with amount: needs_review 1`.
```bash
node --test worker/test/*.test.mjs worker/src/rt-rules.test.mjs && node --test tests/sql-071-drafts.test.js && cd tms-auditor && node --test test/plan-071.test.mjs
```
Γεννήτρια dry run:
```bash
node worker/migrations/drafts/tools/build-072-dryrun.mjs
node worker/migrations/drafts/tools/build-072-dryrun.mjs --check
```
Expected: `wrote 072_plan_functions_dryrun.sql`· με `--check`, exit 0 (αλλιώς `drift: ...`).

Συναρμολόγηση (Σ1 Step 1), το μπλοκ που αποδεικνύει την πλήρη SQL:
```bash
git fetch origin && git log --oneline HEAD..origin/main -- worker/migrations tms-auditor tests   # κενό, αλλιώς πρώτα git merge origin/main
node worker/migrations/drafts/tools/build-072-dryrun.mjs --check && echo DRYRUN-IDIO
node --test tests/sql-072-drafts.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'
node --test tests/sql-071-drafts.test.js 2>&1 | grep -E '^ℹ (pass|fail)'
(cd tms-auditor && node --test test/plan-072.test.mjs test/plan-071.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)|Result:')
grep -n "plan_h_[a-z_]*(" worker/migrations/drafts/072_plan_functions.sql | grep -v "CREATE FUNCTION" \
  | grep -oE "plan_h_[a-z_]+" | sort | uniq -c
```
Ο Worker (Σ1 Step 2):
```bash
git checkout feat/national-v5-functions -- worker/migrations/drafts/072_plan_functions.sql
node --test worker/test/plan-contract.test.mjs 2>&1 | grep -E '^(ℹ|#) checked|^ℹ (pass|fail)'
node --check worker/src/index.js && node --test worker/test/*.test.mjs worker/src/rt-rules.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'
node worker/tools/worker-guard.mjs worker/src/index.js --plan 1 | tail -1
git status --short
```
Expected: τρεις γραμμές `ℹ checked: …`, `ℹ pass 8`, `ℹ fail 0`· `ℹ tests 282`, `ℹ pass 281`, `ℹ skipped 1`, `ℹ fail 0`· `GUARD OK (15 markers, plan=1) worker/src/index.js`.

### 5.1 Το σχήμα που αντιγράφει η νέα migration
`prodShaped()` του `plan-072.test.mjs` (Β8), με τη σειρά: `freshDb({ extensions: { btree_gist, pgcrypto } })` → ρόλοι `anon`/`authenticated`/`service_role` → `fixtures/live-071.sql` → `fixtures/live-072.sql` → STUBS (`ct_v_rt_revenue`, `ct_v_rt_costs`, `ct_v_rt_pnl`, `dl_v_rt_route`) → `CREATE SCHEMA IF NOT EXISTS extensions` + `pgcrypto` → `INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')` → `UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'` → `071_plan_schema.sql` → `071b_plan_one_vehicle.sql`. Η νέα migration προσθέτει: → `072_plan_functions.sql` (από `drafts/` ή `worker/migrations/`, ανάλογα με το αν τρέχει ήδη) → οι δικές της υπο-δοκιμές με τη σειρά του Β8: fixture md5 (οι 22 + οι της 072 που φρουρεί) → dry run «τίποτα δεν έμεινε» → apply → verify → ρόλοι API (`SET ROLE service_role` / `anon`, `permission denied`) → rules test (`Result: N OK, 0 FAIL`, 0 γραμμές μετά) → rollback (άρνηση με γραμμή v5, μετά επιτυχία, τα κείμενα πίσω byte προς byte, B-54 πίσω, ξανά apply) → μία μεταλλαγή που ρίχνει συγκεκριμένη περίπτωση. Αν η 072 είναι ήδη στο `worker/migrations/` (μετά το Κ3), το `read` του harness και της γεννήτριας αλλάζουν φάκελο (Κ3 Step 1).

### 5.2 Γνωστά όρια του harness (από το πλάνο)
- Οι όψεις χρημάτων είναι STUBS: αποδεικνύονται κανόνες, όχι ποσά.
- Η λήψη κρατά μόνο τις συναρτήσεις/triggers των λιστών `f`/`trg` του Α1 Step 1· στην παραγωγή πυροδοτούνται και άλλα (`rt_create_from_order`, `order_leg_depth`, `order_leg_status_sync`, `orders_group_id_blank_null`, `orders_invoice_mark_guard`, `order_parent_to_legs`, `ct_cost_lines.dl_cash_sync_line`, τα τρία του `national_loads`). Αν η αλλαγή οχήματος γράφει σε νέο σημείο, η λήψη χρειάζεται επέκταση των λιστών και ξανά λήψη (ποτέ με το χέρι).
- Κάθε νέα γραμμή στο rules test ακολουθεί το σχήμα `    , '<ok|plan:code|con:name|state:XXXXX>'  -- <k> <τι>` (το `wantCount` το μετρά με regex).

---

## 6. Πού θα ακουστεί αν σπάσει (για την ενότητα «Αν σπάσει» του πλάνου)
- Φρουρός md5 στην αρχή του block: η migration αρνείται αν η 072 ή η 073 άλλαξε από τη μέτρηση.
- Build test (χωρίς βάση): ASCII, ένα DO, λίστα md5 δύο φορές, γεννιέται κλειστό, κάθε κωδικός με περίπτωση, dry run ξαναπαραγμένο.
- PGlite: 072 rules ξανά **μετά** τη νέα migration (το μετρημένο 3 FAIL δείχνει ότι το test πιάνει τη μεταφορά), και τα δικά της.
- Worker: `plan-contract` (κωδικοί, constraints, διαδρομές ↔ υπογραφές) επεκταμένο στο νέο αρχείο· `plan-perms` κελί-κελί· `plan-tables-guard` με τον νέο πίνακα· νέο σημάδι φρουρού στο CLAUDE.md μετά το deploy.
- B-54 (ωριαίο) αν αλλάξει πλήθος triggers χωρίς ενημέρωση· `tms-auditor/checks/B-54.sql` + `047b` μετά την εκτέλεση.
