# SYNC MAP — ο χάρτης δεσμών του TMS

Owner 5/9/2026: «Το sync είναι απόλυτη βάση αυτής της εφαρμογής. Όλη η ομάδα
κρατούσε πάρα πολλά Excel και τώρα φτιάξαμε κάτι ομαδοποιημένο για να κερδίσουμε
χρόνο.» Άρα: μια αλλαγή που γίνεται μία φορά πρέπει να φτάνει παντού.

Αυτό το έγγραφο είναι το **συμβόλαιο** του συγχρονισμού. Κάθε δεσμός (edge)
απαντά σε τέσσερα πράγματα:

| | |
|---|---|
| **Γράφει** | ποια οθόνη/διαδρομή αλλάζει την πηγή |
| **Διαβάζει** | ποιος εξαρτάται από το παράγωγο |
| **Κανόνας** | πού ζει: `DB` (trigger/FK — πιάνει κάθε δρόμο) · `Worker` · `οθόνη` (πιάνει μία διαδρομή) · `—` (πουθενά) |
| **Απόκλιση** | SQL μόνο ανάγνωσης που μετρά πόσες εγγραφές διαφωνούν **τώρα** |

Ετυμηγορία ανά δεσμό (αρχή 4 — ο κανόνας μπαίνει όσο πιο χαμηλά αντέχει):

- 🟢 **πράσινο** — απόκλιση 0 **και** κανόνας στη βάση
- 🟡 **κίτρινο** — απόκλιση 0 αλλά ο κανόνας ζει σε μία οθόνη· θα σπάσει από άλλη διαδρομή
- 🔴 **κόκκινο** — απόκλιση > 0 τώρα
- ⚪ **εκτός** — απόφαση owner να μείνει ως έχει (καταγράφεται ο λόγος)

Τα ερωτήματα τρέχουν (α) στο audit (agents, μόνο ανάγνωση), (β) αργότερα ως
νυχτερινός έλεγχος `tools/drift-check` — «αν ξεσυγχρονιστεί, πώς θα το μάθω;».

Κάθε ερώτημα επιστρέφει **έναν αριθμό** (`drift`) και έως 3 δείγματα (`sample`).

---

## E1 · Παραγγελία ↔ Roundtrip (όχημα, οδηγός, συνεργάτης, ημερομηνίες)

Γράφει: φόρμα παραγγελίας, Weekly International (ανάθεση/ταίριασμα), Daily Ops.
Διαβάζει: μισθοδοσία, καρτέλα οδηγού/φορτηγού, Trip PnL.
Κανόνας: **DB** — triggers `rt_sync_from_order`, `rt_sync_to_orders`, `rt_sync_legs` (013).

```sql
with x as (
  select r.id, r.driver_id, r.truck_id, r.trailer_id, r.partner_id, r.trip_type, r.date_start, r.date_end,
         o.id order_id, o.driver_id o_driver, o.truck_id o_truck, o.trailer_id o_trailer, o.partner_id o_partner,
         coalesce(o.is_partner_trip,false) o_partner_trip,
         o.loading_datetime::date load_d, coalesce(o.actual_delivery_date, o.delivery_datetime::date) deliv_d
  from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id join orders o on o.id = l.order_id
  where r.status <> 'cancelled' and o.deleted_at is null)
select (select count(*) from x where o_driver is distinct from driver_id or o_truck is distinct from truck_id
          or o_trailer is distinct from trailer_id or o_partner is distinct from partner_id
          or o_partner_trip <> (trip_type = 'PARTNER'))
     + (select count(*) from (select id, date_start, date_end, min(load_d) mn, max(deliv_d) mx from x group by 1,2,3) y
          where date_start <> mn or date_end is distinct from greatest(mx, mn)) as drift,
       (select array_agg(order_id) from (select order_id from x where o_driver is distinct from driver_id or o_truck is distinct from truck_id limit 3) s) as sample;
```

## E2 · Roundtrip → Καρτέλα οδηγού (dl_entries)

Γράφει: ό,τι αλλάζει το RT (E1, Weekly, `/costs/rt`). Διαβάζει: μισθοδοσία.
Κανόνας: **DB** — trigger `dl_sync_from_rt` (011).

```sql
with live as (select e.* from dl_entries e where e.entry_type = 'trip' and e.deleted_at is null and e.rt_id is not null)
select (select count(*) from live e join ct_round_trips r on r.id = e.rt_id
          where r.status = 'cancelled' or e.driver_id is distinct from r.driver_id
             or e.entry_date <> r.date_start or e.date_end is distinct from r.date_end)
     + (select count(*) from ct_round_trips r where r.status <> 'cancelled' and r.trip_type = 'OWNED' and r.driver_id is not null
          and not exists (select 1 from live e where e.rt_id = r.id)) as drift,
       (select array_agg(code) from (select r.code from ct_round_trips r where r.status <> 'cancelled' and r.trip_type = 'OWNED'
          and r.driver_id is not null and not exists (select 1 from live e where e.rt_id = r.id) limit 3) s) as sample;
```

## E3 · Εξαγωγή ↔ Εισαγωγή (ταίριασμα)

`orders.matched_import_id` είναι **κείμενο** (`rec…` → `orders.legacy_id`), χωρίς FK.
Γράφει: Weekly International (ταίριασμα / ξε-ταίριασμα / νέα εισαγωγή από κενό).
Διαβάζει: Weekly, roundtrip feed, μισθοδοσία (μέσω RT).
Κανόνας: **οθόνη** (`_wiSaveImportMatch`) + Worker για το RT (N1). Δεν υπάρχει FK.

```sql
with m as (
  select e.id exp_id, e.matched_import_id mid, i.id imp_id, i.deleted_at imp_deleted, i.direction imp_dir
  from orders e left join orders i on i.legacy_id = e.matched_import_id
  where e.deleted_at is null and e.matched_import_id is not null)
select (select count(*) from m where imp_id is null or imp_deleted is not null or imp_dir <> 'Import')
     + (select count(*) from m where imp_id is not null and imp_deleted is null
          and not exists (select 1 from ct_rt_legs a join ct_rt_legs b on a.rt_id = b.rt_id
                          join ct_round_trips r on r.id = a.rt_id and r.status <> 'cancelled'
                          where a.order_id = m.exp_id and b.order_id = m.imp_id))
     + (select count(*) from (select matched_import_id from orders where deleted_at is null and matched_import_id is not null
          group by 1 having count(*) > 1
             -- two exports on one import are legitimate only as one groupage RT (N0, 5/9)
             and count(distinct (select l.rt_id from ct_rt_legs l where l.order_id = orders.id limit 1)) > 1) d) as drift,
       (select array_agg(exp_id) from (select exp_id from m where imp_id is null or imp_deleted is not null limit 3) s) as sample;
```

## E4 · Παραγγελία (Veroia Switch) → Εθνικό φορτίο (national_loads)

Γράφει: φόρμα διεθνούς παραγγελίας (δημιουργεί NL), `syncOrderDownstream` (patch).
Διαβάζει: Weekly National, Daily Ops, ράμπα, εθνικός μεταφορέας στο Weekly Intl.
Κανόνας: **οθόνη** (`core/order-sync.js` §2, μόνο όταν καλείται με VS ενεργό).

```sql
with vs as (select o.* from orders o where o.deleted_at is null and o.veroia_switch = true),
     nl as (select n.* from national_loads n where n.deleted_at is null and n.source_order_id is not null)
select (select count(*) from vs where not exists (select 1 from nl where nl.source_order_id = vs.id))
     + (select count(*) from nl join orders o on o.id = nl.source_order_id where o.deleted_at is not null or o.veroia_switch is distinct from true)
     + (select count(*) from nl join vs on vs.id = nl.source_order_id
          where (vs.status = 'Cancelled') <> (nl.status = 'Cancelled')
             or nl.loading_datetime::date <> vs.loading_datetime::date and nl.delivery_datetime::date <> vs.delivery_datetime::date) as drift,
       (select array_agg(id) from (select id from vs where not exists (select 1 from nl where nl.source_order_id = vs.id) limit 3) s) as sample;
```

## E5 · Παραγγελία (National Groupage) → Γραμμές groupage (groupage_lines)

Μία γραμμή ανά στάση· `Unassigned/Assigned`· **ποτέ** διαγραφή (FK RESTRICT).
Γράφει: φόρμα παραγγελίας, Weekly National. Διαβάζει: Weekly National (drag & drop).
Κανόνας: **οθόνη** (`order-sync.js` §3) + **DB** μόνο για τη μη-διαγραφή.

```sql
select (select count(*) from groupage_lines g where g.deleted_at is null
          and ((g.order_id is not null and exists (select 1 from orders o where o.id = g.order_id and o.deleted_at is not null))
            or (g.national_order_id is not null and exists (select 1 from national_orders o where o.id = g.national_order_id and o.deleted_at is not null))))
     + (select count(*) from groupage_lines g where g.deleted_at is null
          and ((g.status = 'Assigned' and g.cons_load_id is null) or (g.status = 'Unassigned' and g.cons_load_id is not null)))
     + (select count(*) from orders o where o.deleted_at is null and o.national_groupage = true
          and not exists (select 1 from groupage_lines g where g.order_id = o.id and g.deleted_at is null)) as drift,
       (select array_agg(id) from (select id from groupage_lines g where g.deleted_at is null
          and g.status = 'Assigned' and g.cons_load_id is null limit 3) s) as sample;
```

## E6 · Γραμμές groupage → Ενοποιημένο φορτίο → Εθνικό φορτίο

`consolidated_loads` (1 ανά φορτηγό) → `national_loads.source_cons_load_id` (στήλη ΑΝΟΔΟΣ).
Γράφει: Weekly National. Διαβάζει: Weekly National, Daily Ops, ράμπα.
Κανόνας: **οθόνη** (weekly_natl). FK χωρίς κανόνα διαγραφής.

```sql
with cl as (select * from consolidated_loads where deleted_at is null),
     nl as (select * from national_loads where deleted_at is null and source_cons_load_id is not null)
select (select count(*) from cl where not exists (select 1 from nl where nl.source_cons_load_id = cl.id)
          and exists (select 1 from groupage_lines g where g.cons_load_id = cl.id and g.deleted_at is null))
     + (select count(*) from nl join consolidated_loads c on c.id = nl.source_cons_load_id where c.deleted_at is not null)
     + (select count(*) from nl join cl on cl.id = nl.source_cons_load_id
          where nl.truck_id is distinct from cl.truck_id or nl.driver_id is distinct from cl.driver_id or nl.partner_id is distinct from cl.partner_id) as drift,
       (select array_agg(id) from (select cl.id from cl where not exists (select 1 from nl where nl.source_cons_load_id = cl.id)
          and exists (select 1 from groupage_lines g where g.cons_load_id = cl.id and g.deleted_at is null) limit 3) s) as sample;
```

## E7 · Παραγγελία: στάσεις (order_stops) ↔ επίπεδες στήλες (loading_location_N)

Δύο πηγές αλήθειας για την ίδια πληροφορία (αρχή 3). Γράφει: φόρμα παραγγελίας
(και τα δύο). Διαβάζει: εκτύπωση (stops), Weekly (flat), views RT (flat).
Κανόνας: **οθόνη** (`stops-helpers.js`).

```sql
with flat as (
  select o.id,
         (select count(*) from (values (o.loading_location_1_id),(o.loading_location_2_id),(o.loading_location_3_id),(o.loading_location_4_id),(o.loading_location_5_id),
                                       (o.loading_location_6_id),(o.loading_location_7_id),(o.loading_location_8_id),(o.loading_location_9_id),(o.loading_location_10_id),
                                       (o.unloading_location_1_id),(o.unloading_location_2_id),(o.unloading_location_3_id),(o.unloading_location_4_id),(o.unloading_location_5_id),
                                       (o.unloading_location_6_id),(o.unloading_location_7_id),(o.unloading_location_8_id),(o.unloading_location_9_id),(o.unloading_location_10_id),
                                       (o.veroia_crossdock_id)) v(x) where x is not null) n_flat,
         -- the Cross-dock stop is the flat column veroia_crossdock_id (measured 5/9: 25 false positives without it)
         (select count(*) from order_stops s where s.order_id = o.id and s.deleted_at is null) n_stops
  from orders o where o.deleted_at is null and o.created_at >= '2026-08-01')
select count(*) filter (where n_stops > 0 and n_stops <> n_flat) as drift,
       (select array_agg(id) from (select id from flat where n_stops > 0 and n_stops <> n_flat limit 3) s) as sample,
       count(*) filter (where n_stops = 0) as orders_without_stops_rows
from flat;
```

## E8 · Παραγγελία → Ανάθεση συνεργάτη (partner_assignments)

Γράφει: φόρμα/Weekly (`pa-helpers.js`), `syncOrderDownstream` §1 (status).
Διαβάζει: Weekly, Daily Ops (κάρτες συνεργάτη), κοστολόγηση.
Κανόνας: **οθόνη**.

```sql
with pa as (select * from partner_assignments where deleted_at is null and order_id is not null)
select (select count(*) from pa join orders o on o.id = pa.order_id where o.deleted_at is not null)
     + (select count(*) from pa join orders o on o.id = pa.order_id where coalesce(o.is_partner_trip,false) = false or o.partner_id is distinct from pa.partner_id)
     + (select count(*) from orders o where o.deleted_at is null and o.is_partner_trip = true and o.partner_id is not null
          and o.status not in ('Cancelled') and not exists (select 1 from pa where pa.order_id = o.id)) as drift,
       (select array_agg(id) from (select o.id from orders o where o.deleted_at is null and o.is_partner_trip = true and o.partner_id is not null
          and not exists (select 1 from pa where pa.order_id = o.id) limit 3) s) as sample;
```

## E9 · Παραγγελία ↔ Ράμπα (ramp) — ⚪ εκτός (owner 5/9: «ας αφήσουμε τελείως τη ράμπα»)

`ramp.order_id / national_order_id / trip_id` **χωρίς FK**· 0/30 συνδεδεμένα (24/8).
Μετριέται για το αρχείο, δεν διορθώνεται τώρα.

```sql
select count(*) filter (where order_id is null and national_order_id is null) as drift,
       count(*) as total from ramp where deleted_at is null;
```

## E10 · Παραγγελία (Pallet Exchange) → Κινήσεις παλετών (pl_movements)

Γράφει: φόρμα/Weekly μέσω `core/pallet-feed.js` (`syncOrderDownstream` §5).
Διαβάζει: Ισοζύγιο παλετών, πύλη Invoiced/PnL. Κανόνας: **οθόνη**· FK `ON DELETE SET NULL`.

```sql
select (select count(*) from orders o where o.deleted_at is null and o.pallet_exchange = true and o.status <> 'Cancelled'
          and not exists (select 1 from pl_movements m where m.order_id = o.id))
     + (select count(*) from pl_movements m join orders o on o.id = m.order_id
          where (o.deleted_at is not null or o.pallet_exchange is distinct from true) and m.status = 'pending') as drift,
       (select array_agg(id) from (select o.id from orders o where o.deleted_at is null and o.pallet_exchange = true and o.status <> 'Cancelled'
          and not exists (select 1 from pl_movements m where m.order_id = o.id) limit 3) s) as sample;
```

## E11 · Κατάσταση: Παραγγελία ↔ Εθνικό φορτίο ↔ Roundtrip

Ενιαίο λεξιλόγιο `Pending → Assigned → In Transit → Delivered` + `Cancelled`.
Κανόνας: **οθόνη** (`order-sync.js` §1-2). RT: `planned/in_progress/closed/complete`.

```sql
select (select count(*) from orders o where o.deleted_at is null and (o.status not in ('Pending','Assigned','In Transit','Delivered','Cancelled') or o.status is null))
     + (select count(*) from orders o where o.deleted_at is null and o.status = 'Pending' and (o.truck_id is not null or o.partner_id is not null))
     + (select count(*) from orders o where o.deleted_at is null and o.status in ('Assigned','In Transit') and o.truck_id is null and o.partner_id is null)
     + (select count(*) from ct_round_trips r where r.status in ('closed','complete')
          and exists (select 1 from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = r.id and o.deleted_at is null and o.status not in ('Delivered','Cancelled'))) as drift,
       (select array_agg(id) from (select id from orders o where o.deleted_at is null and o.status in ('Assigned','In Transit') and o.truck_id is null and o.partner_id is null limit 3) s) as sample,
       (select count(*) from orders where deleted_at is null and status is null) as status_null;
```

## E12 · Εθνικό φορτίο ↔ Roundtrip (σκέλη εθνικών) — N4

Κανόνας: **—** (κανένα NATL RT, 0 σκέλη με `nat_load_id` στις 5/9).

```sql
select count(*) as drift, (select array_agg(id) from (select id from national_loads n where n.deleted_at is null and n.truck_id is not null
          and coalesce(n.is_partner_trip,false) = false and n.loading_datetime >= '2026-08-01'
          and not exists (select 1 from ct_rt_legs l where l.nat_load_id = n.id) limit 3) s) as sample
from national_loads n where n.deleted_at is null and n.truck_id is not null and coalesce(n.is_partner_trip,false) = false
  and n.loading_datetime >= '2026-08-01' and not exists (select 1 from ct_rt_legs l where l.nat_load_id = n.id);
```

## E13 · Καύσιμα → Roundtrip (fuel.trip_id) και Στόλος

`fuel.trip_id` bigint **χωρίς FK**. Κανόνας: **—**.

```sql
select count(*) filter (where trip_id is not null and not exists (select 1 from ct_round_trips r where r.id = f.trip_id)) as drift,
       count(*) filter (where trip_id is null) as fuel_without_trip, count(*) as total
from fuel f where f.deleted_at is null;
```

## E14 · Ρόστερ χρηστών: βάση ↔ index.html/config.js (αρχή 3, τρεις λίστες)

Μετριέται από τον κώδικα, όχι από SQL: `USERS` σε `config.js` και `index.html`
πρέπει να έχουν τα ίδια usernames/roles με τους λογαριασμούς της βάσης.

```sql
select string_agg(username || ':' || role, ', ' order by username) as db_users from users where active;  -- table is `users` (5/9)
```

---

## Πίνακας ετυμηγοριών

Συμπληρώνεται από το audit (βλ. `docs/data-audit/2026-09/2026-09-05-sync-audit.md`).

| Δεσμός | Κανόνας | Απόκλιση 5/9 | Ετυμηγορία | Επόμενο βήμα |
|---|---|---|---|---|
| E1 παραγγελία↔RT | DB (013) | 0 | 🟢 | νυχτερινός έλεγχος |
| E2 RT→μισθοδοσία | DB (011) | 0 | 🟢 | νυχτερινός έλεγχος |
| E3 ταίριασμα exp↔imp | οθόνη + Worker | 0 (1 ψευδές: groupage) | 🟡 | FK/έλεγχος στη βάση όταν το `matched_import_id` γίνει bigint |
| E4 VS→εθνικό φορτίο | οθόνη | 1 (NL 57: Pending ενώ η παραγγελία Delivered) | 🔴 | απόφαση owner: το NL ακολουθεί την κατάσταση της παραγγελίας; → trigger |
| E5 groupage lines | οθόνη + RESTRICT | 0 | 🟡 | trigger «1 γραμμή ανά στάση» αργότερα |
| E6 CL→NL | οθόνη | 0 | 🟡 | trigger vehicle CL→NL αργότερα |
| E7 στάσεις↔στήλες | οθόνη | 0 (25 ψευδή: Cross-dock) | 🟡 | μακροπρόθεσμα μία πηγή (αρχή 3) |
| E8 ανάθεση συνεργάτη | οθόνη | 0 | 🟡 | — |
| E9 ράμπα | — | 40/40 ασύνδετα | ⚪ | owner: ράμπα αργότερα |
| E10 παλέτες | οθόνη | **9** παραγγελίες Delivered με PE χωρίς κίνηση | 🔴 | trigger «PE → εκκρεμής κίνηση» (πλαίσιο παλετών, Αλεξία)· backfill |
| E11 κατάσταση | οθόνη | **8** (5 NULL · 2 In Transit χωρίς όχημα · RT-1019 κλειστό/274 In Transit) | 🔴 | **014**: NOT NULL DEFAULT 'Pending' + CHECK λεξιλογίου· backfill 5 |
| E12 NL↔RT | — | 2 | 🔴 γνωστό | N4 |
| E13 καύσιμα | — | πίνακας άδειος | ⚫ μη μετρήσιμο | Fuel Receipts UI |
| E14 ρόστερ χρηστών | — | 6 (alexia ανενεργή στη βάση + 5 demo_*) | 🔴 | αφαίρεση demo_* από config.js/index.html· alexia ενεργοποίηση όταν ξεκινήσει |
