-- 013 — Round-trip sync (owner 5/9/2026)
--
-- «Αν τα round trips δεν ενημερώνονται, είναι πρόβλημα. Αν η μισθοδοσία δεν
-- ενημερώνεται, είναι πρόβλημα. Η καρτέλα του φορτηγού… Το sync είναι ένα από
-- τα πιο σημαντικά πράγματα στο application.»
--
-- The rule lives in the database (αρχή 4) so it catches EVERY path — the order
-- form, the Weekly, an assignment popover, a future screen, a manual fix:
--
--   order  ──► round trip ──► sibling orders of the same round trip
--   round trip ──► its orders            (an RT edited through /costs/rt)
--   round trip ──► driver ledger          (existing trigger dl_sync_from_rt, unchanged)
--
-- One truck, one driver, one partner for the whole round trip (owner 5/9): a
-- change on any leg is the truth for all legs. The window (date_start/date_end)
-- is always first loading → last real delivery over the live legs. A deleted or
-- cancelled order leaves its round trip; a round trip with no leg left is
-- cancelled (and the ledger learns it through dl_sync_from_rt).
--
-- Every change the rule makes is written to audit_log with actor
-- «trigger:rt_sync», the same shape the Worker writes (αρχή 1: nothing silent).
--
-- Measured before (5/9): RT-1014 carried a different driver and truck from both
-- of its orders; 24/50 round trips ended before their real last delivery.
-- National-load legs (nat_load_id) are not synced yet — N4.
--
-- Loop safety: every trigger fires only WHEN a value actually changed, and every
-- cascading UPDATE touches rows only where the value differs, so a cascade ends
-- after one round (A→RT→B, then B→RT finds nothing to change).

begin;

-- 1. An OPEN round trip may lose its truck (an order unassigned in the Weekly);
--    a closed/complete one may not — that would rewrite history silently and the
--    update fails loudly instead.
alter table ct_round_trips drop constraint if exists owned_needs_truck;
alter table ct_round_trips add constraint owned_needs_truck
  check (trip_type <> 'OWNED' or truck_id is not null or status not in ('closed', 'complete'));

-- 2. Audit row, same columns the Worker's audit() writes.
create or replace function rt_sync_audit(p_action text, p_table text, p_id text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  values ('trigger:rt_sync', 'system', p_action, p_table, p_id, p_before, p_after, now());
$$;

-- 3. Window from the live legs; cancel when no leg is left.
create or replace function rt_recompute(p_rt bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r ct_round_trips%rowtype; n int; d1 date; d2 date;
begin
  select * into r from ct_round_trips where id = p_rt;
  if r.id is null or r.status = 'cancelled' then return; end if;

  select count(*),
         min(coalesce(o.loading_datetime, nl.loading_datetime)::date),
         max(coalesce(o.actual_delivery_date, nl.actual_delivery_date,
                      o.delivery_datetime::date, nl.delivery_datetime::date))
    into n, d1, d2
  from ct_rt_legs l
  left join orders o          on o.id  = l.order_id
  left join national_loads nl on nl.id = l.nat_load_id
  where l.rt_id = p_rt;

  if n = 0 then
    update ct_round_trips
       set status = 'cancelled',
           notes = concat_ws(' · ', notes, 'ακυρώθηκε αυτόματα ' || to_char(now(), 'DD/MM/YYYY') || ': καμία ζωντανή παραγγελία'),
           updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status), jsonb_build_object('status', 'cancelled', 'reason', 'no live legs'));
    return;
  end if;

  if d1 is not null and (r.date_start <> d1 or r.date_end is distinct from greatest(d2, d1)) then
    update ct_round_trips set date_start = d1, date_end = greatest(d2, d1), updated_at = now() where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('date_start', r.date_start, 'date_end', r.date_end),
      jsonb_build_object('date_start', d1, 'date_end', greatest(d2, d1)));
  end if;
end $$;

-- 4. order → round trip → sibling orders
create or replace function rt_sync_from_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare leg record; rt ct_round_trips%rowtype; sib record; new_type text;
begin
  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;

  for leg in
    select l.id, l.rt_id from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
    where l.order_id = new.id and r.status <> 'cancelled'
  loop
    -- a dead order leaves its round trip
    if new.deleted_at is not null or new.status = 'Cancelled' then
      delete from ct_rt_legs where id = leg.id;
      perform rt_sync_audit('delete', 'ct_rt_legs', leg.id::text,
        jsonb_build_object('rt_id', leg.rt_id, 'order_id', new.id), null);
      perform rt_recompute(leg.rt_id);
      continue;
    end if;

    select * into rt from ct_round_trips where id = leg.rt_id;
    if rt.driver_id  is distinct from new.driver_id  or rt.truck_id   is distinct from new.truck_id
    or rt.trailer_id is distinct from new.trailer_id or rt.partner_id is distinct from new.partner_id
    or rt.trip_type <> new_type then
      update ct_round_trips
         set driver_id = new.driver_id, truck_id = new.truck_id, trailer_id = new.trailer_id,
             partner_id = new.partner_id, trip_type = new_type, updated_at = now()
       where id = rt.id;
      perform rt_sync_audit('update', 'ct_round_trips', rt.id::text,
        jsonb_build_object('driver_id', rt.driver_id, 'truck_id', rt.truck_id, 'trailer_id', rt.trailer_id,
                           'partner_id', rt.partner_id, 'trip_type', rt.trip_type),
        jsonb_build_object('driver_id', new.driver_id, 'truck_id', new.truck_id, 'trailer_id', new.trailer_id,
                           'partner_id', new.partner_id, 'trip_type', new_type, 'source_order', new.id));
    end if;

    -- siblings follow: one truck, one driver for the whole round trip
    for sib in
      select o.id, o.driver_id, o.truck_id, o.trailer_id, o.partner_id, o.is_partner_trip
      from ct_rt_legs l join orders o on o.id = l.order_id
      where l.rt_id = leg.rt_id and o.id <> new.id and o.deleted_at is null
        and (o.driver_id  is distinct from new.driver_id  or o.truck_id   is distinct from new.truck_id
          or o.trailer_id is distinct from new.trailer_id or o.partner_id is distinct from new.partner_id
          or coalesce(o.is_partner_trip, false) <> coalesce(new.is_partner_trip, false))
    loop
      update orders
         set driver_id = new.driver_id, truck_id = new.truck_id, trailer_id = new.trailer_id,
             partner_id = new.partner_id, is_partner_trip = coalesce(new.is_partner_trip, false)
       where id = sib.id;
      perform rt_sync_audit('update', 'orders', sib.id::text,
        to_jsonb(sib) - 'id',
        jsonb_build_object('driver_id', new.driver_id, 'truck_id', new.truck_id, 'trailer_id', new.trailer_id,
                           'partner_id', new.partner_id, 'is_partner_trip', coalesce(new.is_partner_trip, false),
                           'source_order', new.id, 'rt_id', leg.rt_id));
    end loop;

    perform rt_recompute(leg.rt_id);
  end loop;
  return null;
end $$;

drop trigger if exists rt_sync_from_order on orders;
create trigger rt_sync_from_order
  after update of driver_id, truck_id, trailer_id, partner_id, is_partner_trip,
                  loading_datetime, delivery_datetime, actual_delivery_date, deleted_at, status
  on orders for each row
  when (old.driver_id  is distinct from new.driver_id  or old.truck_id   is distinct from new.truck_id
     or old.trailer_id is distinct from new.trailer_id or old.partner_id is distinct from new.partner_id
     or old.is_partner_trip is distinct from new.is_partner_trip
     or old.loading_datetime is distinct from new.loading_datetime
     or old.delivery_datetime is distinct from new.delivery_datetime
     or old.actual_delivery_date is distinct from new.actual_delivery_date
     or old.deleted_at is distinct from new.deleted_at or old.status is distinct from new.status)
  execute function rt_sync_from_order();

-- 5. round trip → its orders (an RT changed through /costs/rt or by hand)
create or replace function rt_sync_to_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare sib record; is_partner boolean;
begin
  if new.status = 'cancelled' then return null; end if;
  is_partner := new.trip_type = 'PARTNER';
  for sib in
    select o.id, o.driver_id, o.truck_id, o.trailer_id, o.partner_id, o.is_partner_trip
    from ct_rt_legs l join orders o on o.id = l.order_id
    where l.rt_id = new.id and o.deleted_at is null
      and (o.driver_id  is distinct from new.driver_id  or o.truck_id   is distinct from new.truck_id
        or o.trailer_id is distinct from new.trailer_id or o.partner_id is distinct from new.partner_id
        or coalesce(o.is_partner_trip, false) <> is_partner)
  loop
    update orders
       set driver_id = new.driver_id, truck_id = new.truck_id, trailer_id = new.trailer_id,
           partner_id = new.partner_id, is_partner_trip = is_partner
     where id = sib.id;
    perform rt_sync_audit('update', 'orders', sib.id::text,
      to_jsonb(sib) - 'id',
      jsonb_build_object('driver_id', new.driver_id, 'truck_id', new.truck_id, 'trailer_id', new.trailer_id,
                         'partner_id', new.partner_id, 'is_partner_trip', is_partner, 'source_rt', new.id));
  end loop;
  return null;
end $$;

drop trigger if exists rt_sync_to_orders on ct_round_trips;
create trigger rt_sync_to_orders
  after update of driver_id, truck_id, trailer_id, partner_id, trip_type
  on ct_round_trips for each row
  when (old.driver_id  is distinct from new.driver_id  or old.truck_id   is distinct from new.truck_id
     or old.trailer_id is distinct from new.trailer_id or old.partner_id is distinct from new.partner_id
     or old.trip_type is distinct from new.trip_type)
  execute function rt_sync_to_orders();

-- 6. A leg attached (POST /costs/rt attach) or detached (DELETE …/legs):
--    the window follows, and on attach the order inherits the round trip's
--    vehicle when it has none — or gives its own when the round trip has none.
create or replace function rt_sync_legs() returns trigger
language plpgsql security definer set search_path = public as $$
declare rt ct_round_trips%rowtype; o orders%rowtype;
begin
  if tg_op = 'DELETE' then
    perform rt_recompute(old.rt_id);
    return null;
  end if;
  if new.order_id is not null then
    select * into rt from ct_round_trips where id = new.rt_id;
    select * into o  from orders where id = new.order_id;
    if rt.truck_id is null and rt.driver_id is null and (o.truck_id is not null or o.driver_id is not null) then
      -- the order brings the vehicle; the RT trigger then passes it to the siblings
      update ct_round_trips
         set driver_id = o.driver_id, truck_id = o.truck_id, trailer_id = o.trailer_id,
             partner_id = o.partner_id,
             trip_type = case when coalesce(o.is_partner_trip, false) then 'PARTNER' else 'OWNED' end,
             updated_at = now()
       where id = rt.id;
    elsif (rt.truck_id is not null or rt.driver_id is not null)
      and (o.driver_id is distinct from rt.driver_id or o.truck_id is distinct from rt.truck_id
        or o.trailer_id is distinct from rt.trailer_id or o.partner_id is distinct from rt.partner_id) then
      update orders
         set driver_id = rt.driver_id, truck_id = rt.truck_id, trailer_id = rt.trailer_id,
             partner_id = rt.partner_id, is_partner_trip = (rt.trip_type = 'PARTNER')
       where id = o.id;
      perform rt_sync_audit('update', 'orders', o.id::text,
        jsonb_build_object('driver_id', o.driver_id, 'truck_id', o.truck_id, 'trailer_id', o.trailer_id, 'partner_id', o.partner_id),
        jsonb_build_object('driver_id', rt.driver_id, 'truck_id', rt.truck_id, 'trailer_id', rt.trailer_id,
                           'partner_id', rt.partner_id, 'source_rt', rt.id, 'reason', 'leg attached'));
    end if;
  end if;
  perform rt_recompute(new.rt_id);
  return null;
end $$;

drop trigger if exists rt_sync_legs on ct_rt_legs;
create trigger rt_sync_legs after insert or delete on ct_rt_legs
  for each row execute function rt_sync_legs();

-- 7. Backfill: today's round trips take the truth from their orders (the legs
--    of every live RT agree with each other — measured 5/9), then the window.
do $$
declare r record;
begin
  for r in
    select distinct on (rt.id) rt.id, o.driver_id, o.truck_id, o.trailer_id, o.partner_id, o.is_partner_trip
    from ct_round_trips rt
    join ct_rt_legs l on l.rt_id = rt.id
    join orders o on o.id = l.order_id and o.deleted_at is null
    where rt.status <> 'cancelled'
    order by rt.id, l.id
  loop
    update ct_round_trips
       set driver_id = r.driver_id, truck_id = r.truck_id, trailer_id = r.trailer_id, partner_id = r.partner_id,
           trip_type = case when coalesce(r.is_partner_trip, false) then 'PARTNER' else 'OWNED' end,
           updated_at = now()
     where id = r.id
       and (driver_id is distinct from r.driver_id or truck_id is distinct from r.truck_id
         or trailer_id is distinct from r.trailer_id or partner_id is distinct from r.partner_id);
    perform rt_recompute(r.id);
  end loop;
end $$;

commit;

-- Proof (expect 0 / 0 / 0 / 0):
-- with x as (
--   select r.id, r.driver_id, r.truck_id, r.trailer_id, r.date_start, r.date_end,
--          o.driver_id o_driver, o.truck_id o_truck, o.trailer_id o_trailer,
--          o.loading_datetime::date load_d, coalesce(o.actual_delivery_date, o.delivery_datetime::date) deliv_d
--   from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id join orders o on o.id = l.order_id
--   where r.status <> 'cancelled')
-- select count(*) filter (where o_driver is distinct from driver_id) driver_differs,
--        count(*) filter (where o_truck  is distinct from truck_id)  truck_differs,
--        count(*) filter (where o_trailer is distinct from trailer_id) trailer_differs,
--        (select count(*) from (select id, date_start, date_end, min(load_d) mn, max(deliv_d) mx from x group by 1,2,3) y
--           where date_start <> mn or date_end is distinct from greatest(mx, mn)) rts_dates_differ
-- from x;
--
-- Dry run of the cascade without leaving a trace (run, read, ROLLBACK):
-- begin;
--   update orders set driver_id = <other driver id> where id = <an order of a two-leg RT>;
--   select id, driver_id from orders where id in (<that order>, <its sibling>);
--   select code, driver_id, date_start, date_end from ct_round_trips where id = <rt>;
--   select driver_id, entry_date, date_end, needs_review from dl_entries where rt_id = <rt> and deleted_at is null;
--   select action, table_name, record_id from audit_log where actor = 'trigger:rt_sync' order by id desc limit 5;
-- rollback;
