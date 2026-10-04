-- 057b — DRAFT (NOT EXECUTED) — the auditor learns stock lots. SEPARATE approval from 057; run it
-- only after 057_stock_lots_verify.sql V1–V8 pass. ONE DO block (lesson 056): the 7 new checks, the
-- 2 changed ones and their proofs commit together or not at all.
--
-- WHY each check (plan §6, owner Ε3):
--   S-01 P1  remaining < 0 — impossible while the guards stand; > 0 = they were bypassed.
--   S-02 P1  a guard trigger or one of the 6 CHECKs is gone/disabled (e.g. R1 of the rollback;
--            back with 057_stock_lots_guards_on.sql).
--   S-03 P1  an invoiced lot that is not complete (the one-invoice rule broken).
--   S-05 P2  a lot received > 21 days ago and still not complete (queue: pallets aging abroad).
--   S-06 P1  pieces moving / delivered while the lot's intake was never marked delivered.
--   S-09 P3  EVERY «Κλείσιμο υπολοίπου» of the last 24 h, one line each: lot · pallets written off ·
--            «χαμένο υπόλοιπο» amount · who (actor/role from audit_log) · the reason (Ε3).
--   S-11 P2  a lot received > 2 days ago without allocation (no price / no warehouse cost).
--   B-13     pieces never carry a price by design → no longer «delivered without price».
--   B-15     a lot counts from the day it became COMPLETE (not from its intake); pieces never count.
-- B-16 is unchanged (a piece cannot carry pallet exchange — CHECK). S-04/S-07/S-08 are not created
-- (plan v4); S-10 is out of scope (plan Π7).
--
-- THE CHECK GUARD: monitoring.check_sql_guard() allows only a short list of functions (no to_char,
-- no nullif, no LATERAL). The S-09 amount is therefore round(x, 2) and its «who» a scalar subquery.
-- The proofs below run every new/changed check through the guard AND execute it as
-- tms_check_runner, exactly like monitoring.run_checks() will — so a check that would error at its
-- first run fails HERE instead (principle 6).
--
-- AFTER RUNNING: mirror these 9 checks into tms-auditor/checks/*.sql (S-01…S-11 new files, B-13 and
-- B-15 edited) and regenerate 047b, or the seed-drift test fails.

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
   where id in ('S-01', 'S-02', 'S-03', 'S-05', 'S-06', 'S-09', 'S-11');
  if v_n <> 0 then raise exception '057b guard: % S-check(s) already exist — 057b ran before', v_n; end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-13';
  if v_md5 is distinct from '84dfe3aa966da031b4c285a8323352d7' then
    raise exception '057b guard: B-13 text changed since 4/10 (md5 %) — regenerate the draft', v_md5;
  end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-15';
  if v_md5 is distinct from '66d4436c229d127b3626c6c3b0f3fe45' then
    raise exception '057b guard: B-15 text changed since 4/10 (md5 %) — regenerate the draft', v_md5;
  end if;

  -- ── The 7 new checks ──────────────────────────────────────────────────────────────────────────
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
   $c$SELECT (3 - (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname IN ('stock_guard_lots','stock_guard_orders','stock_guard_natl'))) + (6 - (SELECT count(*) FROM pg_constraint WHERE conname IN ('orders_stock_piece_no_money','orders_stock_piece_shape','national_orders_stock_piece_no_money','national_orders_stock_piece_shape','stock_lots_one_source','stock_lots_close_shape')))$c$,
   null, null, '>', 0, 'P1', 'hourly', false,
   'Χωρίς τους φρουρούς του 057 ένα κομμάτι παίρνει τιμή, ξεπερνά το απόθεμα ή τιμολογείται ατελής παρτίδα — σιωπηλά.',
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
   $c$SELECT count(DISTINCT l.id) FROM stock_v_lots l JOIN stock_v_pieces p ON p.lot_id = l.id WHERE NOT l.intake_delivered AND p.status IN ('In Transit','Delivered') AND p.loading_date < current_date$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT DISTINCT l.legacy_id AS x FROM stock_v_lots l JOIN stock_v_pieces p ON p.lot_id = l.id WHERE NOT l.intake_delivered AND p.status IN ('In Transit','Delivered') AND p.loading_date < current_date ORDER BY l.legacy_id LIMIT 50) s$c$,
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
  ('S-11', 'Απόθεμα: παραληφθείσα παρτίδα χωρίς επιμερισμό > 2 ημέρες', array['F-36'],
   $c$SELECT count(*) FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2$c$,
   $c$SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lot_money m JOIN stock_v_lots l ON l.id = m.lot_id WHERE m.allocation_status <> 'ok' AND l.intake_delivered AND l.received_on < current_date - 2 ORDER BY l.legacy_id LIMIT 50) s$c$,
   'stock_lots', '>', 0, 'P2', 'daily', true,
   'Χωρίς τιμή πελάτη ή κόστος αποθήκης η παρτίδα δεν επιμερίζεται: όλη η τιμή μένει στη γραμμή της παρτίδας και τα RT των κομματιών δείχνουν έσοδο 0 στο TRIP PnL.',
   'Συμπλήρωση της τιμής στην παρτίδα ή του Partner Rate στην ανάθεση της αποθήκης.',
   'σταθερός έλεγχος SQL — δείχνει ΤΙ, όχι ΓΙΑΤΙ', 'Εθνική πηγή ή παραλαβή με δικό μας φορτηγό: χωρίς κόστος αποθήκης μέχρι τη Φ3 (Ε6/Ε7) — χτυπά σκόπιμα.', true);

  -- ── The 2 changed checks ──────────────────────────────────────────────────────────────────────
  update monitoring.checks set sql_text = sql_text || E'\n AND stock_lot_id IS NULL' where id = 'B-13';
  update monitoring.checks
     set sql_text = $c$SELECT count(*) FROM orders o LEFT JOIN stock_v_lots l ON l.order_id = o.id WHERE o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND o.parent_order_id IS NULL AND o.stock_lot_id IS NULL AND CASE WHEN l.id IS NULL THEN coalesce(o.actual_delivery_date,o.delivery_datetime) < current_date-30 ELSE l.complete AND l.completed_on < current_date-30 END$c$
   where id = 'B-15';

  -- ── Proofs: every new/changed check passes the guard and runs as the auditor does ────────────
  select count(*) into v_n from monitoring.checks
   where id in ('S-01', 'S-02', 'S-03', 'S-05', 'S-06', 'S-09', 'S-11') and enabled;
  if v_n <> 7 then raise exception '057b proof: % of 7 S-checks enabled', v_n; end if;
  select md5(sql_text) into v_md5 from monitoring.checks where id = 'B-13';
  if v_md5 is distinct from md5($c$SELECT count(*) FROM orders WHERE deleted_at IS NULL AND status='Delivered' AND coalesce(price,0)<=0 AND parent_order_id IS NULL
 AND coalesce(actual_delivery_date,delivery_datetime) < current_date-3
 AND stock_lot_id IS NULL$c$) then
    raise exception '057b proof: B-13 text is not the expected one (md5 %)', v_md5;
  end if;

  for r in select id, sql_text, ids_sql from monitoring.checks
            where id in ('S-01', 'S-02', 'S-03', 'S-05', 'S-06', 'S-09', 'S-11', 'B-13', 'B-15') order by id loop
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
