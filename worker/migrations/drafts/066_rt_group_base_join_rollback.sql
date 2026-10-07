-- 066 ROLLBACK - puts back exactly what 033 / 037 left (as read on production 7/10): both walks
-- compare the WHOLE group_id again, byte for byte, and auditor check B-77 is removed.
-- DRAFT - NOT EXECUTED. ASCII only. ONE DO block (all or nothing) + one read-only result SELECT.
-- No superuser needed (only the owner's CREATE OR REPLACE FUNCTION and DELETE on monitoring rows):
-- proven on the PGlite copy run by a NOSUPERUSER owner, as production's SQL editor role is.
--
-- Generated the same way as 066: the LIVE text with the one condition swapped back - never a
-- retyped copy (033's text holds non-ASCII em dashes this file must not carry). Refuses unless both
-- live texts are exactly 066's (an edit after 066 would be lost silently otherwise).
-- No data to lose: 066 wrote no order, round trip or leg. What it gives back is the 7/10 incident:
-- after it, an order that gets its vehicle while its group sibling already carries the "|..."
-- suffix opens a separate round trip again, and B-77 no longer says so (B-01 / the screens' 409
-- banner still do, partly).
-- Proven on the PGlite copy of production: 066 -> rollback -> md5(pg_get_functiondef) of both
-- functions is again 3f3a0120... / 6189950c... (and prosrc f71d333b... / 75da6f6f...), same oid,
-- owner, grants, SECURITY DEFINER, search_path; the trigger count and B-54 never moved; B-77, its
-- results and incidents gone; 066 can run again.
DO $do$
DECLARE
  -- the same two strings as 066, swapped back
  cond_old text := $c$(cur.group_id is not null and n.group_id = cur.group_id)$c$;
  cond_new text := $c$(cur.group_id is not null and split_part(n.group_id,'|',1) = split_part(cur.group_id,'|',1))$c$;
  fn_create oid; fn_split oid; cur_create text; cur_split text; back_create text; back_split text;
  attrs_create text; attrs_split text; tg_before text; tg_after text;
  trg_before int; trg_after int; k int;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true); -- as 066: give up behind an idle transaction, never queue the app

  -- 0. GUARDS: 066 is applied, and nobody edited the two walks since.
  fn_create := to_regprocedure('public.rt_create_from_order()');
  fn_split  := to_regprocedure('public.rt_link_split()');
  IF fn_create IS NULL OR fn_split IS NULL THEN
    RAISE EXCEPTION '066 rollback: rt_create_from_order() or rt_link_split() does not exist - stop';
  END IF;
  cur_create := pg_get_functiondef(fn_create);
  cur_split  := pg_get_functiondef(fn_split);
  IF md5(cur_create) = '3f3a01204f7f4a4b6546e965fc231ae3' AND md5(cur_split) = '6189950c70b289fd5075afd17e28ecec'
     AND NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-77') THEN
    RAISE EXCEPTION '066 rollback: 066 is not applied';
  END IF;
  IF md5(cur_create) <> '8e964f66556677a284eca13db70665c6' THEN
    RAISE EXCEPTION '066 rollback: rt_create_from_order is not the 066 text (md5 %) - edited after 066, stop', md5(cur_create);
  END IF;
  IF md5(cur_split) <> 'd8a4a03dca0e8e26d4e8d227f1287590' THEN
    RAISE EXCEPTION '066 rollback: rt_link_split is not the 066 text (md5 %) - edited after 066, stop', md5(cur_split);
  END IF;
  SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                   proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
    INTO attrs_create FROM pg_proc WHERE oid = fn_create;
  SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                   proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
    INTO attrs_split FROM pg_proc WHERE oid = fn_split;
  SELECT string_agg(t.tgname || ':' || t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || t.tgfoid::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' ORDER BY t.oid)
    INTO tg_before FROM pg_trigger t WHERE t.tgfoid IN (fn_create, fn_split) AND NOT t.tgisinternal;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before) THEN
    RAISE EXCEPTION '066 rollback: B-54 red_value is not the live trigger count % - re-measure', trg_before;
  END IF;

  -- 1. THE TWO WALKS back to the 7/10 texts (the live 066 text, the condition swapped back)
  back_create := replace(cur_create, cond_new, cond_old);
  back_split  := replace(cur_split, cond_new, cond_old);
  EXECUTE back_create;
  EXECUTE back_split;

  -- 2. AUDITOR: B-77 removed. Open incidents first (incidents has no foreign key to checks: they would
  --    stay open in the report for a check that is gone), then results (they reference checks).
  UPDATE monitoring.incidents SET state = 'resolved', resolved_verified_at = clock_timestamp(),
         state_changed_by = '066 rollback (check removed)', state_changed_at = clock_timestamp()
   WHERE state IN ('new', 'confirmed', 'recurred')
     AND (check_id = 'B-77' OR incident_key IN ('MECH:check:B-77', 'MECH:stale:B-77'));
  DELETE FROM monitoring.results WHERE check_id = 'B-77';
  DELETE FROM monitoring.checks WHERE id = 'B-77';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '066 rollback: % B-77 rows deleted (expected 1)', k; END IF;

  -- 3. PROOFS: the 7/10 fingerprints, byte for byte; the same functions and attributes; triggers untouched
  IF to_regprocedure('public.rt_create_from_order()') IS DISTINCT FROM fn_create
     OR md5(pg_get_functiondef(fn_create)) <> '3f3a01204f7f4a4b6546e965fc231ae3'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_create) <> 'f71d333b33e1404817779c4033534b30' THEN
    RAISE EXCEPTION '066 rollback proof: rt_create_from_order is not the 7/10 text (md5 %)', md5(pg_get_functiondef(fn_create));
  END IF;
  IF to_regprocedure('public.rt_link_split()') IS DISTINCT FROM fn_split
     OR md5(pg_get_functiondef(fn_split)) <> '6189950c70b289fd5075afd17e28ecec'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_split) <> '75da6f6f0389ba01ffd86074191eb4d7' THEN
    RAISE EXCEPTION '066 rollback proof: rt_link_split is not the 7/10 text (md5 %)', md5(pg_get_functiondef(fn_split));
  END IF;
  IF (SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                       proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
        FROM pg_proc WHERE oid = fn_create) IS DISTINCT FROM attrs_create
     OR (SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                          proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
           FROM pg_proc WHERE oid = fn_split) IS DISTINCT FROM attrs_split THEN
    RAISE EXCEPTION '066 rollback proof: owner, grants, SECURITY DEFINER, search_path or another attribute of a walk changed';
  END IF;
  SELECT string_agg(t.tgname || ':' || t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || t.tgfoid::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' ORDER BY t.oid)
    INTO tg_after FROM pg_trigger t WHERE t.tgfoid IN (fn_create, fn_split) AND NOT t.tgisinternal;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF tg_after IS DISTINCT FROM tg_before OR trg_after <> trg_before
     OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '066 rollback proof: triggers changed (% -> %) or B-54 moved', trg_before, trg_after;
  END IF;
  IF EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-77')
     OR EXISTS (SELECT 1 FROM monitoring.results WHERE check_id = 'B-77')
     OR EXISTS (SELECT 1 FROM monitoring.incidents WHERE state IN ('new', 'confirmed', 'recurred')
                 AND (check_id = 'B-77' OR incident_key IN ('MECH:check:B-77', 'MECH:stale:B-77'))) THEN
    RAISE EXCEPTION '066 rollback proof: B-77, its results or an open incident survived';
  END IF;
  RAISE NOTICE '066 ROLLBACK OK: both walks compare the whole group_id again (7/10 texts); triggers % -> %, B-54 = %; B-77 removed',
    trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN md5(pg_get_functiondef('public.rt_create_from_order()'::regprocedure)) = '3f3a01204f7f4a4b6546e965fc231ae3'
             AND md5(pg_get_functiondef('public.rt_link_split()'::regprocedure)) = '6189950c70b289fd5075afd17e28ecec'
             AND NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-77')
            THEN '066 ROLLED BACK' ELSE '066 STILL APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
