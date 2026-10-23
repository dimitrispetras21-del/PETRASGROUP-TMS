# Φ2 · Εθνικά v5: απαιτήσεις (072 `plan_*` + Worker `/plan/*`)

> Εξαγωγή απαιτήσεων για το πλάνο Φ2, 22/10/2026. Μόνο ανάγνωση: κανένα SQL εγγραφής, κανένα deploy, κανένα commit.
> Πηγές με σειρά ισχύος: (1) spec `docs/superpowers/specs/2026-10-21-national-v5-design.md` (εγκεκριμένο 21/10)· (2) `docs/DECISION_LOG.md` 21/10 και 22/10 (Εθνικά v5)· (3) master plan `docs/superpowers/plans/2026-10-21-national-v5-master.md`, Task Φ2· (4) F1 plan `docs/superpowers/plans/2026-10-21-f1-national-v5-schema.md` (Interfaces, «Τι ΔΕΝ κάνει η Φ1»)· (5) tech draft `docs/national-v5/tech-draft-2026-10-21.md` §Φ2 (όπου δεν το αλλάζει το spec §7)· (6) flows `docs/national-v5/flows-2026-10-21.md` (τα «Κενά» και οι 10 ερωτήσεις, απαντημένες 21/10 μέσα στο spec §3).
> Ζωντανή βάση (μόνο SELECT, 22/10): 071 + 071b εκτελεσμένα· `shipments + shipment_pieces + rt_stops + piece_legs + plan_notices` = **0** γραμμές· `ct_round_trips where model=2` = **0**· `dl_sync_from_rt` md5 `331cea3a8987b74a9b0add698df9b158` (έχει ακόμη `needs_review`)· `dl_entries.entry_type` ∈ {`trip`, `adjustment`, `payment_bank`, `payment_cash`}· **κανένας πίνακας περιόδων μισθοδοσίας** (δεν υπάρχει «κλειστή περίοδος» στη βάση). Ο Worker (`worker/src/index.js`, 5.836 γραμμές) δεν έχει ακόμη τίποτα από `PLAN_PERMS`, `/plan/`, `via_hub`, `shipments`, `rt_stops`.
>
> Μορφή ταυτοτήτων: **R-xx** κοινός κανόνας, **F2-xx** συνάρτηση/διαδρομή, **C-xx** επιλογή για έγκριση owner (σιωπή ή αμφισημία του spec), **K-xx** σύγκρουση με τους ζωντανούς κανόνες της 071, **X-xx** εκτός Φ2.

---

## 0. Τι παραδίδει η Φ2 (master plan, Task Φ2)

«`plan_*` + `/plan/*` + `PLAN_PERMS`. Μία αλυσίδα Worker με έναν κάτοχο» (spec §6). Με πλήρη κώδικα και tests για καθένα από:
- Παραγγελίες: `plan_orders_create`
- Ανάθεση/σπάσιμο: `plan_put_pieces`, `plan_put_group`, `plan_move_pieces`, `plan_split_piece` (+ split+put μόνο για απόθεμα)
- Κύκλος: `plan_rt_create`, `plan_rt_update`, `plan_rt_clear`, `plan_delete`
- VS: `plan_vs_set_day`, `plan_vs_set_place`
- Λοιπά: `plan_local_loading`, εγγραφή/ανάγνωση `plan_notices`
- Worker: `/plan/*` + `PLAN_PERMS`, οικογένεια `plan:` στον **ίδιο** `stockRuleError`, `GET /plan/board`, `GET /plan/vs-state`
- Deploy: φρουρός + `var PLAN_PERMS = {`· **0** γραμμές στην παραγωγή μετά το deploy

Αρχεία (κατά το πρότυπο της 071, master «Βάση»): `worker/migrations/drafts/072_plan_functions.sql` (ένα DO block, ASCII), `_dryrun` (παράγεται), `_verify` (μόνο SELECT), `_test` (PGlite, τελειώνει με σκόπιμο σφάλμα), `_rollback` (DROP FUNCTION, αρνείται αν υπάρχουν γραμμές v5), `tests/sql-072-drafts.test.js`, `tms-auditor/test/plan-072.test.mjs` (+ fixture λήψης από την παραγωγή), `worker/test/plan-contract.test.mjs`, `worker/test/plan-perms.test.mjs`, `worker/test/plan-tables-guard.test.mjs` (tech draft §Φ2 Tests).

---

## 1. Κοινοί κανόνες για κάθε `plan_*` (R)

| # | Κανόνας | Πηγή |
|---|---|---|
| R-01 | Κάθε εγγραφή v5 γίνεται **μόνο** από `plan_*`: `SECURITY DEFINER`, `SET search_path = public`, παράμετρος `p_actor text` (και ρόλος, βλ. C-03), `audit_log` ανά αλλαγή με actor τον χρήστη, όχι «trigger». | spec §2.1 «Όλες οι εγγραφές του v5 περνούν από `plan_*` (`SECURITY DEFINER`, `p_actor`, `audit_log`)»· tech §1.1. `audit_log(actor, role, action, table_name, record_id, before_data, after_data, created_at)` (μετρήθηκε) |
| R-02 | Άρνηση = `RAISE … USING ERRCODE '23514', HINT 'plan:<code>'`. Κάθε κωδικός έχει ελληνικό κείμενο στον Worker. | spec §2.1· F1 Interfaces «Κωδικοί `plan:`» |
| R-03 | Γεννιέται κλειστό: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`· `GRANT EXECUTE … TO service_role` **μόνο** για τα δημόσια `plan_*` που καλεί ο Worker (οι βοηθοί `*_problem` της 071 μένουν κλειστοί για `service_role`). | CLAUDE.md αρχή 5· tech §1.2· 071 §10 |
| R-04 | Μία πράξη = μία συνάρτηση = μία συναλλαγή (π.χ. groupage N παραγγελιών σε ένα `plan_orders_create`· ανάθεση σε νέο κύκλο = δημιουργία κύκλου + στάσεις + κινήσεις μαζί). | tech §1.3· spec §7 «`plan_move_pieces` … σε μία συναλλαγή» |
| R-05 | Πράξεις που σβήνουν: **δύο βήματα**. `dry_run` → λίστα συνεπειών + `confirm_token`· εκτέλεση με το token· αλλαγή στο μεταξύ → `plan:stale_confirm`. | spec §2.1 |
| R-06 | Λίστα συνεπειών **χωρίς ποσά** για dispatcher («μισθοδοσία: πληρωμένη, εβδ. 42», «3 γραμμές DKV»)· ποσά μόνο owner και accountant· `driver_ledger` κλειστό για dispatcher. | spec §3 «Δικαιώματα»· DECISION_LOG 21/10 (2) |
| R-07 | Κύκλος που «δεν έγινε» = `status = 'cancelled'`, λόγος στο `audit_log`. Καμία στήλη `deleted_at` στο `ct_round_trips`. | spec §2.1· 071 |
| R-08 | Κανένας καθρέφτης: **ποτέ** `national_orders.truck_id / partner_id / status`. | spec §2.1, §7· master «Κώδικας και ποιότητα» |
| R-09 | «Έγινε» = η ημέρα Αθήνας του `planned_to` πέρασε· διαβάζεται από `v_piece_state`/`v_rt_stop_state`/`v_rt_cycle`, ποτέ γραμμένο status. Ακυρωμένο ≠ εκτελεσμένο. | spec §2.3 |
| R-10 | Μόνο soft delete στους 4 πίνακες σχεδίου (`deleted_at`, `deleted_reason`, `deleted_by` όλα μαζί). | 071 `plan:hard_delete`, CHECK `*_del` |
| R-11 | Οι κινήσεις κομματιού (`piece_legs`) δεν αλλάζουν ποτέ: μεταφορά = soft delete + νέα κίνηση. Οι στάσεις δεν αλλάζουν κύκλο· τα κομμάτια δεν αλλάζουν αποστολή/γονέα· οι αποστολές δεν αλλάζουν παραγγελία. | 071 `leg_locked`, `stop_locked`, `piece_locked`, `shipment_locked` |
| R-12 | Τα `start_at / end_at / date_start / date_end` ενός κύκλου v5 τα γράφει **μόνο** η βάση από τις ζωντανές στάσεις (`plan_rt_window_sync`), με μοναδική εξαίρεση το INSERT του `plan_rt_create` (K-08). | spec §2.1 πίνακας· 071 |
| R-13 | Κάθε άρνηση φαίνεται ως ελληνικό μήνυμα (422)· κάθε 5xx γράφεται στο `app_errors` (front, Φ4)· άγνωστος κωδικός = 422 που τον ονομάζει, ποτέ σιωπηλό 500. | spec §8· tech §Φ2 «Αν σπάσει» |
| R-14 | Καμία `/plan/*` απάντηση δεν επιστρέφει X, έσοδο, κόστος, περιθώριο, καύσιμα, ποσά μισθοδοσίας/DKV (εκτός owner/accountant στις λίστες συνεπειών). Το κόμιστρο συνεργάτη (`partner_rate`) **είναι** ορατό και εγγράψιμο από dispatcher (ρητή εξαίρεση, κλειδωμένη 21/10). | spec §3 Χρήματα, Δικαιώματα· CLAUDE.md κλειδωμένες αποφάσεις |
| R-15 | Νέοι πίνακες **ποτέ** στο `TABLES` του facade. | spec §2.1 |
| R-16 | Οι υπάρχουσες συναρτήσεις ελέγχου της 071 (`plan_shipment_problem`, `plan_leg_problem`, `plan_rt_problem`, `plan_local_loading_problem`) είναι η **μία** πηγή κανόνων· οι `plan_*` τις καλούν (π.χ. στο dry run), δεν τις αντιγράφουν. | F1 Interfaces «Συναρτήσεις»· αρχή 3 |

---

## 2. Οι συναρτήσεις

### F2-01 `plan_orders_create`
- **Σκοπός:** νέες εθνικές παραγγελίες (μία ή N, π.χ. groupage) από τη φόρμα εθνικής v5 ή το «+» → «Νέα παραγγελία». spec §2.1 πίνακας («φόρμα εθνικής v5 (`plan_orders_create`)»), master Φ2 («N σε μία κλήση»).
- **Είσοδοι:** `p jsonb` με N παραγγελίες· ανά παραγγελία: `client_id`, `price`, `reference`, `goods` (είδος), `temperature_c`, `pallet_exchange`, `notes`, και 1..K ζεύγη Α→Β με `origin_location_id`, `dest_location_id`, `pallets`, `load_from/load_to`, `deliver_from/deliver_to`. Προαιρετικά στόχος ανάθεσης: `rt_id` + `side` (ή «νέος κύκλος» με όχημα, βλ. F2-02/F2-06), για το «+» σε σειρά. `p_actor`.
- **Συμπεριφορά:**
  - Γράφει `national_orders` ×N με τα πεδία του spec §7: «πελάτης, τιμή, reference, παλέτες, θερμοκρασία, είδος, σημειώσεις, ζητούμενη φόρτωση/παράδοση (`loading_datetime`/`delivery_datetime`), πρώτος και τελευταίος τόπος (`pickup_location_1_id`/`delivery_location_1_id`). **Ποτέ** `truck_id`, `partner_id`, `status`». Οι στήλες είναι `date` (μετρήθηκε): `loading_datetime`/`delivery_datetime` = ημέρες Αθήνας.
  - `shipments`: μία ανά ζεύγος Α→Β (tech §Φ2), με όλα τα πεδία του σχήματος εθνικής αποστολής (`shipments_shape`: τόποι, παλέτες, 4 άκρα παραθύρου NOT NULL).
  - `shipment_pieces`: 1 ανά αποστολή, `pallets` = της αποστολής.
  - Αν δόθηκε στόχος: στάσεις + κινήσεις στην ίδια συναλλαγή (όπως F2-02).
  - Η Βέροια επιτρέπεται ως Α ή Β («κανονικός τόπος», spec §3 Board· π.χ. άδειες παλέτες 1 €). Καμία άρνηση `hub_endpoint` (spec §7 φεύγει).
- **071:** γράφει `shipments`, `shipment_pieces` (+ `rt_stops`, `piece_legs` με στόχο)· διαβάζει `locations.is_hub`. Ελέγχεται στο COMMIT από `plan_chk_shipments`/`plan_chk_pieces` (`pieces_sum`).
- **Αρνήσεις:** `no_price` (τιμή ≤ 0 ή κενή, spec §7 «άρνηση `no_price`»)· `no_client`, `no_window` (tech §Φ2)· CHECK `shipments_ends` (Α = Β), `shipments_win`, `shipments_pallets`, `shipments_shape`, `shipments_intl_is_bridge`.
- **Ρόλοι:** owner, dispatcher. management/accountant/warehouse = 403 (master αποδοχή: «`POST /plan/orders` ως management = 403»).
- **Ειδοποιήσεις:** καμία.
- **Προειδοποιήσεις (όχι αρνήσεις):** μεικτές θερμοκρασίες στην ίδια πλευρά «≥ 2 °C» (spec §7 B-87· ο έλεγχος του ελεγκτή είναι Φ3/Φ5, η οθόνη Φ4). Υπέρβαση 33: μόνο ένδειξη.
- **Αποδοχή/tests:** groupage 3 πελατών = 1 κλήση, 3 παραγγελίες (tech Φ4 rig)· `no_price` και κάθε CHECK με δική του περίπτωση· `national_orders.truck_id/partner_id/status` NULL μετά από κάθε κλήση.

### F2-02 `plan_put_pieces`
- **Σκοπός:** ανάθεση συγκεκριμένων κομματιών σε πλευρά κύκλου («+» → «Από αναμονή», «Σε φορτηγό ▾» Βέροιας, ανάθεση από ΠΡΟΣ ΑΝΑΘΕΣΗ). tech §Φ2 (`plan_put_pieces(rt_id, side, pieces[], stops)`).
- **Είσοδοι:** `rt_id` (ή αίτημα νέου κύκλου, C-05), `side` ('KATHODOS'|'ANODOS'), λίστα κομματιών, στάσεις (υπάρχουσες ή νέες με `location_id`, `planned_from`, `planned_to`), προαιρετικά `take_pallets` ανά κομμάτι-απόθεμα (split+put, F2-05), `p_actor`.
- **Συμπεριφορά:**
  - Δημιουργεί/επαναχρησιμοποιεί `rt_stops` (με επαναρίθμηση `seq` όπου χρειάζεται) και γράφει `piece_legs` (`leg_no` = επόμενο ζωντανό).
  - **Μόνο ολόκληρα κομμάτια**, εκτός από απόθεμα: «Το "+" δέχεται μέρος **μόνο από απόθεμα** … Φορτίο που μόλις φτάνει μπαίνει από το "+" μόνο ολόκληρο» (spec §3 Board). Απόθεμα = `v_piece_state.is_stock` (κομμάτι-παιδί χωρίς δική του κίνηση).
  - VS: αν μπαίνει το **πρώτο** κομμάτι ενός VS σε φορτηγό άλλης ημέρας από `orders.cross_dock_date`, γράφει την ημέρα στη διεθνή (λογική F2-10) με ίχνος και ειδοποίηση στον διεθνών (spec §3 VS: «Αν ο εθνικών αναθέσει το VS σε φορτηγό άλλης ημέρας, η ημέρα γράφεται και στη διεθνή, με ίχνος και ειδοποίηση»). Κομμάτι-απόθεμα **δεν** αγγίζει τη διεθνή («Τη διεθνή την ξαναγράφει μόνο η ανάθεση του **πρώτου** κομματιού»).
  - Αν δύο ελληνικές στάσεις του ίδιου VS μπουν σε διαφορετικές ημέρες: ισχύει «η πρώτη» (spec §3 VS).
  - Υπέρβαση 33 = προειδοποίηση, όχι άρνηση (spec §3 VS, design §3 «+»).
- **071:** γράφει `rt_stops`, `piece_legs`· διαβάζει `v_piece_state`, `v_piece_pos`, `v_shipments`. Κανόνες COMMIT: `chain`, `chain_time`, `leg_place`, `leg_order`, `stop_seq`, `stop_order`, `side_order`, `rt_cancelled`, `rt_not_v2`, `piece_dead`, `leg_stop_dead`.
- **Αρνήσεις (νέες):** `piece_busy` (κομμάτι με ζωντανή κίνηση που καλύπτει ήδη το σκέλος), `piece_split` (κομμάτι με ζωντανά παιδιά), `not_stock` (ποσότητα σε κομμάτι που δεν είναι απόθεμα), `rt_cancelled`. Από την 071 όλοι οι παραπάνω κανόνες COMMIT.
- **Ρόλοι:** owner, dispatcher.
- **Ειδοποιήσεις:** `plan_notices` `to_desk='intl'` όταν άλλαξε η ημέρα VS (βλ. F2-10).
- **Αποδοχή/tests:** σενάρια εβδομάδας 3–9/10 (ΕRT-1/2/3: 19/32/31 παλέτες, tech §Φ2 Tests)· VS σε φορτηγό Τρίτης ενώ η διεθνής λέει Δευτέρα → `orders.cross_dock_date` = Τρίτη + 1 ειδοποίηση· απόθεμα στην Τετάρτη → `cross_dock_date` αμετάβλητο.

### F2-03 `plan_put_group`
- **Σκοπός:** «Βάζει όλη την κάρτα (π.χ. τις 3 παραδόσεις του VS-118) σε: υπάρχοντα κύκλο της ημέρας, ελεύθερο φορτηγό (νέος κύκλος) ή συνεργάτη (με κόμιστρο)» (design §3 «Ανάθεση»· master Φ2). «Ο κύκλος γεννιέται από την ανάθεση. Δεν υπάρχει "+ Φορτηγό"» (spec §3 Board).
- **Είσοδοι:** ομάδα (όλα τα ζωντανά κομμάτια σε αναμονή μιας διεθνούς VS ή μιας εθνικής παραγγελίας), στόχος: `rt_id` ή νέος κύκλος (`trip_type`, `truck_id`/`trailer_id`/`driver_id` ή `partner_id` + `partner_rate`), `side`, στάσεις, `p_actor`.
- **Συμπεριφορά:** λύνει την ομάδα σε κομμάτια και κάνει ό,τι το F2-02· για νέο κύκλο καλεί τη λογική του F2-06 **στην ίδια συναλλαγή** (R-04). Δεν σπάει κομμάτι (design §3: «Δεν σπάει κομμάτι»). VS άλλης ημέρας → «ενημερώνει τη διεθνή» (spec §3 VS, §7 Figma).
- **071:** όπως F2-02 + `ct_round_trips` (`model=2`) για νέο κύκλο.
- **Αρνήσεις:** όπως F2-02 + F2-06 (`truck_busy`, `driver_busy`, `rt_partner_rate`).
- **Ρόλοι:** owner, dispatcher.
- **Ειδοποιήσεις:** όπως F2-02.
- **Αποδοχή:** ανάθεση VS 3 παραδόσεων σε ελεύθερο ΚΖΗ = 1 κλήση, 1 κύκλος, 3 κινήσεις, 1 γραμμή μισθοδοσίας κενή (011)· σύγκρουση φορτηγού → 422 `truck_busy` χωρίς τίποτα γραμμένο.

### F2-04 `plan_move_pieces`
- **Σκοπός:** «Μεταφορά σε…» ανά γραμμή, σε **μία** συναλλαγή (spec §7 «`plan_move_pieces` (μεταφορά ανά γραμμή, σε μία συναλλαγή)»). VS: μία παράδοση· εθνική: όλη η παραγγελία (φόρτωση και παραδόσεις)· χαλασμένο φορτηγό στη μέση: μόνο η ΑΝΟΔΟΣ (design §3 «Μεταφορά σε…»).
- **Είσοδοι:** κομμάτια (ή γραμμή) πηγής, στόχος: άλλος κύκλος + πλευρά, νέος κύκλος (ελεύθερο φορτηγό/συνεργάτης), ή «Στον Πίνακα Βέροιας», `dry_run`, `confirm_token`, `p_actor`.
- **Συμπεριφορά:**
  - Soft delete των παλιών κινήσεων και νέες στον στόχο (R-11)· στάσεις που μένουν χωρίς κίνηση σβήνονται (soft).
  - Αν φεύγει το τελευταίο φορτίο: «το δρομολόγιο θα σβηστεί» μαζί με τη μισθοδοσία του (owner 20/10, design §3) → κύκλος `cancelled` (R-07), ρητή σβήση μισθοδοσίας μετά το token (όπως F2-09).
  - Λίστα επιβεβαίωσης όπως Διαγραφή/Καθαρισμός (spec §3 Δικαιώματα: «Λίστα επιβεβαίωσης (διαγραφή, Καθαρισμός, Μεταφορά)»).
  - «Μεταφορά μετά την εκτέλεση = διόρθωση λάθους καταχώρησης. Έξοδα χωρίς δρομολόγιο βγάζουν ειδοποίηση "λείπει δρομολόγιο"» (spec §3).
  - Τοπική φόρτωση της στάσης που φεύγει: στην ίδια λίστα και σβήνεται μαζί (spec §3 Board).
  - VS σε κύκλο άλλης ημέρας: ίδιος κανόνας ημέρας VS με F2-02.
- **071:** `piece_legs` (soft + νέα), `rt_stops`, `ct_round_trips` (`status`), `local_moves` (nat_loading), `dl_entries` (soft). Κανόνες COMMIT όπως F2-02 + `local_loading_gone`/`local_loading_stop`, `rt_cancelled`, EXCLUDE.
- **Αρνήσεις:** `stale_confirm`, `same_rt` (tech `plan_move_side`), `truck_busy`/`driver_busy`, + F2-02.
- **Ρόλοι:** owner, dispatcher.
- **Ειδοποιήσεις:** «λείπει δρομολόγιο» για έξοδα του κύκλου που σβήνεται (C-12 για το κανάλι)· VS ημέρα → intl.
- **Αποδοχή:** η μεταφορά γραμμής που πέφτει στη 2η μισή γυρίζει πίσω ολόκληρη (καμία μισή μεταφορά)· κύκλος που άδειασε = `cancelled`, 0 ζωντανές κινήσεις, γραμμή μισθοδοσίας σβησμένη.

### F2-05 `plan_split_piece` και split+put για απόθεμα
- **Σκοπός:** «Ένα φορτίο σπάει μόνο στον Πίνακα Βέροιας, από την επιλογή σπασίματος» (spec §3 Board).
- **Είσοδοι:** `piece_id`, `parts[]` (παλέτες ανά μέρος), ανά μέρος προαιρετικός στόχος (κύκλος/πλευρά) ή «μένει στη Βέροια», `p_actor`.
- **Συμπεριφορά:**
  - Γονέας `split_at/split_by`· παιδιά με Σ = γονέας (`pieces_sum`).
  - Το κομμάτι που μένει: **μόνο** `leave_by` («φεύγει ως»), το βράδυ πριν από την αρχική παράδοση, όχι δική του ημέρα παράδοσης· αν δεν φύγει ως τότε, κόκκινο ως καθυστέρηση (spec §3 Board, DECISION_LOG 22/10). Η στήλη είναι `date` → `leave_by = nat_due_day − 1` (C-14).
  - Split+put: ένα κομμάτι-απόθεμα στο «+» με ποσότητα = σπάσιμο του αποθέματος + κίνηση του μέρους **σε μία συναλλαγή**· μόνο για απόθεμα (spec §7 «split+put μόνο για απόθεμα»· η άρνηση `piece_split` για απόθεμα φεύγει).
- **071:** `shipment_pieces` (γονέας update, παιδιά insert)· διαβάζει `v_piece_pos.position_location_id`. COMMIT: `split_not_at_hub`, `pieces_sum`, `piece_parent`.
- **Αρνήσεις:** `parts_sum` (Σ μερών ≠ γονέας, immediate με σαφές μήνυμα), `not_at_hub` (immediate πριν φτάσει στο `split_not_at_hub` της 071), `not_stock` (split+put σε μη απόθεμα), `piece_split` (ήδη σπασμένο).
- **Ρόλοι:** owner, dispatcher.
- **Αποδοχή:** 26 → 12+14 στη Βέροια ΟΚ· σπάσιμο εκτός Βέροιας = 422 (tech Φ4 rig `veroia-board-rig.js`)· «+» 8 από 13 αποθέματος = 1 κλήση, γονέας 13 → 8 (σε κύκλο) + 5 (απόθεμα, `leave_by` ίδιο).

### F2-06 `plan_rt_create`
- **Σκοπός:** κύκλος `model=2` με φορτηγό/οδηγό (OWNED) ή συνεργάτη (+ κόμιστρο). Γεννιέται μόνο μέσα από ανάθεση (C-05).
- **Είσοδοι:** `trip_type`, `truck_id`, `trailer_id`, `driver_id` | `partner_id`, `partner_rate` (μπορεί κενό), πρώτες στάσεις, `p_actor`.
- **Συμπεριφορά:** «σειρά INSERT στο `plan_rt_create`: πρώτα οι στάσεις, μετά ο κύκλος με `start_at/end_at` υπολογισμένα από αυτές, μέσα στην ίδια συναλλαγή, ώστε να τηρείται το CHECK `rt_v2_window` και το `entry_date` του 011» (spec §7). Το id του κύκλου με `nextval(pg_get_serial_sequence('public.ct_round_trips','id'))` + `OVERRIDING SYSTEM VALUE` (F1 απόφαση 7, test 25). `scope='NATL'` (`rt_v2_scope`), `status='planned'`, `model=2`, `date_start/date_end` = ημέρες Αθήνας (`rt_v2_dates`), `source`/`created_by`.
  - Μισθοδοσία νέου κύκλου: ξεκινά **κενή** (spec §3 Χρήματα) — το κάνει ήδη το 011 στο INSERT OWNED με οδηγό.
  - Κόμιστρο: ένα ανά δρομολόγιο, μπορεί να μείνει κενό (εκκρεμότητα, spec §3).
  - Κύκλος μόνο ΑΝΟΔΟΥ: επιτρέπεται, κενή ΚΑΘΟΔΟΣ (spec §3 Board).
- **071:** `ct_round_trips` (`model`, `start_at`, `end_at`, `partner_rate`), `rt_stops` (FK deferred). COMMIT: `rt_window`, `stop_seq`, `stop_order`, `side_order`, EXCLUDE `rt_v2_truck_once`/`rt_v2_driver_once` (23P01).
- **Αρνήσεις:** `truck_busy`, `driver_busy` (από 23P01 κατά όνομα, με τον κωδικό του άλλου κύκλου στο μήνυμα: K-07), `rt_partner_rate` (κόμιστρο σε OWNED ή < 0), `rt_v2_*` CHECK.
- **Ρόλοι:** owner, dispatcher.
- **Αποδοχή:** ίδιο φορτηγό Τετ 06:00–14:00 και 14:00– ΟΚ, 05:00–07:00 → `truck_busy` (071b)· OWNED με οδηγό → ακριβώς 1 `dl_entries` `trip` με `entry_date = date_start` και ποσά NULL.

### F2-07 `plan_rt_update`
- **Σκοπός:** όχημα, οδηγός, συνεργάτης, κόμιστρο, παράθυρα στάσεων· «Αλλαγή ημερομηνίας» σκέλους με προεπισκόπηση (Figma Δ4 `2053:7837`).
- **Είσοδοι:** `rt_id`, αλλαγές, `dry_run`, `p_actor`.
- **Συμπεριφορά:**
  - Dry run: «τι παθαίνουν η ΑΝΟΔΟΣ, το τέλος κύκλου και ο επόμενος κύκλος» + σύγκρουση (tech §Φ2, Δ4).
  - Μετακίνηση σκέλους: όλες οι στάσεις του με το ίδιο δέλτα (design §3 «Αλλαγή ημερομηνίας»).
  - VS στο σκέλος που μετακινείται: η ημέρα VS γράφεται στη διεθνή («όποιος μάθει πρώτος», spec §3 VS) — βλ. C-09.
  - Τοπική φόρτωση της στάσης: το `move_date` ακολουθεί την ημέρα της στάσης (K-10).
  - Ο dispatcher γράφει το κόμιστρο (R-14).
- **071:** `ct_round_trips`, `rt_stops`, `local_moves`· `plan_rt_window_sync` ξαναγράφει το παράθυρο → 011 μετακινεί ημέρες μισθοδοσίας. COMMIT: `stop_order`, `chain_time`, `local_loading_day`, EXCLUDE.
- **Αρνήσεις:** `truck_busy`, `driver_busy`, `window_order` (tech), `rt_cancelled`, `rt_partner_rate`, `local_loading_day`.
- **Ρόλοι:** owner, dispatcher.
- **Ειδοποιήσεις:** intl όταν άλλαξε ημέρα VS.
- **Αποδοχή:** +1 ημέρα στην ΚΑΘΟΔΟ → `start_at/end_at`, `date_start/date_end` και `dl_entries.entry_date` ακολουθούν· dry run γράφει 0 γραμμές.

### F2-08 `plan_rt_clear` («Καθαρισμός ανάθεσης»)
- **Σκοπός:** βγάζει φορτηγό, οδηγό ή συνεργάτη από **όλο** το δρομολόγιο· «μόνο για διόρθωση: ό,τι καθαρίζεται "δεν έγινε"» (design §3)· οι παραδόσεις μένουν μαζί ως ΠΡΟΣ ΑΝΑΘΕΣΗ.
- **Είσοδοι:** `rt_id`, `dry_run`, `confirm_token`, `p_actor`.
- **Συμπεριφορά (spec §3):**
  - «αν υπάρχουν έξοδα, ειδοποίηση και επιβεβαίωση»
  - «κενή γραμμή μισθοδοσίας: σβήνεται χωρίς ερώτηση»
  - «γραμμή μισθοδοσίας με ποσό: επιβεβαίωση» και μετά **ρητή σβήση** (spec §7)· «Μισθοδοσία ήδη πληρωμένη … σβήνεται μετά την επιβεβαίωση. Η λίστα γράφει ρητά "ήδη πληρωμένη: 230 €, εβδ. 42" … Δεν υπάρχει `needs_review`».
  - `truck_id`/`driver_id`/`trailer_id`/`partner_id`/`partner_rate` = NULL (C-11 για το `trip_type`).
- **071:** `ct_round_trips`, `dl_entries` (soft). Ο κύκλος μένει `planned` με στάσεις/κινήσεις (has_vehicle = false).
- **Αρνήσεις:** `stale_confirm`, `need_token` (εκτέλεση χωρίς token όταν υπάρχουν παραστατικά → 428, tech §Φ2 Worker).
- **Ρόλοι:** owner, dispatcher (λίστα χωρίς ποσά για dispatcher).
- **Αποδοχή:** κενή μισθοδοσία → σβησμένη χωρίς token· με ποσό → dry run με token, εκτέλεση σβήνει τη γραμμή, **0** γραμμές `needs_review = true` από αυτή την πράξη.

### F2-09 `plan_delete`
- **Σκοπός:** «Διαγραφή σημαίνει "δεν έγινε", και γίνεται μόνο από την καρτέλα παραγγελίας. … **Επαναφορά δεν υπάρχει**» (spec §3).
- **Είσοδοι:** παραγγελία (εθνική v5, C-10), `dry_run`, `confirm_token`, `p_actor`.
- **Συμπεριφορά:**
  - Soft delete σε όλη την αλυσίδα: `national_orders.deleted_at`, `shipments`, `shipment_pieces`, `piece_legs`, στάσεις που μένουν χωρίς κίνηση, τοπική φόρτωση της στάσης.
  - Κύκλος που αδειάζει → `status='cancelled'` (R-07) και ρητή σβήση της μισθοδοσίας του μετά το token (master Φ2: «ρητή σβήση της μισθοδοσίας μετά το token»).
  - Λίστα παραστατικών: τιμολογήθηκε (`national_orders.invoiced`), DKV/έξοδα (`ct_cost_lines`), μισθοδοσία (με ποσό / πληρωμένη, «εβδ. 42»), κινήσεις παλετών confirmed (Φ3· σήμερα 0). Dispatcher: χωρίς ποσά.
  - Το ERP εκδίδει το πιστωτικό (design §3)· το TMS δεν αγγίζει τιμολόγια.
  - Κανένας φρουρός ημερομηνίας (tech §Φ2: «owner 20/10»).
- **071:** όλοι οι πίνακες σχεδίου (soft), `ct_round_trips.status`, `local_moves`, `dl_entries`. Ο trigger `trg_national_orders_soft_delete_cascade` (ζωντανός) σβήνει και NL/`order_stops` της παραγγελίας (κανένα για v5).
- **Αρνήσεις:** `stale_confirm`, `need_token`, `hard_delete` (δίχτυ της 071), `order_gone`.
- **Ρόλοι:** owner, dispatcher (το owner 21/10 απέρριψε «διαγραφή με παραστατικά μόνο από τον owner»). Τα ποσά: owner, accountant (C-04).
- **Αποδοχή:** λίστα → token → εκτέλεση· αλλαγμένη λίστα → `stale_confirm` (tech Φ4 rig `wn5-delete-rig.js`)· κάθε σβησμένη γραμμή έχει `deleted_reason` και `deleted_by`.

### F2-10 `plan_vs_set_day`
- **Σκοπός:** «Ποια ημέρα γράφεται: ένα πεδίο, το `orders.cross_dock_date`. Το `plan_vs_set_day` γράφει αυτό, και τα 028/069 μετακινούν τις στάσεις της διεθνούς όπως σήμερα» (spec §3 VS).
- **Είσοδοι:** διεθνής παραγγελία VS (ή στάση γέφυρας → παραγγελία), νέα ημέρα, `p_actor`.
- **Συμπεριφορά:** γράφει `orders.cross_dock_date` με ίχνος (`audit_log`) και ειδοποίηση στον διεθνών· η VS κάρτα του εθνικών είναι μόνο ανάγνωση εκτός από την ημέρα, με την ένδειξη «ενημερώνει τη διεθνή #…» (tech §Φ4). Το 069 `order_cd_stop_follow` μετακινεί τη στάση `Cross-dock`· το `order_dates_follow` δεν τρέχει (αλλάζει μόνο το cross-dock). Καλείται και εσωτερικά από F2-02/03/04/07.
- **071:** διαβάζει `shipments` γέφυρας, `v_vs_state.first_hub_day`. Γράφει `orders`, `plan_notices`.
- **Αρνήσεις:** `vs_not_bridge` (tech), `order_gone`.
- **Ρόλοι:** owner, dispatcher.
- **Ειδοποιήσεις:** `to_desk='intl'`, `order_id`, kind π.χ. `vs_day_changed`.
- **Αποδοχή:** ημέρα VS Δευ → Τρί = 1 γραμμή `orders` + 1 `audit_log` + 1 ειδοποίηση· σήμερα **μη εφαρμόσιμο στην παραγωγή** (καμία γέφυρα ως το L) → μόνο PGlite.

### F2-11 `plan_vs_set_place`
- **Σκοπός:** «Αλλαγή προορισμού VS μετά τη Βέροια: "όποιος μάθει πρώτος" (18/10). Ο εθνικών την κάνει από τη φόρμα σκέλους (`plan_vs_set_place`), και γράφεται στο `order_stops.location_id` της διεθνούς με ίχνος και ειδοποίηση» (spec §3 VS).
- **Είσοδοι:** `order_stop_id` (γέφυρα), νέος `location_id`, `p_actor`.
- **Συμπεριφορά:** γράφει `order_stops.location_id`· στην ίδια συναλλαγή διορθώνει ό,τι εθνικό κρέμεται από την παλιά θέση (στάση εκφόρτωσης, κίνηση· K-06)· `audit_log`· ειδοποίηση intl.
- **071:** `order_stops`, `rt_stops`, `piece_legs`, `plan_notices`· διαβάζει `v_shipments` (ο προορισμός γέφυρας διαβάζεται από `order_stops`).
- **Αρνήσεις:** `vs_not_bridge`, `leg_place`/`chain` (COMMIT), `order_gone`.
- **Ρόλοι:** owner, dispatcher.
- **Ειδοποιήσεις:** `to_desk='intl'`, kind π.χ. `vs_place_changed`.

### F2-12 `plan_local_loading`
- **Σκοπός:** ✈ «Φόρτωση με τοπικό»: «γράφεται μια εγγραφή στον πίνακα τοπικών για τον οδηγό, και από αυτήν η μισθοδοσία του ανά ημέρα. Η σειρά του board δεν αλλάζει· μπαίνει μόνο η υποσημείωση … Δεν υπάρχει υποχρεωτικό "ποιος φορτώνει"» (spec §3 Board). «Η εγγραφή γίνεται με `plan_local_loading`, με νέο `move_kind='nat_loading'` και σύνδεσμο στη στάση (`rt_stop_id`)» — όχι facade (spec §2.1).
- **Είσοδοι:** `rt_stop_id` (στάση φόρτωσης), `driver_id` (τοπικός), `truck_id`, προαιρετικά `trailer_id` (F1 απόφαση 3: δεν απαιτείται), `time_from/time_to` (ΩΩ:ΛΛ), σημείωση, `p_actor`· και ακύρωση/αλλαγή υπάρχουσας.
- **Συμπεριφορά:** `local_moves` με `move_kind='nat_loading'`, `rt_stop_id`, `move_date` = ημέρα Αθήνας του `planned_from` της στάσης, `status='Assigned'` (το `local_moves_before` κάνει `RETURN` για nat_loading, δεν το παράγει), `sequence`. Η μισθοδοσία ΤΟΠΙΚΟ ανά ημέρα από το υπάρχον `dl_sync_from_local_move` → `dl_local_day_sync` (γράφει τον κωδικό RT, F1 απόφαση 4).
  - «Αν η στάση φύγει (Καθαρισμός, Μεταφορά, διαγραφή), η τοπική φόρτωση μπαίνει στην ίδια λίστα επιβεβαίωσης και σβήνεται μαζί της» (spec §3).
- **071:** `local_moves` (CHECK `local_moves_nat_loading`, index `local_moves_nat_loading_once`), COMMIT `plan_chk_local_loading`: `local_loading_gone`, `local_loading_day`, `local_loading_stop`.
- **Αρνήσεις:** οι 3 της 071 + `local_moves_nat_loading_once` (23505 → «υπάρχει ήδη τοπική φόρτωση»)· `local_moves_kind_parent`.
- **Ρόλοι:** owner, dispatcher.
- **Αποδοχή:** 1 κλήση = 1 `local_moves` + 1 γραμμή ΤΟΠΙΚΟ για τον οδηγό εκείνη τη μέρα με κωδικό RT· διαγραφή της στάσης → η τοπική σβήνεται στην ίδια συναλλαγή.

### F2-13 `plan_notices` (εγγραφή και ανάγνωση)
- **Σκοπός:** «κανάλι ειδοποίησης: πίνακας `plan_notices` (σε ποιον, τι, ποια παραγγελία, διαβάστηκε), που το board δείχνει ως λωρίδα στην κορυφή και που μετρά ο ελεγκτής όσο μένει αδιάβαστο πάνω από 24 ώρες» (spec §7).
- **Εγγραφή:** μόνο εσωτερικά από `plan_*` (και αργότερα από τον trigger γέφυρας της Φ5): `to_desk` ∈ {`intl`,`natl`}, `kind ~ '^[a-z_]+$'`, `message`, `order_id`/`nat_order_id`/`rt_id`, `created_by`.
- **Ανάγνωση:** `GET /plan/notices?desk=…` (αδιάβαστα + πρόσφατα)· `POST /plan/notices/:id/read` → `plan_notice_read(id, p_actor)` γράφει `read_at/read_by` (CHECK `plan_notices_read_pair`). Καμία διαγραφή (ο πίνακας δεν έχει `deleted_at`).
- **Αρνήσεις:** `notice_gone`, `notice_read` (ήδη διαβασμένη: ή ιδεμπότητα, C-13).
- **Ρόλοι:** C-13.

---

## 3. Worker (`worker/src/index.js`, αλυσίδα `deploy/worker-plan`)

| # | Απαίτηση | Πηγή |
|---|---|---|
| W-01 | Δρομολόγηση `if (url.pathname.startsWith("/plan/")) return handlePlan(...)`, δίπλα στο `/costs/` (σήμερα γρ. 5802). | tech §Φ2 Worker |
| W-02 | `var PLAN_PERMS = {…}` deny-by-default, σχήμα `COSTS_PERMS` (γρ. 3498) + `planCan(role, resource, method)` (όπως `ctCan`, γρ. 3528). Κανένα wildcard. | spec §2.1· tech |
| W-03 | Χωρίς token → 401 «Unauthorized» στο πρότυπο `handleCosts` (γρ. 3557)· ρόλος χωρίς δικαίωμα → 403. Βλ. K-12 για την αποδοχή «403 χωρίς token». | κώδικας· master αποδοχή |
| W-04 | Οι `plan_*` καλούνται ως RPC (`dbRpc`, γρ. 348: κρατά `err.pg`). Πριν από το deploy, PostgREST πρέπει να δει τις νέες συναρτήσεις (`NOTIFY pgrst, 'reload schema'` μέσα/μετά το 072). | κώδικας |
| W-05 | Οικογένεια `plan:` στον **ίδιο** `stockRuleError` (γρ. 3184· «ONE mapper», γρ. 3121): hint `plan:<code>` → `{type:"PLAN_RULE", code, message: PLAN_RULE_TEXT[code] ?? «…(code)»}`· CHECK κατά όνομα (`rt_v2_*`, `rt_v1_no_window`, `rt_model`, `rt_partner_rate`, `shipments_*`, `pieces_*`, `rt_stops_*`, `piece_legs_*`, `plan_notices_*`, `local_moves_nat_loading`, `order_stops_via_hub_intl`) → `PLAN_CHECK_TEXT`· **23P01** κατά όνομα (`rt_v2_truck_once` → `truck_busy`, `rt_v2_driver_once` → `driver_busy`)· 23505 (`shipments_bridge_once`, `piece_legs_live_no`, `local_moves_nat_loading_once`, `pl_mov_leg_once`). Σήμερα 23P01 και άγνωστο CHECK γυρίζουν `null` → 500: πρέπει να γίνουν 422. Απάντηση μέσω `stockRuleResponse` (422). | spec §2.1· tech §Φ2 «Χαρτογράφος»· F1 Interfaces |
| W-06 | Ο χαρτογράφος ισχύει και στα **facade** paths που ήδη τον καλούν (PATCH/DELETE `order_stops` → `pieces_sum`· `local_moves` → `local_loading_*`· `ct_rt_legs` → `v1_link_on_v2`), ώστε μια άρνηση της 071 να μη γίνει ποτέ 500. | 071 triggers· tech §0 («Facade DELETE … περνά από `stockRuleError`») |
| W-07 | Dry run → πάντα 200 `{consequences, confirm_token}`· εκτέλεση χωρίς token σε πράξη που το θέλει → **428**. Αφαίρεση ποσών για dispatcher (R-06, C-03). | tech §Φ2 Worker· spec §3 Δικαιώματα |
| W-08 | `GET /plan/board?week=<Σάββατο>`: κύκλοι (`v_rt_cycle`) με στάσεις (`v_rt_stop_state`), κομμάτια/αποστολές (`v_piece_state` + `v_shipments`), αναμονή/ΠΡΟΣ ΑΝΑΘΕΣΗ, κουβάς Βέροιας (`v_hub_bucket`), αδιάβαστες ειδοποιήσεις· κενοί πίνακες ως `[]`, ποτέ απουσία (παγίδα facade 2). Χωρίς χρήματα (R-14)· `partner_rate` μόνο σε όσους επιτρέπεται· warehouse χωρίς `Price`. | master Φ2· tech αποδοχή «200 με κενούς πίνακες» |
| W-09 | `GET /plan/vs-state?order_ids=…` → `{oid: {carriers:[{kind, text}], all_executed, all_planned, first_hub_day}}` ή `"missing"` ανά παραγγελία· πηγή `v_vs_state` (+ πινακίδα/οδηγός/συνεργάτης). Καμία πληροφορία δεν φτάνει σε πελάτη («Η Βέροια δεν φαίνεται ποτέ στον πελάτη», spec §3). | master Φ2· spec Ε1/Ε20· tech §Φ5 Worker |
| W-10 | Διαδρομές εγγραφής (ονόματα από flows/tech): `POST /plan/orders`, `POST /plan/legs` (put pieces/group), `POST /plan/move`, `POST /plan/pieces/split`, `POST /plan/rt`, `PATCH /plan/rt/:id`, `POST /plan/rt/clear`, `POST /plan/delete`, `POST /plan/vs/day`, `POST /plan/vs/place`, `POST /plan/local-loading` (+ ακύρωση), `GET /plan/notices`, `POST /plan/notices/:id/read`. Κανένα `restore` (spec §7). | flows 1/3/5/7/8/9· tech |
| W-11 | `PATCH /costs/rt/:id` σε κύκλο `model=2` → **409** «ο κύκλος αλλάζει από το Εβδομαδιαίο Εθνικών» (αλλιώς αλλαγή `date_start`/`truck_id` παρακάμπτει EXCLUDE/`rt_v2_dates` και πέφτει σε γενικό 500). | tech §Φ2 «Παλιές διαδρομές» (C-15) |
| W-12 | Label `"Via Hub": "via_hub"` στο ORDER_STOPS του `TABLES`. | F1 Interfaces («Φ2, αλυσίδα Worker») (C-16) |
| W-13 | Κάθε `/plan/*` εγγραφή ήδη έχει `audit_log` από τη βάση· ο Worker δεν γράφει δεύτερο. 5xx: σαφές μήνυμα, ποτέ `{}`. | R-01, R-13 |
| W-14 | Tests: `plan-contract.test.mjs` (κάθε κωδικός/constraint του 072 και της 071 έχει κείμενο και αντίστροφα· πρότυπο `local-relay-contract.test.mjs`)· `plan-perms.test.mjs` (5 ρόλοι × resource × μέθοδος, κάθε μη-✓ = 403)· `plan-tables-guard.test.mjs` (κανένα `shipments|shipment_pieces|rt_stops|piece_legs|plan_notices` ως `pg:` στο `TABLES`, κανένα wildcard με εγγραφή). | tech §Φ2 Tests |

### Deploy (CLAUDE.md «Ο WORKER»)
- Μόνο μετά τις 15:00· branch `deploy/worker-plan` από την πηγή του Worker που τρέχει (`git merge-base --is-ancestor`)· φρουρός πριν και μετά: τα 3 + `tblStockLots: {` + `"Move Kind": "move_kind"`, και μετά το deploy προστίθεται **`var PLAN_PERMS = {`** στη λίστα του CLAUDE.md (κανόνας μίας πηγής 3)· έλεγχος bindings/secrets 3/3 μέσω CF API· μετά: sync `worker/src`/`worker/test` του main («sync worker source with deployed <version>»).
- Σειρά: 072 (owner, dry run, «ναι», μετά τις 15:00) → Worker. Αν ο Worker ανέβει πριν το 072: κάθε `/plan/*` RPC = 404 PostgREST → πρέπει να απαντά σαφές 503 «λείπει το 072» (πρότυπο `schemaBehind060`).

### Αποδοχή Φ2 (master + tech)
- `GET /plan/board` = 200 για owner (κενοί πίνακες), 401/403 χωρίς token (K-12)· `POST /plan/orders` ως management = 403.
- Νέοι πίνακες = **0** γραμμές μετά το deploy· `model=2` = 0· καμία δοκιμαστική εγγραφή στην παραγωγή (Ε2 της 11/10).
- `072_plan_functions_test.sql` ≥ 80 περιπτώσεις (μία ανά κωδικό `plan:` + εβδομάδα 3–9/10)· `tests/sql-072-drafts.test.js`· `/code-review` xhigh.
- B-54 = 46 αν το 072 δεν προσθέτει trigger (αλλιώς +N με καθρέφτη).
- Rollback: `wrangler rollback` στην προηγούμενη έκδοση· `072_rollback` = `DROP FUNCTION plan_*`, αρνείται αν υπάρχει γραμμή v5.

---

## 4. Δικαιώματα `PLAN_PERMS` (πρόταση από spec «Δικαιώματα» + tech §Φ2· τα «?» είναι επιλογές C)

| resource | μέθοδος | owner | dispatcher | management | accountant | warehouse |
|---|---|---|---|---|---|---|
| `board` | GET | ✓ | ✓ (+ κόμιστρο) | ✓ | ✓ | ✓ χωρίς `Price`, χωρίς κόμιστρο |
| `vs-state` | GET | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notices` | GET / read | ✓ | ✓ | ? | ? | — |
| `orders` | POST | ✓ | ✓ | — | — | — |
| `legs` (put pieces/group), `move`, `pieces/split` | POST | ✓ | ✓ | — | — | — |
| `rt` | POST / PATCH | ✓ | ✓ | — | — | — |
| `rt/clear` | POST | ✓ | ✓ (χωρίς ποσά) | — | — | — |
| `delete` | POST | ✓ | ✓ (χωρίς ποσά) | — | ? (μόνο dry run) | — |
| `vs/day`, `vs/place` | POST | ✓ | ✓ | — | — | — |
| `local-loading` | POST | ✓ | ✓ | — | — | — |
| `restore` | — | **δεν υπάρχει** (spec §7) | | | | |

Κλειδωμένα: κόμιστρο ορατό/εγγράψιμο από dispatcher (21/10)· μισθοδοσία/DKV στον dispatcher μόνο ως ύπαρξη· το DELETE μένει στενό όπως σήμερα (CLAUDE.md 23/8)· ο accountant κρατά PATCH στο `national_orders` μέσω facade (Invoiced, ΤΠΥ, τιμή)· τα facade cut του L (Ε16) **δεν** είναι Φ2.

---

## 5. Κωδικοί `plan:`

**Της 071 (θέλουν κείμενο στο `PLAN_RULE_TEXT`):** `pieces_alive`, `piece_dead`, `pieces_sum`, `piece_parent`, `split_not_at_hub`, `rt_not_v2`, `rt_cancelled`, `leg_stop_dead`, `leg_order`, `leg_place`, `chain`, `chain_time`, `stop_seq`, `stop_order`, `side_order`, `rt_window`, `local_loading_gone`, `local_loading_day`, `local_loading_stop`, `model_locked`, `stop_locked`, `leg_locked`, `piece_locked`, `shipment_locked`, `v1_link_on_v2`, `hard_delete`.

**Νέοι της 072 (από spec/master/tech, προς οριστικοποίηση):** `no_price`, `no_client`, `no_window`, `stale_confirm`, `need_token` (ή HTTP 428 χωρίς κωδικό), `piece_busy`, `piece_split`, `not_stock`, `parts_sum`, `not_at_hub`, `same_rt`, `window_order`, `truck_busy`, `driver_busy` (από 23P01), `vs_not_bridge`, `order_gone`, `notice_gone`.

**Αποσύρθηκαν (spec §7), να μην εμφανιστούν:** `hub_endpoint`, `piece_planned`, `bridge_moved`, `bridge_split`, `legacy_nl`, `frozen`, `restore_expired`, `restore_conflict`, `partner_rate_on_owned` (καλύπτεται από CHECK `rt_partner_rate`), `vs_locked` (βλ. C-08).

---

## 6. Σιωπές και αμφισημίες του spec → επιλογές για έγκριση owner (C)

| # | Θέμα | Τι λείπει / τι συγκρούεται | Πρόταση |
|---|---|---|---|
| C-01 | **Διόρθωση εθνικής μετά την καταχώρηση** (`plan_order_update`) | Το spec λέει «Φόρτωση με λιγότερες παλέτες: ο dispatcher απλώς διορθώνει την παραγγελία» και ο dispatcher κρατά από το L μόνο PATCH σε τιμή/reference/σημειώσεις, «όχι στις ημερομηνίες». Το master Φ2 **δεν** έχει `plan_order_update` (το tech το είχε). Χωρίς αυτό, παλέτες/ημέρες/τόποι εθνικής v5 δεν διορθώνονται πουθενά. | Προσθήκη `plan_order_update` στη Φ2 (παλέτες, παράθυρα, τόποι αποστολών· με σπασμένο κομμάτι: ο κανόνας μείωσης του VS, «πρώτα απόθεμα, μετά πρώτη ημέρα»). |
| C-02 | **Δύο πηγές για παλέτες/ημέρες/τόπους εθνικής** | Το spec §7 βάζει το `plan_orders_create` να γράφει `national_orders.pallets/loading_datetime/delivery_datetime/pickup_location_1_id/delivery_location_1_id` **και** `shipments` (αρχή 3). | Τα πεδία της `national_orders` γράφονται μόνο από `plan_*` (create/update) ως παράγωγα των αποστολών, και ο ελεγκτής μετρά απόκλιση· ή μόνο στη δημιουργία, με ρητή σημείωση «οι λίστες διαβάζουν αποστολές από τη Φ4». |
| C-03 | **Πού κόβονται τα ποσά** της λίστας συνεπειών | Spec: «ποσά μόνο owner και accountant». Δεν λέει αν κόβει η βάση ή ο Worker. | Η συνάρτηση παίρνει `p_role` και επιστρέφει ποσά μόνο σε owner/accountant (αρχή 4)· το `confirm_token` υπολογίζεται πάντα από την πλήρη λίστα. |
| C-04 | **Ο accountant και οι λίστες** | Βλέπει ποσά, αλλά δεν έχει δικαίωμα διαγραφής/Καθαρισμού. | Ο accountant δεν καλεί dry run στη Φ2· τα ποσά τα βλέπει στην οθόνη Μισθοδοσίας/Εξόδων. Ή: δικαίωμα μόνο dry run. |
| C-05 | **`plan_rt_create` ως αυτόνομη κλήση** | «Ο κύκλος γεννιέται από την ανάθεση» + R-04, ενώ η ροή 3 δείχνει `POST /plan/rt` και μετά `POST /plan/legs` (δύο συναλλαγές, ενδιάμεσος άδειος κύκλος). | `plan_rt_create` εσωτερική· εκτίθεται μόνο μέσω `plan_put_group`/`plan_put_pieces`/`plan_move_pieces`/`plan_orders_create` με «νέος κύκλος». |
| C-06 | **Οι στάσεις-όρια του κύκλου** (αρχή/τέλος στη Βέροια) | Δεν ορίζεται αν κάθε κύκλος έχει ρητή στάση αφετηρίας/τέλους στη Βέροια χωρίς κίνηση (tech «H Δευ 18:00 … H Τετ 07:00»· Figma «Βέροια · τέλος κύκλου / ως …»), ούτε από πού βγαίνει το τέλος (αυθημερόν Θεσσαλονίκη, Πάτρα τριών ημερών), ούτε η αφετηρία κύκλου μόνο ΑΝΟΔΟΥ και σε ποια πλευρά ανήκει. Ορίζει EXCLUDE, ημέρες μισθοδοσίας, DKV. | Στάση τέλους στη Βέροια (πλευρά ANODOS, χωρίς κίνηση) με προεπιλεγμένο παράθυρο που ο χρήστης διορθώνει· κύκλος μόνο ΑΝΟΔΟΥ ξεκινά από Βέροια· PARTNER χωρίς στάση επιστροφής. Προεπιλεγμένες ώρες από τον owner. |
| C-07 | **Παράθυρα στάσεων VS** | Το `order_stops.datetime` είναι `date`· «VS: μόνο ημέρα, παράθυρο κλειδωμένο» (design). Από πού παίρνει ώρες η `rt_stops` μιας παράδοσης VS; | Προεπιλεγμένο παράθυρο ημέρας (π.χ. 07:00–15:00) που αλλάζει μόνο με τη μετακίνηση σκέλους. |
| C-08 | **Αλλαγές του εθνικών σε VS πέρα από ημέρα/τόπο** | Το tech είχε `vs_locked`· το spec δίνει μόνο ημέρα (`plan_vs_set_day`) και προορισμό (`plan_vs_set_place`)· οι παλέτες VS διορθώνονται από τον διεθνών. | Ο εθνικών δεν αλλάζει παλέτες/παράθυρο VS (άρνηση `vs_locked` στο C-01)· «όποιος μάθει πρώτος» μόνο για ημέρα και τόπο. |
| C-09 | **Μετακίνηση σκέλους με VS** (`plan_rt_update`) | Γράφει την ημέρα VS στη διεθνή όπως η ανάθεση; (ροή 7, κενά 1–2). Και πώς ξεχωρίζει ο trigger γέφυρας της Φ5 μια αλλαγή `cross_dock_date` **του εθνικών** (που δεν πρέπει να βγάλει το VS από το φορτηγό) από αλλαγή του διεθνών (που πρέπει). | Ναι, στην ίδια συναλλαγή· τα `plan_*` θέτουν GUC (π.χ. `set_config('plan.writer','natl',true)`) που ο trigger της Φ5 διαβάζει. Το συμβόλαιο ορίζεται στη Φ2. |
| C-10 | **Τι διαγράφει το `plan_delete`** | Το tech: «παραγγελία ή RT». Το spec: μόνο από καρτέλα παραγγελίας· design: «Δεν υπάρχει "Διαγραφή δρομολογίου"». Και VS: η διαγραφή διεθνούς είναι Ε19 (Φ5). | Μόνο εθνική παραγγελία v5· ο κύκλος ακυρώνεται μόνο όταν αδειάζει. |
| C-11 | **Καθαρισμός σε PARTNER / αλλαγή `trip_type`** | Δεν λέγεται αν ο Καθαρισμός κρατά το `trip_type`, ούτε αν το `plan_rt_update` αλλάζει OWNED ↔ PARTNER. Το ρυμουλκούμενο; | Καθαρισμός: όλα NULL (και ρυμουλκούμενο, κόμιστρο), `trip_type` μένει· αλλαγή τύπου επιτρέπεται στο update με τους ίδιους κανόνες μισθοδοσίας. |
| C-12 | **Έξοδα/DKV κύκλου που ακυρώνεται ή καθαρίζεται** | «Έξοδα χωρίς δρομολόγιο βγάζουν ειδοποίηση "λείπει δρομολόγιο"»: αποσυνδέονται (`rt_id = NULL`) ή μένουν σε κύκλο `cancelled`/χωρίς φορτηγό; Και η «ειδοποίηση» είναι `plan_notices` ή έλεγχος B-81 (Φ3); | Κύκλος που ακυρώνεται: `ct_cost_lines` μένουν στο `rt_id` (ίχνος) και ο B-81 τα πιάνει· Καθαρισμός: μένουν, με ειδοποίηση `plan_notices` `kind='cost_without_vehicle'`. |
| C-13 | **Ποιος διαβάζει/σημειώνει ειδοποιήσεις** | `to_desk` = intl/natl, αλλά ρόλος υπάρχει μόνο `dispatcher` για τα δύο γραφεία. Ποιος κλείνει μια ειδοποίηση; management/accountant; | owner + dispatcher διαβάζουν και σημειώνουν και τα δύο γραφεία· management μόνο ανάγνωση· «διαβάστηκε» ιδεμπότητο. |
| C-14 | **`leave_by` = `date`, «φεύγει ως Δευ 22:00»** | Η στήλη δεν κρατά ώρα. Ποιος το υπολογίζει (συνάρτηση ή οθόνη) και τι ισχύει για τα 5π που μένουν στο split+put (κληρονομούν;). | `leave_by = nat_due_day − 1` το γράφει η συνάρτηση· το «22:00» είναι μόνο κείμενο οθόνης· τα παιδιά-απόθεμα κληρονομούν. |
| C-15 | **`PATCH /costs/rt/:id` σε `model=2`** | Στο tech Φ2, όχι στη λίστα του master. | Μέσα στη Φ2 (409)· χωρίς αυτό ένα PATCH παρακάμπτει τους κανόνες του κύκλου. |
| C-16 | **`"Via Hub"` στο facade τώρα ή στη Φ5** | F1 Interfaces το βάζει στη Φ2· κανείς δεν το διαβάζει πριν το 074, και η φόρμα (Φ4) δεν υπάρχει. | Στη Φ2 (ίδια αλυσίδα, ακίνδυνο: default false)· ή στη Φ5 μαζί με το backfill. |
| C-17 | **Εγγραφές πριν από το L** | Οι διαδρομές θα είναι ζωντανές από τη Φ2, ενώ η αποδοχή θέλει 0 γραμμές ως το L (και Φ4). Αρχή 5: «γεννιέται κλειστό». | Οι εγγραφές `/plan/*` κλειστές με διακόπτη Worker (π.χ. var `PLAN_WRITES`) ή με `plan_config` στη 074· GET ανοιχτά. |
| C-18 | **«Πληρωμένη» μισθοδοσία** | Spec: «υπάρχει γραμμή `payment_*` του οδηγού μετά την ημερομηνία του κύκλου μέσα σε κλειστή περίοδο… να ελεγχθεί με τη λογιστική στη Φ2». Στη βάση **δεν υπάρχει** κλειστή περίοδος (μετρήθηκε). | Ορισμός χωρίς περίοδο: «υπάρχει `payment_bank`/`payment_cash` του οδηγού με `entry_date ≥ date_end` του κύκλου» (+ εβδομάδα TMS της πληρωμής)· επιβεβαίωση από Αλεξία. |
| C-19 | **Μορφή `GET /plan/board`** | Ούτε spec ούτε master ορίζουν σχήμα, εύρος (εβδομάδα Σάββατο–Παρασκευή, TmsWeek), αν περιλαμβάνει ελεύθερα φορτηγά/οδηγούς (Δ1) ή ξεχωριστά `bucket`/`order` (tech PLAN_PERMS). | Ένα `board` με όλα της εβδομάδας + `GET /plan/order/:id` για την καρτέλα· τα ελεύθερα φορτηγά από `v_rt_cycle` της ημέρας. |
| C-20 | **`plan_put_pieces` vs `plan_put_group`** | Δύο ονόματα στο master, ένα στο tech· το design χρησιμοποιεί και `plan_put_piece`. | `plan_put_pieces` = πυρήνας (κομμάτια)· `plan_put_group` = λεπτό περιτύλιγμα (ομάδα → κομμάτια, + νέος κύκλος). Ένα όνομα ανά πράξη στα contract tests. |
| C-21 | **Αφαίρεση κομματιού από κύκλο χωρίς στόχο** (το παλιό `plan_remove_leg`) | Spec: «Κανένα "×" στη σειρά· αλλαγές και αφαίρεση γίνονται στη φόρμα σκέλους». Το master δεν έχει συνάρτηση «πίσω σε αναμονή». | Στόχος «αναμονή» μέσα στο `plan_move_pieces` (ίδια λίστα, ίδιο token). |
| C-22 | **Βλάβη: όλη η ΑΝΟΔΟΣ** (`plan_move_side`) | Το spec κράτησε μόνο `plan_move_pieces`. | Όλη η πλευρά = `plan_move_pieces` με όλα τα κομμάτια της πλευράς· ό,τι εκτελέστηκε μένει. |
| C-23 | **Χωρητικότητα 33 και IFCO/CRATE** | Το «μόνο PALLET» φεύγει· η 071 δεν έχει `qty_unit`. | Όλα μετρούν στο 33· μόνο προειδοποίηση. |
| C-24 | **Παρτίδες 057 (`stock_lot_id`)** | Οι εθνικές-κομμάτια παρτίδας έχουν από CHECK `price IS NULL` → το `no_price` τις αρνείται. Μπαίνουν στο v5 με `plan_orders_create`; | Εκτός Φ2· η Ε6 (Φ3) ορίζει τη σχέση· το `plan_orders_create` αρνείται `stock_lot_id`. |
| C-25 | **`national_orders.direction` και `goods`/`type`** | Το spec §7 δεν λέει κατεύθυνση· «είδος» = `goods` ή `type`; Οι σημερινές λίστες διαβάζουν `direction`. | `goods` (την ελέγχει η 071)· `direction` μόνο αν τη ζητούν οι αναγνώστες της Φ4. |
| C-26 | **Μήνυμα `truck_busy` με τον κωδικό του άλλου κύκλου** | Το EXCLUDE είναι deferred: το 23P01 έρχεται στο COMMIT χωρίς τον άλλον κύκλο. | Η συνάρτηση ελέγχει πρώτα επικάλυψη με SELECT και αρνείται `truck_busy:<RT-…>`· το EXCLUDE μένει δίχτυ. |
| C-27 | **Τοπικό φορτηγό «απασχολημένο»** | Ροή 10 κενό 4: χωρίς κύκλο, το EXCLUDE δεν βλέπει το φορτηγό του τοπικού. | Εκτός Φ2· μόνο ένδειξη στη Φ4. |

---

## 7. Συγκρούσεις και περιορισμοί από τη ζωντανή 071/071b (K)

| # | Κανόνας της 071 | Τι σημαίνει για τη Φ2 |
|---|---|---|
| K-01 | `plan:hard_delete` στα `rt_stops`, `piece_legs`, `shipment_pieces`, `shipments` | Διαγραφή/Καθαρισμός/Μεταφορά/αναίρεση σπασίματος = **μόνο soft delete**. Το `plan_notices` δεν έχει `deleted_at`: ειδοποίηση δεν σβήνεται, μόνο «διαβάστηκε». Κανένα `DELETE` ούτε στο `072_rollback` αν υπάρχουν γραμμές (αρνείται). |
| K-02 | `rt_stops_win`: `planned_to > planned_from` (όχι `>=` του tech) | Κάθε στάση που γράφει η Φ2 είναι παράθυρο, ποτέ στιγμή· οι προεπιλογές (C-06, C-07) πρέπει να το τηρούν. |
| K-03 | `pieces_sum` και στις γέφυρες: Σ φύλλων = `order_stops.pallets` (σβησμένη στάση → 0)· `plan_chk_bridge_stop` στο UPDATE `pallets`/`deleted_at` | Κάθε `plan_*` που αλλάζει κομμάτια γέφυρας (split, split+put, αναίρεση σπασίματος) κρατά το άθροισμα στην ίδια συναλλαγή. Η διόρθωση παλετών/διαγραφή στάσης από τον διεθνών («πάντα διόρθωση, ποτέ άρνηση») **δεν** είναι Φ2 (trigger γέφυρας, Φ5)· η Φ2 πρέπει όμως να δώσει τους βοηθούς που θα καλεί η Φ5. |
| K-04 | `leg_locked`, `stop_locked`, `piece_locked`, `shipment_locked`, `model_locked` | Μεταφορά = νέες κινήσεις/στάσεις στον στόχο· αναίρεση σπασίματος = soft delete παιδιών (ο γονέας ξαναγίνεται φύλλο). `leg_no` επαναχρησιμοποιείται μόνο μετά το soft delete (`piece_legs_live_no`). |
| K-05 | `leg_place`: κομμάτι μόνο ανάμεσα σε αφετηρία, Βέροια, προορισμό του | «Μεταφορά σε… → Πίνακα Βέροιας» επιτρέπεται για κάθε εθνική· καμία άλλη μεταφόρτωση. |
| K-06 | `plan_chk_bridge_stop` **δεν** ακούει `order_stops.location_id` | Το `plan_vs_set_place` (και κάθε αλλαγή τόπου της διεθνούς) μπορεί να αφήσει κινήσεις με λάθος προορισμό χωρίς άρνηση στο COMMIT. Η Φ2 πρέπει να διορθώνει στάση/κίνηση στην ίδια συναλλαγή και να καλεί η ίδια `plan_shipment_problem`· η διεύρυνση του trigger σε `location_id` είναι αλλαγή 071 (Φ5, με md5). |
| K-07 | EXCLUDE `rt_v2_truck_once`/`rt_v2_driver_once` **deferred**, μόνο OWNED, όχι `cancelled`, `[start_at, end_at)` | Το 23P01 εμφανίζεται στο COMMIT της RPC, χωρίς τον άλλον κύκλο (C-26). Οι κύκλοι PARTNER δεν ελέγχονται. Μετά τον Καθαρισμό (truck NULL) ο κύκλος βγαίνει από τον έλεγχο. |
| K-08 | `rt_v2_window`, `rt_v2_dates`, `rt_window` + `plan_rt_window_sync` που κάνει UPDATE μόνο σε υπάρχοντα κύκλο | Στο `plan_rt_create` οι στάσεις μπαίνουν πριν τον κύκλο, άρα το sync δεν ενημερώνει τίποτα: η συνάρτηση υπολογίζει η ίδια `start_at = min(planned_from)`, `end_at = max(planned_to)`, `date_start/date_end` (Αθήνα) **ακριβώς**· αλλιώς `rt_window` στο COMMIT. |
| K-09 | `rt_v2_status` (`planned`/`cancelled`) + `rt_cancelled` (κύκλος `cancelled` με ζωντανή κίνηση) | Σειρά: πρώτα soft delete κινήσεων, μετά `status='cancelled'`. Καμία «κλειστή» κατάσταση. |
| K-10 | `local_loading_day` (`move_date` = ημέρα του `planned_from`), `local_loading_stop` (η στάση έχει ζωντανή φόρτωση κομματιού), `local_loading_gone` | Κάθε `plan_*` που μετακινεί/σβήνει στάση ή αδειάζει τη φόρτωσή της ενημερώνει/ακυρώνει τη `nat_loading` στην ίδια συναλλαγή (και τη βάζει στη λίστα συνεπειών). |
| K-11 | `side_order` (ΚΑΘΟΔΟΣ πριν ΑΝΟΔΟ), `stop_order` (`planned_from` μη φθίνον με `seq`), `stop_seq` (μοναδικό στις ζωντανές) | Η εισαγωγή στάσης κάνει επαναρίθμηση `seq` και σέβεται τη χρονική σειρά· στάση ΚΑΘΟΔΟΥ μετά από ΑΝΟΔΟ = άρνηση. |
| K-12 | (Worker) `getCaller` χωρίς token = **401** σε όλο τον Worker | Η αποδοχή του master λέει «403 χωρίς token». Είτε η αποδοχή γίνεται 401, είτε το `/plan/*` γυρίζει 403 (απόκλιση από το πρότυπο `/costs/*`). |
| K-13 | 011 `dl_sync_from_rt` (ζωντανό md5 `331cea3a…`) βάζει `needs_review` σε ακύρωση ή οδηγό NULL με ποσά | Το spec λέει «Δεν υπάρχει `needs_review`»: η Φ2 σβήνει **ρητά** τη γραμμή (`deleted_at`, `deleted_reason`) πριν ακυρώσει/καθαρίσει τον κύκλο, ώστε το 011 να μη βρει ζωντανή γραμμή. Το 011 μένει αμετάβλητο (F1). |
| K-14 | `v_piece_state.is_stock` = παιδί χωρίς δική του κίνηση· `at_hub` αληθές και για γέφυρα εισαγωγής χωρίς κίνηση | «Μέρος μόνο από απόθεμα» = `is_stock`, όχι `at_hub`· ένα VS που «φτάνει σήμερα» σπάει μόνο από το `plan_split_piece`. |
| K-15 | `shipments_intl_is_bridge`, `shipments_shape` | Το `plan_orders_create` γράφει μόνο εθνικές αποστολές με 4 άκρα παραθύρου· καμία διεθνής εκτός γέφυρας. |
| K-16 | `local_moves_nat_loading`: `driver_id` NOT NULL, `status` ∈ {Assigned, Cancelled}· το `local_moves_before` δεν παράγει status για nat_loading | Το `plan_local_loading` γράφει ρητά `status='Assigned'`· ακύρωση = `Cancelled` ή soft delete. |
| K-17 | Οι βοηθοί `*_problem` είναι κλειστοί για `service_role` | Ο Worker δεν τους καλεί απευθείας· μόνο μέσα από τα `plan_*` (SECURITY DEFINER). |

---

## 8. Εκτός Φ2 (X)

- **X-1 Φ3 (`073`):** `ct_v_rt_revenue`/`ct_v_rt_costs`/`ct_v_rt_pnl` για `model=2` (έσοδο από αποστολές, X ανά παλέτα σε όλες τις παλέτες κόμβου, κόμιστρο ως `partner_planned`)· `dl_v_rt_route` από `rt_stops` (Ε9)· φθορά με NULL km (Ε8)· DKV κατά ώρα (Ε10)· «κλειστό» του `/costs/rt` από `v_rt_cycle.ended` (Ε21)· παλέτες: feeder μέσα στα `plan_*`, πύλη από κομμάτια, φρουρός διπλής DELIVERY (Ε11)· απόθεμα 057 από `v_piece_state` (Ε6)· νέοι έλεγχοι ελεγκτή του spec §8 (X ανά VS, έσοδα + μη ανατεθειμένα, κόμιστρο που λείπει, DKV χωρίς δρομολόγιο, αδιάβαστες ειδοποιήσεις > 24 ώρες, άδειος κύκλος, μεικτές θερμοκρασίες ≥ 2 °C). Η Φ3 θα αλλάξει τα `plan_*` της Φ2 (feeder), άρα η Φ2 αφήνει σημεία αγκίστρωσης.
- **X-2 Φ4:** `core/plan-api.js` (`planFetch`), `modules/weekly_natl_v5.js`, Πίνακας Βέροιας, φόρμα εθνικής v5, φύλλο οδηγού, λωρίδα ειδοποιήσεων, `FEATURES.WN_V5`, rigs, οθόνες Ε1–Ε3, Ε5, Ε9 (ανάγνωση), Ε12–Ε15, Ε20, checkbox κόμβου ανά στάση στη διεθνή φόρμα.
- **X-3 Φ5 (`074`, ημέρα L):** `plan_config`/ημέρα L· trigger γέφυρας VS (δημιουργία γέφυρας για VS ≥ L με `cross_dock_date`, αποσύνδεση NL στην ίδια συναλλαγή, «ακολουθεί + ειδοποίηση» σε αλλαγή ημέρας/παλετών/τόπου/διαγραφής από τον διεθνών, αναίρεση σπασίματος, ξανακόψιμο κομματιών)· backfill `via_hub`· soft delete δοκιμών (GL → `Unassigned`)· 028/030/069 σταματούν να μετακινούν ιστορικά NL· Ε16 (facade RBAC, AI chat, quick edit, «Επαναφορά» Κάδου), Ε17 (B-26/B-42/B-10/B-47), Ε18 (`/costs/rt` from/to υποχρεωτικό, όριο 1000, `truncated`), Ε19 (`delete_order_cascade` με dry run)· `core/stops-helpers.js:95`· η ερώτηση «διεθνής `Cancelled`»· `WN_V5` on.
- **X-4 Β0:** τιμολόγηση από την καταχώρηση (071a + PR #69) — έκλεισε 22/10.
- **X-5 Φ6/Φ7:** μετρήσεις δύο εβδομάδων· αφαίρεση νεκρού κώδικα και αλλαγή ρόλων NL/GL/CL.
- **X-6 Αποσύρθηκαν οριστικά (spec §7):** `plan_restore` και `restore`, `deleted_at` στο `ct_round_trips`, `plan_chk_hub`/`hub_endpoint`, B-88/«ποιος φορτώνει», «μόνο PALLET», `piece_planned`/`bridge_moved`/`bridge_split`, συνύπαρξη/πάγωμα/`planEraOf`/`legacy_nl`/B-82.
- **X-7 Αναβάλλεται:** groupage διεθνούς εξαγωγής προς τη Βέροια (spec §3 VS· CHECK `shipments_intl_is_bridge`).

---

## 9. «Αν σπάσει, πώς θα το μάθω;» (για το πλάνο Φ2)
- Άρνηση → 422 με ελληνικό κείμενο και κωδικό· άγνωστος κωδικός → 422 που τον ονομάζει (W-05).
- Contract test: κωδικός ή constraint χωρίς κείμενο = κόκκινο build (W-14).
- Worker πριν από το 072 → 503 «λείπει το 072», όχι 500 (Deploy).
- Μετά το deploy: `SELECT count(*)` στους 5 νέους πίνακες = 0 και `model=2` = 0 (πίνακας, όχι οθόνη).
- Ειδοποιήσεις αδιάβαστες > 24 ώρες: έλεγχος ελεγκτή (Φ3/Φ5)· η Φ2 γράφει τις γραμμές που θα μετρήσει.
