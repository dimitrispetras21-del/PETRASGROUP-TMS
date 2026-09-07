# Κόστος δρομολογίων & Μισθοδοσία — κόμβοι/ακμές (7/9/2026, μόνο ανάγνωση)

Πηγές: modules/costs.js, modules/payroll.js, core/rt-feed.js, worker/src/index.js (handleCosts γρ.2738-3119,
COSTS_PERMS γρ.2721-2733), migrations 011/012/013/021, docs/TRIP_COSTS_SPEC.md, docs/COSTS_ARCHITECTURE.md,
docs/data-audit/2026-09/2026-09-05-driver-ledger-import.md, SQL μετρήσεις 7/9/2026.

## Οθόνες / πηγές
- **Weekly Διεθνών** (core/rt-feed.js `rtOnOrderSaved`, γρ.184-335) — όταν παραγγελία γίνεται In Transit/Delivered
  ΚΑΙ έχει ανάθεση, δημιουργεί/συγχρονίζει RT + σκέλη μέσω `POST /costs/rt` (idempotent attach, N1 5/9). **ok**:
  47 OWNED + 3 PARTNER RT, όλα source='planner'.
- **TRIP PnL — χειροκίνητο** (`ctOpenRtModal` costs.js:777, `ctOpenCostModal` costs.js:715) — κουμπιά «+ Νέο
  δρομολόγιο» και «+ Καταχώρηση κοστών» υπάρχουν στη σελίδα. **unused**: 0/50 RT με source='manual'· η μοναδική
  γραμμή στο ct_cost_lines είναι σημειωμένη «auto από Weekly», όχι χειροκίνητη.
- **Μισθοδοσία Οδηγών** (payroll.js: `dlQeSubmit` 471 δρομολόγιο, `dlSaveInlineEdit` 504 συμπλήρωση, `dlSavePayment`
  571 πληρωμή, `dlBulkSubmit` 724 μαζική) — γράφει `POST/PATCH /costs/ledger`. **partial**: δουλεύει, αλλά μόνο 3
  trip + 2 πληρωμές έχουν source='manual' από τις 11.127 γραμμές — η καρτέλα ζει σχεδόν αποκλειστικά από το Excel.
- **Εισαγωγή Excel** (`tools/ledger-import/`, όχι οθόνη app — script που τρέχει ο owner) — `POST
  /costs/ledger/import`, atomic ανά αρχείο. **ok**: 11.078 γραμμές σε 70 παρτίδες, 6/9/2026, απόδειξη υπόλοιπο
  βάση=σχέδιο 68/68.
- **Ρυθμίσεις RT** (`ctOpenSettings` costs.js:829, `PATCH /costs/settings` index.js:2764) — X export/import, pallet
  €, ΦΠΑ, wear fallback. **partial**: οι 5 τιμές είναι σωστές (seed 10/8: €850/€650…) αλλά καμία PATCH δεν
  εμφανίζεται στο audit_log — δεν προκύπτει ότι η φόρμα χρησιμοποιήθηκε ποτέ μετά το seed.
- **DKV/DADI σάρωση** — σχεδιασμένη (COSTS_ARCHITECTURE.md §4,§7 Φ3/Φ4), καμία γραμμή κώδικα. **unused**.

## Πίνακες
- `ct_round_trips`·50 — 47 OWNED+3 PARTNER, όλα scope INTL (0 NATL, βλ. εθνικό εύρημα Ε6 προηγούμενου circuit)·
  status: 2 cancelled, 40 closed, 8 planned· **ok** για το intl κομμάτι.
- `ct_rt_legs`·98 — 98/98 order_id (intl), 0 nat_load_id· μοναδικά index ανά order/nat_load εμποδίζουν διπλό RT
  για το ίδιο φορτίο· **ok**.
- `dl_entries`·11.127 — 6.605 trip (6.603 excel + 44 auto − 42 από αυτά με τιμή) + 4.473 πληρωμές (excel) + 119
  προσαρμογές (excel) + 5 manual (trip/πληρωμές, 3 ακυρωμένες). Τελευταία γραφή 6/9 08:46. **ok**.
- `dl_import_batches`·70 — unique(file_hash) εμποδίζει διπλή εισαγωγή του ίδιου αρχείου· **ok**.
- `ct_cost_lines`·1 + `ct_settings`·5 — η μία γραμμή κόστους είναι partner_rate €850 auto (RT-5)· τα settings
  σωστά αλλά αδοκίμαστα από UI· **partial**.
- `ct_cost_docs`·0, `ct_plate_aliases`·0, `fuel`·0 — ο αγωγός σάρωσης τιμολογίων δεν γεννήθηκε ποτέ· **unused**.

## Ποιος το διαβάζει
- **TRIP PnL** (costs.js `ctReload` 158-208) — `GET /costs/pnl,rt,lookups,pallet-gate,lines`, μόνο owner
  (κλειδωμένο 11/7/2026, ελέγχεται και στο front-end ROLE και στο Worker). **ok**.
- **Καρτέλα Οδηγού** (payroll.js `dlReloadBalances/dlReloadEntries`) — `dl_v_balance`, `dl_v_entries`. `dl_v_rt_gap`
  = 0 σήμερα (κάθε RT με οδηγό έχει ζωντανή γραμμή καρτέλας). **ok**.
- **Κάρτες Οδηγού/Φορτηγού/Ρυμούλκης** (core/entity.js `_loadEntityCardRT` 2257-2350, cardRt:true σε γρ.317,397,523)
  — `GET /costs/rt` φιλτραρισμένο. **partial**: ο ρόλος `management` ΔΕΝ έχει γραμμή `rt` στο COSTS_PERMS
  (index.js:2731 έχει μόνο lookups+ledger) → 403, καταγεγραμμένο στο app_errors 29/8 14:37 «Unauthorized».
- **CEO Dashboard** (ceo_dashboard.js:146) — διαβάζει `TABLES.TRIP_COSTS` (νεκρό Airtable id, ποτέ δεν
  μεταφέρθηκε). **broken**: `safeFetch` το καταπίνει, η κάρτα «ζημιογόνα δρομολόγια» μένει πάντα κενή χωρίς
  ένδειξη σφάλματος στον χρήστη· app_errors καταγράφει «Table not available on this backend» επανειλημμένα
  (25/8, 28/8, 29/8, 5/9) — ο κώδικας το ξέρει ήδη (σχόλιο «expected to fail») αλλά δεν έχει διορθωθεί να
  διαβάσει το `ct_v_rt_pnl` που υπάρχει από 10/8.
- **Γέφυρα φθοράς** `ct_v_wear_rate` και **Partner PnL** — το πρώτο view υπάρχει χωρίς καμία διαδρομή Worker ή
  module να το διαβάζει (grep: 0)· το δεύτερο δεν υπάρχει καν ως view στη βάση. **unused** και τα δύο. Η
  «Κατανάλωση» ως ξεχωριστή σελίδα (COSTS_ARCHITECTURE §10.3 IA) επίσης δεν χτίστηκε — μόνο costs.js+payroll.js
  υπάρχουν στο repo.

## Triggers βάσης (μία γραμμή/καθένα)
- `rt_sync_from_order` (orders→RT) — όταν αλλάζει οδηγός/φορτηγό/ρυμούλκα/συνεργάτης/ημερομηνίες/status/deleted_at
  σε μια παραγγελία με σκέλος RT, ενημερώνει το RT (και τα αδέλφια σκέλη) ή αφαιρεί το σκέλος αν η παραγγελία
  ακυρώθηκε/διαγράφηκε.
- `rt_sync_legs` (νέο/διαγραμμένο σκέλος→RT/orders) — πρώτο σκέλος δίνει στόλο στο κενό RT, ή το ήδη γεμάτο RT
  γράφει τον στόλο του πίσω στην καινούρια παραγγελία-σκέλος· recompute μετά από κάθε αλλαγή.
- `rt_sync_to_orders` (RT→orders) — αλλαγή στόλου/τύπου στο RT διαχέεται σε όλες τις ζωντανές παραγγελίες-σκέλη.
- `dl_sync_from_rt` (RT→καρτέλα) — RT νέο/OWNED/με οδηγό δημιουργεί αυτόματα μία γραμμή trip στην καρτέλα (τιμές
  NULL σκόπιμα)· RT που χάνει οδηγό/ακυρώνεται είτε σημαδεύει τη γραμμή needs_review (αν έχει ήδη ποσά) είτε την
  ακυρώνει (αν δεν έχει) — ποτέ σιωπηλή απώλεια.

## Ασυνέπειες / σιωπηλές απορρίψεις
1. Η «χειροκίνητη» μισή του σχεδιασμένου συστήματος (RT modal, cost modal, DKV/DADI, Partner PnL, Κατανάλωση,
   γέφυρα φθοράς) είναι ή αχρησιμοποίητη ή ανύπαρκτη — η ζωντανή διαδρομή είναι 100% ο αυτόματος feeder +
   Excel· καμία απόδειξη ότι η χειροκίνητη πλευρά έχει δοκιμαστεί ποτέ στην παραγωγή.
2. CEO Dashboard διαβάζει νεκρή στήλη (`TABLES.TRIP_COSTS`) αντί για το `ct_v_rt_pnl` που υπάρχει από 10/8 —
   το ίδιο πρόβλημα σχήματος «δύο πηγές αλήθειας» που προειδοποιεί το CLAUDE.md, εδώ ανάμεσα σε παλιό Airtable
   id και νέα Postgres view.
3. COSTS_PERMS δεν έχει `rt` για `management`, αν και ο ρόλος βλέπει κανονικά τις κάρτες Οδηγών/Φορτηγών όπου
   αυτό το endpoint καλείται — ασυμμετρία δικαιώματος/UI, όχι δικαιώματος/δεδομένων.
4. `ct_cost_lines` PATCH/DELETE (index.js:2941-2969) δέχονται μόνο ρητή λίστα πεδίων (`ctPick`) — ίδιο μοτίβο
   σιωπηλής απόρριψης άγνωστου πεδίου με τον γενικό facade (CLAUDE.md «μηχανισμός 1»), αλλά ΔΕΝ καταγράφεται στο
   `facade_unknown_fields` (αυτό ισχύει μόνο για τα TABLES-config endpoints, όχι τα χειρόγραφα /costs/* routes) —
   αν κάποιος ζητήσει άγνωστο πεδίο εδώ, δεν θα το μάθει κανείς.
5. «Καταχώριση αξίας δρομολογίου» παραμένει ανοιχτή διαδικασία: 13/44 auto-γραμμών RT είναι ακόμη χωρίς τιμή
   (δρομολόγια σε εξέλιξη ή μετά το τέλος του παραθύρου Excel) και δεν υπάρχει ρητή, ενεργή οθόνη-πηγή για το
   «ποιος καταχωρεί την αξία όταν κλείνει το δρομολόγιο» — το Excel ήταν εφάπαξ ιστορικό.

## Ερωτήσεις owner (≤5)
1. Ξαναγράφεται το CEO Dashboard (ceo_dashboard.js:146) να διαβάζει `ct_v_rt_pnl` αντί για το νεκρό
   `TABLES.TRIP_COSTS`;
2. Προστίθεται `rt: ["GET"]` στο `COSTS_PERMS.management` ώστε οι κάρτες Οδηγού/Φορτηγού να μη σπάνε με 403;
3. Η χειροκίνητη δημιουργία RT / καταχώρηση κόστους (Shape B/C) θα χρησιμοποιηθεί ποτέ, ή αχρησιμοποιείται από
   σχεδιασμό (ο,τι δεν καλύπτει ο auto-feeder μένει ασκόστολόγητο επίτηδες προς το παρόν);
4. Ποια είναι η πρόθεση για DKV/DADI/Partner PnL/Κατανάλωση/γέφυρα φθοράς — προχωρούν (Φ3-Φ5) ή παγώνουν επίσημα;
5. Ποια οθόνη/διαδικασία θα καταχωρεί την αξία δρομολογίου ΜΕΤΑ το one-off Excel — η γρήγορη καταχώρηση της
   Μισθοδοσίας είναι αρκετή, ή χρειάζεται ενεργοποίηση από το κλείσιμο του RT (dl_sync_from_rt ήδη δημιουργεί
   τη γραμμή, αλλά χωρίς τιμή);
