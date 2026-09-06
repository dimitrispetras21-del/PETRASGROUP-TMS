-- 018 — Order legs: parent order / child legs (owner 6/9/2026, docs/design/2026-09-06-order-split.md)
--
-- «Βέροια–Πράγα → Βέροια–Βουδαπέστη (εμείς) + Βουδαπέστη–Πράγα (συνεργάτης ή
-- άλλος οδηγός). Το σπάσιμο δημιουργεί διαφορετικά RT.» A leg is an ORDERS row
-- with parent_order_id + leg_no, so every existing mechanism (assignment, round
-- trips, prints, sync 013) works on it unchanged. The parent keeps the client,
-- price and invoicing; its status is DERIVED from its legs here, in the base,
-- so no screen can leave parent and legs disagreeing (αρχή 4).
-- Depth is one: a leg is never a parent. Nothing changes for existing rows.

begin;

alter table orders add column if not exists parent_order_id bigint references orders(id);
alter table orders add column if not exists leg_no smallint;
alter table orders drop constraint if exists orders_leg_shape;
alter table orders add constraint orders_leg_shape
  check ((parent_order_id is null and leg_no is null) or (parent_order_id is not null and leg_no >= 1));
create index if not exists orders_parent_order_idx on orders (parent_order_id) where parent_order_id is not null;

-- Depth one: a leg cannot be a parent, a parent cannot become a leg.
create or replace function order_leg_depth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_order_id is not null then
    if new.parent_order_id = new.id then raise exception 'order % cannot be its own parent', new.id; end if;
    if exists (select 1 from orders p where p.id = new.parent_order_id and p.parent_order_id is not null) then
      raise exception 'order % is a leg and cannot be a parent', new.parent_order_id;
    end if;
    if exists (select 1 from orders c where c.parent_order_id = new.id) then
      raise exception 'order % has legs and cannot become a leg', new.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists order_leg_depth on orders;
create trigger order_leg_depth before insert or update of parent_order_id on orders
  for each row execute function order_leg_depth();

-- A leg belongs to the parent's client and direction — filled in when the screen
-- left them empty, never allowed to point elsewhere.
create or replace function order_leg_inherit() returns trigger
language plpgsql security definer set search_path = public as $$
declare p orders%rowtype;
begin
  if new.parent_order_id is null then return new; end if;
  select * into p from orders where id = new.parent_order_id;
  if p.id is null then raise exception 'parent order % not found', new.parent_order_id; end if;
  new.client_id := coalesce(new.client_id, p.client_id);
  new.direction := coalesce(new.direction, p.direction);
  return new;
end $$;
drop trigger if exists order_leg_inherit on orders;
create trigger order_leg_inherit before insert on orders
  for each row when (new.parent_order_id is not null) execute function order_leg_inherit();

-- Parent status = f(legs): all Cancelled → Cancelled · all Delivered → Delivered ·
-- any In Transit/Delivered → In Transit · all assigned (truck or partner) →
-- Assigned · else Pending. Every change is written to audit_log (αρχή 1).
create or replace function order_parent_status(p_parent bigint) returns void
language plpgsql security definer set search_path = public as $$
declare n int; n_deliv int; n_moving int; n_cancel int; n_assigned int; new_status text; old_status text;
begin
  select count(*), count(*) filter (where status = 'Delivered'), count(*) filter (where status in ('In Transit','Delivered')),
         count(*) filter (where status = 'Cancelled'), count(*) filter (where truck_id is not null or partner_id is not null)
    into n, n_deliv, n_moving, n_cancel, n_assigned
  from orders where parent_order_id = p_parent and deleted_at is null;
  if n = 0 then return; end if;
  new_status := case when n_cancel = n then 'Cancelled'
                     when n_deliv = n then 'Delivered'
                     when n_moving > 0 then 'In Transit'
                     when n_assigned = n then 'Assigned'
                     else 'Pending' end;
  select status into old_status from orders where id = p_parent;
  if old_status is distinct from new_status then
    update orders set status = new_status where id = p_parent;
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_legs', 'system', 'update', 'orders', p_parent::text,
            jsonb_build_object('status', old_status), jsonb_build_object('status', new_status, 'reason', 'derived from legs'), now());
  end if;
end $$;

create or replace function order_leg_status_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.parent_order_id is not null then perform order_parent_status(old.parent_order_id); end if;
    return null;
  end if;
  if new.parent_order_id is not null then perform order_parent_status(new.parent_order_id); end if;
  if tg_op = 'UPDATE' and old.parent_order_id is not null and old.parent_order_id is distinct from new.parent_order_id then
    perform order_parent_status(old.parent_order_id);
  end if;
  return null;
end $$;
drop trigger if exists order_leg_status_sync on orders;
create trigger order_leg_status_sync
  after insert or delete or update of status, truck_id, partner_id, deleted_at, parent_order_id on orders
  for each row execute function order_leg_status_sync();

commit;

-- Proof (expect 0): parents whose status differs from the derived one
-- select count(*) from orders p where exists (select 1 from orders c where c.parent_order_id = p.id)
--   and p.status is distinct from (select case when count(*) filter (where status='Cancelled') = count(*) then 'Cancelled'
--        when count(*) filter (where status='Delivered') = count(*) then 'Delivered'
--        when count(*) filter (where status in ('In Transit','Delivered')) > 0 then 'In Transit'
--        when count(*) filter (where truck_id is not null or partner_id is not null) = count(*) then 'Assigned' else 'Pending' end
--        from orders c where c.parent_order_id = p.id and c.deleted_at is null);
