-- 021 — Split legs in the round-trip P&L (owner 7/9/2026)
--
-- «Το κόστος της ανάθεσης [συνεργάτη] να είναι έξοδο του RT — παρά να
-- δημιουργούνται 2 νέα. Ίσως θα έπρεπε να δημιουργηθεί μια στήλη στα costs που
-- να υπολογίζει αυτό.» Two rules, both DERIVED in the views (αρχή 3: the rate
-- already lives in partner_assignments — writing it again as a cost line from
-- the screen is a second source that drifts; αρχή 4: a view catches every path):
--
-- 1. REVENUE of a split: the customer's price sits on the PARENT, which never
--    joins a round trip. Leg 1's round trip takes it (one price, one trip —
--    the owner's «ένας γύρος»). A second OWN truck on leg 2 gets its own trip
--    for the driver's payroll but no revenue (P&L allocation deferred, locked
--    decision «Net Price»).
-- 2. PARTNER COST of a split: the partner leg never gets a trip of its own;
--    its agreed rate (partner_assignments.partner_rate, latest live row) is a
--    planned cost of the sibling leg's trip. An invoiced partner line
--    (ct_cost_lines.category = 'partner_rate') REPLACES the plan when present
--    — invoice beats plan, never both.
-- Nothing changes for trips without split legs: their own order's partner
-- assignment is the plan; their existing partner_rate lines still win.

begin;

create or replace view ct_v_rt_revenue as
select rt.id as rt_id,
  coalesce(sum(case
    when l.order_id is not null then
      coalesce(o.price, case when o.leg_no = 1 then p.price end, 0)
      - case when (case when o.parent_order_id is not null then p.veroia_switch else o.veroia_switch end) then
            case when (case when o.parent_order_id is not null then p.direction else o.direction end) = 'Export'
                 then ct_setting('x_export') else ct_setting('x_import') end
          else 0 end
    when nl.source_type = 'Direct' and nl.source_order_id is not null then
      case when nl.direction = 'ΑΝΟΔΟΣ' then ct_setting('x_export') else ct_setting('x_import') end
    else 0 end), 0) as revenue
from ct_round_trips rt
left join ct_rt_legs l on l.rt_id = rt.id
left join orders o on o.id = l.order_id
left join orders p on p.id = o.parent_order_id
left join national_loads nl on nl.id = l.nat_load_id
group by rt.id;

create or replace view ct_v_rt_costs as
with lines as (
  select rt_id,
         sum(net) filter (where category <> 'partner_rate') as net_other,
         sum(vat)                                          as vat,
         sum(net) filter (where category = 'partner_rate') as partner_invoiced
  from ct_cost_lines where rt_id is not null group by rt_id),
-- Orders whose partner rate belongs to this trip: every order that is a leg of
-- the trip, plus every split SIBLING of such a leg that is assigned to a partner
-- and has no live trip of its own.
carried as (
  select l.rt_id, o.id as order_id from ct_rt_legs l join orders o on o.id = l.order_id
  union
  select l.rt_id, s.id
  from ct_rt_legs l
  join orders o on o.id = l.order_id and o.parent_order_id is not null
  join orders s on s.parent_order_id = o.parent_order_id and s.id <> o.id
               and s.deleted_at is null and s.partner_id is not null
  where not exists (select 1 from ct_rt_legs l2 join ct_round_trips r2 on r2.id = l2.rt_id
                    where l2.order_id = s.id and r2.status <> 'cancelled')),
planned as (
  select c.rt_id, sum(pa.partner_rate) as partner_planned
  from carried c
  join lateral (select partner_rate from partner_assignments pa
                where pa.order_id = c.order_id and pa.deleted_at is null and pa.status <> 'Cancelled'
                order by pa.id desc limit 1) pa on true
  group by c.rt_id)
select rt.id as rt_id,
  coalesce(li.net_other, 0)
    + coalesce(nullif(li.partner_invoiced, 0), pl.partner_planned, 0)
    + coalesce(dl.trip_value, 0) + coalesce(dl.expenses, 0)          as lines_net,
  coalesce(li.vat, 0)                                                as vat,
  case when rt.trip_type = 'OWNED' and rt.total_km is not null
       then round(coalesce(w.eur_per_km, ct_setting('wear_fallback_eur_km')) * rt.total_km::numeric, 2)
       else 0 end                                                    as wear,
  dl.trip_value                                                      as dl_trip_value,
  dl.expenses                                                        as dl_expenses,
  dl.id is not null and dl.trip_value is null                        as driver_pay_pending,
  rt.trip_type = 'OWNED' and rt.driver_id is not null and dl.id is null as driver_pay_missing,
  coalesce(pl.partner_planned, 0)                                    as partner_planned,
  coalesce(li.partner_invoiced, 0)                                   as partner_invoiced
from ct_round_trips rt
left join lines   li on li.rt_id = rt.id
left join planned pl on pl.rt_id = rt.id
left join dl_entries dl on dl.rt_id = rt.id and dl.deleted_at is null
left join ct_v_wear_rate w on w.truck_id = rt.truck_id;

create or replace view ct_v_rt_pnl as
select rt.id, rt.code, rt.scope, rt.trip_type, rt.truck_id, rt.driver_id, rt.partner_id,
  rt.date_start, rt.date_end, rt.status, rt.total_km,
  r.revenue,
  c.lines_net + c.wear                                   as cost_net,
  c.vat                                                  as cost_vat,
  c.lines_net + c.wear + c.vat                           as cost_gross,
  r.revenue - (c.lines_net + c.wear + c.vat)             as profit_worst,
  r.revenue - (c.lines_net + c.wear)                     as profit_ex_vat,
  case when r.revenue > 0 then round((r.revenue - (c.lines_net + c.wear + c.vat)) / r.revenue * 100, 1) end as margin_worst_pct,
  case when r.revenue > 0 then round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100, 1) end         as margin_ex_vat_pct,
  c.dl_trip_value, c.dl_expenses, c.driver_pay_pending, c.driver_pay_missing,
  c.partner_planned, c.partner_invoiced
from ct_round_trips rt
join ct_v_rt_revenue r on r.rt_id = rt.id
join ct_v_rt_costs   c on c.rt_id = rt.id
where rt.status <> 'cancelled';

commit;

-- Proof: trips that carry a planned partner cost, and split trips with revenue
-- select p.code, p.revenue, p.partner_planned, p.partner_invoiced, p.cost_net
-- from ct_v_rt_pnl p where p.partner_planned > 0 or p.partner_invoiced > 0 order by p.code;
-- select r.code, v.revenue from ct_v_rt_revenue v join ct_round_trips r on r.id = v.rt_id
-- join ct_rt_legs l on l.rt_id = r.id join orders o on o.id = l.order_id where o.leg_no = 1;
