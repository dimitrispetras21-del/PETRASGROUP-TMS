# Αλλαγή ημερομηνίας παραγγελίας: μία διαδρομή για όλους τους πίνακες (spec, 7/9/2026)

Owner 7/9: «όταν αλλάζουμε την ημερομηνία από το weekly, πρέπει αρχικά να ενημερώνεται το order και μετά να τρέχουν όλες οι υπόλοιπες
διαδικασίες». Αφορμή: παραγγελία 281 (Λάβδας, εισαγωγή Veroia Switch) παράδοση 7/9→9/9 από το Weekly Intl στις 16:39· το φορτίο 82
έμεινε 6/9→7/9, οι στάσεις έμειναν 7/9. Σήμερα η ημερομηνία αλλάζει από **τρία** σημεία (φόρμα, Weekly Intl, Ημερήσιο Πλάνο) και
κάθε σημείο θυμάται διαφορετικό υποσύνολο των εξαρτώμενων πινάκων.

## Τι ισχύει σήμερα (μετρημένο 7/9 17:30)
| Πίνακας | Ποιος τον ενημερώνει στην αλλαγή ημερομηνίας | Κατάσταση |
|---|---|---|
| `orders` | και τα τρία σημεία | ✅ |
| `national_loads` (VS) | μόνο μέσω `syncOrderDownstream` → `_syncVeroiaSwitch` (JS)· Weekly δεν το καλούσε ως 17:05 | 🟡 και ξαναγράφει `status='Pending'` (3 φορτία σήμερα Assigned θα γύριζαν πίσω) |
| `order_stops` | **κανείς** | 🔴 14 διεθνείς παραγγελίες με στάση #1 σε άλλη μέρα από την παραγγελία |
| `ramp` | `_rampAutoSync` δημιουργεί για ΣΗΜΕΡΑ· δεν μετακινεί | 🟡 22 γραμμές με κλειδί `STOP:` |
| `ct_round_trips` (παράθυρο) | trigger `rt_sync_from_order` → `rt_recompute` (βάση) | ✅ πιθανό — επαληθεύεται στο T-proof |
| `orders.cross_dock_date` | κανείς στην αλλαγή | 🟡 μένει η παλιά |

## Αρχή
Ο κανόνας μπαίνει **στη βάση** (trigger στο `orders`), όχι σε τρεις οθόνες: όποιος κι αν γράψει `loading_datetime`/`delivery_datetime`
(οθόνη, Worker, SQL, άλλο repo), τα παιδιά ακολουθούν. Το JS παύει να ξαναγράφει ό,τι δεν του ανήκει (κατάσταση φορτίου).

## Α. Βάση — `worker/migrations/023_order_date_propagation.sql` (ΔΕΝ εκτελείται από το πλάνο)
Trigger `trg_order_dates_propagate` AFTER UPDATE OF `loading_datetime, delivery_datetime` ON `orders` FOR EACH ROW WHEN
(OLD.loading_datetime IS DISTINCT FROM NEW.loading_datetime OR OLD.delivery_datetime IS DISTINCT FROM NEW.delivery_datetime)
AND NEW.deleted_at IS NULL AND NEW.order_type='International'. Συνάρτηση `order_dates_propagate()`:
1. `dl := NEW.loading_datetime::date - OLD.loading_datetime::date`, `dd := NEW.delivery_datetime::date - OLD.delivery_datetime::date`.
2. **Στάσεις** (`order_stops` του order, `deleted_at is null`): `stop_type='Loading'` → `datetime := datetime + dl`· `Unloading` → `+ dd`·
   `Cross-dock` → θέτεται στη νέα cross-dock ημερομηνία (βήμα 3). Μετακίνηση κατά δέλτα κρατά τις αποστάσεις πολυήμερων στάσεων.
3. **Cross-dock**: αν `veroia_switch`: `cross_dock_date := case direction when 'Export' then NEW.loading::date + 1 else NEW.delivery::date - 1 end`
   (κανόνας Architecture v2 / CLAUDE.md). Γράφεται στο ίδιο row (BEFORE-part ή δεύτερο update με guard κατά αναδρομής).
4. **Φορτίο Veroia Switch** (`national_loads where source_order_id = NEW.id and deleted_at is null`): `loading_datetime`/`delivery_datetime`
   κατά τον ίδιο κανόνα (Export: load = order loading, deliv = loading+1· Import: deliv = order delivery, load = delivery−1).
   **ΔΕΝ** αγγίζει `status`, `truck_id`, `driver_id`, `partner_id`.
5. **Ράμπα**: `ramp` rows με `order_id = NEW.id` ή `notes like 'STOP:'||<legacy των στάσεων του order>` και `status <> 'Done'`:
   `plan_date := plan_date + (dl ή dd κατά τον τύπο της στάσης)`. Γραμμές `Done` δεν μετακινούνται (έγιναν).
6. Roundtrip: τίποτα εδώ· ο υπάρχων `rt_sync_from_order` ήδη πυροδοτείται στις ίδιες στήλες και καλεί `rt_recompute`.
   T-proof: `date_start/date_end` του RT της 281 μετά την αλλαγή.
7. Audit: `perform rt_sync_audit('update','order_stops', …)` ανά πίνακα που άγγιξε (υπάρχουσα συνάρτηση), ώστε να φαίνεται στο audit_log.
Ίδιος trigger, μικρότερος, στο `national_orders` (`loading_datetime, delivery_datetime`): μετακινεί τις στάσεις του και το φορτίο του
(`national_loads.source_national_order_id`) 1-προς-1.

## Β. Front end (μετά τη migration)
- `modules/orders_intl.js` `_syncVeroiaSwitch`: στο **update** υπάρχοντος φορτίου αφαιρούνται από το payload `Status` (και ό,τι άλλο ανήκει
  στην ανάθεση). Στη **δημιουργία** μένει `Status:'Pending'`. Οι ημερομηνίες μπορούν να μείνουν (ίδιο αποτέλεσμα με τον trigger, idempotent).
- Καμία αλλαγή στα τρία σημεία εγγραφής: γράφουν την παραγγελία, ο trigger κάνει τα υπόλοιπα. Το `syncOrderDownstream` μένει για
  status/ράμπα-δημιουργία/παλέτες.

## Γ. Backfill (απόφαση owner, όχι αυτόματα)
Οι 14 παραγγελίες με στάση #1 σε άλλη μέρα από την παραγγελία: λίστα με παραγγελία, στάση, δύο ημερομηνίες → ο owner λέει ποιες
ευθυγραμμίζονται στην παραγγελία. Η 281 (Λάβδας) ευθυγραμμίζεται σίγουρα (εκφόρτωση 7/9 → 9/9, φορτίο 8/9→9/9).

## Δ. Απόδειξη
1. Λάβδας: αλλαγή παράδοσης από το Weekly → `order_stops` Unloading#1 = νέα μέρα, `national_loads` 82 = (νέα−1, νέα), `cross_dock_date` =
   νέα−1, ramp Planned μετακινήθηκε, RT `date_end` = νέα, `status` του φορτίου ΑΜΕΤΑΒΛΗΤΟ. Ίδιο από το Ημερήσιο Πλάνο και από τη φόρμα.
2. Εξαγωγή VS: αλλαγή φόρτωσης → φορτίο (φόρτωση, φόρτωση+1), Loading στάσεις +δέλτα, Unloading αμετάβλητες.
3. Παραγγελία χωρίς VS: μόνο στάσεις (+ RT παράθυρο).
4. `select count(*)` στάσεις #1 ≠ παραγγελία = 0 μετά το backfill που θα εγκρίνει ο owner.

## Πλάνο
T1 (Sonnet): §Α αρχείο migration + unit test της συνάρτησης σε SQL σχόλια (σενάρια import/export)· T2 (Sonnet): §Β· review· T3: migration
(owner) → §Δ αποδείξεις· Γ λίστα στον owner. Εκτός: αλλαγή ημερομηνίας από την οθόνη Weekly National προς τη διεθνή (αντίστροφη ροή —
δεν υπάρχει και δεν σχεδιάζεται τώρα).
