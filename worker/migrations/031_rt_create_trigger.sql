-- 031 — Round-trip CREATION at the database level (owner 13/9/2026)
--
-- STATUS: EXECUTED 13/9/2026 (second run; the first, 15:29, rolled back: audit
-- action 'insert' violated audit_log_action_check; fixed to 'create'). Result:
-- 27 RTs, 0 standalone orphans (DECISION_LOG 13/9). SUPERSEDED by 033 on 14/9:
-- the function below is replaced in place — the grouped / matched / rotation
-- exclusions of this file turned out to be the defect the owner saw.
--
-- WHY: RT/leg creation exists ONLY in the browser today (core/rt-feed.js,
-- rtOnOrderSaved), called from the order form (modules/orders_intl.js) and
-- Weekly International. modules/daily_ops.js changes an order's status with a
-- plain PATCH and never calls it (grep confirmed 13/9: no rt-feed.js
-- reference in daily_ops.js). Result: any order that becomes In
-- Transit/Delivered through Daily Ops gets no round trip, no driver-ledger
-- row, no P&L line — silently, because nothing in that path ever calls the
-- feeder. Measured 13/9 (diagnosis agent): orders 214, 239, 282, 284, 287,
-- 301, 302, 306, 332 (Delivered) and 303, 313, 318, 320 (In Transit) have no
-- leg. Re-measured while drafting this migration: 33 such orders exist now.
-- 013_rt_sync.sql already puts the SYNC rule in the database (αρχή 4 — "the
-- rule lives in the database so it catches EVERY path") for legs that
-- already exist; this migration does the same for CREATION, so which screen
-- saved the order no longer decides whether an RT gets made.
--
-- ── What the browser builds (quoted, not guessed) ──
--
-- Trigger to run the feed: core/rt-feed.js:242 `rtOnOrderSaved(orderId)`,
-- called from the order form save path. Qualifying condition, rt-feed.js:260-
-- 268:
--   const status = f['Status'] || '';
--   const partnerTrip = !!f['Is Partner Trip'];
--   const assigned = !!(getLinkedId(f['Truck']) || (partnerTrip && getLinkedId(f['Partner'])));
--   ...
--   const exec = (status === 'In Transit' || status === 'Delivered') && assigned;
-- (rt-feed.js:317). A PARTNER leg of a split order is skipped entirely
-- (rt-feed.js:267, "one trip per split").
--
-- ct_round_trips columns and their source, from the create body built at
-- rt-feed.js:346-352:
--   scope: 'INTL' (hard-coded — rt-feed.js only ever feeds international orders)
--   trip_type: partnerTrip ? 'PARTNER' : 'OWNED'                          (rt-feed.js:347, from f['Is Partner Trip'])
--   date_start: f['Loading DateTime'] date part, else today                (rt-feed.js:341)
--   date_end: f['Delivery DateTime'] date part, or null if before date_start (rt-feed.js:342-343)
--   truck_id/trailer_id/driver_id: from _rtFleetIds(f, lookups) — plate/name
--     lookup, null when partnerTrip (rt-feed.js:48-65, :349)
--   partner_id: from _rtFleetIds, only when partnerTrip (rt-feed.js:349-350)
--   source: 'planner' (rt-feed.js:347 — the only value this path ever sends;
--     'manual' is the other allowed value per ct_round_trips_source_check,
--     used elsewhere for hand-built RTs, never by this feeder)
--   status: NOT set on create — takes the column default 'planned'. Closed
--     explicitly afterwards (rt-feed.js:412-420) when the qualifying order (or
--     its matched import, for a pair) is Delivered — "Κλείσιμο = γεγονός
--     δεδομένων (κλειδωμένο 10/8)".
--   code: NOT set by the browser — column default
--     ('RT-' || nextval('ct_rt_code_seq'))::text generates it (confirmed via
--     information_schema.columns 13/9). This migration relies on the same
--     default; it never writes `code` itself.
--
-- ct_rt_legs columns, rt-feed.js:351 (create) and rt-rules.mjs's plan
-- (attach, not quoted here — this migration does not attach):
--   direction: 'EXPORT' unless the order's Direction = 'Import'
--     (rt-feed.js:126 dirOf; the order becomes the anchor via a Matched
--     Import ID redirect at rt-feed.js:255-259 when it's an import itself —
--     out of scope here, see below)
--   order_id: the pg (Postgres) order id — atGetOne's TABLES.ORDERS record
--     resolved through /pallets/gate (rt-feed.js:270-271, :40-44)
--   seq: dispatcher stop order from _rtLegSeq (rt-feed.js:157-192, driven by
--     the Group ID suffix) — out of scope here, see below (single-leg RTs
--     only ever need seq=1)
--
-- ── The attach/grouping rule (found, not reproduced) ──
-- A round trip is NOT one row per order. rt-feed.js:76-79 `_rtFind` looks for
-- an existing non-cancelled RT that already owns ANY leg among the order's
-- "leg-mates" before deciding to create. Leg-mates are computed by
-- rtLegsForOrder (rt-feed.js:118-143): a graph walk (BFS) over THREE
-- self-referencing text columns on `orders` — group_id (siblings sharing the
-- same Group ID), matched_import_id (export↔import pair, stored as the
-- OTHER order's `legacy_id`, NOT its bigint `id` — confirmed via
-- information_schema 13/9: matched_import_id is `text`, holding a legacy
-- Airtable rec-id, joined through orders.legacy_id, not orders.id), and
-- rotation_id (rotation legs). A split PARENT is excluded (rt-feed.js:110-
-- 117, :124). The result becomes the array of legs sent to POST /costs/rt in
-- ONE call (rt-feed.js:351, :397), which the Worker's planRtUpsert
-- (worker/src/rt-rules.mjs:104-132) either creates fresh or ATTACHES to
-- whichever single RT already owns one of those legs — and returns
-- {action:'conflict', status:409} (rt-rules.mjs:112-114) if the posted legs
-- already belong to TWO DIFFERENT round trips.
--
-- That conflict path is exactly the danger of getting this wrong in SQL: if
-- a database trigger created a standalone RT for an export AND a standalone
-- RT for its matched import (because both independently satisfy "exec" and
-- have no leg yet), the browser's own idempotent attach — the very
-- mechanism meant to fix things up — would 409 the next time anyone touched
-- either order, because the two legs now sit under two different RTs. That
-- is a real διπλογραφή risk, not a hypothetical one, and the owner's
-- acceptance criterion ranks "no duplicates" above "no orphans handled
-- cleverly". So:
--
-- ── Decision: minimal safe rule, not the full attach rule ──
-- This trigger creates a brand-new SINGLE-LEG round trip for an order ONLY
-- when that order has NO grouping link at all — group_id IS NULL AND
-- matched_import_id IS NULL AND rotation_id IS NULL. Measured 13/9: of 33
-- currently-orphaned executed+assigned orders, 27 are standalone (no
-- grouping link) and 6 carry a group_id or matched_import_id (of the
-- originally-diagnosed 13, these are orders 239, 284, 287, 301, 318, 320).
-- The 6 grouped orders are DELIBERATELY left untouched by this trigger —
-- reproducing rtLegsForOrder's three-relation BFS (joined on legacy_id, a
-- text column, not the normal bigint FK pattern every other trigger in this
-- codebase uses) in a plpgsql function would duplicate logic that already
-- has its own unit tests (core/rt-feed.js:193's module.exports, exercised by
-- a node test suite per its own doc comments) — a second implementation that
-- WILL drift from the first (CLAUDE.md αρχή 3: "δύο πηγές αλήθειας σημαίνει
-- καμία"). They stay orphaned until either (a) someone opens the order or
-- its matched screen in the app, letting the tested browser logic run and
-- build the correct multi-leg RT, or (b) a follow-up migration is written
-- for the grouped case specifically, reviewed with the same rigor as this
-- one. This is the "minimal safe rule" the task explicitly allows in place
-- of reproducing the browser's cleverness.
--
-- National loads: untouched, by both the browser feeder (rt-feed.js hard-
-- codes scope:'INTL' at every create) and this trigger (fires on `orders`
-- only). 013_rt_sync.sql's own header already names this gap ("National-load
-- legs (nat_load_id) are not synced yet — N4") — this migration does not
-- change that.
--
-- Idempotency: the unique partial index ct_leg_order (order_id) WHERE
-- order_id IS NOT NULL (confirmed via pg_indexes 13/9) guarantees an order
-- can never own two legs. The function also checks "does a leg already
-- exist for this order" itself before doing anything, AND backs out its own
-- just-created round trip if the leg insert loses a race (see
-- ON CONFLICT ... DO NOTHING + row-count check below) — so re-running this
-- migration, or the trigger re-firing on an unrelated column update, can
-- never create an orphaned zero-leg RT or a second RT for an order that
-- already has one.
--
-- Never fires for deleted_at rows or Cancelled orders (explicit guard,
-- mirrors rt-feed.js:96 "a dead order leaves its round trip" — here: a dead
-- order never gets one to begin with).
--
-- Sync after creation: unchanged — 013_rt_sync.sql's rt_sync_legs trigger on
-- ct_rt_legs already fires AFTER INSERT for any leg, ours included, and runs
-- rt_recompute() to set the RT's real date_start/date_end from the live leg.
-- This migration does not duplicate that; it only inserts the leg and lets
-- the existing trigger do its job (αρχή 3 respected within this migration
-- too).

begin;

-- Guard also expressed as a real CHECK-adjacent safety net at the function
-- level (not a table constraint — nothing here changes what a valid `orders`
-- row looks like).
create or replace function rt_create_from_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_type   text;
  dir        text;
  d_start    date;
  d_end      date;
  init_status text;
  new_rt_id  bigint;
  leg_rows   int;
begin
  -- Never for a dead or cancelled order.
  if new.deleted_at is not null or new.status = 'Cancelled' then
    return null;
  end if;

  -- Only the qualifying execution states (mirrors rt-feed.js:317 `exec`).
  if new.status not in ('In Transit', 'Delivered') then
    return null;
  end if;

  -- Only an assigned order (mirrors rt-feed.js:268 `assigned`).
  if not (new.truck_id is not null
          or (coalesce(new.is_partner_trip, false) and new.partner_id is not null)) then
    return null;
  end if;

  -- Scope decision above: standalone orders only — no group/pair/rotation.
  if new.group_id is not null or new.matched_import_id is not null or new.rotation_id is not null then
    return null;
  end if;

  -- Idempotency: already has a leg (013's own sync trigger, or an earlier
  -- run of this one, or the browser) — nothing to do.
  if exists (select 1 from ct_rt_legs where order_id = new.id) then
    return null;
  end if;

  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;
  dir      := case when new.direction = 'Import' then 'IMPORT' else 'EXPORT' end;

  -- date_start/date_end: same fallback shape as rt-feed.js:341-343. NOT NULL
  -- on date_start (confirmed via information_schema 13/9) — current_date is
  -- the same last-resort the browser uses (`new Date().toISOString()`).
  d_start := coalesce(new.loading_datetime, new.actual_delivery_date, new.delivery_datetime, current_date);
  d_end   := coalesce(new.actual_delivery_date, new.delivery_datetime);
  if d_end is not null and d_end < d_start then d_end := null; end if; -- window_order

  -- Κλείσιμο = γεγονός δεδομένων (rt-feed.js:412-420, solo-order case:
  -- pgI is null so shouldClose = status = 'Delivered'). A standalone order
  -- (this trigger's whole scope) is always the "solo" case — no matched
  -- import to wait for.
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

  -- ON CONFLICT DO NOTHING against ct_leg_order: if another transaction won
  -- the race and gave this order a leg between our own guard check above and
  -- this INSERT, we do NOT want a second leg — and we do NOT want to leave
  -- our just-created round trip behind with zero legs (an orphan RT is the
  -- same failure mode as an orphan order, just moved one table over).
  insert into ct_rt_legs (rt_id, direction, order_id, seq)
  values (new_rt_id, dir, new.id, 1)
  on conflict (order_id) where order_id is not null do nothing;
  get diagnostics leg_rows = row_count;

  if leg_rows = 0 then
    -- Lost the race: back out the round trip we just created. Safe to hard
    -- DELETE (not cancel) — it is milliseconds old and can never have
    -- acquired a cost line (rt-feed.js's own "never orphan costs" rule does
    -- not apply — there IS no cost yet).
    delete from ct_round_trips where id = new_rt_id;
    perform rt_sync_audit('delete', 'ct_round_trips', new_rt_id::text,
      jsonb_build_object('order_id', new.id, 'reason', 'lost race for the leg — another process attached it first'), null);
    return null;
  end if;

  -- 'create', not 'insert': audit_log_action_check allows only
  -- create/update/delete/cascade_delete. First run 13/9 15:29 failed on this
  -- exact CHECK and rolled the whole migration back — nothing was applied.
  perform rt_sync_audit('create', 'ct_round_trips', new_rt_id::text, null,
    jsonb_build_object('scope', 'INTL', 'trip_type', new_type, 'date_start', d_start, 'date_end', d_end,
                       'status', init_status, 'source_order', new.id, 'reason', 'standalone order had no round trip (031)'));
  return null;
end $$;

drop trigger if exists rt_create_from_order on orders;
create trigger rt_create_from_order
  after insert or update of status, truck_id, partner_id, driver_id, trailer_id,
                            loading_datetime, delivery_datetime
  on orders for each row
  execute function rt_create_from_order();

-- Backfill: the 13 orders named in the 13/9 diagnosis (Delivered: 214, 239,
-- 282, 284, 287, 301, 302, 306, 332 · In Transit: 303, 313, 318, 320). A
-- no-op SET (value = itself) still fires "UPDATE OF truck_id" per Postgres
-- semantics, which re-runs the function above for each row — it is a no-op
-- for the 6 grouped orders among these 13 (skipped by the scope guard, see
-- WHY block) and creates the missing standalone RT+leg for the rest. No
-- other column changes; no rows outside this list are touched.
update orders set truck_id = truck_id
where id in (214, 239, 282, 284, 287, 301, 302, 306, 332, 303, 313, 318, 320)
  and deleted_at is null;

commit;

-- Proof (run after):
--
-- 1. Standalone delivered/in-transit assigned orders with NO leg — this is
--    the set this migration guarantees to close. Expect 0 after the backfill
--    above, and 0 going forward as new orders reach these states through ANY
--    screen.
-- select count(*) as standalone_orphans
-- from orders o
-- where o.deleted_at is null and o.status <> 'Cancelled'
--   and o.status in ('In Transit', 'Delivered')
--   and (o.truck_id is not null or (coalesce(o.is_partner_trip, false) and o.partner_id is not null))
--   and o.group_id is null and o.matched_import_id is null and o.rotation_id is null
--   and not exists (select 1 from ct_rt_legs l where l.order_id = o.id);
--
-- 2. Everything still missing (informational — expected NOT zero: the 6
--    grouped orders from the 13, plus any other grouped orphan, all
--    deliberately out of this migration's scope, see WHY block).
-- select o.id, o.status, o.group_id, o.matched_import_id, o.rotation_id
-- from orders o
-- where o.deleted_at is null and o.status <> 'Cancelled'
--   and o.status in ('In Transit', 'Delivered')
--   and (o.truck_id is not null or (coalesce(o.is_partner_trip, false) and o.partner_id is not null))
--   and not exists (select 1 from ct_rt_legs l where l.order_id = o.id)
-- order by o.id;
--
-- 3. No duplicates: every order still maps to AT MOST one leg (should always
--    be true — the unique index enforces it — this is a sanity check, not a
--    test of anything this migration could break).
-- select order_id, count(*) from ct_rt_legs where order_id is not null
-- group by order_id having count(*) > 1;
--
-- 4. No orphan round trips (zero-leg RTs) created by this trigger.
-- select r.id, r.code, r.created_by, r.created_at
-- from ct_round_trips r
-- where r.created_by = 'trigger:rt_create'
--   and not exists (select 1 from ct_rt_legs l where l.rt_id = r.id);
