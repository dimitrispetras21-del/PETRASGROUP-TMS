# COSTS — Τι δημιουργήθηκε στη Supabase (Migration 001)

_Εκτελέστηκε 2026-08-10 μέσω SQL editor · επιβεβαιωμένο με introspection από το
PostgREST (όχι από το SQL αρχείο — από το τι ΟΝΤΩΣ υπάρχει στη βάση)._
_Όλοι οι πίνακες με **RLS ενεργό**: πρόσβαση ΜΟΝΟ μέσω Worker service key·
όποιος έχει απλό anon key δεν βλέπει τίποτα (DB-level enforcement, spec §10.2.11)._

## Πίνακες (6)

### ct_settings — ρυθμίσεις COSTS (3 στήλες)
`key* text PK · value* numeric · updated_at*`
Seeds: x_export **850** · x_import **650** · pallet_eur **12** ·
vat_default **0.24** · wear_fallback_eur_km **0.082**

### ct_round_trips — το κέντρο κόστους (17 στήλες)
`id* · code* (auto RT-1001+) · scope* INTL/NATL · trip_type* OWNED/PARTNER ·
truck_id → trucks · trailer_id → trailers · driver_id → drivers ·
partner_id → partners · date_start* / date_end (το παράθυρο κατανομής) ·
status* planned→in_progress→closed→complete/cancelled · closed_at ·
total_km · source* planner/manual · created_by* · created_at* · updated_at*`
Constraints: OWNED⇒truck_id, PARTNER⇒partner_id, date_end≥date_start.
Index: (truck_id, date_start, date_end) — για τον allocation engine.

### ct_rt_legs — σκέλη → φορτία (5 στήλες)
`id* · rt_id* → ct_round_trips (cascade) · direction* EXPORT/IMPORT/ANODOS/KATHODOS ·
order_id → orders · nat_load_id → national_loads`
Unique: 1 order = 1 RT, 1 national load = 1 RT. Έσοδα πάντα με JOIN στο price.

### ct_cost_docs — παραστατικά (11 στήλες)
`id* · source* DKV/DADI/STANDALONE/MANUAL · entity VERMION_FRESH/EUROFRESH ·
invoice_no · period_from/to · total_gross (reconciliation guard) ·
status* draft→confirmed · file_url · created_by* · created_at*`

### ct_cost_lines — γραμμές κόστους + fuel ledger (17 στήλες)
`id* · doc_id → docs (null=χειροκίνητο) · rt_id → RT (null=ακατανέμητο) ·
category* (14 τιμές: fuel, reefer_fuel, tolls, dkv, adblue, driver_pay,
cash_m, spedition, accommodation, ferry_train, fines, partner_rate,
fixed_alloc, other) · toll_country · net* / vat* ΧΩΡΙΣΤΑ · line_date ·
plate_raw · truck_id · km_reading · liters · station ·
alloc_status* allocated/unallocated/review · note · created_by* · created_at*`

### ct_plate_aliases — πινακίδες (2 στήλες)
`alias* PK (normalized) · truck_id* → trucks`

## Views (5) — υπολογισμοί, τίποτα αποθηκευμένο

| View | Επιστρέφει | Λογική |
|---|---|---|
| **ct_v_rt_pnl** (19 στήλες) | revenue, cost_net/vat/gross, profit_worst, profit_ex_vat, **margin_worst_pct** (ΜΕ ΦΠΑ, primary), margin_ex_vat_pct | ανά RT, χωρίς cancelled |
| ct_v_rt_revenue | rt_id, revenue | Σ legs: διεθνές VS → price − X· εθνικός VS feeder → +X· non-VS εθνικά → 0 (TODO Φ2) |
| ct_v_rt_costs | rt_id, lines_net, vat, wear | wear = €/km × total_km (μόνο OWNED) |
| ct_v_wear_rate | truck_id, eur_per_km | 12μηνο maint ÷ km· fallback 0.082 (τώρα: fallback για όλα — επιβεβαιωμένο) |
| ct_v_consumption | truck_id, month, liters, km | μόνο category='fuel' (όχι reefer) |

## Επαλήθευση που έτρεξε

- `ct_settings` → 5 σωστές γραμμές ✅
- `ct_v_rt_pnl` → `[]` (κανένα RT ακόμα) ✅
- `ct_v_wear_rate` → 0.082 fallback ανά φορτηγό ✅

## Εκκρεμεί για το κλείσιμο της Φ1 backend

Deploy του Worker με τα `/costs/*` routes (ο κώδικας στο repo, commit a898c2a).
