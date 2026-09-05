-- ============================================================
-- COSTS — Migration 011: Driver ledger (Μισθοδοσία Οδηγών = καρτέλα οδηγού)
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
-- Spec: docs/superpowers/specs/2026-09-05-driver-payroll-ledger-design.md
--
-- Why a new table and not ct_cost_lines: the Excel history (2,500+ rows) has
-- no round trips to hang from, and today there are 20 RTs with 0 driver_pay
-- lines. The ledger becomes THE source for driver money; TRIP PnL reads it
-- (revises TRIP_COSTS_SPEC §10.1 #5 as to the table, not the principle).
-- ============================================================

-- 1. Entries ---------------------------------------------------
create table dl_entries (
  id            bigint generated always as identity primary key,
  driver_id     bigint not null references drivers(id),
  entry_type    text not null check (entry_type in ('trip','payment_cash','payment_bank','adjustment')),
  entry_date    date not null,                 -- trip: departure · payment: date
  date_end      date,                          -- trip only; NULL while on the road
  route         text,                          -- free text (Excel/manual); NULL when rt_id gives it
  rt_id         bigint references ct_round_trips(id),
  trip_value    numeric(10,2),                 -- Αξία· NULL = pending (never 0 for unknown)
  advance       numeric(10,2),                 -- Έλαβε
  expenses      numeric(10,2),                 -- Έξοδα Μ (no receipt)
  amount        numeric(10,2),                 -- payment / adjustment (signed for adjustment)
  balance_delta numeric(10,2) generated always as (
                  case entry_type
                    when 'trip'       then coalesce(trip_value,0) - (coalesce(advance,0) - coalesce(expenses,0))
                    when 'adjustment' then coalesce(amount,0)
                    else -coalesce(amount,0)
                  end) stored,
  source        text not null default 'manual' check (source in ('manual','auto','excel_import')),
  import_batch  uuid,
  needs_review  boolean not null default false,
  review_note   text,
  note          text,
  deleted_at    timestamptz,
  deleted_reason text,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- shape per type: the DB refuses a payment with a trip value and a trip
  -- with a payment amount, on every path including the import RPC
  constraint dl_trip_shape    check (entry_type <> 'trip' or amount is null),
  constraint dl_payment_shape check (entry_type not in ('payment_cash','payment_bank')
                                     or (amount > 0 and trip_value is null and advance is null
                                         and expenses is null and rt_id is null and date_end is null)),
  constraint dl_adjust_shape  check (entry_type <> 'adjustment'
                                     or (amount <> 0 and trip_value is null and advance is null
                                         and expenses is null and rt_id is null and date_end is null)),
  constraint dl_window        check (date_end is null or date_end >= entry_date),
  constraint dl_cancel_reason check (deleted_at is null or deleted_reason is not null)
);
create index dl_driver_date on dl_entries (driver_id, entry_date, id);
create index dl_rt          on dl_entries (rt_id);
create index dl_batch       on dl_entries (import_batch);
-- one live ledger line per round trip
create unique index dl_rt_live on dl_entries (rt_id) where rt_id is not null and deleted_at is null;

create table dl_import_batches (
  id            uuid primary key,
  driver_id     bigint not null references drivers(id),
  file_name     text not null,
  file_hash     text not null unique,          -- same file twice ⇒ 409 at the Worker
  row_count     integer not null,
  final_balance numeric(10,2) not null,        -- what the importer computed = Excel's last ΠΡΟΟΔΕΥΤΙΚΟ
  created_by    text not null,
  created_at    timestamptz not null default now()
);

-- Born closed (principle 5). service_role: no DELETE — cancel only.
revoke all on dl_entries, dl_import_batches from public, anon, authenticated;
grant select, insert, update on dl_entries to service_role;
grant select, insert on dl_import_batches to service_role;

-- 2. Views ------------------------------------------------------
-- Route text for linked trips: first loading city → first unloading city of
-- each leg. Free-text `route` (Excel/manual) wins when present.
create or replace view dl_v_rt_route with (security_invoker = true) as
select l.rt_id,
       string_agg(coalesce(lf.city, lf.name, nf.city, nf.name) || ' → ' || coalesce(lt.city, lt.name, nt.city, nt.name), ' · ' order by l.id) as route_text
from ct_rt_legs l
left join orders o          on o.id = l.order_id
left join locations lf      on lf.id = o.loading_location_1_id
left join locations lt      on lt.id = o.unloading_location_1_id
left join national_loads nl on nl.id = l.nat_load_id
left join locations nf      on nf.id = nl.pickup_location_1_id
left join locations nt      on nt.id = nl.delivery_location_1_id
group by l.rt_id;

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
         over (partition by e.driver_id order by e.entry_date, e.id rows unbounded preceding) as running_balance
from dl_entries e
left join ct_round_trips rt on rt.id = e.rt_id
left join dl_v_rt_route rr  on rr.rt_id = e.rt_id;

create or replace view dl_v_balance with (security_invoker = true) as
with live as (select * from dl_entries where deleted_at is null),
     last_trip as (
       select distinct on (driver_id) driver_id, entry_date, date_end, rt_id, route
       from live where entry_type = 'trip' order by driver_id, entry_date desc, id desc),
     last_pay as (
       select distinct on (driver_id) driver_id, entry_date, entry_type
       from live where entry_type in ('payment_cash','payment_bank') order by driver_id, entry_date desc, id desc),
     agg as (
       select driver_id,
              sum(balance_delta) as balance,
              count(*) filter (where entry_type = 'trip' and entry_date >= date_trunc('year', current_date)) as trips_ytd,
              count(*) filter (where entry_type = 'trip' and trip_value is null) as pending_count,
              count(*) filter (where needs_review) as review_count,
              max(entry_date) as last_entry_date
       from live group by driver_id)
select d.id as driver_id, d.full_name, d.type, d.active,
       coalesce(a.balance, 0) as balance,
       (a.driver_id is not null) as has_entries,
       coalesce(a.trips_ytd, 0) as trips_ytd,
       coalesce(a.pending_count, 0) as pending_count,
       coalesce(a.review_count, 0) as review_count,
       a.last_entry_date,
       (current_date - a.last_entry_date) as days_since_last_entry,
       lt.entry_date as last_trip_date, lt.date_end as last_trip_end,
       coalesce(lt.route, rr.route_text, rt.code) as last_trip_route,
       rt.code as last_trip_rt_code,
       lp.entry_date as last_payment_date, lp.entry_type as last_payment_type
from drivers d
left join agg a        on a.driver_id = d.id
left join last_trip lt on lt.driver_id = d.id
left join ct_round_trips rt on rt.id = lt.rt_id
left join dl_v_rt_route rr  on rr.rt_id = lt.rt_id
left join last_pay lp  on lp.driver_id = d.id
where d.deleted_at is null;

-- Reconciliation: owned, non-cancelled RTs with a driver and NO live ledger
-- line. Normally 0. Shown on the list as a counter (principle 1).
create or replace view dl_v_rt_gap with (security_invoker = true) as
select rt.id as rt_id, rt.code, rt.driver_id, rt.date_start
from ct_round_trips rt
where rt.trip_type = 'OWNED' and rt.driver_id is not null and rt.status <> 'cancelled'
  and not exists (select 1 from dl_entries e where e.rt_id = rt.id and e.deleted_at is null);

revoke all on dl_v_rt_route, dl_v_entries, dl_v_balance, dl_v_rt_gap from public, anon, authenticated;
grant select on dl_v_rt_route, dl_v_entries, dl_v_balance, dl_v_rt_gap to service_role;

-- 3. Trigger: every owned RT with a driver gets a ledger line ---
create or replace function dl_sync_from_rt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  live dl_entries%rowtype;
  has_amounts boolean;
begin
  select * into live from dl_entries where rt_id = new.id and deleted_at is null limit 1;
  has_amounts := live.trip_value is not null or live.advance is not null or live.expenses is not null;

  -- A ledger line must not sit attributed to a driver who no longer drives
  -- this RT (trip_type moved off OWNED, or the driver was unassigned) with
  -- no trace of it (principle 1): flag it for review if amounts were already
  -- entered, otherwise cancel it — mirrors the RT-cancelled handling below.
  if new.trip_type <> 'OWNED' or new.driver_id is null then
    if live.id is null then
      return new;                                   -- nothing to do
    elsif has_amounts then
      update dl_entries set needs_review = true,
        review_note = 'RT ' || new.code || ' έμεινε χωρίς οδηγό μας ' || to_char(now(), 'DD/MM/YYYY') || ', μετά την καταχώρηση ποσών',
        updated_at = now() where id = live.id;
      return new;
    else
      update dl_entries set deleted_at = now(), deleted_reason = 'RT ' || new.code || ' έμεινε χωρίς οδηγό μας',
        updated_at = now() where id = live.id;
      return new;
    end if;
  end if;

  if live.id is null then
    if new.status <> 'cancelled' then
      -- amounts stay NULL on purpose (owner 5/9): the advance is not always 300
      insert into dl_entries (driver_id, entry_type, entry_date, date_end, rt_id, source, created_by)
      values (new.driver_id, 'trip', new.date_start, new.date_end, new.id, 'auto', 'trigger:' || new.created_by);
    end if;
    return new;
  end if;

  if new.status = 'cancelled' then
    if has_amounts then
      update dl_entries set needs_review = true,
        review_note = 'RT ' || new.code || ' ακυρώθηκε ' || to_char(now(), 'DD/MM/YYYY') || ' μετά την καταχώρηση ποσών',
        updated_at = now() where id = live.id;
    else
      update dl_entries set deleted_at = now(), deleted_reason = 'RT ' || new.code || ' ακυρώθηκε',
        updated_at = now() where id = live.id;
    end if;
    return new;
  end if;

  -- driver and dates ALWAYS follow the RT; a driver change after amounts were
  -- written is flagged, never silently rewritten
  update dl_entries set
    driver_id  = new.driver_id,
    entry_date = new.date_start,
    date_end   = new.date_end,
    needs_review = case when live.driver_id <> new.driver_id and has_amounts then true else needs_review end,
    review_note  = case when live.driver_id <> new.driver_id and has_amounts
                        then 'άλλαξε οδηγός ' || live.driver_id || '→' || new.driver_id || ' στις ' || to_char(now(), 'DD/MM/YYYY') || ', μετά την καταχώρηση ποσών'
                        else review_note end,
    updated_at = now()
  where id = live.id
    and (live.driver_id <> new.driver_id or live.entry_date <> new.date_start
         or live.date_end is distinct from new.date_end);
  return new;
end $$;

drop trigger if exists dl_sync_from_rt on ct_round_trips;
create trigger dl_sync_from_rt after insert or update on ct_round_trips
  for each row execute function dl_sync_from_rt();

-- 4. Import RPC: one batch per driver, all-or-nothing --------------
create or replace function dl_import(p_driver_id bigint, p_batch uuid, p_file_name text, p_file_hash text, p_rows jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n int;
  bal numeric(10,2);
begin
  if exists (select 1 from dl_import_batches where file_hash = p_file_hash) then
    raise exception 'DL_DUPLICATE_FILE' using errcode = 'unique_violation';
  end if;
  insert into dl_entries (driver_id, entry_type, entry_date, date_end, route, trip_value, advance, expenses, amount, note, source, import_batch, created_by)
  select p_driver_id, r->>'entry_type', (r->>'entry_date')::date, (r->>'date_end')::date, r->>'route',
         (r->>'trip_value')::numeric, (r->>'advance')::numeric, (r->>'expenses')::numeric, (r->>'amount')::numeric,
         r->>'note', 'excel_import', p_batch, p_actor
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  select coalesce(sum(balance_delta), 0) into bal from dl_entries where import_batch = p_batch;
  insert into dl_import_batches (id, driver_id, file_name, file_hash, row_count, final_balance, created_by)
  values (p_batch, p_driver_id, p_file_name, p_file_hash, n, bal, p_actor);
  return jsonb_build_object('batch', p_batch, 'rows', n, 'balance', bal);
end $$;

create or replace function dl_cancel_batch(p_batch uuid, p_reason text, p_actor text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update dl_entries set deleted_at = now(), deleted_reason = p_reason || ' (' || p_actor || ')', updated_at = now()
  where import_batch = p_batch and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function dl_import(bigint, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function dl_cancel_batch(uuid, text, text) from public, anon, authenticated;
grant execute on function dl_import(bigint, uuid, text, text, jsonb, text) to service_role;
grant execute on function dl_cancel_batch(uuid, text, text) to service_role;

-- 5. TRIP PnL reads the ledger ---------------------------------------
-- Move the single existing cash_m line (id 3, 50 €, RT-1014, driver 52) into
-- the ledger BEFORE the category is forbidden, then remove it from cost lines
-- so it is not counted twice. Value stays NULL = pending.
insert into dl_entries (driver_id, entry_type, entry_date, date_end, rt_id, expenses, source, created_by, note)
select rt.driver_id, 'trip', rt.date_start, rt.date_end, rt.id, l.net, 'manual', 'migration:011',
       'μεταφέρθηκε από ct_cost_lines #' || l.id || ' (cash_m 50 €) — migration 011'
from ct_cost_lines l join ct_round_trips rt on rt.id = l.rt_id
where l.id = 3 and l.category = 'cash_m';
delete from ct_cost_lines where id = 3 and category = 'cash_m';

alter table ct_cost_lines drop constraint ct_cost_lines_category_check;
alter table ct_cost_lines add constraint ct_cost_lines_category_check check (category in
  ('fuel','reefer_fuel','tolls','dkv','adblue','spedition','accommodation','ferry_train','fines','partner_rate','fixed_alloc','other'));

create or replace view ct_v_rt_costs with (security_invoker = true) as
select rt.id as rt_id,
       coalesce(c.net,0) + coalesce(dl.trip_value,0) + coalesce(dl.expenses,0) as lines_net,
       coalesce(c.vat,0) as vat,
       case when rt.trip_type = 'OWNED' and rt.total_km is not null
            then round(coalesce(w.eur_per_km, ct_setting('wear_fallback_eur_km')) * rt.total_km, 2)
            else 0 end as wear,
       dl.trip_value as dl_trip_value,
       dl.expenses   as dl_expenses,
       (dl.id is not null and dl.trip_value is null) as driver_pay_pending,
       (rt.trip_type = 'OWNED' and rt.driver_id is not null and dl.id is null) as driver_pay_missing
from ct_round_trips rt
left join (select rt_id, sum(net) as net, sum(vat) as vat
           from ct_cost_lines where rt_id is not null group by rt_id) c on c.rt_id = rt.id
left join dl_entries dl on dl.rt_id = rt.id and dl.deleted_at is null
left join ct_v_wear_rate w on w.truck_id = rt.truck_id;

create or replace view ct_v_rt_pnl with (security_invoker = true) as
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
            then round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100, 1) end as margin_ex_vat_pct,
       c.dl_trip_value, c.dl_expenses, c.driver_pay_pending, c.driver_pay_missing
from ct_round_trips rt
join ct_v_rt_revenue r on r.rt_id = rt.id
join ct_v_rt_costs   c on c.rt_id = rt.id
where rt.status <> 'cancelled';

-- These two existed open since 001 (Supabase grants anon on new objects).
-- They now carry driver pay, so they close here (principle 5).
revoke all on ct_v_rt_costs, ct_v_rt_pnl from public, anon, authenticated;
grant select on ct_v_rt_costs, ct_v_rt_pnl to service_role;

-- 6. Backfill: existing owned RTs with a driver get their pending line now
update ct_round_trips set updated_at = updated_at
where trip_type = 'OWNED' and driver_id is not null and status <> 'cancelled';

select 'MIGRATION 011 OK' as status;

-- ============================================================
-- ΕΛΕΓΧΟΣ (αναμενόμενα 5/9/2026):
--   select count(*) from dl_entries;                       -- = πλήθος OWNED RT με οδηγό (η γραμμή 50 € ανήκει στο RT-1014, δεν προστίθεται ξεχωριστά)
--   select count(*) from dl_v_rt_gap;                      -- 0
--   select count(*) from ct_cost_lines where category in ('driver_pay','cash_m'); -- 0
--   select has_table_privilege('anon','dl_entries','SELECT');           -- false
--   select has_table_privilege('service_role','dl_entries','DELETE');   -- false
--   select driver_pay_pending, dl_expenses from ct_v_rt_pnl where code='RT-1014'; -- true, 50.00
--   select has_table_privilege('anon','ct_v_rt_pnl','SELECT');          -- false
--   -- security_invoker: ο service_role πρέπει να διαβάζει ό,τι διαβάζουν τα views.
--   -- Μετρήθηκε 5/9/2026 ΠΡΙΝ το migration: όλα true (rt, lines, wear, revenue,
--   -- settings, orders, national_loads, locations, drivers, maint_history, trucks,
--   -- ct_setting EXECUTE). Ξαναμέτρησέ το ΜΕΤΑ — αν ένα γυρίσει false, το /costs/pnl
--   -- πέφτει με permission denied.
--   select has_table_privilege('service_role','ct_round_trips','SELECT'),
--          has_table_privilege('service_role','ct_cost_lines','SELECT'),
--          has_table_privilege('service_role','ct_v_wear_rate','SELECT'),
--          has_table_privilege('service_role','ct_v_rt_revenue','SELECT'),
--          has_function_privilege('service_role','ct_setting(text)','EXECUTE'); -- all true
-- ============================================================
-- 011_rollback: drop trigger dl_sync_from_rt on ct_round_trips; drop function
-- dl_sync_from_rt, dl_import, dl_cancel_batch; drop view dl_v_rt_gap,
-- dl_v_balance, dl_v_entries, dl_v_rt_route; ξανατρέξε τα ct_v_rt_costs /
-- ct_v_rt_pnl της 001 (γρ. 172-201) και το CHECK της 001 με τις 14 κατηγορίες;
-- drop table dl_entries, dl_import_batches. Η γραμμή 50 € ξαναμπαίνει με
-- χέρι από το audit_log.
