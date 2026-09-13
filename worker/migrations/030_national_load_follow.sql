-- 030 — The national leg of a Veroia Switch order follows the order (owner 13/9/2026: «θέματα εθνικών»)
--
-- WHY (measured 13/9): 35 live national loads, 0 ever reached In Transit or
-- Delivered, while 28 of their international orders are already Delivered and
-- 4 In Transit. The only code that ever promotes a national load is the ramp
-- board (Done on an outbound ramp row WITH a load link → In Transit); no code
-- anywhere writes Delivered. So the Weekly National and the ramp show as
-- «pending» loads that were delivered days ago. A screen fix would cover one
-- path; the rule lives in the base (αρχή 4) so Daily Ops, the form, the boards
-- and SQL all keep the two rows in step.
--
-- RULE for a Direct load of a Veroia Switch order (source_type='Direct',
-- source_order_id = the order):
--   Import (ΚΑΘΟΔΟΣ, Veroia → client): the national leg is the LAST leg, so
--     order Delivered  → load Delivered.
--   Export (ΑΝΟΔΟΣ, supplier → Veroia): the national leg is the FIRST leg, so
--     order In Transit → load Delivered (it left Veroia, the pickup happened),
--     order Delivered  → load Delivered.
--   order Cancelled   → load Cancelled.
-- Status only moves FORWARD (Pending/Assigned → Delivered); a load already
-- Delivered/Cancelled is never touched, and a load is never sent back.
-- Every write leaves an audit row (actor trigger:national_load_follow).
--
-- Also here, same family (measured 13/9: load 80 still «matched» to load 91,
-- deleted 9/9 — the board shows a pair with a ghost): a soft-deleted national
-- load releases its partner's matched_load, like 023 does for orders.

begin;

create or replace function national_load_follow_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare target text; r record;
begin
  target := case
    when new.status = 'Cancelled' then 'Cancelled'
    when new.direction = 'Import' and new.status = 'Delivered' then 'Delivered'
    when new.direction = 'Export' and new.status in ('In Transit','Delivered') then 'Delivered'
    else null end;
  if target is null or not coalesce(new.veroia_switch, false) then return null; end if;
  for r in update national_loads nl set status = target
           where nl.source_order_id = new.id and nl.deleted_at is null and nl.source_type = 'Direct'
             and nl.status not in ('Delivered','Cancelled')
           returning nl.id, nl.status loop
    insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
    values ('trigger:national_load_follow', 'system', 'update', 'national_loads', r.id::text,
            jsonb_build_object('status', target, 'reason', 'order ' || new.id || ' → ' || new.status), now());
  end loop;
  return null;
end $$;

drop trigger if exists national_load_follow_order on orders;
create trigger national_load_follow_order
  after update of status on orders
  for each row when (old.status is distinct from new.status)
  execute function national_load_follow_order();

create or replace function national_load_soft_delete_unlink() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.legacy_id is null then return null; end if;
  for r in update national_loads o set matched_load = null
           where o.matched_load = new.legacy_id and o.deleted_at is null returning o.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:national_load_unlink', 'system', 'update', 'national_loads', r.id::text,
            jsonb_build_object('matched_load', new.legacy_id),
            jsonb_build_object('matched_load', null, 'reason', 'matched load ' || new.id || ' deleted'), now());
  end loop;
  return null;
end $$;

drop trigger if exists national_load_soft_delete_unlink on national_loads;
create trigger national_load_soft_delete_unlink
  after update of deleted_at on national_loads
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function national_load_soft_delete_unlink();

-- Backfill 1: loads left behind (expect ~28 Delivered + Cancelled where the order is).
with rule as (
  select nl.id, case
      when o.status = 'Cancelled' then 'Cancelled'
      when o.direction = 'Import' and o.status = 'Delivered' then 'Delivered'
      when o.direction = 'Export' and o.status in ('In Transit','Delivered') then 'Delivered'
      else null end as target, nl.status old_status, o.id order_id, o.status order_status
  from national_loads nl join orders o on o.id = nl.source_order_id
  where nl.deleted_at is null and nl.source_type = 'Direct' and o.deleted_at is null and o.veroia_switch
    and nl.status not in ('Delivered','Cancelled')),
upd as (update national_loads nl set status = r.target from rule r where nl.id = r.id and r.target is not null
        returning nl.id, r.old_status, nl.status, r.order_id, r.order_status)
insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:030', 'system', 'update', 'national_loads', u.id::text,
       jsonb_build_object('status', u.old_status),
       jsonb_build_object('status', u.status, 'reason', 'order ' || u.order_id || ' is ' || u.order_status), now()
from upd u;

-- Backfill 2: matched_load pointing at a deleted or missing load (expect 1: load 80).
with bad as (select o.id, o.matched_load from national_loads o
             left join national_loads m on m.legacy_id = o.matched_load and m.deleted_at is null
             where o.deleted_at is null and coalesce(o.matched_load,'') <> '' and m.id is null),
upd as (update national_loads o set matched_load = null from bad where o.id = bad.id returning o.id, bad.matched_load)
insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:030', 'system', 'update', 'national_loads', id::text,
       jsonb_build_object('matched_load', matched_load), jsonb_build_object('matched_load', null, 'reason', 'ghost pair'), now() from upd;

commit;

-- Proof (expect 0 / 0):
-- select count(*) from national_loads nl join orders o on o.id=nl.source_order_id
--  where nl.deleted_at is null and nl.source_type='Direct' and o.veroia_switch and o.deleted_at is null
--    and ((o.direction='Import' and o.status='Delivered') or (o.direction='Export' and o.status in ('In Transit','Delivered')))
--    and nl.status not in ('Delivered','Cancelled');
-- select count(*) from national_loads o left join national_loads m on m.legacy_id=o.matched_load and m.deleted_at is null
--  where o.deleted_at is null and coalesce(o.matched_load,'')<>'' and m.id is null;
