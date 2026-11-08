-- 106 - export groupage: every live member carries the group's ONE matched import (DRAFT, NOT EXECUTED).
-- WHY: owner decision 8/11 (docs/rt-sync-v6/PLAN.md, B2 "export groupage match"). The Weekly reads the match from
--   one member, so a group where only some members carry it can hide the import from the board (case #643 /
--   GRP-Gl7rxx4W, 8/11). Measured over all export groupages 8/11: 16 groups, 0 with two different imports.
-- WHAT: ONE group, measured 8/11 (read-only): GRP-iTOtMMoR = #442 (matched to import #505, legacy recR5tH3Mw2nLFX0n)
--   and #464 (matched_import_id NULL). All three on round trip 225 (closed, truck 7, trailer 11, driver 116, 3 legs).
--   Writes ONLY #464.matched_import_id. GRP-Gl7rxx4W needs nothing any more: #643 is deleted and none of #645 /
--   #664 / #666 carries a match (8/11).
-- PROOF inside the block: two legacy triggers fire on this column, rt_create_from_order (033, no WHEN: returns for an
--   order that already has a live leg) and rt_link_split (037: merges only when export and import sit on two round
--   trips). Same round trip here, so both must do nothing: round trip 225, its legs, its cost lines and its payroll
--   lines are compared before / after, and after the write no export groupage is left partly matched.
-- RUN: dry run first (106_grp_match_converge_dryrun.sql), after 15:00, then this file, then the verify. ASCII only.
-- ROLLBACK: 106_grp_match_converge_rollback.sql (dry run first: 106_grp_match_converge_rollback_dryrun.sql).
-- TEST: node --test tests/sql-106-drafts.test.js (build time; the dry runs must have 0 drift from their sources).
DO $m$
DECLARE
  g CONSTANT text := 'GRP-iTOtMMoR';
  member_id CONSTANT bigint := 464;
  with_id CONSTANT bigint := 442;
  imp_id CONSTANT bigint := 505;
  rt CONSTANT bigint := 225;
  imp_legacy text; o orders%rowtype; w orders%rowtype; before_snap jsonb; after_snap jsonb; partial int;
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
  -- strictly NULL (measured 8/11): the audit before-image and the rollback both write NULL back
  IF o.matched_import_id IS NOT NULL OR w.matched_import_id IS DISTINCT FROM imp_legacy THEN
    RAISE EXCEPTION '106: #% is no longer NULL, or #% is no longer matched to #% - re-measure', member_id, with_id, imp_id;
  END IF;
  IF (SELECT count(DISTINCT nullif(matched_import_id,'')) FROM orders
       WHERE deleted_at IS NULL AND split_part(nullif(group_id,''),'|',1) = g) <> 1 THEN
    RAISE EXCEPTION '106: % carries more than one import - a person must decide - stop', g;
  END IF;
  IF (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND split_part(nullif(group_id,''),'|',1) = g) <> 2 THEN
    RAISE EXCEPTION '106: % no longer has exactly 2 live members - re-measure', g;
  END IF;

  -- the whole round trip: row, every leg on it, the legs of the three orders anywhere, money on it
  SELECT jsonb_build_object(
    'rt', (SELECT jsonb_build_object('status', status, 'truck', truck_id, 'trailer', trailer_id, 'driver', driver_id,
                                     'start', date_start, 'end', date_end) FROM ct_round_trips WHERE id = rt),
    'legs_on_rt', (SELECT jsonb_agg(jsonb_build_object('order', order_id, 'nat', nat_load_id, 'dir', direction) ORDER BY order_id, nat_load_id)
                     FROM ct_rt_legs WHERE rt_id = rt),
    'legs_of_orders', (SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id) ORDER BY order_id, rt_id)
                         FROM ct_rt_legs WHERE order_id IN (member_id, with_id, imp_id)),
    'cost_lines', (SELECT jsonb_build_object('n', count(*), 'sum', coalesce(sum(net), 0)) FROM ct_cost_lines WHERE rt_id = rt),
    'payroll', (SELECT jsonb_agg(jsonb_build_object('id', id, 'driver', driver_id, 'deleted', deleted_at IS NOT NULL) ORDER BY id)
                  FROM dl_entries WHERE rt_id = rt))
    INTO before_snap;
  IF before_snap->'legs_on_rt' IS DISTINCT FROM jsonb_build_array(
       jsonb_build_object('order', with_id, 'nat', null, 'dir', 'EXPORT'),
       jsonb_build_object('order', member_id, 'nat', null, 'dir', 'EXPORT'),
       jsonb_build_object('order', imp_id, 'nat', null, 'dir', 'IMPORT'))
     OR before_snap->'legs_of_orders' IS DISTINCT FROM jsonb_build_array(
       jsonb_build_object('order', with_id, 'rt', rt),
       jsonb_build_object('order', member_id, 'rt', rt),
       jsonb_build_object('order', imp_id, 'rt', rt)) THEN
    RAISE EXCEPTION '106: round trip % no longer holds exactly these three orders - re-measure (%)', rt, before_snap;
  END IF;

  -- 1. THE WRITE: one column, one row; audited as this migration, never as a trigger (026 convention)
  UPDATE orders SET matched_import_id = imp_legacy WHERE id = member_id;
  INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  VALUES ('migration:106', 'system', 'update', 'orders', member_id::text,
          jsonb_build_object('matched_import_id', o.matched_import_id),
          jsonb_build_object('matched_import_id', imp_legacy, 'reason', '106: export groupage carries one match on every member (owner 8/11)'),
          now());

  -- 2. PROOFS
  SELECT jsonb_build_object(
    'rt', (SELECT jsonb_build_object('status', status, 'truck', truck_id, 'trailer', trailer_id, 'driver', driver_id,
                                     'start', date_start, 'end', date_end) FROM ct_round_trips WHERE id = rt),
    'legs_on_rt', (SELECT jsonb_agg(jsonb_build_object('order', order_id, 'nat', nat_load_id, 'dir', direction) ORDER BY order_id, nat_load_id)
                     FROM ct_rt_legs WHERE rt_id = rt),
    'legs_of_orders', (SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id) ORDER BY order_id, rt_id)
                         FROM ct_rt_legs WHERE order_id IN (member_id, with_id, imp_id)),
    'cost_lines', (SELECT jsonb_build_object('n', count(*), 'sum', coalesce(sum(net), 0)) FROM ct_cost_lines WHERE rt_id = rt),
    'payroll', (SELECT jsonb_agg(jsonb_build_object('id', id, 'driver', driver_id, 'deleted', deleted_at IS NOT NULL) ORDER BY id)
                  FROM dl_entries WHERE rt_id = rt))
    INTO after_snap;
  IF after_snap IS DISTINCT FROM before_snap THEN
    RAISE EXCEPTION '106: a legacy trigger changed round trip % (% -> %) - nothing kept', rt, before_snap, after_snap;
  END IF;
  -- PARTLY-MATCHED-GROUPS (the same text in the verify; tests/sql-106-drafts.test.js compares them)
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
