-- 057 VERIFY — SELECT ONLY. Run each query on its own in the SQL editor; the expected value is in
-- the comment above it. Any other value = STOP: no Worker deploy, tell the coordinator.
-- V0 runs BEFORE 057 too (write its four numbers down). V1–V8 right after 057. V9 after the first
-- real lot (and any time later — it must keep returning 0 rows).

-- ── V0 — every round trip's revenue, before and after (no lot exists → identical) ──────────────
-- Expected: the SAME four numbers before and after 057 (since 034 the view splits intl / natl).
select count(*) as rts, sum(revenue) as revenue_total, sum(revenue_intl) as revenue_intl,
       sum(revenue_natl) as revenue_natl
  from public.ct_v_rt_revenue;
-- Stronger: the md5 of every RT's three revenue figures. Expected: the SAME md5 before and after 057.
select md5(string_agg(rt_id::text || '=' || revenue::text || '/' || revenue_intl::text || '/' || revenue_natl::text,
                      ',' order by rt_id)) as revenue_md5
  from public.ct_v_rt_revenue;
-- The two views 057 re-creates must carry NO view options, before and after (round 2, SQL reviewer
-- P3 (5)): 057 §0 refuses to run if either has one (CREATE OR REPLACE would drop it silently), and
-- R2 puts back whatever the revenue view carries when it runs. Expected 2 rows, reloptions NULL:
--   ct_v_rt_revenue | NULL · orders_with_derived | NULL
select c.relname, c.reloptions from pg_class c
 where c.oid in ('public.orders_with_derived'::regclass, 'public.ct_v_rt_revenue'::regclass)
 order by c.relname;

-- ── V1 — objects ─────────────────────────────────────────────────────────────────────────────────
-- Expected: 9 | 1 | 1 | 8 | 4 | 3 | 8 | 5 | 137 | 4 | 1 | 0 | 33
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'stock_lots')                                  as stock_lots_cols,      -- 9 (warehouse_charge, round 2)
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'stock_lot_id')     as orders_col,           -- 1
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'national_orders' and column_name = 'stock_lot_id') as natl_col,        -- 1
  (select count(*) from pg_constraint
    where conname in ('orders_stock_piece_no_money', 'orders_stock_piece_shape',
                      'national_orders_stock_piece_no_money', 'national_orders_stock_piece_shape',
                      'stock_lots_one_source', 'stock_lots_close_shape',
                      'stock_lots_charge_nonneg', 'ct_settings_full_truck_pallets_positive'))    as checks,               -- 8
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname in ('stock_lots_order_live', 'stock_lots_nat_live',
                                                  'orders_stock_lot_id_idx', 'national_orders_stock_lot_id_idx')) as indexes, -- 4
  (select count(*) from pg_trigger
    where not tgisinternal and tgenabled = 'O'
      and tgname in ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl'))              as triggers,             -- 3
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('order_pallets', 'stock_natl_delivered', 'stock_vs_charge', 'stock_raise',
                        'stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl',
                        'orders_group_id_blank_null'))                                           as functions,            -- 8
  (select count(*) from pg_views
    where schemaname = 'public'
      and viewname in ('stock_v_pieces', 'stock_v_lots', 'stock_v_lot_money', 'stock_v_lot_alloc',
                       'stock_v_rt_amounts'))                                                     as views,                -- 5
  (select count(*) from pg_attribute
    where attrelid = 'public.orders_with_derived'::regclass and attnum > 0 and not attisdropped) as owd_cols,             -- 137
  (select count(*) from pg_attribute
    where attrelid = 'public.ct_v_rt_revenue'::regclass and attnum > 0 and not attisdropped)     as revenue_cols,         -- 4 (034)
  (select count(*) from pg_trigger
    where tgrelid = 'public.orders'::regclass and not tgisinternal and tgenabled = 'O'
      and tgname = 'orders_group_id_blank_null')                                                as blank_gid_trigger,    -- 1
  -- a blank Group ID would be ONE group for the round-trip engine (057 header, WHAT)
  (select count(*) from public.orders where group_id is not null and btrim(group_id) = '')      as blank_group_ids,      -- 0
  -- F of OWNER-Q3 answered 4/10 (VS on piece prorated /F) — 057's one data change
  (select value from public.ct_settings where key = 'full_truck_pallets')                        as full_truck_pallets;   -- 33

-- The 5 new orders_with_derived columns, in this order. Expected 5 rows:
-- 133 stock_lot_id bigint · 134 own_stock_lot text · 135 stock_lot_order_no bigint · 136 stock_lot_source text
-- · 137 stock_lot_reference text (round 1: the lot source's Reference for the piece's driver sheet)
select attnum, attname, format_type(atttypid, atttypmod)
  from pg_attribute
 where attrelid = 'public.orders_with_derived'::regclass and attnum > 132 and not attisdropped
 order by attnum;

-- The round-0 rules of the impact map, the round-1 rules of the critics and the round-2 rules (4/10)
-- are in the guard functions that ran. Expected 3 rows:
--   stock_guard_lots   | t | t | f | f | t | f | t | t | f
--   stock_guard_natl   | f | t | t | t | f | t | f | t | f
--   stock_guard_orders | t | t | t | t | t | t | f | t | f
select p.proname,
       p.prosrc like '%''lot_grouped''%'    as lot_grouped,      -- B-16
       p.prosrc like '%''lot_vs''%'         as lot_vs,           -- C-15, OWNER-Q1 answered 4/10 (no VS on a lot)
       p.prosrc like '%''piece_no_truck''%' as piece_no_truck,   -- C-05
       p.prosrc like '%δεν ακυρώνεται%'     as lot_no_cancel,    -- E-04
       p.prosrc like '%rotation_id%'        as lot_rota,         -- round 1 Σ-05
       p.prosrc like '%η κατάσταση του κομματιού δεν αλλάζει%' as status_frozen, -- round 1 Σ-08
       p.prosrc like '%new.warehouse_charge is distinct from old.warehouse_charge%' as charge_frozen, -- round 2, lot_invoiced
       p.prosrc like '%''lot_no_dest''%'    as lot_no_dest,      -- round 2, OWNER-Q5 answered 4/10
       p.prosrc like '%warehouse_rule%'     as warehouse_rule    -- gone (OWNER-Q5): f everywhere
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl')
 order by p.proname;

-- B-54 (auditor trigger inventory) moved WITH the four new triggers (057 header). Expected:
-- <> | N | N with N = the value 057's NOTICE printed (31 on 4/10's database: 27 + 4).
-- (after R1 of the rollback: <> | N | N−3 — red on purpose until GUARDS ON).
select c.red_op, c.red_value,
       (select count(*) from pg_trigger t join pg_class cl on cl.oid = t.tgrelid
          join pg_namespace n on n.oid = cl.relnamespace
         where not t.tgisinternal and t.tgenabled <> 'D' and n.nspname = 'public') as triggers_now
  from monitoring.checks c where c.id = 'B-54';

-- Trigger order on orders (BEFORE fires alphabetically). Expected 5 rows: order_leg_depth,
-- order_leg_inherit, orders_group_id_blank_null, orders_invoice_mark_guard, stock_guard_orders (LAST).
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

-- The identity sequence of stock_lots is born closed too (round 1b, SQL reviewer P3-1; objects made by
-- supabase_admin get anon/authenticated rwU on sequences by default). Expected: f | f | t
-- (service_role is untouched — an identity insert never needs it, but nothing was taken from it).
select has_sequence_privilege('anon', 'public.stock_lots_id_seq', 'usage, select, update')          as anon_seq,
       has_sequence_privilege('authenticated', 'public.stock_lots_id_seq', 'usage, select, update') as authenticated_seq,
       has_sequence_privilege('service_role', 'public.stock_lots_id_seq', 'usage')                  as service_role_seq;

-- Expected: exactly 3 rows — INSERT, SELECT, UPDATE (no DELETE, no TRUNCATE: soft delete only).
select privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'stock_lots' and grantee = 'service_role'
 order by 1;

-- Expected: 0 rows (anon / authenticated cannot execute any of the 8 functions).
select r.rolname, f.fn
  from (values ('anon'), ('authenticated')) r(rolname)
 cross join (values ('public.order_pallets(public.orders)'), ('public.stock_natl_delivered(text, date)'),
                    ('public.stock_vs_charge(numeric, numeric)'), ('public.stock_raise(text, text)'),
                    ('public.stock_guard_lots()'), ('public.stock_guard_orders()'),
                    ('public.stock_guard_natl()'), ('public.orders_group_id_blank_null()')) f(fn)
 where has_function_privilege(r.rolname, f.fn, 'execute');

-- Expected: f | f | t | t (tms_reader sees no money; the auditor reads the amount for S-09).
select has_table_privilege('tms_reader', 'public.stock_v_lot_money', 'select')       as reader_money,
       has_table_privilege('tms_reader', 'public.stock_v_lot_alloc', 'select')       as reader_alloc,
       has_table_privilege('tms_check_runner', 'public.stock_v_lot_money', 'select') as runner_money,
       has_table_privilege('tms_check_runner', 'public.stock_v_lots', 'select')      as runner_lots;
-- The lot's own money column (round 2, Ε1): tms_reader reads every column of stock_lots EXCEPT
-- warehouse_charge; the auditor reads all. Expected: f | t | t | t | t | f
select has_column_privilege('tms_reader', 'public.stock_lots', 'warehouse_charge', 'select')       as reader_charge,
       has_column_privilege('tms_check_runner', 'public.stock_lots', 'warehouse_charge', 'select') as runner_charge,
       has_column_privilege('tms_reader', 'public.stock_lots', 'id', 'select')                     as reader_id,
       has_column_privilege('tms_reader', 'public.stock_lots', 'legacy_id', 'select')              as reader_legacy_id,
       has_column_privilege('tms_reader', 'public.stock_lots', 'closed_at', 'select')              as reader_closed_at,
       has_table_privilege('tms_reader', 'public.stock_lots', 'select')                            as reader_whole_table;
-- Expected: t (the only reader of ct_v_rt_revenue can run the VS function it calls).
select has_function_privilege('service_role', 'public.stock_vs_charge(numeric, numeric)', 'execute') as service_role_vs;

-- Expected: t | 1 row «monitor_read | {tms_check_runner,tms_reader} | SELECT»
select relrowsecurity from pg_class where oid = 'public.stock_lots'::regclass;
select policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename = 'stock_lots';

-- ── V3 — every writer of orders / national_orders can run what the guards call ─────────────────
-- Expected: 1 row per writer role (today: service_role) with all three = t.
select g.grantee,
       has_function_privilege(g.grantee, 'public.order_pallets(public.orders)', 'execute')     as order_pallets,
       has_function_privilege(g.grantee, 'public.stock_natl_delivered(text, date)', 'execute') as natl_delivered,
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
-- Expected: runs, 0 rows (no lot yet). pieces_moving = facade «Pieces Moving» (round 1 D3).
select id, legacy_id, deleted_at, order_id, client_rec, warehouse_rec, remaining_pallets, complete, pieces_moving
  from public.stock_v_lots limit 1;
-- Expected: runs, 1 row, all five NULL. stock_lot_reference = facade «Stock Lot Reference».
select stock_lot_id, own_stock_lot, stock_lot_order_no, stock_lot_source, stock_lot_reference
  from public.orders_with_derived limit 1;

-- ── V7 — data ────────────────────────────────────────────────────────────────────────────────────
-- 057 changes no existing row (OWNER-Q5 answered 4/10 (any location can be a warehouse): no
-- location is typed any more). Its one new row (OWNER-Q3) — Expected: 1 row «full_truck_pallets | 33».
select key, value from public.ct_settings where key = 'full_truck_pallets';

-- ── V8 — empty start (Ε4: no historical piece is linked) ─────────────────────────────────────────
-- Expected: 0 | 0 | 0
select (select count(*) from public.stock_lots)                                      as lots,
       (select count(*) from public.orders where stock_lot_id is not null)          as intl_pieces,
       (select count(*) from public.national_orders where stock_lot_id is not null) as natl_pieces;

-- ── V9 — money (re-runnable after go-live; every query must return 0 rows) ──────────────────────
-- (a) partner_cost = the partner cost ct_v_rt_costs uses (same pick: latest live non-cancelled
--     assignment by id desc — re-read against 034's ct_v_rt_costs, md5 3349bcf0…: its «planned»
--     takes exactly this pick for every order carried by an RT leg; the split-sibling and national
--     branches it added never apply to a lot source, which has no legs). And charge_total = partner
--     cost + warehouse charge, NULL only when neither was entered (round 2). Expected: 0 rows.
select m.lot_id, m.partner_cost, pa.partner_rate, m.warehouse_charge, m.charge_total
  from public.stock_v_lot_money m
  left join lateral (select pa.partner_rate from public.partner_assignments pa
                      where pa.order_id = m.source_id and pa.deleted_at is null and pa.status <> 'Cancelled'
                      order by pa.id desc limit 1) pa on true
 where (m.source_kind = 'intl' and m.partner_cost is distinct from pa.partner_rate)
    or m.charge_total is distinct from case when m.partner_cost is null and m.warehouse_charge is null then null
                                            else coalesce(m.partner_cost, 0) + coalesce(m.warehouse_charge, 0) end;

-- (b) the RT that carried the lot in earns exactly coalesce(partner cost, 0): a partner's RT has
--     margin 0 (revenue = its planned partner cost), our own truck earns 0 (owner 4/10 «μόνο τα
--     κομμάτια»); the warehouse charge is in no RT. Only RTs whose ONLY leg is the lot source (a lot
--     never has VS — OWNER-Q1 answered 4/10 (no VS on a lot)). Since 034 the revenue is split: the
--     lot's amount must sit in revenue_intl, never in revenue_natl. Expected: 0 rows.
select m.lot_id, l.rt_id, m.partner_cost, r.revenue, r.revenue_intl, r.revenue_natl, c.partner_planned
  from public.stock_v_lot_money m
  join public.ct_rt_legs l on l.order_id = m.source_id
  join public.ct_round_trips rt on rt.id = l.rt_id and rt.status <> 'cancelled'
  join public.ct_v_rt_revenue r on r.rt_id = l.rt_id
  join public.ct_v_rt_costs c on c.rt_id = l.rt_id
 where m.source_kind = 'intl' and m.allocation_status = 'ok'
   and (select count(*) from public.ct_rt_legs l2 where l2.rt_id = l.rt_id) = 1
   and (r.revenue <> coalesce(m.partner_cost, 0)
        or (m.partner_cost is not null and r.revenue <> c.partner_planned)
        or r.revenue_natl <> 0 or r.revenue_intl <> r.revenue);

-- (c) every cent of the client price is somewhere: charge (partner cost + warehouse charge) + Σ
--     pieces + in stock + written off = price. (A sub-cent price or rate would show here — prices
--     are 2-decimal.) Expected: 0 rows.
select m.lot_id, m.price, m.charge_total, coalesce(sum(a.amount), 0) as pieces_total,
       m.in_stock_amount, m.written_off_amount
  from public.stock_v_lot_money m
  left join public.stock_v_lot_alloc a on a.lot_id = m.lot_id
 where m.allocation_status = 'ok'
 group by m.lot_id, m.price, m.charge_total, m.in_stock_amount, m.written_off_amount, m.allocated_amount
having m.charge_total + coalesce(sum(a.amount), 0) + m.in_stock_amount + m.written_off_amount <> m.price
    or coalesce(sum(a.amount), 0) <> m.allocated_amount;

-- (d) what the revenue view reads per lot = coalesce(partner cost, 0) + Σ international pieces.
--     Expected: 0 rows.
select m.lot_id, x.rt_total, coalesce(m.partner_cost, 0) + coalesce(y.pieces_total, 0) as expected
  from public.stock_v_lot_money m
  cross join lateral (select coalesce(sum(s.rt_amount), 0) as rt_total
                        from public.stock_v_rt_amounts s
                       where s.order_id = m.source_id
                          or s.order_id in (select a.piece_id from public.stock_v_lot_alloc a
                                             where a.lot_id = m.lot_id and a.piece_kind = 'intl')) x
  cross join lateral (select sum(a.amount) as pieces_total from public.stock_v_lot_alloc a
                       where a.lot_id = m.lot_id and a.piece_kind = 'intl') y
 where m.source_kind = 'intl' and m.allocation_status = 'ok'
   and x.rt_total <> coalesce(m.partner_cost, 0) + coalesce(y.pieces_total, 0);

-- (e) one revenue row per order at most (a second row would double a leg in ct_v_rt_revenue).
--     Expected: 0 rows.
select order_id, count(*) from public.stock_v_rt_amounts group by order_id having count(*) > 1;
