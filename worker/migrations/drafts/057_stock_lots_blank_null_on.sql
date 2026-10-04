-- 057 BLANK NULL ON — the blank group_id normaliser back after R3
-- (057_stock_lots_rollback_r3_blank_null_off.sql). Round 2, SQL reviewer P3 (2): R3 had a way off
-- and only a hand-copied CREATE TRIGGER as its way back — a statement typed from a header comment is
-- exactly the kind of step that half-runs in a non-atomic editor. ONE DO block (lesson 056): the
-- trigger is re-created exactly as 057 §6 creates it, on the function R3 left in place, and the block
-- proves it or rolls back as a whole.
-- When: after the reason R3 ran is fixed. After 15:00. Re-running it is harmless.
-- What it does NOT do: repair the blank Group IDs written while R3 was in force. Turning them into
-- NULL here would re-fire rt_link_split on live round trips (the same reason 057 §0 refuses to run
-- over blanks) — their round trips may already be joined the wrong way, and the owner looks at those
-- orders first. The NOTICE counts them and lists up to 20; 057_stock_lots_verify.sql V1
-- «blank_group_ids» keeps showing them. The next save of such an order through the app re-sends
-- Group ID and the trigger stores it as NULL from then on.
-- B-54 (trigger inventory): R3 left its red_value at the post-057 count, so with the trigger back it
-- reads green again with nothing edited (unless R1 is also in force — then 3 short, red on purpose).
-- Expected notice: «BLANK NULL ON OK: orders_group_id_blank_null enabled, as 057 §6 …».
do $on3$
declare
  v_n    int;
  v_def  text;
  v_ids  text;
begin
  perform set_config('search_path', 'public', true);   -- deparse context of the definition proof below
  -- CREATE/DROP TRIGGER lock orders: give up after 5 s rather than queue every ORDERS request.
  perform set_config('lock_timeout', '5s', true);
  if to_regprocedure('public.orders_group_id_blank_null()') is null then
    raise exception 'BLANK NULL ON: function orders_group_id_blank_null() is missing — 057 did not run on this database';
  end if;
  drop trigger if exists orders_group_id_blank_null on public.orders;
  create trigger orders_group_id_blank_null before insert or update of group_id on public.orders
    for each row when (new.group_id is not null and btrim(new.group_id) = '')
    execute function public.orders_group_id_blank_null();
  -- Proof: exactly one, enabled, and the SAME definition 057 §6 creates (measured on 057's output,
  -- PostgreSQL 17 deparse with search_path public) — not merely «a trigger with that name».
  select count(*) into v_n from pg_trigger
   where tgrelid = 'public.orders'::regclass and not tgisinternal and tgenabled = 'O'
     and tgname = 'orders_group_id_blank_null';
  if v_n <> 1 then
    raise exception 'BLANK NULL ON proof: % enabled orders_group_id_blank_null trigger(s), expected 1', v_n;
  end if;
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'public.orders'::regclass and t.tgname = 'orders_group_id_blank_null';
  if v_def is distinct from 'CREATE TRIGGER orders_group_id_blank_null BEFORE INSERT OR UPDATE OF group_id ON public.orders FOR EACH ROW WHEN (((new.group_id IS NOT NULL) AND (btrim(new.group_id) = ''''::text))) EXECUTE FUNCTION orders_group_id_blank_null()' then
    raise exception 'BLANK NULL ON proof: the trigger is not the one 057 §6 creates: %', v_def;
  end if;
  select string_agg(x.id::text, ', ' order by x.id) into v_ids
    from (select o.id from public.orders o
           where o.group_id is not null and btrim(o.group_id) = '' order by o.id limit 20) x;
  select count(*) into v_n from public.orders o where o.group_id is not null and btrim(o.group_id) = '';
  raise notice 'BLANK NULL ON OK: orders_group_id_blank_null enabled, as 057 §6 creates it. % order(s) still carry a blank Group ID written while R3 was in force — NOT repaired here (owner looks at their round trips first)%',
    v_n, case when v_n > 0 then ': ' || v_ids else '' end;
end
$on3$;
