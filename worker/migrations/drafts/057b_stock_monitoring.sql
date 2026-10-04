-- 057b — DRAFT (NOT EXECUTED) — the auditor learns stock lots. SEPARATE approval from 057; run it
-- only after 057_stock_lots_verify.sql V1–V8 pass. ONE DO block (lesson 056): the 10 new checks, the
-- 4 changed ones and their proofs commit together or not at all.
--
-- WHY each check (plan §6, owner Ε3; S-12/S-13/B-34/B-34b = impact map 4/10):
--   S-01 P1  remaining < 0 — impossible while the guards stand; > 0 = they were bypassed.
--   S-02 P1  a guard trigger or one of the 8 CHECKs is gone/disabled (e.g. R1 of the rollback;
--            back with 057_stock_lots_guards_on.sql). Round 2: 6 → 8 — stock_lots_charge_nonneg (a
--            negative warehouse charge would ADD revenue) and ct_settings_full_truck_pallets_positive
--            (F = 0 kills TRIP PnL; OWNER-Q3) belong to the same list as 057 §9 proves (principle 3).
--   S-03 P1  an invoiced lot that is not complete (the one-invoice rule broken).
--   S-05 P2  a lot received > 21 days ago and still not complete (queue: pallets aging abroad).
--   S-06 P1  pieces moving / delivered while the lot's intake was never marked delivered — counts lots
--            with stock_v_lots.pieces_moving > 0 (round 1 D3): ONE definition, the same column the
--            Weekly shelf's red chip reads («Pieces Moving»), so the screen and the auditor can never
--            say two different things about the same lot (critic-1 C1-01).
--   S-09 P3  EVERY «Κλείσιμο υπολοίπου» of the last 24 h, one line each: lot · pallets written off ·
--            «χαμένο υπόλοιπο» amount · who (actor/role from audit_log) · the reason (Ε3).
--   S-11 P2  a lot received > 2 days ago without allocation: no price, or no warehouse charge at all
--            (round 2, owner 4/10: neither a partner assignment nor «Χρέωση αποθήκης» entered —
--            stock_v_lot_money 'no_charge'). ONE rule for every lot, so an own-truck or a national lot
--            without the field shouts until the owner enters it (0 is a valid answer). Any other
--            non-'ok' status shouts too — the SQL says <> 'ok' on purpose: 'no_partner_rate' (round 3,
--            critic-3 Σ2-03: an assignment whose «Κόμιστρο συνεργάτη» is empty) and 'no_pallets'
--            (guards bypassed). Round 3 (Σ2-04): ALSO a lot whose charges exceed its price (net < 0)
--            — still allocated (net = price − charge is the owner's rule), but a typo of 6500 for 650
--            would otherwise surface weeks later as loss-making RTs. No 2-day wait for that one: it is
--            a wrong number, not a number not yet entered.
--   S-12 P2  an order of the SAME client LOADING at the warehouse of a live, not complete lot that is
--            not a piece (map PR-17/G-15): pallets leave the warehouse past the stock — the lot never
--            empties, nothing is allocated.
--   S-13 P2  an order of the SAME client DELIVERING to the warehouse of a live, not complete lot that
--            is not a lot itself (map G-14): the pallets are on no shelf, no piece can be drawn, the
--            full price looks invoiceable at intake.
--            OWNER-Q5 answered 4/10 (any location can be a warehouse): «warehouse» is no longer a
--            location TYPE — it is the destination of a live lot that is not complete yet, and only
--            that lot's client's orders written AFTER that lot count (Ε4: the past is never linked).
--            Round 1 counted every order at a 'Partner Warehouse' location after the first live lot;
--            with any location allowed, a type test would see nothing, and «any order at any lot's
--            destination» would count every other client delivering to the same depot. A Cancelled
--            order moves nothing and never counts. A dead (unmarked) proof lot opens nothing: only
--            stock_v_lots rows (live anchor, live source) define a warehouse (round 1b P3-7 kept).
--   S-14 P2  a live, not complete lot whose warehouse location was soft-deleted (round 3, critic-3
--            Σ2-09): «ONE live destination» (lot_no_dest) is judged when the lot or its destination
--            is written, not when the LOCATION is deleted later (e.g. a duplicate clean-up). Every new
--            piece then takes the deleted location as its pickup and the screens show no warehouse
--            name. A check, not a refusal on locations: the clean-up is a locations screen that
--            knows nothing of lots, and the fix (restore the location) is one click.
--   B-13     pieces never carry a price by design → no longer «delivered without price».
--   B-15     a lot counts from the day it became COMPLETE (not from its intake); pieces never count.
--   B-34 / B-34b  a designed stock refusal (Greek 422 STOCK_RULE: over_draw, piece_on_truck, …) is an
--            ANSWER, not an error. The front logs it with context «_atRetry 422 rule» (app_errors
--            .message = ctx || ': ' || msg); counted, every refused delete would trip B-34b once per
--            order and B-34 after ~3 refusals a day (map AU-07). Other 422s keep counting. «_» is a
--            LIKE wildcard that also matches itself — no other message starts «?atRetry 422 rule».
--            Until the front ships that context, refusals log as «_atRetry 422: …» and still count.
-- B-16 is unchanged (a piece cannot carry pallet exchange — CHECK). S-04/S-07/S-08 are not created
-- (plan v4); S-10 is out of scope (plan Π7). B-54 (trigger inventory) is NOT here: 057 moves it
-- to «measured + 4» in the same commit as its four triggers (057 header — 057b may run days later).
--
-- GUARDED TEXTS: B-13 84dfe3aa…, B-15 66d4436c…, B-34 ee5498c6…, B-34b 077efbe5… — re-read live on
-- 4/10 evening AFTER 034 and 058 ran (058 added B-59…B-62 and touched none of them). The 10 new ids
-- S-01…S-14 exist nowhere (live: 75 checks, B-01…B-62 and P-01…P-09; main's 047b seed and the 058
-- draft hold no S-id) — and the guard below refuses to run if one appears.
--
-- THE CHECK GUARD: monitoring.check_sql_guard() allows only a short list of functions (no to_char,
-- no nullif, no LATERAL). The S-09 amount is therefore round(x, 2) and its «who» a scalar subquery.
-- The proofs below run every new/changed check through the guard AND execute it as
-- tms_check_runner, exactly like monitoring.run_checks() will — so a check that would error at its
-- first run fails HERE instead (principle 6).
--
-- AFTER RUNNING: mirror these 14 checks into tms-auditor/checks/*.sql (S-01…S-14 new files; B-13,
-- B-15, B-34, B-34b edited; and B-54 «red: <> N» from 057's NOTICE) and regenerate 047b, or the seed-drift
-- test fails.

do $mon$
declare
  v_md5 text;
  v_n   int;
  r     record;
  v     numeric;
  ids   text[];
begin
  perform set_config('search_path', 'public', true);

  -- ── Guards ────────────────────────────────────────────────────────────────────────────────────
  if to_regclass('public.stock_v_lots') is null or to_regclass('public.stock_v_lot_money') is null then
    raise exception '057b guard: run 057 first (stock_v_lots / stock_v_lot_money missing)';
  end if;
  select count(*) into v_n from monitoring.checks
   where id in ('S-01', 'S-02', 'S-03', 'S-05', 'S-06', 'S-09', 'S-11', 'S-12', 'S-13', 'S-14');
  if v_n <> 0 then raise exception '057b guard: % S-check(s) already exist — 057b ran before', v_n; end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-13';
  if v_md5 is distinct from '84dfe3aa966da031b4c285a8323352d7' then
    raise exception '057b guard: B-13 text changed since 4/10 (md5 %) — regenerate the draft', v_md5;
  end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-15';
  if v_md5 is distinct from '66d4436c229d127b3626c6c3b0f3fe45' then
    raise exception '057b guard: B-15 text changed since 4/10 (md5 %) — regenerate the draft', v_md5;
  end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-34';
  if v_md5 is distinct from 'ee5498c631cd9c1b9426ba7cda9d69b2' then
    raise exception '057b guard: B-34 text changed since 4/10 (md5 %) — regenerate the draft', v_md5;
  end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-34b';
  if v_md5 is distinct from '077efbe51163e3630b7a96b3f09fbe96' then
    raise exception '057b guard: B-34b text changed since 4/10 (md5 %) — regenerate the draft', v_md5;
  end if;

  -- ── The 10 new checks ─────────────────────────────────────────────────────────────────────────
  insert into monitoring.checks (id, title, flows, sql_text, ids_sql, entity_table, red_op, red_value, severity,
                                 schedule_tag, is_queue, impact, next_step, confidence, exceptions, enabled)
  values
  ('S-01', 'Απόθεμα: υπόλοιπο παρτίδας κάτω από 0', array['F-14','F-30'],
   $c$SELECT count(*) FROM stock_v_lots WHERE remaining_pallets < 0$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE remaining_pallets < 0 ORDER BY legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P1', 'hourly', false,
   'Βγήκαν περισσότερες παλέτες από όσες μπήκαν στην αποθήκη: ο φρουρός της βάσης παρακάμφθηκε· ο επιμερισμός και το τιμολόγιο της παρτίδας είναι λάθος.',
   'Ράφι του Weekly → η παρτίδα → ποιο κομμάτι έχει λάθος παλέτες (ανάγνωση). Μετά: S-02 — είναι ενεργοί οι φρουροί;',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Καμία: ο κανόνας ζει στη βάση (stock_guard_orders / stock_guard_natl).', true),
  ('S-02', 'Απόθεμα: φρουροί της βάσης ανενεργοί', array['F-14','F-30'],
   $c$SELECT (3 - (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname IN ('stock_guard_lots','stock_guard_orders','stock_guard_natl'))) + (8 - (SELECT count(*) FROM pg_constraint WHERE conname IN ('orders_stock_piece_no_money','orders_stock_piece_shape','national_orders_stock_piece_no_money','national_orders_stock_piece_shape','stock_lots_one_source','stock_lots_close_shape','stock_lots_charge_nonneg','ct_settings_full_truck_pallets_positive')))$c$,
   null, null, '>', 0, 'P1', 'hourly', false,
   'Χωρίς τους φρουρούς του 057 ένα κομμάτι παίρνει τιμή, ξεπερνά το απόθεμα, τιμολογείται ατελής παρτίδα, μπαίνει αρνητική χρέωση αποθήκης ή μηδενίζεται το F του VS κομματιού — σιωπηλά.',
   'Αν έτρεξε το R1 της επαναφοράς: ξαναμπαίνουν με το 057_stock_lots_guards_on.sql μόλις διορθωθεί το σφάλμα. Αλλιώς: ποιος άλλαξε τη βάση;',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Το R1 (057_stock_lots_rollback_r1_guards_off.sql) το ανάβει σκόπιμα.', true),
  ('S-03', 'Απόθεμα: τιμολογημένη παρτίδα που δεν είναι πλήρης', array['F-30'],
   $c$SELECT count(*) FROM stock_v_lots WHERE invoiced AND NOT complete$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE invoiced AND NOT complete ORDER BY legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P1', 'hourly', false,
   'Ένα τιμολόγιο εκδόθηκε ενώ μένουν παλέτες στην αποθήκη ή κομμάτια σε κίνηση: ο πελάτης χρεώθηκε για κάτι που δεν παραδόθηκε ακόμη.',
   'Προς τιμολόγηση → η παρτίδα → λίστα κομματιών (ανάγνωση). Ο φρουρός 057 το αρνείται — αν χτυπήσει, γράφτηκε με SQL ή με ανενεργούς φρουρούς (S-02).',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', null, true),
  ('S-05', 'Απόθεμα: παρτίδα στην αποθήκη > 21 ημέρες, όχι πλήρης', array['F-30'],
   $c$SELECT count(*) FROM stock_v_lots WHERE intake_delivered AND NOT complete AND received_on < current_date - 21$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE intake_delivered AND NOT complete AND received_on < current_date - 21 ORDER BY legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P2', 'daily', true,
   'Παλέτες πελάτη κάθονται στην αποθήκη συνεργάτη πάνω από 3 εβδομάδες· η παρτίδα δεν τιμολογείται μέχρι να αδειάσει ή να κλείσει.',
   'Ράφι του Weekly (πορτοκαλί τσιπ «>21η»): κομμάτι στο επόμενο φορτηγό ή «Κλείσιμο υπολοίπου» με αιτιολογία.',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', null, true),
  ('S-06', 'Απόθεμα: κομμάτια κινούνται ενώ η παραλαβή δεν σημειώθηκε', array['F-26','F-14'],
   $c$SELECT count(*) FROM stock_v_lots WHERE pieces_moving > 0$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT legacy_id AS x FROM stock_v_lots WHERE pieces_moving > 0 ORDER BY legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P1', 'hourly', false,
   'Φεύγουν παλέτες από αποθήκη όπου η παρτίδα δεν έχει μπει ακόμη: είτε ξεχάστηκε το «Παραδόθηκε» της παραλαβής, είτε φορτώνουμε κάτι που δεν υπάρχει.',
   'Weekly → η γραμμή της παρτίδας (σήμα «→ ΑΠΟΘΗΚΗ»): σημειώθηκε η παράδοση στην αποθήκη; (ανάγνωση)',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Κομμάτια με φόρτωση σήμερα δεν μετρούν (η παραλαβή μπορεί να σημειωθεί αργότερα μέσα στη μέρα).', true),
  ('S-09', 'Απόθεμα: κλείσιμο υπολοίπου (24ωρο)', array['F-30','F-36'],
   $c$SELECT count(*) FROM stock_v_lots WHERE closed_at >= now() - interval '24 hours'$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT '#' || l.lot_no || ' · ' || l.written_off_pallets || 'p · ' || coalesce(round(m.written_off_amount, 2) || ' €', '—') || ' · ' || coalesce((SELECT al.actor || '/' || al.role FROM audit_log al WHERE al.table_name = 'stock_lots' AND al.record_id = l.legacy_id AND al.action = 'update' AND ((al.after_data #>> '{}')::jsonb ->> 'closed_note') IS NOT NULL ORDER BY al.created_at DESC LIMIT 1), '?') || ' · ' || left(l.closed_note, 80) AS x FROM stock_v_lots l LEFT JOIN stock_v_lot_money m ON m.lot_id = l.id WHERE l.closed_at >= now() - interval '24 hours' ORDER BY l.lot_no LIMIT 50) s$c$,
   null, '>', 0, 'P3', 'daily', true,
   'Κάθε κλείσιμο υπολοίπου γράφει παλέτες ως χαμένες: το «χαμένο υπόλοιπο» δεν πιστώνεται σε κανένα RT (Ε3 «β»). Ο owner το βλέπει με όνομα, παλέτες, ποσό και αιτιολογία.',
   'Ανάγνωση της γραμμής· αν η αιτιολογία δεν πείθει, μιλάμε με όποιον το έκλεισε πριν το τιμολόγιο.',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Ποσό «—» = η παρτίδα δεν έχει επιμερισμό (βλ. S-11). «?» = δεν βρέθηκε γραμμή audit_log (κλείσιμο εκτός Worker).', true),
  ('S-11', 'Απόθεμα: παρτίδα χωρίς επιμερισμό > 2 ημέρες ή με χρεώσεις πάνω από την τιμή', array['F-36'],
   $c$SELECT count(*) FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE (m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2) OR m.net < 0$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE (m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2) OR m.net < 0 ORDER BY l.legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P2', 'daily', true,
   'Χωρίς τιμή πελάτη, χωρίς «Κόμιστρο συνεργάτη» στην ανάθεση ή χωρίς καμία χρέωση (ούτε ανάθεση ούτε «Χρέωση αποθήκης») η παρτίδα δεν επιμερίζεται: όλη η τιμή μένει στη γραμμή της παρτίδας και τα RT των κομματιών δείχνουν έσοδο 0 στο TRIP PnL. Με «Σύνολο χρεώσεων» πάνω από την τιμή το «Καθαρό» είναι αρνητικό και κάθε RT κομματιού γράφει ζημιά.',
   'Owner: φόρμα της παρτίδας → «Χρέωση αποθήκης» (0 αν η αποθήκη δεν χρεώνει τίποτα) ή τιμή πελάτη· «Κόμιστρο συνεργάτη» στην ανάθεση της αποθήκης. Αρνητικό «Καθαρό» = λάθος ποσό (π.χ. 6500 αντί 650).',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Παρτίδα με δικό μας φορτηγό ή εθνική πηγή: χτυπά μέχρι να μπει η «Χρέωση αποθήκης» — σκόπιμα (owner 4/10: ένας κανόνας για κάθε παρτίδα). Αρνητικό «Καθαρό» χτυπά αμέσως, χωρίς τις 2 ημέρες. «Χωρίς παλέτες» = παρακαμμένοι φρουροί, βλ. S-02.', true),
  -- OWNER-Q5 answered 4/10 (any location can be a warehouse): S-12 / S-13 read the warehouse from
  -- the live, not complete lots of the same client (header), never from a location type.
  ('S-12', 'Απόθεμα: φόρτωση από την αποθήκη ανοιχτής παρτίδας, όχι ως κομμάτι', array['F-05','F-30'],
   $c$SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.client_id = o.client_id AND l.warehouse_location_id = o.loading_location_1_id AND o.created_at > a.created_at)$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.client_id = o.client_id AND l.warehouse_location_id = o.loading_location_1_id AND o.created_at > a.created_at) ORDER BY o.legacy_id LIMIT 50) s$c$,
   'orders', '>', 0, 'P2', 'daily', true,
   'Παλέτες του ίδιου πελάτη φεύγουν από την αποθήκη μιας ανοιχτής παρτίδας με απλή παραγγελία, όχι ως κομμάτι: το απόθεμα δεν μειώνεται, ο επιμερισμός δεν τις βλέπει και η παρτίδα δεν κλείνει ποτέ σωστά — ή φορτώνουμε κάτι που δεν μπήκε ποτέ στο απόθεμα.',
   'Weekly → η παραγγελία (ανάγνωση): είναι κομμάτι που γράφτηκε ως απλή παραγγελία; Τότε «+ Κομμάτι από απόθεμα» στο ίδιο φορτηγό και σβήσιμο της απλής.',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', '«Αποθήκη» = ο προορισμός μιας ζωντανής, μη πλήρους παρτίδας (οποιαδήποτε τοποθεσία, owner 4/10). Μετρούν μόνο παραγγελίες του ίδιου πελάτη, γραμμένες μετά την παρτίδα (Ε4: το παρελθόν δεν συνδέεται· μια διαγραμμένη παρτίδα-δοκιμή δεν μετρά). Ακυρωμένες δεν μετρούν.', true),
  ('S-13', 'Απόθεμα: παραγγελία προς την αποθήκη ανοιχτής παρτίδας χωρίς παρτίδα', array['F-05','F-30'],
   $c$SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND NOT EXISTS (SELECT 1 FROM stock_lots s WHERE s.order_id = o.id AND s.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.client_id = o.client_id AND l.warehouse_location_id = o.unloading_location_1_id AND o.created_at > a.created_at)$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT o.legacy_id AS x FROM orders o WHERE o.deleted_at IS NULL AND o.status IS DISTINCT FROM 'Cancelled' AND NOT EXISTS (SELECT 1 FROM stock_lots s WHERE s.order_id = o.id AND s.deleted_at IS NULL) AND EXISTS (SELECT 1 FROM stock_v_lots l JOIN stock_lots a ON a.id = l.id WHERE NOT l.complete AND l.client_id = o.client_id AND l.warehouse_location_id = o.unloading_location_1_id AND o.created_at > a.created_at) ORDER BY o.legacy_id LIMIT 50) s$c$,
   'orders', '>', 0, 'P2', 'daily', true,
   'Παραγγελία του ίδιου πελάτη παραδίδει στην αποθήκη μιας ανοιχτής παρτίδας χωρίς να είναι παρτίδα: οι παλέτες δεν φαίνονται στο ΑΠΟΘΕΜΑ, κανένα κομμάτι δεν βγαίνει από αυτές, και η παραγγελία μοιάζει έτοιμη για τιμολόγηση από την παραλαβή, ενώ ο πελάτης δεν έχει παραλάβει.',
   'Φόρμα της παραγγελίας (ανάγνωση): είναι απόθεμα πελάτη; Τότε «Παρτίδα αποθέματος». Αλλιώς ο προορισμός μπήκε λάθος.',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Μόνο παραγγελίες του ίδιου πελάτη προς τον προορισμό μιας ζωντανής, μη πλήρους παρτίδας, γραμμένες μετά από αυτήν (οποιαδήποτε τοποθεσία, owner 4/10)· ακυρωμένες δεν μετρούν. Μια δεύτερη αποστολή του πελάτη στην ίδια αποθήκη γίνεται δεύτερη παρτίδα.', true),
  ('S-14', 'Απόθεμα: ανοιχτή παρτίδα με διαγραμμένη αποθήκη', array['F-05','F-30'],
   $c$SELECT count(*) FROM stock_v_lots l JOIN locations w ON w.id = l.warehouse_location_id WHERE w.deleted_at IS NOT NULL AND NOT l.complete$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lots l JOIN locations w ON w.id = l.warehouse_location_id WHERE w.deleted_at IS NOT NULL AND NOT l.complete ORDER BY l.legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P2', 'daily', false,
   'Η τοποθεσία-αποθήκη μιας ανοιχτής παρτίδας διαγράφηκε (π.χ. καθάρισμα διπλότυπων): κάθε νέο κομμάτι παίρνει φόρτωση από τη διαγραμμένη τοποθεσία και οι οθόνες δεν δείχνουν όνομα αποθήκης.',
   'Τοποθεσίες: επαναφορά της διαγραμμένης τοποθεσίας. Αν ήταν διπλότυπο και η παρτίδα δεν έχει ακόμη κομμάτια, αλλαγή του προορισμού της στη ζωντανή.',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Πλήρεις παρτίδες δεν μετρούν (δεν βγαίνει πια κομμάτι από αυτές).', true);

  -- ── The 4 changed checks ──────────────────────────────────────────────────────────────────────
  update monitoring.checks set sql_text = sql_text || E'\n AND stock_lot_id IS NULL' where id = 'B-13';
  update monitoring.checks
     set sql_text = $c$SELECT count(*) FROM orders o LEFT JOIN stock_v_lots l ON l.order_id = o.id WHERE o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND o.parent_order_id IS NULL AND o.stock_lot_id IS NULL AND CASE WHEN l.id IS NULL THEN coalesce(o.actual_delivery_date,o.delivery_datetime) < current_date-30 ELSE l.complete AND l.completed_on < current_date-30 END$c$
   where id = 'B-15';
  -- Designed stock refusals are answers, not errors (header, map AU-07). Appended, so the rest of
  -- each text stays byte for byte the 4/10 one (md5-guarded above, md5-proved below).
  update monitoring.checks set sql_text = sql_text || E'\n AND message NOT LIKE ''_atRetry 422 rule%''' where id = 'B-34';
  update monitoring.checks set sql_text = sql_text || E'\n AND e.message NOT LIKE ''_atRetry 422 rule%''' where id = 'B-34b';

  -- ── Proofs: every new/changed check passes the guard and runs as the auditor does ────────────
  select count(*) into v_n from monitoring.checks
   where id in ('S-01', 'S-02', 'S-03', 'S-05', 'S-06', 'S-09', 'S-11', 'S-12', 'S-13', 'S-14') and enabled;
  if v_n <> 10 then raise exception '057b proof: % of 10 S-checks enabled', v_n; end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-13';
  if v_md5 is distinct from md5($c$SELECT count(*) FROM orders WHERE deleted_at IS NULL AND status='Delivered' AND coalesce(price,0)<=0 AND parent_order_id IS NULL
 AND coalesce(actual_delivery_date,delivery_datetime) < current_date-3
 AND stock_lot_id IS NULL$c$) then
    raise exception '057b proof: B-13 text is not the expected one (md5 %)', v_md5;
  end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-34';
  if v_md5 is distinct from md5($c$SELECT count(*) FROM app_errors WHERE created_at>now()-interval '24 hours' AND message NOT LIKE 'queue: offline flush%'
 AND message NOT LIKE '_atRetry 422 rule%'$c$) then
    raise exception '057b proof: B-34 text is not the expected one (md5 %)', v_md5;
  end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-34b';
  if v_md5 is distinct from md5($c$SELECT count(DISTINCT left(e.message,40)) FROM app_errors e WHERE e.created_at>now()-interval '1 hour' AND e.message NOT LIKE 'queue: offline flush%'
 AND NOT EXISTS (SELECT 1 FROM app_errors p WHERE left(p.message,40)=left(e.message,40) AND p.created_at BETWEEN now()-interval '8 days' AND now()-interval '1 hour')
 AND e.message NOT LIKE '_atRetry 422 rule%'$c$) then
    raise exception '057b proof: B-34b text is not the expected one (md5 %)', v_md5;
  end if;

  for r in select id, sql_text, ids_sql from monitoring.checks
            where id in ('S-01', 'S-02', 'S-03', 'S-05', 'S-06', 'S-09', 'S-11', 'S-12', 'S-13', 'S-14',
                         'B-13', 'B-15', 'B-34', 'B-34b') order by id loop
    perform monitoring.check_sql_guard(r.sql_text);
    if r.ids_sql is not null then perform monitoring.check_sql_guard(r.ids_sql); end if;
    v := null; ids := null;
    set local role tms_check_runner;            -- the auditor's own, SELECT-only identity
    execute r.sql_text into v;
    if r.ids_sql is not null then execute r.ids_sql into ids; end if;
    reset role;
    if v is null then raise exception '057b proof: % returned NULL', r.id; end if;
    if r.ids_sql is not null and ids is null then raise exception '057b proof: % ids returned NULL', r.id; end if;
    raise notice '057b: % = % %', r.id, v, coalesce(array_to_string(ids, ' | '), '');
  end loop;
end
$mon$;
