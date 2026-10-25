-- 071b VERIFY - read-only (SELECT only). ONE row. ASCII only.
-- EXPECTED after 071b: truck_once = true ; driver_once = true ; exclude_on = 'ct_round_trips' ; btree_gist = its
-- version ; truck_overlaps = 0 ; driver_overlaps = 0 (the last two are an independent count of what the constraints
-- forbid: always 0).
-- EXPECTED after 072b (the vehicle handover moves the two EXCLUDE to the segments, same names, same rule - plan
-- docs/superpowers/plans/2026-10-25-national-v5-vehicle-handover.md): truck_once = true ; driver_once = true ;
-- exclude_on = 'rt_vehicle_segments' ; truck_overlaps = NULL ; driver_overlaps = NULL. A cycle is no longer one
-- vehicle (2104 until 14:30, 2108 after it), so a count over the cycles' windows would be a false alarm: the
-- independent count lives in 072b's verify (overlaps). Review R2 of that plan (E2): this file never says "false"
-- for a rule that is in place.
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid IN ('public.ct_round_trips'::regclass, to_regclass('public.rt_vehicle_segments'))
           AND conname = 'rt_v2_truck_once' AND contype = 'x' AND condeferrable AND condeferred) AS truck_once,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid IN ('public.ct_round_trips'::regclass, to_regclass('public.rt_vehicle_segments'))
           AND conname = 'rt_v2_driver_once' AND contype = 'x' AND condeferrable AND condeferred) AS driver_once,
  (SELECT string_agg(DISTINCT conrelid::regclass::text, ',') FROM pg_constraint
    WHERE conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') AND contype = 'x') AS exclude_on,
  (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist') AS btree_gist,
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_truck_once')
  THEN (SELECT count(*) FROM public.ct_round_trips a JOIN public.ct_round_trips b ON a.id < b.id AND a.truck_id = b.truck_id
     AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   WHERE a.model = 2 AND b.model = 2 AND a.trip_type = 'OWNED' AND b.trip_type = 'OWNED'
     AND a.status <> 'cancelled' AND b.status <> 'cancelled') END AS truck_overlaps,
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_driver_once')
  THEN (SELECT count(*) FROM public.ct_round_trips a JOIN public.ct_round_trips b ON a.id < b.id AND a.driver_id = b.driver_id
     AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   WHERE a.model = 2 AND b.model = 2 AND a.trip_type = 'OWNED' AND b.trip_type = 'OWNED'
     AND a.status <> 'cancelled' AND b.status <> 'cancelled') END AS driver_overlaps;
