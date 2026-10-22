-- 071 ROLLBACK - everything 071 added goes, the four functions get their live text of 21/10 back BYTE FOR BYTE,
-- B-54 -9. Every number of today proven unchanged inside the block.
-- DRAFT - NOT EXECUTED. Only with an explicit yes, after 15:00. ORDER: 071b_plan_one_vehicle_rollback.sql FIRST if
-- 071b is in place (this block refuses otherwise: dropping start_at would silently drop the EXCLUDE constraints).
-- It REFUSES as soon as one v5 row exists (spec 2.2: after the first real v5 row there is no going back, only fixes
-- forward). ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "071 ROLLBACK OK ..." and ONE row "071 ROLLED BACK | 37 | 37".

DO $do$
DECLARE
  sg_old CONSTANT text := '  if new.status is not distinct from old.status then return new; end if;';
  sg_new CONSTANT text := '  if new.status is not distinct from old.status then return new; end if;' || E'\n'
    || '  if new.model = 2 then return new; end if; -- 071: a v5 cycle has no order links; its status is planned/cancelled only (CHECK rt_v2_status)';
  rc_old CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;';
  rc_new CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;' || E'\n'
    || '  if r.model = 2 then return; end if; -- 071: a v5 cycle is never cancelled or re-dated from order links (it has none)';
  ac_old CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;';
  ac_new CONSTANT text := '  if r.id is null or r.status = ''cancelled'' then return; end if;' || E'\n'
    || '  if r.model = 2 then return; end if; -- 071: a v5 cycle never closes by status; its end is read from its stops (v_rt_cycle)';
  ls_old CONSTANT text := '|| '' '' || lm.parent_order_id, sep ORDER BY lm.id)';
  ls_new CONSTANT text := '|| '' '' || coalesce(lm.parent_order_id::text, (SELECT r.code FROM rt_stops s JOIN ct_round_trips r ON r.id = s.rt_id WHERE s.id = lm.rt_stop_id)), sep ORDER BY lm.id) -- 071: a nat_loading has no order, it names its cycle';
  snap_rt_sql CONSTANT text := $q$
    SELECT md5(coalesce(string_agg(s.x, '|' ORDER BY s.id), '')) FROM (
      SELECT rt.id, jsonb_build_object(
        'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type, 'truck', rt.truck_id,
        'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id, 'date_start', rt.date_start,
        'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km, 'notes', rt.notes,
        'updated_at', rt.updated_at, 'revenue', rv.revenue, 'revenue_intl', rv.revenue_intl,
        'revenue_natl', rv.revenue_natl, 'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear,
        'dl_trip_value', c.dl_trip_value, 'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending,
        'pay_missing', c.driver_pay_missing, 'partner_planned', c.partner_planned,
        'partner_invoiced', c.partner_invoiced, 'pnl_cost_gross', p.cost_gross,
        'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat)::text AS x
      FROM public.ct_round_trips rt
      JOIN public.ct_v_rt_revenue rv ON rv.rt_id = rt.id
      JOIN public.ct_v_rt_costs c ON c.rt_id = rt.id
      LEFT JOIN public.ct_v_rt_pnl p ON p.id = rt.id) s $q$;
  snap_rows_sql CONSTANT text := $q$
    SELECT concat_ws(' ',
      (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM public.dl_entries e),
      (SELECT md5(coalesce(string_agg((to_jsonb(m) - 'rt_stop_id')::text, '|' ORDER BY m.id), '')) FROM public.local_moves m),
      (SELECT md5(coalesce(string_agg((to_jsonb(s) - 'via_hub')::text, '|' ORDER BY s.id), '')) FROM public.order_stops s),
      (SELECT md5(coalesce(string_agg((to_jsonb(l) - 'is_hub')::text, '|' ORDER BY l.id), '')) FROM public.locations l),
      (SELECT count(*) FROM public.dl_v_rt_route), (SELECT count(*) FROM public.dl_v_rt_gap),
      (SELECT count(*) FROM public.ct_v_rt_pnl)) $q$;
  v_fn record; v_src text; v_old text;
  v_trg0 int; v_trg1 int; v_k int;
  v_rt0 text; v_rt1 text; v_rows0 text; v_rows1 text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS: 071 is what is installed, untouched since, and holds no v5 row.
  IF to_regclass('public.shipments') IS NULL THEN
    RAISE EXCEPTION '071 rollback: 071 is not applied - nothing to undo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ct_round_trips'::regclass
              AND conname IN ('rt_v2_truck_once', 'rt_v2_driver_once')) THEN
    RAISE EXCEPTION '071 rollback: 071b is in place - run 071b_plan_one_vehicle_rollback.sql first';
  END IF;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices)
       + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2 OR partner_rate IS NOT NULL)
       + (SELECT count(*) FROM public.local_moves WHERE move_kind = 'nat_loading' OR rt_stop_id IS NOT NULL)
       + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL)
       + (SELECT count(*) FROM public.order_stops WHERE via_hub)
    INTO v_k;
  IF v_k <> 0 THEN
    RAISE EXCEPTION '071 rollback: % v5 row(s) exist - after the first real v5 row there is no rollback, only fixes forward (spec 2.2)', v_k;
  END IF;
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', 'd7757f99c3443ac167d5bdaf3e34b142'),
      ('public.rt_recompute(bigint)', '5fa0a08418147b22d2852db3b8c72c3e'),
      ('public.rt_auto_close(bigint)', 'eba2146ca4c521da6365edd28c4507af'),
      ('public.dl_local_day_sync(bigint,date)', '151dab06e2676f3c8885d7298d0ac6af')) v(sig, m) LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) IS DISTINCT FROM v_fn.m THEN
      RAISE EXCEPTION '071 rollback: % is not the 071 text (expected md5 %) - edited since, stop', v_fn.sig, v_fn.m;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '071 rollback: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', v_trg0;
  END IF;
  EXECUTE snap_rt_sql INTO v_rt0;
  EXECUTE snap_rows_sql INTO v_rows0;

  -- 1. The 9 triggers and the 7 functions.
  DROP TRIGGER plan_chk_local_loading ON public.local_moves;
  DROP TRIGGER plan_chk_bridge_stop ON public.order_stops;
  DROP TRIGGER plan_chk_shipments ON public.shipments;
  DROP TRIGGER plan_chk_pieces ON public.shipment_pieces;
  DROP TRIGGER plan_chk_legs ON public.piece_legs;
  DROP TRIGGER plan_chk_stops ON public.rt_stops;
  DROP TRIGGER plan_rt_window_sync ON public.rt_stops;
  DROP TRIGGER plan_chk_rt ON public.ct_round_trips;
  DROP TRIGGER ct_rt_legs_v2_guard ON public.ct_rt_legs;
  DROP FUNCTION public.plan_chk(), public.plan_rt_window_sync(), public.ct_rt_legs_v2_guard(),
    public.plan_shipment_problem(bigint), public.plan_leg_problem(bigint), public.plan_rt_problem(bigint),
    public.plan_local_loading_problem(bigint);

  -- 2. The views.
  DROP VIEW public.v_vs_state, public.v_national_order_state, public.v_hub_bucket, public.v_rt_cycle,
    public.v_rt_stop_state, public.v_piece_state, public.v_piece_pos, public.v_shipments;

  -- 3. The four functions back: the swap the other way, proven = the live text of 21/10.
  FOR v_fn IN SELECT * FROM (VALUES
      ('public.rt_status_guard()', sg_old, sg_new, 'f632fea1d6a5dd2cee7c80f4db9e27f2'),
      ('public.rt_recompute(bigint)', rc_old, rc_new, '3f85092f030b2ad92a3002ab0a9cc98d'),
      ('public.rt_auto_close(bigint)', ac_old, ac_new, '88b41f860aaf7f925183ab84dc10c2dd'),
      ('public.dl_local_day_sync(bigint,date)', ls_old, ls_new, 'a4a62603e5b0c4ad48124fea625aa611')) v(sig, a, b, m) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig);
    v_old := replace(v_src, v_fn.b, v_fn.a);
    IF md5(v_old) <> v_fn.m THEN
      RAISE EXCEPTION '071 rollback: the restored text of % is not the one of 21/10 (md5 %) - stop', v_fn.sig, md5(v_old);
    END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      split_part(v_fn.sig, '(', 1), pg_get_function_arguments(to_regprocedure(v_fn.sig)),
      pg_get_function_result(to_regprocedure(v_fn.sig)), v_old);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_fn.sig)) <> v_fn.m THEN
      RAISE EXCEPTION '071 rollback proof: % does not hold the 21/10 text', v_fn.sig;
    END IF;
  END LOOP;

  -- 4. local_moves back to the 060 CHECKs (the same deparsed text as read 21/10, proven below).
  DROP INDEX public.local_moves_nat_loading_once;
  ALTER TABLE public.local_moves
    DROP CONSTRAINT local_moves_nat_loading,
    DROP CONSTRAINT local_moves_kind_chk,
    DROP CONSTRAINT local_moves_kind_parent,
    DROP CONSTRAINT local_moves_relay_trailer,
    ADD CONSTRAINT local_moves_kind_chk CHECK (move_kind = ANY (ARRAY['local'::text, 'relay_delivery'::text, 'relay_loading'::text])),
    ADD CONSTRAINT local_moves_kind_parent CHECK (((move_kind = 'local'::text) AND (parent_order_id IS NULL))
      OR ((move_kind <> 'local'::text) AND (parent_order_id IS NOT NULL) AND (parent_nat_load_id IS NULL))),
    ADD CONSTRAINT local_moves_relay_trailer CHECK ((move_kind = 'local'::text) OR (driver_id IS NULL) OR (trailer_id IS NOT NULL));
  ALTER TABLE public.local_moves DROP COLUMN rt_stop_id;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_chk')
       IS DISTINCT FROM 'CHECK ((move_kind = ANY (ARRAY[''local''::text, ''relay_delivery''::text, ''relay_loading''::text])))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_kind_parent')
       IS DISTINCT FROM 'CHECK ((((move_kind = ''local''::text) AND (parent_order_id IS NULL)) OR ((move_kind <> ''local''::text) AND (parent_order_id IS NOT NULL) AND (parent_nat_load_id IS NULL))))'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'public.local_moves'::regclass AND conname = 'local_moves_relay_trailer')
       IS DISTINCT FROM 'CHECK (((move_kind = ''local''::text) OR (driver_id IS NULL) OR (trailer_id IS NOT NULL)))' THEN
    RAISE EXCEPTION '071 rollback proof: a local_moves CHECK is not the 060 text of 21/10';
  END IF;

  -- 5. Pallets, the tables, the columns.
  ALTER TABLE public.pl_movements DROP COLUMN piece_leg_id;
  DROP TABLE public.plan_notices, public.piece_legs, public.rt_stops, public.shipment_pieces, public.shipments;
  ALTER TABLE public.order_stops DROP CONSTRAINT order_stops_via_hub_intl, DROP COLUMN via_hub;
  DROP INDEX public.locations_one_hub;
  ALTER TABLE public.locations DROP COLUMN is_hub;
  ALTER TABLE public.ct_round_trips
    DROP CONSTRAINT rt_model, DROP CONSTRAINT rt_v2_scope, DROP CONSTRAINT rt_v2_status, DROP CONSTRAINT rt_v2_window,
    DROP CONSTRAINT rt_v1_no_window, DROP CONSTRAINT rt_v2_dates, DROP CONSTRAINT rt_partner_rate,
    DROP COLUMN model, DROP COLUMN start_at, DROP COLUMN end_at, DROP COLUMN partner_rate;

  -- 6. PROOFS + B-54 -9.
  EXECUTE snap_rt_sql INTO v_rt1;
  EXECUTE snap_rows_sql INTO v_rows1;
  IF v_rt1 <> v_rt0 OR v_rows1 <> v_rows0 THEN
    RAISE EXCEPTION '071 rollback proof: a number of today changed (round trips % -> %, rows % -> %)', v_rt0, v_rt1, v_rows0, v_rows1;
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 - 9 THEN
    RAISE EXCEPTION '071 rollback proof: trigger count % -> % (expected -9)', v_trg0, v_trg1;
  END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '071 rollback: B-54 not updated (% rows)', v_k; END IF;

  RAISE NOTICE '071 ROLLBACK OK: every 071 object removed, the four functions are the 21/10 texts again; triggers % -> %, B-54 = %',
    v_trg0, v_trg1, v_trg1;
END $do$;

SELECT CASE WHEN to_regclass('public.shipments') IS NULL
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rt_recompute(bigint)'::regprocedure) = '3f85092f030b2ad92a3002ab0a9cc98d'
            THEN '071 ROLLED BACK' ELSE '071 STILL IN PLACE' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
