-- 034 — Round-trip CREATION for NATIONAL LOADS (owner 15/9/2026, via coordinator)
--
-- DRAFT — ΔΕΝ ΕΚΤΕΛΕΙΤΑΙ ΑΚΟΜΗ. Ενεργοποιείται όταν ο Σωτήρης αρχίσει να
-- καταχωρεί εθνικά φορτία· τρέχει μετά τις 15:00· εκτελεί ΜΟΝΟ ο owner, στο
-- Supabase SQL editor, αφού πρώτα τρέξει (ΔΕΝ αλλάξει) τα SELECT του παρακάτω
-- block «ΥΠΟΘΕΣΕΙΣ» και επιβεβαιώσει ότι backfill_from (πιο κάτω) είναι η
-- σωστή ημερομηνία.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ΥΠΟΘΕΣΕΙΣ — ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9/2026 (SELECT read-only, coordinator). Τα
-- SELECT μένουν, για επανέλεγχο πριν το run (τα νούμερα αλλάζουν με τον χρόνο).
-- ═══════════════════════════════════════════════════════════════════════
--
-- Α. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: national_loads.status ίδιο λεξιλόγιο με orders, καμία
--    CHECK constraint στη βάση (άτυπο, όπως υποτέθηκε). Ζωντανά 45: Assigned 9
--    / Delivered 26 / Pending 10 / Cancelled 0.
--    Για επανέλεγχο: select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'national_loads'::regclass and contype = 'c';
--      select status, count(*) from national_loads where deleted_at is null group by 1;
--
-- Β. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: direction North→South 29 / South→North 16.
--    Για επανέλεγχο: select direction, count(*) from national_loads where deleted_at is null group by 1;
--
-- Γ. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: στήλες ζωντανές επιβεβαιωμένες — id, legacy_id text,
--    name, direction, status, matched_load text, is_partner_trip, partner_id,
--    truck_id, trailer_id, driver_id, loading_datetime timestamptz,
--    delivery_datetime timestamptz, actual_delivery_date date,
--    source_cons_load_id, source_order_id, source_national_order_id,
--    deleted_at, reference. legacy_id/matched_load όπως υποτέθηκε.
--    Για επανέλεγχο: select column_name, data_type from information_schema.columns
--      where table_name='national_loads' and column_name in ('legacy_id','matched_load','reference');
--
-- Δ. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: ΔΕΝ υπάρχει group_id/rotation_id/parent στο
--    national_loads — μόνο matched_load και source_cons_load_id (Δ σωστό).
--    Για επανέλεγχο: select column_name from information_schema.columns
--      where table_name='national_loads' order by 1;
--
-- Ε. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: ct_round_trips_scope_check (INTL/NATL),
--    ct_rt_legs_direction_check (EXPORT/IMPORT/ANODOS/KATHODOS), one_source,
--    unique ct_leg_nat_load — όλα υπάρχουν ήδη· καμία νέα στήλη χρειάζεται
--    (διορθώνει την αρχική πρόταση της ανάθεσης για national_load_id στο
--    ct_round_trips — θα ήταν διπλό σχήμα, αρχή 3).
--    Για επανέλεγχο: select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid in ('ct_round_trips'::regclass,'ct_rt_legs'::regclass) and contype = 'c';
--      select indexname, indexdef from pg_indexes where tablename = 'ct_rt_legs';
--
-- ΣΤ. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: triggers στο ct_round_trips σήμερα: dl_sync_from_rt,
--    rt_sync_to_orders — ΚΑΝΕΝΑ mirror για national legs. Προστέθηκε παρακάτω
--    (rt_sync_to_national_loads) ώστε μια αλλαγή οχήματος/οδηγού μέσω RT να
--    φτάνει και στα national_loads, όχι μόνο στα orders.
--    Για επανέλεγχο: select tgname from pg_trigger where tgrelid = 'ct_round_trips'::regclass and not tgisinternal;
--
-- Ζ. ΕΠΑΛΗΘΕΥΘΗΚΕ 15/9: 45 ζωντανά national_loads, 14 ΜΕ οδηγό ΗΔΗ σήμερα
--    (ΟΧΙ μηδέν — η μισθοδοσία εθνικών έχει ήδη υλικό να δείξει μόλις τρέξει
--    αυτό). ct_round_trips με scope NATL σήμερα: 0. code default επιβεβαιώθηκε
--    ίδιο sequence με INTL ('RT-'||nextval(ct_rt_code_seq)). Triggers σήμερα
--    στο national_loads: national_load_soft_delete_unlink,
--    trg_national_loads_soft_delete_cascade (και τα δύο δεν αγγίζουν legs/RT
--    — καμία σύγκρουση σειράς). backfill_from ΠΑΡΑΜΕΝΕΙ παράμετρος owner: θα
--    πιάσει όσα από τα 14 έχουν loading_datetime >= την ημερομηνία που θα
--    βάλει.
--    Για επανέλεγχο: select count(*) from national_loads where deleted_at is null and driver_id is not null;
--      select count(*) from ct_round_trips where scope='NATL';
--
-- ═══════════════════════════════════════════════════════════════════════
-- WHY: 011 (dl_sync_from_rt) γράφει γραμμή μισθοδοσίας για κάθε OWNED
-- ct_round_trips με οδηγό — αλλά καμία round trip δεν δημιουργείται ποτέ από
-- national_loads (031/033 πιάνουν μόνο `orders`, scope hard-coded 'INTL').
-- Άρα ένα εθνικό φορτίο με οδηγό δεν φτάνει ΠΟΤΕ στη μισθοδοσία — ίδιο
-- σχήμα προβλήματος με το N4 που το 013 είχε ήδη επισημάνει («National-load
-- legs δεν συγχρονίζονται ακόμη»), εδώ για τη ΔΗΜΙΟΥΡΓΙΑ, όχι το sync.
--
-- Κατώφλι = ΑΝΑΘΕΣΗ, όχι status (ίδιος κανόνας με το 033, owner 14/9): η
-- round trip γεννιέται μόλις υπάρχει φορτηγό (ή συνεργάτης σε partner trip),
-- όχι όταν το status γίνει In Transit/Delivered — γιατί το status είναι το
-- πεδίο που καθυστερεί.
--
-- Σχέσεις ομαδοποίησης (Ε πιο πάνω): matched_load (ζευγάρι Veroia Switch,
-- ένα national_load εισαγωγής + ένα εξαγωγής) και source_cons_load_id (πολλά
-- groupage φορτία στο ΙΔΙΟ φορτηγό). Ίδια λογική attach/conflict με το 033
-- (αν βρεθεί ΜΙΑ ζωντανή RT ανάμεσα στα σχετικά φορτία με το ίδιο όχημα →
-- προσάρτηση· αν βρεθούν ΔΥΟ διαφορετικές → σύγκρουση, καταγράφεται, καμία
-- συγχώνευση· αν καμία → νέα RT). Ένα φορτίο rotation_id-like ή group_id-like
-- σχήμα ΔΕΝ βρέθηκε (Δ πιο πάνω) — μόνο αυτές οι δύο σχέσεις γίνονται walk.
--
-- Ασφάλεια: ίδιος μηχανισμός idempotency με 031/033 — μοναδικό partial index
-- ct_leg_nat_load, ON CONFLICT DO NOTHING + backing out της RT αν χαθεί το
-- race, stale leg σε ακυρωμένη RT ελευθερώνεται πριν συνεχίσει.
--
-- created_by = 'trigger:rt_create_natl' (ΟΧΙ 'trigger:rt_create' όπως στο
-- 031/033) — ελεύθερο πεδίο κειμένου, καμία αλλαγή σχήματος· ξεχωριστή τιμή
-- ώστε η προέλευση μιας RT να φαίνεται στο audit_log χωρίς να χρειαστεί να
-- κοιτάξει κανείς το scope (αρχή 1).

begin;

create or replace function rt_create_from_national_load() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_type    text;
  dir         text;
  d_start     date;
  d_end       date;
  init_status text;
  new_rt_id   bigint;
  leg_rows    int;
  target      ct_round_trips%rowtype;
  n_targets   int;
  target_ids  text;
  next_seq    smallint;
  reason      text;
begin
  if new.deleted_at is not null or new.status = 'Cancelled' then
    return null;
  end if;
  -- Κατώφλι = ανάθεση οχήματος/συνεργάτη, όχι status (ίδιος κανόνας με 033).
  if not (new.truck_id is not null
          or (coalesce(new.is_partner_trip, false) and new.partner_id is not null)) then
    return null;
  end if;

  -- Leg σε ΑΚΥΡΩΜΕΝΗ RT είναι εγκαταλελειμμένο σχέδιο (mirror 033): ελευθέρωσέ
  -- το και προχώρα· leg σε ζωντανή RT σταματά εδώ.
  if exists (select 1 from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
             where l.nat_load_id = new.id and r.status <> 'cancelled') then
    return null;
  end if;
  delete from ct_rt_legs l using ct_round_trips r
   where l.nat_load_id = new.id and r.id = l.rt_id and r.status = 'cancelled';
  get diagnostics leg_rows = row_count;
  if leg_rows > 0 then
    perform rt_sync_audit('delete', 'ct_rt_legs', new.id::text,
      jsonb_build_object('nat_load_id', new.id), jsonb_build_object('reason', 'stale national leg on a cancelled round trip freed (034)'));
  end if;

  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;
  -- national_loads.direction = 'North→South'/'South→North' (υπόθεση Β) —
  -- ΟΧΙ 'Import'/'Export' όπως στο orders. ct_rt_legs.direction ήδη δέχεται
  -- ANODOS/KATHODOS (υπόθεση Ε) χτισμένο για ακριβώς αυτή την περίπτωση.
  -- Οτιδήποτε δεν είναι ρητά 'South→North' πέφτει σε KATHODOS — ίδιο ύφος
  -- fallback με το `else 'EXPORT'` του 031/033 για τα orders.
  dir := case when new.direction = 'South→North' then 'ANODOS' else 'KATHODOS' end;

  -- Ζωντανές RT των σχετικών φορτίων: ζευγάρι Veroia Switch (matched_load ⇄
  -- legacy_id, και οι δύο κατευθύνσεις) + groupage φορτία στο ίδιο
  -- CONSOLIDATED LOAD (source_cons_load_id). Καμία τρίτη σχέση βρέθηκε
  -- (υπόθεση Δ) — αν αποδειχτεί λάθος, το bound depth<6 και το ίδιο
  -- conflict-audit της 033 προστατεύουν από σιωπηλή συγχώνευση.
  with recursive walk as (
    select new.id as node, 0 as depth
    union
    select n.id, w.depth + 1
    from walk w
    join national_loads cur on cur.id = w.node
    join national_loads n on n.deleted_at is null and n.id <> cur.id and (
         (cur.source_cons_load_id is not null and n.source_cons_load_id = cur.source_cons_load_id)
      or (cur.matched_load is not null and n.legacy_id = cur.matched_load)
      or (n.matched_load is not null and n.matched_load = cur.legacy_id))
    where w.depth < 6
  )
  select count(distinct r.id), string_agg(distinct r.id::text, ',')
    into n_targets, target_ids
  from walk w
  join ct_rt_legs l on l.nat_load_id = w.node
  join ct_round_trips r on r.id = l.rt_id
  where w.node <> new.id and r.status <> 'cancelled';

  if n_targets > 1 then
    perform rt_sync_audit('update', 'national_loads', new.id::text, null,
      jsonb_build_object('conflict', true, 'rt_ids', target_ids,
                         'reason', 'conflict: related national loads sit on more than one live round trip — not merged (034)'));
    return null;
  end if;

  if n_targets = 1 then
    select * into target from ct_round_trips where id = target_ids::bigint;
    if target.trip_type = new_type
       and (new_type = 'PARTNER' or target.truck_id is null or target.truck_id = new.truck_id)
       and (new_type = 'OWNED'   or target.partner_id is null or target.partner_id = new.partner_id) then
      select coalesce(max(seq), 0) + 1 into next_seq from ct_rt_legs where rt_id = target.id;
      insert into ct_rt_legs (rt_id, direction, nat_load_id, seq)
      values (target.id, dir, new.id, next_seq)
      on conflict (nat_load_id) where nat_load_id is not null do nothing;
      get diagnostics leg_rows = row_count;
      if leg_rows = 0 then return null; end if;

      perform rt_sync_audit('update', 'ct_round_trips', target.id::text, null,
        jsonb_build_object('leg_nat_load', new.id, 'direction', dir, 'seq', next_seq,
                           'reason', 'related national load attached to the pair/groupage round trip (034)'));

      if target.status in ('closed', 'complete') and new.status <> 'Delivered' then
        update ct_round_trips set status = 'planned', closed_at = null, updated_at = now() where id = target.id;
        perform rt_sync_audit('update', 'ct_round_trips', target.id::text,
          jsonb_build_object('status', target.status),
          jsonb_build_object('status', 'planned', 'reason', 'reopened: national leg ' || new.id || ' not yet delivered (034)'));
      end if;
      return null;
    end if;
    reason := 'related round trip ' || target.code || ' runs another vehicle — separate trip (034)';
  else
    reason := 'no related round trip — first executed national load of its pair/groupage (034)';
  end if;

  d_start := coalesce(new.loading_datetime, new.actual_delivery_date, new.delivery_datetime, current_date);
  d_end   := coalesce(new.actual_delivery_date, new.delivery_datetime);
  if d_end is not null and d_end < d_start then d_end := null; end if;
  init_status := case when new.status = 'Delivered' then 'closed' else 'planned' end;

  insert into ct_round_trips
    (scope, trip_type, truck_id, trailer_id, driver_id, partner_id,
     date_start, date_end, status, source, created_by)
  values
    ('NATL', new_type,
     case when new_type = 'OWNED' then new.truck_id else null end,
     case when new_type = 'OWNED' then new.trailer_id else null end,
     case when new_type = 'OWNED' then new.driver_id else null end,
     case when new_type = 'PARTNER' then new.partner_id else null end,
     d_start, d_end, init_status, 'planner', 'trigger:rt_create_natl')
  returning id into new_rt_id;

  insert into ct_rt_legs (rt_id, direction, nat_load_id, seq)
  values (new_rt_id, dir, new.id, 1)
  on conflict (nat_load_id) where nat_load_id is not null do nothing;
  get diagnostics leg_rows = row_count;

  if leg_rows = 0 then
    delete from ct_round_trips where id = new_rt_id;
    perform rt_sync_audit('delete', 'ct_round_trips', new_rt_id::text,
      jsonb_build_object('nat_load_id', new.id, 'reason', 'lost race for the leg — another process attached it first'), null);
    return null;
  end if;

  perform rt_sync_audit('create', 'ct_round_trips', new_rt_id::text, null,
    jsonb_build_object('scope', 'NATL', 'trip_type', new_type, 'date_start', d_start, 'date_end', d_end,
                       'status', init_status, 'source_national_load', new.id, 'reason', reason));
  return null;
end $$;

drop trigger if exists rt_create_from_national_load on national_loads;
create trigger rt_create_from_national_load
  after insert or update of status, truck_id, partner_id, driver_id, trailer_id,
                            loading_datetime, delivery_datetime, actual_delivery_date,
                            deleted_at, is_partner_trip, matched_load, source_cons_load_id
  on national_loads for each row
  execute function rt_create_from_national_load();

-- ── Sync: national_load → round trip → sibling national legs ──────────────
-- Mirror του 013's rt_sync_from_order (γρ. 85-156), για legs με nat_load_id.
-- ΔΕΝ ξαναγράφει καμία συνάρτηση του 013 — καινούρια συνάρτηση, καινούριο
-- trigger, ίδιο μηχανισμό (rt_recompute, rt_sync_audit ήδη ορισμένα στο 013).
-- Trigger name «rt_create_from_national_load» < «rt_sync_from_national_load»
-- αλφαβητικά («c» < «s», ίδιο trick με rt_create_from_order/rt_sync_from_order
-- στο 013/031) — η Postgres τρέχει τα AFTER triggers του ίδιου event
-- αλφαβητικά, άρα το create τρέχει ΠΡΩΤΑ: όταν μπει πρώτος οδηγός/φορτηγό σε
-- ένα national_load χωρίς leg, το create φτιάχνει το leg πρώτο και το sync
-- που ακολουθεί δεν βρίσκει τίποτα να αλλάξει (η RT γεννήθηκε ήδη με τις ίδιες
-- τιμές) — καμία διπλή εγγραφή audit.
--
-- Μια round trip δεν αναμιγνύει ποτέ order-legs και nat-legs σήμερα: το
-- 031/033 γεννούν/προσαρτούν ΜΟΝΟ μέσω σχέσεων πάνω στο orders, το 034 ΜΟΝΟ
-- μέσω σχέσεων πάνω στο national_loads (Δ, Ε πιο πάνω) — άρα δεν χρειάζεται
-- συγχρονισμός «αδελφών» ανάμεσα στους δύο τύπους leg εδώ.
create or replace function rt_sync_from_national_load() returns trigger
language plpgsql security definer set search_path = public as $$
declare leg record; rt ct_round_trips%rowtype; sib record; new_type text;
begin
  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;

  for leg in
    select l.id, l.rt_id from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
    where l.nat_load_id = new.id and r.status <> 'cancelled'
  loop
    -- ένα νεκρό ή ακυρωμένο φορτίο αφήνει τη round trip του (mirror 013 γρ. 96-102)
    if new.deleted_at is not null or new.status = 'Cancelled' then
      delete from ct_rt_legs where id = leg.id;
      perform rt_sync_audit('delete', 'ct_rt_legs', leg.id::text,
        jsonb_build_object('rt_id', leg.rt_id, 'nat_load_id', new.id), null);
      perform rt_recompute(leg.rt_id);
      continue;
    end if;

    select * into rt from ct_round_trips where id = leg.rt_id;
    if rt.driver_id  is distinct from new.driver_id  or rt.truck_id   is distinct from new.truck_id
    or rt.trailer_id is distinct from new.trailer_id or rt.partner_id is distinct from new.partner_id
    or rt.trip_type <> new_type then
      update ct_round_trips
         set driver_id = new.driver_id, truck_id = new.truck_id, trailer_id = new.trailer_id,
             partner_id = new.partner_id, trip_type = new_type, updated_at = now()
       where id = rt.id;
      perform rt_sync_audit('update', 'ct_round_trips', rt.id::text,
        jsonb_build_object('driver_id', rt.driver_id, 'truck_id', rt.truck_id, 'trailer_id', rt.trailer_id,
                           'partner_id', rt.partner_id, 'trip_type', rt.trip_type),
        jsonb_build_object('driver_id', new.driver_id, 'truck_id', new.truck_id, 'trailer_id', new.trailer_id,
                           'partner_id', new.partner_id, 'trip_type', new_type, 'source_national_load', new.id));
    end if;

    -- αδέλφια: ένα φορτηγό, ένας οδηγός για ΟΛΗ τη round trip (mirror 013 γρ. 119-137)
    for sib in
      select nl.id, nl.driver_id, nl.truck_id, nl.trailer_id, nl.partner_id, nl.is_partner_trip
      from ct_rt_legs l join national_loads nl on nl.id = l.nat_load_id
      where l.rt_id = leg.rt_id and nl.id <> new.id and nl.deleted_at is null
        and (nl.driver_id  is distinct from new.driver_id  or nl.truck_id   is distinct from new.truck_id
          or nl.trailer_id is distinct from new.trailer_id or nl.partner_id is distinct from new.partner_id
          or coalesce(nl.is_partner_trip, false) <> coalesce(new.is_partner_trip, false))
    loop
      update national_loads
         set driver_id = new.driver_id, truck_id = new.truck_id, trailer_id = new.trailer_id,
             partner_id = new.partner_id, is_partner_trip = coalesce(new.is_partner_trip, false)
       where id = sib.id;
      perform rt_sync_audit('update', 'national_loads', sib.id::text,
        to_jsonb(sib) - 'id',
        jsonb_build_object('driver_id', new.driver_id, 'truck_id', new.truck_id, 'trailer_id', new.trailer_id,
                           'partner_id', new.partner_id, 'is_partner_trip', coalesce(new.is_partner_trip, false),
                           'source_national_load', new.id, 'rt_id', leg.rt_id));
    end loop;

    perform rt_recompute(leg.rt_id);
  end loop;
  return null;
end $$;

-- Στήλες event ΑΚΡΙΒΩΣ όπως ζητήθηκε (owner/coordinator 15/9) — ΧΩΡΙΣ τις
-- ημερομηνίες (loading/delivery/actual): αυτή η συνάρτηση δεν αγγίζει
-- date_start/date_end (μόνο το leg-delete-path καλεί rt_recompute, το οποίο
-- ούτως ή άλλως διαβάζει τις ΤΡΕΧΟΥΣΕΣ ημερομηνίες απευθείας από το
-- national_loads σε κάθε κλήση του — δεν χρειάζεται μεταβολή ημερομηνίας να
-- πυροδοτήσει ΑΥΤΟ το trigger για να μείνει σωστό το παράθυρο).
drop trigger if exists rt_sync_from_national_load on national_loads;
create trigger rt_sync_from_national_load
  after update of driver_id, truck_id, trailer_id, partner_id, is_partner_trip, status, deleted_at
  on national_loads for each row
  when (old.driver_id  is distinct from new.driver_id  or old.truck_id   is distinct from new.truck_id
     or old.trailer_id is distinct from new.trailer_id or old.partner_id is distinct from new.partner_id
     or old.is_partner_trip is distinct from new.is_partner_trip
     or old.deleted_at is distinct from new.deleted_at or old.status is distinct from new.status)
  execute function rt_sync_from_national_load();

-- ── Sync: round trip → its national legs (an RT edited through /costs/rt) ──
-- Mirror του 013's rt_sync_to_orders (γρ. 158-192) — ο μηχανισμός εκεί
-- αγνοεί ρητά τα nat-legs (μόνο `join orders o on o.id = l.order_id`), άρα
-- μια αλλαγή στην RT ΔΕΝ έφτανε ποτέ σε national_loads. Ίδιο event/WHEN με
-- rt_sync_to_orders, καινούρια συνάρτηση/trigger — το 013 δεν αγγίζεται.
create or replace function rt_sync_to_national_loads() returns trigger
language plpgsql security definer set search_path = public as $$
declare sib record; is_partner boolean;
begin
  if new.status = 'cancelled' then return null; end if;
  is_partner := new.trip_type = 'PARTNER';
  for sib in
    select nl.id, nl.driver_id, nl.truck_id, nl.trailer_id, nl.partner_id, nl.is_partner_trip
    from ct_rt_legs l join national_loads nl on nl.id = l.nat_load_id
    where l.rt_id = new.id and nl.deleted_at is null
      and (nl.driver_id  is distinct from new.driver_id  or nl.truck_id   is distinct from new.truck_id
        or nl.trailer_id is distinct from new.trailer_id or nl.partner_id is distinct from new.partner_id
        or coalesce(nl.is_partner_trip, false) <> is_partner)
  loop
    update national_loads
       set driver_id = new.driver_id, truck_id = new.truck_id, trailer_id = new.trailer_id,
           partner_id = new.partner_id, is_partner_trip = is_partner
     where id = sib.id;
    perform rt_sync_audit('update', 'national_loads', sib.id::text,
      to_jsonb(sib) - 'id',
      jsonb_build_object('driver_id', new.driver_id, 'truck_id', new.truck_id, 'trailer_id', new.trailer_id,
                         'partner_id', new.partner_id, 'is_partner_trip', is_partner, 'source_rt', new.id));
  end loop;
  return null;
end $$;

drop trigger if exists rt_sync_to_national_loads on ct_round_trips;
create trigger rt_sync_to_national_loads
  after update of driver_id, truck_id, trailer_id, partner_id, trip_type
  on ct_round_trips for each row
  when (old.driver_id  is distinct from new.driver_id  or old.truck_id   is distinct from new.truck_id
     or old.trailer_id is distinct from new.trailer_id or old.partner_id is distinct from new.partner_id
     or old.trip_type is distinct from new.trip_type)
  execute function rt_sync_to_national_loads();

-- ── Backfill ──────────────────────────────────────────────────────────────
-- `\set` δεν δουλεύει στο Supabase SQL editor — η παράμετρος είναι εδώ, μία
-- γραμμή, ρητά σχολιασμένη. Ο owner αλλάζει ΜΟΝΟ backfill_from πριν τρέξει,
-- στην πραγματική ημερομηνία έναρξης καταχώρισης εθνικών φορτίων (Σωτήρης).
--
-- Φίλτρο (task: «ΜΟΝΟ national_loads με οδηγό και ημερομηνία φόρτωσης >= αυτή
-- την ημερομηνία, όχι διαγραμμένα, όχι ακυρωμένα»): driver_id is not null
-- είναι αυστηρότερο φίλτρο από το κατώφλι του trigger (truck_id/partner) —
-- σκόπιμα, ώστε το πρώτο backfill να αγγίξει μόνο φορτία που είναι ήδη έτοιμα
-- για μισθοδοσία, όχι κάθε ανατεθειμένο φορτίο. Idempotent: το
-- `not exists (... ζωντανό leg)` παραλείπει ό,τι έχει ήδη RT.
do $$
declare
  backfill_from date := '2026-09-15';  -- ⚠ ΑΛΛΑΞΕ ΕΔΩ πριν το run — owner
  nl record;
begin
  for nl in
    select id from national_loads
    where deleted_at is null and status <> 'Cancelled'
      and driver_id is not null
      and coalesce(loading_datetime::date, actual_delivery_date, delivery_datetime::date) >= backfill_from
      and not exists (select 1 from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
                      where l.nat_load_id = national_loads.id and r.status <> 'cancelled')
    order by id
  loop
    -- no-op SET: πυροδοτεί "UPDATE OF driver_id" κατά τα Postgres semantics
    -- (ίδιο τέχνασμα με το backfill του 031/033), χωρίς να αγγίξει καμία άλλη στήλη.
    update national_loads set driver_id = driver_id where id = nl.id;
  end loop;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- Απόδειξη (τρέξε ΜΕΤΑ) — αναμενόμενα 15/9/2026 (μετρημένο πριν το run:
-- 45 ζωντανά national_loads, 14 ΜΕ οδηγό, 0 με scope NATL στο ct_round_trips).
-- Αν backfill_from καλύπτει και τα 14, τα δύο νούμερα του σημείου 1 πρέπει να
-- καταλήξουν ΙΣΑ (14=14)· αν ο owner βάλει μεταγενέστερη ημερομηνία, το δεύτερο
-- νούμερο θα είναι μικρότερο — αναμενόμενο, όχι σφάλμα.
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. national_loads με οδηγό, φόρτωση >= backfill_from, ζωντανά, όχι
--    ακυρωμένα — VS ζωντανές RT δημιουργημένες από αυτό το migration.
-- select count(*) as loads_with_driver
-- from national_loads
-- where deleted_at is null and status <> 'Cancelled' and driver_id is not null
--   and coalesce(loading_datetime::date, actual_delivery_date, delivery_datetime::date) >= '2026-09-15'; -- ίδια ημερομηνία με backfill_from· 14 μετρήθηκαν σύνολο πριν το φίλτρο ημερομηνίας
--
-- select count(distinct l.nat_load_id) as loads_with_live_leg
-- from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
-- join national_loads nl on nl.id = l.nat_load_id
-- where r.status <> 'cancelled' and nl.deleted_at is null and nl.status <> 'Cancelled'
--   and nl.driver_id is not null
--   and coalesce(nl.loading_datetime::date, nl.actual_delivery_date, nl.delivery_datetime::date) >= '2026-09-15';
--
-- 1β. Νέες NATL round trips (0 σήμερα, πριν το run).
-- select count(*) from ct_round_trips where scope = 'NATL';
--
-- 2. Καμία διπλοεγγραφή: κάθε national_load σε ΤΟ ΠΟΛΥ ένα leg (η μοναδική
--    μερική ευρετηρίαση το επιβάλλει ήδη — sanity check, όχι δοκιμή).
-- select nat_load_id, count(*) from ct_rt_legs where nat_load_id is not null
-- group by nat_load_id having count(*) > 1;
--
-- 3. Καμία ορφανή RT (μηδέν legs) από αυτό το trigger.
-- select r.id, r.code, r.created_by, r.created_at
-- from ct_round_trips r
-- where r.created_by = 'trigger:rt_create_natl'
--   and not exists (select 1 from ct_rt_legs l where l.rt_id = r.id);
--
-- 4. Η μισθοδοσία ακολουθεί: κάθε OWNED ζωντανή RT με οδηγό (INTL ΚΑΙ NATL
--    μαζί — η όψη δεν ξεχωρίζει scope) έχει ζωντανή γραμμή dl_entries.
--    Αναμενόμενο 0 αν το 033 ήδη το είχε μηδενίσει και το 034 δεν το χάλασε.
-- select count(*) from dl_v_rt_gap;
--
-- 5. Συγκρούσεις που καταγράφηκαν αντί να συγχωνευτούν σιωπηλά (αρχή 1).
-- select count(*) from audit_log
-- where actor = 'trigger:rt_sync' and after_data->>'reason' like 'conflict:%(034)%'
--   and created_at > now() - interval '10 minutes';
