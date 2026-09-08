-- 025 — dispatcher stop order reaches the round trip's legs (owner 8/9/2026)
--
-- NOTE ON THE NUMBER: this was specced as 024_rt_leg_seq.sql, but
-- 024_import_rules.sql already occupies that slot in this repo (a separate,
-- unrelated migration, not yet run). Renumbered to 025 so two files never
-- share a slot — CLAUDE.md αρχή 3 («δύο πηγές αλήθειας σημαίνει καμία»)
-- applies to migration numbering too.
--
-- Why: a groupage's stop order lives ONLY in the app, encoded as a suffix on
-- Group ID («GRP-xxx|recA,recB», see modules/weekly_intl.js _wiGrpOrder,
-- ~2015-2024). ct_rt_legs (migration 001) has no column for it, so every
-- downstream reader of a round trip's legs — the driver ledger route
-- (dl_v_rt_route, migration 012), print, and any future route screen — falls
-- back to guessing from loading_datetime. That guess is wrong whenever the
-- dispatcher reordered stops for a real-world reason (traffic, a client's
-- receiving hours) that isn't visible in the loading time. `seq` is the
-- column that lets the Worker (worker/src/rt-rules.mjs planRtUpsert) and the
-- feeder (core/rt-feed.js rtOnOrderSaved) carry that order all the way to
-- the legs table, so the ledger/print/route views can follow it instead of
-- re-deriving a different answer than the dispatcher already gave.
--
-- This migration only ADDS a column and reorders one view — no existing
-- column is renamed or dropped, no row is deleted (αρχή 7: reversible, one
-- change).

alter table ct_rt_legs add column if not exists seq smallint;

-- Backfill for legs that already exist, before any app re-post can set the
-- real dispatcher order: rank direction EXPORT/ANODOS (outbound) before
-- IMPORT/KATHODOS (return — mirrors _wiGrpOrder's own direction-agnostic
-- fallback: no suffix means "guess from the data available"), then loading
-- time, then the order/load id as a stable final tiebreaker. A future
-- POST /costs/rt from core/rt-feed.js with the real Group ID suffix order
-- OVERWRITES this guess (rt-rules.mjs planRtUpsert → legsToUpdateSeq) — the
-- backfill only prevents a null seq on legs the app hasn't touched since.
with ranked as (
  select l.id,
         row_number() over (
           partition by l.rt_id
           order by
             case l.direction
               when 'EXPORT'  then 0
               when 'ANODOS'  then 0
               when 'IMPORT'  then 1
               when 'KATHODOS' then 1
               else 2
             end,
             coalesce(o.loading_datetime, nl.loading_datetime),
             coalesce(l.order_id, l.nat_load_id)
         ) as rn
  from ct_rt_legs l
  left join orders o          on o.id  = l.order_id
  left join national_loads nl on nl.id = l.nat_load_id
)
update ct_rt_legs l set seq = ranked.rn
from ranked where ranked.id = l.id;

-- dl_v_rt_route (migration 012): route_legs / route_text now order by seq
-- first, falling back to load date then leg id exactly as before for any
-- leg whose seq is null (a leg the backfill above always fills, but a
-- future leg inserted with no seq — e.g. a manual TRIP PnL correction —
-- must not disappear or crash the ordering, just sort last). Column list
-- is UNCHANGED from 012 (rt_id, route_text, route_legs) — a view keeps its
-- column list; only the ORDER BY inside the aggregates changed.
create or replace view dl_v_rt_route with (security_invoker = true) as
with leg as (
  select l.rt_id, l.id as leg_id, l.direction, l.seq,
         coalesce(o.loading_datetime, nl.loading_datetime)::date as load_d,
         coalesce(o.actual_delivery_date, nl.actual_delivery_date,
                  o.delivery_datetime::date, nl.delivery_datetime::date) as deliv_d,
         coalesce(o.loading_location_1_id, nl.pickup_location_1_id) as from_id,
         coalesce(o.unloading_location_10_id, o.unloading_location_9_id, o.unloading_location_8_id,
                  o.unloading_location_7_id,  o.unloading_location_6_id, o.unloading_location_5_id,
                  o.unloading_location_4_id,  o.unloading_location_3_id, o.unloading_location_2_id,
                  o.unloading_location_1_id,
                  nl.delivery_location_10_id, nl.delivery_location_9_id, nl.delivery_location_8_id,
                  nl.delivery_location_7_id,  nl.delivery_location_6_id, nl.delivery_location_5_id,
                  nl.delivery_location_4_id,  nl.delivery_location_3_id, nl.delivery_location_2_id,
                  nl.delivery_location_1_id) as to_id,
         -- stops beyond the first loading / last unloading, shown as «+N στάσεις»
         (select count(*) from (values
            (o.loading_location_2_id), (o.loading_location_3_id), (o.loading_location_4_id),
            (o.loading_location_5_id), (o.loading_location_6_id), (o.loading_location_7_id),
            (o.loading_location_8_id), (o.loading_location_9_id), (o.loading_location_10_id),
            (o.unloading_location_2_id), (o.unloading_location_3_id), (o.unloading_location_4_id),
            (o.unloading_location_5_id), (o.unloading_location_6_id), (o.unloading_location_7_id),
            (o.unloading_location_8_id), (o.unloading_location_9_id), (o.unloading_location_10_id),
            (nl.pickup_location_2_id), (nl.pickup_location_3_id), (nl.pickup_location_4_id),
            (nl.pickup_location_5_id), (nl.pickup_location_6_id), (nl.pickup_location_7_id),
            (nl.pickup_location_8_id), (nl.pickup_location_9_id), (nl.pickup_location_10_id),
            (nl.delivery_location_2_id), (nl.delivery_location_3_id), (nl.delivery_location_4_id),
            (nl.delivery_location_5_id), (nl.delivery_location_6_id), (nl.delivery_location_7_id),
            (nl.delivery_location_8_id), (nl.delivery_location_9_id), (nl.delivery_location_10_id)
          ) v(x) where v.x is not null) as extra_stops
  from ct_rt_legs l
  left join orders o          on o.id  = l.order_id
  left join national_loads nl on nl.id = l.nat_load_id
)
select leg.rt_id,
       string_agg(coalesce(lf.city, lf.name) || ' → ' || coalesce(lt.city, lt.name),
                  ' · ' order by leg.seq nulls last, leg.load_d nulls last, leg.leg_id) as route_text,
       jsonb_agg(jsonb_build_object(
           'dir',   leg.direction,
           'load',  leg.load_d,
           'deliv', leg.deliv_d,
           'from',  jsonb_build_object('name', lf.name, 'city', lf.city, 'country', lf.country),
           'to',    jsonb_build_object('name', lt.name, 'city', lt.city, 'country', lt.country),
           'extra_stops', leg.extra_stops)
         order by leg.seq nulls last, leg.load_d nulls last, leg.leg_id) as route_legs
from leg
left join locations lf on lf.id = leg.from_id
left join locations lt on lt.id = leg.to_id
group by leg.rt_id;

-- Privileges survive CREATE OR REPLACE (as in 012); restated so this file
-- stands alone (αρχή 5). dl_v_entries is untouched — its own SQL and column
-- list didn't change, and its grants (012) were never affected by this file.
revoke all on dl_v_rt_route from public, anon, authenticated;
grant select on dl_v_rt_route to service_role;

-- Proof after running:
-- 1) every existing leg got a seq (expect null_seq = 0):
--   select count(*) filter (where seq is null) as null_seq, count(*) as legs from ct_rt_legs;
-- 2) route_legs now reflects that order (expect the same 96 legs / 0 nameless
--    as 012's own proof — this migration reorders, it does not remove data):
--   select count(*) filter (where (l->'from'->>'name') is null or (l->'to'->>'name') is null) as nameless,
--          count(*) as legs from dl_v_rt_route r, jsonb_array_elements(r.route_legs) l;
