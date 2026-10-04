-- 060 VERIFY - read-only proofs (SELECT only, no writes). ASCII only.
-- V1 right after 060: one row, every column must be true (or the number shown in the comment).
-- V2..V5 after the FIRST REAL relay (and whenever in doubt): run each statement on its own
-- (select it, Run) - the SQL editor shows only the last result of a multi-statement run.

-- V1 - the migration is in place, closed, and nothing else moved
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
     AND ((table_name = 'local_moves' AND column_name = 'move_kind' AND is_nullable = 'NO' AND column_default = '''local''::text')
       OR (table_name = 'dl_entries' AND column_name = 'local_move_id' AND data_type = 'bigint')
       OR (table_name = 'drivers' AND column_name = 'pay_basis' AND data_type = 'text'))) = 3 AS columns_ok,
  (SELECT count(*) FROM pg_constraint WHERE conname IN ('local_moves_kind_chk', 'local_moves_kind_parent', 'local_moves_relay_points',
     'local_moves_relay_status', 'local_moves_relay_executor', 'local_moves_relay_trailer', 'dl_one_origin', 'dl_lm_is_trip',
     'drivers_pay_basis_chk')) = 9 AS checks_ok,
  (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname IN ('local_moves_relay_once', 'dl_local_day_live') AND i.indisunique AND i.indisvalid) = 2 AS unique_ok,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
    AND tgname IN ('local_moves_before', 'dl_sync_from_local_move', 'local_moves_follow_order', 'dl_local_pay_basis_sync',
                   'dl_local_line_guard')) = 5 AS triggers_ok,
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('local_moves_before', 'local_moves_follow_order', 'dl_local_day_sync', 'dl_sync_from_local_move', 'dl_local_pay_basis_sync',
                      'dl_local_line_guard')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')) = 6 AS functions_closed,
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure) AS day_sync_secdef,
  position('update local_moves lm set deleted_at' IN pg_get_functiondef('public.order_soft_delete_unlink()'::regprocedure)) > 0
    AND position('partner_assignments' IN pg_get_functiondef('public.order_soft_delete_unlink()'::regprocedure)) > 0 AS unlink_step6_ok,
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.dl_v_entries'::regclass AND attnum > 30
     AND NOT attisdropped) = 'local_move_id,relay_info' AS view_appended_ok,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.dl_v_entries'::regclass) AS view_acl,  -- {postgres=arwdDxtm/postgres,service_role=arwDxtm/postgres}
  NOT has_table_privilege('anon', 'public.local_moves', 'SELECT') AS anon_closed,
  (SELECT count(*) FROM monitoring.checks WHERE id IN ('B-63', 'B-64', 'B-65') AND enabled) = 3 AS new_checks_ok,
  (SELECT sql_text LIKE '%d.local_move_id IS NULL%' AND ids_sql LIKE '%d.local_move_id IS NULL%' FROM monitoring.checks WHERE id = 'B-09') AS b09_ok,
  (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') =
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS b54_green,          -- 32 after 060 alone (36 with 057)
  (SELECT count(*) FROM local_moves WHERE move_kind <> 'local') AS relays,
  (SELECT count(*) FROM local_moves WHERE move_kind = 'local') AS plain_local_moves,
  (SELECT count(*) FROM dl_entries WHERE local_move_id IS NOT NULL AND deleted_at IS NULL) AS local_lines_live,
  (SELECT count(*) FROM dl_entries WHERE deleted_at IS NULL) AS dl_entries_live,       -- 060 itself writes no line
  (SELECT count(*) FROM drivers WHERE pay_basis IS NOT NULL) AS drivers_classified;

-- V2 - every (local driver, day) of a per-trip/unknown driver has ONE live line naming its relays;
--      a salaried driver has none (OWNER-Q2 answered 4/10) - except a past line kept for review
--      after a pay basis change (needs_review). Empty until the first relay.
SELECT lm.driver_id, d.full_name, d.pay_basis, lm.move_date, count(*) AS relays,
       array_agg(lm.id ORDER BY lm.id) AS relay_ids, array_agg(lm.parent_order_id ORDER BY lm.id) AS orders,
       e.id AS line_id, e.local_move_id AS anchor, e.route, e.trip_value IS NOT NULL AS has_value, e.needs_review
  FROM local_moves lm
  JOIN drivers d ON d.id = lm.driver_id
  LEFT JOIN dl_entries e ON e.local_move_id IS NOT NULL AND e.deleted_at IS NULL
                        AND e.driver_id = lm.driver_id AND e.entry_date = lm.move_date
 WHERE lm.move_kind <> 'local' AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled'
 GROUP BY lm.driver_id, d.full_name, d.pay_basis, lm.move_date, e.id, e.local_move_id, e.route, e.trip_value, e.needs_review
 ORDER BY lm.move_date DESC, lm.driver_id LIMIT 50;

-- V3 - the international is untouched by its relay: order driver = RT driver = RT payroll driver,
--      none of them the local driver; relay day = the order's customer day.
SELECT o.id AS order_id, o.direction, o.status, lm.move_kind, lm.move_date,
       CASE WHEN lm.move_kind = 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END AS order_day,
       o.driver_id AS order_driver, r.code AS rt, r.driver_id AS rt_driver, e.driver_id AS rt_line_driver,
       lm.driver_id AS local_driver, lm.truck_id AS local_other_truck, o.truck_id AS order_truck,
       lm.trailer_id AS local_trailer, o.trailer_id AS order_trailer
  FROM local_moves lm
  JOIN orders o ON o.id = lm.parent_order_id
  LEFT JOIN ct_rt_legs l ON l.order_id = o.id
  LEFT JOIN ct_round_trips r ON r.id = l.rt_id AND r.status <> 'cancelled'
  LEFT JOIN dl_entries e ON e.rt_id = r.id AND e.deleted_at IS NULL
 WHERE lm.move_kind <> 'local' AND lm.deleted_at IS NULL
 ORDER BY lm.move_date DESC LIMIT 50;

-- V4 - CLAUDE.md "written / total" pattern for the new columns (a 0 where the screen writes = silent loss)
SELECT count(*) FILTER (WHERE move_kind <> 'local') AS relays,
       count(*) FILTER (WHERE move_kind <> 'local' AND driver_id IS NOT NULL) AS relays_with_driver,
       count(*) FILTER (WHERE move_kind <> 'local' AND trailer_id IS NOT NULL) AS relays_with_trailer,
       count(*) FILTER (WHERE move_kind <> 'local' AND truck_id IS NOT NULL) AS relays_other_tractor,
       count(*) FILTER (WHERE move_kind <> 'local' AND time_from IS NOT NULL) AS relays_with_time,
       count(*) FILTER (WHERE move_kind = 'local') AS plain_local,
       count(*) AS total,
       (SELECT count(*) FILTER (WHERE pay_basis IS NOT NULL) FROM drivers WHERE deleted_at IS NULL) AS drivers_with_pay_basis,
       (SELECT count(*) FROM drivers WHERE deleted_at IS NULL) AS drivers_total
  FROM local_moves WHERE deleted_at IS NULL;

-- V5 - the auditor on the new world (B-09 must never list a local line)
SELECT (SELECT count(*) FROM dl_entries d WHERE d.entry_type = 'trip' AND d.source = 'auto' AND d.deleted_at IS NULL
          AND d.local_move_id IS NULL AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id = d.rt_id AND r.status = 'cancelled'))) AS b09,
       (SELECT count(*) FROM dl_entries WHERE needs_review AND deleted_at IS NULL) AS b08,
       (SELECT count(*) FROM local_moves lm JOIN orders o ON o.id = lm.parent_order_id
         WHERE lm.move_kind <> 'local' AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled' AND lm.driver_id IS NULL
           AND lm.move_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1
           AND NOT (coalesce(o.status, '') = 'Delivered' OR (lm.move_kind = 'relay_loading' AND coalesce(o.status, '') = 'In Transit'))) AS b63_no_driver,
       (SELECT count(*) FROM drivers d WHERE d.pay_basis IS NULL
           AND EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id = d.id AND lm.move_kind <> 'local'
                        AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled')) AS b64_paybasis_part,
       (SELECT count(*) FROM local_moves WHERE created_at > now() - interval '30 days') AS b47_usage;
