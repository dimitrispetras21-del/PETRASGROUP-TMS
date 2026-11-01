-- 069 ROLLBACK - order_dates_follow (028) back to its live text of 11/10 BYTE FOR BYTE, the two 069 triggers
-- and their functions out, B-54 -2. The data 069 moved (cross-docks, Cross-dock stops, Ramp lines) stays
-- where it is: those moves followed real changes of the dispatchers and are each in audit_log
-- (actor trigger:order_dates_follow / trigger:order_cd_stop_follow / trigger:ramp_follows_stop).
--
-- DRAFT - NOT EXECUTED. Only if the coordinator/owner decide to undo 069, after 15:00, with an explicit
-- yes. ORDER (plan docs/weekly-natl-redesign/PLAN.md section 7.3): FIRST the front (revert of the WP-A
-- commits + SW_VERSION), THEN this file. The other way round the new front would run without
-- order_cd_stop_follow: the first Veroia day changed from a board would leave the order's Cross-dock
-- stop (the Ramp's pick-up) on the old day. The old front is safe on the 069 data: every VS load is
-- inside the old +-1 window after 069_hub_day_once_repair.
-- The repair (069_hub_day_once_repair.sql) does NOT need undoing (it fixes wrong data); if asked, run
-- 069_hub_day_once_repair_rollback.sql AFTER this file (then nothing follows the restored values).
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "069 ROLLBACK OK ..." and ONE row "069 ROLLED BACK | <T-2> | <T-2>".

DO $do$
DECLARE
  cur_src text; old_src text;
  a_old CONSTANT text := 'where s.order_id = new.id and s.deleted_at is null and s.datetime is not null';
  a_new CONSTANT text := 'where s.order_id = new.id and s.deleted_at is null and s.datetime is not null' || E'\n'
    || '             and (s.stop_type is distinct from ''Cross-dock'' or new.cross_dock_date is null) -- 069: a dated cross-dock owns its stop (order_cd_stop_follow)';
  b_old CONSTANT text := 'if d_cd <> 0 and new.cross_dock_date is not null then';
  b_new CONSTANT text := 'if d_cd <> 0 and new.cross_dock_date is not null' || E'\n'
    || '     and old.cross_dock_date is not distinct from new.cross_dock_date then -- 069: once - never on top of a value this same write set';
  trg_before int; trg_after int; k int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS: 069 is what is installed, untouched since.
  SELECT p.prosrc INTO cur_src FROM pg_proc p WHERE p.oid = 'public.order_dates_follow()'::regprocedure;
  IF md5(cur_src) <> '4b5d279f21f981a11d35a5deb655269a' THEN
    RAISE EXCEPTION '069 rollback: order_dates_follow is not the 069 text (md5 %) - edited by hand or 069 not applied, stop', md5(cur_src);
  END IF;
  IF to_regprocedure('public.order_cd_stop_follow()') IS NULL OR to_regprocedure('public.ramp_follows_stop()') IS NULL THEN
    RAISE EXCEPTION '069 rollback: a 069 function is missing - 069 is not (fully) applied, stop';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal AND ((c.relname = 'orders' AND t.tgname = 'order_cd_stop_follow')
                                  OR (c.relname = 'order_stops' AND t.tgname = 'ramp_follows_stop'))) <> 2 THEN
    RAISE EXCEPTION '069 rollback: the two 069 triggers are not both there, stop';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '069 rollback: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', trg_before;
  END IF;

  -- 1. The two triggers and their functions.
  DROP TRIGGER ramp_follows_stop ON public.order_stops;
  DROP TRIGGER order_cd_stop_follow ON public.orders;
  DROP FUNCTION public.ramp_follows_stop();
  DROP FUNCTION public.order_cd_stop_follow();

  -- 2. 028 back: the swap the other way, proven = the live text of 11/10.
  old_src := replace(replace(cur_src, a_new, a_old), b_new, b_old);
  IF md5(old_src) <> 'e977a5a31a3cd2dce85dae6e39b0764f' THEN
    RAISE EXCEPTION '069 rollback: the restored 028 text is not the one of 11/10 (md5 %) - stop', md5(old_src);
  END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.order_dates_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', old_src);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) <> 'e977a5a31a3cd2dce85dae6e39b0764f' THEN
    RAISE EXCEPTION '069 rollback proof: order_dates_follow does not hold the 028 text';
  END IF;

  -- 3. B-54: exactly two triggers fewer.
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before - 2 THEN
    RAISE EXCEPTION '069 rollback proof: trigger count % -> % (expected -2)', trg_before, trg_after;
  END IF;
  UPDATE monitoring.checks SET red_value = trg_after WHERE id = 'B-54' AND red_value = trg_before;
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '069 rollback: B-54 not updated (% rows)', k; END IF;

  RAISE NOTICE '069 ROLLBACK OK: 028 is the 11/10 text again, order_cd_stop_follow and ramp_follows_stop removed; triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN to_regprocedure('public.order_cd_stop_follow()') IS NULL AND to_regprocedure('public.ramp_follows_stop()') IS NULL
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) = 'e977a5a31a3cd2dce85dae6e39b0764f'
            THEN '069 ROLLED BACK' ELSE '069 STILL IN PLACE' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
