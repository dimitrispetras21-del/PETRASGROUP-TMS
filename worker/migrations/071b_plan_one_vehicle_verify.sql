-- 071b VERIFY - read-only (SELECT only). ONE row. ASCII only.
-- EXPECTED after 071b: truck_once = true ; driver_once = true ; btree_gist = its version ; truck_overlaps = 0 ;
-- driver_overlaps = 0 (the last two are an independent count of what the constraints forbid: always 0).
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_truck_once'
           AND contype = 'x' AND condeferrable AND condeferred) AS truck_once,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass AND conname = 'rt_v2_driver_once'
           AND contype = 'x' AND condeferrable AND condeferred) AS driver_once,
  (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist') AS btree_gist,
  (SELECT count(*) FROM public.ct_round_trips a JOIN public.ct_round_trips b ON a.id < b.id AND a.truck_id = b.truck_id
     AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   WHERE a.model = 2 AND b.model = 2 AND a.trip_type = 'OWNED' AND b.trip_type = 'OWNED'
     AND a.status <> 'cancelled' AND b.status <> 'cancelled') AS truck_overlaps,
  (SELECT count(*) FROM public.ct_round_trips a JOIN public.ct_round_trips b ON a.id < b.id AND a.driver_id = b.driver_id
     AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   WHERE a.model = 2 AND b.model = 2 AND a.trip_type = 'OWNED' AND b.trip_type = 'OWNED'
     AND a.status <> 'cancelled' AND b.status <> 'cancelled') AS driver_overlaps;
