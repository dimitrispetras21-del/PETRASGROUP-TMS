-- DRAFT 056 — ONE week definition everywhere: the database's week_number = TmsWeek.
-- NOT EXECUTED. Owner runs it (after 15:00). No Worker deploy needed: the facade already
-- maps «Week Number» → week_number; only the number it carries changes.
--
-- Why (owner 3/10/2026, decision «Α»; measurement docs/data-audit/2026-10/
-- 2026-10-03-week-number-vs-tmsweek.md): orders_with_derived.week_number counted
-- Sunday–Saturday weeks numbered in the calendar year, while the Weekly boards (and the
-- Orders page «Εβδομάδα») count Saturday–Friday weeks (owner 10/8, 28/9) numbered in the
-- year of the week's Sunday (core/tms-week.js). Measured 3/10: 26 of 253 live orders sat in
-- a different week on the Dashboard than on the Weekly — every one a Saturday loading — and
-- Fri 1/1/2027 would be W1 in the database but W53 on the boards. Two truths = none
-- (principle 3); the rule goes to the lowest layer (principle 4).
--
-- What changes: ONLY the week_number expression of orders_with_derived_old, the one place it
-- is computed. orders_with_derived_old2/_old3/orders_with_derived select v.week_number
-- through unchanged. Same 124 columns, same order, same types (CREATE OR REPLACE refuses
-- anything else — the 052 lesson), grants untouched (service_role + postgres only).
-- loading_datetime is a DATE: no time zone enters the calculation.
--
-- tms_week(d) / tms_week_year(d) are core/tms-week.js numOf() and the year its start()
-- uses, in SQL. tests/tms-week-sql.test.js compares them day by day for 2026-01-01…2028-12-31
-- against the JS module, from a fixture produced by running THESE bodies (the test refuses a
-- fixture made from a different text — edit the SQL, regenerate the fixture).
--
-- Rollback: re-run the CREATE OR REPLACE VIEW below with the old expression (kept in the
-- comment next to week_number) and `drop function public.tms_week(date),
-- public.tms_week_year(date);` — after the view no longer uses them.

begin;

-- The Saturday of d's week is d - ((dow + 1) % 7); its Sunday is one day later. The week
-- number is the old Sunday-start WEEKNUM of that Sunday, counted in THAT Sunday's year — so
-- Sat 26/12/2026 … Fri 1/1/2027 is W53 on every one of its days.
create function public.tms_week(d date) returns integer
language sql immutable strict parallel safe
as $tmsweek$
  select ceil(((s.sun - make_date(extract(year from s.sun)::int, 1, 1))
               + extract(dow from make_date(extract(year from s.sun)::int, 1, 1))::int + 1) / 7.0)::int
    from (select (d - ((extract(dow from d)::int + 1) % 7) + 1)::date as sun) s
$tmsweek$;

-- The week-year: the year of the week's Sunday (TmsWeek.start's default year).
create function public.tms_week_year(d date) returns integer
language sql immutable strict parallel safe
as $tmsweekyear$
  select extract(year from (d - ((extract(dow from d)::int + 1) % 7) + 1))::int
$tmsweekyear$;

-- Born closed (principle 5): functions are executable by PUBLIC by default. The view's
-- readers (service_role through the Worker) need EXECUTE — a view checks function
-- privileges as its CALLER.
revoke all on function public.tms_week(date), public.tms_week_year(date) from public, anon, authenticated;
grant execute on function public.tms_week(date), public.tms_week_year(date) to service_role;

-- Before: every live and deleted row's current number, to prove what moved.
create temp table _w056_before on commit drop as
  select id, loading_datetime, week_number from public.orders_with_derived;

create or replace view public.orders_with_derived_old as
 SELECT id,
    legacy_id,
    brand,
    order_type,
    direction,
    status,
    ops_status,
    invoice_status,
    delivery_performance,
    carrier_type,
    refrigerator_mode,
    pallet_type,
    price,
    partner_rate,
    advance_paid,
    goods,
    gross_weight_kg,
    temperature_c,
    reference,
    groupage_id,
    matched_import_id,
    partner_truck_plates,
    eta,
    invoice_number,
    notes,
    ops_notes,
    high_risk_auto_flag,
    loading_datetime,
    delivery_datetime,
    cross_dock_date,
    postponed_to,
    actual_delivery_date,
    invoice_date,
    assigned_at,
    pallet_exchange,
    temp_check,
    docs_ready,
    pallet_exchange_confirmed,
    sms_to_driver,
    money_confirmed,
    client_updated,
    done,
    veroia_switch,
    high_risk_flag,
    national_order_created,
    invoiced,
    national_groupage,
    is_partner_trip,
    pallet_sheet_1_uploaded,
    pallet_sheet_2_uploaded,
    cmr_photo_received,
    client_notified,
    temp_ok,
    driver_notified,
    second_card,
    client_id,
    partner_id,
    truck_id,
    trailer_id,
    driver_id,
    loading_location_1_id,
    loading_location_2_id,
    loading_location_3_id,
    loading_location_4_id,
    loading_location_5_id,
    loading_location_6_id,
    loading_location_7_id,
    loading_location_8_id,
    loading_location_9_id,
    loading_location_10_id,
    unloading_location_1_id,
    unloading_location_2_id,
    unloading_location_3_id,
    unloading_location_4_id,
    unloading_location_5_id,
    unloading_location_6_id,
    unloading_location_7_id,
    unloading_location_8_id,
    unloading_location_9_id,
    unloading_location_10_id,
    veroia_crossdock_id,
    loading_pallets_1,
    loading_pallets_2,
    loading_pallets_3,
    loading_pallets_4,
    loading_pallets_5,
    loading_pallets_6,
    loading_pallets_7,
    loading_pallets_8,
    loading_pallets_9,
    loading_pallets_10,
    unloading_pallets_1,
    unloading_pallets_2,
    unloading_pallets_3,
    unloading_pallets_4,
    unloading_pallets_5,
    unloading_pallets_6,
    unloading_pallets_7,
    unloading_pallets_8,
    unloading_pallets_9,
    unloading_pallets_10,
    loading_datetime_2,
    loading_datetime_3,
    loading_datetime_4,
    loading_datetime_5,
    loading_datetime_6,
    loading_datetime_7,
    loading_datetime_8,
    loading_datetime_9,
    loading_datetime_10,
    unloading_datetime_1,
    unloading_datetime_2,
    unloading_datetime_3,
    unloading_datetime_4,
    unloading_datetime_5,
    unloading_datetime_6,
    unloading_datetime_7,
    unloading_datetime_8,
    unloading_datetime_9,
    unloading_datetime_10,
    created_at,
    deleted_at,
    -- was: floor((loading_datetime - (make_date(year,1,1) - dow(jan1)))::numeric / 7.0)::integer + 1
    --      (Sunday–Saturday, calendar year)
        CASE
            WHEN loading_datetime IS NULL THEN NULL::integer
            ELSE public.tms_week(loading_datetime)
        END AS week_number,
    COALESCE(loading_pallets_1, 0::numeric) + COALESCE(loading_pallets_2, 0::numeric) + COALESCE(loading_pallets_3, 0::numeric) + COALESCE(loading_pallets_4, 0::numeric) + COALESCE(loading_pallets_5, 0::numeric) + COALESCE(loading_pallets_6, 0::numeric) + COALESCE(loading_pallets_7, 0::numeric) + COALESCE(loading_pallets_8, 0::numeric) + COALESCE(loading_pallets_9, 0::numeric) + COALESCE(loading_pallets_10, 0::numeric) AS total_pallets
   FROM orders o;

-- Proof inside the transaction — any failure rolls everything back.
do $$
declare
  n_before bigint; n_after bigint; n_cols int; moved bigint; moved_sat bigint; moved_other bigint;
  bad_value bigint; open_grants int;
begin
  select count(*) into n_before from _w056_before;
  select count(*) into n_after from public.orders_with_derived;
  if n_before <> n_after then raise exception '056: row count % <> %', n_after, n_before; end if;

  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'orders_with_derived_old';
  if n_cols <> 124 then raise exception '056: orders_with_derived_old has % columns, expected 124', n_cols; end if;

  -- Every row now carries exactly the TmsWeek number of its loading date.
  select count(*) into bad_value from public.orders_with_derived
   where week_number is distinct from (case when loading_datetime is null then null else public.tms_week(loading_datetime) end);
  if bad_value <> 0 then raise exception '056: % rows with a week_number other than tms_week()', bad_value; end if;

  -- What moved: only Saturday loadings (the Sunday→Saturday shift) and, at the year edge
  -- (25/12–7/1), the days whose week belongs to the other year. Nothing else may move.
  select count(*),
         count(*) filter (where extract(dow from b.loading_datetime) = 6),
         count(*) filter (where extract(dow from b.loading_datetime) <> 6
                            and not (to_char(b.loading_datetime, 'MMDD') >= '1225' or to_char(b.loading_datetime, 'MMDD') <= '0107'))
    into moved, moved_sat, moved_other
    from _w056_before b join public.orders_with_derived v on v.id = b.id
   where v.week_number is distinct from b.week_number;
  if moved_other <> 0 then raise exception '056: % orders moved week without a Saturday or year-edge loading', moved_other; end if;
  raise notice '056: % orders changed week_number (% Saturday loadings, % at the year edge)', moved, moved_sat, moved - moved_sat;

  -- Still closed: no view of the chain and no new function open to anon/authenticated.
  select count(*) into open_grants from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'orders_with_derived%' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if open_grants <> 0 then raise exception '056: orders_with_derived* open to anon/authenticated (% grants)', open_grants; end if;
  if has_function_privilege('anon', 'public.tms_week(date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.tms_week(date)', 'EXECUTE') then
    raise exception '056: tms_week() executable by anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.tms_week(date)', 'EXECUTE') then
    raise exception '056: service_role cannot execute tms_week() — every ORDERS read would fail';
  end if;
end $$;

commit;

-- After commit (SELECT only):
--   select count(*) filter (where week_number = public.tms_week(loading_datetime)) as tms_week,
--          count(*) filter (where loading_datetime is not null) as with_date
--     from public.orders_with_derived;
--   -- the year edge, by hand:
--   select d::date, public.tms_week(d::date), public.tms_week_year(d::date)
--     from generate_series('2026-12-25'::date, '2027-01-04'::date, '1 day') d;
