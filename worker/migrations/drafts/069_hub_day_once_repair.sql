-- 069 REPAIR - the 7 "double moved" cross-docks take the Veroia day their national load, its Veroia stop
-- and their own Cross-dock stop ALREADY show.
--
-- DRAFT - NOT EXECUTED. Approved with 069 (question E1, 11/10 night). The owner runs it AFTER
-- 069_hub_day_once.sql (and its verify), the SAME evening, after 15:00, BEFORE the push of the WP-A front:
--   069_hub_day_once_repair_dryrun.sql -> this file -> 069_hub_day_once_repair_verify.sql -> 069_hub_day_once_verify.sql
-- WHY AFTER 069 (first the why, then the repair): before 069 the next save of the old form would move
--   them twice again. WHY BEFORE THE FRONT: the new sync no longer ignores a cross-dock on/after the
--   delivery - without this repair it would move nl 131 / 134 (open) on their next save.
-- WHAT (nothing else): orders.cross_dock_date := the day the three others agree on, for the live VS orders
--   whose cross-dock is the ONLY one off (cross-dock <> national load's Veroia day = its Veroia stop = the
--   order's Cross-dock stop). Measured 11/10-12/10: exactly 7 - orders 318, 341, 388, 409, 418 (Delivered)
--   and 460, 467 (In Transit, national load Pending); nl 90, 106, 116, 118, 120, 131, 134.
--   NO visible change on the Weekly National or the Ramp (the load, its stops and the Ramp already show that
--   day). On the Weekly International the "Veroia" of the 7 is corrected, and the false "arrives 14/10,
--   delivery 12/10" of nl 131 goes away.
--   order_cd_stop_follow (069) fires on each write and finds its stop already on that day: it writes
--   nothing (proven below: no stop, load or Ramp audit row from this block).
-- GUARDS: 069 in place; the candidates must be a SUBSET of the 7 measured (a new one = a new event after
--   069: stop, the coordinator looks first); each write is conditional on the old value (a dispatcher's
--   change in between is never overwritten).
-- TRACE: one audit_log row per order (actor migration:069_hub_day_once_repair) with the old and the new
--   day - 069_hub_day_once_repair_rollback.sql restores from exactly those rows.
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "069 REPAIR OK: 7 cross-dock(s) ..." and ONE row "069 REPAIR DONE | 7 | 0".
--   Fewer than 7 is fine when some were corrected by hand meanwhile (the list says which).

DO $do$
DECLARE
  measured CONSTANT bigint[] := ARRAY[318, 341, 388, 409, 418, 460, 467]::bigint[];
  r record; n int := 0; k int; aud_max bigint; extra text; moved text := ''; loads_before text; loads_after text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS
  IF to_regprocedure('public.order_cd_stop_follow()') IS NULL OR to_regprocedure('public.ramp_follows_stop()') IS NULL
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) <> '4b5d279f21f981a11d35a5deb655269a' THEN
    RAISE EXCEPTION '069 repair: 069 is not in place - run 069_hub_day_once.sql first (the repair comes after the why)';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair') THEN
    RAISE EXCEPTION '069 repair: already run (audit rows exist) - run 069_hub_day_once_repair_verify.sql instead';
  END IF;

  -- The candidates: the cross-dock is the ONLY one of the four off.
  SELECT string_agg(c.oid::text, ',' ORDER BY c.oid) INTO extra FROM (
    SELECT o.id AS oid
      FROM orders o JOIN national_loads nl ON nl.source_order_id = o.id AND nl.deleted_at IS NULL AND nl.source_type = 'Direct'
     WHERE o.deleted_at IS NULL AND o.veroia_switch
       AND o.cross_dock_date IS DISTINCT FROM CASE WHEN o.direction = 'Export' THEN (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date
                                                     ELSE (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date END
       AND NOT (o.id = ANY (measured))) c;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION '069 repair: orders % have a cross-dock off their national load and are NOT among the 7 measured - stop, the coordinator looks first', extra;
  END IF;
  SELECT coalesce(max(id), 0) INTO aud_max FROM audit_log;
  SELECT string_agg(nl.id || ':' || nl.loading_datetime || '/' || nl.delivery_datetime, ',' ORDER BY nl.id) INTO loads_before
    FROM national_loads nl WHERE nl.source_order_id = ANY (measured) AND nl.deleted_at IS NULL;

  -- 1. The repair, one order at a time, each conditional on the value just read.
  FOR r IN
    SELECT o.id AS oid, o.cross_dock_date AS old_cd, h.load_hub AS new_cd, nl.id AS nlid
      FROM orders o JOIN national_loads nl ON nl.source_order_id = o.id AND nl.deleted_at IS NULL AND nl.source_type = 'Direct'
      CROSS JOIN LATERAL (SELECT CASE WHEN o.direction = 'Export' THEN (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date
                                      ELSE (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date END AS load_hub) h
     WHERE o.id = ANY (measured) AND o.deleted_at IS NULL AND o.veroia_switch
       AND o.cross_dock_date IS DISTINCT FROM h.load_hub
       -- the national load's Veroia stop says the same day
       AND h.load_hub = (SELECT min(s.datetime) FROM order_stops s JOIN locations l ON l.id = s.location_id
                          WHERE s.national_load_id = nl.id AND s.deleted_at IS NULL AND l.legacy_id = 'recJucKOhC1zh4IP3'
                            AND s.stop_type = CASE WHEN o.direction = 'Export' THEN 'Unloading' ELSE 'Loading' END)
       -- and so does the order's own Cross-dock stop
       AND h.load_hub = (SELECT min(s.datetime) FROM order_stops s WHERE s.order_id = o.id AND s.stop_type = 'Cross-dock' AND s.deleted_at IS NULL)
     ORDER BY o.id
  LOOP
    UPDATE orders SET cross_dock_date = r.new_cd WHERE id = r.oid AND cross_dock_date IS NOT DISTINCT FROM r.old_cd;
    GET DIAGNOSTICS k = ROW_COUNT;
    IF k <> 1 THEN RAISE EXCEPTION '069 repair: order % changed while the repair ran - nothing kept, run again', r.oid; END IF;
    INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    VALUES ('migration:069_hub_day_once_repair', 'system', 'update', 'orders', r.oid::text,
            jsonb_build_object('cross_dock_date', r.old_cd),
            jsonb_build_object('cross_dock_date', r.new_cd, 'national_load_id', r.nlid,
              'reason', '069: the cross-dock takes the Veroia day its national load, its Veroia stop and its Cross-dock stop already show (double move)'), now());
    n := n + 1;
    moved := moved || format(' %s:%s->%s', r.oid, r.old_cd, r.new_cd);
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION '069 repair: nothing to repair (already corrected?) - run 069_hub_day_once_verify.sql'; END IF;

  -- 2. PROOF: no visible change - no stop, load or Ramp line moved by this block.
  SELECT count(*) INTO k FROM audit_log WHERE id > aud_max AND actor IN ('trigger:order_cd_stop_follow', 'trigger:ramp_follows_stop', 'trigger:order_dates_follow');
  IF k <> 0 THEN RAISE EXCEPTION '069 repair proof: % stop/Ramp/date audit rows - something else moved, nothing kept', k; END IF;
  SELECT string_agg(nl.id || ':' || nl.loading_datetime || '/' || nl.delivery_datetime, ',' ORDER BY nl.id) INTO loads_after
    FROM national_loads nl WHERE nl.source_order_id = ANY (measured) AND nl.deleted_at IS NULL;
  IF loads_after IS DISTINCT FROM loads_before THEN RAISE EXCEPTION '069 repair proof: a national load moved - nothing kept'; END IF;

  RAISE NOTICE '069 REPAIR OK: % cross-dock(s) now = their national load (order:old->new):%', n, moved;
END $do$;

SELECT CASE WHEN EXISTS (SELECT 1 FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair') THEN '069 REPAIR DONE' ELSE '069 REPAIR NOT RUN' END AS result,
       (SELECT count(*) FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair') AS repaired,
       (SELECT count(*) FROM orders o JOIN national_loads nl ON nl.source_order_id = o.id AND nl.deleted_at IS NULL AND nl.source_type = 'Direct'
         WHERE o.deleted_at IS NULL AND o.veroia_switch
           AND o.cross_dock_date IS DISTINCT FROM CASE WHEN o.direction = 'Export' THEN (nl.delivery_datetime AT TIME ZONE 'Europe/Athens')::date
                                                        ELSE (nl.loading_datetime AT TIME ZONE 'Europe/Athens')::date END) AS still_off;
