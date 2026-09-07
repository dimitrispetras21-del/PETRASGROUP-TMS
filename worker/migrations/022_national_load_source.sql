-- EXECUTED 2026-09-07 15:58 via SQL editor (owner: «ναι, προχώρα με το Βήμα 1»). Proof: orphan stops 0, CHECK 3 στήλες, 2 triggers, ramp 5 FKs.
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
