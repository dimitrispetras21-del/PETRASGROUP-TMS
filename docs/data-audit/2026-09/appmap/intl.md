# Διεθνείς παραγγελίες — κόμβοι/ακμές (read-only, 7/9/2026)

Πίνακες: `orders` (130 ζωντανές/150), `order_stops` (401/445), `partner_assignments` (24/26).
Πρότυπο: `docs/data-audit/2026-09/2026-09-07-national-architecture*.md`.

## Οθόνες/πηγές
- **orders_intl.js** — φόρμα+λίστα. Save: `atSafePatch/atCreate(ORDERS)` (2044-2046) → `stopsSave` (2092-2094, γρ. `Status='Pending'` μόνο σε δημιουργία, 2042) → `_syncVeroiaSwitch` (2105) → `rtOnOrderSaved` (2098, κάθε save). Delete (`deleteIntlOrder`, 3008-3111): manual cascade NL/GL/CL/RAMP/STOPS/PA με μετρητή αποτυχιών `_delFail`, **surfaced** (toast+logError, 3102-3103) — καλή πρακτική. Κενό: δεν σβήνει τις στάσεις του NAT_LOADS που έφτιαξε το ίδιο το VS (parent = national_load_id, γρ. 1534) — μόνο τις δικές του (order_id, 3069-3076). partial.
- **weekly_intl.js** — ανάθεση φορτηγού/οδηγού/συνεργάτη μέσω popover (2812-2943): γράφει ORDERS (2866,2874) εκτός `syncOrderDownstream`, μετά `paUpsert/paDelete` (2907,2913) σε **try/catch με μόνο console.warn** ενώ το toast ήδη λέει επιτυχία (2917) — σιωπηλή αποτυχία. `_syncVeroiaSwitch` ξαναδεύτερη φορά εδώ (2929-2930, ΑΥΤΗ surfaced). Matching/split/rejoin καλούν `rtOnOrderSaved` απευθείας σε κάθε βήμα (2444,2900,3571-3572,3662,3725). `_wiClear` (unassign, 2979-3007) ΔΕΝ καλεί ποτέ RT feed — ένα υπάρχον round trip δεν ακυρώνεται όταν καθαρίζεται η ανάθεση. partial.
- **daily_ops.js** — μόνο διεθνείς (header comment γρ.3). Status→Delivered/In Transit: `_opsStatFinal/_opsDelFinal/_opsOvActFinal` (750-932) γράφουν ORDERS + καλούν `paSyncStatus` απευθείας (766,784-785, PA sync ok) αλλά **ποτέ `rtOnOrderSaved`**· μόνο `_opsOvActFinal` καλεί `syncOrderDownstream` (928-931) που έχει το RT-gate κλειδωμένο σε 'Pallet Exchange' (order-sync.js:87-91), όχι σε Status. Stop completion: `_opsMarkStop`→`atSafePatch(ORDER_STOPS)` (662-667). partial.

## Πίνακες
- **orders · 130** — χάρτης πλήρης (~97 labels, worker/src/index.js:1111-1219), `readView orders_with_derived` δίνει computed `Order No/Week Number/Total Pallets/Order ID` (1090-1105, read-only — μια «Total Pallets» write απορρίφθηκε σιωπηλά 7/9 07:48, 1 φορά, ακίνδυνο). 6 triggers ζωντανά (`order_leg_*`, `rt_sync_from_order`). CHECK μόνο σε leg-shape/plan-week — καμία σε status/direction. ok, με σημείωση Ε1.
- **order_stops · 401** — χάρτης καθαρός, links σε orders/national_orders/national_loads/locations/clients (1494-1500), FK RESTRICT και στους 3 γονείς — αλλά η ORDERS διαγραφή είναι πάντα soft (UPDATE deleted_at), άρα το RESTRICT δεν ενεργοποιείται ποτέ. 14 ζωντανές δείχνουν σε διαγραμμένα national_loads. partial (Ε3).
- **partner_assignments · 24** — links μόνο Partner+Order wired (1691-1694, το «Nat Load» της εθνικής πλευράς ΔΕΝ είναι, εκτός scope εδώ)· computed Client Revenue/Gross Profit/Margin Percent από `partner_assignments_computed` (1686-1690, hardcoded VS surcharge 850/650 — άλλη πηγή αλήθειας από `ct_setting('x_export')` του costs module). Καμία CHECK σε status, μηδέν triggers. Delete cascade ΔΕΝ το αγγίζει καθόλου. ok λειτουργικά σήμερα (0 ορφανά), δομικά εύθραυστο (Ε2).

## Ποιος το διαβάζει
- **Veroia Switch → national_loads** — `_syncVeroiaSwitch` (orders_intl.js:1279-1570), 3 σημεία κλήσης (save/popover/order-sync). 25/25 VS παραγγελίες έχουν ακριβώς 1 φορτίο. ok.
- **Ράμπα (via στάσεις)** — καμία ζωντανή γραμμή ramp έχει `order_id` (0/44, ίδιο εύρημα με το εθνικό Ε4). broken.
- **Τιμολόγηση** — φίλτρο `OR(Status=Delivered,Status=Invoiced,Invoiced=1)` (invoicing.js:297-313)· δικαίωμα accountant PATCH λύθηκε 3/9, σήμερα 2/130 invoiced=true. Ίδιο αρχείο μπορεί να γράψει `Status='Invoiced'` στο ORDERS (927-930) — αντίθετο με απόφαση owner, σήμερα 0/130 (λανθάνον). partial.
- **Dashboard/CEO** — διαβάζει ORDERS απευθείας για KPI (dashboard.js:69, ceo_dashboard.js:126,144,153-154). ok.
- **Μισθοδοσία/RT** — `core/rt-feed.js` γράφει `ct_round_trips`/`ct_rt_legs` μέσω `/costs/rt*`. 98/98 σκέλη έχουν order_id. Δουλεύει επειδή orders_intl.js και weekly_intl.js καλούν `rtOnOrderSaved` απευθείας σε κάθε save/ανάθεση/split — το Daily Ops όμως ποτέ. partial (Ε5).
- **Παλέτες** — `pl_movements.order_id/order_stop_id`, 94/95 εγγραφές δεμένες σε intl order/στάση. Ζωντανό, Φ1+Φ2 σε παραγωγή. ok.

## Ακμές (status · evidence)
- αποθήκευση: ok · orders_intl.js:2044-2046, 130 ζωντανές
- στάσεις: ok · core/stops-helpers.js:51-101
- διαγραφή cascade → PA: partial · orders_intl.js:3078-3087, DB RPC δεν το αγγίζει
- ανάθεση: ok · weekly_intl.js:2866-2879
- ανάθεση συνεργάτη: partial · weekly_intl.js:2907,2913,2917
- status ημέρας: ok · daily_ops.js:761,781
- ολοκλήρωση στάσης: ok · daily_ops.js:662-667
- VS→φορτίο: ok · orders_intl.js:1279-1570, 25/25
- ράμπα via στάσεις: broken · SQL ramp.order_id 0/44
- λίστα τιμολόγησης: partial · invoicing.js:297-313,927-930
- KPI: ok · dashboard.js:69, ceo_dashboard.js:126
- round trip feed: partial · core/rt-feed.js, daily_ops.js ποτέ δεν καλεί
- pallet feed: ok · pl_movements 94/95
- planned cost (PA→RT): partial · ct_v_rt_costs, read-time view μόνο, όχι trigger

## Βαρύτερα ευρήματα
1. **Κρίσιμο** — Το cascade-delete της παραγγελίας ελέγχει δικαίωμα `PATCH`, όχι `DELETE` (worker/src/index.js:2658). Dispatcher/management/accountant έχουν PATCH στο `orders` αλλά όχι DELETE (PERMISSIONS γρ.461/384/451) — άρα μπορούν να διαγράψουν cascade ΚΑΘΕ παραγγελία, όχι μόνο split-leg, αχρηστεύοντας το `authorizeScopedDelete` που έπρεπε να το εμποδίζει (σχόλιο 2606-2608: «Deleting a customer order stays owner-only»).
2. **Υψηλό** — Η SQL function `delete_order_cascade` δεν αναφέρει καθόλου `partner_assignments`. Η μόνη προστασία είναι το χειροκίνητο βήμα στο JS (orders_intl.js:3078-3087). Σήμερα 0 ορφανά PA, αλλά δύο ανεξάρτητα μονοπάτια κάνουν την ίδια δουλειά σε κάθε διαγραφή — ό,τι σβήνει το ένα και ξεχνά το άλλο περνάει απαρατήρητο.
3. **Υψηλό** — Καμία από τις δύο διαδρομές διαγραφής δεν καθαρίζει τις στάσεις που ανήκουν σε NAT_LOADS δημιουργημένα από το VS (parent = national_load_id). 14 ζωντανές order_stops δείχνουν σε διαγραμμένα φορτία σήμερα.
4. **Μεσαίο** — Weekly Intl popover: αποτυχία εγγραφής partner_assignments είναι σιωπηλή· ο χρήστης βλέπει «Αποθηκεύτηκε ✓» ό,τι κι αν έγινε (weekly_intl.js:2907,2913,2917).
5. **Μεσαίο** — Daily Ops αλλάζει Status σε Delivered/In Transit χωρίς ποτέ να ταΐζει το Roundtrip/Μισθοδοσία· ο trigger `rt_sync_from_order` κρατά ενήμερο μόνο ένα ήδη υπάρχον round trip, δεν το δημιουργεί ούτε το κλείνει.
6. **Μεσαίο** — invoicing.js μπορεί να γράψει `Status='Invoiced'` και στο ORDERS (όχι μόνο national_orders), αντίθετα με την κλειδωμένη απόφαση owner 23/8. Λανθάνον: 0/130 σήμερα.

## Ερωτήσεις owner
1. Το cascade-delete να ελέγχει `DELETE` (όχι `PATCH`) ή μένει σκόπιμα έτσι επειδή «δεν είναι πραγματικό delete, είναι soft cascade»;
2. Το `delete_order_cascade` παίρνει βήμα για partner_assignments (ώστε να μην εξαρτόμαστε μόνο από το JS) — προχωράμε σε migration;
3. Ίδιο θέμα με το εθνικό Ε3: οι στάσεις πάνω σε NAT_LOADS από VS καθαρίζονται στην ίδια διόρθωση;
4. Το Daily Ops να καλεί `rtOnOrderSaved` στα ίδια σημεία με το orders_intl.js/weekly_intl.js;
5. Αφαιρείται το `Status='Invoiced'` από το invoicing.js και για τις διεθνείς, πριν χρησιμοποιηθεί ποτέ;
