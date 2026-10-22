# Φ1 · Εθνικά v5: σχήμα κλειστό, 0 γραμμές (`071` + `071b`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Να υπάρξουν στη βάση όλα τα αντικείμενα του μοντέλου v5 (πίνακες, στήλες, όψεις, κανόνες), κλειστά για όλους, με 0 γραμμές, χωρίς να αλλάξει ούτε ένα σημερινό νούμερο.

**Architecture:** Ένα migration `071_plan_schema.sql`, ένα DO block, ASCII. Προσθέτει 5 πίνακες, 4 στήλες σε υπάρχοντες πίνακες, 8 όψεις μόνο ανάγνωσης, 7 συναρτήσεις και 9 triggers (2 κανονικά, 7 αναβαλλόμενα `CONSTRAINT TRIGGER`). Ξαναγράφει 4 ζωντανές συναρτήσεις από το **ζωντανό** κείμενό τους, με md5-φρουρό και μία γραμμή η καθεμία. Δεύτερο, χωριστό migration `071b_plan_one_vehicle.sql` (ξεχωριστό «ναι»): `btree_gist` και δύο `EXCLUDE` (ένα φορτηγό, ένας οδηγός τη φορά). Κάθε migration έχει `_dryrun` (παράγεται), `_verify`, `_test`, `_rollback`. Ο κανόνας αποδεικνύεται πρώτα σε PGlite, μετά στην παραγωγή.

**Tech Stack:** Supabase Postgres 17.6 (DO blocks, plpgsql, constraint triggers, `security_invoker` views), PGlite 0.5.8 (`tms-auditor`), node `--test`.

## Global Constraints

- Πηγές με σειρά ισχύος: 1) `docs/superpowers/specs/2026-10-21-national-v5-design.md` (εγκεκριμένο, owner 21/10), 2) `docs/national-v5/tech-draft-2026-10-21.md` Φ1 και §0/§1, 3) spec §7 (τι αλλάζει στο προσχέδιο). Όπου διαφωνούν, ισχύει το spec. Αν το spec δεν έχει γίνει ακόμη merge, διάβασέ το από το branch `docs/national-v5-spec-plan`.
- **Το `ct_round_trips` δεν παίρνει `deleted_at`.** Κύκλος που «δεν έγινε» = `status = 'cancelled'` (spec §2.1).
- **Χωρίς** `plan_chk_hub` / `hub_endpoint`: η Βέροια είναι κανονικός τόπος (spec §3 Board). **Χωρίς** `plan_restore`, `deleted_batch`, «ποιος φορτώνει» (`loader`), «μόνο PALLET» (`qty_unit`) (spec §7).
- «Έγινε» = η ημέρα Αθήνας του `planned_to` πέρασε: `(planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date` (spec §2.3). Ποτέ γραμμένο status.
- Αλλαγές στη βάση: dry run, ρητό «ναι» του owner στη συνομιλία, εκτέλεση **μετά τις 15:00** (CLAUDE.md κανόνας 5, αρχή 7). Ο agent κάνει μόνο SELECT στη Supabase (project `gatejgbpyodlepkvqkgf`).
- «Ό,τι γεννιέται, γεννιέται κλειστό»: `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`, RLS ενεργό **χωρίς** πολιτικές, `SELECT` μόνο σε `service_role`, `tms_reader`, `tms_check_runner`. Καμία εγγραφή από τον Worker στους νέους πίνακες: γράφουν μόνο οι `plan_*` της Φ2 (`SECURITY DEFINER`).
- Οι νέοι πίνακες **δεν** μπαίνουν στο `TABLES` του facade (`worker/src/index.js`).
- Κάθε άρνηση της βάσης: `SQLSTATE 23514`, `HINT 'plan:<code>'` (ο Worker τη μεταφράζει στη Φ2, στον ίδιο χαρτογράφο `stockRuleError`).
- Αρχεία SQL: **ASCII μόνο**, ένα DO block ανά αρχείο που γράφει, `lock_timeout 5s`. Αρχεία verify: μόνο SELECT.
- Το 057/060/069 είναι εκτελεσμένα αν και τα αρχεία τους μένουν στο `drafts/`: κάθε φρουρός διαβάζει το **ζωντανό** κείμενο (md5), όχι αρχείο.
- Branch `feat/national-v5-schema` από `origin/main`. Ποτέ push στο `main`. PR, το merge το κάνει ο Δημήτρης. Το SQL το εκτελεί ο owner.
- Σχόλια κώδικα στα αγγλικά, κείμενο συζήτησης στα ελληνικά.

---

## Αφετηρία (μετρήθηκε στην παραγωγή 21–22/10, μόνο SELECT)

| Τι | Τιμή |
|---|---|
| Postgres | 17.6 |
| `btree_gist` | **διαθέσιμο, μη εγκατεστημένο** (`pg_available_extensions`: installed_version NULL) |
| Σχήμα `extensions` | υπάρχει |
| Ενεργά triggers στο `public` (B-54) | **37**· `monitoring.checks` B-54 `red_value` = 37, `baseline` NULL |
| Καθρέφτες B-54 στο repo | `tms-auditor/checks/B-54.sql` «red: <> 35», `047b` 35: **μένουν πίσω κατά 2** (η 069 δεν τους ενημέρωσε) |
| `ct_round_trips` | 196 γραμμές (16 cancelled), `id` identity **ALWAYS**, καμία στήλη `model/start_at/end_at/partner_rate` |
| `dl_entries` | 11.260 (11.224 ζωντανές) |
| `local_moves` | 1 γραμμή, `relay_delivery` |
| Βέροια | `locations.id = 360`, `name = 'CROSS-DOCK'`, `legacy_id = 'recJucKOhC1zh4IP3'`, ζωντανή |
| deferrable constraints στο `public` | καμία |
| `anon`/`authenticated` | καμία πρόσβαση σε `ct_round_trips`, `local_moves`, `order_stops`, `locations`, `pl_movements` |
| `tms_reader` | SELECT σε επίπεδο πίνακα στο `ct_round_trips` (βλέπει ήδη `orders.partner_rate`, `national_loads.partner_rate`, `ct_cost_lines`) |
| `timezone(text, timestamptz)` | IMMUTABLE (επιτρέπεται σε CHECK) |
| PGlite 0.5.8 | έχει `contrib/btree_gist` (έκδοση 1.8), δοκιμάστηκε 22/10 |
| Ερώτημα λήψης του Task 1 Step 2 | τρέχει στην παραγωγή: 571 εντολές, 82.753 χαρακτήρες (22/10, μετά τη διόρθωση των generated στηλών, π.χ. `dl_entries.balance_delta`) |

Ζωντανά md5 (`md5(prosrc)`) των συναρτήσεων που ξαναγράφει η 071, και τα md5 μετά την αντικατάσταση (υπολογισμένα στην παραγωγή με `replace()`, μόνο SELECT, `back_ok = true`, 1 εμφάνιση το καθένα):

| Συνάρτηση | ζωντανό md5 | md5 μετά την 071 |
|---|---|---|
| `rt_status_guard()` | `f632fea1d6a5dd2cee7c80f4db9e27f2` | `d7757f99c3443ac167d5bdaf3e34b142` |
| `rt_recompute(bigint)` | `3f85092f030b2ad92a3002ab0a9cc98d` | `5fa0a08418147b22d2852db3b8c72c3e` |
| `rt_auto_close(bigint)` | `88b41f860aaf7f925183ab84dc10c2dd` | `eba2146ca4c521da6365edd28c4507af` |
| `dl_local_day_sync(bigint,date)` | `a4a62603e5b0c4ad48124fea625aa611` | `151dab06e2676f3c8885d7298d0ac6af` |

Οι υπόλοιπες συναρτήσεις κύκλου (`rt_sync_legs`, `rt_sync_to_orders`, `rt_sync_to_national_loads`, `rt_create_from_order`, `rt_link_split`, `rt_merge`, `rt_sync_from_order`, `rt_sync_national_load`, `rt_auto_close_legs`, `rt_auto_close_order`) διαβάστηκαν: φτάνουν σε κύκλο **μόνο μέσω `ct_rt_legs`**. Το νέο `ct_rt_legs_v2_guard` κλείνει αυτόν τον δρόμο για `model=2`, οπότε μένουν αμετάβλητες. Το `dl_sync_from_rt` (011) μένει σκόπιμα αμετάβλητο: ένας OWNED κύκλος v5 με οδηγό παίρνει τη μία γραμμή μισθοδοσίας του όπως σήμερα.

## Αποφάσεις του πλάνου που το spec δεν ορίζει ρητά (ενημέρωση owner στο PR, DECISION_LOG)

1. **`order_stops.via_hub boolean NOT NULL DEFAULT false`**, χωρίς backfill στη Φ1. Η 074 (ημέρα L) τη γεμίζει για τα VS με ημέρα κόμβου ≥ L, στην ίδια συναλλαγή με τις γέφυρες. Μέχρι τότε δεν τη διαβάζει κανείς.
2. **Ο `plan_config` (ημέρα L) φεύγει από τη Φ1 στη 074**, μαζί με την τιμή του. Έτσι η Φ1 έχει πραγματικά 0 γραμμές σε κάθε νέο πίνακα.
3. **`nat_loading` δεν θέλει ρυμουλκούμενο** (εξαιρείται από το `local_moves_relay_trailer`). Το spec λέει «καμία υποχρεωτική ερώτηση»· αν ο owner θέλει ρυμουλκούμενο, μπαίνει στο `plan_local_loading` (Φ2), όχι στη βάση.
4. **Η γραμμή μισθοδοσίας ΤΟΠΙΚΟ μιας `nat_loading` γράφει τον κωδικό του κύκλου** (`RT-…`), γιατί η κίνηση δεν έχει παραγγελία. Μία γραμμή αλλάζει στο `dl_local_day_sync`. Για τις σημερινές relay δεν αλλάζει τίποτα (το `parent_order_id` τους είναι πάντα γεμάτο, CHECK `local_moves_kind_parent`).
5. **Ένα κομμάτι κινείται μόνο ανάμεσα σε αφετηρία, Βέροια και προορισμό του** (`plan:leg_place`). Μεταφόρτωση αλλού δεν υπάρχει στο μοντέλο. Αφού «ένα φορτίο σπάει μόνο στη Βέροια», ο κανόνας μπαίνει στη βάση.
6. **Σε κάθε κύκλο η ΚΑΘΟΔΟΣ προηγείται της ΑΝΟΔΟΥ** (`plan:side_order`). Ο κύκλος μόνο ΑΝΟΔΟΥ επιτρέπεται.
7. **`plan_rt_create` (Φ2) γράφει πρώτα τις στάσεις και μετά τον κύκλο** (spec §7): το FK `rt_stops → ct_round_trips` είναι `DEFERRABLE INITIALLY DEFERRED`, και ο κύκλος παίρνει id με `nextval(pg_get_serial_sequence('public.ct_round_trips','id'))` + `OVERRIDING SYSTEM VALUE` (το `id` είναι identity ALWAYS). Αποδεικνύεται στο test, περίπτωση 25.
8. **Τα `EXCLUDE` του 071b είναι `DEFERRABLE INITIALLY DEFERRED`**: οι `plan_*` μετακινούν στάσεις μία-μία μέσα σε μία συναλλαγή. Μετρά μόνο το παράθυρο στο COMMIT.
9. **Το `ct_round_trips.partner_rate` το βλέπει ο `tms_reader`**: έχει SELECT σε όλο τον πίνακα. Βλέπει ήδη `orders.partner_rate` και `national_loads.partner_rate`, άρα δεν ανοίγει νέα κατηγορία πληροφορίας. Οι νέες όψεις δεν έχουν χρήματα.

---

## Χάρτης αρχείων

| Αρχείο | Ευθύνη |
|---|---|
| `worker/migrations/drafts/071_plan_schema.sql` | Το migration (ένα DO block) + μία γραμμή αποτελέσματος |
| `worker/migrations/drafts/071_plan_schema_dryrun.sql` | **Παράγεται**: το 071 αυτούσιο + σκόπιμο σφάλμα |
| `worker/migrations/drafts/071_plan_schema_verify.sql` | Μόνο SELECT, μία γραμμή |
| `worker/migrations/drafts/071_plan_schema_fingerprint.sql` | Μόνο SELECT: md5 όλων των RT/`dl_entries`, πριν και μετά |
| `worker/migrations/drafts/071_plan_schema_test.sql` | 54 περιπτώσεις σε TEST γραμμές, τελειώνει με σκόπιμο σφάλμα |
| `worker/migrations/drafts/071_plan_schema_rollback.sql` | Πλήρης αναίρεση, αρνείται αν υπάρχει έστω μία γραμμή v5 |
| `worker/migrations/drafts/071b_plan_one_vehicle.sql` | `btree_gist` + 2 `EXCLUDE` |
| `worker/migrations/drafts/071b_plan_one_vehicle_dryrun.sql` | **Παράγεται** |
| `worker/migrations/drafts/071b_plan_one_vehicle_verify.sql` | Μόνο SELECT |
| `worker/migrations/drafts/071b_plan_one_vehicle_test.sql` | 8 περιπτώσεις, σκόπιμο σφάλμα |
| `worker/migrations/drafts/071b_plan_one_vehicle_rollback.sql` | Σβήνει τα 2 `EXCLUDE` |
| `worker/migrations/drafts/tools/build-071-dryruns.mjs` | Γεννήτρια των δύο dry runs |
| `tests/sql-071-drafts.test.js` | Έλεγχοι build χωρίς βάση (ASCII, ένα DO, αλυσίδα md5, B-54, κλειστό, deltas του spec) |
| `tms-auditor/test/plan-071.test.mjs` | Όλα τα παραπάνω τρέχουν σε PGlite, σε αντίγραφο με το σχήμα της παραγωγής |
| `tms-auditor/test/fixtures/live-071.sql` | Λήψη από την παραγωγή (μόνο SELECT) των στηλών, CHECK, indexes, συναρτήσεων και triggers που αγγίζει η 071 |
| `tms-auditor/lib/db.mjs:66-67` | `createDb` δέχεται `extensions` (για το `btree_gist` του PGlite) |
| `docs/DECISION_LOG.md`, `docs/sessions/2026-10-22-dimitris-national-v5-f1-schema.md`, `docs/SESSION.md` | Ίχνος |
| *(μετά την εκτέλεση, Task 9)* `tms-auditor/checks/B-54.sql`, `worker/migrations/drafts/047b_monitoring_seed.sql` | Καθρέφτης B-54 = 46 |

---

## Interfaces (τα ονόματα που χρησιμοποιούν οι Φ2–Φ5 όπως είναι)

**Στήλες σε υπάρχοντες πίνακες**
- `locations.is_hub boolean NOT NULL DEFAULT false`. Μοναδικό `true` (index `locations_one_hub`) = Βέροια `recJucKOhC1zh4IP3`.
- `ct_round_trips.model smallint NOT NULL DEFAULT 1` (1 = σημερινά RT, 2 = κύκλος v5)· `start_at timestamptz`, `end_at timestamptz` (γράφει **μόνο** το `plan_rt_window_sync`)· `partner_rate numeric(10,2)` (μόνο `model=2` και `PARTNER`, ≥ 0).
  - CHECK: `rt_model`, `rt_v2_scope` (`model=2` ⇒ `scope='NATL'`), `rt_v2_status` (`model=2` ⇒ `planned|cancelled`), `rt_v2_window` (`model=2` ⇒ `start_at` NOT NULL και `end_at > start_at`), `rt_v1_no_window` (`model=1` ⇒ `start_at`/`end_at` NULL), `rt_v2_dates` (`date_start`/`date_end` = ημέρες Αθήνας των `start_at`/`end_at`), `rt_partner_rate`.
  - 071b: `rt_v2_truck_once`, `rt_v2_driver_once` (`EXCLUDE`, SQLSTATE `23P01`, deferrable) → Worker `truck_busy` / `driver_busy`.
- `order_stops.via_hub boolean NOT NULL DEFAULT false`. CHECK `order_stops_via_hub_intl`: μόνο σε στάση διεθνούς (`order_id IS NOT NULL`). Ο Worker θα χρειαστεί label `"Via Hub": "via_hub"` στο ORDER_STOPS (Φ2, αλυσίδα Worker).
- `local_moves.rt_stop_id bigint REFERENCES rt_stops(id) ON DELETE RESTRICT`. `move_kind` δέχεται και `'nat_loading'`.
  - CHECK `local_moves_nat_loading`: `(move_kind='nat_loading') = (rt_stop_id IS NOT NULL)`, και `nat_loading` ⇒ `driver_id` NOT NULL, `status IN ('Assigned','Cancelled')`.
  - Index `local_moves_nat_loading_once`: μία ζωντανή ανά στάση.
- `pl_movements.piece_leg_id bigint REFERENCES piece_legs(id) ON DELETE RESTRICT`. Index `pl_mov_leg_once (piece_leg_id, event_type) WHERE piece_leg_id IS NOT NULL AND status <> 'reversed'`.

**Νέοι πίνακες** (όλοι: `id bigint GENERATED ALWAYS AS IDENTITY`, `created_at`, `created_by text NOT NULL`, και soft delete `deleted_at`/`deleted_reason`/`deleted_by`, όλα μαζί ή κανένα, εκτός από το `plan_notices`)
- `shipments(order_id → orders, nat_order_id → national_orders, order_stop_id → order_stops [γέφυρα VS], origin_location_id, dest_location_id, pallets numeric(6,1), load_from, load_to, deliver_from, deliver_to timestamptz)`.
  - Η γέφυρα δεν αντιγράφει **τίποτα**: τόποι, παλέτες και ημέρα διαβάζονται από `order_stops`/`orders` μέσω `v_shipments`.
  - CHECK: `shipments_one_parent`, `shipments_bridge_intl`, `shipments_intl_is_bridge` (διεθνής μόνο ως γέφυρα VS: το groupage εξαγωγής αναβάλλεται), `shipments_shape`, `shipments_pallets`, `shipments_win`, `shipments_ends`, `shipments_del`.
  - Index `shipments_bridge_once`: μία ζωντανή γέφυρα ανά στάση.
- `shipment_pieces(shipment_id, parent_piece_id, pallets numeric(6,1) > 0, leave_by date, split_at, split_by)`. CHECK: `pieces_pallets`, `pieces_split_pair`, `pieces_not_own_parent`, `pieces_del`.
- `rt_stops(rt_id, seq smallint > 0, location_id, side 'KATHODOS'|'ANODOS', planned_from, planned_to)`.
  - FK `rt_stops_rt_fk` DEFERRABLE INITIALLY DEFERRED· UNIQUE `rt_stops_rt_id (rt_id, id)`.
  - CHECK: `rt_stops_seq`, `rt_stops_side`, `rt_stops_win`, `rt_stops_del`.
- `piece_legs(piece_id, leg_no smallint > 0, rt_id, pickup_stop_id, drop_stop_id)`.
  - FK `piece_legs_pickup_fk`/`piece_legs_drop_fk` (σύνθετα: η στάση ανήκει στον ίδιο κύκλο).
  - CHECK `piece_legs_no`, `piece_legs_two_stops`, `piece_legs_del`· index `piece_legs_live_no` (ένα ζωντανό `leg_no` ανά κομμάτι).
- `plan_notices(to_desk 'intl'|'natl', kind text ~ '^[a-z_]+$', message text, order_id, nat_order_id, rt_id, created_at, created_by, read_at, read_by)`. CHECK `plan_notices_read_pair`· index `plan_notices_unread`.

**Όψεις** (`security_invoker`, χωρίς χρήματα, SELECT σε `service_role`, `tms_reader`, `tms_check_runner`)
- `v_shipments`: `shipment_id, kind ('national'|'vs_import'|'vs_export'), order_id, nat_order_id, order_stop_id, client_id, reference, origin_location_id, dest_location_id, nat_from_location_id, nat_to_location_id, pallets, nat_ready_day, nat_due_day, load_from, load_to, deliver_from, deliver_to, temperature_c, pallet_exchange, live, created_at, created_by, deleted_at`.
- `v_piece_pos`: όλα τα ζωντανά κομμάτια, και τα σπασμένα: `piece_id, parent_piece_id, shipment_id, pallets, leave_by, is_split, own_last_leg_id, eff_last_leg_id, last_drop_stop_id, position_location_id`.
- `v_piece_state`: τα φύλλα των ζωντανών αποστολών: `piece_id, shipment_id, kind, order_id, nat_order_id, order_stop_id, parent_piece_id, pallets, leave_by, position_location_id, last_drop_stop_id, at_hub, waiting, end_stop_id, national_end_at, end_day, nat_ready_day, nat_due_day, executed, late, overdue, is_stock`.
- `v_rt_stop_state`: `stop_id, rt_id, code, seq, side, location_id, planned_from, planned_to, stop_day, executed, has_vehicle, has_late, rt_status, dim, side_dim, cycle_dim`.
- `v_rt_cycle`: `rt_id, code, status, trip_type, truck_id, trailer_id, driver_id, partner_id, start_at, end_at, date_start, date_end, n_stops, n_legs, ended`.
- `v_hub_bucket`: `piece_id, shipment_id, kind, order_id, nat_order_id, order_stop_id, pallets, is_stock, leave_by, overdue, nat_ready_day, nat_due_day, inbound_rt_id`.
- `v_national_order_state`: `nat_order_id, n_pieces, n_executed, executed, planned, late`.
- `v_vs_state`: `order_id, n_pieces, all_executed, all_planned, first_hub_day, carriers jsonb [{rt_id, code, trip_type, truck_id, driver_id, partner_id, hub_day}]`.

**Συναρτήσεις** (EXECUTE κλειστό για PUBLIC/anon/authenticated/service_role· τις καλούν μόνο triggers και οι `plan_*` της Φ2, που ανήκουν στον owner)
- `plan_shipment_problem(bigint) RETURNS text`, `plan_leg_problem(bigint) RETURNS text`, `plan_rt_problem(bigint) RETURNS text`, `plan_local_loading_problem(bigint) RETURNS text`. Επιστρέφουν `NULL` ή `'<code>:<λεπτομέρεια>'`. Οι `plan_*` της Φ2 μπορούν να τις καλούν για dry-run.
- Trigger functions: `plan_chk()`, `plan_rt_window_sync()`, `ct_rt_legs_v2_guard()`.

**Triggers (+9, B-54 37 → 46):** `ct_rt_legs_v2_guard` (`ct_rt_legs`), `plan_rt_window_sync` (`rt_stops`), και deferred `plan_chk_rt` (`ct_round_trips`), `plan_chk_stops` (`rt_stops`), `plan_chk_legs` (`piece_legs`), `plan_chk_pieces` (`shipment_pieces`), `plan_chk_shipments` (`shipments`), `plan_chk_bridge_stop` (`order_stops`, όταν αλλάζουν `pallets`/`deleted_at`), `plan_chk_local_loading` (`local_moves`, `nat_loading`).

**Κωδικοί `plan:` της Φ1** (κάθε κωδικός θέλει ελληνικό κείμενο στο `PLAN_RULE_TEXT` της Φ2): `pieces_alive`, `piece_dead`, `pieces_sum`, `piece_parent`, `split_not_at_hub`, `rt_not_v2`, `rt_cancelled`, `leg_stop_dead`, `leg_order`, `leg_place`, `chain`, `chain_time`, `stop_seq`, `stop_order`, `side_order`, `rt_window`, `local_loading_gone`, `local_loading_day`, `local_loading_stop`, `model_locked`, `stop_locked`, `leg_locked`, `piece_locked`, `shipment_locked`, `v1_link_on_v2`. Τα ονόματα CHECK/UNIQUE/EXCLUDE πάνω θέλουν κείμενο στο `PLAN_CHECK_TEXT`.

**Τι ΔΕΝ κάνει η Φ1:** `plan_*` (072), Worker, οθόνες, `ct_v_rt_revenue`/`ct_v_rt_costs`/`dl_v_rt_route` (073), νέοι έλεγχοι B-xx (073/074), γέφυρα VS και `plan_config` (074), backfill `via_hub` (074).

---

### Task 0: Branch και επαναμέτρηση της αφετηρίας

**Files:** κανένα (μόνο ανάγνωση).

**Interfaces:**
- Consumes: —
- Produces: επιβεβαίωση ότι τα md5 και τα νούμερα της «Αφετηρίας» ισχύουν ακόμη. Αν όχι: **ΣΤΑΜΑΤΑ** και ενημέρωσε τον συντονιστή. Το πλάνο ξαναγράφεται με τα νέα md5.

- [ ] **Step 1: Φρέσκο main και branch**

```bash
cd /Users/dimitrispetras/PETRASGROUP-TMS/.claude/worktrees/infallible-shamir-fc83ed
git fetch origin
git switch -c feat/national-v5-schema origin/main
git log --oneline -15 origin/main -- worker/migrations tms-auditor tests/sql-0*
```
Expected: το branch δημιουργήθηκε. Δες αν μπήκε κάποιο migration μετά το `62d09f9d` (π.χ. `071a` της Β0). Αν μπήκε κάτι που αγγίζει `ct_round_trips`, `local_moves`, `order_stops`, `locations`, `pl_movements` ή τις 4 συναρτήσεις, **ΣΤΑΜΑΤΑ**.

- [ ] **Step 2: Επαναμέτρηση (Supabase MCP `execute_sql`, project `gatejgbpyodlepkvqkgf`, μόνο SELECT)**

```sql
SELECT
  (SELECT string_agg(p.oid::regprocedure::text || '=' || md5(p.prosrc), ' ' ORDER BY p.oid::regprocedure::text)
     FROM pg_proc p WHERE p.oid IN ('public.rt_status_guard()'::regprocedure, 'public.rt_recompute(bigint)'::regprocedure,
       'public.rt_auto_close(bigint)'::regprocedure, 'public.dl_local_day_sync(bigint,date)'::regprocedure)) AS fn_md5,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname = 'public') AS triggers,
  (SELECT red_value::text || '/' || coalesce(baseline::text, 'null') FROM monitoring.checks WHERE id = 'B-54') AS b54,
  (SELECT coalesce(installed_version, 'not installed') FROM pg_available_extensions WHERE name = 'btree_gist') AS btree_gist,
  (SELECT count(*) FROM locations WHERE legacy_id = 'recJucKOhC1zh4IP3' AND deleted_at IS NULL) AS veroia,
  to_regclass('public.shipments') IS NULL AND to_regclass('public.rt_stops') IS NULL AS not_applied;
```
Expected: `fn_md5` = `dl_local_day_sync(bigint,date)=a4a62603e5b0c4ad48124fea625aa611 rt_auto_close(bigint)=88b41f860aaf7f925183ab84dc10c2dd rt_recompute(bigint)=3f85092f030b2ad92a3002ab0a9cc98d rt_status_guard()=f632fea1d6a5dd2cee7c80f4db9e27f2`, `triggers` = 37, `b54` = `37/null`, `btree_gist` = `not installed`, `veroia` = 1, `not_applied` = true.

- [ ] **Step 3: Οι εξαρτήσεις του PGlite**

```bash
cd tms-auditor && npm ci && ls node_modules/@electric-sql/pglite/dist/contrib | grep -i btree_gist
node -e "import('@electric-sql/pglite/contrib/btree_gist').then(m => console.log(Object.keys(m)))"
```
Expected: ένα αρχείο `btree_gist…` και `[ 'btree_gist' ]`. Αν λείπει από το PGlite 0.5.8, το 071b αποδεικνύεται **μόνο** στην παραγωγή (Task 6, Step 6), και το αντίστοιχο υπο-test του `plan-071.test.mjs` μένει `skip` με λόγο «btree_gist not in PGlite 0.5.8». Το 071 δεν επηρεάζεται.

---

### Task 1: Αντίγραφο της παραγωγής σε PGlite + δοκιμή που αποτυγχάνει

**Files:**
- Modify: `tms-auditor/lib/db.mjs:66-67`
- Create: `tms-auditor/test/fixtures/live-071.sql` (λήψη, μόνο SELECT)
- Create: `tms-auditor/test/plan-071.test.mjs`

**Interfaces:**
- Consumes: Task 0
- Produces: `prodShaped()` (μέσα στο test file)· το test αποτυγχάνει μέχρι να υπάρξουν τα αρχεία των Task 2–6.

- [ ] **Step 1: `createDb` δέχεται extensions**

Στο `tms-auditor/lib/db.mjs` αντικατέστησε τις γραμμές 66-67:
```js
export async function createDb({ roles = false, seed = true, fixture = true } = {}) {
  const db = new PGlite();
```
με:
```js
export async function createDb({ roles = false, seed = true, fixture = true, extensions } = {}) {
  // extensions: PGlite contrib modules (e.g. btree_gist for 071b); none by default, as before.
  const db = new PGlite(extensions ? { extensions } : undefined);
```

- [ ] **Step 2: Λήψη του `live-071.sql` από την παραγωγή (μόνο SELECT)**

Τρέξε με το Supabase MCP `execute_sql` το παρακάτω και γράψε **αυτούσιο** το μοναδικό κελί του αποτελέσματος στο `tms-auditor/test/fixtures/live-071.sql`:

```sql
WITH t(tbl) AS (VALUES ('clients'), ('partners'), ('trucks'), ('drivers'), ('trailers'), ('locations'), ('orders'),
                       ('order_stops'), ('national_orders'), ('ct_round_trips'), ('ct_rt_legs'), ('local_moves'),
                       ('dl_entries'), ('pl_movements'), ('audit_log'), ('ct_cost_lines')),
f(sig) AS (VALUES ('public.rt_sync_audit(text,text,text,jsonb,jsonb)'), ('public.rt_status_guard()'),
                  ('public.rt_recompute(bigint)'), ('public.rt_auto_close(bigint)'), ('public.rt_auto_close_legs()'),
                  ('public.rt_sync_legs()'), ('public.rt_sync_to_orders()'), ('public.rt_sync_to_national_loads()'),
                  ('public.dl_sync_from_rt()'), ('public.dl_local_day_sync(bigint,date)'),
                  ('public.dl_sync_from_local_move()'), ('public.local_moves_before()'), ('public.dl_local_line_guard()'),
                  ('public.dl_cash_lock()'), ('public.dl_cash_sync_entry()'), ('public.dl_cash_sync(bigint)')),
trg(tbl) AS (VALUES ('ct_round_trips'), ('ct_rt_legs'), ('local_moves'), ('dl_entries')),
parts AS (
  SELECT 1 AS grp, t.tbl AS k1, '' AS k2,
         format('CREATE TABLE IF NOT EXISTS public.%I (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);', t.tbl) AS stmt
    FROM t
  UNION ALL
  SELECT 2, s.relname, '', format('CREATE SEQUENCE IF NOT EXISTS public.%I;', s.relname)
    FROM pg_class s WHERE s.relkind = 'S' AND s.relnamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = s.oid AND d.deptype IN ('a', 'i'))
  UNION ALL
  SELECT 3, c.relname, lpad(a.attnum::text, 4, '0'),
         format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s%s;', c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                CASE WHEN a.attgenerated = 's' THEN ' GENERATED ALWAYS AS (' || pg_get_expr(d.adbin, d.adrelid) || ') STORED' ELSE '' END)
    FROM t JOIN pg_class c ON c.relname = t.tbl AND c.relnamespace = 'public'::regnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
   WHERE a.attname <> 'id'
  UNION ALL
  SELECT 4, c.relname, a.attname,
         format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s;', c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid))
    FROM t JOIN pg_class c ON c.relname = t.tbl AND c.relnamespace = 'public'::regnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
   WHERE a.attidentity = '' AND a.attgenerated = ''
  UNION ALL
  SELECT 5, c.relname, k.conname,
         format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', c.relname, k.conname, pg_get_constraintdef(k.oid))
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('ct_round_trips', 'ct_rt_legs', 'local_moves') AND k.contype = 'c'
  UNION ALL
  SELECT 6, i.tablename, i.indexname,
         regexp_replace(i.indexdef, '^CREATE (UNIQUE )?INDEX ', 'CREATE \1INDEX IF NOT EXISTS ') || ';'
    FROM pg_indexes i
   WHERE i.schemaname = 'public' AND i.tablename IN ('ct_rt_legs', 'local_moves', 'dl_entries') AND i.indexname NOT LIKE '%\_pkey'
  UNION ALL
  SELECT 7, f.sig, '', pg_get_functiondef(to_regprocedure(f.sig)) || ';' FROM f
  UNION ALL
  SELECT 8, c.relname, tg.tgname, pg_get_triggerdef(tg.oid) || ';'
    FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN trg ON trg.tbl = c.relname
   WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal
)
SELECT '-- GENERATED from production (SELECT only) for tms-auditor/test/plan-071.test.mjs. Do not edit by hand:' || E'\n'
    || '-- re-run the capture query of docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md Task 1 Step 2.' || E'\n'
    || string_agg(stmt, E'\n' ORDER BY grp, k1, k2) || E'\n'
FROM parts;
```
Expected: ένα κείμενο ~60–90 KB που αρχίζει από `-- GENERATED from production` και περιέχει `CREATE OR REPLACE FUNCTION public.rt_recompute(p_rt bigint)` και `CREATE TRIGGER rt_status_guard BEFORE UPDATE OF status ON public.ct_round_trips`.

- [ ] **Step 3: Γράψε το test (αποτυγχάνει μέχρι τα Task 2–6)**

`tms-auditor/test/plan-071.test.mjs`:
```js
// 071 (national v5 schema) and 071b (one truck / one driver at a time) on a production-shaped PGlite copy, at
// build time (principle 6): the owner's evening run should only confirm what this file already knows.
// Production shape = the 22/9 column fixture + fixtures/live-071.sql (read-only capture of production, plan
// docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md Task 1 Step 2): the live columns, defaults, CHECKs,
// indexes, and the round-trip / payroll / local-move functions and triggers 071 rewrites or fires.
// The money views (ct_v_rt_revenue, ct_v_rt_costs, ct_v_rt_pnl) and dl_v_rt_route are STUBS here: their
// before = after proof is real only on production (the dry run). Here the RULES are what is proved.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.mjs';
import { DRAFTS } from '../lib/db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
const LIVE = fs.readFileSync(path.join(HERE, 'fixtures/live-071.sql'), 'utf8');
let btreeGist = null;
try { ({ btree_gist: btreeGist } = await import('@electric-sql/pglite/contrib/btree_gist')); } catch { btreeGist = null; }

// signature -> [live md5 read 21/10, md5 after 071]
const FN = {
  'public.rt_status_guard()': ['f632fea1d6a5dd2cee7c80f4db9e27f2', 'd7757f99c3443ac167d5bdaf3e34b142'],
  'public.rt_recompute(bigint)': ['3f85092f030b2ad92a3002ab0a9cc98d', '5fa0a08418147b22d2852db3b8c72c3e'],
  'public.rt_auto_close(bigint)': ['88b41f860aaf7f925183ab84dc10c2dd', 'eba2146ca4c521da6365edd28c4507af'],
  'public.dl_local_day_sync(bigint,date)': ['a4a62603e5b0c4ad48124fea625aa611', '151dab06e2676f3c8885d7298d0ac6af'],
};
const STUBS = `
CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS SELECT id AS rt_id, 0::numeric AS revenue, 0::numeric AS revenue_intl,
  0::numeric AS revenue_natl FROM public.ct_round_trips;
CREATE OR REPLACE VIEW public.ct_v_rt_costs AS SELECT id AS rt_id, 0::numeric AS lines_net, 0::numeric AS vat, 0::numeric AS wear,
  0::numeric AS dl_trip_value, 0::numeric AS dl_expenses, 0::numeric AS driver_pay_pending, 0::bigint AS driver_pay_missing,
  0::numeric AS partner_planned, 0::numeric AS partner_invoiced FROM public.ct_round_trips;
CREATE OR REPLACE VIEW public.ct_v_rt_pnl AS SELECT id, 0::numeric AS cost_gross, 0::numeric AS profit_worst,
  0::numeric AS profit_ex_vat FROM public.ct_round_trips WHERE status <> 'cancelled';
CREATE OR REPLACE VIEW public.dl_v_rt_route AS SELECT id AS rt_id, ''::text AS route_text FROM public.ct_round_trips;
`;
const TRG = `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;

async function prodShaped() {
  const db = await freshDb(btreeGist ? { extensions: { btree_gist: btreeGist } } : {});
  await db.exec(`DO $r$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $r$;`);
  await db.exec(LIVE);
  await db.exec(STUBS);
  await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
  await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  return db;
}
async function errorOf(db, sql) { try { await db.exec(sql); return null; } catch (e) { return String(e.message); } }
const md5Of = async (db, sig) => (await db.query('SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = to_regprocedure($1)', [sig])).rows[0]?.m;
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);

test('071 + 071b on a production-shaped PGlite copy', async (t) => {
  const db = await prodShaped();
  const before = await count(db, TRG);

  await t.test('the fixture holds the LIVE texts 071 guards on (re-capture if this fails)', async () => {
    for (const [sig, [old]] of Object.entries(FN)) assert.equal(await md5Of(db, sig), old, sig);
  });

  await t.test('071 dry run runs to its end and keeps nothing', async () => {
    const msg = await errorOf(db, read('071_plan_schema_dryrun.sql'));
    assert.match(msg ?? '', /DRY RUN 071 finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}071 ran: tables 5, model column true, hub CROSS-DOCK, rt_recompute 5fa0a08418147b22d2852db3b8c72c3e, B-54 \d+/, msg);
    assert.equal((await db.query(`SELECT to_regclass('public.shipments')::text AS r`)).rows[0].r, null);
    assert.equal(await count(db, TRG), before);
  });

  await t.test('071 applies: +9 triggers, B-54 follows, the four functions hold the generated texts', async () => {
    assert.equal(await errorOf(db, read('071_plan_schema.sql')), null);
    assert.equal(await count(db, TRG), before + 9);
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), before + 9);
    for (const [sig, [, neu]] of Object.entries(FN)) assert.equal(await md5Of(db, sig), neu, sig);
  });

  await t.test('071 verify: in place, 0 rows, born closed', async () => {
    const r = (await db.query(read('071_plan_schema_verify.sql'))).rows[0];
    assert.equal(r.applied, '071 in place');
    assert.equal(r.b54_matches, true);
    for (const k of ['new_rows', 'v5_cycles', 'via_hub_stops', 'nat_loadings', 'open_relations', 'rls_off', 'policies', 'open_functions'])
      assert.equal(Number(r[k]), 0, k);
    assert.equal(Number(r.new_triggers), 9);
    assert.match(r.hub, / CROSS-DOCK$/);
  });

  await t.test('071 rules test: 54 OK, 0 FAIL, nothing kept', async () => {
    const msg = await errorOf(db, read('071_plan_schema_test.sql'));
    assert.match(msg ?? '', /RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept\. Result: 54 OK, 0 FAIL/, msg);
    assert.equal(await count(db, `SELECT (SELECT count(*) FROM shipments) + (SELECT count(*) FROM rt_stops)
      + (SELECT count(*) FROM ct_round_trips WHERE model = 2) AS n`), 0);
  });

  await t.test('071b: dry run keeps nothing, then applies, verify and 8 rules', { skip: btreeGist ? false : 'btree_gist not in PGlite 0.5.8' }, async () => {
    const dry = await errorOf(db, read('071b_plan_one_vehicle_dryrun.sql'));
    assert.match(dry ?? '', /DRY RUN 071b finished - EVERYTHING UNDONE, nothing kept\. The block ran to its end {2}\|\| {2}071b ran: rt_v2_truck_once true, rt_v2_driver_once true/, dry);
    assert.equal(await count(db, `SELECT count(*) AS n FROM pg_constraint WHERE conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')`), 0);
    assert.equal(await errorOf(db, read('071b_plan_one_vehicle.sql')), null);
    const v = (await db.query(read('071b_plan_one_vehicle_verify.sql'))).rows[0];
    assert.equal(v.truck_once, true); assert.equal(v.driver_once, true);
    assert.equal(Number(v.truck_overlaps), 0); assert.equal(Number(v.driver_overlaps), 0);
    const msg = await errorOf(db, read('071b_plan_one_vehicle_test.sql'));
    assert.match(msg ?? '', /RULES TEST 071b finished - EVERYTHING UNDONE, nothing kept\. Result: 8 OK, 0 FAIL/, msg);
    assert.equal(await count(db, TRG), before + 9, '071b adds no trigger');
    assert.equal(await errorOf(db, read('071b_plan_one_vehicle_rollback.sql')), null);
  });

  await t.test('071 rollback: the live texts back byte for byte, every object gone, B-54 back', async () => {
    assert.equal(await errorOf(db, read('071_plan_schema_rollback.sql')), null);
    for (const [sig, [old]] of Object.entries(FN)) assert.equal(await md5Of(db, sig), old, sig);
    assert.equal(await count(db, TRG), before);
    assert.equal(await count(db, `SELECT red_value AS n FROM monitoring.checks WHERE id = 'B-54'`), before);
    assert.equal(await count(db, `SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'public'
      AND ((table_name = 'ct_round_trips' AND column_name IN ('model', 'start_at', 'end_at', 'partner_rate'))
        OR (table_name = 'locations' AND column_name = 'is_hub') OR (table_name = 'order_stops' AND column_name = 'via_hub')
        OR (table_name = 'local_moves' AND column_name = 'rt_stop_id') OR (table_name = 'pl_movements' AND column_name = 'piece_leg_id'))`), 0);
    assert.equal((await db.query(`SELECT to_regclass('public.rt_stops')::text AS r`)).rows[0].r, null);
  });
});
```

- [ ] **Step 4: Τρέξε, να αποτύχει**

Run: `cd tms-auditor && node --test test/plan-071.test.mjs`
Expected: το πρώτο υπο-test **περνά** (η λήψη κρατά τα ζωντανά κείμενα). Το δεύτερο **αποτυγχάνει** με `ENOENT ... 071_plan_schema_dryrun.sql`. Αν αποτύχει το πρώτο ή το `prodShaped()` (λείπει αντικείμενο στο PGlite), πρόσθεσε τον πίνακα/τη συνάρτηση που λείπει στις λίστες `t` / `f` / `trg` του Step 2 και ξανάκανε τη λήψη. Ποτέ μην διορθώσεις το `live-071.sql` με το χέρι.

- [ ] **Step 5: Commit**

```bash
git add tms-auditor/lib/db.mjs tms-auditor/test/fixtures/live-071.sql tms-auditor/test/plan-071.test.mjs
git commit -m "071 PGlite harness: production-shaped copy (live capture 21/10) and the failing F1 test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Το migration `071_plan_schema.sql`

**Files:**
- Create: `worker/migrations/drafts/071_plan_schema.sql`

**Interfaces:**
- Consumes: Task 1 (harness)· τα md5 της «Αφετηρίας».
- Produces: όλα τα ονόματα της ενότητας Interfaces.

- [ ] **Step 1: Γράψε το αρχείο, αυτούσιο**

`worker/migrations/drafts/071_plan_schema.sql`:
```sql
-- 071 - NATIONAL v5, PHASE F1: THE SCHEMA, BORN CLOSED, 0 ROWS.
--
-- DRAFT - NOT EXECUTED. Spec docs/superpowers/specs/2026-10-21-national-v5-design.md (owner 21/10), plan
-- docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md. The owner runs it in the Supabase SQL editor AFTER
-- 15:00 (the team works 05:30-14:30), with an explicit yes, in this order:
--   0. 071_plan_schema_fingerprint.sql   read-only: md5 of every round trip and payroll line (keep the row)
--   1. 071_plan_schema_dryrun.sql        this block + a deliberate error: NOTHING kept
--   2. 071_plan_schema.sql               (this file)
--   3. 071_plan_schema_verify.sql        read-only, one row
--   4. 071_plan_schema_fingerprint.sql   again: the same md5s as in step 0
--   5. 071_plan_schema_test.sql          OPTIONAL on production (it advances the RT-/PM- code sequences): the rules
--                                        on TEST rows, ends in a deliberate error, nothing kept
-- 071b (one truck / one driver at a time, btree_gist) is a SEPARATE yes: 071b_plan_one_vehicle*.sql.
-- No Worker change, no screen change: the new tables are not in the facade's TABLES map, so no screen sees them.
-- ASCII only (clipboard-safe). ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT ADDS (nothing reads or writes it until F2 072 plan_*; every number of today stays the same):
--   1. locations.is_hub, exactly one: the Veroia cross-dock recJucKOhC1zh4IP3. Veroia stays a normal place
--      (spec 3, Board): it can be A or B of a national order; the flag says where pieces may split.
--   2. ct_round_trips: model (1 = today's round trips, 2 = a v5 cycle), start_at / end_at (written ONLY by the
--      base, from the cycle's live stops), partner_rate (one per cycle, PARTNER only). NO deleted_at: a cycle
--      that did not happen is status 'cancelled' (spec 2.1).
--   3. order_stops.via_hub: the hub declared per stop of an international order (spec 3, VS). Default false,
--      no backfill here: 074 sets it for the VS loads of day L.
--   4. shipments (one per A->B pair; a VS bridge copies NOTHING from its order_stops row), shipment_pieces
--      (split only at the hub), rt_stops (the stops of a cycle, a window per stop, side KATHODOS/ANODOS),
--      piece_legs (internal: which piece rides between which two stops of which cycle), plan_notices (the
--      notice channel of spec 7).
--   5. pl_movements.piece_leg_id + pl_mov_leg_once (one pallet writer per piece leg; F3 fills it).
--   6. local_moves: move_kind 'nat_loading' + rt_stop_id (the "loading by a local driver" of spec 3, Board).
--      Paid per day by the existing dl_local_day_sync, whose label names the cycle (RT-...) when the move has
--      no order.
--   7. Read views (security_invoker, money-free): v_shipments, v_piece_pos, v_piece_state, v_rt_stop_state,
--      v_rt_cycle, v_hub_bucket, v_national_order_state, v_vs_state. "Executed" = the Athens day of the stop's
--      planned_to has passed (spec 2.3), never a written status.
--   8. The rules, as low as they hold (principle 4): 9 triggers - ct_rt_legs_v2_guard (no order link on a v5
--      cycle), plan_rt_window_sync (a cycle's window = its live stops) and 7 DEFERRED constraint triggers
--      (checked at COMMIT) calling plan_chk(). A refusal: SQLSTATE 23514, HINT 'plan:<code>'.
--   9. Today's round-trip functions learn model=2, from their LIVE text (md5 read 21/10) + ONE line each:
--      rt_status_guard, rt_recompute, rt_auto_close return for model=2. The others (rt_sync_legs,
--      rt_sync_to_orders, rt_sync_to_national_loads, rt_create_from_order, rt_link_split, rt_merge,
--      rt_sync_from_order, rt_sync_national_load) reach a round trip only through ct_rt_legs, which
--      ct_rt_legs_v2_guard closes for model=2: unchanged. dl_sync_from_rt (011) unchanged on purpose: a v5
--      OWNED cycle with a driver gets its one payroll line exactly like today.
--  10. Born closed (principle 5): RLS on, no policy; every privilege revoked from PUBLIC, anon, authenticated,
--      service_role; SELECT only to service_role, tms_reader, tms_check_runner. EXECUTE on the 7 new functions
--      revoked from PUBLIC, anon, authenticated, service_role.
--  11. Auditor B-54 (enabled triggers in public): +9 in this block (37 -> 46 measured 21/10). The local mirror
--      (tms-auditor/checks/B-54.sql + 047b) is updated AFTER the run, not before.
--
-- PROOFS INSIDE THE BLOCK (any difference = everything undone): every round trip (vehicle, window, status,
-- revenue, every cost column, P&L) and every dl_entries row byte for byte before = after; local_moves,
-- order_stops and locations rows unchanged apart from the new columns; dl_v_rt_route / dl_v_rt_gap /
-- ct_v_rt_pnl counts unchanged; new tables 0 rows; model=2 0 rows; anon / authenticated hold nothing on the
-- new relations.
--
-- REVERSE: 071_plan_schema_rollback.sql (refuses if any v5 row exists).
-- EXPECTED: NOTICE "071 OK: ..." and ONE row "071 OK | 46 | 46 | <round trips before> | 0 | CROSS-DOCK".
-- Anything else (an ERROR): nothing was kept - copy the message to the coordinator.

DO $do$
DECLARE
  sg_old CONSTANT text := '  if new.status is not distinct from old.status then return new; end if;';
  sg_new CONSTANT text := '  if new.status is not distinct from old.status then return new; end if;' || E'\n'
    || '  if new.model = 2 then return new; end if; -- 071: a v5 cycle has no order links; its status is planned/cancelled only (CHECK rt_v2_status)';
  rc_old CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;';
  rc_new CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;' || E'\n'
    || '  if r.model = 2 then return; end if; -- 071: a v5 cycle is never cancelled or re-dated from order links (it has none)';
  ac_old CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;';
  ac_new CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;' || E'\n'
    || '  if r.model = 2 then return; end if; -- 071: a v5 cycle never closes by status; its end is read from its stops (v_rt_cycle)';
  ls_old CONSTANT text := '|| '' '' || lm.parent_order_id, sep ORDER BY lm.id)';
  ls_new CONSTANT text := '|| '' '' || coalesce(lm.parent_order_id::text, (SELECT r.code FROM rt_stops s JOIN ct_round_trips r ON r.id = s.rt_id WHERE s.id = lm.rt_stop_id)), sep ORDER BY lm.id) -- 071: a nat_loading has no order, it names its cycle';
  -- Every round trip with its money, as 034 fingerprinted it (034:149-164). New columns are not in it.
  snap_rt_sql CONSTANT text := $q$
    SELECT md5(coalesce(string_agg(s.x, '|' ORDER BY s.id), '')) FROM (
      SELECT rt.id, jsonb_build_object(
        'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type, 'truck', rt.truck_id,
        'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id, 'date_start', rt.date_start,
        'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km, 'notes', rt.notes,
        'updated_at', rt.updated_at, 'revenue', rv.revenue, 'revenue_intl', rv.revenue_intl,
        'revenue_natl', rv.revenue_natl, 'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear,
        'dl_trip_value', c.dl_trip_value, 'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending,
        'pay_missing', c.driver_pay_missing, 'partner_planned', c.partner_planned,
        'partner_invoiced', c.partner_invoiced, 'pnl_cost_gross', p.cost_gross,
        'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat)::text AS x
      FROM public.ct_round_trips rt
      JOIN public.ct_v_rt_revenue rv ON rv.rt_id = rt.id
      JOIN public.ct_v_rt_costs c ON c.rt_id = rt.id
      LEFT JOIN public.ct_v_rt_pnl p ON p.id = rt.id) s $q$;
  -- Every payroll line whole; local moves, order stops and locations without the columns 071 adds.
  snap_rows_sql CONSTANT text := $q$
    SELECT concat_ws(' ',
      (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e),
      (SELECT md5(coalesce(string_agg((to_jsonb(m) - 'rt_stop_id')::text, '|' ORDER BY m.id), '')) FROM public.local_moves m),
      (SELECT md5(coalesce(string_agg((to_jsonb(s) - 'via_hub')::text, '|' ORDER BY s.id), '')) FROM public.order_stops s),
      (SELECT md5(coalesce(string_agg((to_jsonb(l) - 'is_hub')::text, '|' ORDER BY l.id), '')) FROM public.locations l),
      (SELECT count(*) FROM public.dl_v_rt_route), (SELECT count(*) FROM public.dl_v_rt_gap),
      (SELECT count(*) FROM public.ct_v_rt_pnl)) $q$;
  v_fn record; v_src text; v_new text;
  v_trg0 int; v_trg1 int; v_k int; v_hub bigint;
  v_rt0 text; v_rt1 text; v_rows0 text; v_rows1 text;
BEGIN
  -- ALTER TABLE on ct_round_trips / order_stops / locations / local_moves / pl_movements takes a strong lock:
  -- behind an idle open transaction it would wait forever while every app read queues behind it. Give up after
  -- 5 s instead - the whole block rolls back, nothing half-done; run it again a little later (as 057/060/069).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read only): the base is what was measured 21/10.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '071: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF to_regclass('public.shipments') IS NOT NULL OR to_regclass('public.rt_stops') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'ct_round_trips' AND column_name = 'model') THEN
    RAISE EXCEPTION '071: already applied (a 071 object exists) - run 071_plan_schema_verify.sql instead';
  END IF;
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', 'f632fea1d6a5dd2cee7c80f4db9e27f2'),
      ('public.rt_recompute(bigint)', '3f85092f030b2ad92a3002ab0a9cc98d'),
      ('public.rt_auto_close(bigint)', '88b41f860aaf7f925183ab84dc10c2dd'),
      ('public.dl_local_day_sync(bigint,date)', 'a4a62603e5b0c4ad48124fea625aa611')) v(sig, m) LOOP
    IF to_regprocedure(v_fn.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) IS DISTINCT FROM v_fn.m THEN
      RAISE EXCEPTION '071: % is not the live text read 21/10 (expected md5 %) - stop, re-measure', v_fn.sig, v_fn.m;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn.sig)
                AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']
                     OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql'))) THEN
      RAISE EXCEPTION '071: % is not plpgsql SECURITY DEFINER SET search_path = public as read 21/10 - stop', v_fn.sig;
    END IF;
  END LOOP;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_chk')
       IS DISTINCT FROM 'CHECK ((move_kind = ANY (ARRAY[''local''::text, ''relay_delivery''::text, ''relay_loading''::text])))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_parent')
       IS DISTINCT FROM 'CHECK ((((move_kind = ''local''::text) AND (parent_order_id IS NULL)) OR ((move_kind <> ''local''::text) AND (parent_order_id IS NOT NULL) AND (parent_nat_load_id IS NULL))))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_relay_trailer')
       IS DISTINCT FROM 'CHECK (((move_kind = ''local''::text) OR (driver_id IS NULL) OR (trailer_id IS NOT NULL)))' THEN
    RAISE EXCEPTION '071: a local_moves CHECK is not the 060 text read 21/10 - stop';
  END IF;
  -- The columns the views read and F2 plan_orders_create fills (spec 7): present, with these types.
  SELECT count(*) INTO v_k FROM (VALUES
      ('national_orders', 'client_id', 'bigint'), ('national_orders', 'price', 'numeric'),
      ('national_orders', 'reference', 'text'), ('national_orders', 'pallets', 'numeric'),
      ('national_orders', 'temperature_c', 'numeric'), ('national_orders', 'goods', 'text'),
      ('national_orders', 'notes', 'text'), ('national_orders', 'loading_datetime', 'date'),
      ('national_orders', 'delivery_datetime', 'date'), ('national_orders', 'pickup_location_1_id', 'bigint'),
      ('national_orders', 'delivery_location_1_id', 'bigint'), ('national_orders', 'pallet_exchange', 'boolean'),
      ('national_orders', 'deleted_at', 'timestamp with time zone'),
      ('orders', 'direction', 'text'), ('orders', 'cross_dock_date', 'date'), ('orders', 'client_id', 'bigint'),
      ('orders', 'reference', 'text'), ('orders', 'temperature_c', 'numeric'), ('orders', 'pallet_exchange', 'boolean'),
      ('orders', 'deleted_at', 'timestamp with time zone'),
      ('order_stops', 'stop_type', 'text'), ('order_stops', 'stop_number', 'numeric'),
      ('order_stops', 'location_id', 'bigint'), ('order_stops', 'pallets', 'numeric'),
      ('order_stops', 'datetime', 'date'), ('order_stops', 'temperature', 'numeric'),
      ('order_stops', 'deleted_at', 'timestamp with time zone')) v(t, c, ty)
   JOIN information_schema.columns ic
     ON ic.table_schema = 'public' AND ic.table_name = v.t AND ic.column_name = v.c AND ic.data_type = v.ty;
  IF v_k <> 27 THEN
    RAISE EXCEPTION '071: a column the views or F2 rely on is missing or has another type (% of 27) - stop', v_k;
  END IF;
  SELECT count(*) INTO v_k FROM public.locations WHERE legacy_id = 'recJucKOhC1zh4IP3' AND deleted_at IS NULL;
  IF v_k <> 1 THEN
    RAISE EXCEPTION '071: the Veroia cross-dock location (recJucKOhC1zh4IP3) is not exactly one live row (%)', v_k;
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- run_checks compares against coalesce(baseline, red_value): a baseline would make the bump below a no-op.
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '071: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', v_trg0;
  END IF;
  EXECUTE snap_rt_sql INTO v_rt0;
  EXECUTE snap_rows_sql INTO v_rows0;

  -- 1. The hub.
  ALTER TABLE public.locations ADD COLUMN is_hub boolean NOT NULL DEFAULT false;
  CREATE UNIQUE INDEX locations_one_hub ON public.locations (is_hub) WHERE is_hub;
  UPDATE public.locations SET is_hub = true
   WHERE legacy_id = 'recJucKOhC1zh4IP3' AND deleted_at IS NULL RETURNING id INTO v_hub;

  -- 2. The cycle. Existing rows take model 1 from the DEFAULT (no rewrite, PG >= 11).
  ALTER TABLE public.ct_round_trips
    ADD COLUMN model smallint NOT NULL DEFAULT 1,
    ADD COLUMN start_at timestamptz,
    ADD COLUMN end_at timestamptz,
    ADD COLUMN partner_rate numeric(10,2),
    ADD CONSTRAINT rt_model CHECK (model IN (1, 2)),
    ADD CONSTRAINT rt_v2_scope CHECK (model = 1 OR scope = 'NATL'),
    ADD CONSTRAINT rt_v2_status CHECK (model = 1 OR status IN ('planned', 'cancelled')),
    ADD CONSTRAINT rt_v2_window CHECK (model = 1 OR (start_at IS NOT NULL AND end_at > start_at)),
    ADD CONSTRAINT rt_v1_no_window CHECK (model = 2 OR (start_at IS NULL AND end_at IS NULL)),
    ADD CONSTRAINT rt_v2_dates CHECK (model = 1 OR (date_start = (start_at AT TIME ZONE 'Europe/Athens')::date
                                                    AND date_end = (end_at AT TIME ZONE 'Europe/Athens')::date)),
    ADD CONSTRAINT rt_partner_rate CHECK (partner_rate IS NULL
                                          OR (model = 2 AND trip_type = 'PARTNER' AND partner_rate >= 0));

  -- 3. The hub per stop of an international order.
  ALTER TABLE public.order_stops
    ADD COLUMN via_hub boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT order_stops_via_hub_intl CHECK (NOT via_hub OR order_id IS NOT NULL);

  -- 4. The new tables.
  CREATE TABLE public.shipments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id bigint REFERENCES public.orders (id) ON DELETE RESTRICT,
    nat_order_id bigint REFERENCES public.national_orders (id) ON DELETE RESTRICT,
    order_stop_id bigint REFERENCES public.order_stops (id) ON DELETE RESTRICT,
    origin_location_id bigint REFERENCES public.locations (id) ON DELETE RESTRICT,
    dest_location_id bigint REFERENCES public.locations (id) ON DELETE RESTRICT,
    pallets numeric(6,1),
    load_from timestamptz, load_to timestamptz, deliver_from timestamptz, deliver_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    CONSTRAINT shipments_one_parent CHECK (num_nonnulls(order_id, nat_order_id) = 1),
    CONSTRAINT shipments_bridge_intl CHECK (order_stop_id IS NULL OR order_id IS NOT NULL),
    -- v5 first version: an international order enters only as a VS bridge (export groupage postponed, spec 3).
    CONSTRAINT shipments_intl_is_bridge CHECK (order_id IS NULL OR order_stop_id IS NOT NULL),
    -- A bridge copies NOTHING (places, pallets, days are read from order_stops / orders via v_shipments);
    -- a national shipment carries all of them (owner #12: a window from-to everywhere).
    CONSTRAINT shipments_shape CHECK (
      (order_stop_id IS NOT NULL AND origin_location_id IS NULL AND dest_location_id IS NULL AND pallets IS NULL
        AND load_from IS NULL AND load_to IS NULL AND deliver_from IS NULL AND deliver_to IS NULL)
      OR (order_stop_id IS NULL AND origin_location_id IS NOT NULL AND dest_location_id IS NOT NULL
        AND pallets IS NOT NULL AND load_from IS NOT NULL AND load_to IS NOT NULL
        AND deliver_from IS NOT NULL AND deliver_to IS NOT NULL)),
    CONSTRAINT shipments_pallets CHECK (pallets IS NULL OR pallets > 0),
    CONSTRAINT shipments_win CHECK (load_from IS NULL
      OR (load_from <= load_to AND deliver_from <= deliver_to AND load_from <= deliver_to)),
    CONSTRAINT shipments_ends CHECK (order_stop_id IS NOT NULL OR origin_location_id <> dest_location_id),
    CONSTRAINT shipments_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                    AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE UNIQUE INDEX shipments_bridge_once ON public.shipments (order_stop_id)
    WHERE order_stop_id IS NOT NULL AND deleted_at IS NULL;
  CREATE INDEX shipments_order ON public.shipments (order_id) WHERE order_id IS NOT NULL;
  CREATE INDEX shipments_nat_order ON public.shipments (nat_order_id) WHERE nat_order_id IS NOT NULL;

  CREATE TABLE public.shipment_pieces (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id bigint NOT NULL REFERENCES public.shipments (id) ON DELETE RESTRICT,
    parent_piece_id bigint REFERENCES public.shipment_pieces (id) ON DELETE RESTRICT,
    pallets numeric(6,1) NOT NULL,
    leave_by date,
    split_at timestamptz, split_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    CONSTRAINT pieces_pallets CHECK (pallets > 0),
    CONSTRAINT pieces_split_pair CHECK ((split_at IS NULL) = (split_by IS NULL)),
    CONSTRAINT pieces_not_own_parent CHECK (parent_piece_id IS DISTINCT FROM id),
    CONSTRAINT pieces_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                 AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE INDEX shipment_pieces_shipment ON public.shipment_pieces (shipment_id);
  CREATE INDEX shipment_pieces_parent ON public.shipment_pieces (parent_piece_id) WHERE parent_piece_id IS NOT NULL;

  CREATE TABLE public.rt_stops (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rt_id bigint NOT NULL,
    seq smallint NOT NULL,
    location_id bigint NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
    side text NOT NULL,
    planned_from timestamptz NOT NULL,
    planned_to timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    -- DEFERRED: plan_rt_create writes the stops FIRST and the cycle with its computed window after them, in one
    -- transaction (spec 7), so CHECK rt_v2_window and the payroll day of 011 hold from the first row.
    CONSTRAINT rt_stops_rt_fk FOREIGN KEY (rt_id) REFERENCES public.ct_round_trips (id)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT rt_stops_rt_id UNIQUE (rt_id, id),
    CONSTRAINT rt_stops_seq CHECK (seq > 0),
    CONSTRAINT rt_stops_side CHECK (side IN ('KATHODOS', 'ANODOS')),
    CONSTRAINT rt_stops_win CHECK (planned_to >= planned_from),
    CONSTRAINT rt_stops_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                   AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );

  CREATE TABLE public.piece_legs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    piece_id bigint NOT NULL REFERENCES public.shipment_pieces (id) ON DELETE RESTRICT,
    leg_no smallint NOT NULL,
    rt_id bigint NOT NULL,
    pickup_stop_id bigint NOT NULL,
    drop_stop_id bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    deleted_at timestamptz, deleted_reason text, deleted_by text,
    -- Both stops belong to the leg's own cycle: a composite key, not a trigger.
    CONSTRAINT piece_legs_pickup_fk FOREIGN KEY (rt_id, pickup_stop_id) REFERENCES public.rt_stops (rt_id, id) ON DELETE RESTRICT,
    CONSTRAINT piece_legs_drop_fk FOREIGN KEY (rt_id, drop_stop_id) REFERENCES public.rt_stops (rt_id, id) ON DELETE RESTRICT,
    CONSTRAINT piece_legs_no CHECK (leg_no > 0),
    CONSTRAINT piece_legs_two_stops CHECK (pickup_stop_id <> drop_stop_id),
    CONSTRAINT piece_legs_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                     AND (deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE UNIQUE INDEX piece_legs_live_no ON public.piece_legs (piece_id, leg_no) WHERE deleted_at IS NULL;
  CREATE INDEX piece_legs_rt ON public.piece_legs (rt_id);
  CREATE INDEX piece_legs_pickup ON public.piece_legs (pickup_stop_id);
  CREATE INDEX piece_legs_drop ON public.piece_legs (drop_stop_id);

  CREATE TABLE public.plan_notices (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    to_desk text NOT NULL,
    kind text NOT NULL,
    message text NOT NULL,
    order_id bigint REFERENCES public.orders (id) ON DELETE RESTRICT,
    nat_order_id bigint REFERENCES public.national_orders (id) ON DELETE RESTRICT,
    rt_id bigint REFERENCES public.ct_round_trips (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    read_at timestamptz, read_by text,
    CONSTRAINT plan_notices_desk CHECK (to_desk IN ('intl', 'natl')),
    CONSTRAINT plan_notices_kind CHECK (kind ~ '^[a-z_]+$'),
    CONSTRAINT plan_notices_read_pair CHECK ((read_at IS NULL) = (read_by IS NULL))
  );
  CREATE INDEX plan_notices_unread ON public.plan_notices (to_desk, created_at) WHERE read_at IS NULL;

  -- 5. Pallets (F3 writes it) and the loading by a local driver.
  ALTER TABLE public.pl_movements ADD COLUMN piece_leg_id bigint REFERENCES public.piece_legs (id) ON DELETE RESTRICT;
  CREATE UNIQUE INDEX pl_mov_leg_once ON public.pl_movements (piece_leg_id, event_type)
    WHERE piece_leg_id IS NOT NULL AND status <> 'reversed';
  ALTER TABLE public.local_moves ADD COLUMN rt_stop_id bigint REFERENCES public.rt_stops (id) ON DELETE RESTRICT;
  -- Same meaning for every existing row (the only kinds today are local / relay_*); nat_loading added. A
  -- nat_loading needs no trailer (spec 3: no mandatory question; plan_local_loading may ask for one in F2).
  ALTER TABLE public.local_moves
    DROP CONSTRAINT local_moves_kind_chk,
    DROP CONSTRAINT local_moves_kind_parent,
    DROP CONSTRAINT local_moves_relay_trailer,
    ADD CONSTRAINT local_moves_kind_chk CHECK (move_kind IN ('local', 'relay_delivery', 'relay_loading', 'nat_loading')),
    ADD CONSTRAINT local_moves_kind_parent CHECK (
      (move_kind = 'local' AND parent_order_id IS NULL)
      OR (move_kind IN ('relay_delivery', 'relay_loading') AND parent_order_id IS NOT NULL AND parent_nat_load_id IS NULL)
      OR (move_kind = 'nat_loading' AND parent_order_id IS NULL AND parent_nat_load_id IS NULL)),
    ADD CONSTRAINT local_moves_relay_trailer CHECK (move_kind IN ('local', 'nat_loading') OR driver_id IS NULL OR trailer_id IS NOT NULL),
    ADD CONSTRAINT local_moves_nat_loading CHECK (
      (move_kind = 'nat_loading') = (rt_stop_id IS NOT NULL)
      AND (move_kind <> 'nat_loading' OR (driver_id IS NOT NULL AND status IN ('Assigned', 'Cancelled'))));
  CREATE UNIQUE INDEX local_moves_nat_loading_once ON public.local_moves (rt_stop_id)
    WHERE move_kind = 'nat_loading' AND deleted_at IS NULL AND status <> 'Cancelled';

  -- 6. The read views. ONE definition of "where is a piece" (v_piece_pos) and of "executed" (Athens day of
  -- planned_to passed, spec 2.3); the triggers below read the same views, never a second copy.
  CREATE VIEW public.v_shipments WITH (security_invoker = true) AS
  SELECT sh.id AS shipment_id,
         CASE WHEN sh.order_stop_id IS NULL THEN 'national'
              WHEN o.direction = 'Import' THEN 'vs_import' ELSE 'vs_export' END AS kind,
         sh.order_id, sh.nat_order_id, sh.order_stop_id,
         coalesce(n.client_id, o.client_id) AS client_id,
         coalesce(n.reference, o.reference) AS reference,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.origin_location_id
              WHEN o.direction = 'Import' THEN (SELECT f.location_id FROM public.order_stops f
                     WHERE f.order_id = sh.order_id AND f.stop_type = 'Loading' AND f.deleted_at IS NULL
                     ORDER BY f.stop_number NULLS LAST, f.id LIMIT 1)
              ELSE st.location_id END AS origin_location_id,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.dest_location_id
              WHEN o.direction = 'Import' THEN st.location_id
              ELSE (SELECT f.location_id FROM public.order_stops f
                     WHERE f.order_id = sh.order_id AND f.stop_type = 'Unloading' AND f.deleted_at IS NULL
                     ORDER BY f.stop_number DESC NULLS LAST, f.id DESC LIMIT 1) END AS dest_location_id,
         -- the national part: import VS = hub -> Greek stop; export VS = Greek stop -> hub
         CASE WHEN sh.order_stop_id IS NULL THEN sh.origin_location_id
              WHEN o.direction = 'Import' THEN hub.id ELSE st.location_id END AS nat_from_location_id,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.dest_location_id
              WHEN o.direction = 'Import' THEN st.location_id ELSE hub.id END AS nat_to_location_id,
         CASE WHEN sh.order_stop_id IS NULL THEN sh.pallets ELSE st.pallets END AS pallets,
         CASE WHEN sh.order_stop_id IS NULL THEN (sh.load_from AT TIME ZONE 'Europe/Athens')::date
              WHEN o.direction = 'Import' THEN o.cross_dock_date ELSE st.datetime END AS nat_ready_day,
         CASE WHEN sh.order_stop_id IS NULL THEN (sh.deliver_to AT TIME ZONE 'Europe/Athens')::date
              WHEN o.direction = 'Import' THEN st.datetime ELSE o.cross_dock_date END AS nat_due_day,
         sh.load_from, sh.load_to, sh.deliver_from, sh.deliver_to,
         CASE WHEN sh.order_stop_id IS NULL THEN n.temperature_c ELSE coalesce(st.temperature, o.temperature_c) END AS temperature_c,
         coalesce(CASE WHEN sh.order_stop_id IS NULL THEN n.pallet_exchange ELSE o.pallet_exchange END, false) AS pallet_exchange,
         (sh.deleted_at IS NULL AND n.deleted_at IS NULL AND o.deleted_at IS NULL
          AND (sh.order_stop_id IS NULL OR st.deleted_at IS NULL)) AS live,
         sh.created_at, sh.created_by, sh.deleted_at
  FROM public.shipments sh
  LEFT JOIN public.orders o ON o.id = sh.order_id
  LEFT JOIN public.national_orders n ON n.id = sh.nat_order_id
  LEFT JOIN public.order_stops st ON st.id = sh.order_stop_id
  LEFT JOIN public.locations hub ON hub.is_hub;

  CREATE VIEW public.v_piece_pos WITH (security_invoker = true) AS
  WITH RECURSIVE own AS (
    SELECT p.id AS piece_id, p.parent_piece_id, p.shipment_id, p.pallets, p.leave_by,
           (SELECT l.id FROM public.piece_legs l WHERE l.piece_id = p.id AND l.deleted_at IS NULL
             ORDER BY l.leg_no DESC LIMIT 1) AS own_last_leg_id,
           EXISTS (SELECT 1 FROM public.shipment_pieces c WHERE c.parent_piece_id = p.id AND c.deleted_at IS NULL) AS is_split
    FROM public.shipment_pieces p WHERE p.deleted_at IS NULL
  ), walk AS (
    -- a child piece without legs of its own sits where its parent's last leg left it (the hub)
    SELECT o.piece_id, o.parent_piece_id, o.shipment_id, o.pallets, o.leave_by, o.own_last_leg_id, o.is_split,
           o.own_last_leg_id AS eff_last_leg_id
    FROM own o WHERE o.parent_piece_id IS NULL
    UNION ALL
    SELECT c.piece_id, c.parent_piece_id, c.shipment_id, c.pallets, c.leave_by, c.own_last_leg_id, c.is_split,
           coalesce(c.own_last_leg_id, w.eff_last_leg_id)
    FROM own c JOIN walk w ON w.piece_id = c.parent_piece_id
  )
  SELECT w.piece_id, w.parent_piece_id, w.shipment_id, w.pallets, w.leave_by, w.is_split,
         w.own_last_leg_id, w.eff_last_leg_id, ll.drop_stop_id AS last_drop_stop_id,
         coalesce(ds.location_id, vs.nat_from_location_id) AS position_location_id
  FROM walk w
  JOIN public.v_shipments vs ON vs.shipment_id = w.shipment_id
  LEFT JOIN public.piece_legs ll ON ll.id = w.eff_last_leg_id
  LEFT JOIN public.rt_stops ds ON ds.id = ll.drop_stop_id;

  CREATE VIEW public.v_piece_state WITH (security_invoker = true) AS
  SELECT pp.piece_id, pp.shipment_id, vs.kind, vs.order_id, vs.nat_order_id, vs.order_stop_id,
         pp.parent_piece_id, pp.pallets, pp.leave_by, pp.position_location_id, pp.last_drop_stop_id,
         (pp.position_location_id = hub.id) IS TRUE AS at_hub,
         (pp.position_location_id IS DISTINCT FROM vs.nat_to_location_id) AS waiting,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id THEN pp.last_drop_stop_id END AS end_stop_id,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id THEN es.planned_to END AS national_end_at,
         CASE WHEN pp.position_location_id = vs.nat_to_location_id
              THEN (es.planned_to AT TIME ZONE 'Europe/Athens')::date END AS end_day,
         vs.nat_ready_day, vs.nat_due_day,
         -- spec 2.3: executed = the Athens day of the end stop's planned_to has passed; a cancelled cycle never is
         (pp.position_location_id = vs.nat_to_location_id AND er.status <> 'cancelled'
          AND (es.planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) IS TRUE AS executed,
         -- spec 2.3: late = the planned delivery day is after the requested day
         (pp.position_location_id = vs.nat_to_location_id
          AND (es.planned_to AT TIME ZONE 'Europe/Athens')::date > vs.nat_due_day) IS TRUE AS late,
         (pp.position_location_id IS DISTINCT FROM vs.nat_to_location_id
          AND coalesce(pp.leave_by, vs.nat_due_day) < (now() AT TIME ZONE 'Europe/Athens')::date) IS TRUE AS overdue,
         (pp.parent_piece_id IS NOT NULL AND pp.own_last_leg_id IS NULL) AS is_stock
  FROM public.v_piece_pos pp
  JOIN public.v_shipments vs ON vs.shipment_id = pp.shipment_id AND vs.live
  LEFT JOIN public.locations hub ON hub.is_hub
  LEFT JOIN public.rt_stops es ON es.id = pp.last_drop_stop_id
  LEFT JOIN public.ct_round_trips er ON er.id = es.rt_id
  WHERE NOT pp.is_split;

  CREATE VIEW public.v_rt_stop_state WITH (security_invoker = true) AS
  WITH st AS (
    SELECT s.id AS stop_id, s.rt_id, r.code, s.seq, s.side, s.location_id, s.planned_from, s.planned_to,
           (s.planned_to AT TIME ZONE 'Europe/Athens')::date AS stop_day,
           (r.status <> 'cancelled'
            AND (s.planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) AS executed,
           CASE r.trip_type WHEN 'OWNED' THEN r.truck_id IS NOT NULL ELSE r.partner_id IS NOT NULL END AS has_vehicle,
           EXISTS (SELECT 1 FROM public.v_piece_state ps WHERE ps.end_stop_id = s.id AND ps.late) AS has_late,
           r.status AS rt_status
    FROM public.rt_stops s JOIN public.ct_round_trips r ON r.id = s.rt_id
    WHERE s.deleted_at IS NULL AND r.model = 2
  )
  -- spec 3, Board: what is executed dims (40%), per day; never without a vehicle, never when late
  SELECT st.*, (st.executed AND st.has_vehicle AND NOT st.has_late) AS dim,
         bool_and(st.executed AND st.has_vehicle AND NOT st.has_late) OVER (PARTITION BY st.rt_id, st.side) AS side_dim,
         bool_and(st.executed AND st.has_vehicle AND NOT st.has_late) OVER (PARTITION BY st.rt_id) AS cycle_dim
  FROM st;

  CREATE VIEW public.v_rt_cycle WITH (security_invoker = true) AS
  SELECT r.id AS rt_id, r.code, r.status, r.trip_type, r.truck_id, r.trailer_id, r.driver_id, r.partner_id,
         r.start_at, r.end_at, r.date_start, r.date_end,
         (SELECT count(*) FROM public.rt_stops s WHERE s.rt_id = r.id AND s.deleted_at IS NULL) AS n_stops,
         (SELECT count(*) FROM public.piece_legs l WHERE l.rt_id = r.id AND l.deleted_at IS NULL) AS n_legs,
         -- spec 2.3: the end of a cycle = the day of its last stop has passed (the same rule /costs/rt will use)
         (r.status <> 'cancelled'
          AND (r.end_at AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) AS ended
  FROM public.ct_round_trips r WHERE r.model = 2;

  CREATE VIEW public.v_hub_bucket WITH (security_invoker = true) AS
  SELECT ps.piece_id, ps.shipment_id, ps.kind, ps.order_id, ps.nat_order_id, ps.order_stop_id, ps.pallets,
         ps.is_stock, ps.leave_by, ps.overdue, ps.nat_ready_day, ps.nat_due_day, ds.rt_id AS inbound_rt_id
  FROM public.v_piece_state ps
  LEFT JOIN public.rt_stops ds ON ds.id = ps.last_drop_stop_id
  WHERE ps.at_hub AND ps.waiting;

  CREATE VIEW public.v_national_order_state WITH (security_invoker = true) AS
  SELECT ps.nat_order_id, count(*) AS n_pieces, count(*) FILTER (WHERE ps.executed) AS n_executed,
         -- spec 2.3: a national order is delivered only when EVERY piece has an executed delivery stop
         bool_and(ps.executed) AS executed, bool_and(NOT ps.waiting) AS planned, bool_or(ps.late) AS late
  FROM public.v_piece_state ps WHERE ps.nat_order_id IS NOT NULL
  GROUP BY ps.nat_order_id;

  CREATE VIEW public.v_vs_state WITH (security_invoker = true) AS
  SELECT ps.order_id,
         count(DISTINCT ps.piece_id) AS n_pieces,
         bool_and(ps.executed) AS all_executed,
         bool_and(NOT ps.waiting) AS all_planned,
         -- spec 3, VS: the international shows the FIRST hub day, the others as a hint
         min(CASE WHEN ps.kind = 'vs_import' THEN (pk.planned_from AT TIME ZONE 'Europe/Athens')::date
                  ELSE (dr.planned_to AT TIME ZONE 'Europe/Athens')::date END) AS first_hub_day,
         coalesce(jsonb_agg(DISTINCT jsonb_build_object('rt_id', r.id, 'code', r.code, 'trip_type', r.trip_type,
                    'truck_id', r.truck_id, 'driver_id', r.driver_id, 'partner_id', r.partner_id,
                    'hub_day', CASE WHEN ps.kind = 'vs_import' THEN (pk.planned_from AT TIME ZONE 'Europe/Athens')::date
                                    ELSE (dr.planned_to AT TIME ZONE 'Europe/Athens')::date END))
                  FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS carriers
  FROM public.v_piece_state ps
  LEFT JOIN public.piece_legs l ON l.piece_id = ps.piece_id AND l.deleted_at IS NULL
  LEFT JOIN public.rt_stops pk ON pk.id = l.pickup_stop_id
  LEFT JOIN public.rt_stops dr ON dr.id = l.drop_stop_id
  LEFT JOIN public.ct_round_trips r ON r.id = l.rt_id
  WHERE ps.kind IN ('vs_import', 'vs_export')
  GROUP BY ps.order_id;

  -- 7. The rules. Each *_problem returns NULL or '<code>:<detail>'; plan_chk raises it with HINT 'plan:<code>'.
  CREATE FUNCTION public.plan_local_loading_problem(p_lm bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  lm local_moves%rowtype; s rt_stops%rowtype; r ct_round_trips%rowtype;
begin
  select * into lm from local_moves where id = p_lm;
  if lm.id is null or lm.move_kind <> 'nat_loading' or lm.deleted_at is not null or lm.status = 'Cancelled' then
    return null;
  end if;
  select * into s from rt_stops where id = lm.rt_stop_id;
  select * into r from ct_round_trips where id = s.rt_id;
  -- spec 3, Board: when the stop goes (clear, move, delete) the local loading goes with it, in the same list
  if s.deleted_at is not null or r.status = 'cancelled' then return 'local_loading_gone:' || p_lm; end if;
  -- the payroll day (dl_local_day_sync) is the Athens day the loading starts
  if lm.move_date <> (s.planned_from at time zone 'Europe/Athens')::date then return 'local_loading_day:' || p_lm; end if;
  if not exists (select 1 from piece_legs l where l.pickup_stop_id = s.id and l.deleted_at is null) then
    return 'local_loading_stop:' || p_lm;
  end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_rt_problem(p_rt bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  r ct_round_trips%rowtype; s_min timestamptz; s_max timestamptz; x bigint; prob text;
begin
  select * into r from ct_round_trips where id = p_rt;
  if r.id is null then return null; end if;  -- the deferred FK rt_stops_rt_fk speaks for a missing cycle
  if r.model <> 2 then
    if exists (select 1 from rt_stops where rt_id = p_rt) then return 'rt_not_v2:' || p_rt; end if;
    return null;
  end if;
  -- seq is unique among LIVE stops: a trigger, not a UNIQUE, because a partial unique index cannot be deferred
  if exists (select 1 from rt_stops where rt_id = p_rt and deleted_at is null group by seq having count(*) > 1) then
    return 'stop_seq:' || p_rt;
  end if;
  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null and b.planned_from < a.planned_from) then
    return 'stop_order:' || p_rt;
  end if;
  if exists (select 1 from rt_stops a join rt_stops b on b.rt_id = a.rt_id and b.seq > a.seq
              where a.rt_id = p_rt and a.deleted_at is null and b.deleted_at is null
                and a.side = 'ANODOS' and b.side = 'KATHODOS') then
    return 'side_order:' || p_rt;
  end if;
  select min(planned_from), max(planned_to) into s_min, s_max from rt_stops where rt_id = p_rt and deleted_at is null;
  if s_min is not null and (r.start_at, r.end_at) is distinct from (s_min, s_max) then return 'rt_window:' || p_rt; end if;
  if r.status = 'cancelled' and exists (select 1 from piece_legs where rt_id = p_rt and deleted_at is null) then
    return 'rt_cancelled:' || p_rt;
  end if;
  for x in select lm.id from local_moves lm join rt_stops s on s.id = lm.rt_stop_id
            where s.rt_id = p_rt and lm.move_kind = 'nat_loading' and lm.deleted_at is null and lm.status <> 'Cancelled' loop
    prob := plan_local_loading_problem(x);
    if prob is not null then return prob; end if;
  end loop;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_leg_problem(p_leg bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  l piece_legs%rowtype; pk rt_stops%rowtype; dr rt_stops%rowtype; prev rt_stops%rowtype;
  r ct_round_trips%rowtype; p shipment_pieces%rowtype; vs v_shipments%rowtype;
  hub_id bigint; start_loc bigint;
begin
  select * into l from piece_legs where id = p_leg;
  if l.id is null or l.deleted_at is not null then return null; end if;
  select * into r from ct_round_trips where id = l.rt_id;
  if r.model is distinct from 2 then return 'rt_not_v2:' || l.rt_id; end if;
  if r.status = 'cancelled' then return 'rt_cancelled:' || l.rt_id; end if;
  select * into pk from rt_stops where id = l.pickup_stop_id;
  select * into dr from rt_stops where id = l.drop_stop_id;
  if pk.deleted_at is not null or dr.deleted_at is not null then return 'leg_stop_dead:' || p_leg; end if;
  if pk.seq >= dr.seq then return 'leg_order:' || p_leg; end if;
  select * into p from shipment_pieces where id = l.piece_id;
  select * into vs from v_shipments where shipment_id = p.shipment_id;
  if p.deleted_at is not null or not vs.live then return 'piece_dead:' || p.id; end if;
  -- a piece rides only between its national start, the hub and its national end (it splits only at the hub)
  select id into hub_id from locations where is_hub;
  if pk.location_id = dr.location_id
     or (pk.location_id is distinct from vs.nat_from_location_id and pk.location_id is distinct from hub_id)
     or (dr.location_id is distinct from vs.nat_to_location_id and dr.location_id is distinct from hub_id) then
    return 'leg_place:' || p_leg;
  end if;
  -- the chain: leg n loads where the previous live leg unloaded; a child piece where its parent sits; else at its start
  select s.* into prev from piece_legs q join rt_stops s on s.id = q.drop_stop_id
   where q.piece_id = l.piece_id and q.deleted_at is null and q.leg_no < l.leg_no
   order by q.leg_no desc limit 1;
  if prev.id is not null then
    start_loc := prev.location_id;
  elsif p.parent_piece_id is not null then
    select s.* into prev from v_piece_pos pp join rt_stops s on s.id = pp.last_drop_stop_id where pp.piece_id = p.parent_piece_id;
    select pp.position_location_id into start_loc from v_piece_pos pp where pp.piece_id = p.parent_piece_id;
  else
    start_loc := vs.nat_from_location_id;
  end if;
  if pk.location_id is distinct from start_loc then return 'chain:' || p_leg; end if;
  -- it cannot be picked up before it can have arrived
  if prev.id is not null and pk.planned_from < prev.planned_from then return 'chain_time:' || p_leg; end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_shipment_problem(p_sh bigint) RETURNS text
    LANGUAGE plpgsql STABLE SET search_path = public AS $f$
declare
  sh shipments%rowtype; target numeric; leaves numeric; bad bigint; hub_id bigint; prob text;
begin
  select * into sh from shipments where id = p_sh;
  if sh.id is null then return null; end if;
  -- a live leg never hangs on a deleted piece
  select l.id into bad from piece_legs l join shipment_pieces p on p.id = l.piece_id
   where p.shipment_id = p_sh and l.deleted_at is null and p.deleted_at is not null limit 1;
  if bad is not null then return 'piece_dead:' || bad; end if;
  -- a deleted shipment keeps nothing alive under it
  if sh.deleted_at is not null then
    select p.id into bad from shipment_pieces p where p.shipment_id = p_sh and p.deleted_at is null limit 1;
    if bad is not null then return 'pieces_alive:' || bad; end if;
    return null;
  end if;
  -- the live leaves sum to the shipment (a bridge: to its order stop; a deleted stop: to 0)
  target := case when sh.order_stop_id is null then sh.pallets
                 else (select st.pallets from order_stops st where st.id = sh.order_stop_id and st.deleted_at is null) end;
  select coalesce(sum(p.pallets), 0) into leaves from shipment_pieces p
   where p.shipment_id = p_sh and p.deleted_at is null
     and not exists (select 1 from shipment_pieces c where c.parent_piece_id = p.id and c.deleted_at is null);
  if leaves <> coalesce(target, 0) then
    return format('pieces_sum:%s:%s<>%s', p_sh, leaves, coalesce(target, 0));
  end if;
  select p.id into bad from shipment_pieces p join shipment_pieces q on q.id = p.parent_piece_id
   where p.shipment_id = p_sh and p.deleted_at is null and (q.deleted_at is not null or q.shipment_id <> p.shipment_id)
   limit 1;
  if bad is not null then return 'piece_parent:' || bad; end if;
  -- spec 3, Board: a load splits only at Veroia
  select id into hub_id from locations where is_hub;
  select pp.piece_id into bad from v_piece_pos pp
   where pp.shipment_id = p_sh and pp.is_split and pp.position_location_id is distinct from hub_id limit 1;
  if bad is not null then return 'split_not_at_hub:' || bad; end if;
  for bad in select l.id from piece_legs l join shipment_pieces p on p.id = l.piece_id
              where p.shipment_id = p_sh and l.deleted_at is null order by l.piece_id, l.leg_no loop
    prob := plan_leg_problem(bad);
    if prob is not null then return prob; end if;
  end loop;
  return null;
end
$f$;

  -- One trigger function for the 7 deferred checks: SECURITY DEFINER, so the check does not depend on the
  -- privileges of whoever commits (the Worker's service_role reads none of the helpers).
  CREATE FUNCTION public.plan_chk() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  prob text; x bigint;
begin
  if tg_table_name = 'ct_round_trips' then
    if tg_op = 'UPDATE' and old.model is distinct from new.model then
      prob := 'model_locked:' || new.id;
    elsif new.model = 2 then
      prob := plan_rt_problem(new.id);
    end if;
  elsif tg_table_name = 'rt_stops' then
    if tg_op = 'UPDATE' and old.rt_id is distinct from new.rt_id then
      prob := 'stop_locked:' || new.id;
    else
      prob := plan_rt_problem(new.rt_id);
      if prob is null then
        for x in select distinct p.shipment_id from piece_legs l join shipment_pieces p on p.id = l.piece_id
                  where l.pickup_stop_id = new.id or l.drop_stop_id = new.id loop
          prob := plan_shipment_problem(x);
          exit when prob is not null;
        end loop;
      end if;
    end if;
  elsif tg_table_name = 'piece_legs' then
    -- a leg never changes: soft delete it and add a new one (every change leaves its trace)
    if tg_op = 'UPDATE' and (old.piece_id, old.leg_no, old.rt_id, old.pickup_stop_id, old.drop_stop_id)
                            is distinct from (new.piece_id, new.leg_no, new.rt_id, new.pickup_stop_id, new.drop_stop_id) then
      prob := 'leg_locked:' || new.id;
    else
      prob := coalesce(plan_shipment_problem((select p.shipment_id from shipment_pieces p where p.id = new.piece_id)),
                       plan_rt_problem(new.rt_id));
    end if;
  elsif tg_table_name = 'shipment_pieces' then
    if tg_op = 'UPDATE' and (old.shipment_id, old.parent_piece_id) is distinct from (new.shipment_id, new.parent_piece_id) then
      prob := 'piece_locked:' || new.id;
    else
      prob := plan_shipment_problem(new.shipment_id);
    end if;
  elsif tg_table_name = 'shipments' then
    if tg_op = 'UPDATE' and (old.order_id, old.nat_order_id, old.order_stop_id)
                            is distinct from (new.order_id, new.nat_order_id, new.order_stop_id) then
      prob := 'shipment_locked:' || new.id;
    else
      prob := plan_shipment_problem(new.id);
    end if;
  elsif tg_table_name = 'order_stops' then
    for x in select s.id from shipments s where s.order_stop_id = new.id and s.deleted_at is null loop
      prob := plan_shipment_problem(x);
      exit when prob is not null;
    end loop;
  elsif tg_table_name = 'local_moves' then
    prob := plan_local_loading_problem(new.id);
  end if;
  if prob is not null then
    raise exception 'plan rule broken: %', prob using errcode = '23514', hint = 'plan:' || split_part(prob, ':', 1);
  end if;
  return null;
end
$f$;

  CREATE FUNCTION public.plan_rt_window_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  rid bigint; s timestamptz; e timestamptz;
begin
  -- 071 (spec 2.1): start_at / end_at of a v5 cycle are written ONLY here, from its live stops; date_start /
  -- date_end are their Athens days, so the payroll line (011 dl_sync_from_rt) and DKV follow the stops.
  foreach rid in array array_remove(array[case when tg_op <> 'DELETE' then new.rt_id end,
                                          case when tg_op <> 'INSERT' then old.rt_id end], null) loop
    select min(planned_from), max(planned_to) into s, e from rt_stops where rt_id = rid and deleted_at is null;
    -- no live stop left: the window stays (the cycle is cancelled, or gets new stops, in the same transaction)
    continue when s is null;
    update ct_round_trips
       set start_at = s, end_at = e,
           date_start = (s at time zone 'Europe/Athens')::date, date_end = (e at time zone 'Europe/Athens')::date,
           updated_at = now()
     where id = rid and model = 2 and (start_at, end_at) is distinct from (s, e);
  end loop;
  return null;
end
$f$;

  CREATE FUNCTION public.ct_rt_legs_v2_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
begin
  -- 071: an order link is the v1 way to fill a round trip (033/034/037, POST /costs/rt). A v5 cycle is filled
  -- only by plan_* through rt_stops / piece_legs; refusing here keeps every v1 trigger away from it.
  if exists (select 1 from ct_round_trips where id = new.rt_id and model = 2) then
    raise exception 'plan rule broken: an order link cannot attach to the v5 cycle %', new.rt_id
      using errcode = '23514', hint = 'plan:v1_link_on_v2';
  end if;
  return new;
end
$f$;

  -- 8. The 9 triggers.
  CREATE TRIGGER ct_rt_legs_v2_guard BEFORE INSERT OR UPDATE OF rt_id ON public.ct_rt_legs
    FOR EACH ROW EXECUTE FUNCTION public.ct_rt_legs_v2_guard();
  CREATE TRIGGER plan_rt_window_sync AFTER INSERT OR UPDATE OR DELETE ON public.rt_stops
    FOR EACH ROW EXECUTE FUNCTION public.plan_rt_window_sync();
  CREATE CONSTRAINT TRIGGER plan_chk_rt AFTER INSERT OR UPDATE ON public.ct_round_trips
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_stops AFTER INSERT OR UPDATE ON public.rt_stops
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_legs AFTER INSERT OR UPDATE ON public.piece_legs
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_pieces AFTER INSERT OR UPDATE ON public.shipment_pieces
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_shipments AFTER INSERT OR UPDATE ON public.shipments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_bridge_stop AFTER UPDATE OF pallets, deleted_at ON public.order_stops
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (old.pallets IS DISTINCT FROM new.pallets OR old.deleted_at IS DISTINCT FROM new.deleted_at)
    EXECUTE FUNCTION public.plan_chk();
  CREATE CONSTRAINT TRIGGER plan_chk_local_loading AFTER INSERT OR UPDATE ON public.local_moves
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (new.move_kind = 'nat_loading')
    EXECUTE FUNCTION public.plan_chk();

  -- 9. Today's functions learn model=2: the LIVE text + one line, generated (never retyped) and proven
  -- reversible. CREATE OR REPLACE keeps the oid, owner, grants and the triggers that call them.
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', sg_old, sg_new, 'd7757f99c3443ac167d5bdaf3e34b142'),
      ('public.rt_recompute(bigint)', rc_old, rc_new, '5fa0a08418147b22d2852db3b8c72c3e'),
      ('public.rt_auto_close(bigint)', ac_old, ac_new, 'eba2146ca4c521da6365edd28c4507af'),
      ('public.dl_local_day_sync(bigint,date)', ls_old, ls_new, '151dab06e2676f3c8885d7298d0ac6af')) v(sig, a, b, m) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig);
    IF (length(v_src) - length(replace(v_src, v_fn.a, ''))) <> length(v_fn.a) THEN
      RAISE EXCEPTION '071: the substitution target is not in % exactly once - stop', v_fn.sig;
    END IF;
    v_new := replace(v_src, v_fn.a, v_fn.b);
    IF replace(v_new, v_fn.b, v_fn.a) <> v_src OR md5(v_new) <> v_fn.m THEN
      RAISE EXCEPTION '071: the generated text of % is not the one measured (md5 %) - stop', v_fn.sig, md5(v_new);
    END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      split_part(v_fn.sig, '(', 1), pg_get_function_arguments(to_regprocedure(v_fn.sig)),
      pg_get_function_result(to_regprocedure(v_fn.sig)), v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) <> v_fn.m THEN
      RAISE EXCEPTION '071 proof: % does not hold the generated text', v_fn.sig;
    END IF;
  END LOOP;

  -- 10. Born closed.
  ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.shipment_pieces ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.rt_stops ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.piece_legs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.plan_notices ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.shipments, public.shipment_pieces, public.rt_stops, public.piece_legs, public.plan_notices,
    public.v_shipments, public.v_piece_pos, public.v_piece_state, public.v_rt_stop_state, public.v_rt_cycle,
    public.v_hub_bucket, public.v_national_order_state, public.v_vs_state
    FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON public.shipments, public.shipment_pieces, public.rt_stops, public.piece_legs, public.plan_notices,
    public.v_shipments, public.v_piece_pos, public.v_piece_state, public.v_rt_stop_state, public.v_rt_cycle,
    public.v_hub_bucket, public.v_national_order_state, public.v_vs_state
    TO service_role, tms_reader, tms_check_runner;
  REVOKE ALL ON SEQUENCE public.shipments_id_seq, public.shipment_pieces_id_seq, public.rt_stops_id_seq,
    public.piece_legs_id_seq, public.plan_notices_id_seq FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.plan_chk(), public.plan_rt_window_sync(), public.ct_rt_legs_v2_guard(),
    public.plan_shipment_problem(bigint), public.plan_leg_problem(bigint), public.plan_rt_problem(bigint),
    public.plan_local_loading_problem(bigint) FROM PUBLIC, anon, authenticated, service_role;

  -- 11. PROOFS.
  EXECUTE snap_rt_sql INTO v_rt1;
  EXECUTE snap_rows_sql INTO v_rows1;
  IF v_rt1 <> v_rt0 OR v_rows1 <> v_rows0 THEN
    RAISE EXCEPTION '071 proof: a number of today changed (round trips % -> %, rows % -> %)', v_rt0, v_rt1, v_rows0, v_rows1;
  END IF;
  IF (SELECT count(*) FROM public.ct_round_trips WHERE model <> 1) <> 0
     OR (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
        + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
        + (SELECT count(*) FROM public.plan_notices) <> 0
     OR (SELECT count(*) FROM public.locations WHERE is_hub) <> 1 THEN
    RAISE EXCEPTION '071 proof: a new table has rows, a round trip is not model 1, or the hub is not exactly one';
  END IF;
  SELECT count(*) INTO v_k FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices', 'v_shipments',
                       'v_piece_pos', 'v_piece_state', 'v_rt_stop_state', 'v_rt_cycle', 'v_hub_bucket',
                       'v_national_order_state', 'v_vs_state')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
  IF v_k <> 0 THEN RAISE EXCEPTION '071 proof: % new relation(s) are open to anon / authenticated / service_role writes', v_k; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
              AND relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices') AND NOT relrowsecurity)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices')) THEN
    RAISE EXCEPTION '071 proof: RLS off or a policy on a new table';
  END IF;
  SELECT count(*) INTO v_k FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('plan_chk', 'plan_rt_window_sync', 'ct_rt_legs_v2_guard', 'plan_shipment_problem',
                       'plan_leg_problem', 'plan_rt_problem', 'plan_local_loading_problem')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_k <> 0 THEN RAISE EXCEPTION '071 proof: % new function(s) executable by an API role', v_k; END IF;

  -- B-54: exactly nine triggers more.
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 + 9 THEN
    RAISE EXCEPTION '071 proof: trigger count % -> % (expected +9)', v_trg0, v_trg1;
  END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '071: B-54 not updated (% rows)', v_k; END IF;

  RAISE NOTICE '071 OK: v5 schema in place, 0 rows, hub %, four functions learnt model=2; triggers % -> %, B-54 = %',
    v_hub, v_trg0, v_trg1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regclass('public.shipments') IS NOT NULL
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) = '5fa0a08418147b22d2852db3b8c72c3e'
            THEN '071 OK' ELSE '071 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.ct_round_trips WHERE model = 1) AS v1_cycles,
       (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles,
       (SELECT name FROM public.locations WHERE is_hub) AS hub;
```

- [ ] **Step 2: Έλεγχος ASCII**

Run: `LC_ALL=C grep -n '[^ -~]' worker/migrations/drafts/071_plan_schema.sql | head`
Expected: καμία γραμμή.

- [ ] **Step 3: Commit**

```bash
git add worker/migrations/drafts/071_plan_schema.sql
git commit -m "071 (SQL, DRAFT): national v5 schema born closed, 0 rows, B-54 +9

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Γεννήτρια dry run, verify, fingerprint, rollback

**Files:**
- Create: `worker/migrations/drafts/tools/build-071-dryruns.mjs`
- Create (παράγεται): `worker/migrations/drafts/071_plan_schema_dryrun.sql`
- Create: `worker/migrations/drafts/071_plan_schema_verify.sql`
- Create: `worker/migrations/drafts/071_plan_schema_fingerprint.sql`
- Create: `worker/migrations/drafts/071_plan_schema_rollback.sql`

**Interfaces:**
- Consumes: `071_plan_schema.sql` (Task 2)· `071b_plan_one_vehicle.sql` (Task 6: η γεννήτρια παράγει και το δικό του dry run, που μέχρι τότε λείπει)
- Produces: `PAIRS`, `buildDryRun(src, pair)`, `DIR` από τη γεννήτρια (για το `tests/sql-071-drafts.test.js`)

- [ ] **Step 1: Η γεννήτρια**

`worker/migrations/drafts/tools/build-071-dryruns.mjs`:
```js
// Generates the two 071 dry runs FROM their sources:
//   071_plan_schema.sql       -> 071_plan_schema_dryrun.sql
//   071b_plan_one_vehicle.sql -> 071b_plan_one_vehicle_dryrun.sql
//   node worker/migrations/drafts/tools/build-071-dryruns.mjs          (writes both; a missing source is skipped)
//   node worker/migrations/drafts/tools/build-071-dryruns.mjs --check  (exit 1 if a committed file drifted)
// Why generated, never hand-copied (principle 3): a dry run is only worth anything if it runs EXACTLY the
// statements the owner will run. tests/sql-071-drafts.test.js fails when a committed dry run differs.
// Shape (as 069): ONE DO $dry$ block - the source's DO block VERBATIM as a nested block (its guards and proofs
// raise their own messages and stop everything), a read of what it did, and a final RAISE EXCEPTION that
// carries the result line and undoes all of it. The sources are ASCII only, so the outputs are.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The folder that holds the 071 files. After the owner runs them they leave drafts/ (CLAUDE.md rule 5): then
// this becomes path.resolve(HERE, '../..') and nothing else changes.
export const DIR = path.resolve(HERE, '..');
const OPEN = '\nDO $do$\n';
const CLOSE = '\nEND $do$;\n';

const COMMON = `-- DO NOT EDIT BY HAND: edit the source and regenerate (tests/sql-071-drafts.test.js fails on any drift).
-- WHY ONE DO BLOCK: the Supabase SQL editor is NOT atomic across statements (lesson 056), but ONE DO block is
--   ONE statement: its final error undoes everything inside it. ASCII only.`;

export const PAIRS = [
  {
    source: '071_plan_schema.sql', target: '071_plan_schema_dryrun.sql', name: 'DRY RUN 071',
    header: `-- 071 DRY RUN - GENERATED by worker/migrations/drafts/tools/build-071-dryruns.mjs from 071_plan_schema.sql.
${COMMON}
-- WHAT: 071's own DO block, statement for statement (every guard, the new tables, views, rules and triggers, the
--   four rewrites, the grants, the before = after proofs, the B-54 bump), then a read of the result, ENDING WITH A
--   DELIBERATE ERROR: NOTHING is kept.
-- WHEN: AFTER 15:00 (the team works 05:30-14:30), BEFORE 071_plan_schema.sql. Same 5 s lock timeout as 071.
-- EXPECTED (the red ERROR is deliberate): a NOTICE "071 OK: ..." and then
--   ERROR: P0001: DRY RUN 071 finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  071 ran:
--   tables 5, model column true, hub CROSS-DOCK, rt_recompute 5fa0a08418147b22d2852db3b8c72c3e, B-54 46
--   Anything else (an ERROR from one of 071's guards): do NOT run 071, copy the message to the coordinator.`,
    epilogue: `  res := format('071 ran: tables %s, model column %s, hub %s, rt_recompute %s, B-54 %s',
    (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
       AND relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices')),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'ct_round_trips' AND column_name = 'model')::text,
    (SELECT name FROM public.locations WHERE is_hub),
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure),
    (SELECT red_value FROM monitoring.checks WHERE id = 'B-54'));`,
  },
  {
    source: '071b_plan_one_vehicle.sql', target: '071b_plan_one_vehicle_dryrun.sql', name: 'DRY RUN 071b',
    header: `-- 071b DRY RUN - GENERATED by worker/migrations/drafts/tools/build-071-dryruns.mjs from 071b_plan_one_vehicle.sql.
${COMMON}
-- WHAT: 071b's own DO block (guards, CREATE EXTENSION btree_gist, the two EXCLUDE constraints, the proofs), then a
--   read of the result, ENDING WITH A DELIBERATE ERROR: NOTHING is kept (no extension, no constraint).
-- WHEN: AFTER 071 and after 15:00, with the separate yes for 071b, BEFORE 071b_plan_one_vehicle.sql.
-- EXPECTED (the red ERROR is deliberate): a NOTICE "071b OK: ..." and then
--   ERROR: P0001: DRY RUN 071b finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  071b ran:
--   rt_v2_truck_once true, rt_v2_driver_once true, btree_gist <version>
--   Anything else: do NOT run 071b, copy the message to the coordinator.`,
    epilogue: `  res := format('071b ran: rt_v2_truck_once %s, rt_v2_driver_once %s, btree_gist %s',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_truck_once')::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_driver_once')::text,
    (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist'));`,
  },
];

export function buildDryRun(src, pair) {
  const a = src.indexOf(OPEN);
  const b = src.lastIndexOf(CLOSE);
  if (a < 0 || b < 0 || b < a) throw new Error(`${pair.source}: the DO $do$ ... END $do$; block was not found`);
  const body = src.slice(a + OPEN.length, b);   // "DECLARE ... BEGIN ... " of the source, verbatim
  if (body.includes('$dry$')) throw new Error(`${pair.source}: contains $dry$ - choose other tags`);
  return `${pair.header}

DO $dry$
DECLARE
  res text;
BEGIN
  -- ===== ${pair.source}, verbatim =====
${body}
END;
  -- ===== what it did =====
${pair.epilogue}
  RAISE EXCEPTION '${pair.name} finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  %', res;
END
$dry$;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let drift = 0;
  for (const p of PAIRS) {
    const source = path.join(DIR, p.source);
    if (!fs.existsSync(source)) { console.log('skip (no source yet): ' + p.source); continue; }
    const out = buildDryRun(fs.readFileSync(source, 'utf8'), p);
    const target = path.join(DIR, p.target);
    if (check) { if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== out) { drift++; console.error('drift: ' + p.target); } }
    else { fs.writeFileSync(target, out); console.log('wrote ' + p.target); }
  }
  process.exit(drift ? 1 : 0);
}
```

- [ ] **Step 2: Παράγαγε το dry run**

Run: `node worker/migrations/drafts/tools/build-071-dryruns.mjs`
Expected: `wrote 071_plan_schema_dryrun.sql` και `skip (no source yet): 071b_plan_one_vehicle.sql`.

- [ ] **Step 3: Το verify**

`worker/migrations/drafts/071_plan_schema_verify.sql`:
```sql
-- 071 VERIFY - read-only (SELECT only, writes nothing). Run after 071_plan_schema.sql and any time later.
-- ONE row. ASCII only. It errors before 071 (the new relations do not exist yet) - that is expected.
-- EXPECTED right after 071 (F1, before any F2 call):
--   applied = '071 in place' ; b54_matches = true ; new_triggers = 9 ; new_rows = 0 ; v5_cycles = 0 ;
--   v1_cycles = the round trips before 071 ; hub = '360 CROSS-DOCK' ; via_hub_stops = 0 ; nat_loadings = 0 ;
--   open_relations = 0 ; rls_off = 0 ; policies = 0 ; open_functions = 0
-- After F2/F5 new_rows, v5_cycles, via_hub_stops and nat_loadings grow; the last four stay 0 for ever.
SELECT
  CASE WHEN to_regclass('public.shipments') IS NOT NULL AND to_regclass('public.rt_stops') IS NOT NULL
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_status_guard()'::regprocedure) = 'd7757f99c3443ac167d5bdaf3e34b142'
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) = '5fa0a08418147b22d2852db3b8c72c3e'
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_auto_close(bigint)'::regprocedure) = 'eba2146ca4c521da6365edd28c4507af'
        AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure) = '151dab06e2676f3c8885d7298d0ac6af'
       THEN '071 in place' ELSE '071 NOT in place' END AS applied,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_matches,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'
     AND tgname IN ('ct_rt_legs_v2_guard', 'plan_rt_window_sync', 'plan_chk_rt', 'plan_chk_stops', 'plan_chk_legs',
                    'plan_chk_pieces', 'plan_chk_shipments', 'plan_chk_bridge_stop', 'plan_chk_local_loading')) AS new_triggers,
  (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces) + (SELECT count(*) FROM public.rt_stops)
    + (SELECT count(*) FROM public.piece_legs) + (SELECT count(*) FROM public.plan_notices) AS new_rows,
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 2) AS v5_cycles,
  (SELECT count(*) FROM public.ct_round_trips WHERE model = 1) AS v1_cycles,
  (SELECT string_agg(id || ' ' || name, ', ') FROM public.locations WHERE is_hub) AS hub,
  (SELECT count(*) FROM public.order_stops WHERE via_hub) AS via_hub_stops,
  (SELECT count(*) FROM public.local_moves WHERE move_kind = 'nat_loading') AS nat_loadings,
  (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices', 'v_shipments', 'v_piece_pos',
                       'v_piece_state', 'v_rt_stop_state', 'v_rt_cycle', 'v_hub_bucket', 'v_national_order_state', 'v_vs_state')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) AS open_relations,
  (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
     AND relname IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices') AND NOT relrowsecurity) AS rls_off,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
     AND tablename IN ('shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices')) AS policies,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('plan_chk', 'plan_rt_window_sync', 'ct_rt_legs_v2_guard', 'plan_shipment_problem', 'plan_leg_problem',
                       'plan_rt_problem', 'plan_local_loading_problem')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('service_role', p.oid, 'EXECUTE'))) AS open_functions;
```

- [ ] **Step 4: Το fingerprint (πριν και μετά)**

`worker/migrations/drafts/071_plan_schema_fingerprint.sql`:
```sql
-- 071 FINGERPRINT - read-only (SELECT only). Run it BEFORE 071 and again AFTER it: rt_md5 and dl_md5 must be equal.
-- The authoritative proof is inside 071's block (same SQL, one transaction); this is the owner's own eye on it.
-- If dl_md5 differs, someone saved payroll in between: look for dl_entries.updated_at after the first run.
-- ASCII only. Works before and after 071 (it reads no 071 column).
SELECT
  (SELECT count(*) FROM public.ct_round_trips) AS round_trips,
  (SELECT md5(coalesce(string_agg(s.x, '|' ORDER BY s.id), '')) FROM (
     SELECT rt.id, jsonb_build_object(
       'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type, 'truck', rt.truck_id,
       'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id, 'date_start', rt.date_start,
       'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km, 'notes', rt.notes,
       'updated_at', rt.updated_at, 'revenue', rv.revenue, 'revenue_intl', rv.revenue_intl,
       'revenue_natl', rv.revenue_natl, 'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear,
       'dl_trip_value', c.dl_trip_value, 'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending,
       'pay_missing', c.driver_pay_missing, 'partner_planned', c.partner_planned,
       'partner_invoiced', c.partner_invoiced, 'pnl_cost_gross', p.cost_gross,
       'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat)::text AS x
     FROM public.ct_round_trips rt
     JOIN public.ct_v_rt_revenue rv ON rv.rt_id = rt.id
     JOIN public.ct_v_rt_costs c ON c.rt_id = rt.id
     LEFT JOIN public.ct_v_rt_pnl p ON p.id = rt.id) s) AS rt_md5,
  (SELECT count(*) FROM public.dl_entries) AS dl_rows,
  (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e) AS dl_md5,
  now() AT TIME ZONE 'Europe/Athens' AS read_at_athens;
```

- [ ] **Step 5: Το rollback**

`worker/migrations/drafts/071_plan_schema_rollback.sql`:
```sql
-- 071 ROLLBACK - everything 071 added goes, the four functions get their live text of 21/10 back BYTE FOR BYTE,
-- B-54 -9. Every number of today proven unchanged inside the block.
-- DRAFT - NOT EXECUTED. Only with an explicit yes, after 15:00. ORDER: 071b_plan_one_vehicle_rollback.sql FIRST if
-- 071b is in place (this block refuses otherwise: dropping start_at would silently drop the EXCLUDE constraints).
-- It REFUSES as soon as one v5 row exists (spec 2.2: after the first real v5 row there is no going back, only fixes
-- forward). ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "071 ROLLBACK OK ..." and ONE row "071 ROLLED BACK | 37 | 37".

DO $do$
DECLARE
  sg_old CONSTANT text := '  if new.status is not distinct from old.status then return new; end if;';
  sg_new CONSTANT text := '  if new.status is not distinct from old.status then return new; end if;' || E'\n'
    || '  if new.model = 2 then return new; end if; -- 071: a v5 cycle has no order links; its status is planned/cancelled only (CHECK rt_v2_status)';
  rc_old CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;';
  rc_new CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;' || E'\n'
    || '  if r.model = 2 then return; end if; -- 071: a v5 cycle is never cancelled or re-dated from order links (it has none)';
  ac_old CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;';
  ac_new CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;' || E'\n'
    || '  if r.model = 2 then return; end if; -- 071: a v5 cycle never closes by status; its end is read from its stops (v_rt_cycle)';
  ls_old CONSTANT text := '|| '' '' || lm.parent_order_id, sep ORDER BY lm.id)';
  ls_new CONSTANT text := '|| '' '' || coalesce(lm.parent_order_id::text, (SELECT r.code FROM rt_stops s JOIN ct_round_trips r ON r.id = s.rt_id WHERE s.id = lm.rt_stop_id)), sep ORDER BY lm.id) -- 071: a nat_loading has no order, it names its cycle';
  snap_rt_sql CONSTANT text := $q$
    SELECT md5(coalesce(string_agg(s.x, '|' ORDER BY s.id), '')) FROM (
      SELECT rt.id, jsonb_build_object(
        'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type, 'truck', rt.truck_id,
        'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id, 'date_start', rt.date_start,
        'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km, 'notes', rt.notes,
        'updated_at', rt.updated_at, 'revenue', rv.revenue, 'revenue_intl', rv.revenue_intl,
        'revenue_natl', rv.revenue_natl, 'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear,
        'dl_trip_value', c.dl_trip_value, 'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending,
        'pay_missing', c.driver_pay_missing, 'partner_planned', c.partner_planned,
        'partner_invoiced', c.partner_invoiced, 'pnl_cost_gross', p.cost_gross,
        'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat)::text AS x
      FROM public.ct_round_trips rt
      JOIN public.ct_v_rt_revenue rv ON rv.rt_id = rt.id
      JOIN public.ct_v_rt_costs c ON c.rt_id = rt.id
      LEFT JOIN public.ct_v_rt_pnl p ON p.id = rt.id) s $q$;
  snap_rows_sql CONSTANT text := $q$
    SELECT concat_ws(' ',
      (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e),
      (SELECT md5(coalesce(string_agg((to_jsonb(m) - 'rt_stop_id')::text, '|' ORDER BY m.id), '')) FROM public.local_moves m),
      (SELECT md5(coalesce(string_agg((to_jsonb(s) - 'via_hub')::text, '|' ORDER BY s.id), '')) FROM public.order_stops s),
      (SELECT md5(coalesce(string_agg((to_jsonb(l) - 'is_hub')::text, '|' ORDER BY l.id), '')) FROM public.locations l),
      (SELECT count(*) FROM public.dl_v_rt_route), (SELECT count(*) FROM public.dl_v_rt_gap),
      (SELECT count(*) FROM public.ct_v_rt_pnl)) $q$;
  v_fn record; v_src text; v_old text;
  v_trg0 int; v_trg1 int; v_k int;
  v_rt0 text; v_rt1 text; v_rows0 text; v_rows1 text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS: 071 is what is installed, untouched since, and holds no v5 row.
  IF to_regclass('public.shipments') IS NULL THEN
    RAISE EXCEPTION '071 rollback: 071 is not applied - nothing to undo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
              AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) THEN
    RAISE EXCEPTION '071 rollback: 071b is in place - run 071b_plan_one_vehicle_rollback.sql first';
  END IF;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices)
       + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2 OR partner_rate IS NOT NULL)
       + (SELECT count(*) FROM public.local_moves WHERE move_kind = 'nat_loading' OR rt_stop_id IS NOT NULL)
       + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL)
       + (SELECT count(*) FROM public.order_stops WHERE via_hub)
    INTO v_k;
  IF v_k <> 0 THEN
    RAISE EXCEPTION '071 rollback: % v5 row(s) exist - after the first real v5 row there is no rollback, only fixes forward (spec 2.2)', v_k;
  END IF;
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', 'd7757f99c3443ac167d5bdaf3e34b142'),
      ('public.rt_recompute(bigint)', '5fa0a08418147b22d2852db3b8c72c3e'),
      ('public.rt_auto_close(bigint)', 'eba2146ca4c521da6365edd28c4507af'),
      ('public.dl_local_day_sync(bigint,date)', '151dab06e2676f3c8885d7298d0ac6af')) v(sig, m) LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) IS DISTINCT FROM v_fn.m THEN
      RAISE EXCEPTION '071 rollback: % is not the 071 text (expected md5 %) - edited since, stop', v_fn.sig, v_fn.m;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '071 rollback: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', v_trg0;
  END IF;
  EXECUTE snap_rt_sql INTO v_rt0;
  EXECUTE snap_rows_sql INTO v_rows0;

  -- 1. The 9 triggers and the 7 functions.
  DROP TRIGGER plan_chk_local_loading ON public.local_moves;
  DROP TRIGGER plan_chk_bridge_stop ON public.order_stops;
  DROP TRIGGER plan_chk_shipments ON public.shipments;
  DROP TRIGGER plan_chk_pieces ON public.shipment_pieces;
  DROP TRIGGER plan_chk_legs ON public.piece_legs;
  DROP TRIGGER plan_chk_stops ON public.rt_stops;
  DROP TRIGGER plan_rt_window_sync ON public.rt_stops;
  DROP TRIGGER plan_chk_rt ON public.ct_round_trips;
  DROP TRIGGER ct_rt_legs_v2_guard ON public.ct_rt_legs;
  DROP FUNCTION public.plan_chk(), public.plan_rt_window_sync(), public.ct_rt_legs_v2_guard(),
    public.plan_shipment_problem(bigint), public.plan_leg_problem(bigint), public.plan_rt_problem(bigint),
    public.plan_local_loading_problem(bigint);

  -- 2. The views.
  DROP VIEW public.v_vs_state, public.v_national_order_state, public.v_hub_bucket, public.v_rt_cycle,
    public.v_rt_stop_state, public.v_piece_state, public.v_piece_pos, public.v_shipments;

  -- 3. The four functions back: the swap the other way, proven = the live text of 21/10.
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', sg_old, sg_new, 'f632fea1d6a5dd2cee7c80f4db9e27f2'),
      ('public.rt_recompute(bigint)', rc_old, rc_new, '3f85092f030b2ad92a3002ab0a9cc98d'),
      ('public.rt_auto_close(bigint)', ac_old, ac_new, '88b41f860aaf7f925183ab84dc10c2dd'),
      ('public.dl_local_day_sync(bigint,date)', ls_old, ls_new, 'a4a62603e5b0c4ad48124fea625aa611')) v(sig, a, b, m) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig);
    v_old := replace(v_src, v_fn.b, v_fn.a);
    IF md5(v_old) <> v_fn.m THEN
      RAISE EXCEPTION '071 rollback: the restored text of % is not the one of 21/10 (md5 %) - stop', v_fn.sig, md5(v_old);
    END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      split_part(v_fn.sig, '(', 1), pg_get_function_arguments(to_regprocedure(v_fn.sig)),
      pg_get_function_result(to_regprocedure(v_fn.sig)), v_old);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) <> v_fn.m THEN
      RAISE EXCEPTION '071 rollback proof: % does not hold the 21/10 text', v_fn.sig;
    END IF;
  END LOOP;

  -- 4. local_moves back to the 060 CHECKs (the same deparsed text as read 21/10, proven below).
  DROP INDEX public.local_moves_nat_loading_once;
  ALTER TABLE public.local_moves
    DROP CONSTRAINT local_moves_nat_loading,
    DROP CONSTRAINT local_moves_kind_chk,
    DROP CONSTRAINT local_moves_kind_parent,
    DROP CONSTRAINT local_moves_relay_trailer,
    ADD CONSTRAINT local_moves_kind_chk CHECK (move_kind = ANY (ARRAY['local'::text, 'relay_delivery'::text, 'relay_loading'::text])),
    ADD CONSTRAINT local_moves_kind_parent CHECK (((move_kind = 'local'::text) AND (parent_order_id IS NULL))
      OR ((move_kind <> 'local'::text) AND (parent_order_id IS NOT NULL) AND (parent_nat_load_id IS NULL))),
    ADD CONSTRAINT local_moves_relay_trailer CHECK ((move_kind = 'local'::text) OR (driver_id IS NULL) OR (trailer_id IS NOT NULL));
  ALTER TABLE public.local_moves DROP COLUMN rt_stop_id;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_chk')
       IS DISTINCT FROM 'CHECK ((move_kind = ANY (ARRAY[''local''::text, ''relay_delivery''::text, ''relay_loading''::text])))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_parent')
       IS DISTINCT FROM 'CHECK ((((move_kind = ''local''::text) AND (parent_order_id IS NULL)) OR ((move_kind <> ''local''::text) AND (parent_order_id IS NOT NULL) AND (parent_nat_load_id IS NULL))))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_relay_trailer')
       IS DISTINCT FROM 'CHECK (((move_kind = ''local''::text) OR (driver_id IS NULL) OR (trailer_id IS NOT NULL)))' THEN
    RAISE EXCEPTION '071 rollback proof: a local_moves CHECK is not the 060 text of 21/10';
  END IF;

  -- 5. Pallets, the tables, the columns.
  ALTER TABLE public.pl_movements DROP COLUMN piece_leg_id;
  DROP TABLE public.plan_notices, public.piece_legs, public.rt_stops, public.shipment_pieces, public.shipments;
  ALTER TABLE public.order_stops DROP CONSTRAINT order_stops_via_hub_intl, DROP COLUMN via_hub;
  DROP INDEX public.locations_one_hub;
  ALTER TABLE public.locations DROP COLUMN is_hub;
  ALTER TABLE public.ct_round_trips
    DROP CONSTRAINT rt_model, DROP CONSTRAINT rt_v2_scope, DROP CONSTRAINT rt_v2_status, DROP CONSTRAINT rt_v2_window,
    DROP CONSTRAINT rt_v1_no_window, DROP CONSTRAINT rt_v2_dates, DROP CONSTRAINT rt_partner_rate,
    DROP COLUMN model, DROP COLUMN start_at, DROP COLUMN end_at, DROP COLUMN partner_rate;

  -- 6. PROOFS + B-54 -9.
  EXECUTE snap_rt_sql INTO v_rt1;
  EXECUTE snap_rows_sql INTO v_rows1;
  IF v_rt1 <> v_rt0 OR v_rows1 <> v_rows0 THEN
    RAISE EXCEPTION '071 rollback proof: a number of today changed (round trips % -> %, rows % -> %)', v_rt0, v_rt1, v_rows0, v_rows1;
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 - 9 THEN
    RAISE EXCEPTION '071 rollback proof: trigger count % -> % (expected -9)', v_trg0, v_trg1;
  END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '071 rollback: B-54 not updated (% rows)', v_k; END IF;

  RAISE NOTICE '071 ROLLBACK OK: every 071 object removed, the four functions are the 21/10 texts again; triggers % -> %, B-54 = %',
    v_trg0, v_trg1, v_trg1;
END $do$;

SELECT CASE WHEN to_regclass('public.shipments') IS NULL
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) = '3f85092f030b2ad92a3002ab0a9cc98d'
            THEN '071 ROLLED BACK' ELSE '071 STILL IN PLACE' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
```

- [ ] **Step 6: Τρέξε το harness ως το verify**

Run: `cd tms-auditor && node --test test/plan-071.test.mjs`
Expected: PASS για τα 4 πρώτα υπο-tests (fixture, dry run, applies, verify). Το rules test αποτυγχάνει ακόμη με `ENOENT ... 071_plan_schema_test.sql`, το 071b με `ENOENT ... 071b_plan_one_vehicle_dryrun.sql`. Το rollback περνά. Αν ένα υπο-test αποτύχει με μήνυμα από φρουρό του 071, διόρθωσε το 071 και **ξαναπαράγαγε** το dry run (Step 2). Ποτέ μη διορθώσεις το dry run με το χέρι.

- [ ] **Step 7: Commit**

```bash
git add worker/migrations/drafts/tools/build-071-dryruns.mjs worker/migrations/drafts/071_plan_schema_dryrun.sql \
  worker/migrations/drafts/071_plan_schema_verify.sql worker/migrations/drafts/071_plan_schema_fingerprint.sql \
  worker/migrations/drafts/071_plan_schema_rollback.sql
git commit -m "071: generated dry run, verify, fingerprint, rollback (proved on PGlite)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Οι κανόνες σε TEST γραμμές — `071_plan_schema_test.sql` (54 περιπτώσεις)

**Files:**
- Create: `worker/migrations/drafts/071_plan_schema_test.sql`

**Interfaces:**
- Consumes: 071 (Task 2)
- Produces: απόδειξη κάθε κωδικού `plan:` και κάθε CHECK/UNIQUE που ορίζει η 071. Το `tests/sql-071-drafts.test.js` (Task 5) ελέγχει ότι κάθε κωδικός της 071 υπάρχει στο `want[]`.

- [ ] **Step 1: Γράψε το αρχείο**

`worker/migrations/drafts/071_plan_schema_test.sql`:
```sql
-- RULES TEST 071 (national v5 schema): 54 cases on TEST rows, then undone.
-- Runs AFTER 071 said "071 OK". At build time it runs on the PGlite copy (tms-auditor/test/plan-071.test.mjs). On
-- production it is OPTIONAL, after 15:00, with an explicit yes: it writes TEST rows (locations, clients, partners,
-- trucks, drivers, two national orders, one VS import order with two stops, round trips, payroll lines, local moves,
-- pallet movements, audit rows) and undoes ALL of them with a deliberate final error. Only trace: identity and code
-- sequences advance (RT-... and PM-... numbers skip the ones used here).
-- ONE statement. The red error message IS the result:
--   "RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept. Result: 54 OK, 0 FAIL || ...".
-- Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Each case: build S (national order A->B, 10 pallets, one piece; one OWNED v5 cycle with truck and driver, stops
-- A 06-08, Veroia 09-10, B 12-14 on day D; one leg A->B), check it (SET CONSTRAINTS ALL IMMEDIATE), make the case's
-- change, check again, read the verdict, undo (marker exception). want[k] = 'ok' (the verdict must start with ok),
-- 'plan:<code>' (the HINT), 'con:<constraint>' or 'state:<SQLSTATE>'.
-- ASCII only. Test ids: legacy_id rec071T..., reference WN071-TEST, names "TEST 071 ...", plates TEST-071-..., day
-- D = Athens today + 40; cases 46-49 use yesterday and today (the "executed" rule of spec 2.3).
DO $dry$
DECLARE
  td date; dp date; d date; k int;
  la bigint; lb bigint; lc bigint; hub bigint; cl bigint; pa bigint; trk bigint; drv bigint; drv2 bigint;
  no1 bigint; no2 bigint; vso bigint; vs_ld bigint; vs_ul bigint; v1rt bigint;
  at5 timestamptz; at6 timestamptz; at7 timestamptz; at730 timestamptz; at8 timestamptz; at9 timestamptz;
  at10 timestamptz; at12 timestamptz; at13 timestamptz; at14 timestamptz; at16 timestamptz;
  u1 timestamptz; u2 timestamptz; u3 timestamptz; u4 timestamptz; shift interval;
  rt1 bigint; rt2 bigint; s1 bigint; sv bigint; s2 bigint; s4 bigint; shp bigint; shp2 bigint; p1 bigint;
  c1 bigint; c2 bigint; lg1 bigint; x bigint; y bigint; q1 bigint; q2 bigint; pq bigint;
  n int; b1 boolean; b2 boolean; t1 text;
  want text[] := ARRAY[
    'ok', 'ok', 'plan:pieces_sum', 'con:shipments_shape', 'con:shipments_one_parent',                 -- 1-5
    'con:shipments_intl_is_bridge', 'con:shipments_ends', 'plan:leg_order', 'plan:chain', 'ok',         -- 6-10
    'plan:chain_time', 'plan:stop_seq', 'plan:stop_order', 'plan:side_order', 'plan:rt_window',         -- 11-15
    'plan:model_locked', 'con:rt_v2_status', 'plan:rt_cancelled', 'ok', 'plan:v1_link_on_v2',           -- 16-20
    'ok', 'con:rt_partner_rate', 'con:rt_v2_window', 'con:rt_v2_dates', 'ok',                           -- 21-25
    'plan:rt_not_v2', 'ok', 'plan:split_not_at_hub', 'plan:piece_dead', 'plan:leg_stop_dead',          -- 26-30
    'plan:leg_place', 'ok', 'plan:pieces_sum', 'con:shipments_shape', 'con:shipments_bridge_once',      -- 31-35
    'con:order_stops_via_hub_intl', 'ok', 'plan:local_loading_day', 'plan:local_loading_stop',          -- 36-39
    'con:local_moves_nat_loading', 'plan:local_loading_stop', 'con:pl_mov_leg_once', 'plan:leg_locked', -- 40-43
    'plan:stop_locked', 'plan:piece_locked', 'ok', 'ok', 'ok', 'ok', 'state:P0001',                     -- 44-50
    'plan:pieces_alive', 'plan:piece_parent', 'plan:local_loading_gone', 'plan:shipment_locked'];       -- 51-54
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  IF to_regclass('public.shipments') IS NULL
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) <> '5fa0a08418147b22d2852db3b8c72c3e' THEN
    RAISE EXCEPTION 'RULES TEST 071: 071 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec071T%') OR EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec071T%')
     OR EXISTS (SELECT 1 FROM national_orders WHERE legacy_id LIKE 'rec071T%')
     OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-071-%')
     OR EXISTS (SELECT 1 FROM drivers WHERE full_name LIKE 'TEST 071 %')
     OR EXISTS (SELECT 1 FROM clients WHERE company_name LIKE 'TEST 071 %')
     OR EXISTS (SELECT 1 FROM partners WHERE company_name LIKE 'TEST 071 %') THEN
    RAISE EXCEPTION 'RULES TEST 071: test ids (rec071T..., TEST 071 ..., TEST-071-...) already exist - stop';
  END IF;

  -- Fixture (undone by the final error).
  td := (now() AT TIME ZONE 'Europe/Athens')::date; dp := td - 1; d := td + 40;
  at5 := (d + time '05:00') AT TIME ZONE 'Europe/Athens';   at6 := (d + time '06:00') AT TIME ZONE 'Europe/Athens';
  at7 := (d + time '07:00') AT TIME ZONE 'Europe/Athens';   at730 := (d + time '07:30') AT TIME ZONE 'Europe/Athens';
  at8 := (d + time '08:00') AT TIME ZONE 'Europe/Athens';   at9 := (d + time '09:00') AT TIME ZONE 'Europe/Athens';
  at10 := (d + time '10:00') AT TIME ZONE 'Europe/Athens';  at12 := (d + time '12:00') AT TIME ZONE 'Europe/Athens';
  at13 := (d + time '13:00') AT TIME ZONE 'Europe/Athens';  at14 := (d + time '14:00') AT TIME ZONE 'Europe/Athens';
  at16 := (d + time '16:00') AT TIME ZONE 'Europe/Athens';
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071TA', 'TEST 071 A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071TB', 'TEST 071 B') RETURNING id INTO lb;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071TC', 'TEST 071 C') RETURNING id INTO lc;
  INSERT INTO clients (company_name) VALUES ('TEST 071 client') RETURNING id INTO cl;
  INSERT INTO partners (company_name) VALUES ('TEST 071 partner') RETURNING id INTO pa;
  INSERT INTO trucks (license_plate) VALUES ('TEST-071-1') RETURNING id INTO trk;
  INSERT INTO drivers (full_name) VALUES ('TEST 071 driver') RETURNING id INTO drv;
  INSERT INTO drivers (full_name) VALUES ('TEST 071 local') RETURNING id INTO drv2;
  INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec071TN1', cl, 'WN071-TEST', 100) RETURNING id INTO no1;
  INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec071TN2', cl, 'WN071-TEST', 50) RETURNING id INTO no2;
  INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  VALUES ('rec071TO1', 'International', 'Import', 'Pending', true, d - 3, d + 1, d, 'WN071-TEST', cl) RETURNING id INTO vso;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec071TS1', 'Loading', 1, d - 3, vso, lc, 20) RETURNING id INTO vs_ld;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec071TS2', 'Unloading', 1, d + 1, vso, lb, 20) RETURNING id INTO vs_ul;
  INSERT INTO ct_round_trips (scope, trip_type, date_start, status, source, created_by)
  VALUES ('NATL', 'OWNED', d, 'planned', 'manual', 'test:071') RETURNING id INTO v1rt;

  FOR k IN 1..54 LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      -- S
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk, drv, d, d, at6, at14, 'planned', 'planner', 'test:071') RETURNING id INTO rt1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 1, la, 'KATHODOS', at6, at8, 'test:071') RETURNING id INTO s1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 2, hub, 'KATHODOS', at9, at10, 'test:071') RETURNING id INTO sv;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 3, lb, 'KATHODOS', at12, at14, 'test:071') RETURNING id INTO s2;
      INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                             deliver_from, deliver_to, created_by)
      VALUES (no1, la, lb, 10, at6, at8, at12, at14, 'test:071') RETURNING id INTO shp;
      INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp, 10, 'test:071') RETURNING id INTO p1;
      INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by)
      VALUES (p1, 1, rt1, s1, s2, 'test:071') RETURNING id INTO lg1;
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;

      IF k = 1 THEN
        NULL;
      ELSIF k = 2 THEN   -- a stop moves to the next day: the cycle's window and its payroll line follow
        UPDATE rt_stops SET planned_from = (d + 1 + time '12:00') AT TIME ZONE 'Europe/Athens',
                            planned_to = (d + 1 + time '14:00') AT TIME ZONE 'Europe/Athens' WHERE id = s2;
      ELSIF k = 3 THEN
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp, 4, 'test:071');
      ELSIF k = 4 THEN
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, load_from, load_to, deliver_from,
                               deliver_to, created_by) VALUES (no1, la, lb, at6, at8, at12, at14, 'test:071');
      ELSIF k = 5 THEN
        INSERT INTO shipments (order_id, nat_order_id, order_stop_id, created_by) VALUES (vso, no1, vs_ul, 'test:071');
      ELSIF k = 6 THEN
        INSERT INTO shipments (order_id, origin_location_id, dest_location_id, pallets, load_from, load_to, deliver_from,
                               deliver_to, created_by) VALUES (vso, la, lb, 5, at6, at8, at12, at14, 'test:071');
      ELSIF k = 7 THEN
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by) VALUES (no1, la, la, 5, at6, at8, at12, at14, 'test:071');
      ELSIF k IN (8, 9, 10, 11, 19, 27, 31) THEN
        IF k = 31 THEN
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt1, 4, lc, 'KATHODOS', at14, at16, 'test:071') RETURNING id INTO s4;
        END IF;
        IF k = 11 THEN
          INSERT INTO ct_round_trips (model, scope, trip_type, partner_id, partner_rate, date_start, date_end, start_at,
                                      end_at, status, source, created_by)
          VALUES (2, 'NATL', 'PARTNER', pa, 250, d, d, at7, at13, 'planned', 'planner', 'test:071') RETURNING id INTO rt2;
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt2, 1, hub, 'KATHODOS', at7, at730, 'test:071') RETURNING id INTO y;
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt2, 2, lb, 'KATHODOS', at12, at13, 'test:071') RETURNING id INTO x;
        END IF;
        UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = lg1;
        IF k = 8 THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s2, s1, 'test:071');
        ELSIF k = 9 THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, sv, s2, 'test:071');
        ELSIF k IN (10, 11, 27) THEN
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1, sv, 'test:071');
          IF k = 10 THEN
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 2, rt1, sv, s2, 'test:071');
          ELSIF k = 11 THEN
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 2, rt2, y, x, 'test:071');
          ELSE   -- 27: split at the hub 10 -> 6 + 4; the 6 go on to B, the 4 stay as stock
            UPDATE shipment_pieces SET split_at = now(), split_by = 'test:071' WHERE id = p1;
            INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp, p1, 6, 'test:071') RETURNING id INTO c1;
            INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, leave_by, created_by)
            VALUES (shp, p1, 4, d + 2, 'test:071') RETURNING id INTO c2;
            INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (c1, 1, rt1, sv, s2, 'test:071');
          END IF;
        ELSIF k = 19 THEN
          UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1;
        ELSE   -- 31
          INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (p1, 1, rt1, s1, s4, 'test:071');
        END IF;
      ELSIF k = 12 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (rt1, 2, la, 'KATHODOS', at10, at10, 'test:071');
      ELSIF k = 13 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (rt1, 4, la, 'KATHODOS', at6, at8, 'test:071');
      ELSIF k = 14 THEN
        UPDATE rt_stops SET side = 'ANODOS' WHERE id = s1;
      ELSIF k = 15 THEN
        UPDATE ct_round_trips SET start_at = at5 WHERE id = rt1;
      ELSIF k = 16 THEN
        UPDATE ct_round_trips SET model = 2, start_at = at6, end_at = at14, date_start = d, date_end = d WHERE id = v1rt;
      ELSIF k = 17 THEN
        UPDATE ct_round_trips SET status = 'closed', closed_at = now() WHERE id = rt1;
      ELSIF k = 18 THEN
        UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1;
      ELSIF k = 20 THEN
        INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (rt1, 'IMPORT', vso, 1);
      ELSIF k = 21 THEN   -- without 071's line rt_recompute would cancel a cycle with 0 order links
        PERFORM rt_recompute(rt1);
        PERFORM rt_auto_close(rt1);
      ELSIF k = 22 THEN
        UPDATE ct_round_trips SET partner_rate = 100 WHERE id = rt1;
      ELSIF k = 23 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, date_start, status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', d, 'planned', 'planner', 'test:071');
      ELSIF k = 24 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', d + 1, d + 1, at6, at14, 'planned', 'planner', 'test:071');
      ELSIF k = 25 THEN   -- plan_rt_create's order (spec 7): stops first, then the cycle with their window
        x := nextval(pg_get_serial_sequence('public.ct_round_trips', 'id'));
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (x, 1, la, 'KATHODOS', at6, at8, 'test:071');
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (x, 2, lb, 'KATHODOS', at12, at14, 'test:071');
        INSERT INTO ct_round_trips (id, model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
        OVERRIDING SYSTEM VALUE VALUES (x, 2, 'NATL', 'OWNED', d, d, at6, at14, 'planned', 'planner', 'test:071');
      ELSIF k = 26 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (v1rt, 1, la, 'KATHODOS', at6, at8, 'test:071');
      ELSIF k = 28 THEN
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp, p1, 6, 'test:071');
        INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp, p1, 4, 'test:071');
      ELSIF k = 29 THEN
        UPDATE shipment_pieces SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = p1;
      ELSIF k = 30 THEN
        UPDATE rt_stops SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = s2;
      ELSIF k IN (32, 33, 35) THEN   -- a VS bridge on the import's Greek unloading stop, one piece of 20
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_ul, 'test:071') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 20, 'test:071') RETURNING id INTO y;
        IF k = 33 THEN
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          UPDATE order_stops SET pallets = 18 WHERE id = vs_ul;
        ELSIF k = 35 THEN
          INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_ul, 'test:071');
        END IF;
      ELSIF k = 34 THEN
        INSERT INTO shipments (order_id, order_stop_id, pallets, created_by) VALUES (vso, vs_ul, 20, 'test:071');
      ELSIF k = 36 THEN
        INSERT INTO order_stops (legacy_id, stop_type, stop_number, national_order_id, via_hub) VALUES ('rec071TS9', 'Loading', 1, no1, true);
      ELSIF k IN (37, 38, 39, 41, 53) THEN   -- loading by a local driver
        INSERT INTO local_moves (move_kind, rt_stop_id, driver_id, move_date, status)
        VALUES ('nat_loading', CASE WHEN k = 39 THEN s2 ELSE s1 END, drv2, CASE WHEN k = 38 THEN d + 1 ELSE d END, 'Assigned')
        RETURNING id INTO x;
        IF k IN (41, 53) THEN
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          UPDATE piece_legs SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = lg1;
          IF k = 53 THEN UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1; END IF;
        END IF;
      ELSIF k = 40 THEN
        INSERT INTO local_moves (move_kind, driver_id, move_date, status) VALUES ('nat_loading', drv2, d, 'Assigned');
      ELSIF k = 42 THEN
        INSERT INTO pl_movements (movement_date, counterparty_type, client_id, event_type, piece_leg_id, created_by)
        VALUES (d, 'CLIENT', cl, 'DELIVERY', lg1, 'test:071');
        INSERT INTO pl_movements (movement_date, counterparty_type, client_id, event_type, piece_leg_id, created_by)
        VALUES (d, 'CLIENT', cl, 'DELIVERY', lg1, 'test:071');
      ELSIF k = 43 THEN
        UPDATE piece_legs SET drop_stop_id = sv WHERE id = lg1;
      ELSIF k = 44 THEN
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt1, 4, lb, 'KATHODOS', at14, at16, 'test:071') RETURNING id INTO s4;
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        UPDATE rt_stops SET rt_id = v1rt WHERE id = s4;
      ELSIF k IN (45, 52) THEN
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by)
        VALUES (no2, la, lb, 5, at6, at8, at12, at14, 'test:071') RETURNING id INTO shp2;
        IF k = 45 THEN
          INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp2, 5, 'test:071');
          SET CONSTRAINTS ALL IMMEDIATE;
          SET CONSTRAINTS ALL DEFERRED;
          UPDATE shipment_pieces SET shipment_id = shp2 WHERE id = p1;
        ELSE   -- 52: a piece hanging on a parent of ANOTHER shipment
          INSERT INTO shipment_pieces (shipment_id, parent_piece_id, pallets, created_by) VALUES (shp2, p1, 5, 'test:071');
        END IF;
      ELSIF k BETWEEN 46 AND 49 THEN   -- 46 yesterday | 47 late | 48 no vehicle | 49 today, across midnight
        IF k = 49 THEN
          u1 := (dp + time '22:00') AT TIME ZONE 'Europe/Athens'; u2 := (td + time '00:10') AT TIME ZONE 'Europe/Athens';
          u3 := (td + time '00:20') AT TIME ZONE 'Europe/Athens'; u4 := (td + time '00:30') AT TIME ZONE 'Europe/Athens';
        ELSE
          u1 := (dp + time '06:00') AT TIME ZONE 'Europe/Athens'; u2 := (dp + time '08:00') AT TIME ZONE 'Europe/Athens';
          u3 := (dp + time '12:00') AT TIME ZONE 'Europe/Athens'; u4 := (dp + time '14:00') AT TIME ZONE 'Europe/Athens';
        END IF;
        shift := CASE WHEN k = 47 THEN interval '1 day' ELSE interval '0' END;   -- 47: requested one day earlier
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', CASE WHEN k = 48 THEN NULL ELSE trk END, drv, (u1 AT TIME ZONE 'Europe/Athens')::date,
                (u4 AT TIME ZONE 'Europe/Athens')::date, u1, u4, 'planned', 'planner', 'test:071') RETURNING id INTO rt2;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt2, 1, la, 'KATHODOS', u1, u2, 'test:071') RETURNING id INTO q1;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt2, 2, lb, 'KATHODOS', u3, u4, 'test:071') RETURNING id INTO q2;
        INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                               deliver_from, deliver_to, created_by)
        VALUES (no2, la, lb, 5, u1 - shift, u2 - shift, u3 - shift, u4 - shift, 'test:071') RETURNING id INTO shp2;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (shp2, 5, 'test:071') RETURNING id INTO pq;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (pq, 1, rt2, q1, q2, 'test:071');
      ELSIF k = 50 THEN   -- today's rule stays: a v1 round trip with an open order leg does not close by hand
        INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (v1rt, 'IMPORT', vso, 1);
        UPDATE ct_round_trips SET status = 'closed', closed_at = now() WHERE id = v1rt;
      ELSIF k = 51 THEN
        UPDATE shipments SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:071' WHERE id = shp;
      ELSIF k = 54 THEN
        UPDATE shipments SET nat_order_id = no2 WHERE id = shp;
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;

      -- Verdicts (only reached when nothing refused).
      IF want[k] <> 'ok' THEN
        verdict := 'FAIL no error';
      ELSIF k = 1 THEN
        SELECT count(*) INTO n FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND entry_date = d AND date_end = d;
        SELECT waiting, end_stop_id = s2 INTO b1, b2 FROM v_piece_state WHERE piece_id = p1;
        verdict := CASE WHEN (SELECT start_at = at6 AND end_at = at14 AND date_start = d AND date_end = d FROM ct_round_trips WHERE id = rt1)
                          AND n = 1 AND NOT b1 AND b2
                          AND (SELECT NOT executed FROM v_piece_state WHERE piece_id = p1)
                          AND (SELECT n_stops = 3 AND n_legs = 1 AND NOT ended FROM v_rt_cycle WHERE rt_id = rt1)
                          AND (SELECT planned AND NOT executed FROM v_national_order_state WHERE nat_order_id = no1)
                          AND (SELECT kind = 'national' AND nat_from_location_id = la AND nat_to_location_id = lb AND live
                                 FROM v_shipments WHERE shipment_id = shp)
                        THEN 'ok S: window from the stops, one payroll line on day D, piece planned to B, order planned not executed'
                        ELSE format('FAIL S: payroll lines %s, waiting %s, ends at B %s', n, b1, b2) END;
      ELSIF k = 2 THEN
        verdict := CASE WHEN (SELECT end_at = (d + 1 + time '14:00') AT TIME ZONE 'Europe/Athens' AND date_end = d + 1
                                FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL
                                 AND entry_date = d AND date_end = d + 1) = 1
                        THEN 'ok the window and the payroll line follow the stop to D+1'
                        ELSE 'FAIL the window or the payroll line did not follow the stop' END;
      ELSIF k = 10 THEN
        verdict := CASE WHEN (SELECT end_stop_id = s2 AND NOT waiting FROM v_piece_state WHERE piece_id = p1)
                        THEN 'ok via the hub in two legs' ELSE 'FAIL two legs via the hub' END;
      ELSIF k = 19 THEN
        verdict := CASE WHEN NOT EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL)
                          AND (SELECT waiting FROM v_piece_state WHERE piece_id = p1)
                          AND (SELECT status = 'cancelled' AND NOT ended FROM v_rt_cycle WHERE rt_id = rt1)
                          AND NOT EXISTS (SELECT 1 FROM v_rt_stop_state WHERE rt_id = rt1 AND executed)
                        THEN 'ok cancel: legs off, cycle cancelled, empty payroll line gone (011), piece waiting again'
                        ELSE 'FAIL cancel' END;
      ELSIF k = 21 THEN
        verdict := CASE WHEN (SELECT status = 'planned' AND notes IS NULL FROM ct_round_trips WHERE id = rt1)
                        THEN 'ok rt_recompute / rt_auto_close leave a v5 cycle alone' ELSE 'FAIL rt_recompute touched a v5 cycle' END;
      ELSIF k = 25 THEN
        verdict := CASE WHEN (SELECT start_at = at6 AND end_at = at14 FROM ct_round_trips WHERE id = x)
                          AND (SELECT n_stops FROM v_rt_cycle WHERE rt_id = x) = 2
                        THEN 'ok stops first, cycle after, in one transaction' ELSE 'FAIL stops first' END;
      ELSIF k = 27 THEN
        verdict := CASE WHEN (SELECT pallets = 4 AND is_stock FROM v_hub_bucket WHERE piece_id = c2)
                          AND (SELECT end_stop_id = s2 AND NOT waiting FROM v_piece_state WHERE piece_id = c1)
                          AND (SELECT count(*) FROM v_piece_state WHERE shipment_id = shp) = 2
                        THEN 'ok split at the hub: 6 go on to B, 4 wait as stock' ELSE 'FAIL split at the hub' END;
      ELSIF k = 32 THEN
        verdict := CASE WHEN (SELECT kind = 'vs_import' AND nat_from_location_id = hub AND nat_to_location_id = lb
                                     AND origin_location_id = lc AND dest_location_id = lb AND pallets = 20
                                     AND nat_ready_day = d AND nat_due_day = d + 1 AND live
                                FROM v_shipments WHERE shipment_id = x)
                          AND (SELECT at_hub AND waiting FROM v_piece_state WHERE piece_id = y)
                          AND (SELECT NOT is_stock FROM v_hub_bucket WHERE piece_id = y)
                          AND (SELECT n_pieces = 1 AND NOT all_planned AND carriers = '[]'::jsonb FROM v_vs_state WHERE order_id = vso)
                        THEN 'ok VS bridge: read from its stop, waits at the hub, no carrier yet' ELSE 'FAIL VS bridge' END;
      ELSIF k = 37 THEN
        SELECT code INTO t1 FROM ct_round_trips WHERE id = rt1;
        verdict := CASE WHEN (SELECT count(*) FROM dl_entries WHERE driver_id = drv2 AND entry_date = d AND deleted_at IS NULL
                                AND local_move_id = x AND route LIKE '%' || t1) = 1
                        THEN 'ok local loading: one TOPIKO payroll line for the local driver, named after the cycle'
                        ELSE 'FAIL local loading payroll line' END;
      ELSE   -- 46-49
        SELECT executed, late INTO b1, b2 FROM v_piece_state WHERE piece_id = pq;
        IF k = 46 THEN
          verdict := CASE WHEN b1 AND NOT b2
                            AND (SELECT bool_and(dim) AND bool_and(cycle_dim) FROM v_rt_stop_state WHERE rt_id = rt2)
                            AND (SELECT ended FROM v_rt_cycle WHERE rt_id = rt2)
                            AND (SELECT executed FROM v_national_order_state WHERE nat_order_id = no2)
                          THEN 'ok yesterday: executed, dims, cycle ended, order delivered'
                          ELSE format('FAIL yesterday: executed %s late %s', b1, b2) END;
        ELSIF k = 47 THEN
          verdict := CASE WHEN b1 AND b2
                            AND (SELECT dim FROM v_rt_stop_state WHERE stop_id = q1)
                            AND NOT (SELECT dim FROM v_rt_stop_state WHERE stop_id = q2)
                            AND (SELECT has_late FROM v_rt_stop_state WHERE stop_id = q2)
                            AND NOT (SELECT side_dim FROM v_rt_stop_state WHERE stop_id = q1)
                          THEN 'ok late never dims: the late delivery stays lit, the pickup dims'
                          ELSE format('FAIL late: executed %s late %s', b1, b2) END;
        ELSIF k = 48 THEN
          verdict := CASE WHEN b1 AND (SELECT NOT bool_or(dim) AND NOT bool_or(has_vehicle) FROM v_rt_stop_state WHERE rt_id = rt2)
                          THEN 'ok without a vehicle nothing dims' ELSE 'FAIL without a vehicle' END;
        ELSE
          verdict := CASE WHEN NOT b1 AND (SELECT NOT bool_or(executed) FROM v_rt_stop_state WHERE rt_id = rt2)
                            AND NOT (SELECT ended FROM v_rt_cycle WHERE rt_id = rt2)
                          THEN 'ok today (and a window across midnight) is not executed yet'
                          ELSE 'FAIL today counted as executed' END;
        END IF;
      END IF;
      RAISE EXCEPTION 'wn071 undo' USING HINT = 'wn071_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn071_undo' THEN coalesce(verdict, 'FAIL no verdict')
                  WHEN hint LIKE 'plan:%' THEN hint
                  WHEN coalesce(cname, '') <> '' THEN 'con:' || cname
                  ELSE 'state:' || st END;
      IF (want[k] = 'ok' AND got LIKE 'ok%') OR got = want[k] THEN
        ok := ok + 1; res := res || k::text;
      ELSE
        bad := bad + 1; res := res || (k || ' FAIL want ' || want[k] || ' got ' || got || ' (' || msg || ')');
      END IF;
    END;
  END LOOP;

  RAISE EXCEPTION 'RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$dry$;
```

- [ ] **Step 2: Τρέξε το rules test στο PGlite**

Run: `cd tms-auditor && node --test test/plan-071.test.mjs`
Expected: PASS στα υπο-tests του 071, μαζί με «071 rules test: 54 OK, 0 FAIL». Το 071b αποτυγχάνει ακόμη με `ENOENT ... 071b_plan_one_vehicle_dryrun.sql` (ή είναι skip, χωρίς btree_gist). Αν μια περίπτωση γράψει `FAIL want X got Y`, διόρθωσε **τον κανόνα στο 071** όταν ο κανόνας είναι λάθος, ή την περίπτωση όταν η περίπτωση είναι λάθος, και γράψε στο commit ποιο από τα δύο ήταν. Μετά: `node worker/migrations/drafts/tools/build-071-dryruns.mjs`.

- [ ] **Step 3: Απόδειξη ότι το test ελέγχει κάτι**

Σε προσωρινό αντίγραφο (όχι στο repo):
```bash
cp worker/migrations/drafts/071_plan_schema.sql /tmp/071-mutant.sql
sed -i.bak "s/  if r.model = 2 then return; end if; -- 071: a v5 cycle is never cancelled/  if false then return; end if; -- 071: a v5 cycle is never cancelled/" /tmp/071-mutant.sql
grep -c "if false then return" /tmp/071-mutant.sql
```
Expected: `1`. Τρέξε το `/tmp/071-mutant.sql` στο PGlite του harness, π.χ. προσωρινά στη θέση του `071_plan_schema.sql` στο υπο-test «071 applies». Expected: άρνηση `071: the generated text of public.rt_recompute(bigint) is not the one measured`. Αυτό αποδεικνύει ότι ο φρουρός md5 πιάνει κάθε απόκλιση από το μετρημένο κείμενο. Σβήσε το `/tmp/071-mutant.sql*` και επανάφερε το test.
Η συμπεριφορά αποδείχθηκε στην προετοιμασία του πλάνου, σε scratch PGlite με τα md5 προσαρμοσμένα στη μεταλλαγή: χωρίς τη γραμμή του 071 το rules test δίνει `53 OK, 1 FAIL  ||  ... 21 FAIL want ok got plan:rt_cancelled`. Το `rt_recompute` ακυρώνει τον κύκλο ως «0 σκέλη» (`013:65-73`), και ο κανόνας `rt_cancelled` το πιάνει.

- [ ] **Step 4: Commit**

```bash
git add worker/migrations/drafts/071_plan_schema_test.sql worker/migrations/drafts/071_plan_schema.sql worker/migrations/drafts/071_plan_schema_dryrun.sql
git commit -m "071 rules test: 54 cases on TEST rows (54 OK on PGlite), nothing kept

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Έλεγχοι build χωρίς βάση — `tests/sql-071-drafts.test.js`

**Files:**
- Create: `tests/sql-071-drafts.test.js`

**Interfaces:**
- Consumes: `PAIRS`, `buildDryRun`, `DIR` (Task 3)· όλα τα αρχεία 071/071b
- Produces: φρουρό build (αρχή 6)

- [ ] **Step 1: Γράψε το test**

`tests/sql-071-drafts.test.js`:
```js
// tests/sql-071-drafts.test.js - run: node --test tests/sql-071-drafts.test.js
// The 071 / 071b drafts (national v5 schema, F1) at build time, plain node, no database (principle 6: a stale
// fingerprint or a forgotten rule should fail here, not at 15:30 on the owner's evening):
//   - all eleven files there; ASCII only (the owner pastes them from a clipboard that has mangled Greek before);
//   - the writing files are ONE DO block (the SQL editor is not atomic across statements); verify/fingerprint write nothing;
//   - the dry runs are regenerated from their sources, never hand-edited;
//   - the four rewrites add ONE "-- 071:" line each to the live text read 21/10, the md5 chain is written into 071,
//     its rollback and verify, and the rollback undoes exactly 071's substitutions;
//   - B-54 moves by exactly +9 (071), -9 (rollback), 0 (071b), and only from the live count;
//   - born closed; the spec deltas of 21/10 hold; the facade never maps a new table; every plan: code is tested.
// The rules themselves are proven by 071_plan_schema_test.sql on PGlite (tms-auditor/test/plan-071.test.mjs).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // after the run: worker/migrations (CLAUDE.md rule 5)
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const DO_FILES = ['071_plan_schema.sql', '071_plan_schema_dryrun.sql', '071_plan_schema_test.sql', '071_plan_schema_rollback.sql',
  '071b_plan_one_vehicle.sql', '071b_plan_one_vehicle_dryrun.sql', '071b_plan_one_vehicle_test.sql', '071b_plan_one_vehicle_rollback.sql'];
const READ_ONLY = ['071_plan_schema_verify.sql', '071_plan_schema_fingerprint.sql', '071b_plan_one_vehicle_verify.sql'];
const TABLES = ['shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices'];
const VIEWS = ['v_shipments', 'v_piece_pos', 'v_piece_state', 'v_rt_stop_state', 'v_rt_cycle', 'v_hub_bucket',
  'v_national_order_state', 'v_vs_state'];
const SUBS = [
  { sig: 'public.rt_status_guard()', a: 'sg_old', b: 'sg_new', old: 'f632fea1d6a5dd2cee7c80f4db9e27f2', neu: 'd7757f99c3443ac167d5bdaf3e34b142' },
  { sig: 'public.rt_recompute(bigint)', a: 'rc_old', b: 'rc_new', old: '3f85092f030b2ad92a3002ab0a9cc98d', neu: '5fa0a08418147b22d2852db3b8c72c3e' },
  { sig: 'public.rt_auto_close(bigint)', a: 'ac_old', b: 'ac_new', old: '88b41f860aaf7f925183ab84dc10c2dd', neu: 'eba2146ca4c521da6365edd28c4507af' },
  { sig: 'public.dl_local_day_sync(bigint,date)', a: 'ls_old', b: 'ls_new', old: 'a4a62603e5b0c4ad48124fea625aa611', neu: '151dab06e2676f3c8885d7298d0ac6af' },
];

// A `name CONSTANT text := '...' || E'\n' || '...';` of a DO block, evaluated.
function sqlConst(src, name) {
  const m = new RegExp(`\\b${name} CONSTANT text := ([\\s\\S]*?);\\n`).exec(src);
  assert.ok(m, `${name} not found`);
  let out = '';
  for (const t of m[1].matchAll(/E'((?:[^'\\]|\\.)*)'|'((?:[^']|'')*)'/g))
    out += t[1] !== undefined ? t[1].replace(/\\n/g, '\n') : t[2].replace(/''/g, "'");
  return out;
}

test('the eleven 071 / 071b files are all there', () => {
  const files = fs.readdirSync(DIR).filter((f) => /^071b?_plan_/.test(f));
  assert.deepStrictEqual(files.slice().sort(), DO_FILES.concat(READ_ONLY).sort());
});

test('ASCII only: every 071 / 071b file and the dry-run builder', () => {
  for (const f of DO_FILES.concat(READ_ONLY, ['tools/build-071-dryruns.mjs'])) {
    const bad = [...read(f)].filter((c) => c.charCodeAt(0) > 127);
    assert.deepStrictEqual(bad, [], f);
  }
});

test('each writing file is ONE DO block; verify and fingerprint write nothing', () => {
  for (const f of DO_FILES) assert.strictEqual((read(f).match(/^DO \$/gm) || []).length, 1, f);
  for (const f of READ_ONLY) {
    // privilege names inside has_table_privilege('...', 'SELECT,INSERT,...') are strings, not writes
    const sql = strip(read(f)).replace(/'(?:[^']|'')*'/g, "''");
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|TRUNCATE)\b/i, f);
    assert.doesNotMatch(sql, /^DO \$/m, f);
  }
});

test('the dry runs are regenerated from their sources (node worker/migrations/drafts/tools/build-071-dryruns.mjs)', async () => {
  const { PAIRS, buildDryRun } = await import(path.join(DIR, 'tools/build-071-dryruns.mjs'));
  assert.strictEqual(PAIRS.length, 2);
  for (const p of PAIRS) assert.strictEqual(read(p.target), buildDryRun(read(p.source), p), p.target + ' drifted');
});

test('the four rewrites: ONE "-- 071:" line on the live text, md5 chain written down, the rollback undoes exactly them', () => {
  const src = read('071_plan_schema.sql');
  const rb = read('071_plan_schema_rollback.sql');
  const verify = read('071_plan_schema_verify.sql');
  for (const s of SUBS) {
    const a = sqlConst(src, s.a);
    const b = sqlConst(src, s.b);
    assert.notStrictEqual(a, b, s.sig);
    if (s.a === 'ls_old') {
      assert.ok(b.startsWith("|| ' ' || coalesce(lm.parent_order_id::text, "), 'dl_local_day_sync keeps the order number first');
      assert.ok(b.endsWith(', sep ORDER BY lm.id) -- 071: a nat_loading has no order, it names its cycle'));
    } else {
      assert.ok(b.startsWith(a + '\n  if '), `${s.sig}: the live line stays, ONE line follows it`);
      assert.strictEqual(b.split('\n').length, a.split('\n').length + 1, s.sig);
      assert.match(b.split('\n').pop(), /model = 2 then return( new)?; end if; -- 071: /);
    }
    assert.ok(src.includes(`'${s.sig}', '${s.old}'`), `071 guards ${s.sig} on the live md5 ${s.old}`);
    assert.ok(src.includes(`'${s.neu}'`), `071 proves the generated md5 ${s.neu}`);
    assert.strictEqual(sqlConst(rb, s.a), a, `rollback ${s.a} = 071 ${s.a}`);
    assert.strictEqual(sqlConst(rb, s.b), b, `rollback ${s.b} = 071 ${s.b}`);
    assert.ok(rb.includes(`'${s.neu}'`) && rb.includes(`'${s.old}'`), `rollback guards ${s.sig} both ways`);
    assert.ok(verify.includes(`'${s.neu}'`), `verify reads ${s.sig} at ${s.neu}`);
  }
});

test('B-54 moves by exactly +9 / -9 / 0, and only from the live count', () => {
  const guard = /IF NOT EXISTS \(SELECT 1 FROM monitoring\.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL\)/;
  const src = read('071_plan_schema.sql');
  assert.match(src, guard);
  assert.match(src, /IF v_trg1 <> v_trg0 \+ 9 THEN/);
  assert.match(src, /UPDATE monitoring\.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;/);
  assert.strictEqual((strip(src).match(/CREATE (CONSTRAINT )?TRIGGER /g) || []).length, 9, '071 creates exactly 9 triggers');
  const rb = read('071_plan_schema_rollback.sql');
  assert.match(rb, guard);
  assert.match(rb, /IF v_trg1 <> v_trg0 - 9 THEN/);
  assert.strictEqual((strip(rb).match(/DROP TRIGGER /g) || []).length, 9, 'the rollback drops exactly 9 triggers');
  const b = read('071b_plan_one_vehicle.sql');
  assert.match(b, /IF v_trg1 <> v_trg0 THEN/);
  assert.doesNotMatch(strip(b), /UPDATE monitoring\.checks|CREATE (CONSTRAINT )?TRIGGER/i, '071b adds no trigger and leaves B-54 alone');
});

test('born closed: RLS on, every privilege revoked from the four API roles, SELECT only, functions closed', () => {
  const src = strip(read('071_plan_schema.sql'));
  for (const t of TABLES) assert.match(src, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  const rels = TABLES.concat(VIEWS).map((r) => 'public\\.' + r).join(',\\s*');
  assert.match(src, new RegExp(`REVOKE ALL ON ${rels}\\s*FROM PUBLIC, anon, authenticated, service_role;`));
  assert.match(src, new RegExp(`GRANT SELECT ON ${rels}\\s*TO service_role, tms_reader, tms_check_runner;`));
  assert.doesNotMatch(src, /GRANT (INSERT|UPDATE|DELETE|ALL)/i, 'no write grant: only plan_* (F2) write');
  assert.doesNotMatch(src, /CREATE POLICY/i);
  for (const v of VIEWS) assert.match(src, new RegExp(`CREATE VIEW public\\.${v} WITH \\(security_invoker = true\\) AS`), v);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.plan_chk\(\), public\.plan_rt_window_sync\(\), public\.ct_rt_legs_v2_guard\(\),\s*public\.plan_shipment_problem\(bigint\), public\.plan_leg_problem\(bigint\), public\.plan_rt_problem\(bigint\),\s*public\.plan_local_loading_problem\(bigint\) FROM PUBLIC, anon, authenticated, service_role;/);
  for (const v of VIEWS) assert.doesNotMatch(src.slice(src.indexOf(`CREATE VIEW public.${v} `)).split(';')[0], /\b(price|partner_rate|revenue|cost)\b/i, `${v} carries no money`);
});

test('the spec of 21/10 holds in the schema', () => {
  const src = strip(read('071_plan_schema.sql'));
  const rtAlter = src.slice(src.indexOf('ALTER TABLE public.ct_round_trips'), src.indexOf(';', src.indexOf('ALTER TABLE public.ct_round_trips')));
  assert.doesNotMatch(rtAlter, /deleted_at/, 'spec 2.1: ct_round_trips has no deleted_at, a cycle that did not happen is cancelled');
  assert.match(rtAlter, /ADD CONSTRAINT rt_v2_status CHECK \(model = 1 OR status IN \('planned', 'cancelled'\)\)/);
  for (const gone of ['plan_chk_hub', 'hub_endpoint', 'deleted_batch', 'plan_restore', 'loader', 'qty_unit', 'plan_config'])
    assert.ok(!src.includes(gone), `spec 7: ${gone} is gone`);
  assert.match(src, /ADD CONSTRAINT local_moves_kind_chk CHECK \(move_kind IN \('local', 'relay_delivery', 'relay_loading', 'nat_loading'\)\)/);
  assert.match(src, /ALTER TABLE public\.local_moves ADD COLUMN rt_stop_id bigint REFERENCES public\.rt_stops \(id\) ON DELETE RESTRICT;/);
  assert.match(src, /ADD COLUMN via_hub boolean NOT NULL DEFAULT false/);
  assert.match(src, /\(es\.planned_to AT TIME ZONE 'Europe\/Athens'\)::date < \(now\(\) AT TIME ZONE 'Europe\/Athens'\)::date\) IS TRUE AS executed/, 'spec 2.3: executed by the Athens day of planned_to');
  assert.match(src, /\(s\.planned_to AT TIME ZONE 'Europe\/Athens'\)::date < \(now\(\) AT TIME ZONE 'Europe\/Athens'\)::date\) AS executed/);
  assert.doesNotMatch(src, /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.(national_loads|groupage_lines|consolidated_loads|national_orders)\b/i,
    '071 writes no NL / GL / CL / national order');
  assert.doesNotMatch(src, /CREATE TRIGGER rt_status_guard|DROP FUNCTION public\.(rt_|dl_)/, 'live functions are replaced in place, never dropped');
});

test('the new tables never enter the facade TABLES map (spec 2.1)', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'worker/src/index.js'), 'utf8');
  for (const t of TABLES) assert.ok(!worker.includes(`pg: "${t}"`), `${t} must stay out of TABLES`);
});

test('every plan: code 071 can raise is a case of the rules test', () => {
  const src = read('071_plan_schema.sql');
  const codes = new Set([...strip(src).matchAll(/'([a-z][a-z0-9_]*):/g)].map((m) => m[1]).filter((c) => c !== 'plan'));
  for (const m of src.matchAll(/hint = 'plan:([a-z0-9_]+)'/g)) codes.add(m[1]);
  assert.ok(codes.size >= 25, `found ${codes.size} codes`);
  const testSql = read('071_plan_schema_test.sql');
  for (const c of codes) assert.ok(testSql.includes(`'plan:${c}'`), `plan:${c} has no case in 071_plan_schema_test.sql`);
});
```

- [ ] **Step 2: Τρέξε**

Run: `node --test tests/sql-071-drafts.test.js`
Expected: αποτυγχάνουν μόνο όσα θέλουν αρχεία 071b (`the eleven ... files`, `ASCII`, `ONE DO block`, `dry runs`, `B-54`) με `ENOENT ... 071b_plan_one_vehicle.sql`. Τα υπόλοιπα περνούν. Αν αποτύχει το `every plan: code`, λείπει περίπτωση για κωδικό: πρόσθεσέ τη στο Task 4 (και `54` → νέος αριθμός στο test και στο harness).

- [ ] **Step 3: Commit**

```bash
git add tests/sql-071-drafts.test.js
git commit -m "tests: 071 drafts at build time (ASCII, one DO, md5 chain, B-54, born closed, spec deltas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `071b` — ένα φορτηγό και ένας οδηγός τη φορά (χωριστό «ναι»)

**Files:**
- Create: `worker/migrations/drafts/071b_plan_one_vehicle.sql`
- Create (παράγεται): `worker/migrations/drafts/071b_plan_one_vehicle_dryrun.sql`
- Create: `worker/migrations/drafts/071b_plan_one_vehicle_verify.sql`
- Create: `worker/migrations/drafts/071b_plan_one_vehicle_test.sql`
- Create: `worker/migrations/drafts/071b_plan_one_vehicle_rollback.sql`

**Interfaces:**
- Consumes: 071 (`model`, `start_at`, `end_at`, `trip_type`, `status`)
- Produces: `rt_v2_truck_once`, `rt_v2_driver_once` (SQLSTATE `23P01`, deferrable) → Φ2: `truck_busy` / `driver_busy`, με τον κωδικό του άλλου κύκλου στο μήνυμα.

- [ ] **Step 1: Το migration**

`worker/migrations/drafts/071b_plan_one_vehicle.sql`:
```sql
-- 071b - NATIONAL v5, F1 second step: ONE TRUCK AND ONE DRIVER AT A TIME for owned v5 cycles.
--
-- DRAFT - NOT EXECUTED. A SEPARATE yes from 071 (tech draft, "technical approvals": CREATE EXTENSION btree_gist and
-- two EXCLUDE). Runs AFTER 071, after 15:00, in this order:
--   1. 071b_plan_one_vehicle_dryrun.sql   this block + a deliberate error: NOTHING kept
--   2. 071b_plan_one_vehicle.sql          (this file)
--   3. 071b_plan_one_vehicle_verify.sql   read-only, one row
--   4. 071b_plan_one_vehicle_test.sql     OPTIONAL on production: 8 cases on TEST rows, nothing kept
-- WHY: with 2-3 cycles a week per truck (Wednesday morning one ends, Wednesday afternoon the next starts) a double
-- booking must be refused by the base on every path (principle 4); F2 maps 23P01 by constraint name to truck_busy /
-- driver_busy. Only model=2 OWNED cycles that are not cancelled; [start_at, end_at) so a cycle ending at 14:00 and
-- the next starting at 14:00 do not collide. Today's round trips (model=1) are not touched.
-- DEFERRABLE INITIALLY DEFERRED: plan_* moves stops one by one inside one transaction (each move re-computes the
-- window, plan_rt_window_sync); only the window at COMMIT counts.
-- btree_gist gives "=" on bigint inside a GiST index (measured 21/10: available, not installed). It goes into schema
-- extensions (Supabase convention). If CREATE EXTENSION is refused in the SQL editor: Dashboard -> Database ->
-- Extensions -> btree_gist -> enable (schema extensions), then run this file again (IF NOT EXISTS).
-- Adds no trigger: B-54 unchanged (proved below). ASCII only. ONE DO block = ONE statement.
-- REVERSE: 071b_plan_one_vehicle_rollback.sql (drops the two constraints; the extension stays).
-- EXPECTED: NOTICE "071b OK: ..." and ONE row "071b OK | true | true | <btree_gist version>".

DO $do$
DECLARE
  v_trg0 int; v_trg1 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.rt_stops') IS NULL OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ct_round_trips' AND column_name = 'start_at') THEN
    RAISE EXCEPTION '071b: 071 is not applied - run 071 first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
              AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) THEN
    RAISE EXCEPTION '071b: already applied - run 071b_plan_one_vehicle_verify.sql instead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'btree_gist') THEN
    RAISE EXCEPTION '071b: btree_gist is not available on this server - stop';
  END IF;
  IF to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION '071b: schema extensions does not exist - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ALTER TABLE public.ct_round_trips
    ADD CONSTRAINT rt_v2_truck_once EXCLUDE USING gist (truck_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
      WHERE (model = 2 AND trip_type = 'OWNED' AND truck_id IS NOT NULL AND status <> 'cancelled')
      DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT rt_v2_driver_once EXCLUDE USING gist (driver_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
      WHERE (model = 2 AND trip_type = 'OWNED' AND driver_id IS NOT NULL AND status <> 'cancelled')
      DEFERRABLE INITIALLY DEFERRED;

  -- PROOFS
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
       AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') AND contype = 'x' AND condeferrable AND condeferred) <> 2 THEN
    RAISE EXCEPTION '071b proof: the two EXCLUDE constraints are not both there, deferrable, initially deferred';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN
    RAISE EXCEPTION '071b proof: trigger count % -> % (expected no change)', v_trg0, v_trg1;
  END IF;

  RAISE NOTICE '071b OK: one truck and one driver at a time for owned v5 cycles; btree_gist %; triggers % (B-54 unchanged)',
    (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist'), v_trg1;
END $do$;

SELECT CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
                   AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) = 2 THEN '071b OK' ELSE '071b NOT APPLIED' END AS result,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_truck_once' AND condeferred) AS truck_once,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_driver_once' AND condeferred) AS driver_once,
       (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist') AS btree_gist;
```

- [ ] **Step 2: Verify και rollback**

`worker/migrations/drafts/071b_plan_one_vehicle_verify.sql`:
```sql
-- 071b VERIFY - read-only (SELECT only). ONE row. ASCII only.
-- EXPECTED after 071b: truck_once = true ; driver_once = true ; btree_gist = its version ; truck_overlaps = 0 ;
-- driver_overlaps = 0 (the last two are an independent count of what the constraints forbid: always 0).
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_truck_once'
           AND contype = 'x' AND condeferrable AND condeferred) AS truck_once,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_driver_once'
           AND contype = 'x' AND condeferrable AND condeferred) AS driver_once,
  (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist') AS btree_gist,
  (SELECT count(*) FROM public.ct_round_trips a JOIN public.ct_round_trips b ON a.id < b.id AND a.truck_id = b.truck_id
     AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   WHERE a.model = 2 AND b.model = 2 AND a.trip_type = 'OWNED' AND b.trip_type = 'OWNED'
     AND a.status <> 'cancelled' AND b.status <> 'cancelled') AS truck_overlaps,
  (SELECT count(*) FROM public.ct_round_trips a JOIN public.ct_round_trips b ON a.id < b.id AND a.driver_id = b.driver_id
     AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   WHERE a.model = 2 AND b.model = 2 AND a.trip_type = 'OWNED' AND b.trip_type = 'OWNED'
     AND a.status <> 'cancelled' AND b.status <> 'cancelled') AS driver_overlaps;
```

`worker/migrations/drafts/071b_plan_one_vehicle_rollback.sql`:
```sql
-- 071b ROLLBACK - the two EXCLUDE constraints go. btree_gist stays installed (harmless; DROP EXTENSION only with its
-- own yes). Run it BEFORE 071_plan_schema_rollback.sql when both are undone.
-- DRAFT - NOT EXECUTED. Only with an explicit yes, after 15:00. ASCII only. ONE DO block.
-- EXPECTED: NOTICE "071b ROLLBACK OK ..." and ONE row "071b ROLLED BACK".

DO $do$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
       AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) <> 2 THEN
    RAISE EXCEPTION '071b rollback: the two 071b constraints are not both there - stop';
  END IF;
  ALTER TABLE public.ct_round_trips DROP CONSTRAINT rt_v2_truck_once, DROP CONSTRAINT rt_v2_driver_once;
  RAISE NOTICE '071b ROLLBACK OK: both EXCLUDE constraints dropped; btree_gist stays installed';
END $do$;

SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('rt_v2_truck_once', 'rt_v2_driver_once'))
            THEN '071b ROLLED BACK' ELSE '071b STILL IN PLACE' END AS result;
```

- [ ] **Step 3: Το test (8 περιπτώσεις)**

`worker/migrations/drafts/071b_plan_one_vehicle_test.sql`:
```sql
-- RULES TEST 071b (one truck / one driver at a time): 8 cases on TEST rows, then undone. Runs AFTER 071b said
-- "071b OK". On PGlite at build time; on production OPTIONAL, after 15:00, with an explicit yes (identity and code
-- sequences advance, nothing else stays).
-- Every case starts from cycle A: OWNED, truck T1, driver D1, day D 06:00-14:00, no stops.
-- Cases: 1 same truck 10-18 -> refused (truck); 2 same truck 14-20 -> OK (half-open: ends 14:00, next starts 14:00);
-- 3 another truck, same driver 10-18 -> refused (driver); 4 same truck 10-18 but cancelled -> OK; 5 a PARTNER cycle
-- 10-18 -> OK; 6 a model=1 round trip on the same truck -> OK (today's round trips untouched); 7 a cycle 15-18 whose
-- first stop moves to 12:00 -> refused at commit (the window follows the stops, the constraint sees it);
-- 8 another truck and driver 10-18 -> OK.
-- EXPECTED: "RULES TEST 071b finished - EVERYTHING UNDONE, nothing kept. Result: 8 OK, 0 FAIL". ASCII only.
DO $dry$
DECLARE
  d date; k int; la bigint; lb bigint; t1 bigint; t2 bigint; d1 bigint; d2 bigint; pa bigint; a bigint; b bigint; s bigint;
  want text[] := ARRAY['con:rt_v2_truck_once', 'ok', 'con:rt_v2_driver_once', 'ok', 'ok', 'ok', 'con:rt_v2_truck_once', 'ok'];
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_truck_once')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_driver_once') THEN
    RAISE EXCEPTION 'RULES TEST 071b: 071b is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec071bT%') OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-071B-%')
     OR EXISTS (SELECT 1 FROM drivers WHERE full_name LIKE 'TEST 071B %') OR EXISTS (SELECT 1 FROM partners WHERE company_name LIKE 'TEST 071B %') THEN
    RAISE EXCEPTION 'RULES TEST 071b: test ids already exist - stop';
  END IF;
  d := (now() AT TIME ZONE 'Europe/Athens')::date + 41;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071bTA', 'TEST 071B A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec071bTB', 'TEST 071B B') RETURNING id INTO lb;
  INSERT INTO trucks (license_plate) VALUES ('TEST-071B-1') RETURNING id INTO t1;
  INSERT INTO trucks (license_plate) VALUES ('TEST-071B-2') RETURNING id INTO t2;
  INSERT INTO drivers (full_name) VALUES ('TEST 071B 1') RETURNING id INTO d1;
  INSERT INTO drivers (full_name) VALUES ('TEST 071B 2') RETURNING id INTO d2;
  INSERT INTO partners (company_name) VALUES ('TEST 071B partner') RETURNING id INTO pa;

  FOR k IN 1..8 LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', t1, d1, d, d, (d + time '06:00') AT TIME ZONE 'Europe/Athens',
              (d + time '14:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:071b') RETURNING id INTO a;
      IF k IN (1, 2, 3, 4, 8) THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', CASE WHEN k IN (3, 8) THEN t2 ELSE t1 END, CASE WHEN k = 3 THEN d1 ELSE d2 END, d, d,
                (d + CASE WHEN k = 2 THEN time '14:00' ELSE time '10:00' END) AT TIME ZONE 'Europe/Athens',
                (d + CASE WHEN k = 2 THEN time '20:00' ELSE time '18:00' END) AT TIME ZONE 'Europe/Athens',
                CASE WHEN k = 4 THEN 'cancelled' ELSE 'planned' END, 'planner', 'test:071b');
      ELSIF k = 5 THEN
        INSERT INTO ct_round_trips (model, scope, trip_type, partner_id, date_start, date_end, start_at, end_at, status, source, created_by)
        VALUES (2, 'NATL', 'PARTNER', pa, d, d, (d + time '10:00') AT TIME ZONE 'Europe/Athens',
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:071b');
      ELSIF k = 6 THEN
        INSERT INTO ct_round_trips (scope, trip_type, truck_id, driver_id, date_start, status, source, created_by)
        VALUES ('NATL', 'OWNED', t1, d2, d, 'planned', 'manual', 'test:071b');
      ELSE   -- 7
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', t1, d2, d, d, (d + time '15:00') AT TIME ZONE 'Europe/Athens',
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:071b') RETURNING id INTO b;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (b, 1, la, 'KATHODOS', (d + time '15:00') AT TIME ZONE 'Europe/Athens',
                (d + time '16:00') AT TIME ZONE 'Europe/Athens', 'test:071b') RETURNING id INTO s;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (b, 2, lb, 'KATHODOS', (d + time '17:00') AT TIME ZONE 'Europe/Athens',
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'test:071b');
        SET CONSTRAINTS ALL IMMEDIATE;
        SET CONSTRAINTS ALL DEFERRED;
        UPDATE rt_stops SET planned_from = (d + time '12:00') AT TIME ZONE 'Europe/Athens' WHERE id = s;
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;
      verdict := CASE WHEN want[k] = 'ok' THEN 'ok' ELSE 'FAIL no error' END;
      RAISE EXCEPTION 'wn071b undo' USING HINT = 'wn071b_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn071b_undo' THEN coalesce(verdict, 'FAIL no verdict')
                  WHEN hint LIKE 'plan:%' THEN hint
                  WHEN coalesce(cname, '') <> '' THEN 'con:' || cname
                  ELSE 'state:' || st END;
      IF (want[k] = 'ok' AND got LIKE 'ok%') OR got = want[k] THEN
        ok := ok + 1; res := res || k::text;
      ELSE
        bad := bad + 1; res := res || (k || ' FAIL want ' || want[k] || ' got ' || got || ' (' || msg || ')');
      END IF;
    END;
  END LOOP;

  RAISE EXCEPTION 'RULES TEST 071b finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$dry$;
```

- [ ] **Step 4: Παράγαγε το dry run και τρέξε όλα τα tests**

```bash
node worker/migrations/drafts/tools/build-071-dryruns.mjs
node --test tests/sql-071-drafts.test.js
cd tms-auditor && node --test test/plan-071.test.mjs && cd ..
LC_ALL=C grep -n '[^ -~]' worker/migrations/drafts/071* worker/migrations/drafts/tools/build-071-dryruns.mjs | head
```
Expected: `wrote 071_plan_schema_dryrun.sql`, `wrote 071b_plan_one_vehicle_dryrun.sql`· `tests/sql-071-drafts.test.js` όλα pass (`# fail 0`)· το harness όλα pass (το 071b skip μόνο αν λείπει το btree_gist, Task 0 Step 3)· το grep δεν βγάζει γραμμές.

- [ ] **Step 5: Οι υπόλοιπες σουίτες δεν σπάνε**

```bash
node --test tests/sql-069-drafts.test.js tests/sql-070-drafts.test.js
cd tms-auditor && npm test && cd ..
```
Expected: `# fail 0` και στα δύο (το `catalog.test.mjs` περνά: δεν αλλάξαμε ακόμη κανέναν έλεγχο).

- [ ] **Step 6: Commit**

```bash
git add worker/migrations/drafts/071b_plan_one_vehicle*.sql worker/migrations/drafts/071_plan_schema_dryrun.sql
git commit -m "071b (SQL, DRAFT, separate yes): btree_gist + one truck / one driver at a time for owned v5 cycles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ίχνος, έλεγχος κώδικα, PR

**Files:**
- Modify: `docs/DECISION_LOG.md` (προσθήκη στο τέλος)
- Create: `docs/sessions/2026-10-22-dimitris-national-v5-f1-schema.md`
- Modify: `docs/SESSION.md` (μόνο η γραμμή `dimitris` του national v5, στο «Now»)

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: PR με τίτλο `071/071b (SQL, DRAFT): national v5 schema born closed, 0 rows`

- [ ] **Step 1: DECISION_LOG** (πρόσθεσε στο τέλος του αρχείου)

```markdown
### 2026-10-22 · Εθνικά v5 Φ1 · σχήμα `071` (κλειστό, 0 γραμμές) και `071b` (ένα φορτηγό/ένας οδηγός)
**Επιλογή:** Το 071 φτιάχνει τους πίνακες, τις στήλες, τις όψεις και τους κανόνες του v5 όπως λέει το spec της 21/10 (`ct_round_trips` χωρίς `deleted_at`, η Βέροια κανονικός τόπος, «έγινε» = πέρασε η ημέρα Αθήνας του `planned_to`). Ξαναγράφει τα `rt_status_guard`, `rt_recompute`, `rt_auto_close` και `dl_local_day_sync` από το ζωντανό τους κείμενο, με μία γραμμή η καθεμία. Το 071b (`btree_gist` + 2 `EXCLUDE`) θέλει δικό του «ναι». Αποφάσεις του πλάνου, που το spec δεν όριζε:
(1) `order_stops.via_hub` με προεπιλογή false, χωρίς backfill ως τη 074·
(2) ο `plan_config` (ημέρα L) πηγαίνει στη 074·
(3) η `nat_loading` δεν θέλει ρυμουλκούμενο·
(4) η γραμμή ΤΟΠΙΚΟ μιας `nat_loading` γράφει τον κωδικό του κύκλου·
(5) ένα κομμάτι κινείται μόνο ανάμεσα σε αφετηρία, Βέροια και προορισμό·
(6) σε κάθε κύκλο η ΚΑΘΟΔΟΣ προηγείται της ΑΝΟΔΟΥ·
(7) στάσεις πρώτα, κύκλος μετά (FK deferred, `OVERRIDING SYSTEM VALUE`)·
(8) τα `EXCLUDE` είναι deferred·
(9) το `partner_rate` το βλέπει ο `tms_reader`, όπως ήδη το `orders.partner_rate`.
**Εναλλακτικές:** `plan_config` στη Φ1 (θα άφηνε 1 γραμμή)· `via_hub` NULL = «δεν δηλώθηκε» (δύο σημασίες σε μία στήλη)· UNIQUE αντί για trigger για το `seq` (δεν γίνεται deferred σε partial index)· `EXCLUDE` άμεσα (θα αρνούνταν ενδιάμεσα παράθυρα μέσα σε μία μετακίνηση). Απορρίφθηκαν.
**Απόδειξη:** μετρήσεις 21–22/10 μόνο με SELECT (md5 των 4 συναρτήσεων, B-54 = 37, `btree_gist` διαθέσιμο, μη εγκατεστημένο)· `071_plan_schema_test.sql` 54/54 και `071b_plan_one_vehicle_test.sql` 8/8 σε PGlite (`tms-auditor/test/plan-071.test.mjs`)· `tests/sql-071-drafts.test.js`.
**Ποιος:** πλάνο Φ1 (agent), προς έγκριση owner στο PR· εκτέλεση owner μετά τις 15:00.
```

- [ ] **Step 2: Session file**

`docs/sessions/2026-10-22-dimitris-national-v5-f1-schema.md`:
```markdown
# 2026-10-22 · dimitris · Εθνικά v5 Φ1: σχήμα 071 + 071b (DRAFT)

- Γράφτηκαν τα `071_plan_schema*` (σχήμα κλειστό, 0 γραμμές, B-54 37 → 46) και `071b_plan_one_vehicle*` (`btree_gist` + ένα φορτηγό/ένας οδηγός τη φορά, χωριστό «ναι»). Πλάνο: `docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md`.
- Αποδείχθηκαν σε PGlite με σχήμα παραγωγής (`tms-auditor/test/plan-071.test.mjs`): 071 54/54, 071b 8/8, το rollback επαναφέρει τα 4 ζωντανά κείμενα byte προς byte. Έλεγχοι build: `tests/sql-071-drafts.test.js`.
- Αποφάσεις πλάνου (via_hub χωρίς backfill, plan_config στη 074, nat_loading χωρίς ρυμουλκούμενο, κ.ά.) στο DECISION_LOG 22/10, προς έγκριση owner.
- Μένει: εκτέλεση από τον owner μετά τις 15:00 (Task 8), μετά καθρέφτης B-54 = 46 και μεταφορά εκτός `drafts/` (Task 9). Οι καθρέφτες B-54 λένε σήμερα 35, ενώ η παραγωγή έχει 37.
```

- [ ] **Step 3: SESSION.md, μόνο η δική σου γραμμή**

Στο `docs/SESSION.md`, κάτω από «In flight», πρόσθεσε ακριβώς αυτή τη γραμμή (δεν αγγίζεις άλλη):
```markdown
- dimitris · `feat/national-v5-schema` · National v5 F1: SQL drafts 071 (schema, born closed, 0 rows) + 071b (one truck/driver), proved on PGlite; waits for the owner's evening run
```

- [ ] **Step 4: Έλεγχος κώδικα (high: δεδομένα/ρόλοι, xhigh: βάση — feedback owner 20/10)**

Run: `/code-review xhigh` πάνω στο branch. Διόρθωσε τα ευρήματα, ξανάτρεξε Task 6 Step 4 και Step 5, και γράψε commit με «review of 071».

- [ ] **Step 5: Push και PR**

```bash
git add docs/DECISION_LOG.md docs/sessions/2026-10-22-dimitris-national-v5-f1-schema.md docs/SESSION.md
git commit -m "docs: national v5 F1 (071/071b) decision log, session, Now line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/national-v5-schema
gh pr create --title "071/071b (SQL, DRAFT): national v5 schema born closed, 0 rows" --body "$(cat <<'EOF'
## What
- `071_plan_schema.sql`: v5 schema (shipments, shipment_pieces, rt_stops, piece_legs, plan_notices; ct_round_trips.model/start_at/end_at/partner_rate; order_stops.via_hub; local_moves nat_loading + rt_stop_id; pl_movements.piece_leg_id; 8 read views; 9 triggers). Born closed, 0 rows, B-54 37 -> 46.
- Four live functions learn model=2 from their LIVE text (md5 read 21/10), one line each: rt_status_guard, rt_recompute, rt_auto_close, dl_local_day_sync.
- `071b_plan_one_vehicle.sql` (separate yes): btree_gist + one truck / one driver at a time for owned v5 cycles.

## Proof
- PGlite, production-shaped: `cd tms-auditor && node --test test/plan-071.test.mjs` (071 54/54, 071b 8/8, rollback back to the live texts byte for byte).
- Build: `node --test tests/sql-071-drafts.test.js`.

## Owner
- Nothing runs on merge. The owner runs the SQL after 15:00 (plan Task 8). Decisions the spec did not fix: DECISION_LOG 22/10.
- Rollback exists only until the first real v5 row (spec 2.2).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: URL του PR. Αν το push απορριφθεί ως «protected branch», ΣΤΑΜΑΤΑ και πες το.

---

### Task 8: Εκτέλεση από τον owner (runbook· ο agent μόνο διαβάζει)

**Files:** κανένα.

**Interfaces:**
- Consumes: merge του PR από τον Δημήτρη· ρητό «ναι» για το 071 και **χωριστό** «ναι» για το 071b, μετά τις 15:00
- Produces: 071 (και 071b) στην παραγωγή

> Πριν από το «ναι», ο agent λέει ρητά στον owner: «Επιστροφή πίσω υπάρχει μόνο πριν από την πρώτη πραγματική γραμμή v5. Μετά, μόνο διορθώσεις προς τα εμπρός (spec §2.2).»

- [ ] **Step 1 (owner, SQL editor):** `071_plan_schema_fingerprint.sql`. Κράτα τη γραμμή (`round_trips`, `rt_md5`, `dl_rows`, `dl_md5`).
- [ ] **Step 2 (owner):** `071_plan_schema_dryrun.sql`. Expected: κόκκινο `ERROR: P0001: DRY RUN 071 finished - EVERYTHING UNDONE, nothing kept. The block ran to its end  ||  071 ran: tables 5, model column true, hub CROSS-DOCK, rt_recompute 5fa0a08418147b22d2852db3b8c72c3e, B-54 46`. Οτιδήποτε άλλο: ΣΤΑΜΑΤΑ, το μήνυμα στον συντονιστή.
- [ ] **Step 3 (owner):** `071_plan_schema.sql`. Expected: `NOTICE 071 OK: ...` και η γραμμή `071 OK | 46 | 46 | <round_trips του Step 1> | 0 | CROSS-DOCK`.
- [ ] **Step 4 (owner ή agent με SELECT):** `071_plan_schema_verify.sql`. Expected: `071 in place | true | 9 | 0 | 0 | <round_trips> | 360 CROSS-DOCK | 0 | 0 | 0 | 0 | 0 | 0`.
- [ ] **Step 5 (owner):** `071_plan_schema_fingerprint.sql` ξανά. Expected: `rt_md5` ίδιο με το Step 1. Το `dl_md5` ίδιο, εκτός αν κάποιος αποθήκευσε μισθοδοσία στο μεταξύ (`SELECT id, updated_at FROM dl_entries WHERE updated_at > '<read_at του Step 1>'`). Η αυθεντική απόδειξη είναι μέσα στο block του 071.
- [ ] **Step 6 (προαιρετικό, χωριστό «ναι»):** `071_plan_schema_test.sql`. Expected: `RULES TEST 071 finished - EVERYTHING UNDONE, nothing kept. Result: 54 OK, 0 FAIL`. Οι αριθμοί RT-/PM- προχωρούν όσο οι δοκιμαστικές γραμμές· αυτό είναι το μόνο ίχνος.
- [ ] **Step 7 (owner, ΧΩΡΙΣΤΟ «ναι» για 071b):** επαναμέτρηση `SELECT name, installed_version FROM pg_available_extensions WHERE name = 'btree_gist'` (expected `btree_gist | NULL`)· `071b_plan_one_vehicle_dryrun.sql` (expected: `DRY RUN 071b finished ... 071b ran: rt_v2_truck_once true, rt_v2_driver_once true, btree_gist <έκδοση>`)· `071b_plan_one_vehicle.sql` (expected: `071b OK | true | true | <έκδοση>`)· `071b_plan_one_vehicle_verify.sql` (expected: `true | true | <έκδοση> | 0 | 0`)· προαιρετικά `071b_plan_one_vehicle_test.sql` (expected: `Result: 8 OK, 0 FAIL`).
- [ ] **Step 8 (agent, SELECT, μετά την επόμενη ωριαία εκτέλεση):** `SELECT run_at, status, value FROM monitoring.results WHERE check_id = 'B-54' ORDER BY run_at DESC LIMIT 1`. Expected: `status = 'green'`, `value = 46`, `run_at` μετά την εκτέλεση του 071.

---

### Task 9: Μετά την εκτέλεση: καθρέφτης B-54 και έξοδος από το `drafts/`

**Files:**
- Modify: `tms-auditor/checks/B-54.sql` (γραμμές `-- red:` και `-- source:`)
- Modify (παράγεται): `worker/migrations/drafts/047b_monitoring_seed.sql`
- Move: τα 11 αρχεία `071*` / `071b*` από `worker/migrations/drafts/` σε `worker/migrations/`
- Modify: `worker/migrations/drafts/tools/build-071-dryruns.mjs` (`DIR`), `tests/sql-071-drafts.test.js` (`DIR`), `tms-auditor/test/plan-071.test.mjs` (`read`)

**Interfaces:**
- Consumes: Task 8 ολοκληρωμένο (verify της παραγωγής)
- Produces: καθρέφτες = παραγωγή· CLAUDE.md κανόνας 5

- [ ] **Step 1: Νέο branch από φρέσκο main**

```bash
git fetch origin && git switch -c docs/071-executed origin/main
```

- [ ] **Step 2: B-54**

Στο `tms-auditor/checks/B-54.sql`, η γραμμή `-- red: <> 35` γίνεται `-- red: <> 46`. Στο τέλος της γραμμής `-- source:` πρόσθεσε:
```
 -> 37 after 069 (+2: order_cd_stop_follow, ramp_follows_stop; mirror was left at 35) -> 46 after 071 (+9: ct_rt_legs_v2_guard, plan_rt_window_sync, plan_chk_rt, plan_chk_stops, plan_chk_legs, plan_chk_pieces, plan_chk_shipments, plan_chk_bridge_stop, plan_chk_local_loading; executed <date of Task 8>); 071b adds none
```
Μετά:
```bash
cd tms-auditor && node checks/build-seed.mjs && npm test && cd ..
```
Expected: `047b_monitoring_seed.sql` ξαναγράφτηκε με 46 στο B-54· `# fail 0`.

- [ ] **Step 3: Έξοδος από το `drafts/` (CLAUDE.md κανόνας 5)**

```bash
git mv worker/migrations/drafts/071_plan_schema.sql worker/migrations/drafts/071_plan_schema_dryrun.sql \
  worker/migrations/drafts/071_plan_schema_verify.sql worker/migrations/drafts/071_plan_schema_fingerprint.sql \
  worker/migrations/drafts/071_plan_schema_test.sql worker/migrations/drafts/071_plan_schema_rollback.sql \
  worker/migrations/drafts/071b_plan_one_vehicle.sql worker/migrations/drafts/071b_plan_one_vehicle_dryrun.sql \
  worker/migrations/drafts/071b_plan_one_vehicle_verify.sql worker/migrations/drafts/071b_plan_one_vehicle_test.sql \
  worker/migrations/drafts/071b_plan_one_vehicle_rollback.sql worker/migrations/
```
Στο `worker/migrations/drafts/tools/build-071-dryruns.mjs` αντικατέστησε:
```js
export const DIR = path.resolve(HERE, '..');
```
με:
```js
export const DIR = path.resolve(HERE, '../..');
```
Στο `tests/sql-071-drafts.test.js` αντικατέστησε:
```js
const DIR = path.join(ROOT, 'worker/migrations/drafts');   // after the run: worker/migrations (CLAUDE.md rule 5)
```
με:
```js
const DIR = path.join(ROOT, 'worker/migrations');   // executed: out of drafts/ (CLAUDE.md rule 5)
```
και τη γραμμή `const { PAIRS, buildDryRun } = await import(path.join(DIR, 'tools/build-071-dryruns.mjs'));` με `const { PAIRS, buildDryRun } = await import(path.join(ROOT, 'worker/migrations/drafts/tools/build-071-dryruns.mjs'));`. Επίσης στο ίδιο αρχείο, στο test «ASCII only», το `'tools/build-071-dryruns.mjs'` γίνεται `'drafts/tools/build-071-dryruns.mjs'`.
Στο `tms-auditor/test/plan-071.test.mjs` αντικατέστησε:
```js
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
```
με:
```js
const read = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');   // 071 executed: worker/migrations
```
Στην πρώτη γραμμή σχολίου κάθε αρχείου 071/071b που λέει `DRAFT - NOT EXECUTED.` γράψε `EXECUTED <ημερομηνία Task 8> by the owner.`. Ξαναπαράγαγε τα dry runs: `node worker/migrations/drafts/tools/build-071-dryruns.mjs`.

- [ ] **Step 4: Tests**

```bash
node --test tests/sql-071-drafts.test.js && (cd tms-auditor && node --test test/plan-071.test.mjs)
```
Expected: `# fail 0` και στα δύο.

- [ ] **Step 5: Ίχνος, commit, PR**

Μία γραμμή στο `docs/DECISION_LOG.md`, κάτω από την εγγραφή της 22/10: `**Εκτελέστηκε:** <ημερομηνία>, owner· verify 071 in place, B-54 46· 071b <ναι/όχι>.` Και στο `docs/sessions/`, νέο αρχείο `<ημερομηνία>-dimitris-071-executed.md` με το αποτέλεσμα του verify. Μετά:
```bash
git add -A worker/migrations tms-auditor/checks/B-54.sql tests/sql-071-drafts.test.js tms-auditor/test/plan-071.test.mjs docs
git commit -m "071 executed: B-54 mirror = 46, files out of drafts/ (rule 5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin docs/071-executed && gh pr create --fill
```

---

## Αν σπάσει, πώς θα το μάθουμε

- **Στο build:** το `tests/sql-071-drafts.test.js` πιάνει dry run που δεν ξαναπαράχθηκε, md5 που δεν ενημερώθηκε, B-54 εκτός +9/−9/0, προνόμιο που άνοιξε, κωδικό χωρίς δοκιμή, και νέο πίνακα στο `TABLES`. Το `plan-071.test.mjs` πιάνει κάθε κανόνα που δεν κάνει αυτό που λέει, πάνω σε αντίγραφο με το σχήμα της παραγωγής.
- **Το βράδυ της εκτέλεσης:** το DO block είναι όλα ή τίποτα. Κάθε φρουρός ονομάζει τι βρήκε· το snapshot μέσα στο block αρνείται και την παραμικρή διαφορά, ως το σεντ.
- **Μετά:** ο B-54 (P1, ωριαία) φωνάζει αν χαθεί ή απενεργοποιηθεί ένα από τα 46 triggers. Κάθε άρνηση `plan:` είναι `23514` με κωδικό, και η Φ2 τη δείχνει ως ελληνικό 422, ποτέ σιωπηλό 200.
- **Τι δεν πιάνει ακόμη η Φ1** (ανήκει σε επόμενες φάσεις): VS ≥ L χωρίς αποστολή, NL μετά το L, X εκτός {0, 650, 850}, άδειος κύκλος, κόμιστρο που λείπει. Αυτά είναι οι έλεγχοι του spec §8, στις 073/074.

## Self-review (έγινε)

- **Κάλυψη spec:** §2.1 (μία πηγή ανά γεγονός, `cancelled` αντί `deleted_at`, `nat_loading` + `rt_stop_id`) → Task 2 §2/§4/§5· §2.3 («έγινε», τέλος κύκλου, καθυστέρηση) → όψεις + περιπτώσεις 46–49· §3 VS (κόμβος ανά στάση) → `via_hub`· §3 Board (σπάσιμο μόνο στη Βέροια, Βέροια κανονικός τόπος, μόνο ΑΝΟΔΟΣ, ✈ τοπικός) → `split_not_at_hub`, `leg_place`, `side_order`, `nat_loading`· §7 (τι φεύγει / τι μπαίνει) → test «the spec of 21/10 holds»· §7 σειρά INSERT `plan_rt_create` → περίπτωση 25· §7 `plan_notices` → πίνακας· §7 πεδία `national_orders` → φρουρός 27 στηλών· §9 δοκιμές → Tasks 1, 4, 5, 6. Β-54 καθρέφτης → Task 9.
- **Εκτός Φ1 και δηλωμένα:** `plan_*`, Worker, οθόνες, χρήματα/X (073), γέφυρα/L (074).
- **Ονόματα:** ίδια σε Interfaces, SQL, tests (`plan_chk_*`, `v_*`, κωδικοί `plan:`, md5).
- **Δοκιμασμένο πριν παραδοθεί (22/10, scratch, εκτός repo):** τα code blocks αυτού του πλάνου εξήχθησαν αυτούσια και έτρεξαν σε PGlite 0.5.8 με σχήμα παραγωγής και αντίγραφα των ζωντανών συναρτήσεων. Τα md5 είχαν προσαρμοστεί στα αντίγραφα· η αλυσίδα md5 της παραγωγής αποδείχθηκε χωριστά με SELECT `replace()`. Αποτελέσματα:
  - το `tests/sql-071-drafts.test.js` δίνει 10/10
  - το dry run του 071 δεν κρατά τίποτα· το 071 εφαρμόζεται (+9 triggers)· το verify είναι καθαρό
  - rules test 54/54, και 54/54 ξανά με το 071b εγκατεστημένο· 071b 8/8
  - το rollback του 071 αρνείται όσο το 071b είναι στη θέση του· και τα δύο rollbacks επαναφέρουν τα 4 κείμενα byte προς byte και τα 3 CHECK του 060 ίδια
  - το 071 ξαναεφαρμόζεται μετά το rollback
  - μεταλλαγή χωρίς τη γραμμή του `rt_recompute`: 53/54, αποτυγχάνει η περίπτωση 21.
