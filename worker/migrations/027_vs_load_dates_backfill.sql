-- 027 — Veroia Switch loads: realign dates with their international order (owner 9/9/2026)
--
-- WHY: core/order-sync.js ran the VS chain through a global `_syncVeroiaSwitch`
-- that orders_intl.js kept inside its IIFE, so every date change made from the
-- Weekly board or Daily Ops since the chain was wired (7/9) patched the ORDER
-- and never the NATIONAL LOAD (Worker log 9/9 12:53: PATCH orders/318, no
-- NAT_LOADS request). Fixed in the front end 9/9 13:10 (exposed + loud guard).
-- This is the one-time repair of the rows left behind, by the SAME rule the
-- screen applies (orders_intl._syncVeroiaSwitch):
--   Export (ΑΝΟΔΟΣ): load = intl loading date, delivery = load + 1
--   Import (ΚΑΘΟΔΟΣ): delivery = intl delivery date, load = delivery − 1
-- Only Pending loads move — a load already on the road keeps its dates.
-- Measured 9/9 13:20: 7 rows (318, 309, 307, 281, 275, 205, 191).

begin;

with rule as (
  select nl.id nl_id, o.id order_id,
         case when o.direction='Export' then o.loading_datetime::date else (o.delivery_datetime::date - 1) end as exp_load,
         case when o.direction='Export' then (o.loading_datetime::date + 1) else o.delivery_datetime::date end as exp_del,
         nl.loading_datetime old_load, nl.delivery_datetime old_del
  from orders o join national_loads nl on nl.source_order_id=o.id and nl.deleted_at is null
  where o.deleted_at is null and o.veroia_switch and nl.source_type='Direct'
    and o.status <> 'Cancelled' and nl.status = 'Pending'
    and (nl.loading_datetime::date <> case when o.direction='Export' then o.loading_datetime::date else (o.delivery_datetime::date - 1) end
      or nl.delivery_datetime::date <> case when o.direction='Export' then (o.loading_datetime::date + 1) else o.delivery_datetime::date end)),
upd as (
  update national_loads nl set
    loading_datetime  = (r.exp_load::text || 'T12:00:00+00')::timestamptz,
    delivery_datetime = (r.exp_del::text  || 'T12:00:00+00')::timestamptz
  from rule r where nl.id = r.nl_id
  returning nl.id, r.order_id, r.old_load, r.old_del, nl.loading_datetime, nl.delivery_datetime)
insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
select 'migration:027', 'system', 'update', 'national_loads', u.id::text,
       jsonb_build_object('loading_datetime', u.old_load, 'delivery_datetime', u.old_del),
       jsonb_build_object('loading_datetime', u.loading_datetime, 'delivery_datetime', u.delivery_datetime,
                          'reason', 'VS chain dead until 9/9 — realigned to order ' || u.order_id),
       now()
from upd u;

commit;

-- Proof (expect 0 rows): the SELECT from the WHY block above with nl.status='Pending'.
