-- 063 ROLLBACK - puts back exactly what 060 left (the guard function text of 060 verbatim, the
-- trigger on deleted_at only, dl_local_day_sync without the flag). DRAFT - NOT EXECUTED.
-- ASCII only. ONE DO block (all or nothing) + one read-only result SELECT.
--
-- No data to lose: 063 holds no rows, so this file has no data guard. What it gives back is F4:
-- after it, a local line's day, driver, route, RT, type and relay are again protected only by the
-- Worker's allow-list (worker/src/ledger-rules.mjs LOCAL_LINE_EDITABLE).
-- Proven on the PGlite copy of production: 063 -> rollback -> dl_local_line_guard md5 is again
-- 060's, the trigger is again BEFORE UPDATE OF deleted_at, the sync's config is again only its
-- search_path, the trigger count and B-54 never moved, 060's rules test is again 54 OK, and 063
-- can run again.
DO $do$
DECLARE n int; trg_before int; trg_after int; deleted_at_attnum int;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true); -- as 063: give up behind an idle transaction, never queue the app

  -- 0. GUARDS: 063 is applied, and nobody edited its guard since.
  IF to_regprocedure('public.dl_local_line_guard()') IS NULL OR to_regprocedure('public.dl_local_day_sync(bigint,date)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
                     WHERE p.oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure AND c = 'tms.local_day_sync=on') THEN
    RAISE EXCEPTION '063 rollback: 063 is not applied';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) <> 'e7f0348ccc5764d29608b8701f0e83b6' THEN
    RAISE EXCEPTION '063 rollback: dl_local_line_guard is not the 063 text - edited by hand after 063, stop';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before) THEN
    RAISE EXCEPTION '063 rollback: B-54 red_value is not the live trigger count % - re-measure', trg_before;
  END IF;

  -- 1. THE GUARD back to 060 (text of 060_local_relay.sql, verbatim; CREATE OR REPLACE keeps its ACL)
  CREATE OR REPLACE FUNCTION public.dl_local_line_guard() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
  BEGIN
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      RAISE EXCEPTION 'local_relay: a cancelled local payroll line is not restored - it comes back by itself when a relay of that driver and day returns'
        USING ERRCODE = '23514', HINT = 'local_relay:line_restore';
    END IF;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM local_moves lm
                    WHERE lm.driver_id = OLD.driver_id AND lm.move_date = OLD.entry_date AND lm.move_kind <> 'local'
                      AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled') THEN
      RAISE EXCEPTION 'local_relay: line % pays a live relay of that driver and day - enter value 0 or change the relay, do not cancel the line', OLD.id
        USING ERRCODE = '23514', HINT = 'local_relay:line_has_relay';
    END IF;
    RETURN NEW;
  END $f$;

  -- 2. THE SYNC without the flag
  ALTER FUNCTION public.dl_local_day_sync(bigint, date) RESET tms.local_day_sync;

  -- 3. THE TRIGGER as 060 created it
  DROP TRIGGER dl_local_line_guard ON public.dl_entries;
  CREATE TRIGGER dl_local_line_guard BEFORE UPDATE OF deleted_at ON public.dl_entries
    FOR EACH ROW WHEN (OLD.local_move_id IS NOT NULL AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.dl_local_line_guard();

  -- 4. PROOFS: back to the 060 fingerprints
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) <> '2b4de99653da7f0859f08b07a410225c' THEN
    RAISE EXCEPTION '063 rollback proof: dl_local_line_guard is not the 060 text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure
                  AND md5(prosrc) = '297954261e9e8fe2936f6217f31f1e7a' AND prosecdef AND proconfig = ARRAY['search_path=public']) THEN
    RAISE EXCEPTION '063 rollback proof: dl_local_day_sync is not the 060 function';
  END IF;
  SELECT attnum INTO deleted_at_attnum FROM pg_attribute
   WHERE attrelid = 'public.dl_entries'::regclass AND attname = 'deleted_at' AND NOT attisdropped;
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.dl_entries'::regclass AND tgname = 'dl_local_line_guard' AND NOT tgisinternal
     AND tgenabled = 'O' AND tgtype = 19 AND tgfoid = 'public.dl_local_line_guard()'::regprocedure
     AND tgattr::text = deleted_at_attnum::text;
  IF n <> 1 THEN RAISE EXCEPTION '063 rollback proof: trigger dl_local_line_guard is not the 060 one'; END IF;
  IF has_function_privilege('anon', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.dl_local_line_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION '063 rollback proof: dl_local_line_guard is executable by anon/authenticated/service_role';
  END IF;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '063 rollback proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
  END IF;
  RAISE NOTICE '063 ROLLBACK OK: guard back to 060 (deleted_at only); triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
                              WHERE p.oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure AND c LIKE 'tms.local_day_sync=%')
             AND (SELECT cardinality(tgattr::int2[]) FROM pg_trigger
                   WHERE tgrelid = 'public.dl_entries'::regclass AND tgname = 'dl_local_line_guard') = 1
            THEN '063 ROLLED BACK' ELSE '063 STILL APPLIED' END AS result,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) AS guard_md5;
