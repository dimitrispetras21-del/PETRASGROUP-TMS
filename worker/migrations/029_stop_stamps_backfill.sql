-- 029 — Delivery stamps the accountant could not write (Cursor audit 11/9/2026)
--
-- WHY: the Worker gave the accountant `orders: PATCH` (3/9) but not
-- `order_stops`, so Daily Ops wrote the ORDER as Delivered and the stop stamp
-- behind the same click was refused (403) — three orders left with Delivered
-- and 0/1 stops ticked. Mechanism fixed 13/9: accountant `order_stops: PATCH`
-- (Worker, deploy) and Daily Ops no longer writes the order when the stamp
-- fails. This is the one-time repair of the three half-writes, stamped with
-- the delivery day the order already carries, actor named so nobody mistakes
-- it for a field stamp.
begin;
with upd as (
  update order_stops s set completed_at = (o.actual_delivery_date::text || 'T09:00:00+00')::timestamptz,
                           completed_by = 'migration:029 (Alexia, 11/9)', performance = coalesce(s.performance, 'On Time')
  from orders o where o.id = s.order_id and o.id in (282, 302, 308) and s.stop_type = 'Unloading'
    and s.deleted_at is null and s.completed_at is null and o.status = 'Delivered'
  returning s.id, o.id order_id)
insert into audit_log (actor, role, action, table_name, record_id, after_data, created_at)
select 'migration:029', 'system', 'update', 'order_stops', id::text,
       jsonb_build_object('order_id', order_id, 'reason', 'delivery stamp refused by permissions on 11/9'), now() from upd;
commit;
-- Proof (expect 3): select count(*) from order_stops where completed_by like 'migration:029%';
