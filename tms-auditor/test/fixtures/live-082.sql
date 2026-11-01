-- The two order-side round-trip triggers production holds and the production-shaped copy lacked (SELECT 28/10,
-- pg_get_functiondef / pg_get_triggerdef, verbatim): rt_sync_from_order (013 ... 045: a date, vehicle or status change
-- of an order re-reads its RT's legs, rt_recompute) and rt_auto_close_order (046). F41 is a save of an international
-- order that reaches rt_recompute through the first one; plan-082.test.mjs proves md5(prosrc) = production's.
CREATE OR REPLACE FUNCTION public.rt_sync_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare leg record; rt ct_round_trips%rowtype; sib record; new_type text;
begin
  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;

  for leg in
    select l.id, l.rt_id from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
    where l.order_id = new.id and r.status <> 'cancelled'
  loop
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
end $function$
;
CREATE OR REPLACE FUNCTION public.rt_auto_close_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare leg record;
begin
  for leg in
    select distinct l.rt_id from ct_rt_legs l
     join ct_round_trips r on r.id = l.rt_id
    where l.order_id = new.id and r.status <> 'cancelled'
  loop
    perform rt_auto_close(leg.rt_id);
  end loop;
  return null;
end $function$
;
CREATE TRIGGER rt_sync_from_order AFTER UPDATE OF driver_id, truck_id, trailer_id, partner_id, is_partner_trip, loading_datetime, delivery_datetime, actual_delivery_date, deleted_at, status ON public.orders FOR EACH ROW WHEN (((old.driver_id IS DISTINCT FROM new.driver_id) OR (old.truck_id IS DISTINCT FROM new.truck_id) OR (old.trailer_id IS DISTINCT FROM new.trailer_id) OR (old.partner_id IS DISTINCT FROM new.partner_id) OR (old.is_partner_trip IS DISTINCT FROM new.is_partner_trip) OR (old.loading_datetime IS DISTINCT FROM new.loading_datetime) OR (old.delivery_datetime IS DISTINCT FROM new.delivery_datetime) OR (old.actual_delivery_date IS DISTINCT FROM new.actual_delivery_date) OR (old.deleted_at IS DISTINCT FROM new.deleted_at) OR (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION rt_sync_from_order();
CREATE TRIGGER rt_z_auto_close_order AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION rt_auto_close_order();
