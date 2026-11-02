-- 097 ROLLBACK: the vehicle trigger goes, B-54 goes back by one. rt_link_split itself was never changed by 097.
-- Round trips merged by the trigger while it lived stay merged (each one is an audit row "merged ... (037)" with
-- actor trigger:rt_sync; un-merging is a data decision per pair, not part of this rollback).
-- WHEN: any time the owner says so (a DROP TRIGGER takes the same short lock as 097: lock_timeout 5 s).
-- BEFORE IT: 097_rt_split_vehicle_recheck_rollback_dryrun.sql (generated, undone).
-- EXPECTED: NOTICE "097 ROLLBACK OK: ..." and ONE result row "097 ROLLED BACK | T-1 | T-1".
-- THIS FILE IS ASCII ONLY. ONE DO block, then ONE read-only SELECT.

DO $do$
DECLARE
  trg_before int; trg_after int; r record; v numeric;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'rt_y_link_split_vehicle'
                   AND md5(pg_get_triggerdef(oid)) = 'b1db54c1bcc73d086bc6cfa06a3e677e') THEN
    RAISE EXCEPTION '097 rollback: trigger rt_y_link_split_vehicle is not there as 097 made it - nothing to roll back (or someone changed it)';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '097 rollback: B-54 red_value is not the live trigger count % - re-measure', trg_before;
  END IF;

  DROP TRIGGER rt_y_link_split_vehicle ON public.orders;
  UPDATE monitoring.checks SET red_value = trg_before - 1 WHERE id = 'B-54';

  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before - 1 OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rt_y_link_split_vehicle')
     OR md5(pg_get_functiondef('public.rt_link_split()'::regprocedure)) <> 'd8a4a03dca0e8e26d4e8d227f1287590' THEN
    RAISE EXCEPTION '097 rollback proof: triggers % -> %, or the trigger is still there, or rt_link_split changed', trg_before, trg_after;
  END IF;
  FOR r IN SELECT sql_text FROM monitoring.checks WHERE id = 'B-54' AND enabled LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    RESET ROLE;
    IF v IS DISTINCT FROM trg_after::numeric OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v) THEN
      RAISE EXCEPTION '097 rollback proof: B-54 = % (red_value must equal it)', v;
    END IF;
  END LOOP;
  RAISE NOTICE '097 ROLLBACK OK: rt_y_link_split_vehicle dropped; triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rt_y_link_split_vehicle') THEN '097 ROLLED BACK' ELSE '097 STILL THERE' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
