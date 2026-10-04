-- 057 ROLLBACK R3 — the blank group_id normaliser OFF (trigger orders_group_id_blank_null). This file
-- holds ONE DO block on purpose: the SQL editor runs the whole file when nothing is selected, so a
-- rollback file must never hold a second action (R1 guards off, R2 revenue and GUARDS ON live in
-- their own files). Never drop columns, tables or views: orders_with_derived reads stock_lots, and
-- breaking it takes down every ORDERS read of the app.

-- ── R3 — a blank Group ID is stored as written again ─────────────────────────────────────────────
-- When: ONLY if the normaliser itself is the problem — a save of orders fails inside
-- orders_group_id_blank_null, or a flow turns out to need a blank Group ID stored as '' instead of
-- NULL (round 1b, SQL reviewer P3-6: the normaliser had no way off of its own). It is NOT a stock
-- guard: a stock-rule bug is R1's job, and R1 leaves the normaliser in place.
-- Effect: the trigger goes, its FUNCTION stays. From then on «Επιστροφή στο απόθεμα» / «Ακύρωση
-- groupage» store Group ID '' again, and the round-trip walks of 033/037 («n.group_id =
-- cur.group_id») read every '' order as ONE group — two orders returned on the same truck weeks
-- apart can be merged into one round trip (057 header, WHAT). While R3 is in force, watch
-- 057_stock_lots_verify.sql V1 «blank_group_ids».
-- B-54 (trigger inventory, P1 hourly) is LEFT at the value 057 set (31 if 057 ran on 4/10's
-- database) on purpose: with the normaliser gone it reads ONE less (30) and turns red — the INTENDED
-- signal that the normaliser is off, never a quiet state anyone forgets. Do not lower B-54 here.
-- (R1 and R3 together read four less.)
-- Way back: the one CREATE TRIGGER orders_group_id_blank_null statement of 057 §6 (the function is
-- still there); B-54 is green again with nothing edited. After 15:00, like every step here.
-- Expected notice: «R3 OK: 0 orders_group_id_blank_null triggers …». Re-running it is harmless.
do $r3$
declare
  v_n int;
begin
  -- DROP TRIGGER locks orders: give up after 5 s rather than queue every ORDERS request behind it.
  perform set_config('lock_timeout', '5s', true);
  drop trigger if exists orders_group_id_blank_null on public.orders;
  select count(*) into v_n from pg_trigger
   where not tgisinternal and tgname = 'orders_group_id_blank_null';
  if v_n <> 0 then
    raise exception 'R3 proof: % orders_group_id_blank_null trigger(s) still present', v_n;
  end if;
  raise notice 'R3 OK: 0 orders_group_id_blank_null triggers. Function kept, stock guards untouched. B-54 reads one short (red on purpose) until the trigger is back.';
end
$r3$;
