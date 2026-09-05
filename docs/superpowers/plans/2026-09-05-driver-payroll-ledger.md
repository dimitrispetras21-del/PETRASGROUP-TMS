# Μισθοδοσία Οδηγών (καρτέλα οδηγού) — Πλάνο υλοποίησης

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Αντικατάσταση του Excel-ανά-οδηγό με καρτέλα οδηγού στο TMS: πίνακας `dl_entries` ως πηγή αλήθειας για αμοιβή και Έξοδα Μ, αυτόματη γραμμή από κάθε round trip με οδηγό, τρεις οθόνες, και πλήρης εισαγωγή του ιστορικού με απόδειξη στον πίνακα (Αιμίλιος → 354,76 €).

**Architecture:** Νέος πίνακας `dl_entries` + views (`dl_v_entries`, `dl_v_balance`, `dl_v_rt_gap`) + trigger `dl_sync_from_rt()` στη Supabase. Ο Worker αποκτά πόρο `ledger` μέσα στο υπάρχον `handleCosts` (`/costs/ledger*`). Το TRIP PnL **διαβάζει** αμοιβή/Έξοδα Μ από την καρτέλα (`ct_v_rt_costs`), οι κατηγορίες `driver_pay`/`cash_m` παύουν να γράφονται στο `ct_cost_lines`. Νέο module `modules/payroll.js` (3 οθόνες, Figma `w5-payroll-*`). Εισαγωγή ιστορικού με Python script (dry run προεπιλογή) → RPC `dl_import`.

**Tech Stack:** Postgres/Supabase (SQL editor, τρέχει ο owner) · Cloudflare Worker (`worker/src/index.js`, ESM bundle, deploy με wrangler > 15:00) · Vanilla JS SPA (global scripts, `app.html?v=`) · Python 3 + openpyxl (εργαλείο εισαγωγής) · node:test · Playwright critics (`npm run critics`).

**Spec:** `docs/superpowers/specs/2026-09-05-driver-payroll-ledger-design.md` (εγκεκριμένο 5/9/2026).

## Global Constraints

- **Supabase = SELECT μόνο από agent.** Κάθε migration/εγγραφή την τρέχει ο owner στο SQL editor μετά από ρητή έγκριση στη συνομιλία (CLAUDE.md «ΚΑΝΟΝΕΣ ΒΑΣΗΣ»).
- **Worker deploy μόνο μετά τις 15:00**, με τον φρουρό των τριών πριν και μετά (`order_stops: [..., "DELETE"]` dispatcher · `"VS CD Date": "vs_cd_date"` · 4 πεδία WORKSHOPS). Αν λείπει ένα: ΣΤΑΜΑΤΑ.
- **Κάθε αλλαγή front end ελέγχεται μέχρι τον πίνακα** — 5 ερωτήσεις (endpoint, πίνακας/στήλες, τι γράφτηκε ΟΝΤΩΣ, τι γίνεται στην αποτυχία, δικαίωμα ρόλου).
- **DESIGN.md**: κανένα hex σε module (`grep -c "#[0-9A-Fa-f]\{6\}" modules/payroll.js` → 0)· άγνωστο ≠ 0 (παύλα ή «εκκρεμεί»)· χρώμα **και** λέξη· γραμμή ≤ 44px· χωρίς `text-overflow: ellipsis` σε ονόματα· έξι μεγέθη 28/18/14/13/12/11· `tabular-nums` σε αριθμούς· Syne μόνο σε τίτλους.
- **Ποτέ DELETE** σε `dl_entries` — ακύρωση με `deleted_at` + `deleted_reason`.
- **Ποτέ προσυμπλήρωση Έλαβε/Αξίας** από trigger (owner 5/9): οι τρεις τιμές μπαίνουν NULL.
- **Ρόλοι**: owner, accountant, management → GET/POST/PATCH στο `ledger`. Dispatcher/warehouse: τίποτα. Front end gate: `can('costs') !== 'none'`.
- **Σχόλια κώδικα στα αγγλικά, γράφουν το ΓΙΑΤΙ.** Commits με `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Μετά από κάθε αλλαγή αρχείου του app**: bump `?v=TIMESTAMP` στο `app.html` για το αρχείο, commit, push.
- **Τεστ αποδοχής εισαγωγής**: `ΑΙΜΙΛΙΟΣ.xlsx` → 168 γραμμές, υπόλοιπο **354,76** — διαφορά ⇒ άρνηση.

---

## Χάρτης αρχείων

| Αρχείο | Ευθύνη |
|---|---|
| `worker/migrations/011_driver_ledger.sql` (νέο) | πίνακες `dl_entries`, `dl_import_batches`· views· trigger· RPC `dl_import`, `dl_cancel_batch`· CHECK `ct_cost_lines`· μεταφορά γραμμής 50 €· grants |
| `worker/src/ledger-rules.mjs` (νέο) | καθαρές συναρτήσεις επικύρωσης σώματος POST/PATCH — τεστάρονται με node:test χωρίς Worker |
| `worker/test/ledger-rules.test.mjs` (νέο) | τεστ των κανόνων |
| `worker/src/index.js` (τροποποίηση) | `COSTS_PERMS.ledger`, αφαίρεση `driver_pay`/`cash_m` από `CT_CATEGORIES`, διαδρομές `/costs/ledger*` |
| `tools/import_driver_ledger.py` (νέο) | ανάγνωση xlsx → ταξινόμηση γραμμών → dry run → `POST /costs/ledger/import` |
| `tools/driver-ledger-map.json` (νέο) | αντιστοίχιση ελληνικού ονόματος αρχείου → `drivers.id` |
| `tools/test_import_driver_ledger.py` (νέο) | unittest του parser σε συνθετικό xlsx |
| `modules/payroll.js` (νέο) | 3 οθόνες: λίστα, καρτέλα, φόρμα· καθαρές συναρτήσεις μορφοποίησης εξάγονται για node:test |
| `tests/payroll-format.test.js` (νέο) | τεστ μορφοποίησης (άγνωστο ≠ 0, λέξη δίπλα στο πρόσημο) |
| `core/router.js` (τροποποίηση) | `case 'payroll'` → `renderPayroll()`, NAV χωρίς `soon` |
| `app.html` (τροποποίηση) | `<script src="modules/payroll.js?v=…">` + bumps |
| `modules/costs.js` (τροποποίηση) | αφαίρεση δύο κατηγοριών, γραμμή «Οδηγός (από καρτέλα)» στο ανάπτυγμα |
| `tests/critics/units.js`, `docs/redesign/baseline.json`, `tests/critics/figma-map.js` (τροποποίηση) | η νέα μονάδα μπαίνει στους κριτές |
| `docs/DECISION_LOG.md`, `docs/TRIP_COSTS_DECISION_LOG.md`, `CLAUDE.md` (τροποποίηση) | ίχνος απόφασης + κατάσταση module |

---

### Task 1: Migration 011 — πίνακες, views, trigger, RPC, σύνδεση με PnL

**Files:**
- Create: `worker/migrations/011_driver_ledger.sql`

**Interfaces:**
- Produces: πίνακας `dl_entries` (στήλες όπως spec §2.1), πίνακας `dl_import_batches` (`file_hash` unique), views `dl_v_entries`, `dl_v_balance`, `dl_v_rt_gap`, RPC `dl_import(p_driver_id bigint, p_batch uuid, p_file_name text, p_file_hash text, p_rows jsonb, p_actor text) returns jsonb`, RPC `dl_cancel_batch(p_batch uuid, p_reason text, p_actor text) returns int`, στήλες `ct_v_rt_pnl.driver_pay_pending boolean`, `driver_pay_missing boolean`, `dl_trip_value numeric`, `dl_expenses numeric`.

- [ ] **Step 1: Γράψε το migration**

```sql
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

  if new.trip_type <> 'OWNED' or new.driver_id is null then
    return new;                                   -- partner trips have no driver of ours
  end if;

  if live.id is null then
    if new.status <> 'cancelled' then
      -- amounts stay NULL on purpose (owner 5/9): the advance is not always 300
      insert into dl_entries (driver_id, entry_type, entry_date, date_end, rt_id, source, created_by)
      values (new.driver_id, 'trip', new.date_start, new.date_end, new.id, 'auto', 'trigger:' || new.created_by);
    end if;
    return new;
  end if;

  has_amounts := live.trip_value is not null or live.advance is not null or live.expenses is not null;

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

create or replace view ct_v_rt_costs as
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
            then round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100, 1) end as margin_ex_vat_pct,
       c.dl_trip_value, c.dl_expenses, c.driver_pay_pending, c.driver_pay_missing
from ct_round_trips rt
join ct_v_rt_revenue r on r.rt_id = rt.id
join ct_v_rt_costs   c on c.rt_id = rt.id
where rt.status <> 'cancelled';

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
-- ============================================================
-- 011_rollback: drop trigger dl_sync_from_rt on ct_round_trips; drop function
-- dl_sync_from_rt, dl_import, dl_cancel_batch; drop view dl_v_rt_gap,
-- dl_v_balance, dl_v_entries, dl_v_rt_route; ξανατρέξε τα ct_v_rt_costs /
-- ct_v_rt_pnl της 001 (γρ. 172-201) και το CHECK της 001 με τις 14 κατηγορίες;
-- drop table dl_entries, dl_import_batches. Η γραμμή 50 € ξαναμπαίνει με
-- χέρι από το audit_log.
```

- [ ] **Step 2: Στατικός έλεγχος ότι δεν κόπηκε κάτι**

Run: `grep -c "^create table\|^create or replace view\|^create or replace function\|^create trigger" worker/migrations/011_driver_ledger.sql`
Expected: `12` (2 tables + 6 views + 3 functions + 1 trigger).

- [ ] **Step 3: Ζήτα έγκριση από τον owner και τρέξε στο SQL editor**

Ο agent **δεν** εκτελεί. Στέλνει το αρχείο, ο owner το τρέχει ολόκληρο. Εξήγησε σε δύο προτάσεις τι γράφει (2 πίνακες, 4 views, trigger, 2 RPC, αλλαγή CHECK + 2 views PnL, μεταφορά μίας γραμμής). Ώρα: μετά τις 15:00.

- [ ] **Step 4: Επαλήθευση στη βάση (SELECT μόνο)**

Run (Supabase MCP `execute_sql`):
```sql
select (select count(*) from dl_entries) as entries,
       (select count(*) from dl_v_rt_gap) as gap,
       (select count(*) from ct_cost_lines where category in ('driver_pay','cash_m')) as old_cats,
       has_table_privilege('anon','dl_entries','SELECT') as anon_select,
       has_table_privilege('service_role','dl_entries','DELETE') as sr_delete,
       (select driver_pay_pending from ct_v_rt_pnl where code='RT-1014') as rt1014_pending;
```
Expected: `gap = 0`, `old_cats = 0`, `anon_select = false`, `sr_delete = false`, `rt1014_pending = true`, `entries ≥ 1`.

- [ ] **Step 5: Commit**

```bash
git add worker/migrations/011_driver_ledger.sql
git commit -m "db(costs): migration 011 — driver ledger (dl_entries, views, trigger, dl_import RPC), PnL reads the ledger

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Κανόνες επικύρωσης του Worker ως καθαρό module (TDD)

**Files:**
- Create: `worker/src/ledger-rules.mjs`
- Test: `worker/test/ledger-rules.test.mjs`

**Interfaces:**
- Produces: `validateNewEntry(body) → { row } | { error }` (row = ό,τι μπαίνει στο `dl_entries`, χωρίς `created_by`), `validatePatch(body, before) → { patch, needsReason } | { error }`, `DL_TYPES`, `DL_FIELDS`.
- Το `index.js` (Task 3) τα εισάγει: `import { validateNewEntry, validatePatch } from "./ledger-rules.mjs";`

- [ ] **Step 1: Γράψε τα τεστ που αποτυγχάνουν**

```js
// worker/test/ledger-rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { validateNewEntry, validatePatch } from '../src/ledger-rules.mjs';

test('trip: value/advance/expenses optional (pending), amount forbidden', () => {
  const r = validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17', route: 'ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ' });
  assert.deepStrictEqual(r, { row: { driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17', route: 'ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ', source: 'manual' } });
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', amount: 5 }).error, /amount/);
});

test('payment: amount > 0 required, trip fields forbidden', () => {
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'payment_cash', entry_date: '2026-07-31' }).error, /amount/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-07-31', amount: 950.47, trip_value: 1 }).error, /trip_value/);
  assert.deepStrictEqual(validateNewEntry({ driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-07-31', amount: 950.47 }),
    { row: { driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-07-31', amount: 950.47, source: 'manual' } });
});

test('unknown field is named in the error, never dropped silently', () => {
  const r = validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', salary: 100 });
  assert.match(r.error, /salary/);
});

test('bad type / bad date / date_end before start', () => {
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'bonus', entry_date: '2026-08-10' }).error, /entry_type/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '10/08/2026' }).error, /entry_date/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-01' }).error, /date_end/);
});

test('patch: filling an empty value needs no reason; changing a written one does', () => {
  const before = { entry_type: 'trip', trip_value: null, advance: 300, expenses: null };
  assert.deepStrictEqual(validatePatch({ trip_value: 800 }, before), { patch: { trip_value: 800 }, needsReason: false });
  assert.deepStrictEqual(validatePatch({ advance: 200 }, before), { patch: { advance: 200 }, needsReason: true });
  assert.match(validatePatch({ amount: 5 }, before).error, /amount/);
});

test('patch: cancel needs a reason; review clear needs a reason', () => {
  const before = { entry_type: 'trip', trip_value: 800 };
  assert.match(validatePatch({ cancel: true }, before).error, /reason/);
  const c = validatePatch({ cancel: true, reason: 'διπλή καταχώρηση' }, before);
  assert.strictEqual(c.patch.deleted_reason, 'διπλή καταχώρηση');
  assert.ok(c.patch.deleted_at);
  assert.deepStrictEqual(validatePatch({ needs_review: false, reason: 'ελέγχθηκε' }, before).patch, { needs_review: false, review_note: 'ελέγχθηκε' });
});
```

- [ ] **Step 2: Τρέξε τα τεστ, δες ότι αποτυγχάνουν**

Run: `node --test worker/test/ledger-rules.test.mjs`
Expected: FAIL — `Cannot find module '../src/ledger-rules.mjs'`.

- [ ] **Step 3: Γράψε το module**

```js
// worker/src/ledger-rules.mjs
// Pure validation for /costs/ledger. Lives outside index.js so it can be
// tested with node:test without a Worker runtime. Every rejection names the
// field: an unknown field is a 400, never a silent drop (the facade's trap,
// CLAUDE.md «μηχανισμός-παγίδα 1»).
export const DL_TYPES = ['trip', 'payment_cash', 'payment_bank', 'adjustment'];
export const DL_FIELDS = ['driver_id', 'entry_type', 'entry_date', 'date_end', 'route', 'rt_id',
  'trip_value', 'advance', 'expenses', 'amount', 'note'];
const TRIP_ONLY = ['date_end', 'route', 'rt_id', 'trip_value', 'advance', 'expenses'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function num(v) { return typeof v === 'number' && Number.isFinite(v); }

export function validateNewEntry(body) {
  if (!body || typeof body !== 'object') return { error: 'body required' };
  const unknown = Object.keys(body).filter(k => !DL_FIELDS.includes(k));
  if (unknown.length) return { error: 'unknown field: ' + unknown.join(', ') };
  if (!DL_TYPES.includes(body.entry_type)) return { error: 'entry_type must be one of ' + DL_TYPES.join('|') };
  if (!Number.isInteger(body.driver_id)) return { error: 'driver_id required' };
  if (!ISO.test(body.entry_date || '')) return { error: 'entry_date must be YYYY-MM-DD' };
  const row = { driver_id: body.driver_id, entry_type: body.entry_type, entry_date: body.entry_date };
  if (body.entry_type === 'trip') {
    if (body.amount != null) return { error: 'amount is not allowed on a trip' };
    if (body.date_end != null) {
      if (!ISO.test(body.date_end)) return { error: 'date_end must be YYYY-MM-DD' };
      if (body.date_end < body.entry_date) return { error: 'date_end must not be before entry_date' };
      row.date_end = body.date_end;
    }
    for (const f of ['trip_value', 'advance', 'expenses']) {
      if (body[f] != null) { if (!num(body[f]) || body[f] < 0) return { error: f + ' must be a number ≥ 0' }; row[f] = body[f]; }
    }
    if (body.route != null && String(body.route).trim()) row.route = String(body.route).trim();
    if (body.rt_id != null) { if (!Number.isInteger(body.rt_id)) return { error: 'rt_id must be an integer' }; row.rt_id = body.rt_id; }
  } else {
    for (const f of TRIP_ONLY) if (body[f] != null) return { error: f + ' is not allowed on a ' + body.entry_type };
    if (!num(body.amount)) return { error: 'amount required' };
    if (body.entry_type === 'adjustment' ? body.amount === 0 : body.amount <= 0) return { error: 'amount must be ' + (body.entry_type === 'adjustment' ? '≠ 0' : '> 0') };
    row.amount = body.amount;
  }
  if (body.note != null && String(body.note).trim()) row.note = String(body.note).trim();
  row.source = 'manual';
  return { row };
}

// A PATCH may: fill a NULL amount (no reason), change a written amount/date
// (reason required — it goes to the audit log), cancel (reason required),
// or clear needs_review (reason required).
export function validatePatch(body, before) {
  if (!body || typeof body !== 'object') return { error: 'body required' };
  const reason = String(body.reason || '').trim();
  if (body.cancel) {
    if (!reason) return { error: 'reason required to cancel' };
    return { patch: { deleted_at: new Date().toISOString(), deleted_reason: reason }, needsReason: true };
  }
  if (body.needs_review === false) {
    if (!reason) return { error: 'reason required to clear needs_review' };
    return { patch: { needs_review: false, review_note: reason }, needsReason: true };
  }
  const editable = before.entry_type === 'trip'
    ? ['entry_date', 'date_end', 'route', 'rt_id', 'trip_value', 'advance', 'expenses', 'note']
    : ['entry_date', 'amount', 'note'];
  const patch = {}; let needsReason = false;
  for (const [k, v] of Object.entries(body)) {
    if (k === 'reason') continue;
    if (!editable.includes(k)) return { error: k + ' is not editable on a ' + before.entry_type };
    if (['trip_value', 'advance', 'expenses', 'amount'].includes(k) && v != null && (!num(v) || v < 0)) return { error: k + ' must be a number ≥ 0' };
    if (['entry_date', 'date_end'].includes(k) && v != null && !ISO.test(v)) return { error: k + ' must be YYYY-MM-DD' };
    patch[k] = v;
    // filling an empty field is data entry; overwriting a written one is a correction
    if (k !== 'note' && before[k] != null && before[k] !== v) needsReason = true;
  }
  if (!Object.keys(patch).length) return { error: 'nothing to update' };
  return { patch, needsReason };
}
```

- [ ] **Step 4: Τρέξε τα τεστ, δες ότι περνούν**

Run: `node --test worker/test/ledger-rules.test.mjs`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add worker/src/ledger-rules.mjs worker/test/ledger-rules.test.mjs
git commit -m "worker(ledger): validation rules as a pure module with node:test (unknown field ⇒ named 400)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Worker — πόρος `ledger` στο `handleCosts`

**Files:**
- Modify: `worker/src/index.js:2665-2676` (`CT_CATEGORIES`, `COSTS_PERMS`), `:2688-2858` (routes μέσα στο `handleCosts`), κορυφή αρχείου (import)

**Interfaces:**
- Consumes: `validateNewEntry`, `validatePatch` (Task 2)· views/RPC (Task 1)· helpers `dbSelectRaw(env, table, URLSearchParams) → {rows}`, `dbInsert(env, table, row)`, `ctDbPatch(env, table, filter, patch)`, `dbRpc(env, fn, args)`, `audit(env, {actor, role, action, table, recordId, before, after})`, `jsonOk(data, origin, env, status)`, `jsonError(msg, status, origin, env)`.
- Produces: `GET /costs/ledger` → `{records: dl_v_balance[], gap: number, gapRts: []}`· `GET /costs/ledger/:driverId?year=YYYY` → `{records: dl_v_entries[] (νεότερο πρώτο), rts: dl_v_rt_gap[] του οδηγού}`· `POST /costs/ledger` → `{record}` 201· `PATCH /costs/ledger/:id` → `{record}`· `POST /costs/ledger/import` (owner) → `{batch, rows, balance}` 201 ή 409.

- [ ] **Step 1: Επιβεβαίωσε ότι το bundle είναι ESM και δέχεται import**

Run: `grep -n "^export default\|^import " worker/src/index.js | head -5; grep -n "^main" worker/wrangler.toml`
Expected: μία γραμμή `export default {` (ESM). Αν δεν υπάρχει `export default` → ΣΤΑΜΑΤΑ και ρώτα (το bundle θα ήταν service-worker format και το import δεν θα δούλευε).

- [ ] **Step 2: Πρόσθεσε το import στην κορυφή του `index.js`** (πρώτη γραμμή μετά τα σχόλια της κεφαλίδας, πριν το πρώτο `var`/`function`)

```js
import { validateNewEntry, validatePatch } from "./ledger-rules.mjs";
```

- [ ] **Step 3: Κατηγορίες και δικαιώματα**

Αντικατάστησε τη γραμμή 2665 και τον πίνακα `COSTS_PERMS`:

```js
// driver_pay and cash_m left this list on 2026-09-05 (migration 011): driver
// money lives in the ledger (dl_entries) and TRIP PnL reads it from there.
// Writing them here again would be the second source of truth T1 forbids.
var CT_CATEGORIES = ["fuel", "reefer_fuel", "tolls", "dkv", "adblue", "spedition", "accommodation", "ferry_train", "fines", "partner_rate", "fixed_alloc", "other"];
var COSTS_PERMS = {
  // lines PATCH/DELETE: ΣΗΜΑΔΕΜΕΝΗ ΠΡΟΣΘΗΚΗ (owner 24/8) πάνω στην πιστή
  // μεταφορά — μόνο owner, με υποχρεωτικό reason στο audit (βλ. handlers).
  // ledger (owner 5/9): owner, accountant, management write; import owner only.
  // dispatcher/warehouse: nothing — driver pay is not theirs to see.
  owner: { settings: ["GET", "PATCH"], rt: ["GET", "POST", "PATCH"], lines: ["GET", "POST", "PATCH", "DELETE"], pnl: ["GET"], "pallet-gate": ["GET"], lookups: ["GET"], ledger: ["GET", "POST", "PATCH"] },
  accountant: { settings: ["GET"], rt: ["GET", "POST"], lines: ["GET", "POST"], lookups: ["GET"], ledger: ["GET", "POST", "PATCH"] },
  dispatcher: { rt: ["GET", "POST", "PATCH"], lookups: ["GET"] },
  management: { lookups: ["GET"], ledger: ["GET", "POST", "PATCH"] },
  warehouse: {}
};
```

- [ ] **Step 4: Οι διαδρομές** — μπες μέσα στο `try {` του `handleCosts`, **πριν** το `// ---- GET /costs/pnl`:

```js
    // ---- LEDGER (Μισθοδοσία Οδηγών) — spec 2026-09-05 §4 ----
    // ---- GET /costs/ledger : one row per driver + reconciliation gap ----
    if (resource === "ledger" && method === "GET" && !recId) {
      const [bal, gap] = await Promise.all([
        dbSelectRaw(env, "dl_v_balance", new URLSearchParams({ select: "*", order: "full_name.asc", limit: "300" })),
        dbSelectRaw(env, "dl_v_rt_gap", new URLSearchParams({ select: "rt_id,code,driver_id,date_start", limit: "500" }))
      ]);
      return jsonOk({ records: bal.rows, gap: gap.rows.length, gapRts: gap.rows }, origin, env);
    }
    // ---- GET /costs/ledger/:driverId?year= : the driver's ledger ----
    if (resource === "ledger" && method === "GET" && recId && recId !== "import") {
      const year = url.searchParams.get("year");
      const params = new URLSearchParams({ select: "*", driver_id: `eq.${recId}`, order: "entry_date.desc,id.desc", limit: "2000" });
      if (year && /^\d{4}$/.test(year)) { params.append("entry_date", `gte.${year}-01-01`); params.append("entry_date", `lte.${year}-12-31`); }
      const [entries, rts] = await Promise.all([
        dbSelectRaw(env, "dl_v_entries", params),
        // RTs of this driver still without a live ledger line — the form's «Σύνδεση με RT» list
        dbSelectRaw(env, "dl_v_rt_gap", new URLSearchParams({ select: "rt_id,code,date_start", driver_id: `eq.${recId}`, order: "date_start.desc" }))
      ]);
      return jsonOk({ records: entries.rows, rts: rts.rows }, origin, env);
    }
    // ---- POST /costs/ledger : new trip / payment ----
    if (resource === "ledger" && method === "POST" && !recId) {
      const body = await request.json().catch(() => null);
      const v = validateNewEntry(body);
      if (v.error) return jsonError(v.error, 400, origin, env);
      const drv = await dbSelectRaw(env, "drivers", new URLSearchParams({ select: "id,active,deleted_at", id: `eq.${v.row.driver_id}` }));
      if (!drv.rows.length || drv.rows[0].deleted_at) return jsonError("driver_id: unknown driver", 400, origin, env);
      if (v.row.rt_id) {
        const rt = await dbSelectRaw(env, "ct_round_trips", new URLSearchParams({ select: "id,driver_id,trip_type", id: `eq.${v.row.rt_id}` }));
        if (!rt.rows.length) return jsonError("rt_id: unknown round trip", 400, origin, env);
        if (rt.rows[0].driver_id !== v.row.driver_id) return jsonError("rt_id: the round trip belongs to another driver", 400, origin, env);
      }
      v.row.created_by = caller.sub;
      let created;
      try { created = await dbInsert(env, "dl_entries", v.row); }
      catch (e) {
        // the partial unique index dl_rt_live: a second live line for the same RT
        if (/23505|dl_rt_live/.test(e.message)) return jsonError("rt_id: this round trip already has a ledger line", 409, origin, env);
        throw e;
      }
      await audit(env, { actor: caller.sub, role: caller.role, action: "create", table: "dl_entries", recordId: String(created.id), after: created });
      return jsonOk({ record: created }, origin, env, 201);
    }
    // ---- PATCH /costs/ledger/:id : fill, correct (reason), cancel (reason) ----
    if (resource === "ledger" && method === "PATCH" && recId) {
      const body = await request.json().catch(() => null);
      const before = await dbSelectRaw(env, "dl_entries", new URLSearchParams({ id: `eq.${recId}`, select: "*" }));
      if (!before.rows.length) return jsonError("Not found", 404, origin, env);
      if (before.rows[0].deleted_at && !(body && body.restore)) return jsonError("entry is cancelled", 409, origin, env);
      let patch;
      if (body && body.restore) {
        // undoing a cancellation is an owner act, with a reason, like everything that rewrites history
        if (caller.role !== "owner") return jsonError("Forbidden", 403, origin, env);
        if (!String(body.reason || "").trim()) return jsonError("reason required to restore", 400, origin, env);
        patch = { deleted_at: null, deleted_reason: null, note: ((before.rows[0].note || "") + " · επαναφορά: " + String(body.reason).trim()).trim() };
      } else {
        const v = validatePatch(body, before.rows[0]);
        if (v.error) return jsonError(v.error, 400, origin, env);
        if (v.needsReason && !String((body || {}).reason || "").trim()) return jsonError("reason required to change a written value", 400, origin, env);
        patch = v.patch;
      }
      patch.updated_at = new Date().toISOString();
      const updated = await ctDbPatch(env, "dl_entries", `id=eq.${encodeURIComponent(recId)}`, patch);
      await audit(env, { actor: caller.sub, role: caller.role, action: "update", table: "dl_entries", recordId: String(recId), before: before.rows[0], after: { ...updated, reason: String((body || {}).reason || "").trim() || null } });
      return jsonOk({ record: updated }, origin, env);
    }
    // ---- POST /costs/ledger/import : one Excel file = one atomic batch (owner) ----
    if (resource === "ledger" && method === "POST" && recId === "import") {
      if (caller.role !== "owner") return jsonError("Forbidden", 403, origin, env);
      const body = await request.json().catch(() => null);
      if (!body || !Number.isInteger(body.driver_id) || !Array.isArray(body.rows) || !body.rows.length || !body.file_hash || !body.file_name) {
        return jsonError("driver_id, file_name, file_hash, rows[] required", 400, origin, env);
      }
      for (let i = 0; i < body.rows.length; i++) {
        const v = validateNewEntry({ driver_id: body.driver_id, ...body.rows[i] });
        if (v.error) return jsonError(`row ${i + 1}: ${v.error}`, 400, origin, env);
      }
      const batch = crypto.randomUUID();
      let result;
      try {
        result = await dbRpc(env, "dl_import", { p_driver_id: body.driver_id, p_batch: batch, p_file_name: body.file_name, p_file_hash: body.file_hash, p_rows: body.rows, p_actor: "import:" + caller.sub });
      } catch (e) {
        if (/DL_DUPLICATE_FILE/.test(e.message)) return jsonError("this file was already imported", 409, origin, env);
        throw e;
      }
      await audit(env, { actor: caller.sub, role: caller.role, action: "create", table: "dl_import_batches", recordId: batch, after: { driver_id: body.driver_id, file_name: body.file_name, ...result } });
      return jsonOk(result, origin, env, 201);
    }
```

- [ ] **Step 5: Τα τεστ των κανόνων περνούν ακόμη**

Run: `node --test worker/test/ledger-rules.test.mjs`
Expected: `# pass 6`.

- [ ] **Step 6: Τοπικό build check του Worker (χωρίς deploy)**

Run: `cd worker && npx wrangler deploy --dry-run --outdir /tmp/wr-dry 2>&1 | tail -5`
Expected: `Total Upload: … KiB` χωρίς σφάλμα. Αν λέει `Could not resolve "./ledger-rules.mjs"` → το path είναι λάθος (το αρχείο πρέπει να είναι δίπλα στο `index.js`).

- [ ] **Step 7: Φρουρός των τριών στο dry-run bundle**

Run:
```bash
grep -c 'order_stops: \[.*"DELETE"' /tmp/wr-dry/index.js; grep -c '"VS CD Date": "vs_cd_date"' /tmp/wr-dry/index.js; grep -c '"VAT Number": "tax_id"' /tmp/wr-dry/index.js; grep -c '"Legal Name": "legal_name"' /tmp/wr-dry/index.js
```
Expected: κάθε γραμμή `≥ 1`. Αν 0 σε οποιαδήποτε: ΣΤΑΜΑΤΑ.

- [ ] **Step 8: Commit (χωρίς deploy ακόμη)**

```bash
git add worker/src/index.js
git commit -m "worker(costs): /costs/ledger GET/POST/PATCH/import — ledger is the source for driver pay; driver_pay/cash_m leave CT_CATEGORIES

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 9: Deploy — μόνο μετά τις 15:00, με έγκριση του owner στη συνομιλία, ΑΦΟΥ έχει τρέξει το migration 011**

```bash
cd worker && CLOUDFLARE_API_TOKEN=$CF_API_TOKEN npx wrangler deploy
```
Μετά: κατέβασε από το CF API, ξετύλιξε το multipart, ξανατρέξε τον φρουρό (Step 7 πάνω στο κατεβασμένο). Smoke χωρίς token:
Run: `curl -s -o /dev/null -w "%{http_code}\n" https://petras-tms-backend-staging.petrasgroup.workers.dev/costs/ledger`
Expected: `401` (υπάρχει και ζητά JWT). Έλεγξε ότι τα secrets (`JWT_SECRET`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`) υπάρχουν στα bindings.

---

### Task 4: Εργαλείο εισαγωγής Excel (Python, dry run προεπιλογή)

**Files:**
- Create: `tools/import_driver_ledger.py`, `tools/driver-ledger-map.json`
- Test: `tools/test_import_driver_ledger.py`

**Interfaces:**
- Consumes: `POST /costs/ledger/import` (Task 3), διάταξη `ΑΙΜΙΛΙΟΣ.xlsx` (spec §6): κεφαλίδα γρ. 3, στήλες B Α/Α · C έναρξη · D λήξη · E περιγραφή · F ΕΛΑΒΕ · G ΕΞΟΔΑ · I ΑΞΙΑ · K ΠΡΟΟΔΕΥΤΙΚΟ.
- Produces: CLI `python3 tools/import_driver_ledger.py <file.xlsx> [--commit] [--token $TMS_JWT]`· συναρτήσεις `parse_workbook(path) → (rows, anomalies, excel_final)`, `compute_balance(rows) → Decimal`, `classify(b, c, d, e, f, g, i) → dict | None`.

- [ ] **Step 1: Γράψε τα τεστ**

```python
# tools/test_import_driver_ledger.py
import unittest, tempfile, os, datetime as dt
from decimal import Decimal
import openpyxl
from import_driver_ledger import parse_workbook, compute_balance, classify

def make_xlsx(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    ws['E1'] = 'ΟΔΗΓΟΣ  ΤΕΣΤ'
    for col, h in zip('CEFGHIJK', ['ΗΜΕΡΟΜΗΝΙΑ', 'ΔΡΟΜΟΛΟΓΙΟ', 'ΕΛΑΒΕ', 'ΕΞΟΔΑ', 'ΥΠΟΛΟΙΠΟ', 'ΑΞΙΑ ΔΡΟΜΟΛΟΓΙΟΥ', 'ΥΠΟΛΟΙΠΟ', 'ΠΡΟΟΔΕΥΤΙΚΟ ΥΠΟΛΟΙΠΟ']):
        ws[f'{col}3'] = h
    r = 4
    for row in rows:
        for col, v in row.items(): ws[f'{col}{r}'] = v
        r += 1
    ws[f'C{r}'] = 'ΣΥΝΟΛΟ'; ws[f'F{r}'] = f'=SUM(F4:F{r-1})'
    p = os.path.join(tempfile.mkdtemp(), 't.xlsx'); wb.save(p); return p

class ClassifyTests(unittest.TestCase):
    def test_trip(self):
        r = classify(1, dt.datetime(2024, 8, 10), dt.datetime(2024, 8, 15), 'ΒΕΡΟΙΑ-ΙΤΑΛΙΑ-ΒΕΡΟΙΑ', 200, 0, 800)
        self.assertEqual(r, {'entry_type': 'trip', 'entry_date': '2024-08-10', 'date_end': '2024-08-15',
                             'route': 'ΒΕΡΟΙΑ-ΙΤΑΛΙΑ-ΒΕΡΟΙΑ', 'trip_value': 800.0, 'advance': 200.0, 'expenses': 0.0})
    def test_cash_and_bank(self):
        self.assertEqual(classify(None, dt.datetime(2024, 9, 10), None, 'ΜΕΤΡΗΤΑ', 650, 0, 0),
                         {'entry_type': 'payment_cash', 'entry_date': '2024-09-10', 'amount': 650.0})
        self.assertEqual(classify(None, dt.datetime(2024, 9, 2), None, 'ΚΑΤΑΘΕΣΗ ΤΡΑΠΕΖΑ ETE', 600, 0, 0)['entry_type'], 'payment_bank')
    def test_unknown_row_raises(self):
        with self.assertRaises(ValueError):
            classify(None, dt.datetime(2024, 9, 2), None, 'ΔΩΡΟ ΠΑΣΧΑ', 100, 0, 0)
    def test_national_without_number_is_trip(self):
        self.assertEqual(classify(None, dt.datetime(2025, 8, 19), None, 'ΑΘΗΝΑ', 100, 0, 230)['entry_type'], 'trip')

class ParseTests(unittest.TestCase):
    def test_balance_and_year_typo_flag(self):
        p = make_xlsx([
            {'B': 1, 'C': dt.datetime(2024, 8, 10), 'D': dt.datetime(2024, 8, 15), 'E': 'ΒΕΡΟΙΑ-ΙΤΑΛΙΑ-ΒΕΡΟΙΑ', 'F': 200, 'G': 0, 'I': 800},
            {'C': dt.datetime(2024, 8, 19), 'E': 'ΜΕΤΡΗΤΑ', 'F': 600, 'G': 0, 'I': 0},
            {'B': 2, 'C': dt.datetime(2025, 12, 27), 'D': dt.datetime(2025, 1, 3), 'E': 'ΒΕΡΟΙΑ-ΑΥΣΤΡΙΑ', 'F': 300, 'G': 88, 'I': 950},
        ])
        rows, anomalies, excel_final = parse_workbook(p)
        self.assertEqual(len(rows), 3)
        self.assertEqual(compute_balance(rows), Decimal('738.00'))   # (800-200) - 600 + (950-(300-88)) = 738
        self.assertTrue(any('C > D' in a for a in anomalies))
        self.assertIsNone(excel_final)   # openpyxl-written file has no cached formula values

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Τρέξε τα τεστ, δες ότι αποτυγχάνουν**

Run: `cd tools && python3 -m unittest test_import_driver_ledger -v`
Expected: `ModuleNotFoundError: No module named 'import_driver_ledger'`.

- [ ] **Step 3: Γράψε το εργαλείο**

```python
#!/usr/bin/env python3
"""Import one driver's Excel ledger (ΑΙΜΙΛΙΟΣ.xlsx layout) into the TMS ledger.

Dry run by default: parses, classifies, computes the final balance and compares
it with the workbook's last ΠΡΟΟΔΕΥΤΙΚΟ. Nothing is sent unless --commit AND the
two numbers agree. Unknown row shapes STOP the run — the tool never guesses.

    python3 tools/import_driver_ledger.py ~/Drive/μισθοδοσία/ΑΙΜΙΛΙΟΣ.xlsx
    python3 tools/import_driver_ledger.py ~/Drive/μισθοδοσία/ΑΙΜΙΛΙΟΣ.xlsx --commit --token "$TMS_JWT"
"""
import argparse, hashlib, json, os, sys, urllib.request, urllib.error
from decimal import Decimal, ROUND_HALF_UP
import openpyxl

PROXY = 'https://petras-tms-backend-staging.petrasgroup.workers.dev'
MAP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'driver-ledger-map.json')
HEADER_ROW = 3

def d2(v):
    return Decimal(str(v or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def iso(dtv):
    return dtv.date().isoformat() if hasattr(dtv, 'date') else None

def classify(b, c, d, e, f, g, i):
    """One Excel row -> ledger entry dict, or None for a blank row.
    b=Α/Α c=start d=end e=description f=ΕΛΑΒΕ g=ΕΞΟΔΑ i=ΑΞΙΑ."""
    desc = (e or '').strip().upper()
    if not desc and not c and not d:
        return None
    start = c or d
    if start is None:
        raise ValueError(f'row without a date: {e!r}')
    value = d2(i)
    if b is not None or value > 0:
        return {'entry_type': 'trip', 'entry_date': iso(start), 'date_end': iso(d) if d else None,
                'route': (e or '').strip(), 'trip_value': float(value), 'advance': float(d2(f)), 'expenses': float(d2(g))}
    if 'ΜΕΤΡΗΤ' in desc:
        return {'entry_type': 'payment_cash', 'entry_date': iso(start), 'amount': float(d2(f))}
    if 'ΚΑΤΑΘΕΣ' in desc or 'ΤΡΑΠΕΖ' in desc:
        return {'entry_type': 'payment_bank', 'entry_date': iso(start), 'amount': float(d2(f))}
    raise ValueError(f'unknown row shape: {e!r} (F={f}, I={i}) — decide by hand')

def parse_workbook(path):
    wb = openpyxl.load_workbook(path)
    ws = wb.worksheets[0]
    rows, anomalies = [], []
    for r in range(HEADER_ROW + 1, ws.max_row + 1):
        b, c, d, e, f, g, i = (ws.cell(r, col).value for col in (2, 3, 4, 5, 6, 7, 9))
        if isinstance(c, str) and c.strip().upper() == 'ΣΥΝΟΛΟ':
            break
        entry = classify(b, c, d, e, f, g, i)
        if entry is None:
            continue
        if c and d and c > d:
            anomalies.append(f'row {r}: C > D ({c.date()} > {d.date()}) — year typo? kept as is')
        if entry['entry_type'] == 'trip' and d2(f) == 0:
            anomalies.append(f'row {r}: trip with ΕΛΑΒΕ = 0 (allowed, reported)')
        entry['_row'] = r
        rows.append(entry)
    # cached value of the last ΠΡΟΟΔΕΥΤΙΚΟ (column K); None when the file was
    # never recalculated (e.g. written by openpyxl)
    ws2 = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    excel_final = None
    for r in range(ws2.max_row, HEADER_ROW, -1):
        v = ws2.cell(r, 11).value
        if isinstance(v, (int, float)):
            excel_final = d2(v); break
    return rows, anomalies, excel_final

def compute_balance(rows):
    bal = Decimal('0')
    for e in rows:
        if e['entry_type'] == 'trip':
            bal += d2(e['trip_value']) - (d2(e['advance']) - d2(e['expenses']))
        else:
            bal -= d2(e['amount'])
    return bal.quantize(Decimal('0.01'))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx'); ap.add_argument('--commit', action='store_true')
    ap.add_argument('--token', default=os.environ.get('TMS_JWT'))
    a = ap.parse_args()
    name = os.path.splitext(os.path.basename(a.xlsx))[0].strip().upper()
    mapping = json.load(open(MAP_FILE, encoding='utf-8'))
    if name not in mapping:
        sys.exit(f'✗ {name}: no driver id in {MAP_FILE} — add it by hand (Greek file name → drivers.id)')
    driver_id = mapping[name]
    rows, anomalies, excel_final = parse_workbook(a.xlsx)
    bal = compute_balance(rows)
    kinds = {}
    for e in rows: kinds[e['entry_type']] = kinds.get(e['entry_type'], 0) + 1
    print(f'{name} → driver {driver_id} · {len(rows)} rows · {kinds}')
    for x in anomalies: print('  ⚠', x)
    print(f'  computed balance {bal} · Excel last ΠΡΟΟΔΕΥΤΙΚΟ {excel_final}')
    if excel_final is None or bal != excel_final:
        sys.exit('✗ balance does not match the workbook — NOT importing')
    print('  ✓ balance matches')
    if not a.commit:
        print('  dry run — add --commit to write'); return
    if not a.token: sys.exit('✗ --token (or $TMS_JWT) required for --commit')
    payload = {'driver_id': driver_id, 'file_name': os.path.basename(a.xlsx),
               'file_hash': hashlib.sha256(open(a.xlsx, 'rb').read()).hexdigest(),
               'rows': [{k: v for k, v in e.items() if not k.startswith('_') and v is not None} for e in rows]}
    req = urllib.request.Request(PROXY + '/costs/ledger/import', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + a.token}, method='POST')
    try:
        with urllib.request.urlopen(req) as res:
            out = json.load(res)
    except urllib.error.HTTPError as err:
        sys.exit(f'✗ HTTP {err.code}: {err.read().decode()[:300]}')
    print(f'  ✓ imported batch {out["batch"]}: {out["rows"]} rows, server balance {out["balance"]}')
    if d2(out['balance']) != bal:
        sys.exit('✗ SERVER BALANCE DIFFERS — ask the owner to run dl_cancel_batch on this batch')

if __name__ == '__main__':
    main()
```

`tools/driver-ledger-map.json`:
```json
{ "ΑΙΜΙΛΙΟΣ": 46 }
```

- [ ] **Step 4: Τρέξε τα τεστ, δες ότι περνούν**

Run: `cd tools && python3 -m unittest test_import_driver_ledger -v`
Expected: `Ran 5 tests … OK`.

- [ ] **Step 5: Dry run στο πραγματικό αρχείο (τεστ αποδοχής)**

Run: `python3 tools/import_driver_ledger.py ~/Downloads/ΑΙΜΙΛΙΟΣ.xlsx`
Expected:
```
ΑΙΜΙΛΙΟΣ → driver 46 · 168 rows · {'trip': …, 'payment_cash': …, 'payment_bank': …}
  ⚠ row 36: C > D (2025-12-27 > 2025-01-03) — year typo? kept as is
  computed balance 354.76 · Excel last ΠΡΟΟΔΕΥΤΙΚΟ 354.76
  ✓ balance matches
  dry run — add --commit to write
```
Αν το `computed balance` ≠ 354.76: ο parser έχει λάθος. Μη «διορθώσεις» το Excel· τύπωσε ανά γραμμή `entry_type, balance_delta, running` και βρες ποια γραμμή αποκλίνει.

- [ ] **Step 6: Commit**

```bash
git add tools/import_driver_ledger.py tools/test_import_driver_ledger.py tools/driver-ledger-map.json
git commit -m "tools(ledger): Excel → dl_entries importer, dry run by default, refuses when balance ≠ workbook (ΑΙΜΙΛΙΟΣ 354,76)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `modules/payroll.js` — καθαρές συναρτήσεις μορφοποίησης (TDD)

**Files:**
- Create: `modules/payroll.js` (μόνο helpers + CommonJS export guard), `tests/payroll-format.test.js`

**Interfaces:**
- Produces (global στο browser, `module.exports` στο node): `dlEur(n) → '354,76 €' | '—'`, `dlBalanceWord(n) → {text, cls}` (`'του χρωστάμε'|'μας χρωστά'|'τακτοποιημένο'`, cls `'dl-owe'|'dl-owed'|'dl-zero'`), `dlDelta(entry) → '+555,00' | '−950,47' | '—'`, `dlTypeLabel(t)`, `dlDateRange(start, end) → '10–17/08' | '13/08'`.

- [ ] **Step 1: Γράψε τα τεστ**

```js
// tests/payroll-format.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange } = require('../modules/payroll.js');

test('unknown is not zero: null/undefined render as a dash, real zero as 0,00 €', () => {
  assert.strictEqual(dlEur(null), '—');
  assert.strictEqual(dlEur(undefined), '—');
  assert.strictEqual(dlEur(0), '0,00 €');
  assert.strictEqual(dlEur(354.76), '354,76 €');
  assert.strictEqual(dlEur(1240), '1.240,00 €');
});

test('balance carries a word, not only a sign or colour (DESIGN.md #2)', () => {
  assert.deepStrictEqual(dlBalanceWord(354.76), { text: 'του χρωστάμε', cls: 'dl-owe' });
  assert.deepStrictEqual(dlBalanceWord(-120), { text: 'μας χρωστά', cls: 'dl-owed' });
  assert.deepStrictEqual(dlBalanceWord(0), { text: 'τακτοποιημένο', cls: 'dl-zero' });
});

test('line delta: trip pending shows a dash, payments are negative with a real minus sign', () => {
  assert.strictEqual(dlDelta({ entry_type: 'trip', pending: true, balance_delta: -300 }), '—');
  assert.strictEqual(dlDelta({ entry_type: 'trip', pending: false, balance_delta: 555 }), '+555,00');
  assert.strictEqual(dlDelta({ entry_type: 'payment_bank', pending: false, balance_delta: -950.47 }), '−950,47');
});

test('type labels and date ranges', () => {
  assert.strictEqual(dlTypeLabel('payment_bank'), 'Τράπεζα');
  assert.strictEqual(dlTypeLabel('trip'), 'Δρομολόγιο');
  assert.strictEqual(dlDateRange('2026-08-10', '2026-08-17'), '10–17/08');
  assert.strictEqual(dlDateRange('2026-08-31', '2026-09-02'), '31/08–02/09');
  assert.strictEqual(dlDateRange('2026-08-13', null), '13/08');
});
```

- [ ] **Step 2: Τρέξε, δες ότι αποτυγχάνουν**

Run: `node --test tests/payroll-format.test.js`
Expected: FAIL — `Cannot find module '../modules/payroll.js'`.

- [ ] **Step 3: Γράψε τους helpers (κεφαλίδα + τέλος του module — οι οθόνες μπαίνουν ανάμεσα στο Task 6)**

```js
// ═══════════════════════════════════════════════════════════
// MODULE — ΜΙΣΘΟΔΟΣΙΑ ΟΔΗΓΩΝ (καρτέλα οδηγού)
// Source: /costs/ledger* (Worker) → dl_v_balance / dl_v_entries.
// Spec: docs/superpowers/specs/2026-09-05-driver-payroll-ledger-design.md
// Figma KO7l2AfucR3HJEDIg1Yptr → w5-payroll-balances / -driver-ledger / -entry-form.
// Tokens only — no hex here (DESIGN.md #1). Unknown is never 0 (#3): a trip
// without a value is «εκκρεμεί», a balance is a number AND a word (#2).
// ═══════════════════════════════════════════════════════════
'use strict';

const DL_TYPE_LABELS = { trip: 'Δρομολόγιο', payment_cash: 'Μετρητά', payment_bank: 'Τράπεζα', adjustment: 'Προσαρμογή' };

function dlEur(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function dlBalanceWord(n) {
  const v = Number(n) || 0;
  if (v > 0) return { text: 'του χρωστάμε', cls: 'dl-owe' };
  if (v < 0) return { text: 'μας χρωστά', cls: 'dl-owed' };
  return { text: 'τακτοποιημένο', cls: 'dl-zero' };
}
// U+2212 minus: a hyphen next to tabular digits reads as a typo («-950,47»).
function dlDelta(e) {
  if (e.entry_type === 'trip' && e.pending) return '—';
  const v = Number(e.balance_delta) || 0;
  const s = Math.abs(v).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−' : '+') + s;
}
function dlTypeLabel(t) { return DL_TYPE_LABELS[t] || t; }
function dlDateRange(start, end) {
  const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  if (!end || end === start) return dm(start);
  return start.slice(5, 7) === end.slice(5, 7) ? start.slice(8, 10) + '–' + dm(end) : dm(start) + '–' + dm(end);
}

// node:test reads these; the browser ignores the guard.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange };
}
```

- [ ] **Step 4: Τρέξε, δες ότι περνούν**

Run: `node --test tests/payroll-format.test.js`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add modules/payroll.js tests/payroll-format.test.js
git commit -m "payroll: formatting helpers with tests — unknown is a dash, balance carries a word

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `modules/payroll.js` — οι τρεις οθόνες

**Files:**
- Modify: `modules/payroll.js` (μεταξύ `DL_TYPE_LABELS` και του export guard)
- Modify: `core/router.js:49` (NAV) και `:339-349` (case), `app.html:137` (script)

**Interfaces:**
- Consumes: `ctFetch(path, {method, body})` από `modules/costs.js` (φορτώνεται πριν), `can('costs')`, `showAccessDenied()`, `showEmpty({title, description})`, `showError(msg)`, `escapeHtml`, helpers Task 5.
- Produces: `renderPayroll()` (router), `dlRenderList()`, `renderPayrollDriver(driverId)`, `dlRenderDriver(b)`, `dlOpenForm(driverId, type)`, `dlRecalc()`, `dlSaveForm(type)`, `dlOpenEdit(id)`, `dlSaveEdit(id)`, `dlCancelEntry(id)`, `dlCloseForm()`.

- [ ] **Step 1: Κατάσταση + στυλ + λίστα οδηγών** — πρόσθεσε μετά τα `DL_TYPE_LABELS`:

```js
const _dl = { balances: [], gap: 0, filter: 'all', q: '', driver: null, entries: [], rts: [], year: String(new Date().getFullYear()) };

// Six sizes, six spacings, tokens only (DESIGN.md Β/Γ/Δ). Row 40px, ≥ 20 rows at 1080p.
function dlStyles() {
  return `<style>
  .dl-page{font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);background:var(--surface-card);min-height:100%}
  .dl-head{display:flex;align-items:center;gap:8px;padding:0 24px;height:58px}
  .dl-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700}
  .dl-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9999px;border:1px solid var(--border);font-size:12px;color:var(--text-mid);cursor:pointer;background:none;font-family:inherit}
  .dl-chip.on{background:var(--surface-dark);color:var(--text-on-dark);border-color:var(--surface-dark)}
  .dl-chip b{color:var(--danger)} .dl-chip.on b{color:var(--text-on-dark)}
  .dl-sp{flex:1}
  .dl-search{height:34px;width:160px;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:12px}
  .dl-btn{height:34px;padding:0 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface-card);font:inherit;font-size:13px;font-weight:500;cursor:pointer;color:var(--text)}
  .dl-btn.pri{background:var(--accent);border-color:var(--accent);color:var(--text-on-dark)} .dl-btn.pri:hover{background:var(--accent-hover)}
  .dl-metrics{display:flex;align-items:center;gap:24px;padding:0 24px;height:36px;background:var(--surface-sunken);font-size:12px;color:var(--text-mid)}
  .dl-metrics b{color:var(--text)} .dl-metrics .warn{color:var(--warn);font-weight:700}
  .dl-th{display:flex;height:34px;background:var(--surface-sunken);border-bottom:1px solid var(--border)}
  .dl-th>div,.dl-row>div{padding:0 16px;display:flex;flex-direction:column;justify-content:center;gap:1px;flex:none}
  .dl-th>div{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--text-mid);text-transform:uppercase}
  .dl-row{display:flex;height:40px;border-bottom:1px solid var(--border);cursor:pointer}
  .dl-row:hover{background:var(--surface-sunken)}
  .dl-row.pay{background:var(--surface-sunken)}
  .dl-row.canc .m,.dl-row.canc .n{text-decoration:line-through;color:var(--text-dim)}
  .dl-row.review{box-shadow:inset 3px 0 var(--warn)}
  .m{font-size:13px;font-weight:700} .s{font-size:11px;color:var(--text-dim)} .n{font-size:13px;font-variant-numeric:tabular-nums;text-align:right}
  .r{align-items:flex-end} .dim{color:var(--text-dim)} .link{color:var(--accent);font-size:12px;text-decoration:none}
  .dl-owe{color:var(--ok)} .dl-owed{color:var(--warn)} .dl-zero{color:var(--text-mid)}
  .dl-pill{display:inline-block;padding:3px 8px;border-radius:9999px;font-size:11px;border:1px solid var(--border);color:var(--text-mid)}
  .dl-foot{display:flex;align-items:center;height:44px;padding:0 24px;background:var(--surface-sunken);border-top:1px solid var(--border);font-size:12px;color:var(--text-mid);position:sticky;bottom:0}
  .dl-foot b{color:var(--text);font-size:13px;font-variant-numeric:tabular-nums}
  .dl-band{display:flex;align-items:center;gap:32px;padding:0 24px;height:56px;background:var(--surface-sunken)}
  .dl-band .k{font-size:11px;font-weight:500;color:var(--text-dim)} .dl-band .v{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums} .dl-band .big{font-size:18px}
  .dl-overlay{position:fixed;inset:0;background:var(--text-dim);opacity:.6;z-index:60;display:none} .dl-overlay.open{display:block}
  .dl-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:640px;max-height:90vh;overflow:auto;background:var(--surface-card);border-radius:6px;padding:24px;z-index:61;display:none;box-shadow:0 8px 24px rgba(0,0,0,.18)} .dl-modal.open{display:block}
  .dl-f{display:flex;flex-direction:column;gap:6px;flex:1} .dl-f label{font-size:12px;color:var(--text-mid)} .dl-f input,.dl-f select{height:36px;border:1px solid var(--border);border-radius:6px;padding:0 12px;font:inherit;font-size:13px} .dl-f .h{font-size:11px;color:var(--text-dim)}
  .dl-fr{display:flex;gap:16px;margin-bottom:16px}
  .dl-seg{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:16px} .dl-seg button{flex:1;height:36px;border:0;background:none;font:inherit;font-size:13px;color:var(--text-mid);cursor:pointer} .dl-seg button.on{background:var(--surface-dark);color:var(--text-on-dark);font-weight:500}
  .dl-calc{display:flex;gap:24px;align-items:center;padding:10px 16px;background:var(--surface-sunken);border-radius:6px;margin-bottom:16px;font-size:13px}
  .dl-calc .k{font-size:11px;color:var(--text-dim)} .dl-calc b{font-variant-numeric:tabular-nums}
  .dl-err{color:var(--danger);font-size:12px;margin-top:8px}
  </style>`;
}

async function renderPayroll() {
  const c = document.getElementById('content');
  if (can('costs') === 'none') { c.innerHTML = showAccessDenied(); return; }
  c.style.padding = '0';
  _dl.driver = null;
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτελών…</div></div>';
  try {
    const r = await ctFetch('/costs/ledger');
    _dl.balances = r.records || []; _dl.gap = r.gap || 0;
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Οι καρτέλες οδηγών δεν φορτώθηκαν: ' + e.message) + '</div>';
    return;
  }
  dlRenderList();
}

function dlVisible() {
  const q = _dl.q.trim().toLowerCase();
  return _dl.balances.filter(b => {
    if (_dl.filter === 'all' && !b.active) return false;
    if (_dl.filter === 'balance' && !(Number(b.balance) !== 0)) return false;
    if (_dl.filter === 'pending' && !(b.pending_count > 0)) return false;
    if (_dl.filter === 'stale' && !(b.days_since_last_entry > 30 && b.active)) return false;
    if (_dl.filter === 'inactive' && b.active) return false;
    return !q || String(b.full_name).toLowerCase().includes(q);
  });
}

function dlRenderList() {
  const c = document.getElementById('content');
  const act = _dl.balances.filter(b => b.active);
  const owe = act.filter(b => Number(b.balance) > 0), owed = act.filter(b => Number(b.balance) < 0);
  const total = act.reduce((a, b) => a + Number(b.balance || 0), 0);
  const pending = act.reduce((a, b) => a + Number(b.pending_count || 0), 0);
  const stale = act.filter(b => b.days_since_last_entry > 30).length;
  const rows = dlVisible();
  const chip = (id, label, n) => `<button class="dl-chip${_dl.filter === id ? ' on' : ''}" onclick="_dl.filter='${id}';dlRenderList()">${label}${n != null ? ' <b>' + n + '</b>' : ''}</button>`;
  const body = rows.length ? rows.map(b => {
    const w = dlBalanceWord(b.balance);
    const last = b.last_trip_date ? `${dlDateRange(b.last_trip_date, b.last_trip_end)} ${escapeHtml(b.last_trip_route || '')}` : '—';
    const sub = b.last_trip_rt_code ? `<span class="link">${escapeHtml(b.last_trip_rt_code)}</span>` : (b.last_trip_date ? 'χωρίς σύνδεση RT' : 'καμία καταχώρηση');
    const staleTxt = b.days_since_last_entry > 30 ? `<span style="color:var(--warn)">χωρίς κίνηση ${b.days_since_last_entry} ημέρες</span>` : (b.last_payment_date ? `τελευταία πληρωμή ${dlDateRange(b.last_payment_date, null)} ${b.last_payment_type === 'payment_bank' ? 'τράπεζα' : 'μετρητά'}` : '');
    return `<div class="dl-row${b.review_count ? ' review' : ''}" onclick="renderPayrollDriver(${b.driver_id})">
      <div style="width:560px"><span class="m">${escapeHtml(b.full_name)}</span><span class="s">${b.type === 'External' ? 'Εξωτερικός' : 'Εσωτερικός'}${staleTxt ? ' · ' + staleTxt : ''}</span></div>
      <div style="width:384px"><span style="font-size:12px">${last}</span><span class="s">${sub}</span></div>
      <div style="width:120px" class="r"><span class="n">${b.has_entries ? b.trips_ytd : '—'}</span></div>
      <div style="width:200px" class="r"><span class="n ${w.cls}" style="font-weight:700">${b.has_entries ? dlEur(b.balance) : '—'} <span style="font-weight:400;color:var(--text-dim);font-size:12px">${b.has_entries ? w.text : 'χωρίς καρτέλα'}</span></span></div>
      <div style="width:120px"><span class="link">καρτέλα →</span></div></div>`;
  }).join('') : showEmpty({ title: 'Καμία καρτέλα σε αυτό το φίλτρο', description: 'Άλλαξε φίλτρο ή καταχώρησε την πρώτη κίνηση.' });
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><span class="dl-title">Μισθοδοσία Οδηγών</span><span style="width:8px"></span>
      ${chip('all', 'Όλοι', act.length)}${chip('balance', 'Με υπόλοιπο', owe.length + owed.length)}${chip('pending', 'Εκκρεμείς αξίες', pending)}${chip('stale', 'Χωρίς κίνηση 30+ ημ.', stale)}${chip('inactive', 'Ανενεργοί')}
      <span class="dl-sp"></span>
      <input class="dl-search" placeholder="Αναζήτηση…" value="${escapeHtml(_dl.q)}" oninput="_dl.q=this.value;dlRenderList();document.querySelector('.dl-search').focus()">
      <button class="dl-btn pri" onclick="dlOpenForm(null,'trip')">Νέα κίνηση</button></div>
    <div class="dl-metrics"><span><b>Χρωστάμε ${dlEur(total)}</b> σε ${owe.length} οδηγούς</span><span>·</span>
      ${pending ? `<span class="warn">${pending} δρομολόγι${pending === 1 ? 'ο' : 'α'} χωρίς αξία</span>` : ''}
      ${stale ? `<span class="warn">${stale} οδηγοί χωρίς καταχώρηση πάνω από 30 ημέρες</span>` : ''}
      <span class="dl-sp"></span>
      <span style="font-size:11px">${_dl.gap ? `<span class="warn">RT χωρίς γραμμή καρτέλας: ${_dl.gap}</span>` : 'RT χωρίς γραμμή καρτέλας: 0'} · πηγή: dl_v_balance</span></div>
    <div class="dl-th"><div style="width:560px">Οδηγός</div><div style="width:384px">Τελευταίο δρομολόγιο</div><div style="width:120px" class="r">Δρομολόγια ${_dl.year}</div><div style="width:200px" class="r">Υπόλοιπο</div><div style="width:120px"></div></div>
    <div>${body}</div>
    <div class="dl-foot"><span>${act.length} οδηγοί · ${owe.length} με υπόλοιπο · ${owed.length} μας χρωστούν</span><span class="dl-sp"></span><span>Σύνολο οφειλής προς οδηγούς &nbsp;<b>${dlEur(total)}</b></span></div>
    <div class="dl-overlay" id="dlOverlay" onclick="dlCloseForm()"></div><div class="dl-modal" id="dlModal"></div>
  </div>`;
}
```

- [ ] **Step 2: Η καρτέλα οδηγού**

```js
async function renderPayrollDriver(driverId) {
  const c = document.getElementById('content');
  const b = _dl.balances.find(x => x.driver_id === driverId);
  _dl.driver = driverId;
  c.innerHTML = dlStyles() + '<div class="dl-page"><div style="padding:32px;color:var(--text-mid)">Φόρτωση καρτέλας…</div></div>';
  try {
    const r = await ctFetch('/costs/ledger/' + driverId + (_dl.year === 'all' ? '' : '?year=' + _dl.year));
    _dl.entries = r.records || []; _dl.rts = r.rts || [];
  } catch (e) {
    c.innerHTML = dlStyles() + '<div class="dl-page">' + showError('Η καρτέλα δεν φορτώθηκε: ' + e.message) + '</div>';
    return;
  }
  dlRenderDriver(b || { driver_id: driverId, full_name: '#' + driverId, balance: 0, active: true });
}

function dlRenderDriver(b) {
  const c = document.getElementById('content');
  const live = _dl.entries.filter(e => !e.cancelled);
  const trips = live.filter(e => e.entry_type === 'trip');
  const value = trips.reduce((a, e) => a + Number(e.trip_value || 0), 0);
  const cash = live.filter(e => e.entry_type === 'payment_cash').reduce((a, e) => a + Number(e.amount), 0);
  const bank = live.filter(e => e.entry_type === 'payment_bank').reduce((a, e) => a + Number(e.amount), 0);
  const w = dlBalanceWord(b.balance);
  const yr = y => `<button class="dl-chip${_dl.year === y ? ' on' : ''}" onclick="_dl.year='${y}';renderPayrollDriver(${b.driver_id})">${y === 'all' ? 'Όλα' : y}</button>`;
  const y0 = new Date().getFullYear();
  const years = [String(y0), String(y0 - 1), String(y0 - 2), 'all'];
  const money = v => v == null ? '—' : dlEur(v).replace(' €', '');
  const num = (v, dim) => `<span class="n${dim ? ' dim' : ''}">${v}</span>`;
  const rows = _dl.entries.length ? _dl.entries.map(e => {
    const isTrip = e.entry_type === 'trip';
    let sub;
    if (e.cancelled) sub = `<span style="color:var(--warn)">ακυρώθηκε ${e.deleted_at.slice(8, 10)}/${e.deleted_at.slice(5, 7)} · ${escapeHtml(e.deleted_reason || '')}</span>`;
    else if (isTrip && e.pending) sub = `<span style="color:var(--warn)">${e.source === 'auto' ? 'auto από ' + escapeHtml(e.rt_code || '') + ' · ' : ''}εκκρεμεί αξία</span>`;
    else if (isTrip && e.rt_code) sub = `<span class="link">${escapeHtml(e.rt_code)}</span> · τρέφει το TRIP PnL`;
    else if (isTrip) sub = 'χωρίς σύνδεση RT';
    else sub = e.note ? escapeHtml(e.note) : '';
    if (e.needs_review) sub += ` <span style="color:var(--warn)">· ${escapeHtml(e.review_note || 'θέλει έλεγχο')}</span>`;
    const kept = isTrip && (e.advance != null || e.expenses != null) ? money(Number(e.advance || 0) - Number(e.expenses || 0)) : '—';
    return `<div class="dl-row${isTrip ? '' : ' pay'}${e.cancelled ? ' canc' : ''}${e.needs_review ? ' review' : ''}" onclick="dlOpenEdit(${e.id})">
      <div style="width:56px"><span class="s">${e.source === 'excel_import' ? 'xls' : (e.source === 'auto' ? 'auto' : '—')}</span></div>
      <div style="width:120px"><span style="font-size:12px">${dlDateRange(e.entry_date, e.date_end)}</span></div>
      <div style="width:120px"><span class="dl-pill">${dlTypeLabel(e.entry_type)}</span></div>
      <div style="width:448px"><span class="m" style="font-weight:${isTrip ? 500 : 400}">${escapeHtml(e.route_text || (e.entry_type === 'payment_bank' ? 'Κατάθεση τράπεζα' : e.entry_type === 'payment_cash' ? 'Πληρωμή μετρητά' : 'Προσαρμογή'))}</span><span class="s">${sub}</span></div>
      <div style="width:100px" class="r">${num(isTrip ? money(e.advance) : money(e.amount), isTrip && e.advance == null)}</div>
      <div style="width:100px" class="r">${num(isTrip ? money(e.expenses) : '—', !isTrip || e.expenses == null)}</div>
      <div style="width:100px" class="r">${num(kept, kept === '—')}</div>
      <div style="width:100px" class="r">${isTrip && e.pending ? '<span class="n" style="color:var(--warn)">εκκρεμεί</span>' : num(isTrip ? money(e.trip_value) : '—', !isTrip)}</div>
      <div style="width:120px" class="r"><span class="n ${e.cancelled ? 'dim' : (Number(e.balance_delta) < 0 ? 'dl-owed' : 'dl-owe')}" style="font-weight:500">${e.cancelled ? '—' : dlDelta(e)}</span></div>
      <div style="width:120px" class="r"><span class="n" style="font-weight:700">${e.cancelled ? '—' : money(e.running_balance)}</span></div></div>`;
  }).join('') : showEmpty({ title: 'Καμία κίνηση ακόμη', description: 'Η καρτέλα ξεκινά με το πρώτο δρομολόγιο ή την εισαγωγή του Excel.' });
  c.innerHTML = dlStyles() + `<div class="dl-page">
    <div class="dl-head"><a class="link" href="#" onclick="renderPayroll();return false">← Μισθοδοσία</a><span class="dl-title">${escapeHtml(b.full_name)}</span>
      <span class="dl-pill" style="background:var(--ok);color:var(--text-on-dark);border-color:var(--ok);font-size:10px;font-weight:600">${b.active ? 'ΕΝΕΡΓΟΣ' : 'ΑΝΕΝΕΡΓΟΣ'}</span>
      <span class="s" style="font-size:12px">${b.type === 'External' ? 'Εξωτερικός' : 'Εσωτερικός'}</span><span class="dl-sp"></span>
      ${years.map(yr).join('')}
      <button class="dl-btn" onclick="dlOpenForm(${b.driver_id},'payment_cash')">Πληρωμή</button>
      <button class="dl-btn pri" onclick="dlOpenForm(${b.driver_id},'trip')">Νέο δρομολόγιο</button></div>
    <div class="dl-band">
      <div><div class="k">ΥΠΟΛΟΙΠΟ ΣΗΜΕΡΑ</div><div><span class="v big ${w.cls}">${dlEur(b.balance)}</span> <span class="s" style="font-size:12px">${w.text}</span></div></div>
      <div><div class="k">ΔΡΟΜΟΛΟΓΙΑ ${_dl.year === 'all' ? '' : _dl.year}</div><div class="v">${trips.length}</div></div>
      <div><div class="k">ΑΞΙΑ ΔΡΟΜΟΛΟΓΙΩΝ</div><div class="v">${dlEur(value)}</div></div>
      <div><div class="k">ΠΛΗΡΩΜΕΣ</div><div><span class="v">${dlEur(cash + bank)}</span> <span class="s" style="font-size:12px">μετρητά ${dlEur(cash)} · τράπεζα ${dlEur(bank)}</span></div></div>
      <span class="dl-sp"></span><span class="s">πηγή: dl_v_entries · το υπόλοιπο υπολογίζεται, δεν γράφεται</span></div>
    <div class="dl-th"><div style="width:56px">#</div><div style="width:120px">Ημ/νία</div><div style="width:120px">Είδος</div><div style="width:448px">Διαδρομή / περιγραφή</div><div style="width:100px" class="r">Έλαβε</div><div style="width:100px" class="r">Έξοδα</div><div style="width:100px" class="r">Κράτησε</div><div style="width:100px" class="r">Αξία</div><div style="width:120px" class="r">Υπόλοιπο</div><div style="width:120px" class="r">Προοδευτικό</div></div>
    <div>${rows}</div>
    <div class="dl-foot"><span>Σύνολα ${_dl.year === 'all' ? '' : _dl.year} · ${trips.length} δρομολόγια · ${live.length - trips.length} πληρωμές · ${_dl.entries.length - live.length} ακυρωμέν${_dl.entries.length - live.length === 1 ? 'η' : 'ες'}</span><span class="dl-sp"></span>
      <span>Αξία <b>${dlEur(value)}</b> &nbsp; Πληρωμές <b>${dlEur(cash + bank)}</b></span></div>
    <div class="dl-overlay" id="dlOverlay" onclick="dlCloseForm()"></div><div class="dl-modal" id="dlModal"></div>
  </div>`;
}
```

- [ ] **Step 3: Η φόρμα (νέα κίνηση, συμπλήρωση αξίας, ακύρωση)**

```js
function dlOpenForm(driverId, type) {
  const drivers = _dl.balances.filter(b => b.active);
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const cur = driverId ? drivers.find(d => d.driver_id === driverId) : null;
  const bal = cur ? Number(cur.balance || 0) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const seg = ['trip', 'payment_cash', 'payment_bank'].map(t => `<button class="${type === t ? 'on' : ''}" onclick="dlOpenForm(${driverId || 'null'},'${t}')">${t === 'trip' ? 'Δρομολόγιο' : t === 'payment_cash' ? 'Πληρωμή μετρητά' : 'Πληρωμή τράπεζα'}</button>`).join('');
  const rtOpts = '<option value="">— χωρίς σύνδεση —</option>' + (driverId ? _dl.rts : []).map(r => `<option value="${r.rt_id}">${escapeHtml(r.code)} · ${dlDateRange(r.date_start, null)}</option>`).join('');
  const drvOpts = drivers.map(d => `<option value="${d.driver_id}"${d.driver_id === driverId ? ' selected' : ''}>${escapeHtml(d.full_name)}</option>`).join('');
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title">Νέα κίνηση${cur ? ' — ' + escapeHtml(cur.full_name) : ''}</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlCloseForm()">✕</button></div>
    <div class="dl-f" style="margin-bottom:6px"><label>Είδος κίνησης *</label></div><div class="dl-seg">${seg}</div>
    <div class="dl-fr"><div class="dl-f"><label>Οδηγός *</label><select id="dlDriver">${drvOpts}</select><span class="h">${cur ? 'ενεργός · υπόλοιπο ' + dlEur(bal) + ' πριν την κίνηση' : ''}</span></div>
      ${type === 'trip' ? `<div class="dl-f"><label>Σύνδεση με round trip</label><select id="dlRt">${rtOpts}</select><span class="h">προαιρετικό · τρέφει το TRIP PnL</span></div>` : `<div class="dl-f"><label>Ημερομηνία *</label><input type="date" id="dlDate" value="${today}"></div>`}</div>
    ${type === 'trip' ? `
    <div class="dl-fr"><div class="dl-f"><label>Αναχώρηση *</label><input type="date" id="dlDate" value="${today}"></div><div class="dl-f"><label>Επιστροφή</label><input type="date" id="dlEnd"><span class="h">κενή όσο ο οδηγός είναι στον δρόμο</span></div></div>
    <div class="dl-fr"><div class="dl-f"><label>Διαδρομή *</label><input id="dlRoute" placeholder="ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ"><span class="h">ελεύθερο κείμενο, όπως στο Excel — ή αυτόματα από το RT</span></div></div>
    <div class="dl-fr"><div class="dl-f"><label>Αξία δρομολογίου (€)</label><input type="number" step="0.01" id="dlValue" oninput="dlRecalc()"><span class="h">κενό = εκκρεμεί, όχι 0</span></div>
      <div class="dl-f"><label>Έλαβε (προκαταβολή)</label><input type="number" step="0.01" id="dlAdvance" oninput="dlRecalc()"><span class="h">μετρητά στην αναχώρηση</span></div>
      <div class="dl-f"><label>Έξοδα (λίστα οδηγού)</label><input type="number" step="0.01" id="dlExpenses" oninput="dlRecalc()"><span class="h">χωρίς παραστατικό — Έξοδα Μ</span></div></div>
    <div class="dl-calc" id="dlCalc"></div>` : `
    <div class="dl-fr"><div class="dl-f"><label>Ποσό (€) *</label><input type="number" step="0.01" id="dlAmount" oninput="dlRecalc()"></div></div>
    <div class="dl-calc" id="dlCalc"></div>`}
    <div class="dl-fr"><div class="dl-f"><label>Σημείωση</label><input id="dlNote"><span class="h">προαιρετικό</span></div></div>
    <div style="display:flex;align-items:center;gap:12px"><span style="font-size:11px;color:var(--warn);max-width:320px">Η κίνηση δεν διαγράφεται. Αν γίνει λάθος, ακυρώνεται με αιτιολογία και μένει ορατή στην καρτέλα.</span><span class="dl-sp"></span>
      <button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlCloseForm()">Άκυρο</button><button class="dl-btn pri" onclick="dlSaveForm('${type}')">Καταχώρηση</button></div><div class="dl-err" id="dlErr"></div>`;
  m.dataset.balance = String(bal);
  dlRecalc();
}

// The arithmetic is shown before saving: the toast is not the proof.
function dlRecalc() {
  const el = document.getElementById('dlCalc'); if (!el) return;
  const g = id => { const x = document.getElementById(id); return x && x.value !== '' ? Number(x.value) : null; };
  const bal = Number(document.getElementById('dlModal').dataset.balance || 0);
  if (document.getElementById('dlAmount')) {
    const amt = g('dlAmount');
    el.innerHTML = `<div><div class="k">ΥΠΟΛΟΙΠΟ ΓΡΑΜΜΗΣ</div><b>${amt != null ? '−' + dlEur(amt) : '—'}</b></div><div><div class="k">ΝΕΟ ΠΡΟΟΔΕΥΤΙΚΟ</div><b>${amt != null ? dlEur(bal - amt) : '—'}</b></div>`;
    return;
  }
  const v = g('dlValue'), a = g('dlAdvance'), x = g('dlExpenses');
  const kept = (a != null || x != null) ? (a || 0) - (x || 0) : null;
  const delta = v != null ? v - (kept || 0) : null;
  el.innerHTML = `<div><div class="k">ΚΡΑΤΗΣΕ</div><b>${kept != null ? dlEur(kept) : '—'}</b></div><div><div class="k">ΥΠΟΛΟΙΠΟ ΓΡΑΜΜΗΣ</div><b>${delta != null ? (delta >= 0 ? '+' : '−') + dlEur(Math.abs(delta)) : 'εκκρεμεί'}</b></div><div><div class="k">ΝΕΟ ΠΡΟΟΔΕΥΤΙΚΟ</div><b>${delta != null ? dlEur(bal + delta) : '—'}</b></div><span class="dl-sp"></span><span class="k">αξία − (έλαβε − έξοδα)</span>`;
}

async function dlSaveForm(type) {
  const g = id => { const x = document.getElementById(id); return x ? x.value : ''; };
  const n = id => { const v = g(id); return v === '' ? undefined : Number(v); };
  const body = { driver_id: Number(g('dlDriver')), entry_type: type, entry_date: g('dlDate') || undefined, note: g('dlNote') || undefined };
  if (type === 'trip') {
    Object.assign(body, { date_end: g('dlEnd') || undefined, route: g('dlRoute') || undefined, rt_id: g('dlRt') ? Number(g('dlRt')) : undefined, trip_value: n('dlValue'), advance: n('dlAdvance'), expenses: n('dlExpenses') });
    if (!body.route && !body.rt_id) { document.getElementById('dlErr').textContent = 'Διαδρομή ή σύνδεση με RT — ένα από τα δύο.'; return; }
  } else body.amount = n('dlAmount');
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  try {
    await ctFetch('/costs/ledger', { method: 'POST', body });
    dlCloseForm();
    const r = await ctFetch('/costs/ledger'); _dl.balances = r.records || []; _dl.gap = r.gap || 0;
    if (_dl.driver) renderPayrollDriver(_dl.driver); else dlRenderList();
  } catch (e) { document.getElementById('dlErr').textContent = 'Δεν καταχωρήθηκε: ' + e.message; }
}

// Clicking a ledger row: fill a pending value, correct with a reason, or cancel with a reason.
function dlOpenEdit(id) {
  const e = _dl.entries.find(x => x.id === id); if (!e || e.cancelled) return;
  const m = document.getElementById('dlModal'); document.getElementById('dlOverlay').classList.add('open'); m.classList.add('open');
  const isTrip = e.entry_type === 'trip';
  m.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:16px"><span class="dl-title">${escapeHtml(e.route_text || dlTypeLabel(e.entry_type))} · ${dlDateRange(e.entry_date, e.date_end)}</span><span class="dl-sp"></span><button class="dl-btn" style="border:0" onclick="dlCloseForm()">✕</button></div>
    ${isTrip ? `<div class="dl-fr"><div class="dl-f"><label>Αξία δρομολογίου (€)</label><input type="number" step="0.01" id="dlValue" value="${e.trip_value ?? ''}"></div><div class="dl-f"><label>Έλαβε</label><input type="number" step="0.01" id="dlAdvance" value="${e.advance ?? ''}"></div><div class="dl-f"><label>Έξοδα</label><input type="number" step="0.01" id="dlExpenses" value="${e.expenses ?? ''}"></div></div>`
             : `<div class="dl-fr"><div class="dl-f"><label>Ποσό (€)</label><input type="number" step="0.01" id="dlAmount" value="${e.amount}"></div></div>`}
    <div class="dl-fr"><div class="dl-f"><label>Αιτιολογία</label><input id="dlReason"><span class="h">υποχρεωτική όταν αλλάζει γραμμένο ποσό ή όταν ακυρώνεις</span></div></div>
    <div style="display:flex;gap:12px;align-items:center"><button class="dl-btn" style="color:var(--danger)" onclick="dlCancelEntry(${id})">Ακύρωση κίνησης</button><span class="dl-sp"></span>
      <button class="dl-btn" style="border:0;color:var(--accent)" onclick="dlCloseForm()">Άκυρο</button><button class="dl-btn pri" onclick="dlSaveEdit(${id})">Αποθήκευση</button></div><div class="dl-err" id="dlErr"></div>`;
}
async function dlSaveEdit(id) {
  const e = _dl.entries.find(x => x.id === id);
  const n = k => { const x = document.getElementById(k); return x && x.value !== '' ? Number(x.value) : null; };
  const body = { reason: document.getElementById('dlReason').value || undefined };
  if (e.entry_type === 'trip') { for (const [k, f] of [['trip_value', 'dlValue'], ['advance', 'dlAdvance'], ['expenses', 'dlExpenses']]) { const v = n(f); if (v !== (e[k] == null ? null : Number(e[k]))) body[k] = v; } }
  else { const v = n('dlAmount'); if (v !== Number(e.amount)) body.amount = v; }
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  if (Object.keys(body).filter(k => k !== 'reason').length === 0) { document.getElementById('dlErr').textContent = 'Τίποτα δεν άλλαξε.'; return; }
  try { await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body }); dlCloseForm(); renderPayrollDriver(_dl.driver); }
  catch (err) { document.getElementById('dlErr').textContent = 'Δεν αποθηκεύτηκε: ' + err.message; }
}
async function dlCancelEntry(id) {
  const reason = document.getElementById('dlReason').value.trim();
  if (!reason) { document.getElementById('dlErr').textContent = 'Η ακύρωση θέλει αιτιολογία.'; return; }
  try { await ctFetch('/costs/ledger/' + id, { method: 'PATCH', body: { cancel: true, reason } }); dlCloseForm(); renderPayrollDriver(_dl.driver); }
  catch (err) { document.getElementById('dlErr').textContent = 'Δεν ακυρώθηκε: ' + err.message; }
}
function dlCloseForm() {
  const o = document.getElementById('dlOverlay'), m = document.getElementById('dlModal');
  if (o) o.classList.remove('open'); if (m) m.classList.remove('open');
}
```

- [ ] **Step 4: Router + app.html**

`core/router.js:49` — αφαίρεσε το `soon: true`:
```js
    { id: 'payroll', label: 'Μισθοδοσία Οδηγών',  icon: 'coins' },
```
`core/router.js:339-349` — αντικατάστησε ολόκληρο το `case 'payroll'` μαζί με το σχόλιο PR-3 από πάνω:
```js
    // Gate on ONE key (spec 5/9 §4): costs. owner/accountant 'full',
    // management 'view' — all three may open it; the Worker decides writes.
    // dispatcher has costs:'none' and never sees driver money.
    case 'payroll':        renderPayroll();                                   break;
```
`app.html:137` — μετά το `modules/costs.js` (το payroll χρησιμοποιεί `ctFetch`):
```html
  <script src="modules/payroll.js?v=TIMESTAMP"></script>
```
όπου `TIMESTAMP` = `date +%s`. Στο ίδιο bump άλλαξε και το `?v=` του `core/router.js`.

- [ ] **Step 5: Στατικοί έλεγχοι DESIGN.md**

Run: `grep -c "#[0-9A-Fa-f]\{6\}" modules/payroll.js; grep -c "ellipsis\|truncate\|line-clamp" modules/payroll.js; node --test tests/payroll-format.test.js`
Expected: `0`, `0`, `# pass 4`.

- [ ] **Step 6: Δοκιμή στον browser — μέχρι τον πίνακα** (μετά το deploy του Task 3)

Άνοιξε το dev server (`.claude/launch.json`), login ως owner, `#payroll`.
Έλεγξε: (1) η λίστα δείχνει κάθε ενεργό οδηγό· οδηγός χωρίς γραμμές δείχνει `—` και «χωρίς καρτέλα», **όχι** `0,00 €`. (2) Καταχώρησε δρομολόγιο δοκιμής για τον οδηγό 46 (Αξία 100, Έλαβε 30, Έξοδα 5, διαδρομή «ΔΟΚΙΜΗ») → στη Supabase:
```sql
select id, entry_type, trip_value, advance, expenses, balance_delta, created_by from dl_entries where driver_id=46 order by id desc limit 1;
```
Expected: `balance_delta = 75.00`, `created_by` = το username. (3) Ακύρωσέ την με αιτιολογία «δοκιμή» → `deleted_at` γεμάτο, `deleted_reason='δοκιμή'`, και `select count(*) from audit_log where table_name='dl_entries'` ≥ 2. (4) DevTools offline και άνοιγμα της σελίδας → «Δεν φορτώθηκε» και όχι κενός πίνακας. (5) Login ως dispatcher → η εγγραφή δεν εμφανίζεται στο μενού και το `#payroll` δείχνει άρνηση πρόσβασης.

- [ ] **Step 7: Commit + push**

```bash
git add modules/payroll.js core/router.js app.html
git commit -m "payroll: Μισθοδοσία Οδηγών — driver list, driver ledger, entry form (Figma w5-payroll-*), NAV live

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 7: `modules/costs.js` — το PnL διαβάζει από την καρτέλα

**Files:**
- Modify: `modules/costs.js:6-10` (`CT_CATEGORY_LABELS`), `:594-597` (ανάπτυγμα `ctOpenPanel`), `app.html` bump

**Interfaces:**
- Consumes: `ct_v_rt_pnl.dl_trip_value`, `dl_expenses`, `driver_pay_pending`, `driver_pay_missing` (Task 1).

- [ ] **Step 1: Κατηγορίες**

```js
// driver_pay / cash_m: gone since 5/9/2026 — driver money is entered in the
// ledger (Μισθοδοσία Οδηγών) and read back here. Offering them in this
// dropdown again would recreate the second source of truth the ledger removed.
const CT_CATEGORY_LABELS = {
  fuel: 'Καύσιμα', reefer_fuel: 'Καύσιμα ψυγείου', tolls: 'Διόδια', dkv: 'DKV κάρτα',
  adblue: 'AdBlue', spedition: 'Spedition',
  accommodation: 'Διαμονή', ferry_train: 'Ferry/Τρένα', fines: 'Πρόστιμα',
  partner_rate: 'Partner rate', fixed_alloc: 'Πάγια (Tier-2)', other: 'Λοιπά'
};
```

- [ ] **Step 2: Γραμμή «Οδηγός (από καρτέλα)» στο ανάπτυγμα** — στο `ctOpenPanel`, άλλαξε τον υπολογισμό `maxV` ώστε να μετρά και την καρτέλα, και αμέσως μετά το `if (wear > 0.5) costRows += …;` πρόσθεσε τη γραμμή:

```js
  const dlNet = Number(t.dl_trip_value || 0) + Number(t.dl_expenses || 0);
  const maxV = Math.max(1, ...Object.values(cats).map(c => c.net + c.vat), wear, dlNet);
```
```js
  // Driver pay + Έξοδα Μ come from the ledger, not from cost lines. Pending or
  // missing is said in words — never shown as 0 (DESIGN.md #3).
  if (t.trip_type === 'OWNED') {
    const state = t.driver_pay_missing ? 'χωρίς γραμμή καρτέλας — άνοιξε τη Μισθοδοσία'
      : t.driver_pay_pending ? 'εκκρεμεί αξία στην καρτέλα' : '';
    costRows += `<div class="ct-crow"><span class="ct-cl">Οδηγός <span class="ct-badge ct-b-pend" style="font-size:11px">από καρτέλα</span></span>
      <span class="ct-bar"><i style="width:${Math.round(dlNet / maxV * 100)}%"></i></span>
      <span class="ct-cv ct-mono">${state ? '<span style="color:var(--warn)">' + state + '</span>' : ctEur(dlNet)}</span>
      <span class="ct-cvat ct-mono">${t.dl_expenses != null ? 'Έξοδα Μ ' + ctEur(t.dl_expenses) : '—'}</span></div>`;
  }
```

- [ ] **Step 3: Έλεγχος στον browser**

TRIP PnL ως owner → RT-1014 → ανάπτυγμα: γραμμή «Οδηγός από καρτέλα» με «εκκρεμεί αξία στην καρτέλα» και «Έξοδα Μ €50». Το dropdown κόστους **δεν** έχει «Οδηγός»/«Έξοδα Μ».

- [ ] **Step 4: Bump + commit + push**

```bash
TS=$(date +%s); sed -i '' "s/modules\/costs.js?v=[0-9]*/modules\/costs.js?v=$TS/" app.html
git add modules/costs.js app.html
git commit -m "costs: TRIP PnL reads driver pay + Έξοδα Μ from the ledger; the two categories leave the cost form

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

### Task 8: Η μονάδα μπαίνει στους κριτές

**Files:**
- Modify: `tests/critics/units.js` (τέλος του πίνακα), `docs/redesign/baseline.json`, `tests/critics/figma-map.js:17-37`

- [ ] **Step 1: Μονάδα `payroll`** — πρόσθεσε στο τέλος του `module.exports` του `units.js`:

```js
  // Κύμα 5 (5/9/2026): η Μισθοδοσία Οδηγών γεννιέται μέσα στη σουίτα, όχι
  // μετά — αλλιώς είναι η επόμενη «αόρατη» οθόνη (βλ. maint_trucks 30/8).
  { unit: 'payroll',     tier: 3, routes: ['payroll'],      files: ['modules/payroll.js'] },
```

- [ ] **Step 2: Baseline στο 0** — στο `docs/redesign/baseline.json` πρόσθεσε πριν το τελευταίο `}` (με κόμμα στην προηγούμενη εγγραφή):

```json
  "payroll": {
    "hex": 0,
    "truncate": 0
  }
```

- [ ] **Step 3: Δεσμός Figma ↔ κώδικας** — στο `MAP` του `figma-map.js`, πριν το σχόλιο «Built in Figma, not yet in code»:

```js
  // Κύμα 5 — Μισθοδοσία Οδηγών (5/9/2026). Node ids = τα τρία screens.
  { component: 'PayrollBalances', nodeId: '454:901', src: 'modules/payroll.js', fns: ['renderPayroll', 'dlRenderList'] },
  { component: 'DriverLedger',    nodeId: '454:902', src: 'modules/payroll.js', fns: ['renderPayrollDriver', 'dlRenderDriver'] },
  { component: 'LedgerEntryForm', nodeId: '454:903', src: 'modules/payroll.js', fns: ['dlOpenForm', 'dlRecalc', 'dlSaveForm'] },
```

- [ ] **Step 4: Τρέξε τους στατικούς κριτές**

Run: `node --test tests/critics/static.test.js tests/critics/units.test.js && node -e "const m=require('./tests/critics/figma-map.js');const r=m.check();console.log(r.pass?'figma-map OK':'FAIL '+r.failures.join('\n'))"`
Expected: όλα `pass`, `figma-map OK`.

- [ ] **Step 5: Ζωντανοί κριτές (capture του συμβολαίου)**

Run: `PW_BASE_URL=http://127.0.0.1:8788/ npm run critics:capture` και μετά `PW_BASE_URL=http://127.0.0.1:8788/ npm run critics`
Expected: `payroll` στη λίστα, static 13/13, νέο συμβόλαιο `docs/redesign/contracts/payroll.json` με τις 5 κεφαλίδες της λίστας. Το `unknown-is-not-zero: payroll` περνά.

- [ ] **Step 6: Commit**

```bash
git add tests/critics/units.js docs/redesign/baseline.json tests/critics/figma-map.js docs/redesign/contracts/payroll.json
git commit -m "test(critics): payroll unit — baseline 0 hex / 0 truncate, Figma ↔ code map, contract captured

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Εισαγωγή ιστορικού — Αιμίλιος πρώτα, μετά ο φάκελος Drive

**Files:**
- Modify: `tools/driver-ledger-map.json` (ένα id ανά αρχείο)

- [ ] **Step 1: Token owner**

Ο owner κάνει login στο app· στο DevTools: `localStorage.getItem('tms_jwt')` → `export TMS_JWT=…` στο terminal (8 ώρες ζωής, δεν μπαίνει σε αρχείο).

- [ ] **Step 2: Αιμίλιος — dry run, commit, απόδειξη**

Run: `python3 tools/import_driver_ledger.py ~/Downloads/ΑΙΜΙΛΙΟΣ.xlsx` → `✓ balance matches` (354.76).
Run: `python3 tools/import_driver_ledger.py ~/Downloads/ΑΙΜΙΛΙΟΣ.xlsx --commit`
Expected: `✓ imported batch <uuid>: 168 rows, server balance 354.76`.
Απόδειξη (Supabase, SELECT):
```sql
select d.full_name, count(*) as rows, sum(e.balance_delta) as balance,
       count(*) filter (where entry_type='trip') as trips
from dl_entries e join drivers d on d.id=e.driver_id
where e.deleted_at is null and e.source='excel_import' group by 1;
```
Expected: `Eksuzyan Emil · 168 · 354.76`. Ξανατρέξε το ίδιο `--commit` → `✗ HTTP 409: this file was already imported`.

- [ ] **Step 3: Ο φάκελος Drive**

Ο owner δίνει πρόσβαση στον φάκελο «μισθοδοσία». Για κάθε αρχείο: πρόσθεσε `"ΟΝΟΜΑ": <drivers.id>` στο `driver-ledger-map.json` (αντιστοίχιση **με το χέρι**, ελληνικό → λατινικό όνομα της βάσης — μη μαντεύεις), dry run, διάβασε τις ανωμαλίες, commit μόνο αν `✓ balance matches`. Αρχείο που σταματά με `unknown row shape` → ρώτα τον owner τι είναι η γραμμή, **μη** το χαρακτηρίσεις μόνος.

- [ ] **Step 4: Συνολική απόδειξη + λίστα**

```sql
select count(distinct driver_id) as drivers, count(*) as rows, sum(balance_delta) as total
from dl_entries where deleted_at is null and source='excel_import';
```
Άνοιξε τη Μισθοδοσία: το «Χρωστάμε … σε n οδηγούς» της ζώνης μετρικών **ισούται** με το `total` του SQL (συν τυχόν χειροκίνητες/auto γραμμές). Αν όχι, ΣΤΑΜΑΤΑ — κάπου η οθόνη ψεύδεται.

- [ ] **Step 5: Commit του χάρτη**

```bash
git add tools/driver-ledger-map.json
git commit -m "tools(ledger): driver file → id map for the Drive import

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Ίχνος — αποφάσεις, κατάσταση, μνήμη

**Files:**
- Modify: `docs/DECISION_LOG.md` (τέλος), `docs/TRIP_COSTS_DECISION_LOG.md` (τέλος), `CLAUDE.md` («Κατάσταση modules» + πίνακας επαναλαμβανόμενου ελέγχου), μνήμη `project_driver_payroll_ledger.md`

- [ ] **Step 1: DECISION_LOG** — πρόσθεσε στο τέλος:

```markdown
### 2026-09-05 · costs · Η καρτέλα οδηγού είναι η πηγή για την αμοιβή οδηγού

**Επιλογή:** νέος πίνακας `dl_entries` (καρτέλα ανά οδηγό, ένα-προς-ένα με το
Excel: Έλαβε · Έξοδα · Αξία · προοδευτικό). Το TRIP PnL διαβάζει από εκεί
(`ct_v_rt_costs`)· οι κατηγορίες `driver_pay`/`cash_m` αφαιρέθηκαν από το
CHECK του `ct_cost_lines` (migration 011). Trigger στο `ct_round_trips` γεννά
γραμμή με κενά ποσά για κάθε ιδιόκτητο RT με οδηγό.
**Εναλλακτικές:** (Β) όλα μέσα στο `ct_cost_lines` — απορρίφθηκε: το ιστορικό
(2.500+ γραμμές) δεν έχει RT· (Γ) μόνο πληρωμές + υπόλοιπο έναρξης —
απορρίφθηκε από τον owner («πλήρης εισαγωγή»).
**Απόδειξη:** `ΑΙΜΙΛΙΟΣ.xlsx` 168 γραμμές → 354,76 € = τελευταίο ΠΡΟΟΔΕΥΤΙΚΟ
του Excel, επιβεβαιωμένο με `sum(balance_delta)` στη βάση μετά την εισαγωγή.
`dl_v_rt_gap = 0`. Αναθεωρεί το TRIP_COSTS_SPEC §10.1 #5 ως προς τον πίνακα,
όχι ως προς την αρχή «ανά δρομολόγιο».
**Ποιος:** owner (και οι τρεις ερωτήσεις: μόνο ανά δρομολόγιο, χειροκίνητη
αξία, πλήρης εισαγωγή), Claude (υλοποίηση).
```

- [ ] **Step 2: TRIP_COSTS_DECISION_LOG** — πρόσθεσε στο τέλος:

```markdown
## 2026-09-05 — §10.1 #5 αναθεωρείται ως προς τον πίνακα

Driver pay παραμένει per-trip, manual v1. Η πηγή δεν είναι πλέον γραμμή
`driver_pay` στο `ct_cost_lines` αλλά η γραμμή trip της καρτέλας οδηγού
(`dl_entries`, migration 011). Τα Έξοδα Μ (`cash_m`) το ίδιο. Το PnL τα
διαβάζει μέσω `ct_v_rt_costs.dl_trip_value/dl_expenses` και δείχνει
«εκκρεμεί»/«χωρίς γραμμή καρτέλας» αντί για 0. Πλήρες: docs/DECISION_LOG.md.
```

- [ ] **Step 3: CLAUDE.md** — στο «Κατάσταση modules», μετάφερε το «Driver Payroll» από «Επόμενα» σε «Σε παραγωγική χρήση» ως `Μισθοδοσία Οδηγών (καρτέλα οδηγού, από 5/9/2026)`. Στον πίνακα του επαναλαμβανόμενου ελέγχου πρόσθεσε γραμμή:

```markdown
| Μισθοδοσία: αξία / έλαβε / έξοδα | `dl_entries.trip_value/advance/expenses` | μετρήθηκε μετά την εισαγωγή: Αιμίλιος 168/168, υπόλοιπο 354,76 |
```

- [ ] **Step 4: Μνήμη** — ενημέρωσε `~/.claude/projects/-Users-dimitrispetras-PETRASGROUP-TMS/memory/project_driver_payroll_ledger.md`: κατάσταση «υλοποιήθηκε <ημερομηνία>», ποια αρχεία Drive εισήχθησαν, ποια εκκρεμούν, και ότι το επόμενο είναι ο αυτόματος υπολογισμός αξίας (owner: «όχι τώρα»).

- [ ] **Step 5: Commit + push**

```bash
git add docs/DECISION_LOG.md docs/TRIP_COSTS_DECISION_LOG.md CLAUDE.md
git commit -m "docs: driver ledger decision (dl_entries source, PnL reads it), module status, recurring check row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

## Σειρά και εξαρτήσεις

```
Task 1 (migration, owner τρέχει) ─┐
Task 2 (rules, TDD) ──────────────┼─→ Task 3 (Worker, deploy > 15:00) ─→ Task 4 (importer) ─→ Task 9 (εισαγωγή)
Task 5 (helpers, TDD) ─→ Task 6 (οθόνες) ─→ Task 7 (costs.js) ─→ Task 8 (κριτές) ─→ Task 10 (ίχνος)
```
Τα Tasks 2, 4 (parser + τεστ + dry run), 5, 6 (χωρίς το Step 6) μπορούν να γίνουν **πριν** το deploy· ό,τι αγγίζει τη βάση περιμένει το Task 1 και το deploy του Task 3.

## Self-review (έγινε κατά τη συγγραφή)

- **Κάλυψη spec:** §2.1 πίνακας → T1· §2.2 views → T1· §2.3 PnL → T1+T7· §3 trigger → T1· §4 Worker → T2+T3· §5 οθόνες → T5+T6· §6 εισαγωγή → T4+T9· §7 «αν σπάσει» → T1 (`dl_v_rt_gap`), T3 (400 με όνομα πεδίου), T6 (showError, «εκκρεμεί»), T8 (κριτές)· §8 εκτός εμβέλειας: κανένα task δεν το αγγίζει· §9 σειρά → τηρείται.
- **Ονόματα σε συμφωνία:** `validateNewEntry/validatePatch` (T2↔T3)· `dl_v_balance` στήλες `has_entries, trips_ytd, pending_count, review_count, days_since_last_entry, last_trip_date, last_trip_end, last_trip_route, last_trip_rt_code, last_payment_date, last_payment_type` (T1↔T6)· `dl_v_entries` στήλες `route_text, rt_code, pending, cancelled, running_balance` (T1↔T6)· `ct_v_rt_pnl.dl_trip_value/dl_expenses/driver_pay_pending/driver_pay_missing` (T1↔T7)· RPC `dl_import(p_driver_id,p_batch,p_file_name,p_file_hash,p_rows,p_actor)` (T1↔T3)· `renderPayroll/dlRenderList/renderPayrollDriver/dlRenderDriver/dlOpenForm/dlRecalc/dlSaveForm` (T6↔T8 figma-map).
- **Γνωστό όριο:** το `route_text` για συνδεδεμένα RT χρησιμοποιεί την πρώτη τοποθεσία φόρτωσης/εκφόρτωσης κάθε σκέλους — αρκεί για την καρτέλα, δεν αντικαθιστά το `ctLegLine` του PnL.
