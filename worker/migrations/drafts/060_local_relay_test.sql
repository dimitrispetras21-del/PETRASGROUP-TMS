-- DRY RUN 060 (local relay, phase 1): every rule of 060 exercised on REAL live orders, then undone.
-- ONE statement. It ends with a deliberate RAISE EXCEPTION, so Postgres undoes ALL of it - no
-- relay, no payroll line, no audit row, no order/RT change stays behind. The red error message
-- IS the result:  "DRY RUN 060 finished - EVERYTHING UNDONE ... Result: N OK, 0 FAIL || ...".
-- Only trace: identity/sequence numbers (local_moves ids, RT codes) are skipped.
--
-- DRAFT - run ONLY after 060 said "060 OK", after 15:00, with an explicit yes (it attempts writes).
-- ASCII only (clipboard-safe). Orders and drivers are PICKED BY QUERY inside the block, never
-- hard-coded: T1/T2/T3 = live own-fleet imports with an RT (not VS, not pre-order, not split, not
-- legs), E1 = a live own-fleet export, D1/D2/D3 = active drivers who drive none of them, LG = a
-- leg of a live split order. Pre-order / VS / cancelled / split refusals and the split-delete
-- scenario use a live example when one exists, otherwise they are reported as "skipped" (never
-- as OK). Order days are moved inside the block where a scenario needs a past or future day.
-- Each scenario runs in its own sub-block (BEGIN ... EXCEPTION WHEN others): an unexpected error
-- is recorded as FAIL with its message and undoes only that scenario.
--
-- NOT testable here: two sessions saving at the same moment (the advisory lock in
-- dl_local_day_sync). One DO block is one session; PGlite (the local copy) is single-connection
-- too. What IS proven: the lock call runs on every path (every sync below goes through it) and the
-- UNIQUE dl_local_day_live refuses a second live line (scenario S12b) - so a lost race can only
-- end in a loud 23505, never in a double payment.
DO $dry$
DECLARE
  t1 bigint; t2 bigint; t3 bigint; e1 bigint; pre bigint; vs bigint; gone bigint; sp bigint; nl bigint;
  t1_drv bigint; e1_drv bigint; d1 bigint; d2 bigint; d3 bigint; loc bigint; loc2 bigint; trl bigint; prt bigint;
  x date; t3_day date; e_day date; f_day date; p_day date; pre_kind text; vs_ok boolean; gone_kind text; sp_kind text; any_rt bigint;
  lg bigint; lg_kind text; lg_drv bigint; lg_parent bigint; lg_by bigint;
  rl1 bigint; rl2 bigint; rle bigint; rl3 bigint; rle2 bigint; rl4 bigint; rlg bigint; lmp bigint; lmq bigint; lid bigint;
  lm local_moves%rowtype; e dl_entries%rowtype;
  n bigint; n2 bigint; s text; j jsonb; b09_before numeric; b09_ids text[]; v numeric; ids text[];
  fp_before text; fp_after text;
  st text; hint text; cn text; got text; t record;
  ok int := 0; bad int := 0; res text[] := '{}';
  sep text := ' ' || chr(183) || ' ';
  w_local text := convert_from(decode('zqTOn86gzpnOms6f', 'base64'), 'UTF8');          -- TOPIKO
  w_deliv text := convert_from(decode('z4DOsc+BzqzOtM6/z4POtw==', 'base64'), 'UTF8');  -- paradosi
  w_load  text := convert_from(decode('z4bPjM+Bz4TPic+Dzrc=', 'base64'), 'UTF8');      -- fortosi
  t_gone  text := convert_from(decode('zqTOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzrrOsc68zq/OsSDOts+Jzr3PhM6xzr3OriDOus6vzr3Ot8+Dzrcgz4TOt8+CIM63zrzOrc+BzrHPgg==', 'base64'), 'UTF8');
  t_salary text := convert_from(decode('zqTOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzr8gzr/OtM63zrPPjM+CIM61zq/Ovc6xzrkgzrzOuc+DzrjPic+Ez4zPgiAozrzPjM69zr8gzrnPg8+Ezr/Pgc65zrrPjCk=', 'base64'), 'UTF8');
  r_gone  text := convert_from(decode('z4TOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzrrOsc68zq/OsSDOts+Jzr3PhM6xzr3OriDPgM65zrE=', 'base64'), 'UTF8');
  r_salary text := convert_from(decode('zr8gzr/OtM63zrPPjM+CIM6tzrPOuc69zrUgzrzOuc+DzrjPic+Ez4zPgiAozrzPjM69zr8gzrnPg8+Ezr/Pgc65zrrPjCk=', 'base64'), 'UTF8');
  r_changed text := convert_from(decode('zqzOu867zrHOvs6xzr0gzr/OuSDPhM6/z4DOuc66zq3PgiDOus65zr3Ors+DzrXOuc+CIM+EzrfPgiDOt868zq3Pgc6xz4I=', 'base64'), 'UTF8');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                  AND table_name = 'local_moves' AND column_name = 'move_kind') THEN
    RAISE EXCEPTION 'DRY RUN 060: 060 is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM local_moves WHERE move_kind <> 'local') THEN
    RAISE EXCEPTION 'DRY RUN 060: real relays exist already - the expected counts below assume none; ask the coordinator';
  END IF;

  -- ---- picks (live data, by query) ----------------------------------------------------------
  SELECT o.id, o.driver_id, o.delivery_datetime INTO t1, t1_drv, x FROM orders o
   WHERE o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' AND o.direction = 'Import'
     AND NOT coalesce(o.veroia_switch, false) AND o.ops_status IS DISTINCT FROM 'Provisional'
     AND o.parent_order_id IS NULL AND o.driver_id IS NOT NULL AND o.trailer_id IS NOT NULL AND o.delivery_datetime IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL)
     AND EXISTS (SELECT 1 FROM ct_rt_legs lg JOIN ct_round_trips r ON r.id = lg.rt_id WHERE lg.order_id = o.id AND r.status <> 'cancelled')
   ORDER BY coalesce(o.status IN ('Pending', 'Assigned', 'In Transit'), false) DESC, o.delivery_datetime DESC, o.id DESC LIMIT 1;
  SELECT o.id INTO t2 FROM orders o
   WHERE o.id <> t1 AND o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' AND o.direction = 'Import'
     AND NOT coalesce(o.veroia_switch, false) AND o.ops_status IS DISTINCT FROM 'Provisional'
     AND o.parent_order_id IS NULL AND o.driver_id IS NOT NULL AND o.delivery_datetime IS NOT NULL
     AND (o.loading_datetime IS NULL OR o.loading_datetime <= x)
     AND NOT EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL)
   ORDER BY coalesce(o.status IN ('Pending', 'Assigned', 'In Transit'), false) DESC, o.delivery_datetime DESC, o.id DESC LIMIT 1;
  SELECT o.id, o.delivery_datetime INTO t3, t3_day FROM orders o
   WHERE o.id NOT IN (t1, coalesce(t2, 0)) AND o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' AND o.direction = 'Import'
     AND NOT coalesce(o.veroia_switch, false) AND o.ops_status IS DISTINCT FROM 'Provisional'
     AND o.parent_order_id IS NULL AND o.driver_id IS NOT NULL AND o.delivery_datetime IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL)
   ORDER BY o.delivery_datetime DESC, o.id DESC LIMIT 1;
  SELECT o.id, o.driver_id, o.loading_datetime INTO e1, e1_drv, e_day FROM orders o
   WHERE o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' AND o.direction = 'Export'
     AND NOT coalesce(o.veroia_switch, false) AND o.ops_status IS DISTINCT FROM 'Provisional'
     AND o.parent_order_id IS NULL AND o.driver_id IS NOT NULL AND o.loading_datetime IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL)
   ORDER BY o.loading_datetime DESC, o.id DESC LIMIT 1;
  IF t1 IS NULL OR t2 IS NULL OR t3 IS NULL OR e1 IS NULL THEN
    RAISE EXCEPTION 'DRY RUN 060: no candidate orders (t1 % t2 % t3 % e1 %)', t1, t2, t3, e1;
  END IF;
  SELECT d.id INTO d1 FROM drivers d WHERE d.deleted_at IS NULL AND coalesce(d.active, true)
     AND d.id NOT IN (SELECT o.driver_id FROM orders o WHERE o.id IN (t1, t2, t3, e1) AND o.driver_id IS NOT NULL)
   ORDER BY d.id LIMIT 1;
  SELECT d.id INTO d2 FROM drivers d WHERE d.deleted_at IS NULL AND coalesce(d.active, true) AND d.id <> d1
     AND d.id NOT IN (SELECT o.driver_id FROM orders o WHERE o.id IN (t1, t2, t3, e1) AND o.driver_id IS NOT NULL)
   ORDER BY d.id LIMIT 1;
  SELECT d.id INTO d3 FROM drivers d WHERE d.deleted_at IS NULL AND coalesce(d.active, true) AND d.id NOT IN (d1, d2)
     AND d.id NOT IN (SELECT o.driver_id FROM orders o WHERE o.id IN (t1, t2, t3, e1) AND o.driver_id IS NOT NULL)
   ORDER BY d.id LIMIT 1;
  IF d1 IS NULL OR d2 IS NULL OR d3 IS NULL THEN
    RAISE EXCEPTION 'DRY RUN 060: not enough free drivers (d1 % d2 % d3 %)', d1, d2, d3;
  END IF;
  SELECT id INTO loc FROM locations WHERE legacy_id = 'recJucKOhC1zh4IP3';        -- the Veroia cross-dock
  IF loc IS NULL THEN SELECT min(id) INTO loc FROM locations WHERE deleted_at IS NULL; END IF;
  SELECT min(id) INTO loc2 FROM locations WHERE deleted_at IS NULL AND id <> loc;
  SELECT trailer_id INTO trl FROM orders WHERE id = t1;
  SELECT min(id) INTO prt FROM partners WHERE deleted_at IS NULL;
  SELECT min(id) INTO nl FROM national_loads WHERE deleted_at IS NULL;
  SELECT min(id) INTO any_rt FROM ct_round_trips;
  SELECT o.id, CASE WHEN o.direction = 'Import' THEN 'relay_delivery' ELSE 'relay_loading' END INTO pre, pre_kind FROM orders o
   WHERE o.ops_status = 'Provisional' AND o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' ORDER BY o.id LIMIT 1;
  SELECT o.id INTO vs FROM orders o WHERE o.veroia_switch AND o.direction = 'Import' AND o.deleted_at IS NULL
     AND coalesce(o.status, '') <> 'Cancelled' AND o.ops_status IS DISTINCT FROM 'Provisional' ORDER BY o.id DESC LIMIT 1;
  SELECT o.id, CASE WHEN o.direction = 'Import' THEN 'relay_delivery' ELSE 'relay_loading' END INTO gone, gone_kind FROM orders o
   WHERE o.status = 'Cancelled' AND o.deleted_at IS NULL ORDER BY o.id DESC LIMIT 1;
  SELECT o.id, CASE WHEN o.direction = 'Import' THEN 'relay_delivery' ELSE 'relay_loading' END INTO sp, sp_kind FROM orders o
   WHERE o.deleted_at IS NULL AND coalesce(o.status, '') <> 'Cancelled' AND NOT coalesce(o.veroia_switch, false)
     AND o.ops_status IS DISTINCT FROM 'Provisional' AND o.direction IN ('Import', 'Export')
     AND EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL) ORDER BY o.id DESC LIMIT 1;
  -- a leg of a live split order that can carry a relay (for S18: deleting the parent reaches it)
  SELECT l.id, CASE WHEN l.direction = 'Import' THEN 'relay_delivery' ELSE 'relay_loading' END, l.driver_id, l.parent_order_id
    INTO lg, lg_kind, lg_drv, lg_parent FROM orders l JOIN orders p ON p.id = l.parent_order_id
   WHERE l.deleted_at IS NULL AND p.deleted_at IS NULL AND coalesce(l.status, '') <> 'Cancelled'
     AND l.direction IN ('Import', 'Export') AND NOT coalesce(l.veroia_switch, false) AND l.ops_status IS DISTINCT FROM 'Provisional'
     AND (CASE WHEN l.direction = 'Import' THEN l.delivery_datetime ELSE l.loading_datetime END) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM orders z WHERE z.parent_order_id = l.id AND z.deleted_at IS NULL)
     AND l.parent_order_id NOT IN (t1, t2, t3, e1)
   ORDER BY l.id DESC LIMIT 1;
  lg_by := CASE WHEN d3 IS DISTINCT FROM lg_drv THEN d3 ELSE d1 END;
  res := res || format('picks t1=%s t2=%s t3=%s e1=%s d1=%s d2=%s d3=%s loc=%s pre=%s vs=%s gone=%s split=%s leg=%s',
                       t1, t2, t3, e1, d1, d2, d3, loc, pre, vs, gone, sp, lg);
  EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-09') INTO b09_before;

  -- fingerprint of the international side: orders, round trips, non-local payroll lines
  SELECT md5(coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, loading_datetime, delivery_datetime, deleted_at), ',' ORDER BY id) FROM orders), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, date_start, date_end), ',' ORDER BY id) FROM ct_round_trips), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, driver_id, entry_date, date_end, rt_id, deleted_at, needs_review, trip_value), ',' ORDER BY id) FROM dl_entries WHERE local_move_id IS NULL), ''))
    INTO fp_before;

  -- S1. Local delivery on T1 by D1, same truck, a deliberately WRONG typed day.
  BEGIN
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id, move_date, time_from)
    VALUES ('relay_delivery', t1, d1, trl, loc, DATE '2000-01-01', '07:00') RETURNING id INTO rl1;
    SELECT * INTO lm FROM local_moves WHERE id = rl1;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d1 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT relay_info INTO j FROM dl_v_entries WHERE id = e.id;
    IF lm.status = 'Assigned' AND lm.move_date = x AND n = 1 AND e.rt_id IS NULL AND e.trip_value IS NULL
       AND e.local_move_id = rl1 AND e.source = 'auto' AND e.created_by = 'trigger:local_move' AND e.entry_type = 'trip'
       AND e.date_end = x AND e.route = w_local || sep || w_deliv || ' ' || t1 AND ascii(e.route) = 932
       AND j->>'kind' = 'local_day' AND jsonb_array_length(j->'moves') = 1 AND (j->'moves'->0->>'id')::bigint = rl1
       AND j->'pay_basis' = 'null'::jsonb AND jsonb_typeof(j->'moves'->0->'rt_codes') = 'array'
       AND jsonb_array_length(j->'moves'->0->'rt_codes') >= 1 THEN
      ok := ok + 1; res := res || 'S1 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S1 FAIL status=%s day=%s/%s lines=%s rt=%s val=%s anchor=%s/%s by=%s route=%s info=%s',
        lm.status, lm.move_date, x, n, e.rt_id, e.trip_value, e.local_move_id, rl1, e.created_by, e.route, j);
    END IF;
    -- the international's RT line now shows who did the local part (no amounts)
    SELECT v2.relay_info INTO j FROM dl_v_entries v2 JOIN ct_rt_legs lg ON lg.rt_id = v2.rt_id
     WHERE lg.order_id = t1 AND v2.deleted_at IS NULL LIMIT 1;
    IF j IS NULL AND NOT EXISTS (SELECT 1 FROM dl_entries d JOIN ct_rt_legs lg ON lg.rt_id = d.rt_id WHERE lg.order_id = t1 AND d.deleted_at IS NULL) THEN
      res := res || 'S1b skipped (T1 RT has no payroll line)'::text;
    ELSIF j->>'kind' = 'rt' AND (j->'relays'->0->>'driver_id')::bigint = d1 AND (j->'relays'->0->>'order_id')::bigint = t1 THEN
      ok := ok + 1; res := res || 'S1b ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S1b FAIL rt relay_info=%s', j);
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S1 ERROR ' || SQLERRM);
  END;

  -- S2. Refusals: each must fail with SQLSTATE 23514/23505 and the expected HINT code or
  --     constraint name. Nothing here may write.
  FOR t IN SELECT * FROM (VALUES
      ('S2a direction', format('INSERT INTO local_moves (move_kind, parent_order_id, to_location_id, driver_id, trailer_id) VALUES (%L, %s, %s, %s, %s)', 'relay_loading', t1, loc, d2, trl), 'local_relay:direction'),
      ('S2b direction', format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id, driver_id, trailer_id) VALUES (%L, %s, %s, %s, %s)', 'relay_delivery', e1, loc, d2, trl), 'local_relay:direction'),
      ('S2c twice', format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id, driver_id, trailer_id) VALUES (%L, %s, %s, %s, %s)', 'relay_delivery', t1, loc, d2, trl), 'local_relay:relay_exists'),
      ('S2d points', format('UPDATE local_moves SET to_location_id = %s WHERE id = %s', loc, rl1), 'local_relay:points'),
      ('S2e partner', format('UPDATE local_moves SET partner_id = %s WHERE id = %s', prt, rl1), 'local_relay:partner'),
      ('S2f status', format('UPDATE local_moves SET status = %L WHERE id = %s', 'Delivered', rl1), 'local_relay:status'),
      ('S2g same driver', format('UPDATE local_moves SET driver_id = %s WHERE id = %s', t1_drv, rl1), 'local_relay:same_driver'),
      ('S2h re-point', format('UPDATE local_moves SET parent_order_id = %s WHERE id = %s', t2, rl1), 'local_relay:kind_locked'),
      ('S2i re-kind', format('UPDATE local_moves SET move_kind = %L, from_location_id = NULL, to_location_id = %s WHERE id = %s', 'relay_loading', loc, rl1), 'local_relay:kind_locked'),
      ('S2j trailer', format('UPDATE local_moves SET trailer_id = NULL WHERE id = %s', rl1), 'local_relay:no_trailer'),
      ('S2k partner insert', format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id, partner_id) VALUES (%L, %s, %s, %s)', 'relay_delivery', t3, loc, prt), 'local_relay:partner'),
      ('S2l local with order', format('INSERT INTO local_moves (move_date, parent_order_id, from_location_id, to_location_id) VALUES (%L, %s, %s, %s)', x, t3, loc, loc2), 'local_moves_kind_parent'),
      ('S2m national parent', format('INSERT INTO local_moves (move_kind, parent_nat_load_id, from_location_id, move_date) VALUES (%L, %s, %s, %L)', 'relay_delivery', coalesce(nl, 0), loc, x), 'local_relay:no_order'),
      ('S2n no handover point', format('INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id) VALUES (%L, %s, %s, %s)', 'relay_delivery', t3, d2, trl), 'local_relay:points'),
      ('S2o pay basis value', format('UPDATE drivers SET pay_basis = %L WHERE id = %s', 'monthly', d1), 'drivers_pay_basis_chk'),
      ('S2p unknown kind', format('INSERT INTO local_moves (move_kind, move_date) VALUES (%L, %L)', 'relay_other', x), 'local_moves_kind_chk'),
      ('S2q pre-order', CASE WHEN pre IS NULL THEN NULL ELSE format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id, to_location_id) VALUES (%L, %s, %s, %s)', pre_kind, pre,
          CASE WHEN pre_kind = 'relay_delivery' THEN loc::text ELSE 'NULL' END, CASE WHEN pre_kind = 'relay_loading' THEN loc::text ELSE 'NULL' END) END, 'local_relay:preorder'),
      ('S2r veroia switch', CASE WHEN vs IS NULL THEN NULL ELSE format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id) VALUES (%L, %s, %s)', 'relay_delivery', vs, loc) END, 'local_relay:vs'),
      ('S2s cancelled order', CASE WHEN gone IS NULL THEN NULL ELSE format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id, to_location_id) VALUES (%L, %s, %s, %s)', gone_kind, gone,
          CASE WHEN gone_kind = 'relay_delivery' THEN loc::text ELSE 'NULL' END, CASE WHEN gone_kind = 'relay_loading' THEN loc::text ELSE 'NULL' END) END, 'local_relay:order_gone'),
      ('S2t split parent', CASE WHEN sp IS NULL THEN NULL ELSE format('INSERT INTO local_moves (move_kind, parent_order_id, from_location_id, to_location_id) VALUES (%L, %s, %s, %s)', sp_kind, sp,
          CASE WHEN sp_kind = 'relay_delivery' THEN loc::text ELSE 'NULL' END, CASE WHEN sp_kind = 'relay_loading' THEN loc::text ELSE 'NULL' END) END, 'local_relay:split_parent')
    ) v(lbl, stmt, expect) LOOP
    IF t.stmt IS NULL THEN res := res || (t.lbl || ' skipped (no live example)'); CONTINUE; END IF;
    BEGIN
      EXECUTE t.stmt;
      bad := bad + 1; res := res || (t.lbl || ' FAIL not refused');
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, hint = PG_EXCEPTION_HINT, cn = CONSTRAINT_NAME;
      got := coalesce(nullif(hint, ''), nullif(cn, ''), st);
      IF got = t.expect AND st IN ('23514', '23505') THEN ok := ok + 1; res := res || (t.lbl || ' ok');
      ELSE bad := bad + 1; res := res || format('%s FAIL got %s/%s %s', t.lbl, st, got, SQLERRM); END IF;
    END;
  END LOOP;

  -- S3. Nothing on the international side moved because of a relay (orders, RTs, their payroll).
  SELECT md5(coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, loading_datetime, delivery_datetime, deleted_at), ',' ORDER BY id) FROM orders), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, date_start, date_end), ',' ORDER BY id) FROM ct_round_trips), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, driver_id, entry_date, date_end, rt_id, deleted_at, needs_review, trip_value), ',' ORDER BY id) FROM dl_entries WHERE local_move_id IS NULL), ''))
    INTO fp_after;
  IF fp_after = fp_before THEN ok := ok + 1; res := res || 'S3 ok'::text;
  ELSE bad := bad + 1; res := res || 'S3 FAIL a relay changed an order, a round trip or an international payroll line'::text; END IF;

  -- S4. Groupage-like day: T2 moved to the same day X, relay on T2 by the same D1 -> STILL one line.
  BEGIN
    UPDATE orders SET delivery_datetime = x WHERE id = t2;
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
    VALUES ('relay_delivery', t2, d1, trl, loc) RETURNING id INTO rl2;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT relay_info INTO j FROM dl_v_entries WHERE id = e.id;
    IF n = 1 AND e.local_move_id = least(rl1, rl2)
       AND e.route = w_local || sep || w_deliv || ' ' || t1 || sep || w_deliv || ' ' || t2
       AND jsonb_array_length(j->'moves') = 2 THEN
      ok := ok + 1; res := res || 'S4 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S4 FAIL lines=%s anchor=%s route=%s moves=%s', n, e.local_move_id, e.route, j->'moves');
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S4 ERROR ' || SQLERRM);
  END;

  -- S5. The ORDER moves (T1 delivery X -> X+1): its relay follows, the day lines split, one audit row.
  BEGIN
    UPDATE orders SET delivery_datetime = x + 1 WHERE id = t1;
    SELECT * INTO lm FROM local_moves WHERE id = rl1;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d1 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT route INTO s FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d1 AND entry_date = x + 1 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT count(*) INTO n2 FROM audit_log WHERE table_name = 'local_moves' AND actor = 'trigger:local_moves_follow'
       AND record_id IN (rl1::text, rl2::text) AND after_data->>'reason' LIKE '%day moved';
    IF lm.move_date = x + 1 AND n = 2 AND s = w_local || sep || w_deliv || ' ' || t2
       AND e.route = w_local || sep || w_deliv || ' ' || t1 AND e.local_move_id = rl1 AND n2 = 1 THEN
      ok := ok + 1; res := res || 'S5 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S5 FAIL day=%s lines=%s routeX=%s routeX1=%s audit=%s', lm.move_date, n, s, e.route, n2);
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S5 ERROR ' || SQLERRM);
  END;

  -- S6. An order without a delivery day cannot get a local delivery (T3), and T3 is restored after.
  BEGIN
    UPDATE orders SET delivery_datetime = NULL WHERE id = t3;
    got := 'not refused';
    BEGIN
      INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
      VALUES ('relay_delivery', t3, d2, trl, loc);
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
      got := coalesce(nullif(hint, ''), SQLERRM);
    END;
    UPDATE orders SET delivery_datetime = t3_day WHERE id = t3;
    IF got = 'local_relay:no_order_date' THEN ok := ok + 1; res := res || 'S6 ok'::text;
    ELSE bad := bad + 1; res := res || ('S6 FAIL ' || got); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S6 ERROR ' || SQLERRM);
  END;

  -- S7. T2 cancelled: its relay is Cancelled (audit), the (D1, X) line has no relay left and no
  --     amount -> cancelled with a Greek reason (encoding proof: first letter is code 932).
  --     Then un-cancelling the relay is refused.
  BEGIN
    UPDATE orders SET status = 'Cancelled' WHERE id = t2;
    SELECT * INTO lm FROM local_moves WHERE id = rl2;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d1 AND entry_date = x AND local_move_id IS NOT NULL ORDER BY id DESC LIMIT 1;
    SELECT count(*) INTO n2 FROM audit_log WHERE table_name = 'local_moves' AND actor = 'trigger:local_moves_follow'
       AND record_id = rl2::text AND after_data->>'status' = 'Cancelled';
    got := 'not refused';
    BEGIN
      UPDATE local_moves SET status = 'Pending' WHERE id = rl2;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
      got := coalesce(nullif(hint, ''), SQLERRM);
    END;
    SELECT relay_info INTO j FROM dl_v_entries WHERE id = e.id;
    IF lm.status = 'Cancelled' AND n2 = 1 AND e.deleted_at IS NOT NULL AND e.deleted_reason = t_gone
       AND ascii(e.deleted_reason) = 932 AND got = 'local_relay:final' AND j IS NULL THEN
      ok := ok + 1; res := res || 'S7 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S7 FAIL relay=%s audit=%s line_deleted=%s reason=%s revive=%s cancelled_line_info=%s', lm.status, n2, e.deleted_at, e.deleted_reason, got, j);
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S7 ERROR ' || SQLERRM);
  END;

  -- S7b. A gone relay skips the trigger rules, so a later write to it meets the row CHECK (both
  --      refusal paths are live): a partner on T2's cancelled relay -> local_moves_relay_executor.
  IF prt IS NULL THEN res := res || 'S7b skipped (no partner)'::text;
  ELSE
    BEGIN
      got := 'not refused';
      BEGIN
        UPDATE local_moves SET partner_id = prt WHERE id = rl2;
      EXCEPTION WHEN others THEN
        GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, hint = PG_EXCEPTION_HINT, cn = CONSTRAINT_NAME;
        got := coalesce(nullif(hint, ''), nullif(cn, ''), st);
      END;
      IF got = 'local_moves_relay_executor' THEN ok := ok + 1; res := res || 'S7b ok'::text;
      ELSE bad := bad + 1; res := res || ('S7b FAIL got ' || got); END IF;
    EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S7b ERROR ' || SQLERRM);
    END;
  END IF;

  -- S8. Accounting wrote an amount (neutral test value) on the (D1, X+1) line, then T1 is DELETED:
  --     the order delete succeeds, the relay goes with it (023 step 6, audit), the line is NOT
  --     dropped - it goes to review. Money never disappears silently.
  BEGIN
    UPDATE dl_entries SET trip_value = 1 WHERE driver_id = d1 AND entry_date = x + 1 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE orders SET deleted_at = now() WHERE id = t1;
    SELECT * INTO lm FROM local_moves WHERE id = rl1;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d1 AND entry_date = x + 1 AND local_move_id IS NOT NULL ORDER BY id DESC LIMIT 1;
    SELECT count(*) INTO n2 FROM audit_log WHERE table_name = 'local_moves' AND actor = 'trigger:order_unlink'
       AND action = 'delete' AND record_id = rl1::text;
    SELECT relay_info INTO j FROM dl_v_entries WHERE id = e.id;
    IF lm.deleted_at IS NOT NULL AND n2 = 1 AND e.deleted_at IS NULL AND e.needs_review
       AND position(r_gone IN coalesce(e.review_note, '')) > 0 AND jsonb_array_length(j->'moves') = 0 THEN
      ok := ok + 1; res := res || 'S8 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S8 FAIL relay_deleted=%s audit=%s line_deleted=%s review=%s note=%s info=%s', lm.deleted_at, n2, e.deleted_at, e.needs_review, e.review_note, j);
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S8 ERROR ' || SQLERRM);
  END;

  -- S8b. A deleted relay is not revived either (S7 proved it for a cancelled one).
  BEGIN
    got := 'not refused';
    BEGIN
      UPDATE local_moves SET deleted_at = NULL WHERE id = rl1;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
      got := coalesce(nullif(hint, ''), SQLERRM);
    END;
    IF got = 'local_relay:final' THEN ok := ok + 1; res := res || 'S8b ok'::text;
    ELSE bad := bad + 1; res := res || ('S8b FAIL ' || got); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S8b ERROR ' || SQLERRM);
  END;

  -- S9. A deleted relay given another driver pays nobody.
  BEGIN
    UPDATE local_moves SET driver_id = d2 WHERE id = rl1;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF n = 0 THEN ok := ok + 1; res := res || 'S9 ok'::text;
    ELSE bad := bad + 1; res := res || format('S9 FAIL lines for D2=%s', n); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S9 ERROR ' || SQLERRM);
  END;

  -- S10. Weekly National's plain local moves behave exactly as today: status as written (no
  --      derived Assigned), a national load as parent, partner allowed, no payroll line.
  BEGIN
    INSERT INTO local_moves (move_date, sequence, from_location_id, to_location_id, status, driver_id, parent_nat_load_id)
    VALUES (x, 1, loc, loc2, 'Pending', d2, nl) RETURNING id INTO lmp;
    UPDATE local_moves SET driver_id = d1 WHERE id = lmp;                       -- "cover" from Weekly National
    INSERT INTO local_moves (move_date, from_location_id, to_location_id, status, partner_id)
    VALUES (x, loc, loc2, 'Done', prt) RETURNING id INTO lmq;
    SELECT * INTO lm FROM local_moves WHERE id = lmp;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id IN (d1, d2) AND entry_date = x AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF lm.move_kind = 'local' AND lm.status = 'Pending' AND lm.driver_id = d1 AND lm.move_date = x
       AND (SELECT status FROM local_moves WHERE id = lmq) = 'Done' AND n = 0 THEN
      ok := ok + 1; res := res || 'S10 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S10 FAIL kind=%s status=%s lines=%s', lm.move_kind, lm.status, n);
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S10 ERROR ' || SQLERRM);
  END;

  -- S11. Local loading on E1 without a driver yet ("to be assigned"): Pending, no line; then D2
  --      is given -> Assigned and one line on the loading day.
  BEGIN
    INSERT INTO local_moves (move_kind, parent_order_id, to_location_id, time_from)
    VALUES ('relay_loading', e1, loc, '06:00') RETURNING id INTO rle;
    SELECT * INTO lm FROM local_moves WHERE id = rle;
    SELECT count(*) INTO n FROM dl_entries WHERE local_move_id IS NOT NULL AND deleted_at IS NULL AND entry_date = e_day AND driver_id = d2;
    UPDATE local_moves SET driver_id = d2, trailer_id = trl WHERE id = rle;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF lm.status = 'Pending' AND lm.move_date = e_day AND n = 0
       AND (SELECT status FROM local_moves WHERE id = rle) = 'Assigned'
       AND e.local_move_id = rle AND e.route = w_local || sep || w_load || ' ' || e1 THEN
      ok := ok + 1; res := res || 'S11 ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S11 FAIL status=%s day=%s/%s pre_lines=%s anchor=%s route=%s', lm.status, lm.move_date, e_day, n, e.local_move_id, e.route);
    END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S11 ERROR ' || SQLERRM);
  END;

  -- S11b. The EXPORT's loading day moves to a day 3+ days ahead: the local loading follows (one
  --       audit row), the old day's line (no money) is cancelled, the new day gets one line.
  --       From here on e_day is that future day, so S13 below is about today-and-later lines.
  BEGIN
    f_day := (now() AT TIME ZONE 'Europe/Athens')::date + 3;
    IF f_day = e_day THEN f_day := f_day + 1; END IF;
    UPDATE orders SET loading_datetime = f_day WHERE id = e1;
    SELECT * INTO lm FROM local_moves WHERE id = rle;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d2 AND entry_date = f_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT count(*) INTO n2 FROM audit_log WHERE table_name = 'local_moves' AND actor = 'trigger:local_moves_follow'
       AND record_id = rle::text AND after_data->>'reason' LIKE '%day moved';
    IF lm.move_date = f_day AND n = 0 AND e.local_move_id = rle AND e.route = w_local || sep || w_load || ' ' || e1 AND n2 = 1 THEN
      ok := ok + 1; res := res || 'S11b ok'::text;
    ELSE
      bad := bad + 1; res := res || format('S11b FAIL day=%s/%s old_lines=%s anchor=%s route=%s audit=%s', lm.move_date, f_day, n, e.local_move_id, e.route, n2);
    END IF;
    e_day := f_day;                                  -- last: an error above leaves e_day as it was
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S11b ERROR ' || SQLERRM);
  END;

  -- S12. The payroll line belongs to the system: never also an RT line, never twice a day, never
  --      a non-trip. (rows the screens cannot write anyway - the floor under the Worker)
  FOR t IN SELECT * FROM (VALUES
      ('S12a one origin', format('UPDATE dl_entries SET rt_id = %s WHERE driver_id = %s AND entry_date = %L AND local_move_id IS NOT NULL AND deleted_at IS NULL', coalesce(any_rt, 0), d2, e_day), 'dl_one_origin'),
      ('S12b one line a day', format('INSERT INTO dl_entries (driver_id, entry_type, entry_date, date_end, local_move_id, source, created_by) VALUES (%s, %L, %L, %L, %s, %L, %L)', d2, 'trip', e_day, e_day, coalesce(rle, 0), 'manual', 'dry-run-060'), 'dl_local_day_live'),
      ('S12c trip only', format('INSERT INTO dl_entries (driver_id, entry_type, entry_date, amount, local_move_id, source, created_by) VALUES (%s, %L, %L, 1, %s, %L, %L)', d2, 'adjustment', e_day + 30, coalesce(rle, 0), 'manual', 'dry-run-060'), 'dl_lm_is_trip')
    ) v(lbl, stmt, expect) LOOP
    BEGIN
      EXECUTE t.stmt;
      bad := bad + 1; res := res || (t.lbl || ' FAIL not refused');
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, hint = PG_EXCEPTION_HINT, cn = CONSTRAINT_NAME;
      got := coalesce(nullif(hint, ''), nullif(cn, ''), st);
      IF got = t.expect THEN ok := ok + 1; res := res || (t.lbl || ' ok');
      ELSE bad := bad + 1; res := res || format('%s FAIL got %s/%s %s', t.lbl, st, got, SQLERRM); END IF;
    END;
  END LOOP;

  -- S13. Pay basis (OWNER-Q2 answered 4/10), on a FUTURE day (S11b): salary -> no line (track
  --      record only); back to per_trip -> the line comes back; an amount then salary -> review,
  --      never dropped; NULL again -> still exactly one line. Orders, RTs, international lines
  --      untouched throughout. (A PAST never-valued line goes to review instead: S19.)
  SELECT md5(coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, loading_datetime, delivery_datetime, deleted_at), ',' ORDER BY id) FROM orders), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, date_start, date_end), ',' ORDER BY id) FROM ct_round_trips), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, driver_id, entry_date, date_end, rt_id, deleted_at, needs_review, trip_value), ',' ORDER BY id) FROM dl_entries WHERE local_move_id IS NULL), ''))
    INTO fp_before;
  BEGIN
    UPDATE drivers SET pay_basis = 'salary' WHERE id = d2;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT deleted_reason INTO s FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL ORDER BY id DESC LIMIT 1;
    IF n = 0 AND s = t_salary THEN ok := ok + 1; res := res || 'S13a ok'::text;
    ELSE bad := bad + 1; res := res || format('S13a FAIL live=%s reason=%s', n, s); END IF;

    UPDATE drivers SET pay_basis = 'per_trip' WHERE id = d2;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF n = 1 THEN ok := ok + 1; res := res || 'S13b ok'::text;
    ELSE bad := bad + 1; res := res || format('S13b FAIL live=%s', n); END IF;

    UPDATE dl_entries SET trip_value = 1 WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE drivers SET pay_basis = 'salary' WHERE id = d2;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF e.id IS NOT NULL AND e.needs_review AND position(r_salary IN coalesce(e.review_note, '')) > 0 THEN
      ok := ok + 1; res := res || 'S13c ok'::text;
    ELSE bad := bad + 1; res := res || format('S13c FAIL line=%s review=%s note=%s', e.id, e.needs_review, e.review_note); END IF;

    UPDATE drivers SET pay_basis = NULL WHERE id = d2;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF n = 1 THEN ok := ok + 1; res := res || 'S13d ok'::text;
    ELSE bad := bad + 1; res := res || format('S13d FAIL live=%s', n); END IF;

    -- a salaried driver's new relay: track record only, no line
    UPDATE drivers SET pay_basis = 'salary' WHERE id = d1;
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
    VALUES ('relay_delivery', t3, d1, trl, loc) RETURNING id INTO rl3;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d1 AND entry_date = t3_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF n = 0 AND (SELECT status FROM local_moves WHERE id = rl3) = 'Assigned' THEN ok := ok + 1; res := res || 'S13e ok'::text;
    ELSE bad := bad + 1; res := res || format('S13e FAIL lines=%s', n); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S13 ERROR ' || SQLERRM);
  END;
  SELECT md5(coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, loading_datetime, delivery_datetime, deleted_at), ',' ORDER BY id) FROM orders), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, status, driver_id, truck_id, trailer_id, date_start, date_end), ',' ORDER BY id) FROM ct_round_trips), '')
          || coalesce((SELECT string_agg(concat_ws(':', id, driver_id, entry_date, date_end, rt_id, deleted_at, needs_review, trip_value), ',' ORDER BY id) FROM dl_entries WHERE local_move_id IS NULL), ''))
    INTO fp_after;
  IF fp_after = fp_before THEN ok := ok + 1; res := res || 'S13f ok'::text;
  ELSE bad := bad + 1; res := res || 'S13f FAIL a pay basis change touched orders, round trips or international lines'::text; END IF;

  -- S14. The auditor sees exactly what is left: D2 (pay basis unknown, live relay) -> B-64 =
  --      {paybasis:D2}; D1 is salaried (no line expected); the review lines are B-08's;
  --      B-63 = 0 (every live relay has a driver); B-65 = 0; B-09 never counts a local line.
  BEGIN
    EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-64') INTO v;
    EXECUTE (SELECT ids_sql FROM monitoring.checks WHERE id = 'B-64') INTO ids;
    IF v = 1 AND ids = ARRAY['paybasis:' || d2] THEN ok := ok + 1; res := res || 'S14a ok'::text;
    ELSE bad := bad + 1; res := res || format('S14a FAIL B-64=%s ids=%s', v, ids); END IF;
    EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-63') INTO v;
    EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-65') INTO n;
    IF v = 0 AND n = 0 THEN ok := ok + 1; res := res || 'S14b ok'::text;
    ELSE bad := bad + 1; res := res || format('S14b FAIL B-63=%s B-65=%s', v, n); END IF;
    EXECUTE (SELECT ids_sql FROM monitoring.checks WHERE id = 'B-09') INTO b09_ids;
    SELECT count(*) INTO n FROM dl_entries WHERE id::text = ANY (b09_ids) AND local_move_id IS NOT NULL;
    EXECUTE (SELECT sql_text FROM monitoring.checks WHERE id = 'B-09') INTO v;
    IF n = 0 THEN ok := ok + 1; res := res || format('S14c ok (B-09 %s -> %s)', b09_before, v);
    ELSE bad := bad + 1; res := res || format('S14c FAIL B-09 counts %s local lines', n); END IF;
    -- B-65 really fires: the relay on T3 is given T3's own truck as its "other" tractor -> truck-copy
    UPDATE local_moves SET truck_id = (SELECT truck_id FROM orders WHERE id = t3) WHERE id = rl3;
    EXECUTE (SELECT ids_sql FROM monitoring.checks WHERE id = 'B-65') INTO ids;
    IF (SELECT truck_id FROM orders WHERE id = t3) IS NULL THEN res := res || 'S14d skipped (T3 has no truck)'::text;
    ELSIF ids = ARRAY[rl3::text || ':truck-copy'] THEN ok := ok + 1; res := res || 'S14d ok'::text;
    ELSE bad := bad + 1; res := res || format('S14d FAIL B-65 ids=%s', ids); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S14 ERROR ' || SQLERRM);
  END;

  -- S15. The ONE exit accounting has on a local line (coordinator D3): cancel with a reason, and
  --      only when nothing is owed by a line. dl_local_line_guard is the floor under the Worker.
  BEGIN
    -- a) D2 is per-trip/unknown and his relay on E1 is live that day: cancel refused
    got := 'not refused';
    BEGIN
      UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'dry-run 060'
       WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
      got := coalesce(nullif(hint, ''), SQLERRM);
    END;
    IF got = 'local_relay:line_has_relay' THEN ok := ok + 1; res := res || 'S15a ok'::text;
    ELSE bad := bad + 1; res := res || ('S15a FAIL ' || got); END IF;

    -- b) D1 back to unknown (his T3 relay now gets a line); his X+1 line (money, flagged in S8)
    --    has no live relay left: cancel allowed even though he is not salaried
    UPDATE drivers SET pay_basis = NULL WHERE id = d1;
    SELECT id INTO lid FROM dl_entries WHERE driver_id = d1 AND entry_date = x + 1 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'dry-run 060: no relay left' WHERE id = lid;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d1 AND entry_date = t3_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF lid IS NOT NULL AND (SELECT deleted_at FROM dl_entries WHERE id = lid) IS NOT NULL AND n = 1 THEN
      ok := ok + 1; res := res || 'S15b ok'::text;
    ELSE bad := bad + 1; res := res || format('S15b FAIL line=%s t3_lines=%s', lid, n); END IF;

    -- c) never restored
    got := 'not refused';
    BEGIN
      UPDATE dl_entries SET deleted_at = NULL, deleted_reason = NULL WHERE id = lid;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
      got := coalesce(nullif(hint, ''), SQLERRM);
    END;
    IF got = 'local_relay:line_restore' THEN ok := ok + 1; res := res || 'S15c ok'::text;
    ELSE bad := bad + 1; res := res || ('S15c FAIL ' || got); END IF;

    -- d) D2 salaried: his flagged line (money) may be cancelled; the re-sync never re-creates it
    --    while he is salaried; back to unknown -> a NEW empty line (the cancelled one stays)
    UPDATE drivers SET pay_basis = 'salary' WHERE id = d2;
    SELECT id INTO lid FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'dry-run 060: salaried' WHERE id = lid;
    UPDATE local_moves SET move_date = move_date WHERE id = rle;            -- any later sync of that day
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE drivers SET pay_basis = NULL WHERE id = d2;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF lid IS NOT NULL AND n = 0 AND e.id IS NOT NULL AND e.id <> lid AND e.trip_value IS NULL AND NOT e.needs_review THEN
      ok := ok + 1; res := res || 'S15d ok'::text;
    ELSE bad := bad + 1; res := res || format('S15d FAIL cancelled=%s live_while_salaried=%s new=%s', lid, n, e.id); END IF;

    -- e) "value 0" is not money: the relay goes, the line is cancelled, not sent to review
    UPDATE dl_entries SET trip_value = 0 WHERE id = e.id;
    UPDATE local_moves SET deleted_at = now() WHERE id = rle;
    SELECT * INTO e FROM dl_entries WHERE id = e.id;
    IF e.deleted_at IS NOT NULL AND NOT e.needs_review AND e.deleted_reason = t_gone THEN
      ok := ok + 1; res := res || 'S15e ok'::text;
    ELSE bad := bad + 1; res := res || format('S15e FAIL deleted=%s review=%s reason=%s', e.deleted_at, e.needs_review, e.deleted_reason); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S15 ERROR ' || SQLERRM);
  END;

  -- S16. Accounting settled the day at "value 0", then a relay is ADDED to that day: review with
  --      the "changed" note. "Value 0" is a value, not money: without the review the new relay
  --      would be settled at 0 silently - no NULL amount (not pending), a line exists (B-64 quiet).
  --      (front review round 2, 4/10.) Then accounting checks it and writes the neutral value 7,
  --      which S17 builds on.
  BEGIN
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, to_location_id)
    VALUES ('relay_loading', e1, d2, trl, loc) RETURNING id INTO rle2;
    UPDATE dl_entries SET trip_value = 0 WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE local_moves SET deleted_at = now() WHERE id = rl3;                  -- frees T3 for D2
    UPDATE orders SET delivery_datetime = e_day WHERE id = t3;
    INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id)
    VALUES ('relay_delivery', t3, d2, trl, loc) RETURNING id INTO rl4;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    IF n = 1 AND e.trip_value = 0 AND e.needs_review AND position(r_changed IN coalesce(e.review_note, '')) > 0
       AND e.local_move_id = least(rle2, rl4)
       AND e.route = w_local || sep || w_load || ' ' || e1 || sep || w_deliv || ' ' || t3 THEN
      ok := ok + 1; res := res || 'S16 ok'::text;
    ELSE bad := bad + 1; res := res || format('S16 FAIL lines=%s value=%s review=%s note=%s route=%s', n, e.trip_value, e.needs_review, e.review_note, e.route); END IF;
    UPDATE dl_entries SET trip_value = 7, needs_review = false, review_note = 'dry-run 060 checked' WHERE id = e.id;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S16 ERROR ' || SQLERRM);
  END;

  -- S17. The T3 relay changes driver D2 -> D3 while D2's line holds money (7, review cleared in
  --      S16): D2's line stays, relabelled, BACK in review with a fresh "changed" note; D3 gets
  --      exactly one empty line (both days locked in fixed order).
  BEGIN
    UPDATE local_moves SET driver_id = d3 WHERE id = rl4;
    SELECT * INTO e FROM dl_entries WHERE driver_id = d2 AND entry_date = e_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT count(*) INTO n FROM dl_entries WHERE driver_id = d3 AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    SELECT count(*) INTO n2 FROM dl_entries WHERE driver_id = d3 AND entry_date = e_day AND local_move_id = rl4 AND deleted_at IS NULL
       AND trip_value IS NULL AND route = w_local || sep || w_deliv || ' ' || t3;
    IF e.id IS NOT NULL AND e.needs_review AND position(r_changed IN coalesce(e.review_note, '')) > 0
       AND e.trip_value = 7 AND e.route = w_local || sep || w_load || ' ' || e1
       AND n = 1 AND n2 = 1 THEN
      ok := ok + 1; res := res || 'S17 ok'::text;
    ELSE bad := bad + 1; res := res || format('S17 FAIL d2_line=%s review=%s note=%s route=%s d3_lines=%s/%s', e.id, e.needs_review, e.review_note, e.route, n, n2); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S17 ERROR ' || SQLERRM);
  END;

  -- S18. A split order is deleted: 023 step 3 deletes its legs, each leg re-fires 023, and step 6
  --      takes the leg's relay with it (audit row).
  IF lg IS NULL THEN res := res || 'S18 skipped (no live split leg)'::text;
  ELSE
    BEGIN
      INSERT INTO local_moves (move_kind, parent_order_id, driver_id, trailer_id, from_location_id, to_location_id)
      VALUES (lg_kind, lg, lg_by, trl, CASE WHEN lg_kind = 'relay_delivery' THEN loc END, CASE WHEN lg_kind = 'relay_loading' THEN loc END)
      RETURNING id INTO rlg;
      UPDATE orders SET deleted_at = now() WHERE id = lg_parent;
      SELECT * INTO lm FROM local_moves WHERE id = rlg;
      SELECT count(*) INTO n2 FROM audit_log WHERE table_name = 'local_moves' AND actor = 'trigger:order_unlink'
         AND action = 'delete' AND record_id = rlg::text AND before_data->>'parent_order_id' = lg::text;
      IF lm.deleted_at IS NOT NULL AND n2 = 1 THEN ok := ok + 1; res := res || 'S18 ok'::text;
      ELSE bad := bad + 1; res := res || format('S18 FAIL relay_deleted=%s audit=%s', lm.deleted_at, n2); END IF;
    EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S18 ERROR ' || SQLERRM);
    END;
  END IF;

  -- S19. A PAST line nobody valued, driver becomes salaried: review, NOT cancelled (he may have
  --      been per-trip that day; no pay basis history, coordinator D4). Cleared without a value it
  --      is B-64 'salaried'; cancelling it with a reason is allowed.
  BEGIN
    p_day := (now() AT TIME ZONE 'Europe/Athens')::date - 2;
    UPDATE orders SET delivery_datetime = p_day WHERE id = t3;                  -- rl4 (D3) follows
    SELECT id INTO lid FROM dl_entries WHERE driver_id = d3 AND entry_date = p_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    UPDATE drivers SET pay_basis = 'salary' WHERE id = d3;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF lid IS NOT NULL AND e.deleted_at IS NULL AND e.needs_review AND position(r_salary IN coalesce(e.review_note, '')) > 0 THEN
      ok := ok + 1; res := res || 'S19a ok'::text;
    ELSE bad := bad + 1; res := res || format('S19a FAIL line=%s deleted=%s review=%s note=%s', lid, e.deleted_at, e.needs_review, e.review_note); END IF;
    UPDATE dl_entries SET needs_review = false, review_note = 'dry-run 060 checked' WHERE id = lid;
    EXECUTE (SELECT ids_sql FROM monitoring.checks WHERE id = 'B-64') INTO ids;
    UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'dry-run 060: salaried, not owed' WHERE id = lid;
    EXECUTE (SELECT ids_sql FROM monitoring.checks WHERE id = 'B-64') INTO b09_ids;
    IF ('salaried:' || lid) = ANY (ids) AND NOT (('salaried:' || lid) = ANY (b09_ids))
       AND (SELECT deleted_at FROM dl_entries WHERE id = lid) IS NOT NULL THEN
      ok := ok + 1; res := res || 'S19b ok'::text;
    ELSE bad := bad + 1; res := res || format('S19b FAIL B-64 before=%s after=%s', ids, b09_ids); END IF;
    -- c) the same past day, but accounting had already typed "value 0" (= nothing owed): a switch
    --    to salary cancels it, no review
    UPDATE drivers SET pay_basis = NULL WHERE id = d3;                         -- a new empty line
    UPDATE dl_entries SET trip_value = 0 WHERE driver_id = d3 AND entry_date = p_day AND local_move_id IS NOT NULL AND deleted_at IS NULL
      RETURNING id INTO lid;
    UPDATE drivers SET pay_basis = 'salary' WHERE id = d3;
    SELECT * INTO e FROM dl_entries WHERE id = lid;
    IF lid IS NOT NULL AND e.deleted_at IS NOT NULL AND NOT e.needs_review AND e.deleted_reason = t_salary THEN
      ok := ok + 1; res := res || 'S19c ok'::text;
    ELSE bad := bad + 1; res := res || format('S19c FAIL line=%s deleted=%s review=%s reason=%s', lid, e.deleted_at, e.needs_review, e.deleted_reason); END IF;
  EXCEPTION WHEN others THEN bad := bad + 1; res := res || ('S19 ERROR ' || SQLERRM);
  END;

  RAISE EXCEPTION 'DRY RUN 060 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, '  |  ');
END
$dry$;
