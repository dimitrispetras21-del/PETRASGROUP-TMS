# Φ2 (072 `plan_*`): ανατομία της βάσης που θα χρησιμοποιήσουν οι συναρτήσεις

Μετρήθηκε 22/10/2026 στην παραγωγή (`gatejgbpyodlepkvqkgf`, PostgreSQL 17.6), **μόνο SELECT**, και από τα αρχεία
`worker/migrations/071*.sql`, `071_plan_schema_test.sql`, `tms-auditor/test/plan-071.test.mjs`, `fixtures/live-071.sql`,
`worker/src/index.js`. Τίποτα δεν γράφτηκε, τίποτα δεν έγινε deploy.

---

## 0. Κατάσταση παραγωγής σήμερα (αφετηρία της 072)

| Τι | Τιμή |
|---|---|
| Triggers στο `public` (μη internal, enabled) | **46** |
| `monitoring.checks` B-54 | `red_value = 46`, `baseline = NULL`, `enabled = true` |
| Συναρτήσεις `plan%` | `plan_chk()`, `plan_leg_problem(p_leg bigint)`, `plan_local_loading_problem(p_lm bigint)`, `plan_rt_problem(p_rt bigint)`, `plan_rt_window_sync()`, `plan_shipment_problem(p_sh bigint)` (+ `ct_rt_legs_v2_guard()`, 7 συνολικά της 071). **Καμία** άλλη `plan_*`. |
| Γραμμές νέων πινάκων (shipments+pieces+rt_stops+legs+notices) | **0** |
| `ct_round_trips` | 202 γραμμές, `model=2`: **0**· status: planned 25, closed 160, cancelled 17 |
| `ct_rt_code_seq` | `last_value = 1272`, `is_called = true` (επόμενος κωδικός `RT-1273`) |
| Κόμβος | `locations.id = 360`, `legacy_id = recJucKOhC1zh4IP3`, `name = CROSS-DOCK`, `is_hub = true` (μοναδικός) |
| `order_stops.via_hub = true` | 0 |
| `national_orders` | 12 γραμμές (6 ζωντανές), max id 16, όλες με `legacy_id`. status: NULL 7 / Assigned 3 / Pending 2· direction: `South→North` 9 / `North→South` 3· type: `Independent` 9 / NULL 3 |
| `orders` ζωντανές | 379, όλες `International`· Import 186 / Export 193· VS 71 (όλες με `cross_dock_date`, Import 53 / Export 18) |
| `order_stops` ζωντανές | Loading 539, Cross-dock 71, Unloading 561· γονείς: order 989, national_order 12, national_load 170 |
| `local_moves` | 1 γραμμή (`relay_delivery`), καμία `nat_loading` |
| `dl_entries` ζωντανές | 11.227 (152 με `rt_id`, 6.705 με ποσά) |
| `monitoring.checks` | 89 (85 enabled), τελευταίο id `S-14` |
| 071a | **εφαρμοσμένη**: md5 των `stock_guard_natl/orders/lots` = οι «after» τιμές της 071a (`e941edbc…`, `63aa751d…`, `231b539e…`). Το αρχείο μένει ακόμη στο `drafts/` (κανόνας 5: πρέπει να βγει· δεν είναι δουλειά της Φ2). |
| 068 `presence_beat` | **δεν υπάρχει** στην παραγωγή (το 068 δεν έχει εκτελεστεί). |

---

## 1. Τα αντικείμενα της 071/071b που γράφουν οι `plan_*`

### 1.1 Νέοι πίνακες (όλοι `id bigint GENERATED ALWAYS AS IDENTITY`, owner `postgres`, RLS on χωρίς policy, SELECT μόνο σε `service_role`, `tms_reader`, `tms_check_runner`)

Κοινό σχήμα soft delete (εκτός `plan_notices`): `deleted_at timestamptz, deleted_reason text, deleted_by text`, **όλα μαζί ή κανένα** (CHECK `*_del`):
```sql
CONSTRAINT shipments_del CHECK ((deleted_at IS NULL) = (deleted_reason IS NULL)
                                AND (deleted_at IS NULL) = (deleted_by IS NULL))
```
Υποχρεωτικό σε όλους: `created_by text NOT NULL` (`created_at` έχει default `now()`).

**`shipments`** — NOT NULL: μόνο `created_by`. Σχήμα:
```sql
order_id bigint REFERENCES orders(id) ON DELETE RESTRICT,
nat_order_id bigint REFERENCES national_orders(id) ON DELETE RESTRICT,
order_stop_id bigint REFERENCES order_stops(id) ON DELETE RESTRICT,
origin_location_id bigint REFERENCES locations(id), dest_location_id bigint REFERENCES locations(id),
pallets numeric(6,1), load_from timestamptz, load_to timestamptz, deliver_from timestamptz, deliver_to timestamptz,
CONSTRAINT shipments_one_parent CHECK (num_nonnulls(order_id, nat_order_id) = 1),
CONSTRAINT shipments_bridge_intl CHECK (order_stop_id IS NULL OR order_id IS NOT NULL),
CONSTRAINT shipments_intl_is_bridge CHECK (order_id IS NULL OR order_stop_id IS NOT NULL),
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
```
Index: `shipments_bridge_once` UNIQUE `(order_stop_id) WHERE order_stop_id IS NOT NULL AND deleted_at IS NULL`.
⇒ Μια **εθνική** αποστολή θέλει **και τα 8** πεδία (τόποι, παλέτες, 4 χρόνοι)· μια **γέφυρα** VS δεν θέλει **κανένα** (μόνο `order_id`, `order_stop_id`, `created_by`).

**`shipment_pieces`** — NOT NULL: `shipment_id`, `pallets numeric(6,1)`, `created_by`. Προαιρετικά `parent_piece_id`, `leave_by date`, `split_at`/`split_by` (ζεύγος, CHECK `pieces_split_pair`). CHECK `pieces_pallets` (>0), `pieces_not_own_parent`, `pieces_del`.

**`rt_stops`** — NOT NULL: `rt_id`, `seq smallint`, `location_id`, `side`, `planned_from`, `planned_to`, `created_by`.
```sql
CONSTRAINT rt_stops_rt_fk FOREIGN KEY (rt_id) REFERENCES public.ct_round_trips (id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
CONSTRAINT rt_stops_rt_id UNIQUE (rt_id, id),
CONSTRAINT rt_stops_seq CHECK (seq > 0),
CONSTRAINT rt_stops_side CHECK (side IN ('KATHODOS', 'ANODOS')),
CONSTRAINT rt_stops_win CHECK (planned_to > planned_from),
```
Η μοναδικότητα του `seq` ανάμεσα στις **ζωντανές** στάσεις ελέγχεται από `plan_rt_problem` (κωδικός `stop_seq`), όχι από UNIQUE.
Ακολουθία `rt_stops_id_seq`: ACL μόνο `postgres` (το service_role **δεν** έχει USAGE — σωστό, γράφουν μόνο οι SECURITY DEFINER).

**`piece_legs`** — NOT NULL: `piece_id`, `leg_no smallint`, `rt_id`, `pickup_stop_id`, `drop_stop_id`, `created_by`.
```sql
CONSTRAINT piece_legs_pickup_fk FOREIGN KEY (rt_id, pickup_stop_id) REFERENCES public.rt_stops (rt_id, id) ON DELETE RESTRICT,
CONSTRAINT piece_legs_drop_fk FOREIGN KEY (rt_id, drop_stop_id) REFERENCES public.rt_stops (rt_id, id) ON DELETE RESTRICT,
CONSTRAINT piece_legs_no CHECK (leg_no > 0),
CONSTRAINT piece_legs_two_stops CHECK (pickup_stop_id <> drop_stop_id),
```
Index `piece_legs_live_no` UNIQUE `(piece_id, leg_no) WHERE deleted_at IS NULL`. Τα composite FK **δεν** είναι deferred: η στάση πρέπει να υπάρχει πριν από τη γραμμή του σκέλους.

**`plan_notices`** — NOT NULL: `to_desk`, `kind`, `message`, `created_by`. CHECK `plan_notices_desk` (`'intl'|'natl'`), `plan_notices_kind` (`kind ~ '^[a-z_]+$'`), `plan_notices_read_pair`. FK `order_id`, `nat_order_id`, `rt_id`. Χωρίς soft delete· «διαβάστηκε» = `read_at`/`read_by`.

### 1.2 Στήλες σε υπάρχοντες πίνακες
- `ct_round_trips.model smallint NOT NULL DEFAULT 1`, `start_at`, `end_at timestamptz`, `partner_rate numeric(10,2)`. CHECK: `rt_model`, `rt_v2_scope` (`model=1 OR scope='NATL'`), `rt_v2_status` (`model=1 OR status IN ('planned','cancelled')`), `rt_v2_window` (`model=1 OR (start_at IS NOT NULL AND end_at > start_at)`), `rt_v1_no_window`, `rt_v2_dates` (`date_start/date_end` = ημέρα Αθήνας των `start_at/end_at`), `rt_partner_rate` (`partner_rate IS NULL OR (model=2 AND trip_type='PARTNER' AND partner_rate >= 0)`).
- 071b (EXCLUDE, **DEFERRABLE INITIALLY DEFERRED**, SQLSTATE `23P01`):
  ```sql
  rt_v2_truck_once EXCLUDE USING gist (truck_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (model = 2 AND trip_type = 'OWNED' AND truck_id IS NOT NULL AND status <> 'cancelled')
  rt_v2_driver_once EXCLUDE USING gist (driver_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (model = 2 AND trip_type = 'OWNED' AND driver_id IS NOT NULL AND status <> 'cancelled')
  ```
  `btree_gist 1.7 @extensions`. Μόνο v5 OWNED· τα σημερινά RT δεν μετρούν (πιθανή σύγκρουση v1↔v5 στο ίδιο φορτηγό **δεν** πιάνεται από τη βάση).
- `order_stops.via_hub boolean NOT NULL DEFAULT false`, CHECK `order_stops_via_hub_intl` (`NOT via_hub OR order_id IS NOT NULL`).
- `locations.is_hub boolean NOT NULL DEFAULT false`, UNIQUE index `locations_one_hub (is_hub) WHERE is_hub`.
- `local_moves.rt_stop_id bigint REFERENCES rt_stops(id) ON DELETE RESTRICT`· `move_kind` + `'nat_loading'`:
  ```sql
  local_moves_kind_parent: ... OR (move_kind = 'nat_loading' AND parent_order_id IS NULL AND parent_nat_load_id IS NULL)
  local_moves_relay_trailer: CHECK (move_kind IN ('local','nat_loading') OR driver_id IS NULL OR trailer_id IS NOT NULL)
  local_moves_nat_loading: CHECK ((move_kind = 'nat_loading') = (rt_stop_id IS NOT NULL)
    AND (move_kind <> 'nat_loading' OR (driver_id IS NOT NULL AND status IN ('Assigned', 'Cancelled'))))
  ```
  Index `local_moves_nat_loading_once` UNIQUE `(rt_stop_id) WHERE move_kind='nat_loading' AND deleted_at IS NULL AND status <> 'Cancelled'`.
- `pl_movements.piece_leg_id` (Φ3) + `pl_mov_leg_once (piece_leg_id, event_type) WHERE piece_leg_id IS NOT NULL AND status <> 'reversed'`.

### 1.3 Όψεις (security_invoker, χωρίς χρήματα)
`v_shipments`, `v_piece_pos`, `v_piece_state`, `v_rt_stop_state`, `v_rt_cycle`, `v_hub_bucket`, `v_national_order_state`, `v_vs_state` — στήλες ακριβώς όπως στο F1 plan «Interfaces». Οι `plan_*` (SECURITY DEFINER, owner postgres) τις διαβάζουν χωρίς πρόβλημα δικαιωμάτων. Το «εκτελέστηκε» = `(planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date` και `r.status <> 'cancelled'`.

### 1.4 Κανόνες (triggers) που θα «χτυπήσει» κάθε `plan_*`
| Trigger | Πίνακας | Πότε | Συνάρτηση |
|---|---|---|---|
| `plan_rt_window_sync` | `rt_stops` | AFTER I/U/D, **άμεσα** | γράφει `start_at/end_at/date_start/date_end/updated_at` του κύκλου `model=2` από τις ζωντανές στάσεις· αν δεν μείνει ζωντανή στάση, **αφήνει** το παράθυρο (`continue when s is null`) |
| `plan_chk_rt` | `ct_round_trips` | DEFERRED | `model_locked`, `plan_rt_problem` |
| `plan_chk_stops` | `rt_stops` | DEFERRED, και DELETE | `stop_locked`, `plan_rt_problem` + `plan_shipment_problem` των αποστολών που ακουμπούν τη στάση |
| `plan_chk_legs` | `piece_legs` | DEFERRED | `leg_locked` (κάθε αλλαγή εκτός soft delete), shipment + rt problem |
| `plan_chk_pieces` | `shipment_pieces` | DEFERRED | `piece_locked` (`shipment_id`, `parent_piece_id`), `plan_shipment_problem` |
| `plan_chk_shipments` | `shipments` | DEFERRED | `shipment_locked` (`order_id`, `nat_order_id`, `order_stop_id`), `plan_shipment_problem` |
| `plan_chk_bridge_stop` | `order_stops` | DEFERRED, UPDATE OF `pallets, deleted_at` | `plan_shipment_problem` των ζωντανών γεφυρών |
| `plan_chk_local_loading` | `local_moves` | DEFERRED, `WHEN new.move_kind='nat_loading'` | `plan_local_loading_problem` |
| `ct_rt_legs_v2_guard` | `ct_rt_legs` | BEFORE I/U OF rt_id | `v1_link_on_v2` |

Άρνηση: `RAISE EXCEPTION 'plan rule broken: %' USING errcode = '23514', hint = 'plan:' || split_part(prob, ':', 1)`. Hard DELETE σε οποιονδήποτε από τους 4 πίνακες σχεδίου → `plan:hard_delete`. Κωδικοί Φ1 (26): `pieces_alive, piece_dead, pieces_sum, piece_parent, split_not_at_hub, rt_not_v2, rt_cancelled, leg_stop_dead, leg_order, leg_place, chain, chain_time, stop_seq, stop_order, side_order, rt_window, local_loading_gone, local_loading_day, local_loading_stop, model_locked, stop_locked, leg_locked, piece_locked, shipment_locked, v1_link_on_v2, hard_delete`.

Οι βοηθοί `plan_*_problem(bigint) RETURNS text` είναι `STABLE`, **SECURITY INVOKER**, `SET search_path = public`, ACL μόνο `postgres` — καλούνται από τις `plan_*` της 072 (ίδιος owner) για dry-run χωρίς δικαίωμα σε κανέναν άλλον.

**Συμπέρασμα για τη 072:** κάθε `plan_*` τελειώνει με `SET CONSTRAINTS ALL IMMEDIATE;` ώστε (α) οι deferred κανόνες και τα EXCLUDE να σκάνε **μέσα** στη συνάρτηση, όπου ένα `EXCEPTION WHEN exclusion_violation` μπορεί να βρει τον κωδικό του άλλου RT για το μήνυμα `truck_busy`/`driver_busy` (tech draft), και (β) να μη βασιζόμαστε στο πώς επιστρέφει το PostgREST σφάλμα που γεννιέται στο COMMIT. Το test 071 κάνει ακριβώς αυτό (`SET CONSTRAINTS ALL IMMEDIATE` πριν από κάθε verdict). Το constraint name έρχεται στο `CONSTRAINT_NAME` (`GET STACKED DIAGNOSTICS`).

---

## 2. Υπάρχοντες πίνακες που αγγίζει η Φ2 (μετρημένο)

### 2.1 `national_orders` (γράφει το `plan_orders_create` / `plan_order_update`)
- `id bigint GENERATED **ALWAYS** AS IDENTITY` (ακολουθία `national_orders_id_seq`, ACL `postgres, service_role`).
- NOT NULL: μόνο `id` και `created_at` (default `now()`). **Δεν υπάρχει `created_by`, `updated_at`, `deleted_reason`, `deleted_by`** — ο «ποιος» γράφεται μόνο στο `audit_log`.
- Defaults: `veroia_switch`, `national_groupage`, `is_partner_trip`, `pallet_exchange`, `invoiced`, `cmr_photo_received`, `client_notified`, `docs_ready`, `temp_ok`, `driver_notified`, `second_card` = `false`. Όλα τα άλλα NULL.
- Πεδία που γεμίζει το `plan_orders_create` (spec §7, τύποι επαληθευμένοι από τη 071): `client_id bigint`, `price numeric`, `reference text`, `pallets numeric`, `temperature_c numeric`, `goods text`, `notes text`, `loading_datetime date`, `delivery_datetime date`, `pickup_location_1_id bigint`, `delivery_location_1_id bigint`. **Ποτέ** `truck_id`, `partner_id`, `status`.
- Άλλες στήλες που υπάρχουν και πρέπει να αποφασιστούν ρητά: `legacy_id text` (UNIQUE), `direction text` (σήμερα βελάκια `South→North`/`North→South`), `type text` (`Independent`/NULL), `pallet_exchange`, `partner_rate` (κόμιστρο ανά παραγγελία, παλιό μοντέλο), `ops_status`, `stock_lot_id`.
- CHECK: `national_orders_stock_piece_no_money`, `national_orders_stock_piece_shape` (μόνο όταν `stock_lot_id IS NOT NULL`). Κανένα CHECK σε status/direction/type.
- FK: client, partner, driver, truck, trailer, source_order_id → orders, stock_lot_id → stock_lots (RESTRICT), pickup_location_1..10, delivery_location_1..10 → locations.
- Triggers:
  - `national_orders_invoice_mark_guard` BEFORE INSERT OR UPDATE OF invoiced, invoice_number, price → `invoice_mark_guard()` (INVOKER): αν `invoiced` true χωρίς αριθμό ή με τιμή ≤ 0 → `check_violation`, constraint `invoice_mark_requires_number`/`invoice_mark_requires_price`. Δεν ενοχλεί όσο η `plan_*` δεν γράφει `invoiced`.
  - `stock_guard_natl` BEFORE INSERT OR UPDATE (INVOKER, 057/071a): στο INSERT με `stock_lot_id IS NULL` επιστρέφει αμέσως.
  - `trg_national_orders_soft_delete_cascade` AFTER UPDATE OF deleted_at (INVOKER):
    ```sql
    update national_loads set deleted_at = new.deleted_at where source_national_order_id = new.id and deleted_at is null;
    update order_stops   set deleted_at = new.deleted_at where national_order_id = new.id and deleted_at is null;
    ```
    **Δεν** αγγίζει `shipments`/pieces/legs. ⚠ Παγίδα: ένα σημερινό `DELETE` εθνικής μέσω facade (`PERMISSIONS.dispatcher.national_orders` περιέχει `DELETE`, γρ. 581) σβήνει την παραγγελία αλλά αφήνει ζωντανή την αλυσίδα v5· `v_shipments.live` γίνεται false, τα κομμάτια εξαφανίζονται σιωπηλά από `v_piece_state`, και η επόμενη αλλαγή στον κύκλο σκάει με `piece_dead`. Η Φ2 πρέπει είτε να μπλοκάρει το facade DELETE για εθνικές με αποστολή είτε να το στέλνει στο `plan_delete` (αρχή 1, 3).
- Facade: ο Worker επιστρέφει κάθε εγγραφή με `id: row.legacy_id` (`toAirtableRecord`, γρ. 2435) και φτιάχνει `legacy_id` με `mintLegacyId()` (γρ. 2421: `'rec'` + 14 τυχαία `[a-zA-Z0-9]`). ⚠ Μια εθνική που γράφει το `plan_orders_create` με `legacy_id NULL` θα φαινόταν με `id: null` σε κάθε οθόνη που διαβάζει ακόμη μέσω facade (τιμολόγηση, audit trail). Η 072 πρέπει να δίνει `legacy_id` ίδιας μορφής (π.χ. από `extensions.gen_random_bytes`· `pgcrypto 1.3 @extensions`, `gen_random_uuid` και στο `pg_catalog`) ή να το παράγει ο Worker και να το περνά.

### 2.2 `orders` (γράφει μόνο το `plan_vs_set_day` → `cross_dock_date`)
- `id GENERATED ALWAYS`, NOT NULL μόνο `id`, `created_at`, `temp_per_cmr` (default false). `direction text` (`Import`/`Export`), `cross_dock_date date`, `veroia_switch boolean` (default false), `price numeric`, `status text` (Delivered/Assigned/Pending/In Transit, + Cancelled), `order_type` (`International`).
- CHECK: `orders_dest_country_*`, `orders_leg_shape`, `orders_ops_status_values`, `orders_plan_week_start_saturday`, `orders_stock_piece_*`.
- Trigger που πυροδοτεί η αλλαγή `cross_dock_date`: **`order_cd_stop_follow`** (069, SECURITY DEFINER) AFTER UPDATE OF cross_dock_date `WHEN old IS DISTINCT FROM new AND new IS NOT NULL`:
  ```sql
  for r in update order_stops s set datetime = new.cross_dock_date
             from order_stops o
            where o.id = s.id and s.order_id = new.id and s.stop_type = 'Cross-dock'
              and s.deleted_at is null and s.datetime is distinct from new.cross_dock_date
            returning s.id, o.datetime as old_day loop
    insert into audit_log (...) values ('trigger:order_cd_stop_follow', 'system', 'update', 'order_stops', ...);
  ```
  και από εκεί `ramp_follows_stop` (AFTER UPDATE OF datetime στο `order_stops`). Δεν πυροδοτούνται `rt_create_from_order`/`rt_sync_from_order` (δεν ακούνε `cross_dock_date`). Άρα το `plan_vs_set_day` γράφει **μία** στήλη και η βάση μετακινεί στάση cross-dock και ράμπα (μία πηγή, owner 20/10).
- Πλήρης λίστα triggers `orders` (για το fixture): `local_moves_follow_order`, `national_load_follow_order`, `order_cd_stop_follow`, `order_dates_follow`, `order_leg_depth`, `order_leg_inherit`, `order_leg_status_sync`, `order_legs_to_parent`, `order_parent_to_legs`, `order_soft_delete_unlink`, `orders_group_id_blank_null`, `orders_invoice_mark_guard`, `rt_create_from_order`, `rt_link_split`, `rt_sync_from_order`, `rt_z_auto_close_order`, `stock_guard_orders`.

### 2.3 `order_stops` (διαβάζει η γέφυρα· γράφει ίσως το `plan_vs_set_place`)
- `id GENERATED ALWAYS`· NOT NULL μόνο `id`, `created_at`, `via_hub`. `stop_type` (`Loading`/`Unloading`/`Cross-dock`), `stop_number numeric`, `datetime date`, `location_id`, `pallets numeric`, `temperature numeric`, `order_id`/`national_order_id`/`national_load_id` (FK RESTRICT), `deleted_at`.
- CHECK: `order_stops_performance_check`, `order_stops_via_hub_intl`. UNIQUE `order_stops_legacy_id_key`.
- Triggers: `plan_chk_bridge_stop` (deferred), `ramp_follows_stop`.

### 2.4 `ct_round_trips` (γράφει `plan_rt_create` / `plan_rt_update` / `plan_rt_clear` / `plan_delete`)
| Στήλη | Τύπος | NULL | Default |
|---|---|---|---|
| id | bigint | NO | identity **ALWAYS** (`public.ct_round_trips_id_seq`) |
| code | text | NO | `('RT-'::text || (nextval('ct_rt_code_seq'::regclass))::text)` · UNIQUE `ct_round_trips_code_key` |
| scope | text | NO | — (`INTL`/`NATL`) |
| trip_type | text | NO | — (`OWNED`/`PARTNER`) |
| truck_id, trailer_id, driver_id, partner_id | bigint | YES | — (FK, όχι RESTRICT) |
| date_start | date | NO | — |
| date_end | date | YES | — |
| status | text | NO | `'planned'` |
| closed_at | timestamptz | YES | — |
| total_km | integer | YES | — |
| source | text | NO | `'planner'` (CHECK `planner`/`manual`) |
| created_by | text | NO | — |
| created_at, updated_at | timestamptz | NO | `now()` |
| notes | text | YES | — |
| model / start_at / end_at / partner_rate | 071 | | |

CHECK (εκτός 071): `ct_round_trips_scope_check`, `ct_round_trips_source_check`, `ct_round_trips_status_check` (`planned, in_progress, closed, complete, cancelled`), `ct_round_trips_trip_type_check`, `owned_needs_truck` (μόνο σε closed/complete), **`partner_needs_partner`** (`trip_type <> 'PARTNER' OR partner_id IS NOT NULL` — ισχύει **πάντα**, άρα ένα PARTNER v5 χωρίς συνεργάτη ή ένα «Καθαρισμός ανάθεσης» σε PARTNER που μηδενίζει `partner_id` χωρίς να αλλάξει `trip_type` σκάει εδώ), `window_order`.
**Δεν υπάρχει `deleted_at`** (spec §2.1): «δεν έγινε» = `status='cancelled'`, ο λόγος στο `audit_log`.

**Κωδικός RT:** από το default της `code` → `nextval('ct_rt_code_seq')`. Η `plan_rt_create` δεν γράφει `code`· το διαβάζει με `RETURNING`.

**Σειρά «πρώτα στάσεις, μετά κύκλος»** (περίπτωση 25 του test, επαληθευμένη):
```sql
x := nextval(pg_get_serial_sequence('public.ct_round_trips', 'id'));
INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by) VALUES (x, 1, ...);
INSERT INTO rt_stops (...) VALUES (x, 2, ...);
INSERT INTO ct_round_trips (id, model, scope, trip_type, date_start, date_end, start_at, end_at, status, source, created_by)
OVERRIDING SYSTEM VALUE VALUES (x, 2, 'NATL', 'OWNED', d, d, at6, at14, 'planned', 'planner', 'test:071');
```
Το `plan_rt_window_sync` στα INSERT των στάσεων δεν βρίσκει ακόμη κύκλο (UPDATE 0 γραμμών)· γι' αυτό η `plan_rt_create` **υπολογίζει η ίδια** `start_at = min(planned_from)`, `end_at = max(planned_to)` και `date_start/date_end` = ημέρες Αθήνας (αλλιώς `rt_v2_window`/`rt_v2_dates` σκάνε αμέσως — είναι απλά CHECK, όχι deferred). Το FK `rt_stops_rt_fk` είναι deferred, άρα οι στάσεις χωρούν πριν από τον κύκλο.

Triggers στο `ct_round_trips`: `dl_sync_from_rt` (AFTER INSERT OR UPDATE, **κάθε** UPDATE), `plan_chk_rt`, `rt_status_guard` (071: `if new.model = 2 then return new;`), `rt_sync_to_national_loads`, `rt_sync_to_orders` (AFTER UPDATE OF driver/truck/trailer/partner/trip_type — φτάνουν σε orders/NL μόνο μέσω `ct_rt_legs`, που για model=2 δεν έχει γραμμές). `rt_recompute`/`rt_auto_close` επιστρέφουν για model=2.

Στη `plan_rt_create`: `created_by` του κύκλου = **ο actor**, γιατί η 011 το αντιγράφει στη γραμμή μισθοδοσίας ως `'trigger:' || new.created_by` (σήμερα: `trigger` 136, `backfill-…` 30, ονόματα χρηστών 36). `source` = `'planner'` (μόνο `planner`/`manual` επιτρέπονται).

### 2.5 `dl_entries` (μισθοδοσία· η Φ2 την αγγίζει μόνο έμμεσα, εκτός από τη «ρητή σβήση μετά το token»)
- NOT NULL: `id` (ALWAYS), `driver_id`, `entry_type` (`trip`/`payment_cash`/`payment_bank`/`adjustment`), `entry_date`, `source` (default `'manual'`· `manual`/`auto`/`excel_import`), `needs_review` (default false), `created_by`, `created_at`, `updated_at`, `expenses_auto` (default false). `balance_delta` = GENERATED STORED.
- **Soft delete:** `deleted_at` + `deleted_reason` (CHECK `dl_cancel_reason`: `deleted_at IS NULL OR deleted_reason IS NOT NULL`). **Δεν υπάρχει `deleted_by`**· το σημερινό RPC `dl_cancel_batch` γράφει τον actor μέσα στο reason:
  ```sql
  update dl_entries set deleted_at = now(), deleted_reason = p_reason || ' (' || p_actor || ')', updated_at = now()
  where import_batch = p_batch and deleted_at is null;
  ```
- Άλλα CHECK: `dl_adjust_shape`, `dl_payment_shape`, `dl_trip_shape`, `dl_window` (`date_end >= entry_date`), `dl_one_origin` (`rt_id IS NULL OR local_move_id IS NULL`), `dl_lm_is_trip`. Index `dl_rt_live`, `dl_local_day_live` (UNIQUE `(driver_id, entry_date) WHERE local_move_id IS NOT NULL AND deleted_at IS NULL`).
- **`dl_sync_from_rt` (011, SECURITY DEFINER)** — ό,τι κάνει ήδη μόνο του για έναν κύκλο v5 OWNED με οδηγό:
  - INSERT κύκλου, όχι cancelled → μία γραμμή `('trip', date_start, date_end, rt_id, source 'auto', created_by 'trigger:' || new.created_by)`, ποσά NULL.
  - `status='cancelled'` ή `trip_type<>'OWNED'` ή `driver_id IS NULL`: χωρίς ποσά → soft delete με reason `'RT <code> ακυρώθηκε'` / `'RT <code> έμεινε χωρίς οδηγό μας'`· **με ποσά → `needs_review = true` + `review_note`, η γραμμή μένει**.
  - αλλιώς: driver/ημερομηνίες ακολουθούν τον κύκλο· αλλαγή οδηγού μετά από ποσά → `needs_review`.
  ⇒ Το «ρητή σβήση της μισθοδοσίας μετά το token» της `plan_delete` είναι **μόνο** για γραμμές με ποσά (οι χωρίς ποσά σβήνουν μόνες τους): `UPDATE dl_entries SET deleted_at = now(), deleted_reason = '<λόγος> (<actor>)', updated_at = now() WHERE rt_id = $rt AND deleted_at IS NULL`.
- **`dl_cash_lock`** (BEFORE UPDATE OF expenses, SECURITY DEFINER): αρνείται (`check_violation`) αλλαγή του `expenses` σε γραμμή κύκλου που έχει γραμμές `ct_cost_lines` με `pay_source='CASH'`, εκτός αν `current_setting('dl.cash_sync', true) = '1'`. Δεν μπλοκάρει soft delete.
- **`dl_cash_sync_entry`** (AFTER INSERT OR UPDATE OF rt_id, deleted_at): για ζωντανή γραμμή `trip` με `rt_id` → `dl_cash_sync(rt_id)` (ξαναγράφει `expenses` από τις CASH γραμμές, audit `trigger:rt_sync`).
- **`dl_local_line_guard`** (BEFORE UPDATE, INVOKER, μόνο γραμμές με `local_move_id`): ημέρα/οδηγός/route/τύπος/κίνηση αλλάζουν **μόνο** με `current_setting('tms.local_day_sync', true) = 'on'`· ακύρωση γραμμής που πληρώνει ζωντανή κίνηση `move_kind <> 'local'` (άρα και `nat_loading`) → `HINT 'local_relay:line_has_relay'`· επαναφορά ακυρωμένης → `local_relay:line_restore`.
- **Κλεισμένη περίοδος μισθοδοσίας: δεν υπάρχει** στη βάση (κανένας πίνακας/στήλη period/lock· `dl_*` = `dl_entries, dl_import_batches, dl_v_balance, dl_v_entries, dl_v_rt_gap, dl_v_rt_route`). Το «σε κλεισμένη περίοδο» της λίστας του tech draft δεν έχει πηγή· ή φεύγει ή χρειάζεται απόφαση.

### 2.6 `local_moves` (γράφει το `plan_local_loading`)
- `id` identity **BY DEFAULT**. NOT NULL: `move_date date`, `sequence smallint` (default 1), `status text` (default `'Pending'`), `move_kind text` (default `'local'`), `created_at`, `updated_at`. Χωρίς `created_by`/`deleted_reason`· «ποιος» → `audit_log`.
- Για `nat_loading`: `rt_stop_id` NOT NULL, `driver_id` NOT NULL, `status IN ('Assigned','Cancelled')` (CHECK `local_moves_nat_loading`), `parent_order_id`/`parent_nat_load_id` NULL, `partner_id` NULL (`local_moves_relay_executor`), `time_from/time_to` `HH:MM` αν δοθούν, ρυμούλκα προαιρετική.
- `move_date` = ημέρα Αθήνας του `planned_from` της στάσης (κανόνας `local_loading_day`), και η στάση πρέπει να έχει ζωντανή φόρτωση σκέλους (`local_loading_stop`).
- `local_moves_before` (BEFORE I/U, INVOKER): βάζει `updated_at` στο UPDATE· `move_kind`/`parent_*` δεν αλλάζουν σε μη-local (`local_relay:kind_locked`)· για `nat_loading` **δεν** κάνει τίποτε άλλο (επιστρέφει νωρίς: ελέγχει μόνο `relay_*`).
- `dl_sync_from_local_move` (AFTER INSERT OR UPDATE OF driver_id, move_date, deleted_at, status, SECURITY DEFINER) → `dl_local_day_sync(driver, day)`: μία γραμμή «ΤΟΠΙΚΟ» ανά οδηγό/ημέρα, label με τον κωδικό RT για `nat_loading` (071: `coalesce(lm.parent_order_id::text, (SELECT r.code FROM rt_stops s JOIN ct_round_trips r ...))`), advisory lock `pg_advisory_xact_lock(hashtext('dl_local_day'), hashtext(p_driver::text || ':' || (p_day - DATE '2000-01-01')::text))`.
- Σβήσιμο τοπικής φόρτωσης = `deleted_at = now()` ή `status = 'Cancelled'`. Όταν φεύγει η στάση ή ακυρώνεται ο κύκλος, η τοπική φόρτωση πρέπει να φύγει **στην ίδια συναλλαγή** (αλλιώς `plan:local_loading_gone` στο COMMIT).

### 2.7 `audit_log`
- `id` ALWAYS· NOT NULL: `actor text`, `role text`, `action text`, `table_name text`, `created_at` (default `now()`)· `record_id text`, `before_data jsonb`, `after_data jsonb`. **Κανένα trigger** πάνω του. RLS on· `service_role`: INSERT, SELECT, UPDATE (χωρίς DELETE).
- Δύο συγγραφείς σήμερα:
  1. **Worker** (`audit()` γρ. 699 / `auditMany()` γρ. 303): `actor = caller.sub` (username από το JWT), `role = caller.role`, `action` `create|update|delete|cascade_delete`, `record_id` = legacy id (για `national_orders`: 30/30 με `rec…`).
  2. **Συναρτήσεις βάσης**: `actor = 'trigger:<όνομα>'` ή `'migration:<nnn>'`, `role = 'system'`. Βοηθοί: `rt_sync_audit(p_action, p_table, p_id, p_before, p_after)` (γράφει `'trigger:rt_sync'`), `order_legs_audit(p_id, p_before, p_after)`.
- Τελευταίες 14 ημέρες: username/dispatcher 2.152, username/accountant 756, `trigger:*`/system 607, username/owner 342, username/management 90, `migration:*`/system 7.
- Ο auditor (047b) και το `presence_beat` (068) ξεχωρίζουν ανθρώπους από μηχανή με `role IN ('owner','management','accountant','dispatcher','warehouse')` και `actor NOT LIKE 'trigger:%'`.

---

## 3. Πώς φτάνει η ταυτότητα του χρήστη στη βάση (η υπάρχουσα σύμβαση)

- **Δεν υπάρχει** `set_config('tms.user', …)` / `request.jwt` / GUC ταυτότητας. Οι μόνες GUC της εφαρμογής: `dl.cash_sync` (2 χρήσεις) και `tms.local_day_sync` (11), και οι δύο ως «σημαία παράκαμψης φύλακα», όχι ταυτότητα.
- Ο Worker μιλά πάντα ως `service_role` (`apikey`/`Bearer SUPABASE_SERVICE_KEY`)· η βάση δεν ξέρει ποιος πάτησε το κουμπί, εκτός αν της το πει **παράμετρος**.
- Σύμβαση RPC σήμερα = **παράμετρος `p_actor text`**:
  - `dl_import(p_driver_id, p_batch, p_file_name, p_file_hash, p_rows, p_actor)` — Worker γρ. 4265: `p_actor: "import:" + caller.sub`· γράφεται στο `created_by`.
  - `dl_cancel_batch(p_batch uuid, p_reason text, p_actor text)` — γράφεται μέσα στο `deleted_reason`.
  - `log_unknown_field(..., p_role, p_actor, ...)`.
  - (068, όχι ζωντανό: `presence_beat(p_sub, …, p_role, …)`.)
  - `rt_merge(p_keep, p_drop, p_reason)` και `delete_order_cascade(p_order_legacy_id)` **δεν** παίρνουν actor (το audit γράφεται ως `trigger:rt_sync` ή από τον Worker).
- ⇒ Πρόταση για 072 (σύμφωνη με spec §2.1 «`SECURITY DEFINER`, `p_actor`, `audit_log`»): κάθε `plan_*` παίρνει `p_actor text` **και** `p_role text` (το `audit_log.role` είναι NOT NULL και ο auditor/presence ταξινομούν με αυτό)· γράφει `created_by`/`deleted_by`/`split_by`/`read_by` = `p_actor` και **μία** γραμμή `audit_log (actor = p_actor, role = p_role, action, table_name, record_id, before_data, after_data)` ανά αλλαγή. Αρνείται κενό actor (`plan:no_actor` ή `22023`, όπως το `presence_beat`). Το `created_by` του `ct_round_trips` = `p_actor` (η 011 το κάνει `trigger:<actor>` στη μισθοδοσία).
- Ο Worker περνά `p_actor: caller.sub`, `p_role: caller.role` (JWT payload `{ sub: user.username, role, name, iat, exp }`, γρ. 139-140).

---

## 4. Υπάρχουσες συναρτήσεις RPC = πρότυπα δικαιωμάτων

### 4.1 Τι υπάρχει ζωντανό (συναρτήσεις που δεν είναι trigger)
| Συνάρτηση | SECURITY | search_path | EXECUTE |
|---|---|---|---|
| `delete_order_cascade(p_order_legacy_id text) → jsonb` | DEFINER | `public, extensions` | postgres, service_role |
| `dl_cancel_batch(uuid, text, text) → int` | DEFINER | `public` | postgres, service_role |
| `dl_cash_sync(bigint) → void` | DEFINER | `public` | postgres, service_role |
| `dl_import(...) → jsonb` | DEFINER | `public` | postgres, service_role |
| `log_unknown_field(...) → bigint` | INVOKER | `public` | postgres, service_role |
| `order_legs_audit`, `order_parent_status`, `rt_auto_close`, `rt_merge`, `rt_recompute`, `rt_sync_audit` | DEFINER | `public` | postgres, service_role |
| `upsert_user`, `verify_login` | DEFINER | `public, extensions` | postgres, service_role |
| `stock_raise(p_code, p_message)`, `stock_vs_charge`, `tms_week`, `tms_week_year` | INVOKER | | postgres, service_role |
| `order_pallets`, `stock_natl_delivered` | INVOKER | | + tms_reader, tms_check_runner |
| `ct_setting(text)`, `order_last_unloading(orders)` | INVOKER | | **PUBLIC, anon, authenticated** (παλιό, ανοιχτό· όχι θέμα Φ2, μόνο σημείωση) |
| `dl_local_day_sync`, `plan_*_problem` | — | `public` | **μόνο postgres** (κλειστές) |

Όλες owner `postgres`. Μοτίβο: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role` (034:472-475):
```sql
EXECUTE 'REVOKE ALL ON FUNCTION public.rt_sync_national_load() FROM PUBLIC, anon, authenticated';
EXECUTE 'GRANT EXECUTE ON FUNCTION public.rt_sync_national_load() TO service_role';
```
και 008:
```sql
revoke execute on function public.log_unknown_field(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.log_unknown_field(text, text, text, text, text, text, text)
  to service_role;
```

### 4.2 Γιατί το REVOKE είναι υποχρεωτικό (μετρημένο `pg_default_acl`)
```
postgres:f:{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
postgres:r:{postgres=arwdDxtm/postgres,service_role=arwxtm/postgres}
postgres:S:{postgres=rwU/postgres,service_role=rwU/postgres}
```
Κάθε νέα συνάρτηση του `postgres` γεννιέται **με EXECUTE σε anon και authenticated** (αρχή 5). Η 072 πρέπει, μέσα στο ίδιο DO block, `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` και μετά `GRANT EXECUTE … TO service_role` μόνο στις δημόσιες `plan_*` (οι εσωτερικοί βοηθοί: REVOKE και από `service_role`, όπως η 071), και να το **αποδεικνύει** (`has_function_privilege('anon'|'authenticated', oid, 'EXECUTE')` = 0, όπως η 071 γρ. 853-859).

### 4.3 Περιορισμοί της διαδρομής PostgREST → RPC
- Ο `authenticator` έχει `statement_timeout=8s; lock_timeout=8s; session_preload_libraries=supautils, safeupdate`. Κάθε `/rest/v1/rpc/plan_*` τρέχει με όριο **8 δευτ.** — οι αναδρομικές όψεις (`v_piece_pos`) και οι βρόχοι `plan_shipment_problem` πρέπει να μένουν γρήγοροι. Το `safeupdate` αρνείται UPDATE/DELETE χωρίς WHERE (κάθε UPDATE της 072 με WHERE).
- `service_role`: `bypassrls = true`, κανένα rolconfig. Οι SECURITY DEFINER τρέχουν ως `postgres` (`bypassrls = true`, όχι superuser).
- Ο Worker `dbRpc(env, fn, args)` (γρ. 348): POST με JSON args **κατά όνομα** (PostgREST ταιριάζει ονόματα παραμέτρων)· σε αποτυχία κρατά `err.pg = JSON.parse(detail)` = `{code, message, details, hint}`. Ο χαρτογράφος `stockRuleError(e)` (γρ. 3184) διαβάζει `pg.code`, `pg.message`, `pg.hint`:
  - `hint.startsWith("local_relay:")` → LOCAL_RELAY_RULE (οποιοδήποτε SQLSTATE)
  - `code === "23514"`: `hint.startsWith("stock:")`, μετά regex `check constraint "([^"]+)"` → `STOCK_CHECK_TEXT` / `RELAY_CHECK_TEXT` / **κάθε `local_moves_*` → LOCAL_RELAY_RULE** (άρα και το `local_moves_nat_loading` της 071 θα βγει σήμερα ως «τοπική κίνηση», όχι PLAN_RULE)
  - `23505` για `stock_lots_*_live`, `local_moves_relay_once`
  - `23P01` **δεν** χειρίζεται καθόλου → σήμερα θα έπεφτε στο 500.
  Ο κλάδος `plan:` πρέπει να μπει **πριν** από το regex των CHECK, και χρειάζεται κλάδος 23P01 κατά όνομα constraint (`rt_v2_truck_once`→`truck_busy`, `rt_v2_driver_once`→`driver_busy`).

### 4.4 Ρόλοι
`anon`, `authenticated` (NOLOGIN), `authenticator` (LOGIN), `postgres` (LOGIN, bypassrls, όχι super), `service_role` (NOLOGIN, bypassrls), `supabase_admin` (super), `tms_reader` (LOGIN, `default_transaction_read_only=on; statement_timeout=15s`), `tms_check_runner` (NOLOGIN). Οι νέοι πίνακες/όψεις: SELECT σε `service_role`, `tms_reader`, `tms_check_runner`· καμία εγγραφή για κανέναν εκτός owner.

---

## 5. Πρότυπα από υπάρχουσες μεταναστεύσεις που αξίζει να ακολουθήσει η 072

- **Ένα DO block = μία εντολή**, ASCII μόνο, `PERFORM set_config('lock_timeout', '5s', true);`, φρουροί md5 του ζωντανού κειμένου πριν από κάθε `CREATE OR REPLACE` υπάρχουσας συνάρτησης (071 γρ. 118-132), αποδείξεις στο τέλος, B-54 bump μόνο αν προστεθούν triggers (η 072 κατά το tech draft **δεν** προσθέτει triggers → B-54 μένει 46, να αποδεικνύεται όπως στη 071b).
- Ελληνικά μέσα σε ASCII αρχείο: base64 (`convert_from(decode('…','base64'),'UTF8')`, 060 `dl_local_day_sync`).
- Άρνηση με κωδικό: `raise exception using message = …, errcode = 'check_violation', hint = 'stock:' || p_code;` (057 `stock_raise`)· 071: `errcode = '23514', hint = 'plan:<code>'`.
- Σειριοποίηση γραφέων: `pg_advisory_xact_lock(hashtext('<ns>'), hashtext(<key>))` (060). Για τη 072: κλείδωμα ανά κύκλο (`SELECT … FROM ct_round_trips WHERE id = $1 FOR UPDATE`, όπως `rt_merge`) πριν από κάθε αλλαγή στάσεων.
- Audit γραμμή από συνάρτηση (028/060/069):
  ```sql
  insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  values ('trigger:order_cd_stop_follow', 'system', 'update', 'order_stops', r.id::text,
          jsonb_build_object('datetime', r.old_day),
          jsonb_build_object('datetime', new.cross_dock_date, 'order_id', new.id), now());
  ```
  Στη 072 `actor = p_actor`, `role = p_role`.
- Γεννήτριες dry run: `worker/migrations/drafts/tools/build-0xx-dryrun(s).mjs` (071: `build-071-dryruns.mjs`)· το dry run δεν γράφεται ποτέ με το χέρι (`tests/sql-071-drafts.test.js`).

---

## 6. Ο harness PGlite: τι επεκτείνεται για τη 072

### 6.1 Πώς δουλεύει σήμερα (`tms-auditor/test/plan-071.test.mjs`)
```js
async function prodShaped() {
  const db = await freshDb(btreeGist ? { extensions: { btree_gist: btreeGist } } : {});
  // CREATE ROLE anon / authenticated / service_role IF NOT EXISTS
  await db.exec(LIVE);          // fixtures/live-071.sql
  await db.exec(STUBS);         // ct_v_rt_revenue / ct_v_rt_costs / ct_v_rt_pnl / dl_v_rt_route = stubs
  await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
  await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  return db;
}
```
`freshDb` = `createDb({ roles: true, ... })` (`tms-auditor/lib/db.mjs`: τρέχει `drafts/050_monitor_roles.sql`, το column fixture της 22/9 και τα grants του 057). Τα αρχεία διαβάζονται από `path.join(DRAFTS, '..', f)` (= `worker/migrations/`, αφού η 071 βγήκε από τα drafts)· τα drafts της 072 θα διαβάζονται από `DRAFTS`. Το 071b test κάνει `skip` αν το PGlite δεν φορτώνει `btree_gist`.

**Για τη 072:** νέο `plan-072.test.mjs` που χτίζει `prodShaped()`, τρέχει `071_plan_schema.sql` + `071b_plan_one_vehicle.sql` (από `worker/migrations/`), και μετά `072_*` dry run → apply → verify → rules test (≥ 80 περιπτώσεις) → rollback. Το 071 test μένει ως έχει.

### 6.2 Το ερώτημα λήψης (F1 plan Task 1 Step 2) και τι του λείπει
Λίστες σήμερα:
```sql
t(tbl): clients, partners, trucks, drivers, trailers, locations, orders, order_stops, national_orders, ct_round_trips,
        ct_rt_legs, local_moves, dl_entries, pl_movements, audit_log, ct_cost_lines
f(sig): rt_sync_audit, rt_status_guard, rt_recompute, rt_auto_close, rt_auto_close_legs, rt_sync_legs, rt_sync_to_orders,
        rt_sync_to_national_loads, dl_sync_from_rt, dl_local_day_sync, dl_sync_from_local_move, local_moves_before,
        dl_local_line_guard, dl_cash_lock, dl_cash_sync_entry, dl_cash_sync
trg(tbl): ct_round_trips, ct_rt_legs, local_moves, dl_entries
group 5 (CHECK): μόνο ct_round_trips, ct_rt_legs, local_moves
group 6 (indexes): μόνο ct_rt_legs, local_moves, dl_entries
```
Τι **λείπει** και θα κάνει το PGlite να λέει «περνά» ενώ η παραγωγή αρνείται (το σχόλιο του test το ομολογεί: «not NOT NULL, FK or UNIQUE constraints»):
1. **NOT NULL**: καμία στήλη δεν είναι NOT NULL στο fixture (μόνο `ADD COLUMN IF NOT EXISTS name type`). Π.χ. `ct_round_trips.created_by/date_start/scope/trip_type`, `dl_entries.created_by`, `local_moves.move_date`, `audit_log.actor/role/action/table_name` δεν ελέγχονται. Προσθήκη ομάδας: `ALTER TABLE … ALTER COLUMN … SET NOT NULL` για `attnotnull`.
2. **Identity ALWAYS vs BY DEFAULT**: το fixture φτιάχνει κάθε `id` ως `GENERATED BY DEFAULT`· στην παραγωγή `ct_round_trips`, `national_orders`, `orders`, `order_stops`, `dl_entries`, `audit_log`, `locations` είναι **ALWAYS** (`local_moves` BY DEFAULT). Ένα `INSERT … (id, …)` χωρίς `OVERRIDING SYSTEM VALUE` περνά στο PGlite και **σκάει** στην παραγωγή (`428C9`). Η λήψη πρέπει να γράφει το σωστό είδος identity.
3. **UNIQUE**: `ct_round_trips_code_key`, `*_legacy_id_key` (national_orders, order_stops, local_moves, orders). Χωρίς αυτά δεν δοκιμάζεται σύγκρουση `legacy_id`/`code`.
4. **FK**: κανένα (ούτε `dl_entries_rt_id_fkey`, `national_orders_*_location_*_fkey`, `order_stops_order_id_fkey RESTRICT`). Ομάδα μετά από όλους τους πίνακες: `contype = 'f'`.
5. **CHECK** των `national_orders` (`*_stock_piece_*`), `dl_entries` (`dl_cancel_reason`, `dl_one_origin`, `dl_window`, …), `orders`, `order_stops` (`order_stops_performance_check`)· τα `order_stops_via_hub_intl` και τα 071 έρχονται από την ίδια τη 071.
6. **Triggers/συναρτήσεις** που πυροδοτούν οι `plan_*`:
   - `national_orders`: `invoice_mark_guard()`, `stock_guard_natl()` (θέλει `stock_lots`), `national_orders_soft_delete_cascade()` (θέλει `national_loads`).
   - `orders` (για `plan_vs_set_day`): `order_cd_stop_follow()` + `order_stops.ramp_follows_stop()` (θέλει `ramp`)· οι υπόλοιποι 15 triggers του `orders` δεν πυροδοτούνται από `cross_dock_date`, αλλά τα TEST rows του rules test κάνουν INSERT σε `orders` (`rt_create_from_order`, `order_leg_*`, `stock_guard_orders`, `orders_invoice_mark_guard` ακούνε INSERT) — σήμερα δεν υπάρχουν στο PGlite, άρα το INSERT της παραγωγής κάνει περισσότερα από του test.
   - Πίνακες που λείπουν: `national_loads`, `stock_lots`, `ramp`.
7. Οι όψεις χρημάτων (`ct_v_rt_*`, `dl_v_rt_route`) είναι stubs: ό,τι αφορά χρήματα αποδεικνύεται μόνο στην παραγωγή (dry run).

Το fixture ξαναπαράγεται **μόνο** με το ερώτημα (ποτέ με το χέρι)· η επέκταση = νέες τιμές στα `t`/`f`/`trg` και νέες ομάδες (NOT NULL, UNIQUE, FK, identity kind), σε νέο αρχείο `fixtures/live-072.sql` ώστε το 071 test να μένει αμετάβλητο.

### 6.3 Τι χρειάζεται ένα TEST row (από το `071_plan_schema_test.sql`, που περνά στην παραγωγή)
```sql
INSERT INTO locations (legacy_id, name) VALUES ('rec071TA', 'TEST 071 A');            -- name NOT NULL
INSERT INTO clients (company_name) VALUES ('TEST 071 client');
INSERT INTO partners (company_name) VALUES ('TEST 071 partner');
INSERT INTO trucks (license_plate) VALUES ('TEST-071-1');
INSERT INTO drivers (full_name) VALUES ('TEST 071 driver');
INSERT INTO national_orders (legacy_id, client_id, reference, price) VALUES ('rec071TN1', cl, 'WN071-TEST', 100);
INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                    cross_dock_date, reference, client_id)
VALUES ('rec071TO1', 'International', 'Import', 'Pending', true, d - 3, d + 1, d, 'WN071-TEST', cl);
INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
VALUES ('rec071TS2', 'Unloading', 1, d + 1, vso, lb, 20);
INSERT INTO ct_round_trips (scope, trip_type, date_start, status, source, created_by)          -- v1
VALUES ('NATL', 'OWNED', d, 'planned', 'manual', 'test:071');
INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                            status, source, created_by)                                        -- v5
VALUES (2, 'NATL', 'OWNED', trk, drv, d, d, at6, at14, 'planned', 'planner', 'test:071');
INSERT INTO local_moves (move_kind, rt_stop_id, driver_id, move_date, status) VALUES ('nat_loading', s1, drv2, d, 'Assigned');
INSERT INTO pl_movements (movement_date, counterparty_type, client_id, event_type, piece_leg_id, created_by)
VALUES (d, 'CLIENT', cl, 'DELIVERY', lg1, 'test:071');
```
Ελάχιστα ανά πίνακα: `national_orders` — τίποτα υποχρεωτικό· `orders` — τίποτα (αλλά `veroia_switch`, `direction`, `cross_dock_date` για VS)· `order_stops` — τίποτα· `ct_round_trips` — `scope, trip_type, date_start, created_by` (+ τα 071 για model=2· `code`, `status`, `source` έχουν default)· `local_moves` — `move_date` (+ CHECK nat_loading)· `dl_entries` (αν γραφτεί ρητά) — `driver_id, entry_type, entry_date, created_by`. Αναγνωριστικά δοκιμής: `legacy_id rec072T…`, `reference WN072-TEST`, `TEST 072 …`, `TEST-072-…`· το τέλος με σκόπιμο σφάλμα. Στην παραγωγή το rules test προχωρά τις ακολουθίες `ct_rt_code_seq` (RT-) και `pl_code_seq` (PM-).

---

## 7. Ανοιχτά σημεία που βγαίνουν από τη μέτρηση (για το πλάνο Φ2, όχι αποφάσεις)
1. `legacy_id` των εθνικών που γράφει το `plan_orders_create` (αλλιώς `id: null` στο facade).
2. `direction` / `type` της `national_orders` v5 (σήμερα βελάκια και `Independent`)· ποιος αναγνώστης τα χρειάζεται.
3. `p_role` δίπλα στο `p_actor` (το `audit_log.role` είναι NOT NULL).
4. Facade DELETE / PATCH σε εθνική που έχει αποστολή v5 → σιωπηλά νεκρή αλυσίδα (μπλοκάρισμα στη Φ2 ή αναμονή της Φ5;).
5. «dl_entries σε κλεισμένη περίοδο» δεν έχει πηγή στη βάση.
6. `partner_needs_partner` κάνει το «Καθαρισμός ανάθεσης» σε PARTNER αδύνατο χωρίς αλλαγή `trip_type`.
7. `stockRuleError`: κλάδος `plan:` πριν από το regex CHECK, κλάδος `23P01`, και τα `local_moves_nat_loading*` σήμερα πάνε σε LOCAL_RELAY_RULE.
8. Όριο 8 δευτ. ανά RPC (`authenticator.statement_timeout`).
9. Κανένα EXCLUDE ανάμεσα σε v1 και v5 RT του ίδιου φορτηγού (η 071b κοιτά μόνο model=2).
