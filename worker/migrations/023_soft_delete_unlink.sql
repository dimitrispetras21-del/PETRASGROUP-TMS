-- 023 — A soft-deleted order releases everything that still points at it (owner 7/9/2026)
--
-- WHY (the mechanism, not the symptom): `delete_order_cascade()` sweeps stops,
-- national orders/loads, groupage lines, consolidated loads, ramp and pallet
-- ledgers — and nothing else. It never releases the EXPORT whose
-- `matched_import_id` names the deleted import (the Weekly board then refuses
-- every new import: «Η εξαγωγή έχει ήδη άλλη ταιριασμένη εισαγωγή»), never
-- releases rotation children (`rotation_id` = the deleted parent), never
-- removes the order's round-trip legs, never retires its partner assignment,
-- and — since order legs exist (018) — never deletes the legs of a deleted split
-- parent. The links are legacy ids in text columns, so no FK can SET NULL, and
-- a soft delete is an UPDATE anyway.
--
-- The rule therefore lives in a trigger on `orders.deleted_at` (αρχή 4): it
-- fires for the cascade RPC, the facade's plain DELETE, and any SQL alike. Each
-- release writes an audit row (actor `trigger:order_unlink`). Restoring an
-- order (deleted_at back to null) does NOT re-link — the dispatcher re-matches
-- on purpose. The migration ends with the one-time backfill for rows already
-- left behind, so the fix repairs its own history.

begin;

create or replace function order_soft_delete_unlink() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
  procedure_note text := 'order ' || new.id || ' deleted';
begin
  -- 1. Exports matched to this (deleted) import are free again.
  if new.legacy_id is not null then
    for r in update orders o set matched_import_id = null
             where o.matched_import_id = new.legacy_id and o.deleted_at is null returning o.id loop
      insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
              jsonb_build_object('matched_import_id', new.legacy_id),
              jsonb_build_object('matched_import_id', null, 'reason', 'matched import ' || procedure_note), now());
    end loop;
    -- 2. Rotation children lose their (deleted) parent.
    for r in update orders o set rotation_id = null
             where o.rotation_id = new.legacy_id and o.deleted_at is null returning o.id loop
      insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
              jsonb_build_object('rotation_id', new.legacy_id),
              jsonb_build_object('rotation_id', null, 'reason', 'rotation parent ' || procedure_note), now());
    end loop;
  end if;

  -- 3. Split legs of a deleted parent go with it (depth is one, 018).
  for r in update orders o set deleted_at = new.deleted_at
           where o.parent_order_id = new.id and o.deleted_at is null returning o.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'orders', r.id::text,
            jsonb_build_object('parent_order_id', new.id), jsonb_build_object('reason', 'split parent ' || procedure_note), now());
  end loop;

  -- 4. Round-trip legs: leave every OPEN round trip; a closed one is history
  --    (rt-rules canRemoveLeg, owner 24/8) and keeps the leg. A round trip left
  --    with no legs is cancelled — never deleted.
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

  -- 5. Partner assignment of the deleted order retires with it.
  for r in update partner_assignments pa set deleted_at = new.deleted_at
           where pa.order_id = new.id and pa.deleted_at is null returning pa.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'partner_assignments', r.id::text,
            jsonb_build_object('order_id', new.id), jsonb_build_object('reason', procedure_note), now());
  end loop;
  return null;
end $$;

drop trigger if exists order_soft_delete_unlink on orders;
create trigger order_soft_delete_unlink
  after update of deleted_at on orders
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function order_soft_delete_unlink();

-- Backfill: rows already left behind by earlier deletes (measured 7/9: 1 export).
update orders o set matched_import_id = null
  from orders g where g.legacy_id = o.matched_import_id and o.deleted_at is null and g.deleted_at is not null;
update orders o set rotation_id = null
  from orders g where g.legacy_id = o.rotation_id and o.deleted_at is null and g.deleted_at is not null;
update orders o set deleted_at = p.deleted_at
  from orders p where p.id = o.parent_order_id and o.deleted_at is null and p.deleted_at is not null;
update partner_assignments pa set deleted_at = o.deleted_at
  from orders o where o.id = pa.order_id and pa.deleted_at is null and o.deleted_at is not null;

commit;

-- Proof (expect 0, 0, 0, 0)
-- select (select count(*) from orders o join orders g on g.legacy_id = o.matched_import_id where o.deleted_at is null and g.deleted_at is not null) as ghost_matches,
--        (select count(*) from orders o join orders g on g.legacy_id = o.rotation_id where o.deleted_at is null and g.deleted_at is not null) as ghost_rotations,
--        (select count(*) from orders o join orders p on p.id = o.parent_order_id where o.deleted_at is null and p.deleted_at is not null) as live_legs_of_deleted_parent,
--        (select count(*) from partner_assignments pa join orders o on o.id = pa.order_id where pa.deleted_at is null and o.deleted_at is not null) as live_pa_of_deleted_order;
