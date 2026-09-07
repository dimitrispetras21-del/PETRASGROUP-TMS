-- 019 — orders_with_derived exposes the leg columns (7/9/2026)
--
-- The Worker READS orders through this view (readView, worker/src/index.js).
-- 018 added parent_order_id / leg_no to the table, but a view keeps the column
-- list it was created with — so the facade never returned «Parent Order» /
-- «Leg No» and the Weekly could not tell a leg from an order (owner 7/9:
-- «εμφανίστηκε 2 φορές»). CREATE OR REPLACE may only APPEND columns, so the two
-- go at the end, after order_no. Same layering as today (old3 view + join).

begin;

create or replace view orders_with_derived as
select v.*, o.group_id, o.plan_week_start, o.id as order_no, o.parent_order_id, o.leg_no
from orders_with_derived_old3 v
join orders o on o.id = v.id;

revoke all on orders_with_derived from public, anon, authenticated;
grant select on orders_with_derived to service_role;

commit;

-- Proof: expect 2 rows (legacy_id, parent_order_id, leg_no of the two legs of the split order)
-- select legacy_id, parent_order_id, leg_no from orders_with_derived where parent_order_id is not null;
