-- 033 — Round-trip creation for RELATED orders: groups, matched pairs, rotations
--        (owner 14/9/2026: «εξακολουθούν να μην υπάρχουν όλα τα RT — βρες την αιτία»)
--
-- STATUS: DRAFT — NOT EXECUTED. The owner runs it by hand (Supabase SQL editor,
-- after 15:00 — αρχή 7). Replaces the function of 031 in place; nothing else
-- from 013/031 changes.
--
-- WHY (measured 14/9, orders loading from 1/8, own fleet, not deleted):
--   141 orders · 131 with a leg · 10 without. Of the 10:
--     6 grouped (GI-/GRP- group_id)     239 301 318 320 328 329
--     2 export with matched import       284 287
--     2 merely Assigned (not executed)   334 335
--   Every one of the first 8 reached In Transit/Delivered through Daily Ops,
--   whose plain PATCH never calls core/rt-feed.js, and 031 skipped them on
--   purpose («group_id / matched_import_id / rotation_id → return null»).
--   So the deliberate gap of 031 IS the defect the owner sees: in practice
--   the related shapes are the rule, not the exception (60 of the 138 live
--   RTs carry more than one leg).
--
-- WHAT 031 got wrong and this fixes: it feared that copying rt-feed.js's
-- three-relation walk into plpgsql would be a second source of truth (αρχή 3)
-- and that a trigger creating one RT per side of a matched pair would hand
-- the browser a 409. Both fears are answered by doing the SAME walk the
-- browser does and by ATTACHING, never duplicating:
--   • the relations are the three self-referencing text links on orders —
--     group_id equality, matched_import_id ⇄ legacy_id, rotation_id ⇄
--     legacy_id — walked in both directions, bounded (depth ≤ 6, mirrors
--     rt-feed.js's 20-node bound in spirit);
--   • if any related order already sits on ONE live (not cancelled) RT with
--     the same vehicle, this order becomes one more leg of that RT — exactly
--     what the browser's POST /costs/rt would do (planRtUpsert → attach);
--   • if related orders sit on TWO different live RTs the function does
--     nothing and writes an audit row flagged conflict (αρχή 1: audible, never
--     silently merged — same policy as the Worker's 409);
--   • a different truck (or owned vs partner) is a different physical trip:
--     then a NEW RT is created instead of attaching, and the audit row says so.
--   With this, the browser's later POST of the full leg set finds every leg
--   on the same RT and takes its idempotent attach path — no 409.
--
-- Threshold UNCHANGED: an RT is born when the order is executed
-- (In Transit/Delivered) and assigned — the rule of rt-feed.js:317 and of
-- DECISION_LOG 13/9. Creating at 'Assigned' would also open a payroll line
-- (dl_sync_from_rt) for a trip that has not happened; that is a separate
-- owner decision, recorded as open in DECISION_LOG 14/9. Orders 334/335 get
-- their RT the moment they leave, through this trigger, whatever screen
-- moves them.
--
-- Rejected alternatives:
--   • fixing Daily Ops to call rt-feed.js — one more screen patched, the next
--     one (import, migration, Worker route) still bypasses it (αρχή 4: the
--     rule goes as low as it can);
--   • a cron that merges duplicate RTs — rejected already on 5/9 (αρχή 3).
--
-- Reopen rule: attaching a not-yet-Delivered leg to a closed/complete RT
-- reopens it ('planned'); the browser closed it on the export's delivery
-- before the import existed (rt-feed.js:415 waits on the import only when
-- it is already matched). A closed RT with a Delivered leg attached stays
-- closed; rt_recompute (013) widens its window.
--
-- Safety: same idempotency as 031 (unique partial index ct_leg_order; the
-- just-created RT is deleted if the leg insert loses a race). Partner leg of
-- a split (is_partner_trip + parent_order_id) and a split PARENT (has live
-- children) never get a leg — mirrors rt-feed.js:267 and :110.

begin;

create or replace function rt_create_from_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_type    text;
  dir         text;
  d_start     date;
  d_end       date;
  init_status text;
  new_rt_id   bigint;
  leg_rows    int;
  target      ct_round_trips%rowtype;
  n_targets   int;
  target_ids  text;
  next_seq    smallint;
  reason      text;
begin
  if new.deleted_at is not null or new.status = 'Cancelled' then
    return null;
  end if;
  if new.status not in ('In Transit', 'Delivered') then
    return null;
  end if;
  if not (new.truck_id is not null
          or (coalesce(new.is_partner_trip, false) and new.partner_id is not null)) then
    return null;
  end if;
  -- partner leg of a split rides on the sibling's P&L (rt-feed.js:267)
  if coalesce(new.is_partner_trip, false) and new.parent_order_id is not null then
    return null;
  end if;
  -- a split parent is a planning shell; its legs are the real orders (rt-feed.js:110)
  if exists (select 1 from orders c where c.parent_order_id = new.id and c.deleted_at is null) then
    return null;
  end if;
  if exists (select 1 from ct_rt_legs where order_id = new.id) then
    return null;
  end if;

  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;
  dir      := case when new.direction = 'Import' then 'IMPORT' else 'EXPORT' end;

  -- Live RTs of every related order (group / matched pair / rotation, both ways).
  with recursive walk as (
    select new.id as node, 0 as depth
    union
    select n.id, w.depth + 1
    from walk w
    join orders cur on cur.id = w.node
    join orders n on n.deleted_at is null and n.id <> cur.id and (
         (cur.group_id is not null and n.group_id = cur.group_id)
      or (cur.matched_import_id is not null and n.legacy_id = cur.matched_import_id)
      or (n.matched_import_id is not null and n.matched_import_id = cur.legacy_id)
      or (cur.rotation_id is not null and n.legacy_id = cur.rotation_id)
      or (n.rotation_id is not null and n.rotation_id = cur.legacy_id))
    where w.depth < 6
  )
  select count(distinct r.id), string_agg(distinct r.id::text, ',')
    into n_targets, target_ids
  from walk w
  join ct_rt_legs l on l.order_id = w.node
  join ct_round_trips r on r.id = l.rt_id
  where w.node <> new.id and r.status <> 'cancelled';

  if n_targets > 1 then
    -- audit_log_action_check allows only create/update/delete/cascade_delete
    -- (the first run of 031 died on this) — the conflict lives in the reason.
    perform rt_sync_audit('update', 'orders', new.id::text, null,
      jsonb_build_object('conflict', true, 'rt_ids', target_ids,
                         'reason', 'conflict: related orders sit on more than one live round trip — not merged (033)'));
    return null;
  end if;

  if n_targets = 1 then
    select * into target from ct_round_trips where id = target_ids::bigint;
    if target.trip_type = new_type
       and (new_type = 'PARTNER' or target.truck_id is null or target.truck_id = new.truck_id)
       and (new_type = 'OWNED'   or target.partner_id is null or target.partner_id = new.partner_id) then
      select coalesce(max(seq), 0) + 1 into next_seq from ct_rt_legs where rt_id = target.id;
      insert into ct_rt_legs (rt_id, direction, order_id, seq)
      values (target.id, dir, new.id, next_seq)
      on conflict (order_id) where order_id is not null do nothing;
      get diagnostics leg_rows = row_count;
      if leg_rows = 0 then return null; end if;

      perform rt_sync_audit('update', 'ct_round_trips', target.id::text, null,
        jsonb_build_object('leg_order', new.id, 'direction', dir, 'seq', next_seq,
                           'reason', 'related order attached to the pair/group round trip (033)'));

      if target.status in ('closed', 'complete') and new.status <> 'Delivered' then
        update ct_round_trips set status = 'planned', closed_at = null, updated_at = now() where id = target.id;
        perform rt_sync_audit('update', 'ct_round_trips', target.id::text,
          jsonb_build_object('status', target.status),
          jsonb_build_object('status', 'planned', 'reason', 'reopened: leg ' || new.id || ' not yet delivered (033)'));
      end if;
      return null;
    end if;
    reason := 'related round trip ' || target.code || ' runs another vehicle — separate trip (033)';
  else
    reason := 'no related round trip — first executed order of its pair/group (033)';
  end if;

  d_start := coalesce(new.loading_datetime, new.actual_delivery_date, new.delivery_datetime, current_date);
  d_end   := coalesce(new.actual_delivery_date, new.delivery_datetime);
  if d_end is not null and d_end < d_start then d_end := null; end if;
  init_status := case when new.status = 'Delivered' then 'closed' else 'planned' end;

  insert into ct_round_trips
    (scope, trip_type, truck_id, trailer_id, driver_id, partner_id,
     date_start, date_end, status, source, created_by)
  values
    ('INTL', new_type,
     case when new_type = 'OWNED' then new.truck_id else null end,
     case when new_type = 'OWNED' then new.trailer_id else null end,
     case when new_type = 'OWNED' then new.driver_id else null end,
     case when new_type = 'PARTNER' then new.partner_id else null end,
     d_start, d_end, init_status, 'planner', 'trigger:rt_create')
  returning id into new_rt_id;

  insert into ct_rt_legs (rt_id, direction, order_id, seq)
  values (new_rt_id, dir, new.id, 1)
  on conflict (order_id) where order_id is not null do nothing;
  get diagnostics leg_rows = row_count;

  if leg_rows = 0 then
    delete from ct_round_trips where id = new_rt_id;
    perform rt_sync_audit('delete', 'ct_round_trips', new_rt_id::text,
      jsonb_build_object('order_id', new.id, 'reason', 'lost race for the leg — another process attached it first'), null);
    return null;
  end if;

  perform rt_sync_audit('create', 'ct_round_trips', new_rt_id::text, null,
    jsonb_build_object('scope', 'INTL', 'trip_type', new_type, 'date_start', d_start, 'date_end', d_end,
                       'status', init_status, 'source_order', new.id, 'reason', reason));
  return null;
end $$;

-- Relation columns added so an order that was skipped (conflict) retries when
-- its links change. Same event otherwise as 031.
drop trigger if exists rt_create_from_order on orders;
create trigger rt_create_from_order
  after insert or update of status, truck_id, partner_id, driver_id, trailer_id,
                            loading_datetime, delivery_datetime,
                            group_id, matched_import_id, rotation_id, is_partner_trip
  on orders for each row
  execute function rt_create_from_order();

-- Backfill: every executed, assigned, live order without a leg — ordered by id
-- so the first member of a pair/group creates the RT and the rest attach to it
-- (the cascade through rt_sync_legs → orders → this trigger also helps).
-- A no-op SET still fires "UPDATE OF truck_id".
do $$
declare o record;
begin
  for o in
    select id from orders
    where deleted_at is null and status in ('In Transit', 'Delivered')
      and (truck_id is not null or (coalesce(is_partner_trip, false) and partner_id is not null))
      and not exists (select 1 from ct_rt_legs l where l.order_id = orders.id)
    order by id
  loop
    update orders set truck_id = truck_id where id = o.id;
  end loop;
end $$;

commit;

-- Proof (run after) — expected on 14/9 data:
--
-- 1. Executed + assigned + live orders with NO leg. Expect 0 (was 8).
-- select count(*) as orphans from orders o
-- where o.deleted_at is null and o.status in ('In Transit','Delivered')
--   and (o.truck_id is not null or (coalesce(o.is_partner_trip,false) and o.partner_id is not null))
--   and not (coalesce(o.is_partner_trip,false) and o.parent_order_id is not null)
--   and not exists (select 1 from orders c where c.parent_order_id = o.id and c.deleted_at is null)
--   and not exists (select 1 from ct_rt_legs l where l.order_id = o.id);
--
-- 2. Where the 8 went. Expect: 239→RT 105 · 284→135 · 287→136 · 301→21 ·
--    318+320 → one NEW RT (truck 13) · 328+329 → one NEW RT (truck 7).
-- select l.order_id, r.id, r.code, r.status, r.truck_id, r.created_by
-- from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
-- where l.order_id in (239,284,287,301,318,320,328,329) order by l.order_id;
--
-- 3. Audit trail of this run. Expect 4 attach + 2 create + 0 conflict.
-- select case when after_data->>'reason' like 'conflict:%' then 'conflict'
--             when after_data ? 'leg_order' then 'attach' else action end as what, count(*)
-- from audit_log
-- where actor = 'trigger:rt_sync' and created_at > now() - interval '10 minutes'
--   and after_data->>'reason' like '%(033)%' group by 1;
--
-- 4. Ledger follows: every OWNED live RT with a driver has a live ledger line. Expect 0.
-- select count(*) from dl_v_rt_gap;
--
-- 5. Still without RT, by design: Assigned-only orders (334, 335 on 14/9).
-- select id, status from orders where deleted_at is null and status = 'Assigned'
--   and truck_id is not null and not exists (select 1 from ct_rt_legs l where l.order_id = orders.id);
