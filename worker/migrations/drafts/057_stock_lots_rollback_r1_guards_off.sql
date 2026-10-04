-- 057 ROLLBACK R1 — the three stock guards OFF. This file holds ONE DO block on purpose: the SQL
-- editor runs the whole file when nothing is selected, so a rollback file must never hold a second
-- action (R2 lives in 057_stock_lots_rollback_r2_revenue.sql, the way back in 057_stock_lots_guards_on.sql).
-- Never drop columns, tables or views: orders_with_derived reads stock_lots, and breaking it takes
-- down every ORDERS read of the app. The screens have their own kill switch: FEATURES.STOCK_LOTS=false
-- in config.js (front deploy) hides every stock entry point without touching the database.

-- ── R1 — guards off ──────────────────────────────────────────────────────────────────────────────
-- When: a guard bug blocks ordinary work (e.g. 06:00, saves of orders refused). Effect: the three
-- triggers go; the six CHECKs STAY (they only bite rows with stock_lot_id, i.e. pieces), and so does
-- the blank group_id normaliser (it protects the round-trip engine, not the stock rules). The
-- auditor's S-02 turns red on purpose until 057_stock_lots_guards_on.sql brings the guards back.
-- B-54 (trigger inventory, P1 hourly) is LEFT at the value 057 set (31 if 057 ran on 4/10's
-- database) on purpose: with the three guards gone it reads 3 less and turns red together with
-- S-02 — «guards off» must be loud on both checks, never a quiet state anyone forgets. Do not lower
-- B-54 here; GUARDS ON brings the count back to it.
do $r1$
declare
  v_n int;
begin
  -- DROP TRIGGER locks the table: give up after 5 s rather than queue every ORDERS request behind it.
  perform set_config('lock_timeout', '5s', true);
  drop trigger if exists stock_guard_orders on public.orders;
  drop trigger if exists stock_guard_natl   on public.national_orders;
  drop trigger if exists stock_guard_lots   on public.stock_lots;
  select count(*) into v_n from pg_trigger
   where not tgisinternal and tgname in ('stock_guard_orders', 'stock_guard_natl', 'stock_guard_lots');
  if v_n <> 0 then
    raise exception 'R1 proof: % stock_guard trigger(s) still present', v_n;
  end if;
  raise notice 'R1 OK: 0 stock_guard triggers. CHECKs untouched. S-02 and B-54 (3 triggers short) report this until 057_stock_lots_guards_on.sql runs.';
end
$r1$;
