-- 083 VERIFY - read only (SELECT), after 083_plan_load_without_truck.sql. One row.
-- EXPECTED: applied = '083 in place', still_refuses_missing_truck true, loads_without_vehicle >= 0.
--   loads_without_vehicle: live v5 cycles with no vehicle (the "PROS ANATHESI" loads: cleared cycles + the loads made
--   with "later"); it grows when the desk opens loads without a truck and falls when a vehicle is given to them.
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_rt_create(jsonb,text,text)'::regprocedure)
                 = '7e6abee9852b952a1de922d0dbc794bf' THEN '083 in place' ELSE '083 NOT APPLIED' END AS applied,
       (SELECT prosrc LIKE '%no_vehicle%' FROM pg_proc WHERE oid = 'public.plan_rt_create(jsonb,text,text)'::regprocedure)
         AS still_refuses_missing_truck,
       (SELECT count(*) FROM public.ct_round_trips r WHERE r.model = 2 AND r.status = 'planned'
          AND r.trip_type = 'OWNED' AND r.truck_id IS NULL) AS loads_without_vehicle;
