-- 018 — orders_with_derived gains plan_week_start (EXECUTED 2026-09-07 10:25 via SQL editor,
-- together with 017_fleet.sql and the Pending backfill below).
--
-- Why: the Worker reads ORDERS through this view (readView). It was created with an
-- explicit column list, so 016's new column never reached it — a read asking for
-- «Plan Week Start» would have failed right after the deploy. CREATE OR REPLACE keeps
-- the existing 127 columns in place and only appends the new one.
create or replace view public.orders_with_derived as
select v.*, o.group_id, o.plan_week_start
  from public.orders_with_derived_old3 v
  join public.orders o on o.id = v.id;

-- Data fix in the same run (owner 7/9): three orders saved without Status by the form
-- before the 3/9 fix (ids 279, 280, 282) → 'Pending'.
update public.orders set status = 'Pending'
 where deleted_at is null and status is null and id in (279, 280, 282);

-- Proof (read 10:27): trucks GR 25 · BG 11 · NULL 0 — trailers GR 23 · BG 16 · NULL 1 (TB53142)
--                     view has plan_week_start = 1 — orders without status = 0
