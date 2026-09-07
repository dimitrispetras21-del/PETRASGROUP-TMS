-- 019 — orders_with_derived gains order_no = orders.id (EXECUTED 2026-09-07 10:50 via SQL editor).
--
-- Why: «Order No» (owner 7/9: every order shows its internal number) was first mapped to the
-- view's `id`, but the facade keeps `id` internal and never copies it into fields — the label
-- came back null after the 10:41 deploy. An explicit alias column is read like any computed
-- field (select on the readView), so nothing in the read path needs a special case.
create or replace view public.orders_with_derived as
select v.*, o.group_id, o.plan_week_start, o.id as order_no
  from public.orders_with_derived_old3 v
  join public.orders o on o.id = v.id;

-- Same run, owner rule 7/9 («τράκτορες: CB = BG, όλα τα άλλα GR· ρυμούλκες: CB και E = BG, όλα τα άλλα GR»):
-- the prefill of 017 matched every plate but TB53142.
update public.trailers set country = 'GR' where deleted_at is null and license_plate = 'TB53142' and country is null;
