-- ROLLBACK 106 - puts NULL back on #464.matched_import_id (its measured value 8/11), ONLY if nobody wrote that
-- order after 106. ASCII only. Dry run first: 106_grp_match_converge_rollback_dryrun.sql (generated).
-- Guard: the value is still the one 106 wrote AND audit_log has no row for orders/464 newer than 106's own row, so a
--   later deliberate re-match by a dispatcher is never undone. Proof: the same round-trip snapshot as the source.
-- EXPECTED: NOTICE 106 rolled back. Then 106_grp_match_converge_verify.sql: "106 NOT APPLIED".
DO $r$
DECLARE before_snap jsonb; after_snap jsonb; mig_at timestamptz;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT matched_import_id FROM orders WHERE id = 464 FOR UPDATE) IS DISTINCT FROM 'recR5tH3Mw2nLFX0n' THEN
    RAISE EXCEPTION '106 rollback: #464 no longer carries the value 106 wrote - stop';
  END IF;
  SELECT max(created_at) INTO mig_at FROM audit_log
   WHERE actor = 'migration:106' AND table_name = 'orders' AND record_id = '464';
  IF mig_at IS NULL THEN
    RAISE EXCEPTION '106 rollback: no audit row of 106 for #464 - 106 never ran here - stop';
  END IF;
  -- users' writes are audited under the legacy id (rec...), triggers' and migrations' under the numeric id: check both
  IF EXISTS (SELECT 1 FROM audit_log WHERE table_name = 'orders' AND created_at > mig_at
              AND record_id IN ('464', (SELECT legacy_id FROM orders WHERE id = 464))) THEN
    RAISE EXCEPTION '106 rollback: #464 was written after 106 (audit_log) - a person decides - stop';
  END IF;
  SELECT jsonb_build_object(
    'rt', (SELECT jsonb_build_object('status', status, 'truck', truck_id, 'trailer', trailer_id, 'driver', driver_id,
                                     'start', date_start, 'end', date_end) FROM ct_round_trips WHERE id = 225),
    'legs', (SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id) ORDER BY order_id, rt_id)
               FROM ct_rt_legs WHERE rt_id = 225 OR order_id IN (442, 464, 505)),
    'cost_lines', (SELECT jsonb_build_object('n', count(*), 'sum', coalesce(sum(net), 0)) FROM ct_cost_lines WHERE rt_id = 225),
    'payroll', (SELECT jsonb_agg(jsonb_build_object('id', id, 'driver', driver_id, 'deleted', deleted_at IS NOT NULL) ORDER BY id)
                  FROM dl_entries WHERE rt_id = 225))
    INTO before_snap;
  UPDATE orders SET matched_import_id = NULL WHERE id = 464;
  INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  VALUES ('migration:106-rollback', 'system', 'update', 'orders', '464',
          jsonb_build_object('matched_import_id', 'recR5tH3Mw2nLFX0n'),
          jsonb_build_object('matched_import_id', null, 'reason', '106 rollback'), now());
  SELECT jsonb_build_object(
    'rt', (SELECT jsonb_build_object('status', status, 'truck', truck_id, 'trailer', trailer_id, 'driver', driver_id,
                                     'start', date_start, 'end', date_end) FROM ct_round_trips WHERE id = 225),
    'legs', (SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id) ORDER BY order_id, rt_id)
               FROM ct_rt_legs WHERE rt_id = 225 OR order_id IN (442, 464, 505)),
    'cost_lines', (SELECT jsonb_build_object('n', count(*), 'sum', coalesce(sum(net), 0)) FROM ct_cost_lines WHERE rt_id = 225),
    'payroll', (SELECT jsonb_agg(jsonb_build_object('id', id, 'driver', driver_id, 'deleted', deleted_at IS NOT NULL) ORDER BY id)
                  FROM dl_entries WHERE rt_id = 225))
    INTO after_snap;
  IF after_snap IS DISTINCT FROM before_snap THEN
    RAISE EXCEPTION '106 rollback: a legacy trigger changed round trip 225 (% -> %) - nothing kept', before_snap, after_snap;
  END IF;
  RAISE NOTICE '106 rolled back: #464 matched_import_id NULL again, round trip 225 unchanged';
END
$r$;
