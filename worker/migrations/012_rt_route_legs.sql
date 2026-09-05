-- 012 — RT route with detail for the driver ledger (owner 5/9/2026)
--
-- What the ledger must show per leg: the loading NAME (warehouse/location), its
-- city and country, the delivery NAME, city and country, and the loading and
-- delivery dates — for the export leg and for the return leg.
--
-- Why a view column and not joins in the screen: one source (αρχή 3). The
-- payroll list, the driver card and any future print read the same legs.
--
-- Delivery place = the LAST unloading stop, not the first: 11/96 legs differ
-- (measured 5/9). unloading_datetime_N is never written (0/96), so the delivery
-- date is actual_delivery_date, else the planned delivery_datetime.
-- A missing city/country stays null and the screen leaves it out — never
-- invented (K3). route_text is kept for readers that want the short line; it
-- now also points at the last unloading.

create or replace view dl_v_rt_route with (security_invoker = true) as
with leg as (
  select l.rt_id, l.id as leg_id, l.direction,
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
                  ' · ' order by leg.leg_id) as route_text,
       jsonb_agg(jsonb_build_object(
           'dir',   leg.direction,
           'load',  leg.load_d,
           'deliv', leg.deliv_d,
           'from',  jsonb_build_object('name', lf.name, 'city', lf.city, 'country', lf.country),
           'to',    jsonb_build_object('name', lt.name, 'city', lt.city, 'country', lt.country),
           'extra_stops', leg.extra_stops)
         order by leg.load_d nulls last, leg.leg_id) as route_legs
from leg
left join locations lf on lf.id = leg.from_id
left join locations lt on lt.id = leg.to_id
group by leg.rt_id;

-- dl_v_entries: same columns in the same order (CREATE OR REPLACE only appends),
-- plus route_legs at the end. A hand-written route (e.route) wins and hides the
-- generated legs, exactly as it already wins for route_text.
create or replace view dl_v_entries with (security_invoker = true) as
select e.id, e.driver_id, e.entry_type, e.entry_date, e.date_end, e.rt_id, rt.code as rt_code,
       coalesce(e.route, rr.route_text, rt.code) as route_text,
       e.trip_value, e.advance, e.expenses, e.amount, e.balance_delta,
       e.source, e.import_batch, e.needs_review, e.review_note, e.note,
       e.deleted_at, e.deleted_reason, e.created_by, e.created_at, e.updated_at,
       (e.deleted_at is not null) as cancelled,
       (e.entry_type = 'trip' and e.trip_value is null and e.deleted_at is null) as pending,
       -- cancelled rows stay visible but contribute 0
       sum(case when e.deleted_at is null then e.balance_delta else 0 end)
         over (partition by e.driver_id order by e.entry_date, e.id rows unbounded preceding) as running_balance,
       case when e.route is null then rr.route_legs end as route_legs
from dl_entries e
left join ct_round_trips rt on rt.id = e.rt_id
left join dl_v_rt_route rr  on rr.rt_id = e.rt_id;

-- Privileges survive CREATE OR REPLACE; restated so the file stands alone (αρχή 5).
revoke all on dl_v_rt_route, dl_v_entries from public, anon, authenticated;
grant select on dl_v_rt_route, dl_v_entries to service_role;

-- Proof after running (expect 96 legs, 0 without a from/to name):
-- select count(*) filter (where (l->'from'->>'name') is null or (l->'to'->>'name') is null) as nameless,
--        count(*) as legs from dl_v_rt_route r, jsonb_array_elements(r.route_legs) l;
