-- 020 — Parent order ↔ legs stay one truth (owner 7/9/2026)
--
-- «Το φορτίο, μόλις πάσεις σε σκέλος, δεν αλλάζουν οι αρχικές του πληροφορίες…
-- υπάρχει sync.» The parent is the source for the COMMERCIAL facts (client,
-- reference, goods, pallets, temperature, first loading, final delivery); the
-- legs are the source for EXECUTION (assignment, hand-over point, leg dates).
-- Rules live here so every screen — order form, Weekly, a fix by hand —
-- keeps them together (αρχή 4). Every write is audited (actor trigger:order_legs).
--
--   parent ──► legs : client, reference, goods, temperature, pallet type/exchange,
--                     refrigerator mode, pallets (both legs carry the full load),
--                     loading location+datetime → leg 1, last unloading
--                     location+delivery datetime → last leg
--   legs   ──► parent: loading datetime (leg 1), delivery datetime (last leg)
--   leg N «to» ⇄ leg N+1 «from» (the hand-over point) — whichever changes, the
--                     other follows, with the datetime
-- Loop safety: WHEN clauses fire only on real changes and every UPDATE touches
-- rows only where the value differs (same pattern as 013).

begin;

create or replace function order_legs_audit(p_id bigint, p_before jsonb, p_after jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  values ('trigger:order_legs', 'system', 'update', 'orders', p_id::text, p_before, p_after, now());
$$;

-- last unloading location of a row (the parent's final delivery point)
create or replace function order_last_unloading(o orders) returns bigint
language sql immutable as $$
  select coalesce(o.unloading_location_10_id, o.unloading_location_9_id, o.unloading_location_8_id, o.unloading_location_7_id,
                  o.unloading_location_6_id, o.unloading_location_5_id, o.unloading_location_4_id, o.unloading_location_3_id,
                  o.unloading_location_2_id, o.unloading_location_1_id);
$$;

-- 1. parent → legs
create or replace function order_parent_to_legs() returns trigger
language plpgsql security definer set search_path = public as $$
declare leg orders%rowtype; total numeric; lastu bigint; maxleg int;
begin
  select max(leg_no) into maxleg from orders where parent_order_id = new.id and deleted_at is null;
  if maxleg is null then return null; end if;
  total := coalesce(new.loading_pallets_1,0)+coalesce(new.loading_pallets_2,0)+coalesce(new.loading_pallets_3,0)+coalesce(new.loading_pallets_4,0)+coalesce(new.loading_pallets_5,0)
         + coalesce(new.loading_pallets_6,0)+coalesce(new.loading_pallets_7,0)+coalesce(new.loading_pallets_8,0)+coalesce(new.loading_pallets_9,0)+coalesce(new.loading_pallets_10,0);
  if total = 0 then total := null; end if;
  lastu := order_last_unloading(new);
  for leg in select * from orders where parent_order_id = new.id and deleted_at is null loop
    update orders set
      client_id = new.client_id, reference = new.reference, goods = new.goods, temperature_c = new.temperature_c,
      pallet_type = new.pallet_type, pallet_exchange = new.pallet_exchange, refrigerator_mode = new.refrigerator_mode,
      loading_pallets_1 = coalesce(total, loading_pallets_1), unloading_pallets_1 = coalesce(total, unloading_pallets_1),
      loading_location_1_id   = case when leg.leg_no = 1 then new.loading_location_1_id else loading_location_1_id end,
      loading_datetime        = case when leg.leg_no = 1 then new.loading_datetime      else loading_datetime      end,
      unloading_location_1_id = case when leg.leg_no = maxleg then coalesce(lastu, unloading_location_1_id) else unloading_location_1_id end,
      delivery_datetime       = case when leg.leg_no = maxleg then new.delivery_datetime else delivery_datetime end
    where id = leg.id
      and (client_id is distinct from new.client_id or reference is distinct from new.reference or goods is distinct from new.goods
        or temperature_c is distinct from new.temperature_c or pallet_type is distinct from new.pallet_type
        or pallet_exchange is distinct from new.pallet_exchange or refrigerator_mode is distinct from new.refrigerator_mode
        or (total is not null and (loading_pallets_1 is distinct from total or unloading_pallets_1 is distinct from total))
        or (leg.leg_no = 1 and (loading_location_1_id is distinct from new.loading_location_1_id or loading_datetime is distinct from new.loading_datetime))
        or (leg.leg_no = maxleg and (delivery_datetime is distinct from new.delivery_datetime or (lastu is not null and unloading_location_1_id is distinct from lastu))));
    if found then
      perform order_legs_audit(leg.id, jsonb_build_object('from', 'parent', 'parent_id', new.id),
        jsonb_build_object('client_id', new.client_id, 'reference', new.reference, 'goods', new.goods, 'pallets', total,
                           'loading_datetime', new.loading_datetime, 'delivery_datetime', new.delivery_datetime));
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists order_parent_to_legs on orders;
create trigger order_parent_to_legs
  after update of client_id, reference, goods, temperature_c, pallet_type, pallet_exchange, refrigerator_mode,
                  loading_pallets_1, loading_pallets_2, loading_pallets_3, loading_pallets_4, loading_pallets_5,
                  loading_pallets_6, loading_pallets_7, loading_pallets_8, loading_pallets_9, loading_pallets_10,
                  loading_location_1_id, loading_datetime, delivery_datetime,
                  unloading_location_1_id, unloading_location_2_id, unloading_location_3_id, unloading_location_4_id, unloading_location_5_id,
                  unloading_location_6_id, unloading_location_7_id, unloading_location_8_id, unloading_location_9_id, unloading_location_10_id
  on orders for each row when (new.parent_order_id is null) execute function order_parent_to_legs();

-- 2. legs → parent dates, and the hand-over point kept identical on both legs
create or replace function order_legs_to_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare maxleg int; sib orders%rowtype; p orders%rowtype;
begin
  select * into p from orders where id = new.parent_order_id;
  select max(leg_no) into maxleg from orders where parent_order_id = new.parent_order_id and deleted_at is null;
  if new.leg_no = 1 and p.loading_datetime is distinct from new.loading_datetime then
    update orders set loading_datetime = new.loading_datetime where id = p.id;
    perform order_legs_audit(p.id, jsonb_build_object('loading_datetime', p.loading_datetime),
      jsonb_build_object('loading_datetime', new.loading_datetime, 'from', 'leg 1'));
  end if;
  if new.leg_no = maxleg and p.delivery_datetime is distinct from new.delivery_datetime then
    update orders set delivery_datetime = new.delivery_datetime where id = p.id;
    perform order_legs_audit(p.id, jsonb_build_object('delivery_datetime', p.delivery_datetime),
      jsonb_build_object('delivery_datetime', new.delivery_datetime, 'from', 'leg ' || maxleg));
  end if;
  -- hand-over: my «to» is the next leg's «from»
  select * into sib from orders where parent_order_id = new.parent_order_id and deleted_at is null and leg_no = new.leg_no + 1;
  if sib.id is not null and (sib.loading_location_1_id is distinct from new.unloading_location_1_id or sib.loading_datetime is distinct from new.delivery_datetime) then
    update orders set loading_location_1_id = new.unloading_location_1_id, loading_datetime = new.delivery_datetime where id = sib.id;
    perform order_legs_audit(sib.id, jsonb_build_object('loading_location_1_id', sib.loading_location_1_id, 'loading_datetime', sib.loading_datetime),
      jsonb_build_object('loading_location_1_id', new.unloading_location_1_id, 'loading_datetime', new.delivery_datetime, 'from', 'hand-over of leg ' || new.leg_no));
  end if;
  -- and my «from» is the previous leg's «to»
  select * into sib from orders where parent_order_id = new.parent_order_id and deleted_at is null and leg_no = new.leg_no - 1;
  if sib.id is not null and (sib.unloading_location_1_id is distinct from new.loading_location_1_id or sib.delivery_datetime is distinct from new.loading_datetime) then
    update orders set unloading_location_1_id = new.loading_location_1_id, delivery_datetime = new.loading_datetime where id = sib.id;
    perform order_legs_audit(sib.id, jsonb_build_object('unloading_location_1_id', sib.unloading_location_1_id, 'delivery_datetime', sib.delivery_datetime),
      jsonb_build_object('unloading_location_1_id', new.loading_location_1_id, 'delivery_datetime', new.loading_datetime, 'from', 'hand-over of leg ' || new.leg_no));
  end if;
  return null;
end $$;
drop trigger if exists order_legs_to_parent on orders;
create trigger order_legs_to_parent
  after update of loading_location_1_id, loading_datetime, unloading_location_1_id, delivery_datetime on orders
  for each row when (new.parent_order_id is not null and (
       old.loading_location_1_id is distinct from new.loading_location_1_id or old.loading_datetime is distinct from new.loading_datetime
    or old.unloading_location_1_id is distinct from new.unloading_location_1_id or old.delivery_datetime is distinct from new.delivery_datetime))
  execute function order_legs_to_parent();

commit;

-- Proof (expect 0 and 0):
-- select count(*) from orders c join orders p on p.id = c.parent_order_id where c.deleted_at is null
--   and (c.client_id is distinct from p.client_id or c.reference is distinct from p.reference or c.goods is distinct from p.goods);
-- select count(*) from orders a join orders b on b.parent_order_id = a.parent_order_id and b.leg_no = a.leg_no + 1
--   where a.deleted_at is null and b.deleted_at is null
--   and (a.unloading_location_1_id is distinct from b.loading_location_1_id or a.delivery_datetime is distinct from b.loading_datetime);
