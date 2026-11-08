-- 106 - export groupage: every live member carries the group's ONE matched import (DRAFT, NOT EXECUTED).
-- WHY: owner decision 8/11 (docs/rt-sync-v6/PLAN.md, B2 "export groupage match"). The Weekly reads the match from
--   one member, so a group where only some members carry it can hide the import from the board (case #643 /
--   GRP-Gl7rxx4W, 8/11). Measured over all export groupages 8/11: 16 groups, 0 with two different imports.
-- WHAT: ONE group, measured 8/11 (read-only): GRP-iTOtMMoR = #442 (matched to import #505, legacy recR5tH3Mw2nLFX0n)
--   and #464 (no match). All three on round trip 225 (closed, truck 7, driver 116). Writes ONLY #464.matched_import_id.
--   GRP-Gl7rxx4W needs nothing any more: #643 is deleted and none of #645 / #664 / #666 carries a match (8/11).
-- PROOF inside the block: round trip 225 and every leg of #442 / #464 / #505 are EXACTLY as before (the legacy
--   triggers 013 / 037 / 097 fire on matched_import_id; same round trip = they must do nothing), and after the write
--   no export groupage is left partly matched.
-- RUN: dry run first (106_grp_match_converge_dryrun.sql), after 15:00, then this file, then the verify. ASCII only.
-- ROLLBACK: 106_grp_match_converge_rollback.sql (puts NULL back on #464 only if it still carries this value).
DO $m$
DECLARE
  g CONSTANT text := 'GRP-iTOtMMoR';
  member_id CONSTANT bigint := 464;
  with_id CONSTANT bigint := 442;
  imp_id CONSTANT bigint := 505;
  rt CONSTANT bigint := 225;
  imp_legacy text; o orders%rowtype; w orders%rowtype; before_legs jsonb; after_legs jsonb;
  before_rt jsonb; after_rt jsonb; partial int;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS: the state measured 8/11
  SELECT legacy_id INTO imp_legacy FROM orders WHERE id = imp_id AND deleted_at IS NULL AND direction = 'Import';
  SELECT * INTO o FROM orders WHERE id = member_id FOR UPDATE;
  SELECT * INTO w FROM orders WHERE id = with_id FOR UPDATE;
  IF imp_legacy IS NULL OR o.id IS NULL OR w.id IS NULL THEN
    RAISE EXCEPTION '106: import #% or member #% / #% is missing or deleted - re-measure', imp_id, member_id, with_id;
  END IF;
  IF o.deleted_at IS NOT NULL OR w.deleted_at IS NOT NULL OR o.direction <> 'Export' OR w.direction <> 'Export'
     OR split_part(nullif(o.group_id,''),'|',1) IS DISTINCT FROM g OR split_part(nullif(w.group_id,''),'|',1) IS DISTINCT FROM g THEN
    RAISE EXCEPTION '106: #% / #% are no longer live exports of % - re-measure', member_id, with_id, g;
  END IF;
  IF nullif(o.matched_import_id,'') IS NOT NULL OR w.matched_import_id IS DISTINCT FROM imp_legacy THEN
    RAISE EXCEPTION '106: #% already has a match, or #% is no longer matched to #% - re-measure', member_id, with_id, imp_id;
  END IF;
  IF (SELECT count(DISTINCT nullif(matched_import_id,'')) FROM orders
       WHERE deleted_at IS NULL AND split_part(nullif(group_id,''),'|',1) = g) <> 1 THEN
    RAISE EXCEPTION '106: % carries more than one import - a person must decide - stop', g;
  END IF;
  IF (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND split_part(nullif(group_id,''),'|',1) = g) <> 2 THEN
    RAISE EXCEPTION '106: % no longer has exactly 2 live members - re-measure', g;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id, 'dir', direction) ORDER BY order_id)
    INTO before_legs FROM ct_rt_legs WHERE order_id IN (member_id, with_id, imp_id);
  SELECT jsonb_build_object('status', status, 'truck', truck_id, 'driver', driver_id, 'start', date_start, 'end', date_end)
    INTO before_rt FROM ct_round_trips WHERE id = rt;
  IF before_legs IS DISTINCT FROM jsonb_build_array(
       jsonb_build_object('order', with_id, 'rt', rt, 'dir', 'EXPORT'),
       jsonb_build_object('order', member_id, 'rt', rt, 'dir', 'EXPORT'),
       jsonb_build_object('order', imp_id, 'rt', rt, 'dir', 'IMPORT')) THEN
    RAISE EXCEPTION '106: the three orders are no longer on round trip % alone - re-measure (%)', rt, before_legs;
  END IF;

  -- 1. THE WRITE: one column, one row
  UPDATE orders SET matched_import_id = imp_legacy WHERE id = member_id;
  PERFORM rt_sync_audit('update', 'orders', member_id::text,
    jsonb_build_object('matched_import_id', null),
    jsonb_build_object('matched_import_id', imp_legacy, 'reason', '106: export groupage carries one match on every member (owner 8/11)'));

  -- 2. PROOFS
  SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id, 'dir', direction) ORDER BY order_id)
    INTO after_legs FROM ct_rt_legs WHERE order_id IN (member_id, with_id, imp_id);
  SELECT jsonb_build_object('status', status, 'truck', truck_id, 'driver', driver_id, 'start', date_start, 'end', date_end)
    INTO after_rt FROM ct_round_trips WHERE id = rt;
  IF after_legs IS DISTINCT FROM before_legs OR after_rt IS DISTINCT FROM before_rt THEN
    RAISE EXCEPTION '106: a legacy trigger changed round trip % (legs % -> %, rt % -> %) - nothing kept', rt, before_legs, after_legs, before_rt, after_rt;
  END IF;
  SELECT count(*) INTO partial FROM (
    SELECT split_part(nullif(group_id,''),'|',1) gid FROM orders
     WHERE deleted_at IS NULL AND coalesce(status,'') <> 'Cancelled' AND direction = 'Export'
       AND split_part(nullif(group_id,''),'|',1) LIKE 'GRP-%'
     GROUP BY 1
    HAVING count(nullif(matched_import_id,'')) > 0
       AND (count(nullif(matched_import_id,'')) < count(*) OR count(DISTINCT nullif(matched_import_id,'')) > 1)) q;
  IF partial <> 0 THEN
    RAISE EXCEPTION '106: % export groupage(s) still partly matched - nothing kept', partial;
  END IF;
  RAISE NOTICE '106 OK: #% matched to #% (%), round trip % unchanged, partly matched groups 0', member_id, imp_id, imp_legacy, rt;
END
$m$;
