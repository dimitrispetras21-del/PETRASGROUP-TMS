# Εθνικά v5: τεχνικό σχέδιο υλοποίησης
## Παραγγελία → Αποστολή → Κομμάτι → Σκέλος (ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ) → RT-κύκλος

> Μόνο ανάγνωση: `origin/main` 62d09f9d (21/10/2026), `worker/src/index.js`, `worker/migrations/*` (και `drafts/`), `core/*`, `modules/*`, και τα κείμενα brainstorming 19/10 και 20/10. Καμία εγγραφή στη βάση, κανένα SQL. Είναι σχέδιο, όχι απόφαση. Ό,τι λέει «σήμερα ο κώδικας κάνει Χ» έχει παραπομπή `αρχείο:γραμμή` στο `origin/main`.
>
> Ορολογία (owner 19/10): για τον χρήστη **σκέλος = η ΚΑΘΟΔΟΣ ή η ΑΝΟΔΟΣ ενός φορτηγού**, στήλη `rt_stops.side`. Ο πίνακας `piece_legs` είναι εσωτερικός: στο κείμενο λέγεται «κίνηση κομματιού». Στον κώδικα δεν γράφουμε σκέτο `leg`: γράφουμε `piece leg`, `side` ή `order link` (= `ct_rt_legs`).

---

## 0. Από πού ξεκινάμε (με παραπομπές)

| Γεγονός σήμερα | Πού | Τι σημαίνει για το v5 |
|---|---|---|
| Ο Worker είναι facade: άγνωστο label = σιωπηλή απόρριψη, και ο κανόνας του `can()` είναι `roleMap[table] \|\| roleMap["*"]` | `worker/src/index.js:689-695`, χάρτης `TABLES` από `:899` | Οι νέοι πίνακες **δεν** μπαίνουν στο `TABLES`. Μόνο διαδρομές `/plan/*`. Έτσι δεν ανοίγουν σε management/accountant μέσω του `"*": ["GET"]` (`:472`, `:522`) |
| Πρότυπο deny-by-default υπάρχει ήδη: `COSTS_PERMS` + `ctCan` | `index.js:3498-3531`, δρομολόγηση `/costs/` στο `:5802` | Το `PLAN_PERMS` αντιγράφει ακριβώς αυτό το σχήμα |
| Ένας χαρτογράφος για όλες τις αρνήσεις της βάσης, με hint `family:code` (SQLSTATE 23514) | `stockRuleError` `index.js:3184-3226`, `stockRuleResponse` `:3235`, σχόλιο «ONE mapper» `:3121-3124` | Η οικογένεια `plan:` μπαίνει **στον ίδιο** χαρτογράφο. Δεύτερος χαρτογράφος δεν φτιάχνεται |
| `dbRpc` κρατά το σφάλμα PostgREST στο `err.pg` | `index.js:348-369` | Οι `plan_*` καλούνται ως RPC, και η άρνηση γίνεται ελληνικό 422 χωρίς νέο μηχανισμό |
| Facade DELETE = soft (`deleted_at`) και περνά από `stockRuleError` | `index.js:3337-3349` | Μια άρνηση `plan:` σε στάση `order_stops` (VS γέφυρα) ακούγεται στη διεθνή φόρμα ως 422 |
| Μισθοδοσία: μία γραμμή ανά OWNED RT με οδηγό, ποσά NULL. Σε ακύρωση: soft-delete αν δεν έχει ποσά, αλλιώς `needs_review` | `011_driver_ledger.sql:153-221` (INSERT `:181-186`, cancelled `:190-199`), `dl_rt_live` `:57`, `dl_v_rt_gap` `:143-147` | Χωρίς αλλαγή. Το RT-κύκλος δίνει μόνο του «μία γραμμή ανά κύκλο» |
| Η διαδρομή στη μισθοδοσία διαβάζεται από `ct_rt_legs` | `dl_v_rt_route` `012_rt_route_legs.sql:17-…` | Ένα RT με `model=2` δεν έχει `ct_rt_legs`, άρα **θα έβγαινε χωρίς διαδρομή**. Η όψη θέλει κλάδο από `rt_stops` (Φ3) |
| Ο κύκλος ζωής των RT ζει σε triggers της βάσης: 013 `rt_recompute`/`rt_sync_*`, 033/034 δημιουργία, 037 merge, 046 auto-close + `rt_status_guard` | `013_rt_sync.sql:48-235`, `034_rt_create_national.sql:168-470`, `046_rt_auto_close.sql:141-330` | Μένουν για V1. Για `model=2` κάνουν `RETURN` ή αρνούνται (Φ1) |
| `ct_rt_legs.rt_id … ON DELETE CASCADE`. Τα `ct_cost_lines.rt_id` και `dl_entries.rt_id` δεν έχουν ON DELETE | `001_costs_schema.sql:56`, `:85`, `011:20` | Ένα RT δεν σβήνεται ποτέ hard. Η «διαγραφή» του γίνεται `status='cancelled'` + `deleted_at` |
| Έσοδο RT: ζωντανή όψη = κείμενο του 057 (034 + απόθεμα), X = 650/850 στο `ct_settings` | `057_stock_lots.sql:829-910`, `001:14-19` | Αντικαθίσταται με pre-flight md5 του **ζωντανού** κειμένου (Φ3) |
| Ο φρουρός «παραδόθηκε = πέρασε η ημερομηνία» ορίζεται μία φορά | `core/orders-common.js:95-99`, χρήση `modules/weekly_natl.js:643` | Ο ίδιος κανόνας ορίζεται μία φορά και σε SQL (`v_piece_state`) |
| Οι παλέτες έχουν πρότυπο RESTRICT/αντιλογισμό. Ο feeder ζει στον browser | `003_pallets_schema.sql:12-48`, `core/pallet-feed.js:59-160` | `pl_movements.piece_leg_id` + feeder μέσα στις `plan_*` (Φ3) |
| Οι εγγραφές NL/GL/CL από τον browser | `orders_natl.js:396, 434, 460, 1579, 1584` · `orders_intl.js:1946, 1951, 2227, 2231` · `core/order-sync.js:160, 174, 229, 231` · 16 `atSafePatch(NAT_LOADS…)` στο `weekly_natl.js` (π.χ. `:1532, :2673, :3023`) | Παγώνουν για ημέρα εκτέλεσης ≥ W (Φ5). Οι γραμμές του brainstorming (383/421/447/1571) έχουν μετακινηθεί από τότε |
| Τα πλακίδια ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ του Weekly Διεθνών διαβάζουν `NAT_LOADS` κατά `Source Order` | `modules/weekly_intl.js:710-741` (`nlBySrc`, `nlState`), ανάγνωση `weekly_intl_v2.js:279-291` (`_carrierOf`), `:1184-1188` (`natDone`) | Από W διαβάζουν και `/plan/vs-state` (Φ5) |
| Το DKV ταιριάζει RT κατά φορτηγό + **ημέρα** | `worker/src/import-rules.mjs:384-405` (`dateOverlaps`) | Με 2–3 κύκλους/εβδομάδα, Τετ πρωί τελειώνει ένας και Τετ απόγευμα αρχίζει άλλος: δύο υποψήφιοι την ίδια μέρα. Θέλει `start_at/end_at` (Φ3) |
| Η διαγραφή παραγγελίας: RPC `delete_order_cascade` + trigger 023 | `index.js:3367-3400`, `023_soft_delete_unlink.sql:3-22` | Οι αποστολές γέφυρας ακολουθούν το `orders.deleted_at` με trigger (Φ5) |
| Η «Επαναφορά» του browser ξαναδημιουργεί εγγραφή, δεν αναιρεί το `deleted_at` | `core/api.js:1360-1448` (`atCreate` στο `:1444`) | Το 7ήμερο restore του v5 = `plan_restore` (ίδια id, ίδιες ημερομηνίες) |
| Οι στάσεις της διεθνούς ταυτίζονται **θεσιακά** `(Stop Type, Stop Number)` | `core/stops-helpers.js:51-97` | Αν αλλάξει η σειρά των παραδόσεων στη διεθνή φόρμα, η ίδια `order_stops.id` αλλάζει τόπο. Μια αποστολή γέφυρας που διαβάζει από αυτήν θα «μετακόμιζε» σιωπηλά. Χρειάζεται φρουρός (Φ5, παγίδα Π2) |
| Καταμέτρηση triggers στον ελεγκτή (B-54) | `047b_monitoring_seed.sql:179` | Κάθε νέα migration ενημερώνει τον καθρέφτη B-54 στην ίδια παράδοση |

**Δύο αποκλίσεις που βρέθηκαν (εκτός σχεδίου, για ενημέρωση):**
1. Τα `057`, `060` και `069` είναι **εκτελεσμένα**: `docs/DECISION_LOG.md`, εγγραφές 5/10, 6/10 και 12/10. Τα αρχεία τους όμως μένουν στο `drafts/` με κεφαλίδα «DRAFT — NOT EXECUTED» (`drafts/057_stock_lots.sql:1`, `drafts/060_local_relay.sql:4`). Αυτό αντιβαίνει στον κανόνα 5 του `CLAUDE.md`. Συνέπεια για το v5: κάθε pre-flight md5 διαβάζεται από την **παραγωγή** (SELECT) και όχι από αρχείο.
2. Η επόμενη ελεύθερη αρίθμηση είναι **071** (το 070 είναι draft της ValueDriven).

---

## 1. Κανόνες κατασκευής (ισχύουν σε όλες τις φάσεις)

1. **Η βάση έχει τον κανόνα, ο Worker μεταφράζει, η οθόνη δείχνει.** Κάθε εγγραφή του v5 γίνεται με συνάρτηση `plan_*(…, p_actor text)`, `SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` μόνο για `service_role`, κατά το πρότυπο του `dl_import` (`011:224-258`). Κάθε άρνηση: `RAISE … USING ERRCODE='23514', HINT='plan:<code>'`. Κάθε αλλαγή γράφει `audit_log`, όπως το `rt_sync_audit` (`013:41-45`), με actor τον χρήστη και όχι «trigger».
2. **Ό,τι γεννιέται, γεννιέται κλειστό.** `REVOKE ALL … FROM public, anon, authenticated`, RLS χωρίς πολιτικές, `SELECT` για `tms_reader`/`tms_check_runner` μόνο σε όψεις χωρίς χρήματα (πρότυπο `057:1662-1691`).
3. **Μία πράξη = μία συνάρτηση = μία συναλλαγή.** Μία groupage φόρμα γράφει N παραγγελίες, N+ αποστολές, κομμάτια και (προαιρετικά) κινήσεις σε ένα `plan_orders_create`. Η αλυσίδα δεν σπάει στη μέση όπως σήμερα το `_natlWriteGroupageChain` (`orders_natl.js:359-460`).
4. **Οι καταστροφικές πράξεις έχουν δύο βήματα** (διαγραφή, Καθαρισμός, Μεταφορά σε…, διάσπαση με κινήσεις). Πρώτα `p_dry_run=true` → `jsonb` συνεπειών: παραγγελίες που τιμολογήθηκαν, γραμμές κόστους/DKV, γραμμές μισθοδοσίας με ποσά ή σε κλεισμένη περίοδο, κινήσεις παλετών confirmed, «το δρομολόγιο θα σβηστεί». Η λίστα έχει και `confirm_token` = md5 των συνεπειών. Μετά η κλήση με το token. Αν άλλαξε κάτι στο μεταξύ, `plan:stale_confirm` (owner 20/10 §Γ: λίστα παραστατικών + επιβεβαίωση).
5. **Τίποτα υπολογισμένο δεν αποθηκεύεται**, με μία εξαίρεση: τα `ct_round_trips.start_at/end_at/date_start/date_end` του `model=2`, που τα γράφει **μόνο** η βάση από τις `rt_stops`. Τα χρειάζονται η μισθοδοσία (`011:184, 206-207`), το DKV (`import-rules.mjs:403`) και η φθορά (`001:135`).
6. **Κάθε migration = ένα DO block, ASCII μόνο**, με τα συνοδευτικά που ήδη ξέρουμε από 060/069/070: `_dryrun` (παράγεται από `drafts/tools/build-07x-dryrun.mjs`), `_verify` (μόνο SELECT), `_test` (κανόνες σε PGlite, τελειώνει με σκόπιμο σφάλμα ώστε να μην κρατηθεί τίποτα), `_rollback`, και `tests/sql-07x-drafts.test.js` (ASCII, ένα DO, αλυσίδα md5, όπως το `tests/sql-069-drafts.test.js`). Εκτέλεση από τον owner μετά τις 15:00, με ρητό «ναι» στη συνομιλία.
7. **Μία αλυσίδα Worker** για όλο το v5 (branch `deploy/worker-plan`): Φ2 → Φ3 → Φ5, η καθεμία rebased στην προηγούμενη. Μετά το πρώτο deploy, το σημάδι λειτουργίας `var PLAN_PERMS = {` μπαίνει στον φρουρό του `CLAUDE.md:146-152`.
8. **Οθόνες πίσω από διακόπτη** (`FEATURES.WN_V5` στο `config.js`), όπως το `WI_V2` (DECISION_LOG 11/10: «ανέβηκε ΚΛΕΙΣΤΟ», μετά «ΑΝΟΙΧΤΟ ΓΙΑ ΟΛΟΥΣ»).

---

## Φ0 · Αποφάσεις, μετρήσεις πριν, DECISION_LOG (S · εμείς + owner)

**Στόχος:** καμία γραμμή κώδικα πριν κλείσουν οι 10 ανοιχτές αποφάσεις (§ τέλος) και πριν μετρηθεί η αφετηρία.

- **DECISION_LOG:** μία εγγραφή «Εθνικά v5: μοντέλο» με τις αποφάσεις 18–21/10 (επιλογή / εναλλακτικές / απόδειξη / ποιος), συν μία ανά ανοιχτή απόφαση όταν κλείσει. Το `CLAUDE.md` «Sync chain» (`CLAUDE.md:409-422`) αποκτά σημείωση «≥ W: δεν ισχύει για εθνικά». Ο κανόνας «GL ποτέ delete» μένει αυτούσιος.
- **Μετρήσεις (μόνο SELECT, από τον owner ή με ανάγνωση):**
  - `select extname from pg_extension where extname='btree_gist'`: χρειάζεται για το `EXCLUDE` με `truck_id WITH =`. Αν λείπει, το `CREATE EXTENSION` είναι αλλαγή βάσης με έγκριση.
  - md5 των αντικειμένων που θα αγγίξουμε: `ct_v_rt_revenue`, `ct_v_rt_costs`, `ct_v_rt_pnl`, `dl_v_rt_route`, `rt_status_guard()`, `rt_auto_close(bigint)`, `rt_sync_legs()`, `rt_sync_national_load()`, `rt_create_from_order()`, `rt_merge(bigint,bigint,text)`.
  - Πόσα ζωντανά NL/GL/CL έχουν ημέρα εκτέλεσης ≥ υποψήφιο W. Αυτό είναι το μέγεθος της συνύπαρξης.
  - B-54 (triggers) σήμερα. Τα ονόματα των ελέγχων B-xx που είναι ελεύθερα (B-77 πάρθηκε από το 066).
- **Συντονισμός:** η ValueDriven φέρνει backend, tests και CI στο repo (`docs/SESSION.md`, «Now»). Αποφασίζεται ποιος κρατά την αλυσίδα Worker (κανόνας 3: ένα θέμα, ένας κάτοχος).
- **Αποδοχή:** 10/10 αποφάσεις στο DECISION_LOG. Πίνακας μετρήσεων στο `docs/sessions/`.
- **Αν σπάσει:** δεν υπάρχει τίποτα να σπάσει. Ο κίνδυνος είναι να αρχίσει η Φ1 με ανοιχτή απόφαση. Αντίμετρο: η Φ1 αναφέρει στην κεφαλίδα της τα ids των αποφάσεων.

---

## Φ1 · Σχήμα κλειστό, 0 γραμμές (`071_plan_schema`) (L · εμείς γράφουμε, η ValueDriven κάνει δεύτερο έλεγχο)

**Στόχος:** όλα τα αντικείμενα υπάρχουν, κανείς δεν τα βλέπει, και κάθε σημερινό νούμερο μένει ίδιο.

### DB (περίγραμμα DDL)
```sql
-- 0. pre-flight: md5 of every replaced object = Φ0 values; btree_gist present; B-54 = expected
-- 1. config (one row; a Saturday, like 016 orders_plan_week_start_saturday, 016:15-16)
create table plan_config (
  id boolean primary key default true check (id),
  cutover_week date check (cutover_week is null or extract(dow from cutover_week) = 6)  -- NULL until Φ5
);
-- 2. hub
alter table locations add column is_hub boolean not null default false;
create unique index locations_one_hub on locations (is_hub) where is_hub;   -- Φ1: exactly one hub
-- set where legacy_id = 'recJucKOhC1zh4IP3' (config.js:256 VEROIA_LOC)
-- 3. round trip = cycle
alter table ct_round_trips
  add column model smallint not null default 1 check (model in (1,2)),
  add column start_at timestamptz, add column end_at timestamptz,
  add column partner_rate numeric(10,2),
  add column deleted_at timestamptz, add column deleted_reason text, add column deleted_by text,
  add constraint rt_v2_status   check (model = 1 or status in ('planned','cancelled')),
  add constraint rt_v2_window   check (model = 1 or (start_at is not null and end_at > start_at)),
  add constraint rt_partner_rate check (partner_rate is null or trip_type = 'PARTNER'),   -- Β11α
  add constraint rt_deleted_pair check ((deleted_at is null) = (deleted_reason is null)
                                     and (deleted_at is null or status = 'cancelled')),
  add constraint rt_v2_truck_once exclude using gist
      (truck_id with =, tstzrange(start_at, end_at, '[)') with &&)
      where (model = 2 and trip_type = 'OWNED' and status <> 'cancelled'),
  add constraint rt_v2_driver_once exclude using gist
      (driver_id with =, tstzrange(start_at, end_at, '[)') with &&)
      where (model = 2 and trip_type = 'OWNED' and driver_id is not null and status <> 'cancelled');
-- 4. shipments (one per A->B pair; commercial parent XOR)
create table shipments (
  id bigint generated always as identity primary key,
  order_id      bigint references orders(id)          on delete restrict,
  nat_order_id  bigint references national_orders(id) on delete restrict,
  order_stop_id bigint references order_stops(id)     on delete restrict,   -- VS bridge only
  origin_location_id bigint references locations(id) on delete restrict,
  dest_location_id   bigint references locations(id) on delete restrict,
  pallets numeric(6,1), qty_unit text check (qty_unit in ('PALLET','CRATE')),
  temperature_c numeric(4,1), pallet_exchange boolean,
  load_from timestamptz, load_to timestamptz, deliver_from timestamptz, deliver_to timestamptz,
  created_at timestamptz not null default now(), created_by text not null,
  deleted_at timestamptz, deleted_reason text, deleted_by text,
  constraint shipments_one_parent  check (num_nonnulls(order_id, nat_order_id) = 1),
  constraint shipments_bridge_intl check (order_stop_id is null or order_id is not null),
  -- bridge rows copy NOTHING: place/pallets/day are read from order_stops via v_shipments
  constraint shipments_shape check ((order_stop_id is null) =
      (origin_location_id is not null and dest_location_id is not null and pallets is not null)),
  constraint shipments_bridge_bare check (order_stop_id is null or
      (origin_location_id is null and dest_location_id is null and pallets is null
       and load_from is null and deliver_from is null)),
  constraint shipments_pallets check (pallets is null or pallets > 0),
  constraint shipments_win check (load_from <= load_to and deliver_from <= deliver_to and load_from <= deliver_to),
  constraint shipments_ends check (origin_location_id is distinct from dest_location_id or order_stop_id is not null),
  constraint shipments_del_pair check ((deleted_at is null) = (deleted_reason is null))
);
create unique index shipments_bridge_once on shipments (order_stop_id)
  where order_stop_id is not null and deleted_at is null;
-- 5. pieces
create table shipment_pieces (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references shipments(id) on delete restrict,
  parent_piece_id bigint references shipment_pieces(id) on delete restrict,
  pallets numeric(6,1) not null check (pallets > 0),
  leave_by date,
  split_at timestamptz, split_by text,
  deleted_at timestamptz, deleted_reason text, deleted_by text,
  constraint pieces_split_pair check ((split_at is null) = (split_by is null))
);
-- 6. stops of a cycle (window per stop: owner #12 «από–έως παντού»)
create table rt_stops (
  id bigint generated always as identity primary key,
  rt_id bigint not null references ct_round_trips(id) on delete restrict,
  seq smallint not null check (seq > 0),
  location_id bigint not null references locations(id) on delete restrict,
  side text not null check (side in ('KATHODOS','ANODOS')),
  planned_from timestamptz not null, planned_to timestamptz not null,
  loader text,                                   -- «ποιος φορτώνει» off-hub (Α10, open decision 8)
  deleted_at timestamptz, deleted_reason text, deleted_by text,
  constraint rt_stops_win check (planned_to >= planned_from),
  constraint rt_stops_rt_id unique (rt_id, id)   -- target of the composite FKs
);
-- 7. piece legs (internal; «κίνηση κομματιού»)
create table piece_legs (
  id bigint generated always as identity primary key,
  piece_id bigint not null references shipment_pieces(id) on delete restrict,
  leg_no smallint not null check (leg_no > 0),
  rt_id bigint not null,
  pickup_stop_id bigint not null, drop_stop_id bigint not null,
  deleted_at timestamptz, deleted_reason text, deleted_by text,
  foreign key (rt_id, pickup_stop_id) references rt_stops (rt_id, id) on delete restrict,
  foreign key (rt_id, drop_stop_id)   references rt_stops (rt_id, id) on delete restrict,
  constraint piece_legs_two_stops check (pickup_stop_id <> drop_stop_id)
);
create unique index piece_legs_live_no on piece_legs (piece_id, leg_no) where deleted_at is null;
-- 8. pallets
alter table pl_movements add column piece_leg_id bigint references piece_legs(id) on delete restrict;
create unique index pl_mov_leg_once on pl_movements (piece_leg_id, event_type)
  where piece_leg_id is not null and status <> 'reversed';      -- Β7: one writer
```

**Constraint triggers (DEFERRABLE INITIALLY DEFERRED, ελέγχουν στο commit):**
- `plan_chk_pieces_sum` σε `shipment_pieces`, `shipments` και `order_stops(pallets)`: Σ ζωντανών φύλλων = παλέτες αποστολής (ή `order_stops.pallets` για τη γέφυρα), και Σ παιδιών = γονέας.
- `plan_chk_stop_seq` σε `rt_stops`: μοναδικό `seq` ανά `rt_id` στις ζωντανές στάσεις. Είναι trigger και όχι `UNIQUE`, γιατί το soft delete δεν επιτρέπει partial deferrable unique. Το `planned_from` δεν μειώνεται όσο αυξάνει το `seq`.
- `plan_chk_leg` σε `piece_legs`/`rt_stops`:
  - φόρτωση πριν από εκφόρτωση (`seq`)
  - RT `model=2` και όχι `cancelled`
  - κομμάτι όχι σπασμένο (χωρίς ζωντανά παιδιά) και όχι σβησμένο
  - αλυσίδα: η κίνηση n φορτώνει εκεί που ξεφόρτωσε η n−1, ή στην αφετηρία της αποστολής, ή στον κόμβο όταν η αφετηρία είναι διεθνής (γέφυρα εισαγωγής)
  - καμία επικάλυψη χρόνου ανάμεσα σε δύο ζωντανές κινήσεις του ίδιου κομματιού
- `plan_chk_hub` σε `shipments`: ο κόμβος δεν είναι ποτέ `origin`/`dest` δικής της αποστολής (Ρ15).

**Triggers V1 που μαθαίνουν το `model`** (με αντικατάσταση σε md5-guarded κείμενο):
- `ct_rt_legs_v2_guard` (νέο, BEFORE INSERT/UPDATE στο `ct_rt_legs`): order link σε RT `model=2` → `plan:v1_link_on_v2`. Κόβει το `POST /costs/rt` (`index.js:3608`), το 034 και το `rt_merge` (037) πριν φτάσουν σε κύκλο v5.
- `rt_status_guard` (`046:304-330`) και `rt_auto_close` (`046:141`): `RETURN` για `model=2`. Το CHECK `rt_v2_status` αρνείται ήδη `closed`. Ο φρουρός απλώς δεν μετρά σκέλη που δεν υπάρχουν.
- `rt_recompute` (`013:48-82`): `RETURN` για `model=2`. Αλλιώς θα ακύρωνε κάθε κύκλο v5 ως «0 σκέλη» (`013:65-73`).
- `rt_sync_to_orders` (`013:159-192`) και `rt_sync_to_national_loads` (034): για `model=2` δεν έχουν παιδιά, άρα δεν κάνουν τίποτα. Δεν αλλάζουν.
- `dl_sync_from_rt` (`011:153-221`): **δεν αλλάζει**.
- `rt_v2_window_sync` (νέο, AFTER INSERT/UPDATE/DELETE σε `rt_stops`): `start_at`/`end_at` = min/max των ζωντανών στάσεων. `date_start`/`date_end` = `(… at time zone 'Europe/Athens')::date`. Το UPDATE του RT πυροδοτεί το 011, και ο οδηγός και οι ημέρες ακολουθούν (`011:202-215`).

**Όψεις (security_invoker, κλειστές):**
- `v_shipments`: τα δικά της πεδία, ή για τη γέφυρα από `order_stops` + `orders`:
  - εισαγωγή VS: αφετηρία = πρώτη φόρτωση της διεθνούς, προορισμός = η ελληνική `Unloading` στάση, παράθυρο = `order_stops.datetime`
  - εξαγωγή VS: αφετηρία = η ελληνική `Loading` στάση, προορισμός = τελευταία παράδοση εξωτερικού
  - παλέτες, θερμοκρασία και PE από τη στάση και την παραγγελία (`index.js:1697-1726` για τα ονόματα στηλών)
- `v_piece_state`: ανά ζωντανό φύλλο:
  - `at_hub` (η τελευταία ζωντανή κίνηση ξεφορτώνει στον κόμβο, ή γέφυρα εισαγωγής χωρίς κίνηση)
  - `waiting` (καμία ζωντανή κίνηση που να τελειώνει στο εθνικό του τέλος)
  - `national_end_at` (το `planned_to` της στάσης εκφόρτωσης στο εθνικό τέλος: προορισμός ή, για εξαγωγή VS, κόμβος)
  - `executed` = `national_end_at < now()` και όχι σβησμένο (ο κανόνας του `orders-common.js:95-99` σε SQL, με το «τέλος παραθύρου» της απόφασης 2)
  - `leave_by`, `overdue`
- `v_rt_stop_state`:
  - στάση: `executed` = `planned_to < now()`
  - πλευρά: `done` = όλες οι στάσεις της executed **και** το RT έχει φορτηγό ή συνεργάτη **και** κανένα κομμάτι της πλευράς δεν θέλει δουλειά
  - κύκλος: `done` = όλες οι πλευρές done
  - Αυτό οδηγεί το σβήσιμο 40%: «ποτέ χωρίς φορτηγό ή με ανοιχτή δουλειά».
- `v_hub_bucket`: τα κομμάτια `at_hub ∧ waiting`, ομαδοποιημένα ανά εισερχόμενο RT/διεθνή παραγγελία, με `leave_by`/`overdue`.
- `v_national_order_state`: παραγγελία `executed` = **όλα** τα φύλλα executed (Β4).
- `v_vs_state`: ανά διεθνή VS παραγγελία: μεταφορέας ή μεταφορείς των εθνικών κινήσεων (πινακίδα, οδηγός ή συνεργάτης) και `all_executed`. Τη διαβάζει μόνο το εσωτερικό Weekly Διεθνών, ποτέ ό,τι πάει σε πελάτη (§Φ4 «Βέροια»).

### Worker / front
Τίποτα. Οι πίνακες δεν είναι στο `TABLES`, άρα καμία οθόνη δεν τους βλέπει.

### Δεδομένα / συνύπαρξη
Όλα τα υπάρχοντα RT παίρνουν `model=1` από το DEFAULT. Κανένα v5 RT.

### Tests
- `071_plan_schema_test.sql` σε PGlite με το πλήρες public schema (όπως 034/069), ≥ 40 περιπτώσεις. Κάθε CHECK, FK RESTRICT, EXCLUDE (ίδιο φορτηγό Τετ 06:00–Τετ 14:00 → ΟΚ· 05:00–07:00 → άρνηση), το άθροισμα που ελέγχεται στο commit, και η αλυσίδα κινήσεων.
- `tests/sql-071-drafts.test.js`.

### Αποδοχή (ο πίνακας)
- `shipments`, `shipment_pieces`, `rt_stops`, `piece_legs` = **0**.
- `ct_round_trips where model=2` = **0**. `model=1` = σύνολο RT πριν.
- Snapshot πριν = μετά, ως το σεντ, όπως το 034 (`034:149-164`): κάθε RT (όχημα, παράθυρο, status, revenue, όλες οι στήλες κόστους) και κάθε `dl_entries`.
- `locations where is_hub` = **1**. B-54 = πριν + νέα triggers (και ο καθρέφτης 047b ενημερωμένος).
- `has_table_privilege('anon', 'shipments', 'select')` = false σε όλους τους νέους πίνακες.

### Rollback
`071_plan_schema_rollback.sql`:
- αρνείται αν κάποιος νέος πίνακας έχει γραμμές
- επαναφέρει τα 4 κείμενα συναρτήσεων με md5
- `DROP` όψεων και πινάκων
- `ALTER TABLE … DROP COLUMN` σε `ct_round_trips`, `locations` και `pl_movements`

### Αν σπάσει, πώς θα το μάθουμε
Το DO block ρίχνει τα πάντα ή τίποτα. Ο B-54 αλλάζει αριθμό και ο ελεγκτής το φωνάζει ωριαία. Το snapshot μέσα στο block αρνείται κάθε διαφορά σεντ.

---

## Φ2 · `plan_*` + Worker `/plan/*` χωρίς οθόνες (`072_plan_functions` · L · ValueDriven ή εμείς, ένας κάτοχος)

### DB: συναρτήσεις (όλες με `p_actor`, ένα audit_log ανά αλλαγή)
| Συνάρτηση | Κάνει | Κύριες αρνήσεις (`plan:`) |
|---|---|---|
| `plan_orders_create(p jsonb)` | N `national_orders` + αποστολές (μία ανά ζεύγος σημείων) + 1 κομμάτι η καθεμία. Προαιρετικά `rt_id`+`side`: κινήσεις στην ίδια πλευρά (groupage από τη φόρμα, «+» σε κάθε πλευρά) | `no_client`, `no_window`, `hub_endpoint` |
| `plan_order_update(id, p)` | εμπορικά πεδία + αποστολές που **δεν** είναι γέφυρα | `vs_locked` (κάθε αλλαγή σε γέφυρα), `split_piece` (αλλαγή παλετών σε σπασμένο) |
| `plan_rt_create(p)` | κύκλος `model=2` με φορτηγό/οδηγό ή συνεργάτη + `partner_rate` + πρώτες στάσεις (H Δευ 18:00 … H Τετ 07:00) | `truck_busy` (το EXCLUDE, με τον κωδικό του άλλου RT στο μήνυμα: κίνδυνος 5 του §6 της αρχιτεκτονικής), `driver_busy`, `partner_rate_on_owned` |
| `plan_rt_update(id, p, dry_run)` | όχημα, οδηγός, συνεργάτης, κόμιστρο, παράθυρα στάσεων. Το dry-run δείχνει τι παθαίνουν η ΑΝΟΔΟΣ, το τέλος κύκλου και ο επόμενος κύκλος (Α6) | `truck_busy`, `window_order` |
| `plan_put_pieces(rt_id, side, pieces[], stops)` | «+» / ανάθεση: στάσεις (νέες ή υπάρχουσες) + κινήσεις + pending κινήσεις παλετών (Φ3) | `chain`, `seq`, `piece_split`, `piece_busy`, `rt_cancelled`, `vs_hub_day` (προειδοποίηση, όχι άρνηση: Α7) |
| `plan_remove_leg(leg_id, dry_run)` | × στη στάση: soft delete της κίνησης, το κομμάτι ξανά σε αναμονή. Αν φύγει η τελευταία κίνηση, το RT σβήνεται (απόφαση 19/10) και το dry-run το λέει | — |
| `plan_move_side(rt_id, side, target, dry_run)` | «Μεταφορά σε…» (βλάβη): η πλευρά (στάσεις + κινήσεις) πάει σε άλλο ή νέο RT. Το αρχικό RT κρατά ό,τι έγινε. Τα `end_at` υπολογίζονται ξανά και στα δύο | `truck_busy`, `same_rt` |
| `plan_rt_clear(rt_id, dry_run, token)` | «Καθαρισμός ανάθεσης» (μόνο διόρθωση): όχημα/οδηγός/κόμιστρο = NULL. Η 011 σβήνει ή επισημαίνει τη γραμμή (`011:166-178`) | `stale_confirm` |
| `plan_split_piece(piece_id, parts[])` | μόνο για κομμάτι `at_hub` (Πίνακας Βέροιας): γονέας `split_at`, παιδιά με Σ = γονέας | `not_at_hub`, `parts_sum`, `piece_planned` |
| `plan_vs_set_day(order_stop_id, day)` | η **μόνη** αλλαγή που κάνει ο εθνικών σε VS: γράφει την ημέρα στη διεθνή παραγγελία (μία πηγή, owner 20/10 §Γ Β3). Τη μετακίνηση cross-dock/ράμπας την κάνουν ήδη 028/069 | `vs_not_bridge` |
| `plan_delete(entity, id, dry_run, token)` | παραγγελία ή RT = «δεν έγινε». Soft delete σε όλη την αλυσίδα (κινήσεις, κομμάτια, αποστολές). RT → `cancelled` + `deleted_*`. Λίστα: invoiced, `ct_cost_lines` (DKV/καύσιμα), `dl_entries` με ποσά ή σε κλεισμένη περίοδο, κινήσεις παλετών confirmed | `stale_confirm` (κανένας φρουρός ημερομηνίας: owner 20/10) |
| `plan_restore(entity, id)` | ≤ 7 ημέρες: `deleted_at = NULL` σε όλη την αλυσίδα που σβήστηκε **με την ίδια πράξη** (κλειδί `deleted_batch uuid`). Ίδια ids, ίδιες ημερομηνίες (Β10). Η 011 ξαναγράφει τη γραμμή μισθοδοσίας μόνη της (`011:181-186`) | `restore_expired`, `restore_conflict` (π.χ. το φορτηγό πιάστηκε στο μεταξύ → EXCLUDE) |

> Χρειάζεται `deleted_batch uuid` σε κάθε νέο πίνακα και στο `ct_round_trips`, ώστε το restore να ξέρει ακριβώς τι σβήστηκε μαζί. Αυτό προστίθεται στο DDL της Φ1.

### Worker
- **Δρομολόγηση:** `if (url.pathname.startsWith("/plan/")) return handlePlan(...)`, δίπλα στο `/costs/` (`index.js:5802`).
- **`PLAN_PERMS`** (default deny, σχήμα `COSTS_PERMS` `:3498`). Ελέγχεται με `planCan(role, resource, method)`.

| resource | owner | dispatcher | management | accountant | warehouse |
|---|---|---|---|---|---|
| `board`, `bucket`, `order` (GET) | ✓ | ✓ | ✓ | ✓ | ✓ (χωρίς `Price`) |
| `vs-state` (GET) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `orders` (POST/PATCH) | ✓ | ✓ | — | — | — |
| `rt` (POST/PATCH), `rt/clear`, `rt/move-side` | ✓ | ✓ | — | — | — |
| `legs` (POST/DELETE), `pieces/split`, `vs/day` | ✓ | ✓ | — | — | — |
| `delete`, `restore` | ✓ | ✓ | — | — | — |

  - Κανένα `/plan/*` δεν επιστρέφει X, έσοδο ή κόστος. Το P&L μένει στο `/costs/pnl` (owner, `:3513`), οπότε ισχύει η κλειδωμένη απόφαση «dispatcher δεν βλέπει P&L». Το `partner_rate` επιστρέφεται μόνο σε owner/dispatcher, όπως το `Partner Rate` σήμερα (R-04, `index.js:614-624`).
  - Το restore μετά τις 7 ημέρες: απόφαση 7.
- **Χαρτογράφος:**
  - `stockRuleError` + κλάδος `hint.startsWith("plan:")` → `{type:"PLAN_RULE", code, message: PLAN_RULE_TEXT[code] ?? «…(code)»}`.
  - Τα CHECK/EXCLUDE με όνομα `rt_v2_*`, `shipments_*`, `pieces_*`, `rt_stops_*`, `piece_legs_*`, `pl_mov_leg_once` → `PLAN_CHECK_TEXT`.
  - Το 23P01 (exclusion) → `truck_busy`/`driver_busy` κατά όνομα constraint.
- **Το dry-run επιστρέφει πάντα 200** με `{consequences, confirm_token}`. Η εκτέλεση χωρίς token σε πράξη που το θέλει → 428.
- **Παλιές διαδρομές που φτάνουν σε v5 RT:**
  - `PATCH /costs/rt/:id` (`:3832`) σε `model=2` → 409 «ο κύκλος αλλάζει από το Εβδομαδιαίο Εθνικών». Αλλιώς το CHECK θα έπεφτε στο γενικό «Costs request failed» (το πρόβλημα που περιγράφει το `046`, σχόλιο πριν το `:304`).
  - `DELETE /costs/rt/:id/legs` (`:3703`): δεν αφορά το `model=2`, αφού δεν υπάρχουν order links.
- **Φρουρός TABLES:** `worker/test/plan-tables-guard.test.mjs` αποτυγχάνει αν οποιοδήποτε από `shipments|shipment_pieces|rt_stops|piece_legs|plan_config` εμφανιστεί ως `pg:` στο `TABLES`, ή αν ρόλος έχει `"*"` με εγγραφή.

### Tests
- `072_plan_functions_test.sql` (PGlite): ≥ 80 περιπτώσεις. Μία ανά `plan:` κωδικό, συν τα σενάρια της εβδομάδας 3–9/10 του §5 της αρχιτεκτονικής, ξαναπαιγμένα ως κλήσεις (ΕRT-1/2/3: 19/32/31 παλέτες).
- `worker/test/plan-contract.test.mjs`: διαβάζει το `072_*.sql`, και αποτυγχάνει σε κωδικό ή constraint χωρίς ελληνικό κείμενο, ή σε κείμενο χωρίς αντίστοιχο. Πρότυπο: `worker/test/local-relay-contract.test.mjs`.
- `worker/test/plan-perms.test.mjs`: πίνακας 5 ρόλοι × resource × μέθοδος. Κάθε κελί που δεν είναι ✓ = 403.

### Αποδοχή
- Νέοι πίνακες = **0** στην παραγωγή μετά το deploy. Καμία δοκιμαστική εγγραφή (Ε2 της 11/10).
- `GET /plan/board?week=<W>` = 200 με κενούς πίνακες για owner, 403 χωρίς token. `POST /plan/orders` ως management = 403.
- Φρουρός deploy: τα 3 + `tblStockLots: {` + `"Move Kind": "move_kind"` + νέο `var PLAN_PERMS = {`. Secrets 3/3.

### Rollback
`wrangler rollback <προηγούμενη έκδοση>`. Το `072_rollback` κάνει `DROP FUNCTION plan_*` και αρνείται αν υπάρχουν γραμμές.

### Αν σπάσει
- Οι αρνήσεις ακούγονται ως 422 με κωδικό.
- Άγνωστος κωδικός → 422 που τον ονομάζει, ποτέ σιωπηλό 500.
- Ένα 500 στο `/plan/*` γράφεται στο `app_errors` από το front (Φ4) και ο ελεγκτής το μετρά.

---

## Φ3 · Χρήματα, μισθοδοσία, παλέτες, DKV (`073_plan_money` + Worker στην ίδια αλυσίδα · M · εμείς)

### DB
1. **`ct_v_rt_revenue`** (md5 του ζωντανού κειμένου 057, `057:829-910`). Μένει ίδιο για κάθε RT/παραγγελία χωρίς κομμάτια v5. Προσθέτει:
   - **RT `model=2`:** για κάθε ζωντανό φύλλο, στην **πρώτη** εθνική κίνηση του (μετρά μία φορά):
     - γέφυρα: `X × piece.pallets / Σ παλέτες κόμβου της παραγγελίας`, με παρονομαστή μόνο `PALLET` (Β9). Το X επιλέγεται όπως στο 034 (`x_export` αν Export).
     - εθνική: `national_orders.price × piece.pallets / Σ παλέτες της παραγγελίας`, αν ισχύει η απόφαση 5.
   - **RT `model=1`:** για παραγγελίες με αποστολές γέφυρας, το «− X όταν `veroia_switch`» (`057:852-867`) αντικαθίσταται με «− Σ μεριδίων X των κομματιών που **μπήκαν** σε RT v5». Για παραγγελίες με ζωντανό Direct NL μένει αυτούσιο το 034/057 (αμοιβαία αποκλειστικότητα, Φ5).
   - Στήλη `revenue_natl` για το v5 → `revenue = revenue_intl + revenue_natl` μένει αληθές.
2. **`ct_v_rt_costs`:** `partner_planned` για `model=2` = `ct_round_trips.partner_rate` (ένα ανά δρομολόγιο). Σήμερα το διαβάζει από `partner_assignments`/`national_loads.partner_rate` (σχόλιο `034:57-58`). Οι στήλες μένουν ίδιες.
3. **`dl_v_rt_route`** (`012:17`): κλάδος UNION για `model=2` από `rt_stops`. ΚΑΘΟΔΟΣ = πρώτη/τελευταία στάση της πλευράς, ΑΝΟΔΟΣ το ίδιο, `+N στάσεις`. Αλλιώς η καρτέλα οδηγού δείχνει κύκλο χωρίς διαδρομή.
4. **Παλέτες (feeder μέσα στη βάση, αρχή 4):**
   - το `plan_put_pieces`/`plan_move_side`/`plan_remove_leg` γράφει, μετακινεί ή σβήνει **μόνο pending** `pl_movements` με `piece_leg_id`:
     - `LOADING` όταν η κίνηση φορτώνει στην αφετηρία της αποστολής και `pallet_exchange`
     - `DELIVERY` όταν ξεφορτώνει στον προορισμό
     - τίποτα στον κόμβο (αρχιτεκτονική §2, «Λοιπά»)
   - Confirmed κινήσεις: μόνο με δελτίο (Β7), ποτέ προσυμπληρωμένες. Στη διαγραφή μπαίνουν στη λίστα συνεπειών και αντιλογίζονται (`reversal_of`, `003:33`) μετά την επιβεβαίωση.
   - Ο feeder του browser `core/pallet-feed.js:59-160` **δεν** καλείται για εθνικές v5 (`plOnOrderSaved` με `source:'natl'` από το `order-sync.js:96-101`), ώστε να υπάρχει ένας συγγραφέας. Το `UNIQUE pl_mov_leg_once` κάνει το δεύτερο 422.
5. **Μισθοδοσία:** καμία αλλαγή στο 011. Τα ποσά μένουν NULL (`011:183`), εκτός αν η απόφαση 6 πει «230 € προσυμπληρωμένα».

### Worker
- **`matchRoundTrip`** (`import-rules.mjs:402-405`): για υποψήφια `model=2` με ώρα στη γραμμή DKV, χρησιμοποιεί `tstzrange(start_at, end_at)`. Χωρίς ώρα, δύο κύκλοι στην ίδια μέρα → `match:'review'` με τους δύο. Ποτέ τυχαία επιλογή.
- Το `none_reason:'no_rt_on_date'` με γνωστό φορτηγό γίνεται η ειδοποίηση «λείπει δρομολόγιο» (owner 20/10: όχι κατηγορία, ειδοποίηση).
- `GET /costs/rt` (`:3734`): για `model=2`, το «κλειστό» είναι `v_rt_cycle.ended` (`end_at < now()`), όχι `status`.

### Tests
- `073_plan_money_test.sql`. Η εβδομάδα 3–9/10 ως δεδομένα:
  - X ανά παραγγελία = 650 (ποτέ 492)
  - Σ εσόδων 6 RT = Σ τιμών 7 παραγγελιών
  - ΕRT-1 1.300 / ΕRT-2 820 / ΕRT-3 480 + Pn
  - διεθνή −2.600
- `worker/test/dkv-match-cycles.test.mjs`: Τετ 06:00 τέλος, Τετ 14:00 αρχή, καύσιμα 10:00 → `review`.

### Αποδοχή
- Snapshot όλων των RT πριν = μετά (δεν υπάρχει ακόμη v5 γραμμή).
- `dl_v_rt_route` γραμμές = πριν. `ct_v_rt_pnl` count = πριν.

### Rollback
`073_rollback`: τα 4 κείμενα όψεων πίσω με md5, `wrangler rollback` στην έκδοση της Φ2.

### Αν σπάσει
Νέοι έλεγχοι στο `monitoring.checks` (ονόματα ενδεικτικά B-78…):
- **B-78** X ανά VS παραγγελία ∉ {0, 650, 850} (P1)
- **B-79** Σ εσόδων RT εβδομάδας ≠ Σ τιμών παραγγελιών εβδομάδας (P2, ανοχή 0,01 €)
- **B-80** κίνηση παλετών `pending` σε κίνηση κομματιού σβησμένη (P2)
- **B-81** κόστος ή καύσιμα φορτηγού σε ημέρα χωρίς ζωντανό RT, ή σε RT `cancelled`/σβησμένο, δηλαδή «λείπει δρομολόγιο» (P2)

---

## Φ4 · Οθόνες πίσω από διακόπτη (L · εμείς)

### Τι χτίζεται (front)
- **`core/plan-api.js`:**
  - `planFetch(path, opts)`, όπως το `plFetch` (`core/pallet-feed.js:10`)
  - 422 → toast με το `error.message`. 5xx → `logError` + `app_errors`
  - **ποτέ** `{}` στη σιωπή: η απουσία ≠ 0 (παγίδα facade 2)
- **`modules/weekly_natl_v5.js`** (νέο αρχείο). Το `weekly_natl.js`, 3.193 γραμμές, μένει για εβδομάδες < W.
  - στήλες ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ ανά κύκλο, «+» σε κάθε πλευρά
  - παράθυρο ανάθεσης (#1 του 20/10), ελεύθερα φορτηγά, ένωση με υπάρχον
  - «Μεταφορά σε…», «Καθαρισμός» με λίστα συνεπειών
  - σβήσιμο 40% από `v_rt_stop_state`, ανά σημείο, σκέλος και κύκλο
  - αναζήτηση με `fhSearchNorm`/`fhSearchBlob` (`core/form-helpers.js:219-220`): σβήσιμο των άλλων γραμμών και κάρτα που «σηκώνεται» (DECISION_LOG 21/10)
- **Πίνακας Βέροιας:**
  - κουβάς (`v_hub_bucket`), απόθεμα με επιλογή ημέρας (#9)
  - διάσπαση **μόνο εδώ**: το «πόσες από» φεύγει από το «Από αναμονή» (#3)
- **Φόρμα εθνικής v5:**
  - μία φόρμα με N γραμμές: N παραγγελίες σε μία κλήση `plan_orders_create`
  - παράθυρα από–έως παντού (#12)
  - προειδοποίηση μεικτών θερμοκρασιών (#11)
  - «Διαγραφή» μόνο στην καρτέλα παραγγελίας (#4)
  - παράθυρο διαγραφής = λίστα παραστατικών + επιβεβαίωση (Figma frame g)
- **VS κάρτα (εθνικός):** μόνο ανάγνωση, εκτός από την «ημέρα» → `plan_vs_set_day`, με την ένδειξη «ενημερώνει τη διεθνή #…» (#7).
- **«Η Βέροια δεν φαίνεται στον πελάτη»** (Β12):
  - ό,τι πάει προς πελάτη για VS παραγγελία (μήνυμα, «Αντιγραφή πινακίδων» `core/utils.js:269-277`, `weekly_intl.js:4744`, `daily_ops.js:1081`) δεν διαβάζει ποτέ `v_vs_state`
  - στατικό τεστ κόβει κάθε αναφορά `vs-state` μέσα σε `print.html`/`copyPlates`/share helpers
- **Φύλλο οδηγού** (#15): μία γραμμή ανά στάση, με διεύθυνση, τηλέφωνο, reference/CMR (για VS το reference της διεθνούς) και παλέτες προς επιστροφή όπου PE.

### Αναγνώστες που πρέπει να μάθουν το v5 (αλλιώς δείχνουν σιωπηλά 0 για εβδομάδες ≥ W)
Μετρημένες αναφορές σε `TABLES.NAT_LOADS|GL_LINES|CONS_LOADS` ανά αρχείο:
- `orders_intl.js` 61 · `weekly_natl.js` 31 · `orders_natl.js` 30 · `core/order-sync.js` 13 · `daily_ramp.js` 4 · `locations.js` 2
- 1 το καθένα: `dashboard.js`, `performance.js`, `metrics_audit.js`, `orders_week_view.js`, `orders-common.js`, `stops-helpers.js`, `utils.js`, `weekly_intl.js`

Κάθε ένα από αυτά: είτε διαβάζει και `/plan/*` για ≥ W, είτε δηλώνει ρητά «εθνικά v5: εκτός» με ορατό σημάδι (αρχή 1). Τα σημαντικά:
- **Ράμπα Βέροιας** (`daily_ramp.js`): για ≥ W = όψη πάνω στις `rt_stops` του κόμβου (αρχιτεκτονική §3).
- **Τιμολόγηση εθνικών:** «παραδόθηκε» = `v_national_order_state.executed`, όχι ο τύπος του `orders-common.js:85`.
- **Παραγγελίες › Εβδομάδα v4:** μία γραμμή = ένα RT, άρα και οι κύκλοι v5.

### Tests
- **node:**
  - `tests/plan-dim.test.js`: κανόνες σβησίματος (στάση, πλευρά, κύκλος, «ποτέ χωρίς φορτηγό ή με ανοιχτή δουλειά»)
  - `tests/plan-api.test.js`: 422/5xx/απουσία
  - στατικό «καμία εγγραφή NL/GL/CL από `weekly_natl_v5.js`/φόρμα v5»
- **Playwright rigs** (πρότυπο `tests/critics/wi4-board-rig.js`, με ψεύτικες απαντήσεις `/plan/*`):
  - `wn5-board-rig.js`: εβδομάδα 3–9/10, «+», ανάθεση, Μεταφορά ΑΝΟΔΟΥ, σβήσιμο, αναζήτηση «Κοζάνη»
  - `wn5-form-rig.js`: groupage 3 πελατών = 1 αίτημα, 3 παραγγελίες
  - `wn5-delete-rig.js`: λίστα → token → εκτέλεση. Η αλλαγμένη λίστα → `stale_confirm`
  - `veroia-board-rig.js`: διάσπαση 26 → 12+14, άρνηση εκτός Βέροιας

### Αποδοχή
- Διακόπτης κλειστός στην παραγωγή.
- Rigs πράσινα, και με αποτυχία στο σκέτο main (απόδειξη ότι ελέγχουν κάτι).
- 0 σφάλματα κονσόλας.
- Στην παραγωγή: 0 εγγραφές σε νέους πίνακες ακόμη.

### Rollback
Revert των αρχείων + bump `?v=` και `SW_VERSION` (`CLAUDE.md:470-472`). Με τον διακόπτη κλειστό, τίποτα δεν φαίνεται.

### Αν σπάσει
- `app_errors` από το `planFetch` (μετρητής του ελεγκτή).
- Rig στο CI της ValueDriven όταν μπει.

---

## Φ5 · Γέφυρα VS + πάγωμα + συνύπαρξη (`074_plan_cutover` + Worker + front · M · εμείς, ο owner εκτελεί)

**Πότε:** την Παρασκευή πριν το Σάββατο W, μετά τις 15:00. Το SQL πρώτα, μετά ο Worker, μετά ο διακόπτης.

### DB
1. `update plan_config set cutover_week = W`. Τη διαβάζουν όλοι οι φρουροί. Ένας αριθμός, μία πηγή.
2. **Γέφυρα:** `plan_bridge_sync` AFTER INSERT/UPDATE σε `orders(veroia_switch, deleted_at, status)` και `order_stops(location_id, pallets, deleted_at, stop_type)`.
   - Για VS παραγγελία με ημέρα κόμβου (`cross_dock_date`) ≥ W: μία αποστολή γέφυρας + 1 κομμάτι ανά ελληνική στάση.
   - VS off ή στάση που σβήστηκε:
     - κομμάτια χωρίς κίνηση → soft delete
     - κομμάτια σε RT → `plan:piece_planned`
   - **Αυτή η άρνηση σπάει τη διεθνή αποθήκευση**, άρα ακούγεται ως 422 μέσω `stockRuleError` (`index.js:2991, 3296, 3347`). Ο owner το αποφασίζει (απόφαση 3).
3. **Αμοιβαία αποκλειστικότητα** (Φ1, φρουρός 3 της αρχιτεκτονικής): παραγγελία με ζωντανό Direct NL δεν παίρνει αποστολή γέφυρας, και αντίστροφα (`plan:legacy_nl`).
4. **Πάγωμα NL/GL/CL:** BEFORE **INSERT** στα `national_loads`, `groupage_lines` και `consolidated_loads`, με ημέρα εκτέλεσης ≥ W → `plan:frozen`. Επίσης άρνηση όταν η εθνική παραγγελία-πηγή έχει αποστολές.
   - **Παγίδα Π1: μόνο INSERT, όχι UPDATE ημερομηνίας.** Τα 028/030/069 μετακινούν ημερομηνίες NL όταν μετακινείται η διεθνής (`030:30-55`, DECISION_LOG 12/10). Ένα UPDATE-guard θα έριχνε τη **διεθνή** αποθήκευση μιας παλιάς VS παραγγελίας που μετακινείται μέσα στο W.
   - Αυτά τα «παλιά NL που πέρασαν το W» μετριούνται (B-82) και ο εθνικών τα κλείνει με το χέρι.
5. **Παγίδα Π2: θεσιακές στάσεις.** Η διεθνής φόρμα κρατά την ταυτότητα στάσης ως `(Stop Type, Stop Number)` (`stops-helpers.js:55-77`). Μια αλλαγή σειράς αλλάζει το `location_id` της ίδιας γραμμής.
   - Ο `plan_bridge_sync` αρνείται αλλαγή `location_id` σε στάση της οποίας το κομμάτι έχει ζωντανή κίνηση (`plan:bridge_moved`, «ρώτα τον εθνικών»).
   - Αλλαγή `pallets` σε στάση με **ένα** ασπαστό κομμάτι χωρίς κίνηση: το κομμάτι ακολουθεί.
   - Αλλιώς: `plan:bridge_split`.
6. **Το `ct_v_rt_revenue`** της Φ3 ενεργοποιεί τον κανόνα «X ανά κομμάτι» μόνο για παραγγελίες με αποστολές γέφυρας. Πριν το W δεν υπάρχει καμία.
7. Το `local_moves` με `move_kind='local'` (Weekly National) **παγώνει** για ημέρα ≥ W (`plan:frozen`). Τα T7 γίνονται εθνικές παραγγελίες σε RT (owner 18/10). Τα `relay_*` του 060 μένουν (αρχιτεκτονική §3).

### Worker
- `GET /plan/vs-state?order_ids=…`. Επιστρέφει `{oid: {carrier:{kind,text}, executed:boolean}}` ή «missing».

### Front
- **`_syncVeroiaSwitch`** (`orders_intl.js:1709`, NL στο `:1946-1951`): για ημέρα κόμβου ≥ W **δεν** γράφει NL. Το στάδιο «VS chain» γράφει «η βάση έφτιαξε τις αποστολές» μετά από ανάγνωση του `/plan/vs-state`. Το 422 `plan:frozen`, αν ποτέ φτάσει, φαίνεται ως «failed» και όχι ως ✓ (DECISION_LOG 12/10: «Θόρυβος στην εγγραφή του εθνικού»).
- **`core/order-sync.js`:** το `syncGLtoCLtoNL` (`:118-235`) σταματά για εθνικές με αποστολές. Το `plOnOrderSaved` (`:96-101`) δεν καλείται για v5.
- **`orders_natl.js`:**
  - νέες εθνικές με ημέρα ≥ W → φόρμα v5
  - επεξεργασία παλιών (< W) → παλιά φόρμα, όπως σήμερα
  - η απόφαση γίνεται από την ημέρα, με την ίδια συνάρτηση `planEraOf(date)` που διαβάζει το `plan_config`
- **Weekly Διεθνών:**
  - το `nlBySrc` (`weekly_intl.js:710-741`) γεμίζει από **δύο** αναγνώσεις: NL για παραγγελίες < W και `/plan/vs-state` για ≥ W, σε κοινό χάρτη `natBySrc[oid] = {carrier, done}`, με δική του κατάσταση `natState`
  - το `_carrierOf` (`weekly_intl_v2.js:279-291`) και το `natDone` (`:1184-1188`) διαβάζουν από εκεί
  - για v5: `done` = `executed` (η ώρα πέρασε), όχι `Status ∈ {Delivered, Invoiced}`
  - αποτυχία μίας από τις δύο αναγνώσεις = «απέτυχε» στο πλακίδιο, ποτέ «δεν υπάρχει εθνικό»
- **Διακόπτης `WN_V5`:** on.

### Δεδομένα (greenfield)
- **Καμία μεταφορά.** Ό,τι είναι < W ζει και τελειώνει στο παλιό μοντέλο: NL/GL/CL, 034 RT, παλιό board.
- Ό,τι είναι ≥ W γεννιέται μόνο στο v5.
- Τα ζωντανά NL/GL/CL με ημέρα ≥ W που θα βρεθούν στη μέτρηση της Φ0: η τύχη τους είναι η απόφαση 1.
- Το Weekly Εθνικών ανοίγει την εβδομάδα W μόνο στο v5. Οι προηγούμενες εβδομάδες στο παλιό board, μόνο ανάγνωση από W+2 (απόφαση 10).

### Tests
- `074_plan_cutover_test.sql`:
  - VS < W → NL όπως σήμερα
  - VS ≥ W → γέφυρα, και NL INSERT = άρνηση
  - μετακίνηση παλιάς VS μέσα στο W → **επιτρέπεται**, μετριέται από B-82
  - αλλαγή σειράς στάσεων με κίνηση → `bridge_moved`
- Rigs:
  - `wi4-board-rig.js` + σενάριο `v5`: πλακίδια από `vs-state`, σβήσιμο 40% με `executed`
  - `daily-ops-vs-chain.test.js` + περίπτωση ≥ W

### Αποδοχή (την πρώτη εβδομάδα, κάθε πρωί)
- `national_loads`/`groupage_lines`/`consolidated_loads` με `created_at` ≥ ώρα cut-over και ημέρα ≥ W = **0**.
- Αποστολές γέφυρας = ελληνικές στάσεις των VS παραγγελιών με ημέρα κόμβου ≥ W (**ισότητα**).
- Αποστολές όπου Σ φύλλων ≠ παλέτες = **0**.
- Παραγγελίες με ζωντανό Direct NL **και** αποστολές = **0**.
- OWNED RT `model=2` με οδηγό = ζωντανές `dl_entries` πάνω τους (`dl_v_rt_gap` = **0**).
- Σ εσόδων RT της W = Σ τιμών παραγγελιών της W.
- RT v5 ανά ημέρα / φορτηγά που βγήκαν (υιοθέτηση, κίνδυνος 1 του §6 της αρχιτεκτονικής).

### Rollback
- **Πριν από την πρώτη πραγματική γραμμή v5:** `074_rollback` (`cutover_week = NULL`, `DROP` φρουρών και γέφυρας), `wrangler rollback`, διακόπτης off.
- **Μετά την πρώτη γραμμή:** μόνο προς τα εμπρός. Δεν υπάρχει αυτόματη μετατροπή v5 → NL. Το γράφουμε ρητά στον owner πριν το «ναι».

### Αν σπάσει
- **B-82** παλιό NL με ημέρα ≥ W (P2)
- **B-83** VS παραγγελία ≥ W χωρίς αποστολή γέφυρας ανά ελληνική στάση (P1)
- **B-84** παραγγελία με Direct NL + αποστολές (P1)
- **B-85** κομμάτι με `leave_by` περασμένο χωρίς κίνηση (P2, ωριαία)
- **B-86** RT `model=2` χωρίς ζωντανή κίνηση και όχι `cancelled` (P2)
- **B-87** θερμοκρασίες > 2 °C διαφορά στην ίδια πλευρά (P3, ενημέρωση)
- **B-88** στάση φόρτωσης εκτός κόμβου χωρίς «ποιος φορτώνει» (αν το αποφασίσει η απόφαση 8)
- και ο B-59 (`058`) για παλιά NL

Όλα με «ποιος το μαθαίνει» = ειδοποίηση του 048 στον owner και στον εθνικών.

---

## Φ6 · Κυκλοφορία, πρώτες 2 εβδομάδες (S–M · owner + εμείς)
- **Ημέρα 0 (Σάββατο W):** ζωντανός έλεγχος στο Chrome του owner. Μία παραγγελία-δοκιμή **μόνο αν** το εγκρίνει ο owner (Ε2: όχι εγγραφές-δοκιμής). Αλλιώς παρακολουθούμε τις πρώτες πραγματικές.
- **Κάθε πρωί 07:30, μετά 13:00:** οι μετρήσεις αποδοχής της Φ5 σε `docs/sessions/`. Το «0 / ισότητα» ή αναφέρεται ή σταματάμε.
- **Τέλος εβδομάδας W:**
  - Σ μισθοδοσίας κύκλων = κύκλοι που έγιναν
  - DKV της εβδομάδας: 0 «λείπει δρομολόγιο» που να μην εξηγείται
  - X: B-78 = 0
- **Κριτήριο προόδου:** δύο εβδομάδες με όλα 0. Μετά η Φ7.

## Φ7 · Καθαρισμός (S · εμείς, μετά από απόφαση owner)
- Ο dispatcher πέφτει σε GET στα `national_loads`, `groupage_lines` και `consolidated_loads` (`index.js:585-592`). Είναι αλλαγή ρόλου, άρα πρώτα ερώτηση στον owner (απόφαση 10).
- Το παλιό board και η παλιά φόρμα: μόνο ανάγνωση, και μετά φεύγει ο νεκρός κώδικας (αρχή 8): `_natlWriteGroupageChain`, `_syncNationalLoad`, κλάδοι NL του `_syncVeroiaSwitch`.
- Το `CLAUDE.md` «Sync chain» ξαναγράφεται.
- Ο κανόνας «GL ποτέ delete» μένει, γιατί η βάση τον επιβάλλει.

---

## Σύνοψη φάσεων

| Φάση | Παραδοτέο | Μέγεθος | Κάτοχος (πρόταση) | Αναστρέψιμο |
|---|---|---|---|---|
| Φ0 | αποφάσεις + μετρήσεις | S | εμείς + owner | — |
| Φ1 | `071` σχήμα κλειστό | L | εμείς, έλεγχος ValueDriven + PGlite στο CI τους | πλήρως (0 γραμμές) |
| Φ2 | `072` `plan_*` + `/plan/*` + `PLAN_PERMS` | L | **ένας** κάτοχος αλυσίδας Worker (ValueDriven αν το backend/CI τους έχει μπει, αλλιώς εμείς) | πλήρως |
| Φ3 | `073` έσοδα/X/κόμιστρο/διαδρομή/παλέτες + DKV | M | εμείς (ίδια αλυσίδα Worker) | πλήρως (καμία v5 γραμμή) |
| Φ4 | board v5, Βέροια, φόρμα, διαγραφή, rigs | L | εμείς | διακόπτης |
| Φ5 | `074` γέφυρα + πάγωμα + `vs-state` + Weekly Διεθνών | M | εμείς, εκτέλεση owner | μόνο πριν την 1η γραμμή v5 |
| Φ6 | κυκλοφορία, μετρήσεις | S–M | owner + εμείς | — |
| Φ7 | ρόλοι, νεκρός κώδικας | S | εμείς | ναι |

Ενδεικτικό ημερολόγιο: Φ0 22–23/10 · Φ1 ως 30/10 · Φ2+Φ3 ως 10/11 · Φ4 ως 17/11 · **W = Σάββατο 21/11/2026**, ή 28/11 αν η Φ4 αργήσει. Το W το διαλέγει ο owner (απόφαση 1).

---

## Ανοιχτές αποφάσεις owner πριν τη Φ1 (10)

1. **W και τι γίνεται με όσα NL/GL/CL υπάρχουν ήδη με ημέρα ≥ W.** (α) τελειώνουν στο παλιό μοντέλο, με παρακολούθηση από τον B-82, ή (β) ο εθνικών τα σβήνει και τα ξαναβάζει στο v5 πριν το W. Πρόταση: (α) για ό,τι υπάρχει την Παρασκευή, μηδενικό από εκεί και πέρα.
2. **«Εκτελέστηκε = πέρασε η ώρα της στάσης»: ποια ώρα;** Τέλος του παραθύρου της στάσης (`planned_to`) ή τέλος της ημέρας; Πρόταση: τέλος παραθύρου. Το ίδιο ορίζει το σβήσιμο, την «παραδόθηκε» εθνική και το `natDone` του Weekly Διεθνών.
3. **Η διεθνής φόρμα μπροστά σε προγραμματισμένο VS.** Όταν ο διεθνών κλείνει το VS, σβήνει ελληνική στάση ή αλλάζει σειρά/τόπο σε στάση που έχει ήδη εθνική κίνηση: (α) άρνηση 422 «ρώτα τον εθνικών» ή (β) δεκτό, η εθνική κίνηση σβήνεται, και ειδοποίηση στον εθνικών. Πρόταση: (α). Το (β) αφήνει φορτηγό να πηγαίνει σε λάθος διεύθυνση.
4. **Δήλωση κόμβου:** ανά παραγγελία (η σημερινή σημαία VS) ή ανά ελληνική στάση (Α6 της αρχιτεκτονικής). Και: η σημαία «National Groupage» μιας **διεθνούς** εξαγωγής (`orders_intl.js:2105`, GL) γίνεται κι αυτή αποστολή γέφυρας προς τον κόμβο από το W;
5. **Τιμή εθνικής παραγγελίας σε 2+ RT:** μοιράζεται κατ' αναλογία παλετών όπως το X (Α1 α), ή πάει ολόκληρη στο πρώτο RT; Και ο παρονομαστής του X = παλέτες κόμβου μόνο `PALLET` (τα IFCO εκτός, Β9);
6. **Μισθοδοσία κύκλου:** το `trip_value` μένει NULL όπως σήμερα (`011:183`) ή προσυμπληρώνεται 230 € στα OWNED `model=2`; Και σε διαγραφή κύκλου με ήδη γραμμένα ποσά: κρατάμε τη συμπεριφορά της 011 («θέλει έλεγχο», `011:190-199`) ή σβήνεται;
7. **Επαναφορά μετά τις 7 ημέρες:** ποτέ, ή μόνο ο owner (Β10); Μέσα στις 7 ημέρες: owner και dispatcher;
8. **Φόρτωση εκτός Βέροιας:** υποχρεωτικό «ποιος φορτώνει» σε κάθε τέτοια στάση (#10 του 20/10); Και επιβεβαίωση ότι οι τοπικές κινήσεις του Weekly Εθνικών (`local_moves` `'local'`) παγώνουν από το W και γίνονται εθνικές παραγγελίες σε RT (owner 18/10, T7).
9. **Κόμιστρο συνεργάτη ανά δρομολόγιο:** υποχρεωτικό τη στιγμή της ανάθεσης ή επιτρέπεται κενό (με ειδοποίηση «κόμιστρο λείπει»); Και ποιος το βλέπει: σήμερα ο dispatcher βλέπει `Partner Rate` (R-04).
10. **Μετά την απόδειξη (Φ7):** ο dispatcher χάνει POST/PATCH/DELETE σε NL/GL/CL, και το παλιό Weekly Εθνικών γίνεται μόνο ανάγνωσης από W+2 και φεύγει από W+6;

*Τεχνικές εγκρίσεις που ζητούνται μαζί, χωρίς να είναι επιχειρηματικές αποφάσεις:* `CREATE EXTENSION btree_gist` (Φ1), και δύο EXCLUDE: ένα φορτηγό και ένας οδηγός ανά χρόνο, μόνο για OWNED `model=2`.
