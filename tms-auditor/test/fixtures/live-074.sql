-- The LIVE texts 074 patches or depends on that the earlier captures (live-071/072/073.sql) do not hold: SELECT on
-- production 28/10/2026 (pg_proc.prosrc + pg_get_triggerdef), project gatejgbpyodlepkvqkgf. plan-074.test.mjs
-- proves each md5 equals the one 074 PART 0 guards on, so a wrong copy here fails loudly.
--   order_dates_follow()            4b5d279f21f981a11d35a5deb655269a  (028 + 069)
--   national_load_follow_order()    66f079523fb3d7d91dd196b0df272e9a  (030)
--   national_loads_soft_delete_cascade()  694e6eee9c9e4aa9dc1f2ffabc3139a0
--   national_load_soft_delete_unlink()    a03ca6ab9b49b70ae9ceb332247b310d
--   order_soft_delete_unlink()      6bcb30bdb352902f14b3922ab4a30fa9  (023)
-- Not captured: delete_order_cascade(text) (it needs cons_load_source_orders and the pallet ledgers, absent from this
-- copy) and rt_sync_national_load() (12.8k; production has 0 ct_rt_legs on national loads, 28/10): the tests run the
-- statements delete_order_cascade runs, in its order.
-- Grants as production (proacl 28/10): the four trigger functions EXECUTE to PUBLIC (PostgreSQL's default).

CREATE OR REPLACE FUNCTION public.order_dates_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fx$
declare
  d_load int := 0; d_del int := 0; d_cd int := 0;
  r record;
begin
  if old.loading_datetime is not null and new.loading_datetime is not null then
    d_load := new.loading_datetime::date - old.loading_datetime::date; end if;
  if old.delivery_datetime is not null and new.delivery_datetime is not null then
    d_del := new.delivery_datetime::date - old.delivery_datetime::date; end if;
  if d_load = 0 and d_del = 0 then return null; end if;
  d_cd := case when new.direction = 'Export' then d_load else d_del end;

  for r in update order_stops s set datetime = s.datetime + make_interval(days =>
             case when s.stop_type = 'Loading' then d_load
                  when s.stop_type = 'Unloading' then d_del
                  else d_cd end)
           where s.order_id = new.id and s.deleted_at is null and s.datetime is not null
             and (s.stop_type is distinct from 'Cross-dock' or new.cross_dock_date is null) -- 069: a dated cross-dock owns its stop (order_cd_stop_follow)
             and (case when s.stop_type = 'Loading' then d_load when s.stop_type = 'Unloading' then d_del else d_cd end) <> 0
           returning s.id, s.stop_type loop
    insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
    values ('trigger:order_dates_follow', 'system', 'update', 'order_stops', r.id::text,
            jsonb_build_object('order_id', new.id, 'stop_type', r.stop_type, 'shift_days',
              case when r.stop_type = 'Loading' then d_load when r.stop_type = 'Unloading' then d_del else d_cd end), now());
  end loop;

  if d_cd <> 0 and new.cross_dock_date is not null
     and old.cross_dock_date is not distinct from new.cross_dock_date then -- 069: once - never on top of a value this same write set
    update orders set cross_dock_date = cross_dock_date + d_cd where id = new.id;
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_dates_follow', 'system', 'update', 'orders', new.id::text,
            jsonb_build_object('cross_dock_date', new.cross_dock_date),
            jsonb_build_object('cross_dock_date', new.cross_dock_date + d_cd, 'shift_days', d_cd), now());
  end if;

  if d_cd <> 0 and new.veroia_switch then
    for r in update national_loads nl
               set loading_datetime = nl.loading_datetime + make_interval(days => d_cd),
                   delivery_datetime = nl.delivery_datetime + make_interval(days => d_cd)
             where nl.source_order_id = new.id and nl.deleted_at is null
               and nl.source_type = 'Direct' and nl.status = 'Pending'
             returning nl.id loop
      update order_stops s set datetime = s.datetime + make_interval(days => d_cd)
        where s.national_load_id = r.id and s.deleted_at is null and s.datetime is not null;
      insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
      values ('trigger:order_dates_follow', 'system', 'update', 'national_loads', r.id::text,
              jsonb_build_object('source_order_id', new.id, 'shift_days', d_cd), now());
    end loop;
  end if;
  return null;
end $fx$;
CREATE TRIGGER order_dates_follow AFTER UPDATE OF loading_datetime, delivery_datetime ON public.orders FOR EACH ROW
  WHEN (((old.loading_datetime IS DISTINCT FROM new.loading_datetime) OR (old.delivery_datetime IS DISTINCT FROM new.delivery_datetime)))
  EXECUTE FUNCTION order_dates_follow();

CREATE OR REPLACE FUNCTION public.national_load_follow_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fx$
declare target text; r record;
begin
  target := case
    when new.status = 'Cancelled' then 'Cancelled'
    when new.direction = 'Import' and new.status = 'Delivered' then 'Delivered'
    when new.direction = 'Export' and new.status in ('In Transit','Delivered') then 'Delivered'
    else null end;
  if target is null or not coalesce(new.veroia_switch, false) then return null; end if;
  for r in update national_loads nl set status = target
           where nl.source_order_id = new.id and nl.deleted_at is null and nl.source_type = 'Direct'
             and nl.status not in ('Delivered','Cancelled')
           returning nl.id, nl.status loop
    insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
    values ('trigger:national_load_follow', 'system', 'update', 'national_loads', r.id::text,
            jsonb_build_object('status', target, 'reason', 'order ' || new.id || ' → ' || new.status), now());
  end loop;
  return null;
end $fx$;
CREATE TRIGGER national_load_follow_order AFTER UPDATE OF status ON public.orders FOR EACH ROW
  WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION national_load_follow_order();

CREATE OR REPLACE FUNCTION public.national_loads_soft_delete_cascade() RETURNS trigger LANGUAGE plpgsql AS $fx$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update order_stops set deleted_at = new.deleted_at where national_load_id = new.id and deleted_at is null;
    update local_moves set deleted_at = new.deleted_at where parent_nat_load_id = new.id and deleted_at is null;
    update ramp        set deleted_at = new.deleted_at where national_load_id = new.id and deleted_at is null;
  end if;
  return new;
end $fx$;
CREATE TRIGGER trg_national_loads_soft_delete_cascade AFTER UPDATE OF deleted_at ON public.national_loads
  FOR EACH ROW EXECUTE FUNCTION national_loads_soft_delete_cascade();

CREATE OR REPLACE FUNCTION public.national_load_soft_delete_unlink() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fx$
declare r record;
begin
  if new.legacy_id is null then return null; end if;
  for r in update national_loads o set matched_load = null
           where o.matched_load = new.legacy_id and o.deleted_at is null returning o.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:national_load_unlink', 'system', 'update', 'national_loads', r.id::text,
            jsonb_build_object('matched_load', new.legacy_id),
            jsonb_build_object('matched_load', null, 'reason', 'matched load ' || new.id || ' deleted'), now());
  end loop;
  return null;
end $fx$;
CREATE TRIGGER national_load_soft_delete_unlink AFTER UPDATE OF deleted_at ON public.national_loads FOR EACH ROW
  WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION national_load_soft_delete_unlink();

CREATE OR REPLACE FUNCTION public.order_soft_delete_unlink() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fx$
declare r record;
  procedure_note text := 'order ' || new.id || ' deleted';
begin
  if new.legacy_id is not null then
    for r in update orders o set matched_import_id = null
             where o.matched_import_id = new.legacy_id and o.deleted_at is null returning o.id loop
      insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
              jsonb_build_object('matched_import_id', new.legacy_id),
              jsonb_build_object('matched_import_id', null, 'reason', 'matched import ' || procedure_note), now());
    end loop;
    for r in update orders o set rotation_id = null
             where o.rotation_id = new.legacy_id and o.deleted_at is null returning o.id loop
      insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
              jsonb_build_object('rotation_id', new.legacy_id),
              jsonb_build_object('rotation_id', null, 'reason', 'rotation parent ' || procedure_note), now());
    end loop;
  end if;
  for r in update orders o set deleted_at = new.deleted_at
           where o.parent_order_id = new.id and o.deleted_at is null returning o.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'orders', r.id::text,
            jsonb_build_object('parent_order_id', new.id), jsonb_build_object('reason', 'split parent ' || procedure_note), now());
  end loop;
  for r in delete from ct_rt_legs l using ct_round_trips rt
           where l.order_id = new.id and rt.id = l.rt_id and rt.status <> 'closed'
           returning l.rt_id, rt.code loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'ct_rt_legs', r.rt_id::text,
            jsonb_build_object('order_id', new.id, 'rt', r.code), jsonb_build_object('reason', procedure_note), now());
    update ct_round_trips set status = 'cancelled'
      where id = r.rt_id and status <> 'closed'
        and not exists (select 1 from ct_rt_legs l2 where l2.rt_id = r.rt_id);
  end loop;
  for r in update partner_assignments pa set deleted_at = new.deleted_at
           where pa.order_id = new.id and pa.deleted_at is null returning pa.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'partner_assignments', r.id::text,
            jsonb_build_object('order_id', new.id), jsonb_build_object('reason', procedure_note), now());
  end loop;
  -- 6. local relays (060): a deleted order takes its local delivery/loading with it.
  --    dl_sync_from_local_move then cancels the local driver's day line, or flags it for review
  --    when amounts were written. Split legs reach here too (step 3 re-fires this trigger).
  for r in update local_moves lm set deleted_at = new.deleted_at
           where lm.parent_order_id = new.id and lm.deleted_at is null returning lm.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'local_moves', r.id::text,
            jsonb_build_object('parent_order_id', new.id), jsonb_build_object('reason', procedure_note), now());
  end loop;
  return null;
end $fx$;
CREATE TRIGGER order_soft_delete_unlink AFTER UPDATE OF deleted_at ON public.orders FOR EACH ROW
  WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION order_soft_delete_unlink();
