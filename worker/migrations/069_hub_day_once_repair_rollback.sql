-- 069 REPAIR ROLLBACK - puts back the cross-dock of each order 069_hub_day_once_repair.sql changed, from its
-- own audit rows (actor migration:069_hub_day_once_repair, before_data.cross_dock_date).
--
-- DRAFT - NOT EXECUTED, and normally never needed (plan section 7.3: the repair fixes wrong data). Only on
-- an explicit request, after 15:00, with an explicit yes.
-- ORDER: run it AFTER 069_hub_day_once_rollback.sql for a byte-exact restore. With 069 still in place,
-- order_cd_stop_follow does what 069 is for: the order's Cross-dock stop (and its Ramp line) follow the
-- restored cross-dock - the national load does not (it is written by the front's sync), so the Weekly
-- National would show those rows as "not followed" again.
-- An order whose cross-dock changed after the repair (a dispatcher's later change) is LEFT as it is and
-- named in the NOTICE - a rollback never overwrites newer work.
-- ASCII only. ONE DO block = ONE statement.
-- EXPECTED: NOTICE "069 REPAIR ROLLBACK OK: 7 restored, 0 left" and ONE row "069 REPAIR ROLLED BACK | 7".
DO $do$
DECLARE
  r record; n int := 0; k int; left_ text := '';
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair') THEN
    RAISE EXCEPTION '069 repair rollback: the repair never ran (no audit rows) - nothing to undo';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair_rollback') THEN
    RAISE EXCEPTION '069 repair rollback: already run';
  END IF;
  FOR r IN SELECT record_id::bigint AS oid, (before_data->>'cross_dock_date')::date AS old_cd, (after_data->>'cross_dock_date')::date AS new_cd
             FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair' ORDER BY id LOOP
    UPDATE orders SET cross_dock_date = r.old_cd WHERE id = r.oid AND cross_dock_date IS NOT DISTINCT FROM r.new_cd;
    GET DIAGNOSTICS k = ROW_COUNT;
    IF k = 1 THEN
      n := n + 1;
      INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      VALUES ('migration:069_hub_day_once_repair_rollback', 'system', 'update', 'orders', r.oid::text,
              jsonb_build_object('cross_dock_date', r.new_cd), jsonb_build_object('cross_dock_date', r.old_cd, 'reason', 'rollback of 069_hub_day_once_repair'), now());
    ELSE
      left_ := left_ || ' ' || r.oid;
    END IF;
  END LOOP;
  RAISE NOTICE '069 REPAIR ROLLBACK OK: % restored, left as they are (changed since the repair):%', n, CASE WHEN left_ = '' THEN ' none' ELSE left_ END;
END $do$;

SELECT CASE WHEN EXISTS (SELECT 1 FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair_rollback') THEN '069 REPAIR ROLLED BACK' ELSE '069 REPAIR IN PLACE' END AS result,
       (SELECT count(*) FROM audit_log WHERE actor = 'migration:069_hub_day_once_repair_rollback') AS restored;
