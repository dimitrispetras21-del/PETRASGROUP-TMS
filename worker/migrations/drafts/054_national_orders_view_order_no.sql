-- DRAFT 054 — national_orders_with_derived: every national order gets its number (order_no = id).
-- NOT EXECUTED. Owner runs it (after 15:00), then the Worker deploy that reads it (same evening).
--
-- Why (owner 27/9: «αριθμός παραγγελίας πολύ σημαντικός και για εθνικών»; 28/9 go):
-- the one «Παραγγελίες» page shows «#1229» for international and «Ε-427» for national
-- orders. International orders have had their number since 019 (orders_with_derived.order_no);
-- national orders have none — the facade keeps the raw `id` internal and never copies it into
-- fields (the 7/9 lesson: mapping a label straight to "id" came back null). Same fix as 019:
-- an explicit alias column in a read view, served through the Worker's `computed` map.
--
-- Born closed (principle 5): like orders_with_derived, only postgres + service_role read it.
-- The base table's grants are NOT touched here (separate security item, not part of this change).
--
-- TRAP (same as orders_with_derived): `n.*` is expanded when the view is created. A column added
-- to national_orders LATER is missing from the view until `create or replace view` is re-run,
-- and the facade reads through the view → a read naming that column fails loudly (PostgREST 400),
-- it does not silently drop it.
--
-- Rollback: `drop view public.national_orders_with_derived;` AND redeploy the Worker without the
-- readView/computed lines (a Worker that reads a missing view breaks every national read).

begin;

create view public.national_orders_with_derived as
  select n.*, n.id as order_no
    from public.national_orders n;

revoke all on public.national_orders_with_derived from public, anon, authenticated;
grant select on public.national_orders_with_derived to service_role;

-- Proof inside the transaction: same rows, every row numbered, number = id.
do $$
declare base_n bigint; view_n bigint; bad bigint;
begin
  select count(*) into base_n from public.national_orders;
  select count(*) into view_n from public.national_orders_with_derived;
  select count(*) into bad from public.national_orders_with_derived where order_no is null or order_no <> id;
  if base_n <> view_n then raise exception '054: row count % <> %', view_n, base_n; end if;
  if bad <> 0 then raise exception '054: % rows without a correct order_no', bad; end if;
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and table_name = 'national_orders_with_derived'
               and grantee in ('anon', 'authenticated')) then
    raise exception '054: view is open to anon/authenticated';
  end if;
end $$;

commit;

-- After commit (SELECT only):
--   select count(*) filter (where order_no is not null) as numbered, count(*) as total
--     from public.national_orders_with_derived where deleted_at is null;
