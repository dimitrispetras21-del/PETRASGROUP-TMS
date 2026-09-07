# Εθνικό κύκλωμα — Βήμα 1: πηγή φορτίου, ράμπα, cascade (spec, 7/9/2026)

Αφετηρία: `docs/data-audit/2026-09/2026-09-07-national-architecture.md` (ευρήματα Ε1–Ε4). Owner 7/9: «ναι, γράψε το spec για το πρώτο βήμα».

## Στόχος
Κάθε εθνικό φορτίο (`national_loads`) ξέρει **από τη βάση** ποια είναι η πηγή του — διεθνής παραγγελία, εθνική παραγγελία ή ενοποιημένο
φορτίο — με πραγματικό FK, ώστε: η εθνική παραγγελία να γίνεται φορτίο σε κάθε αποθήκευση, το Weekly και η ράμπα να ενημερώνουν τον
σωστό γονέα, και η διαγραφή φορτίου να μην αφήνει ορφανά. Τίποτα άλλο (κατάσταση, εβδομάδα, τιμολόγηση, μισθοδοσία = επόμενα βήματα).

## Global constraints
- Supabase = SELECT μόνο για agents· η migration εκτελείται από τον SQL editor με ρητό ναι owner. Deploy Worker με τον φρουρό των τριών, αντίγραφο bundle πριν.
- Κάθε νέο label περνά από τον χάρτη του Worker για τον συγκεκριμένο πίνακα (silent-drop trap). Κανόνες στη βάση (FK/CHECK/trigger), όχι μόνο στην οθόνη.
- Ό,τι αποτυγχάνει ακούγεται: toast + `logError`, όχι `console.warn` μόνο. Ελληνικά στην οθόνη, αγγλικά σχόλια «γιατί». Bump `?v=` + `SW_VERSION` μαζί.
- Το Veroia Switch ΔΕΝ αλλάζει (owner 22/8): φορτίο κατευθείαν από τη διεθνή, χωρίς εθνική παραγγελία. Το groupage (GL→CL→NL) δεν αγγίζεται.

## Α. Βάση — `worker/migrations/022_national_load_source.sql` (ΔΕΝ εκτελείται από το πλάνο· owner)
```sql
begin;
-- 1. Η εθνική παραγγελία ως πηγή φορτίου (Ε1). Μέχρι σήμερα μόνο orders/consolidated_loads είχαν FK.
alter table national_loads add column if not exists source_national_order_id bigint references national_orders(id);
create index if not exists national_loads_source_national_order_idx on national_loads(source_national_order_id);
-- 2. Το πολύ ΜΙΑ πηγή (ο παλιός CHECK κάλυπτε δύο στήλες). «Ακριβώς μία» ΔΕΝ επιβάλλεται ακόμη: το Pick Ups (άλλο repo) γράφει φορτία χωρίς πηγή.
alter table national_loads drop constraint if exists national_loads_one_source;
alter table national_loads add constraint national_loads_one_source
  check (num_nonnulls(source_order_id, source_national_order_id, source_cons_load_id) <= 1);
-- 3. Ράμπα: πραγματικός σύνδεσμος με φορτίο (Ε4: σήμερα το id φορτίου γράφεται στο national_order_id) + FK στις δύο υπάρχουσες στήλες (0/44 γεμάτες, ασφαλές).
alter table ramp add column if not exists national_load_id bigint references national_loads(id);
alter table ramp drop constraint if exists ramp_order_id_fkey;           alter table ramp add constraint ramp_order_id_fkey foreign key (order_id) references orders(id);
alter table ramp drop constraint if exists ramp_national_order_id_fkey;  alter table ramp add constraint ramp_national_order_id_fkey foreign key (national_order_id) references national_orders(id);
-- 4. Cascade στη σβήσιμο (Ε3): η βάση, όχι η οθόνη, σβήνει τα παιδιά. Soft-delete = deleted_at.
create or replace function national_loads_soft_delete_cascade() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update order_stops set deleted_at = new.deleted_at where national_load_id = new.id and deleted_at is null;
    update local_moves set deleted_at = new.deleted_at where parent_nat_load_id = new.id and deleted_at is null;
    update ramp        set deleted_at = new.deleted_at where national_load_id = new.id and deleted_at is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_national_loads_soft_delete_cascade on national_loads;
create trigger trg_national_loads_soft_delete_cascade after update of deleted_at on national_loads
  for each row execute function national_loads_soft_delete_cascade();
create or replace function national_orders_soft_delete_cascade() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update national_loads set deleted_at = new.deleted_at where source_national_order_id = new.id and deleted_at is null; -- πυροδοτεί το παραπάνω
    update order_stops   set deleted_at = new.deleted_at where national_order_id = new.id and deleted_at is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_national_orders_soft_delete_cascade on national_orders;
create trigger trg_national_orders_soft_delete_cascade after update of deleted_at on national_orders
  for each row execute function national_orders_soft_delete_cascade();
-- 5. Καθάρισμα των 14 ορφανών στάσεων (μετρημένο 7/9): παίρνουν την ημερομηνία διαγραφής του φορτίου τους.
update order_stops s set deleted_at = n.deleted_at from national_loads n
 where s.national_load_id = n.id and s.deleted_at is null and n.deleted_at is not null;
comment on column national_loads.source_national_order_id is 'Source national order (owner 7/9/2026, spec national-load-source). Exactly one of source_order_id / source_national_order_id / source_cons_load_id is meant to be set.';
comment on column ramp.national_load_id is 'Ramp row created for this national load (owner 7/9/2026). national_order_id is for real national orders only.';
commit;
-- Proof: select count(*) from order_stops s join national_loads n on n.id=s.national_load_id where s.deleted_at is null and n.deleted_at is not null; -- 0
--        select conname from pg_constraint where conrelid='national_loads'::regclass and contype='c';  -- national_loads_one_source (3 στήλες)
--        select tgname from pg_trigger where tgrelid in ('national_loads'::regclass,'national_orders'::regclass) and not tgisinternal; -- 2
```

## Β. Worker — `worker/src/index.js` (deploy μαζί)
- NAT_LOADS `links` (γρ. ~1561): `+ "Source National Order": { column: "source_national_order_id", table: "national_orders" }`.
  Τα `aliases`/`linkAliases` του «Source Record» ΜΕΝΟΥΝ για το VS (orders_intl γράφει ακόμη `Source Record`= id διεθνούς).
- RAMP `links` (γρ. ~994): `+ "National Load": { column: "national_load_id", table: "national_loads" }`.
- Τίποτα άλλο. Tests 13/13, φρουρός τριών + τα labels του 7/9 (RAMP links, fleet, Order No, Plan Week Start).

## Γ. Front end
### Γ1 `modules/orders_natl.js` — `_syncNationalLoad(noId, noFields, isDelete)` (γρ. 1717-1800)
- Εύρεση υπάρχοντος: `filterByFormula: FIND("${noId}", ARRAYJOIN({Source National Order}, ","))>0` (link → ο Worker το μεταφράζει).
- Εγγραφή: `'Source National Order': [noId]`, `'Source Type': 'National'`. ΑΦΑΙΡΟΥΝΤΑΙ `'Source Record'` και `'Source Orders'` από αυτή τη διαδρομή
  (ήταν η αιτία του 400: το alias τα οδηγεί στο FK των διεθνών). Το `'Source Type'='National'` δεν επηρεάζει κανέναν καταναλωτή: όλα τα
  σημεία του weekly_natl ελέγχουν μόνο `=== 'Groupage'` (γρ. 221, 238, 1229, 1455, 1491, 1667).
- Αποτυχία δημιουργίας/ενημέρωσης φορτίου: `toast('Η παραγγελία αποθηκεύτηκε αλλά ΔΕΝ μπήκε στο Weekly — …', 'danger')` + `logError`. Όχι σιωπή.
- Διαγραφή εθνικής (`deleteNatlOrder` γρ. 1893): μένει ως έχει· η βάση εγγυάται πλέον το cascade. Το `isDelete` της `_syncNationalLoad`
  χρησιμοποιείται μόνο στο «groupage ON» (γρ. 1523).
### Γ2 `modules/weekly_natl.js` — ανάθεση (γρ. 1984-1999) και στάσεις (γρ. 1334-1340)
- Στο fetch (γρ. 152) προστίθενται `'Source National Order'`, `'Source Order'`. Το `'Source Record'` φεύγει από το fetch (επιστρέφει πάντα κενό: 47 σιωπηλές απορρίψεις 7/9).
- Ανάθεση: `const noId = getLinkedId(nl.fields['Source National Order'])`. Αν υπάρχει → PATCH `NAT_ORDERS` Status `'Assigned'` (όπως σήμερα).
  Αν το φορτίο έχει `'Source Order'` (VS) → **καμία** αλλαγή στη διεθνή (η ανάθεσή της ζει στο Weekly International). Το `catch` γίνεται toast+logError.
- Στάσεις (γρ. 1334): η ίδια διάκριση — `Source National Order` → στάσεις της εθνικής, `Source Order` → στάσεις της διεθνούς.
### Γ3 `modules/daily_ramp.js` — δημιουργία (γρ. 268-272) και «Ολοκληρώθηκε» (γρ. 672-706)
- Δημιουργία: `rec['National Load'] = [nlPid]` αντί για `rec['National Order']`. Το `'National Order'` γράφεται ΜΟΝΟ αν η στάση έχει γονέα εθνική παραγγελία (`F.STOP_PARENT_NO`, αν υπάρχει στο stops-helpers· αλλιώς ποτέ).
- Fetch/dedup (γρ. 108, 164, 168): `'National Load'` μπαίνει όπου μπαίνει το `'National Order'`.
- «Ολοκληρώθηκε» με `National Load`: PATCH `NAT_LOADS` `{Status:'In Transit'}` για φόρτωση (outbound)· και αν το φορτίο έχει `Source National Order` → PATCH την εθνική `'In Transit'` (η σημερινή πρόθεση, στον σωστό πίνακα). Για VS φορτίο (Source Order) η διεθνής ΔΕΝ αγγίζεται από τη ράμπα (ήδη έτσι: «VS inbound is just a leg»). Αποτυχία → toast+logError.
- Ο υπάρχων κλάδος `natOrderId` (γρ. 692-706) μένει για πραγματικές εθνικές παραγγελίες.

## Δ. Αναδρομικά και απόδειξη (μετά migration + deploy)
1. Οι 4 εθνικές παραγγελίες: ο owner ανοίγει/αποθηκεύει την καθεμία από τη φόρμα (η διορθωμένη διαδρομή φτιάχνει το φορτίο). Απόδειξη:
   `select count(*) from national_loads where source_national_order_id is not null and deleted_at is null` = 4· εμφανίζονται στο Weekly National.
2. Νέα εθνική από το κουμπί του Weekly → φορτίο με `source_national_order_id`, `source_type='National'`, εμφανίζεται στην ημέρα της.
3. Διαγραφή δοκιμαστικού φορτίου από το Weekly → οι στάσεις του `deleted_at` ίδιο (trigger)· ορφανές στάσεις = 0.
4. Ράμπα: μία εγγραφή που δημιουργείται για εθνικό φορτίο έχει `ramp.national_load_id`· «Ολοκληρώθηκε» → `national_loads.status='In Transit'`.
5. Ανάθεση στο Weekly εθνικού φορτίου → `national_orders.status='Assigned'`· για VS φορτίο → η διεθνής αμετάβλητη, κανένα σφάλμα στο app_errors.

## Πλάνο εκτέλεσης
- T1 (Sonnet): §Α αρχείο migration + §Β Worker map. `node --check`, tests, φρουρός. Commit, χωρίς deploy.
- T2 (Sonnet): §Γ1–Γ3. `node --check`, bump, commit. Review Sonnet (spec + ποιότητα), fix wave.
- T3 (συντονιστής + owner): migration στον SQL editor (ναι owner) → deploy → §Δ αποδείξεις → αναφορά + DECISION_LOG.
Εκτός: κατάσταση/φίλτρα εθνικής, εβδομάδα Σάββατο–Παρασκευή, `Status='Invoiced'`, μισθοδοσία εθνικών (βήματα 2–3).
