-- 046 — ΕΚΤΕΛΕΣΤΗΚΕ 22/9/2026 ~23:05 (owner, 4 μπλοκ: ΠΡΙΝ 30/0 → εγκατάσταση → δοκιμή ROLLBACK με τον φρουρό να σκάει σωστά →
--        backfill 30). ΜΕΤΑ-SELECT συντονιστή 23:08: planned_all_delivered 0, closed_with_open_leg 0, RT closed 100 / planned 10 /
--        cancelled 6, audit auto-closed (046) = 30, blocked 0, needs_review 5 αμετάβλητο, RT-1171 planned. Η 045 απορροφήθηκε (DROP).
--        Αρχικά: ο owner το τρέχει μετά τις 15:00 (Supabase SQL editor, ομάδα 05:30–14:30, αρχή 7).
--        Ο κύκλος ζωής ενός round trip γίνεται ΠΑΡΑΓΩΓΟ των σκελών του, μέσα στη βάση.
--
-- ⚠️ Η σύνταξη ΔΕΝ ελέγχθηκε τοπικά: δεν υπάρχει psql/Postgres σε αυτό το μηχάνημα. Ό,τι διαβάστηκε από τη βάση
--    διαβάστηκε με SELECT (pg_trigger, pg_constraint, μετρήσεις). Πρώτη πραγματική επαλήθευση = η εκτέλεση.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- WHY
--
-- Απόφαση owner 22/9/2026, αυτολεξεί: «αν RT ΚΛΕΙΣΤΟ, προσθέτω νέο σκέλος, ΑΝΟΙΓΕΙ, ξανά κλείνει μόλις
-- είναι όλα Delivered/Cancelled». Δηλαδή: το status ΔΕΝ είναι απόφαση οθόνης — είναι συνάρτηση των σκελών.
--
-- Δύο ευρήματα του ελεγκτή Grok (docs/grok-bot/reviews/2026-09-22-ροή-ανάθεση-rt-μισθοδοσία-grok.md):
--   [1] Το front (core/rt-feed.js ~336) επιστρέφει νωρίς σε κλειστό RT («ΚΛΕΙΔΩΜΕΝΟΣ ΚΑΝΟΝΑΣ owner 24/8:
--       κλεισμένο = ιστορικό») — άρα το σκέλος δεν φτάνει ΠΟΤΕ στη βάση και η 045 δεν έχει τι να ξανανοίξει.
--       Σύγκρουση αποφάσεων 24/8 vs 22/9· η 22/9 είναι η νεότερη και υπερισχύει.
--   [2] 28 (σήμερα 30) planned RT με ΟΛΑ τα σκέλη Delivered, κάποια εδώ και εβδομάδες: το κλείσιμο έμενε
--       στο front, και το front το κάνει μόνο τη στιγμή που αποθηκεύεται η ΤΕΛΕΥΤΑΙΑ παραγγελία. Ποτέ
--       αναδρομικά, ποτέ όταν αλλάξει κάτι από άλλη διαδρομή (Worker, SQL, Ημερήσιο).
--
-- Αρχή 4: ο κανόνας μπαίνει όσο πιο χαμηλά αντέχει. Αρχή 3: δύο πηγές αλήθειας (front + βάση) = καμία.
-- Μαζί με αυτή τη migration φεύγει από το front κάθε εξουσία πάνω στο status (core/rt-feed.js,
-- modules/weekly_intl.js — ίδιο branch).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- ΤΙ ΥΠΑΡΧΕΙ ΗΔΗ (διαβάστηκε 22/9 με SELECT σε pg_trigger/pg_proc + τα αρχεία — για να ΜΗ διπλασιαστεί λογική)
--
--   • 013 rt_recompute(rt): παράθυρο date_start/date_end από τα ζωντανά σκέλη· βάζει 'cancelled' ΜΟΝΟ όταν
--     μείνουν 0 σκέλη. Ποτέ closed, ποτέ planned. ⇒ Δεν το επεκτείνω: άλλη δουλειά (ημερομηνίες), και θα
--     έτρεχε σε κάθε αλλαγή ημερομηνίας χωρίς λόγο.
--   • 013 rt_sync_legs (AFTER INSERT OR DELETE ON ct_rt_legs) + rt_sync_from_order (orders): όχημα/αδέλφια
--     /recompute. Δεν κλείνουν, δεν ξανανοίγουν. Η rt_sync_from_order ΣΒΗΝΕΙ το σκέλος όταν η παραγγελία
--     γίνει Cancelled ή deleted — γι' αυτό η 046 τρέχει ΜΕΤΑ από αυτήν (βλ. ΣΕΙΡΑ παρακάτω).
--   • 033 rt_create_from_order: στη ΔΙΚΗ της διαδρομή attach ξανανοίγει («reopened: leg … (033)»), με
--     κατηγόρημα `new.status <> 'Delivered'`.
--   • 037 rt_merge(keep, drop): μετά τη μετακίνηση σκελών ξανανοίγει το keep με `o.status <> 'Delivered'`.
--   • 045 rt_reopen_on_leg (ΕΚΤΕΛΕΣΜΕΝΗ 22/9): AFTER INSERT OR UPDATE OF order_id ON ct_rt_legs — ξανανοίγει
--     όταν ΤΟ ΝΕΟ σκέλος είναι ανοιχτό. Μόνο ξανάνοιγμα, μόνο για το ένα σκέλος, ποτέ κλείσιμο.
--   • 011 dl_sync_from_rt (ct_round_trips): μισθοδοσία. ΕΧΕΙ έτοιμο μηχανισμό needs_review + review_note
--     (στήλες dl_entries.needs_review boolean not null default false, review_note text) — τον ξαναχρησιμοποιώ,
--     δεν φτιάχνω δεύτερο.
--     ⚠ ΔΙΟΡΘΩΣΗ (ελεγκτής 22/9, εύρημα 2): η προηγούμενη διατύπωση εδώ έλεγε «σε αλλαγή status δεν κάνει
--     τίποτα από μόνο του» — ΑΝΑΚΡΙΒΕΣ. Ο trigger είναι `AFTER INSERT OR UPDATE ON ct_round_trips` ΧΩΡΙΣ
--     στήλη-λίστα και ΧΩΡΙΣ WHEN, άρα τρέχει σε ΚΑΘΕ UPDATE — και της 046. Τι κάνει τότε:
--       – RT όχι OWNED ή χωρίς οδηγό → flag/soft-delete της γραμμής (δεν μας αφορά: η 046 δεν αγγίζει όχημα)
--       – RT cancelled → flag/soft-delete (η 046 δεν βάζει ποτέ 'cancelled')
--       – **δεν υπάρχει ζωντανή γραμμή** και RT OWNED με οδηγό → **INSERT** νέας γραμμής `source='auto'`,
--         δηλαδή μπορεί να ΑΝΑΣΤΗΣΕΙ γραμμή που κάποιος είχε σβήσει σκόπιμα
--       – αλλιώς → driver/entry_date/date_end ακολουθούν το RT (η κύρια δουλειά του)
--     ΑΠΟΦΑΣΗ: **αφήνουμε την 011 ως έχει.** Γιατί: (i) ένα `WHEN (old.status is distinct from new.status)`
--     θα σκότωνε ακριβώς τη δουλειά για την οποία υπάρχει ο trigger — «driver and dates ALWAYS follow the RT»
--     (η rt_recompute αλλάζει ημερομηνίες χωρίς να αλλάζει status)· θα ήταν χειρότερο σφάλμα από αυτό που
--     διορθώνει· (ii) η ανάσταση ΔΕΝ είναι συνέπεια της 046 — πυροδοτείται ήδη σήμερα από κάθε UPDATE
--     (037 rt_merge, 013 rt_recompute)· (iii) μετρήθηκε 22/9 με SELECT: RT του backfill χωρίς ζωντανή γραμμή
--     και OWNED με οδηγό = **0/30**· κλειστά RT που θα ανάσταιναν γραμμή σε μελλοντικό ξανάνοιγμα = **0/70**·
--     soft-deleted γραμμές σε OWNED RT με οδηγό = **9**, αλλά όλες σε RT που ΕΧΕΙ ήδη ζωντανή γραμμή.
--     Αν ο owner θέλει να κλείσει και αυτό, το σωστό σημείο είναι ο κλάδος INSERT της ΙΔΙΑΣ της 011
--     («μην ξαναφτιάχνεις auto γραμμή όταν υπάρχει soft-deleted για το ίδιο rt_id») — ξεχωριστή migration.
--
-- ⇒ ΑΠΟΦΑΣΗ: ΜΙΑ συνάρτηση `rt_auto_close(p_rt)` που παράγει το status από ΟΛΑ τα σκέλη, και στις δύο
--   κατευθύνσεις (κλείσιμο + ξανάνοιγμα), + δύο λεπτές trigger-συναρτήσεις που της λένε «ξανακοίτα αυτό το RT».
--   Η 045 ΔΙΠΛΩΝΕΤΑΙ ΜΕΣΑ (DROP trigger + function): το κατηγόρημά της είναι υποσύνολο — ίδιο αποτέλεσμα στο
--   attach, αλλά μόνο μισός κανόνας και δεύτερη γραμμή audit για το ίδιο γεγονός. Αρχή 3.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Ο ΚΑΝΟΝΑΣ (ορισμός owner 22/9 του «ανοιχτού σκέλους»)
--
--   ανοιχτό σκέλος = σκέλος με παραγγελία ΖΩΝΤΑΝΗ (deleted_at IS NULL) και status ΟΥΤΕ 'Delivered' ΟΥΤΕ 'Cancelled'
--
--   • RT με ≥1 ζωντανό σκέλος και ≥1 ανοιχτό  → 'planned' (αν ήταν closed/complete: ΞΑΝΑΝΟΙΓΕΙ, closed_at=NULL)
--   • RT με ≥1 ζωντανό σκέλος και 0 ανοιχτά   → 'closed', closed_at=now()  (ΜΟΝΟ από planned/in_progress)
--   • RT σε 'cancelled'                        → δεν αγγίζεται ΠΟΤΕ (ακυρωμένο ≠ ιστορικό, είναι απόφαση)
--   • RT χωρίς ζωντανό σκέλος                  → δεν αγγίζεται εδώ (είναι δουλειά της rt_recompute/013)
--
-- Σκέλη εθνικών (nat_load_id, order_id NULL): ΕΚΤΟΣ ΠΕΔΙΟΥ — άλλο λεξιλόγιο status στο national_loads.
-- Μετρήθηκε 22/9: RT με εθνικά σκέλη = 0, άρα η εξαίρεση δεν κρύβει τίποτα σήμερα. Ένα RT που θα αποκτήσει
-- εθνικό σκέλος ΔΕΝ κλείνει αυτόματα (το εθνικό σκέλος δεν μετριέται ούτε ως ανοιχτό ούτε ως κλειστό —
-- μετρώνται μόνο τα σκέλη με order_id)· αυτό είναι σκόπιμο: «δεν ξέρω» ποτέ δεν διαβάζεται ως «παραδόθηκε».
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- ΓΙΑΤΙ ΔΕΝ ΠΕΙΡΑΖΩ ΤΟ `<> 'Delivered'` ΤΩΝ 033/037 (ρητή απόφαση, όχι παράλειψη)
--
-- Το δικό τους κατηγόρημα μετράει μια Cancelled παραγγελία ως «ανοιχτή» — διαφορετικό από τον κανόνα εδώ.
-- ΔΕΝ τις κάνω CREATE OR REPLACE σε αυτή τη migration για τρεις λόγους:
--   1. Μετρήθηκε 22/9: σκέλη με παραγγελία Cancelled = 0 / 195. Δεν είναι σύμπτωση — η 013 rt_sync_from_order
--      ΣΒΗΝΕΙ το σκέλος μόλις η παραγγελία γίνει Cancelled. Η διαφορά είναι σήμερα μη προσπελάσιμη.
--   2. Το να ξαναγράψω δύο συναρτήσεις 100+ γραμμών για μια γραμμή κατηγορήματος είναι ακριβώς ο τρόπος με
--      τον οποίο το repo αποκλίνει από την παραγωγή (αρχή 3). Η 046 τις κάνει ούτως ή άλλως ΠΛΕΟΝΑΖΟΥΣΕΣ.
--   3. Η κατεύθυνση του λάθους τους είναι ασφαλής: ξανανοίγουν (θόρυβος, ορατό στη λίστα ανοιχτών), δεν
--      κλείνουν σιωπηλά (αρχή 1). Το επόμενο γεγονός σκέλους ή status τα διορθώνει μέσω rt_auto_close.
-- ⚠️ ΓΝΩΣΤΟ ΥΠΟΛΕΙΜΜΑ: η rt_merge (037) κάνει το δικό της reopen ΜΕΤΑ το UPDATE των σκελών, άρα ΜΕΤΑ τον
--    trigger της 046 μέσα στην ίδια συναλλαγή — μπορεί να αφήσει ένα keep RT 'planned' ενώ όλα τα σκέλη του
--    είναι Delivered/Cancelled. Διορθώνεται στο επόμενο γεγονός. Αν ενοχλήσει: ξεχωριστή migration που
--    αφαιρεί το block, με pg_get_functiondef ως πηγή.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- ΣΕΙΡΑ TRIGGERS (Postgres: ίδιο γεγονός AFTER ⇒ αλφαβητικά κατά tgname) — γι' αυτό το πρόθεμα `rt_z_`
--   ct_rt_legs : rt_sync_legs → rt_z_auto_close_legs        (πρώτα το παράθυρο/όχημα, μετά το status)
--   orders     : … → rt_create_from_order → rt_link_split → rt_sync_from_order → rt_z_auto_close_order
--                (η rt_sync_from_order έχει ήδη σβήσει το σκέλος της Cancelled· η 033 έχει ήδη φτιάξει το
--                 σκέλος της νέας ανάθεσης — η 046 βλέπει ΤΕΛΙΚΟ σύνολο σκελών)
--   ct_round_trips : rt_status_guard (BEFORE — τρέχει πάντα πριν από κάθε AFTER, ανεξάρτητα από όνομα)
--                    → dl_sync_from_rt, rt_sync_to_orders (AFTER, ως έχουν)
--
-- ΑΝΑΣΤΡΕΨΙΜΟ:
--   DROP TRIGGER rt_z_auto_close_order ON orders; DROP TRIGGER rt_z_auto_close_legs ON ct_rt_legs;
--   DROP TRIGGER rt_status_guard ON ct_round_trips; DROP FUNCTION rt_status_guard();
--   DROP FUNCTION rt_auto_close_order(); DROP FUNCTION rt_auto_close_legs(); DROP FUNCTION rt_auto_close(bigint);
--   -- και, αν θέλουμε πίσω την 045, ξανατρέχουμε το worker/migrations/045_rt_reopen_on_leg.sql
--   -- (ο φρουρός της περιμένει 2 triggers — θα δει 2: rt_sync_legs + rt_z_auto_close_legs — προσοχή).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════


-- ── ΠΡΙΝ (τρέξ' το ΠΡΩΤΑ και κράτα το νούμερο· αν δεν ταιριάζει με το έγγραφο, σταμάτα και ρώτα) ──
-- 22/9: planned_all_delivered = 30 · closed_with_open_leg = 0 (η 045 δουλεύει) · rt_by_status = planned 40 /
--       closed 70 / cancelled 6 · σκέλη με εθνικό load = 0 · RT χωρίς κανένα σκέλος = 5 (δεν αγγίζονται).
with legs as (
  select r.id, r.status,
         count(*) filter (where o.deleted_at is null) as n_live,
         count(*) filter (where o.deleted_at is null
                          and o.status is distinct from 'Delivered'
                          and o.status is distinct from 'Cancelled') as n_open
  from ct_round_trips r
  join ct_rt_legs l on l.rt_id = r.id
  join orders o on o.id = l.order_id          -- join, ΟΧΙ left join: ίδιος ορισμός με την rt_auto_close
  group by 1, 2)
select (select count(*) from legs where status in ('planned','in_progress') and n_live > 0 and n_open = 0) as planned_all_delivered,
       (select count(*) from legs where status in ('closed','complete') and n_open > 0)                    as closed_with_open_leg,
       (select count(*) from ct_round_trips where status = 'planned')                                      as rt_planned,
       (select count(*) from ct_round_trips where status = 'closed')                                       as rt_closed,
       (select count(*) from ct_round_trips where status = 'cancelled')                                    as rt_cancelled;


BEGIN;

-- ═══ 1. Ο κανόνας, σε ΕΝΑ σημείο ═══════════════════════════════════════════════════════════════
-- Idempotent: αν το status είναι ήδη το σωστό, δεν γράφει τίποτα και δεν αφήνει γραμμή audit.
CREATE OR REPLACE FUNCTION public.rt_auto_close(p_rt bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  r        ct_round_trips%rowtype;
  n_live   int;
  n_open   int;
  live_dl  dl_entries%rowtype;
begin
  if p_rt is null then return; end if;
  select * into r from ct_round_trips where id = p_rt;
  -- 'cancelled' is a decision somebody made, not a derived state: never overwritten here.
  if r.id is null or r.status = 'cancelled' then return; end if;

  -- Owner's definition of an open leg (22/9). National legs (nat_load_id) are NOT counted at all —
  -- neither open nor closed — see the header: a different status vocabulary lives on national_loads.
  select count(*) filter (where o.deleted_at is null),
         count(*) filter (where o.deleted_at is null
                          and o.status is distinct from 'Delivered'
                          and o.status is distinct from 'Cancelled')
    into n_live, n_open
  from ct_rt_legs l
  join orders o on o.id = l.order_id
  where l.rt_id = p_rt;

  if n_live = 0 then return; end if;   -- no live leg: rt_recompute (013) owns that case

  -- ── ΞΑΝΑΝΟΙΓΜΑ ──────────────────────────────────────────────────────────────────────────────
  if n_open > 0 and r.status in ('closed', 'complete') then
    update ct_round_trips
       set status = 'planned', closed_at = null, updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
      jsonb_build_object('status', 'planned', 'closed_at', null, 'open_legs', n_open,
                         'reason', 'reopened: ' || n_open || ' leg(s) not delivered/cancelled (046)'));

    -- Μισθοδοσία (μηχανισμός 011, ίδιες στήλες): αν η γραμμή του γύρου έχει ΗΔΗ ποσά και ο γύρος
    -- ξανανοίγει, κάποιος πλήρωσε πάνω σε κλειστό βιβλίο. Δεν το σβήνουμε, δεν το αθροίζουμε —
    -- το κάνουμε ορατό (αρχή 1). Απόφαση συντονιστή 22/9, εκκρεμεί έγκριση owner.
    select * into live_dl from dl_entries where rt_id = p_rt and deleted_at is null limit 1;
    if live_dl.id is not null
       and (live_dl.trip_value is not null or live_dl.advance is not null or live_dl.expenses is not null) then
      update dl_entries
         set needs_review = true,
             review_note = concat_ws(' · ', review_note,
               'ο γύρος ' || r.code || ' ξανάνοιξε ' || to_char(now(), 'DD/MM/YYYY') ||
               ' μετά την καταχώρηση ποσών — νέο σκέλος, έλεγξε την αξία (046)'),
             updated_at = now()
       where id = live_dl.id;
    end if;
    return;
  end if;

  -- ── ΚΛΕΙΣΙΜΟ ────────────────────────────────────────────────────────────────────────────────
  if n_open = 0 and r.status in ('planned', 'in_progress') then
    -- Guard for the CHECK owned_needs_truck (013): an OWNED trip may not BE closed without a truck.
    -- Letting the UPDATE fail here would abort the dispatcher's «Delivered» click at 06:30 — loud in
    -- the wrong place (αρχή 7). Say it in the audit instead and leave the trip open.
    if r.trip_type = 'OWNED' and r.truck_id is null then
      -- ΜΙΑ γραμμή audit ανά RT, όχι μία ανά άγγιγμα (ελεγκτής 22/9, εύρημα 3): χωρίς αυτόν τον έλεγχο
      -- ένα τέτοιο RT θα έγραφε νέα γραμμή σε κάθε αλλαγή status οποιασδήποτε παραγγελίας του, και το
      -- Ιστορικό Ενεργειών θα γέμιζε θόρυβο. Θόρυβος που επαναλαμβάνεται παύει να ακούγεται (αρχή 1).
      if not exists (
        select 1 from audit_log
         where actor = 'trigger:rt_sync' and table_name = 'ct_round_trips' and record_id = p_rt::text
           and after_data->>'blocked' = 'true'
           and created_at > now() - interval '7 days') then
        perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
          jsonb_build_object('status', r.status),
          jsonb_build_object('status', r.status, 'blocked', true,
                             'reason', 'not auto-closed: OWNED round trip without a truck (owned_needs_truck) — assign a truck (046)'));
      end if;
      return;
    end if;

    update ct_round_trips
       set status = 'closed', closed_at = now(), updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
      jsonb_build_object('status', 'closed', 'closed_at', now(), 'legs', n_live,
                         'reason', 'auto-closed: all legs delivered/cancelled (046)'));
  end if;
end $function$;


-- ═══ 2. Πότε ξανακοιτάζεται ένα RT — το ελάχιστο σωστό σύνολο γεγονότων ═════════════════════════
-- (α) Άλλαξε το σύνολο των σκελών του: INSERT / DELETE / μετακίνηση σε άλλο RT (037 rt_merge κάνει
--     UPDATE OF rt_id, ΟΧΙ insert — γι' αυτό μπαίνει κι αυτό) / αλλαγή της παραγγελίας του σκέλους.
CREATE OR REPLACE FUNCTION public.rt_auto_close_legs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform rt_auto_close(old.rt_id);
    return null;
  end if;
  perform rt_auto_close(new.rt_id);
  -- a leg that moved away leaves its old trip possibly closable (037 merge)
  if tg_op = 'UPDATE' and old.rt_id is distinct from new.rt_id then
    perform rt_auto_close(old.rt_id);
  end if;
  return null;
end $function$;

-- (β) Άλλαξε το status μιας παραγγελίας που ΕΙΝΑΙ σκέλος. Δεν χρειάζεται deleted_at: η 013
--     rt_sync_from_order σβήνει το σκέλος της διαγραμμένης, κι αυτό περνά από το (α).
CREATE OR REPLACE FUNCTION public.rt_auto_close_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare leg record;
begin
  for leg in
    select distinct l.rt_id from ct_rt_legs l
     join ct_round_trips r on r.id = l.rt_id
    where l.order_id = new.id and r.status <> 'cancelled'
  loop
    perform rt_auto_close(leg.rt_id);
  end loop;
  return null;
end $function$;

DROP TRIGGER IF EXISTS rt_z_auto_close_legs ON public.ct_rt_legs;
CREATE TRIGGER rt_z_auto_close_legs
  AFTER INSERT OR DELETE OR UPDATE OF rt_id, order_id ON public.ct_rt_legs
  FOR EACH ROW EXECUTE FUNCTION public.rt_auto_close_legs();

DROP TRIGGER IF EXISTS rt_z_auto_close_order ON public.orders;
CREATE TRIGGER rt_z_auto_close_order
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status)
  EXECUTE FUNCTION public.rt_auto_close_order();


-- ═══ 2β. Ο ΦΡΟΥΡΟΣ ΤΗΣ ΧΕΙΡΟΚΙΝΗΤΗΣ ΔΙΑΔΡΟΜΗΣ ════════════════════════════════════════════════
-- Ελεγκτής 22/9, εύρημα 1: το front ΔΕΝ είχε χάσει κάθε εξουσία. Το κουμπί «Κλείσιμο δρομολογίου»
-- του TRIP PnL (modules/costs.js ctCloseRt) στέλνει PATCH /costs/rt/:id {status:'closed'} και ο Worker
-- το δέχεται (ctPick whitelist). Η 046 ΔΕΝ πυροδοτείται από UPDATE στο ct_round_trips, άρα η οθόνη
-- μπορούσε να κλείσει γύρο με ανοιχτό σκέλος — ακριβώς το «πρέπει 0» που ελέγχει η ίδια η migration.
--
-- ΕΠΙΛΟΓΗ: **RAISE**, όχι σιωπηλή διόρθωση σε 'planned'.
--   Σιωπηλή διόρθωση μετά από ρητό κλικ του owner = ψέμα στην οθόνη: πάτησε «κλείσε», πήρε πράσινο,
--   και ο γύρος έμεινε ανοιχτός. Η άρνηση με αιτία είναι η μόνη απάντηση που δεν χρειάζεται audit για
--   να τη βρει κανείς αργότερα (αρχή 1). Η αυτόματη διαδρομή δεν επηρεάζεται: η rt_auto_close βάζει
--   'closed' ΜΟΝΟ όταν n_open = 0, οπότε περνά τον φρουρό χωρίς να τον «ξέρει».
--   Δεν φρουρείται το 'cancelled' — η ακύρωση είναι απόφαση ανθρώπου (rt-feed γρ. 354/384/460) και η
--   046 δεν τη διεκδικεί ποτέ.
--
-- ⚠️ ΤΙ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ ΣΗΜΕΡΑ: ο Worker πιάνει το σφάλμα στο γενικό catch του handleCosts και
--    επιστρέφει «Costs request failed» (500) — το ελληνικό μήνυμα μένει μόνο στα logs. Στο ίδιο branch
--    μπαίνει μικρή αλλαγή στο worker/src/index.js (PATCH /costs/rt) που προωθεί το μήνυμα της βάσης ως
--    409. ΧΩΡΙΣ deploy του Worker ο φρουρός ΔΟΥΛΕΥΕΙ (η εγγραφή απορρίπτεται) αλλά το alert λέει το
--    γενικό μήνυμα. Ο deploy γίνεται από τον owner, μετά τις 15:00 (CLAUDE.md, ΠΑΓΙΔΑ DEPLOY).
CREATE OR REPLACE FUNCTION public.rt_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare n_open int;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('closed', 'complete') then return new; end if;

  select count(*) into n_open
  from ct_rt_legs l
  join orders o on o.id = l.order_id
  where l.rt_id = new.id and o.deleted_at is null
    and o.status is distinct from 'Delivered' and o.status is distinct from 'Cancelled';

  if n_open > 0 then
    raise exception 'Ο γύρος % δεν κλείνει: έχει % σκέλος/σκέλη που δεν είναι Delivered/Cancelled. Κλείνει μόνος του μόλις παραδοθούν όλα (046).',
      new.code, n_open using errcode = 'P0001';
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS rt_status_guard ON public.ct_round_trips;
CREATE TRIGGER rt_status_guard
  BEFORE UPDATE OF status ON public.ct_round_trips
  FOR EACH ROW EXECUTE FUNCTION public.rt_status_guard();


-- ═══ 3. Η 045 διπλώνεται μέσα — ΕΝΑΣ κανόνας, ΕΝΑ σημείο ═══════════════════════════════════════
-- Η rt_reopen_on_leg έκανε ΜΟΝΟ ξανάνοιγμα και ΜΟΝΟ με βάση το ένα νέο σκέλος. Το κατηγόρημα της 046
-- είναι υπερσύνολο (κάθε σκέλος, και οι δύο κατευθύνσεις): ίδιο αποτέλεσμα στο attach, χωρίς δεύτερη
-- γραμμή audit για το ίδιο γεγονός και χωρίς δεύτερο ορισμό του «ανοιχτού σκέλους» (αρχή 3).
DROP TRIGGER IF EXISTS rt_reopen_on_leg ON public.ct_rt_legs;
DROP FUNCTION IF EXISTS public.rt_reopen_on_leg();


-- ═══ 4. ΦΡΟΥΡΟΣ (μοτίβο 037/043/045): αν ο αριθμός triggers δεν είναι ο αναμενόμενος, όλη η
--        συναλλαγή γυρίζει πίσω μόνη της — τίποτα δεν μένει μισό ═══════════════════════════════
DO $$
DECLARE n_legs int; n_orders int; n_rts int; n_reopen int;
BEGIN
  SET LOCAL search_path = public;
  SELECT count(*) INTO n_legs   FROM pg_trigger WHERE tgrelid = 'public.ct_rt_legs'::regclass     AND NOT tgisinternal;
  SELECT count(*) INTO n_orders FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass         AND NOT tgisinternal;
  SELECT count(*) INTO n_rts    FROM pg_trigger WHERE tgrelid = 'public.ct_round_trips'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_reopen FROM pg_trigger WHERE tgrelid = 'public.ct_rt_legs'::regclass AND tgname = 'rt_reopen_on_leg';
  -- ct_round_trips: dl_sync_from_rt + rt_sync_to_orders (2 μετρημένα 22/9) + rt_status_guard = 3
  IF n_rts <> 3 THEN
    RAISE EXCEPTION '046: αναμενόταν 3 triggers στο ct_round_trips (dl_sync_from_rt, rt_sync_to_orders, rt_status_guard), βρέθηκαν %', n_rts;
  END IF;
  -- ct_rt_legs: rt_sync_legs + rt_z_auto_close_legs (η 045 έφυγε) = 2
  IF n_legs <> 2 THEN
    RAISE EXCEPTION '046: αναμενόταν 2 triggers στο ct_rt_legs (rt_sync_legs + rt_z_auto_close_legs), βρέθηκαν %', n_legs;
  END IF;
  -- orders: 12 μετρημένα 22/9 + rt_z_auto_close_order = 13
  IF n_orders <> 13 THEN
    RAISE EXCEPTION '046: αναμενόταν 13 triggers στα orders (12 της 22/9 + rt_z_auto_close_order), βρέθηκαν %', n_orders;
  END IF;
  IF n_reopen <> 0 THEN
    RAISE EXCEPTION '046: η 045 rt_reopen_on_leg δεν αφαιρέθηκε — δύο κανόνες για το ίδιο πράγμα';
  END IF;
END $$;

SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.ct_rt_legs'::regclass AND NOT tgisinternal ORDER BY tgname;
-- πρέπει ακριβώς: rt_sync_legs, rt_z_auto_close_legs

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- ΣΕΝΑΡΙΟ ΔΟΚΙΜΗΣ — γυρίζει πίσω, ΤΙΠΟΤΑ δεν μένει. Πραγματικά ids, διαβασμένα με SELECT 22/9.
--   Α) ΞΑΝΑΝΟΙΓΜΑ: RT-1004 (id 4) — closed, closed_at 31/8, 2 σκέλη, όλα Delivered.
--      Παραγγελία 369: Pending, ΧΩΡΙΣ σκέλος, χωρίς φορτηγό.
--   Β) ΚΛΕΙΣΙΜΟ:   RT-1017 (id 17) — planned, 1 σκέλος (παραγγελία 154, Delivered 19/8), 0 γραμμές μισθοδοσίας.
--      RT-1113 (id 113) — planned, 2 σκέλη (263 + 278, Delivered 7/9), 1 γραμμή μισθοδοσίας.
-- Αν κάτι από αυτά άλλαξε ως την εκτέλεση, το πρώτο SELECT το δείχνει — ΜΗΝ συνεχίσεις.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

SELECT r.id, r.code, r.status, r.closed_at,
       (SELECT status FROM orders WHERE id = 369)                      AS order_369_status,   -- Pending
       (SELECT count(*) FROM ct_rt_legs WHERE order_id = 369)          AS legs_of_369         -- 0
  FROM ct_round_trips r WHERE r.id IN (4, 17, 113) ORDER BY r.id;      -- 4 closed · 17,113 planned

-- Α) attach ανοιχτού σκέλους σε κλειστό RT
INSERT INTO ct_rt_legs (rt_id, direction, order_id, seq) VALUES (4, 'EXPORT', 369, 99);
-- ΠΡΟΣΔΟΚΙΑ: RT 4 → status 'planned', closed_at NULL, 1 γραμμή audit reason «reopened: 1 leg(s) … (046)».
-- ΤΙ ΑΛΛΟ ΘΑ ΔΕΙΣ (αλυσίδα 013 — όλα γυρίζουν πίσω μαζί): ο rt_sync_legs τρέχει ΠΡΙΝ και αντιγράφει το όχημα
-- του RT-1004 στην 369 → +1 γραμμή audit στα orders (record 369, reason «leg attached»)· η rt_recompute μπορεί
-- να μετακινήσει date_start/date_end → +1 γραμμή audit ct_round_trips. Άρα ως 3 γραμμές, όχι 1 — φυσιολογικό.
-- ΠΡΟΣΟΧΗ: η αλλαγή οχήματος στην 369 πυροδοτεί rt_sync_from_order (013), ΟΧΙ το status trigger της 046.
SELECT code, status, closed_at FROM ct_round_trips WHERE id = 4;
SELECT needs_review, review_note FROM dl_entries WHERE rt_id = 4 AND deleted_at IS NULL;  -- ποσά; τότε needs_review=true

-- Β) το status της τελευταίας ανοιχτής παραγγελίας γίνεται Delivered → κλείνει ο γύρος
--    (δεν υπάρχει ανοιχτό σκέλος στα 17/113 σήμερα, οπότε προκαλούμε το γεγονός με ένα «άγγιγμα» status:
--     Delivered → Assigned → Delivered. Το πρώτο βήμα ΞΑΝΑΝΟΙΓΕΙ, το δεύτερο ΚΛΕΙΝΕΙ — δύο κανόνες, μία δοκιμή.)
UPDATE orders SET status = 'Assigned' WHERE id = 154;
SELECT code, status, closed_at FROM ct_round_trips WHERE id = 17;   -- ΠΡΟΣΔΟΚΙΑ: planned (ήταν ήδη planned — καμία γραμμή audit)
UPDATE orders SET status = 'Delivered' WHERE id = 154;
SELECT code, status, closed_at FROM ct_round_trips WHERE id = 17;   -- ΠΡΟΣΔΟΚΙΑ: closed, closed_at = τώρα

-- Γ) δύο σκέλη: μόνο όταν ΚΑΙ τα δύο είναι Delivered κλείνει
UPDATE orders SET status = 'In Transit' WHERE id = 263;
SELECT code, status FROM ct_round_trips WHERE id = 113;             -- ΠΡΟΣΔΟΚΙΑ: planned
UPDATE orders SET status = 'Delivered' WHERE id = 263;
SELECT code, status, closed_at FROM ct_round_trips WHERE id = 113;  -- ΠΡΟΣΔΟΚΙΑ: closed

SELECT action, table_name, record_id, after_data->>'reason' AS reason
  FROM audit_log WHERE actor = 'trigger:rt_sync' ORDER BY id DESC LIMIT 12;

-- Δ) ο φρουρός της χειροκίνητης διαδρομής (2β): το RT 4 έχει τώρα ανοιχτό σκέλος (την 369).
--    ΠΡΟΣΔΟΚΙΑ: EXCEPTION P0001 «Ο γύρος RT-1004 δεν κλείνει: έχει 1 σκέλος/σκέλη που δεν είναι
--    Delivered/Cancelled…». Στον SQL editor το σφάλμα ακυρώνει τη συναλλαγή — τρέξε αυτή τη γραμμή
--    ΤΕΛΕΥΤΑΙΑ, ή σε δικό της BEGIN…ROLLBACK, γιατί μετά από exception τα προηγούμενα SELECT δεν τρέχουν.
UPDATE ct_round_trips SET status = 'closed' WHERE id = 4;   -- ΠΡΕΠΕΙ ΝΑ ΣΚΑΣΕΙ

ROLLBACK;   -- ← ΥΠΟΧΡΕΩΤΙΚΟ (και ούτως ή άλλως μετά το exception)


-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- BACKFILL — τα 30 ξεχασμένα ανοιχτά (Grok εύρημα 3· 23 από αυτά με τελευταία παράδοση ≥ 3 ημέρες πίσω)
-- Καλεί την ΙΔΙΑ rt_auto_close: μία υλοποίηση, ίδιες γραμμές audit, ίδιος φρουρός owned_needs_truck.
-- 22/9 μετρήθηκε: 0/30 είναι OWNED χωρίς φορτηγό, άρα κανένα δεν πρέπει να μπλοκάρει· αν κάποιο μπλοκάρει,
-- θα φαίνεται ως γραμμή audit «not auto-closed …» και θα μείνει planned — σκόπιμο, όχι αποτυχία.
-- ΚΩΔΙΚΟΙ 22/9 (30): RT-1015, 1017, 1023, 1110, 1113, 1115, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126,
--                    1127, 1128, 1129, 1130, 1135, 1137, 1161, 1163, 1164, 1165, 1166, 1168, 1169, 1170, 1172, 1173
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ΠΡΙΝ
select r.code, r.status, r.date_end from ct_round_trips r
 where r.status in ('planned','in_progress')
   and exists (select 1 from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = r.id and o.deleted_at is null)
   and not exists (select 1 from ct_rt_legs l join orders o on o.id = l.order_id
                   where l.rt_id = r.id and o.deleted_at is null
                     and o.status is distinct from 'Delivered' and o.status is distinct from 'Cancelled')
 order by r.date_end;

DO $$
DECLARE r record; n int := 0;
BEGIN
  SET LOCAL search_path = public;
  FOR r IN
    select rr.id from ct_round_trips rr
     where rr.status in ('planned','in_progress')
       and exists (select 1 from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = rr.id and o.deleted_at is null)
       and not exists (select 1 from ct_rt_legs l join orders o on o.id = l.order_id
                       where l.rt_id = rr.id and o.deleted_at is null
                         and o.status is distinct from 'Delivered' and o.status is distinct from 'Cancelled')
     order by rr.id
  LOOP
    PERFORM rt_auto_close(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '046 backfill: εξετάστηκαν % round trips', n;
END $$;

-- ΜΕΤΑ (πρέπει 0 και τα δύο)
with legs as (
  select r.id, r.status,
         count(*) filter (where o.deleted_at is null) as n_live,
         count(*) filter (where o.deleted_at is null
                          and o.status is distinct from 'Delivered'
                          and o.status is distinct from 'Cancelled') as n_open
  from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id join orders o on o.id = l.order_id   -- join: εθνικά σκέλη εκτός, όπως στη συνάρτηση
  group by 1, 2)
select (select count(*) from legs where status in ('planned','in_progress') and n_live > 0 and n_open = 0) as planned_all_delivered,
       (select count(*) from legs where status in ('closed','complete') and n_open > 0)                    as closed_with_open_leg;

select count(*) as audit_rows_046 from audit_log
 where actor = 'trigger:rt_sync' and table_name = 'ct_round_trips'
   and after_data->>'reason' like 'auto-closed%(046)' and created_at >= now() - interval '5 minutes';

COMMIT;   -- ← άλλαξέ το σε ROLLBACK αν κάτι από τα παραπάνω δεν βγάζει 0

-- ΑΝΑΣΤΡΟΦΗ ΤΟΥ BACKFILL (αν χρειαστεί· βάλε τη δική σου ώρα εκτέλεσης):
-- update ct_round_trips set status = 'planned', closed_at = null, updated_at = now()
--  where id in (select record_id::bigint from audit_log
--                where actor = 'trigger:rt_sync' and table_name = 'ct_round_trips'
--                  and after_data->>'reason' like 'auto-closed%(046)'
--                  and created_at >= '2026-09-22 15:00:00+03');
