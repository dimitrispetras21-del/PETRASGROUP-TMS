-- 071b ROLLBACK - the two EXCLUDE constraints go. btree_gist stays installed (harmless; DROP EXTENSION only with its
-- own yes). Run it BEFORE 071_plan_schema_rollback.sql when both are undone.
-- EXECUTED 22/10/2026 by the owner. Only with an explicit yes, after 15:00. ASCII only. ONE DO block.
-- EXPECTED: NOTICE "071b ROLLBACK OK ..." and ONE row "071b ROLLED BACK".

DO $do$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
       AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) <> 2 THEN
    RAISE EXCEPTION '071b rollback: the two 071b constraints are not both there - stop';
  END IF;
  ALTER TABLE public.ct_round_trips DROP CONSTRAINT rt_v2_truck_once, DROP CONSTRAINT rt_v2_driver_once;
  RAISE NOTICE '071b ROLLBACK OK: both EXCLUDE constraints dropped; btree_gist stays installed';
END $do$;

SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('rt_v2_truck_once', 'rt_v2_driver_once'))
            THEN '071b ROLLED BACK' ELSE '071b STILL IN PLACE' END AS result;
