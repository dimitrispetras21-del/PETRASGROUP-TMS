-- ROLLBACK 106 - puts NULL back on #464.matched_import_id, ONLY if it still carries the value 106 wrote. ASCII only.
-- The proof is the same as the source's: round trip 225 and the legs of #442 / #464 / #505 must not move.
-- EXPECTED: NOTICE 106 rolled back. Then run 106_grp_match_converge_verify.sql: "106 NOT APPLIED".
DO $r$
DECLARE before_legs jsonb; after_legs jsonb; before_rt jsonb; after_rt jsonb;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT matched_import_id FROM orders WHERE id = 464 FOR UPDATE) IS DISTINCT FROM 'recR5tH3Mw2nLFX0n' THEN
    RAISE EXCEPTION '106 rollback: #464 no longer carries the value 106 wrote - a person changed it since - stop';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id) ORDER BY order_id) INTO before_legs
    FROM ct_rt_legs WHERE order_id IN (442, 464, 505);
  SELECT jsonb_build_object('status', status, 'truck', truck_id, 'start', date_start, 'end', date_end) INTO before_rt
    FROM ct_round_trips WHERE id = 225;
  UPDATE orders SET matched_import_id = NULL WHERE id = 464;
  PERFORM rt_sync_audit('update', 'orders', '464', jsonb_build_object('matched_import_id', 'recR5tH3Mw2nLFX0n'),
    jsonb_build_object('matched_import_id', null, 'reason', '106 rollback'));
  SELECT jsonb_agg(jsonb_build_object('order', order_id, 'rt', rt_id) ORDER BY order_id) INTO after_legs
    FROM ct_rt_legs WHERE order_id IN (442, 464, 505);
  SELECT jsonb_build_object('status', status, 'truck', truck_id, 'start', date_start, 'end', date_end) INTO after_rt
    FROM ct_round_trips WHERE id = 225;
  IF after_legs IS DISTINCT FROM before_legs OR after_rt IS DISTINCT FROM before_rt THEN
    RAISE EXCEPTION '106 rollback: a legacy trigger changed round trip 225 - nothing kept';
  END IF;
  RAISE NOTICE '106 rolled back';
END
$r$;
