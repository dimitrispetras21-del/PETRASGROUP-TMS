-- CAPTURED from production 28/10/2026 (SELECT only, project gatejgbpyodlepkvqkgf), state "073b live" - the base 074a
-- is written on. Read by tms-auditor/test/plan-074a.test.mjs: the PGlite copy (072 + 072b + 073 + 073b) must hold
-- these same texts and columns, and 074a's PART 0 must guard on these same md5. Three sources, one truth (principle 3):
-- if production moves, re-capture with the queries below and the test says what drifted.
--   view:  SELECT relname, md5(pg_get_viewdef(oid, true)) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN (...)
--   fn:    SELECT oid::regprocedure, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (...)
--   col:   SELECT table_name || '.' || column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND ...
--   count: SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'plan\_%'
--   absent: to_regclass / to_regprocedure / pg_attribute = nothing (074a not applied)
-- One query, one row per fact. No row of data, no name of a client: ids and shapes only (public repo).
SELECT kind, name, value FROM (VALUES
  ('fn', 'public.plan_board(date,text)', '2e030bfc158de8a26d5814f618d1f5ac'),
  ('fn', 'public.plan_move_pieces(jsonb,text,text)', '97984f7500dead965ddcba0d2c3360ab'),
  ('fn', 'public.plan_h_raise(text,text)', '8c2b50932d181f8c674530cdddf8c328'),
  ('fn', 'public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)', '5eb6ede8180b8f4d4c3982de2b29bb8c'),
  ('fn', 'public.plan_h_token(text,text,jsonb)', '5ebb4630c920cf626c346dcc5aa2a34a'),
  ('fn', 'public.plan_h_strip_amounts(jsonb,text)', 'cc19be0190b5b82d50ee8521cc7bee43'),
  ('fn', 'public.plan_h_drop_consequences(bigint[],bigint,bigint[])', 'e370e52c9dd96d7e4e152b3ce348736e'),
  ('fn', 'public.plan_h_rt_consequences(bigint)', 'cddea3a5fb20a563283a16db3b50f133'),
  ('fn', 'public.plan_h_confirm(text,text,jsonb,jsonb,text)', 'ba70b5d8c98d261f39874e78641f3c2c'),
  ('fn', 'public.plan_h_finish()', '59d88ec85661d3ef2ac957aecd0e0fcd'),
  ('fn', 'public.plan_h_ok(text,jsonb,jsonb,jsonb)', 'cc4b43dc712e5389398840bf7b687cf5'),
  ('fn', 'public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)', '0d95758b35f6095d42b551c287e3008b'),
  ('fn', 'public.plan_h_seg_of_stop(bigint)', 'd2522a02fe675ff8001925cd07e9b668'),
  ('view', 'v_rt_segments', 'fd5ef0abf6cf2c0c7ddcdaa6abd420e1'), ('view', 'v_rt_cycle', '47ca7d81be348ec9f7f7bddd8c6563d9'),
  ('view', 'v_rt_stop_state', 'f758827112c0a1a34f3feebb8cd36c44'), ('view', 'v_national_order_state', '4d2f22b0689f2fd3d17a330ed0005782'),
  ('view', 'v_shipments', 'ea427b9516b1add5372a387e22b798f1'), ('view', 'v_piece_state', '598fd9472beaef97adaf49b1ff431504'),
  ('view', 'dl_v_rt_route', 'b21405a7856b912d2ea697235461cbd6'),
  ('col', 'locations.id', 'bigint'), ('col', 'locations.legacy_id', 'text'), ('col', 'locations.name', 'text'),
  ('col', 'locations.address', 'text'), ('col', 'locations.city', 'text'), ('col', 'locations.phone', 'text'),
  ('col', 'locations.is_hub', 'boolean'), ('col', 'locations.deleted_at', 'timestamp with time zone'),
  ('col', 'clients.id', 'bigint'), ('col', 'clients.legacy_id', 'text'), ('col', 'clients.company_name', 'text'),
  ('col', 'clients.active', 'boolean'), ('col', 'clients.deleted_at', 'timestamp with time zone'),
  ('col', 'trucks.id', 'bigint'), ('col', 'trucks.legacy_id', 'text'), ('col', 'trucks.license_plate', 'text'),
  ('col', 'trucks.active', 'boolean'), ('col', 'trucks.deleted_at', 'timestamp with time zone'),
  ('col', 'trailers.id', 'bigint'), ('col', 'trailers.legacy_id', 'text'), ('col', 'trailers.license_plate', 'text'),
  ('col', 'trailers.active', 'boolean'), ('col', 'trailers.deleted_at', 'timestamp with time zone'),
  ('col', 'drivers.id', 'bigint'), ('col', 'drivers.legacy_id', 'text'), ('col', 'drivers.full_name', 'text'),
  ('col', 'drivers.phone', 'text'), ('col', 'drivers.active', 'boolean'), ('col', 'drivers.deleted_at', 'timestamp with time zone'),
  ('col', 'partners.id', 'bigint'), ('col', 'partners.legacy_id', 'text'), ('col', 'partners.company_name', 'text'),
  ('col', 'partners.active', 'boolean'), ('col', 'partners.deleted_at', 'timestamp with time zone'),
  ('col', 'national_orders.price', 'numeric'), ('col', 'national_orders.goods', 'text'), ('col', 'national_orders.notes', 'text'),
  ('col', 'order_stops.goods', 'text'), ('col', 'order_stops.notes', 'text'),
  ('col', 'national_orders.source_order_id', 'bigint'),
  ('col', 'orders.legacy_id', 'text'), ('col', 'orders.deleted_at', 'timestamp with time zone'),
  ('col', 'piece_legs.created_at', 'timestamp with time zone'),
  ('nocol', 'locations.active', ''),
  ('count', 'plan_functions', '80'),
  ('absent', 'public.plan_config', ''), ('absent', 'public.plan_lookups(text)', ''),
  ('absent', 'shipment_pieces.for_split_at', '')
) AS live(kind, name, value);
