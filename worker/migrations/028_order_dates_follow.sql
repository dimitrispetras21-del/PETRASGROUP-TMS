-- 028 — Dates of one transport move together (owner 9/9/2026: «ημερομηνίες ακόμα λάθος»)
--
-- WHY (the mechanism): one order carries the same day in FOUR places —
--   orders.loading_datetime / delivery_datetime (what the boards edit),
--   order_stops.datetime (what the tiles, prints and Daily Ops stamp),
--   orders.cross_dock_date (the Veroia day, locked decision «ΜΙΑ στήλη»),
--   national_loads (+ its stops) for a Veroia Switch order.
-- Every board/Daily Ops date change wrote ONLY the first one. Measured 9/9:
-- order 318 delivery 9/9 while its drops still said 14/9–15/9 and its
-- cross-dock 13/9; 309/281/275 postponed to 10/9–9/9 with loads left on the
-- old days; the Weekly International estimated the Cross-Dock as Delivery−1
-- from an empty column. A screen-level sync (order-sync VS chain) was dead
-- until 9/9 13:10 and, even alive, covers only the paths that call it.
--
-- RULE (αρχή 4, lives in the base so every path obeys — form, boards, Daily
-- Ops, SQL): when an order's loading or delivery day moves by Δ days,
--   • its stops of that side move by Δ (Loading stops with loading, Unloading
--     stops with delivery; the Cross-dock stop with the side that owns it:
--     delivery for Import, loading for Export),
--   • cross_dock_date moves by the same Δ (same side rule),
--   • its Direct, still-Pending national load and that load's stops move by Δ.
-- Legs of a split follow their parent through 020 and then this trigger runs
-- for each leg as its own order. A load already Assigned/In Transit/Delivered
-- is NOT moved — the dispatcher owns it from then on (execution beats planning).
-- Every shift writes an audit row (actor trigger:order_dates_follow).

begin;

create or replace function order_dates_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d_load int := 0; d_del int := 0; d_cd int := 0;
  r record;
begin
  if old.loading_datetime is not null and new.loading_datetime is not null then
    d_load := new.loading_datetime::date - old.loading_datetime::date; end if;
  if old.delivery_datetime is not null and new.delivery_datetime is not null then
    d_del := new.delivery_datetime::date - old.delivery_datetime::date; end if;
  if d_load = 0 and d_del = 0 then return null; end if;
  d_cd := case when new.direction = 'Export' then d_load else d_del end;

  -- 1. The order's own stops follow their side.
  for r in update order_stops s set datetime = s.datetime + make_interval(days =>
             case when s.stop_type = 'Loading' then d_load
                  when s.stop_type = 'Unloading' then d_del
                  else d_cd end)
           where s.order_id = new.id and s.deleted_at is null and s.datetime is not null
             and (case when s.stop_type = 'Loading' then d_load when s.stop_type = 'Unloading' then d_del else d_cd end) <> 0
           returning s.id, s.stop_type loop
    insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
    values ('trigger:order_dates_follow', 'system', 'update', 'order_stops', r.id::text,
            jsonb_build_object('order_id', new.id, 'stop_type', r.stop_type, 'shift_days',
              case when r.stop_type = 'Loading' then d_load when r.stop_type = 'Unloading' then d_del else d_cd end), now());
  end loop;

  -- 2. The Veroia day follows its side (only when it was set).
  if d_cd <> 0 and new.cross_dock_date is not null then
    update orders set cross_dock_date = cross_dock_date + d_cd where id = new.id;
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_dates_follow', 'system', 'update', 'orders', new.id::text,
            jsonb_build_object('cross_dock_date', new.cross_dock_date),
            jsonb_build_object('cross_dock_date', new.cross_dock_date + d_cd, 'shift_days', d_cd), now());
  end if;

  -- 3. The Direct national load of a Veroia Switch order, while still Pending.
  if d_cd <> 0 and new.veroia_switch then
    for r in update national_loads nl
               set loading_datetime = nl.loading_datetime + make_interval(days => d_cd),
                   delivery_datetime = nl.delivery_datetime + make_interval(days => d_cd)
             where nl.source_order_id = new.id and nl.deleted_at is null
               and nl.source_type = 'Direct' and nl.status = 'Pending'
             returning nl.id loop
      update order_stops s set datetime = s.datetime + make_interval(days => d_cd)
        where s.national_load_id = r.id and s.deleted_at is null and s.datetime is not null;
      insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
      values ('trigger:order_dates_follow', 'system', 'update', 'national_loads', r.id::text,
              jsonb_build_object('source_order_id', new.id, 'shift_days', d_cd), now());
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists order_dates_follow on orders;
create trigger order_dates_follow
  after update of loading_datetime, delivery_datetime on orders
  for each row when (old.loading_datetime is distinct from new.loading_datetime
                  or old.delivery_datetime is distinct from new.delivery_datetime)
  execute function order_dates_follow();

-- Backfill: rows already left behind. The ORDER's day is the truth (that is
-- what dispatchers moved on purpose); stops, cross-dock and Pending loads are
-- realigned to it with the SAME rule the trigger applies from now on.
-- Scope: live international orders not yet Delivered/Cancelled.

-- B1. Unloading stops: first drop = order delivery; the other drops keep their
--     distance from the first (multi-drop days stay multi-drop).
with o as (select id, delivery_datetime::date del from orders
           where deleted_at is null and order_type = 'International' and delivery_datetime is not null
             and status not in ('Delivered','Cancelled')),
f as (select s.order_id, min(s.datetime::date) first_dt from order_stops s join o on o.id = s.order_id
      where s.stop_type = 'Unloading' and s.deleted_at is null and s.datetime is not null group by s.order_id),
d as (select f.order_id, (o.del - f.first_dt) shift from f join o on o.id = f.order_id where o.del <> f.first_dt),
upd as (update order_stops s set datetime = s.datetime + make_interval(days => d.shift)
        from d where s.order_id = d.order_id and s.stop_type = 'Unloading' and s.deleted_at is null and s.datetime is not null
        returning s.id, d.order_id, d.shift)
insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
select 'migration:028', 'system', 'update', 'order_stops', id::text,
       jsonb_build_object('order_id', order_id, 'shift_days', shift, 'reason', 'unloading stops realigned to order delivery'), now() from upd;

-- B2. Loading stops: first pickup = order loading, same rule.
with o as (select id, loading_datetime::date ld from orders
           where deleted_at is null and order_type = 'International' and loading_datetime is not null
             and status not in ('Delivered','Cancelled')),
f as (select s.order_id, min(s.datetime::date) first_dt from order_stops s join o on o.id = s.order_id
      where s.stop_type = 'Loading' and s.deleted_at is null and s.datetime is not null group by s.order_id),
d as (select f.order_id, (o.ld - f.first_dt) shift from f join o on o.id = f.order_id where o.ld <> f.first_dt),
upd as (update order_stops s set datetime = s.datetime + make_interval(days => d.shift)
        from d where s.order_id = d.order_id and s.stop_type = 'Loading' and s.deleted_at is null and s.datetime is not null
        returning s.id, d.order_id, d.shift)
insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
select 'migration:028', 'system', 'update', 'order_stops', id::text,
       jsonb_build_object('order_id', order_id, 'shift_days', shift, 'reason', 'loading stops realigned to order loading'), now() from upd;

-- B3. Cross-dock that no longer fits its order: Import → delivery−1, Export → loading+1
--     (the estimate rule, only where the real day became impossible).
with bad as (select id, cross_dock_date old_cd,
               case when direction = 'Export' then loading_datetime::date + 1 else delivery_datetime::date - 1 end new_cd
             from orders where deleted_at is null and veroia_switch and cross_dock_date is not null
               and status not in ('Delivered','Cancelled')
               and ((direction = 'Import' and cross_dock_date >= delivery_datetime::date)
                 or (direction = 'Export' and cross_dock_date <= loading_datetime::date))),
upd as (update orders o set cross_dock_date = bad.new_cd from bad where o.id = bad.id returning o.id, bad.old_cd, bad.new_cd)
insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:028', 'system', 'update', 'orders', id::text,
       jsonb_build_object('cross_dock_date', old_cd), jsonb_build_object('cross_dock_date', new_cd, 'reason', 'cross-dock outside order dates'), now() from upd;
-- Cross-dock stops = cross_dock_date.
update order_stops s set datetime = (o.cross_dock_date::text || 'T12:00:00+00')::timestamptz
  from orders o where s.order_id = o.id and s.stop_type = 'Cross-dock' and s.deleted_at is null
    and o.deleted_at is null and o.cross_dock_date is not null and s.datetime::date <> o.cross_dock_date
    and o.status not in ('Delivered','Cancelled');

-- B4. Pending Direct loads of Veroia Switch orders: Import load = cross-dock (or
--     delivery−1), delivery = order delivery; Export load = order loading,
--     delivery = cross-dock (or loading+1). Their stops move by the same shift.
with rule as (
  select nl.id nl_id, o.id order_id, nl.delivery_datetime old_del, nl.loading_datetime old_load,
         case when o.direction = 'Export' then o.loading_datetime::date
              else coalesce(o.cross_dock_date, o.delivery_datetime::date - 1) end exp_load,
         case when o.direction = 'Export' then coalesce(o.cross_dock_date, o.loading_datetime::date + 1)
              else o.delivery_datetime::date end exp_del
  from orders o join national_loads nl on nl.source_order_id = o.id and nl.deleted_at is null
  where o.deleted_at is null and o.veroia_switch and nl.source_type = 'Direct' and nl.status = 'Pending'
    and o.status not in ('Delivered','Cancelled')),
todo as (select * from rule where old_load::date <> exp_load or old_del::date <> exp_del),
upd as (update national_loads nl set
          loading_datetime = (t.exp_load::text || 'T12:00:00+00')::timestamptz,
          delivery_datetime = (t.exp_del::text || 'T12:00:00+00')::timestamptz
        from todo t where nl.id = t.nl_id
        returning nl.id, t.order_id, t.old_load, t.old_del, nl.loading_datetime, nl.delivery_datetime, (t.exp_del - t.old_del::date) shift),
st as (update order_stops s set datetime = s.datetime + make_interval(days => u.shift)
       from upd u where s.national_load_id = u.id and s.deleted_at is null and s.datetime is not null and u.shift <> 0)
insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:028', 'system', 'update', 'national_loads', u.id::text,
       jsonb_build_object('loading_datetime', u.old_load, 'delivery_datetime', u.old_del),
       jsonb_build_object('loading_datetime', u.loading_datetime, 'delivery_datetime', u.delivery_datetime, 'reason', 'realigned to order ' || u.order_id), now()
from upd u;

-- vs_cd_date: the Worker label «VS CD Date» now maps to cross_dock_date (9/9); keep
-- any value ever written there (measured 0/19 on 23/8) by folding it in.
update orders set cross_dock_date = vs_cd_date where vs_cd_date is not null and cross_dock_date is null;

commit;

-- Proof (expect 0 rows each):
-- 1) select count(*) from orders o join order_stops s on s.order_id=o.id and s.stop_type='Unloading' and s.deleted_at is null
--    where o.deleted_at is null and o.order_type='International' and o.status not in ('Delivered','Cancelled')
--    group by o.id, o.delivery_datetime::date having min(s.datetime::date) <> o.delivery_datetime::date;
-- 2) select count(*) from orders where deleted_at is null and veroia_switch and cross_dock_date is not null
--    and status not in ('Delivered','Cancelled')
--    and ((direction='Import' and cross_dock_date >= delivery_datetime::date) or (direction='Export' and cross_dock_date <= loading_datetime::date));
-- 3) the B4 `todo` SELECT.
