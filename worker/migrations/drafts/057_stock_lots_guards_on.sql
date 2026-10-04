-- 057 GUARDS ON — the three stock guards back after R1 (057_stock_lots_rollback_r1_guards_off.sql).
-- ONE DO block (lesson 056: the SQL editor is not atomic across statements): the triggers are
-- re-created exactly as 057 §6 creates them, on the guard FUNCTIONS that R1 left in place, and the
-- block proves 3 enabled triggers or rolls back as a whole.
-- When: after the bug that made R1 necessary is fixed (a fix to a guard FUNCTION is its own reviewed
-- migration, run before this file). After 15:00. Re-running it is harmless.
-- Rows written while the guards were off are NOT re-judged here — the auditor's S-01…S-11 show any
-- that break a rule. Expected notice: «GUARDS ON OK: 3 stock_guard triggers enabled». Then S-02 = 0.
do $on$
declare
  v_n int;
begin
  -- CREATE/DROP TRIGGER lock the table: give up after 5 s rather than queue every ORDERS request.
  perform set_config('lock_timeout', '5s', true);
  if to_regprocedure('public.stock_guard_lots()') is null or to_regprocedure('public.stock_guard_orders()') is null
     or to_regprocedure('public.stock_guard_natl()') is null then
    raise exception 'GUARDS ON: a stock_guard function is missing — 057 did not run on this database';
  end if;
  drop trigger if exists stock_guard_lots   on public.stock_lots;
  drop trigger if exists stock_guard_orders on public.orders;
  drop trigger if exists stock_guard_natl   on public.national_orders;
  create trigger stock_guard_lots   before insert or update on public.stock_lots      for each row execute function public.stock_guard_lots();
  create trigger stock_guard_orders before insert or update on public.orders          for each row execute function public.stock_guard_orders();
  create trigger stock_guard_natl   before insert or update on public.national_orders for each row execute function public.stock_guard_natl();
  select count(*) into v_n from pg_trigger
   where not tgisinternal and tgenabled = 'O'
     and tgname in ('stock_guard_lots', 'stock_guard_orders', 'stock_guard_natl');
  if v_n <> 3 then
    raise exception 'GUARDS ON proof: % of 3 stock_guard triggers enabled', v_n;
  end if;
  raise notice 'GUARDS ON OK: 3 stock_guard triggers enabled. S-02 returns to 0 on its next run.';
end
$on$;
