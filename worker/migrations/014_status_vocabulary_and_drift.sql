-- 014 — Order status vocabulary in the database + sync_drift() (sync audit 5/9/2026)
--
-- Measured 5/9: 5 orders with status NULL (created 2–3/9), the vocabulary rule
-- «Pending → Assigned → In Transit → Delivered, + Cancelled» (owner 23/8) lived
-- only in the screens. A NULL status is read as «all fine» by the boards (K3).
-- The rule moves to the table (αρχή 4). Backfill first so the constraint holds.
--
-- sync_drift(): one row per SYNC_MAP edge with its drift count, so a nightly
-- check (tools/drift-check, via PostgREST RPC) can say «something drifted» before
-- a person finds out. SELECT-only; security definer so the service role reads
-- every table it needs.

begin;

update orders set status = 'Pending' where deleted_at is null and status is null;

alter table orders alter column status set default 'Pending';
alter table orders alter column status set not null;
alter table orders drop constraint if exists orders_status_vocabulary;
alter table orders add constraint orders_status_vocabulary
  check (status in ('Pending', 'Assigned', 'In Transit', 'Delivered', 'Cancelled'));

create or replace function sync_drift() returns table (edge text, drift bigint)
language sql security definer set search_path = public stable as $$
  -- E1 order ↔ round trip
  select 'E1', (
    with x as (
      select r.id, r.driver_id, r.truck_id, r.trailer_id, r.partner_id, r.trip_type, r.date_start, r.date_end,
             o.driver_id o_driver, o.truck_id o_truck, o.trailer_id o_trailer, o.partner_id o_partner,
             coalesce(o.is_partner_trip,false) o_partner_trip,
             o.loading_datetime::date load_d, coalesce(o.actual_delivery_date, o.delivery_datetime::date) deliv_d
      from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id join orders o on o.id = l.order_id
      where r.status <> 'cancelled' and o.deleted_at is null)
    select (select count(*) from x where o_driver is distinct from driver_id or o_truck is distinct from truck_id
              or o_trailer is distinct from trailer_id or o_partner is distinct from partner_id or o_partner_trip <> (trip_type = 'PARTNER'))
         + (select count(*) from (select id, date_start, date_end, min(load_d) mn, max(deliv_d) mx from x group by 1,2,3) y
              where date_start <> mn or date_end is distinct from greatest(mx, mn)))
  union all
  -- E2 round trip → ledger
  select 'E2', (
    with live as (select e.* from dl_entries e where e.entry_type = 'trip' and e.deleted_at is null and e.rt_id is not null)
    select (select count(*) from live e join ct_round_trips r on r.id = e.rt_id
              where r.status = 'cancelled' or e.driver_id is distinct from r.driver_id or e.entry_date <> r.date_start or e.date_end is distinct from r.date_end)
         + (select count(*) from ct_round_trips r where r.status <> 'cancelled' and r.trip_type = 'OWNED' and r.driver_id is not null
              and not exists (select 1 from live e where e.rt_id = r.id)))
  union all
  -- E3 export ↔ import match
  select 'E3', (
    with m as (select e.id exp_id, i.id imp_id, i.deleted_at imp_deleted, i.direction imp_dir
               from orders e left join orders i on i.legacy_id = e.matched_import_id
               where e.deleted_at is null and e.matched_import_id is not null)
    select (select count(*) from m where imp_id is null or imp_deleted is not null or imp_dir <> 'Import')
         + (select count(*) from m where imp_id is not null and imp_deleted is null
              and not exists (select 1 from ct_rt_legs a join ct_rt_legs b on a.rt_id = b.rt_id
                              join ct_round_trips r on r.id = a.rt_id and r.status <> 'cancelled'
                              where a.order_id = m.exp_id and b.order_id = m.imp_id)))
  union all
  -- E4 Veroia Switch → national load (status only; dates differ by design)
  select 'E4', (
    with vs as (select o.* from orders o where o.deleted_at is null and o.veroia_switch = true),
         nl as (select n.* from national_loads n where n.deleted_at is null and n.source_order_id is not null)
    select (select count(*) from vs where not exists (select 1 from nl where nl.source_order_id = vs.id))
         + (select count(*) from nl join orders o on o.id = nl.source_order_id where o.deleted_at is not null or o.veroia_switch is distinct from true)
         + (select count(*) from nl join vs on vs.id = nl.source_order_id where (vs.status = 'Cancelled') <> (nl.status = 'Cancelled')))
  union all
  -- E5 groupage lines
  select 'E5', (
    select (select count(*) from groupage_lines g where g.deleted_at is null
              and ((g.order_id is not null and exists (select 1 from orders o where o.id = g.order_id and o.deleted_at is not null))
                or (g.national_order_id is not null and exists (select 1 from national_orders o where o.id = g.national_order_id and o.deleted_at is not null))))
         + (select count(*) from groupage_lines g where g.deleted_at is null
              and ((g.status = 'Assigned' and g.cons_load_id is null) or (g.status = 'Unassigned' and g.cons_load_id is not null)))
         + (select count(*) from orders o where o.deleted_at is null and o.national_groupage = true
              and not exists (select 1 from groupage_lines g where g.order_id = o.id and g.deleted_at is null)))
  union all
  -- E6 consolidated load → national load
  select 'E6', (
    with cl as (select * from consolidated_loads where deleted_at is null),
         nl as (select * from national_loads where deleted_at is null and source_cons_load_id is not null)
    select (select count(*) from cl where not exists (select 1 from nl where nl.source_cons_load_id = cl.id)
              and exists (select 1 from groupage_lines g where g.cons_load_id = cl.id and g.deleted_at is null))
         + (select count(*) from nl join consolidated_loads c on c.id = nl.source_cons_load_id where c.deleted_at is not null)
         + (select count(*) from nl join cl on cl.id = nl.source_cons_load_id
              where nl.truck_id is distinct from cl.truck_id or nl.driver_id is distinct from cl.driver_id or nl.partner_id is distinct from cl.partner_id))
  union all
  -- E8 partner assignments
  select 'E8', (
    with pa as (select * from partner_assignments where deleted_at is null and order_id is not null)
    select (select count(*) from pa join orders o on o.id = pa.order_id where o.deleted_at is not null)
         + (select count(*) from pa join orders o on o.id = pa.order_id where coalesce(o.is_partner_trip,false) = false or o.partner_id is distinct from pa.partner_id)
         + (select count(*) from orders o where o.deleted_at is null and o.is_partner_trip = true and o.partner_id is not null
              and o.status <> 'Cancelled' and not exists (select 1 from pa where pa.order_id = o.id)))
  union all
  -- E10 pallet exchange → movement
  select 'E10', (
    select (select count(*) from orders o where o.deleted_at is null and o.pallet_exchange = true and o.status <> 'Cancelled'
              and not exists (select 1 from pl_movements m where m.order_id = o.id))
         + (select count(*) from pl_movements m join orders o on o.id = m.order_id
              where (o.deleted_at is not null or o.pallet_exchange is distinct from true) and m.status = 'pending'))
  union all
  -- E11 status coherence
  select 'E11', (
    select (select count(*) from orders o where o.deleted_at is null and o.status = 'Pending' and (o.truck_id is not null or o.partner_id is not null))
         + (select count(*) from orders o where o.deleted_at is null and o.status in ('Assigned','In Transit') and o.truck_id is null and o.partner_id is null)
         + (select count(*) from ct_round_trips r where r.status in ('closed','complete')
              and exists (select 1 from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = r.id and o.deleted_at is null and o.status not in ('Delivered','Cancelled'))))
  union all
  -- E12 national loads without a round trip (N4)
  select 'E12', (select count(*) from national_loads n where n.deleted_at is null and n.truck_id is not null and coalesce(n.is_partner_trip,false) = false
                   and n.loading_datetime >= '2026-08-01' and not exists (select 1 from ct_rt_legs l where l.nat_load_id = n.id));
$$;

revoke all on function sync_drift() from public, anon, authenticated;
grant execute on function sync_drift() to service_role;

commit;

-- Proof: select * from sync_drift();   -- expect E1 0, E2 0, E3 0, E5 0, E6 0, E8 0; E4 1, E10 9, E11 3, E12 2 until their fixes land
-- and: select count(*) from orders where status is null;  -- 0
