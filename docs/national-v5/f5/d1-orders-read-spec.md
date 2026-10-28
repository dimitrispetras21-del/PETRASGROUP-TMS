# Φ5 · stream (d1) · Ε3 + Ε5: spec ανάγνωσης της σελίδας «Παραγγελίες» για εθνικά v5

28/10/2026. Πλάνο: `docs/superpowers/plans/2026-10-28-f5-national-v5-cutover.md` (Q-7, P-6, §10 d1, §11). Spec: `docs/superpowers/specs/2026-10-21-national-v5-design.md` §2.1, §2.3, §5 Ε3/Ε5.

## 1. Το πρόβλημα, μετρημένο στον κώδικα

Μια εθνική v5 (`plan_orders_create`, 072:665) γράφει γραμμή στο `national_orders` με `loading_datetime`, `delivery_datetime`, `pickup_location_1_id`, `delivery_location_1_id`, `pallets`, `price`. **Δεν** γράφει `status`, `direction`, `type`, `truck_id`, `partner_id` (spec §2.1: κανένας καθρέφτης), ούτε NL.

Άρα από το L, χωρίς αλλαγή:

| Οθόνη | Σημείο | Τι θα έδειχνε για εθνική v5 |
|---|---|---|
| Κατάλογος, ΑΝΑΘΕΣΗ + chip «εκτός» | `orders_natl.js` `_natlLoad` (noLoad), `orders-common.js` `assignOf` | «εκτός» + κουμπί «Στείλε →», που θα προσπαθούσε να γράψει NL (πάγωμα 074 → άρνηση) |
| Καρτέλα εθνικής | `orders_natl.js` `_onAssignment`, `_ON_ASSIGN_LINE.out` | «ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ — δεν έχει εθνικό φορτίο» |
| «Χωρίς τιμή», ΑΝΑΘΕΣΗ | `orders_noprice_view.js` (γρ. 283-292) | «εκτός» |
| «Εβδομάδα», ενότητα Εθνικές | `orders_week_view.js` `pairNationals`, `_natRowHtml` | «εκτός φορτίου», πάντα στη στήλη Κάθοδος (`Direction` NULL) |
| «παραδόθηκε» (KPI καταλόγου, τιμολόγηση «ready»/«noSheets», ηλικία) | `orders-common.js` `isDelivered` → `deliveredByDate` | η ημερομηνία, όχι ο κανόνας §2.3 (όλα τα κομμάτια με εκτελεσμένη στάση παράδοσης) |

## 2. Από πού διαβάζει (η μία νέα ανάγνωση)

Καμία υπάρχουσα ανάγνωση δεν απαντά «ποιος κύκλος / παραδόθηκε» **ανά εθνική παραγγελία** για εύρος 60/180 ημερών ή «Όλες»: το `/plan/vs-state` είναι μόνο για διεθνείς (`kind IN vs_import, vs_export`), το `/plan/board` είναι μία εβδομάδα.

Ο αριθμός της εθνικής φτάνει ήδη στο front: label `Order No` = `national_orders.id` (όψη `national_orders_with_derived`, 054).

**Αίτημα προς (a1) + (b), για το deploy 1:**

- **Βάση (074a, stream a1):** `plan_nat_state(p_nat_order_ids bigint[]) RETURNS jsonb`, `STABLE SECURITY DEFINER`, ίδιο σχήμα με την `plan_vs_state` (072:2466):
  - `NULL` → `{}`· πάνω από 500 → `plan:bad_input`.
  - Αντικείμενο με κλειδί το id ως κείμενο → `"missing"` όταν η εθνική δεν έχει γραμμή στο `v_national_order_state` (παλιό μοντέλο), αλλιώς:
    ```
    { "n_pieces": int, "n_executed": int,
      "executed": bool,   -- v_national_order_state.executed (§2.3)
      "planned":  bool,   -- v_national_order_state.planned
      "late":     bool,
      "hub_side": "ANODOS" | "KATHODOS" | null,   -- ANODOS όταν ΟΛΕΣ οι ζωντανές αποστολές καταλήγουν στον κόμβο,
                                                  -- KATHODOS όταν ΟΛΕΣ ξεκινούν από αυτόν, αλλιώς null
      "carriers": [ { "kind": "owned"|"partner"|"none",
                      "truck": text|null, "trailer": text|null, "driver": text|null, "partner": text|null,
                      "code": text, "side": "KATHODOS"|"ANODOS", "day": "YYYY-MM-DD" } ] }
    ```
  - `carriers`: από τα ζωντανά `piece_legs` των κομματιών της (`v_piece_state.nat_order_id`), ένα ανά (κύκλος, side), μόνο κύκλοι `model = 2` με `status <> 'cancelled'`. `side` = `rt_stops.side` της στάσης παραλαβής· `day` = ημέρα Αθήνας του `planned_from` της στάσης παραλαβής. Ονόματα όπως η `plan_vs_state`: `trucks.license_plate`, `trailers.license_plate`, `drivers.full_name`, `partners.company_name`. `kind` όπως η `plan_vs_state`. Ταξινόμηση `day, code`.
  - Κανένα ποσό (δεν χρειάζεται κοπή ανά ρόλο).
  - Γεννιέται κλειστή: `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`· `EXECUTE` μόνο στον `service_role`.
  - PGlite: `"missing"` για εθνική χωρίς αποστολές· κομμάτι χωρίς σκέλος → `planned:false, carriers:[]`· σκέλος σε κύκλο PARTNER → `kind:"partner"`· κύκλος `cancelled` → εκτός `carriers` και `executed:false`· 501 ids → `bad_input`.
- **Worker (deploy 1, stream b):** `GET /plan/nat-state?nat_order_ids=1,2,…` → `plan_nat_state`.
  - Γραμμή στο `PLAN_ROUTES`: `{ method: "GET", re: /^\/plan\/nat-state$/, resource: "nat-state", rpc: "plan_nat_state", read: planNatStateArgs, migration: "074a" }`.
  - `planNatStateArgs` όπως το `planVsStateArgs`, με κλειδί `nat_order_ids` → `p_nat_order_ids` (1–500 θετικοί ακέραιοι, αλλιώς 400 `bad_nat_order_ids`).
  - `PLAN_PERMS`: `"nat-state": ["GET"]` και στους 5 ρόλους (όπως το `vs-state`).
  - Ανάγνωση: ανοιχτή και με `PLAN_WRITES_OPEN = false`.
  - Σημάδι φρουρού (πρόταση): `rpc: "plan_nat_state"`.

**Τι ΔΕΝ ζητώ:** τίποτα για ράμπα / συνεργάτες / KPI (d2–d4)· καμία εγγραφή.

## 3. Τι δείχνει κάθε οθόνη (μόνο με τα υπάρχοντα σχήματα· καμία νέα οπτική)

Κανόνας «v5 ή όχι» = **η απάντηση της βάσης** (`"missing"` ή όχι), ποτέ ημερομηνία L στην οθόνη.

- **ΑΝΑΘΕΣΗ** (κατάλογος, «Χωρίς τιμή», καρτέλα): για εθνική v5 το ίδιο κελί δύο γραμμών του `assignOf`:
  - ένας φορέας → «πινακίδα · ρυμούλκα» / οδηγός, ή συνεργάτης / «συνεργάτης»·
  - περισσότεροι (σπάσιμο στη Βέροια) → ο πρώτος, και «+N» στη δεύτερη γραμμή·
  - κανένας → «— προς ανάθεση», τίτλος «Στο Εβδομαδιαίο Εθνικών, χωρίς όχημα»·
  - ποτέ «εκτός», ποτέ «Στείλε →».
- **Καρτέλα:** η γραμμή ανάθεσης από τον ίδιο κανόνα· «ΠΡΟΣ ΑΝΑΘΕΣΗ — στο Εβδομαδιαίο, χωρίς όχημα» όταν δεν έχει φορέα.
- **«Εβδομάδα»:** μία γραμμή ανά εθνική v5 (το ζευγάρι κάθοδος–άνοδος του v5 είναι ο κύκλος, που φαίνεται στο board). Πλευρά: `side` του πρώτου φορέα, αλλιώς `hub_side`, αλλιώς Κάθοδος. Η άλλη πλευρά: «Χωρίς κάθοδο/άνοδο», όπως σήμερα. ΑΝΑΘΕΣΗ όπως παραπάνω.
- **«παραδόθηκε»** (Ε5): για εθνική v5 = `executed` της βάσης. Για παλιά: ο κανόνας ημερομηνίας, όπως σήμερα.
- **Αποτυχία ανάγνωσης:** ΑΝΑΘΕΣΗ «—» (ποτέ «εκτός»), λωρίδα «Η κατάσταση των εθνικών v5 δεν διαβάστηκε — η ΑΝΑΘΕΣΗ δείχνει «—» και το «παραδόθηκε» δεν μετρά τις εθνικές v5. Ξαναδοκίμασε.», `logError`. Εθνική άγνωστης κατάστασης δεν μετρά ως παραδοθείσα (καμία μαντεψιά από ημερομηνία).

## 4. Πότε τρέχει (αδρανές ως το L)

- `PlanConfig.load()` του (c): `'before'` → **καμία** κλήση· ο κώδικας όπως σήμερα (το flag-off path είναι ο ίδιος κώδικας, όχι αντίγραφο). `'after'` ή `'unknown'` → κλήση `nat-state` για τις εθνικές του συνόλου με `Order No` (τμήματα ≤ 500).
- Το `'unknown'` καλεί κι αυτό: η ανάγνωση είναι ακίνδυνη, και πριν από το L απαντά `"missing"` για όλες (= σημερινή εικόνα). Αν αποτύχει, η λωρίδα του §3.
- Χωρίς `PlanConfig` (το αρχείο δεν φορτώθηκε) = `'unknown'`, με `logError` μία φορά.

## 5. Οι πέντε ερωτήσεις «μέχρι τον πίνακα»

1. Endpoint: `GET /plan/nat-state` (νέο)· τα υπάρχοντα NAT_ORDERS και NAT_LOADS (μόνο για παλιές) μένουν.
2. Πίνακες: `national_orders.id` (label `Order No`), `v_national_order_state`, `v_piece_state`, `piece_legs`, `rt_stops.side/planned_from`, `ct_round_trips` (`model=2`, `status`, `trip_type`, `code`, `truck_id/trailer_id/driver_id/partner_id`), `trucks/trailers/drivers/partners`.
3. Γράφει: **τίποτα**. Το «Στείλε →» δεν εμφανίζεται για εθνική v5.
4. Αποτυχία: §3, ορατή λωρίδα, «—», ποτέ «εκτός» ή 0.
5. Δικαίωμα: `PLAN_PERMS["nat-state"] = ["GET"]` και στους 5 ρόλους.

## 6. Σημεία εισόδου του Task F στο `orders_natl.js` (μετά το L)

- «Νέα εθνική» → `WN5Form.openOrder({})` (η φόρμα v5, ίδια διαδρομή με το board).
- Επεξεργασία εθνικής v5 → το Εβδομαδιαίο Εθνικών v5 στην εβδομάδα της (η φόρμα v5 διαβάζει μόνο τη φορτωμένη εβδομάδα, Ε-9)· ποτέ η παλιά φόρμα.
- Επεξεργασία παλιάς εθνικής → η παλιά φόρμα μόνο με τα πεδία της Q-10 ανά ρόλο, τα υπόλοιπα disabled με λόγο· καμία εγγραφή NL/GL/CL από τη φόρμα («Στείλε →», αλυσίδα groupage, `_syncNationalLoad`).
- Scan και Groupage της παλιάς φόρμας → κρυφά μετά το L.

## 7. Ανοιχτά προς τον συντονιστή

1. Η `plan_nat_state` + `/plan/nat-state` ως την Πέμπτη 12:00 (a1 + b). Χωρίς αυτήν δεν υπάρχει σωστή Ε3/Ε5· η εναλλακτική (μία `/plan/board` ανά εβδομάδα του εύρους) θα έκανε 9–26 κλήσεις ανά άνοιγμα και δεν καλύπτει το «Όλες».
2. Το §6 (Task F στο `orders_natl.js`, πίνακας Q-10 ανά ρόλο μέσα στην παλιά φόρμα) είναι το μεγαλύτερο ρίσκο προθεσμίας του (d1).
