-- ============================================================
-- COSTS Φ1 — Migration 001: schema ct_* (COSTS_ARCHITECTURE §2)
-- Τρέξε το ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
-- RLS: ΟΧΙ εδώ — πρόσβαση μόνο μέσω Worker service key, enforcement στο
-- API layer (can() map) όπως όλο το v2. (COSTS_ARCHITECTURE §5)
-- ============================================================

-- 2.1 Ρυθμίσεις
create table ct_settings (
  key        text primary key,
  value      numeric not null,
  updated_at timestamptz not null default now()
);
insert into ct_settings (key, value) values
  ('x_export', 850),            -- VS transfer, σκέλος export (locked §10.2.6)
  ('x_import', 650),            -- VS transfer, σκέλος import
  ('pallet_eur', 12),           -- αξία παλέτας EUR (Partner PnL, Φ5)
  ('vat_default', 0.24),        -- προεπιλογή ΦΠΑ χειροκίνητης καταχώρησης
  ('wear_fallback_eur_km', 0.082); -- φθορά €/km όταν δεν υπάρχει 12μηνο maint

create or replace function ct_setting(p_key text) returns numeric
language sql stable as $$ select value from ct_settings where key = p_key $$;

-- 2.2 Round Trips
create sequence ct_rt_code_seq start 1001;
create table ct_round_trips (
  id         bigint generated always as identity primary key,
  code       text unique not null default ('RT-' || nextval('ct_rt_code_seq')::text),
  scope      text not null check (scope in ('INTL','NATL')),
  trip_type  text not null check (trip_type in ('OWNED','PARTNER')),
  truck_id   bigint references trucks(id),
  driver_id  bigint references drivers(id),
  partner_id bigint references partners(id),
  date_start date not null,               -- allocation window: ΤΟ κλειδί του engine
  date_end   date,
  status     text not null default 'planned'
             check (status in ('planned','in_progress','closed','complete','cancelled')),
  total_km   integer,                     -- manual τώρα, MyGeotab Phase 2
  source     text not null default 'planner' check (source in ('planner','manual')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owned_needs_truck     check (trip_type <> 'OWNED'   or truck_id   is not null),
  constraint partner_needs_partner check (trip_type <> 'PARTNER' or partner_id is not null),
  constraint window_order check (date_end is null or date_end >= date_start)
);
create index ct_rt_truck_window on ct_round_trips (truck_id, date_start, date_end);

-- 2.3 Σκέλη → orders / national_loads (έσοδα ΠΑΝΤΑ JOIN, ποτέ αντιγραφή)
create table ct_rt_legs (
  id          bigint generated always as identity primary key,
  rt_id       bigint not null references ct_round_trips(id) on delete cascade,
  direction   text not null check (direction in ('EXPORT','IMPORT','ANODOS','KATHODOS')),
  order_id    bigint references orders(id),
  nat_load_id bigint references national_loads(id),
  constraint one_source check ((order_id is null) <> (nat_load_id is null))
);
create unique index ct_leg_order    on ct_rt_legs(order_id)    where order_id    is not null;
create unique index ct_leg_nat_load on ct_rt_legs(nat_load_id) where nat_load_id is not null;
create index ct_leg_rt on ct_rt_legs(rt_id);

-- 2.4 Παραστατικά κόστους
create table ct_cost_docs (
  id          bigint generated always as identity primary key,
  source      text not null check (source in ('DKV','DADI','STANDALONE','MANUAL')),
  entity      text check (entity in ('VERMION_FRESH','EUROFRESH')),
  invoice_no  text,
  period_from date,
  period_to   date,
  total_gross numeric(10,2),              -- reconciliation guard (§4)
  status      text not null default 'draft' check (status in ('draft','confirmed')),
  file_url    text,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

-- 2.5 Γραμμές κόστους (και fuel ledger: liters + km_reading)
create table ct_cost_lines (
  id          bigint generated always as identity primary key,
  doc_id      bigint references ct_cost_docs(id) on delete cascade,  -- null = Shape C (χειροκίνητο)
  rt_id       bigint references ct_round_trips(id),                  -- null = ακατανέμητο
  category    text not null check (category in
              ('fuel','tolls','dkv','adblue','driver_pay','cash_m','spedition',
               'accommodation','ferry_train','fines','partner_rate','other')),
  toll_country char(2),
  net         numeric(10,2) not null default 0,  -- ΦΠΑ ΧΩΡΙΣΤΑ (locked §10.3)
  vat         numeric(10,2) not null default 0,
  line_date   date,
  plate_raw   text,
  truck_id    bigint references trucks(id),
  km_reading  integer,
  liters      numeric(8,2),
  station     text,
  alloc_status text not null default 'unallocated'
              check (alloc_status in ('allocated','unallocated','review')),
  note        text,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create index ct_line_rt      on ct_cost_lines(rt_id);
create index ct_line_pending on ct_cost_lines(alloc_status) where alloc_status <> 'allocated';
create index ct_line_doc     on ct_cost_lines(doc_id);

-- 2.6 Πινακίδες — aliases
create table ct_plate_aliases (
  alias    text primary key,              -- normalized: uppercase, χωρίς κενά/παύλες
  truck_id bigint not null references trucks(id)
);

-- ============================================================
-- VIEWS — τίποτα υπολογισμένο δεν αποθηκεύεται
-- ============================================================

-- Maintenance bridge (locked §10.2.10): €/km ανά truck από 12μηνο
-- maint_history ÷ Σ km των RT της ίδιας περιόδου· fallback από settings.
create or replace view ct_v_wear_rate as
with m as (
  select truck_id, sum(cost) as maint_cost
  from maint_history
  where truck_id is not null and deleted_at is null
    and service_date >= current_date - interval '12 months'
  group by truck_id
), k as (
  select truck_id, sum(total_km) as km
  from ct_round_trips
  where truck_id is not null and status <> 'cancelled'
    and date_start >= current_date - interval '12 months'
  group by truck_id
)
select t.id as truck_id,
       case when coalesce(k.km,0) > 0 and m.maint_cost is not null
            then round(m.maint_cost / k.km, 4)
            else ct_setting('wear_fallback_eur_km') end as eur_per_km
from trucks t
left join m on m.truck_id = t.id
left join k on k.truck_id = t.id;

-- Έσοδα ανά RT (locked §10.2.6 — VS internal transfer):
--  INTL leg:  orders.price − X(direction) όταν veroia_switch
--  NATL leg VS (source_type='Direct' + source_order_id): revenue = X(direction)
--  NATL λοιπά (groupage/independent): 0 σε Φ1 — TODO Φ2 (πηγή: national_orders.price)
create or replace view ct_v_rt_revenue as
select rt.id as rt_id,
       coalesce(sum(
         case
           when l.order_id is not null then
             coalesce(o.price,0)
             - case when o.veroia_switch
                    then case when o.direction = 'Export' then ct_setting('x_export')
                              else ct_setting('x_import') end
                    else 0 end
           when nl.source_type = 'Direct' and nl.source_order_id is not null then
             case when nl.direction = 'ΑΝΟΔΟΣ' then ct_setting('x_export')
                  else ct_setting('x_import') end
           else 0
         end), 0) as revenue
from ct_round_trips rt
left join ct_rt_legs l on l.rt_id = rt.id
left join orders o on o.id = l.order_id
left join national_loads nl on nl.id = l.nat_load_id
group by rt.id;

-- Κόστη ανά RT: Σ(net) + φθορά (Shape D, μόνο OWNED) · Σ(vat)
create or replace view ct_v_rt_costs as
select rt.id as rt_id,
       coalesce(c.net,0) as lines_net,
       coalesce(c.vat,0) as vat,
       case when rt.trip_type = 'OWNED' and rt.total_km is not null
            then round(coalesce(w.eur_per_km, ct_setting('wear_fallback_eur_km')) * rt.total_km, 2)
            else 0 end as wear
from ct_round_trips rt
left join (select rt_id, sum(net) as net, sum(vat) as vat
           from ct_cost_lines where rt_id is not null group by rt_id) c on c.rt_id = rt.id
left join ct_v_wear_rate w on w.truck_id = rt.truck_id;

-- TRIP PnL (locked §10.3 — ΔΥΟ margins, με ΦΠΑ = primary/worst case)
create or replace view ct_v_rt_pnl as
select rt.id, rt.code, rt.scope, rt.trip_type, rt.truck_id, rt.driver_id,
       rt.partner_id, rt.date_start, rt.date_end, rt.status, rt.total_km,
       r.revenue,
       (c.lines_net + c.wear)          as cost_net,
       c.vat                           as cost_vat,
       (c.lines_net + c.wear + c.vat)  as cost_gross,
       r.revenue - (c.lines_net + c.wear + c.vat) as profit_worst,
       r.revenue - (c.lines_net + c.wear)         as profit_ex_vat,
       case when r.revenue > 0
            then round((r.revenue - (c.lines_net + c.wear + c.vat)) / r.revenue * 100, 1) end as margin_worst_pct,
       case when r.revenue > 0
            then round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100, 1) end as margin_ex_vat_pct
from ct_round_trips rt
join ct_v_rt_revenue r on r.rt_id = rt.id
join ct_v_rt_costs   c on c.rt_id = rt.id
where rt.status <> 'cancelled';

-- Κατανάλωση (Φ5 UI, το view από τώρα): λίτρα/km ανά truck/μήνα
create or replace view ct_v_consumption as
select rt.truck_id,
       date_trunc('month', rt.date_start)::date as month,
       sum(l.liters) as liters,
       sum(rt.total_km) as km
from ct_round_trips rt
join (select rt_id, sum(liters) as liters from ct_cost_lines
      where category = 'fuel' and liters is not null group by rt_id) l on l.rt_id = rt.id
where rt.truck_id is not null
group by rt.truck_id, date_trunc('month', rt.date_start);

-- ============================================================
-- ΕΛΕΓΧΟΣ (τρέξε μετά — περιμένεις 5 settings, 0 rows στα υπόλοιπα):
--   select * from ct_settings;
--   select count(*) from ct_round_trips;
--   select * from ct_v_rt_pnl limit 5;
--   select * from ct_v_wear_rate limit 5;
-- ============================================================

-- 001_rollback (ΜΟΝΟ αν χρειαστεί να ξανατρέξει από την αρχή):
-- drop view if exists ct_v_consumption, ct_v_rt_pnl, ct_v_rt_costs,
--   ct_v_rt_revenue, ct_v_wear_rate;
-- drop table if exists ct_plate_aliases, ct_cost_lines, ct_cost_docs,
--   ct_rt_legs, ct_round_trips, ct_settings cascade;
-- drop function if exists ct_setting(text);
-- drop sequence if exists ct_rt_code_seq;
