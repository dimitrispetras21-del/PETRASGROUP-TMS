-- 079 ROLLBACK - day L back to Saturday 31/10/2026, ONLY while no person has planned what 079 brought into v5.
-- ONE DO block, ASCII. First 079_plan_cutover_move_rollback_dryrun.sql (this block + a deliberate error: nothing
-- kept), then this file. Only with the owner's explicit yes, after 15:00.
-- WHICH VS: those 079 brought into v5 - the orders whose first bridge was born at or after 079's move (its audit_log
--   row, actor '079') and whose hub day is before 31/10 (or empty). A VS bridged by 074, or one the desk has since
--   moved to 31/10 or later, is v5 under 31/10 too and is not touched.
-- REFUSES (only corrections forward, with a new migration) when a person touched one of their pieces: any leg on it
--   (live or not), a piece not born by the sync (a split), or an audit row on their shipments / pieces by anyone
--   but the sync ('079 backfill', 'trigger:plan_bridge_sync').
-- OTHERWISE, in one transaction:
--   plan_config back to 31/10 and its CHECK plan_config_future back in place of plan_config_floor (074a's three
--   CHECKs, proved by text); opened_at untouched. Their bridges and pieces retired with deleted_reason
--   '074 rollback' - the ONE reason the cut ignores (plan_h_vs_in_v5, and B-95 / B-26 that rewrite it): without it
--   "once v5, always v5" would keep them in v5 for ever. deleted_by says '079 rollback'. A bridge already retired
--   keeps its deleted_at and takes the same reason. via_hub false on their stops. Their national loads live again
--   from plan_cutover_log (with every row their soft delete cascaded, as 074's rollback), and those log rows go:
--   079 wrote them. Their notices from the sync are marked read ('079 rollback'). No trigger, no function changes.
-- EXPECTED: NOTICE "079 ROLLBACK OK: ...".
DO $do$
DECLARE
  c_old CONSTANT date := DATE '2026-10-31';
  c_new CONSTANT date := DATE '2026-10-24';
  c_sync CONSTANT text[] := ARRAY['079 backfill', 'trigger:plan_bridge_sync'];
  v_t79 timestamptz; v_orders bigint[]; v_ships bigint[]; v_trg0 int; v_trg1 int; v_k int; x record;
  v_sh int := 0; v_nl int := 0; v_no int := 0; v_via int := 0;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF (SELECT cutover_day FROM public.plan_config WHERE id = 1) IS DISTINCT FROM c_new THEN
    RAISE EXCEPTION '079 rollback: day L is not % - 079 is not applied, or something moved it since', c_new;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plan_config'::regclass AND conname = 'plan_config_floor')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plan_config'::regclass AND conname = 'plan_config_future') THEN
    RAISE EXCEPTION '079 rollback: plan_config does not hold 079''s CHECK (plan_config_floor) - stop, re-measure';
  END IF;
  SELECT max(created_at) INTO v_t79 FROM public.audit_log WHERE actor = '079' AND table_name = 'plan_config' AND action = 'update';
  IF v_t79 IS NULL THEN RAISE EXCEPTION '079 rollback: the audit row of 079''s move is not found - stop'; END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0) THEN
    RAISE EXCEPTION '079 rollback: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;
  -- the VS 079 brought (see the header) and every bridge they ever had (the ones the cut counts)
  SELECT coalesce(array_agg(o.id ORDER BY o.id), '{}') INTO v_orders FROM public.orders o
   WHERE EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.order_stop_id IS NOT NULL
                   AND s.deleted_reason IS DISTINCT FROM '074 rollback')
     AND NOT EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.order_stop_id IS NOT NULL
                       AND s.deleted_reason IS DISTINCT FROM '074 rollback' AND s.created_at < v_t79)
     AND (o.cross_dock_date IS NULL OR o.cross_dock_date < c_old);
  SELECT coalesce(array_agg(s.id ORDER BY s.id), '{}') INTO v_ships FROM public.shipments s
   WHERE s.order_id = ANY (v_orders) AND s.order_stop_id IS NOT NULL AND s.deleted_reason IS DISTINCT FROM '074 rollback';
  -- the point of no return: a person touched one of their pieces
  IF EXISTS (SELECT 1 FROM public.piece_legs l JOIN public.shipment_pieces sp ON sp.id = l.piece_id WHERE sp.shipment_id = ANY (v_ships))
     OR EXISTS (SELECT 1 FROM public.shipment_pieces sp WHERE sp.shipment_id = ANY (v_ships) AND NOT (sp.created_by = ANY (c_sync)))
     OR EXISTS (SELECT 1 FROM public.audit_log a WHERE a.created_at >= v_t79 AND NOT (a.actor = ANY (c_sync))
                  AND ((a.table_name = 'shipments' AND a.record_id = ANY (SELECT q::text FROM unnest(v_ships) q))
                       OR (a.table_name = 'shipment_pieces' AND a.record_id = ANY (
                             SELECT sp.id::text FROM public.shipment_pieces sp WHERE sp.shipment_id = ANY (v_ships))))) THEN
    RAISE EXCEPTION '079 rollback: after the point of no return (a person already planned a VS that 079 brought) - only corrections forward';
  END IF;

  -- 1. day L back, and 074a's CHECK with it (opened_at untouched: 31/10 > 28/10)
  UPDATE public.plan_config SET cutover_day = c_old WHERE id = 1 AND cutover_day = c_new;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '079 rollback: plan_config not updated (% rows)', v_k; END IF;
  ALTER TABLE public.plan_config DROP CONSTRAINT plan_config_floor;
  ALTER TABLE public.plan_config ADD CONSTRAINT plan_config_future CHECK (cutover_day > (opened_at AT TIME ZONE 'Europe/Athens')::date);
  INSERT INTO public.audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
  VALUES ('079 rollback', 'system', 'update', 'plan_config', '1', jsonb_build_object('cutover_day', c_new),
          jsonb_build_object('cutover_day', c_old, 'reason', '079 rollback'), now());

  -- 2. their bridges: soft only (071 hard_delete), with the reason the cut ignores
  UPDATE public.shipment_pieces SET deleted_at = now(), deleted_reason = '074 rollback', deleted_by = '079 rollback'
   WHERE shipment_id = ANY (v_ships) AND deleted_at IS NULL;
  FOR x IN SELECT s.id, to_jsonb(s) AS old FROM public.shipments s WHERE s.id = ANY (v_ships) ORDER BY s.id LOOP
    UPDATE public.shipments SET deleted_at = coalesce(deleted_at, now()), deleted_reason = '074 rollback',
           deleted_by = coalesce(deleted_by, '079 rollback') WHERE id = x.id;
    INSERT INTO public.audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    VALUES ('079 rollback', 'system', 'delete', 'shipments', x.id::text, x.old,
            (SELECT to_jsonb(q) FROM public.shipments q WHERE q.id = x.id), now());
    v_sh := v_sh + 1;
  END LOOP;
  UPDATE public.order_stops SET via_hub = false WHERE order_id = ANY (v_orders) AND via_hub;
  GET DIAGNOSTICS v_via = ROW_COUNT;

  -- 3. their national loads back, with what their soft delete cascaded at the same instant (074 rollback's rule)
  FOR x IN SELECT * FROM public.plan_cutover_log
            WHERE kind = 'nl_unlinked' AND at >= v_t79 AND (before_data->>'order_id')::bigint = ANY (v_orders) ORDER BY id DESC LOOP
    UPDATE public.national_loads SET deleted_at = NULL WHERE id = x.row_id AND deleted_at = x.at;
    UPDATE public.order_stops SET deleted_at = NULL WHERE national_load_id = x.row_id AND deleted_at = x.at;
    UPDATE public.ramp SET deleted_at = NULL WHERE national_load_id = x.row_id AND deleted_at = x.at;
    UPDATE public.local_moves SET deleted_at = NULL WHERE parent_nat_load_id = x.row_id AND deleted_at = x.at;
    DELETE FROM public.plan_cutover_log WHERE id = x.id;
    INSERT INTO public.audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    VALUES ('079 rollback', 'system', 'update', 'national_loads', x.row_id::text, jsonb_build_object('deleted_at', x.at),
            jsonb_build_object('deleted_at', null, 'reason', '079 rollback: nl_unlinked'), now());
    v_nl := v_nl + 1;
  END LOOP;

  -- 4. the sync's notices on them are history now: read, never deleted
  UPDATE public.plan_notices SET read_at = now(), read_by = '079 rollback'
   WHERE order_id = ANY (v_orders) AND created_at >= v_t79 AND created_by = ANY (c_sync) AND read_at IS NULL;
  GET DIAGNOSTICS v_no = ROW_COUNT;

  -- 5. proofs (071's deferred rules fire here)
  SET CONSTRAINTS ALL IMMEDIATE;
  IF plan_cutover_day() <> c_old
     OR (SELECT string_agg(conname || '=' || pg_get_constraintdef(oid), ' ; ' ORDER BY conname) FROM pg_constraint
          WHERE conrelid = 'public.plan_config'::regclass AND contype = 'c')
        IS DISTINCT FROM 'plan_config_future=CHECK ((cutover_day > ((opened_at AT TIME ZONE ''Europe/Athens''::text))::date)) ; '
          || 'plan_config_one=CHECK ((id = 1)) ; plan_config_saturday=CHECK ((EXTRACT(isodow FROM cutover_day) = (6)::numeric))' THEN
    RAISE EXCEPTION '079 rollback proof: day L or the CHECKs of plan_config are not 074''s / 074a''s';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_orders) q WHERE plan_h_vs_in_v5(q)) THEN
    RAISE EXCEPTION '079 rollback proof: a VS that 079 brought is still in v5';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_stops s WHERE s.order_id IS NOT NULL
              AND (plan_h_bridge_wanted(s.id) <> EXISTS (SELECT 1 FROM public.shipments b WHERE b.order_stop_id = s.id AND b.deleted_at IS NULL)
                   OR s.via_hub <> plan_h_bridge_wanted(s.id))) THEN
    RAISE EXCEPTION '079 rollback proof: the bridges (or via_hub) are not exactly the national-side stops of the VS in v5';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.deleted_at IS NULL
              AND EXISTS (SELECT 1 FROM public.shipments s WHERE s.order_id = o.id AND s.deleted_at IS NULL)
              AND EXISTS (SELECT 1 FROM public.national_loads nl WHERE nl.source_order_id = o.id AND nl.source_type = 'Direct' AND nl.deleted_at IS NULL)) THEN
    RAISE EXCEPTION '079 rollback proof: an order has a bridge AND a live Direct national load';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '079 rollback proof: triggers % -> %, expected unchanged', v_trg0, v_trg1; END IF;
  RAISE NOTICE '079 ROLLBACK OK: cutover % -> %, VS out of v5 %, bridges withdrawn %, via_hub off %, NL back %, notices read %, triggers % (unchanged)',
    c_new, c_old, cardinality(v_orders), v_sh, v_via, v_nl, v_no, v_trg1;
END $do$;
