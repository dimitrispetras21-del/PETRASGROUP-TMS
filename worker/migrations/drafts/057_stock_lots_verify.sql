-- 057 VERIFY — SELECT ONLY. Run each query on its own in the SQL editor; the expected value is in
-- the comment above it. Any other value = STOP: no Worker deploy, tell the coordinator.
-- V0 runs BEFORE 057 too (write its two numbers down). V1–V8 right after 057. V9 after the first
-- real lot (and any time later — it must keep returning 0 rows).

-- ── V0 — every round trip's revenue, before and after (no lot exists → identical) ──────────────
-- Expected: the SAME two numbers before and after 057.
select count(*) as rts, sum(revenue) as revenue_total from public.ct_v_rt_revenue;
-- Stronger: the md5 of every RT's revenue. Expected: the SAME md5 before and after 057.
select md5(string_agg(rt_id::text || '=' || revenue::text, ',' order by rt_id)) as revenue_md5
  from public.ct_v_rt_revenue;

-- ── V1 — objects ─────────────────────────────────────────────────────────────────────────────────
-- Expected: 8 | 1 | 1 | 6 | 4 | 3 | 7 | 5 | 136 | 2
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'stock_lots')                                  as stock_lots_cols,      -- 8
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'stock_lot_id')     as orders_col,           -- 1
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'national_orders' and column_name = 'stock_lot_id') as natl_col,        -- 1
  (select count(*) from pg_constraint
    where conname in ('orders_stock_piece_no_money', 'orders_stock_piece_shape',
                      'national_orders_stock_piece_no_money', 'national_orders_stock_piece_shape',
                      'stock_lots_one_source', 'stock_lots_close_shape'))                         as checks,               -- 6
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname in ('stock_lots_order_live', 'stock_lots_nat_live',
                                                  'orders_stock_lot_id_idx', 'national_orders_stock_lot_id_idx')) as indexes, -- 4
  (select count(*) from pg_trigger
    where not tgisinternal and tgenabled = 'O'
      and tgname in ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl'))              as triggers,             -- 3
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('order_pallets', 'stock_natl_delivered', 'stock_is_warehouse', 'stock_raise',
                        'stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl'))           as functions,            -- 7
  (select count(*) from pg_views
    where schemaname = 'public'
      and viewname in ('stock_v_pieces', 'stock_v_lots', 'stock_v_lot_money', 'stock_v_lot_alloc',
                       'stock_v_rt_amounts'))                                                     as views,                -- 5
  (select count(*) from pg_attribute
    where attrelid = 'public.orders_with_derived'::regclass and attnum > 0 and not attisdropped) as owd_cols,             -- 136
  (select count(*) from pg_attribute
    where attrelid = 'public.ct_v_rt_revenue'::regclass and attnum > 0 and not attisdropped)     as revenue_cols;         -- 2

-- The 4 new orders_with_derived columns, in this order. Expected 4 rows:
-- 133 stock_lot_id bigint · 134 own_stock_lot text · 135 stock_lot_order_no bigint · 136 stock_lot_source text
select attnum, attname, format_type(atttypid, atttypmod)
  from pg_attribute
 where attrelid = 'public.orders_with_derived'::regclass and attnum > 132 and not attisdropped
 order by attnum;

-- Trigger order on orders (BEFORE fires alphabetically). Expected: stock_guard_orders LAST of the
-- BEFORE row triggers, after order_leg_depth, order_leg_inherit, orders_invoice_mark_guard.
select tgname from pg_trigger
 where tgrelid = 'public.orders'::regclass and not tgisinternal and (tgtype & 2) = 2   -- BEFORE
 order by tgname;

-- ── V2 — born closed ─────────────────────────────────────────────────────────────────────────────
-- Expected: 0 rows (no anon / authenticated / PUBLIC grant on the table or the 5 views).
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('stock_lots', 'stock_v_pieces', 'stock_v_lots', 'stock_v_lot_money',
                      'stock_v_lot_alloc', 'stock_v_rt_amounts')
   and grantee in ('anon', 'authenticated', 'PUBLIC');

-- Expected: exactly 3 rows — INSERT, SELECT, UPDATE (no DELETE, no TRUNCATE: soft delete only).
select privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'stock_lots' and grantee = 'service_role'
 order by 1;

-- Expected: 0 rows (anon/authenticated cannot execute any of the 7 functions).
select r.rolname, f.fn
  from (values ('anon'), ('authenticated')) r(rolname)
 cross join (values ('public.order_pallets(public.orders)'), ('public.stock_natl_delivered(text, date)'),
                    ('public.stock_is_warehouse(bigint)'), ('public.stock_raise(text, text)'),
                    ('public.stock_guard_lots()'), ('public.stock_guard_orders()'),
                    ('public.stock_guard_natl()')) f(fn)
 where has_function_privilege(r.rolname, f.fn, 'execute');

-- Expected: f | f | t | t (tms_reader sees no money; the auditor reads the amount for S-09).
select has_table_privilege('tms_reader', 'public.stock_v_lot_money', 'select')       as reader_money,
       has_table_privilege('tms_reader', 'public.stock_v_lot_alloc', 'select')       as reader_alloc,
       has_table_privilege('tms_check_runner', 'public.stock_v_lot_money', 'select') as runner_money,
       has_table_privilege('tms_check_runner', 'public.stock_v_lots', 'select')      as runner_lots;

-- Expected: t | 1 row «monitor_read | {tms_check_runner,tms_reader} | SELECT»
select relrowsecurity from pg_class where oid = 'public.stock_lots'::regclass;
select policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename = 'stock_lots';

-- ── V3 — every writer of orders / national_orders can run what the guards call ─────────────────
-- Expected: 1 row per writer role (today: service_role) with all four = t.
select g.grantee,
       has_function_privilege(g.grantee, 'public.order_pallets(public.orders)', 'execute')     as order_pallets,
       has_function_privilege(g.grantee, 'public.stock_natl_delivered(text, date)', 'execute') as natl_delivered,
       has_function_privilege(g.grantee, 'public.stock_is_warehouse(bigint)', 'execute')       as is_warehouse,
       has_function_privilege(g.grantee, 'public.stock_raise(text, text)', 'execute')          as stock_raise
  from (select distinct grantee from information_schema.role_table_grants
         where table_schema = 'public' and table_name in ('orders', 'national_orders')
           and privilege_type = 'UPDATE' and grantee not in ('postgres', 'supabase_admin')) g;

-- ── V4 — ONE pallet expression ───────────────────────────────────────────────────────────────────
-- Expected: 0
select count(*) from public.orders o join public.orders_with_derived d using (id)
 where public.order_pallets(o) <> d.total_pallets;

-- ── V5 — TRIP PnL still reads ─────────────────────────────────────────────────────────────────────
-- Expected: a number (no error), and V0 identical to its pre-057 values.
select count(*) from public.ct_v_rt_pnl;

-- ── V6 — the facade's shapes exist (the Worker reads these columns) ──────────────────────────────
-- Expected: runs, 0 rows (no lot yet).
select id, legacy_id, deleted_at, order_id, client_rec, warehouse_rec, remaining_pallets, complete
  from public.stock_v_lots limit 1;
-- Expected: runs, 1 row, all four NULL.
select stock_lot_id, own_stock_lot, stock_lot_order_no, stock_lot_source
  from public.orders_with_derived limit 1;

-- ── V7 — data ────────────────────────────────────────────────────────────────────────────────────
-- Expected: 4 rows — 92, 414, 424, 885 (92 is the open question of plan §9: owner decides).
select id, name, city, country, type from public.locations
 where type = 'Partner Warehouse' and deleted_at is null order by id;

-- ── V8 — empty start (Ε4: no historical piece is linked) ─────────────────────────────────────────
-- Expected: 0 | 0 | 0
select (select count(*) from public.stock_lots)                                      as lots,
       (select count(*) from public.orders where stock_lot_id is not null)          as intl_pieces,
       (select count(*) from public.national_orders where stock_lot_id is not null) as natl_pieces;

-- ── V9 — money (re-runnable after go-live; every query must return 0 rows) ──────────────────────
-- (a) intake cost = the partner cost ct_v_rt_costs uses (same pick: latest live non-cancelled
--     assignment by id desc). Expected: 0 rows.
select m.lot_id, m.intake_cost, pa.partner_rate
  from public.stock_v_lot_money m
  left join lateral (select pa.partner_rate from public.partner_assignments pa
                      where pa.order_id = m.source_id and pa.deleted_at is null and pa.status <> 'Cancelled'
                      order by pa.id desc limit 1) pa on true
 where m.source_kind = 'intl' and m.intake_cost is distinct from pa.partner_rate;

-- (b) the warehouse partner's RT has margin 0: revenue = its planned partner cost. Only RTs whose
--     ONLY leg is the lot source, and lots without Veroia Switch (a VS lot would also carry the VS
--     charge — plan §9 question 4). Expected: 0 rows.
select m.lot_id, l.rt_id, r.revenue, c.partner_planned
  from public.stock_v_lot_money m
  join public.ct_rt_legs l on l.order_id = m.source_id
  join public.ct_round_trips rt on rt.id = l.rt_id and rt.status <> 'cancelled'
  join public.orders o on o.id = m.source_id
  join public.ct_v_rt_revenue r on r.rt_id = l.rt_id
  join public.ct_v_rt_costs c on c.rt_id = l.rt_id
 where m.source_kind = 'intl' and m.allocation_status = 'ok' and o.veroia_switch is not true
   and (select count(*) from public.ct_rt_legs l2 where l2.rt_id = l.rt_id) = 1
   and r.revenue <> c.partner_planned;

-- (c) every cent of the client price is somewhere: intake cost + Σ pieces + in stock + written off
--     = price. (A sub-cent price or rate would show here — prices are 2-decimal.) Expected: 0 rows.
select m.lot_id, m.price, m.intake_cost, coalesce(sum(a.amount), 0) as pieces_total,
       m.in_stock_amount, m.written_off_amount
  from public.stock_v_lot_money m
  left join public.stock_v_lot_alloc a on a.lot_id = m.lot_id
 where m.allocation_status = 'ok'
 group by m.lot_id, m.price, m.intake_cost, m.in_stock_amount, m.written_off_amount, m.allocated_amount
having m.intake_cost + coalesce(sum(a.amount), 0) + m.in_stock_amount + m.written_off_amount <> m.price
    or coalesce(sum(a.amount), 0) <> m.allocated_amount;

-- (d) what the revenue view reads per lot = intake cost + Σ international pieces. Expected: 0 rows.
select m.lot_id, x.rt_total, m.intake_cost + coalesce(y.pieces_total, 0) as expected
  from public.stock_v_lot_money m
  cross join lateral (select coalesce(sum(s.rt_amount), 0) as rt_total
                        from public.stock_v_rt_amounts s
                       where s.order_id = m.source_id
                          or s.order_id in (select a.piece_id from public.stock_v_lot_alloc a
                                             where a.lot_id = m.lot_id and a.piece_kind = 'intl')) x
  cross join lateral (select sum(a.amount) as pieces_total from public.stock_v_lot_alloc a
                       where a.lot_id = m.lot_id and a.piece_kind = 'intl') y
 where m.source_kind = 'intl' and m.allocation_status = 'ok'
   and x.rt_total <> m.intake_cost + coalesce(y.pieces_total, 0);

-- (e) one revenue row per order at most (a second row would double a leg in ct_v_rt_revenue).
--     Expected: 0 rows.
select order_id, count(*) from public.stock_v_rt_amounts group by order_id having count(*) > 1;
