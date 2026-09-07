# Backend audit — εθνικό κύκλωμα (READ-ONLY, 7/9/2026)

Πηγές: `worker/src/index.js` (deployed σήμερα) + Supabase (SELECT μόνο).
Καμία εγγραφή/deploy δεν έγινε.

## 1. Worker χάρτης

| Facade ID | pg | fields | links | reverseLinks |
|---|---|---|---|---|
| tblGHCCsTMqAy4KR2 NATIONAL ORDERS | national_orders | ~35 (γρ.1379-1463) | Client,Partner,Truck,Trailer,Driver,"Linked Order"→orders.source_order_id, 10×Pickup/Delivery Location | ORDER STOPS→order_stops.national_order_id |
| tblVW42cZnfC47gTb NATIONAL LOADS | national_loads | ~21+alias (γρ.1512-1595) | "Source Order"→orders, "Source Consolidated Load"→consolidated_loads, Truck/Trailer/Driver/Partner, 10×Pickup/Delivery | ORDER STOPS→order_stops.national_load_id |
| tblxUAaIsUMEDl3qQ GROUPAGE LINES | groupage_lines | 10 (γρ.1265-1289) | Location×2, "Linked Intl Order"→orders, "Linked National Order"→national_orders, "Linked Consolidated Load"→consolidated_loads | — |
| tbl5XSLQjOnG6yLCW CONSOLIDATED LOADS | consolidated_loads | 25 (γρ.1311-1345) | Client,Truck,Trailer,Driver,Partner,10×Loading/Delivery Location | — |
| tblaeY5QOHAS1gyE8 ORDER STOPS | order_stops | 15 (γρ.1470-1487) | Location,"Client at Stop","Parent Order"→orders,"Parent Nat Order"→national_orders,"Parent Nat Load"→national_loads | — |
| tblT8W5WcuToBQNiY RAMP | ramp | 44 (γρ.936-989) | Order→orders, "National Order"→national_orders, Truck→trucks, Driver→drivers (γρ.991-996) | — |
| local_moves (ΣΚΕΤΟ id) | local_moves | 8 (γρ.1620-1628) | Driver,Truck,Trailer,Partner,From/To Location,"Parent Nat Load"→national_loads,"Parent Order"→orders | — |
| tblUhgqnmiam5MGNK PARTNER ASSIGNMENTS | partner_assignments (readView partner_assignments_computed) | 7 (γρ.1672-1679) | Partner→partners, Order→orders | — |
| tblgHlNmLBH3JTdIM ORDERS (μόνο VS/NG) | orders (readView orders_with_derived) | "Veroia Switch"→veroia_switch (γρ.1161), "National Groupage"→national_groupage (γρ.1166) μέσα σε ~97 πεδία | (εκτός σκοπού) | ORDER STOPS→order_stops.order_id |
| — ct_round_trips/ct_rt_legs | ct_round_trips, ct_rt_legs | ΔΕΝ περνούν από `TABLES`· route `/costs/rt*` (γρ.2700-2980). `ct_rt_legs.nat_load_id`→national_loads, `.order_id`→orders | | |

Κανένα `readView` στους 8 βασικούς πίνακες του εθνικού κυκλώματος (μόνο ORDERS και PARTNER ASSIGNMENTS έχουν, γενικά).

### PERMISSIONS (γρ.371-527)
```
owner:      "*": [GET,POST,PATCH,DELETE]                         γρ.372-374
management: "*": [GET]· ramp:[GET] γρ.399· partner_assignments:[GET,POST,PATCH,DELETE] γρ.413
            → national_orders/national_loads/groupage_lines/consolidated_loads/
              order_stops/local_moves: καμία ρητή γραμμή, άρα μόνο GET μέσω "*"
accountant: "*": [GET]· καμία ρητή γραμμή σε κανέναν από τους 8 → μόνο GET παντού
dispatcher: (χωρίς "*")
   national_orders:     [GET,POST,PATCH]           γρ.462
   groupage_lines:      [GET,POST,PATCH] ΧΩΡΙΣ DELETE γρ.466
   consolidated_loads:  [GET,POST,PATCH,DELETE]     γρ.467
   national_loads:      [GET,POST,PATCH,DELETE]     γρ.473
   order_stops:         [GET,POST,PATCH,DELETE]     γρ.474
   local_moves:         [GET,POST,PATCH,DELETE]     γρ.482
   ramp:                [GET,POST,PATCH,DELETE]     γρ.486
   partner_assignments: [GET,POST,PATCH,DELETE]     γρ.503
warehouse:  (χωρίς "*")
   national_orders/consolidated_loads/national_loads/groupage_lines/order_stops: [GET] γρ.519-523
   → local_moves, partner_assignments: απουσιάζουν, χωρίς "*" → can() γρ.528-534 = false → 403
```
COSTS_PERMS (γρ.2700-2711, ξεχωριστό, `/costs/*`): `rt` (αγγίζει
national_loads μέσω nat_load_id) — owner [GPPD], accountant [GET,POST],
dispatcher [GPPD]· management ΔΕΝ έχει `rt` καθόλου → 403.

### Labels στον χάρτη (cross-check, σύντομα)
NATIONAL ORDERS (35 labels, γρ.1379-1463: Direction…Advance Paid). **ΔΕΝ
υπάρχει `Name`.**
NATIONAL LOADS (21 labels + alias, γρ.1512-1595): Name…Source Orders. Alias
`"Source Record"`→source_orders_raw, μόνο write/filter, ΟΧΙ read (γρ.1547-1551).
GROUPAGE LINES (10, γρ.1265-1289): Name…Notes. **ΔΕΝ υπάρχει `Groupage ID`.**
RAMP: 44 labels, όλα επίπεδα (καμία formula), γρ.936-982.

## 2. Βάση

Όλες οι στήλες nullable εκτός: `id`, `created_at` (όλοι), `move_date`/
`sequence`/`status` (local_moves).

**national_orders**: FK clients/partner/truck/trailer/driver/source_order_id
(→orders)/10+10 locations. **Καμία CHECK** (όχι status/direction/type). **Καμία
στήλη προς national_loads/groupage_lines/consolidated_loads.**
**national_loads**: FK source_order_id→orders, source_cons_load_id→
consolidated_loads, truck/trailer/driver/partner, 10+10 locations. CHECK
`national_loads_one_source`, 2× CHECK ώρας HH:MM (**NOT VALID**, δεν ελέγχουν
προϋπάρχουσες γραμμές). **Καμία CHECK σε status/direction/source_type. Καμία
FK προς national_orders.**
**groupage_lines**: FK order_id/national_order_id ON DELETE RESTRICT,
cons_load_id χωρίς ρητό ON DELETE (=NO ACTION, ισοδύναμο). **Καμία CHECK σε
status** ενώ η εφαρμογή βασίζεται σε 'Unassigned'/'Assigned' αυστηρά.
**consolidated_loads**: FK client/truck/trailer/driver/partner + 20×
locations. **Καμία CHECK.**
**order_stops**: FK στους 3 γονείς ON DELETE RESTRICT + location/client_at_
stop. CHECK `order_stops_performance_check` (μόνο 'On Time'/'Delayed').
**partner_assignments**: FK order_id, partner_id. `trip_2_id`,`trip_3_id`,
`national_load_id` **χωρίς FK** (αδρανή, 0018 unwired, όπως λέει το σχόλιο).
**ramp**: FK **ΜΟΝΟ** driver_id,truck_id. **`order_id`, `national_order_id`
ΧΩΡΙΣ FK constraint καθόλου** (ο Worker τα αντιστοιχίζει ως links, γρ.
991-996, η βάση δεν τα επιβάλλει)· `trip_id` επίσης χωρίς στόχο. Καμία CHECK.
**local_moves**: FK driver/truck/trailer/partner/from-to location,
parent_nat_load_id→national_loads, parent_order_id→orders. CHECK
`local_moves_one_parent`, 2× CHECK ώρας.
**ct_round_trips/ct_rt_legs**: πλήρες σετ CHECK (scope INTL/NATL, trip_type,
status, owned_needs_truck, partner_needs_partner, window_order)· `ct_rt_legs`
CHECK `one_source` (ακριβώς order_id XOR nat_load_id), FK σωστά σε
orders/national_loads/ct_round_trips (CASCADE στο rt_id), unique partial index
ανά order_id/nat_load_id.

**Indexes**: pkey+unique(legacy_id) παντού. Επιπλέον: national_loads(status,
source_order_id,source_cons_load_id), national_orders(invoiced,ops_status,
source_order_id), groupage_lines(status,order_id,national_order_id,
cons_load_id), consolidated_loads(status,client_id), ramp(status,type,
plan_date,postponed_to,driver_id,truck_id, **order_id — index χωρίς FK**),
local_moves(partial idx date/driver/parent), ct_rt_legs(unique nat_load_id/
order_id, idx rt_id), ct_round_trips(unique code, idx truck+date window).

**Triggers**: **Κανένα** σε national_orders, national_loads, groupage_lines,
consolidated_loads, order_stops, ramp, local_moves, partner_assignments.
Μόνο σε `orders` (order_leg_depth/inherit/status_sync, rt_sync_from_order) και
στο κύκλωμα κόστους (`ct_round_trips`: rt_sync_to_orders, dl_sync_from_rt·
`ct_rt_legs`: rt_sync_legs). Λειτουργίες (pg_get_functiondef):
`rt_sync_from_order`/`rt_sync_to_orders`/`rt_sync_legs` συγχρονίζουν driver/
truck/trailer/partner/trip_type ανάμεσα σε `ct_round_trips` και **`orders`**
ελέγχοντας **μόνο `leg.order_id`** — καμία γραμμή αγγίζει `national_loads`
όταν το leg είναι εθνικό (βλ. Εύρημα 6). `dl_sync_from_rt` γράφει/ακυρώνει
`dl_entries` (μισθοδοσία), άσχετο με το εθνικό sync-chain. `order_leg_*`
αφορούν μόνο leg-of-order ιεραρχία.

**Views**: `orders` πολλές (orders_with_derived+3 παλιές, partner_
assignments_computed, ct_v_rt_revenue, ct_v_rt_pallet_gate, dl_v_rt_route,
pl_v_order_gate, v_client/driver/partner_delivery). `national_loads`:
ct_v_rt_revenue, dl_v_rt_route. `ct_rt_legs`: ίδιες + ct_v_rt_pallet_gate.
`order_stops`: pl_v_order_gate. `partner_assignments`:
partner_assignments_computed. **national_orders, groupage_lines,
consolidated_loads, ramp, local_moves, ct_round_trips: καμία view.**

Column comments: δεν προκύπτει (καμία βρέθηκε σε information_schema.columns).

## 3. Δεδομένα (μετρημένα 7/9/2026)

```
national_orders 4 · national_loads 25 · groupage_lines 0 · consolidated_loads 0
order_stops 389 · ramp 44 · local_moves 0 · partner_assignments 23
ct_round_trips 50 (χωρίς deleted_at) · ct_rt_legs 98 · orders 129
```

**national_orders** (4/4): status **NULL σε όλες**, direction='South→North',
national_groupage=false, source_order_id=NULL (όλες "Independent").
**national_loads** (25/25): source_type='Direct' σε ΟΛΕΣ. status Pending 22/
Assigned 3. direction North→South 18, South→North 7. has_truck=3,
has_driver=3, has_partner=0, has_source_order=25 (όλες), has_source_cl=0,
has_no_source=0. loading_datetime: 2026-08-08→2026-09-07. Ορφανά
source_order_id→deleted order: **0**.
**orders.veroia_switch**: 25 true, 0 national_groupage=true. Όλα τα 25
true έχουν ακριβώς 1 national_load· 0 national_loads δείχνουν σε order με
veroia_switch≠true — 1-προς-1 πλήρης σήμερα.
**order_stops** (389): γονέας αποκλειστικά — order_id 315, national_order_id
8, national_load_id 66 (άθροισμα=389, καμία επικάλυψη/απουσία). 0 δείχνουν σε
deleted order. **14 δείχνουν σε national_load deleted** (Εύρημα 1). Από τα 66
με national_load_id: 0 stop_type NULL, 0 completed_at, 0 performance —
per-stop execution facts αχρησιμοποίητο στο εθνικό.
**ramp** (44/44): has_truck=0, has_driver=0, has_order=0, has_national_order=0
— καμία γραμμή με fleet/order link· 0 NULL σε status/type. plan_date:
2026-04-02→2026-09-06.
**local_moves**: 0 γραμμές.
**partner_assignments** (23): Delivered 21, Pending 1, Assigned 1.
**ct_round_trips/ct_rt_legs**: scope='INTL' σε **όλες τις 50** (0 NATL)·
trip_type OWNED 47/PARTNER 3· status closed 39, planned 9, cancelled 2.
`has_order_id=98`, **`has_nat_load_id=0/98`** — κύκλωμα κόστους εθνικών
εντελώς αδρανές παρότι καλωδιωμένο πλήρως στη βάση.

## 4. Ευρήματα

1. **14 ζωντανές order_stops δείχνουν σε 7 soft-deleted national_loads**
   (νεότερο 2026-09-06 16:10, παλαιότερο 2026-08-20 — συνεχιζόμενο, όχι
   ιστορικό). SQL: join os/nl με os.deleted_at IS NULL AND nl.deleted_at IS
   NOT NULL → **14**. Αιτία στον κώδικα: `handleFacadeDelete` (γρ.2605-2629)
   κάνει soft-delete **μόνο** στη γραμμή-στόχο· μόνο `ORDERS_TABLE_ID`
   δρομολογείται σε cascade (γρ.3748-3749, RPC `delete_order_cascade`). Άρα
   `DELETE /national_loads/:id` (δικαίωμα dispatcher, γρ.473) δεν αγγίζει τα
   παιδιά order_stops. Αρχή 1: ο χρήστης βλέπει «διαγράφηκε», η στάση μένει
   ζωντανή/ορφανή.
2. **national_loads ↔ national_orders: καμία στήλη/FK.** Μια "Independent"
   national_order (χωρίς source_order_id, όπως οι 4 σημερινές) δεν μπορεί ποτέ
   να συνδεθεί με FK σε national_load· μόνη γέφυρα είναι το order_stops (δύο
   χωριστές στήλες, ποτέ μαζί).
3. **Καμία CHECK σε status/direction σε 6 από τους 8 πίνακες**
   (national_orders, national_loads, groupage_lines, consolidated_loads,
   ramp, local_moves). Ο,τιδήποτε ελεύθερο κείμενο περνά· ο έλεγχος είναι
   μόνο πειθαρχία εφαρμογής, όχι βάσης (Αρχή 4).
4. **`ramp.order_id`/`national_order_id` χωρίς FK constraint** (επιβεβαιωμένο
   pg_constraint· μόνο driver_id/truck_id έχουν FK). Data: 0/44 έχουν καν
   τιμή σήμερα.
5. **`facade_unknown_fields` δείχνει ζωντανή σιωπηλή απόρριψη σήμερα**:
   - `national_orders` "Name": 4× read-unknown, τελευταία **σήμερα 09:22** —
     δεν υπάρχει στήλη `name` στο national_orders καθόλου.
   - `national_loads` "Source Record": 47× read-unknown, τελευταία **σήμερα
     09:24**, owner. Εσκεμμένο κατά τον κώδικα (μόνο write/filter alias,
     γρ.1547-1551) αλλά κάποιο front-end path ακόμη διαβάζει
     `fields['Source Record']` και παίρνει πάντα undefined.
   - `groupage_lines` "Groupage ID": 8× read-unknown (τελευταία 5/9), δεν
     υπάρχει στο fields map του GROUPAGE LINES.
   - `ramp` Order/National Order/Driver/Truck: 18/18/18/18 read + 2/2/2/2
     write, **σταματούν ακριβώς 2026-09-06 07:47** — συμπίπτει με το σχόλιο
     του κώδικα «measured 6/9» και το νέο `links` block. Καμία εγγραφή
     unknown ΜΕΤΑ — συνεπές με «διορθώθηκε» — ΑΛΛΑ τα ίδια πεδία στη βάση
     είναι ακόμη 0/44 σήμερα. Δεν προκύπτει από τα δεδομένα αν σημαίνει
     «καμία νέα γραφή δοκιμάστηκε» ή «η διόρθωση δεν αρκεί» (Ερώτηση 1).
   - `ramp` "Unsupported filter term: FIND(...ARRAYJOIN({Order},...))>0":
     75 φορές σε 55 recids, **2026-08-24 → 2026-09-06 16:10** (ρητά ΜΕΤΑ τις
     07:47 της ίδιας μέρας που "διορθώθηκαν" τα labels) — το φιλτράρισμα σε
     linked record σκάει 422 ακόμη και αφού μπήκε `links` block. Δεν
     προκύπτει αν δοκιμάστηκε ξανά μετά τις 16:10/6-9.
6. **Μονόπλευρος συγχρονισμός RT↔national_loads**: `rt_sync_from_order`,
   `rt_sync_to_orders`, `rt_sync_legs` ενημερώνουν driver/truck/trailer/
   partner ανάμεσα σε ct_round_trips και **orders** αποκλειστικά μέσω
   `leg.order_id`· καμία γραμμή ελέγχει `leg.nat_load_id`. Σήμερα ακίνδυνο
   (0/98 legs έχουν nat_load_id), αλλά αν ενεργοποιηθεί το NATL round-trip
   κύκλωμα, RT↔national_loads δεν θα ξανασυγχρονιστεί ποτέ προς καμία
   κατεύθυνση.
7. **RBAC πλάτος**: ο dispatcher έχει πλήρες [GPPD] σε 6/8 πίνακες του
   εθνικού κυκλώματος (μόνο groupage_lines χωρίς DELETE, εσκεμμένα). Χωρίς
   field-level περιορισμό, ένα PATCH σε `national_orders` αλλάζει και
   price/partner_rate (P&L) — ίδιο R-04 tension με partner_assignments
   (γρ.490-500), αλλά μη καταγεγραμμένο εκεί για national_orders.

## 5. Ερωτήσεις προς owner

1. Το fix του RAMP `links` block (6/9 07:47) έκλεισε το unknown-field
   logging αλλά η βάση δείχνει ακόμη 0/44 με τιμή σε αυτές τις στήλες.
   Θέλεις δοκιμαστική καταχώρηση πριν θεωρηθεί λυμένο;
2. Οι 7 soft-deleted national_loads με 14 ζωντανές ορφανές order_stops —
   χειροκίνητος καθαρισμός τώρα, ή πρώτα διόρθωση στο `handleFacadeDelete`;
3. Ποια οθόνη/module ζητά ακόμη "Source Record" σε READ από national_loads
   (47η φορά σήμερα 09:24) — να το εντοπίσουμε στο front end;
4. Το ct_round_trips/ct_rt_legs (κόστος) έχει 0 NATL γραμμές — επίτηδες
   ανενεργό μέχρι το Trip Costs P&L phase 2 για εθνικά, ή αναμενόταν ήδη να
   τροφοδοτείται από τα 25 national_loads;
5. Θέλεις CHECK σε status/direction τουλάχιστον για national_loads και
   national_orders, αφού σήμερα δεν υπάρχει καμία;
