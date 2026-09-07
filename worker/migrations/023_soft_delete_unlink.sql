-- 023 — A soft-deleted order releases the orders that point at it (owner 7/9/2026)
--
-- Case: the owner deleted an import (soft delete, deleted_at set). Its export
-- kept `matched_import_id` pointing at the ghost, so the Weekly board refused
-- every new import for that export («Η εξαγωγή έχει ήδη άλλη ταιριασμένη
-- εισαγωγή»). The links are legacy ids in text columns, so no FK can do the
-- ON DELETE SET NULL for us — and a soft delete is an UPDATE anyway. This
-- trigger is the rule as low as it goes (αρχή 4): whichever screen or script
-- deletes an order, the orders that referenced it are released, with an audit
-- row each. Restoring (deleted_at back to null) does NOT re-link — the
-- dispatcher re-matches on purpose.

begin;

create or replace function order_soft_delete_unlink() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.legacy_id is null then return null; end if;
  for r in
    update orders o set matched_import_id = null
    where o.matched_import_id = new.legacy_id and o.deleted_at is null
    returning o.id
  loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
            jsonb_build_object('matched_import_id', new.legacy_id),
            jsonb_build_object('matched_import_id', null, 'reason', 'matched import ' || new.id || ' deleted'), now());
  end loop;
  for r in
    update orders o set rotation_id = null
    where o.rotation_id = new.legacy_id and o.deleted_at is null
    returning o.id
  loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
            jsonb_build_object('rotation_id', new.legacy_id),
            jsonb_build_object('rotation_id', null, 'reason', 'rotation parent ' || new.id || ' deleted'), now());
  end loop;
  return null;
end $$;

drop trigger if exists order_soft_delete_unlink on orders;
create trigger order_soft_delete_unlink
  after update of deleted_at on orders
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function order_soft_delete_unlink();

commit;

-- Proof (expect 0 after the repair): live orders still pointing at a deleted one
-- select count(*) from orders o join orders g on g.legacy_id = o.matched_import_id
--  where o.deleted_at is null and g.deleted_at is not null;
-- select count(*) from orders o join orders g on g.legacy_id = o.rotation_id
--  where o.deleted_at is null and g.deleted_at is not null;
