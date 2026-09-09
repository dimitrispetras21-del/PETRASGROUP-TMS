-- 026 — One vehicle per groupage: backfill members left without one (owner 9/9/2026)
--
-- WHY: until 8/9 the screen wrote a group's assignment to the lead member only
-- (import groupage) — two delivered groups still have one member with a truck
-- and its sibling with none (measured 9/9: I1 = 2). The screen rule is fixed
-- (assignment propagates to every member, and a member that leaves loses it);
-- this repairs the history the old rule left behind, by the same rule: a
-- member without a vehicle takes the vehicle of the member that has one.
-- Idempotent; every row touched gets an audit_log line (actor migration:026).
-- Status is NOT touched (one member may be Delivered while another is still
-- In Transit — that is legitimate and not a vehicle disagreement).

begin;

with grp as (
  select split_part(group_id, '|', 1) as g, id, truck_id, trailer_id, driver_id, partner_id, loading_datetime
  from orders where deleted_at is null and coalesce(group_id, '') <> ''
),
donor as (
  -- the member that carries a vehicle (earliest loading first, then id)
  select distinct on (g) g, truck_id, trailer_id, driver_id, partner_id
  from grp where truck_id is not null or partner_id is not null
  order by g, loading_datetime nulls last, id
),
todo as (
  select m.id, d.truck_id, d.trailer_id, d.driver_id, d.partner_id
  from grp m join donor d on d.g = m.g
  where m.truck_id is null and m.partner_id is null
),
upd as (
  update orders o set truck_id = t.truck_id, trailer_id = t.trailer_id, driver_id = t.driver_id, partner_id = t.partner_id
  from todo t where o.id = t.id
  returning o.id, t.truck_id, t.trailer_id, t.driver_id, t.partner_id
)
insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:026', 'system', 'update', 'orders', id::text,
       jsonb_build_object('truck_id', null, 'partner_id', null),
       jsonb_build_object('truck_id', truck_id, 'trailer_id', trailer_id, 'driver_id', driver_id, 'partner_id', partner_id,
                          'reason', 'group vehicle backfill (026)'), now()
from upd;

commit;

-- Proof (expect 0): groups whose live members disagree on the vehicle
-- select split_part(group_id,'|',1) g from orders where deleted_at is null and coalesce(group_id,'')<>''
--  group by 1 having count(distinct (truck_id,trailer_id,driver_id,partner_id)) > 1;
-- and: select count(*) from audit_log where actor = 'migration:026';  -- expect 2
