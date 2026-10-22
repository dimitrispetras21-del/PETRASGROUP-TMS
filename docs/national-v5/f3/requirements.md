# Φ3 · Εθνικά v5: απαιτήσεις (073 «χρήματα, διαδρομή, παλέτες, DKV» + Worker στην ίδια αλυσίδα)

> Εξαγωγή απαιτήσεων για το πλάνο Φ3, 23/10/2026 (νυχτερινή εκτέλεση, χωρίς δυνατότητα ερωτήσεων· κάθε αμφιβολία = επιλογή owner, ενότητα 6). Μόνο ανάγνωση: κανένα SQL εγγραφής, κανένα deploy, κανένα commit.
> Πηγές με σειρά ισχύος: (1) spec `docs/superpowers/specs/2026-10-21-national-v5-design.md` (§2, §3, §5 Ε6–Ε11/Ε21, §8, «Δικαιώματα»)· (2) `docs/DECISION_LOG.md` 21/10 και 22/10 (Εθνικά v5, Δικαιώματα, Τιμολόγηση)· (3) `CLAUDE.md` «ΚΛΕΙΔΩΜΕΝΕΣ ΑΠΟΦΑΣΕΙΣ OWNER»· (4) master `docs/superpowers/plans/2026-10-21-national-v5-master.md` Task Φ3· (5) F1 plan Interfaces· (6) F2 plan `docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md` Interfaces + αποφάσεις 1–34 (**προς έγκριση, όχι ακόμη εγκεκριμένες**)· (7) tech draft `docs/national-v5/tech-draft-2026-10-21.md` §Φ3 (μόνο όπου δεν το αλλάζει το spec §7)· (8) flows `docs/national-v5/flows-2026-10-21.md` ροές 12–13· (9) `docs/PALLETS_ARCHITECTURE.md` §3–§4 (κλειδωμένος πίνακας παλετών).
>
> Μορφή ταυτοτήτων: **R-xx** κοινός κανόνας · **F3-xx** απαίτηση ανά αλλαγή (Ε6–Ε11, Ε21, snapshot, έλεγχοι) · **I-xx** τι καταναλώνει από Φ1/Φ2 · **C-xx** επιλογή owner (💶 = απόφαση χρημάτων, **δεν** την παίρνει ο agent) · **K-xx** σύγκρουση με ζωντανό κώδικα ή με άλλη πηγή · **X-xx** εκτός Φ3.

---

## 0. Αφετηρία (μέτρηση SELECT 23/10/2026, project `gatejgbpyodlepkvqkgf`)

| Τι | Τιμή | Συνέπεια για τη Φ3 |
|---|---|---|
| 072 (Φ2) εκτελεσμένη; | **όχι** (`to_regprocedure('plan_board(date,text)')` = NULL) | Η Φ3 γράφεται πάνω στα Interfaces του πλάνου Φ2 (όχι στη βάση)· εκτέλεση 073 **μόνο μετά** την 072 και το deploy Φ2 (C-01). |
| Γραμμές v5 (`shipments+shipment_pieces+rt_stops+piece_legs+plan_notices`) / `model=2` / `pl_movements.piece_leg_id` | **0 / 0 / 0** | Κάθε νέος κλάδος δίνει 0 γραμμές· «snapshot πριν = μετά» αποδεικνύεται ακριβώς. |
| `ct_round_trips` | 202 (185 μη ακυρωμένα· status ∈ `cancelled, closed, planned`) | |
| `ct_settings` | `x_import 650`, `x_export 850`, `full_truck_pallets 33`, `pallet_eur 12`, `wear_fallback_eur_km 0.082`, `vat_default 0.24` | Η μία πηγή του X (αρχή 3). |
| `ct_round_trips.total_km` | **NULL σε 202/202** | Η φθορά είναι σήμερα **0 σε κάθε RT** (`ct_v_rt_costs`: `total_km IS NOT NULL` αλλιώς 0)· το `ct_v_wear_rate` πέφτει πάντα στο fallback. Βλ. F3-04, K-04. |
| `ct_v_rt_pnl` / `dl_v_rt_route` / `ct_v_rt_pallet_gate` γραμμές | **185 / 186 / 103** | Βάση της αποδοχής «γραμμές ίσες με πριν» (μετριέται ξανά την ώρα της εκτέλεσης). |
| md5 περιεχομένου (ταξινομημένο κατά id) | `ct_v_rt_revenue` `850ef7d2bdc6b87308caa2db38d6722c` · `ct_v_rt_pnl` (id, revenue, cost_net, cost_vat) `192145dfbcdf4f02873add883e4a04da` · `dl_v_rt_route` (rt_id, route_text) `113af620f60a36222d596b05b50a4c9e` | Ενδεικτικά· αλλάζουν με κάθε νέο RT. Η απόδειξη γίνεται **μέσα** στο DO block, πριν/μετά στην ίδια συναλλαγή (F3-10). |
| md5 ορισμού `pg_get_viewdef(…, true)` | `ct_v_rt_revenue` `7bd4c2b3206af115a5cfff5478dfdfc9` (4.210 χαρ.) · `ct_v_rt_costs` `3349bcf0e25e567075243f94755de4ff` · `ct_v_rt_pnl` `abc2a49270d8ac7bda9852782ab21f78` · `ct_v_wear_rate` `1d2285a601dc9c1e74dc92cb2e76d880` · `dl_v_rt_route` `cfb5f85b913657fba8d8d365d38df323` · `ct_v_rt_pallet_gate` `3672742c7ac8e537502058c8de6c8e8e` · `stock_v_pieces` `9a17994f3476293c585e3ace7a07e2be` · `v_rt_cycle` `47ca7d81be348ec9f7f7bddd8c6563d9` · `v_piece_state` `598fd9472beaef97adaf49b1ff431504` | Φρουρός μέσα στο 073 (R-06). Η μέθοδος (viewdef vs `prosrc`) πρέπει να είναι **η ίδια** σε φρουρό, verify, tests. |
| md5 `prosrc` συναρτήσεων | `stock_natl_delivered` `3ffc433986175c63f7cd3da2453f94b2` · `stock_guard_natl` `e941edbca9ff1bbeba0c89d49eb71cb3` · `stock_guard_orders` `63aa751d93cc8b34afa5587912de7045` · `stock_guard_lots` `231b539e429f5d404d0eaa46618d79c5` · `dl_sync_from_rt` `331cea3a8987b74a9b0add698df9b158` | Ίδια με τη λίστα φρουρού της Φ2 όπου επικαλύπτονται. |
| Ασφάλεια όψεων | `ct_v_rt_revenue/costs/pnl`: **χωρίς** `security_invoker`, owner `postgres`, SELECT μόνο `service_role` (+ INSERT/UPDATE grants κληρονομιάς)· `dl_v_rt_route`, `ct_v_wear_rate`, `ct_v_rt_pallet_gate`: `security_invoker=true`· `stock_v_pieces`, όψεις v5: SELECT και σε `tms_reader`/`tms_check_runner` | `CREATE OR REPLACE VIEW` κρατά grants/options· κανένα νέο άνοιγμα (R-03). |
| Ελεγκτής: πρόσβαση | `tms_check_runner`: βλέπει `orders.price`, `national_orders.price`, `ct_round_trips.partner_rate`, `ct_cost_lines`, `pl_movements`, `dl_entries`· **δεν** βλέπει `ct_v_rt_revenue` ούτε `ct_settings` | Ο έλεγχος «X ανά VS» δεν μπορεί να διαβάσει το X (K-07, C-16). |
| Ελεγκτής: ids | 89 έλεγχοι· **B-77 υπάρχει ήδη** («Σχετικές παραγγελίες σε >1 ζωντανά δρομολόγια»)· B-22 «Γραμμές κόστους χωρίς δρομολόγιο > 14 ημέρες», B-23 «Μετρητά χωρίς δρομολόγιο»· S-03 off (Β0) | Τα ενδεικτικά B-78… του tech draft είναι ελεύθερα· B-22 μοιάζει με «DKV χωρίς δρομολόγιο» (F3-12). |
| Απόθεμα 057 | 4 παρτίδες· κομμάτια: διεθνή 1, **εθνικά 0** | Ο εθνικός κλάδος του 057 είναι σήμερα αδρανής (F3-01, C-02). |
| `ct_cost_lines` | 1.247 γραμμές, 164 χωρίς `rt_id`, `pay_source ∈ {CASH, CREDIT, DKV, REVOLUT}`· **καμία ώρα** αποθηκευμένη (`line_date date`· `details` = πίνακας διελεύσεων) | Η ώρα DKV υπάρχει μόνο τη στιγμή της εισαγωγής (parser `time`)· K-05, C-10. |
| `pl_movements` | 253· `taken/given integer`· **κανένα trigger**· `code` default `PM-<seq>`· FK `order_id → orders` (όχι εθνικές)· VS: 8 confirmed DELIVERY, 17 LOADING σε στάσεις VS· `pl_on_natl_stops` = 0 | Οι κανόνες παλετών ζουν σήμερα στον Worker (`plValidate`, `PL_REF_MAP`)· K-08, K-09. |
| Κλάσματα παλετών | 0 εθνικές, 0 στάσεις με μη ακέραιες παλέτες | `shipment_pieces.pallets numeric(6,1)` vs `pl_movements.taken integer` (C-14). |

---

## 1. Τι παραδίδει η Φ3 (master Task Φ3, spec §5–§6)

Master: «Ε6: απόθεμα 057, κλάδος από `v_piece_state` · Ε7: έσοδο του κύκλου από τις αποστολές· X ανά παλέτα, σε όλες τις παλέτες του κόμβου · Ε8: το `total_km` μένει NULL, και η όψη αγνοεί τα NULL · Ε9: `dl_v_rt_route` από `rt_stops` · Ε10: DKV κατά ώρα · Ε21: το «κλειστό» του `/costs/rt` από το `v_rt_cycle.ended` για `model=2` (Worker, ίδια αλυσίδα) · Ε11: feeder παλετών μέσα στα `plan_*`, πύλη από τα κομμάτια, φρουρός για διπλή DELIVERY · Snapshot πριν = μετά (δεν υπάρχει ακόμη γραμμή v5) · Νέοι έλεγχοι του ελεγκτή (spec §8)». Αποδοχή: «οι γραμμές των `dl_v_rt_route` και `ct_v_rt_pnl` ίσες με πριν».

Spec §5: «Όψεις και triggers βάσης: μπαίνουν σε migration με αριθμό, και δεν αλλάζουν τίποτα όσο δεν υπάρχει γραμμή `model=2`: Ε6, Ε7, Ε8, Ε9 (`dl_v_rt_route`) και Ε11 στο `073` (Φ3)» · «Worker: οι Ε10, Ε16, Ε18, Ε19 και Ε21 ανήκουν στη μία αλυσίδα Worker (Φ2 → Φ3 → Φ5)». Spec §6: «**Φ3** `073` | Χρήματα, διαδρομή, παλέτες, DKV κατά ώρα (Ε7–Ε11)».

**Αρχεία (πρότυπο 071/072, master «Βάση», spec §9):** `worker/migrations/drafts/073_plan_money.sql` (ένα DO block, ASCII) + `_dryrun` (παράγεται) + `_verify` (μόνο SELECT) + `_test` (PGlite, σκόπιμο σφάλμα στο τέλος) + `_rollback` + `tests/sql-073-drafts.test.js` + `tms-auditor/test/plan-073.test.mjs` (+ λήψη `live-073.sql` των όψεων/συναρτήσεων που αγγίζει). Worker στο `deploy/worker-plan` (πάνω στη Φ2): `import-rules.mjs` (Ε10), `index.js` (Ε21, και ό,τι χρειάζεται η Ε11 στο `/pallets/*`), tests `worker/test/dkv-match-cycles.test.mjs` κ.ά. Έλεγχοι ελεγκτή: `tms-auditor/checks/*.sql` + seed (πρότυπο `057b_stock_monitoring.sql`, C-17).

---

## 2. Κοινοί κανόνες (R)

| # | Κανόνας | Πηγή |
|---|---|---|
| R-01 | Μία migration `073`, ένα DO block, ASCII μόνο (ελληνικά μόνο ως base64, πρότυπο 060), `set_config('lock_timeout','5s',true)`, `_dryrun/_verify/_test/_rollback` + `tests/sql-073-drafts.test.js`. Εκτέλεση από τον owner **μετά τις 15:00**, μετά από dry run και ρητό «ναι». | master «Βάση»· spec §9· CLAUDE.md κανόνας 5, αρχή 7 |
| R-02 | **Καμία αλλαγή αριθμού όσο δεν υπάρχει γραμμή v5**: κάθε όψη που αλλάζει δίνει για κάθε RT `model=1` ακριβώς ό,τι πριν, ως το σεντ. | spec §5 «δεν αλλάζουν τίποτα όσο δεν υπάρχει γραμμή `model=2`»· master Φ3 «Snapshot πριν = μετά» |
| R-03 | Γεννιέται κλειστό: νέες όψεις/συναρτήσεις `REVOKE … FROM PUBLIC, anon, authenticated`· όψεις με χρήματα **μόνο** `service_role`· όψεις χωρίς χρήματα και σε `tms_reader`/`tms_check_runner` (πρότυπο 057). Το `CREATE OR REPLACE` των υπαρχουσών κρατά options/grants — **καμία** διεύρυνση. | CLAUDE.md αρχή 5· tech §1.2 |
| R-04 | **Ο dispatcher δεν βλέπει P&L**: X, έσοδο, κόστη, περιθώρια, καύσιμα μένουν στο `/costs/pnl` (owner). Το κόμιστρο συνεργάτη (`partner_rate`) το βλέπει και το γράφει ο dispatcher (ρητή εξαίρεση). Ποσά μισθοδοσίας/DKV στις λίστες επιβεβαίωσης μόνο owner/accountant. Καμία `/plan/*` απάντηση δεν φέρνει X/έσοδο/κόστος. | CLAUDE.md κλειδωμένες αποφάσεις (23/8 + εξαίρεση 21/10)· spec §3 «Δικαιώματα»· DECISION_LOG 21/10 «Δικαιώματα»· tech §Φ2 «Κανένα `/plan/*` δεν επιστρέφει X» |
| R-05 | **Μία πηγή ανά γεγονός**: «έγινε/τέλος κύκλου» μόνο από τις όψεις της 071 (`v_piece_state.executed`, `v_rt_cycle.ended`)· X μόνο από `ct_settings`· ποτέ καθρέφτης στα `national_orders.truck_id/partner_id/status`. | spec §2.1, §2.3 («ένας μόνο ορισμός»)· αρχή 3 |
| R-06 | Πριν αγγίξεις υπάρχον αντικείμενο: md5 του **ζωντανού** κειμένου μέσα στο block (φρουρός)· αν διαφέρει: ΣΤΑΜΑΤΑ. Το κείμενο που αντικαθίσταται διαβάζεται από την παραγωγή, όχι από αρχείο (τα 057/060/069 έμειναν στο `drafts/`). | master «Βάση»· tech §0 «Δύο αποκλίσεις» (1) |
| R-07 | Καμία σιωπηλή αποτυχία: κάθε κενό που μοιάζει με 0 (φθορά χωρίς km, κόμιστρο που λείπει, έσοδο μη ανατεθειμένων) **ή** φαίνεται ως σημαία **ή** το μετρά ο ελεγκτής. | master «Κώδικας και ποιότητα»· CLAUDE.md «ΟΙ ΤΡΕΙΣ ΜΗΧΑΝΙΣΜΟΙ», μηχανισμός 2 |
| R-08 | Worker: μία αλυσίδα `deploy/worker-plan` (Φ2 → **Φ3** → Φ5), κάτοχος η Petras· deploy μόνο μετά τις 15:00· φρουρός πριν/μετά: τα 3 + `tblStockLots: {` + `"Move Kind": "move_kind"` + `var PLAN_PERMS = {` (+ `var PLAN_WRITES_OPEN = false;` της Φ2). | CLAUDE.md «Ο WORKER», «Τρεις κανόνες μίας πηγής»· DECISION_LOG 22/10 «αλυσίδα Worker» |
| R-09 | Σχόλια κώδικα αγγλικά, το «γιατί»· κάθε ουσιαστική απόφαση και στο `docs/DECISION_LOG.md`· `/code-review` **xhigh** (Worker, βάση, χρήματα). | CLAUDE.md «COMMENTS»· master «Κώδικας» |
| R-10 | Κάθε αλλαγή οθόνης (αν μπει στη Φ3, C-04) ελέγχεται ως τον πίνακα, πίσω από `FEATURES.WN_V5`, με bump `?v=` + `SW_VERSION`. | CLAUDE.md «ΚΑΘΕ ΑΛΛΑΓΗ ΣΤΟ FRONT END»· master «Front end» |
| R-11 | Το 011 (`dl_sync_from_rt`) μένει αμετάβλητο· η μισθοδοσία νέου κύκλου ξεκινά κενή και το ποσό το γράφει η λογιστική. | spec §3 Χρήματα «Μισθοδοσία νέου κύκλου: ξεκινά κενή»· flows ροή 12 κενό 2 |

---

## 3. Οι απαιτήσεις ανά αλλαγή

### F3-01 · Ε6 Απόθεμα 057: κλάδος από `v_piece_state`
- **Spec:** «Ε6 | Απόθεμα 057 (`stock_natl_delivered`, `stock_v_pieces`) | Κλάδος από `v_piece_state` | Η παρτίδα δεν κλείνει ποτέ».
- **Ζωντανό:** `stock_v_pieces` κλάδος `natl`: `delivered = stock_natl_delivered(n.status, n.delivery_datetime)` = `status='Delivered' OR (status ≠ 'Cancelled' AND delivery ≤ current_date)`· `on_truck = n.truck_id IS NOT NULL OR n.partner_id IS NOT NULL`. Στο v5 το `status`, `truck_id`, `partner_id` **δεν γράφονται ποτέ** (κανένας καθρέφτης) → `on_truck` πάντα false· το `delivered` θα έβγαινε από την ημερομηνία ζήτησης, όχι από την εκτέλεση.
- **Απαίτηση:** για εθνικό κομμάτι παρτίδας που έχει αποστολές v5: `delivered` = όλα τα φύλλα του `executed` (`v_national_order_state.executed` ή `v_piece_state`)· `delivered_on` = μέγιστο `end_day`· `on_truck` = υπάρχει ζωντανή κίνηση (`NOT waiting` ή `v_national_order_state.planned`). Για εθνικό χωρίς αποστολές: ακριβώς ό,τι σήμερα (R-02).
- **Ορισμός «έγινε»:** ο σημερινός κανόνας είναι `≤ current_date` (ημέρα της βάσης, UTC), ο v5 `< σήμερα Αθήνας`. **K-01**.
- **Αμφισημία που μπλοκάρει:** η Φ2 **αρνείται** `stock_lot_id` στο `plan_orders_create` (απόφαση C-24: «a lot piece (057) never enters v5 here; its relation to v5 is F3's (E6)») και ο facade **δεν** έχει label «Stock Lot» στις NATIONAL ORDERS. Άρα σήμερα **δεν υπάρχει δρόμος** για εθνικό κομμάτι παρτίδας στο v5· ο κλάδος Ε6 θα διάβαζε πάντα 0 γραμμές. → **C-02**.
- **Δεν αλλάζει:** οι 14 φρουροί του 057 που έφυγαν με την 071a (Β0, εκτελεσμένη 22/10)· το πάγωμα της τιμής παρτίδας μετά το τιμολόγιο μένει.

### F3-02 · Ε7 Έσοδο κύκλου `model=2` (`ct_v_rt_revenue`, `ct_v_rt_costs`, `ct_v_rt_pnl`) 💶
- **Spec:** «Ε7 | P&L (`costs.js:193-199, 1054, 1067-1072`, όψεις `ct_v_rt_*`) | Κλάδος για `model=2`: έσοδο από αποστολές, χωρίς «0 φορτία ⚠», χωρίς κουμπί κλεισίματος | «Σχεδιασμένο» για πάντα, έσοδο 0» · §3 Χρήματα: «**Η τιμή και το X μοιράζονται ανά παλέτα,** σε όλες τις παλέτες του κόμβου, χωρίς εξαίρεση ανά είδος φορτίου (το IFCO είναι πελάτης)» · «Κόμιστρο συνεργάτη: ένα ανά δρομολόγιο. Μπορεί να μείνει κενό· τότε φαίνεται ως εκκρεμότητα, και στο P&L» · §2.2 «Στην ίδια συναλλαγή αποσυνδέει το αυτόματο NL του, αλλιώς το X μετρά διπλά» · DECISION_LOG 21/10: «Το IFCO είναι πελάτης… Η τιμή και το X μοιράζονται σε όλες τις παλέτες του κόμβου»· απορρίφθηκε «μόνο PALLET» στο X.
- **Ζωντανό `ct_v_rt_revenue`** (κείμενο 057): `rev_intl` = τιμή σκέλους − `stock_vs_charge(X, pallets)` όταν `veroia_switch` (X = `x_export` αν Export, αλλιώς `x_import`· για κομμάτι παρτίδας X × min(π, 33)/33)· `rev_natl` = X στο **πρώτο** Direct NL της VS + Σ τιμών εθνικών «σπιτιού» του NL. Κάθε RT έχει γραμμή (LEFT JOIN από `ct_round_trips`), άρα ένας κύκλος `model=2` χωρίς `ct_rt_legs` παίρνει σήμερα έσοδο **0**.
- **Απαιτήσεις:**
  1. **Κύκλος `model=2`, εθνική v5:** `national_orders.price × leaf.pallets / Σ παλετών της παραγγελίας` (μέρισμα ανά παλέτα), αποδοσμένο στον κύκλο της κίνησης που ορίζει το C-05 💶.
  2. **Κύκλος `model=2`, γέφυρα VS:** `X × leaf.pallets / Σ παλετών κόμβου της παραγγελίας VS` (όλες οι ελληνικές στάσεις κόμβου, όλα τα είδη φορτίου). X από `ct_settings` κατά κατεύθυνση της διεθνούς, όπως σήμερα.
  3. **Διεθνές RT (`model=1`) για VS με αποστολές γέφυρας:** το «− X» μένει ένα (όχι διπλό) — αν μένει ολόκληρο ή γίνεται «− Σ μεριδίων που μπήκαν σε κύκλο» είναι **C-06** 💶.
  4. **Αμοιβαία αποκλειστικότητα:** παραγγελία με αποστολές γέφυρας **δεν** παίρνει X από τον κλάδο Direct NL (η Φ5 αποσυνδέει το NL στην ίδια συναλλαγή· ο κλάδος του 073 πρέπει να μην μετρά διπλά ακόμη κι αν βρεθεί NL — δίχτυ + έλεγχος P1 «ίδια παραγγελία με NL και με αποστολή»).
  5. **`revenue = revenue_intl + revenue_natl`** μένει αληθές (tech §Φ3.1)· το έσοδο v5 μπαίνει στο `revenue_natl`.
  6. **Ακυρωμένος κύκλος / ακυρωμένη κίνηση:** καμία συνεισφορά· κομμάτι χωρίς ζωντανή κίνηση (αναμονή, απόθεμα) **δεν** έχει έσοδο σε κύκλο — μετριέται ως «μη ανατεθειμένο» (F3-11, έλεγχος 5).
  7. **`ct_v_rt_costs` για `model=2`:** `partner_planned = ct_round_trips.partner_rate` (ένα ανά δρομολόγιο)· οι πηγές `partner_assignments`/`national_loads.partner_rate` δεν αφορούν `model=2` (δεν έχει `ct_rt_legs`)· το `partner_invoiced` (`ct_cost_lines.category='partner_rate'`) υπερισχύει όπως σήμερα. Οι στήλες μένουν ίδιες.
  8. **Κόμιστρο που λείπει = ορατό στο P&L**: `PARTNER` `model=2` με `partner_rate IS NULL` και χωρίς `partner_invoiced` δεν πρέπει να διαβάζεται ως κόστος 0 → σημαία (π.χ. `partner_rate_missing`, προσθήκη **στο τέλος** των στηλών του `ct_v_rt_pnl`, αλλιώς το `CREATE OR REPLACE` αποτυγχάνει) — μορφή: **C-07**.
  9. **Καμία αλλαγή για `model=1`** (R-02)· καμία νέα στήλη «Net Price» (K-03).
- **Front (`costs.js`):** «χωρίς «0 φορτία ⚠», χωρίς κουμπί κλεισίματος» και το badge «Σχεδιασμένο για πάντα» (`ctStatusBadge` διαβάζει `status`/`ct_rt_legs`, :192-199· κουμπί «Κλείσιμο δρομολογίου» :1054· «N συνδεδεμένα φορτία… σύνδεση από τους σχεδιαστές» :1072). Η Ε7 **δεν** είναι στη λίστα οθονών της Φ4 (spec §5: «Ε1–Ε5, Ε9 (ανάγνωση), Ε12–Ε15 και Ε20») → **C-04**. Η Φ2 (απόφαση 27) ήδη γυρίζει **409** στο `PATCH /costs/rt/:id` για `model=2`, άρα το κουμπί θα έβγαζε σφάλμα.

### F3-03 · Ε21 «Κλειστό» κύκλου στο `/costs/rt` από `v_rt_cycle.ended` (Worker)
- **Spec:** «Ε21 | «Κλειστό» κύκλου στο `/costs/rt` (Έξοδα, Μισθοδοσία) | Ίδιος κανόνας με το §2.3 (η ημέρα της τελευταίας στάσης πέρασε), από το `v_rt_cycle.ended` για `model=2` | Δύο ορισμοί του τέλους κύκλου· «λείπουν καύσιμα/διόδια» σε λάθος μέρα» · §2.3 «Ο ίδιος κανόνας ισχύει και για το «κλειστό» του `/costs/rt` και για το `v_rt_cycle.ended`, ώστε να υπάρχει ένας μόνο ορισμός».
- **Ζωντανό:** `GET /costs/rt` (`index.js:3734-3831`) επιστρέφει ωμό `ct_round_trips` + `route_text/route_legs` + `ledger_entry`· το «κλειστό» το αποφασίζει ο browser: `expenses.js:750 exIsDone = status ∈ {closed, complete}`, `core/rt-feed.js:94 _rtClosed`, `costs.js:197, 838, 1065`. Για `model=2` το `status` είναι πάντα `planned|cancelled` (CHECK `rt_v2_status`) → «Σε εξέλιξη» για πάντα, και το «λείπουν: καύσιμα/διόδια» (που λέγεται **μόνο** για κλειστό, `expenses.js:753`) δεν εμφανίζεται ποτέ.
- **`v_rt_cycle.ended`** (071): `status <> 'cancelled' AND (end_at AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date`.
- **Απαίτηση:** για κάθε γραμμή `model=2` ο Worker φέρνει το `ended` από το `v_rt_cycle` (μία ανάγνωση `in.(ids)`, όπως το route lookup), και η οθόνη το διαβάζει ως «κλειστό». Αποτυχία της ανάγνωσης = ρητό σφάλμα/σημαία, **όχι** σιωπηλό «σε εξέλιξη» (πρότυπο `ledger_entry` try/catch → εδώ ελέγχεται, C-08). Μορφή (νέο πεδίο vs παράγωγο `status`) = **C-08**.
- **Ίδια αλυσίδα:** το ίδιο handler αλλάζει και η Ε18 της Φ5 (υποχρεωτικό from/to, όριο 1000, `truncated`)· η Φ3 δεν την κάνει (X-02), αλλά να μη συγκρουστούν.
- **Παράθυρο φίλτρου:** το `GET /costs/rt` φιλτράρει κατά `date_start`/`date_end` (`overlap=1`)· για `model=2` τα `date_start/date_end` = ημέρες Αθήνας των `start_at/end_at` (CHECK `rt_v2_dates`), άρα λειτουργεί χωρίς αλλαγή.

### F3-04 · Ε8 Φθορά: `total_km` NULL, η όψη αγνοεί τα NULL
- **Spec:** «Ε8 | Φθορά (`ct_v_wear_rate`) | Στο `model=2` το `total_km` μένει NULL (δεν το μετράμε). Η όψη αγνοεί τα NULL, αντί να τα μετρά ως 0, και ο ελεγκτής μετρά τους κύκλους χωρίς km | Λάθος €/km».
- **Ζωντανό:** `ct_v_wear_rate` = `sum(total_km)` ανά φορτηγό (το `sum` ήδη αγνοεί NULL)· `eur_per_km = maint_cost / km` αν `km > 0`, αλλιώς fallback 0,082. `ct_v_rt_costs.wear` = 0 όταν `total_km IS NULL`. **Μετρήθηκε: `total_km` NULL σε 202/202 RT** → σήμερα κάθε RT έχει φθορά 0 και κάθε φορτηγό fallback.
- **Απαίτηση:** (α) το `plan_*` δεν γράφει ποτέ `total_km` σε `model=2` (το `PATCH /costs/rt` είναι 409 από τη Φ2)· (β) η όψη δεν μετρά NULL ως 0 στον παρονομαστή (ήδη αληθές, πρέπει να **αποδειχθεί** με test, όχι να υποτεθεί)· (γ) ο ελεγκτής μετρά κύκλους `model=2` OWNED χωρίς km· (δ) η φθορά 0 από NULL km στο P&L είναι «κενό που μοιάζει με 0» (R-07). Πόσο από αυτά χρειάζεται αλλαγή όψης = **K-04 / C-09**.

### F3-05 · Ε9 `dl_v_rt_route` από `rt_stops`
- **Spec:** «Ε9 | Μισθοδοσία, έξοδα, καρτέλα οδηγού (`dl_v_rt_route`, `expenses.js`, `payroll.js`, `entity.js:2346`) | Διαδρομή από `rt_stops` | Κύκλος χωρίς διαδρομή». Το DB μέρος είναι Φ3, η ανάγνωση Φ4 (spec §5).
- **Tech §Φ3.3:** «κλάδος UNION για `model=2` από `rt_stops`. ΚΑΘΟΔΟΣ = πρώτη/τελευταία στάση της πλευράς, ΑΝΟΔΟΣ το ίδιο, `+N στάσεις`».
- **Ζωντανό σχήμα (να μείνει ίδιο):** `rt_id, route_text, route_legs` με `route_legs[]` = `{dir, load, deliv, from:{name,city,country}, to:{name,city,country}, extra_stops}`, ταξινόμηση `seq, load, leg_id`. Καταναλωτές: Worker `/costs/rt` (:3782-3797), `core/utils.js:173 rtLegBlockHtml` (**ήδη** δέχεται `dir ∈ {ANODOS, KATHODOS}`: ↗/↙), `expenses.js:805, 875-925, 1319`, `payroll.js`, `entity.js`.
- **Απαίτηση:** για κάθε `model=2` κύκλο, ένα στοιχείο ανά πλευρά που έχει ζωντανές στάσεις, ΚΑΘΟΔΟΣ πριν ΑΝΟΔΟ: `dir` = `KATHODOS`/`ANODOS`, `from` = τόπος της πρώτης στάσης της πλευράς (κατά `seq`), `to` = της τελευταίας, `load` = ημέρα Αθήνας `planned_from` της πρώτης, `deliv` = ημέρα Αθήνας `planned_to` της τελευταίας, `extra_stops` = πλήθος στάσεων της πλευράς − 2 (ελάχιστο 0)· `route_text` = `«from → to» · …` όπως ο κλάδος v1. Μόνο ζωντανές στάσεις (`deleted_at IS NULL`). Κύκλος `cancelled`: όπως σήμερα (ο κλάδος v1 δεν φιλτράρει status) — **C-12**.
- **Γραμμές `model=1` ίσες ως το byte** (αποδοχή master).

### F3-06 · Ε10 DKV κατά ώρα (Worker `import-rules.mjs`)
- **Spec:** «Ε10 | DKV (`import-rules.mjs:384-405`) | Ταίριασμα κατά ώρα (`start_at/end_at`) | Λάθος κύκλος όταν υπάρχουν δύο την ίδια μέρα» · §8 «DKV χωρίς δρομολόγιο».
- **Tech §Φ3 Worker:** «για υποψήφια `model=2` με ώρα στη γραμμή DKV, χρησιμοποιεί `tstzrange(start_at, end_at)`. Χωρίς ώρα, δύο κύκλοι στην ίδια μέρα → `match:'review'` με τους δύο. **Ποτέ τυχαία επιλογή**» · «Το `none_reason:'no_rt_on_date'` με γνωστό φορτηγό γίνεται η ειδοποίηση «λείπει δρομολόγιο» (owner 20/10: όχι κατηγορία, ειδοποίηση)».
- **Ζωντανό:** `matchRoundTrip(line, rts, rules)`: υποψήφιοι = ίδιο φορτηγό, όχι cancelled, `dateOverlaps` με ανοχή ±1 ημέρας· 1 → `sure`, >1 → `rt_pref` κανόνας ή «περισσότερες ημέρες» → `suggest`. Ο caller (`index.js:4453-4459`) φορτώνει `id,truck_id,status,date_start,date_end` — **χωρίς** `model/start_at/end_at`. Ο parser κρατά `time` (HH:MM) σε γραμμές καυσίμων και διελεύσεων, αλλά **δεν** αποθηκεύεται (`ct_cost_lines.line_date date`· 0/1.247 με ώρα).
- **Απαιτήσεις:** (1) ο caller φέρνει και `model, start_at, end_at`· (2) υποψήφιος `model=2` με ώρα στη γραμμή: μέσα στο `[start_at, end_at)` ή όχι — κανένα ±1 ημέρας· (3) χωρίς ώρα και ≥2 υποψήφιοι την ίδια ημέρα → **review** με όλους, ποτέ «περισσότερες ημέρες» ούτε `rt_pref` για να διαλέξει σιωπηλά ανάμεσα σε `model=2` (το `rt_pref` είναι κανόνας πινακίδας, όχι κύκλου) — **C-11**· (4) μεικτοί υποψήφιοι `model=1` + `model=2` → review· (5) `model=1` μόνοι: **ακριβώς** η σημερινή συμπεριφορά (test πριν = μετά)· (6) `none_reason:'no_rt_on_date'` με γνωστό φορτηγό → ειδοποίηση «λείπει δρομολόγιο» (κανάλι: **C-13**). Test (tech): «Τετ 06:00 τέλος, Τετ 14:00 αρχή, καύσιμα 10:00 → `review`».
- **Ζώνη ώρας της `time`** της γραμμής DKV (ώρα σταθμού; Αθήνας;) δεν ορίζεται πουθενά → **K-05 / C-10**.
- **Κατανομή τελών DKV (`allocateFees`)** χρησιμοποιεί τα ίδια `rts` (ίδιο σχήμα)· ο κανόνας της αναλογικής κατανομής **δεν** αλλάζει (απόφαση owner 13/9) — μόνο να μη σπάσει με κύκλους `model=2` (X-05).

### F3-07 · Ε11 Παλέτες: feeder μέσα στα `plan_*`, πύλη από τα κομμάτια, φρουρός διπλής DELIVERY
- **Spec:** «Ε11 | Παλέτες: feeder, πύλη, βιβλίο (`pallet-feed.js`, `ct_v_rt_pallet_gate`, `pallet_ledger.js:1051`, `PL_REF_MAP`) | Feeder μέσα στα `plan_*`· πύλη από τα κομμάτια· ετικέτα «εθνική #…»· φρουρός για τη διπλή DELIVERY του `plOnDelivered` | Πύλη πάντα πράσινη, διπλές κινήσεις» · §3 Χρήματα: «**Παλέτες στην παράδοση:** θεωρούμε ότι πήραμε πίσω όσες μας χρέωσαν. Ο χρήστης απλώς επιβεβαιώνει, και διορθώνει μόνο αν δεν τις πήραμε».
- **Κλειδωμένο (PALLETS_ARCHITECTURE §3):** #1 φόρτωση σε προμηθευτή, δικό μας όχημα → εκκρεμής, επιβεβαίωση με δελτίο· **#2 παράδοση με δικό μας όχημα → «αυτόματα πλήρης ανταλλαγή (net 0)», διόρθωση μόνο με αντιλογισμό**· #4/#5 partner → εκκρεμής PARTNER_PICKUP/DROPOFF· **#6 VS cross-dock εσωτερικά → καμία εγγραφή**· #9 διόρθωση = αντιλογισμός, ποτέ edit/delete σε confirmed. §4.2 «Gate partner — PnL ανάθεσης σε partner δεν υπολογίζεται αν λείπει το δελτίο».
- **Tech §Φ3.4 (μόνο όπου δεν το αλλάζει το spec):** ο feeder γράφει/μετακινεί/σβήνει **μόνο pending** `pl_movements` με `piece_leg_id`: `LOADING` όταν η κίνηση φορτώνει στην αφετηρία της αποστολής και `pallet_exchange`· `DELIVERY` όταν ξεφορτώνει στον προορισμό· **τίποτα στον κόμβο**. Ο feeder του browser δεν καλείται για v5· «Το `UNIQUE pl_mov_leg_once` κάνει το δεύτερο 422». Το «Confirmed μόνο με δελτίο, ποτέ προσυμπληρωμένες» **αντικαταστάθηκε** από τον owner 18/10 (flows ροή 13, κενό 2) και το spec §3.
- **Απαιτήσεις feeder (βάση, αρχή 4):**
  1. Γράφεται στο σημείο αγκίστρωσης της Φ2 (`plan_h_leg_add`: «F3 hook: the pallet feeder of this leg (pl_movements.piece_leg_id, 073) is written here») και αναιρείται στο `plan_h_leg_drop` (pending → σβήνεται· confirmed → μένει, μπαίνει στη λίστα συνεπειών, αντιλογισμός μετά το token: C-15).
  2. Ακολουθεί κάθε αλλαγή που αλλάζει ποσότητα/ημέρα/τόπο μιας pending κίνησης: σπάσιμο (`plan_split_piece`, split+put), διόρθωση παλετών (`plan_order_update`, και η Φ5 για γέφυρες), αλλαγή ώρας (`plan_rt_update`, flows κενό 11: «τα pending PL να ακολουθούν και στο `plan_rt_update`»), αλλαγή τόπου VS (`plan_vs_set_place`), `pallet_exchange` off (σβήνει τις pending, όπως `plOnExchangeOff`).
  3. Αντισυμβαλλόμενος = πελάτης της αποστολής (`v_shipments.client_id`: εθνική ή διεθνής της VS)· `location_id` = τόπος της στάσης· `order_id` = η διεθνής για VS, NULL για εθνική (FK μόνο προς `orders`)· `movement_date` = ημέρα Αθήνας της στάσης· `created_by` = `p_actor`.
  4. Μία εγγραφή ανά (κίνηση, είδος) — `pl_mov_leg_once` (071)· η κίνηση κομματιού δεν αλλάζει ποτέ (071 `leg_locked`), άρα η pending ακολουθεί τη **νέα** κίνηση μετά από Μεταφορά.
  5. **Κύκλος PARTNER:** ο feeder δεν ξεχωρίζει σήμερα OWNED/PARTNER (flows ροή 13 κενό 4)· το #2 «δικό μας όχημα» δεν ισχύει για συνεργάτη → **C-15**.
- **Φρουρός διπλής DELIVERY (και LOADING):** `plOnDelivered` (`pallet-feed.js:107-150`, καλείται από `daily_ops.js:1465, 1651`) γράφει **confirmed** DELIVERY σε **κάθε** στάση εκφόρτωσης της διεθνούς με PE, χωρίς `piece_leg_id` — άρα και στις ελληνικές στάσεις VS που παραδίδει ο εθνικός κύκλος. Μετρήθηκε: 8 τέτοιες confirmed σήμερα. Το `pl_mov_leg_once` **δεν** το πιάνει. **Το ίδιο ισχύει για LOADING** σε εξαγωγή VS: το `plOnOrderSaved(…,'intl')` γράφει pending LOADING σε κάθε στάση φόρτωσης της διεθνούς (17 σήμερα σε VS), και ο feeder v5 θα έγραφε LOADING στην αφετηρία της γέφυρας εξαγωγής (= η ίδια ελληνική στάση) → **K-08**. Θέση του φρουρού (βάση / Worker `/pallets/*` / browser): **C-15**.
- **Πύλη από τα κομμάτια:** `ct_v_rt_pallet_gate` διαβάζει `ct_rt_legs` + `orders.pallet_exchange` + confirmed `PARTNER_PICKUP/DROPOFF` ανά `order_id` → για `model=2` καμία γραμμή = «πάντα πράσινη» (ο `/costs/pallet-gate` επιστρέφει μόνο ό,τι υπάρχει). Απαίτηση: κλάδος `model=2` από `piece_legs` → κομμάτια με PE → δελτίο ανά κίνηση/στάση (κλειδί `piece_leg_id` ή `order_stop_id`, όχι `order_id` που λείπει στις εθνικές). Ποιοι κύκλοι χρειάζονται δελτίο (μόνο PARTNER, όπως λέει το §4.2, ή όλοι όπως η σημερινή όψη που δεν φιλτράρει `trip_type`): **C-15**.
- **Βιβλίο παλετών, ετικέτα:** `pallet_ledger.js:1051` δείχνει «Παραγγελία #order_id · Στάση #…» ή «Δρομολόγιο #cons_load_id» ή «Χειροκίνητη»· για εθνική v5 (`order_id` NULL, `piece_leg_id` γεμάτο) θα έγραφε «Χειροκίνητη». Απαίτηση: «εθνική #<nat_order_id>» μέσω `piece_leg_id → piece → shipment`. Ποιος κάνει τη μετάφραση (Worker `GET /pallets/movements` προσθέτει `nat_order_id`, ή όψη) και αν αλλάζει το `PL_REF_MAP` (σήμερα: μόνο `orders` για `order_rec`): **C-15**· η οθόνη = Φ4 ή Φ3 (C-04).
- **`PL_REF_MAP` / παρατήρηση:** το `plOnOrderSaved(…,'natl')` στέλνει `order_rec` = legacy id **εθνικής**, ενώ ο resolver ψάχνει στο `orders` → πιθανό «Unknown order_rec» (μετρήθηκε 0 κινήσεις σε στάσεις εθνικών). Δεν επαληθεύτηκε ως σφάλμα· αφορά τον παλιό δρόμο που φεύγει στο L (**K-09**, να ελεγχθεί, όχι να «διορθωθεί» σιωπηλά).

### F3-08 · Λίστα συνεπειών: κινήσεις παλετών confirmed
- **Πηγή:** tech §1.4 «λίστα συνεπειών: … κινήσεις παλετών confirmed»· tech §Φ2 `plan_delete`· flows ροή 9 «PL confirmed»· F2 `requirements.md` F2-09 «κινήσεις παλετών confirmed (Φ3· σήμερα 0)».
- **Κενό στη Φ2:** το μητρώο ειδών συνεπειών της Φ2 είναι κλειστό (`invoiced, costs, payroll_amount, local_loading, local_payroll, rt_cancelled, executed_leg, later_leg`) και το build test **αρνείται** τιμή εκτός μητρώου. Η Φ3 χρειάζεται νέο είδος (π.χ. `pallets_confirmed`) στο `plan_h_drop_consequences` → αλλαγή συνάρτησης της Φ2 + μητρώου + `PLAN_RULE_TEXT`/κειμένων Worker + build test της Φ2 (I-06). Αν προσθέτει token: ο ίδιος μηχανισμός `plan_h_confirm`.
- Ποσά: οι παλέτες δεν είναι ποσά χρημάτων· ορατές και στον dispatcher (σήμερα το `/pallets/*` τις δείχνει στους ρόλους του `PL_PERMS`) — να επιβεβαιωθεί, **C-15**.

### F3-09 · Αλλαγές σε συναρτήσεις της Φ2
Ο feeder (F3-07) και η νέα συνέπεια (F3-08) σημαίνουν ότι το 073 **ξαναγράφει** βοηθούς της 072 (`plan_h_leg_add`, `plan_h_leg_drop`, `plan_h_drop_consequences`, πιθανόν `plan_h_resize`, `plan_split_piece`, `plan_rt_update`, `plan_vs_set_place`, `plan_order_update`). Απαιτήσεις: φρουρός md5 του **ζωντανού** κειμένου της 072 (R-06) μέσα στο 073· η Φ2 λέει «Κανένα νέο trigger… καμία αλλαγή σε υπάρχουσα συνάρτηση» μόνο για τη 072 — η 073 πρέπει να δηλώσει ρητά ποιες αλλάζει· το rollback της 073 επαναφέρει τα κείμενα της 072 με md5. Εναλλακτικά ο feeder ως **ένας** νέος βοηθός (`plan_h_pallet_sync(p_leg)`) που καλούν τα σημεία αγκίστρωσης, ώστε η αλλαγή στις συναρτήσεις της Φ2 να είναι μία γραμμή η καθεμία (πρότυπο της 071 στα `rt_status_guard` κ.λπ.) — **C-03**.

### F3-10 · Snapshot πριν = μετά
- **Master:** «Snapshot πριν = μετά (δεν υπάρχει ακόμη γραμμή v5)» · αποδοχή «οι γραμμές των `dl_v_rt_route` και `ct_v_rt_pnl` ίσες με πριν». **Tech:** «Snapshot όλων των RT πριν = μετά»· πρότυπο 034 (`034:149-164`) «κάθε RT (όχημα, παράθυρο, status, revenue, όλες οι στήλες κόστους) και κάθε `dl_entries`», ως το σεντ.
- **Απαίτηση:** μέσα στο DO block, πριν και μετά την αντικατάσταση: md5 ταξινομημένου περιεχομένου **όλων** των στηλών των `ct_v_rt_revenue`, `ct_v_rt_costs`, `ct_v_rt_pnl`, `ct_v_wear_rate`, `dl_v_rt_route`, `ct_v_rt_pallet_gate`, `stock_v_pieces` (+ πλήθη)· διαφορά = `RAISE` (όλα ή τίποτα). Επιπλέον: το `071_plan_schema_fingerprint.sql` (RT + `dl_entries`) πριν/μετά, εκτός block. Φρουρός: **0** γραμμές v5 και 0 `model=2` την ώρα της εκτέλεσης (αλλιώς δεν ισχύει το «ίσο»).
- **Test (PGlite):** σε δεδομένα **με** γραμμές v5 (εβδομάδα-σενάριο) οι κλάδοι v5 δίνουν τα αναμενόμενα· σε δεδομένα χωρίς v5, όλα ίδια με το ζωντανό κείμενο.

### F3-11 · Νέοι έλεγχοι ελεγκτή (spec §8)
Spec §8 «Στον ελεγκτή (ειδοποίηση σε owner και εθνικών)». Ποιοι ανήκουν στη Φ3 και ποιοι θέλουν την ημέρα L (`plan_config`, 074) — **C-17**:

| # | Έλεγχος (spec §8) | Φ3 ή Φ5 | Σημειώσεις |
|---|---|---|---|
| 1 | VS ≥ L χωρίς αποστολή (P1) | **Φ5** (θέλει L) | X-01 |
| 2 | νέα γραμμή NL/GL/CL μετά το L (P1) | **Φ5** | X-01 |
| 3 | ίδια παραγγελία με NL και με αποστολή (P1) | Φ3 (δεν θέλει L) | δίχτυ του διπλού X (F3-02.4) |
| 4 | X **ανά παραγγελία VS** (άθροισμα των μεριδίων) εκτός {0, 650, 850} | Φ3 | K-07 (πρόσβαση στο X), C-16 (άθροισμα όλων των φύλλων ή μόνο ανατεθειμένων) 💶 |
| 5 | σύνολο εσόδων κύκλων + τιμές μη ανατεθειμένων / αποθέματος ≠ σύνολο τιμών εβδομάδας | Φ3 | flows ροή 12 κενό 3 («αλλιώς σταματά την κυκλοφορία την πρώτη μέρα»)· ορισμός «εβδομάδας» = C-18 💶· ανοχή 0,01 € (tech B-79) |
| 6 | VS χωρίς ημέρα κόμβου (P1) | **Φ5** (η γέφυρα δεν γεννιέται, spec §2.3) | X-01 |
| 7 | κομμάτι που δεν έφυγε στην ώρα του | Φ3 | `v_piece_state.overdue` (071) |
| 8 | άδειος κύκλος | Φ3 | `model=2`, όχι `cancelled`, `n_legs = 0` (`v_rt_cycle`) — tech B-86 |
| 9 | κόμιστρο που λείπει | Φ3 | PARTNER `model=2`, `partner_rate` NULL, όχι `cancelled` |
| 10 | DKV χωρίς δρομολόγιο | Φ3 | B-22 υπάρχει (γραμμές `rt_id IS NULL` > 14 ημ.)· **δεν** πιάνει γραμμές σε κύκλο `cancelled` (η Φ2, απόφαση 13, τις αφήνει στο `rt_id`) — tech B-81 «σε RT `cancelled`» |
| 11 | μεικτές θερμοκρασίες | Φ3 | «≥ 2 °C» στην ίδια πλευρά (spec §7, B-87), P3 ενημέρωση· η Φ2 δίνει ήδη `mixed_temp` warning |
| + | αδιάβαστες ειδοποιήσεις > 24 ώρες | Φ3 ή Φ5 | spec §7 «που μετρά ο ελεγκτής όσο μένει αδιάβαστο πάνω από 24 ώρες»· η Φ2 το αφήνει «Φ3/Φ5» |
| + | κύκλοι `model=2` OWNED χωρίς km | Φ3 | Ε8 (F3-04) |
| + | pending κίνηση παλετών σε σβησμένη κίνηση κομματιού | Φ3 | tech B-80 (P2)· δίχτυ του feeder |

Κοινά: κάθε έλεγχος ως `tms-auditor/checks/<id>.sql` + seed (πρότυπο 057b)· ids μετά το B-77 (υπάρχον)· ο B-54 (πλήθος triggers) ενημερώνεται **μόνο** αν η 073 προσθέσει trigger· «ποιος το μαθαίνει» = ειδοποίηση 048 σε owner και εθνικών (tech §Φ5 «Αν σπάσει»). Οι έλεγχοι πρέπει να **ελέγχονται σε 0 γραμμές** σήμερα (κανένας ψευδής συναγερμός πριν από το L) και να **αποτυγχάνουν** σε σενάριο PGlite.

### F3-12 · Δικαιώματα της Φ3 (spec §3 «Δικαιώματα», CLAUDE.md)
- **Καμία αλλαγή δικαιώματος** πέρα από όσα εγκρίθηκαν 21/10 (master «Ρόλοι»). Το `/costs/pnl` (X, έσοδο, κόστη) μένει owner-only (`COSTS_PERMS.owner.pnl`)· το `/costs/rt` το βλέπει και ο dispatcher (σήμερα ήδη επιστρέφει `select *` με `partner_rate`, `total_km` — επιτρεπτό, εξαίρεση κόμιστρου)· ό,τι προστεθεί στο `/costs/rt` για την Ε21 **δεν** φέρνει χρήματα.
- Οι λίστες επιβεβαίωσης (F3-08) **χωρίς ποσά** για dispatcher· οι παλέτες είναι πλήθη, όχι ποσά (C-15).
- Ο ελεγκτής **δεν** αποκτά πρόσβαση σε όψεις χρημάτων χωρίς απόφαση (K-07, C-16).

---

## 4. Τι καταναλώνει η Φ3 από Φ1/Φ2 (I)

| # | Από | Όνομα (όπως ορίζεται) | Χρήση στη Φ3 |
|---|---|---|---|
| I-01 | Φ1 | `v_piece_state` (`executed`, `end_day`, `waiting`, `is_stock`, `overdue`, `nat_order_id`, `order_id`, `pallets`)· `v_national_order_state` (`executed`, `planned`)· `v_shipments` (`kind`, `client_id`, `pallets`, `pallet_exchange`, `temperature_c`, `nat_ready_day`, `nat_due_day`)· `v_rt_cycle` (`ended`, `n_legs`, `date_start/date_end`)· `v_rt_stop_state`· `v_vs_state` | Ε6, Ε7, Ε21, έλεγχοι |
| I-02 | Φ1 | `ct_round_trips.model/start_at/end_at/partner_rate`· CHECK `rt_v2_status` (planned/cancelled), `rt_v2_dates`· EXCLUDE `rt_v2_truck_once` (OWNED `model=2` δεν επικαλύπτονται → το Ε10 έχει το πολύ έναν υποψήφιο `model=2` ανά στιγμή ανά φορτηγό) | Ε7, Ε10, Ε21 |
| I-03 | Φ1 | `rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, deleted_at)` | Ε9 |
| I-04 | Φ1 | `pl_movements.piece_leg_id` (FK `ON DELETE RESTRICT`) + `pl_mov_leg_once (piece_leg_id, event_type) WHERE piece_leg_id IS NOT NULL AND status <> 'reversed'` («one pallet writer per piece leg; F3 fills it») · κωδικός constraint με κείμενο στο `PLAN_CHECK_TEXT` της Φ2: «Η κίνηση έχει ήδη γραμμή παλετών» | Ε11 |
| I-05 | Φ2 | **Συμβόλαιο εγγραφέα `pl_movements.piece_leg_id`:** μόνο οι `plan_*` γράφουν γραμμή με `piece_leg_id`, στο σημείο αγκίστρωσης `plan_h_leg_add(p_piece, p_rt, p_pickup, p_drop, p_actor, p_role, p_leg_no int DEFAULT NULL) RETURNS bigint`· η αναίρεση στο `plan_h_leg_drop(p_leg, p_reason, p_actor, p_role) RETURNS void` (soft delete **μόνο** της κίνησης)· η σάρωση στάσεων `plan_h_stops_sweep`. Η 072 **δεν** γράφει καμία γραμμή `pl_movements` (το rollback της μετρά `piece_leg_id IS NOT NULL` ως γραμμή v5). | Ε11 |
| I-06 | Φ2 | `plan_h_drop_consequences(p_legs bigint[], p_keep_rt bigint, p_chosen_rts bigint[] DEFAULT NULL) RETURNS jsonb`, `plan_h_rt_consequences(p_rt bigint) RETURNS jsonb`, `plan_h_confirm(p_fn, p_key, p_full, p, p_role)`, `plan_h_token`, `plan_h_strip_amounts` (`amount`, `advance`, `expenses`, `invoice_number`)· **μητρώο** ειδών συνεπειών/warnings/ειδοποιήσεων που ελέγχει το build test (Β9) | F3-08 |
| I-07 | Φ2 | `plan_h_resize(p_shipment, p_delta, …)`, `plan_split_piece`, `plan_order_update` (απόφαση 21, προς έγκριση), `plan_rt_update` (dry run σε subtransaction, απόφαση 22), `plan_vs_set_place` (επανασύνδεση με `p_leg_no`), `plan_delete` (σειρά απόφασης 11) | feeder ακολουθεί |
| I-08 | Φ2 | `plan_h_raise(p_code, p_detail)` (`23514`, `HINT 'plan:<code>'`)· `PLAN_RULE_TEXT` / `PLAN_CHECK_TEXT` / `stockRuleError` (ο **ένας** χαρτογράφος)· contract test `plan-contract.test.mjs` (κάθε κωδικός ↔ κείμενο) | νέοι κωδικοί της 073 |
| I-09 | Φ2 | `plan_notices` + `plan_h_notice(p_desk, p_kind, p_tpl_b64, p_args, p_order, p_nat_order, p_rt, p_actor, p_role)`· ήδη ειδοποίηση `natl/costs_without_rt` (απόφαση 13) | C-13 «λείπει δρομολόγιο» |
| I-10 | Φ2 | Worker: `PATCH /costs/rt/:id` σε `model=2` → **409** (απόφαση 27)· `PLAN_WRITES_OPEN = false` ως το L (απόφαση 22) → **καμία** γραμμή v5 πριν από το L· φρουρός `worker/tools/worker-guard.mjs` (Γ5) | Ε7, Ε21, snapshot |
| I-11 | Φ2 | Λίστα φρουρού 23 md5 της 072 + η ίδια η 072 (μετά την εκτέλεση)· `tms-auditor/test/fixtures/live-072.sql` (λήψη) | φρουρός και fixture της 073 |
| I-12 | Φ2 | `plan_board` **δεν** φέρνει X/έσοδο (`price` όχι για warehouse, `partner_rate` μόνο owner/dispatcher) | R-04 |

---

## 5. Συγκρούσεις και παρατηρήσεις (K)

- **K-01 · Δύο ορισμοί «παραδόθηκε» στο απόθεμα.** `stock_natl_delivered`: `delivery ≤ current_date` (ημέρα της βάσης, UTC, συμπεριλαμβάνει τη σημερινή)· v5: `ημέρα Αθήνας του planned_to < σήμερα Αθήνας`. Το Ε6 φέρνει τον v5 κανόνα για τα κομμάτια v5· ο κανόνας για τα μη v5 μένει (R-02). Να γραφτεί ρητά ότι υπάρχουν δύο ως το L.
- **K-02 · Ε6 χωρίς δρόμο εισόδου.** Η Φ2 αρνείται `stock_lot_id` (C-24) και ο facade δεν χαρτογραφεί «Stock Lot» στις εθνικές· 0 εθνικά κομμάτια σήμερα. Χωρίς C-02, ο κλάδος Ε6 είναι κώδικας που δεν τρέχει ποτέ (αρχή 8).
- **K-03 · «Net Price / επιμερισμός τιμής VS: σκόπιμα ανυλοποίητο μέχρι τη φάση P&L» (CLAUDE.md, κλειδωμένο 23/8).** Η Ε7 μοιράζει **τιμή εθνικής** και **X** ανά παλέτα σε κύκλους. Δεν είναι «Net Price» (καμία στήλη/label), αλλά αγγίζει τη διατύπωση «επιμερισμός τιμής VS». Να ειπωθεί ρητά στον owner ότι η Φ3 **δεν** ανοίγει το Net Price (C-06).
- **K-04 · Ε8 είναι ήδη αληθές και ταυτόχρονα κενό.** Το `sum()` αγνοεί NULL από πάντα· όλα τα 202 RT έχουν NULL km, άρα η φθορά είναι παντού 0 και το €/km παντού fallback. Ο φόβος «λάθος €/km» δεν ισχύει σήμερα· ισχύει το «φθορά 0 που μοιάζει με αλήθεια» σε όλο το P&L (και v1). Ένας έλεγχος «κύκλοι χωρίς km» θα έβγαζε 185 v1 + κάθε v5 (C-09).
- **K-05 · Ώρα DKV.** Ο parser κρατά `time` HH:MM χωρίς ζώνη, μόνο κατά την εισαγωγή· δεν αποθηκεύεται, άρα χειροκίνητο ξανα-ταίριασμα αργότερα δεν έχει ώρα. Οι γραμμές μισού μήνα διοδίων σπάνε ανά ημέρα από τις διελεύσεις (που έχουν `time`).
- **K-06 · Το «κλειστό» είναι σήμερα λογική browser σε 3 αρχεία** (`expenses.js`, `costs.js`, `core/rt-feed.js`). Η Ε21 λέει «Worker»· αν ο Worker δώσει νέο πεδίο, αλλάζουν και τα 3 αρχεία (οθόνες = Φ4, ή Φ3 κατά C-04)· αν δώσει παράγωγο `status`, το API λέει «closed» για κάτι που η βάση ποτέ δεν γράφει.
- **K-07 · Ο ελεγκτής δεν βλέπει το X.** `tms_check_runner` χωρίς SELECT σε `ct_settings`/`ct_v_rt_revenue`. Ο έλεγχος «X ανά VS ∉ {0, 650, 850}» με σταθερές στο SQL του ελέγχου = δεύτερη πηγή του X (αρχή 3)· με grant = άνοιγμα χρημάτων στον ελεγκτή (αρχή 5). C-16.
- **K-08 · Διπλή DELIVERY ΚΑΙ διπλή LOADING σε VS.** Το spec ονομάζει μόνο τη DELIVERY (`plOnDelivered`)· η LOADING της εξαγωγής VS (`plOnOrderSaved` intl) συγκρούεται με τον feeder στην ίδια ελληνική στάση. Και οι δύο γράφουν χωρίς `piece_leg_id`, άρα το `pl_mov_leg_once` δεν τις βλέπει.
- **K-09 · `PL_REF_MAP.order_rec` → μόνο `orders`.** Το `plOnOrderSaved(…, 'natl')` στέλνει legacy id εθνικής ως `order_rec`· 0 κινήσεις σε στάσεις εθνικών σήμερα. Ύποπτο, όχι αποδεδειγμένο· ο δρόμος φεύγει στο L. Να μετρηθεί/δοκιμαστεί πριν οποιαδήποτε αλλαγή.
- **K-10 · Κανόνες παλετών στον Worker, feeder στη βάση.** Το `pl_movements` δεν έχει κανένα trigger· τα «confirmed δεν αλλάζει ποτέ», «ADJUSTMENT θέλει reason», «pending σβήνεται hard» ζουν στο `plValidate`/handlers του Worker. Ένας feeder μέσα στα `plan_*` γράφει απευθείας στον πίνακα → οι ίδιοι κανόνες σε δύο σημεία (αρχή 3), εκτός αν μπουν στη βάση (CHECK/trigger, νέο trigger = B-54).
- **K-11 · `pl_movements` χωρίς `deleted_at`.** Η pending αναιρείται με hard DELETE (σημερινή πρακτική του feeder browser)· το FK `piece_leg_id ON DELETE RESTRICT` δεν εμποδίζει τίποτα αφού οι κινήσεις κομματιού σβήνονται soft. Μια pending που ξεχάστηκε σε σβησμένη κίνηση = ορφανή (έλεγχος tech B-80).
- **K-12 · Κανόνας «ποσά μόνο owner/accountant» vs παλέτες.** Οι παλέτες στη λίστα συνεπειών δεν είναι ποσά χρημάτων· η Φ2 κόβει μόνο `amount/advance/expenses/invoice_number`.
- **K-13 · Η Ε7 δεν έχει ιδιοκτήτη για το front.** Spec §5 βάζει τα `costs.js:193-199, 1054, 1067-1072` στην Ε7 αλλά η Ε7 λείπει από τη λίστα οθονών της Φ4.
- **K-14 · `ct_v_rt_revenue/costs/pnl` δεν είναι `security_invoker`** και έχουν grants INSERT/UPDATE κληρονομιάς σε `service_role`. Η Φ3 δεν τα αλλάζει (R-03, «μόνο ό,τι ζητήθηκε»)· αναφέρεται ως παρατήρηση.

---

## 6. Επιλογές για τον owner (C) — 💶 = χρήματα, ο agent **δεν** αποφασίζει

Κάθε επιλογή: **πρόταση** (μόνο όπου δεν είναι χρήματα) / εναλλακτικές. Στα 💶 ο agent δίνει μόνο τις επιλογές και ένα παράδειγμα με αριθμούς.

- **C-01 · Σειρά εκτέλεσης.** Η 073 προϋποθέτει εκτελεσμένη 072 και deploy Φ2 (σήμερα: όχι). Πρόταση: το πλάνο Φ3 γράφεται τώρα πάνω στα Interfaces, αλλά ο φρουρός της 073 ελέγχει το md5 της **ζωντανής** 072 και η εκτέλεση γίνεται μετά το Κ3 της Φ2. / Πλάνο Φ3 μόνο μετά την εκτέλεση της Φ2.
- **C-02 · Ε6: πώς ένα εθνικό κομμάτι παρτίδας μπαίνει στο v5.** (α) η Φ3 επιτρέπει `stock_lot_id` στο `plan_orders_create` (αίρει το C-24 της Φ2, ξανακοιτάζει `stock_guard_natl`) και ο κλάδος του `stock_v_pieces` διαβάζει από `v_piece_state`· (β) ο κλάδος γράφεται για εθνικές **με αποστολές** (ασφαλής, 0 γραμμές) και ο δρόμος εισόδου μένει ανοιχτό θέμα· (γ) η Ε6 αναβάλλεται ώσπου να υπάρξει πρώτο εθνικό κομμάτι παρτίδας (σήμερα 0) και ο ελεγκτής μετρά «εθνική με `stock_lot_id` και αποστολές». Πρόταση: (β) + έλεγχος, γιατί το (α) αλλάζει κανόνα 057 που ενέκρινε ο owner.
- **C-03 · Πώς η 073 αγγίζει τη 072.** (α) ένας νέος βοηθός `plan_h_pallet_sync` και μία γραμμή κλήσης σε κάθε σημείο αγκίστρωσης (φρουρός md5 ανά συνάρτηση)· (β) πλήρης επαναγραφή των συναρτήσεων της 072 μέσα στην 073. Πρόταση: (α).
- **C-04 · Ποιος κάνει τις οθόνες της Ε7, Ε11 (ετικέτα), Ε21.** (α) Φ3, πίσω από `WN_V5`, με rigs· (β) προστίθενται ρητά στη λίστα οθονών της Φ4. Πρόταση: (β), με γραμμή στο DECISION_LOG ώστε να μη χαθούν (K-13).
- **C-05 💶 · Σε ποιον κύκλο πάει το έσοδο μιας εθνικής που περνά από τη Βέροια** (δύο κινήσεις, δύο κύκλοι). Παράδειγμα: εθνική 400 €, 10π, Κατερίνη → Βέροια (ΑΝΟΔΟΣ, κύκλος Α) → Αθήνα (ΚΑΘΟΔΟΣ, κύκλος Β). Επιλογές: (α) όλο στον κύκλο της **πρώτης** κίνησης (tech §Φ3: «στην πρώτη εθνική κίνηση του (μετρά μία φορά)»): Α 400, Β 0· (β) όλο στον κύκλο της **τελευταίας** κίνησης (παράδοση): Α 0, Β 400· (γ) μοιρασμένο ανά κίνηση (π.χ. 50/50 ή κατά km/στάσεις): Α 200, Β 200. Το spec λέει μόνο «ανά παλέτα».
- **C-06 💶 · Το «− X» του διεθνούς RT για VS στο v5.** Παράδειγμα: VS εισαγωγής 33π, X = 650· 20π σε κύκλο Δευτέρας, 13π απόθεμα. (α) Το διεθνές RT χάνει όλο το 650 από την καταχώρηση· ο εθνικός κύκλος παίρνει 394 (650 × 20/33), τα 256 είναι «μη ανατεθειμένα» ώσπου να φύγουν· (β) το διεθνές RT χάνει μόνο τα μερίδια που μπήκαν σε κύκλο (394), και τα 256 μένουν στο διεθνές ως τότε (tech §Φ3: «− Σ μεριδίων X των κομματιών που **μπήκαν** σε RT v5»). Επίσης: για VS κομμάτι **παρτίδας** 057 το σημερινό `stock_vs_charge` κόβει X × min(π, 33)/33· στο v5 ο παρονομαστής είναι οι παλέτες κόμβου της παραγγελίας (spec). Ποιος ισχύει όταν συμπίπτουν;
- **C-07 · Μορφή της εκκρεμότητας «κόμιστρο λείπει» στο P&L.** (α) νέα στήλη-σημαία στο τέλος του `ct_v_rt_pnl` (`partner_rate_missing`) που η οθόνη δείχνει όπως το `driver_pay_pending`· (β) μόνο έλεγχος ελεγκτή. Πρόταση: (α) + έλεγχος (το spec λέει «και στο P&L»).
- **C-08 · Το «κλειστό» του `/costs/rt` για `model=2`.** (α) νέο πεδίο `ended` (true/false/null αν απέτυχε η ανάγνωση) + αλλαγή στα `expenses.js`, `costs.js`, `rt-feed.js`· (β) ο Worker γράφει στην απάντηση `status: 'closed'` όταν `ended` (καμία αλλαγή οθόνης, αλλά το API λέει τιμή που δεν υπάρχει στη βάση)· (γ) το `ended` μπαίνει σε όψη που διαβάζει ο Worker αντί για τον πίνακα. Πρόταση: (α) — ένας ορισμός, χωρίς ψεύτικο status.
- **C-09 · Ε8 στην πράξη.** (α) καμία αλλαγή όψης (το NULL ήδη αγνοείται), μόνο test που το αποδεικνύει + έλεγχος «`model=2` OWNED χωρίς km»· (β) επιπλέον σημαία `wear_unknown` στο P&L όταν `total_km IS NULL` (θα άναβε σε **όλα** τα σημερινά RT)· (γ) έλεγχος χωρίς διάκριση v1/v5 (185 συναγερμοί από την πρώτη μέρα). Πρόταση: (α), και ο owner αποφασίζει χωριστά αν θέλει (β) για όλο το P&L.
- **C-10 · Ζώνη ώρας της ώρας DKV.** (α) Europe/Athens πάντα (οι εθνικοί κύκλοι κινούνται στην Ελλάδα)· (β) ζώνη της χώρας του σταθμού. Και: αποθηκεύεται η ώρα (νέα στήλη `ct_cost_lines`, εκτός σημερινού σχήματος) ή χρησιμοποιείται μόνο την ώρα της εισαγωγής; Πρόταση: (α), χωρίς αποθήκευση στη Φ3.
- **C-11 · Δύο ή περισσότεροι υποψήφιοι χωρίς ώρα.** (α) πάντα `review` όταν ένας από αυτούς είναι `model=2` (tech: «ποτέ τυχαία επιλογή»)· (β) ο σημερινός κανόνας «περισσότερες ημέρες»/`rt_pref` και για `model=2`. Πρόταση: (α).
- **C-12 · `dl_v_rt_route` για κύκλο `cancelled`.** (α) όπως ο κλάδος v1 (κανένα φίλτρο status· σβησμένες στάσεις εκτός)· (β) κανένα route. Πρόταση: (α) (ίδιος κανόνας για v1 και v5).
- **C-13 · Κανάλι του «λείπει δρομολόγιο» από το DKV.** (α) `plan_notices` `to_desk='natl'` (όπως `costs_without_rt` της Φ2)· (β) μόνο έλεγχος ελεγκτή (B-22/νέος)· (γ) και τα δύο. Και ποιον αφορά όταν το φορτηγό κάνει και διεθνή δουλειά. Πρόταση: (γ) για φορτηγά με κύκλο `model=2` εκείνη την εβδομάδα, αλλιώς μόνο ελεγκτής.
- **C-14 · Μισές παλέτες.** `shipment_pieces.pallets numeric(6,1)`, `pl_movements.taken integer`. (α) η φόρμα v5 δέχεται μόνο ακέραιες για PE· (β) στρογγύλευση (ποια;) στον feeder· (γ) άρνηση feeder με κωδικό. Σήμερα 0 μη ακέραιες. Πρόταση: (γ), με ελληνικό μήνυμα.
- **C-15 · Παλέτες v5 (μία ερώτηση με υπο-ερωτήματα, όλα στον κλειδωμένο πίνακα §3):**
  - (i) DELIVERY v5: **pending** που επιβεβαιώνει ο χρήστης (spec §3 «Ο χρήστης απλώς επιβεβαιώνει») ή **confirmed** αυτόματα net 0 (PALLETS_ARCHITECTURE #2, `plOnDelivered` σήμερα);
  - (ii) Κύκλος PARTNER: #2 δεν ισχύει (όχι δικό μας όχημα)· γράφεται DELIVERY προς τον πελάτη, PARTNER_PICKUP/DROPOFF (#4/#5), ή τίποτα («διαφανής αγωγός», flows ροή 13 κενό 4);
  - (iii) Φρουρός διπλής εγγραφής σε στάση VS: (α) στη βάση (το feeder δεν γράφει αν υπάρχει γραμμή στην ίδια `order_stop_id`, και ένας μόνο συγγραφέας ανά στάση γέφυρας)· (β) στον Worker `/pallets/movements` (άρνηση POST χωρίς `piece_leg_id` σε στάση με `via_hub`)· (γ) στον browser (`plOnDelivered`/`plOnOrderSaved` παραλείπουν στάσεις γέφυρας). Ποιος από τους δύο γράφει όταν υπάρχει ήδη confirmed από το Ημερήσιο;
  - (iv) Πύλη partner (§4.2) για `model=2`: μόνο κύκλοι PARTNER ή όλοι (η σημερινή όψη δεν φιλτράρει `trip_type`)· κλειδί δελτίου ανά κίνηση ή ανά στάση;
  - (v) Confirmed κίνηση σε κίνηση κομματιού που φεύγει (Μεταφορά/Καθαρισμός/Διαγραφή): μπαίνει στη λίστα με token και αντιλογίζεται αυτόματα μετά το token, ή μένει για χειροκίνητο αντιλογισμό από τη λογιστική;
  - (vi) Ετικέτα «εθνική #…»: ο Worker `GET /pallets/movements` προσθέτει `nat_order_id`, ή όψη· αλλάζει το `PL_REF_MAP`;
  - (vii) Οι παλέτες στη λίστα επιβεβαίωσης φαίνονται στον dispatcher (πλήθη, όχι ποσά);
- **C-16 💶 · Ο έλεγχος «X ανά VS ∉ {0, 650, 850}».** Το άθροισμα μεριδίων πάνω σε **όλα** τα ζωντανά φύλλα (πάντα = X, πιάνει μόνο λάθος παρονομαστή/διπλό) ή μόνο στα **ανατεθειμένα** (θα έβγαζε 394 στο παράδειγμα του C-06 και θα χτυπούσε κάθε μέρα); Και πώς διαβάζει ο ελεγκτής το X: σταθερές στο SQL (δεύτερη πηγή), grant SELECT στο `ct_settings` (άνοιγμα), ή συνάρτηση `SECURITY DEFINER` που επιστρέφει μόνο ids χωρίς ποσά (πρόταση τεχνικά, η επιλογή του συνόλου είναι owner).
- **C-17 · Ποιοι έλεγχοι του §8 μπαίνουν στη Φ3** (πίνακας F3-11) και αν ζουν στην 073 ή σε χωριστή `073b_plan_monitoring` (πρότυπο 057b). Πρόταση: όσοι δεν θέλουν L στη Φ3, σε `073b` με δικό του «ναι».
- **C-18 💶 · «Σύνολο τιμών εβδομάδας» για τον έλεγχο εσόδων.** Η εβδομάδα (Σάββατο–Παρασκευή, `TmsWeek`) μιας παραγγελίας ορίζεται από: (α) ζητούμενη ημέρα φόρτωσης· (β) ζητούμενη ημέρα παράδοσης· (γ) ημέρα καταχώρησης (η τιμολόγηση είναι πλέον από την καταχώρηση, Β0). Και ενός κύκλου από `date_start` ή `date_end`; Χωρίς αυτό ο έλεγχος δεν κλείνει ποτέ σε εβδομάδες που κόβουν κύκλο στη μέση.
- **C-19 💶 · Εθνική με τιμή 1 € (άδειες παλέτες από Βέροια, spec §3) ή «Χωρίς τιμή».** Η Φ2 αρνείται `no_price` στη δημιουργία· μια εθνική που αργότερα χάνει την τιμή της (accountant PATCH) δίνει έσοδο 0 στον κύκλο. Σημαία ή έλεγχος;

---

## 7. Εκτός Φ3 (X)

- **X-01 Φ5 (`074`, ημέρα L):** `plan_config`· γέφυρα VS (trigger) και ξανακόψιμο κομματιών· αποσύνδεση Direct NL στην ίδια συναλλαγή με τη γέφυρα (η Φ3 μόνο δεν μετρά διπλά)· έλεγχοι που θέλουν L (VS ≥ L χωρίς αποστολή, νέα NL/GL/CL μετά το L, VS χωρίς ημέρα κόμβου)· Ε17 (B-26/B-42/B-10/B-47).
- **X-02 Φ5 Worker:** Ε16 (facade RBAC, AI chat, γρήγορη διόρθωση, Επαναφορά Κάδου), Ε18 (`/costs/rt` from/to υποχρεωτικά, όριο 1000, `truncated`), Ε19 (διαγραφή διεθνούς VS με λίστα)· `PLAN_WRITES_OPEN = true`.
- **X-03 Φ4 (οθόνες):** Ε1–Ε5, Ε9 ανάγνωση (`expenses.js`, `payroll.js`, `entity.js:2346`), Ε12–Ε15, Ε20· `planFetch`· board· ό,τι από C-04 πάει στη Φ4.
- **X-04 Β0 (κλειστό):** Ε4 τιμολόγηση από την καταχώρηση, 071a (εκτελέστηκε 22/10)· η πύλη δελτίου τιμολόγησης της 25/8 καταργήθηκε για όλες τις παραγγελίες — η Φ3 δεν την ξαναφέρνει (η «πύλη» της Ε11 είναι η **partner P&L** πύλη §4.2, όχι η τιμολόγησης).
- **X-05 Μισθοδοσία:** καμία αλλαγή στο 011 (ποσά κενά, γράφει η λογιστική)· «πληρωμένη» (απόφαση 10 της Φ2) και γραμμή ΤΟΠΙΚΟ (απόφαση 33) ανήκουν στη Φ2. Ο κανόνας κατανομής τελών DKV (13/9) δεν αλλάζει.
- **X-06 Net Price** (κλειδωμένη αναβολή, K-03)· invoiced στο `national_loads`· CEO dashboard (spec §5 «Δεν επηρεάζονται»).
- **X-07 Ε8 μέτρηση km:** το spec λέει ρητά «δεν το μετράμε»· καμία πηγή km (MyGeotab = «Επόμενα»).
- **X-08 Groupage διεθνούς εξαγωγής προς Βέροια** (αναβάλλεται, spec §3 VS).
- **X-09 Φ6/Φ7:** μετρήσεις κυκλοφορίας 07:30/13:00· αφαίρεση νεκρού κώδικα (`plOnOrderSaved` κλάδος natl, `_syncNationalLoad` κ.λπ.).

---

## 8. Αποδοχή της Φ3 (από master + spec §8–§9)

1. Η 073 εφαρμόζεται σε PGlite (λήψη `live-073.sql` + 071 + 071b + 072 + 069 + 057 ζωντανά κείμενα): rules test με εβδομάδα-σενάριο v5 (έσοδο κύκλων κατά C-05/C-06, X ανά VS = X, διαδρομή ανά πλευρά, feeder LOADING/DELIVERY/τίποτα στον κόμβο, μία εγγραφή ανά κίνηση, φρουρός διπλής, DKV `review`)· τελειώνει με σκόπιμο σφάλμα.
2. Σε δεδομένα χωρίς v5: κάθε αλλαγμένη όψη = ζωντανό κείμενο, γραμμή προς γραμμή (F3-10)· `tests/sql-073-drafts.test.js` (ASCII, ένα DO, md5 φρουρού δύο φορές, γεννιέται κλειστό, κάθε κωδικός με περίπτωση και κείμενο).
3. Στην παραγωγή, μετά την εκτέλεση: `ct_v_rt_pnl` και `dl_v_rt_route` γραμμές = πριν (σήμερα 185 / 186)· fingerprint RT/`dl_entries` ίδιο· γραμμές v5 = 0· B-54 = πριν (+ νέα triggers αν C-15 τα φέρει).
4. Worker: tests `matchRoundTrip` πριν = μετά για `model=1`, νέα για `model=2`· φρουρός πριν/μετά (R-08)· smoke `/costs/rt` (ended), `/costs/pnl`, `/costs/pallet-gate` 200 για owner, 403 για dispatcher στο pnl.
5. Νέοι έλεγχοι: 0 γραμμές στην παραγωγή σήμερα, κόκκινοι στο σενάριο PGlite.
6. Ίχνος: `docs/sessions/`, γραμμή «Now», DECISION_LOG (C-xx που ενέκρινε ο owner), CLAUDE.md (σημάδι φρουρού αν προστεθεί).
