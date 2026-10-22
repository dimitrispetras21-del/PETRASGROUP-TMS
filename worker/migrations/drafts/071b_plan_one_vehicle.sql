-- 071b - NATIONAL v5, F1 second step: ONE TRUCK AND ONE DRIVER AT A TIME for owned v5 cycles.
--
-- DRAFT - NOT EXECUTED. A SEPARATE yes from 071 (tech draft, "technical approvals": CREATE EXTENSION btree_gist and
-- two EXCLUDE). Runs AFTER 071, after 15:00, in this order:
--   1. 071b_plan_one_vehicle_dryrun.sql   this block + a deliberate error: NOTHING kept
--   2. 071b_plan_one_vehicle.sql          (this file)
--   3. 071b_plan_one_vehicle_verify.sql   read-only, one row
--   4. 071b_plan_one_vehicle_test.sql     OPTIONAL on production: 8 cases on TEST rows, nothing kept
-- WHY: with 2-3 cycles a week per truck (Wednesday morning one ends, Wednesday afternoon the next starts) a double
-- booking must be refused by the base on every path (principle 4); F2 maps 23P01 by constraint name to truck_busy /
-- driver_busy. Only model=2 OWNED cycles that are not cancelled; [start_at, end_at) so a cycle ending at 14:00 and
-- the next starting at 14:00 do not collide. Today's round trips (model=1) are not touched.
-- DEFERRABLE INITIALLY DEFERRED: plan_* moves stops one by one inside one transaction (each move re-computes the
-- window, plan_rt_window_sync); only the window at COMMIT counts.
-- btree_gist gives "=" on bigint inside a GiST index (measured 21/10: available, not installed). It goes into schema
-- extensions (Supabase convention). If CREATE EXTENSION is refused in the SQL editor: Dashboard -> Database ->
-- Extensions -> btree_gist -> enable (schema extensions), then run this file again (IF NOT EXISTS).
-- Adds no trigger: B-54 unchanged (proved below). ASCII only. ONE DO block = ONE statement.
-- REVERSE: 071b_plan_one_vehicle_rollback.sql (drops the two constraints; the extension stays).
-- EXPECTED: NOTICE "071b OK: ..." and ONE row "071b OK | true | true | <btree_gist version>".

DO $do$
DECLARE
  v_trg0 int; v_trg1 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regclass('public.rt_stops') IS NULL OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ct_round_trips' AND column_name = 'start_at') THEN
    RAISE EXCEPTION '071b: 071 is not applied - run 071 first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
              AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) THEN
    RAISE EXCEPTION '071b: already applied - run 071b_plan_one_vehicle_verify.sql instead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'btree_gist') THEN
    RAISE EXCEPTION '071b: btree_gist is not available on this server - stop';
  END IF;
  IF to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION '071b: schema extensions does not exist - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ALTER TABLE public.ct_round_trips
    ADD CONSTRAINT rt_v2_truck_once EXCLUDE USING gist (truck_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
      WHERE (model = 2 AND trip_type = 'OWNED' AND truck_id IS NOT NULL AND status <> 'cancelled')
      DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT rt_v2_driver_once EXCLUDE USING gist (driver_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
      WHERE (model = 2 AND trip_type = 'OWNED' AND driver_id IS NOT NULL AND status <> 'cancelled')
      DEFERRABLE INITIALLY DEFERRED;

  -- PROOFS
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
       AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once') AND contype = 'x' AND condeferrable AND condeferred) <> 2 THEN
    RAISE EXCEPTION '071b proof: the two EXCLUDE constraints are not both there, deferrable, initially deferred';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN
    RAISE EXCEPTION '071b proof: trigger count % -> % (expected no change)', v_trg0, v_trg1;
  END IF;

  RAISE NOTICE '071b OK: one truck and one driver at a time for owned v5 cycles; btree_gist %; triggers % (B-54 unchanged)',
    (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist'), v_trg1;
END $do$;

SELECT CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
                   AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) = 2 THEN '071b OK' ELSE '071b NOT APPLIED' END AS result,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_truck_once' AND condeferred) AS truck_once,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rt_v2_driver_once' AND condeferred) AS driver_once,
       (SELECT extversion FROM pg_extension WHERE extname = 'btree_gist') AS btree_gist;
