-- 030 — Fuel lines: tank ↔ trailer, fuel source, the dead FUEL table goes
-- (owner 13/9/2026, spec docs/superpowers/specs/2026-09-13-fuel-collection-program.md §2.Α)
--
-- STATUS: DRAFT — NOT EXECUTED. Run only after the owner says so in chat
-- (CLAUDE.md «Supabase = SELECT μόνο»), and BEFORE any Worker deploy that
-- writes trailer_id / fuel_source (DECISION_LOG 2026-09-08 «ποιες migrations
-- περιμένει ο κώδικας που ανεβαίνει;»).
--
-- WHY: fuel is the owner's biggest cost risk and today the line cannot say
-- (a) which tank it filled — «reefer_fuel» exists as a category but the line
-- has only truck_id, so reefer diesel never binds to the trailer that burned
-- it; (b) where the fuel came from — DADI, DKV, the BG station, our own tank
-- or a third party all land as «fuel» with a free-text station, so the
-- weekly DADI invoice can never be reconciled against its delivery notes.
-- The owner rejected a second FUELS table (two truths for one litre); the
-- legacy `fuel` table has 0 rows, no writer, and a «coming soon» screen —
-- it lies about a mechanism that does not exist (αρχή 8), so it goes.
--
-- Rejected: a `tank` column next to `category` — `reefer_fuel` already IS
-- the tank discriminator; a second column would drift from it.

begin;

-- 1. Tank ↔ trailer. Filled by the Worker on POST/PATCH when
--    category = 'reefer_fuel' and the line has an rt_id: default =
--    ct_round_trips.trailer_id (54/60 filled since 1/8). User may override.
alter table ct_cost_lines
  add column if not exists trailer_id bigint references trailers(id);

create index if not exists ct_line_trailer on ct_cost_lines(trailer_id);

-- 2. Fuel source. Null for every non-fuel category (CHECK below). The DKV
--    import writes 'DKV'; the entry row offers the other four.
alter table ct_cost_lines
  add column if not exists fuel_source text;

alter table ct_cost_lines
  add constraint ct_line_fuel_source_chk check (
    fuel_source is null
    or (category in ('fuel','reefer_fuel','adblue')
        and fuel_source in ('DKV','DADI','BG_STATION','OWN_STATION','THIRD_PARTY'))
  );

-- 3. Backfill, deterministic and idempotent:
--    - every imported fuel/adblue line came from the DKV statement;
--    - the existing reefer line(s) take the trailer of their round trip.
update ct_cost_lines
   set fuel_source = 'DKV'
 where doc_id is not null
   and category in ('fuel','reefer_fuel','adblue')
   and fuel_source is null;

update ct_cost_lines l
   set trailer_id = r.trailer_id
  from ct_round_trips r
 where l.rt_id = r.id
   and l.category = 'reefer_fuel'
   and l.trailer_id is null
   and r.trailer_id is not null;

-- 4. The fuel «ledger» the owner asked for = a view over the lines, not a
--    second store. One row per fill-up.
create or replace view ct_v_fuel as
select l.id,
       l.line_date,
       l.category,                      -- fuel | reefer_fuel | adblue
       l.fuel_source,
       t.license_plate  as truck_plate,
       tr.license_plate as trailer_plate,
       l.liters,
       l.km_reading,
       l.station,
       l.net,
       l.vat,
       l.rt_id,
       r.code           as rt_code,
       l.doc_id,
       l.created_by,
       l.created_at
  from ct_cost_lines l
  left join trucks   t  on t.id  = l.truck_id
  left join trailers tr on tr.id = l.trailer_id
  left join ct_round_trips r on r.id = l.rt_id
 where l.category in ('fuel','reefer_fuel','adblue');

-- 5. The dead table. Verified 13/9/2026: select count(*) from fuel = 0;
--    nothing in app/Worker writes to it (facade id tblxRFsMeVhlLrBjF maps
--    to it — that mapping and the router's «coming soon» case are removed
--    in the same change set, Worker deploy after this migration).
drop table if exists fuel;

commit;

-- Proof (run after):
--   select count(*) filter (where fuel_source is not null) as with_source,
--          count(*) filter (where category='reefer_fuel' and trailer_id is not null) as reefer_with_trailer,
--          count(*) as fuel_lines
--     from ct_cost_lines where category in ('fuel','reefer_fuel','adblue');
--   select count(*) from ct_v_fuel;
--   select to_regclass('public.fuel');   -- must be null
